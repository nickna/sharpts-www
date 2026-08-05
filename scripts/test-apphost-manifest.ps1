param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$appHostAssembly = Join-Path $repoRoot (
    "src/SharpTS.Www.AppHost/bin/$Configuration/net10.0/SharpTS.Www.AppHost.dll")

if (-not (Test-Path $appHostAssembly)) {
    throw "The AppHost assembly is missing: $appHostAssembly. Build the AppHost first."
}

$manifestPath = Join-Path ([IO.Path]::GetTempPath()) (
    "sharpts-www-apphost-manifest-$PID-$([Guid]::NewGuid().ToString('N')).json")

try {
    dotnet $appHostAssembly --publisher manifest --output-path $manifestPath
    if ($LASTEXITCODE -ne 0) {
        throw "Aspire manifest generation failed with exit code $LASTEXITCODE."
    }

    $manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json -Depth 20
    $resourceNames = @($manifest.resources.PSObject.Properties.Name)
    if ($resourceNames.Count -ne 1 -or $resourceNames[0] -ne 'sharpts-www') {
        throw "Expected only the sharpts-www resource, found: $($resourceNames -join ', ')."
    }

    $website = $manifest.resources.'sharpts-www'
    if ($website.type -ne 'executable.v0') {
        throw "Expected sharpts-www to be an executable resource, found '$($website.type)'."
    }
    if ($website.bindings.http.scheme -ne 'http' -or
        $website.bindings.http.external -ne $true) {
        throw 'Expected an externally visible HTTP binding for sharpts-www.'
    }
    if ($website.env.PORT -ne '{sharpts-www.bindings.http.targetPort}') {
        throw 'PORT must resolve to the private listener port allocated by Aspire.'
    }
    if ($website.env.SHARPTS_WWW_PUBLIC_ORIGIN -ne '{sharpts-www.bindings.http.url}') {
        throw 'SHARPTS_WWW_PUBLIC_ORIGIN must resolve to the public Aspire proxy URL.'
    }

    Write-Host 'Aspire manifest passed: one SharpTS executable with private PORT and public origin wiring.'
}
finally {
    if (Test-Path $manifestPath) {
        Remove-Item -LiteralPath $manifestPath -Force
    }
}
