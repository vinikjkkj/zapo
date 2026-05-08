import type {
    WaNewsletterAdminInfo,
    WaNewsletterAdminInviteResult,
    WaNewsletterAdminProfile,
    WaNewsletterDehydratedMetadata,
    WaNewsletterDirectoryCategoryPreview,
    WaNewsletterDirectoryResults,
    WaNewsletterFollower,
    WaNewsletterFollowersPage,
    WaNewsletterMetadata,
    WaNewsletterMexEnvelope,
    WaNewsletterPicture,
    WaNewsletterPollVoter,
    WaNewsletterReactionSenders,
    WaPageInfo
} from '@client/newsletter/types'
import {
    WA_NEWSLETTER_MUTE_TYPES,
    WA_NEWSLETTER_MUTE_VALUES,
    type WaNewsletterRole,
    type WaNewsletterStateType
} from '@protocol/newsletter'

interface RawPicture {
    readonly id?: string
    readonly direct_path?: string
}

export interface MexNewsletterEnvelope {
    readonly id?: string
    readonly state?: { readonly type?: WaNewsletterStateType }
    readonly thread_metadata?: {
        readonly creation_time?: string | number
        readonly name?: { readonly text?: string; readonly update_time?: string | number }
        readonly description?: {
            readonly text?: string
            readonly update_time?: string | number
        }
        readonly picture?: RawPicture
        readonly preview?: RawPicture
        readonly invite?: string
        readonly handle?: string
        readonly subscribers_count?: string | number
        readonly verification?: string
    }
    readonly viewer_metadata?: {
        readonly role?: WaNewsletterRole
        readonly settings?: readonly { readonly type?: string; readonly value?: string }[]
    }
}

interface RawAdminProfile {
    readonly id?: string
    readonly name?: string
    readonly picture?: RawPicture
}

interface RawFollowerEdge {
    readonly admin_profile?: RawAdminProfile
    readonly follow_time?: string | number
    readonly role?: string
    readonly node?: {
        readonly id?: string
        readonly pn?: string
        readonly display_name?: string
        readonly username_info?: { readonly username?: string }
    }
}

interface RawPageInfo {
    readonly hasNextPage?: boolean
    readonly hasPreviousPage?: boolean
    readonly startCursor?: string
    readonly endCursor?: string
}

export function toNumber(value: string | number | null | undefined): number | undefined {
    if (value === null || value === undefined) return undefined
    if (typeof value === 'number') return value
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : undefined
}

function parsePicture(raw: RawPicture | undefined): WaNewsletterPicture | undefined {
    if (!raw) return undefined
    if (!raw.id && !raw.direct_path) return undefined
    return {
        id: raw.id,
        directPath: raw.direct_path
    }
}

function parseAdminProfile(raw: RawAdminProfile | undefined): WaNewsletterAdminProfile | null {
    if (!raw || !raw.name) return null
    return {
        id: raw.id,
        name: raw.name,
        pictureId: raw.picture?.id,
        pictureDirectPath: raw.picture?.direct_path
    }
}

function parsePageInfo(raw: RawPageInfo | undefined): WaPageInfo | undefined {
    if (!raw) return undefined
    return {
        hasNextPage: raw.hasNextPage,
        hasPreviousPage: raw.hasPreviousPage,
        startCursor: raw.startCursor,
        endCursor: raw.endCursor
    }
}

export function parseNewsletterMetadata(envelope: MexNewsletterEnvelope): WaNewsletterMetadata {
    const meta = envelope.thread_metadata
    const viewer = envelope.viewer_metadata
    const settings = viewer?.settings ?? []

    let mutedAdmin: boolean | undefined
    let mutedFollower: boolean | undefined
    for (const setting of settings) {
        if (setting.type === WA_NEWSLETTER_MUTE_TYPES.ADMIN_ACTIVITY) {
            mutedAdmin = setting.value === WA_NEWSLETTER_MUTE_VALUES.ON
        } else if (setting.type === WA_NEWSLETTER_MUTE_TYPES.FOLLOWER_ACTIVITY) {
            mutedFollower = setting.value === WA_NEWSLETTER_MUTE_VALUES.ON
        }
    }

    return {
        jid: envelope.id ?? '',
        state: envelope.state?.type ?? 'ACTIVE',
        creationTime: toNumber(meta?.creation_time),
        name: meta?.name?.text,
        nameUpdateTime: toNumber(meta?.name?.update_time),
        description: meta?.description?.text,
        descriptionUpdateTime: toNumber(meta?.description?.update_time),
        picture: parsePicture(meta?.picture),
        preview: parsePicture(meta?.preview),
        invite: meta?.invite,
        handle: meta?.handle,
        subscribersCount: toNumber(meta?.subscribers_count),
        verification: meta?.verification,
        viewerRole: viewer?.role,
        mutedAdmin,
        mutedFollower
    }
}

