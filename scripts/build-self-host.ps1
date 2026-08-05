param(
    [string]$Configuration = "Release",
    [string]$SharpTSProject = "lib/SharpTS/SharpTS.csproj"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$artifactRoot = Join-Path $repoRoot "artifacts"
$output = Join-Path $artifactRoot "self-host"
$staging = Join-Path $artifactRoot "self-host-staging"
$source = Join-Path $repoRoot "src/SharpTS.Www.SelfHost/server.ts"
$project = [IO.Path]::GetFullPath((Join-Path $repoRoot $SharpTSProject))
$workerProject = Join-Path $repoRoot "src/SharpTS.Www.Worker/SharpTS.Www.Worker.csproj"

New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
if ((Split-Path -Parent $staging) -ne $artifactRoot) {
    throw "Invalid self-host staging path: $staging"
}
if (Test-Path -LiteralPath $staging) {
    Remove-Item -LiteralPath $staging -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $staging | Out-Null

try {
    $compiledDll = Join-Path $staging "SharpTS.Www.SelfHost.dll"
    $compileOutput = & dotnet run --project $project -c $Configuration --no-launch-profile -- `
        --compile $source `
        --verify `
        -o $compiledDll 2>&1
    $compileExitCode = $LASTEXITCODE
    $compileOutput | ForEach-Object { Write-Host $_ }
    $compileText = $compileOutput -join [Environment]::NewLine

    # SharpTS currently returns exit code zero for some compiler/verification
    # diagnostics, so require its positive success markers as well as the DLL.
    if ($compileExitCode -ne 0 -or
        -not $compileText.Contains("Compiled to") -or
        -not $compileText.Contains("IL verification passed.") -or
        -not (Test-Path -LiteralPath $compiledDll)) {
        throw "SharpTS self-host compilation or IL verification failed."
    }

    $workerOutput = Join-Path $staging "worker"
    & dotnet publish $workerProject -c $Configuration -o $workerOutput `
        "-p:SharpTSProjectReference=$project"
    if ($LASTEXITCODE -ne 0) {
        throw "SharpTS playground worker publish failed."
    }

    $publicSource = Join-Path $repoRoot "src/SharpTS.Www.SelfHost/public"
    $publicOutput = Join-Path $staging "public"
    New-Item -ItemType Directory -Force -Path $publicOutput | Out-Null
    Copy-Item -Recurse -Force (Join-Path $publicSource "*") $publicOutput

    if (Test-Path -LiteralPath $output) {
        Remove-Item -LiteralPath $output -Recurse -Force
    }
    Move-Item -LiteralPath $staging -Destination $output
    Write-Host "Self-host bundle ready at $output"
}
finally {
    if (Test-Path -LiteralPath $staging) {
        Remove-Item -LiteralPath $staging -Recurse -Force
    }
}
