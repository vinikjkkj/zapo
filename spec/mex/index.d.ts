// AUTO-GENERATED — do not edit. Regenerated daily by wa-spec.
// WhatsApp Version: 2.3000.1040100380

export interface WaMexPersistId {
    readonly docId: string
    readonly clientDocId: string
}

export interface WaMexOperationSchema<
    K extends 'query' | 'mutation' = 'query' | 'mutation',
    V extends ReadonlyArray<string> = ReadonlyArray<string>
> {
    readonly operationKind: K
    readonly variables: V
}

export declare const WA_MEX_PERSIST_IDS: {
    readonly ACSServerProviderConfig: WaMexPersistId
    readonly ACSServerProviderIssuance: WaMexPersistId
    readonly AcceptNewsletterAdminInvite: WaMexPersistId
    readonly AiAgentAutoReplyControl: WaMexPersistId
    readonly AuthAgentFeaturePolicy: WaMexPersistId
    readonly BPAccessTokenAndSessionCookies: WaMexPersistId
    readonly BizCreateOrder: WaMexPersistId
    readonly BizCustomUrlGetUserGraphql: WaMexPersistId
    readonly BizGetCategories: WaMexPersistId
    readonly BizGetCategoriesV2: WaMexPersistId
    readonly BizGetCustomUrlUserGraphql: WaMexPersistId
    readonly BizGetMerchantCompliance: WaMexPersistId
    readonly BizGetPriceTiers: WaMexPersistId
    readonly BizGetProfileShimlinks: WaMexPersistId
    readonly BizGraphQLRefreshCart: WaMexPersistId
    readonly BizProfileAddressAutocomplete: WaMexPersistId
    readonly BizQueryOrder: WaMexPersistId
    readonly BizSetMerchantCompliance: WaMexPersistId
    readonly CachedToken: WaMexPersistId
    readonly CanonicalUserValid: WaMexPersistId
    readonly ChangeNewsletterOwner: WaMexPersistId
    readonly ConsumerFetchQuickPromotions: WaMexPersistId
    readonly ConsumerQuickPromotionActionGraphQL: WaMexPersistId
    readonly CreateInviteCode: WaMexPersistId
    readonly CreateMarketingCampaignAction: WaMexPersistId
    readonly CreateNewsletter: WaMexPersistId
    readonly CreateNewsletterAdminInvite: WaMexPersistId
    readonly CreateReportAppeal: WaMexPersistId
    readonly CreateWhatsAppAdsIdentity: WaMexPersistId
    readonly CustomLabel3pdEvent: WaMexPersistId
    readonly DeleteNewsletter: WaMexPersistId
    readonly DemoteNewsletterAdmin: WaMexPersistId
    readonly EditBizProfile: WaMexPersistId
    readonly ExternalCtxAuthoriseWAChat: WaMexPersistId
    readonly FetchAboutStatus: WaMexPersistId
    readonly FetchAdEntryPointsConfiguration: WaMexPersistId
    readonly FetchAdEntryPointsConfigurationM1: WaMexPersistId
    readonly FetchAllNewslettersMetadata: WaMexPersistId
    readonly FetchAllSubgroups: WaMexPersistId
    readonly FetchBotProfilesGQL: WaMexPersistId
    readonly FetchDynamicAIModes: WaMexPersistId
    readonly FetchGroupInfo: WaMexPersistId
    readonly FetchGroupInfoIncludBots: WaMexPersistId
    readonly FetchGroupInviteCode: WaMexPersistId
    readonly FetchGroupIsInternal: WaMexPersistId
    readonly FetchIntegritySignals: WaMexPersistId
    readonly FetchNativeAdsMvpEligibility: WaMexPersistId
    readonly FetchNewChatMessageCappingInfo: WaMexPersistId
    readonly FetchNewsletter: WaMexPersistId
    readonly FetchNewsletterAdminCapabilities: WaMexPersistId
    readonly FetchNewsletterAdminInfo: WaMexPersistId
    readonly FetchNewsletterDehydrated: WaMexPersistId
    readonly FetchNewsletterDirectoryCategoriesPreview: WaMexPersistId
    readonly FetchNewsletterDirectoryList: WaMexPersistId
    readonly FetchNewsletterDirectorySearchResults: WaMexPersistId
    readonly FetchNewsletterEnforcements: WaMexPersistId
    readonly FetchNewsletterFollowers: WaMexPersistId
    readonly FetchNewsletterInsights: WaMexPersistId
    readonly FetchNewsletterIsDomainPreviewable: WaMexPersistId
    readonly FetchNewsletterMessageReactionSenderList: WaMexPersistId
    readonly FetchNewsletterPendingInvites: WaMexPersistId
    readonly FetchNewsletterPollVoters: WaMexPersistId
    readonly FetchNewsletterReports: WaMexPersistId
    readonly FetchOHAIKeyConfig: WaMexPersistId
    readonly FetchOIDCState: WaMexPersistId
    readonly FetchPlaintextLinkPreview: WaMexPersistId
    readonly FetchQuickPromotions: WaMexPersistId
    readonly FetchReachoutTimelock: WaMexPersistId
    readonly FetchRecommendedNewsletters: WaMexPersistId
    readonly FetchSimilarNewsletters: WaMexPersistId
    readonly FetchSubgroupSuggestions: WaMexPersistId
    readonly FetchSubscriptionEntryPoints: WaMexPersistId
    readonly FetchSubscriptions: WaMexPersistId
    readonly FetchTextStatusList: WaMexPersistId
    readonly GetAccessTokenFromOIDCCode: WaMexPersistId
    readonly GetAccountNonce: WaMexPersistId
    readonly GetDsbInfo: WaMexPersistId
    readonly GetFBAccountPages: WaMexPersistId
    readonly GetNumbersForBrandIds: WaMexPersistId
    readonly GetPrivacyLists: WaMexPersistId
    readonly GetPrivacySettings: WaMexPersistId
    readonly GetUsername: WaMexPersistId
    readonly GetWAAEligibility: WaMexPersistId
    readonly GraphQLProductCatalogGetPublicKey: WaMexPersistId
    readonly GraphQLVerifyPostcode: WaMexPersistId
    readonly GroupStoreInviteSms: WaMexPersistId
    readonly GroupSuspensionAppeal: WaMexPersistId
    readonly IntegrityChallengeResponse: WaMexPersistId
    readonly JoinNewsletter: WaMexPersistId
    readonly LeaveNewsletter: WaMexPersistId
    readonly LidChangeNotification: WaMexPersistId
    readonly LogNewsletterExposures: WaMexPersistId
    readonly NativeMLModel: WaMexPersistId
    readonly NewsletterAddPaidPartnershipLabel: WaMexPersistId
    readonly QueryCatalog: WaMexPersistId
    readonly QueryCatalogHasCategories: WaMexPersistId
    readonly QueryCatalogProduct: WaMexPersistId
    readonly QueryProductCollections: WaMexPersistId
    readonly QueryProductListCatalog: WaMexPersistId
    readonly QueryProductSingleCollection: WaMexPersistId
    readonly QuerySubgroupParticipantCount: WaMexPersistId
    readonly QuickPromotionAction: WaMexPersistId
    readonly ReportProduct: WaMexPersistId
    readonly RequestClientLogsForBug: WaMexPersistId
    readonly ResolveAccountTypeAndAdPage: WaMexPersistId
    readonly ResolveAccountTypeAndAdPageQuery: WaMexPersistId
    readonly RevokeNewsletterAdminInvite: WaMexPersistId
    readonly SetUsername: WaMexPersistId
    readonly SetUsernameKey: WaMexPersistId
    readonly SignupMetadata: WaMexPersistId
    readonly SupportBugReportSubmit: WaMexPersistId
    readonly SupportContactFormSubmit: WaMexPersistId
    readonly SupportMessageFeedbackSubmit: WaMexPersistId
    readonly TransferCommunityOwnership: WaMexPersistId
    readonly UpdateGroupProperty: WaMexPersistId
    readonly UpdateNewsletter: WaMexPersistId
    readonly UpdateNewsletterUserSetting: WaMexPersistId
    readonly UpdateTextStatus: WaMexPersistId
    readonly UsernameAvailability: WaMexPersistId
    readonly Usync: WaMexPersistId
    readonly WAAOnboarding: WaMexPersistId
    readonly WaffleFXServiceDataQueryV2: WaMexPersistId
    readonly WaffleFXWAMOUpdateUOOM: WaMexPersistId
    readonly WaffleXE: WaMexPersistId
    readonly useWAWebEstimatedDailyReach: WaMexPersistId
}

export declare const WA_MEX_OPERATION_SCHEMAS: {
    readonly ACSServerProviderConfig: WaMexOperationSchema<'query', readonly ['project_name']>
    readonly ACSServerProviderIssuance: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly AcceptNewsletterAdminInvite: WaMexOperationSchema<'mutation', readonly ['newsletter_id']>
    readonly AiAgentAutoReplyControl: WaMexOperationSchema<'mutation', readonly ['consumer_lid', 'phone_number', 'thread_status']>
    readonly AuthAgentFeaturePolicy: WaMexOperationSchema<'query', readonly []>
    readonly BPAccessTokenAndSessionCookies: WaMexOperationSchema<'mutation', readonly ['application_id', 'code']>
    readonly BizCreateOrder: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly BizCustomUrlGetUserGraphql: WaMexOperationSchema<'query', readonly ['data']>
    readonly BizGetCategories: WaMexOperationSchema<'query', readonly ['query_params']>
    readonly BizGetCategoriesV2: WaMexOperationSchema<'query', readonly ['query_params']>
    readonly BizGetCustomUrlUserGraphql: WaMexOperationSchema<'query', readonly ['data']>
    readonly BizGetMerchantCompliance: WaMexOperationSchema<'query', readonly ['request']>
    readonly BizGetPriceTiers: WaMexOperationSchema<'query', readonly ['request']>
    readonly BizGetProfileShimlinks: WaMexOperationSchema<'query', readonly ['bizJid']>
    readonly BizGraphQLRefreshCart: WaMexOperationSchema<'query', readonly ['request']>
    readonly BizProfileAddressAutocomplete: WaMexOperationSchema<'query', readonly ['input']>
    readonly BizQueryOrder: WaMexOperationSchema<'query', readonly ['request']>
    readonly BizSetMerchantCompliance: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CachedToken: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CanonicalUserValid: WaMexOperationSchema<'query', readonly []>
    readonly ChangeNewsletterOwner: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'user_id']>
    readonly ConsumerFetchQuickPromotions: WaMexOperationSchema<'query', readonly ['nux_ids', 'trigger_context']>
    readonly ConsumerQuickPromotionActionGraphQL: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CreateInviteCode: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CreateMarketingCampaignAction: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CreateNewsletter: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CreateNewsletterAdminInvite: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'user_id']>
    readonly CreateReportAppeal: WaMexOperationSchema<'mutation', readonly ['reason', 'report_id']>
    readonly CreateWhatsAppAdsIdentity: WaMexOperationSchema<'mutation', readonly ['code', 'phone_number']>
    readonly CustomLabel3pdEvent: WaMexOperationSchema<'query', readonly ['custom_labels', 'expt_group']>
    readonly DeleteNewsletter: WaMexOperationSchema<'mutation', readonly ['newsletter_id']>
    readonly DemoteNewsletterAdmin: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'user_id']>
    readonly EditBizProfile: WaMexOperationSchema<'mutation', readonly ['input', 'lid']>
    readonly ExternalCtxAuthoriseWAChat: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly FetchAboutStatus: WaMexOperationSchema<'query', readonly ['user']>
    readonly FetchAdEntryPointsConfiguration: WaMexOperationSchema<'query', readonly []>
    readonly FetchAdEntryPointsConfigurationM1: WaMexOperationSchema<'query', readonly []>
    readonly FetchAllNewslettersMetadata: WaMexOperationSchema<'query', readonly ['fetch_status_metadata', 'fetch_wamo_sub']>
    readonly FetchAllSubgroups: WaMexOperationSchema<'query', readonly ['group_id', 'query_context', 'sub_group_hint_id']>
    readonly FetchBotProfilesGQL: WaMexOperationSchema<'query', readonly ['ids']>
    readonly FetchDynamicAIModes: WaMexOperationSchema<'query', readonly []>
    readonly FetchGroupInfo: WaMexOperationSchema<'query', readonly ['id', 'include_username', 'participants_phash', 'query_context']>
    readonly FetchGroupInfoIncludBots: WaMexOperationSchema<'query', readonly ['id', 'include_username', 'participants_phash', 'query_context']>
    readonly FetchGroupInviteCode: WaMexOperationSchema<'query', readonly ['id', 'query_context']>
    readonly FetchGroupIsInternal: WaMexOperationSchema<'query', readonly ['id']>
    readonly FetchIntegritySignals: WaMexOperationSchema<'query', readonly ['input']>
    readonly FetchNativeAdsMvpEligibility: WaMexOperationSchema<'query', readonly ['phone_number']>
    readonly FetchNewChatMessageCappingInfo: WaMexOperationSchema<'query', readonly ['input']>
    readonly FetchNewsletter: WaMexOperationSchema<'query', readonly ['fetch_creation_time', 'fetch_full_image', 'fetch_status_metadata', 'fetch_viewer_metadata', 'fetch_wamo_sub', 'input']>
    readonly FetchNewsletterAdminCapabilities: WaMexOperationSchema<'query', readonly ['newsletter_id']>
    readonly FetchNewsletterAdminInfo: WaMexOperationSchema<'query', readonly ['newsletter_id']>
    readonly FetchNewsletterDehydrated: WaMexOperationSchema<'query', readonly ['fetch_wamo_sub', 'input']>
    readonly FetchNewsletterDirectoryCategoriesPreview: WaMexOperationSchema<'query', readonly ['fetch_status_metadata', 'input']>
    readonly FetchNewsletterDirectoryList: WaMexOperationSchema<'query', readonly ['fetch_status_metadata', 'input']>
    readonly FetchNewsletterDirectorySearchResults: WaMexOperationSchema<'query', readonly ['fetch_status_metadata', 'input']>
    readonly FetchNewsletterEnforcements: WaMexOperationSchema<'query', readonly ['locale', 'newsletter_id']>
    readonly FetchNewsletterFollowers: WaMexOperationSchema<'query', readonly ['input']>
    readonly FetchNewsletterInsights: WaMexOperationSchema<'query', readonly ['input']>
    readonly FetchNewsletterIsDomainPreviewable: WaMexOperationSchema<'query', readonly ['url_domains']>
    readonly FetchNewsletterMessageReactionSenderList: WaMexOperationSchema<'query', readonly ['input']>
    readonly FetchNewsletterPendingInvites: WaMexOperationSchema<'query', readonly ['newsletter_id']>
    readonly FetchNewsletterPollVoters: WaMexOperationSchema<'query', readonly ['input']>
    readonly FetchNewsletterReports: WaMexOperationSchema<'query', readonly []>
    readonly FetchOHAIKeyConfig: WaMexOperationSchema<'query', readonly []>
    readonly FetchOIDCState: WaMexOperationSchema<'query', readonly []>
    readonly FetchPlaintextLinkPreview: WaMexOperationSchema<'query', readonly ['input']>
    readonly FetchQuickPromotions: WaMexOperationSchema<'query', readonly ['nux_ids', 'trigger_context']>
    readonly FetchReachoutTimelock: WaMexOperationSchema<'query', readonly []>
    readonly FetchRecommendedNewsletters: WaMexOperationSchema<'query', readonly ['fetch_status_metadata', 'input']>
    readonly FetchSimilarNewsletters: WaMexOperationSchema<'query', readonly ['fetch_status_metadata', 'input']>
    readonly FetchSubgroupSuggestions: WaMexOperationSchema<'query', readonly ['group_id', 'query_context', 'sub_group_hint_id']>
    readonly FetchSubscriptionEntryPoints: WaMexOperationSchema<'query', readonly []>
    readonly FetchSubscriptions: WaMexOperationSchema<'query', readonly ['data']>
    readonly FetchTextStatusList: WaMexOperationSchema<'query', readonly ['input']>
    readonly GetAccessTokenFromOIDCCode: WaMexOperationSchema<'mutation', readonly ['code', 'state']>
    readonly GetAccountNonce: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly GetDsbInfo: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly GetFBAccountPages: WaMexOperationSchema<'query', readonly ['userId']>
    readonly GetNumbersForBrandIds: WaMexOperationSchema<'query', readonly ['input']>
    readonly GetPrivacyLists: WaMexOperationSchema<'query', readonly ['input']>
    readonly GetPrivacySettings: WaMexOperationSchema<'query', readonly ['input']>
    readonly GetUsername: WaMexOperationSchema<'query', readonly []>
    readonly GetWAAEligibility: WaMexOperationSchema<'query', readonly ['input']>
    readonly GraphQLProductCatalogGetPublicKey: WaMexOperationSchema<'query', readonly ['request']>
    readonly GraphQLVerifyPostcode: WaMexOperationSchema<'query', readonly ['request']>
    readonly GroupStoreInviteSms: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly GroupSuspensionAppeal: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly IntegrityChallengeResponse: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly JoinNewsletter: WaMexOperationSchema<'mutation', readonly ['newsletter_id']>
    readonly LeaveNewsletter: WaMexOperationSchema<'mutation', readonly ['newsletter_id']>
    readonly LidChangeNotification: WaMexOperationSchema<'query', readonly []>
    readonly LogNewsletterExposures: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly NativeMLModel: WaMexOperationSchema<'query', readonly ['client_capability_metadata', 'model_request_metadatas']>
    readonly NewsletterAddPaidPartnershipLabel: WaMexOperationSchema<'mutation', readonly ['message_type', 'newsletter_id', 'server_id']>
    readonly QueryCatalog: WaMexOperationSchema<'query', readonly ['request']>
    readonly QueryCatalogHasCategories: WaMexOperationSchema<'query', readonly ['request']>
    readonly QueryCatalogProduct: WaMexOperationSchema<'query', readonly ['request']>
    readonly QueryProductCollections: WaMexOperationSchema<'query', readonly ['request']>
    readonly QueryProductListCatalog: WaMexOperationSchema<'query', readonly ['request']>
    readonly QueryProductSingleCollection: WaMexOperationSchema<'query', readonly ['request']>
    readonly QuerySubgroupParticipantCount: WaMexOperationSchema<'query', readonly ['input']>
    readonly QuickPromotionAction: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly ReportProduct: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly RequestClientLogsForBug: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly ResolveAccountTypeAndAdPage: WaMexOperationSchema<'mutation', readonly []>
    readonly ResolveAccountTypeAndAdPageQuery: WaMexOperationSchema<'query', readonly ['pageId']>
    readonly RevokeNewsletterAdminInvite: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'user_id']>
    readonly SetUsername: WaMexOperationSchema<'mutation', readonly ['input', 'reserved', 'session_id', 'source']>
    readonly SetUsernameKey: WaMexOperationSchema<'mutation', readonly ['pin']>
    readonly SignupMetadata: WaMexOperationSchema<'query', readonly ['phone_number', 'signup_id']>
    readonly SupportBugReportSubmit: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SupportContactFormSubmit: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SupportMessageFeedbackSubmit: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly TransferCommunityOwnership: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly UpdateGroupProperty: WaMexOperationSchema<'mutation', readonly ['group_id', 'update']>
    readonly UpdateNewsletter: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'updates']>
    readonly UpdateNewsletterUserSetting: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly UpdateTextStatus: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly UsernameAvailability: WaMexOperationSchema<'query', readonly ['input', 'session_id', 'source']>
    readonly Usync: WaMexOperationSchema<'query', readonly ['include_about_status', 'include_country_code', 'include_username', 'input']>
    readonly WAAOnboarding: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly WaffleFXServiceDataQueryV2: WaMexOperationSchema<'mutation', readonly []>
    readonly WaffleFXWAMOUpdateUOOM: WaMexOperationSchema<'mutation', readonly []>
    readonly WaffleXE: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly useWAWebEstimatedDailyReach: WaMexOperationSchema<'query', readonly ['audienceOptionAudience', 'configuredPlacementSpec', 'currency', 'flow', 'flowID', 'legacyAdAccountID', 'optimizationGoalInput', 'postID', 'targetingSpecAudience']>
}

