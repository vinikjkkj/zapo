---
'@zapo-js/store-sqlite': minor
---

Add a `node` driver backed by the runtime's built-in `node:sqlite` module, and make `better-sqlite3` an optional peer dependency.

The store no longer needs a native addon: `node:sqlite` ships with Node 22.13+ and Bun 1.4+, so platforms that cannot build `better-sqlite3` (Termux, musl without prebuilds, locked-down CI) can now use SQLite persistence. `driver: 'auto'` keeps preferring `bun:sqlite` under Bun and `better-sqlite3` on Node, and falls back to `node` only when the addon is not installed - behavior for existing installs is unchanged.

The on-disk format is identical across drivers, so an existing database can be opened with any of them without migrating.
