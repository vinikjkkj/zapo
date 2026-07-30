import type { WaAbPropName } from '@abprops-spec'
import { downloadHistoryBlob, flushPendingWrites } from '@client/persistence/history-blob'
import type { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import type { WaClientEventMap, WaGroupHistoryBundleEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import { decodeGroupHistoryBundle } from '@message/kinds/group-history'
import { proto, type Proto } from '@proto'
import { isGroupJid, toUserJid } from '@protocol/jid'
import { longToNumber, toError } from '@util/primitives'

const GROUP_HISTORY_MAX_PENDING_WRITES = 1_024

export interface WaGroupHistoryBundleInput {
    /** The `messageHistoryBundle` payload carried by the incoming message. */
    readonly bundle: Proto.Message.IMessageHistoryBundle
    /** Group the bundle was shared in - the `remoteJid` of the carrier message. */
    readonly groupJid: string
    /** Member who shared the history (carrier message `participant`). */
    readonly senderJid?: string
    /** Stanza id of the carrier message. */
    readonly bundleMessageId?: string
    /** Carrier message `t` attr, in seconds - drives the bundle expiry check. */
    readonly sentAtSeconds?: number
}

export interface WaGroupHistoryDeps {
    readonly logger: Logger
    readonly mediaTransfer: WaMediaTransferClient
    readonly writeBehind: WriteBehindPersistence
    readonly emitEvent: <K extends keyof WaClientEventMap>(
        event: K,
        ...args: Parameters<WaClientEventMap[K]>
    ) => void
    readonly meJid?: string | null
    readonly meLid?: string | null
    readonly getAbPropNumber: (name: WaAbPropName) => number
}

export async function runGroupHistoryBundle(
    deps: WaGroupHistoryDeps,
    input: WaGroupHistoryBundleInput
): Promise<void> {
    try {
        await processGroupHistoryBundle(deps, input)
    } catch (error) {
        deps.logger.warn('failed to process group history bundle', {
            groupJid: input.groupJid,
            id: input.bundleMessageId,
            message: toError(error).message
        })
    }
}

export async function processGroupHistoryBundle(
    deps: WaGroupHistoryDeps,
    input: WaGroupHistoryBundleInput
): Promise<void> {
    const logger = deps.logger.child({
        groupJid: input.groupJid,
        id: input.bundleMessageId
    })

    if (!isGroupJid(input.groupJid)) {
        logger.debug('skipping group history bundle outside a group')
        return
    }
    if (!isHistoryReceiver(deps, input.bundle)) {
        logger.debug('skipping group history bundle not addressed to this account')
        return
    }

    const nowMs = Date.now()
    const bundleTtlSeconds = deps.getAbPropNumber(
        'group_history_bundle_time_limit_receiver_enforcement_secs'
    )
    if (
        input.sentAtSeconds !== undefined &&
        nowMs > (input.sentAtSeconds + bundleTtlSeconds) * 1_000
    ) {
        logger.debug('skipping expired group history bundle', {
            sentAtSeconds: input.sentAtSeconds,
            bundleTtlSeconds
        })
        return
    }

    const blob = await downloadHistoryBlob(
        deps.mediaTransfer,
        input.bundle,
        'group-history',
        'group history bundle'
    )
    const history = await decodeGroupHistoryBundle(blob)

    const messageTtlSeconds = deps.getAbPropNumber(
        'group_history_messages_time_limit_receiver_enforcement_secs'
    )
    const pendingWrites: Promise<void>[] = []
    const dropped = { foreignChat: 0, ephemeralExpired: 0, tooOld: 0, stub: 0 }

    let messagesCount = 0
    let oldestTimestampMs: number | undefined
    for (const source of [
        { messages: history.messages, skipAgeCheck: false },
        { messages: history.outOfWindowPinnedMessages, skipAgeCheck: true }
    ]) {
        for (const webMsg of source.messages) {
            if (!webMsg.key?.id || !webMsg.message) {
                dropped.stub += 1
                continue
            }
            if (webMsg.key.remoteJid && webMsg.key.remoteJid !== input.groupJid) {
                dropped.foreignChat += 1
                continue
            }
            const timestampSeconds = longToNumber(webMsg.messageTimestamp)
            if (isEphemeralExpired(webMsg, timestampSeconds, nowMs)) {
                dropped.ephemeralExpired += 1
                continue
            }
            if (
                !source.skipAgeCheck &&
                timestampSeconds > 0 &&
                (timestampSeconds + 2 * messageTtlSeconds) * 1_000 < nowMs
            ) {
                dropped.tooOld += 1
                continue
            }

            const timestampMs = timestampSeconds * 1_000
            if (
                timestampMs > 0 &&
                (oldestTimestampMs === undefined || timestampMs < oldestTimestampMs)
            ) {
                oldestTimestampMs = timestampMs
            }
            pendingWrites[pendingWrites.length] = deps.writeBehind.persistMessageAsync({
                id: webMsg.key.id,
                threadJid: input.groupJid,
                senderJid: webMsg.key.participant ?? undefined,
                fromMe: webMsg.key.fromMe === true,
                timestampMs: timestampMs || undefined,
                messageBytes: proto.Message.encode(webMsg.message).finish()
            })
            if (pendingWrites.length >= GROUP_HISTORY_MAX_PENDING_WRITES) {
                await flushPendingWrites(pendingWrites)
            }
            messagesCount += 1
        }
    }

    await flushPendingWrites(pendingWrites)

    const droppedCount =
        dropped.foreignChat + dropped.ephemeralExpired + dropped.tooOld + dropped.stub
    logger.debug('processed group history bundle', {
        messagesCount,
        outOfWindowPinsCount: history.outOfWindowPinnedMessages.length,
        droppedCount,
        dropped
    })

    const event: WaGroupHistoryBundleEvent = {
        groupJid: input.groupJid,
        senderJid: input.senderJid,
        bundleMessageId: input.bundleMessageId,
        messagesCount,
        outOfWindowPinsCount: history.outOfWindowPinnedMessages.length,
        droppedCount,
        oldestTimestampMs,
        historyReceivers: [...(input.bundle.messageHistoryMetadata?.historyReceivers ?? [])]
    }
    deps.emitEvent('group_history_bundle', event)
}

/**
 * A bundle is only ours to process when this account is listed in
 * `historyReceivers`. The list may address us by either PN or LID, so both
 * forms of the local identity are compared.
 */
function isHistoryReceiver(
    deps: WaGroupHistoryDeps,
    bundle: Proto.Message.IMessageHistoryBundle
): boolean {
    const receivers = bundle.messageHistoryMetadata?.historyReceivers
    if (!receivers || receivers.length === 0) {
        return false
    }
    const meUserJid = deps.meJid ? toUserJid(deps.meJid) : null
    const meUserLid = deps.meLid ? toUserJid(deps.meLid) : null
    if (!meUserJid && !meUserLid) {
        return false
    }
    for (let index = 0; index < receivers.length; index += 1) {
        const receiver = toUserJid(receivers[index])
        if (receiver === meUserJid || receiver === meUserLid) {
            return true
        }
    }
    return false
}

function isEphemeralExpired(
    webMsg: Proto.IWebMessageInfo,
    timestampSeconds: number,
    nowMs: number
): boolean {
    const duration = webMsg.ephemeralDuration
    if (!duration) {
        return false
    }
    const startSeconds = longToNumber(webMsg.ephemeralStartTimestamp) || timestampSeconds
    if (startSeconds <= 0) {
        return false
    }
    return (startSeconds + duration) * 1_000 <= nowMs
}