export type WaMexACSServerProviderConfigVariables = {
    readonly project_name?: string
}

export type WaMexACSServerProviderIssuanceVariables = {
    readonly input?: {
        readonly project_name?: string
        readonly config_id?: string
        readonly issue_element?: string
        readonly request_proof?: string
    }
}

export type WaMexAcceptNewsletterAdminInviteVariables = {
    readonly newsletter_id?: string
}

export type WaMexAiAgentAutoReplyControlVariables = {
    readonly consumer_lid?: string
    readonly phone_number?: string
    readonly thread_status?: string
}

export type WaMexAuthAgentFeaturePolicyVariables = Readonly<Record<string, never>>

export type WaMexBPAccessTokenAndSessionCookiesVariables = {
    readonly application_id?: number
    readonly code?: string
}

export type WaMexBizCreateOrderVariables = {
    readonly input?: {
        readonly order?: {
            readonly jid?: string
            readonly products?: ReadonlyArray<Readonly<Record<string, unknown>>>
        }
    }
}

export type WaMexBizCustomUrlGetUserGraphqlVariables = {
    readonly data?: {
        readonly custom_url?: {
            readonly path?: string
        }
    }
}

export type WaMexBizGetCategoriesVariables = {
    readonly query_params?: {
        readonly query?: string
        readonly locale?: string
        readonly operation?: 'PROFILE_TYPEAHEAD'
        readonly version?: 'V_1'
    }
}

export type WaMexBizGetCategoriesV2Variables = {
    readonly query_params?: {
        readonly query?: string
        readonly locale?: string
        readonly operation?: 'PROFILE_TYPEAHEAD'
        readonly version?: 'V_2'
    }
}

export type WaMexBizGetCustomUrlUserGraphqlVariables = {
    readonly data?: {
        readonly custom_url?: {
            readonly path?: string
        }
    }
}

export type WaMexBizGetMerchantComplianceVariables = {
    readonly request?: Readonly<Record<string, unknown>>
}

export type WaMexBizGetPriceTiersVariables = {
    readonly request?: {
        readonly locale?: string
    }
}

export type WaMexBizGetProfileShimlinksVariables = {
    readonly bizJid?: string
}

export type WaMexBizGraphQLRefreshCartVariables = {
    readonly request?: Readonly<Record<string, unknown>>
}

export type WaMexBizProfileAddressAutocompleteVariables = {
    readonly input?: {
        readonly center?: string
        readonly query?: string
        readonly use_case_id?: 'WHATSAPP_BIZ_PROFILE'
    }
}

export type WaMexBizQueryOrderVariables = {
    readonly request?: {
        readonly order?: {
            readonly jid?: string
            readonly token?: {
                readonly sensitive_string_value?: string
            }
            readonly id?: string
            readonly image_dimensions?: {
                readonly height?: number
                readonly width?: number
            }
            readonly direct_connection_encrypted_info?: string
        }
    }
}

export type WaMexBizSetMerchantComplianceVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexCachedTokenVariables = {
    readonly input?: {
        readonly client_pub_key?: string
        readonly request_id?: string
    }
}

export type WaMexCanonicalUserValidVariables = Readonly<Record<string, never>>

export type WaMexChangeNewsletterOwnerVariables = {
    readonly newsletter_id?: string
    readonly user_id?: string
}

export type WaMexConsumerFetchQuickPromotionsVariables = {
    readonly nux_ids?: ReadonlyArray<string>
    readonly trigger_context?: {
        readonly wa_smb_trigger_context?: {
            readonly is_from_wa_smb?: boolean
            readonly app_version?: number
            readonly country?: string
            readonly locale?: string
        }
    }
}

export type WaMexConsumerQuickPromotionActionGraphQLVariables = {
    readonly input?: string
}

export type WaMexCreateInviteCodeVariables = {
    readonly input?: {
        readonly receiver?: string
        readonly entry_point?: string
        readonly server_send_sms?: boolean
    }
}

export type WaMexCreateMarketingCampaignActionVariables = {
    readonly input?: string
}

export type WaMexCreateNewsletterVariables = {
    readonly input?: {
        readonly name?: string
        readonly description?: string
        readonly picture?: string
    }
}

export type WaMexCreateNewsletterAdminInviteVariables = {
    readonly newsletter_id?: string
    readonly user_id?: string
}

export type WaMexCreateReportAppealVariables = {
    readonly reason?: string
    readonly report_id?: string
}

export type WaMexCreateWhatsAppAdsIdentityVariables = {
    readonly code?: {
        readonly sensitive_string_value?: string
    }
    readonly phone_number?: {
        readonly sensitive_string_value?: string
    }
}

export type WaMexCustomLabel3pdEventVariables = {
    readonly custom_labels?: ReadonlyArray<string>
    readonly expt_group?: string
}

export type WaMexDeleteNewsletterVariables = {
    readonly newsletter_id?: string
}

export type WaMexDemoteNewsletterAdminVariables = {
    readonly newsletter_id?: string
    readonly user_id?: string
}

export type WaMexEditBizProfileVariables = {
    readonly input?: Readonly<Record<string, unknown>>
    readonly lid?: string
}

export type WaMexExternalCtxAuthoriseWAChatVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexFetchAboutStatusVariables = {
    readonly user?: {
        readonly user_id?: string
    }
}

export type WaMexFetchAdEntryPointsConfigurationVariables = Readonly<Record<string, never>>

export type WaMexFetchAdEntryPointsConfigurationM1Variables = Readonly<Record<string, never>>

export type WaMexFetchAllNewslettersMetadataVariables = {
    readonly fetch_status_metadata?: boolean
    readonly fetch_wamo_sub?: boolean
}

export type WaMexFetchAllSubgroupsVariables = {
    readonly group_id?: string
    readonly query_context?: string
    readonly sub_group_hint_id?: string
}

export type WaMexFetchBotProfilesGQLVariables = {
    readonly ids?: ReadonlyArray<string>
}

export type WaMexFetchDynamicAIModesVariables = Readonly<Record<string, never>>

export type WaMexFetchGroupInfoVariables = {
    readonly id?: string
    readonly include_username?: boolean
    readonly participants_phash?: string
    readonly query_context?: string
}

export type WaMexFetchGroupInfoIncludBotsVariables = {
    readonly id?: string
    readonly include_username?: boolean
    readonly participants_phash?: string
    readonly query_context?: string
}

export type WaMexFetchGroupInviteCodeVariables = {
    readonly id?: string
    readonly query_context?: 'INVITE_CODE'
}

export type WaMexFetchGroupIsInternalVariables = {
    readonly id?: string
}

export type WaMexFetchIntegritySignalsVariables = {
    readonly input?: {
        readonly query_input?: ReadonlyArray<{
            readonly jid?: string
            readonly integrity_signals?: {
                readonly use_case?: 'CHAT_FMX'
            }
        }>
        readonly telemetry?: {
            readonly context?: 'INTERACTIVE'
        }
    }
}

export type WaMexFetchNativeAdsMvpEligibilityVariables = {
    readonly phone_number?: string
}

export type WaMexFetchNewChatMessageCappingInfoVariables = {
    readonly input?: {
        readonly type?: 'INDIVIDUAL_NEW_CHAT_THREAD'
    }
}

export type WaMexFetchNewsletterVariables = {
    readonly fetch_creation_time?: boolean
    readonly fetch_full_image?: boolean
    readonly fetch_status_metadata?: boolean
    readonly fetch_viewer_metadata?: boolean
    readonly fetch_wamo_sub?: boolean
    readonly input?: {
        readonly key?: string
        readonly type?: 'INVITE' | 'JID'
        readonly view_role?: 'ADMIN' | 'GUEST' | 'OWNER' | 'SUBSCRIBER'
    }
}

export type WaMexFetchNewsletterAdminCapabilitiesVariables = {
    readonly newsletter_id?: string
}

export type WaMexFetchNewsletterAdminInfoVariables = {
    readonly newsletter_id?: string
}

export type WaMexFetchNewsletterDehydratedVariables = {
    readonly fetch_wamo_sub?: boolean
    readonly input?: {
        readonly key?: string
        readonly type?: 'INVITE' | 'JID'
        readonly view_role?: 'ADMIN' | 'GUEST' | 'OWNER' | 'SUBSCRIBER'
    }
}

export type WaMexFetchNewsletterDirectoryCategoriesPreviewVariables = {
    readonly fetch_status_metadata?: boolean
    readonly input?: {
        readonly categories?: ReadonlyArray<string>
        readonly country_code?: string
        readonly per_category_limit?: number
    }
}

export type WaMexFetchNewsletterDirectoryListVariables = {
    readonly fetch_status_metadata?: boolean
    readonly input?: {
        readonly view?: string
        readonly filters?: {
            readonly country_codes?: ReadonlyArray<string>
            readonly categories?: ReadonlyArray<string>
        }
        readonly limit?: number
        readonly start_cursor?: string
    }
}

export type WaMexFetchNewsletterDirectorySearchResultsVariables = {
    readonly fetch_status_metadata?: boolean
    readonly input?: {
        readonly search_text?: string
        readonly categories?: ReadonlyArray<string>
        readonly limit?: number
        readonly start_cursor?: string
    }
}

export type WaMexFetchNewsletterEnforcementsVariables = {
    readonly locale?: string
    readonly newsletter_id?: string
}

export type WaMexFetchNewsletterFollowersVariables = {
    readonly input?: {
        readonly newsletter_id?: string
        readonly count?: number
    }
}

export type WaMexFetchNewsletterInsightsVariables = {
    readonly input?: {
        readonly newsletter_id?: string
        readonly metrics?: ReadonlyArray<{
            readonly id?: number
            readonly type?: string
            readonly group_by?: {
                readonly number_of_days?: number
            }
            readonly limit?: number
        }>
    }
}

export type WaMexFetchNewsletterIsDomainPreviewableVariables = {
    readonly url_domains?: ReadonlyArray<string>
}

export type WaMexFetchNewsletterMessageReactionSenderListVariables = {
    readonly input?: {
        readonly id?: string
        readonly server_id?: string
    }
}

export type WaMexFetchNewsletterPendingInvitesVariables = {
    readonly newsletter_id?: string
}

export type WaMexFetchNewsletterPollVotersVariables = {
    readonly input?: {
        readonly limit?: number
        readonly server_id?: string
        readonly newsletter_id?: string
        readonly vote_hash?: string
    }
}

export type WaMexFetchNewsletterReportsVariables = Readonly<Record<string, never>>

export type WaMexFetchOHAIKeyConfigVariables = Readonly<Record<string, never>>

export type WaMexFetchOIDCStateVariables = Readonly<Record<string, never>>

export type WaMexFetchPlaintextLinkPreviewVariables = {
    readonly input?: {
        readonly url?: string
    }
}

export type WaMexFetchQuickPromotionsVariables = {
    readonly nux_ids?: ReadonlyArray<string>
    readonly trigger_context?: {
        readonly wa_smb_trigger_context?: {
            readonly is_from_wa_smb?: boolean
            readonly app_version?: number
            readonly country?: string
            readonly locale?: string
        }
    }
}

export type WaMexFetchReachoutTimelockVariables = Readonly<Record<string, never>>

export type WaMexFetchRecommendedNewslettersVariables = {
    readonly fetch_status_metadata?: boolean
    readonly input?: {
        readonly limit?: number
        readonly country_codes?: ReadonlyArray<string>
    }
}

export type WaMexFetchSimilarNewslettersVariables = {
    readonly fetch_status_metadata?: boolean
    readonly input?: {
        readonly newsletter_id?: string
        readonly limit?: number
        readonly country_codes?: ReadonlyArray<string>
    }
}

export type WaMexFetchSubgroupSuggestionsVariables = {
    readonly group_id?: string
    readonly query_context?: string
    readonly sub_group_hint_id?: string
}

export type WaMexFetchSubscriptionEntryPointsVariables = Readonly<Record<string, never>>

export type WaMexFetchSubscriptionsVariables = {
    readonly data?: {
        readonly platform?: 'UNKNOWN'
    }
}

export type WaMexFetchTextStatusListVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexGetAccessTokenFromOIDCCodeVariables = {
    readonly code?: string
    readonly state?: string
}

export type WaMexGetAccountNonceVariables = {
    readonly input?: {
        readonly identifier?: {
            readonly scope?: 'REQUEST'
        }
    }
}

export type WaMexGetDsbInfoVariables = {
    readonly input?: {
        readonly entity_id?: string
    }
}

export type WaMexGetFBAccountPagesVariables = {
    readonly userId?: string
}

export type WaMexGetNumbersForBrandIdsVariables = {
    readonly input?: {
        readonly brand_ids?: ReadonlyArray<string>
        readonly lid_based_response?: boolean
    }
}

export type WaMexGetPrivacyListsVariables = {
    readonly input?: {
        readonly query_input?: ReadonlyArray<{
            readonly jid?: string
            readonly privacy_contact_list_type?: {
                readonly dhash?: string
                readonly category?: string
                readonly type?: string
            }
        }>
    }
}

export type WaMexGetPrivacySettingsVariables = {
    readonly input?: {
        readonly query_input?: ReadonlyArray<{
            readonly jid?: string
            readonly privacy_features?: ReadonlyArray<string>
        }>
    }
}

export type WaMexGetUsernameVariables = Readonly<Record<string, never>>

export type WaMexGetWAAEligibilityVariables = {
    readonly input?: {
        readonly flow_id?: string
        readonly request_id?: string
    }
}

export type WaMexGraphQLProductCatalogGetPublicKeyVariables = {
    readonly request?: {
        readonly public_key?: {
            readonly biz_jid?: string
        }
    }
}

export type WaMexGraphQLVerifyPostcodeVariables = {
    readonly request?: {
        readonly verify_postcode?: {
            readonly biz_jid?: string
            readonly direct_connection_encrypted_info?: string
        }
    }
}

export type WaMexGroupStoreInviteSmsVariables = {
    readonly input?: {
        readonly partcipants?: ReadonlyArray<Readonly<Record<string, unknown>>>
        readonly group_jid?: string
    }
}

export type WaMexGroupSuspensionAppealVariables = {
    readonly input?: {
        readonly group_jid?: string
        readonly appeal_reason?: string
        readonly debug_info?: string
    }
}

export type WaMexIntegrityChallengeResponseVariables = {
    readonly input?: {
        readonly challenge_type?: string
        readonly passkey_response?: {
            readonly signed_challenge?: string
            readonly prf_available?: boolean
        }
    }
}

export type WaMexJoinNewsletterVariables = {
    readonly newsletter_id?: string
}

export type WaMexLeaveNewsletterVariables = {
    readonly newsletter_id?: string
}

export type WaMexLidChangeNotificationVariables = Readonly<Record<string, never>>

export type WaMexLogNewsletterExposuresVariables = {
    readonly input?: {
        readonly exposures?: ReadonlyArray<{
            readonly newsletter_id?: string
            readonly capability?: 'ADMIN_CONTEXT_CARD_1' | 'ADMIN_CONTEXT_CARD_2' | 'ADMIN_CONTEXT_CARD_3' | 'ADMIN_NOTIFICATIONS' | 'ADMIN_ONBOARDING' | 'ADMIN_ONBOARDING_2' | 'ADMIN_PROFILE' | 'CHANNEL_STATUS_PRODUCER' | 'INSIGHTS' | 'INVITE_ADMINS_BUTTON' | 'INVITE_FOLLOWERS' | 'JARVIS_INTEGRATION_ENABLED' | 'MUSIC' | 'NEW_MESSAGE_TYPES_TOOLTIP' | 'PHOTO_POLLS' | 'PINNING_NUDGE' | 'QUESTIONS' | 'QUESTIONS_M2' | 'QUIZ' | 'SHARE_STICKER_PACKS' | 'THREAD_MENU'
        }>
    }
}

