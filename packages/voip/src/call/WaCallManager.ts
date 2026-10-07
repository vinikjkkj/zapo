import { EventEmitter } from 'node:events'

import { createNoopLogger, type Logger } from 'zapo-js'
import { isLidJid } from 'zapo-js/protocol'
import { type BinaryNode, hasNodeChild } from 'zapo-js/transport'
import { resolvePositive, setBoundedMapEntry, toError } from 'zapo-js/util'

import type { WaCallMediaEvent, WaCallMediaMessage } from '@zapo-js/voip-media'

import { generateCallKey } from '../crypto/encryption.js'
import { WaAudioEngine } from '../media/WaAudioEngine.js'
import { parseRelayFromAck } from '../relay/relay-ack.js'
import {
    buildOfferStanza,
    decryptCallKey,
    extractNodeInfo,
    generateCallId,
    type WaVideoUpgradeResult
} from '../signaling/signaling.js'
import { parseVoipSettings } from '../signaling/voip-settings.js'
import {
    CallDirection,
    CallMediaType,
    type CallOfferOptions,
    EndCallReason,
    type WaVoipDeps,
    type WaVoipStores
} from '../types.js'

import { CallInfo } from './call-state.js'
import { type WaCallMediaLinkEvents, WaLocalCallMedia, WaRemoteCallMedia } from './media-link.js'
import { WaCallMediaSession } from './WaCallMediaSession.js'

const DEFAULT_MAX_CONCURRENT_CALLS = 1

/** How long a terminate that found no call waits for its offer, and how many are kept. */
const TERMINATED_BEFORE_OFFER_TTL_MS = 30_000
const MAX_TERMINATED_BEFORE_OFFER = 64

export interface WaCallManagerConfig {
    deps: WaVoipDeps
    stores: WaVoipStores
    logger?: Logger
    maxConcurrentCalls?: number
    useOriginalRelayPort?: boolean
    useRawUdpTransport?: boolean
    /** Where call media runs; see `WaVoipCoordinatorOptions.media`. */
    mediaMode?: WaCallMediaMode
}

/** `local` carries the media in this process; `remote` hands its plan to a host elsewhere. */
export type WaCallMediaMode = 'local' | 'remote'

export class WaCallManager extends EventEmitter {
    private readonly deps: WaVoipDeps
    private readonly stores: WaVoipStores
    private readonly logger: Logger
    private readonly maxConcurrentCalls: number
    /** Unset, each call picks by session: the advertised port on a companion, 3480 on a primary. */
    private readonly useOriginalRelayPort: boolean | undefined
    private readonly useRawUdpTransport: boolean
    private readonly mediaMode: WaCallMediaMode

    private readonly calls = new Map<string, WaCallMediaSession>()
    /** Set by `destroy`: an offer still resolving when it ran must not make a call. */
    private destroyed = false
    /**
     * Call ids a `<terminate>` ended before their offer made a call, with when that
     * expires: the offer can still be decrypting when the terminate lands.
     */
    private readonly terminatedBeforeOffer = new Map<string, number>()
    /** Calls the app knows of: an outgoing one from its start, an incoming one once announced. */
    private readonly announcedCalls = new WeakSet<CallInfo>()

    constructor(config: WaCallManagerConfig) {
        super()
        this.deps = config.deps
        this.stores = config.stores
        this.logger = config.logger ?? createNoopLogger()
        this.maxConcurrentCalls = resolvePositive(
            config.maxConcurrentCalls,
            DEFAULT_MAX_CONCURRENT_CALLS,
            'maxConcurrentCalls'
        )
        this.useOriginalRelayPort = config.useOriginalRelayPort
        this.useRawUdpTransport = config.useRawUdpTransport ?? false
        this.mediaMode = config.mediaMode ?? 'local'
    }

