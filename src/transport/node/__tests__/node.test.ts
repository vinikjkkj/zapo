import assert from 'node:assert/strict'
import test from 'node:test'

import type { Logger } from '@infra/log/types'
import { WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/constants'
import { encodeBinaryNodeStanza } from '@transport/binary'
import {
    decodeNodeContentBase64OrBytes,
    decodeNodeContentUtf8OrBytes,
    findNodeChildrenByTags,
    findNodeChild,
    getNodeChildren,
    getNodeChildrenByTagFromChildren,
    getNodeChildrenByTag,
    getNodeChildrenNonEmptyAttrValuesByTag,
    getNodeChildrenNonEmptyUtf8ByTag,
    getNodeChildrenTags,
    hasNodeChild
} from '@transport/node/helpers'
import { assertIqResult, buildIqNode, parseIqError, queryWithContext } from '@transport/node/query'
import { WaNodeOrchestrator } from '@transport/node/WaNodeOrchestrator'
import { WaNodeTransport } from '@transport/node/WaNodeTransport'
import { formatBinaryNodeAsXml } from '@transport/node/xml'
import type { BinaryNode } from '@transport/types'
import type { WaComms } from '@transport/WaComms'
import { bytesToBase64 } from '@util/bytes'

function createLogger(): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
    }
}

async function waitFor(predicate: () => boolean, message: string, maxTurns = 200): Promise<void> {
    for (let turn = 0; turn < maxTurns; turn += 1) {
        if (predicate()) {
            return
        }
        await new Promise<void>((resolve) => setImmediate(resolve))
    }
    throw new Error(message)
}

test('node helpers parse child collections and binary payloads', () => {
    const node: BinaryNode = {
        tag: 'root',
        attrs: {},
        content: [
            { tag: 'a', attrs: {}, content: 'hello' },
            { tag: 'b', attrs: {}, content: new Uint8Array([1, 2]) },
            {
                tag: 'parent',
                attrs: {},
                content: [{ tag: 'b', attrs: { name: 'child-value' }, content: 'child' }]
            }
        ]
    }

    assert.equal(getNodeChildren(node).length, 3)
    assert.equal(findNodeChild(node, 'a')?.tag, 'a')
    assert.equal(getNodeChildrenByTag(node, 'b').length, 1)
    assert.equal(hasNodeChild(node, 'x'), false)
    assert.deepEqual(findNodeChildrenByTags(node, ['a', 'b', 'x'] as const), [
        getNodeChildren(node)[0],
        getNodeChildren(node)[1],
        undefined
    ])
    assert.deepEqual(getNodeChildrenByTag(node, 'b'), [getNodeChildren(node)[1]])
    assert.deepEqual(getNodeChildrenTags(node), ['a', 'b', 'parent'])
    assert.deepEqual(getNodeChildrenNonEmptyUtf8ByTag(node, 'a', 'root.a'), ['hello'])
    assert.deepEqual(getNodeChildrenNonEmptyUtf8ByTag(node, 'missing', 'root.missing'), [])
    assert.deepEqual(getNodeChildrenNonEmptyAttrValuesByTag(node, 'b', 'name'), [])
    assert.deepEqual(getNodeChildrenByTagFromChildren(node, 'b').length, 1)
    assert.deepEqual(getNodeChildrenByTagFromChildren(node, 'b')[0].attrs.name, 'child-value')

    assert.deepEqual(
        decodeNodeContentUtf8OrBytes(findNodeChild(node, 'a')?.content, 'a.content'),
        new TextEncoder().encode('hello')
    )

    assert.deepEqual(
        decodeNodeContentBase64OrBytes(bytesToBase64(new Uint8Array([7, 8])), 'field'),
        new Uint8Array([7, 8])
    )
    assert.throws(
        () => decodeNodeContentBase64OrBytes(undefined, 'missing'),
        /missing binary node content/
    )
})

