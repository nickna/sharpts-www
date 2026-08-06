# Open-source readiness and maintainability plan

This plan turns the pre-publication repository review into an implementation
roadmap. The goal is to make the website an unusually clear, trustworthy, and
maintainable demonstration of SharpTS itself.

## Status

Completed on 2026-08-05. All repository changes and automated validation in
this plan are complete. The GitHub-hosted controls in
[repository settings](../repository-settings.md)—such as branch protection,
private vulnerability reporting, and required checks—must be enabled by a
repository administrator when the repository is made public.

## Principles

- Keep the production server, generator, and worker written in SharpTS-compatible
  TypeScript.
- Preserve the worker process boundary and fail closed when a safety mechanism is
  unavailable.
- Prefer small, typed modules with injected edge dependencies over process-global
  state.
- Make public product claims executable wherever practical.
- Keep the ordinary contributor workflow fast; reserve the container isolation
  suite for changes that cross the operating-system boundary.

## Phase 1: Execution boundary and application structure

- [x] Add a typed, validated application configuration module and document every
  `SHARPTS_WWW_*` setting.
- [x] Replace the array/object rate limiter with a bounded `Map`-based component.
- [x] Add an explicit maximum execution queue length and test admission,
  cancellation, timeout, and shutdown behavior.
- [x] Restrict trusted proxy headers to configured proxy peers.
- [x] Remove the production `/api/echo` test endpoint.
- [x] Keep the HTTP handler and supervisor as composition roots while extracting
  configuration, security policies, rate limiting, and queue state into focused,
  independently testable modules.
- [x] Replace broad `any` usage at HTTP/process boundaries with narrow local types.
- [x] Define browser, host, and worker execution contracts and validators in one
  shared module, with an explicit worker wire-format translation.

Acceptance criteria:

- Fast unit tests exercise rate limiting, queue bounds, cancellation, origin and
  path validation, worker response validation, and configuration failures.
- The existing browser, end-to-end, and Linux container isolation behavior remains
  intact.
- The README no longer claims a bounded queue unless the queue length is bounded.

## Phase 2: Static generator structure and safe rendering

- [x] Split `generate-site.ts` into configuration, localization, HTML primitives,
  components, pages, validation, and build orchestration modules.
- [x] Introduce an explicit trusted-rich-text representation with an allowlist for
  localized inline markup.
- [x] Remove magic-index rendering behavior and model feature/use-case content as
  typed data.
- [x] Keep deterministic output and localization key parity checks.
- [x] Add focused tests for resource parsing, escaping, trusted rich text, routing,
  and representative page rendering.

Acceptance criteria:

- No single generator module mixes page markup, filesystem orchestration, resource
  parsing, and validation.
- Localized content is escaped by default; the permitted rich-text surface is
  narrow and tested.
- Generated output continues to match reviewed snapshots.

## Phase 3: Build reproducibility and contributor workflow

- [x] Establish one source of truth for the SharpTS revision and build metadata.
- [x] Verify that the Docker build revision matches the Git submodule revision.
- [x] Replace duplicated PowerShell, Bash, and Docker build logic with one
  cross-platform orchestrator and thin platform entry points where practical.
- [x] Clarify whether Docker always fetches the pinned source or consumes the
  checked-out submodule.
- [x] Add a single ordinary `verify` command and a separate full isolation command.
- [x] Add a documented, safe generated-site snapshot update command.
- [x] Add linting and formatting checks without imposing formatting rules that the
  SharpTS compiler cannot consume.

Acceptance criteria:

- Local and CI builds use the same ordered build steps and success checks.
- A stale Docker SharpTS revision fails before an image is built.
- A new contributor can discover setup, verification, and snapshot workflows from
  the README and contributing guide.

## Phase 4: Browser performance

- [x] Split the browser entry into a small core controller and lazy playground
  code.
- [x] Load CodeMirror only on pages containing the playground and defer it until it
  is needed without breaking the textarea fallback.
- [x] Isolate syntax-highlighting code where it materially reduces the initial
  bundle.
- [x] Fingerprint generated browser assets and serve immutable assets with the
  appropriate caching policy.
- [x] Add raw and compressed browser bundle budgets to CI.
- [x] Document the expected compression layer or serve precompressed assets.

Acceptance criteria:

- The guide route does not download CodeMirror.
- The playground remains usable before and after enhancement.
- CI reports and enforces reviewed bundle-size limits.

## Phase 5: Executable showcase claims

- [x] Move displayed examples and expected output into typed shared showcase data.
- [x] Execute every displayed example during verification.
- [x] Execute every playground preset in interpreter and compile modes where the
  example supports both.
- [x] Establish a machine-readable source or explicit verification process for the
  feature comparison matrix.
- [x] Fail CI when the pinned SharpTS revision and website claims diverge.

Acceptance criteria:

- Displayed output is generated from or checked against actual SharpTS execution.
- Feature claims have a named, reviewable source of truth.

## Phase 6: Public project operations

- [x] Add `SECURITY.md` with private reporting guidance and the playground threat
  model.
- [x] Add a code of conduct, pull-request template, and focused issue forms.
- [x] Add automated dependency updates for npm, NuGet, GitHub Actions, and container
  images.
- [x] Add dependency and secret scanning appropriate for a public repository.
- [x] Add accessibility checks for representative pages.
- [x] Review action and container pinning policy and document intentional choices.

Acceptance criteria:

- GitHub exposes clear contribution, support, conduct, and security paths.
- CI covers formatting, types, unit behavior, generated output, accessibility,
  end-to-end behavior, dependency safety, and the Linux isolation boundary.

## Final verification

- [x] `npm run verify`
- [x] Generated-site snapshot verification
- [x] Playwright end-to-end suite against the compiled SharpTS host
- [x] Aspire manifest verification
- [x] Linux self-host container and isolation suite
- [x] Clean working tree review with no generated artifacts or credentials tracked
- [x] Final documentation and public-repository settings review