    /** Throws once the manager is destroyed, even mid-way: no offer goes out after `destroy`. */
    async startCall(options: CallOfferOptions): Promise<string> {
        this.throwIfDestroyed()
        if (this.activeCallCount >= this.maxConcurrentCalls) {
            throw new Error(`max concurrent calls reached (${this.maxConcurrentCalls})`)
        }

        const callId = generateCallId()
        const mediaType = options.isVideo ? CallMediaType.Video : CallMediaType.Audio
        const creds = this.deps.authClient.getCurrentCredentials()
        const callCreator = creds?.meLid || creds?.meJid || ''
        const peerJid = await this.resolvePeerLid(options.peerJid)
        this.throwIfDestroyed()

        const info = CallInfo.newOutgoing(callId, peerJid, callCreator, mediaType)
        const callKey = generateCallKey()
        info.encryptionKey = callKey

        const session = this.createSession(info)
        this.announcedCalls.add(info)

        try {
            session.resetOutgoingFlags()

            const selfLid = creds?.meLid || creds?.meJid || ''
            await session.initMedia(selfLid, peerJid)
            this.throwIfDestroyed()

            const offerStanza = await buildOfferStanza(
                this.deps,
                this.stores,
                callId,
                callKey,
                peerJid,
                options.isVideo ?? false,
                this.logger.child({ component: 'signaling' })
            )
            this.throwIfDestroyed()

            await this.deps.lowLevelCoordinator.sendNode(offerStanza)
            this.throwIfDestroyed()
        } catch (err) {
            session.cleanup()
            this.calls.delete(callId)
            throw err
        }

        info.applyTransition({ type: 'offer_sent' })
        this.emitState(info)

        this.logger.debug('outgoing offer sent', { callId, peerJid })

        return callId
    }

    async acceptCall(callId: string): Promise<void> {
        const session = this.getSessionOrThrow(callId)
        if (!session.info.canAccept) {
            throw new Error(
                `Call ${callId} cannot be accepted in state ${session.info.stateData.state}`
            )
        }
        await session.acceptCall()
    }

    async rejectCall(
        callId: string,
        reason: EndCallReason = EndCallReason.Declined
    ): Promise<void> {
        const session = this.getSessionOrThrow(callId)
        await session.rejectCall(reason)
        this.calls.delete(callId)
        await this.maybeUnblockWaitingCalls()
    }

    async endCall(callId: string, reason: EndCallReason = EndCallReason.UserEnded): Promise<void> {
        const session = this.calls.get(callId)
        if (!session || session.info.isEnded) return

        await session.endCall(reason)
        this.calls.delete(callId)
        await this.maybeUnblockWaitingCalls()
    }

    setMute(callId: string, muted: boolean): void {
        this.calls.get(callId)?.setMute(muted)
    }

    async setHandRaised(callId: string, raised: boolean): Promise<void> {
        const session = this.getSessionOrThrow(callId)
        await session.setHandRaised(raised)
    }

    async setScreenShare(callId: string, sharing: boolean): Promise<void> {
        const session = this.getSessionOrThrow(callId)
        await session.setScreenShare(sharing)
    }

    /** Sends an emoji reaction. `false` when nothing went on the wire. */
    sendReaction(callId: string, reaction: string): boolean {
        const session = this.getSessionOrThrow(callId)
        return session.sendReaction(reaction)
    }

    requestVideoUpgrade(callId: string): Promise<WaVideoUpgradeResult> {
        const session = this.getSessionOrThrow(callId)
        return session.requestVideoUpgrade()
    }

    async acceptVideoUpgrade(callId: string): Promise<void> {
        const session = this.getSessionOrThrow(callId)
        await session.acceptVideoUpgrade()
    }

    async rejectVideoUpgrade(callId: string): Promise<void> {
        const session = this.getSessionOrThrow(callId)
        await session.rejectVideoUpgrade()
    }

    async cancelVideoUpgrade(callId: string): Promise<void> {
        const session = this.getSessionOrThrow(callId)
        await session.cancelVideoUpgrade()
    }

    async loadAudio(callId: string, audioPath: string): Promise<void> {
        const session = this.getSessionOrThrow(callId)
        await session.loadAudio(audioPath)
    }

    setExternalAudioMode(callId: string, enabled: boolean): void {
        const session = this.getSessionOrThrow(callId)
        session.setExternalAudioMode(enabled)
    }

    feedLiveAudio(callId: string, data: Float32Array): number {
        const session = this.calls.get(callId)
        return session?.feedLiveAudio(data) ?? 0
    }

    feedLiveVideo(callId: string, data: Uint8Array, timestampUs: number): number {
        return this.calls.get(callId)?.feedLiveVideo(data, timestampUs) ?? 0
    }

    getLiveBufferMs(callId: string): number {
        const session = this.calls.get(callId)
        return session?.getLiveBufferMs() ?? 0
    }

