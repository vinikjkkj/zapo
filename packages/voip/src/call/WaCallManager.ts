import { EventEmitter } from 'node:events'

import { createNoopLogger, type Logger } from 'zapo-js'
import { type BinaryNode, findNodeChild, hasNodeChild } from 'zapo-js/transport'
import { resolvePositive, toError, tryAsNumber } from 'zapo-js/util'

import type {
    MLowCompanionModelSource,
    MLowRedOptions,
    WaCallMediaEvent,
    WaCallMediaMessage
} from '@zapo-js/voip-media'

import { generateCallKey } from '../crypto/encryption.js'
import { groupParticipantAccountKey } from '../jid.js'
import { WaAudioEngine } from '../media/WaAudioEngine.js'
import { resolvePeerDeviceJids, resolvePeerLid } from '../peer-devices.js'
import { parseRelayFromAck } from '../relay/relay-ack.js'
import { decryptCallKey } from '../signaling/call-key.js'
import {
    callIdOfCallServerJid,
    extractNodeInfo,
    generateCallId,
    toCallServerJid
} from '../signaling/call-stanza.js'
import { buildEncRekeyReceiptStanza, buildGroupOfferStanza } from '../signaling/group-call.js'
import {
    buildOfferStanza,
    parseGroupJidAttr,
    parseJoinableAttr,
    parseReRingAttr
} from '../signaling/lifecycle.js'
import { type WaVideoUpgradeResult } from '../signaling/video-state.js'
import { parseVoipSettings } from '../signaling/voip-settings.js'
import {
    CallDirection,
    CallMediaType,
    type CallOfferOptions,
    CallState,
    type CallVideoSubscription,
    EndCallReason,
    type GroupCallOfferOptions,
    type WaVoipDeps,
    type WaVoipStores
} from '../types.js'

import { selfJidOf } from './call-jids.js'
import {
    CallInfo,
    decideJoinableTerminate,
    WA_GROUP_CALL_ENDED_REASON,
    WA_TERMINATE_DECISION
} from './call-state.js'
import {
    toCompanionModelSource,
    type WaCallMediaLinkEvents,
    WaLocalCallMedia,
    WaRemoteCallMedia
} from './media-link.js'
import { WaCallMediaSession } from './WaCallMediaSession.js'
import { WaCallReporter } from './WaCallReporter.js'
import {
    type WaJoinableCall,
    type WaJoinableCallCause,
    WaJoinableCalls
} from './WaJoinableCalls.js'
import { WaOutOfOrderStanzas } from './WaOutOfOrderStanzas.js'

const DEFAULT_MAX_CONCURRENT_CALLS = 1

/** The `<terminate>` reason of the server taking a member whose media stopped off a group call. */
const WA_USER_INVISIBLE_REASON = 'user_invisible'

export interface WaCallManagerConfig {
    deps: WaVoipDeps
    stores: WaVoipStores
    logger?: Logger
    maxConcurrentCalls?: number
    useOriginalRelayPort?: boolean
    useRawUdpTransport?: boolean
    /** See `WaVoipCoordinatorOptions.mlowCompanionModel`. */
    mlowCompanionModel?: Uint8Array | ArrayBuffer | string
    /** See `WaVoipCoordinatorOptions.mlowRed`. */
    mlowRed?: boolean | MLowRedOptions
    /** Where call media runs; see `WaVoipCoordinatorOptions.media`. */
    mediaMode?: WaCallMediaMode
    /** See `WaVoipCoordinatorOptions.participantAudio`. */
    participantAudio?: boolean
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
    private readonly mlowCompanionModel: MLowCompanionModelSource | undefined
    private readonly mlowRed: boolean | MLowRedOptions | undefined
    private readonly mediaMode: WaCallMediaMode
    private readonly participantAudio: boolean
    private readonly signalingLogger: Logger

