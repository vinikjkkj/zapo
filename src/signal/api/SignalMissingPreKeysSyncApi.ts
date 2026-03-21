import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS, WA_NODE_TAGS } from '@protocol/constants'
import { splitJid } from '@protocol/jid'
import { decodeExactLength, parseUint } from '@signal/api/codec'
import {
    SIGNAL_KEY_DATA_LENGTH,
    SIGNAL_KEY_ID_LENGTH,
    SIGNAL_REGISTRATION_ID_LENGTH,
    SIGNAL_SIGNATURE_LENGTH
} from '@signal/api/constants'
import { buildMissingPreKeysFetchIq } from '@signal/api/prekeys'
import type { SignalPreKeyBundle } from '@signal/types'
import {
    decodeNodeContentBase64OrBytes,
    findNodeChildrenByTags,
    findNodeChild,
    getNodeChildrenByTag
} from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

interface SignalMissingPreKeysSyncApiOptions {
    readonly logger: Logger
    readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
    readonly defaultTimeoutMs?: number
}

export interface SignalMissingPreKeysTarget {
    readonly userJid: string
    readonly reasonIdentity?: boolean
    readonly devices: readonly {
        readonly deviceId: number
        readonly registrationId: number
    }[]
}

export interface SignalMissingPreKeysDeviceBundle {
    readonly deviceJid: string
    readonly bundle: SignalPreKeyBundle
    readonly deviceIdentity?: Uint8Array
}

export type SignalMissingPreKeysUserResult =
    | {
          readonly userJid: string
          readonly devices: readonly SignalMissingPreKeysDeviceBundle[]
      }
    | {
          readonly userJid: string
          readonly errorCode?: number
          readonly errorText: string
      }

export class SignalMissingPreKeysSyncApi {
    private readonly logger: SignalMissingPreKeysSyncApiOptions['logger']
    private readonly query: SignalMissingPreKeysSyncApiOptions['query']
    private readonly defaultTimeoutMs: number

    public constructor(options: SignalMissingPreKeysSyncApiOptions) {
        this.logger = options.logger
        this.query = options.query
        this.defaultTimeoutMs =
            options.defaultTimeoutMs ?? WA_DEFAULTS.SIGNAL_FETCH_KEY_BUNDLES_TIMEOUT_MS
    }

    public async fetchMissingPreKeys(
        targets: readonly SignalMissingPreKeysTarget[],
        timeoutMs = this.defaultTimeoutMs
    ): Promise<readonly SignalMissingPreKeysUserResult[]> {
        if (targets.length === 0) {
            return []
        }
        this.logger.debug('signal fetch missing prekeys request', {
            users: targets.length,
            timeoutMs
        })
        const response = await this.query(buildMissingPreKeysFetchIq(targets), timeoutMs)
        const parsed = this.parseFetchMissingPreKeysResponse(response, targets)
        this.logger.debug('signal fetch missing prekeys success', {
            users: parsed.length
        })
        return parsed
    }

    private parseFetchMissingPreKeysResponse(
        node: BinaryNode,
        requestedTargets: readonly SignalMissingPreKeysTarget[]
    ): readonly SignalMissingPreKeysUserResult[] {
        assertIqResult(node, 'missing prekeys')

        const listNode = findNodeChild(node, WA_NODE_TAGS.LIST)
        if (!listNode) {
            throw new Error('missing prekeys response missing list node')
        }
        const users = getNodeChildrenByTag(listNode, WA_NODE_TAGS.USER)
        const parsedByJid = new Map<string, SignalMissingPreKeysUserResult>()

        for (let index = 0; index < users.length; index += 1) {
            const userNode = users[index]
            const userJid = userNode.attrs.jid
            if (!userJid) {
                continue
            }

            const userErrorNode = findNodeChild(userNode, WA_NODE_TAGS.ERROR)
            if (userErrorNode) {
                const parsedCode = Number.parseInt(userErrorNode.attrs.code ?? '', 10)
                parsedByJid.set(userJid, {
                    userJid,
                    errorCode: Number.isSafeInteger(parsedCode) ? parsedCode : undefined,
                    errorText: userErrorNode.attrs.text ?? userErrorNode.attrs.type ?? 'unknown'
                })
                continue
            }

            parsedByJid.set(userJid, {
                userJid,
                devices: this.parseUserDevices(userNode, userJid)
            })
        }

        const results = new Array<SignalMissingPreKeysUserResult>(requestedTargets.length)
        for (let index = 0; index < requestedTargets.length; index += 1) {
            const target = requestedTargets[index]
            results[index] = parsedByJid.get(target.userJid) ?? {
                userJid: target.userJid,
                errorText: 'missing user in key_fetch response'
            }
        }
        return results
    }

