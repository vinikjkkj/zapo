import type { Logger } from '@infra/log/types'
import type { WaMessagePublishResult } from '@message/types'
import { RETRY_OUTBOUND_TTL_MS } from '@retry/constants'
import { encodeRetryReplayPayload } from '@retry/outbound'
import type { WaRetryOutboundMessageRecord, WaRetryReplayPayload } from '@retry/types'
import type { WaRetryStore } from '@store/contracts/retry.store'
import { toError } from '@util/primitives'

export type OutboundRetryTrackHint = {
    readonly messageIdHint?: string
    readonly toJid?: string
    readonly type: string
    readonly replayPayload: WaRetryReplayPayload
    readonly participantJid?: string
    readonly recipientJid?: string
}

export type OutboundRetryTracker = {
    track(
        hint: OutboundRetryTrackHint,
        publish: () => Promise<WaMessagePublishResult>
    ): Promise<WaMessagePublishResult>
}

export function createOutboundRetryTracker(options: {
    readonly retryStore: WaRetryStore
    readonly logger: Logger
}): OutboundRetryTracker {
    const { retryStore, logger } = options
    const retryTtlMs = retryStore.getTtlMs?.() ?? RETRY_OUTBOUND_TTL_MS

    const createRetryOutboundRecord = (input: {
        readonly messageId: string
        readonly toJid: string
        readonly participantJid?: string
        readonly recipientJid?: string
        readonly messageType: string
        readonly replayPayload: WaRetryReplayPayload
        readonly createdAtMs: number
        readonly updatedAtMs: number
        readonly expiresAtMs: number
    }): WaRetryOutboundMessageRecord => ({
        messageId: input.messageId,
        toJid: input.toJid,
        participantJid: input.participantJid,
        recipientJid: input.recipientJid,
        messageType: input.messageType,
        replayMode: input.replayPayload.mode,
        replayPayload: encodeRetryReplayPayload(input.replayPayload),
        state: 'pending',
        createdAtMs: input.createdAtMs,
        updatedAtMs: input.updatedAtMs,
        expiresAtMs: input.expiresAtMs
    })

    const safeUpsertRetryOutboundRecord = async (
        record: WaRetryOutboundMessageRecord
    ): Promise<boolean> => {
        try {
            await retryStore.upsertOutboundMessage(record)
        } catch (error) {
            logger.warn('failed to persist retry outbound message record', {
                messageId: record.messageId,
                to: record.toJid,
                mode: record.replayMode,
                message: toError(error).message
            })
            return false
        }

        try {
            await retryStore.cleanupExpired(Date.now())
        } catch (error) {
            logger.warn('failed to cleanup retry records after outbound persist', {
                message: toError(error).message
            })
        }

        return true
    }

    return {
        track: async (hint, publish) => {
            const nowMs = Date.now()
            const expiresAtMs = nowMs + retryTtlMs
            const hintedMessageId = hint.messageIdHint?.trim()
            const resolvedToJid =
                hint.toJid ??
                (hint.replayPayload.mode === 'opaque_node' ? '' : hint.replayPayload.to)
            let hintedPersisted = false

            if (hintedMessageId) {
                hintedPersisted = await safeUpsertRetryOutboundRecord(
                    createRetryOutboundRecord({
                        messageId: hintedMessageId,
                        toJid: resolvedToJid,
                        participantJid: hint.participantJid,
                        recipientJid: hint.recipientJid,
                        messageType: hint.type,
                        replayPayload: hint.replayPayload,
                        createdAtMs: nowMs,
                        updatedAtMs: nowMs,
                        expiresAtMs
                    })
                )
            }

            const result = await publish()
            if (hintedPersisted && hintedMessageId && result.id === hintedMessageId) {
                return result
            }

            const persistedNowMs = Date.now()
            await safeUpsertRetryOutboundRecord(
                createRetryOutboundRecord({
                    messageId: result.id,
                    toJid: resolvedToJid,
                    participantJid: hint.participantJid,
                    recipientJid: hint.recipientJid,
                    messageType: hint.type,
                    replayPayload: hint.replayPayload,
                    createdAtMs: hintedMessageId ? nowMs : persistedNowMs,
                    updatedAtMs: persistedNowMs,
                    expiresAtMs: persistedNowMs + retryTtlMs
                })
            )

            return result
        }
    }
}
