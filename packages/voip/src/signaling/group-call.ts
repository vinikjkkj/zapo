import { createNoopLogger, type Logger } from 'zapo-js'
import { normalizeDeviceJid, toUserJid } from 'zapo-js/protocol'
import { type BinaryNode, buildReceiptNode } from 'zapo-js/transport'

import type { WaCallGroupParticipant } from '../call/group-participants.js'
import { groupParticipantAccountKey } from '../jid.js'
import { resolveOfferParticipantDevices } from '../peer-devices.js'
import type { CallOfferParticipant, WaVoipDeps } from '../types.js'

import { deviceIdentityNode, encryptCallKeyForDevices } from './call-key.js'
import { callStanza, toCallServerJid } from './call-stanza.js'
import { normalizeParticipantDeviceJids } from './group-info.js'
import { buildOfferMediaNodes, CAPABILITY_OFFER, CAPABILITY_VIDEO_OFFER } from './lifecycle.js'

/** A group `<offer>` and the participants it named, creator first, devices addressed. */
interface GroupOfferStanza {
    readonly node: BinaryNode
    readonly participants: readonly WaCallGroupParticipant[]
}

function buildGroupUserNode(
    participant: WaCallGroupParticipant,
    capability?: Uint8Array
): BinaryNode {
    return {
        tag: 'user',
        attrs: { jid: participant.jid },
        content: participant.devices.map((deviceJid) => ({
            tag: 'device',
            attrs: { jid: normalizeDeviceJid(deviceJid) },
            content: capability
                ? [{ tag: 'capability', attrs: { ver: '1' }, content: capability }]
                : undefined
        }))
    }
}

/**
 * Builds the `<offer>` that places a group call: addressed to `<call-id>@call`, with the
 * participants in an attribute-less `<group_info>` (creator first, with only the device placing the
 * call, the only one carrying a `<capability>`) and no `<destination>`, `<enc>`, `<encopt>` or `<device-identity>`: the key
 * arrives later over `enc_rekey`. The server fills `joinable` and the `<group_info>` attributes.
 *
 * @throws with no own jid, with nobody left to ring, or through
 * {@link normalizeParticipantDeviceJids}.
 */
export async function buildGroupOfferStanza(
    deps: WaVoipDeps,
    callId: string,
    groupJid: string,
    participants: readonly CallOfferParticipant[],
    isVideo: boolean,
    logger?: Logger
): Promise<GroupOfferStanza> {
    const log = logger ?? createNoopLogger()
    const creds = deps.authClient.getCurrentCredentials()
    const callCreator = creds?.meLid || creds?.meJid || ''
    if (!callCreator) {
        throw new Error('a group call offer has no jid of ours to name as its call-creator')
    }

    const creatorKey = groupParticipantAccountKey(callCreator)
    const resolved = await resolveOfferParticipantDevices(
        deps,
        participants.filter(
            (participant) => groupParticipantAccountKey(participant.jid) !== creatorKey
        ),
        log
    )
    if (resolved.length === 0) {
        throw new Error(`group call on ${groupJid} has no participant to ring`)
    }

    const creator: WaCallGroupParticipant = {
        jid: toUserJid(callCreator),
        devices: normalizeParticipantDeviceJids(callCreator, [callCreator])
    }
    const listed: WaCallGroupParticipant[] = [creator]
    const users = [buildGroupUserNode(creator, isVideo ? CAPABILITY_VIDEO_OFFER : CAPABILITY_OFFER)]
    for (const participant of resolved) {
        const entry: WaCallGroupParticipant = {
            jid: toUserJid(participant.jid),
            devices: normalizeParticipantDeviceJids(participant.jid, participant.devices)
        }
        listed.push(entry)
        users.push(buildGroupUserNode(entry))
    }

    return {
        node: callStanza(
            toCallServerJid(callId),
            'offer',
            callId,
            callCreator,
            { 'group-jid': groupJid },
            [...buildOfferMediaNodes(isVideo), { tag: 'group_info', attrs: {}, content: users }]
        ),
        participants: listed
    }
}

