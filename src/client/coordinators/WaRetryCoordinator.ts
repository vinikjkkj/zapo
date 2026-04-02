import type { Logger } from '@infra/log/types'
import type { WaMessageClient } from '@message/WaMessageClient'
import { proto, type Proto } from '@proto'
import { WA_MESSAGE_TAGS } from '@protocol/constants'
import type { parseSignalAddressFromJid } from '@protocol/jid'
import { isGroupOrBroadcastJid, normalizeDeviceJid, parseJidFull } from '@protocol/jid'
import {
    MAX_RETRY_ATTEMPTS,
    RETRY_KEYS_MIN_COUNT,
    RETRY_OUTBOUND_TTL_MS,
    RETRY_REASON
} from '@retry/constants'
import { parseRetryReceiptRequest, pickRetryStateMax } from '@retry/parse'
import { mapRetryReasonFromError } from '@retry/reason'
import { WaRetryReplayService } from '@retry/replay'
import type {
    WaParsedRetryRequest,
    WaRetryDecryptFailureContext,
    WaRetryKeyBundle,
    WaRetryOutboundMessageRecord,
    WaRetryOutboundState
} from '@retry/types'
import type { SignalDeviceSyncApi } from '@signal/api/SignalDeviceSyncApi'
import type { SignalMissingPreKeysSyncApi } from '@signal/api/SignalMissingPreKeysSyncApi'
import { generatePreKeyPair } from '@signal/registration/keygen'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import type { SignalPreKeyBundle } from '@signal/types'
import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import type { WaRetryStore } from '@store/contracts/retry.store'
import type { WaSenderKeyStore } from '@store/contracts/sender-key.store'
import type { WaSessionStore } from '@store/contracts/session.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { buildAckNode } from '@transport/node/builders/global'
import { buildRetryReceiptNode } from '@transport/node/builders/retry'
import type { BinaryNode } from '@transport/types'
import { uint8Equal } from '@util/bytes'
import { setBoundedMapEntry } from '@util/collections'
import { toError } from '@util/primitives'

interface WaRetryCoordinatorOptions {
    readonly logger: Logger
    readonly retryStore: WaRetryStore
    readonly signalStore: WaSignalStore
    readonly preKeyStore: WaPreKeyStore
    readonly sessionStore: WaSessionStore
    readonly senderKeyStore: WaSenderKeyStore
    readonly signalProtocol: SignalProtocol
    readonly signalDeviceSync: SignalDeviceSyncApi
    readonly signalMissingPreKeysSync: SignalMissingPreKeysSyncApi
    readonly messageClient: WaMessageClient
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly getCurrentMeJid: () => string | null | undefined
    readonly getCurrentMeLid: () => string | null | undefined
    readonly getCurrentSignedIdentity: () => Proto.IADVSignedDeviceIdentity | null | undefined
}

type RetryAuthorization =
    | { readonly authorized: true }
    | { readonly authorized: false; readonly reason: string }

interface RetryDecryptFailurePreparation {
    readonly registrationId: number
    readonly retryCount: number
    readonly retryKeys?: WaRetryKeyBundle
    readonly retryReason: number | undefined
    readonly timestamp: string
}

interface RetryResendPreparation {
    readonly requesterJid: string
    readonly requesterAddress: ReturnType<typeof parseSignalAddressFromJid>
    readonly requesterNormalizedDeviceJid: string
    readonly outbound: WaRetryOutboundMessageRecord
}

const RETRY_CLEANUP_INTERVAL_MS = 30_000
const RETRY_SESSION_BASE_KEY_CACHE_MAX_ENTRIES = 8_192

interface RetrySessionBaseKeySnapshot {
    readonly baseKey: Uint8Array
    readonly expiresAtMs: number
}

function getRetryReasonName(code: number | undefined): string | undefined {
    if (code === undefined) {
        return undefined
    }
    for (const reasonName in RETRY_REASON) {
        if (RETRY_REASON[reasonName as keyof typeof RETRY_REASON] === code) return reasonName
    }
    return 'unknown'
}

