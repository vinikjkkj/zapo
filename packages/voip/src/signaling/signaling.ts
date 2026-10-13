import { createNoopLogger, type Logger, unpadPkcs7, writeRandomPadMax16 } from 'zapo-js'
import { proto } from 'zapo-js/proto'
import { normalizeDeviceJid, parseSignalAddressFromJid, toUserJid } from 'zapo-js/protocol'
import {
    type BinaryNode,
    buildReceiptNode,
    findNodeChild,
    getFirstNodeChild,
    getNodeChildren,
    getNodeChildrenByTag
} from 'zapo-js/transport'
import { bytesToHex, toError, tryAsNumber } from 'zapo-js/util'

import { randomBytes } from '@zapo-js/voip-media'

import { groupParticipantAccountKey, type WaGroupParticipant } from '../call/group-participants.js'
import type {
    CallOfferParticipant,
    NodeInfo,
    PeerVideoStateChange,
    RelayEndpoint,
    WaVoipDeps,
    WaVoipStores
} from '../types.js'

import { normalizeParticipantDeviceJids } from './group-info.js'

export async function encodeWAMessage(
    message: Parameters<typeof proto.Message.encode>[0]
): Promise<Uint8Array> {
    return writeRandomPadMax16(proto.Message.encode(message).finish())
}

function encodeSignedDeviceIdentity(
    account: Parameters<typeof proto.ADVSignedDeviceIdentity.encode>[0]
): Uint8Array {
    return proto.ADVSignedDeviceIdentity.encode(account).finish()
}

export function generateCallId(): string {
    const bytes = new Uint8Array(16)
    for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256)
    }

    return bytesToHex(bytes).toUpperCase()
}

export function generateCallStanzaId(): string {
    return bytesToHex(randomBytes(16)).toUpperCase()
}

export function extractNodeInfo(node: BinaryNode): NodeInfo | null {
    const innerNode = getFirstNodeChild(node)
    if (!innerNode) {
        return null
    }

    return {
        tag: innerNode.tag,
        peerJid: node.attrs.from,
        callId: innerNode.attrs?.['call-id'] || '',
        peerPlatform: node.attrs.platform || '',
        peerAppVersion: node.attrs.version || '',
        epochId: innerNode.attrs?.e,
        timestamp: innerNode.attrs?.t,
        innerNode
    }
}

/**
 * `joinable` of an `<offer>`: whether others may still join. Independent of `group-jid`, since
 * an ad-hoc multi-party call is joinable with no group; absent means not joinable.
 */
export function parseJoinableAttr(innerNode: BinaryNode): boolean {
    const raw = innerNode.attrs?.joinable
    return raw === '1' || raw === 'true'
}

/** `group-jid` of an `<offer>`, in either spelling, or `null` on a call that is no group's. */
export function parseGroupJidAttr(innerNode: BinaryNode): string | null {
    const raw = innerNode.attrs?.['group-jid'] ?? innerNode.attrs?.group_jid
    return raw ? raw : null
}

/** `re-ring='1'` of an `<offer>`: a call already going rings this side again, with no `<relay>`. */
export function parseReRingAttr(innerNode: BinaryNode): boolean {
    return innerNode.attrs?.['re-ring'] === '1'
}

/** The `<av_upgrade>` of a `<group_update>`. */
export interface GroupAvUpgrade {
    /**
     * `av-upgrader`, in `normalizeDeviceJid` form: the device that turned the call into a video
     * call. `null` when absent: the node then only says whether the call can be upgraded.
     */
    readonly upgraderJid: string | null
    /** `av-upgradable='1'`, sent to a member joining the call. */
    readonly upgradable: boolean
}

/** Reads the `<av_upgrade>` of a `<group_update>`; an upgrade happened only with `upgraderJid`. */
export function parseGroupAvUpgrade(groupUpdate: BinaryNode): GroupAvUpgrade | null {
    const node = findNodeChild(groupUpdate, 'av_upgrade')
    if (!node) return null

    const raw = node.attrs?.['av-upgrader']
    return {
        upgraderJid: raw ? normalizedOrRaw(raw) : null,
        upgradable: node.attrs?.['av-upgradable'] === '1'
    }
}

function normalizedOrRaw(jid: string): string {
    try {
        return normalizeDeviceJid(jid)
    } catch {
        return jid
    }
}

/**
 * `state` of a `<video>` message. The number on the wire **is** this ordinal - no
 * separate wire enum, no translation table.
 *
 * Two disjoint families share the tag, because two senders emit it: one announces the
 * video of a call that already has it, the other negotiates the upgrade. That is why a
 * capture of a camera turning on emits `6` then `4` without contradicting itself - `6` is
 * `Stopped`, never "enabled".
 */
