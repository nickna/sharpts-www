#!/usr/bin/env bash
set -euo pipefail

CONFIGURATION="${1:-Release}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_ROOT="$REPO_ROOT/artifacts"
OUTPUT="$ARTIFACT_ROOT/self-host"
STAGING="$ARTIFACT_ROOT/self-host-staging"
SOURCE="$REPO_ROOT/src/SharpTS.Www.SelfHost/server.ts"
SITE_GENERATOR="$REPO_ROOT/src/SharpTS.Www.SelfHost/generate-site.ts"
WORKER_SOURCE="$REPO_ROOT/src/SharpTS.Www.Worker/worker.ts"
SHARPTS_PROJECT="$REPO_ROOT/lib/SharpTS/SharpTS.csproj"
PACKAGE_LOCK="$REPO_ROOT/package-lock.json"
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

mkdir -p "$STAGING/worker"
WORKER_LOG="$STAGING/worker-compile.log"
set +e
dotnet run --project "$SHARPTS_PROJECT" -c "$CONFIGURATION" --no-launch-profile -- \
    --compile "$WORKER_SOURCE" \
    --target exe \
    --verify \
    -o "$STAGING/worker/SharpTS.Www.Worker" 2>&1 | tee "$WORKER_LOG"
WORKER_EXIT=${PIPESTATUS[0]}
set -e

if [[ $WORKER_EXIT -ne 0 ]] ||
   ! grep -Fq "Compiled to" "$WORKER_LOG" ||
   ! grep -Fq "IL verification passed." "$WORKER_LOG" ||
   [[ ! -f "$STAGING/worker/SharpTS.Www.Worker" ]] ||
   [[ ! -f "$STAGING/worker/SharpTS.dll" ]]; then
    echo "SharpTS TypeScript playground worker compilation failed." >&2
    exit 1
fi
rm -f "$WORKER_LOG"

BROWSER_OUTPUT="$STAGING/browser-assets"
if [[ ! -f "$PACKAGE_LOCK" ]]; then
    echo "Browser dependency lockfile is missing." >&2
    exit 1
fi
npm ci
SHARPTS_WWW_BROWSER_OUTPUT="$BROWSER_OUTPUT" npm run build:browser
test -f "$BROWSER_OUTPUT/site.js"
test -f "$BROWSER_OUTPUT/site.css"

SITE_GENERATION_LOG="$STAGING/site-generation.log"
set +e
SHARPTS_WWW_SITE_REPO_ROOT="$REPO_ROOT" \
SHARPTS_WWW_SITE_OUTPUT="$STAGING/public" \
SHARPTS_WWW_BROWSER_OUTPUT="$BROWSER_OUTPUT" \
dotnet run --project "$SHARPTS_PROJECT" -c "$CONFIGURATION" --no-launch-profile -- \
    "$SITE_GENERATOR" 2>&1 | tee "$SITE_GENERATION_LOG"
SITE_GENERATION_EXIT=${PIPESTATUS[0]}
set -e

if [[ $SITE_GENERATION_EXIT -ne 0 ]] ||
   ! grep -Fq "Generated localized static site" "$SITE_GENERATION_LOG" ||
   [[ ! -f "$STAGING/public/site-manifest.json" ]]; then
    echo "SharpTS static-site generation failed." >&2
    exit 1
fi
rm -f "$SITE_GENERATION_LOG"
rm -rf "$BROWSER_OUTPUT"

rm -rf "$OUTPUT"
mv "$STAGING" "$OUTPUT"
trap - EXIT
echo "Self-host bundle ready at $OUTPUT"
