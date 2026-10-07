/** Read-only once handed over: a session derives each stream's context from it lazily. */
export interface SrtpKeyingMaterial {
    readonly masterKey: Uint8Array
    readonly masterSalt: Uint8Array
}

export enum PayloadType {
    WhatsAppOpus = 120,
    WhatsAppH264 = 97,
    /**
     * Lowest payload type of WhatsApp's proprietary Reed-Solomon video FEC
     * family, which the client emits as `103 + 3k`. Not an RTX stream: the
     * payload is opaque parity, with no prefix and no original sequence number,
     * and it travels on the FEC stream's own SSRC.
     */
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
}

export const SRTP_SEND_AUTH_TAG_LEN = 4
export const SRTP_RECV_AUTH_TAG_LEN = 4

export const SRTP_AUTH_TAG_LEN = 4

export const SRTP_LABEL = {
    ENCRYPTION: 0x00,
    AUTH: 0x01,
    SALT: 0x02
} as const
