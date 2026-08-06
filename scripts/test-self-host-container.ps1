[CmdletBinding()]
param(
    [string]$Image = "sharpts-www-selfhost:test",
    [int]$Port = 18080,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$origin = "http://127.0.0.1:$Port"
$containerName = "sharpts-www-selfhost-test-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"

function Assert-True {
    param(
        [object]$Condition,
        [string]$Message
    )

    if (-not [bool]$Condition) {
        throw $Message
    }
}

function Invoke-TestRequest {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers = @{},
        [string]$Body,
        [string]$ContentType
    )

    $parameters = @{
        Method = $Method
        Uri = "$origin$Path"
        Headers = $Headers
        SkipHttpErrorCheck = $true
        TimeoutSec = 25
    }
    if ($PSBoundParameters.ContainsKey("Body")) {
        $parameters.Body = $Body
    }
    if ($PSBoundParameters.ContainsKey("ContentType")) {
        $parameters.ContentType = $ContentType
    }

    Invoke-WebRequest @parameters
}

function Invoke-Execution {
    param(
        [string]$Source,
        [string]$Mode,
        [string]$Identity,
        [int]$TimeoutMs = 5000
    )

    $body = @{
        source = $Source
        timeoutMs = $TimeoutMs
        mode = $Mode
    } | ConvertTo-Json -Compress
    $response = Invoke-TestRequest -Method Post -Path "/api/run" -Headers @{
        Origin = $origin
        "X-Real-IP" = $Identity
    } -ContentType "application/json" -Body $body

    [pscustomobject]@{
        Status = [int]$response.StatusCode
        Body = $response.Content | ConvertFrom-Json
    }
}

