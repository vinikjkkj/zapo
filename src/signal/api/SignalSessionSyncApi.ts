import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/constants'
import { canonicalizeSignalJid } from '@protocol/jid'
import { decodeExactLength, parseUint } from '@signal/api/codec'
import {
    SIGNAL_KEY_DATA_LENGTH,
    SIGNAL_KEY_ID_LENGTH,
    SIGNAL_REGISTRATION_ID_LENGTH,
    SIGNAL_SIGNATURE_LENGTH
} from '@signal/api/constants'
import { registerParsedResultByRawAndCanonicalKey } from '@signal/api/result-map'
import type { SignalPreKeyBundle } from '@signal/types'
import {
    findNodeChild,
    getNodeChildrenByTag,
    decodeNodeContentBase64OrBytes
} from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

interface SignalSessionSyncApiOptions {
    readonly logger: Logger
    readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
    readonly defaultTimeoutMs?: number
    readonly hostDomain?: string
}

export type SignalSessionKeyBundleResult =
    | {
          readonly jid: string
          readonly bundle: SignalPreKeyBundle
          readonly deviceIdentity?: Uint8Array
      }
    | {
          readonly jid: string
          readonly errorCode?: string
          readonly errorText: string
      }

function isKeyBundleResultPreferred(result: SignalSessionKeyBundleResult): boolean {
    return 'bundle' in result
}

export class SignalSessionSyncApi {
    private readonly logger: SignalSessionSyncApiOptions['logger']
    private readonly query: SignalSessionSyncApiOptions['query']
    private readonly defaultTimeoutMs: number
    private readonly hostDomain: string

    public constructor(options: SignalSessionSyncApiOptions) {
        this.logger = options.logger
        this.query = options.query
        this.defaultTimeoutMs =
            options.defaultTimeoutMs ?? WA_DEFAULTS.SIGNAL_FETCH_KEY_BUNDLES_TIMEOUT_MS
        this.hostDomain = options.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN
    }

    public async fetchKeyBundle(
        target: { readonly jid: string; readonly reasonIdentity?: boolean },
        timeoutMs = this.defaultTimeoutMs
    ): Promise<{
        readonly jid: string
        readonly bundle: SignalPreKeyBundle
        readonly deviceIdentity?: Uint8Array
    }> {
        const results = await this.fetchKeyBundles([target], timeoutMs)
        const first = results[0]
        if (!first || !('bundle' in first)) {
            const errorCode =
                first && 'errorCode' in first ? (first.errorCode ?? 'unknown') : 'unknown'
            const errorText = first && 'errorText' in first ? first.errorText : 'unknown'
            throw new Error(`key bundle user error (${target.jid}): ${errorCode} ${errorText}`)
        }

        const parsed = first
        this.logger.debug('signal fetch key bundle success', {
            requestJid: target.jid,
            responseJid: parsed.jid,
            hasOneTimeKey: parsed.bundle.oneTimeKey !== undefined,
            hasDeviceIdentity: parsed.deviceIdentity !== undefined
        })
        return parsed
    }

    public async fetchKeyBundles(
        targets: readonly { readonly jid: string; readonly reasonIdentity?: boolean }[],
        timeoutMs = this.defaultTimeoutMs
    ): Promise<readonly SignalSessionKeyBundleResult[]> {
        if (targets.length === 0) {
            return []
        }
        const targetByJid = new Map<
            string,
            { readonly jid: string; readonly reasonIdentity?: boolean }
        >()
        for (let index = 0; index < targets.length; index += 1) {
            const target = targets[index]
            const previous = targetByJid.get(target.jid)
            targetByJid.set(target.jid, {
                jid: target.jid,
                reasonIdentity:
                    (previous?.reasonIdentity ?? false) || target.reasonIdentity === true
            })
        }
        const mergedTargets: { readonly jid: string; readonly reasonIdentity?: boolean }[] = []
        for (const target of targetByJid.values()) {
            mergedTargets.push(target)
        }
        const userNodes = new Array<BinaryNode>(mergedTargets.length)
        for (let index = 0; index < mergedTargets.length; index += 1) {
            const target = mergedTargets[index]
            userNodes[index] = {
                tag: WA_NODE_TAGS.USER,
                attrs:
                    target.reasonIdentity === true
                        ? { jid: target.jid, reason: 'identity' }
                        : { jid: target.jid }
            }
        }
        this.logger.debug('signal fetch key bundles request', {
            targets: mergedTargets.length,
            timeoutMs
        })
        const responseNode = await this.query(
            {
                tag: WA_NODE_TAGS.IQ,
                attrs: {
                    type: WA_IQ_TYPES.GET,
                    xmlns: WA_XMLNS.SIGNAL,
                    to: this.hostDomain
                },
                content: [
                    {
                        tag: WA_NODE_TAGS.KEY,
                        attrs: {},
                        content: userNodes
                    }
                ]
            },
            timeoutMs
        )
        return this.parseFetchKeyBundleResponse(responseNode, mergedTargets)
    }

