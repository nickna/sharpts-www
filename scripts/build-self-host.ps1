param(
    [string]$Configuration = 'Release',
    [string]$SharpTSProject = 'lib/SharpTS/src/SharpTS/SharpTS.csproj',
    [switch]$AllowDirtySharpTS
)

$ErrorActionPreference = 'Stop'
$orchestrator = Join-Path $PSScriptRoot 'build-self-host.mjs'
$orchestratorArguments = @(
    $orchestrator,
    '--configuration', $Configuration,
    '--sharpts-project', $SharpTSProject
)
if ($AllowDirtySharpTS) {
    $orchestratorArguments += '--allow-dirty-sharpts'
}
& node @orchestratorArguments
if ($LASTEXITCODE -ne 0) {
    throw 'Self-host build failed.'
}
