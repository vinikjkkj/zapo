<h1 align="center">zapo</h1>

<p align="center">
  <strong>High-performance TypeScript implementation of the WhatsApp Web protocol.</strong><br />
  Built for high-scalability workloads, multi-session operation, and full user configurability.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/zapo-js"><img alt="npm version" src="https://img.shields.io/npm/v/zapo-js?color=CB3837" /></a>
  <a href="https://www.npmjs.com/package/zapo-js"><img alt="npm package size" src="https://img.shields.io/npm/unpacked-size/zapo-js?label=package%20size&color=2F855A" /></a>
  <a href="https://github.com/sponsors/vinikjkkj"><img alt="sponsor" src="https://img.shields.io/badge/sponsor-vinikjkkj-EA4AAA?logo=githubsponsors&logoColor=white" /></a>
  <img alt="node version" src="https://img.shields.io/badge/node-%3E%3D20.9.0-339933" />
  <img alt="language" src="https://img.shields.io/badge/language-TypeScript-3178C6" />
  <img alt="focus" src="https://img.shields.io/badge/focus-high--scale%20%2B%20multi--session-0A7EA4" />
</p>

## Table of Contents

- [Stability Notice](#stability-notice)
- [What Makes This Project Different](#what-makes-this-project-different)
- [Core Principles](#core-principles)
- [Architecture at a Glance](#architecture-at-a-glance)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Minimal Usage](#minimal-usage)
- [Useful Scripts](#useful-scripts)
- [Versioning and Releases](#versioning-and-releases)
- [GitHub Release Notes](#github-release-notes)
- [Protobuf Generation](#protobuf-generation)
- [Support the Project](#support-the-project)
- [Contribution Notes](#contribution-notes)
- [Disclaimer](#disclaimer)

## Stability Notice

> Frequent breaking changes are expected until the first major release.
> If you run `zapo` in long-lived environments, pin exact versions and validate upgrades carefully.

## What Makes This Project Different

`zapo` is an independent runtime implementation (not a wrapper/fork of an existing WhatsApp library).

- No wrappers around third-party WhatsApp SDKs
- No forks of existing WhatsApp client libraries
- No copied protocol abstractions from community libraries
- `WAProto.proto` is sourced from `wppconnect-team/wa-proto` and compiled locally for runtime/types

The protocol source of truth is the deobfuscated WhatsApp Web.
The target is behavior parity with WhatsApp Web, while improving internal performance and memory efficiency.

## Core Principles

These principles drive implementation decisions:

- `index-first`: validate protocol behavior against WhatsApp Web before implementing anything
- `performance-first`: optimize for low CPU, low RAM, low allocations, and zero-copy in hot paths
- `async-first`: I/O, network, and crypto operations are async

## Architecture at a Glance

### Patterns

- Coordinator-first feature design in `src/client/coordinators/`
- Pure node builders in `src/transport/node/builders/` for reusable protocol stanzas
- Incoming parsers/normalizers in `src/client/events/`, with coordinators handling orchestration only
- Typed store contracts in `src/store/contracts/` with `memory` and `sqlite` providers
- Protocol constants in `src/protocol/` using `Object.freeze({...} as const)`

### Engineering conventions

- `Uint8Array` everywhere for binary data (`Buffer` is avoided)
- Zero-copy (`subarray`, byte views) in critical paths
- Bounded in-memory structures to prevent unbounded growth
- Path aliases (`@client`, `@crypto`, `@store`, etc.), no relative `../` imports
- Named exports only, no default exports
- No enums (`Object.freeze` + `as const` instead)

## Requirements

- Node.js `>= 20.9.0`
- npm

Runtime dependencies:

- Mandatory: none

Optional peer dependencies:

- `better-sqlite3` for SQLite-backed stores
- `pino` and `pino-pretty` for structured logging

## Quick Start

1. Install dependencies.

```bash
npm install
```

2. Run the real-flow example.

```bash
npm run example
```

3. Scan the QR code emitted by `auth_qr`.
4. Send `ping` to the connected session, the example replies with `pong`.

Auth state is persisted in `.auth/state.sqlite`.

## Minimal Usage

```ts
import { createPinoLogger, createStore, WaClient } from 'zapo-js'
import { createSqliteStore } from '@zapo-js/store-sqlite'

const logger = await createPinoLogger({
    level: 'info',
    pretty: true
})

const store = createStore({
    backends: {
        sqlite: createSqliteStore({
            path: '.auth/state.sqlite',
            driver: 'auto'
        })
    },
    providers: {
        auth: 'sqlite',
        signal: 'sqlite',
        preKey: 'sqlite',
        session: 'sqlite',
        identity: 'sqlite',
        senderKey: 'sqlite',
        appState: 'sqlite',
        messages: 'sqlite',
        threads: 'sqlite',
        contacts: 'sqlite'
    }
})

const client = new WaClient(
    {
        store,
        sessionId: 'default',
        connectTimeoutMs: 15_000,
        nodeQueryTimeoutMs: 30_000,
        history: {
            enabled: true,
            requireFullSync: true
        }
    },
    logger
)

client.on('auth_qr', ({ qr, ttlMs }) => {
    console.log('qr', { qr, ttlMs })
})

client.on('message', (event) => {
    console.log('incoming', {
        chatJid: event.chatJid,
        senderJid: event.senderJid
    })
})

await client.connect()
```

## Useful Scripts

- `npm run build` - build CJS, ESM, and types
- `npm run test` - run unit tests (non-flow)
- `npm run test:flow` - run real-flow tests
- `npm run test:coverage` - run coverage report
- `npm run typecheck` - type-check project
- `npm run lint` - lint source files
- `npm run format` - format codebase
- `npm run proto:generate` - regenerate protobuf runtime/types from `proto/WAProto.proto`
- `npm run changeset` - create a versioning entry (`patch`/`minor`/`major`)
- `npm run changeset:status` - show pending versioning entries
- `npm run version:packages` - apply pending versions and update `CHANGELOG.md`
- `npm run release:publish` - build and publish to npm with Changesets

## Versioning and Releases

Versioning is managed with [Changesets](https://github.com/changesets/changesets).

Release flow:

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

Release notes are generated automatically (including grouped changes and contributors) when a version tag is pushed.

- Workflow: `.github/workflows/github-release.yml`
- Categories config: `.github/release.yml`

Trigger example:

```bash
git tag v0.1.1
git push origin v0.1.1
```

If the tag contains `-` (example: `v0.2.0-rc.1`), the release is marked as prerelease.

## Protobuf Generation

`WAProto.proto` source: https://github.com/wppconnect-team/wa-proto

`npm run proto:generate` runs `scripts/generate-proto.cjs`, which:

- Ensures proto tooling dependencies are installed in `proto/`
- Generates and minifies `proto/index.js`
- Regenerates compact typings at `proto/index.d.ts`

## Support the Project

If `zapo` is useful in your production or study setup, you can support ongoing development on GitHub Sponsors:

- https://github.com/sponsors/vinikjkkj

## Contribution Notes

Before opening a PR:

- Validate behavior against WhatsApp Web
- Keep performance and memory constraints in mind
- Keep node building/parsing aligned with project patterns
- Avoid API changes that diverge from observed WhatsApp Web behavior
- Test real flows when touching auth, transport, app state, retry, or signal paths

## Disclaimer

This project is an independent implementation for engineering and interoperability research.
It is not affiliated with or endorsed by WhatsApp.
