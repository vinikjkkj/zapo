import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { McpRuntime, type RuntimeConfig } from '../runtime'
import { type ToolDefinition, TOOLS } from '../tools'

const cfg = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => ({
    authPath: '/unused',
    sessionId: 'default_2',
    logLevel: 'error',
    bufferSize: 100,
    captureNoisyEvents: false,
    historyEnabled: false,
    logBufferSize: 100,
    transport: 'stdio',
    httpHost: '127.0.0.1',
    httpPort: 0,
    httpPath: '/mcp',
    ...overrides
})

interface RecordEventCapable {
    recordEvent: (type: string, payload: unknown, session?: string) => void
}

// recordEvent is private; the runtime-logger tests reach it the same way to
// seed buffers without driving a real connection.
const recordEvent = (
    runtime: McpRuntime,
    type: string,
    payload: unknown,
    session?: string
): void => {
    ;(runtime as unknown as RecordEventCapable).recordEvent(type, payload, session)
}

const findTool = (name: string): ToolDefinition => {
    const tool = TOOLS.find((t) => t.name === name)
    if (!tool) throw new Error(`tool ${name} not registered`)
    return tool
}

test('events are partitioned per session with independent seq', () => {
    const runtime = new McpRuntime(cfg())
    recordEvent(runtime, 'message', { id: 'A1' }, 'alpha')
    recordEvent(runtime, 'message', { id: 'A2' }, 'alpha')
    recordEvent(runtime, 'message', { id: 'B1' }, 'beta')

    const alpha = runtime.listEvents({}, 'alpha')
    const beta = runtime.listEvents({}, 'beta')
    assert.equal(alpha.length, 2)
    assert.equal(beta.length, 1)
    // seq is per-session: both sessions start at 1 independently
    assert.deepStrictEqual(
        alpha.map((e) => e.seq),
        [1, 2]
    )
    assert.deepStrictEqual(
        beta.map((e) => e.seq),
        [1]
    )
    assert.equal(runtime.bufferSize('alpha'), 2)
    assert.equal(runtime.bufferSize('beta'), 1)
    // the default session saw nothing
    assert.equal(runtime.listEvents({}).length, 0)
    assert.equal(runtime.bufferSize(), 0)
})

test('omitting session resolves to the configured default session', () => {
    const runtime = new McpRuntime(cfg({ sessionId: 'primary' }))
    recordEvent(runtime, 'connection', { status: 'open' }) // no session -> default
    assert.equal(runtime.listEvents({}, 'primary').length, 1)
    assert.equal(runtime.listEvents({}).length, 1) // default read sees it
    assert.equal(runtime.listEvents({}, 'other').length, 0)
})

test('clearEvents is scoped to one session', () => {
    const runtime = new McpRuntime(cfg())
    recordEvent(runtime, 'message', {}, 'a')
    recordEvent(runtime, 'message', {}, 'b')
    assert.equal(runtime.clearEvents('a'), 1)
    assert.equal(runtime.bufferSize('a'), 0)
    assert.equal(runtime.bufferSize('b'), 1)
})

test('reads on an unknown session return empty without creating it', () => {
    const runtime = new McpRuntime(cfg())
    assert.equal(runtime.listEvents({}, 'ghost').length, 0)
    assert.equal(runtime.bufferSize('ghost'), 0)
    assert.equal(runtime.getClient('ghost'), null)
    assert.deepStrictEqual(runtime.listSessions(), [])
})

test('logs filter by session via the context.session tag', () => {
    const runtime = new McpRuntime(cfg({ logLevel: 'trace' }))
    runtime.getLogger().info('alpha line', { session: 'alpha' })
    runtime.getLogger().info('beta line', { session: 'beta' })
    runtime.getLogger().info('global line')

    assert.equal(runtime.listLogs({ session: 'alpha' }).length, 1)
    assert.equal(runtime.listLogs({ session: 'beta' }).length, 1)
    // omitting session returns everything, including the untagged global line
    assert.equal(runtime.listLogs({}).length, 3)
})

test('maxSessions caps lazy session creation', () => {
    const runtime = new McpRuntime(cfg({ maxSessions: 2 }))
    recordEvent(runtime, 'message', {}, 'one')
    recordEvent(runtime, 'message', {}, 'two')
    assert.throws(() => recordEvent(runtime, 'message', {}, 'three'), /max sessions reached/)
    // existing sessions keep recording fine past the cap
    recordEvent(runtime, 'message', {}, 'one')
    assert.equal(runtime.bufferSize('one'), 2)
})

