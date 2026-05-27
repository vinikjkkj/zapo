import * as ZapoLib from 'zapo-js'
import { toError } from 'zapo-js/util'

import type { McpRuntime } from './runtime'
import { decodeFromJson, encodeForJson } from './serializer'

export interface ToolDefinition {
    readonly name: string
    readonly description: string
    readonly inputSchema: Record<string, unknown>
    readonly handler: (input: unknown, runtime: McpRuntime) => Promise<unknown>
}

type Root = 'client' | 'lib'

const ROOT_VALUES: readonly Root[] = ['client', 'lib']

const resolveRoot = async (
    root: Root,
    runtime: McpRuntime
): Promise<{ readonly object: Record<string, unknown>; readonly label: string }> => {
    if (root === 'lib') {
        return { object: ZapoLib as unknown as Record<string, unknown>, label: 'zapo-js' }
    }
    const client = await runtime.ensureClient()
    return { object: client as unknown as Record<string, unknown>, label: 'WaClient' }
}

const parseRoot = (raw: unknown): Root => {
    if (raw === undefined || raw === null) return 'client'
    if (typeof raw === 'string' && (ROOT_VALUES as readonly string[]).includes(raw)) {
        return raw as Root
    }
    throw new Error(`"root" must be one of ${ROOT_VALUES.join(' | ')}`)
}

const callTool: ToolDefinition = {
    name: 'call',
    description:
        'Resolve a dotted path on a root object and either return the value or call it as a function with the given args. ' +
        'Roots: "client" (default) = WaClient instance; "lib" = the zapo-js module namespace ' +
        '(pure helpers like parsePhoneJid/isGroupJid/normalizeRecipientJid, the WA_* constants, the proto namespace at "proto.*", and createStore). ' +
        'Examples: { path: "connect" } -> client.connect(); { path: "group.create", args: [...] } -> client.group.create(...); ' +
        '{ root: "lib", path: "parsePhoneJid", args: ["+5511999999999"] }; ' +
        '{ root: "lib", path: "WA_DEFAULTS" } returns the constants object. ' +
        'Args are decoded recursively: { "$bytes": "<base64>" } -> Uint8Array, { "$bigint": "<digits>" } -> BigInt. ' +
        'Result is encoded the same way for transport. ' +
        'Pass `noAwait: true` to fire-and-forget when the function returns a long-running Promise (e.g. client.connect() blocks until pairing finishes); ' +
        'the tool returns immediately and you observe the outcome via `events`/`logs`.',
    inputSchema: {
        type: 'object',
        properties: {
            root: {
                type: 'string',
                enum: ['client', 'lib'],
                description:
                    '"client" (default) walks WaClient instance; "lib" walks the zapo-js module namespace (no client init needed).'
            },
            path: {
                type: 'string',
                description:
                    'Dotted property path. Examples: "sendMessage", "group.metadata", "proto.Message.create" (under root="lib").'
            },
            args: {
                type: 'array',
                description:
                    'Positional arguments. Each item is decoded (e.g. $bytes/$bigint markers).',
                items: {}
            },
            noAwait: {
                type: 'boolean',
                description:
                    'When true, invoke the function and return immediately without awaiting its Promise. Useful for client.connect() during pairing. Rejections are logged via the runtime logger.'
            }
        },
        required: ['path'],
        additionalProperties: false
    },
    handler: async (input, runtime) => {
        const { path, args, root, noAwait } = parseCallInput(input)
        const { object, label } = await resolveRoot(root, runtime)
        const { parent, value, lastKey } = resolvePath(object, path)
        if (typeof value === 'function') {
            const decoded = (decodeFromJson(args) as unknown[]) ?? []
            const invoked = (value as (...a: unknown[]) => unknown).apply(parent, decoded)
            if (noAwait) {
                if (invoked && typeof (invoked as Promise<unknown>).then === 'function') {
                    ;(invoked as Promise<unknown>).catch((error: unknown) => {
                        runtime.getLogger().warn('noAwait call rejected', {
                            path,
                            message: toError(error).message
                        })
                    })
                }
                return {
                    kind: 'call',
                    root,
                    rootLabel: label,
                    path,
                    arity: (value as { length?: number }).length ?? 0,
                    lastKey,
                    noAwait: true,
                    fired: true
                }
            }
            const result = await Promise.resolve(invoked)
            return {
                kind: 'call',
                root,
                rootLabel: label,
                path,
                arity: (value as { length?: number }).length ?? 0,
                lastKey,
                result: encodeForJson(result)
            }
        }
        return {
            kind: 'value',
            root,
            rootLabel: label,
            path,
            lastKey,
            value: encodeForJson(value)
        }
    }
}