    private parseUserDevices(
        node: BinaryNode,
        userJid: string
    ): readonly SignalMissingPreKeysDeviceBundle[] {
        const { user, server } = splitJid(userJid)
        const devices = getNodeChildrenByTag(node, WA_NODE_TAGS.DEVICE)
        const bundles = new Array<SignalMissingPreKeysDeviceBundle>(devices.length)
        for (let index = 0; index < devices.length; index += 1) {
            const deviceNode = devices[index]
            const deviceIdValue = deviceNode.attrs.id
            if (!deviceIdValue) {
                throw new Error(`missing prekeys device[${index}].id is missing`)
            }
            const deviceId = Number.parseInt(deviceIdValue, 10)
            if (!Number.isSafeInteger(deviceId) || deviceId < 0) {
                throw new Error(`missing prekeys device[${index}].id is invalid`)
            }
            const [registrationNode, identityNode, signedKeyNode, oneTimeNode, deviceIdentityNode] =
                findNodeChildrenByTags(deviceNode, [
                    WA_NODE_TAGS.REGISTRATION,
                    WA_NODE_TAGS.IDENTITY,
                    WA_NODE_TAGS.SKEY,
                    WA_NODE_TAGS.KEY,
                    WA_NODE_TAGS.DEVICE_IDENTITY
                ] as const)
            if (!registrationNode || !identityNode || !signedKeyNode) {
                throw new Error(`missing prekeys device payload is incomplete for ${userJid}`)
            }

            const [signedKeyIdNode, signedKeyValueNode, signedKeySignatureNode] =
                findNodeChildrenByTags(signedKeyNode, [
                    WA_NODE_TAGS.ID,
                    WA_NODE_TAGS.VALUE,
                    WA_NODE_TAGS.SIGNATURE
                ] as const)
            if (!signedKeyIdNode || !signedKeyValueNode || !signedKeySignatureNode) {
                throw new Error(`missing prekeys signed pre-key is incomplete for ${userJid}`)
            }

            let oneTimeIdNode: BinaryNode | undefined
            let oneTimeValueNode: BinaryNode | undefined
            if (oneTimeNode) {
                const oneTimeNodes = findNodeChildrenByTags(oneTimeNode, [
                    WA_NODE_TAGS.ID,
                    WA_NODE_TAGS.VALUE
                ] as const)
                oneTimeIdNode = oneTimeNodes[0]
                oneTimeValueNode = oneTimeNodes[1]
            }
            if (oneTimeNode && (!oneTimeIdNode || !oneTimeValueNode)) {
                throw new Error(`missing prekeys one-time key is incomplete for ${userJid}`)
            }

            const baseBundle: SignalPreKeyBundle = {
                regId: parseUint(
                    decodeExactLength(
                        registrationNode.content,
                        'missing prekeys device registration',
                        SIGNAL_REGISTRATION_ID_LENGTH
                    ),
                    'missing prekeys device registration'
                ),
                identity: decodeExactLength(
                    identityNode.content,
                    'missing prekeys device identity',
                    SIGNAL_KEY_DATA_LENGTH
                ),
                signedKey: {
                    id: parseUint(
                        decodeExactLength(
                            signedKeyIdNode.content,
                            'missing prekeys device skey.id',
                            SIGNAL_KEY_ID_LENGTH
                        ),
                        'missing prekeys device skey.id'
                    ),
                    publicKey: decodeExactLength(
                        signedKeyValueNode.content,
                        'missing prekeys device skey.value',
                        SIGNAL_KEY_DATA_LENGTH
                    ),
                    signature: decodeExactLength(
                        signedKeySignatureNode.content,
                        'missing prekeys device skey.signature',
                        SIGNAL_SIGNATURE_LENGTH
                    )
                }
            }
            const bundle =
                oneTimeIdNode && oneTimeValueNode
                    ? {
                          ...baseBundle,
                          oneTimeKey: {
                              id: parseUint(
                                  decodeExactLength(
                                      oneTimeIdNode.content,
                                      'missing prekeys device key.id',
                                      SIGNAL_KEY_ID_LENGTH
                                  ),
                                  'missing prekeys device key.id'
                              ),
                              publicKey: decodeExactLength(
                                  oneTimeValueNode.content,
                                  'missing prekeys device key.value',
                                  SIGNAL_KEY_DATA_LENGTH
                              )
                          }
                      }
                    : baseBundle
            let deviceIdentity: Uint8Array | undefined
            if (deviceIdentityNode) {
                deviceIdentity = decodeNodeContentBase64OrBytes(
                    deviceIdentityNode.content,
                    'missing prekeys device device-identity'
                )
            }
            bundles[index] = deviceIdentity
                ? {
                      deviceJid: deviceId === 0 ? userJid : `${user}:${deviceId}@${server}`,
                      bundle,
                      deviceIdentity
                  }
                : {
                      deviceJid: deviceId === 0 ? userJid : `${user}:${deviceId}@${server}`,
                      bundle
                  }
        }
        return bundles
    }
}
