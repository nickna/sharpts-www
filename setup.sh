#!/bin/sh

# Canonical SharpTS installer for Linux, WSL, and Apple Silicon macOS.
# This file is also published verbatim at https://sharpts.dev/setup.sh.

set -eu

PROGRAM_NAME="SharpTS setup"
GITHUB_REPOSITORY="nickna/SharpTS"
GITHUB_API="https://api.github.com/repos/$GITHUB_REPOSITORY"
GITHUB_DOWNLOADS="https://github.com/$GITHUB_REPOSITORY/releases/download"

ACTION="install"
ACTION_SET="false"
REQUESTED_VERSION=""
REQUESTED_METHOD="auto"
INCLUDE_PRERELEASE="false"
ASSUME_YES="false"

OS_NAME=""
ARCH_NAME=""
RID=""
DOTNET_STATE="none"
DETECTED_METHOD=""
DETECTED_VERSION=""
DETECTED_PATH=""
TEMP_ROOT=""
RESOLVED_VERSION=""
SELECTED_METHOD=""
ASSET_DIGEST=""
DOWNLOADED_ROOT=""

say() {
    printf '%s\n' "$*"
}

warn() {
    printf 'Warning: %s\n' "$*" >&2
}

fail() {
    printf 'Error: %s\n' "$*" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Install, upgrade, remove, or list SharpTS releases.

Usage:
  setup.sh [install] [options]
  setup.sh upgrade [options]
  setup.sh remove [options]
  setup.sh list [--prerelease]

Actions:
  install                 Install SharpTS (the default action)
  upgrade                 Upgrade the existing SharpTS installation
  remove                  Remove the existing SharpTS installation
  list                    List available SharpTS release versions

Options:
  --version <version>     Install or upgrade to an exact version
  --method <method>       Use dotnet, native, or managed
  --prerelease            Include prereleases when listing or selecting latest
  --yes, -y               Accept confirmation prompts
  --help, -h              Show this help

Examples:
  curl -fsSL https://sharpts.dev/setup.sh | sh
  curl -fsSL https://sharpts.dev/setup.sh | sh -s -- upgrade
  curl -fsSL https://sharpts.dev/setup.sh | sh -s -- install --method managed
  curl -fsSL https://sharpts.dev/setup.sh | sh -s -- list --prerelease

Supported platforms:
  Linux / WSL             x64, arm64
  macOS                   Apple Silicon (arm64)
EOF
}

set_action() {
    if [ "$ACTION_SET" = "true" ]; then
        fail "Only one action may be specified."
    fi
    ACTION="$1"
    ACTION_SET="true"
}

parse_arguments() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            install|upgrade|remove|list)
                set_action "$1"
                shift
                ;;
            --version)
                [ "$#" -ge 2 ] || fail "--version requires a value."
                REQUESTED_VERSION="$2"
                shift 2
                ;;
            --method)
                [ "$#" -ge 2 ] || fail "--method requires dotnet, native, or managed."
                REQUESTED_METHOD="$2"
                shift 2
                ;;
            --prerelease)
                INCLUDE_PRERELEASE="true"
                shift
                ;;
            --yes|-y)
                ASSUME_YES="true"
                shift
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            --)
                shift
                [ "$#" -eq 0 ] || fail "Unexpected argument: $1"
                ;;
            *)
                fail "Unknown argument: $1. Run with --help for usage."
                ;;
        esac
    done

    case "$REQUESTED_METHOD" in
        auto|dotnet|native|managed) ;;
        *) fail "Unknown installation method '$REQUESTED_METHOD'. Use dotnet, native, or managed." ;;
    esac

    if [ "$ACTION" = "remove" ]; then
        [ -z "$REQUESTED_VERSION" ] || fail "--version cannot be used with remove."
        [ "$INCLUDE_PRERELEASE" = "false" ] || fail "--prerelease cannot be used with remove."
    fi
    if [ "$ACTION" = "list" ]; then
        [ -z "$REQUESTED_VERSION" ] || fail "--version cannot be used with list."
        [ "$REQUESTED_METHOD" = "auto" ] || fail "--method cannot be used with list."
        [ "$ASSUME_YES" = "false" ] || fail "--yes cannot be used with list."
    fi
}