function getRemoteRetryReasonLogFields(reason: number | undefined): {
    readonly hasRemoteRetryReason: boolean
    readonly remoteRetryReason: number | null
    readonly remoteRetryReasonName: string
} {
    return {
        hasRemoteRetryReason: reason !== undefined,
        remoteRetryReason: reason ?? null,
        remoteRetryReasonName: getRetryReasonName(reason) ?? 'missing_in_retry_receipt'
    }
}

export class WaRetryCoordinator {
    private readonly logger: Logger
    private readonly retryStore: WaRetryStore
    private readonly retryTtlMs: number
    private readonly signalStore: WaSignalStore
    private readonly preKeyStore: WaPreKeyStore
    private readonly sessionStore: WaSessionStore
    private readonly senderKeyStore: WaSenderKeyStore
    private readonly signalProtocol: SignalProtocol
    private readonly signalDeviceSync: SignalDeviceSyncApi
    private readonly signalMissingPreKeysSync: SignalMissingPreKeysSyncApi
    private readonly retryReplayService: WaRetryReplayService
    private readonly sendNode: (node: BinaryNode) => Promise<void>
    private readonly getCurrentMeJid: () => string | null | undefined
    private readonly getCurrentMeLid: () => string | null | undefined
    private readonly getCurrentSignedIdentity: () =>
        | Proto.IADVSignedDeviceIdentity
        | null
        | undefined
    private readonly retryProcessingByMessageId: Map<string, Promise<void>>
    private readonly retrySessionBaseKeys: Map<string, RetrySessionBaseKeySnapshot>
    private nextRetryCleanupAtMs = 0

    public constructor(options: WaRetryCoordinatorOptions) {
        this.logger = options.logger
        this.retryStore = options.retryStore
        this.retryTtlMs = this.retryStore.getTtlMs?.() ?? RETRY_OUTBOUND_TTL_MS
        this.signalStore = options.signalStore
        this.preKeyStore = options.preKeyStore
        this.sessionStore = options.sessionStore
        this.senderKeyStore = options.senderKeyStore
        this.signalProtocol = options.signalProtocol
        this.signalDeviceSync = options.signalDeviceSync
        this.signalMissingPreKeysSync = options.signalMissingPreKeysSync
        this.sendNode = options.sendNode
        this.getCurrentMeJid = options.getCurrentMeJid
        this.getCurrentMeLid = options.getCurrentMeLid
        this.getCurrentSignedIdentity = options.getCurrentSignedIdentity
        this.retryReplayService = new WaRetryReplayService({
            logger: this.logger,
            messageClient: options.messageClient,
            signalProtocol: this.signalProtocol,
            getCurrentMeJid: this.getCurrentMeJid,
            getCurrentMeLid: this.getCurrentMeLid,
            getCurrentSignedIdentity: this.getCurrentSignedIdentity
        })
        this.retryProcessingByMessageId = new Map()
        this.retrySessionBaseKeys = new Map()
    }

    public async onDecryptFailure(
        context: WaRetryDecryptFailureContext,
        error: unknown
    ): Promise<boolean> {
        try {
            const prepared = await this.prepareDecryptFailureRetry(context, error)
            if (!prepared) {
                return false
            }
            await this.sendDecryptFailureRetryReceipt(context, prepared)
            return true
        } catch (sendError) {
            this.logger.warn('failed to send retry receipt for decrypt failure', {
                id: context.stanzaId,
                from: context.from,
                participant: context.participant,
                message: toError(sendError).message
            })
            return false
        }
    }

