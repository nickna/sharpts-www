using System.Diagnostics;
using System.Text.Json;

public sealed class TypeScriptExecutionService
{
    private const int MaxSourceLength = 10 * 1024; // 10KB
    private const int MaxTimeoutMs = 10_000; // 10 seconds
    private const long MaxMemoryBytes = 150 * 1024 * 1024; // 150MB
    private const int MemoryPollIntervalMs = 500;

    private readonly SemaphoreSlim _semaphore = new(3, 3);
    private readonly string _workerPath;
    private readonly ILogger<TypeScriptExecutionService> _logger;

    public TypeScriptExecutionService(IConfiguration configuration, ILogger<TypeScriptExecutionService> logger)
    {
        _workerPath = configuration["Worker:ExecutablePath"]
            ?? throw new InvalidOperationException("Worker:ExecutablePath configuration is required.");
        _logger = logger;
    }

    /// <summary>
    /// Returns null when all worker slots are busy (caller should return 503).
    /// </summary>
    public async Task<RunResponse?> ExecuteAsync(string source, int timeoutMs, string? mode = null, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(source))
            return new RunResponse(false, "", [new ErrorInfo("Source code cannot be empty.", null, null)], 0);

        if (source.Length > MaxSourceLength)
            return new RunResponse(false, "", [new ErrorInfo($"Source code exceeds maximum length of {MaxSourceLength} bytes.", null, null)], 0);

        mode = string.IsNullOrWhiteSpace(mode) ? "interpret" : mode.ToLowerInvariant();
        if (mode is not ("interpret" or "compile"))
            return new RunResponse(false, "", [new ErrorInfo("Mode must be 'interpret' or 'compile'.", null, null)], 0);

        timeoutMs = Math.Clamp(timeoutMs, 100, MaxTimeoutMs);

        if (!await _semaphore.WaitAsync(TimeSpan.FromSeconds(2), cancellationToken))
            return null; // All slots busy — signal 503

