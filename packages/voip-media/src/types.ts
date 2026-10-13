/** Read-only once handed over: a session derives each stream's context from it lazily. */
export interface SrtpKeyingMaterial {
    readonly masterKey: Uint8Array
    readonly masterSalt: Uint8Array
}

/** Sample rate of call audio, mono, and the clock rate of its RTP timestamps. */
export const AUDIO_SAMPLE_RATE = 16_000

/** Clock rate of the H.264 stream, the unit of its RTP timestamps. */
export const VIDEO_CLOCK_RATE = 90_000

export enum PayloadType {
    WhatsAppOpus = 120,
    /** `mlow-red-1`: MLow, plain or with in-band RED, numbered apart from PT 120. */
    WhatsAppMlowRed = 121,
    /** `mlow-1`: plain MLow on PT 120's clock, SSRC and numbering. */
    WhatsAppMlowAlt = 122,
    WhatsAppH264 = 97,
    /** Base of WhatsApp's Reed-Solomon video FEC, `103 + 3k`: opaque parity on its own SSRC. */
    WhatsAppVideoFec = 103
}

/** One video RTP packet of the peer, decrypted, before any reassembly. */
export interface InboundVideoRtpPacket {
    readonly payloadType: number
    readonly sequenceNumber: number
    readonly timestamp: number
    readonly ssrc: number
    readonly marker: boolean
    /** Decrypted RTP payload of the inbound H.264 stream, payload type 97. */
    readonly payload: Uint8Array
    /** The group sender whose stream this is; absent on a 1:1 call or an unlisted stream. */
    readonly senderId?: string
}

/** One H.264 access unit of the peer, reassembled from its RTP packets. */
export interface InboundVideoFrame {
    readonly codec: 'h264'
    /**
     * SSRC of the stream this frame was assembled from, so frames of two senders never
     * mix. It does **not** separate a peer's camera from its screen: a share derives the
     * same SSRCs its camera does.
     */
    readonly ssrc: number
    readonly timestamp: number
    readonly keyFrame: boolean
    /** Complete Annex-B access unit. */
    readonly data: Uint8Array
    /** The group sender whose stream this is; absent on a 1:1 call or an unlisted stream. */
    readonly senderId?: string
}

export const SRTP_AUTH_TAG_LEN = 4

export const SRTP_LABEL = {
    ENCRYPTION: 0x00,
    AUTH: 0x01,
    SALT: 0x02
} as const