    public async handleIncomingRetryReceipt(receiptNode: BinaryNode): Promise<void> {
        if (!this.isRetryReceiptNode(receiptNode)) {
            return
        }

        let shouldAck = false
        try {
            await this.maybeCleanupRetryStore(Date.now())
            const expectedToJids: string[] = []
            const meJid = this.getCurrentMeJid()?.trim()
            const meLid = this.getCurrentMeLid()?.trim()
            if (meJid) {
                expectedToJids.push(meJid)
            }
            if (meLid) {
                expectedToJids.push(meLid)
            }
            const request = parseRetryReceiptRequest(
                receiptNode,
                expectedToJids.length > 0 ? { expectedToJids } : undefined
            )
            if (!request) {
                return
            }
            shouldAck = true
            await this.handleParsedRetryRequest(receiptNode, request)
        } catch (error) {
            this.logger.warn('failed handling incoming retry request', {
                id: receiptNode.attrs.id,
                from: receiptNode.attrs.from,
                participant: receiptNode.attrs.participant,
                message: toError(error).message
            })
        } finally {
            if (shouldAck) {
                await this.sendRetryAckSafe(receiptNode)
            }
        }
    }

    private isRetryReceiptNode(node: BinaryNode): boolean {
        return (
            node.tag === WA_MESSAGE_TAGS.RECEIPT &&
            (node.attrs.type === 'retry' || node.attrs.type === 'enc_rekey_retry')
        )
    }

    private async prepareDecryptFailureRetry(
        context: WaRetryDecryptFailureContext,
        error: unknown
    ): Promise<RetryDecryptFailurePreparation | null> {
        const nowMs = Date.now()
        const registrationInfo = await this.signalStore.getRegistrationInfo()
        if (!registrationInfo) {
            this.logger.warn('retry receipt skipped: missing local registration info', {
                id: context.stanzaId,
                from: context.from
            })
            return null
        }

        const requester = context.participant ?? context.from
        const expiresAtMs = nowMs + this.retryTtlMs
        const retryCount = await this.retryStore.incrementInboundCounter(
            context.stanzaId,
            requester,
            nowMs,
            expiresAtMs
        )
        return {
            registrationId: registrationInfo.registrationId,
            retryCount,
            retryKeys:
                retryCount >= RETRY_KEYS_MIN_COUNT
                    ? await this.buildRetryKeysSection(registrationInfo.identityKeyPair.pubKey)
                    : undefined,
            retryReason: mapRetryReasonFromError(error),
            timestamp: context.t ?? String(Math.trunc(nowMs / 1000))
        }
    }

    private async sendDecryptFailureRetryReceipt(
        context: WaRetryDecryptFailureContext,
        prepared: RetryDecryptFailurePreparation
    ): Promise<void> {
        const retryReceiptNode = buildRetryReceiptNode({
            stanzaId: context.stanzaId,
            to: context.from,
            participant: context.participant,
            recipient: context.recipient,
            originalMsgId: context.stanzaId,
            retryCount: prepared.retryCount,
            t: prepared.timestamp,
            registrationId: prepared.registrationId,
            error: prepared.retryReason,
            categoryPeer: context.messageNode.attrs.category === 'peer',
            keys: prepared.retryKeys
        })
        await this.sendNode(retryReceiptNode)
        this.logger.debug('sent retry receipt for decrypt failure', {
            id: context.stanzaId,
            to: context.from,
            participant: context.participant,
            retryCount: prepared.retryCount,
            reason: prepared.retryReason,
            withKeys: prepared.retryKeys !== undefined
        })
    }

    private async handleParsedRetryRequest(
        receiptNode: BinaryNode,
        request: WaParsedRetryRequest
    ): Promise<void> {
        if (request.type === 'enc_rekey_retry') {
            this.logger.info('received enc_rekey_retry request (voip path deferred)', {
                id: request.stanzaId,
                originalMsgId: request.originalMsgId,
                from: request.from,
                participant: request.participant,
                remoteRetryCount: request.retryCount,
                ...getRemoteRetryReasonLogFields(request.retryReason)
            })
            return
        }

        await this.runRetryTaskSerialized(request.originalMsgId, async () => {
            await this.processRetryRequest(request)
        })
    }

