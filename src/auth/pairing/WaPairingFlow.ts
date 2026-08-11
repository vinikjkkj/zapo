import {
    completeCompanionFinish,
    createCompanionHello,
    normalizeCustomPairingCode
} from '@auth/pairing/pairing-code-crypto'
import type { WaAuthCredentials, WaAuthDangerousOptions } from '@auth/types'
import { randomBytesAsync } from '@crypto'
import type { SignalKeyPair } from '@crypto/curves/types'
import type { Logger } from '@infra/log/types'
import { proto } from '@proto'
import { getWaBrowserDisplayName } from '@protocol/browser'
import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS, WA_SIGNALING } from '@protocol/constants'
import { parsePhoneJid } from '@protocol/jid'
import {
    ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE,
    computeAdvIdentityHmac,
    generateDeviceSignature,
    verifyDeviceIdentityAccountSignature
} from '@signal/attestation/WaAdvSignature'
import { buildAckNode, buildIqResultNode } from '@transport/node/builders/global'
import {
    buildCompanionFinishRequestNode,
    buildCompanionHelloRequestNode,
    buildGetCountryCodeRequestNode
} from '@transport/node/builders/pairing'
import {
    decodeNodeContentUtf8OrBytes,
    findNodeChild,
    findNodeChildrenByTags,
    getFirstNodeChild,
    getNodeChildrenNonEmptyUtf8ByTag,
    hasNodeChild
} from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { concatBytes, decodeProtoBytes, uint8Equal, uint8TimingSafeEqual } from '@util/bytes'
import { toError } from '@util/primitives'

interface ActivePairingSession {
    readonly ref?: Uint8Array
    readonly createdAtSeconds: number
    readonly companionEphemeralKeyPair: SignalKeyPair
    readonly phoneJid: string
    readonly pairingCode: string
    attempts: number
    finished: boolean
}

interface WaPairingFlowOptions {
    readonly logger: Logger
    readonly auth: {
        readonly getCredentials: () => WaAuthCredentials | null
        readonly updateCredentials: (credentials: WaAuthCredentials) => Promise<void>
    }
    readonly socket: {
        readonly sendNode: (node: BinaryNode) => Promise<void>
        readonly query: (node: BinaryNode, timeoutMs: number) => Promise<BinaryNode>
    }
    readonly qrFlow: {
        readonly setRefs: (refs: readonly string[]) => void
        readonly clear: () => void
        readonly refreshCurrentQr: () => boolean
    }
    readonly device: {
        readonly browser: string
        readonly osDisplayName: string
        readonly platform: string
    }
    readonly callbacks: {
        readonly emitPairingCode: (code: string) => void
        readonly emitPairingRefresh: (forceManual: boolean) => void
        readonly emitPaired: (credentials: WaAuthCredentials) => void
    }
    readonly dangerous?: WaAuthDangerousOptions
}

/** Server-enforced bounds on the `pair-success` `device-identity` payload. */
const PAIR_SUCCESS_DEVICE_IDENTITY_MIN_BYTES = 1
const PAIR_SUCCESS_DEVICE_IDENTITY_MAX_BYTES = 500

export class WaPairingFlow {
    private readonly opts: WaPairingFlowOptions
    private pairingSession: ActivePairingSession | null
    private pairSuccessInFlight = false

    public constructor(options: WaPairingFlowOptions) {
        this.opts = options
        this.pairingSession = null
    }

    public hasPairingSession(): boolean {
        return this.pairingSession !== null
    }

    public clearSession(): void {
        this.opts.logger.trace('pairing flow session cleared')
        this.pairingSession = null
    }

