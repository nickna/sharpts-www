import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { presets } from './presets';
import {
    beginSupervisorShutdown,
    execute,
    isSupervisorReady,
    killAllWorkers
} from './supervisor';

const maxBodyBytes = 64 * 1024;
const requestBodyTimeoutMs = 15_000;
const executionProbeIntervalMs = 500;
const maxRateLimitIdentities = 4096;
const shutdownCutoffMs = 8_000;
const port = Number(process.env.PORT || '8080');
const host = process.env.SHARPTS_WWW_HOST || '0.0.0.0';
const publicOrigin = String(process.env.SHARPTS_WWW_PUBLIC_ORIGIN || '').replace(/\/$/, '');
const trustRailwayProxy = process.env.SHARPTS_WWW_TRUST_RAILWAY_PROXY === 'true';
const contentRoot = path.resolve(process.env.SHARPTS_WWW_CONTENT_ROOT || path.join(process.cwd(), 'public'));
const contentRootPrefix = contentRoot.endsWith(path.sep) ? contentRoot : contentRoot + path.sep;

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
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

let shuttingDown = false;
let requestSequence = 0;
const requestClients: { [requestId: string]: string } = {};
const rateLimitEntries: { [client: string]: number[] } = {};
const rateLimitLastSeen: { [client: string]: number } = {};

function setSecurityHeaders(response: any, requestId: string): void {
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy',
        "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'");
}

