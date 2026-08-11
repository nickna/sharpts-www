#requires -Version 5.1

<#
.SYNOPSIS
Installs, upgrades, removes, or lists SharpTS releases.

.DESCRIPTION
Canonical SharpTS installer for Windows, Linux/WSL, and Apple Silicon macOS.
This file is published verbatim at https://sharpts.dev/setup.ps1.

.EXAMPLE
irm https://sharpts.dev/setup.ps1 | iex

.EXAMPLE
& ([scriptblock]::Create((irm https://sharpts.dev/setup.ps1))) upgrade -Version 1.2.3 -Yes
#>

[CmdletBinding(PositionalBinding = $true)]
param(
    [Parameter(Position = 0)]
    [ValidateSet('install', 'upgrade', 'remove', 'list')]
    [string]$Action = 'install',

    [string]$Version,

    [ValidateSet('auto', 'dotnet', 'native', 'managed')]
    [string]$Method = 'auto',

    [switch]$Prerelease,

    [Alias('y')]
    [switch]$Yes,

    [Alias('h')]
    [switch]$Help
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:ProgramName = 'SharpTS setup'
$script:GitHubRepository = 'nickna/SharpTS'
$script:GitHubApi = "https://api.github.com/repos/$($script:GitHubRepository)"
$script:GitHubDownloads = "https://github.com/$($script:GitHubRepository)/releases/download"
$script:WinGetPackages = @('SharpTS.SharpTS', 'SharpTS.SharpTS.NativeAOT')

function Write-SharpTSMessage {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host $Message
}

function Stop-SharpTSSetup {
    param([Parameter(Mandatory = $true)][string]$Message)
    throw [InvalidOperationException]$Message
}

function Show-SharpTSSupportedPlatforms {
    Write-SharpTSMessage 'Supported platforms:'
    Write-SharpTSMessage '  Windows                 x64, arm64'
    Write-SharpTSMessage '  Linux / WSL             x64, arm64'
    Write-SharpTSMessage '  macOS                   Apple Silicon (arm64)'
}

function Show-SharpTSUsage {
    Write-SharpTSMessage @'
Install, upgrade, remove, or list SharpTS releases.

Usage:
  .\setup.ps1 [install] [options]
  .\setup.ps1 upgrade [options]
  .\setup.ps1 remove [options]
  .\setup.ps1 list [-Prerelease]

Actions:
  install                 Install SharpTS (the default action)
  upgrade                 Upgrade the existing SharpTS installation
  remove                  Remove the existing SharpTS installation
  list                    List available SharpTS release versions

Options:
  -Version <version>      Install or upgrade to an exact version
  -Method <method>        Use dotnet, native, or managed
  -Prerelease             Include prereleases when listing or selecting latest
  -Yes, -y                Accept confirmation prompts
  -Help, -h               Show this help

Examples:
  irm https://sharpts.dev/setup.ps1 | iex
  & ([scriptblock]::Create((irm https://sharpts.dev/setup.ps1))) upgrade -Version 1.2.3 -Yes
  .\setup.ps1 install -Method managed
  .\setup.ps1 list -Prerelease
'@
    Show-SharpTSSupportedPlatforms
}

function Test-SharpTSWindows {
    return ($env:OS -eq 'Windows_NT' -or
        [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT)
}

function Invoke-SharpTSExternal {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @()
    )

    $nativePreferenceExists = Test-Path Variable:\PSNativeCommandUseErrorActionPreference
    if ($nativePreferenceExists) {
        $oldNativePreference = $PSNativeCommandUseErrorActionPreference
        $PSNativeCommandUseErrorActionPreference = $false
    }
    try {
        $lines = @(& $FilePath @Arguments 2>&1 | ForEach-Object { $_.ToString() })
        $exitCode = $LASTEXITCODE
    }
    catch {
        return [pscustomobject]@{
            ExitCode = 1
            Lines = @($_.Exception.Message)
            Text = $_.Exception.Message
        }
    }
    finally {
        if ($nativePreferenceExists) {
            $PSNativeCommandUseErrorActionPreference = $oldNativePreference
        }
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Lines = $lines
        Text = ($lines -join "`n")
    }
}

function Get-SharpTSPlatform {
    if (Test-SharpTSWindows) {
        $nativeArchitecture = $env:PROCESSOR_ARCHITEW6432
        if ([string]::IsNullOrWhiteSpace($nativeArchitecture)) {
            $nativeArchitecture = $env:PROCESSOR_ARCHITECTURE
        }
        $architecture = switch -Regex ($nativeArchitecture) {
            '^(AMD64|x86_64)$' { 'x64'; break }
            '^(ARM64|aarch64)$' { 'arm64'; break }
            default { $null }
        }
        if ($null -ne $architecture) {
            return [pscustomobject]@{
                OS = 'Windows'
                Architecture = $architecture
                Rid = "win-$architecture"
                IsWindows = $true
            }
        }
        $kernel = 'Windows'
        $machine = if ([string]::IsNullOrWhiteSpace($nativeArchitecture)) { 'unknown' } else { $nativeArchitecture }
    }
    else {
        $uname = Get-Command uname -ErrorAction SilentlyContinue
        if ($null -eq $uname) {
            Stop-SharpTSSetup 'Could not detect the operating system because uname was not found.'
        }
        $kernelResult = Invoke-SharpTSExternal -FilePath $uname.Source -Arguments @('-s')
        $machineResult = Invoke-SharpTSExternal -FilePath $uname.Source -Arguments @('-m')
        if ($kernelResult.ExitCode -ne 0 -or $machineResult.ExitCode -ne 0) {
            Stop-SharpTSSetup 'Could not detect the operating system and processor architecture.'
        }
        $kernel = $kernelResult.Text.Trim()
        $machine = $machineResult.Text.Trim()
        if ($kernel -eq 'Linux') {
            $architecture = switch -Regex ($machine) {
                '^(x86_64|amd64)$' { 'x64'; break }
                '^(aarch64|arm64)$' { 'arm64'; break }
                default { $null }
            }
            if ($null -ne $architecture) {
                return [pscustomobject]@{
                    OS = 'Linux'
                    Architecture = $architecture
                    Rid = "linux-$architecture"
                    IsWindows = $false
                }
            }
        }
        elseif ($kernel -eq 'Darwin' -and $machine -match '^(arm64|aarch64)$') {
            return [pscustomobject]@{
                OS = 'macOS'
                Architecture = 'arm64'
                Rid = 'osx-arm64'
                IsWindows = $false
            }
        }
    }

    Write-Host "Error: SharpTS does not support $machine on $kernel yet."
    Write-Host ''
    Show-SharpTSSupportedPlatforms
    Stop-SharpTSSetup "Unsupported platform: $kernel $machine."
}

function Get-SharpTSDataRoot {
    param([Parameter(Mandatory = $true)]$Platform)

    if ($Platform.IsWindows) {
        $base = $env:LOCALAPPDATA
        if ([string]::IsNullOrWhiteSpace($base)) {
            $base = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
        }
        if ([string]::IsNullOrWhiteSpace($base)) {
            Stop-SharpTSSetup 'LOCALAPPDATA is not available for the current user.'
        }
        return [IO.Path]::GetFullPath((Join-Path $base 'SharpTS'))
    }

    if (-not [string]::IsNullOrWhiteSpace($env:XDG_DATA_HOME)) {
        return [IO.Path]::GetFullPath((Join-Path $env:XDG_DATA_HOME 'sharpts'))
    }
    if ([string]::IsNullOrWhiteSpace($env:HOME)) {
        Stop-SharpTSSetup 'HOME is not available for the current user.'
    }
    return [IO.Path]::GetFullPath((Join-Path $env:HOME '.local/share/sharpts'))
}

function Get-SharpTSBinRoot {
    param([Parameter(Mandatory = $true)]$Platform)

    if ($Platform.IsWindows) {
        return Join-Path (Get-SharpTSDataRoot $Platform) 'bin'
    }
    if ([string]::IsNullOrWhiteSpace($env:HOME)) {
        Stop-SharpTSSetup 'HOME is not available for the current user.'
    }
    return [IO.Path]::GetFullPath((Join-Path $env:HOME '.local/bin'))
}

function Test-SharpTSPathEqual {
    param(
        [Parameter(Mandatory = $true)][string]$Left,
        [Parameter(Mandatory = $true)][string]$Right,
        [Parameter(Mandatory = $true)]$Platform
    )

    try {
        $leftFull = [IO.Path]::GetFullPath($Left).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
        $rightFull = [IO.Path]::GetFullPath($Right).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    }
    catch {
        return $false
    }
    $comparison = if ($Platform.IsWindows) {
        [StringComparison]::OrdinalIgnoreCase
    }
    else {
        [StringComparison]::Ordinal
    }
    return $leftFull.Equals($rightFull, $comparison)
}

function Test-SharpTSVersionText {
    param([AllowEmptyString()][string]$Value)
    return $Value -match '^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$'
}

function Read-SharpTSMetadata {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }
    $values = @{}
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if ($line -notmatch '^([A-Z_]+)=(.*)$') {
            Stop-SharpTSSetup "Installer metadata at $Path is malformed. Move it aside and retry."
        }
        $key = $Matches[1]
        if ($values.ContainsKey($key)) {
            Stop-SharpTSSetup "Installer metadata at $Path contains duplicate keys. Move it aside and retry."
        }
        $values[$key] = $Matches[2]
    }
    return $values
}

function Test-SharpTSLink {
    param([Parameter(Mandatory = $true)][string]$Path)

    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($null -eq $item) { return $false }
    if ($item.PSObject.Properties.Name -contains 'LinkType' -and
        -not [string]::IsNullOrWhiteSpace([string]$item.LinkType)) {
        return $true
    }
    return (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
}

function Get-SharpTSLinkTarget {
    param([Parameter(Mandatory = $true)][string]$Path)

    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($null -eq $item -or -not (Test-SharpTSLink $Path)) { return $null }
    $target = $item.Target
    if ($target -is [Array]) { $target = $target[0] }
    if ([string]::IsNullOrWhiteSpace([string]$target)) { return $null }
    if (-not [IO.Path]::IsPathRooted([string]$target)) {
        $target = Join-Path (Split-Path -Parent $Path) ([string]$target)
    }
    return [IO.Path]::GetFullPath([string]$target)
}

function Get-SharpTSValidatedMetadata {
    param([Parameter(Mandatory = $true)]$Platform)

    $stateRoot = Get-SharpTSDataRoot $Platform
    $metadataPath = Join-Path $stateRoot 'install.conf'
    $values = Read-SharpTSMetadata $metadataPath
    if ($null -eq $values) { return $null }

    $required = if ($Platform.IsWindows) {
        @('INSTALL_METHOD', 'VERSION', 'RID', 'EXECUTABLE', 'PATH_ADDED')
    }
    else {
        @('INSTALL_METHOD', 'VERSION', 'RID', 'EXECUTABLE')
    }
    if ($values.Count -ne $required.Count) {
        Stop-SharpTSSetup "Installer metadata at $metadataPath is malformed. Move it aside and retry."
    }
    foreach ($key in $required) {
        if (-not $values.ContainsKey($key)) {
            Stop-SharpTSSetup "Installer metadata at $metadataPath is missing $key. Move it aside and retry."
        }
    }
    if ($values.INSTALL_METHOD -notin @('native', 'managed')) {
        Stop-SharpTSSetup "Installer metadata at $metadataPath contains an invalid method. Move it aside and retry."
    }
    if (-not (Test-SharpTSVersionText $values.VERSION)) {
        Stop-SharpTSSetup "Installer metadata at $metadataPath contains an invalid version. Move it aside and retry."
    }
    $allowedRids = if ($Platform.IsWindows) {
        @('win-x64', 'win-arm64')
    }
    else {
        @('linux-x64', 'linux-arm64', 'osx-arm64')
    }
    if ($values.RID -notin $allowedRids) {
        Stop-SharpTSSetup "Installer metadata at $metadataPath contains an invalid platform. Move it aside and retry."
    }

    $expectedExecutable = if ($Platform.IsWindows) {
        Join-Path (Get-SharpTSBinRoot $Platform) 'sharpts.exe'
    }
    else {
        Join-Path $stateRoot "versions/$($values.VERSION)-$($values.INSTALL_METHOD)/sharpts"
    }
    if (-not (Test-SharpTSPathEqual $values.EXECUTABLE $expectedExecutable $Platform)) {
        Stop-SharpTSSetup "Installer metadata at $metadataPath contains an unsafe executable path. Move it aside and retry."
    }
    if ($Platform.IsWindows -and $values.PATH_ADDED -notin @('true', 'false')) {
        Stop-SharpTSSetup "Installer metadata at $metadataPath contains an invalid PATH ownership flag. Move it aside and retry."
    }
    if (Test-Path -LiteralPath $expectedExecutable) {
        $item = Get-Item -LiteralPath $expectedExecutable -Force
        if ($item.PSIsContainer -or (Test-SharpTSLink $expectedExecutable)) {
            Stop-SharpTSSetup "Installer metadata at $metadataPath points to an unsafe executable. Move it aside and retry."
        }
    }

    return [pscustomobject]@{
        Method = $values.INSTALL_METHOD
        Version = $values.VERSION
        Rid = $values.RID
        Executable = [IO.Path]::GetFullPath($expectedExecutable)
        PathAdded = ($Platform.IsWindows -and $values.PATH_ADDED -eq 'true')
        MetadataPath = $metadataPath
        StateRoot = $stateRoot
    }
}

function Get-SharpTSDotNetState {
    $command = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        return [pscustomobject]@{ State = 'none'; Command = $null }
    }
    $sdkResult = Invoke-SharpTSExternal -FilePath $command.Source -Arguments @('--list-sdks')
    foreach ($line in $sdkResult.Lines) {
        if ($line -match '^\s*([0-9]+)\.' -and [int]$Matches[1] -ge 10) {
            return [pscustomobject]@{ State = 'sdk10'; Command = $command.Source }
        }
    }
    $runtimeResult = Invoke-SharpTSExternal -FilePath $command.Source -Arguments @('--list-runtimes')
    if ($sdkResult.Lines.Count -gt 0 -or $runtimeResult.Lines.Count -gt 0) {
        return [pscustomobject]@{ State = 'older'; Command = $command.Source }
    }
    return [pscustomobject]@{ State = 'command-only'; Command = $command.Source }
}

function Get-SharpTSDotNetTool {
    $command = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($null -eq $command) { return $null }
    $result = Invoke-SharpTSExternal -FilePath $command.Source -Arguments @('tool', 'list', '--global')
    if ($result.ExitCode -ne 0) { return $null }
    foreach ($line in $result.Lines) {
        if ($line -match '^\s*sharpts\s+(\S+)\s+' -and (Test-SharpTSVersionText $Matches[1])) {
            $toolName = if (Test-SharpTSWindows) { 'sharpts.exe' } else { 'sharpts' }
            $toolPath = if ([string]::IsNullOrWhiteSpace($env:HOME)) {
                $null
            }
            else {
                Join-Path $env:HOME ".dotnet/tools/$toolName"
            }
            return [pscustomobject]@{
                Manager = 'dotnet'
                Method = 'dotnet'
                Version = $Matches[1]
                Path = $toolPath
                Description = "dotnet (global tool $($Matches[1]))"
                PackageId = 'SharpTS'
            }
        }
    }
    return $null
}

function Get-SharpTSHomebrewInstallation {
    $command = Get-Command brew -ErrorAction SilentlyContinue
    if ($null -eq $command) { return $null }
    $installed = Invoke-SharpTSExternal -FilePath $command.Source -Arguments @('list', '--formula', 'sharpts')
    if ($installed.ExitCode -ne 0) { return $null }
    $versions = Invoke-SharpTSExternal -FilePath $command.Source -Arguments @('list', '--versions', 'sharpts')
    $version = $null
    if ($versions.Text -match '(?m)^sharpts\s+(\S+)') { $version = $Matches[1] }
    $prefixResult = Invoke-SharpTSExternal -FilePath $command.Source -Arguments @('--prefix')
    $binary = if ($prefixResult.ExitCode -eq 0) {
        Join-Path $prefixResult.Text.Trim() 'bin/sharpts'
    }
    else { $null }
    return [pscustomobject]@{
        Manager = 'brew'
        Method = $null
        Version = $version
        Path = $binary
        Description = "Homebrew (formula $(if ($version) { $version } else { 'unknown' }))"
        PackageId = 'sharpts'
    }
}

function Get-SharpTSWinGetInstallations {
    $command = Get-Command winget -ErrorAction SilentlyContinue
    if ($null -eq $command) { return @() }
    $found = @()
    foreach ($packageId in $script:WinGetPackages) {
        $result = Invoke-SharpTSExternal -FilePath $command.Source -Arguments @(
            'list', '--id', $packageId, '--exact', '--disable-interactivity', '--accept-source-agreements'
        )
        if ($result.ExitCode -ne 0) { continue }
        $escapedId = [regex]::Escape($packageId)
        $matchingLine = @($result.Lines | Where-Object { $_ -match "(^|\s)$escapedId(\s|$)" } | Select-Object -First 1)
        if ($matchingLine.Count -eq 0) { continue }
        $version = $null
        if ($matchingLine[0] -match "$escapedId\s+(\S+)") { $version = $Matches[1] }
        $methodName = if ($packageId -eq 'SharpTS.SharpTS.NativeAOT') { 'native' } else { 'managed' }
        $found += [pscustomobject]@{
            Manager = 'winget'
            Method = $methodName
            Version = $version
            Path = $null
            Description = "WinGet ($packageId $(if ($version) { $version } else { 'unknown' }))"
            PackageId = $packageId
        }
    }
    return @($found)
}

function Get-SharpTSInstallation {
    param([Parameter(Mandatory = $true)]$Platform)

    $installations = @()
    $metadata = Get-SharpTSValidatedMetadata $Platform
    if ($null -ne $metadata) {
        $installations += [pscustomobject]@{
            Manager = 'standalone'
            Method = $metadata.Method
            Version = $metadata.Version
            Path = $metadata.Executable
            Description = "$($metadata.Method) (setup.ps1/setup.sh $($metadata.Version))"
            PackageId = $null
            Metadata = $metadata
        }
    }

    $dotnet = Get-SharpTSDotNetTool
    if ($null -ne $dotnet) { $installations += $dotnet }
    if ($Platform.IsWindows) {
        $installations += @(Get-SharpTSWinGetInstallations)
    }
    else {
        $brew = Get-SharpTSHomebrewInstallation
        if ($null -ne $brew) { $installations += $brew }
    }

    $command = Get-Command sharpts -CommandType Application -ErrorAction SilentlyContinue
    if ($installations.Count -eq 1 -and $null -ne $command -and
        -not [string]::IsNullOrWhiteSpace([string]$installations[0].Path) -and
        -not (Test-SharpTSPathEqual $command.Source $installations[0].Path $Platform)) {
        $installations += [pscustomobject]@{
            Manager = 'unmanaged'
            Method = $null
            Version = $null
            Path = $command.Source
            Description = "unmanaged command ($($command.Source))"
            PackageId = $null
        }
    }

    if ($installations.Count -gt 1) {
        Write-Host 'Error: Multiple SharpTS installations were detected:'
        foreach ($installation in $installations) {
            Write-Host "  $($installation.Description)"
        }
        Stop-SharpTSSetup 'Remove the extra installation before continuing.'
    }
    if ($installations.Count -eq 1) { return $installations[0] }

    if ($null -ne $command) {
        $version = $null
        $probe = Invoke-SharpTSExternal -FilePath $command.Source -Arguments @('--version')
        if ($probe.Text -match '(?im)^\s*sharpts\s+(\S+)') { $version = $Matches[1] }
        return [pscustomobject]@{
            Manager = 'unmanaged'
            Method = $null
            Version = $version
            Path = $command.Source
            Description = 'unmanaged'
            PackageId = $null
        }
    }
    return $null
}

function Initialize-SharpTSNetwork {
    try {
        if ([enum]::GetNames([Net.SecurityProtocolType]) -contains 'Tls12') {
            [Net.ServicePointManager]::SecurityProtocol =
                [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        }
    }
    catch {
        # PowerShell 7 uses the platform HTTP stack and does not need this fallback.
    }
}

function Get-SharpTSGitHubJson {
    param([Parameter(Mandatory = $true)][string]$Uri)

    Initialize-SharpTSNetwork
    $headers = @{
        Accept = 'application/vnd.github+json'
        'X-GitHub-Api-Version' = '2022-11-28'
    }
    try {
        return Invoke-RestMethod -Uri $Uri -Headers $headers -UserAgent 'sharpts.dev/setup.ps1'
    }
    catch {
        Stop-SharpTSSetup "Could not retrieve SharpTS release information from GitHub: $($_.Exception.Message)"
    }
}

function Assert-SharpTSRequestedVersion {
    param(
        [Parameter(Mandatory = $true)][string]$RequestedVersion,
        [switch]$IncludePrerelease
    )

    $normalized = $RequestedVersion.Trim()
    if ($normalized.StartsWith('v', [StringComparison]::OrdinalIgnoreCase)) {
        $normalized = $normalized.Substring(1)
    }
    if (-not (Test-SharpTSVersionText $normalized)) {
        Stop-SharpTSSetup "Invalid version '$RequestedVersion'. Use a semantic version such as 1.2.3 or 1.2.3-rc.1."
    }
    if ($normalized.Contains('-') -and -not $IncludePrerelease) {
        Stop-SharpTSSetup "Version $normalized is a prerelease. Add -Prerelease to select it."
    }
    return $normalized
}

function Get-SharpTSReleaseVersion {
    param(
        [AllowNull()][string]$RequestedVersion,
        [switch]$IncludePrerelease
    )

    if (-not [string]::IsNullOrWhiteSpace($RequestedVersion)) {
        return Assert-SharpTSRequestedVersion $RequestedVersion -IncludePrerelease:$IncludePrerelease
    }
    if ($IncludePrerelease) {
        $releases = @(Get-SharpTSGitHubJson "$($script:GitHubApi)/releases?per_page=100")
        $release = @($releases | Where-Object { $_.draft -ne $true } | Select-Object -First 1)
        if ($release.Count -eq 0) { Stop-SharpTSSetup 'GitHub returned no matching SharpTS release.' }
        $tag = [string]$release[0].tag_name
    }
    else {
        $release = Get-SharpTSGitHubJson "$($script:GitHubApi)/releases/latest"
        $tag = [string]$release.tag_name
    }
    if (-not $tag.StartsWith('v')) {
        Stop-SharpTSSetup 'GitHub returned a malformed SharpTS release tag.'
    }
    return Assert-SharpTSRequestedVersion $tag -IncludePrerelease:$IncludePrerelease
}

function Show-SharpTSReleaseList {
    param([switch]$IncludePrerelease)

    $releases = @(Get-SharpTSGitHubJson "$($script:GitHubApi)/releases?per_page=100")
    $versions = @()
    foreach ($release in $releases) {
        if ($release.draft -eq $true) { continue }
        $tag = [string]$release.tag_name
        if (-not $tag.StartsWith('v')) { continue }
        $candidate = $tag.Substring(1)
        if (-not (Test-SharpTSVersionText $candidate)) { continue }
        if (-not $IncludePrerelease -and ($release.prerelease -eq $true -or $candidate.Contains('-'))) { continue }
        $versions += $candidate
    }
    if ($versions.Count -eq 0) { Stop-SharpTSSetup 'GitHub returned no SharpTS releases.' }
    Write-SharpTSMessage 'Available SharpTS versions:'
    foreach ($releaseVersion in $versions) { Write-SharpTSMessage "  $releaseVersion" }
}

function Get-SharpTSReleaseAsset {
    param(
        [Parameter(Mandatory = $true)][string]$ReleaseVersion,
        [Parameter(Mandatory = $true)][string]$InstallMethod,
        [Parameter(Mandatory = $true)]$Platform
    )

    $prefix = if ($InstallMethod -eq 'native') { 'sharpts-native' } else { 'sharpts' }
    $extension = if ($Platform.IsWindows) { 'zip' } else { 'tar.gz' }
    $name = "$prefix-$ReleaseVersion-$($Platform.Rid).$extension"
    $release = Get-SharpTSGitHubJson "$($script:GitHubApi)/releases/tags/v$ReleaseVersion"
    $assets = @($release.assets | Where-Object { [string]$_.name -ceq $name })
    if ($assets.Count -ne 1) {
        Stop-SharpTSSetup "Release v$ReleaseVersion does not contain exactly one $name asset for $($Platform.Rid)."
    }
    $digestText = [string]$assets[0].digest
    if ($digestText -notmatch '^sha256:([0-9A-Fa-f]{64})$') {
        Stop-SharpTSSetup "GitHub did not provide a SHA-256 digest for $name."
    }
    $expectedUri = "$($script:GitHubDownloads)/v$ReleaseVersion/$name"
    if ([string]$assets[0].browser_download_url -cne $expectedUri) {
        Stop-SharpTSSetup "GitHub returned an unexpected download URL for $name."
    }
    return [pscustomobject]@{
        Name = $name
        Digest = $Matches[1].ToLowerInvariant()
        Uri = $expectedUri
    }
}

function New-SharpTSTemporaryDirectory {
    $root = [IO.Path]::GetTempPath()
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $candidate = Join-Path $root ("sharpts-setup-" + [Guid]::NewGuid().ToString('N'))
        try {
            [void](New-Item -ItemType Directory -Path $candidate -ErrorAction Stop)
            return $candidate
        }
        catch {
            if ($attempt -eq 19) { throw }
        }
    }
    Stop-SharpTSSetup 'Could not create a temporary directory.'
}

function Get-SharpTSArchiveEntryName {
    param([Parameter(Mandatory = $true)][string]$Name)

    if ($Name.Contains('\')) {
        Stop-SharpTSSetup "The SharpTS archive contains an unexpected path: $Name"
    }
    $normalized = $Name
    while ($normalized.StartsWith('./')) { $normalized = $normalized.Substring(2) }
    $normalized = $normalized.TrimEnd('/')
    if ([string]::IsNullOrEmpty($normalized)) { return '.' }
    return $normalized
}

function Assert-SharpTSArchiveEntries {
    param(
        [Parameter(Mandatory = $true)][string[]]$Entries,
        [Parameter(Mandatory = $true)][string]$ExecutableName
    )

    if ($Entries.Count -eq 0) { Stop-SharpTSSetup 'The downloaded SharpTS archive is empty.' }
    $allowed = @('.', 'LICENSE', 'README.md', $ExecutableName)
    $seen = @{}
    foreach ($entry in $Entries) {
        $normalized = Get-SharpTSArchiveEntryName $entry
        if ($normalized -notin $allowed) {
            Stop-SharpTSSetup "The SharpTS archive contains an unexpected path: $entry"
        }
        if ($normalized -ne '.') {
            if ($seen.ContainsKey($normalized)) {
                Stop-SharpTSSetup "The SharpTS archive contains a duplicate path: $entry"
            }
            $seen[$normalized] = $true
        }
    }
    if (-not $seen.ContainsKey($ExecutableName)) {
        Stop-SharpTSSetup "The SharpTS archive does not contain $ExecutableName."
    }
}

function Expand-SharpTSArchive {
    param(
        [Parameter(Mandatory = $true)][string]$Archive,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)]$Platform
    )

    [void](New-Item -ItemType Directory -Path $Destination)
    $executableName = if ($Platform.IsWindows) { 'sharpts.exe' } else { 'sharpts' }
    if ($Platform.IsWindows) {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
        try {
            $entries = @($zip.Entries | ForEach-Object { $_.FullName })
            Assert-SharpTSArchiveEntries $entries $executableName
        }
        finally {
            $zip.Dispose()
        }
        try {
            [IO.Compression.ZipFile]::ExtractToDirectory($Archive, $Destination)
        }
        catch {
            Stop-SharpTSSetup 'The downloaded SharpTS ZIP archive is invalid.'
        }
    }
    else {
        $tar = Get-Command tar -ErrorAction SilentlyContinue
        if ($null -eq $tar) { Stop-SharpTSSetup "Required command 'tar' was not found." }
        $listing = Invoke-SharpTSExternal -FilePath $tar.Source -Arguments @('-tzf', $Archive)
        if ($listing.ExitCode -ne 0) { Stop-SharpTSSetup 'The downloaded SharpTS archive is invalid.' }
        Assert-SharpTSArchiveEntries @($listing.Lines) $executableName
        $extraction = Invoke-SharpTSExternal -FilePath $tar.Source -Arguments @('-xzf', $Archive, '-C', $Destination)
        if ($extraction.ExitCode -ne 0) { Stop-SharpTSSetup 'Could not extract the SharpTS archive.' }
        $chmod = Get-Command chmod -ErrorAction SilentlyContinue
        if ($null -eq $chmod) { Stop-SharpTSSetup "Required command 'chmod' was not found." }
        $chmodResult = Invoke-SharpTSExternal -FilePath $chmod.Source -Arguments @('+x', (Join-Path $Destination $executableName))
        if ($chmodResult.ExitCode -ne 0) { Stop-SharpTSSetup 'Could not make the SharpTS binary executable.' }
    }

    $executable = Join-Path $Destination $executableName
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf) -or (Test-SharpTSLink $executable)) {
        Stop-SharpTSSetup "The archive does not contain a regular $executableName executable."
    }
    return $executable
}

function Get-SharpTSExecutableVersion {
    param([Parameter(Mandatory = $true)][string]$Executable)

    $result = Invoke-SharpTSExternal -FilePath $Executable -Arguments @('--version')
    if ($result.ExitCode -ne 0 -or $result.Text -notmatch '(?im)^\s*sharpts\s+(\S+)') {
        return $null
    }
    return $Matches[1]
}

function Get-SharpTSStandalonePayload {
    param(
        [Parameter(Mandatory = $true)][string]$ReleaseVersion,
        [Parameter(Mandatory = $true)][string]$InstallMethod,
        [Parameter(Mandatory = $true)]$Platform
    )

    $temporaryRoot = New-SharpTSTemporaryDirectory
    try {
        $asset = Get-SharpTSReleaseAsset $ReleaseVersion $InstallMethod $Platform
        $archive = Join-Path $temporaryRoot $asset.Name
        Initialize-SharpTSNetwork
        Write-SharpTSMessage "Downloading $($asset.Name)..."
        try {
            Invoke-WebRequest -Uri $asset.Uri -OutFile $archive -UseBasicParsing -UserAgent 'sharpts.dev/setup.ps1'
        }
        catch {
            Stop-SharpTSSetup "Could not download $($asset.Name): $($_.Exception.Message)"
        }
        $actualDigest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualDigest -cne $asset.Digest) {
            Stop-SharpTSSetup "SHA-256 verification failed for $($asset.Name)."
        }
        $payloadRoot = Join-Path $temporaryRoot 'extracted'
        $executable = Expand-SharpTSArchive $archive $payloadRoot $Platform
        $actualVersion = Get-SharpTSExecutableVersion $executable
        if ($actualVersion -cne $ReleaseVersion) {
            $displayVersion = if ($actualVersion) { $actualVersion } else { 'unknown' }
            Stop-SharpTSSetup "The downloaded binary reports version '$displayVersion', expected '$ReleaseVersion'."
        }
        return [pscustomobject]@{
            TemporaryRoot = $temporaryRoot
            PayloadRoot = $payloadRoot
            Executable = $executable
        }
    }
    catch {
        if (Test-Path -LiteralPath $temporaryRoot) {
            Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
        throw
    }
}

function New-SharpTSMetadataText {
    param(
        [Parameter(Mandatory = $true)][string]$InstallMethod,
        [Parameter(Mandatory = $true)][string]$ReleaseVersion,
        [Parameter(Mandatory = $true)]$Platform,
        [Parameter(Mandatory = $true)][string]$Executable,
        [bool]$PathAdded = $false
    )

    $lines = @(
        "INSTALL_METHOD=$InstallMethod",
        "VERSION=$ReleaseVersion",
        "RID=$($Platform.Rid)",
        "EXECUTABLE=$Executable"
    )
    if ($Platform.IsWindows) {
        $pathValue = if ($PathAdded) { 'true' } else { 'false' }
        $lines += "PATH_ADDED=$pathValue"
    }
    return ($lines -join "`n") + "`n"
}

function Write-SharpTSUtf8File {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )
    [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Get-SharpTSUserPath {
    return [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Set-SharpTSUserPath {
    param([AllowEmptyString()][string]$Value)
    [Environment]::SetEnvironmentVariable('Path', $Value, 'User')
}

function Test-SharpTSPathListContains {
    param(
        [AllowEmptyString()][string]$PathValue,
        [Parameter(Mandatory = $true)][string]$Entry,
        [Parameter(Mandatory = $true)]$Platform
    )
    foreach ($candidate in @($PathValue -split ';')) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        if (Test-SharpTSPathEqual $candidate.Trim() $Entry $Platform) { return $true }
    }
    return $false
}

function Add-SharpTSUserPath {
    param(
        [Parameter(Mandatory = $true)][string]$BinRoot,
        [Parameter(Mandatory = $true)]$Platform
    )
    $current = [string](Get-SharpTSUserPath)
    if (Test-SharpTSPathListContains $current $BinRoot $Platform) { return $false }
    $updated = if ([string]::IsNullOrWhiteSpace($current)) { $BinRoot } else { "$current;$BinRoot" }
    Set-SharpTSUserPath $updated
    if (-not (Test-SharpTSPathListContains ([string]$env:Path) $BinRoot $Platform)) {
        $env:Path = if ([string]::IsNullOrWhiteSpace($env:Path)) { $BinRoot } else { "$($env:Path);$BinRoot" }
    }
    return $true
}

function Remove-SharpTSUserPath {
    param(
        [Parameter(Mandatory = $true)][string]$BinRoot,
        [Parameter(Mandatory = $true)]$Platform
    )
    $parts = @([string](Get-SharpTSUserPath) -split ';')
    $kept = @()
    $removed = $false
    foreach ($part in $parts) {
        if (-not $removed -and -not [string]::IsNullOrWhiteSpace($part) -and
            (Test-SharpTSPathEqual $part.Trim() $BinRoot $Platform)) {
            $removed = $true
            continue
        }
        if (-not [string]::IsNullOrWhiteSpace($part)) { $kept += $part }
    }
    if ($removed) { Set-SharpTSUserPath ($kept -join ';') }

    $processParts = @([string]$env:Path -split ';')
    $processKept = @()
    $processRemoved = $false
    foreach ($part in $processParts) {
        if (-not $processRemoved -and -not [string]::IsNullOrWhiteSpace($part) -and
            (Test-SharpTSPathEqual $part.Trim() $BinRoot $Platform)) {
            $processRemoved = $true
            continue
        }
        if (-not [string]::IsNullOrWhiteSpace($part)) { $processKept += $part }
    }
    if ($processRemoved) { $env:Path = $processKept -join ';' }
    return $removed
}

function Restore-SharpTSFile {
    param(
        [Parameter(Mandatory = $true)][string]$Destination,
        [AllowNull()][string]$Backup,
        [Parameter(Mandatory = $true)][bool]$DestinationExisted
    )
    if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force }
    if ($DestinationExisted -and $Backup -and (Test-Path -LiteralPath $Backup)) {
        Move-Item -LiteralPath $Backup -Destination $Destination
    }
}

function Set-SharpTSFileAtomically {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][string]$Backup
    )
    if (Test-Path -LiteralPath $Destination) {
        [IO.File]::Replace($Source, $Destination, $Backup, $true)
    }
    else {
        [IO.File]::Move($Source, $Destination)
    }
}

function Install-SharpTSWindowsStandalone {
    param(
        [Parameter(Mandatory = $true)]$Payload,
        [Parameter(Mandatory = $true)][string]$ReleaseVersion,
        [Parameter(Mandatory = $true)][string]$InstallMethod,
        [Parameter(Mandatory = $true)]$Platform,
        [AllowNull()]$PreviousMetadata
    )

    $stateRoot = Get-SharpTSDataRoot $Platform
    $binRoot = Get-SharpTSBinRoot $Platform
    $executable = Join-Path $binRoot 'sharpts.exe'
    $metadataPath = Join-Path $stateRoot 'install.conf'
    [void](New-Item -ItemType Directory -Path $binRoot -Force)

    foreach ($occupiedName in @('sharpts.com', 'sharpts.bat', 'sharpts.cmd', 'sharpts.ps1')) {
        $occupied = Join-Path $binRoot $occupiedName
        if (Test-Path -LiteralPath $occupied) {
            Stop-SharpTSSetup "$occupied already exists and is not installer-owned."
        }
    }
    if ((Test-Path -LiteralPath $executable) -and $null -eq $PreviousMetadata) {
        Stop-SharpTSSetup "$executable already exists and is not installer-owned."
    }

    $identifier = [Guid]::NewGuid().ToString('N')
    $stagedExecutable = Join-Path $binRoot ".sharpts-$identifier.exe"
    $executableBackup = Join-Path $binRoot ".sharpts-backup-$identifier.exe"
    $metadataTemporary = Join-Path $stateRoot ".install-$identifier.conf"
    $metadataBackup = Join-Path $stateRoot ".install-backup-$identifier.conf"
    try {
        Copy-Item -LiteralPath $Payload.Executable -Destination $stagedExecutable
        $userPath = [string](Get-SharpTSUserPath)
        $pathAlreadyPresent = Test-SharpTSPathListContains $userPath $binRoot $Platform
        $willAddPath = -not $pathAlreadyPresent
        $pathOwned = $willAddPath -or ($null -ne $PreviousMetadata -and $PreviousMetadata.PathAdded)
        Write-SharpTSUtf8File $metadataTemporary (New-SharpTSMetadataText `
            $InstallMethod $ReleaseVersion $Platform $executable $pathOwned)
    }
    catch {
        foreach ($temporary in @($stagedExecutable, $metadataTemporary)) {
            if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }
        }
        throw
    }

    $executableExisted = Test-Path -LiteralPath $executable
    $metadataExisted = Test-Path -LiteralPath $metadataPath
    $executableActivated = $false
    $metadataActivated = $false
    $pathAddedNow = $false
    try {
        Set-SharpTSFileAtomically $stagedExecutable $executable $executableBackup
        $executableActivated = $true
        Set-SharpTSFileAtomically $metadataTemporary $metadataPath $metadataBackup
        $metadataActivated = $true
        $activatedVersion = Get-SharpTSExecutableVersion $executable
        if ($activatedVersion -cne $ReleaseVersion) {
            Stop-SharpTSSetup 'SharpTS did not report the expected version after activation.'
        }
        if ($willAddPath) {
            $pathAddedNow = $true
            $pathAddedNow = Add-SharpTSUserPath $binRoot $Platform
        }
    }
    catch {
        if ($pathAddedNow) { [void](Remove-SharpTSUserPath $binRoot $Platform) }
        if ($metadataActivated) { Restore-SharpTSFile $metadataPath $metadataBackup $metadataExisted }
        if ($executableActivated) { Restore-SharpTSFile $executable $executableBackup $executableExisted }
        throw
    }
    finally {
        foreach ($temporary in @($stagedExecutable, $metadataTemporary)) {
            if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
        }
    }
    foreach ($backup in @($executableBackup, $metadataBackup)) {
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
    }
    Write-SharpTSMessage "SharpTS $ReleaseVersion was installed at $executable."
    if ($pathAddedNow) { Write-SharpTSMessage "$binRoot was added to your user PATH. Open a new terminal to use it there." }
}

function Remove-SharpTSOwnedPayload {
    param(
        [Parameter(Mandatory = $true)][string]$PayloadRoot,
        [Parameter(Mandatory = $true)][string]$VersionsRoot,
        [Parameter(Mandatory = $true)]$Platform
    )
    $parent = Split-Path -Parent ([IO.Path]::GetFullPath($PayloadRoot))
    if (-not (Test-SharpTSPathEqual $parent $VersionsRoot $Platform)) {
        Stop-SharpTSSetup "Refusing to remove an installer payload outside $VersionsRoot."
    }
    if (Test-Path -LiteralPath $PayloadRoot) {
        Remove-Item -LiteralPath $PayloadRoot -Recurse -Force
    }
}

function Install-SharpTSUnixStandalone {
    param(
        [Parameter(Mandatory = $true)]$Payload,
        [Parameter(Mandatory = $true)][string]$ReleaseVersion,
        [Parameter(Mandatory = $true)][string]$InstallMethod,
        [Parameter(Mandatory = $true)]$Platform,
        [AllowNull()]$PreviousMetadata
    )

    $stateRoot = Get-SharpTSDataRoot $Platform
    $versionsRoot = Join-Path $stateRoot 'versions'
    $targetRoot = Join-Path $versionsRoot "$ReleaseVersion-$InstallMethod"
    $targetExecutable = Join-Path $targetRoot 'sharpts'
    $binRoot = Get-SharpTSBinRoot $Platform
    $linkPath = Join-Path $binRoot 'sharpts'
    $metadataPath = Join-Path $stateRoot 'install.conf'
    [void](New-Item -ItemType Directory -Path $versionsRoot -Force)
    [void](New-Item -ItemType Directory -Path $binRoot -Force)

    if (Test-Path -LiteralPath $targetRoot) {
        Stop-SharpTSSetup "Installer payload $targetRoot already exists. Move it aside and retry."
    }
    $existingLink = Get-Item -LiteralPath $linkPath -Force -ErrorAction SilentlyContinue
    if ($null -ne $existingLink) {
        if ($null -eq $PreviousMetadata -or -not (Test-SharpTSLink $linkPath)) {
            Stop-SharpTSSetup "$linkPath already exists and is not an installer-owned symbolic link."
        }
        $currentTarget = Get-SharpTSLinkTarget $linkPath
        if ($null -eq $currentTarget -or
            -not (Test-SharpTSPathEqual $currentTarget $PreviousMetadata.Executable $Platform)) {
            Stop-SharpTSSetup "$linkPath does not point to the installer-owned SharpTS binary and was preserved."
        }
    }

    $identifier = [Guid]::NewGuid().ToString('N')
    $stagingRoot = Join-Path $versionsRoot ".stage-$identifier"
    $temporaryLink = Join-Path $binRoot ".sharpts-link-$identifier"
    $linkBackup = Join-Path $binRoot ".sharpts-backup-$identifier"
    $metadataTemporary = Join-Path $stateRoot ".install-$identifier.conf"
    $metadataBackup = Join-Path $stateRoot ".install-backup-$identifier.conf"
    $targetPrepared = $false
    try {
        [void](New-Item -ItemType Directory -Path $stagingRoot)
        $stagedExecutable = Join-Path $stagingRoot 'sharpts'
        Copy-Item -LiteralPath $Payload.Executable -Destination $stagedExecutable
        $chmod = Get-Command chmod -ErrorAction SilentlyContinue
        if ($null -eq $chmod) { Stop-SharpTSSetup "Required command 'chmod' was not found." }
        $chmodResult = Invoke-SharpTSExternal $chmod.Source @('+x', $stagedExecutable)
        if ($chmodResult.ExitCode -ne 0) { Stop-SharpTSSetup 'Could not set SharpTS executable permissions.' }
        foreach ($extra in @('LICENSE', 'README.md')) {
            $sourceExtra = Join-Path $Payload.PayloadRoot $extra
            if (Test-Path -LiteralPath $sourceExtra -PathType Leaf) {
                Copy-Item -LiteralPath $sourceExtra -Destination (Join-Path $stagingRoot $extra)
            }
        }
        Move-Item -LiteralPath $stagingRoot -Destination $targetRoot
        $targetPrepared = $true
        [void](New-Item -ItemType SymbolicLink -Path $temporaryLink -Target $targetExecutable)
        Write-SharpTSUtf8File $metadataTemporary (New-SharpTSMetadataText `
            $InstallMethod $ReleaseVersion $Platform $targetExecutable $false)
    }
    catch {
        foreach ($temporary in @($temporaryLink, $metadataTemporary, $stagingRoot)) {
            if ($null -ne (Get-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue)) {
                Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
        if ($targetPrepared -and (Test-Path -LiteralPath $targetRoot)) {
            Remove-SharpTSOwnedPayload $targetRoot $versionsRoot $Platform
        }
        throw
    }

    $linkExisted = $null -ne $existingLink
    $metadataExisted = Test-Path -LiteralPath $metadataPath
    $linkActivated = $false
    $metadataActivated = $false
    try {
        if ($linkExisted) { Move-Item -LiteralPath $linkPath -Destination $linkBackup }
        Move-Item -LiteralPath $temporaryLink -Destination $linkPath
        $linkActivated = $true
        if ($metadataExisted) { Move-Item -LiteralPath $metadataPath -Destination $metadataBackup }
        Move-Item -LiteralPath $metadataTemporary -Destination $metadataPath
        $metadataActivated = $true
        $activatedVersion = Get-SharpTSExecutableVersion $linkPath
        if ($activatedVersion -cne $ReleaseVersion) {
            Stop-SharpTSSetup 'SharpTS did not report the expected version after activation.'
        }
    }
    catch {
        if ($metadataActivated -and (Test-Path -LiteralPath $metadataPath)) {
            Remove-Item -LiteralPath $metadataPath -Force
        }
        if ($metadataExisted -and (Test-Path -LiteralPath $metadataBackup)) {
            Move-Item -LiteralPath $metadataBackup -Destination $metadataPath
        }
        if ($linkActivated -and $null -ne (Get-Item -LiteralPath $linkPath -Force -ErrorAction SilentlyContinue)) {
            Remove-Item -LiteralPath $linkPath -Force
        }
        if ($linkExisted -and $null -ne (Get-Item -LiteralPath $linkBackup -Force -ErrorAction SilentlyContinue)) {
            Move-Item -LiteralPath $linkBackup -Destination $linkPath
        }
        if (Test-Path -LiteralPath $targetRoot) {
            Remove-SharpTSOwnedPayload $targetRoot $versionsRoot $Platform
        }
        throw
    }
    finally {
        foreach ($temporary in @($temporaryLink, $metadataTemporary, $stagingRoot)) {
            if ($null -ne (Get-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue)) {
                Remove-Item -LiteralPath $temporary -Recurse -Force
            }
        }
    }

    foreach ($backup in @($linkBackup, $metadataBackup)) {
        if ($null -ne (Get-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue)) {
            Remove-Item -LiteralPath $backup -Force
        }
    }
    if ($null -ne $PreviousMetadata) {
        $oldPayload = Split-Path -Parent $PreviousMetadata.Executable
        if (-not (Test-SharpTSPathEqual $oldPayload $targetRoot $Platform)) {
            try { Remove-SharpTSOwnedPayload $oldPayload $versionsRoot $Platform }
            catch { Write-Warning "The previous installer payload could not be removed: $($_.Exception.Message)" }
        }
    }

    Write-SharpTSMessage "SharpTS $ReleaseVersion was installed at $targetExecutable."
    $pathElements = @([string]$env:PATH -split ':')
    if ($pathElements -notcontains $binRoot) {
        Write-Warning "$binRoot is not on PATH. Add it to your shell profile, then open a new terminal."
    }
}

function Install-SharpTSStandalone {
    param(
        [Parameter(Mandatory = $true)]$Payload,
        [Parameter(Mandatory = $true)][string]$ReleaseVersion,
        [Parameter(Mandatory = $true)][string]$InstallMethod,
        [Parameter(Mandatory = $true)]$Platform,
        [AllowNull()]$PreviousMetadata
    )
    if ($Platform.IsWindows) {
        Install-SharpTSWindowsStandalone $Payload $ReleaseVersion $InstallMethod $Platform $PreviousMetadata
    }
    else {
        Install-SharpTSUnixStandalone $Payload $ReleaseVersion $InstallMethod $Platform $PreviousMetadata
    }
}

function Test-SharpTSInteractiveInput {
    if (-not [Environment]::UserInteractive) { return $false }
    try {
        if ([Console]::IsInputRedirected) { return $false }
    }
    catch {
        # Older hosts may not expose redirection state. Read-Host remains the final check.
    }
    return $Host.Name -ne 'ServerRemoteHost'
}

function Confirm-SharpTSAction {
    param(
        [Parameter(Mandatory = $true)][string]$Prompt,
        [switch]$AssumeYes
    )
    if ($AssumeYes) { return $true }
    if (-not (Test-SharpTSInteractiveInput)) {
        Stop-SharpTSSetup 'Confirmation requires an interactive terminal. Re-run with -Yes for unattended use.'
    }
    try { $answer = Read-Host "$Prompt [y/N]" }
    catch { Stop-SharpTSSetup 'Confirmation failed. Re-run with -Yes for unattended use.' }
    if ($answer -match '^(?i:y|yes)$') { return $true }
    Write-SharpTSMessage 'No changes were made.'
    return $false
}

function Write-SharpTSDotNetDescription {
    param([Parameter(Mandatory = $true)]$DotNetState)
    switch ($DotNetState.State) {
        'sdk10' { Write-SharpTSMessage '.NET: 10 or later SDK detected' }
        'older' { Write-SharpTSMessage '.NET: installed, but no .NET 10 or later SDK was found' }
        'command-only' { Write-SharpTSMessage '.NET: command detected, but no SDK or runtime inventory was available' }
        default { Write-SharpTSMessage '.NET: not installed' }
    }
}

function Get-SharpTSInstallMethod {
    param(
        [Parameter(Mandatory = $true)][string]$RequestedMethod,
        [Parameter(Mandatory = $true)]$DotNetState
    )
    $selectedMethod = if ($RequestedMethod -ne 'auto') {
        $RequestedMethod
    }
    elseif ($DotNetState.State -eq 'sdk10') {
        'dotnet'
    }
    else {
        'native'
    }
    if ($selectedMethod -eq 'dotnet' -and $DotNetState.State -ne 'sdk10') {
        Stop-SharpTSSetup 'The dotnet method requires a .NET 10 or later SDK. Use -Method native or -Method managed.'
    }
    return $selectedMethod
}

function Install-SharpTSDotNetTool {
    param(
        [Parameter(Mandatory = $true)][string]$ReleaseVersion,
        [Parameter(Mandatory = $true)]$DotNetState
    )
    $result = Invoke-SharpTSExternal -FilePath $DotNetState.Command -Arguments @(
        'tool', 'install', '--global', 'SharpTS', '--version', $ReleaseVersion
    )
    if ($result.ExitCode -ne 0) { Stop-SharpTSSetup 'The .NET global-tool installation failed.' }
    $installed = Get-SharpTSDotNetTool
    if ($null -eq $installed -or $installed.Version -cne $ReleaseVersion) {
        Stop-SharpTSSetup 'The installed .NET global tool did not report the expected version.'
    }
    Write-SharpTSMessage "SharpTS $ReleaseVersion was installed as a .NET global tool."
}

function Update-SharpTSDotNetTool {
    param(
        [Parameter(Mandatory = $true)][string]$ReleaseVersion,
        [Parameter(Mandatory = $true)]$DotNetState
    )
    $result = Invoke-SharpTSExternal -FilePath $DotNetState.Command -Arguments @(
        'tool', 'update', '--global', 'SharpTS', '--version', $ReleaseVersion
    )
    if ($result.ExitCode -ne 0) { Stop-SharpTSSetup 'The .NET global-tool upgrade failed.' }
    $installed = Get-SharpTSDotNetTool
    if ($null -eq $installed -or $installed.Version -cne $ReleaseVersion) {
        Stop-SharpTSSetup 'The upgraded .NET global tool did not report the expected version.'
    }
    Write-SharpTSMessage "SharpTS was upgraded to $ReleaseVersion with the .NET tool manager."
}

function Remove-SharpTSUnixStandalone {
    param(
        [Parameter(Mandatory = $true)]$Metadata,
        [Parameter(Mandatory = $true)]$Platform
    )
    $versionsRoot = Join-Path $Metadata.StateRoot 'versions'
    $payloadRoot = Split-Path -Parent $Metadata.Executable
    $linkPath = Join-Path (Get-SharpTSBinRoot $Platform) 'sharpts'
    $identifier = [Guid]::NewGuid().ToString('N')
    $linkTombstone = "$linkPath.remove-$identifier"
    $payloadTombstone = Join-Path $versionsRoot ".remove-$identifier"
    $metadataTombstone = Join-Path $Metadata.StateRoot ".install-remove-$identifier.conf"
    $linkMoved = $false
    $payloadMoved = $false
    $metadataMoved = $false

    $link = Get-Item -LiteralPath $linkPath -Force -ErrorAction SilentlyContinue
    $ownedLink = $false
    if ($null -ne $link -and (Test-SharpTSLink $linkPath)) {
        $target = Get-SharpTSLinkTarget $linkPath
        $ownedLink = $null -ne $target -and (Test-SharpTSPathEqual $target $Metadata.Executable $Platform)
    }
    elseif ($null -ne $link) {
        Write-Warning "$linkPath is not an installer-owned symbolic link and was preserved."
    }
    if ($null -ne $link -and -not $ownedLink -and (Test-SharpTSLink $linkPath)) {
        Write-Warning "$linkPath no longer points to the installer-owned binary and was preserved."
    }

    try {
        if ($ownedLink) {
            Move-Item -LiteralPath $linkPath -Destination $linkTombstone
            $linkMoved = $true
        }
        if (Test-Path -LiteralPath $payloadRoot) {
            $parent = Split-Path -Parent ([IO.Path]::GetFullPath($payloadRoot))
            if (-not (Test-SharpTSPathEqual $parent $versionsRoot $Platform)) {
                Stop-SharpTSSetup "Refusing to remove an installer payload outside $versionsRoot."
            }
            Move-Item -LiteralPath $payloadRoot -Destination $payloadTombstone
            $payloadMoved = $true
        }
        Move-Item -LiteralPath $Metadata.MetadataPath -Destination $metadataTombstone
        $metadataMoved = $true
    }
    catch {
        if ($metadataMoved) { Move-Item -LiteralPath $metadataTombstone -Destination $Metadata.MetadataPath }
        if ($payloadMoved) { Move-Item -LiteralPath $payloadTombstone -Destination $payloadRoot }
        if ($linkMoved) { Move-Item -LiteralPath $linkTombstone -Destination $linkPath }
        throw
    }

    if ($linkMoved) { Remove-Item -LiteralPath $linkTombstone -Force }
    if ($payloadMoved) { Remove-Item -LiteralPath $payloadTombstone -Recurse -Force }
    if ($metadataMoved) { Remove-Item -LiteralPath $metadataTombstone -Force }
    Remove-Item -LiteralPath $versionsRoot -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $Metadata.StateRoot -Force -ErrorAction SilentlyContinue
}

function Remove-SharpTSWindowsStandalone {
    param(
        [Parameter(Mandatory = $true)]$Metadata,
        [Parameter(Mandatory = $true)]$Platform
    )
    $binRoot = Get-SharpTSBinRoot $Platform
    $identifier = [Guid]::NewGuid().ToString('N')
    $executableTombstone = Join-Path $binRoot ".sharpts-remove-$identifier.exe"
    $metadataTombstone = Join-Path $Metadata.StateRoot ".install-remove-$identifier.conf"
    $executableMoved = $false
    $metadataMoved = $false
    $pathRemoved = $false
    try {
        if (Test-Path -LiteralPath $Metadata.Executable) {
            Move-Item -LiteralPath $Metadata.Executable -Destination $executableTombstone
            $executableMoved = $true
        }
        Move-Item -LiteralPath $Metadata.MetadataPath -Destination $metadataTombstone
        $metadataMoved = $true
        if ($Metadata.PathAdded) {
            $pathRemoved = $true
            $pathRemoved = Remove-SharpTSUserPath $binRoot $Platform
        }
    }
    catch {
        if ($pathRemoved) { [void](Add-SharpTSUserPath $binRoot $Platform) }
        if ($metadataMoved) { Move-Item -LiteralPath $metadataTombstone -Destination $Metadata.MetadataPath }
        if ($executableMoved) { Move-Item -LiteralPath $executableTombstone -Destination $Metadata.Executable }
        throw
    }
    if ($executableMoved) { Remove-Item -LiteralPath $executableTombstone -Force }
    if ($metadataMoved) { Remove-Item -LiteralPath $metadataTombstone -Force }
    Remove-Item -LiteralPath $binRoot -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $Metadata.StateRoot -Force -ErrorAction SilentlyContinue
}

function Remove-SharpTSStandalone {
    param(
        [Parameter(Mandatory = $true)]$Metadata,
        [Parameter(Mandatory = $true)]$Platform
    )
    if ($Platform.IsWindows) {
        Remove-SharpTSWindowsStandalone $Metadata $Platform
    }
    else {
        Remove-SharpTSUnixStandalone $Metadata $Platform
    }
    Write-SharpTSMessage 'SharpTS was removed.'
}

function Assert-SharpTSManagerMethod {
    param(
        [Parameter(Mandatory = $true)]$Installation,
        [Parameter(Mandatory = $true)][string]$RequestedMethod,
        [Parameter(Mandatory = $true)][string]$Operation
    )
    if ($RequestedMethod -eq 'auto') { return }
    if ($null -eq $Installation.Method -or $RequestedMethod -ne $Installation.Method) {
        Stop-SharpTSSetup "SharpTS is managed by $($Installation.Manager). Cross-manager $Operation is not supported."
    }
}

function Invoke-SharpTSInstallAction {
    param(
        [Parameter(Mandatory = $true)]$Platform,
        [AllowNull()][string]$RequestedVersion,
        [Parameter(Mandatory = $true)][string]$RequestedMethod,
        [switch]$IncludePrerelease,
        [switch]$AssumeYes
    )
    $installation = Get-SharpTSInstallation $Platform
    if ($null -ne $installation) {
        if ($installation.Manager -eq 'unmanaged') {
            Stop-SharpTSSetup "SharpTS at $($installation.Path) is not managed by setup.ps1, setup.sh, dotnet, Homebrew, or WinGet. Remove it with its original installer."
        }
        Write-SharpTSMessage "SharpTS$(if ($installation.Version) { " $($installation.Version)" }) is already installed$(if ($installation.Path) { " at $($installation.Path)" })."
        Write-SharpTSMessage 'Upgrade it with: .\setup.ps1 upgrade'
        return
    }

    $dotnet = Get-SharpTSDotNetState
    $selectedMethod = Get-SharpTSInstallMethod $RequestedMethod $dotnet
    $releaseVersion = Get-SharpTSReleaseVersion $RequestedVersion -IncludePrerelease:$IncludePrerelease
    Write-SharpTSMessage $script:ProgramName
    Write-SharpTSMessage "Platform: $($Platform.OS) $($Platform.Architecture) ($($Platform.Rid))"
    Write-SharpTSDotNetDescription $dotnet
    Write-SharpTSMessage "Version: $releaseVersion"
    Write-SharpTSMessage "Method: $selectedMethod"
    if ($selectedMethod -eq 'native') {
        Write-SharpTSMessage 'NativeAOT is optimized for straight TypeScript. Third-party .NET references, --verify, --gen-decl,'
        Write-SharpTSMessage 'and compiled child_process.fork require the managed build. Use -Method managed for those features.'
    }
    elseif ($selectedMethod -eq 'managed') {
        Write-SharpTSMessage 'The managed self-contained build includes the full SharpTS feature set and does not require system .NET.'
    }
    if (-not (Confirm-SharpTSAction "Install SharpTS ${releaseVersion}?" -AssumeYes:$AssumeYes)) { return }

    if ($selectedMethod -eq 'dotnet') {
        Install-SharpTSDotNetTool $releaseVersion $dotnet
        return
    }
    $payload = Get-SharpTSStandalonePayload $releaseVersion $selectedMethod $Platform
    try { Install-SharpTSStandalone $payload $releaseVersion $selectedMethod $Platform $null }
    finally {
        if ($null -ne $payload -and (Test-Path -LiteralPath $payload.TemporaryRoot)) {
            Remove-Item -LiteralPath $payload.TemporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Invoke-SharpTSUpgradeAction {
    param(
        [Parameter(Mandatory = $true)]$Platform,
        [AllowNull()][string]$RequestedVersion,
        [Parameter(Mandatory = $true)][string]$RequestedMethod,
        [switch]$IncludePrerelease,
        [switch]$AssumeYes
    )
    $installation = Get-SharpTSInstallation $Platform
    if ($null -eq $installation) { Stop-SharpTSSetup 'SharpTS is not installed. Run setup.ps1 install first.' }
    if ($installation.Manager -eq 'unmanaged') {
        Stop-SharpTSSetup "SharpTS at $($installation.Path) is not managed by setup.ps1, setup.sh, dotnet, Homebrew, or WinGet. Upgrade it with its original installer."
    }
    Assert-SharpTSManagerMethod $installation $RequestedMethod 'migration'

    if ($installation.Manager -eq 'brew') {
        if (-not [string]::IsNullOrWhiteSpace($RequestedVersion)) { Stop-SharpTSSetup 'Homebrew upgrades do not support -Version.' }
        if ($IncludePrerelease) { Stop-SharpTSSetup 'Homebrew upgrades do not support -Prerelease.' }
        if (-not (Confirm-SharpTSAction 'Upgrade SharpTS with Homebrew?' -AssumeYes:$AssumeYes)) { return }
        $brew = (Get-Command brew).Source
        $result = Invoke-SharpTSExternal $brew @('upgrade', 'sharpts')
        if ($result.ExitCode -ne 0) { Stop-SharpTSSetup 'The Homebrew upgrade failed.' }
        Write-SharpTSMessage 'SharpTS was upgraded with Homebrew.'
        return
    }
    if ($installation.Manager -eq 'winget') {
        if ($IncludePrerelease) { Stop-SharpTSSetup 'WinGet upgrades do not support -Prerelease.' }
        $normalizedVersion = $null
        if (-not [string]::IsNullOrWhiteSpace($RequestedVersion)) {
            $normalizedVersion = Assert-SharpTSRequestedVersion $RequestedVersion
        }
        if (-not (Confirm-SharpTSAction 'Upgrade SharpTS with WinGet?' -AssumeYes:$AssumeYes)) { return }
        $arguments = @('upgrade', '--id', $installation.PackageId, '--exact', '--source', 'winget',
            '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity')
        if ($normalizedVersion) { $arguments += @('--version', $normalizedVersion) }
        $result = Invoke-SharpTSExternal (Get-Command winget).Source $arguments
        if ($result.ExitCode -ne 0) { Stop-SharpTSSetup 'The WinGet upgrade failed.' }
        Write-SharpTSMessage 'SharpTS was upgraded with WinGet.'
        return
    }

    $dotnet = Get-SharpTSDotNetState
    if ($installation.Manager -eq 'dotnet' -and $dotnet.State -ne 'sdk10') {
        Stop-SharpTSSetup 'Upgrading the .NET global tool requires a .NET 10 or later SDK.'
    }
    $releaseVersion = Get-SharpTSReleaseVersion $RequestedVersion -IncludePrerelease:$IncludePrerelease
    if ($installation.Version -ceq $releaseVersion) {
        Write-SharpTSMessage "SharpTS $releaseVersion is already installed; no upgrade is needed."
        return
    }
    Write-SharpTSMessage "Current version: $(if ($installation.Version) { $installation.Version } else { 'unknown' })"
    Write-SharpTSMessage "Target version: $releaseVersion"
    Write-SharpTSMessage "Manager: $($installation.Manager)"
    if (-not (Confirm-SharpTSAction "Upgrade SharpTS to ${releaseVersion}?" -AssumeYes:$AssumeYes)) { return }

    if ($installation.Manager -eq 'dotnet') {
        Update-SharpTSDotNetTool $releaseVersion $dotnet
        return
    }
    $payload = Get-SharpTSStandalonePayload $releaseVersion $installation.Method $Platform
    try { Install-SharpTSStandalone $payload $releaseVersion $installation.Method $Platform $installation.Metadata }
    finally {
        if ($null -ne $payload -and (Test-Path -LiteralPath $payload.TemporaryRoot)) {
            Remove-Item -LiteralPath $payload.TemporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Invoke-SharpTSRemoveAction {
    param(
        [Parameter(Mandatory = $true)]$Platform,
        [Parameter(Mandatory = $true)][string]$RequestedMethod,
        [switch]$AssumeYes
    )
    $installation = Get-SharpTSInstallation $Platform
    if ($null -eq $installation) { Stop-SharpTSSetup 'SharpTS is not installed.' }
    if ($installation.Manager -eq 'unmanaged') {
        Stop-SharpTSSetup "SharpTS at $($installation.Path) is not managed by setup.ps1, setup.sh, dotnet, Homebrew, or WinGet. Remove it with its original installer."
    }
    Assert-SharpTSManagerMethod $installation $RequestedMethod 'removal'
    Write-SharpTSMessage "SharpTS$(if ($installation.Version) { " $($installation.Version)" }) is managed by $($installation.Manager)."
    if (-not (Confirm-SharpTSAction 'Remove SharpTS?' -AssumeYes:$AssumeYes)) { return }
    switch ($installation.Manager) {
        'standalone' { Remove-SharpTSStandalone $installation.Metadata $Platform }
        'dotnet' {
            $dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
            if ($null -eq $dotnet) { Stop-SharpTSSetup 'dotnet is required to remove the global tool.' }
            $result = Invoke-SharpTSExternal $dotnet.Source @('tool', 'uninstall', '--global', 'SharpTS')
            if ($result.ExitCode -ne 0) { Stop-SharpTSSetup 'The .NET global-tool removal failed.' }
            Write-SharpTSMessage 'SharpTS was removed with the .NET tool manager.'
        }
        'brew' {
            $result = Invoke-SharpTSExternal (Get-Command brew).Source @('uninstall', 'sharpts')
            if ($result.ExitCode -ne 0) { Stop-SharpTSSetup 'The Homebrew removal failed.' }
            Write-SharpTSMessage 'SharpTS was removed with Homebrew.'
        }
        'winget' {
            $arguments = @('uninstall', '--id', $installation.PackageId, '--exact', '--source', 'winget',
                '--disable-interactivity')
            $result = Invoke-SharpTSExternal (Get-Command winget).Source $arguments
            if ($result.ExitCode -ne 0) { Stop-SharpTSSetup 'The WinGet removal failed.' }
            Write-SharpTSMessage 'SharpTS was removed with WinGet.'
        }
    }
}

function Invoke-SharpTSSetup {
    [CmdletBinding()]
    param(
        [ValidateSet('install', 'upgrade', 'remove', 'list')]
        [string]$RequestedAction = 'install',
        [AllowNull()][string]$RequestedVersion,
        [ValidateSet('auto', 'dotnet', 'native', 'managed')]
        [string]$RequestedMethod = 'auto',
        [switch]$IncludePrerelease,
        [switch]$AssumeYes,
        [switch]$ShowHelp
    )

    if ($ShowHelp) { Show-SharpTSUsage; return }
    if ($RequestedAction -eq 'remove') {
        if (-not [string]::IsNullOrWhiteSpace($RequestedVersion)) { Stop-SharpTSSetup '-Version cannot be used with remove.' }
        if ($IncludePrerelease) { Stop-SharpTSSetup '-Prerelease cannot be used with remove.' }
    }
    if ($RequestedAction -eq 'list') {
        if (-not [string]::IsNullOrWhiteSpace($RequestedVersion)) { Stop-SharpTSSetup '-Version cannot be used with list.' }
        if ($RequestedMethod -ne 'auto') { Stop-SharpTSSetup '-Method cannot be used with list.' }
        if ($AssumeYes) { Stop-SharpTSSetup '-Yes cannot be used with list.' }
    }

    # Platform and native architecture must be known before any network request.
    $platform = Get-SharpTSPlatform
    switch ($RequestedAction) {
        'list' { Show-SharpTSReleaseList -IncludePrerelease:$IncludePrerelease }
        'install' {
            Invoke-SharpTSInstallAction $platform $RequestedVersion $RequestedMethod `
                -IncludePrerelease:$IncludePrerelease -AssumeYes:$AssumeYes
        }
        'upgrade' {
            Invoke-SharpTSUpgradeAction $platform $RequestedVersion $RequestedMethod `
                -IncludePrerelease:$IncludePrerelease -AssumeYes:$AssumeYes
        }
        'remove' { Invoke-SharpTSRemoveAction $platform $RequestedMethod -AssumeYes:$AssumeYes }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    Invoke-SharpTSSetup -RequestedAction $Action -RequestedVersion $Version -RequestedMethod $Method `
        -IncludePrerelease:$Prerelease -AssumeYes:$Yes -ShowHelp:$Help
}
