import assert from 'node:assert/strict'
import test from 'node:test'

import { WaRetryCoordinator } from '@client/coordinators/WaRetryCoordinator'
import { createNoopLogger } from '@infra/log/types'
import type { WaMessageClient } from '@message/WaMessageClient'
import { WA_MESSAGE_TYPES } from '@protocol/constants'
import { parseJidFull } from '@protocol/jid'
import { encodeRetryReplayPayload } from '@retry/codec'
import { WaRetryReplayService } from '@retry/replay'
import type {
    WaParsedRetryRequest,
    WaRetryDecryptFailureContext,
    WaRetryOutboundMessageRecord
} from '@retry/types'
import { type SignalPqPolicy, toPqSessionAddress } from '@signal/session/pq-scope'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import type { KyberPreKeyRecord, SignalAddress, SignalPreKeyBundle } from '@signal/types'
import type { WaRetryStore } from '@store/contracts/retry.store'
import type { BinaryNode } from '@transport/types'

const ON: SignalPqPolicy = { isKeyUploadEnabled: () => true, isOneToOneEnabled: () => true }
const OFF: SignalPqPolicy = { isKeyUploadEnabled: () => false, isOneToOneEnabled: () => false }

const LID_REQUESTER = '551100000000:3@lid'
const PN_REQUESTER = '551100000000:3@s.whatsapp.net'

const KYBER_KEY = {
    id: 777,
    publicKey: new Uint8Array(1568).fill(7),
    signature: new Uint8Array(64).fill(8)
}

function bundleRequest(
    requesterJid: string,
    overrides: Partial<WaParsedRetryRequest> = {},
    withKyber = true
): WaParsedRetryRequest {
    return {
        type: WA_MESSAGE_TYPES.RECEIPT_TYPE_RETRY,
        stanzaId: 'retry-1',
        from: requesterJid,
        offline: false,
        isLid: false,
        originalMsgId: 'msg-1',
        retryCount: 1,
        regId: 555,
        keyBundle: {
            identity: new Uint8Array(32).fill(1),
            key: { id: 1, publicKey: new Uint8Array(32).fill(2) },
            skey: { id: 2, publicKey: new Uint8Array(32).fill(3), signature: new Uint8Array(64) },
            ...(withKyber ? { kyberKey: KYBER_KEY } : {})
        },
        ...overrides
    }
}

interface Calls {
    readonly deleted: string[]
    readonly established: { address: SignalAddress; bundle: SignalPreKeyBundle }[]
    readonly missingFetchOptions: unknown[]
}

function buildCoordinator(
    policy: SignalPqPolicy | undefined,
    options: {
        readonly failPqEstablish?: boolean
    } = {}
) {
    const calls: Calls = { deleted: [], established: [], missingFetchOptions: [] }
    const key = (address: SignalAddress) => `${address.user}|${address.server}|${address.device}`
    const coordinator = new WaRetryCoordinator({
        logger: createNoopLogger(),
        retryStore: { getTtlMs: () => 60_000 } as unknown as WaRetryStore,
        signalStore: {} as never,
        preKeyStore: {} as never,
        sessionStore: {
            getSession: async () => null,
            deleteSession: async (address: SignalAddress) => {
                calls.deleted.push(key(address))
            }
        } as never,
        senderKeyStore: {} as never,
        signalProtocol: {
            establishOutgoingSession: async (
                address: SignalAddress,
                bundle: SignalPreKeyBundle
            ) => {
                if (options.failPqEstablish && address.server === 'lid_pq') {
                    throw new Error('pq failure')
                }
                calls.established.push({ address, bundle })
                return {}
            }
        } as never,
        sessionResolver: {} as never,
        signalDeviceSync: {} as never,
        signalMissingPreKeysSync: {
            fetchMissingPreKeys: async (_targets: unknown, _timeout: unknown, opts: unknown) => {
                calls.missingFetchOptions.push(opts)
                return []
            }
        } as never,
        messageClient: {} as never,
        sendNode: async () => undefined,
        getCurrentCredentials: () => null,
        ...(policy ? { pqPolicy: policy } : {})
    })
    const internals = coordinator as unknown as {
        updateLocalSessionFromRetryRequest: (
            request: WaParsedRetryRequest,
            requesterJid: string,
            requesterAddress: SignalAddress,
            requesterNormalizedDeviceJid: string
        ) => Promise<boolean>
    }
    const run = (request: WaParsedRetryRequest, requesterJid: string) => {
        const parsed = parseJidFull(requesterJid)
        return internals.updateLocalSessionFromRetryRequest(
            request,
            requesterJid,
            parsed.address,
            parsed.normalizedJid
        )
    }
    return { calls, run }
}

