param(
    [string]$Configuration = 'Release',
    [string]$SharpTSProject = 'lib/SharpTS/SharpTS.csproj'
)

$ErrorActionPreference = 'Stop'
$orchestrator = Join-Path $PSScriptRoot 'build-self-host.mjs'
& node $orchestrator --configuration $Configuration --sharpts-project $SharpTSProject
if ($LASTEXITCODE -ne 0) {
    throw 'Self-host build failed.'
}