cleanup() {
    if [ -n "$TEMP_ROOT" ] && [ -d "$TEMP_ROOT" ]; then
        rm -rf "$TEMP_ROOT"
    fi
}

prepare_temporary_directory() {
    [ -n "$TEMP_ROOT" ] && return 0
    TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/sharpts-setup.XXXXXX") ||
        fail "Could not create a temporary directory."
    trap cleanup 0
    trap 'exit 130' 1 2 3 15
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "Required command '$1' was not found."
}

detect_platform() {
    require_command uname
    kernel=$(uname -s 2>/dev/null) || fail "Could not detect the operating system."
    machine=$(uname -m 2>/dev/null) || fail "Could not detect the processor architecture."

    case "$kernel" in
        Linux)
            OS_NAME="Linux"
            case "$machine" in
                x86_64|amd64) ARCH_NAME="x64"; RID="linux-x64" ;;
                aarch64|arm64) ARCH_NAME="arm64"; RID="linux-arm64" ;;
            esac
            ;;
        Darwin)
            OS_NAME="macOS"
            case "$machine" in
                arm64|aarch64) ARCH_NAME="arm64"; RID="osx-arm64" ;;
            esac
            ;;
    esac

    if [ -z "$RID" ]; then
        printf 'Error: SharpTS does not support %s on %s yet.\n\n' "$machine" "$kernel" >&2
        usage >&2
        exit 1
    fi
}

detect_dotnet() {
    DOTNET_STATE="none"
    command -v dotnet >/dev/null 2>&1 || return 0

    sdk_output=$(dotnet --list-sdks 2>/dev/null || true)
    if printf '%s\n' "$sdk_output" | awk '
        /^[[:space:]]*[0-9]+\./ {
            value=$1
            sub(/^[[:space:]]*/, "", value)
            split(value, parts, ".")
            if ((parts[1] + 0) >= 10) found=1
        }
        END { exit(found ? 0 : 1) }
    '; then
        DOTNET_STATE="sdk10"
        return 0
    fi

    runtime_output=$(dotnet --list-runtimes 2>/dev/null || true)
    if [ -n "$sdk_output" ] || [ -n "$runtime_output" ]; then
        DOTNET_STATE="older"
    else
        DOTNET_STATE="command-only"
    fi
}

data_root() {
    if [ -n "${XDG_DATA_HOME:-}" ]; then
        printf '%s/sharpts' "$XDG_DATA_HOME"
    else
        printf '%s/.local/share/sharpts' "$HOME"
    fi
}

bin_root() {
    printf '%s/.local/bin' "$HOME"
}

metadata_value() {
    key="$1"
    file="$2"
    [ -f "$file" ] || return 0
    sed -n "s/^${key}=//p" "$file" | sed -n '1p'
}

valid_version_text() {
    printf '%s\n' "$1" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
}

dotnet_tool_version() {
    command -v dotnet >/dev/null 2>&1 || return 0
    dotnet tool list --global 2>/dev/null | awk '
        tolower($1) == "sharpts" { print $2; exit }
    '
}