export type WaMexNativeMLModelVariables = {
    readonly client_capability_metadata?: string
    readonly model_request_metadatas?: string
}

export type WaMexNewsletterAddPaidPartnershipLabelVariables = {
    readonly message_type?: string
    readonly newsletter_id?: string
    readonly server_id?: string
}

export type WaMexQueryCatalogVariables = {
    readonly request?: {
        readonly product_catalog?: {
            readonly jid?: string
            readonly allow_shop_source?: 'ALLOWSHOPSOURCE_FALSE' | 'ALLOWSHOPSOURCE_TRUE'
            readonly width?: string
            readonly height?: string
            readonly direct_connection_encrypted_info?: string
            readonly limit?: string
            readonly after?: string
            readonly catalog_session_id?: string
            readonly variant_info_fields?: Readonly<Record<string, unknown>>
            readonly variant_thumbnail_height?: string
            readonly variant_thumbnail_width?: string
        }
    }
}

export type WaMexQueryCatalogHasCategoriesVariables = {
    readonly request?: {
        readonly categories?: {
            readonly biz_jid?: string
            readonly direct_connection_encrypted_info?: string
            readonly image_dimensions?: Readonly<Record<string, unknown>>
            readonly catalog_session_id?: string
        }
    }
}

export type WaMexQueryCatalogProductVariables = {
    readonly request?: {
        readonly product?: {
            readonly jid?: string
            readonly product_id?: string
            readonly width?: string
            readonly height?: string
            readonly fetch_compliance_info?: string
            readonly direct_connection_encrypted_info?: string
            readonly variant_info_fields?: Readonly<Record<string, unknown>>
            readonly variant_thumbnail_height?: string
            readonly variant_thumbnail_width?: string
        }
    }
}

export type WaMexQueryProductCollectionsVariables = {
    readonly request?: {
        readonly collections?: {
            readonly biz_jid?: string
            readonly collection_limit?: string
            readonly item_limit?: string
            readonly after?: string
            readonly width?: string
            readonly height?: string
            readonly direct_connection_encrypted_info?: string
            readonly variant_info_fields?: Readonly<Record<string, unknown>>
            readonly variant_thumbnail_height?: string
            readonly variant_thumbnail_width?: string
        }
    }
}

export type WaMexQueryProductListCatalogVariables = {
    readonly request?: {
        readonly product_list?: {
            readonly jid?: string
            readonly products?: ReadonlyArray<{
                readonly id?: string
            }>
            readonly width?: string
            readonly height?: string
            readonly direct_connection_encrypted_info?: string
        }
    }
}

export type WaMexQueryProductSingleCollectionVariables = {
    readonly request?: {
        readonly collection?: {
            readonly biz_jid?: string
            readonly id?: string
            readonly limit?: string
            readonly after?: string
            readonly width?: string
            readonly height?: string
            readonly direct_connection_encrypted_info?: string
            readonly variant_info_fields?: Readonly<Record<string, unknown>>
            readonly variant_thumbnail_height?: string
            readonly variant_thumbnail_width?: string
        }
    }
}

export type WaMexQuerySubgroupParticipantCountVariables = {
    readonly input?: {
        readonly group_jid?: string
        readonly query_context?: string
        readonly sub_group_jid_hint?: string
    }
}

export type WaMexQuickPromotionActionVariables = {
    readonly input?: string
}

export type WaMexReportProductVariables = {
    readonly input?: {
        readonly jid?: string
        readonly product_id?: string
    }
}

export type WaMexRequestClientLogsForBugVariables = {
    readonly input?: {
        readonly bug_id?: string
        readonly participant_ids?: ReadonlyArray<string>
        readonly reporter_id?: string
        readonly up_to_timestamp_secs?: number
    }
}

export type WaMexResolveAccountTypeAndAdPageVariables = {
    readonly pageId?: string
}

export type WaMexResolveAccountTypeAndAdPageQueryVariables = {
    readonly pageId?: string
}

export type WaMexRevokeNewsletterAdminInviteVariables = {
    readonly newsletter_id?: string
    readonly user_id?: string
}

export type WaMexSetUsernameVariables = {
    readonly input?: string
    readonly reserved?: boolean
    readonly session_id?: string
    readonly source?: 'USER_INPUT'
}

export type WaMexSetUsernameKeyVariables = {
    readonly pin?: string
}

export type WaMexSignupMetadataVariables = {
    readonly phone_number?: string
    readonly signup_id?: string
}

export type WaMexSupportBugReportSubmitVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSupportContactFormSubmitVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSupportMessageFeedbackSubmitVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexTransferCommunityOwnershipVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexUpdateGroupPropertyVariables = {
    readonly group_id?: string
    readonly update?: Readonly<Record<string, unknown>>
}

export type WaMexUpdateNewsletterVariables = {
    readonly newsletter_id?: string
    readonly updates?: {
        readonly name?: string
        readonly description?: string
        readonly picture?: string
        readonly settings?: Readonly<Record<string, unknown>>
    }
}

export type WaMexUpdateNewsletterUserSettingVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexUpdateTextStatusVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexUsernameAvailabilityVariables = {
    readonly input?: string
    readonly session_id?: string
    readonly source?: 'USER_INPUT'
}

export type WaMexUsyncVariables = {
    readonly include_about_status?: boolean
    readonly include_country_code?: boolean
    readonly include_username?: boolean
    readonly input?: {
        readonly query_input?: Readonly<Record<string, unknown>>
        readonly telemetry?: Readonly<Record<string, unknown>>
    }
}

export type WaMexWAAOnboardingVariables = {
    readonly input?: {
        readonly flow_id?: string
        readonly request_id?: string
    }
}

export type WaMexWaffleFXServiceDataQueryV2Variables = Readonly<Record<string, never>>

export type WaMexWaffleFXWAMOUpdateUOOMVariables = Readonly<Record<string, never>>

export type WaMexWaffleXEVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexuseWAWebEstimatedDailyReachVariables = {
    readonly audienceOptionAudience?: Readonly<Record<string, unknown>>
    readonly configuredPlacementSpec?: Readonly<Record<string, unknown>>
    readonly currency?: string
    readonly flow?: string
    readonly flowID?: string
    readonly legacyAdAccountID?: string
    readonly optimizationGoalInput?: Readonly<Record<string, unknown>>
    readonly postID?: string
    readonly targetingSpecAudience?: Readonly<Record<string, unknown>>
}

export interface WaMexOperationVariables {
    readonly ACSServerProviderConfig: WaMexACSServerProviderConfigVariables
    readonly ACSServerProviderIssuance: WaMexACSServerProviderIssuanceVariables
    readonly AcceptNewsletterAdminInvite: WaMexAcceptNewsletterAdminInviteVariables
    readonly AiAgentAutoReplyControl: WaMexAiAgentAutoReplyControlVariables
    readonly AuthAgentFeaturePolicy: WaMexAuthAgentFeaturePolicyVariables
    readonly BPAccessTokenAndSessionCookies: WaMexBPAccessTokenAndSessionCookiesVariables
    readonly BizCreateOrder: WaMexBizCreateOrderVariables
    readonly BizCustomUrlGetUserGraphql: WaMexBizCustomUrlGetUserGraphqlVariables
    readonly BizGetCategories: WaMexBizGetCategoriesVariables
    readonly BizGetCategoriesV2: WaMexBizGetCategoriesV2Variables
    readonly BizGetCustomUrlUserGraphql: WaMexBizGetCustomUrlUserGraphqlVariables
    readonly BizGetMerchantCompliance: WaMexBizGetMerchantComplianceVariables
    readonly BizGetPriceTiers: WaMexBizGetPriceTiersVariables
    readonly BizGetProfileShimlinks: WaMexBizGetProfileShimlinksVariables
    readonly BizGraphQLRefreshCart: WaMexBizGraphQLRefreshCartVariables
    readonly BizProfileAddressAutocomplete: WaMexBizProfileAddressAutocompleteVariables
    readonly BizQueryOrder: WaMexBizQueryOrderVariables
    readonly BizSetMerchantCompliance: WaMexBizSetMerchantComplianceVariables
    readonly CachedToken: WaMexCachedTokenVariables
    readonly CanonicalUserValid: WaMexCanonicalUserValidVariables
    readonly ChangeNewsletterOwner: WaMexChangeNewsletterOwnerVariables
    readonly ConsumerFetchQuickPromotions: WaMexConsumerFetchQuickPromotionsVariables
    readonly ConsumerQuickPromotionActionGraphQL: WaMexConsumerQuickPromotionActionGraphQLVariables
    readonly CreateInviteCode: WaMexCreateInviteCodeVariables
    readonly CreateMarketingCampaignAction: WaMexCreateMarketingCampaignActionVariables
    readonly CreateNewsletter: WaMexCreateNewsletterVariables
    readonly CreateNewsletterAdminInvite: WaMexCreateNewsletterAdminInviteVariables
    readonly CreateReportAppeal: WaMexCreateReportAppealVariables
    readonly CreateWhatsAppAdsIdentity: WaMexCreateWhatsAppAdsIdentityVariables
    readonly CustomLabel3pdEvent: WaMexCustomLabel3pdEventVariables
    readonly DeleteNewsletter: WaMexDeleteNewsletterVariables
    readonly DemoteNewsletterAdmin: WaMexDemoteNewsletterAdminVariables
    readonly EditBizProfile: WaMexEditBizProfileVariables
    readonly ExternalCtxAuthoriseWAChat: WaMexExternalCtxAuthoriseWAChatVariables
    readonly FetchAboutStatus: WaMexFetchAboutStatusVariables
    readonly FetchAdEntryPointsConfiguration: WaMexFetchAdEntryPointsConfigurationVariables
    readonly FetchAdEntryPointsConfigurationM1: WaMexFetchAdEntryPointsConfigurationM1Variables
    readonly FetchAllNewslettersMetadata: WaMexFetchAllNewslettersMetadataVariables
    readonly FetchAllSubgroups: WaMexFetchAllSubgroupsVariables
    readonly FetchBotProfilesGQL: WaMexFetchBotProfilesGQLVariables
    readonly FetchDynamicAIModes: WaMexFetchDynamicAIModesVariables
    readonly FetchGroupInfo: WaMexFetchGroupInfoVariables
    readonly FetchGroupInfoIncludBots: WaMexFetchGroupInfoIncludBotsVariables
    readonly FetchGroupInviteCode: WaMexFetchGroupInviteCodeVariables
    readonly FetchGroupIsInternal: WaMexFetchGroupIsInternalVariables
    readonly FetchIntegritySignals: WaMexFetchIntegritySignalsVariables
    readonly FetchNativeAdsMvpEligibility: WaMexFetchNativeAdsMvpEligibilityVariables
    readonly FetchNewChatMessageCappingInfo: WaMexFetchNewChatMessageCappingInfoVariables
    readonly FetchNewsletter: WaMexFetchNewsletterVariables
    readonly FetchNewsletterAdminCapabilities: WaMexFetchNewsletterAdminCapabilitiesVariables
    readonly FetchNewsletterAdminInfo: WaMexFetchNewsletterAdminInfoVariables
    readonly FetchNewsletterDehydrated: WaMexFetchNewsletterDehydratedVariables
    readonly FetchNewsletterDirectoryCategoriesPreview: WaMexFetchNewsletterDirectoryCategoriesPreviewVariables
    readonly FetchNewsletterDirectoryList: WaMexFetchNewsletterDirectoryListVariables
    readonly FetchNewsletterDirectorySearchResults: WaMexFetchNewsletterDirectorySearchResultsVariables
    readonly FetchNewsletterEnforcements: WaMexFetchNewsletterEnforcementsVariables
    readonly FetchNewsletterFollowers: WaMexFetchNewsletterFollowersVariables
    readonly FetchNewsletterInsights: WaMexFetchNewsletterInsightsVariables
    readonly FetchNewsletterIsDomainPreviewable: WaMexFetchNewsletterIsDomainPreviewableVariables
    readonly FetchNewsletterMessageReactionSenderList: WaMexFetchNewsletterMessageReactionSenderListVariables
    readonly FetchNewsletterPendingInvites: WaMexFetchNewsletterPendingInvitesVariables
    readonly FetchNewsletterPollVoters: WaMexFetchNewsletterPollVotersVariables
    readonly FetchNewsletterReports: WaMexFetchNewsletterReportsVariables
    readonly FetchOHAIKeyConfig: WaMexFetchOHAIKeyConfigVariables
    readonly FetchOIDCState: WaMexFetchOIDCStateVariables
    readonly FetchPlaintextLinkPreview: WaMexFetchPlaintextLinkPreviewVariables
    readonly FetchQuickPromotions: WaMexFetchQuickPromotionsVariables
    readonly FetchReachoutTimelock: WaMexFetchReachoutTimelockVariables
    readonly FetchRecommendedNewsletters: WaMexFetchRecommendedNewslettersVariables
    readonly FetchSimilarNewsletters: WaMexFetchSimilarNewslettersVariables
    readonly FetchSubgroupSuggestions: WaMexFetchSubgroupSuggestionsVariables
    readonly FetchSubscriptionEntryPoints: WaMexFetchSubscriptionEntryPointsVariables
    readonly FetchSubscriptions: WaMexFetchSubscriptionsVariables
    readonly FetchTextStatusList: WaMexFetchTextStatusListVariables
    readonly GetAccessTokenFromOIDCCode: WaMexGetAccessTokenFromOIDCCodeVariables
    readonly GetAccountNonce: WaMexGetAccountNonceVariables
    readonly GetDsbInfo: WaMexGetDsbInfoVariables
    readonly GetFBAccountPages: WaMexGetFBAccountPagesVariables
    readonly GetNumbersForBrandIds: WaMexGetNumbersForBrandIdsVariables
    readonly GetPrivacyLists: WaMexGetPrivacyListsVariables
    readonly GetPrivacySettings: WaMexGetPrivacySettingsVariables
    readonly GetUsername: WaMexGetUsernameVariables
    readonly GetWAAEligibility: WaMexGetWAAEligibilityVariables
    readonly GraphQLProductCatalogGetPublicKey: WaMexGraphQLProductCatalogGetPublicKeyVariables
    readonly GraphQLVerifyPostcode: WaMexGraphQLVerifyPostcodeVariables
    readonly GroupStoreInviteSms: WaMexGroupStoreInviteSmsVariables
    readonly GroupSuspensionAppeal: WaMexGroupSuspensionAppealVariables
    readonly IntegrityChallengeResponse: WaMexIntegrityChallengeResponseVariables
    readonly JoinNewsletter: WaMexJoinNewsletterVariables
    readonly LeaveNewsletter: WaMexLeaveNewsletterVariables
    readonly LidChangeNotification: WaMexLidChangeNotificationVariables
    readonly LogNewsletterExposures: WaMexLogNewsletterExposuresVariables
    readonly NativeMLModel: WaMexNativeMLModelVariables
    readonly NewsletterAddPaidPartnershipLabel: WaMexNewsletterAddPaidPartnershipLabelVariables
    readonly QueryCatalog: WaMexQueryCatalogVariables
    readonly QueryCatalogHasCategories: WaMexQueryCatalogHasCategoriesVariables
    readonly QueryCatalogProduct: WaMexQueryCatalogProductVariables
    readonly QueryProductCollections: WaMexQueryProductCollectionsVariables
    readonly QueryProductListCatalog: WaMexQueryProductListCatalogVariables
    readonly QueryProductSingleCollection: WaMexQueryProductSingleCollectionVariables
    readonly QuerySubgroupParticipantCount: WaMexQuerySubgroupParticipantCountVariables
    readonly QuickPromotionAction: WaMexQuickPromotionActionVariables
    readonly ReportProduct: WaMexReportProductVariables
    readonly RequestClientLogsForBug: WaMexRequestClientLogsForBugVariables
    readonly ResolveAccountTypeAndAdPage: WaMexResolveAccountTypeAndAdPageVariables
    readonly ResolveAccountTypeAndAdPageQuery: WaMexResolveAccountTypeAndAdPageQueryVariables
    readonly RevokeNewsletterAdminInvite: WaMexRevokeNewsletterAdminInviteVariables
    readonly SetUsername: WaMexSetUsernameVariables
    readonly SetUsernameKey: WaMexSetUsernameKeyVariables
    readonly SignupMetadata: WaMexSignupMetadataVariables
    readonly SupportBugReportSubmit: WaMexSupportBugReportSubmitVariables
    readonly SupportContactFormSubmit: WaMexSupportContactFormSubmitVariables
    readonly SupportMessageFeedbackSubmit: WaMexSupportMessageFeedbackSubmitVariables
    readonly TransferCommunityOwnership: WaMexTransferCommunityOwnershipVariables
    readonly UpdateGroupProperty: WaMexUpdateGroupPropertyVariables
    readonly UpdateNewsletter: WaMexUpdateNewsletterVariables
    readonly UpdateNewsletterUserSetting: WaMexUpdateNewsletterUserSettingVariables
    readonly UpdateTextStatus: WaMexUpdateTextStatusVariables
    readonly UsernameAvailability: WaMexUsernameAvailabilityVariables
    readonly Usync: WaMexUsyncVariables
    readonly WAAOnboarding: WaMexWAAOnboardingVariables
    readonly WaffleFXServiceDataQueryV2: WaMexWaffleFXServiceDataQueryV2Variables
    readonly WaffleFXWAMOUpdateUOOM: WaMexWaffleFXWAMOUpdateUOOMVariables
    readonly WaffleXE: WaMexWaffleXEVariables
    readonly useWAWebEstimatedDailyReach: WaMexuseWAWebEstimatedDailyReachVariables
}