    private async processRetryRequest(request: WaParsedRetryRequest): Promise<void> {
        const prepared = await this.prepareRetryResend(request)
        if (!prepared) {
            return
        }
        const resendResult = await this.retryReplayService.resendOutboundMessage(
            prepared.outbound,
            prepared.requesterJid,
            request.retryCount
        )
        if (resendResult === 'ineligible') {
            this.logger.info('retry request marked ineligible for resend', {
                id: request.stanzaId,
                originalMsgId: request.originalMsgId,
                requester: prepared.requesterJid,
                mode: prepared.outbound.replayMode
            })
            return
        }

        this.logger.info('retry request processed and resent', {
            id: request.stanzaId,
            originalMsgId: request.originalMsgId,
            requester: prepared.requesterJid,
            mode: prepared.outbound.replayMode,
            remoteRetryCount: request.retryCount,
            ...getRemoteRetryReasonLogFields(request.retryReason)
        })
    }

    private async prepareRetryResend(
        request: WaParsedRetryRequest
    ): Promise<RetryResendPreparation | null> {
        const requesterJid = request.participant ?? request.from ?? null
        if (!requesterJid) {
            this.logger.warn('retry request ignored: missing requester jid', {
                id: request.stanzaId,
                originalMsgId: request.originalMsgId
            })
            return null
        }
        let requesterAddress: ReturnType<typeof parseSignalAddressFromJid>
        let requesterNormalizedDeviceJid: string
        try {
            const requesterParsed = parseJidFull(requesterJid)
            requesterAddress = requesterParsed.address
            requesterNormalizedDeviceJid = requesterParsed.normalizedJid
        } catch (error) {
            this.logger.info('retry request rejected: invalid requester jid', {
                id: request.stanzaId,
                originalMsgId: request.originalMsgId,
                requester: requesterJid,
                message: toError(error).message
            })
            return null
        }

        if (request.retryCount >= MAX_RETRY_ATTEMPTS) {
            this.logger.info('retry request rejected: retry count exceeded', {
                id: request.stanzaId,
                originalMsgId: request.originalMsgId,
                requester: requesterJid,
                remoteRetryCount: request.retryCount,
                ...getRemoteRetryReasonLogFields(request.retryReason)
            })
            return null
        }

        const outbound = await this.retryStore.getOutboundMessage(request.originalMsgId)
        if (!outbound) {
            this.logger.info('retry request ignored: outbound message not found', {
                id: request.stanzaId,
                originalMsgId: request.originalMsgId,
                requester: requesterJid
            })
            return null
        }

        const sessionReady = await this.updateLocalSessionFromRetryRequest(
            request,
            requesterJid,
            requesterAddress,
            requesterNormalizedDeviceJid
        )
        if (!sessionReady) {
            this.logger.info('retry request rejected: missing compatible session', {
                id: request.stanzaId,
                originalMsgId: request.originalMsgId,
                requester: requesterJid,
                remoteRetryCount: request.retryCount,
                ...getRemoteRetryReasonLogFields(request.retryReason)
            })
            return null
        }

        const authorization = await this.authorizeRetryRequest(
            request,
            outbound,
            requesterJid,
            requesterAddress,
            requesterNormalizedDeviceJid
        )
        if (!authorization.authorized) {
            this.logger.info('retry request rejected', {
                id: request.stanzaId,
                originalMsgId: request.originalMsgId,
                requester: requesterJid,
                reason: authorization.reason,
                remoteRetryCount: request.retryCount,
                ...getRemoteRetryReasonLogFields(request.retryReason)
            })
            return null
        }

        return {
            requesterJid,
            requesterAddress,
            requesterNormalizedDeviceJid,
            outbound
        }
    }

