import type { WaSendContextInfo } from '@message/context-info'
import type { WaMessagePublishResult } from '@message/types'
import type { WaMexOperationResponses } from '@mex'
import type {
    WA_NEWSLETTER_VIEW_ROLES,
    WaNewsletterRole,
    WaNewsletterStateType
} from '@protocol/newsletter'

export type WaNewsletterCapability = NonNullable<
    NonNullable<
        WaMexOperationResponses['FetchNewsletterAdminCapabilities']['xwa2_newsletter_admin']
    >['capabilities']
>[number]

export interface WaNewsletterPicture {
    readonly url?: string
    readonly directPath?: string
    readonly id?: string
}

export interface WaNewsletterMetadata {
    readonly jid: string
    readonly state: WaNewsletterStateType
    readonly creationTime?: number
    readonly name?: string
    readonly nameUpdateTime?: number
    readonly description?: string
    readonly descriptionUpdateTime?: number
    readonly picture?: WaNewsletterPicture
    readonly preview?: WaNewsletterPicture
    readonly invite?: string
    readonly handle?: string
    readonly subscribersCount?: number
    readonly verification?: string
    readonly viewerRole?: WaNewsletterRole
    readonly mutedAdmin?: boolean
    readonly mutedFollower?: boolean
}

export interface WaNewsletterFetchOptions {
    readonly fetchViewerMetadata?: boolean
    readonly fetchCreationTime?: boolean
    readonly fetchFullImage?: boolean
    readonly fetchWamoSub?: boolean
    readonly viewRole?: keyof typeof WA_NEWSLETTER_VIEW_ROLES
}

export interface WaNewsletterInsightMetricRequest {
    readonly id: number
    readonly type: string
    readonly group_by?: { readonly number_of_days?: number }
}

export interface WaNewsletterDirectorySearchOptions {
    readonly searchText?: string
    readonly startCursor?: string
    readonly limit?: number
    readonly categories?: readonly string[]
}

export type WaNewsletterDirectoryView = 'RECOMMENDED' | 'NEW' | 'POPULAR' | 'FEATURED' | 'TRENDING'

export interface WaNewsletterDirectoryListOptions {
    readonly view: WaNewsletterDirectoryView
    readonly countryCodes?: readonly string[]
    readonly categories?: readonly string[]
    readonly startCursor?: string
    readonly limit?: number
}

export interface WaNewsletterRecommendedOptions {
    readonly limit?: number
    readonly countryCodes?: readonly string[]
}

export interface WaNewsletterSimilarOptions {
    readonly limit?: number
    readonly countryCodes?: readonly string[]
}

export interface WaNewsletterFollowersOptions {
    readonly count?: number
}

export interface WaNewsletterDirectoryCategoriesPreviewOptions {
    readonly categories: readonly string[]
    readonly countryCode?: string
    readonly perCategoryLimit?: number
}

export interface WaNewsletterCapabilityExposure {
    readonly newsletterJid: string
    readonly capability: WaNewsletterCapability
}

export interface WaNewsletterCreateInput {
    readonly name: string
    readonly description?: string
    readonly picture?: Uint8Array
}

export interface WaNewsletterUpdateInput {
    readonly name?: string
    readonly description?: string
    readonly picture?: Uint8Array | null
    readonly reactionCodesSetting?: string
}

export interface WaNewsletterMuteInput {
    readonly newsletterJid: string
    readonly mute: boolean
    readonly type?: 'admin' | 'follower'
}

export interface WaNewsletterAdminInviteInput {
    readonly newsletterJid: string
    readonly userJid: string
}

export interface WaNewsletterAdminInviteResult {
    readonly inviteId?: string
    readonly expirationTime?: number
}

export interface WaNewsletterSendOptions {
    readonly stanzaId?: string
    readonly contextInfo?: WaSendContextInfo | null
}

export type WaNewsletterSendResult = WaMessagePublishResult

export interface WaNewsletterReactInput {
    readonly newsletterJid: string
    readonly parentMessageServerId: number
    readonly reactionCode: string
    readonly stanzaId?: string
    readonly revoke?: boolean
}

export interface WaNewsletterRevokeInput {
    readonly newsletterJid: string
    readonly originalMessageId: string
}

export interface WaNewsletterVotePollInput {
    readonly newsletterJid: string
    readonly parentMessageServerId: number
    readonly votes: readonly Uint8Array[]
    readonly stanzaId?: string
    readonly contentType?: string
}

export interface WaNewsletterViewReceiptInput {
    readonly newsletterJid: string
    readonly itemServerIds: readonly number[]
    readonly stanzaId?: string
}

export interface WaNewsletterAdminInfo {
    readonly adminCount?: number
    readonly adminProfile: WaNewsletterAdminProfile | null
}

export interface WaNewsletterAdminProfile {
    readonly id?: string
    readonly name?: string
    readonly pictureId?: string
    readonly pictureDirectPath?: string
}

export interface WaNewsletterFollower {
    readonly id: string
    readonly displayName?: string
    readonly role?: WaNewsletterRole
    readonly phoneJid?: string
    readonly username?: string
    readonly followTime?: number
    readonly adminProfile: WaNewsletterAdminProfile | null
}

export interface WaPageInfo {
    readonly hasNextPage?: boolean
    readonly hasPreviousPage?: boolean
    readonly startCursor?: string
    readonly endCursor?: string
}

export interface WaNewsletterFollowersPage {
    readonly followers: readonly WaNewsletterFollower[]
}

export interface WaNewsletterDirectoryResults {
    readonly results: readonly WaNewsletterMetadata[]
    readonly pageInfo?: WaPageInfo
}

export interface WaNewsletterDirectoryCategoryPreview {
    readonly category: string
    readonly categoryTitle?: string
    readonly newsletters: readonly WaNewsletterMetadata[]
}

export interface WaNewsletterDehydratedMetadata {
    readonly jid: string
    readonly subscribersCount?: number
    readonly verification?: string
    readonly reactionCodesSetting?: string
    readonly wamoSubPlanId?: string
    readonly wamoSubStatus?: string
}

export interface WaNewsletterReactionSenders {
    readonly reactionCode: string
    readonly senders: readonly { readonly id: string; readonly profileUrl?: string }[]
}

export interface WaNewsletterPollVoter {
    readonly id: string
    readonly time?: number
}