    public async requestPairingCode(
        phoneNumber: string,
        shouldShowPushNotification = true,
        customCode?: string
    ): Promise<string> {
        this.opts.logger.info('requesting pairing code', {
            shouldShowPushNotification,
            hasCustomCode: customCode !== undefined
        })
        const normalizedCustomCode =
            customCode !== undefined ? normalizeCustomPairingCode(customCode) : undefined
        const credentials = this.requireCredentials()
        const phoneJid = parsePhoneJid(phoneNumber)
        const [companionHello, refreshedCredentials] = await Promise.all([
            createCompanionHello({ customCode: normalizedCustomCode }),
            this.rotateAdvSecret(credentials)
        ])
        const browserDisplayName = getWaBrowserDisplayName(this.opts.device.browser)
        const createdAtSeconds = Math.floor(Date.now() / 1000)

        const response = await this.opts.socket.query(
            buildCompanionHelloRequestNode({
                phoneJid,
                shouldShowPushNotification,
                wrappedCompanionEphemeralPub: companionHello.wrappedCompanionEphemeralPub,
                companionServerAuthKeyPub: refreshedCredentials.noiseKeyPair.pubKey,
                companionPlatformId: this.opts.device.platform,
                companionPlatformDisplay: `${browserDisplayName} (${this.opts.device.osDisplayName})`
            }),
            WA_DEFAULTS.IQ_TIMEOUT_MS
        )
        this.opts.logger.debug('pairing code request response received', {
            responseTag: response.tag,
            responseType: response.attrs.type
        })
        assertIqResult(response, 'companion hello')

        const linkCodeNode = findNodeChild(response, WA_NODE_TAGS.LINK_CODE_COMPANION_REG)
        if (!linkCodeNode) {
            throw new Error('companion hello response missing link_code_companion_reg')
        }
        const refNode = findNodeChild(linkCodeNode, WA_NODE_TAGS.LINK_CODE_PAIRING_REF)
        if (!refNode) {
            throw new Error('companion hello response missing link_code_pairing_ref')
        }

        const ref = decodeNodeContentUtf8OrBytes(refNode.content, 'link_code_pairing_ref')
        this.pairingSession = {
            pairingCode: companionHello.pairingCode,
            phoneJid,
            ref,
            createdAtSeconds,
            companionEphemeralKeyPair: companionHello.companionEphemeralKeyPair,
            attempts: 0,
            finished: false
        }
        this.opts.callbacks.emitPairingCode(companionHello.pairingCode)
        this.opts.logger.debug('pairing code emitted', {
            phoneJid,
            createdAtSeconds: this.pairingSession.createdAtSeconds
        })
        return companionHello.pairingCode
    }

    public async fetchPairingCountryCodeIso(): Promise<string> {
        this.opts.logger.trace('fetching pairing country code ISO')
        const response = await this.opts.socket.query(
            buildGetCountryCodeRequestNode(),
            WA_DEFAULTS.IQ_TIMEOUT_MS
        )
        const countryCodeNode = findNodeChild(response, WA_NODE_TAGS.COUNTRY_CODE)
        const iso = countryCodeNode?.attrs.iso
        if (!iso) {
            throw new Error('country_code response is missing iso')
        }
        this.opts.logger.debug('pairing country code received', { iso })
        return iso
    }

    public async handleIncomingIqSet(node: BinaryNode): Promise<boolean> {
        const iqLogger = this.opts.logger.child({ id: node.attrs.id })
        iqLogger.trace('pairing flow received iq:set', { from: node.attrs.from })
        const firstChild = getFirstNodeChild(node)
        if (!firstChild) {
            return false
        }
        if (firstChild.tag === WA_NODE_TAGS.PAIR_DEVICE) {
            iqLogger.debug('handling pair-device stanza')
            await this.handlePairDevice(node, firstChild)
            return true
        }
        if (firstChild.tag === WA_NODE_TAGS.PAIR_SUCCESS) {
            iqLogger.debug('handling pair-success stanza')
            await this.handlePairSuccess(node, firstChild)
            return true
        }
        return false
    }

    public async handleLinkCodeNotification(node: BinaryNode): Promise<boolean> {
        const linkCodeNode = findNodeChild(node, WA_NODE_TAGS.LINK_CODE_COMPANION_REG)
        if (!linkCodeNode) {
            return false
        }
        this.opts.logger.trace('handling link_code_companion_reg notification', {
            id: node.attrs.id,
            stage: linkCodeNode.attrs.stage
        })
        await this.opts.socket.sendNode(
            buildAckNode({
                kind: 'notification',
                node
            })
        )

        const stage = linkCodeNode.attrs.stage
        if (stage === WA_SIGNALING.LINK_CODE_STAGE_REFRESH_CODE) {
            const refNode = findNodeChild(linkCodeNode, WA_NODE_TAGS.LINK_CODE_PAIRING_REF)
            if (!refNode || !this.pairingSession?.ref) {
                return true
            }
            const ref = decodeNodeContentUtf8OrBytes(
                refNode.content,
                'refresh_code.link_code_pairing_ref'
            )
            if (uint8Equal(ref, this.pairingSession.ref)) {
                this.opts.logger.debug('received pairing refresh notification', {
                    forceManualRefresh: linkCodeNode.attrs.force_manual_refresh === 'true'
                })
                this.opts.callbacks.emitPairingRefresh(
                    linkCodeNode.attrs.force_manual_refresh === 'true'
                )
            }
            return true
        }

        if (stage !== WA_SIGNALING.LINK_CODE_STAGE_PRIMARY_HELLO) {
            return true
        }
        await this.handlePrimaryHello(linkCodeNode)
        return true
    }

