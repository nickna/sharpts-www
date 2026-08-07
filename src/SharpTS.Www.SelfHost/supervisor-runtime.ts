import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import type { SupervisorConfig } from './config';
import {
    acquireExecutionSlot, cancelExecutionSlot, createExecutionQueue,
    releaseExecutionSlot, shutdownExecutionQueue
} from './execution-queue';
import { normalizeExecutionMode, normalizeExecutionTimeout, serializeWorkerMessage } from './execution-contract';
import type { ExecutionResponse, ExecutionResponseBody, ExecutionTimings, RunRequest } from './execution-contract';
import { aggregateTimings, normalizeWorkerResponse } from './supervisor-helpers';

export interface DataChunk { length: number; toString(): string; }
interface ReadablePipe { on(event: 'data', listener: (chunk: DataChunk) => void): void; }
interface WritablePipe { write(value: string): void; end(): void; }
export interface WorkerProcess {
    pid?: number;
    stdin: WritablePipe;
    stdout: ReadablePipe;
    stderr: ReadablePipe;
    kill(signal: 'SIGKILL'): boolean | undefined;
    on(event: 'error', listener: () => void): void;
    on(event: 'close', listener: (code: number | null) => void): void;
}
export interface RunResult { status: number; body: ExecutionResponseBody; }
export interface ExecutionHandle { cancel(): void; }
export interface Supervisor {
    execute(request: RunRequest, executionId: string, started: () => void,
        completed: (result: RunResult) => void): ExecutionHandle;
    isReady(): boolean;
    beginShutdown(): void;
    killAllWorkers(): void;
}
export interface SupervisorDependencies {
    spawnWorker?: (workerPath: string, workerDirectory: string) => WorkerProcess;
    fileExists?: (filePath: string) => boolean;
    readWorkerRssBytes?: (pid: number) => number | null;
    now?: () => number;
    log?: (message: string) => void;
    platform?: string;
    processId?: number;
}
interface StreamBudget { bytes: number; exceeded: boolean; }
export interface BoundedStreamCapture { append(chunk: DataChunk): void; value(): string; }

export function createBoundedStreamCapture(maximumBytes: number, budget: StreamBudget,
    exceeded: () => void): BoundedStreamCapture {
    let content = '';
    return {
        append: chunk => {
            if (budget.exceeded) return;
            budget.bytes += Number(chunk.length || 0);
            content += chunk.toString();
            if (budget.bytes > maximumBytes) {
                budget.exceeded = true;
                exceeded();
            }
        },
        value: () => content
    };
}

export interface WorkerExitState {
    cancelled: boolean;
    killedForMemory: boolean;
    killedForTimeout: boolean;
    killedForOutput: boolean;
    timeoutMs: number;
    maximumWorkerRssBytes: number;
    exitCode: number | null;
    stderr: string;
    mode: 'interpret' | 'compile';
    hasOutput: boolean;
}

function memoryLimit(bytes: number): string {
    const mebibytes = bytes / (1024 * 1024);
    return (Number.isInteger(mebibytes) ? String(mebibytes) : mebibytes.toFixed(1)) + ' MiB';
}

export function classifyWorkerExit(state: WorkerExitState): { status: number; message: string } | null {
    if (state.cancelled)
        return { status: 499, message: 'Execution cancelled because the client disconnected.' };
    if (state.killedForMemory)
        return { status: 200, message: 'Execution terminated: memory limit exceeded (' +
            memoryLimit(state.maximumWorkerRssBytes) + ').' };
    if (state.killedForTimeout)
        return { status: 200, message: 'Execution timed out after ' + state.timeoutMs + 'ms.' };
    if (state.killedForOutput)
        return { status: 200, message: 'Execution terminated: worker output limit exceeded.' };
    if (Number(state.exitCode) === 0 && state.hasOutput) return null;
    const detail = state.stderr.trim();
    if (Number(state.exitCode) === -1073741571 ||
        (Number(state.exitCode) === 134 && detail.indexOf('Stack overflow.') >= 0))
        return { status: 200, message: 'Execution terminated: stack overflow.' };
    if (detail) return { status: 200, message: 'Execution error: ' + detail.slice(0, 500) };
    if (state.mode === 'compile')
        return { status: 200, message: 'Program terminated the process (exit code ' + state.exitCode +
            '), e.g. via process.exit().' };
    return { status: 200, message: 'Execution terminated unexpectedly (exit code ' + state.exitCode + ').' };
}

