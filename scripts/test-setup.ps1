#requires -Version 5.1

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$repoRoot = Split-Path -Parent $PSScriptRoot
$setupScript = Join-Path $repoRoot 'setup.ps1'
$shellSetupScript = Join-Path $repoRoot 'setup.sh'
$scratch = Join-Path ([IO.Path]::GetTempPath()) ("sharpts-setup-tests-" + [Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $scratch)

$savedEnvironment = @{
    HOME = $env:HOME
    LOCALAPPDATA = $env:LOCALAPPDATA
    OS = $env:OS
    PATH = $env:PATH
    PROCESSOR_ARCHITECTURE = $env:PROCESSOR_ARCHITECTURE
    PROCESSOR_ARCHITEW6432 = $env:PROCESSOR_ARCHITEW6432
    XDG_DATA_HOME = $env:XDG_DATA_HOME
}

function Assert-True {
    param([object]$Condition, [Parameter(Mandatory = $true)][string]$Message)
    if (-not [bool]$Condition) { throw "FAIL: $Message" }
}

function Assert-Equal {
    param([AllowNull()]$Actual, [AllowNull()]$Expected, [Parameter(Mandatory = $true)][string]$Message)
    if ($Actual -cne $Expected) {
        throw "FAIL: $Message`nExpected: $Expected`nActual:   $Actual"
    }
}

function Invoke-Captured {
    param([Parameter(Mandatory = $true)][scriptblock]$Operation)
    $succeeded = $true
    $messages = @()
    try { $messages += @(& $Operation *>&1 | ForEach-Object { $_.ToString() }) }
    catch {
        $succeeded = $false
        $messages += $_.Exception.Message
    }
    return [pscustomobject]@{ Succeeded = $succeeded; Output = ($messages -join "`n") }
}

$savedFunctions = @{}
function Set-TestFunction {
    param([Parameter(Mandatory = $true)][string]$Name, [Parameter(Mandatory = $true)][scriptblock]$Body)
    if (-not $savedFunctions.ContainsKey($Name)) {
        $existing = Get-Item -LiteralPath "Function:\$Name" -ErrorAction SilentlyContinue
        $savedFunctions[$Name] = if ($null -eq $existing) { $null } else { $existing.ScriptBlock }
    }
    Set-Item -LiteralPath "Function:\script:$Name" -Value $Body
}

function Restore-TestFunction {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (-not $savedFunctions.ContainsKey($Name)) { return }
    if ($null -eq $savedFunctions[$Name]) {
        Remove-Item -LiteralPath "Function:\script:$Name" -ErrorAction SilentlyContinue
    }
    else {
        Set-Item -LiteralPath "Function:\script:$Name" -Value $savedFunctions[$Name]
    }
    $savedFunctions.Remove($Name)
}

function Restore-AllTestFunctions {
    foreach ($name in @($savedFunctions.Keys)) { Restore-TestFunction $name }
}

function Set-IsolatedRoots {
    param([Parameter(Mandatory = $true)][string]$Name)
    $root = Join-Path $scratch $Name
    $env:HOME = Join-Path $root 'home'
    $env:XDG_DATA_HOME = Join-Path $root 'data'
    $env:LOCALAPPDATA = Join-Path $root 'local-app-data'
    [void](New-Item -ItemType Directory -Path $env:HOME -Force)
    [void](New-Item -ItemType Directory -Path $env:XDG_DATA_HOME -Force)
    [void](New-Item -ItemType Directory -Path $env:LOCALAPPDATA -Force)
    return $root
}

function New-UnixPayload {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$PayloadVersion
    )
    [void](New-Item -ItemType Directory -Path $Root -Force)
    $executable = Join-Path $Root 'sharpts'
    $content = "#!/bin/sh`nif [ `"`${1:-}`" = `"--version`" ]; then printf 'sharpts $PayloadVersion\n'; exit 0; fi`n"
    [IO.File]::WriteAllText($executable, $content, (New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $Root 'LICENSE'), "fixture license`n", (New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $Root 'README.md'), "fixture readme`n", (New-Object Text.UTF8Encoding($false)))
    $chmod = (Get-Command chmod -ErrorAction Stop).Source
    $chmodResult = Invoke-SharpTSExternal $chmod @('+x', $executable)
    Assert-True ($chmodResult.ExitCode -eq 0) 'Could not make the Unix fixture executable.'
    return [pscustomobject]@{ TemporaryRoot = $Root; PayloadRoot = $Root; Executable = $executable }
}

