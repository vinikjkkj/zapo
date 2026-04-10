/** Cross-check: image upload reaches fake media server with encrypted bytes. */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'
import { WaMediaCrypto } from '../transport/crypto'

import { createZapoClient } from './helpers/zapo-client'

test('paired client.sendMessage uploads an image to the fake media HTTPS listener', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'image-upload' })

    const materialPromise = new Promise<{
        readonly advSecretKey: Uint8Array
        readonly identityPublicKey: Uint8Array
    }>((resolve) => {
        client.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
            const parsed = parsePairingQrString(event.qr)
            resolve({
                advSecretKey: parsed.advSecretKey,
                identityPublicKey: parsed.identityPublicKey
            })
        })
    })
    const pairedPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('auth_paired timeout')), 60_000)
        client.once('auth_paired', () => {
            clearTimeout(timer)
            resolve()
        })
    })

    const peerJid = '5511777777777@s.whatsapp.net'
    const plaintext = new Uint8Array(4 * 1024)
    for (let index = 0; index < plaintext.byteLength; index += 1) {
        plaintext[index] = (index * 17 + 5) & 0xff
    }

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.runPairing(
            pipeline,
            { deviceJid: '5511999999999:1@s.whatsapp.net' },
            () => materialPromise
        )

        await pairedPromise
        const pipelineAfterPair = await server
            .waitForNextAuthenticatedPipeline(5_000)
            .catch(() => server.waitForAuthenticatedPipeline())

        await server.createFakePeer({ jid: peerJid }, pipelineAfterPair)
        await server.triggerPreKeyUpload(pipelineAfterPair)

        const messagePromise = server.expectStanza(
            { tag: 'message', to: peerJid },
            { timeoutMs: 8_000 }
        )

        await client.sendMessage(peerJid, {
            type: 'image',
            media: plaintext,
            mimetype: 'image/jpeg',
            caption: 'fake jpeg upload'
        })

        const stanza = await messagePromise
        assert.equal(stanza.tag, 'message')
        assert.equal(stanza.attrs.to, peerJid)

        const uploads = server.capturedMediaUploadSnapshot()
        assert.equal(uploads.length, 1, `expected 1 captured upload, got ${uploads.length}`)
        const upload = uploads[0]
        assert.equal(upload.mediaType, 'image')
        assert.equal(upload.contentType, 'image/jpeg')
        assert.ok(upload.path.startsWith('/mms/image/'), `path: ${upload.path}`)
        assert.ok(upload.encryptedBytes.byteLength > plaintext.byteLength)

        assert.equal(
            (upload.encryptedBytes.byteLength - 10) % 16,
            0,
            'encrypted upload should be aligned to AES block + 10-byte MAC'
        )
        const expectedMin = Math.ceil((plaintext.byteLength + 1) / 16) * 16 + 10
        assert.ok(
            upload.encryptedBytes.byteLength >= expectedMin,
            `encrypted upload is shorter than expected: ${upload.encryptedBytes.byteLength}`
        )

        assert.ok(typeof WaMediaCrypto.decryptBytes === 'function')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