    private readonly calls = new Map<string, WaCallMediaSession>()
    /** Set by `destroy`: an offer still resolving when it ran must not make a call. */
    private destroyed = false
    private readonly outOfOrder = new WaOutOfOrderStanzas()
    private readonly joinableCalls: WaJoinableCalls
    private readonly reporter: WaCallReporter

    constructor(config: WaCallManagerConfig) {
        super()
        this.deps = config.deps
        this.stores = config.stores
        this.logger = config.logger ?? createNoopLogger()
        this.joinableCalls = new WaJoinableCalls(this.logger)
        this.maxConcurrentCalls = resolvePositive(
            config.maxConcurrentCalls,
            DEFAULT_MAX_CONCURRENT_CALLS,
            'maxConcurrentCalls'
        )
        this.useOriginalRelayPort = config.useOriginalRelayPort
        this.useRawUdpTransport = config.useRawUdpTransport ?? false
        this.mlowCompanionModel = toCompanionModelSource(config.mlowCompanionModel)
        this.mlowRed = config.mlowRed
        this.mediaMode = config.mediaMode ?? 'local'
        this.participantAudio = config.participantAudio ?? false
        this.reporter = new WaCallReporter({
            emitter: this,
            endedCalls: this.outOfOrder,
            participantAudio: this.participantAudio
        })
        this.signalingLogger = this.logger.child({ component: 'signaling' })
    }

    /**
     * Places a 1:1 call to `options.peerJid`, or a group call when `options.groupJid` is set.
     * Throws once the manager is destroyed, even mid-way: no offer goes out after `destroy`.
     */
    async startCall(options: CallOfferOptions): Promise<string> {
        this.throwIfDestroyed()
        if (this.activeCallCount >= this.maxConcurrentCalls) {
            throw new Error(`max concurrent calls reached (${this.maxConcurrentCalls})`)
        }
        if (options.groupJid) return this.startGroupCall(options.groupJid, options)
        if (!options.peerJid) {
            throw new Error('startCall needs a peerJid, or a groupJid with its participants')
        }

        const callId = generateCallId()
        const mediaType = options.isVideo ? CallMediaType.Video : CallMediaType.Audio
        const callCreator = selfJidOf(this.deps)
        const peerJid = await resolvePeerLid(this.deps, options.peerJid, this.logger)
        this.throwIfDestroyed()

        const info = CallInfo.newOutgoing(callId, peerJid, callCreator, mediaType)
        const callKey = generateCallKey()
        info.encryptionKey = callKey

        const session = this.createSession(info)
        this.reporter.markAnnounced(info)

        try {
            await session.initMedia(callCreator, peerJid)
            this.throwIfDestroyed()

            const offerStanza = await buildOfferStanza(
                this.deps,
                this.stores,
                callId,
                callKey,
                peerJid,
                options.isVideo ?? false,
                this.signalingLogger
            )
            this.throwIfDestroyed()

            await this.deps.lowLevelCoordinator.sendNode(offerStanza)
            if (this.destroyed) await this.withdrawOffer(session)
            this.throwIfDestroyed()
        } catch (err) {
            this.discard(session)
            throw err
        }

        // The ack refusing the offer may already have ended it.
        if (!info.isEnded) {
            info.applyTransition({ type: 'offer_sent' })
            this.reporter.emitState(info)
        }

        this.logger.debug('outgoing offer sent', { callId, peerJid })

        return callId
    }