test('a retry bundle with a Kyber key rebuilds the post-quantum session', async () => {
    const { calls, run } = buildCoordinator(ON)

    assert.equal(await run(bundleRequest(LID_REQUESTER), LID_REQUESTER), true)

    const pqAddress = toPqSessionAddress(parseJidFull(LID_REQUESTER).address)!
    assert.deepEqual(calls.deleted, ['551100000000|lid_pq|3'])
    assert.equal(calls.established.length, 2)
    assert.equal(calls.established[0].address.server, 'lid')
    assert.deepEqual(calls.established[1].address, pqAddress)
    assert.deepEqual(calls.established[1].bundle.kyberKey, KYBER_KEY)
    assert.equal(calls.established[1].bundle.oneTimeKey?.id, 1)
    assert.equal(calls.established[0].bundle.kyberKey, undefined)
})

test('a retry bundle without a Kyber key only drops the post-quantum session', async () => {
    const { calls, run } = buildCoordinator(ON)

    await run(bundleRequest(LID_REQUESTER, {}, false), LID_REQUESTER)

    assert.deepEqual(calls.deleted, ['551100000000|lid_pq|3'])
    assert.equal(calls.established.length, 1)
    assert.equal(calls.established[0].address.server, 'lid')
})

test('refetching missing keys for a retry marks the request post-quantum capable', async () => {
    const on = buildCoordinator(ON)
    await on.run(bundleRequest(LID_REQUESTER, { keyBundle: undefined }), LID_REQUESTER)
    assert.deepEqual(on.calls.missingFetchOptions, [{ pqSupport: true }])

    const off = buildCoordinator(OFF)
    await off.run(bundleRequest(LID_REQUESTER, { keyBundle: undefined }), LID_REQUESTER)
    assert.deepEqual(off.calls.missingFetchOptions, [{ pqSupport: false }])
})

test('a failing post-quantum rebuild keeps the classic retry session', async () => {
    const { calls, run } = buildCoordinator(ON, { failPqEstablish: true })

    assert.equal(await run(bundleRequest(LID_REQUESTER), LID_REQUESTER), true)

    assert.equal(calls.established.length, 1)
})

test('the retry leaves post-quantum sessions alone off policy, off LID and in groups', async () => {
    const off = buildCoordinator(OFF)
    await off.run(bundleRequest(LID_REQUESTER), LID_REQUESTER)
    assert.deepEqual(off.calls.deleted, [])
    assert.equal(off.calls.established.length, 1)

    const unset = buildCoordinator(undefined)
    await unset.run(bundleRequest(LID_REQUESTER), LID_REQUESTER)
    assert.deepEqual(unset.calls.deleted, [])

    const pn = buildCoordinator(ON)
    await pn.run(bundleRequest(PN_REQUESTER), PN_REQUESTER)
    assert.deepEqual(pn.calls.deleted, [])
    assert.equal(pn.calls.established.length, 1)

    const group = buildCoordinator(ON)
    await group.run(bundleRequest('120363000000000000@g.us'), LID_REQUESTER)
    assert.deepEqual(group.calls.deleted, [])
    assert.equal(group.calls.established.length, 1)
})

