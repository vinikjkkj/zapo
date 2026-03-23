import type { ParsedPrivacyToken } from '@client/events/privacy-token'
import { CsTokenGenerator } from '@client/tokens/cs-token'
import { isTokenExpired, shouldSendNewToken, clampDuration } from '@client/tokens/tc-token'
import type { WaClientEventMap } from '@client/types'
import type { Logger } from '@infra/log/types'
import { PromiseDedup } from '@infra/perf/PromiseDedup'
import { WA_PRIVACY_TOKEN_TYPES, WA_TC_TOKEN_DEFAULTS } from '@protocol/privacy-token'
import type { WaPrivacyTokenStore } from '@store/contracts/privacy-token.store'
import {
    buildPrivacyTokenIqNode,
    buildTcTokenMessageNode,
    buildCsTokenMessageNode
} from '@transport/node/builders/privacy-token'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

const NCT_SALT_SENTINEL_JID = '__nct_salt__'

type WaTrustedContactTokenRuntime = {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly emitEvent: <K extends keyof WaClientEventMap>(
        event: K,
        ...args: Parameters<WaClientEventMap[K]>
    ) => void
    readonly getCurrentMeLid: () => string | null
}

interface WaTrustedContactTokenConfig {
    readonly durationS: number
    readonly numBuckets: number
    readonly senderDurationS: number
    readonly senderNumBuckets: number
    readonly maxDurationS: number
}

export class WaTrustedContactTokenCoordinator {
    private readonly logger: Logger
    private readonly store: WaPrivacyTokenStore
    private readonly runtime: WaTrustedContactTokenRuntime
    private readonly config: WaTrustedContactTokenConfig
    private readonly csTokenGenerator: CsTokenGenerator
    private readonly senderTokenDedup: PromiseDedup
    private cachedNctSalt: Uint8Array | null
    private nctSaltHydrated: boolean

    public constructor(options: {
        readonly logger: Logger
        readonly store: WaPrivacyTokenStore
        readonly runtime: WaTrustedContactTokenRuntime
        readonly durationS?: number
        readonly numBuckets?: number
        readonly senderDurationS?: number
        readonly senderNumBuckets?: number
        readonly maxDurationS?: number
    }) {
        this.logger = options.logger
        this.store = options.store
        this.runtime = options.runtime
        const maxDurationS = options.maxDurationS ?? WA_TC_TOKEN_DEFAULTS.MAX_DURATION_S
        this.config = {
            durationS: clampDuration(
                options.durationS ?? WA_TC_TOKEN_DEFAULTS.DURATION_S,
                maxDurationS
            ),
            numBuckets: options.numBuckets ?? WA_TC_TOKEN_DEFAULTS.NUM_BUCKETS,
            senderDurationS: clampDuration(
                options.senderDurationS ?? WA_TC_TOKEN_DEFAULTS.SENDER_DURATION_S,
                maxDurationS
            ),
            senderNumBuckets: options.senderNumBuckets ?? WA_TC_TOKEN_DEFAULTS.SENDER_NUM_BUCKETS,
            maxDurationS
        }
        this.csTokenGenerator = new CsTokenGenerator()
        this.senderTokenDedup = new PromiseDedup()
        this.cachedNctSalt = null
        this.nctSaltHydrated = false
    }

    public async resolveTokenForMessage(recipientJid: string): Promise<BinaryNode | null> {
        const record = await this.store.getByJid(recipientJid)
        const nowS = Math.floor(Date.now() / 1000)

        if (
            record?.tcToken &&
            record.tcTokenTimestamp !== undefined &&
            !isTokenExpired(
                record.tcTokenTimestamp,
                nowS,
                this.config.durationS,
                this.config.numBuckets
            )
        ) {
            return buildTcTokenMessageNode(record.tcToken)
        }

        const nctSalt = await this.getNctSalt()
        if (!nctSalt) {
            return null
        }

        const meLid = this.runtime.getCurrentMeLid()
        if (!meLid) {
            return null
        }

        const hash = await this.csTokenGenerator.generate(nctSalt, meLid)
        return buildCsTokenMessageNode(hash)
    }

