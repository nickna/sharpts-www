import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadSupervisorConfig } from './config';
import {
    acquireExecutionSlot,
    cancelExecutionSlot,
    createExecutionQueue,
    releaseExecutionSlot,
    shutdownExecutionQueue
} from './execution-queue';
import {
    isWorkerResponsePayload,
    normalizeExecutionMode,
    normalizeExecutionTimeout
} from './execution-contract';
import type {
    ExecutionError,
    ExecutionResponse,
    ExecutionResponseBody,
    RunRequest,
    WorkerErrorPayload,
    WorkerResponsePayload
} from './execution-contract';

type LogField = string | number | boolean | null | undefined;

interface DataChunk {
    length: number;
    toString(): string;
}

interface ReadablePipe {
    on(event: 'data', listener: (chunk: DataChunk) => void): void;
}

interface WritablePipe {
    write(value: string): void;
    end(): void;
}

interface ChildProcessLike {
    pid?: number;
    stdin: WritablePipe;
    stdout: ReadablePipe;
    stderr: ReadablePipe;
    kill(signal: 'SIGKILL'): boolean | undefined;
    on(event: 'error', listener: () => void): void;
    on(event: 'close', listener: (code: number | null) => void): void;
}

const config = loadSupervisorConfig();
const maxSourceBytes = config.maximumSourceBytes;
const maxWorkerRssBytes = config.maximumWorkerRssBytes;
const maxWorkerOutputBytes = config.maximumWorkerOutputBytes;
const memoryPollIntervalMs = config.memoryPollIntervalMs;
const workerTimeoutBufferMs = config.workerTimeoutBufferMs;
const networkBlockSentinel = 'sharpts-network-blocked.invalid';
const utf8Encoder = new TextEncoder();

const workerPath = config.workerPath;
const workerDirectory = path.dirname(workerPath);
const requireRssMonitoring = config.requireRssMonitoring;
const executionQueue = createExecutionQueue({
    maximumConcurrent: config.maximumConcurrentWorkers,
    maximumQueued: config.maximumQueuedExecutions,
    waitMs: config.concurrencyWaitMs
});

const activeChildren: unknown[] = [];

export interface RunResult {
    status: number;
    body: ExecutionResponseBody;
}

export interface ExecutionHandle {
    cancel(): void;
}

interface ExecutionControl {
    cancelled: boolean;
    cancelWorker: (() => void) | null;
    queueRequestId: number;
}

function errorResponse(message: string, executionTimeMs: number = 0): ExecutionResponse {
    return {
        success: false,
        output: '',
        errors: [{ message, line: null, column: null }],
        executionTimeMs,
        compileTimeMs: null
    };
}

function sanitizeNetworkBlock(text: string): string {
    if (!text || text.indexOf(networkBlockSentinel) < 0)
        return text;
    return 'Network access is disabled in the SharpTS playground. fetch() and other outbound requests are blocked.';
}

export function normalizeWorkerResponse(value: unknown, fallbackElapsedMs: number): ExecutionResponse {
    if (!isWorkerResponsePayload(value))
        return errorResponse('Internal error: invalid worker response.', fallbackElapsedMs);

    const worker = value as WorkerResponsePayload;
    const rawErrors: WorkerErrorPayload[] = worker.Errors;
    const errors: ExecutionError[] = [];
    for (const error of rawErrors) {
        errors.push({
            message: sanitizeNetworkBlock(String(error.Message || 'Unknown worker error.')),
            line: null,
            column: null
        });
    }
    return {
        success: worker.Success === true,
        output: sanitizeNetworkBlock(String(worker.Output || '')),
        errors,
        executionTimeMs: worker.ExecutionTimeMs,
        compileTimeMs: worker.CompileTimeMs
    };
}

function removeFromArray<T>(values: T[], value: T): void {
    const index = values.indexOf(value);
    if (index >= 0)
        values.splice(index, 1);
}

