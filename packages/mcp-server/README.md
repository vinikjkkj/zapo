# @zapo-js/mcp-server

Optional package that exposes the [`zapo-js`](https://www.npmjs.com/package/zapo-js) `WaClient` instance **and** the `zapo-js` module namespace as MCP tools, so an LLM agent (Claude Code, Cursor, etc.) can drive end-to-end WhatsApp flows - connect, pair, send, query groups/newsletters, inspect events, walk SQL state - without writing throwaway scripts. Source: [`packages/mcp-server/`](.).

> Built for **development and testing**, not as a production protocol server.

## Tool surface

- **`call`** / **`inspect`** - walk dotted paths against `client` (the `WaClient` instance) or `lib` (the `zapo-js` module namespace, including `proto.*` and helpers like `parsePhoneJid`). `call` invokes functions; `inspect` lists members with origin class.
- **`events`** / **`events_clear`** - bounded ring buffer of every `WaClientEventMap` event (filter by `types` / `since` / `limit` / `drain`).
- **`logs`** / **`logs_clear`** - `BufferedTeeLogger` mirrors every runtime + lib log line into a queryable buffer (also stderr, and JSONL to `MCP_LOG_FILE` if set).
- **`lifecycle`** - `status` / `start` / `destroy` for the `WaClient` instance.
- **`restart`** - `soft` (drop the client + clear buffers) or `process_exit` (also exits the process so a supervisor / reconnect respawns it).

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

## Dev loop

**Recommended (HTTP + `node --watch`, zero manual reconnect):**

```bash
claude mcp add zapo --scope user --transport http http://127.0.0.1:3737/mcp
npm run dev --workspace @zapo-js/mcp-server
```

The `dev` script runs the server under `node --watch --import tsx` on HTTP
(port 3737). `tsx` resolves `zapo-js` directly from `<root>/src/` via
`packages/tsconfig.paths.json`, so iterating on the core lib needs no
rebuild. Edit any `.ts` in `src/` (root or mcp-server) → `node --watch`
restarts the process → the next tool call from Claude Code re-establishes
the HTTP session automatically. No `/mcp` manual reconnect.

The script also sets `MCP_AUTH_PATH=../../.auth/state.sqlite`, so the MCP
shares the credential store with `test/example.cjs` (no re-pairing).

> **Why `node --watch` and not `tsx watch`:** `tsx watch` has known issues
> detecting changes in nested imports on Windows. `node --watch` (Node 20+)
> tracks the import graph reliably across platforms while `tsx` continues
> to handle TS transpilation as a loader.

**Stdio fallback (manual reconnect):**

```bash
npm run build --workspace @zapo-js/mcp-server
claude mcp add zapo --scope user -- node <abs>/packages/mcp-server/dist/bin.js
```

After editing source: rebuild → call `restart` with `mode: "process_exit"` → `/mcp` reconnect in Claude Code.

## Environment variables

| Var                                                                            | Default                       | Purpose                                           |
| ------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------- |
| `MCP_AUTH_PATH`                                                                | `<cwd>/.auth/state.sqlite`    | SQLite credential store path                      |
| `MCP_SESSION_ID`                                                               | `default_2`                   | Session id passed to `WaClient`                   |
| `MCP_LOG_LEVEL`                                                                | `info`                        | `trace` / `debug` / `info` / `warn` / `error`     |
| `MCP_LOG_FILE`                                                                 | unset                         | Append every log line as JSONL                    |
| `MCP_LOG_BUFFER_SIZE`                                                          | `500`                         | In-memory log ring size                           |
| `MCP_EVENT_BUFFER_SIZE`                                                        | `1000`                        | In-memory event ring size                         |
| `MCP_CAPTURE_TRANSPORT`                                                        | `0`                           | Also buffer noisy `transport_*` events            |
| `MCP_HISTORY_DISABLED`                                                         | `0`                           | Disable history sync on connect                   |
| `MCP_TRANSPORT`                                                                | `stdio`                       | `stdio` or `http` (StreamableHTTPServerTransport) |
| `MCP_HTTP_HOST` / `MCP_HTTP_PORT` / `MCP_HTTP_PATH`                            | `127.0.0.1` / `3737` / `/mcp` | HTTP listener config                              |
| `MCP_FAKE_NOISE_PUBKEY_HEX` + `MCP_FAKE_NOISE_SERIAL` + `MCP_CHAT_SOCKET_URLS` | unset                         | Point at `@zapo-js/fake-server` for tests         |

## Notes / limits

- The cwd of the spawned MCP process determines the default `.auth/`
  location. When Claude Code spawns it, that's wherever Claude Code was
  started.
- One `WaClient` per process. Multi-session needs multiple servers with
  distinct `MCP_AUTH_PATH` + `MCP_SESSION_ID`.
- `WaClient` has no auto-reconnect. On `connection: close`, call `connect`
  again manually.
- `restart` (`soft`) does **not** pick up code changes; `process_exit` +
  supervisor reconnect does.
- `node --watch` is not a full supervisor: it restarts on file changes
  only. `process_exit` from the `restart` tool kills the watcher too -
  under HTTP+watch, just edit a file to reload instead.

See the main [`zapo-js`](../../README.md) docs for the `WaClient` API surface.
