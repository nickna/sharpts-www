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
$siteGenerator = Join-Path $repoRoot "src/SharpTS.Www.SelfHost/generate-site.ts"
$packageLock = Join-Path $repoRoot "package-lock.json"
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

    if (-not (Test-Path -LiteralPath $packageLock -PathType Leaf)) {
        throw "Browser dependency lockfile is missing."
    }
    & npm ci
    if ($LASTEXITCODE -ne 0) {
        throw "Browser dependency restore failed."
    }

    $browserOutput = Join-Path $staging "browser-assets"
    $previousBrowserOutput = $env:SHARPTS_WWW_BROWSER_OUTPUT
    try {
        $env:SHARPTS_WWW_BROWSER_OUTPUT = $browserOutput
        & npm run build:browser
        if ($LASTEXITCODE -ne 0 -or
            -not (Test-Path -LiteralPath (Join-Path $browserOutput "site.js")) -or
            -not (Test-Path -LiteralPath (Join-Path $browserOutput "site.css"))) {
            throw "Browser asset build failed."
        }
    }
    finally {
        if ($null -eq $previousBrowserOutput) {
            Remove-Item Env:SHARPTS_WWW_BROWSER_OUTPUT -ErrorAction SilentlyContinue
        } else {
            $env:SHARPTS_WWW_BROWSER_OUTPUT = $previousBrowserOutput
        }
    }

    $publicOutput = Join-Path $staging "public"
    $previousRepoRoot = $env:SHARPTS_WWW_SITE_REPO_ROOT
    $previousSiteOutput = $env:SHARPTS_WWW_SITE_OUTPUT
    try {
        $env:SHARPTS_WWW_SITE_REPO_ROOT = $repoRoot
        $env:SHARPTS_WWW_SITE_OUTPUT = $publicOutput
        $env:SHARPTS_WWW_BROWSER_OUTPUT = $browserOutput
        $siteGenerationOutput = & dotnet run --project $project -c $Configuration `
            --no-launch-profile -- $siteGenerator 2>&1
        $siteGenerationExitCode = $LASTEXITCODE
        $siteGenerationOutput | ForEach-Object { Write-Host $_ }
        $siteGenerationText = $siteGenerationOutput -join [Environment]::NewLine
        if ($siteGenerationExitCode -ne 0 -or
            -not $siteGenerationText.Contains("Generated 10 localized static pages") -or
            -not (Test-Path -LiteralPath (Join-Path $publicOutput "site-manifest.json"))) {
            throw "SharpTS static-site generation failed."
        }
    }
    finally {
        if ($null -eq $previousRepoRoot) {
            Remove-Item Env:SHARPTS_WWW_SITE_REPO_ROOT -ErrorAction SilentlyContinue
        } else {
            $env:SHARPTS_WWW_SITE_REPO_ROOT = $previousRepoRoot
        }
        if ($null -eq $previousSiteOutput) {
            Remove-Item Env:SHARPTS_WWW_SITE_OUTPUT -ErrorAction SilentlyContinue
        } else {
            $env:SHARPTS_WWW_SITE_OUTPUT = $previousSiteOutput
        }
        if ($null -eq $previousBrowserOutput) {
            Remove-Item Env:SHARPTS_WWW_BROWSER_OUTPUT -ErrorAction SilentlyContinue
        } else {
            $env:SHARPTS_WWW_BROWSER_OUTPUT = $previousBrowserOutput
        }
    }

    Remove-Item -LiteralPath $browserOutput -Recurse -Force

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
