# SharpTS self-hosting plan

Status: SharpTS prerequisites merged and pinned; Linux container and Aspire local-development paths implemented; frontend migration remains

Last updated: 2026-08-04

## Objective

Replace the production Blazor Server and ASP.NET Core/Kestrel website hosts with
a web server written in TypeScript and compiled or interpreted by SharpTS.
Retain Aspire as a local-development orchestrator for that compiled host, not as
a production server dependency. Preserve the live playground's process isolation
and resource controls.

This removes Blazor, ASP.NET Core, Kestrel, SignalR, and the separate web and API
services from the production topology. Aspire remains a development-time process
orchestrator and dashboard. This does not automatically remove the .NET runtime:
ordinary compiled SharpTS output is .NET IL. Eliminating the installed runtime
would be a separate Native AOT objective.

## Conclusion

The migration is feasible. The recommended production shape is still:

```text
Browser
  -> compiled SharpTS HTTP server
       -> localized static HTML/CSS/browser JavaScript
       -> same-origin /api/run and /api/presets routes
       -> /health and /alive routes
       -> isolated SharpTS.Www.Worker child process for submitted code
```

This is not a drop-in host substitution, and the current spike is not yet a
production replacement. The Razor frontend must become static
HTML plus browser-side JavaScript, and the ASP.NET execution supervisor must be
ported or exposed through a small helper. Most CSS and existing browser
JavaScript can be reused.

During the migration, `scripts/run.ps1` and `scripts/run.sh` build the current
SharpTS bundle and start it as a single Aspire executable resource. This gives
the incomplete host a repeatable local URL, health status, lifecycle, and log
view without accidentally exercising the legacy Kestrel applications.

## Evidence collected

The investigation began with the `SharpTS` checkout at commit
`dd6d1c38b605af475d44d375a413b0406a0fd304`. The prerequisite runtime changes
for HTTP binding/lifecycle, request streaming and aborts, response probing,
timer reference accounting, and restricted process control were merged by
SharpTS PR #1348. `sharpts-www` now pins the resulting `origin/main` merge
commit plus the timer follow-up described below.

- SharpTS currently provides `http`, `fs`, `path`, `child_process`, streams, and
  compression in interpreted and compiled modes.
- The existing HTTP and child-process suites passed during the initial
  investigation. New focused interpreted/compiled regressions now cover host
  binding, streamed request bodies, request aborts, graceful drain,
  `Buffer` response bodies, fired-timer reference accounting, and the compiled
  response connection probe.
- `Examples/web-server.ts` compiled into a standalone 489,472-byte assembly plus
  its runtime configuration.
- The compiled server successfully served `/api/time` over loopback.
- The original compiled server could not be reached through the machine's
  non-loopback interface because `server.listen()` hard-coded `127.0.0.1`.
  The local SharpTS changes fix this and add host/address tests. Windows
  wildcard `HttpListener` bindings still require URL ACL setup; the target
  production path is Linux.
- The previous `sharpts-www` submodule pin,
  `fdbbed41d4d96f535f5d3c754d9d32ca9c53964c`, was too old to build the current
`SharpTS.Www.Worker` because it lacked `CompilationService`. The submodule was
advanced first to `c6e73f0c12bc38484b6000110031ca5f5a8a6fbf` for PR #1348 and then to
`32f9f4f43e856c9ba9bef5028274142e75241eb1` for PR #1349. Container builds
consume this immutable gitlink and do not clone a moving `main` branch.
- The first seven-request Linux concurrency test found a separate compiled
  timer defect: `Date.now()` could re-enter `ProcessPendingTimers()` from a due
  timer callback, remove the same timer twice, and terminate the host with exit
  code 139. The re-entrancy guard and dual-mode regression test were merged by
  SharpTS PR #1349. The website now pins its `origin/main` merge commit,
  `32f9f4f43e856c9ba9bef5028274142e75241eb1`, and the clean pinned container
  passes the concurrency test.

## Validated spike

The repository now has a compiled spike under `src/SharpTS.Www.SelfHost` plus a
deterministic bundle script and `Dockerfile.selfhost`. Local emitted-DLL tests
have verified:

- static content, `/health`, `/alive`, `/api/presets`, and `/api/run`
- interpreted and compiled submissions through the unchanged worker protocol
- source, mode, timeout, output, environment, concurrency, and origin controls
- parent-environment clearing and module-import rejection
- parent-process signaling rejected with `EPERM` in both worker modes
- timed-out worker-tree termination without terminating the HTTP host
- client disconnect detection through a chunked JSON-whitespace probe, worker
  termination, and a structured 499 request log
