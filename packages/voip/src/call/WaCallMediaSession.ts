import type { Logger } from 'zapo-js'
import { toUserJid } from 'zapo-js/protocol'
import { type BinaryNode, getFirstNodeChild, getNodeChildrenByTag } from 'zapo-js/transport'
import { toError, uint8TimingSafeEqual } from 'zapo-js/util'

import { concatBytes, EMPTY_BYTES, readUInt32BE, toArrayBuffer } from '../bytes.js'
import { derivePerJidSrtpKey } from '../crypto/encryption.js'
import { randomBytes } from '../crypto/primitives.js'
import { SrtcpContext, SrtpSession } from '../crypto/srtp.js'
import { generateSecureSsrc } from '../crypto/ssrc.js'
import { H264Depacketizer, packetizeWhatsAppH264AccessUnit } from '../media/h264.js'
import { MLowCodec } from '../media/mlow-codec.js'
import { buildPictureLossIndication, buildSenderReportWithSdes } from '../media/rtcp.js'
import { RtpSession } from '../media/rtp.js'
import { WaAudioEngine } from '../media/WaAudioEngine.js'
import { parseRelayFromAck } from '../relay/relay-ack.js'
import { isRtcpPacket, isRtpPacket, isStunPacket } from '../relay/stun.js'
import { TRUE_WEB_CLIENT_RELAY_PORT, WaSctpRelay } from '../relay/WaSctpRelay.js'
import {
    buildAcceptReceiptStanza,
    buildAcceptStanza,
    buildMuteV2Stanza,
    buildPreacceptStanza,
    buildRejectStanza,
    buildRelaylatencyForwardStanza,
    buildRelayLatencyStanza,
    buildTerminateStanza,
    buildTransportStanza,
    decryptCallKey,
    extractNodeInfo,
    extractRelayEndpoints,
    needsDecryption
} from '../signaling/signaling.js'
import {
    type AudioSender,
    CallDirection,
    CallMediaType,
    CallState,
    EndCallReason,
    type InboundVideoFrame,
    type InboundVideoRtpPacket,
    type RelayEndpoint,
    SRTP_AUTH_TAG_LEN,
    SRTP_RECV_AUTH_TAG_LEN,
    SRTP_SEND_AUTH_TAG_LEN,
    type WaVoipDeps
} from '../types.js'

import { type CallInfo } from './call-state.js'

export interface WaCallMediaSessionDelegate {
    emitState(call: CallInfo): void
    emitIncoming(call: CallInfo): void
    emitEnded(call: CallInfo): void
    emitInboundAudio(call: CallInfo, data: Float32Array): void
    emitInboundVideoRtp(call: CallInfo, packet: InboundVideoRtpPacket): void
    emitInboundVideo(call: CallInfo, frame: InboundVideoFrame): void
    emitOutboundAudioFinished(call: CallInfo): void
}

export interface WaCallMediaSessionOptions {
    readonly deps: WaVoipDeps
    readonly logger: Logger
    readonly info: CallInfo
    readonly delegate: WaCallMediaSessionDelegate
}

export class WaCallMediaSession implements AudioSender {
    readonly info: CallInfo

    private readonly deps: WaVoipDeps
    private readonly logger: Logger
    private readonly delegate: WaCallMediaSessionDelegate

    private rtpSession: RtpSession | null = null
    private videoRtpSession: RtpSession | null = null
    private srtpSession: SrtpSession | null = null
    private srtcpContext: SrtcpContext | null = null
    private opusCodec: MLowCodec | null = null
    private readonly sctpRelay: WaSctpRelay
    private readonly audioEngine: WaAudioEngine
    private initialTransportSent = false
    private outgoingPreacceptSent = false

    private selfSsrc = 0
    private peerSsrcs: number[] = []
    private selfStreamSsrcs: number[] = []
    private peerStreamSsrcs: number[] = []

    private firstPacketSent = false
    private acceptedByJid: string | null = null
    private readonly debeEnabled = true

    private audioSendCount = 0
    private videoSendFrames = 0
    private videoRecvPackets = 0
    private audioDropCount = 0
    private realAudioSendCount = 0

    private static readonly EMPTY_BYTES = EMPTY_BYTES

    private encodeBufferA: Float32Array | null = null
    private encodeBufferB: Float32Array | null = null
    private encodeBuffer: Float32Array | null = null
    private encodeBufferPos = 0
    private authPaddingBuffer: Uint8Array | null = null

    private audioRecvCount = 0
    private recvRealCount = 0
    private recvDtxCount = 0
    private subscriptionRefreshInterval: ReturnType<typeof setInterval> | null = null
    private rtcpInterval: ReturnType<typeof setInterval> | null = null
    private videoPacketCount = 0
    private videoOctetCount = 0
    private videoFrameNumber = 0
    private videoTransportSequence = 0
    private receivedVideoKeyFrame = false
    private lastVideoPliAt = 0
    private srtpErrorCount = 0
    private relayPacketCount = 0
    private stunResponseCount = 0
    private selfEchoCount = 0
    private lastRecvSeq = -1
    private recvSeqGaps = 0
    private actualPeerSsrc: number | null = null
    private ssrcResubscribed = false
    private readonly h264Depacketizers = new Map<number, H264Depacketizer>()

    constructor(options: WaCallMediaSessionOptions) {
        this.deps = options.deps
        this.logger = options.logger
        this.info = options.info
        this.delegate = options.delegate

        this.sctpRelay = new WaSctpRelay({
            logger: this.logger.child({ component: 'sctp' })
        })

        this.audioEngine = new WaAudioEngine({
            logger: this.logger.child({ component: 'audio-engine' })
        })
        this.audioEngine.setAudioSender(this)
        this.audioEngine.setOnAudioFinished(() => {
            this.delegate.emitOutboundAudioFinished(this.info)
        })

        this.sctpRelay.on('relay_connected', () => {
            this.onRelayConnected()
        })
        this.sctpRelay.on(
            'relay_receive',
            (relayInfo: { ip: string; port: number; data: Uint8Array }) => {
                this.onRelayData(relayInfo.data)
            }
        )
    }

    get callId(): string {
        return this.info.callId
    }

    shouldIgnoreTerminate(peerJid: string | undefined, reason: string | undefined): boolean {
        return Boolean(
            reason === 'accepted_elsewhere' &&
            peerJid &&
            this.acceptedByJid &&
            peerJid !== this.acceptedByJid
        )
    }

