import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { createMediaProcessor } from '@zapo-js/media-utils'
import { createSqliteStore } from '@zapo-js/store-sqlite'
import {
    createStore,
    type Logger,
    type LogLevel,
    WaClient,
    type WaClientEventMap,
    type WaStore
} from 'zapo-js'
import { hexToBytes, resolvePositive, toError } from 'zapo-js/util'

import { encodeForJson } from './serializer'

const DEFAULT_BUFFER_SIZE = 1000
const DEFAULT_LOG_BUFFER_SIZE = 500
const DEFAULT_MAX_SESSIONS = 16

const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50
}

export interface LogEntry {
    readonly seq: number
    readonly timestampMs: number
    readonly level: LogLevel
    readonly message: string
    readonly context: Record<string, unknown> | null
}

/**
 * Logger that fans out every write to:
 *   - process.stderr  (stdout is reserved for MCP JSON-RPC framing)
 *   - a bounded in-memory ring buffer queryable via the `logs` MCP tool
 *   - an optional append-only file (controlled by MCP_LOG_FILE)
 */
class BoundLogger implements Logger {
    public readonly level: LogLevel
    private readonly parent: Logger
    private readonly bindings: Readonly<Record<string, unknown>>

    public constructor(parent: Logger, bindings: Readonly<Record<string, unknown>>) {
        this.parent = parent
        this.level = parent.level
        this.bindings = bindings
    }

    public trace(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.parent.trace(message, this.merge(context))
    }
    public debug(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.parent.debug(message, this.merge(context))
    }
    public info(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.parent.info(message, this.merge(context))
    }
    public warn(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.parent.warn(message, this.merge(context))
    }
    public error(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.parent.error(message, this.merge(context))
    }
    public child(bindings: Readonly<Record<string, unknown>>): Logger {
        return new BoundLogger(this.parent, { ...this.bindings, ...bindings })
    }

    private merge(
        context: Readonly<Record<string, unknown>> | undefined
    ): Readonly<Record<string, unknown>> {
        return context ? { ...this.bindings, ...context } : this.bindings
    }
}

class BufferedTeeLogger implements Logger {
    public readonly level: LogLevel
    private readonly minPriority: number
    private readonly bufferLimit: number
    private readonly buffer: LogEntry[] = []
    private nextSeq = 1
    private fileStream: WriteStream | null = null

    public constructor(
        level: LogLevel = 'info',
        bufferLimit = DEFAULT_LOG_BUFFER_SIZE,
        filePath?: string
    ) {
        this.level = level
        this.minPriority = LOG_LEVEL_PRIORITY[level]
        this.bufferLimit = bufferLimit > 0 ? bufferLimit : DEFAULT_LOG_BUFFER_SIZE
        if (filePath) {
            try {
                mkdirSync(dirname(filePath), { recursive: true })
                this.fileStream = createWriteStream(filePath, { flags: 'a' })
                this.fileStream.on('error', (err) => {
                    process.stderr.write(`[mcp] log file write error: ${err.message}\n`)
                    this.fileStream = null
                })
            } catch (err) {
                process.stderr.write(
                    `[mcp] disabling log file mirror, could not open ${filePath}: ${toError(err).message}\n`
                )
                this.fileStream = null
            }
        }
    }

    public trace(message: string, context?: Record<string, unknown>): void {
        this.write('trace', message, context)
    }
    public debug(message: string, context?: Record<string, unknown>): void {
        this.write('debug', message, context)
    }
    public info(message: string, context?: Record<string, unknown>): void {
        this.write('info', message, context)
    }
    public warn(message: string, context?: Record<string, unknown>): void {
        this.write('warn', message, context)
    }
    public error(message: string, context?: Record<string, unknown>): void {
        this.write('error', message, context)
    }
    public child(bindings: Readonly<Record<string, unknown>>): Logger {
        return new BoundLogger(this, { ...bindings })
    }

