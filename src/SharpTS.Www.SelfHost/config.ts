import * as path from 'path';

export interface EnvironmentValues {
    /** SharpTS's process.env adapter returns null for missing values at runtime. */
    [name: string]: string | null | undefined;
}

export interface ServerConfig {
    port: number;
    host: string;
    publicOrigin: string;
    contentRoot: string;
    trustPrivateProxy: boolean;
    trustedProxyAddresses: string[];
    maximumBodyBytes: number;
    requestBodyTimeoutMs: number;
    executionProbeIntervalMs: number;
    maximumRateLimitIdentities: number;
    executionRequestsPerMinute: number;
    shutdownCutoffMs: number;
}

export interface SupervisorConfig {
    workerPath: string;
    requireRssMonitoring: boolean;
    maximumSourceBytes: number;
    maximumWorkerRssBytes: number;
    maximumWorkerOutputBytes: number;
    memoryPollIntervalMs: number;
    workerTimeoutBufferMs: number;
    maximumConcurrentWorkers: number;
    maximumQueuedExecutions: number;
    concurrencyWaitMs: number;
}

function readBoolean(environment: EnvironmentValues, name: string, fallback: boolean): boolean {
    const value = environment[name];
    if (value === undefined || value === null || value === '')
        return fallback;
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    throw new Error(name + " must be 'true' or 'false'.");
}

function readInteger(environment: EnvironmentValues, name: string, fallback: number,
    minimum: number, maximum: number): number {
    const value = environment[name];
    if (value === undefined || value === null || value === '')
        return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum)
        throw new Error(name + ' must be an integer from ' + minimum + ' to ' + maximum + '.');
    return parsed;
}

function readOrigin(environment: EnvironmentValues): string {
    const value = String(environment['SHARPTS_WWW_PUBLIC_ORIGIN'] || '').trim().replace(/\/+$/, '');
    if (!value)
        return '';
    if (!/^https?:\/\/[^/?#\s]+$/i.test(value))
        throw new Error('SHARPTS_WWW_PUBLIC_ORIGIN must be an HTTP(S) origin without a path.');
    return value.toLowerCase();
}

function readAddressList(environment: EnvironmentValues, name: string): string[] {
    const raw = String(environment[name] || '');
    const addresses: string[] = [];
    for (const part of raw.split(',')) {
        const address = part.trim().toLowerCase();
        if (address && addresses.indexOf(address) < 0)
            addresses.push(address);
    }
    return addresses;
}

export function loadServerConfig(environment: EnvironmentValues = process.env,
    workingDirectory: string = process.cwd()): ServerConfig {
    const host = String(environment['SHARPTS_WWW_HOST'] || '0.0.0.0').trim();
    if (!host)
        throw new Error('SHARPTS_WWW_HOST cannot be empty.');

    return {
        port: readInteger(environment, 'PORT', 8080, 1, 65_535),
        host,
        publicOrigin: readOrigin(environment),
        contentRoot: path.resolve(environment['SHARPTS_WWW_CONTENT_ROOT'] ||
            path.join(workingDirectory, 'public')),
        trustPrivateProxy: readBoolean(environment, 'SHARPTS_WWW_TRUST_RAILWAY_PROXY', false),
        trustedProxyAddresses: readAddressList(environment, 'SHARPTS_WWW_TRUSTED_PROXY_ADDRESSES'),
        maximumBodyBytes: readInteger(environment, 'SHARPTS_WWW_MAX_BODY_BYTES', 64 * 1024, 1024, 1024 * 1024),
        requestBodyTimeoutMs: readInteger(environment, 'SHARPTS_WWW_BODY_TIMEOUT_MS', 15_000, 1000, 60_000),
        executionProbeIntervalMs: readInteger(environment, 'SHARPTS_WWW_PROBE_INTERVAL_MS', 500, 100, 5000),
        maximumRateLimitIdentities: readInteger(environment, 'SHARPTS_WWW_MAX_RATE_IDENTITIES', 4096, 16, 100_000),
        executionRequestsPerMinute: readInteger(environment, 'SHARPTS_WWW_EXECUTIONS_PER_MINUTE', 10, 1, 1000),
        shutdownCutoffMs: readInteger(environment, 'SHARPTS_WWW_SHUTDOWN_CUTOFF_MS', 8000, 1000, 60_000)
    };
}

export function loadSupervisorConfig(environment: EnvironmentValues = process.env,
    workingDirectory: string = process.cwd()): SupervisorConfig {
    return {
        workerPath: path.resolve(environment['SHARPTS_WWW_WORKER_PATH'] ||
            path.join(workingDirectory, 'worker', process.platform === 'win32'
                ? 'SharpTS.Www.Worker.exe'
                : 'SharpTS.Www.Worker')),
        requireRssMonitoring: readBoolean(environment, 'SHARPTS_WWW_REQUIRE_RSS_MONITORING', true),
        maximumSourceBytes: readInteger(environment, 'SHARPTS_WWW_MAX_SOURCE_BYTES', 10 * 1024, 1024, 1024 * 1024),
        maximumWorkerRssBytes: readInteger(environment, 'SHARPTS_WWW_MAX_WORKER_RSS_BYTES', 150 * 1024 * 1024, 16 * 1024 * 1024, 2_147_483_647),
        maximumWorkerOutputBytes: readInteger(environment, 'SHARPTS_WWW_MAX_WORKER_OUTPUT_BYTES', 256 * 1024, 1024, 16 * 1024 * 1024),
        memoryPollIntervalMs: readInteger(environment, 'SHARPTS_WWW_MEMORY_POLL_MS', 500, 50, 5000),
        workerTimeoutBufferMs: readInteger(environment, 'SHARPTS_WWW_WORKER_TIMEOUT_BUFFER_MS', 1000, 0, 10_000),
        maximumConcurrentWorkers: readInteger(environment, 'SHARPTS_WWW_MAX_CONCURRENT_WORKERS', 3, 1, 128),
        maximumQueuedExecutions: readInteger(environment, 'SHARPTS_WWW_MAX_QUEUED_EXECUTIONS', 24, 0, 10_000),
        concurrencyWaitMs: readInteger(environment, 'SHARPTS_WWW_QUEUE_WAIT_MS', 2000, 100, 60_000)
    };
}

function normalizedRemoteAddress(address: string): string {
    const normalized = address.trim().toLowerCase();
    return normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
}

export function isPrivateNetworkAddress(address: string): boolean {
    const normalized = normalizedRemoteAddress(address);
    if (normalized === '::1' || normalized === '127.0.0.1')
        return true;
    if (normalized.startsWith('10.') || normalized.startsWith('192.168.'))
        return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:'))
        return true;
    if (!normalized.startsWith('172.'))
        return false;
    const secondOctet = Number(normalized.split('.')[1]);
    return Number.isInteger(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
}

export function canTrustProxyHeaders(remoteAddress: string, config: ServerConfig): boolean {
    const normalized = normalizedRemoteAddress(remoteAddress);
    if (config.trustedProxyAddresses.indexOf(normalized) >= 0)
        return true;
    return config.trustPrivateProxy && isPrivateNetworkAddress(normalized);
}
