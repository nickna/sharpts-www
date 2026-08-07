import { executionTimeoutPolicy } from './execution-policy';

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

export type ExecutionPhaseStatus = 'completed' | 'failed';

export interface ExecutionPhaseTiming {
    name: string;
    durationMs: number;
    status: ExecutionPhaseStatus;
}

export interface ExecutionTimings {
    phases: ExecutionPhaseTiming[];
    serverDurationMs: number;
}

/**
 * Return the most complete SharpTS wall-clock duration exposed by the embedding API.
 * Compiled aggregates intentionally do not equal the sum of their instrumented phases.
 */
export function calculateSharpTsPipelineDuration(
    phases: ExecutionPhaseTiming[],
    executionTimeMs: number,
    compileTimeMs: number | null
): number {
    if (compileTimeMs !== null)
        return Math.max(0, compileTimeMs) + Math.max(0, executionTimeMs);

    return phases.reduce((total, phase) => total + Math.max(0, phase.durationMs), 0);
}

export interface ExecutionResponse {
    success: boolean;
    output: string;
    errors: ExecutionError[];
    executionTimeMs: number;
    compileTimeMs: number | null;
    /** Optional while older website replicas can still answer during a rolling deployment. */
    timings?: ExecutionTimings;
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
    Timings: Array<{
        Name: string;
        DurationMs: number;
        Status: ExecutionPhaseStatus;
    }>;
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
    const timeout = value !== undefined && Number.isFinite(value) ? value : executionTimeoutPolicy.defaultMs;
    return Math.max(executionTimeoutPolicy.minimumMs, Math.min(executionTimeoutPolicy.maximumMs, timeout));
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
    const executionTimeMs = response.executionTimeMs;
    const compileTimeMs = response.compileTimeMs;
    const timings = response.timings;
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
        typeof executionTimeMs === 'number' &&
        Number.isFinite(executionTimeMs) && executionTimeMs >= 0 &&
        (compileTimeMs === null ||
            (typeof compileTimeMs === 'number' &&
                Number.isFinite(compileTimeMs) && compileTimeMs >= 0)) &&
        (timings === undefined || isExecutionTimings(timings))
    );
}

function isPhaseTiming(value: unknown, pascalCase: boolean): boolean {
    if (!value || typeof value !== 'object') return false;
    const timing = value as { [key: string]: unknown };
    const name = timing[pascalCase ? 'Name' : 'name'];
    const durationMs = timing[pascalCase ? 'DurationMs' : 'durationMs'];
    const status = timing[pascalCase ? 'Status' : 'status'];
    return (
        typeof name === 'string' && name.length > 0 &&
        typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0 &&
        (status === 'completed' || status === 'failed')
    );
}

function isExecutionTimings(value: unknown): value is ExecutionTimings {
    if (!value || typeof value !== 'object') return false;
    const timings = value as Partial<ExecutionTimings>;
    const phases = timings.phases;
    const serverDurationMs = timings.serverDurationMs;
    return (
        Array.isArray(phases) &&
        phases.every(phase => isPhaseTiming(phase, false)) &&
        typeof serverDurationMs === 'number' &&
        Number.isFinite(serverDurationMs) &&
        serverDurationMs >= 0
    );
}

export function isWorkerResponsePayload(value: unknown): value is WorkerResponsePayload {
    if (!value || typeof value !== 'object') return false;
    const response = value as Partial<WorkerResponsePayload>;
    const errors = response.Errors;
    const executionTimeMs = response.ExecutionTimeMs;
    const compileTimeMs = response.CompileTimeMs;
    const timings = response.Timings;
    return (
        typeof response.Success === 'boolean' &&
        typeof response.Output === 'string' &&
        Array.isArray(errors) &&
        errors.every((error) => typeof error?.Message === 'string') &&
        typeof executionTimeMs === 'number' &&
        Number.isFinite(executionTimeMs) && executionTimeMs >= 0 &&
        (compileTimeMs === null ||
            (typeof compileTimeMs === 'number' &&
                Number.isFinite(compileTimeMs) && compileTimeMs >= 0)) &&
        Array.isArray(timings) &&
        timings.every(timing => isPhaseTiming(timing, true))
    );
}
