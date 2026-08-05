import { configureUntrustedProcess, runSourceJson } from 'sharpts:execution';
import { Console } from 'dotnet:System.Console';

const maxOutputLength = 100 * 1024;

interface WorkerRequest {
    Source: string;
    TimeoutMs: number;
    Mode?: string;
}

interface SourceExecutionResult {
    Success: boolean;
    Output: string;
    Errors: string[];
    ExecutionTimeMs: number;
    CompileTimeMs: number | null;
}

interface WorkerError {
    Message: string;
}

interface WorkerResponse {
    Success: boolean;
    Output: string;
    Errors: WorkerError[];
    ExecutionTimeMs: number;
    CompileTimeMs: number | null;
}

// Guest TypeScript may observe process.ppid, but cannot signal the same-UID HTTP
// supervisor through SharpTS's process facade while this host switch is active.
// Single-source playground programs cannot import networking modules. Their one
// remaining network surface, global fetch(), routes through HttpClient's default
// proxy and therefore fails against this deliberately unreachable sentinel.
configureUntrustedProcess('http://sharpts-network-blocked.invalid:9');

function exitInvalidRequest(): never {
    process.exit(1);
    throw new Error('process.exit returned unexpectedly');
}

function writeResponse(response: WorkerResponse): void {
    process.stdout.write(JSON.stringify(response) + '\n');
}

function failure(message: string): WorkerResponse {
    return {
        Success: false,
        Output: '',
        Errors: [{ Message: message }],
        ExecutionTimeMs: 0,
        CompileTimeMs: null
    };
}

const inputLine = Console.ReadLine();
if (inputLine === null || !String(inputLine).trim())
    exitInvalidRequest();

let request: WorkerRequest;
try {
    request = JSON.parse(String(inputLine)) as WorkerRequest;
} catch {
    exitInvalidRequest();
}

if (!request || typeof request.Source !== 'string' || !request.Source.trim())
    exitInvalidRequest();

const mode = String(request.Mode || 'interpret').toLowerCase();

try {
    const execution = JSON.parse(
        runSourceJson(request.Source, mode, maxOutputLength)) as SourceExecutionResult;
    const errors = Array.isArray(execution.Errors)
        ? execution.Errors.map(message => ({ Message: String(message) }))
        : [{ Message: 'Invalid source execution response.' }];

    writeResponse({
        Success: execution.Success === true,
        Output: String(execution.Output || ''),
        Errors: errors,
        ExecutionTimeMs: Number(execution.ExecutionTimeMs || 0),
        CompileTimeMs: execution.CompileTimeMs === null || execution.CompileTimeMs === undefined
            ? null
            : Number(execution.CompileTimeMs)
    });
} catch (error: any) {
    writeResponse(failure(error && error.message ? String(error.message) : String(error)));
}