const inspectTool: ToolDefinition = {
    name: 'inspect',
    description:
        'List the properties and methods reachable at a path on the chosen root. ' +
        'Roots: "client" (default) = WaClient instance + coordinators; "lib" = the zapo-js module namespace ' +
        '(use { root: "lib" } to see exported helpers, WA_* constants, "proto", "createStore", etc.). ' +
        'Returns own + inherited members up to (but excluding) Object.prototype, with origin class name.',
    inputSchema: {
        type: 'object',
        properties: {
            root: {
                type: 'string',
                enum: ['client', 'lib'],
                description:
                    '"client" (default) inspects WaClient; "lib" inspects the zapo-js module namespace.'
            },
            path: {
                type: 'string',
                description: 'Dotted path. Empty/omitted = the root itself.'
            },
            includeEventEmitter: {
                type: 'boolean',
                description:
                    'Include EventEmitter-inherited methods (on/off/emit/etc). Default false.'
            }
        },
        additionalProperties: false
    },
    handler: async (input, runtime) => {
        const { path, includeEventEmitter, root } = parseInspectInput(input)
        const { object, label } = await resolveRoot(root, runtime)
        const { value } = resolvePath(object, path)
        if (value === null || value === undefined) {
            return { root, rootLabel: label, path, value: encodeForJson(value), members: [] }
        }
        if (typeof value !== 'object' && typeof value !== 'function') {
            return { root, rootLabel: label, path, scalar: encodeForJson(value), members: [] }
        }
        const members = collectMembers(value, includeEventEmitter)
        return {
            root,
            rootLabel: label,
            path,
            constructorName: getConstructorName(value),
            memberCount: members.length,
            members
        }
    }
}

const eventsTool: ToolDefinition = {
    name: 'events',
    description:
        'Read recent buffered WaClient events. Filter by types and/or sequence id. ' +
        'Use this to wait for QR codes, pairing codes, incoming messages, group events, etc. ' +
        'Each event has a monotonic seq – pass `since: <seq>` next call to fetch only newer ones. ' +
        'Use `q` for case-insensitive substring search across `type + JSON.stringify(payload)`; ' +
        '`regex: true` to treat `q` as a regex pattern (case-insensitive).',
    inputSchema: {
        type: 'object',
        properties: {
            types: {
                type: 'array',
                items: { type: 'string' },
                description:
                    'Event type filter, e.g. ["auth_qr","auth_pairing_code","connection","message"]. Empty/omitted = all types.'
            },
            since: {
                type: 'number',
                description: 'Return only events with seq > since.'
            },
            limit: {
                type: 'number',
                description: 'Max events to return (default 50).'
            },
            drain: {
                type: 'boolean',
                description: 'If true, returned events are removed from the buffer.'
            },
            q: {
                type: 'string',
                description:
                    'Filter by substring (case-insensitive) of the event type + stringified payload.'
            },
            regex: {
                type: 'boolean',
                description: 'Treat `q` as a regex pattern (case-insensitive).'
            }
        },
        additionalProperties: false
    },
    handler: async (input, runtime) => {
        const filter = parseEventsInput(input)
        const events = runtime.listEvents(filter)
        return {
            count: events.length,
            bufferSize: runtime.bufferSize(),
            events
        }
    }
}

