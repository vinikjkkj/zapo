// AUTO-GENERATED — do not edit. Regenerated daily by wa-spec.
// WhatsApp Version: 2.3000.1040073745

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
    readonly project_name?: unknown
}

export type WaMexACSServerProviderIssuanceVariables = {
    readonly input?: {
        readonly project_name?: unknown
        readonly config_id?: unknown
        readonly issue_element?: unknown
        readonly request_proof?: unknown
    }
}

export type WaMexAcceptNewsletterAdminInviteVariables = {
    readonly newsletter_id?: unknown
}

export type WaMexAiAgentAutoReplyControlVariables = {
    readonly consumer_lid?: unknown
    readonly phone_number?: unknown
    readonly thread_status?: unknown
}

export type WaMexAuthAgentFeaturePolicyVariables = Readonly<Record<string, never>>

export type WaMexBPAccessTokenAndSessionCookiesVariables = {
    readonly application_id?: unknown
    readonly code?: unknown
}

export type WaMexBizCreateOrderVariables = {
    readonly input?: {
        readonly order?: {
            readonly jid?: unknown
            readonly products?: unknown
        }
    }
}

export type WaMexBizCustomUrlGetUserGraphqlVariables = {
    readonly data?: {
        readonly custom_url?: {
            readonly path?: unknown
        }
    }
}

export type WaMexBizGetCategoriesVariables = {
    readonly query_params?: {
        readonly query?: unknown
        readonly locale?: unknown
        readonly operation?: unknown
        readonly version?: unknown
    }
}

export type WaMexBizGetCategoriesV2Variables = {
    readonly query_params?: {
        readonly query?: unknown
        readonly locale?: unknown
        readonly operation?: unknown
        readonly version?: unknown
    }
}

export type WaMexBizGetCustomUrlUserGraphqlVariables = {
    readonly data?: {
        readonly custom_url?: {
            readonly path?: unknown
        }
    }
}

export type WaMexBizGetMerchantComplianceVariables = {
    readonly request?: unknown
}

export type WaMexBizGetPriceTiersVariables = {
    readonly request?: {
        readonly locale?: unknown
    }
}

export type WaMexBizGetProfileShimlinksVariables = {
    readonly bizJid?: unknown
}

export type WaMexBizGraphQLRefreshCartVariables = {
    readonly request?: unknown
}

export type WaMexBizProfileAddressAutocompleteVariables = {
    readonly input?: {
        readonly center?: unknown
        readonly query?: unknown
        readonly use_case_id?: unknown
    }
}

export type WaMexBizQueryOrderVariables = {
    readonly request?: {
        readonly order?: {
            readonly jid?: unknown
            readonly token?: {
                readonly sensitive_string_value?: unknown
            }
            readonly id?: unknown
            readonly image_dimensions?: {
                readonly height?: unknown
                readonly width?: unknown
            }
            readonly direct_connection_encrypted_info?: unknown
        }
    }
}

export type WaMexBizSetMerchantComplianceVariables = {
    readonly input?: unknown
}

export type WaMexCachedTokenVariables = {
    readonly input?: {
        readonly client_pub_key?: unknown
        readonly request_id?: unknown
    }
}

export type WaMexCanonicalUserValidVariables = Readonly<Record<string, never>>

export type WaMexChangeNewsletterOwnerVariables = {
    readonly newsletter_id?: unknown
    readonly user_id?: unknown
}

export type WaMexConsumerFetchQuickPromotionsVariables = {
    readonly nux_ids?: unknown
    readonly trigger_context?: {
        readonly wa_smb_trigger_context?: {
            readonly is_from_wa_smb?: unknown
            readonly app_version?: unknown
            readonly country?: unknown
            readonly locale?: unknown
        }
    }
}

export type WaMexConsumerQuickPromotionActionGraphQLVariables = {
    readonly input?: unknown
}

export type WaMexCreateInviteCodeVariables = {
    readonly input?: {
        readonly receiver?: unknown
        readonly entry_point?: unknown
        readonly server_send_sms?: unknown
    }
}

export type WaMexCreateMarketingCampaignActionVariables = {
    readonly input?: unknown
}

export type WaMexCreateNewsletterVariables = {
    readonly input?: {
        readonly name?: unknown
        readonly description?: unknown
        readonly picture?: unknown
    }
}

export type WaMexCreateNewsletterAdminInviteVariables = {
    readonly newsletter_id?: unknown
    readonly user_id?: unknown
}

export type WaMexCreateReportAppealVariables = {
    readonly reason?: unknown
    readonly report_id?: unknown
}

export type WaMexCreateWhatsAppAdsIdentityVariables = {
    readonly code?: {
        readonly sensitive_string_value?: unknown
    }
    readonly phone_number?: {
        readonly sensitive_string_value?: unknown
    }
}

export type WaMexCustomLabel3pdEventVariables = {
    readonly custom_labels?: unknown
    readonly expt_group?: unknown
}

export type WaMexDeleteNewsletterVariables = {
    readonly newsletter_id?: unknown
}

export type WaMexDemoteNewsletterAdminVariables = {
    readonly newsletter_id?: unknown
    readonly user_id?: unknown
}

export type WaMexEditBizProfileVariables = {
    readonly input?: unknown
    readonly lid?: unknown
}

export type WaMexExternalCtxAuthoriseWAChatVariables = {
    readonly input?: unknown
}

export type WaMexFetchAboutStatusVariables = {
    readonly user?: {
        readonly user_id?: unknown
    }
}

export type WaMexFetchAdEntryPointsConfigurationVariables = Readonly<Record<string, never>>

export type WaMexFetchAdEntryPointsConfigurationM1Variables = Readonly<Record<string, never>>

export type WaMexFetchAllNewslettersMetadataVariables = {
    readonly fetch_status_metadata?: unknown
    readonly fetch_wamo_sub?: unknown
}

export type WaMexFetchAllSubgroupsVariables = {
    readonly group_id?: unknown
    readonly query_context?: unknown
    readonly sub_group_hint_id?: unknown
}

export type WaMexFetchBotProfilesGQLVariables = {
    readonly ids?: unknown
}

export type WaMexFetchDynamicAIModesVariables = Readonly<Record<string, never>>

export type WaMexFetchGroupInfoVariables = {
    readonly id?: unknown
    readonly include_username?: unknown
    readonly participants_phash?: unknown
    readonly query_context?: unknown
}

export type WaMexFetchGroupInfoIncludBotsVariables = {
    readonly id?: unknown
    readonly include_username?: unknown
    readonly participants_phash?: unknown
    readonly query_context?: unknown
}

export type WaMexFetchGroupInviteCodeVariables = {
    readonly id?: unknown
    readonly query_context?: unknown
}

export type WaMexFetchGroupIsInternalVariables = {
    readonly id?: unknown
}

export type WaMexFetchIntegritySignalsVariables = {
    readonly input?: {
        readonly query_input?: ReadonlyArray<{
            readonly jid?: unknown
            readonly integrity_signals?: {
                readonly use_case?: unknown
            }
        }>
        readonly telemetry?: {
            readonly context?: unknown
        }
    }
}

export type WaMexFetchNativeAdsMvpEligibilityVariables = {
    readonly phone_number?: unknown
}

export type WaMexFetchNewChatMessageCappingInfoVariables = {
    readonly input?: {
        readonly type?: unknown
    }
}

export type WaMexFetchNewsletterVariables = {
    readonly fetch_creation_time?: unknown
    readonly fetch_full_image?: unknown
    readonly fetch_status_metadata?: unknown
    readonly fetch_viewer_metadata?: unknown
    readonly fetch_wamo_sub?: unknown
    readonly input?: {
        readonly key?: unknown
        readonly type?: unknown
        readonly view_role?: unknown
    }
}

export type WaMexFetchNewsletterAdminCapabilitiesVariables = {
    readonly newsletter_id?: unknown
}

export type WaMexFetchNewsletterAdminInfoVariables = {
    readonly newsletter_id?: unknown
}

export type WaMexFetchNewsletterDehydratedVariables = {
    readonly fetch_wamo_sub?: unknown
    readonly input?: {
        readonly key?: unknown
        readonly type?: unknown
        readonly view_role?: unknown
    }
}

export type WaMexFetchNewsletterDirectoryCategoriesPreviewVariables = {
    readonly fetch_status_metadata?: unknown
    readonly input?: {
        readonly categories?: unknown
        readonly country_code?: unknown
        readonly per_category_limit?: unknown
    }
}

export type WaMexFetchNewsletterDirectoryListVariables = {
    readonly fetch_status_metadata?: unknown
    readonly input?: {
        readonly view?: unknown
        readonly filters?: {
            readonly country_codes?: unknown
            readonly categories?: unknown
        }
        readonly limit?: unknown
        readonly start_cursor?: unknown
    }
}

export type WaMexFetchNewsletterDirectorySearchResultsVariables = {
    readonly fetch_status_metadata?: unknown
    readonly input?: {
        readonly search_text?: unknown
        readonly categories?: unknown
        readonly limit?: unknown
        readonly start_cursor?: unknown
    }
}

export type WaMexFetchNewsletterEnforcementsVariables = {
    readonly locale?: unknown
    readonly newsletter_id?: unknown
}

export type WaMexFetchNewsletterFollowersVariables = {
    readonly input?: {
        readonly newsletter_id?: unknown
        readonly count?: unknown
    }
}

export type WaMexFetchNewsletterInsightsVariables = {
    readonly input?: {
        readonly newsletter_id?: unknown
        readonly metrics?: unknown
    }
}

export type WaMexFetchNewsletterIsDomainPreviewableVariables = {
    readonly url_domains?: unknown
}

export type WaMexFetchNewsletterMessageReactionSenderListVariables = {
    readonly input?: {
        readonly id?: unknown
        readonly server_id?: unknown
    }
}

export type WaMexFetchNewsletterPendingInvitesVariables = {
    readonly newsletter_id?: unknown
}

export type WaMexFetchNewsletterPollVotersVariables = {
    readonly input?: {
        readonly limit?: unknown
        readonly server_id?: unknown
        readonly newsletter_id?: unknown
        readonly vote_hash?: unknown
    }
}

export type WaMexFetchNewsletterReportsVariables = Readonly<Record<string, never>>

export type WaMexFetchOHAIKeyConfigVariables = Readonly<Record<string, never>>

export type WaMexFetchOIDCStateVariables = Readonly<Record<string, never>>

export type WaMexFetchPlaintextLinkPreviewVariables = {
    readonly input?: {
        readonly url?: unknown
    }
}

export type WaMexFetchQuickPromotionsVariables = {
    readonly nux_ids?: unknown
    readonly trigger_context?: {
        readonly wa_smb_trigger_context?: {
            readonly is_from_wa_smb?: unknown
            readonly app_version?: unknown
            readonly country?: unknown
            readonly locale?: unknown
        }
    }
}

export type WaMexFetchReachoutTimelockVariables = Readonly<Record<string, never>>

export type WaMexFetchRecommendedNewslettersVariables = {
    readonly fetch_status_metadata?: unknown
    readonly input?: {
        readonly limit?: unknown
        readonly country_codes?: unknown
    }
}

export type WaMexFetchSimilarNewslettersVariables = {
    readonly fetch_status_metadata?: unknown
    readonly input?: {
        readonly newsletter_id?: unknown
        readonly limit?: unknown
        readonly country_codes?: unknown
    }
}

export type WaMexFetchSubgroupSuggestionsVariables = {
    readonly group_id?: unknown
    readonly query_context?: unknown
    readonly sub_group_hint_id?: unknown
}

export type WaMexFetchSubscriptionEntryPointsVariables = Readonly<Record<string, never>>

export type WaMexFetchSubscriptionsVariables = {
    readonly data?: {
        readonly platform?: unknown
    }
}

export type WaMexFetchTextStatusListVariables = {
    readonly input?: unknown
}

export type WaMexGetAccessTokenFromOIDCCodeVariables = {
    readonly code?: unknown
    readonly state?: unknown
}

export type WaMexGetAccountNonceVariables = {
    readonly input?: {
        readonly identifier?: {
            readonly scope?: unknown
        }
    }
}

export type WaMexGetDsbInfoVariables = {
    readonly input?: {
        readonly entity_id?: unknown
    }
}

