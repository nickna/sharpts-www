export type ExecutionMode = 'interpret' | 'compile';

export interface RunRequest {
    source: string;
    timeoutMs?: number;
    mode?: string;
}

export interface ExecutionError {
    message: string;
    line: number | null;
    column: number | null;
}

export interface ExecutionResponse {
    success: boolean;
    output: string;
    errors: ExecutionError[];
    executionTimeMs: number;
    compileTimeMs: number | null;
}

export interface ApiErrorResponse {
    error: string;
}

export type ExecutionResponseBody = ExecutionResponse | ApiErrorResponse;

export interface WorkerErrorPayload {
    Message: string;
}

export interface WorkerResponsePayload {
    Success: boolean;
    Output: string;
    Errors: WorkerErrorPayload[];
    ExecutionTimeMs: number;
    CompileTimeMs: number | null;
}

const defaultTimeoutMs = 5_000;
const minimumTimeoutMs = 100;
const maximumTimeoutMs = 10_000;

/** Convert untrusted JSON into the narrow input accepted by the supervisor. */
export function parseRunRequest(value: unknown): RunRequest {
    if (!value || typeof value !== 'object')
        return { source: '' };

    const payload = value as {
        source?: unknown;
        timeoutMs?: unknown;
        mode?: unknown;
    };
    const request: RunRequest = { source: '' };
    const source = payload.source;
    const timeoutMs = payload.timeoutMs;
    const mode = payload.mode;
    if (typeof source === 'string')
        request.source = source;
    if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs))
        request.timeoutMs = Number(timeoutMs);
    if (typeof mode === 'string')
        request.mode = mode;
    return request;
}

export function normalizeExecutionMode(value: string | undefined): ExecutionMode | null {
    const mode = String(value || 'interpret').toLowerCase();
    return mode === 'interpret' || mode === 'compile' ? mode : null;
}

export function normalizeExecutionTimeout(value: number | undefined): number {
    let timeout = defaultTimeoutMs;
    if (value !== undefined && Number.isFinite(value))
        timeout = value;
    return Math.max(minimumTimeoutMs, Math.min(maximumTimeoutMs, timeout));
}