- compiler success plus emitted-IL verification (the build script checks
  positive success markers because the SharpTS CLI can return exit code zero
  after compiler or IL-verifier diagnostics)

The original validation was performed on Windows with RSS enforcement disabled.
The image has now also been built and run as a Linux container with a read-only
root filesystem, a writable bounded `/tmp`, no root user, no Linux capabilities,
`no-new-privileges`, PID limits, and a 1 GiB hard memory limit. The repeatable
container suite verifies both execution modes, static containment and caching,
origin/environment isolation, three-worker saturation with bounded HTTP 503s,
trusted-proxy rate limiting, stable Linux stack-overflow mapping, and `/proc`
RSS termination at 150 MB while the host remains healthy. It also substitutes a
malformed worker, verifies the stable error response and host survival, and
confirms SIGTERM forces and completes a loaded drain after eight seconds. A
repository Linux CI workflow now builds and exercises the same immutable pin.
The Git-free Docker context supplies MinVer with the verified SharpTS version
`1.0.9-alpha.0.55` and revision `32f9f4f4`, stamps that revision on the image,
and fails the suite if the label ever differs from the checked-out gitlink.

The current frontend comprises approximately:

- 21 Razor files / 1,332 lines
- 14 component CSS files / 1,633 lines
- 394 lines of global CSS
- 262 lines of existing browser JavaScript
- 75 `.resx` files for English, Simplified Chinese, French, Spanish, and German

## Proposed mapping

| Current component | SharpTS-hosted replacement |
| --- | --- |
| Razor/Blazor pages | Prebuilt localized HTML |
| Interactive Blazor circuit | Browser DOM event handlers |
| `.resx` localization | Build-time locale data and generated HTML |
| ASP.NET static files | SharpTS `fs`-based static handler |
| Minimal API endpoints | Small TypeScript router |
| `TypeScriptExecutionService` | TypeScript child-process supervisor or a narrow helper |
| `SharpTS.Www.Worker` | Keep unchanged initially |
| Aspire service discovery | Local orchestration only; production uses one container with a direct worker path |
| ServiceDefaults | Explicit health endpoints and structured logs |

## Local development topology

Aspire is intentionally retained for partial local testing while the frontend is
being migrated:

```text
scripts/run.ps1 or scripts/run.sh
  -> compile server.ts and publish SharpTS.Www.Worker
  -> start Aspire AppHost
       -> one `sharpts-www` executable resource
            -> dotnet SharpTS.Www.SelfHost.dll
                 -> static pages and same-origin /api/*
                 -> isolated worker child process per admitted execution
```

The AppHost allocates and proxies a local HTTP port through `PORT`, reports
`/health` in the dashboard, captures the compiled host's structured stdout, and
stops the host with the Aspire application. It does not launch
`SharpTS.Www.Web` or `SharpTS.Www.Api`; keeping those Kestrel projects in the
solution during migration does not make them part of the self-host test path.
Aspire's own AppHost and dashboard use ASP.NET Core internally, so their process
logs can still mention Kestrel. The website resource itself is the emitted
`SharpTS.Www.SelfHost.dll` and uses SharpTS's `http` implementation backed by
`HttpListener`. The development-only AppHost is pinned to Aspire 13.4.6; this
replaced 13.1.2 after its restore reported known vulnerable transitive packages.

The run scripts always rebuild the bundle before Aspire starts. Directly running
the AppHost is allowed only when `artifacts/self-host` already exists, and the
AppHost fails with an actionable error if the server or worker artifact is
missing. On Windows and macOS local development disables the Linux-only `/proc`
RSS check; the Linux container suite remains authoritative for that control.

## Required SharpTS work

### P0: honor the HTTP listen host

Implementation status: complete in SharpTS and pinned by this repository at
`32f9f4f43e856c9ba9bef5028274142e75241eb1`.

The compiled HTTP emitter currently builds this prefix:

```text
http://127.0.0.1:{port}/
```

Consequently, a compiled SharpTS server cannot receive traffic on a container
interface. `server.listen(port, host)` should honor at least:

- `0.0.0.0`
- `::`
- `127.0.0.1`
- `localhost`
- explicit hostnames and addresses

The interpreter also currently parses but ignores the hostname argument. It
attempts a wildcard `HttpListener` prefix and falls back to loopback when that
fails. Both modes should implement the same documented behavior.

The added parity test binds `0.0.0.0` on Linux and reaches the listener through
a non-loopback interface. The emitted website DLL has also been launched and
tested with GET and POST over loopback. Linux container CI should retain a
separate out-of-process smoke test so packaging cannot regress the binding.