export type WaMexGetFBAccountPagesVariables = {
    readonly userId?: unknown
}

export type WaMexGetNumbersForBrandIdsVariables = {
    readonly input?: {
        readonly brand_ids?: unknown
        readonly lid_based_response?: unknown
    }
}

export type WaMexGetPrivacyListsVariables = {
    readonly input?: {
        readonly query_input?: ReadonlyArray<{
            readonly jid?: unknown
            readonly privacy_contact_list_type?: {
                readonly dhash?: unknown
                readonly category?: unknown
                readonly type?: unknown
            }
        }>
    }
}

export type WaMexGetPrivacySettingsVariables = {
    readonly input?: {
        readonly query_input?: ReadonlyArray<{
            readonly jid?: unknown
            readonly privacy_features?: unknown
        }>
    }
}

export type WaMexGetUsernameVariables = Readonly<Record<string, never>>

export type WaMexGetWAAEligibilityVariables = {
    readonly input?: {
        readonly flow_id?: unknown
        readonly request_id?: unknown
    }
}

export type WaMexGraphQLProductCatalogGetPublicKeyVariables = {
    readonly request?: {
        readonly public_key?: {
            readonly biz_jid?: unknown
        }
    }
}

export type WaMexGraphQLVerifyPostcodeVariables = {
    readonly request?: {
        readonly verify_postcode?: {
            readonly biz_jid?: unknown
            readonly direct_connection_encrypted_info?: unknown
        }
    }
}

export type WaMexGroupStoreInviteSmsVariables = {
    readonly input?: {
        readonly partcipants?: unknown
        readonly group_jid?: unknown
    }
}

export type WaMexGroupSuspensionAppealVariables = {
    readonly input?: {
        readonly group_jid?: unknown
        readonly appeal_reason?: unknown
        readonly debug_info?: unknown
    }
}

export type WaMexIntegrityChallengeResponseVariables = {
    readonly input?: {
        readonly challenge_type?: unknown
        readonly passkey_response?: {
            readonly signed_challenge?: unknown
            readonly prf_available?: unknown
        }
    }
}

export type WaMexJoinNewsletterVariables = {
    readonly newsletter_id?: unknown
}

export type WaMexLeaveNewsletterVariables = {
    readonly newsletter_id?: unknown
}

export type WaMexLidChangeNotificationVariables = Readonly<Record<string, never>>

export type WaMexLogNewsletterExposuresVariables = {
    readonly input?: {
        readonly exposures?: unknown
    }
}

export type WaMexNativeMLModelVariables = {
    readonly client_capability_metadata?: unknown
    readonly model_request_metadatas?: unknown
}

export type WaMexNewsletterAddPaidPartnershipLabelVariables = {
    readonly message_type?: unknown
    readonly newsletter_id?: unknown
    readonly server_id?: unknown
}

export type WaMexQueryCatalogVariables = {
    readonly request?: {
        readonly product_catalog?: {
            readonly jid?: unknown
            readonly allow_shop_source?: unknown
            readonly width?: unknown
            readonly height?: unknown
            readonly direct_connection_encrypted_info?: unknown
            readonly limit?: unknown
            readonly after?: unknown
            readonly catalog_session_id?: unknown
            readonly variant_info_fields?: unknown
            readonly variant_thumbnail_height?: unknown
            readonly variant_thumbnail_width?: unknown
        }
    }
}

export type WaMexQueryCatalogHasCategoriesVariables = {
    readonly request?: {
        readonly categories?: {
            readonly biz_jid?: unknown
            readonly direct_connection_encrypted_info?: unknown
            readonly image_dimensions?: unknown
            readonly catalog_session_id?: unknown
        }
    }
}

export type WaMexQueryCatalogProductVariables = {
    readonly request?: {
        readonly product?: {
            readonly jid?: unknown
            readonly product_id?: unknown
            readonly width?: unknown
            readonly height?: unknown
            readonly fetch_compliance_info?: unknown
            readonly direct_connection_encrypted_info?: unknown
            readonly variant_info_fields?: unknown
            readonly variant_thumbnail_height?: unknown
            readonly variant_thumbnail_width?: unknown
        }
    }
}

export type WaMexQueryProductCollectionsVariables = {
    readonly request?: {
        readonly collections?: {
            readonly biz_jid?: unknown
            readonly collection_limit?: unknown
            readonly item_limit?: unknown
            readonly after?: unknown
            readonly width?: unknown
            readonly height?: unknown
            readonly direct_connection_encrypted_info?: unknown
            readonly variant_info_fields?: unknown
            readonly variant_thumbnail_height?: unknown
            readonly variant_thumbnail_width?: unknown
        }
    }
}

export type WaMexQueryProductListCatalogVariables = {
    readonly request?: {
        readonly product_list?: {
            readonly jid?: unknown
            readonly products?: unknown
            readonly width?: unknown
            readonly height?: unknown
            readonly direct_connection_encrypted_info?: unknown
        }
    }
}

export type WaMexQueryProductSingleCollectionVariables = {
    readonly request?: {
        readonly collection?: {
            readonly biz_jid?: unknown
            readonly id?: unknown
            readonly limit?: unknown
            readonly after?: unknown
            readonly width?: unknown
            readonly height?: unknown
            readonly direct_connection_encrypted_info?: unknown
            readonly variant_info_fields?: unknown
            readonly variant_thumbnail_height?: unknown
            readonly variant_thumbnail_width?: unknown
        }
    }
}

export type WaMexQuerySubgroupParticipantCountVariables = {
    readonly input?: {
        readonly group_jid?: unknown
        readonly query_context?: unknown
        readonly sub_group_jid_hint?: unknown
    }
}

export type WaMexQuickPromotionActionVariables = {
    readonly input?: unknown
}

export type WaMexReportProductVariables = {
    readonly input?: {
        readonly jid?: unknown
        readonly product_id?: unknown
    }
}

export type WaMexRequestClientLogsForBugVariables = {
    readonly input?: {
        readonly bug_id?: unknown
        readonly participant_ids?: unknown
        readonly reporter_id?: unknown
        readonly up_to_timestamp_secs?: unknown
    }
}

export type WaMexResolveAccountTypeAndAdPageVariables = {
    readonly pageId?: unknown
}

export type WaMexResolveAccountTypeAndAdPageQueryVariables = {
    readonly pageId?: unknown
}

export type WaMexRevokeNewsletterAdminInviteVariables = {
    readonly newsletter_id?: unknown
    readonly user_id?: unknown
}

export type WaMexSetUsernameVariables = {
    readonly input?: unknown
    readonly reserved?: unknown
    readonly session_id?: unknown
    readonly source?: unknown
}

export type WaMexSetUsernameKeyVariables = {
    readonly pin?: unknown
}

export type WaMexSignupMetadataVariables = {
    readonly phone_number?: unknown
    readonly signup_id?: unknown
}

export type WaMexSupportBugReportSubmitVariables = {
    readonly input?: unknown
}

export type WaMexSupportContactFormSubmitVariables = {
    readonly input?: unknown
}

export type WaMexSupportMessageFeedbackSubmitVariables = {
    readonly input?: unknown
}

export type WaMexTransferCommunityOwnershipVariables = {
    readonly input?: unknown
}

export type WaMexUpdateGroupPropertyVariables = {
    readonly group_id?: unknown
    readonly update?: unknown
}

export type WaMexUpdateNewsletterVariables = {
    readonly newsletter_id?: unknown
    readonly updates?: {
        readonly name?: unknown
        readonly description?: unknown
        readonly picture?: unknown
        readonly settings?: unknown
    }
}

export type WaMexUpdateNewsletterUserSettingVariables = {
    readonly input?: unknown
}

export type WaMexUpdateTextStatusVariables = {
    readonly input?: unknown
}

export type WaMexUsernameAvailabilityVariables = {
    readonly input?: unknown
    readonly session_id?: unknown
    readonly source?: unknown
}

export type WaMexUsyncVariables = {
    readonly include_about_status?: unknown
    readonly include_country_code?: unknown
    readonly include_username?: unknown
    readonly input?: {
        readonly query_input?: unknown
        readonly telemetry?: unknown
    }
}

export type WaMexWAAOnboardingVariables = {
    readonly input?: {
        readonly flow_id?: unknown
        readonly request_id?: unknown
    }
}

export type WaMexWaffleFXServiceDataQueryV2Variables = Readonly<Record<string, never>>

export type WaMexWaffleFXWAMOUpdateUOOMVariables = Readonly<Record<string, never>>

export type WaMexWaffleXEVariables = {
    readonly input?: unknown
}

export type WaMexuseWAWebEstimatedDailyReachVariables = {
    readonly audienceOptionAudience?: unknown
    readonly configuredPlacementSpec?: unknown
    readonly currency?: unknown
    readonly flow?: unknown
    readonly flowID?: unknown
    readonly legacyAdAccountID?: unknown
    readonly optimizationGoalInput?: unknown
    readonly postID?: unknown
    readonly targetingSpecAudience?: unknown
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
        readonly cipher_suite?: unknown
        readonly expire_time?: unknown
        readonly id?: unknown
        readonly max_evals?: unknown
        readonly public_key?: unknown
        readonly redemption_limit?: unknown
        readonly token_ttl?: unknown
    }
}

export type WaMexACSServerProviderIssuanceResponse = {
    readonly xwa_wa_acs_issue_credentials?: {
        readonly success?: unknown
        readonly creds?: {
            readonly evaluation?: {
                readonly data?: unknown
            }
            readonly proof?: {
                readonly c?: unknown
                readonly s?: unknown
            }
        }
        readonly error_message?: unknown
    }
}

export type WaMexAcceptNewsletterAdminInviteResponse = {
    readonly xwa2_newsletter_admin_invite_accept?: {
        readonly __typename?: unknown
        readonly id?: unknown
    }
}

export type WaMexAiAgentAutoReplyControlResponse = {
    readonly xfb_whatsapp_smb_maiba_status_update?: {
        readonly success?: unknown
    }
}

export type WaMexAuthAgentFeaturePolicyResponse = {
    readonly whatsapp_authorized_agent_feature_policy?: {
        readonly disabled_features?: unknown
    }
}

export type WaMexBPAccessTokenAndSessionCookiesResponse = {
    readonly xwa_bp_access_token_and_session_cookies?: {
        readonly status?: unknown
        readonly access_token?: unknown
        readonly session_cookies?: unknown
        readonly bp_id?: unknown
        readonly access_token_type?: unknown
        readonly email_attr?: unknown
    }
}

export type WaMexBizCreateOrderResponse = {
    readonly xwa_checkout_place_order?: {
        readonly order?: {
            readonly order_id?: unknown
            readonly token?: unknown
            readonly price?: {
                readonly currency?: unknown
                readonly subtotal_amount?: unknown
                readonly total_amount?: unknown
                readonly price_status?: unknown
            }
        }
    }
}

export type WaMexBizCustomUrlGetUserGraphqlResponse = {
    readonly xwa_custom_url_get_user?: {
        readonly success?: unknown
        readonly lid?: unknown
        readonly error_code?: unknown
        readonly error_text?: unknown
    }
}

export type WaMexBizGetCategoriesResponse = {
    readonly whatsapp_catkit_typeahead_proxy?: {
        readonly categories?: {
            readonly id?: unknown
            readonly display_name?: unknown
        }
        readonly not_a_biz?: {
            readonly id?: unknown
            readonly display_name?: unknown
        }
    }
}

export type WaMexBizGetCategoriesV2Response = {
    readonly whatsapp_catkit_typeahead_proxy?: {
        readonly categories?: {
            readonly id?: unknown
            readonly display_name?: unknown
            readonly categories?: {
                readonly id?: unknown
                readonly display_name?: unknown
                readonly categories?: {
                    readonly id?: unknown
                    readonly display_name?: unknown
                }
            }
        }
        readonly not_a_biz?: {
            readonly id?: unknown
            readonly display_name?: unknown
        }
    }
}

export type WaMexBizGetCustomUrlUserGraphqlResponse = {
    readonly xwa_custom_url_get_user?: {
        readonly success?: unknown
        readonly user?: {
            readonly jid?: unknown
        }
        readonly error_code?: unknown
        readonly error_text?: unknown
    }
}