test('destroying a session reclaims its maxSessions slot', async () => {
    const runtime = new McpRuntime(cfg({ maxSessions: 2 }))
    recordEvent(runtime, 'message', {}, 'one')
    recordEvent(runtime, 'message', {}, 'two')
    assert.throws(() => recordEvent(runtime, 'message', {}, 'three'), /max sessions reached/)

    // destroy removes the state entirely: frees the slot AND drops its buffer
    await runtime.destroyClient('one')
    assert.equal(runtime.bufferSize('one'), 0)
    assert.deepStrictEqual(
        runtime.listSessions().map((s) => s.sessionId),
        ['two']
    )

    // the freed slot is now reusable
    recordEvent(runtime, 'message', {}, 'three')
    assert.equal(runtime.bufferSize('three'), 1)
})

test('events tool routes by session', async () => {
    const runtime = new McpRuntime(cfg())
    recordEvent(runtime, 'message', { id: 'A' }, 'a')
    recordEvent(runtime, 'message', { id: 'B' }, 'b')
    const events = findTool('events')

    const ra = (await events.handler({ session: 'a' }, runtime)) as {
        count: number
        session: string
        events: { payload: { id: string } }[]
    }
    assert.equal(ra.count, 1)
    assert.equal(ra.session, 'a')
    assert.equal(ra.events[0].payload.id, 'A')

    const rb = (await events.handler({ session: 'b' }, runtime)) as {
        count: number
        events: { payload: { id: string } }[]
    }
    assert.equal(rb.count, 1)
    assert.equal(rb.events[0].payload.id, 'B')

    // default session is empty and reports the configured default id
    const rdefault = (await events.handler({}, runtime)) as { count: number; session: string }
    assert.equal(rdefault.count, 0)
    assert.equal(rdefault.session, 'default_2')
})

test('events_clear is scoped to the requested session', async () => {
    const runtime = new McpRuntime(cfg())
    recordEvent(runtime, 'message', {}, 'a')
    recordEvent(runtime, 'message', {}, 'b')
    const clear = findTool('events_clear')
    const result = (await clear.handler({ session: 'a' }, runtime)) as {
        dropped: number
        session: string
    }
    assert.equal(result.dropped, 1)
    assert.equal(result.session, 'a')
    assert.equal(runtime.bufferSize('a'), 0)
    assert.equal(runtime.bufferSize('b'), 1)
})

test('rejects a blank session id', async () => {
    const runtime = new McpRuntime(cfg())
    const events = findTool('events')
    await assert.rejects(() => events.handler({ session: '   ' }, runtime), /non-empty string/)
})

test('lifecycle status summarizes every live session over one shared store', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-multi-'))
    const runtime = new McpRuntime(cfg({ authPath: join(dir, 'state.sqlite') }))
    const lifecycle = findTool('lifecycle')
    try {
        await lifecycle.handler({ action: 'start', session: 'biz' }, runtime)
        await lifecycle.handler({ action: 'start', session: 'personal' }, runtime)

        const status = (await lifecycle.handler({ action: 'status', session: 'biz' }, runtime)) as {
            session: string
            clientCreated: boolean
            sessions: { sessionId: string; clientCreated: boolean; isDefault: boolean }[]
        }
        assert.equal(status.session, 'biz')
        assert.equal(status.clientCreated, true)
        const ids = status.sessions.map((s) => s.sessionId).sort()
        assert.deepStrictEqual(ids, ['biz', 'personal'])
        assert.ok(status.sessions.every((s) => s.clientCreated))

        // the default session was never started -> reported but not created
        const def = (await lifecycle.handler({ action: 'status' }, runtime)) as {
            session: string
            clientCreated: boolean
        }
        assert.equal(def.session, 'default_2')
        assert.equal(def.clientCreated, false)
    } finally {
        await runtime.destroyAll()
        await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
})

test('destroyClient drops one session client but keeps the siblings', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-multi-'))
    const runtime = new McpRuntime(cfg({ authPath: join(dir, 'state.sqlite') }))
    try {
        await runtime.ensureClient('a')
        await runtime.ensureClient('b')
        assert.ok(runtime.getClient('a'))
        assert.ok(runtime.getClient('b'))

        await runtime.destroyClient('a')
        assert.equal(runtime.getClient('a'), null)
        assert.ok(runtime.getClient('b'), 'sibling session client should survive')
    } finally {
        await runtime.destroyAll()
        await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
})
