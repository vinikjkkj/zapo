import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { FakeWaServer } from '@zapo-js/fake-server'
import type { WaClient, WaClientEventMap } from 'zapo-js'

import { type BufferedEvent, McpRuntime } from '../runtime'
import { type ToolDefinition, TOOLS } from '../tools'

/**
 * Inline parser for the auth_qr string. Format is `ref,noisePub,identityPub,advSecret,platform`
 * with base64url-encoded fields. Mirrors fake-server's `parsePairingQrString` helper, which is
 * not exposed via the package's "exports" surface.
 */
const parsePairingQr = (
    qr: string
): { advSecretKey: Uint8Array; identityPublicKey: Uint8Array } => {
    const parts = qr.split(',')
    if (parts.length < 5) {
        throw new Error(`pairing qr must have at least 5 parts, got ${parts.length}`)
    }
    const advSecret = decodeBase64Url(parts[parts.length - 2])
    const identityPub = decodeBase64Url(parts[parts.length - 3])
    return { advSecretKey: advSecret, identityPublicKey: identityPub }
}

const decodeBase64Url = (input: string): Uint8Array => {
    let s = input.replace(/-/g, '+').replace(/_/g, '/')
    const rem = s.length % 4
    if (rem === 2) s += '=='
    else if (rem === 3) s += '='
    return new Uint8Array(Buffer.from(s, 'base64'))
}

const CONNECT_TIMEOUT_MS = 60_000
const PEER_JID = '5511777777777@s.whatsapp.net'
const DEVICE_JID = '5511999999999:1@s.whatsapp.net'

const findTool = (name: string): ToolDefinition => {
    const tool = TOOLS.find((t) => t.name === name)
    if (!tool) throw new Error(`tool ${name} not registered`)
    return tool
}

const waitForEvent = (
    runtime: McpRuntime,
    type: string,
    predicate: (ev: BufferedEvent) => boolean = () => true,
    timeoutMs = CONNECT_TIMEOUT_MS
): Promise<BufferedEvent> => {
    return new Promise((resolve, reject) => {
        const start = Date.now()
        const tick = (): void => {
            const events = runtime.listEvents({ types: [type], limit: 200 })
            const match = events.find(predicate)
            if (match) {
                resolve(match)
                return
            }
            if (Date.now() - start > timeoutMs) {
                reject(new Error(`timeout waiting for ${type}`))
                return
            }
            setTimeout(tick, 25)
        }
        tick()
    })
}

const waitForMessage = (
    client: WaClient,
    predicate: (event: Parameters<WaClientEventMap['message']>[0]) => boolean,
    timeoutMs = 8_000
): Promise<Parameters<WaClientEventMap['message']>[0]> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('message timeout')), timeoutMs)
        const listener: WaClientEventMap['message'] = (event) => {
            if (predicate(event)) {
                clearTimeout(timer)
                client.off('message', listener)
                resolve(event)
            }
        }
        client.on('message', listener)
    })
}

test('mcp runtime drives pairing + send/receive against fake-server', async () => {
    const server = await FakeWaServer.start()
    const dir = await mkdtemp(join(tmpdir(), 'mcp-fake-flow-'))
    const runtime = new McpRuntime({
        authPath: join(dir, 'state.sqlite'),
        sessionId: 'mcp-fake-flow',
        logLevel: 'error',
        bufferSize: 1000,
        captureNoisyEvents: false,
        historyEnabled: false,
        logBufferSize: 500,
        chatSocketUrls: [server.url],
        noiseRootCa: server.noiseRootCa,
        transport: 'stdio',
        httpHost: '127.0.0.1',
        httpPort: 0,
        httpPath: '/mcp'
    })

    const callTool = findTool('call')
    const eventsTool = findTool('events')
    const lifecycleTool = findTool('lifecycle')

    try {
        const status = (await lifecycleTool.handler({ action: 'start' }, runtime)) as {
            ok: boolean
        }
        assert.equal(status.ok, true)

        const client = runtime.getClient()
        assert.ok(client, 'client should exist after lifecycle.start')

        // Capture pairing material the moment auth_qr fires.
        const materialPromise = new Promise<{
            readonly advSecretKey: Uint8Array
            readonly identityPublicKey: Uint8Array
        }>((resolve) => {
            client.once('auth_qr', (event) => {
                resolve(parsePairingQr(event.qr))
            })
        })
        const pairedPromise = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('auth_paired timeout')),
                CONNECT_TIMEOUT_MS
            )
            client.once('auth_paired', () => {
                clearTimeout(timer)
                resolve()
            })
        })

        // Drive connect through the call tool – same code path Claude would use.
        const connectPromise = callTool.handler({ path: 'connect' }, runtime)

        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.runPairing(pipeline, { deviceJid: DEVICE_JID }, () => materialPromise)

        const pipelineAfterPairPromise = server.waitForNextAuthenticatedPipeline()
        await pairedPromise
        const pipelineAfterPair = await pipelineAfterPairPromise
        await connectPromise

        // Buffer should reflect every milestone.
        await waitForEvent(runtime, 'auth_qr')
        await waitForEvent(runtime, 'auth_paired')
        await waitForEvent(
            runtime,
            'connection',
            (ev) => (ev.payload as { status?: string }).status === 'open'
        )

        // Set up an inbound peer message and verify the buffer captures it.
        const peer = await server.createFakePeer({ jid: PEER_JID }, pipelineAfterPair)
        await server.triggerPreKeyUpload(pipelineAfterPair)

        const inboundReceived = waitForMessage(
            client,
            (event) => event.message?.conversation === 'hello via fake-server'
        )
        await peer.sendConversation('hello via fake-server')
        await inboundReceived

        const messageEvent = await waitForEvent(
            runtime,
            'message',
            (ev) =>
                (ev.payload as { message?: { conversation?: string } }).message?.conversation ===
                'hello via fake-server'
        )
        assert.ok(messageEvent.seq > 0)

        // Outbound: drive sendMessage via the call tool, peer should observe it.
        const peerExpect = peer.expectMessage({ timeoutMs: 8_000 })
        const sendResult = (await callTool.handler(
            {
                path: 'message.send',
                args: [PEER_JID, { conversation: 'hello via mcp call tool' }]
            },
            runtime
        )) as { kind: string; result: unknown }
        assert.equal(sendResult.kind, 'call')
        const peerReceived = await peerExpect
        assert.equal(peerReceived.message.conversation, 'hello via mcp call tool')

        // Read events with `since` to confirm filtering: should only include events after the message.
        const lastSeq = messageEvent.seq
        const fresh = (await eventsTool.handler({ since: lastSeq, limit: 50 }, runtime)) as {
            events: { seq: number }[]
        }
        for (const ev of fresh.events) {
            assert.ok(ev.seq > lastSeq, `expected seq > ${lastSeq}, got ${ev.seq}`)
        }

        // lifecycle status should report a connected, paired client.
        const stateResult = (await lifecycleTool.handler({ action: 'status' }, runtime)) as {
            clientCreated: boolean
            state: unknown
        }
        assert.equal(stateResult.clientCreated, true)
        assert.ok(stateResult.state !== null)
    } finally {
        try {
            await runtime.destroyClient()
        } catch (error) {
            process.stderr.write(`destroyClient error: ${(error as Error)?.stack ?? error}\n`)
        }
        try {
            await server.stop()
        } catch (error) {
            process.stderr.write(`server.stop error: ${(error as Error)?.stack ?? error}\n`)
        }
        try {
            await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
        } catch (error) {
            process.stderr.write(`rm error: ${(error as Error)?.message ?? error}\n`)
        }
    }
})
