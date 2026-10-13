import type { SrtpKeyingMaterial } from '../types.js'

/**
 * What the media of one call needs from signaling: relays, derived SSRCs, SRTP keys and
 * settings. It holds no jid or call key; each section is replaced whole when it changes.
 */
export interface WaCallMediaPlan {
    /** What the call was negotiated as. An upgrade moves `video`, not this. */
    readonly mediaType: 'audio' | 'video'
    /** Whether both ends accepted: media only starts flowing from here. */
    readonly accepted: boolean
    /** Whether our capture goes out as silence. The stream itself stays alive. */
    readonly muted: boolean
    readonly relays: WaCallMediaRelays | null
    readonly ssrcs: WaCallMediaSsrcs | null
    readonly keys: WaCallMediaKeys | null
    readonly settings: WaCallMediaSettings | null
    readonly video: WaCallMediaVideo
    /** The remote senders of a group call; absent or `null` on a 1:1 call. */
    readonly group?: WaCallMediaGroup | null
}

/** A change to the plan: the sections present replace the ones held, the rest stay. */
export type WaCallMediaPlanUpdate = Partial<WaCallMediaPlan>

/**
 * One relay endpoint of the call.
 *
 * @sensitive `token`, `authToken`, `rawToken`, `rawAuthToken` and `key`.
 */
export interface WaCallMediaRelay {
    readonly ip: string
    /** The port the relay advertises for itself. */
    readonly port: number
    /** Transport of the endpoint. Only UDP, `0`, is dialled. */
    readonly protocol?: number
    readonly token: string
    readonly authToken?: string
    readonly rawToken?: Uint8Array
    readonly rawAuthToken?: Uint8Array
    /** ICE password and STUN message-integrity key of the endpoint. */
    readonly key: string
    readonly relayId: number
    readonly name?: string
    readonly authTokenId?: string
    /** `raw-udp` dials this endpoint as a raw UDP leg, whatever the host's default. */
    readonly transport?: 'raw-udp'
}

export interface WaCallMediaRelays {
    readonly endpoints: readonly WaCallMediaRelay[]
    /** Participant ids the relay allocation carries; see `WaSctpRelay.setParticipantIds`. */
    readonly selfPid?: number
    readonly peerPid?: number
    /**
     * 0 or absent for the offer's relays. Higher than the one held means the server moved the
     * call: they are dialled at once, even with legs open, and media is elected among this
     * generation's legs while any is open. Older legs stay up, unelected.
     */
    readonly generation?: number
}

/**
 * The endpoints the plane dials: UDP only (protocol 0), the first per advertised
 * `ip:port`, and of those only the ones carrying a key and a raw token.
 */
export function dialableRelayEndpoints<
    T extends Pick<WaCallMediaRelay, 'ip' | 'port' | 'protocol' | 'key' | 'rawToken'>
>(endpoints: readonly T[]): T[] {
    const seen = new Set<string>()
    const dialable: T[] = []
    for (const ep of endpoints) {
        if ((ep.protocol ?? 0) !== 0) continue
        const key = `${ep.ip}:${ep.port}`
        if (seen.has(key)) continue
        seen.add(key)
        if (ep.key && ep.rawToken) dialable.push(ep)
    }
    return dialable
}

/** The call's SSRCs, derived by signaling from the call id, a device jid and a slot. */
export interface WaCallMediaSsrcs {
    readonly selfAudio: number
    /** Our video stream, carried even on an audio call so an upgrade needs nothing new. */
    readonly selfVideo: number
    /** Our app-data stream, the one reactions ride. */
    readonly selfAppData: number
    /** Our streams the relay registers from the start. */
    readonly selfStreams: readonly number[]
    /** Our streams that video adds, registered once an upgrade opens our sender. */
    readonly selfVideoStreams: readonly number[]
    /** The peer device's audio stream, the one the relay subscription names. */
    readonly peerAudio: number
    /** The peer's streams the relay subscribes us to from the start. */
    readonly peerStreams: readonly number[]
    /** The peer's video streams, subscribed to once its video can arrive. */
    readonly peerVideoStreams: readonly number[]
    /** The app-data streams of every device of the peer: inbound app data is told apart by these. */
    readonly peerAppData: readonly number[]
    /**
     * Our streams declared to the relay layer by layer. Set, it replaces the legacy
     * declaration built from `selfAudio` and the pids; a 1:1 call leaves it out.
     */
    readonly selfLayers?: readonly WaCallMediaStreamLayer[]
}

