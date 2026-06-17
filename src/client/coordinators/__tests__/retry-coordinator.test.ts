import assert from 'node:assert/strict'
import test from 'node:test'

import { WaRetryCoordinator } from '@client/coordinators/WaRetryCoordinator'
import type { WaIncomingMessageEvent } from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import type { PeerDataOperationRequester } from '@message/primitives/peer-data-operation'
import { proto, type Proto } from '@proto'
import { WA_MESSAGE_TYPES } from '@protocol/constants'
import { parseJidFull } from '@protocol/jid'
import type {
    WaParsedRetryRequest,
    WaRetryDecryptFailureContext,
    WaRetryOutboundMessageRecord,
    WaRetryOutboundState
} from '@retry/types'
import type { WaRetryStore } from '@store/contracts/retry.store'
import type { BinaryNode } from '@transport/types'

class ControlledRetryStore implements WaRetryStore {
    private record: WaRetryOutboundMessageRecord | null
    private blockFirstGet = true
    private readonly firstGetStartedPromise: Promise<void>
    private resolveFirstGetStarted: (() => void) | null = null
    private readonly releaseFirstGetPromise: Promise<void>
    private resolveReleaseFirstGet: (() => void) | null = null
    private readonly stateTransitions: WaRetryOutboundState[] = []

    public constructor(initialRecord: WaRetryOutboundMessageRecord) {
        this.record = initialRecord
        this.firstGetStartedPromise = new Promise<void>((resolve) => {
            this.resolveFirstGetStarted = resolve
        })
        this.releaseFirstGetPromise = new Promise<void>((resolve) => {
            this.resolveReleaseFirstGet = resolve
        })
    }

    public waitFirstGetStarted(): Promise<void> {
        return this.firstGetStartedPromise
    }

    public releaseFirstGet(): void {
        this.resolveReleaseFirstGet?.()
        this.resolveReleaseFirstGet = null
    }

    public getCurrentState(): WaRetryOutboundState {
        if (!this.record) {
            throw new Error('missing outbound record')
        }
        return this.record.state
    }

    public getTransitions(): readonly WaRetryOutboundState[] {
        return this.stateTransitions
    }

    public async getOutboundRequesterStatus(
        _messageId: string,
        _requesterDeviceJid: string
    ): Promise<{
        readonly eligible: boolean
        readonly delivered: boolean
    } | null> {
        return null
    }

    public getTtlMs(): number {
        return 60_000
    }

    public async upsertOutboundMessage(record: WaRetryOutboundMessageRecord): Promise<void> {
        this.record = record
    }

    public async deleteOutboundMessage(messageId: string): Promise<number> {
        if (!this.record || this.record.messageId !== messageId) {
            return 0
        }
        this.record = null
        return 1
    }

    public async getOutboundMessage(
        messageId: string
    ): Promise<WaRetryOutboundMessageRecord | null> {
        if (!this.record || this.record.messageId !== messageId) {
            return null
        }
        if (this.blockFirstGet) {
            this.blockFirstGet = false
            this.resolveFirstGetStarted?.()
            this.resolveFirstGetStarted = null
            await this.releaseFirstGetPromise
        }
        return { ...this.record }
    }

