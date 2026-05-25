import type {
    WaNewsletterAdminInfo,
    WaNewsletterAdminInviteResult,
    WaNewsletterAdminProfile,
    WaNewsletterCapability,
    WaNewsletterDehydratedMetadata,
    WaNewsletterDirectoryCategoryPreview,
    WaNewsletterDirectoryResults,
    WaNewsletterFollower,
    WaNewsletterFollowersPage,
    WaNewsletterMetadata,
    WaNewsletterPicture,
    WaNewsletterPollVoter,
    WaNewsletterReactionSenders,
    WaPageInfo
} from '@client/newsletter/types'
import type { WaMexOperationResponses } from '@mex'
import {
    WA_NEWSLETTER_MUTE_TYPES,
    WA_NEWSLETTER_MUTE_VALUES,
    WA_NEWSLETTER_STATE_TYPES,
    type WaNewsletterRole,
    type WaNewsletterStateType
} from '@protocol/newsletter'
import { tryAsNumber } from '@util/coercion'

type WaNewsletterMetadataEnvelope = NonNullable<
    WaMexOperationResponses['FetchNewsletter']['xwa2_newsletter']
>

type WaNewsletterPictureLike =
    | NonNullable<NonNullable<WaNewsletterMetadataEnvelope['thread_metadata']>['picture']>
    | undefined

type WaAdminProfileLike =
    | NonNullable<
          NonNullable<
              WaMexOperationResponses['FetchNewsletterAdminInfo']['xwa2_newsletter_admin']
          >['admin_profile']
      >
    | undefined

type WaPageInfoLike =
    | NonNullable<
          NonNullable<
              WaMexOperationResponses['FetchNewsletterDirectoryList']['xwa2_newsletters_directory_list']
          >['page_info']
      >
    | undefined

function asUndef<T>(value: T | null | undefined): T | undefined {
    return value === null ? undefined : value
}

function parsePicture(raw: WaNewsletterPictureLike): WaNewsletterPicture | undefined {
    if (!raw) return undefined
    if (!raw.id && !raw.direct_path) return undefined
    return { id: raw.id, directPath: raw.direct_path }
}

function parseAdminProfile(raw: WaAdminProfileLike): WaNewsletterAdminProfile | null {
    if (!raw?.name) return null
    return {
        id: raw.id,
        name: raw.name,
        pictureId: raw.picture?.id,
        pictureDirectPath: raw.picture?.direct_path
    }
}

function parsePageInfo(raw: WaPageInfoLike): WaPageInfo | undefined {
    if (!raw) return undefined
    return {
        hasNextPage: raw.hasNextPage,
        hasPreviousPage: raw.hasPreviousPage,
        startCursor: raw.startCursor,
        endCursor: raw.endCursor
    }
}

export function parseNewsletterMetadata(
    envelope: WaNewsletterMetadataEnvelope | null | undefined
): WaNewsletterMetadata {
    const meta = envelope?.thread_metadata
    const viewer = envelope?.viewer_metadata
    const name = meta?.name
    const description = meta?.description

    let mutedAdmin: boolean | undefined
    let mutedFollower: boolean | undefined
    for (const setting of viewer?.settings ?? []) {
        if (setting?.type === WA_NEWSLETTER_MUTE_TYPES.ADMIN_ACTIVITY) {
            mutedAdmin = setting.value === WA_NEWSLETTER_MUTE_VALUES.ON
        } else if (setting?.type === WA_NEWSLETTER_MUTE_TYPES.FOLLOWER_ACTIVITY) {
            mutedFollower = setting.value === WA_NEWSLETTER_MUTE_VALUES.ON
        }
    }

    return {
        jid: envelope?.id ?? '',
        state:
            (envelope?.state?.type as WaNewsletterStateType | undefined) ??
            WA_NEWSLETTER_STATE_TYPES.ACTIVE,
        creationTime: asUndef(tryAsNumber(meta?.creation_time)),
        name: name?.text,
        nameUpdateTime: asUndef(tryAsNumber(name?.update_time)),
        description: description?.text,
        descriptionUpdateTime: asUndef(tryAsNumber(description?.update_time)),
        picture: parsePicture(meta?.picture),
        preview: parsePicture(meta?.preview),
        invite: meta?.invite,
        handle: meta?.handle,
        subscribersCount: asUndef(tryAsNumber(meta?.subscribers_count)),
        verification: meta?.verification,
        viewerRole: viewer?.role as WaNewsletterRole | undefined,
        mutedAdmin,
        mutedFollower
    }
}

export function parseAdminInfo(
    data: WaMexOperationResponses['FetchNewsletterAdminInfo'] | null
): WaNewsletterAdminInfo {
    const admin = data?.xwa2_newsletter_admin
    if (!admin) return { adminProfile: null }
    return {
        adminCount: admin.admin_count,
        adminProfile: parseAdminProfile(admin.admin_profile)
    }
}

export function parseAdminCapabilities(
    data: WaMexOperationResponses['FetchNewsletterAdminCapabilities'] | null
): ReadonlySet<WaNewsletterCapability> {
    return new Set(data?.xwa2_newsletter_admin?.capabilities ?? [])
}

export function parsePendingInvites(
    data: WaMexOperationResponses['FetchNewsletterPendingInvites'] | null
): readonly string[] {
    const invites = data?.xwa2_newsletter_admin?.pending_admin_invites ?? []
    const result: string[] = []
    for (const invite of invites) {
        const id = invite?.user?.pn ?? invite?.user?.id
        if (id) result.push(id)
    }
    return result
}

