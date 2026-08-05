# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The marketing + playground website for **SharpTS** (a TypeScript interpreter/AOT compiler for .NET). This repo is the website; the actual SharpTS language implementation lives in the `lib/SharpTS` **git submodule** and is consumed as a project reference, not a NuGet package.

```bash
git submodule update --init --recursive   # required before first build
```

Target framework is `net10.0` (see `Directory.Build.props`), orchestrated locally with **.NET Aspire** (AppHost SDK 13.4.6).

The active migration path is `SharpTS.Www.SelfHost`: a TypeScript HTTP server
compiled by SharpTS, generated localized HTML/CSS, a bundled browser controller,
and the isolated Worker. The retired Blazor/Kestrel implementation is available
in Git history rather than retained in the working tree.

## Running locally

```powershell
.\scripts\run.ps1      # Windows; bash equivalent: ./scripts/run.sh
```

The script builds the compiled SharpTS host, browser bundle, localized site, and
Worker before launching the Aspire AppHost. Open the `sharpts-www` endpoint shown
by Aspire. `Ctrl+C` stops everything.

Directly running the AppHost requires an existing `artifacts/self-host` bundle;
use `scripts/build-self-host.ps1` or `.sh` first. Browser TypeScript, generated
HTML, localization, CSS, and server changes require rebuilding that bundle.

Primary checks:

```powershell
.\scripts\build-self-host.ps1 -Configuration Debug
.\scripts\test-generated-site.ps1
npm run verify:browser # requires a completed self-host build
npm run test:e2e       # requires the Playwright Chromium runtime
```

The Linux container suite remains the authoritative worker-isolation and shutdown
test: `scripts/test-self-host-container.ps1`.

## Architecture

Active production-path components:

- **SelfHost** — SharpTS-compiled HTTP/static/API server and worker supervisor.
- **Browser bundle** — first-party TypeScript plus pinned CodeMirror, Prism, and fonts.
- **Worker** — unchanged short-lived process that executes one request.
- **AppHost** — development-only Aspire orchestration of the compiled SelfHost bundle.

### Playground execution flow (the security-critical core)

User code never runs in the HTTP process. The chain is:

```
Browser fetch → SharpTS SelfHost POST /api/run → supervisor.ts
  → spawns Worker child process (stdin/stdout JSON) → SharpTS interpreter/compiler → JSON response
```

Inside the Worker, `request.Source` goes through SharpTS' `Lexer → Parser → TypeChecker.CheckWithRecovery → VariableResolver → Interpreter` (decorators disabled). `Console.Out`/`Console.Error` are redirected into a `CappedStringWriter`; the **real** stdout is reserved for the JSON protocol response, so the worker must never write the response to the redirected `Console.Out`.

The isolation/limits are the core of the design. `supervisor.ts` owns the
three-worker concurrency cap, bounded queue, source/timeout/output limits, Linux
RSS polling, cleared worker environment, process-tree termination, crash mapping,
and request-cancellation propagation. `server.ts` owns JSON/body limits,
same-origin validation, the per-client rate limit, trusted-proxy policy, health,
draining, and structured request logs. Preserve both layers when changing
execution.

The worker has no independent timeout; the supervisor is the sole enforcement
point. When changing the stdin/stdout protocol, update both `supervisor.ts` and
`SharpTS.Www.Worker/Program.cs` because the contract is deliberately process-local
rather than a shared assembly.

### Localization (i18n)

The active static generator reads the 75 files under
`SharpTS.Www.SelfHost/locales`, validates every localized key set against English,
and emits direct path-based routes. Add every new key to all five cultures and run
`scripts/test-generated-site.ps1`; there is no culture cookie or `/set-culture`
endpoint in the SelfHost contract.

English uses `/`; the other cultures use `/fr`, `/es`, `/de`, and `/zh-Hans`.
Language switching is a normal link to the equivalent localized route. There is
no culture cookie, request-time localization middleware, or `/set-culture`
endpoint. Code-sample comments are localized; literal program output is not.

## Deployment

`Dockerfile.selfhost` builds the browser assets, compiled SharpTS host, generated
site, and Worker into one non-root .NET runtime image. It is the repository's
only deployment Dockerfile. Clarity is not part of the self-host bundle; adding
analytics requires an explicit CSP and privacy decision.

Railway build, health, restart, and drain settings live in `railway.json`.
Environment-specific variables, the one-replica 1 GiB limit, canary checks, and
cutover procedure are documented in `docs/railway-selfhost-rollout.md`.
