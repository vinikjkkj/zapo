import { randomInt } from '../crypto/random.js'
import { toError } from '../errors.js'
import type { Logger } from '../logger.js'
import { RtpHeader, RtpPacket } from '../media/rtp.js'
import { unrefTimer } from '../timers.js'

import { decodeAppDataPayload, encodeReactionPayload, type WaCallReaction } from './protocol.js'

/** One reaction is resent every 60 ms for 600 ms, with no packet marking the end. */
const DEFAULT_RETRANSMISSION_INTERVAL_MS = 60
const DEFAULT_CLEAR_INTERVAL_MS = 600

/** Inbound transaction ids kept for dedup; bounded so a hostile peer cannot grow the set. */
const MAX_TRACKED_TRANSACTIONS = 64

/**
 * The RTP payload type this side stamps on the app-data it sends. Nothing negotiates it; it
 * is the one the official client uses, since a receiver still compares it against its own.
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
 * The app-data stream of one call, which carries reactions: RTP on the audio's media socket,
 * on an SSRC of its own, under the audio's SRTP. Each reaction is resent until its clear
 * interval elapses; the receiver deduplicates by transaction id.
 */
export class WaAppDataStream {
    readonly ssrc: number

    private readonly logger: Logger
    private readonly sendPacket: (packet: RtpPacket) => boolean
    private readonly retransmissionIntervalMs: number
    private readonly clearIntervalMs: number

    private sequenceNumber = randomInt(0, 65_536)

    /** A random constant: the stream has no media clock, and the SRTP IV ignores timestamps. */
    private readonly timestamp = randomInt(0, 0xffffffff)

    private outgoing: OutgoingReaction | null = null
    private retransmitTimer: ReturnType<typeof setInterval> | null = null

    /** Reactions already surfaced, as `ssrc:transactionId`: each device numbers its own from 1. */
    private readonly seenTransactions = new Set<string>()

    /**
     * This stream's own reaction counter, from one as the official client counts: a random
     * `uint64` past 2^63 is tracked by the peer but never rendered.
     */
    private nextTransactionId = 1n

    private readonly configuredPayloadType: number | null

    private txReactionCount = 0
    private txReactionErrorCount = 0
    private rxReactionCount = 0

    constructor(options: WaAppDataStreamOptions) {
        this.logger = options.logger
        this.ssrc = options.ssrc
        this.sendPacket = options.sendPacket
        this.configuredPayloadType = options.payloadType ?? null
        this.retransmissionIntervalMs =
            options.retransmissionIntervalMs ?? DEFAULT_RETRANSMISSION_INTERVAL_MS
        this.clearIntervalMs = options.clearIntervalMs ?? DEFAULT_CLEAR_INTERVAL_MS
    }

    /** RTP payload type this stream stamps on what it sends. */
    get payloadType(): number {
        return this.configuredPayloadType ?? WA_APP_DATA_PAYLOAD_TYPE
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
            this.logger.debug('app data payload not understood', {
                ssrc: `0x${this.ssrc.toString(16)}`,
                bytes: payload.length
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
        unrefTimer(this.retransmitTimer)
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
            return this.sendPacket(new RtpPacket(header, outgoing.payload))
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
