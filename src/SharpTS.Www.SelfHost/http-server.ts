import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { parseRunRequest } from './execution-contract';
import type { ServerConfig } from './config';
import {
    clientIdentity,
    legacyGuideRedirect,
    normalizeRequestPath,
    originAllowed,
    staticFilePath
} from './http-policy';
import { presets } from './presets';
import { RateLimiter } from './rate-limiter';
import type { ExecutionHandle, Supervisor } from './supervisor-runtime';

type LogField = string | number | boolean | null;
type TimerHandle = ReturnType<typeof setTimeout>;

interface DataChunk {
    length: number;
    toString(): string;
}

interface FileStat {
    size: number;
    mtimeMs: number;
    mtime: Date;
    isFile(): boolean;
}

interface HttpRequest {
    headers: { [name: string]: unknown };
    method?: string;
    url?: string;
    socket: { remoteAddress?: string };
    destroy(): void;
    on(event: 'data', listener: (chunk: DataChunk) => void): void;
    on(event: string, listener: () => void): void;
}

interface HttpResponse {
    statusCode: number;
    headersSent: boolean;
    setHeader(name: string, value: string): void;
    end(body?: unknown): void;
    probeConnection(): boolean;
}

interface HttpServer {
    address(): { address: string; port: number };
    close(completed: () => void): void;
    closeAllConnections(): void;
    listen(port: number, host: string, listening: () => void): void;
}

function fileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
}

function isFingerprintedFile(filePath: string): boolean {
    return /-[0-9A-Z]{8,}\./i.test(path.basename(filePath));
}

function fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
}

function fileStat(filePath: string): FileStat {
    return fs.statSync(filePath);
}

function readFile(filePath: string): unknown {
    return fs.readFileSync(filePath);
}

export interface HttpServerApplication {
    server: HttpServer;
    beginShutdown(signal: string): void;
}

export interface HttpServerDependencies {
    createServer?: (handler: (request: unknown, response: unknown) => void) => HttpServer;
    log?: (message: string) => void;
}

export function createHttpServer(config: ServerConfig, supervisor: Supervisor,
    dependencies: HttpServerDependencies = {}): HttpServerApplication {
const createServer = dependencies.createServer ||
    ((handler: (request: unknown, response: unknown) => void) => http.createServer(handler as any) as HttpServer);
const log = dependencies.log || ((message: string): void => console.log(message));
const maxBodyBytes = config.maximumBodyBytes;
const requestBodyTimeoutMs = config.requestBodyTimeoutMs;
const executionProbeIntervalMs = config.executionProbeIntervalMs;
const shutdownCutoffMs = config.shutdownCutoffMs;
const publicOrigin = config.publicOrigin;
const contentRoot = config.contentRoot;
const executionRateLimiter = new RateLimiter({
    maximumIdentities: config.maximumRateLimitIdentities,
    requestsPerWindow: config.executionRequestsPerMinute,
    windowMs: 60_000
});

const mimeTypes: { [extension: string]: string } = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ps1': 'text/plain; charset=utf-8',
    '.sh': 'text/x-shellscript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

let shuttingDown = false;
let requestSequence = 0;
const requestClients: { [requestId: string]: string } = {};

function setSecurityHeaders(response: HttpResponse, requestId: string): void {
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy',
        "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'");
}

function logRequest(requestId: string, method: string, normalizedPath: string,
    status: number, startedAt: number, extra?: { [key: string]: LogField }): void {
    const entry: { [key: string]: LogField } = {
        event: 'http_request',
        requestId,
        client: requestClients[requestId] || 'unknown',
        method,
        path: normalizedPath,
        status,
        elapsedMs: Date.now() - startedAt
    };
    if (extra) {
        for (const key of Object.keys(extra))
            entry[key] = extra[key];
    }
    log(JSON.stringify(entry));
    delete requestClients[requestId];
}

function allowExecution(client: string): boolean {
    return executionRateLimiter.allow(client);
}

function send(response: HttpResponse, requestId: string, method: string, normalizedPath: string,
    startedAt: number, status: number, contentType: string, body: unknown,
    extra?: { [key: string]: LogField }): void {
    response.statusCode = status;
    response.setHeader('Content-Type', contentType);
    response.end(body);
    logRequest(requestId, method, normalizedPath, status, startedAt, extra);
}

function sendJson(response: HttpResponse, requestId: string, method: string, normalizedPath: string,
    startedAt: number, status: number, value: unknown, extra?: { [key: string]: LogField }): void {
    send(response, requestId, method, normalizedPath, startedAt, status,
        'application/json; charset=utf-8', JSON.stringify(value), extra);
}

