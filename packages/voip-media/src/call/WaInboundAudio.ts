import { bytesToHex, hexSsrc } from '../bytes.js'
import type { Logger } from '../logger.js'
import type { AudioReceiveSet } from '../media/audio-receive-set.js'
import type { MLowCodec } from '../media/mlow-codec.js'
import { MlowPacketRead } from '../media/mlow-packet.js'
import { RtpStreamReception } from '../media/rtp-stream-reception.js'
import type { RtpHeader } from '../media/rtp.js'
import type { WaJitterBuffer } from '../media/WaJitterBuffer.js'
import type { MLowDecodeOutcome } from '../media/WaMlowDecoder.js'
import { AUDIO_SAMPLE_RATE, PayloadType } from '../types.js'

import type { WaGroupSenders } from './WaGroupSenders.js'

export interface WaInboundAudioOptions {
    readonly logger: Logger
    /** The 1:1 playout the decoded frames go to. */
    readonly playout: WaJitterBuffer
    readonly group: Pick<WaGroupSenders, 'audio' | 'takesAudioRemb'>
    /** The call's codec as it is when read: it decodes 1:1 audio and takes the loss reports. */
    readonly codec: () => MLowCodec | null
    /** Peer audio authenticated on `ssrc`, on a 1:1 call. */
    readonly onPeerAudio: (ssrc: number) => void
    /** Sends the audio REMB naming `ssrc`, when one is due. */
    readonly sendReceiverEstimate: (ssrc: number) => void
}

/**
 * Decodes inbound PT 120, 121 and 122 on the 1:1 decoder, or on the group sender's own, and
 * keeps the 1:1 reception and the receive counters.
 */
export class WaInboundAudio {
    private readonly logger: Logger
    private readonly playout: WaJitterBuffer
    private readonly group: Pick<WaGroupSenders, 'audio' | 'takesAudioRemb'>
    private readonly codec: () => MLowCodec | null
    private readonly onPeerAudio: (ssrc: number) => void
    private readonly sendReceiverEstimate: (ssrc: number) => void

    /** The peer stream of a 1:1 call, as the report blocks and the audio REMB see it. */
    readonly reception = new RtpStreamReception(AUDIO_SAMPLE_RATE)

    private audioRecvCount = 0
    private audioRedDiscardCount = 0
    /** The PT 121 packet being received, read once for the check and the decode. */
    private readonly pt121Read = new MlowPacketRead()
    private recvRealCount = 0
    private recvDtxCount = 0

    /** Queues one decoded frame for playout; bound once so the decode path allocates no closure. */
    private readonly onDecodedAudio = (pcm: Float32Array): void => {
        this.playout.write(pcm)
    }

    constructor(options: WaInboundAudioOptions) {
        this.logger = options.logger
        this.playout = options.playout
        this.group = options.group
        this.codec = options.codec
        this.onPeerAudio = options.onPeerAudio
        this.sendReceiverEstimate = options.sendReceiverEstimate
    }

    get received(): number {
        return this.audioRecvCount
    }

    get redDiscarded(): number {
        return this.audioRedDiscardCount
    }

    /** Takes one authenticated audio packet of payload type `pt`: 120, 121 or 122. */
    receive(pt: number, header: RtpHeader, payload: Uint8Array): void {
        if (pt === PayloadType.WhatsAppOpus) {
            this.onAudioPacket(header, payload, 0)
        } else if (pt === PayloadType.WhatsAppMlowRed) {
            if (this.pt121Read.read(payload)) {
                this.onAudioPacket(header, payload, 1, this.pt121Read)
            } else {
                this.discardRedAudio(payload, header.ssrc)
            }
        } else {
            const outcome = this.onAudioPacket(header, payload, 0)
            this.group.audio?.countPt122(header.ssrc, outcome)
        }
    }

    /**
     * Decodes one peer audio packet: `stream` 0 is PT 120, 1 is PT 121, numbered apart on the
     * one timeline. PT 121 on an SSRC other than the one the reception follows stays out of it.
     */
    private onAudioPacket(
        header: RtpHeader,
        payload: Uint8Array,
        stream: 0 | 1,
        read?: MlowPacketRead
    ): MLowDecodeOutcome | null {
        const group = this.group.audio
        if (group) {
            return this.onGroupAudioPacket(group, header, payload, stream, read)
        }
        const ssrc = header.ssrc
        this.onPeerAudio(ssrc)
        const codec = this.codec()
        if (!codec) return null

        this.audioRecvCount++
        const seq = header.sequenceNumber
        const followed = this.reception.sourceSsrc
        if (stream === 0 || followed === 0 || followed === ssrc) {
            this.reception.observe(ssrc, seq, header.timestamp, Date.now())
            this.sendReceiverEstimate(ssrc)
        }

        if (payload.length === 0) return 'empty'

        this.countAudioPayload(payload)
        const outcome = codec.decodeSequenced(
            seq,
            payload,
            this.onDecodedAudio,
            header.timestamp,
            stream,
            read
        )

        if (this.audioRecvCount % 100 === 0) {
            const stats = codec.getStats()
            this.reportAudioRecvStats('audio recv stats', this.reception.lossPercent, {
                decodeOk: stats.success,
                decodeErr: stats.errors,
                plc: stats.plc,
                fec: stats.fec,
                late: stats.late,
                redundant: stats.redundant,
                redRecovered: stats.redRecovered
            })
        }
        return outcome
    }

    private countAudioPayload(payload: Uint8Array): void {
        if (payload.length <= 2) this.recvDtxCount++
        else this.recvRealCount++
    }

    /** Hands the encoder the loss its FEC plans for, and logs the receive counters. */
    private reportAudioRecvStats(
        message: string,
        lossPercent: number,
        details: Readonly<Record<string, unknown>>
    ): void {
        this.codec()?.setExpectedPacketLossPercent(lossPercent)
        this.logger.debug(message, {
            recvCount: this.audioRecvCount,
            real: this.recvRealCount,
            dtx: this.recvDtxCount,
            ...details
        })
    }

    /**
     * Decodes one group sender's audio on that sender's own decoder. Nothing latches: every
     * sender's SSRC comes from the plan.
     */
    private onGroupAudioPacket(
        group: AudioReceiveSet,
        header: RtpHeader,
        payload: Uint8Array,
        stream: 0 | 1,
        read?: MlowPacketRead
    ): MLowDecodeOutcome | null {
        const ssrc = header.ssrc
        this.audioRecvCount++
        this.countAudioPayload(payload)
        const outcome = group.receive(
            ssrc,
            header.sequenceNumber,
            header.timestamp,
            payload,
            stream,
            Date.now(),
            read
        )
        if (this.group.takesAudioRemb(ssrc)) this.sendReceiverEstimate(ssrc)

        if (this.audioRecvCount % 100 === 0) {
            this.reportAudioRecvStats('group audio recv stats', group.peakLossPercent(), {
                senders: group.size
            })
        }
        return outcome
    }

    /** Counts a PT 121 packet that does not parse as MLow; the first ones log their header. */
    private discardRedAudio(payload: Uint8Array, ssrc: number): void {
        const packets = ++this.audioRedDiscardCount
        if (packets > 5 && packets % 500 !== 0) return
        this.logger.debug('pt 121 packet discarded, not mlow', {
            packets,
            ssrc: hexSsrc(ssrc),
            bytes: payload.length,
            header: bytesToHex(payload.subarray(0, 4))
        })
    }
}
