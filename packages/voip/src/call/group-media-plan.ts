import {
    dialableRelayEndpoints,
    WA_VIDEO_QUALITY,
    type WaCallMediaGroup,
    type WaCallMediaSender,
    type WaCallMediaStreamLayer,
    type WaCallMediaVideoSubscription
} from '@zapo-js/voip-media'

import { derivePerJidSrtpKey } from '../crypto/encryption.js'
import { generateSecureSsrc, WA_SSRC_SLOT } from '../crypto/ssrc.js'
import type { RelayEndpoint } from '../types.js'

import {
    groupParticipantAccountKey,
    isGroupParticipantLeaving,
    type WaGroupComposition
} from './group-participants.js'

/** Stream layers of the relay declaration; not the SSRC slots, which disagree on every value. */
const WA_STREAM_LAYER = Object.freeze({
    Audio: 0,
    VideoMain: 1,
    VideoSecondary: 2,
    AppData: 5
} as const)

/** One stream's slots in declaration order: media, FEC, out-of-band NACK. */
const AUDIO_STREAM_SLOTS: readonly number[] = [
    WA_SSRC_SLOT.AUDIO.MAIN,
    WA_SSRC_SLOT.AUDIO.FEC,
    WA_SSRC_SLOT.AUDIO.OOB_NACK
]
const VIDEO_STREAM_SLOTS: readonly number[] = [
    WA_SSRC_SLOT.VIDEO.MAIN,
    WA_SSRC_SLOT.VIDEO.FEC,
    WA_SSRC_SLOT.VIDEO.OOB_NACK
]

/** The suffix a device's secondary video stream derives from: stream index 1. */
const SECONDARY_STREAM_SUFFIX = '_1'

/** Where a relay leg is dialled: the address alone, since a reissue re-mints the token. */
export function relayEndpointKey(endpoint: Pick<RelayEndpoint, 'ip' | 'port'>): string {
    return `${endpoint.ip}|${endpoint.port}`
}

/** Whether two endpoint sets name the same addresses, order aside. */
export function sameRelayEndpointSet(
    current: readonly Pick<RelayEndpoint, 'ip' | 'port'>[],
    next: readonly Pick<RelayEndpoint, 'ip' | 'port'>[]
): boolean {
    const held = new Set(current.map(relayEndpointKey))
    const wanted = new Set(next.map(relayEndpointKey))
    if (held.size !== wanted.size) return false
    for (const key of wanted) {
        if (!held.has(key)) return false
    }
    return true
}

/** What a leg registers with: its address and the token, auth token and key its descriptor names. */
function relayCredentialKey(
    endpoint: Pick<RelayEndpoint, 'ip' | 'port' | 'token' | 'authToken' | 'key'>
): string {
    return `${relayEndpointKey(endpoint)}|${endpoint.token}|${endpoint.authToken ?? ''}|${endpoint.key}`
}

/** Whether two endpoint sets register the same way: same addresses under the same credentials. */
export function sameRelayCredentials(
    current: readonly Pick<RelayEndpoint, 'ip' | 'port' | 'token' | 'authToken' | 'key'>[],
    next: readonly Pick<RelayEndpoint, 'ip' | 'port' | 'token' | 'authToken' | 'key'>[]
): boolean {
    const held = new Set(current.map(relayCredentialKey))
    const wanted = new Set(next.map(relayCredentialKey))
    if (held.size !== wanted.size) return false
    for (const key of wanted) {
        if (!held.has(key)) return false
    }
    return true
}

/**
 * How an adopted relay endpoint is dialled: over raw UDP when it carries no auth token, the
 * way a callee's reissue works; with one, over the ordinary 1:1 path and its ICE credential.
 */
export function adoptedRelayTransport(
    endpoint: Pick<RelayEndpoint, 'authToken'>
): 'raw-udp' | undefined {
    return endpoint.authToken ? undefined : 'raw-udp'
}

/** One relay across its endpoints: `relay-id` and name repeat on every address of a node. */
function relayIdentityOf(endpoint: RelayEndpoint): string {
    return `${endpoint.relayId}|${endpoint.relayName ?? ''}`
}

/**
 * Elects the relay with the lowest `c2r_rtt` among the dialable endpoints (ties keep the
 * first) and returns every dialable address of it; the runner-up is never dialled.
 */
export function electRelayEndpoints(endpoints: readonly RelayEndpoint[]): RelayEndpoint[] {
    const dialable = dialableRelayEndpoints(endpoints)
    if (dialable.length === 0) return []

    let elected = dialable[0]
    for (const endpoint of dialable) {
        if ((endpoint.c2rRtt ?? Infinity) < (elected.c2rRtt ?? Infinity)) elected = endpoint
    }
    const identity = relayIdentityOf(elected)
    return dialable.filter((endpoint) => relayIdentityOf(endpoint) === identity)
}

/**
 * Every dialable relay of a reissued group descriptor, elected first and the rest by `c2r_rtt`,
 * each with all its addresses: the server may move the downlink to any of them, and a relay
 * with no leg cannot deliver. The media leg is still chosen by the relay layer.
 */
export function adoptableRelayEndpoints(endpoints: readonly RelayEndpoint[]): RelayEndpoint[] {
    const elected = electRelayEndpoints(endpoints)
    if (elected.length === 0) return []

    const byRelay = new Map<string, RelayEndpoint[]>([[relayIdentityOf(elected[0]), []]])
    const sorted = dialableRelayEndpoints(endpoints).sort(
        (a, b) => (a.c2rRtt ?? Infinity) - (b.c2rRtt ?? Infinity)
    )
    for (const endpoint of sorted) {
        const identity = relayIdentityOf(endpoint)
        const relay = byRelay.get(identity)
        if (relay) relay.push(endpoint)
        else byRelay.set(identity, [endpoint])
    }
    return [...byRelay.values()].flat()
}

