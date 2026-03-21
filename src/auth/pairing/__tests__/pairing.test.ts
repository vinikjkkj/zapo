import assert from 'node:assert/strict'
import test from 'node:test'

import { PBKDF2_ITERATIONS } from '@auth/pairing/constants'
import { completeCompanionFinish, createCompanionHello } from '@auth/pairing/WaPairingCodeCrypto'
import { WaQrFlow } from '@auth/pairing/WaQrFlow'
import type { Logger } from '@infra/log/types'

function createLogger(): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
    }
}

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
        logger: createLogger(),
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
        logger: createLogger(),
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
