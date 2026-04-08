/**
 * Cross-validation tests for WaFakeNoiseHandshake.
 *
 * The strategy here is intentional: instead of validating the fake server
 * handshake against itself (tautology), we run the *real* zapo-js
 * `WaNoiseHandshake` (initiator) against `WaFakeNoiseHandshake` (responder)
 * and check that they reach the same shared keys after a complete XX
 * handshake. If both ends agree on the post-handshake keys, every protocol
 * step in between matched the WhatsApp Web specification.
 *
 * NOTE: this file is allowed to import zapo-js directly because the entire
 * point of cross-check tests is to drive the fake server alongside the real
 * lib. See the eslint override for `*.cross-check.test.ts`.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { WaNoiseHandshake } from 'zapo-js/transport'

import { aesGcmDecrypt, aesGcmEncrypt, type CryptoKey, X25519 } from '../../transport/crypto'
import { proto } from '../../transport/protos'
import { WaFakeNoiseHandshake } from '../WaFakeNoiseHandshake'

const NOISE_XX_NAME = new TextEncoder().encode('Noise_XX_25519_AESGCM_SHA256\0\0\0\0')
const PROLOGUE = new Uint8Array([0x57, 0x41, 0x06, 0x03])

function buildNonce(counter: number): Uint8Array {
    const nonce = new Uint8Array(12)
    const view = new DataView(nonce.buffer)
    view.setUint32(8, counter, false)
    return nonce
}

function encryptWithKey(
    key: CryptoKey,
    counter: number,
    plaintext: Uint8Array
): Promise<Uint8Array> {
    return aesGcmEncrypt(key, buildNonce(counter), plaintext)
}

function decryptWithKey(
    key: CryptoKey,
    counter: number,
    ciphertext: Uint8Array
): Promise<Uint8Array> {
    return aesGcmDecrypt(key, buildNonce(counter), ciphertext)
}

test('XX handshake: client (lib) and server (fake) agree on transport keys', async () => {
    const client = new WaNoiseHandshake()
    const server = new WaFakeNoiseHandshake()

    // 0. Both sides initialize with the same protocol name + prologue.
    await client.start(NOISE_XX_NAME, PROLOGUE)
    await server.start(NOISE_XX_NAME, PROLOGUE)

    // 1. Generate ephemeral keypairs on both ends.
    const clientEphemeral = await X25519.generateKeyPair()
    const serverEphemeral = await X25519.generateKeyPair()
    const serverStatic = await X25519.generateKeyPair()
    const clientStatic = await X25519.generateKeyPair()

    // 2. Client builds and sends ClientHello.
    await client.authenticate(clientEphemeral.pubKey)
    const clientHello = proto.HandshakeMessage.encode({
        clientHello: { ephemeral: clientEphemeral.pubKey }
    }).finish()

    // ---- wire ---->

    // 3. Server receives ClientHello.
    const parsedHello = proto.HandshakeMessage.decode(clientHello)
    const clientHelloMsg = parsedHello.clientHello
    if (!clientHelloMsg?.ephemeral) {
        throw new Error('expected client hello with ephemeral')
    }
    const clientEphemeralPub = clientHelloMsg.ephemeral
    await server.authenticate(clientEphemeralPub)

    // 4. Server builds ServerHello.
    await server.authenticate(serverEphemeral.pubKey)
    await server.mixIntoKey(await X25519.scalarMult(serverEphemeral.privKey, clientEphemeralPub)) // ee
    const encryptedServerStatic = await server.encrypt(serverStatic.pubKey) // s
    await server.mixIntoKey(await X25519.scalarMult(serverStatic.privKey, clientEphemeralPub)) // es
    const encryptedCertPayload = await server.encrypt(new Uint8Array([0x01, 0x02, 0x03]))
    const serverHello = proto.HandshakeMessage.encode({
        serverHello: {
            ephemeral: serverEphemeral.pubKey,
            static: encryptedServerStatic,
            payload: encryptedCertPayload
        }
    }).finish()

    // <---- wire ----

    // 5. Client receives ServerHello and processes it.
    const parsedServerHello = proto.HandshakeMessage.decode(serverHello)
    const sh = parsedServerHello.serverHello
    if (!sh?.ephemeral || !sh.static || !sh.payload) {
        throw new Error('expected server hello with ephemeral/static/payload')
    }
    await client.authenticate(sh.ephemeral)
    await client.mixIntoKey(await X25519.scalarMult(clientEphemeral.privKey, sh.ephemeral))
    const decryptedServerStatic = await client.decrypt(sh.static)
    assert.deepEqual(Array.from(decryptedServerStatic), Array.from(serverStatic.pubKey))
    await client.mixIntoKey(await X25519.scalarMult(clientEphemeral.privKey, decryptedServerStatic))
    const decryptedPayload = await client.decrypt(sh.payload)
    assert.deepEqual(Array.from(decryptedPayload), [0x01, 0x02, 0x03])

    // 6. Client builds ClientFinish.
    const encryptedClientStatic = await client.encrypt(clientStatic.pubKey)
    await client.mixIntoKey(await X25519.scalarMult(clientStatic.privKey, serverEphemeral.pubKey))
    const encryptedClientPayload = await client.encrypt(new Uint8Array([0xaa, 0xbb]))
    const clientFinish = proto.HandshakeMessage.encode({
        clientFinish: {
            static: encryptedClientStatic,
            payload: encryptedClientPayload
        }
    }).finish()

    // ---- wire ---->

    // 7. Server receives ClientFinish.
    const parsedFinish = proto.HandshakeMessage.decode(clientFinish)
    const cf = parsedFinish.clientFinish
    if (!cf?.static || !cf.payload) {
        throw new Error('expected client finish with static/payload')
    }
    const decryptedClientStatic = await server.decrypt(cf.static)
    assert.deepEqual(Array.from(decryptedClientStatic), Array.from(clientStatic.pubKey))
    await server.mixIntoKey(await X25519.scalarMult(serverEphemeral.privKey, decryptedClientStatic))
    const decryptedClientFinishPayload = await server.decrypt(cf.payload)
    assert.deepEqual(Array.from(decryptedClientFinishPayload), [0xaa, 0xbb])

    // 8. Both sides finish — keys must match in mirrored roles.
    const clientSocket = await client.finish()
    const serverKeys = await server.finish()

    // Encrypt on the server side, decrypt on the client side (and vice versa)
    // using independent counters. If the post-handshake keys are aligned, the
    // ciphertext encrypted with the server's send key MUST decrypt with the
    // client's read key.
    const messageA = new Uint8Array([0x10, 0x20, 0x30])
    const messageB = new Uint8Array([0xff, 0xee, 0xdd])

    const ctFromServer = await encryptWithKey(serverKeys.sendKey, 0, messageA)
    const decodedByClient = await clientSocket.decrypt(buildNonce(0), ctFromServer)
    assert.deepEqual(Array.from(decodedByClient), Array.from(messageA))

    const ctFromClient = await clientSocket.encrypt(buildNonce(0), messageB)
    const decodedByServer = await decryptWithKey(serverKeys.recvKey, 0, ctFromClient)
    assert.deepEqual(Array.from(decodedByServer), Array.from(messageB))
})
