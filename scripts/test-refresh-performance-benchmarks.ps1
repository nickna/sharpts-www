#requires -Version 7.0

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$refreshScript = Join-Path $PSScriptRoot 'refresh-performance-benchmarks.ps1'
$scratch = Join-Path ([IO.Path]::GetTempPath()) ("sharpts benchmark refresh tests $([Guid]::NewGuid().ToString('N'))")
$fixtureRoot = Join-Path $scratch 'website fixture with spaces'
$sharpTsRoot = Join-Path $fixtureRoot 'lib/SharpTS'
$canonicalRelative = 'benchmarks/cross-runtime/snapshots/latest.json'
$canonicalSnapshot = Join-Path $sharpTsRoot $canonicalRelative
$utf8 = [Text.UTF8Encoding]::new($false)

function Assert-True {
    param([object]$Condition, [Parameter(Mandatory)] [string]$Message)
    if (-not [bool]$Condition) { throw "FAIL: $Message" }
}

function Assert-Contains {
    param([string]$Actual, [string]$Expected, [Parameter(Mandatory)] [string]$Message)
    if (-not $Actual.Contains($Expected, [StringComparison]::OrdinalIgnoreCase)) {
        throw "FAIL: $Message`nExpected to contain: $Expected`nActual: $Actual"
    }
}

