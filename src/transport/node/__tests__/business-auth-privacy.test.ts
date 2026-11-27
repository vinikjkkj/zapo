import assert from 'node:assert/strict'
import test from 'node:test'

import { nonceNotification, tokenResult } from '@client/business-agent/__tests__/fixtures'
import { createNoopLogger } from '@infra/log/types'
import { encodeBinaryNodeStanza } from '@transport/binary'
import { buildBusinessAgentAuthenticationIq } from '@transport/node/builders/business-agent'
import { WaNodeTransport } from '@transport/node/WaNodeTransport'
import type { BinaryNode } from '@transport/types'
import type { WaComms } from '@transport/WaComms'

test('native SMB nonce, token, cookies and exchange frames bypass debug observers and trace XML', async () => {
    const logged: unknown[] = []
    const logger = {
        ...createNoopLogger('trace'),
        trace: (_message: string, context?: unknown) => {
            logged.push(context)
        }
    }
    const transport = new WaNodeTransport(logger)
    const events: string[] = []
    const wire: Uint8Array[] = []
    transport.bindComms({
        sendFrame: async (frame: Uint8Array) => {
            wire.push(frame)
        }
    } as unknown as WaComms)
    for (const event of ['node_in', 'node_out', 'frame_in', 'frame_out'])
        transport.on(event, () => events.push(event))
    const delivered: BinaryNode[] = []
    for (const node of [nonceNotification(), tokenResult()]) {
        await transport.dispatchIncomingFrame(encodeBinaryNodeStanza(node), (received) => {
            delivered.push(received)
        })
    }
    const exchange = buildBusinessAgentAuthenticationIq(
        '15550000001@s.whatsapp.net',
        'fixture-nonce'
    )
    await transport.sendNode(exchange)
    assert.equal(delivered.length, 2)
    assert.equal(wire.length, 1)
    assert.deepEqual(events, [])
    assert.doesNotMatch(
        JSON.stringify(logged),
        /fixture-nonce|fixture-private-token|private-cookie/
    )
    const normal = { tag: 'presence', attrs: { type: 'available' } }
    await transport.dispatchIncomingFrame(encodeBinaryNodeStanza(normal), () => undefined)
    await transport.sendNode(normal)
    assert.deepEqual(events, ['frame_in', 'node_in', 'node_out', 'frame_out'])
})