detect_installation() {
    DETECTED_METHOD=""
    DETECTED_VERSION=""
    DETECTED_PATH=""
    methods=""
    count=0

    state_root=$(data_root)
    metadata="$state_root/install.conf"
    if [ -f "$metadata" ]; then
        script_method=$(metadata_value INSTALL_METHOD "$metadata")
        script_version=$(metadata_value VERSION "$metadata")
        script_rid=$(metadata_value RID "$metadata")
        script_path=$(metadata_value EXECUTABLE "$metadata")
        case "$script_method" in
            native|managed)
                valid_version_text "$script_version" ||
                    fail "Installer metadata at $metadata contains an invalid version. Move it aside and retry."
                case "$script_rid" in
                    linux-x64|linux-arm64|osx-arm64) ;;
                    *) fail "Installer metadata at $metadata contains an invalid platform. Move it aside and retry." ;;
                esac
                expected_script_path="$state_root/versions/$script_version-$script_method/sharpts"
                [ "$script_path" = "$expected_script_path" ] ||
                    fail "Installer metadata at $metadata contains an unsafe executable path. Move it aside and retry."
                methods="${methods}${script_method} (setup.sh)\n"
                count=$((count + 1))
                DETECTED_METHOD="$script_method"
                DETECTED_VERSION="$script_version"
                DETECTED_PATH="$script_path"
                ;;
            *)
                fail "Installer metadata at $metadata is malformed. Move it aside and retry."
                ;;
        esac
    fi

    tool_version=$(dotnet_tool_version)
    if [ -n "$tool_version" ]; then
        methods="${methods}dotnet (global tool $tool_version)\n"
        count=$((count + 1))
        DETECTED_METHOD="dotnet"
        DETECTED_VERSION="$tool_version"
        DETECTED_PATH="$HOME/.dotnet/tools/sharpts"
    fi

    if command -v brew >/dev/null 2>&1 && brew list --formula sharpts >/dev/null 2>&1; then
        brew_version=$(brew list --versions sharpts 2>/dev/null | awk 'NR == 1 { print $2 }')
        brew_prefix=$(brew --prefix 2>/dev/null || true)
        methods="${methods}brew (formula ${brew_version:-unknown})\n"
        count=$((count + 1))
        DETECTED_METHOD="brew"
        DETECTED_VERSION="$brew_version"
        DETECTED_PATH="${brew_prefix}/bin/sharpts"
    fi

    command_path=$(command -v sharpts 2>/dev/null || true)
    if [ "$count" -gt 1 ]; then
        printf 'Error: Multiple SharpTS installations were detected:\n%b' "$methods" >&2
        fail "Remove the extra installation before continuing."
    fi
    if [ "$count" -eq 0 ] && [ -n "$command_path" ]; then
        DETECTED_METHOD="unmanaged"
        DETECTED_PATH="$command_path"
        version_output=$(sharpts --version 2>/dev/null || true)
        DETECTED_VERSION=$(printf '%s\n' "$version_output" | awk 'NR == 1 && tolower($1) == "sharpts" { print $2 }')
    fi
}

curl_json() {
    require_command curl
    curl --fail --silent --show-error --location \
        --header 'Accept: application/vnd.github+json' \
        --header 'X-GitHub-Api-Version: 2022-11-28' \
        --user-agent 'sharpts.dev/setup.sh' "$1"
}

extract_release_tags() {
    grep -oE '"tag_name"[[:space:]]*:[[:space:]]*"v[^"]+"' |
        sed -E 's/.*"v([^"]+)"/\1/'
}

validate_version() {
    version="$1"
    valid_version_text "$version" ||
        fail "Invalid version '$version'. Use a semantic version such as 1.2.3 or 1.2.3-rc.1."
    case "$version" in
        *-*)
            [ "$INCLUDE_PRERELEASE" = "true" ] ||
                fail "Version $version is a prerelease. Add --prerelease to select it."
            ;;
    esac
}

resolve_version() {
    if [ -n "$REQUESTED_VERSION" ]; then
        version=${REQUESTED_VERSION#v}
        validate_version "$version"
        RESOLVED_VERSION="$version"
        return 0
    fi

    if [ "$INCLUDE_PRERELEASE" = "true" ]; then
        releases=$(curl_json "$GITHUB_API/releases?per_page=100") ||
            fail "Could not retrieve SharpTS releases from GitHub."
        version=$(printf '%s' "$releases" | extract_release_tags | sed -n '1p')
    else
        release=$(curl_json "$GITHUB_API/releases/latest") ||
            fail "Could not retrieve the latest stable SharpTS release from GitHub."
        version=$(printf '%s' "$release" | extract_release_tags | sed -n '1p')
    fi
    [ -n "$version" ] || fail "GitHub returned no matching SharpTS release."
    validate_version "$version"
    RESOLVED_VERSION="$version"
}

list_versions() {
    releases=$(curl_json "$GITHUB_API/releases?per_page=100") ||
        fail "Could not retrieve SharpTS releases from GitHub."
    tags=$(printf '%s' "$releases" | extract_release_tags)
    [ -n "$tags" ] || fail "GitHub returned no SharpTS releases."

    say "Available SharpTS versions:"
    printf '%s\n' "$tags" | while IFS= read -r version; do
        [ -n "$version" ] || continue
        case "$version" in
            *-*) [ "$INCLUDE_PRERELEASE" = "true" ] || continue ;;
        esac
        printf '  %s\n' "$version"
    done
}

