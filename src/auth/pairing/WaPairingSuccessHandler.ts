import type { Logger } from '../../infra/log/types'
import { proto } from '../../proto'
import {
    WaAdvSignature,
    ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE
} from '../../signal/crypto/WaAdvSignature'
import { asNodeBytes, findNodeChild } from '../../transport/node/helpers'
import type { BinaryNode } from '../../transport/types'
import { decodeProtoBytes } from '../../util/base64'
import { concatBytes, uint8Equal } from '../../util/bytes'
import { HOST_DOMAIN } from '../client.constants'
import type { WaAuthCredentials } from '../types'

import type { WaPairingSuccessHandlerOptions } from './types'

export class WaPairingSuccessHandler {
    private readonly logger: Logger
    private readonly advSignature: WaAdvSignature
    private readonly auth: WaPairingSuccessHandlerOptions['auth']
    private readonly socket: WaPairingSuccessHandlerOptions['socket']
    private readonly qr: WaPairingSuccessHandlerOptions['qr']
    private readonly emitPaired: (credentials: WaAuthCredentials) => void

    public constructor(options: WaPairingSuccessHandlerOptions) {
        this.logger = options.logger
        this.advSignature = options.advSignature
        this.auth = options.auth
        this.socket = options.socket
        this.qr = options.qr
        this.emitPaired = options.emitPaired
    }

    public async handlePairSuccess(iqNode: BinaryNode, pairSuccessNode: BinaryNode): Promise<void> {
        this.logger.info('processing pair-success node')
        const credentials = this.requireCredentials()

        const deviceIdentityNode = findNodeChild(pairSuccessNode, 'device-identity')
        const deviceNode = findNodeChild(pairSuccessNode, 'device')
        const platformNode = findNodeChild(pairSuccessNode, 'platform')
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
        const expectedHmac = await this.advSignature.computeAdvIdentityHmac(
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
        const validAccountSignature = await this.advSignature.verifyDeviceIdentityAccountSignature(
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

        const deviceSignature = await this.advSignature.generateDeviceSignature(
            details,
            localIdentity,
            accountSignatureKey,
            isHosted
        )
        signedIdentity.deviceSignature = deviceSignature

        const advDeviceIdentity = proto.ADVDeviceIdentity.decode(details)
        const keyIndex = advDeviceIdentity.keyIndex ?? 0
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
        await this.auth.updateCredentials(nextCredentials)
        this.logger.info('pair-success credentials updated', {
            meJid: nextCredentials.meJid,
            meLid: nextCredentials.meLid,
            platform: nextCredentials.platform
        })
        this.qr.clear()

        await this.socket.sendNode({
            tag: 'iq',
            attrs: {
                ...(iqNode.attrs.id ? { id: iqNode.attrs.id } : {}),
                to: iqNode.attrs.from ?? HOST_DOMAIN,
                type: 'result'
            },
            content: [
                {
                    tag: 'pair-device-sign',
                    attrs: {},
                    content: [
                        {
                            tag: 'device-identity',
                            attrs: {
                                'key-index': String(keyIndex)
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

    private requireCredentials(): WaAuthCredentials {
        const credentials = this.auth.getCredentials()
        if (!credentials) {
            throw new Error('credentials are not initialized')
        }
        return credentials
    }
}