    public async trackOutboundReceipt(receiptNode: BinaryNode): Promise<void> {
        if (receiptNode.tag !== WA_MESSAGE_TAGS.RECEIPT) {
            return
        }
        const messageId = receiptNode.attrs.id
        if (!messageId) {
            return
        }
        const receiptType = receiptNode.attrs.type
        if (receiptType === 'retry' || receiptType === 'enc_rekey_retry') {
            return
        }
        const nextState = this.mapOutboundStateFromReceiptType(receiptType)
        if (!nextState) {
            return
        }

        await this.runRetryTaskSerialized(messageId, async () => {
            const current = await this.retryStore.getOutboundMessage(messageId)
            if (!current) {
                return
            }
            const nowMs = Date.now()
            const expiresAtMs = nowMs + this.retryTtlMs
            const merged = pickRetryStateMax(current.state, nextState)
            if (merged !== current.state) {
                await this.retryStore.updateOutboundMessageState(
                    messageId,
                    merged,
                    nowMs,
                    expiresAtMs
                )
            }
            const requesterJid = receiptNode.attrs.participant ?? receiptNode.attrs.from
            if (!requesterJid) {
                return
            }
            try {
                await this.retryStore.markOutboundRequesterDelivered(
                    messageId,
                    normalizeDeviceJid(requesterJid),
                    nowMs,
                    expiresAtMs
                )
            } catch (error) {
                this.logger.warn('failed to update outbound requester delivery state', {
                    id: messageId,
                    requester: requesterJid,
                    message: toError(error).message
                })
            }
        })
    }

    private async runRetryTaskSerialized(
        messageId: string,
        task: () => Promise<void>
    ): Promise<void> {
        const previous = this.retryProcessingByMessageId.get(messageId) ?? Promise.resolve()
        const current = previous.then(task)
        const tracker = current.then(
            () => undefined,
            () => undefined
        )
        this.retryProcessingByMessageId.set(messageId, tracker)

        try {
            await current
        } finally {
            const latest = this.retryProcessingByMessageId.get(messageId)
            if (latest === tracker) {
                this.retryProcessingByMessageId.delete(messageId)
            }
        }
    }

    private async buildRetryKeysSection(
        identity: Uint8Array
    ): Promise<WaRetryKeyBundle | undefined> {
        const [signedPreKey, preKey] = await Promise.all([
            this.signalStore.getSignedPreKey(),
            this.preKeyStore.getOrGenSinglePreKey(generatePreKeyPair)
        ])
        if (!signedPreKey) {
            this.logger.warn('retry keys section skipped: signed prekey unavailable')
            return undefined
        }
        await this.preKeyStore.markKeyAsUploaded(preKey.keyId)
        const signedIdentity = this.getCurrentSignedIdentity()
        return {
            identity,
            key: {
                id: preKey.keyId,
                publicKey: preKey.keyPair.pubKey
            },
            skey: {
                id: signedPreKey.keyId,
                publicKey: signedPreKey.keyPair.pubKey,
                signature: signedPreKey.signature
            },
            deviceIdentity: signedIdentity
                ? proto.ADVSignedDeviceIdentity.encode(signedIdentity).finish()
                : undefined
        }
    }