interface KeysHarnessOptions {
    readonly policy: SignalPqPolicy | undefined
    readonly migrated: boolean
    readonly lastResort: KyberPreKeyRecord | null
    /** `false` models a store written before the post-quantum methods existed. */
    readonly storeHasPqMethods?: boolean
}

async function sendRetryKeys(options: KeysHarnessOptions, from: string): Promise<BinaryNode> {
    const sent: BinaryNode[] = []
    const coordinator = new WaRetryCoordinator({
        logger: createNoopLogger(),
        retryStore: {
            getTtlMs: () => 60_000,
            incrementInboundCounter: async () => 2,
            cleanupExpired: async () => 0
        } as unknown as WaRetryStore,
        signalStore: {
            getRegistrationInfo: async () => ({
                registrationId: 42,
                identityKeyPair: { pubKey: new Uint8Array(32), privKey: new Uint8Array(32) }
            }),
            getSignedPreKey: async () => ({
                keyId: 7,
                keyPair: { pubKey: new Uint8Array(32), privKey: new Uint8Array(32) },
                signature: new Uint8Array(64)
            })
        } as never,
        preKeyStore: {
            getOrGenSinglePreKey: async () => ({
                keyId: 11,
                keyPair: { pubKey: new Uint8Array(32), privKey: new Uint8Array(32) }
            }),
            markKeyAsUploaded: async () => undefined,
            ...(options.storeHasPqMethods === false
                ? {}
                : {
                      putKyberPreKeys: async () => undefined,
                      getKyberPreKeyById: async () => null,
                      consumeKyberPreKeyById: async () => null,
                      removeKyberPreKeys: async () => undefined,
                      reserveKyberPreKeyIds: async () => 1,
                      setPqMigrated: async () => undefined,
                      getPqMigrated: async () => options.migrated,
                      getLatestKyberLastResortKey: async () => options.lastResort
                  })
        } as never,
        sessionStore: {} as never,
        senderKeyStore: {} as never,
        signalProtocol: {} as never,
        sessionResolver: {} as never,
        signalDeviceSync: {} as never,
        signalMissingPreKeysSync: {} as never,
        messageClient: {} as never,
        sendNode: async (node: BinaryNode) => {
            sent.push(node)
        },
        getCurrentCredentials: () => null,
        ...(options.policy ? { pqPolicy: options.policy } : {})
    })
    const context: WaRetryDecryptFailureContext = {
        messageNode: { tag: 'message', attrs: {} },
        stanzaId: 'incoming-1',
        from,
        t: String(Math.trunc(Date.now() / 1000))
    }
    assert.equal(await coordinator.onDecryptFailure(context, new Error('boom')), true)
    for (let attempts = 0; attempts < 200 && sent.length === 0; attempts += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
    return sent.find((node) => node.tag === 'receipt')!
}

const LAST_RESORT: KyberPreKeyRecord = {
    keyId: 4242,
    keyPair: { pubKey: new Uint8Array(1568).fill(5), privKey: new Uint8Array(32) },
    signature: new Uint8Array(64).fill(6),
    lastResort: true
}

function keysChildren(receipt: BinaryNode): BinaryNode[] {
    const keys = (receipt.content as BinaryNode[]).find((child) => child.tag === 'keys')!
    return keys.content as BinaryNode[]
}

test('a 1:1 retry receipt offers the last-resort Kyber key once migrated', async () => {
    const receipt = await sendRetryKeys(
        { policy: ON, migrated: true, lastResort: LAST_RESORT },
        '5511999999999@lid'
    )

    const children = keysChildren(receipt)
    assert.deepEqual(
        children.map((child) => child.tag),
        ['type', 'identity', 'skey', 'key', 'pqkey']
    )
    assert.deepEqual(children[4], {
        tag: 'pqkey',
        attrs: {},
        content: [
            { tag: 'id', attrs: {}, content: new Uint8Array([0, 0x10, 0x92]) },
            { tag: 'value', attrs: {}, content: LAST_RESORT.keyPair.pubKey },
            { tag: 'signature', attrs: {}, content: LAST_RESORT.signature }
        ]
    })
})

test('a retry receipt has no Kyber key before migration, off policy or in a group', async () => {
    for (const [options, from] of [
        [{ policy: ON, migrated: false, lastResort: LAST_RESORT }, '5511999999999@lid'],
        [{ policy: OFF, migrated: true, lastResort: LAST_RESORT }, '5511999999999@lid'],
        [{ policy: undefined, migrated: true, lastResort: LAST_RESORT }, '5511999999999@lid'],
        [{ policy: ON, migrated: true, lastResort: LAST_RESORT }, '120363000000000000@g.us'],
        [{ policy: ON, migrated: true, lastResort: null }, '5511999999999@lid']
    ] as const) {
        const receipt = await sendRetryKeys(options, from)
        assert.ok(
            !keysChildren(receipt).some((child) => child.tag === 'pqkey'),
            `unexpected pqkey for ${from} ${JSON.stringify({ ...options, policy: !!options.policy })}`
        )
    }
})

async function resendDirect(policy: SignalPqPolicy | undefined, existing: readonly string[]) {
    const encryptedFor: string[] = []
    const ensured: string[] = []
    const service = new WaRetryReplayService({
        logger: createNoopLogger(),
        messageClient: { sendEncrypted: async () => undefined } as unknown as WaMessageClient,
        signalProtocol: {
            encryptMessage: async (address: SignalAddress) => {
                encryptedFor.push(`${address.server}`)
                return { type: 'msg' as const, ciphertext: new Uint8Array([1]) }
            }
        } as unknown as SignalProtocol,
        sessionResolver: {
            ensureSession: async (address: SignalAddress) => {
                ensured.push(address.server ?? '')
            },
            ensureSessionsBatch: async () => []
        },
        getCurrentCredentials: () => null,
        sessionStore: {
            hasSession: async (address: SignalAddress) => existing.includes(address.server ?? '')
        },
        ...(policy ? { pqPolicy: policy } : {})
    })
    const now = Date.now()
    const outbound: WaRetryOutboundMessageRecord = {
        messageId: 'm-1',
        toJid: '5511999999999@lid',
        replayMode: 'plaintext',
        replayPayload: encodeRetryReplayPayload({
            mode: 'plaintext',
            to: '5511999999999@lid',
            type: 'text',
            plaintext: new Uint8Array([1, 2, 3])
        }),
        state: 'pending',
        updatedAtMs: now,
        expiresAtMs: now + 60_000
    }
    const result = await service.resendOutboundMessage(outbound, '5511999999999:2@lid', 1)
    return { result, encryptedFor, ensured }
}

test('a direct resend uses the post-quantum session when the requester has one', async () => {
    const outcome = await resendDirect(ON, ['lid', 'lid_pq'])

    assert.equal(outcome.result, 'resent')
    assert.deepEqual(outcome.encryptedFor, ['lid_pq'])
    assert.deepEqual(outcome.ensured, [])
})

test('a direct resend stays classic without a post-quantum session or off policy', async () => {
    const noTwin = await resendDirect(ON, ['lid'])
    assert.deepEqual(noTwin.encryptedFor, ['lid'])
    assert.deepEqual(noTwin.ensured, ['lid'])

    const off = await resendDirect(OFF, ['lid', 'lid_pq'])
    assert.deepEqual(off.encryptedFor, ['lid'])

    const unset = await resendDirect(undefined, ['lid', 'lid_pq'])
    assert.deepEqual(unset.encryptedFor, ['lid'])
})

test('a retry receipt on a store without the post-quantum methods carries no Kyber key', async () => {
    const receipt = await sendRetryKeys(
        { policy: ON, migrated: true, lastResort: LAST_RESORT, storeHasPqMethods: false },
        '5511999999999@lid'
    )

    assert.deepEqual(
        keysChildren(receipt).map((child) => child.tag),
        ['type', 'identity', 'skey', 'key']
    )
})
