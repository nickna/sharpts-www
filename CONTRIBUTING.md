# Contributing to the SharpTS website

Thanks for helping make SharpTS easier to discover, understand, and try.

## Set up the repository

The site builds against an exact SharpTS commit stored as a git submodule:

```bash
git clone --recurse-submodules https://github.com/nickna/sharpts-www.git
cd sharpts-www
npm ci
```

If you already cloned without submodules, run:

```bash
git submodule update --init --recursive
```

You need the .NET 10 SDK and Node.js 22 or newer. Start the complete development
topology with `scripts/run.ps1` on Windows or `scripts/run.sh` on Linux/macOS.
The [architecture guide](docs/architecture.md) explains the build and runtime
boundaries in more detail.

## Understand the build

Three different TypeScript environments intentionally coexist:

1. The server, supervisor, configuration, queue, and static-generator modules
   compile to .NET through the pinned SharpTS submodule.
2. `worker.ts` compiles to a separate executable so untrusted playground code
   cannot run in the HTTP process.
3. Files under `browser/` compile with TypeScript and bundle with esbuild.

Do not edit files under `artifacts/`; they are disposable build output. Changes
to the SharpTS language implementation belong in the upstream SharpTS repository
and should reach this repository by updating the submodule commit.

## Keep changes safe and reviewable

- Preserve the process boundary between the HTTP server and playground worker.
- Keep worker limits and request cancellation enforced by `supervisor.ts`.
- Treat worker stdin/stdout as a private JSON protocol; update both sides when
  its shape changes. Boundary values belong in `SharpTS.Www.Shared` and must be
  validated before use.
- Avoid remote browser assets. The Content Security Policy permits first-party
  scripts, styles, fonts, and images only.
- Prefer small modules with explicit boundary types over unchecked data
  coercion.
- Keep displayed examples in `showcase-data.ts`; the build must execute them and
  match their advertised output in both modes.

## Localization

Localization lives in `locales/<culture>/{common,home,how-it-works,conformance}.json`.
Every dotted English message key must exist in French, Spanish, German, and
Simplified Chinese. The generator validates recursive key parity, string leaves,
and identical named-placeholder sets before emitting path-based routes (`/`,
`/fr`, `/es`, `/de`, and `/zh-Hans`).

When adding or renaming text, update the matching catalog in all five culture
directories. Use named placeholders such as `{count}` or `{duration}` and pass
values through the shared formatter; positional tokens are not supported. Run
`npm run check:i18n` and the generated-site test.

## Run checks

For the ordinary contributor gate:

```bash
npm run verify
```

For server, generator, localization, CSS, or worker changes, build first and run
the generated-site checks:

```bash
npm run build:self-host -- --configuration Debug
npm run test:generated
npm run test:e2e
```

The platform scripts call this same build orchestrator. Changes to worker
isolation, resource limits, shutdown, proxy trust, compression, or request
validation should also pass `npm run test:isolation`.

Biome owns formatting and linting for TypeScript, JavaScript, and project JSON.
Use `npm run check:write` for safe automatic fixes, then inspect the diff.
SharpTS-specific source keeps a few documented adapter casts required by its
Node compatibility declarations.

Generated output is protected by reviewed SHA-256 hashes. After inspecting an
intentional site or asset change, run `npm run snapshot:update`; the command
requires the explicit acceptance flag embedded in the npm script.

## Refresh performance benchmarks

From the website repository root, refresh the pinned cross-runtime benchmark
evidence with one command:

```powershell
.\scripts\refresh-performance-benchmarks.ps1
```

The script runs the complete suite three times, validates the generated evidence,
and updates `lib/SharpTS/benchmarks/cross-runtime/snapshots/latest.json` only after
the run succeeds. Diagnostic files are retained under
`artifacts/benchmark-refresh/`. A failed or interrupted run leaves the canonical
snapshot unchanged.

## Contribute documentation

Editorial documentation lives under `src/SharpTS.Www.SelfHost/docs/`. Edit the
Markdown source that corresponds to the published `/docs/...` route and keep its
metadata in `docs-manifest.ts` accurate. The `/docs` overview is sourced from
`docs/index.md`.

The API reference under `/docs/api` is generated from the public declarations in
the pinned SharpTS source. Fix API documentation at its upstream source and then
regenerate the catalog with `npm run generate:api`. Do not edit generated HTML,
the API catalog, or anything under `artifacts/` directly; those files are build
output and will be replaced.

Before opening a pull request, keep the scope focused, explain externally visible
behavior, and call out security-sensitive changes explicitly.
