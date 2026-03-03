#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPHOST_PROJECT="$REPO_ROOT/src/SharpTS.Www.AppHost/SharpTS.Www.AppHost.csproj"

# Check for the .NET dev certificate
echo "Checking for HTTPS developer certificate..."
if ! dotnet dev-certs https --check --trust 2>/dev/null; then
    echo "Trusted HTTPS developer certificate not found. Installing..."
    dotnet dev-certs https --trust
fi
echo "Developer certificate is ready."

# Build
echo ""
echo "Building the Aspire AppHost..."
dotnet build "$APPHOST_PROJECT" -c Debug

# Run
echo ""
echo "Starting the Aspire AppHost..."
dotnet run --project "$APPHOST_PROJECT" -c Debug