function logRequest(requestId: string, method: string, normalizedPath: string,
    status: number, startedAt: number, extra?: { [key: string]: any }): void {
    const entry: { [key: string]: any } = {
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
    console.log(JSON.stringify(entry));
    delete requestClients[requestId];
}

function clientIdentity(request: any): string {
    const remote = String(request.socket.remoteAddress || 'unknown');
    if (!trustRailwayProxy)
        return remote;

    const forwarded = String(request.headers['x-real-ip'] || '').trim();
    if (!forwarded || forwarded.length > 64 || !/^[0-9a-fA-F:.]+$/.test(forwarded))
        return remote;
    return forwarded;
}

function originAllowed(request: any): boolean {
    const origin = String(request.headers.origin || '').replace(/\/$/, '');
    if (!origin)
        return true;
    if (publicOrigin)
        return origin === publicOrigin;

    const requestHost = String(request.headers.host || '').toLowerCase();
    const normalizedOrigin = origin.toLowerCase();
    return normalizedOrigin === 'https://' + requestHost ||
        normalizedOrigin === 'http://' + requestHost;
}

function allowExecution(client: string): boolean {
    const now = Date.now();
    const cutoff = now - 60_000;

    if (rateLimitEntries[client] === undefined &&
        Object.keys(rateLimitEntries).length >= maxRateLimitIdentities) {
        let oldestClient = '';
        let oldestTimestamp = 9_007_199_254_740_991;
        for (const candidate of Object.keys(rateLimitLastSeen)) {
            if (rateLimitLastSeen[candidate] < oldestTimestamp) {
                oldestTimestamp = rateLimitLastSeen[candidate];
                oldestClient = candidate;
            }
        }
        if (oldestClient) {
            delete rateLimitEntries[oldestClient];
            delete rateLimitLastSeen[oldestClient];
        }
    }

    const recent = (rateLimitEntries[client] || []).filter(timestamp => timestamp > cutoff);
    rateLimitLastSeen[client] = now;
    if (recent.length >= 10) {
        rateLimitEntries[client] = recent;
        return false;
    }
    recent.push(now);
    rateLimitEntries[client] = recent;
    return true;
}

function send(response: any, requestId: string, method: string, normalizedPath: string,
    startedAt: number, status: number, contentType: string, body: any,
    extra?: { [key: string]: any }): void {
    response.statusCode = status;
    response.setHeader('Content-Type', contentType);
    response.end(body);
    logRequest(requestId, method, normalizedPath, status, startedAt, extra);
}

function sendJson(response: any, requestId: string, method: string, normalizedPath: string,
    startedAt: number, status: number, value: any, extra?: { [key: string]: any }): void {
    send(response, requestId, method, normalizedPath, startedAt, status,
        'application/json; charset=utf-8', JSON.stringify(value), extra);
}

function normalizePath(rawUrl: string): string | null {
    const queryIndex = rawUrl.indexOf('?');
    const rawPath = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
    const normalized = rawPath || '/';
    // Until percent decoding is performed by a fully parity-tested URL helper,
    // reject encoded paths instead of risking double-decoding traversal bugs.
    if (normalized.indexOf('%') >= 0 || normalized.indexOf('\\') >= 0)
        return null;
    return normalized.startsWith('/') ? normalized : '/' + normalized;
}

function staticFileFor(normalizedPath: string): string | null {
    let relativePath = normalizedPath === '/' ? 'index.html' : normalizedPath.slice(1);
    if (relativePath.endsWith('/'))
        relativePath += 'index.html';
    else if (path.extname(relativePath) === '')
        relativePath = path.join(relativePath, 'index.html');

    const candidate = path.resolve(contentRoot, relativePath);
    if (candidate !== contentRoot && !candidate.startsWith(contentRootPrefix))
        return null;
    return candidate;
}

function serveStatic(request: any, response: any, requestId: string,
    method: string, normalizedPath: string, startedAt: number): boolean {
    if (method !== 'GET' && method !== 'HEAD')
        return false;

    const filePath = staticFileFor(normalizedPath);
    if (!filePath)
        return false;

    try {
        const stat: any = fs.statSync(filePath);
        if (!stat.isFile())
            return false;

        const extension = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[extension] || 'application/octet-stream';
        const etag = 'W/"' + stat.size + '-' + Math.floor(stat.mtimeMs) + '"';
        response.setHeader('Content-Type', contentType);
        response.setHeader('ETag', etag);
        response.setHeader('Last-Modified', stat.mtime.toUTCString());
        // Generated HTML, CSS, and JavaScript use stable URLs. Revalidate them
        // so a deployment cannot leave clients running an older controller;
        // fingerprinted fonts and media can retain the short freshness window.
        const requiresRevalidation = extension === '.html' ||
            extension === '.css' || extension === '.js';
        response.setHeader('Cache-Control', requiresRevalidation
            ? 'public, max-age=0, must-revalidate'
            : 'public, max-age=3600');

        if (request.headers['if-none-match'] === etag) {
            response.statusCode = 304;
            response.end();
            logRequest(requestId, method, normalizedPath, 304, startedAt);
            return true;
        }

        const bytes = fs.readFileSync(filePath);
        response.statusCode = 200;
        response.setHeader('Content-Length', String(bytes.length));
        response.end(method === 'HEAD' ? undefined : bytes);
        logRequest(requestId, method, normalizedPath, 200, startedAt,
            { bytes: bytes.length });
        return true;
    } catch {
        return false;
    }
}

function readJsonBody(request: any, response: any, requestId: string,
    method: string, normalizedPath: string, startedAt: number,
    completed: (value: any) => void): void {
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
    const timeout = setTimeout((() => {
        if (settled) return;
        settled = true;
        sendJson(response, requestId, method, normalizedPath, startedAt, 408,
            { error: 'Request body timed out.' });
        request.destroy();
    }) as any, requestBodyTimeoutMs);

    request.on('aborted', () => {
        settled = true;
        clearTimeout(timeout);
    });
    request.on('data', (chunk: any) => {
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

const server: any = http.createServer((request: any, response: any) => {
    const startedAt = Date.now();
    const requestId = Date.now().toString(36) + '-' + (++requestSequence).toString(36);
    const client = clientIdentity(request);
    requestClients[requestId] = client;
    const method = String(request.method || 'GET').toUpperCase();
    const normalizedPath = normalizePath(String(request.url || '/'));
    setSecurityHeaders(response, requestId);

    if (!normalizedPath) {
        sendJson(response, requestId, method, '<invalid>', startedAt, 400,
            { error: 'Invalid request path.' });
        return;
    }

    if (normalizedPath === '/alive') {
        sendJson(response, requestId, method, normalizedPath, startedAt, 200,
            { status: 'alive' });
        return;
    }

    if (normalizedPath === '/health') {
        const ready = !shuttingDown && isSupervisorReady();
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

    if (method === 'POST' && normalizedPath === '/api/echo') {
        readJsonBody(request, response, requestId, method, normalizedPath, startedAt,
            value => sendJson(response, requestId, method, normalizedPath, startedAt, 200,
                { value }));
        return;
    }

    if (method === 'GET' && normalizedPath === '/api/presets') {
        sendJson(response, requestId, method, normalizedPath, startedAt, 200, presets);
        return;
    }

    if (method === 'POST' && normalizedPath === '/api/run') {
        if (!originAllowed(request)) {
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
            value => {
                let disconnected = false;
                let probeTimer: any = undefined;
                let executionHandle: any = undefined;

                const executionStarted = (): void => {
                    response.statusCode = 200;
                    response.setHeader('Content-Type', 'application/json; charset=utf-8');
                    probeTimer = setInterval((() => {
                        if (disconnected) return;
                        if (response.probeConnection() === false) {
                            disconnected = true;
                            clearInterval(probeTimer);
                            executionHandle.cancel();
                            response.end();
                            logRequest(requestId, method, normalizedPath, 499, startedAt,
                                { eventDetail: 'client_disconnected' });
                        }
                    }) as any, executionProbeIntervalMs);
                };

                executionHandle = execute({
                source: String(value.source || ''),
                timeoutMs: Number(value.timeoutMs || 5000),
                mode: String(value.mode || 'interpret')
                }, requestId, executionStarted, result => {
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
});

function beginShutdown(signal: string): void {
    if (shuttingDown) return;
    shuttingDown = true;
    beginSupervisorShutdown();
    console.log(JSON.stringify({ event: 'shutdown_started', signal }));

    const cutoff = setTimeout((() => {
        console.log(JSON.stringify({ event: 'shutdown_forced' }));
        killAllWorkers();
        server.closeAllConnections();
    }) as any, shutdownCutoffMs);

    server.close(() => {
        clearTimeout(cutoff);
        console.log(JSON.stringify({ event: 'shutdown_complete' }));
    });
}

process.on('SIGTERM', () => beginShutdown('SIGTERM'));
process.on('SIGINT', () => beginShutdown('SIGINT'));

server.listen(port, host, () => {
    const address = server.address();
    console.log(JSON.stringify({
        event: 'server_listening',
        address: address.address,
        port: address.port,
        contentRoot
    }));
});