    /**
     * Places a group call: one offer to the call itself naming every participant. It carries
     * no key: the call is keyed later over `enc_rekey`.
     */
    private async startGroupCall(
        groupJid: string,
        options: GroupCallOfferOptions
    ): Promise<string> {
        const participants = options.participants ?? []
        if (participants.length === 0) {
            throw new Error(`a group call on ${groupJid} needs the participants to ring`)
        }

        const callId = generateCallId()
        const mediaType = options.isVideo ? CallMediaType.Video : CallMediaType.Audio
        const callCreator = selfJidOf(this.deps)

        const offer = await buildGroupOfferStanza(
            this.deps,
            callId,
            groupJid,
            participants,
            options.isVideo ?? false,
            this.signalingLogger
        )
        this.throwIfDestroyed()

        const creatorKey = groupParticipantAccountKey(callCreator)
        const firstPeer = offer.participants.find(
            (participant) => groupParticipantAccountKey(participant.jid) !== creatorKey
        )
        if (!firstPeer) {
            throw new Error(`a group call on ${groupJid} needs the participants to ring`)
        }

        const info = CallInfo.newOutgoing(callId, firstPeer.jid, callCreator, mediaType)
        info.groupJid = groupJid
        info.joinable = true

        const session = this.createSession(info)
        session.seedOutgoingGroupComposition(offer.participants)
        this.applyPendingCallKey(session)
        this.reporter.markAnnounced(info)

        try {
            await session.initMedia(callCreator, firstPeer.devices[0] ?? firstPeer.jid)
            this.throwIfDestroyed()

            await this.deps.lowLevelCoordinator.sendNode(offer.node)
            if (this.destroyed) await this.withdrawOffer(session)
            this.throwIfDestroyed()
        } catch (err) {
            this.discard(session)
            throw err
        }

        if (!info.isEnded) {
            info.applyTransition({ type: 'offer_sent' })
            this.reporter.emitState(info)
        }

        this.logger.debug('outgoing group offer sent', {
            callId,
            groupJid,
            participantCount: offer.participants.length
        })

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
        this.joinableCalls.remember(session.info, 'declined')
        await this.release(callId)
    }

    async endCall(callId: string, reason: EndCallReason = EndCallReason.UserEnded): Promise<void> {
        const session = this.calls.get(callId)
        if (!session || session.info.isEnded) return

        await session.endCall(reason)
        this.joinableCalls.remember(session.info, 'left')
        await this.release(callId)
    }

    /**
     * Leaves a group call the others stay on. No-op on an unknown or ended call.
     *
     * @throws on a call that is no group's, where only {@link endCall} applies.
     */
    async leaveCall(
        callId: string,
        reason: EndCallReason = EndCallReason.UserEnded
    ): Promise<void> {
        const session = this.calls.get(callId)
        if (!session || session.info.isEnded) return

        await session.leaveCall(reason)
        this.joinableCalls.remember(session.info, 'left')
        await this.release(callId)
    }

    setMute(callId: string, muted: boolean): void {
        this.calls.get(callId)?.setMute(muted)
    }

    /** Asks one participant of a group call to mute; see {@link WaCallMediaSession.requestParticipantMute}. */
    async requestParticipantMute(callId: string, participantJid: string): Promise<void> {
        const session = this.getSessionOrThrow(callId)
        await session.requestParticipantMute(participantJid)
    }

    async setVideoEnabled(callId: string, enabled: boolean): Promise<void> {
        const session = this.getSessionOrThrow(callId)
        await session.setVideoEnabled(enabled)
    }

    /** Sets whose video a group call asks for; `null` hands it back to the session's policy. */
    setVideoSubscriptions(
        callId: string,
        subscriptions: readonly CallVideoSubscription[] | null
    ): void {
        this.getSessionOrThrow(callId).setVideoSubscriptions(subscriptions)
    }

    /** The joinable call this side is off, if one is remembered under `callId`. @internal */
    getJoinableCall(callId: string): WaJoinableCall | null {
        return this.joinableCalls.get(callId) ?? null
    }