### P0: preserve playground worker supervision

Implementation status: implemented in the compiled spike and exercised by the
Linux container suite, including RSS and container limits.

The current API enforces all of the following:

- three concurrent workers, with a bounded wait before HTTP 503
- 10 KB maximum source
- 100 ms to 10 second requested timeout
- 150 MB worker working-set limit, polled every 500 ms
- cleared worker environment
- redirected stdin/stdout/stderr JSON protocol
- whole-process-tree termination
- worker crash and stack-overflow mapping
- output and error sanitization
- request cancellation propagated to worker termination

SharpTS `child_process.spawn()` supplies streams, PID, environment replacement,
events, and whole-process-tree kill behavior. The spike makes these decisions:

1. Read worker RSS from Linux `/proc/{pid}/status` every 500 ms. Production
   fails readiness when RSS enforcement is required on a non-Linux host. This
   is deliberately deployment-specific and avoids broadening the initial
   SharpTS child-process API. A hard container memory limit is still required
   because polling cannot prevent a fast allocation spike or host OOM.
2. Stream `IncomingMessage` bodies and expose meaningful `complete` and
   `aborted` state. This detects disconnects while the request body is arriving.
   After the body is complete, `HttpListener` offers no request-aborted token,
   so the compiled response now has an application probe that flushes one JSON
   whitespace byte every 500 ms. A failed probe cancels the worker and logs 499.
   This was verified end to end. The probe is a narrow workaround and should
   either become a documented SharpTS API or be replaced if the HTTP backend
   changes.
3. Enable the host-only `SharpTS.RestrictProcessControl` AppContext switch in
   the worker. This blocks cross-process `process.kill`, including
   `process.kill(process.ppid)`, in interpreted and compiled submissions.
   Without this control the same-UID child boundary could be used to terminate
   the HTTP parent. This was a missing security invariant in the original plan
   and in the existing API implementation.

### P1: improve compiled HTTP lifecycle parity

Local implementation status: the production-path subset is implemented and
tested; general timeout/header parity remains.

The local compiled server now drains in-flight responses, reports effective
host/address metadata, streams request bodies, observes body aborts, supports a
connection probe, and keeps listener/timer references balanced. It still does
not match the interpreter or Node for every mutable timeout and connection
event. The website owns its request-body and worker timeouts, but the following
remain before calling SharpTS's HTTP server generally production-ready:

- enforced header and request timeouts
- maximum header count and request-body limits
- a documented general client-disconnect API rather than the JSON probe
- delayed asynchronous response ownership in interpreted mode (the interpreter
  currently closes an unfinished response when the synchronous handler returns)

WebSocket upgrades, CONNECT tunneling, and direct HTTP/2 support are not required
for this website after Blazor/SignalR is removed. Railway can terminate TLS and
modern HTTP at its proxy and forward HTTP/1.1 to the container.

## Frontend migration

Generate five localized static versions of the two logical pages:

- `/` and `/{culture}`
- `/how-it-works` and `/{culture}/how-it-works`

This preserves server-rendered SEO metadata, `hreflang`, OpenGraph locale data,
and direct localized links without requiring a server-side component framework.

Suggested approach:

1. Convert `.resx` resources into build-time locale data, preferably JSON or
   TypeScript objects.
2. Implement a SharpTS build script that renders complete HTML for every route
   and culture.
3. Concatenate or otherwise publish the component CSS without Blazor's CSS
   isolation transformation. The source selectors are reusable, but the
   `SharpTS.Www.Web.styles.css` generated asset is not.
4. Port simple Blazor event handlers to browser JavaScript:
   - mobile navigation
   - language selector
   - copy feedback
   - architecture selection
   - live example tabs
   - playground mode, preset, run, clear, and rendering state
5. Keep the current Prism and CodeMirror browser integrations initially.
6. Have the playground call same-origin `/api/run` directly with `fetch()`.

Two migration details need explicit work rather than mechanical copying:

- Vendor and pin Prism, CodeMirror, fonts, and other browser assets. The current
  CDN references are not deterministic and conflict with a strict self-only CSP.
- Rewrite Blazor CSS-isolation selectors such as `::deep`, and make asset URLs
  root-relative or generated per route so localized nested paths do not break
  images, scripts, or styles.

The culture cookie is no longer needed to carry culture into a SignalR circuit.
It can still be retained for root-path language detection and user preference,
or language links can navigate directly to localized paths.

## HTTP routes

The initial server needs only a small explicit router:

