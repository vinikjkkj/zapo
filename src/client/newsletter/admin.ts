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
    WaNewsletterInsightMetricRequest,
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
    readonly fetchAdminCapabilities: (newsletterJid: string) => Promise<ReadonlySet<string>>
    readonly fetchFollowers: (
        newsletterJid: string,
        options?: WaNewsletterFollowersOptions
    ) => Promise<WaNewsletterFollowersPage>
    readonly fetchInsights: (
        newsletterJid: string,
        metrics: readonly WaNewsletterInsightMetricRequest[]
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
            return parseNewsletterMetadata(data.xwa2_newsletter_create as MexNewsletterEnvelope)
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
            return parseNewsletterMetadata(data.xwa2_newsletter_update as MexNewsletterEnvelope)
        },
        delete: async (newsletterJid) => {
            await runMex(deps, 'DeleteNewsletter', { newsletter_id: newsletterJid })
        },
        fetchAdminInfo: async (newsletterJid) => {
            const envelope = await runMexEnvelope(deps, 'FetchNewsletterAdminInfo', {
                newsletter_id: newsletterJid
            })
            return parseAdminInfo(envelope)
        },
        fetchAdminCapabilities: async (newsletterJid) => {
            const envelope = await runMexEnvelope(deps, 'FetchNewsletterAdminCapabilities', {
                newsletter_id: newsletterJid
            })
            return parseAdminCapabilities(envelope)
        },
        fetchFollowers: async (newsletterJid, opts) => {
            const envelope = await runMexEnvelope(deps, 'FetchNewsletterFollowers', {
                input: {
                    newsletter_id: newsletterJid,
                    count: opts?.count ?? 50
                }
            })
            return parseFollowers(envelope)
        },
        fetchInsights: (newsletterJid, metrics) => {
            if (metrics.length === 0) {
                throw new Error('newsletter fetchInsights requires at least one metric request')
            }
            return runMexEnvelope(deps, 'FetchNewsletterInsights', {
                input: {
                    newsletter_id: newsletterJid,
                    metrics
                }
            })
        },
        fetchReports: () => runMexEnvelope(deps, 'FetchNewsletterReports', {}),
        fetchPendingInvites: async (newsletterJid) => {
            const envelope = await runMexEnvelope(deps, 'FetchNewsletterPendingInvites', {
                newsletter_id: newsletterJid
            })
            return parsePendingInvites(envelope)
        },
        fetchEnforcements: (newsletterJid) =>
            runMexEnvelope(deps, 'FetchNewsletterEnforcements', { newsletter_id: newsletterJid }),
        fetchPollVoters: async (input) => {
            const envelope = await runMexEnvelope(deps, 'FetchNewsletterPollVoters', {
                input: {
                    newsletter_id: input.newsletterJid,
                    server_id: String(input.messageServerId),
                    vote_hash: input.voteHash,
                    limit: input.limit ?? 50
                }
            })
            return parsePollVoters(envelope)
        },
        fetchMessageReactionSenders: async (input) => {
            const envelope = await runMexEnvelope(
                deps,
                'FetchNewsletterMessageReactionSenderList',
                {
                    input: {
                        id: input.newsletterJid,
                        server_id: String(input.messageServerId)
                    }
                }
            )
            return parseReactionSenders(envelope)
        },
        logExposures: async (exposures) => {
            await runMexEnvelope(deps, 'LogNewsletterExposures', {
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
            const envelope = await runMexEnvelope(deps, 'CreateNewsletterAdminInvite', {
                newsletter_id: input.newsletterJid,
                user_id: input.userJid
            })
            return parseAdminInviteResult(envelope)
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
