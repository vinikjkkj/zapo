import assert from 'node:assert/strict'
import test from 'node:test'

import { isMlKemSupported } from '@crypto/kem/MlKem'
import { createNoopLogger } from '@infra/log/types'
import { createLegacyPreKeyStore } from '@signal/__tests__/_legacy-pre-key-store'
import {
    generateKyberPreKey,
    generatePreKeyPair,
    generateRegistrationInfo,
    generateSignedPreKey
} from '@signal/registration/keygen'
import {
    createSignalPqPolicy,
    type SignalPqPolicy,
    toPqSessionAddress
} from '@signal/session/pq-scope'
import { createSignalSessionResolver } from '@signal/session/resolver'
import { SignalProtocol } from '@signal/session/SignalProtocol'
import type { SignalAddress, SignalPreKeyBundle, SignalSessionRecord } from '@signal/types'
import { WaIdentityMemoryStore } from '@store/memory/identity.store'
import { WaPreKeyMemoryStore } from '@store/memory/pre-key.store'
import { WaSessionMemoryStore } from '@store/memory/session.store'
import { WaSignalMemoryStore } from '@store/memory/signal.store'

const skip = !isMlKemSupported()
const PQ_ON: SignalPqPolicy = { isKeyUploadEnabled: () => true, isOneToOneEnabled: () => true }
const PQ_OFF: SignalPqPolicy = { isKeyUploadEnabled: () => false, isOneToOneEnabled: () => false }

const LID_DEVICE = '5511000000002:3@lid'
const LID_ADDRESS: SignalAddress = { user: '5511000000002', server: 'lid', device: 3 }
const LID_PQ_ADDRESS = toPqSessionAddress(LID_ADDRESS)!
const PN_DEVICE = '5511000000003:3@s.whatsapp.net'

interface FetchCall {
    readonly jids: readonly string[]
    readonly options: { readonly pqSupport?: boolean } | undefined
}

async function buildHarness(policy: SignalPqPolicy) {
    const stores = {
        signal: new WaSignalMemoryStore(),
        preKey: new WaPreKeyMemoryStore(),
        session: new WaSessionMemoryStore(),
        identity: new WaIdentityMemoryStore()
    }
    await stores.signal.setRegistrationInfo(await generateRegistrationInfo())
    const peer = await generateRegistrationInfo()
    const signed = await generateSignedPreKey(1, peer.identityKeyPair.privKey)
    const oneTime = await generatePreKeyPair(9)
    const kyber = skip ? null : await generateKyberPreKey(5, peer.identityKeyPair.privKey)
    const bundleOf = (withKyber: boolean): SignalPreKeyBundle => ({
        regId: peer.registrationId,
        identity: peer.identityKeyPair.pubKey,
        signedKey: {
            id: signed.keyId,
            publicKey: signed.keyPair.pubKey,
            signature: signed.signature
        },
        oneTimeKey: { id: oneTime.keyId, publicKey: oneTime.keyPair.pubKey },
        ...(withKyber && kyber
            ? {
                  kyberKey: {
                      id: kyber.keyId,
                      publicKey: kyber.keyPair.pubKey,
                      signature: kyber.signature
                  }
              }
            : {})
    })
    const fetchCalls: FetchCall[] = []
    let withKyber = true
    let corruptKyberSignature = false
    const signalSessionSync = {
        fetchKeyBundles: async (
            targets: readonly { readonly jid: string }[],
            _timeoutMs?: number,
            options?: { readonly pqSupport?: boolean }
        ) => {
            fetchCalls.push({ jids: targets.map((target) => target.jid), options })
            return targets.map((target) => {
                const bundle = bundleOf(withKyber)
                if (corruptKyberSignature && bundle.kyberKey) {
                    const signature = bundle.kyberKey.signature.slice()
                    signature[0] ^= 0x01
                    return {
                        jid: target.jid,
                        bundle: { ...bundle, kyberKey: { ...bundle.kyberKey, signature } }
                    }
                }
                return { jid: target.jid, bundle }
            })
        }
    }
    const logger = createNoopLogger()
    const signalProtocol = new SignalProtocol(stores, logger, policy)
    const resolver = createSignalSessionResolver({
        signalProtocol,
        sessionStore: stores.session,
        identityStore: stores.identity,
        signalIdentitySync: { syncIdentityKeys: async () => undefined } as never,
        signalSessionSync: signalSessionSync as never,
        logger,
        pqPolicy: policy
    })
    return {
        stores,
        resolver,
        fetchCalls,
        setWithKyber: (value: boolean) => {
            withKyber = value
        },
        corruptKyberSignature: () => {
            corruptKyberSignature = true
        }
    }
}

const fakeSession = {
    remote: { pubKey: new Uint8Array(33), regId: 1 }
} as unknown as SignalSessionRecord