    public async handleCompanionRegRefreshNotification(node: BinaryNode): Promise<boolean> {
        const hasExpectedChild =
            hasNodeChild(node, WA_SIGNALING.COMPANION_REG_REFRESH_NOTIFICATION) ||
            hasNodeChild(node, 'pair-device-rotate-qr')
        if (!hasExpectedChild) {
            return false
        }

        // Rotate first so we don't ack success before local credential state is durably updated.
        await this.rotateAdvSecret(this.requireCredentials())
        await this.opts.socket.sendNode(
            buildAckNode({
                kind: 'notification',
                node,
                typeOverride: WA_SIGNALING.COMPANION_REG_REFRESH_NOTIFICATION
            })
        )
        this.opts.logger.debug('handled companion_reg_refresh notification')
        this.opts.qrFlow.refreshCurrentQr()
        return true
    }

    private async handlePairDevice(iqNode: BinaryNode, pairDeviceNode: BinaryNode): Promise<void> {
        const refs = getNodeChildrenNonEmptyUtf8ByTag(
            pairDeviceNode,
            WA_NODE_TAGS.REF,
            'pair-device.ref'
        )
        // Commit adv-secret rotation before sending IQ success to avoid protocol/state divergence.
        await this.rotateAdvSecret(this.requireCredentials())
        await this.opts.socket.sendNode(buildIqResultNode(iqNode))
        this.opts.qrFlow.setRefs(refs)
        this.opts.logger.debug('pair-device refs updated', { refsCount: refs.length })
    }

    private async handlePairSuccess(
        iqNode: BinaryNode,
        pairSuccessNode: BinaryNode
    ): Promise<void> {
        if (this.pairSuccessInFlight) {
            this.opts.logger.debug('pair-success ignored: already processing')
            return
        }
        if (this.opts.auth.getCredentials()?.meJid) {
            this.opts.logger.debug('pair-success ignored: session already registered')
            return
        }
        this.pairSuccessInFlight = true
        try {
            await this.completePairSuccess(iqNode, pairSuccessNode)
        } finally {
            this.pairSuccessInFlight = false
        }
    }