    public async updateOutboundMessageState(
        messageId: string,
        state: WaRetryOutboundState,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void> {
        if (!this.record || this.record.messageId !== messageId) {
            return
        }
        this.record = {
            ...this.record,
            state,
            updatedAtMs,
            expiresAtMs
        }
        this.stateTransitions.push(state)
    }

    public async markOutboundRequesterDelivered(
        _messageId: string,
        _requesterDeviceJid: string,
        _updatedAtMs: number,
        _expiresAtMs: number
    ): Promise<void> {
        return
    }

    public async incrementInboundCounter(
        _messageId: string,
        _requesterJid: string,
        _updatedAtMs: number,
        _expiresAtMs: number
    ): Promise<number> {
        return 0
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        this.record = null
    }
}

function buildReceiptNode(messageId: string, type: string): BinaryNode {
    return {
        tag: 'receipt',
        attrs: {
            id: messageId,
            type,
            from: '551100000000@s.whatsapp.net'
        },
        content: []
    }
}

interface PlaceholderHarness {
    readonly coordinator: WaRetryCoordinator
    readonly captured: Array<readonly Proto.Message.IPeerDataOperationRequestMessage[]>
    readonly emitted: WaIncomingMessageEvent[]
    readonly resolveNext: (
        results: readonly Proto.Message.PeerDataOperationRequestResponseMessage.IPeerDataOperationResult[]
    ) => void
    readonly enqueue: (context: WaRetryDecryptFailureContext) => void
    readonly flush: () => Promise<void>
}

function buildPlaceholderContext(
    overrides: Partial<WaRetryDecryptFailureContext> = {}
): WaRetryDecryptFailureContext {
    return {
        messageNode: { tag: 'message', attrs: {} },
        stanzaId: overrides.stanzaId ?? 'msg-x',
        from: overrides.from ?? '551100000000@s.whatsapp.net',
        participant: overrides.participant,
        recipient: overrides.recipient,
        t: overrides.t,
        ...overrides
    }
}

function createPlaceholderHarness(): PlaceholderHarness {
    const captured: PlaceholderHarness['captured'] = []
    const emitted: WaIncomingMessageEvent[] = []
    const pendingResolvers: Array<
        (
            results: readonly Proto.Message.PeerDataOperationRequestResponseMessage.IPeerDataOperationResult[]
        ) => void
    > = []
    const peerDataOperation: PeerDataOperationRequester = {
        request: async (_type, body) => {
            captured.push(body.placeholderMessageResendRequest ?? [])
            return new Promise((resolve) => {
                pendingResolvers.push(resolve)
            })
        },
        send: async () => ({ messageId: 'unused' })
    }
    const coordinator = new WaRetryCoordinator({
        logger: createNoopLogger(),
        retryStore: {} as never,
        signalStore: {} as never,
        preKeyStore: {} as never,
        sessionStore: {} as never,
        senderKeyStore: {} as never,
        signalProtocol: {} as never,
        sessionResolver: {} as never,
        signalDeviceSync: {} as never,
        signalMissingPreKeysSync: {} as never,
        messageClient: {} as never,
        sendNode: async () => undefined,
        getCurrentCredentials: () => null,
        peerDataOperation,
        emitIncomingMessage: (event) => emitted.push(event)
    })
    const internals = coordinator as unknown as {
        enqueuePlaceholderResend: (context: WaRetryDecryptFailureContext) => boolean
        flushPlaceholderBatch: () => Promise<void>
    }
    return {
        coordinator,
        captured,
        emitted,
        resolveNext: (results) => {
            const resolver = pendingResolvers.shift()
            if (!resolver) {
                throw new Error('no pending placeholder resend request to resolve')
            }
            resolver(results)
        },
        enqueue: (context) => internals.enqueuePlaceholderResend(context),
        flush: () => internals.flushPlaceholderBatch()
    }
}

function makeWebMessageInfoBytes(id: string, remoteJid: string): Uint8Array {
    return proto.WebMessageInfo.encode({
        key: { id, remoteJid, fromMe: false },
        messageTimestamp: 1_700_000_000,
        message: { conversation: 'recovered' }
    }).finish()
}

async function flushMicrotasks(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve))
}

test('placeholder resend: dedups by stanzaId in flight', async () => {
    const harness = createPlaceholderHarness()
    harness.enqueue(buildPlaceholderContext({ stanzaId: 'dup' }))
    harness.enqueue(buildPlaceholderContext({ stanzaId: 'dup' }))
    harness.enqueue(buildPlaceholderContext({ stanzaId: 'other' }))
    const flushPromise = harness.flush()
    harness.resolveNext([])
    await flushPromise
    assert.equal(harness.captured.length, 1)
    assert.equal(harness.captured[0].length, 2)
})

