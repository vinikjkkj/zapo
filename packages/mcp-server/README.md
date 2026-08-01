# @zapo-js/mcp-server

Optional package that exposes [`zapo-js`](https://www.npmjs.com/package/zapo-js) `WaClient` sessions **and** the `zapo-js` module namespace as MCP tools, so an LLM agent (Claude Code, Cursor, etc.) can drive end-to-end WhatsApp flows - connect, pair, send, query groups/newsletters, inspect events, walk SQL state - without writing throwaway scripts. Source: [`packages/mcp-server/`](.).

> Built for **development and testing**, not as a production protocol server.

One process can drive **multiple sessions over a single shared store**: every tool takes an optional `session` id (default `MCP_SESSION_ID`), and any new id lazily spins up an additional `WaClient` on the same backend (the store scopes every row by session id). See [Sessions](#sessions).

## Tool surface

Every tool takes an optional **`session`** id (default `MCP_SESSION_ID`); a new id lazily spins up another `WaClient` on the shared store. See [Sessions](#sessions).

- **`call`** / **`inspect`** - walk dotted paths against `client` (the selected session's `WaClient`) or `lib` (the `zapo-js` module namespace, including `proto.*` and helpers like `parsePhoneJid`). `call` invokes functions; `inspect` lists members with origin class.
- **`events`** / **`events_clear`** - per-session ring buffer of every `WaClientEventMap` event (filter by `types` / `since` / `limit` / `drain`; scoped to `session`).
- **`logs`** / **`logs_clear`** - `BufferedTeeLogger` mirrors every runtime + lib log line into one queryable buffer (also stderr, and JSONL to `MCP_LOG_FILE` if set). Each session's lines are tagged with `context.session`; `logs` accepts a `session` filter.
- **`lifecycle`** - `status` / `start` / `destroy` for a session's `WaClient`. `status` also returns a summary of every live session.
- **`restart`** - `soft` resets one session (drop its client, clear its events + the shared log buffer); `process_exit` disconnects **every** session, destroys the shared store, then exits so a supervisor / reconnect respawns it.

The full description, schema, and examples are inlined on each tool - agents should read them at runtime rather than memorize flags.

## Install

```bash
npm install @zapo-js/mcp-server
```

Peer deps: `zapo-js`, `@modelcontextprotocol/sdk`. SQLite credential persistence requires `better-sqlite3`.

## Registering with Claude Code

Build, then register at user scope so it works from any cwd:

```bash
npm run build --workspace @zapo-js/mcp-server
claude mcp add zapo --scope user -- node <abs-path>/packages/mcp-server/dist/bin.js
```

For tighter dev iteration, register the source via `tsx` (no build step needed):

```bash
claude mcp add zapo --scope user -- node --import tsx <abs-path>/packages/mcp-server/src/bin.ts
```

## Pairing flow gotcha

`client.connect()` blocks until pairing finishes. Always invoke it as:

```text
call({ path: 'connect', noAwait: true })
```

so the tool returns immediately. Then poll
`events({ types: ['auth_qr', 'auth_pairing_code', 'auth_paired', 'connection'] })`,
surface the QR string to the user, wait for `auth_paired`, and continue.

## Sessions

The server multiplexes any number of sessions over **one** store (the single
`MCP_AUTH_PATH` backend, bounded by `MCP_MAX_SESSIONS`). Pass `session` to any
tool; omitting it targets the default (`MCP_SESSION_ID`). A fresh id is created
on first use - no extra server process needed.

```text
# bring up a second account alongside the default, on the same store
lifecycle({ action: 'start', session: 'business' })
call({ path: 'connect', session: 'business', noAwait: true })
events({ session: 'business', types: ['auth_qr', 'auth_paired', 'connection'] })
# ... scan the QR, wait for auth_paired ...
call({ path: 'message.send', session: 'business', args: ['<jid>', { conversation: 'hi' }] })

# list every live session
lifecycle({ action: 'status' })
# -> sessions: [{ sessionId, isDefault, clientCreated, bufferedEvents }, ...]
```

Each session has its own credentials row, event buffer, and connection
lifecycle; they share one sqlite connection (writes serialize in-process, no
cross-process `SQLITE_BUSY`). The in-process read-through cache (`cacheLayer`)
is safe here because a single process owns each session's rows. Use separate
processes only when you want isolated stores / auth files.

## Dev loop

**Recommended (HTTP + watch runner, zero manual reconnect):**

```bash
claude mcp add zapo --scope user --transport http http://127.0.0.1:3737/mcp
npm run dev --workspace @zapo-js/mcp-server
```

The `dev` script runs the server under `scripts/dev-watch.cjs`, which spawns
`node --import tsx src/bin.ts` on HTTP (port 3737) and respawns it when a
watched source actually changes. `tsx` resolves `zapo-js` directly from
`<root>/src/` via `packages/tsconfig.paths.json`, so iterating on the core lib
needs no rebuild. Edit any `.ts` under `<root>/src` or `<root>/packages` → the
runner restarts the process and names the file that triggered it → the next
tool call from Claude Code re-establishes the HTTP session automatically. No
`/mcp` manual reconnect. Generated and non-runtime folders are ignored:
`node_modules`, `dist`, `target`, `__tests__`, `__test__`, `bench`, `.turbo`
and `coverage`.

The script also sets `MCP_AUTH_PATH=../../.auth/state.sqlite`, so the MCP
shares the credential store with `test/example.cjs` (no re-pairing).

> **Why a custom runner and not `node --watch`:** on Windows libuv subscribes
> `fs.watch` to `FILE_NOTIFY_CHANGE_LAST_ACCESS`, so merely **reading** a file
> emits a change event once NTFS flushes a new last-access time (module load,
> test run, editor indexing, grep). `node --watch` restarts on any event for a
> file in its module graph without checking whether the contents moved, which
> makes the server restart on the first lazy import - `better-sqlite3`, loaded
> on the first `connect()` - and whenever another tool walks the tree. The
> runner keeps the same event source and compares mtime + size before
> restarting. `tsx watch` is not the answer either: it has known issues
> detecting changes in nested imports on Windows. `tsx` stays as the
> transpilation loader in every case.

**Stdio fallback (manual reconnect):**

```bash
npm run build --workspace @zapo-js/mcp-server
claude mcp add zapo --scope user -- node <abs>/packages/mcp-server/dist/bin.js
```

After editing source: rebuild → call `restart` with `mode: "process_exit"` → `/mcp` reconnect in Claude Code.

## Environment variables

| Var                                                                            | Default                       | Purpose                                               |
| ------------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------- |
| `MCP_AUTH_PATH`                                                                | `<cwd>/.auth/state.sqlite`    | SQLite credential store path                          |
| `MCP_SESSION_ID`                                                               | `default_2`                   | Default session id (tools that omit `session` use it) |
| `MCP_MAX_SESSIONS`                                                             | `16`                          | Max concurrently-live sessions in the process         |
| `MCP_LOG_LEVEL`                                                                | `info`                        | `trace` / `debug` / `info` / `warn` / `error`         |
| `MCP_LOG_FILE`                                                                 | unset                         | Append every log line as JSONL                        |
| `MCP_LOG_BUFFER_SIZE`                                                          | `500`                         | In-memory log ring size                               |
| `MCP_EVENT_BUFFER_SIZE`                                                        | `1000`                        | In-memory event ring size                             |
| `MCP_CAPTURE_TRANSPORT`                                                        | `0`                           | Also buffer noisy `transport_*` events                |
| `MCP_HISTORY_DISABLED`                                                         | `0`                           | Disable history sync on connect                       |
| `MCP_GROUP_BUNDLES`                                                            | `0`                           | Download group-history bundles shared by members      |
| `MCP_TRANSPORT`                                                                | `stdio`                       | `stdio` or `http` (StreamableHTTPServerTransport)     |
| `MCP_HTTP_HOST` / `MCP_HTTP_PORT` / `MCP_HTTP_PATH`                            | `127.0.0.1` / `3737` / `/mcp` | HTTP listener config                                  |
| `MCP_FAKE_NOISE_PUBKEY_HEX` + `MCP_FAKE_NOISE_SERIAL` + `MCP_CHAT_SOCKET_URLS` | unset                         | Point at `@zapo-js/fake-server` for tests             |

## Notes / limits

- The cwd of the spawned MCP process determines the default `.auth/`
  location. When Claude Code spawns it, that's wherever Claude Code was
  started.
- One process runs many sessions over one shared store: pass `session` to any
  tool (default `MCP_SESSION_ID`), bounded by `MCP_MAX_SESSIONS`. All sessions
  share the single `MCP_AUTH_PATH` backend - use separate processes only when
  you want isolated stores / auth files.
- `WaClient` has no auto-reconnect. On `connection: close`, call `connect`
  again manually (per session).
- `restart` (`soft`) does **not** pick up code changes; `process_exit` +
  supervisor reconnect does.
- The watch runner is not a full supervisor: it restarts on file changes
  only, and waits for the next change if the child exits on its own.
  `process_exit` from the `restart` tool kills the child and the runner will
  not respawn it until something changes - under HTTP+watch, just edit a file
  to reload instead.

See the main [`zapo-js`](../../README.md) docs for the `WaClient` API surface.
