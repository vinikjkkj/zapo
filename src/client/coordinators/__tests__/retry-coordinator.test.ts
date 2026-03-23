import assert from 'node:assert/strict'
import test from 'node:test'

import { WaRetryCoordinator } from '@client/coordinators/WaRetryCoordinator'
import type { Logger } from '@infra/log/types'
import type { WaRetryOutboundMessageRecord, WaRetryOutboundState } from '@retry/types'
import type { WaRetryStore } from '@store/contracts/retry.store'
import type { BinaryNode } from '@transport/types'

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

test('retry coordinator serializes outbound receipt tracking per message id', async () => {
    const nowMs = Date.now()
    const retryStore = new ControlledRetryStore({
        messageId: 'msg-1',
        toJid: '551100000000@s.whatsapp.net',
        messageType: 'text',
        replayMode: 'plaintext',
        replayPayload: {
            mode: 'plaintext',
            to: '551100000000@s.whatsapp.net',
            type: 'text',
            plaintext: new Uint8Array([1, 2, 3])
        },
        state: 'pending',
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        expiresAtMs: nowMs + 60_000
    })

    const coordinator = new WaRetryCoordinator({
        logger: createLogger(),
        retryStore,
        signalStore: {} as never,
        senderKeyStore: {} as never,
        signalProtocol: {} as never,
        signalDeviceSync: {} as never,
        signalMissingPreKeysSync: {} as never,
        messageClient: {} as never,
        sendNode: async () => undefined,
        getCurrentMeJid: () => null,
        getCurrentMeLid: () => null,
        getCurrentSignedIdentity: () => null
    })

    const deliveryTracking = coordinator.trackOutboundReceipt(buildReceiptNode('msg-1', 'delivery'))
    await retryStore.waitFirstGetStarted()

    const readTracking = coordinator.trackOutboundReceipt(buildReceiptNode('msg-1', 'read'))
    retryStore.releaseFirstGet()

    await Promise.all([deliveryTracking, readTracking])

    assert.equal(retryStore.getCurrentState(), 'read')
    assert.deepEqual(retryStore.getTransitions(), ['delivered', 'read'])
})
