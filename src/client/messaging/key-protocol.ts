import type { WaAppStateSyncKey } from '@appstate/types'
import type { DeviceFanoutResolver } from '@client/messaging/fanout'
import type { WaSignalMessagePublishInput } from '@client/types'
import type { Logger } from '@infra/log/types'
import { writeRandomPadMax16 } from '@message/padding'
import type { WaMessagePublishOptions, WaMessagePublishResult } from '@message/types'
import type { Proto } from '@proto'
import { proto } from '@proto'
import { normalizeDeviceJid } from '@protocol/jid'
import { bytesToHex } from '@util/bytes'

type PublishSignalMessageFn = (
    input: WaSignalMessagePublishInput,
    options?: WaMessagePublishOptions
) => Promise<WaMessagePublishResult>

export type AppStateSyncKeyProtocol = {
    requestKeys(keyIds: readonly Uint8Array[]): Promise<readonly string[]>
    sendKeyShare(
        toDeviceJid: string,
        keys: readonly WaAppStateSyncKey[],
        missingKeyIds?: readonly Uint8Array[]
    ): Promise<void>
}

export function createAppStateSyncKeyProtocol(options: {
    readonly publishSignalMessage: PublishSignalMessageFn
    readonly fanoutResolver: DeviceFanoutResolver
    readonly getCurrentMeJid: () => string | null | undefined
    readonly getCurrentMeLid: () => string | null | undefined
    readonly logger: Logger
}): AppStateSyncKeyProtocol {
    const { publishSignalMessage, fanoutResolver, getCurrentMeJid, getCurrentMeLid, logger } =
        options

    const requireCurrentIdentity = (context: string): void => {
        const meJid = getCurrentMeJid()
        const meLid = getCurrentMeLid()
        if (meJid || meLid) {
            return
        }
        throw new Error(`${context} requires registered identity`)
    }

    const publishProtocolMessageToDevice = async (
        deviceJid: string,
        protocolMessage: proto.Message.IProtocolMessage
    ): Promise<void> => {
        const plaintext = await writeRandomPadMax16(
            proto.Message.encode({
                protocolMessage
            }).finish()
        )
        await publishSignalMessage({
            to: deviceJid,
            plaintext,
            type: 'protocol',
            category: 'peer',
            pushPriority: 'high'
        })
    }

    const requestKeys = async (keyIds: readonly Uint8Array[]): Promise<readonly string[]> => {
        requireCurrentIdentity('requestKeys')

        const normalizedKeyIds: Uint8Array[] = []
        const seenKeyIds = new Set<string>()
        for (const keyId of keyIds) {
            if (keyId.byteLength === 0) {
                continue
            }
            const keyHex = bytesToHex(keyId)
            if (seenKeyIds.has(keyHex)) {
                continue
            }
            seenKeyIds.add(keyHex)
            normalizedKeyIds.push(keyId)
        }
        if (normalizedKeyIds.length === 0) {
            return []
        }

        const peerDeviceJids = await fanoutResolver.resolveOwnPeerDeviceJids()
        if (peerDeviceJids.length === 0) {
            logger.warn('app-state sync key request skipped: no peer devices available', {
                keys: normalizedKeyIds.length
            })
            return []
        }

        const protocolMessage: proto.Message.IProtocolMessage = {
            type: proto.Message.ProtocolMessage.Type.APP_STATE_SYNC_KEY_REQUEST,
            appStateSyncKeyRequest: {
                keyIds: normalizedKeyIds.map((keyId) => ({
                    keyId
                }))
            }
        }

        const publishResults = await Promise.allSettled(
            peerDeviceJids.map((deviceJid) =>
                publishProtocolMessageToDevice(deviceJid, protocolMessage)
            )
        )
        const failedPublishes = publishResults.filter(
            (result) => result.status === 'rejected'
        ).length
        if (failedPublishes > 0) {
            logger.warn('some app-state sync key requests failed', {
                total: peerDeviceJids.length,
                failed: failedPublishes
            })
        }

        logger.info('app-state sync key request sent to peer devices', {
            devices: peerDeviceJids.length,
            keys: normalizedKeyIds.length,
            keyIds: normalizedKeyIds.map((keyId) => bytesToHex(keyId)).join(',')
        })

        return peerDeviceJids
    }

    const sendKeyShare = async (
        toDeviceJid: string,
        keys: readonly WaAppStateSyncKey[],
        missingKeyIds: readonly Uint8Array[] = []
    ): Promise<void> => {
        requireCurrentIdentity('sendKeyShare')

        const normalizedTo = normalizeDeviceJid(toDeviceJid)
        const seenKeyIds = new Set<string>()
        const keyShareEntries: Proto.Message.IAppStateSyncKey[] = []
        let sharedKeyCount = 0
        for (const key of keys) {
            const keyHex = bytesToHex(key.keyId)
            if (seenKeyIds.has(keyHex)) {
                continue
            }
            seenKeyIds.add(keyHex)
            sharedKeyCount += 1
            keyShareEntries.push({
                keyId: { keyId: key.keyId },
                keyData: {
                    keyData: key.keyData,
                    timestamp: key.timestamp,
                    ...(key.fingerprint ? { fingerprint: key.fingerprint } : {})
                }
            })
        }
        for (const keyId of missingKeyIds) {
            if (keyId.byteLength === 0) {
                continue
            }
            const keyHex = bytesToHex(keyId)
            if (seenKeyIds.has(keyHex)) {
                continue
            }
            seenKeyIds.add(keyHex)
            keyShareEntries.push({
                keyId: { keyId }
            })
        }

        const protocolMessage: proto.Message.IProtocolMessage = {
            type: proto.Message.ProtocolMessage.Type.APP_STATE_SYNC_KEY_SHARE,
            appStateSyncKeyShare: {
                keys: keyShareEntries
            }
        }

        await publishProtocolMessageToDevice(normalizedTo, protocolMessage)

        logger.info('app-state sync key share sent', {
            to: normalizedTo,
            keys: sharedKeyCount,
            orphanKeys: keyShareEntries.length - sharedKeyCount
        })
    }

    return {
        requestKeys,
        sendKeyShare
    }
}
