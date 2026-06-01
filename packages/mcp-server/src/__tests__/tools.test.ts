import assert from 'node:assert/strict'
import test from 'node:test'

import type { BufferedEvent, LogEntry, McpRuntime, RuntimeConfig } from '../runtime'
import { TOOLS } from '../tools'

class FakeClient {
    public greet(name: string): string {
        return `hello ${name}`
    }

    public async multiply(a: number, b: number): Promise<number> {
        return a * b
    }

    public roundtrip(bytes: Uint8Array): Uint8Array {
        const out = new Uint8Array(bytes.length)
        for (let i = 0; i < bytes.length; i += 1) {
            out[i] = bytes[i]
        }
        return out
    }

    public get group(): {
        create(
            name: string,
            members: readonly string[]
        ): { name: string; members: readonly string[] }
    } {
        return {
            create: (name, members) => ({ name, members })
        }
    }

    public readonly options = { timeout: 1000, retries: 3 }

    public throwIt(): never {
        throw new Error('boom')
    }
}

interface SpyableFakeRuntime extends McpRuntime {
    readonly __lastEventsFilter: { value: Record<string, unknown> | null }
    readonly __lastLogsFilter: { value: Record<string, unknown> | null }
    __pushLog(entry: LogEntry): void
    __pushEvent(entry: BufferedEvent): void
}

const buildFakeRuntime = (client: FakeClient): SpyableFakeRuntime => {
    const events: BufferedEvent[] = []
    const logs: LogEntry[] = []
    const lastEventsFilter = { value: null as Record<string, unknown> | null }
    const lastLogsFilter = { value: null as Record<string, unknown> | null }
    const config: RuntimeConfig = {
        authPath: '/tmp/test.sqlite',
        sessionId: 'test',
        logLevel: 'error',
        bufferSize: 100,
        captureNoisyEvents: false,
        historyEnabled: false,
        logBufferSize: 100,
        transport: 'stdio',
        httpHost: '127.0.0.1',
        httpPort: 0,
        httpPath: '/mcp'
    }
    const fake = {
        getConfig: () => config,
        getLogger: () => ({
            trace() {},
            debug() {},
            info() {},
            warn() {},
            error() {}
        }),
        ensureClient: async () => client,
        getClient: () => client,
        async destroyClient() {},
        listEvents: (filter: Record<string, unknown> = {}) => {
            lastEventsFilter.value = filter
            return events
        },
        clearEvents: () => {
            const n = events.length
            events.length = 0
            return n
        },
        bufferSize: () => events.length,
        listLogs: (
            filter: {
                since?: number
                limit?: number
                levels?: readonly string[]
                drain?: boolean
                q?: string
                regex?: boolean
            } = {}
        ) => {
            lastLogsFilter.value = filter
            const lvSet = filter.levels && filter.levels.length > 0 ? new Set(filter.levels) : null
            const since = filter.since ?? 0
            const limit = filter.limit && filter.limit > 0 ? filter.limit : 100
            const matched = logs.filter((e) => e.seq > since && (!lvSet || lvSet.has(e.level)))
            const tail = matched.length > limit ? matched.slice(matched.length - limit) : matched
            if (filter.drain) {
                const seqs = new Set(tail.map((e) => e.seq))
                for (let i = logs.length - 1; i >= 0; i -= 1) {
                    if (seqs.has(logs[i].seq)) logs.splice(i, 1)
                }
            }
            return tail
        },
        clearLogs: () => {
            const n = logs.length
            logs.length = 0
            return n
        },
        bufferLogsSize: () => logs.length,
        async closeLogFile() {},
        resetSequences: () => undefined,
        listSessions: () => [],
        // test-only helpers: push synthetic entries + read last filter
        __pushLog: (entry: LogEntry) => {
            logs.push(entry)
        },
        __pushEvent: (entry: BufferedEvent) => {
            events.push(entry)
        },
        __lastEventsFilter: lastEventsFilter,
        __lastLogsFilter: lastLogsFilter
    }
    return fake as unknown as SpyableFakeRuntime
}

const findTool = (name: string) => {
    const tool = TOOLS.find((t) => t.name === name)
    if (!tool) throw new Error(`tool ${name} not found`)
    return tool
}

test('call tool invokes a top-level method with positional args', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('call')
    const result = (await tool.handler({ path: 'greet', args: ['world'] }, runtime)) as {
        kind: string
        result: unknown
    }
    assert.equal(result.kind, 'call')
    assert.equal(result.result, 'hello world')
})

