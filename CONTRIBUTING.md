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

1. `server.ts`, `supervisor.ts`, and `generate-site.ts` compile to .NET through
   the pinned SharpTS submodule.
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
  its shape changes.
- Avoid remote browser assets. The Content Security Policy permits first-party
  scripts, styles, fonts, and images only.
- Prefer small modules with explicit boundary types over unchecked data
  coercion.

## Localization

English is the neutral `.resx` file. Every resource key must exist in English,
French, Spanish, German, and Simplified Chinese. The generator validates the key
sets and emits path-based routes (`/`, `/fr`, `/es`, `/de`, and `/zh-Hans`).

When adding or renaming text, update all five resource files for that component
and run the generated-site test.

## Run checks

For browser or shared contract changes:

```bash
npm test
```

For server, generator, localization, CSS, or worker changes, build first and run
the generated-site checks:

```powershell
./scripts/build-self-host.ps1 -Configuration Debug
./scripts/test-generated-site.ps1
npm run test:e2e
```

On Linux or macOS, use `./scripts/build-self-host.sh Debug`. Changes to worker
isolation, resource limits, shutdown, proxy trust, or request validation should
also pass `scripts/test-self-host-container.ps1`.

Before opening a pull request, keep the scope focused, explain externally visible
behavior, and call out security-sensitive changes explicitly.
