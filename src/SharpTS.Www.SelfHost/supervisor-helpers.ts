import { networkBlockHost } from '../SharpTS.Www.Shared/execution-policy';
import { calculateSharpTsPipelineDuration, isWorkerResponsePayload } from './execution-contract';
import type {
    ExecutionError, ExecutionPhaseTiming, ExecutionResponse, ExecutionTimings,
    WorkerErrorPayload, WorkerResponsePayload
} from './execution-contract';

function finiteDuration(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function errorResponse(message: string, timings: ExecutionTimings): ExecutionResponse {
    return { success: false, output: '', errors: [{ message, line: null, column: null }],
        executionTimeMs: 0, compileTimeMs: null, timings };
}

export function aggregateTimings(workerPhases: ExecutionPhaseTiming[], queueDurationMs: number,
    isolatedWorkerDurationMs: number, isolatedWorkerStatus: 'completed' | 'failed' = 'completed',
    sharpTsDurationMs?: number): ExecutionTimings {
    const queueDuration = finiteDuration(queueDurationMs);
    const isolatedDuration = finiteDuration(isolatedWorkerDurationMs);
    const sharpTsDuration = sharpTsDurationMs === undefined
        ? workerPhases.reduce((total, phase) => total + finiteDuration(phase.durationMs), 0)
        : finiteDuration(sharpTsDurationMs);
    return { phases: [
        { name: 'queue', durationMs: queueDuration, status: 'completed' },
        { name: 'isolatedWorker', durationMs: Math.max(0, isolatedDuration - sharpTsDuration),
            status: isolatedWorkerStatus },
        ...workerPhases
    ], serverDurationMs: queueDuration + isolatedDuration };
}

function sanitizeNetworkBlock(text: string): string {
    if (!text || text.indexOf(networkBlockHost) < 0) return text;
    return 'Network access is disabled in the SharpTS playground. fetch() and other outbound requests are blocked.';
}

export function normalizeWorkerResponse(value: unknown, isolatedWorkerDurationMs: number,
    queueDurationMs: number = 0): ExecutionResponse {
    if (!isWorkerResponsePayload(value))
        return errorResponse('Internal error: invalid worker response.',
            aggregateTimings([], queueDurationMs, isolatedWorkerDurationMs, 'failed'));
    const worker = value as WorkerResponsePayload;
    const errors: ExecutionError[] = [];
    for (const error of worker.Errors as WorkerErrorPayload[])
        errors.push({ message: sanitizeNetworkBlock(String(error.Message || 'Unknown worker error.')),
            line: null, column: null });
    const phases: ExecutionPhaseTiming[] = worker.Timings.map(timing => ({
        name: timing.Name, durationMs: timing.DurationMs, status: timing.Status
    }));
    return { success: worker.Success === true, output: sanitizeNetworkBlock(String(worker.Output || '')),
        errors, executionTimeMs: worker.ExecutionTimeMs, compileTimeMs: worker.CompileTimeMs,
        timings: aggregateTimings(phases, queueDurationMs, isolatedWorkerDurationMs, 'completed',
            calculateSharpTsPipelineDuration(phases, worker.ExecutionTimeMs, worker.CompileTimeMs)) };
}