test('call tool awaits returned promises and roundtrips Uint8Array', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('call')
    const productResult = (await tool.handler({ path: 'multiply', args: [6, 7] }, runtime)) as {
        result: unknown
    }
    assert.equal(productResult.result, 42)

    const bytesResult = (await tool.handler(
        { path: 'roundtrip', args: [{ $bytes: 'AQID' }] },
        runtime
    )) as { result: { $bytes: string } }
    assert.equal(bytesResult.result.$bytes, 'AQID')
})

test('call tool walks dotted paths into nested objects', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('call')
    const result = (await tool.handler(
        { path: 'group.create', args: ['my-group', ['a@s', 'b@s']] },
        runtime
    )) as { result: { name: string; members: string[] } }
    assert.equal(result.result.name, 'my-group')
    assert.deepStrictEqual(result.result.members, ['a@s', 'b@s'])
})

test('call tool returns non-function values without invoking them', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('call')
    const result = (await tool.handler({ path: 'options' }, runtime)) as {
        kind: string
        value: unknown
    }
    assert.equal(result.kind, 'value')
    assert.deepStrictEqual(result.value, { timeout: 1000, retries: 3 })
})

test('call tool rejects empty path', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('call')
    await assert.rejects(() => tool.handler({ path: '' }, runtime), /non-empty string/)
})

test('inspect tool lists methods and getters by origin class', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('inspect')
    const result = (await tool.handler({}, runtime)) as {
        constructorName: string
        members: { name: string; kind: string; origin: string }[]
    }
    assert.equal(result.constructorName, 'FakeClient')
    const greet = result.members.find((m) => m.name === 'greet')
    assert.ok(greet)
    assert.equal(greet.kind, 'function')
    assert.equal(greet.origin, 'FakeClient')
    const groupMember = result.members.find((m) => m.name === 'group')
    assert.ok(groupMember)
    assert.equal(groupMember.kind, 'getter')
})

test('inspect tool walks into a coordinator path', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('inspect')
    const result = (await tool.handler({ path: 'group' }, runtime)) as {
        members: { name: string }[]
    }
    const create = result.members.find((m) => m.name === 'create')
    assert.ok(create)
})

test('lifecycle status returns config and clientCreated flag', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('lifecycle')
    const result = (await tool.handler({ action: 'status' }, runtime)) as {
        clientCreated: boolean
        config: { sessionId: string }
    }
    assert.equal(result.clientCreated, true)
    assert.equal(result.config.sessionId, 'test')
})

test('lifecycle rejects unknown actions', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('lifecycle')
    await assert.rejects(() => tool.handler({ action: 'nope' }, runtime), /status.*start.*destroy/)
})

test('call tool with root=lib invokes a pure helper without touching client', async () => {
    let ensureCalls = 0
    const proxy = new Proxy(
        {},
        {
            get() {
                return undefined
            }
        }
    )
    const runtime = buildFakeRuntime(proxy as never)
    const original = (runtime as unknown as { ensureClient: () => Promise<unknown> }).ensureClient
    ;(runtime as unknown as { ensureClient: () => Promise<unknown> }).ensureClient = async () => {
        ensureCalls += 1
        return original.call(runtime)
    }
    const tool = findTool('call')
    const result = (await tool.handler(
        { root: 'lib', path: 'isGroupJid', args: ['12345-67@g.us'] },
        runtime
    )) as { result: unknown; rootLabel: string }
    assert.equal(result.result, true)
    assert.equal(result.rootLabel, 'zapo-js')
    assert.equal(ensureCalls, 0)
})

test('call tool with root=lib reads a constant and walks proto', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('call')
    const constResult = (await tool.handler({ root: 'lib', path: 'WA_DEFAULTS' }, runtime)) as {
        kind: string
        value: Record<string, unknown>
    }
    assert.equal(constResult.kind, 'value')
    assert.equal(typeof constResult.value, 'object')
    assert.ok(constResult.value !== null)

    const protoResult = (await tool.handler({ root: 'lib', path: 'proto' }, runtime)) as {
        value: object
    }
    assert.equal(typeof protoResult.value, 'object')
})

