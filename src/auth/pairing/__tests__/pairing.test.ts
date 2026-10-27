import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSignedCompanionIdentity, preparePrimaryHello } from '@auth/pairing/companion-host'
import {
    completeCompanionFinish,
    createCompanionHello,
    PBKDF2_ITERATIONS
} from '@auth/pairing/pairing-code-crypto'
import { WaPairingFlow } from '@auth/pairing/WaPairingFlow'
import { WaQrFlow } from '@auth/pairing/WaQrFlow'
import type { WaAuthCredentials } from '@auth/types'
import { randomBytesAsync, X25519 } from '@crypto'
import { createNoopLogger, type Logger } from '@infra/log/types'
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

async function setupLinkCode(
    options: {
        /** Runs before each `companion_hello` reply (1-based); a rejection fails that IQ. */
        readonly beforeHelloReply?: (index: number) => Promise<void> | undefined
        readonly onRefresh?: () => void
        readonly logger?: Logger
    } = {}
) {
    const [noiseKeyPair, identityKeyPair, signedPreKeyPair, primaryIdentity, advSecretKey] =
        await Promise.all([
            X25519.generateKeyPair(),
            X25519.generateKeyPair(),
            X25519.generateKeyPair(),
            X25519.generateKeyPair(),
            randomBytesAsync(32)
        ])
    let credentials: WaAuthCredentials = {
        noiseKeyPair,
        registrationInfo: { registrationId: 7, identityKeyPair },
        signedPreKey: {
            keyId: 1,
            keyPair: signedPreKeyPair,
            signature: new Uint8Array(64),
            uploaded: false
        },
        advSecretKey
    }
    const hellos: BinaryNode[] = []
    const finishes: BinaryNode[] = []
    const refreshes: boolean[] = []
    const flow = new WaPairingFlow({
        logger: options.logger ?? createNoopLogger(),
        auth: {
            getCredentials: () => credentials,
            updateCredentials: async (next) => {
                credentials = next
            }
        },
        socket: {
            sendNode: async () => undefined,
            query: async (node) => {
                const reg = (node.content as BinaryNode[])[0]
                if (reg.attrs.stage !== 'companion_hello') {
                    finishes.push(node)
                    return { tag: 'iq', attrs: { type: 'result' } }
                }
                hellos.push(node)
                const index = hellos.length
                await options.beforeHelloReply?.(index)
                return {
                    tag: 'iq',
                    attrs: { type: 'result' },
                    content: [
                        {
                            tag: 'link_code_companion_reg',
                            attrs: { stage: 'companion_hello' },
                            content: [
                                {
                                    tag: 'link_code_pairing_ref',
                                    attrs: {},
                                    content: `ref-${index}`
                                }
                            ]
                        }
                    ]
                }
            }
        },
        qrFlow: { setRefs: () => undefined, clear: () => undefined, refreshCurrentQr: () => true },
        device: { browser: 'firefox', osDisplayName: 'Windows', platform: '3' },
        callbacks: {
            emitPairingCode: () => undefined,
            emitPairingRefresh: (forceManual) => {
                refreshes.push(forceManual)
                options.onRefresh?.()
            },
            emitPaired: () => undefined
        }
    })

    const pairDevice: BinaryNode = {
        tag: 'iq',
        attrs: { id: 'pd-1', from: 's.whatsapp.net', type: 'set' },
        content: [
            {
                tag: 'pair-device',
                attrs: {},
                content: [{ tag: 'ref', attrs: {}, content: 'qr-ref' }]
            }
        ]
    }
    const primaryHello = async (
        ref: string,
        code: string,
        hello: BinaryNode
    ): Promise<BinaryNode> => {
        const wrapped = ((hello.content as BinaryNode[])[0].content as BinaryNode[])[0]
            .content as Uint8Array
        const prepared = await preparePrimaryHello({
            pairingCode: code,
            wrappedCompanionEphemeralPub: wrapped
        })
        return {
            tag: 'notification',
            attrs: { id: 'n-1', from: 's.whatsapp.net', type: 'link_code_companion_reg' },
            content: [
                {
                    tag: 'link_code_companion_reg',
                    attrs: { stage: 'primary_hello' },
                    content: [
                        { tag: 'link_code_pairing_ref', attrs: {}, content: ref },
                        {
                            tag: 'link_code_pairing_wrapped_primary_ephemeral_pub',
                            attrs: {},
                            content: prepared.wrappedPrimaryEphemeralPub
                        },
                        { tag: 'primary_identity_pub', attrs: {}, content: primaryIdentity.pubKey }
                    ]
                }
            ]
        }
    }

    return { flow, hellos, finishes, refreshes, pairDevice, primaryHello }
}