if (-not $SkipBuild) {
    & docker build --progress=plain -f (Join-Path $repoRoot "Dockerfile.selfhost") `
        -t $Image $repoRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Docker image build failed."
    }
}

$imageSharpTsSource = @(& docker run --rm --entrypoint cat $Image /app/sharpts-source.env)[0].Trim()
Assert-True ($imageSharpTsSource -match '^SHARPTS_SOURCE_REVISION=[0-9a-f]{40}$') `
    "Image does not record the resolved SharpTS main commit: '$imageSharpTsSource'."

$containerStarted = $false
try {
    & docker run -d --name $containerName `
        -p "127.0.0.1:${Port}:8080" `
        --memory 1g `
        --pids-limit 256 `
        --read-only `
        --tmpfs "/tmp:rw,nosuid,nodev,size=256m" `
        --cap-drop ALL `
        --security-opt no-new-privileges `
        -e "SHARPTS_WWW_PUBLIC_ORIGIN=$origin" `
        -e "SHARPTS_WWW_TRUST_RAILWAY_PROXY=true" `
        -e "SHARPTS_WWW_SMOKE_SECRET=must-not-reach-worker" `
        $Image | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to start self-host container."
    }
    $containerStarted = $true

    $healthy = $false
    for ($attempt = 0; $attempt -lt 80; $attempt++) {
        $running = & docker inspect -f "{{.State.Running}}" $containerName 2>$null
        if ($running -ne "true") {
            break
        }
        try {
            $health = Invoke-TestRequest -Method Get -Path "/health"
            if ([int]$health.StatusCode -eq 200) {
                $healthy = $true
                break
            }
        }
        catch {
            # The listener may not be accepting connections yet.
        }
        Start-Sleep -Milliseconds 250
    }
    if (-not $healthy) {
        & docker logs $containerName
        throw "Self-host container did not become healthy."
    }

    $identity = @(& docker exec $containerName sh -c `
        "id -u; id -g; test ! -d /usr/share/dotnet/sdk; test -r /proc/1/status; test ! -w /app; echo runtime-ok")
    Assert-True ($LASTEXITCODE -eq 0) "Container hardening inspection failed."
    Assert-True ($identity[-1] -eq "runtime-ok") "Runtime-only/read-only checks did not complete."
    Assert-True ($identity[0] -ne "0" -and $identity[1] -ne "0") "Container must not run as root."

    $index = Invoke-TestRequest -Method Get -Path "/"
    Assert-True ([int]$index.StatusCode -eq 200) "Static index did not return HTTP 200."
    Assert-True ($index.Headers["X-Content-Type-Options"] -eq "nosniff") "Security headers are missing."
    Assert-True (-not [string]::IsNullOrWhiteSpace($index.Headers["Content-Security-Policy"])) `
        "Content-Security-Policy is missing."
    $contentSecurityPolicy = [string]$index.Headers["Content-Security-Policy"]
    Assert-True ($contentSecurityPolicy.Contains("font-src 'self'")) `
        "Self-hosted fonts are not covered by Content-Security-Policy."
    Assert-True (-not $contentSecurityPolicy.Contains("script-src 'self' 'unsafe-inline'")) `
        "Content-Security-Policy unexpectedly allows inline scripts."
    $etag = [string]$index.Headers["ETag"]
    Assert-True (-not [string]::IsNullOrWhiteSpace($etag)) "Static response ETag is missing."
    $cached = Invoke-TestRequest -Method Get -Path "/" -Headers @{ "If-None-Match" = $etag }
    Assert-True ([int]$cached.StatusCode -eq 304) "Static ETag revalidation did not return HTTP 304."

    $localizedRoutes = @{
        "/" = "en"
        "/how-it-works" = "en"
        "/conformance" = "en"
        "/zh-Hans" = "zh-Hans"
        "/zh-Hans/how-it-works" = "zh-Hans"
        "/zh-Hans/conformance" = "zh-Hans"
        "/fr" = "fr"
        "/fr/how-it-works" = "fr"
        "/fr/conformance" = "fr"
        "/es" = "es"
        "/es/how-it-works" = "es"
        "/es/conformance" = "es"
        "/de" = "de"
        "/de/how-it-works" = "de"
        "/de/conformance" = "de"
    }
    foreach ($route in $localizedRoutes.GetEnumerator()) {
        $page = Invoke-TestRequest -Method Get -Path $route.Key
        Assert-True ([int]$page.StatusCode -eq 200) "Localized route $($route.Key) did not return HTTP 200."
        Assert-True ($page.Content.Contains("<html lang=`"$($route.Value)`">")) `
            "Localized route $($route.Key) returned the wrong language."
        Assert-True ($page.Content.Contains("rel=`"canonical`"")) `
            "Localized route $($route.Key) is missing its canonical URL."
        Assert-True (-not $page.Content.Contains("_framework/blazor")) `
            "Localized route $($route.Key) still references Blazor."
        if ($route.Key.EndsWith("/conformance") -or $route.Key -eq "/conformance") {
            Assert-True ($page.Content.Contains('data-conformance-explorer')) `
                "Conformance route $($route.Key) is missing the explorer markup."
            Assert-True ($page.Content.Contains('<script type="module"')) `
                "Conformance route $($route.Key) is missing the explorer script."
        }
    }

    $siteManifest = (Invoke-TestRequest -Method Get -Path '/site-manifest.json').Content | ConvertFrom-Json
    $siteCss = Invoke-TestRequest -Method Get -Path "/$($siteManifest.stylesheet)"
    Assert-True ([int]$siteCss.StatusCode -eq 200) "Generated CSS bundle did not return HTTP 200."
    Assert-True (-not $siteCss.Content.Contains("::deep")) "Generated CSS still contains ::deep."
    Assert-True ($siteCss.Headers["Cache-Control"] -like "*immutable*") `
        "Fingerprint-named site CSS must use immutable caching."

    Assert-True (@($siteManifest.browserBundle).Count -ge 2) 'Browser manifest must list split assets.'
    $browserJavaScriptPath = "/$($siteManifest.browserEntry.script)"
    $browserCssPath = "/$($siteManifest.browserEntry.style)"
    $browserJavaScript = Invoke-TestRequest -Method Get -Path $browserJavaScriptPath
    Assert-True ([int]$browserJavaScript.StatusCode -eq 200) `
        "Browser JavaScript bundle did not return HTTP 200."
    Assert-True ($browserJavaScript.Headers["Content-Type"] -like "*javascript*") `
        "Browser JavaScript has the wrong content type."
    Assert-True ($browserJavaScript.Headers["Cache-Control"] -like "*immutable*") `
        "Fingerprint-named browser JavaScript must use immutable caching."
    Assert-True (-not $browserJavaScript.Content.Contains("esm.sh")) `
        "Browser JavaScript still loads remote CodeMirror assets."

    $browserCss = Invoke-TestRequest -Method Get -Path $browserCssPath
    Assert-True ([int]$browserCss.StatusCode -eq 200) `
        "Browser vendor CSS bundle did not return HTTP 200."

    $curlCommand = if ($IsWindows) { 'curl.exe' } else { 'curl' }
    $compressedHeaders = @(& $curlCommand --silent --show-error --head `
        --header 'Accept-Encoding: br' "$origin$browserJavaScriptPath") -join "`n"
    Assert-True ($LASTEXITCODE -eq 0) 'Compressed browser asset probe failed.'
    Assert-True ($compressedHeaders -match '(?im)^Content-Encoding:\s*br\s*$') `
        'Fingerprint-named JavaScript was not served from its Brotli asset.'
    Assert-True ($compressedHeaders -match '(?im)^Vary:\s*Accept-Encoding\s*$') `
        'Compressed browser asset is missing Vary: Accept-Encoding.'

    $encodedPath = Invoke-TestRequest -Method Get -Path "/%2e%2e/Dockerfile.selfhost"
    Assert-True (@(400, 404) -contains [int]$encodedPath.StatusCode) `
        "Encoded traversal must be rejected or remain outside the static root."
    Assert-True ($encodedPath.Content -notlike "*mcr.microsoft.com*") "Traversal exposed a repository file."

    $malformed = Invoke-TestRequest -Method Post -Path "/api/run" `
        -ContentType "application/json" -Body "{not-json"
    Assert-True ([int]$malformed.StatusCode -eq 400) "Malformed JSON must return HTTP 400."

    # Drop a request before its declared body completes. The host cannot send a
    # response to the vanished client, but it must close out its request-log
    # bookkeeping so repeated aborted uploads cannot leak client identities.
    $abortedClient = [Net.Sockets.TcpClient]::new()
    try {
        $abortedClient.Connect("127.0.0.1", $Port)
        $abortedStream = $abortedClient.GetStream()
        $partialRequest = "POST /api/run HTTP/1.1`r`n" +
            "Host: 127.0.0.1:$Port`r`n" +
            "Content-Type: application/json`r`n" +
            "Content-Length: 128`r`n" +
            "Connection: close`r`n`r`n" +
            '{"value":"partial'
        $partialBytes = [Text.Encoding]::ASCII.GetBytes($partialRequest)
        $abortedStream.Write($partialBytes, 0, $partialBytes.Length)
        $abortedStream.Flush()
    }
    finally {
        $abortedClient.Dispose()
    }

    $bodyAbortLogged = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $bodyAbortLogs = @(& docker logs --tail 40 $containerName 2>&1 |
            ForEach-Object { $_.ToString() }) -join "`n"
        if ($bodyAbortLogs.Contains('"eventDetail":"request_body_aborted"') -and
            $bodyAbortLogs.Contains('"path":"/api/run"') -and
            $bodyAbortLogs.Contains('"status":499')) {
            $bodyAbortLogged = $true
            break
        }
        Start-Sleep -Milliseconds 100
    }
    Assert-True $bodyAbortLogged `
        "An aborted request body did not close its request log with HTTP 499."

    $presets = Invoke-TestRequest -Method Get -Path "/api/presets"
    $presetBody = $presets.Content | ConvertFrom-Json
    Assert-True (@($presetBody).Count -eq 5) "Expected five playground presets."

    $interpret = Invoke-Execution -Source "console.log('linux interpret smoke');" `
        -Mode interpret -Identity "203.0.113.10"
    Assert-True ($interpret.Status -eq 200 -and $interpret.Body.success -eq $true) `
        "Interpreted execution failed."
    Assert-True ($interpret.Body.output.Trim() -eq "linux interpret smoke") `
        "Interpreted execution returned unexpected output."

    $compiled = Invoke-Execution -Source "console.log('linux compile smoke');" `
        -Mode compile -Identity "203.0.113.11"
    Assert-True ($compiled.Status -eq 200 -and $compiled.Body.success -eq $true) `
        "Compiled execution failed."
    Assert-True ($compiled.Body.output.Trim() -eq "linux compile smoke") `
        "Compiled execution returned unexpected output."

    $environment = Invoke-Execution `
        -Source "console.log(process.env.SHARPTS_WWW_SMOKE_SECRET);" `
        -Mode interpret -Identity "203.0.113.12"
    Assert-True ($environment.Body.output.Trim() -eq "undefined") `
        "Parent environment leaked into a playground worker."

    $badOriginBody = @{
        source = "console.log('blocked');"
        timeoutMs = 1000
        mode = "interpret"
    } | ConvertTo-Json -Compress
    $badOrigin = Invoke-TestRequest -Method Post -Path "/api/run" -Headers @{
        Origin = "https://attacker.invalid"
        "X-Real-IP" = "203.0.113.13"
    } -ContentType "application/json" -Body $badOriginBody
    Assert-True ([int]$badOrigin.StatusCode -eq 403) "Cross-origin execution was not rejected."

    $parallelResults = 1..7 | ForEach-Object -Parallel {
        $parallelOrigin = $using:origin
        $parallelIndex = $_
        $body = @{
            source = "const started = Date.now(); while (Date.now() - started < 5000) {} console.log('done');"
            timeoutMs = 8000
            mode = "interpret"
        } | ConvertTo-Json -Compress
        try {
            $response = Invoke-WebRequest -Method Post -Uri "$parallelOrigin/api/run" -Headers @{
                Origin = $parallelOrigin
                "X-Real-IP" = "198.51.100.$parallelIndex"
            } -ContentType "application/json" -Body $body -SkipHttpErrorCheck -TimeoutSec 20
            [int]$response.StatusCode
        }
        catch {
            0
        }
    } -ThrottleLimit 7
    Assert-True (@($parallelResults | Where-Object { $_ -eq 200 }).Count -eq 3) `
        "Concurrency limit did not admit exactly three workers."
    Assert-True (@($parallelResults | Where-Object { $_ -eq 503 }).Count -eq 4) `
        "Concurrency queue did not reject four excess workers with HTTP 503."

    $stack = Invoke-Execution `
        -Source "function recurse(value: number): number { return recurse(value + 1) + 1; } console.log(recurse(0));" `
        -Mode compile -Identity "203.0.113.20" -TimeoutMs 10000
    Assert-True ($stack.Body.success -eq $false) "Stack overflow unexpectedly succeeded."
    Assert-True ($stack.Body.errors[0].message -eq "Execution terminated: stack overflow.") `
        "Linux stack overflow did not receive the stable error mapping."

    $memorySource = "const bytes = new Uint8Array(220 * 1024 * 1024); " +
        "for (let i = 0; i < bytes.length; i += 4096) bytes[i] = 1; " +
        "const until = Date.now() + 3000; let total = 0; " +
        "while (Date.now() < until) total += bytes[0]; console.log(total);"
    $memory = Invoke-Execution -Source $memorySource -Mode interpret `
        -Identity "203.0.113.21" -TimeoutMs 10000
    Assert-True ($memory.Body.success -eq $false) "RSS limit probe unexpectedly succeeded."
    Assert-True ($memory.Body.errors[0].message -eq `
        "Execution terminated: memory limit exceeded (150MB).") `
        "Linux /proc RSS enforcement did not return the expected error."

    $rateStatuses = @()
    for ($requestNumber = 1; $requestNumber -le 11; $requestNumber++) {
        $rateResult = Invoke-Execution -Source "console.log('rate');" -Mode interpret `
            -Identity "192.0.2.44" -TimeoutMs 2000
        $rateStatuses += $rateResult.Status
    }
    Assert-True (@($rateStatuses | Where-Object { $_ -eq 200 }).Count -eq 10) `
        "Trusted-proxy rate limit did not permit ten requests."
    Assert-True ($rateStatuses[-1] -eq 429) `
        "Trusted-proxy rate limit did not reject request eleven."

    $healthAfter = Invoke-TestRequest -Method Get -Path "/health"
    Assert-True ([int]$healthAfter.StatusCode -eq 200) `
        "Host was unhealthy after worker limit tests."

    $malformedContainerName = "$containerName-malformed"
    $malformedPort = $Port + 1
    $malformedOrigin = "http://127.0.0.1:$malformedPort"
    $malformedStarted = $false
    try {
        & docker run --rm -d --name $malformedContainerName `
            -p "127.0.0.1:${malformedPort}:8080" `
            --memory 512m `
            --pids-limit 128 `
            --read-only `
            --tmpfs "/tmp:rw,nosuid,nodev,size=128m" `
            --cap-drop ALL `
            --security-opt no-new-privileges `
            -e "SHARPTS_WWW_PUBLIC_ORIGIN=$malformedOrigin" `
            -e "SHARPTS_WWW_WORKER_PATH=/usr/bin/env" `
            $Image | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to start malformed-worker test container."
        }
        $malformedStarted = $true

        $malformedHealthy = $false
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            try {
                $response = Invoke-WebRequest -Uri "$malformedOrigin/health" -TimeoutSec 1
                if ([int]$response.StatusCode -eq 200) {
                    $malformedHealthy = $true
                    break
                }
            }
            catch {
                # The listener may not be accepting connections yet.
            }
            Start-Sleep -Milliseconds 250
        }
        Assert-True $malformedHealthy "Malformed-worker test container did not become healthy."

        $malformedBody = @{
            source = "console.log('ignored');"
            timeoutMs = 2000
            mode = "interpret"
        } | ConvertTo-Json -Compress
        $malformedResponse = Invoke-WebRequest -Method Post `
            -Uri "$malformedOrigin/api/run" -Headers @{ Origin = $malformedOrigin } `
            -ContentType "application/json" -Body $malformedBody -TimeoutSec 10
        $malformedResult = $malformedResponse.Content | ConvertFrom-Json
        Assert-True ($malformedResult.success -eq $false) `
            "Malformed worker output unexpectedly succeeded."
        Assert-True ($malformedResult.errors[0].message -eq `
            "Internal error: invalid worker response.") `
            "Malformed worker output did not receive the stable error mapping."
        $malformedHealthAfter = Invoke-WebRequest -Uri "$malformedOrigin/health" -TimeoutSec 2
        Assert-True ([int]$malformedHealthAfter.StatusCode -eq 200) `
            "Malformed worker output made the host unhealthy."

        # This container does not opt into trusted-proxy handling. Ten forged
        # X-Real-IP values must therefore share the direct peer's rate-limit
        # identity. The malformed-worker request above consumed the first of ten
        # allowed requests, so nine more pass and the tenth spoof is rejected.
        $untrustedForwardStatuses = @()
        for ($requestNumber = 1; $requestNumber -le 10; $requestNumber++) {
            $spoofedResponse = Invoke-WebRequest -Method Post `
                -Uri "$malformedOrigin/api/run" -Headers @{
                    Origin = $malformedOrigin
                    "X-Real-IP" = "198.51.100.$requestNumber"
                } -ContentType "application/json" -Body $malformedBody `
                -SkipHttpErrorCheck -TimeoutSec 10
            $untrustedForwardStatuses += [int]$spoofedResponse.StatusCode
        }
        Assert-True (@($untrustedForwardStatuses | Where-Object { $_ -eq 200 }).Count -eq 9) `
            "Untrusted forwarded identities bypassed the direct-peer rate limit."
        Assert-True ($untrustedForwardStatuses[-1] -eq 429) `
            "The untrusted forwarded-IP spoof probe did not end with HTTP 429."
    }
    finally {
        if ($malformedStarted) {
            & docker rm -f $malformedContainerName 2>$null | Out-Null
        }
    }

    $shutdownJob = Start-Job -ScriptBlock {
        param($ShutdownOrigin)
        $body = @{
            source = "const started = Date.now(); while (Date.now() - started < 10000) {} console.log('done');"
            timeoutMs = 10000
            mode = "interpret"
        } | ConvertTo-Json -Compress
        try {
            Invoke-WebRequest -Method Post -Uri "$ShutdownOrigin/api/run" `
                -Headers @{ Origin = $ShutdownOrigin; "X-Real-IP" = "203.0.113.30" } `
                -ContentType "application/json" -Body $body -TimeoutSec 20 | Out-Null
        }
        catch {
            # The forced drain is allowed to terminate the client response.
        }
    } -ArgumentList $origin

    try {
        Start-Sleep -Seconds 1
        $shutdownWatch = [Diagnostics.Stopwatch]::StartNew()
        & docker stop --time 12 $containerName | Out-Null
        $shutdownWatch.Stop()
        Assert-True ($LASTEXITCODE -eq 0) "Docker could not stop the self-host container."
        Wait-Job $shutdownJob -Timeout 5 | Out-Null

        $shutdownState = & docker inspect -f `
            "{{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}" $containerName
        $shutdownLogs = @(& docker logs --tail 80 $containerName 2>&1 |
            ForEach-Object { $_.ToString() }) -join "`n"
        Assert-True ($shutdownWatch.Elapsed.TotalSeconds -lt 12) `
            "Shutdown exceeded Docker's twelve-second grace period."
        Assert-True ($shutdownState -eq "exited exit=0 oom=false") `
            "Container did not exit cleanly after SIGTERM: $shutdownState"
        Assert-True ($shutdownLogs.Contains('"event":"shutdown_started"')) `
            "Shutdown start was not logged."
        Assert-True ($shutdownLogs.Contains('"event":"shutdown_forced"')) `
            "Eight-second forced shutdown was not exercised."
        Assert-True ($shutdownLogs.Contains('"event":"shutdown_complete"')) `
            "Shutdown completion was not logged."
    }
    finally {
        Receive-Job $shutdownJob -ErrorAction SilentlyContinue | Out-Null
        Remove-Job $shutdownJob -Force -ErrorAction SilentlyContinue
    }

    [pscustomobject]@{
        image = $Image
        health = "healthy"
        userId = $identity[0]
        groupId = $identity[1]
        presets = @($presetBody).Count
        executionModes = @("interpret", "compile")
        concurrency = "3 admitted / 4 rejected"
        rssLimit = "150MB enforced"
        rateLimit = "10 admitted / 1 rejected"
        malformedWorker = "stable error / host survived"
        forcedShutdownSeconds = [Math]::Round($shutdownWatch.Elapsed.TotalSeconds, 2)
    } | ConvertTo-Json -Depth 4
}
finally {
    if ($containerStarted) {
        & docker rm -f $containerName 2>$null | Out-Null
    }
}