function readWorkerRssBytes(pid: number): number | null {
    if (process.platform !== 'linux')
        return null;

    try {
        const status = String(fs.readFileSync('/proc/' + pid + '/status', 'utf8'));
        for (const line of status.split('\n')) {
            if (line.startsWith('VmRSS:')) {
                const kilobytes = parseInt(line.slice('VmRSS:'.length).trim(), 10);
                return Number.isFinite(kilobytes) ? kilobytes * 1024 : null;
            }
        }
    } catch {
        // A process commonly exits between the close check and this read.
    }
    return null;
}

function killChild(value: unknown): void {
    const child = value as ChildProcessLike;
    try {
        child.kill('SIGKILL');
    } catch {
        // The child may already have exited.
    }
}

function logWorker(event: string, executionId: string, extra?: { [key: string]: LogField }): void {
    const entry: { [key: string]: LogField } = { event, executionId };
    if (extra) {
        for (const key of Object.keys(extra))
            entry[key] = extra[key];
    }
    console.log(JSON.stringify(entry));
}

function runWorker(request: RunRequest, executionId: string, control: ExecutionControl,
    started: () => void,
    completed: (result: RunResult) => void): void {
    const startedAt = Date.now();
    const timeoutMs = normalizeExecutionTimeout(request.timeoutMs);
    const mode = normalizeExecutionMode(request.mode) || 'interpret';
    // SharpTS reports spawn failures through the child's asynchronous `error`
    // event, matching Node's normal spawn contract.
    const child: ChildProcessLike = spawn(workerPath, [], {
        cwd: workerDirectory,
        env: { DOTNET_ENVIRONMENT: process.env.DOTNET_ENVIRONMENT || 'Production' },
        stdio: 'pipe'
    });

    activeChildren.push(child);
    control.cancelWorker = () => {
        logWorker('worker_client_disconnected', executionId, { pid: child.pid });
        killChild(child);
    };
    logWorker('worker_started', executionId, { pid: child.pid, mode, timeoutMs });
    started();

    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;
    let killedForTimeout = false;
    let killedForMemory = false;
    let killedForOutput = false;

    // SharpTS's timer declaration requires a localized Node callback adapter cast.
    const timeout = setTimeout((() => {
        if (settled) return;
        killedForTimeout = true;
        logWorker('worker_timeout', executionId, { pid: child.pid, timeoutMs });
        killChild(child);
    }) as any, timeoutMs + workerTimeoutBufferMs);

    // SharpTS's timer declaration requires a localized Node callback adapter cast.
    const memoryPoll = setInterval((() => {
        if (settled) return;
        const rss = readWorkerRssBytes(Number(child.pid));
        if (rss !== null && rss > maxWorkerRssBytes) {
            killedForMemory = true;
            logWorker('worker_memory_limit', executionId, { pid: child.pid, rssBytes: rss });
            killChild(child);
        }
    }) as any, memoryPollIntervalMs);

    const finish = (status: number, body: ExecutionResponseBody, exitCode?: number): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearInterval(memoryPoll);
        removeFromArray(activeChildren, child);
        releaseExecutionSlot(executionQueue);
        logWorker('worker_finished', executionId, {
            pid: child.pid,
            exitCode: exitCode === undefined ? null : exitCode,
            elapsedMs: Date.now() - startedAt
        });
        completed({ status, body });
    };

    child.stdout.on('data', (chunk: DataChunk) => {
        if (settled) return;
        outputBytes += Number(chunk.length || 0);
        stdout += chunk.toString();
        if (outputBytes > maxWorkerOutputBytes) {
            killedForOutput = true;
            logWorker('worker_output_limit', executionId, { pid: child.pid });
            killChild(child);
        }
    });
    child.stderr.on('data', (chunk: DataChunk) => {
        if (settled) return;
        outputBytes += Number(chunk.length || 0);
        stderr += chunk.toString();
        if (outputBytes > maxWorkerOutputBytes) {
            killedForOutput = true;
            logWorker('worker_output_limit', executionId, { pid: child.pid });
            killChild(child);
        }
    });

    child.on('error', () => {
        finish(200, errorResponse('Internal server error: failed to start worker.'));
    });

    child.on('close', (code: number | null) => {
        const elapsedMs = Date.now() - startedAt;
        if (control.cancelled) {
            finish(499, { error: 'Execution cancelled because the client disconnected.' }, Number(code));
            return;
        }
        if (killedForMemory) {
            finish(200, errorResponse('Execution terminated: memory limit exceeded (150MB).', elapsedMs), Number(code));
            return;
        }
        if (killedForTimeout) {
            finish(200, errorResponse('Execution timed out after ' + timeoutMs + 'ms.', elapsedMs), Number(code));
            return;
        }
        if (killedForOutput) {
            finish(200, errorResponse('Execution terminated: worker output limit exceeded.', elapsedMs), Number(code));
            return;
        }

        if (Number(code) !== 0 || !stdout.trim()) {
            const detail = stderr.trim();
            let message: string;
            if (Number(code) === -1073741571 ||
                (Number(code) === 134 && detail.indexOf('Stack overflow.') >= 0))
                message = 'Execution terminated: stack overflow.';
            else if (detail)
                message = 'Execution error: ' + detail.slice(0, 500);
            else if (mode === 'compile')
                message = 'Program terminated the process (exit code ' + code + '), e.g. via process.exit().';
            else
                message = 'Execution terminated unexpectedly (exit code ' + code + ').';
            finish(200, errorResponse(sanitizeNetworkBlock(message), elapsedMs), Number(code));
            return;
        }

        try {
            finish(200, normalizeWorkerResponse(JSON.parse(stdout.trim()), elapsedMs), Number(code));
        } catch {
            finish(200, errorResponse('Internal error: invalid worker response.', elapsedMs), Number(code));
        }
    });

    child.stdin.write(JSON.stringify({
        Source: request.source,
        TimeoutMs: timeoutMs,
        Mode: mode
    }) + '\n');
    child.stdin.end();
}

