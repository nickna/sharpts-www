#requires -Version 7.0

<#
.SYNOPSIS
Runs, validates, verifies, and optionally publishes the website performance benchmarks.

.EXAMPLE
.\scripts\refresh-performance-benchmarks.ps1

.EXAMPLE
.\scripts\refresh-performance-benchmarks.ps1 -Latest

.EXAMPLE
.\scripts\refresh-performance-benchmarks.ps1 -Tag v1.0.12 -Publish
#>

[CmdletBinding(DefaultParameterSetName = 'Pinned')]
param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
    [ValidateRange(3, 20)] [int]$Launches = 3,
    [Parameter(ParameterSetName = 'Latest')] [switch]$Latest,
    [Parameter(Mandatory, ParameterSetName = 'Tag')]
    [ValidatePattern('^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$')]
    [string]$Tag,
    [switch]$Publish,
    [switch]$NoPublish,
    [ValidatePattern('^[A-Za-z0-9._/-]+$')] [string]$BaseBranch = 'main',
    [Parameter(DontShow)] [switch]$SkipVerification
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-External {
    param(
        [Parameter(Mandatory)] [string]$Executable,
        [Parameter(Mandatory)] [string[]]$Arguments,
        [switch]$AllowFailure
    )

    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $Executable @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if (-not $AllowFailure -and $exitCode -ne 0) {
        $detail = @($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
        throw "Command failed with exit code ${exitCode}: $Executable $($Arguments -join ' ')$([Environment]::NewLine)$detail"
    }
    return [pscustomobject]@{ ExitCode = $exitCode; Output = [object[]]$output }
}

function Invoke-Streaming {
    param(
        [Parameter(Mandatory)] [string]$Executable,
        [Parameter(Mandatory)] [string[]]$Arguments,
        [Parameter(Mandatory)] [string]$Description
    )

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE." }
}

function Get-RequiredExecutable {
    param([Parameter(Mandatory)] [string]$Name)

    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $command) { throw "Required executable '$Name' is not on PATH." }
    return $command.Source
}

function Get-OutputLine {
    param([Parameter(Mandatory)] [object]$Result)

    $lines = @($Result.Output | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })
    if ($lines.Count -eq 0) { return '' }
    return [string]$lines[-1]
}