export type WaMexBizGetMerchantComplianceResponse = {
    readonly xfb_whatsapp_biz_merchant_compliance_info?: {
        readonly merchant_info?: {
            readonly entity_name?: unknown
            readonly entity_type?: unknown
            readonly is_registered?: unknown
            readonly entity_type_custom?: unknown
            readonly customer_care_details?: {
                readonly email?: unknown
                readonly landline_number?: unknown
                readonly mobile_number?: unknown
            }
            readonly grievance_officer_details?: {
                readonly name?: unknown
                readonly email?: unknown
                readonly landline_number?: unknown
                readonly mobile_number?: unknown
            }
        }
    }
}

export type WaMexBizGetPriceTiersResponse = {
    readonly xwa_whatsapp_get_pricing_tiers?: {
        readonly price_tiers?: {
            readonly id?: unknown
            readonly description?: unknown
            readonly symbol?: unknown
        }
    }
}

export type WaMexBizGetProfileShimlinksResponse = {
    readonly xwa_whatsapp_smb_get_profile_linkshims?: {
        readonly website?: unknown
        readonly shimmed_website_url?: unknown
    }
}

export type WaMexBizGraphQLRefreshCartResponse = {
    readonly xwa_checkout_refresh_cart?: {
        readonly cart?: {
            readonly products?: {
                readonly is_hidden?: unknown
                readonly availability?: unknown
                readonly product_availability?: unknown
                readonly status_info?: {
                    readonly reject_reason?: unknown
                    readonly status?: unknown
                    readonly can_appeal?: unknown
                    readonly commerce_url?: unknown
                }
                readonly image_fetch_status?: unknown
                readonly price?: unknown
                readonly currency?: unknown
                readonly retailer_id?: unknown
                readonly name?: unknown
                readonly description?: unknown
                readonly url?: unknown
                readonly id?: unknown
                readonly media?: {
                    readonly images?: {
                        readonly id?: unknown
                        readonly request_image_url?: unknown
                        readonly original_dimensions?: {
                            readonly height?: unknown
                            readonly width?: unknown
                        }
                    }
                    readonly videos?: {
                        readonly thumbnail_url?: unknown
                        readonly original_video_url?: unknown
                        readonly id?: unknown
                    }
                }
                readonly sale_price?: {
                    readonly price?: unknown
                    readonly start_date?: unknown
                    readonly end_date?: unknown
                }
                readonly max_available?: unknown
                readonly belongs_to?: unknown
                readonly status?: unknown
                readonly compliance_category?: unknown
                readonly compliance_info?: {
                    readonly country_code_origin?: unknown
                    readonly importer_name?: unknown
                    readonly importer_address?: {
                        readonly street1?: unknown
                        readonly street2?: unknown
                        readonly city?: unknown
                        readonly region?: unknown
                        readonly postal_code?: unknown
                        readonly country_code?: unknown
                    }
                }
                readonly variant_info?: {
                    readonly types?: {
                        readonly name?: unknown
                        readonly options?: {
                            readonly value?: unknown
                            readonly thumbnail_media?: {
                                readonly original_dimensions?: {
                                    readonly width?: unknown
                                    readonly height?: unknown
                                }
                                readonly request_image_url?: unknown
                                readonly original_image_url?: unknown
                                readonly id?: unknown
                            }
                        }
                    }
                    readonly listing_details?: {
                        readonly description?: unknown
                        readonly multi_price?: unknown
                        readonly lowest_price?: unknown
                    }
                    readonly variant_properties?: {
                        readonly value?: unknown
                        readonly name?: unknown
                    }
                    readonly availability?: {
                        readonly listing?: {
                            readonly is_available?: unknown
                            readonly product_id?: unknown
                            readonly options?: {
                                readonly name?: unknown
                                readonly value?: unknown
                            }
                        }
                    }
                }
            }
            readonly price_details?: {
                readonly total_amount?: unknown
                readonly subtotal_amount?: unknown
                readonly currency?: unknown
                readonly price_status?: unknown
            }
        }
    }
}

export type WaMexBizProfileAddressAutocompleteResponse = {
    readonly whatsapp_maps_typeahead?: {
        readonly items?: {
            readonly id?: unknown
            readonly location?: {
                readonly latitude?: unknown
                readonly longitude?: unknown
            }
            readonly address?: {
                readonly city?: unknown
                readonly country?: unknown
                readonly postalcode?: unknown
                readonly stateprovince?: unknown
                readonly streetaddress?: unknown
            }
            readonly title?: unknown
        }
    }
}

export type WaMexBizQueryOrderResponse = {
    readonly xwa_checkout_get_order_info?: {
        readonly order?: {
            readonly creation_time_stamp?: unknown
            readonly products?: {
                readonly id?: unknown
                readonly name?: unknown
                readonly price?: unknown
                readonly currency?: unknown
                readonly variant_info?: {
                    readonly variant_properties?: {
                        readonly name?: unknown
                        readonly value?: unknown
                    }
                }
                readonly media?: {
                    readonly images?: {
                        readonly id?: unknown
                        readonly request_image_url?: unknown
                    }
                }
                readonly quantity?: unknown
            }
            readonly price_details?: {
                readonly subtotal_amount?: unknown
                readonly currency?: unknown
                readonly total_amount?: unknown
            }
        }
    }
}

export type WaMexBizSetMerchantComplianceResponse = {
    readonly xfb_whatsapp_biz_merchant_set_compliance_info?: {
        readonly __typename?: unknown
        readonly merchant_info?: {
            readonly entity_name?: unknown
            readonly entity_type?: unknown
            readonly is_registered?: unknown
            readonly entity_type_custom?: unknown
            readonly customer_care_details?: {
                readonly email?: unknown
                readonly landline_number?: unknown
                readonly mobile_number?: unknown
            }
            readonly grievance_officer_details?: {
                readonly name?: unknown
                readonly email?: unknown
                readonly landline_number?: unknown
                readonly mobile_number?: unknown
            }
        }
    }
}

export type WaMexCachedTokenResponse = {
    readonly xwa2_ent_trade_canonical_nonce_for_access_tokens?: {
        readonly encrypted_access_tokens?: {
            readonly key?: unknown
            readonly data?: unknown
            readonly tag?: unknown
            readonly nonce?: unknown
            readonly algorithm?: unknown
        }
    }
}

export type WaMexCanonicalUserValidResponse = {
    readonly xwa_canonical_user_valid?: {
        readonly success?: unknown
    }
}

export type WaMexChangeNewsletterOwnerResponse = {
    readonly xwa2_newsletter_change_owner?: {
        readonly __typename?: unknown
        readonly id?: unknown
    }
}