export type WaMexACSServerProviderConfigResponse = {
    readonly xwa_wa_acs_config?: {
        readonly cipher_suite?: string
        readonly expire_time?: string
        readonly id?: string
        readonly max_evals?: number
        readonly public_key?: string
        readonly redemption_limit?: string
        readonly token_ttl?: number
    }
}

export type WaMexACSServerProviderIssuanceResponse = {
    readonly xwa_wa_acs_issue_credentials?: {
        readonly success?: boolean
        readonly creds?: {
            readonly evaluation?: ReadonlyArray<{
                readonly data?: string
            }>
            readonly proof?: ReadonlyArray<{
                readonly c?: string
                readonly s?: string
            }>
        }
        readonly error_message?: string
    }
}

export type WaMexAcceptNewsletterAdminInviteResponse = {
    readonly xwa2_newsletter_admin_invite_accept?: {
        readonly __typename?: string
        readonly id?: string
    }
}

export type WaMexAiAgentAutoReplyControlResponse = {
    readonly xfb_whatsapp_smb_maiba_status_update?: {
        readonly success?: boolean
    }
}

export type WaMexAuthAgentFeaturePolicyResponse = {
    readonly whatsapp_authorized_agent_feature_policy?: {
        readonly disabled_features?: ReadonlyArray<string>
    }
}

export type WaMexBPAccessTokenAndSessionCookiesResponse = {
    readonly xwa_bp_access_token_and_session_cookies?: {
        readonly status?: string
        readonly access_token?: string
        readonly session_cookies?: string
        readonly bp_id?: string
        readonly access_token_type?: string
        readonly email_attr?: string
    }
}

export type WaMexBizCreateOrderResponse = {
    readonly xwa_checkout_place_order?: {
        readonly order?: {
            readonly order_id?: string
            readonly token?: string
            readonly price?: {
                readonly currency?: string
                readonly subtotal_amount?: number
                readonly total_amount?: number
                readonly price_status?: string
            }
        }
    }
}

export type WaMexBizCustomUrlGetUserGraphqlResponse = {
    readonly xwa_custom_url_get_user?: {
        readonly success?: boolean
        readonly lid?: string
        readonly error_code?: number
        readonly error_text?: string
    }
}

export type WaMexBizGetCategoriesResponse = {
    readonly whatsapp_catkit_typeahead_proxy?: {
        readonly categories?: ReadonlyArray<{
            readonly id?: string
            readonly display_name?: string
        }>
        readonly not_a_biz?: {
            readonly id?: string
            readonly display_name?: string
        }
    }
}

export type WaMexBizGetCategoriesV2Response = {
    readonly whatsapp_catkit_typeahead_proxy?: {
        readonly categories?: ReadonlyArray<{
            readonly id?: string
            readonly display_name?: string
            readonly categories?: ReadonlyArray<{
                readonly id?: string
                readonly display_name?: string
                readonly categories?: ReadonlyArray<{
                    readonly id?: string
                    readonly display_name?: string
                }>
            }>
        }>
        readonly not_a_biz?: {
            readonly id?: string
            readonly display_name?: string
        }
    }
}

export type WaMexBizGetCustomUrlUserGraphqlResponse = {
    readonly xwa_custom_url_get_user?: {
        readonly success?: boolean
        readonly user?: {
            readonly jid?: string
        }
        readonly error_code?: number
        readonly error_text?: string
    }
}

export type WaMexBizGetMerchantComplianceResponse = {
    readonly xfb_whatsapp_biz_merchant_compliance_info?: {
        readonly merchant_info?: {
            readonly entity_name?: string
            readonly entity_type?: string
            readonly is_registered?: boolean
            readonly entity_type_custom?: string
            readonly customer_care_details?: {
                readonly email?: string
                readonly landline_number?: string
                readonly mobile_number?: string
            }
            readonly grievance_officer_details?: {
                readonly name?: string
                readonly email?: string
                readonly landline_number?: string
                readonly mobile_number?: string
            }
        }
    }
}

export type WaMexBizGetPriceTiersResponse = {
    readonly xwa_whatsapp_get_pricing_tiers?: {
        readonly price_tiers?: ReadonlyArray<{
            readonly id?: string
            readonly description?: string
            readonly symbol?: string
        }>
    }
}

export type WaMexBizGetProfileShimlinksResponse = {
    readonly xwa_whatsapp_smb_get_profile_linkshims?: ReadonlyArray<{
        readonly website?: string
        readonly shimmed_website_url?: string
    }>
}

export type WaMexBizGraphQLRefreshCartResponse = {
    readonly xwa_checkout_refresh_cart?: {
        readonly cart?: {
            readonly products?: ReadonlyArray<{
                readonly is_hidden?: boolean
                readonly availability?: string
                readonly product_availability?: string
                readonly status_info?: {
                    readonly reject_reason?: string
                    readonly status?: string
                    readonly can_appeal?: boolean
                    readonly commerce_url?: string
                }
                readonly image_fetch_status?: string
                readonly price?: string
                readonly currency?: string
                readonly retailer_id?: string
                readonly name?: string
                readonly description?: string
                readonly url?: string
                readonly id?: string
                readonly media?: {
                    readonly images?: ReadonlyArray<{
                        readonly id?: string
                        readonly request_image_url?: string
                        readonly original_dimensions?: {
                            readonly height?: number
                            readonly width?: number
                        }
                    }>
                    readonly videos?: ReadonlyArray<{
                        readonly thumbnail_url?: string
                        readonly original_video_url?: string
                        readonly id?: string
                    }>
                }
                readonly sale_price?: {
                    readonly price?: string
                    readonly start_date?: string
                    readonly end_date?: string
                }
                readonly max_available?: number
                readonly belongs_to?: string
                readonly status?: string
                readonly compliance_category?: string
                readonly compliance_info?: {
                    readonly country_code_origin?: string
                    readonly importer_name?: string
                    readonly importer_address?: {
                        readonly street1?: string
                        readonly street2?: string
                        readonly city?: string
                        readonly region?: string
                        readonly postal_code?: string
                        readonly country_code?: string
                    }
                }
                readonly variant_info?: {
                    readonly types?: ReadonlyArray<{
                        readonly name?: string
                        readonly options?: ReadonlyArray<{
                            readonly value?: string
                            readonly thumbnail_media?: {
                                readonly original_dimensions?: {
                                    readonly width?: number
                                    readonly height?: number
                                }
                                readonly request_image_url?: string
                                readonly original_image_url?: string
                                readonly id?: string
                            }
                        }>
                    }>
                    readonly listing_details?: {
                        readonly description?: string
                        readonly multi_price?: string
                        readonly lowest_price?: string
                    }
                    readonly variant_properties?: ReadonlyArray<{
                        readonly value?: string
                        readonly name?: string
                    }>
                    readonly availability?: {
                        readonly listing?: ReadonlyArray<{
                            readonly is_available?: boolean
                            readonly product_id?: string
                            readonly options?: ReadonlyArray<{
                                readonly name?: string
                                readonly value?: string
                            }>
                        }>
                    }
                }
            }>
            readonly price_details?: {
                readonly total_amount?: number
                readonly subtotal_amount?: number
                readonly currency?: string
                readonly price_status?: string
            }
        }
    }
}

export type WaMexBizProfileAddressAutocompleteResponse = {
    readonly whatsapp_maps_typeahead?: {
        readonly items?: ReadonlyArray<{
            readonly id?: string
            readonly location?: {
                readonly latitude?: number
                readonly longitude?: number
            }
            readonly address?: {
                readonly city?: string
                readonly country?: string
                readonly postalcode?: string
                readonly stateprovince?: string
                readonly streetaddress?: string
            }
            readonly title?: string
        }>
    }
}

export type WaMexBizQueryOrderResponse = {
    readonly xwa_checkout_get_order_info?: {
        readonly order?: {
            readonly creation_time_stamp?: string
            readonly products?: ReadonlyArray<{
                readonly id?: string
                readonly name?: string
                readonly price?: string
                readonly currency?: string
                readonly variant_info?: {
                    readonly variant_properties?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                }
                readonly media?: {
                    readonly images?: ReadonlyArray<{
                        readonly id?: string
                        readonly request_image_url?: string
                    }>
                }
                readonly quantity?: string
            }>
            readonly price_details?: {
                readonly subtotal_amount?: string
                readonly currency?: string
                readonly total_amount?: string
            }
        }
    }
}

export type WaMexBizSetMerchantComplianceResponse = {
    readonly xfb_whatsapp_biz_merchant_set_compliance_info?: {
        readonly __typename?: string
        readonly merchant_info?: {
            readonly entity_name?: string
            readonly entity_type?: string
            readonly is_registered?: boolean
            readonly entity_type_custom?: string
            readonly customer_care_details?: {
                readonly email?: string
                readonly landline_number?: string
                readonly mobile_number?: string
            }
            readonly grievance_officer_details?: {
                readonly name?: string
                readonly email?: string
                readonly landline_number?: string
                readonly mobile_number?: string
            }
        }
    }
}

export type WaMexCachedTokenResponse = {
    readonly xwa2_ent_trade_canonical_nonce_for_access_tokens?: {
        readonly encrypted_access_tokens?: {
            readonly key?: string
            readonly data?: string
            readonly tag?: string
            readonly nonce?: string
            readonly algorithm?: string
        }
    }
}

export type WaMexCanonicalUserValidResponse = {
    readonly xwa_canonical_user_valid?: {
        readonly success?: boolean
    }
}

export type WaMexChangeNewsletterOwnerResponse = {
    readonly xwa2_newsletter_change_owner?: {
        readonly __typename?: string
        readonly id?: string
    }
}

export type WaMexConsumerFetchQuickPromotionsResponse = {
    readonly quick_promotion_multiverse_batch_fetch_root?: ReadonlyArray<{
        readonly surface_nux_id?: string
        readonly eligible_promotions?: {
            readonly edges?: ReadonlyArray<{
                readonly client_ttl_seconds?: number
                readonly priority?: number
                readonly is_holdout?: boolean
                readonly log_eligibility_waterfall?: string
                readonly time_range?: {
                    readonly start?: string
                    readonly end?: string
                }
                readonly node?: {
                    readonly __typename?: string
                    readonly promotion_id?: string
                    readonly is_server_force_pass?: boolean
                    readonly ab_prop_name?: string
                    readonly max_impressions?: number
                    readonly surface_delay_in_seconds?: number
                    readonly encrypted_logging_data?: string
                    readonly client_side_dry_run?: boolean
                    readonly creatives?: ReadonlyArray<{
                        readonly __typename?: string
                        readonly title?: {
                            readonly text?: string
                        }
                        readonly content?: {
                            readonly text?: string
                        }
                        readonly primary_action?: {
                            readonly __typename?: string
                            readonly title?: {
                                readonly text?: string
                            }
                            readonly limit?: number
                            readonly url?: string
                        }
                        readonly dismiss_action?: {
                            readonly __typename?: string
                            readonly limit?: string
                        }
                        readonly wa_light_mode_media_details?: {
                            readonly jpeg_thumbnail?: string
                        }
                        readonly wa_dark_mode_media_details?: {
                            readonly jpeg_thumbnail?: string
                        }
                        readonly accessibility_text_for_image?: string
                        readonly is_dismissible?: boolean
                        readonly id?: string
                    }>
                    readonly content_attributes?: {
                        readonly wa_banner_background_color?: {
                            readonly light_mode_highlight_color?: string
                            readonly dark_mode_highlight_color?: string
                            readonly light_mode_background_color?: string
                            readonly dark_mode_background_color?: string
                        }
                        readonly wa_primary_cta_alternative_url?: string
                        readonly wa_eligible_duration_after_impression_in_seconds?: number
                    }
                    readonly wa_qp_content_attributes_do_not_use?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                    readonly contextual_filters_for_wa_do_not_use?: {
                        readonly clause_type?: string
                        readonly filters?: ReadonlyArray<Readonly<Record<string, unknown>>>
                        readonly clauses?: ReadonlyArray<{
                            readonly clause_type?: string
                            readonly filters?: ReadonlyArray<Readonly<Record<string, unknown>>>
                            readonly clauses?: ReadonlyArray<{
                                readonly clause_type?: string
                                readonly filters?: ReadonlyArray<Readonly<Record<string, unknown>>>
                                readonly clauses?: ReadonlyArray<{
                                    readonly clause_type?: string
                                    readonly filters?: ReadonlyArray<Readonly<Record<string, unknown>>>
                                    readonly clauses?: ReadonlyArray<{
                                        readonly clause_type?: string
                                        readonly filters?: ReadonlyArray<Readonly<Record<string, unknown>>>
                                        readonly clauses?: ReadonlyArray<{
                                            readonly clause_type?: string
                                            readonly filters?: ReadonlyArray<Readonly<Record<string, unknown>>>
                                            readonly clauses?: ReadonlyArray<{
                                                readonly clause_type?: string
                                                readonly filters?: ReadonlyArray<Readonly<Record<string, unknown>>>
                                                readonly clauses?: ReadonlyArray<{
                                                    readonly clause_type?: string
                                                    readonly filters?: ReadonlyArray<Readonly<Record<string, unknown>>>
                                                }>
                                            }>
                                        }>
                                    }>
                                }>
                            }>
                        }>
                    }
                    readonly id?: string
                }
            }>
        }
    }>
}

export type WaMexConsumerQuickPromotionActionGraphQLResponse = {
    readonly wa_consumer_quick_promotion_log_event?: {
        readonly client_mutation_id?: string
    }
}

export type WaMexCreateInviteCodeResponse = {
    readonly xwa2_growth_create_invite_code?: {
        readonly code?: string
    }
}

export type WaMexCreateMarketingCampaignActionResponse = {
    readonly whatsapp_marketing_messages_create?: {
        readonly ad_campaign_group_id?: string
        readonly ad_campaign_id?: string
        readonly ad_group_id?: string
        readonly ad_id?: string
        readonly ad_creative_id?: string
        readonly campaign_name?: string
        readonly status?: string
        readonly lifetime_budget?: string
        readonly start_time?: string
    }
}

export type WaMexCreateNewsletterResponse = {
    readonly xwa2_newsletter_create?: {
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
        readonly thread_metadata?: {
            readonly name?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly description?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly picture?: {
                readonly id?: string
                readonly type?: 'IMAGE' | 'PREVIEW'
                readonly direct_path?: string
            }
            readonly preview?: {
                readonly id?: string
                readonly type?: 'PREVIEW'
                readonly direct_path?: string
            }
            readonly invite?: string
            readonly handle?: string
            readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            readonly subscribers_count?: string
            readonly creation_time?: string
        }
        readonly viewer_metadata?: {
            readonly settings?: ReadonlyArray<{
                readonly type?: 'MUTE_ADMIN_ACTIVITY' | 'MUTE_FOLLOWER_ACTIVITY'
                readonly value?: 'OFF' | 'ON'
            }>
            readonly role?: 'ADMIN' | 'GUEST' | 'OWNER' | 'SUBSCRIBER'
        }
    }
}

export type WaMexCreateNewsletterAdminInviteResponse = {
    readonly xwa2_newsletter_admin_invite_create?: {
        readonly invite_expiration_time?: string
        readonly id?: string
    }
}

export type WaMexCreateReportAppealResponse = {
    readonly xwa2_create_channel_report_appeal_v2?: {
        readonly report_id?: string
        readonly status?: string
        readonly creation_time?: string
        readonly last_update_time?: string
        readonly channel_name?: string
        readonly channel_jid?: string
        readonly reported_content_data?: {
            readonly __typename?: string
            readonly server_msg_id?: string
            readonly server_id?: string
            readonly server_response_id?: string
            readonly notify_name?: string
            readonly question_data?: {
                readonly __typename?: string
                readonly server_msg_id?: string
            }
        }
        readonly appeal?: {
            readonly state?: 'CONTENT_UNAVAILABLE' | 'NON_APPEALABLE' | 'NOT_APPEALED' | 'PENDING' | 'REJECT' | 'SUCCESS'
            readonly appeal_reason?: string
            readonly creation_time?: string
            readonly report_id?: string
            readonly appeal_id?: string
        }
    }
}

export type WaMexCreateWhatsAppAdsIdentityResponse = {
    readonly create_or_update_whatsapp_ads_identity?: {
        readonly id?: string
    }
}

export type WaMexCustomLabel3pdEventResponse = {
    readonly xwa_get_3pd_event?: ReadonlyArray<{
        readonly custom_label?: string
        readonly ctwa_3pd_conversion_type?: string
        readonly ctwa_3pd_conversion_subtype?: string
        readonly ctwa_3pd_conversion_metadata?: string
    }>
}

export type WaMexDeleteNewsletterResponse = {
    readonly xwa2_newsletter_delete_v2?: {
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
    }
}

export type WaMexDemoteNewsletterAdminResponse = {
    readonly xwa2_newsletter_admin_demote?: {
        readonly __typename?: string
        readonly id?: string
    }
}

export type WaMexEditBizProfileResponse = {
    readonly edit_wa_web_biz_profile?: boolean
}

export type WaMexExternalCtxAuthoriseWAChatResponse = {
    readonly xwa_external_ctx_authorise_wa_chat?: {
        readonly success?: boolean
        readonly partner_name?: string
    }
}

export type WaMexFetchAboutStatusResponse = {
    readonly xwa2_users_updates_since?: ReadonlyArray<{
        readonly updates?: ReadonlyArray<{
            readonly __typename?: string
            readonly text?: string
        }>
    }>
}

