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

        return true
    }

    return {
        track: async (hint, publish) => {
            const nowMs = Date.now()
            const expiresAtMs = nowMs + retryTtlMs
            const hintedMessageId = hint.messageIdHint?.trim()
            const replayMode = hint.replayPayload.mode
            const resolvedToJid =
                hint.toJid ?? (replayMode === 'opaque_node' ? '' : hint.replayPayload.to)
            const replayPayload = encodeRetryReplayPayload(hint.replayPayload)
            let hintedPersisted = false
            const createRetryOutboundRecord = (
                messageId: string,
                createdAtMs: number,
                updatedAtMs: number,
                expiresAtMs: number
            ): WaRetryOutboundMessageRecord => ({
                messageId,
                toJid: resolvedToJid,
                participantJid: hint.participantJid,
                recipientJid: hint.recipientJid,
                messageType: hint.type,
                replayMode,
                replayPayload,
                state: 'pending',
                createdAtMs,
                updatedAtMs,
                expiresAtMs
            })

            if (hintedMessageId) {
                hintedPersisted = await safeUpsertRetryOutboundRecord(
                    createRetryOutboundRecord(hintedMessageId, nowMs, nowMs, expiresAtMs)
                )
            }

            const result = await publish()
            if (hintedPersisted && hintedMessageId && result.id === hintedMessageId) {
                return result
            }

            const persistedNowMs = Date.now()
            await safeUpsertRetryOutboundRecord(
                createRetryOutboundRecord(
                    result.id,
                    hintedMessageId ? nowMs : persistedNowMs,
                    persistedNowMs,
                    persistedNowMs + retryTtlMs
                )
            )

            return result
        }
    }
}