const eventsClearTool: ToolDefinition = {
    name: 'events_clear',
    description: 'Clear the entire event buffer. Returns the number of events dropped.',
    inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
    },
    handler: async (_input, runtime) => {
        const dropped = runtime.clearEvents()
        return { dropped }
    }
}

const VALID_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const

const logsTool: ToolDefinition = {
    name: 'logs',
    description:
        'Read recent buffered log entries from the WaClient/MCP runtime logger. ' +
        'Each entry has a monotonic seq, timestampMs, level, message and optional context object. ' +
        'Pass `since: <seq>` to fetch only newer entries on the next call. ' +
        'Logs are also written to stderr and (if MCP_LOG_FILE is set) appended to that file as JSONL. ' +
        'Use `q` for case-insensitive substring search across the message + stringified context; ' +
        '`regex: true` to treat `q` as a regex pattern (case-insensitive).',
    inputSchema: {
        type: 'object',
        properties: {
            levels: {
                type: 'array',
                items: { type: 'string', enum: VALID_LOG_LEVELS as unknown as string[] },
                description: 'Filter by levels, e.g. ["warn","error"]. Empty/omitted = all.'
            },
            since: {
                type: 'number',
                description: 'Return only entries with seq > since.'
            },
            limit: {
                type: 'number',
                description: 'Max entries to return (default 100).'
            },
            drain: {
                type: 'boolean',
                description: 'If true, returned entries are removed from the buffer.'
            },
            q: {
                type: 'string',
                description:
                    'Substring (case-insensitive) matched against `message + JSON.stringify(context)`.'
            },
            regex: {
                type: 'boolean',
                description: 'Treat `q` as a regex pattern (case-insensitive).'
            }
        },
        additionalProperties: false
    },
    handler: async (input, runtime) => {
        const filter = parseLogsInput(input)
        const logs = runtime.listLogs(filter)
        return {
            count: logs.length,
            bufferSize: runtime.bufferLogsSize(),
            logs
        }
    }
}

const logsClearTool: ToolDefinition = {
    name: 'logs_clear',
    description:
        'Clear the entire log buffer (stderr + log file are unaffected). Returns the number of entries dropped.',
    inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
    },
    handler: async (_input, runtime) => {
        const dropped = runtime.clearLogs()
        return { dropped }
    }
}

const RESTART_MODES = ['soft', 'process_exit'] as const

const restartTool: ToolDefinition = {
    name: 'restart',
    description:
        'Restart the runtime state. ' +
        '"soft" (default): disconnect + drop the WaClient, clear the event and log buffers, ' +
        'reset their seq counters; the process stays alive, and the next tool call recreates ' +
        'everything from the same config – code changes loaded into the Node module cache ' +
        'are NOT picked up. ' +
        '"process_exit": same cleanup, then exit the process with code 0 so a supervisor ' +
        '(nodemon, Claude Code respawn-on-reconnect, etc.) starts a fresh process. With no ' +
        'supervisor, the caller must reconnect the MCP server manually (e.g. /mcp in Claude ' +
        'Code) for the next tool call to land. The exit is scheduled ~150ms after the response ' +
        'is sent so the JSON-RPC reply has time to flush.',
    inputSchema: {
        type: 'object',
        properties: {
            mode: {
                type: 'string',
                enum: RESTART_MODES as unknown as string[],
                description:
                    '"soft" (default) keeps the process; "process_exit" terminates the process so a supervisor can respawn it.'
            }
        },
        additionalProperties: false
    },
    handler: async (input, runtime) => {
        const mode = parseRestartInput(input)
        const eventsBefore = runtime.bufferSize()
        const logsBefore = runtime.bufferLogsSize()
        await runtime.destroyClient()
        runtime.clearEvents()
        runtime.clearLogs()
        runtime.resetSequences()

        if (mode === 'process_exit') {
            setTimeout(() => {
                runtime
                    .closeLogFile()
                    .catch(() => undefined)
                    .finally(() => process.exit(0))
            }, 150)
            return {
                ok: true,
                mode,
                eventsCleared: eventsBefore,
                logsCleared: logsBefore,
                note: 'process will exit ~150ms after this response; reconnect the MCP transport for the next tool call'
            }
        }
        return {
            ok: true,
            mode,
            eventsCleared: eventsBefore,
            logsCleared: logsBefore
        }
    }
}

