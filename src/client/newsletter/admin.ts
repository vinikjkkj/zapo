import {
    ensureTosAccepted,
    runMex,
    runMexEnvelope,
    type WaNewsletterMexDeps
} from '@client/newsletter/mex'
import {
    type MexNewsletterEnvelope,
    parseAdminCapabilities,
    parseAdminInfo,
    parseAdminInviteResult,
    parseFollowers,
    parseNewsletterMetadata,
    parsePendingInvites,
    parsePollVoters,
    parseReactionSenders
} from '@client/newsletter/parse'
import type {
    WaNewsletterAdminInfo,
    WaNewsletterAdminInviteInput,
    WaNewsletterAdminInviteResult,
    WaNewsletterCapabilityExposure,
    WaNewsletterCreateInput,
    WaNewsletterFollowersOptions,
    WaNewsletterFollowersPage,
    WaNewsletterMetadata,
    WaNewsletterMexEnvelope,
    WaNewsletterPollVoter,
    WaNewsletterReactionSenders,
    WaNewsletterUpdateInput
} from '@client/newsletter/types'
import {
    buildTosQueryIq,
    buildTosUpdateIq,
    parseTosQueryResponse,
    type WaTosQueryResult
} from '@transport/node/builders/tos'
import { WA_MEX_PERSIST_IDS } from '@transport/node/mex/persist-ids'
import { bytesToBase64 } from '@util/bytes'

export interface WaNewsletterAdminOps {
    readonly create: (input: WaNewsletterCreateInput) => Promise<WaNewsletterMetadata>
    readonly update: (
        newsletterJid: string,
        input: WaNewsletterUpdateInput
    ) => Promise<WaNewsletterMetadata>
    readonly delete: (newsletterJid: string) => Promise<void>
    readonly fetchAdminInfo: (newsletterJid: string) => Promise<WaNewsletterAdminInfo>
    readonly fetchAdminCapabilities: (newsletterJid: string) => Promise<ReadonlySet<string>>
    readonly fetchFollowers: (
        newsletterJid: string,
        options?: WaNewsletterFollowersOptions
    ) => Promise<WaNewsletterFollowersPage>
    readonly fetchInsights: (
        newsletterJid: string,
        metrics?: readonly string[]
    ) => Promise<WaNewsletterMexEnvelope>
    readonly fetchReports: () => Promise<WaNewsletterMexEnvelope>
    readonly fetchPendingInvites: (newsletterJid: string) => Promise<readonly string[]>
    readonly fetchEnforcements: (newsletterJid: string) => Promise<WaNewsletterMexEnvelope>
    readonly fetchPollVoters: (input: {
        readonly newsletterJid: string
        readonly messageServerId: number
        readonly voteHash: string
        readonly limit?: number
    }) => Promise<ReadonlyMap<string, readonly WaNewsletterPollVoter[]>>
    readonly fetchMessageReactionSenders: (input: {
        readonly newsletterJid: string
        readonly messageServerId: number
    }) => Promise<readonly WaNewsletterReactionSenders[]>
    readonly logExposures: (exposures: readonly WaNewsletterCapabilityExposure[]) => Promise<void>
    readonly changeOwner: (input: WaNewsletterAdminInviteInput) => Promise<void>
    readonly demoteAdmin: (input: WaNewsletterAdminInviteInput) => Promise<void>
    readonly createAdminInvite: (
        input: WaNewsletterAdminInviteInput
    ) => Promise<WaNewsletterAdminInviteResult>
    readonly acceptAdminInvite: (newsletterJid: string) => Promise<void>
    readonly revokeAdminInvite: (input: WaNewsletterAdminInviteInput) => Promise<void>
    readonly queryTosState: (noticeIds: readonly string[]) => Promise<WaTosQueryResult>
    readonly acceptTos: (noticeIds: readonly string[]) => Promise<void>
}

