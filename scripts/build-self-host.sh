#!/usr/bin/env bash
set -euo pipefail

CONFIGURATION="${1:-Release}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_ROOT="$REPO_ROOT/artifacts"
OUTPUT="$ARTIFACT_ROOT/self-host"
STAGING="$ARTIFACT_ROOT/self-host-staging"
SOURCE="$REPO_ROOT/src/SharpTS.Www.SelfHost/server.ts"
SHARPTS_PROJECT="$REPO_ROOT/lib/SharpTS/SharpTS.csproj"
WORKER_PROJECT="$REPO_ROOT/src/SharpTS.Www.Worker/SharpTS.Www.Worker.csproj"
COMPILE_LOG="$STAGING/sharpts-compile.log"

mkdir -p "$ARTIFACT_ROOT"
rm -rf "$STAGING"
mkdir -p "$STAGING"

cleanup() {
    rm -rf "$STAGING"
}
trap cleanup EXIT

COMPILED_DLL="$STAGING/SharpTS.Www.SelfHost.dll"
set +e
dotnet run --project "$SHARPTS_PROJECT" -c "$CONFIGURATION" --no-launch-profile -- \
    --compile "$SOURCE" \
    --verify \
    -o "$COMPILED_DLL" 2>&1 | tee "$COMPILE_LOG"
COMPILE_EXIT=${PIPESTATUS[0]}
set -e

# SharpTS currently returns exit code zero for some compiler/verification
# diagnostics, so require its positive success markers as well as the DLL.
if [[ $COMPILE_EXIT -ne 0 ]] ||
   ! grep -Fq "Compiled to" "$COMPILE_LOG" ||
   ! grep -Fq "IL verification passed." "$COMPILE_LOG" ||
   [[ ! -f "$COMPILED_DLL" ]]; then
    echo "SharpTS self-host compilation or IL verification failed." >&2
    exit 1
fi
rm -f "$COMPILE_LOG"

dotnet publish "$WORKER_PROJECT" -c "$CONFIGURATION" \
    -o "$STAGING/worker" \
    "-p:SharpTSProjectReference=$SHARPTS_PROJECT"

mkdir -p "$STAGING/public"
cp -R "$REPO_ROOT/src/SharpTS.Www.SelfHost/public/." "$STAGING/public/"

rm -rf "$OUTPUT"
mv "$STAGING" "$OUTPUT"
trap - EXIT
echo "Self-host bundle ready at $OUTPUT"
