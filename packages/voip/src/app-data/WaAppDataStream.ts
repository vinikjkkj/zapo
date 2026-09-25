import type { Logger } from 'zapo-js'
import { toError } from 'zapo-js/util'

import { randomInt } from '../crypto/primitives.js'
import { RtpHeader, RtpPacket } from '../media/rtp.js'

import { decodeAppDataPayload, encodeReactionPayload, type WaCallReaction } from './protocol.js'

/**
 * How long one reaction keeps being retransmitted, and how often. Both measured on the
 * wire: nine packets about 60 ms apart, then the sender stopped - with no packet marking
 * the end, which is why nothing here sends one either.
 */
const DEFAULT_RETRANSMISSION_INTERVAL_MS = 60
const DEFAULT_CLEAR_INTERVAL_MS = 600

/** Inbound transaction ids kept for dedup; bounded so a hostile peer cannot grow the set. */
const MAX_TRACKED_TRANSACTIONS = 64

/**
 * The RTP payload type this side stamps on the app-data it sends.
 *
 * Nothing negotiates it: each client registers its own and the offer carries none,
 * so this is a choice rather than a match. It is the number a capture of the
 * reference client used - the conservative pick, since a peer demultiplexes app
 * data by SSRC but its receive path still compares the type against one it expects.
 */
export const WA_APP_DATA_PAYLOAD_TYPE = 119

interface OutgoingReaction {
    readonly payload: Uint8Array
    readonly transactionId: bigint
    readonly reaction: string
    readonly clearAt: number
}

export interface WaAppDataStreamOptions {
    readonly logger: Logger
    /** SSRC of this device's app-data stream, derived from the call's slot 6. */
    readonly ssrc: number
    /**
     * Hands one framed packet to the transport, which applies the audio stream's own
     * end-to-end SRTP and writes it to the media socket. Returns whether it left.
     */
    readonly sendPacket: (packet: RtpPacket) => boolean
    /** Overrides the outgoing payload type; see {@link WaAppDataStream.payloadType}. */
    readonly payloadType?: number | null
    readonly retransmissionIntervalMs?: number
    readonly clearIntervalMs?: number
}

/**
 * The app-data stream of one call: the RTP stream that carries reactions. Not a call
 * stanza and not the data channel - an RTP packet on the audio's own media socket, on an
 * SSRC of its own, under the same per-jid end-to-end SRTP. It exists in a plain audio call
 * too, because that profile also ships `enable_app_data_stream=1`.
 *
 * Best-effort: one reaction is sent repeatedly until its clear interval elapses and the
 * receiver deduplicates by transaction id. How the official client signals the *clear*
 * half is not established, so nothing is fabricated - the buffer just empties.
 */
export class WaAppDataStream {
    readonly ssrc: number

    private readonly logger: Logger
    private readonly sendPacket: (packet: RtpPacket) => boolean
    private readonly retransmissionIntervalMs: number
    private readonly clearIntervalMs: number

    private sequenceNumber = randomInt(0, 65_536)

    /**
     * RTP timestamp of every packet of this stream: a random constant, since the stream
     * has no media clock. Safe because the SRTP initialization vector is built from the
     * SSRC and the packet index, never from the timestamp.
     */
    private readonly timestamp = randomInt(0, 0xffffffff)

    private outgoing: OutgoingReaction | null = null
    private retransmitTimer: ReturnType<typeof setInterval> | null = null

    /**
     * Dedup keys of the reactions already surfaced, each one an inbound SSRC paired with a
     * transaction id. The SSRC is part of the key because the id only counts within one
     * sender: every device numbers its own reactions from 1, so two devices of the peer
     * open a call with the same id and a shared set would swallow the second reaction.
     */
    private readonly seenTransactions = new Set<string>()

    /**
     * Numbers this stream's own reactions, counting from one.
     *
     * The field is a `uint64` and a random one is legal, but the reference client
     * sends small counters - the first reaction of a call arrives as `1` - and a
     * random one lands above 2^63 half the time, which is where a receiver reading
     * it as a JavaScript number stops being able to hold it. The peer then tracks
     * the transaction and renders nothing, with no error on either side.
     */
    private nextTransactionId = 1n

    private learnedPayloadType: number | null
    private configuredPayloadType: number | null

    private sframeRequired = false
    private sframeProtect: ((payload: Uint8Array) => Uint8Array) | null = null

    private txReactionCount = 0
    private txReactionErrorCount = 0
    private rxReactionCount = 0

    constructor(options: WaAppDataStreamOptions) {
        this.logger = options.logger
        this.ssrc = options.ssrc
        this.sendPacket = options.sendPacket
        this.configuredPayloadType = options.payloadType ?? null
        this.learnedPayloadType = null
        this.retransmissionIntervalMs =
            options.retransmissionIntervalMs ?? DEFAULT_RETRANSMISSION_INTERVAL_MS
        this.clearIntervalMs = options.clearIntervalMs ?? DEFAULT_CLEAR_INTERVAL_MS
    }

    /**
     * RTP payload type this stream stamps on what it sends; nothing negotiates it. The
     * number in the stream descriptor is a category, not an RTP type, and never leaves
     * the client that builds it.
     */
    get payloadType(): number {
        return this.configuredPayloadType ?? WA_APP_DATA_PAYLOAD_TYPE
    }

    /**
     * The payload type seen on the peer's app-data stream, or `null` so far.
     * Informational: inbound packets are recognized by SSRC, outbound carry our own type.
     */
    get peerPayloadType(): number | null {
        return this.learnedPayloadType
    }

