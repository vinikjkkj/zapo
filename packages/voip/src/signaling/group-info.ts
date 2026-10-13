import { canonicalizeSignalServer, parseSignalAddressFromJid, WA_DEFAULTS } from 'zapo-js/protocol'
import { type BinaryNode, findNodeChild, getNodeChildrenByTag } from 'zapo-js/transport'
import { tryAsNumber } from 'zapo-js/util'

import type { WaCallGroupParticipant } from '../call/group-participants.js'
import { addressDeviceJid } from '../jid.js'

const PRIMARY_DEVICE_ID = 0

/** How many devices one participant may bring into a call; a longer list is refused whole. */
export const WA_CALL_MAX_DEVICES_PER_USER = 5

/** One `<device>` of a participant. Every attribute but the jid is optional on the wire. */
export interface GroupInfoDevice {
    /** The device jid, always carrying its `:device` segment. */
    readonly jid: string
    readonly deviceId: number
    /** `pid`, the device's media index: absent from the offer, set after the accept. */
    readonly pid: number | null
    readonly dec: string | null
    readonly enc: string | null
    /** `vid_dec`, a comma-separated codec list. */
    readonly vidDec: string | null
    readonly platform: string | null
    /** `capability`, the packed capability blob as it arrived. */
    readonly capability: string | null
    readonly capabilityVersion: number | null
    readonly capabilityBitMaskLength: number | null
}

/**
 * One participant, from either `<user>` or `<participant>`; the two never share a
 * `<group_info>` and each fills its own subset of these fields.
 */
export interface GroupInfoParticipant {
    readonly jid: string
    /** Whether the server reported this participant as not joining (`reason` or `error`). */
    readonly nacked: boolean
    readonly reason: string | null
    /** `state` as text, one of `WA_CALL_PARTICIPANT_STATE`. */
    readonly state: string | null
    readonly phash: string | null
    /** `user_pn`: identity only, never a media address. */
    readonly userPn: string | null
    readonly username: string | null
    readonly pushName: string | null
    readonly guestName: string | null
    readonly countryCode: string | null
    readonly accountKind: string | null
    /** `tos_not_accepted`: left out of the rekey fan-out. */
    readonly tosNotAccepted: boolean
    /** `<participant>` only from here down. */
    readonly media: string | null
    readonly rekey: boolean
    readonly transactionId: number | null
    readonly linkToken: string | null
    readonly decExtensionId: string | null
    readonly hnVideo: string | null
    /** Primary first, empty for a nacked participant. */
    readonly devices: readonly GroupInfoDevice[]
}

/** The `<group_info>` of an offer or of a `group_update`. */
export interface GroupInfo {
    readonly media: string
    readonly connectedLimit: number
    /** `rekey` on `<group_info>` itself: the receiver mints the next key and hands it round. */
    readonly rekey: boolean
    /** `transaction-id` on `<group_info>` itself; the `<group_update>` around it carries none. */
    readonly transactionId: number | null
    readonly linkToken: string | null
    readonly phash: string | null
    /** Mutually exclusive with {@link lightweightKey}. */
    readonly groupPhash: string | null
    readonly lightweightKey: string | null
    readonly extensionId: string | null
    readonly participantTag: 'user' | 'participant' | null
    readonly participants: readonly GroupInfoParticipant[]
}

function attrText(attrs: Readonly<Record<string, string>>, name: string): string | null {
    const value = attrs[name]
    return value === undefined || value.length === 0 ? null : value
}

/** Presence is the signal; the explicit negatives are honoured too. */
function attrFlag(attrs: Readonly<Record<string, string>>, name: string): boolean {
    const value = attrText(attrs, name)
    return value !== null && value !== '0' && value.toLowerCase() !== 'false'
}

function isLidServer(server: string): boolean {
    return canonicalizeSignalServer(server) === WA_DEFAULTS.LID_SERVER
}

function withPrimaryFirst<T>(items: readonly T[], deviceIdOf: (item: T) => number): readonly T[] {
    const index = items.findIndex((item) => deviceIdOf(item) === PRIMARY_DEVICE_ID)
    if (index <= 0) return items
    return [items[index], ...items.slice(0, index), ...items.slice(index + 1)]
}