test('placeholder resend: skips unavailable fanout subtypes', async () => {
    const harness = createPlaceholderHarness()
    harness.enqueue(
        buildPlaceholderContext({
            stanzaId: 'bot-msg',
            messageNode: {
                tag: 'message',
                attrs: { subtype: 'bot_unavailable_fanout' }
            }
        })
    )
    harness.enqueue(
        buildPlaceholderContext({
            stanzaId: 'view-once-msg',
            messageNode: {
                tag: 'message',
                attrs: { subtype: 'view_once_unavailable_fanout' }
            }
        })
    )
    harness.enqueue(buildPlaceholderContext({ stanzaId: 'normal' }))
    const flushPromise = harness.flush()
    harness.resolveNext([])
    await flushPromise
    assert.equal(harness.captured.length, 1)
    assert.equal(harness.captured[0].length, 1)
    assert.equal(
        (harness.captured[0][0] as { messageKey?: { id?: string } }).messageKey?.id,
        'normal'
    )
})

test('placeholder resend: drops items older than the max age window', async () => {
    const harness = createPlaceholderHarness()
    const oldEnoughSeconds = Math.trunc(Date.now() / 1000) - 31 * 24 * 60 * 60
    harness.enqueue(
        buildPlaceholderContext({
            stanzaId: 'too-old',
            t: String(oldEnoughSeconds)
        })
    )
    harness.enqueue(buildPlaceholderContext({ stanzaId: 'fresh' }))
    const flushPromise = harness.flush()
    harness.resolveNext([])
    await flushPromise
    assert.equal(harness.captured.length, 1)
    assert.equal(harness.captured[0].length, 1)
})

test('placeholder resend: splits queue into batches of 32', async () => {
    const harness = createPlaceholderHarness()
    for (let i = 0; i < 33; i += 1) {
        harness.enqueue(buildPlaceholderContext({ stanzaId: `msg-${i}` }))
    }
    const flushPromise = harness.flush()
    harness.resolveNext([])
    await flushMicrotasks()
    harness.resolveNext([])
    await flushPromise
    assert.equal(harness.captured.length, 2)
    assert.equal(harness.captured[0].length, 32)
    assert.equal(harness.captured[1].length, 1)
})

test('placeholder resend: decodes WebMessageInfo and re-emits as incoming message', async () => {
    const harness = createPlaceholderHarness()
    harness.enqueue(buildPlaceholderContext({ stanzaId: 'recover-1' }))
    const flushPromise = harness.flush()
    harness.resolveNext([
        {
            placeholderMessageResendResponse: {
                webMessageInfoBytes: makeWebMessageInfoBytes(
                    'recover-1',
                    '551122223333@s.whatsapp.net'
                )
            }
        }
    ])
    await flushPromise
    assert.equal(harness.emitted.length, 1)
    const event = harness.emitted[0]
    assert.equal(event.key.id, 'recover-1')
    assert.equal(event.key.remoteJid, '551122223333@s.whatsapp.net')
    assert.equal(event.message?.conversation, 'recovered')
})

test('placeholder resend: tolerates results without webMessageInfoBytes', async () => {
    const harness = createPlaceholderHarness()
    harness.enqueue(buildPlaceholderContext({ stanzaId: 'no-payload' }))
    const flushPromise = harness.flush()
    harness.resolveNext([{ placeholderMessageResendResponse: {} }, {}])
    await flushPromise
    assert.equal(harness.emitted.length, 0)
})

test('placeholder resend: releases in-flight slots after each batch completes', async () => {
    const harness = createPlaceholderHarness()
    harness.enqueue(buildPlaceholderContext({ stanzaId: 'msg-a' }))
    const firstFlush = harness.flush()
    harness.resolveNext([])
    await firstFlush
    harness.enqueue(buildPlaceholderContext({ stanzaId: 'msg-a' }))
    const secondFlush = harness.flush()
    harness.resolveNext([])
    await secondFlush
    assert.equal(harness.captured.length, 2)
})