    public async handleIncomingToken(
        fromJid: string,
        tokens: readonly ParsedPrivacyToken[]
    ): Promise<void> {
        const nowMs = Date.now()
        for (let i = 0; i < tokens.length; i += 1) {
            const token = tokens[i]
            if (token.type !== WA_PRIVACY_TOKEN_TYPES.TRUSTED_CONTACT) {
                this.logger.warn('ignoring unknown privacy token type', { type: token.type })
                continue
            }
            await this.store.upsert({
                jid: fromJid,
                tcToken: token.tokenBytes,
                tcTokenTimestamp: token.timestampS,
                updatedAtMs: nowMs
            })
            this.runtime.emitEvent('privacy_token_update', {
                jid: fromJid,
                timestampS: token.timestampS,
                type: token.type,
                source: 'notification'
            })
        }
    }

    public async maybeIssueSenderToken(recipientJid: string): Promise<void> {
        return this.senderTokenDedup.run(recipientJid, async () => {
            const nowS = Math.floor(Date.now() / 1000)
            const record = await this.store.getByJid(recipientJid)
            const senderTimestampS = record?.tcTokenSenderTimestamp

            if (senderTimestampS !== undefined && senderTimestampS > 0) {
                if (!shouldSendNewToken(senderTimestampS, nowS, this.config.senderDurationS)) {
                    return
                }
            }

            await this.issuePrivacyToken(recipientJid, nowS)
            await this.store.upsert({
                jid: recipientJid,
                tcTokenSenderTimestamp: nowS,
                updatedAtMs: Date.now()
            })
        })
    }

    public async reissueOnIdentityChange(jid: string): Promise<void> {
        const record = await this.store.getByJid(jid)
        if (!record?.tcTokenSenderTimestamp) {
            return
        }

        const nowS = Math.floor(Date.now() / 1000)
        if (
            isTokenExpired(
                record.tcTokenSenderTimestamp,
                nowS,
                this.config.senderDurationS,
                this.config.senderNumBuckets
            )
        ) {
            return
        }

        try {
            await this.issuePrivacyToken(jid, record.tcTokenSenderTimestamp)
        } catch (error) {
            this.logger.warn('send-tc-token-device-identity-change-failed', {
                jid,
                message: toError(error).message
            })
        }
    }

    public async hydrateFromHistorySync(
        conversations: readonly {
            readonly jid: string
            readonly tcToken?: Uint8Array | null
            readonly tcTokenTimestamp?: number | null
            readonly tcTokenSenderTimestamp?: number | null
        }[]
    ): Promise<void> {
        const nowMs = Date.now()
        const records: {
            readonly jid: string
            readonly tcToken?: Uint8Array
            readonly tcTokenTimestamp?: number
            readonly tcTokenSenderTimestamp?: number
            readonly updatedAtMs: number
        }[] = []

        for (let i = 0; i < conversations.length; i += 1) {
            const conv = conversations[i]
            if (!conv.tcToken && !conv.tcTokenTimestamp && !conv.tcTokenSenderTimestamp) {
                continue
            }
            records[records.length] = {
                jid: conv.jid,
                tcToken: conv.tcToken ?? undefined,
                tcTokenTimestamp: conv.tcTokenTimestamp ?? undefined,
                tcTokenSenderTimestamp: conv.tcTokenSenderTimestamp ?? undefined,
                updatedAtMs: nowMs
            }
        }

        if (records.length > 0) {
            await this.store.upsertBatch(records)
        }
    }

    public async handleNctSaltSync(salt: Uint8Array | null): Promise<void> {
        if (salt) {
            await this.store.upsert({
                jid: NCT_SALT_SENTINEL_JID,
                nctSalt: salt,
                updatedAtMs: Date.now()
            })
            this.cachedNctSalt = salt
        } else {
            await this.store.deleteByJid(NCT_SALT_SENTINEL_JID)
            this.cachedNctSalt = null
        }
        this.nctSaltHydrated = true
        this.csTokenGenerator.invalidate()
    }

    public async hydrateNctSaltFromHistorySync(salt: Uint8Array): Promise<void> {
        await this.store.upsert({
            jid: NCT_SALT_SENTINEL_JID,
            nctSalt: salt,
            updatedAtMs: Date.now()
        })
        this.cachedNctSalt = salt
        this.nctSaltHydrated = true
    }

    private async getNctSalt(): Promise<Uint8Array | null> {
        if (this.nctSaltHydrated) {
            return this.cachedNctSalt
        }
        const record = await this.store.getByJid(NCT_SALT_SENTINEL_JID)
        this.cachedNctSalt = record?.nctSalt ?? null
        this.nctSaltHydrated = true
        return this.cachedNctSalt
    }

    private async issuePrivacyToken(jid: string, timestampS: number): Promise<void> {
        const node = buildPrivacyTokenIqNode({ jid, timestampS })
        await this.runtime.queryWithContext('issue-privacy-token', node)
    }
}