export function createAdminOps(deps: WaNewsletterMexDeps): WaNewsletterAdminOps {
    return {
        create: async (input) => {
            await ensureTosAccepted(deps, 'creation')
            const data = await runMex<{
                readonly xwa2_newsletter_create?: MexNewsletterEnvelope
            } | null>(deps, WA_MEX_PERSIST_IDS.NewsletterCreate, 'NewsletterCreate', {
                input: {
                    name: input.name,
                    description: input.description,
                    picture: input.picture ? bytesToBase64(input.picture) : undefined
                }
            })
            if (!data?.xwa2_newsletter_create) {
                throw new Error('newsletter create returned no envelope')
            }
            return parseNewsletterMetadata(data.xwa2_newsletter_create)
        },
        update: async (newsletterJid, input) => {
            const updates: Record<string, unknown> = {}
            if (input.name !== undefined) updates.name = input.name
            if (input.description !== undefined) updates.description = input.description
            if (input.picture !== undefined) {
                updates.picture = input.picture === null ? null : bytesToBase64(input.picture)
            }
            if (input.reactionCodesSetting !== undefined) {
                updates.reaction_codes = { value: input.reactionCodesSetting }
            }
            const data = await runMex<{
                readonly xwa2_newsletter_update?: MexNewsletterEnvelope
            } | null>(deps, WA_MEX_PERSIST_IDS.NewsletterUpdate, 'NewsletterUpdate', {
                newsletter_id: newsletterJid,
                updates
            })
            if (!data?.xwa2_newsletter_update) {
                throw new Error('newsletter update returned no envelope')
            }
            return parseNewsletterMetadata(data.xwa2_newsletter_update)
        },
        delete: async (newsletterJid) => {
            await runMex<unknown>(deps, WA_MEX_PERSIST_IDS.NewsletterDelete, 'NewsletterDelete', {
                newsletter_id: newsletterJid
            })
        },
        fetchAdminInfo: async (newsletterJid) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterAdminInfo,
                'NewsletterAdminInfo',
                { newsletter_id: newsletterJid }
            )
            return parseAdminInfo(envelope)
        },
        fetchAdminCapabilities: async (newsletterJid) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchAdminCapabilities,
                'NewsletterFetchAdminCapabilities',
                { newsletter_id: newsletterJid }
            )
            return parseAdminCapabilities(envelope)
        },
        fetchFollowers: async (newsletterJid, opts) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFollowers,
                'NewsletterFollowers',
                {
                    input: {
                        newsletter_id: newsletterJid,
                        count: opts?.count ?? 50
                    }
                }
            )
            return parseFollowers(envelope)
        },
        fetchInsights: (newsletterJid, metrics) =>
            runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchInsights,
                'NewsletterFetchInsights',
                {
                    input: {
                        newsletter_id: newsletterJid,
                        metrics: metrics ?? []
                    }
                }
            ),
        fetchReports: () =>
            runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchReports,
                'NewsletterFetchReports',
                {}
            ),
        fetchPendingInvites: async (newsletterJid) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchPendingInvites,
                'NewsletterFetchPendingInvites',
                { newsletter_id: newsletterJid }
            )
            return parsePendingInvites(envelope)
        },
        fetchEnforcements: (newsletterJid) =>
            runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchEnforcements,
                'NewsletterFetchEnforcements',
                { newsletter_id: newsletterJid }
            ),
        fetchPollVoters: async (input) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchPollVoters,
                'NewsletterFetchPollVoters',
                {
                    input: {
                        newsletter_id: input.newsletterJid,
                        server_id: String(input.messageServerId),
                        vote_hash: input.voteHash,
                        limit: input.limit ?? 50
                    }
                }
            )
            return parsePollVoters(envelope)
        },
        fetchMessageReactionSenders: async (input) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchMessageReactionSenders,
                'NewsletterFetchMessageReactionSenders',
                {
                    input: {
                        id: input.newsletterJid,
                        server_id: input.messageServerId
                    }
                }
            )
            return parseReactionSenders(envelope)
        },
        logExposures: async (exposures) => {
            await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterLogExposures,
                'NewsletterLogExposures',
                {
                    input: {
                        exposures: exposures.map((e) => ({
                            newsletter_id: e.newsletterJid,
                            capability: e.capability
                        }))
                    }
                }
            )
        },
        changeOwner: async (input) => {
            await runMex<unknown>(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterChangeOwner,
                'NewsletterChangeOwner',
                {
                    newsletter_id: input.newsletterJid,
                    user_id: input.userJid
                }
            )
        },
        demoteAdmin: async (input) => {
            await runMex<unknown>(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterDemoteAdmin,
                'NewsletterDemoteAdmin',
                {
                    newsletter_id: input.newsletterJid,
                    user_id: input.userJid
                }
            )
        },
        createAdminInvite: async (input) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterCreateAdminInvite,
                'NewsletterCreateAdminInvite',
                {
                    newsletter_id: input.newsletterJid,
                    user_id: input.userJid
                }
            )
            return parseAdminInviteResult(envelope)
        },
        acceptAdminInvite: async (newsletterJid) => {
            await ensureTosAccepted(deps, 'admin_invite')
            await runMex<unknown>(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterAcceptAdminInvite,
                'NewsletterAcceptAdminInvite',
                { newsletter_id: newsletterJid }
            )
        },
        revokeAdminInvite: async (input) => {
            await runMex<unknown>(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterRevokeAdminInvite,
                'NewsletterRevokeAdminInvite',
                {
                    newsletter_id: input.newsletterJid,
                    user_id: input.userJid
                }
            )
        },
        queryTosState: async (noticeIds) => {
            if (!deps.queryWithContext) {
                throw new Error('newsletter queryTosState requires queryWithContext')
            }
            const response = await deps.queryWithContext(
                'newsletter.query_tos',
                buildTosQueryIq(noticeIds)
            )
            return parseTosQueryResponse(response)
        },
        acceptTos: async (noticeIds) => {
            if (!deps.queryWithContext) {
                throw new Error('newsletter acceptTos requires queryWithContext')
            }
            await deps.queryWithContext('newsletter.accept_tos', buildTosUpdateIq(noticeIds))
        }
    }
}
