import { createAdminOps, type WaNewsletterAdminOps } from '@client/newsletter/admin'
import { createDiscoveryOps, type WaNewsletterDiscoveryOps } from '@client/newsletter/discovery'
import {
    createMessagingOps,
    type WaNewsletterMessagingDeps,
    type WaNewsletterMessagingOps
} from '@client/newsletter/messaging'
import type { WaNewsletterMexDeps } from '@client/newsletter/mex'

export { parseNewsletterMetadata } from '@client/newsletter/parse'

export type {
    WaNewsletterAdminInfo,
    WaNewsletterAdminInviteInput,
    WaNewsletterAdminInviteResult,
    WaNewsletterAdminProfile,
    WaNewsletterCapabilityExposure,
    WaNewsletterCreateInput,
    WaNewsletterDehydratedMetadata,
    WaNewsletterDirectoryCategoriesPreviewOptions,
    WaNewsletterDirectoryCategoryPreview,
    WaNewsletterDirectoryListOptions,
    WaNewsletterDirectoryResults,
    WaNewsletterDirectorySearchOptions,
    WaNewsletterDirectoryView,
    WaNewsletterFetchOptions,
    WaNewsletterFollower,
    WaNewsletterFollowersOptions,
    WaNewsletterFollowersPage,
    WaNewsletterInsightMetricRequest,
    WaNewsletterMetadata,
    WaNewsletterMuteInput,
    WaNewsletterPicture,
    WaNewsletterPollVoter,
    WaNewsletterReactInput,
    WaNewsletterReactionSenders,
    WaNewsletterRecommendedOptions,
    WaNewsletterRevokeInput,
    WaNewsletterSendOptions,
    WaNewsletterSendResult,
    WaNewsletterSimilarOptions,
    WaNewsletterUpdateInput,
    WaNewsletterViewReceiptInput,
    WaNewsletterVotePollInput,
    WaPageInfo
} from '@client/newsletter/types'

export type WaNewsletterCoordinator = WaNewsletterDiscoveryOps &
    WaNewsletterAdminOps &
    WaNewsletterMessagingOps

export type WaNewsletterCoordinatorOptions = WaNewsletterMessagingDeps

export function createNewsletterCoordinator(
    options: WaNewsletterCoordinatorOptions
): WaNewsletterCoordinator {
    const mexDeps: WaNewsletterMexDeps = options
    return {
        ...createDiscoveryOps(mexDeps),
        ...createAdminOps(mexDeps),
        ...createMessagingOps(options)
    }
}