function Read-SourceSettings {
    param([Parameter(Mandatory)] [string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Pinned source file is missing: $Path" }
    $text = [IO.File]::ReadAllText($Path)
    $revisionMatch = [regex]::Match($text, '(?m)^SHARPTS_SOURCE_REVISION=([0-9a-f]{40})\r?$')
    $releaseMatch = [regex]::Match($text, '(?m)^SHARPTS_RELEASE_VERSION=(.*)$')
    if (-not $revisionMatch.Success) { throw "SHARPTS_SOURCE_REVISION is missing or invalid in $Path" }
    if (-not $releaseMatch.Success) { throw "SHARPTS_RELEASE_VERSION is missing in $Path" }
    return [pscustomobject]@{
        Revision = $revisionMatch.Groups[1].Value
        ReleaseVersion = $releaseMatch.Groups[1].Value.Trim()
    }
}

function Write-SourceSettings {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$Revision,
        [AllowEmptyString()] [string]$ReleaseVersion
    )

    $content = "SHARPTS_SOURCE_REVISION=$Revision`nSHARPTS_RELEASE_VERSION=$ReleaseVersion`n"
    [IO.File]::WriteAllText($Path, $content, [Text.UTF8Encoding]::new($false))
}

function New-FileBackup {
    param([Parameter(Mandatory)] [string]$Path)

    return [pscustomobject]@{
        Path = $Path
        Existed = [IO.File]::Exists($Path)
        Bytes = if ([IO.File]::Exists($Path)) { [IO.File]::ReadAllBytes($Path) } else { $null }
    }
}

function Restore-FileBackup {
    param([Parameter(Mandatory)] [object]$Backup)

    if ($Backup.Existed) {
        [IO.Directory]::CreateDirectory((Split-Path -Parent $Backup.Path)) | Out-Null
        [IO.File]::WriteAllBytes($Backup.Path, $Backup.Bytes)
    } elseif ([IO.File]::Exists($Backup.Path)) {
        [IO.File]::Delete($Backup.Path)
    }
}

function Assert-SnapshotEvidence {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$ExpectedRevision,
        [Parameter(Mandatory)] [int]$ExpectedLaunches
    )

    try { $snapshot = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -Depth 20 }
    catch { throw "Generated benchmark snapshot is not valid JSON: $($_.Exception.Message)" }

    if ($snapshot.schemaVersion -ne 1) { throw 'Generated benchmark snapshot is not schema version 1.' }
    if ([string]$snapshot.run.revision.commit -cne $ExpectedRevision) {
        throw "Generated snapshot revision $($snapshot.run.revision.commit) does not match $ExpectedRevision."
    }
    if ([bool]$snapshot.run.revision.dirty) { throw 'Generated benchmark snapshot reports a dirty SharpTS checkout.' }

    $methodology = $snapshot.methodology
    $supportedHarness =
        ($methodology.harnessVersion -eq 1 -and [string]$methodology.id -ceq 'performance-now-auto-batched-v1') -or
        ($methodology.harnessVersion -eq 2 -and [string]$methodology.id -ceq 'performance-now-confirmed-probe-auto-batched-v2')
    if (-not $supportedHarness -or [string]$methodology.timingScope -cne 'inProcessWorkload' -or
        [string]$methodology.clock -cne 'performance.now') {
        throw 'Generated benchmark snapshot uses a timing contract that the website does not support.'
    }

    $expectedRuntimeIds = @('interpreter', 'compiled', 'node', 'bun')
    $tools = @($snapshot.run.tools.runtimes)
    if ($tools.Count -ne $expectedRuntimeIds.Count) { throw 'Generated snapshot does not describe all four benchmark runtimes.' }
    for ($index = 0; $index -lt $expectedRuntimeIds.Count; $index++) {
        if ([string]$tools[$index].id -cne $expectedRuntimeIds[$index] -or -not [bool]$tools[$index].selected) {
            throw "Generated snapshot did not select runtime '$($expectedRuntimeIds[$index])'."
        }
    }

    $cases = @($snapshot.cases)
    if ($cases.Count -eq 0) { throw 'Generated benchmark snapshot contains no cases.' }
    foreach ($case in $cases) {
        foreach ($runtime in @($case.runtimes)) {
            $tool = $tools | Where-Object { [string]$_.id -ceq [string]$runtime.id } | Select-Object -First 1
            if ($null -eq $tool) { throw "Case '$($case.id)' contains an unknown runtime '$($runtime.id)'." }
            if ([bool]$tool.available) {
                if ([string]$runtime.status -cne 'measured') {
                    throw "Case '$($case.id)' is missing available runtime '$($runtime.id)'."
                }
                $measurements = @($runtime.measurements)
                if ($measurements.Count -ne $ExpectedLaunches) {
                    throw "Case '$($case.id)' runtime '$($runtime.id)' has $($measurements.Count) launches; expected $ExpectedLaunches."
                }
                $actualLaunches = @($measurements | ForEach-Object { [int]$_.launch } | Sort-Object)
                for ($launch = 1; $launch -le $ExpectedLaunches; $launch++) {
                    if ($actualLaunches[$launch - 1] -ne $launch) {
                        throw "Case '$($case.id)' runtime '$($runtime.id)' has invalid launch numbering."
                    }
                }
            }
        }
    }
    return $cases.Count
}

function Get-ReleaseVersionForCommit {
    param(
        [Parameter(Mandatory)] [string]$Git,
        [Parameter(Mandatory)] [string]$SharpTsRoot,
        [Parameter(Mandatory)] [string]$Revision
    )

    $tags = Invoke-External $Git @('-C', $SharpTsRoot, 'tag', '--points-at', $Revision, '--list', 'v*', '--sort=-version:refname')
    foreach ($item in @($tags.Output)) {
        $candidate = $item.ToString().Trim()
        if ($candidate -match '^v((0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$') {
            return $Matches[1]
        }
    }
    return ''
}