    public listLogs(
        filter: {
            readonly levels?: readonly LogLevel[]
            readonly since?: number
            readonly limit?: number
            readonly drain?: boolean
            readonly q?: string
            readonly regex?: boolean
            readonly session?: string
        } = {}
    ): readonly LogEntry[] {
        const levels = filter.levels && filter.levels.length > 0 ? new Set(filter.levels) : null
        const since = filter.since ?? 0
        const limit = filter.limit && filter.limit > 0 ? filter.limit : 100
        const matchQuery = buildQueryMatcher(filter.q ?? '', filter.regex === true)
        // Logs share one ring; per-session entries are tagged via context.session
        // by the per-session child logger. A `session` filter keeps only those;
        // omitting it returns everything, including untagged server/global lines.
        const session = filter.session
        const matched: LogEntry[] = []
        for (let i = 0; i < this.buffer.length; i += 1) {
            const entry = this.buffer[i]
            if (entry.seq <= since) continue
            if (levels && !levels.has(entry.level)) continue
            if (session !== undefined && entry.context?.session !== session) continue
            const haystack =
                entry.message + (entry.context ? ' ' + safeStringify(entry.context) : '')
            if (!matchQuery(haystack)) continue
            matched.push(entry)
        }
        const tail = matched.length > limit ? matched.slice(matched.length - limit) : matched
        if (filter.drain && tail.length > 0) {
            const drainSet = new Set(tail.map((e) => e.seq))
            for (let i = this.buffer.length - 1; i >= 0; i -= 1) {
                if (drainSet.has(this.buffer[i].seq)) {
                    this.buffer.splice(i, 1)
                }
            }
        }
        return tail
    }

    public clearLogs(): number {
        const n = this.buffer.length
        this.buffer.length = 0
        return n
    }

    public resetSequence(): void {
        this.nextSeq = 1
    }

    public bufferLogsSize(): number {
        return this.buffer.length
    }

    public async closeFile(): Promise<void> {
        const stream = this.fileStream
        if (!stream) return
        this.fileStream = null
        await new Promise<void>((resolveClose) => {
            stream.end(() => resolveClose())
        })
    }

    private write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
        if (LOG_LEVEL_PRIORITY[level] < this.minPriority) {
            return
        }
        const ts = Date.now()
        const iso = new Date(ts).toISOString()
        const safeCtx = context && Object.keys(context).length > 0 ? safeStringify(context) : null
        const ctxStr = safeCtx ? ` ${safeCtx}` : ''
        process.stderr.write(`[${iso}] ${level} ${message}${ctxStr}\n`)

        const entry: LogEntry = {
            seq: this.nextSeq,
            timestampMs: ts,
            level,
            message,
            context: context && Object.keys(context).length > 0 ? context : null
        }
        this.nextSeq += 1
        this.buffer.push(entry)
        const overflow = this.buffer.length - this.bufferLimit
        if (overflow > 0) {
            this.buffer.splice(0, overflow)
        }

        if (this.fileStream) {
            const line = safeStringify({
                ts: iso,
                level,
                message,
                context: entry.context
            })
            this.fileStream.write(`${line}\n`)
        }
    }
}

/**
 * JSON.stringify-safe wrapper. Routes through encodeForJson so BigInt, Uint8Array,
 * cycles and other non-JSON values turn into the runtime's marker shape instead of
 * throwing – a logger that crashes on log payload is worse than a noisy log.
 */
const safeStringify = (value: unknown): string => {
    try {
        return JSON.stringify(encodeForJson(value))
    } catch (err) {
        return JSON.stringify({ $stringifyError: toError(err).message })
    }
}

/**
 * Build a predicate for case-insensitive substring search (default) or regex
 * match (`isRegex: true`, with the `i` flag). Precomputes the lowercased query
 * or compiles the regex once so the buffer scan does not re-allocate them per
 * entry. Malformed regex yields a predicate that always returns false instead
 * of throwing – tool inputs should miss rather than crash the scan.
 */