interface EncRekeyStanzaParams {
    readonly callId: string
    readonly callCreator: string
    /** The `transaction-id` of the `<group_info>` that asked for this rekey. */
    readonly transactionId: number
    readonly peerDeviceJid: string
    /** The new 32-byte call key, already installed on this side. */
    readonly callKey: Uint8Array
}

/**
 * Builds the `<enc_rekey>` carrying a new call key to one device: `transaction-id` echoing the
 * `<group_info>` that asked, `<encopt keygen='2'/>`, a direct `<enc>`, `<device-identity>` on a `pkmsg`.
 *
 * @throws when there is no Signal session for the device; a fan-out contains it per device.
 */
export async function buildEncRekeyStanza(
    deps: WaVoipDeps,
    params: EncRekeyStanzaParams
): Promise<BinaryNode> {
    const { encNodes, shouldIncludeDeviceIdentity } = await encryptCallKeyForDevices(
        deps,
        [params.peerDeviceJid],
        params.callKey
    )
    const encNode = encNodes[0]
    if (!encNode) {
        throw new Error(`the call key was not encrypted for ${params.peerDeviceJid}`)
    }

    const content: BinaryNode[] = [{ tag: 'encopt', attrs: { keygen: '2' } }, encNode]
    const creds = deps.authClient.getCurrentCredentials()
    if (shouldIncludeDeviceIdentity && creds?.signedIdentity) {
        content.push(deviceIdentityNode(creds.signedIdentity))
    }

    return callStanza(
        params.peerDeviceJid,
        'enc_rekey',
        params.callId,
        params.callCreator,
        { 'transaction-id': String(params.transactionId) },
        content
    )
}

/**
 * Builds the `<call><heartbeat>` every connected member of a group call sends the call itself,
 * every 10 s, whether it answered, placed or joined the call.
 */
export function buildHeartbeatStanza(callId: string, callCreator: string): BinaryNode {
    return callStanza(toCallServerJid(callId), 'heartbeat', callId, callCreator)
}

/** The `state` a `<peer_state>` reports for a peer; only `Invisible` has been seen on the wire. */
export const WA_PEER_STATE = Object.freeze({ Invisible: 'invisible', Visible: 'visible' } as const)

/** One of the values of {@link WA_PEER_STATE}. */
type WaPeerState = (typeof WA_PEER_STATE)[keyof typeof WA_PEER_STATE]

/**
 * Builds the `<call><peer_state>` telling the server what this side sees of one group-call member,
 * named by its account (a device suffix is dropped). `Invisible` is a member whose media stopped
 * reaching us; the server takes it off the call. `t` is in epoch milliseconds.
 */
export function buildPeerStateStanza(
    callId: string,
    callCreator: string,
    peerAccountJid: string,
    state: WaPeerState,
    nowMs: number = Date.now()
): BinaryNode {
    return callStanza(
        toCallServerJid(callId),
        'peer_state',
        callId,
        callCreator,
        { t: String(Math.floor(nowMs)) },
        [{ tag: 'user', attrs: { state, jid: toUserJid(peerAccountJid) } }]
    )
}

/**
 * Builds the `<receipt>` answering an `<enc_rekey>`, sent whether or not its key decrypted;
 * the child names the call, `call-creator` before `call-id`.
 */
export function buildEncRekeyReceiptStanza(
    peerDeviceJid: string,
    rekeyMsgId: string,
    callId: string,
    callCreator: string,
    ourJid: string
): BinaryNode {
    return buildReceiptNode({
        kind: 'custom',
        attrs: { to: peerDeviceJid, id: rekeyMsgId, from: ourJid },
        content: [{ tag: 'enc_rekey', attrs: { 'call-creator': callCreator, 'call-id': callId } }]
    })
}
