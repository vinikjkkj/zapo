import type { WaSqliteDriver } from '../types'

const TEST_SQLITE_DRIVERS: readonly WaSqliteDriver[] = ['auto', 'better-sqlite3', 'bun', 'node']

function resolveTestDriver(): WaSqliteDriver {
    const requested = process.env.ZAPO_SQLITE_TEST_DRIVER
    if (!requested) {
        return 'auto'
    }
    // An unknown driver string is accepted by `openSqliteConnection` and
    // silently opens better-sqlite3, so a typo here would run the suite
    // against the wrong backend and still pass. Fail loudly instead.
    if (!TEST_SQLITE_DRIVERS.includes(requested as WaSqliteDriver)) {
        throw new Error(
            `invalid ZAPO_SQLITE_TEST_DRIVER "${requested}". Expected one of: ${TEST_SQLITE_DRIVERS.join(', ')}`
        )
    }
    return requested as WaSqliteDriver
}

/**
 * SQLite driver the suite runs against.
 *
 * `better-sqlite3` is an optional peer dependency, so the default is `'auto'`:
 * it resolves to the addon when installed and to the built-in `node:sqlite`
 * otherwise, which keeps the suite runnable on a bare install. Set
 * `ZAPO_SQLITE_TEST_DRIVER` to pin a specific driver - CI uses it to run the
 * same suite once per supported backend.
 */
export const TEST_SQLITE_DRIVER: WaSqliteDriver = resolveTestDriver()
