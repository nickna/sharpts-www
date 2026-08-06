#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPHOST_PROJECT="$REPO_ROOT/src/SharpTS.Www.AppHost/SharpTS.Www.AppHost.csproj"
SUBMODULE_PROJECT="$REPO_ROOT/lib/SharpTS/SharpTS.csproj"
BUILD_SELF_HOST_SCRIPT="$REPO_ROOT/scripts/build-self-host.sh"

# Ensure the SharpTS submodule is checked out. The nested conformance corpora
# are not website build inputs, so do not initialize them here.
if [ ! -f "$SUBMODULE_PROJECT" ]; then
    echo "SharpTS submodule is missing. Initializing it now..."
    git -C "$REPO_ROOT" submodule update --init lib/SharpTS
fi
echo "SharpTS submodule is present."

# The SharpTS resource uses HTTP, but the Aspire dashboard's existing launch
# profile uses HTTPS and therefore still needs the .NET development certificate.
echo "Checking the Aspire dashboard HTTPS development certificate..."
if ! dotnet dev-certs https --check --trust 2>/dev/null; then
    echo "Trusted HTTPS development certificate not found. Installing..."
    dotnet dev-certs https --trust
fi
echo "Aspire dashboard development certificate is ready."

# Compile the TypeScript HTTP host and publish its isolated worker before Aspire
# starts. The website request path has no ASP.NET/Kestrel host.
echo ""
echo "Building the SharpTS self-host bundle..."
bash "$BUILD_SELF_HOST_SCRIPT" Debug

# Build
echo ""
echo "Building the Aspire AppHost..."
dotnet build "$APPHOST_PROJECT" -c Debug

# Run
echo ""
echo "Starting the SharpTS host with Aspire..."
dotnet run --project "$APPHOST_PROJECT" -c Debug --no-build
