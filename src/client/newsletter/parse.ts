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
    WA_NEWSLETTER_STATE_TYPES,
    type WaNewsletterRole,
    type WaNewsletterStateType
} from '@protocol/newsletter'
import { tryAsNumber, tryAsRecord, tryAsString } from '@util/coercion'

function asUndef<T>(value: T | null): T | undefined {
    return value === null ? undefined : value
}

function asArray(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : []
}

function parsePicture(raw: unknown): WaNewsletterPicture | undefined {
    const r = tryAsRecord(raw)
    if (!r) return undefined
    const id = tryAsString(r.id)
    const directPath = tryAsString(r.direct_path)
    if (!id && !directPath) return undefined
    return { id: asUndef(id), directPath: asUndef(directPath) }
}

function parseAdminProfile(raw: unknown): WaNewsletterAdminProfile | null {
    const r = tryAsRecord(raw)
    const name = tryAsString(r?.name)
    if (!name) return null
    const picture = tryAsRecord(r?.picture)
    return {
        id: asUndef(tryAsString(r?.id)),
        name,
        pictureId: asUndef(tryAsString(picture?.id)),
        pictureDirectPath: asUndef(tryAsString(picture?.direct_path))
    }
}

function parsePageInfo(raw: unknown): WaPageInfo | undefined {
    const r = tryAsRecord(raw)
    if (!r) return undefined
    return {
        hasNextPage: typeof r.hasNextPage === 'boolean' ? r.hasNextPage : undefined,
        hasPreviousPage: typeof r.hasPreviousPage === 'boolean' ? r.hasPreviousPage : undefined,
        startCursor: asUndef(tryAsString(r.startCursor)),
        endCursor: asUndef(tryAsString(r.endCursor))
    }
}

export function parseNewsletterMetadata(envelope: unknown): WaNewsletterMetadata {
    const env = tryAsRecord(envelope)
    const meta = tryAsRecord(env?.thread_metadata)
    const viewer = tryAsRecord(env?.viewer_metadata)
    const state = tryAsRecord(env?.state)
    const name = tryAsRecord(meta?.name)
    const description = tryAsRecord(meta?.description)

    let mutedAdmin: boolean | undefined
    let mutedFollower: boolean | undefined
    for (const settingRaw of asArray(viewer?.settings)) {
        const setting = tryAsRecord(settingRaw)
        const type = tryAsString(setting?.type)
        const value = tryAsString(setting?.value)
        if (type === WA_NEWSLETTER_MUTE_TYPES.ADMIN_ACTIVITY) {
            mutedAdmin = value === WA_NEWSLETTER_MUTE_VALUES.ON
        } else if (type === WA_NEWSLETTER_MUTE_TYPES.FOLLOWER_ACTIVITY) {
            mutedFollower = value === WA_NEWSLETTER_MUTE_VALUES.ON
        }
    }

    return {
        jid: tryAsString(env?.id) ?? '',
        state:
            (tryAsString(state?.type) as WaNewsletterStateType | null) ??
            WA_NEWSLETTER_STATE_TYPES.ACTIVE,
        creationTime: asUndef(tryAsNumber(meta?.creation_time)),
        name: asUndef(tryAsString(name?.text)),
        nameUpdateTime: asUndef(tryAsNumber(name?.update_time)),
        description: asUndef(tryAsString(description?.text)),
        descriptionUpdateTime: asUndef(tryAsNumber(description?.update_time)),
        picture: parsePicture(meta?.picture),
        preview: parsePicture(meta?.preview),
        invite: asUndef(tryAsString(meta?.invite)),
        handle: asUndef(tryAsString(meta?.handle)),
        subscribersCount: asUndef(tryAsNumber(meta?.subscribers_count)),
        verification: asUndef(tryAsString(meta?.verification)),
        viewerRole: (tryAsString(viewer?.role) as WaNewsletterRole | null) ?? undefined,
        mutedAdmin,
        mutedFollower
    }
}

