#requires -Version 7.0

[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),

    [ValidateRange(3, 20)]
    [int]$Launches = 3
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

function Get-RequiredExecutable {
    param([Parameter(Mandatory)] [string]$Name)

    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $command) { throw "Required executable '$Name' is not on PATH." }
    return $command.Source
}

function Read-PinnedRevision {
    param([Parameter(Mandatory)] [string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Pinned source file is missing: $Path" }
    $match = [regex]::Match([IO.File]::ReadAllText($Path), '(?m)^SHARPTS_SOURCE_REVISION=([0-9a-f]{40})$')
    if (-not $match.Success) { throw "SHARPTS_SOURCE_REVISION is missing or invalid in $Path" }
    return $match.Groups[1].Value
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
    if ([bool]$snapshot.run.revision.dirty) {
        throw 'Generated benchmark snapshot reports a dirty SharpTS checkout.'
    }

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
    if ($tools.Count -ne $expectedRuntimeIds.Count) {
        throw 'Generated snapshot does not describe all four benchmark runtimes.'
    }
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

$repoRoot = [IO.Path]::GetFullPath($RepositoryRoot)
$sharpTsRoot = Join-Path $repoRoot 'lib/SharpTS'
$runner = Join-Path $sharpTsRoot 'benchmarks/cross-runtime/run-benchmarks.ps1'
$validator = Join-Path $sharpTsRoot 'benchmarks/cross-runtime/validate-snapshot.ps1'
$canonicalRelative = 'benchmarks/cross-runtime/snapshots/latest.json'
$canonicalSnapshot = Join-Path $sharpTsRoot $canonicalRelative
$sourceEnvironment = Join-Path $repoRoot 'sharpts-source.env'
$artifactRoot = Join-Path $repoRoot 'artifacts/benchmark-refresh'

$git = Get-RequiredExecutable 'git'
$dotnet = Get-RequiredExecutable 'dotnet'
$node = Get-RequiredExecutable 'node'

if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
    Write-Host 'SharpTS submodule is missing. Initializing it now...'
    [void](Invoke-External $git @('-C', $repoRoot, 'submodule', 'update', '--init', 'lib/SharpTS'))
}
foreach ($requiredPath in @($runner, $validator, $canonicalSnapshot)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw "Required benchmark file is missing: $requiredPath" }
}

$expectedRevision = Read-PinnedRevision $sourceEnvironment
$headResult = Invoke-External $git @('-C', $sharpTsRoot, 'rev-parse', 'HEAD')
$headRevision = ([string]$headResult.Output[-1]).Trim()
if ($headRevision -cne $expectedRevision) {
    throw "SharpTS is checked out at $headRevision, but sharpts-source.env pins $expectedRevision. Run 'git submodule update --init lib/SharpTS' from $repoRoot."
}

$dotnetResult = Invoke-External $dotnet @('--version')
$nodeResult = Invoke-External $node @('--version')
$dotnetVersion = ([string]$dotnetResult.Output[-1]).Trim()
$nodeVersion = ([string]$nodeResult.Output[-1]).Trim().TrimStart('v')
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
$bunCommand = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $bunCommand) {
    Write-Warning 'Bun is not installed. The snapshot will record Bun as unavailable.'
}

[IO.Directory]::CreateDirectory($artifactRoot) | Out-Null
$lockPath = Join-Path $artifactRoot 'refresh.lock'
try {
    $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
} catch {
    throw "Another benchmark refresh is already running (lock: $lockPath)."
}

$runDirectory = $null
$candidateSnapshot = $null
$measurementRoot = $sharpTsRoot
$worktreeAdded = $false
$stagedSnapshot = $null

try {
    $runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N')
    $runDirectory = Join-Path $artifactRoot $runId
    [IO.Directory]::CreateDirectory($runDirectory) | Out-Null
    $candidateSnapshot = Join-Path $runDirectory 'snapshot.json'

    $statusResult = Invoke-External $git @('-C', $sharpTsRoot, 'status', '--porcelain=v1', '--untracked-files=no')
    $trackedChanges = @($statusResult.Output | ForEach-Object { $_.ToString() } | Where-Object { $_ })
    if ($trackedChanges.Count -gt 0) {
        $canonicalPattern = '^[ MARC?DUT]{2} ' + [regex]::Escape($canonicalRelative) + '$'
        $unrelated = @($trackedChanges | Where-Object { $_ -notmatch $canonicalPattern })
        if ($unrelated.Count -gt 0) {
            throw "SharpTS has tracked changes unrelated to the canonical benchmark snapshot. Commit or revert them first:$([Environment]::NewLine)$($unrelated -join [Environment]::NewLine)"
        }

        # Keep the auxiliary worktree path short. Git for Windows rejects long
        # worktree administrative paths before core.longpaths can take effect.
        $measurementRoot = Join-Path ([IO.Path]::GetTempPath()) ("sbt-$([Guid]::NewGuid().ToString('N'))")
        Write-Host 'The existing canonical snapshot is modified; measuring a temporary clean worktree.'
        [void](Invoke-External $git @('-C', $sharpTsRoot, 'worktree', 'add', '--detach', $measurementRoot, $headRevision))
        $worktreeAdded = $true
    }

    Write-Host "Benchmark revision: $headRevision"
    Write-Host "Diagnostic output: $runDirectory"
    Write-Host "Running the complete cross-runtime suite with $Launches launches..."
    & $runner -Launches $Launches -OutputDirectory $runDirectory -RepositoryRoot $measurementRoot

    if (-not (Test-Path -LiteralPath $candidateSnapshot -PathType Leaf)) {
        throw "Benchmark runner completed without producing $candidateSnapshot"
    }
    & $validator $candidateSnapshot
    $caseCount = Assert-SnapshotEvidence -Path $candidateSnapshot -ExpectedRevision $headRevision -ExpectedLaunches $Launches

    $canonicalDirectory = Split-Path -Parent $canonicalSnapshot
    $stagedSnapshot = Join-Path $canonicalDirectory ".latest.$([Guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::Copy($candidateSnapshot, $stagedSnapshot, $false)
    & $validator $stagedSnapshot
    [IO.File]::Move($stagedSnapshot, $canonicalSnapshot, $true)
    $stagedSnapshot = $null

    Write-Host ''
    Write-Host "Benchmark refresh completed: $caseCount cases across $Launches launches."
    Write-Host "Updated canonical snapshot: $canonicalSnapshot"
    Write-Host "Retained diagnostics: $runDirectory"
} finally {
    if ($null -ne $stagedSnapshot -and [IO.File]::Exists($stagedSnapshot)) {
        [IO.File]::Delete($stagedSnapshot)
    }
    if ($worktreeAdded) {
        $cleanup = Invoke-External $git @('-C', $sharpTsRoot, 'worktree', 'remove', '--force', $measurementRoot) -AllowFailure
        if ($cleanup.ExitCode -ne 0) {
            Write-Warning "Could not remove temporary benchmark worktree: $measurementRoot"
        }
    }
    $lock.Dispose()
}