export const WA_VIDEO_STATE = Object.freeze({
    Disabled: 0,
    Enabled: 1,
    Paused: 2,
    /** Upgrade request of a **group** call; 1:1 uses {@link UpgradeRequestV2}. */
    UpgradeRequest: 3,
    /** The upgrade is on: the sender is about to put video on the wire. */
    UpgradeAccept: 4,
    /** The peer refused the upgrade; distinct from either side timing out. */
    UpgradeReject: 5,
    Stopped: 6,
    /** The *receiver* of a request never answered it and gave up waiting. */
    UpgradeRejectByTimeout: 7,
    /** The *requester* withdrew its request before it was answered. */
    UpgradeCancel: 8,
    /** The *requester* withdrew its request because its own timer expired. */
    UpgradeCancelByTimeout: 9,
    UnknownPeer: 10,
    /** Upgrade request of a 1:1 call. */
    UpgradeRequestV2: 11,
    Xr2dCodecAvatarEnabled: 12,
    Error: 20
} as const)

/**
 * How long a sent upgrade request waits before the requester gives up. Same value as the
 * peer's own guard timer, so neither side believes in an upgrade the other dropped.
 */
export const WA_VIDEO_UPGRADE_TIMEOUT_MS = 5_000

/**
 * How an upgrade request this side sent ended. `TimedOut` is the odd one out: this side
 * gave up with nothing coming back, so unlike the others it says nothing about whether
 * the peer ever saw the request.
 */
export const WA_VIDEO_UPGRADE_RESULT = Object.freeze({
    /** The peer answered `UpgradeAccept`; video may now be sent. */
    Accepted: 'accepted',
    /** The peer answered `UpgradeReject`: it declined. */
    Rejected: 'rejected',
    /** The peer answered `UpgradeRejectByTimeout`: nobody there answered it. */
    RejectedByTimeout: 'rejected_by_timeout',
    /** The peer answered `Error`: it agreed to upgrade and could not. */
    Failed: 'error',
    /** Nothing came back before the guard timer expired. */
    TimedOut: 'timeout',
    /** This side withdrew the request before it was answered. */
    Cancelled: 'cancelled'
} as const)

/** One of the values of {@link WA_VIDEO_UPGRADE_RESULT}. */
export type WaVideoUpgradeResult =
    (typeof WA_VIDEO_UPGRADE_RESULT)[keyof typeof WA_VIDEO_UPGRADE_RESULT]

/**
 * The `dec` this package announces: H.264 only, which is what every current client
 * decodes. The `enc_supported` bitmask carries the same fact as an integer and is
 * deliberately not sent - the string is what a capture of the official client shows.
 */
export const WA_VIDEO_DECODE_CAPABILITY = 'H264'

/** Attributes of a `<video>` this side sends. */
export interface VideoStateStanzaOptions {
    /** One of {@link WA_VIDEO_STATE}, written to the wire as it is. */
    readonly state: number
    /** Our own counter over the video states we have sent, starting at 1. */
    readonly transactionId: number
    /** `dec`; defaults to {@link WA_VIDEO_DECODE_CAPABILITY}. */
    readonly decoderCodec?: string
    /** `device_orientation`, 0 to 3; defaults to 0, upright. */
    readonly deviceOrientation?: number
}

/**
 * The `voip_settings` profile a request to upgrade to video names. It rides the two
 * request states and nothing else. Not cosmetic: the server reads it and attaches the
 * matching profile, and a real peer answers an upgrade without parameters with `Error`.
 */
const WA_VIDEO_UPGRADE_SETTINGS_PROFILE = 'video'

/**
 * Builds the `<call><video>` that announces a video state of our own, covering both
 * halves of the audio-to-video upgrade. `dec` rides on every message, not only the one
 * that concludes it: the peer's parser rejects a `<video>` carrying neither `enc` nor
 * `dec`. On a group call it goes to `<call-id>@call`, where `UpgradeRequest` upgrades the call.
 */
export function buildVideoStateStanza(
    peerDeviceJid: string,
    callId: string,
    callCreator: string,
    options: VideoStateStanzaOptions
): BinaryNode {
    return {
        tag: 'call',
        attrs: { to: peerDeviceJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'video',
                attrs: {
                    'call-id': callId,
                    'call-creator': callCreator,
                    state: String(options.state),
                    device_orientation: String(options.deviceOrientation ?? 0),
                    dec: options.decoderCodec ?? WA_VIDEO_DECODE_CAPABILITY,
                    'transaction-id': String(options.transactionId),
                    ...(options.state === WA_VIDEO_STATE.UpgradeRequestV2 ||
                    options.state === WA_VIDEO_STATE.UpgradeRequest
                        ? { voip_settings: WA_VIDEO_UPGRADE_SETTINGS_PROFILE }
                        : {})
                }
            }
        ]
    }
}

/**
 * Reads the `<video>` the peer sends when its video state changes mid-call, which is also
 * how an audio call is upgraded: there is no separate upgrade stanza. Numbers are passed
 * through raw, see {@link PeerVideoStateChange}. Returns `null` when `state` is missing
 * or unreadable - without it there is no transition to report.
 */
