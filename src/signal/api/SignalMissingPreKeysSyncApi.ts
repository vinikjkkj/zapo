import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS, WA_NODE_TAGS } from '@protocol/constants'
import { splitJid, toUserJid } from '@protocol/jid'
import { decodeExactLength, parseSignalKeyBundleFromNode, parseUint } from '@signal/api/codec'
import { SIGNAL_REGISTRATION_ID_LENGTH } from '@signal/api/constants'
import { buildMissingPreKeysFetchIq } from '@signal/api/prekeys'
import { registerParsedResultByRawAndCanonicalKey } from '@signal/api/result-map'
import type { SignalPreKeyBundle } from '@signal/types'
import { findNodeChild, getNodeChildrenByTag } from '@transport/node/helpers'
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

function isMissingPreKeysUserResultPreferred(result: SignalMissingPreKeysUserResult): boolean {
    return 'devices' in result
}

/**
 * Fetches missing prekey bundles for specific (user, device, registration id)
 * triples – used during message encryption when a Signal session is missing.
 */
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

    /**
     * Fetches prekey bundles for the requested `targets` in a single IQ.
     * Returns either a per-device bundle list or an error envelope per user.
     */
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
        const parsedByCanonicalJid = new Map<string, SignalMissingPreKeysUserResult>()

        for (let index = 0; index < users.length; index += 1) {
            const userNode = users[index]
            const userJid = userNode.attrs.jid
            if (!userJid) {
                continue
            }
            const canonicalUserJid = toUserJid(userJid, {
                canonicalizeSignalServer: true
            })

            const userErrorNode = findNodeChild(userNode, WA_NODE_TAGS.ERROR)
            if (userErrorNode) {
                const parsedCode = Number.parseInt(userErrorNode.attrs.code ?? '', 10)
                registerParsedResultByRawAndCanonicalKey(
                    parsedByJid,
                    parsedByCanonicalJid,
                    userJid,
                    canonicalUserJid,
                    {
                        userJid,
                        errorCode: Number.isSafeInteger(parsedCode) ? parsedCode : undefined,
                        errorText: userErrorNode.attrs.text ?? userErrorNode.attrs.type ?? 'unknown'
                    },
                    isMissingPreKeysUserResultPreferred
                )
                continue
            }

            registerParsedResultByRawAndCanonicalKey(
                parsedByJid,
                parsedByCanonicalJid,
                userJid,
                canonicalUserJid,
                {
                    userJid,
                    devices: this.parseUserDevices(userNode, canonicalUserJid)
                },
                isMissingPreKeysUserResultPreferred
            )
        }

        const results = new Array<SignalMissingPreKeysUserResult>(requestedTargets.length)
        for (let index = 0; index < requestedTargets.length; index += 1) {
            const target = requestedTargets[index]
            results[index] = parsedByJid.get(target.userJid) ??
                parsedByCanonicalJid.get(
                    toUserJid(target.userJid, {
                        canonicalizeSignalServer: true
                    })
                ) ?? {
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

            const registrationNode = findNodeChild(deviceNode, WA_NODE_TAGS.REGISTRATION)
            if (!registrationNode) {
                throw new Error(`missing prekeys device payload is incomplete for ${userJid}`)
            }
            const regId = parseUint(
                decodeExactLength(
                    registrationNode.content,
                    'missing prekeys device registration',
                    SIGNAL_REGISTRATION_ID_LENGTH
                ),
                'missing prekeys device registration'
            )

            const parsed = parseSignalKeyBundleFromNode(deviceNode, 'missing prekeys device')

            const bundle: SignalPreKeyBundle = {
                regId,
                identity: parsed.identity,
                signedKey: parsed.signedKey,
                ...(parsed.oneTimeKey ? { oneTimeKey: parsed.oneTimeKey } : {})
            }
            const deviceJid = deviceId === 0 ? userJid : `${user}:${deviceId}@${server}`
            bundles[index] = parsed.deviceIdentity
                ? { deviceJid, bundle, deviceIdentity: parsed.deviceIdentity }
                : { deviceJid, bundle }
        }
        return bundles
    }
}
