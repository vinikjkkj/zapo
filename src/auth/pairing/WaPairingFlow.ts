import { randomBytesAsync } from '../../crypto'
import type { SignalKeyPair } from '../../crypto/curves/types'
import type { Logger } from '../../infra/log/types'
import { proto } from '../../proto'
import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS, WA_SIGNALING } from '../../protocol/constants'
import {
    ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE,
    WaAdvSignature
} from '../../signal/crypto/WaAdvSignature'
import {
    asNodeBytes,
    findNodeChild,
    getFirstNodeChild,
    hasNodeChild
} from '../../transport/node/helpers'
import type { BinaryNode } from '../../transport/types'
import { decodeProtoBytes } from '../../util/base64'
import { concatBytes, uint8Equal } from '../../util/bytes'
import type { WaAuthCredentials } from '../types'
import { parsePhoneJid } from '../../protocol/jid'

import {
    buildCompanionFinishRequestNode,
    buildCompanionHelloRequestNode,
    buildGetCountryCodeRequestNode,
    buildIqResultNode,
    buildNotificationAckNode,
    extractPairDeviceRefs
} from './nodes'
import {
    completeCompanionFinish,
    createCompanionHello
} from './WaPairingCodeCrypto'

const DEFAULT_BROWSER_DISPLAY_NAME = `${WA_DEFAULTS.DEVICE_BROWSER[0].toUpperCase()}${WA_DEFAULTS.DEVICE_BROWSER.slice(1)}`

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
    readonly getCredentials: () => WaAuthCredentials | null
    readonly updateCredentials: (credentials: WaAuthCredentials) => Promise<void>
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly query: (node: BinaryNode, timeoutMs: number) => Promise<BinaryNode>
    readonly setQrRefs: (refs: readonly string[]) => void
    readonly clearQr: () => void
    readonly refreshQr: () => void
    readonly getDevicePlatform: () => string
    readonly emitPairingCode: (code: string) => void
    readonly emitPairingRefresh: (forceManual: boolean) => void
    readonly emitPaired: (credentials: WaAuthCredentials) => void
}

export class WaPairingFlow {
    private readonly logger: Logger
    private readonly getCredentials: () => WaAuthCredentials | null
    private readonly updateCredentials: (credentials: WaAuthCredentials) => Promise<void>
    private readonly sendNode: (node: BinaryNode) => Promise<void>
    private readonly query: (node: BinaryNode, timeoutMs: number) => Promise<BinaryNode>
    private readonly setQrRefs: (refs: readonly string[]) => void
    private readonly clearQr: () => void
    private readonly refreshQr: () => void
    private readonly getDevicePlatform: () => string
    private readonly emitPairingCode: (code: string) => void
    private readonly emitPairingRefresh: (forceManual: boolean) => void
    private readonly emitPaired: (credentials: WaAuthCredentials) => void
    private pairingSession: ActivePairingSession | null

    public constructor(options: WaPairingFlowOptions) {
        this.logger = options.logger
        this.getCredentials = options.getCredentials
        this.updateCredentials = options.updateCredentials
        this.sendNode = options.sendNode
        this.query = options.query
        this.setQrRefs = options.setQrRefs
        this.clearQr = options.clearQr
        this.refreshQr = options.refreshQr
        this.getDevicePlatform = options.getDevicePlatform
        this.emitPairingCode = options.emitPairingCode
        this.emitPairingRefresh = options.emitPairingRefresh
        this.emitPaired = options.emitPaired
        this.pairingSession = null
    }

    public hasPairingSession(): boolean {
        return this.pairingSession !== null
    }

    public clearSession(): void {
        this.logger.trace('pairing flow session cleared')
        this.pairingSession = null
    }