export function parseAdminInfo(envelope: WaNewsletterMexEnvelope): WaNewsletterAdminInfo {
    const admin = (envelope as { readonly xwa2_newsletter_admin?: unknown }).xwa2_newsletter_admin
    if (!admin || typeof admin !== 'object') {
        return { adminProfile: null }
    }
    const node = admin as {
        readonly admin_count?: number
        readonly admin_profile?: RawAdminProfile
    }
    return {
        adminCount: node.admin_count,
        adminProfile: parseAdminProfile(node.admin_profile)
    }
}

export function parseAdminCapabilities(envelope: WaNewsletterMexEnvelope): ReadonlySet<string> {
    const admin = (envelope as { readonly xwa2_newsletter_admin?: unknown }).xwa2_newsletter_admin
    if (!admin || typeof admin !== 'object') return new Set()
    const capabilities = (admin as { readonly capabilities?: readonly string[] }).capabilities
    return new Set(Array.isArray(capabilities) ? capabilities : [])
}

export function parsePendingInvites(envelope: WaNewsletterMexEnvelope): readonly string[] {
    const admin = (envelope as { readonly xwa2_newsletter_admin?: unknown }).xwa2_newsletter_admin
    if (!admin || typeof admin !== 'object') return []
    const invites = (
        admin as {
            readonly pending_admin_invites?: readonly {
                readonly user?: { readonly id?: string; readonly pn?: string }
            }[]
        }
    ).pending_admin_invites
    if (!Array.isArray(invites)) return []
    const result: string[] = []
    for (const invite of invites) {
        const user = invite?.user
        const id = user?.pn ?? user?.id
        if (id) result.push(id)
    }
    return result
}

export function parseFollowers(envelope: WaNewsletterMexEnvelope): WaNewsletterFollowersPage {
    const root = (envelope as { readonly xwa2_newsletter_followers?: unknown })
        .xwa2_newsletter_followers
    if (!root || typeof root !== 'object') {
        return { followers: [] }
    }
    const followersWrap = (
        root as {
            readonly followers?: {
                readonly edges?: readonly RawFollowerEdge[]
                readonly page_info?: RawPageInfo
            }
        }
    ).followers
    const edges = followersWrap?.edges ?? []
    const followers: WaNewsletterFollower[] = []
    for (const edge of edges) {
        const id = edge.node?.id
        if (!id) continue
        followers.push({
            id,
            displayName: edge.node?.display_name,
            role: edge.role as WaNewsletterRole | undefined,
            phoneJid: edge.node?.pn,
            username: edge.node?.username_info?.username,
            followTime: toNumber(edge.follow_time),
            adminProfile: parseAdminProfile(edge.admin_profile)
        })
    }
    return { followers, pageInfo: parsePageInfo(followersWrap?.page_info) }
}

interface RawDirectoryResponse {
    readonly result?: readonly MexNewsletterEnvelope[]
    readonly page_info?: RawPageInfo
}

export function parseDirectorySearch(
    envelope: WaNewsletterMexEnvelope
): WaNewsletterDirectoryResults {
    const root = (envelope as { readonly xwa2_newsletters_directory_search?: RawDirectoryResponse })
        .xwa2_newsletters_directory_search
    return {
        results: (root?.result ?? []).map(parseNewsletterMetadata),
        pageInfo: parsePageInfo(root?.page_info)
    }
}

export function parseDirectoryList(
    envelope: WaNewsletterMexEnvelope
): WaNewsletterDirectoryResults {
    const root = (
        envelope as { readonly xwa2_newsletters_directory_list_v2?: RawDirectoryResponse }
    ).xwa2_newsletters_directory_list_v2
    return {
        results: (root?.result ?? []).map(parseNewsletterMetadata),
        pageInfo: parsePageInfo(root?.page_info)
    }
}

export function parseRecommended(
    envelope: WaNewsletterMexEnvelope
): readonly WaNewsletterMetadata[] {
    const root = (envelope as { readonly xwa2_recommended_newsletters?: RawDirectoryResponse })
        .xwa2_recommended_newsletters
    return (root?.result ?? []).map(parseNewsletterMetadata)
}

export function parseSimilar(envelope: WaNewsletterMexEnvelope): readonly WaNewsletterMetadata[] {
    const root = (envelope as { readonly xwa2_newsletters_similar?: RawDirectoryResponse })
        .xwa2_newsletters_similar
    return (root?.result ?? []).map(parseNewsletterMetadata)
}

export function parseDomainsPreviewable(
    envelope: WaNewsletterMexEnvelope
): ReadonlyMap<string, boolean> {
    const root = (
        envelope as {
            readonly xwa2_newsletter_message_integrity?: {
                readonly url_previews?: readonly {
                    readonly url_domain?: string
                    readonly is_previewable?: boolean
                }[]
            }
        }
    ).xwa2_newsletter_message_integrity
    const previews = root?.url_previews ?? []
    const map = new Map<string, boolean>()
    for (const preview of previews) {
        if (preview.url_domain) {
            map.set(preview.url_domain, preview.is_previewable === true)
        }
    }
    return map
}