choose_install_method() {
    if [ "$REQUESTED_METHOD" != "auto" ]; then
        method="$REQUESTED_METHOD"
    elif [ "$DOTNET_STATE" = "sdk10" ]; then
        method="dotnet"
    else
        method="native"
    fi

    if [ "$method" = "dotnet" ] && [ "$DOTNET_STATE" != "sdk10" ]; then
        fail "The dotnet method requires a .NET 10 or later SDK. Use --method native or --method managed."
    fi
    SELECTED_METHOD="$method"
}

describe_dotnet() {
    case "$DOTNET_STATE" in
        sdk10) say ".NET: 10 or later SDK detected" ;;
        older) say ".NET: installed, but no .NET 10 or later SDK was found" ;;
        command-only) say ".NET: command detected, but no SDK or runtime inventory was available" ;;
        *) say ".NET: not installed" ;;
    esac
}

confirm() {
    prompt="$1"
    if [ "$ASSUME_YES" = "true" ]; then
        return 0
    fi
    if ! tty -s </dev/tty 2>/dev/null; then
        warn "Confirmation requires an interactive terminal. Re-run with --yes for unattended use."
        return 2
    fi
    printf '%s [y/N] ' "$prompt" >/dev/tty
    IFS= read -r answer </dev/tty || answer=""
    case "$answer" in
        y|Y|yes|YES|Yes) return 0 ;;
        *) return 1 ;;
    esac
}

confirm_or_exit() {
    if confirm "$1"; then
        return 0
    else
        status=$?
        if [ "$status" -eq 2 ]; then
            exit 1
        fi
        say "No changes were made."
        exit 0
    fi
}

hash_file() {
    file="$1"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$file" | awk '{ print tolower($1) }'
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$file" | awk '{ print tolower($1) }'
    elif command -v openssl >/dev/null 2>&1; then
        openssl dgst -sha256 "$file" | awk '{ print tolower($NF) }'
    else
        fail "SHA-256 verification requires sha256sum, shasum, or openssl."
    fi
}

release_asset_digest() {
    version="$1"
    asset_name="$2"
    release=$(curl_json "$GITHUB_API/releases/tags/v$version") ||
        fail "Release v$version was not found on GitHub."
    records=$(printf '%s' "$release" | tr '\r\n' '  ' | sed -E '
        s/"name"[[:space:]]*:[[:space:]]*/"name":/g;
        s/"digest"[[:space:]]*:[[:space:]]*/"digest":/g;
        s/}[[:space:]]*,[[:space:]]*\{/}\
{/g
    ')
    record=$(printf '%s\n' "$records" | grep -F "\"name\":\"$asset_name\"" | sed -n '1p')
    [ -n "$record" ] || fail "Release v$version does not contain $asset_name for $RID."
    digest=$(printf '%s\n' "$record" |
        sed -n 's/.*"digest":"sha256:\([0-9A-Fa-f]\{64\}\)".*/\1/p' |
        tr 'A-F' 'a-f')
    [ -n "$digest" ] || fail "GitHub did not provide a SHA-256 digest for $asset_name."
    ASSET_DIGEST="$digest"
}

validate_archive_entries() {
    archive="$1"
    entries=$(tar -tzf "$archive") || fail "The downloaded SharpTS archive is invalid."
    [ -n "$entries" ] || fail "The downloaded SharpTS archive is empty."
    old_ifs=$IFS
    IFS='
'
    for entry in $entries; do
        case "$entry" in
            .|./|LICENSE|./LICENSE|README.md|./README.md|sharpts|./sharpts) ;;
            *)
                IFS=$old_ifs
                fail "The SharpTS archive contains an unexpected path: $entry"
                ;;
        esac
    done
    IFS=$old_ifs
}

