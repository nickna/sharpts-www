export type ExecutionMode = 'interpret' | 'compile';

export interface Preset {
    name: string;
    description: string;
    source: string;
}

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

/** Pascal-cased wire format used only between the host and isolated worker. */
export interface WorkerRequestPayload {
    Source: string;
    TimeoutMs: number;
    Mode: ExecutionMode;
}

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

/**
 * Serialize a worker protocol message using printable ASCII JSON.
 *
 * The protocol still represents full Unicode through JSON `\uXXXX` escapes,
 * but keeping the pipe bytes ASCII prevents inherited console code pages from
 * corrupting source text or execution output on Windows.
 */
export function serializeWorkerMessage(value: unknown): string {
    return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) =>
        `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
    );
}

const defaultTimeoutMs = 5_000;
const minimumTimeoutMs = 100;
const maximumTimeoutMs = 10_000;

/** Convert untrusted JSON into the narrow input accepted by the supervisor. */
export function parseRunRequest(value: unknown): RunRequest {
    if (!value || typeof value !== 'object') return { source: '' };

    const payload = value as {
        source?: unknown;
        timeoutMs?: unknown;
        mode?: unknown;
    };
    const request: RunRequest = { source: '' };
    const source = payload.source;
    const timeoutMs = payload.timeoutMs;
    const mode = payload.mode;
    if (typeof source === 'string') request.source = source;
    if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)) request.timeoutMs = Number(timeoutMs);
    if (typeof mode === 'string') request.mode = mode;
    return request;
}

export function normalizeExecutionMode(value: string | undefined): ExecutionMode | null {
    const mode = String(value || 'interpret').toLowerCase();
    return mode === 'interpret' || mode === 'compile' ? mode : null;
}

export function normalizeExecutionTimeout(value: number | undefined): number {
    const timeout = value !== undefined && Number.isFinite(value) ? value : defaultTimeoutMs;
    return Math.max(minimumTimeoutMs, Math.min(maximumTimeoutMs, timeout));
}

export function isPresetArray(value: unknown): value is Preset[] {
    return (
        Array.isArray(value) &&
        value.every((candidate) => {
            const preset = candidate as Partial<Preset> | null;
            return (
                preset !== null &&
                typeof preset === 'object' &&
                typeof preset.name === 'string' &&
                typeof preset.description === 'string' &&
                typeof preset.source === 'string'
            );
        })
    );
}

export function isExecutionResponse(value: unknown): value is ExecutionResponse {
    if (!value || typeof value !== 'object') return false;
    const response = value as Partial<ExecutionResponse>;
    const errors = response.errors;
    return (
        typeof response.success === 'boolean' &&
        typeof response.output === 'string' &&
        Array.isArray(errors) &&
        errors.every(
            (error) =>
                typeof error?.message === 'string' &&
                (error.line === null || typeof error.line === 'number') &&
                (error.column === null || typeof error.column === 'number')
        ) &&
        typeof response.executionTimeMs === 'number' &&
        Number.isFinite(response.executionTimeMs) &&
        (response.compileTimeMs === null ||
            (typeof response.compileTimeMs === 'number' && Number.isFinite(response.compileTimeMs)))
    );
}

export function isWorkerResponsePayload(value: unknown): value is WorkerResponsePayload {
    if (!value || typeof value !== 'object') return false;
    const response = value as Partial<WorkerResponsePayload>;
    const errors = response.Errors;
    return (
        typeof response.Success === 'boolean' &&
        typeof response.Output === 'string' &&
        Array.isArray(errors) &&
        errors.every((error) => typeof error?.Message === 'string') &&
        typeof response.ExecutionTimeMs === 'number' &&
        Number.isFinite(response.ExecutionTimeMs) &&
        (response.CompileTimeMs === null ||
            (typeof response.CompileTimeMs === 'number' && Number.isFinite(response.CompileTimeMs)))
    );
}