function parseDeviceNode(node: BinaryNode, participantJid: string): GroupInfoDevice {
    const attrs = node.attrs ?? {}
    const jid = attrText(attrs, 'jid')
    if (jid === null) {
        throw new Error(`group_info device of ${participantJid} carries no jid`)
    }

    const addressed = addressDeviceJid(jid)
    return {
        jid: addressed.jid,
        deviceId: addressed.deviceId,
        pid: tryAsNumber(attrs.pid),
        dec: attrText(attrs, 'dec'),
        enc: attrText(attrs, 'enc'),
        vidDec: attrText(attrs, 'vid_dec'),
        platform: attrText(attrs, 'platform'),
        capability: attrText(attrs, 'capability'),
        capabilityVersion: tryAsNumber(attrs.ver),
        capabilityBitMaskLength: tryAsNumber(attrs.bit_mask_length)
    }
}

function parseParticipantNode(node: BinaryNode, isUserNode: boolean): GroupInfoParticipant {
    const attrs = node.attrs ?? {}
    const jid = attrText(attrs, 'jid')
    if (jid === null) {
        throw new Error(`group_info <${node.tag}> carries no jid`)
    }

    const reason = attrText(attrs, 'reason') ?? attrText(attrs, 'error')
    const nacked = reason !== null
    const devices = getNodeChildrenByTag(node, 'device').map((child) => parseDeviceNode(child, jid))

    if (devices.length > WA_CALL_MAX_DEVICES_PER_USER) {
        throw new Error(
            `group_info participant ${jid} carries ${devices.length} devices, over the limit of ${WA_CALL_MAX_DEVICES_PER_USER}`
        )
    }
    if (isUserNode && nacked && devices.length > 0) {
        throw new Error(`group_info user ${jid} is nacked and still carries a device`)
    }
    if (isUserNode && !nacked && devices.length === 0) {
        throw new Error(`group_info user ${jid} is not nacked and carries no device`)
    }

    return {
        jid,
        nacked,
        reason,
        state: attrText(attrs, 'state'),
        phash: attrText(attrs, 'phash'),
        userPn: attrText(attrs, 'user_pn'),
        username: attrText(attrs, 'username'),
        pushName: attrText(attrs, 'push_name'),
        guestName: attrText(attrs, 'guest_name'),
        countryCode: attrText(attrs, 'country_code'),
        accountKind: attrText(attrs, 'account_kind'),
        tosNotAccepted: attrFlag(attrs, 'tos_not_accepted'),
        media: attrText(attrs, 'media'),
        rekey: attrFlag(attrs, 'rekey'),
        transactionId: tryAsNumber(attrs['transaction-id']),
        linkToken: attrText(attrs, 'link-token'),
        decExtensionId: attrText(attrs, 'decextension_id'),
        hnVideo: attrText(attrs, 'hn_video'),
        devices: withPrimaryFirst(devices, (device) => device.deviceId)
    }
}

/**
 * Reads a `<group_info>`. Throws on the stanzas the peer itself refuses: missing `media` or
 * `connected_limit`, `group_phash` with `lightweight_key`, `<user>` with `<participant>`, a
 * missing jid, more than {@link WA_CALL_MAX_DEVICES_PER_USER} devices, or a `<user>` whose
 * device count disagrees with its nack.
 */
