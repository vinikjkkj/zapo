import assert from 'node:assert/strict'
import test from 'node:test'

import { proto } from '@proto'
import { buildLoginPayload, buildRegistrationPayload } from '@transport/noise/WaClientPayload'
import { WaFrameCodec } from '@transport/noise/WaFrameCodec'
import { verifyNoiseCertificateChain } from '@transport/noise/WaNoiseCert'
import { WA_VERSION } from '@version-spec'

test('client payload builders validate required fields', () => {
    const loginPayload = buildLoginPayload({
        username: 123,
        device: 1,
        versionBase: WA_VERSION,
        deviceBrowser: 'Chrome',
        deviceOsDisplayName: 'Windows'
    })
    assert.ok(loginPayload.length > 0)

    assert.throws(
        () =>
            buildLoginPayload({
                username: 0,
                device: 1,
                versionBase: WA_VERSION,
                deviceBrowser: 'Chrome',
                deviceOsDisplayName: 'Windows'
            }),
        /valid numeric username/
    )

    const registrationPayload = buildRegistrationPayload({
        registrationInfo: {
            registrationId: 123,
            identityKeyPair: {
                pubKey: new Uint8Array(32).fill(1),
                privKey: new Uint8Array(32).fill(2)
            }
        },
        signedPreKey: {
            keyId: 7,
            keyPair: {
                pubKey: new Uint8Array(32).fill(3),
                privKey: new Uint8Array(32).fill(4)
            },
            signature: new Uint8Array(64).fill(5),
            uploaded: false
        },
        versionBase: WA_VERSION,
        deviceBrowser: 'Chrome',
        deviceOsDisplayName: 'Windows'
    })
    assert.ok(registrationPayload.length > 0)
})

test('buildLoginPayload advertises the 4th and 5th version parts when supplied', () => {
    const loginPayload = buildLoginPayload({
        username: 123,
        device: 1,
        versionBase: '2.3000.1040229458.4.5',
        deviceBrowser: 'Chrome',
        deviceOsDisplayName: 'Windows'
    })
    const appVersion = proto.ClientPayload.decode(loginPayload).userAgent?.appVersion
    assert.ok(appVersion)
    assert.equal(appVersion.primary, 2)
    assert.equal(appVersion.secondary, 3000)
    assert.equal(appVersion.tertiary, 1040229458)
    assert.equal(appVersion.quaternary, 4)
    assert.equal(appVersion.quinary, 5)
})

test('buildLoginPayload leaves the 4th/5th version parts unset for a 3-part version', () => {
    const loginPayload = buildLoginPayload({
        username: 123,
        device: 1,
        versionBase: '2.3000.1040229458',
        deviceBrowser: 'Chrome',
        deviceOsDisplayName: 'Windows'
    })
    const appVersion = proto.ClientPayload.decode(loginPayload).userAgent?.appVersion
    assert.ok(appVersion)
    assert.ok(!appVersion.quaternary)
    assert.ok(!appVersion.quinary)
})

test('noise frame codec encodes/decodes frames and rejects oversized payloads', () => {
    const codec = new WaFrameCodec(new Uint8Array([1, 2]), 10)
    const wire = codec.encodeFrame(new Uint8Array([9, 8, 7]))

    assert.deepEqual(wire.subarray(0, 2), new Uint8Array([1, 2]))

    const readCodec = new WaFrameCodec(undefined, 10)
    const decoded = readCodec.pushWireChunk(wire.subarray(2))
    assert.equal(decoded.length, 1)
    assert.deepEqual(decoded[0], new Uint8Array([9, 8, 7]))

    assert.throws(() => codec.encodeFrame(new Uint8Array(11)), /too large/)
    assert.throws(() => new WaFrameCodec(undefined, 1 << 24), /lower than protocol limit/)
})

test('noise certificate chain verification rejects invalid payloads', async () => {
    await assert.rejects(
        () => verifyNoiseCertificateChain(new Uint8Array([1, 2, 3]), new Uint8Array(32)),
        /missing leaf\/intermediate|index out of range|invalid wire type|illegal tag/
    )
})
