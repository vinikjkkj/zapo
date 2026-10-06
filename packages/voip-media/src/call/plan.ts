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
}

export interface WaCallMediaRelays {
    readonly endpoints: readonly WaCallMediaRelay[]
    /** Participant ids the relay allocation carries; see `WaSctpRelay.setParticipantIds`. */
    readonly selfPid?: number
    readonly peerPid?: number
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
