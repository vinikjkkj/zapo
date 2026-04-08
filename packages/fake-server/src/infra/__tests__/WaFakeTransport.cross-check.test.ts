/**
 * Cross-validation for WaFakeTransport.
 *
 * After the noise handshake completes, both sides hold AES-GCM keys with
 * mirrored roles: the server's send key equals the client's read key, and
 * the server's recv key equals the client's write key. Counters are
 * independent on each direction and start at 0.
 *
 * This test runs a full XX handshake between zapo-js's WaNoiseHandshake
 * (initiator) and WaFakeNoiseHandshake (responder), instantiates a real
 * WaNoiseSocket on the client side and a WaFakeTransport on the server
 * side, and exchanges several frames in both directions to verify the
 * counters and keys stay synchronized.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { WaNoiseHandshake, type WaNoiseSocket } from 'zapo-js/transport'

import { X25519 } from '../../transport/crypto'
import { proto } from '../../transport/protos'
import { WaFakeNoiseHandshake } from '../WaFakeNoiseHandshake'
import { WaFakeTransport } from '../WaFakeTransport'

const NOISE_XX_NAME = new TextEncoder().encode('Noise_XX_25519_AESGCM_SHA256\0\0\0\0')
const PROLOGUE = new Uint8Array([0x57, 0x41, 0x06, 0x03])

async function runXxHandshake(): Promise<{
    readonly clientSocket: WaNoiseSocket
    readonly serverTransport: WaFakeTransport
}> {
    const client = new WaNoiseHandshake()
    const server = new WaFakeNoiseHandshake()

    await client.start(NOISE_XX_NAME, PROLOGUE)
    await server.start(NOISE_XX_NAME, PROLOGUE)

    const clientEphemeral = await X25519.generateKeyPair()
    const serverEphemeral = await X25519.generateKeyPair()
    const serverStatic = await X25519.generateKeyPair()
    const clientStatic = await X25519.generateKeyPair()

    // Message 1: client -> server
    await client.authenticate(clientEphemeral.pubKey)
    const m1 = proto.HandshakeMessage.encode({
        clientHello: { ephemeral: clientEphemeral.pubKey }
    }).finish()
    const parsedM1 = proto.HandshakeMessage.decode(m1)
    if (!parsedM1.clientHello?.ephemeral) throw new Error('m1 missing ephemeral')
    await server.authenticate(parsedM1.clientHello.ephemeral)

    // Message 2: server -> client
    await server.authenticate(serverEphemeral.pubKey)
    await server.mixIntoKey(
        await X25519.scalarMult(serverEphemeral.privKey, parsedM1.clientHello.ephemeral)
    )
    const ctServerStatic = await server.encrypt(serverStatic.pubKey)
    await server.mixIntoKey(
        await X25519.scalarMult(serverStatic.privKey, parsedM1.clientHello.ephemeral)
    )
    const ctPayload = await server.encrypt(new Uint8Array([0x00]))
    const m2 = proto.HandshakeMessage.encode({
        serverHello: {
            ephemeral: serverEphemeral.pubKey,
            static: ctServerStatic,
            payload: ctPayload
        }
    }).finish()

    const parsedM2 = proto.HandshakeMessage.decode(m2)
    const sh = parsedM2.serverHello
    if (!sh?.ephemeral || !sh.static || !sh.payload) throw new Error('m2 incomplete')
    await client.authenticate(sh.ephemeral)
    await client.mixIntoKey(await X25519.scalarMult(clientEphemeral.privKey, sh.ephemeral))
    const decryptedServerStatic = await client.decrypt(sh.static)
    await client.mixIntoKey(await X25519.scalarMult(clientEphemeral.privKey, decryptedServerStatic))
    await client.decrypt(sh.payload)

    // Message 3: client -> server
    const ctClientStatic = await client.encrypt(clientStatic.pubKey)
    await client.mixIntoKey(await X25519.scalarMult(clientStatic.privKey, serverEphemeral.pubKey))
    const ctClientPayload = await client.encrypt(new Uint8Array([0x00]))
    const m3 = proto.HandshakeMessage.encode({
        clientFinish: { static: ctClientStatic, payload: ctClientPayload }
    }).finish()

    const parsedM3 = proto.HandshakeMessage.decode(m3)
    const cf = parsedM3.clientFinish
    if (!cf?.static || !cf.payload) throw new Error('m3 incomplete')
    const decryptedClientStatic = await server.decrypt(cf.static)
    await server.mixIntoKey(await X25519.scalarMult(serverEphemeral.privKey, decryptedClientStatic))
    await server.decrypt(cf.payload)

    const clientSocket = await client.finish()
    const serverKeys = await server.finish()
    const serverTransport = new WaFakeTransport({
        recvKey: serverKeys.recvKey,
        sendKey: serverKeys.sendKey
    })

    return { clientSocket, serverTransport }
}

function buildNonce(counter: number): Uint8Array {
    const nonce = new Uint8Array(12)
    new DataView(nonce.buffer).setUint32(8, counter, false)
    return nonce
}

test('post-handshake transport: server encrypts, client decrypts (3 frames in a row)', async () => {
    const { clientSocket, serverTransport } = await runXxHandshake()

    const messages = [
        new Uint8Array([0x01]),
        new Uint8Array([0x02, 0x03]),
        new Uint8Array([0x04, 0x05, 0x06, 0x07])
    ]

    for (let i = 0; i < messages.length; i += 1) {
        const ct = await serverTransport.encryptFrame(messages[i])
        const decoded = await clientSocket.decrypt(buildNonce(i), ct)
        assert.deepEqual(Array.from(decoded), Array.from(messages[i]))
    }
})

test('post-handshake transport: client encrypts, server decrypts (3 frames in a row)', async () => {
    const { clientSocket, serverTransport } = await runXxHandshake()

    const messages = [
        new Uint8Array([0xaa]),
        new Uint8Array([0xbb, 0xcc]),
        new Uint8Array([0xdd, 0xee, 0xff])
    ]

    for (let i = 0; i < messages.length; i += 1) {
        const ct = await clientSocket.encrypt(buildNonce(i), messages[i])
        const decoded = await serverTransport.decryptFrame(ct)
        assert.deepEqual(Array.from(decoded), Array.from(messages[i]))
    }
})

test('post-handshake transport: bidirectional interleaved frames stay aligned', async () => {
    const { clientSocket, serverTransport } = await runXxHandshake()

    const ctsFromServer: Uint8Array[] = []
    const ctsFromClient: Uint8Array[] = []
    for (let i = 0; i < 4; i += 1) {
        ctsFromServer.push(await serverTransport.encryptFrame(new Uint8Array([0x10 + i])))
        ctsFromClient.push(await clientSocket.encrypt(buildNonce(i), new Uint8Array([0x20 + i])))
    }

    for (let i = 0; i < 4; i += 1) {
        const fromServer = await clientSocket.decrypt(buildNonce(i), ctsFromServer[i])
        const fromClient = await serverTransport.decryptFrame(ctsFromClient[i])
        assert.deepEqual(Array.from(fromServer), [0x10 + i])
        assert.deepEqual(Array.from(fromClient), [0x20 + i])
    }
})