export type WaMexConsumerFetchQuickPromotionsResponse = {
    readonly quick_promotion_multiverse_batch_fetch_root?: {
        readonly surface_nux_id?: unknown
        readonly eligible_promotions?: {
            readonly edges?: {
                readonly client_ttl_seconds?: unknown
                readonly priority?: unknown
                readonly is_holdout?: unknown
                readonly log_eligibility_waterfall?: unknown
                readonly time_range?: {
                    readonly start?: unknown
                    readonly end?: unknown
                }
                readonly node?: {
                    readonly __typename?: unknown
                    readonly promotion_id?: unknown
                    readonly is_server_force_pass?: unknown
                    readonly ab_prop_name?: unknown
                    readonly max_impressions?: unknown
                    readonly surface_delay_in_seconds?: unknown
                    readonly encrypted_logging_data?: unknown
                    readonly client_side_dry_run?: unknown
                    readonly creatives?: {
                        readonly __typename?: unknown
                        readonly title?: {
                            readonly text?: unknown
                        }
                        readonly content?: {
                            readonly text?: unknown
                        }
                        readonly primary_action?: {
                            readonly __typename?: unknown
                            readonly title?: {
                                readonly text?: unknown
                            }
                            readonly limit?: unknown
                            readonly url?: unknown
                        }
                        readonly dismiss_action?: {
                            readonly __typename?: unknown
                            readonly limit?: unknown
                        }
                        readonly wa_light_mode_media_details?: {
                            readonly jpeg_thumbnail?: unknown
                        }
                        readonly wa_dark_mode_media_details?: {
                            readonly jpeg_thumbnail?: unknown
                        }
                        readonly accessibility_text_for_image?: unknown
                        readonly is_dismissible?: unknown
                        readonly id?: unknown
                    }
                    readonly content_attributes?: {
                        readonly wa_banner_background_color?: {
                            readonly light_mode_highlight_color?: unknown
                            readonly dark_mode_highlight_color?: unknown
                            readonly light_mode_background_color?: unknown
                            readonly dark_mode_background_color?: unknown
                        }
                        readonly wa_primary_cta_alternative_url?: unknown
                        readonly wa_eligible_duration_after_impression_in_seconds?: unknown
                    }
                    readonly wa_qp_content_attributes_do_not_use?: {
                        readonly name?: unknown
                        readonly value?: unknown
                    }
                    readonly contextual_filters_for_wa_do_not_use?: {
                        readonly clause_type?: unknown
                        readonly filters?: Readonly<Record<string, unknown>>
                        readonly clauses?: {
                            readonly clause_type?: unknown
                            readonly filters?: Readonly<Record<string, unknown>>
                            readonly clauses?: {
                                readonly clause_type?: unknown
                                readonly filters?: Readonly<Record<string, unknown>>
                                readonly clauses?: {
                                    readonly clause_type?: unknown
                                    readonly filters?: Readonly<Record<string, unknown>>
                                    readonly clauses?: {
                                        readonly clause_type?: unknown
                                        readonly filters?: Readonly<Record<string, unknown>>
                                        readonly clauses?: {
                                            readonly clause_type?: unknown
                                            readonly filters?: Readonly<Record<string, unknown>>
                                            readonly clauses?: {
                                                readonly clause_type?: unknown
                                                readonly filters?: Readonly<Record<string, unknown>>
                                                readonly clauses?: {
                                                    readonly clause_type?: unknown
                                                    readonly filters?: Readonly<Record<string, unknown>>
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    readonly id?: unknown
                }
            }
        }
    }
}

export type WaMexConsumerQuickPromotionActionGraphQLResponse = {
    readonly wa_consumer_quick_promotion_log_event?: {
        readonly client_mutation_id?: unknown
    }
}

export type WaMexCreateInviteCodeResponse = {
    readonly xwa2_growth_create_invite_code?: {
        readonly code?: unknown
    }
}

export type WaMexCreateMarketingCampaignActionResponse = {
    readonly whatsapp_marketing_messages_create?: {
        readonly ad_campaign_group_id?: unknown
        readonly ad_campaign_id?: unknown
        readonly ad_group_id?: unknown
        readonly ad_id?: unknown
        readonly ad_creative_id?: unknown
        readonly campaign_name?: unknown
        readonly status?: unknown
        readonly lifetime_budget?: unknown
        readonly start_time?: unknown
    }
}

export type WaMexCreateNewsletterResponse = {
    readonly xwa2_newsletter_create?: {
        readonly id?: unknown
        readonly state?: {
            readonly type?: unknown
        }
        readonly thread_metadata?: {
            readonly name?: {
                readonly id?: unknown
                readonly text?: unknown
                readonly update_time?: unknown
            }
            readonly description?: {
                readonly id?: unknown
                readonly text?: unknown
                readonly update_time?: unknown
            }
            readonly picture?: {
                readonly id?: unknown
                readonly type?: unknown
                readonly direct_path?: unknown
            }
            readonly preview?: {
                readonly id?: unknown
                readonly type?: unknown
                readonly direct_path?: unknown
            }
            readonly invite?: unknown
            readonly handle?: unknown
            readonly verification?: unknown
            readonly subscribers_count?: unknown
            readonly creation_time?: unknown
        }
        readonly viewer_metadata?: {
            readonly settings?: {
                readonly type?: unknown
                readonly value?: unknown
            }
            readonly role?: unknown
        }
    }
}

export type WaMexCreateNewsletterAdminInviteResponse = {
    readonly xwa2_newsletter_admin_invite_create?: {
        readonly invite_expiration_time?: unknown
        readonly id?: unknown
    }
}

export type WaMexCreateReportAppealResponse = {
    readonly xwa2_create_channel_report_appeal_v2?: {
        readonly report_id?: unknown
        readonly status?: unknown
        readonly creation_time?: unknown
        readonly last_update_time?: unknown
        readonly channel_name?: unknown
        readonly channel_jid?: unknown
        readonly reported_content_data?: {
            readonly __typename?: unknown
            readonly server_msg_id?: unknown
            readonly server_id?: unknown
            readonly server_response_id?: unknown
            readonly notify_name?: unknown
            readonly question_data?: {
                readonly __typename?: unknown
                readonly server_msg_id?: unknown
            }
        }
        readonly appeal?: {
            readonly state?: unknown
            readonly appeal_reason?: unknown
            readonly creation_time?: unknown
            readonly report_id?: unknown
            readonly appeal_id?: unknown
        }
    }
}

export type WaMexCreateWhatsAppAdsIdentityResponse = {
    readonly create_or_update_whatsapp_ads_identity?: {
        readonly id?: unknown
    }
}

export type WaMexCustomLabel3pdEventResponse = {
    readonly xwa_get_3pd_event?: {
        readonly custom_label?: unknown
        readonly ctwa_3pd_conversion_type?: unknown
        readonly ctwa_3pd_conversion_subtype?: unknown
        readonly ctwa_3pd_conversion_metadata?: unknown
    }
}

export type WaMexDeleteNewsletterResponse = {
    readonly xwa2_newsletter_delete_v2?: {
        readonly id?: unknown
        readonly state?: {
            readonly type?: unknown
        }
    }
}

export type WaMexDemoteNewsletterAdminResponse = {
    readonly xwa2_newsletter_admin_demote?: {
        readonly __typename?: unknown
        readonly id?: unknown
    }
}

export type WaMexEditBizProfileResponse = {
    readonly edit_wa_web_biz_profile?: unknown
}

export type WaMexExternalCtxAuthoriseWAChatResponse = {
    readonly xwa_external_ctx_authorise_wa_chat?: {
        readonly success?: unknown
        readonly partner_name?: unknown
    }
}

export type WaMexFetchAboutStatusResponse = {
    readonly xwa2_users_updates_since?: {
        readonly updates?: {
            readonly __typename?: unknown
            readonly text?: unknown
        }
    }
}

export type WaMexFetchAdEntryPointsConfigurationResponse = {
    readonly ctwa_client_entry_point_entitlement?: {
        readonly entry_point_or_experience?: unknown
        readonly should_show?: unknown
    }
}

export type WaMexFetchAdEntryPointsConfigurationM1Response = {
    readonly ctwa_client_entry_point_entitlement?: {
        readonly entry_point_or_experience?: unknown
        readonly should_show?: unknown
        readonly content?: unknown
        readonly sub_content?: unknown
    }
}

export type WaMexFetchAllNewslettersMetadataResponse = {
    readonly xwa2_newsletter_subscribed?: {
        readonly id?: unknown
        readonly state?: {
            readonly type?: unknown
        }
        readonly thread_metadata?: {
            readonly creation_time?: unknown
            readonly name?: {
                readonly id?: unknown
                readonly text?: unknown
                readonly update_time?: unknown
            }
            readonly picture?: {
                readonly id?: unknown
                readonly type?: unknown
                readonly direct_path?: unknown
            }
            readonly preview?: {
                readonly id?: unknown
                readonly type?: unknown
                readonly direct_path?: unknown
            }
            readonly description?: {
                readonly id?: unknown
                readonly text?: unknown
                readonly update_time?: unknown
            }
            readonly invite?: unknown
            readonly handle?: unknown
            readonly verification?: unknown
            readonly settings?: {
                readonly reaction_codes?: {
                    readonly value?: unknown
                }
            }
            readonly wamo_sub?: {
                readonly plan_id?: unknown
            }
        }
        readonly viewer_metadata?: {
            readonly settings?: {
                readonly type?: unknown
                readonly value?: unknown
            }
            readonly role?: unknown
            readonly wamo_sub_status?: unknown
        }
        readonly status_metadata?: {
            readonly last_status_server_id?: unknown
            readonly last_status_sent_time?: unknown
        }
    }
}

export type WaMexFetchAllSubgroupsResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly id?: unknown
        readonly __typename?: unknown
        readonly default_sub_group?: {
            readonly id?: unknown
            readonly subject?: {
                readonly value?: unknown
                readonly creation_time?: unknown
            }
        }
        readonly sub_groups?: {
            readonly edges?: {
                readonly node?: {
                    readonly id?: unknown
                    readonly subject?: {
                        readonly value?: unknown
                        readonly creation_time?: unknown
                    }
                    readonly properties?: {
                        readonly general_chat?: unknown
                        readonly membership_approval_mode_enabled?: unknown
                        readonly hidden_group?: unknown
                    }
                    readonly membership_approval_requests?: {
                        readonly total_count?: unknown
                    }
                }
            }
        }
    }
}

export type WaMexFetchBotProfilesGQLResponse = {
    readonly xfb_fetch_genai_personas?: {
        readonly __typename?: unknown
        readonly id?: unknown
        readonly jid?: unknown
        readonly is_meta_created?: unknown
        readonly creator?: {
            readonly name?: unknown
            readonly profile_uri?: unknown
        }
        readonly latest_published_version_for_viewer?: {
            readonly __typename?: unknown
            readonly name?: unknown
            readonly description?: unknown
            readonly icebreaker_prompt_list?: unknown
            readonly posing_as_professional?: unknown
            readonly id?: unknown
        }
    }
}

export type WaMexFetchDynamicAIModesResponse = {
    readonly xfb_meta_ai_modes?: {
        readonly mode_id?: unknown
        readonly type?: unknown
        readonly is_experimental?: unknown
        readonly title?: unknown
        readonly subtitle?: unknown
    }
}

export type WaMexFetchGroupInfoResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: unknown
        readonly id?: unknown
        readonly creation_time?: unknown
        readonly creator?: {
            readonly id?: unknown
            readonly lid?: unknown
            readonly pn?: unknown
            readonly username_info?: {
                readonly __typename?: unknown
                readonly username?: unknown
            }
        }
        readonly state?: unknown
        readonly subject?: {
            readonly creator?: {
                readonly id?: unknown
                readonly lid?: unknown
                readonly pn?: unknown
                readonly username_info?: {
                    readonly __typename?: unknown
                    readonly username?: unknown
                }
            }
            readonly creation_time?: unknown
            readonly value?: unknown
        }
        readonly description?: {
            readonly id?: unknown
            readonly creation_time?: unknown
            readonly creator?: {
                readonly id?: unknown
                readonly lid?: unknown
                readonly pn?: unknown
                readonly username_info?: {
                    readonly __typename?: unknown
                    readonly username?: unknown
                }
            }
            readonly value?: unknown
        }
        readonly participants?: {
            readonly edges?: {
                readonly node?: {
                    readonly id?: unknown
                    readonly lid?: unknown
                    readonly pn?: unknown
                    readonly display_name?: unknown
                    readonly username_info?: {
                        readonly __typename?: unknown
                        readonly username?: unknown
                    }
                }
                readonly role?: unknown
            }
            readonly participants_phash_match?: unknown
        }
        readonly total_participants_count?: unknown
        readonly missing_participant_identification?: unknown
        readonly properties?: {
            readonly announcement?: unknown
            readonly capi?: unknown
            readonly ephemeral?: {
                readonly expiration_time_in_sec?: unknown
            }
            readonly growth_locked2?: {
                readonly locked?: unknown
            }
            readonly lid_migration_state?: {
                readonly addressing_mode?: unknown
            }
            readonly locked?: unknown
            readonly member_add_mode?: unknown
            readonly member_link_mode?: unknown
            readonly member_share_group_history_mode?: unknown
            readonly membership_approval_mode_enabled?: unknown
            readonly support?: unknown
            readonly group_safety_check?: unknown
            readonly appeal_status?: unknown
            readonly appeal_update_time?: unknown
            readonly limit_sharing?: {
                readonly limit_sharing_enabled?: unknown
            }
        }
        readonly membership_approval_request?: unknown
    }
}

export type WaMexFetchGroupInfoIncludBotsResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: unknown
        readonly id?: unknown
        readonly creation_time?: unknown
        readonly creator?: {
            readonly id?: unknown
            readonly lid?: unknown
            readonly pn?: unknown
            readonly username_info?: {
                readonly __typename?: unknown
                readonly username?: unknown
            }
        }
        readonly state?: unknown
        readonly subject?: {
            readonly creator?: {
                readonly id?: unknown
                readonly lid?: unknown
                readonly pn?: unknown
                readonly username_info?: {
                    readonly __typename?: unknown
                    readonly username?: unknown
                }
            }
            readonly creation_time?: unknown
            readonly value?: unknown
        }
        readonly description?: {
            readonly id?: unknown
            readonly creation_time?: unknown
            readonly creator?: {
                readonly id?: unknown
                readonly lid?: unknown
                readonly pn?: unknown
                readonly username_info?: {
                    readonly __typename?: unknown
                    readonly username?: unknown
                }
            }
            readonly value?: unknown
        }
        readonly participants?: {
            readonly edges?: {
                readonly participant?: {
                    readonly __typename?: unknown
                    readonly id?: unknown
                    readonly lid?: unknown
                    readonly pn?: unknown
                    readonly display_name?: unknown
                    readonly username_info?: {
                        readonly __typename?: unknown
                        readonly username?: unknown
                    }
                    readonly jid?: unknown
                }
                readonly role?: unknown
            }
            readonly participants_phash_match?: unknown
        }
        readonly total_participants_count?: unknown
        readonly missing_participant_identification?: unknown
        readonly properties?: {
            readonly allow_admin_reports?: unknown
            readonly announcement?: unknown
            readonly capi?: unknown
            readonly ephemeral?: {
                readonly expiration_time_in_sec?: unknown
            }
            readonly growth_locked2?: {
                readonly locked?: unknown
            }
            readonly lid_migration_state?: {
                readonly addressing_mode?: unknown
            }
            readonly locked?: unknown
            readonly member_add_mode?: unknown
            readonly member_link_mode?: unknown
            readonly member_share_group_history_mode?: unknown
            readonly membership_approval_mode_enabled?: unknown
            readonly support?: unknown
            readonly group_safety_check?: unknown
            readonly appeal_status?: unknown
            readonly appeal_update_time?: unknown
            readonly limit_sharing?: {
                readonly limit_sharing_enabled?: unknown
            }
        }
        readonly membership_approval_request?: unknown
    }
}

export type WaMexFetchGroupInviteCodeResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: unknown
        readonly invite_code?: unknown
        readonly id?: unknown
    }
}

export type WaMexFetchGroupIsInternalResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: unknown
        readonly properties?: {
            readonly internal?: unknown
        }
        readonly id?: unknown
    }
}

export type WaMexFetchIntegritySignalsResponse = {
    readonly xwa2_fetch_wa_users?: {
        readonly __typename?: unknown
        readonly integrity_signals_info?: {
            readonly __typename?: unknown
            readonly is_suspicious_start_chat?: unknown
            readonly is_new_account?: unknown
        }
        readonly id?: unknown
    }
}

export type WaMexFetchNativeAdsMvpEligibilityResponse = {
    readonly wa_smb_native_ads_web_info?: {
        readonly lifetime_native_ctwa_advertiser?: unknown
        readonly webclient_l90_ad_creator?: unknown
        readonly is_page_asset_linked?: unknown
        readonly is_pageless_asset_linked?: unknown
    }
}

export type WaMexFetchNewChatMessageCappingInfoResponse = {
    readonly xwa2_message_capping_info?: {
        readonly total_quota?: unknown
        readonly used_quota?: unknown
        readonly cycle_start_timestamp?: unknown
        readonly cycle_end_timestamp?: unknown
        readonly server_sent_timestamp?: unknown
        readonly ote_status?: unknown
        readonly mv_status?: unknown
        readonly capping_status?: unknown
    }
}

