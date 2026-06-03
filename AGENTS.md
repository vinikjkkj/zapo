# AGENTS.md – Development Guide for `zapo`

> Living guide for implementing features in this repository. Keep this file aligned with the real codebase.

---

## 1. Non-Negotiable Principles

| Principle            | Meaning                                                                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index-first`        | Validate protocol behavior against `wa-web/` (and `wa-mob/` for mobile-specific flows) before implementation. Do not invent tags, attrs, namespaces, or flows.                                                                                                                                                |
| `performance-first`  | Optimize for low CPU, low RAM, and low allocations. Use zero-copy patterns in hot paths.                                                                                                                                                                                                                      |
| `async-first`        | I/O and network paths must be async. Crypto follows the rule **only where benchmarks justify it**: X25519/Ed25519 and `pbkdf2` stay async (libuv thread pool wins); hashes, AES, HMAC, HKDF are sync (the thread-pool hop costs more than the op). Public APIs should return `Promise<T>` when work is async. |
| `no-overengineering` | Avoid abstraction layers without concrete gains. Keep code direct and easy to maintain.                                                                                                                                                                                                                       |
| `real-flow-only`     | Validate protocol features with real CLI/flow tests, not mock-only behavior.                                                                                                                                                                                                                                  |

### Source of Truth: `wa-web/` and `wa-mob/`

`wa-web/` (deobfuscated WhatsApp Web bundle) is the primary protocol source of truth. The project goal is behavioral parity with WhatsApp Web.

`wa-mob/` (deobfuscated WhatsApp Mobile bundle) is the supplementary source for mobile-specific flows (e.g. mobile-flow registration, account takeover).

> **Not vendored.** Both directories are in `.gitignore` and **not** in
> the repository - they're third-party bundles owned by Meta and can't be
> redistributed. Contributors must produce and place them at
> `<repo-root>/wa-web/` and `<repo-root>/wa-mob/` themselves; how to do
> that is out of scope here.
>
> Without these, you can still consume the protocol decisions already
> encoded in `src/`, but every new protocol-touching change MUST be
> validated against the bundles before it lands.

Parity is mandatory for:

- stanza tags/attrs/namespaces
- auth/pairing/sync flow sequencing
- protobuf fields and serialization
- crypto steps (ratchet, key derivation, MAC)
- retry/ack/receipt behavior
- protocol limits and validations

Internal implementation may differ for performance and memory optimization, as long as externally observable behavior remains equivalent.

---

## 2. Current Project Layout

The repository is a **monorepo** using npm workspaces + Turborepo. The core library lives at the root; optional packages live in `packages/`.

```text
zapo/
├── src/                # Core library source (zapo-js)
│   ├── index.ts        # public API barrel
│   ├── proto.ts        # bridge to ../spec/proto (only ../ import allowed)
│   ├── appstate-spec.ts # bridge to ../spec/appstate (app-state schema descriptors)
│   ├── mex.ts          # bridge to ../spec/mex (MEX GraphQL operation types)
│   ├── __tests__/      # structural test coverage checks
│   ├── appstate/       # app-state sync (crypto/, sync/, parsers/)
│   ├── auth/           # auth client + pairing flow
│   ├── client/         # WaClient + factory + coordinators + events
│   ├── crypto/         # core crypto facade + curves + math
│   ├── infra/          # logging and perf primitives
│   ├── media/          # media transfer (transfer/, crypto/, sticker/)
│   ├── message/        # message primitives (primitives/, crypto/, encode/, kinds/, addons/)
│   ├── protocol/       # protocol constants and jid helpers
│   ├── retry/          # retry state and replay helpers
│   ├── signal/         # signal protocol (session/, group/, api/, attestation/, registration/)
│   ├── store/          # store contracts + in-tree memory provider
│   ├── transport/      # websocket/noise/binary/node/stream/keepalive
│   └── util/           # shared pure helpers
├── packages/           # Optional packages (npm scope: @zapo-js)
│   └── <name>/         # e.g. store-mysql, store-sqlite, store-postgres, store-redis,
│       │               # store-mongo, media-utils, fake-server, mcp-server
│       ├── src/
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsconfig.build.cjs.json
│       └── tsconfig.build.esm.json
├── spec/               # Vendored protocol spec from vinikjkkj/wa-spec
│   ├── proto/          # WAProto.proto + compiled output (imported by src/proto.ts)
│   ├── appstate/       # app-state schema descriptors (imported by src/appstate-spec.ts)
│   ├── mex/            # MEX GraphQL operation types (imported by src/mex.ts)
│   └── version/        # current WA Web version json (imported by src/version-spec.ts)
├── test/               # media test fixtures (audio/video/image, runtime-only, gitignored)
├── turbo.json          # Turborepo task orchestration
├── tsconfig.packages.json # Shared TS config for optional packages
└── ...
```

Other important directories:

- `bench/` timed benchmark suites
- `scripts/` build/release/test helpers
- `examples/` runnable example scripts (can import `zapo-js` and `@zapo-js/*` by name)
- `.github/workflows/ci.yml` lint + format + typecheck + build-core + typecheck-packages + per-provider tests (core, fake-server, media-utils, sqlite, mcp-server, mysql, postgres, redis, mongo) gated by an `all-checks` job
- `.github/workflows/github-release.yml` auto-generates release notes when a `v*` tag is pushed (categories in `.github/release.yml`)
- `.github/workflows/release.yml` publishes to npm on a `v*` tag via trusted publishing (OIDC, no `NPM_TOKEN`): core (`zapo-js`) through a guarded `npm publish`, add-ons (`@zapo-js/*`) through `changeset publish`
- `.github/workflows/pr-auto-label.yml` labels PRs from conventional-commit prefixes in the title
- `.github/workflows/pr-validate-title.yml` enforces a conventional-commit PR title (`amannn/action-semantic-pull-request`)
- `.changeset/` release management config (Changesets)

### Monorepo conventions

- **Core** (`zapo-js`): published from the root. Build with `npm run build`.
- **Optional packages** (`@zapo-js/*`): live in `packages/<name>/`. Build all with `npx turbo run build`.
- Optional packages declare `zapo-js` as a `peerDependency` – the end user installs core + the modules they want.
- Each optional package extends `tsconfig.packages.json` (+ `tsconfig.build.paths.json`) and publishes with `"publishConfig": { "access": "public" }`.
- Dual CJS/ESM build is mandatory for both core and optional packages: each package has `tsconfig.build.cjs.json` (emits to `dist/` + `.d.ts`) and `tsconfig.build.esm.json` (emits JS-only to `dist/esm/`). The `build` script chains both compilers and then runs `scripts/finalize-esm-build.cjs` to drop a `dist/esm/package.json` with `{ "type": "module" }` and rewrite relative import specifiers with `.js` extensions. The `exports` map must expose `types` / `require` / `import` / `default` conditions. The shared finalize script accepts `--root <path>` (default `cwd`) and `--proto-bridge` (core only, to emit the ESM proto re-export).
- New package template: copy an existing `packages/<name>/` folder and adjust name/deps.

---

## 3. Tooling and Commands

Core commands:

- `npm run build` – CJS + ESM + types build (core only)
- `npx turbo run build` – build core + all optional packages
- `npm run lint` – ESLint
- `npm run format:check` – Prettier verification
- `npm run typecheck` – TS check on core only (`--noEmit`)
- `npm run typecheck:packages` – TS check across optional packages (via turbo, dev paths – no build required)
- `npm run typecheck:all` – both of the above sequentially (use before opening a PR)
- `npm run test:structure` – enforces `__tests__` presence for source dirs
- `npm run test` – unit tests (excludes `[flow]`)
- `npm run test:flow` – real flow tests (`*.flow.test.ts`)
- `npm run bench:all` – benchmark suites
- `npm run bench:comment` – build PR benchmark markdown summary

---

## 4. Import and Alias Rules

### Path aliases (`tsconfig.json`)

Use aliases for cross-domain imports:

- `@appstate`, `@auth`, `@client`, `@crypto`, `@media`, `@message`, `@protocol`, `@retry`, `@signal`, `@store`, `@transport`
- deep imports are available via `@module/*`
- `@proto` maps to `src/proto.ts` (re-exports `../spec/proto`)
- `@appstate-spec` maps to `src/appstate-spec.ts` (re-exports `../spec/appstate` + adds typed helpers)
- `@mex` maps to `src/mex.ts` (re-exports `../spec/mex` operation types)
- `@version-spec` maps to `src/version-spec.ts` (re-exports `../spec/version` – `WA_VERSION` is the WA Web version string used by the noise payload builders)
- `@util/*` and `@infra/*` are deep-import only (no barrel alias)

### Sub-folder barrels

Sub-folders inside a module are **deep-import by default** – do not add an `index.ts` barrel just because a folder has multiple files. A sub-folder barrel is only justified when the folder represents a cohesive family of helpers that consumers commonly import together. Current sub-folder barrels:

- `@crypto/core` – crypto facade (hashes, AES, HKDF, random, key encoding)
- `@transport/binary` – binary stanza codec (tokens + encoder + decoder)

Everywhere else, import directly from the file: `@transport/node/builders/device`, `@client/coordinators/WaPrivacyCoordinator`, etc.

### Barrel vs deep import

Prefer deep imports (`@module/file`) for internal cross-module use – they make dependencies explicit and surface refactoring impact. Use a bare barrel import (`@module`, no path) only in two cases:

1. **Public API re-export** in `src/index.ts` – the barrel is the published surface of the module.
2. **Unified facades** that intentionally hide internal layout – currently `@crypto` (primitives + curves) and `@proto` (single generated file).

Coordinators, types, helpers, and other internal symbols should always be imported deep (`@client/coordinators/WaPrivacyCoordinator`, `@store/contracts/auth.store`), never via the module barrel.

### Relative import exceptions

Relative imports are allowed only for explicit local bridging patterns already used in the codebase:

- same-folder internal helpers (example: `src/util/coercion.ts` importing `./bytes`)
- `src/proto.ts`, `src/appstate-spec.ts`, `src/mex.ts`, and
  `src/version-spec.ts` bridging to the vendored `../spec/` folder (the
  only `../` imports allowed in `src/`)

Do not add new cross-module `../` import chains.

### Import ordering

Use this order:

1. type-only imports
2. value imports
3. mixed import blocks only when needed

```ts
import type { BinaryNode } from '@transport/types'
import type { Logger } from '@infra/log/types'

import { WA_NODE_TAGS } from '@protocol/constants'
import { toError } from '@util/primitives'
```

---

## 5. Code Conventions

### 5.1 Formatting and language style

| Rule                             | Convention                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Semicolons                       | Omit semicolons                                                                                                                                                                                                                                                                                |
| Indentation                      | 4 spaces                                                                                                                                                                                                                                                                                       |
| Strings                          | Single quotes                                                                                                                                                                                                                                                                                  |
| Trailing commas                  | None                                                                                                                                                                                                                                                                                           |
| Print width                      | 100, enforced by Prettier (`npm run format:check`). Markdown tables, fenced code blocks, and long inline links are exempt – Prettier does not wrap them. Do not hand-wrap to "satisfy" external reviewers if `format:check` passes.                                                            |
| Exports                          | Named exports only (no default export)                                                                                                                                                                                                                                                         |
| Enums                            | Avoid TS `enum`; prefer `Object.freeze({...} as const)`                                                                                                                                                                                                                                        |
| Binary type                      | `Uint8Array` only (no `Buffer`)                                                                                                                                                                                                                                                                |
| Em-dash (U+2014, the wider dash) | **Forbidden** in JSDoc, source comments, log messages, error strings, and Markdown. Use en-dash (`–`, U+2013), `-` (space-hyphen-space), a colon, or split into two sentences. Em-dash is hard to type on most keyboards and reads as AI-generated noise; en-dash is the preferred substitute. |

### 5.2 Type design

- Prefer `readonly` for fields/options/array types.
- Use `T | null` for absent return values.
- Use optional params (`?`) for optional inputs.
- Use numeric separators for readability (`15_000`, `8_192`).

### 5.3 Dynamic import policy

Dynamic imports are reserved for optional runtime dependencies already implemented in the project:

- `src/infra/log/PinoLogger.ts` (`pino`, `pino-pretty`)
- `src/store/providers/sqlite/connection.ts` (`better-sqlite3`, `bun:sqlite`)
- `src/transport/node/mex/argo-decoder.ts` (`argo-codec`)

Avoid introducing dynamic imports outside this pattern.

### 5.4 Naming

| Category                        | Convention                        | Examples                                               |
| ------------------------------- | --------------------------------- | ------------------------------------------------------ |
| Runtime classes / orchestrators | Prefer `Wa*` prefix               | `WaClient`, `WaComms`, `WaIncomingNodeCoordinator`     |
| Domain algorithm classes        | Domain-specific names are allowed | `SignalProtocol`, `SenderKeyManager`                   |
| Constants                       | `WA_*` in SCREAMING_SNAKE         | `WA_DEFAULTS`, `WA_NODE_TAGS`                          |
| Functions                       | verb-first camelCase              | `buildIqNode`, `parseGroupNotificationEvents`          |
| Event names                     | snake_case                        | `connection_open`, `group_event`, `history_sync_chunk` |

### 5.5 File naming

| Type               | Pattern                                | Examples                                |
| ------------------ | -------------------------------------- | --------------------------------------- |
| Stateful class     | `Wa<Name>.ts` (preferred)              | `WaClient.ts`, `WaMessageClient.ts`     |
| Functional module  | semantic file name                     | `query.ts`, `incoming.ts`, `padding.ts` |
| Store contract     | `<domain>.store.ts`                    | `signal.store.ts`, `message.store.ts`   |
| Store provider     | `<domain>.store.ts` in provider folder | `providers/sqlite/signal.store.ts`      |
| Protocol constants | `<domain>.ts` in `src/protocol/`       | `message.ts`, `stream.ts`, `dirty.ts`   |

Avoid generic catch-all names. Domain-scoped utility files are acceptable when justified (for example existing `appstate/utils.ts`, `signal/registration/utils.ts`).

### 5.6 Error handling

- Normalize unknown errors with `toError()` from `@util/primitives`.
- Do not silently swallow exceptions.
- Include contextual metadata when logging errors.
- Custom errors should set `name` and stable `code` fields.

```ts
try {
    await action()
} catch (error) {
    logger.warn('action failed', { message: toError(error).message })
}
```

### 5.7 Logging

The `Logger` interface lives in `@infra/log/types` with 5 levels (trace,
debug, info, warn, error), a `(message, context?)` signature, and a
`child(bindings)` method that returns a derived logger with pre-bound
fields. Adapters: `ConsoleLogger` (zero-dep default) and `PinoLogger`
(optional pino-backed).

#### General rules

- Use structured logs: lowercase static message + context object. Never
  interpolate variables into the message string (`'failed to send'` +
  `{ kind }`, **not** `` `failed to send ${kind}` ``). String interpolation
  in the message breaks log-aggregator deduplication.
- Use `toError(e).message` in catches; never log the raw error or stack.
- Log IDs/tags/sizes/durations when relevant.
- Never log key material, secret values, or raw sensitive payload bytes.
  `keyId` rendered as hex (`bytesToHex(...)`) is public and safe.
- Avoid `console.log` in runtime source (`src/`), except explicit example
  or test contexts.

#### Level rubric

Apply these semantics consistently; mis-leveling makes `level: debug`
unusable in staging because hot paths drown the operator.

| Level | Meaning                                                         | Examples                                                                                              |
| ----- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| error | invariant violation / non-recoverable failure (rare)            | noise handshake failed, MAC validation failed, pending-frame buffer overflow, primary recipient drop  |
| warn  | abnormal but auto-handled (fallback / retry / degraded path)    | socket open failed (will retry), ack mismatch triggering refetch, fanout dropping secondary devices   |
| info  | lifecycle boundary, once per long-lived event                   | `wa client connected`, `pair-success credentials updated`, `noise session established`, prekey upload |
| debug | per-operation internals for active troubleshooting              | per-send envelope build, per-retry-request rejection, sync key request response                       |
| trace | per-frame / per-iteration / hot path; only with explicit filter | per-incoming-stanza ack/receipt, per-frame noise codec calls, filter-dropped stanzas                  |

Concrete rules that fall out of this:

- **Per-message / per-frame / per-send logs must never exceed `trace`.**
  In a high-volume account, anything at `debug` here will drown the log.
- **Auto-recovered fallback paths are `debug`, not `warn`.** Warn is for
  things the operator should actually see at default level.
- **`info` is for operator-visible lifecycle events**, not for narration of
  what a method is doing. `'X started'` / `'X finished'` pairs around
  routine syncs belong at `debug`.
- **Aggregate per-target failures in batch operations.** A per-device
  warn in fanout fires N times per group send. Collect into a single warn
  with `{ droppedCount, totalExpected, sample: jids.slice(0, 3) }` after
  the loop.

#### Use `child(bindings)` for repeated context

When a function emits 3+ logs that all carry the same field (`jid`, `id`,
`from`, `requester`, etc.), bind it once with `logger.child({ ... })` and
drop the field from every per-call context object. Bindings stack;
per-call context wins on key conflicts.

```ts
const requesterLogger = this.deps.logger.child({
    id: request.stanzaId,
    originalMsgId: request.originalMsgId,
    requester: requesterJid
})
requesterLogger.debug('retry request rejected: retry count exceeded', {
    remoteRetryCount: request.retryCount
})
```

Current adopters worth modeling after:
`signal/session/resolver.ts` (`{ jid }`),
`client/coordinators/WaRetryCoordinator.ts` (`{ id, originalMsgId, requester }`),
`appstate/sync/WaAppStateSyncClient.ts` (`{ id, from }`).

#### Optional packages: receive the logger via per-call `ctx`, never a callback or a mutable slot

Optional packages (`@zapo-js/media-utils`, future store/transport addons)
that need to emit warnings must NOT accept a logging callback in their
options, and must NOT keep a mutable logger slot the caller has to wire
up. Instead, accept the logger via a per-call context arg on each method
of the contract:

```ts
export interface WaSomeProcessorCallContext {
    readonly logger?: Logger
}

export interface WaSomeProcessor {
    readonly doSomething?: (input: Input, ctx?: WaSomeProcessorCallContext) => Promise<Result>
    // ...rest of the contract
}
```

The runtime fills `ctx.logger` with the relevant child logger (typically
`callerLogger.child({ scope: '@zapo-js/<name>' })`) on every call. This
keeps the package implementation **stateless**, so a single instance is
safe to share across multiple `WaClient` sessions - each invocation
lands its warnings in the right session log without any per-session
plumbing. Canonical example: `WaMediaProcessor` in
`src/media/processor.ts` + `packages/media-utils/src/index.ts`.

### 5.8 Sensitive types

Types containing private key material, secrets, or auth tokens must:

- Carry a `@sensitive` JSDoc tag listing the sensitive fields.
- Document that the consumer is responsible for encryption-at-rest and must not `JSON.stringify` or `console.log` instances.
- For long-lived runtime instances, consider implementing `[Symbol.for('nodejs.util.inspect.custom')]` to mask values in Node REPL/log output.

Current sensitive surface: `WaAuthCredentials` (re-exported via `src/index.ts`).

### 5.9 JSDoc maintenance

JSDoc on exported functions, methods, classes, options, and event maps
is part of the public contract. When you change a public signature, a
return shape, an option default, or observable behavior, treat the
surrounding documentation as code – stale JSDoc actively misleads users
and downstream agents.

- Update the JSDoc directly above the change: params, return type,
  `@throws`, `@example`, and any mobile-only / business-only / TOS /
  rate-limit markers attached to the symbol.
- After renaming a symbol or changing its signature, grep the whole repo
  for the old name. `@example` blocks routinely call **across modules**
  (e.g. `WaClient` examples invoke `client.message.send(...)`,
  `createStore` examples reference store domain keys, coordinator docs
  reference each other). Every callsite inside a JSDoc has to compile
  against the new API.
- `@example` blocks are not type-checked. They rot silently and only
  surface as a user copy-pasting a snippet that no longer compiles. A
  grep over the old name is the only safety net.
- If you remove a public export, also remove every JSDoc that referenced
  it by name. Re-exports under `src/<module>/index.ts` and subpath
  barrels count as public surface.

---

## 6. Architecture Patterns

### 6.1 Coordinator-first client design

Feature orchestration belongs in `src/client/coordinators/`.

Coordinator responsibilities:

| Responsibility                            | Place                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Build reusable protocol nodes             | `@transport/node/builders/*`                                                      |
| Parse incoming/outgoing protocol payloads | pure functions (`@client/events/*`, `@client/incoming.ts`, or local pure helpers) |
| Sequence query/send/parse/emit            | coordinator                                                                       |
| Define feature input/output types         | coordinator public types                                                          |

Guideline: if a coordinator becomes large/monolithic, split builders/parsers into focused modules.

### 6.2 Incoming node handling

`WaIncomingNodeCoordinator` dispatches incoming nodes by tag/subtype and supports dynamic registration:

```ts
const unregister = incomingNode.registerIncomingHandler({
    tag: WA_NODE_TAGS.NOTIFICATION,
    subtype: WA_NOTIFICATION_TYPES.GROUP,
    handler: async (node) => {
        // parse + emit
        return true
    }
})
```

Rules:

- handler signature: `(node) => Promise<boolean>`
- return `true` when the node was handled
- keep parsing logic pure and reusable
- emit strongly typed events from `WaClientEventMap`

### 6.3 Node builders and IQ helpers

Use builders for reusable or complex stanzas (`src/transport/node/builders/`).

Current builder domains include:

- `account-sync`, `group`, `media`, `message`, `pairing`, `prekeys`, `retry`, `usync`

Use `@transport/node/query` helpers:

- `buildIqNode()`
- `assertIqResult()`
- `queryWithContext()`

Builder vs inline rule:

- create a builder when used in multiple places or when nesting/logic is non-trivial
- inline simple one-off nodes that are local and easy to read

### 6.4 Store architecture

Stores are contract-first:

1. contract in `src/store/contracts/`
2. in-tree memory provider in `src/store/memory/` (bounded, TTL-aware)
3. external providers under `packages/store-*` (sqlite, redis, postgres,
   mysql, mongo) – each ships its own backend that plugs into the
   `backends` map passed to `createStore()`
4. wiring in `createStore()` (`src/store/createStore.ts`)

`createStore()` supports per-domain provider choices via a named backend
(`'memory'`, `'none'`, or any key registered in `backends`), custom cache
providers, TTLs, and memory limits.

Default providers (when no `providers` entry is set):

- `auth` – **required, no default** (throws if not registered)
- Signal-protocol domains (`signal`, `preKey`, `session`, `identity`,
  `senderKey`, `appState`, `privacyToken`) → `'memory'`
- mailbox domains (`messages`, `threads`, `contacts`) → `'none'`
- cache domains (`retry`, `groupMetadata`, `deviceList`, `messageSecret`)
  → `'memory'`

SQLite provider rules (live in [`@zapo-js/store-sqlite`](packages/store-sqlite)):

- subclasses `BaseSqliteStore` (exported from the package)
- use `await this.getConnection()`
- use `this.withTransaction(...)` for multi-step writes
- always scope queries by `session_id`
- migrations live in `packages/store-sqlite/src/migrations.ts`

Current SQLite migration domains: `auth`, `signal`, `senderKey`,
`appState`, `retry`, `mailbox`, `participants`, `deviceList`,
`privacyToken`, `messageSecret`.

### 6.5 Protocol constants

Keep protocol constants in `src/protocol/` with `Object.freeze({...} as const)`, then re-export through:

- `src/protocol/constants.ts`
- `src/protocol/index.ts`

---

## 7. Performance and Memory Rules

### 7.1 Uint8Array-only binary data

Mandatory:

- use `Uint8Array` everywhere
- do not introduce `Buffer` in runtime code
- use `toBytesView()` only at system boundaries where the input may not be a plain `Uint8Array`:
    - WebCrypto `subtle.*` results (`ArrayBuffer`)
    - Node.js crypto/zlib results (`Buffer`)
    - WebSocket incoming data (`ArrayBuffer | ArrayBufferView`)
    - public API params typed as `Uint8Array | ArrayBuffer | ArrayBufferView`
- do **not** use `toBytesView()` when the input is already a `Uint8Array` (protobuf-decoded fields, Signal key pairs, `BinaryNode.content` after `instanceof Uint8Array` check, config fields typed as `Uint8Array`)

### 7.2 Zero-copy in hot paths

Prefer views/subarrays over copies.

```ts
const payload = packet.subarray(4)
```

When output size is known, prefer pre-allocated arrays with exact length and indexed `for`
loops over callback-based array methods (`map`, `filter`, `reduce`) in hot paths.

### 7.3 Bounded structures

Any potentially unbounded in-memory structure must have limits.

- `setBoundedMapEntry(...)` for LRU-like bounded maps
- `new BoundedTaskQueue(maxQueueSize, maxConcurrency)` for bounded async queueing

### 7.4 Streaming for media

Do not load entire files when streaming upload/download is possible.

### 7.5 Crypto discipline

- Use the `@crypto/core` facade.
- Match the existing sync/async split: curves (X25519/Ed25519) and `pbkdf2`
  are async because they benefit from Node's libuv thread pool; hashes
  (SHA-1/256/512, MD5), AES (GCM/CBC/CTR), HMAC, and HKDF are sync because
  benchmarks showed the thread-pool hop costs more than the op itself. Do
  **not** add async wrappers around the sync primitives, and do not
  unwrap async curves into sync calls without a fresh benchmark.
- Import `CryptoKey` from `@crypto`, not from `node:crypto` types at call sites.
- **MAC/signature/HMAC comparisons must use `uint8TimingSafeEqual()`**, never `uint8Equal()` or `===`. Even though `uint8Equal()` is XOR-accumulated constant-time today, the native `timingSafeEqual` is JIT-resistant and is the only guarantee. Examples of MAC-sensitive sites: Signal Message MAC, app-state snapshot/patch MAC, pair-success HMAC, media file SHA256 verification. Public key comparisons (identity match) are not MAC-sensitive – `uint8Equal()` is fine there.

### 7.6 Scratch buffer reuse in hot paths

For fixed-size buffers (e.g. AES-GCM nonces of 12 bytes) used per-frame/per-message:

- Allocate a `private readonly scratch: Uint8Array = new Uint8Array(N)` field on the class.
- Use the low-level primitive that writes into the scratch (`writeNonceCounter(scratch, counter)`), not a wrapper that allocates and returns (`buildNonce(counter)` – anti-pattern).
- Canonical example: `WaNoiseSocket.writeNonceScratch` + `WaNoiseHandshake.nonceScratch`.

### 7.7 Bench before micro-optimizing

V8 has highly-optimized fast paths that beat naive "manual" optimizations. **Always benchmark before applying perf rewrites.** Known traps:

- `arr.slice()` on `Array<Object>` beats manual indexed-copy loop (V8 has a `CloneFixedArray` fast path). Manual loop is ~50–60% **slower** for size ≥ 50.
- `string +=` in a loop is JIT-optimized into a rope/cons-string; array-push + `.join('')` is ~50% **slower** in practice.
- Linear `findNodeChild` with early-return beats a batched `findNodeChildrenByTags` for small N (≤ 5). Batching only wins when N is large or when the same scan would otherwise repeat.
- Spreading `[a, b, c]` as an HMAC input is noise compared to the HMAC compute cost.

Real wins typically come from: eliminating allocations entirely (scratch buffers), replacing O(N) `Object.values().includes()` with O(1) `Set.has()`, deduplicating crypto compute (LRU on derived keys), and avoiding `decode → mutate → re-encode` cycles on protobuf payloads.

---

## 8. Feature Checklists

### 8.1 IQ/query-based feature

- [ ] Verify behavior in `wa-web/` (or `wa-mob/` for mobile-specific flows)
- [ ] Add/update protocol constants if needed
- [ ] Add builder in `@transport/node/builders/*` when reusable/complex
- [ ] Add coordinator logic in `src/client/coordinators/`
- [ ] Wire dependencies in `buildWaClientDependencies()` (`WaClientFactory.ts`)
- [ ] Add/update event types in `src/client/types.ts` when needed
- [ ] Add/update tests in `__tests__`
- [ ] Validate in real flow when protocol behavior is affected

### 8.2 Incoming push feature

- [ ] Register handler with `registerIncomingHandler(...)`
- [ ] Keep parsing logic pure (`src/client/events/*` – per-domain parsers)
- [ ] Emit typed event through `WaClientEventMap`
- [ ] Send required acks/receipts via builders

### 8.3 Persistence feature

- [ ] Add store contract in `src/store/contracts/`
- [ ] Add bounded memory provider in `src/store/memory/`
- [ ] Add SQLite provider in `packages/store-sqlite/src/` (extends
      `BaseSqliteStore`)
- [ ] Add migration entry in `packages/store-sqlite/src/migrations.ts`
- [ ] Wire provider selection in `createStore()` (`src/store/createStore.ts`)
- [ ] Add provider in every other `packages/store-*` package (redis,
      postgres, mysql, mongo) – keeps the matrix consistent

### 8.4 Crypto feature

- [ ] Match behavior to `wa-web/` (or `wa-mob/` for mobile-specific flows)
- [ ] Implement with `@crypto/core`
- [ ] Keep data as `Uint8Array`
- [ ] Use timing-safe equality where applicable
- [ ] Ensure no secret logging

---

## 9. Testing, Flow, and Benchmarks

### 9.1 Test structure

`npm run test:structure` enforces that source directories with `.ts` files have `__tests__` coverage.

### 9.2 Unit and flow tests

- unit tests: `*.test.ts` (run by `npm run test`)
- real flow tests: `*.flow.test.ts` (run by `npm run test:flow`)

Use flow tests for auth/transport/signal/retry changes that need real protocol validation.

### 9.2.1 Test helpers

Do not redefine common fixtures inline. Shared helpers live in `@infra/log/types`:

- `createNoopLogger(level?)` – silent `Logger` for tests. Use instead of redefining a local `function createLogger(): Logger { return { level: 'trace', trace: () => undefined, child: () => ... } }`. Also re-exported from the public root (`'zapo-js'`) so optional packages can import it the same way.

Add new shared test-only helpers to a sibling `__tests__/_helpers.ts` only when reused across 3+ files.

### 9.3 Benchmark pipeline

Bench scripts live in `bench/` and can emit machine-readable JSON.

Main benchmark env variables:

- `WA_BENCH_OUTPUT_MODE` (`auto` | `table` | `compact`)
- `WA_BENCH_OUTPUT_FORMAT` (`human` | `json` | `both`)
- `WA_BENCH_JSON_DIR`
- `WA_BENCH_JSON_PRETTY`
- `WA_BENCH_FAIL_ON_FAIL`

PR comment script (`scripts/build-bench-comment.cjs`) consumes:

- `WA_BENCH_COMMENT_DIR`
- `WA_BENCH_COMMENT_BASE_DIR`
- `WA_BENCH_COMMENT_OUTPUT`
- `WA_BENCH_LOG_PATH`
- `WA_BENCH_EXIT_CODE`
- `WA_BENCH_BASE_EXIT_CODE`

---

## 10. Review Anti-Patterns

### Critical

- inventing protocol behavior not validated in `wa-web/` or `wa-mob/`
- unbounded maps/queues in long-lived paths
- `Buffer` usage in runtime modules
- silent catches without logs/context
- secret leakage in logs
- per-message / per-frame / per-send logs above `trace` level (§5.7). In high-volume accounts, a per-send `debug` drowns the log and makes `level: debug` unusable in staging.
- duplicate protocol parsing/building across modules when a shared helper is appropriate
- monolithic coordinators doing build + parse + orchestration inline without separation
- `uint8Equal()` / `===` for MAC/signature comparison instead of `uint8TimingSafeEqual()` (§7.5)
- allocating a fixed-size buffer (e.g. AES nonce) per call in a hot path instead of using a per-instance scratch (§7.6)
- accepting a logging callback (`onWarning`, `onLog`, ...) or a mutable `bindLogger(logger)` slot in an optional package's options instead of the per-call `ctx.logger` contract (§5.7). Callbacks lose level/structure; a mutable slot breaks when one processor is shared across multiple `WaClient` sessions (last-write-wins on the slot).

### Frequent review nits

- trivial wrapper functions with no transformation
- single-use exported interfaces/types with no API value
- dead null/undefined checks that contradict declared types
- duplicated manual loops where array helpers improve clarity
- re-export indirection that creates multiple import paths for the same symbol
- applying perf "optimizations" (`.slice()` → loop, `+=` → array+join, batched lookup over linear scan) without a benchmark proving the gain – V8 often beats the rewrite (§7.7)
- deleting an export flagged by `knip`/`ts-prune` without verifying internal usage (default parameter values, same-file consumers, dynamic-import-only consumers, type-only imports)
- redefining `function createLogger(): Logger { return { level: 'trace', ... } }` in test files instead of importing `createNoopLogger` from `@infra/log/types` (§9.2.1)
- using `warn` for an auto-recovered fallback / retry path (§5.7). Warn is for things the operator should see at default level; auto-recovered paths are `debug`.
- using `info` to narrate routine method internals (`'X start'` / `'X finished'` pairs around a sync). Info is reserved for once-per-lifecycle events.
- string interpolation in the log message itself (`` `failed to send ${kind}` ``) instead of the context object (`'failed to send'` + `{ kind }`) (§5.7). Breaks log aggregator dedup.
- emitting per-target `warn` in a loop over devices/jids in batch operations instead of aggregating after the loop with `{ droppedCount, totalExpected, sample: jids.slice(0, 3) }` (§5.7).
- repeating the same field (`jid`, `id`, `requester`) in every log call inside a function with 3+ logs instead of binding it once via `logger.child({ ... })` (§5.7).
- citing this guide (`AGENTS.md §N`, `see AGENTS`) in source comments, JSDoc, or commit messages. This guide is the contract for contributors, not runtime documentation. Section numbers and headings rot when the guide is reorganized, leaving stale pointers in source. Comments must stand on their own – explain _why_ the code is the way it is in plain language; if a rule needs the guide to be understood, restate the rule briefly in the comment.

---

## 11. Dependency Direction

Keep dependencies flowing from low-level primitives to high-level orchestration.

Preferred direction (conceptual):

```text
protocol + util
    -> crypto
    -> transport
    -> signal / message / retry / auth / appstate / media / store
    -> client/coordinators
    -> WaClient
```

Rule of thumb:

- lower layers must not import from higher layers
- if a lower layer needs behavior from above, pass it via runtime ports/callback contracts

---

## 12. Quick Reference

### `@util/bytes`

- `bytesToHex`, `hexToBytes`
- `bytesToBase64`, `base64ToBytes`, `bytesToBase64UrlSafe`
- `concatBytes`, `toBytesView`, `toChunkBytes`
- `uint8TimingSafeEqual`, `uint8Equal`
- `readAllBytes`
- `intToBytes`, `removeAt`
- `EMPTY_BYTES`, `ZERO_BYTES`, `TEXT_ENCODER`, `TEXT_DECODER`

### `@util/collections`

- `setBoundedMapEntry`
- `normalizeQueryLimit`
- `resolveCleanupIntervalMs`

### `@util/primitives`

- `toError`
- `toSafeNumber`
- `longToNumber`

### `@util/coercion`

Strict (throw on bad input):

- `asNumber`, `asOptionalNumber`
- `asString`, `asOptionalString`
- `asBytes`, `asOptionalBytes`
- `toBoolOrUndef`
- `resolvePositive`

Lenient (return `null` instead of throwing – for external JSON / GraphQL /
MEX payloads):

- `tryAsString`, `tryAsNumber`, `tryAsRecord`

### `@util/runtime`

- `getRuntimeOsDisplayName`
- `isBunRuntime`

### `@util/async`

- `delay`

### `@util/clock`

- `createServerClock`
- `ServerClock` (type)
- `GetClockSkewMs` (type)

### `@crypto/core`

Sync primitives (no Promise overhead):

- `sha1`, `sha256`, `sha512`, `md5Bytes`
- `aesGcmEncrypt`, `aesGcmDecrypt`
- `aesCbcEncrypt`, `aesCbcDecrypt`
- `aesCtrEncrypt`, `aesCtrDecrypt`
- `hmacSha256Sign`, `hmacSha512Sign`
- `hkdf`, `hkdfSplit`
- `writeNonceCounter` (in-place 12-byte AES-GCM nonce write)
- `toSerializedPubKey`, `toRawPubKey`, `prependVersion`, `readVersionedContent`

Async primitives (libuv thread pool wins):

- `pbkdf2Sha256`
- `randomBytesAsync`, `randomIntAsync`, `randomFillAsync`
- `xeddsaSign`, `xeddsaVerify`

Re-exported curves (`@crypto/curves`):

- `X25519` (class: `generateKeyPair`, `keyPairFromPrivateKey`, `scalarMult`)
- `Ed25519` (class: `generateKeyPair`, `sign`, `verify`)

### `@transport/node/query`

- `buildIqNode`
- `assertIqResult`
- `queryWithContext`

### `@infra/perf/BoundedTaskQueue`

- `new BoundedTaskQueue(maxQueueSize?, maxConcurrency?)`
- `enqueue`, `pending`, `inFlight`

---

## 13. MCP Dev Server (`@zapo-js/mcp-server`)

Optional package that exposes `WaClient` sessions and the `zapo-js` module namespace as MCP tools, so an LLM agent can drive end-to-end flows (connect, pair, send, query groups/newsletters, inspect events, etc.) without writing throwaway scripts. Source: `packages/mcp-server/`.

The server multiplexes **multiple sessions over one shared store**: every tool takes an optional `session` id (default `MCP_SESSION_ID`), and a new id lazily spins up an additional `WaClient` on the same backend (the store scopes every row by session id). Event buffers are per-session; log lines are tagged with `context.session` so `logs` can filter by session.

### Registering with Claude Code

Build, then register at user scope so it works from any cwd:

```bash
npm run build --workspace @zapo-js/mcp-server
claude mcp add zapo --scope user -- node <abs-path>/packages/mcp-server/dist/bin.js
```

For tighter dev iteration, register the source via `tsx` (no build step needed):

```bash
claude mcp add zapo --scope user -- node --import tsx <abs-path>/packages/mcp-server/src/bin.ts
```

### Tool surface

- **`call`** / **`inspect`** – walk dotted paths against `client` (the WaClient instance) or `lib` (the `zapo-js` module namespace, including `proto.*` and helpers like `parsePhoneJid`). `call` invokes functions; `inspect` lists members with origin class.
- **`events`** / **`events_clear`** – bounded ring buffer of every `WaClientEventMap` event (filter by `types` / `since` / `limit` / `drain`).
- **`logs`** / **`logs_clear`** – `BufferedTeeLogger` mirrors every runtime + lib log line into a queryable buffer (also stderr, and JSONL to `MCP_LOG_FILE` if set).
- **`lifecycle`** – `status` / `start` / `destroy` for the WaClient instance.
- **`restart`** – `soft` (drop client + clear buffers) or `process_exit` (also exits the process so a supervisor / reconnect respawns it).

The full description, schema, and examples are inlined on each tool – agents should read them at runtime rather than memorize flags.

### Pairing flow gotcha

`client.connect()` blocks until pairing finishes. Always invoke it as `call({ path: 'connect', noAwait: true })` so the tool returns immediately. Then poll `events({ types: ['auth_qr','auth_pairing_code','auth_paired','connection'] })`, surface the QR string to the user, wait for `auth_paired`, and continue.

### Dev loop

**Recommended (HTTP + `node --watch`, zero manual reconnect):**

```bash
claude mcp add zapo --scope user --transport http http://127.0.0.1:3737/mcp
npm run dev --workspace @zapo-js/mcp-server
```

The `dev` script runs the server under `node --watch --import tsx` on HTTP (port 3737). `tsx` resolves `zapo-js` directly from `<root>/src/` via `packages/tsconfig.paths.json`, so iterating on the core lib needs no rebuild. Edit any `.ts` in `src/` (root or mcp-server) → `node --watch` restarts the process → the next tool call from Claude Code re-establishes the HTTP session automatically. No `/mcp` manual reconnect.

The script also sets `MCP_AUTH_PATH=../../.auth/state.sqlite`, so the MCP shares the credential store with `test/example.cjs` (no re-pairing).

> Why `node --watch` and not `tsx watch`: `tsx watch` has known issues detecting changes in nested imports on Windows. `node --watch` (Node 20+) tracks the import graph reliably across platforms while `tsx` continues to handle TS transpilation as a loader.

**Stdio fallback (manual reconnect):**

```bash
npm run build --workspace @zapo-js/mcp-server
claude mcp add zapo --scope user -- node <abs>/packages/mcp-server/dist/bin.js
```

After editing source: rebuild → call `restart` with `mode: "process_exit"` → `/mcp` reconnect in Claude Code.

### Environment variables

| Var                                                                            | Default                       | Purpose                                               |
| ------------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------- |
| `MCP_AUTH_PATH`                                                                | `<cwd>/.auth/state.sqlite`    | sqlite credential store path                          |
| `MCP_SESSION_ID`                                                               | `default_2`                   | default session id (tools that omit `session` use it) |
| `MCP_MAX_SESSIONS`                                                             | `16`                          | max concurrently-live sessions in the process         |
| `MCP_LOG_LEVEL`                                                                | `info`                        | `trace` / `debug` / `info` / `warn` / `error`         |
| `MCP_LOG_FILE`                                                                 | unset                         | append every log line as JSONL                        |
| `MCP_LOG_BUFFER_SIZE`                                                          | `500`                         | in-memory log ring size                               |
| `MCP_EVENT_BUFFER_SIZE`                                                        | `1000`                        | in-memory event ring size                             |
| `MCP_CAPTURE_TRANSPORT`                                                        | `0`                           | also buffer noisy `transport_*` events                |
| `MCP_HISTORY_DISABLED`                                                         | `0`                           | disable history sync on connect                       |
| `MCP_TRANSPORT`                                                                | `stdio`                       | `stdio` or `http` (StreamableHTTPServerTransport)     |
| `MCP_HTTP_HOST` / `MCP_HTTP_PORT` / `MCP_HTTP_PATH`                            | `127.0.0.1` / `3737` / `/mcp` | HTTP listener config                                  |
| `MCP_FAKE_NOISE_PUBKEY_HEX` + `MCP_FAKE_NOISE_SERIAL` + `MCP_CHAT_SOCKET_URLS` | unset                         | point at `@zapo-js/fake-server` for tests             |

### Notes / limits

- The cwd of the spawned MCP process determines the default `.auth/` location. When Claude Code spawns it, that's wherever Claude Code was started.
- One process can run many sessions over one shared store: pass `session` to any tool (default `MCP_SESSION_ID`), bounded by `MCP_MAX_SESSIONS`. All sessions share the one `MCP_AUTH_PATH` backend. Running separate processes is only needed when you want isolated stores/auth files.
- `WaClient` has no auto-reconnect. On `connection: close`, call `connect` again manually (per session).
- `restart` (soft) does NOT pick up code changes; `process_exit` + reconnect does.
- `node --watch` is not a full supervisor: it restarts on file changes only. `process_exit` from the `restart` tool kills the watcher too – under HTTP+watch, just edit a file to reload instead.

---

## 14. Versioning

This project follows [Semantic Versioning](https://semver.org/). From `1.0.0` the public API is stable: breaking changes ship only in a major bump.

- `patch` – bug fixes, internal refactors with no API change
- `minor` – new features, non-breaking additions
- `major` – breaking API changes

### Two version tracks

Changesets tracks the optional packages **only**, not the core. The root `package.json` (`zapo-js`) is the workspace anchor, so `@manypkg`/Changesets exclude it from the releasable set – `npx changeset add` does not even list it.

- **Optional packages (`@zapo-js/*`)** – versioned with Changesets. Add a changeset in the PR that changes them: `npx changeset`, pick the packages and bump levels, write the summary. The file lands in `.changeset/`.
- **Core (`zapo-js`)** – versioned by hand. Bump the root `version` directly with `npm version <patch|minor|major> --no-git-tag-version` (bumps the root only); Changesets never touches it.

### Release process (on `master`, before pushing the tag)

1. List every commit since the last release and have the AI triage it. The input is `git log $(git describe --tags --match 'v*' --abbrev=0)..HEAD --stat`. Ask the AI to:
    - attribute each commit to the **core** (`src/`) or an **add-on** (`packages/<name>/`) by the files it touched;
    - propose the SemVer bump per area from the conventional-commit prefix – `feat` → minor, `fix`/`perf` → patch, a `!` marker or `BREAKING CHANGE` footer → major, and `chore`/`docs`/`ci`/`test`-only commits that ship no code → no bump (the highest wins per area);
    - draft the changeset body for each touched add-on and the release-notes summary for the core.

    The AI proposes; you decide.

2. Write a changeset for every add-on the AI flagged that does not have one yet (`npx changeset`), then confirm with `npm run changeset:status`.
3. Apply the add-on bumps + changelogs: `npm run version:packages` (runs `changeset version`, consumes the `.changeset/*.md`).
4. Bump the core by hand if it changed, at the level the AI proposed: `npm version <level> --no-git-tag-version`.
5. Commit everything as one release commit: `chore: release vX.Y.Z`, where `X.Y.Z` is the core version.
6. Tag with the core version and push it: `git tag vX.Y.Z && git push && git push origin vX.Y.Z`.

Pushing the `v*` tag triggers `.github/workflows/release.yml`, which publishes via npm trusted publishing (OIDC, no `NPM_TOKEN`): the core through a guarded `npm publish` (skipped when its version is already on the registry) and the add-ons through `changeset publish` (only the `@zapo-js/*` whose version is not yet on npm). `.github/workflows/github-release.yml` creates the GitHub Release from the same tag.

Every published package must be registered as a trusted publisher on npmjs.com (repo `vinikjkkj/zapo`, workflow `release.yml`) before its first CI publish. A brand new package name cannot be pre-configured – publish it once manually, then switch to trusted publishing.

### Core major bumps and peer ranges

Optional packages declare `zapo-js` as a `peerDependency` (`^1.0.0`). A core **major** bump (for example `1.x` → `2.0.0`) leaves that range unsatisfied: manually widen `peerDependencies.zapo-js` in every affected package and add a changeset for it, even with no code change of its own. Minor/patch core bumps stay within the range and need nothing.

---

## 15. Before Sending a PR

- [ ] Protocol behavior validated against `wa-web/` (and `wa-mob/` when applicable)
- [ ] New/changed logic covered by tests (`__tests__` + flow when applicable)
- [ ] No secret material in logs
- [ ] No unbounded in-memory growth introduced
- [ ] No cross-module relative import chains
- [ ] JSDoc updated on changed exports (params, return, `@throws`, `@example`, mobile/business markers) **and** `@example` blocks in other files that call the changed symbol still compile – grep the old name (see §5.9)
- [ ] `npm run lint`, `npm run format:check`, `npm run test`, and `npm run typecheck:all` pass locally (the `:all` variant catches package-level type errors that `npm run typecheck` alone misses – e.g. a public export removed from `src/<module>/index.ts` that a `packages/*` file imports via `zapo-js/<module>`)