const buildQueryMatcher = (query: string, isRegex: boolean): ((haystack: string) => boolean) => {
    if (!query) return () => true
    if (isRegex) {
        try {
            const pattern = new RegExp(query, 'i')
            return (haystack): boolean => pattern.test(haystack)
        } catch {
            return () => false
        }
    }
    const lower = query.toLowerCase()
    return (haystack): boolean => haystack.toLowerCase().includes(lower)
}

const ALL_EVENT_NAMES = [
    'auth_qr',
    'auth_pairing_code',
    'auth_pairing_required',
    'auth_paired',
    'connection',
    'message',
    'message_addon',
    'message_bot_chunk',
    'message_protocol',
    'message_unavailable',
    'receipt',
    'newsletter',
    'newsletter_message_update',
    'presence',
    'chatstate',
    'call',
    'group',
    'business',
    'picture',
    'mutation',
    'history_sync_chunk',
    'offline_resume',
    'stream_failure',
    'stanza_error',

    'mobile_registration_code',
    'mobile_account_takeover_notice',

    'debug_connection_success',
    'debug_notification',
    'debug_privacy_token',
    'debug_client_error',
    'debug_unhandled_stanza',
    'debug_transport_frame_in',
    'debug_transport_frame_out',
    'debug_transport_node_in',
    'debug_transport_node_out',
    'debug_transport_decode_error'
] as const satisfies readonly (keyof WaClientEventMap)[]

const NOISY_EVENT_NAMES: ReadonlySet<(typeof ALL_EVENT_NAMES)[number]> = new Set([
    'debug_transport_frame_in',
    'debug_transport_frame_out',
    'debug_transport_node_in',
    'debug_transport_node_out'
])

export interface BufferedEvent {
    readonly seq: number
    readonly type: string
    readonly timestampMs: number
    readonly payload: unknown
}

export type McpTransportMode = 'stdio' | 'http'

export interface RuntimeConfig {
    readonly authPath: string
    /**
     * Default session id. Tool calls that omit `session` resolve to this one,
     * and `lifecycle status` reports it as the default. Other session ids are
     * created lazily on first use (all sharing the one store at `authPath`).
     */
    readonly sessionId: string
    readonly logLevel: LogLevel
    readonly bufferSize: number
    /**
     * Upper bound on concurrently-live sessions in this process (bounded to
     * avoid unbounded `WaClient`/buffer growth from arbitrary tool-supplied
     * ids). Creating a session past this throws until one is destroyed.
     * Defaults to 16 when omitted.
     */
    readonly maxSessions?: number
    readonly captureNoisyEvents: boolean
    readonly deviceBrowser?: string
    readonly deviceOsDisplayName?: string
    readonly historyEnabled: boolean
    /** Max log entries kept in memory for the `logs` MCP tool. */
    readonly logBufferSize: number
    /** Optional file path that mirrors every log line as JSONL. */
    readonly logFilePath?: string
    /** Override the chat socket URL list (used when pointing at a fake server). */
    readonly chatSocketUrls?: readonly string[]
    /** Override the Noise root CA – required when pointing at a fake server. */
    readonly noiseRootCa?: { readonly publicKey: Uint8Array; readonly serial: number }
    /** Transport mode for the MCP server: stdio (default) or http (StreamableHTTP, useful with nodemon). */
    readonly transport: McpTransportMode
    /** HTTP listen host (only when transport=http). */
    readonly httpHost: string
    /** HTTP listen port (only when transport=http). */
    readonly httpPort: number
    /** HTTP path prefix for the MCP endpoint (only when transport=http). */
    readonly httpPath: string
}

/**
 * Builds a {@link RuntimeConfig} from the `MCP_*` environment variables.
 * Used by `bin.ts` to bootstrap a server without explicit wiring. Every
 * variable is optional - sensible defaults map to a local stdio MCP that
 * persists credentials to `.auth/state.sqlite` in the cwd.
 */