    public async requestPairingCode(
        phoneNumber: string,
        shouldShowPushNotification = false
    ): Promise<string> {
        this.logger.info('requesting pairing code', {
            shouldShowPushNotification
        })
        const credentials = this.requireCredentials()
        const phoneJid = parsePhoneJid(phoneNumber)
        const companionHello = await createCompanionHello()
        const refreshedCredentials = await this.rotateAdvSecret(credentials)

        const response = await this.query(
            buildCompanionHelloRequestNode({
                phoneJid,
                shouldShowPushNotification,
                wrappedCompanionEphemeralPub: companionHello.wrappedCompanionEphemeralPub,
                companionServerAuthKeyPub: refreshedCredentials.noiseKeyPair.pubKey,
                companionPlatformId: this.getDevicePlatform(),
                companionPlatformDisplay: `${DEFAULT_BROWSER_DISPLAY_NAME} (${process.platform})`
            }),
            WA_DEFAULTS.IQ_TIMEOUT_MS
        )
        this.logger.debug('pairing code request response received', {
            responseTag: response.tag,
            responseType: response.attrs.type
        })

        const linkCodeNode = findNodeChild(response, WA_NODE_TAGS.LINK_CODE_COMPANION_REG)
        if (!linkCodeNode) {
            throw new Error('companion hello response missing link_code_companion_reg')
        }
        const refNode = findNodeChild(linkCodeNode, WA_NODE_TAGS.LINK_CODE_PAIRING_REF)
        if (!refNode) {
            throw new Error('companion hello response missing link_code_pairing_ref')
        }

        const ref = asNodeBytes(refNode.content, 'link_code_pairing_ref')
        this.pairingSession = {
            pairingCode: companionHello.pairingCode,
            phoneJid,
            ref,
            createdAtSeconds: Math.floor(Date.now() / 1000),
            companionEphemeralKeyPair: companionHello.companionEphemeralKeyPair,
            attempts: 0,
            finished: false
        }
        this.emitPairingCode(companionHello.pairingCode)
        this.logger.info('pairing code emitted', {
            phoneJid,
            createdAtSeconds: this.pairingSession.createdAtSeconds
        })
        return companionHello.pairingCode
    }

    public async fetchPairingCountryCodeIso(): Promise<string> {
        this.logger.trace('fetching pairing country code ISO')
        const response = await this.query(buildGetCountryCodeRequestNode(), WA_DEFAULTS.IQ_TIMEOUT_MS)
        const countryCodeNode = findNodeChild(response, WA_NODE_TAGS.COUNTRY_CODE)
        const iso = countryCodeNode?.attrs.iso
        if (!iso) {
            throw new Error('country_code response is missing iso')
        }
        this.logger.debug('pairing country code received', { iso })
        return iso
    }

