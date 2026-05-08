import { runMex, runMexEnvelope, type WaNewsletterMexDeps } from '@client/newsletter/mex'
import {
    type MexNewsletterEnvelope,
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
import { WA_MEX_PERSIST_IDS } from '@transport/node/mex/persist-ids'

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
        options?: { readonly viewRole?: string; readonly fetchWamoSub?: boolean }
    ) => Promise<WaNewsletterDehydratedMetadata>
}

export function createDiscoveryOps(deps: WaNewsletterMexDeps): WaNewsletterDiscoveryOps {
    async function fetchMetadata(
        key: string,
        keyType: 'JID' | 'INVITE',
        opts: WaNewsletterFetchOptions | undefined
    ): Promise<WaNewsletterMetadata> {
        const data = await runMex<{ readonly xwa2_newsletter?: MexNewsletterEnvelope } | null>(
            deps,
            WA_MEX_PERSIST_IDS.NewsletterFetch,
            'NewsletterFetch',
            {
                input: {
                    key,
                    type: keyType,
                    view_role: opts?.viewRole ?? WA_NEWSLETTER_VIEW_ROLES.SUBSCRIBER
                },
                fetch_viewer_metadata: opts?.fetchViewerMetadata ?? true,
                fetch_full_image: opts?.fetchFullImage ?? keyType !== 'INVITE',
                fetch_creation_time: opts?.fetchCreationTime ?? true,
                fetch_wamo_sub: opts?.fetchWamoSub ?? false
            }
        )
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
            const data = await runMex<{
                readonly xwa2_newsletter_subscribed?: readonly MexNewsletterEnvelope[]
            } | null>(deps, WA_MEX_PERSIST_IDS.NewsletterFetchAll, 'NewsletterFetchAll', {
                fetch_wamo_sub: opts?.fetchWamoSub ?? false
            })
            const list = data?.xwa2_newsletter_subscribed ?? []
            return list.map(parseNewsletterMetadata)
        },
        searchDirectory: async (opts) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterDirectorySearch,
                'NewsletterDirectorySearch',
                {
                    input: {
                        search_text: opts?.searchText ?? '',
                        categories: opts?.categories ?? [],
                        limit: opts?.limit ?? 100,
                        start_cursor: opts?.startCursor
                    }
                }
            )
            return parseDirectorySearch(envelope)
        },
        fetchRecommended: async (opts) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchRecommended,
                'NewsletterFetchRecommended',
                {
                    input: {
                        limit: opts?.limit ?? 25,
                        country_codes: opts?.countryCodes ?? []
                    }
                }
            )
            return parseRecommended(envelope)
        },
        fetchSimilar: async (newsletterJid, opts) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchSimilar,
                'NewsletterFetchSimilar',
                {
                    input: {
                        newsletter_id: newsletterJid,
                        limit: opts?.limit ?? 10,
                        country_codes: opts?.countryCodes ?? []
                    }
                }
            )
            return parseSimilar(envelope)
        },
        fetchDirectoryList: async (opts) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchDirectoryList,
                'NewsletterFetchDirectoryList',
                {
                    input: {
                        view: opts.view,
                        filters: {
                            country_codes: opts.countryCodes ?? [],
                            categories: opts.categories ?? []
                        },
                        limit: opts.limit ?? 25,
                        start_cursor: opts.startCursor
                    }
                }
            )
            return parseDirectoryList(envelope)
        },
        fetchDirectoryCategoriesPreview: async (opts) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchDirectoryCategoriesPreview,
                'NewsletterFetchDirectoryCategoriesPreview',
                {
                    input: {
                        categories: opts.categories,
                        country_code: opts.countryCode || undefined,
                        per_category_limit: opts.perCategoryLimit ?? 10
                    }
                }
            )
            return parseDirectoryCategoriesPreview(envelope)
        },
        fetchIsDomainPreviewable: async (domains) => {
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchIsDomainPreviewable,
                'NewsletterFetchIsDomainPreviewable',
                {
                    url_domains: domains
                }
            )
            return parseDomainsPreviewable(envelope)
        },
        fetchDehydrated: async (keyOrInvite, opts) => {
            const isJid = keyOrInvite.endsWith('@newsletter')
            const envelope = await runMexEnvelope(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterFetchDehydrated,
                'NewsletterFetchDehydrated',
                {
                    input: {
                        key: keyOrInvite,
                        type: isJid ? 'JID' : 'INVITE',
                        view_role: opts?.viewRole ?? WA_NEWSLETTER_VIEW_ROLES.SUBSCRIBER
                    },
                    fetch_wamo_sub: opts?.fetchWamoSub ?? false
                }
            )
            return parseDehydratedMetadata(envelope)
        }
    }
}
