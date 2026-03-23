import type { Logger } from '@infra/log/types'
import type { WaMessagePublishResult } from '@message/types'
import { isGroupOrBroadcastJid, normalizeDeviceJid } from '@protocol/jid'
import { encodeRetryReplayPayload } from '@retry/codec'
import { RETRY_OUTBOUND_TTL_MS } from '@retry/constants'
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
    readonly eligibleRequesterDeviceJids?: readonly string[]
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
    const supportsRawReplayPayload = retryStore.supportsRawReplayPayload?.() ?? false

    const normalizeEligibleRequesterDeviceJids = (
        values: readonly string[] | undefined
    ): readonly string[] | undefined => {
        if (!values || values.length === 0) {
            return undefined
        }
        const deduped = new Set<string>()
        for (let index = 0; index < values.length; index += 1) {
            const raw = values[index]?.trim()
            if (!raw) {
                continue
            }
            try {
                deduped.add(normalizeDeviceJid(raw))
            } catch {
                continue
            }
        }
        if (deduped.size === 0) {
            return undefined
        }
        return Array.from(deduped)
    }

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
            const replayMode = hint.replayPayload.mode
            const resolvedToJid =
                hint.toJid ?? (replayMode === 'opaque_node' ? '' : hint.replayPayload.to)
            const replayPayload = supportsRawReplayPayload
                ? hint.replayPayload
                : encodeRetryReplayPayload(hint.replayPayload)
            let eligibleRequesterDeviceJids = normalizeEligibleRequesterDeviceJids(
                hint.eligibleRequesterDeviceJids
            )
            if (
                !eligibleRequesterDeviceJids &&
                resolvedToJid &&
                !isGroupOrBroadcastJid(resolvedToJid)
            ) {
                try {
                    eligibleRequesterDeviceJids = [normalizeDeviceJid(resolvedToJid)]
                } catch {
                    eligibleRequesterDeviceJids = undefined
                }
            }

            const createRetryOutboundRecord = (
                messageId: string,
                updatedAtMs: number,
                expiresAtMs: number
            ): WaRetryOutboundMessageRecord => ({
                messageId,
                toJid: resolvedToJid,
                participantJid: hint.participantJid,
                recipientJid: hint.recipientJid,
                eligibleRequesterDeviceJids,
                deliveredRequesterDeviceJids: [],
                messageType: hint.type,
                replayMode,
                replayPayload,
                state: 'pending',
                createdAtMs: nowMs,
                updatedAtMs,
                expiresAtMs
            })

            const result = await publish()
            const persistedMessageId = result.id.trim()
            if (!persistedMessageId) {
                logger.warn('retry outbound record skipped: publish returned empty message id', {
                    to: resolvedToJid,
                    mode: replayMode
                })
                return result
            }

            const persistedNowMs = Date.now()
            await safeUpsertRetryOutboundRecord(
                createRetryOutboundRecord(
                    persistedMessageId,
                    persistedNowMs,
                    persistedNowMs + retryTtlMs
                )
            )
            return result
        }
    }
}