export type WaMexFetchAdEntryPointsConfigurationResponse = {
    readonly ctwa_client_entry_point_entitlement?: ReadonlyArray<{
        readonly entry_point_or_experience?: string
        readonly should_show?: boolean
    }>
}

export type WaMexFetchAdEntryPointsConfigurationM1Response = {
    readonly ctwa_client_entry_point_entitlement?: ReadonlyArray<{
        readonly entry_point_or_experience?: string
        readonly should_show?: boolean
        readonly content?: string
        readonly sub_content?: string
    }>
}

export type WaMexFetchAllNewslettersMetadataResponse = {
    readonly xwa2_newsletter_subscribed?: ReadonlyArray<{
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
        readonly thread_metadata?: {
            readonly creation_time?: string
            readonly name?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly picture?: {
                readonly id?: string
                readonly type?: 'IMAGE' | 'PREVIEW'
                readonly direct_path?: string
            }
            readonly preview?: {
                readonly id?: string
                readonly type?: 'PREVIEW'
                readonly direct_path?: string
            }
            readonly description?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly invite?: string
            readonly handle?: string
            readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            readonly settings?: {
                readonly reaction_codes?: {
                    readonly value?: 'ALL'
                }
            }
            readonly wamo_sub?: {
                readonly plan_id?: string
            }
        }
        readonly viewer_metadata?: {
            readonly settings?: ReadonlyArray<{
                readonly type?: 'MUTE_ADMIN_ACTIVITY' | 'MUTE_FOLLOWER_ACTIVITY'
                readonly value?: 'OFF' | 'ON'
            }>
            readonly role?: 'ADMIN' | 'GUEST' | 'OWNER' | 'SUBSCRIBER'
            readonly wamo_sub_status?: 'ACTIVE' | 'INACTIVE'
        }
        readonly status_metadata?: {
            readonly last_status_server_id?: string
            readonly last_status_sent_time?: string
        }
    }>
}

export type WaMexFetchAllSubgroupsResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly id?: string
        readonly __typename?: string
        readonly default_sub_group?: {
            readonly id?: string
            readonly subject?: {
                readonly value?: string
                readonly creation_time?: string
            }
        }
        readonly sub_groups?: {
            readonly edges?: ReadonlyArray<{
                readonly node?: {
                    readonly id?: string
                    readonly subject?: {
                        readonly value?: string
                        readonly creation_time?: string
                    }
                    readonly properties?: {
                        readonly general_chat?: boolean
                        readonly membership_approval_mode_enabled?: boolean
                        readonly hidden_group?: boolean
                    }
                    readonly membership_approval_requests?: {
                        readonly total_count?: number
                    }
                }
            }>
        }
    }
}

export type WaMexFetchBotProfilesGQLResponse = {
    readonly xfb_fetch_genai_personas?: ReadonlyArray<{
        readonly __typename?: string
        readonly id?: string
        readonly jid?: string
        readonly is_meta_created?: boolean
        readonly creator?: {
            readonly name?: string
            readonly profile_uri?: string
        }
        readonly latest_published_version_for_viewer?: {
            readonly __typename?: string
            readonly name?: string
            readonly description?: string
            readonly icebreaker_prompt_list?: ReadonlyArray<string>
            readonly posing_as_professional?: boolean
            readonly id?: string
        }
    }>
}

export type WaMexFetchDynamicAIModesResponse = {
    readonly xfb_meta_ai_modes?: ReadonlyArray<{
        readonly mode_id?: string
        readonly type?: string
        readonly is_experimental?: boolean
        readonly title?: string
        readonly subtitle?: string
    }>
}

export type WaMexFetchGroupInfoResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly id?: string
        readonly creation_time?: string
        readonly creator?: {
            readonly id?: string
            readonly lid?: string
            readonly pn?: string
            readonly username_info?: {
                readonly __typename?: string
                readonly username?: string
            }
        }
        readonly state?: 'ACTIVE' | 'NON_EXISTENT' | 'SUSPENDED'
        readonly subject?: {
            readonly creator?: {
                readonly id?: string
                readonly lid?: string
                readonly pn?: string
                readonly username_info?: {
                    readonly __typename?: string
                    readonly username?: string
                }
            }
            readonly creation_time?: string
            readonly value?: string
        }
        readonly description?: {
            readonly id?: string
            readonly creation_time?: string
            readonly creator?: {
                readonly id?: string
                readonly lid?: string
                readonly pn?: string
                readonly username_info?: {
                    readonly __typename?: string
                    readonly username?: string
                }
            }
            readonly value?: string
        }
        readonly participants?: {
            readonly edges?: ReadonlyArray<{
                readonly node?: {
                    readonly id?: string
                    readonly lid?: string
                    readonly pn?: string
                    readonly display_name?: string
                    readonly username_info?: {
                        readonly __typename?: string
                        readonly username?: string
                    }
                }
                readonly role?: 'ADMIN_MEMBER' | 'MEMBER' | 'SUPERADMIN_MEMBER'
            }>
            readonly participants_phash_match?: boolean
        }
        readonly total_participants_count?: number
        readonly missing_participant_identification?: boolean
        readonly properties?: {
            readonly allow_non_admin_sub_group_creation?: boolean
            readonly closed_by_membership_approval_mode?: boolean
            readonly appeal_status?: string
            readonly appeal_update_time?: string
            readonly limit_sharing?: {
                readonly limit_sharing_enabled?: boolean
            }
            readonly lid_migration_state?: {
                readonly addressing_mode?: 'LID'
            }
            readonly ephemeral?: {
                readonly expiration_time_in_sec?: number
            }
            readonly growth_locked2?: {
                readonly locked?: boolean
            }
            readonly member_add_mode?: 'ADMIN_ADD' | 'ALL_MEMBER_ADD'
            readonly parent_group_jid?: string
            readonly group_safety_check?: boolean
            readonly announcement?: boolean
            readonly locked?: boolean
            readonly member_link_mode?: 'ADMIN_LINK' | 'ALL_MEMBER_LINK'
            readonly member_share_group_history_mode?: 'ALL_MEMBER_SHARE'
            readonly membership_approval_mode_enabled?: boolean
            readonly general_chat?: boolean
            readonly auto_add_disabled?: boolean
            readonly hidden_group?: boolean
            readonly capi?: boolean
            readonly support?: boolean
        }
        readonly membership_approval_request?: boolean
    }
}

export type WaMexFetchGroupInfoIncludBotsResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly id?: string
        readonly creation_time?: string
        readonly creator?: {
            readonly id?: string
            readonly lid?: string
            readonly pn?: string
            readonly username_info?: {
                readonly __typename?: string
                readonly username?: string
            }
        }
        readonly state?: 'ACTIVE' | 'NON_EXISTENT' | 'SUSPENDED'
        readonly subject?: {
            readonly creator?: {
                readonly id?: string
                readonly lid?: string
                readonly pn?: string
                readonly username_info?: {
                    readonly __typename?: string
                    readonly username?: string
                }
            }
            readonly creation_time?: string
            readonly value?: string
        }
        readonly description?: {
            readonly id?: string
            readonly creation_time?: string
            readonly creator?: {
                readonly id?: string
                readonly lid?: string
                readonly pn?: string
                readonly username_info?: {
                    readonly __typename?: string
                    readonly username?: string
                }
            }
            readonly value?: string
        }
        readonly participants?: {
            readonly edges?: ReadonlyArray<{
                readonly participant?: {
                    readonly __typename?: string
                    readonly id?: string
                    readonly lid?: string
                    readonly pn?: string
                    readonly display_name?: string
                    readonly username_info?: {
                        readonly __typename?: string
                        readonly username?: string
                    }
                    readonly jid?: string
                }
                readonly role?: 'ADMIN_MEMBER' | 'MEMBER' | 'SUPERADMIN_MEMBER'
            }>
            readonly participants_phash_match?: boolean
        }
        readonly total_participants_count?: number
        readonly missing_participant_identification?: boolean
        readonly properties?: {
            readonly allow_non_admin_sub_group_creation?: boolean
            readonly closed_by_membership_approval_mode?: boolean
            readonly appeal_status?: string
            readonly appeal_update_time?: string
            readonly limit_sharing?: {
                readonly limit_sharing_enabled?: boolean
            }
            readonly lid_migration_state?: {
                readonly addressing_mode?: 'LID'
            }
            readonly allow_admin_reports?: boolean
            readonly announcement?: boolean
            readonly ephemeral?: {
                readonly expiration_time_in_sec?: number
            }
            readonly growth_locked2?: {
                readonly locked?: boolean
            }
            readonly locked?: boolean
            readonly member_add_mode?: 'ADMIN_ADD' | 'ALL_MEMBER_ADD'
            readonly member_link_mode?: 'ADMIN_LINK' | 'ALL_MEMBER_LINK'
            readonly member_share_group_history_mode?: 'ALL_MEMBER_SHARE'
            readonly membership_approval_mode_enabled?: boolean
            readonly parent_group_jid?: string
            readonly general_chat?: boolean
            readonly auto_add_disabled?: boolean
            readonly hidden_group?: boolean
            readonly group_safety_check?: boolean
            readonly capi?: boolean
            readonly support?: boolean
        }
        readonly membership_approval_request?: boolean
    }
}

export type WaMexFetchGroupInviteCodeResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly invite_code?: string
        readonly id?: string
    }
}

export type WaMexFetchGroupIsInternalResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly properties?: {
            readonly internal?: boolean
        }
        readonly id?: string
    }
}

export type WaMexFetchIntegritySignalsResponse = {
    readonly xwa2_fetch_wa_users?: ReadonlyArray<{
        readonly __typename?: string
        readonly integrity_signals_info?: {
            readonly __typename?: string
            readonly is_suspicious_start_chat?: boolean
            readonly is_new_account?: boolean
        }
        readonly id?: string
    }>
}

export type WaMexFetchNativeAdsMvpEligibilityResponse = {
    readonly wa_smb_native_ads_web_info?: {
        readonly lifetime_native_ctwa_advertiser?: boolean
        readonly webclient_l90_ad_creator?: boolean
        readonly is_page_asset_linked?: boolean
        readonly is_pageless_asset_linked?: boolean
    }
}

export type WaMexFetchNewChatMessageCappingInfoResponse = {
    readonly xwa2_message_capping_info?: {
        readonly total_quota?: string
        readonly used_quota?: string
        readonly cycle_start_timestamp?: string
        readonly cycle_end_timestamp?: string
        readonly server_sent_timestamp?: string
        readonly ote_status?: string
        readonly mv_status?: string
        readonly capping_status?: string
    }
}

export type WaMexFetchNewsletterResponse = {
    readonly xwa2_newsletter?: {
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
        readonly thread_metadata?: {
            readonly creation_time?: string
            readonly name?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly picture?: {
                readonly id?: string
                readonly type?: 'IMAGE' | 'PREVIEW'
                readonly direct_path?: string
            }
            readonly preview?: {
                readonly id?: string
                readonly type?: 'PREVIEW'
                readonly direct_path?: string
            }
            readonly description?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly invite?: string
            readonly handle?: string
            readonly subscribers_count?: string
            readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            readonly settings?: {
                readonly reaction_codes?: {
                    readonly value?: 'ALL'
                }
            }
            readonly wamo_sub?: {
                readonly plan_id?: string
            }
        }
        readonly viewer_metadata?: {
            readonly settings?: ReadonlyArray<{
                readonly type?: 'MUTE_ADMIN_ACTIVITY' | 'MUTE_FOLLOWER_ACTIVITY'
                readonly value?: 'OFF' | 'ON'
            }>
            readonly role?: 'ADMIN' | 'GUEST' | 'OWNER' | 'SUBSCRIBER'
            readonly wamo_sub_status?: 'ACTIVE' | 'INACTIVE'
        }
        readonly status_metadata?: {
            readonly last_status_server_id?: string
            readonly last_status_sent_time?: string
        }
    }
}

export type WaMexFetchNewsletterAdminCapabilitiesResponse = {
    readonly xwa2_newsletter_admin?: {
        readonly capabilities?: ReadonlyArray<'ADMIN_CONTEXT_CARD_1' | 'ADMIN_CONTEXT_CARD_2' | 'ADMIN_CONTEXT_CARD_3' | 'ADMIN_NOTIFICATIONS' | 'ADMIN_ONBOARDING' | 'ADMIN_ONBOARDING_2' | 'ADMIN_PROFILE' | 'CHANNEL_STATUS_PRODUCER' | 'INSIGHTS' | 'INVITE_ADMINS_BUTTON' | 'INVITE_FOLLOWERS' | 'JARVIS_INTEGRATION_ENABLED' | 'MUSIC' | 'NEW_MESSAGE_TYPES_TOOLTIP' | 'PHOTO_POLLS' | 'PINNING_NUDGE' | 'QUESTIONS' | 'QUESTIONS_M2' | 'QUIZ' | 'SHARE_STICKER_PACKS' | 'THREAD_MENU'>
        readonly id?: string
    }
}

export type WaMexFetchNewsletterAdminInfoResponse = {
    readonly xwa2_newsletter_admin?: {
        readonly admin_count?: number
        readonly admin_profile?: {
            readonly id?: string
            readonly name?: string
            readonly picture?: {
                readonly id?: string
                readonly direct_path?: string
            }
        }
        readonly admin_settings?: {
            readonly admin_profiles_enabled?: boolean
        }
        readonly id?: string
    }
}

export type WaMexFetchNewsletterDehydratedResponse = {
    readonly xwa2_newsletter?: {
        readonly id?: string
        readonly thread_metadata?: {
            readonly subscribers_count?: string
            readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            readonly settings?: {
                readonly reaction_codes?: {
                    readonly value?: 'ALL'
                }
            }
            readonly wamo_sub?: {
                readonly plan_id?: string
            }
        }
        readonly viewer_metadata?: {
            readonly wamo_sub_status?: 'ACTIVE' | 'INACTIVE'
        }
    }
}

export type WaMexFetchNewsletterDirectoryCategoriesPreviewResponse = {
    readonly xwa2_newsletters_directory_category_preview?: {
        readonly result?: ReadonlyArray<{
            readonly category?: string
            readonly category_title?: string
            readonly newsletters?: ReadonlyArray<{
                readonly id?: string
                readonly thread_metadata?: {
                    readonly creation_time?: string
                    readonly invite?: string
                    readonly handle?: string
                    readonly subscribers_count?: string
                    readonly name?: {
                        readonly id?: string
                        readonly text?: string
                        readonly update_time?: string
                    }
                    readonly description?: {
                        readonly id?: string
                        readonly text?: string
                        readonly update_time?: string
                    }
                    readonly picture?: {
                        readonly id?: string
                        readonly direct_path?: string
                        readonly type?: 'IMAGE' | 'PREVIEW'
                    }
                    readonly verification?: 'UNVERIFIED' | 'VERIFIED'
                }
                readonly status_metadata?: {
                    readonly last_status_server_id?: string
                    readonly last_status_sent_time?: string
                }
            }>
        }>
    }
}

export type WaMexFetchNewsletterDirectoryListResponse = {
    readonly xwa2_newsletters_directory_list?: {
        readonly page_info?: {
            readonly hasNextPage?: boolean
            readonly hasPreviousPage?: boolean
            readonly startCursor?: string
            readonly endCursor?: string
        }
        readonly result?: ReadonlyArray<{
            readonly id?: string
            readonly thread_metadata?: {
                readonly creation_time?: string
                readonly invite?: string
                readonly handle?: string
                readonly subscribers_count?: string
                readonly name?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly description?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly picture?: {
                    readonly id?: string
                    readonly direct_path?: string
                    readonly type?: 'IMAGE' | 'PREVIEW'
                }
                readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            }
            readonly status_metadata?: {
                readonly last_status_server_id?: string
                readonly last_status_sent_time?: string
            }
        }>
    }
}

export type WaMexFetchNewsletterDirectorySearchResultsResponse = {
    readonly xwa2_newsletters_directory_search?: {
        readonly page_info?: {
            readonly hasNextPage?: boolean
            readonly hasPreviousPage?: boolean
            readonly startCursor?: string
            readonly endCursor?: string
        }
        readonly result?: ReadonlyArray<{
            readonly id?: string
            readonly thread_metadata?: {
                readonly creation_time?: string
                readonly invite?: string
                readonly handle?: string
                readonly subscribers_count?: string
                readonly name?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly description?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly picture?: {
                    readonly id?: string
                    readonly direct_path?: string
                    readonly type?: 'IMAGE' | 'PREVIEW'
                }
                readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            }
            readonly status_metadata?: {
                readonly last_status_server_id?: string
                readonly last_status_sent_time?: string
            }
        }>
    }
}