    getFeedWatermarksMs(): { pauseMs: number; resumeMs: number } {
        return WaAudioEngine.feedWatermarksMs()
    }

    getCall(callId: string): CallInfo | null {
        return this.calls.get(callId)?.info ?? null
    }

    getCalls(): readonly CallInfo[] {
        const result: CallInfo[] = []
        for (const session of this.calls.values()) {
            result.push(session.info)
        }
        return result
    }

    async handleCallOffer(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo?.callId) return

        const callId = nodeInfo.callId
        const existing = this.calls.get(callId)
        if (existing) {
            if (!existing.info.isEnded) {
                this.logger.debug('duplicate offer for active call, ignoring', { callId })
                return
            }
            existing.cleanup()
            this.calls.delete(callId)
        }

        const callCreator = nodeInfo.innerNode.attrs?.['call-creator'] || peerJid
        const callerPn = nodeInfo.innerNode.attrs?.['caller_pn']
        const isVideo = hasNodeChild(nodeInfo.innerNode, 'video')

        const signalingLogger = this.logger.child({ component: 'signaling' })

        const callKey = await decryptCallKey(
            this.deps,
            nodeInfo.innerNode,
            peerJid,
            signalingLogger
        )

        if (this.destroyed) {
            this.logger.debug('offer resolved after the manager was destroyed, dropped', { callId })
            return
        }
        if (this.takeTerminatedBeforeOffer(callId)) {
            this.logger.debug('offer of a call already terminated, dropped', { callId })
            return
        }

        const voipSettings = parseVoipSettings(node, signalingLogger)

        const { relays, participantJids, uuid, selfPid, peerPid, hbhKey } = parseRelayFromAck(
            nodeInfo.innerNode
        )

        const mediaType = isVideo ? CallMediaType.Video : CallMediaType.Audio
        const info = CallInfo.newIncoming(callId, peerJid, callCreator, callerPn, mediaType)

        if (callKey) {
            info.encryptionKey = callKey
        }

        if (relays.length > 0) {
            info.relayData = {
                endpoints: relays,
                participantJids,
                uuid,
                selfPid,
                peerPid,
                hbhKey
            }
        }

        const atCapacity = this.activeCallCount >= this.maxConcurrentCalls
        const session = this.createSession(info, { acceptBlocked: atCapacity })
        session.applyVoipSettings(voipSettings)

        if (!atCapacity) {
            try {
                const creds = this.deps.authClient.getCurrentCredentials()
                const selfLid = creds?.meLid || creds?.meJid || ''
                const peerDeviceJids = await this.resolvePeerDeviceJids(peerJid)
                if (this.endedDuringSetup(session)) return
                if (info.relayData) {
                    info.relayData.participantJids = [
                        ...peerDeviceJids,
                        ...(info.relayData.participantJids || []).filter(
                            (jid) => !peerDeviceJids.includes(jid)
                        )
                    ]
                }
                await session.initMedia(selfLid, peerJid)
                if (this.endedDuringSetup(session)) return
                await session.sendIncomingPreaccept(peerJid)
                if (this.endedDuringSetup(session)) return
                await session.sendRelayLatency()
            } catch (err) {
                if (this.endedDuringSetup(session)) return
                this.logger.error('incoming call activation failed', {
                    callId,
                    message: toError(err).message
                })
                try {
                    info.applyTransition({ type: 'terminated', reason: EndCallReason.Failed })
                } catch (transitionErr) {
                    this.logger.trace('failed-activation transition skipped', {
                        message: toError(transitionErr).message
                    })
                }
                this.emitEnded(info)
                this.emitState(info)
                session.cleanup()
                this.calls.delete(callId)
                await this.maybeUnblockWaitingCalls()
                return
            }
        } else {
            this.logger.debug('incoming call waiting, at capacity', {
                callId,
                peerJid,
                maxConcurrentCalls: this.maxConcurrentCalls
            })
        }
        if (this.endedDuringSetup(session)) return

        this.announceIncoming(info)
        this.emitState(info)