export function parseFollowers(
    data: WaMexOperationResponses['FetchNewsletterFollowers'] | null
): WaNewsletterFollowersPage {
    const followersWrap = data?.xwa2_newsletter_followers?.followers
    const followers: WaNewsletterFollower[] = []
    for (const edge of followersWrap?.edges ?? []) {
        const node = edge?.node
        if (!node?.id) continue
        followers.push({
            id: node.id,
            displayName: node.display_name,
            role: edge.role as WaNewsletterRole | undefined,
            phoneJid: node.pn,
            username: node.username_info?.username,
            followTime: asUndef(tryAsNumber(edge.follow_time)),
            adminProfile: parseAdminProfile(edge.admin_profile)
        })
    }
    return { followers }
}

type DirectoryResultLike =
    | Readonly<{
          page_info?: WaPageInfoLike
          result?: ReadonlyArray<WaNewsletterMetadataEnvelope>
      }>
    | undefined

function parseDirectoryResponse(root: DirectoryResultLike): WaNewsletterDirectoryResults {
    return {
        results: (root?.result ?? []).map(parseNewsletterMetadata),
        pageInfo: parsePageInfo(root?.page_info)
    }
}

export function parseDirectorySearch(
    data: WaMexOperationResponses['FetchNewsletterDirectorySearchResults'] | null
): WaNewsletterDirectoryResults {
    return parseDirectoryResponse(data?.xwa2_newsletters_directory_search)
}

export function parseDirectoryList(
    data: WaMexOperationResponses['FetchNewsletterDirectoryList'] | null
): WaNewsletterDirectoryResults {
    return parseDirectoryResponse(data?.xwa2_newsletters_directory_list)
}

export function parseRecommended(
    data: WaMexOperationResponses['FetchRecommendedNewsletters'] | null
): readonly WaNewsletterMetadata[] {
    return parseDirectoryResponse(data?.xwa2_newsletters_recommended).results
}

export function parseSimilar(
    data: WaMexOperationResponses['FetchSimilarNewsletters'] | null
): readonly WaNewsletterMetadata[] {
    return parseDirectoryResponse(data?.xwa2_newsletters_similar).results
}

export function parseDomainsPreviewable(
    data: WaMexOperationResponses['FetchNewsletterIsDomainPreviewable'] | null
): ReadonlyMap<string, boolean> {
    const map = new Map<string, boolean>()
    for (const preview of data?.xwa2_newsletter_message_integrity?.url_previews ?? []) {
        if (preview?.url_domain) {
            map.set(preview.url_domain, preview.is_previewable === true)
        }
    }
    return map
}

export function parseDirectoryCategoriesPreview(
    data: WaMexOperationResponses['FetchNewsletterDirectoryCategoriesPreview'] | null
): readonly WaNewsletterDirectoryCategoryPreview[] {
    const result: WaNewsletterDirectoryCategoryPreview[] = []
    for (const entry of data?.xwa2_newsletters_directory_category_preview?.result ?? []) {
        if (!entry?.category) continue
        result.push({
            category: entry.category,
            categoryTitle: entry.category_title,
            newsletters: (entry.newsletters ?? []).map(parseNewsletterMetadata)
        })
    }
    return result
}

export function parseDehydratedMetadata(
    data: WaMexOperationResponses['FetchNewsletterDehydrated'] | null
): WaNewsletterDehydratedMetadata {
    const node = data?.xwa2_newsletter
    const meta = node?.thread_metadata
    return {
        jid: node?.id ?? '',
        subscribersCount: asUndef(tryAsNumber(meta?.subscribers_count)),
        verification: meta?.verification,
        reactionCodesSetting: meta?.settings?.reaction_codes?.value,
        wamoSubPlanId: meta?.wamo_sub?.plan_id,
        wamoSubStatus: node?.viewer_metadata?.wamo_sub_status
    }
}

export function parseAdminInviteResult(
    data: WaMexOperationResponses['CreateNewsletterAdminInvite'] | null
): WaNewsletterAdminInviteResult {
    const root = data?.xwa2_newsletter_admin_invite_create
    return {
        inviteId: root?.id,
        expirationTime: asUndef(tryAsNumber(root?.invite_expiration_time))
    }
}

export function parseReactionSenders(
    data: WaMexOperationResponses['FetchNewsletterMessageReactionSenderList'] | null
): readonly WaNewsletterReactionSenders[] {
    const reactions = data?.xwa2_newsletters_reaction_sender_list?.reactions ?? []
    return reactions.map((entry) => {
        const senders: { readonly id: string; readonly profileUrl?: string }[] = []
        for (const edge of entry?.sender_list?.edges ?? []) {
            if (!edge?.node?.id) continue
            senders.push({
                id: edge.node.id,
                profileUrl: edge.node.profile_pic_direct_path
            })
        }
        return { reactionCode: entry?.reaction_code ?? '', senders }
    })
}

export function parsePollVoters(
    data: WaMexOperationResponses['FetchNewsletterPollVoters'] | null
): ReadonlyMap<string, readonly WaNewsletterPollVoter[]> {
    const map = new Map<string, readonly WaNewsletterPollVoter[]>()
    for (const group of data?.voter_list?.votes ?? []) {
        if (!group?.vote_hash) continue
        const voters: WaNewsletterPollVoter[] = []
        for (const edge of group.voter_list?.edges ?? []) {
            if (!edge?.node?.id) continue
            const time = tryAsNumber(edge.action_time)
            voters.push({
                id: edge.node.id,
                time: time !== null ? Math.floor(time / 1_000_000) : undefined
            })
        }
        map.set(group.vote_hash, voters)
    }
    return map
}
