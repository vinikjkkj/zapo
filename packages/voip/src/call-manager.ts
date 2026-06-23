import { EventEmitter } from 'node:events'

import { createNoopLogger, type Logger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import { AudioEngine } from './audio-engine.js'
import { CallInfo } from './call-state.js'
import { derivePerJidSrtpKey, generateCallKey } from './encryption.js'
import { MLowCodec } from './mlow-codec.js'
import { parseRelayFromAck } from './relay-ack.js'
import { RtpSession } from './rtp.js'
import { NodeSctpRelayManager } from './sctp-relay.js'
import {
    buildAcceptReceiptStanza,
    buildAcceptStanza,
    buildMuteV2Stanza,
    buildOfferStanza,
    buildPreacceptStanza,
    buildRejectStanza,
    buildRelayLatencyStanza,
    buildTerminateStanza,
    buildTransportStanza,
    decryptCallKeyInNode,
    extractNodeInfo,
    extractRelayEndpoints,
    generateCallId,
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
    type CallOfferOptions,
    CallState,
    EndCallReason,
    type RelayEndpoint,
    SRTP_AUTH_TAG_LEN,
    SRTP_RECV_AUTH_TAG_LEN,
    SRTP_SEND_AUTH_TAG_LEN
} from './types.js'
import type { VoipSocket } from './voip-socket.js'

export interface NativeCallManagerConfig {
    sock: VoipSocket
    logger?: Logger
    debug?: boolean
}

export class NativeCallManager extends EventEmitter implements AudioSender {
    private sock: VoipSocket
    private logger: Logger
    private debug: boolean

    private currentCall: CallInfo | null = null

    private rtpSession: RtpSession | null = null
    private srtpSession: SrtpSession | null = null
    private opusCodec: MLowCodec | null = null
    private sctpRelay: NodeSctpRelayManager
    private audioEngine: AudioEngine
    private initialTransportSent = false
    private outgoingPreacceptSent = false

    private selfSsrc = 0
    private peerSsrcs: number[] = []

    private firstPacketSent = false

    private acceptedByJid: string | null = null

    private debeEnabled = true

    constructor(config: NativeCallManagerConfig) {
        super()
        this.sock = config.sock
        this.logger = config.logger ?? createNoopLogger()
        this.debug = config.debug ?? false

        this.sctpRelay = new NodeSctpRelayManager()

        this.audioEngine = new AudioEngine()
        this.audioEngine.setDebug(this.debug)
        this.audioEngine.setAudioSender(this)

        this.sctpRelay.on('relay:connected', (info: { ip: string; port: number }) => {
            this.onRelayConnected(info.ip, info.port)
        })
        this.sctpRelay.on(
            'relay:receive',
            (info: { ip: string; port: number; data: Uint8Array }) => {
                this.onRelayData(info.data)
            }
        )
    }

    async startCall(options: CallOfferOptions): Promise<string> {
        if (this.currentCall && !this.currentCall.isEnded) {
            throw new Error('A call is already in progress')
        }

        const callId = generateCallId()
        const mediaType = options.isVideo ? CallMediaType.Video : CallMediaType.Audio
        const meLid = this.sock.authState?.creds?.me?.lid
        const meId = this.sock.authState?.creds?.me?.id
        const callCreator = meLid || meId || ''
        const peerJid = await this.resolvePeerLid(options.peerJid)

        this.currentCall = CallInfo.newOutgoing(callId, peerJid, callCreator, mediaType)
        this.initialTransportSent = false
        this.outgoingPreacceptSent = false

        const callKey = generateCallKey()
        this.currentCall.encryptionKey = callKey

        const selfLid = this.sock.authState?.creds?.me?.lid || this.sock.user?.lid || meId || ''
        const ssrc = generateSecureSsrc(callId, selfLid)
        this.rtpSession = RtpSession.whatsappOpus(ssrc)
        this.selfSsrc = ssrc

        const peerSsrc = generateSecureSsrc(callId, peerJid)
        this.peerSsrcs = [peerSsrc]

        if (this.debug) {
            this.logger.debug(
                `[CallManager] Created call ${callId}, creator: ${callCreator}, peer: ${peerJid}`
            )
            this.logger.debug(
                `[CallManager] Our SSRC: 0x${ssrc.toString(16).toUpperCase()} Peer SSRC: 0x${peerSsrc.toString(16).toUpperCase()}`
            )
        }

        this.opusCodec = new MLowCodec()

        if (!this.audioEngine.hasAudio()) {
            this.logger.debug('[CallManager] No audio loaded — use "audio <path>" to load')
        }

        const offerStanza = await buildOfferStanza(
            this.sock,
            callId,
            callKey,
            peerJid,
            [],
            options.isVideo ?? false
        )

        await this.sock.sendNode(offerStanza)

        this.currentCall.applyTransition({ type: 'offer_sent' })
        this.emitState()

        if (this.debug) {
            this.logger.debug(`[CallManager] Offer sent, state → Ringing`)
        }

        return callId
    }

    async acceptCall(callId: string): Promise<void> {
        if (!this.currentCall || this.currentCall.callId !== callId) {
            throw new Error(`No incoming call with id ${callId}`)
        }

        if (!this.currentCall.canAccept) {
            throw new Error(
                `Call ${callId} cannot be accepted in state ${this.currentCall.stateData.state}`
            )
        }

        this.currentCall.applyTransition({ type: 'local_accepted' })
        this.emitState()

        if (this.currentCall.encryptionKey) {
            const isVideo = this.currentCall.mediaType === CallMediaType.Video
            const acceptStanza = await buildAcceptStanza(
                this.sock,
                this.currentCall.callId,
                this.currentCall.encryptionKey,
                this.currentCall.peerJid,
                this.currentCall.callCreator,
                isVideo
            )

            try {
                await this.sock.query(acceptStanza)
            } catch (err: any) {
                if (this.debug)
                    this.logger.error(`[CallManager] Accept query error: ${err.message}`)
            }
        }

        if (this.currentCall.relayData) {
            await this.connectRelays(this.currentCall.relayData.endpoints)
        }

        if (this.debug) this.logger.debug(`[CallManager] Call accepted: ${callId}`)
    }

    async rejectCall(
        callId: string,
        reason: EndCallReason = EndCallReason.Declined
    ): Promise<void> {
        if (!this.currentCall || this.currentCall.callId !== callId) {
            throw new Error(`No call with id ${callId}`)
        }

        this.currentCall.applyTransition({ type: 'local_rejected', reason })

        const node = buildRejectStanza(
            this.currentCall.peerJid,
            this.currentCall.callId,
            this.currentCall.callCreator
        )
        this.sock.query(node).catch(() => {})
        this.emitState()
        this.cleanupMedia()
    }

    async endCall(reason: EndCallReason = EndCallReason.UserEnded): Promise<void> {
        if (!this.currentCall || this.currentCall.isEnded) return

        this.currentCall.applyTransition({ type: 'terminated', reason })

        const node = buildTerminateStanza(
            this.currentCall.peerJid,
            this.currentCall.callId,
            this.currentCall.callCreator
        )
        this.sock.query(node).catch(() => {})
        this.emit('call:ended', this.currentCall)
        this.emitState()
        this.cleanupMedia()
    }

    setMute(muted: boolean): void {
        if (!this.currentCall?.isActive) return

        this.currentCall.applyTransition({ type: 'audio_mute_changed', muted })
        this.emitState()

        if (muted) {
            this.audioEngine.stopCapture()
        } else {
            this.audioEngine.startCapture()
        }
    }

    async loadAudio(audioPath: string): Promise<void> {
        await this.audioEngine.loadAudioFile(audioPath)
        this.resetEncodeState()
        this.logger.debug(`[CallManager] Audio loaded → sending encoded Opus`)
    }

    setExternalAudioMode(enabled: boolean): void {
        this.audioEngine.setExternalMode(enabled)
        if (enabled) {
            this.resetEncodeState()
            this.logger.debug(`[CallManager] External audio mode enabled (live call)`)
        }
    }

    feedExternalAudio(data: Float32Array): void {
        this.audioEngine.feedExternalAudio(data)
    }

    feedLiveAudio(data: Float32Array): void {
        this.audioEngine.feedExternalAudio(data)
    }

    getCurrentCall(): CallInfo | null {
        return this.currentCall
    }

    async handleCallOffer(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const callId = nodeInfo.callId
        const callCreator = nodeInfo.innerNode.attrs?.['call-creator'] || peerJid
        const isVideo = this.hasVideoNode(nodeInfo.innerNode)

        const { node: decryptedNode, callKey } = await decryptCallKeyInNode(
            this.sock,
            nodeInfo.innerNode,
            peerJid
        )

        const relays = extractRelayEndpoints(decryptedNode)

        const mediaType = isVideo ? CallMediaType.Video : CallMediaType.Audio
        this.currentCall = CallInfo.newIncoming(callId, peerJid, callCreator, undefined, mediaType)
        this.initialTransportSent = false

        if (callKey) {
            this.currentCall.encryptionKey = callKey
        }

        if (relays.length > 0) {
            this.currentCall.relayData = { endpoints: relays }
        }

        const meId = this.sock.authState?.creds?.me?.id
        const meLid = this.sock.authState?.creds?.me?.lid || this.sock.user?.lid
        const selfLid = meLid || meId || ''
        const ssrc = generateSecureSsrc(callId, selfLid)
        this.rtpSession = RtpSession.whatsappOpus(ssrc)
        this.selfSsrc = ssrc

        const peerSsrc = generateSecureSsrc(callId, peerJid)
        this.peerSsrcs = [peerSsrc]

        this.opusCodec = new MLowCodec()

        if (!this.audioEngine.hasAudio()) {
            this.logger.debug('[CallManager] No audio loaded — use "audio <path>" to load')
        }

        try {
            const preacceptNode = buildPreacceptStanza(peerJid, callId, callCreator)
            await this.sock.sendNode(preacceptNode)
        } catch (err: any) {
            if (this.debug)
                this.logger.error(`[CallManager] Error sending preaccept: ${err.message}`)
        }

        this.emit('call:incoming', this.currentCall)
        this.emitState()

        if (this.debug) {
            this.logger.debug(
                `[CallManager] Incoming call: ${callId} from ${peerJid} (creator=${callCreator}, video=${isVideo}, relays=${relays.length})`
            )
        }
    }

    async handleCallAccept(node: BinaryNode, peerJid: string): Promise<void> {
        if (!this.currentCall) return

        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (needsDecryption(nodeInfo.tag)) {
            try {
                const { callKey: peerCallKey } = await decryptCallKeyInNode(
                    this.sock,
                    nodeInfo.innerNode,
                    peerJid
                )
                if (peerCallKey) {
                    const ourCallKey = this.currentCall.encryptionKey
                    const keysMatch = ourCallKey ? ourCallKey.equals(peerCallKey) : false
                    if (!keysMatch && ourCallKey) {
                        const meLid2 = this.sock.authState?.creds?.me?.lid
                        const meId2 = this.sock.authState?.creds?.me?.id
                        const ourCredJid2 = meLid2 || meId2 || ''
                        const ourBase2 = ourCredJid2.replace(/:\d+@/, '@')
                        const participants = this.currentCall.relayData?.participantJids || []
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
                                this.logger.debug(
                                    `[CallManager] SRTP re-initialized with peer's call_key`
                                )
                            } catch (err: any) {
                                this.logger.error(
                                    `[CallManager] Per-JID SRTP re-derivation failed: ${err.message}`
                                )
                            }
                        }
                    }
                }
            } catch (err: any) {
                this.logger.error(`[CallManager] Accept decrypt error: ${err.message}`)
            }
        }

        try {
            this.currentCall.applyTransition({ type: 'remote_accepted' })
            this.emitState()
        } catch {}

        const meId = this.sock.authState?.creds?.me?.id ?? ''
        const meLid = this.sock.authState?.creds?.me?.lid
        const ourJid = meLid || meId
        const ourBase = ourJid.replace(/:\d+@/, '@')
        const callId = this.currentCall.callId
        const callCreator = this.currentCall.callCreator
        const acceptingDeviceJid = peerJid

        this.acceptedByJid = acceptingDeviceJid

        if (this.currentCall) {
            if (this.actualPeerSsrc !== null) {
                const calculatedJid = this.ensureDeviceJid(acceptingDeviceJid)
                this.logger.debug(
                    `[CallManager] Accept: keeping actual peer SSRC=0x${this.actualPeerSsrc.toString(16)} (calculated for ${calculatedJid} would be 0x${generateSecureSsrc(callId, calculatedJid).toString(16)})`
                )
            } else {
                const peerDeviceJidForSsrc = this.ensureDeviceJid(acceptingDeviceJid)
                const acceptSsrc = generateSecureSsrc(callId, peerDeviceJidForSsrc)
                this.peerSsrcs = [acceptSsrc]
                this.logger.debug(
                    `[CallManager] Accept SSRC: jid=${peerDeviceJidForSsrc} ssrc=0x${acceptSsrc.toString(16)}`
                )
            }
            this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0)
            this.sctpRelay.resendSubscriptions()

            await this.initSrtpKeys()
        }

        if (this.currentCall.relayData?.participantJids) {
            const otherDevices = this.currentCall.relayData.participantJids.filter((jid) => {
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
                } catch (err: any) {
                    if (this.debug)
                        this.logger.error(
                            `[CallManager] Error sending terminate_elsewhere to ${deviceJid}: ${err.message}`
                        )
                }
            }
        }

        try {
            const transportNode: BinaryNode = {
                tag: 'call',
                attrs: { to: acceptingDeviceJid, id: generateCallStanzaId() },
                content: [
                    {
                        tag: 'transport',
                        attrs: {
                            'call-id': callId,
                            'call-creator': callCreator,
                            'transport-message-type': '1',
                            'p2p-cand-round': '1'
                        },
                        content: [
                            {
                                tag: 'net',
                                attrs: { medium: '2', protocol: '0' },
                                content: undefined
                            }
                        ]
                    }
                ]
            }
            await this.sock.sendNode(transportNode)
        } catch (err: any) {
            if (this.debug)
                this.logger.error(`[CallManager] Error sending transport: ${err.message}`)
        }

        try {
            const muteNode = buildMuteV2Stanza(acceptingDeviceJid, callId, callCreator, 0, meId)
            await this.sock.sendNode(muteNode)
        } catch (err: any) {
            if (this.debug) this.logger.error(`[CallManager] Error sending mute_v2: ${err.message}`)
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
            } catch (err: any) {
                if (this.debug)
                    this.logger.error(`[CallManager] Error sending accept receipt: ${err.message}`)
            }
        }

        if (this.sctpRelay.hasConnection()) {
            try {
                this.currentCall.applyTransition({ type: 'media_connected' })
                this.emitState()
                this.startMediaFlow()
            } catch {}
        } else {
            if (this.currentCall.relayData) {
                await this.connectRelays(this.currentCall.relayData.endpoints)
            }
        }
    }

    async handleCallPreaccept(node: BinaryNode, peerJid: string): Promise<void> {
        if (!this.currentCall) return

        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        if (this.currentCall.direction === CallDirection.Outgoing && this.currentCall.relayData) {
            const meId = this.sock.authState?.creds?.me?.id ?? ''
            const callId = this.currentCall.callId
            const callCreator = this.currentCall.callCreator

            const destinationJids = this.currentCall.relayData.participantJids || []
            const seenRelayNames = new Set<string>()

            for (const ep of this.currentCall.relayData.endpoints) {
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
                        this.currentCall.peerJid,
                        callId,
                        callCreator,
                        relayData,
                        destinationJids,
                        meId
                    )
                    await this.sock.sendNode(relayLatencyNode)
                } catch (err: any) {
                    if (this.debug)
                        this.logger.error(
                            `[CallManager] Error sending relaylatency for ${name}: ${err.message}`
                        )
                }
            }

            if (!this.initialTransportSent) {
                try {
                    const transportNode = buildTransportStanza(peerJid, callId, callCreator, meId)
                    await this.sock.sendNode(transportNode)
                    this.initialTransportSent = true
                } catch (err: any) {
                    if (this.debug)
                        this.logger.error(
                            `[CallManager] Error sending initial transport: ${err.message}`
                        )
                }
            }
        }
    }

    async handleCallTransport(node: BinaryNode, _peerJid: string): Promise<void> {
        if (!this.currentCall) return

        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const relays = extractRelayEndpoints(nodeInfo.innerNode)
        if (relays.length > 0 && !this.sctpRelay.hasConnection()) {
            this.currentCall.relayData = {
                ...this.currentCall.relayData,
                endpoints: relays
            }
            await this.connectRelays(relays)
        }
    }

    async handleCallAck(node: BinaryNode): Promise<void> {
        if (!this.currentCall) return

        const ackType = node.attrs?.type
        if (ackType !== 'offer') return

        const error = node.attrs?.error
        if (error) {
            this.logger.error(`[CallManager] ACK error: ${error}`)
            return
        }

        const { relays, participantJids, uuid, selfPid, peerPid, hbhKey } = parseRelayFromAck(node)

        if (relays.length > 0) {
            this.currentCall.relayData = {
                endpoints: relays,
                participantJids,
                uuid,
                selfPid,
                peerPid,
                hbhKey
            }

            this.logger.debug(
                `[ACK] relays=${relays.length} participants=${participantJids.join(',')} selfPid=${selfPid} peerPid=${peerPid}`
            )

            const callKey = this.currentCall.encryptionKey
            if (participantJids.length > 0 && this.currentCall) {
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

                const newSelfSsrc = generateSecureSsrc(this.currentCall.callId, ourDeviceJid)
                if (newSelfSsrc !== this.selfSsrc) {
                    this.selfSsrc = newSelfSsrc
                    this.rtpSession = RtpSession.whatsappOpus(newSelfSsrc)
                }

                if (peerDeviceJid) {
                    const peerDeviceSsrc = generateSecureSsrc(
                        this.currentCall.callId,
                        peerDeviceJid
                    )
                    this.peerSsrcs = [peerDeviceSsrc]
                }

                if (callKey) {
                    await this.initSrtpKeys()
                } else {
                    this.logger.debug(`[CallManager] WARNING: No call_key — SRTP not initialized!`)
                }
            }

            if (this.currentCall.isInitiator && !this.outgoingPreacceptSent) {
                try {
                    const preacceptNode = buildPreacceptStanza(
                        this.currentCall.peerJid,
                        this.currentCall.callId,
                        this.currentCall.callCreator
                    )
                    await this.sock.sendNode(preacceptNode)
                    this.outgoingPreacceptSent = true
                } catch (err: any) {
                    if (this.debug)
                        this.logger.error(
                            `[CallManager] Error sending preaccept (caller): ${err.message}`
                        )
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
        if (!this.currentCall) return

        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const inner = nodeInfo.innerNode
        const callId = inner.attrs?.['call-id'] || this.currentCall.callId
        const callCreator = inner.attrs?.['call-creator'] || this.currentCall.callCreator

        const teNodes: BinaryNode[] = []
        if (Array.isArray(inner.content)) {
            for (const child of inner.content) {
                if (typeof child === 'object' && 'tag' in child && child.tag === 'te') {
                    teNodes.push(child as BinaryNode)
                }
            }
        }

        if (teNodes.length === 0) return

        const destinationJids = this.currentCall.relayData?.participantJids || []
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
            } catch (err: any) {
                if (this.debug)
                    this.logger.error(`[CallManager] Error forwarding relaylatency: ${err.message}`)
            }
        }
    }

    handleRelayElection(node: BinaryNode): void {
        if (!this.currentCall) return

        const inner = Array.isArray(node.content) ? (node.content[0] as BinaryNode) : null
        if (!inner) return

        let electedRelayIdx: number | undefined
        if (inner.attrs?.['elected_relay_idx'] !== undefined) {
            electedRelayIdx = parseInt(inner.attrs['elected_relay_idx'])
        } else if (inner.attrs?.['relay_id'] !== undefined) {
            electedRelayIdx = parseInt(inner.attrs['relay_id'])
        } else if (Buffer.isBuffer(inner.content)) {
            const bytes = inner.content
            if (bytes.length >= 4) electedRelayIdx = bytes.readUInt32BE(0)
            else if (bytes.length > 0) electedRelayIdx = bytes[0]
        }

        if (electedRelayIdx !== undefined) {
            this.currentCall.electedRelayIdx = electedRelayIdx
            this.logger.debug(`[CallManager] Elected relay index: ${electedRelayIdx}`)
        }
    }

    async handleCallMuteV2(node: BinaryNode, peerJid: string): Promise<void> {
        if (!this.currentCall) return

        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const meId = this.sock.authState?.creds?.me?.id ?? ''
        const callId = this.currentCall.callId
        const callCreator = this.currentCall.callCreator

        try {
            const muteNode = buildMuteV2Stanza(peerJid, callId, callCreator, 0, meId)
            await this.sock.sendNode(muteNode)
        } catch (err: any) {
            if (this.debug)
                this.logger.error(`[CallManager] Error sending mute_v2 response: ${err.message}`)
        }
    }

    handleCallTerminate(node: BinaryNode): void {
        if (!this.currentCall) return

        try {
            this.currentCall.applyTransition({
                type: 'terminated',
                reason: EndCallReason.UserEnded
            })
        } catch {}

        this.emit('call:ended', this.currentCall)
        this.emitState()
        this.cleanupMedia()
    }

    private audioSendCount = 0
    private audioDropCount = 0
    private realAudioSendCount = 0

    private static readonly EMPTY_BUFFER = Buffer.alloc(0)

    private encodeBufferA: Float32Array | null = null
    private encodeBufferB: Float32Array | null = null
    private encodeBuffer: Float32Array | null = null
    private encodeBufferPos = 0

    private authPaddingBuffer: Buffer | null = null

    private get encodeFrameSamples(): number {
        return this.opusCodec?.getFrameSize() ?? 960
    }

    private get rtpTsDelta(): number {
        return this.encodeFrameSamples
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
                this.logger.debug(
                    `[CallManager] Audio dropped #${this.audioDropCount} — missing: ${missing}`
                )
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

                if (this.realAudioSendCount < 3) {
                    const toc = opusFrame[0]
                    const config = (toc >> 3) & 0x1f
                    this.logger.debug(
                        `[ENCODE] #${this.realAudioSendCount + 1}: ${opusFrame.length}B cfg=${config} (${(frameSamples / 16000) * 1000}ms)`
                    )
                }

                this.sendOpusFrame(opusFrame, false)
                this.realAudioSendCount++

                if (this.realAudioSendCount % 500 === 0) {
                    this.logger.debug(
                        `[ENCODE] #${this.realAudioSendCount}: opus=${opusFrame.length}B`
                    )
                }
            } catch (err: any) {
                this.logger.error(`[ENCODE] Error: ${err.message}`)
            }
        }
    }

    private sendOpusFrame(opusFrame: Buffer, isSilence: boolean): void {
        if (!this.rtpSession || !this.srtpSession) return

        try {
            let rtpPayload: Buffer = opusFrame

            const authPadding = SRTP_AUTH_TAG_LEN - SRTP_SEND_AUTH_TAG_LEN
            if (authPadding > 0) {
                if (!this.authPaddingBuffer || this.authPaddingBuffer.length !== authPadding) {
                    this.authPaddingBuffer = Buffer.alloc(authPadding)
                }
                rtpPayload = Buffer.concat([rtpPayload, this.authPaddingBuffer])
            }

            const marker = !this.firstPacketSent
            const tsDelta = this.rtpTsDelta
            const rtpPacket = this.rtpSession.createPacketWithDuration(rtpPayload, tsDelta, marker)

            if (this.debeEnabled) {
                rtpPacket.header.extension = true
                rtpPacket.header.extensionProfile = 0xdebe
                rtpPacket.header.extensionData = NativeCallManager.EMPTY_BUFFER
            }

            if (!this.firstPacketSent) {
                this.firstPacketSent = true
                this.logger.debug(
                    `[SEND] First packet marker=true debe=${this.debeEnabled} ts_delta=${tsDelta} authPad=${authPadding}`
                )
            }

            const srtpData = this.srtpSession.protect(rtpPacket)
            const srtpBuf = Buffer.from(srtpData)

            const srtpArrayBuf = srtpBuf.buffer.slice(
                srtpBuf.byteOffset,
                srtpBuf.byteOffset + srtpBuf.byteLength
            )
            this.sctpRelay.broadcast(srtpArrayBuf)

            this.audioSendCount++
            if (this.audioSendCount === 1 || this.audioSendCount % 500 === 0) {
                this.logger.debug(
                    `[SEND] #${this.audioSendCount}: opus=${opusFrame.length}B SRTP=${srtpBuf.length}B SCTP(${this.sctpRelay.getConnectedCount()}) ${isSilence ? '(silence)' : `(${tsDelta / 16}ms)`}`
                )
            }
        } catch (err: any) {
            this.logger.error(`[CallManager] Error sending audio: ${err.message}`)
        }
    }

    private ensureDeviceJid(jid: string): string {
        if (/:\d+@/.test(jid)) return jid
        return jid.replace('@', ':0@')
    }

    private async initSrtpKeys(): Promise<void> {
        if (!this.currentCall) return

        const callKey = this.currentCall.encryptionKey
        if (!callKey) {
            this.logger.debug(`[SRTP] No call_key — SRTP not initialized!`)
            return
        }

        const meLid = this.sock.authState?.creds?.me?.lid
        const meId = this.sock.authState?.creds?.me?.id
        const ourCredJid = meLid || meId || ''
        const ourBase = ourCredJid.replace(/:\d+@/, '@')
        const participants = this.currentCall.relayData?.participantJids || []

        const ourDeviceJid = this.ensureDeviceJid(
            participants.find((jid) => {
                const jBase = jid.replace(/:\d+@/, '@')
                return jBase === ourBase && /:\d+@/.test(jid)
            }) || ourCredJid
        )

        let rawPeerJid = this.acceptedByJid || this.currentCall.peerJid
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
            this.logger.debug(
                `[SRTP] Per-JID mode: send=${ourDeviceJid} recv=${peerDeviceJid} sendAuth=${SRTP_SEND_AUTH_TAG_LEN} recvAuth=${SRTP_RECV_AUTH_TAG_LEN}`
            )
        } catch (err: any) {
            this.logger.debug(`[SRTP] Key derivation failed: ${err.message}`)
        }
    }

    private resetEncodeState(): void {
        this.encodeBuffer = null
        this.encodeBufferPos = 0
        this.realAudioSendCount = 0
    }

    private onRelayConnected(_relayIp: string, _relayPort: number): void {
        if (!this.currentCall) return

        if (this.currentCall.stateData.state === CallState.Connecting) {
            try {
                this.currentCall.applyTransition({ type: 'media_connected' })
                this.emitState()
                this.startMediaFlow()
                this.logger.debug('[CallManager] Relay connected + call accepted → Active')
            } catch {}
        }
    }

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
                if (this.selfEchoCount <= 3 || this.selfEchoCount % 200 === 0) {
                    this.logger.debug(
                        `[RECV] Skipping self-echo #${this.selfEchoCount}: ssrc=0x${ssrc.toString(16)} (${data.length}B)`
                    )
                }
                return
            }

            if (!this.ssrcResubscribed && this.actualPeerSsrc === null) {
                this.actualPeerSsrc = ssrc
                const knownSsrc = this.peerSsrcs.includes(ssrc)
                if (!knownSsrc) {
                    this.logger.debug(
                        `[RECV] Peer actual SSRC=0x${ssrc.toString(16)} does NOT match calculated peerSsrcs=[${this.peerSsrcs.map((s) => '0x' + s.toString(16))}] — re-subscribing relay`
                    )
                    this.peerSsrcs = [ssrc]
                    this.ssrcResubscribed = true
                    this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0)
                    this.sctpRelay.resendSubscriptions()
                } else {
                    this.logger.debug(
                        `[RECV] Peer actual SSRC=0x${ssrc.toString(16)} matches calculated — no re-subscribe needed`
                    )
                }
            }
        }

        const buf = Buffer.from(data)

        if (this.audioRecvCount === 0) {
            const ssrc = buf.readUInt32BE(8)
            const ext = ((data[0] >> 4) & 0x01) !== 0
            const csrc = data[0] & 0x0f
            this.logger.debug(
                `[RECV] First RTP: ${data.length}B ssrc=0x${ssrc.toString(16)} ext=${ext} csrc=${csrc} selfSsrc=0x${this.selfSsrc.toString(16)} peerSsrcs=[${this.peerSsrcs.map((s) => '0x' + s.toString(16))}]`
            )
        }

        try {
            const rtpPacket = this.srtpSession.unprotect(Buffer.from(data))
            const opusPayload = rtpPacket.payload

            this.audioRecvCount++

            if (opusPayload.length === 0) return

            const seq = rtpPacket.header.sequenceNumber
            if (this.lastRecvSeq >= 0) {
                const expected = (this.lastRecvSeq + 1) & 0xffff
                if (seq !== expected) {
                    const gap = ((seq - this.lastRecvSeq + 65536) % 65536) - 1
                    this.recvSeqGaps += gap
                    if (this.audioRecvCount <= 20 || this.recvSeqGaps <= 10) {
                        this.logger.debug(
                            `[RECV] seq gap: expected=${expected} got=${seq} (${gap} packets lost)`
                        )
                    }
                }
            }
            this.lastRecvSeq = seq

            const isDtx = opusPayload.length <= 2
            if (isDtx) this.recvDtxCount++
            else this.recvRealCount++

            const hexDump =
                this.audioRecvCount <= 30
                    ? Buffer.from(opusPayload).subarray(0, 8).toString('hex')
                    : ''

            const statsBefore = this.opusCodec.getStats()
            let audioData = this.opusCodec.decode(opusPayload)
            const statsAfter = this.opusCodec.getStats()
            const decodeOk = statsAfter.success > statsBefore.success

            if (this.audioRecvCount <= 30) {
                let rms = 0
                let peak = 0
                if (!isDtx) {
                    let sum = 0
                    for (let i = 0; i < audioData.length; i++) {
                        const v = Math.abs(audioData[i])
                        sum += audioData[i] * audioData[i]
                        if (v > peak) peak = v
                    }
                    rms = Math.sqrt(sum / audioData.length)
                }
                this.logger.debug(
                    `[RECV] #${this.audioRecvCount}: ${data.length}B opus=${opusPayload.length}B seq=${seq} ${isDtx ? 'DTX' : 'REAL'} decode=${decodeOk ? 'OK' : 'ERR'} samples=${audioData.length} rms=${rms.toFixed(4)} peak=${peak.toFixed(4)} hex=${hexDump}`
                )
            }

            if (audioData.length > 0 && audioData.length < 960) {
                const padded = new Float32Array(960)
                padded.set(audioData)
                audioData = padded
            }

            this.audioEngine.onPlaybackData(audioData)
            this.emit('call:audio', audioData)

            if (this.audioRecvCount % 100 === 0) {
                const stats = this.opusCodec.getStats()
                this.logger.debug(
                    `[RECV] #${this.audioRecvCount}: real=${this.recvRealCount} dtx=${this.recvDtxCount} ok=${stats.success} err=${stats.errors} seqLost=${this.recvSeqGaps} echoSkip=${this.selfEchoCount}`
                )
            }
        } catch (err: any) {
            this.srtpErrorCount++
            if (this.srtpErrorCount <= 5) {
                const ssrc = buf.readUInt32BE(8)
                const ext = ((data[0] >> 4) & 0x01) !== 0
                this.logger.debug(
                    `[RECV] SRTP err #${this.srtpErrorCount}: ${err.message} ssrc=0x${ssrc.toString(16)} ext=${ext} size=${data.length}B`
                )
            }
        }
    }

    private async connectRelays(endpoints: RelayEndpoint[]): Promise<void> {
        this.logger.debug(
            `[CallManager] Connecting to ${endpoints.length} relay endpoints via WebRTC/SCTP DataChannel...`
        )

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
            this.logger.error(`[CallManager] No relay configs`)
            return
        }

        this.sctpRelay.setSsrc(this.selfSsrc)
        this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0)

        try {
            await this.sctpRelay.configureRelays(relays)
            this.logger.debug(
                `[RELAY] SCTP: ${this.sctpRelay.getConnectedCount()} connected, selfSsrc=0x${this.selfSsrc.toString(16)} peerSsrcs=[${this.peerSsrcs.map((s) => '0x' + s.toString(16))}]`
            )
        } catch (err: any) {
            this.logger.error(`[RELAY] SCTP error: ${err.message}`)
        }
    }

    private startMediaFlow(): void {
        this.logger.debug(
            `[MEDIA] startMediaFlow: audio=${this.audioEngine.hasAudio()} ext=${this.audioEngine.isExternalMode()} srtp=${!!this.srtpSession} sctp=${this.sctpRelay.hasConnection()} PT=120 clock=16kHz ts_delta=${this.rtpTsDelta} (${this.rtpTsDelta / 16}ms)`
        )

        this.audioEngine.startPlayback()

        this.audioEngine.startCapture()
    }

    private cleanupMedia(): void {
        const opusStats = this.opusCodec?.getStats()
        this.logger.debug(
            `[CALL-STATS] Relay: ${this.relayPacketCount} | Recv: ${this.audioRecvCount} ok, ${this.srtpErrorCount} srtpErr, ${this.recvSeqGaps} seqLost, ${this.selfEchoCount} echoSkip | Sent: ${this.audioSendCount} (drop: ${this.audioDropCount}) | Opus: ok=${opusStats?.success ?? 0} err=${opusStats?.errors ?? 0} plc=${opusStats?.plc ?? 0}`
        )

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
    }

    private emitState(): void {
        if (this.currentCall) {
            this.emit('call:state', this.currentCall)
        }
    }

    private async resolvePeerLid(peerJid: string): Promise<string> {
        if (peerJid.includes('@lid')) return peerJid

        try {
            const lidMapping = this.sock.signalRepository?.lidMapping
            if (lidMapping?.getLIDForPN) {
                const lid = await lidMapping.getLIDForPN(peerJid)
                if (lid) return lid
            }
        } catch {}

        return peerJid
    }

    private hasVideoNode(node: BinaryNode): boolean {
        if (!node.content || !Array.isArray(node.content)) return false
        return node.content.some(
            (c: any) => typeof c === 'object' && 'tag' in c && c.tag === 'video'
        )
    }

    destroy(): void {
        this.cleanupMedia()
        this.currentCall = null
        this.removeAllListeners()
    }
}