export function parseVideoStateNode(innerNode: BinaryNode): PeerVideoStateChange | null {
    const state = tryAsNumber(innerNode.attrs?.state)
    if (state === null) {
        return null
    }

    return {
        state,
        transactionId: tryAsNumber(innerNode.attrs?.['transaction-id']),
        deviceOrientation: tryAsNumber(innerNode.attrs?.device_orientation),
        decoderCodec: innerNode.attrs?.dec || null,
        encoderCodec: innerNode.attrs?.enc || null,
        supportedCodecs: tryAsNumber(innerNode.attrs?.enc_supported)
    }
}

function toRelayEndpoint(node: BinaryNode): RelayEndpoint | null {
    const relay: RelayEndpoint = {
        ip: node.attrs?.ip || '',
        port: parseInt(node.attrs?.port || '3480', 10),
        token: node.attrs?.token || '',
        key: node.attrs?.['relay-key'] || node.attrs?.key || '',
        relayId: parseInt(node.attrs?.['relay-id'] || '0', 10),
        c2rRtt: node.attrs?.['c2r-rtt'] ? parseInt(node.attrs['c2r-rtt'], 10) : undefined
    }

    return relay.ip && relay.token ? relay : null
}

export function extractRelayEndpoints(node: BinaryNode): RelayEndpoint[] {
    const relayNodes = [...getNodeChildrenByTag(node, 'relay')]
    for (const wrapper of getNodeChildrenByTag(node, 'relays')) {
        relayNodes.push(...getNodeChildrenByTag(wrapper, 'relay'))
    }

    const relays: RelayEndpoint[] = []
    for (const relayNode of relayNodes) {
        const relay = toRelayEndpoint(relayNode)
        if (relay) {
            relays.push(relay)
        }
    }

    relays.sort((a, b) => (a.c2rRtt ?? Infinity) - (b.c2rRtt ?? Infinity))

    return relays
}

export async function decryptCallKey(
    deps: WaVoipDeps,
    node: BinaryNode,
    peerJid: string,
    logger?: Logger
): Promise<Uint8Array | undefined> {
    const log = logger ?? createNoopLogger()

    const isEnc = (child: BinaryNode): boolean => child.tag === 'enc' && !!child.attrs?.type
    const encNodes = getNodeChildren(node).filter(isEnc)

    const destinationNode = findNodeChild(node, 'destination')
    if (destinationNode) {
        for (const toNode of getNodeChildren(destinationNode)) {
            if (toNode.tag === 'to') {
                encNodes.push(...getNodeChildren(toNode).filter(isEnc))
            }
        }
    }

    const address = parseSignalAddressFromJid(peerJid)
    for (const encNode of encNodes) {
        if (!(encNode.content instanceof Uint8Array)) {
            continue
        }
        try {
            const decrypted = await deps.signalProtocol.decryptMessage(address, {
                type: encNode.attrs.type as 'msg' | 'pkmsg',
                ciphertext: encNode.content
            })
            const message = proto.Message.decode(unpadPkcs7(decrypted))
            const callKey = message.call?.callKey
            if (callKey && callKey.length === 32) {
                return callKey
            }
        } catch (err) {
            log.trace('call key decrypt candidate failed', { message: toError(err).message })
        }
    }

    return undefined
}

/**
 * Version, mask length, then a 40-bit mask read LSB-first. Neither blob sets bit 36
 * (`enable_mlow_red`, `0x10` of the last byte) nor 38 (`enable_mlow_separate_pt_tx`, `0x40`): a peer
 * that sees them may send RED this side cannot fully unwrap, in-band or on its own payload type.
 */
const CAPABILITY_OFFER_BASE = new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe4, 0xbb, 0x07])
const CAPABILITY_VIDEO_OFFER_BASE = new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe0, 0xfa, 0x03])
const CAPABILITY_PREACCEPT_BASE = new Uint8Array([0x01, 0x05, 0xff, 0x09, 0xe4, 0xbb, 0x07])

/** `enable_mlow_red`, the capability index the in-band RED trial announces. */
const MLOW_RED_CAPABILITY_INDEX = 36
/** Live trial of in-band RED only: announces bit 36 in the offer, preaccept and accept. Off. */
const ANNOUNCE_MLOW_RED = false as boolean

/** `blob` with bit 36 set on a copy when `announce` is on, `blob` itself otherwise. */
export function withMlowRedCapability(blob: Uint8Array, announce: boolean): Uint8Array {
    if (!announce) return blob
    const announced = blob.slice()
    announced[2 + (MLOW_RED_CAPABILITY_INDEX >> 3)] |= 1 << (MLOW_RED_CAPABILITY_INDEX & 7)
    return announced
}

