import { EventEmitter } from 'node:events'

import { createNoopLogger, type Logger } from 'zapo-js'
import { isLidJid } from 'zapo-js/protocol'
import { type BinaryNode, hasNodeChild } from 'zapo-js/transport'
import { resolvePositive, toError } from 'zapo-js/util'

import { generateCallKey } from '../crypto/encryption.js'
import { WaAudioEngine } from '../media/WaAudioEngine.js'
import { parseRelayFromAck } from '../relay/relay-ack.js'
import {
    buildOfferStanza,
    decryptCallKey,
    extractNodeInfo,
    generateCallId
} from '../signaling/signaling.js'
import {
    CallDirection,
    CallMediaType,
    type CallOfferOptions,
    CallState,
    EndCallReason,
    type WaVoipDeps,
    type WaVoipStores
} from '../types.js'

import { CallInfo } from './call-state.js'
import { WaCallMediaSession } from './WaCallMediaSession.js'

const DEFAULT_MAX_CONCURRENT_CALLS = 1

export interface WaCallManagerConfig {
    deps: WaVoipDeps
    stores: WaVoipStores
    logger?: Logger
    maxConcurrentCalls?: number
}

export class WaCallManager extends EventEmitter {
    private readonly deps: WaVoipDeps
    private readonly stores: WaVoipStores
    private readonly logger: Logger
    private readonly maxConcurrentCalls: number

    private readonly calls = new Map<string, WaCallMediaSession>()

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
    }

    async startCall(options: CallOfferOptions): Promise<string> {
        if (this.activeCallCount >= this.maxConcurrentCalls) {
            throw new Error(`max concurrent calls reached (${this.maxConcurrentCalls})`)
        }

        const callId = generateCallId()
        const mediaType = options.isVideo ? CallMediaType.Video : CallMediaType.Audio
        const creds = this.deps.authClient.getCurrentCredentials()
        const callCreator = creds?.meLid || creds?.meJid || ''
        const peerJid = await this.resolvePeerLid(options.peerJid)

        const info = CallInfo.newOutgoing(callId, peerJid, callCreator, mediaType)
        const callKey = generateCallKey()
        info.encryptionKey = callKey

        const session = this.createSession(info)

        try {
            session.resetOutgoingFlags()

            const selfLid = creds?.meLid || creds?.meJid || ''
            await session.initMedia(selfLid, peerJid)

            const offerStanza = await buildOfferStanza(
                this.deps,
                this.stores,
                callId,
                callKey,
                peerJid,
                options.isVideo ?? false,
                this.logger.child({ component: 'signaling' })
            )

            await this.deps.lowLevelCoordinator.sendNode(offerStanza)
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
        const session = this.calls.get(callId)
        session?.setMute(muted)
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
        const isVideo = hasNodeChild(nodeInfo.innerNode, 'video')

        const callKey = await decryptCallKey(
            this.deps,
            nodeInfo.innerNode,
            peerJid,
            this.logger.child({ component: 'signaling' })
        )

        const { relays, participantJids, uuid, selfPid, peerPid, hbhKey } = parseRelayFromAck(
            nodeInfo.innerNode
        )

        const mediaType = isVideo ? CallMediaType.Video : CallMediaType.Audio
        const info = CallInfo.newIncoming(callId, peerJid, callCreator, undefined, mediaType)

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

        if (!atCapacity) {
            try {
                const creds = this.deps.authClient.getCurrentCredentials()
                const selfLid = creds?.meLid || creds?.meJid || ''
                await session.initMedia(selfLid, peerJid)
                await session.sendIncomingPreaccept(peerJid)
                await session.sendIncomingRelayLatency()
            } catch (err) {
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
                this.emit('call_ended', info)
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

        this.emit('call_incoming', info)
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

    async handleCallAccept(node: BinaryNode, peerJid: string): Promise<void> {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        await session.handleCallAccept(node, peerJid)
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

    async handleCallRelaylatency(node: BinaryNode, peerJid: string): Promise<void> {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        await session.handleCallRelaylatency(node, peerJid)
    }

    handleRelayElection(node: BinaryNode): void {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        session.handleRelayElection(node)
    }

    async handleCallMuteV2(node: BinaryNode, peerJid: string): Promise<void> {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        await session.handleCallMuteV2(node, peerJid)
    }

    async handleCallTerminate(node: BinaryNode): Promise<void> {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        session.handleCallTerminate()
        this.calls.delete(session.callId)
        await this.maybeUnblockWaitingCalls()
    }

    destroy(): void {
        for (const session of this.calls.values()) {
            session.cleanup()
        }
        this.calls.clear()
        this.removeAllListeners()
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
            delegate: {
                emitState: (call) => this.emitState(call),
                emitIncoming: (call) => this.emit('call_incoming', call),
                emitEnded: (call) => this.emit('call_ended', call),
                emitInboundAudio: (call, pcm) => this.emit('call_inbound_audio', call, pcm),
                emitOutboundAudioFinished: (call) => this.emit('call_outbound_audio_finished', call)
            }
        })

        this.calls.set(info.callId, session)
        return session
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

        const outgoing: WaCallMediaSession[] = []
        for (const session of this.calls.values()) {
            if (session.info.isInitiator && !session.info.isEnded) {
                const state = session.info.stateData.state
                if (state === CallState.Initiating || state === CallState.Ringing) {
                    outgoing.push(session)
                }
            }
        }

        if (outgoing.length === 1) return outgoing[0]

        this.logger.debug('offer ack could not be routed', {
            callId: callId ?? null,
            candidateCount: outgoing.length
        })
        return null
    }

    private emitState(call: CallInfo): void {
        this.emit('call_state', call)
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

        await session.initMedia(selfLid, session.info.peerJid)
        await session.sendIncomingPreaccept(session.info.peerJid)
        await session.sendIncomingRelayLatency()

        this.emitState(session.info)

        this.logger.debug('waiting incoming call unblocked', { callId: session.callId })
    }
}