test('iq helper functions build, parse and assert response results', async () => {
    const iq = buildIqNode('get', 'server', 'w:test', [{ tag: 'x', attrs: {} }], { id: '1' })
    assert.equal(iq.tag, WA_NODE_TAGS.IQ)
    assert.equal(iq.attrs.type, 'get')
    assert.equal(iq.attrs.id, '1')

    const ok: BinaryNode = { tag: 'iq', attrs: { type: WA_IQ_TYPES.RESULT } }
    assert.doesNotThrow(() => assertIqResult(ok, 'ctx'))

    const errNode: BinaryNode = {
        tag: 'iq',
        attrs: { type: 'error' },
        content: [{ tag: 'error', attrs: { code: '404', text: 'not-found' } }]
    }
    const parsed = parseIqError(errNode)
    assert.equal(parsed.code, '404')
    assert.equal(parsed.text, 'not-found')
    assert.equal(parsed.numericCode, 404)

    assert.throws(() => assertIqResult(errNode, 'ctx'), /ctx iq failed \(404: not-found\)/)

    const warnings: Array<Record<string, unknown>> = []
    const logger: Logger = {
        ...createLogger(),
        warn: (_message, context) => {
            warnings.push(context ?? {})
        }
    }

    await assert.rejects(
        () =>
            queryWithContext(
                async () => {
                    throw new Error('boom')
                },
                logger,
                'sync.test',
                iq,
                100,
                { operation: 'x' }
            ),
        /boom/
    )
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0].context, 'sync.test')
})

test('WaNodeOrchestrator resolves pending queries and handles ping iq', async () => {
    const sentNodes: BinaryNode[] = []
    const orchestrator = new WaNodeOrchestrator({
        logger: createLogger(),
        sendNode: async (node) => {
            sentNodes.push(node)
        },
        defaultTimeoutMs: 1_000
    })

    const queryPromise = orchestrator.query({
        tag: 'iq',
        attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:test' }
    })

    await waitFor(() => sentNodes.length === 1, 'query send did not flush')
    assert.equal(sentNodes.length, 1)
    const sentId = sentNodes[0].attrs.id
    assert.ok(sentId)
    assert.equal(orchestrator.hasPending(), true)

    const resolved = orchestrator.tryResolvePending({
        tag: 'iq',
        attrs: { id: sentId, type: 'result' }
    })
    assert.equal(resolved, true)

    const response = await queryPromise
    assert.equal(response.attrs.id, sentId)
    assert.equal(orchestrator.hasPending(), false)

    const pingHandled = await orchestrator.handleIncomingNode({
        tag: WA_NODE_TAGS.IQ,
        attrs: {
            id: 'ping-1',
            from: 's.whatsapp.net',
            type: WA_IQ_TYPES.GET,
            xmlns: WA_XMLNS.WHATSAPP_PING
        }
    })
    assert.equal(pingHandled, true)
    assert.equal(sentNodes[sentNodes.length - 1].attrs.type, WA_IQ_TYPES.RESULT)
})

test('WaNodeOrchestrator can send nodes without auto-generated ids', async () => {
    const sentNodes: BinaryNode[] = []
    const orchestrator = new WaNodeOrchestrator({
        logger: createLogger(),
        sendNode: async (node) => {
            sentNodes.push(node)
        }
    })

    await orchestrator.sendNode(
        {
            tag: 'presence',
            attrs: {
                name: 'Vinicius'
            }
        },
        false
    )

    assert.deepEqual(sentNodes, [
        {
            tag: 'presence',
            attrs: {
                name: 'Vinicius'
            }
        }
    ])
})

test('WaNodeOrchestrator query timeout rejects pending request', async () => {
    const orchestrator = new WaNodeOrchestrator({
        logger: createLogger(),
        sendNode: async () => undefined
    })

    await assert.rejects(
        () =>
            orchestrator.query(
                {
                    tag: 'iq',
                    attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:test' }
                },
                5
            ),
        /query timeout/
    )
})