const CAPABILITY_OFFER = withMlowRedCapability(CAPABILITY_OFFER_BASE, ANNOUNCE_MLOW_RED)
const CAPABILITY_VIDEO_OFFER = withMlowRedCapability(CAPABILITY_VIDEO_OFFER_BASE, ANNOUNCE_MLOW_RED)
const CAPABILITY_PREACCEPT = withMlowRedCapability(CAPABILITY_PREACCEPT_BASE, ANNOUNCE_MLOW_RED)

/**
 * Codec identifiers for the `<video enc dec>` attrs shared by the offer and
 * the accept. `VIDEO_ENC_H264` is the codec we encode for uplink; current
 * mobile clients uplink H.264, so answering with anything else keeps
 * signalling alive but yields no video RTP.
 *
 * `VIDEO_DEC_H264` is the codec we decode for downlink. The `dec` attribute
 * is how a peer picks what to encode for us, so both sides that emit a
 * `<video>` node must advertise it consistently.
 */
const VIDEO_ENC_H264 = 'h.264'
const VIDEO_DEC_H264 = 'H264'

export interface CallParticipantNodes {
    nodes: BinaryNode[]
    shouldIncludeDeviceIdentity: boolean
}

interface EncryptedCallKeyNodes {
    /** One `<enc>` per device, in the order the devices came in. */
    readonly encNodes: readonly BinaryNode[]
    readonly shouldIncludeDeviceIdentity: boolean
}

/**
 * Encrypts a call key for each device under `<enc v='2' type count='0'>`: a 1:1 offer wraps
 * each in a `<to>`, an `<enc_rekey>` carries one directly.
 *
 * @throws for the whole batch when a device has no Signal session.
 */
async function encryptCallKeyForDevices(
    deps: WaVoipDeps,
    devices: readonly string[],
    callKey: Uint8Array
): Promise<EncryptedCallKeyNodes> {
    const resolved = await deps.sessionResolver.ensureSessionsBatch(devices)

    const plaintext = await encodeWAMessage({ call: { callKey } })
    const encrypted = await deps.signalProtocol.encryptMessagesBatch(
        devices.map((jid) => ({ address: parseSignalAddressFromJid(jid), plaintext })),
        resolved.map((target) => ({ address: target.address, session: target.session }))
    )

    return {
        encNodes: encrypted.map((entry) => ({
            tag: 'enc',
            attrs: { v: '2', type: entry.type, count: '0' },
            content: entry.ciphertext
        })),
        shouldIncludeDeviceIdentity: encrypted.some((entry) => entry.type === 'pkmsg')
    }
}

export async function buildCallParticipantNodes(
    deps: WaVoipDeps,
    devices: string[],
    callKey: Uint8Array
): Promise<CallParticipantNodes> {
    const { encNodes, shouldIncludeDeviceIdentity } = await encryptCallKeyForDevices(
        deps,
        devices,
        callKey
    )

    const nodes: BinaryNode[] = devices.map((jid, index) => ({
        tag: 'to',
        attrs: { jid },
        content: [encNodes[index]]
    }))

    return { nodes, shouldIncludeDeviceIdentity }
}

/** The media an offer announces, 1:1 or group: the two opus rates, video when asked, `<net>`. */
function buildOfferMediaNodes(isVideo: boolean): BinaryNode[] {
    const nodes: BinaryNode[] = [
        { tag: 'audio', attrs: { enc: 'opus', rate: '8000' }, content: undefined },
        { tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, content: undefined }
    ]

    if (isVideo) {
        nodes.push({
            tag: 'video',
            attrs: {
                enc: VIDEO_ENC_H264,
                dec: VIDEO_DEC_H264,
                screen_width: '1920',
                screen_height: '1080',
                device_orientation: '0'
            },
            content: undefined
        })
    }

    nodes.push({ tag: 'net', attrs: { medium: '3' }, content: undefined })
    return nodes
}