function serveStatic(requestValue: unknown, response: HttpResponse, requestId: string,
    method: string, normalizedPath: string, startedAt: number): boolean {
    const request = requestValue as HttpRequest;
    if (method !== 'GET' && method !== 'HEAD')
        return false;

    const filePath = staticFilePath(contentRoot, normalizedPath);
    if (!filePath)
        return false;

    try {
        const extension = fileExtension(filePath);
        const acceptedEncodings = String(request.headers['accept-encoding'] || '').toLowerCase();
        let servedFilePath = filePath;
        let contentEncoding = '';
        if ((extension === '.js' || extension === '.css') &&
            acceptedEncodings.indexOf('br') >= 0 && fileExists(filePath + '.br')) {
            servedFilePath = filePath + '.br';
            contentEncoding = 'br';
        } else if ((extension === '.js' || extension === '.css') &&
            acceptedEncodings.indexOf('gzip') >= 0 && fileExists(filePath + '.gz')) {
            servedFilePath = filePath + '.gz';
            contentEncoding = 'gzip';
        }

        const stat = fileStat(servedFilePath);
        if (!stat.isFile())
            return false;

        const contentType = mimeTypes[extension] || 'application/octet-stream';
        const etag = 'W/"' + stat.size + '-' + Math.floor(stat.mtimeMs) + '"';
        response.setHeader('Content-Type', contentType);
        response.setHeader('ETag', etag);
        response.setHeader('Last-Modified', stat.mtime.toUTCString());
        if (contentEncoding) {
            response.setHeader('Content-Encoding', contentEncoding);
            response.setHeader('Vary', 'Accept-Encoding');
        }
        const fingerprinted = isFingerprintedFile(filePath);
        const requiresRevalidation = extension === '.html' || extension === '.sh' || extension === '.ps1' ||
            ((!fingerprinted) && (extension === '.css' || extension === '.js'));
        response.setHeader('Cache-Control', fingerprinted
            ? 'public, max-age=31536000, immutable'
            : (requiresRevalidation
                ? 'public, max-age=0, must-revalidate'
                : 'public, max-age=3600'));

        if (request.headers['if-none-match'] === etag) {
            response.statusCode = 304;
            response.end();
            logRequest(requestId, method, normalizedPath, 304, startedAt);
            return true;
        }

        const bytes: any = readFile(servedFilePath);
        response.statusCode = 200;
        response.setHeader('Content-Length', String(bytes.length));
        response.end(method === 'HEAD' ? undefined : bytes);
        logRequest(requestId, method, normalizedPath, 200, startedAt,
            { bytes: bytes.length });
        return true;
    } catch (error) {
        log(JSON.stringify({ event: 'static_file_error', path: normalizedPath,
            message: error instanceof Error ? error.message : String(error) }));
        return false;
    }
}

function readJsonBody(requestValue: unknown, response: HttpResponse, requestId: string,
    method: string, normalizedPath: string, startedAt: number,
    completed: (value: unknown) => void): void {
    const request = requestValue as HttpRequest;
    const contentType = String(request.headers['content-type'] || '').toLowerCase();
    if (!contentType.startsWith('application/json')) {
        sendJson(response, requestId, method, normalizedPath, startedAt, 415,
            { error: 'Content-Type must be application/json.' });
        return;
    }

    const declaredLength = Number(request.headers['content-length'] || '0');
    if (declaredLength > maxBodyBytes) {
        sendJson(response, requestId, method, normalizedPath, startedAt, 413,
            { error: 'Request body is too large.' });
        request.destroy();
        return;
    }

    let body = '';
    let receivedBytes = 0;
    let settled = false;
    // SharpTS's timer declaration requires a localized Node callback adapter cast.
    const timeout = setTimeout((() => {
        if (settled) return;
        settled = true;
        sendJson(response, requestId, method, normalizedPath, startedAt, 408,
            { error: 'Request body timed out.' });
        request.destroy();
    }) as any, requestBodyTimeoutMs);

    request.on('aborted', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        logRequest(requestId, method, normalizedPath, 499, startedAt,
            { eventDetail: 'request_body_aborted' });
    });
    request.on('data', (chunk: DataChunk) => {
        if (settled) return;
        receivedBytes += chunk.length;
        if (receivedBytes > maxBodyBytes) {
            settled = true;
            clearTimeout(timeout);
            sendJson(response, requestId, method, normalizedPath, startedAt, 413,
                { error: 'Request body is too large.' });
            request.destroy();
            return;
        }
        body += chunk.toString();
    });
    request.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
            completed(JSON.parse(body || '{}'));
        } catch {
            sendJson(response, requestId, method, normalizedPath, startedAt, 400,
                { error: 'Malformed JSON body.' });
        }
    });
}