    async initMedia(selfLid: string, peerJid: string): Promise<void> {
        const selfDeviceJid = this.ensureDeviceJid(selfLid)
        const peerDeviceJid = this.ensureDeviceJid(peerJid)
        const relaySlots =
            this.info.mediaType === CallMediaType.Video ? [0, 1, 4, 2, 3, 5, 7, 8, 6] : [0]
        this.selfStreamSsrcs = relaySlots.map((slot) =>
            generateSecureSsrc(this.info.callId, selfDeviceJid, slot)
        )
        this.peerStreamSsrcs = relaySlots.map((slot) =>
            generateSecureSsrc(this.info.callId, peerDeviceJid, slot)
        )
        if (this.info.mediaType === CallMediaType.Audio) {
            const peerBase = toUserJid(peerJid)
            const peerDevices = (this.info.relayData?.participantJids || [])
                .filter((jid) => toUserJid(jid) === peerBase)
                .map((jid) => this.ensureDeviceJid(jid))
            this.peerStreamSsrcs = Array.from(
                new Set(
                    [peerDeviceJid, ...peerDevices].map((jid) =>
                        generateSecureSsrc(this.info.callId, jid, 0)
                    )
                )
            )
        }
        const ssrc = this.selfStreamSsrcs[0]
        this.rtpSession = RtpSession.whatsappOpus(ssrc)
        if (this.info.mediaType === CallMediaType.Video) {
            // WhatsApp derives every media stream from the same participant id and
            // changes the HKDF slot word. Slot 0 is audio and slot 2 is video.
            // Appending ":video" creates an SSRC the relay/peer does not recognize.
            const videoSsrc = generateSecureSsrc(this.info.callId, selfDeviceJid, 2)
            this.videoRtpSession = new RtpSession(videoSsrc, 97, 90000, 3000)
        }
        this.selfSsrc = ssrc

        const peerSsrc = this.peerStreamSsrcs[0]
        this.peerSsrcs = [peerSsrc]

        this.logger.debug('call media initialized', {
            callId: this.info.callId,
            selfSsrc: `0x${ssrc.toString(16).toUpperCase()}`,
            peerSsrc: `0x${peerSsrc.toString(16).toUpperCase()}`
        })

        this.opusCodec = await MLowCodec.create()
    }

    resetOutgoingFlags(): void {
        this.initialTransportSent = false
        this.outgoingPreacceptSent = false
    }

    async acceptCall(): Promise<void> {
        if (!this.info.canAccept) {
            throw new Error(
                `Call ${this.info.callId} cannot be accepted in state ${this.info.stateData.state}`
            )
        }

        this.info.applyTransition({ type: 'local_accepted' })
        this.delegate.emitState(this.info)

        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const peerJid = this.info.peerJid
        const isVideo = this.info.mediaType === CallMediaType.Video

        const peerBase = toUserJid(peerJid)
        const participantPeers =
            this.info.relayData?.participantJids?.filter(
                (jid) => toUserJid(jid) === peerBase && /:\d+@/.test(jid)
            ) || []
        const participantPeerJid =
            participantPeers.find((jid) => !/:0@/.test(jid)) || participantPeers[0]
        this.acceptedByJid = participantPeerJid || peerJid
        const resolvedPeerSsrc = generateSecureSsrc(
            callId,
            this.ensureDeviceJid(this.acceptedByJid)
        )
        this.peerSsrcs = [resolvedPeerSsrc]
        this.sctpRelay.setSubscriptionSsrc(resolvedPeerSsrc)
        this.sctpRelay.setStreamSsrcs(this.selfStreamSsrcs, this.peerStreamSsrcs)
        this.initSrtpKeys()

        try {
            const muteNode = buildMuteV2Stanza(peerJid, callId, callCreator, 0, meId)
            await this.deps.lowLevelCoordinator.sendNode(muteNode)
        } catch (err: unknown) {
            this.logger.error('error sending mute_v2', {
                message: toError(err).message
            })
        }

        try {
            const transportNode = buildTransportStanza(peerJid, callId, callCreator, meId, '1', '1')
            await this.deps.lowLevelCoordinator.sendNode(transportNode)
        } catch (err: unknown) {
            this.logger.error('error sending transport', {
                message: toError(err).message
            })
        }

        if (this.info.encryptionKey) {
            const acceptStanza = await buildAcceptStanza(
                this.deps,
                this.info.callId,
                this.info.encryptionKey,
                this.info.peerJid,
                this.info.callCreator,
                isVideo
            )

            try {
                await this.deps.lowLevelCoordinator.sendNode(acceptStanza)
            } catch (err: unknown) {
                this.logger.error('accept send error', {
                    message: toError(err).message
                })
            }
        }

        if (this.info.relayData) {
            await this.connectRelays(this.info.relayData.endpoints)
        }

        this.logger.debug('call accepted', { callId })
    }

    async rejectCall(reason: EndCallReason = EndCallReason.Declined): Promise<void> {
        this.info.applyTransition({ type: 'local_rejected', reason })
        this.delegate.emitState(this.info)

        const node = buildRejectStanza(this.info.peerJid, this.info.callId, this.info.callCreator)
        try {
            await this.deps.lowLevelCoordinator.sendNode(node)
        } catch (err) {
            this.logger.warn('reject send failed', { message: toError(err).message })
        }
        this.cleanup()
    }

    async endCall(reason: EndCallReason = EndCallReason.UserEnded): Promise<void> {
        if (this.info.isEnded) return

        const connectedAt = this.info.stateData.connectedAt
        const audioDurationMs = connectedAt ? Date.now() - connectedAt.getTime() : undefined

        this.info.applyTransition({ type: 'terminated', reason })

        const terminateTarget = this.acceptedByJid ?? this.info.peerJid
        const node = buildTerminateStanza(
            terminateTarget,
            this.info.callId,
            this.info.callCreator,
            audioDurationMs
        )
        this.delegate.emitEnded(this.info)
        this.delegate.emitState(this.info)
        try {
            await this.deps.lowLevelCoordinator.sendNode(node)
        } catch (err) {
            this.logger.warn('terminate send failed', { message: toError(err).message })
        }
        this.cleanup()
    }

    setMute(muted: boolean): void {
        if (!this.info.isActive) return

        this.info.applyTransition({ type: 'audio_mute_changed', muted })
        this.delegate.emitState(this.info)

        if (muted) {
            this.audioEngine.stopCapture()
        } else {
            this.audioEngine.startCapture()
        }
    }

