import type { Logger } from '@infra/log/types'
import { normalizeDeviceJid, splitJid, toUserJid } from '@protocol/jid'
import type { SignalDeviceSyncApi } from '@signal/api/SignalDeviceSyncApi'
import { toError } from '@util/primitives'

export type DeviceFanoutResolver = {
    resolveDirectFanoutDeviceJids(
        recipientJid: string,
        selfDeviceJid: string
    ): Promise<readonly string[]>

    resolveGroupParticipantDeviceJids(
        participantUserJids: readonly string[]
    ): Promise<readonly string[]>

    resolveOwnPeerDeviceJids(): Promise<readonly string[]>

    resolveSelfDeviceJidForRecipient(
        recipientJid: string,
        meJid: string,
        meLid: string | null | undefined
    ): string
}

export function createDeviceFanoutResolver(options: {
    readonly signalDeviceSync: SignalDeviceSyncApi
    readonly getCurrentMeJid: () => string | null | undefined
    readonly getCurrentMeLid: () => string | null | undefined
    readonly logger: Logger
}): DeviceFanoutResolver {
    const { signalDeviceSync, getCurrentMeJid, getCurrentMeLid, logger } = options

    const requireCurrentMeJid = (context: string): string => {
        const meJid = getCurrentMeJid()
        if (meJid) {
            return meJid
        }
        throw new Error(`${context} requires registered meJid`)
    }

    const resolveDirectFanoutDeviceJids = async (
        recipientJid: string,
        selfDeviceJidForRecipient: string
    ): Promise<readonly string[]> => {
        const recipientUserJid = toUserJid(recipientJid)
        const meUserJid = toUserJid(selfDeviceJidForRecipient)
        const targets =
            recipientUserJid === meUserJid ? [recipientUserJid] : [recipientUserJid, meUserJid]

        try {
            const synced = await signalDeviceSync.syncDeviceList(targets)
            const byUser = new Map<string, readonly string[]>(
                synced.map((entry) => [toUserJid(entry.jid), entry.deviceJids])
            )

            const fanout = new Set<string>()
            const recipientDevices = byUser.get(recipientUserJid) ?? []
            if (recipientDevices.length === 0) {
                fanout.add(recipientUserJid)
            } else {
                for (let index = 0; index < recipientDevices.length; index += 1) {
                    fanout.add(recipientDevices[index])
                }
            }

            const meDevices = byUser.get(meUserJid) ?? []
            const normalizedMeJid = normalizeDeviceJid(selfDeviceJidForRecipient)
            for (let index = 0; index < meDevices.length; index += 1) {
                const deviceJid = meDevices[index]
                if (normalizeDeviceJid(deviceJid) === normalizedMeJid) {
                    continue
                }
                fanout.add(deviceJid)
            }

            return [...fanout]
        } catch (error) {
            logger.warn('signal device fanout sync failed, falling back to direct recipient', {
                to: recipientJid,
                message: toError(error).message
            })
            return [recipientUserJid]
        }
    }

    const resolveGroupParticipantDeviceJids = async (
        participantUserJids: readonly string[]
    ): Promise<readonly string[]> => {
        const meDeviceJids = new Set<string>()
        const meJid = getCurrentMeJid()
        if (meJid) {
            try {
                meDeviceJids.add(normalizeDeviceJid(meJid))
            } catch (error) {
                logger.trace('ignoring malformed me jid', {
                    meJid,
                    message: toError(error).message
                })
            }
        }

        const meLid = getCurrentMeLid()
        if (meLid && meLid.includes('@')) {
            try {
                meDeviceJids.add(normalizeDeviceJid(meLid))
            } catch (error) {
                logger.trace('ignoring malformed me lid jid', {
                    meLid,
                    message: toError(error).message
                })
            }
        }

        const candidateUsers = [...new Set(participantUserJids)]
        if (candidateUsers.length === 0) {
            return []
        }

        try {
            const synced = await signalDeviceSync.syncDeviceList(candidateUsers)
            const fanout = new Set<string>()
            for (const entry of synced) {
                if (entry.deviceJids.length === 0) {
                    const normalizedEntryJid = normalizeDeviceJid(entry.jid)
                    if (meDeviceJids.has(normalizedEntryJid)) {
                        continue
                    }
                    fanout.add(normalizedEntryJid)
                    continue
                }

                for (const deviceJid of entry.deviceJids) {
                    const normalizedDeviceJid = normalizeDeviceJid(deviceJid)
                    if (meDeviceJids.has(normalizedDeviceJid)) {
                        continue
                    }
                    fanout.add(normalizedDeviceJid)
                }
            }
            return [...fanout]
        } catch (error) {
            logger.warn(
                'group participant device sync failed, falling back to participant user jids',
                {
                    participants: candidateUsers.length,
                    message: toError(error).message
                }
            )
            const fallbackJids = new Set<string>()
            for (const candidateJid of candidateUsers) {
                try {
                    const normalizedCandidateJid = normalizeDeviceJid(candidateJid)
                    if (meDeviceJids.has(normalizedCandidateJid)) {
                        continue
                    }
                    fallbackJids.add(normalizedCandidateJid)
                } catch (fallbackError) {
                    logger.trace(
                        'ignoring malformed participant jid in fallback fanout resolution',
                        {
                            participantJid: candidateJid,
                            message: toError(fallbackError).message
                        }
                    )
                }
            }
            return [...fallbackJids]
        }
    }

    const resolveOwnPeerDeviceJids = async (): Promise<readonly string[]> => {
        const meJid = requireCurrentMeJid('resolveOwnPeerDeviceJids')
        const meUserJid = toUserJid(meJid)
        const meDevices = new Set<string>()
        meDevices.add(normalizeDeviceJid(meJid))

        const meLid = getCurrentMeLid()
        if (meLid && meLid.includes('@')) {
            try {
                meDevices.add(normalizeDeviceJid(meLid))
            } catch (error) {
                logger.trace('ignoring malformed me lid jid while resolving peer devices', {
                    meLid,
                    message: toError(error).message
                })
            }
        }

        try {
            const synced = await signalDeviceSync.syncDeviceList([meUserJid])
            const peerDevices = new Set<string>()
            for (const entry of synced) {
                const sourceDevices = entry.deviceJids.length > 0 ? entry.deviceJids : [entry.jid]
                for (const deviceJid of sourceDevices) {
                    try {
                        const normalized = normalizeDeviceJid(deviceJid)
                        if (meDevices.has(normalized)) {
                            continue
                        }
                        peerDevices.add(normalized)
                    } catch (error) {
                        logger.trace(
                            'ignoring malformed peer device jid while resolving app-state peers',
                            {
                                deviceJid,
                                message: toError(error).message
                            }
                        )
                    }
                }
            }
            return [...peerDevices]
        } catch (error) {
            logger.warn('failed to resolve peer devices for app-state key request', {
                message: toError(error).message
            })
            return []
        }
    }

    const resolveSelfDeviceJidForRecipient = (
        recipientJid: string,
        meJid: string,
        meLid: string | null | undefined
    ): string => {
        if (splitJid(recipientJid).server !== 'lid') {
            return meJid
        }
        if (!meLid || !meLid.includes('@')) {
            return meJid
        }
        return meLid
    }

    return {
        resolveDirectFanoutDeviceJids,
        resolveGroupParticipantDeviceJids,
        resolveOwnPeerDeviceJids,
        resolveSelfDeviceJidForRecipient
    }
}
