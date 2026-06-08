<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/vinikjkkj/zapo/master/.github/assets/logo.png" />
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/vinikjkkj/zapo/master/.github/assets/logo-light.png" />
    <img src="https://raw.githubusercontent.com/vinikjkkj/zapo/master/.github/assets/logo-light.png" alt="zapo" width="400" />
  </picture>
</p>

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

<p align="center">
  📚 <strong>Documentation:</strong> <a href="https://zapo.to/">zapo.to</a> ·
  🛠 <strong>Contributing:</strong> <a href="CONTRIBUTING.md">CONTRIBUTING.md</a> ·
  💛 <strong>Sponsor:</strong> <a href="https://github.com/sponsors/vinikjkkj">GitHub Sponsors</a>
</p>

---

## Stability Notice

> `zapo-js` is stable as of `1.0.0`. The public API follows SemVer:
> breaking changes ship only in a major release; minors add features,
> patches fix bugs.

## Install

```bash
npm install zapo-js
```

Zero mandatory runtime dependencies. Pick the optional packages you need
on top: a persistent store and (optionally) the media processor for
thumbnails / voice-note metadata.

```bash
# Persistent store - choose one
npm install @zapo-js/store-sqlite better-sqlite3
# or @zapo-js/store-redis ioredis
# or @zapo-js/store-postgres pg
# or @zapo-js/store-mysql mysql2
# or @zapo-js/store-mongo mongodb

# Optional - thumbnails + waveforms + voice-note normalization
npm install @zapo-js/media-utils sharp
# plus a system `ffmpeg` + `ffprobe` on PATH (see media-utils README)

# Optional - structured logging
npm install pino pino-pretty
```

## Quick Start

```ts
import { ConsoleLogger, createStore, WaClient } from 'zapo-js'
import { createSqliteStore } from '@zapo-js/store-sqlite'

const store = createStore({
    backends: {
        sqlite: createSqliteStore({ path: '.auth/state.sqlite' })
    },
    providers: {
        auth: 'sqlite',
        signal: 'sqlite',
        preKey: 'sqlite',
        session: 'sqlite',
        identity: 'sqlite',
        senderKey: 'sqlite',
        appState: 'sqlite',
        privacyToken: 'sqlite',
        messages: 'sqlite', // 'none' to skip the message archive
        threads: 'sqlite', // 'none' to skip
        contacts: 'sqlite' // 'none' to skip
    }
})

const client = new WaClient({ store, sessionId: 'default' }, new ConsoleLogger('info'))

client.on('auth_qr', ({ qr }) => {
    console.log('scan this:', qr)
})

client.on('auth_paired', ({ credentials }) => {
    console.log('paired as', credentials.meJid)
})

client.on('message', async (event) => {
    if (event.message?.conversation === 'ping') {
        await client.message.send(event.key.remoteJid, 'pong')
    }
})

await client.connect()
```

That's the minimum to pair, listen for messages, and reply. For everything
else - sending media, reactions, polls, groups, newsletters, app-state
mutations, business profile, events catalog, store providers, the typed
event map, and the architectural reasoning - read the guides at
**[zapo.to](https://zapo.to/)**.

## Packages

The core lives at the repo root (`zapo-js`). Optional packages live in
[`packages/`](packages/) and ship under the `@zapo-js/*` scope. Install
only what you need.

| Package                                              | Peer dependency             | Purpose                                                                                                                                          |
| ---------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@zapo-js/store-sqlite`](packages/store-sqlite)     | `better-sqlite3`            | SQLite persistent store (single-process bots, dev sessions, small-to-medium prod).                                                               |
| [`@zapo-js/store-redis`](packages/store-redis)       | `ioredis`                   | Redis-backed store with native TTL eviction.                                                                                                     |
| [`@zapo-js/store-mongo`](packages/store-mongo)       | `mongodb`                   | MongoDB-backed store with TTL-index eviction.                                                                                                    |
| [`@zapo-js/store-mysql`](packages/store-mysql)       | `mysql2`                    | MySQL / MariaDB-backed store with background cleanup poller.                                                                                     |
| [`@zapo-js/store-postgres`](packages/store-postgres) | `pg`                        | PostgreSQL-backed store with background cleanup poller.                                                                                          |
| [`@zapo-js/media-utils`](packages/media-utils)       | `sharp` + `ffmpeg`          | `WaMediaProcessor`: thumbnails, waveforms, voice-note normalization.                                                                             |
| [`@zapo-js/fake-server`](packages/fake-server)       | (none)                      | In-process fake WhatsApp Web server for end-to-end testing.                                                                                      |
| [`@zapo-js/mcp-server`](packages/mcp-server)         | `@modelcontextprotocol/sdk` | **Dev-only.** MCP server exposing multi-session `WaClient`s as dynamic tools for an LLM agent (Claude Code / Cursor / etc.). Not for production. |

Each package's README has the install + config + integration notes.

## Documentation

- **[zapo.to](https://zapo.to/)** - guides, full API reference, examples,
  protocol notes ([llms.txt](https://zapo.to/llms.txt) index or
  [llms-full.txt](https://zapo.to/llms-full.txt) for LLM context)
- **[`vinikjkkj/zapo-docs`](https://github.com/vinikjkkj/zapo-docs)** -
  source of zapo.to (open issues/PRs there for doc fixes)
- **Per-package READMEs** under [`packages/`](packages/) - one per
  optional package
- **[`AGENTS.md`](AGENTS.md)** - architecture spec + coding rules
  (contributor-facing)

## Contributing

Pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for
setup, repo layout, CI, release flow, and the conventions PRs must follow.

Contributors also agree to the [Code of Conduct](CODE_OF_CONDUCT.md),
which includes an **AI-Assisted Contributions** policy covering
disclosure, human ownership, and the rule against bundle-hallucinated
protocol claims.

## Security

Found a vulnerability in the crypto, auth, or Signal layer? Please
**do not open a public issue**. Report it privately via
[GitHub Security Advisories](https://github.com/vinikjkkj/zapo/security/advisories/new)
or email `contact@vinicius.email`. Scope, response window, and
disclosure timeline are documented in [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE) © vinikjkkj

## Support the Project

If `zapo` is useful in your production or study setup, you can support
ongoing development on GitHub Sponsors:
[github.com/sponsors/vinikjkkj](https://github.com/sponsors/vinikjkkj).

## Disclaimer

This project is an independent implementation for engineering and
interoperability research. It is not affiliated with or endorsed by
WhatsApp.