/** A device jid with its `:device`, bare meaning the primary. */
function toDeviceJid(jid: string): string {
    return /:\d+@/.test(jid) ? jid : jid.replace('@', ':0@')
}

/**
 * Every device sending into the call: all devices of every participant still on it, our own
 * account left out, each once. Not narrowed to `connected`, so media is ready before it flows.
 */
export function groupSenderDeviceJids(composition: WaGroupComposition, selfJid: string): string[] {
    const selfKey = selfJid ? groupParticipantAccountKey(selfJid) : null
    const devices = new Set<string>()
    for (const participant of composition.participants) {
        if (selfKey !== null && groupParticipantAccountKey(participant.jid) === selfKey) continue
        if (isGroupParticipantLeaving(participant)) continue
        for (const deviceJid of participant.devices) devices.add(toDeviceJid(deviceJid))
    }
    return [...devices]
}

function ssrcsOf(callId: string, deviceJid: string, slots: readonly number[]): number[] {
    return slots.map((slot) => generateSecureSsrc(callId, deviceJid, slot))
}

/**
 * Our streams as the relay declaration lists them: audio, video main and video secondary
 * three positions each, whether or not video is on, then app data.
 */
export function selfStreamLayers(callId: string, selfDeviceJid: string): WaCallMediaStreamLayer[] {
    return [
        { layer: WA_STREAM_LAYER.Audio, ssrcs: ssrcsOf(callId, selfDeviceJid, AUDIO_STREAM_SLOTS) },
        {
            layer: WA_STREAM_LAYER.VideoMain,
            ssrcs: ssrcsOf(callId, selfDeviceJid, VIDEO_STREAM_SLOTS)
        },
        {
            layer: WA_STREAM_LAYER.VideoSecondary,
            ssrcs: ssrcsOf(callId, `${selfDeviceJid}${SECONDARY_STREAM_SUFFIX}`, VIDEO_STREAM_SLOTS)
        },
        {
            layer: WA_STREAM_LAYER.AppData,
            ssrcs: ssrcsOf(callId, selfDeviceJid, [WA_SSRC_SLOT.APP_DATA.MAIN])
        }
    ]
}

/**
 * Every stream of one sender the media accepts and keys, main audio first: the audio stack
 * and app data, plus both video layers once video is covered. Anything unlisted is dropped.
 */
export function senderStreamsOf(callId: string, deviceJid: string, coversVideo: boolean): number[] {
    const audio = ssrcsOf(callId, deviceJid, [...AUDIO_STREAM_SLOTS, WA_SSRC_SLOT.APP_DATA.MAIN])
    if (!coversVideo) return audio
    return [
        ...audio,
        ...ssrcsOf(callId, deviceJid, VIDEO_STREAM_SLOTS),
        ...ssrcsOf(callId, `${deviceJid}${SECONDARY_STREAM_SUFFIX}`, VIDEO_STREAM_SLOTS)
    ]
}

/** An opaque sender id: the device's main audio SSRC in hex, stable for the call. */
export function groupSenderId(callId: string, deviceJid: string): string {
    return generateSecureSsrc(callId, deviceJid, WA_SSRC_SLOT.AUDIO.MAIN)
        .toString(16)
        .padStart(8, '0')
}

/** The `<device pid>` of each device jid the roster gave one, `:0` form; 0 is a pid. */
export function groupDevicePids(composition: WaGroupComposition): Map<string, number> {
    const pids = new Map<string, number>()
    for (const participant of composition.participants) {
        for (const [deviceJid, pid] of Object.entries(participant.devicePids ?? {})) {
            pids.set(toDeviceJid(deviceJid), pid)
        }
    }
    return pids
}

/**
 * The plan's `group` section: one sender per device, keyed per device from the call key, with
 * its `<device pid>` when the roster gave one, and the video asked of the SFU.
 */
export function buildGroupSection(
    callId: string,
    callKey: Uint8Array,
    deviceJids: readonly string[],
    coversVideo: boolean,
    pids: ReadonlyMap<string, number> = new Map(),
    videoSubscriptions: readonly WaCallMediaVideoSubscription[] = []
): WaCallMediaGroup {
    const senders: WaCallMediaSender[] = deviceJids.map((deviceJid) => {
        const streams = senderStreamsOf(callId, deviceJid, coversVideo)
        const pid = pids.get(deviceJid)
        return {
            id: groupSenderId(callId, deviceJid),
            audio: streams[0],
            streams,
            recv: derivePerJidSrtpKey(callKey, deviceJid),
            ...(pid !== undefined && { pid })
        }
    })
    return videoSubscriptions.length > 0 ? { senders, videoSubscriptions } : { senders }
}

const MAX_VIDEO_SUBSCRIPTIONS = 4
/** Video subscriptions are processed once more than this many participants are connected. */
const MIN_CONNECTED_FOR_VIDEO_SUBSCRIPTIONS = 2

/**
 * Whose video to ask the SFU for: every sender whose camera is on, at the default quality, at
 * most four in roster order, and nobody while two or fewer participants are connected.
 */
export function selectVideoSubscriptions(
    senders: readonly { readonly senderId: string; readonly videoEnabled: boolean }[],
    connectedCount: number
): WaCallMediaVideoSubscription[] {
    if (connectedCount <= MIN_CONNECTED_FOR_VIDEO_SUBSCRIPTIONS) return []
    return senders
        .filter((sender) => sender.videoEnabled)
        .slice(0, MAX_VIDEO_SUBSCRIPTIONS)
        .map((sender) => ({ senderId: sender.senderId, quality: WA_VIDEO_QUALITY.Default }))
}
