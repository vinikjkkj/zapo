import assert from 'node:assert/strict'
import test from 'node:test'

import { createWaVoipSocket, type WaVoipSocketContext } from '@client/voip'
import { proto } from '@proto'

function buildContext(overrides: Partial<WaVoipSocketContext> = {}): WaVoipSocketContext {
    return {
        getCredentials: () => ({
            meJid: '111@s.whatsapp.net',
            meLid: '222@lid',
            signedIdentity: { details: new Uint8Array([1]) }
        }),
        sendNode: async () => {},
        query: async () => ({ tag: 'iq', attrs: {} }),
        encryptMessage: async () => ({ type: 'pkmsg', ciphertext: new Uint8Array([9, 9]) }),
        encryptMessagesBatch: async (requests) =>
            requests.map((_, index) => ({
                type: index === 0 ? 'pkmsg' : 'msg',
                ciphertext: new Uint8Array([index])
            })),
        decryptMessage: async () => new Uint8Array([7]),
        syncSignalSession: async () => {},
        syncDeviceList: async (jids) =>
            jids.map((jid) => ({ jid, deviceJids: [`${jid}/0`, `${jid}/1`] })),
        queryLidsByPhoneJids: async (jids) =>
            jids.map((jid) => ({ phoneJid: jid, lidJid: '333@lid' })),
        getPrivacyToken: async () => new Uint8Array([0xab]),
        ...overrides
    }
}

test('authState.creds maps zapo credentials to the baileys-style shape', () => {
    const socket = createWaVoipSocket(buildContext())
    assert.equal(socket.authState.creds.me.id, '111@s.whatsapp.net')
    assert.equal(socket.authState.creds.me.lid, '222@lid')
    assert.deepEqual(socket.authState.creds.account, { details: new Uint8Array([1]) })
    assert.equal(socket.user.lid, '222@lid')
})

test('authState.creds reads fresh credentials on every access', () => {
    let lid = 'a@lid'
    const socket = createWaVoipSocket(buildContext({ getCredentials: () => ({ meLid: lid }) }))
    assert.equal(socket.authState.creds.me.lid, 'a@lid')
    lid = 'b@lid'
    assert.equal(socket.authState.creds.me.lid, 'b@lid')
})

test('keys.get resolves tctoken privacy tokens keyed by jid', async () => {
    const socket = createWaVoipSocket(
        buildContext({ getPrivacyToken: async () => new Uint8Array([1, 2, 3]) })
    )
    const result = await socket.authState.keys.get('tctoken', ['555@s.whatsapp.net'])
    assert.deepEqual(result?.['555@s.whatsapp.net']?.token, new Uint8Array([1, 2, 3]))
    assert.equal(await socket.authState.keys.get('other', ['x']), undefined)
})

test('signalRepository.decryptMessage normalizes ciphertext to Uint8Array', async () => {
    let seen: Uint8Array | null = null
    const socket = createWaVoipSocket(
        buildContext({
            decryptMessage: async (_address, envelope) => {
                seen = envelope.ciphertext
                return new Uint8Array([1])
            }
        })
    )
    await socket.signalRepository.decryptMessage({
        jid: '111:0@s.whatsapp.net',
        type: 'msg',
        ciphertext: Buffer.from([4, 5, 6])
    })
    assert.ok(seen instanceof Uint8Array)
    assert.deepEqual(seen, new Uint8Array([4, 5, 6]))
})

test('lidMapping.getLIDForPN returns the resolved LID', async () => {
    const socket = createWaVoipSocket(buildContext())
    assert.equal(await socket.signalRepository.lidMapping.getLIDForPN('111@s.whatsapp.net'), '333@lid')
})

test('getUSyncDevices flattens device lists into { jid } entries', async () => {
    const socket = createWaVoipSocket(buildContext())
    const devices = await socket.getUSyncDevices(['111@s.whatsapp.net'])
    assert.deepEqual(devices, [
        { jid: '111@s.whatsapp.net/0' },
        { jid: '111@s.whatsapp.net/1' }
    ])
})

test('createParticipantNodes builds encrypted <to>/<enc> nodes and flags pkmsg', async () => {
    const socket = createWaVoipSocket(buildContext())
    const { nodes, shouldIncludeDeviceIdentity } = await socket.createParticipantNodes(
        ['111:0@s.whatsapp.net', '222:1@s.whatsapp.net'],
        { call: { callKey: new Uint8Array(32) } },
        { count: '0' }
    )
    assert.equal(shouldIncludeDeviceIdentity, true)
    assert.equal(nodes.length, 2)
    assert.equal(nodes[0].tag, 'to')
    assert.equal(nodes[0].attrs.jid, '111:0@s.whatsapp.net')
    const enc = (nodes[0].content as BinaryNodeLike[])[0]
    assert.equal(enc.tag, 'enc')
    assert.equal(enc.attrs.type, 'pkmsg')
    assert.equal(enc.attrs.v, '2')
    assert.equal(enc.attrs.count, '0')
})

test('the call message round-trips through the protobuf encoder', () => {
    const callKey = new Uint8Array(32).fill(7)
    const encoded = proto.Message.encode({ call: { callKey } }).finish()
    const decoded = proto.Message.decode(encoded)
    assert.deepEqual(new Uint8Array(decoded.call!.callKey!), callKey)
})

interface BinaryNodeLike {
    tag: string
    attrs: Record<string, string>
}
