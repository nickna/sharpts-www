import * as path from 'path';
import { canTrustProxyHeaders } from './config';
import type { ServerConfig } from './config';

export interface RequestHeaders {
    [name: string]: unknown;
}

export function clientIdentity(remoteAddress: string, headers: RequestHeaders,
    config: ServerConfig): string {
    const remote = remoteAddress || 'unknown';
    if (!canTrustProxyHeaders(remote, config))
        return remote;

    const forwarded = String(headers['x-real-ip'] || '').trim();
    if (!forwarded || forwarded.length > 64 || !/^[0-9a-fA-F:.]+$/.test(forwarded))
        return remote;
    return forwarded;
}

export function originAllowed(headers: RequestHeaders, publicOrigin: string): boolean {
    const origin = String(headers['origin'] || '').replace(/\/$/, '').toLowerCase();
    if (!origin)
        return true;
    if (publicOrigin)
        return origin === publicOrigin;

    const requestHost = String(headers['host'] || '').toLowerCase();
    return origin === 'https://' + requestHost || origin === 'http://' + requestHost;
}

export function normalizeRequestPath(rawUrl: string): string | null {
    const queryIndex = rawUrl.indexOf('?');
    const rawPath = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
    const normalized = rawPath || '/';
    // Reject encoded and backslash paths until a fully parity-tested URL helper
    // performs decoding exactly once.
    if (normalized.indexOf('%') >= 0 || normalized.indexOf('\\') >= 0)
        return null;
    return normalized.startsWith('/') ? normalized : '/' + normalized;
}

export function staticFilePath(contentRoot: string, normalizedPath: string): string | null {
    let relativePath = normalizedPath === '/' ? 'index.html' : normalizedPath.slice(1);
    if (relativePath.endsWith('/'))
        relativePath += 'index.html';
    else if (path.extname(relativePath) === '')
        relativePath = path.join(relativePath, 'index.html');

    const candidate = path.resolve(contentRoot, relativePath);
    const prefix = contentRoot.endsWith(path.sep) ? contentRoot : contentRoot + path.sep;
    if (candidate !== contentRoot && !candidate.startsWith(prefix))
        return null;
    return candidate;
}
