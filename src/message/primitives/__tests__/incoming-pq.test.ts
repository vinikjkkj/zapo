import assert from 'node:assert/strict'
import test from 'node:test'

import { createNoopLogger } from '@infra/log/types'
import { handleIncomingMessageAck } from '@message/primitives/incoming'
import { proto } from '@proto'
import type { SignalAddress } from '@signal/types'
import type { BinaryNode } from '@transport/types'

function plaintext(): Uint8Array {
    const encoded = proto.Message.encode({ conversation: 'hi' }).finish()
    const out = new Uint8Array(encoded.length + 1)
    out.set(encoded, 0)
    out[encoded.length] = 1
    return out
}

async function decryptAddresses(from: string, encAttrs: Record<string, string>[]) {
    const addresses: SignalAddress[] = []
    const node: BinaryNode = {
        tag: 'message',
        attrs: { id: 'msg-pq', from, t: '123' },
        content: encAttrs.map((attrs) => ({
            tag: 'enc',
            attrs,
            content: new Uint8Array([1])
        }))
    }
    await handleIncomingMessageAck(node, {
        logger: createNoopLogger(),
        sendNode: async () => undefined,
        signalProtocol: {
            decryptMessage: async (address: SignalAddress) => {
                addresses.push(address)
                return plaintext()
            }
        } as never,
        emitIncomingMessage: () => undefined
    })
    return addresses
}

test('an enc marked pq is decrypted on the post-quantum session of a LID sender', async () => {
    const addresses = await decryptAddresses('5511999999999:3@lid', [
        { v: '2', type: 'pkmsg', session_type: 'pq' }
    ])

    assert.deepEqual(addresses, [{ user: '5511999999999', server: 'lid_pq', device: 3 }])
})

test('one pq enc moves every signal enc of the stanza to the post-quantum session', async () => {
    const addresses = await decryptAddresses('5511999999999@lid', [
        { v: '2', type: 'msg' },
        { v: '2', type: 'pkmsg', session_type: 'pq' }
    ])

    assert.deepEqual(
        addresses.map((address) => address.server),
        ['lid_pq', 'lid_pq']
    )
})

test('without session_type the classic session is used', async () => {
    const addresses = await decryptAddresses('5511999999999:3@lid', [{ v: '2', type: 'msg' }])

    assert.deepEqual(addresses, [{ user: '5511999999999', server: 'lid', device: 3 }])
})

test('an unknown session_type does not select the post-quantum session', async () => {
    const addresses = await decryptAddresses('5511999999999@lid', [
        { v: '2', type: 'msg', session_type: 'other' }
    ])

    assert.equal(addresses[0].server, 'lid')
})

test('a phone-number sender has no post-quantum twin and stays classic', async () => {
    const addresses = await decryptAddresses('5511999999999:2@s.whatsapp.net', [
        { v: '2', type: 'pkmsg', session_type: 'pq' }
    ])

    assert.deepEqual(addresses, [{ user: '5511999999999', server: 's.whatsapp.net', device: 2 }])
})