    /** Records an inbound payload type. Informational only; see {@link peerPayloadType}. */
    observeInboundPayloadType(payloadType: number): void {
        if (this.configuredPayloadType !== null || this.learnedPayloadType === payloadType) return
        this.learnedPayloadType = payloadType
        this.logger.debug('app data payload type learned from peer', {
            payloadType,
            ssrc: `0x${this.ssrc.toString(16)}`
        })
    }

    /**
     * Supplies the transform that applies SFrame, and records whether the server
     * announced it for this call.
     *
     * **Do not gate the send on `required`.** The announcement is not an instruction: a
     * reaction from the reference client on such a call arrives readable with the
     * end-to-end keys alone. `protect` is `null` today, so gating would make every
     * reaction vanish on every call where the server announces SFrame - most of them.
     */
    setSframe(required: boolean, protect: ((payload: Uint8Array) => Uint8Array) | null): void {
        this.sframeRequired = required
        this.sframeProtect = protect
    }

    /**
     * Sets the outgoing reaction, replacing whatever was in the send buffer, and starts
     * retransmitting it. Returns whether the first attempt left the socket; a `false` does
     * not abandon it, the buffer keeps it and the retransmission carries it.
     */
    sendReaction(reaction: string): boolean {
        const transactionId = this.nextTransactionId++
        const payload = encodeReactionPayload({ transactionId, reaction })
        const clearAt = Date.now() + this.clearIntervalMs

        this.outgoing = { payload, transactionId, reaction, clearAt }
        this.txReactionCount++

        const sent = this.transmit()
        this.armRetransmission()

        this.logger.debug('call reaction queued', {
            reaction,
            transactionId: transactionId.toString(),
            ssrc: `0x${this.ssrc.toString(16)}`,
            firstAttemptSent: sent,
            total: this.txReactionCount
        })

        return sent
    }

    /**
     * Reads one decrypted app-data RTP payload, arrived on `ssrc`, and returns the
     * reactions in it not seen before, so a caller surfaces each of the peer's reactions
     * once per burst.
     */
    receive(payload: Uint8Array, ssrc: number): readonly WaCallReaction[] {
        if (payload.length === 0) return EMPTY_REACTIONS

        const decoded = decodeAppDataPayload(payload)
        if (!decoded) {
            // With SFrame on this is expected, not a malformed peer: the bytes are
            // ciphertext and nothing here holds the key.
            this.logger.debug('app data payload not understood', {
                ssrc: `0x${this.ssrc.toString(16)}`,
                bytes: payload.length,
                sframeRequired: this.sframeRequired,
                sframeKeyed: this.sframeProtect !== null
            })
            return EMPTY_REACTIONS
        }

        if (decoded.truncated) {
            this.logger.debug('app data payload carried more messages than are read', {
                ssrc: `0x${ssrc.toString(16)}`,
                read: decoded.items.length
            })
        }

        const fresh: WaCallReaction[] = []
        for (const item of decoded.items) {
            const reaction = item.reaction
            if (!reaction) continue
            const key = `${ssrc}:${reaction.transactionId}`
            if (this.seenTransactions.has(key)) continue
            this.rememberTransaction(key)
            this.rxReactionCount++
            fresh.push(reaction)
        }

        if (fresh.length > 0) {
            this.logger.debug('call reaction received', {
                shape: decoded.shape,
                count: fresh.length,
                total: this.rxReactionCount
            })
        }

        return fresh
    }

    /** Drops the send buffer and stops every timer of this stream. */
    close(): void {
        this.clearOutgoing()
        this.seenTransactions.clear()
    }

    private rememberTransaction(key: string): void {
        if (this.seenTransactions.size >= MAX_TRACKED_TRANSACTIONS) {
            const oldest = this.seenTransactions.values().next().value
            if (oldest !== undefined) this.seenTransactions.delete(oldest)
        }
        this.seenTransactions.add(key)
    }

    private armRetransmission(): void {
        if (this.retransmitTimer) return
        this.retransmitTimer = setInterval(() => {
            this.onRetransmissionTick()
        }, this.retransmissionIntervalMs)
        // A best-effort retransmission must not keep an otherwise idle program alive.
        this.retransmitTimer.unref?.()
    }

    private onRetransmissionTick(): void {
        const outgoing = this.outgoing
        if (!outgoing) {
            this.clearOutgoing()
            return
        }

        if (Date.now() >= outgoing.clearAt) {
            this.logger.debug('call reaction cleared from send buffer', {
                transactionId: outgoing.transactionId.toString()
            })
            this.clearOutgoing()
            return
        }

        this.transmit()
    }

    private clearOutgoing(): void {
        this.outgoing = null
        if (this.retransmitTimer) {
            clearInterval(this.retransmitTimer)
            this.retransmitTimer = null
        }
    }

    private transmit(): boolean {
        const outgoing = this.outgoing
        if (!outgoing) return false

        const payloadType = this.payloadType

        try {
            const header = new RtpHeader(
                payloadType,
                this.sequenceNumber,
                this.timestamp,
                this.ssrc
            )
            this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff
            const payload = this.sframeProtect
                ? this.sframeProtect(outgoing.payload)
                : outgoing.payload
            return this.sendPacket(new RtpPacket(header, payload))
        } catch (err: unknown) {
            this.txReactionErrorCount++
            this.logger.debug('failed to send app data rtp packet', {
                ssrc: `0x${this.ssrc.toString(16)}`,
                errors: this.txReactionErrorCount,
                message: toError(err).message
            })
            return false
        }
    }
}

const EMPTY_REACTIONS: readonly WaCallReaction[] = []