export const buildRuntimeConfigFromEnv = (env = process.env): RuntimeConfig => {
    const authPath = env.MCP_AUTH_PATH
        ? resolve(env.MCP_AUTH_PATH)
        : resolve(process.cwd(), '.auth', 'state.sqlite')
    const sessionId = env.MCP_SESSION_ID ?? 'default_2'
    const logLevel = resolveLogLevel(env.MCP_LOG_LEVEL)
    const bufferSize = parseEnvPositiveInt(
        env.MCP_EVENT_BUFFER_SIZE,
        'MCP_EVENT_BUFFER_SIZE',
        DEFAULT_BUFFER_SIZE
    )
    const maxSessions = parseEnvPositiveInt(
        env.MCP_MAX_SESSIONS,
        'MCP_MAX_SESSIONS',
        DEFAULT_MAX_SESSIONS
    )
    const captureNoisyEvents = env.MCP_CAPTURE_TRANSPORT === '1'
    const historyEnabled = env.MCP_HISTORY_DISABLED !== '1'
    const chatSocketUrls = parseUrlList(env.MCP_CHAT_SOCKET_URLS)
    const noiseRootCa = parseNoiseRootCa(env.MCP_FAKE_NOISE_PUBKEY_HEX, env.MCP_FAKE_NOISE_SERIAL)
    const logBufferSize = parseEnvPositiveInt(
        env.MCP_LOG_BUFFER_SIZE,
        'MCP_LOG_BUFFER_SIZE',
        DEFAULT_LOG_BUFFER_SIZE
    )
    const logFilePath = env.MCP_LOG_FILE ? resolve(env.MCP_LOG_FILE) : undefined
    const transport = parseTransportMode(env.MCP_TRANSPORT)
    const httpHost = env.MCP_HTTP_HOST ?? '127.0.0.1'
    const httpPort = parseEnvPositiveInt(env.MCP_HTTP_PORT, 'MCP_HTTP_PORT', 3737)
    const httpPath = env.MCP_HTTP_PATH ?? '/mcp'
    return {
        authPath,
        sessionId,
        logLevel,
        bufferSize,
        maxSessions,
        captureNoisyEvents,
        deviceBrowser: env.MCP_DEVICE_BROWSER,
        deviceOsDisplayName: env.MCP_DEVICE_OS_DISPLAY,
        historyEnabled,
        chatSocketUrls,
        noiseRootCa,
        logBufferSize,
        logFilePath,
        transport,
        httpHost,
        httpPort,
        httpPath
    }
}

const parseTransportMode = (raw: string | undefined): McpTransportMode => {
    if (raw === 'http') return 'http'
    if (raw === 'stdio' || raw === undefined || raw === '') return 'stdio'
    throw new Error(`MCP_TRANSPORT must be "stdio" or "http", got "${raw}"`)
}

const parseUrlList = (raw: string | undefined): readonly string[] | undefined => {
    if (!raw) return undefined
    const list = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    return list.length > 0 ? list : undefined
}

const parseNoiseRootCa = (
    pubkeyHex: string | undefined,
    serialRaw: string | undefined
): { publicKey: Uint8Array; serial: number } | undefined => {
    if (!pubkeyHex || !serialRaw) return undefined
    const cleaned = pubkeyHex.trim()
    if (cleaned.length === 0) return undefined
    const publicKey = hexToBytes(cleaned)
    const serial = Number.parseInt(serialRaw.trim(), 10)
    if (!Number.isFinite(serial)) {
        throw new Error('MCP_FAKE_NOISE_SERIAL must be a number')
    }
    return { publicKey, serial }
}

const resolveLogLevel = (raw: string | undefined): LogLevel => {
    switch (raw) {
        case 'trace':
        case 'debug':
        case 'info':
        case 'warn':
        case 'error':
            return raw
        default:
            return 'info'
    }
}

