import { createNoopLogger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import type { WaCallMediaGroup, WaCallMediaRelays } from '@zapo-js/voip-media'

import {
    CallMediaType,
    type CallState,
    type EndCallReason,
    type RelayData,
    type WaVoipDeps
} from '../../types.js'
import { CallInfo } from '../call-state.js'
import { senderStreamsOf } from '../group-media-plan.js'
import {
    createGroupComposition,
    WA_CALL_PARTICIPANT_STATE,
    type WaCallGroupParticipant,
    type WaGroupCompositionDiff
} from '../group-participants.js'
import { WaCallMediaSession } from '../WaCallMediaSession.js'

import { createSessionDelegate, type RecordingMediaLink, recordMediaLink } from './_helpers.js'

export const ID = 'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG'
export const GROUP_JID = '120363431977320048@g.us'
export const SELF = '184478207058035@lid'
export const SELF_DEVICE = '184478207058035:1@lid'
export const PEER = '50062877036657@lid'
export const PEER_DEVICE = '50062877036657:76@lid'
export const PEER_SECOND_DEVICE = '50062877036657:12@lid'
export const THIRD = '112984198234339@lid'
export const THIRD_DEVICE = '112984198234339:0@lid'
export const FOURTH = '777777777777@lid'
export const FOURTH_DEVICE = '777777777777:0@lid'

export const CONNECTED = WA_CALL_PARTICIPANT_STATE.Connected
export const CALL_KEY = new Uint8Array(32).fill(0x5a)
export const OTHER_CALL_KEY = new Uint8Array(32).fill(0x33)

export const THREE_WAY: readonly WaCallGroupParticipant[] = [
    { jid: SELF, devices: [SELF_DEVICE], state: CONNECTED },
    { jid: PEER, devices: [PEER_DEVICE, PEER_SECOND_DEVICE], state: CONNECTED },
    { jid: THIRD, devices: [THIRD_DEVICE], state: CONNECTED }
]

export interface Harness {
    readonly session: WaCallMediaSession
    readonly call: CallInfo
    readonly link: RecordingMediaLink
    readonly sent: BinaryNode[]
    readonly diffs: WaGroupCompositionDiff[]
    readonly ended: EndCallReason[]
    /** Every state the call was reported in, in order. */
    readonly states: CallState[]
    /** Who each video upgrade of the call was reported at. */
    readonly upgrades: (string | null)[]
    /** Every per-participant event, as `[event, participantJid, value]`. */
    readonly events: [string, string | undefined, unknown][]
    /** Debug log lines, message and context. */
    readonly logs: [string, Record<string, unknown> | undefined][]
    /** The session clock, advanced by the test. */
    readonly clock: { now: number }
    /** Devices whose Signal session is missing, so a key cannot be encrypted for them. */
    readonly unreachable: Set<string>
}

export async function createSession(
    options: {
        readonly composition?: readonly WaCallGroupParticipant[] | null
        readonly direction?: 'incoming' | 'outgoing'
        readonly mediaType?: CallMediaType
        readonly relayData?: RelayData
        readonly group?: boolean
        /** A call built by the test, used as it is. */
        readonly info?: CallInfo
    } = {}
): Promise<Harness> {
    const events: [string, string | undefined, unknown][] = []
    const logs: [string, Record<string, unknown> | undefined][] = []
    const clock = { now: 1_000 }
    const logger = {
        ...createNoopLogger(),
        debug: (message: string, context?: Record<string, unknown>) => {
            logs.push([message, context])
        }
    }
    const sent: BinaryNode[] = []
    const diffs: WaGroupCompositionDiff[] = []
    const ended: EndCallReason[] = []
    const states: CallState[] = []
    const upgrades: (string | null)[] = []
    const unreachable = new Set<string>()
    const mediaType = options.mediaType ?? CallMediaType.Audio
    const call =
        options.info ??
        (options.direction === 'outgoing'
            ? CallInfo.newOutgoing(ID, PEER, SELF_DEVICE, mediaType)
            : CallInfo.newIncoming(ID, PEER_DEVICE, PEER_DEVICE, undefined, mediaType))
    if (!options.info && options.group !== false) {
        call.groupJid = GROUP_JID
        call.joinable = true
        if (options.composition !== null) {
            call.groupComposition = createGroupComposition(options.composition ?? THREE_WAY)
        }
    }
    if (!options.info) call.relayData = options.relayData

    const { link, createMediaLink } = recordMediaLink()
    const deps = {
        authClient: {
            getCurrentCredentials: () => ({ meJid: SELF_DEVICE, meLid: SELF_DEVICE })
        },
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                sent.push(node)
            }
        },
        messageDispatch: { syncSignalSession: async () => undefined },
        sessionResolver: {
            ensureSessionsBatch: async (devices: readonly string[]) => {
                for (const jid of devices) {
                    if (unreachable.has(jid)) throw new Error(`no session for ${jid}`)
                }
                return devices.map((jid) => ({ address: jid, session: {} }))
            }
        },
        signalProtocol: {
            encryptMessagesBatch: async (requests: readonly unknown[]) =>
                requests.map(() => ({ type: 'msg', ciphertext: Uint8Array.of(1, 2, 3) }))
        }
    } as unknown as WaVoipDeps

    const session = new WaCallMediaSession({
        deps,
        logger,
        info: call,
        createMediaLink,
        now: () => clock.now,
        delegate: createSessionDelegate({
            emitPeerMute: (_call, muted, jid) => {
                events.push(['mute', jid, muted])
            },
            emitMuteRequested: (_call, jid, requestState) => {
                events.push(['mute_requested', jid, requestState])
            },
            emitHandRaise: (_call, jid, raised) => {
                events.push(['hand', jid, raised])
            },
            emitPeerVideoState: (_call, change, jid) => {
                events.push(['video', jid, change.state])
            },
            emitScreenShare: (_call, share, jid) => {
                events.push(['screen_share', jid, share.state])
            },
            emitCallReaction: (_call, reaction, jid) => {
                events.push(['reaction', jid, reaction.reaction])
            },
            emitInboundVideoRtp: (_call, packet, jid) => {
                events.push(['video_rtp', jid, packet.ssrc])
            },
            emitParticipantMedia: (_call, jid, receiving) => {
                events.push(['participant_media', jid, receiving])
            },
            emitState: (reported) => {
                states.push(reported.stateData.state)
            },
            emitVideoUpgraded: (_call, upgraderJid) => {
                upgrades.push(upgraderJid)
            },
            emitParticipantsChanged: (_call, diff) => {
                diffs.push(diff)
            },
            endCall: (_call, reason) => {
                ended.push(reason)
            }
        })
    })
    await session.initMedia(SELF_DEVICE, options.direction === 'outgoing' ? PEER : PEER_DEVICE)
    return {
        session,
        call,
        link,
        sent,
        diffs,
        ended,
        states,
        upgrades,
        events,
        logs,
        clock,
        unreachable
    }
}

