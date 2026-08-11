import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSignedCompanionIdentity } from '@auth/pairing/companion-host'
import {
    completeCompanionFinish,
    createCompanionHello,
    PBKDF2_ITERATIONS
} from '@auth/pairing/pairing-code-crypto'
import { WaPairingFlow } from '@auth/pairing/WaPairingFlow'
import { WaQrFlow } from '@auth/pairing/WaQrFlow'
import type { WaAuthCredentials } from '@auth/types'
import { randomBytesAsync, X25519 } from '@crypto'
import { createNoopLogger } from '@infra/log/types'
import type { BinaryNode } from '@transport/types'

test('pairing code crypto creates valid companion hello payload', async () => {
    const hello = await createCompanionHello()

    assert.equal(typeof hello.pairingCode, 'string')
    assert.equal(hello.pairingCode.length, 8)
    assert.equal(hello.companionEphemeralKeyPair.pubKey.length, 32)
    assert.ok(hello.wrappedCompanionEphemeralPub.length > 48)
    assert.ok(PBKDF2_ITERATIONS > 0)
})

test('pairing code finish validates wrapped primary payload size', async () => {
    await assert.rejects(
        () =>
            completeCompanionFinish({
                pairingCode: 'ABCDEFGH',
                wrappedPrimaryEphemeralPub: new Uint8Array(10),
                primaryIdentityPub: new Uint8Array(32),
                companionEphemeralPrivKey: new Uint8Array(32),
                registrationIdentityKeyPair: {
                    pubKey: new Uint8Array(32),
                    privKey: new Uint8Array(32)
                }
            }),
        /invalid wrapped primary payload/
    )
})

const PRIMARY_JID = '5511999999999@s.whatsapp.net'

async function setupPairSuccess() {
    const [companionIdentity, primaryIdentity, noiseKeyPair, advSecretKey] = await Promise.all([
        X25519.generateKeyPair(),
        X25519.generateKeyPair(),
        X25519.generateKeyPair(),
        randomBytesAsync(32)
    ])
    let credentials: WaAuthCredentials = {
        noiseKeyPair,
        registrationInfo: { registrationId: 42, identityKeyPair: companionIdentity },
        signedPreKey: {
            keyId: 1,
            keyPair: await X25519.generateKeyPair(),
            signature: new Uint8Array(64),
            uploaded: false
        },
        advSecretKey
    }
    const sent: BinaryNode[] = []
    const flow = new WaPairingFlow({
        logger: createNoopLogger(),
        auth: {
            getCredentials: () => credentials,
            updateCredentials: async (next) => {
                credentials = next
            }
        },
        socket: {
            sendNode: async (node) => {
                sent.push(node)
            },
            query: async () => ({ tag: 'iq', attrs: { type: 'result' } })
        },
        qrFlow: { setRefs: () => undefined, clear: () => undefined, refreshCurrentQr: () => true },
        device: { browser: 'firefox', osDisplayName: 'Windows', platform: '3' },
        callbacks: {
            emitPairingCode: () => undefined,
            emitPairingRefresh: () => undefined,
            emitPaired: () => undefined
        }
    })

    const { deviceIdentityBytes } = await buildSignedCompanionIdentity({
        accountIdentityKeyPair: primaryIdentity,
        companionIdentityPublicKey: companionIdentity.pubKey,
        advSecretKey,
        rawId: 12_345,
        keyIndex: 3,
        timestampSeconds: 1_700_000_000,
        validIndexes: [0, 3]
    })

    const buildIq = (identityBytes: Uint8Array): BinaryNode => ({
        tag: 'iq',
        attrs: { id: 'pair-1', from: 's.whatsapp.net', type: 'set' },
        content: [
            {
                tag: 'pair-success',
                attrs: {},
                content: [
                    { tag: 'device-identity', attrs: {}, content: identityBytes },
                    {
                        tag: 'device',
                        attrs: { jid: PRIMARY_JID, lid: '111222333@lid' }
                    },
                    { tag: 'platform', attrs: { name: 'android' } }
                ]
            }
        ]
    })

    return {
        flow,
        sent,
        deviceIdentityBytes,
        buildIq,
        getCredentials: () => credentials
    }
}

test('pair-success signs the identity, seeds the primary key and resets the login counter', async () => {
    const ctx = await setupPairSuccess()

    await ctx.flow.handleIncomingIqSet(ctx.buildIq(ctx.deviceIdentityBytes))

    const response = ctx.sent.at(-1)
    assert.ok(response)
    assert.equal(response.attrs.type, 'result')
    const sign = (response.content as BinaryNode[])[0]
    assert.equal(sign.tag, 'pair-device-sign')
    const identity = (sign.content as BinaryNode[])[0]
    assert.equal(identity.tag, 'device-identity')
    assert.equal(identity.attrs['key-index'], '3')

    const credentials = ctx.getCredentials()
    assert.equal(credentials.meJid, PRIMARY_JID)
    assert.equal(credentials.meLid, '111222333@lid')
    assert.equal(credentials.platform, 'android')
    assert.equal(credentials.loginCounter, 0)
})

