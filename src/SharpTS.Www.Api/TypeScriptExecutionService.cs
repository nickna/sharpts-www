using System.Diagnostics;
using System.Text;
using SharpTS.Execution;
using SharpTS.Parsing;
using SharpTS.TypeSystem;

public sealed class TypeScriptExecutionService
{
    private const int MaxSourceLength = 10 * 1024; // 10KB
    private const int MaxOutputLength = 100 * 1024; // 100KB
    private const int MaxTimeoutMs = 10_000; // 10 seconds

    private readonly SemaphoreSlim _semaphore = new(1, 1);

    public async Task<RunResponse> ExecuteAsync(string source, int timeoutMs, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(source))
            return new RunResponse(false, "", [new ErrorInfo("Source code cannot be empty.", null, null)], 0);

        if (source.Length > MaxSourceLength)
            return new RunResponse(false, "", [new ErrorInfo($"Source code exceeds maximum length of {MaxSourceLength} bytes.", null, null)], 0);

        timeoutMs = Math.Clamp(timeoutMs, 100, MaxTimeoutMs);

        await _semaphore.WaitAsync(cancellationToken);
        try
        {
            return await Task.Run(() => ExecuteCore(source, timeoutMs), cancellationToken);
        }
        finally
        {
            _semaphore.Release();
        }
    }

    private RunResponse ExecuteCore(string source, int timeoutMs)
    {
        var errors = new List<ErrorInfo>();
        var outputBuilder = new StringBuilder();
        var sw = Stopwatch.StartNew();

        // Capture console output
        var originalOut = Console.Out;
        var originalError = Console.Error;
        using var outputWriter = new CappedStringWriter(outputBuilder, MaxOutputLength);
        Console.SetOut(outputWriter);
        Console.SetError(outputWriter);

        try
        {
            // Lexing
            var lexer = new Lexer(source);
            var tokens = lexer.ScanTokens();

            // Parsing
            var parser = new Parser(tokens, DecoratorMode.None);
            var parseResult = parser.Parse();

            if (!parseResult.IsSuccess)
            {
                foreach (var diagnostic in parseResult.Diagnostics)
                    errors.Add(new ErrorInfo(diagnostic.ToString(), null, null));
                if (parseResult.HitErrorLimit)
                    errors.Add(new ErrorInfo("Too many errors, stopping.", null, null));

                sw.Stop();
                return new RunResponse(false, outputBuilder.ToString(), errors, sw.ElapsedMilliseconds);
            }

            // Type checking
            var checker = new TypeChecker();
            checker.SetDecoratorMode(DecoratorMode.None);
            var typeResult = checker.CheckWithRecovery(parseResult.Statements);

            if (!typeResult.IsSuccess)
            {
                foreach (var diagnostic in typeResult.Diagnostics)
                    errors.Add(new ErrorInfo(diagnostic.ToString(), null, null));
                if (typeResult.HitErrorLimit)
                    errors.Add(new ErrorInfo("Too many errors, stopping.", null, null));

                sw.Stop();
                return new RunResponse(false, outputBuilder.ToString(), errors, sw.ElapsedMilliseconds);
            }

            // Execution with timeout
            using var cts = new CancellationTokenSource(timeoutMs);
            using var interpreter = new Interpreter();
            interpreter.SetDecoratorMode(DecoratorMode.None);

            var resolver = new VariableResolver(interpreter);
            resolver.Resolve(parseResult.Statements);

            var executionTask = Task.Run(() =>
            {
                interpreter.Interpret(parseResult.Statements, typeResult.TypeMap);
            }, cts.Token);

            if (!executionTask.Wait(timeoutMs))
            {
                sw.Stop();
                errors.Add(new ErrorInfo($"Execution timed out after {timeoutMs}ms.", null, null));
                return new RunResponse(false, outputBuilder.ToString(), errors, sw.ElapsedMilliseconds);
            }

            if (executionTask.IsFaulted)
            {
                var ex = executionTask.Exception?.InnerException;
                errors.Add(new ErrorInfo(ex?.Message ?? "Unknown execution error.", null, null));
                sw.Stop();
                return new RunResponse(false, outputBuilder.ToString(), errors, sw.ElapsedMilliseconds);
            }

            sw.Stop();
            return new RunResponse(errors.Count == 0, outputBuilder.ToString(), errors, sw.ElapsedMilliseconds);
        }
        catch (OperationCanceledException)
        {
            sw.Stop();
            errors.Add(new ErrorInfo($"Execution timed out after {timeoutMs}ms.", null, null));
            return new RunResponse(false, outputBuilder.ToString(), errors, sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            sw.Stop();
            errors.Add(new ErrorInfo(ex.Message, null, null));
            return new RunResponse(false, outputBuilder.ToString(), errors, sw.ElapsedMilliseconds);
        }
        finally
        {
            Console.SetOut(originalOut);
            Console.SetError(originalError);
        }
    }
}

/// <summary>
/// A StringWriter that caps output at a maximum length to prevent memory exhaustion.
/// </summary>
internal sealed class CappedStringWriter : StringWriter
{
    private readonly int _maxLength;
    private readonly StringBuilder _sb;
    private bool _capped;

    public CappedStringWriter(StringBuilder sb, int maxLength) : base(sb)
    {
        _sb = sb;
        _maxLength = maxLength;
    }

    public override void Write(char value)
    {
        if (_capped) return;
        if (_sb.Length >= _maxLength) { _capped = true; _sb.AppendLine("\n[Output truncated]"); return; }
        base.Write(value);
    }

    public override void Write(string? value)
    {
        if (_capped || value is null) return;
        if (_sb.Length + value.Length > _maxLength) { _capped = true; _sb.AppendLine("\n[Output truncated]"); return; }
        base.Write(value);
    }
}
