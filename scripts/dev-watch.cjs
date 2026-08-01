/**
 * Dev runner that restarts a child process when watched sources really change.
 *
 * Why not `node --watch`: on Windows libuv subscribes fs.watch to
 * FILE_NOTIFY_CHANGE_LAST_ACCESS, so merely *reading* a file emits a change
 * event once NTFS flushes a new last-access time (module load, test run,
 * editor indexing, grep). Node's watch mode restarts on any event for a file
 * in its module graph without checking whether the contents moved, which
 * makes the server restart on the first lazy import (for the MCP server that
 * is `better-sqlite3`, loaded on the first `connect()`) and whenever another
 * tool walks the tree. This runner keeps the same event source and verifies
 * mtime + size before restarting, so last-access-only events are dropped.
 *
 * Usage:
 *   node scripts/dev-watch.cjs --watch src --watch ../../src -- node --import tsx src/bin.ts
 */

const { spawn } = require('node:child_process')
const { readdirSync, statSync, watch } = require('node:fs')
const path = require('node:path')

const DEBOUNCE_MS = 200
const KILL_TIMEOUT_MS = 3_000
const WATCHED_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.cjs', '.mjs', '.json'])
const IGNORED_DIRS = new Set([
    'node_modules',
    'dist',
    '__tests__',
    '__test__',
    'bench',
    'target',
    '.turbo',
    '.git',
    'coverage'
])

const parseArgs = (argv) => {
    const watchDirs = []
    const command = []
    let afterSeparator = false
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]
        if (afterSeparator) {
            command.push(arg)
        } else if (arg === '--') {
            afterSeparator = true
        } else if (arg === '--watch') {
            const dir = argv[i + 1]
            if (!dir) throw new Error('--watch requires a directory')
            watchDirs.push(path.resolve(dir))
            i += 1
        } else {
            throw new Error(`unexpected argument "${arg}"`)
        }
    }
    if (watchDirs.length === 0) throw new Error('at least one --watch <dir> is required')
    if (command.length === 0) throw new Error('missing command after "--"')
    return { watchDirs, command }
}

const { watchDirs, command } = parseArgs(process.argv.slice(2))

const REPO_ROOT = path.resolve(__dirname, '..')

const log = (message) => process.stderr.write(`[dev-watch] ${message}\n`)

/** Paths are logged from the repo root: the cwd is a package folder. */
const display = (target) => path.relative(REPO_ROOT, target).split(path.sep).join('/')

const isWatchable = (filePath) => {
    if (!WATCHED_EXTENSIONS.has(path.extname(filePath))) return false
    return !filePath.split(path.sep).some((segment) => IGNORED_DIRS.has(segment))
}

/** `mtime:size` fingerprint, or null when the file is gone. */
const fingerprint = (filePath) => {
    try {
        const stats = statSync(filePath)
        return `${stats.mtimeMs}:${stats.size}`
    } catch {
        return null
    }
}

/**
 * Prime the fingerprint cache so the first event per file can be compared
 * against a known state. Without this, the child's own boot reads would look
 * like new files and restart the process immediately. statSync does not touch
 * last-access time, so the scan itself creates no events.
 */
const primeFingerprints = (dir, cache) => {
    let entries
    try {
        entries = readdirSync(dir, { withFileTypes: true })
    } catch {
        return
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) primeFingerprints(path.join(dir, entry.name), cache)
            continue
        }
        const filePath = path.join(dir, entry.name)
        if (!isWatchable(filePath)) continue
        cache.set(filePath, fingerprint(filePath))
    }
}

const fingerprints = new Map()
for (const dir of watchDirs) {
    primeFingerprints(dir, fingerprints)
}

let child = null
let killTimer = null
let debounceTimer = null
let restarting = false
let shuttingDown = false
const pendingChanges = new Set()

const startChild = () => {
    child = spawn(command[0], command.slice(1), { stdio: 'inherit', env: process.env })
    const started = child
    started.on('exit', (code, signal) => {
        if (started !== child) return
        child = null
        if (shuttingDown || restarting) return
        log(`process exited (${signal ?? code}); waiting for changes`)
    })
    started.on('error', (error) => {
        log(`failed to spawn: ${error.message}`)
    })
}

const restart = () => {
    // A restart already in flight spawns its child after the edit landed on
    // disk, so triggers inside the kill window are already covered. Without
    // this guard each one stacks another exit listener on the dying child and
    // spawns a duplicate server when it finally exits.
    if (restarting) {
        pendingChanges.clear()
        return
    }
    const changed = Array.from(pendingChanges)
    if (changed.length === 0) return
    pendingChanges.clear()
    const extra = changed.length > 1 ? ` (+${changed.length - 1} more)` : ''
    log(`restarting: ${display(changed[0])}${extra}`)

    if (!child) {
        startChild()
        return
    }
    restarting = true
    const dying = child
    dying.once('exit', () => {
        if (killTimer) {
            clearTimeout(killTimer)
            killTimer = null
        }
        child = null
        restarting = false
        startChild()
    })
    dying.kill('SIGTERM')
    killTimer = setTimeout(() => {
        killTimer = null
        dying.kill('SIGKILL')
    }, KILL_TIMEOUT_MS)
    killTimer.unref()
}

const onFsEvent = (dir, name) => {
    if (!name) return
    const filePath = path.resolve(dir, name.toString())
    if (!isWatchable(filePath)) return
    const next = fingerprint(filePath)
    const previous = fingerprints.get(filePath)
    // Same mtime and size: a last-access-time flush or a metadata-only touch,
    // not an edit. This is the event `node --watch` restarts on.
    if (previous === next) return
    if (next === null) {
        fingerprints.delete(filePath)
    } else {
        fingerprints.set(filePath, next)
    }
    pendingChanges.add(filePath)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
        debounceTimer = null
        restart()
    }, DEBOUNCE_MS)
}

let watchedDirs = 0
for (const dir of watchDirs) {
    try {
        const watcher = watch(dir, { recursive: true }, (_eventType, name) => onFsEvent(dir, name))
        // An unhandled 'error' (watched root deleted or replaced while running)
        // is thrown by the EventEmitter and would take the runner down.
        watcher.on('error', (error) => log(`watch error on ${display(dir)}: ${error.message}`))
        watchedDirs += 1
    } catch (error) {
        log(`cannot watch ${display(dir)}: ${error.message}`)
    }
}
if (watchedDirs === 0) {
    // Starting the child here would look like a working dev loop that silently
    // never reloads.
    log('no directory could be watched, aborting')
    process.exit(1)
}

const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    if (killTimer) {
        clearTimeout(killTimer)
        killTimer = null
    }
    const dying = child
    if (!dying) {
        process.exit(0)
    }
    // Exit only once the child is gone. Orphaning it keeps the HTTP port bound
    // and the next `npm run dev` fails to bind. The escalation timer is not
    // unref'd on purpose: it has to hold the runner alive to enforce the kill.
    dying.once('exit', () => process.exit(0))
    dying.kill('SIGTERM')
    setTimeout(() => {
        dying.kill('SIGKILL')
        process.exit(0)
    }, KILL_TIMEOUT_MS)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

log(`watching ${watchDirs.map(display).join(', ')} (${fingerprints.size} files)`)
startChild()