test('pair-success answers not-authorized when the HMAC does not match', async () => {
    const ctx = await setupPairSuccess()
    const tampered = Uint8Array.from(ctx.deviceIdentityBytes)
    tampered[tampered.length - 1] ^= 0xff

    await assert.rejects(
        () => ctx.flow.handleIncomingIqSet(ctx.buildIq(tampered)),
        /HMAC validation failed/
    )

    const response = ctx.sent.at(-1)
    assert.ok(response)
    assert.equal(response.attrs.type, 'error')
    const error = (response.content as BinaryNode[])[0]
    assert.equal(error.tag, 'error')
    assert.equal(error.attrs.text, 'not-authorized')
    assert.equal(ctx.getCredentials().meJid, undefined)
})

test('pair-success is ignored once the session is registered', async () => {
    const ctx = await setupPairSuccess()
    await ctx.flow.handleIncomingIqSet(ctx.buildIq(ctx.deviceIdentityBytes))
    const afterFirst = ctx.sent.length

    await ctx.flow.handleIncomingIqSet(ctx.buildIq(ctx.deviceIdentityBytes))
    assert.equal(ctx.sent.length, afterFirst)
})

test('pair-success rejects an oversized device-identity payload', async () => {
    const ctx = await setupPairSuccess()
    await assert.rejects(
        () => ctx.flow.handleIncomingIqSet(ctx.buildIq(new Uint8Array(501))),
        /device-identity must be 1-500 bytes/
    )
})

test('qr flow emits rotating QR values and can be refreshed', async (t) => {
    const emitted: Array<{ qr: string; ttlMs: number }> = []
    const credentials = {
        noiseKeyPair: {
            pubKey: new Uint8Array(32).fill(1),
            privKey: new Uint8Array(32).fill(2)
        },
        registrationInfo: {
            registrationId: 1,
            identityKeyPair: {
                pubKey: new Uint8Array(32).fill(3),
                privKey: new Uint8Array(32).fill(4)
            }
        },
        signedPreKey: {
            keyId: 1,
            keyPair: {
                pubKey: new Uint8Array(32).fill(5),
                privKey: new Uint8Array(32).fill(6)
            },
            signature: new Uint8Array(64).fill(7),
            uploaded: false
        },
        advSecretKey: new Uint8Array(32).fill(8)
    }

    const qrFlow = new WaQrFlow({
        logger: createNoopLogger(),
        getCredentials: () => credentials,
        getDevicePlatform: () => '1',
        emitQr: (qr, ttlMs) => {
            emitted.push({ qr, ttlMs })
        }
    })

    qrFlow.setRefs(['ref-1', 'ref-2'])
    assert.equal(qrFlow.hasQr(), true)
    assert.equal(emitted.length >= 1, true)

    const refreshed = qrFlow.refreshCurrentQr()
    assert.equal(refreshed, true)
    assert.equal(emitted.length >= 2, true)

    qrFlow.clear()
    assert.equal(qrFlow.hasQr(), false)

    t.after(() => {
        qrFlow.clear()
    })
})

test('qr flow keeps hasQr true while emitting last ref', async (t) => {
    const credentials = {
        noiseKeyPair: {
            pubKey: new Uint8Array(32).fill(1),
            privKey: new Uint8Array(32).fill(2)
        },
        registrationInfo: {
            registrationId: 1,
            identityKeyPair: {
                pubKey: new Uint8Array(32).fill(3),
                privKey: new Uint8Array(32).fill(4)
            }
        },
        signedPreKey: {
            keyId: 1,
            keyPair: {
                pubKey: new Uint8Array(32).fill(5),
                privKey: new Uint8Array(32).fill(6)
            },
            signature: new Uint8Array(64).fill(7),
            uploaded: false
        },
        advSecretKey: new Uint8Array(32).fill(8)
    }
    let qrFlow: WaQrFlow | null = null
    const hasQrSnapshots: boolean[] = []
    qrFlow = new WaQrFlow({
        logger: createNoopLogger(),
        getCredentials: () => credentials,
        getDevicePlatform: () => '1',
        emitQr: () => {
            hasQrSnapshots.push(qrFlow!.hasQr())
        }
    })
    qrFlow.setRefs(['ref-last'])
    assert.deepEqual(hasQrSnapshots, [true])

    t.after(() => {
        qrFlow?.clear()
    })
})