export type WaMexFetchNewsletterEnforcementsResponse = {
    readonly xwa2_channel_enforcements?: {
        readonly profile_picture_deletions?: ReadonlyArray<{
            readonly enforcement_creation_time?: string
            readonly appeal_creation_time?: string
            readonly appeal_state?: string
            readonly enforcement_violation_category?: string
            readonly enforcement_source?: string
            readonly enforcement_id?: string
            readonly enforcement_extra_data?: {
                readonly ip_violation_report_data?: {
                    readonly report_fbid?: string
                    readonly appeal_form_url?: string
                    readonly reporter_email?: string
                    readonly reporter_name?: string
                }
            }
            readonly enforcement_policy_information?: {
                readonly overview?: string
                readonly headline?: string
                readonly subtitle?: string
                readonly explanation?: string
                readonly admin_disclaimer?: string
            }
        }>
        readonly suspensions?: ReadonlyArray<{
            readonly appeal_creation_time?: string
            readonly enforcement_creation_time?: string
            readonly appeal_state?: string
            readonly enforcement_violation_category?: string
            readonly enforcement_id?: string
            readonly enforcement_source?: string
            readonly enforcement_extra_data?: {
                readonly ip_violation_report_data?: {
                    readonly report_fbid?: string
                    readonly appeal_form_url?: string
                    readonly reporter_email?: string
                    readonly reporter_name?: string
                }
                readonly enforcement_target_data?: {
                    readonly __typename?: string
                    readonly server_msg_id?: string
                    readonly server_id?: string
                    readonly id?: string
                }
                readonly appeal_extra_data?: {
                    readonly appeal_form_url?: string
                }
            }
            readonly enforcement_policy_information?: {
                readonly overview?: string
                readonly headline?: string
                readonly subtitle?: string
                readonly explanation?: string
                readonly admin_disclaimer?: string
            }
        }>
        readonly violating_messages?: ReadonlyArray<{
            readonly base_enforcement_data?: {
                readonly enforcement_creation_time?: string
                readonly appeal_creation_time?: string
                readonly appeal_state?: string
                readonly enforcement_id?: string
                readonly enforcement_violation_category?: string
                readonly enforcement_source?: string
                readonly enforcement_extra_data?: {
                    readonly ip_violation_report_data?: {
                        readonly report_fbid?: string
                        readonly appeal_form_url?: string
                        readonly reporter_email?: string
                        readonly reporter_name?: string
                    }
                }
                readonly enforcement_policy_information?: {
                    readonly overview?: string
                    readonly headline?: string
                    readonly subtitle?: string
                    readonly explanation?: string
                    readonly admin_disclaimer?: string
                }
            }
            readonly content_data?: {
                readonly __typename?: string
                readonly server_msg_id?: string
                readonly server_id?: string
            }
        }>
        readonly geosuspensions?: ReadonlyArray<{
            readonly base_enforcement_data?: {
                readonly enforcement_creation_time?: string
                readonly appeal_creation_time?: string
                readonly appeal_state?: string
                readonly enforcement_id?: string
                readonly enforcement_violation_category?: string
                readonly enforcement_source?: string
                readonly enforcement_extra_data?: {
                    readonly ip_violation_report_data?: {
                        readonly report_fbid?: string
                        readonly appeal_form_url?: string
                        readonly reporter_email?: string
                        readonly reporter_name?: string
                    }
                    readonly enforcement_target_data?: {
                        readonly __typename?: string
                        readonly server_msg_id?: string
                        readonly server_id?: string
                        readonly id?: string
                    }
                    readonly appeal_extra_data?: {
                        readonly appeal_form_url?: string
                    }
                    readonly enforcing_entity_data?: {
                        readonly name?: string
                    }
                    readonly enforcement_origin_workflow?: string
                    readonly enforcement_origin_legal_basis?: string
                }
                readonly enforcement_policy_information?: {
                    readonly overview?: string
                    readonly headline?: string
                    readonly subtitle?: string
                    readonly explanation?: string
                    readonly admin_disclaimer?: string
                }
            }
            readonly country_codes?: ReadonlyArray<string>
        }>
    }
}

export type WaMexFetchNewsletterFollowersResponse = {
    readonly xwa2_newsletter_followers?: {
        readonly followers?: {
            readonly edges?: ReadonlyArray<{
                readonly node?: {
                    readonly id?: string
                    readonly display_name?: string
                    readonly pn?: string
                    readonly username_info?: {
                        readonly __typename?: string
                        readonly username?: string
                    }
                }
                readonly follow_time?: string
                readonly role?: 'ADMIN' | 'GUEST' | 'OWNER' | 'SUBSCRIBER'
                readonly admin_profile?: {
                    readonly id?: string
                    readonly name?: string
                    readonly picture?: {
                        readonly direct_path?: string
                        readonly id?: string
                    }
                }
            }>
        }
    }
}

export type WaMexFetchNewsletterInsightsResponse = {
    readonly xwa2_newsletter_admin_insights?: {
        readonly newsletter_id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
        readonly last_update_time?: string
        readonly metrics_status?: string
        readonly result?: ReadonlyArray<{
            readonly id?: string
            readonly values?: ReadonlyArray<{
                readonly value?: string
                readonly country?: string
                readonly role?: 'ADMIN' | 'GUEST' | 'OWNER' | 'SUBSCRIBER'
                readonly timestamp?: string
            }>
        }>
    }
}

export type WaMexFetchNewsletterIsDomainPreviewableResponse = {
    readonly xwa2_newsletter_message_integrity?: {
        readonly url_previews?: ReadonlyArray<{
            readonly url_domain?: string
            readonly is_previewable?: boolean
        }>
    }
}

export type WaMexFetchNewsletterMessageReactionSenderListResponse = {
    readonly xwa2_newsletters_reaction_sender_list?: {
        readonly reactions?: ReadonlyArray<{
            readonly reaction_code?: string
            readonly sender_list?: {
                readonly edges?: ReadonlyArray<{
                    readonly node?: {
                        readonly id?: string
                        readonly profile_pic_direct_path?: string
                    }
                }>
            }
        }>
    }
}

export type WaMexFetchNewsletterPendingInvitesResponse = {
    readonly xwa2_newsletter_admin?: {
        readonly pending_admin_invites?: ReadonlyArray<{
            readonly user?: {
                readonly pn?: string
                readonly id?: string
            }
        }>
        readonly id?: string
    }
}

export type WaMexFetchNewsletterPollVotersResponse = {
    readonly voter_list?: {
        readonly votes?: ReadonlyArray<{
            readonly vote_hash?: string
            readonly voter_list?: {
                readonly edges?: ReadonlyArray<{
                    readonly action_time?: string
                    readonly node?: {
                        readonly id?: string
                    }
                }>
            }
        }>
    }
}

export type WaMexFetchNewsletterReportsResponse = {
    readonly xwa2_channels_reports?: {
        readonly channels_reports?: ReadonlyArray<{
            readonly report_id?: string
            readonly status?: string
            readonly creation_time?: string
            readonly last_update_time?: string
            readonly channel_name?: string
            readonly channel_jid?: string
            readonly reported_content_data?: {
                readonly __typename?: string
                readonly server_msg_id?: string
                readonly server_id?: string
                readonly server_response_id?: string
                readonly notify_name?: string
                readonly question_data?: {
                    readonly __typename?: string
                    readonly server_msg_id?: string
                }
            }
            readonly appeal?: {
                readonly state?: 'CONTENT_UNAVAILABLE' | 'NON_APPEALABLE' | 'NOT_APPEALED' | 'PENDING' | 'REJECT' | 'SUCCESS'
                readonly appeal_reason?: string
                readonly creation_time?: string
                readonly report_id?: string
                readonly appeal_id?: string
            }
        }>
    }
}

export type WaMexFetchOHAIKeyConfigResponse = {
    readonly xwa2_ohai_configurations?: {
        readonly ohai_configs?: ReadonlyArray<{
            readonly aead_id?: number
            readonly expiration_date?: string
            readonly kdf_id?: number
            readonly kem_id?: number
            readonly key_id?: number
            readonly last_updated_time?: string
            readonly public_key?: string
        }>
    }
}

export type WaMexFetchOIDCStateResponse = {
    readonly xfb_wa_biz_get_oidc_state?: string
}

export type WaMexFetchPlaintextLinkPreviewResponse = {
    readonly xwa2_newsletter_link_preview?: {
        readonly description?: string
        readonly direct_path?: string
        readonly hash?: string
        readonly preview_type?: 'IMAGE'
        readonly thumb_data?: string
        readonly title?: string
        readonly height?: number
        readonly width?: number
    }
}

export type WaMexFetchQuickPromotionsResponse = {
    readonly quick_promotion_batch_fetch_root?: ReadonlyArray<{
        readonly surface_nux_id?: string
        readonly eligible_promotions?: {
            readonly edges?: ReadonlyArray<{
                readonly client_ttl_seconds?: number
                readonly priority?: number
                readonly is_holdout?: boolean
                readonly log_eligibility_waterfall?: string
                readonly time_range?: {
                    readonly start?: string
                    readonly end?: string
                }
                readonly node?: {
                    readonly promotion_id?: string
                    readonly is_server_force_pass?: boolean
                    readonly ab_prop_name?: string
                    readonly surface_delay_in_seconds?: number
                    readonly encrypted_logging_data?: string
                    readonly client_side_dry_run?: boolean
                    readonly creatives?: ReadonlyArray<{
                        readonly title?: {
                            readonly text?: string
                        }
                        readonly content?: {
                            readonly text?: string
                        }
                        readonly primary_action?: {
                            readonly title?: {
                                readonly text?: string
                            }
                            readonly url?: string
                        }
                        readonly wa_light_mode_media_details?: {
                            readonly jpeg_thumbnail?: string
                        }
                        readonly wa_dark_mode_media_details?: {
                            readonly jpeg_thumbnail?: string
                        }
                        readonly accessibility_text_for_image?: string
                        readonly is_dismissible?: boolean
                        readonly id?: string
                    }>
                    readonly content_attributes?: {
                        readonly wa_banner_background_color?: {
                            readonly light_mode_highlight_color?: string
                            readonly dark_mode_highlight_color?: string
                            readonly light_mode_background_color?: string
                            readonly dark_mode_background_color?: string
                        }
                        readonly wa_primary_cta_alternative_url?: string
                        readonly wa_eligible_duration_after_impression_in_seconds?: number
                    }
                    readonly wa_qp_content_attributes_do_not_use?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                    readonly contextual_filters_for_wa_do_not_use?: {
                        readonly clause_type?: string
                        readonly filters?: ReadonlyArray<{
                            readonly filter_name?: string
                            readonly parameters?: ReadonlyArray<{
                                readonly key?: string
                                readonly value?: string
                            }>
                            readonly passes_if_client_not_supported?: boolean
                            readonly filter_result?: string
                        }>
                        readonly clauses?: ReadonlyArray<{
                            readonly clause_type?: string
                            readonly filters?: ReadonlyArray<{
                                readonly filter_name?: string
                                readonly parameters?: ReadonlyArray<{
                                    readonly key?: string
                                    readonly value?: string
                                }>
                                readonly passes_if_client_not_supported?: boolean
                                readonly filter_result?: string
                            }>
                            readonly clauses?: ReadonlyArray<{
                                readonly clause_type?: string
                                readonly filters?: ReadonlyArray<{
                                    readonly filter_name?: string
                                    readonly parameters?: ReadonlyArray<{
                                        readonly key?: string
                                        readonly value?: string
                                    }>
                                    readonly passes_if_client_not_supported?: boolean
                                    readonly filter_result?: string
                                }>
                                readonly clauses?: ReadonlyArray<{
                                    readonly clause_type?: string
                                    readonly filters?: ReadonlyArray<{
                                        readonly filter_name?: string
                                        readonly parameters?: ReadonlyArray<{
                                            readonly key?: string
                                            readonly value?: string
                                        }>
                                        readonly passes_if_client_not_supported?: boolean
                                        readonly filter_result?: string
                                    }>
                                    readonly clauses?: ReadonlyArray<{
                                        readonly clause_type?: string
                                        readonly filters?: ReadonlyArray<{
                                            readonly filter_name?: string
                                            readonly parameters?: ReadonlyArray<{
                                                readonly key?: string
                                                readonly value?: string
                                            }>
                                            readonly passes_if_client_not_supported?: boolean
                                            readonly filter_result?: string
                                        }>
                                        readonly clauses?: ReadonlyArray<{
                                            readonly clause_type?: string
                                            readonly filters?: ReadonlyArray<{
                                                readonly filter_name?: string
                                                readonly parameters?: ReadonlyArray<{
                                                    readonly key?: string
                                                    readonly value?: string
                                                }>
                                                readonly passes_if_client_not_supported?: boolean
                                                readonly filter_result?: string
                                            }>
                                            readonly clauses?: ReadonlyArray<{
                                                readonly clause_type?: string
                                                readonly filters?: ReadonlyArray<{
                                                    readonly filter_name?: string
                                                    readonly parameters?: ReadonlyArray<{
                                                        readonly key?: string
                                                        readonly value?: string
                                                    }>
                                                    readonly passes_if_client_not_supported?: boolean
                                                    readonly filter_result?: string
                                                }>
                                                readonly clauses?: ReadonlyArray<{
                                                    readonly clause_type?: string
                                                    readonly filters?: ReadonlyArray<{
                                                        readonly filter_name?: string
                                                        readonly parameters?: ReadonlyArray<{
                                                            readonly key?: string
                                                            readonly value?: string
                                                        }>
                                                        readonly passes_if_client_not_supported?: boolean
                                                        readonly filter_result?: string
                                                    }>
                                                }>
                                            }>
                                        }>
                                    }>
                                }>
                            }>
                        }>
                    }
                    readonly id?: string
                }
            }>
        }
    }>
}

export type WaMexFetchReachoutTimelockResponse = {
    readonly xwa2_fetch_account_reachout_timelock?: {
        readonly is_active?: boolean
        readonly time_enforcement_ends?: string
        readonly enforcement_type?: 'GEOSUSPEND' | 'GEOSUSPEND_INFORM' | 'PROFILE_PICTURE_DELETION' | 'SUSPEND' | 'SUSPEND_INFORM' | 'VIOLATING_MSG'
    }
}

export type WaMexFetchRecommendedNewslettersResponse = {
    readonly xwa2_newsletters_recommended?: {
        readonly page_info?: {
            readonly hasNextPage?: boolean
            readonly hasPreviousPage?: boolean
            readonly startCursor?: string
            readonly endCursor?: string
        }
        readonly result?: ReadonlyArray<{
            readonly id?: string
            readonly state?: {
                readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
            }
            readonly thread_metadata?: {
                readonly creation_time?: string
                readonly name?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly description?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly preview?: {
                    readonly id?: string
                    readonly type?: 'PREVIEW'
                    readonly direct_path?: string
                }
                readonly invite?: string
                readonly handle?: string
                readonly verification?: 'UNVERIFIED' | 'VERIFIED'
                readonly subscribers_count?: string
            }
            readonly status_metadata?: {
                readonly last_status_server_id?: string
                readonly last_status_sent_time?: string
            }
        }>
    }
}

export type WaMexFetchSimilarNewslettersResponse = {
    readonly xwa2_newsletters_similar?: {
        readonly result?: ReadonlyArray<{
            readonly id?: string
            readonly thread_metadata?: {
                readonly name?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly picture?: {
                    readonly id?: string
                    readonly type?: 'IMAGE' | 'PREVIEW'
                    readonly direct_path?: string
                }
                readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            }
            readonly status_metadata?: {
                readonly last_status_server_id?: string
            }
            readonly state?: {
                readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
            }
        }>
    }
}

export type WaMexFetchSubgroupSuggestionsResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly id?: string
        readonly sub_group_suggestions?: {
            readonly edges?: ReadonlyArray<{
                readonly node?: {
                    readonly id?: string
                    readonly subject?: {
                        readonly value?: string
                    }
                    readonly description?: {
                        readonly value?: string
                        readonly id?: string
                    }
                    readonly creator?: {
                        readonly id?: string
                    }
                    readonly creation_time?: string
                    readonly total_participants_count?: number
                    readonly is_existing_group?: boolean
                    readonly hidden_group?: boolean
                }
            }>
        }
    }
}

export type WaMexFetchSubscriptionEntryPointsResponse = {
    readonly waSubscriptionEntryPoints?: {
        readonly subscriptionEntryPoints?: ReadonlyArray<{
            readonly subscriptionType?: string
            readonly webEntryPointEligibility?: boolean
            readonly webEntryPointRedirectionUri?: string
        }>
    }
}

export type WaMexFetchSubscriptionsResponse = {
    readonly xwa_get_subscriptions?: {
        readonly subscriptions?: ReadonlyArray<{
            readonly id?: string
            readonly status?: 'ACTIVE' | 'CANCELED'
            readonly end_time?: string
            readonly creation_time?: string
            readonly tier?: string
            readonly source?: string
            readonly is_platform_changed?: boolean
            readonly start_time?: string
        }>
        readonly feature_flags?: ReadonlyArray<{
            readonly name?: string
            readonly enabled?: boolean
            readonly expiration_time?: string
            readonly limit?: number
        }>
    }
}

export type WaMexFetchTextStatusListResponse = {
    readonly xwa2_text_status_list?: ReadonlyArray<{
        readonly jid?: string
        readonly text?: string
        readonly last_update_time?: string
        readonly ephemeral_duration_sec?: number
        readonly emoji?: {
            readonly content?: string
        }
    }>
}

export type WaMexGetAccessTokenFromOIDCCodeResponse = {
    readonly xfb_wa_biz_get_token_from_oidc_code?: {
        readonly access_token?: string
        readonly fb_user_id?: string
    }
}

export type WaMexGetAccountNonceResponse = {
    readonly xfb_wa_biz_account_nonce?: {
        readonly detail?: {
            readonly nonce?: string
            readonly request?: {
                readonly id?: string
            }
        }
    }
}

export type WaMexGetDsbInfoResponse = {
    readonly xwa2_get_dsb_info?: {
        readonly reference_number?: string
    }
}

export type WaMexGetFBAccountPagesResponse = {
    readonly user?: {
        readonly facebook_pages?: {
            readonly nodes?: ReadonlyArray<{
                readonly name?: string
                readonly id?: string
                readonly profile_picture?: {
                    readonly uri?: string
                }
                readonly permitted_tasks?: string
            }>
        }
        readonly id?: string
    }
}

export type WaMexGetNumbersForBrandIdsResponse = {
    readonly xwa_get_numbers_for_brand_ids?: {
        readonly brand_ids_data?: ReadonlyArray<{
            readonly brand_id?: string
            readonly error?: boolean
            readonly phone_numbers?: ReadonlyArray<string>
            readonly lids?: ReadonlyArray<string>
        }>
    }
}

