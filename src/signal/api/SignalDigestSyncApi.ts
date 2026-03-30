import { sha1 } from '@crypto'
import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/constants'
import { decodeExactLength, parseUint } from '@signal/api/codec'
import {
    SIGNAL_KEY_BUNDLE_TYPE_BYTES,
    SIGNAL_KEY_BUNDLE_TYPE_LENGTH,
    SIGNAL_KEY_DATA_LENGTH,
    SIGNAL_KEY_ID_LENGTH,
    SIGNAL_REGISTRATION_ID_LENGTH,
    SIGNAL_SIGNATURE_LENGTH
} from '@signal/api/constants'
import type { RegistrationInfo, SignedPreKeyRecord } from '@signal/types'
import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import {
    decodeNodeContentBase64OrBytes,
    findNodeChild,
    getNodeChildren
} from '@transport/node/helpers'
import { parseIqError } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { concatBytes, uint8Equal } from '@util/bytes'

interface SignalDigestSyncApiOptions {
    readonly logger: Logger
    readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
    readonly signalStore: WaSignalStore
    readonly preKeyStore: WaPreKeyStore
    readonly defaultTimeoutMs?: number
    readonly hostDomain?: string
}

interface ParsedDigestPayload {
    readonly registrationId: number
    readonly keyBundleType: number
    readonly identity: Uint8Array
    readonly signedKey: {
        readonly id: number
        readonly publicKey: Uint8Array
        readonly signature: Uint8Array
    }
    readonly preKeyIds: readonly number[]
    readonly hash: Uint8Array
}

export interface SignalDigestValidationResult {
    readonly valid: boolean
    readonly shouldReupload: boolean
    readonly reason:
        | 'ok'
        | 'missing_remote_digest'
        | 'unsupported_key_bundle_type'
        | 'missing_local_state'
        | 'registration_mismatch'
        | 'identity_mismatch'
        | 'signed_prekey_mismatch'
        | 'missing_local_prekey'
        | 'hash_mismatch'
    readonly preKeyCount: number
}

export interface SignalDigestPrefetchedLocalKeyBundle {
    readonly registrationInfo: RegistrationInfo
    readonly signedPreKey: SignedPreKeyRecord
}

export class SignalDigestSyncApi {
    private readonly logger: SignalDigestSyncApiOptions['logger']
    private readonly query: SignalDigestSyncApiOptions['query']
    private readonly signalStore: SignalDigestSyncApiOptions['signalStore']
    private readonly preKeyStore: SignalDigestSyncApiOptions['preKeyStore']
    private readonly defaultTimeoutMs: number
    private readonly hostDomain: string

    public constructor(options: SignalDigestSyncApiOptions) {
        this.logger = options.logger
        this.query = options.query
        this.signalStore = options.signalStore
        this.preKeyStore = options.preKeyStore
        this.defaultTimeoutMs =
            options.defaultTimeoutMs ?? WA_DEFAULTS.SIGNAL_FETCH_KEY_BUNDLES_TIMEOUT_MS
        this.hostDomain = options.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN
    }

    public async validateLocalKeyBundle(timeoutMs?: number): Promise<SignalDigestValidationResult>
    public async validateLocalKeyBundle(
        prefetched?: SignalDigestPrefetchedLocalKeyBundle,
        timeoutMs?: number
    ): Promise<SignalDigestValidationResult>
    public async validateLocalKeyBundle(
        prefetchedOrTimeout?: SignalDigestPrefetchedLocalKeyBundle | number,
        timeoutMs = this.defaultTimeoutMs
    ): Promise<SignalDigestValidationResult> {
        const prefetched = typeof prefetchedOrTimeout === 'number' ? undefined : prefetchedOrTimeout
        const effectiveTimeoutMs =
            typeof prefetchedOrTimeout === 'number' ? prefetchedOrTimeout : timeoutMs
        this.logger.debug('signal digest query request', { timeoutMs: effectiveTimeoutMs })
        const response = await this.query(
            {
                tag: WA_NODE_TAGS.IQ,
                attrs: {
                    type: WA_IQ_TYPES.GET,
                    xmlns: WA_XMLNS.SIGNAL,
                    to: this.hostDomain
                },
                content: [
                    {
                        tag: WA_NODE_TAGS.DIGEST,
                        attrs: {}
                    }
                ]
            },
            effectiveTimeoutMs
        )

        if (response.tag !== WA_NODE_TAGS.IQ) {
            throw new Error(`invalid signal digest response tag: ${response.tag}`)
        }
        if (response.attrs.type === WA_IQ_TYPES.ERROR) {
            const error = parseIqError(response)
            if (error.numericCode === 404 || error.code === '404') {
                return {
                    valid: false,
                    shouldReupload: true,
                    reason: 'missing_remote_digest',
                    preKeyCount: 0
                }
            }
            throw new Error(`signal digest iq failed (${error.code}: ${error.text})`)
        }
        if (response.attrs.type !== WA_IQ_TYPES.RESULT) {
            throw new Error(
                `invalid signal digest response type: ${response.attrs.type ?? 'unknown'}`
            )
        }

        const digest = this.parseDigestPayload(response)
        const expectedType = SIGNAL_KEY_BUNDLE_TYPE_BYTES[0]
        if (digest.keyBundleType !== expectedType) {
            return {
                valid: false,
                shouldReupload: false,
                reason: 'unsupported_key_bundle_type',
                preKeyCount: digest.preKeyIds.length
            }
        }

        const [registrationInfo, signedPreKey] = prefetched
            ? [prefetched.registrationInfo, prefetched.signedPreKey]
            : await Promise.all([
                  this.signalStore.getRegistrationInfo(),
                  this.signalStore.getSignedPreKey()
              ])
        if (!registrationInfo || !signedPreKey) {
            return {
                valid: false,
                shouldReupload: false,
                reason: 'missing_local_state',
                preKeyCount: digest.preKeyIds.length
            }
        }
        if (registrationInfo.registrationId !== digest.registrationId) {
            return {
                valid: false,
                shouldReupload: true,
                reason: 'registration_mismatch',
                preKeyCount: digest.preKeyIds.length
            }
        }
        if (!uint8Equal(registrationInfo.identityKeyPair.pubKey, digest.identity)) {
            return {
                valid: false,
                shouldReupload: true,
                reason: 'identity_mismatch',
                preKeyCount: digest.preKeyIds.length
            }
        }
        if (
            signedPreKey.keyId !== digest.signedKey.id ||
            !uint8Equal(signedPreKey.keyPair.pubKey, digest.signedKey.publicKey) ||
            !uint8Equal(signedPreKey.signature, digest.signedKey.signature)
        ) {
            return {
                valid: false,
                shouldReupload: true,
                reason: 'signed_prekey_mismatch',
                preKeyCount: digest.preKeyIds.length
            }
        }

        const preKeys = await this.preKeyStore.getPreKeysById(digest.preKeyIds)
        const bytesToHash: Uint8Array[] = [
            registrationInfo.identityKeyPair.pubKey,
            signedPreKey.keyPair.pubKey,
            signedPreKey.signature
        ]
        for (let index = 0; index < preKeys.length; index += 1) {
            const preKey = preKeys[index]
            if (!preKey) {
                return {
                    valid: false,
                    shouldReupload: true,
                    reason: 'missing_local_prekey',
                    preKeyCount: digest.preKeyIds.length
                }
            }
            bytesToHash.push(preKey.keyPair.pubKey)
        }

        const localHash = (await sha1(concatBytes(bytesToHash))).subarray(0, digest.hash.byteLength)
        if (!uint8Equal(localHash, digest.hash)) {
            return {
                valid: false,
                shouldReupload: true,
                reason: 'hash_mismatch',
                preKeyCount: digest.preKeyIds.length
            }
        }

        return {
            valid: true,
            shouldReupload: false,
            reason: 'ok',
            preKeyCount: digest.preKeyIds.length
        }
    }

