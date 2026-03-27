import { toSerializedPubKey } from '@crypto/core/keys'
import type { Logger } from '@infra/log/types'
import { PromiseDedup } from '@infra/perf/PromiseDedup'
import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/constants'
import { canonicalizeSignalJid, parseSignalAddressFromJid } from '@protocol/jid'
import { decodeExactLength, parseUint } from '@signal/api/codec'
import { SIGNAL_KEY_BUNDLE_TYPE_LENGTH, SIGNAL_KEY_DATA_LENGTH } from '@signal/api/constants'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { findNodeChild, getNodeChildrenByTag } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export interface SignalIdentitySyncEntry {
    readonly jid: string
    readonly identity: Uint8Array
    readonly type?: number
}

interface SignalIdentitySyncApiOptions {
    readonly logger: Logger
    readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
    readonly signalStore?: WaSignalStore
    readonly defaultTimeoutMs?: number
    readonly hostDomain?: string
}

export class SignalIdentitySyncApi {
    private readonly logger: SignalIdentitySyncApiOptions['logger']
    private readonly query: SignalIdentitySyncApiOptions['query']
    private readonly signalStore?: WaSignalStore
    private readonly defaultTimeoutMs: number
    private readonly hostDomain: string
    private readonly syncDedup = new PromiseDedup()

    public constructor(options: SignalIdentitySyncApiOptions) {
        this.logger = options.logger
        this.query = options.query
        this.signalStore = options.signalStore
        this.defaultTimeoutMs =
            options.defaultTimeoutMs ?? WA_DEFAULTS.SIGNAL_FETCH_KEY_BUNDLES_TIMEOUT_MS
        this.hostDomain = options.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN
    }

    public syncIdentityKeys(
        targetJids: readonly string[],
        timeoutMs = this.defaultTimeoutMs
    ): Promise<readonly SignalIdentitySyncEntry[]> {
        const dedupKey = `${timeoutMs}:${targetJids.join(',')}`
        return this.syncDedup.run(dedupKey, () =>
            this.syncIdentityKeysInternal(targetJids, timeoutMs)
        )
    }

    private async syncIdentityKeysInternal(
        targetJids: readonly string[],
        timeoutMs: number
    ): Promise<readonly SignalIdentitySyncEntry[]> {
        const normalizedTargets = new Array<string>(targetJids.length)
        let normalizedTargetsCount = 0
        const dedup = new Set<string>()
        for (let index = 0; index < targetJids.length; index += 1) {
            const normalized = canonicalizeSignalJid(targetJids[index], this.hostDomain)
            if (dedup.has(normalized)) {
                continue
            }
            dedup.add(normalized)
            normalizedTargets[normalizedTargetsCount] = normalized
            normalizedTargetsCount += 1
        }
        normalizedTargets.length = normalizedTargetsCount
        if (normalizedTargets.length === 0) {
            return []
        }

        const users = new Array<{
            readonly tag: string
            readonly attrs: Readonly<Record<string, string>>
        }>(normalizedTargets.length)
        for (let index = 0; index < normalizedTargets.length; index += 1) {
            users[index] = {
                tag: WA_NODE_TAGS.USER,
                attrs: {
                    jid: normalizedTargets[index]
                }
            }
        }

        this.logger.debug('signal identity sync request', {
            targets: normalizedTargets.length,
            timeoutMs
        })
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
                        tag: WA_NODE_TAGS.IDENTITY,
                        attrs: {},
                        content: users
                    }
                ]
            },
            timeoutMs
        )

        const entries = this.parseIdentitySyncResponse(response, normalizedTargets)
        const { signalStore } = this
        if (signalStore && entries.length > 0) {
            const identities = new Array<{
                readonly address: ReturnType<typeof parseSignalAddressFromJid>
                readonly identityKey: Uint8Array
            }>(entries.length)
            for (let index = 0; index < entries.length; index += 1) {
                const entry = entries[index]
                identities[index] = {
                    address: parseSignalAddressFromJid(entry.jid),
                    identityKey: toSerializedPubKey(entry.identity)
                }
            }
            await signalStore.setRemoteIdentities(identities)
        }
        this.logger.debug('signal identity sync success', {
            requested: normalizedTargets.length,
            synced: entries.length
        })
        return entries
    }

    private parseIdentitySyncResponse(
        node: BinaryNode,
        requestedJids: readonly string[]
    ): readonly SignalIdentitySyncEntry[] {
        assertIqResult(node, 'identity sync')

        const listNode = findNodeChild(node, WA_NODE_TAGS.LIST)
        if (!listNode) {
            throw new Error('identity sync response missing list node')
        }

        const requested = new Set(requestedJids)
        const userNodes = getNodeChildrenByTag(listNode, WA_NODE_TAGS.USER)
        const parsed = new Array<SignalIdentitySyncEntry>(userNodes.length)
        let parsedCount = 0
        for (let index = 0; index < userNodes.length; index += 1) {
            const userNode = userNodes[index]
            const jid = userNode.attrs.jid
                ? canonicalizeSignalJid(userNode.attrs.jid, this.hostDomain)
                : ''
            if (!jid || !requested.has(jid)) {
                continue
            }
            const errorNode = findNodeChild(userNode, WA_NODE_TAGS.ERROR)
            if (errorNode) {
                this.logger.warn('signal identity sync user error', {
                    jid,
                    code: errorNode.attrs.code,
                    text: errorNode.attrs.text
                })
                continue
            }

            const identityNode = findNodeChild(userNode, WA_NODE_TAGS.IDENTITY)
            if (!identityNode) {
                throw new Error(`identity sync user missing identity node for ${jid}`)
            }
            const typeNode = findNodeChild(userNode, WA_NODE_TAGS.TYPE)

            const identity = decodeExactLength(
                identityNode.content,
                'identity sync identity',
                SIGNAL_KEY_DATA_LENGTH
            )
            const parsedType = typeNode
                ? parseUint(
                      decodeExactLength(
                          typeNode.content,
                          'identity sync type',
                          SIGNAL_KEY_BUNDLE_TYPE_LENGTH
                      ),
                      'identity sync type'
                  )
                : undefined

            if (parsedType === undefined) {
                parsed[parsedCount] = {
                    jid,
                    identity
                }
                parsedCount += 1
                continue
            }
            parsed[parsedCount] = {
                jid,
                identity,
                type: parsedType
            }
            parsedCount += 1
        }
        parsed.length = parsedCount
        return parsed
    }
}
