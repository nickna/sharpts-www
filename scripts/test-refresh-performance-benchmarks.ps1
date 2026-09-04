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
$canonicalSnapshot = Join-Path $fixtureRoot $canonicalRelative
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
    [void](Invoke-Git @('-C', $fixtureRoot, 'restore', '--source=HEAD', '--worktree', '--', $canonicalRelative))
}

function Invoke-Refresh {
    param(
        [Parameter(Mandatory)] [string]$Mode,
        [string[]]$Arguments = @()
    )

    $savedMode = $env:BENCHMARK_REFRESH_TEST_MODE
    $savedLocation = Get-Location
    $messages = @()
    $succeeded = $true
    try {
        $env:BENCHMARK_REFRESH_TEST_MODE = $Mode
        Set-Location $scratch
        try {
            $invocationParameters = @{
                RepositoryRoot = $fixtureRoot
                SkipVerification = $true
            }
            if ('-Latest' -in $Arguments) { $invocationParameters.Latest = $true }
            $tagIndex = [Array]::IndexOf($Arguments, '-Tag')
            if ($tagIndex -ge 0) { $invocationParameters.Tag = $Arguments[$tagIndex + 1] }
            if ('-Publish' -in $Arguments) { $invocationParameters.Publish = $true }
            else { $invocationParameters.NoPublish = $true }
            $messages = @(& $refreshScript @invocationParameters *>&1 |
                ForEach-Object { $_.ToString() })
        }
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
    [IO.Directory]::CreateDirectory($sharpTsRoot) | Out-Null
    [IO.File]::WriteAllText((Join-Path $sharpTsRoot 'fixture-source.txt'), "fixture`n", $utf8)
    [IO.File]::WriteAllText($canonicalSnapshot, "old canonical snapshot`n", $utf8)

    $runnerPath = Join-Path $sharpTsRoot 'benchmarks/cross-runtime/run-benchmarks.ps1'
    [IO.Directory]::CreateDirectory((Split-Path -Parent $runnerPath)) | Out-Null
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
    [IO.File]::WriteAllText((Join-Path $fixtureRoot 'sharpts-source.env'),
        "SHARPTS_SOURCE_REVISION=$fixtureRevision`nSHARPTS_RELEASE_VERSION=`n", $utf8)
    $siteSnapshot = Join-Path $fixtureRoot 'src/SharpTS.Www.SelfHost/site.snapshot.json'
    [IO.Directory]::CreateDirectory((Split-Path -Parent $siteSnapshot)) | Out-Null
    [IO.File]::WriteAllText($siteSnapshot, "{`"version`":2,`"files`":[]}`n", $utf8)
    [IO.File]::WriteAllText((Join-Path $fixtureRoot 'unrelated.txt'), "clean unrelated file`n", $utf8)

    [void](Invoke-Git @('init', $fixtureRoot))
    [void](Invoke-Git @('-C', $fixtureRoot, 'config', 'core.autocrlf', 'false'))
    [void](Invoke-Git @('-C', $fixtureRoot, 'config', 'user.name', 'Benchmark Refresh Tests'))
    [void](Invoke-Git @('-C', $fixtureRoot, 'config', 'user.email', 'benchmark-refresh@example.invalid'))
    [void](Invoke-Git @('-C', $fixtureRoot, 'add', '.'))
    [void](Invoke-Git @('-C', $fixtureRoot, 'commit', '-m', 'website fixture'))

    $sharpRemote = Join-Path $scratch 'sharp-remote.git'
    [void](Invoke-Git @('init', '--bare', $sharpRemote))
    [void](Invoke-Git @('-C', $sharpTsRoot, 'branch', '-M', 'main'))
    [void](Invoke-Git @('-C', $sharpTsRoot, 'remote', 'add', 'origin', $sharpRemote))
    [void](Invoke-Git @('-C', $sharpTsRoot, 'tag', 'v1.2.3', $fixtureRevision))
    [void](Invoke-Git @('-C', $sharpTsRoot, 'push', '-u', 'origin', 'main', '--tags'))

    $websiteRemote = Join-Path $scratch 'website-remote.git'
    [void](Invoke-Git @('init', '--bare', $websiteRemote))
    [void](Invoke-Git @('-C', $fixtureRoot, 'branch', '-M', 'main'))
    [void](Invoke-Git @('-C', $fixtureRoot, 'remote', 'add', 'origin', $websiteRemote))
    [void](Invoke-Git @('-C', $fixtureRoot, 'push', '-u', 'origin', 'main'))

    $tokens = $null
    $parseErrors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($refreshScript, [ref]$tokens, [ref]$parseErrors)
    Assert-True ($parseErrors.Count -eq 0) 'Refresh script has PowerShell syntax errors.'

    $success = Invoke-Refresh 'success'
    Assert-True $success.Succeeded "Successful fixture refresh failed:`n$($success.Output)"
    Assert-Contains $success.Output 'All performance benchmarks and verification checks passed' `
        'Successful refresh did not report completion.'
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
    [IO.File]::WriteAllText($pinnedPath,
        "SHARPTS_SOURCE_REVISION=$('f' * 40)`nSHARPTS_RELEASE_VERSION=`n", $utf8)
    $pinnedBefore = [IO.File]::ReadAllBytes($canonicalSnapshot)
    $pinnedFailure = Invoke-Refresh 'success'
    Assert-True (-not $pinnedFailure.Succeeded) 'A pre-existing source-pin edit was accepted.'
    Assert-Contains $pinnedFailure.Output 'managed website files already contain changes' `
        'Managed-file preflight error was not actionable.'
    Assert-True ([Convert]::ToBase64String([IO.File]::ReadAllBytes($canonicalSnapshot)) -ceq [Convert]::ToBase64String($pinnedBefore)) `
        'Managed-file rejection changed the canonical snapshot.'
    [void](Invoke-Git @('-C', $fixtureRoot, 'restore', '--source=HEAD', '--worktree', '--', 'sharpts-source.env'))

    Reset-CanonicalSnapshot
    [IO.File]::WriteAllText((Join-Path $sharpTsRoot 'fixture-source.txt'), "dirty source`n", $utf8)
    $dirtyBefore = [IO.File]::ReadAllBytes($canonicalSnapshot)
    $dirtyFailure = Invoke-Refresh 'success'
    Assert-True (-not $dirtyFailure.Succeeded) 'Unrelated dirty SharpTS source was accepted.'
    Assert-Contains $dirtyFailure.Output 'SharpTS checkout contains changes' 'Dirty-source error was not actionable.'
    Assert-True ([Convert]::ToBase64String([IO.File]::ReadAllBytes($canonicalSnapshot)) -ceq [Convert]::ToBase64String($dirtyBefore)) `
        'Dirty-source rejection changed the canonical snapshot.'
    [void](Invoke-Git @('-C', $sharpTsRoot, 'restore', '--source=HEAD', '--worktree', '--', 'fixture-source.txt'))

    Reset-CanonicalSnapshot
    $unrelatedPath = Join-Path $fixtureRoot 'unrelated.txt'
    [IO.File]::WriteAllText($unrelatedPath, "preserve this unrelated edit`n", $utf8)
    $unrelatedRefresh = Invoke-Refresh 'success'
    Assert-True $unrelatedRefresh.Succeeded "Unrelated website edit blocked the refresh:`n$($unrelatedRefresh.Output)"
    Assert-True ([IO.File]::ReadAllText($unrelatedPath).Contains('preserve this unrelated edit')) `
        'The refresh overwrote an unrelated website edit.'
    Reset-CanonicalSnapshot
    [void](Invoke-Git @('-C', $fixtureRoot, 'restore', '--source=HEAD', '--worktree', '--', 'unrelated.txt'))

    [IO.File]::WriteAllText((Join-Path $sharpTsRoot 'latest-source.txt'), "latest source`n", $utf8)
    [void](Invoke-Git @('-C', $sharpTsRoot, 'add', 'latest-source.txt'))
    [void](Invoke-Git @('-C', $sharpTsRoot, 'commit', '-m', 'latest source fixture'))
    $latestRevision = ([string]@(Invoke-Git @('-C', $sharpTsRoot, 'rev-parse', 'HEAD'))[-1]).Trim()
    [void](Invoke-Git @('-C', $sharpTsRoot, 'push', 'origin', 'HEAD:main'))
    [void](Invoke-Git @('-C', $sharpTsRoot, 'checkout', '--detach', $fixtureRevision))

    $latestRefresh = Invoke-Refresh 'success' @('-Latest')
    Assert-True $latestRefresh.Succeeded "Latest-source refresh failed:`n$($latestRefresh.Output)"
    Assert-Contains ([IO.File]::ReadAllText($pinnedPath)) "SHARPTS_SOURCE_REVISION=$latestRevision" `
        'Latest-source refresh did not update the exact source pin.'
    Assert-True (([string]@(Invoke-Git @('-C', $sharpTsRoot, 'rev-parse', 'HEAD'))[-1]).Trim() -ceq $latestRevision) `
        'Latest-source refresh did not check out the fetched main revision.'
    [void](Invoke-Git @('-C', $fixtureRoot, 'restore', '--source=HEAD', '--worktree', '--',
        $canonicalRelative, 'sharpts-source.env'))
    [void](Invoke-Git @('-C', $sharpTsRoot, 'checkout', '--detach', $fixtureRevision))

    $tagRefresh = Invoke-Refresh 'success' @('-Tag', 'v1.2.3')
    Assert-True $tagRefresh.Succeeded "Tagged-source refresh failed:`n$($tagRefresh.Output)"
    Assert-Contains ([IO.File]::ReadAllText($pinnedPath)) 'SHARPTS_RELEASE_VERSION=1.2.3' `
        'Tagged-source refresh did not set the release version.'
    Assert-True (([string]@(Invoke-Git @('-C', $sharpTsRoot, 'rev-parse', 'HEAD'))[-1]).Trim() -ceq $fixtureRevision) `
        'Tagged-source refresh did not check out the tagged commit.'
    [void](Invoke-Git @('-C', $fixtureRoot, 'restore', '--source=HEAD', '--worktree', '--',
        $canonicalRelative, 'sharpts-source.env'))

    $missingTagBefore = [IO.File]::ReadAllBytes($canonicalSnapshot)
    $missingTag = Invoke-Refresh 'success' @('-Tag', 'v9.9.9')
    Assert-True (-not $missingTag.Succeeded) 'A nonexistent SharpTS release tag was accepted.'
    Assert-True ([Convert]::ToBase64String([IO.File]::ReadAllBytes($canonicalSnapshot)) -ceq
        [Convert]::ToBase64String($missingTagBefore)) 'A missing-tag failure changed the canonical snapshot.'
    Assert-True (([string]@(Invoke-Git @('-C', $sharpTsRoot, 'rev-parse', 'HEAD'))[-1]).Trim() -ceq $fixtureRevision) `
        'A missing-tag failure did not restore the original SharpTS checkout.'

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

    $fakeBin = Join-Path $scratch 'fake-bin'
    [IO.Directory]::CreateDirectory($fakeBin) | Out-Null
    $fakeGh = Join-Path $fakeBin 'gh.cmd'
    $fakeGhSource = @'
@echo off
if /I "%BENCHMARK_REFRESH_FAKE_GH_MODE%"=="auth-failure" if /I "%1"=="auth" exit /b 3
if /I "%1"=="auth" exit /b 0
if /I "%1"=="pr" (
  echo https://github.example/fixture/pull/1
  exit /b 0
)
exit /b 2
'@
    [IO.File]::WriteAllText($fakeGh, $fakeGhSource, $utf8)
    if (-not $IsWindows) {
        $fakeGh = Join-Path $fakeBin 'gh'
        $fakeGhSource = @'
#!/bin/sh
if [ "$BENCHMARK_REFRESH_FAKE_GH_MODE" = "auth-failure" ] && [ "$1" = "auth" ]; then exit 3; fi
if [ "$1" = "auth" ]; then exit 0; fi
if [ "$1" = "pr" ]; then
  echo https://github.example/fixture/pull/1
  exit 0
fi
exit 2
'@
        [IO.File]::WriteAllText($fakeGh, $fakeGhSource, $utf8)
        [IO.File]::SetUnixFileMode($fakeGh,
            [IO.UnixFileMode]::UserRead -bor [IO.UnixFileMode]::UserWrite -bor [IO.UnixFileMode]::UserExecute)
    }
    $savedPath = $env:PATH
    $savedFakeGhMode = $env:BENCHMARK_REFRESH_FAKE_GH_MODE
    try {
        $env:PATH = "$fakeBin$([IO.Path]::PathSeparator)$savedPath"
        $env:BENCHMARK_REFRESH_FAKE_GH_MODE = 'auth-failure'
        $authFailure = Invoke-Refresh 'success' @('-Publish')
        Assert-True (-not $authFailure.Succeeded) 'Failed GitHub authentication was accepted.'
        Assert-Contains $authFailure.Output 'auth status' 'GitHub authentication failure was not reported.'
        Assert-True ((Get-Content -LiteralPath $canonicalSnapshot -Raw).Contains('fixture/case?n=1')) `
            'GitHub authentication failure discarded valid benchmark results.'
        Assert-True (([string]@(Invoke-Git @('-C', $fixtureRoot, 'branch', '--show-current'))[-1]).Trim() -ceq 'main') `
            'GitHub authentication failure created a publication branch.'
        Reset-CanonicalSnapshot

        $env:BENCHMARK_REFRESH_FAKE_GH_MODE = ''
        $published = Invoke-Refresh 'success' @('-Publish')
    } finally {
        $env:PATH = $savedPath
        $env:BENCHMARK_REFRESH_FAKE_GH_MODE = $savedFakeGhMode
    }
    Assert-True $published.Succeeded "Fixture PR publication failed:`n$($published.Output)"
    Assert-Contains $published.Output 'https://github.example/fixture/pull/1' `
        'Successful publication did not report the pull-request URL.'
    $publishedBranch = ([string]@(Invoke-Git @('-C', $fixtureRoot, 'branch', '--show-current'))[-1]).Trim()
    Assert-True $publishedBranch.StartsWith('codex/benchmark-refresh-', [StringComparison]::Ordinal) `
        'Publication did not create a dedicated benchmark branch.'
    $remoteBranch = Invoke-Git @('--git-dir', $websiteRemote, 'rev-parse', "refs/heads/$publishedBranch")
    $remoteRevision = ([string]@($remoteBranch)[-1]).Trim()
    Assert-True ($remoteRevision -match '^[0-9a-f]{40}$') 'Publication did not push the benchmark branch.'

    Write-Host 'Performance benchmark refresh tests passed.'
} finally {
    if (Test-Path -LiteralPath $scratch) {
        Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
    }
}
