$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppHostProject = Join-Path $RepoRoot 'src/SharpTS.Www.AppHost/SharpTS.Www.AppHost.csproj'
$SubmoduleProject = Join-Path $RepoRoot 'lib/SharpTS/src/SharpTS/SharpTS.csproj'
$BuildSelfHostScript = Join-Path $PSScriptRoot 'build-self-host.ps1'

# Ensure the SharpTS submodule is checked out. Both the HTTP host and worker are
# compiled from TypeScript by lib/SharpTS/src/SharpTS/SharpTS.csproj.
if (-not (Test-Path $SubmoduleProject)) {
    Write-Host 'SharpTS submodule is missing. Initializing it now...'
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'git is not on PATH, so the SharpTS submodule cannot be initialized. Install Git and re-run.'
    }
    git -C $RepoRoot submodule update --init lib/SharpTS
    if ($LASTEXITCODE -ne 0) { throw 'Failed to initialize the SharpTS submodule.' }
    if (-not (Test-Path $SubmoduleProject)) { throw "Submodule initialized but $SubmoduleProject still missing." }
}
Write-Host 'SharpTS submodule is present.'

# The SharpTS resource uses HTTP, but the Aspire dashboard's existing launch
# profile uses HTTPS and therefore still needs the .NET development certificate.
Write-Host 'Checking the Aspire dashboard HTTPS development certificate...'
$certCheck = dotnet dev-certs https --check --trust 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Trusted HTTPS development certificate not found. Installing...'
    dotnet dev-certs https --trust
    if ($LASTEXITCODE -ne 0) { throw 'Failed to trust the HTTPS development certificate.' }
}
Write-Host 'Aspire dashboard development certificate is ready.'

# Compile the TypeScript HTTP host and publish its isolated worker before Aspire
# starts. This keeps the dashboard useful without introducing an ASP.NET/Kestrel
# website host into the request path.
Write-Host ''
Write-Host 'Building the SharpTS self-host bundle...'
# Local development commonly includes edits inside the SharpTS submodule. The
# standalone build and CI paths remain strict unless this switch is explicit.
& $BuildSelfHostScript -Configuration Debug -AllowDirtySharpTS

# Build
Write-Host ''
Write-Host 'Building the Aspire AppHost...'
dotnet build $AppHostProject -c Debug
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

# Run
Write-Host ''
Write-Host 'Starting the SharpTS host with Aspire...'
dotnet run --project $AppHostProject -c Debug --no-build
