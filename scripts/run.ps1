$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppHostProject = Join-Path $RepoRoot 'src/SharpTS.Www.AppHost/SharpTS.Www.AppHost.csproj'
$SubmoduleProject = Join-Path $RepoRoot 'lib/SharpTS/SharpTS.csproj'
$BuildSelfHostScript = Join-Path $PSScriptRoot 'build-self-host.ps1'

# Ensure the SharpTS submodule is checked out. The Worker has a project reference to
# lib/SharpTS/SharpTS.csproj, so without it the build fails with MSB9008 / CS0246 'SharpTS'.
if (-not (Test-Path $SubmoduleProject)) {
    Write-Host 'SharpTS submodule is missing. Initializing it now...'
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'git is not on PATH, so the SharpTS submodule cannot be initialized. Install Git and re-run.'
    }
    git -C $RepoRoot submodule update --init --recursive
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
# starts. This keeps the dashboard useful during the migration without routing
# local requests through the legacy ASP.NET/Kestrel projects.
Write-Host ''
Write-Host 'Building the SharpTS self-host bundle...'
& $BuildSelfHostScript -Configuration Debug

# Build
Write-Host ''
Write-Host 'Building the Aspire AppHost...'
dotnet build $AppHostProject -c Debug
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

# Run
Write-Host ''
Write-Host 'Starting the SharpTS host with Aspire...'
dotnet run --project $AppHostProject -c Debug --no-build