export type WaMexFetchNewsletterResponse = {
    readonly xwa2_newsletter?: {
        readonly id?: unknown
        readonly state?: {
            readonly type?: unknown
        }
        readonly thread_metadata?: {
            readonly creation_time?: unknown
            readonly name?: {
                readonly id?: unknown
                readonly text?: unknown
                readonly update_time?: unknown
            }
            readonly picture?: {
                readonly id?: unknown
                readonly type?: unknown
                readonly direct_path?: unknown
            }
            readonly preview?: {
                readonly id?: unknown
                readonly type?: unknown
                readonly direct_path?: unknown
            }
            readonly description?: {
                readonly id?: unknown
                readonly text?: unknown
                readonly update_time?: unknown
            }
            readonly invite?: unknown
            readonly handle?: unknown
            readonly subscribers_count?: unknown
            readonly verification?: unknown
            readonly settings?: {
                readonly reaction_codes?: {
                    readonly value?: unknown
                }
            }
            readonly wamo_sub?: {
                readonly plan_id?: unknown
            }
        }
        readonly viewer_metadata?: {
            readonly settings?: {
                readonly type?: unknown
                readonly value?: unknown
            }
            readonly role?: unknown
            readonly wamo_sub_status?: unknown
        }
        readonly status_metadata?: {
            readonly last_status_server_id?: unknown
            readonly last_status_sent_time?: unknown
        }
    }
}

export type WaMexFetchNewsletterAdminCapabilitiesResponse = {
    readonly xwa2_newsletter_admin?: {
        readonly capabilities?: unknown
        readonly id?: unknown
    }
}

export type WaMexFetchNewsletterAdminInfoResponse = {
    readonly xwa2_newsletter_admin?: {
        readonly admin_count?: unknown
        readonly admin_profile?: {
            readonly id?: unknown
            readonly name?: unknown
            readonly picture?: {
                readonly id?: unknown
                readonly direct_path?: unknown
            }
        }
        readonly admin_settings?: {
            readonly admin_profiles_enabled?: unknown
        }
        readonly id?: unknown
    }
}

export type WaMexFetchNewsletterDehydratedResponse = {
    readonly xwa2_newsletter?: {
        readonly id?: unknown
        readonly thread_metadata?: {
            readonly subscribers_count?: unknown
            readonly verification?: unknown
            readonly settings?: {
                readonly reaction_codes?: {
                    readonly value?: unknown
                }
            }
            readonly wamo_sub?: {
                readonly plan_id?: unknown
            }
        }
        readonly viewer_metadata?: {
            readonly wamo_sub_status?: unknown
        }
    }
}

export type WaMexFetchNewsletterDirectoryCategoriesPreviewResponse = {
    readonly xwa2_newsletters_directory_category_preview?: {
        readonly result?: {
            readonly category?: unknown
            readonly category_title?: unknown
            readonly newsletters?: {
                readonly id?: unknown
                readonly thread_metadata?: {
                    readonly creation_time?: unknown
                    readonly invite?: unknown
                    readonly handle?: unknown
                    readonly subscribers_count?: unknown
                    readonly name?: {
                        readonly id?: unknown
                        readonly text?: unknown
                        readonly update_time?: unknown
                    }
                    readonly description?: {
                        readonly id?: unknown
                        readonly text?: unknown
                        readonly update_time?: unknown
                    }
                    readonly picture?: {
                        readonly id?: unknown
                        readonly direct_path?: unknown
                        readonly type?: unknown
                    }
                    readonly verification?: unknown
                }
                readonly status_metadata?: {
                    readonly last_status_server_id?: unknown
                    readonly last_status_sent_time?: unknown
                }
            }
        }
    }
}

export type WaMexFetchNewsletterDirectoryListResponse = {
    readonly xwa2_newsletters_directory_list?: {
        readonly page_info?: {
            readonly hasNextPage?: unknown
            readonly hasPreviousPage?: unknown
            readonly startCursor?: unknown
            readonly endCursor?: unknown
        }
        readonly result?: {
            readonly id?: unknown
            readonly thread_metadata?: {
                readonly creation_time?: unknown
                readonly invite?: unknown
                readonly handle?: unknown
                readonly subscribers_count?: unknown
                readonly name?: {
                    readonly id?: unknown
                    readonly text?: unknown
                    readonly update_time?: unknown
                }
                readonly description?: {
                    readonly id?: unknown
                    readonly text?: unknown
                    readonly update_time?: unknown
                }
                readonly picture?: {
                    readonly id?: unknown
                    readonly direct_path?: unknown
                    readonly type?: unknown
                }
                readonly verification?: unknown
            }
            readonly status_metadata?: {
                readonly last_status_server_id?: unknown
                readonly last_status_sent_time?: unknown
            }
        }
    }
}

export type WaMexFetchNewsletterDirectorySearchResultsResponse = {
    readonly xwa2_newsletters_directory_search?: {
        readonly page_info?: {
            readonly hasNextPage?: unknown
            readonly hasPreviousPage?: unknown
            readonly startCursor?: unknown
            readonly endCursor?: unknown
        }
        readonly result?: {
            readonly id?: unknown
            readonly thread_metadata?: {
                readonly creation_time?: unknown
                readonly invite?: unknown
                readonly handle?: unknown
                readonly subscribers_count?: unknown
                readonly name?: {
                    readonly id?: unknown
                    readonly text?: unknown
                    readonly update_time?: unknown
                }
                readonly description?: {
                    readonly id?: unknown
                    readonly text?: unknown
                    readonly update_time?: unknown
                }
                readonly picture?: {
                    readonly id?: unknown
                    readonly direct_path?: unknown
                    readonly type?: unknown
                }
                readonly verification?: unknown
            }
            readonly status_metadata?: {
                readonly last_status_server_id?: unknown
                readonly last_status_sent_time?: unknown
            }
        }
    }
}

export type WaMexFetchNewsletterEnforcementsResponse = {
    readonly xwa2_channel_enforcements?: {
        readonly profile_picture_deletions?: {
            readonly enforcement_creation_time?: unknown
            readonly appeal_creation_time?: unknown
            readonly appeal_state?: unknown
            readonly enforcement_violation_category?: unknown
            readonly enforcement_source?: unknown
            readonly enforcement_id?: unknown
            readonly enforcement_extra_data?: {
                readonly ip_violation_report_data?: {
                    readonly report_fbid?: unknown
                    readonly appeal_form_url?: unknown
                    readonly reporter_email?: unknown
                    readonly reporter_name?: unknown
                }
            }
            readonly enforcement_policy_information?: {
                readonly overview?: unknown
                readonly headline?: unknown
                readonly subtitle?: unknown
                readonly explanation?: unknown
                readonly admin_disclaimer?: unknown
            }
        }
        readonly suspensions?: {
            readonly appeal_creation_time?: unknown
            readonly enforcement_creation_time?: unknown
            readonly appeal_state?: unknown
            readonly enforcement_violation_category?: unknown
            readonly enforcement_id?: unknown
            readonly enforcement_source?: unknown
            readonly enforcement_extra_data?: {
                readonly ip_violation_report_data?: {
                    readonly report_fbid?: unknown
                    readonly appeal_form_url?: unknown
                    readonly reporter_email?: unknown
                    readonly reporter_name?: unknown
                }
                readonly enforcement_target_data?: {
                    readonly __typename?: unknown
                    readonly server_msg_id?: unknown
                    readonly server_id?: unknown
                    readonly id?: unknown
                }
                readonly appeal_extra_data?: {
                    readonly appeal_form_url?: unknown
                }
            }
            readonly enforcement_policy_information?: {
                readonly overview?: unknown
                readonly headline?: unknown
                readonly subtitle?: unknown
                readonly explanation?: unknown
                readonly admin_disclaimer?: unknown
            }
        }
        readonly violating_messages?: {
            readonly base_enforcement_data?: {
                readonly enforcement_creation_time?: unknown
                readonly appeal_creation_time?: unknown
                readonly appeal_state?: unknown
                readonly enforcement_id?: unknown
                readonly enforcement_violation_category?: unknown
                readonly enforcement_source?: unknown
                readonly enforcement_extra_data?: {
                    readonly ip_violation_report_data?: {
                        readonly report_fbid?: unknown
                        readonly appeal_form_url?: unknown
                        readonly reporter_email?: unknown
                        readonly reporter_name?: unknown
                    }
                }
                readonly enforcement_policy_information?: {
                    readonly overview?: unknown
                    readonly headline?: unknown
                    readonly subtitle?: unknown
                    readonly explanation?: unknown
                    readonly admin_disclaimer?: unknown
                }
            }
            readonly content_data?: {
                readonly __typename?: unknown
                readonly server_msg_id?: unknown
                readonly server_id?: unknown
            }
        }
        readonly geosuspensions?: {
            readonly base_enforcement_data?: {
                readonly enforcement_creation_time?: unknown
                readonly appeal_creation_time?: unknown
                readonly appeal_state?: unknown
                readonly enforcement_id?: unknown
                readonly enforcement_violation_category?: unknown
                readonly enforcement_source?: unknown
                readonly enforcement_extra_data?: {
                    readonly ip_violation_report_data?: {
                        readonly report_fbid?: unknown
                        readonly appeal_form_url?: unknown
                        readonly reporter_email?: unknown
                        readonly reporter_name?: unknown
                    }
                    readonly enforcement_target_data?: {
                        readonly __typename?: unknown
                        readonly server_msg_id?: unknown
                        readonly server_id?: unknown
                        readonly id?: unknown
                    }
                    readonly appeal_extra_data?: {
                        readonly appeal_form_url?: unknown
                    }
                    readonly enforcing_entity_data?: {
                        readonly name?: unknown
                    }
                    readonly enforcement_origin_workflow?: unknown
                    readonly enforcement_origin_legal_basis?: unknown
                }
                readonly enforcement_policy_information?: {
                    readonly overview?: unknown
                    readonly headline?: unknown
                    readonly subtitle?: unknown
                    readonly explanation?: unknown
                    readonly admin_disclaimer?: unknown
                }
            }
            readonly country_codes?: unknown
        }
    }
}

export type WaMexFetchNewsletterFollowersResponse = {
    readonly xwa2_newsletter_followers?: {
        readonly followers?: {
            readonly edges?: {
                readonly node?: {
                    readonly id?: unknown
                    readonly display_name?: unknown
                    readonly pn?: unknown
                    readonly username_info?: {
                        readonly __typename?: unknown
                        readonly username?: unknown
                    }
                }
                readonly follow_time?: unknown
                readonly role?: unknown
                readonly admin_profile?: {
                    readonly id?: unknown
                    readonly name?: unknown
                    readonly picture?: {
                        readonly direct_path?: unknown
                        readonly id?: unknown
                    }
                }
            }
        }
    }
}

export type WaMexFetchNewsletterInsightsResponse = {
    readonly xwa2_newsletter_admin_insights?: {
        readonly newsletter_id?: unknown
        readonly state?: {
            readonly type?: unknown
        }
        readonly last_update_time?: unknown
        readonly metrics_status?: unknown
        readonly result?: {
            readonly id?: unknown
            readonly values?: {
                readonly value?: unknown
                readonly country?: unknown
                readonly role?: unknown
                readonly timestamp?: unknown
            }
        }
    }
}

export type WaMexFetchNewsletterIsDomainPreviewableResponse = {
    readonly xwa2_newsletter_message_integrity?: {
        readonly url_previews?: {
            readonly url_domain?: unknown
            readonly is_previewable?: unknown
        }
    }
}

export type WaMexFetchNewsletterMessageReactionSenderListResponse = {
    readonly xwa2_newsletters_reaction_sender_list?: {
        readonly reactions?: {
            readonly reaction_code?: unknown
            readonly sender_list?: {
                readonly edges?: {
                    readonly node?: {
                        readonly id?: unknown
                        readonly profile_pic_direct_path?: unknown
                    }
                }
            }
        }
    }
}

export type WaMexFetchNewsletterPendingInvitesResponse = {
    readonly xwa2_newsletter_admin?: {
        readonly pending_admin_invites?: {
            readonly user?: {
                readonly pn?: unknown
                readonly id?: unknown
            }
        }
        readonly id?: unknown
    }
}

export type WaMexFetchNewsletterPollVotersResponse = {
    readonly voter_list?: {
        readonly votes?: {
            readonly vote_hash?: unknown
            readonly voter_list?: {
                readonly edges?: {
                    readonly action_time?: unknown
                    readonly node?: {
                        readonly id?: unknown
                    }
                }
            }
        }
    }
}