const lifecycleTool: ToolDefinition = {
    name: 'lifecycle',
    description:
        'Manage the underlying WaClient instance. Actions: ' +
        '"status" reports config + whether client is created, ' +
        '"start" creates the client (no connect), ' +
        '"destroy" disconnects + drops the client (next call recreates it).',
    inputSchema: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['status', 'start', 'destroy']
            }
        },
        required: ['action'],
        additionalProperties: false
    },
    handler: async (input, runtime) => {
        const action = parseLifecycleInput(input)
        switch (action) {
            case 'status': {
                const client = runtime.getClient()
                let state: unknown = null
                if (client) {
                    try {
                        state = client.getState()
                    } catch (error) {
                        state = { error: toError(error).message }
                    }
                }
                return {
                    config: runtime.getConfig(),
                    clientCreated: client !== null,
                    state: encodeForJson(state),
                    bufferSize: runtime.bufferSize()
                }
            }
            case 'start': {
                await runtime.ensureClient()
                return { ok: true }
            }
            case 'destroy': {
                await runtime.destroyClient()
                return { ok: true }
            }
        }
    }
}

const AsyncFunctionCtor = Object.getPrototypeOf(async function () {}).constructor as new (
    ...args: string[]
) => (client: unknown, lib: unknown) => Promise<unknown>

const evalTool: ToolDefinition = {
    name: 'eval',
    description:
        'Execute arbitrary JS in the MCP runtime with `client` (WaClient instance) and `lib` ' +
        '(zapo-js module namespace) in scope. **Disabled by default**: requires ' +
        '`MCP_EVAL_ENABLED=1` in the MCP process env, otherwise every call is rejected. ' +
        'The source is wrapped in an async function – top-level `await` works. ' +
        'Use `return <expr>` to surface a value; the result is encoded for JSON ' +
        '($bytes / $bigint markers). Use `globalThis.<key> = ...` to persist state between ' +
        'eval calls (e.g. stash an unregister callback returned by registerIncomingStanzaFilter). ' +
        'When `noAwait: true`, fire-and-forget – the call returns immediately and rejections ' +
        'go to the runtime logger.',
    inputSchema: {
        type: 'object',
        properties: {
            source: {
                type: 'string',
                description:
                    'JavaScript statements. Wrapped as `async function (client, lib) { <source> }`.'
            },
            noAwait: {
                type: 'boolean',
                description: 'Fire-and-forget mode. Defaults to false.'
            }
        },
        required: ['source'],
        additionalProperties: false
    },
    handler: async (input, runtime) => {
        if (process.env.MCP_EVAL_ENABLED !== '1') {
            throw new Error(
                'eval tool is disabled; set MCP_EVAL_ENABLED=1 in the MCP process env to enable'
            )
        }
        const { source, noAwait } = parseEvalInput(input)
        const client = await runtime.ensureClient()
        const fn = new AsyncFunctionCtor('client', 'lib', source)
        const invoked = fn(client, ZapoLib)
        if (noAwait) {
            invoked.catch((error: unknown) => {
                runtime.getLogger().warn('eval noAwait rejected', {
                    message: toError(error).message
                })
            })
            return { kind: 'eval', noAwait: true, fired: true }
        }
        const result = await invoked
        return { kind: 'eval', result: encodeForJson(result) }
    }
}

