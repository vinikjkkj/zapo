import assert from 'node:assert/strict'
import test from 'node:test'

import { bytesToBase64, bytesToBase64UrlSafe } from '../../../transport/util'
import { mintPairingRefs, parsePairingQrString } from '../pair-device'

test('parsePairingQrString decodes base64url key fields', () => {
    const noise = new Uint8Array(Array.from({ length: 32 }, (_, index) => (index * 7 + 3) & 0xff))
    const identity = new Uint8Array(
        Array.from({ length: 32 }, (_, index) => (255 - index * 5) & 0xff)
    )
    const advSecret = new Uint8Array(
        Array.from({ length: 32 }, (_, index) => (index * 13 + 11) & 0xff)
    )

    const qr = [
        'fake-ref',
        bytesToBase64UrlSafe(noise),
        bytesToBase64UrlSafe(identity),
        bytesToBase64UrlSafe(advSecret),
        'IOS'
    ].join(',')

    const parsed = parsePairingQrString(qr)

    assert.deepEqual(parsed.noisePublicKey, noise)
    assert.deepEqual(parsed.identityPublicKey, identity)
    assert.deepEqual(parsed.advSecretKey, advSecret)
    assert.equal(parsed.platform, 'IOS')
})

test('parsePairingQrString still decodes classic base64 key fields', () => {
    const noise = new Uint8Array(Array.from({ length: 32 }, (_, index) => (index * 9 + 1) & 0xff))
    const identity = new Uint8Array(
        Array.from({ length: 32 }, (_, index) => (index * 3 + 17) & 0xff)
    )
    const advSecret = new Uint8Array(
        Array.from({ length: 32 }, (_, index) => (index * 15 + 19) & 0xff)
    )

    const qr = [
        'fake-ref',
        bytesToBase64(noise),
        bytesToBase64(identity),
        bytesToBase64(advSecret),
        'IOS'
    ].join(',')

    const parsed = parsePairingQrString(qr)

    assert.deepEqual(parsed.noisePublicKey, noise)
    assert.deepEqual(parsed.identityPublicKey, identity)
    assert.deepEqual(parsed.advSecretKey, advSecret)
    assert.equal(parsed.platform, 'IOS')
})

test('parsePairingQrString supports refs containing commas', () => {
    const noise = new Uint8Array(Array.from({ length: 32 }, (_, index) => (index * 11 + 7) & 0xff))
    const identity = new Uint8Array(
        Array.from({ length: 32 }, (_, index) => (index * 5 + 23) & 0xff)
    )
    const advSecret = new Uint8Array(
        Array.from({ length: 32 }, (_, index) => (index * 17 + 29) & 0xff)
    )

    const qr = [
        'ref,with,commas',
        bytesToBase64(noise),
        bytesToBase64(identity),
        bytesToBase64(advSecret),
        'IOS'
    ].join(',')

    const parsed = parsePairingQrString(qr)

    assert.equal(parsed.ref, 'ref,with,commas')
    assert.deepEqual(parsed.noisePublicKey, noise)
    assert.deepEqual(parsed.identityPublicKey, identity)
    assert.deepEqual(parsed.advSecretKey, advSecret)
    assert.equal(parsed.platform, 'IOS')
})

test('mintPairingRefs produces refs that survive a line-based round trip', async () => {
    const refs = await mintPairingRefs()

    assert.equal(refs.length, 6)
    assert.equal(new Set(refs).size, 6, 'each ref is distinct')
    for (const ref of refs) {
        assert.ok(ref.length > 0)
        // A ref is pasted into a comma-separated QR payload and read back a
        // line at a time, so any of these would silently truncate it.
        assert.ok(!/[\r\n,\s]/.test(ref), `ref must stay printable and single-line: ${ref}`)
    }
})

test('mintPairingRefs honours a custom count', async () => {
    assert.equal((await mintPairingRefs(1)).length, 1)
})