    async loadAudio(audioPath: string): Promise<void> {
        await this.audioEngine.loadAudioFile(audioPath)
        this.resetEncodeState()
        this.logger.debug('audio loaded for call', { callId: this.info.callId })
    }

    setExternalAudioMode(enabled: boolean): void {
        this.audioEngine.setExternalMode(enabled)
        if (enabled) {
            this.resetEncodeState()
            this.logger.debug('external audio mode enabled', { callId: this.info.callId })
        }
    }

    feedLiveAudio(data: Float32Array): number {
        return this.audioEngine.feedExternalAudio(data)
    }

    feedLiveVideo(data: Uint8Array, timestampUs: number): number {
        if (
            this.info.mediaType !== CallMediaType.Video ||
            !this.videoRtpSession ||
            !this.srtpSession ||
            !data.length
        )
            return 0
        const payloads = packetizeWhatsAppH264AccessUnit(data)
        const timestamp = Math.floor((Math.max(0, timestampUs) * 90) / 1000) >>> 0
        const keyFrame = this.isH264KeyFrame(data)
        for (let index = 0; index < payloads.length; index++) {
            const packet = this.videoRtpSession.createPacketAtTimestamp(
                payloads[index],
                timestamp,
                index === payloads.length - 1
            )
            packet.header.extension = true
            packet.header.extensionProfile = 0xdebe
            packet.header.extensionData = this.buildVideoExtension(
                keyFrame,
                index === 0,
                this.videoTransportSequence++
            )
            const encrypted = this.srtpSession.protect(packet)
            this.sctpRelay.broadcast(toArrayBuffer(encrypted))
            this.videoPacketCount++
            this.videoOctetCount += payloads[index].length
        }
        this.videoFrameNumber = (this.videoFrameNumber + 1) & 0xffff
        this.videoSendFrames++
        if (this.videoSendFrames === 1 || this.videoSendFrames % 30 === 0) {
            this.logger.debug('video sent', {
                callId: this.info.callId,
                frames: this.videoSendFrames,
                bytes: data.length,
                packets: payloads.length
            })
        }
        return payloads.length
    }

    private isH264KeyFrame(data: Uint8Array): boolean {
        for (let index = 0; index + 4 < data.length; index++) {
            let nalOffset = -1
            if (data[index] === 0 && data[index + 1] === 0 && data[index + 2] === 1)
                nalOffset = index + 3
            else if (
                data[index] === 0 &&
                data[index + 1] === 0 &&
                data[index + 2] === 0 &&
                data[index + 3] === 1
            )
                nalOffset = index + 4
            if (nalOffset >= 0 && nalOffset < data.length) {
                const nalType = data[nalOffset] & 0x1f
                if (nalType === 5 || nalType === 7 || nalType === 8) return true
            }
        }
        return false
    }

    private buildVideoExtension(
        keyFrame: boolean,
        firstPacket: boolean,
        transportSequence: number
    ): Uint8Array {
        const frameInfo = keyFrame ? 0x08 : 0x20
        const extension = new Uint8Array(firstPacket ? 16 : 12)
        let offset = 0
        extension[offset++] = firstPacket ? 0x32 : 0x30
        extension[offset++] = frameInfo
        if (firstPacket) {
            extension[offset++] = (this.videoFrameNumber >>> 8) & 0xff
            extension[offset++] = this.videoFrameNumber & 0xff
        }
        extension[offset++] = 0x51
        extension[offset++] = 0
        extension[offset++] = 0
        extension[offset++] = 0x61
        extension[offset++] = 0
        extension[offset++] = 0
        extension[offset++] = 0x91
        extension[offset++] = (transportSequence >>> 8) & 0xff
        extension[offset++] = transportSequence & 0xff
        return extension
    }

    getLiveBufferMs(): number {
        return this.audioEngine.getLiveBufferMs()
    }

    async sendIncomingPreaccept(peerJid: string): Promise<void> {
        try {
            const preacceptNode = buildPreacceptStanza(
                peerJid,
                this.info.callId,
                this.info.callCreator
            )
            await this.deps.lowLevelCoordinator.sendNode(preacceptNode)
        } catch (err: unknown) {
            this.logger.error('error sending preaccept', {
                message: toError(err).message
            })
        }
    }

    async sendIncomingRelayLatency(): Promise<void> {
        if (!this.info.relayData) return

        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const destinationJids = this.info.relayData.participantJids || []
        const seenRelayNames = new Set<string>()

        for (const ep of this.info.relayData.endpoints) {
            const name = ep.relayName || ''
            if (!name || seenRelayNames.has(name)) continue
            seenRelayNames.add(name)

            try {
                const relayData = [
                    {
                        relayName: name,
                        latency: ep.c2rRtt || 0,
                        addressBytes: ep.addressBytes
                    }
                ]
                const relayLatencyNode = buildRelayLatencyStanza(
                    this.info.peerJid,
                    callId,
                    callCreator,
                    relayData,
                    destinationJids,
                    meId
                )
                await this.deps.lowLevelCoordinator.sendNode(relayLatencyNode)
            } catch (err: unknown) {
                this.logger.error('error sending incoming relaylatency', {
                    relayName: name,
                    message: toError(err).message
                })
            }
        }
    }

