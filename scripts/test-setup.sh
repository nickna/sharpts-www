#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
setup_script="$repo_root/setup.sh"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/sharpts-setup-tests.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

mock_bin="$scratch/mock-bin"
fixtures="$scratch/fixtures"
mkdir -p "$mock_bin" "$fixtures"

fail() {
    printf 'FAIL: %s\n' "$*" >&2
    exit 1
}

assert_contains() {
    local value="$1"
    local expected="$2"
    [[ "$value" == *"$expected"* ]] || fail "Expected output to contain '$expected'. Output was:\n$value"
}

assert_not_contains() {
    local value="$1"
    local unexpected="$2"
    [[ "$value" != *"$unexpected"* ]] || fail "Expected output not to contain '$unexpected'. Output was:\n$value"
}

assert_file() {
    [[ -f "$1" ]] || fail "Expected file $1"
}

assert_absent() {
    [[ ! -e "$1" && ! -L "$1" ]] || fail "Expected $1 to be absent"
}

make_archive() {
    local version="$1"
    local kind="$2"
    local root="$fixtures/$version-$kind"
    mkdir -p "$root"
    cat >"$root/sharpts" <<EOF
#!/bin/sh
if [ "\${1:-}" = "--version" ]; then
    printf 'sharpts $version\\n'
    exit 0
fi
printf 'SharpTS fixture $version\\n'
EOF
    printf 'fixture license\n' >"$root/LICENSE"
    printf 'fixture readme\n' >"$root/README.md"
    chmod +x "$root/sharpts"
    tar -C "$root" -czf "$fixtures/$version-$kind.tar.gz" .
}

make_archive 1.2.3 native
make_archive 1.2.3 managed
make_archive 1.3.0 native
make_archive 1.3.0 managed
mkdir -p "$fixtures/bad-archive"
cp "$fixtures/1.2.3-native/sharpts" "$fixtures/bad-archive/sharpts"
printf 'unexpected\n' >"$fixtures/bad-archive/outside.txt"
tar -C "$fixtures/bad-archive" -czf "$fixtures/1.2.3-bad.tar.gz" .

cat >"$mock_bin/uname" <<'EOF'
#!/bin/sh
case "${1:-}" in
    -s) printf '%s\n' "${MOCK_UNAME_S:-Linux}" ;;
    -m) printf '%s\n' "${MOCK_UNAME_M:-x86_64}" ;;
    *) exit 1 ;;
esac
EOF

cat >"$mock_bin/dotnet" <<'EOF'
#!/bin/sh
case "${1:-}" in
    --list-sdks)
        [ -z "${MOCK_DOTNET_SDKS:-}" ] || printf '%b\n' "$MOCK_DOTNET_SDKS"
        ;;
    --list-runtimes)
        [ -z "${MOCK_DOTNET_RUNTIMES:-}" ] || printf '%b\n' "$MOCK_DOTNET_RUNTIMES"
        ;;
    tool)
        if [ "${2:-}" = "list" ]; then
            printf 'Package Id Version Commands\n'
            if [ -n "${MOCK_DOTNET_TOOL_VERSION:-}" ]; then
                printf 'sharpts %s sharpts\n' "$MOCK_DOTNET_TOOL_VERSION"
            fi
        else
            printf '%s\n' "$*" >>"$MOCK_COMMAND_LOG"
        fi
        ;;
    *) exit 1 ;;
esac
EOF

cat >"$mock_bin/brew" <<'EOF'
#!/bin/sh
case "${1:-}" in
    list)
        if [ "${2:-}" = "--formula" ]; then
            [ "${MOCK_BREW_INSTALLED:-false}" = "true" ]
        elif [ "${2:-}" = "--versions" ] && [ "${MOCK_BREW_INSTALLED:-false}" = "true" ]; then
            printf 'sharpts %s\n' "${MOCK_BREW_VERSION:-1.2.3}"
        else
            exit 1
        fi
        ;;
    --prefix) printf '/mockbrew\n' ;;
    upgrade|uninstall) printf '%s\n' "$*" >>"$MOCK_COMMAND_LOG" ;;
    *) exit 1 ;;
