# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The marketing + playground website for **SharpTS** (a TypeScript interpreter/AOT compiler for .NET). This repo is the website; the actual SharpTS language implementation lives in the `lib/SharpTS` **git submodule** and is consumed as a project reference, not a NuGet package.

```bash
git submodule update --init --recursive   # required before first build
```

Target framework is `net10.0` (see `Directory.Build.props`), orchestrated with **.NET Aspire** (AppHost SDK 13.1.2).

## Running locally

```powershell
.\scripts\run.ps1      # Windows; bash equivalent: ./scripts/run.sh
```

The script initializes the `lib/SharpTS` submodule if missing, trusts the HTTPS dev cert, builds, and launches the Aspire AppHost. It prints an Aspire dashboard URL (with a login token) plus child-service URLs — open the **web** endpoint for the site. `Ctrl+C` stops everything.

Equivalent manual run: `dotnet run --project src/SharpTS.Www.AppHost` (but first run `git submodule update --init --recursive` — the Worker has a project reference to `lib/SharpTS/SharpTS.csproj`, so a fresh clone fails the build with `MSB9008`/`CS0246 'SharpTS'` until the submodule is checked out; `run.ps1`/`run.sh` do this for you). For C# hot reload, `dotnet watch` on the AppHost. CSS/JS edits under `wwwroot` are picked up on browser refresh; `.razor`/C# changes need a rebuild.

Build the whole solution: `dotnet build SharpTS.Www.slnx`.

**There is no automated test suite in this repo** — verification is manual/in-browser. Animation and loading behaviors in particular must be checked in a real browser (see the Blazor caveats below), not just via a passing build.

## Architecture

Five projects (`SharpTS.Www.slnx`), plus the `lib/SharpTS` submodule:

- **AppHost** — Aspire orchestrator. Wires up `api` and `web` as managed services. **The Worker is deliberately *not* an Aspire-managed service**: AppHost references it only to force it to build, computes its compiled exe path, and passes that to the API as the `Worker__ExecutablePath` env var. The API then spawns the worker as a child process per request.
- **Web** — Blazor Server frontend (the landing page + playground UI). Talks to the API via a typed `PlaygroundApiClient` whose base address defaults to the Aspire service-discovery name `https+http://api` (override with the `ApiBaseUrl` config key).
- **Api** — minimal-API backend exposing `/api/run`, `/api/presets`, `/api/presets/{name}`. Owns `TypeScriptExecutionService`.
- **Worker** — a short-lived console exe. Reads one JSON request from stdin, runs it through the SharpTS pipeline, writes one JSON response to stdout, exits.
- **ServiceDefaults** — shared Aspire wire-up (telemetry, health, service discovery) via `AddServiceDefaults()` / `MapDefaultEndpoints()`.

### Playground execution flow (the security-critical core)

User code never runs in the API or Web process. The chain is:

```
Blazor Web → PlaygroundApiClient → POST /api/run → TypeScriptExecutionService
  → spawns Worker child process (stdin/stdout JSON) → SharpTS interpreter → JSON back up the chain
```

Inside the Worker, `request.Source` goes through SharpTS' `Lexer → Parser → TypeChecker.CheckWithRecovery → VariableResolver → Interpreter` (decorators disabled). `Console.Out`/`Console.Error` are redirected into a `CappedStringWriter`; the **real** stdout is reserved for the JSON protocol response, so the worker must never write the response to the redirected `Console.Out`.

The isolation/limits are the whole point of the multi-process design — preserve them when touching execution:

- `TypeScriptExecutionService`: `SemaphoreSlim(3)` concurrency cap (returns `null` → HTTP 503 when full), 10 KB max source, 100 ms–10 s clamped timeout, 150 MB working-set poll (killed if exceeded), **cleared process environment** (so user code's `process.env` can't read host secrets), and `Kill(entireProcessTree: true)` on timeout/OOM.
- The worker has *no* internal timeout — the parent process is the sole enforcer of kill. Special exit codes are mapped to messages (e.g. `0xC00000FD` → stack overflow).
- `Api/Program.cs`: per-IP sliding-window rate limiting (10/min) on `/run`, and CORS that allows any origin **only** in Development.

