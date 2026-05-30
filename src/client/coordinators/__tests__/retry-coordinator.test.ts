import assert from 'node:assert/strict'
import test from 'node:test'

import { WaRetryCoordinator } from '@client/coordinators/WaRetryCoordinator'
import type { WaIncomingMessageEvent } from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import type { PeerDataOperationRequester } from '@message/primitives/peer-data-operation'
import { proto, type Proto } from '@proto'
import type {
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
    } as WaRetryDecryptFailureContext
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
            captured.push((body.placeholderMessageResendRequest ?? []) as never)
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