        try
        {
            return await RunWorkerAsync(source, timeoutMs, mode, cancellationToken);
        }
        finally
        {
            _semaphore.Release();
        }
    }

    private async Task<RunResponse> RunWorkerAsync(string source, int timeoutMs, string mode, CancellationToken cancellationToken)
    {
        var sw = Stopwatch.StartNew();

        var psi = new ProcessStartInfo
        {
            FileName = _workerPath,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        // Sanitize environment — prevent process.env from leaking secrets
        psi.Environment.Clear();
        psi.Environment["DOTNET_ENVIRONMENT"] = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT") ?? "Production";

        Process process;
        try
        {
            process = Process.Start(psi)!;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start worker process at {Path}", _workerPath);
            return new RunResponse(false, "", [new ErrorInfo("Internal server error: failed to start worker.", null, null)], 0);
        }

        using (process)
        {
            // Write request to stdin, then close it
            var request = JsonSerializer.Serialize(new { Source = source, TimeoutMs = timeoutMs, Mode = mode });
            await process.StandardInput.WriteLineAsync(request);
            process.StandardInput.Close();

            // Start reading stdout/stderr concurrently
            var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);

            // Monitor memory + enforce timeout
            var killTimeoutMs = timeoutMs + 1000; // 1s buffer beyond the requested timeout
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(killTimeoutMs);

            bool killedForTimeout = false;
            bool killedForMemory = false;

            try
            {
                // Poll memory while waiting for exit
                while (!process.HasExited)
                {
                    try
                    {
                        process.Refresh();
                        if (process.WorkingSet64 > MaxMemoryBytes)
                        {
                            killedForMemory = true;
                            KillProcess(process);
                            break;
                        }
                    }
                    catch (InvalidOperationException)
                    {
                        // Process already exited
                        break;
                    }

                    try
                    {
                        await Task.Delay(MemoryPollIntervalMs, timeoutCts.Token);
                    }
                    catch (OperationCanceledException)
                    {
                        if (cancellationToken.IsCancellationRequested)
                            throw;

                        // Timeout fired
                        if (!process.HasExited)
                        {
                            killedForTimeout = true;
                            KillProcess(process);
                        }
                        break;
                    }
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                KillProcess(process);
                throw;
            }

            // Ensure process has exited
            try
            {
                await process.WaitForExitAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                KillProcess(process);
                throw;
            }

            sw.Stop();

            if (killedForMemory)
            {
                return new RunResponse(false, "",
                    [new ErrorInfo("Execution terminated: memory limit exceeded (150MB).", null, null)],
                    sw.ElapsedMilliseconds);
            }

            if (killedForTimeout)
            {
                return new RunResponse(false, "",
                    [new ErrorInfo($"Execution timed out after {timeoutMs}ms.", null, null)],
                    sw.ElapsedMilliseconds);
            }

            // Read stdout for the JSON response
            string stdout;
            try
            {
                stdout = await stdoutTask;
            }
            catch
            {
                stdout = "";
            }

            if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(stdout))
            {
                // Worker crashed (e.g. StackOverflowException, process.exit())
                string stderr;
                try { stderr = await stderrTask; } catch { stderr = ""; }

                var message = process.ExitCode switch
                {
                    -1073741571 => "Execution terminated: stack overflow.", // 0xC00000FD
                    _ when !string.IsNullOrWhiteSpace(stderr) => $"Execution error: {stderr.Trim()[..Math.Min(stderr.Trim().Length, 500)]}",
                    // Compiled guest code calling process.exit() exits the worker directly,
                    // so no JSON response is ever written.
                    _ when mode == "compile" => $"Program terminated the process (exit code {process.ExitCode}), e.g. via process.exit().",
                    _ => $"Execution terminated unexpectedly (exit code {process.ExitCode}).",
                };

                return new RunResponse(false, "", [new ErrorInfo(message, null, null)], sw.ElapsedMilliseconds);
            }

            // Parse worker response
            try
            {
                var workerResponse = JsonSerializer.Deserialize<WorkerResponse>(stdout.Trim());
                if (workerResponse is null)
                    return new RunResponse(false, "", [new ErrorInfo("Invalid worker response.", null, null)], sw.ElapsedMilliseconds);

                var errors = workerResponse.Errors
                    .Select(e => new ErrorInfo(SanitizeNetworkBlock(e.Message), null, null))
                    .ToList();

                return new RunResponse(workerResponse.Success, SanitizeNetworkBlock(workerResponse.Output), errors, workerResponse.ExecutionTimeMs, workerResponse.CompileTimeMs);
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Failed to parse worker response: {Stdout}", stdout[..Math.Min(stdout.Length, 200)]);
                return new RunResponse(false, "", [new ErrorInfo("Internal error: invalid worker response.", null, null)], sw.ElapsedMilliseconds);
            }
        }
    }

    // The worker forces fetch() through a dead proxy at sharpts-network-blocked.invalid
    // (see Worker/Program.cs). When guest code attempts a network call, the engine's
    // failure message names that sentinel host; rewrite it into a clear explanation so
    // the playground shows intent rather than a confusing proxy/DNS error. This is
    // cosmetic — the block itself is enforced in the worker, not here.
    private const string NetworkBlockSentinel = "sharpts-network-blocked.invalid";

    private static string SanitizeNetworkBlock(string text)
    {
        if (string.IsNullOrEmpty(text) || !text.Contains(NetworkBlockSentinel, StringComparison.Ordinal))
            return text;

        return "Network access is disabled in the SharpTS playground. fetch() and other outbound requests are blocked.";
    }

    private void KillProcess(Process process)
    {
        try
        {
            process.Kill(entireProcessTree: true);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to kill worker process {Pid}", process.Id);
        }
    }

    private record WorkerResponse(bool Success, string Output, List<WorkerError> Errors, long ExecutionTimeMs, long? CompileTimeMs = null);
    private record WorkerError(string Message);
}
