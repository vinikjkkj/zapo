import assert from 'node:assert/strict'
import test from 'node:test'

import { hkdf } from '@crypto/core/hkdf'
import { aesGcmEncrypt } from '@crypto/core/primitives'
import {
    decryptMediaRetryNotification,
    encryptServerErrorReceipt,
    MEDIA_RETRY_IV_SIZE
} from '@media/crypto/media-retry'
import { WaMediaCrypto } from '@media/crypto/WaMediaCrypto'
import { proto, type Proto } from '@proto'
import { bytesToHex, TEXT_ENCODER } from '@util/bytes'

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

const STANZA_ID = '3EB0RMRTEST01'

function fixedMediaKey(): Uint8Array {
    const mediaKey = new Uint8Array(32)
    for (let index = 0; index < mediaKey.length; index += 1) {
        mediaKey[index] = index
    }
    return mediaKey
}

function fixedIv(): Uint8Array {
    const iv = new Uint8Array(MEDIA_RETRY_IV_SIZE)
    for (let index = 0; index < iv.length; index += 1) {
        iv[index] = 0xa0 + index
    }
    return iv
}

function sealNotification(
    mediaKey: Uint8Array,
    iv: Uint8Array,
    stanzaId: string,
    payload: Proto.MediaRetryNotification.$Properties
): Uint8Array {
    const key = hkdf(mediaKey, null, TEXT_ENCODER.encode('WhatsApp Media Retry Notification'), 32)
    return aesGcmEncrypt(
        key,
        iv,
        proto.MediaRetryNotification.encode(payload).finish(),
        TEXT_ENCODER.encode(stanzaId)
    )
}

test('media retry request matches the WhatsApp Web payload for a known key/iv', async () => {
    const { ciphertext, iv } = await encryptServerErrorReceipt(
        fixedMediaKey(),
        STANZA_ID,
        fixedIv()
    )

    assert.equal(
        bytesToHex(ciphertext),
        '452b8a6b77056e26e155ee876a78fe2ad5fa6b945d78a1da315ce420e00cb4'
    )
    assert.deepEqual(iv, fixedIv())
})

test('media retry request generates a fresh 12-byte iv when none is supplied', async () => {
    const mediaKey = fixedMediaKey()
    const first = await encryptServerErrorReceipt(mediaKey, STANZA_ID)
    const second = await encryptServerErrorReceipt(mediaKey, STANZA_ID)

    assert.equal(first.iv.byteLength, MEDIA_RETRY_IV_SIZE)
    assert.equal(second.iv.byteLength, MEDIA_RETRY_IV_SIZE)
    assert.notDeepEqual(first.iv, second.iv)
    assert.notDeepEqual(first.ciphertext, second.ciphertext)
})

test('media retry notification decrypts to the reupload result', () => {
    const mediaKey = fixedMediaKey()
    const iv = fixedIv()
    const ciphertext = sealNotification(mediaKey, iv, STANZA_ID, {
        stanzaId: STANZA_ID,
        directPath: '/v/t62.7118-24/reuploaded',
        result: proto.MediaRetryNotification.ResultType.SUCCESS
    })

    const decoded = decryptMediaRetryNotification({ mediaKey, ciphertext, iv, stanzaId: STANZA_ID })

    assert.equal(decoded.stanzaId, STANZA_ID)
    assert.equal(decoded.directPath, '/v/t62.7118-24/reuploaded')
    assert.equal(decoded.result, proto.MediaRetryNotification.ResultType.SUCCESS)
})

test('media retry notification is bound to its stanza id through the aad', () => {
    const mediaKey = fixedMediaKey()
    const iv = fixedIv()
    const ciphertext = sealNotification(mediaKey, iv, STANZA_ID, { stanzaId: STANZA_ID })

    assert.throws(() =>
        decryptMediaRetryNotification({ mediaKey, ciphertext, iv, stanzaId: 'ANOTHERID' })
    )
})

test('media retry crypto rejects a wrong-sized media key or iv', async () => {
    const mediaKey = fixedMediaKey()
    await assert.rejects(() => encryptServerErrorReceipt(new Uint8Array(16), STANZA_ID))
    await assert.rejects(() => encryptServerErrorReceipt(mediaKey, STANZA_ID, new Uint8Array(16)))
    assert.throws(() =>
        decryptMediaRetryNotification({
            mediaKey,
            ciphertext: new Uint8Array(32),
            iv: new Uint8Array(16),
            stanzaId: STANZA_ID
        })
    )
})