test('a 1:1 batch asks for post-quantum keys only when the policy allows it', async () => {
    const on = await buildHarness(PQ_ON)
    await on.resolver.ensureSessionsBatch([PN_DEVICE], undefined, { oneToOne: true })
    assert.deepEqual(on.fetchCalls[0].options, { pqSupport: true })

    const notOneToOne = await buildHarness(PQ_ON)
    await notOneToOne.resolver.ensureSessionsBatch([PN_DEVICE])
    assert.deepEqual(notOneToOne.fetchCalls[0].options, { pqSupport: false })

    const off = await buildHarness(PQ_OFF)
    await off.resolver.ensureSessionsBatch([PN_DEVICE], undefined, { oneToOne: true })
    assert.deepEqual(off.fetchCalls[0].options, { pqSupport: false })
})

test('an existing post-quantum session is used without a fetch', async () => {
    const harness = await buildHarness(PQ_ON)
    await harness.stores.session.setSession(LID_PQ_ADDRESS, fakeSession)

    const targets = await harness.resolver.ensureSessionsBatch([LID_DEVICE], undefined, {
        oneToOne: true
    })

    assert.equal(harness.fetchCalls.length, 0)
    assert.equal(targets.length, 1)
    assert.deepEqual(targets[0].address, LID_PQ_ADDRESS)
    assert.equal(targets[0].jid, LID_DEVICE)
})

test('the post-quantum session wins over the classic one when both exist', async () => {
    const harness = await buildHarness(PQ_ON)
    await harness.stores.session.setSession(LID_ADDRESS, fakeSession)
    await harness.stores.session.setSession(LID_PQ_ADDRESS, fakeSession)

    const [target] = await harness.resolver.ensureSessionsBatch([LID_DEVICE], undefined, {
        oneToOne: true
    })

    assert.deepEqual(target.address, LID_PQ_ADDRESS)
})

test('a classic session is kept and never upgraded', async () => {
    const harness = await buildHarness(PQ_ON)
    await harness.stores.session.setSession(LID_ADDRESS, fakeSession)

    const [target] = await harness.resolver.ensureSessionsBatch([LID_DEVICE], undefined, {
        oneToOne: true
    })

    assert.equal(harness.fetchCalls.length, 0)
    assert.deepEqual(target.address, LID_ADDRESS)
})

test('with the policy off the post-quantum session is not looked up', async () => {
    const harness = await buildHarness(PQ_OFF)
    await harness.stores.session.setSession(LID_PQ_ADDRESS, fakeSession)
    harness.setWithKyber(false)

    const [target] = await harness.resolver.ensureSessionsBatch([LID_DEVICE], undefined, {
        oneToOne: true
    })

    assert.equal(harness.fetchCalls.length, 1)
    assert.deepEqual(target.address, LID_ADDRESS)
})

test(
    'a missing session becomes post-quantum when the bundle carries a Kyber key',
    { skip },
    async () => {
        const harness = await buildHarness(PQ_ON)

        const [target] = await harness.resolver.ensureSessionsBatch([LID_DEVICE], undefined, {
            oneToOne: true
        })

        assert.deepEqual(target.address, LID_PQ_ADDRESS)
        assert.equal(target.session.version, 4)
        assert.equal(await harness.stores.session.getSession(LID_ADDRESS), null)
        assert.ok(await harness.stores.session.getSession(LID_PQ_ADDRESS))
        assert.ok(await harness.stores.identity.getRemoteIdentity(LID_ADDRESS))
    }
)

test('a bundle without a Kyber key gives a classic session', async () => {
    const harness = await buildHarness(PQ_ON)
    harness.setWithKyber(false)

    const [target] = await harness.resolver.ensureSessionsBatch([LID_DEVICE], undefined, {
        oneToOne: true
    })

    assert.deepEqual(target.address, LID_ADDRESS)
    assert.equal(target.session.version, undefined)
})

test('a device outside the LID server stays classic even with a Kyber key', { skip }, async () => {
    const harness = await buildHarness(PQ_ON)

    const [target] = await harness.resolver.ensureSessionsBatch([PN_DEVICE], undefined, {
        oneToOne: true
    })

    assert.equal(target.address.server, 's.whatsapp.net')
    assert.equal(target.session.version, undefined)
})

test(
    'a Kyber key that fails verification drops the device instead of going classic',
    { skip },
    async () => {
        const harness = await buildHarness(PQ_ON)
        harness.corruptKyberSignature()

        const targets = await harness.resolver.ensureSessionsBatch([LID_DEVICE], undefined, {
            oneToOne: true
        })

        assert.equal(targets.length, 0)
        assert.equal(await harness.stores.session.getSession(LID_ADDRESS), null)
        assert.equal(await harness.stores.session.getSession(LID_PQ_ADDRESS), null)
    }
)

test(
    'a store without the post-quantum methods keeps 1:1 fanout classic with every flag on',
    { skip },
    async () => {
        const policy = createSignalPqPolicy(() => true, createLegacyPreKeyStore())
        const harness = await buildHarness(policy)

        const [target] = await harness.resolver.ensureSessionsBatch([LID_DEVICE], undefined, {
            oneToOne: true
        })

        assert.deepEqual(harness.fetchCalls[0].options, { pqSupport: false })
        assert.deepEqual(target.address, LID_ADDRESS)
        assert.equal(target.session.version, undefined)
    }
)