    private async updateLocalSessionFromRetryRequest(
        request: WaParsedRetryRequest,
        requesterJid: string,
        requesterAddress: ReturnType<typeof parseSignalAddressFromJid>,
        requesterNormalizedDeviceJid: string
    ): Promise<boolean> {
        const [, currentSession] = await Promise.all([
            this.markRetryRequesterSenderKeyAsStale(request, requesterJid, requesterAddress),
            this.sessionStore.getSession(requesterAddress)
        ])
        const regIdMismatch =
            !!currentSession && request.regId > 0 && currentSession.remote.regId !== request.regId
        if (regIdMismatch && !request.keyBundle) {
            await this.sessionStore.deleteSession(requesterAddress)
        }
        if (request.keyBundle) {
            if (!request.keyBundle.key || !request.keyBundle.skey.signature) {
                return false
            }
            if (request.offline) {
                if (!currentSession) {
                    this.logger.info(
                        'retry request rejected: offline retry missing existing session',
                        {
                            id: request.stanzaId,
                            originalMsgId: request.originalMsgId,
                            requester: requesterJid,
                            remoteRetryCount: request.retryCount,
                            ...getRemoteRetryReasonLogFields(request.retryReason)
                        }
                    )
                    await this.sessionStore.deleteSession(requesterAddress)
                    return false
                }
                if (regIdMismatch) {
                    this.logger.info(
                        'retry request rejected: offline retry registration id mismatch',
                        {
                            id: request.stanzaId,
                            originalMsgId: request.originalMsgId,
                            requester: requesterJid,
                            remoteRetryCount: request.retryCount,
                            ...getRemoteRetryReasonLogFields(request.retryReason)
                        }
                    )
                    await this.sessionStore.deleteSession(requesterAddress)
                    return false
                }
            } else if (regIdMismatch) {
                await this.sessionStore.deleteSession(requesterAddress)
            }
            await this.signalProtocol.establishOutgoingSession(requesterAddress, {
                regId: request.regId,
                identity: request.keyBundle.identity,
                signedKey: {
                    id: request.keyBundle.skey.id,
                    publicKey: request.keyBundle.skey.publicKey,
                    signature: request.keyBundle.skey.signature
                },
                oneTimeKey: {
                    id: request.keyBundle.key.id,
                    publicKey: request.keyBundle.key.publicKey
                }
            })
            return this.applySessionBaseKeyPolicy(
                request,
                requesterJid,
                requesterAddress,
                requesterNormalizedDeviceJid
            )
        }

        const sessionStillExists = currentSession !== null && !regIdMismatch
        if (sessionStillExists) {
            return this.applySessionBaseKeyPolicy(
                request,
                requesterJid,
                requesterAddress,
                requesterNormalizedDeviceJid
            )
        }

        const fetched = await this.fetchMissingPreKeysSession(
            requesterJid,
            requesterAddress,
            requesterNormalizedDeviceJid,
            request.regId
        )
        if (!fetched) {
            return false
        }
        await this.signalProtocol.establishOutgoingSession(requesterAddress, fetched)
        return this.applySessionBaseKeyPolicy(
            request,
            requesterJid,
            requesterAddress,
            requesterNormalizedDeviceJid
        )
    }

    private async applySessionBaseKeyPolicy(
        request: WaParsedRetryRequest,
        requesterJid: string,
        requesterAddress: ReturnType<typeof parseSignalAddressFromJid>,
        requesterNormalizedDeviceJid: string
    ): Promise<boolean> {
        if (request.retryCount < 2) {
            return true
        }
        const currentSession = await this.sessionStore.getSession(requesterAddress)
        const sessionBaseKey = currentSession?.aliceBaseKey ?? null
        if (!sessionBaseKey) {
            return true
        }
        const expiresAtMs = Date.now() + this.retryTtlMs
        if (request.retryCount === 2) {
            this.setRetrySessionBaseKey(
                request.originalMsgId,
                requesterNormalizedDeviceJid,
                sessionBaseKey,
                expiresAtMs
            )
            return true
        }

        const saved = this.getRetrySessionBaseKey(
            request.originalMsgId,
            requesterNormalizedDeviceJid
        )
        if (!saved || !uint8Equal(saved.baseKey, sessionBaseKey)) {
            return true
        }

        await this.sessionStore.deleteSession(requesterAddress)
        this.logger.info('retry request forcing session refresh due to repeated base key', {
            id: request.stanzaId,
            originalMsgId: request.originalMsgId,
            requester: requesterJid,
            remoteRetryCount: request.retryCount,
            ...getRemoteRetryReasonLogFields(request.retryReason)
        })
        const fetched = await this.fetchMissingPreKeysSession(
            requesterJid,
            requesterAddress,
            requesterNormalizedDeviceJid,
            request.regId
        )
        if (!fetched) {
            return false
        }
        await this.signalProtocol.establishOutgoingSession(requesterAddress, fetched)
        return true
    }

    private async markRetryRequesterSenderKeyAsStale(
        request: WaParsedRetryRequest,
        requesterJid: string,
        requesterAddress: ReturnType<typeof parseSignalAddressFromJid>
    ): Promise<void> {
        if (!isGroupOrBroadcastJid(request.from)) {
            return
        }
        try {
            const deleted = await this.senderKeyStore.markForgetSenderKey(request.from, [
                requesterAddress
            ])
            this.logger.debug('marked sender key as stale for group retry requester', {
                groupJid: request.from,
                requester: requesterJid,
                deleted
            })
        } catch (error) {
            this.logger.warn('failed to mark sender key as stale for group retry requester', {
                groupJid: request.from,
                requester: requesterJid,
                message: toError(error).message
            })
        }
    }

