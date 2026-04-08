import assert from 'node:assert/strict'
import test from 'node:test'

import { proto } from '../../../transport/protos'
import { ClientPayloadValidationError, parseClientPayload } from '../client-payload-validate'

function buildLoginBytes(): Uint8Array {
    return proto.ClientPayload.encode({
        username: 5511999999999,
        device: 1,
        lc: 7,
        passive: false,
        pull: true,
        userAgent: {
            platform: proto.ClientPayload.UserAgent.Platform.WEB,
            appVersion: { primary: 2, secondary: 3000, tertiary: 1 }
        },
        webInfo: {
            webSubPlatform: proto.ClientPayload.WebInfo.WebSubPlatform.WEB_BROWSER
        }
    }).finish()
}

function buildRegistrationBytes(): Uint8Array {
    const fakeIdentity = new Uint8Array(32).fill(0xa1)
    const fakeSignedPreKey = new Uint8Array(32).fill(0xb2)
    const fakeSignature = new Uint8Array(64).fill(0xc3)
    const fakeRegId = new Uint8Array([0, 0, 0, 0x07])
    const fakeBuildHash = new Uint8Array(16).fill(0xd4)
    const fakeDeviceProps = new Uint8Array([0x00])

    return proto.ClientPayload.encode({
        passive: false,
        pull: true,
        devicePairingData: {
            buildHash: fakeBuildHash,
            deviceProps: fakeDeviceProps,
            eRegid: fakeRegId,
            eKeytype: new Uint8Array([0x05]),
            eIdent: fakeIdentity,
            eSkeyId: new Uint8Array([0, 0, 0x01]),
            eSkeyVal: fakeSignedPreKey,
            eSkeySig: fakeSignature
        }
    }).finish()
}

test('parses a login ClientPayload', () => {
    const parsed = parseClientPayload(buildLoginBytes())
    assert.equal(parsed.kind, 'login')
    if (parsed.kind !== 'login') return
    assert.equal(parsed.username, '5511999999999')
    assert.equal(parsed.device, 1)
    assert.equal(parsed.loginCounter, 7)
})

test('parses a registration ClientPayload', () => {
    const parsed = parseClientPayload(buildRegistrationBytes())
    assert.equal(parsed.kind, 'registration')
    if (parsed.kind !== 'registration') return
    assert.equal(parsed.devicePairingData.eRegid?.byteLength, 4)
    assert.equal(parsed.devicePairingData.eIdent?.byteLength, 32)
    assert.equal(parsed.devicePairingData.eSkeySig?.byteLength, 64)
})

test('rejects login payload missing username', () => {
    const bytes = proto.ClientPayload.encode({
        passive: false,
        pull: true
    }).finish()
    assert.throws(
        () => parseClientPayload(bytes),
        (err) => err instanceof ClientPayloadValidationError && err.code === 'missing_username'
    )
})

test('rejects registration payload missing identity key', () => {
    const bytes = proto.ClientPayload.encode({
        devicePairingData: {
            buildHash: new Uint8Array(16),
            deviceProps: new Uint8Array([0x00]),
            eRegid: new Uint8Array([0, 0, 0, 1]),
            eKeytype: new Uint8Array([5]),
            eSkeyId: new Uint8Array([0, 0, 1]),
            eSkeyVal: new Uint8Array(32),
            eSkeySig: new Uint8Array(64)
        }
    }).finish()
    assert.throws(
        () => parseClientPayload(bytes),
        (err) => err instanceof ClientPayloadValidationError && err.code === 'missing_field'
    )
})

test('rejects garbage bytes', () => {
    assert.throws(
        () => parseClientPayload(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff])),
        (err) => err instanceof ClientPayloadValidationError && err.code === 'invalid_proto'
    )
})
