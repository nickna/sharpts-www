# SharpTS website

[![Self-host container](https://github.com/nickna/sharpts-www/actions/workflows/self-host-container.yml/badge.svg)](https://github.com/nickna/sharpts-www/actions/workflows/self-host-container.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

This is the source for [sharpts.dev](https://sharpts.dev), the website and live
playground for [SharpTS](https://github.com/nickna/SharpTS)—a TypeScript
interpreter and ahead-of-time compiler for .NET.

The site is also a working demonstration of SharpTS. Its production HTTP
server, static-site generator, and isolated playground worker are written in
TypeScript and compiled to .NET assemblies by SharpTS. The browser controller
is ordinary TypeScript bundled with esbuild. No Blazor runtime or third-party
CDN is required in production.

The build executes every example shown on the homepage in interpreter and
compiler modes and checks its displayed output. The marketing claims are part
of the test suite.

## How it works

```text
Localized .resx + typed showcase data ──> SharpTS generator ──> HTML/CSS
                                                                  │
Browser ── POST /api/run ──> SharpTS HTTP server                   │
                                  │                               │
                                  └─> isolated worker ──> SharpTS execution
                                      (one process per request)
```

Playground code never runs inside the HTTP server. The supervisor enforces a
bounded queue, concurrency, timeout, output, and Linux memory limits, then
starts a fresh worker with a cleared environment. See the
[architecture guide](docs/architecture.md) for the complete build and runtime
design.

The browser entry is fingerprinted and has an enforced 25 KiB Brotli budget.
CodeMirror loads only on pages with a playground; generated JavaScript and CSS
also ship with deterministic Brotli and gzip variants.

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Node.js 22 or newer](https://nodejs.org/)
- Git with submodule support
- Docker, only for the authoritative Linux isolation test

## Run locally

Clone the repository with its pinned SharpTS source:

```bash
git clone --recurse-submodules https://github.com/nickna/sharpts-www.git
cd sharpts-www
```

Then build the self-hosted bundle and launch the Aspire development host:

```powershell
./scripts/run.ps1
```

On Linux or macOS:

```bash
./scripts/run.sh
```

Aspire prints the local `sharpts-www` endpoint. The scripts rebuild the SharpTS
server, generated site, browser bundle, and worker before starting it, so source
changes are never masked by stale compiled output.

## Verify changes

Run the fast, cross-platform contributor gate:

```bash
npm run verify
```

Build and exercise the compiled application with:

```bash
npm run build:self-host -- --configuration Debug
npm run test:generated
npm run test:e2e
dotnet build src/SharpTS.Www.AppHost/SharpTS.Www.AppHost.csproj -c Debug
npm run test:apphost-manifest
```

The PowerShell and Bash build scripts are thin wrappers over the same Node
orchestrator. The full Linux worker-isolation, compression, and shutdown suite
runs with Docker:

```powershell
npm run test:isolation
```

See the [configuration reference](docs/configuration.md) for every setting. To
accept an intentional generated-output change after review, run
`npm run snapshot:update` and commit the updated snapshot.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/SharpTS.Www.SelfHost` | SharpTS-compiled server, supervisor, generator, localization, and browser source |
| `src/SharpTS.Www.Shared` | Execution contracts shared by browser, host, and worker |
| `src/SharpTS.Www.Worker` | Single-request process that executes playground code |
| `src/SharpTS.Www.AppHost` | Development-only .NET Aspire orchestration |
| `lib/SharpTS` | Pinned SharpTS git submodule used to build the site |
| `scripts` | Reproducible build, verification, run, and container workflows |
| `tests/browser` | Fast DOM-level tests for browser behavior and API contracts |
| `tests/unit` | Server policy, queue, configuration, and generator tests |
| `tests/e2e` | Browser tests against the compiled SharpTS host |

Generated output belongs under `artifacts/` and is not committed.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before making
changes, particularly if you touch the playground supervisor, worker isolation,
or localization resources.

Security reports follow [SECURITY.md](SECURITY.md); support and conduct
expectations are in [SUPPORT.md](SUPPORT.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

This website is available under the [MIT License](LICENSE), matching SharpTS.
