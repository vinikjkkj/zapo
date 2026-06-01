# Contributing to `zapo`

Thanks for your interest. This document is the contributor handbook –
project philosophy, repo layout, dev workflow, CI, release flow, and the
rules that apply to PRs. End-user documentation lives in
[`README.md`](README.md) and at [zapo.to](https://zapo.to/) (source:
[`vinikjkkj/zapo-docs`](https://github.com/vinikjkkj/zapo-docs)).

By contributing you also agree to the
[Code of Conduct](CODE_OF_CONDUCT.md) – in particular the
**AI-Assisted Contributions** section, which covers disclosure, human
ownership of AI output, the verification rule against bundle-hallucination,
and the ban on hidden prompt-injection payloads.

For deep protocol-level guidance (coordinator patterns, store contracts,
performance rules, anti-patterns), see [`AGENTS.md`](AGENTS.md). This file
covers the higher-level workflow.

## Table of Contents

- [What Makes This Project Different](#what-makes-this-project-different)
- [Core Principles](#core-principles)
- [Setup](#setup)
- [Architecture at a Glance](#architecture-at-a-glance)
- [Useful Scripts](#useful-scripts)
- [Continuous Integration](#continuous-integration)
- [Versioning and Releases](#versioning-and-releases)
- [GitHub Release Notes](#github-release-notes)
- [Protobuf Generation](#protobuf-generation)
- [Documentation Site](#documentation-site)
- [Contribution Rules](#contribution-rules)

## What Makes This Project Different

`zapo` is an independent runtime implementation (not a wrapper/fork of an
existing WhatsApp library).

- No wrappers around third-party WhatsApp SDKs
- No forks of existing WhatsApp client libraries
- No copied protocol abstractions from community libraries
- The entire [`spec/`](spec/) folder (protobuf, MEX schema, app-state
  schemas) is vendored from
  [`vinikjkkj/wa-spec`](https://github.com/vinikjkkj/wa-spec) and compiled
  locally for runtime/types

The protocol source of truth is the deobfuscated WhatsApp Web. The target
is behavior parity with WhatsApp Web, while improving internal performance
and memory efficiency.

## Core Principles

- `index-first`: validate protocol behavior against WhatsApp Web before
  implementing anything
- `performance-first`: optimize for low CPU, low RAM, low allocations, and
  zero-copy in hot paths
- `async-first`: I/O and network operations are async. Crypto follows the
  same rule **only where it pays off** - X25519/Ed25519 (curves) and
  `pbkdf2` stay async because they're genuinely heavy and benefit from
  Node's libuv thread pool; hashes, AES, HMAC, and HKDF were measured to
  be faster sync (no thread-pool hop, no microtask cost) and converted.

## Setup

Requirements:

- Node.js `>= 20.9.0`
- npm

Install + run the real-flow example (pairs against the real WhatsApp Web):

```bash
git clone https://github.com/vinikjkkj/zapo
cd zapo
npm install
npm run example
```

Scan the QR code emitted via `auth_qr`, then send `ping` to the connected
session - the example replies with `pong`. Auth state is persisted in
`.auth/state.sqlite`.

## Architecture at a Glance

### Patterns

- Coordinator-first feature design in `src/client/coordinators/`
- Pure node builders in `src/transport/node/builders/` for reusable
  protocol stanzas
- Incoming parsers/normalizers in `src/client/events/`, with coordinators
  handling orchestration only
- Typed store contracts in `src/store/contracts/`; persistent + cache
  providers live under `@zapo-js/store-*` packages
- Protocol constants in `src/protocol/` using `Object.freeze({...} as const)`

### Engineering conventions

- `Uint8Array` everywhere for binary data (`Buffer` is avoided)
- Zero-copy (`subarray`, byte views) in critical paths
- Bounded in-memory structures to prevent unbounded growth
- Path aliases (`@client`, `@crypto`, `@store`, etc.), no relative `../`
  imports across modules
- Named exports only, no default exports
- No enums (`Object.freeze` + `as const` instead)

See [`AGENTS.md`](AGENTS.md) for the full architecture spec, including
coordinator responsibilities, store contracts, the performance rules
catalog, and the review anti-patterns list.

## Useful Scripts

- `npm run build` - build CJS, ESM, and types
- `npm run test` - run unit tests (non-flow)
- `npm run test:flow` - run real-flow tests
- `npm run test:coverage` - run coverage report
- `npm run typecheck` - type-check core
- `npm run typecheck:all` - core + examples + bench + packages (run before
  opening a PR)
- `npm run lint` - lint source files
- `npm run format` - format codebase
- `npm run proto:generate` - regenerate protobuf runtime/types from
  `spec/proto/WAProto.proto`
- `npm run changeset` - create a versioning entry (`patch` / `minor` /
  `major`)
- `npm run changeset:status` - show pending versioning entries
- `npm run version:packages` - apply pending versions and update
  `CHANGELOG.md`
- `npm run release:publish` - build and publish to npm with Changesets

## Continuous Integration

Every push to `master` and every PR run
[`ci.yml`](.github/workflows/ci.yml), which fans out into:

- `lint`, `format`, `typecheck` over core
- `build-core` (CJS + ESM + types)
- `typecheck-packages` across every `@zapo-js/*` workspace
- per-provider test jobs: `test-core`, `test-fake-server`,
  `test-media-utils`, `test-sqlite`, `test-mcp-server`, `test-mysql`,
  `test-postgres`, `test-redis`, `test-mongo`
- a final `all-checks` job that gates merges - branch protection only
  needs to require this single job

Two PR automations also run on every pull request:

- [`pr-validate-title.yml`](.github/workflows/pr-validate-title.yml)
  enforces a conventional-commit PR title (`feat:`, `fix:`, `chore:`,
  ...) via
  [`amannn/action-semantic-pull-request`](https://github.com/amannn/action-semantic-pull-request).
  Required because release notes group PRs by that prefix.
- [`pr-auto-label.yml`](.github/workflows/pr-auto-label.yml) attaches the
  matching `type:<prefix>` label so the release-notes workflow can
  categorize.

## Versioning and Releases

Versioning is managed with
[Changesets](https://github.com/changesets/changesets). From `1.0.0` the
public API is stable - breaking changes ship only in a major bump.

```bash
npm run changeset
npm run changeset:status
npm run version:packages
npm run release:publish
```

Notes:

- Changesets are stored in `.changeset/*.md`
- Multiple changesets are merged automatically into the next release
- SemVer is manual and intentional: `patch`, `minor`, `major`

## GitHub Release Notes

Release notes are generated automatically (grouped by conventional-commit
type, with contributor list) when a version tag is pushed.

- Workflow:
  [`.github/workflows/github-release.yml`](.github/workflows/github-release.yml)
- Categories config: [`.github/release.yml`](.github/release.yml)

Trigger example:

```bash
git tag v1.0.0
git push origin v1.0.0
```

If the tag contains `-` (example: `v1.0.0-rc.0`), the release is marked as
prerelease.

## Protobuf Generation

The entire [`spec/`](spec/) folder - `WAProto.proto`, the MEX GraphQL
schema, and the app-state schema descriptors - is vendored from
[`vinikjkkj/wa-spec`](https://github.com/vinikjkkj/wa-spec). Update that
upstream first when the protocol changes, then regenerate locally.

`npm run proto:generate` runs `scripts/generate-proto.cjs`, which:

- Ensures proto tooling dependencies are installed in `spec/proto/`
- Generates and minifies `spec/proto/index.js`
- Regenerates compact typings at `spec/proto/index.d.ts`

## Documentation Site

End-user guides and the API reference at [zapo.to](https://zapo.to/) are
built from [`vinikjkkj/zapo-docs`](https://github.com/vinikjkkj/zapo-docs).
Fixes to guides, examples, or wording on the site go there. PRs in this
repo cover code, JSDoc, READMEs, and `AGENTS.md`.

## Contribution Rules

Before opening a PR:

- **Validate behavior against WhatsApp Web** (and `wa-mob` for mobile-only
  flows) before writing code. Don't invent tags/attrs/namespaces. The
  deobfuscated bundles aren't vendored - see
  [`AGENTS.md` §1.1](AGENTS.md#source-of-truth-wa-web-and-wa-mob) for how
  to obtain them locally.
- Keep performance and memory constraints in mind - the rules in
  [`AGENTS.md`](AGENTS.md) §7 (Uint8Array-only, zero-copy in hot paths,
  bounded structures, scratch buffer reuse) are not suggestions.
- Keep node building/parsing aligned with project patterns
  (`@transport/node/builders/*` + pure parsers in `@client/events/*`).
- Avoid API changes that diverge from observed WhatsApp Web behavior.
- Test real flows when touching auth, transport, app state, retry, or
  signal paths (`npm run test:flow`).
- Run `npm run typecheck:all`, `npm run lint`, `npm run format:check`,
  `npm run test`, and `npm run test:flow` locally before pushing.
- Add a changeset (`npm run changeset`) when your change affects public
  API or behavior.

PR title must follow conventional commits (`feat:`, `fix:`, `chore:`,
`perf:`, `refactor:`, `docs:`, `test:`, `build:`, `ci:`, `style:`,
`deps:`, `revert:`) - CI enforces this and uses it for auto-labeling and
release-notes grouping.