    private async completePairSuccess(
        iqNode: BinaryNode,
        pairSuccessNode: BinaryNode
    ): Promise<void> {
        this.opts.logger.debug('processing pair-success node')
        const credentials = this.requireCredentials()
        const [deviceIdentityNode, deviceNode, platformNode] = findNodeChildrenByTags(
            pairSuccessNode,
            [WA_NODE_TAGS.DEVICE_IDENTITY, 'device', WA_NODE_TAGS.PLATFORM] as const
        )
        if (!deviceIdentityNode || !deviceNode || !platformNode) {
            this.opts.logger.error('pair-success missing required nodes', {
                hasDeviceIdentity: !!deviceIdentityNode,
                hasDevice: !!deviceNode,
                hasPlatform: !!platformNode
            })
            throw new Error('pair-success stanza is missing required nodes')
        }
        const deviceIdentityBytes = decodeNodeContentUtf8OrBytes(
            deviceIdentityNode.content,
            'pair-success.device-identity'
        )
        if (
            deviceIdentityBytes.length < PAIR_SUCCESS_DEVICE_IDENTITY_MIN_BYTES ||
            deviceIdentityBytes.length > PAIR_SUCCESS_DEVICE_IDENTITY_MAX_BYTES
        ) {
            throw new Error(
                `pair-success device-identity must be ${PAIR_SUCCESS_DEVICE_IDENTITY_MIN_BYTES}-${PAIR_SUCCESS_DEVICE_IDENTITY_MAX_BYTES} bytes, got ${deviceIdentityBytes.length}`
            )
        }
        const wrappedIdentity = proto.ADVSignedDeviceIdentityHMAC.decode(deviceIdentityBytes)
        const wrappedDetails = decodeProtoBytes(
            wrappedIdentity.details,
            'ADVSignedDeviceIdentityHMAC.details'
        )
        const wrappedHmac = decodeProtoBytes(
            wrappedIdentity.hmac,
            'ADVSignedDeviceIdentityHMAC.hmac'
        )
        const accountType = wrappedIdentity.accountType ?? proto.ADVEncryptionType.E2EE
        const isHosted = accountType === proto.ADVEncryptionType.HOSTED
        if (this.opts.dangerous?.disablePairSuccessHmacVerification !== true) {
            const hmacInput = isHosted
                ? concatBytes([ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE, wrappedDetails])
                : wrappedDetails
            const expectedHmac = computeAdvIdentityHmac(credentials.advSecretKey, hmacInput)
            if (!uint8TimingSafeEqual(expectedHmac, wrappedHmac)) {
                this.opts.logger.error('pair-success hmac mismatch', {
                    meJid: deviceNode.attrs.jid,
                    meLid: deviceNode.attrs.lid,
                    platform: platformNode.attrs.name,
                    isHosted
                })
                await this.sendPairSuccessValidationError(iqNode)
                throw new Error('pair-success HMAC validation failed')
            }
        }

        const built = await this.buildPairSuccessResponseIdentity(credentials, wrappedDetails)
        if (!built) {
            await this.sendPairSuccessValidationError(iqNode)
            throw new Error('pair-success account signature validation failed')
        }
        const { signedIdentity, keyIndex, responseIdentityBytes } = built
        const nextCredentials: WaAuthCredentials = {
            ...credentials,
            signedIdentity,
            meJid: deviceNode.attrs.jid,
            meLid: deviceNode.attrs.lid,
            platform: platformNode.attrs.name,
            loginCounter: 0
        }
        await this.opts.auth.updateCredentials(nextCredentials)
        this.opts.logger.info('pair-success credentials updated', {
            meJid: nextCredentials.meJid,
            meLid: nextCredentials.meLid,
            platform: nextCredentials.platform
        })
        this.opts.qrFlow.clear()
        await this.opts.socket.sendNode({
            tag: WA_NODE_TAGS.IQ,
            attrs: {
                ...(iqNode.attrs.id ? { id: iqNode.attrs.id } : {}),
                to: iqNode.attrs.from ?? WA_DEFAULTS.HOST_DOMAIN,
                type: WA_IQ_TYPES.RESULT
            },
            content: [
                {
                    tag: 'pair-device-sign',
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.DEVICE_IDENTITY,
                            attrs: {
                                'key-index': String(keyIndex)
                            },
                            content: responseIdentityBytes
                        }
                    ]
                }
            ]
        })
        this.opts.callbacks.emitPaired(nextCredentials)
        this.opts.logger.debug('pair-success completed and paired event emitted')
    }

    /** Returns `null` when the primary's account signature does not verify. */
    private async buildPairSuccessResponseIdentity(
        credentials: WaAuthCredentials,
        wrappedDetails: Uint8Array
    ): Promise<{
        readonly signedIdentity: ReturnType<typeof proto.ADVSignedDeviceIdentity.decode>
        readonly keyIndex: number
        readonly responseIdentityBytes: Uint8Array
    } | null> {
        const signedIdentity = proto.ADVSignedDeviceIdentity.decode(wrappedDetails)
        const details = decodeProtoBytes(signedIdentity.details, 'ADVSignedDeviceIdentity.details')
        const accountSignature = decodeProtoBytes(
            signedIdentity.accountSignature,
            'ADVSignedDeviceIdentity.accountSignature'
        )
        const accountSignatureKey = decodeProtoBytes(
            signedIdentity.accountSignatureKey,
            'ADVSignedDeviceIdentity.accountSignatureKey'
        )
        const localIdentity = credentials.registrationInfo.identityKeyPair
        const advDeviceIdentity = proto.ADVDeviceIdentity.decode(details)
        const isDeviceHosted = advDeviceIdentity.deviceType === proto.ADVEncryptionType.HOSTED
        if (this.opts.dangerous?.disableAdvSignatureVerification !== true) {
            const validAccountSignature = await verifyDeviceIdentityAccountSignature(
                details,
                accountSignature,
                localIdentity.pubKey,
                accountSignatureKey,
                isDeviceHosted
            )
            if (!validAccountSignature) {
                this.opts.logger.error('pair-success account signature invalid', {
                    keyIndex: advDeviceIdentity.keyIndex ?? 0,
                    isDeviceHosted
                })
                return null
            }
        }

        signedIdentity.deviceSignature = await generateDeviceSignature(
            details,
            localIdentity,
            accountSignatureKey,
            false
        )
        const responseIdentityBytes = proto.ADVSignedDeviceIdentity.encode({
            details: signedIdentity.details,
            accountSignature: signedIdentity.accountSignature,
            deviceSignature: signedIdentity.deviceSignature
        }).finish()
        return {
            signedIdentity,
            keyIndex: advDeviceIdentity.keyIndex ?? 0,
            responseIdentityBytes
        }
    }

    /** Mirrors the `not-authorized` IQ error WhatsApp Web returns on a failed pair-success. */
    private async sendPairSuccessValidationError(iqNode: BinaryNode): Promise<void> {
        try {
            await this.opts.socket.sendNode({
                tag: WA_NODE_TAGS.IQ,
                attrs: {
                    ...(iqNode.attrs.id ? { id: iqNode.attrs.id } : {}),
                    to: iqNode.attrs.from ?? WA_DEFAULTS.HOST_DOMAIN,
                    type: WA_IQ_TYPES.ERROR
                },
                content: [
                    {
                        tag: 'error',
                        attrs: { code: '401', text: 'not-authorized' }
                    }
                ]
            })
        } catch (error) {
            this.opts.logger.warn('failed to send pair-success error response', {
                message: toError(error).message
            })
        }
    }

    private async handlePrimaryHello(linkCodeNode: BinaryNode): Promise<void> {
        let credentials = this.requireCredentials()
        const pairingSession = this.pairingSession
        if (!pairingSession) {
            this.opts.logger.trace('primary_hello ignored: no active session')
            return
        }

        pairingSession.attempts += 1
        this.opts.logger.debug('processing primary_hello', {
            attempts: pairingSession.attempts,
            finished: pairingSession.finished
        })
        if (pairingSession.finished) {
            if (pairingSession.attempts > WA_DEFAULTS.PAIRING_CODE_MAX_PRIMARY_HELLOS) {
                throw new Error('pairing code exceeded maximum primary hello attempts')
            }
            credentials = await this.rotateAdvSecret(credentials)
            pairingSession.finished = false
        }

        const [refNode, wrappedPrimaryNode, primaryIdentityNode] = findNodeChildrenByTags(
            linkCodeNode,
            [
                WA_NODE_TAGS.LINK_CODE_PAIRING_REF,
                'link_code_pairing_wrapped_primary_ephemeral_pub',
                'primary_identity_pub'
            ] as const
        )
        if (!refNode || !wrappedPrimaryNode || !primaryIdentityNode) {
            throw new Error('primary_hello notification is missing fields')
        }

        const ref = decodeNodeContentUtf8OrBytes(
            refNode.content,
            'primary_hello.link_code_pairing_ref'
        )
        if (!pairingSession.ref || !uint8Equal(ref, pairingSession.ref)) {
            this.opts.logger.warn('primary_hello ref mismatch ignored', {
                phoneJid: pairingSession.phoneJid
            })
            return
        }

        const nowSeconds = Math.floor(Date.now() / 1000)
        if (
            nowSeconds - pairingSession.createdAtSeconds >
            WA_DEFAULTS.PAIRING_CODE_MAX_AGE_SECONDS
        ) {
            throw new Error('primary_hello received for an expired pairing code')
        }

        const finish = await completeCompanionFinish({
            pairingCode: pairingSession.pairingCode,
            wrappedPrimaryEphemeralPub: decodeNodeContentUtf8OrBytes(
                wrappedPrimaryNode.content,
                'primary_hello.link_code_pairing_wrapped_primary_ephemeral_pub'
            ),
            primaryIdentityPub: decodeNodeContentUtf8OrBytes(
                primaryIdentityNode.content,
                'primary_hello.primary_identity_pub'
            ),
            companionEphemeralPrivKey: pairingSession.companionEphemeralKeyPair.privKey,
            registrationIdentityKeyPair: credentials.registrationInfo.identityKeyPair
        })

        await this.opts.auth.updateCredentials({
            ...credentials,
            advSecretKey: finish.advSecret
        })

        const result = await this.opts.socket.query(
            buildCompanionFinishRequestNode({
                phoneJid: pairingSession.phoneJid,
                wrappedKeyBundle: finish.wrappedKeyBundle,
                companionIdentityPublic: finish.companionIdentityPublic,
                ref
            }),
            WA_DEFAULTS.IQ_TIMEOUT_MS
        )
        if (result.attrs.type === WA_IQ_TYPES.ERROR) {
            throw new Error('companion_finish returned error')
        }
        pairingSession.finished = true
        this.opts.logger.debug('primary_hello completed with companion_finish success')
    }

    private async rotateAdvSecret(credentials: WaAuthCredentials): Promise<WaAuthCredentials> {
        const nextCredentials = {
            ...credentials,
            advSecretKey: await randomBytesAsync(32)
        }
        await this.opts.auth.updateCredentials(nextCredentials)
        return nextCredentials
    }

    private requireCredentials(): WaAuthCredentials {
        const credentials = this.opts.auth.getCredentials()
        if (!credentials) {
            throw new Error('credentials are not initialized')
        }
        return credentials
    }
}