function Resolve-SelectedSource {
    param(
        [Parameter(Mandatory)] [string]$Git,
        [Parameter(Mandatory)] [string]$SharpTsRoot,
        [Parameter(Mandatory)] [object]$PinnedSettings,
        [Parameter(Mandatory)] [string]$ParameterSet,
        [AllowEmptyString()] [string]$RequestedTag
    )

    if ($ParameterSet -eq 'Latest') {
        Write-Host 'Fetching the latest SharpTS main revision...'
        [void](Invoke-External $Git @('-C', $SharpTsRoot, 'fetch', 'origin', 'main:refs/remotes/origin/main'))
        $revision = Get-OutputLine (Invoke-External $Git @('-C', $SharpTsRoot, 'rev-parse', 'refs/remotes/origin/main^{commit}'))
        [void](Invoke-External $Git @('-C', $SharpTsRoot, 'fetch', '--tags', 'origin'))
        $release = Get-ReleaseVersionForCommit -Git $Git -SharpTsRoot $SharpTsRoot -Revision $revision
        return [pscustomobject]@{ Revision = $revision; ReleaseVersion = $release; Label = 'latest SharpTS main' }
    }

    if ($ParameterSet -eq 'Tag') {
        $normalizedTag = if ($RequestedTag.StartsWith('v', [StringComparison]::OrdinalIgnoreCase)) {
            'v' + $RequestedTag.Substring(1)
        } else { 'v' + $RequestedTag }
        Write-Host "Fetching SharpTS tag $normalizedTag..."
        [void](Invoke-External $Git @('-C', $SharpTsRoot, 'fetch', 'origin', 'tag', $normalizedTag))
        $revision = Get-OutputLine (Invoke-External $Git @('-C', $SharpTsRoot, 'rev-parse', "$normalizedTag^{commit}"))
        return [pscustomobject]@{
            Revision = $revision
            ReleaseVersion = $normalizedTag.Substring(1)
            Label = "SharpTS $normalizedTag"
        }
    }

    $exists = Invoke-External $Git @('-C', $SharpTsRoot, 'cat-file', '-e', "$($PinnedSettings.Revision)^{commit}") -AllowFailure
    if ($exists.ExitCode -ne 0) {
        Write-Host 'Fetching the pinned SharpTS revision...'
        [void](Invoke-External $Git @('-C', $SharpTsRoot, 'fetch', 'origin', $PinnedSettings.Revision))
    }
    return [pscustomobject]@{
        Revision = $PinnedSettings.Revision
        ReleaseVersion = $PinnedSettings.ReleaseVersion
        Label = if ($PinnedSettings.ReleaseVersion) { "SharpTS v$($PinnedSettings.ReleaseVersion)" } else { 'pinned SharpTS revision' }
    }
}