esac
EOF

cat >"$mock_bin/curl" <<'EOF'
#!/bin/sh
output=""
url=""
while [ "$#" -gt 0 ]; do
    case "$1" in
        --output)
            output="$2"
            shift 2
            ;;
        --header|--user-agent)
            shift 2
            ;;
        --fail|--silent|--show-error|--location)
            shift
            ;;
        *)
            url="$1"
            shift
            ;;
    esac
done
printf 'curl %s\n' "$url" >>"$MOCK_COMMAND_LOG"

if [ -n "$output" ]; then
    case "$url" in
        *sharpts-native-1.2.3-*)
            if [ "${MOCK_BAD_ARCHIVE:-false}" = "true" ]; then
                source_file="$MOCK_FIXTURES/1.2.3-bad.tar.gz"
            else
                source_file="$MOCK_FIXTURES/1.2.3-native.tar.gz"
            fi
            ;;
        *sharpts-native-1.3.0-*) source_file="$MOCK_FIXTURES/1.3.0-native.tar.gz" ;;
        *sharpts-1.2.3-*) source_file="$MOCK_FIXTURES/1.2.3-managed.tar.gz" ;;
        *sharpts-1.3.0-*) source_file="$MOCK_FIXTURES/1.3.0-managed.tar.gz" ;;
        *) exit 22 ;;
    esac
    cp "$source_file" "$output"
    exit 0
fi

case "$url" in
    */releases/latest)
        printf '{"tag_name":"v1.2.3"}\n'
        ;;
    *'/releases?per_page=100')
        printf '[{"tag_name":"v1.3.0-rc.1"},{"tag_name":"v1.2.3"},{"tag_name":"v1.1.0"}]\n'
        ;;
    */releases/tags/v*)
        version=${url##*/v}
        if [ "${MOCK_BAD_ARCHIVE:-false}" = "true" ] && [ "$version" = "1.2.3" ]; then
            native_hash=$(sha256sum "$MOCK_FIXTURES/1.2.3-bad.tar.gz" | awk '{ print $1 }')
        else
            native_hash=$(sha256sum "$MOCK_FIXTURES/$version-native.tar.gz" | awk '{ print $1 }')
        fi
        managed_hash=$(sha256sum "$MOCK_FIXTURES/$version-managed.tar.gz" | awk '{ print $1 }')
        [ "${MOCK_BAD_DIGEST:-false}" != "true" ] || native_hash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
        printf '{"tag_name":"v%s","assets":[' "$version"
        printf '{"name":"sharpts-native-%s-linux-x64.tar.gz","digest":"sha256:%s"},' "$version" "$native_hash"
        printf '{"name":"sharpts-native-%s-linux-arm64.tar.gz","digest":"sha256:%s"},' "$version" "$native_hash"
        printf '{"name":"sharpts-native-%s-osx-arm64.tar.gz","digest":"sha256:%s"},' "$version" "$native_hash"
        printf '{"name":"sharpts-%s-linux-x64.tar.gz","digest":"sha256:%s"},' "$version" "$managed_hash"
        printf '{"name":"sharpts-%s-linux-arm64.tar.gz","digest":"sha256:%s"},' "$version" "$managed_hash"
        printf '{"name":"sharpts-%s-osx-arm64.tar.gz","digest":"sha256:%s"}' "$version" "$managed_hash"
        printf ']}\n'
        ;;
    *) exit 22 ;;
esac
EOF

