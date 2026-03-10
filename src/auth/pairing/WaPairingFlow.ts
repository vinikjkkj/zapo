import { randomBytesAsync } from '../../crypto'
import type { Logger } from '../../infra/log/types'
import {
    asNodeBytes,
    findNodeChild,
    getFirstNodeChild,
    hasNodeChild
} from '../../transport/node/helpers'
import type { BinaryNode } from '../../transport/types'
import { uint8Equal } from '../../util/bytes'
import type { WaAuthCredentials } from '../types'

import { IQ_TIMEOUT_MS, PAIRING_CODE_MAX_AGE_SECONDS } from './constants'
import { parsePhoneJid } from './identity'
import {
    buildCompanionFinishRequestNode,
    buildCompanionHelloRequestNode,
    buildGetCountryCodeRequestNode,
    buildIqResultNode,
    buildNotificationAckNode,
    extractPairDeviceRefs
} from './nodes'
import type {
    ActivePairingSession,
    WaPairingFlowCallbacks,
    WaPairingFlowOptions
} from './types'
import { WaPairingCodeCrypto } from './WaPairingCodeCrypto'
import { WaPairingSuccessHandler } from './WaPairingSuccessHandler'

export class WaPairingFlow {
    private readonly logger: Logger
    private readonly pairingCrypto: WaPairingCodeCrypto
    private readonly auth: WaPairingFlowOptions['auth']
    private readonly socket: WaPairingFlowOptions['socket']
    private readonly qr: WaPairingFlowOptions['qr']
    private readonly callbacks: WaPairingFlowCallbacks
    private readonly pairingSuccessHandler: WaPairingSuccessHandler
    private pairingSession: ActivePairingSession | null

    public constructor(options: WaPairingFlowOptions) {
        this.logger = options.logger
        this.pairingCrypto = options.pairingCrypto
        this.auth = options.auth
        this.socket = options.socket
        this.qr = options.qr
        this.callbacks = options.callbacks
        this.pairingSuccessHandler = new WaPairingSuccessHandler({
            logger: options.logger,
            advSignature: options.advSignature,
            auth: this.auth,
            socket: this.socket,
            qr: this.qr,
            emitPaired: this.callbacks.emitPaired
        })
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
        const companionHello = await this.pairingCrypto.createCompanionHello()

        const refreshedCredentials: WaAuthCredentials = {
            ...credentials,
            advSecretKey: await randomBytesAsync(32)
        }
        await this.auth.updateCredentials(refreshedCredentials)

        const response = await this.socket.query(
            buildCompanionHelloRequestNode({
                phoneJid,
                shouldShowPushNotification,
                wrappedCompanionEphemeralPub: companionHello.wrappedCompanionEphemeralPub,
                companionServerAuthKeyPub: refreshedCredentials.noiseKeyPair.pubKey,
                companionPlatformId: this.auth.getDevicePlatform(),
                companionPlatformDisplay: `Firefox (${process.platform})`
            }),
            IQ_TIMEOUT_MS
        )
        this.logger.debug('pairing code request response received', {
            responseTag: response.tag,
            responseType: response.attrs.type
        })

        const linkCodeNode = findNodeChild(response, 'link_code_companion_reg')
        if (!linkCodeNode) {
            throw new Error('companion hello response missing link_code_companion_reg')
        }
        const refNode = findNodeChild(linkCodeNode, 'link_code_pairing_ref')
        if (!refNode) {
            throw new Error('companion hello response missing link_code_pairing_ref')
        }

        const ref = asNodeBytes(refNode.content, 'link_code_pairing_ref')
        this.pairingSession = {
            code: companionHello.pairingCode,
            pairingCode: companionHello.pairingCode,
            phoneJid,
            ref,
            createdAtSeconds: Math.floor(Date.now() / 1000),
            companionEphemeralKeyPair: companionHello.companionEphemeralKeyPair,
            attempts: 0,
            finished: false
        }
        this.callbacks.emitPairingCode(companionHello.pairingCode)
        this.logger.info('pairing code emitted', {
            phoneJid,
            createdAtSeconds: this.pairingSession.createdAtSeconds
        })
        return companionHello.pairingCode
    }

