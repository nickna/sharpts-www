using Microsoft.Extensions.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

// Compute the worker executable path.
// The Worker project is built by the AppHost's project reference (see .csproj),
// but it's not an Aspire-managed service — the API spawns it per-request.
var workerProjectDir = Path.GetFullPath(
    Path.Combine(builder.AppHostDirectory, "..", "SharpTS.Www.Worker"));

var configuration = builder.Environment.IsDevelopment() ? "Debug" : "Release";
var workerExe = Path.Combine(workerProjectDir, "bin", configuration, "net10.0",
    OperatingSystem.IsWindows() ? "SharpTS.Www.Worker.exe" : "SharpTS.Www.Worker");

var api = builder.AddProject<Projects.SharpTS_Www_Api>("api")
    .WithEnvironment("Worker__ExecutablePath", workerExe);

builder.AddProject<Projects.SharpTS_Www_Web>("web")
    .WithExternalHttpEndpoints()
    .WithReference(api)
    .WaitFor(api);

builder.Build().Run();
