import {
    dialableRelayEndpoints,
    type SrtpKeyingMaterial,
    WA_VIDEO_QUALITY,
    type WaCallMediaGroup,
    type WaCallMediaSender,
    type WaCallMediaStreamLayer,
    type WaCallMediaVideoSubscription
} from '@zapo-js/voip-media'

import { derivePerJidSrtpKey } from '../crypto/encryption.js'
import { generateSecureSsrc, WA_SSRC_SLOT } from '../crypto/ssrc.js'
import { groupParticipantAccountKey, toDeviceJid } from '../jid.js'
import type { RelayEndpoint } from '../types.js'

import {
    isGroupParticipantLeaving,
    type WaCallGroupParticipant,
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

function sameKeySet<T>(
    current: readonly T[],
    next: readonly T[],
    keyOf: (item: T) => string
): boolean {
    const held = new Set(current.map(keyOf))
    const wanted = new Set(next.map(keyOf))
    if (held.size !== wanted.size) return false
    for (const key of wanted) {
        if (!held.has(key)) return false
    }
    return true
}

/** Whether two endpoint sets name the same addresses, order aside. */
export function sameRelayEndpointSet(
    current: readonly Pick<RelayEndpoint, 'ip' | 'port'>[],
    next: readonly Pick<RelayEndpoint, 'ip' | 'port'>[]
): boolean {
    return sameKeySet(current, next, relayEndpointKey)
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
    return sameKeySet(current, next, relayCredentialKey)
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
    return electAmong(dialableRelayEndpoints(endpoints))
}

function electAmong(dialable: readonly RelayEndpoint[]): RelayEndpoint[] {
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
    const dialable = dialableRelayEndpoints(endpoints)
    const elected = electAmong(dialable)
    if (elected.length === 0) return []

    const byRelay = new Map<string, RelayEndpoint[]>([[relayIdentityOf(elected[0]), []]])
    const sorted = dialable.sort((a, b) => (a.c2rRtt ?? Infinity) - (b.c2rRtt ?? Infinity))
    for (const endpoint of sorted) {
        const identity = relayIdentityOf(endpoint)
        const relay = byRelay.get(identity)
        if (relay) relay.push(endpoint)
        else byRelay.set(identity, [endpoint])
    }
    return [...byRelay.values()].flat()
}

/**
 * Every device sending into the call: all devices of every participant still on it, our own
 * account left out, each once. Not narrowed to `connected`, so media is ready before it flows.
 */
export function groupSenderDeviceJids(
    composition: WaGroupComposition,
    selfJid: string,
    accountKeyOf: (participant: WaCallGroupParticipant) => string = (participant) =>
        groupParticipantAccountKey(participant.jid)
): string[] {
    const selfKey = selfJid ? groupParticipantAccountKey(selfJid) : null
    const devices = new Set<string>()
    for (const participant of composition.participants) {
        if (selfKey !== null && accountKeyOf(participant) === selfKey) continue
        if (isGroupParticipantLeaving(participant)) continue
        for (const deviceJid of participant.devices) devices.add(toDeviceJid(deviceJid))
    }
    return [...devices]
}

/** One SSRC of a device's stream: `(deviceJid, slot)` for a fixed call. */
type SsrcOf = (deviceJid: string, slot: number) => number

function directSsrcOf(callId: string): SsrcOf {
    return (deviceJid, slot) => generateSecureSsrc(callId, deviceJid, slot)
}

function ssrcsOf(ssrcOf: SsrcOf, deviceJid: string, slots: readonly number[]): number[] {
    return slots.map((slot) => ssrcOf(deviceJid, slot))
}

function streamLayersOf(ssrcOf: SsrcOf, selfDeviceJid: string): WaCallMediaStreamLayer[] {
    return [
        { layer: WA_STREAM_LAYER.Audio, ssrcs: ssrcsOf(ssrcOf, selfDeviceJid, AUDIO_STREAM_SLOTS) },
        {
            layer: WA_STREAM_LAYER.VideoMain,
            ssrcs: ssrcsOf(ssrcOf, selfDeviceJid, VIDEO_STREAM_SLOTS)
        },
        {
            layer: WA_STREAM_LAYER.VideoSecondary,
            ssrcs: ssrcsOf(ssrcOf, `${selfDeviceJid}${SECONDARY_STREAM_SUFFIX}`, VIDEO_STREAM_SLOTS)
        },
        {
            layer: WA_STREAM_LAYER.AppData,
            ssrcs: ssrcsOf(ssrcOf, selfDeviceJid, [WA_SSRC_SLOT.APP_DATA.MAIN])
        }
    ]
}

function streamsOfSender(ssrcOf: SsrcOf, deviceJid: string, coversVideo: boolean): number[] {
    const audio = ssrcsOf(ssrcOf, deviceJid, [...AUDIO_STREAM_SLOTS, WA_SSRC_SLOT.APP_DATA.MAIN])
    if (!coversVideo) return audio
    return [
        ...audio,
        ...ssrcsOf(ssrcOf, deviceJid, VIDEO_STREAM_SLOTS),
        ...ssrcsOf(ssrcOf, `${deviceJid}${SECONDARY_STREAM_SUFFIX}`, VIDEO_STREAM_SLOTS)
    ]
}

function toSenderId(audioSsrc: number): string {
    return audioSsrc.toString(16).padStart(8, '0')
}

/**
 * Our streams as the relay declaration lists them: audio, video main and video secondary
 * three positions each, whether or not video is on, then app data.
 */
export function selfStreamLayers(callId: string, selfDeviceJid: string): WaCallMediaStreamLayer[] {
    return streamLayersOf(directSsrcOf(callId), selfDeviceJid)
}

/**
 * Every stream of one sender the media accepts and keys, main audio first: the audio stack
 * and app data, plus both video layers once video is covered. Anything unlisted is dropped.
 */
export function senderStreamsOf(callId: string, deviceJid: string, coversVideo: boolean): number[] {
    return streamsOfSender(directSsrcOf(callId), deviceJid, coversVideo)
}

/** An opaque sender id: the device's main audio SSRC in hex, stable for the call. */
export function groupSenderId(callId: string, deviceJid: string): string {
    return toSenderId(generateSecureSsrc(callId, deviceJid, WA_SSRC_SLOT.AUDIO.MAIN))
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

function groupSectionOf(
    deviceJids: readonly string[],
    pids: ReadonlyMap<string, number>,
    videoSubscriptions: readonly WaCallMediaVideoSubscription[],
    streamsOf: (deviceJid: string) => number[],
    recvKeyOf: (deviceJid: string) => SrtpKeyingMaterial
): WaCallMediaGroup {
    const senders: WaCallMediaSender[] = deviceJids.map((deviceJid) => {
        const streams = streamsOf(deviceJid)
        const pid = pids.get(deviceJid)
        return {
            id: toSenderId(streams[0]),
            audio: streams[0],
            streams,
            recv: recvKeyOf(deviceJid),
            ...(pid !== undefined && { pid })
        }
    })
    return videoSubscriptions.length > 0 ? { senders, videoSubscriptions } : { senders }
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
    const ssrcOf = directSsrcOf(callId)
    return groupSectionOf(
        deviceJids,
        pids,
        videoSubscriptions,
        (deviceJid) => streamsOfSender(ssrcOf, deviceJid, coversVideo),
        (deviceJid) => derivePerJidSrtpKey(callKey, deviceJid)
    )
}

/** Past this many entries a memo starts over; a long call with churn cannot grow it unbounded. */
const MAX_MEMOISED_SSRCS = 4096
const MAX_MEMOISED_SRTP_KEYS = 512

/**
 * One call's SSRC and per-device SRTP key derivations, each run once: both are pure in their
 * inputs, and a group call re-derives every sender on each roster, rekey and subscription change.
 */
export class WaCallDerivations {
    private readonly ssrcs = new Map<string, number>()
    private srtpKeys = new Map<string, SrtpKeyingMaterial>()
    private srtpKeysOf: Uint8Array | null = null

    constructor(private readonly callId: string) {}

    readonly ssrc: SsrcOf = (deviceJid, slot) => {
        const key = `${deviceJid}|${slot}`
        let ssrc = this.ssrcs.get(key)
        if (ssrc === undefined) {
            if (this.ssrcs.size >= MAX_MEMOISED_SSRCS) this.ssrcs.clear()
            ssrc = generateSecureSsrc(this.callId, deviceJid, slot)
            this.ssrcs.set(key, ssrc)
        }
        return ssrc
    }

    /** {@link derivePerJidSrtpKey}, memoised per device for the call key last asked about. */
    srtpKey(callKey: Uint8Array, deviceJid: string): SrtpKeyingMaterial {
        if (callKey !== this.srtpKeysOf || this.srtpKeys.size >= MAX_MEMOISED_SRTP_KEYS) {
            this.srtpKeys = new Map()
            this.srtpKeysOf = callKey
        }
        let keys = this.srtpKeys.get(deviceJid)
        if (keys === undefined) {
            keys = derivePerJidSrtpKey(callKey, deviceJid)
            this.srtpKeys.set(deviceJid, keys)
        }
        return keys
    }

    /** See {@link selfStreamLayers}. */
    selfStreamLayers(selfDeviceJid: string): WaCallMediaStreamLayer[] {
        return streamLayersOf(this.ssrc, selfDeviceJid)
    }

    /** See {@link senderStreamsOf}. */
    senderStreams(deviceJid: string, coversVideo: boolean): number[] {
        return streamsOfSender(this.ssrc, deviceJid, coversVideo)
    }

    /** See {@link groupSenderId}. */
    senderId(deviceJid: string): string {
        return toSenderId(this.ssrc(deviceJid, WA_SSRC_SLOT.AUDIO.MAIN))
    }

    /** See {@link buildGroupSection}; `streamsOf` hands back streams already derived. */
    groupSection(
        callKey: Uint8Array,
        deviceJids: readonly string[],
        streamsOf: (deviceJid: string) => number[],
        pids: ReadonlyMap<string, number>,
        videoSubscriptions: readonly WaCallMediaVideoSubscription[]
    ): WaCallMediaGroup {
        return groupSectionOf(deviceJids, pids, videoSubscriptions, streamsOf, (deviceJid) =>
            this.srtpKey(callKey, deviceJid)
        )
    }
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
