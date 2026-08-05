import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
    ExecutionError,
    ExecutionResponse,
    ExecutionResponseBody,
    RunRequest,
    WorkerErrorPayload,
    WorkerResponsePayload,
    normalizeExecutionMode,
    normalizeExecutionTimeout
} from './execution-contract';

const maxSourceBytes = 10 * 1024;
const maxWorkerRssBytes = 150 * 1024 * 1024;
const maxWorkerOutputBytes = 256 * 1024;
const memoryPollIntervalMs = 500;
const workerTimeoutBufferMs = 1_000;
const maxConcurrentWorkers = 3;
const concurrencyWaitMs = 2_000;
const networkBlockSentinel = 'sharpts-network-blocked.invalid';
const utf8Encoder = new TextEncoder();

const workerPath = path.resolve(process.env.SHARPTS_WWW_WORKER_PATH ||
    path.join(process.cwd(), 'worker', process.platform === 'win32'
        ? 'SharpTS.Www.Worker.exe'
        : 'SharpTS.Www.Worker'));
const workerDirectory = path.dirname(workerPath);
const requireRssMonitoring = process.env.SHARPTS_WWW_REQUIRE_RSS_MONITORING !== 'false';

let activeWorkerCount = 0;
let acceptingWork = true;
let queueSequence = 0;
const activeChildren: any[] = [];

export interface RunResult {
    status: number;
    body: ExecutionResponseBody;
}

export interface ExecutionHandle {
    cancel(): void;
}

interface QueueEntry {
    id: number;
    settled: boolean;
    completed: (acquired: boolean) => void;
    timer: any;
}

interface ExecutionControl {
    cancelled: boolean;
    child: any;
}

const waiting: QueueEntry[] = [];

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

function normalizeWorkerResponse(value: unknown, fallbackElapsedMs: number): ExecutionResponse {
    if (!value || typeof value !== 'object')
        return errorResponse('Internal error: invalid worker response.', fallbackElapsedMs);

    const worker = value as WorkerResponsePayload;
    const rawErrors: WorkerErrorPayload[] = Array.isArray(worker.Errors)
        ? worker.Errors
        : [];
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
        executionTimeMs: Number(worker.ExecutionTimeMs || fallbackElapsedMs),
        compileTimeMs: worker.CompileTimeMs === null || worker.CompileTimeMs === undefined
            ? null
            : Number(worker.CompileTimeMs)
    };
}

function removeFromArray<T>(values: T[], value: T): void {
    const index = values.indexOf(value);
    if (index >= 0)
        values.splice(index, 1);
}

function releaseSlot(): void {
    if (activeWorkerCount > 0)
        activeWorkerCount--;

    while (acceptingWork && waiting.length > 0) {
        const entry = waiting.shift();
        if (entry.settled)
            continue;
        entry.settled = true;
        clearTimeout(entry.timer);
        activeWorkerCount++;
        entry.completed(true);
        break;
    }
}

function acquireSlot(completed: (acquired: boolean) => void): void {
    if (!acceptingWork) {
        completed(false);
        return;
    }

    if (activeWorkerCount < maxConcurrentWorkers) {
        activeWorkerCount++;
        completed(true);
        return;
    }

    const entry: QueueEntry = {
        id: ++queueSequence,
        settled: false,
        completed,
        timer: undefined
    };
    entry.timer = setTimeout((() => {
        if (entry.settled) return;
        entry.settled = true;
        removeFromArray(waiting, entry);
        completed(false);
    }) as any, concurrencyWaitMs);
    waiting.push(entry);
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

function killChild(child: any): void {
    try {
        child.kill('SIGKILL');
    } catch {
        // The child may already have exited.
    }
}

function logWorker(event: string, executionId: string, extra?: { [key: string]: any }): void {
    const entry: { [key: string]: any } = { event, executionId };
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
    const child: any = spawn(workerPath, [], {
        cwd: workerDirectory,
        env: { DOTNET_ENVIRONMENT: process.env.DOTNET_ENVIRONMENT || 'Production' },
        stdio: 'pipe'
    });

    activeChildren.push(child);
    control.child = child;
    logWorker('worker_started', executionId, { pid: child.pid, mode, timeoutMs });
    started();

    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;
    let killedForTimeout = false;
    let killedForMemory = false;
    let killedForOutput = false;

    const timeout = setTimeout((() => {
        if (settled) return;
        killedForTimeout = true;
        logWorker('worker_timeout', executionId, { pid: child.pid, timeoutMs });
        killChild(child);
    }) as any, timeoutMs + workerTimeoutBufferMs);

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
        releaseSlot();
        logWorker('worker_finished', executionId, {
            pid: child.pid,
            exitCode: exitCode === undefined ? null : exitCode,
            elapsedMs: Date.now() - startedAt
        });
        completed({ status, body });
    };

    child.stdout.on('data', (chunk: any) => {
        if (settled) return;
        outputBytes += Number(chunk.length || 0);
        stdout += chunk.toString();
        if (outputBytes > maxWorkerOutputBytes) {
            killedForOutput = true;
            logWorker('worker_output_limit', executionId, { pid: child.pid });
            killChild(child);
        }
    });
    child.stderr.on('data', (chunk: any) => {
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

    child.on('close', (code: any) => {
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
    if (!acceptingWork)
        return false;
    if (!fs.existsSync(workerPath))
        return false;
    return !requireRssMonitoring ||
        (process.platform === 'linux' && readWorkerRssBytes(process.pid) !== null);
}

export function execute(request: RunRequest, executionId: string,
    started: () => void, completed: (result: RunResult) => void): ExecutionHandle {
    const control: ExecutionControl = { cancelled: false, child: null };
    const handle: ExecutionHandle = {
        cancel: () => {
            if (control.cancelled) return;
            control.cancelled = true;
            if (control.child) {
                logWorker('worker_client_disconnected', executionId, { pid: control.child.pid });
                killChild(control.child);
            }
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

    acquireSlot(acquired => {
        if (control.cancelled) {
            if (acquired) releaseSlot();
            return;
        }
        if (!acquired) {
            logWorker('worker_concurrency_rejected', executionId);
            completed({ status: 503, body: { error: 'Execution service is busy.' } });
            return;
        }
        runWorker({ source: request.source, timeoutMs: request.timeoutMs, mode },
            executionId, control, started, completed);
    });
    return handle;
}

export function beginSupervisorShutdown(): void {
    acceptingWork = false;
    while (waiting.length > 0) {
        const entry = waiting.shift();
        if (entry.settled)
            continue;
        entry.settled = true;
        clearTimeout(entry.timer);
        entry.completed(false);
    }
}

export function killAllWorkers(): void {
    for (const child of activeChildren.slice())
        killChild(child);
}