/** One layer of our streams as the relay declaration lists it. */
export interface WaCallMediaStreamLayer {
    /** 0 audio, 1 video main, 2 video secondary, 5 app data. */
    readonly layer: number
    /** In position order: media, then FEC, then NACK. */
    readonly ssrcs: readonly number[]
}

/** The remote senders of a group call, the whole set: a sender left out is torn down. */
export interface WaCallMediaGroup {
    readonly senders: readonly WaCallMediaSender[]
    /**
     * Video asked of the relay, by sender; absent or empty asks for none. A host without the
     * `group-video/1` feature ignores it.
     */
    readonly videoSubscriptions?: readonly WaCallMediaVideoSubscription[]
}

/** One sender's video asked of the relay. */
export interface WaCallMediaVideoSubscription {
    readonly senderId: string
    /** A {@link WA_VIDEO_QUALITY} value. */
    readonly quality: number
}

/** Video quality a subscription asks for. */
export const WA_VIDEO_QUALITY = Object.freeze({
    Default: 0,
    Low: 1,
    Medium: 2,
    High: 3,
    Hd: 4
} as const)

/**
 * One remote device sending into a group call.
 *
 * @sensitive `recv` decrypts this sender's media.
 */
export interface WaCallMediaSender {
    /** Opaque and stable for the device; no jid crosses the plan. */
    readonly id: string
    /** The sender's main audio stream, which gets a decoder ahead of its first packet. */
    readonly audio: number
    /** Every stream of the sender, each keyed with `recv` for SRTP and SRTCP. */
    readonly streams: readonly number[]
    readonly recv: SrtpKeyingMaterial
    /** The relay's id for the device, from the latest roster that carried one; 0 is an id. */
    readonly pid?: number
}

/**
 * The SRTP keys of the call, derived per device.
 *
 * @sensitive `send` and `recv` decrypt the call's media.
 */
export interface WaCallMediaKeys {
    /** Changes whenever the keys do; the SRTP contexts are rebuilt only then. */
    readonly epoch: number
    readonly send: SrtpKeyingMaterial
    readonly recv: SrtpKeyingMaterial
}

/** What the server's `<voip_settings>` tunes in the media, resolved by signaling. */
export interface WaCallMediaSettings {
    /** RTCP interval the server set, or `null` for the compiled one, replacing any set before. */
    readonly rtcpIntervalMs: number | null
    /** Whether the server turned the RTCP REMB off for this call. */
    readonly disableRtcpRemb: boolean
    /** Whether the server announced SFrame for the app-data stream. */
    readonly appDataSframe: boolean
    /**
     * 60 ms frames bundled per audio packet, from `rc.maxfpp`: 2 is what the official 1:1
     * client sends, and absent means 1. A frame with the VAD bit clear always goes alone.
     */
    readonly audioFramesPerPacket?: number
}

export interface WaCallMediaVideo {
    /**
     * Whether our video sender is open: a video call, or an upgrade both ends agreed to.
     * Whether frames go out yet is {@link sendHeld}.
     */
    readonly send: boolean
    /** Whether the peer's video may arrive on an audio call. */
    readonly receive: boolean
    /**
     * Drops our video until the peer is ready: a first packet that beats the peer's inbound
     * stream setup can break its video for the call. Resumes on the next key frame.
     */
    readonly sendHeld?: boolean
}
