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

/** Admin-side newsletter operations (create/update/delete + insights). */
export interface WaNewsletterAdminOps {
    /**
     * Creates a new newsletter the current account will own. **Auto-accepts
     * the newsletter-creation TOS** before issuing the create IQ (no manual
     * {@link acceptTos} call needed). `input.picture` is uploaded as JPEG
     * bytes inline (not via the media transfer path) - keep it small.
     */
    readonly create: (input: WaNewsletterCreateInput) => Promise<WaNewsletterMetadata>
    /** Updates the newsletter's editable fields (name/description/picture). */
    readonly update: (
        newsletterJid: string,
        input: WaNewsletterUpdateInput
    ) => Promise<WaNewsletterMetadata>
    /**
     * Permanently deletes the newsletter. **Irreversible** - followers are
     * detached, message history is dropped server-side, and the JID is
     * burned (you can't re-create with the same name and recover anything).
     */
    readonly delete: (newsletterJid: string) => Promise<void>
    /** Returns the admin-only metadata view for the newsletter. */
    readonly fetchAdminInfo: (newsletterJid: string) => Promise<WaNewsletterAdminInfo>
    /** Returns the set of admin capabilities currently granted to the account. */
    readonly fetchAdminCapabilities: (
        newsletterJid: string
    ) => Promise<ReadonlySet<WaNewsletterCapability>>
    /** Lists newsletter followers (paged). */
    readonly fetchFollowers: (
        newsletterJid: string,
        options?: WaNewsletterFollowersOptions
    ) => Promise<WaNewsletterFollowersPage>
    /** Fetches admin analytics for the requested metric set. */
    readonly fetchInsights: (
        newsletterJid: string,
        metrics: readonly WaNewsletterInsightMetricRequest[]
    ) => Promise<WaMexOperationResponses['FetchNewsletterInsights'] | null>
    /** Fetches the moderation reports raised against owned newsletters. */
    readonly fetchReports: () => Promise<WaMexOperationResponses['FetchNewsletterReports'] | null>
    /** Returns JIDs of pending admin invites for the newsletter. */
    readonly fetchPendingInvites: (newsletterJid: string) => Promise<readonly string[]>
    /** Fetches any moderation enforcement state applied to the newsletter. */
    readonly fetchEnforcements: (
        newsletterJid: string
    ) => Promise<WaMexOperationResponses['FetchNewsletterEnforcements'] | null>
    /** Lists voters of a newsletter poll, grouped by selected option. */
    readonly fetchPollVoters: (input: {
        readonly newsletterJid: string
        readonly messageServerId: number
        readonly voteHash: string
        readonly limit?: number
    }) => Promise<ReadonlyMap<string, readonly WaNewsletterPollVoter[]>>
    /** Lists reaction senders for a newsletter message, grouped by emoji. */
    readonly fetchMessageReactionSenders: (input: {
        readonly newsletterJid: string
        readonly messageServerId: number
    }) => Promise<readonly WaNewsletterReactionSenders[]>
    /** Reports newsletter capability exposures back to the server for telemetry. */
    readonly logExposures: (exposures: readonly WaNewsletterCapabilityExposure[]) => Promise<void>
    /** Transfers newsletter ownership to a previously-invited admin. */
    readonly changeOwner: (input: WaNewsletterAdminInviteInput) => Promise<void>
    /** Demotes an admin back to a regular follower. */
    readonly demoteAdmin: (input: WaNewsletterAdminInviteInput) => Promise<void>
    /** Sends an admin invite to a user; returns the invite envelope/expiry. */
    readonly createAdminInvite: (
        input: WaNewsletterAdminInviteInput
    ) => Promise<WaNewsletterAdminInviteResult>
    /**
     * Accepts a pending admin invite on the current account.
     * **Auto-accepts the admin-invite TOS** before the accept IQ.
     * Throws when no invite exists or it has been revoked / expired -
     * check {@link fetchPendingInvites} from the inviter side first.
     */
    readonly acceptAdminInvite: (newsletterJid: string) => Promise<void>
    /** Revokes a previously-sent admin invite. */
    readonly revokeAdminInvite: (input: WaNewsletterAdminInviteInput) => Promise<void>
    /** Returns the TOS acceptance state for the given notice ids. */
    readonly queryTosState: (noticeIds: readonly string[]) => Promise<WaTosQueryResult>
    /** Accepts the given TOS notice ids on behalf of the current account. */
    readonly acceptTos: (noticeIds: readonly string[]) => Promise<void>
}

/** Builds the admin operation set. */
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
