import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { McpRuntime, type RuntimeConfig } from '../runtime'

const baseConfig = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => ({
    authPath: '/unused',
    sessionId: 'logger-test',
    logLevel: 'info',
    bufferSize: 100,
    captureNoisyEvents: false,
    historyEnabled: false,
    logBufferSize: 50,
    transport: 'stdio',
    httpHost: '127.0.0.1',
    httpPort: 0,
    httpPath: '/mcp',
    ...overrides
})

test('BufferedTeeLogger captures entries into the runtime ring buffer', () => {
    const runtime = new McpRuntime(baseConfig())
    const logger = runtime.getLogger()
    logger.info('boot', { sessionId: 'abc' })
    logger.warn('about to retry')
    logger.error('exploded', { code: 42 })
    // trace is below info, must be filtered
    logger.trace('noisy detail')

    const entries = runtime.listLogs({ limit: 10 })
    assert.equal(entries.length, 3)
    assert.equal(entries[0].level, 'info')
    assert.equal(entries[0].message, 'boot')
    assert.deepStrictEqual(entries[0].context, { sessionId: 'abc' })
    assert.equal(entries[1].level, 'warn')
    assert.equal(entries[1].context, null)
    assert.equal(entries[2].level, 'error')
    assert.deepStrictEqual(entries[2].context, { code: 42 })
})

test('BufferedTeeLogger respects bufferLimit by dropping oldest entries', () => {
    const runtime = new McpRuntime(baseConfig({ logBufferSize: 3 }))
    const logger = runtime.getLogger()
    for (let i = 1; i <= 5; i += 1) {
        logger.info(`entry-${i}`)
    }
    const entries = runtime.listLogs({ limit: 10 })
    assert.equal(entries.length, 3)
    assert.deepStrictEqual(
        entries.map((e) => e.message),
        ['entry-3', 'entry-4', 'entry-5']
    )
})

test('listLogs filters by q substring across message + context', () => {
    const runtime = new McpRuntime(baseConfig())
    const logger = runtime.getLogger()
    logger.info('boot', { sessionId: 'abc' })
    logger.warn('publish failed', { id: 'XYZ123' })
    logger.error('publish failed', { id: 'qqq' })

    const byMessage = runtime.listLogs({ q: 'PUBLISH' })
    assert.equal(byMessage.length, 2)

    const byContext = runtime.listLogs({ q: 'xyz' })
    assert.equal(byContext.length, 1)
    assert.equal(byContext[0].message, 'publish failed')

    const none = runtime.listLogs({ q: 'no-such-thing' })
    assert.equal(none.length, 0)
})

test('listLogs supports case-insensitive regex via q + regex flag', () => {
    const runtime = new McpRuntime(baseConfig())
    const logger = runtime.getLogger()
    logger.info('order 42 processed')
    logger.info('order ab processed')
    logger.error('boom')

    const matches = runtime.listLogs({ q: 'ORDER \\d+', regex: true })
    assert.equal(matches.length, 1)
    assert.equal(matches[0].message, 'order 42 processed')

    const malformed = runtime.listLogs({ q: '(unclosed', regex: true })
    assert.equal(malformed.length, 0)
})

interface RecordEventCapable {
    recordEvent: (type: string, payload: unknown) => void
}

const recordEvent = (runtime: McpRuntime, type: string, payload: unknown): void => {
    ;(runtime as unknown as RecordEventCapable).recordEvent(type, payload)
}

test('listEvents filters by q substring across type + payload', () => {
    const runtime = new McpRuntime(baseConfig())
    recordEvent(runtime, 'connection', { status: 'open' })
    recordEvent(runtime, 'message', { chatJid: '120363@g.us', text: 'hi' })
    recordEvent(runtime, 'message', { chatJid: '5511@s.whatsapp.net', text: 'yo' })
    recordEvent(runtime, 'group_event', { action: 'add', participants: ['120363@g.us'] })

    const byType = runtime.listEvents({ q: 'CONNECTION' })
    assert.equal(byType.length, 1)
    assert.equal(byType[0].type, 'connection')

    const byPayloadJid = runtime.listEvents({ q: '120363' })
    assert.equal(byPayloadJid.length, 2)
    assert.deepStrictEqual(
        byPayloadJid.map((e) => e.type),
        ['message', 'group_event']
    )

    const none = runtime.listEvents({ q: 'no-such-thing' })
    assert.equal(none.length, 0)
})

test('listEvents supports case-insensitive regex via q + regex flag', () => {
    const runtime = new McpRuntime(baseConfig())
    recordEvent(runtime, 'message', { id: '3EB001' })
    recordEvent(runtime, 'message', { id: '3EB002' })
    recordEvent(runtime, 'message', { id: 'OTHER' })

    const matches = runtime.listEvents({ q: '3eb0\\d{2}', regex: true })
    assert.equal(matches.length, 2)

    const malformed = runtime.listEvents({ q: '(unclosed', regex: true })
    assert.equal(malformed.length, 0)
})

test('listEvents q combines with types filter', () => {
    const runtime = new McpRuntime(baseConfig())
    recordEvent(runtime, 'message', { id: 'AAA-match' })
    recordEvent(runtime, 'group_event', { id: 'AAA-match' })
    recordEvent(runtime, 'message', { id: 'BBB' })

    const matches = runtime.listEvents({ types: ['message'], q: 'aaa' })
    assert.equal(matches.length, 1)
    assert.equal(matches[0].type, 'message')
})

test('BufferedTeeLogger mirrors entries to the configured log file as JSONL', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-log-'))
    const logFilePath = join(dir, 'out.log')
    const runtime = new McpRuntime(baseConfig({ logFilePath }))
    try {
        runtime.getLogger().info('hello file', { run: 1 })
        runtime.getLogger().error('written', { code: 7 })
        await runtime.closeLogFile()

        const contents = await readFile(logFilePath, 'utf8')
        const lines = contents.trim().split('\n')
        assert.equal(lines.length, 2)
        const first = JSON.parse(lines[0])
        const second = JSON.parse(lines[1])
        assert.equal(first.level, 'info')
        assert.equal(first.message, 'hello file')
        assert.deepStrictEqual(first.context, { run: 1 })
        assert.equal(second.level, 'error')
        assert.equal(second.message, 'written')
        assert.deepStrictEqual(second.context, { code: 7 })
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})