export function innerOf(node: BinaryNode): BinaryNode {
    return (node.content as BinaryNode[])[0]
}

export function sentWithTag(harness: Harness, tag: string): BinaryNode[] {
    return harness.sent.filter((node) => innerOf(node).tag === tag)
}

export function lastGroup(link: RecordingMediaLink): WaCallMediaGroup | null | undefined {
    return link.sections('group').at(-1)
}

export function senderStreams(deviceJids: readonly string[], coversVideo = false): number[] {
    return deviceJids.flatMap((jid) => senderStreamsOf(ID, jid, coversVideo))
}

export interface RosterEntry {
    readonly jid: string
    readonly devices: readonly string[]
    readonly state?: string
    readonly tosNotAccepted?: boolean
    /** `<device pid>` per device jid. */
    readonly pids?: Readonly<Record<string, string>>
}

export function toRoster(participants: readonly WaCallGroupParticipant[]): RosterEntry[] {
    return participants.map((participant) => ({
        jid: participant.jid,
        devices: participant.devices,
        state: participant.state ?? CONNECTED
    }))
}

/** A `<group_update>`: the roster is the whole call, `rekey` and the tid sit on `<group_info>`. */
export function groupUpdate(options: {
    readonly transactionId?: number
    readonly rekey?: boolean
    readonly roster?: readonly RosterEntry[]
    readonly relay?: BinaryNode
}): BinaryNode {
    const content: BinaryNode[] = []
    if (options.roster) {
        const attrs: Record<string, string> = { media: 'audio', 'connected-limit': '32' }
        if (options.transactionId !== undefined) {
            attrs['transaction-id'] = String(options.transactionId)
        }
        if (options.rekey) attrs.rekey = '1'
        content.push({
            tag: 'group_info',
            attrs,
            content: options.roster.map((entry) => ({
                tag: 'user',
                attrs: {
                    jid: entry.jid,
                    ...(entry.state ? { state: entry.state } : {}),
                    ...(entry.tosNotAccepted ? { tos_not_accepted: '1' } : {})
                },
                content: entry.devices.map((jid) => ({
                    tag: 'device',
                    attrs: { jid, ...(entry.pids?.[jid] !== undefined && { pid: entry.pids[jid] }) }
                }))
            }))
        })
    }
    if (options.relay) content.push(options.relay)
    return {
        tag: 'call',
        attrs: { from: `${ID}@call`, id: 'GROUPUPDATE' },
        content: [
            {
                tag: 'group_update',
                attrs: { 'call-id': ID, 'call-creator': PEER_DEVICE },
                content
            }
        ]
    }
}