    public async handleIncomingIqSet(node: BinaryNode): Promise<boolean> {
        this.logger.trace('pairing flow received iq:set', {
            id: node.attrs.id,
            from: node.attrs.from
        })
        const firstChild = getFirstNodeChild(node)
        if (!firstChild) {
            return false
        }
        if (firstChild.tag === WA_NODE_TAGS.PAIR_DEVICE) {
            this.logger.debug('handling pair-device stanza', { id: node.attrs.id })
            await this.handlePairDevice(node, firstChild)
            return true
        }
        if (firstChild.tag === WA_NODE_TAGS.PAIR_SUCCESS) {
            this.logger.debug('handling pair-success stanza', { id: node.attrs.id })
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
        this.logger.trace('handling link_code_companion_reg notification', {
            id: node.attrs.id,
            stage: linkCodeNode.attrs.stage
        })
        await this.sendNode(buildNotificationAckNode(node))

        const stage = linkCodeNode.attrs.stage
        if (stage === WA_SIGNALING.LINK_CODE_STAGE_REFRESH_CODE) {
            const refNode = findNodeChild(linkCodeNode, WA_NODE_TAGS.LINK_CODE_PAIRING_REF)
            if (!refNode || !this.pairingSession?.ref) {
                return true
            }
            const ref = asNodeBytes(refNode.content, 'refresh_code.link_code_pairing_ref')
            if (uint8Equal(ref, this.pairingSession.ref)) {
                this.logger.info('received pairing refresh notification', {
                    forceManualRefresh: linkCodeNode.attrs.force_manual_refresh === 'true'
                })
                this.emitPairingRefresh(linkCodeNode.attrs.force_manual_refresh === 'true')
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
        if (
            node.tag !== WA_NODE_TAGS.NOTIFICATION ||
            node.attrs.type !== WA_SIGNALING.COMPANION_REG_REFRESH_NOTIFICATION
        ) {
            return false
        }
        const hasExpectedChild =
            hasNodeChild(node, WA_SIGNALING.COMPANION_REG_REFRESH_NOTIFICATION) ||
            hasNodeChild(node, 'pair-device-rotate-qr')
        if (!hasExpectedChild) {
            return false
        }

        await this.sendNode(
            buildNotificationAckNode(node, WA_SIGNALING.COMPANION_REG_REFRESH_NOTIFICATION)
        )
        await this.rotateAdvSecret(this.requireCredentials())
        this.logger.info('handled companion_reg_refresh notification')
        this.refreshQr()
        return true
    }

    private async handlePairDevice(iqNode: BinaryNode, pairDeviceNode: BinaryNode): Promise<void> {
        const refs = extractPairDeviceRefs(pairDeviceNode)
        await this.rotateAdvSecret(this.requireCredentials())
        this.setQrRefs(refs)
        this.logger.info('pair-device refs updated', { refsCount: refs.length })
        await this.sendNode(buildIqResultNode(iqNode))
    }

    private async handlePairSuccess(
        iqNode: BinaryNode,
        pairSuccessNode: BinaryNode
    ): Promise<void> {
        this.logger.info('processing pair-success node')
        const credentials = this.requireCredentials()

        const deviceIdentityNode = findNodeChild(pairSuccessNode, WA_NODE_TAGS.DEVICE_IDENTITY)
        const deviceNode = findNodeChild(pairSuccessNode, 'device')
        const platformNode = findNodeChild(pairSuccessNode, WA_NODE_TAGS.PLATFORM)
        if (!deviceIdentityNode || !deviceNode || !platformNode) {
            this.logger.error('pair-success missing required nodes', {
                hasDeviceIdentity: !!deviceIdentityNode,
                hasDevice: !!deviceNode,
                hasPlatform: !!platformNode
            })
            throw new Error('pair-success stanza is missing required nodes')
        }

        const wrappedIdentity = proto.ADVSignedDeviceIdentityHMAC.decode(
            asNodeBytes(deviceIdentityNode.content, 'pair-success.device-identity')
        )
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
        const hmacInput = isHosted
            ? concatBytes([ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE, wrappedDetails])
            : wrappedDetails
        const expectedHmac = await WaAdvSignature.computeAdvIdentityHmac(
            credentials.advSecretKey,
            hmacInput
        )
        if (!uint8Equal(expectedHmac, wrappedHmac)) {
            this.logger.error('pair-success hmac mismatch')
            throw new Error('pair-success HMAC validation failed')
        }

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
        const validAccountSignature = await WaAdvSignature.verifyDeviceIdentityAccountSignature(
            details,
            accountSignature,
            localIdentity.pubKey,
            accountSignatureKey,
            isHosted
        )
        if (!validAccountSignature) {
            this.logger.error('pair-success account signature invalid')
            throw new Error('pair-success account signature validation failed')
        }

        signedIdentity.deviceSignature = await WaAdvSignature.generateDeviceSignature(
            details,
            localIdentity,
            accountSignatureKey,
            isHosted
        )

        const advDeviceIdentity = proto.ADVDeviceIdentity.decode(details)
        const responseIdentityBytes = proto.ADVSignedDeviceIdentity.encode({
            details: signedIdentity.details,
            accountSignature: signedIdentity.accountSignature,
            deviceSignature: signedIdentity.deviceSignature
        }).finish()
        const nextCredentials: WaAuthCredentials = {
            ...credentials,
            signedIdentity,
            meJid: deviceNode.attrs.jid,
            meLid: deviceNode.attrs.lid,
            platform: platformNode.attrs.name
        }
        await this.updateCredentials(nextCredentials)
        this.logger.info('pair-success credentials updated', {
            meJid: nextCredentials.meJid,
            meLid: nextCredentials.meLid,
            platform: nextCredentials.platform
        })
        this.clearQr()
        await this.sendNode({
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
                                'key-index': String(advDeviceIdentity.keyIndex ?? 0)
                            },
                            content: responseIdentityBytes
                        }
                    ]
                }
            ]
        })
        this.emitPaired(nextCredentials)
        this.logger.debug('pair-success completed and paired event emitted')
    }

    private async handlePrimaryHello(linkCodeNode: BinaryNode): Promise<void> {
        const credentials = this.requireCredentials()
        const pairingSession = this.pairingSession
        if (!pairingSession || pairingSession.finished) {
            this.logger.trace('primary_hello ignored: no active session')
            return
        }

        pairingSession.attempts += 1
        this.logger.debug('processing primary_hello', {
            attempts: pairingSession.attempts
        })
        if (pairingSession.attempts > 3) {
            throw new Error('pairing code exceeded maximum primary hello attempts')
        }

        const refNode = findNodeChild(linkCodeNode, WA_NODE_TAGS.LINK_CODE_PAIRING_REF)
        const wrappedPrimaryNode = findNodeChild(
            linkCodeNode,
            'link_code_pairing_wrapped_primary_ephemeral_pub'
        )
        const primaryIdentityNode = findNodeChild(linkCodeNode, 'primary_identity_pub')
        if (!refNode || !wrappedPrimaryNode || !primaryIdentityNode) {
            throw new Error('primary_hello notification is missing fields')
        }

        const ref = asNodeBytes(refNode.content, 'primary_hello.link_code_pairing_ref')
        if (!pairingSession.ref || !uint8Equal(ref, pairingSession.ref)) {
            this.logger.warn('primary_hello ref mismatch ignored')
            return
        }

        const nowSeconds = Math.floor(Date.now() / 1000)
        if (nowSeconds - pairingSession.createdAtSeconds > WA_DEFAULTS.PAIRING_CODE_MAX_AGE_SECONDS) {
            throw new Error('primary_hello received for an expired pairing code')
        }

        const finish = await completeCompanionFinish({
            pairingCode: pairingSession.pairingCode,
            wrappedPrimaryEphemeralPub: asNodeBytes(
                wrappedPrimaryNode.content,
                'primary_hello.link_code_pairing_wrapped_primary_ephemeral_pub'
            ),
            primaryIdentityPub: asNodeBytes(
                primaryIdentityNode.content,
                'primary_hello.primary_identity_pub'
            ),
            companionEphemeralPrivKey: pairingSession.companionEphemeralKeyPair.privKey,
            registrationIdentityKeyPair: credentials.registrationInfo.identityKeyPair
        })

        await this.updateCredentials({
            ...credentials,
            advSecretKey: finish.advSecret
        })

        const result = await this.query(
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
        this.logger.info('primary_hello completed with companion_finish success')
    }

    private async rotateAdvSecret(credentials: WaAuthCredentials): Promise<WaAuthCredentials> {
        const nextCredentials = {
            ...credentials,
            advSecretKey: await randomBytesAsync(32)
        }
        await this.updateCredentials(nextCredentials)
        return nextCredentials
    }

    private requireCredentials(): WaAuthCredentials {
        const credentials = this.getCredentials()
        if (!credentials) {
            throw new Error('credentials are not initialized')
        }
        return credentials
    }
}