test('mobile primary does not delegate to placeholder resend and keeps sending retry receipts', async () => {
    const sentNodes: BinaryNode[] = []
    const emitted: WaIncomingMessageEvent[] = []
    const placeholderRequests: number[] = []
    const peerDataOperation: PeerDataOperationRequester = {
        request: async () => {
            placeholderRequests.push(1)
            return []
        },
        send: async () => ({ messageId: 'unused' })
    }

    const sharedDeps = {
        logger: createNoopLogger(),
        retryStore: {
            getTtlMs: () => 60_000,
            incrementInboundCounter: async () => 3,
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
            markKeyAsUploaded: async () => undefined
        } as never,
        sessionStore: {} as never,
        senderKeyStore: {} as never,
        signalProtocol: {} as never,
        sessionResolver: {} as never,
        signalDeviceSync: {} as never,
        signalMissingPreKeysSync: {} as never,
        messageClient: {} as never,
        sendNode: async (node: BinaryNode) => {
            sentNodes.push(node)
        },
        getCurrentCredentials: () => null
    }

    const freshT = String(Math.trunc(Date.now() / 1000))
    const context = buildPlaceholderContext({ stanzaId: 'mobile-1', t: freshT })

    // Mobile primary: placeholder deps withheld, a high retry count must still
    // go out as a retry receipt.
    const mobileCoordinator = new WaRetryCoordinator(sharedDeps)
    const mobileHandled = await mobileCoordinator.onDecryptFailure(context, new Error('boom'))
    assert.equal(mobileHandled, true)
    // Retry handling is deferred to a bounded background queue; let it drain.
    await flushMicrotasks()
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(placeholderRequests.length, 0)
    assert.equal(emitted.length, 0)
    // Mobile: retry receipt + transport ack (no placeholder).
    assert.equal(sentNodes.length, 2)
    assert.equal(sentNodes[0].tag, 'receipt')
    assert.equal(sentNodes[0].attrs.type, 'retry')
    assert.equal(sentNodes[1].tag, 'ack')
    assert.equal(sentNodes[1].attrs.class, 'message')
    assert.equal(sentNodes[1].attrs.error, '500')

    // Companion: the same retry count delegates to placeholder resend; the
    // stanza is still acked.
    const companionCoordinator = new WaRetryCoordinator({
        ...sharedDeps,
        peerDataOperation,
        emitIncomingMessage: (event) => emitted.push(event)
    })
    const companionHandled = await companionCoordinator.onDecryptFailure(
        buildPlaceholderContext({ stanzaId: 'companion-1', t: freshT }),
        new Error('boom')
    )
    assert.equal(companionHandled, true)
    // Drain the deferred queue, then wait out the placeholder debounce.
    await flushMicrotasks()
    await new Promise((resolve) => setTimeout(resolve, 300))
    // Only an ack was added for the companion path (no retry receipt).
    assert.equal(sentNodes.length, 3)
    assert.equal(sentNodes[2].tag, 'ack')
    assert.equal(sentNodes[2].attrs.class, 'message')
    assert.equal(placeholderRequests.length, 1)
})