export const TOOLS: readonly ToolDefinition[] = Object.freeze([
    callTool,
    inspectTool,
    eventsTool,
    eventsClearTool,
    logsTool,
    logsClearTool,
    lifecycleTool,
    restartTool,
    evalTool
])

const parseCallInput = (
    input: unknown
): { path: string; args: unknown[]; root: Root; noAwait: boolean } => {
    if (!input || typeof input !== 'object') {
        throw new Error('call: input must be an object')
    }
    const obj = input as Record<string, unknown>
    if (typeof obj.path !== 'string' || obj.path.length === 0) {
        throw new Error('call: "path" must be a non-empty string')
    }
    const args = Array.isArray(obj.args) ? (obj.args as unknown[]) : []
    const root = parseRoot(obj.root)
    const noAwait = obj.noAwait === true
    return { path: obj.path, args, root, noAwait }
}

const parseInspectInput = (
    input: unknown
): { path: string; includeEventEmitter: boolean; root: Root } => {
    const obj = (input ?? {}) as Record<string, unknown>
    const path = typeof obj.path === 'string' ? obj.path : ''
    const includeEventEmitter = obj.includeEventEmitter === true
    const root = parseRoot(obj.root)
    return { path, includeEventEmitter, root }
}

const parseEventsInput = (
    input: unknown
): {
    types?: readonly string[]
    since?: number
    limit?: number
    drain?: boolean
    q?: string
    regex?: boolean
} => {
    const obj = (input ?? {}) as Record<string, unknown>
    const types =
        Array.isArray(obj.types) && obj.types.every((t) => typeof t === 'string')
            ? obj.types
            : undefined
    const since = typeof obj.since === 'number' ? obj.since : undefined
    const limit = typeof obj.limit === 'number' ? obj.limit : undefined
    const drain = obj.drain === true
    const q = typeof obj.q === 'string' ? obj.q : undefined
    const regex = obj.regex === true
    return { types, since, limit, drain, q, regex }
}

const parseLogsInput = (
    input: unknown
): {
    levels?: readonly ('trace' | 'debug' | 'info' | 'warn' | 'error')[]
    since?: number
    limit?: number
    drain?: boolean
    q?: string
    regex?: boolean
} => {
    const obj = (input ?? {}) as Record<string, unknown>
    let levels: readonly ('trace' | 'debug' | 'info' | 'warn' | 'error')[] | undefined
    if (Array.isArray(obj.levels)) {
        const filtered: ('trace' | 'debug' | 'info' | 'warn' | 'error')[] = []
        for (const candidate of obj.levels) {
            if (
                candidate === 'trace' ||
                candidate === 'debug' ||
                candidate === 'info' ||
                candidate === 'warn' ||
                candidate === 'error'
            ) {
                filtered.push(candidate)
            } else {
                throw new Error(`logs: invalid level "${String(candidate)}"`)
            }
        }
        levels = filtered.length > 0 ? filtered : undefined
    }
    const since = typeof obj.since === 'number' ? obj.since : undefined
    const limit = typeof obj.limit === 'number' ? obj.limit : undefined
    const drain = obj.drain === true
    const q = typeof obj.q === 'string' ? obj.q : undefined
    const regex = obj.regex === true
    return { levels, since, limit, drain, q, regex }
}

const parseLifecycleInput = (input: unknown): 'status' | 'start' | 'destroy' => {
    const obj = (input ?? {}) as Record<string, unknown>
    if (obj.action === 'status' || obj.action === 'start' || obj.action === 'destroy') {
        return obj.action
    }
    throw new Error('lifecycle: "action" must be "status" | "start" | "destroy"')
}

const parseEvalInput = (input: unknown): { source: string; noAwait: boolean } => {
    if (!input || typeof input !== 'object') {
        throw new Error('eval: input must be an object')
    }
    const obj = input as Record<string, unknown>
    if (typeof obj.source !== 'string' || obj.source.length === 0) {
        throw new Error('eval: "source" must be a non-empty string')
    }
    return { source: obj.source, noAwait: obj.noAwait === true }
}