    private parseFetchKeyBundleResponse(
        node: BinaryNode,
        requestedTargets: readonly { readonly jid: string; readonly reasonIdentity?: boolean }[]
    ): readonly SignalSessionKeyBundleResult[] {
        assertIqResult(node, 'key bundle')

        const listNode = findNodeChild(node, WA_NODE_TAGS.LIST)
        if (!listNode) {
            throw new Error('key bundle response missing list node')
        }
        const userNodes = getNodeChildrenByTag(listNode, WA_NODE_TAGS.USER)
        if (userNodes.length === 0) {
            throw new Error('key bundle response list is empty')
        }

        const parsedByJid = new Map<string, SignalSessionKeyBundleResult>()
        const parsedByCanonicalJid = new Map<string, SignalSessionKeyBundleResult>()
        for (let index = 0; index < userNodes.length; index += 1) {
            const userNode = userNodes[index]
            const jid = userNode.attrs.jid
            if (!jid) {
                continue
            }

            const userErrorNode = findNodeChild(userNode, WA_NODE_TAGS.ERROR)
            if (userErrorNode) {
                registerParsedResultByRawAndCanonicalKey(
                    parsedByJid,
                    parsedByCanonicalJid,
                    jid,
                    canonicalizeSignalJid(jid, this.hostDomain),
                    {
                        jid,
                        errorCode: userErrorNode.attrs.code,
                        errorText: userErrorNode.attrs.text ?? 'unknown'
                    },
                    isKeyBundleResultPreferred
                )
                continue
            }

            const parsed = this.parseUserKeyBundle(userNode)
            registerParsedResultByRawAndCanonicalKey(
                parsedByJid,
                parsedByCanonicalJid,
                jid,
                canonicalizeSignalJid(jid, this.hostDomain),
                {
                    jid,
                    bundle: parsed.bundle,
                    ...(parsed.deviceIdentity ? { deviceIdentity: parsed.deviceIdentity } : {})
                },
                isKeyBundleResultPreferred
            )
        }

        const output: SignalSessionKeyBundleResult[] = new Array(requestedTargets.length)
        for (let index = 0; index < requestedTargets.length; index += 1) {
            const target = requestedTargets[index]
            output[index] = parsedByJid.get(target.jid) ??
                parsedByCanonicalJid.get(canonicalizeSignalJid(target.jid, this.hostDomain)) ?? {
                    jid: target.jid,
                    errorText: 'missing key bundle user in response'
                }
        }
        return output
    }

    private parseUserKeyBundle(node: BinaryNode): {
        readonly bundle: SignalPreKeyBundle
        readonly deviceIdentity?: Uint8Array
    } {
        const registrationNode = findNodeChild(node, WA_NODE_TAGS.REGISTRATION)
        if (!registrationNode) {
            throw new Error('key bundle user missing registration node')
        }
        const identityNode = findNodeChild(node, WA_NODE_TAGS.IDENTITY)
        if (!identityNode) {
            throw new Error('key bundle user missing identity node')
        }
        const signedPreKeyNode = findNodeChild(node, WA_NODE_TAGS.SKEY)
        if (!signedPreKeyNode) {
            throw new Error('key bundle user missing signed pre-key node')
        }

        const registrationBytes = decodeExactLength(
            registrationNode.content,
            'key bundle registration',
            SIGNAL_REGISTRATION_ID_LENGTH
        )
        const registrationId = parseUint(registrationBytes, 'key bundle registration')

        const identity = decodeExactLength(
            identityNode.content,
            'key bundle identity',
            SIGNAL_KEY_DATA_LENGTH
        )

        const signedIdNode = findNodeChild(signedPreKeyNode, WA_NODE_TAGS.ID)
        const signedValueNode = findNodeChild(signedPreKeyNode, WA_NODE_TAGS.VALUE)
        const signedSignatureNode = findNodeChild(signedPreKeyNode, WA_NODE_TAGS.SIGNATURE)
        if (!signedIdNode || !signedValueNode || !signedSignatureNode) {
            throw new Error('key bundle signed pre-key is incomplete')
        }

        const signedIdBytes = decodeExactLength(
            signedIdNode.content,
            'key bundle skey.id',
            SIGNAL_KEY_ID_LENGTH
        )
        const signedValue = decodeExactLength(
            signedValueNode.content,
            'key bundle skey.value',
            SIGNAL_KEY_DATA_LENGTH
        )
        const signedSignature = decodeExactLength(
            signedSignatureNode.content,
            'key bundle skey.signature',
            SIGNAL_SIGNATURE_LENGTH
        )

        const preKeyNode = findNodeChild(node, WA_NODE_TAGS.KEY)
        let oneTimeKey: SignalPreKeyBundle['oneTimeKey']
        if (preKeyNode) {
            const preKeyIdNode = findNodeChild(preKeyNode, WA_NODE_TAGS.ID)
            const preKeyValueNode = findNodeChild(preKeyNode, WA_NODE_TAGS.VALUE)
            if (!preKeyIdNode || !preKeyValueNode) {
                throw new Error('key bundle one-time pre-key is incomplete')
            }
            const preKeyIdBytes = decodeExactLength(
                preKeyIdNode.content,
                'key bundle key.id',
                SIGNAL_KEY_ID_LENGTH
            )
            const preKeyValue = decodeExactLength(
                preKeyValueNode.content,
                'key bundle key.value',
                SIGNAL_KEY_DATA_LENGTH
            )

            oneTimeKey = {
                id: parseUint(preKeyIdBytes, 'key bundle key.id'),
                publicKey: preKeyValue
            }
        }

        const deviceIdentityNode = findNodeChild(node, WA_NODE_TAGS.DEVICE_IDENTITY)
        const deviceIdentity = deviceIdentityNode
            ? decodeNodeContentBase64OrBytes(
                  deviceIdentityNode.content,
                  'key bundle device-identity'
              )
            : undefined

        return {
            bundle: {
                regId: registrationId,
                identity,
                signedKey: {
                    id: parseUint(signedIdBytes, 'key bundle skey.id'),
                    publicKey: signedValue,
                    signature: signedSignature
                },
                ...(oneTimeKey ? { oneTimeKey } : {})
            },
            ...(deviceIdentity ? { deviceIdentity } : {})
        }
    }
}