test('decrypt-failure retry gives up past the retry ceiling (acks stanza, no receipt/placeholder)', async () => {
    const sentNodes: BinaryNode[] = []
    const placeholderRequests: number[] = []
    const coordinator = new WaRetryCoordinator({
        logger: createNoopLogger(),
        retryStore: {
            getTtlMs: () => 60_000,
            // Past MAX_RETRY_ATTEMPTS (5): a redelivered stanza that keeps failing.
            incrementInboundCounter: async () => 6,
            cleanupExpired: async () => 0
        } as unknown as WaRetryStore,
        signalStore: {
            getRegistrationInfo: async () => ({
                registrationId: 42,
                identityKeyPair: { pubKey: new Uint8Array(32), privKey: new Uint8Array(32) }
            }),
            getSignedPreKey: async () => {
                throw new Error('should not build keys past the ceiling')
            }
        } as never,
        preKeyStore: {} as never,
        sessionStore: {} as never,
        senderKeyStore: {} as never,
        signalProtocol: {} as never,
        sessionResolver: {} as never,
        signalDeviceSync: {} as never,
        signalMissingPreKeysSync: {} as never,
        messageClient: {} as never,
        sendNode: async (node: BinaryNode) => {
            sentNodes.push(node)
        },
        getCurrentCredentials: () => null,
        peerDataOperation: {
            request: async () => {
                placeholderRequests.push(1)
                return []
            },
            send: async () => ({ messageId: 'unused' })
        },
        emitIncomingMessage: () => undefined
    })

    const handled = await coordinator.onDecryptFailure(
        buildPlaceholderContext({
            stanzaId: 'over-limit',
            t: String(Math.trunc(Date.now() / 1000))
        }),
        new Error('signal session not found')
    )

    assert.equal(handled, true)
    // Retry handling is deferred to a bounded background queue; let it drain.
    await flushMicrotasks()
    await new Promise((resolve) => setTimeout(resolve, 250))
    // Past the ceiling: no retry receipt, no placeholder, only the consuming ack.
    assert.equal(sentNodes.length, 1)
    assert.equal(sentNodes[0].tag, 'ack')
    assert.equal(sentNodes[0].attrs.class, 'message')
    assert.equal(sentNodes[0].attrs.error, '500')
    assert.equal(placeholderRequests.length, 0)
})

test('retry coordinator serializes outbound receipt tracking per message id', async () => {
    const nowMs = Date.now()
    const retryStore = new ControlledRetryStore({
        messageId: 'msg-1',
        toJid: '551100000000@s.whatsapp.net',
        replayMode: 'plaintext',
        replayPayload: {
            mode: 'plaintext',
            to: '551100000000@s.whatsapp.net',
            type: 'text',
            plaintext: new Uint8Array([1, 2, 3])
        },
        state: 'pending',
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + 60_000
    })

    const coordinator = new WaRetryCoordinator({
        logger: createNoopLogger(),
        retryStore,
        signalStore: {} as never,
        preKeyStore: {} as never,
        sessionStore: {} as never,
        senderKeyStore: {} as never,
        signalProtocol: {} as never,
        sessionResolver: {} as never,
        signalDeviceSync: {} as never,
        signalMissingPreKeysSync: {} as never,
        messageClient: {} as never,
        sendNode: async () => undefined,
        getCurrentCredentials: () => null
    })

    const deliveryTracking = coordinator.trackOutboundReceipt(buildReceiptNode('msg-1', 'delivery'))
    await retryStore.waitFirstGetStarted()

    const readTracking = coordinator.trackOutboundReceipt(buildReceiptNode('msg-1', 'read'))
    retryStore.releaseFirstGet()

    await Promise.all([deliveryTracking, readTracking])

    assert.equal(retryStore.getCurrentState(), 'read')
    assert.deepEqual(retryStore.getTransitions(), ['delivered', 'read'])
})

function buildKeyBundleRequest(retryCount: number, requesterJid: string): WaParsedRetryRequest {
    return {
        type: WA_MESSAGE_TYPES.RECEIPT_TYPE_RETRY,
        stanzaId: `retry-${retryCount}`,
        from: requesterJid,
        offline: false,
        isLid: false,
        originalMsgId: 'churn-msg',
        retryCount,
        regId: 555,
        keyBundle: {
            identity: new Uint8Array(33),
            key: { id: 1, publicKey: new Uint8Array(32) },
            skey: { id: 2, publicKey: new Uint8Array(32), signature: new Uint8Array(64) }
        }
    }
}

type RetrySessionInternals = {
    updateLocalSessionFromRetryRequest: (
        request: WaParsedRetryRequest,
        requesterJid: string,
        requesterAddress: ReturnType<typeof parseJidFull>['address'],
        requesterNormalizedDeviceJid: string
    ) => Promise<boolean>
}