export async function buildOfferStanza(
    deps: WaVoipDeps,
    stores: WaVoipStores,
    callId: string,
    callKey: Uint8Array,
    peerJid: string,
    isVideo: boolean,
    logger?: Logger
): Promise<BinaryNode> {
    const log = logger ?? createNoopLogger()
    const creds = deps.authClient.getCurrentCredentials()
    const callCreator = creds?.meLid || creds?.meJid || ''

    const synced = await deps.signalDeviceSync.syncDeviceList([peerJid])
    const devices = synced.flatMap((entry) => entry.deviceJids)

    if (devices.length === 0) {
        throw new Error(`no device sessions to encrypt the call offer for ${peerJid}`)
    }

    const { nodes: destinations, shouldIncludeDeviceIdentity } = await buildCallParticipantNodes(
        deps,
        devices,
        callKey
    )

    const offerContent: BinaryNode[] = []

    try {
        const peerJidNormalized = toUserJid(peerJid)
        const tcTokenRecord = await stores.privacyToken.getByJid(peerJidNormalized)
        const tctoken = tcTokenRecord?.tcToken
        if (tctoken) {
            offerContent.push({
                tag: 'privacy',
                attrs: {},
                content: tctoken instanceof Uint8Array ? tctoken : new Uint8Array(tctoken)
            })
        }
    } catch (err) {
        log.trace('tctoken lookup failed', { message: toError(err).message })
    }

    offerContent.push(...buildOfferMediaNodes(isVideo))

    offerContent.push({
        tag: 'capability',
        attrs: { ver: '1' },
        content: isVideo ? CAPABILITY_VIDEO_OFFER : CAPABILITY_OFFER
    })

    offerContent.push({ tag: 'destination', attrs: {}, content: destinations })

    offerContent.push({
        tag: 'encopt',
        attrs: { keygen: '2' },
        content: undefined
    })

    if (shouldIncludeDeviceIdentity && creds?.signedIdentity) {
        offerContent.push({
            tag: 'device-identity',
            attrs: {},
            content: encodeSignedDeviceIdentity(creds.signedIdentity)
        })
    }

    return {
        tag: 'call',
        attrs: { to: peerJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'offer',
                attrs: { 'call-id': callId, 'call-creator': callCreator },
                content: offerContent
            }
        ]
    }
}

/** The server a group call's stanzas are addressed at, as `<call-id>@call`. */
const WA_CALL_SERVER = 'call'

/** The address of a call itself: where a group offer and a group accept go. */
export function toCallServerJid(callId: string): string {
    return `${callId}@${WA_CALL_SERVER}`
}

/** The call id a `<call-id>@call` address names, or `null` for any other jid. */
export function callIdOfCallServerJid(jid: string | undefined): string | null {
    const suffix = `@${WA_CALL_SERVER}`
    if (!jid?.endsWith(suffix)) return null
    const callId = jid.slice(0, -suffix.length)
    return callId ? callId : null
}

/** A group `<offer>` and the participants it named, creator first, devices addressed. */
export interface GroupOfferStanza {
    readonly node: BinaryNode
    readonly participants: readonly WaGroupParticipant[]
}

/**
 * Resolves the devices of the participants given none, like a 1:1 callee's. One left
 * unresolved keeps an empty list and is rung on its primary device.
 */