        this.logger.debug('incoming call', {
            callId,
            peerJid,
            callCreator,
            isVideo,
            relayCount: relays.length,
            acceptBlocked: atCapacity
        })
    }

    /**
     * An `<accept>` from another device of this account on an incoming call ends it (answered
     * elsewhere) and frees its slot.
     */
    async handleCallAccept(node: BinaryNode, peerJid: string): Promise<void> {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        await session.handleCallAccept(node, peerJid)
        if (session.info.isEnded) {
            this.calls.delete(session.callId)
            await this.maybeUnblockWaitingCalls()
        }
    }

    async handleCallPreaccept(node: BinaryNode, peerJid: string): Promise<void> {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        await session.handleCallPreaccept(node, peerJid)
    }

    async handleCallTransport(node: BinaryNode, peerJid: string): Promise<void> {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        await session.handleCallTransport(node)
    }

    async handleCallAck(node: BinaryNode): Promise<void> {
        const session = this.resolveSessionForOfferAck(node)
        if (!session) return
        await session.handleCallAck(node)
    }

    handleCallRelaylatency(node: BinaryNode, peerJid: string): void {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        session.handleCallRelaylatency(node, peerJid)
    }

    handleRelayElection(node: BinaryNode): void {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        session.handleRelayElection(node)
    }

    handleCallMuteV2(node: BinaryNode, peerJid: string): void {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        session.handleCallMuteV2(node, peerJid)
    }

    handleCallUserAction(node: BinaryNode, peerJid: string): void {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        session.handleCallUserAction(node, peerJid)
    }

    /**
     * A top-level `<raise_hand>`: a message type of its own rather than a variant of
     * `<user_action>`, and both are live on the wire, so both have to route.
     */
    handleCallRaiseHand(node: BinaryNode, peerJid: string): void {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        session.handleCallRaiseHand(node, peerJid)
    }

    handleCallScreenShare(node: BinaryNode): void {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        session.handleCallScreenShare(node)
    }

    handleCallVideoState(node: BinaryNode): void {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        session.handleCallVideoState(node)
    }

    /** A terminate that finds no call is kept, so the offer still decrypting for it is dropped. */
    async handleCallTerminate(node: BinaryNode, peerJid?: string): Promise<void> {
        const callId = extractNodeInfo(node)?.callId
        if (!callId) {
            this.logger.debug('stanza missing call-id, ignored')
            return
        }
        const session = this.calls.get(callId)
        if (!session) {
            setBoundedMapEntry(
                this.terminatedBeforeOffer,
                callId,
                Date.now() + TERMINATED_BEFORE_OFFER_TTL_MS,
                MAX_TERMINATED_BEFORE_OFFER
            )
            this.logger.debug('terminate for a call not yet created, kept for its offer', {
                callId
            })
            return
        }
        const action = Array.isArray(node.content)
            ? node.content.find(
                  (child) => child && typeof child === 'object' && child.tag === 'terminate'
              )
            : undefined
        this.logger.warn('remote terminated call', {
            callId: session.callId,
            stanzaId: node.attrs?.id,
            from: node.attrs?.from,
            terminateAttrs: action?.attrs ?? {}
        })
        if (session.shouldIgnoreTerminate(peerJid, action?.attrs?.reason)) {
            this.logger.debug('ignoring accepted_elsewhere from non-selected companion', {
                callId: session.callId,
                from: peerJid
            })
            return
        }
        session.handleCallTerminate(action?.attrs?.reason)
        this.calls.delete(session.callId)
        await this.maybeUnblockWaitingCalls()
    }

    destroy(): void {
        this.destroyed = true
        for (const session of this.calls.values()) {
            session.cleanup()
        }
        this.calls.clear()
        this.terminatedBeforeOffer.clear()
        this.removeAllListeners()
    }

    private throwIfDestroyed(): void {
        if (this.destroyed) throw new Error('call manager destroyed')
    }

    /** Whether a terminate already ended this call before its offer was handled; consumes it. */
    private takeTerminatedBeforeOffer(callId: string): boolean {
        const expiresAt = this.terminatedBeforeOffer.get(callId)
        if (expiresAt === undefined) return false
        this.terminatedBeforeOffer.delete(callId)
        return expiresAt > Date.now()
    }

    private get activeCallCount(): number {
        let count = 0
        for (const session of this.calls.values()) {
            if (!session.info.isEnded && !session.info.isAcceptBlocked) count++
        }
        return count
    }

    private createSession(
        info: CallInfo,
        options: { acceptBlocked?: boolean } = {}
    ): WaCallMediaSession {
        const prior = this.calls.get(info.callId)
        if (prior) {
            if (!prior.info.isEnded) {
                throw new Error(`call ${info.callId} already exists`)
            }
            prior.cleanup()
            this.calls.delete(info.callId)
        }

        const acceptBlocked = options.acceptBlocked ?? false
        if (!acceptBlocked && this.activeCallCount >= this.maxConcurrentCalls) {
            throw new Error(`max concurrent calls reached (${this.maxConcurrentCalls})`)
        }

        if (acceptBlocked) {
            info.stateData.acceptBlocked = true
        }

        const sessionLogger = this.logger.child({ callId: info.callId })
        const session = new WaCallMediaSession({
            deps: this.deps,
            logger: sessionLogger,
            info,
            createMediaLink: (events) => this.createMediaLink(info.callId, sessionLogger, events),
            delegate: {
                emitState: (call) => this.emitState(call),
                emitIncoming: (call) => this.announceIncoming(call),
                emitEnded: (call) => this.emitEnded(call),
                emitPeerMute: (call, muted) => this.emit('call_peer_mute', call, muted),
                emitInboundAudio: (call, pcm) => this.emit('call_inbound_audio', call, pcm),
                emitInboundVideoRtp: (call, packet) =>
                    this.emit('call_inbound_video_rtp', call, packet),
                emitInboundVideo: (call, frame) => this.emit('call_inbound_video', call, frame),
                emitOutboundAudioFinished: (call) =>
                    this.emit('call_outbound_audio_finished', call),
                emitHandRaise: (call, participantJid, raised) =>
                    this.emit('call_hand_raise', call, participantJid, raised),
                emitCallReaction: (call, reaction) => this.emit('call_reaction', call, reaction),
                emitMediaPlan: (call, message) => this.emit('call_media', call, message),
                emitScreenShare: (call, share) => this.emit('call_screen_share', call, share),
                emitPeerVideoState: (call, change) =>
                    this.emit('call_peer_video_state', call, change),
                endCall: (call, reason) => {
                    this.endCall(call.callId, reason).catch((err: unknown) => {
                        this.logger.warn('ending a call with no media path failed', {
                            callId: call.callId,
                            message: toError(err).message
                        })
                    })
                }
            }
        })

        this.calls.set(info.callId, session)
        return session
    }

    /**
     * Hands an event from a remote media host to its call. Events for a call that no longer
     * exists are dropped: the host may still be winding down.
     */
    handleMediaEvent(callId: string, event: WaCallMediaEvent): void {
        const session = this.calls.get(callId)
        if (!session) {
            this.logger.debug('media event for an unknown call, ignored', {
                callId,
                type: event.type
            })
            return
        }
        session.handleMediaEvent(event)
    }

    /**
     * The whole media plan of a call, for a host that joins late or lost track of
     * the messages. `null` for an unknown call, or when the media runs locally.
     */
    getMediaSnapshot(callId: string): WaCallMediaMessage | null {
        return this.calls.get(callId)?.getMediaSnapshot() ?? null
    }

    private createMediaLink(
        callId: string,
        logger: Logger,
        events: WaCallMediaLinkEvents
    ): WaLocalCallMedia | WaRemoteCallMedia {
        if (this.mediaMode === 'remote') {
            return new WaRemoteCallMedia(callId, events)
        }
        return new WaLocalCallMedia({
            logger,
            events,
            useOriginalRelayPort: this.useOriginalRelayPort ?? !this.deps.isMobilePrimary(),
            useRawUdpTransport: this.useRawUdpTransport
        })
    }

    private getSessionOrThrow(callId: string): WaCallMediaSession {
        const session = this.calls.get(callId)
        if (!session) {
            throw new Error(`No call with id ${callId}`)
        }
        return session
    }

    private resolveSessionFromNode(node: BinaryNode): WaCallMediaSession | null {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo?.callId) {
            this.logger.debug('stanza missing call-id, ignored')
            return null
        }

        const session = this.calls.get(nodeInfo.callId)
        if (!session) {
            this.logger.debug('no session for call-id', { callId: nodeInfo.callId })
            return null
        }

        return session
    }

    private resolveSessionForOfferAck(node: BinaryNode): WaCallMediaSession | null {
        const callId = node.attrs?.['call-id']
        if (callId) {
            const session = this.calls.get(callId)
            if (session) return session
        }

        const active: WaCallMediaSession[] = []
        for (const session of this.calls.values()) {
            if (!session.info.isEnded && session.info.stateData.connectedAt === undefined) {
                active.push(session)
            }
        }

        // WhatsApp omits call-id from some offer ACKs sent after accepting an
        // incoming call. When there is only one live call, it is unambiguous
        // and the ACK contains the final relay participant/device metadata.
        if (active.length === 1) return active[0]

        this.logger.debug('offer ack could not be routed', {
            callId: callId ?? null,
            candidateCount: active.length
        })
        return null
    }

    private announceIncoming(call: CallInfo): void {
        this.announcedCalls.add(call)
        this.emit('call_incoming', call)
    }

    /** The lifecycle of a call the app was never told about stays silent. */
    private emitState(call: CallInfo): void {
        if (!this.announcedCalls.has(call)) return
        this.emit('call_state', call)
    }

    private emitEnded(call: CallInfo): void {
        if (!this.announcedCalls.has(call)) return
        this.emit('call_ended', call)
    }

    private async resolvePeerLid(peerJid: string): Promise<string> {
        if (isLidJid(peerJid)) return peerJid

        try {
            const [mapped] = await this.deps.signalDeviceSync.queryLidsByPhoneJids([peerJid])
            if (mapped?.lidJid) return mapped.lidJid
        } catch (err) {
            this.logger.trace('lid resolution failed', { message: toError(err).message })
        }

        return peerJid
    }

    private async resolvePeerDeviceJids(peerJid: string): Promise<string[]> {
        const primaryJid = /:\d+@/.test(peerJid) ? peerJid : peerJid.replace('@', ':0@')
        if (/:[1-9]\d*@/.test(peerJid)) return [peerJid]

        try {
            const synced = await this.deps.signalDeviceSync.syncDeviceList([peerJid])
            const devices = synced.flatMap((entry) => entry.deviceJids)
            const resolved = Array.from(new Set([primaryJid, ...devices]))
            if (resolved.length > 0) {
                this.logger.debug('incoming peer device resolved', {
                    peerJid,
                    peerDeviceJids: resolved,
                    deviceCount: resolved.length
                })
                return resolved
            }
        } catch (err) {
            this.logger.trace('incoming peer device resolution failed', {
                peerJid,
                message: toError(err).message
            })
        }

        return [primaryJid]
    }

    private async maybeUnblockWaitingCalls(): Promise<void> {
        while (this.activeCallCount < this.maxConcurrentCalls) {
            const waiting = [...this.calls.values()].find(
                (session) =>
                    session.info.direction === CallDirection.Incoming &&
                    session.info.isRinging &&
                    session.info.isAcceptBlocked
            )
            if (!waiting) break
            await this.activateWaitingIncoming(waiting)
        }
    }

    private async activateWaitingIncoming(session: WaCallMediaSession): Promise<void> {
        session.info.stateData.acceptBlocked = false

        const creds = this.deps.authClient.getCurrentCredentials()
        const selfLid = creds?.meLid || creds?.meJid || ''

        const peerDeviceJids = await this.resolvePeerDeviceJids(session.info.peerJid)
        if (this.endedDuringSetup(session)) return
        if (session.info.relayData) {
            session.info.relayData.participantJids = [
                ...peerDeviceJids,
                ...(session.info.relayData.participantJids || []).filter(
                    (jid) => !peerDeviceJids.includes(jid)
                )
            ]
        }
        await session.initMedia(selfLid, session.info.peerJid)
        if (this.endedDuringSetup(session)) return
        await session.sendIncomingPreaccept(session.info.peerJid)
        if (this.endedDuringSetup(session)) return
        await session.sendRelayLatency()
        if (this.endedDuringSetup(session)) return

        this.emitState(session.info)

        this.logger.debug('waiting incoming call unblocked', { callId: session.callId })
    }

    /**
     * Whether a `<terminate>` or `<accept>` handled concurrently ended the call mid-setup; that
     * path already reported the end, so setup stops and cleans up again.
     */
    private endedDuringSetup(session: WaCallMediaSession): boolean {
        if (!session.info.isEnded && !this.destroyed) return false
        session.cleanup()
        return true
    }
}