const parseEnvPositiveInt = (raw: string | undefined, name: string, fallback: number): number => {
    if (!raw) return fallback
    const parsed = Number.parseInt(raw, 10)
    return resolvePositive(Number.isFinite(parsed) ? parsed : Number.NaN, fallback, name)
}

/** Mutable per-session state held by {@link McpRuntime}. */
interface SessionState {
    readonly sessionId: string
    client: WaClient | null
    clientInitPromise: Promise<WaClient> | null
    listenersDetach: Array<() => void>
    readonly events: BufferedEvent[]
    nextEventSeq: number
}

/** Per-session snapshot surfaced by `lifecycle status`. */
export interface SessionSummary {
    readonly sessionId: string
    /** True for the session id tool calls resolve to when `session` is omitted. */
    readonly isDefault: boolean
    /** Whether a `WaClient` has been instantiated for this session. */
    readonly clientCreated: boolean
    /** Number of events currently buffered for this session. */
    readonly bufferedEvents: number
}

/**
 * Owns N `WaClient` sessions multiplexed over one shared `WaStore` (a single
 * backend / sqlite file at `config.authPath`), plus the per-session buffered
 * event rings and the shared, session-tagged log ring consumed by the
 * `events` / `logs` tools. One runtime per MCP server process.
 *
 * Sessions are created lazily: the first tool call referencing a session id
 * (or omitting it, which resolves to `config.sessionId`) spins up a client
 * bound to that id over the shared store. The store scopes every row by
 * session id, so distinct sessions never collide while sharing one connection.
 *
 * Most users won't construct this directly - use {@link runMcpServer}.
 */
export class McpRuntime {
    private readonly config: RuntimeConfig
    private readonly logger: BufferedTeeLogger
    private readonly maxSessions: number
    private store: WaStore | null = null
    private readonly sessions = new Map<string, SessionState>()

    public constructor(config: RuntimeConfig) {
        this.config = config
        this.maxSessions =
            config.maxSessions && config.maxSessions > 0 ? config.maxSessions : DEFAULT_MAX_SESSIONS
        this.logger = new BufferedTeeLogger(
            config.logLevel,
            config.logBufferSize,
            config.logFilePath
        )
    }

    public listLogs(
        filter: {
            readonly levels?: readonly LogLevel[]
            readonly since?: number
            readonly limit?: number
            readonly drain?: boolean
            readonly q?: string
            readonly regex?: boolean
            readonly session?: string
        } = {}
    ): readonly LogEntry[] {
        return this.logger.listLogs(filter)
    }

    public clearLogs(): number {
        return this.logger.clearLogs()
    }

    public bufferLogsSize(): number {
        return this.logger.bufferLogsSize()
    }

    public async closeLogFile(): Promise<void> {
        await this.logger.closeFile()
    }

    /**
     * Reset a session's event seq counter (and the shared log seq) back to 1.
     * Call after a soft restart wipes a session's buffers. Defaults to the
     * default session when `session` is omitted.
     */
    public resetSequences(session?: string): void {
        const state = this.peekSession(session)
        if (state) {
            state.nextEventSeq = 1
        }
        this.logger.resetSequence()
    }

    public getConfig(): RuntimeConfig {
        return this.config
    }

    public getLogger(): Logger {
        return this.logger
    }

    /** Resolve `session` to a non-empty id, defaulting to `config.sessionId`. */
    private resolveSessionId(session?: string): string {
        const id = (session ?? this.config.sessionId).trim()
        if (id.length === 0) {
            throw new Error('session must be a non-empty string')
        }
        return id
    }