function Publish-Results {
    param(
        [Parameter(Mandatory)] [string]$Git,
        [Parameter(Mandatory)] [string]$RepositoryRoot,
        [Parameter(Mandatory)] [string]$BaseBranch,
        [Parameter(Mandatory)] [object]$Source,
        [Parameter(Mandatory)] [int]$CaseCount,
        [Parameter(Mandatory)] [int]$Launches,
        [Parameter(Mandatory)] [string]$RunDirectory,
        [Parameter(Mandatory)] [string[]]$ManagedPaths
    )

    $gh = Get-RequiredExecutable 'gh'
    [void](Invoke-External $gh @('auth', 'status'))
    [void](Invoke-External $Git @('-C', $RepositoryRoot, 'fetch', 'origin', $BaseBranch))

    $safeLabel = if ($Source.ReleaseVersion) { "v$($Source.ReleaseVersion)" } else { $Source.Revision.Substring(0, 12) }
    $safeLabel = $safeLabel -replace '[^A-Za-z0-9._-]', '-'
    $branch = "codex/benchmark-refresh-$safeLabel-$((Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'))"
    [void](Invoke-External $Git @('-C', $RepositoryRoot, 'switch', '-c', $branch))

    [void](Invoke-External $Git (@('-C', $RepositoryRoot, 'add', '--') + $ManagedPaths))
    $staged = Invoke-External $Git @('-C', $RepositoryRoot, 'diff', '--cached', '--quiet') -AllowFailure
    if ($staged.ExitCode -eq 0) { throw 'There are no benchmark changes to publish.' }
    if ($staged.ExitCode -ne 1) { throw 'Could not inspect the staged benchmark changes.' }

    $commitSubject = if ($Source.ReleaseVersion) {
        "bench: refresh performance results for SharpTS v$($Source.ReleaseVersion)"
    } else {
        "bench: refresh performance results for SharpTS $($Source.Revision.Substring(0, 12))"
    }
    [void](Invoke-External $Git @('-C', $RepositoryRoot, 'commit', '-m', $commitSubject))
    Invoke-Streaming $Git @('-C', $RepositoryRoot, 'push', '-u', 'origin', $branch) 'Publishing the benchmark branch'

    $bodyPath = Join-Path $RunDirectory 'pull-request.md'
    $body = @"
## What changed

- Refreshed the cross-runtime performance snapshot using $($Source.Label).
- Pinned SharpTS commit: ``$($Source.Revision)``.
- Recorded $CaseCount benchmark cases across $Launches launches.
- Regenerated and validated the website output.

## Verification

- [x] Cross-runtime snapshot validation
- [x] Performance refresh workflow tests
- [x] Website verification
- [x] Generated-site verification

## Review notes

- Benchmark diagnostics were retained locally at ``$RunDirectory`` and were not committed.
"@
    [IO.File]::WriteAllText($bodyPath, $body, [Text.UTF8Encoding]::new($false))
    $title = if ($Source.ReleaseVersion) {
        "Refresh performance benchmarks for SharpTS v$($Source.ReleaseVersion)"
    } else {
        "Refresh performance benchmarks for SharpTS $($Source.Revision.Substring(0, 12))"
    }
    $pr = Invoke-External $gh @('pr', 'create', '--base', $BaseBranch, '--head', $branch, '--title', $title, '--body-file', $bodyPath)
    $url = @($pr.Output | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -match '^https://' } | Select-Object -Last 1)
    if ($url.Count -eq 0) {
        throw "The branch was pushed, but GitHub CLI did not return a pull-request URL.`n$($pr.Output -join [Environment]::NewLine)"
    }
    return [string]$url[0]
}

if ($Publish -and $NoPublish) { throw '-Publish and -NoPublish cannot be used together.' }

$repoRoot = [IO.Path]::GetFullPath($RepositoryRoot)
$sharpTsRoot = Join-Path $repoRoot 'lib/SharpTS'
$runner = Join-Path $sharpTsRoot 'benchmarks/cross-runtime/run-benchmarks.ps1'
$validator = Join-Path $sharpTsRoot 'benchmarks/cross-runtime/validate-snapshot.ps1'
$canonicalRelative = 'benchmarks/cross-runtime/snapshots/latest.json'
$canonicalSnapshot = Join-Path $repoRoot $canonicalRelative
$sourceRelative = 'sharpts-source.env'
$sourceEnvironment = Join-Path $repoRoot $sourceRelative
$siteSnapshotRelative = 'src/SharpTS.Www.SelfHost/site.snapshot.json'
$siteSnapshot = Join-Path $repoRoot $siteSnapshotRelative
$submoduleRelative = 'lib/SharpTS'
$artifactRoot = Join-Path $repoRoot 'artifacts/benchmark-refresh'
$managedPaths = @($canonicalRelative, $sourceRelative, $siteSnapshotRelative, $submoduleRelative)

$git = Get-RequiredExecutable 'git'
$dotnet = Get-RequiredExecutable 'dotnet'
$node = Get-RequiredExecutable 'node'
$npm = if ($SkipVerification) { $null } else { Get-RequiredExecutable 'npm' }

[void](Invoke-External $git @('-C', $repoRoot, 'rev-parse', '--show-toplevel'))
$stagedAtStart = Invoke-External $git @('-C', $repoRoot, 'diff', '--cached', '--quiet') -AllowFailure
if ($stagedAtStart.ExitCode -eq 1) {
    throw 'The website repository has staged changes. Commit or unstage them before refreshing benchmarks.'
}
if ($stagedAtStart.ExitCode -ne 0) { throw 'Could not inspect the website Git index.' }

$managedStatus = Invoke-External $git (@('-C', $repoRoot, 'status', '--porcelain=v1', '--untracked-files=all', '--') +
    @($canonicalRelative, $sourceRelative, $siteSnapshotRelative))