export type WaMexFetchNewsletterReportsResponse = {
    readonly xwa2_channels_reports?: {
        readonly channels_reports?: {
            readonly report_id?: unknown
            readonly status?: unknown
            readonly creation_time?: unknown
            readonly last_update_time?: unknown
            readonly channel_name?: unknown
            readonly channel_jid?: unknown
            readonly reported_content_data?: {
                readonly __typename?: unknown
                readonly server_msg_id?: unknown
                readonly server_id?: unknown
                readonly server_response_id?: unknown
                readonly notify_name?: unknown
                readonly question_data?: {
                    readonly __typename?: unknown
                    readonly server_msg_id?: unknown
                }
            }
            readonly appeal?: {
                readonly state?: unknown
                readonly appeal_reason?: unknown
                readonly creation_time?: unknown
                readonly report_id?: unknown
                readonly appeal_id?: unknown
            }
        }
    }
}

export type WaMexFetchOHAIKeyConfigResponse = {
    readonly xwa2_ohai_configurations?: {
        readonly ohai_configs?: {
            readonly aead_id?: unknown
            readonly expiration_date?: unknown
            readonly kdf_id?: unknown
            readonly kem_id?: unknown
            readonly key_id?: unknown
            readonly last_updated_time?: unknown
            readonly public_key?: unknown
        }
    }
}

export type WaMexFetchOIDCStateResponse = {
    readonly xfb_wa_biz_get_oidc_state?: unknown
}

export type WaMexFetchPlaintextLinkPreviewResponse = {
    readonly xwa2_newsletter_link_preview?: {
        readonly description?: unknown
        readonly direct_path?: unknown
        readonly hash?: unknown
        readonly preview_type?: unknown
        readonly thumb_data?: unknown
        readonly title?: unknown
        readonly height?: unknown
        readonly width?: unknown
    }
}