const parseRestartInput = (input: unknown): 'soft' | 'process_exit' => {
    const obj = (input ?? {}) as Record<string, unknown>
    if (obj.mode === undefined || obj.mode === null) return 'soft'
    if (obj.mode === 'soft' || obj.mode === 'process_exit') return obj.mode
    throw new Error(`restart: "mode" must be one of ${RESTART_MODES.join(' | ')}`)
}

const resolvePath = (
    root: Record<string, unknown>,
    path: string
): { parent: unknown; value: unknown; lastKey: string | null } => {
    if (path.length === 0) {
        return { parent: null, value: root, lastKey: null }
    }
    const parts = path.split('.')
    let parent: unknown = null
    let current: unknown = root
    let lastKey: string | null = null
    for (let i = 0; i < parts.length; i += 1) {
        const key = parts[i]
        if (key.length === 0) {
            throw new Error(`path: empty segment at index ${i} in "${path}"`)
        }
        if (FORBIDDEN_PATH_SEGMENTS.has(key)) {
            throw new Error(
                `path: segment "${key}" at index ${i} is not allowed (prototype-chain traversal)`
            )
        }
        if (current === null || current === undefined) {
            throw new Error(
                `path: cannot read "${key}" on null/undefined at "${parts.slice(0, i).join('.')}"`
            )
        }
        parent = current
        current = (current as Record<string, unknown>)[key]
        lastKey = key
    }
    return { parent, value: current, lastKey }
}

/**
 * Walking arbitrary string keys against a JS object would happily traverse the
 * prototype chain – `__proto__`, `constructor`, `prototype` are all accessible
 * and dangerous (prototype pollution, escape from intended object surface).
 * The runtime is local-only today but the HTTP transport could be exposed,
 * so block these keys at the resolver.
 */
const FORBIDDEN_PATH_SEGMENTS: ReadonlySet<string> = new Set([
    '__proto__',
    'prototype',
    'constructor'
])

interface MemberDescriptor {
    readonly name: string
    readonly kind: 'function' | 'getter' | 'value'
    readonly origin: string
    readonly arity?: number
    readonly typeOf?: string
}

const collectMembers = (
    target: object,
    includeEventEmitter: boolean
): readonly MemberDescriptor[] => {
    const seen = new Set<string>()
    const out: MemberDescriptor[] = []
    let current: object | null = target
    let originName = getConstructorName(target)
    while (current !== null && current !== Object.prototype && current !== Function.prototype) {
        const isProtoLayer = current !== target
        if (isProtoLayer) {
            originName = getConstructorName(current)
        }
        if (!includeEventEmitter && originName === 'EventEmitter') {
            current = Object.getPrototypeOf(current) as object | null
            continue
        }
        const descriptors = Object.getOwnPropertyDescriptors(current)
        for (const name of Object.keys(descriptors)) {
            if (name === 'constructor') continue
            if (name.startsWith('_')) continue
            if (seen.has(name)) continue
            seen.add(name)
            const desc = descriptors[name]
            if (typeof desc.get === 'function' && typeof desc.value === 'undefined') {
                out.push({ name, kind: 'getter', origin: originName })
                continue
            }
            const value = (current as Record<string, unknown>)[name]
            if (typeof value === 'function') {
                out.push({
                    name,
                    kind: 'function',
                    origin: originName,
                    arity: (value as { length?: number }).length ?? 0
                })
            } else {
                out.push({
                    name,
                    kind: 'value',
                    origin: originName,
                    typeOf: typeof value
                })
            }
        }
        current = Object.getPrototypeOf(current) as object | null
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
}

const getConstructorName = (obj: object): string => {
    const ctor = (obj as { constructor?: { name?: string } }).constructor
    return ctor?.name ?? 'Object'
}