download_standalone() {
    version="$1"
    method="$2"
    prepare_temporary_directory
    require_command tar

    prefix="sharpts"
    [ "$method" = "native" ] && prefix="sharpts-native"
    asset_name="$prefix-$version-$RID.tar.gz"
    release_asset_digest "$version" "$asset_name"
    expected_digest="$ASSET_DIGEST"
    archive="$TEMP_ROOT/$asset_name"
    download_url="$GITHUB_DOWNLOADS/v$version/$asset_name"

    say "Downloading $asset_name..."
    curl --fail --silent --show-error --location \
        --user-agent 'sharpts.dev/setup.sh' --output "$archive" "$download_url" ||
        fail "Could not download $asset_name."
    actual_digest=$(hash_file "$archive")
    [ "$actual_digest" = "$expected_digest" ] ||
        fail "SHA-256 verification failed for $asset_name."

    validate_archive_entries "$archive"
    extract_root="$TEMP_ROOT/extracted"
    mkdir -p "$extract_root" || fail "Could not prepare the archive extraction directory."
    tar -xzf "$archive" -C "$extract_root" || fail "Could not extract $asset_name."
    binary="$extract_root/sharpts"
    [ -f "$binary" ] && [ ! -L "$binary" ] || fail "The archive does not contain a regular sharpts executable."
    chmod +x "$binary" || fail "Could not make the SharpTS binary executable."

    installed_version=$("$binary" --version 2>/dev/null | awk 'NR == 1 && tolower($1) == "sharpts" { print $2 }')
    [ "$installed_version" = "$version" ] ||
        fail "The downloaded binary reports version '${installed_version:-unknown}', expected '$version'."
    DOWNLOADED_ROOT="$extract_root"
}

write_metadata() {
    metadata="$1"
    method="$2"
    version="$3"
    executable="$4"
    temporary="$metadata.tmp.$$"
    {
        printf 'INSTALL_METHOD=%s\n' "$method"
        printf 'VERSION=%s\n' "$version"
        printf 'RID=%s\n' "$RID"
        printf 'EXECUTABLE=%s\n' "$executable"
    } >"$temporary" || fail "Could not write installer metadata."
    mv -f "$temporary" "$metadata" || fail "Could not activate installer metadata."
}

