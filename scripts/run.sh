#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPHOST_PROJECT="$REPO_ROOT/src/SharpTS.Www.AppHost/SharpTS.Www.AppHost.csproj"
SUBMODULE_PROJECT="$REPO_ROOT/lib/SharpTS/SharpTS.csproj"

# Ensure the SharpTS submodule is checked out. The Worker has a project reference to
# lib/SharpTS/SharpTS.csproj, so without it the build fails with MSB9008 / CS0246 'SharpTS'.
if [ ! -f "$SUBMODULE_PROJECT" ]; then
    echo "SharpTS submodule is missing. Initializing it now..."
    git -C "$REPO_ROOT" submodule update --init --recursive
fi
echo "SharpTS submodule is present."

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