```text
GET  /
GET  /{culture}
GET  /how-it-works
GET  /{culture}/how-it-works
GET  /set-culture?culture=...
GET  /api/presets
GET  /api/presets/{name}
POST /api/run
GET  /health
GET  /alive
GET  /css/*, /js/*, /img/*, /favicon.*
```

Static-file handling must use a fixed content root and verify the resolved path
remains inside it. Add explicit MIME types, cache headers, ETags or modification
times, and optional precompressed assets. A general web framework is unnecessary
for this route count.

The spike deliberately rejects percent-encoded paths because SharpTS's compiled
`decodeURIComponent` path was not yet parity-tested. That is safe but incomplete:
encoded preset names and otherwise valid encoded static URLs will fail. Before
shipping, either implement and test a strict UTF-8 percent-decoder with one
canonical decoding pass, or change the preset detail route to documented ASCII
slugs and keep static asset names unencoded.

## Security invariants

User programs must continue to run outside the HTTP server process. Do not
replace the worker boundary with in-process `eval`, interpretation, or
compilation.

Preserve these controls:

- worker concurrency limit
- per-client sliding-window rate limit
- source, timeout, memory, and output limits
- cleared worker environment
- complete child-process-tree termination
- outbound-network blocking inside the worker
- decorators disabled for submitted code
- non-root container user
- read-only production filesystem where practical
- no host secrets in the worker environment or working directory

Corrections and defense in depth:

- Clearing the worker environment does not prevent same-UID process signaling;
  the new host-only process-control restriction is required.
- The current network control blocks global `fetch()` through a dead proxy and
  single-source execution rejects module imports. This is verified, but it is a
  language-surface restriction rather than an OS egress sandbox. Add platform
  egress controls if the deployment environment supports them, and retain a
  regression proving imports remain rejected in both modes.
- The 500 ms RSS poll is not a hard memory sandbox. Configure a container memory
  limit with headroom for the host plus three workers and load-test its failure
  behavior.
- Linux stack-overflow and crash exit codes differ from Windows. Verify error
  mapping in the production image rather than relying on the current Windows
  stack-overflow code alone.

Additional HTTP-host requirements:

- Accept JSON only for `/api/run` and cap the request body while streaming it.
- Reject or tightly control cross-origin requests. A same-origin deployment no
  longer needs general production CORS.
- Validate `Origin` for browser requests that consume execution resources.
- Derive rate-limit identity from a trusted Railway proxy policy. Never blindly
  trust a client-supplied `X-Forwarded-For` header.
- Add standard security headers and preserve HSTS at the edge.
- Ensure malformed worker output cannot escape as arbitrary HTTP content.

The spike trusts `X-Real-IP` only when
`SHARPTS_WWW_TRUST_RAILWAY_PROXY=true`; otherwise it uses the direct peer. The
in-memory 10/minute sliding window is bounded to 4,096 identities. It is valid
only for the initial single-replica deployment. Multiple replicas require a
shared limiter or an explicit acceptance that the limit is per replica.

## Observability and operational changes

Removing `ServiceDefaults` also removes automatic ASP.NET and `HttpClient`
OpenTelemetry instrumentation. The first version should at least emit structured
request logs containing method, normalized path, status, elapsed time, request
ID, and trusted client identity. Log worker start, exit, timeout, memory kill,
and concurrency rejection without logging submitted source.

Expose `/health` and `/alive`. Handle termination signals, stop accepting new
requests, allow a short drain window, then kill remaining worker trees.

The deployment should read Railway's `PORT` and bind it to `0.0.0.0`. TLS should
remain terminated by Railway rather than using SharpTS's HTTPS implementation in
the first release.

## Implementation sequence

1. **Complete:** SharpTS prerequisite changes were merged by PR #1348, the timer
   re-entrancy regression was merged by PR #1349, and the website submodule is
   pinned to merge commit `32f9f4f4`.
2. **Complete and pinned:** fix `server.listen(port, host)` in interpreted and
   compiled SharpTS.
3. **Complete and pinned:** add non-loopback listener and emitted-host tests;
   the repository now includes a Linux container suite and CI workflow.
4. **Complete:** build a compiled spike serving health, static content, and POST
   JSON on the configured interface.
5. **Chosen and locally proven:** Linux `/proc` RSS monitoring, a 1 GiB hard
   container limit, and a compiled response probe for post-body disconnect
   cancellation.
6. **Complete for the spike:** port `TypeScriptExecutionService` behavior while
   retaining the existing worker and stdin/stdout JSON contract.