remove_owned_payload() {
    payload="$1"
    versions_root="$2"
    case "$payload" in
        "$versions_root"/*)
            [ "$payload" != "$versions_root/" ] || return 0
            [ -d "$payload" ] && rm -rf "$payload"
            ;;
    esac
}

activate_standalone() {
    source_root="$1"
    version="$2"
    method="$3"
    state_root=$(data_root)
    versions_root="$state_root/versions"
    target_root="$versions_root/$version-$method"
    target_binary="$target_root/sharpts"
    bin_dir=$(bin_root)
    link_path="$bin_dir/sharpts"
    metadata="$state_root/install.conf"
    old_executable=$(metadata_value EXECUTABLE "$metadata")
    old_payload=""
    [ -n "$old_executable" ] && old_payload=$(dirname "$old_executable")

    mkdir -p "$versions_root" "$bin_dir" || fail "Could not create user-local SharpTS directories."
    if [ -e "$link_path" ] || [ -L "$link_path" ]; then
        [ -L "$link_path" ] ||
            fail "$link_path already exists and is not an installer-owned symbolic link."
        current_link_target=$(readlink "$link_path" 2>/dev/null || true)
        if [ -z "$old_executable" ] || [ "$current_link_target" != "$old_executable" ]; then
            fail "$link_path does not point to the installer-owned SharpTS binary and was preserved."
        fi
    fi

    if [ -d "$target_root" ]; then
        [ -f "$target_binary" ] && [ ! -L "$target_binary" ] ||
            fail "Existing installer payload $target_root is incomplete. Move it aside and retry."
        existing_version=$("$target_binary" --version 2>/dev/null | awk 'NR == 1 { print $2 }')
        [ "$existing_version" = "$version" ] ||
            fail "Existing installer payload $target_root reports an unexpected version. Move it aside and retry."
    else
        staging="$versions_root/.stage-$version-$method-$$"
        mkdir "$staging" || fail "Could not stage the SharpTS installation."
        cp "$source_root/sharpts" "$staging/sharpts" || fail "Could not stage the SharpTS executable."
        [ -f "$source_root/LICENSE" ] && cp "$source_root/LICENSE" "$staging/LICENSE"
        [ -f "$source_root/README.md" ] && cp "$source_root/README.md" "$staging/README.md"
        chmod +x "$staging/sharpts" || fail "Could not set SharpTS executable permissions."
        mv "$staging" "$target_root" || fail "Could not activate the SharpTS payload."
    fi

    link_temporary="$bin_dir/.sharpts-link-$$"
    rm -f "$link_temporary"
    ln -s "$target_binary" "$link_temporary" || fail "Could not create the SharpTS command link."
    mv -f "$link_temporary" "$link_path" || fail "Could not activate the SharpTS command link."
    write_metadata "$metadata" "$method" "$version" "$target_binary"

    if [ -n "$old_payload" ] && [ "$old_payload" != "$target_root" ]; then
        remove_owned_payload "$old_payload" "$versions_root"
    fi

    "$link_path" --version >/dev/null 2>&1 || fail "SharpTS did not start after installation."
    say "SharpTS $version was installed at $target_binary."
    if ! printf ':%s:' "${PATH:-}" | grep -Fq ":$bin_dir:"; then
        warn "$bin_dir is not on PATH. Add it to your shell profile, then open a new terminal."
    fi
}

install_dotnet_tool() {
    version="$1"
    dotnet tool install --global SharpTS --version "$version" ||
        fail "The .NET global-tool installation failed."
    tool_binary="$HOME/.dotnet/tools/sharpts"
    if [ -x "$tool_binary" ]; then
        installed_version=$("$tool_binary" --version 2>/dev/null | awk 'NR == 1 { print $2 }')
        [ "$installed_version" = "$version" ] || fail "The installed tool reports an unexpected version."
    fi
    say "SharpTS $version was installed as a .NET global tool."
}

upgrade_dotnet_tool() {
    version="$1"
    dotnet tool update --global SharpTS --version "$version" ||
        fail "The .NET global-tool upgrade failed."
    say "SharpTS was upgraded to $version with the .NET tool manager."
}

install_action() {
    detect_installation
    if [ -n "$DETECTED_METHOD" ]; then
        say "SharpTS${DETECTED_VERSION:+ $DETECTED_VERSION} is already installed${DETECTED_PATH:+ at $DETECTED_PATH}."
        if [ "$DETECTED_METHOD" = "unmanaged" ]; then
            say "Its installation manager could not be identified; upgrade it with its original installer."
        else
            say "Upgrade it with: curl -fsSL https://sharpts.dev/setup.sh | sh -s -- upgrade"
        fi
        exit 0
    fi

    detect_dotnet
    choose_install_method
    method="$SELECTED_METHOD"
    resolve_version
    version="$RESOLVED_VERSION"
    say "$PROGRAM_NAME"
    say "Platform: $OS_NAME $ARCH_NAME ($RID)"
    describe_dotnet
    say "Version: $version"
    say "Method: $method"
    if [ "$method" = "native" ]; then
        say "NativeAOT is optimized for straight TypeScript. Third-party .NET references, --verify, --gen-decl,"
        say "and compiled child_process.fork require the managed build. Use --method managed for those features."
    elif [ "$method" = "managed" ]; then
        say "The managed self-contained build includes the full SharpTS feature set and does not require system .NET."
    fi
    confirm_or_exit "Install SharpTS $version?"

    if [ "$method" = "dotnet" ]; then
        install_dotnet_tool "$version"
    else
        download_standalone "$version" "$method"
        activate_standalone "$DOWNLOADED_ROOT" "$version" "$method"
    fi
}

upgrade_action() {
    detect_installation
    [ -n "$DETECTED_METHOD" ] || fail "SharpTS is not installed. Run setup.sh install first."
    [ "$DETECTED_METHOD" != "unmanaged" ] ||
        fail "SharpTS at $DETECTED_PATH is not managed by setup.sh, dotnet, or Homebrew. Upgrade it with its original installer."

    if [ "$REQUESTED_METHOD" != "auto" ] && [ "$REQUESTED_METHOD" != "$DETECTED_METHOD" ]; then
        fail "SharpTS is managed by $DETECTED_METHOD. Cross-manager migration is not supported."
    fi
    if [ "$DETECTED_METHOD" = "brew" ]; then
        [ -z "$REQUESTED_VERSION" ] || fail "Homebrew upgrades do not support --version."
        [ "$INCLUDE_PRERELEASE" = "false" ] || fail "Homebrew upgrades do not support --prerelease."
        say "SharpTS${DETECTED_VERSION:+ $DETECTED_VERSION} is managed by Homebrew."
        confirm_or_exit "Upgrade SharpTS with Homebrew?"
        brew upgrade sharpts || fail "The Homebrew upgrade failed."
        say "SharpTS was upgraded with Homebrew."
        exit 0
    fi

    detect_dotnet
    if [ "$DETECTED_METHOD" = "dotnet" ] && [ "$DOTNET_STATE" != "sdk10" ]; then
        fail "Upgrading the .NET global tool requires a .NET 10 or later SDK."
    fi
    resolve_version
    version="$RESOLVED_VERSION"
    if [ "$DETECTED_VERSION" = "$version" ]; then
        say "SharpTS $version is already installed; no upgrade is needed."
        exit 0
    fi

    say "Current version: ${DETECTED_VERSION:-unknown}"
    say "Target version: $version"
    say "Manager: $DETECTED_METHOD"
    confirm_or_exit "Upgrade SharpTS to $version?"

    if [ "$DETECTED_METHOD" = "dotnet" ]; then
        upgrade_dotnet_tool "$version"
    else
        download_standalone "$version" "$DETECTED_METHOD"
        activate_standalone "$DOWNLOADED_ROOT" "$version" "$DETECTED_METHOD"
    fi
}

remove_script_installation() {
    state_root=$(data_root)
    versions_root="$state_root/versions"
    metadata="$state_root/install.conf"
    executable=$(metadata_value EXECUTABLE "$metadata")
    link_path="$(bin_root)/sharpts"

    if [ -L "$link_path" ]; then
        link_target=$(readlink "$link_path" 2>/dev/null || true)
        if [ "$link_target" = "$executable" ]; then
            rm -f "$link_path" || fail "Could not remove $link_path."
        else
            warn "$link_path no longer points to the installer-owned binary and was preserved."
        fi
    elif [ -e "$link_path" ]; then
        warn "$link_path is not an installer-owned symbolic link and was preserved."
    fi

    [ -n "$executable" ] && remove_owned_payload "$(dirname "$executable")" "$versions_root"
    rm -f "$metadata" || fail "Could not remove installer metadata."
    rmdir "$versions_root" 2>/dev/null || true
    rmdir "$state_root" 2>/dev/null || true
    say "SharpTS was removed."
}

remove_action() {
    detect_installation
    [ -n "$DETECTED_METHOD" ] || fail "SharpTS is not installed."
    [ "$DETECTED_METHOD" != "unmanaged" ] ||
        fail "SharpTS at $DETECTED_PATH is not managed by setup.sh, dotnet, or Homebrew. Remove it with its original installer."
    if [ "$REQUESTED_METHOD" != "auto" ] && [ "$REQUESTED_METHOD" != "$DETECTED_METHOD" ]; then
        fail "SharpTS is managed by $DETECTED_METHOD. Use that manager to remove it."
    fi

    say "SharpTS${DETECTED_VERSION:+ $DETECTED_VERSION} is managed by $DETECTED_METHOD."
    confirm_or_exit "Remove SharpTS?"
    case "$DETECTED_METHOD" in
        dotnet)
            dotnet tool uninstall --global SharpTS || fail "The .NET global-tool removal failed."
            say "SharpTS was removed with the .NET tool manager."
            ;;
        brew)
            brew uninstall sharpts || fail "The Homebrew removal failed."
            say "SharpTS was removed with Homebrew."
            ;;
        native|managed)
            remove_script_installation
            ;;
    esac
}

main() {
    parse_arguments "$@"
    detect_platform
    if [ "$ACTION" = "list" ]; then
        list_versions
        exit 0
    fi

    case "$ACTION" in
        install) install_action ;;
        upgrade) upgrade_action ;;
        remove) remove_action ;;
    esac
}

main "$@"
