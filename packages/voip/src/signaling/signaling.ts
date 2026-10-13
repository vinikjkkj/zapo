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

import type { WaCallGroupParticipant } from '../call/group-participants.js'
import { groupParticipantAccountKey } from '../jid.js'
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

/** 16 random bytes as 32 uppercase hex characters. */
export function generateCallStanzaId(): string {
    return bytesToHex(randomBytes(16)).toUpperCase()
}

/** A new call id, in the stanza id format. */
export function generateCallId(): string {
    return generateCallStanzaId()
}

/** A `<call>` to `to` whose one child names the call: `call-id`, `call-creator`, then `attrs` in order. */
export function callStanza(
    to: string,
    tag: string,
    callId: string,
    callCreator: string,
    attrs?: Readonly<Record<string, string>>,
    content?: BinaryNode[]
): BinaryNode {
    const childAttrs = { 'call-id': callId, 'call-creator': callCreator, ...attrs }
    return {
        tag: 'call',
        attrs: { to, id: generateCallStanzaId() },
        content: [content ? { tag, attrs: childAttrs, content } : { tag, attrs: childAttrs }]
    }
}

/** Where a call answer goes: `<call-id>@call` on a group call, the peer device verbatim on 1:1. */
function callTarget(peerJid: string, callId: string, isGroupCall: boolean): string {
    return isGroupCall ? toCallServerJid(callId) : peerJid
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
        innerNode
    }
}

/** `joinable` of an `<offer>`: whether others may still join. Says nothing about group-ness. */
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

/**
 * `state` of a `<video>` message, written to the wire as this ordinal. Two families share it:
 * announcing the video of a call that has it, and negotiating the upgrade (`6` is `Stopped`).
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

/** `<video enc>` we uplink and `<video dec>` we decode, in the asymmetric spelling the peer uses. */
const VIDEO_ENC_H264 = 'h.264'
const VIDEO_DEC_H264 = 'H264'

/** Attributes of a `<video>` this side sends. */
interface VideoStateStanzaOptions {
    /** One of {@link WA_VIDEO_STATE}, written to the wire as it is. */
    readonly state: number
    /** Our own counter over the video states we have sent, starting at 1. */
    readonly transactionId: number
    /** `dec`; defaults to H.264. */
    readonly decoderCodec?: string
    /** `device_orientation`, 0 to 3; defaults to 0, upright. */
    readonly deviceOrientation?: number
}

/** `voip_settings` profile on the two upgrade-request states; without it the peer answers `Error`. */
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
    const attrs: Record<string, string> = {
        state: String(options.state),
        device_orientation: String(options.deviceOrientation ?? 0),
        dec: options.decoderCodec ?? VIDEO_DEC_H264,
        'transaction-id': String(options.transactionId)
    }
    if (
        options.state === WA_VIDEO_STATE.UpgradeRequestV2 ||
        options.state === WA_VIDEO_STATE.UpgradeRequest
    ) {
        attrs.voip_settings = WA_VIDEO_UPGRADE_SETTINGS_PROFILE
    }

    return callStanza(peerDeviceJid, 'video', callId, callCreator, attrs)
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
const CAPABILITY_OFFER = new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe4, 0xbb, 0x07])
const CAPABILITY_VIDEO_OFFER = new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe0, 0xfa, 0x03])
const CAPABILITY_PREACCEPT = new Uint8Array([0x01, 0x05, 0xff, 0x09, 0xe4, 0xbb, 0x07])

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

/** `<device-identity>` of our account, sent beside a `pkmsg` key. */
function deviceIdentityNode(
    signedIdentity: Parameters<typeof proto.ADVSignedDeviceIdentity.encode>[0]
): BinaryNode {
    return {
        tag: 'device-identity',
        attrs: {},
        content: encodeSignedDeviceIdentity(signedIdentity)
    }
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

    const { encNodes, shouldIncludeDeviceIdentity } = await encryptCallKeyForDevices(
        deps,
        devices,
        callKey
    )
    const destinations: BinaryNode[] = devices.map((jid, index) => ({
        tag: 'to',
        attrs: { jid },
        content: [encNodes[index]]
    }))

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
        offerContent.push(deviceIdentityNode(creds.signedIdentity))
    }

    return callStanza(peerJid, 'offer', callId, callCreator, undefined, offerContent)
}

/** The server a group call's stanzas are addressed at, as `<call-id>@call`. */
const WA_CALL_SERVER = 'call'

/** The address of a call itself: where a group offer and a group accept go. */
export function toCallServerJid(callId: string): string {
    return `${callId}@${WA_CALL_SERVER}`
}

const CALL_SERVER_SUFFIX = `@${WA_CALL_SERVER}`

