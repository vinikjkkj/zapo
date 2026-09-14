import type { WaSqliteDriver } from '../types'

/**
 * SQLite driver the suite runs against.
 *
 * `better-sqlite3` is an optional peer dependency, so the default is `'auto'`:
 * it resolves to the addon when installed and to the built-in `node:sqlite`
 * otherwise, which keeps the suite runnable on a bare install. Set
 * `ZAPO_SQLITE_TEST_DRIVER` to pin a specific driver - CI uses it to run the
 * same suite once per supported backend.
 */
export const TEST_SQLITE_DRIVER: WaSqliteDriver =
    (process.env.ZAPO_SQLITE_TEST_DRIVER as WaSqliteDriver | undefined) ?? 'auto'
