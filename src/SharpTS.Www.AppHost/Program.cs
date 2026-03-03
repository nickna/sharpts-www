var builder = DistributedApplication.CreateBuilder(args);

var api = builder.AddProject<Projects.SharpTS_Www_Api>("api");

builder.AddProject<Projects.SharpTS_Www_Web>("web")
    .WithExternalHttpEndpoints()
    .WithReference(api)
    .WaitFor(api);

builder.Build().Run();