function errorResponse(message: string, timings?: ExecutionTimings): ExecutionResponse {
    return { success: false, output: '', errors: [{ message, line: null, column: null }],
        executionTimeMs: 0, compileTimeMs: null,
        timings: timings || { phases: [], serverDurationMs: 0 } };
}

function defaultRss(pid: number, platform: string): number | null {
    if (platform !== 'linux') return null;
    try {
        const status = String(fs.readFileSync('/proc/' + pid + '/status', 'utf8'));
        for (const line of status.split('\n')) {
            if (!line.startsWith('VmRSS:')) continue;
            const kilobytes = parseInt(line.slice('VmRSS:'.length).trim(), 10);
            return Number.isFinite(kilobytes) ? kilobytes * 1024 : null;
        }
    } catch { /* The process may exit while its status is read. */ }
    return null;
}

function kill(value: unknown): void {
    const child = value as WorkerProcess;
    try { child.kill('SIGKILL'); } catch { /* The child may already have exited. */ }
}

function remove<T>(items: T[], item: T): void {
    const index = items.indexOf(item);
    if (index >= 0) items.splice(index, 1);
}

function workerDirectory(workerPath: string): string {
    return path.dirname(workerPath);
}

export function createSupervisor(config: SupervisorConfig,
    dependencies: SupervisorDependencies = {}): Supervisor {
    const platform = dependencies.platform || process.platform;
    const processId = dependencies.processId || process.pid;
    const now: () => number = dependencies.now || (() => performance.now());
    const log: (message: string) => void = dependencies.log || (message => console.log(message));
    const fileExists: (filePath: string) => boolean = dependencies.fileExists || (file => fs.existsSync(file));
    const readRss: (pid: number) => number | null =
        dependencies.readWorkerRssBytes || (pid => defaultRss(pid, platform));
    const injectedSpawnWorker = dependencies.spawnWorker;
    const queue = createExecutionQueue({ maximumConcurrent: config.maximumConcurrentWorkers,
        maximumQueued: config.maximumQueuedExecutions, waitMs: config.concurrencyWaitMs });
    const children: unknown[] = [];
    const encoder = new TextEncoder();
    let accepting = true;

    const logWorker = (event: string, executionId: string,
        extra: { [key: string]: string | number | boolean | null | undefined } = {}): void =>
        log(JSON.stringify({ event, executionId, ...extra }));
    const isReady = (): boolean => accepting && queue.accepting && fileExists(config.workerPath) &&
        (!config.requireRssMonitoring || (platform === 'linux' && readRss(processId) !== null));

    const execute = (request: RunRequest, executionId: string, started: () => void,
        completed: (result: RunResult) => void): ExecutionHandle => {
        const queuedAt = now();
        const control = { cancelled: false, cancelWorker: null as (() => void) | null, queueRequestId: 0 };
        const handle = { cancel: (): void => {
            if (control.cancelled) return;
            control.cancelled = true;
            cancelExecutionSlot(queue, control.queueRequestId);
            const cancelWorker = control.cancelWorker;
            if (cancelWorker) cancelWorker();
        } };
        if (!request || typeof request.source !== 'string' || !request.source.trim()) {
            completed({ status: 200, body: errorResponse('Source code cannot be empty.') }); return handle;
        }
        if (encoder.encode(request.source).length > config.maximumSourceBytes) {
            completed({ status: 200, body: errorResponse('Source code exceeds maximum length of ' +
                config.maximumSourceBytes + ' bytes.') }); return handle;
        }
        const mode = normalizeExecutionMode(request.mode);
        if (mode === null) {
            completed({ status: 200, body: errorResponse("Mode must be 'interpret' or 'compile'.") }); return handle;
        }
        if (!isReady()) {
            completed({ status: 503, body: { error: 'Execution service is unavailable.' } }); return handle;
        }
        control.queueRequestId = acquireExecutionSlot(queue, acquired => {
            control.queueRequestId = 0;
            if (control.cancelled) { if (acquired) releaseExecutionSlot(queue); return; }
            if (!acquired) {
                logWorker('worker_concurrency_rejected', executionId);
                completed({ status: 503, body: { error: 'Execution service is busy.' } }); return;
            }
            const queueDuration = now() - queuedAt;
            const timeoutMs = normalizeExecutionTimeout(request.timeoutMs);
            let child: any;
            if (injectedSpawnWorker) {
                child = injectedSpawnWorker(config.workerPath, workerDirectory(config.workerPath));
            } else {
                child = spawn(config.workerPath, [], {
                    cwd: workerDirectory(config.workerPath),
                    env: { DOTNET_ENVIRONMENT: process.env.DOTNET_ENVIRONMENT || 'Production' },
                    stdio: 'pipe'
                });
            }
            children.push(child);
            control.cancelWorker = () => { logWorker('worker_client_disconnected', executionId,
                { pid: child.pid }); kill(child); };
            const startedAt = now();
            let settled = false;
            let killedForTimeout = false;
            let killedForMemory = false;
            let killedForOutput = false;
            const budget: StreamBudget = { bytes: 0, exceeded: false };
            const outputExceeded = (): void => { killedForOutput = true;
                logWorker('worker_output_limit', executionId, { pid: child.pid }); kill(child); };
            const stdout = createBoundedStreamCapture(config.maximumWorkerOutputBytes, budget, outputExceeded);
            const stderr = createBoundedStreamCapture(config.maximumWorkerOutputBytes, budget, outputExceeded);
            const timeout = setTimeout((() => { if (!settled) { killedForTimeout = true;
                logWorker('worker_timeout', executionId, { pid: child.pid, timeoutMs }); kill(child); } }) as any,
            timeoutMs + config.workerTimeoutBufferMs);
            const poll = setInterval((() => { if (settled) return; const rss = readRss(Number(child.pid));
                if (rss !== null && rss > config.maximumWorkerRssBytes) { killedForMemory = true;
                    logWorker('worker_memory_limit', executionId, { pid: child.pid, rssBytes: rss }); kill(child); }
            }) as any, config.memoryPollIntervalMs);
            const finish = (status: number, body: ExecutionResponseBody, exitCode?: number): void => {
                if (settled) return;
                settled = true; clearTimeout(timeout); clearInterval(poll); remove(children, child);
                releaseExecutionSlot(queue);
                logWorker('worker_finished', executionId, { pid: child.pid,
                    exitCode: exitCode === undefined ? null : exitCode, elapsedMs: now() - startedAt });
                completed({ status, body });
            };
            child.stdout.on('data', (chunk: DataChunk) => { if (!settled) stdout.append(chunk); });
            child.stderr.on('data', (chunk: DataChunk) => { if (!settled) stderr.append(chunk); });
            child.on('error', () => finish(200, errorResponse('Internal server error: failed to start worker.',
                aggregateTimings([], queueDuration, now() - startedAt, 'failed'))));
            child.on('close', (code: number | null) => {
                const elapsed = now() - startedAt;
                const outcome = classifyWorkerExit({ cancelled: control.cancelled, killedForMemory,
                    killedForTimeout, killedForOutput, timeoutMs,
                    maximumWorkerRssBytes: config.maximumWorkerRssBytes, exitCode: code,
                    stderr: stderr.value(), mode, hasOutput: Boolean(stdout.value().trim()) });
                if (outcome) {
                    finish(outcome.status, outcome.status === 499 ? { error: outcome.message } :
                        errorResponse(outcome.message, aggregateTimings([], queueDuration, elapsed, 'failed')),
                    Number(code)); return;
                }
                try { finish(200, normalizeWorkerResponse(JSON.parse(stdout.value().trim()),
                    elapsed, queueDuration), Number(code)); }
                catch { finish(200, errorResponse('Internal error: invalid worker response.',
                    aggregateTimings([], queueDuration, elapsed, 'failed')), Number(code)); }
            });
            logWorker('worker_started', executionId, { pid: child.pid, mode, timeoutMs });
            started();
            child.stdin.write(serializeWorkerMessage({ Source: request.source, TimeoutMs: timeoutMs, Mode: mode }) + '\n');
            child.stdin.end();
        });
        return handle;
    };

    return { execute, isReady, beginShutdown: () => { accepting = false; shutdownExecutionQueue(queue); },
        killAllWorkers: () => children.slice().forEach(kill) };
}