    private getOrCreateSession(session?: string): SessionState {
        const id = this.resolveSessionId(session)
        const existing = this.sessions.get(id)
        if (existing) return existing
        if (this.sessions.size >= this.maxSessions) {
            throw new Error(
                `max sessions reached (${this.maxSessions}); destroy a session before creating "${id}"`
            )
        }
        const state: SessionState = {
            sessionId: id,
            client: null,
            clientInitPromise: null,
            listenersDetach: [],
            events: [],
            nextEventSeq: 1
        }
        this.sessions.set(id, state)
        return state
    }

    /** Look up an existing session without creating it. */
    private peekSession(session?: string): SessionState | null {
        return this.sessions.get(this.resolveSessionId(session)) ?? null
    }

    /** Snapshot of every live session, for `lifecycle status`. */
    public listSessions(): readonly SessionSummary[] {
        return Array.from(this.sessions.values(), (state) => ({
            sessionId: state.sessionId,
            isDefault: state.sessionId === this.config.sessionId,
            clientCreated: state.client !== null,
            bufferedEvents: state.events.length
        }))
    }

    /** Lazily build the one store shared by every session in this process. */
    private ensureStore(): WaStore {
        if (this.store) return this.store
        this.store = createStore({
            backends: {
                sqlite: createSqliteStore({
                    path: this.config.authPath,
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
                contacts: 'sqlite',
                privacyToken: 'sqlite'
            }
        })
        return this.store
    }

    public ensureClient(session?: string): Promise<WaClient> {
        const state = this.getOrCreateSession(session)
        if (state.client) {
            return Promise.resolve(state.client)
        }
        if (state.clientInitPromise) {
            return state.clientInitPromise
        }
        state.clientInitPromise = this.initClient(state).finally(() => {
            state.clientInitPromise = null
        })
        return state.clientInitPromise
    }

    private async initClient(state: SessionState): Promise<WaClient> {
        await mkdir(dirname(this.config.authPath), { recursive: true })
        const store = this.ensureStore()
        const sessionLogger = this.createSessionLogger(state.sessionId)
        // Mobile-registered credentials carry deviceInfo: pass mobileTransport so
        // the factory's mobilePrimary gating matches the transport auto-detection.
        const persisted = await store
            .session(state.sessionId)
            .auth.load()
            .catch(() => null)
        const mobileTransport =
            persisted?.deviceInfo !== undefined && persisted?.deviceInfo !== null
                ? { deviceInfo: persisted.deviceInfo, passive: false }
                : undefined
        const client = new WaClient(
            {
                store,
                sessionId: state.sessionId,
                ...(mobileTransport ? { mobileTransport } : {}),
                connectTimeoutMs: 60_000,
                deviceBrowser: this.config.deviceBrowser ?? 'Chrome',
                deviceOsDisplayName: this.config.deviceOsDisplayName ?? 'Windows',
                history: {
                    enabled: this.config.historyEnabled,
                    requireFullSync: true
                },
                nodeQueryTimeoutMs: 30_000,
                chatSocketUrls: this.config.chatSocketUrls,
                media: {
                    processor: createMediaProcessor()
                },
                testHooks: this.config.noiseRootCa
                    ? { noiseRootCa: this.config.noiseRootCa }
                    : undefined
            },
            sessionLogger
        )
        this.attachListeners(state, client)
        state.client = client
        this.logger.info('mcp client created', {
            session: state.sessionId,
            authPath: this.config.authPath
        })
        return client
    }

    /**
     * Returns a logger that tags every line with `context.session`. Lets
     * the `logs` tool scope by session while keeping a single ring buffer
     * (and a single optional log file).
     */
    private createSessionLogger(sessionId: string): Logger {
        return this.logger.child({ session: sessionId })
    }

    public getClient(session?: string): WaClient | null {
        return this.peekSession(session)?.client ?? null
    }

    /**
     * Disconnect + drop one session (default session when omitted): tear down
     * its client, detach listeners, and remove its state - freeing a
     * `maxSessions` slot and discarding its buffered events. The shared store
     * stays open for the other sessions; use {@link destroyAll} to tear the
     * whole runtime (store included) down.
     */
    public async destroyClient(session?: string): Promise<void> {
        const id = this.resolveSessionId(session)
        const state = this.sessions.get(id)
        if (!state) return
        await this.teardownSessionClient(state)
        this.sessions.delete(id)
    }

    /** Disconnect every session client and destroy the shared store. */
    public async destroyAll(): Promise<void> {
        for (const state of this.sessions.values()) {
            await this.teardownSessionClient(state)
        }
        this.sessions.clear()
        if (this.store) {
            try {
                await this.store.destroy()
            } catch (error) {
                this.logger.warn('store destroy failed', {
                    message: toError(error).message
                })
            }
            this.store = null
        }
    }

    private async teardownSessionClient(state: SessionState): Promise<void> {
        if (!state.client) return
        try {
            await state.client.disconnect()
        } catch (error) {
            this.logger.warn('disconnect during destroy failed', {
                session: state.sessionId,
                message: toError(error).message
            })
        }
        this.detachListeners(state)
        state.client = null
    }

    public listEvents(
        filter: {
            readonly types?: readonly string[]
            readonly since?: number
            readonly limit?: number
            readonly drain?: boolean
            readonly q?: string
            readonly regex?: boolean
        } = {},
        session?: string
    ): readonly BufferedEvent[] {
        const state = this.peekSession(session)
        if (!state) return []
        const events = state.events
        const types = filter.types && filter.types.length > 0 ? new Set(filter.types) : null
        const since = filter.since ?? 0
        const limit = filter.limit && filter.limit > 0 ? filter.limit : 50
        const matchQuery = buildQueryMatcher(filter.q ?? '', filter.regex === true)
        const matched: BufferedEvent[] = []
        for (let i = 0; i < events.length; i += 1) {
            const ev = events[i]
            if (ev.seq <= since) continue
            if (types && !types.has(ev.type)) continue
            if (!matchQuery(ev.type + ' ' + safeStringify(ev.payload))) continue
            matched.push(ev)
        }
        const tail = matched.length > limit ? matched.slice(matched.length - limit) : matched
        if (filter.drain && tail.length > 0) {
            const drainSet = new Set(tail.map((e) => e.seq))
            for (let i = events.length - 1; i >= 0; i -= 1) {
                if (drainSet.has(events[i].seq)) {
                    events.splice(i, 1)
                }
            }
        }
        return tail
    }

    public clearEvents(session?: string): number {
        const state = this.peekSession(session)
        if (!state) return 0
        const n = state.events.length
        state.events.length = 0
        return n
    }

    public bufferSize(session?: string): number {
        return this.peekSession(session)?.events.length ?? 0
    }

    private attachListeners(state: SessionState, client: WaClient): void {
        this.detachListeners(state)
        for (const name of ALL_EVENT_NAMES) {
            if (!this.config.captureNoisyEvents && NOISY_EVENT_NAMES.has(name)) {
                continue
            }
            const handler = (payload: unknown): void => {
                this.recordEvent(name, payload, state.sessionId)
            }
            client.on(name, handler)
            state.listenersDetach.push(() => {
                client.off(name, handler)
            })
        }
    }

    private detachListeners(state: SessionState): void {
        for (const detach of state.listenersDetach) {
            try {
                detach()
            } catch {
                /* ignore */
            }
        }
        state.listenersDetach = []
    }

    private recordEvent(type: string, rawPayload: unknown, session?: string): void {
        const state = this.getOrCreateSession(session)
        const seq = state.nextEventSeq
        state.nextEventSeq += 1
        const encoded = encodeForJson(rawPayload)
        const event: BufferedEvent = {
            seq,
            type,
            timestampMs: Date.now(),
            payload: encoded
        }
        state.events.push(event)
        const overflow = state.events.length - this.config.bufferSize
        if (overflow > 0) {
            state.events.splice(0, overflow)
        }
    }
}