async function resolveOfferParticipantDevices(
    deps: WaVoipDeps,
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

function buildGroupUserNode(participant: WaGroupParticipant, capability?: Uint8Array): BinaryNode {
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
 * participants in an attribute-less `<group_info>` (creator first, the only device carrying a
 * `<capability>`) and no `<destination>`, `<enc>`, `<encopt>` or `<device-identity>`: the key
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

    // Only the device placing the call: our other devices are not on it.
    const creator: WaGroupParticipant = {
        jid: toUserJid(callCreator),
        devices: normalizeParticipantDeviceJids(callCreator, [callCreator])
    }
    const listed: WaGroupParticipant[] = [creator]
    const users = [buildGroupUserNode(creator, isVideo ? CAPABILITY_VIDEO_OFFER : CAPABILITY_OFFER)]
    for (const participant of resolved) {
        const entry: WaGroupParticipant = {
            jid: toUserJid(participant.jid),
            devices: normalizeParticipantDeviceJids(participant.jid, participant.devices)
        }
        listed.push(entry)
        users.push(buildGroupUserNode(entry))
    }

    return {
        node: {
            tag: 'call',
            attrs: { to: toCallServerJid(callId), id: generateCallStanzaId() },
            content: [
                {
                    tag: 'offer',
                    attrs: {
                        'call-id': callId,
                        'call-creator': callCreator,
                        'group-jid': groupJid
                    },
                    content: [
                        ...buildOfferMediaNodes(isVideo),
                        { tag: 'group_info', attrs: {}, content: users }
                    ]
                }
            ]
        },
        participants: listed
    }
}

export interface EncRekeyStanzaParams {
    readonly callId: string
    readonly callCreator: string
    /** The `transaction-id` of the `<group_info>` that asked for this rekey. */
    readonly transactionId: number
    readonly peerDeviceJid: string
    /** The new 32-byte call key, already installed on this side. */
    readonly callKey: Uint8Array
}

/**
 * Builds the `<enc_rekey>` carrying a new call key to one device: addressed to that device,
 * `transaction-id` echoing the `<group_info>` that asked, `<encopt keygen='2'/>` then a direct
 * `<enc>`. `<device-identity>` rides along on a `pkmsg`, as on the 1:1 offer (assumed: only
 * `msg` has been seen here).
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
        content.push({
            tag: 'device-identity',
            attrs: {},
            content: encodeSignedDeviceIdentity(creds.signedIdentity)
        })
    }

    return {
        tag: 'call',
        attrs: { to: params.peerDeviceJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'enc_rekey',
                attrs: {
                    'call-id': params.callId,
                    'call-creator': params.callCreator,
                    'transaction-id': String(params.transactionId)
                },
                content
            }
        ]
    }
}

/**
 * Builds the `<call><accept>` answer to an incoming offer.
 *
 * The accept carries no `<enc>` and no `<device-identity>`. Under the offer's
 * `encopt keygen='2'` the call key travels in the offer's `<enc>`, which the
 * callee decrypts, so the accept only confirms and has no key left to ship.
 * The server runs the encrypt-and-attach path for `offer` and `enc_rekey`
 * only and silently drops an accept that carries an `<enc>` child: no ack
 * comes back, the caller never learns the call was answered and keeps ringing
 * until its 90s timeout. Nothing is missing here, do not add crypto back.
 *
 * A 1:1 accept carries no `<encopt>` either. A live call acked an accept whose
 * only children were `<audio>` and `<net>`, while the literal `encopt` is
 * absent from the WhatsApp Web bundle, which assembles this stanza inside its
 * WASM, so an accept-side `<encopt>` was never confirmed. Dropping it matches
 * that acked format. There is no evidence that an `<encopt>` child makes the
 * server discard the stanza, only that the server acks without it.
 *
 * `<audio>` and `<net>` are part of the real accept and stay.
 *
 * `peerJid` is addressed verbatim so a companion caller keeps its `:device`
 * suffix, matching the target `preaccept`, `transport` and `mute_v2` use.
 *
 * A group accept (`isGroupCall`) goes to `<call-id>@call` and carries
 * `<encopt keygen='2'/>`: addressed to the creator instead, the server never
 * marks this side connected and the rekey never reaches it. `<net medium>`
 * stays `3` on both.
 *
 * The video reply advertises H.264 because current mobile clients uplink
 * H.264: answering VP8 keeps signalling alive but yields no video RTP.
 *
 * The video node carries `dec` beside `enc`, each with the asymmetric spelling the peer
 * uses: `enc='h.264'`, `dec='H264'`. `dec` is how a peer picks what to encode for us and
 * this side is almost always the callee, so an accept without it leaves most calls
 * advertising no decoder. Our preaccept still carries no `<video>` node at all, for want
 * of a capture to copy.
 *
 * There is no call-key parameter: the decrypted offer key is not serialized
 * into this stanza, since it already reached both sides through the offer.
 */
export async function buildAcceptStanza(
    deps: WaVoipDeps,
    callId: string,
    peerJid: string,
    callCreator: string,
    isVideo: boolean,
    isGroupCall = false
): Promise<BinaryNode> {
    await deps.messageDispatch.syncSignalSession(callCreator)

    const acceptContent: BinaryNode[] = [
        { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
        { tag: 'net', attrs: { medium: '3' } }
    ]

    if (isVideo) {
        acceptContent.push({ tag: 'video', attrs: { enc: VIDEO_ENC_H264, dec: VIDEO_DEC_H264 } })
    }
    if (isGroupCall) {
        acceptContent.push({ tag: 'encopt', attrs: { keygen: '2' } })
    }
    if (ANNOUNCE_MLOW_RED) {
        const capability = isVideo ? CAPABILITY_VIDEO_OFFER : CAPABILITY_PREACCEPT
        acceptContent.push({ tag: 'capability', attrs: { ver: '1' }, content: capability })
    }

    return {
        tag: 'call',
        attrs: { to: isGroupCall ? toCallServerJid(callId) : peerJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'accept',
                attrs: { 'call-id': callId, 'call-creator': callCreator },
                content: acceptContent
            }
        ]
    }
}

export function buildTerminateStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    audioDurationMs?: number,
    reason?: string
): BinaryNode {
    const attrs: Record<string, string> = {
        'call-id': callId,
        'call-creator': callCreator
    }
    if (audioDurationMs !== undefined && audioDurationMs >= 0) {
        const ms = String(Math.floor(audioDurationMs))
        attrs.duration = ms
        attrs.audio_duration = ms
    }
    if (reason !== undefined) {
        attrs.reason = reason
    }

    return {
        tag: 'call',
        attrs: { to: peerJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'terminate',
                attrs,
                content: undefined
            }
        ]
    }
}

/**
 * The reject goes to the device that sent the offer, as the accept and the
 * terminate do. Addressed to the bare user instead, the server acknowledges it
 * and never delivers it to a companion caller, which keeps ringing; a phone,
 * device 0, is the same jid either way.
 *
 * A group reject (`isGroupCall`) goes to `<call-id>@call` with `count='0'`: sent to
 * the creator instead, the others keep listing this side as ringing.
 */
export function buildRejectStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    isGroupCall = false
): BinaryNode {
    const attrs: Record<string, string> = { 'call-id': callId, 'call-creator': callCreator }
    if (isGroupCall) attrs.count = '0'

    return {
        tag: 'call',
        attrs: { to: isGroupCall ? toCallServerJid(callId) : peerJid, id: generateCallStanzaId() },
        content: [{ tag: 'reject', attrs }]
    }
}