    private async fetchMissingPreKeysSession(
        requesterJid: string,
        requesterAddress: ReturnType<typeof parseSignalAddressFromJid>,
        requesterNormalizedDeviceJid: string,
        requesterRegistrationId: number
    ): Promise<SignalPreKeyBundle | null> {
        try {
            const results = await this.signalMissingPreKeysSync.fetchMissingPreKeys([
                {
                    userJid: `${requesterAddress.user}@${requesterAddress.server}`,
                    devices: [
                        {
                            deviceId: requesterAddress.device,
                            registrationId: requesterRegistrationId
                        }
                    ]
                }
            ])
            const first = results[0]
            if (!first || !('devices' in first)) {
                this.logger.warn('missing prekeys fetch returned user error', {
                    requester: requesterJid,
                    errorText: first && 'errorText' in first ? first.errorText : 'unknown'
                })
                return null
            }

            const matched = first.devices.find(
                (device) => normalizeDeviceJid(device.deviceJid) === requesterNormalizedDeviceJid
            )
            if (!matched) {
                this.logger.warn('missing prekeys fetch did not return requested device', {
                    requester: requesterJid,
                    devices: first.devices.length
                })
                return null
            }
            return matched.bundle
        } catch (error) {
            this.logger.warn('failed to fetch missing prekeys for retry requester', {
                requester: requesterJid,
                message: toError(error).message
            })
            return null
        }
    }

    private async authorizeRetryRequest(
        request: WaParsedRetryRequest,
        outbound: WaRetryOutboundMessageRecord,
        requesterJid: string,
        requesterAddress: ReturnType<typeof parseSignalAddressFromJid>,
        requesterNormalizedDeviceJid: string
    ): Promise<RetryAuthorization> {
        if (outbound.state === 'ineligible') {
            return { authorized: false, reason: `state_${outbound.state}` }
        }
        let requesterStatus: {
            readonly eligible: boolean
            readonly delivered: boolean
        } | null = null
        try {
            requesterStatus = await this.retryStore.getOutboundRequesterStatus(
                outbound.messageId,
                requesterNormalizedDeviceJid
            )
        } catch (error) {
            this.logger.warn('failed to resolve outbound requester status from retry store', {
                id: request.stanzaId,
                originalMsgId: request.originalMsgId,
                requester: requesterJid,
                message: toError(error).message
            })
        }
        if (requesterStatus) {
            if (!requesterStatus.eligible) {
                return { authorized: false, reason: 'requester_device_not_eligible' }
            }
            if (requesterStatus.delivered) {
                return { authorized: false, reason: 'requester_already_delivered' }
            }
        }
        const isGroupOutbound = isGroupOrBroadcastJid(outbound.toJid)
        if (!isGroupOutbound && (outbound.state === 'read' || outbound.state === 'played')) {
            return { authorized: false, reason: `state_${outbound.state}` }
        }
        if (!requesterStatus) {
            const requesterAuthorized = await this.isRequesterAuthorizedDevice(
                requesterJid,
                requesterAddress,
                requesterNormalizedDeviceJid
            )
            if (!requesterAuthorized) {
                return { authorized: false, reason: 'requester_device_not_authorized' }
            }
        }
        return { authorized: true }
    }