export function parseAdminInfo(envelope: WaNewsletterMexEnvelope): WaNewsletterAdminInfo {
    const admin = tryAsRecord(envelope.xwa2_newsletter_admin)
    if (!admin) return { adminProfile: null }
    return {
        adminCount: asUndef(tryAsNumber(admin.admin_count)),
        adminProfile: parseAdminProfile(admin.admin_profile)
    }
}

export function parseAdminCapabilities(envelope: WaNewsletterMexEnvelope): ReadonlySet<string> {
    const admin = tryAsRecord(envelope.xwa2_newsletter_admin)
    const result = new Set<string>()
    for (const cap of asArray(admin?.capabilities)) {
        const s = tryAsString(cap)
        if (s) result.add(s)
    }
    return result
}

export function parsePendingInvites(envelope: WaNewsletterMexEnvelope): readonly string[] {
    const admin = tryAsRecord(envelope.xwa2_newsletter_admin)
    const result: string[] = []
    for (const inviteRaw of asArray(admin?.pending_admin_invites)) {
        const user = tryAsRecord(tryAsRecord(inviteRaw)?.user)
        const id = tryAsString(user?.pn) ?? tryAsString(user?.id)
        if (id) result.push(id)
    }
    return result
}

export function parseFollowers(envelope: WaNewsletterMexEnvelope): WaNewsletterFollowersPage {
    const root = tryAsRecord(envelope.xwa2_newsletter_followers)
    const followersWrap = tryAsRecord(root?.followers)
    const followers: WaNewsletterFollower[] = []
    for (const edgeRaw of asArray(followersWrap?.edges)) {
        const edge = tryAsRecord(edgeRaw)
        const node = tryAsRecord(edge?.node)
        const id = tryAsString(node?.id)
        if (!id) continue
        followers.push({
            id,
            displayName: asUndef(tryAsString(node?.display_name)),
            role: (tryAsString(edge?.role) as WaNewsletterRole | null) ?? undefined,
            phoneJid: asUndef(tryAsString(node?.pn)),
            username: asUndef(tryAsString(tryAsRecord(node?.username_info)?.username)),
            followTime: asUndef(tryAsNumber(edge?.follow_time)),
            adminProfile: parseAdminProfile(edge?.admin_profile)
        })
    }
    return { followers, pageInfo: parsePageInfo(followersWrap?.page_info) }
}

function parseDirectoryResponse(root: unknown): WaNewsletterDirectoryResults {
    const r = tryAsRecord(root)
    return {
        results: asArray(r?.result).map(parseNewsletterMetadata),
        pageInfo: parsePageInfo(r?.page_info)
    }
}

export function parseDirectorySearch(
    envelope: WaNewsletterMexEnvelope
): WaNewsletterDirectoryResults {
    return parseDirectoryResponse(envelope.xwa2_newsletters_directory_search)
}

export function parseDirectoryList(
    envelope: WaNewsletterMexEnvelope
): WaNewsletterDirectoryResults {
    return parseDirectoryResponse(envelope.xwa2_newsletters_directory_list_v2)
}

export function parseRecommended(
    envelope: WaNewsletterMexEnvelope
): readonly WaNewsletterMetadata[] {
    return parseDirectoryResponse(envelope.xwa2_recommended_newsletters).results
}

export function parseSimilar(envelope: WaNewsletterMexEnvelope): readonly WaNewsletterMetadata[] {
    return parseDirectoryResponse(envelope.xwa2_newsletters_similar).results
}

export function parseDomainsPreviewable(
    envelope: WaNewsletterMexEnvelope
): ReadonlyMap<string, boolean> {
    const root = tryAsRecord(envelope.xwa2_newsletter_message_integrity)
    const map = new Map<string, boolean>()
    for (const previewRaw of asArray(root?.url_previews)) {
        const preview = tryAsRecord(previewRaw)
        const domain = tryAsString(preview?.url_domain)
        if (domain) {
            map.set(domain, preview?.is_previewable === true)
        }
    }
    return map
}