    /**
     * Joins a group call going on without this side: a group accept to the call itself.
     * @throws when no such call is remembered, this side is on it, at the call limit, or when the
     * join fails, which leaves the call joinable.
     */
    async joinCall(callId: string): Promise<void> {
        this.throwIfDestroyed()
        const joinable = this.joinableCalls.get(callId)
        if (!joinable) {
            throw new Error(
                `No joinable call with id ${callId}: only a group call declined, rung out or left here can be joined`
            )
        }
        const live = this.calls.get(callId)
        if (live && !live.info.isEnded) {
            throw new Error(`Call ${callId} is already on this side`)
        }

        const info = CallInfo.newGroupJoin(
            callId,
            joinable.callCreator,
            joinable.mediaType,
            joinable.groupJid
        )
        const session = this.createSession(info)
        this.joinableCalls.forget(callId)
        this.reporter.markAnnounced(info)
        session.seedGroupJoin({
            participants: joinable.participants ?? [],
            transactionId: joinable.rosterTransactionId,
            relayData: joinable.relayData,
            voipSettings: joinable.voipSettings
        })
        this.applyPendingCallKey(session)

        try {
            await session.initMedia(selfJidOf(this.deps), joinable.callCreator)
            this.throwIfDestroyed()
            await session.acceptCall()
        } catch (err) {
            this.discard(session)
            this.joinableCalls.restore(joinable)
            throw err
        }

        this.logger.debug('joined a group call in progress', {
            callId,
            cause: joinable.cause,
            participantCount: info.groupComposition?.participants.length ?? 0
        })
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

    /**
     * A re-ring (`re-ring`) rings this side again on a call already going, with no `<relay>`: a
     * terminate held for its id belonged to the earlier ring and does not drop it.
     */
    async handleCallOffer(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo?.callId) return

        const callId = nodeInfo.callId
        const reRing = parseReRingAttr(nodeInfo.innerNode)
        const existing = this.calls.get(callId)
        if (existing) {
            if (!existing.info.isEnded) {
                this.logger.debug('duplicate offer for active call, ignoring', { callId, reRing })
                return
            }
            this.discard(existing)
        }

        const callCreator = nodeInfo.innerNode.attrs?.['call-creator'] || peerJid
        const callerPn = nodeInfo.innerNode.attrs?.['caller_pn']
        const isVideo = hasNodeChild(nodeInfo.innerNode, 'video')

        const callKey = await decryptCallKey(
            this.deps,
            nodeInfo.innerNode,
            peerJid,
            this.signalingLogger
        )

        if (this.destroyed) {
            this.logger.debug('offer resolved after the manager was destroyed, dropped', { callId })
            return
        }
        if (this.outOfOrder.takeHeldTerminate(callId) && !reRing) {
            this.logger.debug('offer of a call already terminated, dropped', { callId })
            return
        }

        const voipSettings = parseVoipSettings(node, this.signalingLogger)
        const relay = parseRelayFromAck(nodeInfo.innerNode)

        const mediaType = isVideo ? CallMediaType.Video : CallMediaType.Audio
        const info = CallInfo.newIncoming(callId, peerJid, callCreator, callerPn, mediaType)
        info.joinable = parseJoinableAttr(nodeInfo.innerNode)
        info.groupJid = parseGroupJidAttr(nodeInfo.innerNode) ?? undefined

        if (callKey) {
            info.encryptionKey = callKey
        }

        if (relay.endpoints.length > 0) info.relayData = relay

        const atCapacity = this.activeCallCount >= this.maxConcurrentCalls
        const session = this.createSession(info, { acceptBlocked: atCapacity })
        this.joinableCalls.forget(callId)
        session.applyVoipSettings(voipSettings)
        session.seedGroupComposition(nodeInfo.innerNode)
        this.applyPendingCallKey(session)

        if (!atCapacity) {
            try {
                if (!(await this.activateIncoming(session))) return
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
                this.reporter.emitEnded(info)
                this.reporter.emitState(info)
                session.cleanup()
                await this.release(callId)
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

        this.reporter.announceIncoming(info)
        this.reporter.emitState(info)

        this.logger.debug('incoming call', {
            callId,
            peerJid,
            callCreator,
            isVideo,
            isGroupCall: info.isGroupCall,
            reRing,
            relayCount: relay.endpoints.length,
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
            await this.release(session.callId)
        }
    }

    async handleCallPreaccept(node: BinaryNode, peerJid: string): Promise<void> {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        await session.handleCallPreaccept(node, peerJid)
    }

    async handleCallTransport(node: BinaryNode): Promise<void> {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        await session.handleCallTransport(node)
    }

    /** An ack refusing our offer ends the call, which frees its slot. */
    async handleCallAck(node: BinaryNode): Promise<void> {
        const session = this.resolveSessionForOfferAck(node)
        if (!session) return
        await session.handleCallAck(node)
        if (session.info.isEnded) {
            await this.release(session.callId)
        }
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

    handleCallScreenShare(node: BinaryNode, peerJid: string): void {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        session.handleCallScreenShare(node, peerJid)
    }

    handleCallVideoState(node: BinaryNode, peerJid: string): void {
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        session.handleCallVideoState(node, peerJid)
    }

    /**
     * A `<group_update>`: a roster, a reissued relay, or a rekey asked of this side. One for a
     * joinable call this side is off updates what is remembered of it.
     */
    async handleCallGroupUpdate(node: BinaryNode): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (nodeInfo?.callId && !this.calls.has(nodeInfo.callId)) {
            if (this.joinableCalls.follow(node, nodeInfo.innerNode, nodeInfo.callId)) return
        }
        const session = this.resolveSessionFromNode(node)
        if (!session) return
        await session.handleCallGroupUpdate(node)
    }

    /**
     * An `<enc_rekey>`, the only carrier of a group call's key. Decrypted here so a key that
     * beats its offer can be held for it; the `<receipt>` answers the stanza either way.
     */
    async handleCallEncRekey(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo?.callId) {
            this.logger.debug('enc_rekey missing call-id, ignored')
            return
        }

        const callId = nodeInfo.callId
        const inner = nodeInfo.innerNode
        const callCreator = inner.attrs?.['call-creator'] || peerJid
        const transactionId = tryAsNumber(inner.attrs?.['transaction-id'])

        const callKey = await decryptCallKey(this.deps, inner, peerJid, this.signalingLogger)
        await this.sendEncRekeyReceipt(node, peerJid, callId, callCreator)

        if (!callKey) {
            this.logger.warn('enc_rekey carried no enc this device could decrypt', {
                callId,
                transactionId,
                from: peerJid
            })
            return
        }

        const session = this.calls.get(callId)
        if (!session || session.info.isEnded) {
            this.outOfOrder.holdCallKey(callId, { callKey, transactionId })
            this.logger.debug('enc_rekey ahead of its call, key held', { callId, transactionId })
            return
        }

        await session.applyCallKey(callKey, transactionId)
    }

    /**
     * A terminate that finds no call is kept, so the offer still decrypting for it is dropped,
     * unless it is `joinable`: one participant of a pending group call says nothing of the call.
     * `group_call_ended` ends a group call in any state; the server's ring-out ends our ring only.
     */
    async handleCallTerminate(node: BinaryNode, peerJid?: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        const callId = nodeInfo?.callId
        if (!callId) {
            this.logger.debug('stanza missing call-id, ignored')
            return
        }
        const groupCallEnded = nodeInfo.innerNode.attrs?.reason === WA_GROUP_CALL_ENDED_REASON
        if (groupCallEnded && this.joinableCalls.forget(callId)) {
            this.logger.debug('joinable call ended for everybody, forgotten', { callId })
        }
        const session = this.calls.get(callId)
        if (!session && this.outOfOrder.endedHere(callId)) {
            this.logger.debug('terminate for a call already ended here, ignored', { callId })
            return
        }
        if (!session && parseJoinableAttr(nodeInfo.innerNode)) {
            this.logger.debug('joinable terminate for a call not yet created, ignored', { callId })
            return
        }
        if (!session) {
            this.outOfOrder.holdTerminate(callId)
            this.logger.debug('terminate for a call not yet created, kept for its offer', {
                callId
            })
            return
        }
        const action = findNodeChild(node, 'terminate')
        if (action && this.isRingOut(session.info, node, action)) {
            await this.endHere(session, EndCallReason.Timeout, 'rung_out')
            return
        }
        if (action && this.isRemovedAsInvisible(session.info, node, action)) {
            await this.endHere(session, EndCallReason.Invisible, 'invisible')
            return
        }
        if (session.info.joinable && !groupCallEnded) {
            const decision = decideJoinableTerminate(session.info, action?.attrs?.reason)
            if (decision === WA_TERMINATE_DECISION.RemoveParticipant) {
                session.removeGroupParticipant(peerJid, action?.attrs?.reason)
                return
            }
            if (decision !== WA_TERMINATE_DECISION.End) {
                this.logger.debug('joinable terminate kept the call', {
                    callId: session.callId,
                    from: peerJid,
                    decision,
                    state: session.info.stateData.state,
                    terminateAttrs: action?.attrs ?? {}
                })
                if (decision === WA_TERMINATE_DECISION.Ignore) this.reporter.emitState(session.info)
                return
            }
        }
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
        await this.release(session.callId)
    }

    destroy(): void {
        this.destroyed = true
        for (const session of this.calls.values()) {
            session.cleanup()
        }
        this.calls.clear()
        this.outOfOrder.clear()
        this.joinableCalls.clear()
        this.removeAllListeners()
    }

    /**
     * The server ending our ring of a group call that goes on: `joinable`, no reason, from the
     * call itself, on an incoming call still ringing.
     */
    private isRingOut(info: CallInfo, node: BinaryNode, action: BinaryNode): boolean {
        return (
            info.isGroupCall &&
            info.direction === CallDirection.Incoming &&
            info.stateData.state === CallState.IncomingRinging &&
            !action.attrs?.reason &&
            parseJoinableAttr(action) &&
            node.attrs?.from === toCallServerJid(info.callId)
        )
    }

    /**
     * The server taking this side off a group call that goes on, its media no longer reaching
     * the others: `user_invisible` from the call itself, which sends it to the removed member only.
     */
    private isRemovedAsInvisible(info: CallInfo, node: BinaryNode, action: BinaryNode): boolean {
        return (
            info.isGroupCall &&
            action.attrs?.reason === WA_USER_INVISIBLE_REASON &&
            node.attrs?.from === toCallServerJid(info.callId)
        )
    }

    /** Ends the call here with nothing sent, the call going on, and remembers it for a join. */
    private async endHere(
        session: WaCallMediaSession,
        reason: EndCallReason,
        cause: WaJoinableCallCause
    ): Promise<void> {
        const info = session.info
        this.joinableCalls.remember(info, cause)
        info.applyTransition({ type: 'terminated', reason })
        this.logger.debug('group call ended here, the call goes on', { callId: info.callId, cause })
        this.reporter.emitEnded(info)
        this.reporter.emitState(info)
        session.cleanup()
        await this.release(info.callId)
    }

    private throwIfDestroyed(): void {
        if (this.destroyed) throw new Error('call manager destroyed')
    }

    /** Terminates an offer that left while `destroy` ran, as a leave would; best effort. */
    private async withdrawOffer(session: WaCallMediaSession): Promise<void> {
        try {
            await this.deps.lowLevelCoordinator.sendNode(session.buildTerminateStanza())
        } catch (err) {
            this.logger.warn('terminate of an offer sent during destroy failed', {
                callId: session.callId,
                message: toError(err).message
            })
        }
    }

    /** Answers one `<enc_rekey>`; one with no id goes unanswered. */
    private async sendEncRekeyReceipt(
        node: BinaryNode,
        peerJid: string,
        callId: string,
        callCreator: string
    ): Promise<void> {
        const rekeyMsgId = node.attrs?.id
        if (!rekeyMsgId) return

        try {
            await this.deps.lowLevelCoordinator.sendNode(
                buildEncRekeyReceiptStanza(
                    peerJid,
                    rekeyMsgId,
                    callId,
                    callCreator,
                    selfJidOf(this.deps)
                )
            )
        } catch (err) {
            this.logger.warn('enc_rekey receipt send failed', {
                callId,
                message: toError(err).message
            })
        }
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
            this.discard(prior)
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
            // On a group call ending is this side leaving, which the session's end already is.
            delegate: this.reporter.sessionDelegate((call, reason) => {
                this.endCall(call.callId, reason).catch((err: unknown) => {
                    this.logger.warn('ending a call with no media path failed', {
                        callId: call.callId,
                        message: toError(err).message
                    })
                })
            })
        })

        this.calls.set(info.callId, session)
        return session
    }

