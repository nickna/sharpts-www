# SharpTS self-hosting plan

Status: investigation complete; implementation not started

Last updated: 2026-08-04

## Objective

Replace the Blazor Server, ASP.NET Core/Kestrel, and Aspire website hosts with a
web server written in TypeScript and compiled or interpreted by SharpTS. Preserve
the live playground's process isolation and resource controls.

This removes Blazor, ASP.NET Core, Kestrel, SignalR, Aspire, and the separate web
and API services. It does not automatically remove the .NET runtime: ordinary
compiled SharpTS output is .NET IL. Eliminating the installed runtime would be a
separate Native AOT objective.

## Conclusion

The migration is feasible. The recommended production shape is:

```text
Browser
  -> compiled SharpTS HTTP server
       -> localized static HTML/CSS/browser JavaScript
       -> same-origin /api/run and /api/presets routes
       -> /health and /alive routes
       -> isolated SharpTS.Www.Worker child process for submitted code
```

This is not a drop-in host substitution. The Razor frontend must become static
HTML plus browser-side JavaScript, and the ASP.NET execution supervisor must be
ported or exposed through a small helper. Most CSS and existing browser
JavaScript can be reused.

## Evidence collected

The investigation used the current `SharpTS` checkout at commit
`dd6d1c38b605af475d44d375a413b0406a0fd304` plus pre-existing, unrelated native
AOT working-tree changes. No SharpTS HTTP or child-process source was changed.

- SharpTS currently provides `http`, `fs`, `path`, `child_process`, streams, and
  compression in interpreted and compiled modes.
- 74 HTTP-focused SharpTS tests passed across interpreted and compiled modes.
- 78 child-process tests passed, including stdin/stdout, environment
  replacement, events, and process-tree killing.
- `Examples/web-server.ts` compiled into a standalone 489,472-byte assembly plus
  its runtime configuration.
- The compiled server successfully served `/api/time` over loopback.
- The same server could not be reached through the machine's non-loopback
  interface. Inspection confirmed that compiled `server.listen()` hard-codes
  `127.0.0.1`.
- The existing `sharpts-www` submodule is pinned to SharpTS commit
  `fdbbed41d4d96f535f5d3c754d9d32ca9c53964c` from 2026-06-09. Current SharpTS
  contains later HTTP and compiled child-process fixes, so the submodule must be
  updated before this work begins.

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
| Aspire service discovery | One container with a direct worker path |
| ServiceDefaults | Explicit health endpoints and structured logs |

## Required SharpTS work

### P0: honor the HTTP listen host

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

Add an out-of-process integration test that compiles a DLL, launches it, sends
GET and POST requests, and verifies `listen(port, "0.0.0.0")`. Existing tests
did not catch the externally unreachable compiled server.

### P0: preserve playground worker supervision

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

SharpTS `child_process.spawn()` already supplies the required streams, PID,
events, environment replacement, and process-tree kill behavior. Two pieces
need a deliberate design:

1. Worker RSS is not part of the current child-process surface. Options include
   a `dotnet:System.Diagnostics.Process` import with an explicit framework
   reference, a small reusable supervisor helper, or a carefully designed
   SharpTS runtime API.
2. An HTTP client disconnect must cancel the worker. Compiled SharpTS currently
   reports server-side `IncomingMessage.complete` and `aborted` as constant
   false, and the interpreter's abort marker does not appear to be wired into
   the request lifecycle. Expose a reliable `aborted` or `close` event.

### P1: improve compiled HTTP lifecycle parity

The compiled server exposes default lifecycle configuration values but does not
currently match the interpreter for mutable timeouts, connection events, or
graceful in-flight draining. The website can own most application timeouts, but
the following should be evaluated before calling SharpTS's HTTP server generally
production-ready:

- graceful shutdown while requests are active
- enforced header and request timeouts
- maximum header count and request-body limits
- observable request aborts
- consistent host/address reporting

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

Additional HTTP-host requirements:

- Accept JSON only for `/api/run` and cap the request body while streaming it.
- Reject or tightly control cross-origin requests. A same-origin deployment no
  longer needs general production CORS.
- Validate `Origin` for browser requests that consume execution resources.
- Derive rate-limit identity from a trusted Railway proxy policy. Never blindly
  trust a client-supplied `X-Forwarded-For` header.
- Add standard security headers and preserve HSTS at the edge.
- Ensure malformed worker output cannot escape as arbitrary HTTP content.

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

1. Update the website's SharpTS submodule to a current tested revision.
2. Fix `server.listen(port, host)` in interpreted and compiled SharpTS.
3. Add the out-of-process compiled HTTP integration test.
4. Build a minimal compiled spike serving `/health`, one static file, and a POST
   echo endpoint on `0.0.0.0`.
5. Decide and prove the worker RSS and request-disconnect mechanisms.
6. Port `TypeScriptExecutionService` behavior while retaining the existing C#
   worker and stdin/stdout JSON contract.
7. Add unit and integration tests for concurrency, rate limiting, timeout,
   memory, cancellation, environment clearing, and worker crashes.
8. Convert resources and Razor markup into localized static output.
9. Port interactivity into browser JavaScript and connect the playground to the
   same-origin API.
10. Add static-path traversal, cache, MIME, malformed-request, forwarded-IP, and
    origin tests.
11. Build one production container containing the compiled SharpTS host, static
    assets, and worker executable.
12. Load test and canary the new service before removing the existing Railway
    web and API services.

## Acceptance criteria

- The production listener is reachable on the container interface.
- All localized routes render correct HTML, metadata, and internal links with
  JavaScript disabled.
- The playground works in both interpret and compile modes.
- Submitted code never runs in the HTTP process.
- Existing source, time, memory, output, concurrency, environment, and network
  restrictions remain effective.
- Disconnecting a request terminates its worker promptly.
- Static path traversal and spoofed forwarded headers are rejected.
- Health checks and structured operational logs are available.
- Graceful termination does not orphan worker processes.
- No Blazor, ASP.NET Core, Kestrel, SignalR, or Aspire runtime remains in the
  website container.

## Open decisions

- Whether the first production host should be compiled managed IL or interpreted
  by a Native AOT SharpTS host.
- Whether worker RSS monitoring belongs in SharpTS, a narrow C# helper, or a
  platform-specific supervisor.
- Whether generated localized HTML should be committed or built only in CI.
- Whether to preserve the culture cookie or use path-only language selection.
- What replaces the current automatic OpenTelemetry instrumentation.
