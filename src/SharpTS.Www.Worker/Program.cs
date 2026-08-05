using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using SharpTS.Compilation;
using SharpTS.Diagnostics;
using SharpTS.Execution;
using SharpTS.Parsing;
using SharpTS.TypeSystem;

const int MaxOutputLength = 100 * 1024; // 100KB

// Submitted code can see process.ppid. Without this host-level restriction,
// process.kill(process.ppid) could terminate the same-UID HTTP supervisor.
// The switch is honored by both SharpTS execution modes and is not exposed
// through process.env, so guest TypeScript cannot unset it.
AppContext.SetSwitch("SharpTS.RestrictProcessControl", true);

// The only network capability reachable from single-source playground code is the
// global fetch() — the fs/net/http/dns modules all require imports, which this
// (non-module) execution mode rejects. SharpTS' fetch routes through HttpClient,
// which consults HttpClient.DefaultProxy for handlers that don't set their own
// proxy (the engine's don't). Pointing that at a non-listening loopback port makes
// every outbound request fail fast and is set here, in the host before any guest
// code runs — TypeScript cannot reach or override it. This blocks server-side
// request forgery (cloud metadata endpoints, internal services) in both modes.
// The "sharpts-network-blocked" host is a recognizable sentinel for friendlier
// error messaging upstream; it never resolves.
HttpClient.DefaultProxy = new WebProxy("http://sharpts-network-blocked.invalid:9")
{
    BypassProxyOnLocal = false,
};

// Save the real stdout before we redirect Console.Out for the interpreter.
var realStdout = Console.Out;

string? inputLine;
try
{
    inputLine = Console.ReadLine();
}
catch
{
    return 1;
}

if (string.IsNullOrWhiteSpace(inputLine))
    return 1;

WorkerRequest? request;
try
{
    request = JsonSerializer.Deserialize<WorkerRequest>(inputLine);
}
catch
{
    return 1;
}

if (request is null || string.IsNullOrWhiteSpace(request.Source))
    return 1;

var errors = new List<WorkerError>();
var outputBuilder = new StringBuilder();
long executionMs = 0;

using var outputWriter = new CappedStringWriter(outputBuilder, MaxOutputLength);
Console.SetOut(outputWriter);
Console.SetError(outputWriter);

try
{
    if (string.Equals(request.Mode, "compile", StringComparison.OrdinalIgnoreCase))
    {
        var compileResult = CompilationService.Compile(request.Source, new CompileOptions(DecoratorMode.None));

        if (!compileResult.Success)
        {
            foreach (var diagnostic in compileResult.Diagnostics)
                errors.Add(new WorkerError(diagnostic.ToString()));

            WriteResponse(new WorkerResponse(false, outputBuilder.ToString(), errors, 0, compileResult.CompileTimeMs));
            return 0;
        }

        // Execute swaps Console.Out/Error to the given writer for the duration of the
        // run, so guest output lands in the same capped buffer as interpreted mode.
        var runResult = CompilationService.Execute(compileResult.AssemblyBytes!, outputWriter);

        if (!runResult.Success && runResult.Error is not null)
            errors.Add(new WorkerError(runResult.Error));

        WriteResponse(new WorkerResponse(runResult.Success, outputBuilder.ToString(), errors, runResult.ExecuteTimeMs, compileResult.CompileTimeMs));
        return 0;
    }

    // Lexing
    var lexer = new Lexer(request.Source);
    var tokens = lexer.ScanTokens();

    // Parsing
    var parser = new Parser(tokens, DecoratorMode.None);
    var parseResult = parser.Parse();

    if (!parseResult.IsSuccess)
    {
        foreach (var diagnostic in parseResult.Diagnostics)
            errors.Add(new WorkerError(diagnostic.ToString()));
        if (parseResult.HitErrorLimit)
            errors.Add(new WorkerError("Too many errors, stopping."));

        WriteResponse(new WorkerResponse(false, outputBuilder.ToString(), errors, 0));
        return 0;
    }

    // Type checking
    var checker = new TypeChecker();
    checker.SetDecoratorMode(DecoratorMode.None);
    var typeResult = checker.CheckWithRecovery(parseResult.Statements);

    if (!typeResult.IsSuccess)
    {
        foreach (var diagnostic in typeResult.Diagnostics)
            errors.Add(new WorkerError(diagnostic.ToString()));
        if (typeResult.HitErrorLimit)
            errors.Add(new WorkerError("Too many errors, stopping."));

        WriteResponse(new WorkerResponse(false, outputBuilder.ToString(), errors, 0));
        return 0;
    }

    // Execution (no internal timeout — parent process handles kill)
    using var interpreter = new Interpreter();
    interpreter.SetDecoratorMode(DecoratorMode.None);

    var resolver = new VariableResolver(interpreter);
    resolver.Resolve(parseResult.Statements);

    // Only time the interpreter execution, not lexing/parsing/typechecking
    var sw = Stopwatch.StartNew();
    interpreter.Interpret(parseResult.Statements, typeResult.TypeMap);
    sw.Stop();
    executionMs = sw.ElapsedMilliseconds;

    WriteResponse(new WorkerResponse(errors.Count == 0, outputBuilder.ToString(), errors, executionMs));
    return 0;
}
catch (Exception ex)
{
    errors.Add(new WorkerError(ex.Message));
    WriteResponse(new WorkerResponse(false, outputBuilder.ToString(), errors, executionMs));
    return 0;
}

void WriteResponse(WorkerResponse response)
{
    // Write to the saved real stdout, not the redirected Console.Out
    realStdout.WriteLine(JsonSerializer.Serialize(response));
    realStdout.Flush();
}

record WorkerRequest(string Source, int TimeoutMs, string? Mode = null);
record WorkerResponse(bool Success, string Output, List<WorkerError> Errors, long ExecutionTimeMs, long? CompileTimeMs = null);
record WorkerError(string Message);
