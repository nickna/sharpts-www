#!/usr/bin/env bash
set -euo pipefail

CONFIGURATION="${1:-Release}"
SHARPTS_PROJECT="${2:-lib/SharpTS/SharpTS.csproj}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

EXTRA_ARGS=()
if [ "${SHARPTS_WWW_ALLOW_DIRTY_SHARPTS:-false}" = "true" ]; then
    EXTRA_ARGS+=(--allow-dirty-sharpts)
fi

exec node "$REPO_ROOT/scripts/build-self-host.mjs" \
    --configuration "$CONFIGURATION" \
    --sharpts-project "$SHARPTS_PROJECT" \
    "${EXTRA_ARGS[@]}"
