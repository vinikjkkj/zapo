import assert from 'node:assert/strict'
import test from 'node:test'

import { WaMediaCrypto } from '@media/crypto/WaMediaCrypto'

test('media crypto encrypt/decrypt bytes round-trip and hash validation', async () => {
    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6])

    const encrypted = await WaMediaCrypto.encryptBytes('image', mediaKey, plaintext)
    assert.ok(encrypted.ciphertextHmac.length > plaintext.length)
    assert.ok(encrypted.streamingSidecar!.byteLength > 0)

    const decrypted = await WaMediaCrypto.decryptBytes(
        'image',
        mediaKey,
        encrypted.ciphertextHmac,
        encrypted.fileSha256,
        encrypted.fileEncSha256
    )
    assert.deepEqual(decrypted.plaintext, plaintext)

    await assert.rejects(
        () =>
            WaMediaCrypto.decryptBytes(
                'image',
                mediaKey,
                encrypted.ciphertextHmac,
                new Uint8Array(32)
            ),
        /plaintext file hash mismatch/
    )
})

test('media crypto decryptBytes rejects tampered MAC by default and bypasses it when skip is set', async () => {
    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const encrypted = await WaMediaCrypto.encryptBytes('image', mediaKey, plaintext)

    const tampered = new Uint8Array(encrypted.ciphertextHmac)
    tampered[tampered.length - 1] ^= 0x01

    await assert.rejects(
        () => WaMediaCrypto.decryptBytes('image', mediaKey, tampered),
        /media MAC mismatch/
    )

    const bypassed = await WaMediaCrypto.decryptBytes(
        'image',
        mediaKey,
        tampered,
        undefined,
        undefined,
        true
    )
    assert.deepEqual(bypassed.plaintext, plaintext)
})