test('retry session update reuses an existing compatible session instead of re-keying', async () => {
    const existingSession = {
        remote: { regId: 555, pubKey: new Uint8Array(33) },
        aliceBaseKey: new Uint8Array([9, 9, 9])
    } as never

    const establishOptions: unknown[] = []
    const coordinator = new WaRetryCoordinator({
        logger: createNoopLogger(),
        retryStore: { getTtlMs: () => 60_000 } as unknown as WaRetryStore,
        signalStore: {} as never,
        preKeyStore: {} as never,
        sessionStore: {
            getSession: async () => existingSession,
            deleteSession: async () => undefined
        } as never,
        senderKeyStore: {} as never,
        signalProtocol: {
            establishOutgoingSession: async (
                _address: unknown,
                _bundle: unknown,
                options: unknown
            ) => {
                establishOptions.push(options)
                return existingSession
            }
        } as never,
        sessionResolver: {} as never,
        signalDeviceSync: {} as never,
        signalMissingPreKeysSync: {} as never,
        messageClient: {} as never,
        sendNode: async () => undefined,
        getCurrentCredentials: () => null
    })

    const internals = coordinator as unknown as RetrySessionInternals
    const requesterJid = '551100000000:3@s.whatsapp.net'
    const parsed = parseJidFull(requesterJid)
    const ready = await internals.updateLocalSessionFromRetryRequest(
        buildKeyBundleRequest(2, requesterJid),
        requesterJid,
        parsed.address,
        parsed.normalizedJid
    )

    assert.equal(ready, true)
    // The keyBundle establish reuses the existing session rather than minting a
    // fresh base key on every retry.
    assert.deepEqual(establishOptions, [{ reuseExisting: true }])
})

test('retry session update resets the session once the base key repeats at retry 3', async () => {
    const existingSession = {
        remote: { regId: 555, pubKey: new Uint8Array(33) },
        aliceBaseKey: new Uint8Array([7, 7, 7])
    } as never

    let deleteCount = 0
    let fetchCount = 0
    const coordinator = new WaRetryCoordinator({
        logger: createNoopLogger(),
        retryStore: { getTtlMs: () => 60_000 } as unknown as WaRetryStore,
        signalStore: {} as never,
        preKeyStore: {} as never,
        sessionStore: {
            getSession: async () => existingSession,
            deleteSession: async () => {
                deleteCount += 1
            }
        } as never,
        senderKeyStore: {} as never,
        signalProtocol: {
            establishOutgoingSession: async () => existingSession
        } as never,
        sessionResolver: {} as never,
        signalDeviceSync: {} as never,
        signalMissingPreKeysSync: {
            fetchMissingPreKeys: async () => {
                fetchCount += 1
                return [{ devices: [{ deviceJid: '551100000000:3@s.whatsapp.net', bundle: {} }] }]
            }
        } as never,
        messageClient: {} as never,
        sendNode: async () => undefined,
        getCurrentCredentials: () => null
    })

    const internals = coordinator as unknown as RetrySessionInternals
    const requesterJid = '551100000000:3@s.whatsapp.net'
    const parsed = parseJidFull(requesterJid)
    const run = (retryCount: number): Promise<boolean> =>
        internals.updateLocalSessionFromRetryRequest(
            buildKeyBundleRequest(retryCount, requesterJid),
            requesterJid,
            parsed.address,
            parsed.normalizedJid
        )

    // Retry 2 only records the session base key.
    await run(2)
    assert.equal(deleteCount, 0)
    assert.equal(fetchCount, 0)

    // Retry 3 sees the same (reused) base key and forces a clean session:
    // delete + fetch fresh prekeys + re-establish.
    const ready = await run(3)
    assert.equal(ready, true)
    assert.equal(deleteCount, 1)
    assert.equal(fetchCount, 1)
})