test('inspect tool with root=lib lists module exports', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('inspect')
    const result = (await tool.handler({ root: 'lib' }, runtime)) as {
        members: { name: string; kind: string }[]
        rootLabel: string
    }
    assert.equal(result.rootLabel, 'zapo-js')
    const names = new Set(result.members.map((m) => m.name))
    assert.ok(names.has('WaClient'))
    assert.ok(names.has('createStore'))
    assert.ok(names.has('parsePhoneJid'))
    assert.ok(names.has('proto'))
})

test('parseRoot rejects invalid root values', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('call')
    await assert.rejects(
        () => tool.handler({ root: 'banana', path: 'foo' }, runtime),
        /one of client \| lib/
    )
})

test('logs tool returns entries filtered by level and since', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const push = (runtime as unknown as { __pushLog: (e: LogEntry) => void }).__pushLog
    push({ seq: 1, timestampMs: 1, level: 'info', message: 'hello', context: null })
    push({ seq: 2, timestampMs: 2, level: 'warn', message: 'careful', context: null })
    push({ seq: 3, timestampMs: 3, level: 'error', message: 'broken', context: { code: 42 } })

    const tool = findTool('logs')
    const all = (await tool.handler({}, runtime)) as { count: number; logs: LogEntry[] }
    assert.equal(all.count, 3)

    const onlyErrors = (await tool.handler({ levels: ['warn', 'error'] }, runtime)) as {
        logs: LogEntry[]
    }
    assert.equal(onlyErrors.logs.length, 2)
    assert.deepStrictEqual(
        onlyErrors.logs.map((l) => l.level),
        ['warn', 'error']
    )

    const newer = (await tool.handler({ since: 1 }, runtime)) as { logs: LogEntry[] }
    assert.deepStrictEqual(
        newer.logs.map((l) => l.seq),
        [2, 3]
    )
})

test('logs tool with drain removes returned entries', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const push = (runtime as unknown as { __pushLog: (e: LogEntry) => void }).__pushLog
    push({ seq: 1, timestampMs: 1, level: 'info', message: 'a', context: null })
    push({ seq: 2, timestampMs: 2, level: 'info', message: 'b', context: null })

    const tool = findTool('logs')
    const drained = (await tool.handler({ drain: true }, runtime)) as {
        count: number
        bufferSize: number
    }
    assert.equal(drained.count, 2)
    assert.equal(drained.bufferSize, 0)
})

test('logs tool rejects invalid levels', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('logs')
    await assert.rejects(() => tool.handler({ levels: ['fatal'] }, runtime), /invalid level/)
})

test('logs tool forwards q and regex to runtime.listLogs', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('logs')
    await tool.handler({ q: 'boom', regex: true, limit: 5 }, runtime)
    const captured = runtime.__lastLogsFilter.value
    assert.ok(captured, 'logs filter must be captured')
    assert.equal(captured.q, 'boom')
    assert.equal(captured.regex, true)
    assert.equal(captured.limit, 5)
})

test('logs tool omits q/regex when not provided', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('logs')
    await tool.handler({}, runtime)
    const captured = runtime.__lastLogsFilter.value
    assert.ok(captured)
    assert.equal(captured.q, undefined)
    assert.equal(captured.regex, false)
})

test('events tool forwards q and regex to runtime.listEvents', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('events')
    await tool.handler({ q: '3EB0', regex: true, types: ['message'] }, runtime)
    const captured = runtime.__lastEventsFilter.value
    assert.ok(captured, 'events filter must be captured')
    assert.equal(captured.q, '3EB0')
    assert.equal(captured.regex, true)
    assert.deepStrictEqual(captured.types, ['message'])
})

test('events tool omits q/regex when not provided', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('events')
    await tool.handler({}, runtime)
    const captured = runtime.__lastEventsFilter.value
    assert.ok(captured)
    assert.equal(captured.q, undefined)
    assert.equal(captured.regex, false)
})

test('logs_clear tool drops every entry', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const push = (runtime as unknown as { __pushLog: (e: LogEntry) => void }).__pushLog
    push({ seq: 1, timestampMs: 1, level: 'info', message: 'a', context: null })
    push({ seq: 2, timestampMs: 2, level: 'info', message: 'b', context: null })

    const tool = findTool('logs_clear')
    const result = (await tool.handler({}, runtime)) as { dropped: number }
    assert.equal(result.dropped, 2)
    assert.equal(runtime.bufferLogsSize(), 0)
})