    /**
     * Applies a call key an `<enc_rekey>` delivered ahead of the call. Run once the composition
     * is seeded: a roster-only offer is a group call only from then on, and before it the key
     * would be refused and lost.
     */
    private applyPendingCallKey(session: WaCallMediaSession): void {
        const callId = session.callId
        const pending = this.outOfOrder.takeCallKey(callId)
        if (!pending) return
        session.applyCallKey(pending.callKey, pending.transactionId).catch((err: unknown) => {
            this.logger.warn('call key held for this call failed to apply', {
                callId,
                message: toError(err).message
            })
        })
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
            return new WaRemoteCallMedia(callId, events, logger)
        }
        return new WaLocalCallMedia({
            logger,
            events,
            useOriginalRelayPort: this.useOriginalRelayPort ?? !this.deps.isMobilePrimary(),
            useRawUdpTransport: this.useRawUdpTransport,
            mlowCompanionModel: this.mlowCompanionModel,
            mlowRed: this.mlowRed
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
        const callId = node.attrs?.['call-id'] || callIdOfCallServerJid(node.attrs?.from)
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

        // Some offer acks come without a call-id: one call still connecting is the one it names.
        if (active.length === 1) return active[0]

        this.logger.debug('offer ack could not be routed', {
            callId: callId ?? null,
            candidateCount: active.length
        })
        return null
    }

    /** Frees the slot of a call that ended, letting a waiting incoming call take it. */
    private release(callId: string): Promise<void> {
        this.calls.delete(callId)
        return this.maybeUnblockWaitingCalls()
    }

    /** Drops a call that never got going, or a dead one its id is about to be reused for. */
    private discard(session: WaCallMediaSession): void {
        session.cleanup()
        this.calls.delete(session.callId)
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
        if (!(await this.activateIncoming(session))) return
        if (this.endedDuringSetup(session)) return

        this.reporter.emitState(session.info)

        this.logger.debug('waiting incoming call unblocked', { callId: session.callId })
    }

    /**
     * Brings an incoming call up: the peer's devices first among the relay participants, then
     * media, preaccept and relay latency. `false` once a concurrent end stopped it.
     */
    private async activateIncoming(session: WaCallMediaSession): Promise<boolean> {
        const info = session.info
        const selfLid = selfJidOf(this.deps)
        const peerDeviceJids = await resolvePeerDeviceJids(this.deps, info.peerJid, this.logger)
        if (this.endedDuringSetup(session)) return false
        if (info.relayData) {
            info.relayData.participantJids = [
                ...peerDeviceJids,
                ...(info.relayData.participantJids || []).filter(
                    (jid) => !peerDeviceJids.includes(jid)
                )
            ]
        }
        await session.initMedia(selfLid, info.peerJid)
        if (this.endedDuringSetup(session)) return false
        await session.sendIncomingPreaccept(info.peerJid)
        if (this.endedDuringSetup(session)) return false
        await session.sendRelayLatency()
        return true
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
