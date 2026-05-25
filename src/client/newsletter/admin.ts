import { ensureTosAccepted, runMex, type WaNewsletterMexDeps } from '@client/newsletter/mex'
import {
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
    WaNewsletterCapability,
    WaNewsletterCapabilityExposure,
    WaNewsletterCreateInput,
    WaNewsletterFollowersOptions,
    WaNewsletterFollowersPage,
    WaNewsletterInsightMetricRequest,
    WaNewsletterMetadata,
    WaNewsletterPollVoter,
    WaNewsletterReactionSenders,
    WaNewsletterUpdateInput
} from '@client/newsletter/types'
import type { WaMexOperationResponses } from '@mex'
import {
    buildTosQueryIq,
    buildTosUpdateIq,
    parseTosQueryResponse,
    type WaTosQueryResult
} from '@transport/node/builders/tos'
import { assertIqResult } from '@transport/node/query'
import { bytesToBase64 } from '@util/bytes'

export interface WaNewsletterAdminOps {
    readonly create: (input: WaNewsletterCreateInput) => Promise<WaNewsletterMetadata>
    readonly update: (
        newsletterJid: string,
        input: WaNewsletterUpdateInput
    ) => Promise<WaNewsletterMetadata>
    readonly delete: (newsletterJid: string) => Promise<void>
    readonly fetchAdminInfo: (newsletterJid: string) => Promise<WaNewsletterAdminInfo>
    readonly fetchAdminCapabilities: (
        newsletterJid: string
    ) => Promise<ReadonlySet<WaNewsletterCapability>>
    readonly fetchFollowers: (
        newsletterJid: string,
        options?: WaNewsletterFollowersOptions
    ) => Promise<WaNewsletterFollowersPage>
    readonly fetchInsights: (
        newsletterJid: string,
        metrics: readonly WaNewsletterInsightMetricRequest[]
    ) => Promise<WaMexOperationResponses['FetchNewsletterInsights'] | null>
    readonly fetchReports: () => Promise<WaMexOperationResponses['FetchNewsletterReports'] | null>
    readonly fetchPendingInvites: (newsletterJid: string) => Promise<readonly string[]>
    readonly fetchEnforcements: (
        newsletterJid: string
    ) => Promise<WaMexOperationResponses['FetchNewsletterEnforcements'] | null>
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
            const data = await runMex(deps, 'CreateNewsletter', {
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
            const data = await runMex(deps, 'UpdateNewsletter', {
                newsletter_id: newsletterJid,
                updates
            })
            if (!data?.xwa2_newsletter_update) {
                throw new Error('newsletter update returned no envelope')
            }
            return parseNewsletterMetadata(data.xwa2_newsletter_update)
        },
        delete: async (newsletterJid) => {
            await runMex(deps, 'DeleteNewsletter', { newsletter_id: newsletterJid })
        },
        fetchAdminInfo: async (newsletterJid) => {
            const data = await runMex(deps, 'FetchNewsletterAdminInfo', {
                newsletter_id: newsletterJid
            })
            return parseAdminInfo(data)
        },
        fetchAdminCapabilities: async (newsletterJid) => {
            const data = await runMex(deps, 'FetchNewsletterAdminCapabilities', {
                newsletter_id: newsletterJid
            })
            return parseAdminCapabilities(data)
        },
        fetchFollowers: async (newsletterJid, opts) => {
            const data = await runMex(deps, 'FetchNewsletterFollowers', {
                input: {
                    newsletter_id: newsletterJid,
                    count: opts?.count ?? 50
                }
            })
            return parseFollowers(data)
        },
        fetchInsights: (newsletterJid, metrics) => {
            if (metrics.length === 0) {
                throw new Error('newsletter fetchInsights requires at least one metric request')
            }
            return runMex(deps, 'FetchNewsletterInsights', {
                input: {
                    newsletter_id: newsletterJid,
                    metrics
                }
            })
        },
        fetchReports: () => runMex(deps, 'FetchNewsletterReports', {}),
        fetchPendingInvites: async (newsletterJid) => {
            const data = await runMex(deps, 'FetchNewsletterPendingInvites', {
                newsletter_id: newsletterJid
            })
            return parsePendingInvites(data)
        },
        fetchEnforcements: (newsletterJid) =>
            runMex(deps, 'FetchNewsletterEnforcements', { newsletter_id: newsletterJid }),
        fetchPollVoters: async (input) => {
            const data = await runMex(deps, 'FetchNewsletterPollVoters', {
                input: {
                    newsletter_id: input.newsletterJid,
                    server_id: String(input.messageServerId),
                    vote_hash: input.voteHash,
                    limit: input.limit ?? 50
                }
            })
            return parsePollVoters(data)
        },
        fetchMessageReactionSenders: async (input) => {
            const data = await runMex(deps, 'FetchNewsletterMessageReactionSenderList', {
                input: {
                    id: input.newsletterJid,
                    server_id: String(input.messageServerId)
                }
            })
            return parseReactionSenders(data)
        },
        logExposures: async (exposures) => {
            await runMex(deps, 'LogNewsletterExposures', {
                input: {
                    exposures: exposures.map((e) => ({
                        newsletter_id: e.newsletterJid,
                        capability: e.capability
                    }))
                }
            })
        },
        changeOwner: async (input) => {
            await runMex(deps, 'ChangeNewsletterOwner', {
                newsletter_id: input.newsletterJid,
                user_id: input.userJid
            })
        },
        demoteAdmin: async (input) => {
            await runMex(deps, 'DemoteNewsletterAdmin', {
                newsletter_id: input.newsletterJid,
                user_id: input.userJid
            })
        },
        createAdminInvite: async (input) => {
            const data = await runMex(deps, 'CreateNewsletterAdminInvite', {
                newsletter_id: input.newsletterJid,
                user_id: input.userJid
            })
            return parseAdminInviteResult(data)
        },
        acceptAdminInvite: async (newsletterJid) => {
            await ensureTosAccepted(deps, 'admin_invite')
            await runMex(deps, 'AcceptNewsletterAdminInvite', { newsletter_id: newsletterJid })
        },
        revokeAdminInvite: async (input) => {
            await runMex(deps, 'RevokeNewsletterAdminInvite', {
                newsletter_id: input.newsletterJid,
                user_id: input.userJid
            })
        },
        queryTosState: async (noticeIds) => {
            if (!deps.queryWithContext) {
                throw new Error('newsletter queryTosState requires queryWithContext')
            }
            const response = await deps.queryWithContext(
                'newsletter.query_tos',
                buildTosQueryIq(noticeIds)
            )
            assertIqResult(response, 'newsletter.query_tos')
            return parseTosQueryResponse(response)
        },
        acceptTos: async (noticeIds) => {
            if (!deps.queryWithContext) {
                throw new Error('newsletter acceptTos requires queryWithContext')
            }
            const response = await deps.queryWithContext(
                'newsletter.accept_tos',
                buildTosUpdateIq(noticeIds)
            )
            assertIqResult(response, 'newsletter.accept_tos')
        }
    }
}
