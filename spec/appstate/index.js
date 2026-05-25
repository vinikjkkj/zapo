// AUTO-GENERATED — do not edit. Regenerated daily by wa-spec.
// WhatsApp Version: 2.3000.1040072419
'use strict'

const WA_APPSTATE_COLLECTIONS = Object.freeze(['regular', 'regular_low', 'regular_high', 'critical_block', 'critical_unblock_low'])

const WA_APPSTATE_SCHEMAS = Object.freeze({
    AdsCtwaPerCustomerDataSharing: Object.freeze({
        name: 'ctwaPerCustomerDataSharing',
        collection: 'regular_high',
        version: 1,
        scope: 'account',
        valueField: 'ctwaPerCustomerDataSharingAction',
        valueProtoType: 'SyncActionValue.CtwaPerCustomerDataSharingAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'ctwaPerCustomerDataSharing' }),
            Object.freeze({ type: 'string', name: 'accountLid' })
        ])
    }),
    Agent: Object.freeze({
        name: 'deviceAgent',
        collection: 'regular',
        version: 7,
        scope: 'account',
        valueField: 'agentAction',
        valueProtoType: 'SyncActionValue.AgentAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'deviceAgent' }),
            Object.freeze({ type: 'string', name: 'agentId' })
        ])
    }),
    AiThreadDelete: Object.freeze({
        name: 'ai_thread_delete',
        collection: 'regular_high',
        version: 7,
        scope: 'chat',
        valueField: null,
        valueProtoType: null,
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'ai_thread_delete' }),
            Object.freeze({ type: 'jid', name: 'chatJid' }),
            Object.freeze({ type: 'string', name: 'id' })
        ])
    }),
    AiThreadPin: Object.freeze({
        name: 'thread_pin',
        collection: 'regular_low',
        version: 7,
        scope: 'chat',
        valueField: 'threadPinAction',
        valueProtoType: 'SyncActionValue.ThreadPinAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'thread_pin' }),
            Object.freeze({ type: 'jid', name: 'chatJid' }),
            Object.freeze({ type: 'string', name: 'id' })
        ])
    }),
    AiThreadRename: Object.freeze({
        name: 'ai_thread_rename',
        collection: 'regular_low',
        version: 7,
        scope: 'chat',
        valueField: 'aiThreadRenameAction',
        valueProtoType: 'SyncActionValue.AiThreadRenameAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'ai_thread_rename' }),
            Object.freeze({ type: 'jid', name: 'chatJid' }),
            Object.freeze({ type: 'string', name: 'id' })
        ])
    }),
    AndroidUnsupportedActions: Object.freeze({
        name: 'android_unsupported_actions',
        collection: 'regular_low',
        version: 4,
        scope: 'account',
        valueField: 'androidUnsupportedActions',
        valueProtoType: 'SyncActionValue.AndroidUnsupportedActions',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'android_unsupported_actions' })
        ])
    }),
    Archive: Object.freeze({
        name: 'archive',
        collection: 'regular_low',
        version: 3,
        scope: 'chatMessageRange',
        valueField: 'archiveChatAction',
        valueProtoType: 'SyncActionValue.ArchiveChatAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'archive' }),
            Object.freeze({ type: 'jid', name: 'chatJid' })
        ])
    }),
    AvatarUpdated: Object.freeze({
        name: 'avatar_updated_action',
        collection: 'regular',
        version: 7,
        scope: 'account',
        valueField: 'avatarUpdatedAction',
        valueProtoType: 'SyncActionValue.AvatarUpdatedAction',
        valueEnumFields: Object.freeze({ 'eventType': 'AvatarUpdatedAction.AvatarEventType' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'avatar_updated_action' })
        ])
    }),
    BizAiSettingsNudge: Object.freeze({
        name: 'biz_ai_settings_nudge',
        collection: 'regular_high',
        version: 1,
        scope: 'account',
        valueField: 'bizAiSettingsNudgeAction',
        valueProtoType: 'SyncActionValue.BizAISettingsNudgeAction',
        valueEnumFields: Object.freeze({ 'category': 'BizAISettingsNudgeAction.BizAISettingsCategory' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'biz_ai_settings_nudge' })
        ])
    }),
    BotWelcomeRequest: Object.freeze({
        name: 'bot_welcome_request',
        collection: 'regular_low',
        version: 2,
        scope: 'chat',
        valueField: 'botWelcomeRequestAction',
        valueProtoType: 'SyncActionValue.BotWelcomeRequestAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'bot_welcome_request' }),
            Object.freeze({ type: 'jid', name: 'chatJid' })
        ])
    }),
    BusinessBroadcastCampaign: Object.freeze({
        name: 'business_broadcast_campaign',
        collection: 'regular',
        version: 1,
        scope: 'account',
        valueField: 'businessBroadcastCampaignAction',
        valueProtoType: 'SyncActionValue.BusinessBroadcastCampaignAction',
        valueEnumFields: Object.freeze({ 'status': 'BusinessBroadcastCampaignStatus' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'business_broadcast_campaign' }),
            Object.freeze({ type: 'string', name: 'campaign' })
        ])
    }),
    BusinessBroadcastInsights: Object.freeze({
        name: 'business_broadcast_insights_sync',
        collection: 'regular',
        version: 1,
        scope: 'account',
        valueField: 'businessBroadcastInsightsAction',
        valueProtoType: 'SyncActionValue.BusinessBroadcastInsightsAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'business_broadcast_insights_sync' }),
            Object.freeze({ type: 'string', name: 'campaign' })
        ])
    }),
    BusinessBroadcastList: Object.freeze({
        name: 'business_broadcast_list',
        collection: 'regular',
        version: 1,
        scope: 'account',
        valueField: 'businessBroadcastListAction',
        valueProtoType: 'SyncActionValue.BusinessBroadcastListAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'business_broadcast_list' }),
            Object.freeze({ type: 'string', name: 'id' })
        ])
    }),
    CallLog: Object.freeze({
        name: 'call_log',
        collection: 'regular',
        version: 1,
        scope: 'account',
        valueField: 'callLogAction',
        valueProtoType: 'SyncActionValue.CallLogAction',
        valueEnumFields: Object.freeze({ 'callLogRecord.callResult': 'CallLogRecord.CallResult', 'callLogRecord.silenceReason': 'CallLogRecord.SilenceReason', 'callLogRecord.participants.callResult': 'CallLogRecord.CallResult', 'callLogRecord.callType': 'CallLogRecord.CallType' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'call_log' })
        ])
    }),
    ChatAssignment: Object.freeze({
        name: 'agentChatAssignment',
        collection: 'regular',
        version: 7,
        scope: 'chat',
        valueField: 'chatAssignment',
        valueProtoType: 'SyncActionValue.ChatAssignmentAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'agentChatAssignment' }),
            Object.freeze({ type: 'jid', name: 'chatJid' })
        ])
    }),
    ChatAssignmentOpenedStatus: Object.freeze({
        name: 'agentChatAssignmentOpenedStatus',
        collection: 'regular',
        version: 7,
        scope: 'chat',
        valueField: 'chatAssignmentOpenedStatus',
        valueProtoType: 'SyncActionValue.ChatAssignmentOpenedStatusAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'agentChatAssignmentOpenedStatus' }),
            Object.freeze({ type: 'jid', name: 'chatJid' }),
            Object.freeze({ type: 'string', name: 'agentId' })
        ])
    }),
    ChatLockSettings: Object.freeze({
        name: 'setting_chatLock',
        collection: 'regular_low',
        version: 7,
        scope: 'account',
        valueField: 'chatLockSettings',
        valueProtoType: 'ChatLockSettings',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'setting_chatLock' })
        ])
    }),
    ClearChat: Object.freeze({
        name: 'clearChat',
        collection: 'regular_high',
        version: 6,
        scope: 'chatMessageRange',
        valueField: 'clearChatAction',
        valueProtoType: 'SyncActionValue.ClearChatAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'clearChat' }),
            Object.freeze({ type: 'jid', name: 'chatJid' }),
            Object.freeze({ type: 'string', name: 'deleteStarred' }),
            Object.freeze({ type: 'string', name: 'deleteMedia' })
        ])
    }),
    Contact: Object.freeze({
        name: 'contact',
        collection: 'critical_unblock_low',
        version: 2,
        scope: 'account',
        valueField: 'contactAction',
        valueProtoType: 'SyncActionValue.ContactAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'contact' }),
            Object.freeze({ type: 'string', name: 'id' })
        ])
    }),
    CustomPaymentMethods: Object.freeze({
        name: 'custom_payment_methods',
        collection: 'regular_low',
        version: 7,
        scope: 'account',
        valueField: 'customPaymentMethodsAction',
        valueProtoType: 'SyncActionValue.CustomPaymentMethodsAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'custom_payment_methods' })
        ])
    }),
    CustomerData: Object.freeze({
        name: 'customer_data',
        collection: 'regular_low',
        version: 1,
        scope: 'account',
        valueField: 'customerDataAction',
        valueProtoType: 'SyncActionValue.CustomerDataAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'customer_data' }),
            Object.freeze({ type: 'string', name: 'chatJid' })
        ])
    }),
    DeleteChat: Object.freeze({
        name: 'deleteChat',
        collection: 'regular_high',
        version: 6,
        scope: 'chatMessageRange',
        valueField: 'deleteChatAction',
        valueProtoType: 'SyncActionValue.DeleteChatAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'deleteChat' }),
            Object.freeze({ type: 'jid', name: 'chatJid' }),
            Object.freeze({ type: 'string', name: 'deleteMedia' })
        ])
    }),
    DeleteMessageForMe: Object.freeze({
        name: 'deleteMessageForMe',
        collection: 'regular_high',
        version: 3,
        scope: 'message',
        valueField: 'deleteMessageForMeAction',
        valueProtoType: 'SyncActionValue.DeleteMessageForMeAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'deleteMessageForMe' }),
            Object.freeze({ type: 'jid', name: 'remote' }),
            Object.freeze({ type: 'string', name: 'id' }),
            Object.freeze({ type: 'boolString', name: 'fromMe' }),
            Object.freeze({ type: 'jidOrZero', name: 'participant' })
        ])
    }),
    DetectedOutcomeStatus: Object.freeze({
        name: 'detected_outcomes_status_action',
        collection: 'regular',
        version: 1,
        scope: 'account',
        valueField: 'detectedOutcomesStatusAction',
        valueProtoType: 'SyncActionValue.DetectedOutcomesStatusAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'detected_outcomes_status_action' })
        ])
    }),
    DeviceCapabilities: Object.freeze({
        name: 'device_capabilities',
        collection: 'regular_low',
        version: 7,
        scope: 'account',
        valueField: 'deviceCapabilities',
        valueProtoType: 'DeviceCapabilities',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'device_capabilities' })
        ])
    }),
    DisableLinkPreviews: Object.freeze({
        name: 'setting_disableLinkPreviews',
        collection: 'regular',
        version: 8,
        scope: 'account',
        valueField: 'privacySettingDisableLinkPreviewsAction',
        valueProtoType: 'SyncActionValue.PrivacySettingDisableLinkPreviewsAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'setting_disableLinkPreviews' })
        ])
    }),
    ExternalWebBeta: Object.freeze({
        name: 'external_web_beta',
        collection: 'regular',
        version: 3,
        scope: 'account',
        valueField: 'externalWebBetaAction',
        valueProtoType: 'SyncActionValue.ExternalWebBetaAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'external_web_beta' })
        ])
    }),
    FavoriteSticker: Object.freeze({
        name: 'favoriteSticker',
        collection: 'regular_low',
        version: 7,
        scope: 'account',
        valueField: 'stickerAction',
        valueProtoType: 'SyncActionValue.StickerAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'favoriteSticker' }),
            Object.freeze({ type: 'string', name: 'filehash' })
        ])
    }),
    Favorites: Object.freeze({
        name: 'favorites',
        collection: 'regular_high',
        version: 1,
        scope: 'account',
        valueField: 'favoritesAction',
        valueProtoType: 'SyncActionValue.FavoritesAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'favorites' })
        ])
    }),
    InteractiveMessageAction: Object.freeze({
        name: 'interactive_message_action',
        collection: 'regular_low',
        version: 1,
        scope: 'message',
        valueField: 'interactiveMessageAction',
        valueProtoType: 'SyncActionValue.InteractiveMessageAction',
        valueEnumFields: Object.freeze({ 'type': 'InteractiveMessageAction.InteractiveMessageActionMode' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'interactive_message_action' }),
            Object.freeze({ type: 'jid', name: 'remote' }),
            Object.freeze({ type: 'string', name: 'id' }),
            Object.freeze({ type: 'boolString', name: 'fromMe' }),
            Object.freeze({ type: 'jidOrZero', name: 'participant' }),
            Object.freeze({ type: 'string', name: 'arg5' })
        ])
    }),
    LabelEdit: Object.freeze({
        name: 'label_edit',
        collection: 'regular',
        version: 3,
        scope: 'account',
        valueField: 'labelEditAction',
        valueProtoType: 'SyncActionValue.LabelEditAction',
        valueEnumFields: Object.freeze({ 'type': 'LabelEditAction.ListType' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'label_edit' }),
            Object.freeze({ type: 'string', name: 'id' })
        ])
    }),
    LabelJid: Object.freeze({
        name: 'label_jid',
        collection: 'regular',
        version: 3,
        scope: 'chatOrContact',
        valueField: 'labelAssociationAction',
        valueProtoType: 'SyncActionValue.LabelAssociationAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'label_jid' }),
            Object.freeze({ type: 'string', name: 'labelId' }),
            Object.freeze({ type: 'jid', name: 'chatJid' })
        ])
    }),
    LabelReordering: Object.freeze({
        name: 'label_reordering',
        collection: 'regular',
        version: 3,
        scope: 'account',
        valueField: 'labelReorderingAction',
        valueProtoType: 'SyncActionValue.LabelReorderingAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'label_reordering' })
        ])
    }),
    LidContact: Object.freeze({
        name: 'lid_contact',
        collection: 'critical_unblock_low',
        version: 1,
        scope: 'account',
        valueField: 'lidContactAction',
        valueProtoType: 'SyncActionValue.LidContactAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'lid_contact' }),
            Object.freeze({ type: 'string', name: 'id' })
        ])
    }),
    LocaleSetting: Object.freeze({
        name: 'setting_locale',
        collection: 'critical_block',
        version: 3,
        scope: 'account',
        valueField: 'localeSetting',
        valueProtoType: 'SyncActionValue.LocaleSetting',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'setting_locale' })
        ])
    }),
    LockChat: Object.freeze({
        name: 'lock',
        collection: 'regular_low',
        version: 7,
        scope: 'chat',
        valueField: 'lockChatAction',
        valueProtoType: 'SyncActionValue.LockChatAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'lock' }),
            Object.freeze({ type: 'jid', name: 'chatJid' })
        ])
    }),
    MarkChatAsRead: Object.freeze({
        name: 'markChatAsRead',
        collection: 'regular_low',
        version: 3,
        scope: 'chatMessageRange',
        valueField: 'markChatAsReadAction',
        valueProtoType: 'SyncActionValue.MarkChatAsReadAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'markChatAsRead' }),
            Object.freeze({ type: 'jid', name: 'chatJid' })
        ])
    }),
    MarketingMessage: Object.freeze({
        name: 'marketingMessage',
        collection: 'regular',
        version: 7,
        scope: 'account',
        valueField: 'marketingMessageAction',
        valueProtoType: 'SyncActionValue.MarketingMessageAction',
        valueEnumFields: Object.freeze({ 'type': 'MarketingMessageAction.MarketingMessagePrototypeType' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'marketingMessage' }),
            Object.freeze({ type: 'string', name: 'id' })
        ])
    }),
    MarketingMessageBroadcast: Object.freeze({
        name: 'marketingMessageBroadcast',
        collection: 'regular',
        version: 7,
        scope: 'account',
        valueField: null,
        valueProtoType: null,
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'marketingMessageBroadcast' }),
            Object.freeze({ type: 'string', name: 'premiumMessageId' }),
            Object.freeze({ type: 'string', name: 'messageId' })
        ])
    }),
    MerchantPaymentPartner: Object.freeze({
        name: 'merchant_payment_partner',
        collection: 'regular_low',
        version: 7,
        scope: 'account',
        valueField: 'merchantPaymentPartnerAction',
        valueProtoType: 'SyncActionValue.MerchantPaymentPartnerAction',
        valueEnumFields: Object.freeze({ 'status': 'MerchantPaymentPartnerAction.Status' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'merchant_payment_partner' })
        ])
    }),
    Mute: Object.freeze({
        name: 'mute',
        collection: 'regular_high',
        version: 2,
        scope: 'chat',
        valueField: 'muteAction',
        valueProtoType: 'SyncActionValue.MuteAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'mute' }),
            Object.freeze({ type: 'jid', name: 'chatJid' })
        ])
    }),
    NctSaltSync: Object.freeze({
        name: 'nct_salt_sync',
        collection: 'regular_high',
        version: 1,
        scope: 'account',
        valueField: 'nctSaltSyncAction',
        valueProtoType: 'SyncActionValue.NctSaltSyncAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'nct_salt_sync' })
        ])
    }),
    NoteEdit: Object.freeze({
        name: 'note_edit',
        collection: 'regular_low',
        version: 7,
        scope: 'account',
        valueField: 'noteEditAction',
        valueProtoType: 'SyncActionValue.NoteEditAction',
        valueEnumFields: Object.freeze({ 'type': 'NoteEditAction.NoteType' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'note_edit' }),
            Object.freeze({ type: 'string', name: 'id' })
        ])
    }),
    Nux: Object.freeze({
        name: 'nux',
        collection: 'regular_low',
        version: 7,
        scope: 'account',
        valueField: 'nuxAction',
        valueProtoType: 'SyncActionValue.NuxAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'nux' }),
            Object.freeze({ type: 'string', name: 'nuxKey' })
        ])
    }),
    OutContact: Object.freeze({
        name: 'out_contact',
        collection: 'regular_low',
        version: 1,
        scope: 'account',
        valueField: 'outContactAction',
        valueProtoType: 'SyncActionValue.OutContactAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'out_contact' }),
            Object.freeze({ type: 'string', name: 'id' })
        ])
    }),
    PaymentInfo: Object.freeze({
        name: 'payment_info',
        collection: 'regular_low',
        version: 7,
        scope: 'account',
        valueField: 'paymentInfoAction',
        valueProtoType: 'SyncActionValue.PaymentInfoAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'payment_info' })
        ])
    }),
    PaymentTos: Object.freeze({
        name: 'payment_tos',
        collection: 'regular_low',
        version: 7,
        scope: 'account',
        valueField: 'paymentTosAction',
        valueProtoType: 'SyncActionValue.PaymentTosAction',
        valueEnumFields: Object.freeze({ 'paymentNotice': 'PaymentTosAction.PaymentNotice' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'payment_tos' })
        ])
    }),
    Pin: Object.freeze({
        name: 'pin_v1',
        collection: 'regular_low',
        version: 5,
        scope: 'chat',
        valueField: 'pinAction',
        valueProtoType: 'SyncActionValue.PinAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'pin_v1' }),
            Object.freeze({ type: 'jid', name: 'chatJid' })
        ])
    }),
    PnForLidChat: Object.freeze({
        name: 'pnForLidChat',
        collection: 'regular',
        version: 8,
        scope: 'account',
        valueField: 'pnForLidChatAction',
        valueProtoType: 'SyncActionValue.PnForLidChatAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'pnForLidChat' }),
            Object.freeze({ type: 'string', name: 'lid' })
        ])
    }),
    PrimaryFeature: Object.freeze({
        name: 'primary_feature',
        collection: 'regular',
        version: 7,
        scope: 'account',
        valueField: 'primaryFeature',
        valueProtoType: 'SyncActionValue.PrimaryFeature',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'primary_feature' })
        ])
    }),
    PrimaryVersion: Object.freeze({
        name: 'primary_version',
        collection: 'regular_low',
        version: 7,
        scope: 'account',
        valueField: 'primaryVersionAction',
        valueProtoType: 'SyncActionValue.PrimaryVersionAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'primary_version' }),
            Object.freeze({ type: 'string', name: 'key1' })
        ])
    }),
    QuickReply: Object.freeze({
        name: 'quick_reply',
        collection: 'regular',
        version: 2,
        scope: 'account',
        valueField: 'quickReplyAction',
        valueProtoType: 'SyncActionValue.QuickReplyAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'quick_reply' }),
            Object.freeze({ type: 'string', name: 'id' })
        ])
    }),
    RemoveRecentSticker: Object.freeze({
        name: 'removeRecentSticker',
        collection: 'regular_low',
        version: 7,
        scope: 'account',
        valueField: 'removeRecentStickerAction',
        valueProtoType: 'SyncActionValue.RemoveRecentStickerAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'removeRecentSticker' }),
            Object.freeze({ type: 'string', name: 'filehash' })
        ])
    }),
    Sentinel: Object.freeze({
        name: 'sentinel',
        collection: 'regular_low',
        version: 3,
        scope: 'account',
        valueField: 'keyExpiration',
        valueProtoType: 'SyncActionValue.KeyExpiration',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'sentinel' })
        ])
    }),
    SettingPushName: Object.freeze({
        name: 'setting_pushName',
        collection: 'critical_block',
        version: 1,
        scope: 'account',
        valueField: 'pushNameSetting',
        valueProtoType: 'SyncActionValue.PushNameSetting',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'setting_pushName' })
        ])
    }),
    SettingsSync: Object.freeze({
        name: 'settings_sync',
        collection: 'regular_low',
        version: 1,
        scope: 'account',
        valueField: 'settingsSyncAction',
        valueProtoType: 'SyncActionValue.SettingsSyncAction',
        valueEnumFields: Object.freeze({ 'bannerNotificationDisplayMode': 'SettingsSyncAction.DisplayMode', 'unreadCounterBadgeDisplayMode': 'SettingsSyncAction.DisplayMode', 'mediaUploadQuality': 'SettingsSyncAction.MediaQualitySetting' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'settings_sync' }),
            Object.freeze({ type: 'enum', name: 'settingPlatform', protoEnum: 'SettingsSyncAction.SettingPlatform' }),
            Object.freeze({ type: 'enum', name: 'settingKey', protoEnum: 'SettingsSyncAction.SettingKey' }),
            Object.freeze({ type: 'jid', name: 'chatJid' })
        ])
    }),
    ShareOwnPn: Object.freeze({
        name: 'shareOwnPn',
        collection: 'regular',
        version: 8,
        scope: 'account',
        valueField: null,
        valueProtoType: null,
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'shareOwnPn' }),
            Object.freeze({ type: 'string', name: 'lid' })
        ])
    }),
    Star: Object.freeze({
        name: 'star',
        collection: 'regular_high',
        version: 2,
        scope: 'message',
        valueField: 'starAction',
        valueProtoType: 'SyncActionValue.StarAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'star' }),
            Object.freeze({ type: 'jid', name: 'remote' }),
            Object.freeze({ type: 'string', name: 'id' }),
            Object.freeze({ type: 'boolString', name: 'fromMe' }),
            Object.freeze({ type: 'jidOrZero', name: 'participant' })
        ])
    }),
    StatusPrivacy: Object.freeze({
        name: 'status_privacy',
        collection: 'regular_high',
        version: 7,
        scope: 'account',
        valueField: 'statusPrivacy',
        valueProtoType: 'SyncActionValue.StatusPrivacyAction',
        valueEnumFields: Object.freeze({ 'mode': 'StatusPrivacyAction.StatusDistributionMode', 'modes': 'StatusPrivacyAction.StatusDistributionMode' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'status_privacy' })
        ])
    }),
    SubscriptionsSyncV2: Object.freeze({
        name: 'subscriptions_sync_v2',
        collection: 'regular',
        version: 1,
        scope: 'account',
        valueField: 'subscriptionsSyncV2Action',
        valueProtoType: 'SyncActionValue.SubscriptionsSyncV2Action',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'subscriptions_sync_v2' })
        ])
    }),
    TimeFormat: Object.freeze({
        name: 'time_format',
        collection: 'regular_low',
        version: 7,
        scope: 'account',
        valueField: 'timeFormatAction',
        valueProtoType: 'SyncActionValue.TimeFormatAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'time_format' })
        ])
    }),
    UnarchiveChatsSetting: Object.freeze({
        name: 'setting_unarchiveChats',
        collection: 'regular_low',
        version: 4,
        scope: 'account',
        valueField: 'unarchiveChatsSetting',
        valueProtoType: 'SyncActionValue.UnarchiveChatsSetting',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'setting_unarchiveChats' })
        ])
    }),
    UserStatusMute: Object.freeze({
        name: 'userStatusMute',
        collection: 'regular_high',
        version: 7,
        scope: 'account',
        valueField: 'userStatusMuteAction',
        valueProtoType: 'SyncActionValue.UserStatusMuteAction',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'userStatusMute' }),
            Object.freeze({ type: 'string', name: 'id' })
        ])
    }),
    VoipRelayAllCalls: Object.freeze({
        name: 'setting_relayAllCalls',
        collection: 'regular',
        version: 1,
        scope: 'account',
        valueField: 'privacySettingRelayAllCalls',
        valueProtoType: 'SyncActionValue.PrivacySettingRelayAllCalls',
        valueEnumFields: null,
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'setting_relayAllCalls' })
        ])
    }),
    WaffleAccountLinkState: Object.freeze({
        name: 'waffle_account_link_state',
        collection: 'regular_high',
        version: 1,
        scope: 'account',
        valueField: 'waffleAccountLinkStateAction',
        valueProtoType: 'SyncActionValue.WaffleAccountLinkStateAction',
        valueEnumFields: Object.freeze({ 'linkState': 'WaffleAccountLinkStateAction.AccountLinkState' }),
        indexParts: Object.freeze([
            Object.freeze({ type: 'literal', value: 'waffle_account_link_state' })
        ])
    })
})

module.exports = { WA_APPSTATE_COLLECTIONS, WA_APPSTATE_SCHEMAS }
