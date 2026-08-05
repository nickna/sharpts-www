var builder = DistributedApplication.CreateBuilder(args);

// The local AppHost orchestrates the same compiled SharpTS server shape used by
// the production image. scripts/run.ps1 and scripts/run.sh create this bundle
// before starting Aspire so TypeScript changes cannot run as stale emitted IL.
var repoRoot = Path.GetFullPath(Path.Combine(builder.AppHostDirectory, "..", ".."));
var bundleDirectory = Path.Combine(repoRoot, "artifacts", "self-host");
var serverAssembly = Path.Combine(bundleDirectory, "SharpTS.Www.SelfHost.dll");
var publicDirectory = Path.Combine(bundleDirectory, "public");
var workerExecutable = Path.Combine(bundleDirectory, "worker",
    OperatingSystem.IsWindows() ? "SharpTS.Www.Worker.exe" : "SharpTS.Www.Worker");

if (!File.Exists(serverAssembly) || !File.Exists(workerExecutable))
{
    throw new InvalidOperationException(
        "The SharpTS self-host bundle is missing. Start the site with " +
        "scripts/run.ps1 (Windows) or scripts/run.sh (Linux/macOS)."
    );
}

builder.AddExecutable(
        "sharpts-www",
        "dotnet",
        bundleDirectory,
        serverAssembly)
    // Aspire allocates and proxies the local port, then supplies the listener's
    // target port through the same PORT variable used in production.
    .WithHttpEndpoint(env: "PORT")
    .WithExternalHttpEndpoints()
    .WithEnvironment("SHARPTS_WWW_HOST", "127.0.0.1")
    .WithEnvironment("SHARPTS_WWW_CONTENT_ROOT", publicDirectory)
    .WithEnvironment("SHARPTS_WWW_WORKER_PATH", workerExecutable)
    .WithEnvironment("SHARPTS_WWW_REQUIRE_RSS_MONITORING",
        OperatingSystem.IsLinux() ? "true" : "false")
    .WithHttpHealthCheck("/health");

builder.Build().Run();