// The SharpTS http module is untyped; raw values are narrowed immediately below.
const server: HttpServer = createServer(((rawRequest: any, rawResponse: any): void => {
    const request = rawRequest as HttpRequest;
    const response = rawResponse as HttpResponse;
    const startedAt = Date.now();
    const requestId = Date.now().toString(36) + '-' + (++requestSequence).toString(36);
    const client = clientIdentity(String(request.socket.remoteAddress || 'unknown'),
        request.headers, config);
    requestClients[requestId] = client;
    const method = String(request.method || 'GET').toUpperCase();
    const normalizedPath = normalizeRequestPath(String(request.url || '/'));
    setSecurityHeaders(response, requestId);

    if (!normalizedPath) {
        sendJson(response, requestId, method, '<invalid>', startedAt, 400,
            { error: 'Invalid request path.' });
        return;
    }

    const redirect = legacyGuideRedirect(normalizedPath);
    if ((method === 'GET' || method === 'HEAD') && redirect) {
        response.statusCode = 308;
        response.setHeader('Location', redirect);
        response.end();
        logRequest(requestId, method, normalizedPath, 308, startedAt);
        return;
    }

    if (normalizedPath === '/alive') {
        sendJson(response, requestId, method, normalizedPath, startedAt, 200,
            { status: 'alive' });
        return;
    }

    if (normalizedPath === '/health') {
        const ready = !shuttingDown && supervisor.isReady();
        const status = ready ? 200 : 503;
        sendJson(response, requestId, method, normalizedPath, startedAt, status,
            { status: shuttingDown ? 'draining' : (ready ? 'healthy' : 'worker-unavailable') });
        return;
    }

    if (shuttingDown) {
        response.setHeader('Connection', 'close');
        sendJson(response, requestId, method, normalizedPath, startedAt, 503,
            { error: 'Server is shutting down.' });
        return;
    }

    if (method === 'GET' && normalizedPath === '/api/presets') {
        sendJson(response, requestId, method, normalizedPath, startedAt, 200, presets);
        return;
    }

    if (method === 'POST' && normalizedPath === '/api/run') {
        if (!originAllowed(request.headers, publicOrigin)) {
            sendJson(response, requestId, method, normalizedPath, startedAt, 403,
                { error: 'Cross-origin execution requests are not allowed.' });
            return;
        }
        if (!allowExecution(client)) {
            response.setHeader('Retry-After', '60');
            sendJson(response, requestId, method, normalizedPath, startedAt, 429,
                { error: 'Execution rate limit exceeded.' });
            return;
        }

        readJsonBody(request, response, requestId, method, normalizedPath, startedAt,
            (value: unknown): void => {
                const runRequest = parseRunRequest(value);
                let disconnected = false;
                let probeTimer: TimerHandle | undefined;
                let executionHandle: ExecutionHandle | null = null;

                const executionStarted = (): void => {
                    response.statusCode = 200;
                    response.setHeader('Content-Type', 'application/json; charset=utf-8');
                    // SharpTS's timer declaration requires a localized Node callback adapter cast.
                    probeTimer = setInterval((() => {
                        if (disconnected) return;
                        if (response.probeConnection() === false) {
                            disconnected = true;
                            clearInterval(probeTimer);
                            if (executionHandle)
                                executionHandle.cancel();
                            response.end();
                            logRequest(requestId, method, normalizedPath, 499, startedAt,
                                { eventDetail: 'client_disconnected' });
                        }
                    }) as any, executionProbeIntervalMs);
                };

                executionHandle = supervisor.execute(runRequest, requestId, executionStarted, result => {
                    if (probeTimer !== undefined)
                        clearInterval(probeTimer);
                    if (disconnected)
                        return;
                    if (response.headersSent) {
                        response.end(JSON.stringify(result.body));
                        logRequest(requestId, method, normalizedPath, result.status, startedAt);
                    } else {
                        sendJson(response, requestId, method, normalizedPath,
                            startedAt, result.status, result.body);
                    }
                });
            });
        return;
    }

    if (serveStatic(request, response, requestId, method, normalizedPath, startedAt))
        return;

    sendJson(response, requestId, method, normalizedPath, startedAt, 404,
        { error: 'Not found.' });
}) as any);

function beginShutdown(signal: string): void {
    if (shuttingDown) return;
    shuttingDown = true;
    supervisor.beginShutdown();
    log(JSON.stringify({ event: 'shutdown_started', signal }));

    // SharpTS's timer declaration requires a localized Node callback adapter cast.
    const cutoff = setTimeout((() => {
        log(JSON.stringify({ event: 'shutdown_forced' }));
        supervisor.killAllWorkers();
        server.closeAllConnections();
    }) as any, shutdownCutoffMs);

    server.close(() => {
        clearTimeout(cutoff);
        log(JSON.stringify({ event: 'shutdown_complete' }));
    });
}

return { server, beginShutdown };
}