function New-WindowsPayload {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Content
    )
    [void](New-Item -ItemType Directory -Path $Root -Force)
    $executable = Join-Path $Root 'sharpts.exe'
    [IO.File]::WriteAllText($executable, $Content, (New-Object Text.UTF8Encoding($false)))
    return [pscustomobject]@{ TemporaryRoot = $Root; PayloadRoot = $Root; Executable = $executable }
}

try {
    $tokens = $null
    $parseErrors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($setupScript, [ref]$tokens, [ref]$parseErrors)
    Assert-True ($parseErrors.Count -eq 0) 'setup.ps1 has PowerShell syntax errors.'
    Assert-True (-not [IO.File]::ReadAllText($setupScript).Contains("`r")) `
        'setup.ps1 must use LF line endings.'
    Assert-True (-not [IO.File]::ReadAllText($PSCommandPath).Contains("`r")) `
        'scripts/test-setup.ps1 must use LF line endings.'

    . $setupScript
    $actualPlatform = Get-SharpTSPlatform
    Assert-True ($actualPlatform.Rid -in @('win-x64', 'win-arm64', 'linux-x64', 'linux-arm64', 'osx-arm64')) `
        "The current runner mapped to an unsupported RID: $($actualPlatform.Rid)"

    # Native Windows architecture must win over an emulated process architecture.
    $env:OS = 'Windows_NT'
    $env:PROCESSOR_ARCHITECTURE = 'AMD64'
    $env:PROCESSOR_ARCHITEW6432 = 'ARM64'
    $emulatedPlatform = Get-SharpTSPlatform
    Assert-Equal $emulatedPlatform.Rid 'win-arm64' 'Emulated Windows PowerShell did not select native arm64.'
    $env:PROCESSOR_ARCHITEW6432 = $null
    $env:PROCESSOR_ARCHITECTURE = 'RISCV64'
    $unsupported = Invoke-Captured { Get-SharpTSPlatform }
    Assert-True (-not $unsupported.Succeeded) 'RISC-V Windows should be rejected.'
    $env:OS = $savedEnvironment.OS
    $env:PROCESSOR_ARCHITECTURE = $savedEnvironment.PROCESSOR_ARCHITECTURE
    $env:PROCESSOR_ARCHITEW6432 = $savedEnvironment.PROCESSOR_ARCHITEW6432

    # Unsupported platforms must fail in the dispatcher before any network-capable action runs.
    $script:NetworkCalls = 0
    Set-TestFunction 'Get-SharpTSPlatform' { Stop-SharpTSSetup 'unsupported test platform' }
    Set-TestFunction 'Show-SharpTSReleaseList' { param([switch]$IncludePrerelease); $script:NetworkCalls++ }
    $fastFailure = Invoke-Captured { Invoke-SharpTSSetup -RequestedAction list }
    Assert-True (-not $fastFailure.Succeeded) 'Unsupported platform dispatch should fail.'
    Assert-Equal $script:NetworkCalls 0 'Unsupported platform dispatch reached a network action.'
    Restore-TestFunction 'Get-SharpTSPlatform'
    Restore-TestFunction 'Show-SharpTSReleaseList'

    Assert-Equal (Assert-SharpTSRequestedVersion 'v1.2.3') '1.2.3' 'Stable version normalization failed.'
    $prereleaseFailure = Invoke-Captured { Assert-SharpTSRequestedVersion '1.3.0-rc.1' }
    Assert-True (-not $prereleaseFailure.Succeeded -and $prereleaseFailure.Output.Contains('-Prerelease')) `
        'Explicit prereleases should require -Prerelease.'
    Assert-Equal (Assert-SharpTSRequestedVersion '1.3.0-rc.1' -IncludePrerelease) '1.3.0-rc.1' `
        'Explicit prerelease selection failed.'

    $script:ReleaseMode = 'stable'
    Set-TestFunction 'Get-SharpTSGitHubJson' {
        param([string]$Uri)
        if ($Uri.EndsWith('/latest')) {
            return [pscustomobject]@{ tag_name = 'v1.2.3'; draft = $false; prerelease = $false }
        }
        return @(
            [pscustomobject]@{ tag_name = 'v1.3.0-rc.1'; draft = $false; prerelease = $true },
            [pscustomobject]@{ tag_name = 'v1.2.3'; draft = $false; prerelease = $false },
            [pscustomobject]@{ tag_name = 'v1.1.0'; draft = $false; prerelease = $false }
        )
    }
    Assert-Equal (Get-SharpTSReleaseVersion $null) '1.2.3' 'Latest stable selection failed.'
    Assert-Equal (Get-SharpTSReleaseVersion $null -IncludePrerelease) '1.3.0-rc.1' `
        'Latest prerelease-inclusive selection failed.'
    $stableList = Invoke-Captured { Show-SharpTSReleaseList }
    Assert-True ($stableList.Output.Contains('1.2.3') -and -not $stableList.Output.Contains('1.3.0-rc.1')) `
        'Stable release listing included a prerelease.'
    $allList = Invoke-Captured { Show-SharpTSReleaseList -IncludePrerelease }
    Assert-True ($allList.Output.Contains('1.3.0-rc.1')) 'Prerelease listing omitted the prerelease.'
    Restore-TestFunction 'Get-SharpTSGitHubJson'

    $malformed = Invoke-Captured { Invoke-SharpTSSetup -RequestedAction list -AssumeYes }
    Assert-True (-not $malformed.Succeeded -and $malformed.Output.Contains('-Yes cannot be used with list')) `
        'Invalid list parameters were accepted.'
    Set-TestFunction 'Test-SharpTSInteractiveInput' { return $false }
    $confirmation = Invoke-Captured { Confirm-SharpTSAction 'Install?' }
    Assert-True (-not $confirmation.Succeeded -and $confirmation.Output.Contains('Re-run with -Yes')) `
        'Unattended confirmation did not require -Yes.'
    Assert-True (Confirm-SharpTSAction 'Install?' -AssumeYes) '-Yes did not bypass confirmation.'
    Restore-TestFunction 'Test-SharpTSInteractiveInput'

    $dotnetStateCalls = 0
    Set-TestFunction 'Invoke-SharpTSExternal' {
        param([string]$FilePath, [string[]]$Arguments = @())
        if ($Arguments[0] -eq '--list-sdks') {
            return [pscustomobject]@{ ExitCode = 0; Lines = @('9.0.100 [fixture]', '10.0.100 [fixture]'); Text = '' }
        }
        return [pscustomobject]@{ ExitCode = 0; Lines = @(); Text = '' }
    }
    $dotnetState = Get-SharpTSDotNetState
    Assert-Equal $dotnetState.State 'sdk10' '.NET 10 SDK detection failed.'
    Assert-Equal (Get-SharpTSInstallMethod 'auto' $dotnetState) 'dotnet' `
        'Automatic method selection did not prefer the .NET global tool.'
    Assert-Equal (Get-SharpTSInstallMethod 'auto' ([pscustomobject]@{ State = 'older' })) 'native' `
        'Automatic method selection did not fall back to NativeAOT.'
    Assert-Equal (Get-SharpTSInstallMethod 'managed' ([pscustomobject]@{ State = 'none' })) 'managed' `
        'The explicit managed method was not preserved.'
    $missingSdk = Invoke-Captured {
        Get-SharpTSInstallMethod 'dotnet' ([pscustomobject]@{ State = 'older' })
    }
    Assert-True (-not $missingSdk.Succeeded -and $missingSdk.Output.Contains('.NET 10')) `
        'The explicit dotnet method did not require a .NET 10 SDK.'
    Restore-TestFunction 'Invoke-SharpTSExternal'

    Assert-SharpTSArchiveEntries @('./', './sharpts', './LICENSE', './README.md') 'sharpts'
    $badArchive = Invoke-Captured { Assert-SharpTSArchiveEntries @('./sharpts', '../outside') 'sharpts' }
    Assert-True (-not $badArchive.Succeeded -and $badArchive.Output.Contains('unexpected path')) `
        'Archive traversal was not rejected.'
    $duplicateArchive = Invoke-Captured { Assert-SharpTSArchiveEntries @('sharpts', './sharpts') 'sharpts' }
    Assert-True (-not $duplicateArchive.Succeeded -and $duplicateArchive.Output.Contains('duplicate path')) `
        'Duplicate archive entries were not rejected.'

    # Exercise exact release-asset selection, digest verification, extraction, and version verification.
    $archiveRoot = Join-Path $scratch 'release-archive'
    $archiveSource = Join-Path $archiveRoot 'source'
    [void](New-Item -ItemType Directory -Path $archiveRoot -Force)
    if ($actualPlatform.IsWindows) {
        $archivePayload = New-WindowsPayload $archiveSource 'fixture executable'
        [IO.File]::WriteAllText((Join-Path $archiveSource 'LICENSE'), 'license')
        [IO.File]::WriteAllText((Join-Path $archiveSource 'README.md'), 'readme')
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $script:ArchiveFixture = Join-Path $archiveRoot 'fixture.zip'
        [IO.Compression.ZipFile]::CreateFromDirectory($archiveSource, $script:ArchiveFixture)
        Set-TestFunction 'Get-SharpTSExecutableVersion' { param([string]$Executable); return $script:ReportedVersion }
        $script:ReportedVersion = '1.2.3'
    }
    else {
        $archivePayload = New-UnixPayload $archiveSource '1.2.3'
        $script:ArchiveFixture = Join-Path $archiveRoot 'fixture.tar.gz'
        $tarResult = Invoke-SharpTSExternal (Get-Command tar).Source @(
            '-czf', $script:ArchiveFixture, '-C', $archiveSource, '.'
        )
        Assert-True ($tarResult.ExitCode -eq 0) 'Could not create the release archive fixture.'
    }
    $script:ArchiveDigest = (Get-FileHash -LiteralPath $script:ArchiveFixture -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-TestFunction 'Get-SharpTSGitHubJson' {
        param([string]$Uri)
        $extension = if ($actualPlatform.IsWindows) { 'zip' } else { 'tar.gz' }
        $assets = @()
        foreach ($prefix in @('sharpts-native', 'sharpts')) {
            $name = "$prefix-1.2.3-$($actualPlatform.Rid).$extension"
            $assets += [pscustomobject]@{
                name = $name
                digest = "sha256:$($script:ArchiveDigest)"
                browser_download_url = "$($script:GitHubDownloads)/v1.2.3/$name"
            }
        }
        return [pscustomobject]@{ tag_name = 'v1.2.3'; assets = $assets }
    }
    Set-TestFunction 'Invoke-WebRequest' {
        param([string]$Uri, [string]$OutFile, [switch]$UseBasicParsing, [string]$UserAgent)
        Copy-Item -LiteralPath $script:ArchiveFixture -Destination $OutFile
    }
    foreach ($installMethod in @('native', 'managed')) {
        $downloaded = Get-SharpTSStandalonePayload '1.2.3' $installMethod $actualPlatform
        Assert-True (Test-Path -LiteralPath $downloaded.Executable -PathType Leaf) `
            "$installMethod release payload was not extracted."
        Remove-Item -LiteralPath $downloaded.TemporaryRoot -Recurse -Force
    }
    $goodDigest = $script:ArchiveDigest
    $script:ArchiveDigest = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    $digestFailure = Invoke-Captured { Get-SharpTSStandalonePayload '1.2.3' 'native' $actualPlatform }
    Assert-True (-not $digestFailure.Succeeded -and $digestFailure.Output.Contains('SHA-256 verification failed')) `
        'A release digest mismatch was accepted.'
    $script:ArchiveDigest = $goodDigest
    if ($actualPlatform.IsWindows) {
        $script:ReportedVersion = '9.9.9'
        $versionFailure = Invoke-Captured { Get-SharpTSStandalonePayload '1.2.3' 'native' $actualPlatform }
        Assert-True (-not $versionFailure.Succeeded -and $versionFailure.Output.Contains("reports version '9.9.9'")) `
            'A release executable with the wrong version was accepted.'
        Restore-TestFunction 'Get-SharpTSExecutableVersion'
    }
    Restore-TestFunction 'Get-SharpTSGitHubJson'
    Restore-TestFunction 'Invoke-WebRequest'

    if ($actualPlatform.IsWindows) {
        $caseRoot = Set-IsolatedRoots 'windows-activation'
        $platform = [pscustomobject]@{ OS = 'Windows'; Architecture = 'x64'; Rid = 'win-x64'; IsWindows = $true }
        $script:MockUserPath = 'C:\Existing'
        $script:ReportedVersion = '1.2.3'
        Set-TestFunction 'Get-SharpTSUserPath' { return $script:MockUserPath }
        Set-TestFunction 'Set-SharpTSUserPath' { param([string]$Value); $script:MockUserPath = $Value }
        Set-TestFunction 'Get-SharpTSExecutableVersion' { param([string]$Executable); return $script:ReportedVersion }

        $payload123 = New-WindowsPayload (Join-Path $caseRoot 'payload-123') 'payload 1.2.3'
        Install-SharpTSWindowsStandalone $payload123 '1.2.3' 'native' $platform $null
        $metadata123 = Get-SharpTSValidatedMetadata $platform
        Assert-Equal $metadata123.Version '1.2.3' 'Windows metadata did not record the installed version.'
        Assert-True $metadata123.PathAdded 'Windows installer did not record PATH ownership.'
        Assert-True ($script:MockUserPath.Contains((Get-SharpTSBinRoot $platform))) 'Windows user PATH was not updated.'

        $payload130 = New-WindowsPayload (Join-Path $caseRoot 'payload-130') 'payload 1.3.0'
        $script:ReportedVersion = '1.3.0'
        Install-SharpTSWindowsStandalone $payload130 '1.3.0' 'native' $platform $metadata123
        $metadata130 = Get-SharpTSValidatedMetadata $platform
        Assert-Equal $metadata130.Version '1.3.0' 'Windows atomic upgrade did not update metadata.'

        $payload140 = New-WindowsPayload (Join-Path $caseRoot 'payload-140') 'payload 1.4.0'
        $script:ReportedVersion = 'wrong'
        $failedUpgrade = Invoke-Captured {
            Install-SharpTSWindowsStandalone $payload140 '1.4.0' 'native' $platform $metadata130
        }
        Assert-True (-not $failedUpgrade.Succeeded) 'A failed Windows activation unexpectedly succeeded.'
        Assert-Equal (Get-Content -Raw -LiteralPath $metadata130.Executable) 'payload 1.3.0' `
            'A failed Windows activation did not restore the previous executable.'
        Assert-Equal (Get-SharpTSValidatedMetadata $platform).Version '1.3.0' `
            'A failed Windows activation did not restore previous metadata.'

        Remove-SharpTSWindowsStandalone (Get-SharpTSValidatedMetadata $platform) $platform
        Assert-True (-not (Test-Path -LiteralPath $metadata130.Executable)) 'Windows removal left the executable behind.'
        Assert-Equal $script:MockUserPath 'C:\Existing' 'Windows removal did not reverse the installer-owned PATH change.'

        $occupiedRoot = Set-IsolatedRoots 'windows-occupied'
        $occupiedBin = Get-SharpTSBinRoot $platform
        [void](New-Item -ItemType Directory -Path $occupiedBin -Force)
        [IO.File]::WriteAllText((Join-Path $occupiedBin 'sharpts.cmd'), 'user-owned')
        $script:ReportedVersion = '1.2.3'
        $occupiedResult = Invoke-Captured {
            Install-SharpTSWindowsStandalone $payload123 '1.2.3' 'native' $platform $null
        }
        Assert-True (-not $occupiedResult.Succeeded -and $occupiedResult.Output.Contains('not installer-owned')) `
            'An occupied Windows command path was overwritten.'
        Restore-TestFunction 'Get-SharpTSUserPath'
        Restore-TestFunction 'Set-SharpTSUserPath'
        Restore-TestFunction 'Get-SharpTSExecutableVersion'
    }
    else {
        $caseRoot = Set-IsolatedRoots 'unix-activation'
        $platform = $actualPlatform
        $env:PATH = "$($env:HOME)/.local/bin:$($savedEnvironment.PATH)"
        $payload123 = New-UnixPayload (Join-Path $caseRoot 'payload-123') '1.2.3'
        Install-SharpTSUnixStandalone $payload123 '1.2.3' 'native' $platform $null
        $metadata123 = Get-SharpTSValidatedMetadata $platform
        Assert-Equal $metadata123.Version '1.2.3' 'Unix metadata did not record the installed version.'
        Assert-Equal (Get-SharpTSExecutableVersion (Join-Path (Get-SharpTSBinRoot $platform) 'sharpts')) '1.2.3' `
            'The Unix installer link did not run.'

        $payload130 = New-UnixPayload (Join-Path $caseRoot 'payload-130') '1.3.0'
        Install-SharpTSUnixStandalone $payload130 '1.3.0' 'native' $platform $metadata123
        $metadata130 = Get-SharpTSValidatedMetadata $platform
        Assert-Equal $metadata130.Version '1.3.0' 'Unix atomic upgrade did not update metadata.'
        Assert-True (-not (Test-Path -LiteralPath (Split-Path -Parent $metadata123.Executable))) `
            'Unix atomic upgrade left the old payload behind.'

        $badPayload = New-UnixPayload (Join-Path $caseRoot 'payload-bad') '9.9.9'
        $failedUpgrade = Invoke-Captured {
            Install-SharpTSUnixStandalone $badPayload '1.4.0' 'native' $platform $metadata130
        }
        Assert-True (-not $failedUpgrade.Succeeded) 'A failed Unix activation unexpectedly succeeded.'
        Assert-Equal (Get-SharpTSExecutableVersion (Join-Path (Get-SharpTSBinRoot $platform) 'sharpts')) '1.3.0' `
            'A failed Unix activation did not restore the previous command link.'
        Assert-Equal (Get-SharpTSValidatedMetadata $platform).Version '1.3.0' `
            'A failed Unix activation did not restore previous metadata.'
        Remove-SharpTSUnixStandalone (Get-SharpTSValidatedMetadata $platform) $platform

        # setup.ps1 must remove metadata and links created with setup.sh's contract.
        $shellRoot = Set-IsolatedRoots 'shell-to-powershell'
        $stateRoot = Get-SharpTSDataRoot $platform
        $versionsRoot = Join-Path $stateRoot 'versions'
        $payloadRoot = Join-Path $versionsRoot '1.2.3-native'
        $shellPayload = New-UnixPayload $payloadRoot '1.2.3'
        $binRoot = Get-SharpTSBinRoot $platform
        [void](New-Item -ItemType Directory -Path $binRoot -Force)
        [void](New-Item -ItemType SymbolicLink -Path (Join-Path $binRoot 'sharpts') -Target $shellPayload.Executable)
        [void](New-Item -ItemType Directory -Path $stateRoot -Force)
        Write-SharpTSUtf8File (Join-Path $stateRoot 'install.conf') ((@(
            'INSTALL_METHOD=native', 'VERSION=1.2.3', "RID=$($platform.Rid)",
            "EXECUTABLE=$($shellPayload.Executable)"
        ) -join "`n") + "`n")
        Remove-SharpTSUnixStandalone (Get-SharpTSValidatedMetadata $platform) $platform
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $stateRoot 'install.conf'))) `
            'PowerShell did not remove shell-compatible metadata.'

        # setup.sh must manage a standalone installation activated by setup.ps1.
        $powershellRoot = Set-IsolatedRoots 'powershell-to-shell'
        $env:PATH = "$($env:HOME)/.local/bin:$($savedEnvironment.PATH)"
        $managedPayload = New-UnixPayload (Join-Path $powershellRoot 'payload-managed') '1.2.3'
        Install-SharpTSUnixStandalone $managedPayload '1.2.3' 'managed' $platform $null
        $shellRemoval = Invoke-SharpTSExternal (Get-Command sh).Source @($shellSetupScript, 'remove', '--yes')
        Assert-True ($shellRemoval.ExitCode -eq 0) "setup.sh could not remove a PowerShell-created install: $($shellRemoval.Text)"
        Assert-True (-not (Test-Path -LiteralPath (Join-Path (Get-SharpTSDataRoot $platform) 'install.conf'))) `
            'setup.sh left PowerShell-created metadata behind.'
    }

    $unsafeRoot = Set-IsolatedRoots 'unsafe-metadata'
    $unsafePlatform = if ($actualPlatform.IsWindows) {
        [pscustomobject]@{ OS = 'Windows'; Architecture = 'x64'; Rid = 'win-x64'; IsWindows = $true }
    }
    else { $actualPlatform }
    $stateRoot = Get-SharpTSDataRoot $unsafePlatform
    [void](New-Item -ItemType Directory -Path $stateRoot -Force)
    $outside = Join-Path $unsafeRoot 'outside/sharpts'
    [void](New-Item -ItemType Directory -Path (Split-Path -Parent $outside) -Force)
    [IO.File]::WriteAllText($outside, 'preserve me')
    $unsafeLines = @('INSTALL_METHOD=native', 'VERSION=1.2.3', "RID=$($unsafePlatform.Rid)", "EXECUTABLE=$outside")
    if ($unsafePlatform.IsWindows) { $unsafeLines += 'PATH_ADDED=false' }
    Write-SharpTSUtf8File (Join-Path $stateRoot 'install.conf') (($unsafeLines -join "`n") + "`n")
    $unsafeResult = Invoke-Captured { Get-SharpTSValidatedMetadata $unsafePlatform }
    Assert-True (-not $unsafeResult.Succeeded -and $unsafeResult.Output.Contains('unsafe executable path')) `
        'Unsafe installer metadata was accepted.'
    Assert-True (Test-Path -LiteralPath $outside) 'Unsafe metadata caused an external file to be removed.'

    # Parse the command output contracts used to recognize existing package managers.
    Set-TestFunction 'Get-Command' {
        [CmdletBinding()]
        param([Parameter(Position = 0)][string]$Name, [object]$CommandType)
        return [pscustomobject]@{ Source = "$Name-fixture" }
    }
    Set-TestFunction 'Invoke-SharpTSExternal' {
        param([string]$FilePath, [string[]]$Arguments = @())
        $joined = $Arguments -join ' '
        if ($FilePath -eq 'dotnet-fixture' -and $joined -eq 'tool list --global') {
            return [pscustomobject]@{ ExitCode = 0; Lines = @('Package Id Version Commands', 'sharpts 1.2.3 sharpts');
                Text = "Package Id Version Commands`nsharpts 1.2.3 sharpts" }
        }
        if ($FilePath -eq 'brew-fixture' -and $joined -eq 'list --formula sharpts') {
            return [pscustomobject]@{ ExitCode = 0; Lines = @('sharpts'); Text = 'sharpts' }
        }
        if ($FilePath -eq 'brew-fixture' -and $joined -eq 'list --versions sharpts') {
            return [pscustomobject]@{ ExitCode = 0; Lines = @('sharpts 1.2.3'); Text = 'sharpts 1.2.3' }
        }
        if ($FilePath -eq 'brew-fixture' -and $joined -eq '--prefix') {
            return [pscustomobject]@{ ExitCode = 0; Lines = @('/fixture/homebrew'); Text = '/fixture/homebrew' }
        }
        if ($FilePath -eq 'winget-fixture' -and $joined.Contains('SharpTS.SharpTS.NativeAOT')) {
            $line = 'SharpTS Native SharpTS.SharpTS.NativeAOT 1.2.3 winget'
            return [pscustomobject]@{ ExitCode = 0; Lines = @($line); Text = $line }
        }
        return [pscustomobject]@{ ExitCode = 1; Lines = @(); Text = '' }
    }
    Assert-Equal (Get-SharpTSDotNetTool).Version '1.2.3' 'The dotnet global tool was not recognized.'
    Assert-Equal (Get-SharpTSHomebrewInstallation).Version '1.2.3' 'The Homebrew formula was not recognized.'
    $winGetInstallations = @(Get-SharpTSWinGetInstallations)
    Assert-Equal $winGetInstallations.Count 1 'The exact WinGet package ID was not recognized.'
    Assert-Equal $winGetInstallations[0].Method 'native' 'The NativeAOT WinGet package mapped to the wrong method.'
    Restore-TestFunction 'Get-Command'
    Restore-TestFunction 'Invoke-SharpTSExternal'

    # Existing dotnet, Homebrew, and WinGet installations keep their manager for lifecycle actions.
    $script:ManagerCommands = @()
    $script:ManagerTargetVersion = '1.3.0'
    Set-TestFunction 'Get-SharpTSInstallation' { param($Platform); return $script:MockInstallation }
    Set-TestFunction 'Get-SharpTSDotNetState' {
        return [pscustomobject]@{ State = 'sdk10'; Command = 'dotnet-fixture' }
    }
    Set-TestFunction 'Get-SharpTSReleaseVersion' {
        param([string]$RequestedVersion, [switch]$IncludePrerelease); return $script:ManagerTargetVersion
    }
    Set-TestFunction 'Get-SharpTSDotNetTool' {
        return [pscustomobject]@{ Version = $script:ManagerTargetVersion }
    }
    Set-TestFunction 'Get-Command' {
        [CmdletBinding()]
        param([Parameter(Position = 0)][string]$Name, [object]$CommandType)
        return [pscustomobject]@{ Source = "$Name-fixture" }
    }
    Set-TestFunction 'Invoke-SharpTSExternal' {
        param([string]$FilePath, [string[]]$Arguments = @())
        $script:ManagerCommands += "$FilePath $($Arguments -join ' ')"
        return [pscustomobject]@{ ExitCode = 0; Lines = @(); Text = '' }
    }

    $script:MockInstallation = [pscustomobject]@{
        Manager = 'dotnet'; Method = 'dotnet'; Version = '1.2.3'; Path = 'fixture'; PackageId = 'SharpTS'
    }
    Invoke-SharpTSUpgradeAction $actualPlatform $null 'auto' -AssumeYes
    Invoke-SharpTSRemoveAction $actualPlatform 'auto' -AssumeYes
    Assert-True (($script:ManagerCommands -join "`n").Contains('tool update --global SharpTS --version 1.3.0')) `
        'The dotnet manager was not used for upgrade.'
    Assert-True (($script:ManagerCommands -join "`n").Contains('tool uninstall --global SharpTS')) `
        'The dotnet manager was not used for removal.'

    $script:MockInstallation = [pscustomobject]@{
        Manager = 'brew'; Method = $null; Version = '1.2.3'; Path = 'fixture'; PackageId = 'sharpts'
    }
    Invoke-SharpTSUpgradeAction $actualPlatform $null 'auto' -AssumeYes
    Invoke-SharpTSRemoveAction $actualPlatform 'auto' -AssumeYes
    Assert-True (($script:ManagerCommands -join "`n").Contains('brew-fixture upgrade sharpts')) `
        'Homebrew was not preserved for upgrade.'
    Assert-True (($script:ManagerCommands -join "`n").Contains('brew-fixture uninstall sharpts')) `
        'Homebrew was not preserved for removal.'

    $script:MockInstallation = [pscustomobject]@{
        Manager = 'winget'; Method = 'native'; Version = '1.2.3'; Path = 'fixture';
        PackageId = 'SharpTS.SharpTS.NativeAOT'
    }
    Invoke-SharpTSUpgradeAction $actualPlatform '1.3.0' 'native' -AssumeYes
    Invoke-SharpTSRemoveAction $actualPlatform 'native' -AssumeYes
    Assert-True (($script:ManagerCommands -join "`n").Contains('winget-fixture upgrade --id SharpTS.SharpTS.NativeAOT')) `
        'WinGet was not preserved for upgrade.'
    Assert-True (($script:ManagerCommands -join "`n").Contains('winget-fixture uninstall --id SharpTS.SharpTS.NativeAOT')) `
        'WinGet was not preserved for removal.'
    foreach ($name in @('Get-SharpTSInstallation', 'Get-SharpTSDotNetState', 'Get-SharpTSReleaseVersion',
            'Get-SharpTSDotNetTool', 'Get-Command', 'Invoke-SharpTSExternal')) {
        Restore-TestFunction $name
    }

    # Manager conflicts are detected before lifecycle operations.
    Set-TestFunction 'Get-SharpTSValidatedMetadata' { param($Platform); return $null }
    Set-TestFunction 'Get-SharpTSDotNetTool' {
        return [pscustomobject]@{ Manager = 'dotnet'; Method = 'dotnet'; Version = '1.2.3'; Path = 'fixture';
            Description = 'dotnet fixture'; PackageId = 'SharpTS' }
    }
    if ($actualPlatform.IsWindows) {
        Set-TestFunction 'Get-SharpTSWinGetInstallations' {
            return @([pscustomobject]@{ Manager = 'winget'; Method = 'native'; Version = '1.2.3'; Path = $null;
                Description = 'WinGet fixture'; PackageId = 'SharpTS.SharpTS.NativeAOT' })
        }
    }
    else {
        Set-TestFunction 'Get-SharpTSHomebrewInstallation' {
            return [pscustomobject]@{ Manager = 'brew'; Method = $null; Version = '1.2.3'; Path = 'fixture';
                Description = 'Homebrew fixture'; PackageId = 'sharpts' }
        }
    }
    $conflict = Invoke-Captured { Get-SharpTSInstallation $actualPlatform }
    Assert-True (-not $conflict.Succeeded -and $conflict.Output.Contains('Remove the extra installation')) `
        "Multiple package managers were not rejected. Output: $($conflict.Output)"
    Restore-AllTestFunctions

    Write-Host 'SharpTS setup.ps1 tests passed.'
}
finally {
    Restore-AllTestFunctions
    foreach ($name in $savedEnvironment.Keys) {
        Set-Item -LiteralPath "Env:\$name" -Value $savedEnvironment[$name] -ErrorAction SilentlyContinue
        if ($null -eq $savedEnvironment[$name]) { Remove-Item -LiteralPath "Env:\$name" -ErrorAction SilentlyContinue }
    }
    $resolvedScratch = [IO.Path]::GetFullPath($scratch)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedScratch.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedScratch).StartsWith('sharpts-setup-tests-')) {
        Remove-Item -LiteralPath $resolvedScratch -Recurse -Force -ErrorAction SilentlyContinue
    }
}