/** The call id a `<call-id>@call` address names, or `null` for any other jid. */
export function callIdOfCallServerJid(jid: string | undefined): string | null {
    if (!jid?.endsWith(CALL_SERVER_SUFFIX)) return null
    const callId = jid.slice(0, -CALL_SERVER_SUFFIX.length)
    return callId ? callId : null
}

/** A group `<offer>` and the participants it named, creator first, devices addressed. */
interface GroupOfferStanza {
    readonly node: BinaryNode
    readonly participants: readonly WaCallGroupParticipant[]
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
 * Builds the `<call><accept>`: no `<enc>` or `<device-identity>` (the server drops an accept
 * carrying `<enc>`), `<encopt>` only on a group accept, which goes to `<call-id>@call`; a 1:1
 * accept goes to the caller device verbatim. Video answers `enc='h.264' dec='H264'`.
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

    return callStanza(
        callTarget(peerJid, callId, isGroupCall),
        'accept',
        callId,
        callCreator,
        undefined,
        acceptContent
    )
}

export function buildTerminateStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    audioDurationMs?: number,
    reason?: string
): BinaryNode {
    const attrs: Record<string, string> = {}
    if (audioDurationMs !== undefined && audioDurationMs >= 0) {
        const ms = String(Math.floor(audioDurationMs))
        attrs.duration = ms
        attrs.audio_duration = ms
    }
    if (reason !== undefined) {
        attrs.reason = reason
    }

    return callStanza(peerJid, 'terminate', callId, callCreator, attrs)
}

/**
 * The reject goes to the device that sent the offer (a bare user never reaches a companion), or
 * to `<call-id>@call` with `count='0'` on a group call, so the others stop listing us as ringing.
 */
export function buildRejectStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    isGroupCall = false
): BinaryNode {
    return callStanza(
        callTarget(peerJid, callId, isGroupCall),
        'reject',
        callId,
        callCreator,
        isGroupCall ? { count: '0' } : undefined
    )
}

/** A group preaccept (`isGroupCall`) carries the same children, addressed to `<call-id>@call`. */
export function buildPreacceptStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    isGroupCall = false
): BinaryNode {
    return callStanza(
        callTarget(peerJid, callId, isGroupCall),
        'preaccept',
        callId,
        callCreator,
        undefined,
        [
            { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
            { tag: 'encopt', attrs: { keygen: '2' } },
            { tag: 'capability', attrs: { ver: '1' }, content: CAPABILITY_PREACCEPT }
        ]
    )
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
    destinationJids: string[]
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

    if (destinationJids.length > 0) {
        teNodes.push({
            tag: 'destination',
            attrs: {},
            content: destinationJids.map((jid) => ({ tag: 'to', attrs: { jid } }))
        })
    }

    return callStanza(toUserJid(peerJid), 'relaylatency', callId, callCreator, undefined, teNodes)
}

export function buildTransportStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    messageType = '0',
    p2pCandRound = '0'
): BinaryNode {
    return callStanza(
        peerJid,
        'transport',
        callId,
        callCreator,
        { 'transport-message-type': messageType, 'p2p-cand-round': p2pCandRound },
        [{ tag: 'net', attrs: { medium: '2', protocol: '0' } }]
    )
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
    return callStanza(peerDeviceJid, 'mute_v2', callId, callCreator, {
        'mute-state': muted ? '1' : '0'
    })
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
    return callStanza(targetDeviceJid, 'mute_v2', callId, callCreator, {
        'request-state': requestState
    })
}

interface MuteV2Payload {
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

/** `action` of the `<user_action>`, tag of its state child, and tag of the standalone stanza. */
const RAISE_HAND_ACTION = 'raise_hand'

/** The state attribute in both shapes, always hyphenated. */
const RAISE_HAND_STATE_ATTR = 'raise-hand-state'

/**
 * Builds the `<call><user_action>` announcing the local raise-hand state; lowering writes `'0'`
 * rather than dropping the attribute. `broadcast` is off unless asked for.
 */
export function buildRaiseHandStanza(
    peerDeviceJid: string,
    callId: string,
    callCreator: string,
    raised: boolean,
    broadcast = false
): BinaryNode {
    const attrs: Record<string, string> = { action: RAISE_HAND_ACTION }
    if (broadcast) {
        attrs.broadcast = '1'
    }

    return callStanza(peerDeviceJid, 'user_action', callId, callCreator, attrs, [
        { tag: RAISE_HAND_ACTION, attrs: { [RAISE_HAND_STATE_ATTR]: raised ? '1' : '0' } }
    ])
}

/**
 * Reads the raise-hand state of a `<user_action>` envelope or a standalone `<raise_hand>`;
 * `null` when absent or anything other than `0`/`1`.
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

export function needsDecryption(tag: string): boolean {
    return tag === 'preaccept' || tag === 'accept'
}