function Invoke-Git {
    param([Parameter(Mandatory)] [string[]]$Arguments)
    $output = @(& git @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "Fixture Git command failed: git $($Arguments -join ' ')`n$($output -join "`n")" }
    return @($output)
}

function Reset-CanonicalSnapshot {
    [void](Invoke-Git @('-C', $sharpTsRoot, 'restore', '--source=HEAD', '--worktree', '--', $canonicalRelative))
}

function Invoke-Refresh {
    param([Parameter(Mandatory)] [string]$Mode)

    $savedMode = $env:BENCHMARK_REFRESH_TEST_MODE
    $savedLocation = Get-Location
    $messages = @()
    $succeeded = $true
    try {
        $env:BENCHMARK_REFRESH_TEST_MODE = $Mode
        Set-Location $scratch
        try { $messages = @(& $refreshScript -RepositoryRoot $fixtureRoot *>&1 | ForEach-Object { $_.ToString() }) }
        catch {
            $succeeded = $false
            $messages += $_.Exception.Message
        }
    } finally {
        Set-Location $savedLocation
        $env:BENCHMARK_REFRESH_TEST_MODE = $savedMode
    }
    return [pscustomobject]@{ Succeeded = $succeeded; Output = ($messages -join "`n") }
}

try {
    [IO.Directory]::CreateDirectory((Split-Path -Parent $canonicalSnapshot)) | Out-Null
    [IO.File]::WriteAllText((Join-Path $sharpTsRoot 'fixture-source.txt'), "fixture`n", $utf8)
    [IO.File]::WriteAllText($canonicalSnapshot, "old canonical snapshot`n", $utf8)

    $runnerPath = Join-Path $sharpTsRoot 'benchmarks/cross-runtime/run-benchmarks.ps1'
    $runnerSource = @'
[CmdletBinding()]
param([int]$Launches, [string]$OutputDirectory, [string]$RepositoryRoot)
$ErrorActionPreference = 'Stop'
$mode = $env:BENCHMARK_REFRESH_TEST_MODE
if ($mode -eq 'runner-failure') { throw 'fixture runner failure' }
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
if ($mode -eq 'missing-output') { return }
if ($mode -eq 'invalid-json') {
    [IO.File]::WriteAllText((Join-Path $OutputDirectory 'snapshot.json'), '{broken json')
    return
}
$revision = (& git -C $RepositoryRoot rev-parse HEAD).Trim()
if ($mode -eq 'revision-mismatch') { $revision = 'f' * 40 }
$measurements = @(1..$Launches | ForEach-Object {
    [ordered]@{ launch = $_; mean = 1.0; minimum = 0.9; standardDeviation = 0.1; sampleCount = 10; innerIterations = 1; sampledDuration = 300.0 }
})
$runtimes = @(
    [ordered]@{ id = 'interpreter'; status = 'measured'; measurements = $measurements }
    [ordered]@{ id = 'compiled'; status = 'measured'; measurements = $measurements }
    [ordered]@{ id = 'node'; status = 'measured'; measurements = $measurements }
    [ordered]@{ id = 'bun'; status = 'missing'; reason = 'unavailable' }
)
$snapshot = [ordered]@{
    schemaVersion = 1
    run = [ordered]@{
        revision = [ordered]@{ commit = $revision; dirty = ($mode -eq 'dirty-metadata') }
        tools = [ordered]@{ runtimes = @(
            [ordered]@{ id = 'interpreter'; selected = $true; available = $true; version = $revision }
            [ordered]@{ id = 'compiled'; selected = $true; available = $true; version = $revision }
            [ordered]@{ id = 'node'; selected = $true; available = $true; version = 'vfixture' }
            [ordered]@{ id = 'bun'; selected = $true; available = $false; version = $null }
        ) }
    }
    methodology = [ordered]@{
        harnessVersion = if ($mode -eq 'unsupported-methodology') { 99 } else { 2 }
        id = if ($mode -eq 'unsupported-methodology') { 'unsupported-v99' } else { 'performance-now-confirmed-probe-auto-batched-v2' }
        timingScope = 'inProcessWorkload'
        clock = 'performance.now'
    }
    cases = @([ordered]@{ id = 'fixture/case?n=1'; runtimes = $runtimes })
}
$json = $snapshot | ConvertTo-Json -Depth 12
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'snapshot.json'), $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
'@
    [IO.File]::WriteAllText($runnerPath, $runnerSource, $utf8)

    $validatorPath = Join-Path $sharpTsRoot 'benchmarks/cross-runtime/validate-snapshot.ps1'
    $validatorSource = @'
[CmdletBinding()]
param([Parameter(Mandatory, Position = 0)][string[]]$Path)
foreach ($item in $Path) {
    if ($env:BENCHMARK_REFRESH_TEST_MODE -eq 'validator-failure') { throw 'fixture validator failure' }
    if ($env:BENCHMARK_REFRESH_TEST_MODE -eq 'staged-validator-failure' -and $item -like '*.tmp') {
        throw 'fixture staged validator failure'
    }
    [void](Get-Content -LiteralPath $item -Raw | ConvertFrom-Json)
}
'@
    [IO.File]::WriteAllText($validatorPath, $validatorSource, $utf8)

    [void](Invoke-Git @('init', $sharpTsRoot))
    [void](Invoke-Git @('-C', $sharpTsRoot, 'config', 'core.autocrlf', 'false'))
    [void](Invoke-Git @('-C', $sharpTsRoot, 'config', 'user.name', 'Benchmark Refresh Tests'))
    [void](Invoke-Git @('-C', $sharpTsRoot, 'config', 'user.email', 'benchmark-refresh@example.invalid'))
    [void](Invoke-Git @('-C', $sharpTsRoot, 'add', '.'))
    [void](Invoke-Git @('-C', $sharpTsRoot, 'commit', '-m', 'fixture'))
    $fixtureRevisionOutput = @(Invoke-Git @('-C', $sharpTsRoot, 'rev-parse', 'HEAD'))
    $fixtureRevision = ([string]$fixtureRevisionOutput[-1]).Trim()
    [IO.File]::WriteAllText((Join-Path $fixtureRoot 'sharpts-source.env'), "SHARPTS_SOURCE_REVISION=$fixtureRevision`n", $utf8)

    $tokens = $null
    $parseErrors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($refreshScript, [ref]$tokens, [ref]$parseErrors)
    Assert-True ($parseErrors.Count -eq 0) 'Refresh script has PowerShell syntax errors.'

    $success = Invoke-Refresh 'success'
    Assert-True $success.Succeeded "Successful fixture refresh failed:`n$($success.Output)"
    Assert-Contains $success.Output 'Benchmark refresh completed' 'Successful refresh did not report completion.'
    Assert-True ((Get-Content -LiteralPath $canonicalSnapshot -Raw).Contains('fixture/case?n=1')) `
        'Successful refresh did not publish the candidate.'

    foreach ($failureMode in @('runner-failure', 'missing-output', 'invalid-json', 'validator-failure',
        'staged-validator-failure', 'dirty-metadata', 'revision-mismatch', 'unsupported-methodology')) {
        Reset-CanonicalSnapshot
        $before = [IO.File]::ReadAllBytes($canonicalSnapshot)
        $failure = Invoke-Refresh $failureMode
        Assert-True (-not $failure.Succeeded) "Failure mode '$failureMode' unexpectedly succeeded."
        Assert-True ([Convert]::ToBase64String([IO.File]::ReadAllBytes($canonicalSnapshot)) -ceq [Convert]::ToBase64String($before)) `
            "Failure mode '$failureMode' changed the canonical snapshot."
    }

    Reset-CanonicalSnapshot
    $pinnedPath = Join-Path $fixtureRoot 'sharpts-source.env'
    [IO.File]::WriteAllText($pinnedPath, "SHARPTS_SOURCE_REVISION=$('f' * 40)`n", $utf8)
    $pinnedBefore = [IO.File]::ReadAllBytes($canonicalSnapshot)
    $pinnedFailure = Invoke-Refresh 'success'
    Assert-True (-not $pinnedFailure.Succeeded) 'Mismatched pinned submodule revision was accepted.'
    Assert-Contains $pinnedFailure.Output 'sharpts-source.env pins' 'Pinned-revision error was not actionable.'
    Assert-True ([Convert]::ToBase64String([IO.File]::ReadAllBytes($canonicalSnapshot)) -ceq [Convert]::ToBase64String($pinnedBefore)) `
        'Pinned-revision rejection changed the canonical snapshot.'
    [IO.File]::WriteAllText($pinnedPath, "SHARPTS_SOURCE_REVISION=$fixtureRevision`n", $utf8)

    Reset-CanonicalSnapshot
    [IO.File]::WriteAllText((Join-Path $sharpTsRoot 'fixture-source.txt'), "dirty source`n", $utf8)
    $dirtyBefore = [IO.File]::ReadAllBytes($canonicalSnapshot)
    $dirtyFailure = Invoke-Refresh 'success'
    Assert-True (-not $dirtyFailure.Succeeded) 'Unrelated dirty SharpTS source was accepted.'
    Assert-Contains $dirtyFailure.Output 'tracked changes unrelated' 'Dirty-source error was not actionable.'
    Assert-True ([Convert]::ToBase64String([IO.File]::ReadAllBytes($canonicalSnapshot)) -ceq [Convert]::ToBase64String($dirtyBefore)) `
        'Dirty-source rejection changed the canonical snapshot.'
    [void](Invoke-Git @('-C', $sharpTsRoot, 'restore', '--source=HEAD', '--worktree', '--', 'fixture-source.txt'))

    Reset-CanonicalSnapshot
    $firstRefresh = Invoke-Refresh 'success'
    Assert-True $firstRefresh.Succeeded "Initial refresh for canonical-only rerun failed:`n$($firstRefresh.Output)"
    $secondRefresh = Invoke-Refresh 'success'
    Assert-True $secondRefresh.Succeeded "Canonical-only rerun failed:`n$($secondRefresh.Output)"
    Assert-Contains $secondRefresh.Output 'temporary clean worktree' 'Canonical-only rerun did not isolate clean provenance.'

    Reset-CanonicalSnapshot
    $artifactRoot = Join-Path $fixtureRoot 'artifacts/benchmark-refresh'
    [IO.Directory]::CreateDirectory($artifactRoot) | Out-Null
    $staleDirectory = Join-Path $artifactRoot 'stale-output'
    [IO.Directory]::CreateDirectory($staleDirectory) | Out-Null
    [IO.File]::WriteAllText((Join-Path $staleDirectory 'snapshot.json'), "stale candidate`n", $utf8)
    $staleBefore = [IO.File]::ReadAllBytes($canonicalSnapshot)
    $staleFailure = Invoke-Refresh 'missing-output'
    Assert-True (-not $staleFailure.Succeeded) 'Missing-output run reused a stale snapshot.'
    Assert-True ([Convert]::ToBase64String([IO.File]::ReadAllBytes($canonicalSnapshot)) -ceq [Convert]::ToBase64String($staleBefore)) `
        'Stale-output rejection changed the canonical snapshot.'

    $lockPath = Join-Path $artifactRoot 'refresh.lock'
    $heldLock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        $locked = Invoke-Refresh 'success'
        Assert-True (-not $locked.Succeeded) 'Concurrent refresh was not rejected.'
        Assert-Contains $locked.Output 'already running' 'Concurrent-refresh error was not clear.'
    } finally {
        $heldLock.Dispose()
    }

    Write-Host 'Performance benchmark refresh tests passed.'
} finally {
    if (Test-Path -LiteralPath $scratch) {
        Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
    }
}
