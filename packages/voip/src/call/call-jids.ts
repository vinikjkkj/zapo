import type { Logger } from 'zapo-js'
import { normalizeDeviceJid, toUserJid } from 'zapo-js/protocol'
import { type BinaryNode, getNodeChildrenByTag } from 'zapo-js/transport'
import { toError } from 'zapo-js/util'

import type { WaVoipDeps } from '../types.js'

/** Our own jid as the credentials name it, lid first; empty before login. */
export function selfJidOf(deps: Pick<WaVoipDeps, 'authClient'>): string {
    const creds = deps.authClient.getCurrentCredentials()
    return creds?.meLid || creds?.meJid || ''
}

/** Whether `jid` is an account of ours, by lid or by pn. */
export function isOwnAccountJid(deps: Pick<WaVoipDeps, 'authClient'>, jid: string): boolean {
    const creds = deps.authClient.getCurrentCredentials()
    const user = toUserJid(jid)
    return (
        (!!creds?.meLid && user === toUserJid(creds.meLid)) ||
        (!!creds?.meJid && user === toUserJid(creds.meJid))
    )
}

/** The form stanzas are addressed to and arrive from: device 0 bare. */
export function toAddressedJid(jid: string, logger: Logger): string {
    try {
        return normalizeDeviceJid(jid)
    } catch (err) {
        logger.trace('device jid kept as received', {
            jid,
            message: toError(err).message
        })
        return jid
    }
}

/** Whether `jid` is a device of `userJid`'s account; an unreadable jid is not. */
export function isUserJidOf(jid: string, userJid: string, logger: Logger): boolean {
    try {
        return toUserJid(jid) === toUserJid(userJid)
    } catch (err) {
        logger.trace('unreadable jid, not the called user', {
            jid,
            message: toError(err).message
        })
        return false
    }
}

/**
 * The peer device that won a call we placed: the `<relay><participant>` of its `<accept>`
 * when it is a device of the called user, else the device the accept came from. `pid` is
 * the participant's, as on the wire. No pn/lid mapping: another domain falls back too.
 */
export function readAnsweringDevice(
    accept: BinaryNode,
    fromJid: string,
    call: { readonly callId: string; readonly peerJid: string },
    logger: Logger
): { jid: string; pid?: number } {
    for (const relay of getNodeChildrenByTag(accept, 'relay')) {
        for (const participant of getNodeChildrenByTag(relay, 'participant')) {
            const jid = participant.attrs?.jid
            if (!jid) continue
            if (!isUserJidOf(jid, call.peerJid, logger)) {
                logger.debug('accept participant not of the called user, ignored', {
                    callId: call.callId,
                    participant: jid,
                    from: fromJid
                })
                continue
            }
            const pid = Number(participant.attrs.pid)
            return {
                jid: toAddressedJid(jid, logger),
                pid: participant.attrs.pid && Number.isSafeInteger(pid) ? pid : undefined
            }
        }
    }
    return { jid: fromJid }
}