    private async isRequesterAuthorizedDevice(
        requesterJid: string,
        requesterAddress: ReturnType<typeof parseSignalAddressFromJid>,
        requesterNormalizedDeviceJid: string
    ): Promise<boolean> {
        try {
            const requesterUser = `${requesterAddress.user}@${requesterAddress.server}`
            if (requesterNormalizedDeviceJid === normalizeDeviceJid(requesterUser)) {
                return true
            }
            const synced = await this.signalDeviceSync.syncDeviceList([requesterUser])
            const target = synced.find((entry) => entry.jid === requesterUser)
            if (!target) {
                return false
            }
            for (let index = 0; index < target.deviceJids.length; index += 1) {
                if (normalizeDeviceJid(target.deviceJids[index]) === requesterNormalizedDeviceJid) {
                    return true
                }
            }
            return false
        } catch (error) {
            this.logger.warn('retry authorization failed while syncing requester device list', {
                requester: requesterJid,
                message: toError(error).message
            })
            return false
        }
    }

    private mapOutboundStateFromReceiptType(type: string | undefined): WaRetryOutboundState | null {
        if (type === 'read') {
            return 'read'
        }
        if (type === 'played') {
            return 'played'
        }
        if (
            type === undefined ||
            type === '' ||
            type === 'delivery' ||
            type === 'sender' ||
            type === 'inactive' ||
            type === 'peer_msg'
        ) {
            return 'delivered'
        }
        return null
    }

    private async sendRetryAckSafe(receiptNode: BinaryNode): Promise<void> {
        if (!receiptNode.attrs.id || !receiptNode.attrs.from) {
            this.logger.warn('retry ack skipped: missing receipt id/from', {
                hasId: receiptNode.attrs.id !== undefined,
                hasFrom: receiptNode.attrs.from !== undefined,
                participant: receiptNode.attrs.participant,
                type: receiptNode.attrs.type
            })
            return
        }
        try {
            await this.sendNode(
                buildAckNode({
                    kind: 'receipt',
                    node: receiptNode,
                    retryType: true
                })
            )
        } catch (error) {
            this.logger.warn('failed to send retry ack', {
                id: receiptNode.attrs.id,
                from: receiptNode.attrs.from,
                participant: receiptNode.attrs.participant,
                message: toError(error).message
            })
        }
    }

    private async maybeCleanupRetryStore(nowMs: number): Promise<void> {
        if (nowMs < this.nextRetryCleanupAtMs) {
            return
        }
        this.nextRetryCleanupAtMs = nowMs + RETRY_CLEANUP_INTERVAL_MS
        this.cleanupRetrySessionBaseKeys(nowMs)
        try {
            await this.retryStore.cleanupExpired(nowMs)
        } catch (error) {
            this.logger.warn('retry store cleanup failed', {
                message: toError(error).message
            })
        }
    }

    private retrySessionBaseKeyMapKey(
        originalMsgId: string,
        requesterNormalizedDeviceJid: string
    ): string {
        return `${originalMsgId}|${requesterNormalizedDeviceJid}`
    }

    private setRetrySessionBaseKey(
        originalMsgId: string,
        requesterNormalizedDeviceJid: string,
        baseKey: Uint8Array,
        expiresAtMs: number
    ): void {
        const key = this.retrySessionBaseKeyMapKey(originalMsgId, requesterNormalizedDeviceJid)
        setBoundedMapEntry(
            this.retrySessionBaseKeys,
            key,
            {
                baseKey: Uint8Array.from(baseKey),
                expiresAtMs
            },
            RETRY_SESSION_BASE_KEY_CACHE_MAX_ENTRIES
        )
    }

    private getRetrySessionBaseKey(
        originalMsgId: string,
        requesterNormalizedDeviceJid: string
    ): RetrySessionBaseKeySnapshot | null {
        const key = this.retrySessionBaseKeyMapKey(originalMsgId, requesterNormalizedDeviceJid)
        const entry = this.retrySessionBaseKeys.get(key)
        if (!entry) {
            return null
        }
        if (entry.expiresAtMs <= Date.now()) {
            this.retrySessionBaseKeys.delete(key)
            return null
        }
        return entry
    }

    private cleanupRetrySessionBaseKeys(nowMs: number): void {
        for (const [key, entry] of this.retrySessionBaseKeys) {
            if (entry.expiresAtMs > nowMs) {
                continue
            }
            this.retrySessionBaseKeys.delete(key)
        }
    }
}