test('WaNodeOrchestrator query timeout supports fake timers', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const orchestrator = new WaNodeOrchestrator({
        logger: createLogger(),
        sendNode: async () => undefined
    })

    const pending = orchestrator.query(
        {
            tag: 'iq',
            attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:test' }
        },
        5
    )

    await waitFor(() => orchestrator.hasPending(), 'query did not enter pending map')
    t.mock.timers.tick(5)
    await assert.rejects(() => pending, /query timeout/)
})

test('xml formatter escapes attributes and supports string bytes and children nodes', () => {
    const xml = formatBinaryNodeAsXml({
        tag: 'iq',
        attrs: {
            id: 'id-1',
            text: '<\'&">'
        },
        content: [
            {
                tag: 's',
                attrs: {},
                content: '<\'&">'
            },
            {
                tag: 'b',
                attrs: {},
                content: new Uint8Array([1, 2, 3])
            },
            {
                tag: 'empty',
                attrs: {},
                content: []
            },
            {
                tag: 'none',
                attrs: {}
            }
        ]
    })

    assert.match(xml, /<iq id='id-1' text='&lt;&apos;&amp;&quot;&gt;'>/)
    assert.match(xml, /<s>&lt;&apos;&amp;&quot;&gt;<\/s>/)
    assert.match(xml, /<b>AQID<\/b>/)
    assert.match(xml, /<empty\/>/)
    assert.match(xml, /<none\/>/)
})

test('WaNodeTransport binds comms and emits frame and node events', async () => {
    const sentFrames: Uint8Array[] = []
    const nodeOut: BinaryNode[] = []
    const frameOut: Uint8Array[] = []
    const logger = createLogger()
    const transport = new WaNodeTransport(logger)
    transport.on('node_out', (node) => {
        nodeOut.push(node)
    })
    transport.on('frame_out', (frame) => {
        frameOut.push(frame)
    })

    transport.bindComms({
        sendFrame: async (frame: Uint8Array) => {
            sentFrames.push(frame)
        }
    } as unknown as WaComms)

    const outbound: BinaryNode = {
        tag: 'iq',
        attrs: { type: 'get', to: 's.whatsapp.net', xmlns: 'w:test', id: 'iq-1' }
    }
    await transport.sendNode(outbound)

    assert.equal(sentFrames.length, 1)
    assert.equal(nodeOut.length, 1)
    assert.equal(frameOut.length, 1)
    assert.deepEqual(sentFrames[0], frameOut[0])
    assert.equal(nodeOut[0].attrs.id, 'iq-1')
})

test('WaNodeTransport dispatches incoming frames and handles decode errors', async () => {
    const nodeIn: BinaryNode[] = []
    const frameIn: Uint8Array[] = []
    const decodeErrors: Error[] = []
    const transport = new WaNodeTransport(createLogger())

    transport.on('node_in', (node) => {
        nodeIn.push(node)
    })
    transport.on('frame_in', (frame) => {
        frameIn.push(frame)
    })
    transport.on('decode_error', (error) => {
        decodeErrors.push(error)
    })

    const inboundNode: BinaryNode = {
        tag: 'iq',
        attrs: { id: 'in-1', type: 'result' }
    }
    const frame = encodeBinaryNodeStanza(inboundNode)
    const seen: BinaryNode[] = []
    await transport.dispatchIncomingFrame(frame, (node) => {
        seen.push(node)
    })

    assert.equal(frameIn.length, 1)
    assert.equal(nodeIn.length, 1)
    assert.equal(seen.length, 1)
    assert.equal(seen[0].attrs.id, 'in-1')

    await transport.dispatchIncomingFrame(new Uint8Array([255]), () => undefined)
    assert.equal(decodeErrors.length, 1)

    await transport.dispatchIncomingFrame(new Uint8Array([2]), () => {
        throw new Error('stream-end should not reach onNode')
    })
    assert.equal(decodeErrors.length, 1)
})

test('WaNodeTransport throws when trying to send without comms', async () => {
    const transport = new WaNodeTransport(createLogger())
    await assert.rejects(
        () =>
            transport.sendNode({
                tag: 'iq',
                attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:test' }
            }),
        /comms is not connected/
    )
})