7. **Partial:** timeout, cancellation, environment clearing, origin rejection,
   import rejection, parent-signal blocking, host survival, Linux RSS,
   concurrency saturation, trusted-proxy rate-limit identity, and stack overflow
   are proven. Malformed worker output and shutdown under load also pass in the
   container suite. A deliberate hard-limit OOM test remains.
8. **Complete for local development:** migrate the Aspire AppHost from the
   legacy `SharpTS.Www.Web` and `SharpTS.Www.Api` Kestrel projects to one
   executable resource running the compiled SharpTS server. The local run scripts
   rebuild the server and worker bundle before starting Aspire.
9. **Not started:** convert resources and Razor markup into localized static
   output.
10. **Not started:** port browser interactivity and connect the real playground
   UI to the same-origin API.
11. **Partial:** traversal containment, MIME, ETag/cache, body streaming, origin,
     and trusted-IP logic exist. Automated encoded traversal, cache, malformed
     JSON, origin, and trusted proxy/rate-limit tests pass; untrusted forwarded-IP
     spoofing and request-body disconnect coverage remain.
12. **Local and hosted Linux CI pass:** `Dockerfile.selfhost` contains the
     compiled host, static assets, and worker and uses the .NET runtime (not
     ASP.NET) image as a non-root user. The hardened image and container suite pass
     from the clean `32f9f4f4` pin, and deterministic provenance metadata is
     verified by the repository workflow.
13. **Not started:** load test and canary before removing the existing Railway
     web and API services.

## Acceptance criteria

- **Linux container pass:** production listener is reachable on the container
  interface.
- **Pending:** all localized routes render correct HTML, metadata, and internal
  links with JavaScript disabled.
- **Local pass:** playground protocol works in interpret and compile modes.
- **Local pass:** submitted code runs only in an isolated worker process.
- **Local Linux pass / deployment pending:** source, time, output, concurrency,
  environment, import/network, process-control, RSS, and container-boundary
  restrictions exist. Railway hard-limit and egress behavior still need canary
  validation.
- **Local pass:** disconnecting a request terminates its worker and logs 499.
- **Partial:** static containment, encoded traversal, caching, and opt-in
  trusted-proxy rate limiting are automated; untrusted forwarding spoof coverage
  remains.
- **Local pass:** health endpoints and structured request/worker logs exist.
- **Linux forced-drain pass / load pending:** graceful termination drains
  responses and the cutoff kills remaining worker trees.
- **Local and hosted Linux image pass:** the runtime stage contains no
  SDK, Blazor, ASP.NET Core, Kestrel, SignalR, or Aspire host.

## Open decisions

Decisions made for the spike:

- Retain Aspire for local development and partial migration testing, but run the
  compiled SharpTS server as its only website resource. Aspire is not included in
  the production image or request path.
- Use compiled managed IL for the first production host. Native AOT remains a
  separate later objective.
- Use immutable SharpTS gitlinks; `32f9f4f4` is the reviewed shipping pin and
  contains PR #1348 plus the PR #1349 timer re-entrancy fix.
- Use a Linux-specific `/proc` supervisor for worker RSS and fail readiness when
  required monitoring is unavailable.
- Start with one replica, structured JSON logs, and the bounded in-memory rate
  limiter.
- Start with a 1 GiB hard memory limit for the host plus three workers; tune only
  after production-shaped load data.
- Keep TLS/HSTS at Railway and bind `0.0.0.0:$PORT` in the container.

Decisions still required before the migration can ship:

- Choose strict decoded path support versus ASCII slugs. The recommendation is
  slugs for preset detail routes plus a small, separately tested decoder only if
  encoded static paths are actually needed.
- Decide whether generated localized HTML is committed or built only in CI.
  The recommendation is CI-only generation with a deterministic snapshot test.
- Preserve the culture cookie or use path-only language selection. The
  recommendation is path-only routes and ordinary language links.
- Decide whether Railway's proxy is the sole ingress. Set
  `SHARPTS_WWW_TRUST_RAILWAY_PROXY=true` only in that topology, set the exact
  `SHARPTS_WWW_PUBLIC_ORIGIN`, configure `/health`, and configure a drain window
  longer than the host's eight-second forced cutoff.
- Choose the Railway outbound-egress policy. Application controls are necessary
  but should not be the only network boundary.
- Decide what replaces automatic OpenTelemetry. The recommendation is to ship
  structured logs first, then add an explicit OTLP exporter only after the
  single-service deployment is stable.
- Decide whether `probeConnection()` and
  `SharpTS.RestrictProcessControl` become supported SharpTS APIs or remain
  narrowly documented host integrations. Both are required by this deployment.
