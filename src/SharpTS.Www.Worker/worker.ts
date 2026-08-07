import { Console } from 'dotnet:System.Console';
import { configureUntrustedProcess, runSourceJson } from 'sharpts:execution';
import {
    serializeWorkerMessage,
    type WorkerRequestPayload,
    type WorkerResponsePayload
} from '../SharpTS.Www.Shared/execution-contract';
import { networkBlockProxyUrl } from '../SharpTS.Www.Shared/execution-policy';

const maxOutputLength = 100 * 1024;

interface SourceExecutionResult {
    Success: boolean;
    Output: string;
    Errors: string[];
    ExecutionTimeMs: number;
    CompileTimeMs: number | null;
    Timings: Array<{
        Name: string;
        DurationMs: number;
        Status: 'completed' | 'failed';
    }>;
}

// Guest TypeScript may observe process.ppid, but cannot signal the same-UID HTTP
// supervisor through SharpTS's process facade while this host switch is active.
// Single-source playground programs cannot import networking modules. Their one
// remaining network surface, global fetch(), routes through HttpClient's default
// proxy and therefore fails against this deliberately unreachable sentinel.
configureUntrustedProcess(networkBlockProxyUrl);

function exitInvalidRequest(): never {
    process.exit(1);
    throw new Error('process.exit returned unexpectedly');
}

function writeResponse(response: WorkerResponsePayload): void {
    process.stdout.write(serializeWorkerMessage(response) + '\n');
}

function failure(message: string): WorkerResponsePayload {
    return {
        Success: false,
        Output: '',
        Errors: [{ Message: message }],
        ExecutionTimeMs: 0,
        CompileTimeMs: null,
        Timings: []
    };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

// The host serializes requests as ASCII-only JSON, so Console's inherited text
// encoding cannot alter the message. JSON.parse restores all escaped Unicode.
const inputLine = Console.ReadLine();
if (inputLine === null || !String(inputLine).trim()) exitInvalidRequest();

let request: WorkerRequestPayload;
try {
    request = JSON.parse(String(inputLine)) as WorkerRequestPayload;
} catch {
    exitInvalidRequest();
}

if (!request || typeof request.Source !== 'string' || !request.Source.trim()) exitInvalidRequest();

const mode = String(request.Mode || 'interpret').toLowerCase();

try {
    const execution = JSON.parse(runSourceJson(request.Source, mode, maxOutputLength)) as SourceExecutionResult;
    const errors = Array.isArray(execution.Errors)
        ? execution.Errors.map((message) => ({ Message: String(message) }))
        : [{ Message: 'Invalid source execution response.' }];

    writeResponse({
        Success: execution.Success === true,
        Output: String(execution.Output || ''),
        Errors: errors,
        ExecutionTimeMs: Number(execution.ExecutionTimeMs || 0),
        CompileTimeMs:
            execution.CompileTimeMs === null || execution.CompileTimeMs === undefined
                ? null
                : Number(execution.CompileTimeMs),
        Timings: Array.isArray(execution.Timings)
            ? execution.Timings.map(timing => ({
                Name: String(timing.Name),
                DurationMs: Number(timing.DurationMs),
                Status: timing.Status === 'failed' ? 'failed' : 'completed'
            }))
            : []
    });
} catch (error: unknown) {
    writeResponse(failure(errorMessage(error)));
}