chmod +x "$mock_bin"/*

case_number=0
new_case() {
    case_number=$((case_number + 1))
    CASE_ROOT="$scratch/case-$case_number"
    HOME="$CASE_ROOT/home"
    XDG_DATA_HOME="$CASE_ROOT/data"
    MOCK_COMMAND_LOG="$CASE_ROOT/commands.log"
    MOCK_UNAME_S="Linux"
    MOCK_UNAME_M="x86_64"
    MOCK_DOTNET_SDKS=""
    MOCK_DOTNET_RUNTIMES=""
    MOCK_DOTNET_TOOL_VERSION=""
    MOCK_BREW_INSTALLED="false"
    MOCK_BREW_VERSION=""
    MOCK_BAD_DIGEST="false"
    MOCK_BAD_ARCHIVE="false"
    MOCK_FIXTURES="$fixtures"
    mkdir -p "$HOME" "$XDG_DATA_HOME"
    : >"$MOCK_COMMAND_LOG"
    export HOME XDG_DATA_HOME MOCK_COMMAND_LOG MOCK_UNAME_S MOCK_UNAME_M
    export MOCK_DOTNET_SDKS MOCK_DOTNET_RUNTIMES MOCK_DOTNET_TOOL_VERSION
    export MOCK_BREW_INSTALLED MOCK_BREW_VERSION MOCK_BAD_DIGEST MOCK_BAD_ARCHIVE MOCK_FIXTURES
    PATH="$mock_bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    export PATH
}

run_setup() {
    local status
    if OUTPUT=$(sh "$setup_script" "$@" 2>&1); then
        status=0
    else
        status=$?
    fi
    STATUS=$status
}

run_setup_detached() {
    local status
    if OUTPUT=$(setsid sh "$setup_script" "$@" </dev/null 2>&1); then
        status=0
    else
        status=$?
    fi
    STATUS=$status
}

sh -n "$setup_script"

new_case
MOCK_UNAME_S="Darwin"
MOCK_UNAME_M="x86_64"
export MOCK_UNAME_S MOCK_UNAME_M
run_setup install --yes
[[ "$STATUS" -eq 1 ]] || fail "Intel macOS should be rejected"
assert_contains "$OUTPUT" "does not support x86_64 on Darwin"
assert_contains "$OUTPUT" "Linux / WSL"
run_setup list
[[ "$STATUS" -eq 1 ]] || fail "Version listing should also fail fast on an unsupported platform"
[[ ! -s "$MOCK_COMMAND_LOG" ]] || fail "Unsupported platforms should fail before network access"

new_case
run_setup list
[[ "$STATUS" -eq 0 ]] || fail "Stable version listing failed"
assert_contains "$OUTPUT" "1.2.3"
assert_not_contains "$OUTPUT" "1.3.0-rc.1"
run_setup list --prerelease
[[ "$STATUS" -eq 0 ]] || fail "Prerelease version listing failed"
assert_contains "$OUTPUT" "1.3.0-rc.1"

new_case
run_setup install --version 1.3.0-rc.1 --yes
[[ "$STATUS" -eq 1 ]] || fail "An explicit prerelease should require --prerelease"
assert_contains "$OUTPUT" "Add --prerelease"
run_setup install --bogus
[[ "$STATUS" -eq 1 ]] || fail "Unknown options should fail"
assert_contains "$OUTPUT" "Unknown argument"

new_case
run_setup_detached install --version 1.2.3
[[ "$STATUS" -eq 1 ]] || fail "A noninteractive install should require --yes (status $STATUS): $OUTPUT"
assert_contains "$OUTPUT" "Re-run with --yes"

new_case
MOCK_DOTNET_SDKS='9.0.100 [/mock/sdk]'
MOCK_DOTNET_RUNTIMES='Microsoft.NETCore.App 9.0.0 [/mock/runtime]'
export MOCK_DOTNET_SDKS MOCK_DOTNET_RUNTIMES
run_setup install --version 1.2.3 --yes
[[ "$STATUS" -eq 0 ]] || fail "Native install failed: $OUTPUT"
assert_contains "$OUTPUT" "Method: native"
assert_contains "$OUTPUT" "no .NET 10 or later SDK"
metadata="$XDG_DATA_HOME/sharpts/install.conf"
assert_file "$metadata"
grep -qx 'INSTALL_METHOD=native' "$metadata" || fail "Native metadata was not recorded"
[[ -L "$HOME/.local/bin/sharpts" ]] || fail "Native command link was not created"
[[ "$($HOME/.local/bin/sharpts --version)" = 'sharpts 1.2.3' ]] || fail "Installed native binary did not run"

run_setup install --yes
[[ "$STATUS" -eq 0 ]] || fail "Already-installed detection should be graceful"
assert_contains "$OUTPUT" "already installed"
assert_contains "$OUTPUT" "sh -s -- upgrade"

run_setup upgrade --version 1.3.0 --yes
[[ "$STATUS" -eq 0 ]] || fail "Native upgrade failed: $OUTPUT"
grep -qx 'VERSION=1.3.0' "$metadata" || fail "Upgrade metadata was not updated"
[[ "$($HOME/.local/bin/sharpts --version)" = 'sharpts 1.3.0' ]] || fail "Upgraded binary did not run"
assert_absent "$XDG_DATA_HOME/sharpts/versions/1.2.3-native"

run_setup remove --yes
[[ "$STATUS" -eq 0 ]] || fail "Native removal failed: $OUTPUT"
assert_absent "$metadata"
assert_absent "$HOME/.local/bin/sharpts"

new_case
MOCK_DOTNET_SDKS='10.0.100 [/mock/sdk]'
export MOCK_DOTNET_SDKS
run_setup install --version 1.2.3 --yes
[[ "$STATUS" -eq 0 ]] || fail ".NET tool install failed: $OUTPUT"
assert_contains "$OUTPUT" "Method: dotnet"
grep -Fqx 'tool install --global SharpTS --version 1.2.3' "$MOCK_COMMAND_LOG" ||
    fail "dotnet tool install was not invoked correctly"

new_case
MOCK_DOTNET_SDKS='10.0.100 [/mock/sdk]'
MOCK_DOTNET_TOOL_VERSION='1.2.3'
export MOCK_DOTNET_SDKS MOCK_DOTNET_TOOL_VERSION
run_setup upgrade --version 1.3.0 --yes
[[ "$STATUS" -eq 0 ]] || fail ".NET tool upgrade failed: $OUTPUT"
grep -Fqx 'tool update --global SharpTS --version 1.3.0' "$MOCK_COMMAND_LOG" ||
    fail "dotnet tool update was not invoked correctly"
run_setup remove --yes
[[ "$STATUS" -eq 0 ]] || fail ".NET tool removal failed: $OUTPUT"
grep -Fqx 'tool uninstall --global SharpTS' "$MOCK_COMMAND_LOG" ||
    fail "dotnet tool uninstall was not invoked correctly"

new_case
MOCK_BREW_INSTALLED='true'
MOCK_BREW_VERSION='1.2.3'
export MOCK_BREW_INSTALLED MOCK_BREW_VERSION
run_setup upgrade --yes
[[ "$STATUS" -eq 0 ]] || fail "Homebrew upgrade failed: $OUTPUT"
grep -Fqx 'upgrade sharpts' "$MOCK_COMMAND_LOG" || fail "brew upgrade was not preserved"
run_setup remove --yes
[[ "$STATUS" -eq 0 ]] || fail "Homebrew removal failed: $OUTPUT"
grep -Fqx 'uninstall sharpts' "$MOCK_COMMAND_LOG" || fail "brew uninstall was not preserved"

new_case
extra_bin="$CASE_ROOT/unmanaged-bin"
mkdir -p "$extra_bin"
cat >"$extra_bin/sharpts" <<'EOF'
#!/bin/sh
printf 'sharpts 0.9.0\n'
EOF
chmod +x "$extra_bin/sharpts"
PATH="$extra_bin:$PATH"
export PATH
run_setup upgrade --yes
[[ "$STATUS" -eq 1 ]] || fail "An unmanaged installation should be rejected"
assert_contains "$OUTPUT" "not managed by setup.sh, dotnet, or Homebrew"

new_case
MOCK_DOTNET_TOOL_VERSION='1.2.3'
export MOCK_DOTNET_TOOL_VERSION
mkdir -p "$XDG_DATA_HOME/sharpts"
cat >"$XDG_DATA_HOME/sharpts/install.conf" <<EOF
INSTALL_METHOD=native
VERSION=1.2.3
RID=linux-x64
EXECUTABLE=$XDG_DATA_HOME/sharpts/versions/1.2.3-native/sharpts
EOF
run_setup upgrade --yes
[[ "$STATUS" -eq 1 ]] || fail "Conflicting managers should be rejected"
assert_contains "$OUTPUT" "Multiple SharpTS installations"

new_case
MOCK_BAD_DIGEST='true'
export MOCK_BAD_DIGEST
run_setup install --method native --version 1.2.3 --yes
[[ "$STATUS" -eq 1 ]] || fail "A digest mismatch should fail"
assert_contains "$OUTPUT" "SHA-256 verification failed"
assert_absent "$XDG_DATA_HOME/sharpts/install.conf"

new_case
MOCK_BAD_ARCHIVE='true'
export MOCK_BAD_ARCHIVE
run_setup install --method native --version 1.2.3 --yes
[[ "$STATUS" -eq 1 ]] || fail "An archive with an unexpected path should fail"
assert_contains "$OUTPUT" "unexpected path"
assert_absent "$XDG_DATA_HOME/sharpts/install.conf"

new_case
mkdir -p "$HOME/.local/bin"
printf 'user-owned command\n' >"$HOME/.local/bin/sharpts"
run_setup install --method native --version 1.2.3 --yes
[[ "$STATUS" -eq 1 ]] || fail "A user-owned command path should not be overwritten"
assert_contains "$OUTPUT" "not an installer-owned symbolic link"
grep -qx 'user-owned command' "$HOME/.local/bin/sharpts" || fail "User-owned command was modified"
assert_absent "$XDG_DATA_HOME/sharpts/install.conf"

new_case
external_payload="$CASE_ROOT/external/sharpts"
mkdir -p "$(dirname "$external_payload")" "$XDG_DATA_HOME/sharpts"
printf 'preserve me\n' >"$external_payload"
cat >"$XDG_DATA_HOME/sharpts/install.conf" <<EOF
INSTALL_METHOD=native
VERSION=1.2.3
RID=linux-x64
EXECUTABLE=$external_payload
EOF
run_setup remove --yes
[[ "$STATUS" -eq 1 ]] || fail "Unsafe installer metadata should be rejected"
assert_contains "$OUTPUT" "unsafe executable path"
assert_file "$external_payload"

new_case
MOCK_UNAME_M='aarch64'
export MOCK_UNAME_M
run_setup install --method native --version 1.2.3 --yes
[[ "$STATUS" -eq 0 ]] || fail "Linux arm64 selection failed: $OUTPUT"
assert_contains "$(cat "$MOCK_COMMAND_LOG")" 'sharpts-native-1.2.3-linux-arm64.tar.gz'

new_case
MOCK_UNAME_S='Darwin'
MOCK_UNAME_M='arm64'
export MOCK_UNAME_S MOCK_UNAME_M
run_setup install --method managed --version 1.2.3 --yes
[[ "$STATUS" -eq 0 ]] || fail "Managed macOS selection failed: $OUTPUT"
assert_contains "$(cat "$MOCK_COMMAND_LOG")" 'sharpts-1.2.3-osx-arm64.tar.gz'
grep -qx 'INSTALL_METHOD=managed' "$XDG_DATA_HOME/sharpts/install.conf" ||
    fail "Managed metadata was not recorded"

printf 'SharpTS setup.sh tests passed.\n'