export interface RelaySpec {
    readonly name: string
    readonly v4: readonly [number, number, number, number]
    readonly v6: number
    readonly token: Uint8Array
    readonly rtt?: number
}

export const SIN: RelaySpec = {
    name: 'sin6c02',
    v4: [10, 1, 1, 1],
    v6: 1,
    token: Uint8Array.of(0x51)
}
export const GRU: RelaySpec = {
    name: 'gru2c01',
    v4: [10, 2, 2, 2],
    v6: 2,
    token: Uint8Array.of(0xa1),
    rtt: 19
}
export const GIG: RelaySpec = {
    name: 'gig4c02',
    v4: [10, 3, 3, 3],
    v6: 3,
    token: Uint8Array.of(0xb1),
    rtt: 27
}
export const LIS: RelaySpec = {
    name: 'lis1c01',
    v4: [10, 5, 5, 5],
    v6: 5,
    token: Uint8Array.of(0xd1),
    rtt: 44
}

export function dualStack(relay: RelaySpec): Uint8Array {
    const v6 = new Uint8Array(18)
    v6[0] = 0xfd
    v6[15] = relay.v6
    v6[16] = 0x0d
    v6[17] = 0x96
    return Uint8Array.from([...relay.v4, 0x0d, 0x96, ...v6])
}

/** A `<relay>` listing each relay under `protocol=1` first, then dialable, over both families. */
export function relayDescriptor(spec: {
    readonly selfPid: string
    readonly relays: readonly RelaySpec[]
    readonly dialable?: boolean
}): BinaryNode {
    const content: BinaryNode[] = [{ tag: 'key', attrs: {}, content: 'REISSUEDRELAYKEY' }]
    spec.relays.forEach((relay, index) => {
        content.push({ tag: 'token', attrs: { id: String(index) }, content: relay.token })
    })
    spec.relays.forEach((relay, index) => {
        const attrs: Record<string, string> = {
            relay_name: relay.name,
            relay_id: String(index),
            token_id: String(index),
            ...(relay.rtt !== undefined ? { c2r_rtt: String(relay.rtt) } : {})
        }
        content.push({ tag: 'te2', attrs: { ...attrs, protocol: '1' }, content: dualStack(relay) })
        if (spec.dialable !== false) {
            content.push({ tag: 'te2', attrs, content: dualStack(relay) })
        }
    })
    return { tag: 'relay', attrs: { self_pid: spec.selfPid, peer_pid: '0' }, content }
}

export function offerRelayData(): RelayData {
    return {
        endpoints: [
            {
                ip: '10.1.1.1',
                port: 3478,
                token: 'T',
                rawToken: SIN.token,
                key: 'OFFERKEY',
                relayId: 0,
                relayName: SIN.name
            }
        ],
        participantJids: [PEER_DEVICE],
        uuid: 'OFFERUUID',
        selfPid: 0
    }
}

export function relaysPublished(
    link: RecordingMediaLink
): (WaCallMediaRelays | null | undefined)[] {
    return link.sections('relays')
}

/** What the roster of a call we placed says right after the offer: only we are connected. */
export const PLACED: readonly WaCallGroupParticipant[] = [
    { jid: SELF, devices: [SELF_DEVICE], state: CONNECTED },
    { jid: PEER, devices: [PEER_DEVICE, PEER_SECOND_DEVICE], state: 'outgoing' },
    { jid: THIRD, devices: [THIRD_DEVICE], state: 'receipt' }
]

export async function placedGroupCall(): Promise<Harness> {
    const harness = await createSession({
        direction: 'outgoing',
        composition: PLACED,
        relayData: offerRelayData()
    })
    harness.call.applyTransition({ type: 'offer_sent' })
    return harness
}

export const THIRD_KEY = '112984198234339@lid'

export function callStanza(
    from: string,
    tag: string,
    attrs: Record<string, string>,
    content?: BinaryNode[]
): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: `${tag}-${Math.random()}` },
        content: [{ tag, attrs: { 'call-id': ID, 'call-creator': PEER_DEVICE, ...attrs }, content }]
    }
}

export async function activeGroupSession(
    options: Parameters<typeof createSession>[0] = {}
): Promise<Harness> {
    const harness = await createSession(options)
    harness.call.applyTransition({ type: 'local_accepted' })
    harness.call.applyTransition({ type: 'media_connected' })
    return harness
}