export type WaMexGetPrivacyListsResponse = {
    readonly xwa2_fetch_wa_users?: ReadonlyArray<{
        readonly __typename?: string
        readonly privacy_contact_list?: {
            readonly dhash?: string
            readonly contacts?: ReadonlyArray<{
                readonly jid?: string
                readonly pn_jid?: string
                readonly username_info?: {
                    readonly __typename?: string
                    readonly username?: string
                }
            }>
        }
        readonly id?: string
    }>
}

export type WaMexGetPrivacySettingsResponse = {
    readonly xwa2_fetch_wa_users?: ReadonlyArray<{
        readonly __typename?: string
        readonly privacy_settings?: {
            readonly settings?: ReadonlyArray<{
                readonly feature?: 'ABOUT' | 'CALLADD' | 'DEFENSE' | 'DEPENDENT_ACCOUNT_CALLING' | 'DEPENDENT_ACCOUNT_MESSAGES' | 'GROUPADD' | 'LAST' | 'LINKED_PROFILES' | 'MESSAGES' | 'ONLINE' | 'PIX' | 'PROFILE' | 'READRECEIPTS' | 'STICKERS'
                readonly setting?: 'ALL' | 'MYCONTACTS' | 'OFF'
            }>
        }
        readonly id?: string
    }>
}

export type WaMexGetUsernameResponse = {
    readonly xwa2_username_get?: {
        readonly username_info?: {
            readonly username?: string
            readonly state?: string
            readonly pin?: string
        }
    }
}

export type WaMexGetWAAEligibilityResponse = {
    readonly eval_wa_ad_account_eligibility_rules?: {
        readonly eligibility_result?: string
    }
}

export type WaMexGraphQLProductCatalogGetPublicKeyResponse = {
    readonly xwa_product_catalog_get_public_key?: {
        readonly public_key_certificate_pem?: string
        readonly public_key_with_signature?: {
            readonly public_key_pem?: string
            readonly public_key_signature?: string
        }
    }
}

export type WaMexGraphQLVerifyPostcodeResponse = {
    readonly xwa_product_catalog_get_verify_postcode?: {
        readonly postcode_verification_result?: {
            readonly result_code?: string
            readonly encrypted_location_name?: string
        }
    }
}

export type WaMexGroupStoreInviteSmsResponse = {
    readonly xwa2_group_store_invites_sms?: {
        readonly group_jid?: string
        readonly participant_responses?: ReadonlyArray<{
            readonly error_code?: number
        }>
    }
}

export type WaMexGroupSuspensionAppealResponse = {
    readonly wa_create_group_suspension_appeal?: {
        readonly response_code?: string
        readonly error_message?: string
        readonly appeal_creation_time?: string
    }
}

export type WaMexIntegrityChallengeResponseResponse = {
    readonly xwa2_submit_integrity_challenge_response?: {
        readonly success?: boolean
        readonly error_message?: string
    }
}

export type WaMexJoinNewsletterResponse = {
    readonly xwa2_newsletter_join_v2?: {
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
    }
}

export type WaMexLeaveNewsletterResponse = {
    readonly xwa2_newsletter_leave_v2?: {
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
    }
}

export type WaMexLidChangeNotificationResponse = {
    readonly xwa2_notify_lid_change?: {
        readonly old?: string
        readonly new?: string
    }
}

export type WaMexLogNewsletterExposuresResponse = {
    readonly xwa2_newsletter_log_exposures?: {
        readonly __typename?: string
    }
}

export type WaMexNativeMLModelResponse = {
    readonly aim_model_batched_manifest?: {
        readonly models?: ReadonlyArray<{
            readonly name?: string
            readonly version?: number
            readonly assets?: ReadonlyArray<{
                readonly name?: string
                readonly id?: string
                readonly cache_key?: string
                readonly source_content_hash?: string
                readonly md5_hash?: string
                readonly asset_handle?: string
                readonly creation_time?: string
                readonly url?: string
                readonly filesize_bytes?: number
                readonly compression_type?: string
                readonly asset_type?: string
            }>
            readonly properties?: ReadonlyArray<{
                readonly name?: string
                readonly value?: string
            }>
        }>
        readonly entry_point?: string
        readonly asset_count?: number
        readonly model_count?: number
        readonly status?: string
        readonly status_details?: string
    }
}

export type WaMexNewsletterAddPaidPartnershipLabelResponse = {
    readonly xwa2_newsletter_label_paid_partnership?: {
        readonly id?: string
    }
}

export type WaMexQueryCatalogResponse = {
    readonly xwa_product_catalog_get_product_catalog?: {
        readonly __typename?: string
        readonly product_catalog?: {
            readonly products?: ReadonlyArray<{
                readonly id?: string
                readonly retailer_id?: string
                readonly is_hidden?: boolean
                readonly is_sanctioned?: boolean
                readonly product_availability?: string
                readonly max_available?: number
                readonly name?: string
                readonly description?: string
                readonly url?: string
                readonly shimmed_url?: string
                readonly currency?: string
                readonly price?: string
                readonly status_info?: {
                    readonly can_appeal?: boolean
                    readonly status?: string
                }
                readonly sale_price?: {
                    readonly price?: string
                    readonly start_date?: string
                    readonly end_date?: string
                }
                readonly media?: {
                    readonly images?: ReadonlyArray<{
                        readonly id?: string
                        readonly original_image_url?: string
                        readonly request_image_url?: string
                    }>
                    readonly videos?: ReadonlyArray<{
                        readonly id?: string
                        readonly original_video_url?: string
                        readonly thumbnail_url?: string
                    }>
                }
                readonly belongs_to?: string
                readonly compliance_category?: string
                readonly compliance_info?: {
                    readonly country_code_origin?: string
                    readonly importer_name?: string
                    readonly importer_address?: {
                        readonly street1?: string
                        readonly street2?: string
                        readonly postal_code?: string
                        readonly city?: string
                        readonly region?: string
                        readonly country_code?: string
                    }
                }
                readonly variant_info?: {
                    readonly listing_details?: {
                        readonly description?: string
                        readonly multi_price?: string
                        readonly lowest_price?: string
                    }
                    readonly availability?: {
                        readonly listing?: ReadonlyArray<{
                            readonly is_available?: boolean
                            readonly options?: ReadonlyArray<{
                                readonly name?: string
                                readonly value?: string
                            }>
                            readonly product_id?: string
                        }>
                    }
                    readonly types?: ReadonlyArray<{
                        readonly name?: string
                        readonly options?: ReadonlyArray<{
                            readonly value?: string
                            readonly thumbnail_media?: {
                                readonly id?: string
                                readonly original_dimensions?: {
                                    readonly height?: number
                                    readonly width?: number
                                }
                                readonly original_image_url?: string
                                readonly request_image_url?: string
                            }
                        }>
                    }>
                    readonly variant_properties?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                }
            }>
            readonly paging?: {
                readonly before?: string
                readonly after?: string
            }
        }
    }
}

export type WaMexQueryCatalogHasCategoriesResponse = {
    readonly xwa_product_catalog_get_categories?: {
        readonly categories?: ReadonlyArray<{
            readonly __typename?: string
        }>
    }
}

export type WaMexQueryCatalogProductResponse = {
    readonly xwa_product_catalog_get_product?: {
        readonly product_catalog?: {
            readonly product?: {
                readonly id?: string
                readonly retailer_id?: string
                readonly is_hidden?: boolean
                readonly is_sanctioned?: boolean
                readonly product_availability?: string
                readonly max_available?: number
                readonly name?: string
                readonly description?: string
                readonly url?: string
                readonly shimmed_url?: string
                readonly currency?: string
                readonly price?: string
                readonly status_info?: {
                    readonly can_appeal?: boolean
                    readonly status?: string
                }
                readonly sale_price?: {
                    readonly price?: string
                    readonly start_date?: string
                    readonly end_date?: string
                }
                readonly media?: {
                    readonly images?: ReadonlyArray<{
                        readonly id?: string
                        readonly original_image_url?: string
                        readonly request_image_url?: string
                    }>
                    readonly videos?: ReadonlyArray<{
                        readonly id?: string
                        readonly original_video_url?: string
                        readonly thumbnail_url?: string
                    }>
                }
                readonly belongs_to?: string
                readonly compliance_category?: string
                readonly compliance_info?: {
                    readonly country_code_origin?: string
                    readonly importer_name?: string
                    readonly importer_address?: {
                        readonly street1?: string
                        readonly street2?: string
                        readonly postal_code?: string
                        readonly city?: string
                        readonly region?: string
                        readonly country_code?: string
                    }
                }
                readonly variant_info?: {
                    readonly listing_details?: {
                        readonly description?: string
                        readonly multi_price?: string
                        readonly lowest_price?: string
                    }
                    readonly availability?: {
                        readonly listing?: ReadonlyArray<{
                            readonly is_available?: boolean
                            readonly options?: ReadonlyArray<{
                                readonly name?: string
                                readonly value?: string
                            }>
                            readonly product_id?: string
                        }>
                    }
                    readonly types?: ReadonlyArray<{
                        readonly name?: string
                        readonly options?: ReadonlyArray<{
                            readonly value?: string
                            readonly thumbnail_media?: {
                                readonly id?: string
                                readonly original_dimensions?: {
                                    readonly height?: number
                                    readonly width?: number
                                }
                                readonly original_image_url?: string
                                readonly request_image_url?: string
                            }
                        }>
                    }>
                    readonly variant_properties?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                }
            }
        }
    }
}

export type WaMexQueryProductCollectionsResponse = {
    readonly xwa_product_catalog_get_collections?: {
        readonly __typename?: string
        readonly collections?: ReadonlyArray<{
            readonly id?: string
            readonly name?: string
            readonly status_info?: {
                readonly status?: string
                readonly can_appeal?: string
                readonly reject_reason?: string
                readonly commerce_url?: string
            }
            readonly products?: ReadonlyArray<{
                readonly id?: string
                readonly retailer_id?: string
                readonly is_hidden?: boolean
                readonly is_sanctioned?: boolean
                readonly product_availability?: string
                readonly max_available?: number
                readonly name?: string
                readonly description?: string
                readonly url?: string
                readonly shimmed_url?: string
                readonly currency?: string
                readonly price?: string
                readonly status_info?: {
                    readonly can_appeal?: string
                    readonly status?: string
                }
                readonly sale_price?: {
                    readonly price?: string
                    readonly start_date?: string
                    readonly end_date?: string
                }
                readonly media?: {
                    readonly images?: ReadonlyArray<{
                        readonly id?: string
                        readonly original_image_url?: string
                        readonly request_image_url?: string
                    }>
                    readonly videos?: ReadonlyArray<{
                        readonly id?: string
                        readonly original_video_url?: string
                        readonly thumbnail_url?: string
                    }>
                }
                readonly belongs_to?: string
                readonly compliance_category?: string
                readonly compliance_info?: {
                    readonly country_code_origin?: string
                    readonly importer_name?: string
                    readonly importer_address?: {
                        readonly street1?: string
                        readonly street2?: string
                        readonly postal_code?: string
                        readonly city?: string
                        readonly region?: string
                        readonly country_code?: string
                    }
                }
                readonly variant_info?: {
                    readonly listing_details?: {
                        readonly description?: string
                        readonly multi_price?: string
                        readonly lowest_price?: string
                    }
                    readonly availability?: {
                        readonly listing?: ReadonlyArray<{
                            readonly is_available?: boolean
                            readonly options?: ReadonlyArray<{
                                readonly name?: string
                                readonly value?: string
                            }>
                            readonly product_id?: string
                        }>
                    }
                    readonly types?: ReadonlyArray<{
                        readonly name?: string
                        readonly options?: ReadonlyArray<{
                            readonly value?: string
                            readonly thumbnail_media?: {
                                readonly id?: string
                                readonly original_dimensions?: {
                                    readonly height?: number
                                    readonly width?: number
                                }
                                readonly original_image_url?: string
                                readonly request_image_url?: string
                            }
                        }>
                    }>
                    readonly variant_properties?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                }
            }>
        }>
        readonly paging?: {
            readonly after?: string
        }
    }
}

export type WaMexQueryProductListCatalogResponse = {
    readonly xwa_product_catalog_get_product_list?: {
        readonly __typename?: string
        readonly product_list?: {
            readonly products?: ReadonlyArray<{
                readonly id?: string
                readonly retailer_id?: string
                readonly is_hidden?: boolean
                readonly is_sanctioned?: boolean
                readonly product_availability?: string
                readonly max_available?: number
                readonly name?: string
                readonly description?: string
                readonly url?: string
                readonly shimmed_url?: string
                readonly currency?: string
                readonly price?: string
                readonly status_info?: {
                    readonly can_appeal?: boolean
                    readonly status?: string
                }
                readonly sale_price?: {
                    readonly price?: string
                    readonly start_date?: string
                    readonly end_date?: string
                }
                readonly media?: {
                    readonly images?: ReadonlyArray<{
                        readonly id?: string
                        readonly original_image_url?: string
                        readonly request_image_url?: string
                    }>
                    readonly videos?: ReadonlyArray<{
                        readonly id?: string
                        readonly original_video_url?: string
                        readonly thumbnail_url?: string
                    }>
                }
                readonly belongs_to?: string
                readonly compliance_category?: string
                readonly compliance_info?: {
                    readonly country_code_origin?: string
                    readonly importer_name?: string
                    readonly importer_address?: {
                        readonly street1?: string
                        readonly street2?: string
                        readonly postal_code?: string
                        readonly city?: string
                        readonly region?: string
                        readonly country_code?: string
                    }
                }
                readonly variant_info?: {
                    readonly listing_details?: {
                        readonly description?: string
                        readonly multi_price?: string
                        readonly lowest_price?: string
                    }
                    readonly availability?: {
                        readonly listing?: ReadonlyArray<{
                            readonly is_available?: boolean
                            readonly options?: ReadonlyArray<{
                                readonly name?: string
                                readonly value?: string
                            }>
                            readonly product_id?: string
                        }>
                    }
                    readonly types?: ReadonlyArray<{
                        readonly name?: string
                        readonly options?: ReadonlyArray<{
                            readonly value?: string
                            readonly thumbnail_media?: {
                                readonly id?: string
                                readonly original_dimensions?: {
                                    readonly height?: number
                                    readonly width?: number
                                }
                                readonly original_image_url?: string
                                readonly request_image_url?: string
                            }
                        }>
                    }>
                    readonly variant_properties?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                }
            }>
        }
    }
}

export type WaMexQueryProductSingleCollectionResponse = {
    readonly xwa_product_catalog_get_single_collection?: {
        readonly collection?: {
            readonly id?: string
            readonly name?: string
            readonly status_info?: {
                readonly status?: string
                readonly can_appeal?: string
                readonly reject_reason?: string
                readonly commerce_url?: string
            }
            readonly products?: ReadonlyArray<{
                readonly id?: string
                readonly retailer_id?: string
                readonly is_hidden?: boolean
                readonly is_sanctioned?: boolean
                readonly product_availability?: string
                readonly max_available?: number
                readonly name?: string
                readonly description?: string
                readonly url?: string
                readonly shimmed_url?: string
                readonly currency?: string
                readonly price?: string
                readonly status_info?: {
                    readonly can_appeal?: string
                    readonly status?: string
                }
                readonly sale_price?: {
                    readonly price?: string
                    readonly start_date?: string
                    readonly end_date?: string
                }
                readonly media?: {
                    readonly images?: ReadonlyArray<{
                        readonly id?: string
                        readonly original_image_url?: string
                        readonly request_image_url?: string
                    }>
                    readonly videos?: ReadonlyArray<{
                        readonly id?: string
                        readonly original_video_url?: string
                        readonly thumbnail_url?: string
                    }>
                }
                readonly belongs_to?: string
                readonly compliance_category?: string
                readonly compliance_info?: {
                    readonly country_code_origin?: string
                    readonly importer_name?: string
                    readonly importer_address?: {
                        readonly street1?: string
                        readonly street2?: string
                        readonly postal_code?: string
                        readonly city?: string
                        readonly region?: string
                        readonly country_code?: string
                    }
                }
                readonly variant_info?: {
                    readonly listing_details?: {
                        readonly description?: string
                        readonly multi_price?: string
                        readonly lowest_price?: string
                    }
                    readonly availability?: {
                        readonly listing?: ReadonlyArray<{
                            readonly is_available?: boolean
                            readonly options?: ReadonlyArray<{
                                readonly name?: string
                                readonly value?: string
                            }>
                            readonly product_id?: string
                        }>
                    }
                    readonly types?: ReadonlyArray<{
                        readonly name?: string
                        readonly options?: ReadonlyArray<{
                            readonly value?: string
                            readonly thumbnail_media?: {
                                readonly id?: string
                                readonly original_dimensions?: {
                                    readonly height?: number
                                    readonly width?: number
                                }
                                readonly original_image_url?: string
                                readonly request_image_url?: string
                            }
                        }>
                    }>
                    readonly variant_properties?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                }
            }>
        }
        readonly paging?: {
            readonly after?: string
        }
    }
}

export type WaMexQuerySubgroupParticipantCountResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly sub_groups?: {
            readonly edges?: ReadonlyArray<{
                readonly node?: {
                    readonly id?: string
                    readonly total_participants_count?: number
                }
            }>
        }
        readonly id?: string
    }
}

export type WaMexQuickPromotionActionResponse = {
    readonly wa_quick_promotion_log_event?: {
        readonly client_mutation_id?: string
    }
}

export type WaMexReportProductResponse = {
    readonly xwa_whatsapp_catalog_report_product?: {
        readonly __typename?: string
        readonly success?: boolean
    }
}

export type WaMexRequestClientLogsForBugResponse = {
    readonly xwa2_request_client_logs_for_bug?: boolean
}