    async handleCallAccept(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        let srtpFromPeerKey = false

        if (needsDecryption(nodeInfo.tag)) {
            try {
                const peerCallKey = await decryptCallKey(
                    this.deps,
                    nodeInfo.innerNode,
                    peerJid,
                    this.logger.child({ component: 'signaling' })
                )
                if (peerCallKey) {
                    const ourCallKey = this.info.encryptionKey
                    const keysMatch = ourCallKey
                        ? uint8TimingSafeEqual(ourCallKey, peerCallKey)
                        : false
                    if (!keysMatch && ourCallKey) {
                        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
                        const meJid = this.deps.authClient.getCurrentCredentials()?.meJid
                        const ourCredJid = meLid || meJid || ''
                        const ourBase = ourCredJid ? toUserJid(ourCredJid) : ''
                        const participants = this.info.relayData?.participantJids || []
                        const ourDeviceJid =
                            participants.find((jid) => {
                                const jBase = toUserJid(jid)
                                return jBase === ourBase && /:\d+@/.test(jid)
                            }) || ourCredJid

                        if (ourDeviceJid && peerJid) {
                            try {
                                const sendKeying = derivePerJidSrtpKey(
                                    ourCallKey,
                                    this.ensureDeviceJid(ourDeviceJid)
                                )
                                const recvKeying = derivePerJidSrtpKey(
                                    peerCallKey,
                                    this.ensureDeviceJid(peerJid)
                                )
                                this.srtpSession = new SrtpSession(
                                    sendKeying,
                                    recvKeying,
                                    SRTP_SEND_AUTH_TAG_LEN,
                                    SRTP_RECV_AUTH_TAG_LEN
                                )
                                this.srtcpContext = new SrtcpContext(
                                    sendKeying,
                                    SRTP_SEND_AUTH_TAG_LEN
                                )
                                srtpFromPeerKey = true
                                this.logger.debug('srtp re-initialized with peer call_key', {
                                    callId: this.info.callId
                                })
                            } catch (err: unknown) {
                                this.logger.error('per-jid srtp re-derivation failed', {
                                    message: toError(err).message
                                })
                            }
                        }
                    }
                }
            } catch (err: unknown) {
                this.logger.error('accept decrypt error', {
                    message: toError(err).message
                })
            }
        }

        try {
            this.info.applyTransition({ type: 'remote_accepted' })
            this.delegate.emitState(this.info)
        } catch (err) {
            this.logger.trace('call transition skipped', { message: toError(err).message })
        }

        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
        const ourJid = meLid || meId
        const ourBase = ourJid ? toUserJid(ourJid) : ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const acceptingDeviceJid =
            this.info.mediaType === CallMediaType.Video && !/:\d+@/.test(peerJid)
                ? peerJid
                : this.info.mediaType === CallMediaType.Video
                  ? this.info.relayData?.participantJids?.find((jid) => {
                        const jidBase = toUserJid(jid)
                        return jidBase !== ourBase && /:[1-9]\d*@/.test(jid)
                    }) || peerJid
                  : peerJid

        this.acceptedByJid = acceptingDeviceJid

        if (this.actualPeerSsrc !== null) {
            const calculatedJid = this.ensureDeviceJid(acceptingDeviceJid)
            this.logger.debug('accept keeping actual peer ssrc', {
                callId,
                actualPeerSsrc: `0x${this.actualPeerSsrc.toString(16)}`,
                calculatedJid
            })
        } else {
            const peerDeviceJidForSsrc = this.ensureDeviceJid(acceptingDeviceJid)
            const acceptSsrc = generateSecureSsrc(callId, peerDeviceJidForSsrc)
            this.peerSsrcs = [acceptSsrc]
            this.logger.debug('accept ssrc assigned', {
                callId,
                jid: peerDeviceJidForSsrc,
                ssrc: `0x${acceptSsrc.toString(16)}`
            })
        }
        const relaySlots =
            this.info.mediaType === CallMediaType.Video ? [0, 1, 4, 2, 3, 5, 7, 8, 6] : [0]
        const acceptedPeerDeviceJid = this.ensureDeviceJid(acceptingDeviceJid)
        this.peerStreamSsrcs = relaySlots.map((slot) =>
            generateSecureSsrc(callId, acceptedPeerDeviceJid, slot)
        )
        if (this.info.mediaType === CallMediaType.Audio) {
            const peerBase = toUserJid(peerJid)
            const peerDevices = (this.info.relayData?.participantJids || [])
                .filter((jid) => toUserJid(jid) === peerBase)
                .map((jid) => this.ensureDeviceJid(jid))
            this.peerStreamSsrcs = Array.from(
                new Set(
                    [acceptedPeerDeviceJid, ...peerDevices].map((jid) =>
                        generateSecureSsrc(callId, jid, 0)
                    )
                )
            )
        }
        this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0)
        this.sctpRelay.setStreamSsrcs(this.selfStreamSsrcs, this.peerStreamSsrcs)
        this.sctpRelay.resendSubscriptions()

        if (!srtpFromPeerKey) {
            this.initSrtpKeys()
        }

        if (this.info.relayData?.participantJids) {
            const otherDevices = this.info.relayData.participantJids.filter((jid) => {
                if (jid === acceptingDeviceJid) return false
                const jidBase = toUserJid(jid)
                if (jidBase === ourBase) return false
                return true
            })

            for (const deviceJid of otherDevices) {
                try {
                    const terminateNode = buildTerminateStanza(
                        deviceJid,
                        callId,
                        callCreator,
                        undefined,
                        'accepted_elsewhere'
                    )
                    await this.deps.lowLevelCoordinator.sendNode(terminateNode)
                } catch (err: unknown) {
                    this.logger.error('error sending terminate_elsewhere', {
                        deviceJid,
                        message: toError(err).message
                    })
                }
            }
        }

        try {
            const transportNode = buildTransportStanza(
                acceptingDeviceJid,
                callId,
                callCreator,
                meId,
                '1',
                '1'
            )
            await this.deps.lowLevelCoordinator.sendNode(transportNode)
        } catch (err: unknown) {
            this.logger.error('error sending transport', {
                message: toError(err).message
            })
        }

        try {
            const muteNode = buildMuteV2Stanza(acceptingDeviceJid, callId, callCreator, 0, meId)
            await this.deps.lowLevelCoordinator.sendNode(muteNode)
        } catch (err: unknown) {
            this.logger.error('error sending mute_v2', {
                message: toError(err).message
            })
        }

        const acceptMsgId = node.attrs?.id
        if (acceptMsgId) {
            try {
                const receiptNode = buildAcceptReceiptStanza(
                    acceptingDeviceJid,
                    acceptMsgId,
                    callId,
                    callCreator,
                    ourJid
                )
                await this.deps.lowLevelCoordinator.sendNode(receiptNode)
            } catch (err: unknown) {
                this.logger.error('error sending accept receipt', {
                    message: toError(err).message
                })
            }
        }