    public async fetchPairingCountryCodeIso(): Promise<string> {
        this.logger.trace('fetching pairing country code ISO')
        const response = await this.socket.query(buildGetCountryCodeRequestNode(), IQ_TIMEOUT_MS)
        const countryCodeNode = findNodeChild(response, 'country_code')
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
        if (firstChild.tag === 'pair-device') {
            this.logger.debug('handling pair-device stanza', { id: node.attrs.id })
            await this.handlePairDevice(node, firstChild)
            return true
        }
        if (firstChild.tag === 'pair-success') {
            this.logger.debug('handling pair-success stanza', { id: node.attrs.id })
            await this.handlePairSuccess(node, firstChild)
            return true
        }
        return false
    }

    public async handleLinkCodeNotification(node: BinaryNode): Promise<boolean> {
        const linkCodeNode = findNodeChild(node, 'link_code_companion_reg')
        if (!linkCodeNode) {
            return false
        }
        this.logger.trace('handling link_code_companion_reg notification', {
            id: node.attrs.id,
            stage: linkCodeNode.attrs.stage
        })
        await this.socket.sendNode(buildNotificationAckNode(node))

        const stage = linkCodeNode.attrs.stage
        if (stage === 'refresh_code') {
            const refNode = findNodeChild(linkCodeNode, 'link_code_pairing_ref')
            if (!refNode || !this.pairingSession?.ref) {
                return true
            }
            const ref = asNodeBytes(refNode.content, 'refresh_code.link_code_pairing_ref')
            if (uint8Equal(ref, this.pairingSession.ref)) {
                this.logger.info('received pairing refresh notification', {
                    forceManualRefresh: linkCodeNode.attrs.force_manual_refresh === 'true'
                })
                this.callbacks.emitPairingRefresh(
                    linkCodeNode.attrs.force_manual_refresh === 'true'
                )
            }
            return true
        }

        if (stage !== 'primary_hello') {
            return true
        }
        await this.handlePrimaryHello(linkCodeNode)
        return true
    }

    public async handleCompanionRegRefreshNotification(node: BinaryNode): Promise<boolean> {
        if (node.tag !== 'notification' || node.attrs.type !== 'companion_reg_refresh') {
            return false
        }
        const hasExpectedChild =
            hasNodeChild(node, 'companion_reg_refresh') ||
            hasNodeChild(node, 'pair-device-rotate-qr')
        if (!hasExpectedChild) {
            return false
        }

        await this.socket.sendNode(buildNotificationAckNode(node, 'companion_reg_refresh'))

        const credentials = this.requireCredentials()
        await this.auth.updateCredentials({
            ...credentials,
            advSecretKey: await randomBytesAsync(32)
        })
        this.logger.info('handled companion_reg_refresh notification')
        this.qr.refresh()
        return true
    }

    private async handlePairDevice(iqNode: BinaryNode, pairDeviceNode: BinaryNode): Promise<void> {
        const credentials = this.requireCredentials()

        const refs = extractPairDeviceRefs(pairDeviceNode)

        await this.auth.updateCredentials({
            ...credentials,
            advSecretKey: await randomBytesAsync(32)
        })
        this.qr.setRefs(refs)
        this.logger.info('pair-device refs updated', { refsCount: refs.length })

        await this.socket.sendNode(buildIqResultNode(iqNode))
    }

    private async handlePairSuccess(
        iqNode: BinaryNode,
        pairSuccessNode: BinaryNode
    ): Promise<void> {
        await this.pairingSuccessHandler.handlePairSuccess(iqNode, pairSuccessNode)
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

        const refNode = findNodeChild(linkCodeNode, 'link_code_pairing_ref')
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
        if (nowSeconds - pairingSession.createdAtSeconds > PAIRING_CODE_MAX_AGE_SECONDS) {
            throw new Error('primary_hello received for an expired pairing code')
        }

        const finish = await this.pairingCrypto.completeCompanionFinish({
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

        await this.auth.updateCredentials({
            ...credentials,
            advSecretKey: finish.advSecret
        })

        const result = await this.socket.query(
            buildCompanionFinishRequestNode({
                phoneJid: pairingSession.phoneJid,
                wrappedKeyBundle: finish.wrappedKeyBundle,
                companionIdentityPublic: finish.companionIdentityPublic,
                ref
            }),
            IQ_TIMEOUT_MS
        )
        if (result.attrs.type === 'error') {
            throw new Error('companion_finish returned error')
        }
        pairingSession.finished = true
        this.logger.info('primary_hello completed with companion_finish success')
    }

    private requireCredentials(): WaAuthCredentials {
        const credentials = this.auth.getCredentials()
        if (!credentials) {
            throw new Error('credentials are not initialized')
        }
        return credentials
    }
}
