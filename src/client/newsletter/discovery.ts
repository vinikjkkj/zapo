import { runMex, type WaNewsletterMexDeps } from '@client/newsletter/mex'
import {
    parseDehydratedMetadata,
    parseDirectoryCategoriesPreview,
    parseDirectoryList,
    parseDirectorySearch,
    parseDomainsPreviewable,
    parseNewsletterMetadata,
    parseRecommended,
    parseSimilar
} from '@client/newsletter/parse'
import type {
    WaNewsletterDehydratedMetadata,
    WaNewsletterDirectoryCategoriesPreviewOptions,
    WaNewsletterDirectoryCategoryPreview,
    WaNewsletterDirectoryListOptions,
    WaNewsletterDirectoryResults,
    WaNewsletterDirectorySearchOptions,
    WaNewsletterFetchOptions,
    WaNewsletterMetadata,
    WaNewsletterRecommendedOptions,
    WaNewsletterSimilarOptions
} from '@client/newsletter/types'
import { WA_NEWSLETTER_FETCH_KEY_TYPES, WA_NEWSLETTER_VIEW_ROLES } from '@protocol/newsletter'

export interface WaNewsletterDiscoveryOps {
    readonly fetch: (
        newsletterJid: string,
        options?: WaNewsletterFetchOptions
    ) => Promise<WaNewsletterMetadata>
    readonly fetchByInvite: (
        inviteCode: string,
        options?: WaNewsletterFetchOptions
    ) => Promise<WaNewsletterMetadata>
    readonly listSubscribed: (options?: {
        readonly fetchWamoSub?: boolean
    }) => Promise<readonly WaNewsletterMetadata[]>
    readonly searchDirectory: (
        options?: WaNewsletterDirectorySearchOptions
    ) => Promise<WaNewsletterDirectoryResults>
    readonly fetchRecommended: (
        options?: WaNewsletterRecommendedOptions
    ) => Promise<readonly WaNewsletterMetadata[]>
    readonly fetchSimilar: (
        newsletterJid: string,
        options?: WaNewsletterSimilarOptions
    ) => Promise<readonly WaNewsletterMetadata[]>
    readonly fetchDirectoryList: (
        options: WaNewsletterDirectoryListOptions
    ) => Promise<WaNewsletterDirectoryResults>
    readonly fetchDirectoryCategoriesPreview: (
        options: WaNewsletterDirectoryCategoriesPreviewOptions
    ) => Promise<readonly WaNewsletterDirectoryCategoryPreview[]>
    readonly fetchIsDomainPreviewable: (
        domains: readonly string[]
    ) => Promise<ReadonlyMap<string, boolean>>
    readonly fetchDehydrated: (
        keyOrInvite: string,
        options?: {
            readonly viewRole?: keyof typeof WA_NEWSLETTER_VIEW_ROLES
            readonly fetchWamoSub?: boolean
        }
    ) => Promise<WaNewsletterDehydratedMetadata>
}

export function createDiscoveryOps(deps: WaNewsletterMexDeps): WaNewsletterDiscoveryOps {
    async function fetchMetadata(
        key: string,
        keyType: 'JID' | 'INVITE',
        opts: WaNewsletterFetchOptions | undefined
    ): Promise<WaNewsletterMetadata> {
        const data = await runMex(deps, 'FetchNewsletter', {
            input: {
                key,
                type: keyType,
                view_role: opts?.viewRole ?? WA_NEWSLETTER_VIEW_ROLES.SUBSCRIBER
            },
            fetch_viewer_metadata: opts?.fetchViewerMetadata ?? true,
            fetch_full_image: opts?.fetchFullImage ?? keyType !== 'INVITE',
            fetch_creation_time: opts?.fetchCreationTime ?? true,
            fetch_wamo_sub: opts?.fetchWamoSub ?? false,
            fetch_status_metadata: false
        })
        if (!data?.xwa2_newsletter) {
            throw new Error('newsletter fetch returned no envelope')
        }
        return parseNewsletterMetadata(data.xwa2_newsletter)
    }

    return {
        fetch: (jid, opts) => fetchMetadata(jid, WA_NEWSLETTER_FETCH_KEY_TYPES.JID, opts),
        fetchByInvite: (invite, opts) =>
            fetchMetadata(invite, WA_NEWSLETTER_FETCH_KEY_TYPES.INVITE, opts),
        listSubscribed: async (opts) => {
            const data = await runMex(deps, 'FetchAllNewslettersMetadata', {
                fetch_wamo_sub: opts?.fetchWamoSub ?? false,
                fetch_status_metadata: false
            })
            return (data?.xwa2_newsletter_subscribed ?? []).map(parseNewsletterMetadata)
        },
        searchDirectory: async (opts) => {
            const data = await runMex(deps, 'FetchNewsletterDirectorySearchResults', {
                input: {
                    search_text: opts?.searchText ?? '',
                    categories: opts?.categories ?? [],
                    limit: opts?.limit ?? 100,
                    start_cursor: opts?.startCursor
                },
                fetch_status_metadata: false
            })
            return parseDirectorySearch(data)
        },
        fetchRecommended: async (opts) => {
            const data = await runMex(deps, 'FetchRecommendedNewsletters', {
                input: {
                    limit: opts?.limit ?? 25,
                    country_codes: opts?.countryCodes ?? []
                },
                fetch_status_metadata: false
            })
            return parseRecommended(data)
        },
        fetchSimilar: async (newsletterJid, opts) => {
            const data = await runMex(deps, 'FetchSimilarNewsletters', {
                input: {
                    newsletter_id: newsletterJid,
                    limit: opts?.limit ?? 10,
                    country_codes: opts?.countryCodes ?? []
                },
                fetch_status_metadata: false
            })
            return parseSimilar(data)
        },
        fetchDirectoryList: async (opts) => {
            const data = await runMex(deps, 'FetchNewsletterDirectoryList', {
                input: {
                    view: opts.view,
                    filters: {
                        country_codes: opts.countryCodes ?? [],
                        categories: opts.categories ?? []
                    },
                    limit: opts.limit ?? 25,
                    start_cursor: opts.startCursor
                },
                fetch_status_metadata: false
            })
            return parseDirectoryList(data)
        },
        fetchDirectoryCategoriesPreview: async (opts) => {
            const data = await runMex(deps, 'FetchNewsletterDirectoryCategoriesPreview', {
                input: {
                    categories: opts.categories,
                    country_code: opts.countryCode || undefined,
                    per_category_limit: opts.perCategoryLimit ?? 10
                },
                fetch_status_metadata: false
            })
            return parseDirectoryCategoriesPreview(data)
        },
        fetchIsDomainPreviewable: async (domains) => {
            const data = await runMex(deps, 'FetchNewsletterIsDomainPreviewable', {
                url_domains: domains
            })
            return parseDomainsPreviewable(data)
        },
        fetchDehydrated: async (keyOrInvite, opts) => {
            const isJid = keyOrInvite.endsWith('@newsletter')
            const data = await runMex(deps, 'FetchNewsletterDehydrated', {
                input: {
                    key: keyOrInvite,
                    type: isJid ? 'JID' : 'INVITE',
                    view_role: opts?.viewRole ?? WA_NEWSLETTER_VIEW_ROLES.SUBSCRIBER
                },
                fetch_wamo_sub: opts?.fetchWamoSub ?? false
            })
            return parseDehydratedMetadata(data)
        }
    }
}