export function parseDirectoryCategoriesPreview(
    envelope: WaNewsletterMexEnvelope
): readonly WaNewsletterDirectoryCategoryPreview[] {
    const root = tryAsRecord(envelope.xwa2_newsletters_directory_category_preview)
    const result: WaNewsletterDirectoryCategoryPreview[] = []
    for (const entryRaw of asArray(root?.result)) {
        const entry = tryAsRecord(entryRaw)
        const category = tryAsString(entry?.category)
        if (!category) continue
        result.push({
            category,
            categoryTitle: asUndef(tryAsString(entry?.category_title)),
            newsletters: asArray(entry?.newsletters).map(parseNewsletterMetadata)
        })
    }
    return result
}

export function parseDehydratedMetadata(
    envelope: WaNewsletterMexEnvelope
): WaNewsletterDehydratedMetadata {
    const node = tryAsRecord(envelope.xwa2_newsletter)
    const meta = tryAsRecord(node?.thread_metadata)
    const reactionCodes = tryAsRecord(tryAsRecord(meta?.settings)?.reaction_codes)
    const wamoSub = tryAsRecord(meta?.wamo_sub)
    const viewer = tryAsRecord(node?.viewer_metadata)
    return {
        jid: tryAsString(node?.id) ?? '',
        subscribersCount: asUndef(tryAsNumber(meta?.subscribers_count)),
        verification: asUndef(tryAsString(meta?.verification)),
        reactionCodesSetting: asUndef(tryAsString(reactionCodes?.value)),
        wamoSubPlanId: asUndef(tryAsString(wamoSub?.plan_id)),
        wamoSubStatus: asUndef(tryAsString(viewer?.wamo_sub_status))
    }
}

export function parseAdminInviteResult(
    envelope: WaNewsletterMexEnvelope
): WaNewsletterAdminInviteResult {
    const root = tryAsRecord(envelope.xwa2_newsletter_admin_invite_create)
    return {
        inviteId: asUndef(tryAsString(root?.id)),
        expirationTime: asUndef(tryAsNumber(root?.invite_expiration_time))
    }
}

export function parseReactionSenders(
    envelope: WaNewsletterMexEnvelope
): readonly WaNewsletterReactionSenders[] {
    const root = tryAsRecord(envelope.xwa2_newsletters_reaction_sender_list)
    return asArray(root?.reactions).map((entryRaw) => {
        const entry = tryAsRecord(entryRaw)
        const senderList = tryAsRecord(entry?.sender_list)
        const senders: { readonly id: string; readonly profileUrl?: string }[] = []
        for (const edgeRaw of asArray(senderList?.edges)) {
            const node = tryAsRecord(tryAsRecord(edgeRaw)?.node)
            const id = tryAsString(node?.id)
            if (!id) continue
            senders.push({
                id,
                profileUrl: asUndef(tryAsString(node?.profile_pic_direct_path))
            })
        }
        return { reactionCode: tryAsString(entry?.reaction_code) ?? '', senders }
    })
}

export function parsePollVoters(
    envelope: WaNewsletterMexEnvelope
): ReadonlyMap<string, readonly WaNewsletterPollVoter[]> {
    const root = tryAsRecord(envelope.voter_list)
    const map = new Map<string, readonly WaNewsletterPollVoter[]>()
    for (const groupRaw of asArray(root?.votes)) {
        const group = tryAsRecord(groupRaw)
        const voteHash = tryAsString(group?.vote_hash)
        if (!voteHash) continue
        const voterList = tryAsRecord(group?.voter_list)
        const voters: WaNewsletterPollVoter[] = []
        for (const edgeRaw of asArray(voterList?.edges)) {
            const edge = tryAsRecord(edgeRaw)
            const node = tryAsRecord(edge?.node)
            const id = tryAsString(node?.id)
            if (!id) continue
            const time = tryAsNumber(edge?.action_time)
            voters.push({
                id,
                time: time !== null ? Math.floor(time / 1_000_000) : undefined
            })
        }
        map.set(voteHash, voters)
    }
    return map
}