async function waitUntil(check: () => boolean): Promise<void> {
    for (let i = 0; i < 300 && !check(); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    await new Promise((resolve) => setImmediate(resolve))
    assert.ok(check(), 'condition not reached in time')
}

test('pair-device on a new connection registers the pending pairing code again', async () => {
    const ctx = await setupLinkCode()
    await ctx.flow.handleIncomingIqSet(ctx.pairDevice)
    assert.equal(ctx.hellos.length, 0)

    const code = await ctx.flow.requestPairingCode('5511999999999')
    await ctx.flow.handleIncomingIqSet(ctx.pairDevice)
    await waitUntil(() => ctx.hellos.length === 2)

    const pushAttr = (hello: BinaryNode) =>
        (hello.content as BinaryNode[])[0].attrs.should_show_push_notification
    assert.equal(pushAttr(ctx.hellos[0]), 'true')
    assert.equal(pushAttr(ctx.hellos[1]), 'false')

    await ctx.flow.handleLinkCodeNotification(await ctx.primaryHello('ref-1', code, ctx.hellos[0]))
    assert.equal(ctx.finishes.length, 0)

    await ctx.flow.handleLinkCodeNotification(await ctx.primaryHello('ref-2', code, ctx.hellos[1]))
    assert.equal(ctx.finishes.length, 1)
})

test('a failed re-registration drops the pairing code and asks for a manual refresh', async () => {
    const ctx = await setupLinkCode({
        beforeHelloReply: (index) =>
            index > 1 ? Promise.reject(new Error('rate-overlimit')) : undefined
    })
    await ctx.flow.requestPairingCode('5511999999999')
    await ctx.flow.handleIncomingIqSet(ctx.pairDevice)
    await waitUntil(() => ctx.refreshes.length === 1)

    assert.deepEqual(ctx.refreshes, [true])
    assert.equal(ctx.flow.hasPairingSession(), false)
})

test('a re-registration outliving its connection cannot drop the newer one', async () => {
    let failStale!: (error: Error) => void
    let releaseLatest!: () => void
    const ctx = await setupLinkCode({
        beforeHelloReply: (index) => {
            if (index === 2) {
                return new Promise<void>((_, reject) => {
                    failStale = reject
                })
            }
            if (index === 3) {
                return new Promise<void>((resolve) => {
                    releaseLatest = resolve
                })
            }
            return undefined
        }
    })
    const code = await ctx.flow.requestPairingCode('5511999999999')
    await ctx.flow.handleIncomingIqSet(ctx.pairDevice)
    await waitUntil(() => ctx.hellos.length === 2)
    await ctx.flow.handleIncomingIqSet(ctx.pairDevice)
    await waitUntil(() => ctx.hellos.length === 3)

    failStale(new Error('companion hello timed out'))
    releaseLatest()
    await new Promise((resolve) => setTimeout(resolve, 20))

    assert.deepEqual(ctx.refreshes, [])
    await ctx.flow.handleLinkCodeNotification(await ctx.primaryHello('ref-3', code, ctx.hellos[2]))
    assert.equal(ctx.finishes.length, 1)
})

test('a throwing pairing refresh listener does not escape the re-registration', async () => {
    const warnings: string[] = []
    const ctx = await setupLinkCode({
        logger: {
            ...createNoopLogger(),
            warn: (message) => {
                warnings.push(message)
            }
        },
        beforeHelloReply: (index) =>
            index > 1 ? Promise.reject(new Error('rate-overlimit')) : undefined,
        onRefresh: () => {
            throw new Error('listener failed')
        }
    })
    await ctx.flow.requestPairingCode('5511999999999')
    await ctx.flow.handleIncomingIqSet(ctx.pairDevice)

    await waitUntil(() => warnings.includes('pairing code re-registration failed unexpectedly'))
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