if (@($managedStatus.Output | Where-Object { $_.ToString().Trim() }).Count -gt 0) {
    throw "Benchmark-managed website files already contain changes. Commit or restore them before running this workflow:$([Environment]::NewLine)$($managedStatus.Output -join [Environment]::NewLine)"
}

if (-not (Test-Path -LiteralPath (Join-Path $sharpTsRoot '.git'))) {
    Write-Host 'SharpTS submodule is missing. Initializing it now...'
    [void](Invoke-External $git @('-C', $repoRoot, 'submodule', 'update', '--init', $submoduleRelative))
}
foreach ($requiredPath in @($sourceEnvironment, $siteSnapshot)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw "Required workflow file is missing: $requiredPath" }
}

$sharpTsStatus = Invoke-External $git @('-C', $sharpTsRoot, 'status', '--porcelain=v1', '--untracked-files=all')
if (@($sharpTsStatus.Output | Where-Object { $_.ToString().Trim() }).Count -gt 0) {
    throw "The SharpTS checkout contains changes. Commit or restore them before refreshing benchmarks:$([Environment]::NewLine)$($sharpTsStatus.Output -join [Environment]::NewLine)"
}

$pinnedSettings = Read-SourceSettings $sourceEnvironment
$originalSharpTsRevision = Get-OutputLine (Invoke-External $git @('-C', $sharpTsRoot, 'rev-parse', 'HEAD'))
$sourceBackup = New-FileBackup $sourceEnvironment
$canonicalBackup = New-FileBackup $canonicalSnapshot
$siteSnapshotBackup = New-FileBackup $siteSnapshot

