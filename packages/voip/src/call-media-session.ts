import type { Logger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'
import { uint8Equal } from 'zapo-js/util'

import { AudioEngine } from './audio-engine.js'
import { concatBytes, EMPTY_BYTES, readUInt32BE, toArrayBuffer } from './bytes.js'
import { type CallInfo } from './call-state.js'
import { derivePerJidSrtpKey } from './encryption.js'
import { MLowCodec } from './mlow-codec.js'
import { parseRelayFromAck } from './relay-ack.js'
import { RtpSession } from './rtp.js'
import { NodeSctpRelayManager } from './sctp-relay.js'
import {
    buildAcceptReceiptStanza,
    buildAcceptStanza,
    buildMuteV2Stanza,
    buildPreacceptStanza,
    buildRejectStanza,
    buildRelayLatencyStanza,
    buildTerminateStanza,
    buildTransportStanza,
    decryptCallKeyInNode,
    extractNodeInfo,
    extractRelayEndpoints,
    generateCallStanzaId,
    needsDecryption
} from './signaling.js'
import { SrtpSession } from './srtp.js'
import { generateSecureSsrc } from './ssrc.js'
import { isRtpPacket, isStunPacket } from './stun.js'
import {
    type AudioSender,
    CallDirection,
    CallMediaType,
    CallState,
    EndCallReason,
    type RelayEndpoint,
    SRTP_AUTH_TAG_LEN,
    SRTP_RECV_AUTH_TAG_LEN,
    SRTP_SEND_AUTH_TAG_LEN
} from './types.js'
import type { VoipSocket } from './voip-socket.js'

export interface CallMediaSessionDelegate {
    emitState(call: CallInfo): void
    emitIncoming(call: CallInfo): void
    emitEnded(call: CallInfo): void
    emitInboundAudio(call: CallInfo, data: Float32Array): void
    emitOutboundAudioFinished(call: CallInfo): void
}

export interface CallMediaSessionOptions {
    readonly sock: VoipSocket
    readonly logger: Logger
    readonly debug: boolean
    readonly info: CallInfo
    readonly delegate: CallMediaSessionDelegate
}

export class CallMediaSession implements AudioSender {
    readonly info: CallInfo

    private readonly sock: VoipSocket
    private readonly logger: Logger
    private readonly debug: boolean
    private readonly delegate: CallMediaSessionDelegate

    private rtpSession: RtpSession | null = null
    private srtpSession: SrtpSession | null = null
    private opusCodec: MLowCodec | null = null
    private readonly sctpRelay: NodeSctpRelayManager
    private readonly audioEngine: AudioEngine
    private initialTransportSent = false
    private outgoingPreacceptSent = false

    private selfSsrc = 0
    private peerSsrcs: number[] = []

    private firstPacketSent = false
    private acceptedByJid: string | null = null
    private readonly debeEnabled = true

    private audioSendCount = 0
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
    private srtpErrorCount = 0
    private relayPacketCount = 0
    private stunResponseCount = 0
    private selfEchoCount = 0
    private lastRecvSeq = -1
    private recvSeqGaps = 0
    private actualPeerSsrc: number | null = null
    private ssrcResubscribed = false

    constructor(options: CallMediaSessionOptions) {
        this.sock = options.sock
        this.logger = options.logger
        this.debug = options.debug
        this.info = options.info
        this.delegate = options.delegate

        this.sctpRelay = new NodeSctpRelayManager({
            logger: this.logger.child({ component: 'sctp' }),
            debug: this.debug
        })

        this.audioEngine = new AudioEngine({
            logger: this.logger.child({ component: 'audio-engine' }),
            debug: this.debug
        })
        this.audioEngine.setAudioSender(this)
        this.audioEngine.setOnAudioFinished(() => {
            this.delegate.emitOutboundAudioFinished(this.info)
        })

        this.sctpRelay.on('relay:connected', () => {
            this.onRelayConnected()
        })
        this.sctpRelay.on(
            'relay:receive',
            (relayInfo: { ip: string; port: number; data: Uint8Array }) => {
                this.onRelayData(relayInfo.data)
            }
        )
    }

    get callId(): string {
        return this.info.callId
    }

    async initMedia(selfLid: string, peerJid: string): Promise<void> {
        const ssrc = generateSecureSsrc(this.info.callId, selfLid)
        this.rtpSession = RtpSession.whatsappOpus(ssrc)
        this.selfSsrc = ssrc

        const peerSsrc = generateSecureSsrc(this.info.callId, peerJid)
        this.peerSsrcs = [peerSsrc]

        if (this.debug) {
            this.logger.debug('call media initialized', {
                callId: this.info.callId,
                selfSsrc: `0x${ssrc.toString(16).toUpperCase()}`,
                peerSsrc: `0x${peerSsrc.toString(16).toUpperCase()}`
            })
        }

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

        const meId = this.sock.authState?.creds?.me?.id ?? ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const peerJid = this.info.peerJid
        const isVideo = this.info.mediaType === CallMediaType.Video

        this.acceptedByJid = peerJid
        await this.initSrtpKeys()

        try {
            const muteNode = buildMuteV2Stanza(peerJid, callId, callCreator, 0, meId)
            await this.sock.sendNode(muteNode)
        } catch (err: unknown) {
            if (this.debug) {
                this.logger.error('error sending mute_v2', {
                    message: err instanceof Error ? err.message : String(err)
                })
            }
        }

        try {
            const transportNode = buildTransportStanza(peerJid, callId, callCreator, meId, '1', '1')
            await this.sock.sendNode(transportNode)
        } catch (err: unknown) {
            if (this.debug) {
                this.logger.error('error sending transport', {
                    message: err instanceof Error ? err.message : String(err)
                })
            }
        }

        if (this.info.encryptionKey) {
            const acceptStanza = await buildAcceptStanza(
                this.sock,
                this.info.callId,
                this.info.encryptionKey,
                this.info.peerJid,
                this.info.callCreator,
                isVideo
            )

            try {
                await this.sock.sendNode(acceptStanza)
            } catch (err: unknown) {
                if (this.debug) {
                    this.logger.error('accept send error', {
                        message: err instanceof Error ? err.message : String(err)
                    })
                }
            }
        }

        if (this.info.relayData) {
            await this.connectRelays(this.info.relayData.endpoints)
        }

        if (this.debug) {
            this.logger.debug('call accepted', { callId })
        }
    }

    rejectCall(reason: EndCallReason = EndCallReason.Declined): void {
        this.info.applyTransition({ type: 'local_rejected', reason })

        const node = buildRejectStanza(this.info.peerJid, this.info.callId, this.info.callCreator)
        this.sock.sendNode(node).catch(() => {})
        this.delegate.emitState(this.info)
        this.cleanup()
    }

    endCall(reason: EndCallReason = EndCallReason.UserEnded): void {
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
        this.sock.sendNode(node).catch(() => {})
        this.delegate.emitEnded(this.info)
        this.delegate.emitState(this.info)
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

    feedLiveAudio(data: Float32Array): void {
        this.audioEngine.feedExternalAudio(data)
    }

    async sendIncomingPreaccept(peerJid: string): Promise<void> {
        try {
            const preacceptNode = buildPreacceptStanza(
                peerJid,
                this.info.callId,
                this.info.callCreator
            )
            await this.sock.sendNode(preacceptNode)
        } catch (err: unknown) {
            if (this.debug) {
                this.logger.error('error sending preaccept', {
                    message: err instanceof Error ? err.message : String(err)
                })
            }
        }
    }

    async sendIncomingRelayLatency(): Promise<void> {
        if (!this.info.relayData) return

        const meId = this.sock.authState?.creds?.me?.id ?? ''
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
                await this.sock.sendNode(relayLatencyNode)
            } catch (err: unknown) {
                if (this.debug) {
                    this.logger.error('error sending incoming relaylatency', {
                        relayName: name,
                        message: err instanceof Error ? err.message : String(err)
                    })
                }
            }
        }
    }

    async handleCallAccept(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (needsDecryption(nodeInfo.tag)) {
            try {
                const { callKey: peerCallKey } = await decryptCallKeyInNode(
                    this.sock,
                    nodeInfo.innerNode,
                    peerJid,
                    this.logger.child({ component: 'signaling' })
                )
                if (peerCallKey) {
                    const ourCallKey = this.info.encryptionKey
                    const keysMatch = ourCallKey ? uint8Equal(ourCallKey, peerCallKey) : false
                    if (!keysMatch && ourCallKey) {
                        const meLid2 = this.sock.authState?.creds?.me?.lid
                        const meId2 = this.sock.authState?.creds?.me?.id
                        const ourCredJid2 = meLid2 || meId2 || ''
                        const ourBase2 = ourCredJid2.replace(/:\d+@/, '@')
                        const participants = this.info.relayData?.participantJids || []
                        const ourDeviceJid2 =
                            participants.find((jid) => {
                                const jBase = jid.replace(/:\d+@/, '@')
                                return jBase === ourBase2 && /:\d+@/.test(jid)
                            }) || ourCredJid2

                        if (ourDeviceJid2 && peerJid) {
                            try {
                                const sendKeying = await derivePerJidSrtpKey(
                                    ourCallKey,
                                    ourDeviceJid2
                                )
                                const recvKeying = await derivePerJidSrtpKey(peerCallKey, peerJid)
                                this.srtpSession = new SrtpSession(
                                    sendKeying,
                                    recvKeying,
                                    SRTP_SEND_AUTH_TAG_LEN,
                                    SRTP_RECV_AUTH_TAG_LEN
                                )
                                this.logger.debug('srtp re-initialized with peer call_key', {
                                    callId: this.info.callId
                                })
                            } catch (err: unknown) {
                                this.logger.error('per-jid srtp re-derivation failed', {
                                    message: err instanceof Error ? err.message : String(err)
                                })
                            }
                        }
                    }
                }
            } catch (err: unknown) {
                this.logger.error('accept decrypt error', {
                    message: err instanceof Error ? err.message : String(err)
                })
            }
        }

        try {
            this.info.applyTransition({ type: 'remote_accepted' })
            this.delegate.emitState(this.info)
        } catch {}

        const meId = this.sock.authState?.creds?.me?.id ?? ''
        const meLid = this.sock.authState?.creds?.me?.lid
        const ourJid = meLid || meId
        const ourBase = ourJid.replace(/:\d+@/, '@')
        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const acceptingDeviceJid = peerJid

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
        this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0)
        this.sctpRelay.resendSubscriptions()

        await this.initSrtpKeys()

        if (this.info.relayData?.participantJids) {
            const otherDevices = this.info.relayData.participantJids.filter((jid) => {
                if (jid === acceptingDeviceJid) return false
                const jidBase = jid.replace(/:\d+@/, '@')
                if (jidBase === ourBase) return false
                return true
            })

            for (const deviceJid of otherDevices) {
                try {
                    const terminateNode: BinaryNode = {
                        tag: 'call',
                        attrs: { to: deviceJid, id: generateCallStanzaId() },
                        content: [
                            {
                                tag: 'terminate',
                                attrs: {
                                    'call-id': callId,
                                    'call-creator': callCreator,
                                    reason: 'accepted_elsewhere'
                                }
                            }
                        ]
                    }
                    await this.sock.sendNode(terminateNode)
                } catch (err: unknown) {
                    if (this.debug) {
                        this.logger.error('error sending terminate_elsewhere', {
                            deviceJid,
                            message: err instanceof Error ? err.message : String(err)
                        })
                    }
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
            await this.sock.sendNode(transportNode)
        } catch (err: unknown) {
            if (this.debug) {
                this.logger.error('error sending transport', {
                    message: err instanceof Error ? err.message : String(err)
                })
            }
        }

        try {
            const muteNode = buildMuteV2Stanza(acceptingDeviceJid, callId, callCreator, 0, meId)
            await this.sock.sendNode(muteNode)
        } catch (err: unknown) {
            if (this.debug) {
                this.logger.error('error sending mute_v2', {
                    message: err instanceof Error ? err.message : String(err)
                })
            }
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
                await this.sock.sendNode(receiptNode)
            } catch (err: unknown) {
                if (this.debug) {
                    this.logger.error('error sending accept receipt', {
                        message: err instanceof Error ? err.message : String(err)
                    })
                }
            }
        }

        if (this.sctpRelay.hasConnection()) {
            try {
                this.info.applyTransition({ type: 'media_connected' })
                this.delegate.emitState(this.info)
                this.startMediaFlow()
            } catch {}
        } else if (this.info.relayData) {
            await this.connectRelays(this.info.relayData.endpoints)
        }
    }

    async handleCallPreaccept(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (this.info.direction === CallDirection.Outgoing && this.info.relayData) {
            const meId = this.sock.authState?.creds?.me?.id ?? ''
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
                    await this.sock.sendNode(relayLatencyNode)
                } catch (err: unknown) {
                    if (this.debug) {
                        this.logger.error('error sending relaylatency', {
                            relayName: name,
                            message: err instanceof Error ? err.message : String(err)
                        })
                    }
                }
            }

            if (!this.initialTransportSent) {
                try {
                    const basePeerJid = peerJid.replace(/:\d+@/, '@')
                    const transportNode = buildTransportStanza(
                        basePeerJid,
                        callId,
                        callCreator,
                        meId
                    )
                    await this.sock.sendNode(transportNode)
                    this.initialTransportSent = true
                } catch (err: unknown) {
                    if (this.debug) {
                        this.logger.error('error sending initial transport', {
                            message: err instanceof Error ? err.message : String(err)
                        })
                    }
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
                const meLid = this.sock.authState?.creds?.me?.lid
                const meId = this.sock.authState?.creds?.me?.id
                const ourCredJid = meLid || meId || ''
                const ourBase = ourCredJid.replace(/:\d+@/, '@')

                const ourDeviceJid = this.ensureDeviceJid(
                    participantJids.find((jid) => {
                        const jidBase = jid.replace(/:\d+@/, '@')
                        return jidBase === ourBase && /:\d+@/.test(jid)
                    }) || ourCredJid
                )

                const peerJids = participantJids.filter((jid) => {
                    const jidBase = jid.replace(/:\d+@/, '@')
                    return jidBase !== ourBase
                })
                const peerDeviceJid = peerJids[0] ? this.ensureDeviceJid(peerJids[0]) : undefined

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
                    await this.initSrtpKeys()
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
                    await this.sock.sendNode(preacceptNode)
                    this.outgoingPreacceptSent = true
                } catch (err: unknown) {
                    if (this.debug) {
                        this.logger.error('error sending preaccept (caller)', {
                            message: err instanceof Error ? err.message : String(err)
                        })
                    }
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

        const teNodes: BinaryNode[] = []
        if (Array.isArray(inner.content)) {
            for (const child of inner.content) {
                if (typeof child === 'object' && 'tag' in child && child.tag === 'te') {
                    teNodes.push(child as BinaryNode)
                }
            }
        }

        if (teNodes.length === 0) return

        const destinationJids = this.info.relayData?.participantJids || []
        if (destinationJids.length > 0) {
            const peerBaseJid = peerJid.replace(/:\d+@/, '@')
            const destinationContent: BinaryNode[] = destinationJids.map((jid) => ({
                tag: 'to',
                attrs: { jid },
                content: undefined
            }))

            const forwardNode: BinaryNode = {
                tag: 'call',
                attrs: { to: peerBaseJid, id: generateCallStanzaId() },
                content: [
                    {
                        tag: 'relaylatency',
                        attrs: { 'call-id': callId, 'call-creator': callCreator },
                        content: [
                            ...teNodes,
                            { tag: 'destination', attrs: {}, content: destinationContent }
                        ]
                    }
                ]
            }

            try {
                await this.sock.sendNode(forwardNode)
            } catch (err: unknown) {
                if (this.debug) {
                    this.logger.error('error forwarding relaylatency', {
                        message: err instanceof Error ? err.message : String(err)
                    })
                }
            }
        }
    }

    handleRelayElection(node: BinaryNode): void {
        const inner = Array.isArray(node.content) ? (node.content[0] as BinaryNode) : null
        if (!inner) return

        let electedRelayIdx: number | undefined
        if (inner.attrs?.['elected_relay_idx'] !== undefined) {
            electedRelayIdx = parseInt(inner.attrs['elected_relay_idx'])
        } else if (inner.attrs?.['relay_id'] !== undefined) {
            electedRelayIdx = parseInt(inner.attrs['relay_id'])
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

        const meId = this.sock.authState?.creds?.me?.id ?? ''
        const callId = this.info.callId
        const callCreator = this.info.callCreator

        try {
            const muteNode = buildMuteV2Stanza(peerJid, callId, callCreator, 0, meId)
            await this.sock.sendNode(muteNode)
        } catch (err: unknown) {
            if (this.debug) {
                this.logger.error('error sending mute_v2 response', {
                    message: err instanceof Error ? err.message : String(err)
                })
            }
        }
    }

    handleCallTerminate(): void {
        try {
            this.info.applyTransition({
                type: 'terminated',
                reason: EndCallReason.UserEnded
            })
        } catch {}

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
                    message: err instanceof Error ? err.message : String(err)
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
        this.sctpRelay.cleanup()

        if (this.opusCodec) {
            this.opusCodec.destroy()
            this.opusCodec = null
        }

        this.rtpSession = null
        this.srtpSession = null

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
                rtpPacket.header.extensionData = CallMediaSession.EMPTY_BYTES
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
                message: err instanceof Error ? err.message : String(err)
            })
        }
    }

    private ensureDeviceJid(jid: string): string {
        if (/:\d+@/.test(jid)) return jid
        return jid.replace('@', ':0@')
    }

    private async initSrtpKeys(): Promise<void> {
        const callKey = this.info.encryptionKey
        if (!callKey) {
            this.logger.debug('no call_key, srtp not initialized', { callId: this.info.callId })
            return
        }

        const meLid = this.sock.authState?.creds?.me?.lid
        const meId = this.sock.authState?.creds?.me?.id
        const ourCredJid = meLid || meId || ''
        const ourBase = ourCredJid.replace(/:\d+@/, '@')
        const participants = this.info.relayData?.participantJids || []

        const ourDeviceJid = this.ensureDeviceJid(
            participants.find((jid) => {
                const jBase = jid.replace(/:\d+@/, '@')
                return jBase === ourBase && /:\d+@/.test(jid)
            }) || ourCredJid
        )

        let rawPeerJid = this.acceptedByJid || this.info.peerJid
        if (!this.acceptedByJid) {
            const peerFromParticipants = participants.find((jid) => {
                const jBase = jid.replace(/:\d+@/, '@')
                return jBase !== ourBase
            })
            if (peerFromParticipants) rawPeerJid = peerFromParticipants
        }
        const peerDeviceJid = this.ensureDeviceJid(rawPeerJid)

        try {
            const [sendKeying, recvKeying] = await Promise.all([
                derivePerJidSrtpKey(callKey, ourDeviceJid),
                derivePerJidSrtpKey(callKey, peerDeviceJid)
            ])

            this.srtpSession = new SrtpSession(
                sendKeying,
                recvKeying,
                SRTP_SEND_AUTH_TAG_LEN,
                SRTP_RECV_AUTH_TAG_LEN
            )
            this.logger.debug('srtp per-jid keys initialized', {
                callId: this.info.callId,
                sendJid: ourDeviceJid,
                recvJid: peerDeviceJid
            })
        } catch (err: unknown) {
            this.logger.debug('srtp key derivation failed', {
                callId: this.info.callId,
                message: err instanceof Error ? err.message : String(err)
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
            } catch {}
        }
    }

    private onRelayData(data: Uint8Array): void {
        this.relayPacketCount++

        if (isStunPacket(data)) {
            this.stunResponseCount++
            return
        }

        if (!isRtpPacket(data)) return

        const pt = data[1] & 0x7f
        if (!this.srtpSession || !this.opusCodec) return
        if (pt !== 120) return

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
                const ssrc = readUInt32BE(data, 8)
                this.logger.debug('srtp recv error', {
                    callId: this.info.callId,
                    errorCount: this.srtpErrorCount,
                    message: err instanceof Error ? err.message : String(err),
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

        const WA_RELAY_PORT = 3478
        const relays = uniqueEndpoints
            .filter((ep) => ep.key && ep.rawToken)
            .map((ep) => ({
                ip: ep.ip,
                port: WA_RELAY_PORT,
                token: ep.token,
                authToken: ep.authToken,
                rawAuthToken: ep.rawAuthToken,
                rawToken: ep.rawToken,
                key: ep.key,
                relayId: ep.relayId,
                name: ep.relayName || `${ep.ip}:${WA_RELAY_PORT}`,
                authTokenId: ep.authTokenId
            }))

        if (relays.length === 0) {
            this.logger.error('no relay configs', { callId: this.info.callId })
            return
        }

        this.sctpRelay.setSsrc(this.selfSsrc)
        this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0)

        try {
            await this.sctpRelay.configureRelays(relays)
            this.logger.debug('sctp relays configured', {
                callId: this.info.callId,
                connected: this.sctpRelay.getConnectedCount()
            })
        } catch (err: unknown) {
            this.logger.error('sctp relay error', {
                callId: this.info.callId,
                message: err instanceof Error ? err.message : String(err)
            })
        }
    }

    private startMediaFlow(): void {
        this.resetEncodeState()
        this.audioEngine.startPlayback()
        this.audioEngine.startCapture()
    }
}