test('restart tool soft mode destroys client + clears buffers', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const fake = runtime as unknown as {
        __pushLog: (e: LogEntry) => void
        __pushEvent: (e: BufferedEvent) => void
    }
    // Seed both buffers + force destroyClient/resetSequences accounting.
    fake.__pushLog?.({ seq: 1, timestampMs: 1, level: 'info', message: 'a', context: null })
    fake.__pushEvent?.({ seq: 1, type: 'message', timestampMs: 1, payload: {} })

    const tool = findTool('restart')
    const result = (await tool.handler({}, runtime)) as {
        ok: boolean
        mode: string
        eventsCleared: number
        logsCleared: number
    }
    assert.equal(result.ok, true)
    assert.equal(result.mode, 'soft')
    assert.equal(runtime.bufferSize(), 0)
    assert.equal(runtime.bufferLogsSize(), 0)
})

test('restart tool rejects invalid mode', async () => {
    const runtime = buildFakeRuntime(new FakeClient())
    const tool = findTool('restart')
    await assert.rejects(() => tool.handler({ mode: 'hard' }, runtime), /soft \| process_exit/)
})

const withEvalEnabled = async (run: () => Promise<void>): Promise<void> => {
    const prev = process.env.MCP_EVAL_ENABLED
    process.env.MCP_EVAL_ENABLED = '1'
    try {
        await run()
    } finally {
        if (prev === undefined) {
            delete process.env.MCP_EVAL_ENABLED
        } else {
            process.env.MCP_EVAL_ENABLED = prev
        }
    }
}

test('eval tool runs source with client + lib in scope and encodes result', async () => {
    await withEvalEnabled(async () => {
        const runtime = buildFakeRuntime(new FakeClient())
        const tool = findTool('eval')
        const result = (await tool.handler(
            { source: 'return await client.multiply(6, 7)' },
            runtime
        )) as { kind: string; result: unknown }
        assert.equal(result.kind, 'eval')
        assert.equal(result.result, 42)

        const libResult = (await tool.handler(
            { source: 'return typeof lib.parsePhoneJid' },
            runtime
        )) as { result: unknown }
        assert.equal(libResult.result, 'function')

        const bytesResult = (await tool.handler(
            { source: 'return await client.roundtrip(new Uint8Array([1,2,3]))' },
            runtime
        )) as { result: { $bytes: string } }
        assert.equal(bytesResult.result.$bytes, 'AQID')
    })
})

test('eval tool rejects empty source', async () => {
    await withEvalEnabled(async () => {
        const runtime = buildFakeRuntime(new FakeClient())
        const tool = findTool('eval')
        await assert.rejects(() => tool.handler({ source: '' }, runtime), /non-empty string/)
        await assert.rejects(() => tool.handler({}, runtime), /non-empty string/)
    })
})

test('eval tool fires async source without awaiting when noAwait is set', async () => {
    await withEvalEnabled(async () => {
        const runtime = buildFakeRuntime(new FakeClient())
        const tool = findTool('eval')
        const result = (await tool.handler(
            { source: 'globalThis.__evalStash = await client.multiply(3, 4)', noAwait: true },
            runtime
        )) as { kind: string; noAwait: boolean; fired: boolean }
        assert.equal(result.kind, 'eval')
        assert.equal(result.noAwait, true)
        assert.equal(result.fired, true)
        // Allow the microtask queue to drain so the noAwait promise can mutate globalThis.
        await new Promise((resolve) => setImmediate(resolve))
        const stashed = (globalThis as Record<string, unknown>).__evalStash
        assert.equal(stashed, 12)
        delete (globalThis as Record<string, unknown>).__evalStash
    })
})

test('eval tool is disabled unless MCP_EVAL_ENABLED=1', async () => {
    const prev = process.env.MCP_EVAL_ENABLED
    delete process.env.MCP_EVAL_ENABLED
    try {
        const runtime = buildFakeRuntime(new FakeClient())
        const tool = findTool('eval')
        await assert.rejects(
            () => tool.handler({ source: 'return 1' }, runtime),
            /MCP_EVAL_ENABLED/
        )
        process.env.MCP_EVAL_ENABLED = '0'
        await assert.rejects(
            () => tool.handler({ source: 'return 1' }, runtime),
            /MCP_EVAL_ENABLED/
        )
    } finally {
        if (prev === undefined) {
            delete process.env.MCP_EVAL_ENABLED
        } else {
            process.env.MCP_EVAL_ENABLED = prev
        }
    }
})