export function parseGroupInfoNode(node: BinaryNode): GroupInfo {
    const attrs = node.attrs ?? {}

    const media = attrText(attrs, 'media')
    if (media === null) {
        throw new Error('group_info carries no media')
    }

    const connectedLimit = tryAsNumber(attrs.connected_limit ?? attrs['connected-limit'])
    if (connectedLimit === null || !Number.isSafeInteger(connectedLimit) || connectedLimit < 0) {
        throw new Error('group_info carries no valid connected_limit')
    }

    const groupPhash = attrText(attrs, 'group_phash')
    const lightweightKey = attrText(attrs, 'lightweight_key')
    if (groupPhash !== null && lightweightKey !== null) {
        throw new Error('group_info carries both group_phash and lightweight_key')
    }

    const userNodes = getNodeChildrenByTag(node, 'user')
    const participantNodes = getNodeChildrenByTag(node, 'participant')
    if (userNodes.length > 0 && participantNodes.length > 0) {
        throw new Error('group_info carries both <user> and <participant> children')
    }

    const isUserNode = userNodes.length > 0
    const listed = isUserNode ? userNodes : participantNodes

    return {
        media,
        connectedLimit,
        rekey: attrFlag(attrs, 'rekey'),
        transactionId: tryAsNumber(attrs['transaction-id']),
        linkToken: attrText(attrs, 'link-token'),
        phash: attrText(attrs, 'phash'),
        groupPhash,
        lightweightKey,
        extensionId: attrText(attrs, 'decextension') ?? attrText(attrs, 'extension_id'),
        participantTag: listed.length === 0 ? null : isUserNode ? 'user' : 'participant',
        participants: listed.map((child) => parseParticipantNode(child, isUserNode))
    }
}

/** The participants of a parsed `<group_info>` in the shape the reconciler reads. */
export function toGroupCallParticipants(info: GroupInfo): readonly WaCallGroupParticipant[] {
    return info.participants.map((participant) => {
        const withPid = participant.devices.filter((device) => device.pid !== null)
        return {
            jid: participant.jid,
            devices: participant.devices.map((device) => device.jid),
            state: participant.state ?? undefined,
            nacked: participant.nacked,
            ...(withPid.length > 0 && {
                devicePids: Object.fromEntries(
                    withPid.map((device) => [device.jid, device.pid as number])
                )
            })
        }
    })
}

/** What the `<group_info>` of a call stanza says about who is on the call. */
export type GroupCallRoster =
    | {
          readonly kind: 'roster'
          readonly info: GroupInfo
          readonly participants: readonly WaCallGroupParticipant[]
      }
    | { readonly kind: 'absent' }
    | { readonly kind: 'empty' }

/**
 * Reads the roster off an `<offer>` or `<group_update>`. A `<group_info>` listing nobody is
 * `empty` and treated as no roster: emptying a live call cannot be undone, keeping it can.
 *
 * @throws through {@link parseGroupInfoNode}.
 */
export function readGroupCallRoster(inner: BinaryNode): GroupCallRoster {
    const groupInfoNode = findNodeChild(inner, 'group_info')
    if (!groupInfoNode) return { kind: 'absent' }

    const info = parseGroupInfoNode(groupInfoNode)
    const participants = toGroupCallParticipants(info)
    if (participants.length === 0) return { kind: 'empty' }

    return { kind: 'roster', info, participants }
}

/**
 * The devices a participant addresses, each with its `:device`, primary first. A count
 * outside one to five collapses onto the primary device of the user jid.
 *
 * @throws when the user jid and its devices disagree on being a LID.
 */
export function normalizeParticipantDeviceJids(
    userJid: string,
    deviceJids: readonly string[]
): readonly string[] {
    const user = parseSignalAddressFromJid(userJid)
    const userServer = user.server ?? WA_DEFAULTS.HOST_DOMAIN

    if (deviceJids.length < 1 || deviceJids.length > WA_CALL_MAX_DEVICES_PER_USER) {
        return [`${user.user}:${PRIMARY_DEVICE_ID}@${userServer}`]
    }

    const userIsLid = isLidServer(userServer)
    const userIdentity = `${user.user}@${canonicalizeSignalServer(userServer)}`
    const resolved = deviceJids.map((jid) => {
        const addressed = addressDeviceJid(jid)
        if (isLidServer(addressed.server) !== userIsLid) {
            throw new Error(`participant ${userJid} mixes LID and non-LID device jids`)
        }
        const deviceUser = parseSignalAddressFromJid(jid).user
        if (`${deviceUser}@${canonicalizeSignalServer(addressed.server)}` !== userIdentity) {
            throw new Error(`device ${jid} is not a device of participant ${userJid}`)
        }
        return addressed
    })

    return withPrimaryFirst(resolved, (entry) => entry.deviceId).map((entry) => entry.jid)
}