        if (this.sctpRelay.hasConnection()) {
            try {
                this.info.applyTransition({ type: 'media_connected' })
                this.delegate.emitState(this.info)
                this.startMediaFlow()
            } catch (err) {
                this.logger.trace('call transition skipped', { message: toError(err).message })
            }
        } else if (this.info.relayData) {
            await this.connectRelays(this.info.relayData.endpoints)
        }
    }

    async handleCallPreaccept(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (this.info.direction === CallDirection.Outgoing && this.info.relayData) {
            const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
            const callId = this.info.callId
            const callCreator = this.info.callCreator

            const destinationJids = this.info.relayData.participantJids || []
            const seenRelayNames = new Set<string>()

            for (const ep of this.info.relayData.endpoints) {
                const name = ep.relayName || ''
                if (!name || seenRelayNames.has(name)) continue
                seenRelayNames.add(name)

                try {
                    const relayData = [
                        {
                            relayName: name,
                            latency: ep.c2rRtt || 0,
                            addressBytes: ep.addressBytes
                        }
                    ]
                    const relayLatencyNode = buildRelayLatencyStanza(
                        this.info.peerJid,
                        callId,
                        callCreator,
                        relayData,
                        destinationJids,
                        meId
                    )
                    await this.deps.lowLevelCoordinator.sendNode(relayLatencyNode)
                } catch (err: unknown) {
                    this.logger.error('error sending relaylatency', {
                        relayName: name,
                        message: toError(err).message
                    })
                }
            }

            if (!this.initialTransportSent) {
                try {
                    const basePeerJid = toUserJid(peerJid)
                    const transportNode = buildTransportStanza(
                        basePeerJid,
                        callId,
                        callCreator,
                        meId
                    )
                    await this.deps.lowLevelCoordinator.sendNode(transportNode)
                    this.initialTransportSent = true
                } catch (err: unknown) {
                    this.logger.error('error sending initial transport', {
                        message: toError(err).message
                    })
                }
            }
        }
    }

    async handleCallTransport(_node: BinaryNode): Promise<void> {
        const nodeInfo = extractNodeInfo(_node)
        if (!nodeInfo) return

        const relays = extractRelayEndpoints(nodeInfo.innerNode)
        if (relays.length > 0 && !this.sctpRelay.hasConnection()) {
            this.info.relayData = {
                ...this.info.relayData,
                endpoints: relays
            }
            await this.connectRelays(relays)
        }
    }

    async handleCallAck(node: BinaryNode): Promise<void> {
        const ackType = node.attrs?.type
        if (ackType !== 'offer') return

        const error = node.attrs?.error
        if (error) {
            this.logger.error('ack error', { callId: this.info.callId, error })
            return
        }

        const { relays, participantJids, uuid, selfPid, peerPid, hbhKey } = parseRelayFromAck(node)

        if (relays.length > 0) {
            this.info.relayData = {
                endpoints: relays,
                participantJids,
                uuid,
                selfPid,
                peerPid,
                hbhKey
            }

            this.logger.debug('offer ack relays parsed', {
                callId: this.info.callId,
                relayCount: relays.length,
                participantCount: participantJids.length
            })

            const callKey = this.info.encryptionKey
            if (participantJids.length > 0) {
                const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
                const meId = this.deps.authClient.getCurrentCredentials()?.meJid
                const ourCredJid = meLid || meId || ''
                const ourBase = ourCredJid ? toUserJid(ourCredJid) : ''

                const ourDeviceJid = this.ensureDeviceJid(
                    participantJids.find((jid) => {
                        const jidBase = toUserJid(jid)
                        return jidBase === ourBase && /:\d+@/.test(jid)
                    }) || ourCredJid
                )

                const peerJids = participantJids.filter((jid) => {
                    const jidBase = toUserJid(jid)
                    return jidBase !== ourBase
                })
                const peerCandidate =
                    peerJids.find((jid) => /:\d+@/.test(jid) && !/:0@/.test(jid)) || peerJids[0]
                const peerDeviceJid = peerCandidate
                    ? this.ensureDeviceJid(peerCandidate)
                    : undefined

                const newSelfSsrc = generateSecureSsrc(this.info.callId, ourDeviceJid)
                if (newSelfSsrc !== this.selfSsrc) {
                    this.selfSsrc = newSelfSsrc
                    this.rtpSession = RtpSession.whatsappOpus(newSelfSsrc)
                }

                if (peerDeviceJid) {
                    const peerDeviceSsrc = generateSecureSsrc(this.info.callId, peerDeviceJid)
                    this.peerSsrcs = [peerDeviceSsrc]
                }

                if (callKey) {
                    this.initSrtpKeys()
                } else {
                    this.logger.debug('no call_key, srtp not initialized', {
                        callId: this.info.callId
                    })
                }
            }

            if (this.info.isInitiator && !this.outgoingPreacceptSent) {
                try {
                    const preacceptNode = buildPreacceptStanza(
                        this.info.peerJid,
                        this.info.callId,
                        this.info.callCreator
                    )
                    await this.deps.lowLevelCoordinator.sendNode(preacceptNode)
                    this.outgoingPreacceptSent = true
                } catch (err: unknown) {
                    this.logger.error('error sending preaccept (caller)', {
                        message: toError(err).message
                    })
                }
            }

            await this.connectRelays(relays)

            if (
                this.srtpSession &&
                this.rtpSession &&
                this.opusCodec &&
                this.sctpRelay.hasConnection()
            ) {
                this.audioEngine.startSilenceCapture()
            }
        }
    }

    async handleCallRelaylatency(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const inner = nodeInfo.innerNode
        const callId = inner.attrs?.['call-id'] || this.info.callId
        const callCreator = inner.attrs?.['call-creator'] || this.info.callCreator

        const teNodes = getNodeChildrenByTag(inner, 'te')

        if (teNodes.length === 0) return

        const destinationJids = this.info.relayData?.participantJids || []
        if (destinationJids.length > 0) {
            const forwardNode = buildRelaylatencyForwardStanza(
                peerJid,
                callId,
                callCreator,
                teNodes,
                destinationJids
            )

            try {
                await this.deps.lowLevelCoordinator.sendNode(forwardNode)
            } catch (err: unknown) {
                this.logger.error('error forwarding relaylatency', {
                    message: toError(err).message
                })
            }
        }
    }

    handleRelayElection(node: BinaryNode): void {
        const inner = getFirstNodeChild(node)
        if (!inner) return

        let electedRelayIdx: number | undefined
        if (inner.attrs?.['elected_relay_idx'] !== undefined) {
            const parsed = Number(inner.attrs['elected_relay_idx'])
            if (Number.isSafeInteger(parsed) && parsed >= 0) electedRelayIdx = parsed
        } else if (inner.attrs?.['relay_id'] !== undefined) {
            const parsed = Number(inner.attrs['relay_id'])
            if (Number.isSafeInteger(parsed) && parsed >= 0) electedRelayIdx = parsed
        } else if (inner.content instanceof Uint8Array) {
            const bytes = inner.content
            if (bytes.length >= 4) electedRelayIdx = readUInt32BE(bytes, 0)
            else if (bytes.length > 0) electedRelayIdx = bytes[0]
        }

        if (electedRelayIdx !== undefined) {
            this.info.electedRelayIdx = electedRelayIdx
            this.logger.debug('elected relay index', {
                callId: this.info.callId,
                electedRelayIdx
            })
        }
    }

    async handleCallMuteV2(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator

        try {
            const muteNode = buildMuteV2Stanza(peerJid, callId, callCreator, 0, meId)
            await this.deps.lowLevelCoordinator.sendNode(muteNode)
        } catch (err: unknown) {
            this.logger.error('error sending mute_v2 response', {
                message: toError(err).message
            })
        }
    }

    handleCallTerminate(): void {
        try {
            this.info.applyTransition({
                type: 'terminated',
                reason: EndCallReason.UserEnded
            })
        } catch (err) {
            this.logger.trace('call transition skipped', { message: toError(err).message })
        }

        this.delegate.emitEnded(this.info)
        this.delegate.emitState(this.info)
        this.cleanup()
    }

    sendCapturedAudio(data: Float32Array): void {
        const hasRelay = this.sctpRelay.hasConnection()
        if (!this.rtpSession || !this.srtpSession || !this.opusCodec || !hasRelay) {
            this.audioDropCount++
            if (this.audioDropCount === 1 || this.audioDropCount % 500 === 0) {
                const missing = [
                    !this.rtpSession && 'rtpSession',
                    !this.srtpSession && 'srtpSession',
                    !this.opusCodec && 'opusCodec',
                    !hasRelay && 'relayConnection'
                ]
                    .filter(Boolean)
                    .join(', ')
                this.logger.debug('audio dropped', {
                    callId: this.info.callId,
                    dropCount: this.audioDropCount,
                    missing
                })
            }
            return
        }

        for (let i = 0; i < data.length; i++) {
            if (!Number.isFinite(data[i])) {
                data[i] = 0
            }
        }

        const frameSamples = this.encodeFrameSamples
        if (!this.encodeBuffer) {
            if (!this.encodeBufferA) {
                this.encodeBufferA = new Float32Array(frameSamples)
                this.encodeBufferB = new Float32Array(frameSamples)
            }
            this.encodeBuffer = this.encodeBufferA
            this.encodeBufferPos = 0
        }

        let offset = 0
        while (offset < data.length) {
            const toCopy = Math.min(data.length - offset, frameSamples - this.encodeBufferPos)
            this.encodeBuffer.set(data.subarray(offset, offset + toCopy), this.encodeBufferPos)
            this.encodeBufferPos += toCopy
            offset += toCopy

            if (this.encodeBufferPos < frameSamples) break

            const frameData: Float32Array = this.encodeBuffer
            this.encodeBuffer =
                frameData === this.encodeBufferA ? this.encodeBufferB! : this.encodeBufferA!
            this.encodeBufferPos = 0

            try {
                const opusFrame = this.opusCodec.encode(frameData)
                this.sendOpusFrame(opusFrame, false)
                this.realAudioSendCount++
            } catch (err: unknown) {
                this.logger.error('encode error', {
                    callId: this.info.callId,
                    message: toError(err).message
                })
            }
        }
    }

    cleanup(): void {
        const opusStats = this.opusCodec?.getStats()
        this.logger.debug('call stats', {
            callId: this.info.callId,
            relayPackets: this.relayPacketCount,
            recvOk: this.audioRecvCount,
            srtpErrors: this.srtpErrorCount,
            sent: this.audioSendCount,
            dropped: this.audioDropCount,
            opusOk: opusStats?.success ?? 0,
            opusErr: opusStats?.errors ?? 0
        })

        this.audioEngine.setOnAudioFinished(null)
        this.audioEngine.stop()
        if (this.subscriptionRefreshInterval) {
            clearInterval(this.subscriptionRefreshInterval)
            this.subscriptionRefreshInterval = null
        }
        if (this.rtcpInterval) {
            clearInterval(this.rtcpInterval)
            this.rtcpInterval = null
        }
        this.sctpRelay.cleanup()

        if (this.opusCodec) {
            this.opusCodec.destroy()
            this.opusCodec = null
        }

        this.rtpSession = null
        this.videoRtpSession = null
        this.srtpSession = null
        this.srtcpContext = null

        this.audioSendCount = 0
        this.audioDropCount = 0
        this.audioRecvCount = 0
        this.srtpErrorCount = 0
        this.relayPacketCount = 0
        this.stunResponseCount = 0
        this.selfEchoCount = 0
        this.lastRecvSeq = -1
        this.recvSeqGaps = 0
        this.actualPeerSsrc = null
        this.ssrcResubscribed = false
        this.recvRealCount = 0
        this.recvDtxCount = 0
        this.initialTransportSent = false
        this.outgoingPreacceptSent = false
        this.firstPacketSent = false
        this.realAudioSendCount = 0
        this.encodeBuffer = null
        this.encodeBufferPos = 0
        this.acceptedByJid = null
    }

    private get encodeFrameSamples(): number {
        return this.opusCodec?.getFrameSize() ?? 960
    }

    private get rtpTsDelta(): number {
        return this.encodeFrameSamples
    }

    private sendOpusFrame(opusFrame: Uint8Array, isSilence: boolean): void {
        if (!this.rtpSession || !this.srtpSession) return

        try {
            let rtpPayload: Uint8Array = opusFrame

            const authPadding = SRTP_AUTH_TAG_LEN - SRTP_SEND_AUTH_TAG_LEN
            if (authPadding > 0) {
                if (!this.authPaddingBuffer || this.authPaddingBuffer.length !== authPadding) {
                    this.authPaddingBuffer = new Uint8Array(authPadding)
                }
                rtpPayload = concatBytes([rtpPayload, this.authPaddingBuffer])
            }

            const marker = !this.firstPacketSent
            const tsDelta = this.rtpTsDelta
            const rtpPacket = this.rtpSession.createPacketWithDuration(rtpPayload, tsDelta, marker)

            if (this.debeEnabled) {
                rtpPacket.header.extension = true
                rtpPacket.header.extensionProfile = 0xdebe
                rtpPacket.header.extensionData = WaCallMediaSession.EMPTY_BYTES
            }

            if (!this.firstPacketSent) {
                this.firstPacketSent = true
            }

            const srtpData = this.srtpSession.protect(rtpPacket)
            this.sctpRelay.broadcast(toArrayBuffer(srtpData))

            this.audioSendCount++
            if (this.audioSendCount === 1 || this.audioSendCount % 500 === 0) {
                this.logger.debug('audio sent', {
                    callId: this.info.callId,
                    sendCount: this.audioSendCount,
                    opusBytes: opusFrame.length,
                    srtpBytes: srtpData.length,
                    silence: isSilence
                })
            }
        } catch (err: unknown) {
            this.logger.error('error sending audio', {
                callId: this.info.callId,
                message: toError(err).message
            })
        }
    }

    private ensureDeviceJid(jid: string): string {
        if (/:\d+@/.test(jid)) return jid
        return jid.replace('@', ':0@')
    }

    private initSrtpKeys(): void {
        const callKey = this.info.encryptionKey
        if (!callKey) {
            this.logger.debug('no call_key, srtp not initialized', { callId: this.info.callId })
            return
        }

        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
        const meId = this.deps.authClient.getCurrentCredentials()?.meJid
        const ourCredJid = meLid || meId || ''
        const ourBase = toUserJid(ourCredJid)
        const participants = this.info.relayData?.participantJids || []

        const ourDeviceJid = this.ensureDeviceJid(
            participants.find((jid) => {
                const jBase = toUserJid(jid)
                return jBase === ourBase && /:\d+@/.test(jid)
            }) || ourCredJid
        )

        let rawPeerJid = this.acceptedByJid || this.info.peerJid
        if (!this.acceptedByJid) {
            const peerFromParticipants = participants.find((jid) => {
                const jBase = toUserJid(jid)
                return jBase !== ourBase
            })
            if (peerFromParticipants) rawPeerJid = peerFromParticipants
        }
        const peerDeviceJid = this.ensureDeviceJid(rawPeerJid)

        try {
            const sendKeying = derivePerJidSrtpKey(callKey, ourDeviceJid)
            const recvKeying = derivePerJidSrtpKey(callKey, peerDeviceJid)

            this.srtpSession = new SrtpSession(
                sendKeying,
                recvKeying,
                SRTP_SEND_AUTH_TAG_LEN,
                SRTP_RECV_AUTH_TAG_LEN
            )
            this.srtcpContext = new SrtcpContext(sendKeying, SRTP_SEND_AUTH_TAG_LEN)
            this.logger.debug('srtp per-jid keys initialized', {
                callId: this.info.callId,
                sendJid: ourDeviceJid,
                recvJid: peerDeviceJid
            })
        } catch (err: unknown) {
            this.logger.debug('srtp key derivation failed', {
                callId: this.info.callId,
                message: toError(err).message
            })
        }
    }

    private resetEncodeState(): void {
        this.encodeBuffer = null
        this.encodeBufferPos = 0
        this.realAudioSendCount = 0
    }

    private onRelayConnected(): void {
        if (this.info.stateData.state === CallState.Connecting) {
            try {
                this.info.applyTransition({ type: 'media_connected' })
                this.delegate.emitState(this.info)
                this.startMediaFlow()
                this.logger.debug('relay connected, call active', { callId: this.info.callId })
            } catch (err) {
                this.logger.trace('call transition skipped', { message: toError(err).message })
            }
        }
    }

    private onRelayData(data: Uint8Array): void {
        this.relayPacketCount++

        if (isStunPacket(data)) {
            this.stunResponseCount++
            return
        }

        if (isRtcpPacket(data)) {
            this.logger.trace('srtcp packet received', {
                callId: this.info.callId,
                packetType: data[1],
                bytes: data.length
            })
            return
        }

        if (!isRtpPacket(data)) return

        const pt = data[1] & 0x7f
        if (!this.srtpSession) return

        if (data.length >= 12) {
            const ssrc = ((data[8] << 24) | (data[9] << 16) | (data[10] << 8) | data[11]) >>> 0
            if (ssrc === this.selfSsrc) {
                this.selfEchoCount++
                return
            }

            if (!this.ssrcResubscribed && this.actualPeerSsrc === null) {
                this.actualPeerSsrc = ssrc
                const knownSsrc = this.peerSsrcs.includes(ssrc)
                if (!knownSsrc) {
                    this.peerSsrcs = [ssrc]
                    this.ssrcResubscribed = true
                    this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0)
                    this.sctpRelay.resendSubscriptions()
                }
            }
        }

        try {
            const rtpPacket = this.srtpSession.unprotect(data)
            if (pt !== 120) {
                if (pt === 97 || pt === 103) {
                    this.videoRecvPackets++
                    if (this.videoRecvPackets === 1 || this.videoRecvPackets % 100 === 0) {
                        this.logger.debug('video packet received', {
                            callId: this.info.callId,
                            packets: this.videoRecvPackets,
                            payloadType: pt,
                            ssrc: `0x${rtpPacket.header.ssrc.toString(16)}`
                        })
                    }
                    if (this.videoRecvPackets <= 20) {
                        const nalType = rtpPacket.payload[0] & 0x1f
                        const fuHeader =
                            nalType === 28 && rtpPacket.payload.length > 1
                                ? rtpPacket.payload[1]
                                : 0
                        this.logger.debug('video rtp details', {
                            callId: this.info.callId,
                            packet: this.videoRecvPackets,
                            sequenceNumber: rtpPacket.header.sequenceNumber,
                            timestamp: rtpPacket.header.timestamp,
                            marker: rtpPacket.header.marker,
                            nalType,
                            fuStart: (fuHeader & 0x80) !== 0,
                            fuEnd: (fuHeader & 0x40) !== 0,
                            bytes: rtpPacket.payload.length
                        })
                    }
                    this.delegate.emitInboundVideoRtp(this.info, {
                        payloadType: pt,
                        sequenceNumber: rtpPacket.header.sequenceNumber,
                        timestamp: rtpPacket.header.timestamp,
                        ssrc: rtpPacket.header.ssrc,
                        marker: rtpPacket.header.marker,
                        payload: rtpPacket.payload
                    })
                    if (pt === 97) {
                        let depacketizer = this.h264Depacketizers.get(rtpPacket.header.ssrc)
                        if (!depacketizer) {
                            depacketizer = new H264Depacketizer()
                            this.h264Depacketizers.set(rtpPacket.header.ssrc, depacketizer)
                        }
                        const frame = depacketizer.push(
                            rtpPacket.payload,
                            rtpPacket.header.timestamp,
                            rtpPacket.header.marker
                        )
                        if (frame) {
                            if (frame.keyFrame) this.receivedVideoKeyFrame = true
                            if (
                                !this.receivedVideoKeyFrame &&
                                Date.now() - this.lastVideoPliAt >= 300
                            ) {
                                this.lastVideoPliAt = Date.now()
                                if (this.srtcpContext && this.videoRtpSession) {
                                    const senderSsrc = this.videoRtpSession.getSsrc()
                                    const pli = buildPictureLossIndication(
                                        senderSsrc,
                                        rtpPacket.header.ssrc
                                    )
                                    this.sctpRelay.broadcast(
                                        toArrayBuffer(this.srtcpContext.protect(pli, senderSsrc))
                                    )
                                    this.logger.debug('video key frame requested', {
                                        callId: this.info.callId,
                                        mediaSsrc: `0x${rtpPacket.header.ssrc.toString(16)}`
                                    })
                                }
                            }
                            this.logger.debug('video frame assembled', {
                                callId: this.info.callId,
                                timestamp: frame.timestamp,
                                keyFrame: frame.keyFrame,
                                bytes: frame.data.length
                            })
                            this.delegate.emitInboundVideo(this.info, {
                                codec: 'h264',
                                timestamp: frame.timestamp,
                                keyFrame: frame.keyFrame,
                                data: frame.data
                            })
                        }
                    }
                }
                return
            }
            if (!this.opusCodec) return
            const opusPayload = rtpPacket.payload

            this.audioRecvCount++

            if (opusPayload.length === 0) return

            const seq = rtpPacket.header.sequenceNumber
            if (this.lastRecvSeq >= 0) {
                const expected = (this.lastRecvSeq + 1) & 0xffff
                if (seq !== expected) {
                    const gap = ((seq - this.lastRecvSeq + 65536) % 65536) - 1
                    this.recvSeqGaps += gap
                }
            }
            this.lastRecvSeq = seq

            const isDtx = opusPayload.length <= 2
            if (isDtx) this.recvDtxCount++
            else this.recvRealCount++

            let audioData = this.opusCodec.decode(opusPayload)

            if (audioData.length > 0 && audioData.length < 960) {
                const padded = new Float32Array(960)
                padded.set(audioData)
                audioData = padded
            }

            this.audioEngine.onPlaybackData(audioData)
            this.delegate.emitInboundAudio(this.info, audioData)

            if (this.audioRecvCount % 100 === 0) {
                const stats = this.opusCodec.getStats()
                this.logger.debug('audio recv stats', {
                    callId: this.info.callId,
                    recvCount: this.audioRecvCount,
                    real: this.recvRealCount,
                    dtx: this.recvDtxCount,
                    decodeOk: stats.success,
                    decodeErr: stats.errors
                })
            }
        } catch (err: unknown) {
            this.srtpErrorCount++
            if (this.srtpErrorCount <= 5) {
                const ssrc = data.length >= 12 ? readUInt32BE(data, 8) : 0
                this.logger.debug('srtp recv error', {
                    callId: this.info.callId,
                    errorCount: this.srtpErrorCount,
                    message: toError(err).message,
                    ssrc: `0x${ssrc.toString(16)}`
                })
            }
        }
    }

    private async connectRelays(endpoints: RelayEndpoint[]): Promise<void> {
        this.logger.debug('connecting relays', {
            callId: this.info.callId,
            endpointCount: endpoints.length
        })

        const seen = new Set<string>()
        const uniqueEndpoints: RelayEndpoint[] = []
        for (const ep of endpoints) {
            if ((ep.protocol ?? 0) !== 0) continue
            const key = `${ep.ip}:${ep.port}`
            if (!seen.has(key)) {
                seen.add(key)
                uniqueEndpoints.push(ep)
            }
        }

        const relays = uniqueEndpoints
            .filter((ep) => ep.key && ep.rawToken)
            .map((ep) => ({
                ip: ep.ip,
                port: TRUE_WEB_CLIENT_RELAY_PORT,
                token: ep.token,
                authToken: ep.authToken,
                rawAuthToken: ep.rawAuthToken,
                rawToken: ep.rawToken,
                key: ep.key,
                relayId: ep.relayId,
                name: ep.relayName || `${ep.ip}:${TRUE_WEB_CLIENT_RELAY_PORT}`,
                authTokenId: ep.authTokenId,
                isFna: ep.isFna
            }))

        if (relays.length === 0) {
            this.logger.error('no relay configs', { callId: this.info.callId })
            return
        }

        this.sctpRelay.setSsrc(this.selfSsrc)
        this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0)
        this.sctpRelay.setStreamSsrcs(this.selfStreamSsrcs, this.peerStreamSsrcs)
        this.sctpRelay.setParticipantIds(this.info.relayData?.selfPid, this.info.relayData?.peerPid)

        try {
            await this.sctpRelay.configureRelays(relays)
            this.logger.debug('sctp relays configured', {
                callId: this.info.callId,
                connected: this.sctpRelay.getConnectedCount()
            })
        } catch (err: unknown) {
            this.logger.error('sctp relay error', {
                callId: this.info.callId,
                message: toError(err).message
            })
        }
    }

    private startMediaFlow(): void {
        this.resetEncodeState()
        this.audioEngine.startPlayback()
        this.audioEngine.startCapture()
        if (!this.subscriptionRefreshInterval) {
            this.subscriptionRefreshInterval = setInterval(() => {
                this.sctpRelay.resendSubscriptions()
            }, 5000)
        }
        if (this.info.mediaType === CallMediaType.Video && !this.rtcpInterval) {
            const cname = randomBytes(18)
            this.rtcpInterval = setInterval(() => {
                if (!this.srtcpContext || !this.videoRtpSession) return
                const timestamp = Math.floor(Date.now() * 90) >>> 0
                const report = buildSenderReportWithSdes(
                    this.videoRtpSession.getSsrc(),
                    this.videoPacketCount,
                    this.videoOctetCount,
                    timestamp,
                    cname
                )
                this.sctpRelay.broadcast(
                    toArrayBuffer(this.srtcpContext.protect(report, this.videoRtpSession.getSsrc()))
                )
            }, 1000)
        }
    }
}