When changing the worker's request/response shape, update the `WorkerRequest`/`WorkerResponse` records in **both** `Worker/Program.cs` and `TypeScriptExecutionService.cs` — they're a hand-mirrored stdin/stdout contract, not a shared type.

### Frontend / Blazor caveats

The site is **Blazor Server with prerendering** (`InteractiveServerRenderMode(prerender: true)` in `Components/App.razor`). This means every page renders twice — static prerendered HTML first, then again when the SignalR circuit connects. Consequences that repeatedly cause bugs:

- JS-driven entrance animations and `IJSRuntime` calls only run from `OnAfterRenderAsync(firstRender)`, i.e. *after* the circuit connects. On slow connections this is well after the user sees prerendered content, so naive "play animation on connect" code re-flashes already-visible content. Guard timing-sensitive effects (see `wwwroot/js/site-interop.js`'s `__pageShown` elapsed check and `prefers-reduced-motion` handling).
- Blazor reconciliation can strip JS/Prism DOM mutations made before the circuit attaches, so syntax highlighting is (re)applied from `OnAfterRenderAsync` rather than relying on Prism's auto-pass.
- Component-scoped CSS lives in `*.razor.css`; global styles and design tokens are in `wwwroot/css/app.css` and `theme.css`.

### Localization (i18n)

The site ships in English (default), Simplified Chinese, French, Spanish, and German via the canonical ASP.NET Core stack: `IStringLocalizer<T>` backed by per-component `.resx` files under `Web/Resources/`. The supported set lives in one place — `Localization/SupportedCultures.cs` (`All`, `Default`, `Normalize`, `DisplayNames`, `OpenGraphLocale`). English is the **neutral** (unsuffixed) `.resx`; the other languages are satellite assemblies (`.<culture>.resx`).

Key invariants — breaking any of these silently regresses localization (verify in a real browser, not just a passing build):

- **Each language has a URL path prefix** (`/fr`, `/es`, `/de`, `/zh-Hans`); English is the bare `/`. `Home.razor` is `@page "/{culture?}"` and redirects unknown single-segment paths to `/`. Culture is resolved by `RequestLocalizationMiddleware` (providers, in order: `PathCultureProvider` → cookie → `Accept-Language`) set up in `Program.cs`.
- **The culture cookie is what localizes the interactive circuit.** The SignalR circuit reconnects to `/_blazor` (no path prefix), so `CultureRedirectMiddleware` writes/refreshes the culture cookie on every prefixed page request. The middleware also auto-redirects `/` to the detected language. Without the cookie, prerender is translated but post-circuit interactive content reverts to the browser's `Accept-Language`.
- **Language switching must `forceLoad`.** The selector (`Components/Shared/LanguageSelector.razor`) navigates to the `/set-culture?culture=…` minimal-API endpoint via `NavigateTo(forceLoad: true)`. A normal `<a>`/enhanced-nav click is intercepted by the interactive router and matched against the `{culture?}` route instead of hitting the server (it would bounce to `/` = English). `data-enhance-nav="false"` is **not** enough — that only governs enhanced navigation, not interactive-router link interception.
- **Adding a user-facing string**: add the key to that component's `.resx` for **all five** cultures (`Component.resx` + four `Component.<culture>.resx`) and reference it via `@inject IStringLocalizer<TComponent> L` / `L["Key"]`. Components that build lists from localized strings (`LiveCodeExamples`, `FeatureComparison`) populate them in `OnInitialized` (the injected `L` isn't available in field initializers). Code-sample comments are localized; program *output* is left as the interpreter's literal stdout. `App.razor` owns `<html lang>`, the localized `<title>`/meta, `og:locale`, and the `hreflang` alternates.

## Deployment

`Dockerfile.web` and `Dockerfile.api` build the two services for Railway. `Dockerfile.api` clones the SharpTS submodule during the build (the worker is bundled with the API image). Microsoft Clarity analytics loads only when the `CLARITY_TAG` config/env var is set, injected via JS interop after first render.