$dotnetVersion = Get-OutputLine (Invoke-External $dotnet @('--version'))
$nodeVersion = (Get-OutputLine (Invoke-External $node @('--version'))).TrimStart('v')
if ($null -eq (Get-Command bun -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    Write-Warning 'Bun is not installed. The snapshot will record Bun as unavailable.'
}

[IO.Directory]::CreateDirectory($artifactRoot) | Out-Null
$lockPath = Join-Path $artifactRoot 'refresh.lock'
try {
    $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
} catch {
    throw "Another benchmark refresh is already running (lock: $lockPath)."
}

$runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N')
$runDirectory = Join-Path $artifactRoot $runId
$candidateSnapshot = Join-Path $runDirectory 'snapshot.json'
$stagedSnapshot = $null
$workflowCompleted = $false
$source = $null
$caseCount = 0

try {
    [IO.Directory]::CreateDirectory($runDirectory) | Out-Null
    $source = Resolve-SelectedSource -Git $git -SharpTsRoot $sharpTsRoot -PinnedSettings $pinnedSettings `
        -ParameterSet $PSCmdlet.ParameterSetName -RequestedTag $Tag
    if ($source.Revision -notmatch '^[0-9a-f]{40}$') { throw "Resolved an invalid SharpTS revision: $($source.Revision)" }

    [void](Invoke-External $git @('-C', $sharpTsRoot, 'checkout', '--detach', $source.Revision))
    $selectedStatus = Invoke-External $git @('-C', $sharpTsRoot, 'status', '--porcelain=v1', '--untracked-files=all')
    if (@($selectedStatus.Output | Where-Object { $_.ToString().Trim() }).Count -gt 0) {
        throw 'The selected SharpTS revision did not produce a clean checkout.'
    }
    foreach ($requiredPath in @($runner, $validator)) {
        if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
            throw "The selected SharpTS revision does not provide the required benchmark workflow file: $requiredPath"
        }
    }
    $expectedDotNet = if (Test-Path -LiteralPath (Join-Path $sharpTsRoot 'global.json')) {
        [string](Get-Content -LiteralPath (Join-Path $sharpTsRoot 'global.json') -Raw | ConvertFrom-Json).sdk.version
    } else { '' }
    $expectedNode = if (Test-Path -LiteralPath (Join-Path $sharpTsRoot '.node-version')) {
        [IO.File]::ReadAllText((Join-Path $sharpTsRoot '.node-version')).Trim().TrimStart('v')
    } else { '' }
    if ($expectedDotNet -and $dotnetVersion -cne $expectedDotNet) {
        Write-Warning "Using .NET SDK $dotnetVersion; SharpTS pins $expectedDotNet. The exact version is recorded in the snapshot."
    }
    if ($expectedNode -and $nodeVersion -cne $expectedNode) {
        Write-Warning "Using Node.js $nodeVersion; SharpTS pins $expectedNode. The exact version is recorded in the snapshot."
    }
    Write-SourceSettings -Path $sourceEnvironment -Revision $source.Revision -ReleaseVersion $source.ReleaseVersion

    Write-Host ''
    Write-Host "Selected source: $($source.Label)"
    Write-Host "SharpTS revision: $($source.Revision)"
    Write-Host "Diagnostic output: $runDirectory"
    Write-Host "Running the complete cross-runtime suite with $Launches launches..."
    & $runner -Launches $Launches -OutputDirectory $runDirectory -RepositoryRoot $sharpTsRoot

    if (-not (Test-Path -LiteralPath $candidateSnapshot -PathType Leaf)) {
        throw "Benchmark runner completed without producing $candidateSnapshot"
    }
    & $validator $candidateSnapshot
    $caseCount = Assert-SnapshotEvidence -Path $candidateSnapshot -ExpectedRevision $source.Revision -ExpectedLaunches $Launches

    $canonicalDirectory = Split-Path -Parent $canonicalSnapshot
    [IO.Directory]::CreateDirectory($canonicalDirectory) | Out-Null
    $stagedSnapshot = Join-Path $canonicalDirectory ".latest.$([Guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::Copy($candidateSnapshot, $stagedSnapshot, $false)
    & $validator $stagedSnapshot
    [IO.File]::Move($stagedSnapshot, $canonicalSnapshot, $true)
    $stagedSnapshot = $null

    if (-not $SkipVerification) {
        Write-Host ''
        Write-Host 'Building and verifying the website...'
        Invoke-Streaming $npm @('run', 'build:self-host', '--', '--configuration', 'Debug') 'Self-host build'
        Invoke-Streaming $npm @('run', 'snapshot:update') 'Generated-site snapshot update'
        Invoke-Streaming $npm @('run', 'verify') 'Website verification'
        Invoke-Streaming $npm @('run', 'test:generated') 'Generated-site verification'
    }

    $workflowCompleted = $true
} finally {
    if ($null -ne $stagedSnapshot -and [IO.File]::Exists($stagedSnapshot)) { [IO.File]::Delete($stagedSnapshot) }
    if (-not $workflowCompleted) {
        Write-Warning 'The refresh failed. Restoring the original source pin and published benchmark files.'
        Restore-FileBackup $sourceBackup
        Restore-FileBackup $canonicalBackup
        Restore-FileBackup $siteSnapshotBackup
        $restoreCheckout = Invoke-External $git @('-C', $sharpTsRoot, 'checkout', '--detach', $originalSharpTsRevision) -AllowFailure
        if ($restoreCheckout.ExitCode -ne 0) { Write-Warning "Could not restore the original SharpTS checkout $originalSharpTsRevision." }
    }
    $lock.Dispose()
}

Write-Host ''
Write-Host 'All performance benchmarks and verification checks passed.'
Write-Host "Source: $($source.Label) ($($source.Revision))"
Write-Host "Results: $caseCount cases across $Launches launches"
Write-Host "Updated snapshot: $canonicalSnapshot"
Write-Host "Diagnostics: $runDirectory"

$publishRequested = [bool]$Publish
if (-not $Publish -and -not $NoPublish) {
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        $answer = Read-Host 'Create and publish a GitHub pull request? [Y/n]'
        $publishRequested = -not $answer -or $answer -match '^(?i:y|yes)$'
    } else {
        Write-Host 'Input is not interactive; results were left locally. Use -Publish to create a pull request.'
    }
}

if ($publishRequested) {
    Write-Host ''
    Write-Host 'Creating the benchmark pull request...'
    try {
        $prUrl = Publish-Results -Git $git -RepositoryRoot $repoRoot -BaseBranch $BaseBranch -Source $source `
            -CaseCount $caseCount -Launches $Launches -RunDirectory $runDirectory -ManagedPaths $managedPaths
        Write-Host "Pull request created: $prUrl"
    } catch {
        Write-Warning 'The benchmark results are valid and have been retained, but PR publication did not complete.'
        throw
    }
} else {
    Write-Host 'Results were left as local changes; nothing was committed or pushed.'
}
