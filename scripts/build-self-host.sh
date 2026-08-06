#!/usr/bin/env bash
set -euo pipefail

CONFIGURATION="${1:-Release}"
SHARPTS_PROJECT="${2:-lib/SharpTS/SharpTS.csproj}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

exec node "$REPO_ROOT/scripts/build-self-host.mjs" \
    --configuration "$CONFIGURATION" \
    --sharpts-project "$SHARPTS_PROJECT"
