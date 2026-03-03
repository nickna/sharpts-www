$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppHostProject = Join-Path $RepoRoot 'src/SharpTS.Www.AppHost/SharpTS.Www.AppHost.csproj'

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