export function isSupervisorReady(): boolean {
    if (!executionQueue.accepting)
        return false;
    if (!fs.existsSync(workerPath))
        return false;
    return !requireRssMonitoring ||
        (process.platform === 'linux' && readWorkerRssBytes(process.pid) !== null);
}

export function execute(request: RunRequest, executionId: string,
    started: () => void, completed: (result: RunResult) => void): ExecutionHandle {
    const control: ExecutionControl = { cancelled: false, cancelWorker: null, queueRequestId: 0 };
    const handle: ExecutionHandle = {
        cancel: () => {
            if (control.cancelled) return;
            control.cancelled = true;
            cancelExecutionSlot(executionQueue, control.queueRequestId);
            const cancelWorker = control.cancelWorker;
            if (cancelWorker)
                cancelWorker();
        }
    };

    if (!request || typeof request.source !== 'string' || !request.source.trim()) {
        completed({ status: 200, body: errorResponse('Source code cannot be empty.') });
        return handle;
    }
    if (utf8Encoder.encode(request.source).length > maxSourceBytes) {
        completed({ status: 200, body: errorResponse(
            'Source code exceeds maximum length of ' + maxSourceBytes + ' bytes.') });
        return handle;
    }

    const mode = normalizeExecutionMode(request.mode);
    if (mode === null) {
        completed({ status: 200, body: errorResponse("Mode must be 'interpret' or 'compile'.") });
        return handle;
    }

    if (!isSupervisorReady()) {
        completed({ status: 503, body: { error: 'Execution service is unavailable.' } });
        return handle;
    }

    const admissionCompleted = (acquired: boolean): void => {
        control.queueRequestId = 0;
        if (control.cancelled) {
            if (acquired) releaseExecutionSlot(executionQueue);
            return;
        }
        if (!acquired) {
            logWorker('worker_concurrency_rejected', executionId);
            completed({ status: 503, body: { error: 'Execution service is busy.' } });
            return;
        }
        runWorker({ source: request.source, timeoutMs: request.timeoutMs, mode },
            executionId, control, started, completed);
    };
    control.queueRequestId = acquireExecutionSlot(executionQueue, admissionCompleted);
    return handle;
}

export function beginSupervisorShutdown(): void {
    shutdownExecutionQueue(executionQueue);
}

export function killAllWorkers(): void {
    for (const child of activeChildren.slice())
        killChild(child);
}
