// AUTO-GENERATED — do not edit. Regenerated daily by wa-spec.
// WhatsApp Version: 2.3000.1055156383

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
    readonly AECompanionOffboard: WaMexPersistId
    readonly AECompanionOnboard: WaMexPersistId
    readonly AcceptNewsletterAdminInvite: WaMexPersistId
    readonly AccountLinkingAPIGetCerts: WaMexPersistId
    readonly AdAccountDpaEligibleProductCatalogListStoreSource: WaMexPersistId
    readonly AdPreferencesDFCABusinessOptOut: WaMexPersistId
    readonly AdPreferencesDemographicCategoryOptOut: WaMexPersistId
    readonly AdPreferencesHideAdvertiser: WaMexPersistId
    readonly AdPreferencesInterestCategoryOptOut: WaMexPersistId
    readonly AddLabyrinthPeerDevice: WaMexPersistId
    readonly AdsAccountDataDispatcher: WaMexPersistId
    readonly AdsAccountDataDispatcherViewerPermissions: WaMexPersistId
    readonly AdsAccountStoreNewSourceServer: WaMexPersistId
    readonly AdsAdAccountSettingsStoreSetAPlusCFeatureStickyStatus: WaMexPersistId
    readonly AdsAdAccountSettingsStoreSetL1AESourceStickyStatus: WaMexPersistId
    readonly AdsAdAccountSettingsStoreSetMultiMediaStickyStatus: WaMexPersistId
    readonly AdsAdAccountSettingsStoreSetVideoOptimizationStickyStatus: WaMexPersistId
    readonly AdsAdAccountSettingsStoreSourceServer: WaMexPersistId
    readonly AdsBulkEditCampaignGroupAgencyFeeBulkContainer: WaMexPersistId
    readonly AdsBulkEditCampaignGroupAgencyFeeContainerAdAccountAgencyFee: WaMexPersistId
    readonly AdsBulkEditCampaignGroupBudgetFieldContainer_: WaMexPersistId
    readonly AdsBusinessWhatsAppBusinessAccountProviderPluginBSP: WaMexPersistId
    readonly AdsFocusFrameworkStickinessDataManager: WaMexPersistId
    readonly AdsInstagramAccountMediaListRIStoreSourceServer: WaMexPersistId
    readonly AdsManagerLiveDataCampaign: WaMexPersistId
    readonly AdsManagerLiveDataCampaignQueryPreloadingConfigNoSpecs: WaMexPersistId
    readonly AdsPLRAlphaBetaCheckUtilLogEntryPointExposure: WaMexPersistId
    readonly AdsUEditorAdgroupBrandedContentWAPreviewWrapper_: WaMexPersistId
    readonly AdsUEditorAdgroupMessageDestinationPageCategory: WaMexPersistId
    readonly AdsUEditorAdgroupMessageDestinationPreviewContainerCTWAWaba: WaMexPersistId
    readonly AdsUEditorAdgroupPartnershipAdsStatusVerifiedIdentities_: WaMexPersistId
    readonly AdvertiserProfileMessageMarketingDataStoreLoader: WaMexPersistId
    readonly AiAgentAutoReplyControl: WaMexPersistId
    readonly AuthAgentFeaturePolicy: WaMexPersistId
    readonly BPAccessTokenAndSessionCookies: WaMexPersistId
    readonly BizCreateOrder: WaMexPersistId
    readonly BizGetCategories: WaMexPersistId
    readonly BizGetCategoriesV2: WaMexPersistId
    readonly BizGetCustomUrlUserGraphql: WaMexPersistId
    readonly BizGetMerchantCompliance: WaMexPersistId
    readonly BizGetPriceTiers: WaMexPersistId
    readonly BizGetProfileShimlinks: WaMexPersistId
    readonly BizGraphQLRefreshCart: WaMexPersistId
    readonly BizProfileAddressAutocomplete: WaMexPersistId
    readonly BizProfileRoot: WaMexPersistId
    readonly BizQueryOrder: WaMexPersistId
    readonly BizSetMerchantCompliance: WaMexPersistId
    readonly BrResolvePaymentAccountLink: WaMexPersistId
    readonly CTXChatBuilderDialogContainerUtils: WaMexPersistId
    readonly CTXChatBuilderWAFlowsUtilsWAMFlowsCTWAEditorModal: WaMexPersistId
    readonly CachedToken: WaMexPersistId
    readonly CanonicalUserValid: WaMexPersistId
    readonly ChangeNewsletterOwner: WaMexPersistId
    readonly ClientEdgeQuery_AdsBulkEditAdgroupAgenticCheckoutOptInPlugin_Query_selected_ad_account__shops_ads_identity_product_catalog: WaMexPersistId
    readonly ClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_combined_campaign_group__product_catalog: WaMexPersistId
    readonly ClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_creative__product_set__product_catalog: WaMexPersistId
    readonly CoexCanonicalState: WaMexPersistId
    readonly ConsumerFetchQuickPromotions: WaMexPersistId
    readonly ConsumerQuickPromotionActionGraphQL: WaMexPersistId
    readonly ContactManagerCustomerProfile: WaMexPersistId
    readonly ContactManagerCustomerProfileDelete: WaMexPersistId
    readonly ContactManagerCustomerProfileUpsert: WaMexPersistId
    readonly ContactManagerCustomerProfiles: WaMexPersistId
    readonly CreateEnforcementAppeal: WaMexPersistId
    readonly CreateInviteCode: WaMexPersistId
    readonly CreateLabyrinthBackup: WaMexPersistId
    readonly CreateMarketingCampaignAction: WaMexPersistId
    readonly CreateNewsletter: WaMexPersistId
    readonly CreateNewsletterAdminInvite: WaMexPersistId
    readonly CreateReportAppeal: WaMexPersistId
    readonly CreateWhatsAppAdsIdentity: WaMexPersistId
    readonly CustomLabel3pdEvent: WaMexPersistId
    readonly CustomerManagerAccessState: WaMexPersistId
    readonly CustomerManagerCustomerProfileCustomFieldCreate: WaMexPersistId
    readonly CustomerManagerStartTrial: WaMexPersistId
    readonly DebugLabyrinthAddDevice: WaMexPersistId
    readonly DebugLabyrinthFetchVirtualDeviceInfo: WaMexPersistId
    readonly DebugLabyrinthInboxSnapshot: WaMexPersistId
    readonly DebugLabyrinthRange: WaMexPersistId
    readonly DebugLabyrinthRestorePage: WaMexPersistId
    readonly DeleteNewsletter: WaMexPersistId
    readonly DemoteNewsletterAdmin: WaMexPersistId
    readonly E2EEMetadataMailboxFetchGroupInfoV4: WaMexPersistId
    readonly EBMessageRangeQueryForThreads: WaMexPersistId
    readonly EditBizProfile: WaMexPersistId
    readonly EmailInviteSendGroup: WaMexPersistId
    readonly ExternalCtxAuthoriseWAChat: WaMexPersistId
    readonly FetchAllNewslettersMetadata: WaMexPersistId
    readonly FetchAllSubgroups: WaMexPersistId
    readonly FetchBotCertificateRevocationList: WaMexPersistId
    readonly FetchBotProfilesGQL: WaMexPersistId
    readonly FetchBotTasks: WaMexPersistId
    readonly FetchDynamicAIModes: WaMexPersistId
    readonly FetchGroupInfo: WaMexPersistId
    readonly FetchGroupInfoIncludBots: WaMexPersistId
    readonly FetchGroupInfoIncludBotsJobAcp2: WaMexPersistId
    readonly FetchGroupInfoJobAcp2: WaMexPersistId
    readonly FetchGroupInviteCode: WaMexPersistId
    readonly FetchGroupInviteInfo: WaMexPersistId
    readonly FetchGroupInviteInfoJobAddRequest: WaMexPersistId
    readonly FetchGroupIsInternal: WaMexPersistId
    readonly FetchGroupMembershipFormForJoinJobAddRequest: WaMexPersistId
    readonly FetchGroupMembershipFormForJoinJobInvite: WaMexPersistId
    readonly FetchGroupMembershipFormForJoinJobLinked: WaMexPersistId
    readonly FetchIntegritySignals: WaMexPersistId
    readonly FetchLabyrinthEpochChain: WaMexPersistId
    readonly FetchLabyrinthEpochDevices: WaMexPersistId
    readonly FetchLinkedGroupInfo: WaMexPersistId
    readonly FetchMembershipApprovalRequests: WaMexPersistId
    readonly FetchMetaOnePromoEligibility: WaMexPersistId
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
    readonly FetchPhoneNumberSharingSettings: WaMexPersistId
    readonly FetchPlaintextLinkPreview: WaMexPersistId
    readonly FetchQuickPromotions: WaMexPersistId
    readonly FetchReachoutTimelock: WaMexPersistId
    readonly FetchRecommendedNewsletters: WaMexPersistId
    readonly FetchSimilarNewsletters: WaMexPersistId
    readonly FetchSubgroupSuggestions: WaMexPersistId
    readonly FetchSubscriptionEntryPoints: WaMexPersistId
    readonly FetchSubscriptions: WaMexPersistId
    readonly FetchTextStatusList: WaMexPersistId
    readonly FetchWassBotListProfilesGQL: WaMexPersistId
    readonly FetchWassBotProfileGQL: WaMexPersistId
    readonly GetAccessTokenFromOIDCCode: WaMexPersistId
    readonly GetAccountNonce: WaMexPersistId
    readonly GetDsbInfo: WaMexPersistId
    readonly GetFBAccountPages: WaMexPersistId
    readonly GetNumbersForBrandIds: WaMexPersistId
    readonly GetPrivacyLists: WaMexPersistId
    readonly GetPrivacySettings: WaMexPersistId
    readonly GetUsername: WaMexPersistId
    readonly GetWAAEligibility: WaMexPersistId
    readonly GetWoasAgeSignal: WaMexPersistId
    readonly GraphQLProductCatalogGetPublicKey: WaMexPersistId
    readonly GraphQLVerifyPostcode: WaMexPersistId
    readonly GroupJoin: WaMexPersistId
    readonly GroupStoreAndSendInviteSms: WaMexPersistId
    readonly GroupStoreInviteSms: WaMexPersistId
    readonly GroupSuspensionAppeal: WaMexPersistId
    readonly IntegrityChallengeResponse: WaMexPersistId
    readonly InternalDirectoryFetchMembers: WaMexPersistId
    readonly JoinNewsletter: WaMexPersistId
    readonly KeyTransparencyGraphQLClient_: WaMexPersistId
    readonly LeaveNewsletter: WaMexPersistId
    readonly LidChangeNotification: WaMexPersistId
    readonly LogNewsletterExposures: WaMexPersistId
    readonly LogServerSentInviteIntent: WaMexPersistId
    readonly MAIBAAdObjectReference_StoryMetadata: WaMexPersistId
    readonly MAIBAChatThread: WaMexPersistId
    readonly MAIBAGraphQLSendMessageV2Query: WaMexPersistId
    readonly MAIBAGraphQLSendMessageV3Query: WaMexPersistId
    readonly MAIBAGraphQLSendMessageV4Query: WaMexPersistId
    readonly MAIBAPageReference: WaMexPersistId
    readonly MAIBAUpdateAdsAIConsent: WaMexPersistId
    readonly MetaPayVaultInitialize: WaMexPersistId
    readonly MetaPayVaultLabyrinthDelete: WaMexPersistId
    readonly MetaPayVaultLabyrinthFetchAll: WaMexPersistId
    readonly MetaPayVaultLabyrinthSave: WaMexPersistId
    readonly NativeMLModel: WaMexPersistId
    readonly NewsletterAddPaidPartnershipLabel: WaMexPersistId
    readonly NewsletterBlockUser: WaMexPersistId
    readonly NewsletterLabelAiContent: WaMexPersistId
    readonly NewsletterPinMessages: WaMexPersistId
    readonly NewsletterQuestionResponseStateUpdate: WaMexPersistId
    readonly NewsletterUnpinMessages: WaMexPersistId
    readonly OrgAdminGraphQLAddChannel: WaMexPersistId
    readonly OrgAdminGraphQLAddGroup: WaMexPersistId
    readonly OrgAdminGraphQLAdminRoster: WaMexPersistId
    readonly OrgAdminGraphQLApplyAdminRosterChanges: WaMexPersistId
    readonly OrgAdminGraphQLDirectoryPage: WaMexPersistId
    readonly OrgAdminGraphQLEventRsvpCounts: WaMexPersistId
    readonly OrgAdminGraphQLGroup: WaMexPersistId
    readonly OrgAdminGraphQLInviteMembers: WaMexPersistId
    readonly OrgAdminGraphQLLeave: WaMexPersistId
    readonly OrgAdminGraphQLManagedChannelAdmins: WaMexPersistId
    readonly OrgAdminGraphQLManagedChannels: WaMexPersistId
    readonly OrgAdminGraphQLManagedEvents: WaMexPersistId
    readonly OrgAdminGraphQLManagedGroups: WaMexPersistId
    readonly OrgAdminGraphQLMemberSearch: WaMexPersistId
    readonly OrgAdminGraphQLOrgs: WaMexPersistId
    readonly OrgAdminGraphQLRemoveMember: WaMexPersistId
    readonly OrgAdminGraphQLSendManagedGroupEmailInvites: WaMexPersistId
    readonly OrgAdminGraphQLSetMemberRole: WaMexPersistId
    readonly OrgAdminGraphQLSubmitBulkGroupRequest: WaMexPersistId
    readonly OrgAdminGraphQLUpdateOrg: WaMexPersistId
    readonly OrgMemberUpdateNotificationHandler: WaMexPersistId
    readonly PaymentsPasskeyHasCredential: WaMexPersistId
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
    readonly RequestOTE: WaMexPersistId
    readonly ResolveAccountTypeAndAdPage: WaMexPersistId
    readonly ResolveAccountTypeAndAdPageQuery: WaMexPersistId
    readonly RevokeNewsletterAdminInvite: WaMexPersistId
    readonly RotateLabyrinthEpoch: WaMexPersistId
    readonly SaveResponseTonePreference: WaMexPersistId
    readonly SetUsername: WaMexPersistId
    readonly SetUsernameKey: WaMexPersistId
    readonly SharableEventAddInvitations: WaMexPersistId
    readonly SharableEventCreate: WaMexPersistId
    readonly SharableEventDelete: WaMexPersistId
    readonly SharableEventGet: WaMexPersistId
    readonly SharableEventGuestJoinedWaNotifications: WaMexPersistId
    readonly SharableEventInviteLinkJobGetOrCreate: WaMexPersistId
    readonly SharableEventInviteLinkJobInvalidate: WaMexPersistId
    readonly SharableEventInviteLinkJobRotate: WaMexPersistId
    readonly SharableEventJoinViaLink: WaMexPersistId
    readonly SharableEventLeave: WaMexPersistId
    readonly SharableEventLinkPreview: WaMexPersistId
    readonly SharableEventList: WaMexPersistId
    readonly SharableEventPlaceSearch: WaMexPersistId
    readonly SharableEventPresetCovers: WaMexPersistId
    readonly SharableEventReconcile: WaMexPersistId
    readonly SharableEventRemoveInvitations: WaMexPersistId
    readonly SharableEventUpdate: WaMexPersistId
    readonly SharableEventUpdateRsvp: WaMexPersistId
    readonly SignupMetadata: WaMexPersistId
    readonly SkipStoppedMessages: WaMexPersistId
    readonly StartConversationTemplateReengagementWithCatalogSection: WaMexPersistId
    readonly StartConversationsTemplateCustomerActionsSectionIsEligibleForAIRegeneration: WaMexPersistId
    readonly StartConversationsTemplateDialogContainerBodyGraphQLWelcomeMessageFlows: WaMexPersistId
    readonly StartConversationsTemplateFAQGenAIRegeneration: WaMexPersistId
    readonly SubscriptionWaffleAgeCheck: WaMexPersistId
    readonly SupportBugReportCreateDogfoodingTask: WaMexPersistId
    readonly SupportBugReportSubmit: WaMexPersistId
    readonly SupportChatAuthRefresh: WaMexPersistId
    readonly SupportContactFormSubmit: WaMexPersistId
    readonly SupportMessageFeedbackSubmit: WaMexPersistId
    readonly TeamLinkCreateInvitation: WaMexPersistId
    readonly TeamLinkListInvitations: WaMexPersistId
    readonly TeamLinkRemoveInvitation: WaMexPersistId
    readonly TeamLinkUpdateAgentRole: WaMexPersistId
    readonly TransferCommunityOwnership: WaMexPersistId
    readonly UpdateGroupProperty: WaMexPersistId
    readonly UpdateNewsletter: WaMexPersistId
    readonly UpdateNewsletterAdminProfile: WaMexPersistId
    readonly UpdateNewsletterAdminProfileSetting: WaMexPersistId
    readonly UpdateNewsletterUserSetting: WaMexPersistId
    readonly UpdateTextStatus: WaMexPersistId
    readonly UploadLabyrinthMessages: WaMexPersistId
    readonly UsernameAvailability: WaMexPersistId
    readonly Usync: WaMexPersistId
    readonly WAAOnboarding: WaMexPersistId
    readonly WAMFlowsCTWAEditorModal: WaMexPersistId
    readonly WAMFlowsCTWAFlowPreview: WaMexPersistId
    readonly WODirectoryFetchCompanyName: WaMexPersistId
    readonly WaffleFXServiceDataQueryV2: WaMexPersistId
    readonly WaffleFXWAMOUpdateUOOM: WaMexPersistId
    readonly WaffleXE: WaMexPersistId
    readonly WhatsAppMarketingCampaignCustomerListPickerLists: WaMexPersistId
    readonly fetchWebsiteMediaImageURLs: WaMexPersistId
    readonly navigateToProductInsightsWithDefaultTab: WaMexPersistId
    readonly useFetchAdAccountsForL4Context: WaMexPersistId
    readonly useFetchAdAccountsNameById: WaMexPersistId
    readonly useFlowJSONValidationLibrary: WaMexPersistId
    readonly useIsMessengerPlatformBot: WaMexPersistId
    readonly useMAIBAAsyncNotification: WaMexPersistId
    readonly useMAIBAMedia: WaMexPersistId
    readonly useWAWebEstimatedDailyReach: WaMexPersistId
    readonly useWAWebEstimatedDailyReachShadow: WaMexPersistId
    readonly useWAWebSmartComposerCoachSuggestedReply: WaMexPersistId
    readonly useWAWebSmartComposerReportThreadEvent: WaMexPersistId
    readonly useWAWebSmartComposerReportUsed: WaMexPersistId
}

export declare const WA_MEX_OPERATION_SCHEMAS: {
    readonly ACSServerProviderConfig: WaMexOperationSchema<'query', readonly ['project_name']>
    readonly ACSServerProviderIssuance: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly AECompanionOffboard: WaMexOperationSchema<'mutation', readonly ['phoneNumber']>
    readonly AECompanionOnboard: WaMexOperationSchema<'mutation', readonly ['phoneNumber']>
    readonly AcceptNewsletterAdminInvite: WaMexOperationSchema<'mutation', readonly ['newsletter_id']>
    readonly AccountLinkingAPIGetCerts: WaMexOperationSchema<'query', readonly []>
    readonly AdAccountDpaEligibleProductCatalogListStoreSource: WaMexOperationSchema<'query', readonly ['filters', 'include_product_count_issues', 'is_additional_cms_fields_enabled', 'is_optimisation_enabled', 'legacy_account_id', 'limit', 'skip_unused_catalog_fields', 'skip_user_tasks']>
    readonly AdPreferencesDFCABusinessOptOut: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly AdPreferencesDemographicCategoryOptOut: WaMexOperationSchema<'mutation', readonly ['bctID', 'isUndo']>
    readonly AdPreferencesHideAdvertiser: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly AdPreferencesInterestCategoryOptOut: WaMexOperationSchema<'mutation', readonly ['interestID', 'isUndo']>
    readonly AddLabyrinthPeerDevice: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly AdsAccountDataDispatcher: WaMexOperationSchema<'query', readonly ['adAccountID']>
    readonly AdsAccountDataDispatcherViewerPermissions: WaMexOperationSchema<'query', readonly ['ad_account_id']>
    readonly AdsAccountStoreNewSourceServer: WaMexOperationSchema<'query', readonly ['adAccountID', 'is_pending_numbers_exposure_flag_enabled', 'useAdAccountRef']>
    readonly AdsAdAccountSettingsStoreSetAPlusCFeatureStickyStatus: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly AdsAdAccountSettingsStoreSetL1AESourceStickyStatus: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly AdsAdAccountSettingsStoreSetMultiMediaStickyStatus: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly AdsAdAccountSettingsStoreSetVideoOptimizationStickyStatus: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly AdsAdAccountSettingsStoreSourceServer: WaMexOperationSchema<'query', readonly ['ad_account_id']>
    readonly AdsBulkEditCampaignGroupAgencyFeeBulkContainer: WaMexOperationSchema<'query', readonly ['adAccountID']>
    readonly AdsBulkEditCampaignGroupAgencyFeeContainerAdAccountAgencyFee: WaMexOperationSchema<'query', readonly ['adAccountID']>
    readonly AdsBulkEditCampaignGroupBudgetFieldContainer_: WaMexOperationSchema<'query', readonly ['accountID', 'ads_andromeda_bulk_edit_campaign_group_budget', 'campaignGroupRelayIDs', 'contextKey']>
    readonly AdsBusinessWhatsAppBusinessAccountProviderPluginBSP: WaMexOperationSchema<'query', readonly ['wabaIds']>
    readonly AdsFocusFrameworkStickinessDataManager: WaMexOperationSchema<'query', readonly ['ad_account_id']>
    readonly AdsInstagramAccountMediaListRIStoreSourceServer: WaMexOperationSchema<'query', readonly ['after', 'caption_text', 'fbidv2', 'first', 'is_ad', 'is_threads', 'media_type', 'order_by']>
    readonly AdsManagerLiveDataCampaign: WaMexOperationSchema<'query', readonly ['ids', 'skip_data_transform']>
    readonly AdsManagerLiveDataCampaignQueryPreloadingConfigNoSpecs: WaMexOperationSchema<'query', readonly []>
    readonly AdsPLRAlphaBetaCheckUtilLogEntryPointExposure: WaMexOperationSchema<'mutation', readonly ['ad_account_id', 'requires_full_report', 'surface']>
    readonly AdsUEditorAdgroupBrandedContentWAPreviewWrapper_: WaMexOperationSchema<'query', readonly ['accountID', 'adgroupRelayIDs', 'businessID', 'campaignGroupRelayIDs', 'campaignRelayIDs', 'skip_business_query', 'use_waac']>
    readonly AdsUEditorAdgroupMessageDestinationPageCategory: WaMexOperationSchema<'query', readonly ['pageID']>
    readonly AdsUEditorAdgroupMessageDestinationPreviewContainerCTWAWaba: WaMexOperationSchema<'query', readonly ['adAccountID', 'skipRequest']>
    readonly AdsUEditorAdgroupPartnershipAdsStatusVerifiedIdentities_: WaMexOperationSchema<'query', readonly ['hasPrimaryPage', 'hasSecondaryPage', 'primaryPageID', 'secondaryPageID']>
    readonly AdvertiserProfileMessageMarketingDataStoreLoader: WaMexOperationSchema<'query', readonly ['adAccountID']>
    readonly AiAgentAutoReplyControl: WaMexOperationSchema<'mutation', readonly ['consumer_lid', 'phone_number', 'thread_status']>
    readonly AuthAgentFeaturePolicy: WaMexOperationSchema<'query', readonly []>
    readonly BPAccessTokenAndSessionCookies: WaMexOperationSchema<'mutation', readonly ['application_id', 'code']>
    readonly BizCreateOrder: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly BizGetCategories: WaMexOperationSchema<'query', readonly ['query_params']>
    readonly BizGetCategoriesV2: WaMexOperationSchema<'query', readonly ['query_params']>
    readonly BizGetCustomUrlUserGraphql: WaMexOperationSchema<'query', readonly ['data']>
    readonly BizGetMerchantCompliance: WaMexOperationSchema<'query', readonly ['request']>
    readonly BizGetPriceTiers: WaMexOperationSchema<'query', readonly ['request']>
    readonly BizGetProfileShimlinks: WaMexOperationSchema<'query', readonly ['bizJid']>
    readonly BizGraphQLRefreshCart: WaMexOperationSchema<'query', readonly ['request']>
    readonly BizProfileAddressAutocomplete: WaMexOperationSchema<'query', readonly ['input']>
    readonly BizProfileRoot: WaMexOperationSchema<'query', readonly []>
    readonly BizQueryOrder: WaMexOperationSchema<'query', readonly ['request']>
    readonly BizSetMerchantCompliance: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly BrResolvePaymentAccountLink: WaMexOperationSchema<'query', readonly ['request']>
    readonly CTXChatBuilderDialogContainerUtils: WaMexOperationSchema<'query', readonly ['input']>
    readonly CTXChatBuilderWAFlowsUtilsWAMFlowsCTWAEditorModal: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CachedToken: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CanonicalUserValid: WaMexOperationSchema<'query', readonly []>
    readonly ChangeNewsletterOwner: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'user_id']>
    readonly ClientEdgeQuery_AdsBulkEditAdgroupAgenticCheckoutOptInPlugin_Query_selected_ad_account__shops_ads_identity_product_catalog: WaMexOperationSchema<'query', readonly ['id']>
    readonly ClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_combined_campaign_group__product_catalog: WaMexOperationSchema<'query', readonly ['id']>
    readonly ClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_creative__product_set__product_catalog: WaMexOperationSchema<'query', readonly ['id']>
    readonly CoexCanonicalState: WaMexOperationSchema<'query', readonly ['request']>
    readonly ConsumerFetchQuickPromotions: WaMexOperationSchema<'query', readonly ['nux_ids', 'trigger_context']>
    readonly ConsumerQuickPromotionActionGraphQL: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly ContactManagerCustomerProfile: WaMexOperationSchema<'query', readonly ['lid']>
    readonly ContactManagerCustomerProfileDelete: WaMexOperationSchema<'mutation', readonly ['lid']>
    readonly ContactManagerCustomerProfileUpsert: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly ContactManagerCustomerProfiles: WaMexOperationSchema<'query', readonly ['includeCustomFields', 'input']>
    readonly CreateEnforcementAppeal: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CreateInviteCode: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CreateLabyrinthBackup: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CreateMarketingCampaignAction: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CreateNewsletter: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CreateNewsletterAdminInvite: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'user_id']>
    readonly CreateReportAppeal: WaMexOperationSchema<'mutation', readonly ['reason', 'report_id']>
    readonly CreateWhatsAppAdsIdentity: WaMexOperationSchema<'mutation', readonly ['code', 'lid', 'phone_number']>
    readonly CustomLabel3pdEvent: WaMexOperationSchema<'query', readonly ['custom_labels', 'expt_group']>
    readonly CustomerManagerAccessState: WaMexOperationSchema<'query', readonly []>
    readonly CustomerManagerCustomerProfileCustomFieldCreate: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly CustomerManagerStartTrial: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly DebugLabyrinthAddDevice: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly DebugLabyrinthFetchVirtualDeviceInfo: WaMexOperationSchema<'query', readonly ['input']>
    readonly DebugLabyrinthInboxSnapshot: WaMexOperationSchema<'query', readonly ['clientSealToken', 'deviceId', 'locallyAvailableEpochIds', 'messageFirst', 'threadFirst']>
    readonly DebugLabyrinthRange: WaMexOperationSchema<'query', readonly ['device_id', 'message_count', 'partial_thread_id']>
    readonly DebugLabyrinthRestorePage: WaMexOperationSchema<'query', readonly ['after', 'device_id', 'locally_available_epoch_ids', 'message_count', 'partial_thread_id']>
    readonly DeleteNewsletter: WaMexOperationSchema<'mutation', readonly ['newsletter_id']>
    readonly DemoteNewsletterAdmin: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'user_id']>
    readonly E2EEMetadataMailboxFetchGroupInfoV4: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly EBMessageRangeQueryForThreads: WaMexOperationSchema<'query', readonly ['app_id', 'includeAttachmentData', 'restore_payload_strings', 'restore_type']>
    readonly EditBizProfile: WaMexOperationSchema<'mutation', readonly ['input', 'lid']>
    readonly EmailInviteSendGroup: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly ExternalCtxAuthoriseWAChat: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly FetchAllNewslettersMetadata: WaMexOperationSchema<'query', readonly ['fetch_status_metadata', 'fetch_wamo_sub']>
    readonly FetchAllSubgroups: WaMexOperationSchema<'query', readonly ['group_id', 'query_context', 'sub_group_hint_id']>
    readonly FetchBotCertificateRevocationList: WaMexOperationSchema<'query', readonly ['crl_name']>
    readonly FetchBotProfilesGQL: WaMexOperationSchema<'query', readonly ['ids']>
    readonly FetchBotTasks: WaMexOperationSchema<'query', readonly ['first', 'statuses', 'suggestedLimit', 'surface']>
    readonly FetchDynamicAIModes: WaMexOperationSchema<'query', readonly []>
    readonly FetchGroupInfo: WaMexOperationSchema<'query', readonly ['id', 'include_membership_form', 'include_username', 'participants_phash', 'query_context']>
    readonly FetchGroupInfoIncludBots: WaMexOperationSchema<'query', readonly ['id', 'include_membership_form', 'include_username', 'participants_phash', 'query_context']>
    readonly FetchGroupInfoIncludBotsJobAcp2: WaMexOperationSchema<'query', readonly ['id', 'include_membership_form', 'include_username', 'participants_phash', 'query_context']>
    readonly FetchGroupInfoJobAcp2: WaMexOperationSchema<'query', readonly ['id', 'include_membership_form', 'include_username', 'participants_phash', 'query_context']>
    readonly FetchGroupInviteCode: WaMexOperationSchema<'query', readonly ['id', 'query_context']>
    readonly FetchGroupInviteInfo: WaMexOperationSchema<'query', readonly ['include_username', 'invite_code']>
    readonly FetchGroupInviteInfoJobAddRequest: WaMexOperationSchema<'query', readonly ['add_request', 'group_jid', 'include_username']>
    readonly FetchGroupIsInternal: WaMexOperationSchema<'query', readonly ['id']>
    readonly FetchGroupMembershipFormForJoinJobAddRequest: WaMexOperationSchema<'query', readonly ['add_request', 'group_jid']>
    readonly FetchGroupMembershipFormForJoinJobInvite: WaMexOperationSchema<'query', readonly ['invite_code']>
    readonly FetchGroupMembershipFormForJoinJobLinked: WaMexOperationSchema<'query', readonly ['group_jid', 'sub_group_jid_hint']>
    readonly FetchIntegritySignals: WaMexOperationSchema<'query', readonly ['input']>
    readonly FetchLabyrinthEpochChain: WaMexOperationSchema<'query', readonly []>
    readonly FetchLabyrinthEpochDevices: WaMexOperationSchema<'query', readonly []>
    readonly FetchLinkedGroupInfo: WaMexOperationSchema<'query', readonly ['group_jid', 'include_username', 'sub_group_jid_hint']>
    readonly FetchMembershipApprovalRequests: WaMexOperationSchema<'query', readonly ['id', 'include_membership_form', 'include_username', 'query_context']>
    readonly FetchMetaOnePromoEligibility: WaMexOperationSchema<'query', readonly ['request']>
    readonly FetchNewChatMessageCappingInfo: WaMexOperationSchema<'query', readonly ['input']>
    readonly FetchNewsletter: WaMexOperationSchema<'query', readonly ['fetch_creation_time', 'fetch_full_image', 'fetch_pinned_messages', 'fetch_status_metadata', 'fetch_viewer_metadata', 'fetch_wamo_sub', 'input']>
    readonly FetchNewsletterAdminCapabilities: WaMexOperationSchema<'query', readonly ['newsletter_id']>
    readonly FetchNewsletterAdminInfo: WaMexOperationSchema<'query', readonly ['newsletter_id']>
    readonly FetchNewsletterDehydrated: WaMexOperationSchema<'query', readonly ['fetch_pinned_messages', 'fetch_wamo_sub', 'input']>
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
    readonly FetchNewsletterReports: WaMexOperationSchema<'query', readonly ['locale']>
    readonly FetchOHAIKeyConfig: WaMexOperationSchema<'query', readonly []>
    readonly FetchOIDCState: WaMexOperationSchema<'query', readonly []>
    readonly FetchPhoneNumberSharingSettings: WaMexOperationSchema<'query', readonly ['input']>
    readonly FetchPlaintextLinkPreview: WaMexOperationSchema<'query', readonly ['input']>
    readonly FetchQuickPromotions: WaMexOperationSchema<'query', readonly ['nux_ids', 'trigger_context']>
    readonly FetchReachoutTimelock: WaMexOperationSchema<'query', readonly []>
    readonly FetchRecommendedNewsletters: WaMexOperationSchema<'query', readonly ['fetch_status_metadata', 'input']>
    readonly FetchSimilarNewsletters: WaMexOperationSchema<'query', readonly ['fetch_status_metadata', 'input']>
    readonly FetchSubgroupSuggestions: WaMexOperationSchema<'query', readonly ['group_id', 'query_context', 'sub_group_hint_id']>
    readonly FetchSubscriptionEntryPoints: WaMexOperationSchema<'query', readonly ['subscriptionTypes']>
    readonly FetchSubscriptions: WaMexOperationSchema<'query', readonly ['data']>
    readonly FetchTextStatusList: WaMexOperationSchema<'query', readonly ['input']>
    readonly FetchWassBotListProfilesGQL: WaMexOperationSchema<'query', readonly []>
    readonly FetchWassBotProfileGQL: WaMexOperationSchema<'query', readonly ['botFbid', 'groupJid']>
    readonly GetAccessTokenFromOIDCCode: WaMexOperationSchema<'mutation', readonly ['code', 'state']>
    readonly GetAccountNonce: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly GetDsbInfo: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly GetFBAccountPages: WaMexOperationSchema<'query', readonly ['userId']>
    readonly GetNumbersForBrandIds: WaMexOperationSchema<'query', readonly ['input']>
    readonly GetPrivacyLists: WaMexOperationSchema<'query', readonly ['input']>
    readonly GetPrivacySettings: WaMexOperationSchema<'query', readonly ['input']>
    readonly GetUsername: WaMexOperationSchema<'query', readonly []>
    readonly GetWAAEligibility: WaMexOperationSchema<'query', readonly ['input']>
    readonly GetWoasAgeSignal: WaMexOperationSchema<'query', readonly ['input']>
    readonly GraphQLProductCatalogGetPublicKey: WaMexOperationSchema<'query', readonly ['request']>
    readonly GraphQLVerifyPostcode: WaMexOperationSchema<'query', readonly ['request']>
    readonly GroupJoin: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly GroupStoreAndSendInviteSms: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly GroupStoreInviteSms: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly GroupSuspensionAppeal: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly IntegrityChallengeResponse: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly InternalDirectoryFetchMembers: WaMexOperationSchema<'query', readonly ['after', 'first']>
    readonly JoinNewsletter: WaMexOperationSchema<'mutation', readonly ['newsletter_id']>
    readonly KeyTransparencyGraphQLClient_: WaMexOperationSchema<'query', readonly ['auditor_ids', 'requested_accounts', 'serfmt']>
    readonly LeaveNewsletter: WaMexOperationSchema<'mutation', readonly ['newsletter_id']>
    readonly LidChangeNotification: WaMexOperationSchema<'query', readonly []>
    readonly LogNewsletterExposures: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly LogServerSentInviteIntent: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly MAIBAAdObjectReference_StoryMetadata: WaMexOperationSchema<'query', readonly ['storyId']>
    readonly MAIBAChatThread: WaMexOperationSchema<'query', readonly ['externalConversationId', 'shouldFetchMessageDebugInfo']>
    readonly MAIBAGraphQLSendMessageV2Query: WaMexOperationSchema<'mutation', readonly ['adminText', 'clientContext', 'connections', 'contextChips', 'displayMessage', 'entrypoint', 'externalConversationId', 'hideUserMessage', 'includeEntryPointClaimState', 'isInsituPregeneration', 'isNewConversation', 'isSentFromOutOfChat', 'message', 'messageType', 'offlineThreadingId', 'postbackPayload', 'requestedReasoningEffort', 'requestedReasoningMode', 'selectedAssets', 'selectedSuggestedPrompt', 'selectedText', 'shouldFetchMessageDebugInfo', 'userMediaAttachments']>
    readonly MAIBAGraphQLSendMessageV3Query: WaMexOperationSchema<'mutation', readonly ['adminText', 'clientContext', 'contextChips', 'displayMessage', 'entrypoint', 'externalConversationId', 'hideUserMessage', 'includeEntryPointClaimState', 'isInsituPregeneration', 'isNewConversation', 'isSentFromOutOfChat', 'message', 'messageType', 'offlineThreadingId', 'postbackPayload', 'requestedReasoningEffort', 'requestedReasoningMode', 'selectedAssets', 'selectedSuggestedPrompt', 'selectedText', 'userMediaAttachments']>
    readonly MAIBAGraphQLSendMessageV4Query: WaMexOperationSchema<'mutation', readonly ['adminText', 'clientContext', 'contextChips', 'displayMessage', 'entrypoint', 'externalConversationId', 'hideUserMessage', 'includeEntryPointClaimState', 'isNewConversation', 'isSentFromOutOfChat', 'message', 'messageType', 'offlineThreadingId', 'postbackPayload', 'requestedReasoningEffort', 'requestedReasoningMode', 'selectedAssets', 'selectedSuggestedPrompt', 'selectedText', 'streamSessionId', 'userMediaAttachments']>
    readonly MAIBAPageReference: WaMexOperationSchema<'query', readonly ['id']>
    readonly MAIBAUpdateAdsAIConsent: WaMexOperationSchema<'mutation', readonly []>
    readonly MetaPayVaultInitialize: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly MetaPayVaultLabyrinthDelete: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly MetaPayVaultLabyrinthFetchAll: WaMexOperationSchema<'query', readonly ['input']>
    readonly MetaPayVaultLabyrinthSave: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly NativeMLModel: WaMexOperationSchema<'query', readonly ['client_capability_metadata', 'model_request_metadatas']>
    readonly NewsletterAddPaidPartnershipLabel: WaMexOperationSchema<'mutation', readonly ['message_type', 'newsletter_id', 'server_id']>
    readonly NewsletterBlockUser: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'response_server_id', 'server_id']>
    readonly NewsletterLabelAiContent: WaMexOperationSchema<'mutation', readonly ['message_type', 'newsletter_id', 'server_id']>
    readonly NewsletterPinMessages: WaMexOperationSchema<'mutation', readonly ['input', 'newsletter_id']>
    readonly NewsletterQuestionResponseStateUpdate: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'response_server_id', 'server_id', 'state']>
    readonly NewsletterUnpinMessages: WaMexOperationSchema<'mutation', readonly ['input', 'newsletter_id']>
    readonly OrgAdminGraphQLAddChannel: WaMexOperationSchema<'mutation', readonly ['channelID', 'orgID']>
    readonly OrgAdminGraphQLAddGroup: WaMexOperationSchema<'mutation', readonly ['gid', 'orgID']>
    readonly OrgAdminGraphQLAdminRoster: WaMexOperationSchema<'query', readonly ['orgID']>
    readonly OrgAdminGraphQLApplyAdminRosterChanges: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly OrgAdminGraphQLDirectoryPage: WaMexOperationSchema<'query', readonly ['first', 'orgID']>
    readonly OrgAdminGraphQLEventRsvpCounts: WaMexOperationSchema<'query', readonly ['eventID']>
    readonly OrgAdminGraphQLGroup: WaMexOperationSchema<'query', readonly ['gid', 'orgID']>
    readonly OrgAdminGraphQLInviteMembers: WaMexOperationSchema<'mutation', readonly ['orgID', 'resend', 'rosterEntryIDs']>
    readonly OrgAdminGraphQLLeave: WaMexOperationSchema<'mutation', readonly ['orgID']>
    readonly OrgAdminGraphQLManagedChannelAdmins: WaMexOperationSchema<'query', readonly ['channelID', 'orgID']>
    readonly OrgAdminGraphQLManagedChannels: WaMexOperationSchema<'query', readonly ['orgID']>
    readonly OrgAdminGraphQLManagedEvents: WaMexOperationSchema<'query', readonly ['orgID']>
    readonly OrgAdminGraphQLManagedGroups: WaMexOperationSchema<'query', readonly ['orgID']>
    readonly OrgAdminGraphQLMemberSearch: WaMexOperationSchema<'query', readonly ['after', 'first', 'memberTag', 'orgID', 'query']>
    readonly OrgAdminGraphQLOrgs: WaMexOperationSchema<'query', readonly []>
    readonly OrgAdminGraphQLRemoveMember: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly OrgAdminGraphQLSendManagedGroupEmailInvites: WaMexOperationSchema<'mutation', readonly ['gid', 'orgID', 'rosterEntryIDs', 'utmCampaign']>
    readonly OrgAdminGraphQLSetMemberRole: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly OrgAdminGraphQLSubmitBulkGroupRequest: WaMexOperationSchema<'mutation', readonly ['createGroupsPlan', 'operation', 'orgID']>
    readonly OrgAdminGraphQLUpdateOrg: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly OrgMemberUpdateNotificationHandler: WaMexOperationSchema<'query', readonly []>
    readonly PaymentsPasskeyHasCredential: WaMexOperationSchema<'query', readonly []>
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
    readonly RequestOTE: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly ResolveAccountTypeAndAdPage: WaMexOperationSchema<'mutation', readonly []>
    readonly ResolveAccountTypeAndAdPageQuery: WaMexOperationSchema<'query', readonly ['pageId']>
    readonly RevokeNewsletterAdminInvite: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'user_id']>
    readonly RotateLabyrinthEpoch: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SaveResponseTonePreference: WaMexOperationSchema<'mutation', readonly ['comparison_conversation_id', 'external_conversation_id', 'preference']>
    readonly SetUsername: WaMexOperationSchema<'mutation', readonly ['input', 'reserved', 'session_id', 'source']>
    readonly SetUsernameKey: WaMexOperationSchema<'mutation', readonly ['pin']>
    readonly SharableEventAddInvitations: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SharableEventCreate: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SharableEventDelete: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SharableEventGet: WaMexOperationSchema<'query', readonly ['input']>
    readonly SharableEventGuestJoinedWaNotifications: WaMexOperationSchema<'query', readonly []>
    readonly SharableEventInviteLinkJobGetOrCreate: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SharableEventInviteLinkJobInvalidate: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SharableEventInviteLinkJobRotate: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SharableEventJoinViaLink: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SharableEventLeave: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SharableEventLinkPreview: WaMexOperationSchema<'query', readonly ['input']>
    readonly SharableEventList: WaMexOperationSchema<'query', readonly ['input']>
    readonly SharableEventPlaceSearch: WaMexOperationSchema<'query', readonly ['input']>
    readonly SharableEventPresetCovers: WaMexOperationSchema<'query', readonly ['input']>
    readonly SharableEventReconcile: WaMexOperationSchema<'query', readonly ['input']>
    readonly SharableEventRemoveInvitations: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SharableEventUpdate: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SharableEventUpdateRsvp: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SignupMetadata: WaMexOperationSchema<'query', readonly ['phone_number', 'signup_id']>
    readonly SkipStoppedMessages: WaMexOperationSchema<'mutation', readonly ['external_conversation_id', 'linked_ad_account_id', 'offline_threading_id', 'surface']>
    readonly StartConversationTemplateReengagementWithCatalogSection: WaMexOperationSchema<'query', readonly ['page_id']>
    readonly StartConversationsTemplateCustomerActionsSectionIsEligibleForAIRegeneration: WaMexOperationSchema<'query', readonly ['ad_account_id', 'ad_caption', 'destination_type', 'page_id', 'post_id', 'skip']>
    readonly StartConversationsTemplateDialogContainerBodyGraphQLWelcomeMessageFlows: WaMexOperationSchema<'query', readonly ['input', 'tooltipPageIDs']>
    readonly StartConversationsTemplateFAQGenAIRegeneration: WaMexOperationSchema<'mutation', readonly ['ad_account_id', 'ad_caption', 'ad_id', 'current_icebreaker', 'destination_type', 'ent_id', 'page_id', 'post_id']>
    readonly SubscriptionWaffleAgeCheck: WaMexOperationSchema<'query', readonly []>
    readonly SupportBugReportCreateDogfoodingTask: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SupportBugReportSubmit: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SupportChatAuthRefresh: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SupportContactFormSubmit: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly SupportMessageFeedbackSubmit: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly TeamLinkCreateInvitation: WaMexOperationSchema<'mutation', readonly ['employeeName', 'lid', 'teamRole']>
    readonly TeamLinkListInvitations: WaMexOperationSchema<'query', readonly []>
    readonly TeamLinkRemoveInvitation: WaMexOperationSchema<'mutation', readonly ['lid']>
    readonly TeamLinkUpdateAgentRole: WaMexOperationSchema<'mutation', readonly ['employeeName', 'lid', 'teamRole']>
    readonly TransferCommunityOwnership: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly UpdateGroupProperty: WaMexOperationSchema<'mutation', readonly ['group_id', 'update']>
    readonly UpdateNewsletter: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'updates']>
    readonly UpdateNewsletterAdminProfile: WaMexOperationSchema<'mutation', readonly ['admin_profile', 'newsletter_id']>
    readonly UpdateNewsletterAdminProfileSetting: WaMexOperationSchema<'mutation', readonly ['newsletter_id', 'updates']>
    readonly UpdateNewsletterUserSetting: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly UpdateTextStatus: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly UploadLabyrinthMessages: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly UsernameAvailability: WaMexOperationSchema<'query', readonly ['input', 'session_id', 'source']>
    readonly Usync: WaMexOperationSchema<'query', readonly ['include_country_code', 'include_orgs', 'include_username', 'input']>
    readonly WAAOnboarding: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly WAMFlowsCTWAEditorModal: WaMexOperationSchema<'query', readonly ['adObjective', 'businessName', 'flowId', 'skipRequest']>
    readonly WAMFlowsCTWAFlowPreview: WaMexOperationSchema<'query', readonly ['adObjective', 'businessName', 'defaultCtaToGetStarted', 'flowId', 'skipRequest']>
    readonly WODirectoryFetchCompanyName: WaMexOperationSchema<'query', readonly ['lid']>
    readonly WaffleFXServiceDataQueryV2: WaMexOperationSchema<'mutation', readonly []>
    readonly WaffleFXWAMOUpdateUOOM: WaMexOperationSchema<'mutation', readonly []>
    readonly WaffleXE: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly WhatsAppMarketingCampaignCustomerListPickerLists: WaMexOperationSchema<'query', readonly ['wabaId']>
    readonly fetchWebsiteMediaImageURLs: WaMexOperationSchema<'query', readonly ['adAccountId', 'caller', 'url']>
    readonly navigateToProductInsightsWithDefaultTab: WaMexOperationSchema<'query', readonly ['ad_account_id']>
    readonly useFetchAdAccountsForL4Context: WaMexOperationSchema<'query', readonly ['customAnalyticsBusinessID', 'isCustomAnalyticsPage', 'skip', 'skipLwiDefaultAdAccount']>
    readonly useFetchAdAccountsNameById: WaMexOperationSchema<'query', readonly ['adAccountID', 'skip']>
    readonly useFlowJSONValidationLibrary: WaMexOperationSchema<'query', readonly ['skipRequest', 'version', 'wabaID']>
    readonly useIsMessengerPlatformBot: WaMexOperationSchema<'query', readonly ['page_id']>
    readonly useMAIBAAsyncNotification: WaMexOperationSchema<'mutation', readonly ['external_conversation_id']>
    readonly useMAIBAMedia: WaMexOperationSchema<'query', readonly ['adObjectIDs', 'thumbnailSize']>
    readonly useWAWebEstimatedDailyReach: WaMexOperationSchema<'query', readonly ['audienceOptionAudience', 'configuredPlacementSpec', 'currency', 'fetchOfsForecast', 'flow', 'flowID', 'forecastRequest', 'legacyAdAccountID', 'optimizationGoalInput', 'postID', 'targetingSpecAudience', 'useOfsForecast']>
    readonly useWAWebEstimatedDailyReachShadow: WaMexOperationSchema<'query', readonly ['forecastRequest']>
    readonly useWAWebSmartComposerCoachSuggestedReply: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly useWAWebSmartComposerReportThreadEvent: WaMexOperationSchema<'mutation', readonly ['input']>
    readonly useWAWebSmartComposerReportUsed: WaMexOperationSchema<'mutation', readonly ['input']>
}

export type WaMexACSServerProviderConfigVariables = {
    readonly project_name?: string
}

export type WaMexACSServerProviderIssuanceVariables = {
    readonly input?: {
        readonly config_id?: string
        readonly issue_element?: string
        readonly project_name?: string
        readonly request_proof?: string
    }
}

export type WaMexAECompanionOffboardVariables = {
    readonly phoneNumber?: number
}

export type WaMexAECompanionOnboardVariables = {
    readonly phoneNumber?: number
}

export type WaMexAcceptNewsletterAdminInviteVariables = {
    readonly newsletter_id?: string
}

export type WaMexAccountLinkingAPIGetCertsVariables = Readonly<Record<string, never>>

export type WaMexAdAccountDpaEligibleProductCatalogListStoreSourceVariables = {
    readonly filters?: Readonly<Record<string, unknown>>
    readonly include_product_count_issues?: boolean
    readonly is_additional_cms_fields_enabled?: boolean
    readonly is_optimisation_enabled?: boolean
    readonly legacy_account_id?: string
    readonly limit?: number
    readonly skip_unused_catalog_fields?: boolean
    readonly skip_user_tasks?: boolean
}

export type WaMexAdPreferencesDFCABusinessOptOutVariables = {
    readonly input?: string
}

export type WaMexAdPreferencesDemographicCategoryOptOutVariables = {
    readonly bctID?: string
    readonly isUndo?: unknown
}

export type WaMexAdPreferencesHideAdvertiserVariables = {
    readonly input?: string
}

export type WaMexAdPreferencesInterestCategoryOptOutVariables = {
    readonly interestID?: string
    readonly isUndo?: unknown
}

export type WaMexAddLabyrinthPeerDeviceVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexAdsAccountDataDispatcherVariables = {
    readonly adAccountID?: string
}

export type WaMexAdsAccountDataDispatcherViewerPermissionsVariables = {
    readonly ad_account_id?: string
}

export type WaMexAdsAccountStoreNewSourceServerVariables = {
    readonly adAccountID?: string
    readonly is_pending_numbers_exposure_flag_enabled?: boolean
    readonly useAdAccountRef?: unknown
}

export type WaMexAdsAdAccountSettingsStoreSetAPlusCFeatureStickyStatusVariables = {
    readonly input?: string
}

export type WaMexAdsAdAccountSettingsStoreSetL1AESourceStickyStatusVariables = {
    readonly input?: string
}

export type WaMexAdsAdAccountSettingsStoreSetMultiMediaStickyStatusVariables = {
    readonly input?: string
}

export type WaMexAdsAdAccountSettingsStoreSetVideoOptimizationStickyStatusVariables = {
    readonly input?: string
}

export type WaMexAdsAdAccountSettingsStoreSourceServerVariables = {
    readonly ad_account_id?: string
}

export type WaMexAdsBulkEditCampaignGroupAgencyFeeBulkContainerVariables = {
    readonly adAccountID?: string
}

export type WaMexAdsBulkEditCampaignGroupAgencyFeeContainerAdAccountAgencyFeeVariables = {
    readonly adAccountID?: string
}

export type WaMexAdsBulkEditCampaignGroupBudgetFieldContainer_Variables = {
    readonly accountID?: string
    readonly ads_andromeda_bulk_edit_campaign_group_budget?: boolean
    readonly campaignGroupRelayIDs?: ReadonlyArray<string>
    readonly contextKey?: unknown
}

export type WaMexAdsBusinessWhatsAppBusinessAccountProviderPluginBSPVariables = {
    readonly wabaIds?: ReadonlyArray<string>
}

export type WaMexAdsFocusFrameworkStickinessDataManagerVariables = {
    readonly ad_account_id?: string
}

export type WaMexAdsInstagramAccountMediaListRIStoreSourceServerVariables = {
    readonly after?: string
    readonly caption_text?: string
    readonly fbidv2?: string
    readonly first?: number
    readonly is_ad?: boolean
    readonly is_threads?: boolean
    readonly media_type?: string
    readonly order_by?: unknown
}

export type WaMexAdsManagerLiveDataCampaignVariables = {
    readonly ids?: ReadonlyArray<string>
    readonly skip_data_transform?: boolean
}

export type WaMexAdsManagerLiveDataCampaignQueryPreloadingConfigNoSpecsVariables = Readonly<Record<string, never>>

export type WaMexAdsPLRAlphaBetaCheckUtilLogEntryPointExposureVariables = {
    readonly ad_account_id?: string
    readonly requires_full_report?: unknown
    readonly surface?: unknown
}

export type WaMexAdsUEditorAdgroupBrandedContentWAPreviewWrapper_Variables = {
    readonly accountID?: string
    readonly adgroupRelayIDs?: ReadonlyArray<string>
    readonly businessID?: string
    readonly campaignGroupRelayIDs?: ReadonlyArray<string>
    readonly campaignRelayIDs?: ReadonlyArray<string>
    readonly skip_business_query?: boolean
    readonly use_waac?: boolean
}

export type WaMexAdsUEditorAdgroupMessageDestinationPageCategoryVariables = {
    readonly pageID?: string
}

export type WaMexAdsUEditorAdgroupMessageDestinationPreviewContainerCTWAWabaVariables = {
    readonly adAccountID?: string
    readonly skipRequest?: boolean
}

export type WaMexAdsUEditorAdgroupPartnershipAdsStatusVerifiedIdentities_Variables = {
    readonly hasPrimaryPage?: boolean
    readonly hasSecondaryPage?: boolean
    readonly primaryPageID?: string
    readonly secondaryPageID?: string
}

export type WaMexAdvertiserProfileMessageMarketingDataStoreLoaderVariables = {
    readonly adAccountID?: string
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

export type WaMexBizGetCategoriesVariables = {
    readonly query_params?: {
        readonly locale?: string
        readonly operation?: 'PROFILE_TYPEAHEAD'
        readonly query?: string
        readonly version?: 'V_1'
    }
}

export type WaMexBizGetCategoriesV2Variables = {
    readonly query_params?: {
        readonly locale?: string
        readonly operation?: 'PROFILE_TYPEAHEAD'
        readonly query?: string
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

export type WaMexBizProfileRootVariables = Readonly<Record<string, never>>

export type WaMexBizQueryOrderVariables = {
    readonly request?: {
        readonly order?: {
            readonly id?: string
            readonly image_dimensions?: {
                readonly height?: number
                readonly width?: number
            }
            readonly jid?: string
            readonly token?: {
                readonly sensitive_string_value?: string
            }
        }
    }
}

export type WaMexBizSetMerchantComplianceVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexBrResolvePaymentAccountLinkVariables = {
    readonly request?: {
        readonly code?: {
            readonly sensitive_string_value?: string
        }
    }
}

export type WaMexCTXChatBuilderDialogContainerUtilsVariables = {
    readonly input?: string
}

export type WaMexCTXChatBuilderWAFlowsUtilsWAMFlowsCTWAEditorModalVariables = {
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

export type WaMexClientEdgeQuery_AdsBulkEditAdgroupAgenticCheckoutOptInPlugin_Query_selected_ad_account__shops_ads_identity_product_catalogVariables = {
    readonly id?: string
}

export type WaMexClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_combined_campaign_group__product_catalogVariables = {
    readonly id?: string
}

export type WaMexClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_creative__product_set__product_catalogVariables = {
    readonly id?: string
}

export type WaMexCoexCanonicalStateVariables = {
    readonly request?: {
        readonly phone_number?: number
    }
}

export type WaMexConsumerFetchQuickPromotionsVariables = {
    readonly nux_ids?: ReadonlyArray<string>
    readonly trigger_context?: {
        readonly wa_smb_trigger_context?: {
            readonly app_version?: number
            readonly country?: string
            readonly is_from_wa_smb?: boolean
            readonly locale?: string
        }
    }
}

export type WaMexConsumerQuickPromotionActionGraphQLVariables = {
    readonly input?: string
}

export type WaMexContactManagerCustomerProfileVariables = {
    readonly lid?: string
}

export type WaMexContactManagerCustomerProfileDeleteVariables = {
    readonly lid?: string
}

export type WaMexContactManagerCustomerProfileUpsertVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexContactManagerCustomerProfilesVariables = {
    readonly includeCustomFields?: boolean
    readonly input?: {
        readonly candidate_lids?: ReadonlyArray<string>
        readonly cursor?: string
        readonly filters?: ReadonlyArray<{
            readonly field_name?: string
            readonly filter_text?: string
        }>
        readonly page_size?: number
        readonly sort_column?: unknown
        readonly sort_descending?: boolean
    }
}

export type WaMexCreateEnforcementAppealVariables = {
    readonly input?: {
        readonly additional_appeal_reason?: string
        readonly appeal_reason?: string
        readonly enforcement_id?: string
        readonly entity_id?: string
        readonly locale?: string
    }
}

export type WaMexCreateInviteCodeVariables = {
    readonly input?: {
        readonly entry_point?: string
        readonly receiver?: string
        readonly server_send_sms?: boolean
    }
}

export type WaMexCreateLabyrinthBackupVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexCreateMarketingCampaignActionVariables = {
    readonly input?: string
}

export type WaMexCreateNewsletterVariables = {
    readonly input?: {
        readonly description?: string
        readonly name?: string
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
    readonly lid?: string
    readonly phone_number?: {
        readonly sensitive_string_value?: string
    }
}

export type WaMexCustomLabel3pdEventVariables = {
    readonly custom_labels?: ReadonlyArray<string>
    readonly expt_group?: string
}

export type WaMexCustomerManagerAccessStateVariables = Readonly<Record<string, never>>

export type WaMexCustomerManagerCustomerProfileCustomFieldCreateVariables = {
    readonly input?: string
}

export type WaMexCustomerManagerStartTrialVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexDebugLabyrinthAddDeviceVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexDebugLabyrinthFetchVirtualDeviceInfoVariables = {
    readonly input?: {
        readonly virtual_device_id?: string
    }
}

export type WaMexDebugLabyrinthInboxSnapshotVariables = {
    readonly clientSealToken?: string
    readonly deviceId?: string
    readonly locallyAvailableEpochIds?: ReadonlyArray<unknown>
    readonly messageFirst?: number
    readonly threadFirst?: number
}

export type WaMexDebugLabyrinthRangeVariables = {
    readonly device_id?: string
    readonly message_count?: number
    readonly partial_thread_id?: string
}

export type WaMexDebugLabyrinthRestorePageVariables = {
    readonly after?: string
    readonly device_id?: string
    readonly locally_available_epoch_ids?: ReadonlyArray<string>
    readonly message_count?: number
    readonly partial_thread_id?: string
}

export type WaMexDeleteNewsletterVariables = {
    readonly newsletter_id?: string
}

export type WaMexDemoteNewsletterAdminVariables = {
    readonly newsletter_id?: string
    readonly user_id?: string
}

export type WaMexE2EEMetadataMailboxFetchGroupInfoV4Variables = {
    readonly input?: string
}

export type WaMexEBMessageRangeQueryForThreadsVariables = {
    readonly app_id?: string
    readonly includeAttachmentData?: boolean
    readonly restore_payload_strings?: unknown
    readonly restore_type?: 'INITIAL_RESTORE' | 'RANGE_QUERY_RESTORE'
}

export type WaMexEditBizProfileVariables = {
    readonly input?: Readonly<Record<string, unknown>>
    readonly lid?: string
}

export type WaMexEmailInviteSendGroupVariables = {
    readonly input?: {
        readonly emails?: ReadonlyArray<string>
        readonly inviter_name?: string
        readonly source?: 'GROUP_INFO_PANEL'
        readonly target_id?: string
        readonly target_type?: 'GROUP'
        readonly utm_campaign?: unknown
    }
}

export type WaMexExternalCtxAuthoriseWAChatVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexFetchAllNewslettersMetadataVariables = {
    readonly fetch_status_metadata?: boolean
    readonly fetch_wamo_sub?: boolean
}

export type WaMexFetchAllSubgroupsVariables = {
    readonly group_id?: string
    readonly query_context?: string
    readonly sub_group_hint_id?: string
}

export type WaMexFetchBotCertificateRevocationListVariables = {
    readonly crl_name?: string
}

export type WaMexFetchBotProfilesGQLVariables = {
    readonly ids?: ReadonlyArray<string>
}

export type WaMexFetchBotTasksVariables = {
    readonly first?: number
    readonly statuses?: unknown
    readonly suggestedLimit?: number
    readonly surface?: unknown
}

export type WaMexFetchDynamicAIModesVariables = Readonly<Record<string, never>>

export type WaMexFetchGroupInfoVariables = {
    readonly id?: string
    readonly include_membership_form?: boolean
    readonly include_username?: boolean
    readonly participants_phash?: string
    readonly query_context?: string
}

export type WaMexFetchGroupInfoIncludBotsVariables = {
    readonly id?: string
    readonly include_membership_form?: boolean
    readonly include_username?: boolean
    readonly participants_phash?: string
    readonly query_context?: string
}

export type WaMexFetchGroupInfoIncludBotsJobAcp2Variables = {
    readonly id?: string
    readonly include_membership_form?: boolean
    readonly include_username?: boolean
    readonly participants_phash?: string
    readonly query_context?: string
}

export type WaMexFetchGroupInfoJobAcp2Variables = {
    readonly id?: string
    readonly include_membership_form?: boolean
    readonly include_username?: boolean
    readonly participants_phash?: string
    readonly query_context?: string
}

export type WaMexFetchGroupInviteCodeVariables = {
    readonly id?: string
    readonly query_context?: 'INVITE_CODE'
}

export type WaMexFetchGroupInviteInfoVariables = {
    readonly include_username?: boolean
    readonly invite_code?: string
}

export type WaMexFetchGroupInviteInfoJobAddRequestVariables = {
    readonly add_request?: {
        readonly admin?: unknown
        readonly code?: string
        readonly expiration?: unknown
    }
    readonly group_jid?: string
    readonly include_username?: boolean
}

export type WaMexFetchGroupIsInternalVariables = {
    readonly id?: string
}

export type WaMexFetchGroupMembershipFormForJoinJobAddRequestVariables = {
    readonly add_request?: {
        readonly admin?: string
        readonly code?: string
        readonly expiration?: unknown
    }
    readonly group_jid?: string
}

export type WaMexFetchGroupMembershipFormForJoinJobInviteVariables = {
    readonly invite_code?: string
}

export type WaMexFetchGroupMembershipFormForJoinJobLinkedVariables = {
    readonly group_jid?: string
    readonly sub_group_jid_hint?: unknown
}

export type WaMexFetchIntegritySignalsVariables = {
    readonly input?: {
        readonly query_input?: ReadonlyArray<{
            readonly integrity_signals?: {
                readonly use_case?: boolean
            }
            readonly jid?: string
        }>
        readonly telemetry?: {
            readonly context?: 'INTERACTIVE'
        }
    }
}

export type WaMexFetchLabyrinthEpochChainVariables = Readonly<Record<string, never>>

export type WaMexFetchLabyrinthEpochDevicesVariables = Readonly<Record<string, never>>

export type WaMexFetchLinkedGroupInfoVariables = {
    readonly group_jid?: string
    readonly include_username?: boolean
    readonly sub_group_jid_hint?: string
}

export type WaMexFetchMembershipApprovalRequestsVariables = {
    readonly id?: string
    readonly include_membership_form?: boolean
    readonly include_username?: boolean
    readonly query_context?: 'INTERACTIVE'
}

export type WaMexFetchMetaOnePromoEligibilityVariables = {
    readonly request?: {
        readonly promo_platforms?: ReadonlyArray<unknown>
    }
}

export type WaMexFetchNewChatMessageCappingInfoVariables = {
    readonly input?: {
        readonly type?: 'INDIVIDUAL_NEW_CHAT_THREAD'
    }
}

export type WaMexFetchNewsletterVariables = {
    readonly fetch_creation_time?: boolean
    readonly fetch_full_image?: boolean
    readonly fetch_pinned_messages?: boolean
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
    readonly fetch_pinned_messages?: boolean
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
        readonly filters?: {
            readonly categories?: ReadonlyArray<string>
            readonly country_codes?: ReadonlyArray<string>
        }
        readonly limit?: number
        readonly start_cursor?: string
        readonly view?: string
    }
}

export type WaMexFetchNewsletterDirectorySearchResultsVariables = {
    readonly fetch_status_metadata?: boolean
    readonly input?: {
        readonly categories?: ReadonlyArray<string>
        readonly limit?: number
        readonly search_text?: string
        readonly start_cursor?: string
    }
}

export type WaMexFetchNewsletterEnforcementsVariables = {
    readonly locale?: string
    readonly newsletter_id?: string
}

export type WaMexFetchNewsletterFollowersVariables = {
    readonly input?: {
        readonly count?: number
        readonly newsletter_id?: string
    }
}

export type WaMexFetchNewsletterInsightsVariables = {
    readonly input?: {
        readonly metrics?: ReadonlyArray<{
            readonly group_by?: {
                readonly country?: boolean
                readonly number_of_days?: number
            }
            readonly id?: string
            readonly limit?: number
            readonly type?: 'FOLLOWER' | 'FOLLOWS' | 'NET_FOLLOWS' | 'UNFOLLOWS'
        }>
        readonly newsletter_id?: string
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
        readonly newsletter_id?: string
        readonly server_id?: string
        readonly vote_hash?: string
    }
}

export type WaMexFetchNewsletterReportsVariables = {
    readonly locale?: string
}

export type WaMexFetchOHAIKeyConfigVariables = Readonly<Record<string, never>>

export type WaMexFetchOIDCStateVariables = Readonly<Record<string, never>>

export type WaMexFetchPhoneNumberSharingSettingsVariables = {
    readonly input?: {
        readonly allow_list?: {
            readonly dhash?: string
        }
        readonly contact_exclude_list?: {
            readonly dhash?: string
        }
        readonly deny_list?: {
            readonly dhash?: string
        }
    }
}

export type WaMexFetchPlaintextLinkPreviewVariables = {
    readonly input?: {
        readonly url?: string
    }
}

export type WaMexFetchQuickPromotionsVariables = {
    readonly nux_ids?: ReadonlyArray<string>
    readonly trigger_context?: {
        readonly wa_smb_trigger_context?: {
            readonly app_version?: number
            readonly country?: string
            readonly is_from_wa_smb?: boolean
            readonly locale?: string
        }
    }
}

export type WaMexFetchReachoutTimelockVariables = Readonly<Record<string, never>>

export type WaMexFetchRecommendedNewslettersVariables = {
    readonly fetch_status_metadata?: boolean
    readonly input?: {
        readonly country_codes?: ReadonlyArray<string>
        readonly limit?: number
    }
}

export type WaMexFetchSimilarNewslettersVariables = {
    readonly fetch_status_metadata?: boolean
    readonly input?: {
        readonly country_codes?: ReadonlyArray<string>
        readonly limit?: number
        readonly newsletter_id?: string
    }
}

export type WaMexFetchSubgroupSuggestionsVariables = {
    readonly group_id?: string
    readonly query_context?: string
    readonly sub_group_hint_id?: string
}

export type WaMexFetchSubscriptionEntryPointsVariables = {
    readonly subscriptionTypes?: unknown
}

export type WaMexFetchSubscriptionsVariables = {
    readonly data?: {
        readonly platform?: 'UNKNOWN'
    }
}

export type WaMexFetchTextStatusListVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexFetchWassBotListProfilesGQLVariables = Readonly<Record<string, never>>

export type WaMexFetchWassBotProfileGQLVariables = {
    readonly botFbid?: string
    readonly groupJid?: string
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
                readonly category?: string
                readonly dhash?: string
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
        readonly request_id?: number
    }
}

export type WaMexGetWoasAgeSignalVariables = {
    readonly input?: {
        readonly query_input?: ReadonlyArray<{
            readonly jid?: string
        }>
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

export type WaMexGroupJoinVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexGroupStoreAndSendInviteSmsVariables = {
    readonly input?: {
        readonly entry_point?: string
        readonly group_jid?: string
        readonly participants?: ReadonlyArray<{
            readonly participant?: unknown
            readonly server_sent_sms?: boolean
        }>
    }
}

export type WaMexGroupStoreInviteSmsVariables = {
    readonly input?: {
        readonly group_jid?: string
        readonly partcipants?: ReadonlyArray<Readonly<Record<string, unknown>>>
    }
}

export type WaMexGroupSuspensionAppealVariables = {
    readonly input?: {
        readonly appeal_reason?: string
        readonly debug_info?: string
        readonly group_jid?: string
    }
}

export type WaMexIntegrityChallengeResponseVariables = {
    readonly input?: {
        readonly challenge_type?: string
        readonly passkey_response?: {
            readonly prf_available?: boolean
            readonly signed_challenge?: string
        }
    }
}

export type WaMexInternalDirectoryFetchMembersVariables = {
    readonly after?: string
    readonly first?: number
}

export type WaMexJoinNewsletterVariables = {
    readonly newsletter_id?: string
}

export type WaMexKeyTransparencyGraphQLClient_Variables = {
    readonly auditor_ids?: ReadonlyArray<string>
    readonly requested_accounts?: unknown
    readonly serfmt?: 'BASE64'
}

export type WaMexLeaveNewsletterVariables = {
    readonly newsletter_id?: string
}

export type WaMexLidChangeNotificationVariables = Readonly<Record<string, never>>

export type WaMexLogNewsletterExposuresVariables = {
    readonly input?: {
        readonly exposures?: ReadonlyArray<{
            readonly capability?: 'ADMIN_CONTEXT_CARD_1' | 'ADMIN_CONTEXT_CARD_2' | 'ADMIN_CONTEXT_CARD_3' | 'ADMIN_NOTIFICATIONS' | 'ADMIN_ONBOARDING' | 'ADMIN_ONBOARDING_2' | 'ADMIN_PROFILE' | 'CHANNEL_STATUS_ADMIN_INSIGHTS' | 'CHANNEL_STATUS_API' | 'CHANNEL_STATUS_MUSIC' | 'CHANNEL_STATUS_PRODUCER' | 'INSIGHTS' | 'INVITE_ADMINS_BUTTON' | 'INVITE_FOLLOWERS' | 'JARVIS_INTEGRATION_ENABLED' | 'MUSIC' | 'NEW_MESSAGE_TYPES_TOOLTIP' | 'PHOTO_POLLS' | 'PINNED_MESSAGES' | 'PINNING_NUDGE' | 'QUESTIONS' | 'QUESTIONS_M2' | 'QUESTIONS_STARRING' | 'QUESTION_RESPONSE_LIKES' | 'QUIZ' | 'SCHEDULED_UPDATES' | 'SHARE_STICKER_PACKS' | 'THREAD_MENU'
            readonly newsletter_id?: string
        }>
    }
}

export type WaMexLogServerSentInviteIntentVariables = {
    readonly input?: {
        readonly entry_point?: string
        readonly receiver?: string
    }
}

export type WaMexMAIBAAdObjectReference_StoryMetadataVariables = {
    readonly storyId?: string
}

export type WaMexMAIBAChatThreadVariables = {
    readonly externalConversationId?: string
    readonly shouldFetchMessageDebugInfo?: boolean
}

export type WaMexMAIBAGraphQLSendMessageV2QueryVariables = {
    readonly adminText?: unknown
    readonly clientContext?: unknown
    readonly connections?: unknown
    readonly contextChips?: unknown
    readonly displayMessage?: unknown
    readonly entrypoint?: string
    readonly externalConversationId?: string
    readonly hideUserMessage?: boolean
    readonly includeEntryPointClaimState?: boolean
    readonly isInsituPregeneration?: boolean
    readonly isNewConversation?: boolean
    readonly isSentFromOutOfChat?: boolean
    readonly message?: string
    readonly messageType?: 'COMPARISON' | 'SHADOW'
    readonly offlineThreadingId?: string
    readonly postbackPayload?: string
    readonly requestedReasoningEffort?: unknown
    readonly requestedReasoningMode?: unknown
    readonly selectedAssets?: unknown
    readonly selectedSuggestedPrompt?: unknown
    readonly selectedText?: unknown
    readonly shouldFetchMessageDebugInfo?: boolean
    readonly userMediaAttachments?: unknown
}

export type WaMexMAIBAGraphQLSendMessageV3QueryVariables = {
    readonly adminText?: unknown
    readonly clientContext?: unknown
    readonly contextChips?: unknown
    readonly displayMessage?: unknown
    readonly entrypoint?: string
    readonly externalConversationId?: string
    readonly hideUserMessage?: boolean
    readonly includeEntryPointClaimState?: boolean
    readonly isInsituPregeneration?: unknown
    readonly isNewConversation?: boolean
    readonly isSentFromOutOfChat?: boolean
    readonly message?: string
    readonly messageType?: 'COMPARISON' | 'SHADOW'
    readonly offlineThreadingId?: string
    readonly postbackPayload?: string
    readonly requestedReasoningEffort?: unknown
    readonly requestedReasoningMode?: unknown
    readonly selectedAssets?: unknown
    readonly selectedSuggestedPrompt?: unknown
    readonly selectedText?: unknown
    readonly userMediaAttachments?: unknown
}

export type WaMexMAIBAGraphQLSendMessageV4QueryVariables = {
    readonly adminText?: unknown
    readonly clientContext?: unknown
    readonly contextChips?: unknown
    readonly displayMessage?: unknown
    readonly entrypoint?: unknown
    readonly externalConversationId?: string
    readonly hideUserMessage?: unknown
    readonly includeEntryPointClaimState?: unknown
    readonly isNewConversation?: unknown
    readonly isSentFromOutOfChat?: unknown
    readonly message?: string
    readonly messageType?: unknown
    readonly offlineThreadingId?: string
    readonly postbackPayload?: unknown
    readonly requestedReasoningEffort?: unknown
    readonly requestedReasoningMode?: unknown
    readonly selectedAssets?: unknown
    readonly selectedSuggestedPrompt?: unknown
    readonly selectedText?: unknown
    readonly streamSessionId?: string
    readonly userMediaAttachments?: unknown
}

export type WaMexMAIBAPageReferenceVariables = {
    readonly id?: string
}

export type WaMexMAIBAUpdateAdsAIConsentVariables = Readonly<Record<string, never>>

export type WaMexMetaPayVaultInitializeVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexMetaPayVaultLabyrinthDeleteVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexMetaPayVaultLabyrinthFetchAllVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexMetaPayVaultLabyrinthSaveVariables = {
    readonly input?: Readonly<Record<string, unknown>>
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

export type WaMexNewsletterBlockUserVariables = {
    readonly newsletter_id?: string
    readonly response_server_id?: string
    readonly server_id?: string
}

export type WaMexNewsletterLabelAiContentVariables = {
    readonly message_type?: string
    readonly newsletter_id?: string
    readonly server_id?: string
}

export type WaMexNewsletterPinMessagesVariables = {
    readonly input?: {
        readonly message_ids?: ReadonlyArray<string>
    }
    readonly newsletter_id?: string
}

export type WaMexNewsletterQuestionResponseStateUpdateVariables = {
    readonly newsletter_id?: string
    readonly response_server_id?: string
    readonly server_id?: string
    readonly state?: string
}

export type WaMexNewsletterUnpinMessagesVariables = {
    readonly input?: {
        readonly message_ids?: ReadonlyArray<string>
    }
    readonly newsletter_id?: string
}

export type WaMexOrgAdminGraphQLAddChannelVariables = {
    readonly channelID?: string
    readonly orgID?: string
}

export type WaMexOrgAdminGraphQLAddGroupVariables = {
    readonly gid?: string
    readonly orgID?: string
}

export type WaMexOrgAdminGraphQLAdminRosterVariables = {
    readonly orgID?: string
}

export type WaMexOrgAdminGraphQLApplyAdminRosterChangesVariables = {
    readonly input?: {
        readonly adds?: ReadonlyArray<unknown>
        readonly changes?: ReadonlyArray<unknown>
        readonly expected_version?: number
        readonly org_id?: string
    }
}

export type WaMexOrgAdminGraphQLDirectoryPageVariables = {
    readonly first?: number
    readonly orgID?: string
}

export type WaMexOrgAdminGraphQLEventRsvpCountsVariables = {
    readonly eventID?: unknown
}

export type WaMexOrgAdminGraphQLGroupVariables = {
    readonly gid?: string
    readonly orgID?: string
}

export type WaMexOrgAdminGraphQLInviteMembersVariables = {
    readonly orgID?: string
    readonly resend?: boolean
    readonly rosterEntryIDs?: ReadonlyArray<string>
}

export type WaMexOrgAdminGraphQLLeaveVariables = {
    readonly orgID?: string
}

export type WaMexOrgAdminGraphQLManagedChannelAdminsVariables = {
    readonly channelID?: string
    readonly orgID?: string
}

export type WaMexOrgAdminGraphQLManagedChannelsVariables = {
    readonly orgID?: string
}

export type WaMexOrgAdminGraphQLManagedEventsVariables = {
    readonly orgID?: string
}

export type WaMexOrgAdminGraphQLManagedGroupsVariables = {
    readonly orgID?: string
}

export type WaMexOrgAdminGraphQLMemberSearchVariables = {
    readonly after?: string
    readonly first?: number
    readonly memberTag?: string
    readonly orgID?: string
    readonly query?: string
}

export type WaMexOrgAdminGraphQLOrgsVariables = Readonly<Record<string, never>>

export type WaMexOrgAdminGraphQLRemoveMemberVariables = {
    readonly input?: {
        readonly member_lid?: string
        readonly org_id?: string
    }
}

export type WaMexOrgAdminGraphQLSendManagedGroupEmailInvitesVariables = {
    readonly gid?: string
    readonly orgID?: string
    readonly rosterEntryIDs?: ReadonlyArray<string>
    readonly utmCampaign?: unknown
}

export type WaMexOrgAdminGraphQLSetMemberRoleVariables = {
    readonly input?: {
        readonly member_lid?: string
        readonly org_id?: string
        readonly role?: string
    }
}

export type WaMexOrgAdminGraphQLSubmitBulkGroupRequestVariables = {
    readonly createGroupsPlan?: ReadonlyArray<{
        readonly announcement?: boolean
        readonly locked?: boolean
        readonly member_add_mode?: 'ADMIN_ADD' | 'ALL_MEMBER_ADD'
        readonly membership_approval?: unknown
        readonly participant_roster_entry_ids?: ReadonlyArray<string>
        readonly subject?: string
    }>
    readonly operation?: unknown
    readonly orgID?: string
}

export type WaMexOrgAdminGraphQLUpdateOrgVariables = {
    readonly input?: {
        readonly description?: string
        readonly icon_blob?: unknown
        readonly member_tag_name?: string
        readonly member_tag_options?: string
        readonly org_id?: string
        readonly secondary_member_tag_name?: string
    }
}

export type WaMexOrgMemberUpdateNotificationHandlerVariables = Readonly<Record<string, never>>

export type WaMexPaymentsPasskeyHasCredentialVariables = Readonly<Record<string, never>>

export type WaMexQueryCatalogVariables = {
    readonly request?: {
        readonly product_catalog?: {
            readonly after?: string
            readonly allow_shop_source?: 'ALLOWSHOPSOURCE_FALSE' | 'ALLOWSHOPSOURCE_TRUE'
            readonly catalog_session_id?: string
            readonly height?: string
            readonly jid?: string
            readonly limit?: string
            readonly variant_info_fields?: Readonly<Record<string, unknown>>
            readonly variant_thumbnail_height?: string
            readonly variant_thumbnail_width?: string
            readonly width?: string
        }
    }
}

export type WaMexQueryCatalogHasCategoriesVariables = {
    readonly request?: {
        readonly categories?: {
            readonly biz_jid?: string
            readonly catalog_session_id?: string
            readonly image_dimensions?: Readonly<Record<string, unknown>>
        }
    }
}

export type WaMexQueryCatalogProductVariables = {
    readonly request?: {
        readonly product?: {
            readonly fetch_compliance_info?: string
            readonly height?: string
            readonly jid?: string
            readonly product_id?: string
            readonly variant_info_fields?: Readonly<Record<string, unknown>>
            readonly variant_thumbnail_height?: string
            readonly variant_thumbnail_width?: string
            readonly width?: string
        }
    }
}

export type WaMexQueryProductCollectionsVariables = {
    readonly request?: {
        readonly collections?: {
            readonly after?: string
            readonly biz_jid?: string
            readonly collection_limit?: string
            readonly height?: string
            readonly item_limit?: string
            readonly variant_info_fields?: Readonly<Record<string, unknown>>
            readonly variant_thumbnail_height?: string
            readonly variant_thumbnail_width?: string
            readonly width?: string
        }
    }
}

export type WaMexQueryProductListCatalogVariables = {
    readonly request?: {
        readonly product_list?: {
            readonly direct_connection_encrypted_info?: string
            readonly height?: string
            readonly jid?: string
            readonly products?: ReadonlyArray<{
                readonly id?: string
            }>
            readonly width?: string
        }
    }
}

export type WaMexQueryProductSingleCollectionVariables = {
    readonly request?: {
        readonly collection?: {
            readonly after?: string
            readonly biz_jid?: string
            readonly height?: string
            readonly id?: string
            readonly limit?: string
            readonly variant_info_fields?: Readonly<Record<string, unknown>>
            readonly variant_thumbnail_height?: string
            readonly variant_thumbnail_width?: string
            readonly width?: string
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

export type WaMexRequestOTEVariables = {
    readonly input?: {
        readonly reason_text?: string
        readonly selected_reason?: string
        readonly type?: 'INDIVIDUAL_NEW_CHAT_THREAD'
    }
}

export type WaMexResolveAccountTypeAndAdPageVariables = Readonly<Record<string, never>>

export type WaMexResolveAccountTypeAndAdPageQueryVariables = {
    readonly pageId?: string
}

export type WaMexRevokeNewsletterAdminInviteVariables = {
    readonly newsletter_id?: string
    readonly user_id?: string
}

export type WaMexRotateLabyrinthEpochVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSaveResponseTonePreferenceVariables = {
    readonly comparison_conversation_id?: string
    readonly external_conversation_id?: string
    readonly preference?: unknown
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

export type WaMexSharableEventAddInvitationsVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSharableEventCreateVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSharableEventDeleteVariables = {
    readonly input?: {
        readonly event_id?: string
    }
}

export type WaMexSharableEventGetVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSharableEventGuestJoinedWaNotificationsVariables = Readonly<Record<string, never>>

export type WaMexSharableEventInviteLinkJobGetOrCreateVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSharableEventInviteLinkJobInvalidateVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSharableEventInviteLinkJobRotateVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSharableEventJoinViaLinkVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSharableEventLeaveVariables = {
    readonly input?: {
        readonly event_id?: string
    }
}

export type WaMexSharableEventLinkPreviewVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSharableEventListVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSharableEventPlaceSearchVariables = {
    readonly input?: {
        readonly center?: {
            readonly latitude?: number
            readonly longitude?: number
        }
        readonly query?: string
        readonly use_case_id?: 'WHATSAPP_MESSAGE'
    }
}

export type WaMexSharableEventPresetCoversVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSharableEventReconcileVariables = {
    readonly input?: {
        readonly event_ids?: ReadonlyArray<string>
    }
}

export type WaMexSharableEventRemoveInvitationsVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSharableEventUpdateVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSharableEventUpdateRsvpVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSignupMetadataVariables = {
    readonly phone_number?: string
    readonly signup_id?: string
}

export type WaMexSkipStoppedMessagesVariables = {
    readonly external_conversation_id?: string
    readonly linked_ad_account_id?: string
    readonly offline_threading_id?: string
    readonly surface?: unknown
}

export type WaMexStartConversationTemplateReengagementWithCatalogSectionVariables = {
    readonly page_id?: string
}

export type WaMexStartConversationsTemplateCustomerActionsSectionIsEligibleForAIRegenerationVariables = {
    readonly ad_account_id?: string
    readonly ad_caption?: string
    readonly destination_type?: string
    readonly page_id?: string
    readonly post_id?: string
    readonly skip?: unknown
}

export type WaMexStartConversationsTemplateDialogContainerBodyGraphQLWelcomeMessageFlowsVariables = {
    readonly input?: string
    readonly tooltipPageIDs?: ReadonlyArray<string>
}

export type WaMexStartConversationsTemplateFAQGenAIRegenerationVariables = {
    readonly ad_account_id?: string
    readonly ad_caption?: string
    readonly ad_id?: string
    readonly current_icebreaker?: unknown
    readonly destination_type?: string
    readonly ent_id?: string
    readonly page_id?: string
    readonly post_id?: string
}

export type WaMexSubscriptionWaffleAgeCheckVariables = Readonly<Record<string, never>>

export type WaMexSupportBugReportCreateDogfoodingTaskVariables = {
    readonly input?: {
        readonly category?: string
    }
}

export type WaMexSupportBugReportSubmitVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSupportChatAuthRefreshVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSupportContactFormSubmitVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexSupportMessageFeedbackSubmitVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexTeamLinkCreateInvitationVariables = {
    readonly employeeName?: string
    readonly lid?: string
    readonly teamRole?: string
}

export type WaMexTeamLinkListInvitationsVariables = Readonly<Record<string, never>>

export type WaMexTeamLinkRemoveInvitationVariables = {
    readonly lid?: string
}

export type WaMexTeamLinkUpdateAgentRoleVariables = {
    readonly employeeName?: string
    readonly lid?: string
    readonly teamRole?: string
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
        readonly description?: string
        readonly name?: string
        readonly picture?: string
        readonly settings?: Readonly<Record<string, unknown>>
    }
}

export type WaMexUpdateNewsletterAdminProfileVariables = {
    readonly admin_profile?: unknown
    readonly newsletter_id?: string
}

export type WaMexUpdateNewsletterAdminProfileSettingVariables = {
    readonly newsletter_id?: string
    readonly updates?: {
        readonly settings?: {
            readonly admin_profiles_enabled?: boolean
        }
    }
}

export type WaMexUpdateNewsletterUserSettingVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexUpdateTextStatusVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexUploadLabyrinthMessagesVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexUsernameAvailabilityVariables = {
    readonly input?: string
    readonly session_id?: string
    readonly source?: 'USER_INPUT'
}

export type WaMexUsyncVariables = {
    readonly include_country_code?: boolean
    readonly include_orgs?: boolean
    readonly include_username?: boolean
    readonly input?: {
        readonly query_input?: Readonly<Record<string, unknown>>
        readonly telemetry?: Readonly<Record<string, unknown>>
    }
}

export type WaMexWAAOnboardingVariables = {
    readonly input?: {
        readonly flow_id?: string
        readonly request_id?: number
    }
}

export type WaMexWAMFlowsCTWAEditorModalVariables = {
    readonly adObjective?: unknown
    readonly businessName?: string
    readonly flowId?: string
    readonly skipRequest?: boolean
}

export type WaMexWAMFlowsCTWAFlowPreviewVariables = {
    readonly adObjective?: unknown
    readonly businessName?: string
    readonly defaultCtaToGetStarted?: boolean
    readonly flowId?: string
    readonly skipRequest?: boolean
}

export type WaMexWODirectoryFetchCompanyNameVariables = {
    readonly lid?: string
}

export type WaMexWaffleFXServiceDataQueryV2Variables = Readonly<Record<string, never>>

export type WaMexWaffleFXWAMOUpdateUOOMVariables = Readonly<Record<string, never>>

export type WaMexWaffleXEVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexWhatsAppMarketingCampaignCustomerListPickerListsVariables = {
    readonly wabaId?: string
}

export type WaMexfetchWebsiteMediaImageURLsVariables = {
    readonly adAccountId?: string
    readonly caller?: unknown
    readonly url?: string
}

export type WaMexnavigateToProductInsightsWithDefaultTabVariables = {
    readonly ad_account_id?: string
}

export type WaMexuseFetchAdAccountsForL4ContextVariables = {
    readonly customAnalyticsBusinessID?: string
    readonly isCustomAnalyticsPage?: boolean
    readonly skip?: boolean
    readonly skipLwiDefaultAdAccount?: boolean
}

export type WaMexuseFetchAdAccountsNameByIdVariables = {
    readonly adAccountID?: string
    readonly skip?: boolean
}

export type WaMexuseFlowJSONValidationLibraryVariables = {
    readonly skipRequest?: boolean
    readonly version?: number
    readonly wabaID?: string
}

export type WaMexuseIsMessengerPlatformBotVariables = {
    readonly page_id?: string
}

export type WaMexuseMAIBAAsyncNotificationVariables = {
    readonly external_conversation_id?: string
}

export type WaMexuseMAIBAMediaVariables = {
    readonly adObjectIDs?: ReadonlyArray<string>
    readonly thumbnailSize?: number
}

export type WaMexuseWAWebEstimatedDailyReachVariables = {
    readonly audienceOptionAudience?: Readonly<Record<string, unknown>>
    readonly configuredPlacementSpec?: Readonly<Record<string, unknown>>
    readonly currency?: string
    readonly fetchOfsForecast?: boolean
    readonly flow?: string
    readonly flowID?: string
    readonly forecastRequest?: unknown
    readonly legacyAdAccountID?: string
    readonly optimizationGoalInput?: Readonly<Record<string, unknown>>
    readonly postID?: string
    readonly targetingSpecAudience?: string
    readonly useOfsForecast?: boolean
}

export type WaMexuseWAWebEstimatedDailyReachShadowVariables = {
    readonly forecastRequest?: unknown
}

export type WaMexuseWAWebSmartComposerCoachSuggestedReplyVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexuseWAWebSmartComposerReportThreadEventVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export type WaMexuseWAWebSmartComposerReportUsedVariables = {
    readonly input?: Readonly<Record<string, unknown>>
}

export interface WaMexOperationVariables {
    readonly ACSServerProviderConfig: WaMexACSServerProviderConfigVariables
    readonly ACSServerProviderIssuance: WaMexACSServerProviderIssuanceVariables
    readonly AECompanionOffboard: WaMexAECompanionOffboardVariables
    readonly AECompanionOnboard: WaMexAECompanionOnboardVariables
    readonly AcceptNewsletterAdminInvite: WaMexAcceptNewsletterAdminInviteVariables
    readonly AccountLinkingAPIGetCerts: WaMexAccountLinkingAPIGetCertsVariables
    readonly AdAccountDpaEligibleProductCatalogListStoreSource: WaMexAdAccountDpaEligibleProductCatalogListStoreSourceVariables
    readonly AdPreferencesDFCABusinessOptOut: WaMexAdPreferencesDFCABusinessOptOutVariables
    readonly AdPreferencesDemographicCategoryOptOut: WaMexAdPreferencesDemographicCategoryOptOutVariables
    readonly AdPreferencesHideAdvertiser: WaMexAdPreferencesHideAdvertiserVariables
    readonly AdPreferencesInterestCategoryOptOut: WaMexAdPreferencesInterestCategoryOptOutVariables
    readonly AddLabyrinthPeerDevice: WaMexAddLabyrinthPeerDeviceVariables
    readonly AdsAccountDataDispatcher: WaMexAdsAccountDataDispatcherVariables
    readonly AdsAccountDataDispatcherViewerPermissions: WaMexAdsAccountDataDispatcherViewerPermissionsVariables
    readonly AdsAccountStoreNewSourceServer: WaMexAdsAccountStoreNewSourceServerVariables
    readonly AdsAdAccountSettingsStoreSetAPlusCFeatureStickyStatus: WaMexAdsAdAccountSettingsStoreSetAPlusCFeatureStickyStatusVariables
    readonly AdsAdAccountSettingsStoreSetL1AESourceStickyStatus: WaMexAdsAdAccountSettingsStoreSetL1AESourceStickyStatusVariables
    readonly AdsAdAccountSettingsStoreSetMultiMediaStickyStatus: WaMexAdsAdAccountSettingsStoreSetMultiMediaStickyStatusVariables
    readonly AdsAdAccountSettingsStoreSetVideoOptimizationStickyStatus: WaMexAdsAdAccountSettingsStoreSetVideoOptimizationStickyStatusVariables
    readonly AdsAdAccountSettingsStoreSourceServer: WaMexAdsAdAccountSettingsStoreSourceServerVariables
    readonly AdsBulkEditCampaignGroupAgencyFeeBulkContainer: WaMexAdsBulkEditCampaignGroupAgencyFeeBulkContainerVariables
    readonly AdsBulkEditCampaignGroupAgencyFeeContainerAdAccountAgencyFee: WaMexAdsBulkEditCampaignGroupAgencyFeeContainerAdAccountAgencyFeeVariables
    readonly AdsBulkEditCampaignGroupBudgetFieldContainer_: WaMexAdsBulkEditCampaignGroupBudgetFieldContainer_Variables
    readonly AdsBusinessWhatsAppBusinessAccountProviderPluginBSP: WaMexAdsBusinessWhatsAppBusinessAccountProviderPluginBSPVariables
    readonly AdsFocusFrameworkStickinessDataManager: WaMexAdsFocusFrameworkStickinessDataManagerVariables
    readonly AdsInstagramAccountMediaListRIStoreSourceServer: WaMexAdsInstagramAccountMediaListRIStoreSourceServerVariables
    readonly AdsManagerLiveDataCampaign: WaMexAdsManagerLiveDataCampaignVariables
    readonly AdsManagerLiveDataCampaignQueryPreloadingConfigNoSpecs: WaMexAdsManagerLiveDataCampaignQueryPreloadingConfigNoSpecsVariables
    readonly AdsPLRAlphaBetaCheckUtilLogEntryPointExposure: WaMexAdsPLRAlphaBetaCheckUtilLogEntryPointExposureVariables
    readonly AdsUEditorAdgroupBrandedContentWAPreviewWrapper_: WaMexAdsUEditorAdgroupBrandedContentWAPreviewWrapper_Variables
    readonly AdsUEditorAdgroupMessageDestinationPageCategory: WaMexAdsUEditorAdgroupMessageDestinationPageCategoryVariables
    readonly AdsUEditorAdgroupMessageDestinationPreviewContainerCTWAWaba: WaMexAdsUEditorAdgroupMessageDestinationPreviewContainerCTWAWabaVariables
    readonly AdsUEditorAdgroupPartnershipAdsStatusVerifiedIdentities_: WaMexAdsUEditorAdgroupPartnershipAdsStatusVerifiedIdentities_Variables
    readonly AdvertiserProfileMessageMarketingDataStoreLoader: WaMexAdvertiserProfileMessageMarketingDataStoreLoaderVariables
    readonly AiAgentAutoReplyControl: WaMexAiAgentAutoReplyControlVariables
    readonly AuthAgentFeaturePolicy: WaMexAuthAgentFeaturePolicyVariables
    readonly BPAccessTokenAndSessionCookies: WaMexBPAccessTokenAndSessionCookiesVariables
    readonly BizCreateOrder: WaMexBizCreateOrderVariables
    readonly BizGetCategories: WaMexBizGetCategoriesVariables
    readonly BizGetCategoriesV2: WaMexBizGetCategoriesV2Variables
    readonly BizGetCustomUrlUserGraphql: WaMexBizGetCustomUrlUserGraphqlVariables
    readonly BizGetMerchantCompliance: WaMexBizGetMerchantComplianceVariables
    readonly BizGetPriceTiers: WaMexBizGetPriceTiersVariables
    readonly BizGetProfileShimlinks: WaMexBizGetProfileShimlinksVariables
    readonly BizGraphQLRefreshCart: WaMexBizGraphQLRefreshCartVariables
    readonly BizProfileAddressAutocomplete: WaMexBizProfileAddressAutocompleteVariables
    readonly BizProfileRoot: WaMexBizProfileRootVariables
    readonly BizQueryOrder: WaMexBizQueryOrderVariables
    readonly BizSetMerchantCompliance: WaMexBizSetMerchantComplianceVariables
    readonly BrResolvePaymentAccountLink: WaMexBrResolvePaymentAccountLinkVariables
    readonly CTXChatBuilderDialogContainerUtils: WaMexCTXChatBuilderDialogContainerUtilsVariables
    readonly CTXChatBuilderWAFlowsUtilsWAMFlowsCTWAEditorModal: WaMexCTXChatBuilderWAFlowsUtilsWAMFlowsCTWAEditorModalVariables
    readonly CachedToken: WaMexCachedTokenVariables
    readonly CanonicalUserValid: WaMexCanonicalUserValidVariables
    readonly ChangeNewsletterOwner: WaMexChangeNewsletterOwnerVariables
    readonly ClientEdgeQuery_AdsBulkEditAdgroupAgenticCheckoutOptInPlugin_Query_selected_ad_account__shops_ads_identity_product_catalog: WaMexClientEdgeQuery_AdsBulkEditAdgroupAgenticCheckoutOptInPlugin_Query_selected_ad_account__shops_ads_identity_product_catalogVariables
    readonly ClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_combined_campaign_group__product_catalog: WaMexClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_combined_campaign_group__product_catalogVariables
    readonly ClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_creative__product_set__product_catalog: WaMexClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_creative__product_set__product_catalogVariables
    readonly CoexCanonicalState: WaMexCoexCanonicalStateVariables
    readonly ConsumerFetchQuickPromotions: WaMexConsumerFetchQuickPromotionsVariables
    readonly ConsumerQuickPromotionActionGraphQL: WaMexConsumerQuickPromotionActionGraphQLVariables
    readonly ContactManagerCustomerProfile: WaMexContactManagerCustomerProfileVariables
    readonly ContactManagerCustomerProfileDelete: WaMexContactManagerCustomerProfileDeleteVariables
    readonly ContactManagerCustomerProfileUpsert: WaMexContactManagerCustomerProfileUpsertVariables
    readonly ContactManagerCustomerProfiles: WaMexContactManagerCustomerProfilesVariables
    readonly CreateEnforcementAppeal: WaMexCreateEnforcementAppealVariables
    readonly CreateInviteCode: WaMexCreateInviteCodeVariables
    readonly CreateLabyrinthBackup: WaMexCreateLabyrinthBackupVariables
    readonly CreateMarketingCampaignAction: WaMexCreateMarketingCampaignActionVariables
    readonly CreateNewsletter: WaMexCreateNewsletterVariables
    readonly CreateNewsletterAdminInvite: WaMexCreateNewsletterAdminInviteVariables
    readonly CreateReportAppeal: WaMexCreateReportAppealVariables
    readonly CreateWhatsAppAdsIdentity: WaMexCreateWhatsAppAdsIdentityVariables
    readonly CustomLabel3pdEvent: WaMexCustomLabel3pdEventVariables
    readonly CustomerManagerAccessState: WaMexCustomerManagerAccessStateVariables
    readonly CustomerManagerCustomerProfileCustomFieldCreate: WaMexCustomerManagerCustomerProfileCustomFieldCreateVariables
    readonly CustomerManagerStartTrial: WaMexCustomerManagerStartTrialVariables
    readonly DebugLabyrinthAddDevice: WaMexDebugLabyrinthAddDeviceVariables
    readonly DebugLabyrinthFetchVirtualDeviceInfo: WaMexDebugLabyrinthFetchVirtualDeviceInfoVariables
    readonly DebugLabyrinthInboxSnapshot: WaMexDebugLabyrinthInboxSnapshotVariables
    readonly DebugLabyrinthRange: WaMexDebugLabyrinthRangeVariables
    readonly DebugLabyrinthRestorePage: WaMexDebugLabyrinthRestorePageVariables
    readonly DeleteNewsletter: WaMexDeleteNewsletterVariables
    readonly DemoteNewsletterAdmin: WaMexDemoteNewsletterAdminVariables
    readonly E2EEMetadataMailboxFetchGroupInfoV4: WaMexE2EEMetadataMailboxFetchGroupInfoV4Variables
    readonly EBMessageRangeQueryForThreads: WaMexEBMessageRangeQueryForThreadsVariables
    readonly EditBizProfile: WaMexEditBizProfileVariables
    readonly EmailInviteSendGroup: WaMexEmailInviteSendGroupVariables
    readonly ExternalCtxAuthoriseWAChat: WaMexExternalCtxAuthoriseWAChatVariables
    readonly FetchAllNewslettersMetadata: WaMexFetchAllNewslettersMetadataVariables
    readonly FetchAllSubgroups: WaMexFetchAllSubgroupsVariables
    readonly FetchBotCertificateRevocationList: WaMexFetchBotCertificateRevocationListVariables
    readonly FetchBotProfilesGQL: WaMexFetchBotProfilesGQLVariables
    readonly FetchBotTasks: WaMexFetchBotTasksVariables
    readonly FetchDynamicAIModes: WaMexFetchDynamicAIModesVariables
    readonly FetchGroupInfo: WaMexFetchGroupInfoVariables
    readonly FetchGroupInfoIncludBots: WaMexFetchGroupInfoIncludBotsVariables
    readonly FetchGroupInfoIncludBotsJobAcp2: WaMexFetchGroupInfoIncludBotsJobAcp2Variables
    readonly FetchGroupInfoJobAcp2: WaMexFetchGroupInfoJobAcp2Variables
    readonly FetchGroupInviteCode: WaMexFetchGroupInviteCodeVariables
    readonly FetchGroupInviteInfo: WaMexFetchGroupInviteInfoVariables
    readonly FetchGroupInviteInfoJobAddRequest: WaMexFetchGroupInviteInfoJobAddRequestVariables
    readonly FetchGroupIsInternal: WaMexFetchGroupIsInternalVariables
    readonly FetchGroupMembershipFormForJoinJobAddRequest: WaMexFetchGroupMembershipFormForJoinJobAddRequestVariables
    readonly FetchGroupMembershipFormForJoinJobInvite: WaMexFetchGroupMembershipFormForJoinJobInviteVariables
    readonly FetchGroupMembershipFormForJoinJobLinked: WaMexFetchGroupMembershipFormForJoinJobLinkedVariables
    readonly FetchIntegritySignals: WaMexFetchIntegritySignalsVariables
    readonly FetchLabyrinthEpochChain: WaMexFetchLabyrinthEpochChainVariables
    readonly FetchLabyrinthEpochDevices: WaMexFetchLabyrinthEpochDevicesVariables
    readonly FetchLinkedGroupInfo: WaMexFetchLinkedGroupInfoVariables
    readonly FetchMembershipApprovalRequests: WaMexFetchMembershipApprovalRequestsVariables
    readonly FetchMetaOnePromoEligibility: WaMexFetchMetaOnePromoEligibilityVariables
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
    readonly FetchPhoneNumberSharingSettings: WaMexFetchPhoneNumberSharingSettingsVariables
    readonly FetchPlaintextLinkPreview: WaMexFetchPlaintextLinkPreviewVariables
    readonly FetchQuickPromotions: WaMexFetchQuickPromotionsVariables
    readonly FetchReachoutTimelock: WaMexFetchReachoutTimelockVariables
    readonly FetchRecommendedNewsletters: WaMexFetchRecommendedNewslettersVariables
    readonly FetchSimilarNewsletters: WaMexFetchSimilarNewslettersVariables
    readonly FetchSubgroupSuggestions: WaMexFetchSubgroupSuggestionsVariables
    readonly FetchSubscriptionEntryPoints: WaMexFetchSubscriptionEntryPointsVariables
    readonly FetchSubscriptions: WaMexFetchSubscriptionsVariables
    readonly FetchTextStatusList: WaMexFetchTextStatusListVariables
    readonly FetchWassBotListProfilesGQL: WaMexFetchWassBotListProfilesGQLVariables
    readonly FetchWassBotProfileGQL: WaMexFetchWassBotProfileGQLVariables
    readonly GetAccessTokenFromOIDCCode: WaMexGetAccessTokenFromOIDCCodeVariables
    readonly GetAccountNonce: WaMexGetAccountNonceVariables
    readonly GetDsbInfo: WaMexGetDsbInfoVariables
    readonly GetFBAccountPages: WaMexGetFBAccountPagesVariables
    readonly GetNumbersForBrandIds: WaMexGetNumbersForBrandIdsVariables
    readonly GetPrivacyLists: WaMexGetPrivacyListsVariables
    readonly GetPrivacySettings: WaMexGetPrivacySettingsVariables
    readonly GetUsername: WaMexGetUsernameVariables
    readonly GetWAAEligibility: WaMexGetWAAEligibilityVariables
    readonly GetWoasAgeSignal: WaMexGetWoasAgeSignalVariables
    readonly GraphQLProductCatalogGetPublicKey: WaMexGraphQLProductCatalogGetPublicKeyVariables
    readonly GraphQLVerifyPostcode: WaMexGraphQLVerifyPostcodeVariables
    readonly GroupJoin: WaMexGroupJoinVariables
    readonly GroupStoreAndSendInviteSms: WaMexGroupStoreAndSendInviteSmsVariables
    readonly GroupStoreInviteSms: WaMexGroupStoreInviteSmsVariables
    readonly GroupSuspensionAppeal: WaMexGroupSuspensionAppealVariables
    readonly IntegrityChallengeResponse: WaMexIntegrityChallengeResponseVariables
    readonly InternalDirectoryFetchMembers: WaMexInternalDirectoryFetchMembersVariables
    readonly JoinNewsletter: WaMexJoinNewsletterVariables
    readonly KeyTransparencyGraphQLClient_: WaMexKeyTransparencyGraphQLClient_Variables
    readonly LeaveNewsletter: WaMexLeaveNewsletterVariables
    readonly LidChangeNotification: WaMexLidChangeNotificationVariables
    readonly LogNewsletterExposures: WaMexLogNewsletterExposuresVariables
    readonly LogServerSentInviteIntent: WaMexLogServerSentInviteIntentVariables
    readonly MAIBAAdObjectReference_StoryMetadata: WaMexMAIBAAdObjectReference_StoryMetadataVariables
    readonly MAIBAChatThread: WaMexMAIBAChatThreadVariables
    readonly MAIBAGraphQLSendMessageV2Query: WaMexMAIBAGraphQLSendMessageV2QueryVariables
    readonly MAIBAGraphQLSendMessageV3Query: WaMexMAIBAGraphQLSendMessageV3QueryVariables
    readonly MAIBAGraphQLSendMessageV4Query: WaMexMAIBAGraphQLSendMessageV4QueryVariables
    readonly MAIBAPageReference: WaMexMAIBAPageReferenceVariables
    readonly MAIBAUpdateAdsAIConsent: WaMexMAIBAUpdateAdsAIConsentVariables
    readonly MetaPayVaultInitialize: WaMexMetaPayVaultInitializeVariables
    readonly MetaPayVaultLabyrinthDelete: WaMexMetaPayVaultLabyrinthDeleteVariables
    readonly MetaPayVaultLabyrinthFetchAll: WaMexMetaPayVaultLabyrinthFetchAllVariables
    readonly MetaPayVaultLabyrinthSave: WaMexMetaPayVaultLabyrinthSaveVariables
    readonly NativeMLModel: WaMexNativeMLModelVariables
    readonly NewsletterAddPaidPartnershipLabel: WaMexNewsletterAddPaidPartnershipLabelVariables
    readonly NewsletterBlockUser: WaMexNewsletterBlockUserVariables
    readonly NewsletterLabelAiContent: WaMexNewsletterLabelAiContentVariables
    readonly NewsletterPinMessages: WaMexNewsletterPinMessagesVariables
    readonly NewsletterQuestionResponseStateUpdate: WaMexNewsletterQuestionResponseStateUpdateVariables
    readonly NewsletterUnpinMessages: WaMexNewsletterUnpinMessagesVariables
    readonly OrgAdminGraphQLAddChannel: WaMexOrgAdminGraphQLAddChannelVariables
    readonly OrgAdminGraphQLAddGroup: WaMexOrgAdminGraphQLAddGroupVariables
    readonly OrgAdminGraphQLAdminRoster: WaMexOrgAdminGraphQLAdminRosterVariables
    readonly OrgAdminGraphQLApplyAdminRosterChanges: WaMexOrgAdminGraphQLApplyAdminRosterChangesVariables
    readonly OrgAdminGraphQLDirectoryPage: WaMexOrgAdminGraphQLDirectoryPageVariables
    readonly OrgAdminGraphQLEventRsvpCounts: WaMexOrgAdminGraphQLEventRsvpCountsVariables
    readonly OrgAdminGraphQLGroup: WaMexOrgAdminGraphQLGroupVariables
    readonly OrgAdminGraphQLInviteMembers: WaMexOrgAdminGraphQLInviteMembersVariables
    readonly OrgAdminGraphQLLeave: WaMexOrgAdminGraphQLLeaveVariables
    readonly OrgAdminGraphQLManagedChannelAdmins: WaMexOrgAdminGraphQLManagedChannelAdminsVariables
    readonly OrgAdminGraphQLManagedChannels: WaMexOrgAdminGraphQLManagedChannelsVariables
    readonly OrgAdminGraphQLManagedEvents: WaMexOrgAdminGraphQLManagedEventsVariables
    readonly OrgAdminGraphQLManagedGroups: WaMexOrgAdminGraphQLManagedGroupsVariables
    readonly OrgAdminGraphQLMemberSearch: WaMexOrgAdminGraphQLMemberSearchVariables
    readonly OrgAdminGraphQLOrgs: WaMexOrgAdminGraphQLOrgsVariables
    readonly OrgAdminGraphQLRemoveMember: WaMexOrgAdminGraphQLRemoveMemberVariables
    readonly OrgAdminGraphQLSendManagedGroupEmailInvites: WaMexOrgAdminGraphQLSendManagedGroupEmailInvitesVariables
    readonly OrgAdminGraphQLSetMemberRole: WaMexOrgAdminGraphQLSetMemberRoleVariables
    readonly OrgAdminGraphQLSubmitBulkGroupRequest: WaMexOrgAdminGraphQLSubmitBulkGroupRequestVariables
    readonly OrgAdminGraphQLUpdateOrg: WaMexOrgAdminGraphQLUpdateOrgVariables
    readonly OrgMemberUpdateNotificationHandler: WaMexOrgMemberUpdateNotificationHandlerVariables
    readonly PaymentsPasskeyHasCredential: WaMexPaymentsPasskeyHasCredentialVariables
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
    readonly RequestOTE: WaMexRequestOTEVariables
    readonly ResolveAccountTypeAndAdPage: WaMexResolveAccountTypeAndAdPageVariables
    readonly ResolveAccountTypeAndAdPageQuery: WaMexResolveAccountTypeAndAdPageQueryVariables
    readonly RevokeNewsletterAdminInvite: WaMexRevokeNewsletterAdminInviteVariables
    readonly RotateLabyrinthEpoch: WaMexRotateLabyrinthEpochVariables
    readonly SaveResponseTonePreference: WaMexSaveResponseTonePreferenceVariables
    readonly SetUsername: WaMexSetUsernameVariables
    readonly SetUsernameKey: WaMexSetUsernameKeyVariables
    readonly SharableEventAddInvitations: WaMexSharableEventAddInvitationsVariables
    readonly SharableEventCreate: WaMexSharableEventCreateVariables
    readonly SharableEventDelete: WaMexSharableEventDeleteVariables
    readonly SharableEventGet: WaMexSharableEventGetVariables
    readonly SharableEventGuestJoinedWaNotifications: WaMexSharableEventGuestJoinedWaNotificationsVariables
    readonly SharableEventInviteLinkJobGetOrCreate: WaMexSharableEventInviteLinkJobGetOrCreateVariables
    readonly SharableEventInviteLinkJobInvalidate: WaMexSharableEventInviteLinkJobInvalidateVariables
    readonly SharableEventInviteLinkJobRotate: WaMexSharableEventInviteLinkJobRotateVariables
    readonly SharableEventJoinViaLink: WaMexSharableEventJoinViaLinkVariables
    readonly SharableEventLeave: WaMexSharableEventLeaveVariables
    readonly SharableEventLinkPreview: WaMexSharableEventLinkPreviewVariables
    readonly SharableEventList: WaMexSharableEventListVariables
    readonly SharableEventPlaceSearch: WaMexSharableEventPlaceSearchVariables
    readonly SharableEventPresetCovers: WaMexSharableEventPresetCoversVariables
    readonly SharableEventReconcile: WaMexSharableEventReconcileVariables
    readonly SharableEventRemoveInvitations: WaMexSharableEventRemoveInvitationsVariables
    readonly SharableEventUpdate: WaMexSharableEventUpdateVariables
    readonly SharableEventUpdateRsvp: WaMexSharableEventUpdateRsvpVariables
    readonly SignupMetadata: WaMexSignupMetadataVariables
    readonly SkipStoppedMessages: WaMexSkipStoppedMessagesVariables
    readonly StartConversationTemplateReengagementWithCatalogSection: WaMexStartConversationTemplateReengagementWithCatalogSectionVariables
    readonly StartConversationsTemplateCustomerActionsSectionIsEligibleForAIRegeneration: WaMexStartConversationsTemplateCustomerActionsSectionIsEligibleForAIRegenerationVariables
    readonly StartConversationsTemplateDialogContainerBodyGraphQLWelcomeMessageFlows: WaMexStartConversationsTemplateDialogContainerBodyGraphQLWelcomeMessageFlowsVariables
    readonly StartConversationsTemplateFAQGenAIRegeneration: WaMexStartConversationsTemplateFAQGenAIRegenerationVariables
    readonly SubscriptionWaffleAgeCheck: WaMexSubscriptionWaffleAgeCheckVariables
    readonly SupportBugReportCreateDogfoodingTask: WaMexSupportBugReportCreateDogfoodingTaskVariables
    readonly SupportBugReportSubmit: WaMexSupportBugReportSubmitVariables
    readonly SupportChatAuthRefresh: WaMexSupportChatAuthRefreshVariables
    readonly SupportContactFormSubmit: WaMexSupportContactFormSubmitVariables
    readonly SupportMessageFeedbackSubmit: WaMexSupportMessageFeedbackSubmitVariables
    readonly TeamLinkCreateInvitation: WaMexTeamLinkCreateInvitationVariables
    readonly TeamLinkListInvitations: WaMexTeamLinkListInvitationsVariables
    readonly TeamLinkRemoveInvitation: WaMexTeamLinkRemoveInvitationVariables
    readonly TeamLinkUpdateAgentRole: WaMexTeamLinkUpdateAgentRoleVariables
    readonly TransferCommunityOwnership: WaMexTransferCommunityOwnershipVariables
    readonly UpdateGroupProperty: WaMexUpdateGroupPropertyVariables
    readonly UpdateNewsletter: WaMexUpdateNewsletterVariables
    readonly UpdateNewsletterAdminProfile: WaMexUpdateNewsletterAdminProfileVariables
    readonly UpdateNewsletterAdminProfileSetting: WaMexUpdateNewsletterAdminProfileSettingVariables
    readonly UpdateNewsletterUserSetting: WaMexUpdateNewsletterUserSettingVariables
    readonly UpdateTextStatus: WaMexUpdateTextStatusVariables
    readonly UploadLabyrinthMessages: WaMexUploadLabyrinthMessagesVariables
    readonly UsernameAvailability: WaMexUsernameAvailabilityVariables
    readonly Usync: WaMexUsyncVariables
    readonly WAAOnboarding: WaMexWAAOnboardingVariables
    readonly WAMFlowsCTWAEditorModal: WaMexWAMFlowsCTWAEditorModalVariables
    readonly WAMFlowsCTWAFlowPreview: WaMexWAMFlowsCTWAFlowPreviewVariables
    readonly WODirectoryFetchCompanyName: WaMexWODirectoryFetchCompanyNameVariables
    readonly WaffleFXServiceDataQueryV2: WaMexWaffleFXServiceDataQueryV2Variables
    readonly WaffleFXWAMOUpdateUOOM: WaMexWaffleFXWAMOUpdateUOOMVariables
    readonly WaffleXE: WaMexWaffleXEVariables
    readonly WhatsAppMarketingCampaignCustomerListPickerLists: WaMexWhatsAppMarketingCampaignCustomerListPickerListsVariables
    readonly fetchWebsiteMediaImageURLs: WaMexfetchWebsiteMediaImageURLsVariables
    readonly navigateToProductInsightsWithDefaultTab: WaMexnavigateToProductInsightsWithDefaultTabVariables
    readonly useFetchAdAccountsForL4Context: WaMexuseFetchAdAccountsForL4ContextVariables
    readonly useFetchAdAccountsNameById: WaMexuseFetchAdAccountsNameByIdVariables
    readonly useFlowJSONValidationLibrary: WaMexuseFlowJSONValidationLibraryVariables
    readonly useIsMessengerPlatformBot: WaMexuseIsMessengerPlatformBotVariables
    readonly useMAIBAAsyncNotification: WaMexuseMAIBAAsyncNotificationVariables
    readonly useMAIBAMedia: WaMexuseMAIBAMediaVariables
    readonly useWAWebEstimatedDailyReach: WaMexuseWAWebEstimatedDailyReachVariables
    readonly useWAWebEstimatedDailyReachShadow: WaMexuseWAWebEstimatedDailyReachShadowVariables
    readonly useWAWebSmartComposerCoachSuggestedReply: WaMexuseWAWebSmartComposerCoachSuggestedReplyVariables
    readonly useWAWebSmartComposerReportThreadEvent: WaMexuseWAWebSmartComposerReportThreadEventVariables
    readonly useWAWebSmartComposerReportUsed: WaMexuseWAWebSmartComposerReportUsedVariables
}

export type WaMexACSServerProviderConfigResponse = {
    readonly xwa_wa_acs_config?: {
        readonly cipher_suite?: string
        readonly expire_time?: number
        readonly id?: string
        readonly max_evals?: number
        readonly public_key?: string
        readonly redemption_limit?: string
        readonly token_ttl?: number
    }
}

export type WaMexACSServerProviderIssuanceResponse = {
    readonly xwa_wa_acs_issue_credentials?: {
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
        readonly success?: boolean
    }
}

export type WaMexAECompanionOffboardResponse = {
    readonly xfb_whatsapp_coexistence_offboard_product?: {
        readonly success?: boolean
    }
}

export type WaMexAECompanionOnboardResponse = {
    readonly xfb_whatsapp_coexistence_process_native_onboarding?: {
        readonly success?: boolean
    }
}

export type WaMexAcceptNewsletterAdminInviteResponse = {
    readonly xwa2_newsletter_admin_invite_accept?: {
        readonly __typename?: string
        readonly id?: string
    }
}

export type WaMexAccountLinkingAPIGetCertsResponse = {
    readonly waffle_get_certs?: {
        readonly password_encryption?: {
            readonly cert_chain_pem?: string
            readonly key_id?: string
            readonly ttl_seconds?: number
        }
        readonly payload_encryption?: {
            readonly cert_chain_pem?: string
            readonly key_id?: string
            readonly ttl_seconds?: number
        }
    }
}

export type WaMexAdAccountDpaEligibleProductCatalogListStoreSourceResponse = {
    readonly ad_account?: {
        readonly dpa_eligible_product_catalogs?: ReadonlyArray<{
            readonly id?: string
        }>
        readonly id?: string
    }
}

export type WaMexAdPreferencesDFCABusinessOptOutResponse = {
    readonly update_dfca_optout?: {
        readonly business_info?: {
            readonly id?: string
        }
    }
}

export type WaMexAdPreferencesDemographicCategoryOptOutResponse = {
    readonly tc_remove_user_bct?: {
        readonly __typename?: string
        readonly id?: string
    }
}

export type WaMexAdPreferencesHideAdvertiserResponse = {
    readonly advertiser_hide?: {
        readonly advertiser?: {
            readonly id?: string
            readonly is_hidden?: boolean
        }
        readonly client_mutation_id?: string
    }
}

export type WaMexAdPreferencesInterestCategoryOptOutResponse = {
    readonly tc_remove_user_interest?: {
        readonly __typename?: string
        readonly id?: string
    }
}

export type WaMexAddLabyrinthPeerDeviceResponse = {
    readonly wa_labyrinth_add_peer_device?: {
        readonly __typename?: string
        readonly backup_id?: string
        readonly device_id?: string
        readonly error_code?: string
        readonly message?: string
    }
}

export type WaMexAdsAccountDataDispatcherResponse = {
    readonly ad_account?: {
        readonly id?: string
        readonly legacy_account_id?: string
    }
}

export type WaMexAdsAccountDataDispatcherViewerPermissionsResponse = {
    readonly xfb_andromeda_XAdsAccountViewerPermissionsGetController?: {
        readonly permissions?: unknown
    }
}

export type WaMexAdsAccountStoreNewSourceServerResponse = {
    readonly ad_account?: {
        readonly id?: string
    }
    readonly ad_account_ref?: {
        readonly ad_account?: {
            readonly id?: string
        }
        readonly id?: string
    }
}

export type WaMexAdsAdAccountSettingsStoreSetAPlusCFeatureStickyStatusResponse = {
    readonly set_aplus_cfeature_sticky_status_ads_ad_account_settings?: {
        readonly ads_ad_account_settings?: {
            readonly feature_sticky_entries?: ReadonlyArray<{
                readonly feature_name?: string
                readonly status?: string
                readonly timestamp?: string
            }>
            readonly id?: string
        }
    }
}

export type WaMexAdsAdAccountSettingsStoreSetL1AESourceStickyStatusResponse = {
    readonly set_l1_ae_source_sticky_status_ads_ad_account_settings?: {
        readonly ads_ad_account_settings?: {
            readonly id?: string
            readonly l1ae_source_sticky_entries?: ReadonlyArray<{
                readonly container?: unknown
                readonly source?: string
                readonly status?: string
                readonly timestamp?: string
            }>
        }
    }
}

export type WaMexAdsAdAccountSettingsStoreSetMultiMediaStickyStatusResponse = {
    readonly set_multi_media_sticky_status_ads_ad_account_settings?: {
        readonly ads_ad_account_settings?: {
            readonly id?: string
            readonly multi_media_sticky_entries?: ReadonlyArray<{
                readonly feature?: unknown
                readonly status?: string
                readonly timestamp?: string
            }>
        }
    }
}

export type WaMexAdsAdAccountSettingsStoreSetVideoOptimizationStickyStatusResponse = {
    readonly set_video_optimization_sticky_status_ads_ad_account_settings?: {
        readonly ads_ad_account_settings?: {
            readonly id?: string
            readonly video_optimization_sticky_entries?: ReadonlyArray<{
                readonly optimization?: unknown
                readonly status?: string
                readonly timestamp?: string
            }>
        }
    }
}

export type WaMexAdsAdAccountSettingsStoreSourceServerResponse = {
    readonly ads_ad_account_settings_from_ad_account?: {
        readonly feature_sticky_entries?: ReadonlyArray<{
            readonly feature_name?: string
            readonly status?: string
            readonly timestamp?: string
        }>
        readonly id?: string
        readonly is_genai_adoption_survey_exhausted?: boolean
        readonly is_video_gen_survey_exhausted?: boolean
        readonly l1ae_source_sticky_entries?: ReadonlyArray<{
            readonly container?: unknown
            readonly source?: string
            readonly status?: string
            readonly timestamp?: string
        }>
        readonly multi_media_sticky_entries?: ReadonlyArray<{
            readonly feature?: unknown
            readonly status?: string
            readonly timestamp?: string
        }>
        readonly video_optimization_sticky_entries?: ReadonlyArray<{
            readonly optimization?: unknown
            readonly status?: string
            readonly timestamp?: string
        }>
    }
}

export type WaMexAdsBulkEditCampaignGroupAgencyFeeBulkContainerResponse = {
    readonly ad_account?: {
        readonly agency_fee_config?: {
            readonly default_agency_fee_pct?: unknown
            readonly id?: string
            readonly is_agency_fee_disabled?: boolean
        }
        readonly can_manage_agency_fee?: boolean
        readonly can_see_agency_fee?: boolean
        readonly id?: string
        readonly tax_country?: unknown
    }
}

export type WaMexAdsBulkEditCampaignGroupAgencyFeeContainerAdAccountAgencyFeeResponse = {
    readonly ad_account?: {
        readonly agency_fee_config?: {
            readonly default_agency_fee_pct?: unknown
            readonly id?: string
            readonly is_agency_fee_disabled?: boolean
        }
        readonly can_manage_agency_fee?: boolean
        readonly can_see_agency_fee?: boolean
        readonly id?: string
        readonly tax_country?: unknown
    }
}

export type WaMexAdsBulkEditCampaignGroupBudgetFieldContainer_Response = {
    readonly ad_account?: {
        readonly id?: string
    }
}

export type WaMexAdsBusinessWhatsAppBusinessAccountProviderPluginBSPResponse = {
    readonly nodes?: ReadonlyArray<{
        readonly __typename?: string
        readonly bsp_partner_business?: {
            readonly id?: string
            readonly name?: string
            readonly profile_picture_url?: string
        }
        readonly id?: string
    }>
}

export type WaMexAdsFocusFrameworkStickinessDataManagerResponse = {
    readonly xfb_andromeda_XAdsFocusFrameworkStickyFieldsController?: {
        readonly sticky_fields?: ReadonlyArray<string>
    }
}

export type WaMexAdsInstagramAccountMediaListRIStoreSourceServerResponse = {
    readonly fetch__InstagramUserV2?: {
        readonly id?: string
        readonly instagram_media_v2?: {
            readonly nodes?: ReadonlyArray<{
                readonly creation_time?: string
                readonly id?: string
                readonly instagram_media_type?: string
                readonly is_sub_media?: boolean
                readonly media_url?: string
                readonly media_v1_id?: string
                readonly thumbnail_url?: string
                readonly video_metadata?: {
                    readonly duration?: number
                    readonly height?: number
                    readonly width?: number
                }
            }>
            readonly page_info?: {
                readonly end_cursor?: string
            }
        }
    }
}

export type WaMexAdsManagerLiveDataCampaignResponse = {
    readonly nodes?: ReadonlyArray<{
        readonly __typename?: string
        readonly id?: string
    }>
}

export type WaMexAdsManagerLiveDataCampaignQueryPreloadingConfigNoSpecsResponse = {
    readonly xfb_ads_ui_root?: {
        readonly campaigns_live_table_context?: {
            readonly campaign_ids?: ReadonlyArray<string>
            readonly campaigns?: {
                readonly nodes?: ReadonlyArray<{
                    readonly id?: string
                }>
            }
        }
    }
}

export type WaMexAdsPLRAlphaBetaCheckUtilLogEntryPointExposureResponse = {
    readonly log_plr_entry_point_exposure?: {
        readonly success?: boolean
    }
}

export type WaMexAdsUEditorAdgroupBrandedContentWAPreviewWrapper_Response = {
    readonly ad_account?: {
        readonly id?: string
        readonly marketing_message_business_tier?: unknown
        readonly marketing_messages_account_settings?: {
            readonly dfca_automatic_upload_consent_status?: string
            readonly has_created_whatsapp_liquidity_campaign?: boolean
            readonly id?: string
            readonly messenger_activation_status?: string
            readonly messenger_subscriber_pool?: {
                readonly dfca_automatic_upload_consent_status?: string
                readonly id?: string
                readonly is_custom_audience_populating?: boolean
                readonly name?: string
                readonly subscriber_pool_audience_size?: {
                    readonly upper_bound?: number
                }
            }
            readonly whatsapp_activation_status?: string
            readonly whatsapp_phone_number_current_status?: {
                readonly id?: string
                readonly status?: string
            }
            readonly whatsapp_subscriber_pool?: {
                readonly id?: string
                readonly is_agency_subscriber_upload_enabled?: boolean
                readonly name?: string
                readonly owning_business?: {
                    readonly id?: string
                }
                readonly viewer_permissions?: {
                    readonly can_update_automations?: boolean
                    readonly can_upload_to_pool?: boolean
                }
            }
        }
        readonly mm_advertiser_profile_editable_attributes?: ReadonlyArray<{
            readonly __typename?: string
            readonly id?: string
            readonly value?: {
                readonly __typename?: string
                readonly as_boolean?: boolean
                readonly as_string?: string
            }
        }>
    }
    readonly business?: {
        readonly id?: string
        readonly marketing_messages_enabled_whatsapp_accounts?: {
            readonly nodes?: ReadonlyArray<{
                readonly has_permissions_to_create_message_marketing_campaign_on_ads_manager?: boolean
                readonly id?: string
                readonly is_reused_on_ads_manager?: boolean
                readonly marketing_messages_restriction_status?: string
                readonly owner_business?: {
                    readonly id?: string
                }
                readonly phone_numbers?: {
                    readonly nodes?: ReadonlyArray<{
                        readonly display_name_verification_request_status?: string
                        readonly display_phone_number?: string
                        readonly id?: string
                        readonly is_virtual_phone_number?: boolean
                        readonly platform_type?: string
                        readonly status?: string
                    }>
                }
            }>
        }
        readonly marketing_messages_enabled_whatsapp_business_accounts?: {
            readonly nodes?: ReadonlyArray<{
                readonly has_permissions_to_create_message_marketing_campaign_on_ads_manager?: boolean
                readonly id?: string
                readonly is_reused_on_ads_manager?: boolean
                readonly marketing_messages_restriction_status?: string
                readonly owner_business?: {
                    readonly id?: string
                }
                readonly phone_numbers?: {
                    readonly nodes?: ReadonlyArray<{
                        readonly display_name_verification_request_status?: string
                        readonly display_phone_number?: string
                        readonly id?: string
                        readonly is_virtual_phone_number?: boolean
                        readonly platform_type?: string
                        readonly status?: string
                    }>
                }
            }>
        }
    }
}

export type WaMexAdsUEditorAdgroupMessageDestinationPageCategoryResponse = {
    readonly local_page?: {
        readonly category_name?: string
        readonly id?: string
    }
}

export type WaMexAdsUEditorAdgroupMessageDestinationPreviewContainerCTWAWabaResponse = {
    readonly xfb_ctwa_flows_waba_for_ad_account?: {
        readonly waba_id?: string
    }
}

export type WaMexAdsUEditorAdgroupPartnershipAdsStatusVerifiedIdentities_Response = {
    readonly primary_page?: {
        readonly __typename?: string
        readonly id?: string
        readonly is_verified?: boolean
    }
    readonly secondary_page?: {
        readonly __typename?: string
        readonly id?: string
        readonly is_verified?: boolean
    }
}

export type WaMexAdvertiserProfileMessageMarketingDataStoreLoaderResponse = {
    readonly ad_account?: {
        readonly id?: string
        readonly marketing_messages_account_settings?: {
            readonly dfca_automatic_upload_consent_status?: string
            readonly has_created_whatsapp_liquidity_campaign?: boolean
            readonly id?: string
            readonly messenger_activation_status?: string
            readonly messenger_subscriber_pool?: {
                readonly dfca_automatic_upload_consent_status?: string
                readonly id?: string
                readonly is_custom_audience_populating?: boolean
                readonly name?: string
                readonly subscriber_pool_audience_size?: {
                    readonly upper_bound?: number
                }
            }
            readonly whatsapp_activation_status?: string
            readonly whatsapp_phone_number_current_status?: {
                readonly id?: string
                readonly status?: string
            }
            readonly whatsapp_subscriber_pool?: {
                readonly id?: string
                readonly is_agency_subscriber_upload_enabled?: boolean
                readonly name?: string
                readonly owning_business?: {
                    readonly id?: string
                }
                readonly viewer_permissions?: {
                    readonly can_update_automations?: boolean
                    readonly can_upload_to_pool?: boolean
                }
            }
        }
        readonly mm_advertiser_profile_editable_attributes?: ReadonlyArray<{
            readonly __typename?: string
            readonly id?: string
            readonly value?: {
                readonly __typename?: string
                readonly as_boolean?: boolean
                readonly as_string?: string
            }
        }>
    }
}

export type WaMexAiAgentAutoReplyControlResponse = {
    readonly xfb_whatsapp_smb_maiba_status_update?: {
        readonly success?: boolean
        readonly update_timestamp_ms?: number
    }
}

export type WaMexAuthAgentFeaturePolicyResponse = {
    readonly whatsapp_authorized_agent_feature_policy?: {
        readonly disabled_features?: ReadonlyArray<string>
    }
}

export type WaMexBPAccessTokenAndSessionCookiesResponse = {
    readonly xwa_bp_access_token_and_session_cookies?: {
        readonly access_token?: string
        readonly access_token_type?: string
        readonly bp_id?: string
        readonly email_attr?: string
        readonly session_cookies?: string
        readonly status?: string
    }
}

export type WaMexBizCreateOrderResponse = {
    readonly xwa_checkout_place_order?: {
        readonly order?: {
            readonly order_id?: string
            readonly price?: {
                readonly currency?: string
                readonly price_status?: string
                readonly subtotal_amount?: number
                readonly total_amount?: number
            }
            readonly token?: string
        }
    }
}

export type WaMexBizGetCategoriesResponse = {
    readonly whatsapp_catkit_typeahead_proxy?: {
        readonly categories?: ReadonlyArray<{
            readonly display_name?: string
            readonly id?: string
        }>
        readonly not_a_biz?: {
            readonly display_name?: string
            readonly id?: string
        }
    }
}

export type WaMexBizGetCategoriesV2Response = {
    readonly whatsapp_catkit_typeahead_proxy?: {
        readonly categories?: ReadonlyArray<{
            readonly categories?: ReadonlyArray<{
                readonly categories?: ReadonlyArray<{
                    readonly display_name?: string
                    readonly id?: string
                }>
                readonly display_name?: string
                readonly id?: string
            }>
            readonly display_name?: string
            readonly id?: string
        }>
        readonly not_a_biz?: {
            readonly display_name?: string
            readonly id?: string
        }
    }
}

export type WaMexBizGetCustomUrlUserGraphqlResponse = {
    readonly xwa_custom_url_get_user?: {
        readonly error_code?: number
        readonly error_text?: string
        readonly success?: boolean
        readonly user?: {
            readonly jid?: string
        }
    }
}

export type WaMexBizGetMerchantComplianceResponse = {
    readonly xfb_whatsapp_biz_merchant_compliance_info?: {
        readonly merchant_info?: {
            readonly customer_care_details?: {
                readonly email?: string
                readonly landline_number?: string
                readonly mobile_number?: string
            }
            readonly entity_name?: string
            readonly entity_type?: string
            readonly entity_type_custom?: string
            readonly grievance_officer_details?: {
                readonly email?: string
                readonly landline_number?: string
                readonly mobile_number?: string
                readonly name?: string
            }
            readonly is_registered?: boolean
        }
    }
}

export type WaMexBizGetPriceTiersResponse = {
    readonly xwa_whatsapp_get_pricing_tiers?: {
        readonly price_tiers?: ReadonlyArray<{
            readonly description?: string
            readonly id?: string
            readonly symbol?: string
        }>
    }
}

export type WaMexBizGetProfileShimlinksResponse = {
    readonly xwa_whatsapp_smb_get_profile_linkshims?: ReadonlyArray<{
        readonly shimmed_website_url?: string
        readonly website?: string
    }>
}

export type WaMexBizGraphQLRefreshCartResponse = {
    readonly xwa_checkout_refresh_cart?: {
        readonly cart?: {
            readonly price_details?: {
                readonly currency?: string
                readonly price_status?: string
                readonly subtotal_amount?: number
                readonly total_amount?: number
            }
            readonly products?: ReadonlyArray<{
                readonly availability?: string
                readonly belongs_to?: string
                readonly compliance_category?: string
                readonly compliance_info?: {
                    readonly country_code_origin?: string
                    readonly importer_address?: {
                        readonly city?: string
                        readonly country_code?: string
                        readonly postal_code?: string
                        readonly region?: string
                        readonly street1?: string
                        readonly street2?: string
                    }
                    readonly importer_name?: string
                }
                readonly currency?: string
                readonly description?: string
                readonly id?: string
                readonly image_fetch_status?: string
                readonly is_hidden?: boolean
                readonly max_available?: number
                readonly media?: {
                    readonly images?: ReadonlyArray<{
                        readonly id?: string
                        readonly original_dimensions?: {
                            readonly height?: number
                            readonly width?: number
                        }
                        readonly request_image_url?: string
                    }>
                    readonly videos?: ReadonlyArray<{
                        readonly id?: string
                        readonly original_video_url?: string
                        readonly thumbnail_url?: string
                    }>
                }
                readonly name?: string
                readonly price?: string
                readonly product_availability?: string
                readonly retailer_id?: string
                readonly sale_price?: {
                    readonly end_date?: string
                    readonly price?: string
                    readonly start_date?: string
                }
                readonly status?: string
                readonly status_info?: {
                    readonly can_appeal?: boolean
                    readonly commerce_url?: string
                    readonly reject_reason?: string
                    readonly status?: string
                }
                readonly url?: string
                readonly variant_info?: {
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
                    readonly listing_details?: {
                        readonly description?: string
                        readonly lowest_price?: string
                        readonly multi_price?: string
                    }
                    readonly types?: ReadonlyArray<{
                        readonly name?: string
                        readonly options?: ReadonlyArray<{
                            readonly thumbnail_media?: {
                                readonly id?: string
                                readonly original_dimensions?: {
                                    readonly height?: number
                                    readonly width?: number
                                }
                                readonly original_image_url?: string
                                readonly request_image_url?: string
                            }
                            readonly value?: string
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

export type WaMexBizProfileAddressAutocompleteResponse = {
    readonly whatsapp_maps_typeahead?: {
        readonly items?: ReadonlyArray<{
            readonly address?: {
                readonly city?: string
                readonly country?: string
                readonly postalcode?: string
                readonly stateprovince?: string
                readonly streetaddress?: string
            }
            readonly id?: string
            readonly location?: {
                readonly latitude?: number
                readonly longitude?: number
            }
            readonly title?: string
        }>
    }
}

export type WaMexBizProfileRootResponse = {
    readonly viewer?: {
        readonly backing_waba?: {
            readonly business_profile?: {
                readonly about?: unknown
                readonly business_hours?: {
                    readonly note?: string
                    readonly operating_ranges?: ReadonlyArray<{
                        readonly close_time?: string
                        readonly day_of_week?: number
                        readonly mode?: string
                        readonly open_time?: string
                    }>
                    readonly timezone_id?: string
                }
                readonly description?: string
                readonly email?: string
                readonly id?: string
                readonly latitude?: number
                readonly localized_categories?: ReadonlyArray<{
                    readonly id?: string
                    readonly localized_display_name?: string
                }>
                readonly longitude?: number
                readonly physical_address?: unknown
                readonly service_areas?: ReadonlyArray<{
                    readonly description?: string
                    readonly radius_meters?: unknown
                }>
                readonly websites?: unknown
            }
            readonly id?: string
        }
    }
}

export type WaMexBizQueryOrderResponse = {
    readonly xwa_checkout_get_order_info?: {
        readonly order?: {
            readonly creation_time_stamp?: string
            readonly price_details?: {
                readonly currency?: string
                readonly subtotal_amount?: string
                readonly total_amount?: string
            }
            readonly products?: ReadonlyArray<{
                readonly currency?: string
                readonly id?: string
                readonly media?: {
                    readonly images?: ReadonlyArray<{
                        readonly id?: string
                        readonly request_image_url?: string
                    }>
                }
                readonly name?: string
                readonly price?: string
                readonly quantity?: string
                readonly variant_info?: {
                    readonly variant_properties?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                }
            }>
        }
    }
}

export type WaMexBizSetMerchantComplianceResponse = {
    readonly xfb_whatsapp_biz_merchant_set_compliance_info?: {
        readonly __typename?: string
        readonly merchant_info?: {
            readonly customer_care_details?: {
                readonly email?: string
                readonly landline_number?: string
                readonly mobile_number?: string
            }
            readonly entity_name?: string
            readonly entity_type?: string
            readonly entity_type_custom?: string
            readonly grievance_officer_details?: {
                readonly email?: string
                readonly landline_number?: string
                readonly mobile_number?: string
                readonly name?: string
            }
            readonly is_registered?: boolean
        }
    }
}

export type WaMexBrResolvePaymentAccountLinkResponse = {
    readonly xwa_resolve_payment_account_link?: {
        readonly business_jid?: string
        readonly payment_account?: {
            readonly account_type?: 'PIX'
            readonly holder_name?: string
            readonly identifier_type?: string
            readonly identifier_value?: unknown
        }
        readonly verified_name?: string
    }
}

export type WaMexCTXChatBuilderDialogContainerUtilsResponse = {
    readonly welcome_message_flows?: {
        readonly has_welcome_message_flows?: boolean
    }
}

export type WaMexCTXChatBuilderWAFlowsUtilsWAMFlowsCTWAEditorModalResponse = {
    readonly xfb_wa_flows_hsm_save_flow?: {
        readonly id?: string
    }
}

export type WaMexCachedTokenResponse = {
    readonly xwa2_ent_trade_canonical_nonce_for_access_tokens?: {
        readonly encrypted_access_tokens?: {
            readonly algorithm?: string
            readonly data?: string
            readonly key?: string
            readonly nonce?: string
            readonly tag?: string
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

export type WaMexClientEdgeQuery_AdsBulkEditAdgroupAgenticCheckoutOptInPlugin_Query_selected_ad_account__shops_ads_identity_product_catalogResponse = {
    readonly node?: {
        readonly __typename?: string
        readonly id?: string
        readonly is_agentic_checkout_enabled?: boolean
    }
}

export type WaMexClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_combined_campaign_group__product_catalogResponse = {
    readonly node?: {
        readonly __typename?: string
        readonly id?: string
    }
}

export type WaMexClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_creative__product_set__product_catalogResponse = {
    readonly node?: {
        readonly __typename?: string
        readonly id?: string
    }
}

export type WaMexCoexCanonicalStateResponse = {
    readonly xfb_whatsapp_coexistence_bsp_info_query?: {
        readonly product_states?: {
            readonly states?: ReadonlyArray<{
                readonly coex_connection_descriptor?: {
                    readonly product?: string
                    readonly provider_id?: string
                }
                readonly onboarding_status?: string
            }>
        }
    }
}

export type WaMexConsumerFetchQuickPromotionsResponse = {
    readonly quick_promotion_multiverse_batch_fetch_root?: ReadonlyArray<{
        readonly eligible_promotions?: {
            readonly edges?: ReadonlyArray<{
                readonly client_ttl_seconds?: number
                readonly is_holdout?: boolean
                readonly log_eligibility_waterfall?: string
                readonly node?: {
                    readonly __typename?: string
                    readonly ab_prop_name?: string
                    readonly client_side_dry_run?: boolean
                    readonly content_attributes?: {
                        readonly wa_banner_background_color?: {
                            readonly dark_mode_background_color?: string
                            readonly dark_mode_highlight_color?: string
                            readonly light_mode_background_color?: string
                            readonly light_mode_highlight_color?: string
                        }
                        readonly wa_eligible_duration_after_impression_in_seconds?: number
                        readonly wa_primary_cta_alternative_url?: string
                    }
                    readonly contextual_filters_for_wa_do_not_use?: {
                        readonly clause_type?: string
                        readonly clauses?: ReadonlyArray<{
                            readonly clause_type?: string
                            readonly clauses?: ReadonlyArray<{
                                readonly clause_type?: string
                                readonly clauses?: ReadonlyArray<{
                                    readonly clause_type?: string
                                    readonly clauses?: ReadonlyArray<{
                                        readonly clause_type?: string
                                        readonly clauses?: ReadonlyArray<{
                                            readonly clause_type?: string
                                            readonly clauses?: ReadonlyArray<{
                                                readonly clause_type?: string
                                                readonly clauses?: ReadonlyArray<{
                                                    readonly clause_type?: string
                                                    readonly filters?: ReadonlyArray<{
                                                        readonly filter_name?: string
                                                        readonly filter_result?: string
                                                        readonly parameters?: ReadonlyArray<{
                                                            readonly key?: string
                                                            readonly value?: string
                                                        }>
                                                        readonly passes_if_client_not_supported?: boolean
                                                    }>
                                                }>
                                                readonly filters?: ReadonlyArray<{
                                                    readonly filter_name?: string
                                                    readonly filter_result?: string
                                                    readonly parameters?: ReadonlyArray<{
                                                        readonly key?: string
                                                        readonly value?: string
                                                    }>
                                                    readonly passes_if_client_not_supported?: boolean
                                                }>
                                            }>
                                            readonly filters?: ReadonlyArray<{
                                                readonly filter_name?: string
                                                readonly filter_result?: string
                                                readonly parameters?: ReadonlyArray<{
                                                    readonly key?: string
                                                    readonly value?: string
                                                }>
                                                readonly passes_if_client_not_supported?: boolean
                                            }>
                                        }>
                                        readonly filters?: ReadonlyArray<{
                                            readonly filter_name?: string
                                            readonly filter_result?: string
                                            readonly parameters?: ReadonlyArray<{
                                                readonly key?: string
                                                readonly value?: string
                                            }>
                                            readonly passes_if_client_not_supported?: boolean
                                        }>
                                    }>
                                    readonly filters?: ReadonlyArray<{
                                        readonly filter_name?: string
                                        readonly filter_result?: string
                                        readonly parameters?: ReadonlyArray<{
                                            readonly key?: string
                                            readonly value?: string
                                        }>
                                        readonly passes_if_client_not_supported?: boolean
                                    }>
                                }>
                                readonly filters?: ReadonlyArray<{
                                    readonly filter_name?: string
                                    readonly filter_result?: string
                                    readonly parameters?: ReadonlyArray<{
                                        readonly key?: string
                                        readonly value?: string
                                    }>
                                    readonly passes_if_client_not_supported?: boolean
                                }>
                            }>
                            readonly filters?: ReadonlyArray<{
                                readonly filter_name?: string
                                readonly filter_result?: string
                                readonly parameters?: ReadonlyArray<{
                                    readonly key?: string
                                    readonly value?: string
                                }>
                                readonly passes_if_client_not_supported?: boolean
                            }>
                        }>
                        readonly filters?: ReadonlyArray<{
                            readonly filter_name?: string
                            readonly filter_result?: string
                            readonly parameters?: ReadonlyArray<{
                                readonly key?: string
                                readonly value?: string
                            }>
                            readonly passes_if_client_not_supported?: boolean
                        }>
                    }
                    readonly creatives?: ReadonlyArray<{
                        readonly __typename?: string
                        readonly accessibility_text_for_image?: string
                        readonly content?: {
                            readonly text?: string
                        }
                        readonly dismiss_action?: {
                            readonly __typename?: string
                            readonly limit?: string
                        }
                        readonly id?: string
                        readonly is_dismissible?: boolean
                        readonly primary_action?: {
                            readonly __typename?: string
                            readonly limit?: number
                            readonly title?: {
                                readonly text?: string
                            }
                            readonly url?: string
                        }
                        readonly title?: {
                            readonly text?: string
                        }
                        readonly wa_dark_mode_media_details?: {
                            readonly jpeg_thumbnail?: string
                        }
                        readonly wa_light_mode_media_details?: {
                            readonly jpeg_thumbnail?: string
                        }
                    }>
                    readonly encrypted_logging_data?: string
                    readonly id?: string
                    readonly is_server_force_pass?: boolean
                    readonly max_impressions?: number
                    readonly promotion_id?: string
                    readonly should_expose_on_client?: boolean
                    readonly surface_delay_in_seconds?: number
                    readonly wa_qp_content_attributes_do_not_use?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                }
                readonly priority?: number
                readonly time_range?: {
                    readonly end?: string
                    readonly start?: string
                }
            }>
        }
        readonly surface_nux_id?: string
    }>
}

export type WaMexConsumerQuickPromotionActionGraphQLResponse = {
    readonly wa_consumer_quick_promotion_log_event?: {
        readonly client_mutation_id?: string
    }
}

export type WaMexContactManagerCustomerProfileResponse = {
    readonly xfb_wa_customer_profile?: {
        readonly acquisition_date?: string
        readonly acquisition_source?: string
        readonly address?: string
        readonly ai_summary?: string
        readonly confirmed_appointment_date?: string
        readonly dob?: unknown
        readonly email?: string
        readonly etag?: string
        readonly last_order?: string
        readonly last_updates?: ReadonlyArray<{
            readonly field_name?: string
            readonly source?: boolean
            readonly ts?: unknown
        }>
        readonly lead_stage?: string
        readonly name?: string
        readonly order_preferences?: unknown
    }
}

export type WaMexContactManagerCustomerProfileDeleteResponse = {
    readonly xfb_wa_delete_customer_profile?: {
        readonly deleted_lid?: string
    }
}

export type WaMexContactManagerCustomerProfileUpsertResponse = {
    readonly xfb_wa_upsert_customer_profiles?: {
        readonly conflicts?: ReadonlyArray<{
            readonly lid_jid?: string
        }>
        readonly profiles?: ReadonlyArray<{
            readonly lid_jid?: string
        }>
        readonly unresolved_lids?: ReadonlyArray<string>
    }
}

export type WaMexContactManagerCustomerProfilesResponse = {
    readonly xfb_wa_customer_profiles?: {
        readonly cursor?: boolean
        readonly profiles?: ReadonlyArray<{
            readonly acquisition_source?: string
            readonly address?: string
            readonly custom_field_values?: ReadonlyArray<{
                readonly custom_field_definition?: {
                    readonly currency?: string
                    readonly currency_decimal_places?: number
                    readonly enum_option_keys?: ReadonlyArray<string>
                    readonly enum_values?: ReadonlyArray<string>
                    readonly field_type?: string
                    readonly id?: string
                    readonly name?: string
                }
                readonly date_value?: string
                readonly enum_option_key?: string
                readonly id?: string
                readonly money_amount?: number
                readonly numeric_value?: unknown
                readonly text_value?: string
            }>
            readonly dob?: unknown
            readonly email?: string
            readonly last_order?: string
            readonly last_updates?: ReadonlyArray<{
                readonly ts?: unknown
            }>
            readonly lead_stage?: string
            readonly lid_jid?: string
            readonly name?: string
        }>
    }
}

export type WaMexCreateEnforcementAppealResponse = {
    readonly xwa2_create_enforcement_appeal?: {
        readonly appeal_creation_time?: string
        readonly appeal_state?: string
    }
}

export type WaMexCreateInviteCodeResponse = {
    readonly xwa2_growth_create_invite_code?: {
        readonly code?: string
        readonly error_reason?: string
    }
}

export type WaMexCreateLabyrinthBackupResponse = {
    readonly wa_labyrinth_create_backup?: {
        readonly __typename?: string
        readonly backup_id?: string
        readonly device_id?: string
        readonly epoch_id?: string
        readonly mailbox_id?: string
        readonly message?: string
        readonly status?: string
        readonly vd_device_id?: string
    }
}

export type WaMexCreateMarketingCampaignActionResponse = {
    readonly whatsapp_marketing_messages_create?: {
        readonly ad_campaign_group_id?: string
        readonly ad_campaign_id?: string
        readonly ad_creative_id?: string
        readonly ad_group_id?: string
        readonly ad_id?: string
        readonly campaign_name?: string
        readonly lifetime_budget?: string
        readonly start_time?: string
        readonly status?: string
    }
}

export type WaMexCreateNewsletterResponse = {
    readonly xwa2_newsletter_create?: {
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
        readonly thread_metadata?: {
            readonly creation_time?: string
            readonly description?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly handle?: string
            readonly invite?: string
            readonly name?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly picture?: {
                readonly direct_path?: string
                readonly id?: string
                readonly type?: 'IMAGE' | 'PREVIEW'
            }
            readonly preview?: {
                readonly direct_path?: string
                readonly id?: string
                readonly type?: 'PREVIEW'
            }
            readonly subscribers_count?: string
            readonly verification?: 'UNVERIFIED' | 'VERIFIED'
        }
        readonly viewer_metadata?: {
            readonly role?: 'ADMIN' | 'GUEST' | 'OWNER' | 'SUBSCRIBER'
            readonly settings?: ReadonlyArray<{
                readonly type?: 'MUTE_ADMIN_ACTIVITY' | 'MUTE_FOLLOWER_ACTIVITY'
                readonly value?: 'OFF' | 'ON'
            }>
        }
    }
}

export type WaMexCreateNewsletterAdminInviteResponse = {
    readonly xwa2_newsletter_admin_invite_create?: {
        readonly id?: string
        readonly invite_expiration_time?: string
    }
}

export type WaMexCreateReportAppealResponse = {
    readonly xwa2_create_channel_report_appeal_v2?: {
        readonly appeal?: {
            readonly appeal_id?: string
            readonly appeal_reason?: string
            readonly creation_time?: string
            readonly report_id?: string
            readonly state?: 'CONTENT_UNAVAILABLE' | 'NON_APPEALABLE' | 'NOT_APPEALED' | 'PENDING' | 'REJECT' | 'SUCCESS'
        }
        readonly appeal_reason_options?: ReadonlyArray<{
            readonly label?: string
            readonly reason?: string
        }>
        readonly channel_jid?: string
        readonly channel_name?: string
        readonly creation_time?: string
        readonly last_update_time?: string
        readonly report_id?: string
        readonly reported_content_data?: {
            readonly __typename?: string
            readonly notify_name?: string
            readonly question_data?: {
                readonly __typename?: string
                readonly server_msg_id?: string
            }
            readonly server_id?: string
            readonly server_msg_id?: string
            readonly server_response_id?: string
        }
        readonly status?: string
    }
}

export type WaMexCreateWhatsAppAdsIdentityResponse = {
    readonly create_or_update_whatsapp_ads_identity?: {
        readonly id?: string
    }
}

export type WaMexCustomLabel3pdEventResponse = {
    readonly xwa_get_3pd_event?: ReadonlyArray<{
        readonly ctwa_3pd_conversion_metadata?: string
        readonly ctwa_3pd_conversion_subtype?: string
        readonly ctwa_3pd_conversion_type?: string
        readonly custom_label?: string
    }>
}

export type WaMexCustomerManagerAccessStateResponse = {
    readonly xfb_wa_contact_manager_access_state?: {
        readonly state?: 'TRIAL_ACTIVE'
        readonly trial_end_time?: string
    }
}

export type WaMexCustomerManagerCustomerProfileCustomFieldCreateResponse = {
    readonly xfb_wa_create_customer_profile_custom_field?: {
        readonly wa_customer_profile_custom_field?: {
            readonly currency?: string
            readonly currency_decimal_places?: number
            readonly enum_option_keys?: ReadonlyArray<string>
            readonly enum_values?: ReadonlyArray<string>
            readonly field_type?: string
            readonly id?: string
            readonly name?: string
        }
    }
}

export type WaMexCustomerManagerStartTrialResponse = {
    readonly xfb_wa_start_contact_manager_trial?: {
        readonly access_state?: {
            readonly state?: 'TRIAL_ACTIVE'
            readonly trial_end_time?: string
        }
    }
}

export type WaMexDebugLabyrinthAddDeviceResponse = {
    readonly wa_labyrinth_add_device?: {
        readonly __typename?: string
        readonly backup_id?: string
        readonly device_id?: string
        readonly error_code?: string
        readonly message?: string
    }
}

export type WaMexDebugLabyrinthFetchVirtualDeviceInfoResponse = {
    readonly wa_labyrinth_fetch_virtual_device_info?: {
        readonly __typename?: string
        readonly active_epoch_id?: string
        readonly encrypted_secret_values?: ReadonlyArray<string>
        readonly error_code?: string
        readonly mailbox_id?: string
        readonly message?: string
        readonly sync_epochs?: ReadonlyArray<{
            readonly encrypted_epoch_key?: string
            readonly epoch_anon_id?: string
            readonly epoch_id?: string
            readonly next_epoch_id?: string
            readonly sender_auth_pub_key?: string
        }>
        readonly vd_base_epoch_id?: string
    }
}

export type WaMexDebugLabyrinthInboxSnapshotResponse = {
    readonly get_wa_mailbox?: {
        readonly __typename?: string
        readonly id?: string
        readonly threads?: {
            readonly __typename?: string
            readonly nodes?: ReadonlyArray<{
                readonly __typename?: string
                readonly id?: string
                readonly messages?: {
                    readonly __typename?: string
                    readonly edges?: ReadonlyArray<{
                        readonly __typename?: string
                        readonly node?: {
                            readonly __typename?: string
                            readonly encrypted_payload?: unknown
                            readonly encryption_version?: number
                            readonly epoch_anon_id?: string
                            readonly id?: string
                        }
                    }>
                    readonly epoch_derivation_set?: ReadonlyArray<{
                        readonly backward_edge?: unknown
                        readonly forward_edge?: {
                            readonly auth_public_key?: string
                            readonly encrypted_entropy?: unknown
                        }
                        readonly from_epoch?: {
                            readonly epoch_anon_id?: string
                            readonly epoch_id?: string
                        }
                        readonly to_epoch?: {
                            readonly epoch_anon_id?: string
                            readonly epoch_id?: string
                        }
                    }>
                }
                readonly thread_id_seal?: {
                    readonly epoch_derivation_set?: ReadonlyArray<{
                        readonly backward_edge?: unknown
                        readonly forward_edge?: {
                            readonly auth_public_key?: string
                            readonly encrypted_entropy?: unknown
                        }
                        readonly from_epoch?: {
                            readonly epoch_anon_id?: string
                            readonly epoch_id?: string
                        }
                        readonly to_epoch?: {
                            readonly epoch_anon_id?: string
                            readonly epoch_id?: string
                        }
                    }>
                    readonly sealed_thread_id?: string
                }
            }>
        }
    }
}

export type WaMexDebugLabyrinthRangeResponse = {
    readonly get_WAMessagingViewerThreadByORF?: {
        readonly __typename?: string
        readonly id?: string
        readonly messages?: {
            readonly __typename?: string
            readonly edges?: ReadonlyArray<{
                readonly __typename?: string
                readonly cursor?: string
                readonly node?: {
                    readonly __typename?: string
                    readonly encrypted_payload?: unknown
                    readonly encryption_version?: number
                    readonly id?: string
                }
            }>
            readonly page_info?: {
                readonly has_next_page?: boolean
                readonly has_previous_page?: boolean
            }
        }
    }
}

export type WaMexDebugLabyrinthRestorePageResponse = {
    readonly get_WAMessagingViewerThreadByORF?: {
        readonly __typename?: string
        readonly id?: string
        readonly messages?: {
            readonly __typename?: string
            readonly edges?: ReadonlyArray<{
                readonly __typename?: string
                readonly node?: {
                    readonly __typename?: string
                    readonly encrypted_payload?: unknown
                    readonly encryption_version?: number
                    readonly epoch_anon_id?: number
                    readonly id?: string
                    readonly timestamp_ms?: number
                }
            }>
            readonly epoch_derivation_set?: ReadonlyArray<{
                readonly backward_edge?: unknown
                readonly forward_edge?: {
                    readonly auth_public_key?: string
                    readonly encrypted_entropy?: unknown
                }
                readonly from_epoch?: {
                    readonly epoch_anon_id?: number
                    readonly epoch_id?: string
                }
                readonly to_epoch?: {
                    readonly epoch_anon_id?: number
                    readonly epoch_id?: string
                }
            }>
            readonly page_info?: {
                readonly end_cursor?: string
                readonly has_next_page?: boolean
            }
        }
    }
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

export type WaMexE2EEMetadataMailboxFetchGroupInfoV4Response = {
    readonly xfb_fetch_group_info_from_mi_v4?: {
        readonly creation_ts_ms?: string
        readonly creator_id?: string
        readonly exception_error_code?: unknown
        readonly group_domain?: unknown
        readonly group_evolution_version?: number
        readonly open_thread_id?: string
        readonly participant_update_mode?: 'OPEN'
        readonly participant_version_id?: number
        readonly participants?: ReadonlyArray<{
            readonly contact_id?: string
            readonly dma_interop_device_id?: string
            readonly dma_interop_integrator_id?: string
            readonly is_addressable?: boolean
            readonly status?: string
            readonly type?: 'E2EE_GROUP_PARTICIPANT_TYPE_ADMIN' | 'E2EE_GROUP_PARTICIPANT_TYPE_SUPER_ADMIN'
        }>
        readonly subject_change?: {
            readonly subject?: string
            readonly subject_change_ts_ms?: number
            readonly subject_changer_id?: string
        }
        readonly success?: boolean
        readonly thread_ephemerality_data?: {
            readonly e2ee_attribution_timestamp_ms?: number
            readonly last_set_action_log_type?: string
            readonly last_set_actor_id?: string
            readonly last_set_timestamp_ms?: number
            readonly last_set_ttl_sec?: number
            readonly mode?: string
            readonly ttl_sec?: number
        }
        readonly transport_thread_fbid?: string
    }
}

export type WaMexEBMessageRangeQueryForThreadsResponse = {
    readonly viewer?: {
        readonly encrypted_backup?: {
            readonly id?: string
            readonly mailbox?: {
                readonly messages_from_selected_threads?: ReadonlyArray<{
                    readonly backup_id?: string
                    readonly encrypted_messages?: ReadonlyArray<{
                        readonly attachment_data?: ReadonlyArray<{
                            readonly attachment_cdn_url?: string
                            readonly attachment_object_id?: string
                        }>
                        readonly echo_document?: {
                            readonly echo_document_string?: unknown
                            readonly encryption_version?: number
                            readonly epoch_anon_id?: string
                            readonly epoch_fingerprint?: unknown
                            readonly epoch_id?: string
                        }
                        readonly otid?: unknown
                        readonly protobuf_stanzas?: {
                            readonly message_tags?: ReadonlyArray<string>
                            readonly supplemental_protobufs?: ReadonlyArray<{
                                readonly encrypted_protobuf_stanza?: unknown
                                readonly encryption_version?: number
                                readonly epoch_anon_id?: string
                                readonly epoch_id?: string
                                readonly protobuf_timestamp_ms?: number
                                readonly sk_ciphertext?: string
                                readonly supplemental_key?: string
                                readonly supplemental_otid?: unknown
                            }>
                            readonly supplemental_protobufs_v2?: ReadonlyArray<{
                                readonly actor_token?: string
                                readonly encrypted_protobuf?: unknown
                                readonly franking_tag?: string
                                readonly mek_fbid?: string
                                readonly mek_id?: string
                                readonly message_encryption_version?: number
                                readonly message_metadata_version?: number
                                readonly protobuf_timestamp?: string
                                readonly reporting_tag?: string
                                readonly server_origin_content_type?: string
                                readonly supplemental_key?: string
                                readonly supplemental_otid?: unknown
                                readonly transport_sender_message_signature?: string
                                readonly transport_sender_signing_pk?: unknown
                            }>
                            readonly top_level_protobuf?: {
                                readonly encrypted_protobuf_stanza?: unknown
                                readonly encryption_version?: number
                                readonly epoch_anon_id?: string
                                readonly epoch_id?: string
                                readonly protobuf_timestamp_ms?: number
                                readonly sk_ciphertext?: string
                            }
                            readonly top_level_protobuf_unencrypted?: {
                                readonly protobuf_timestamp_ms?: number
                                readonly unencrypted_protobuf?: unknown
                            }
                            readonly top_level_protobuf_v2?: {
                                readonly actor_token?: string
                                readonly encrypted_protobuf?: unknown
                                readonly franking_tag?: string
                                readonly mek_fbid?: string
                                readonly mek_id?: string
                                readonly message_encryption_version?: number
                                readonly message_metadata_version?: number
                                readonly protobuf_timestamp?: string
                                readonly reporting_tag?: string
                                readonly server_origin_content_type?: string
                                readonly transport_sender_message_signature?: string
                                readonly transport_sender_signing_pk?: unknown
                            }
                        }
                    }>
                    readonly epoch_derivation_set?: {
                        readonly epoch_edges?: ReadonlyArray<{
                            readonly backward_edge?: unknown
                            readonly forward_edge?: {
                                readonly auth_public_key?: string
                                readonly encrypted_entropy?: unknown
                                readonly entropy_fingerprint?: unknown
                                readonly epoch_storage_public_key?: string
                                readonly psk_fingerprint?: unknown
                            }
                            readonly from_epoch?: {
                                readonly epoch_anon_id?: string
                                readonly epoch_id?: string
                            }
                            readonly from_epoch_fingerprint?: unknown
                            readonly to_epoch?: {
                                readonly epoch_anon_id?: string
                                readonly epoch_id?: string
                            }
                            readonly to_epoch_fingerprint?: unknown
                        }>
                    }
                    readonly exception_string?: unknown
                    readonly message_range_info?: {
                        readonly has_more_after?: boolean
                        readonly has_more_before?: boolean
                        readonly next_message_timestamp_ms_after?: unknown
                        readonly next_message_timestamp_ms_before?: unknown
                    }
                    readonly minos_decryption_keys?: ReadonlyArray<{
                        readonly id?: string
                        readonly keys?: {
                            readonly mek_creator_info?: {
                                readonly mandrake_keys?: {
                                    readonly encrypted_mek?: unknown
                                    readonly mek_encryption_version?: number
                                    readonly recipient_mailbox_head_hash?: string
                                    readonly recipient_membership_proof?: string
                                    readonly recipient_membership_proof_leaf_index?: number
                                    readonly recipient_membership_proof_total_leaves?: unknown
                                    readonly recipient_mmk_auth_pk?: unknown
                                    readonly recipient_mmk_device_roster_hash?: string
                                    readonly recipient_mmk_enc_pk?: unknown
                                    readonly recipient_mmk_epoch_head?: unknown
                                    readonly recipient_mmk_sequence_number?: unknown
                                    readonly recipient_mmk_sig_pk?: unknown
                                    readonly recipients_hash?: string
                                    readonly sender_epoch_number?: unknown
                                    readonly sender_mailbox_auth_pk?: unknown
                                    readonly sender_mailbox_encryption_pk?: unknown
                                    readonly sender_mailbox_signing_pk?: unknown
                                    readonly sender_previous_epoch_head?: unknown
                                    readonly sender_user_fbid?: string
                                }
                                readonly minos_keys?: {
                                    readonly sender_auth_pk?: unknown
                                    readonly sender_epoch_head?: unknown
                                }
                                readonly transport_keys?: {
                                    readonly ephm_hpke_pk?: unknown
                                    readonly ephm_signature?: string
                                    readonly mek_creator_transport_signing_pk?: unknown
                                }
                            }
                            readonly mek_info?: {
                                readonly encrypted_mek?: unknown
                                readonly mek_creation_timestamp?: string
                                readonly mek_encryption_version?: number
                                readonly mek_id?: string
                                readonly roster_hash?: string
                            }
                            readonly recipient_info?: {
                                readonly epoch_anon_id?: string
                                readonly epoch_fbid?: string
                                readonly epoch_head?: unknown
                            }
                        }
                    }>
                    readonly should_delete_mailbox?: boolean
                    readonly thread_not_found?: unknown
                    readonly thread_type?: string
                }>
            }
        }
    }
}

export type WaMexEditBizProfileResponse = {
    readonly edit_wa_web_biz_profile?: boolean
}

export type WaMexEmailInviteSendGroupResponse = {
    readonly xwa_send_email_invites?: {
        readonly error_reason?: string
        readonly results?: ReadonlyArray<{
            readonly email?: string
            readonly status?: string
        }>
        readonly status?: string
    }
}

export type WaMexExternalCtxAuthoriseWAChatResponse = {
    readonly xwa_external_ctx_authorise_wa_chat?: {
        readonly partner_name?: string
        readonly success?: boolean
    }
}

export type WaMexFetchAllNewslettersMetadataResponse = {
    readonly xwa2_newsletter_subscribed?: ReadonlyArray<{
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
        readonly status_metadata?: {
            readonly last_status_sent_time?: string
            readonly last_status_server_id?: string
        }
        readonly thread_metadata?: {
            readonly creation_time?: string
            readonly description?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly handle?: string
            readonly invite?: string
            readonly name?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly picture?: {
                readonly direct_path?: string
                readonly id?: string
                readonly type?: 'IMAGE' | 'PREVIEW'
            }
            readonly preview?: {
                readonly direct_path?: string
                readonly id?: string
                readonly type?: 'PREVIEW'
            }
            readonly settings?: {
                readonly reaction_codes?: {
                    readonly value?: 'ALL'
                }
            }
            readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            readonly wamo_sub?: {
                readonly plan_id?: string
            }
        }
        readonly viewer_metadata?: {
            readonly role?: 'ADMIN' | 'GUEST' | 'OWNER' | 'SUBSCRIBER'
            readonly settings?: ReadonlyArray<{
                readonly type?: 'MUTE_ADMIN_ACTIVITY' | 'MUTE_FOLLOWER_ACTIVITY'
                readonly value?: 'OFF' | 'ON'
            }>
            readonly wamo_sub_status?: 'ACTIVE' | 'INACTIVE'
        }
    }>
}

export type WaMexFetchAllSubgroupsResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly default_sub_group?: {
            readonly id?: string
            readonly subject?: {
                readonly creation_time?: string
                readonly value?: string
            }
        }
        readonly id?: string
        readonly sub_groups?: {
            readonly edges?: ReadonlyArray<{
                readonly node?: {
                    readonly id?: string
                    readonly membership_approval_requests?: {
                        readonly total_count?: number
                    }
                    readonly properties?: {
                        readonly general_chat?: boolean
                        readonly hidden_group?: boolean
                        readonly membership_approval_mode_enabled?: boolean
                    }
                    readonly subject?: {
                        readonly creation_time?: string
                        readonly value?: string
                    }
                }
            }>
        }
    }
}

export type WaMexFetchBotCertificateRevocationListResponse = {
    readonly xwa2_fetch_feature_pki_crl?: {
        readonly crl?: unknown
        readonly next_update?: string
    }
}

export type WaMexFetchBotProfilesGQLResponse = {
    readonly xfb_fetch_genai_personas?: ReadonlyArray<{
        readonly __typename?: string
        readonly creator?: {
            readonly name?: string
            readonly profile_uri?: string
        }
        readonly id?: string
        readonly is_meta_created?: boolean
        readonly jid?: string
        readonly latest_published_version_for_viewer?: {
            readonly __typename?: string
            readonly description?: string
            readonly icebreaker_prompt_list?: ReadonlyArray<string>
            readonly id?: string
            readonly name?: string
            readonly posing_as_professional?: boolean
        }
    }>
}

export type WaMexFetchBotTasksResponse = {
    readonly xfb_gen_ai_meta_ai_reminders?: {
        readonly edges?: ReadonlyArray<{
            readonly node?: {
                readonly id?: string
                readonly natural_language_schedule?: string
                readonly prompt?: unknown
                readonly recurrence_frequency?: string
                readonly recurrence_interval?: number
                readonly reminder_type?: string
                readonly status?: string
                readonly timezone?: unknown
                readonly title?: string
            }
        }>
        readonly is_server_enabled?: boolean
        readonly suggested_tasks?: ReadonlyArray<{
            readonly display_label?: string
            readonly id?: string
            readonly prompt?: unknown
            readonly subtitle?: string
        }>
    }
}

export type WaMexFetchDynamicAIModesResponse = {
    readonly xfb_meta_ai_modes?: ReadonlyArray<{
        readonly is_experimental?: boolean
        readonly mode_id?: string
        readonly subtitle?: string
        readonly title?: string
        readonly type?: string
    }>
}

export type WaMexFetchGroupInfoResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
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
        readonly description?: {
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
            readonly id?: string
            readonly value?: string
        }
        readonly id?: string
        readonly membership_approval_request?: boolean
        readonly membership_form_key?: {
            readonly key_id?: string
        }
        readonly missing_participant_identification?: boolean
        readonly participants?: {
            readonly edges?: ReadonlyArray<{
                readonly group_history_sent?: boolean
                readonly join_time?: string
                readonly node?: {
                    readonly display_name?: string
                    readonly id?: string
                    readonly lid?: string
                    readonly pn?: string
                    readonly username_info?: {
                        readonly __typename?: string
                        readonly username?: string
                    }
                }
                readonly role?: 'ADMIN_MEMBER' | 'MEMBER' | 'SUPERADMIN_MEMBER'
            }>
            readonly participants_phash_match?: boolean
        }
        readonly properties?: {
            readonly allow_admin_reports?: boolean
            readonly allow_non_admin_sub_group_creation?: boolean
            readonly announcement?: boolean
            readonly appeal_status?: string
            readonly appeal_update_time?: string
            readonly auto_add_disabled?: boolean
            readonly capi?: boolean
            readonly closed_by_membership_approval_mode?: boolean
            readonly ephemeral?: {
                readonly expiration_time_in_sec?: number
            }
            readonly general_chat?: boolean
            readonly group_custom_reactions?: {
                readonly default_reactions?: unknown
            }
            readonly group_safety_check?: boolean
            readonly growth_locked2?: {
                readonly locked?: boolean
            }
            readonly hidden_group?: boolean
            readonly lid_migration_state?: {
                readonly addressing_mode?: 'LID'
            }
            readonly limit_sharing?: {
                readonly limit_sharing_enabled?: boolean
            }
            readonly locked?: boolean
            readonly member_add_mode?: 'ADMIN_ADD' | 'ALL_MEMBER_ADD'
            readonly member_link_mode?: 'ADMIN_LINK' | 'ALL_MEMBER_LINK'
            readonly member_share_group_history_mode?: 'ALL_MEMBER_SHARE'
            readonly membership_approval_mode_enabled?: boolean
            readonly membership_form?: {
                readonly questions?: unknown
            }
            readonly parent_group_jid?: string
            readonly support?: boolean
        }
        readonly state?: 'ACTIVE' | 'NON_EXISTENT' | 'SUSPENDED'
        readonly subject?: {
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
        readonly total_participants_count?: number
    }
}

export type WaMexFetchGroupInfoIncludBotsResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
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
        readonly description?: {
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
            readonly id?: string
            readonly value?: string
        }
        readonly id?: string
        readonly membership_approval_request?: boolean
        readonly membership_form_key?: {
            readonly key_id?: string
        }
        readonly missing_participant_identification?: boolean
        readonly participants?: {
            readonly edges?: ReadonlyArray<{
                readonly group_history_sent?: boolean
                readonly join_time?: string
                readonly participant?: {
                    readonly __typename?: string
                    readonly display_name?: string
                    readonly id?: string
                    readonly jid?: string
                    readonly lid?: string
                    readonly pn?: string
                    readonly username_info?: {
                        readonly __typename?: string
                        readonly username?: string
                    }
                }
                readonly role?: 'ADMIN_MEMBER' | 'MEMBER' | 'SUPERADMIN_MEMBER'
            }>
            readonly participants_phash_match?: boolean
        }
        readonly properties?: {
            readonly allow_admin_reports?: boolean
            readonly allow_non_admin_sub_group_creation?: boolean
            readonly announcement?: boolean
            readonly appeal_status?: string
            readonly appeal_update_time?: string
            readonly auto_add_disabled?: boolean
            readonly capi?: boolean
            readonly closed_by_membership_approval_mode?: boolean
            readonly ephemeral?: {
                readonly expiration_time_in_sec?: number
            }
            readonly general_chat?: boolean
            readonly group_custom_reactions?: {
                readonly default_reactions?: unknown
            }
            readonly group_safety_check?: boolean
            readonly growth_locked2?: {
                readonly locked?: boolean
            }
            readonly hidden_group?: boolean
            readonly lid_migration_state?: {
                readonly addressing_mode?: 'LID'
            }
            readonly limit_sharing?: {
                readonly limit_sharing_enabled?: boolean
            }
            readonly locked?: boolean
            readonly member_add_mode?: 'ADMIN_ADD' | 'ALL_MEMBER_ADD'
            readonly member_link_mode?: 'ADMIN_LINK' | 'ALL_MEMBER_LINK'
            readonly member_share_group_history_mode?: 'ALL_MEMBER_SHARE'
            readonly membership_approval_mode_enabled?: boolean
            readonly membership_form?: {
                readonly questions?: unknown
            }
            readonly parent_group_jid?: string
            readonly support?: boolean
        }
        readonly state?: 'ACTIVE' | 'NON_EXISTENT' | 'SUSPENDED'
        readonly subject?: {
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
        readonly total_participants_count?: number
    }
}

export type WaMexFetchGroupInfoIncludBotsJobAcp2Response = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
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
        readonly description?: {
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
            readonly id?: string
            readonly value?: string
        }
        readonly id?: string
        readonly membership_approval_request?: boolean
        readonly membership_form_key?: {
            readonly key_id?: string
        }
        readonly missing_participant_identification?: boolean
        readonly participants?: {
            readonly edges?: ReadonlyArray<{
                readonly group_history_sent?: boolean
                readonly join_time?: string
                readonly participant?: {
                    readonly __typename?: string
                    readonly display_name?: string
                    readonly id?: string
                    readonly jid?: string
                    readonly lid?: string
                    readonly pn?: string
                    readonly username_info?: {
                        readonly __typename?: string
                        readonly username?: string
                    }
                }
                readonly role?: 'ADMIN_MEMBER' | 'MEMBER' | 'SUPERADMIN_MEMBER'
            }>
            readonly participants_phash_match?: boolean
        }
        readonly properties?: {
            readonly allow_admin_reports?: boolean
            readonly allow_non_admin_sub_group_creation?: boolean
            readonly announcement?: boolean
            readonly appeal_status?: string
            readonly appeal_update_time?: string
            readonly auto_add_disabled?: boolean
            readonly capi?: boolean
            readonly closed_by_membership_approval_mode?: boolean
            readonly ephemeral?: {
                readonly expiration_time_in_sec?: boolean
            }
            readonly general_chat?: boolean
            readonly group_custom_reactions?: {
                readonly default_reactions?: unknown
            }
            readonly group_safety_check?: boolean
            readonly growth_locked2?: {
                readonly locked?: boolean
            }
            readonly hidden_group?: boolean
            readonly lid_migration_state?: {
                readonly addressing_mode?: 'LID'
            }
            readonly limit_sharing?: {
                readonly limit_companion_sharing_enabled?: boolean
                readonly limit_sharing_enabled?: boolean
            }
            readonly locked?: boolean
            readonly member_add_mode?: 'ADMIN_ADD' | 'ALL_MEMBER_ADD'
            readonly member_link_mode?: 'ADMIN_LINK' | 'ALL_MEMBER_LINK'
            readonly member_share_group_history_mode?: string
            readonly membership_approval_mode_enabled?: boolean
            readonly membership_form?: {
                readonly questions?: unknown
            }
            readonly parent_group_jid?: string
            readonly support?: boolean
        }
        readonly state?: 'ACTIVE' | 'NON_EXISTENT' | 'SUSPENDED'
        readonly subject?: {
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
        readonly total_participants_count?: number
    }
}

export type WaMexFetchGroupInfoJobAcp2Response = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
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
        readonly description?: {
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
            readonly id?: string
            readonly value?: string
        }
        readonly id?: string
        readonly membership_approval_request?: boolean
        readonly membership_form_key?: {
            readonly key_id?: string
        }
        readonly missing_participant_identification?: boolean
        readonly participants?: {
            readonly edges?: ReadonlyArray<{
                readonly group_history_sent?: boolean
                readonly join_time?: string
                readonly node?: {
                    readonly display_name?: string
                    readonly id?: string
                    readonly lid?: string
                    readonly pn?: string
                    readonly username_info?: {
                        readonly __typename?: string
                        readonly username?: string
                    }
                }
                readonly role?: 'ADMIN_MEMBER' | 'MEMBER' | 'SUPERADMIN_MEMBER'
            }>
            readonly participants_phash_match?: boolean
        }
        readonly properties?: {
            readonly allow_admin_reports?: boolean
            readonly allow_non_admin_sub_group_creation?: boolean
            readonly announcement?: boolean
            readonly appeal_status?: string
            readonly appeal_update_time?: string
            readonly auto_add_disabled?: boolean
            readonly capi?: boolean
            readonly closed_by_membership_approval_mode?: boolean
            readonly ephemeral?: {
                readonly expiration_time_in_sec?: boolean
            }
            readonly general_chat?: boolean
            readonly group_custom_reactions?: {
                readonly default_reactions?: unknown
            }
            readonly group_safety_check?: boolean
            readonly growth_locked2?: {
                readonly locked?: boolean
            }
            readonly hidden_group?: boolean
            readonly lid_migration_state?: {
                readonly addressing_mode?: 'LID'
            }
            readonly limit_sharing?: {
                readonly limit_companion_sharing_enabled?: boolean
                readonly limit_sharing_enabled?: boolean
            }
            readonly locked?: boolean
            readonly member_add_mode?: 'ADMIN_ADD' | 'ALL_MEMBER_ADD'
            readonly member_link_mode?: 'ADMIN_LINK' | 'ALL_MEMBER_LINK'
            readonly member_share_group_history_mode?: string
            readonly membership_approval_mode_enabled?: boolean
            readonly membership_form?: {
                readonly questions?: unknown
            }
            readonly parent_group_jid?: string
            readonly support?: boolean
        }
        readonly state?: 'ACTIVE' | 'NON_EXISTENT' | 'SUSPENDED'
        readonly subject?: {
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
        readonly total_participants_count?: number
    }
}

export type WaMexFetchGroupInviteCodeResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly id?: string
        readonly invite_code?: string
    }
}

export type WaMexFetchGroupInviteInfoResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly creation_time?: string
        readonly creator?: {
            readonly id?: string
            readonly pn?: string
            readonly username_info?: {
                readonly __typename?: string
                readonly username?: string
            }
        }
        readonly description?: {
            readonly creation_time?: string
            readonly creator?: {
                readonly id?: string
                readonly username_info?: {
                    readonly __typename?: string
                    readonly username?: string
                }
            }
            readonly id?: string
            readonly value?: string
        }
        readonly id?: string
        readonly membership_approval_request?: boolean
        readonly membership_approval_requests?: {
            readonly edges?: ReadonlyArray<{
                readonly node?: {
                    readonly __typename?: string
                }
            }>
        }
        readonly missing_participant_identification?: boolean
        readonly num_sub_groups?: number
        readonly participants?: {
            readonly edges?: ReadonlyArray<{
                readonly join_time?: string
                readonly node?: {
                    readonly display_name?: string
                    readonly id?: string
                    readonly lid?: string
                    readonly pn?: string
                    readonly username_info?: {
                        readonly __typename?: string
                        readonly username?: string
                    }
                }
                readonly role?: 'ADMIN_MEMBER' | 'MEMBER' | 'SUPERADMIN_MEMBER'
            }>
        }
        readonly properties?: {
            readonly capi?: boolean
            readonly closed_by_membership_approval_mode?: boolean
            readonly ephemeral?: {
                readonly expiration_time_in_sec?: number
            }
            readonly general_chat?: boolean
            readonly lid_migration_state?: {
                readonly addressing_mode?: string
            }
            readonly membership_approval_mode_enabled?: boolean
            readonly parent_group_jid?: string
            readonly parent_group_subject?: {
                readonly value?: string
            }
        }
        readonly subject?: {
            readonly creation_time?: string
            readonly creator?: {
                readonly id?: string
                readonly pn?: string
                readonly username_info?: {
                    readonly __typename?: string
                    readonly username?: string
                }
            }
            readonly value?: string
        }
        readonly total_participants_count?: number
    }
}

export type WaMexFetchGroupInviteInfoJobAddRequestResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly creation_time?: string
        readonly creator?: {
            readonly id?: string
            readonly pn?: string
            readonly username_info?: {
                readonly __typename?: string
                readonly username?: string
            }
        }
        readonly description?: {
            readonly creation_time?: string
            readonly creator?: {
                readonly id?: string
                readonly username_info?: {
                    readonly __typename?: string
                    readonly username?: string
                }
            }
            readonly id?: string
            readonly value?: string
        }
        readonly id?: string
        readonly membership_approval_request?: boolean
        readonly membership_approval_requests?: {
            readonly edges?: ReadonlyArray<{
                readonly node?: {
                    readonly __typename?: string
                }
            }>
        }
        readonly missing_participant_identification?: boolean
        readonly num_sub_groups?: number
        readonly participants?: {
            readonly edges?: ReadonlyArray<{
                readonly join_time?: string
                readonly node?: {
                    readonly display_name?: string
                    readonly id?: string
                    readonly lid?: string
                    readonly pn?: string
                    readonly username_info?: {
                        readonly __typename?: string
                        readonly username?: string
                    }
                }
                readonly role?: 'ADMIN_MEMBER' | 'MEMBER' | 'SUPERADMIN_MEMBER'
            }>
        }
        readonly properties?: {
            readonly capi?: boolean
            readonly closed_by_membership_approval_mode?: boolean
            readonly ephemeral?: {
                readonly expiration_time_in_sec?: number
            }
            readonly general_chat?: boolean
            readonly lid_migration_state?: {
                readonly addressing_mode?: string
            }
            readonly membership_approval_mode_enabled?: boolean
            readonly parent_group_jid?: string
            readonly parent_group_subject?: {
                readonly value?: string
            }
        }
        readonly subject?: {
            readonly creation_time?: string
            readonly creator?: {
                readonly id?: string
                readonly pn?: string
                readonly username_info?: {
                    readonly __typename?: string
                    readonly username?: string
                }
            }
            readonly value?: string
        }
        readonly total_participants_count?: number
    }
}

export type WaMexFetchGroupIsInternalResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly id?: string
        readonly properties?: {
            readonly internal?: boolean
        }
    }
}

export type WaMexFetchGroupMembershipFormForJoinJobAddRequestResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly id?: string
        readonly membership_form_key?: {
            readonly key_id?: string
            readonly public_key_payload?: unknown
        }
        readonly properties?: {
            readonly membership_approval_mode_enabled?: boolean
            readonly membership_form?: {
                readonly questions?: unknown
            }
        }
    }
}

export type WaMexFetchGroupMembershipFormForJoinJobInviteResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly id?: string
        readonly membership_form_key?: {
            readonly key_id?: string
            readonly public_key_payload?: unknown
        }
        readonly properties?: {
            readonly membership_approval_mode_enabled?: boolean
            readonly membership_form?: {
                readonly questions?: unknown
            }
        }
    }
}

export type WaMexFetchGroupMembershipFormForJoinJobLinkedResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly id?: string
        readonly membership_form_key?: {
            readonly key_id?: string
            readonly public_key_payload?: unknown
        }
        readonly properties?: {
            readonly membership_approval_mode_enabled?: boolean
            readonly membership_form?: {
                readonly questions?: unknown
            }
        }
    }
}

export type WaMexFetchIntegritySignalsResponse = {
    readonly xwa2_fetch_wa_users?: ReadonlyArray<{
        readonly __typename?: string
        readonly id?: string
        readonly integrity_signals_info?: {
            readonly __typename?: string
            readonly is_new_account?: boolean
            readonly is_suspicious_start_chat?: boolean
            readonly join_date_ms?: number
        }
    }>
}

export type WaMexFetchLabyrinthEpochChainResponse = {
    readonly wa_labyrinth_fetch_epoch_chain?: {
        readonly __typename?: string
        readonly active_epoch_id?: string
        readonly backup_id?: string
        readonly error_code?: string
        readonly message?: string
    }
}

export type WaMexFetchLabyrinthEpochDevicesResponse = {
    readonly wa_labyrinth_fetch_epoch_devices?: {
        readonly __typename?: string
        readonly devices?: ReadonlyArray<{
            readonly device_epoch_hmac?: string
            readonly device_id?: string
            readonly device_public_key?: string
            readonly epoch_storage_public_key?: string
            readonly epoch_storage_public_key_sig?: string
        }>
        readonly epoch_id?: string
        readonly error_code?: number
        readonly message?: string
    }
}

export type WaMexFetchLinkedGroupInfoResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly creation_time?: string
        readonly creator?: {
            readonly id?: string
            readonly pn?: string
            readonly username_info?: {
                readonly __typename?: string
                readonly username?: string
            }
        }
        readonly description?: {
            readonly creation_time?: string
            readonly creator?: {
                readonly id?: string
                readonly pn?: string
                readonly username_info?: {
                    readonly __typename?: string
                    readonly username?: string
                }
            }
            readonly id?: string
            readonly value?: string
        }
        readonly id?: string
        readonly membership_approval_request?: boolean
        readonly participants?: {
            readonly edges?: ReadonlyArray<{
                readonly join_time?: string
                readonly node?: {
                    readonly display_name?: string
                    readonly id?: string
                    readonly lid?: string
                    readonly pn?: string
                    readonly username_info?: {
                        readonly __typename?: string
                        readonly username?: string
                    }
                }
                readonly role?: 'ADMIN_MEMBER' | 'MEMBER' | 'SUPERADMIN_MEMBER'
            }>
        }
        readonly properties?: {
            readonly admin_request_required?: boolean
            readonly hidden_group?: boolean
            readonly membership_approval_mode_enabled?: boolean
        }
        readonly state?: 'ACTIVE' | 'NON_EXISTENT' | 'SUSPENDED'
        readonly subject?: {
            readonly creation_time?: string
            readonly creator?: {
                readonly id?: string
                readonly pn?: string
                readonly username_info?: {
                    readonly __typename?: string
                    readonly username?: string
                }
            }
            readonly value?: string
        }
        readonly total_participants_count?: number
    }
}

export type WaMexFetchMembershipApprovalRequestsResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly id?: string
        readonly membership_approval_requests?: {
            readonly edges?: ReadonlyArray<{
                readonly node?: {
                    readonly membership_form?: {
                        readonly encrypted_payload?: unknown
                        readonly key_id?: string
                        readonly request_id?: string
                    }
                    readonly request_method?: string
                    readonly request_time?: string
                    readonly requestor?: {
                        readonly id?: string
                        readonly jid?: string
                        readonly pn?: string
                        readonly username_info?: {
                            readonly __typename?: string
                            readonly username?: string
                        }
                    }
                    readonly user?: {
                        readonly id?: string
                        readonly jid?: string
                        readonly pn?: string
                        readonly username_info?: {
                            readonly __typename?: string
                            readonly username?: string
                        }
                    }
                }
            }>
        }
    }
}

export type WaMexFetchMetaOnePromoEligibilityResponse = {
    readonly eligibility?: {
        readonly subscriptionPromos?: ReadonlyArray<{
            readonly isEligible?: boolean
            readonly platform?: unknown
            readonly promoType?: unknown
        }>
    }
}

export type WaMexFetchNewChatMessageCappingInfoResponse = {
    readonly xwa2_message_capping_info?: {
        readonly capping_status?: string
        readonly cycle_end_timestamp?: string
        readonly cycle_start_timestamp?: string
        readonly mv_status?: string
        readonly ote_status?: string
        readonly server_sent_timestamp?: string
        readonly subscription_status?: {
            readonly name?: string
            readonly status?: string
        }
        readonly total_quota?: string
        readonly used_quota?: string
    }
}

export type WaMexFetchNewsletterResponse = {
    readonly xwa2_newsletter?: {
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
        readonly status_metadata?: {
            readonly last_status_sent_time?: string
            readonly last_status_server_id?: string
        }
        readonly thread_metadata?: {
            readonly creation_time?: string
            readonly description?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly handle?: string
            readonly invite?: string
            readonly name?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly picture?: {
                readonly direct_path?: string
                readonly id?: string
                readonly type?: 'IMAGE' | 'PREVIEW'
            }
            readonly pinned_messages?: ReadonlyArray<{
                readonly expiry_ts?: string
                readonly message_id?: string
            }>
            readonly preview?: {
                readonly direct_path?: string
                readonly id?: string
                readonly type?: 'PREVIEW'
            }
            readonly settings?: {
                readonly reaction_codes?: {
                    readonly value?: 'ALL'
                }
            }
            readonly subscribers_count?: string
            readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            readonly wamo_sub?: {
                readonly plan_id?: string
            }
        }
        readonly viewer_metadata?: {
            readonly role?: 'ADMIN' | 'GUEST' | 'OWNER' | 'SUBSCRIBER'
            readonly settings?: ReadonlyArray<{
                readonly type?: 'MUTE_ADMIN_ACTIVITY' | 'MUTE_FOLLOWER_ACTIVITY'
                readonly value?: 'OFF' | 'ON'
            }>
            readonly wamo_sub_status?: 'ACTIVE' | 'INACTIVE'
        }
    }
}

export type WaMexFetchNewsletterAdminCapabilitiesResponse = {
    readonly xwa2_newsletter_admin?: {
        readonly capabilities?: ReadonlyArray<'ADMIN_CONTEXT_CARD_1' | 'ADMIN_CONTEXT_CARD_2' | 'ADMIN_CONTEXT_CARD_3' | 'ADMIN_NOTIFICATIONS' | 'ADMIN_ONBOARDING' | 'ADMIN_ONBOARDING_2' | 'ADMIN_PROFILE' | 'CHANNEL_STATUS_ADMIN_INSIGHTS' | 'CHANNEL_STATUS_API' | 'CHANNEL_STATUS_MUSIC' | 'CHANNEL_STATUS_PRODUCER' | 'INSIGHTS' | 'INVITE_ADMINS_BUTTON' | 'INVITE_FOLLOWERS' | 'JARVIS_INTEGRATION_ENABLED' | 'MUSIC' | 'NEW_MESSAGE_TYPES_TOOLTIP' | 'PHOTO_POLLS' | 'PINNED_MESSAGES' | 'PINNING_NUDGE' | 'QUESTIONS' | 'QUESTIONS_M2' | 'QUESTIONS_STARRING' | 'QUESTION_RESPONSE_LIKES' | 'QUIZ' | 'SCHEDULED_UPDATES' | 'SHARE_STICKER_PACKS' | 'THREAD_MENU'>
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
                readonly direct_path?: string
                readonly id?: string
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
            readonly pinned_messages?: ReadonlyArray<{
                readonly expiry_ts?: string
                readonly message_id?: string
            }>
            readonly settings?: {
                readonly reaction_codes?: {
                    readonly value?: 'ALL'
                }
            }
            readonly subscribers_count?: string
            readonly verification?: 'UNVERIFIED' | 'VERIFIED'
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
                readonly status_metadata?: {
                    readonly last_status_sent_time?: string
                    readonly last_status_server_id?: string
                }
                readonly thread_metadata?: {
                    readonly creation_time?: string
                    readonly description?: {
                        readonly id?: string
                        readonly text?: string
                        readonly update_time?: string
                    }
                    readonly handle?: string
                    readonly invite?: string
                    readonly name?: {
                        readonly id?: string
                        readonly text?: string
                        readonly update_time?: string
                    }
                    readonly picture?: {
                        readonly direct_path?: string
                        readonly id?: string
                        readonly type?: 'IMAGE' | 'PREVIEW'
                    }
                    readonly subscribers_count?: string
                    readonly verification?: 'UNVERIFIED' | 'VERIFIED'
                }
            }>
        }>
    }
}

export type WaMexFetchNewsletterDirectoryListResponse = {
    readonly xwa2_newsletters_directory_list?: {
        readonly page_info?: {
            readonly endCursor?: string
            readonly hasNextPage?: boolean
            readonly hasPreviousPage?: boolean
            readonly startCursor?: string
        }
        readonly result?: ReadonlyArray<{
            readonly id?: string
            readonly status_metadata?: {
                readonly last_status_sent_time?: string
                readonly last_status_server_id?: string
            }
            readonly thread_metadata?: {
                readonly creation_time?: string
                readonly description?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly handle?: string
                readonly invite?: string
                readonly name?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly picture?: {
                    readonly direct_path?: string
                    readonly id?: string
                    readonly type?: 'IMAGE' | 'PREVIEW'
                }
                readonly subscribers_count?: string
                readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            }
        }>
    }
}

export type WaMexFetchNewsletterDirectorySearchResultsResponse = {
    readonly xwa2_newsletters_directory_search?: {
        readonly page_info?: {
            readonly endCursor?: string
            readonly hasNextPage?: boolean
            readonly hasPreviousPage?: boolean
            readonly startCursor?: string
        }
        readonly result?: ReadonlyArray<{
            readonly id?: string
            readonly status_metadata?: {
                readonly last_status_sent_time?: string
                readonly last_status_server_id?: string
            }
            readonly thread_metadata?: {
                readonly creation_time?: string
                readonly description?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly handle?: string
                readonly invite?: string
                readonly name?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly picture?: {
                    readonly direct_path?: string
                    readonly id?: string
                    readonly type?: 'IMAGE' | 'PREVIEW'
                }
                readonly subscribers_count?: string
                readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            }
        }>
    }
}

export type WaMexFetchNewsletterEnforcementsResponse = {
    readonly xwa2_channel_enforcements?: {
        readonly admin_profiles?: ReadonlyArray<{
            readonly appeal_creation_time?: string
            readonly appeal_reason_options?: ReadonlyArray<{
                readonly label?: string
                readonly reason?: string
            }>
            readonly appeal_state?: string
            readonly enforcement_creation_time?: string
            readonly enforcement_extra_data?: {
                readonly enforcement_target_data?: {
                    readonly __typename?: string
                    readonly id?: string
                    readonly name?: string
                    readonly picture?: {
                        readonly direct_path?: string
                        readonly id?: string
                    }
                }
                readonly ip_violation_report_data?: {
                    readonly appeal_form_url?: string
                    readonly report_fbid?: string
                    readonly reporter_email?: string
                    readonly reporter_name?: string
                }
            }
            readonly enforcement_id?: string
            readonly enforcement_policy_information?: {
                readonly admin_disclaimer?: string
                readonly explanation?: string
                readonly headline?: string
                readonly overview?: string
                readonly subtitle?: string
            }
            readonly enforcement_source?: string
            readonly enforcement_violation_category?: string
        }>
        readonly geosuspensions?: ReadonlyArray<{
            readonly base_enforcement_data?: {
                readonly appeal_creation_time?: string
                readonly appeal_reason_options?: ReadonlyArray<{
                    readonly label?: string
                    readonly reason?: string
                }>
                readonly appeal_state?: string
                readonly enforcement_creation_time?: string
                readonly enforcement_extra_data?: {
                    readonly appeal_extra_data?: {
                        readonly appeal_form_url?: string
                    }
                    readonly enforcement_origin_legal_basis?: string
                    readonly enforcement_origin_workflow?: string
                    readonly enforcement_target_data?: {
                        readonly __typename?: string
                        readonly id?: string
                        readonly server_id?: string
                        readonly server_msg_id?: string
                    }
                    readonly enforcing_entity_data?: {
                        readonly name?: string
                    }
                    readonly ip_violation_report_data?: {
                        readonly appeal_form_url?: string
                        readonly report_fbid?: string
                        readonly reporter_email?: string
                        readonly reporter_name?: string
                    }
                }
                readonly enforcement_id?: string
                readonly enforcement_policy_information?: {
                    readonly admin_disclaimer?: string
                    readonly explanation?: string
                    readonly headline?: string
                    readonly overview?: string
                    readonly subtitle?: string
                }
                readonly enforcement_source?: string
                readonly enforcement_violation_category?: string
            }
            readonly country_codes?: ReadonlyArray<string>
        }>
        readonly profile_picture_deletions?: ReadonlyArray<{
            readonly appeal_creation_time?: string
            readonly appeal_reason_options?: ReadonlyArray<{
                readonly label?: string
                readonly reason?: string
            }>
            readonly appeal_state?: string
            readonly enforcement_creation_time?: string
            readonly enforcement_extra_data?: {
                readonly ip_violation_report_data?: {
                    readonly appeal_form_url?: string
                    readonly report_fbid?: string
                    readonly reporter_email?: string
                    readonly reporter_name?: string
                }
            }
            readonly enforcement_id?: string
            readonly enforcement_policy_information?: {
                readonly admin_disclaimer?: string
                readonly explanation?: string
                readonly headline?: string
                readonly overview?: string
                readonly subtitle?: string
            }
            readonly enforcement_source?: string
            readonly enforcement_violation_category?: string
        }>
        readonly suspensions?: ReadonlyArray<{
            readonly appeal_creation_time?: string
            readonly appeal_reason_options?: ReadonlyArray<{
                readonly label?: string
                readonly reason?: string
            }>
            readonly appeal_state?: string
            readonly enforcement_creation_time?: string
            readonly enforcement_extra_data?: {
                readonly appeal_extra_data?: {
                    readonly appeal_form_url?: string
                }
                readonly enforcement_target_data?: {
                    readonly __typename?: string
                    readonly id?: string
                    readonly server_id?: string
                    readonly server_msg_id?: string
                }
                readonly ip_violation_report_data?: {
                    readonly appeal_form_url?: string
                    readonly report_fbid?: string
                    readonly reporter_email?: string
                    readonly reporter_name?: string
                }
            }
            readonly enforcement_id?: string
            readonly enforcement_policy_information?: {
                readonly admin_disclaimer?: string
                readonly explanation?: string
                readonly headline?: string
                readonly overview?: string
                readonly subtitle?: string
            }
            readonly enforcement_source?: string
            readonly enforcement_violation_category?: string
        }>
        readonly violating_messages?: ReadonlyArray<{
            readonly base_enforcement_data?: {
                readonly appeal_creation_time?: string
                readonly appeal_reason_options?: ReadonlyArray<{
                    readonly label?: string
                    readonly reason?: string
                }>
                readonly appeal_state?: string
                readonly enforcement_creation_time?: string
                readonly enforcement_extra_data?: {
                    readonly ip_violation_report_data?: {
                        readonly appeal_form_url?: string
                        readonly report_fbid?: string
                        readonly reporter_email?: string
                        readonly reporter_name?: string
                    }
                }
                readonly enforcement_id?: string
                readonly enforcement_policy_information?: {
                    readonly admin_disclaimer?: string
                    readonly explanation?: string
                    readonly headline?: string
                    readonly overview?: string
                    readonly subtitle?: string
                }
                readonly enforcement_source?: string
                readonly enforcement_violation_category?: string
            }
            readonly content_data?: {
                readonly __typename?: string
                readonly server_id?: string
                readonly server_msg_id?: string
            }
        }>
    }
}

export type WaMexFetchNewsletterFollowersResponse = {
    readonly xwa2_newsletter_followers?: {
        readonly followers?: {
            readonly edges?: ReadonlyArray<{
                readonly admin_profile?: {
                    readonly id?: string
                    readonly name?: string
                    readonly picture?: {
                        readonly direct_path?: string
                        readonly id?: string
                    }
                }
                readonly follow_time?: string
                readonly node?: {
                    readonly display_name?: string
                    readonly id?: string
                    readonly pn?: string
                    readonly username_info?: {
                        readonly __typename?: string
                        readonly username?: string
                    }
                }
                readonly role?: 'ADMIN' | 'GUEST' | 'OWNER' | 'SUBSCRIBER'
            }>
        }
    }
}

export type WaMexFetchNewsletterInsightsResponse = {
    readonly xwa2_newsletter_admin_insights?: {
        readonly last_update_time?: string
        readonly metrics_status?: string
        readonly newsletter_id?: string
        readonly result?: ReadonlyArray<{
            readonly id?: string
            readonly values?: ReadonlyArray<{
                readonly country?: string
                readonly role?: 'ADMIN' | 'GUEST' | 'OWNER' | 'SUBSCRIBER'
                readonly timestamp?: string
                readonly value?: string
            }>
        }>
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
    }
}

export type WaMexFetchNewsletterIsDomainPreviewableResponse = {
    readonly xwa2_newsletter_message_integrity?: {
        readonly url_previews?: ReadonlyArray<{
            readonly is_previewable?: boolean
            readonly url_domain?: string
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
        readonly id?: string
        readonly pending_admin_invites?: ReadonlyArray<{
            readonly user?: {
                readonly id?: string
            }
        }>
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
            readonly appeal?: {
                readonly appeal_id?: string
                readonly appeal_reason?: string
                readonly creation_time?: string
                readonly report_id?: string
                readonly state?: 'CONTENT_UNAVAILABLE' | 'NON_APPEALABLE' | 'NOT_APPEALED' | 'PENDING' | 'REJECT' | 'SUCCESS'
            }
            readonly appeal_reason_options?: ReadonlyArray<{
                readonly label?: string
                readonly reason?: string
            }>
            readonly channel_jid?: string
            readonly channel_name?: string
            readonly creation_time?: string
            readonly last_update_time?: string
            readonly report_id?: string
            readonly reported_content_data?: {
                readonly __typename?: string
                readonly notify_name?: string
                readonly question_data?: {
                    readonly __typename?: string
                    readonly server_msg_id?: string
                }
                readonly server_id?: string
                readonly server_msg_id?: string
                readonly server_response_id?: string
            }
            readonly status?: string
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

export type WaMexFetchPhoneNumberSharingSettingsResponse = {
    readonly xwa2_privacy_phone_number_sharing_get?: {
        readonly allow_list?: {
            readonly dhash?: string
            readonly entries?: ReadonlyArray<{
                readonly __typename?: string
                readonly group_jid?: string
                readonly pn_jid?: string
                readonly user_jid?: string
            }>
        }
        readonly contact_exclude_list?: {
            readonly dhash?: string
            readonly entries?: ReadonlyArray<{
                readonly __typename?: string
                readonly group_jid?: string
                readonly pn_jid?: string
                readonly user_jid?: string
            }>
        }
        readonly deny_list?: {
            readonly dhash?: string
            readonly entries?: ReadonlyArray<{
                readonly __typename?: string
                readonly group_jid?: string
                readonly pn_jid?: string
                readonly user_jid?: string
            }>
        }
        readonly setting?: unknown
    }
}

export type WaMexFetchPlaintextLinkPreviewResponse = {
    readonly xwa2_newsletter_link_preview?: {
        readonly description?: string
        readonly direct_path?: string
        readonly hash?: string
        readonly height?: number
        readonly preview_type?: 'IMAGE'
        readonly thumb_data?: string
        readonly title?: string
        readonly width?: number
    }
}

export type WaMexFetchQuickPromotionsResponse = {
    readonly quick_promotion_batch_fetch_root?: ReadonlyArray<{
        readonly eligible_promotions?: {
            readonly edges?: ReadonlyArray<{
                readonly client_ttl_seconds?: number
                readonly is_holdout?: boolean
                readonly log_eligibility_waterfall?: string
                readonly node?: {
                    readonly ab_prop_name?: string
                    readonly client_side_dry_run?: boolean
                    readonly content_attributes?: {
                        readonly wa_banner_background_color?: {
                            readonly dark_mode_background_color?: string
                            readonly dark_mode_highlight_color?: string
                            readonly light_mode_background_color?: string
                            readonly light_mode_highlight_color?: string
                        }
                        readonly wa_eligible_duration_after_impression_in_seconds?: number
                        readonly wa_primary_cta_alternative_url?: string
                    }
                    readonly contextual_filters_for_wa_do_not_use?: {
                        readonly clause_type?: string
                        readonly clauses?: ReadonlyArray<{
                            readonly clause_type?: string
                            readonly clauses?: ReadonlyArray<{
                                readonly clause_type?: string
                                readonly clauses?: ReadonlyArray<{
                                    readonly clause_type?: string
                                    readonly clauses?: ReadonlyArray<{
                                        readonly clause_type?: string
                                        readonly clauses?: ReadonlyArray<{
                                            readonly clause_type?: string
                                            readonly clauses?: ReadonlyArray<{
                                                readonly clause_type?: string
                                                readonly clauses?: ReadonlyArray<{
                                                    readonly clause_type?: string
                                                    readonly filters?: ReadonlyArray<{
                                                        readonly filter_name?: string
                                                        readonly filter_result?: string
                                                        readonly parameters?: ReadonlyArray<{
                                                            readonly key?: string
                                                            readonly value?: string
                                                        }>
                                                        readonly passes_if_client_not_supported?: boolean
                                                    }>
                                                }>
                                                readonly filters?: ReadonlyArray<{
                                                    readonly filter_name?: string
                                                    readonly filter_result?: string
                                                    readonly parameters?: ReadonlyArray<{
                                                        readonly key?: string
                                                        readonly value?: string
                                                    }>
                                                    readonly passes_if_client_not_supported?: boolean
                                                }>
                                            }>
                                            readonly filters?: ReadonlyArray<{
                                                readonly filter_name?: string
                                                readonly filter_result?: string
                                                readonly parameters?: ReadonlyArray<{
                                                    readonly key?: string
                                                    readonly value?: string
                                                }>
                                                readonly passes_if_client_not_supported?: boolean
                                            }>
                                        }>
                                        readonly filters?: ReadonlyArray<{
                                            readonly filter_name?: string
                                            readonly filter_result?: string
                                            readonly parameters?: ReadonlyArray<{
                                                readonly key?: string
                                                readonly value?: string
                                            }>
                                            readonly passes_if_client_not_supported?: boolean
                                        }>
                                    }>
                                    readonly filters?: ReadonlyArray<{
                                        readonly filter_name?: string
                                        readonly filter_result?: string
                                        readonly parameters?: ReadonlyArray<{
                                            readonly key?: string
                                            readonly value?: string
                                        }>
                                        readonly passes_if_client_not_supported?: boolean
                                    }>
                                }>
                                readonly filters?: ReadonlyArray<{
                                    readonly filter_name?: string
                                    readonly filter_result?: string
                                    readonly parameters?: ReadonlyArray<{
                                        readonly key?: string
                                        readonly value?: string
                                    }>
                                    readonly passes_if_client_not_supported?: boolean
                                }>
                            }>
                            readonly filters?: ReadonlyArray<{
                                readonly filter_name?: string
                                readonly filter_result?: string
                                readonly parameters?: ReadonlyArray<{
                                    readonly key?: string
                                    readonly value?: string
                                }>
                                readonly passes_if_client_not_supported?: boolean
                            }>
                        }>
                        readonly filters?: ReadonlyArray<{
                            readonly filter_name?: string
                            readonly filter_result?: string
                            readonly parameters?: ReadonlyArray<{
                                readonly key?: string
                                readonly value?: string
                            }>
                            readonly passes_if_client_not_supported?: boolean
                        }>
                    }
                    readonly creatives?: ReadonlyArray<{
                        readonly accessibility_text_for_image?: string
                        readonly content?: {
                            readonly text?: string
                        }
                        readonly id?: string
                        readonly is_dismissible?: boolean
                        readonly primary_action?: {
                            readonly title?: {
                                readonly text?: string
                            }
                            readonly url?: string
                        }
                        readonly title?: {
                            readonly text?: string
                        }
                        readonly wa_dark_mode_media_details?: {
                            readonly jpeg_thumbnail?: string
                        }
                        readonly wa_light_mode_media_details?: {
                            readonly jpeg_thumbnail?: string
                        }
                    }>
                    readonly encrypted_logging_data?: string
                    readonly id?: string
                    readonly is_server_force_pass?: boolean
                    readonly promotion_id?: string
                    readonly should_expose_on_client?: boolean
                    readonly surface_delay_in_seconds?: number
                    readonly user_interaction_info?: {
                        readonly dismiss_click_count_for_user?: number
                        readonly dismiss_max_instances?: unknown
                        readonly impression_count_for_user?: number
                        readonly impression_max_instances?: unknown
                        readonly primary_click_count_for_user?: number
                        readonly primary_click_max_instances?: unknown
                        readonly secondary_click_count_for_user?: number
                    }
                    readonly wa_qp_content_attributes_do_not_use?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                }
                readonly priority?: number
                readonly time_range?: {
                    readonly end?: string
                    readonly start?: string
                }
            }>
        }
        readonly surface_nux_id?: string
    }>
}

export type WaMexFetchReachoutTimelockResponse = {
    readonly xwa2_fetch_account_reachout_timelock?: {
        readonly enforcement_type?: 'ADMIN_PROFILE' | 'GEOSUSPEND' | 'GEOSUSPEND_INFORM' | 'PROFILE_PICTURE_DELETION' | 'SUSPEND' | 'SUSPEND_INFORM' | 'VIOLATING_MSG'
        readonly is_active?: boolean
        readonly time_enforcement_ends?: string
    }
}

export type WaMexFetchRecommendedNewslettersResponse = {
    readonly xwa2_newsletters_recommended?: {
        readonly page_info?: {
            readonly endCursor?: string
            readonly hasNextPage?: boolean
            readonly hasPreviousPage?: boolean
            readonly startCursor?: string
        }
        readonly result?: ReadonlyArray<{
            readonly id?: string
            readonly state?: {
                readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
            }
            readonly status_metadata?: {
                readonly last_status_sent_time?: string
                readonly last_status_server_id?: string
            }
            readonly thread_metadata?: {
                readonly creation_time?: string
                readonly description?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly handle?: string
                readonly invite?: string
                readonly name?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly preview?: {
                    readonly direct_path?: string
                    readonly id?: string
                    readonly type?: 'PREVIEW'
                }
                readonly subscribers_count?: string
                readonly verification?: 'UNVERIFIED' | 'VERIFIED'
            }
        }>
    }
}

export type WaMexFetchSimilarNewslettersResponse = {
    readonly xwa2_newsletters_similar?: {
        readonly result?: ReadonlyArray<{
            readonly id?: string
            readonly state?: {
                readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
            }
            readonly status_metadata?: {
                readonly last_status_server_id?: string
            }
            readonly thread_metadata?: {
                readonly name?: {
                    readonly id?: string
                    readonly text?: string
                    readonly update_time?: string
                }
                readonly picture?: {
                    readonly direct_path?: string
                    readonly id?: string
                    readonly type?: 'IMAGE' | 'PREVIEW'
                }
                readonly verification?: 'UNVERIFIED' | 'VERIFIED'
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
                    readonly creation_time?: string
                    readonly creator?: {
                        readonly id?: string
                    }
                    readonly description?: {
                        readonly id?: string
                        readonly value?: string
                    }
                    readonly hidden_group?: boolean
                    readonly id?: string
                    readonly is_existing_group?: boolean
                    readonly subject?: {
                        readonly value?: string
                    }
                    readonly total_participants_count?: number
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
        readonly feature_flags?: ReadonlyArray<{
            readonly enabled?: boolean
            readonly limit?: number
            readonly name?: string
        }>
        readonly subscriptions?: ReadonlyArray<{
            readonly creation_time?: string
            readonly end_time?: string
            readonly id?: string
            readonly source?: string
            readonly start_time?: string
            readonly status?: 'ACTIVE' | 'CANCELED'
            readonly tier?: string
        }>
    }
}

export type WaMexFetchTextStatusListResponse = {
    readonly xwa2_text_status_list?: ReadonlyArray<{
        readonly emoji?: {
            readonly content?: string
        }
        readonly ephemeral_duration_sec?: number
        readonly jid?: string
        readonly last_update_time?: string
        readonly text?: string
    }>
}

export type WaMexFetchWassBotListProfilesGQLResponse = {
    readonly wass_account_list_profiles?: ReadonlyArray<{
        readonly bot_fbid?: string
        readonly creator_lid?: string
        readonly generated_emoji?: string
        readonly hca_entrypoint_id?: string
        readonly is_deprecated?: boolean
        readonly name?: string
        readonly product?: 'MANUS' | 'META_AI_THREAD' | 'MUSE' | 'THIRD_PARTY'
        readonly profile_pic_full_url?: string
        readonly profile_pic_thumb_url?: string
    }>
}

export type WaMexFetchWassBotProfileGQLResponse = {
    readonly get_wass_account_profile?: {
        readonly creator_lid?: string
        readonly generated_emoji?: string
        readonly hca_entrypoint_id?: string
        readonly is_deprecated?: boolean
        readonly name?: string
        readonly product?: 'MANUS' | 'META_AI_THREAD' | 'MUSE' | 'THIRD_PARTY'
        readonly profile_pic_full_url?: string
        readonly profile_pic_thumb_url?: string
        readonly tos?: {
            readonly group?: ReadonlyArray<{
                readonly blocking?: unknown
                readonly id?: string
            }>
        }
    }
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
                readonly id?: string
                readonly name?: string
                readonly permitted_tasks?: string
                readonly profile_picture?: {
                    readonly uri?: string
                }
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
            readonly lids?: ReadonlyArray<string>
            readonly phone_numbers?: ReadonlyArray<string>
        }>
    }
}

export type WaMexGetPrivacyListsResponse = {
    readonly xwa2_fetch_wa_users?: ReadonlyArray<{
        readonly __typename?: string
        readonly id?: string
        readonly privacy_contact_list?: {
            readonly contacts?: ReadonlyArray<{
                readonly jid?: string
                readonly pn_jid?: string
                readonly username_info?: {
                    readonly __typename?: string
                    readonly username?: string
                }
            }>
            readonly dhash?: string
        }
    }>
}

export type WaMexGetPrivacySettingsResponse = {
    readonly xwa2_fetch_wa_users?: ReadonlyArray<{
        readonly __typename?: string
        readonly id?: string
        readonly privacy_settings?: {
            readonly settings?: ReadonlyArray<{
                readonly feature?: 'ABOUT' | 'CALLADD' | 'DEFENSE' | 'DEPENDENT_ACCOUNT_CALLING' | 'DEPENDENT_ACCOUNT_MESSAGES' | 'GROUPADD' | 'LAST' | 'LINKED_PROFILES' | 'MESSAGES' | 'ONLINE' | 'PIX' | 'PROFILE' | 'READRECEIPTS' | 'STICKERS'
                readonly setting?: 'ALL' | 'MYCONTACTS' | 'OFF'
            }>
        }
    }>
}

export type WaMexGetUsernameResponse = {
    readonly xwa2_username_get?: {
        readonly username_info?: {
            readonly pin?: string
            readonly state?: string
            readonly username?: string
        }
    }
}

export type WaMexGetWAAEligibilityResponse = {
    readonly eval_wa_ad_account_eligibility_rules?: {
        readonly eligibility_result?: string
    }
}

export type WaMexGetWoasAgeSignalResponse = {
    readonly xwa2_fetch_wa_users?: ReadonlyArray<{
        readonly __typename?: string
        readonly age_collection_info?: {
            readonly assets?: ReadonlyArray<{
                readonly name?: 'WOAS'
                readonly ttl_sec?: number
                readonly value?: boolean
            }>
        }
        readonly id?: string
    }>
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
            readonly encrypted_location_name?: string
            readonly result_code?: string
        }
    }
}

export type WaMexGroupJoinResponse = {
    readonly xwa2_group_join?: {
        readonly __typename?: string
        readonly error_code?: number
        readonly response_code?: string
    }
}

export type WaMexGroupStoreAndSendInviteSmsResponse = {
    readonly xwa2_group_store_and_send_invites_sms?: {
        readonly group_jid?: string
        readonly participant_responses?: ReadonlyArray<{
            readonly error_code?: number
            readonly jid?: string
            readonly server_sent?: boolean
        }>
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
        readonly appeal_creation_time?: string
        readonly error_message?: string
        readonly response_code?: string
    }
}

export type WaMexIntegrityChallengeResponseResponse = {
    readonly xwa2_submit_integrity_challenge_response?: {
        readonly error_message?: string
        readonly success?: boolean
    }
}

export type WaMexInternalDirectoryFetchMembersResponse = {
    readonly xwa_whatsapp_for_work_employee_directory?: {
        readonly edges?: ReadonlyArray<{
            readonly node?: {
                readonly designation?: unknown
                readonly enrollment_status?: string
                readonly id?: string
                readonly lid?: string
                readonly member_id?: string
                readonly name?: string
                readonly team?: unknown
            }
        }>
        readonly page_info?: {
            readonly end_cursor?: string
            readonly has_next_page?: boolean
        }
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

export type WaMexKeyTransparencyGraphQLClient_Response = {
    readonly xfb_messenger_kt_lookup?: {
        readonly account_responses?: ReadonlyArray<{
            readonly account_fbid?: string
            readonly pending_sequencing?: unknown
            readonly proto_for_client?: unknown
        }>
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
        readonly new?: string
        readonly old?: string
    }
}

export type WaMexLogNewsletterExposuresResponse = {
    readonly xwa2_newsletter_log_exposures?: {
        readonly __typename?: string
    }
}

export type WaMexLogServerSentInviteIntentResponse = {
    readonly xwa2_growth_log_server_sent_invite_intent?: boolean
}

export type WaMexMAIBAAdObjectReference_StoryMetadataResponse = {
    readonly tofu_entity?: {
        readonly entity_info?: {
            readonly __typename?: string
            readonly id?: string
            readonly media_type?: string
            readonly story_duration_in_sec?: number
        }
        readonly id?: string
    }
}

export type WaMexMAIBAChatThreadResponse = {
    readonly node?: {
        readonly __typename?: string
        readonly async_support_lobby_state?: string
        readonly async_task_execution?: {
            readonly action_needed?: unknown
            readonly id?: string
        }
        readonly entry_point?: string
        readonly external_conversation_id?: string
        readonly fetch_id?: string
        readonly human_handover_lobby_case_closed_timestamp?: string
        readonly human_handover_lobby_case_created_timestamp?: string
        readonly human_handover_lobby_state?: string
        readonly human_handover_lobby_wait_time?: string
        readonly id?: string
        readonly is_conversation_eligible_for_csat?: boolean
        readonly is_handover_active?: boolean
        readonly is_unread?: boolean
        readonly last_send_timestamp_ms?: number
        readonly messages?: {
            readonly __typename?: string
            readonly edges?: ReadonlyArray<{
                readonly __typename?: string
                readonly cursor?: string
                readonly node?: {
                    readonly __typename?: string
                    readonly admin_text?: {
                        readonly __typename?: string
                        readonly render_payload?: {
                            readonly cta?: {
                                readonly __typename?: string
                                readonly action_url?: string
                                readonly postback_action_text?: string
                                readonly postback_payload?: string
                                readonly title?: string
                            }
                            readonly text?: string
                        }
                    }
                    readonly bot_invocation_message_otid?: unknown
                    readonly bot_request_id?: string
                    readonly bot_response_id?: string
                    readonly composed_text_v2?: {
                        readonly nodes_js?: ReadonlyArray<{
                            readonly __typename?: string
                            readonly node?: {
                                readonly alt?: unknown
                                readonly background_color?: string
                                readonly checked?: unknown
                                readonly children?: ReadonlyArray<{
                                    readonly __typename?: string
                                    readonly key?: string
                                }>
                                readonly col_span?: unknown
                                readonly col_widths?: unknown
                                readonly content?: string
                                readonly custom_type?: string
                                readonly expression?: unknown
                                readonly format?: string
                                readonly frozen_column_count?: number
                                readonly frozen_row_count?: number
                                readonly header_state?: string
                                readonly height?: number
                                readonly key?: string
                                readonly language?: string
                                readonly list_type?: string
                                readonly rel?: unknown
                                readonly row_span?: unknown
                                readonly row_striping?: unknown
                                readonly src?: unknown
                                readonly start?: string
                                readonly state?: string
                                readonly tag?: string
                                readonly target?: unknown
                                readonly text?: string
                                readonly title?: string
                                readonly url?: string
                                readonly value?: string
                                readonly vertical_align?: unknown
                                readonly width?: number
                            }
                        }>
                    }
                    readonly content?: {
                        readonly __typename?: string
                        readonly composed_text?: {
                            readonly content?: ReadonlyArray<{
                                readonly __typename?: string
                                readonly block_type?: string
                                readonly data?: string
                                readonly depth?: number
                                readonly entity_ranges?: ReadonlyArray<{
                                    readonly entity?: {
                                        readonly __typename?: string
                                        readonly action?: unknown
                                        readonly action_button_caption?: string
                                        readonly action_button_label?: string
                                        readonly action_label?: string
                                        readonly action_type?: string
                                        readonly ad_account?: unknown
                                        readonly ad_account_id?: string
                                        readonly ad_id?: string
                                        readonly ad_ids?: ReadonlyArray<string>
                                        readonly ad_image_alt_text?: string
                                        readonly ad_image_hash?: string
                                        readonly ad_image_postback_message?: string
                                        readonly ad_image_source_type?: string
                                        readonly ad_image_url?: string
                                        readonly ad_library_url?: string
                                        readonly ad_object_ids?: ReadonlyArray<string>
                                        readonly ad_object_type?: string
                                        readonly adgroup_id?: string
                                        readonly adgroup_or_fragment_id?: string
                                        readonly ads_checker_action?: unknown
                                        readonly age_max?: number
                                        readonly age_min?: number
                                        readonly apply_button_label?: string
                                        readonly apply_message_template?: unknown
                                        readonly asset_id?: string
                                        readonly asset_ids?: ReadonlyArray<string>
                                        readonly asset_type?: string
                                        readonly asset_types?: unknown
                                        readonly attributes_json?: unknown
                                        readonly audience_description?: string
                                        readonly auth_cta_label?: string
                                        readonly author?: {
                                            readonly display_name?: string
                                            readonly profile_picture_uri?: string
                                        }
                                        readonly auto_advance?: unknown
                                        readonly banner_label?: string
                                        readonly banner_status?: string
                                        readonly benchmark?: unknown
                                        readonly blocks_json?: unknown
                                        readonly body?: string
                                        readonly boost_message?: string
                                        readonly branch_condition?: unknown
                                        readonly branch_description?: string
                                        readonly brand_ig_user_id?: string
                                        readonly budget_and_duration_description?: string
                                        readonly budget_recommendation_source?: string
                                        readonly business_asset_ig_user_id?: string
                                        readonly business_asset_page_id?: string
                                        readonly business_avatar_uri?: string
                                        readonly business_id?: string
                                        readonly business_name?: string
                                        readonly business_portfolio?: unknown
                                        readonly business_user_id?: string
                                        readonly call_to_action?: {
                                            readonly destination?: unknown
                                            readonly label?: string
                                            readonly type?: string
                                        }
                                        readonly callout?: unknown
                                        readonly campaign_group_draft_id?: string
                                        readonly campaign_group_id?: string
                                        readonly campaign_id?: string
                                        readonly campaign_name?: string
                                        readonly campaigns?: ReadonlyArray<{
                                            readonly audience?: unknown
                                            readonly budget?: unknown
                                            readonly budget_pct?: unknown
                                            readonly budget_rationale?: unknown
                                            readonly creative?: unknown
                                            readonly end_date?: string
                                            readonly insight?: unknown
                                            readonly name?: string
                                            readonly objective?: unknown
                                            readonly phase?: unknown
                                            readonly placement?: unknown
                                            readonly section_key?: string
                                            readonly start_date?: string
                                            readonly timeline_end?: unknown
                                            readonly timeline_start?: unknown
                                        }>
                                        readonly caption?: string
                                        readonly card_data?: unknown
                                        readonly card_state_json?: unknown
                                        readonly card_variant?: unknown
                                        readonly case_id?: string
                                        readonly cdn_url?: string
                                        readonly challenge_id?: string
                                        readonly compass_insight_unit_id?: string
                                        readonly condition_matched?: unknown
                                        readonly content_id?: string
                                        readonly content_version?: number
                                        readonly created_time?: string
                                        readonly creation_lifecycle_identity?: unknown
                                        readonly creation_time?: string
                                        readonly creative_description?: string
                                        readonly creators?: ReadonlyArray<{
                                            readonly explanation?: string
                                            readonly fbid?: unknown
                                            readonly name?: string
                                            readonly profile_pic_url?: string
                                            readonly username?: string
                                        }>
                                        readonly cta_action?: unknown
                                        readonly cta_text?: string
                                        readonly cta_type?: string
                                        readonly current_value?: unknown
                                        readonly current_value_formatted?: unknown
                                        readonly dag_conclusion?: unknown
                                        readonly dag_description?: string
                                        readonly dag_name?: string
                                        readonly dag_root?: unknown
                                        readonly dag_root_id?: string
                                        readonly data_config?: ReadonlyArray<{
                                            readonly composed_text_label?: {
                                                readonly content?: ReadonlyArray<{
                                                    readonly __typename?: string
                                                    readonly block_type?: string
                                                    readonly data?: string
                                                    readonly depth?: number
                                                    readonly entity_ranges?: ReadonlyArray<{
                                                        readonly entity?: {
                                                            readonly __typename?: string
                                                            readonly ad_object_ids?: ReadonlyArray<string>
                                                            readonly ad_object_type?: string
                                                            readonly display_text?: string
                                                            readonly id?: string
                                                            readonly request_id?: string
                                                        }
                                                        readonly entity_type?: string
                                                        readonly length?: number
                                                        readonly offset?: number
                                                    }>
                                                    readonly inline_style_ranges?: ReadonlyArray<{
                                                        readonly inline_style?: 'BOLD' | 'CODE' | 'ITALIC' | 'LIGHTSTRIKETHROUGH' | 'LINEBREAK' | 'STRIKETHROUGH' | 'SUBSCRIPT' | 'SUPERSCRIPT' | 'UNDERLINE'
                                                        readonly length?: number
                                                        readonly offset?: number
                                                    }>
                                                    readonly text?: string
                                                }>
                                            }
                                            readonly description?: string
                                            readonly label?: string
                                            readonly metric_name?: string
                                            readonly type?: string
                                        }>
                                        readonly data_entries?: ReadonlyArray<{
                                            readonly composed_text_values?: ReadonlyArray<{
                                                readonly content?: ReadonlyArray<{
                                                    readonly __typename?: string
                                                    readonly block_type?: string
                                                    readonly data?: string
                                                    readonly depth?: number
                                                    readonly entity_ranges?: ReadonlyArray<{
                                                        readonly entity?: {
                                                            readonly __typename?: string
                                                            readonly ad_object_ids?: ReadonlyArray<string>
                                                            readonly ad_object_type?: string
                                                            readonly display_text?: string
                                                            readonly id?: string
                                                            readonly request_id?: string
                                                        }
                                                        readonly entity_type?: string
                                                        readonly length?: number
                                                        readonly offset?: number
                                                    }>
                                                    readonly inline_style_ranges?: ReadonlyArray<{
                                                        readonly inline_style?: 'BOLD' | 'CODE' | 'ITALIC' | 'LIGHTSTRIKETHROUGH' | 'LINEBREAK' | 'STRIKETHROUGH' | 'SUBSCRIPT' | 'SUPERSCRIPT' | 'UNDERLINE'
                                                        readonly length?: number
                                                        readonly offset?: number
                                                    }>
                                                    readonly text?: string
                                                }>
                                            }>
                                            readonly values?: unknown
                                        }>
                                        readonly data_set_id?: string
                                        readonly data_viz_type?: string
                                        readonly date_range?: unknown
                                        readonly dates?: unknown
                                        readonly delta?: number
                                        readonly dependencies_met?: ReadonlyArray<{
                                            readonly ref?: unknown
                                            readonly status?: string
                                        }>
                                        readonly description?: string
                                        readonly diagnosis_title?: string
                                        readonly digital_creation_disclosure?: unknown
                                        readonly disclosure_kind?: string
                                        readonly display_name?: string
                                        readonly display_text?: string
                                        readonly draft_id?: string
                                        readonly echo_override?: unknown
                                        readonly edited?: unknown
                                        readonly enrollment_context_enc?: unknown
                                        readonly error?: boolean
                                        readonly error_message?: string
                                        readonly error_phase?: unknown
                                        readonly evaluation?: unknown
                                        readonly expression?: unknown
                                        readonly external_url?: string
                                        readonly eyebrow_image_url?: string
                                        readonly eyebrow_text?: string
                                        readonly fallback_text?: string
                                        readonly fill_value?: unknown
                                        readonly forecasted_results?: ReadonlyArray<{
                                            readonly label?: string
                                            readonly subtitle?: string
                                            readonly value?: string
                                        }>
                                        readonly form_fields?: ReadonlyArray<{
                                            readonly is_required?: boolean
                                            readonly label?: string
                                            readonly name?: string
                                            readonly placeholder?: unknown
                                            readonly prefilled_value?: unknown
                                            readonly react_component?: unknown
                                        }>
                                        readonly format?: string
                                        readonly format_type?: string
                                        readonly funnel_chart_data?: unknown
                                        readonly gender?: unknown
                                        readonly goal_context?: unknown
                                        readonly goal_description?: string
                                        readonly goal_detail?: unknown
                                        readonly has_payment_method?: boolean
                                        readonly heading?: unknown
                                        readonly heading_subtitle?: string
                                        readonly heat_bar_label?: string
                                        readonly icon?: unknown
                                        readonly id?: string
                                        readonly idea_creatives?: ReadonlyArray<{
                                            readonly adgroup_id?: string
                                            readonly concept_id?: string
                                            readonly creative_id?: string
                                            readonly image_url?: string
                                            readonly media_type?: string
                                            readonly video_url?: string
                                        }>
                                        readonly idea_id?: string
                                        readonly ideas?: ReadonlyArray<{
                                            readonly concept_id?: string
                                            readonly cover_image_url?: string
                                            readonly cover_video_url?: string
                                            readonly rationale?: unknown
                                            readonly reasoning?: unknown
                                            readonly title?: string
                                            readonly type?: string
                                        }>
                                        readonly image_url?: string
                                        readonly image_urls?: unknown
                                        readonly initial_description?: string
                                        readonly initial_title?: string
                                        readonly input_role?: string
                                        readonly insights?: ReadonlyArray<{
                                            readonly category?: string
                                            readonly detail?: unknown
                                            readonly headline?: string
                                            readonly icon?: unknown
                                            readonly source?: string
                                        }>
                                        readonly interests?: unknown
                                        readonly invited_people?: unknown
                                        readonly is_action?: boolean
                                        readonly is_completed?: boolean
                                        readonly is_continuous_duration?: boolean
                                        readonly is_ctx_ad?: boolean
                                        readonly is_decision?: boolean
                                        readonly is_error?: boolean
                                        readonly is_join?: boolean
                                        readonly is_loading?: boolean
                                        readonly is_parallel?: boolean
                                        readonly is_pill_hidden?: boolean
                                        readonly is_skipped?: boolean
                                        readonly is_streaming?: boolean
                                        readonly is_success?: boolean
                                        readonly issue_cards_data?: unknown
                                        readonly kpi_tiles_data?: unknown
                                        readonly label?: string
                                        readonly limit?: number
                                        readonly link_description?: string
                                        readonly links?: unknown
                                        readonly log_source?: string
                                        readonly lower_limit?: number
                                        readonly maiba_interviewer_rec_key?: string
                                        readonly maiba_recommendation_id?: string
                                        readonly max_value?: number
                                        readonly media_layout?: unknown
                                        readonly media_type?: string
                                        readonly metadata?: unknown
                                        readonly metric_value?: unknown
                                        readonly metrics?: ReadonlyArray<{
                                            readonly benchmark?: unknown
                                            readonly dates?: unknown
                                            readonly delta?: number
                                            readonly label?: string
                                            readonly metric_value?: unknown
                                            readonly note?: string
                                            readonly sentiment?: unknown
                                            readonly series?: unknown
                                            readonly sparkline_label?: string
                                            readonly trend?: unknown
                                            readonly value?: string
                                        }>
                                        readonly mime_type?: string
                                        readonly min_value?: number
                                        readonly next_node?: unknown
                                        readonly node_id?: string
                                        readonly node_type?: string
                                        readonly nodes?: ReadonlyArray<{
                                            readonly __typename?: string
                                            readonly branches?: ReadonlyArray<{
                                                readonly condition?: unknown
                                                readonly description?: string
                                                readonly target?: unknown
                                            }>
                                            readonly depends_on?: unknown
                                            readonly description?: string
                                            readonly evaluate?: unknown
                                            readonly next?: unknown
                                            readonly node_id?: string
                                            readonly on_complete?: unknown
                                            readonly parallel_paths?: ReadonlyArray<{
                                                readonly target?: unknown
                                            }>
                                            readonly request?: unknown
                                            readonly type?: string
                                        }>
                                        readonly option_label?: string
                                        readonly options?: ReadonlyArray<{
                                            readonly age_max?: number
                                            readonly age_min?: number
                                            readonly description?: string
                                            readonly gender?: unknown
                                            readonly id?: string
                                            readonly interests?: unknown
                                            readonly is_recommended?: boolean
                                            readonly subtitle?: string
                                            readonly subtitle_value?: unknown
                                            readonly thumbnail_url?: string
                                            readonly title?: string
                                        }>
                                        readonly options_json?: unknown
                                        readonly organic_insights?: {
                                            readonly comments?: unknown
                                            readonly likes?: unknown
                                            readonly shares?: unknown
                                            readonly views?: unknown
                                        }
                                        readonly outcome_predictions?: {
                                            readonly impressions?: number
                                            readonly optimization_goal?: unknown
                                            readonly outcome_label?: string
                                            readonly outcomes?: unknown
                                        }
                                        readonly page_id?: string
                                        readonly page_name?: string
                                        readonly page_profile_pic_url?: string
                                        readonly partner?: unknown
                                        readonly paths_completed?: ReadonlyArray<{
                                            readonly id?: string
                                            readonly status?: string
                                            readonly summary?: string
                                        }>
                                        readonly payment_summary?: {
                                            readonly billing_wizard_name?: string
                                            readonly billing_wizard_props_json?: unknown
                                            readonly currency?: string
                                            readonly daily_budget?: string
                                            readonly duration_days?: number
                                            readonly payment_account_id?: string
                                            readonly payment_method_label?: string
                                            readonly payment_method_logo_url?: string
                                            readonly payment_method_type?: string
                                            readonly taxes?: ReadonlyArray<{
                                                readonly amount?: number
                                                readonly label?: string
                                            }>
                                            readonly total_amount?: number
                                            readonly total_budget?: unknown
                                        }
                                        readonly per_platform?: ReadonlyArray<{
                                            readonly caption?: string
                                            readonly image_url?: string
                                            readonly platform?: unknown
                                        }>
                                        readonly period_basis?: unknown
                                        readonly photo_id?: string
                                        readonly placement_description?: string
                                        readonly platform?: unknown
                                        readonly ple_text?: string
                                        readonly points?: unknown
                                        readonly post_confirm_description?: string
                                        readonly post_confirm_title?: string
                                        readonly post_id?: string
                                        readonly post_metadata?: {
                                            readonly caption?: string
                                            readonly content_type?: string
                                            readonly creation_time?: string
                                            readonly id?: string
                                            readonly image_url?: string
                                            readonly lwi_product?: unknown
                                            readonly page_id?: string
                                        }
                                        readonly postback_message?: string
                                        readonly previews?: ReadonlyArray<{
                                            readonly ad_id?: string
                                            readonly ad_library_url?: string
                                            readonly body?: string
                                            readonly caption?: string
                                            readonly cta_text?: string
                                            readonly cta_type?: string
                                            readonly id?: string
                                            readonly image_url?: string
                                            readonly link_description?: string
                                            readonly page_id?: string
                                            readonly page_name?: string
                                            readonly page_profile_pic_url?: string
                                            readonly platform?: unknown
                                            readonly title?: string
                                        }>
                                        readonly primary_cta_label?: string
                                        readonly profiles?: unknown
                                        readonly progress_phase?: unknown
                                        readonly progress_subscription_id?: string
                                        readonly progress_summary?: string
                                        readonly progress_title?: string
                                        readonly prompt?: unknown
                                        readonly prompt_composed_text?: {
                                            readonly content?: ReadonlyArray<{
                                                readonly __typename?: string
                                                readonly block_type?: string
                                                readonly data?: string
                                                readonly depth?: number
                                                readonly entity_ranges?: ReadonlyArray<{
                                                    readonly entity?: {
                                                        readonly __typename?: string
                                                        readonly ad_object_ids?: ReadonlyArray<string>
                                                        readonly ad_object_type?: string
                                                        readonly display_text?: string
                                                        readonly id?: string
                                                        readonly request_id?: string
                                                    }
                                                    readonly entity_type?: string
                                                    readonly length?: number
                                                    readonly offset?: number
                                                }>
                                                readonly inline_style_ranges?: ReadonlyArray<{
                                                    readonly inline_style?: 'BOLD' | 'CODE' | 'ITALIC' | 'LIGHTSTRIKETHROUGH' | 'LINEBREAK' | 'STRIKETHROUGH' | 'SUBSCRIPT' | 'SUPERSCRIPT' | 'UNDERLINE'
                                                    readonly length?: number
                                                    readonly offset?: number
                                                }>
                                                readonly text?: string
                                            }>
                                        }
                                        readonly publish_metadata?: {
                                            readonly fragment_ids?: ReadonlyArray<string>
                                            readonly state?: string
                                            readonly tooltip?: unknown
                                        }
                                        readonly publish_status?: string
                                        readonly quarter?: unknown
                                        readonly raw_json?: unknown
                                        readonly raw_value?: string
                                        readonly reached_value?: unknown
                                        readonly reasoning?: unknown
                                        readonly recap?: unknown
                                        readonly recommendation_id?: string
                                        readonly recommendation_reason?: string
                                        readonly recommendation_reason_audience?: unknown
                                        readonly recommendation_reason_budget_and_duration?: number
                                        readonly recommendation_reason_creative?: unknown
                                        readonly recommendation_reason_goal?: unknown
                                        readonly recommendation_reason_placement?: unknown
                                        readonly recommended_post_variant?: unknown
                                        readonly redirect_url?: string
                                        readonly region?: string
                                        readonly request_id?: string
                                        readonly review_header?: unknown
                                        readonly scheduled_time?: string
                                        readonly scorecard_cta_label?: string
                                        readonly scorecard_cta_prompt?: unknown
                                        readonly scorecard_report_description?: string
                                        readonly scorecard_report_summary?: string
                                        readonly scorecard_report_title?: string
                                        readonly scorecard_shell_tabs?: unknown
                                        readonly search_filters_json?: unknown
                                        readonly search_label?: string
                                        readonly secondary_button_label?: string
                                        readonly secondary_cta_label?: string
                                        readonly secondary_label?: string
                                        readonly secondary_message?: string
                                        readonly section?: unknown
                                        readonly sections?: ReadonlyArray<{
                                            readonly body?: string
                                            readonly data_viz?: {
                                                readonly data_config?: ReadonlyArray<{
                                                    readonly description?: string
                                                    readonly label?: string
                                                    readonly metric_name?: string
                                                    readonly type?: string
                                                }>
                                                readonly data_entries?: ReadonlyArray<{
                                                    readonly values?: unknown
                                                }>
                                                readonly data_viz_type?: string
                                                readonly description?: string
                                                readonly id?: string
                                                readonly title?: string
                                            }
                                            readonly icon?: unknown
                                            readonly section_key?: string
                                            readonly title?: string
                                        }>
                                        readonly seed_image_uri?: string
                                        readonly selection_mode?: string
                                        readonly sentiment?: unknown
                                        readonly series?: unknown
                                        readonly server_formatted_text?: string
                                        readonly show_creative_terms?: unknown
                                        readonly show_select_all?: unknown
                                        readonly signals_action?: unknown
                                        readonly single_apply_uses_template?: unknown
                                        readonly sparkline_label?: string
                                        readonly spec_type?: string
                                        readonly special_ad_categories_description?: string
                                        readonly specs?: ReadonlyArray<{
                                            readonly description?: string
                                            readonly name?: string
                                        }>
                                        readonly status?: string
                                        readonly subtitle?: string
                                        readonly summary?: string
                                        readonly surface?: unknown
                                        readonly surface_id?: string
                                        readonly symptom?: unknown
                                        readonly target?: unknown
                                        readonly target_asset?: unknown
                                        readonly target_value?: unknown
                                        readonly target_value_formatted?: unknown
                                        readonly thumbnail_uri?: string
                                        readonly thumbnails?: unknown
                                        readonly title?: string
                                        readonly tool_call_args?: unknown
                                        readonly tool_call_batch_id?: string
                                        readonly tool_call_id?: string
                                        readonly tool_name?: string
                                        readonly tool_result?: unknown
                                        readonly tool_status?: string
                                        readonly tooltip?: unknown
                                        readonly tooltip_text?: string
                                        readonly tooltip_variant?: 'ESTIMATED_COST_PER_RESULT' | 'ESTIMATED_RESULTS_RANGE' | 'SIMILAR_ADVERTISER_BUDGET_RECOMMENDATION'
                                        readonly total_budget?: unknown
                                        readonly total_count?: number
                                        readonly type?: string
                                        readonly unit_id?: string
                                        readonly upper_limit?: number
                                        readonly url?: string
                                        readonly variant?: unknown
                                        readonly version?: number
                                        readonly video_aspect_ratio?: unknown
                                        readonly video_id?: string
                                        readonly video_permalink?: unknown
                                        readonly video_url?: string
                                        readonly was_approved?: boolean
                                        readonly welcome_message_template?: {
                                            readonly greeting?: unknown
                                            readonly icebreakers?: unknown
                                        }
                                        readonly why_bullets?: unknown
                                        readonly widget_data?: unknown
                                        readonly widget_status?: string
                                        readonly widget_variant?: unknown
                                        readonly workspace_creators?: ReadonlyArray<{
                                            readonly explanation?: string
                                            readonly fbid?: unknown
                                        }>
                                        readonly workspace_id?: string
                                        readonly workspace_type?: string
                                    }
                                    readonly entity_type?: string
                                    readonly length?: number
                                    readonly offset?: number
                                }>
                                readonly inline_style_ranges?: ReadonlyArray<{
                                    readonly inline_style?: 'BOLD' | 'CODE' | 'ITALIC' | 'LIGHTSTRIKETHROUGH' | 'LINEBREAK' | 'STRIKETHROUGH' | 'SUBSCRIPT' | 'SUPERSCRIPT' | 'UNDERLINE'
                                    readonly length?: number
                                    readonly offset?: number
                                }>
                                readonly media_alignment?: unknown
                                readonly media_caption?: string
                                readonly text?: string
                            }>
                        }
                        readonly message?: {
                            readonly id?: string
                            readonly snippet?: unknown
                        }
                        readonly parsed_composed_text?: {
                            readonly __typename?: string
                        }
                        readonly snippet?: unknown
                        readonly widget_states?: unknown
                    }
                    readonly context_chips?: ReadonlyArray<{
                        readonly display_name?: string
                        readonly entity_id?: string
                        readonly entity_type?: string
                        readonly matched_text?: string
                    }>
                    readonly conversation?: {
                        readonly __typename?: string
                        readonly external_conversation_id?: string
                        readonly human_handover_lobby_state?: string
                        readonly id?: string
                        readonly is_handover_active?: boolean
                    }
                    readonly created_timestamp?: string
                    readonly external_conversation_id?: string
                    readonly feedback_response?: unknown
                    readonly fetch_id?: string
                    readonly follow_up_prompts?: ReadonlyArray<{
                        readonly __typename?: string
                        readonly text?: string
                        readonly type?: string
                    }>
                    readonly id?: string
                    readonly loading_states?: unknown
                    readonly message_id?: string
                    readonly message_origin?: unknown
                    readonly metadata?: {
                        readonly entrypoint_qe_universes?: unknown
                        readonly is_axon_routed?: boolean
                        readonly is_maiba_unchained?: boolean
                        readonly reach_planner_skill?: unknown
                    }
                    readonly offline_threading_id?: string
                    readonly relay_refetch_hints?: ReadonlyArray<{
                        readonly entity_ids?: ReadonlyArray<string>
                        readonly entity_type?: string
                        readonly scope?: unknown
                        readonly source_tool_name?: string
                    }>
                    readonly role?: string
                    readonly selected_assets?: ReadonlyArray<{
                        readonly asset_id?: string
                        readonly asset_name?: string
                        readonly asset_type?: string
                    }>
                    readonly selected_text?: {
                        readonly selected_text?: string
                    }
                    readonly sender_name?: string
                    readonly snippet?: unknown
                    readonly streaming_state?: string
                    readonly thought?: unknown
                    readonly tool_calls?: ReadonlyArray<{
                        readonly __typename?: string
                        readonly governed_action_json?: unknown
                        readonly id?: string
                        readonly is_completed?: boolean
                        readonly progress_phase?: unknown
                        readonly progress_summary?: string
                        readonly progress_title?: string
                        readonly tool_call_args?: unknown
                        readonly tool_call_id?: string
                        readonly tool_name?: string
                        readonly tool_result?: unknown
                        readonly tool_status?: string
                    }>
                    readonly user_media_attachments?: ReadonlyArray<{
                        readonly account_id?: string
                        readonly attachment_id?: string
                        readonly file_metadata?: {
                            readonly file_size?: number
                            readonly filename?: string
                            readonly upload_blocked_reason?: string
                        }
                        readonly image_hash?: string
                        readonly maiba_internal_kind?: string
                        readonly media_id?: string
                        readonly media_type?: string
                        readonly media_url?: string
                        readonly mime_type?: string
                    }>
                    readonly user_type?: string
                }
            }>
            readonly page_info?: {
                readonly end_cursor?: string
                readonly has_next_page?: boolean
                readonly has_previous_page?: boolean
                readonly start_cursor?: string
            }
        }
        readonly proactive_task_origin?: {
            readonly template_key?: string
        }
        readonly thread_status?: string
    }
}

export type WaMexMAIBAGraphQLSendMessageV2QueryResponse = Readonly<Record<string, unknown>>

export type WaMexMAIBAGraphQLSendMessageV3QueryResponse = {
    readonly xfb_maiba_send_message_v3?: {
        readonly conversation?: {
            readonly __typename?: string
            readonly display_title?: string
            readonly id?: string
            readonly is_conversation_eligible_for_csat?: boolean
        }
        readonly entry_point_claim_state?: string
    }
}

export type WaMexMAIBAGraphQLSendMessageV4QueryResponse = {
    readonly maiba_send_message_v4?: {
        readonly conversation?: {
            readonly __typename?: string
            readonly display_title?: string
            readonly id?: string
            readonly is_conversation_eligible_for_csat?: boolean
        }
        readonly entry_point_claim_state?: string
    }
}

export type WaMexMAIBAPageReferenceResponse = {
    readonly node?: {
        readonly __typename?: string
        readonly id?: string
        readonly page_url?: string
        readonly user_url?: string
    }
}

export type WaMexMAIBAUpdateAdsAIConsentResponse = {
    readonly update_maiba_consent_status?: {
        readonly is_ads_ai_consented?: boolean
    }
}

export type WaMexMetaPayVaultInitializeResponse = {
    readonly meta_pay_vault_initialize?: {
        readonly error_reason?: string
        readonly status?: string
    }
}

export type WaMexMetaPayVaultLabyrinthDeleteResponse = {
    readonly meta_pay_vault_delete?: {
        readonly error_reason?: string
        readonly status?: string
    }
}

export type WaMexMetaPayVaultLabyrinthFetchAllResponse = {
    readonly meta_pay_vault_entries?: {
        readonly vault_entry_to_entry_key?: ReadonlyArray<{
            readonly entry?: {
                readonly entry_data?: unknown
                readonly entry_fbid?: string
            }
        }>
    }
}

export type WaMexMetaPayVaultLabyrinthSaveResponse = {
    readonly meta_pay_vault_entry_save?: {
        readonly error_reason?: string
        readonly status?: string
        readonly vault_entry_fbid?: string
    }
}

export type WaMexNativeMLModelResponse = {
    readonly aim_model_batched_manifest?: {
        readonly asset_count?: number
        readonly entry_point?: string
        readonly model_count?: number
        readonly models?: ReadonlyArray<{
            readonly assets?: ReadonlyArray<{
                readonly asset_handle?: string
                readonly asset_type?: string
                readonly cache_key?: string
                readonly compression_type?: string
                readonly creation_time?: string
                readonly filesize_bytes?: number
                readonly id?: string
                readonly md5_hash?: string
                readonly name?: string
                readonly source_content_hash?: string
                readonly url?: string
            }>
            readonly name?: string
            readonly properties?: ReadonlyArray<{
                readonly name?: string
                readonly value?: string
            }>
            readonly version?: number
        }>
        readonly status?: string
        readonly status_details?: string
    }
}

export type WaMexNewsletterAddPaidPartnershipLabelResponse = {
    readonly xwa2_newsletter_label_paid_partnership?: {
        readonly id?: string
    }
}

export type WaMexNewsletterBlockUserResponse = {
    readonly xwa2_newsletter_block_user?: {
        readonly newsletter_id?: string
    }
}

export type WaMexNewsletterLabelAiContentResponse = {
    readonly xwa2_newsletter_label_ai_content?: {
        readonly id?: string
    }
}

export type WaMexNewsletterPinMessagesResponse = {
    readonly xwa2_newsletter_pin_messages?: {
        readonly id?: string
        readonly thread_metadata?: {
            readonly pinned_messages?: ReadonlyArray<{
                readonly expiry_ts?: string
                readonly message_id?: string
            }>
        }
    }
}

export type WaMexNewsletterQuestionResponseStateUpdateResponse = {
    readonly xwa2_newsletter_question_response_state_update?: {
        readonly id?: string
    }
}

export type WaMexNewsletterUnpinMessagesResponse = {
    readonly xwa2_newsletter_unpin_messages?: {
        readonly id?: string
        readonly thread_metadata?: {
            readonly pinned_messages?: ReadonlyArray<{
                readonly expiry_ts?: string
                readonly message_id?: string
            }>
        }
    }
}

export type WaMexOrgAdminGraphQLAddChannelResponse = {
    readonly xwa_org_managed_channel_add?: {
        readonly channel?: {
            readonly creation_timestamp_s?: number
            readonly description?: string
            readonly follower_count?: number
            readonly id?: string
            readonly invite_code?: string
            readonly name?: string
            readonly picture?: {
                readonly uri?: string
            }
        }
        readonly error_reason?: string
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLAddGroupResponse = {
    readonly xwa_org_managed_group_add?: {
        readonly error_reason?: string
        readonly group?: {
            readonly creation_timestamp_s?: number
            readonly gid?: string
            readonly participant_count?: number
            readonly subject?: string
        }
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLAdminRosterResponse = {
    readonly xwa_org_get?: {
        readonly error_reason?: string
        readonly org_info?: {
            readonly admin_roster?: {
                readonly entries?: ReadonlyArray<{
                    readonly email_address?: string
                    readonly id?: string
                    readonly invite_expiry?: number
                    readonly last_name?: string
                    readonly member_lid?: string
                    readonly member_tag?: string
                    readonly name?: string
                    readonly phone_number?: string
                    readonly secondary_member_tag?: string
                    readonly status?: string
                }>
                readonly is_truncated?: boolean
                readonly total_count?: number
                readonly version?: number
            }
            readonly id?: string
            readonly member_tag_name?: number
            readonly secondary_member_tag_name?: number
        }
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLApplyAdminRosterChangesResponse = {
    readonly xwa_org_admin_roster_apply_changes?: {
        readonly added_entry_ids?: ReadonlyArray<string>
        readonly error_reason?: 'INVALID_EMAIL_BATCH' | 'STALE_ROSTER_VERSION'
        readonly invalid_change?: {
            readonly index?: number
            readonly kind?: string
        }
        readonly status?: 'SUCCESS'
        readonly version?: number
    }
}

export type WaMexOrgAdminGraphQLDirectoryPageResponse = {
    readonly xwa_org_get?: {
        readonly error_reason?: string
        readonly org_info?: {
            readonly id?: string
            readonly members?: {
                readonly count?: number
                readonly nodes?: ReadonlyArray<{
                    readonly display_last_name?: string
                    readonly display_name?: string
                    readonly lid?: string
                    readonly member_tag?: string
                    readonly phone_number?: string
                    readonly role?: string
                    readonly username?: string
                }>
                readonly page_info?: {
                    readonly has_next_page?: boolean
                }
            }
            readonly org_member_updated_ts_usec?: unknown
        }
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLEventRsvpCountsResponse = {
    readonly xwa_event_get?: {
        readonly privacy_aware_invitation?: {
            readonly count_by_rsvp_status?: {
                readonly going?: number
                readonly maybe?: number
                readonly no_response?: number
            }
        }
    }
}

export type WaMexOrgAdminGraphQLGroupResponse = {
    readonly xwa_org_get?: {
        readonly error_reason?: string
        readonly org_info?: {
            readonly id?: string
            readonly managed_group?: {
                readonly creation_timestamp_s?: number
                readonly description?: string
                readonly gid?: string
                readonly participant_count?: number
                readonly participants?: ReadonlyArray<{
                    readonly lid?: string
                    readonly role?: string
                }>
                readonly picture?: {
                    readonly uri?: string
                }
                readonly roster_partial?: boolean
                readonly subject?: string
            }
        }
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLInviteMembersResponse = {
    readonly xwa_org_invite_members?: {
        readonly error_reason?: 'INVALID_EMAIL_BATCH' | 'STALE_ROSTER_VERSION'
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLLeaveResponse = {
    readonly xwa_org_leave?: {
        readonly error_reason?: string
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLManagedChannelAdminsResponse = {
    readonly xwa_org_get?: {
        readonly error_reason?: string
        readonly org_info?: {
            readonly id?: string
            readonly managed_channel?: {
                readonly admins?: {
                    readonly members?: ReadonlyArray<{
                        readonly lid?: string
                        readonly role?: string
                    }>
                    readonly outside_organization_count?: number
                }
                readonly id?: string
            }
        }
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLManagedChannelsResponse = {
    readonly xwa_org_get?: {
        readonly error_reason?: string
        readonly org_info?: {
            readonly id?: string
            readonly managed_channels?: {
                readonly nodes?: ReadonlyArray<{
                    readonly creation_timestamp_s?: number
                    readonly description?: string
                    readonly follower_count?: number
                    readonly id?: string
                    readonly invite_code?: string
                    readonly name?: string
                    readonly picture?: {
                        readonly uri?: string
                    }
                }>
            }
        }
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLManagedEventsResponse = {
    readonly xwa_org_get?: {
        readonly error_reason?: string
        readonly org_info?: {
            readonly id?: string
            readonly managed_events?: {
                readonly nodes?: ReadonlyArray<{
                    readonly end_timestamp_s?: unknown
                    readonly id?: string
                    readonly name?: string
                    readonly start_timestamp_s?: unknown
                    readonly status?: string
                }>
            }
        }
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLManagedGroupsResponse = {
    readonly xwa_org_get?: {
        readonly error_reason?: string
        readonly org_info?: {
            readonly id?: string
            readonly managed_groups?: {
                readonly nodes?: ReadonlyArray<{
                    readonly creation_timestamp_s?: number
                    readonly gid?: string
                    readonly participant_count?: number
                    readonly participants?: ReadonlyArray<{
                        readonly lid?: string
                        readonly role?: string
                    }>
                    readonly roster_partial?: boolean
                    readonly subject?: string
                }>
            }
        }
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLMemberSearchResponse = {
    readonly xwa_org_member_search?: {
        readonly count?: number
        readonly nodes?: ReadonlyArray<{
            readonly member?: {
                readonly display_last_name?: string
                readonly display_name?: string
                readonly lid?: string
                readonly member_tag?: string
                readonly phone_number?: string
                readonly role?: string
                readonly username?: string
            }
        }>
        readonly page_info?: {
            readonly end_cursor?: string
            readonly has_next_page?: boolean
        }
    }
}

export type WaMexOrgAdminGraphQLOrgsResponse = {
    readonly xwa_org_list?: {
        readonly orgs?: ReadonlyArray<{
            readonly description?: string
            readonly icon_large?: {
                readonly uri?: string
            }
            readonly icon_small?: {
                readonly handle?: string
                readonly uri?: string
            }
            readonly id?: string
            readonly is_member_directory_enabled?: boolean
            readonly member_tag_options?: string
            readonly members?: {
                readonly count?: number
            }
            readonly name?: string
            readonly org_member_updated_ts_usec?: unknown
            readonly org_updated_ts_usec?: unknown
            readonly viewer_role?: string
        }>
    }
}

export type WaMexOrgAdminGraphQLRemoveMemberResponse = {
    readonly xwa_org_member_remove?: {
        readonly error_reason?: string
        readonly org?: {
            readonly id?: string
            readonly members?: {
                readonly count?: number
            }
        }
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLSendManagedGroupEmailInvitesResponse = {
    readonly xwa_org_managed_group_send_email_invites?: {
        readonly error_reason?: 'INVALID_EMAIL_BATCH' | 'STALE_ROSTER_VERSION'
        readonly results?: ReadonlyArray<{
            readonly status?: 'SENT'
        }>
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLSetMemberRoleResponse = {
    readonly xwa_org_member_set_role?: {
        readonly error_reason?: string
        readonly org?: {
            readonly id?: string
            readonly members?: {
                readonly count?: number
            }
        }
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLSubmitBulkGroupRequestResponse = {
    readonly xwa_org_bulk_group_request_submit?: {
        readonly error_reason?: string
        readonly invalid_group_index?: number
        readonly request_id?: string
        readonly status?: 'SENT' | 'SUCCESS'
    }
}

export type WaMexOrgAdminGraphQLUpdateOrgResponse = {
    readonly xwa_org_update?: {
        readonly error_reason?: 'INVALID_EMAIL_BATCH' | 'STALE_ROSTER_VERSION'
        readonly org?: {
            readonly description?: string
            readonly icon_large?: {
                readonly uri?: string
            }
            readonly icon_small?: {
                readonly handle?: string
                readonly uri?: string
            }
            readonly id?: string
            readonly is_member_directory_enabled?: boolean
            readonly member_tag_options?: string
            readonly members?: {
                readonly count?: number
            }
            readonly name?: string
            readonly org_member_updated_ts_usec?: unknown
            readonly org_updated_ts_usec?: unknown
            readonly viewer_role?: string
        }
        readonly status?: 'SUCCESS'
    }
}

export type WaMexOrgMemberUpdateNotificationHandlerResponse = {
    readonly xwa2_notify_org_on_member_update?: {
        readonly members?: ReadonlyArray<{
            readonly display_last_name?: string
            readonly display_name?: string
            readonly member_action?: 'ADD' | 'REMOVE' | 'UPDATE'
            readonly member_lid?: string
            readonly member_tag?: string
            readonly role?: string
            readonly username?: string
        }>
        readonly org_id?: string
        readonly org_member_updated_ts_usec?: unknown
        readonly phash?: string
    }
}

export type WaMexPaymentsPasskeyHasCredentialResponse = {
    readonly xwa2_payments_passkey_has_credential?: {
        readonly has_passkey?: boolean
    }
}

export type WaMexQueryCatalogResponse = {
    readonly xwa_product_catalog_get_product_catalog?: {
        readonly __typename?: string
        readonly product_catalog?: {
            readonly paging?: {
                readonly after?: string
                readonly before?: string
            }
            readonly products?: ReadonlyArray<{
                readonly belongs_to?: string
                readonly compliance_category?: string
                readonly compliance_info?: {
                    readonly country_code_origin?: string
                    readonly importer_address?: {
                        readonly city?: string
                        readonly country_code?: string
                        readonly postal_code?: string
                        readonly region?: string
                        readonly street1?: string
                        readonly street2?: string
                    }
                    readonly importer_name?: string
                }
                readonly currency?: string
                readonly description?: string
                readonly id?: string
                readonly is_hidden?: boolean
                readonly is_sanctioned?: boolean
                readonly max_available?: number
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
                readonly name?: string
                readonly price?: string
                readonly product_availability?: string
                readonly retailer_id?: string
                readonly sale_price?: {
                    readonly end_date?: string
                    readonly price?: string
                    readonly start_date?: string
                }
                readonly shimmed_url?: string
                readonly status_info?: {
                    readonly can_appeal?: boolean
                    readonly status?: string
                }
                readonly url?: string
                readonly variant_info?: {
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
                    readonly listing_details?: {
                        readonly description?: string
                        readonly lowest_price?: string
                        readonly multi_price?: string
                    }
                    readonly types?: ReadonlyArray<{
                        readonly name?: string
                        readonly options?: ReadonlyArray<{
                            readonly thumbnail_media?: {
                                readonly id?: string
                                readonly original_dimensions?: {
                                    readonly height?: number
                                    readonly width?: number
                                }
                                readonly original_image_url?: string
                                readonly request_image_url?: string
                            }
                            readonly value?: string
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
                readonly belongs_to?: string
                readonly compliance_category?: string
                readonly compliance_info?: {
                    readonly country_code_origin?: string
                    readonly importer_address?: {
                        readonly city?: string
                        readonly country_code?: string
                        readonly postal_code?: string
                        readonly region?: string
                        readonly street1?: string
                        readonly street2?: string
                    }
                    readonly importer_name?: string
                }
                readonly currency?: string
                readonly description?: string
                readonly id?: string
                readonly is_hidden?: boolean
                readonly is_sanctioned?: boolean
                readonly max_available?: number
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
                readonly name?: string
                readonly price?: string
                readonly product_availability?: string
                readonly retailer_id?: string
                readonly sale_price?: {
                    readonly end_date?: string
                    readonly price?: string
                    readonly start_date?: string
                }
                readonly shimmed_url?: string
                readonly status_info?: {
                    readonly can_appeal?: boolean
                    readonly status?: string
                }
                readonly url?: string
                readonly variant_info?: {
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
                    readonly listing_details?: {
                        readonly description?: string
                        readonly lowest_price?: string
                        readonly multi_price?: string
                    }
                    readonly types?: ReadonlyArray<{
                        readonly name?: string
                        readonly options?: ReadonlyArray<{
                            readonly thumbnail_media?: {
                                readonly id?: string
                                readonly original_dimensions?: {
                                    readonly height?: number
                                    readonly width?: number
                                }
                                readonly original_image_url?: string
                                readonly request_image_url?: string
                            }
                            readonly value?: string
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
            readonly products?: ReadonlyArray<{
                readonly belongs_to?: string
                readonly compliance_category?: string
                readonly compliance_info?: {
                    readonly country_code_origin?: string
                    readonly importer_address?: {
                        readonly city?: string
                        readonly country_code?: string
                        readonly postal_code?: string
                        readonly region?: string
                        readonly street1?: string
                        readonly street2?: string
                    }
                    readonly importer_name?: string
                }
                readonly currency?: string
                readonly description?: string
                readonly id?: string
                readonly is_hidden?: boolean
                readonly is_sanctioned?: boolean
                readonly max_available?: number
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
                readonly name?: string
                readonly price?: string
                readonly product_availability?: string
                readonly retailer_id?: string
                readonly sale_price?: {
                    readonly end_date?: string
                    readonly price?: string
                    readonly start_date?: string
                }
                readonly shimmed_url?: string
                readonly status_info?: {
                    readonly can_appeal?: string
                    readonly status?: string
                }
                readonly url?: string
                readonly variant_info?: {
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
                    readonly listing_details?: {
                        readonly description?: string
                        readonly lowest_price?: string
                        readonly multi_price?: string
                    }
                    readonly types?: ReadonlyArray<{
                        readonly name?: string
                        readonly options?: ReadonlyArray<{
                            readonly thumbnail_media?: {
                                readonly id?: string
                                readonly original_dimensions?: {
                                    readonly height?: number
                                    readonly width?: number
                                }
                                readonly original_image_url?: string
                                readonly request_image_url?: string
                            }
                            readonly value?: string
                        }>
                    }>
                    readonly variant_properties?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                }
            }>
            readonly status_info?: {
                readonly can_appeal?: string
                readonly commerce_url?: string
                readonly reject_reason?: string
                readonly status?: string
            }
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
                readonly belongs_to?: string
                readonly compliance_category?: string
                readonly compliance_info?: {
                    readonly country_code_origin?: string
                    readonly importer_address?: {
                        readonly city?: string
                        readonly country_code?: string
                        readonly postal_code?: string
                        readonly region?: string
                        readonly street1?: string
                        readonly street2?: string
                    }
                    readonly importer_name?: string
                }
                readonly currency?: string
                readonly description?: string
                readonly id?: string
                readonly is_hidden?: boolean
                readonly is_sanctioned?: boolean
                readonly max_available?: number
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
                readonly name?: string
                readonly price?: string
                readonly product_availability?: string
                readonly retailer_id?: string
                readonly sale_price?: {
                    readonly end_date?: string
                    readonly price?: string
                    readonly start_date?: string
                }
                readonly shimmed_url?: string
                readonly status_info?: {
                    readonly can_appeal?: boolean
                    readonly status?: string
                }
                readonly url?: string
                readonly variant_info?: {
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
                    readonly listing_details?: {
                        readonly description?: string
                        readonly lowest_price?: string
                        readonly multi_price?: string
                    }
                    readonly types?: ReadonlyArray<{
                        readonly name?: string
                        readonly options?: ReadonlyArray<{
                            readonly thumbnail_media?: {
                                readonly id?: string
                                readonly original_dimensions?: {
                                    readonly height?: number
                                    readonly width?: number
                                }
                                readonly original_image_url?: string
                                readonly request_image_url?: string
                            }
                            readonly value?: string
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
            readonly products?: ReadonlyArray<{
                readonly belongs_to?: string
                readonly compliance_category?: string
                readonly compliance_info?: {
                    readonly country_code_origin?: string
                    readonly importer_address?: {
                        readonly city?: string
                        readonly country_code?: string
                        readonly postal_code?: string
                        readonly region?: string
                        readonly street1?: string
                        readonly street2?: string
                    }
                    readonly importer_name?: string
                }
                readonly currency?: string
                readonly description?: string
                readonly id?: string
                readonly is_hidden?: boolean
                readonly is_sanctioned?: boolean
                readonly max_available?: number
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
                readonly name?: string
                readonly price?: string
                readonly product_availability?: string
                readonly retailer_id?: string
                readonly sale_price?: {
                    readonly end_date?: string
                    readonly price?: string
                    readonly start_date?: string
                }
                readonly shimmed_url?: string
                readonly status_info?: {
                    readonly can_appeal?: string
                    readonly status?: string
                }
                readonly url?: string
                readonly variant_info?: {
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
                    readonly listing_details?: {
                        readonly description?: string
                        readonly lowest_price?: string
                        readonly multi_price?: string
                    }
                    readonly types?: ReadonlyArray<{
                        readonly name?: string
                        readonly options?: ReadonlyArray<{
                            readonly thumbnail_media?: {
                                readonly id?: string
                                readonly original_dimensions?: {
                                    readonly height?: number
                                    readonly width?: number
                                }
                                readonly original_image_url?: string
                                readonly request_image_url?: string
                            }
                            readonly value?: string
                        }>
                    }>
                    readonly variant_properties?: ReadonlyArray<{
                        readonly name?: string
                        readonly value?: string
                    }>
                }
            }>
            readonly status_info?: {
                readonly can_appeal?: string
                readonly commerce_url?: string
                readonly reject_reason?: string
                readonly status?: string
            }
        }
        readonly paging?: {
            readonly after?: string
        }
    }
}

export type WaMexQuerySubgroupParticipantCountResponse = {
    readonly xwa2_group_query_by_id?: {
        readonly __typename?: string
        readonly id?: string
        readonly sub_groups?: {
            readonly edges?: ReadonlyArray<{
                readonly node?: {
                    readonly id?: string
                    readonly total_participants_count?: number
                }
            }>
        }
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

export type WaMexRequestOTEResponse = {
    readonly xwa2_ncm_request_ote?: {
        readonly capping_status?: string
        readonly cycle_end_timestamp?: string
        readonly cycle_start_timestamp?: string
        readonly mv_status?: string
        readonly ote_status?: string
        readonly server_sent_timestamp?: string
        readonly total_quota?: number
        readonly used_quota?: number
    }
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

export type WaMexRotateLabyrinthEpochResponse = {
    readonly wa_labyrinth_rotate_epoch?: {
        readonly __typename?: string
        readonly message?: string
        readonly new_epoch_id?: string
        readonly status?: string
    }
}

export type WaMexSaveResponseTonePreferenceResponse = {
    readonly xfb_maiba_save_response_tone_preference?: {
        readonly __typename?: string
        readonly external_conversation_id?: string
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

export type WaMexSharableEventAddInvitationsResponse = {
    readonly event_add_invitations?: {
        readonly invitation_add_outcome?: {
            readonly failed_count?: number
            readonly invalid_count?: number
            readonly is_retryable?: boolean
            readonly newly_added_lids?: ReadonlyArray<string>
            readonly successful_count?: number
        }
        readonly privacy_aware_invitation?: {
            readonly count_by_rsvp_status?: {
                readonly going?: unknown
                readonly maybe?: unknown
                readonly no_response?: unknown
                readonly not_going?: unknown
            }
            readonly invitation_list?: ReadonlyArray<{
                readonly created_ts_sec?: number
                readonly extra_guest_count?: number
                readonly guest_name?: string
                readonly invitee_lid?: string
                readonly is_wa_user?: boolean
                readonly last_updated_ts_sec?: number
                readonly phone_number?: string
                readonly rsvp_status?: string
                readonly username?: string
            }>
            readonly last_updated_ts_usec?: unknown
            readonly total_invited_count?: number
        }
    }
}

export type WaMexSharableEventCreateResponse = {
    readonly xwa_event_create?: {
        readonly privacy_aware_event?: {
            readonly call_link?: {
                readonly is_waiting_room_enabled?: boolean
                readonly media_type?: string
                readonly token?: string
            }
            readonly cover_image?: {
                readonly is_preset_image?: boolean
                readonly uri?: string
            }
            readonly cover_image_handle?: unknown
            readonly created_ts_sec?: number
            readonly creator_lid?: string
            readonly description?: string
            readonly end_ts_sec?: number
            readonly id?: string
            readonly last_updated_ts_usec?: unknown
            readonly location?: {
                readonly address?: string
                readonly coordinates?: {
                    readonly latitude?: number
                    readonly longitude?: number
                }
                readonly name?: string
                readonly web_url?: string
            }
            readonly max_additional_guests?: number
            readonly name?: string
            readonly reminder_ts_sec?: number
            readonly start_ts_sec?: number
            readonly status?: string
        }
        readonly privacy_aware_invitation?: {
            readonly count_by_rsvp_status?: {
                readonly going?: unknown
                readonly maybe?: unknown
                readonly no_response?: unknown
                readonly not_going?: unknown
            }
            readonly invitation_list?: ReadonlyArray<{
                readonly created_ts_sec?: number
                readonly extra_guest_count?: number
                readonly guest_name?: string
                readonly invitee_lid?: string
                readonly is_wa_user?: boolean
                readonly last_updated_ts_sec?: number
                readonly phone_number?: string
                readonly rsvp_status?: string
                readonly username?: string
            }>
            readonly last_updated_ts_usec?: unknown
            readonly total_invited_count?: number
        }
    }
}

export type WaMexSharableEventDeleteResponse = {
    readonly xwa_event_delete?: {
        readonly success?: boolean
    }
}

export type WaMexSharableEventGetResponse = {
    readonly xwa_event_get?: {
        readonly is_event_metadata_unchanged?: boolean
        readonly is_invitation_metadata_unchanged?: boolean
        readonly privacy_aware_event?: {
            readonly call_link?: {
                readonly is_waiting_room_enabled?: boolean
                readonly media_type?: string
                readonly token?: string
            }
            readonly cover_image?: {
                readonly is_preset_image?: boolean
                readonly uri?: string
            }
            readonly cover_image_handle?: unknown
            readonly created_ts_sec?: number
            readonly creator_lid?: string
            readonly description?: string
            readonly end_ts_sec?: number
            readonly id?: string
            readonly last_updated_ts_usec?: unknown
            readonly location?: {
                readonly address?: string
                readonly coordinates?: {
                    readonly latitude?: number
                    readonly longitude?: number
                }
                readonly name?: string
                readonly web_url?: string
            }
            readonly max_additional_guests?: number
            readonly name?: string
            readonly reminder_ts_sec?: number
            readonly start_ts_sec?: number
            readonly status?: string
        }
        readonly privacy_aware_invitation?: {
            readonly count_by_rsvp_status?: {
                readonly going?: unknown
                readonly maybe?: unknown
                readonly no_response?: unknown
                readonly not_going?: unknown
            }
            readonly invitation_list?: ReadonlyArray<{
                readonly created_ts_sec?: number
                readonly extra_guest_count?: number
                readonly guest_name?: string
                readonly invitee_lid?: string
                readonly is_wa_user?: boolean
                readonly last_updated_ts_sec?: number
                readonly phone_number?: string
                readonly rsvp_status?: string
                readonly username?: string
            }>
            readonly last_updated_ts_usec?: unknown
            readonly total_invited_count?: number
        }
    }
}

export type WaMexSharableEventGuestJoinedWaNotificationsResponse = {
    readonly xwa2_notify_event_on_guest_joined_wa?: {
        readonly event_id?: string
        readonly event_name?: string
        readonly guest_lid?: string
        readonly is_user_visible?: boolean
        readonly pn?: string
        readonly username?: string
    }
}

export type WaMexSharableEventInviteLinkJobGetOrCreateResponse = {
    readonly xwa_event_get_or_create_invite_link?: {
        readonly link_token?: string
    }
}

export type WaMexSharableEventInviteLinkJobInvalidateResponse = {
    readonly xwa_event_invalidate_invite_link?: {
        readonly success?: boolean
    }
}

export type WaMexSharableEventInviteLinkJobRotateResponse = {
    readonly xwa_event_rotate_invite_link?: {
        readonly link_token?: string
    }
}

export type WaMexSharableEventJoinViaLinkResponse = {
    readonly xwa_event_join_via_link?: {
        readonly privacy_aware_event?: {
            readonly call_link?: {
                readonly is_waiting_room_enabled?: boolean
                readonly media_type?: string
                readonly token?: string
            }
            readonly cover_image?: {
                readonly is_preset_image?: boolean
                readonly uri?: string
            }
            readonly cover_image_handle?: unknown
            readonly created_ts_sec?: number
            readonly creator_lid?: string
            readonly description?: string
            readonly end_ts_sec?: number
            readonly id?: string
            readonly last_updated_ts_usec?: unknown
            readonly location?: {
                readonly address?: string
                readonly coordinates?: {
                    readonly latitude?: number
                    readonly longitude?: number
                }
                readonly name?: string
                readonly web_url?: string
            }
            readonly max_additional_guests?: number
            readonly name?: string
            readonly reminder_ts_sec?: number
            readonly start_ts_sec?: number
            readonly status?: string
        }
        readonly privacy_aware_invitation?: {
            readonly count_by_rsvp_status?: {
                readonly going?: unknown
                readonly maybe?: unknown
                readonly no_response?: unknown
                readonly not_going?: unknown
            }
            readonly invitation_list?: ReadonlyArray<{
                readonly created_ts_sec?: number
                readonly extra_guest_count?: number
                readonly guest_name?: string
                readonly invitee_lid?: string
                readonly is_wa_user?: boolean
                readonly last_updated_ts_sec?: number
                readonly phone_number?: string
                readonly rsvp_status?: string
                readonly username?: string
            }>
            readonly last_updated_ts_usec?: unknown
            readonly total_invited_count?: number
        }
    }
}

export type WaMexSharableEventLeaveResponse = {
    readonly xwa_event_remove_self_invitation?: {
        readonly success?: boolean
    }
}

export type WaMexSharableEventLinkPreviewResponse = {
    readonly xwa_event_get_link_preview?: {
        readonly creator_pushname?: string
        readonly privacy_aware_event?: {
            readonly call_link?: {
                readonly is_waiting_room_enabled?: boolean
                readonly media_type?: string
                readonly token?: string
            }
            readonly cover_image?: {
                readonly is_preset_image?: boolean
                readonly uri?: string
            }
            readonly cover_image_handle?: unknown
            readonly created_ts_sec?: number
            readonly creator_lid?: string
            readonly description?: string
            readonly end_ts_sec?: number
            readonly id?: string
            readonly last_updated_ts_usec?: unknown
            readonly location?: {
                readonly address?: string
                readonly coordinates?: {
                    readonly latitude?: number
                    readonly longitude?: number
                }
                readonly name?: string
                readonly web_url?: string
            }
            readonly max_additional_guests?: number
            readonly name?: string
            readonly region?: string
            readonly reminder_ts_sec?: number
            readonly start_ts_sec?: number
            readonly status?: string
        }
        readonly privacy_aware_invitation?: {
            readonly count_by_rsvp_status?: {
                readonly going?: unknown
                readonly maybe?: unknown
                readonly no_response?: unknown
                readonly not_going?: unknown
            }
            readonly invitation_list?: ReadonlyArray<{
                readonly created_ts_sec?: number
                readonly extra_guest_count?: number
                readonly guest_name?: string
                readonly invitee_lid?: string
                readonly is_wa_user?: boolean
                readonly last_updated_ts_sec?: number
                readonly phone_number?: string
                readonly rsvp_status?: string
                readonly username?: string
            }>
            readonly last_updated_ts_usec?: unknown
            readonly total_invited_count?: number
        }
        readonly privacy_aware_my_invitation?: {
            readonly __typename?: string
        }
    }
}

export type WaMexSharableEventListResponse = {
    readonly xwa_event_list?: {
        readonly past?: ReadonlyArray<{
            readonly privacy_aware_event?: {
                readonly call_link?: {
                    readonly is_waiting_room_enabled?: boolean
                    readonly media_type?: string
                    readonly token?: string
                }
                readonly cover_image?: {
                    readonly is_preset_image?: boolean
                    readonly uri?: string
                }
                readonly cover_image_handle?: unknown
                readonly created_ts_sec?: number
                readonly creator_lid?: string
                readonly description?: string
                readonly end_ts_sec?: number
                readonly id?: string
                readonly last_updated_ts_usec?: unknown
                readonly location?: {
                    readonly address?: string
                    readonly coordinates?: {
                        readonly latitude?: number
                        readonly longitude?: number
                    }
                    readonly name?: string
                    readonly web_url?: string
                }
                readonly max_additional_guests?: number
                readonly name?: string
                readonly reminder_ts_sec?: number
                readonly start_ts_sec?: number
                readonly status?: string
            }
            readonly privacy_aware_my_invitation?: {
                readonly created_ts_sec?: number
                readonly extra_guest_count?: number
                readonly guest_name?: string
                readonly invitee_lid?: string
                readonly is_wa_user?: boolean
                readonly last_updated_ts_sec?: number
                readonly phone_number?: string
                readonly rsvp_status?: string
                readonly username?: string
            }
        }>
        readonly scheduled_calls?: ReadonlyArray<{
            readonly privacy_aware_event?: {
                readonly call_link?: {
                    readonly is_waiting_room_enabled?: boolean
                    readonly media_type?: string
                    readonly token?: string
                }
                readonly cover_image?: {
                    readonly is_preset_image?: boolean
                    readonly uri?: string
                }
                readonly cover_image_handle?: unknown
                readonly created_ts_sec?: number
                readonly creator_lid?: string
                readonly description?: string
                readonly end_ts_sec?: number
                readonly id?: string
                readonly last_updated_ts_usec?: unknown
                readonly location?: {
                    readonly address?: string
                    readonly coordinates?: {
                        readonly latitude?: number
                        readonly longitude?: number
                    }
                    readonly name?: string
                    readonly web_url?: string
                }
                readonly max_additional_guests?: number
                readonly name?: string
                readonly reminder_ts_sec?: number
                readonly start_ts_sec?: number
                readonly status?: string
            }
            readonly privacy_aware_my_invitation?: {
                readonly created_ts_sec?: number
                readonly extra_guest_count?: number
                readonly guest_name?: string
                readonly invitee_lid?: string
                readonly is_wa_user?: boolean
                readonly last_updated_ts_sec?: number
                readonly phone_number?: string
                readonly rsvp_status?: string
                readonly username?: string
            }
        }>
        readonly upcoming?: ReadonlyArray<{
            readonly privacy_aware_event?: {
                readonly call_link?: {
                    readonly is_waiting_room_enabled?: boolean
                    readonly media_type?: string
                    readonly token?: string
                }
                readonly cover_image?: {
                    readonly is_preset_image?: boolean
                    readonly uri?: string
                }
                readonly cover_image_handle?: unknown
                readonly created_ts_sec?: number
                readonly creator_lid?: string
                readonly description?: string
                readonly end_ts_sec?: number
                readonly id?: string
                readonly last_updated_ts_usec?: unknown
                readonly location?: {
                    readonly address?: string
                    readonly coordinates?: {
                        readonly latitude?: number
                        readonly longitude?: number
                    }
                    readonly name?: string
                    readonly web_url?: string
                }
                readonly max_additional_guests?: number
                readonly name?: string
                readonly reminder_ts_sec?: number
                readonly start_ts_sec?: number
                readonly status?: string
            }
            readonly privacy_aware_my_invitation?: {
                readonly created_ts_sec?: number
                readonly extra_guest_count?: number
                readonly guest_name?: string
                readonly invitee_lid?: string
                readonly is_wa_user?: boolean
                readonly last_updated_ts_sec?: number
                readonly phone_number?: string
                readonly rsvp_status?: string
                readonly username?: string
            }
        }>
    }
}

export type WaMexSharableEventPlaceSearchResponse = {
    readonly whatsapp_maps_typeahead?: {
        readonly items?: ReadonlyArray<{
            readonly address?: {
                readonly city?: string
                readonly stateprovince?: string
                readonly streetaddress?: string
            }
            readonly id?: string
            readonly location?: {
                readonly latitude?: number
                readonly longitude?: number
            }
            readonly title?: string
        }>
    }
}

export type WaMexSharableEventPresetCoversResponse = {
    readonly xwa_event_list_preset_cover_images?: {
        readonly preset_images?: ReadonlyArray<{
            readonly category?: string
            readonly cover_image?: {
                readonly uri?: string
            }
            readonly cover_image_handle?: unknown
            readonly display_order?: number
        }>
    }
}

export type WaMexSharableEventReconcileResponse = {
    readonly xwa_event_validate_cached_event_ids?: {
        readonly retained_event_ids?: ReadonlyArray<string>
    }
}

export type WaMexSharableEventRemoveInvitationsResponse = {
    readonly xwa_event_remove_invitations?: {
        readonly privacy_aware_invitation?: {
            readonly count_by_rsvp_status?: {
                readonly going?: unknown
                readonly maybe?: unknown
                readonly no_response?: unknown
                readonly not_going?: unknown
            }
            readonly invitation_list?: ReadonlyArray<{
                readonly created_ts_sec?: number
                readonly extra_guest_count?: number
                readonly guest_name?: string
                readonly invitee_lid?: string
                readonly is_wa_user?: boolean
                readonly last_updated_ts_sec?: number
                readonly phone_number?: string
                readonly rsvp_status?: string
                readonly username?: string
            }>
            readonly last_updated_ts_usec?: unknown
            readonly total_invited_count?: number
        }
    }
}

export type WaMexSharableEventUpdateResponse = {
    readonly xwa_event_update?: {
        readonly privacy_aware_event?: {
            readonly call_link?: {
                readonly is_waiting_room_enabled?: boolean
                readonly media_type?: string
                readonly token?: string
            }
            readonly cover_image?: {
                readonly is_preset_image?: boolean
                readonly uri?: string
            }
            readonly cover_image_handle?: unknown
            readonly created_ts_sec?: number
            readonly creator_lid?: string
            readonly description?: string
            readonly end_ts_sec?: number
            readonly id?: string
            readonly last_updated_ts_usec?: unknown
            readonly location?: {
                readonly address?: string
                readonly coordinates?: {
                    readonly latitude?: number
                    readonly longitude?: number
                }
                readonly name?: string
                readonly web_url?: string
            }
            readonly max_additional_guests?: number
            readonly name?: string
            readonly reminder_ts_sec?: number
            readonly start_ts_sec?: number
            readonly status?: string
        }
    }
}

export type WaMexSharableEventUpdateRsvpResponse = {
    readonly event_update_rsvp?: {
        readonly privacy_aware_invitation?: {
            readonly count_by_rsvp_status?: {
                readonly going?: unknown
                readonly maybe?: unknown
                readonly no_response?: unknown
                readonly not_going?: unknown
            }
            readonly invitation_list?: ReadonlyArray<{
                readonly created_ts_sec?: number
                readonly extra_guest_count?: number
                readonly guest_name?: string
                readonly invitee_lid?: string
                readonly is_wa_user?: boolean
                readonly last_updated_ts_sec?: number
                readonly phone_number?: string
                readonly rsvp_status?: string
                readonly username?: string
            }>
            readonly last_updated_ts_usec?: unknown
            readonly total_invited_count?: number
        }
    }
}

export type WaMexSignupMetadataResponse = {
    readonly wa_signup_metadata?: {
        readonly id?: string
        readonly privacy_policy_url?: string
        readonly signup_message?: string
    }
}

export type WaMexSkipStoppedMessagesResponse = {
    readonly xfb_maiba_exclude_stopped_messages?: {
        readonly __typename?: string
        readonly external_conversation_id?: string
        readonly id?: string
        readonly stopped_response_ids?: ReadonlyArray<string>
    }
}

export type WaMexStartConversationTemplateReengagementWithCatalogSectionResponse = {
    readonly page?: {
        readonly id?: string
        readonly smc_product_catalog?: {
            readonly ad_catalog_id?: string
            readonly catalog_info?: {
                readonly catalog_id?: string
            }
        }
    }
}

export type WaMexStartConversationsTemplateCustomerActionsSectionIsEligibleForAIRegenerationResponse = {
    readonly ad_account?: {
        readonly id?: string
        readonly is_eligible_for_ai_regeneration?: boolean
    }
}

export type WaMexStartConversationsTemplateDialogContainerBodyGraphQLWelcomeMessageFlowsResponse = {
    readonly tooltipPages?: ReadonlyArray<{
        readonly __typename?: string
        readonly id?: string
        readonly inbox_faq_automation?: {
            readonly automation_id?: string
            readonly eligible_faq_response_pairs?: ReadonlyArray<{
                readonly __typename?: string
            }>
            readonly skipped_faq_with_media_or_button?: boolean
        }
        readonly messenger_ads_default_icebreakers?: unknown
    }>
    readonly welcome_message_flows?: {
        readonly has_welcome_message_flows?: boolean
    }
}

export type WaMexStartConversationsTemplateFAQGenAIRegenerationResponse = {
    readonly xfb_get_ai_regenerated_icebreaker_automated_response?: {
        readonly ai_regeneration_id?: string
        readonly icebreaker?: {
            readonly response?: string
            readonly title?: string
        }
    }
}

export type WaMexSubscriptionWaffleAgeCheckResponse = {
    readonly pass_age_check_for_wa_meta_one_v2?: string
}

export type WaMexSupportBugReportCreateDogfoodingTaskResponse = {
    readonly wa_support_bug_report_create_dogfooding_task?: {
        readonly error_code?: number
        readonly error_message?: string
        readonly success?: boolean
        readonly task_id?: string
    }
}

export type WaMexSupportBugReportSubmitResponse = {
    readonly xwa_wa_support_bug_report_submit?: {
        readonly bug_report_id?: string
        readonly error_code?: number
        readonly error_message?: string
        readonly success?: boolean
        readonly task_id?: string
    }
}

export type WaMexSupportChatAuthRefreshResponse = {
    readonly xwa_wa_support_chat_auth_refresh?: {
        readonly status?: string
    }
}

export type WaMexSupportContactFormSubmitResponse = {
    readonly xwa_wa_support_contact_form_submit?: {
        readonly error_code?: number
        readonly error_message?: string
        readonly success?: boolean
        readonly support_phone_number_jid?: string
        readonly ticket_id?: string
    }
}

export type WaMexSupportMessageFeedbackSubmitResponse = {
    readonly xwa_wa_support_message_feedback_submit?: {
        readonly error_code?: number
        readonly error_message?: string
        readonly success?: boolean
    }
}

export type WaMexTeamLinkCreateInvitationResponse = {
    readonly whatsapp_teamlink_create_agent_invitation?: {
        readonly employee_lid?: string
        readonly employee_name?: string
        readonly expires_at?: string
        readonly invitation_status?: string
        readonly nonce_code?: string
        readonly team_role?: string
    }
}

export type WaMexTeamLinkListInvitationsResponse = {
    readonly whatsapp_teamlink_list_agent_invitations?: ReadonlyArray<{
        readonly employee_lid?: string
        readonly employee_name?: string
        readonly expires_at?: string
        readonly invitation_status?: string
        readonly nonce_code?: string
        readonly team_role?: string
    }>
}

export type WaMexTeamLinkRemoveInvitationResponse = {
    readonly whatsapp_teamlink_remove_agent_invitation?: {
        readonly removed?: boolean
        readonly was_onboarded?: boolean
    }
}

export type WaMexTeamLinkUpdateAgentRoleResponse = {
    readonly whatsapp_teamlink_update_agent_role?: {
        readonly employee?: {
            readonly employee_lid?: string
        }
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
            readonly creation_time?: string
            readonly description?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly handle?: string
            readonly invite?: string
            readonly name?: {
                readonly id?: string
                readonly text?: string
                readonly update_time?: string
            }
            readonly picture?: {
                readonly direct_path?: string
                readonly id?: string
                readonly type?: 'IMAGE' | 'PREVIEW'
            }
            readonly preview?: {
                readonly direct_path?: string
                readonly id?: string
                readonly type?: 'PREVIEW'
            }
            readonly settings?: {
                readonly reaction_codes?: {
                    readonly value?: 'ALL'
                }
            }
            readonly verification?: 'UNVERIFIED' | 'VERIFIED'
        }
    }
}

export type WaMexUpdateNewsletterAdminProfileResponse = {
    readonly xwa2_newsletter_admin_profile_update?: {
        readonly admin_profile?: {
            readonly id?: string
            readonly name?: string
            readonly picture?: {
                readonly direct_path?: string
                readonly id?: string
            }
        }
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
        }
    }
}

export type WaMexUpdateNewsletterAdminProfileSettingResponse = {
    readonly xwa2_newsletter_update?: {
        readonly id?: string
        readonly state?: {
            readonly type?: 'ACTIVE' | 'DELETED' | 'GEOSUSPENDED' | 'NON_EXISTING' | 'SUSPENDED'
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

export type WaMexUploadLabyrinthMessagesResponse = {
    readonly wa_labyrinth_upload_messages?: {
        readonly __typename?: string
        readonly message?: string
        readonly results?: ReadonlyArray<{
            readonly error?: boolean
            readonly offline_threading_id?: string
            readonly success?: boolean
        }>
        readonly status?: string
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
        readonly country_code?: string
        readonly id?: string
        readonly jid?: string
        readonly orgs_info?: {
            readonly __typename?: string
            readonly orgs?: ReadonlyArray<{
                readonly display_last_name?: string
                readonly display_name?: string
                readonly member_tag?: string
                readonly org_id?: string
                readonly role?: string
            }>
            readonly status?: string
        }
        readonly username_info?: {
            readonly __typename?: string
            readonly pin?: string
            readonly state?: string
            readonly status?: 'NO_CHANGE'
            readonly timestamp?: string
            readonly username?: string
        }
    }>
}

export type WaMexWAAOnboardingResponse = {
    readonly create_or_onboard_wa_ad_account?: {
        readonly ad_account_id?: string
        readonly status?: string
    }
}

export type WaMexWAMFlowsCTWAEditorModalResponse = {
    readonly flow?: {
        readonly id?: string
        readonly status?: string
        readonly welj?: unknown
    }
    readonly flowJSON?: unknown
}

export type WaMexWAMFlowsCTWAFlowPreviewResponse = {
    readonly flow?: {
        readonly id?: string
        readonly welj?: string
    }
    readonly flowJSON?: unknown
}

export type WaMexWODirectoryFetchCompanyNameResponse = {
    readonly xwa_whatsapp_for_work_employee_directory_member?: {
        readonly company_name?: string
        readonly id?: string
    }
}

export type WaMexWaffleFXServiceDataQueryV2Response = {
    readonly waffle_fx_service_data?: {
        readonly services?: {
            readonly foa_to_wa_link_eligibility?: {
                readonly is_eligible_to_link_to_linked_fb?: boolean
                readonly is_eligible_to_link_to_linked_ig?: boolean
                readonly is_eligible_to_link_to_linked_rl?: boolean
                readonly is_eligible_to_link_to_unlinked_fb?: boolean
                readonly is_eligible_to_link_to_unlinked_ig?: boolean
                readonly is_eligible_to_link_to_unlinked_rl?: boolean
            }
            readonly waffle_afs?: {
                readonly waffle_wes?: string
            }
            readonly waffle_sxs?: ReadonlyArray<{
                readonly waffle_da?: string
                readonly waffle_di?: string
                readonly waffle_xss?: ReadonlyArray<{
                    readonly waffle_iaxe?: string
                    readonly waffle_x_surface?: string
                }>
            }>
        }
    }
}

export type WaMexWaffleFXWAMOUpdateUOOMResponse = {
    readonly xfb_waffle_fx_wamo_update_uoom?: boolean
}

export type WaMexWaffleXEResponse = {
    readonly waffle_xe_root?: {
        readonly purpose_public_keys?: {
            readonly purpose_dummy_ciphertext?: string
            readonly purpose_dummy_nonce?: string
            readonly purpose_public_ek?: string
            readonly purpose_public_ik?: string
            readonly purpose_public_ik_enc_certificate?: string
            readonly purpose_public_ik_sig?: string
        }
        readonly waffle_d?: ReadonlyArray<{
            readonly waffle_di?: string
            readonly waffle_xas?: {
                readonly waffle_xan?: string
                readonly waffle_xs?: string
            }
        }>
        readonly waffle_unique_ids?: string
        readonly waffle_xps?: ReadonlyArray<{
            readonly waffle_hcbc?: string
            readonly waffle_xas?: {
                readonly waffle_xan?: string
                readonly waffle_xs?: string
            }
        }>
    }
}

export type WaMexWhatsAppMarketingCampaignCustomerListPickerListsResponse = {
    readonly whatsAppBusinessAccount?: {
        readonly default_subscriber_pool_subscriber_lists?: {
            readonly nodes?: ReadonlyArray<{
                readonly approximate_count?: number
                readonly audience_size_range?: {
                    readonly lower_bound?: number
                    readonly upper_bound?: number
                }
                readonly id?: string
                readonly name?: string
                readonly operation_status?: {
                    readonly status_code?: 'CA_INTEGRITY_SENSITIVE_DATA_RESTRICTION'
                }
            }>
        }
        readonly id?: string
    }
}

export type WaMexfetchWebsiteMediaImageURLsResponse = {
    readonly xfb_creative_metadata_website_media_fields?: {
        readonly media?: ReadonlyArray<{
            readonly background_clean?: unknown
            readonly background_color?: string
            readonly cluster_index?: number
            readonly fanout_link?: unknown
            readonly has_human_face?: boolean
            readonly image_asset_fbid?: string
            readonly image_blurry?: unknown
            readonly image_description?: string
            readonly image_hash?: string
            readonly image_height?: number
            readonly image_phash?: string
            readonly image_sources?: unknown
            readonly image_title?: string
            readonly image_url?: string
            readonly image_width?: number
            readonly is_guardrail_pass?: boolean
            readonly is_human_and_product?: boolean
            readonly is_human_and_service?: boolean
            readonly is_icon?: boolean
            readonly is_illustration?: boolean
            readonly is_immersive_product?: boolean
            readonly is_landscape?: boolean
            readonly is_logo?: boolean
            readonly is_og_image?: boolean
            readonly is_photo_collage?: boolean
            readonly is_poster?: boolean
            readonly is_product_focus?: boolean
            readonly is_text_wall?: boolean
            readonly text_heavy?: unknown
            readonly user_sentiment?: unknown
        }>
    }
}

export type WaMexnavigateToProductInsightsWithDefaultTabResponse = {
    readonly default_tab?: unknown
}

export type WaMexuseFetchAdAccountsForL4ContextResponse = {
    readonly custom_analytics_business?: {
        readonly custom_analytics_onboarding?: {
            readonly ad_accounts?: ReadonlyArray<{
                readonly currency?: string
                readonly id?: string
                readonly legacy_account_id?: string
                readonly name?: string
            }>
            readonly id?: string
        }
        readonly id?: string
    }
    readonly lwi?: {
        readonly default_ad_account?: {
            readonly currency?: string
            readonly id?: string
            readonly legacy_account_id?: string
            readonly name?: string
        }
    }
    readonly maiba_ad_accounts?: {
        readonly edges?: ReadonlyArray<{
            readonly node?: {
                readonly account_status?: string
                readonly currency?: string
                readonly legacy_account_id?: string
                readonly name?: string
            }
        }>
    }
    readonly maiba_viewer?: {
        readonly maiba_thread_linked_account_ids?: {
            readonly nodes?: unknown
        }
    }
}

export type WaMexuseFetchAdAccountsNameByIdResponse = {
    readonly maiba_ad_account?: {
        readonly account_status?: string
        readonly currency?: string
        readonly name?: string
    }
}

export type WaMexuseFlowJSONValidationLibraryResponse = {
    readonly xfb_wa_flows_is_json_version_accessible?: unknown
}

export type WaMexuseIsMessengerPlatformBotResponse = {
    readonly node?: {
        readonly __typename?: string
        readonly id?: string
        readonly is_messenger_platform_bot?: boolean
    }
}

export type WaMexuseMAIBAAsyncNotificationResponse = {
    readonly xfb_maiba_update_thread_unread_status?: {
        readonly conversation?: {
            readonly __typename?: string
            readonly id?: string
        }
    }
}

export type WaMexuseMAIBAMediaResponse = {
    readonly nodes?: ReadonlyArray<{
        readonly __typename?: string
        readonly ad_campaigns?: {
            readonly nodes?: ReadonlyArray<{
                readonly adgroups?: {
                    readonly nodes?: ReadonlyArray<{
                        readonly creative?: {
                            readonly id?: string
                            readonly thumbnail_url?: string
                        }
                        readonly id?: string
                    }>
                }
                readonly id?: string
            }>
        }
        readonly adgroups?: {
            readonly nodes?: ReadonlyArray<{
                readonly creative?: {
                    readonly id?: string
                    readonly thumbnail_url?: string
                }
                readonly id?: string
            }>
        }
        readonly creative?: {
            readonly id?: string
            readonly thumbnail_url?: string
        }
        readonly id?: string
    }>
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
    readonly whatsapp_ctwa_preflight_forecast?: {
        readonly estimated_daily_impressions?: {
            readonly lower_bound?: number
            readonly upper_bound?: number
        }
    }
}

export type WaMexuseWAWebEstimatedDailyReachShadowResponse = {
    readonly whatsapp_ctwa_preflight_forecast?: {
        readonly __typename?: string
    }
}

export type WaMexuseWAWebSmartComposerCoachSuggestedReplyResponse = {
    readonly xfb_meta_ai_biz_agent_wa_coach_suggested_reply?: {
        readonly success?: boolean
    }
}

export type WaMexuseWAWebSmartComposerReportThreadEventResponse = {
    readonly meta_ai_biz_agent_wa_suggested_reply_thread_event?: {
        readonly success?: boolean
    }
}

export type WaMexuseWAWebSmartComposerReportUsedResponse = {
    readonly meta_ai_biz_agent_wa_suggested_reply_used?: {
        readonly success?: boolean
    }
}

export interface WaMexOperationResponses {
    readonly ACSServerProviderConfig: WaMexACSServerProviderConfigResponse
    readonly ACSServerProviderIssuance: WaMexACSServerProviderIssuanceResponse
    readonly AECompanionOffboard: WaMexAECompanionOffboardResponse
    readonly AECompanionOnboard: WaMexAECompanionOnboardResponse
    readonly AcceptNewsletterAdminInvite: WaMexAcceptNewsletterAdminInviteResponse
    readonly AccountLinkingAPIGetCerts: WaMexAccountLinkingAPIGetCertsResponse
    readonly AdAccountDpaEligibleProductCatalogListStoreSource: WaMexAdAccountDpaEligibleProductCatalogListStoreSourceResponse
    readonly AdPreferencesDFCABusinessOptOut: WaMexAdPreferencesDFCABusinessOptOutResponse
    readonly AdPreferencesDemographicCategoryOptOut: WaMexAdPreferencesDemographicCategoryOptOutResponse
    readonly AdPreferencesHideAdvertiser: WaMexAdPreferencesHideAdvertiserResponse
    readonly AdPreferencesInterestCategoryOptOut: WaMexAdPreferencesInterestCategoryOptOutResponse
    readonly AddLabyrinthPeerDevice: WaMexAddLabyrinthPeerDeviceResponse
    readonly AdsAccountDataDispatcher: WaMexAdsAccountDataDispatcherResponse
    readonly AdsAccountDataDispatcherViewerPermissions: WaMexAdsAccountDataDispatcherViewerPermissionsResponse
    readonly AdsAccountStoreNewSourceServer: WaMexAdsAccountStoreNewSourceServerResponse
    readonly AdsAdAccountSettingsStoreSetAPlusCFeatureStickyStatus: WaMexAdsAdAccountSettingsStoreSetAPlusCFeatureStickyStatusResponse
    readonly AdsAdAccountSettingsStoreSetL1AESourceStickyStatus: WaMexAdsAdAccountSettingsStoreSetL1AESourceStickyStatusResponse
    readonly AdsAdAccountSettingsStoreSetMultiMediaStickyStatus: WaMexAdsAdAccountSettingsStoreSetMultiMediaStickyStatusResponse
    readonly AdsAdAccountSettingsStoreSetVideoOptimizationStickyStatus: WaMexAdsAdAccountSettingsStoreSetVideoOptimizationStickyStatusResponse
    readonly AdsAdAccountSettingsStoreSourceServer: WaMexAdsAdAccountSettingsStoreSourceServerResponse
    readonly AdsBulkEditCampaignGroupAgencyFeeBulkContainer: WaMexAdsBulkEditCampaignGroupAgencyFeeBulkContainerResponse
    readonly AdsBulkEditCampaignGroupAgencyFeeContainerAdAccountAgencyFee: WaMexAdsBulkEditCampaignGroupAgencyFeeContainerAdAccountAgencyFeeResponse
    readonly AdsBulkEditCampaignGroupBudgetFieldContainer_: WaMexAdsBulkEditCampaignGroupBudgetFieldContainer_Response
    readonly AdsBusinessWhatsAppBusinessAccountProviderPluginBSP: WaMexAdsBusinessWhatsAppBusinessAccountProviderPluginBSPResponse
    readonly AdsFocusFrameworkStickinessDataManager: WaMexAdsFocusFrameworkStickinessDataManagerResponse
    readonly AdsInstagramAccountMediaListRIStoreSourceServer: WaMexAdsInstagramAccountMediaListRIStoreSourceServerResponse
    readonly AdsManagerLiveDataCampaign: WaMexAdsManagerLiveDataCampaignResponse
    readonly AdsManagerLiveDataCampaignQueryPreloadingConfigNoSpecs: WaMexAdsManagerLiveDataCampaignQueryPreloadingConfigNoSpecsResponse
    readonly AdsPLRAlphaBetaCheckUtilLogEntryPointExposure: WaMexAdsPLRAlphaBetaCheckUtilLogEntryPointExposureResponse
    readonly AdsUEditorAdgroupBrandedContentWAPreviewWrapper_: WaMexAdsUEditorAdgroupBrandedContentWAPreviewWrapper_Response
    readonly AdsUEditorAdgroupMessageDestinationPageCategory: WaMexAdsUEditorAdgroupMessageDestinationPageCategoryResponse
    readonly AdsUEditorAdgroupMessageDestinationPreviewContainerCTWAWaba: WaMexAdsUEditorAdgroupMessageDestinationPreviewContainerCTWAWabaResponse
    readonly AdsUEditorAdgroupPartnershipAdsStatusVerifiedIdentities_: WaMexAdsUEditorAdgroupPartnershipAdsStatusVerifiedIdentities_Response
    readonly AdvertiserProfileMessageMarketingDataStoreLoader: WaMexAdvertiserProfileMessageMarketingDataStoreLoaderResponse
    readonly AiAgentAutoReplyControl: WaMexAiAgentAutoReplyControlResponse
    readonly AuthAgentFeaturePolicy: WaMexAuthAgentFeaturePolicyResponse
    readonly BPAccessTokenAndSessionCookies: WaMexBPAccessTokenAndSessionCookiesResponse
    readonly BizCreateOrder: WaMexBizCreateOrderResponse
    readonly BizGetCategories: WaMexBizGetCategoriesResponse
    readonly BizGetCategoriesV2: WaMexBizGetCategoriesV2Response
    readonly BizGetCustomUrlUserGraphql: WaMexBizGetCustomUrlUserGraphqlResponse
    readonly BizGetMerchantCompliance: WaMexBizGetMerchantComplianceResponse
    readonly BizGetPriceTiers: WaMexBizGetPriceTiersResponse
    readonly BizGetProfileShimlinks: WaMexBizGetProfileShimlinksResponse
    readonly BizGraphQLRefreshCart: WaMexBizGraphQLRefreshCartResponse
    readonly BizProfileAddressAutocomplete: WaMexBizProfileAddressAutocompleteResponse
    readonly BizProfileRoot: WaMexBizProfileRootResponse
    readonly BizQueryOrder: WaMexBizQueryOrderResponse
    readonly BizSetMerchantCompliance: WaMexBizSetMerchantComplianceResponse
    readonly BrResolvePaymentAccountLink: WaMexBrResolvePaymentAccountLinkResponse
    readonly CTXChatBuilderDialogContainerUtils: WaMexCTXChatBuilderDialogContainerUtilsResponse
    readonly CTXChatBuilderWAFlowsUtilsWAMFlowsCTWAEditorModal: WaMexCTXChatBuilderWAFlowsUtilsWAMFlowsCTWAEditorModalResponse
    readonly CachedToken: WaMexCachedTokenResponse
    readonly CanonicalUserValid: WaMexCanonicalUserValidResponse
    readonly ChangeNewsletterOwner: WaMexChangeNewsletterOwnerResponse
    readonly ClientEdgeQuery_AdsBulkEditAdgroupAgenticCheckoutOptInPlugin_Query_selected_ad_account__shops_ads_identity_product_catalog: WaMexClientEdgeQuery_AdsBulkEditAdgroupAgenticCheckoutOptInPlugin_Query_selected_ad_account__shops_ads_identity_product_catalogResponse
    readonly ClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_combined_campaign_group__product_catalog: WaMexClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_combined_campaign_group__product_catalogResponse
    readonly ClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_creative__product_set__product_catalog: WaMexClientEdgeQuery_AdsBulkEditAgenticCheckoutOptInFieldContentContainer_adgroups_creative__product_set__product_catalogResponse
    readonly CoexCanonicalState: WaMexCoexCanonicalStateResponse
    readonly ConsumerFetchQuickPromotions: WaMexConsumerFetchQuickPromotionsResponse
    readonly ConsumerQuickPromotionActionGraphQL: WaMexConsumerQuickPromotionActionGraphQLResponse
    readonly ContactManagerCustomerProfile: WaMexContactManagerCustomerProfileResponse
    readonly ContactManagerCustomerProfileDelete: WaMexContactManagerCustomerProfileDeleteResponse
    readonly ContactManagerCustomerProfileUpsert: WaMexContactManagerCustomerProfileUpsertResponse
    readonly ContactManagerCustomerProfiles: WaMexContactManagerCustomerProfilesResponse
    readonly CreateEnforcementAppeal: WaMexCreateEnforcementAppealResponse
    readonly CreateInviteCode: WaMexCreateInviteCodeResponse
    readonly CreateLabyrinthBackup: WaMexCreateLabyrinthBackupResponse
    readonly CreateMarketingCampaignAction: WaMexCreateMarketingCampaignActionResponse
    readonly CreateNewsletter: WaMexCreateNewsletterResponse
    readonly CreateNewsletterAdminInvite: WaMexCreateNewsletterAdminInviteResponse
    readonly CreateReportAppeal: WaMexCreateReportAppealResponse
    readonly CreateWhatsAppAdsIdentity: WaMexCreateWhatsAppAdsIdentityResponse
    readonly CustomLabel3pdEvent: WaMexCustomLabel3pdEventResponse
    readonly CustomerManagerAccessState: WaMexCustomerManagerAccessStateResponse
    readonly CustomerManagerCustomerProfileCustomFieldCreate: WaMexCustomerManagerCustomerProfileCustomFieldCreateResponse
    readonly CustomerManagerStartTrial: WaMexCustomerManagerStartTrialResponse
    readonly DebugLabyrinthAddDevice: WaMexDebugLabyrinthAddDeviceResponse
    readonly DebugLabyrinthFetchVirtualDeviceInfo: WaMexDebugLabyrinthFetchVirtualDeviceInfoResponse
    readonly DebugLabyrinthInboxSnapshot: WaMexDebugLabyrinthInboxSnapshotResponse
    readonly DebugLabyrinthRange: WaMexDebugLabyrinthRangeResponse
    readonly DebugLabyrinthRestorePage: WaMexDebugLabyrinthRestorePageResponse
    readonly DeleteNewsletter: WaMexDeleteNewsletterResponse
    readonly DemoteNewsletterAdmin: WaMexDemoteNewsletterAdminResponse
    readonly E2EEMetadataMailboxFetchGroupInfoV4: WaMexE2EEMetadataMailboxFetchGroupInfoV4Response
    readonly EBMessageRangeQueryForThreads: WaMexEBMessageRangeQueryForThreadsResponse
    readonly EditBizProfile: WaMexEditBizProfileResponse
    readonly EmailInviteSendGroup: WaMexEmailInviteSendGroupResponse
    readonly ExternalCtxAuthoriseWAChat: WaMexExternalCtxAuthoriseWAChatResponse
    readonly FetchAllNewslettersMetadata: WaMexFetchAllNewslettersMetadataResponse
    readonly FetchAllSubgroups: WaMexFetchAllSubgroupsResponse
    readonly FetchBotCertificateRevocationList: WaMexFetchBotCertificateRevocationListResponse
    readonly FetchBotProfilesGQL: WaMexFetchBotProfilesGQLResponse
    readonly FetchBotTasks: WaMexFetchBotTasksResponse
    readonly FetchDynamicAIModes: WaMexFetchDynamicAIModesResponse
    readonly FetchGroupInfo: WaMexFetchGroupInfoResponse
    readonly FetchGroupInfoIncludBots: WaMexFetchGroupInfoIncludBotsResponse
    readonly FetchGroupInfoIncludBotsJobAcp2: WaMexFetchGroupInfoIncludBotsJobAcp2Response
    readonly FetchGroupInfoJobAcp2: WaMexFetchGroupInfoJobAcp2Response
    readonly FetchGroupInviteCode: WaMexFetchGroupInviteCodeResponse
    readonly FetchGroupInviteInfo: WaMexFetchGroupInviteInfoResponse
    readonly FetchGroupInviteInfoJobAddRequest: WaMexFetchGroupInviteInfoJobAddRequestResponse
    readonly FetchGroupIsInternal: WaMexFetchGroupIsInternalResponse
    readonly FetchGroupMembershipFormForJoinJobAddRequest: WaMexFetchGroupMembershipFormForJoinJobAddRequestResponse
    readonly FetchGroupMembershipFormForJoinJobInvite: WaMexFetchGroupMembershipFormForJoinJobInviteResponse
    readonly FetchGroupMembershipFormForJoinJobLinked: WaMexFetchGroupMembershipFormForJoinJobLinkedResponse
    readonly FetchIntegritySignals: WaMexFetchIntegritySignalsResponse
    readonly FetchLabyrinthEpochChain: WaMexFetchLabyrinthEpochChainResponse
    readonly FetchLabyrinthEpochDevices: WaMexFetchLabyrinthEpochDevicesResponse
    readonly FetchLinkedGroupInfo: WaMexFetchLinkedGroupInfoResponse
    readonly FetchMembershipApprovalRequests: WaMexFetchMembershipApprovalRequestsResponse
    readonly FetchMetaOnePromoEligibility: WaMexFetchMetaOnePromoEligibilityResponse
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
    readonly FetchPhoneNumberSharingSettings: WaMexFetchPhoneNumberSharingSettingsResponse
    readonly FetchPlaintextLinkPreview: WaMexFetchPlaintextLinkPreviewResponse
    readonly FetchQuickPromotions: WaMexFetchQuickPromotionsResponse
    readonly FetchReachoutTimelock: WaMexFetchReachoutTimelockResponse
    readonly FetchRecommendedNewsletters: WaMexFetchRecommendedNewslettersResponse
    readonly FetchSimilarNewsletters: WaMexFetchSimilarNewslettersResponse
    readonly FetchSubgroupSuggestions: WaMexFetchSubgroupSuggestionsResponse
    readonly FetchSubscriptionEntryPoints: WaMexFetchSubscriptionEntryPointsResponse
    readonly FetchSubscriptions: WaMexFetchSubscriptionsResponse
    readonly FetchTextStatusList: WaMexFetchTextStatusListResponse
    readonly FetchWassBotListProfilesGQL: WaMexFetchWassBotListProfilesGQLResponse
    readonly FetchWassBotProfileGQL: WaMexFetchWassBotProfileGQLResponse
    readonly GetAccessTokenFromOIDCCode: WaMexGetAccessTokenFromOIDCCodeResponse
    readonly GetAccountNonce: WaMexGetAccountNonceResponse
    readonly GetDsbInfo: WaMexGetDsbInfoResponse
    readonly GetFBAccountPages: WaMexGetFBAccountPagesResponse
    readonly GetNumbersForBrandIds: WaMexGetNumbersForBrandIdsResponse
    readonly GetPrivacyLists: WaMexGetPrivacyListsResponse
    readonly GetPrivacySettings: WaMexGetPrivacySettingsResponse
    readonly GetUsername: WaMexGetUsernameResponse
    readonly GetWAAEligibility: WaMexGetWAAEligibilityResponse
    readonly GetWoasAgeSignal: WaMexGetWoasAgeSignalResponse
    readonly GraphQLProductCatalogGetPublicKey: WaMexGraphQLProductCatalogGetPublicKeyResponse
    readonly GraphQLVerifyPostcode: WaMexGraphQLVerifyPostcodeResponse
    readonly GroupJoin: WaMexGroupJoinResponse
    readonly GroupStoreAndSendInviteSms: WaMexGroupStoreAndSendInviteSmsResponse
    readonly GroupStoreInviteSms: WaMexGroupStoreInviteSmsResponse
    readonly GroupSuspensionAppeal: WaMexGroupSuspensionAppealResponse
    readonly IntegrityChallengeResponse: WaMexIntegrityChallengeResponseResponse
    readonly InternalDirectoryFetchMembers: WaMexInternalDirectoryFetchMembersResponse
    readonly JoinNewsletter: WaMexJoinNewsletterResponse
    readonly KeyTransparencyGraphQLClient_: WaMexKeyTransparencyGraphQLClient_Response
    readonly LeaveNewsletter: WaMexLeaveNewsletterResponse
    readonly LidChangeNotification: WaMexLidChangeNotificationResponse
    readonly LogNewsletterExposures: WaMexLogNewsletterExposuresResponse
    readonly LogServerSentInviteIntent: WaMexLogServerSentInviteIntentResponse
    readonly MAIBAAdObjectReference_StoryMetadata: WaMexMAIBAAdObjectReference_StoryMetadataResponse
    readonly MAIBAChatThread: WaMexMAIBAChatThreadResponse
    readonly MAIBAGraphQLSendMessageV2Query: WaMexMAIBAGraphQLSendMessageV2QueryResponse
    readonly MAIBAGraphQLSendMessageV3Query: WaMexMAIBAGraphQLSendMessageV3QueryResponse
    readonly MAIBAGraphQLSendMessageV4Query: WaMexMAIBAGraphQLSendMessageV4QueryResponse
    readonly MAIBAPageReference: WaMexMAIBAPageReferenceResponse
    readonly MAIBAUpdateAdsAIConsent: WaMexMAIBAUpdateAdsAIConsentResponse
    readonly MetaPayVaultInitialize: WaMexMetaPayVaultInitializeResponse
    readonly MetaPayVaultLabyrinthDelete: WaMexMetaPayVaultLabyrinthDeleteResponse
    readonly MetaPayVaultLabyrinthFetchAll: WaMexMetaPayVaultLabyrinthFetchAllResponse
    readonly MetaPayVaultLabyrinthSave: WaMexMetaPayVaultLabyrinthSaveResponse
    readonly NativeMLModel: WaMexNativeMLModelResponse
    readonly NewsletterAddPaidPartnershipLabel: WaMexNewsletterAddPaidPartnershipLabelResponse
    readonly NewsletterBlockUser: WaMexNewsletterBlockUserResponse
    readonly NewsletterLabelAiContent: WaMexNewsletterLabelAiContentResponse
    readonly NewsletterPinMessages: WaMexNewsletterPinMessagesResponse
    readonly NewsletterQuestionResponseStateUpdate: WaMexNewsletterQuestionResponseStateUpdateResponse
    readonly NewsletterUnpinMessages: WaMexNewsletterUnpinMessagesResponse
    readonly OrgAdminGraphQLAddChannel: WaMexOrgAdminGraphQLAddChannelResponse
    readonly OrgAdminGraphQLAddGroup: WaMexOrgAdminGraphQLAddGroupResponse
    readonly OrgAdminGraphQLAdminRoster: WaMexOrgAdminGraphQLAdminRosterResponse
    readonly OrgAdminGraphQLApplyAdminRosterChanges: WaMexOrgAdminGraphQLApplyAdminRosterChangesResponse
    readonly OrgAdminGraphQLDirectoryPage: WaMexOrgAdminGraphQLDirectoryPageResponse
    readonly OrgAdminGraphQLEventRsvpCounts: WaMexOrgAdminGraphQLEventRsvpCountsResponse
    readonly OrgAdminGraphQLGroup: WaMexOrgAdminGraphQLGroupResponse
    readonly OrgAdminGraphQLInviteMembers: WaMexOrgAdminGraphQLInviteMembersResponse
    readonly OrgAdminGraphQLLeave: WaMexOrgAdminGraphQLLeaveResponse
    readonly OrgAdminGraphQLManagedChannelAdmins: WaMexOrgAdminGraphQLManagedChannelAdminsResponse
    readonly OrgAdminGraphQLManagedChannels: WaMexOrgAdminGraphQLManagedChannelsResponse
    readonly OrgAdminGraphQLManagedEvents: WaMexOrgAdminGraphQLManagedEventsResponse
    readonly OrgAdminGraphQLManagedGroups: WaMexOrgAdminGraphQLManagedGroupsResponse
    readonly OrgAdminGraphQLMemberSearch: WaMexOrgAdminGraphQLMemberSearchResponse
    readonly OrgAdminGraphQLOrgs: WaMexOrgAdminGraphQLOrgsResponse
    readonly OrgAdminGraphQLRemoveMember: WaMexOrgAdminGraphQLRemoveMemberResponse
    readonly OrgAdminGraphQLSendManagedGroupEmailInvites: WaMexOrgAdminGraphQLSendManagedGroupEmailInvitesResponse
    readonly OrgAdminGraphQLSetMemberRole: WaMexOrgAdminGraphQLSetMemberRoleResponse
    readonly OrgAdminGraphQLSubmitBulkGroupRequest: WaMexOrgAdminGraphQLSubmitBulkGroupRequestResponse
    readonly OrgAdminGraphQLUpdateOrg: WaMexOrgAdminGraphQLUpdateOrgResponse
    readonly OrgMemberUpdateNotificationHandler: WaMexOrgMemberUpdateNotificationHandlerResponse
    readonly PaymentsPasskeyHasCredential: WaMexPaymentsPasskeyHasCredentialResponse
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
    readonly RequestOTE: WaMexRequestOTEResponse
    readonly ResolveAccountTypeAndAdPage: WaMexResolveAccountTypeAndAdPageResponse
    readonly ResolveAccountTypeAndAdPageQuery: WaMexResolveAccountTypeAndAdPageQueryResponse
    readonly RevokeNewsletterAdminInvite: WaMexRevokeNewsletterAdminInviteResponse
    readonly RotateLabyrinthEpoch: WaMexRotateLabyrinthEpochResponse
    readonly SaveResponseTonePreference: WaMexSaveResponseTonePreferenceResponse
    readonly SetUsername: WaMexSetUsernameResponse
    readonly SetUsernameKey: WaMexSetUsernameKeyResponse
    readonly SharableEventAddInvitations: WaMexSharableEventAddInvitationsResponse
    readonly SharableEventCreate: WaMexSharableEventCreateResponse
    readonly SharableEventDelete: WaMexSharableEventDeleteResponse
    readonly SharableEventGet: WaMexSharableEventGetResponse
    readonly SharableEventGuestJoinedWaNotifications: WaMexSharableEventGuestJoinedWaNotificationsResponse
    readonly SharableEventInviteLinkJobGetOrCreate: WaMexSharableEventInviteLinkJobGetOrCreateResponse
    readonly SharableEventInviteLinkJobInvalidate: WaMexSharableEventInviteLinkJobInvalidateResponse
    readonly SharableEventInviteLinkJobRotate: WaMexSharableEventInviteLinkJobRotateResponse
    readonly SharableEventJoinViaLink: WaMexSharableEventJoinViaLinkResponse
    readonly SharableEventLeave: WaMexSharableEventLeaveResponse
    readonly SharableEventLinkPreview: WaMexSharableEventLinkPreviewResponse
    readonly SharableEventList: WaMexSharableEventListResponse
    readonly SharableEventPlaceSearch: WaMexSharableEventPlaceSearchResponse
    readonly SharableEventPresetCovers: WaMexSharableEventPresetCoversResponse
    readonly SharableEventReconcile: WaMexSharableEventReconcileResponse
    readonly SharableEventRemoveInvitations: WaMexSharableEventRemoveInvitationsResponse
    readonly SharableEventUpdate: WaMexSharableEventUpdateResponse
    readonly SharableEventUpdateRsvp: WaMexSharableEventUpdateRsvpResponse
    readonly SignupMetadata: WaMexSignupMetadataResponse
    readonly SkipStoppedMessages: WaMexSkipStoppedMessagesResponse
    readonly StartConversationTemplateReengagementWithCatalogSection: WaMexStartConversationTemplateReengagementWithCatalogSectionResponse
    readonly StartConversationsTemplateCustomerActionsSectionIsEligibleForAIRegeneration: WaMexStartConversationsTemplateCustomerActionsSectionIsEligibleForAIRegenerationResponse
    readonly StartConversationsTemplateDialogContainerBodyGraphQLWelcomeMessageFlows: WaMexStartConversationsTemplateDialogContainerBodyGraphQLWelcomeMessageFlowsResponse
    readonly StartConversationsTemplateFAQGenAIRegeneration: WaMexStartConversationsTemplateFAQGenAIRegenerationResponse
    readonly SubscriptionWaffleAgeCheck: WaMexSubscriptionWaffleAgeCheckResponse
    readonly SupportBugReportCreateDogfoodingTask: WaMexSupportBugReportCreateDogfoodingTaskResponse
    readonly SupportBugReportSubmit: WaMexSupportBugReportSubmitResponse
    readonly SupportChatAuthRefresh: WaMexSupportChatAuthRefreshResponse
    readonly SupportContactFormSubmit: WaMexSupportContactFormSubmitResponse
    readonly SupportMessageFeedbackSubmit: WaMexSupportMessageFeedbackSubmitResponse
    readonly TeamLinkCreateInvitation: WaMexTeamLinkCreateInvitationResponse
    readonly TeamLinkListInvitations: WaMexTeamLinkListInvitationsResponse
    readonly TeamLinkRemoveInvitation: WaMexTeamLinkRemoveInvitationResponse
    readonly TeamLinkUpdateAgentRole: WaMexTeamLinkUpdateAgentRoleResponse
    readonly TransferCommunityOwnership: WaMexTransferCommunityOwnershipResponse
    readonly UpdateGroupProperty: WaMexUpdateGroupPropertyResponse
    readonly UpdateNewsletter: WaMexUpdateNewsletterResponse
    readonly UpdateNewsletterAdminProfile: WaMexUpdateNewsletterAdminProfileResponse
    readonly UpdateNewsletterAdminProfileSetting: WaMexUpdateNewsletterAdminProfileSettingResponse
    readonly UpdateNewsletterUserSetting: WaMexUpdateNewsletterUserSettingResponse
    readonly UpdateTextStatus: WaMexUpdateTextStatusResponse
    readonly UploadLabyrinthMessages: WaMexUploadLabyrinthMessagesResponse
    readonly UsernameAvailability: WaMexUsernameAvailabilityResponse
    readonly Usync: WaMexUsyncResponse
    readonly WAAOnboarding: WaMexWAAOnboardingResponse
    readonly WAMFlowsCTWAEditorModal: WaMexWAMFlowsCTWAEditorModalResponse
    readonly WAMFlowsCTWAFlowPreview: WaMexWAMFlowsCTWAFlowPreviewResponse
    readonly WODirectoryFetchCompanyName: WaMexWODirectoryFetchCompanyNameResponse
    readonly WaffleFXServiceDataQueryV2: WaMexWaffleFXServiceDataQueryV2Response
    readonly WaffleFXWAMOUpdateUOOM: WaMexWaffleFXWAMOUpdateUOOMResponse
    readonly WaffleXE: WaMexWaffleXEResponse
    readonly WhatsAppMarketingCampaignCustomerListPickerLists: WaMexWhatsAppMarketingCampaignCustomerListPickerListsResponse
    readonly fetchWebsiteMediaImageURLs: WaMexfetchWebsiteMediaImageURLsResponse
    readonly navigateToProductInsightsWithDefaultTab: WaMexnavigateToProductInsightsWithDefaultTabResponse
    readonly useFetchAdAccountsForL4Context: WaMexuseFetchAdAccountsForL4ContextResponse
    readonly useFetchAdAccountsNameById: WaMexuseFetchAdAccountsNameByIdResponse
    readonly useFlowJSONValidationLibrary: WaMexuseFlowJSONValidationLibraryResponse
    readonly useIsMessengerPlatformBot: WaMexuseIsMessengerPlatformBotResponse
    readonly useMAIBAAsyncNotification: WaMexuseMAIBAAsyncNotificationResponse
    readonly useMAIBAMedia: WaMexuseMAIBAMediaResponse
    readonly useWAWebEstimatedDailyReach: WaMexuseWAWebEstimatedDailyReachResponse
    readonly useWAWebEstimatedDailyReachShadow: WaMexuseWAWebEstimatedDailyReachShadowResponse
    readonly useWAWebSmartComposerCoachSuggestedReply: WaMexuseWAWebSmartComposerCoachSuggestedReplyResponse
    readonly useWAWebSmartComposerReportThreadEvent: WaMexuseWAWebSmartComposerReportThreadEventResponse
    readonly useWAWebSmartComposerReportUsed: WaMexuseWAWebSmartComposerReportUsedResponse
}