export type WaMexFetchQuickPromotionsResponse = {
    readonly quick_promotion_batch_fetch_root?: {
        readonly surface_nux_id?: unknown
        readonly eligible_promotions?: {
            readonly edges?: {
                readonly client_ttl_seconds?: unknown
                readonly priority?: unknown
                readonly is_holdout?: unknown
                readonly log_eligibility_waterfall?: unknown
                readonly time_range?: {
                    readonly start?: unknown
                    readonly end?: unknown
                }
                readonly node?: {
                    readonly promotion_id?: unknown
                    readonly is_server_force_pass?: unknown
                    readonly ab_prop_name?: unknown
                    readonly surface_delay_in_seconds?: unknown
                    readonly encrypted_logging_data?: unknown
                    readonly client_side_dry_run?: unknown
                    readonly creatives?: {
                        readonly title?: {
                            readonly text?: unknown
                        }
                        readonly content?: {
                            readonly text?: unknown
                        }
                        readonly primary_action?: {
                            readonly title?: {
                                readonly text?: unknown
                            }
                            readonly url?: unknown
                        }
                        readonly wa_light_mode_media_details?: {
                            readonly jpeg_thumbnail?: unknown
                        }
                        readonly wa_dark_mode_media_details?: {
                            readonly jpeg_thumbnail?: unknown
                        }
                        readonly accessibility_text_for_image?: unknown
                        readonly is_dismissible?: unknown
                        readonly id?: unknown
                    }
                    readonly content_attributes?: {
                        readonly wa_banner_background_color?: {
                            readonly light_mode_highlight_color?: unknown
                            readonly dark_mode_highlight_color?: unknown
                            readonly light_mode_background_color?: unknown
                            readonly dark_mode_background_color?: unknown
                        }
                        readonly wa_primary_cta_alternative_url?: unknown
                        readonly wa_eligible_duration_after_impression_in_seconds?: unknown
                    }
                    readonly wa_qp_content_attributes_do_not_use?: {
                        readonly name?: unknown
                        readonly value?: unknown
                    }
                    readonly contextual_filters_for_wa_do_not_use?: {
                        readonly clause_type?: unknown
                        readonly filters?: {
                            readonly filter_name?: unknown
                            readonly parameters?: {
                                readonly key?: unknown
                                readonly value?: unknown
                            }
                            readonly passes_if_client_not_supported?: unknown
                            readonly filter_result?: unknown
                        }
                        readonly clauses?: {
                            readonly clause_type?: unknown
                            readonly filters?: {
                                readonly filter_name?: unknown
                                readonly parameters?: {
                                    readonly key?: unknown
                                    readonly value?: unknown
                                }
                                readonly passes_if_client_not_supported?: unknown
                                readonly filter_result?: unknown
                            }
                            readonly clauses?: {
                                readonly clause_type?: unknown
                                readonly filters?: {
                                    readonly filter_name?: unknown
                                    readonly parameters?: {
                                        readonly key?: unknown
                                        readonly value?: unknown
                                    }
                                    readonly passes_if_client_not_supported?: unknown
                                    readonly filter_result?: unknown
                                }
                                readonly clauses?: {
                                    readonly clause_type?: unknown
                                    readonly filters?: {
                                        readonly filter_name?: unknown
                                        readonly parameters?: {
                                            readonly key?: unknown
                                            readonly value?: unknown
                                        }
                                        readonly passes_if_client_not_supported?: unknown
                                        readonly filter_result?: unknown
                                    }
                                    readonly clauses?: {
                                        readonly clause_type?: unknown
                                        readonly filters?: {
                                            readonly filter_name?: unknown
                                            readonly parameters?: {
                                                readonly key?: unknown
                                                readonly value?: unknown
                                            }
                                            readonly passes_if_client_not_supported?: unknown
                                            readonly filter_result?: unknown
                                        }
                                        readonly clauses?: {
                                            readonly clause_type?: unknown
                                            readonly filters?: {
                                                readonly filter_name?: unknown
                                                readonly parameters?: {
                                                    readonly key?: unknown
                                                    readonly value?: unknown
                                                }
                                                readonly passes_if_client_not_supported?: unknown
                                                readonly filter_result?: unknown
                                            }
                                            readonly clauses?: {
                                                readonly clause_type?: unknown
                                                readonly filters?: {
                                                    readonly filter_name?: unknown
                                                    readonly parameters?: {
                                                        readonly key?: unknown
                                                        readonly value?: unknown
                                                    }
                                                    readonly passes_if_client_not_supported?: unknown
                                                    readonly filter_result?: unknown
                                                }
                                                readonly clauses?: {
                                                    readonly clause_type?: unknown
                                                    readonly filters?: {
                                                        readonly filter_name?: unknown
                                                        readonly parameters?: {
                                                            readonly key?: unknown
                                                            readonly value?: unknown
                                                        }
                                                        readonly passes_if_client_not_supported?: unknown
                                                        readonly filter_result?: unknown
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    readonly id?: unknown
                }
            }
        }
    }
}

export type WaMexFetchReachoutTimelockResponse = {
    readonly xwa2_fetch_account_reachout_timelock?: {
        readonly is_active?: unknown
        readonly time_enforcement_ends?: unknown
        readonly enforcement_type?: unknown
    }
}

export type WaMexFetchRecommendedNewslettersResponse = {
    readonly xwa2_newsletters_recommended?: {
        readonly page_info?: {
            readonly hasNextPage?: unknown
            readonly hasPreviousPage?: unknown
            readonly startCursor?: unknown
            readonly endCursor?: unknown
        }
        readonly result?: {
            readonly id?: unknown
            readonly state?: {
                readonly type?: unknown
            }
            readonly thread_metadata?: {
                readonly creation_time?: unknown
                readonly name?: {
                    readonly id?: unknown
                    readonly text?: unknown
                    readonly update_time?: unknown
                }
                readonly description?: {
                    readonly id?: unknown
                    readonly text?: unknown
                    readonly update_time?: unknown
                }
                readonly preview?: {
                    readonly id?: unknown
                    readonly type?: unknown
                    readonly direct_path?: unknown
                }
                readonly invite?: unknown
                readonly handle?: unknown
                readonly verification?: unknown
                readonly subscribers_count?: unknown
            }
            readonly status_metadata?: {
                readonly last_status_server_id?: unknown
                readonly last_status_sent_time?: unknown
            }
        }
    }
}

export type WaMexFetchSimilarNewslettersResponse = {
    readonly xwa2_newsletters_similar?: {
        readonly result?: {
            readonly id?: unknown
            readonly thread_metadata?: {
                readonly name?: {
                    readonly id?: unknown
                    readonly text?: unknown
                    readonly update_time?: unknown
                }
                readonly picture?: {
                    readonly id?: unknown
                    readonly type?: unknown
                    readonly direct_path?: unknown
                }
                readonly verification?: unknown
            }
            readonly status_metadata?: {
                readonly last_status_server_id?: unknown
            }
            readonly state?: {
                readonly type?: unknown
            }
        }
    }
}

export type WaMexFetchSubgroupSuggestionsResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: unknown
        readonly id?: unknown
        readonly sub_group_suggestions?: {
            readonly edges?: {
                readonly node?: {
                    readonly id?: unknown
                    readonly subject?: {
                        readonly value?: unknown
                    }
                    readonly description?: {
                        readonly value?: unknown
                        readonly id?: unknown
                    }
                    readonly creator?: {
                        readonly id?: unknown
                    }
                    readonly creation_time?: unknown
                    readonly total_participants_count?: unknown
                    readonly is_existing_group?: unknown
                    readonly hidden_group?: unknown
                }
            }
        }
    }
}

export type WaMexFetchSubscriptionEntryPointsResponse = {
    readonly waSubscriptionEntryPoints?: {
        readonly subscriptionEntryPoints?: {
            readonly subscriptionType?: unknown
            readonly webEntryPointEligibility?: unknown
            readonly webEntryPointRedirectionUri?: unknown
        }
    }
}

export type WaMexFetchSubscriptionsResponse = {
    readonly xwa_get_subscriptions?: {
        readonly subscriptions?: {
            readonly id?: unknown
            readonly status?: unknown
            readonly end_time?: unknown
            readonly creation_time?: unknown
            readonly tier?: unknown
            readonly source?: unknown
            readonly is_platform_changed?: unknown
            readonly start_time?: unknown
        }
        readonly feature_flags?: {
            readonly name?: unknown
            readonly enabled?: unknown
            readonly expiration_time?: unknown
            readonly limit?: unknown
        }
    }
}

export type WaMexFetchTextStatusListResponse = {
    readonly xwa2_text_status_list?: {
        readonly jid?: unknown
        readonly text?: unknown
        readonly last_update_time?: unknown
        readonly ephemeral_duration_sec?: unknown
        readonly emoji?: {
            readonly content?: unknown
        }
    }
}

export type WaMexGetAccessTokenFromOIDCCodeResponse = {
    readonly xfb_wa_biz_get_token_from_oidc_code?: {
        readonly access_token?: unknown
        readonly fb_user_id?: unknown
    }
}

export type WaMexGetAccountNonceResponse = {
    readonly xfb_wa_biz_account_nonce?: {
        readonly detail?: {
            readonly nonce?: unknown
            readonly request?: {
                readonly id?: unknown
            }
        }
    }
}

export type WaMexGetDsbInfoResponse = {
    readonly xwa2_get_dsb_info?: {
        readonly reference_number?: unknown
    }
}

export type WaMexGetFBAccountPagesResponse = {
    readonly user?: {
        readonly facebook_pages?: {
            readonly nodes?: {
                readonly name?: unknown
                readonly id?: unknown
                readonly profile_picture?: {
                    readonly uri?: unknown
                }
                readonly permitted_tasks?: unknown
            }
        }
        readonly id?: unknown
    }
}

export type WaMexGetNumbersForBrandIdsResponse = {
    readonly xwa_get_numbers_for_brand_ids?: {
        readonly brand_ids_data?: {
            readonly brand_id?: unknown
            readonly error?: unknown
            readonly phone_numbers?: unknown
            readonly lids?: unknown
        }
    }
}

export type WaMexGetPrivacyListsResponse = {
    readonly xwa2_fetch_wa_users?: {
        readonly __typename?: unknown
        readonly privacy_contact_list?: {
            readonly dhash?: unknown
            readonly contacts?: {
                readonly jid?: unknown
                readonly pn_jid?: unknown
                readonly username_info?: {
                    readonly __typename?: unknown
                    readonly username?: unknown
                }
            }
        }
        readonly id?: unknown
    }
}

export type WaMexGetPrivacySettingsResponse = {
    readonly xwa2_fetch_wa_users?: {
        readonly __typename?: unknown
        readonly privacy_settings?: {
            readonly settings?: {
                readonly feature?: unknown
                readonly setting?: unknown
            }
        }
        readonly id?: unknown
    }
}

export type WaMexGetUsernameResponse = {
    readonly xwa2_username_get?: {
        readonly username_info?: {
            readonly username?: unknown
            readonly state?: unknown
            readonly pin?: unknown
        }
    }
}

export type WaMexGetWAAEligibilityResponse = {
    readonly eval_wa_ad_account_eligibility_rules?: {
        readonly eligibility_result?: unknown
    }
}

export type WaMexGraphQLProductCatalogGetPublicKeyResponse = {
    readonly xwa_product_catalog_get_public_key?: {
        readonly public_key_certificate_pem?: unknown
        readonly public_key_with_signature?: {
            readonly public_key_pem?: unknown
            readonly public_key_signature?: unknown
        }
    }
}

export type WaMexGraphQLVerifyPostcodeResponse = {
    readonly xwa_product_catalog_get_verify_postcode?: {
        readonly postcode_verification_result?: {
            readonly result_code?: unknown
            readonly encrypted_location_name?: unknown
        }
    }
}

export type WaMexGroupStoreInviteSmsResponse = {
    readonly xwa2_group_store_invites_sms?: {
        readonly group_jid?: unknown
        readonly participant_responses?: {
            readonly error_code?: unknown
        }
    }
}

export type WaMexGroupSuspensionAppealResponse = {
    readonly wa_create_group_suspension_appeal?: {
        readonly response_code?: unknown
        readonly error_message?: unknown
        readonly appeal_creation_time?: unknown
    }
}

export type WaMexIntegrityChallengeResponseResponse = {
    readonly xwa2_submit_integrity_challenge_response?: {
        readonly success?: unknown
        readonly error_message?: unknown
    }
}

export type WaMexJoinNewsletterResponse = {
    readonly xwa2_newsletter_join_v2?: {
        readonly id?: unknown
        readonly state?: {
            readonly type?: unknown
        }
    }
}

export type WaMexLeaveNewsletterResponse = {
    readonly xwa2_newsletter_leave_v2?: {
        readonly id?: unknown
        readonly state?: {
            readonly type?: unknown
        }
    }
}

export type WaMexLidChangeNotificationResponse = {
    readonly xwa2_notify_lid_change?: {
        readonly old?: unknown
        readonly new?: unknown
    }
}

export type WaMexLogNewsletterExposuresResponse = {
    readonly xwa2_newsletter_log_exposures?: {
        readonly __typename?: unknown
    }
}

export type WaMexNativeMLModelResponse = {
    readonly aim_model_batched_manifest?: {
        readonly models?: {
            readonly name?: unknown
            readonly version?: unknown
            readonly assets?: {
                readonly name?: unknown
                readonly id?: unknown
                readonly cache_key?: unknown
                readonly source_content_hash?: unknown
                readonly md5_hash?: unknown
                readonly asset_handle?: unknown
                readonly creation_time?: unknown
                readonly url?: unknown
                readonly filesize_bytes?: unknown
                readonly compression_type?: unknown
                readonly asset_type?: unknown
            }
            readonly properties?: {
                readonly name?: unknown
                readonly value?: unknown
            }
        }
        readonly entry_point?: unknown
        readonly asset_count?: unknown
        readonly model_count?: unknown
        readonly status?: unknown
        readonly status_details?: unknown
    }
}

export type WaMexNewsletterAddPaidPartnershipLabelResponse = {
    readonly xwa2_newsletter_label_paid_partnership?: {
        readonly id?: unknown
    }
}

export type WaMexQueryCatalogResponse = {
    readonly xwa_product_catalog_get_product_catalog?: {
        readonly __typename?: unknown
        readonly product_catalog?: {
            readonly products?: {
                readonly id?: unknown
                readonly retailer_id?: unknown
                readonly is_hidden?: unknown
                readonly is_sanctioned?: unknown
                readonly product_availability?: unknown
                readonly max_available?: unknown
                readonly name?: unknown
                readonly description?: unknown
                readonly url?: unknown
                readonly shimmed_url?: unknown
                readonly currency?: unknown
                readonly price?: unknown
                readonly status_info?: {
                    readonly can_appeal?: unknown
                    readonly status?: unknown
                }
                readonly sale_price?: {
                    readonly price?: unknown
                    readonly start_date?: unknown
                    readonly end_date?: unknown
                }
                readonly media?: {
                    readonly images?: {
                        readonly id?: unknown
                        readonly original_image_url?: unknown
                        readonly request_image_url?: unknown
                    }
                    readonly videos?: {
                        readonly id?: unknown
                        readonly original_video_url?: unknown
                        readonly thumbnail_url?: unknown
                    }
                }
                readonly belongs_to?: unknown
                readonly compliance_category?: unknown
                readonly compliance_info?: {
                    readonly country_code_origin?: unknown
                    readonly importer_name?: unknown
                    readonly importer_address?: {
                        readonly street1?: unknown
                        readonly street2?: unknown
                        readonly postal_code?: unknown
                        readonly city?: unknown
                        readonly region?: unknown
                        readonly country_code?: unknown
                    }
                }
                readonly variant_info?: {
                    readonly listing_details?: {
                        readonly description?: unknown
                        readonly multi_price?: unknown
                        readonly lowest_price?: unknown
                    }
                    readonly availability?: {
                        readonly listing?: {
                            readonly is_available?: unknown
                            readonly options?: {
                                readonly name?: unknown
                                readonly value?: unknown
                            }
                            readonly product_id?: unknown
                        }
                    }
                    readonly types?: {
                        readonly name?: unknown
                        readonly options?: {
                            readonly value?: unknown
                            readonly thumbnail_media?: {
                                readonly id?: unknown
                                readonly original_dimensions?: {
                                    readonly height?: unknown
                                    readonly width?: unknown
                                }
                                readonly original_image_url?: unknown
                                readonly request_image_url?: unknown
                            }
                        }
                    }
                    readonly variant_properties?: {
                        readonly name?: unknown
                        readonly value?: unknown
                    }
                }
            }
            readonly paging?: {
                readonly before?: unknown
                readonly after?: unknown
            }
        }
    }
}

export type WaMexQueryCatalogHasCategoriesResponse = {
    readonly xwa_product_catalog_get_categories?: {
        readonly categories?: {
            readonly __typename?: unknown
        }
    }
}

export type WaMexQueryCatalogProductResponse = {
    readonly xwa_product_catalog_get_product?: {
        readonly product_catalog?: {
            readonly product?: {
                readonly id?: unknown
                readonly retailer_id?: unknown
                readonly is_hidden?: unknown
                readonly is_sanctioned?: unknown
                readonly product_availability?: unknown
                readonly max_available?: unknown
                readonly name?: unknown
                readonly description?: unknown
                readonly url?: unknown
                readonly shimmed_url?: unknown
                readonly currency?: unknown
                readonly price?: unknown
                readonly status_info?: {
                    readonly can_appeal?: unknown
                    readonly status?: unknown
                }
                readonly sale_price?: {
                    readonly price?: unknown
                    readonly start_date?: unknown
                    readonly end_date?: unknown
                }
                readonly media?: {
                    readonly images?: {
                        readonly id?: unknown
                        readonly original_image_url?: unknown
                        readonly request_image_url?: unknown
                    }
                    readonly videos?: {
                        readonly id?: unknown
                        readonly original_video_url?: unknown
                        readonly thumbnail_url?: unknown
                    }
                }
                readonly belongs_to?: unknown
                readonly compliance_category?: unknown
                readonly compliance_info?: {
                    readonly country_code_origin?: unknown
                    readonly importer_name?: unknown
                    readonly importer_address?: {
                        readonly street1?: unknown
                        readonly street2?: unknown
                        readonly postal_code?: unknown
                        readonly city?: unknown
                        readonly region?: unknown
                        readonly country_code?: unknown
                    }
                }
                readonly variant_info?: {
                    readonly listing_details?: {
                        readonly description?: unknown
                        readonly multi_price?: unknown
                        readonly lowest_price?: unknown
                    }
                    readonly availability?: {
                        readonly listing?: {
                            readonly is_available?: unknown
                            readonly options?: {
                                readonly name?: unknown
                                readonly value?: unknown
                            }
                            readonly product_id?: unknown
                        }
                    }
                    readonly types?: {
                        readonly name?: unknown
                        readonly options?: {
                            readonly value?: unknown
                            readonly thumbnail_media?: {
                                readonly id?: unknown
                                readonly original_dimensions?: {
                                    readonly height?: unknown
                                    readonly width?: unknown
                                }
                                readonly original_image_url?: unknown
                                readonly request_image_url?: unknown
                            }
                        }
                    }
                    readonly variant_properties?: {
                        readonly name?: unknown
                        readonly value?: unknown
                    }
                }
            }
        }
    }
}

export type WaMexQueryProductCollectionsResponse = {
    readonly xwa_product_catalog_get_collections?: {
        readonly __typename?: unknown
        readonly collections?: {
            readonly id?: unknown
            readonly name?: unknown
            readonly status_info?: {
                readonly status?: unknown
                readonly can_appeal?: unknown
                readonly reject_reason?: unknown
                readonly commerce_url?: unknown
            }
            readonly products?: {
                readonly id?: unknown
                readonly retailer_id?: unknown
                readonly is_hidden?: unknown
                readonly is_sanctioned?: unknown
                readonly product_availability?: unknown
                readonly max_available?: unknown
                readonly name?: unknown
                readonly description?: unknown
                readonly url?: unknown
                readonly shimmed_url?: unknown
                readonly currency?: unknown
                readonly price?: unknown
                readonly status_info?: {
                    readonly can_appeal?: unknown
                    readonly status?: unknown
                }
                readonly sale_price?: {
                    readonly price?: unknown
                    readonly start_date?: unknown
                    readonly end_date?: unknown
                }
                readonly media?: {
                    readonly images?: {
                        readonly id?: unknown
                        readonly original_image_url?: unknown
                        readonly request_image_url?: unknown
                    }
                    readonly videos?: {
                        readonly id?: unknown
                        readonly original_video_url?: unknown
                        readonly thumbnail_url?: unknown
                    }
                }
                readonly belongs_to?: unknown
                readonly compliance_category?: unknown
                readonly compliance_info?: {
                    readonly country_code_origin?: unknown
                    readonly importer_name?: unknown
                    readonly importer_address?: {
                        readonly street1?: unknown
                        readonly street2?: unknown
                        readonly postal_code?: unknown
                        readonly city?: unknown
                        readonly region?: unknown
                        readonly country_code?: unknown
                    }
                }
                readonly variant_info?: {
                    readonly listing_details?: {
                        readonly description?: unknown
                        readonly multi_price?: unknown
                        readonly lowest_price?: unknown
                    }
                    readonly availability?: {
                        readonly listing?: {
                            readonly is_available?: unknown
                            readonly options?: {
                                readonly name?: unknown
                                readonly value?: unknown
                            }
                            readonly product_id?: unknown
                        }
                    }
                    readonly types?: {
                        readonly name?: unknown
                        readonly options?: {
                            readonly value?: unknown
                            readonly thumbnail_media?: {
                                readonly id?: unknown
                                readonly original_dimensions?: {
                                    readonly height?: unknown
                                    readonly width?: unknown
                                }
                                readonly original_image_url?: unknown
                                readonly request_image_url?: unknown
                            }
                        }
                    }
                    readonly variant_properties?: {
                        readonly name?: unknown
                        readonly value?: unknown
                    }
                }
            }
        }
        readonly paging?: {
            readonly after?: unknown
        }
    }
}

export type WaMexQueryProductListCatalogResponse = {
    readonly xwa_product_catalog_get_product_list?: {
        readonly __typename?: unknown
        readonly product_list?: {
            readonly products?: {
                readonly id?: unknown
                readonly retailer_id?: unknown
                readonly is_hidden?: unknown
                readonly is_sanctioned?: unknown
                readonly product_availability?: unknown
                readonly max_available?: unknown
                readonly name?: unknown
                readonly description?: unknown
                readonly url?: unknown
                readonly shimmed_url?: unknown
                readonly currency?: unknown
                readonly price?: unknown
                readonly status_info?: {
                    readonly can_appeal?: unknown
                    readonly status?: unknown
                }
                readonly sale_price?: {
                    readonly price?: unknown
                    readonly start_date?: unknown
                    readonly end_date?: unknown
                }
                readonly media?: {
                    readonly images?: {
                        readonly id?: unknown
                        readonly original_image_url?: unknown
                        readonly request_image_url?: unknown
                    }
                    readonly videos?: {
                        readonly id?: unknown
                        readonly original_video_url?: unknown
                        readonly thumbnail_url?: unknown
                    }
                }
                readonly belongs_to?: unknown
                readonly compliance_category?: unknown
                readonly compliance_info?: {
                    readonly country_code_origin?: unknown
                    readonly importer_name?: unknown
                    readonly importer_address?: {
                        readonly street1?: unknown
                        readonly street2?: unknown
                        readonly postal_code?: unknown
                        readonly city?: unknown
                        readonly region?: unknown
                        readonly country_code?: unknown
                    }
                }
                readonly variant_info?: {
                    readonly listing_details?: {
                        readonly description?: unknown
                        readonly multi_price?: unknown
                        readonly lowest_price?: unknown
                    }
                    readonly availability?: {
                        readonly listing?: {
                            readonly is_available?: unknown
                            readonly options?: {
                                readonly name?: unknown
                                readonly value?: unknown
                            }
                            readonly product_id?: unknown
                        }
                    }
                    readonly types?: {
                        readonly name?: unknown
                        readonly options?: {
                            readonly value?: unknown
                            readonly thumbnail_media?: {
                                readonly id?: unknown
                                readonly original_dimensions?: {
                                    readonly height?: unknown
                                    readonly width?: unknown
                                }
                                readonly original_image_url?: unknown
                                readonly request_image_url?: unknown
                            }
                        }
                    }
                    readonly variant_properties?: {
                        readonly name?: unknown
                        readonly value?: unknown
                    }
                }
            }
        }
    }
}

export type WaMexQueryProductSingleCollectionResponse = {
    readonly xwa_product_catalog_get_single_collection?: {
        readonly collection?: {
            readonly id?: unknown
            readonly name?: unknown
            readonly status_info?: {
                readonly status?: unknown
                readonly can_appeal?: unknown
                readonly reject_reason?: unknown
                readonly commerce_url?: unknown
            }
            readonly products?: {
                readonly id?: unknown
                readonly retailer_id?: unknown
                readonly is_hidden?: unknown
                readonly is_sanctioned?: unknown
                readonly product_availability?: unknown
                readonly max_available?: unknown
                readonly name?: unknown
                readonly description?: unknown
                readonly url?: unknown
                readonly shimmed_url?: unknown
                readonly currency?: unknown
                readonly price?: unknown
                readonly status_info?: {
                    readonly can_appeal?: unknown
                    readonly status?: unknown
                }
                readonly sale_price?: {
                    readonly price?: unknown
                    readonly start_date?: unknown
                    readonly end_date?: unknown
                }
                readonly media?: {
                    readonly images?: {
                        readonly id?: unknown
                        readonly original_image_url?: unknown
                        readonly request_image_url?: unknown
                    }
                    readonly videos?: {
                        readonly id?: unknown
                        readonly original_video_url?: unknown
                        readonly thumbnail_url?: unknown
                    }
                }
                readonly belongs_to?: unknown
                readonly compliance_category?: unknown
                readonly compliance_info?: {
                    readonly country_code_origin?: unknown
                    readonly importer_name?: unknown
                    readonly importer_address?: {
                        readonly street1?: unknown
                        readonly street2?: unknown
                        readonly postal_code?: unknown
                        readonly city?: unknown
                        readonly region?: unknown
                        readonly country_code?: unknown
                    }
                }
                readonly variant_info?: {
                    readonly listing_details?: {
                        readonly description?: unknown
                        readonly multi_price?: unknown
                        readonly lowest_price?: unknown
                    }
                    readonly availability?: {
                        readonly listing?: {
                            readonly is_available?: unknown
                            readonly options?: {
                                readonly name?: unknown
                                readonly value?: unknown
                            }
                            readonly product_id?: unknown
                        }
                    }
                    readonly types?: {
                        readonly name?: unknown
                        readonly options?: {
                            readonly value?: unknown
                            readonly thumbnail_media?: {
                                readonly id?: unknown
                                readonly original_dimensions?: {
                                    readonly height?: unknown
                                    readonly width?: unknown
                                }
                                readonly original_image_url?: unknown
                                readonly request_image_url?: unknown
                            }
                        }
                    }
                    readonly variant_properties?: {
                        readonly name?: unknown
                        readonly value?: unknown
                    }
                }
            }
        }
        readonly paging?: {
            readonly after?: unknown
        }
    }
}

export type WaMexQuerySubgroupParticipantCountResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: unknown
        readonly sub_groups?: {
            readonly edges?: {
                readonly node?: {
                    readonly id?: unknown
                    readonly total_participants_count?: unknown
                }
            }
        }
        readonly id?: unknown
    }
}

export type WaMexQuickPromotionActionResponse = {
    readonly wa_quick_promotion_log_event?: {
        readonly client_mutation_id?: unknown
    }
}

export type WaMexReportProductResponse = {
    readonly xwa_whatsapp_catalog_report_product?: {
        readonly __typename?: unknown
        readonly success?: unknown
    }
}

export type WaMexRequestClientLogsForBugResponse = {
    readonly xwa2_request_client_logs_for_bug?: unknown
}

export type WaMexResolveAccountTypeAndAdPageResponse = {
    readonly xfb_wa_biz_clear_oidc_preference?: unknown
}

export type WaMexResolveAccountTypeAndAdPageQueryResponse = {
    readonly page?: {
        readonly can_viewer_do_actions?: unknown
        readonly id?: unknown
    }
}

export type WaMexRevokeNewsletterAdminInviteResponse = {
    readonly xwa2_newsletter_admin_invite_revoke?: {
        readonly __typename?: unknown
        readonly id?: unknown
    }
}

export type WaMexSetUsernameResponse = {
    readonly xwa2_username_set?: {
        readonly result?: unknown
    }
}

export type WaMexSetUsernameKeyResponse = {
    readonly xwa2_username_pin_set?: {
        readonly result?: unknown
    }
}

export type WaMexSignupMetadataResponse = {
    readonly wa_signup_metadata?: {
        readonly id?: unknown
        readonly signup_message?: unknown
        readonly privacy_policy_url?: unknown
    }
}

export type WaMexSupportBugReportSubmitResponse = {
    readonly xwa_wa_support_bug_report_submit?: {
        readonly success?: unknown
        readonly error_code?: unknown
        readonly error_message?: unknown
        readonly bug_report_id?: unknown
        readonly task_id?: unknown
    }
}

export type WaMexSupportContactFormSubmitResponse = {
    readonly xwa_wa_support_contact_form_submit?: {
        readonly success?: unknown
        readonly error_code?: unknown
        readonly error_message?: unknown
        readonly ticket_id?: unknown
        readonly support_phone_number_jid?: unknown
    }
}

export type WaMexSupportMessageFeedbackSubmitResponse = {
    readonly xwa_wa_support_message_feedback_submit?: {
        readonly success?: unknown
        readonly error_code?: unknown
        readonly error_message?: unknown
    }
}

export type WaMexTransferCommunityOwnershipResponse = {
    readonly xwa2_group_update_users_role?: {
        readonly group_id?: unknown
        readonly lid_migration_state?: {
            readonly addressing_mode?: unknown
        }
    }
}

export type WaMexUpdateGroupPropertyResponse = {
    readonly xwa2_group_update_property?: {
        readonly id?: unknown
        readonly state?: unknown
    }
}

export type WaMexUpdateNewsletterResponse = {
    readonly xwa2_newsletter_update?: {
        readonly id?: unknown
        readonly state?: {
            readonly type?: unknown
        }
        readonly thread_metadata?: {
            readonly name?: {
                readonly id?: unknown
                readonly text?: unknown
                readonly update_time?: unknown
            }
            readonly description?: {
                readonly id?: unknown
                readonly text?: unknown
                readonly update_time?: unknown
            }
            readonly picture?: {
                readonly id?: unknown
                readonly type?: unknown
                readonly direct_path?: unknown
            }
            readonly preview?: {
                readonly id?: unknown
                readonly type?: unknown
                readonly direct_path?: unknown
            }
            readonly invite?: unknown
            readonly handle?: unknown
            readonly verification?: unknown
            readonly creation_time?: unknown
            readonly settings?: {
                readonly reaction_codes?: {
                    readonly value?: unknown
                }
            }
        }
    }
}

export type WaMexUpdateNewsletterUserSettingResponse = {
    readonly xwa2_newsletter_update_user_setting?: {
        readonly id?: unknown
        readonly state?: {
            readonly type?: unknown
        }
    }
}

export type WaMexUpdateTextStatusResponse = {
    readonly xwa2_update_text_status?: {
        readonly result?: unknown
    }
}

export type WaMexUsernameAvailabilityResponse = {
    readonly xwa2_username_check?: {
        readonly result?: unknown
        readonly suggestions?: unknown
    }
}

export type WaMexUsyncResponse = {
    readonly xwa2_fetch_wa_users?: {
        readonly __typename?: unknown
        readonly jid?: unknown
        readonly country_code?: unknown
        readonly username_info?: {
            readonly __typename?: unknown
            readonly username?: unknown
            readonly state?: unknown
            readonly timestamp?: unknown
            readonly pin?: unknown
            readonly status?: unknown
        }
        readonly about_status_info?: {
            readonly __typename?: unknown
            readonly text?: unknown
            readonly timestamp?: unknown
            readonly status?: unknown
        }
        readonly id?: unknown
    }
}

export type WaMexWAAOnboardingResponse = {
    readonly create_or_onboard_wa_ad_account?: {
        readonly ad_account_id?: unknown
        readonly status?: unknown
    }
}

export type WaMexWaffleFXServiceDataQueryV2Response = {
    readonly waffle_fx_service_data?: {
        readonly services?: {
            readonly waffle_sxs?: {
                readonly waffle_di?: unknown
                readonly waffle_da?: unknown
                readonly waffle_xss?: {
                    readonly waffle_iaxe?: unknown
                    readonly waffle_x_surface?: unknown
                }
            }
            readonly waffle_afs?: {
                readonly waffle_wes?: unknown
            }
            readonly foa_to_wa_link_eligibility?: {
                readonly is_eligible_to_link_to_unlinked_fb?: unknown
                readonly is_eligible_to_link_to_linked_fb?: unknown
                readonly is_eligible_to_link_to_unlinked_ig?: unknown
                readonly is_eligible_to_link_to_linked_ig?: unknown
                readonly is_eligible_to_link_to_unlinked_rl?: unknown
                readonly is_eligible_to_link_to_linked_rl?: unknown
            }
        }
    }
}

export type WaMexWaffleFXWAMOUpdateUOOMResponse = {
    readonly xfb_waffle_fx_wamo_update_uoom?: unknown
}

export type WaMexWaffleXEResponse = {
    readonly waffle_xe_root?: {
        readonly purpose_public_keys?: {
            readonly purpose_public_ek?: unknown
            readonly purpose_public_ik?: unknown
            readonly purpose_public_ik_sig?: unknown
            readonly purpose_public_ik_enc_certificate?: unknown
            readonly purpose_dummy_ciphertext?: unknown
            readonly purpose_dummy_nonce?: unknown
        }
        readonly waffle_unique_ids?: unknown
        readonly waffle_d?: {
            readonly waffle_xas?: {
                readonly waffle_xan?: unknown
                readonly waffle_xs?: unknown
            }
            readonly waffle_di?: unknown
        }
        readonly waffle_xps?: {
            readonly waffle_xas?: {
                readonly waffle_xan?: unknown
                readonly waffle_xs?: unknown
            }
            readonly waffle_hcbc?: unknown
        }
    }
}

export type WaMexuseWAWebEstimatedDailyReachResponse = {
    readonly lwi?: {
        readonly budget_estimate_data_v2?: {
            readonly daily_outcomes_curve?: {
                readonly actions?: unknown
                readonly actions_lower_bound?: unknown
                readonly actions_upper_bound?: unknown
                readonly bid?: unknown
                readonly impressions?: unknown
                readonly reach?: unknown
                readonly reach_lower_bound?: unknown
                readonly reach_upper_bound?: unknown
                readonly spend?: unknown
            }
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