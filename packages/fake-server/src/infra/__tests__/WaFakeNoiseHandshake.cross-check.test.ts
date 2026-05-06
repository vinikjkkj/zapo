/** Cross-check: lib handshake and fake-server handshake must derive mirrored keys. */

import assert from 'node:assert/strict'
import test from 'node:test'

import { WaNoiseHandshake } from 'zapo-js/transport'

import { aesGcmDecrypt, aesGcmEncrypt, X25519 } from '../../transport/crypto'
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

function encryptWithKey(key: Uint8Array, counter: number, plaintext: Uint8Array): Uint8Array {
    return aesGcmEncrypt(key, buildNonce(counter), plaintext)
}

function decryptWithKey(key: Uint8Array, counter: number, ciphertext: Uint8Array): Uint8Array {
    return aesGcmDecrypt(key, buildNonce(counter), ciphertext)
}

test('XX handshake: client (lib) and server (fake) agree on transport keys', async () => {
    const client = new WaNoiseHandshake()
    const server = new WaFakeNoiseHandshake()

    client.start(NOISE_XX_NAME, PROLOGUE)
    server.start(NOISE_XX_NAME, PROLOGUE)

    const clientEphemeral = await X25519.generateKeyPair()
    const serverEphemeral = await X25519.generateKeyPair()
    const serverStatic = await X25519.generateKeyPair()
    const clientStatic = await X25519.generateKeyPair()

    client.authenticate(clientEphemeral.pubKey)
    const clientHello = proto.HandshakeMessage.encode({
        clientHello: { ephemeral: clientEphemeral.pubKey }
    }).finish()

    const parsedHello = proto.HandshakeMessage.decode(clientHello)
    const clientHelloMsg = parsedHello.clientHello
    if (!clientHelloMsg?.ephemeral) {
        throw new Error('expected client hello with ephemeral')
    }
    const clientEphemeralPub = clientHelloMsg.ephemeral
    server.authenticate(clientEphemeralPub)

    server.authenticate(serverEphemeral.pubKey)
    server.mixIntoKey(await X25519.scalarMult(serverEphemeral.privKey, clientEphemeralPub)) // ee
    const encryptedServerStatic = server.encrypt(serverStatic.pubKey) // s
    server.mixIntoKey(await X25519.scalarMult(serverStatic.privKey, clientEphemeralPub)) // es
    const encryptedCertPayload = server.encrypt(new Uint8Array([0x01, 0x02, 0x03]))
    const serverHello = proto.HandshakeMessage.encode({
        serverHello: {
            ephemeral: serverEphemeral.pubKey,
            static: encryptedServerStatic,
            payload: encryptedCertPayload
        }
    }).finish()

    const parsedServerHello = proto.HandshakeMessage.decode(serverHello)
    const sh = parsedServerHello.serverHello
    if (!sh?.ephemeral || !sh.static || !sh.payload) {
        throw new Error('expected server hello with ephemeral/static/payload')
    }
    client.authenticate(sh.ephemeral)
    client.mixIntoKey(await X25519.scalarMult(clientEphemeral.privKey, sh.ephemeral))
    const decryptedServerStatic = client.decrypt(sh.static)
    assert.deepEqual(Array.from(decryptedServerStatic), Array.from(serverStatic.pubKey))
    client.mixIntoKey(await X25519.scalarMult(clientEphemeral.privKey, decryptedServerStatic))
    const decryptedPayload = client.decrypt(sh.payload)
    assert.deepEqual(Array.from(decryptedPayload), [0x01, 0x02, 0x03])

    const encryptedClientStatic = client.encrypt(clientStatic.pubKey)
    client.mixIntoKey(await X25519.scalarMult(clientStatic.privKey, serverEphemeral.pubKey))
    const encryptedClientPayload = client.encrypt(new Uint8Array([0xaa, 0xbb]))
    const clientFinish = proto.HandshakeMessage.encode({
        clientFinish: {
            static: encryptedClientStatic,
            payload: encryptedClientPayload
        }
    }).finish()

    const parsedFinish = proto.HandshakeMessage.decode(clientFinish)
    const cf = parsedFinish.clientFinish
    if (!cf?.static || !cf.payload) {
        throw new Error('expected client finish with static/payload')
    }
    const decryptedClientStatic = server.decrypt(cf.static)
    assert.deepEqual(Array.from(decryptedClientStatic), Array.from(clientStatic.pubKey))
    server.mixIntoKey(await X25519.scalarMult(serverEphemeral.privKey, decryptedClientStatic))
    const decryptedClientFinishPayload = server.decrypt(cf.payload)
    assert.deepEqual(Array.from(decryptedClientFinishPayload), [0xaa, 0xbb])

    const clientSocket = client.finish()
    const serverKeys = server.finish()

    const messageA = new Uint8Array([0x10, 0x20, 0x30])
    const messageB = new Uint8Array([0xff, 0xee, 0xdd])

    const ctFromServer = encryptWithKey(serverKeys.sendKey, 0, messageA)
    const decodedByClient = clientSocket.decrypt(ctFromServer)
    assert.deepEqual(Array.from(decodedByClient), Array.from(messageA))

    const ctFromClient = clientSocket.encrypt(messageB)
    const decodedByServer = decryptWithKey(serverKeys.recvKey, 0, ctFromClient)
    assert.deepEqual(Array.from(decodedByServer), Array.from(messageB))
})