/** A group preaccept (`isGroupCall`) carries the same children, addressed to `<call-id>@call`. */
export function buildPreacceptStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    isGroupCall = false
): BinaryNode {
    return {
        tag: 'call',
        attrs: { to: isGroupCall ? toCallServerJid(callId) : peerJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'preaccept',
                attrs: { 'call-id': callId, 'call-creator': callCreator },
                content: [
                    { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
                    { tag: 'encopt', attrs: { keygen: '2' } },
                    { tag: 'capability', attrs: { ver: '1' }, content: CAPABILITY_PREACCEPT }
                ]
            }
        ]
    }
}

export function buildRelayLatencyStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    relays: Array<{
        relayName: string
        latency: number
        addressBytes?: Uint8Array
    }>,
    destinationJids: string[],
    meId: string
): BinaryNode {
    const seenRelays = new Set<string>()
    const teNodes: BinaryNode[] = []
    for (const relay of relays) {
        if (!relay.relayName || seenRelays.has(relay.relayName)) continue
        seenRelays.add(relay.relayName)
        const encodedLatency = 0x2000000 + (relay.latency || 0)
        teNodes.push({
            tag: 'te',
            attrs: {
                latency: String(encodedLatency),
                relay_name: relay.relayName
            },
            content: relay.addressBytes || undefined
        })
    }

    const destinationContent: BinaryNode[] = destinationJids.map((jid) => ({
        tag: 'to',
        attrs: { jid },
        content: undefined
    }))

    const relayLatencyContent: BinaryNode[] = [...teNodes]
    if (destinationContent.length > 0) {
        relayLatencyContent.push({
            tag: 'destination',
            attrs: {},
            content: destinationContent
        })
    }

    const toJidClean = toUserJid(peerJid)
    return {
        tag: 'call',
        attrs: { to: toJidClean, id: generateCallStanzaId() },
        content: [
            {
                tag: 'relaylatency',
                attrs: { 'call-id': callId, 'call-creator': callCreator },
                content: relayLatencyContent
            }
        ]
    }
}

export function buildTransportStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    meId: string,
    messageType = '0',
    p2pCandRound = '0'
): BinaryNode {
    return {
        tag: 'call',
        attrs: { to: peerJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'transport',
                attrs: {
                    'call-id': callId,
                    'call-creator': callCreator,
                    'transport-message-type': messageType,
                    'p2p-cand-round': p2pCandRound
                },
                content: [
                    {
                        tag: 'net',
                        attrs: { medium: '2', protocol: '0' },
                        content: undefined
                    }
                ]
            }
        ]
    }
}

/**
 * Builds the `<call><mute_v2>` that announces our own microphone state: `mute-state` on
 * `mute_v2` itself, no child node. A statement, not a request - nothing comes back. Asking
 * another participant to mute is {@link buildMuteRequestStanza}.
 */
export function buildMuteV2Stanza(
    peerDeviceJid: string,
    callId: string,
    callCreator: string,
    muted: boolean
): BinaryNode {
    return {
        tag: 'call',
        attrs: { to: peerDeviceJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'mute_v2',
                attrs: {
                    'call-id': callId,
                    'call-creator': callCreator,
                    'mute-state': muted ? '1' : '0'
                }
            }
        ]
    }
}

/**
 * Builds the `<call><heartbeat>` every connected member of a group call sends the call itself,
 * every 10 s, whether it answered, placed or joined the call.
 */
export function buildHeartbeatStanza(callId: string, callCreator: string): BinaryNode {
    return {
        tag: 'call',
        attrs: { to: toCallServerJid(callId), id: generateCallStanzaId() },
        content: [{ tag: 'heartbeat', attrs: { 'call-id': callId, 'call-creator': callCreator } }]
    }
}

/** The `state` a `<peer_state>` reports for a peer; only `Invisible` has been seen on the wire. */
export const WA_PEER_STATE = Object.freeze({ Invisible: 'invisible', Visible: 'visible' } as const)

/** One of the values of {@link WA_PEER_STATE}. */
export type WaPeerState = (typeof WA_PEER_STATE)[keyof typeof WA_PEER_STATE]

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
    return {
        tag: 'call',
        attrs: { to: toCallServerJid(callId), id: generateCallStanzaId() },
        content: [
            {
                tag: 'peer_state',
                attrs: {
                    'call-id': callId,
                    'call-creator': callCreator,
                    t: String(Math.floor(nowMs))
                },
                content: [{ tag: 'user', attrs: { state, jid: toUserJid(peerAccountJid) } }]
            }
        ]
    }
}

/** `request-state` of a `<mute_v2>` asking its target to mute; the only value seen on the wire. */
export const WA_MUTE_REQUEST_STATE = Object.freeze({ Mute: '1' } as const)