export type WaMexResolveAccountTypeAndAdPageResponse = {
    readonly xfb_wa_biz_clear_oidc_preference?: boolean
}

export type WaMexResolveAccountTypeAndAdPageQueryResponse = {
    readonly page?: {
        readonly can_viewer_do_actions?: boolean
        readonly id?: string
    }
}

export type WaMexRevokeNewsletterAdminInviteResponse = {
    readonly xwa2_newsletter_admin_invite_revoke?: {
        readonly __typename?: string
        readonly id?: string
    }
}

export type WaMexSetUsernameResponse = {
    readonly xwa2_username_set?: {
        readonly result?: 'SUCCESS'
    }
}

export type WaMexSetUsernameKeyResponse = {
    readonly xwa2_username_pin_set?: {
        readonly result?: 'SUCCESS'
    }
}

export type WaMexSignupMetadataResponse = {
    readonly wa_signup_metadata?: {
        readonly id?: string
        readonly signup_message?: string
        readonly privacy_policy_url?: string
    }
}

export type WaMexSupportBugReportSubmitResponse = {
    readonly xwa_wa_support_bug_report_submit?: {
        readonly success?: boolean
        readonly error_code?: number
        readonly error_message?: string
        readonly bug_report_id?: string
        readonly task_id?: string
    }
}

export type WaMexSupportContactFormSubmitResponse = {
    readonly xwa_wa_support_contact_form_submit?: {
        readonly success?: boolean
        readonly error_code?: number
        readonly error_message?: string
        readonly ticket_id?: string
        readonly support_phone_number_jid?: string
    }
}

export type WaMexSupportMessageFeedbackSubmitResponse = {
    readonly xwa_wa_support_message_feedback_submit?: {
        readonly success?: boolean
        readonly error_code?: number
        readonly error_message?: string
    }
}

export type WaMexTransferCommunityOwnershipResponse = {
    readonly xwa2_group_update_users_role?: {
        readonly group_id?: string
        readonly lid_migration_state?: {
            readonly addressing_mode?: string
        }
    }
}

export type WaMexUpdateGroupPropertyResponse = {
    readonly xwa2_group_update_property?: {
        readonly id?: string
        readonly state?: string
    }
}

export type WaMexUpdateNewsletterResponse = {
    readonly xwa2_newsletter_update?: {
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
        readonly thread_metadata?: {
            readonly name?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly description?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly picture?: {
                readonly id?: string
                readonly type?: 'IMAGE' | 'PREVIEW'
                readonly direct_path?: string
            }
            readonly preview?: {
                readonly id?: string
                readonly type?: 'PREVIEW'
                readonly direct_path?: string
            }
            readonly invite?: string
            readonly handle?: string
            readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            readonly creation_time?: string
            readonly settings?: {
                readonly reaction_codes?: {
                    readonly value?: 'ALL'
                }
            }
        }
    }
}

export type WaMexUpdateNewsletterUserSettingResponse = {
    readonly xwa2_newsletter_update_user_setting?: {
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
    }
}

export type WaMexUpdateTextStatusResponse = {
    readonly xwa2_update_text_status?: {
        readonly result?: string
    }
}

export type WaMexUsernameAvailabilityResponse = {
    readonly xwa2_username_check?: {
        readonly result?: 'SUCCESS'
        readonly suggestions?: ReadonlyArray<string>
    }
}

export type WaMexUsyncResponse = {
    readonly xwa2_fetch_wa_users?: ReadonlyArray<{
        readonly __typename?: string
        readonly jid?: string
        readonly country_code?: string
        readonly username_info?: {
            readonly __typename?: string
            readonly username?: string
            readonly state?: string
            readonly timestamp?: string
            readonly pin?: string
            readonly status?: string
        }
        readonly about_status_info?: {
            readonly __typename?: string
            readonly text?: string
            readonly timestamp?: string
            readonly status?: string
        }
        readonly id?: string
    }>
}

export type WaMexWAAOnboardingResponse = {
    readonly create_or_onboard_wa_ad_account?: {
        readonly ad_account_id?: string
        readonly status?: string
    }
}

export type WaMexWaffleFXServiceDataQueryV2Response = {
    readonly waffle_fx_service_data?: {
        readonly services?: {
            readonly waffle_sxs?: ReadonlyArray<{
                readonly waffle_di?: string
                readonly waffle_da?: string
                readonly waffle_xss?: ReadonlyArray<{
                    readonly waffle_iaxe?: string
                    readonly waffle_x_surface?: string
                }>
            }>
            readonly waffle_afs?: {
                readonly waffle_wes?: string
            }
            readonly foa_to_wa_link_eligibility?: {
                readonly is_eligible_to_link_to_unlinked_fb?: boolean
                readonly is_eligible_to_link_to_linked_fb?: boolean
                readonly is_eligible_to_link_to_unlinked_ig?: boolean
                readonly is_eligible_to_link_to_linked_ig?: boolean
                readonly is_eligible_to_link_to_unlinked_rl?: boolean
                readonly is_eligible_to_link_to_linked_rl?: boolean
            }
        }
    }
}

export type WaMexWaffleFXWAMOUpdateUOOMResponse = {
    readonly xfb_waffle_fx_wamo_update_uoom?: boolean
}

export type WaMexWaffleXEResponse = {
    readonly waffle_xe_root?: {
        readonly purpose_public_keys?: {
            readonly purpose_public_ek?: string
            readonly purpose_public_ik?: string
            readonly purpose_public_ik_sig?: string
            readonly purpose_public_ik_enc_certificate?: string
            readonly purpose_dummy_ciphertext?: string
            readonly purpose_dummy_nonce?: string
        }
        readonly waffle_unique_ids?: string
        readonly waffle_d?: ReadonlyArray<{
            readonly waffle_xas?: {
                readonly waffle_xan?: string
                readonly waffle_xs?: string
            }
            readonly waffle_di?: string
        }>
        readonly waffle_xps?: ReadonlyArray<{
            readonly waffle_xas?: {
                readonly waffle_xan?: string
                readonly waffle_xs?: string
            }
            readonly waffle_hcbc?: string
        }>
    }
}

export type WaMexuseWAWebEstimatedDailyReachResponse = {
    readonly lwi?: {
        readonly budget_estimate_data_v2?: {
            readonly daily_outcomes_curve?: ReadonlyArray<{
                readonly actions?: number
                readonly actions_lower_bound?: number
                readonly actions_upper_bound?: number
                readonly bid?: number
                readonly impressions?: number
                readonly reach?: number
                readonly reach_lower_bound?: number
                readonly reach_upper_bound?: number
                readonly spend?: number
            }>
        }
    }
}

export interface WaMexOperationResponses {
    readonly ACSServerProviderConfig: WaMexACSServerProviderConfigResponse
    readonly ACSServerProviderIssuance: WaMexACSServerProviderIssuanceResponse
    readonly AcceptNewsletterAdminInvite: WaMexAcceptNewsletterAdminInviteResponse
    readonly AiAgentAutoReplyControl: WaMexAiAgentAutoReplyControlResponse
    readonly AuthAgentFeaturePolicy: WaMexAuthAgentFeaturePolicyResponse
    readonly BPAccessTokenAndSessionCookies: WaMexBPAccessTokenAndSessionCookiesResponse
    readonly BizCreateOrder: WaMexBizCreateOrderResponse
    readonly BizCustomUrlGetUserGraphql: WaMexBizCustomUrlGetUserGraphqlResponse
    readonly BizGetCategories: WaMexBizGetCategoriesResponse
    readonly BizGetCategoriesV2: WaMexBizGetCategoriesV2Response
    readonly BizGetCustomUrlUserGraphql: WaMexBizGetCustomUrlUserGraphqlResponse
    readonly BizGetMerchantCompliance: WaMexBizGetMerchantComplianceResponse
    readonly BizGetPriceTiers: WaMexBizGetPriceTiersResponse
    readonly BizGetProfileShimlinks: WaMexBizGetProfileShimlinksResponse
    readonly BizGraphQLRefreshCart: WaMexBizGraphQLRefreshCartResponse
    readonly BizProfileAddressAutocomplete: WaMexBizProfileAddressAutocompleteResponse
    readonly BizQueryOrder: WaMexBizQueryOrderResponse
    readonly BizSetMerchantCompliance: WaMexBizSetMerchantComplianceResponse
    readonly CachedToken: WaMexCachedTokenResponse
    readonly CanonicalUserValid: WaMexCanonicalUserValidResponse
    readonly ChangeNewsletterOwner: WaMexChangeNewsletterOwnerResponse
    readonly ConsumerFetchQuickPromotions: WaMexConsumerFetchQuickPromotionsResponse
    readonly ConsumerQuickPromotionActionGraphQL: WaMexConsumerQuickPromotionActionGraphQLResponse
    readonly CreateInviteCode: WaMexCreateInviteCodeResponse
    readonly CreateMarketingCampaignAction: WaMexCreateMarketingCampaignActionResponse
    readonly CreateNewsletter: WaMexCreateNewsletterResponse
    readonly CreateNewsletterAdminInvite: WaMexCreateNewsletterAdminInviteResponse
    readonly CreateReportAppeal: WaMexCreateReportAppealResponse
    readonly CreateWhatsAppAdsIdentity: WaMexCreateWhatsAppAdsIdentityResponse
    readonly CustomLabel3pdEvent: WaMexCustomLabel3pdEventResponse
    readonly DeleteNewsletter: WaMexDeleteNewsletterResponse
    readonly DemoteNewsletterAdmin: WaMexDemoteNewsletterAdminResponse
    readonly EditBizProfile: WaMexEditBizProfileResponse
    readonly ExternalCtxAuthoriseWAChat: WaMexExternalCtxAuthoriseWAChatResponse
    readonly FetchAboutStatus: WaMexFetchAboutStatusResponse
    readonly FetchAdEntryPointsConfiguration: WaMexFetchAdEntryPointsConfigurationResponse
    readonly FetchAdEntryPointsConfigurationM1: WaMexFetchAdEntryPointsConfigurationM1Response
    readonly FetchAllNewslettersMetadata: WaMexFetchAllNewslettersMetadataResponse
    readonly FetchAllSubgroups: WaMexFetchAllSubgroupsResponse
    readonly FetchBotProfilesGQL: WaMexFetchBotProfilesGQLResponse
    readonly FetchDynamicAIModes: WaMexFetchDynamicAIModesResponse
    readonly FetchGroupInfo: WaMexFetchGroupInfoResponse
    readonly FetchGroupInfoIncludBots: WaMexFetchGroupInfoIncludBotsResponse
    readonly FetchGroupInviteCode: WaMexFetchGroupInviteCodeResponse
    readonly FetchGroupIsInternal: WaMexFetchGroupIsInternalResponse
    readonly FetchIntegritySignals: WaMexFetchIntegritySignalsResponse
    readonly FetchNativeAdsMvpEligibility: WaMexFetchNativeAdsMvpEligibilityResponse
    readonly FetchNewChatMessageCappingInfo: WaMexFetchNewChatMessageCappingInfoResponse
    readonly FetchNewsletter: WaMexFetchNewsletterResponse
    readonly FetchNewsletterAdminCapabilities: WaMexFetchNewsletterAdminCapabilitiesResponse
    readonly FetchNewsletterAdminInfo: WaMexFetchNewsletterAdminInfoResponse
    readonly FetchNewsletterDehydrated: WaMexFetchNewsletterDehydratedResponse
    readonly FetchNewsletterDirectoryCategoriesPreview: WaMexFetchNewsletterDirectoryCategoriesPreviewResponse
    readonly FetchNewsletterDirectoryList: WaMexFetchNewsletterDirectoryListResponse
    readonly FetchNewsletterDirectorySearchResults: WaMexFetchNewsletterDirectorySearchResultsResponse
    readonly FetchNewsletterEnforcements: WaMexFetchNewsletterEnforcementsResponse
    readonly FetchNewsletterFollowers: WaMexFetchNewsletterFollowersResponse
    readonly FetchNewsletterInsights: WaMexFetchNewsletterInsightsResponse
    readonly FetchNewsletterIsDomainPreviewable: WaMexFetchNewsletterIsDomainPreviewableResponse
    readonly FetchNewsletterMessageReactionSenderList: WaMexFetchNewsletterMessageReactionSenderListResponse
    readonly FetchNewsletterPendingInvites: WaMexFetchNewsletterPendingInvitesResponse
    readonly FetchNewsletterPollVoters: WaMexFetchNewsletterPollVotersResponse
    readonly FetchNewsletterReports: WaMexFetchNewsletterReportsResponse
    readonly FetchOHAIKeyConfig: WaMexFetchOHAIKeyConfigResponse
    readonly FetchOIDCState: WaMexFetchOIDCStateResponse
    readonly FetchPlaintextLinkPreview: WaMexFetchPlaintextLinkPreviewResponse
    readonly FetchQuickPromotions: WaMexFetchQuickPromotionsResponse
    readonly FetchReachoutTimelock: WaMexFetchReachoutTimelockResponse
    readonly FetchRecommendedNewsletters: WaMexFetchRecommendedNewslettersResponse
    readonly FetchSimilarNewsletters: WaMexFetchSimilarNewslettersResponse
    readonly FetchSubgroupSuggestions: WaMexFetchSubgroupSuggestionsResponse
    readonly FetchSubscriptionEntryPoints: WaMexFetchSubscriptionEntryPointsResponse
    readonly FetchSubscriptions: WaMexFetchSubscriptionsResponse
    readonly FetchTextStatusList: WaMexFetchTextStatusListResponse
    readonly GetAccessTokenFromOIDCCode: WaMexGetAccessTokenFromOIDCCodeResponse
    readonly GetAccountNonce: WaMexGetAccountNonceResponse
    readonly GetDsbInfo: WaMexGetDsbInfoResponse
    readonly GetFBAccountPages: WaMexGetFBAccountPagesResponse
    readonly GetNumbersForBrandIds: WaMexGetNumbersForBrandIdsResponse
    readonly GetPrivacyLists: WaMexGetPrivacyListsResponse
    readonly GetPrivacySettings: WaMexGetPrivacySettingsResponse
    readonly GetUsername: WaMexGetUsernameResponse
    readonly GetWAAEligibility: WaMexGetWAAEligibilityResponse
    readonly GraphQLProductCatalogGetPublicKey: WaMexGraphQLProductCatalogGetPublicKeyResponse
    readonly GraphQLVerifyPostcode: WaMexGraphQLVerifyPostcodeResponse
    readonly GroupStoreInviteSms: WaMexGroupStoreInviteSmsResponse
    readonly GroupSuspensionAppeal: WaMexGroupSuspensionAppealResponse
    readonly IntegrityChallengeResponse: WaMexIntegrityChallengeResponseResponse
    readonly JoinNewsletter: WaMexJoinNewsletterResponse
    readonly LeaveNewsletter: WaMexLeaveNewsletterResponse
    readonly LidChangeNotification: WaMexLidChangeNotificationResponse
    readonly LogNewsletterExposures: WaMexLogNewsletterExposuresResponse
    readonly NativeMLModel: WaMexNativeMLModelResponse
    readonly NewsletterAddPaidPartnershipLabel: WaMexNewsletterAddPaidPartnershipLabelResponse
    readonly QueryCatalog: WaMexQueryCatalogResponse
    readonly QueryCatalogHasCategories: WaMexQueryCatalogHasCategoriesResponse
    readonly QueryCatalogProduct: WaMexQueryCatalogProductResponse
    readonly QueryProductCollections: WaMexQueryProductCollectionsResponse
    readonly QueryProductListCatalog: WaMexQueryProductListCatalogResponse
    readonly QueryProductSingleCollection: WaMexQueryProductSingleCollectionResponse
    readonly QuerySubgroupParticipantCount: WaMexQuerySubgroupParticipantCountResponse
    readonly QuickPromotionAction: WaMexQuickPromotionActionResponse
    readonly ReportProduct: WaMexReportProductResponse
    readonly RequestClientLogsForBug: WaMexRequestClientLogsForBugResponse
    readonly ResolveAccountTypeAndAdPage: WaMexResolveAccountTypeAndAdPageResponse
    readonly ResolveAccountTypeAndAdPageQuery: WaMexResolveAccountTypeAndAdPageQueryResponse
    readonly RevokeNewsletterAdminInvite: WaMexRevokeNewsletterAdminInviteResponse
    readonly SetUsername: WaMexSetUsernameResponse
    readonly SetUsernameKey: WaMexSetUsernameKeyResponse
    readonly SignupMetadata: WaMexSignupMetadataResponse
    readonly SupportBugReportSubmit: WaMexSupportBugReportSubmitResponse
    readonly SupportContactFormSubmit: WaMexSupportContactFormSubmitResponse
    readonly SupportMessageFeedbackSubmit: WaMexSupportMessageFeedbackSubmitResponse
    readonly TransferCommunityOwnership: WaMexTransferCommunityOwnershipResponse
    readonly UpdateGroupProperty: WaMexUpdateGroupPropertyResponse
    readonly UpdateNewsletter: WaMexUpdateNewsletterResponse
    readonly UpdateNewsletterUserSetting: WaMexUpdateNewsletterUserSettingResponse
    readonly UpdateTextStatus: WaMexUpdateTextStatusResponse
    readonly UsernameAvailability: WaMexUsernameAvailabilityResponse
    readonly Usync: WaMexUsyncResponse
    readonly WAAOnboarding: WaMexWAAOnboardingResponse
    readonly WaffleFXServiceDataQueryV2: WaMexWaffleFXServiceDataQueryV2Response
    readonly WaffleFXWAMOUpdateUOOM: WaMexWaffleFXWAMOUpdateUOOMResponse
    readonly WaffleXE: WaMexWaffleXEResponse
    readonly useWAWebEstimatedDailyReach: WaMexuseWAWebEstimatedDailyReachResponse
}
