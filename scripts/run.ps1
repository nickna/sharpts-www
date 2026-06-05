$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppHostProject = Join-Path $RepoRoot 'src/SharpTS.Www.AppHost/SharpTS.Www.AppHost.csproj'
$SubmoduleProject = Join-Path $RepoRoot 'lib/SharpTS/SharpTS.csproj'

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

# Check for the .NET dev certificate
Write-Host 'Checking for HTTPS developer certificate...'
$certCheck = dotnet dev-certs https --check --trust 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Trusted HTTPS developer certificate not found. Installing...'
    dotnet dev-certs https --trust
    if ($LASTEXITCODE -ne 0) { throw 'Failed to trust the developer certificate.' }
}
Write-Host 'Developer certificate is ready.'

# Build
Write-Host ''
Write-Host 'Building the Aspire AppHost...'
dotnet build $AppHostProject -c Debug
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

# Run
Write-Host ''
Write-Host 'Starting the Aspire AppHost...'
dotnet run --project $AppHostProject -c Debug