    private parseDigestPayload(node: BinaryNode): ParsedDigestPayload {
        const digestNode = findNodeChild(node, WA_NODE_TAGS.DIGEST)
        if (!digestNode) {
            throw new Error('signal digest response missing digest node')
        }
        const registrationNode = findNodeChild(digestNode, WA_NODE_TAGS.REGISTRATION)
        const typeNode = findNodeChild(digestNode, WA_NODE_TAGS.TYPE)
        const identityNode = findNodeChild(digestNode, WA_NODE_TAGS.IDENTITY)
        const signedKeyNode = findNodeChild(digestNode, WA_NODE_TAGS.SKEY)
        const listNode = findNodeChild(digestNode, WA_NODE_TAGS.LIST)
        const hashNode = findNodeChild(digestNode, WA_NODE_TAGS.HASH)
        if (
            !registrationNode ||
            !typeNode ||
            !identityNode ||
            !signedKeyNode ||
            !listNode ||
            !hashNode
        ) {
            throw new Error('signal digest response is incomplete')
        }

        const signedKeyIdNode = findNodeChild(signedKeyNode, WA_NODE_TAGS.ID)
        const signedKeyValueNode = findNodeChild(signedKeyNode, WA_NODE_TAGS.VALUE)
        const signedKeySignatureNode = findNodeChild(signedKeyNode, WA_NODE_TAGS.SIGNATURE)
        if (!signedKeyIdNode || !signedKeyValueNode || !signedKeySignatureNode) {
            throw new Error('signal digest response signed pre-key is incomplete')
        }

        const registrationId = parseUint(
            decodeExactLength(
                registrationNode.content,
                'signal digest registration',
                SIGNAL_REGISTRATION_ID_LENGTH
            ),
            'signal digest registration'
        )
        const keyBundleType = parseUint(
            decodeExactLength(
                typeNode.content,
                'signal digest type',
                SIGNAL_KEY_BUNDLE_TYPE_LENGTH
            ),
            'signal digest type'
        )
        const identity = decodeExactLength(
            identityNode.content,
            'signal digest identity',
            SIGNAL_KEY_DATA_LENGTH
        )
        const signedKeyId = parseUint(
            decodeExactLength(
                signedKeyIdNode.content,
                'signal digest skey.id',
                SIGNAL_KEY_ID_LENGTH
            ),
            'signal digest skey.id'
        )
        const signedKeyPublicKey = decodeExactLength(
            signedKeyValueNode.content,
            'signal digest skey.value',
            SIGNAL_KEY_DATA_LENGTH
        )
        const signedKeySignature = decodeExactLength(
            signedKeySignatureNode.content,
            'signal digest skey.signature',
            SIGNAL_SIGNATURE_LENGTH
        )
        const listChildren = getNodeChildren(listNode)
        const preKeyIds = new Array<number>(listChildren.length)
        for (let index = 0; index < listChildren.length; index += 1) {
            const child = listChildren[index]
            preKeyIds[index] = parseUint(
                decodeExactLength(
                    child.content,
                    `signal digest list[${index}]`,
                    SIGNAL_KEY_ID_LENGTH
                ),
                `signal digest list[${index}]`
            )
        }
        const hash = decodeNodeContentBase64OrBytes(hashNode.content, 'signal digest hash')

        return {
            registrationId,
            keyBundleType,
            identity,
            signedKey: {
                id: signedKeyId,
                publicKey: signedKeyPublicKey,
                signature: signedKeySignature
            },
            preKeyIds,
            hash
        }
    }
}
