import type { Logger } from 'zapo-js'
import { isLidJid } from 'zapo-js/protocol'
import { toError } from 'zapo-js/util'

import { groupParticipantAccountKey, toDeviceJid } from './jid.js'
import type { CallOfferParticipant, WaVoipDeps } from './types.js'

type DeviceSyncDeps = Pick<WaVoipDeps, 'signalDeviceSync'>

/** The LID a phone jid maps to, or the jid as given when it is one already or none is known. */
export async function resolvePeerLid(
    deps: DeviceSyncDeps,
    peerJid: string,
    logger: Logger
): Promise<string> {
    if (isLidJid(peerJid)) return peerJid

    try {
        const [mapped] = await deps.signalDeviceSync.queryLidsByPhoneJids([peerJid])
        if (mapped?.lidJid) return mapped.lidJid
    } catch (err) {
        logger.trace('lid resolution failed', { message: toError(err).message })
    }

    return peerJid
}

/** The devices of a calling peer, primary first; a jid naming a companion is kept alone. */
export async function resolvePeerDeviceJids(
    deps: DeviceSyncDeps,
    peerJid: string,
    logger: Logger
): Promise<string[]> {
    const primaryJid = toDeviceJid(peerJid)
    if (/:[1-9]\d*@/.test(peerJid)) return [peerJid]

    try {
        const synced = await deps.signalDeviceSync.syncDeviceList([peerJid])
        const devices = synced.flatMap((entry) => entry.deviceJids)
        const resolved = Array.from(new Set([primaryJid, ...devices]))
        if (resolved.length > 0) {
            logger.debug('incoming peer device resolved', {
                peerJid,
                peerDeviceJids: resolved,
                deviceCount: resolved.length
            })
            return resolved
        }
    } catch (err) {
        logger.trace('incoming peer device resolution failed', {
            peerJid,
            message: toError(err).message
        })
    }

    return [primaryJid]
}

/**
 * Resolves the devices of the participants given none, like a 1:1 callee's. One left
 * unresolved keeps an empty list and is rung on its primary device.
 */
export async function resolveOfferParticipantDevices(
    deps: DeviceSyncDeps,
    participants: readonly CallOfferParticipant[],
    log: Logger
): Promise<readonly { readonly jid: string; readonly devices: readonly string[] }[]> {
    const hasDevices = (participant: CallOfferParticipant): boolean =>
        (participant.devices?.length ?? 0) > 0

    const unresolved = participants.filter((participant) => !hasDevices(participant))
    const devicesByAccount = new Map<string, readonly string[]>()
    if (unresolved.length > 0) {
        try {
            const synced = await deps.signalDeviceSync.syncDeviceList(
                unresolved.map((participant) => participant.jid)
            )
            for (const entry of synced) {
                devicesByAccount.set(groupParticipantAccountKey(entry.jid), entry.deviceJids)
            }
        } catch (err) {
            log.debug('group offer device resolution failed, ringing primary devices', {
                unresolvedCount: unresolved.length,
                message: toError(err).message
            })
        }
    }

    return participants.map((participant) => ({
        jid: participant.jid,
        devices: hasDevices(participant)
            ? (participant.devices ?? [])
            : (devicesByAccount.get(groupParticipantAccountKey(participant.jid)) ?? [])
    }))
}
