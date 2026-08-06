# Website architecture

The SharpTS website is deliberately more than a static marketing site. Its
production backend and site generator are TypeScript programs compiled to .NET
by SharpTS, making the deployed application a continuous integration example
for the language itself.

## Build-time flow

```text
server.ts + supervisor.ts ── SharpTS AOT compiler ──> HTTP server DLL
worker.ts                  ── SharpTS AOT compiler ──> worker executable
site modules + .resx       ── SharpTS interpreter ──> localized HTML/CSS
browser/site.ts            ── TypeScript + esbuild ──> split browser JS/CSS
```

The build assembles those outputs under `artifacts/self-host`. Development and
production both run that same bundle: .NET Aspire provides local orchestration,
while `Dockerfile.selfhost` creates the Linux production image.

## Runtime components

### HTTP server

`server.ts` serves generated files and owns HTTP-level policy: security headers,
same-origin checks, request-size and body-time limits, per-client rate limiting,
health endpoints, structured request logs, and graceful draining.

`config.ts` validates every limit before the listener starts. Forwarded client
identity is accepted only from an explicit trusted peer or an opted-in private
platform proxy. Static assets use ETags; fingerprinted browser assets use
immutable caching and deterministic precompressed Brotli/gzip siblings.

### Supervisor

`supervisor.ts` is the security boundary between the public API and executable
user code. It validates the execution contract, bounds the queue and concurrent
workers, applies timeout/output/memory limits, clears the worker environment,
terminates process trees, and maps worker failures into stable API responses.

### Worker

Each accepted execution starts a fresh `worker.ts` process. The worker reads one
JSON request from stdin, invokes SharpTS's public execution service, writes one
JSON response to stdout, and exits. Guest output is captured separately so it
cannot corrupt the process protocol.

```text
Browser
  │ POST /api/run
  ▼
HTTP server ── validated request ──> Supervisor
                                        │ spawn + stdin JSON
                                        ▼
                                  Isolated worker
                                        │
                         Lexer → Parser → TypeChecker
                              ↙                    ↘
                       Interpreter             IL compiler
```

The worker intentionally has no independent timeout. The supervisor is the sole
owner of cancellation and resource enforcement, which avoids competing timers
across the process boundary.

## Shared execution contract

`SharpTS.Www.Shared/execution-contract.ts` contains the application-owned
request, response, preset, and worker payload types plus normalization helpers.
The self-host compatibility facade re-exports it. Operating-system APIs remain
behind narrow local interfaces because SharpTS supplies its own Node-compatible
runtime types. The browser and supervisor validate JSON again before use.

## Static generation and localization

The generator is separated into path/configuration, localization, safe HTML,
filesystem, validation/build, and page-markup modules. It treats English
`.resx` files as the neutral resource set and requires identical keys for
French, Spanish, German, and Simplified Chinese.
It emits direct path-based routes rather than selecting culture at request time.
CSS sources are concatenated deterministically. The browser manifest identifies
fingerprinted entry/chunk files; the small site controller loads the playground
and CodeMirror chunk only when needed. Dependencies and fonts are bundled
locally so the production Content Security Policy needs no CDN.

`showcase-data.ts` is the typed source of truth for displayed examples, expected
output, execution surface, and the human-reviewed feature matrix revision. The
build runs worker-compatible examples through both isolated modes and verifies
full-CLI interop by interpretation and compiled IL execution.

Generated output is verified against structural checks and SHA-256 snapshots;
browser budgets separately cover initial and total raw/Brotli payloads.
It is disposable and should never be edited under `artifacts/`.

## Development topology

`scripts/run.ps1` and `scripts/run.sh` build the full bundle before launching the
Aspire AppHost. Aspire allocates the local endpoint and passes its public origin
to the compiled server so same-origin validation sees the browser-facing URL.
The production container skips Aspire and launches the same server DLL directly
as a non-root user.