interface RawDirectoryCategoryPreviewEntry {
    readonly category?: string
    readonly category_title?: string
    readonly newsletters?: readonly MexNewsletterEnvelope[]
}

export function parseDirectoryCategoriesPreview(
    envelope: WaNewsletterMexEnvelope
): readonly WaNewsletterDirectoryCategoryPreview[] {
    const root = (
        envelope as {
            readonly xwa2_newsletters_directory_category_preview?: {
                readonly result?: readonly RawDirectoryCategoryPreviewEntry[]
            }
        }
    ).xwa2_newsletters_directory_category_preview
    const entries = root?.result ?? []
    const result: WaNewsletterDirectoryCategoryPreview[] = []
    for (const entry of entries) {
        if (!entry.category) continue
        result.push({
            category: entry.category,
            categoryTitle: entry.category_title,
            newsletters: (entry.newsletters ?? []).map(parseNewsletterMetadata)
        })
    }
    return result
}

interface RawDehydratedNewsletter {
    readonly id?: string
    readonly thread_metadata?: {
        readonly subscribers_count?: string | number
        readonly verification?: string
        readonly settings?: { readonly reaction_codes?: { readonly value?: string } }
        readonly wamo_sub?: { readonly plan_id?: string }
    }
    readonly viewer_metadata?: { readonly wamo_sub_status?: string }
}

export function parseDehydratedMetadata(
    envelope: WaNewsletterMexEnvelope
): WaNewsletterDehydratedMetadata {
    const node = (envelope as { readonly xwa2_newsletter?: RawDehydratedNewsletter })
        .xwa2_newsletter
    const meta = node?.thread_metadata
    return {
        jid: node?.id ?? '',
        subscribersCount: toNumber(meta?.subscribers_count),
        verification: meta?.verification,
        reactionCodesSetting: meta?.settings?.reaction_codes?.value,
        wamoSubPlanId: meta?.wamo_sub?.plan_id,
        wamoSubStatus: node?.viewer_metadata?.wamo_sub_status
    }
}

export function parseAdminInviteResult(
    envelope: WaNewsletterMexEnvelope
): WaNewsletterAdminInviteResult {
    const root = (
        envelope as {
            readonly xwa2_newsletter_admin_invite_create?: {
                readonly id?: string
                readonly invite_expiration_time?: string | number
            }
        }
    ).xwa2_newsletter_admin_invite_create
    return {
        inviteId: root?.id,
        expirationTime: toNumber(root?.invite_expiration_time)
    }
}

interface RawReactionEntry {
    readonly reaction_code?: string
    readonly sender_list?: {
        readonly edges?: readonly {
            readonly node?: { readonly id?: string; readonly profile_pic_direct_path?: string }
        }[]
    }
}

export function parseReactionSenders(
    envelope: WaNewsletterMexEnvelope
): readonly WaNewsletterReactionSenders[] {
    const root = (
        envelope as {
            readonly xwa2_newsletters_reaction_sender_list?: {
                readonly reactions?: readonly RawReactionEntry[]
            }
        }
    ).xwa2_newsletters_reaction_sender_list
    const reactions = root?.reactions ?? []
    return reactions.map((entry) => ({
        reactionCode: entry.reaction_code ?? '',
        senders: (entry.sender_list?.edges ?? [])
            .map((edge) => ({
                id: edge.node?.id ?? '',
                profileUrl: edge.node?.profile_pic_direct_path
            }))
            .filter((sender) => sender.id.length > 0)
    }))
}

interface RawVotesGroup {
    readonly vote_hash?: string
    readonly voter_list?: {
        readonly edges?: readonly {
            readonly node?: { readonly id?: string }
            readonly action_time?: string | number
        }[]
    }
}

export function parsePollVoters(
    envelope: WaNewsletterMexEnvelope
): ReadonlyMap<string, readonly WaNewsletterPollVoter[]> {
    const root = (
        envelope as {
            readonly voter_list?: { readonly votes?: readonly RawVotesGroup[] }
        }
    ).voter_list
    const votes = root?.votes ?? []
    const map = new Map<string, readonly WaNewsletterPollVoter[]>()
    for (const group of votes) {
        if (!group.vote_hash) continue
        const voters: WaNewsletterPollVoter[] = []
        for (const edge of group.voter_list?.edges ?? []) {
            const id = edge.node?.id
            if (!id) continue
            const time = toNumber(edge.action_time)
            voters.push({
                id,
                time: time !== undefined ? Math.floor(time / 1_000_000) : undefined
            })
        }
        map.set(group.vote_hash, voters)
    }
    return map
}