/**
 * Builds the `<call><mute_v2>` that asks one participant of a group call to mute: addressed to
 * its device, `request-state` and no `mute-state`. The target decides, and announces its own
 * `mute-state` if it complies.
 */
export function buildMuteRequestStanza(
    targetDeviceJid: string,
    callId: string,
    callCreator: string,
    requestState: string = WA_MUTE_REQUEST_STATE.Mute
): BinaryNode {
    return {
        tag: 'call',
        attrs: { to: targetDeviceJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'mute_v2',
                attrs: {
                    'call-id': callId,
                    'call-creator': callCreator,
                    'request-state': requestState
                }
            }
        ]
    }
}

export interface MuteV2Payload {
    /**
     * Microphone state the sender announced through `mute-state`. `null` when absent or
     * unrecognized, so an unknown state is never guessed into a boolean.
     */
    readonly muted: boolean | null
    /** `true` when the stanza carries `request-state`: a request, not an announcement. */
    readonly isRequest: boolean
    /** `request-state` as it arrived, `null` when absent. */
    readonly requestState: string | null
}

/** Reads the state carried by an inbound `<mute_v2>` node. */
export function parseMuteV2(inner: BinaryNode): MuteV2Payload {
    const rawMuteState = inner.attrs?.['mute-state']

    let muted: boolean | null = null
    if (rawMuteState === '1') {
        muted = true
    } else if (rawMuteState === '0') {
        muted = false
    }

    const requestState = inner.attrs?.['request-state'] ?? null
    return { muted, isRequest: requestState !== null, requestState }
}

/**
 * Wire name of the raise-hand action, in three places at once: the envelope's `action`
 * attribute, the tag of the state element inside it, and the tag of the stanza that
 * carries the same state on its own. The integer action code never reaches the wire.
 */
const RAISE_HAND_ACTION = 'raise_hand'

/**
 * Attribute carrying the state in both wire shapes, always hyphenated. The underscore
 * spelling `raise_hand_state` names log lines and events only, never an attribute.
 */
const RAISE_HAND_STATE_ATTR = 'raise-hand-state'

/**
 * Builds the `<call><user_action>` that announces the local raise-hand state: durable
 * per-participant state, which is why it travels over signalling rather than the media
 * path the reactions take.
 *
 * Every part is measured - the envelope rather than the bare stanza, `action` as the
 * string `raise_hand`, the hyphen in `raise-hand-state`, and `'0'` spelled out on
 * lowering rather than the attribute going away. `broadcast` is off by default: captures
 * of a live 1:1 raise hand carry it nowhere and the predicate that sets it is unknown.
 */
export function buildRaiseHandStanza(
    peerDeviceJid: string,
    callId: string,
    callCreator: string,
    raised: boolean,
    broadcast = false
): BinaryNode {
    const attrs: Record<string, string> = {
        'call-id': callId,
        'call-creator': callCreator,
        action: RAISE_HAND_ACTION
    }
    if (broadcast) {
        attrs.broadcast = '1'
    }

    return {
        tag: 'call',
        attrs: { to: peerDeviceJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'user_action',
                attrs,
                content: [
                    {
                        tag: RAISE_HAND_ACTION,
                        attrs: { [RAISE_HAND_STATE_ATTR]: raised ? '1' : '0' }
                    }
                ]
            }
        ]
    }
}

/**
 * Reads the raise-hand state an incoming stanza carries, or `null` when there is none.
 *
 * Both wire shapes are accepted, because the sender chooses between them with a gate this
 * side cannot see and both are live traffic: the `<user_action>` envelope, and a
 * top-level `<raise_hand>` that is a message type of its own, acked under its own tag.
 *
 * A `<user_action>` naming another action has no `<raise_hand>` child and so reads as
 * absent; anything other than `0` and `1` counts as absent too, never as a guess.
 */
export function parseRaiseHandState(node: BinaryNode): boolean | null {
    const stateNode = node.tag === RAISE_HAND_ACTION ? node : findNodeChild(node, RAISE_HAND_ACTION)
    const raw = stateNode?.attrs?.[RAISE_HAND_STATE_ATTR]

    if (raw === '1') return true
    if (raw === '0') return false

    return null
}

export function buildAcceptReceiptStanza(
    peerDeviceJid: string,
    acceptMsgId: string,
    callId: string,
    callCreator: string,
    ourJid: string
): BinaryNode {
    return buildReceiptNode({
        kind: 'custom',
        attrs: { to: peerDeviceJid, id: acceptMsgId, from: ourJid },
        content: [{ tag: 'accept', attrs: { 'call-id': callId, 'call-creator': callCreator } }]
    })
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

export const ENCRYPTED_TAGS = ['preaccept', 'accept'] as const

export function needsDecryption(tag: string): boolean {
    return ENCRYPTED_TAGS.includes(tag as any)
}
