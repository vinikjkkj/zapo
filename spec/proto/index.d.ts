
/** Minimal protobuf Reader interface used by decode methods. */
interface PbReader {
	len: number
	pos: number
	uint32(): number
	int32(): number
	int64(): Long
	uint64(): Long
	sint32(): number
	sint64(): Long
	bool(): boolean
	fixed32(): number
	sfixed32(): number
	fixed64(): Long
	sfixed64(): Long
	float(): number
	double(): number
	bytes(): Uint8Array
	string(): string
	skipType(wireType: number): this
}
/** Minimal protobuf Writer interface used by encode methods. */
interface PbWriter {
	uint32(value: number): PbWriter
	int32(value: number): PbWriter
	int64(value: number | Long): PbWriter
	uint64(value: number | Long): PbWriter
	sint32(value: number): PbWriter
	sint64(value: number | Long): PbWriter
	bool(value: boolean): PbWriter
	fixed32(value: number): PbWriter
	sfixed32(value: number): PbWriter
	fixed64(value: number | Long): PbWriter
	sfixed64(value: number | Long): PbWriter
	float(value: number): PbWriter
	double(value: number): PbWriter
	bytes(value: Uint8Array): PbWriter
	string(value: string): PbWriter
	fork(): PbWriter
	ldelim(): PbWriter
	finish(): Uint8Array
}
/** int64/uint64 value representation. */
type Long = number | { low: number; high: number; unsigned: boolean; toNumber(): number }
export namespace waproto {
	enum ADVEncryptionType {
		E2EE = 0,
		HOSTED = 1,
		NON_E2EE = 2
	}
	enum AIRichResponseMessageType {
		AI_RICH_RESPONSE_TYPE_UNKNOWN = 0,
		AI_RICH_RESPONSE_TYPE_STANDARD = 1
	}
	enum AIRichResponseSubMessageType {
		AI_RICH_RESPONSE_UNKNOWN = 0,
		AI_RICH_RESPONSE_GRID_IMAGE = 1,
		AI_RICH_RESPONSE_TEXT = 2,
		AI_RICH_RESPONSE_INLINE_IMAGE = 3,
		AI_RICH_RESPONSE_TABLE = 4,
		AI_RICH_RESPONSE_CODE = 5,
		AI_RICH_RESPONSE_DYNAMIC = 6,
		AI_RICH_RESPONSE_MAP = 7,
		AI_RICH_RESPONSE_LATEX = 8,
		AI_RICH_RESPONSE_CONTENT_ITEMS = 9
	}
	enum AISubscriptionRequestType {
		UNSPECIFIED = 0,
		THINK_HARD = 1,
		IMAGE_GEN = 2,
		VIDEO_GEN = 3
	}
	enum BotMetricsEntryPoint {
		UNDEFINED_ENTRY_POINT = 0,
		FAVICON = 1,
		CHATLIST = 2,
		AISEARCH_NULL_STATE_PAPER_PLANE = 3,
		AISEARCH_NULL_STATE_SUGGESTION = 4,
		AISEARCH_TYPE_AHEAD_SUGGESTION = 5,
		AISEARCH_TYPE_AHEAD_PAPER_PLANE = 6,
		AISEARCH_TYPE_AHEAD_RESULT_CHATLIST = 7,
		AISEARCH_TYPE_AHEAD_RESULT_MESSAGES = 8,
		AIVOICE_SEARCH_BAR = 9,
		AIVOICE_FAVICON = 10,
		AISTUDIO = 11,
		DEEPLINK = 12,
		NOTIFICATION = 13,
		PROFILE_MESSAGE_BUTTON = 14,
		FORWARD = 15,
		APP_SHORTCUT = 16,
		FF_FAMILY = 17,
		AI_TAB = 18,
		AI_HOME = 19,
		AI_DEEPLINK_IMMERSIVE = 20,
		AI_DEEPLINK = 21,
		META_AI_CHAT_SHORTCUT_AI_STUDIO = 22,
		UGC_CHAT_SHORTCUT_AI_STUDIO = 23,
		NEW_CHAT_AI_STUDIO = 24,
		AIVOICE_FAVICON_CALL_HISTORY = 25,
		ASK_META_AI_CONTEXT_MENU = 26,
		ASK_META_AI_CONTEXT_MENU_1ON1 = 27,
		ASK_META_AI_CONTEXT_MENU_GROUP = 28,
		INVOKE_META_AI_1ON1 = 29,
		INVOKE_META_AI_GROUP = 30,
		META_AI_FORWARD = 31,
		NEW_CHAT_AI_CONTACT = 32,
		MESSAGE_QUICK_ACTION_1_ON_1_CHAT = 33,
		MESSAGE_QUICK_ACTION_GROUP_CHAT = 34,
		ATTACHMENT_TRAY_1_ON_1_CHAT = 35,
		ATTACHMENT_TRAY_GROUP_CHAT = 36,
		ASK_META_AI_MEDIA_VIEWER_1ON1 = 37,
		ASK_META_AI_MEDIA_VIEWER_GROUP = 38,
		MEDIA_PICKER_1_ON_1_CHAT = 39,
		MEDIA_PICKER_GROUP_CHAT = 40,
		ASK_META_AI_NO_SEARCH_RESULTS = 41,
		META_AI_SETTINGS = 45,
		WEB_INTRO_PANEL = 46,
		WEB_NAVIGATION_BAR = 47,
		GROUP_MEMBER = 54,
		CHATLIST_SEARCH = 55,
		NEW_CHAT_LIST = 56
	}
	enum BotMetricsThreadEntryPoint {
		AI_TAB_THREAD = 1,
		AI_HOME_THREAD = 2,
		AI_DEEPLINK_IMMERSIVE_THREAD = 3,
		AI_DEEPLINK_THREAD = 4,
		ASK_META_AI_CONTEXT_MENU_THREAD = 5
	}
	enum BotSessionSource {
		NONE = 0,
		NULL_STATE = 1,
		TYPEAHEAD = 2,
		USER_INPUT = 3,
		EMU_FLASH = 4,
		EMU_FLASH_FOLLOWUP = 5,
		VOICE = 6,
		AI_HOME_SESSION = 7
	}
	enum COMMAND_COMMAND_TYPE {
		EVERYONE = 1,
		SILENT = 2,
		AI = 3,
		AI_IMAGINE = 4
	}
	enum CONSUMER_APPLICATION_EXTENDED_TEXT_MESSAGE_PREVIEW_TYPE {
		NONE = 0,
		VIDEO = 1
	}
	enum CONSUMER_APPLICATION_METADATA_SPECIAL_TEXT_SIZE {
		SMALL = 1,
		MEDIUM = 2,
		LARGE = 3
	}
	enum CONSUMER_APPLICATION_STATUS_TEXT_MESAGE_FONT_TYPE {
		SANS_SERIF = 0,
		SERIF = 1,
		NORICAN_REGULAR = 2,
		BRYNDAN_WRITE = 3,
		BEBASNEUE_REGULAR = 4,
		OSWALD_HEAVY = 5
	}
	enum CollectionName {
		COLLECTION_NAME_UNKNOWN = 0,
		REGULAR = 1,
		REGULAR_LOW = 2,
		REGULAR_HIGH = 3,
		CRITICAL_BLOCK = 4,
		CRITICAL_UNBLOCK_LOW = 5
	}
	enum FUTURE_PROOF_BEHAVIOR {
		PLACEHOLDER = 0,
		NO_PLACEHOLDER = 1,
		IGNORE = 2
	}
	enum HostedState {
		E2EE = 0,
		HOSTED = 1
	}
	enum KeepType {
		UNKNOWN = 0,
		KEEP_FOR_ALL = 1,
		UNDO_KEEP_FOR_ALL = 2
	}
	enum MENTION_MENTION_TYPE {
		PROFILE = 0
	}
	enum MediaKeyDomain {
		MEDIA_KEY_DOMAIN_UNKNOWN = 0,
		MEDIA_KEY_DOMAIN_E2EE = 1,
		MEDIA_KEY_DOMAIN_NON_E2EE = 2
	}
	enum MediaVisibility {
		DEFAULT = 0,
		OFF = 1,
		ON = 2
	}
	enum MutationProps {
		STAR_ACTION = 2,
		CONTACT_ACTION = 3,
		MUTE_ACTION = 4,
		PIN_ACTION = 5,
		SECURITY_NOTIFICATION_SETTING = 6,
		PUSH_NAME_SETTING = 7,
		QUICK_REPLY_ACTION = 8,
		RECENT_EMOJI_WEIGHTS_ACTION = 11,
		LABEL_MESSAGE_ACTION = 13,
		LABEL_EDIT_ACTION = 14,
		LABEL_ASSOCIATION_ACTION = 15,
		LOCALE_SETTING = 16,
		ARCHIVE_CHAT_ACTION = 17,
		DELETE_MESSAGE_FOR_ME_ACTION = 18,
		KEY_EXPIRATION = 19,
		MARK_CHAT_AS_READ_ACTION = 20,
		CLEAR_CHAT_ACTION = 21,
		DELETE_CHAT_ACTION = 22,
		UNARCHIVE_CHATS_SETTING = 23,
		PRIMARY_FEATURE = 24,
		ANDROID_UNSUPPORTED_ACTIONS = 26,
		AGENT_ACTION = 27,
		SUBSCRIPTION_ACTION = 28,
		USER_STATUS_MUTE_ACTION = 29,
		TIME_FORMAT_ACTION = 30,
		NUX_ACTION = 31,
		PRIMARY_VERSION_ACTION = 32,
		STICKER_ACTION = 33,
		REMOVE_RECENT_STICKER_ACTION = 34,
		CHAT_ASSIGNMENT = 35,
		CHAT_ASSIGNMENT_OPENED_STATUS = 36,
		PN_FOR_LID_CHAT_ACTION = 37,
		MARKETING_MESSAGE_ACTION = 38,
		MARKETING_MESSAGE_BROADCAST_ACTION = 39,
		EXTERNAL_WEB_BETA_ACTION = 40,
		PRIVACY_SETTING_RELAY_ALL_CALLS = 41,
		CALL_LOG_ACTION = 42,
		UGC_BOT = 43,
		STATUS_PRIVACY = 44,
		BOT_WELCOME_REQUEST_ACTION = 45,
		DELETE_INDIVIDUAL_CALL_LOG = 46,
		LABEL_REORDERING_ACTION = 47,
		PAYMENT_INFO_ACTION = 48,
		CUSTOM_PAYMENT_METHODS_ACTION = 49,
		LOCK_CHAT_ACTION = 50,
		CHAT_LOCK_SETTINGS = 51,
		WAMO_USER_IDENTIFIER_ACTION = 52,
		PRIVACY_SETTING_DISABLE_LINK_PREVIEWS_ACTION = 53,
		DEVICE_CAPABILITIES = 54,
		NOTE_EDIT_ACTION = 55,
		FAVORITES_ACTION = 56,
		MERCHANT_PAYMENT_PARTNER_ACTION = 57,
		WAFFLE_ACCOUNT_LINK_STATE_ACTION = 58,
		USERNAME_CHAT_START_MODE = 59,
		NOTIFICATION_ACTIVITY_SETTING_ACTION = 60,
		LID_CONTACT_ACTION = 61,
		CTWA_PER_CUSTOMER_DATA_SHARING_ACTION = 62,
		PAYMENT_TOS_ACTION = 63,
		PRIVACY_SETTING_CHANNELS_PERSONALISED_RECOMMENDATION_ACTION = 64,
		BUSINESS_BROADCAST_ASSOCIATION_ACTION = 65,
		DETECTED_OUTCOMES_STATUS_ACTION = 66,
		MAIBA_AI_FEATURES_CONTROL_ACTION = 68,
		BUSINESS_BROADCAST_LIST_ACTION = 69,
		MUSIC_USER_ID_ACTION = 70,
		STATUS_POST_OPT_IN_NOTIFICATION_PREFERENCES_ACTION = 71,
		AVATAR_UPDATED_ACTION = 72,
		GALAXY_FLOW_ACTION = 73,
		PRIVATE_PROCESSING_SETTING_ACTION = 74,
		NEWSLETTER_SAVED_INTERESTS_ACTION = 75,
		AI_THREAD_RENAME_ACTION = 76,
		INTERACTIVE_MESSAGE_ACTION = 77,
		SETTINGS_SYNC_ACTION = 78,
		OUT_CONTACT_ACTION = 79,
		NCT_SALT_SYNC_ACTION = 80,
		BUSINESS_BROADCAST_CAMPAIGN_ACTION = 81,
		BUSINESS_BROADCAST_INSIGHTS_ACTION = 82,
		CUSTOMER_DATA_ACTION = 83,
		SUBSCRIPTIONS_SYNC_V2_ACTION = 84,
		THREAD_PIN_ACTION = 85,
		AUTO_ORGANIZE_BUSINESS_CHAT_SETTING = 86,
		BIZ_AI_SETTINGS_NUDGE_ACTION = 87,
		COEX_V2_VERSION_ACTION = 88,
		WASA_ROOT_SECRET_ACTION = 89,
		BUBBLE_LOCK_MESSAGE_ACTION = 90,
		SHARE_OWN_PN = 10001,
		BUSINESS_BROADCAST_ACTION = 10002,
		AI_THREAD_DELETE_ACTION = 10003
	}
	enum PrivacySystemMessage {
		E2EE_MSG = 1,
		NE2EE_SELF = 2,
		NE2EE_OTHER = 3
	}
	enum SessionTransparencyType {
		UNKNOWN_TYPE = 0,
		NY_AI_SAFETY_DISCLAIMER = 1
	}
	enum WebLinkRenderConfig {
		WEBVIEW = 0,
		SYSTEM = 1
	}
	interface IADVDeviceIdentity extends waproto.ADVDeviceIdentity.$Properties {
	}
	class ADVDeviceIdentity {
		constructor(p?: waproto.ADVDeviceIdentity.$Properties)
		$unknowns?: Uint8Array[]
		rawId?: (number|null)
		timestamp?: (number|Long|null)
		keyIndex?: (number|null)
		accountType?: (waproto.ADVEncryptionType|null)
		deviceType?: (waproto.ADVEncryptionType|null)
		static encode(m: waproto.ADVDeviceIdentity.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ADVDeviceIdentity & waproto.ADVDeviceIdentity.$Shape
	}
	namespace ADVDeviceIdentity {
		interface $Properties {
			rawId?: (number|null)
			timestamp?: (number|Long|null)
			keyIndex?: (number|null)
			accountType?: (waproto.ADVEncryptionType|null)
			deviceType?: (waproto.ADVEncryptionType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ADVDeviceIdentity.$Properties
	}
	interface IADVKeyIndexList extends waproto.ADVKeyIndexList.$Properties {
	}
	class ADVKeyIndexList {
		constructor(p?: waproto.ADVKeyIndexList.$Properties)
		$unknowns?: Uint8Array[]
		rawId?: (number|null)
		timestamp?: (number|Long|null)
		currentIndex?: (number|null)
		validIndexes: number[]
		accountType?: (waproto.ADVEncryptionType|null)
		static encode(m: waproto.ADVKeyIndexList.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ADVKeyIndexList & waproto.ADVKeyIndexList.$Shape
	}
	namespace ADVKeyIndexList {
		interface $Properties {
			rawId?: (number|null)
			timestamp?: (number|Long|null)
			currentIndex?: (number|null)
			validIndexes?: (number[]|null)
			accountType?: (waproto.ADVEncryptionType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ADVKeyIndexList.$Properties
	}
	interface IADVSignedDeviceIdentity extends waproto.ADVSignedDeviceIdentity.$Properties {
	}
	class ADVSignedDeviceIdentity {
		constructor(p?: waproto.ADVSignedDeviceIdentity.$Properties)
		$unknowns?: Uint8Array[]
		details?: (Uint8Array|null)
		accountSignatureKey?: (Uint8Array|null)
		accountSignature?: (Uint8Array|null)
		deviceSignature?: (Uint8Array|null)
		static encode(m: waproto.ADVSignedDeviceIdentity.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ADVSignedDeviceIdentity & waproto.ADVSignedDeviceIdentity.$Shape
	}
	namespace ADVSignedDeviceIdentity {
		interface $Properties {
			details?: (Uint8Array|null)
			accountSignatureKey?: (Uint8Array|null)
			accountSignature?: (Uint8Array|null)
			deviceSignature?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ADVSignedDeviceIdentity.$Properties
	}
	interface IADVSignedDeviceIdentityHMAC extends waproto.ADVSignedDeviceIdentityHMAC.$Properties {
	}
	class ADVSignedDeviceIdentityHMAC {
		constructor(p?: waproto.ADVSignedDeviceIdentityHMAC.$Properties)
		$unknowns?: Uint8Array[]
		details?: (Uint8Array|null)
		hmac?: (Uint8Array|null)
		accountType?: (waproto.ADVEncryptionType|null)
		static encode(m: waproto.ADVSignedDeviceIdentityHMAC.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ADVSignedDeviceIdentityHMAC & waproto.ADVSignedDeviceIdentityHMAC.$Shape
	}
	namespace ADVSignedDeviceIdentityHMAC {
		interface $Properties {
			details?: (Uint8Array|null)
			hmac?: (Uint8Array|null)
			accountType?: (waproto.ADVEncryptionType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ADVSignedDeviceIdentityHMAC.$Properties
	}
	interface IADVSignedKeyIndexList extends waproto.ADVSignedKeyIndexList.$Properties {
	}
	class ADVSignedKeyIndexList {
		constructor(p?: waproto.ADVSignedKeyIndexList.$Properties)
		$unknowns?: Uint8Array[]
		details?: (Uint8Array|null)
		accountSignature?: (Uint8Array|null)
		accountSignatureKey?: (Uint8Array|null)
		static encode(m: waproto.ADVSignedKeyIndexList.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ADVSignedKeyIndexList & waproto.ADVSignedKeyIndexList.$Shape
	}
	namespace ADVSignedKeyIndexList {
		interface $Properties {
			details?: (Uint8Array|null)
			accountSignature?: (Uint8Array|null)
			accountSignatureKey?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ADVSignedKeyIndexList.$Properties
	}
	interface IAIHomeState extends waproto.AIHomeState.$Properties {
	}
	class AIHomeState {
		constructor(p?: waproto.AIHomeState.$Properties)
		$unknowns?: Uint8Array[]
		lastFetchTime?: (number|Long|null)
		capabilityOptions: waproto.AIHomeState.AIHomeOption.$Properties[]
		conversationOptions: waproto.AIHomeState.AIHomeOption.$Properties[]
		static encode(m: waproto.AIHomeState.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIHomeState & waproto.AIHomeState.$Shape
	}
	namespace AIHomeState {
		interface $Properties {
			lastFetchTime?: (number|Long|null)
			capabilityOptions?: (waproto.AIHomeState.AIHomeOption.$Properties[]|null)
			conversationOptions?: (waproto.AIHomeState.AIHomeOption.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIHomeState.$Properties
		interface IAIHomeOption extends waproto.AIHomeState.AIHomeOption.$Properties {
		}
		class AIHomeOption {
			constructor(p?: waproto.AIHomeState.AIHomeOption.$Properties)
			$unknowns?: Uint8Array[]
			type?: (waproto.AIHomeState.AIHomeOption.AIHomeActionType|null)
			title?: (string|null)
			promptText?: (string|null)
			sessionId?: (string|null)
			imageWdsIdentifier?: (string|null)
			imageTintColor?: (string|null)
			imageBackgroundColor?: (string|null)
			cardTypeId?: (string|null)
			static encode(m: waproto.AIHomeState.AIHomeOption.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIHomeState.AIHomeOption & waproto.AIHomeState.AIHomeOption.$Shape
		}
		namespace AIHomeOption {
			interface $Properties {
				type?: (waproto.AIHomeState.AIHomeOption.AIHomeActionType|null)
				title?: (string|null)
				promptText?: (string|null)
				sessionId?: (string|null)
				imageWdsIdentifier?: (string|null)
				imageTintColor?: (string|null)
				imageBackgroundColor?: (string|null)
				cardTypeId?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.AIHomeState.AIHomeOption.$Properties
			enum AIHomeActionType {
				PROMPT = 0,
				CREATE_IMAGE = 1,
				ANIMATE_PHOTO = 2,
				ANALYZE_FILE = 3,
				COLLABORATE = 4,
				OPEN_GREETING_CARD = 5
			}
		}
	}
	interface IAIMediaCollectionMessage extends waproto.AIMediaCollectionMessage.$Properties {
	}
	class AIMediaCollectionMessage {
		constructor(p?: waproto.AIMediaCollectionMessage.$Properties)
		$unknowns?: Uint8Array[]
		collectionId?: (string|null)
		expectedMediaCount?: (number|null)
		hasGlobalCaption?: (boolean|null)
		static encode(m: waproto.AIMediaCollectionMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIMediaCollectionMessage & waproto.AIMediaCollectionMessage.$Shape
	}
	namespace AIMediaCollectionMessage {
		interface $Properties {
			collectionId?: (string|null)
			expectedMediaCount?: (number|null)
			hasGlobalCaption?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIMediaCollectionMessage.$Properties
	}
	interface IAIMediaCollectionMetadata extends waproto.AIMediaCollectionMetadata.$Properties {
	}
	class AIMediaCollectionMetadata {
		constructor(p?: waproto.AIMediaCollectionMetadata.$Properties)
		$unknowns?: Uint8Array[]
		collectionId?: (string|null)
		uploadOrderIndex?: (number|null)
		static encode(m: waproto.AIMediaCollectionMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIMediaCollectionMetadata & waproto.AIMediaCollectionMetadata.$Shape
	}
	namespace AIMediaCollectionMetadata {
		interface $Properties {
			collectionId?: (string|null)
			uploadOrderIndex?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIMediaCollectionMetadata.$Properties
	}
	interface IAIMetadataOperation extends waproto.AIMetadataOperation.$Properties {
	}
	class AIMetadataOperation {
		constructor(p?: waproto.AIMetadataOperation.$Properties)
		$unknowns?: Uint8Array[]
		hatchMetadataSync?: (waproto.HatchMetadataSync.$Properties|null)
		static encode(m: waproto.AIMetadataOperation.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIMetadataOperation & waproto.AIMetadataOperation.$Shape
	}
	namespace AIMetadataOperation {
		interface $Properties {
			hatchMetadataSync?: (waproto.HatchMetadataSync.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIMetadataOperation.$Properties
	}
	interface IAIProvenance extends waproto.AIProvenance.$Properties {
	}
	class AIProvenance {
		constructor(p?: waproto.AIProvenance.$Properties)
		$unknowns?: Uint8Array[]
		c2PaMetadata?: (waproto.AIProvenance.Metadata.$Properties|null)
		iptcMetadata?: (waproto.AIProvenance.Metadata.$Properties|null)
		static encode(m: waproto.AIProvenance.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIProvenance & waproto.AIProvenance.$Shape
	}
	namespace AIProvenance {
		interface $Properties {
			c2PaMetadata?: (waproto.AIProvenance.Metadata.$Properties|null)
			iptcMetadata?: (waproto.AIProvenance.Metadata.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIProvenance.$Properties
		interface IMetadata extends waproto.AIProvenance.Metadata.$Properties {
		}
		class Metadata {
			constructor(p?: waproto.AIProvenance.Metadata.$Properties)
			$unknowns?: Uint8Array[]
			createdWithGenAi?: (boolean|null)
			editedWithGenAi?: (boolean|null)
			static encode(m: waproto.AIProvenance.Metadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIProvenance.Metadata & waproto.AIProvenance.Metadata.$Shape
		}
		namespace Metadata {
			interface $Properties {
				createdWithGenAi?: (boolean|null)
				editedWithGenAi?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.AIProvenance.Metadata.$Properties
		}
	}
	interface IAIQueryFanout extends waproto.AIQueryFanout.$Properties {
	}
	class AIQueryFanout {
		constructor(p?: waproto.AIQueryFanout.$Properties)
		$unknowns?: Uint8Array[]
		messageKey?: (waproto.MessageKey.$Properties|null)
		message?: (waproto.Message.$Properties|null)
		timestamp?: (number|Long|null)
		static encode(m: waproto.AIQueryFanout.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIQueryFanout & waproto.AIQueryFanout.$Shape
	}
	namespace AIQueryFanout {
		interface $Properties {
			messageKey?: (waproto.MessageKey.$Properties|null)
			message?: (waproto.Message.$Properties|null)
			timestamp?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIQueryFanout.$Properties
	}
	interface IAIRegenerateMetadata extends waproto.AIRegenerateMetadata.$Properties {
	}
	class AIRegenerateMetadata {
		constructor(p?: waproto.AIRegenerateMetadata.$Properties)
		$unknowns?: Uint8Array[]
		messageKey?: (waproto.MessageKey.$Properties|null)
		responseTimestampMs?: (number|Long|null)
		static encode(m: waproto.AIRegenerateMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRegenerateMetadata & waproto.AIRegenerateMetadata.$Shape
	}
	namespace AIRegenerateMetadata {
		interface $Properties {
			messageKey?: (waproto.MessageKey.$Properties|null)
			responseTimestampMs?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRegenerateMetadata.$Properties
	}
	interface IAIRichResponseCodeMetadata extends waproto.AIRichResponseCodeMetadata.$Properties {
	}
	class AIRichResponseCodeMetadata {
		constructor(p?: waproto.AIRichResponseCodeMetadata.$Properties)
		$unknowns?: Uint8Array[]
		codeLanguage?: (string|null)
		codeBlocks: waproto.AIRichResponseCodeMetadata.AIRichResponseCodeBlock.$Properties[]
		static encode(m: waproto.AIRichResponseCodeMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseCodeMetadata & waproto.AIRichResponseCodeMetadata.$Shape
	}
	namespace AIRichResponseCodeMetadata {
		interface $Properties {
			codeLanguage?: (string|null)
			codeBlocks?: (waproto.AIRichResponseCodeMetadata.AIRichResponseCodeBlock.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRichResponseCodeMetadata.$Properties
		enum AIRichResponseCodeHighlightType {
			AI_RICH_RESPONSE_CODE_HIGHLIGHT_DEFAULT = 0,
			AI_RICH_RESPONSE_CODE_HIGHLIGHT_KEYWORD = 1,
			AI_RICH_RESPONSE_CODE_HIGHLIGHT_METHOD = 2,
			AI_RICH_RESPONSE_CODE_HIGHLIGHT_STRING = 3,
			AI_RICH_RESPONSE_CODE_HIGHLIGHT_NUMBER = 4,
			AI_RICH_RESPONSE_CODE_HIGHLIGHT_COMMENT = 5
		}
		interface IAIRichResponseCodeBlock extends waproto.AIRichResponseCodeMetadata.AIRichResponseCodeBlock.$Properties {
		}
		class AIRichResponseCodeBlock {
			constructor(p?: waproto.AIRichResponseCodeMetadata.AIRichResponseCodeBlock.$Properties)
			$unknowns?: Uint8Array[]
			highlightType?: (waproto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType|null)
			codeContent?: (string|null)
			static encode(m: waproto.AIRichResponseCodeMetadata.AIRichResponseCodeBlock.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseCodeMetadata.AIRichResponseCodeBlock & waproto.AIRichResponseCodeMetadata.AIRichResponseCodeBlock.$Shape
		}
		namespace AIRichResponseCodeBlock {
			interface $Properties {
				highlightType?: (waproto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType|null)
				codeContent?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.AIRichResponseCodeMetadata.AIRichResponseCodeBlock.$Properties
		}
	}
	interface IAIRichResponseContentItemsMetadata extends waproto.AIRichResponseContentItemsMetadata.$Properties {
	}
	class AIRichResponseContentItemsMetadata {
		constructor(p?: waproto.AIRichResponseContentItemsMetadata.$Properties)
		$unknowns?: Uint8Array[]
		itemsMetadata: waproto.AIRichResponseContentItemsMetadata.AIRichResponseContentItemMetadata.$Properties[]
		contentType?: (waproto.AIRichResponseContentItemsMetadata.ContentType|null)
		static encode(m: waproto.AIRichResponseContentItemsMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseContentItemsMetadata & waproto.AIRichResponseContentItemsMetadata.$Shape
	}
	namespace AIRichResponseContentItemsMetadata {
		interface $Properties {
			itemsMetadata?: (waproto.AIRichResponseContentItemsMetadata.AIRichResponseContentItemMetadata.$Properties[]|null)
			contentType?: (waproto.AIRichResponseContentItemsMetadata.ContentType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRichResponseContentItemsMetadata.$Properties
		enum ContentType {
			DEFAULT = 0,
			CAROUSEL = 1
		}
		interface IAIRichResponseContentItemMetadata extends waproto.AIRichResponseContentItemsMetadata.AIRichResponseContentItemMetadata.$Properties {
		}
		class AIRichResponseContentItemMetadata {
			constructor(p?: waproto.AIRichResponseContentItemsMetadata.AIRichResponseContentItemMetadata.$Properties)
			$unknowns?: Uint8Array[]
			reelItem?: (waproto.AIRichResponseContentItemsMetadata.AIRichResponseReelItem.$Properties|null)
			static encode(m: waproto.AIRichResponseContentItemsMetadata.AIRichResponseContentItemMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseContentItemsMetadata.AIRichResponseContentItemMetadata & waproto.AIRichResponseContentItemsMetadata.AIRichResponseContentItemMetadata.$Shape
		}
		namespace AIRichResponseContentItemMetadata {
			interface $Properties {
				reelItem?: (waproto.AIRichResponseContentItemsMetadata.AIRichResponseReelItem.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.AIRichResponseContentItemsMetadata.AIRichResponseContentItemMetadata.$Properties
		}
		interface IAIRichResponseReelItem extends waproto.AIRichResponseContentItemsMetadata.AIRichResponseReelItem.$Properties {
		}
		class AIRichResponseReelItem {
			constructor(p?: waproto.AIRichResponseContentItemsMetadata.AIRichResponseReelItem.$Properties)
			$unknowns?: Uint8Array[]
			title?: (string|null)
			profileIconUrl?: (string|null)
			thumbnailUrl?: (string|null)
			videoUrl?: (string|null)
			static encode(m: waproto.AIRichResponseContentItemsMetadata.AIRichResponseReelItem.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseContentItemsMetadata.AIRichResponseReelItem & waproto.AIRichResponseContentItemsMetadata.AIRichResponseReelItem.$Shape
		}
		namespace AIRichResponseReelItem {
			interface $Properties {
				title?: (string|null)
				profileIconUrl?: (string|null)
				thumbnailUrl?: (string|null)
				videoUrl?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.AIRichResponseContentItemsMetadata.AIRichResponseReelItem.$Properties
		}
	}
	interface IAIRichResponseDynamicMetadata extends waproto.AIRichResponseDynamicMetadata.$Properties {
	}
	class AIRichResponseDynamicMetadata {
		constructor(p?: waproto.AIRichResponseDynamicMetadata.$Properties)
		$unknowns?: Uint8Array[]
		type?: (waproto.AIRichResponseDynamicMetadata.AIRichResponseDynamicMetadataType|null)
		version?: (number|Long|null)
		url?: (string|null)
		loopCount?: (number|null)
		static encode(m: waproto.AIRichResponseDynamicMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseDynamicMetadata & waproto.AIRichResponseDynamicMetadata.$Shape
	}
	namespace AIRichResponseDynamicMetadata {
		interface $Properties {
			type?: (waproto.AIRichResponseDynamicMetadata.AIRichResponseDynamicMetadataType|null)
			version?: (number|Long|null)
			url?: (string|null)
			loopCount?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRichResponseDynamicMetadata.$Properties
		enum AIRichResponseDynamicMetadataType {
			AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_UNKNOWN = 0,
			AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_IMAGE = 1,
			AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_GIF = 2
		}
	}
	interface IAIRichResponseGridImageMetadata extends waproto.AIRichResponseGridImageMetadata.$Properties {
	}
	class AIRichResponseGridImageMetadata {
		constructor(p?: waproto.AIRichResponseGridImageMetadata.$Properties)
		$unknowns?: Uint8Array[]
		gridImageUrl?: (waproto.AIRichResponseImageURL.$Properties|null)
		imageUrls: waproto.AIRichResponseImageURL.$Properties[]
		static encode(m: waproto.AIRichResponseGridImageMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseGridImageMetadata & waproto.AIRichResponseGridImageMetadata.$Shape
	}
	namespace AIRichResponseGridImageMetadata {
		interface $Properties {
			gridImageUrl?: (waproto.AIRichResponseImageURL.$Properties|null)
			imageUrls?: (waproto.AIRichResponseImageURL.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRichResponseGridImageMetadata.$Properties
	}
	interface IAIRichResponseImageURL extends waproto.AIRichResponseImageURL.$Properties {
	}
	class AIRichResponseImageURL {
		constructor(p?: waproto.AIRichResponseImageURL.$Properties)
		$unknowns?: Uint8Array[]
		imagePreviewUrl?: (string|null)
		imageHighResUrl?: (string|null)
		sourceUrl?: (string|null)
		static encode(m: waproto.AIRichResponseImageURL.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseImageURL & waproto.AIRichResponseImageURL.$Shape
	}
	namespace AIRichResponseImageURL {
		interface $Properties {
			imagePreviewUrl?: (string|null)
			imageHighResUrl?: (string|null)
			sourceUrl?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRichResponseImageURL.$Properties
	}
	interface IAIRichResponseInlineImageMetadata extends waproto.AIRichResponseInlineImageMetadata.$Properties {
	}
	class AIRichResponseInlineImageMetadata {
		constructor(p?: waproto.AIRichResponseInlineImageMetadata.$Properties)
		$unknowns?: Uint8Array[]
		imageUrl?: (waproto.AIRichResponseImageURL.$Properties|null)
		imageText?: (string|null)
		alignment?: (waproto.AIRichResponseInlineImageMetadata.AIRichResponseImageAlignment|null)
		tapLinkUrl?: (string|null)
		static encode(m: waproto.AIRichResponseInlineImageMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseInlineImageMetadata & waproto.AIRichResponseInlineImageMetadata.$Shape
	}
	namespace AIRichResponseInlineImageMetadata {
		interface $Properties {
			imageUrl?: (waproto.AIRichResponseImageURL.$Properties|null)
			imageText?: (string|null)
			alignment?: (waproto.AIRichResponseInlineImageMetadata.AIRichResponseImageAlignment|null)
			tapLinkUrl?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRichResponseInlineImageMetadata.$Properties
		enum AIRichResponseImageAlignment {
			AI_RICH_RESPONSE_IMAGE_LAYOUT_LEADING_ALIGNED = 0,
			AI_RICH_RESPONSE_IMAGE_LAYOUT_TRAILING_ALIGNED = 1,
			AI_RICH_RESPONSE_IMAGE_LAYOUT_CENTER_ALIGNED = 2
		}
	}
	interface IAIRichResponseLatexMetadata extends waproto.AIRichResponseLatexMetadata.$Properties {
	}
	class AIRichResponseLatexMetadata {
		constructor(p?: waproto.AIRichResponseLatexMetadata.$Properties)
		$unknowns?: Uint8Array[]
		text?: (string|null)
		expressions: waproto.AIRichResponseLatexMetadata.AIRichResponseLatexExpression.$Properties[]
		static encode(m: waproto.AIRichResponseLatexMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseLatexMetadata & waproto.AIRichResponseLatexMetadata.$Shape
	}
	namespace AIRichResponseLatexMetadata {
		interface $Properties {
			text?: (string|null)
			expressions?: (waproto.AIRichResponseLatexMetadata.AIRichResponseLatexExpression.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRichResponseLatexMetadata.$Properties
		interface IAIRichResponseLatexExpression extends waproto.AIRichResponseLatexMetadata.AIRichResponseLatexExpression.$Properties {
		}
		class AIRichResponseLatexExpression {
			constructor(p?: waproto.AIRichResponseLatexMetadata.AIRichResponseLatexExpression.$Properties)
			$unknowns?: Uint8Array[]
			latexExpression?: (string|null)
			url?: (string|null)
			width?: (number|null)
			height?: (number|null)
			fontHeight?: (number|null)
			imageTopPadding?: (number|null)
			imageLeadingPadding?: (number|null)
			imageBottomPadding?: (number|null)
			imageTrailingPadding?: (number|null)
			static encode(m: waproto.AIRichResponseLatexMetadata.AIRichResponseLatexExpression.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseLatexMetadata.AIRichResponseLatexExpression & waproto.AIRichResponseLatexMetadata.AIRichResponseLatexExpression.$Shape
		}
		namespace AIRichResponseLatexExpression {
			interface $Properties {
				latexExpression?: (string|null)
				url?: (string|null)
				width?: (number|null)
				height?: (number|null)
				fontHeight?: (number|null)
				imageTopPadding?: (number|null)
				imageLeadingPadding?: (number|null)
				imageBottomPadding?: (number|null)
				imageTrailingPadding?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.AIRichResponseLatexMetadata.AIRichResponseLatexExpression.$Properties
		}
	}
	interface IAIRichResponseMapMetadata extends waproto.AIRichResponseMapMetadata.$Properties {
	}
	class AIRichResponseMapMetadata {
		constructor(p?: waproto.AIRichResponseMapMetadata.$Properties)
		$unknowns?: Uint8Array[]
		centerLatitude?: (number|null)
		centerLongitude?: (number|null)
		latitudeDelta?: (number|null)
		longitudeDelta?: (number|null)
		annotations: waproto.AIRichResponseMapMetadata.AIRichResponseMapAnnotation.$Properties[]
		showInfoList?: (boolean|null)
		static encode(m: waproto.AIRichResponseMapMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseMapMetadata & waproto.AIRichResponseMapMetadata.$Shape
	}
	namespace AIRichResponseMapMetadata {
		interface $Properties {
			centerLatitude?: (number|null)
			centerLongitude?: (number|null)
			latitudeDelta?: (number|null)
			longitudeDelta?: (number|null)
			annotations?: (waproto.AIRichResponseMapMetadata.AIRichResponseMapAnnotation.$Properties[]|null)
			showInfoList?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRichResponseMapMetadata.$Properties
		interface IAIRichResponseMapAnnotation extends waproto.AIRichResponseMapMetadata.AIRichResponseMapAnnotation.$Properties {
		}
		class AIRichResponseMapAnnotation {
			constructor(p?: waproto.AIRichResponseMapMetadata.AIRichResponseMapAnnotation.$Properties)
			$unknowns?: Uint8Array[]
			annotationNumber?: (number|null)
			latitude?: (number|null)
			longitude?: (number|null)
			title?: (string|null)
			body?: (string|null)
			static encode(m: waproto.AIRichResponseMapMetadata.AIRichResponseMapAnnotation.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseMapMetadata.AIRichResponseMapAnnotation & waproto.AIRichResponseMapMetadata.AIRichResponseMapAnnotation.$Shape
		}
		namespace AIRichResponseMapAnnotation {
			interface $Properties {
				annotationNumber?: (number|null)
				latitude?: (number|null)
				longitude?: (number|null)
				title?: (string|null)
				body?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.AIRichResponseMapMetadata.AIRichResponseMapAnnotation.$Properties
		}
	}
	interface IAIRichResponseMessage extends waproto.AIRichResponseMessage.$Properties {
	}
	class AIRichResponseMessage {
		constructor(p?: waproto.AIRichResponseMessage.$Properties)
		$unknowns?: Uint8Array[]
		messageType?: (waproto.AIRichResponseMessageType|null)
		submessages: waproto.AIRichResponseSubMessage.$Properties[]
		unifiedResponse?: (waproto.AIRichResponseUnifiedResponse.$Properties|null)
		contextInfo?: (waproto.ContextInfo.$Properties|null)
		static encode(m: waproto.AIRichResponseMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseMessage & waproto.AIRichResponseMessage.$Shape
	}
	namespace AIRichResponseMessage {
		interface $Properties {
			messageType?: (waproto.AIRichResponseMessageType|null)
			submessages?: (waproto.AIRichResponseSubMessage.$Properties[]|null)
			unifiedResponse?: (waproto.AIRichResponseUnifiedResponse.$Properties|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRichResponseMessage.$Properties
	}
	interface IAIRichResponseSubMessage extends waproto.AIRichResponseSubMessage.$Properties {
	}
	class AIRichResponseSubMessage {
		constructor(p?: waproto.AIRichResponseSubMessage.$Properties)
		$unknowns?: Uint8Array[]
		messageType?: (waproto.AIRichResponseSubMessageType|null)
		gridImageMetadata?: (waproto.AIRichResponseGridImageMetadata.$Properties|null)
		messageText?: (string|null)
		imageMetadata?: (waproto.AIRichResponseInlineImageMetadata.$Properties|null)
		codeMetadata?: (waproto.AIRichResponseCodeMetadata.$Properties|null)
		tableMetadata?: (waproto.AIRichResponseTableMetadata.$Properties|null)
		dynamicMetadata?: (waproto.AIRichResponseDynamicMetadata.$Properties|null)
		latexMetadata?: (waproto.AIRichResponseLatexMetadata.$Properties|null)
		mapMetadata?: (waproto.AIRichResponseMapMetadata.$Properties|null)
		contentItemsMetadata?: (waproto.AIRichResponseContentItemsMetadata.$Properties|null)
		static encode(m: waproto.AIRichResponseSubMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseSubMessage & waproto.AIRichResponseSubMessage.$Shape
	}
	namespace AIRichResponseSubMessage {
		interface $Properties {
			messageType?: (waproto.AIRichResponseSubMessageType|null)
			gridImageMetadata?: (waproto.AIRichResponseGridImageMetadata.$Properties|null)
			messageText?: (string|null)
			imageMetadata?: (waproto.AIRichResponseInlineImageMetadata.$Properties|null)
			codeMetadata?: (waproto.AIRichResponseCodeMetadata.$Properties|null)
			tableMetadata?: (waproto.AIRichResponseTableMetadata.$Properties|null)
			dynamicMetadata?: (waproto.AIRichResponseDynamicMetadata.$Properties|null)
			latexMetadata?: (waproto.AIRichResponseLatexMetadata.$Properties|null)
			mapMetadata?: (waproto.AIRichResponseMapMetadata.$Properties|null)
			contentItemsMetadata?: (waproto.AIRichResponseContentItemsMetadata.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRichResponseSubMessage.$Properties
	}
	interface IAIRichResponseTableMetadata extends waproto.AIRichResponseTableMetadata.$Properties {
	}
	class AIRichResponseTableMetadata {
		constructor(p?: waproto.AIRichResponseTableMetadata.$Properties)
		$unknowns?: Uint8Array[]
		rows: waproto.AIRichResponseTableMetadata.AIRichResponseTableRow.$Properties[]
		title?: (string|null)
		static encode(m: waproto.AIRichResponseTableMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseTableMetadata & waproto.AIRichResponseTableMetadata.$Shape
	}
	namespace AIRichResponseTableMetadata {
		interface $Properties {
			rows?: (waproto.AIRichResponseTableMetadata.AIRichResponseTableRow.$Properties[]|null)
			title?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRichResponseTableMetadata.$Properties
		interface IAIRichResponseTableRow extends waproto.AIRichResponseTableMetadata.AIRichResponseTableRow.$Properties {
		}
		class AIRichResponseTableRow {
			constructor(p?: waproto.AIRichResponseTableMetadata.AIRichResponseTableRow.$Properties)
			$unknowns?: Uint8Array[]
			items: string[]
			isHeading?: (boolean|null)
			static encode(m: waproto.AIRichResponseTableMetadata.AIRichResponseTableRow.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseTableMetadata.AIRichResponseTableRow & waproto.AIRichResponseTableMetadata.AIRichResponseTableRow.$Shape
		}
		namespace AIRichResponseTableRow {
			interface $Properties {
				items?: (string[]|null)
				isHeading?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.AIRichResponseTableMetadata.AIRichResponseTableRow.$Properties
		}
	}
	interface IAIRichResponseUnifiedResponse extends waproto.AIRichResponseUnifiedResponse.$Properties {
	}
	class AIRichResponseUnifiedResponse {
		constructor(p?: waproto.AIRichResponseUnifiedResponse.$Properties)
		$unknowns?: Uint8Array[]
		data?: (Uint8Array|null)
		static encode(m: waproto.AIRichResponseUnifiedResponse.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseUnifiedResponse & waproto.AIRichResponseUnifiedResponse.$Shape
	}
	namespace AIRichResponseUnifiedResponse {
		interface $Properties {
			data?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIRichResponseUnifiedResponse.$Properties
	}
	interface IAISubscriptionUpsellMetadata extends waproto.AISubscriptionUpsellMetadata.$Properties {
	}
	class AISubscriptionUpsellMetadata {
		constructor(p?: waproto.AISubscriptionUpsellMetadata.$Properties)
		$unknowns?: Uint8Array[]
		requestType?: (waproto.AISubscriptionRequestType|null)
		static encode(m: waproto.AISubscriptionUpsellMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AISubscriptionUpsellMetadata & waproto.AISubscriptionUpsellMetadata.$Shape
	}
	namespace AISubscriptionUpsellMetadata {
		interface $Properties {
			requestType?: (waproto.AISubscriptionRequestType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AISubscriptionUpsellMetadata.$Properties
	}
	interface IAIThreadInfo extends waproto.AIThreadInfo.$Properties {
	}
	class AIThreadInfo {
		constructor(p?: waproto.AIThreadInfo.$Properties)
		$unknowns?: Uint8Array[]
		serverInfo?: (waproto.AIThreadInfo.AIThreadServerInfo.$Properties|null)
		clientInfo?: (waproto.AIThreadInfo.AIThreadClientInfo.$Properties|null)
		static encode(m: waproto.AIThreadInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIThreadInfo & waproto.AIThreadInfo.$Shape
	}
	namespace AIThreadInfo {
		interface $Properties {
			serverInfo?: (waproto.AIThreadInfo.AIThreadServerInfo.$Properties|null)
			clientInfo?: (waproto.AIThreadInfo.AIThreadClientInfo.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AIThreadInfo.$Properties
		interface IAIThreadClientInfo extends waproto.AIThreadInfo.AIThreadClientInfo.$Properties {
		}
		class AIThreadClientInfo {
			constructor(p?: waproto.AIThreadInfo.AIThreadClientInfo.$Properties)
			$unknowns?: Uint8Array[]
			type?: (waproto.AIThreadInfo.AIThreadClientInfo.AIThreadType|null)
			sourceChatJid?: (string|null)
			static encode(m: waproto.AIThreadInfo.AIThreadClientInfo.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIThreadInfo.AIThreadClientInfo & waproto.AIThreadInfo.AIThreadClientInfo.$Shape
		}
		namespace AIThreadClientInfo {
			interface $Properties {
				type?: (waproto.AIThreadInfo.AIThreadClientInfo.AIThreadType|null)
				sourceChatJid?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.AIThreadInfo.AIThreadClientInfo.$Properties
			enum AIThreadType {
				UNKNOWN = 0,
				DEFAULT = 1,
				INCOGNITO = 2,
				SIDE_CHAT = 3
			}
		}
		interface IAIThreadServerInfo extends waproto.AIThreadInfo.AIThreadServerInfo.$Properties {
		}
		class AIThreadServerInfo {
			constructor(p?: waproto.AIThreadInfo.AIThreadServerInfo.$Properties)
			$unknowns?: Uint8Array[]
			title?: (string|null)
			static encode(m: waproto.AIThreadInfo.AIThreadServerInfo.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIThreadInfo.AIThreadServerInfo & waproto.AIThreadInfo.AIThreadServerInfo.$Shape
		}
		namespace AIThreadServerInfo {
			interface $Properties {
				title?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.AIThreadInfo.AIThreadServerInfo.$Properties
		}
	}
	interface IAccount extends waproto.Account.$Properties {
	}
	class Account {
		constructor(p?: waproto.Account.$Properties)
		$unknowns?: Uint8Array[]
		lid?: (string|null)
		username?: (string|null)
		countryCode?: (string|null)
		isUsernameDeleted?: (boolean|null)
		static encode(m: waproto.Account.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Account & waproto.Account.$Shape
	}
	namespace Account {
		interface $Properties {
			lid?: (string|null)
			username?: (string|null)
			countryCode?: (string|null)
			isUsernameDeleted?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Account.$Properties
	}
	interface IAccountLinkingOpaqueData extends waproto.AccountLinkingOpaqueData.$Properties {
	}
	class AccountLinkingOpaqueData {
		constructor(p?: waproto.AccountLinkingOpaqueData.$Properties)
		$unknowns?: Uint8Array[]
		accesstoken?: (string|null)
		fbid?: (string|null)
		nonce?: (string|null)
		encryptedPassword?: (string|null)
		static encode(m: waproto.AccountLinkingOpaqueData.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AccountLinkingOpaqueData & waproto.AccountLinkingOpaqueData.$Shape
	}
	namespace AccountLinkingOpaqueData {
		interface $Properties {
			accesstoken?: (string|null)
			fbid?: (string|null)
			nonce?: (string|null)
			encryptedPassword?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AccountLinkingOpaqueData.$Properties
	}
	interface IActionLink extends waproto.ActionLink.$Properties {
	}
	class ActionLink {
		constructor(p?: waproto.ActionLink.$Properties)
		$unknowns?: Uint8Array[]
		url?: (string|null)
		buttonTitle?: (string|null)
		static encode(m: waproto.ActionLink.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ActionLink & waproto.ActionLink.$Shape
	}
	namespace ActionLink {
		interface $Properties {
			url?: (string|null)
			buttonTitle?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ActionLink.$Properties
	}
	interface IAutoDownloadSettings extends waproto.AutoDownloadSettings.$Properties {
	}
	class AutoDownloadSettings {
		constructor(p?: waproto.AutoDownloadSettings.$Properties)
		$unknowns?: Uint8Array[]
		downloadImages?: (boolean|null)
		downloadAudio?: (boolean|null)
		downloadVideo?: (boolean|null)
		downloadDocuments?: (boolean|null)
		static encode(m: waproto.AutoDownloadSettings.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AutoDownloadSettings & waproto.AutoDownloadSettings.$Shape
	}
	namespace AutoDownloadSettings {
		interface $Properties {
			downloadImages?: (boolean|null)
			downloadAudio?: (boolean|null)
			downloadVideo?: (boolean|null)
			downloadDocuments?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AutoDownloadSettings.$Properties
	}
	interface IAvatarUserSettings extends waproto.AvatarUserSettings.$Properties {
	}
	class AvatarUserSettings {
		constructor(p?: waproto.AvatarUserSettings.$Properties)
		$unknowns?: Uint8Array[]
		fbid?: (string|null)
		password?: (string|null)
		static encode(m: waproto.AvatarUserSettings.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.AvatarUserSettings & waproto.AvatarUserSettings.$Shape
	}
	namespace AvatarUserSettings {
		interface $Properties {
			fbid?: (string|null)
			password?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.AvatarUserSettings.$Properties
	}
	interface IBizAccountLinkInfo extends waproto.BizAccountLinkInfo.$Properties {
	}
	class BizAccountLinkInfo {
		constructor(p?: waproto.BizAccountLinkInfo.$Properties)
		$unknowns?: Uint8Array[]
		whatsappBizAcctFbid?: (number|Long|null)
		whatsappAcctNumber?: (string|null)
		issueTime?: (number|Long|null)
		hostStorage?: (waproto.BizAccountLinkInfo.HostStorageType|null)
		accountType?: (waproto.BizAccountLinkInfo.AccountType|null)
		static encode(m: waproto.BizAccountLinkInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BizAccountLinkInfo & waproto.BizAccountLinkInfo.$Shape
	}
	namespace BizAccountLinkInfo {
		interface $Properties {
			whatsappBizAcctFbid?: (number|Long|null)
			whatsappAcctNumber?: (string|null)
			issueTime?: (number|Long|null)
			hostStorage?: (waproto.BizAccountLinkInfo.HostStorageType|null)
			accountType?: (waproto.BizAccountLinkInfo.AccountType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BizAccountLinkInfo.$Properties
		enum AccountType {
			ENTERPRISE = 0
		}
		enum HostStorageType {
			ON_PREMISE = 0,
			FACEBOOK = 1
		}
	}
	interface IBizAccountPayload extends waproto.BizAccountPayload.$Properties {
	}
	class BizAccountPayload {
		constructor(p?: waproto.BizAccountPayload.$Properties)
		$unknowns?: Uint8Array[]
		vnameCert?: (waproto.VerifiedNameCertificate.$Properties|null)
		bizAcctLinkInfo?: (Uint8Array|null)
		static encode(m: waproto.BizAccountPayload.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BizAccountPayload & waproto.BizAccountPayload.$Shape
	}
	namespace BizAccountPayload {
		interface $Properties {
			vnameCert?: (waproto.VerifiedNameCertificate.$Properties|null)
			bizAcctLinkInfo?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BizAccountPayload.$Properties
	}
	interface IBizIdentityInfo extends waproto.BizIdentityInfo.$Properties {
	}
	class BizIdentityInfo {
		constructor(p?: waproto.BizIdentityInfo.$Properties)
		$unknowns?: Uint8Array[]
		vlevel?: (waproto.BizIdentityInfo.VerifiedLevelValue|null)
		vnameCert?: (waproto.VerifiedNameCertificate.$Properties|null)
		signed?: (boolean|null)
		revoked?: (boolean|null)
		hostStorage?: (waproto.BizIdentityInfo.HostStorageType|null)
		actualActors?: (waproto.BizIdentityInfo.ActualActorsType|null)
		privacyModeTs?: (number|Long|null)
		featureControls?: (number|Long|null)
		static encode(m: waproto.BizIdentityInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BizIdentityInfo & waproto.BizIdentityInfo.$Shape
	}
	namespace BizIdentityInfo {
		interface $Properties {
			vlevel?: (waproto.BizIdentityInfo.VerifiedLevelValue|null)
			vnameCert?: (waproto.VerifiedNameCertificate.$Properties|null)
			signed?: (boolean|null)
			revoked?: (boolean|null)
			hostStorage?: (waproto.BizIdentityInfo.HostStorageType|null)
			actualActors?: (waproto.BizIdentityInfo.ActualActorsType|null)
			privacyModeTs?: (number|Long|null)
			featureControls?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BizIdentityInfo.$Properties
		enum ActualActorsType {
			SELF = 0,
			BSP = 1
		}
		enum HostStorageType {
			ON_PREMISE = 0,
			FACEBOOK = 1
		}
		enum VerifiedLevelValue {
			UNKNOWN = 0,
			LOW = 1,
			HIGH = 2
		}
	}
	interface IBotAgeCollectionMetadata extends waproto.BotAgeCollectionMetadata.$Properties {
	}
	class BotAgeCollectionMetadata {
		constructor(p?: waproto.BotAgeCollectionMetadata.$Properties)
		$unknowns?: Uint8Array[]
		ageCollectionEligible?: (boolean|null)
		shouldTriggerAgeCollectionOnClient?: (boolean|null)
		ageCollectionType?: (waproto.BotAgeCollectionMetadata.AgeCollectionType|null)
		static encode(m: waproto.BotAgeCollectionMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotAgeCollectionMetadata & waproto.BotAgeCollectionMetadata.$Shape
	}
	namespace BotAgeCollectionMetadata {
		interface $Properties {
			ageCollectionEligible?: (boolean|null)
			shouldTriggerAgeCollectionOnClient?: (boolean|null)
			ageCollectionType?: (waproto.BotAgeCollectionMetadata.AgeCollectionType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotAgeCollectionMetadata.$Properties
		enum AgeCollectionType {
			O18_BINARY = 0,
			WAFFLE = 1
		}
	}
	interface IBotAgentDeepLinkMetadata extends waproto.BotAgentDeepLinkMetadata.$Properties {
	}
	class BotAgentDeepLinkMetadata {
		constructor(p?: waproto.BotAgentDeepLinkMetadata.$Properties)
		$unknowns?: Uint8Array[]
		token?: (string|null)
		clientPublicKey?: (Uint8Array|null)
		static encode(m: waproto.BotAgentDeepLinkMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotAgentDeepLinkMetadata & waproto.BotAgentDeepLinkMetadata.$Shape
	}
	namespace BotAgentDeepLinkMetadata {
		interface $Properties {
			token?: (string|null)
			clientPublicKey?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotAgentDeepLinkMetadata.$Properties
	}
	interface IBotAgentMetadata extends waproto.BotAgentMetadata.$Properties {
	}
	class BotAgentMetadata {
		constructor(p?: waproto.BotAgentMetadata.$Properties)
		$unknowns?: Uint8Array[]
		deepLinkMetadata?: (waproto.BotAgentDeepLinkMetadata.$Properties|null)
		static encode(m: waproto.BotAgentMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotAgentMetadata & waproto.BotAgentMetadata.$Shape
	}
	namespace BotAgentMetadata {
		interface $Properties {
			deepLinkMetadata?: (waproto.BotAgentDeepLinkMetadata.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotAgentMetadata.$Properties
	}
	interface IBotCapabilityMetadata extends waproto.BotCapabilityMetadata.$Properties {
	}
	class BotCapabilityMetadata {
		constructor(p?: waproto.BotCapabilityMetadata.$Properties)
		$unknowns?: Uint8Array[]
		capabilities: waproto.BotCapabilityMetadata.BotCapabilityType[]
		static encode(m: waproto.BotCapabilityMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotCapabilityMetadata & waproto.BotCapabilityMetadata.$Shape
	}
	namespace BotCapabilityMetadata {
		interface $Properties {
			capabilities?: (waproto.BotCapabilityMetadata.BotCapabilityType[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotCapabilityMetadata.$Properties
		enum BotCapabilityType {
			UNKNOWN = 0,
			PROGRESS_INDICATOR = 1,
			RICH_RESPONSE_HEADING = 2,
			RICH_RESPONSE_NESTED_LIST = 3,
			AI_MEMORY = 4,
			RICH_RESPONSE_THREAD_SURFING = 5,
			RICH_RESPONSE_TABLE = 6,
			RICH_RESPONSE_CODE = 7,
			RICH_RESPONSE_STRUCTURED_RESPONSE = 8,
			RICH_RESPONSE_INLINE_IMAGE = 9,
			WA_IG_1P_PLUGIN_RANKING_CONTROL = 10,
			WA_IG_1P_PLUGIN_RANKING_UPDATE_1 = 11,
			WA_IG_1P_PLUGIN_RANKING_UPDATE_2 = 12,
			WA_IG_1P_PLUGIN_RANKING_UPDATE_3 = 13,
			WA_IG_1P_PLUGIN_RANKING_UPDATE_4 = 14,
			WA_IG_1P_PLUGIN_RANKING_UPDATE_5 = 15,
			WA_IG_1P_PLUGIN_RANKING_UPDATE_6 = 16,
			WA_IG_1P_PLUGIN_RANKING_UPDATE_7 = 17,
			WA_IG_1P_PLUGIN_RANKING_UPDATE_8 = 18,
			WA_IG_1P_PLUGIN_RANKING_UPDATE_9 = 19,
			WA_IG_1P_PLUGIN_RANKING_UPDATE_10 = 20,
			RICH_RESPONSE_SUB_HEADING = 21,
			RICH_RESPONSE_GRID_IMAGE = 22,
			AI_STUDIO_UGC_MEMORY = 23,
			RICH_RESPONSE_LATEX = 24,
			RICH_RESPONSE_MAPS = 25,
			RICH_RESPONSE_INLINE_REELS = 26,
			AGENTIC_PLANNING = 27,
			ACCOUNT_LINKING = 28,
			STREAMING_DISAGGREGATION = 29,
			RICH_RESPONSE_GRID_IMAGE_3P = 30,
			RICH_RESPONSE_LATEX_INLINE = 31,
			QUERY_PLAN = 32,
			PROACTIVE_MESSAGE = 33,
			RICH_RESPONSE_UNIFIED_RESPONSE = 34,
			PROMOTION_MESSAGE = 35,
			SIMPLIFIED_PROFILE_PAGE = 36,
			RICH_RESPONSE_SOURCES_IN_MESSAGE = 37,
			RICH_RESPONSE_SIDE_BY_SIDE_SURVEY = 38,
			RICH_RESPONSE_UNIFIED_TEXT_COMPONENT = 39,
			AI_SHARED_MEMORY = 40,
			RICH_RESPONSE_UNIFIED_SOURCES = 41,
			RICH_RESPONSE_UNIFIED_DOMAIN_CITATIONS = 42,
			RICH_RESPONSE_UR_INLINE_REELS_ENABLED = 43,
			RICH_RESPONSE_UR_MEDIA_GRID_ENABLED = 44,
			RICH_RESPONSE_UR_TIMESTAMP_PLACEHOLDER = 45,
			RICH_RESPONSE_IN_APP_SURVEY = 46,
			AI_RESPONSE_MODEL_BRANDING = 47,
			SESSION_TRANSPARENCY_SYSTEM_MESSAGE = 48,
			RICH_RESPONSE_UR_REASONING = 49,
			RICH_RESPONSE_UR_ZEITGEIST_CITATIONS = 50,
			RICH_RESPONSE_UR_ZEITGEIST_CAROUSEL = 51,
			AI_IMAGINE_LOADING_INDICATOR = 52,
			RICH_RESPONSE_UR_IMAGINE = 53,
			AI_IMAGINE_UR_TO_NATIVE_LOADING_INDICATOR = 54,
			RICH_RESPONSE_UR_BLOKS_ENABLED = 55,
			RICH_RESPONSE_INLINE_LINKS_ENABLED = 56,
			RICH_RESPONSE_UR_IMAGINE_VIDEO = 57,
			JSON_PATCH_STREAMING = 58,
			AI_TAB_FORCE_CLIPPY = 59,
			UNIFIED_RESPONSE_EMBEDDED_SCREENS = 60,
			AI_SUBSCRIPTION_ENABLED = 61,
			UNIFIED_RESPONSE_AI_CONTENT_SEARCH_ENABLED = 62,
			UNIFIED_RESPONSE_MARKDOWN_LINKS_ENABLED = 63,
			AI_RICH_RESPONSE_MAPS_V2_ENABLED = 64,
			AI_SUBSCRIPTION_METERING_ENABLED = 65,
			RICH_RESPONSE_SPORTS_WIDGET_ENABLED = 66
		}
	}
	interface IBotCommandMetadata extends waproto.BotCommandMetadata.$Properties {
	}
	class BotCommandMetadata {
		constructor(p?: waproto.BotCommandMetadata.$Properties)
		$unknowns?: Uint8Array[]
		commandName?: (string|null)
		commandDescription?: (string|null)
		commandPrompt?: (string|null)
		static encode(m: waproto.BotCommandMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotCommandMetadata & waproto.BotCommandMetadata.$Shape
	}
	namespace BotCommandMetadata {
		interface $Properties {
			commandName?: (string|null)
			commandDescription?: (string|null)
			commandPrompt?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotCommandMetadata.$Properties
	}
	interface IBotDocumentMessageMetadata extends waproto.BotDocumentMessageMetadata.$Properties {
	}
	class BotDocumentMessageMetadata {
		constructor(p?: waproto.BotDocumentMessageMetadata.$Properties)
		$unknowns?: Uint8Array[]
		pluginType?: (waproto.BotDocumentMessageMetadata.DocumentPluginType|null)
		static encode(m: waproto.BotDocumentMessageMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotDocumentMessageMetadata & waproto.BotDocumentMessageMetadata.$Shape
	}
	namespace BotDocumentMessageMetadata {
		interface $Properties {
			pluginType?: (waproto.BotDocumentMessageMetadata.DocumentPluginType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotDocumentMessageMetadata.$Properties
		enum DocumentPluginType {
			TEXT_EXTRACTION = 0,
			OCR_AND_IMAGES = 1
		}
	}
	interface IBotFeedbackMessage extends waproto.BotFeedbackMessage.$Properties {
	}
	class BotFeedbackMessage {
		constructor(p?: waproto.BotFeedbackMessage.$Properties)
		$unknowns?: Uint8Array[]
		messageKey?: (waproto.MessageKey.$Properties|null)
		kind?: (waproto.BotFeedbackMessage.BotFeedbackKind|null)
		text?: (string|null)
		kindNegative?: (number|Long|null)
		kindPositive?: (number|Long|null)
		kindReport?: (waproto.BotFeedbackMessage.ReportKind|null)
		sideBySideSurveyMetadata?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.$Properties|null)
		static encode(m: waproto.BotFeedbackMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage & waproto.BotFeedbackMessage.$Shape
	}
	namespace BotFeedbackMessage {
		interface $Properties {
			messageKey?: (waproto.MessageKey.$Properties|null)
			kind?: (waproto.BotFeedbackMessage.BotFeedbackKind|null)
			text?: (string|null)
			kindNegative?: (number|Long|null)
			kindPositive?: (number|Long|null)
			kindReport?: (waproto.BotFeedbackMessage.ReportKind|null)
			sideBySideSurveyMetadata?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotFeedbackMessage.$Properties
		enum ReportKind {
			NONE = 0,
			GENERIC = 1
		}
		enum BotFeedbackKindMultiplePositive {
			BOT_FEEDBACK_MULTIPLE_POSITIVE_GENERIC = 1
		}
		enum BotFeedbackKindMultipleNegative {
			BOT_FEEDBACK_MULTIPLE_NEGATIVE_GENERIC = 1,
			BOT_FEEDBACK_MULTIPLE_NEGATIVE_HELPFUL = 2,
			BOT_FEEDBACK_MULTIPLE_NEGATIVE_INTERESTING = 4,
			BOT_FEEDBACK_MULTIPLE_NEGATIVE_ACCURATE = 8,
			BOT_FEEDBACK_MULTIPLE_NEGATIVE_SAFE = 16,
			BOT_FEEDBACK_MULTIPLE_NEGATIVE_OTHER = 32,
			BOT_FEEDBACK_MULTIPLE_NEGATIVE_REFUSED = 64,
			BOT_FEEDBACK_MULTIPLE_NEGATIVE_NOT_VISUALLY_APPEALING = 128,
			BOT_FEEDBACK_MULTIPLE_NEGATIVE_NOT_RELEVANT_TO_TEXT = 256
		}
		enum BotFeedbackKind {
			BOT_FEEDBACK_POSITIVE = 0,
			BOT_FEEDBACK_NEGATIVE_GENERIC = 1,
			BOT_FEEDBACK_NEGATIVE_HELPFUL = 2,
			BOT_FEEDBACK_NEGATIVE_INTERESTING = 3,
			BOT_FEEDBACK_NEGATIVE_ACCURATE = 4,
			BOT_FEEDBACK_NEGATIVE_SAFE = 5,
			BOT_FEEDBACK_NEGATIVE_OTHER = 6,
			BOT_FEEDBACK_NEGATIVE_REFUSED = 7,
			BOT_FEEDBACK_NEGATIVE_NOT_VISUALLY_APPEALING = 8,
			BOT_FEEDBACK_NEGATIVE_NOT_RELEVANT_TO_TEXT = 9,
			BOT_FEEDBACK_NEGATIVE_PERSONALIZED = 10,
			BOT_FEEDBACK_NEGATIVE_CLARITY = 11,
			BOT_FEEDBACK_NEGATIVE_DOESNT_LOOK_LIKE_THE_PERSON = 12,
			BOT_FEEDBACK_NEGATIVE_HALLUCINATION_INTERNAL_ONLY = 13,
			BOT_FEEDBACK_NEGATIVE = 14
		}
		interface ISideBySideSurveyMetadata extends waproto.BotFeedbackMessage.SideBySideSurveyMetadata.$Properties {
		}
		class SideBySideSurveyMetadata {
			constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.$Properties)
			$unknowns?: Uint8Array[]
			selectedRequestId?: (string|null)
			surveyId?: (number|null)
			simonSessionFbid?: (string|null)
			responseOtid?: (string|null)
			responseTimestampMsString?: (string|null)
			isSelectedResponsePrimary?: (boolean|null)
			messageIdToEdit?: (string|null)
			analyticsData?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SideBySideSurveyAnalyticsData.$Properties|null)
			metaAiAnalyticsData?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.$Properties|null)
			static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata & waproto.BotFeedbackMessage.SideBySideSurveyMetadata.$Shape
		}
		namespace SideBySideSurveyMetadata {
			interface $Properties {
				selectedRequestId?: (string|null)
				surveyId?: (number|null)
				simonSessionFbid?: (string|null)
				responseOtid?: (string|null)
				responseTimestampMsString?: (string|null)
				isSelectedResponsePrimary?: (boolean|null)
				messageIdToEdit?: (string|null)
				analyticsData?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SideBySideSurveyAnalyticsData.$Properties|null)
				metaAiAnalyticsData?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.BotFeedbackMessage.SideBySideSurveyMetadata.$Properties
			interface ISidebySideSurveyMetaAiAnalyticsData extends waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.$Properties {
			}
			class SidebySideSurveyMetaAiAnalyticsData {
				constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.$Properties)
				$unknowns?: Uint8Array[]
				surveyId?: (number|null)
				primaryResponseId?: (string|null)
				testArmName?: (string|null)
				timestampMsString?: (string|null)
				ctaImpressionEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAImpressionEventData.$Properties|null)
				ctaClickEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAClickEventData.$Properties|null)
				cardImpressionEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCardImpressionEventData.$Properties|null)
				responseEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyResponseEventData.$Properties|null)
				abandonEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyAbandonEventData.$Properties|null)
				static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData & waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.$Shape
			}
			namespace SidebySideSurveyMetaAiAnalyticsData {
				interface $Properties {
					surveyId?: (number|null)
					primaryResponseId?: (string|null)
					testArmName?: (string|null)
					timestampMsString?: (string|null)
					ctaImpressionEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAImpressionEventData.$Properties|null)
					ctaClickEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAClickEventData.$Properties|null)
					cardImpressionEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCardImpressionEventData.$Properties|null)
					responseEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyResponseEventData.$Properties|null)
					abandonEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyAbandonEventData.$Properties|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.$Properties
				interface ISideBySideSurveyAbandonEventData extends waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyAbandonEventData.$Properties {
				}
				class SideBySideSurveyAbandonEventData {
					constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyAbandonEventData.$Properties)
					$unknowns?: Uint8Array[]
					abandonDwellTimeMsString?: (string|null)
					static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyAbandonEventData.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyAbandonEventData & waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyAbandonEventData.$Shape
				}
				namespace SideBySideSurveyAbandonEventData {
					interface $Properties {
						abandonDwellTimeMsString?: (string|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyAbandonEventData.$Properties
				}
				interface ISideBySideSurveyResponseEventData extends waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyResponseEventData.$Properties {
				}
				class SideBySideSurveyResponseEventData {
					constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyResponseEventData.$Properties)
					$unknowns?: Uint8Array[]
					responseDwellTimeMsString?: (string|null)
					selectedResponseId?: (string|null)
					static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyResponseEventData.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyResponseEventData & waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyResponseEventData.$Shape
				}
				namespace SideBySideSurveyResponseEventData {
					interface $Properties {
						responseDwellTimeMsString?: (string|null)
						selectedResponseId?: (string|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyResponseEventData.$Properties
				}
				interface ISideBySideSurveyCardImpressionEventData extends waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCardImpressionEventData.$Properties {
				}
				class SideBySideSurveyCardImpressionEventData {
					constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCardImpressionEventData.$Properties)
					$unknowns?: Uint8Array[]
					static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCardImpressionEventData.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCardImpressionEventData & waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCardImpressionEventData.$Shape
				}
				namespace SideBySideSurveyCardImpressionEventData {
					interface $Properties {
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCardImpressionEventData.$Properties
				}
				interface ISideBySideSurveyCTAClickEventData extends waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAClickEventData.$Properties {
				}
				class SideBySideSurveyCTAClickEventData {
					constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAClickEventData.$Properties)
					$unknowns?: Uint8Array[]
					isSurveyExpired?: (boolean|null)
					clickDwellTimeMsString?: (string|null)
					static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAClickEventData.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAClickEventData & waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAClickEventData.$Shape
				}
				namespace SideBySideSurveyCTAClickEventData {
					interface $Properties {
						isSurveyExpired?: (boolean|null)
						clickDwellTimeMsString?: (string|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAClickEventData.$Properties
				}
				interface ISideBySideSurveyCTAImpressionEventData extends waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAImpressionEventData.$Properties {
				}
				class SideBySideSurveyCTAImpressionEventData {
					constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAImpressionEventData.$Properties)
					$unknowns?: Uint8Array[]
					isSurveyExpired?: (boolean|null)
					static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAImpressionEventData.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAImpressionEventData & waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAImpressionEventData.$Shape
				}
				namespace SideBySideSurveyCTAImpressionEventData {
					interface $Properties {
						isSurveyExpired?: (boolean|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAImpressionEventData.$Properties
				}
			}
			interface ISideBySideSurveyAnalyticsData extends waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SideBySideSurveyAnalyticsData.$Properties {
			}
			class SideBySideSurveyAnalyticsData {
				constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SideBySideSurveyAnalyticsData.$Properties)
				$unknowns?: Uint8Array[]
				tessaEvent?: (string|null)
				tessaSessionFbid?: (string|null)
				simonSessionFbid?: (string|null)
				static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SideBySideSurveyAnalyticsData.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SideBySideSurveyAnalyticsData & waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SideBySideSurveyAnalyticsData.$Shape
			}
			namespace SideBySideSurveyAnalyticsData {
				interface $Properties {
					tessaEvent?: (string|null)
					tessaSessionFbid?: (string|null)
					simonSessionFbid?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SideBySideSurveyAnalyticsData.$Properties
			}
		}
	}
	interface IBotGroupMetadata extends waproto.BotGroupMetadata.$Properties {
	}
	class BotGroupMetadata {
		constructor(p?: waproto.BotGroupMetadata.$Properties)
		$unknowns?: Uint8Array[]
		participantsMetadata: waproto.BotGroupParticipantMetadata.$Properties[]
		static encode(m: waproto.BotGroupMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotGroupMetadata & waproto.BotGroupMetadata.$Shape
	}
	namespace BotGroupMetadata {
		interface $Properties {
			participantsMetadata?: (waproto.BotGroupParticipantMetadata.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotGroupMetadata.$Properties
	}
	interface IBotGroupParticipantMetadata extends waproto.BotGroupParticipantMetadata.$Properties {
	}
	class BotGroupParticipantMetadata {
		constructor(p?: waproto.BotGroupParticipantMetadata.$Properties)
		$unknowns?: Uint8Array[]
		botFbid?: (string|null)
		static encode(m: waproto.BotGroupParticipantMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotGroupParticipantMetadata & waproto.BotGroupParticipantMetadata.$Shape
	}
	namespace BotGroupParticipantMetadata {
		interface $Properties {
			botFbid?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotGroupParticipantMetadata.$Properties
	}
	interface IBotHistoryShareMetadata extends waproto.BotHistoryShareMetadata.$Properties {
	}
	class BotHistoryShareMetadata {
		constructor(p?: waproto.BotHistoryShareMetadata.$Properties)
		$unknowns?: Uint8Array[]
		participantsMetadata: waproto.BotGroupParticipantMetadata.$Properties[]
		static encode(m: waproto.BotHistoryShareMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotHistoryShareMetadata & waproto.BotHistoryShareMetadata.$Shape
	}
	namespace BotHistoryShareMetadata {
		interface $Properties {
			participantsMetadata?: (waproto.BotGroupParticipantMetadata.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotHistoryShareMetadata.$Properties
	}
	interface IBotImagineMetadata extends waproto.BotImagineMetadata.$Properties {
	}
	class BotImagineMetadata {
		constructor(p?: waproto.BotImagineMetadata.$Properties)
		$unknowns?: Uint8Array[]
		imagineType?: (waproto.BotImagineMetadata.ImagineType|null)
		shortPrompt?: (string|null)
		static encode(m: waproto.BotImagineMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotImagineMetadata & waproto.BotImagineMetadata.$Shape
	}
	namespace BotImagineMetadata {
		interface $Properties {
			imagineType?: (waproto.BotImagineMetadata.ImagineType|null)
			shortPrompt?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotImagineMetadata.$Properties
		enum ImagineType {
			UNKNOWN = 0,
			IMAGINE = 1,
			MEMU = 2,
			FLASH = 3,
			EDIT = 4
		}
	}
	interface IBotInfrastructureDiagnostics extends waproto.BotInfrastructureDiagnostics.$Properties {
	}
	class BotInfrastructureDiagnostics {
		constructor(p?: waproto.BotInfrastructureDiagnostics.$Properties)
		$unknowns?: Uint8Array[]
		botBackend?: (waproto.BotInfrastructureDiagnostics.BotBackend|null)
		toolsUsed: string[]
		isThinking?: (boolean|null)
		static encode(m: waproto.BotInfrastructureDiagnostics.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotInfrastructureDiagnostics & waproto.BotInfrastructureDiagnostics.$Shape
	}
	namespace BotInfrastructureDiagnostics {
		interface $Properties {
			botBackend?: (waproto.BotInfrastructureDiagnostics.BotBackend|null)
			toolsUsed?: (string[]|null)
			isThinking?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotInfrastructureDiagnostics.$Properties
		enum BotBackend {
			AAPI = 0,
			CLIPPY = 1
		}
	}
	interface IBotLinkedAccount extends waproto.BotLinkedAccount.$Properties {
	}
	class BotLinkedAccount {
		constructor(p?: waproto.BotLinkedAccount.$Properties)
		$unknowns?: Uint8Array[]
		type?: (waproto.BotLinkedAccount.BotLinkedAccountType|null)
		static encode(m: waproto.BotLinkedAccount.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotLinkedAccount & waproto.BotLinkedAccount.$Shape
	}
	namespace BotLinkedAccount {
		interface $Properties {
			type?: (waproto.BotLinkedAccount.BotLinkedAccountType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotLinkedAccount.$Properties
		enum BotLinkedAccountType {
			BOT_LINKED_ACCOUNT_TYPE_1P = 0
		}
	}
	interface IBotLinkedAccountsMetadata extends waproto.BotLinkedAccountsMetadata.$Properties {
	}
	class BotLinkedAccountsMetadata {
		constructor(p?: waproto.BotLinkedAccountsMetadata.$Properties)
		$unknowns?: Uint8Array[]
		accounts: waproto.BotLinkedAccount.$Properties[]
		acAuthTokens?: (Uint8Array|null)
		acErrorCode?: (number|null)
		static encode(m: waproto.BotLinkedAccountsMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotLinkedAccountsMetadata & waproto.BotLinkedAccountsMetadata.$Shape
	}
	namespace BotLinkedAccountsMetadata {
		interface $Properties {
			accounts?: (waproto.BotLinkedAccount.$Properties[]|null)
			acAuthTokens?: (Uint8Array|null)
			acErrorCode?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotLinkedAccountsMetadata.$Properties
	}
	interface IBotMediaMetadata extends waproto.BotMediaMetadata.$Properties {
	}
	class BotMediaMetadata {
		constructor(p?: waproto.BotMediaMetadata.$Properties)
		$unknowns?: Uint8Array[]
		fileSha256?: (string|null)
		mediaKey?: (string|null)
		fileEncSha256?: (string|null)
		directPath?: (string|null)
		mediaKeyTimestamp?: (number|Long|null)
		mimetype?: (string|null)
		orientationType?: (waproto.BotMediaMetadata.OrientationType|null)
		static encode(m: waproto.BotMediaMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMediaMetadata & waproto.BotMediaMetadata.$Shape
	}
	namespace BotMediaMetadata {
		interface $Properties {
			fileSha256?: (string|null)
			mediaKey?: (string|null)
			fileEncSha256?: (string|null)
			directPath?: (string|null)
			mediaKeyTimestamp?: (number|Long|null)
			mimetype?: (string|null)
			orientationType?: (waproto.BotMediaMetadata.OrientationType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotMediaMetadata.$Properties
		enum OrientationType {
			CENTER = 1,
			LEFT = 2,
			RIGHT = 3
		}
	}
	interface IBotMemoryFact extends waproto.BotMemoryFact.$Properties {
	}
	class BotMemoryFact {
		constructor(p?: waproto.BotMemoryFact.$Properties)
		$unknowns?: Uint8Array[]
		fact?: (string|null)
		factId?: (string|null)
		static encode(m: waproto.BotMemoryFact.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMemoryFact & waproto.BotMemoryFact.$Shape
	}
	namespace BotMemoryFact {
		interface $Properties {
			fact?: (string|null)
			factId?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotMemoryFact.$Properties
	}
	interface IBotMemoryMetadata extends waproto.BotMemoryMetadata.$Properties {
	}
	class BotMemoryMetadata {
		constructor(p?: waproto.BotMemoryMetadata.$Properties)
		$unknowns?: Uint8Array[]
		addedFacts: waproto.BotMemoryFact.$Properties[]
		removedFacts: waproto.BotMemoryFact.$Properties[]
		disclaimer?: (string|null)
		static encode(m: waproto.BotMemoryMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMemoryMetadata & waproto.BotMemoryMetadata.$Shape
	}
	namespace BotMemoryMetadata {
		interface $Properties {
			addedFacts?: (waproto.BotMemoryFact.$Properties[]|null)
			removedFacts?: (waproto.BotMemoryFact.$Properties[]|null)
			disclaimer?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotMemoryMetadata.$Properties
	}
	interface IBotMemuMetadata extends waproto.BotMemuMetadata.$Properties {
	}
	class BotMemuMetadata {
		constructor(p?: waproto.BotMemuMetadata.$Properties)
		$unknowns?: Uint8Array[]
		faceImages: waproto.BotMediaMetadata.$Properties[]
		static encode(m: waproto.BotMemuMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMemuMetadata & waproto.BotMemuMetadata.$Shape
	}
	namespace BotMemuMetadata {
		interface $Properties {
			faceImages?: (waproto.BotMediaMetadata.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotMemuMetadata.$Properties
	}
	interface IBotMessageOrigin extends waproto.BotMessageOrigin.$Properties {
	}
	class BotMessageOrigin {
		constructor(p?: waproto.BotMessageOrigin.$Properties)
		$unknowns?: Uint8Array[]
		type?: (waproto.BotMessageOrigin.BotMessageOriginType|null)
		static encode(m: waproto.BotMessageOrigin.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMessageOrigin & waproto.BotMessageOrigin.$Shape
	}
	namespace BotMessageOrigin {
		interface $Properties {
			type?: (waproto.BotMessageOrigin.BotMessageOriginType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotMessageOrigin.$Properties
		enum BotMessageOriginType {
			BOT_MESSAGE_ORIGIN_TYPE_AI_INITIATED = 0
		}
	}
	interface IBotMessageOriginMetadata extends waproto.BotMessageOriginMetadata.$Properties {
	}
	class BotMessageOriginMetadata {
		constructor(p?: waproto.BotMessageOriginMetadata.$Properties)
		$unknowns?: Uint8Array[]
		origins: waproto.BotMessageOrigin.$Properties[]
		static encode(m: waproto.BotMessageOriginMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMessageOriginMetadata & waproto.BotMessageOriginMetadata.$Shape
	}
	namespace BotMessageOriginMetadata {
		interface $Properties {
			origins?: (waproto.BotMessageOrigin.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotMessageOriginMetadata.$Properties
	}
	interface IBotMessageSharingInfo extends waproto.BotMessageSharingInfo.$Properties {
	}
	class BotMessageSharingInfo {
		constructor(p?: waproto.BotMessageSharingInfo.$Properties)
		$unknowns?: Uint8Array[]
		botEntryPointOrigin?: (waproto.BotMetricsEntryPoint|null)
		forwardScore?: (number|null)
		static encode(m: waproto.BotMessageSharingInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMessageSharingInfo & waproto.BotMessageSharingInfo.$Shape
	}
	namespace BotMessageSharingInfo {
		interface $Properties {
			botEntryPointOrigin?: (waproto.BotMetricsEntryPoint|null)
			forwardScore?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotMessageSharingInfo.$Properties
	}
	interface IBotMetadata extends waproto.BotMetadata.$Properties {
	}
	class BotMetadata {
		constructor(p?: waproto.BotMetadata.$Properties)
		$unknowns?: Uint8Array[]
		personaId?: (string|null)
		pluginMetadata?: (waproto.BotPluginMetadata.$Properties|null)
		suggestedPromptMetadata?: (waproto.BotSuggestedPromptMetadata.$Properties|null)
		invokerJid?: (string|null)
		sessionMetadata?: (waproto.BotSessionMetadata.$Properties|null)
		memuMetadata?: (waproto.BotMemuMetadata.$Properties|null)
		timezone?: (string|null)
		reminderMetadata?: (waproto.BotReminderMetadata.$Properties|null)
		modelMetadata?: (waproto.BotModelMetadata.$Properties|null)
		messageDisclaimerText?: (string|null)
		progressIndicatorMetadata?: (waproto.BotProgressIndicatorMetadata.$Properties|null)
		capabilityMetadata?: (waproto.BotCapabilityMetadata.$Properties|null)
		imagineMetadata?: (waproto.BotImagineMetadata.$Properties|null)
		memoryMetadata?: (waproto.BotMemoryMetadata.$Properties|null)
		renderingMetadata?: (waproto.BotRenderingMetadata.$Properties|null)
		botMetricsMetadata?: (waproto.BotMetricsMetadata.$Properties|null)
		botLinkedAccountsMetadata?: (waproto.BotLinkedAccountsMetadata.$Properties|null)
		richResponseSourcesMetadata?: (waproto.BotSourcesMetadata.$Properties|null)
		aiConversationContext?: (Uint8Array|null)
		botPromotionMessageMetadata?: (waproto.BotPromotionMessageMetadata.$Properties|null)
		botModeSelectionMetadata?: (waproto.BotModeSelectionMetadata.$Properties|null)
		botQuotaMetadata?: (waproto.BotQuotaMetadata.$Properties|null)
		botAgeCollectionMetadata?: (waproto.BotAgeCollectionMetadata.$Properties|null)
		conversationStarterPromptId?: (string|null)
		botResponseId?: (string|null)
		verificationMetadata?: (waproto.BotSignatureVerificationMetadata.$Properties|null)
		unifiedResponseMutation?: (waproto.BotUnifiedResponseMutation.$Properties|null)
		botMessageOriginMetadata?: (waproto.BotMessageOriginMetadata.$Properties|null)
		inThreadSurveyMetadata?: (waproto.InThreadSurveyMetadata.$Properties|null)
		botThreadInfo?: (waproto.AIThreadInfo.$Properties|null)
		regenerateMetadata?: (waproto.AIRegenerateMetadata.$Properties|null)
		sessionTransparencyMetadata?: (waproto.SessionTransparencyMetadata.$Properties|null)
		botDocumentMessageMetadata?: (waproto.BotDocumentMessageMetadata.$Properties|null)
		botGroupMetadata?: (waproto.BotGroupMetadata.$Properties|null)
		botRenderingConfigMetadata?: (waproto.BotRenderingConfigMetadata.$Properties|null)
		botInfrastructureDiagnostics?: (waproto.BotInfrastructureDiagnostics.$Properties|null)
		aiMediaCollectionMetadata?: (waproto.AIMediaCollectionMetadata.$Properties|null)
		commandMetadata?: (waproto.BotCommandMetadata.$Properties|null)
		resolvedToolCallMetadata?: (waproto.BotResolvedToolCallMetadata.$Properties|null)
		subscriptionUpsellMetadata?: (waproto.AISubscriptionUpsellMetadata.$Properties|null)
		pttPromptMetadata?: (waproto.BotPttPromptMetadata.$Properties|null)
		botHistoryShareMetadata?: (waproto.BotHistoryShareMetadata.$Properties|null)
		internalMetadata?: (Uint8Array|null)
		static encode(m: waproto.BotMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMetadata & waproto.BotMetadata.$Shape
	}
	namespace BotMetadata {
		interface $Properties {
			personaId?: (string|null)
			pluginMetadata?: (waproto.BotPluginMetadata.$Properties|null)
			suggestedPromptMetadata?: (waproto.BotSuggestedPromptMetadata.$Properties|null)
			invokerJid?: (string|null)
			sessionMetadata?: (waproto.BotSessionMetadata.$Properties|null)
			memuMetadata?: (waproto.BotMemuMetadata.$Properties|null)
			timezone?: (string|null)
			reminderMetadata?: (waproto.BotReminderMetadata.$Properties|null)
			modelMetadata?: (waproto.BotModelMetadata.$Properties|null)
			messageDisclaimerText?: (string|null)
			progressIndicatorMetadata?: (waproto.BotProgressIndicatorMetadata.$Properties|null)
			capabilityMetadata?: (waproto.BotCapabilityMetadata.$Properties|null)
			imagineMetadata?: (waproto.BotImagineMetadata.$Properties|null)
			memoryMetadata?: (waproto.BotMemoryMetadata.$Properties|null)
			renderingMetadata?: (waproto.BotRenderingMetadata.$Properties|null)
			botMetricsMetadata?: (waproto.BotMetricsMetadata.$Properties|null)
			botLinkedAccountsMetadata?: (waproto.BotLinkedAccountsMetadata.$Properties|null)
			richResponseSourcesMetadata?: (waproto.BotSourcesMetadata.$Properties|null)
			aiConversationContext?: (Uint8Array|null)
			botPromotionMessageMetadata?: (waproto.BotPromotionMessageMetadata.$Properties|null)
			botModeSelectionMetadata?: (waproto.BotModeSelectionMetadata.$Properties|null)
			botQuotaMetadata?: (waproto.BotQuotaMetadata.$Properties|null)
			botAgeCollectionMetadata?: (waproto.BotAgeCollectionMetadata.$Properties|null)
			conversationStarterPromptId?: (string|null)
			botResponseId?: (string|null)
			verificationMetadata?: (waproto.BotSignatureVerificationMetadata.$Properties|null)
			unifiedResponseMutation?: (waproto.BotUnifiedResponseMutation.$Properties|null)
			botMessageOriginMetadata?: (waproto.BotMessageOriginMetadata.$Properties|null)
			inThreadSurveyMetadata?: (waproto.InThreadSurveyMetadata.$Properties|null)
			botThreadInfo?: (waproto.AIThreadInfo.$Properties|null)
			regenerateMetadata?: (waproto.AIRegenerateMetadata.$Properties|null)
			sessionTransparencyMetadata?: (waproto.SessionTransparencyMetadata.$Properties|null)
			botDocumentMessageMetadata?: (waproto.BotDocumentMessageMetadata.$Properties|null)
			botGroupMetadata?: (waproto.BotGroupMetadata.$Properties|null)
			botRenderingConfigMetadata?: (waproto.BotRenderingConfigMetadata.$Properties|null)
			botInfrastructureDiagnostics?: (waproto.BotInfrastructureDiagnostics.$Properties|null)
			aiMediaCollectionMetadata?: (waproto.AIMediaCollectionMetadata.$Properties|null)
			commandMetadata?: (waproto.BotCommandMetadata.$Properties|null)
			resolvedToolCallMetadata?: (waproto.BotResolvedToolCallMetadata.$Properties|null)
			subscriptionUpsellMetadata?: (waproto.AISubscriptionUpsellMetadata.$Properties|null)
			pttPromptMetadata?: (waproto.BotPttPromptMetadata.$Properties|null)
			botHistoryShareMetadata?: (waproto.BotHistoryShareMetadata.$Properties|null)
			internalMetadata?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotMetadata.$Properties
	}
	interface IBotMetricsMetadata extends waproto.BotMetricsMetadata.$Properties {
	}
	class BotMetricsMetadata {
		constructor(p?: waproto.BotMetricsMetadata.$Properties)
		$unknowns?: Uint8Array[]
		destinationId?: (string|null)
		destinationEntryPoint?: (waproto.BotMetricsEntryPoint|null)
		threadOrigin?: (waproto.BotMetricsThreadEntryPoint|null)
		static encode(m: waproto.BotMetricsMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMetricsMetadata & waproto.BotMetricsMetadata.$Shape
	}
	namespace BotMetricsMetadata {
		interface $Properties {
			destinationId?: (string|null)
			destinationEntryPoint?: (waproto.BotMetricsEntryPoint|null)
			threadOrigin?: (waproto.BotMetricsThreadEntryPoint|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotMetricsMetadata.$Properties
	}
	interface IBotModeSelectionMetadata extends waproto.BotModeSelectionMetadata.$Properties {
	}
	class BotModeSelectionMetadata {
		constructor(p?: waproto.BotModeSelectionMetadata.$Properties)
		$unknowns?: Uint8Array[]
		mode: waproto.BotModeSelectionMetadata.BotUserSelectionMode[]
		overrideMode: number[]
		static encode(m: waproto.BotModeSelectionMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotModeSelectionMetadata & waproto.BotModeSelectionMetadata.$Shape
	}
	namespace BotModeSelectionMetadata {
		interface $Properties {
			mode?: (waproto.BotModeSelectionMetadata.BotUserSelectionMode[]|null)
			overrideMode?: (number[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotModeSelectionMetadata.$Properties
		enum BotUserSelectionMode {
			DEFAULT_MODE = 0,
			THINK_HARD_MODE = 1
		}
	}
	interface IBotModelMetadata extends waproto.BotModelMetadata.$Properties {
	}
	class BotModelMetadata {
		constructor(p?: waproto.BotModelMetadata.$Properties)
		$unknowns?: Uint8Array[]
		modelType?: (waproto.BotModelMetadata.ModelType|null)
		premiumModelStatus?: (waproto.BotModelMetadata.PremiumModelStatus|null)
		modelNameOverride?: (string|null)
		static encode(m: waproto.BotModelMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotModelMetadata & waproto.BotModelMetadata.$Shape
	}
	namespace BotModelMetadata {
		interface $Properties {
			modelType?: (waproto.BotModelMetadata.ModelType|null)
			premiumModelStatus?: (waproto.BotModelMetadata.PremiumModelStatus|null)
			modelNameOverride?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotModelMetadata.$Properties
		enum PremiumModelStatus {
			UNKNOWN_STATUS = 0,
			AVAILABLE = 1,
			QUOTA_EXCEED_LIMIT = 2
		}
		enum ModelType {
			UNKNOWN_TYPE = 0,
			LLAMA_PROD = 1,
			LLAMA_PROD_PREMIUM = 2
		}
	}
	interface IBotPluginMetadata extends waproto.BotPluginMetadata.$Properties {
	}
	class BotPluginMetadata {
		constructor(p?: waproto.BotPluginMetadata.$Properties)
		$unknowns?: Uint8Array[]
		provider?: (waproto.BotPluginMetadata.SearchProvider|null)
		pluginType?: (waproto.BotPluginMetadata.PluginType|null)
		thumbnailCdnUrl?: (string|null)
		profilePhotoCdnUrl?: (string|null)
		searchProviderUrl?: (string|null)
		referenceIndex?: (number|null)
		expectedLinksCount?: (number|null)
		searchQuery?: (string|null)
		parentPluginMessageKey?: (waproto.MessageKey.$Properties|null)
		deprecatedField?: (waproto.BotPluginMetadata.PluginType|null)
		parentPluginType?: (waproto.BotPluginMetadata.PluginType|null)
		faviconCdnUrl?: (string|null)
		static encode(m: waproto.BotPluginMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotPluginMetadata & waproto.BotPluginMetadata.$Shape
	}
	namespace BotPluginMetadata {
		interface $Properties {
			provider?: (waproto.BotPluginMetadata.SearchProvider|null)
			pluginType?: (waproto.BotPluginMetadata.PluginType|null)
			thumbnailCdnUrl?: (string|null)
			profilePhotoCdnUrl?: (string|null)
			searchProviderUrl?: (string|null)
			referenceIndex?: (number|null)
			expectedLinksCount?: (number|null)
			searchQuery?: (string|null)
			parentPluginMessageKey?: (waproto.MessageKey.$Properties|null)
			deprecatedField?: (waproto.BotPluginMetadata.PluginType|null)
			parentPluginType?: (waproto.BotPluginMetadata.PluginType|null)
			faviconCdnUrl?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotPluginMetadata.$Properties
		enum PluginType {
			UNKNOWN_PLUGIN = 0,
			REELS = 1,
			SEARCH = 2
		}
		enum SearchProvider {
			UNKNOWN = 0,
			BING = 1,
			GOOGLE = 2,
			SUPPORT = 3
		}
	}
	interface IBotProgressIndicatorMetadata extends waproto.BotProgressIndicatorMetadata.$Properties {
	}
	class BotProgressIndicatorMetadata {
		constructor(p?: waproto.BotProgressIndicatorMetadata.$Properties)
		$unknowns?: Uint8Array[]
		progressDescription?: (string|null)
		stepsMetadata: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.$Properties[]
		estimatedCompletionTime?: (number|Long|null)
		static encode(m: waproto.BotProgressIndicatorMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotProgressIndicatorMetadata & waproto.BotProgressIndicatorMetadata.$Shape
	}
	namespace BotProgressIndicatorMetadata {
		interface $Properties {
			progressDescription?: (string|null)
			stepsMetadata?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.$Properties[]|null)
			estimatedCompletionTime?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotProgressIndicatorMetadata.$Properties
		interface IBotPlanningStepMetadata extends waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.$Properties {
		}
		class BotPlanningStepMetadata {
			constructor(p?: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.$Properties)
			$unknowns?: Uint8Array[]
			statusTitle?: (string|null)
			statusBody?: (string|null)
			sourcesMetadata: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata.$Properties[]
			status?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.PlanningStepStatus|null)
			isReasoning?: (boolean|null)
			isEnhancedSearch?: (boolean|null)
			sections: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningStepSectionMetadata.$Properties[]
			static encode(m: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata & waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.$Shape
		}
		namespace BotPlanningStepMetadata {
			interface $Properties {
				statusTitle?: (string|null)
				statusBody?: (string|null)
				sourcesMetadata?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata.$Properties[]|null)
				status?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.PlanningStepStatus|null)
				isReasoning?: (boolean|null)
				isEnhancedSearch?: (boolean|null)
				sections?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningStepSectionMetadata.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.$Properties
			enum BotSearchSourceProvider {
				UNKNOWN_PROVIDER = 0,
				OTHER = 1,
				GOOGLE = 2,
				BING = 3
			}
			enum PlanningStepStatus {
				UNKNOWN = 0,
				PLANNED = 1,
				EXECUTING = 2,
				FINISHED = 3
			}
			interface IBotPlanningStepSectionMetadata extends waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningStepSectionMetadata.$Properties {
			}
			class BotPlanningStepSectionMetadata {
				constructor(p?: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningStepSectionMetadata.$Properties)
				$unknowns?: Uint8Array[]
				sectionTitle?: (string|null)
				sectionBody?: (string|null)
				sourcesMetadata: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourceMetadata.$Properties[]
				static encode(m: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningStepSectionMetadata.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningStepSectionMetadata & waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningStepSectionMetadata.$Shape
			}
			namespace BotPlanningStepSectionMetadata {
				interface $Properties {
					sectionTitle?: (string|null)
					sectionBody?: (string|null)
					sourcesMetadata?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourceMetadata.$Properties[]|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningStepSectionMetadata.$Properties
			}
			interface IBotPlanningSearchSourceMetadata extends waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourceMetadata.$Properties {
			}
			class BotPlanningSearchSourceMetadata {
				constructor(p?: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourceMetadata.$Properties)
				$unknowns?: Uint8Array[]
				title?: (string|null)
				provider?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotSearchSourceProvider|null)
				sourceUrl?: (string|null)
				favIconUrl?: (string|null)
				static encode(m: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourceMetadata.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourceMetadata & waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourceMetadata.$Shape
			}
			namespace BotPlanningSearchSourceMetadata {
				interface $Properties {
					title?: (string|null)
					provider?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotSearchSourceProvider|null)
					sourceUrl?: (string|null)
					favIconUrl?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourceMetadata.$Properties
			}
			interface IBotPlanningSearchSourcesMetadata extends waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata.$Properties {
			}
			class BotPlanningSearchSourcesMetadata {
				constructor(p?: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata.$Properties)
				$unknowns?: Uint8Array[]
				sourceTitle?: (string|null)
				provider?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata.BotPlanningSearchSourceProvider|null)
				sourceUrl?: (string|null)
				static encode(m: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata & waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata.$Shape
			}
			namespace BotPlanningSearchSourcesMetadata {
				interface $Properties {
					sourceTitle?: (string|null)
					provider?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata.BotPlanningSearchSourceProvider|null)
					sourceUrl?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata.$Properties
				enum BotPlanningSearchSourceProvider {
					UNKNOWN = 0,
					OTHER = 1,
					GOOGLE = 2,
					BING = 3
				}
			}
		}
	}
	interface IBotPromotionMessageMetadata extends waproto.BotPromotionMessageMetadata.$Properties {
	}
	class BotPromotionMessageMetadata {
		constructor(p?: waproto.BotPromotionMessageMetadata.$Properties)
		$unknowns?: Uint8Array[]
		promotionType?: (waproto.BotPromotionMessageMetadata.BotPromotionType|null)
		buttonTitle?: (string|null)
		static encode(m: waproto.BotPromotionMessageMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotPromotionMessageMetadata & waproto.BotPromotionMessageMetadata.$Shape
	}
	namespace BotPromotionMessageMetadata {
		interface $Properties {
			promotionType?: (waproto.BotPromotionMessageMetadata.BotPromotionType|null)
			buttonTitle?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotPromotionMessageMetadata.$Properties
		enum BotPromotionType {
			UNKNOWN_TYPE = 0,
			C50 = 1,
			SURVEY_PLATFORM = 2
		}
	}
	interface IBotPromptSuggestion extends waproto.BotPromptSuggestion.$Properties {
	}
	class BotPromptSuggestion {
		constructor(p?: waproto.BotPromptSuggestion.$Properties)
		$unknowns?: Uint8Array[]
		prompt?: (string|null)
		promptId?: (string|null)
		static encode(m: waproto.BotPromptSuggestion.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotPromptSuggestion & waproto.BotPromptSuggestion.$Shape
	}
	namespace BotPromptSuggestion {
		interface $Properties {
			prompt?: (string|null)
			promptId?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotPromptSuggestion.$Properties
	}
	interface IBotPromptSuggestions extends waproto.BotPromptSuggestions.$Properties {
	}
	class BotPromptSuggestions {
		constructor(p?: waproto.BotPromptSuggestions.$Properties)
		$unknowns?: Uint8Array[]
		suggestions: waproto.BotPromptSuggestion.$Properties[]
		static encode(m: waproto.BotPromptSuggestions.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotPromptSuggestions & waproto.BotPromptSuggestions.$Shape
	}
	namespace BotPromptSuggestions {
		interface $Properties {
			suggestions?: (waproto.BotPromptSuggestion.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotPromptSuggestions.$Properties
	}
	interface IBotPttPromptMetadata extends waproto.BotPttPromptMetadata.$Properties {
	}
	class BotPttPromptMetadata {
		constructor(p?: waproto.BotPttPromptMetadata.$Properties)
		$unknowns?: Uint8Array[]
		transcript?: (string|null)
		static encode(m: waproto.BotPttPromptMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotPttPromptMetadata & waproto.BotPttPromptMetadata.$Shape
	}
	namespace BotPttPromptMetadata {
		interface $Properties {
			transcript?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotPttPromptMetadata.$Properties
	}
	interface IBotQuotaMetadata extends waproto.BotQuotaMetadata.$Properties {
	}
	class BotQuotaMetadata {
		constructor(p?: waproto.BotQuotaMetadata.$Properties)
		$unknowns?: Uint8Array[]
		botFeatureQuotaMetadata: waproto.BotQuotaMetadata.BotFeatureQuotaMetadata.$Properties[]
		static encode(m: waproto.BotQuotaMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotQuotaMetadata & waproto.BotQuotaMetadata.$Shape
	}
	namespace BotQuotaMetadata {
		interface $Properties {
			botFeatureQuotaMetadata?: (waproto.BotQuotaMetadata.BotFeatureQuotaMetadata.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotQuotaMetadata.$Properties
		interface IBotFeatureQuotaMetadata extends waproto.BotQuotaMetadata.BotFeatureQuotaMetadata.$Properties {
		}
		class BotFeatureQuotaMetadata {
			constructor(p?: waproto.BotQuotaMetadata.BotFeatureQuotaMetadata.$Properties)
			$unknowns?: Uint8Array[]
			featureType?: (waproto.BotQuotaMetadata.BotFeatureQuotaMetadata.BotFeatureType|null)
			remainingQuota?: (number|null)
			expirationTimestamp?: (number|Long|null)
			static encode(m: waproto.BotQuotaMetadata.BotFeatureQuotaMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotQuotaMetadata.BotFeatureQuotaMetadata & waproto.BotQuotaMetadata.BotFeatureQuotaMetadata.$Shape
		}
		namespace BotFeatureQuotaMetadata {
			interface $Properties {
				featureType?: (waproto.BotQuotaMetadata.BotFeatureQuotaMetadata.BotFeatureType|null)
				remainingQuota?: (number|null)
				expirationTimestamp?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.BotQuotaMetadata.BotFeatureQuotaMetadata.$Properties
			enum BotFeatureType {
				UNKNOWN_FEATURE = 0,
				REASONING_FEATURE = 1
			}
		}
	}
	interface IBotReminderMetadata extends waproto.BotReminderMetadata.$Properties {
	}
	class BotReminderMetadata {
		constructor(p?: waproto.BotReminderMetadata.$Properties)
		$unknowns?: Uint8Array[]
		requestMessageKey?: (waproto.MessageKey.$Properties|null)
		action?: (waproto.BotReminderMetadata.ReminderAction|null)
		name?: (string|null)
		nextTriggerTimestamp?: (number|Long|null)
		frequency?: (waproto.BotReminderMetadata.ReminderFrequency|null)
		static encode(m: waproto.BotReminderMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotReminderMetadata & waproto.BotReminderMetadata.$Shape
	}
	namespace BotReminderMetadata {
		interface $Properties {
			requestMessageKey?: (waproto.MessageKey.$Properties|null)
			action?: (waproto.BotReminderMetadata.ReminderAction|null)
			name?: (string|null)
			nextTriggerTimestamp?: (number|Long|null)
			frequency?: (waproto.BotReminderMetadata.ReminderFrequency|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotReminderMetadata.$Properties
		enum ReminderFrequency {
			ONCE = 1,
			DAILY = 2,
			WEEKLY = 3,
			BIWEEKLY = 4,
			MONTHLY = 5
		}
		enum ReminderAction {
			NOTIFY = 1,
			CREATE = 2,
			DELETE = 3,
			UPDATE = 4
		}
	}
	interface IBotRenderingConfigMetadata extends waproto.BotRenderingConfigMetadata.$Properties {
	}
	class BotRenderingConfigMetadata {
		constructor(p?: waproto.BotRenderingConfigMetadata.$Properties)
		$unknowns?: Uint8Array[]
		bloksVersioningId?: (string|null)
		pixelDensity?: (number|null)
		static encode(m: waproto.BotRenderingConfigMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotRenderingConfigMetadata & waproto.BotRenderingConfigMetadata.$Shape
	}
	namespace BotRenderingConfigMetadata {
		interface $Properties {
			bloksVersioningId?: (string|null)
			pixelDensity?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotRenderingConfigMetadata.$Properties
	}
	interface IBotRenderingMetadata extends waproto.BotRenderingMetadata.$Properties {
	}
	class BotRenderingMetadata {
		constructor(p?: waproto.BotRenderingMetadata.$Properties)
		$unknowns?: Uint8Array[]
		keywords: waproto.BotRenderingMetadata.Keyword.$Properties[]
		static encode(m: waproto.BotRenderingMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotRenderingMetadata & waproto.BotRenderingMetadata.$Shape
	}
	namespace BotRenderingMetadata {
		interface $Properties {
			keywords?: (waproto.BotRenderingMetadata.Keyword.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotRenderingMetadata.$Properties
		interface IKeyword extends waproto.BotRenderingMetadata.Keyword.$Properties {
		}
		class Keyword {
			constructor(p?: waproto.BotRenderingMetadata.Keyword.$Properties)
			$unknowns?: Uint8Array[]
			value?: (string|null)
			associatedPrompts: string[]
			static encode(m: waproto.BotRenderingMetadata.Keyword.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotRenderingMetadata.Keyword & waproto.BotRenderingMetadata.Keyword.$Shape
		}
		namespace Keyword {
			interface $Properties {
				value?: (string|null)
				associatedPrompts?: (string[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.BotRenderingMetadata.Keyword.$Properties
		}
	}
	interface IBotResolvedToolCallMetadata extends waproto.BotResolvedToolCallMetadata.$Properties {
	}
	class BotResolvedToolCallMetadata {
		constructor(p?: waproto.BotResolvedToolCallMetadata.$Properties)
		$unknowns?: Uint8Array[]
		toolCallId?: (string|null)
		resolutionDataSerialized?: (string|null)
		static encode(m: waproto.BotResolvedToolCallMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotResolvedToolCallMetadata & waproto.BotResolvedToolCallMetadata.$Shape
	}
	namespace BotResolvedToolCallMetadata {
		interface $Properties {
			toolCallId?: (string|null)
			resolutionDataSerialized?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotResolvedToolCallMetadata.$Properties
	}
	interface IBotSessionMetadata extends waproto.BotSessionMetadata.$Properties {
	}
	class BotSessionMetadata {
		constructor(p?: waproto.BotSessionMetadata.$Properties)
		$unknowns?: Uint8Array[]
		sessionId?: (string|null)
		sessionSource?: (waproto.BotSessionSource|null)
		static encode(m: waproto.BotSessionMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotSessionMetadata & waproto.BotSessionMetadata.$Shape
	}
	namespace BotSessionMetadata {
		interface $Properties {
			sessionId?: (string|null)
			sessionSource?: (waproto.BotSessionSource|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotSessionMetadata.$Properties
	}
	interface IBotSignatureVerificationMetadata extends waproto.BotSignatureVerificationMetadata.$Properties {
	}
	class BotSignatureVerificationMetadata {
		constructor(p?: waproto.BotSignatureVerificationMetadata.$Properties)
		$unknowns?: Uint8Array[]
		proofs: waproto.BotSignatureVerificationUseCaseProof.$Properties[]
		static encode(m: waproto.BotSignatureVerificationMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotSignatureVerificationMetadata & waproto.BotSignatureVerificationMetadata.$Shape
	}
	namespace BotSignatureVerificationMetadata {
		interface $Properties {
			proofs?: (waproto.BotSignatureVerificationUseCaseProof.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotSignatureVerificationMetadata.$Properties
	}
	interface IBotSignatureVerificationUseCaseProof extends waproto.BotSignatureVerificationUseCaseProof.$Properties {
	}
	class BotSignatureVerificationUseCaseProof {
		constructor(p?: waproto.BotSignatureVerificationUseCaseProof.$Properties)
		$unknowns?: Uint8Array[]
		version?: (number|null)
		useCase?: (waproto.BotSignatureVerificationUseCaseProof.BotSignatureUseCase|null)
		signature?: (Uint8Array|null)
		certificateChain: Uint8Array[]
		static encode(m: waproto.BotSignatureVerificationUseCaseProof.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotSignatureVerificationUseCaseProof & waproto.BotSignatureVerificationUseCaseProof.$Shape
	}
	namespace BotSignatureVerificationUseCaseProof {
		interface $Properties {
			version?: (number|null)
			useCase?: (waproto.BotSignatureVerificationUseCaseProof.BotSignatureUseCase|null)
			signature?: (Uint8Array|null)
			certificateChain?: (Uint8Array[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotSignatureVerificationUseCaseProof.$Properties
		enum BotSignatureUseCase {
			UNSPECIFIED = 0,
			WA_BOT_MSG = 1,
			WA_TEE_BOT_MSG = 2,
			P2P_PILLS = 3
		}
	}
	interface IBotSourcesMetadata extends waproto.BotSourcesMetadata.$Properties {
	}
	class BotSourcesMetadata {
		constructor(p?: waproto.BotSourcesMetadata.$Properties)
		$unknowns?: Uint8Array[]
		sources: waproto.BotSourcesMetadata.BotSourceItem.$Properties[]
		static encode(m: waproto.BotSourcesMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotSourcesMetadata & waproto.BotSourcesMetadata.$Shape
	}
	namespace BotSourcesMetadata {
		interface $Properties {
			sources?: (waproto.BotSourcesMetadata.BotSourceItem.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotSourcesMetadata.$Properties
		interface IBotSourceItem extends waproto.BotSourcesMetadata.BotSourceItem.$Properties {
		}
		class BotSourceItem {
			constructor(p?: waproto.BotSourcesMetadata.BotSourceItem.$Properties)
			$unknowns?: Uint8Array[]
			provider?: (waproto.BotSourcesMetadata.BotSourceItem.SourceProvider|null)
			thumbnailCdnUrl?: (string|null)
			sourceProviderUrl?: (string|null)
			sourceQuery?: (string|null)
			faviconCdnUrl?: (string|null)
			citationNumber?: (number|null)
			sourceTitle?: (string|null)
			static encode(m: waproto.BotSourcesMetadata.BotSourceItem.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotSourcesMetadata.BotSourceItem & waproto.BotSourcesMetadata.BotSourceItem.$Shape
		}
		namespace BotSourceItem {
			interface $Properties {
				provider?: (waproto.BotSourcesMetadata.BotSourceItem.SourceProvider|null)
				thumbnailCdnUrl?: (string|null)
				sourceProviderUrl?: (string|null)
				sourceQuery?: (string|null)
				faviconCdnUrl?: (string|null)
				citationNumber?: (number|null)
				sourceTitle?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.BotSourcesMetadata.BotSourceItem.$Properties
			enum SourceProvider {
				UNKNOWN = 0,
				BING = 1,
				GOOGLE = 2,
				SUPPORT = 3,
				OTHER = 4
			}
		}
	}
	interface IBotSuggestedPromptMetadata extends waproto.BotSuggestedPromptMetadata.$Properties {
	}
	class BotSuggestedPromptMetadata {
		constructor(p?: waproto.BotSuggestedPromptMetadata.$Properties)
		$unknowns?: Uint8Array[]
		suggestedPrompts: string[]
		selectedPromptIndex?: (number|null)
		promptSuggestions?: (waproto.BotPromptSuggestions.$Properties|null)
		selectedPromptId?: (string|null)
		static encode(m: waproto.BotSuggestedPromptMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotSuggestedPromptMetadata & waproto.BotSuggestedPromptMetadata.$Shape
	}
	namespace BotSuggestedPromptMetadata {
		interface $Properties {
			suggestedPrompts?: (string[]|null)
			selectedPromptIndex?: (number|null)
			promptSuggestions?: (waproto.BotPromptSuggestions.$Properties|null)
			selectedPromptId?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotSuggestedPromptMetadata.$Properties
	}
	interface IBotUnifiedResponseMutation extends waproto.BotUnifiedResponseMutation.$Properties {
	}
	class BotUnifiedResponseMutation {
		constructor(p?: waproto.BotUnifiedResponseMutation.$Properties)
		$unknowns?: Uint8Array[]
		sbsMetadata?: (waproto.BotUnifiedResponseMutation.SideBySideMetadata.$Properties|null)
		mediaDetailsMetadataList: waproto.BotUnifiedResponseMutation.MediaDetailsMetadata.$Properties[]
		static encode(m: waproto.BotUnifiedResponseMutation.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotUnifiedResponseMutation & waproto.BotUnifiedResponseMutation.$Shape
	}
	namespace BotUnifiedResponseMutation {
		interface $Properties {
			sbsMetadata?: (waproto.BotUnifiedResponseMutation.SideBySideMetadata.$Properties|null)
			mediaDetailsMetadataList?: (waproto.BotUnifiedResponseMutation.MediaDetailsMetadata.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.BotUnifiedResponseMutation.$Properties
		interface IMediaDetailsMetadata extends waproto.BotUnifiedResponseMutation.MediaDetailsMetadata.$Properties {
		}
		class MediaDetailsMetadata {
			constructor(p?: waproto.BotUnifiedResponseMutation.MediaDetailsMetadata.$Properties)
			$unknowns?: Uint8Array[]
			id?: (string|null)
			highResMedia?: (waproto.BotMediaMetadata.$Properties|null)
			previewMedia?: (waproto.BotMediaMetadata.$Properties|null)
			static encode(m: waproto.BotUnifiedResponseMutation.MediaDetailsMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotUnifiedResponseMutation.MediaDetailsMetadata & waproto.BotUnifiedResponseMutation.MediaDetailsMetadata.$Shape
		}
		namespace MediaDetailsMetadata {
			interface $Properties {
				id?: (string|null)
				highResMedia?: (waproto.BotMediaMetadata.$Properties|null)
				previewMedia?: (waproto.BotMediaMetadata.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.BotUnifiedResponseMutation.MediaDetailsMetadata.$Properties
		}
		interface ISideBySideMetadata extends waproto.BotUnifiedResponseMutation.SideBySideMetadata.$Properties {
		}
		class SideBySideMetadata {
			constructor(p?: waproto.BotUnifiedResponseMutation.SideBySideMetadata.$Properties)
			$unknowns?: Uint8Array[]
			primaryResponseId?: (string|null)
			surveyCtaHasRendered?: (boolean|null)
			static encode(m: waproto.BotUnifiedResponseMutation.SideBySideMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotUnifiedResponseMutation.SideBySideMetadata & waproto.BotUnifiedResponseMutation.SideBySideMetadata.$Shape
		}
		namespace SideBySideMetadata {
			interface $Properties {
				primaryResponseId?: (string|null)
				surveyCtaHasRendered?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.BotUnifiedResponseMutation.SideBySideMetadata.$Properties
		}
	}
	interface ICallLogRecord extends waproto.CallLogRecord.$Properties {
	}
	class CallLogRecord {
		constructor(p?: waproto.CallLogRecord.$Properties)
		$unknowns?: Uint8Array[]
		callResult?: (waproto.CallLogRecord.CallResult|null)
		isDndMode?: (boolean|null)
		silenceReason?: (waproto.CallLogRecord.SilenceReason|null)
		duration?: (number|Long|null)
		startTime?: (number|Long|null)
		isIncoming?: (boolean|null)
		isVideo?: (boolean|null)
		isCallLink?: (boolean|null)
		callLinkToken?: (string|null)
		scheduledCallId?: (string|null)
		callId?: (string|null)
		callCreatorJid?: (string|null)
		groupJid?: (string|null)
		participants: waproto.CallLogRecord.ParticipantInfo.$Properties[]
		callType?: (waproto.CallLogRecord.CallType|null)
		static encode(m: waproto.CallLogRecord.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.CallLogRecord & waproto.CallLogRecord.$Shape
	}
	namespace CallLogRecord {
		interface $Properties {
			callResult?: (waproto.CallLogRecord.CallResult|null)
			isDndMode?: (boolean|null)
			silenceReason?: (waproto.CallLogRecord.SilenceReason|null)
			duration?: (number|Long|null)
			startTime?: (number|Long|null)
			isIncoming?: (boolean|null)
			isVideo?: (boolean|null)
			isCallLink?: (boolean|null)
			callLinkToken?: (string|null)
			scheduledCallId?: (string|null)
			callId?: (string|null)
			callCreatorJid?: (string|null)
			groupJid?: (string|null)
			participants?: (waproto.CallLogRecord.ParticipantInfo.$Properties[]|null)
			callType?: (waproto.CallLogRecord.CallType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.CallLogRecord.$Properties
		enum CallType {
			REGULAR = 0,
			SCHEDULED_CALL = 1,
			VOICE_CHAT = 2
		}
		enum SilenceReason {
			NONE = 0,
			SCHEDULED = 1,
			PRIVACY = 2,
			LIGHTWEIGHT = 3
		}
		enum CallResult {
			CONNECTED = 0,
			REJECTED = 1,
			CANCELLED = 2,
			ACCEPTEDELSEWHERE = 3,
			MISSED = 4,
			INVALID = 5,
			UNAVAILABLE = 6,
			UPCOMING = 7,
			FAILED = 8,
			ABANDONED = 9,
			ONGOING = 10
		}
		interface IParticipantInfo extends waproto.CallLogRecord.ParticipantInfo.$Properties {
		}
		class ParticipantInfo {
			constructor(p?: waproto.CallLogRecord.ParticipantInfo.$Properties)
			$unknowns?: Uint8Array[]
			userJid?: (string|null)
			callResult?: (waproto.CallLogRecord.CallResult|null)
			static encode(m: waproto.CallLogRecord.ParticipantInfo.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.CallLogRecord.ParticipantInfo & waproto.CallLogRecord.ParticipantInfo.$Shape
		}
		namespace ParticipantInfo {
			interface $Properties {
				userJid?: (string|null)
				callResult?: (waproto.CallLogRecord.CallResult|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.CallLogRecord.ParticipantInfo.$Properties
		}
	}
	interface ICertChain extends waproto.CertChain.$Properties {
	}
	class CertChain {
		constructor(p?: waproto.CertChain.$Properties)
		$unknowns?: Uint8Array[]
		leaf?: (waproto.CertChain.NoiseCertificate.$Properties|null)
		intermediate?: (waproto.CertChain.NoiseCertificate.$Properties|null)
		static encode(m: waproto.CertChain.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.CertChain & waproto.CertChain.$Shape
	}
	namespace CertChain {
		interface $Properties {
			leaf?: (waproto.CertChain.NoiseCertificate.$Properties|null)
			intermediate?: (waproto.CertChain.NoiseCertificate.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.CertChain.$Properties
		interface INoiseCertificate extends waproto.CertChain.NoiseCertificate.$Properties {
		}
		class NoiseCertificate {
			constructor(p?: waproto.CertChain.NoiseCertificate.$Properties)
			$unknowns?: Uint8Array[]
			details?: (Uint8Array|null)
			signature?: (Uint8Array|null)
			static encode(m: waproto.CertChain.NoiseCertificate.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.CertChain.NoiseCertificate & waproto.CertChain.NoiseCertificate.$Shape
		}
		namespace NoiseCertificate {
			interface $Properties {
				details?: (Uint8Array|null)
				signature?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.CertChain.NoiseCertificate.$Properties
			interface IDetails extends waproto.CertChain.NoiseCertificate.Details.$Properties {
			}
			class Details {
				constructor(p?: waproto.CertChain.NoiseCertificate.Details.$Properties)
				$unknowns?: Uint8Array[]
				serial?: (number|null)
				issuerSerial?: (number|null)
				key?: (Uint8Array|null)
				notBefore?: (number|Long|null)
				notAfter?: (number|Long|null)
				static encode(m: waproto.CertChain.NoiseCertificate.Details.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.CertChain.NoiseCertificate.Details & waproto.CertChain.NoiseCertificate.Details.$Shape
			}
			namespace Details {
				interface $Properties {
					serial?: (number|null)
					issuerSerial?: (number|null)
					key?: (Uint8Array|null)
					notBefore?: (number|Long|null)
					notAfter?: (number|Long|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.CertChain.NoiseCertificate.Details.$Properties
			}
		}
	}
	interface IChatLockSettings extends waproto.ChatLockSettings.$Properties {
	}
	class ChatLockSettings {
		constructor(p?: waproto.ChatLockSettings.$Properties)
		$unknowns?: Uint8Array[]
		hideLockedChats?: (boolean|null)
		secretCode?: (waproto.UserPassword.$Properties|null)
		static encode(m: waproto.ChatLockSettings.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ChatLockSettings & waproto.ChatLockSettings.$Shape
	}
	namespace ChatLockSettings {
		interface $Properties {
			hideLockedChats?: (boolean|null)
			secretCode?: (waproto.UserPassword.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ChatLockSettings.$Properties
	}
	interface IChatRowOpaqueData extends waproto.ChatRowOpaqueData.$Properties {
	}
	class ChatRowOpaqueData {
		constructor(p?: waproto.ChatRowOpaqueData.$Properties)
		$unknowns?: Uint8Array[]
		draftMessage?: (waproto.ChatRowOpaqueData.DraftMessage.$Properties|null)
		static encode(m: waproto.ChatRowOpaqueData.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ChatRowOpaqueData & waproto.ChatRowOpaqueData.$Shape
	}
	namespace ChatRowOpaqueData {
		interface $Properties {
			draftMessage?: (waproto.ChatRowOpaqueData.DraftMessage.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ChatRowOpaqueData.$Properties
		interface IDraftMessage extends waproto.ChatRowOpaqueData.DraftMessage.$Properties {
		}
		class DraftMessage {
			constructor(p?: waproto.ChatRowOpaqueData.DraftMessage.$Properties)
			$unknowns?: Uint8Array[]
			text?: (string|null)
			omittedUrl?: (string|null)
			ctwaContextLinkData?: (waproto.ChatRowOpaqueData.DraftMessage.CtwaContextLinkData.$Properties|null)
			ctwaContext?: (waproto.ChatRowOpaqueData.DraftMessage.CtwaContextData.$Properties|null)
			timestamp?: (number|Long|null)
			static encode(m: waproto.ChatRowOpaqueData.DraftMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ChatRowOpaqueData.DraftMessage & waproto.ChatRowOpaqueData.DraftMessage.$Shape
		}
		namespace DraftMessage {
			interface $Properties {
				text?: (string|null)
				omittedUrl?: (string|null)
				ctwaContextLinkData?: (waproto.ChatRowOpaqueData.DraftMessage.CtwaContextLinkData.$Properties|null)
				ctwaContext?: (waproto.ChatRowOpaqueData.DraftMessage.CtwaContextData.$Properties|null)
				timestamp?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ChatRowOpaqueData.DraftMessage.$Properties
			interface ICtwaContextData extends waproto.ChatRowOpaqueData.DraftMessage.CtwaContextData.$Properties {
			}
			class CtwaContextData {
				constructor(p?: waproto.ChatRowOpaqueData.DraftMessage.CtwaContextData.$Properties)
				$unknowns?: Uint8Array[]
				conversionSource?: (string|null)
				conversionData?: (Uint8Array|null)
				sourceUrl?: (string|null)
				sourceId?: (string|null)
				sourceType?: (string|null)
				title?: (string|null)
				description?: (string|null)
				thumbnail?: (string|null)
				thumbnailUrl?: (string|null)
				mediaType?: (waproto.ChatRowOpaqueData.DraftMessage.CtwaContextData.ContextInfoExternalAdReplyInfoMediaType|null)
				mediaUrl?: (string|null)
				isSuspiciousLink?: (boolean|null)
				static encode(m: waproto.ChatRowOpaqueData.DraftMessage.CtwaContextData.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.ChatRowOpaqueData.DraftMessage.CtwaContextData & waproto.ChatRowOpaqueData.DraftMessage.CtwaContextData.$Shape
			}
			namespace CtwaContextData {
				interface $Properties {
					conversionSource?: (string|null)
					conversionData?: (Uint8Array|null)
					sourceUrl?: (string|null)
					sourceId?: (string|null)
					sourceType?: (string|null)
					title?: (string|null)
					description?: (string|null)
					thumbnail?: (string|null)
					thumbnailUrl?: (string|null)
					mediaType?: (waproto.ChatRowOpaqueData.DraftMessage.CtwaContextData.ContextInfoExternalAdReplyInfoMediaType|null)
					mediaUrl?: (string|null)
					isSuspiciousLink?: (boolean|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.ChatRowOpaqueData.DraftMessage.CtwaContextData.$Properties
				enum ContextInfoExternalAdReplyInfoMediaType {
					NONE = 0,
					IMAGE = 1,
					VIDEO = 2
				}
			}
			interface ICtwaContextLinkData extends waproto.ChatRowOpaqueData.DraftMessage.CtwaContextLinkData.$Properties {
			}
			class CtwaContextLinkData {
				constructor(p?: waproto.ChatRowOpaqueData.DraftMessage.CtwaContextLinkData.$Properties)
				$unknowns?: Uint8Array[]
				context?: (string|null)
				sourceUrl?: (string|null)
				icebreaker?: (string|null)
				phone?: (string|null)
				static encode(m: waproto.ChatRowOpaqueData.DraftMessage.CtwaContextLinkData.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.ChatRowOpaqueData.DraftMessage.CtwaContextLinkData & waproto.ChatRowOpaqueData.DraftMessage.CtwaContextLinkData.$Shape
			}
			namespace CtwaContextLinkData {
				interface $Properties {
					context?: (string|null)
					sourceUrl?: (string|null)
					icebreaker?: (string|null)
					phone?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.ChatRowOpaqueData.DraftMessage.CtwaContextLinkData.$Properties
			}
		}
	}
	interface ICitation extends waproto.Citation.$Properties {
	}
	class Citation {
		constructor(p?: waproto.Citation.$Properties)
		$unknowns?: Uint8Array[]
		title?: (string|null)
		subtitle?: (string|null)
		cmsId?: (string|null)
		imageUrl?: (string|null)
		static encode(m: waproto.Citation.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Citation & waproto.Citation.$Shape
	}
	namespace Citation {
		interface $Properties {
			title?: (string|null)
			subtitle?: (string|null)
			cmsId?: (string|null)
			imageUrl?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Citation.$Properties
	}
	interface IClientPairingProps extends waproto.ClientPairingProps.$Properties {
	}
	class ClientPairingProps {
		constructor(p?: waproto.ClientPairingProps.$Properties)
		$unknowns?: Uint8Array[]
		isChatDbLidMigrated?: (boolean|null)
		isSyncdPureLidSession?: (boolean|null)
		isSyncdSnapshotRecoveryEnabled?: (boolean|null)
		isHsThumbnailSyncEnabled?: (boolean|null)
		subscriptionSyncPayload?: (Uint8Array|null)
		static encode(m: waproto.ClientPairingProps.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPairingProps & waproto.ClientPairingProps.$Shape
	}
	namespace ClientPairingProps {
		interface $Properties {
			isChatDbLidMigrated?: (boolean|null)
			isSyncdPureLidSession?: (boolean|null)
			isSyncdSnapshotRecoveryEnabled?: (boolean|null)
			isHsThumbnailSyncEnabled?: (boolean|null)
			subscriptionSyncPayload?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ClientPairingProps.$Properties
	}
	interface IClientPayload extends waproto.ClientPayload.$Properties {
	}
	class ClientPayload {
		constructor(p?: waproto.ClientPayload.$Properties)
		$unknowns?: Uint8Array[]
		username?: (number|Long|null)
		passive?: (boolean|null)
		userAgent?: (waproto.ClientPayload.UserAgent.$Properties|null)
		webInfo?: (waproto.ClientPayload.WebInfo.$Properties|null)
		pushName?: (string|null)
		sessionId?: (number|null)
		shortConnect?: (boolean|null)
		connectType?: (waproto.ClientPayload.ConnectType|null)
		connectReason?: (waproto.ClientPayload.ConnectReason|null)
		shards: number[]
		dnsSource?: (waproto.ClientPayload.DNSSource.$Properties|null)
		connectAttemptCount?: (number|null)
		device?: (number|null)
		devicePairingData?: (waproto.ClientPayload.DevicePairingRegistrationData.$Properties|null)
		product?: (waproto.ClientPayload.Product|null)
		fbCat?: (Uint8Array|null)
		fbUserAgent?: (Uint8Array|null)
		oc?: (boolean|null)
		lc?: (number|null)
		iosAppExtension?: (waproto.ClientPayload.IOSAppExtension|null)
		fbAppId?: (number|Long|null)
		fbDeviceId?: (Uint8Array|null)
		pull?: (boolean|null)
		paddingBytes?: (Uint8Array|null)
		yearClass?: (number|null)
		memClass?: (number|null)
		interopData?: (waproto.ClientPayload.InteropData.$Properties|null)
		trafficAnonymization?: (waproto.ClientPayload.TrafficAnonymization|null)
		lidDbMigrated?: (boolean|null)
		accountType?: (waproto.ClientPayload.AccountType|null)
		connectionSequenceInfo?: (number|null)
		paaLink?: (boolean|null)
		preacksCount?: (number|null)
		processingQueueSize?: (number|null)
		pairedPeripherals: string[]
		testIsolationId?: (Uint8Array|null)
		static encode(m: waproto.ClientPayload.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload & waproto.ClientPayload.$Shape
	}
	namespace ClientPayload {
		interface $Properties {
			username?: (number|Long|null)
			passive?: (boolean|null)
			userAgent?: (waproto.ClientPayload.UserAgent.$Properties|null)
			webInfo?: (waproto.ClientPayload.WebInfo.$Properties|null)
			pushName?: (string|null)
			sessionId?: (number|null)
			shortConnect?: (boolean|null)
			connectType?: (waproto.ClientPayload.ConnectType|null)
			connectReason?: (waproto.ClientPayload.ConnectReason|null)
			shards?: (number[]|null)
			dnsSource?: (waproto.ClientPayload.DNSSource.$Properties|null)
			connectAttemptCount?: (number|null)
			device?: (number|null)
			devicePairingData?: (waproto.ClientPayload.DevicePairingRegistrationData.$Properties|null)
			product?: (waproto.ClientPayload.Product|null)
			fbCat?: (Uint8Array|null)
			fbUserAgent?: (Uint8Array|null)
			oc?: (boolean|null)
			lc?: (number|null)
			iosAppExtension?: (waproto.ClientPayload.IOSAppExtension|null)
			fbAppId?: (number|Long|null)
			fbDeviceId?: (Uint8Array|null)
			pull?: (boolean|null)
			paddingBytes?: (Uint8Array|null)
			yearClass?: (number|null)
			memClass?: (number|null)
			interopData?: (waproto.ClientPayload.InteropData.$Properties|null)
			trafficAnonymization?: (waproto.ClientPayload.TrafficAnonymization|null)
			lidDbMigrated?: (boolean|null)
			accountType?: (waproto.ClientPayload.AccountType|null)
			connectionSequenceInfo?: (number|null)
			paaLink?: (boolean|null)
			preacksCount?: (number|null)
			processingQueueSize?: (number|null)
			pairedPeripherals?: (string[]|null)
			testIsolationId?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ClientPayload.$Properties
		enum TrafficAnonymization {
			OFF = 0,
			STANDARD = 1
		}
		enum AccountType {
			DEFAULT = 0,
			GUEST = 1
		}
		enum Product {
			WHATSAPP = 0,
			MESSENGER = 1,
			INTEROP = 2,
			INTEROP_MSGR = 3,
			WHATSAPP_LID = 4
		}
		enum ConnectType {
			CELLULAR_UNKNOWN = 0,
			WIFI_UNKNOWN = 1,
			CELLULAR_EDGE = 100,
			CELLULAR_IDEN = 101,
			CELLULAR_UMTS = 102,
			CELLULAR_EVDO = 103,
			CELLULAR_GPRS = 104,
			CELLULAR_HSDPA = 105,
			CELLULAR_HSUPA = 106,
			CELLULAR_HSPA = 107,
			CELLULAR_CDMA = 108,
			CELLULAR_1XRTT = 109,
			CELLULAR_EHRPD = 110,
			CELLULAR_LTE = 111,
			CELLULAR_HSPAP = 112
		}
		enum ConnectReason {
			PUSH = 0,
			USER_ACTIVATED = 1,
			SCHEDULED = 2,
			ERROR_RECONNECT = 3,
			NETWORK_SWITCH = 4,
			PING_RECONNECT = 5,
			UNKNOWN = 6
		}
		enum IOSAppExtension {
			SHARE_EXTENSION = 0,
			SERVICE_EXTENSION = 1,
			INTENTS_EXTENSION = 2
		}
		interface IInteropData extends waproto.ClientPayload.InteropData.$Properties {
		}
		class InteropData {
			constructor(p?: waproto.ClientPayload.InteropData.$Properties)
			$unknowns?: Uint8Array[]
			accountId?: (number|Long|null)
			token?: (Uint8Array|null)
			enableReadReceipts?: (boolean|null)
			static encode(m: waproto.ClientPayload.InteropData.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.InteropData & waproto.ClientPayload.InteropData.$Shape
		}
		namespace InteropData {
			interface $Properties {
				accountId?: (number|Long|null)
				token?: (Uint8Array|null)
				enableReadReceipts?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ClientPayload.InteropData.$Properties
		}
		interface IDevicePairingRegistrationData extends waproto.ClientPayload.DevicePairingRegistrationData.$Properties {
		}
		class DevicePairingRegistrationData {
			constructor(p?: waproto.ClientPayload.DevicePairingRegistrationData.$Properties)
			$unknowns?: Uint8Array[]
			eRegid?: (Uint8Array|null)
			eKeytype?: (Uint8Array|null)
			eIdent?: (Uint8Array|null)
			eSkeyId?: (Uint8Array|null)
			eSkeyVal?: (Uint8Array|null)
			eSkeySig?: (Uint8Array|null)
			buildHash?: (Uint8Array|null)
			deviceProps?: (Uint8Array|null)
			static encode(m: waproto.ClientPayload.DevicePairingRegistrationData.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.DevicePairingRegistrationData & waproto.ClientPayload.DevicePairingRegistrationData.$Shape
		}
		namespace DevicePairingRegistrationData {
			interface $Properties {
				eRegid?: (Uint8Array|null)
				eKeytype?: (Uint8Array|null)
				eIdent?: (Uint8Array|null)
				eSkeyId?: (Uint8Array|null)
				eSkeyVal?: (Uint8Array|null)
				eSkeySig?: (Uint8Array|null)
				buildHash?: (Uint8Array|null)
				deviceProps?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ClientPayload.DevicePairingRegistrationData.$Properties
		}
		interface IDNSSource extends waproto.ClientPayload.DNSSource.$Properties {
		}
		class DNSSource {
			constructor(p?: waproto.ClientPayload.DNSSource.$Properties)
			$unknowns?: Uint8Array[]
			dnsMethod?: (waproto.ClientPayload.DNSSource.DNSResolutionMethod|null)
			appCached?: (boolean|null)
			static encode(m: waproto.ClientPayload.DNSSource.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.DNSSource & waproto.ClientPayload.DNSSource.$Shape
		}
		namespace DNSSource {
			interface $Properties {
				dnsMethod?: (waproto.ClientPayload.DNSSource.DNSResolutionMethod|null)
				appCached?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ClientPayload.DNSSource.$Properties
			enum DNSResolutionMethod {
				SYSTEM = 0,
				GOOGLE = 1,
				HARDCODED = 2,
				OVERRIDE = 3,
				FALLBACK = 4,
				MNS = 5,
				MNS_SECONDARY = 6,
				SOCKS_PROXY = 7
			}
		}
		interface IWebInfo extends waproto.ClientPayload.WebInfo.$Properties {
		}
		class WebInfo {
			constructor(p?: waproto.ClientPayload.WebInfo.$Properties)
			$unknowns?: Uint8Array[]
			refToken?: (string|null)
			version?: (string|null)
			webdPayload?: (waproto.ClientPayload.WebInfo.WebdPayload.$Properties|null)
			webSubPlatform?: (waproto.ClientPayload.WebInfo.WebSubPlatform|null)
			browser?: (string|null)
			browserVersion?: (string|null)
			static encode(m: waproto.ClientPayload.WebInfo.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.WebInfo & waproto.ClientPayload.WebInfo.$Shape
		}
		namespace WebInfo {
			interface $Properties {
				refToken?: (string|null)
				version?: (string|null)
				webdPayload?: (waproto.ClientPayload.WebInfo.WebdPayload.$Properties|null)
				webSubPlatform?: (waproto.ClientPayload.WebInfo.WebSubPlatform|null)
				browser?: (string|null)
				browserVersion?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ClientPayload.WebInfo.$Properties
			enum WebSubPlatform {
				WEB_BROWSER = 0,
				APP_STORE = 1,
				WIN_STORE = 2,
				DARWIN = 3,
				WIN32 = 4,
				WIN_HYBRID = 5
			}
			interface IWebdPayload extends waproto.ClientPayload.WebInfo.WebdPayload.$Properties {
			}
			class WebdPayload {
				constructor(p?: waproto.ClientPayload.WebInfo.WebdPayload.$Properties)
				$unknowns?: Uint8Array[]
				usesParticipantInKey?: (boolean|null)
				supportsStarredMessages?: (boolean|null)
				supportsDocumentMessages?: (boolean|null)
				supportsUrlMessages?: (boolean|null)
				supportsMediaRetry?: (boolean|null)
				supportsE2EImage?: (boolean|null)
				supportsE2EVideo?: (boolean|null)
				supportsE2EAudio?: (boolean|null)
				supportsE2EDocument?: (boolean|null)
				documentTypes?: (string|null)
				features?: (Uint8Array|null)
				static encode(m: waproto.ClientPayload.WebInfo.WebdPayload.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.WebInfo.WebdPayload & waproto.ClientPayload.WebInfo.WebdPayload.$Shape
			}
			namespace WebdPayload {
				interface $Properties {
					usesParticipantInKey?: (boolean|null)
					supportsStarredMessages?: (boolean|null)
					supportsDocumentMessages?: (boolean|null)
					supportsUrlMessages?: (boolean|null)
					supportsMediaRetry?: (boolean|null)
					supportsE2EImage?: (boolean|null)
					supportsE2EVideo?: (boolean|null)
					supportsE2EAudio?: (boolean|null)
					supportsE2EDocument?: (boolean|null)
					documentTypes?: (string|null)
					features?: (Uint8Array|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.ClientPayload.WebInfo.WebdPayload.$Properties
			}
		}
		interface IUserAgent extends waproto.ClientPayload.UserAgent.$Properties {
		}
		class UserAgent {
			constructor(p?: waproto.ClientPayload.UserAgent.$Properties)
			$unknowns?: Uint8Array[]
			platform?: (waproto.ClientPayload.UserAgent.Platform|null)
			appVersion?: (waproto.ClientPayload.UserAgent.AppVersion.$Properties|null)
			mcc?: (string|null)
			mnc?: (string|null)
			osVersion?: (string|null)
			manufacturer?: (string|null)
			device?: (string|null)
			osBuildNumber?: (string|null)
			phoneId?: (string|null)
			releaseChannel?: (waproto.ClientPayload.UserAgent.ReleaseChannel|null)
			localeLanguageIso6391?: (string|null)
			localeCountryIso31661Alpha2?: (string|null)
			deviceBoard?: (string|null)
			deviceExpId?: (string|null)
			deviceType?: (waproto.ClientPayload.UserAgent.DeviceType|null)
			deviceModelType?: (string|null)
			distributionChannel?: (waproto.ClientPayload.UserAgent.DistributionChannel|null)
			static encode(m: waproto.ClientPayload.UserAgent.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.UserAgent & waproto.ClientPayload.UserAgent.$Shape
		}
		namespace UserAgent {
			interface $Properties {
				platform?: (waproto.ClientPayload.UserAgent.Platform|null)
				appVersion?: (waproto.ClientPayload.UserAgent.AppVersion.$Properties|null)
				mcc?: (string|null)
				mnc?: (string|null)
				osVersion?: (string|null)
				manufacturer?: (string|null)
				device?: (string|null)
				osBuildNumber?: (string|null)
				phoneId?: (string|null)
				releaseChannel?: (waproto.ClientPayload.UserAgent.ReleaseChannel|null)
				localeLanguageIso6391?: (string|null)
				localeCountryIso31661Alpha2?: (string|null)
				deviceBoard?: (string|null)
				deviceExpId?: (string|null)
				deviceType?: (waproto.ClientPayload.UserAgent.DeviceType|null)
				deviceModelType?: (string|null)
				distributionChannel?: (waproto.ClientPayload.UserAgent.DistributionChannel|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ClientPayload.UserAgent.$Properties
			enum DeviceType {
				PHONE = 0,
				TABLET = 1,
				DESKTOP = 2,
				WEARABLE = 3,
				VR = 4
			}
			enum DistributionChannel {
				APPSTORE = 0,
				WEBSITE = 1,
				TESTFLIGHT = 2,
				INTERNAL = 3
			}
			enum ReleaseChannel {
				RELEASE = 0,
				BETA = 1,
				ALPHA = 2,
				DEBUG = 3
			}
			enum Platform {
				ANDROID = 0,
				IOS = 1,
				WINDOWS_PHONE = 2,
				BLACKBERRY = 3,
				BLACKBERRYX = 4,
				S40 = 5,
				S60 = 6,
				PYTHON_CLIENT = 7,
				TIZEN = 8,
				ENTERPRISE = 9,
				SMB_ANDROID = 10,
				KAIOS = 11,
				SMB_IOS = 12,
				WINDOWS = 13,
				WEB = 14,
				PORTAL = 15,
				GREEN_ANDROID = 16,
				GREEN_IPHONE = 17,
				BLUE_ANDROID = 18,
				BLUE_IPHONE = 19,
				FBLITE_ANDROID = 20,
				MLITE_ANDROID = 21,
				IGLITE_ANDROID = 22,
				PAGE = 23,
				MACOS = 24,
				OCULUS_MSG = 25,
				OCULUS_CALL = 26,
				MILAN = 27,
				CAPI = 28,
				WEAROS = 29,
				ARDEVICE = 30,
				VRDEVICE = 31,
				BLUE_WEB = 32,
				IPAD = 33,
				TEST = 34,
				SMART_GLASSES = 35,
				BLUE_VR = 36,
				AR_WRIST = 37
			}
			interface IAppVersion extends waproto.ClientPayload.UserAgent.AppVersion.$Properties {
			}
			class AppVersion {
				constructor(p?: waproto.ClientPayload.UserAgent.AppVersion.$Properties)
				$unknowns?: Uint8Array[]
				primary?: (number|null)
				secondary?: (number|null)
				tertiary?: (number|null)
				quaternary?: (number|null)
				quinary?: (number|null)
				static encode(m: waproto.ClientPayload.UserAgent.AppVersion.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.UserAgent.AppVersion & waproto.ClientPayload.UserAgent.AppVersion.$Shape
			}
			namespace AppVersion {
				interface $Properties {
					primary?: (number|null)
					secondary?: (number|null)
					tertiary?: (number|null)
					quaternary?: (number|null)
					quinary?: (number|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.ClientPayload.UserAgent.AppVersion.$Properties
			}
		}
	}
	interface ICoexStateSync extends waproto.CoexStateSync.$Properties {
	}
	class CoexStateSync {
		constructor(p?: waproto.CoexStateSync.$Properties)
		$unknowns?: Uint8Array[]
		collectionMutations: waproto.CoexStateSync.CollectionMutations.$Properties[]
		static encode(m: waproto.CoexStateSync.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.CoexStateSync & waproto.CoexStateSync.$Shape
	}
	namespace CoexStateSync {
		interface $Properties {
			collectionMutations?: (waproto.CoexStateSync.CollectionMutations.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.CoexStateSync.$Properties
		interface ICollectionMutations extends waproto.CoexStateSync.CollectionMutations.$Properties {
		}
		class CollectionMutations {
			constructor(p?: waproto.CoexStateSync.CollectionMutations.$Properties)
			$unknowns?: Uint8Array[]
			collection?: (string|null)
			mutations: waproto.CoexStateSync.Mutation.$Properties[]
			static encode(m: waproto.CoexStateSync.CollectionMutations.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.CoexStateSync.CollectionMutations & waproto.CoexStateSync.CollectionMutations.$Shape
		}
		namespace CollectionMutations {
			interface $Properties {
				collection?: (string|null)
				mutations?: (waproto.CoexStateSync.Mutation.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.CoexStateSync.CollectionMutations.$Properties
		}
		interface IMutation extends waproto.CoexStateSync.Mutation.$Properties {
		}
		class Mutation {
			constructor(p?: waproto.CoexStateSync.Mutation.$Properties)
			$unknowns?: Uint8Array[]
			index?: (waproto.SyncdIndex.$Properties|null)
			value?: (waproto.SyncdValue.$Properties|null)
			dirtyVersion?: (number|Long|null)
			operation?: (waproto.SyncdMutation.SyncdOperation|null)
			static encode(m: waproto.CoexStateSync.Mutation.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.CoexStateSync.Mutation & waproto.CoexStateSync.Mutation.$Shape
		}
		namespace Mutation {
			interface $Properties {
				index?: (waproto.SyncdIndex.$Properties|null)
				value?: (waproto.SyncdValue.$Properties|null)
				dirtyVersion?: (number|Long|null)
				operation?: (waproto.SyncdMutation.SyncdOperation|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.CoexStateSync.Mutation.$Properties
		}
	}
	interface ICombinedFingerprint extends waproto.CombinedFingerprint.$Properties {
	}
	class CombinedFingerprint {
		constructor(p?: waproto.CombinedFingerprint.$Properties)
		$unknowns?: Uint8Array[]
		version?: (number|null)
		localFingerprint?: (waproto.FingerprintData.$Properties|null)
		remoteFingerprint?: (waproto.FingerprintData.$Properties|null)
		static encode(m: waproto.CombinedFingerprint.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.CombinedFingerprint & waproto.CombinedFingerprint.$Shape
	}
	namespace CombinedFingerprint {
		interface $Properties {
			version?: (number|null)
			localFingerprint?: (waproto.FingerprintData.$Properties|null)
			remoteFingerprint?: (waproto.FingerprintData.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.CombinedFingerprint.$Properties
	}
	interface ICommand extends waproto.Command.$Properties {
	}
	class Command {
		constructor(p?: waproto.Command.$Properties)
		$unknowns?: Uint8Array[]
		commandType?: (waproto.COMMAND_COMMAND_TYPE|null)
		offset?: (number|null)
		length?: (number|null)
		validationToken?: (string|null)
		static encode(m: waproto.Command.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Command & waproto.Command.$Shape
	}
	namespace Command {
		interface $Properties {
			commandType?: (waproto.COMMAND_COMMAND_TYPE|null)
			offset?: (number|null)
			length?: (number|null)
			validationToken?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Command.$Properties
	}
	interface ICommentMetadata extends waproto.CommentMetadata.$Properties {
	}
	class CommentMetadata {
		constructor(p?: waproto.CommentMetadata.$Properties)
		$unknowns?: Uint8Array[]
		commentParentKey?: (waproto.MessageKey.$Properties|null)
		replyCount?: (number|null)
		static encode(m: waproto.CommentMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.CommentMetadata & waproto.CommentMetadata.$Shape
	}
	namespace CommentMetadata {
		interface $Properties {
			commentParentKey?: (waproto.MessageKey.$Properties|null)
			replyCount?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.CommentMetadata.$Properties
	}
	interface ICompanionCommitment extends waproto.CompanionCommitment.$Properties {
	}
	class CompanionCommitment {
		constructor(p?: waproto.CompanionCommitment.$Properties)
		$unknowns?: Uint8Array[]
		hash?: (Uint8Array|null)
		static encode(m: waproto.CompanionCommitment.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.CompanionCommitment & waproto.CompanionCommitment.$Shape
	}
	namespace CompanionCommitment {
		interface $Properties {
			hash?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.CompanionCommitment.$Properties
	}
	interface ICompanionEphemeralIdentity extends waproto.CompanionEphemeralIdentity.$Properties {
	}
	class CompanionEphemeralIdentity {
		constructor(p?: waproto.CompanionEphemeralIdentity.$Properties)
		$unknowns?: Uint8Array[]
		publicKey?: (Uint8Array|null)
		deviceType?: (waproto.DeviceProps.PlatformType|null)
		ref?: (string|null)
		static encode(m: waproto.CompanionEphemeralIdentity.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.CompanionEphemeralIdentity & waproto.CompanionEphemeralIdentity.$Shape
	}
	namespace CompanionEphemeralIdentity {
		interface $Properties {
			publicKey?: (Uint8Array|null)
			deviceType?: (waproto.DeviceProps.PlatformType|null)
			ref?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.CompanionEphemeralIdentity.$Properties
	}
	interface IConfig extends waproto.Config.$Properties {
	}
	class Config {
		constructor(p?: waproto.Config.$Properties)
		$unknowns?: Uint8Array[]
		field: { [k: string]: waproto.Field.$Properties }
		version?: (number|null)
		static encode(m: waproto.Config.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Config & waproto.Config.$Shape
	}
	namespace Config {
		interface $Properties {
			field?: ({ [k: string]: waproto.Field.$Properties }|null)
			version?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Config.$Properties
	}
	interface IConsumerApplication extends waproto.ConsumerApplication.$Properties {
	}
	class ConsumerApplication {
		constructor(p?: waproto.ConsumerApplication.$Properties)
		$unknowns?: Uint8Array[]
		payload?: (waproto.ConsumerApplication.Payload.$Properties|null)
		metadata?: (waproto.ConsumerApplication.Metadata.$Properties|null)
		static encode(m: waproto.ConsumerApplication.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication & waproto.ConsumerApplication.$Shape
	}
	namespace ConsumerApplication {
		interface $Properties {
			payload?: (waproto.ConsumerApplication.Payload.$Properties|null)
			metadata?: (waproto.ConsumerApplication.Metadata.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ConsumerApplication.$Properties
		interface IPayload extends waproto.ConsumerApplication.Payload.$Properties {
		}
		class Payload {
			constructor(p?: waproto.ConsumerApplication.Payload.$Properties)
			$unknowns?: Uint8Array[]
			content?: (waproto.ConsumerApplication.Content.$Properties|null)
			applicationData?: (waproto.ConsumerApplication.ApplicationData.$Properties|null)
			signal?: (waproto.ConsumerApplication.Signal.$Properties|null)
			subProtocol?: (waproto.ConsumerApplication.SubProtocolPayload.$Properties|null)
			static encode(m: waproto.ConsumerApplication.Payload.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.Payload & waproto.ConsumerApplication.Payload.$Shape
		}
		namespace Payload {
			interface $Properties {
				content?: (waproto.ConsumerApplication.Content.$Properties|null)
				applicationData?: (waproto.ConsumerApplication.ApplicationData.$Properties|null)
				signal?: (waproto.ConsumerApplication.Signal.$Properties|null)
				subProtocol?: (waproto.ConsumerApplication.SubProtocolPayload.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.Payload.$Properties
		}
		interface ISubProtocolPayload extends waproto.ConsumerApplication.SubProtocolPayload.$Properties {
		}
		class SubProtocolPayload {
			constructor(p?: waproto.ConsumerApplication.SubProtocolPayload.$Properties)
			$unknowns?: Uint8Array[]
			futureProof?: (waproto.FUTURE_PROOF_BEHAVIOR|null)
			static encode(m: waproto.ConsumerApplication.SubProtocolPayload.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.SubProtocolPayload & waproto.ConsumerApplication.SubProtocolPayload.$Shape
		}
		namespace SubProtocolPayload {
			interface $Properties {
				futureProof?: (waproto.FUTURE_PROOF_BEHAVIOR|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.SubProtocolPayload.$Properties
		}
		interface IMetadata extends waproto.ConsumerApplication.Metadata.$Properties {
		}
		class Metadata {
			constructor(p?: waproto.ConsumerApplication.Metadata.$Properties)
			$unknowns?: Uint8Array[]
			specialTextSize?: (waproto.CONSUMER_APPLICATION_METADATA_SPECIAL_TEXT_SIZE|null)
			static encode(m: waproto.ConsumerApplication.Metadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.Metadata & waproto.ConsumerApplication.Metadata.$Shape
		}
		namespace Metadata {
			interface $Properties {
				specialTextSize?: (waproto.CONSUMER_APPLICATION_METADATA_SPECIAL_TEXT_SIZE|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.Metadata.$Properties
		}
		interface ISignal extends waproto.ConsumerApplication.Signal.$Properties {
		}
		class Signal {
			constructor(p?: waproto.ConsumerApplication.Signal.$Properties)
			$unknowns?: Uint8Array[]
			static encode(m: waproto.ConsumerApplication.Signal.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.Signal & waproto.ConsumerApplication.Signal.$Shape
		}
		namespace Signal {
			interface $Properties {
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.Signal.$Properties
		}
		interface IApplicationData extends waproto.ConsumerApplication.ApplicationData.$Properties {
		}
		class ApplicationData {
			constructor(p?: waproto.ConsumerApplication.ApplicationData.$Properties)
			$unknowns?: Uint8Array[]
			revoke?: (waproto.ConsumerApplication.RevokeMessage.$Properties|null)
			static encode(m: waproto.ConsumerApplication.ApplicationData.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.ApplicationData & waproto.ConsumerApplication.ApplicationData.$Shape
		}
		namespace ApplicationData {
			interface $Properties {
				revoke?: (waproto.ConsumerApplication.RevokeMessage.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.ApplicationData.$Properties
		}
		interface IContent extends waproto.ConsumerApplication.Content.$Properties {
		}
		class Content {
			constructor(p?: waproto.ConsumerApplication.Content.$Properties)
			$unknowns?: Uint8Array[]
			messageText?: (waproto.MessageText.$Properties|null)
			imageMessage?: (waproto.ConsumerApplication.ImageMessage.$Properties|null)
			contactMessage?: (waproto.ConsumerApplication.ContactMessage.$Properties|null)
			locationMessage?: (waproto.ConsumerApplication.LocationMessage.$Properties|null)
			extendedTextMessage?: (waproto.ConsumerApplication.ExtendedTextMessage.$Properties|null)
			statusTextMessage?: (waproto.ConsumerApplication.StatusTextMesage.$Properties|null)
			documentMessage?: (waproto.ConsumerApplication.DocumentMessage.$Properties|null)
			audioMessage?: (waproto.ConsumerApplication.AudioMessage.$Properties|null)
			videoMessage?: (waproto.ConsumerApplication.VideoMessage.$Properties|null)
			contactsArrayMessage?: (waproto.ConsumerApplication.ContactsArrayMessage.$Properties|null)
			liveLocationMessage?: (waproto.ConsumerApplication.LiveLocationMessage.$Properties|null)
			stickerMessage?: (waproto.ConsumerApplication.StickerMessage.$Properties|null)
			groupInviteMessage?: (waproto.ConsumerApplication.GroupInviteMessage.$Properties|null)
			viewOnceMessage?: (waproto.ConsumerApplication.ViewOnceMessage.$Properties|null)
			reactionMessage?: (waproto.ConsumerApplication.ReactionMessage.$Properties|null)
			pollCreationMessage?: (waproto.ConsumerApplication.PollCreationMessage.$Properties|null)
			pollUpdateMessage?: (waproto.ConsumerApplication.PollUpdateMessage.$Properties|null)
			editMessage?: (waproto.ConsumerApplication.EditMessage.$Properties|null)
			static encode(m: waproto.ConsumerApplication.Content.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.Content & waproto.ConsumerApplication.Content.$Shape
		}
		namespace Content {
			interface $Properties {
				messageText?: (waproto.MessageText.$Properties|null)
				imageMessage?: (waproto.ConsumerApplication.ImageMessage.$Properties|null)
				contactMessage?: (waproto.ConsumerApplication.ContactMessage.$Properties|null)
				locationMessage?: (waproto.ConsumerApplication.LocationMessage.$Properties|null)
				extendedTextMessage?: (waproto.ConsumerApplication.ExtendedTextMessage.$Properties|null)
				statusTextMessage?: (waproto.ConsumerApplication.StatusTextMesage.$Properties|null)
				documentMessage?: (waproto.ConsumerApplication.DocumentMessage.$Properties|null)
				audioMessage?: (waproto.ConsumerApplication.AudioMessage.$Properties|null)
				videoMessage?: (waproto.ConsumerApplication.VideoMessage.$Properties|null)
				contactsArrayMessage?: (waproto.ConsumerApplication.ContactsArrayMessage.$Properties|null)
				liveLocationMessage?: (waproto.ConsumerApplication.LiveLocationMessage.$Properties|null)
				stickerMessage?: (waproto.ConsumerApplication.StickerMessage.$Properties|null)
				groupInviteMessage?: (waproto.ConsumerApplication.GroupInviteMessage.$Properties|null)
				viewOnceMessage?: (waproto.ConsumerApplication.ViewOnceMessage.$Properties|null)
				reactionMessage?: (waproto.ConsumerApplication.ReactionMessage.$Properties|null)
				pollCreationMessage?: (waproto.ConsumerApplication.PollCreationMessage.$Properties|null)
				pollUpdateMessage?: (waproto.ConsumerApplication.PollUpdateMessage.$Properties|null)
				editMessage?: (waproto.ConsumerApplication.EditMessage.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.Content.$Properties
		}
		interface IEditMessage extends waproto.ConsumerApplication.EditMessage.$Properties {
		}
		class EditMessage {
			constructor(p?: waproto.ConsumerApplication.EditMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			message?: (waproto.MessageText.$Properties|null)
			timestampMs?: (number|Long|null)
			static encode(m: waproto.ConsumerApplication.EditMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.EditMessage & waproto.ConsumerApplication.EditMessage.$Shape
		}
		namespace EditMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				message?: (waproto.MessageText.$Properties|null)
				timestampMs?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.EditMessage.$Properties
		}
		interface IPollAddOptionMessage extends waproto.ConsumerApplication.PollAddOptionMessage.$Properties {
		}
		class PollAddOptionMessage {
			constructor(p?: waproto.ConsumerApplication.PollAddOptionMessage.$Properties)
			$unknowns?: Uint8Array[]
			pollOption: waproto.ConsumerApplication.Option.$Properties[]
			static encode(m: waproto.ConsumerApplication.PollAddOptionMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.PollAddOptionMessage & waproto.ConsumerApplication.PollAddOptionMessage.$Shape
		}
		namespace PollAddOptionMessage {
			interface $Properties {
				pollOption?: (waproto.ConsumerApplication.Option.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.PollAddOptionMessage.$Properties
		}
		interface IPollVoteMessage extends waproto.ConsumerApplication.PollVoteMessage.$Properties {
		}
		class PollVoteMessage {
			constructor(p?: waproto.ConsumerApplication.PollVoteMessage.$Properties)
			$unknowns?: Uint8Array[]
			selectedOptions: Uint8Array[]
			senderTimestampMs?: (number|Long|null)
			static encode(m: waproto.ConsumerApplication.PollVoteMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.PollVoteMessage & waproto.ConsumerApplication.PollVoteMessage.$Shape
		}
		namespace PollVoteMessage {
			interface $Properties {
				selectedOptions?: (Uint8Array[]|null)
				senderTimestampMs?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.PollVoteMessage.$Properties
		}
		interface IPollEncValue extends waproto.ConsumerApplication.PollEncValue.$Properties {
		}
		class PollEncValue {
			constructor(p?: waproto.ConsumerApplication.PollEncValue.$Properties)
			$unknowns?: Uint8Array[]
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
			static encode(m: waproto.ConsumerApplication.PollEncValue.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.PollEncValue & waproto.ConsumerApplication.PollEncValue.$Shape
		}
		namespace PollEncValue {
			interface $Properties {
				encPayload?: (Uint8Array|null)
				encIv?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.PollEncValue.$Properties
		}
		interface IPollUpdateMessage extends waproto.ConsumerApplication.PollUpdateMessage.$Properties {
		}
		class PollUpdateMessage {
			constructor(p?: waproto.ConsumerApplication.PollUpdateMessage.$Properties)
			$unknowns?: Uint8Array[]
			pollCreationMessageKey?: (waproto.MessageKey.$Properties|null)
			vote?: (waproto.ConsumerApplication.PollEncValue.$Properties|null)
			addOption?: (waproto.ConsumerApplication.PollEncValue.$Properties|null)
			static encode(m: waproto.ConsumerApplication.PollUpdateMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.PollUpdateMessage & waproto.ConsumerApplication.PollUpdateMessage.$Shape
		}
		namespace PollUpdateMessage {
			interface $Properties {
				pollCreationMessageKey?: (waproto.MessageKey.$Properties|null)
				vote?: (waproto.ConsumerApplication.PollEncValue.$Properties|null)
				addOption?: (waproto.ConsumerApplication.PollEncValue.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.PollUpdateMessage.$Properties
		}
		interface IPollCreationMessage extends waproto.ConsumerApplication.PollCreationMessage.$Properties {
		}
		class PollCreationMessage {
			constructor(p?: waproto.ConsumerApplication.PollCreationMessage.$Properties)
			$unknowns?: Uint8Array[]
			encKey?: (Uint8Array|null)
			name?: (string|null)
			options: waproto.ConsumerApplication.Option.$Properties[]
			selectableOptionsCount?: (number|null)
			static encode(m: waproto.ConsumerApplication.PollCreationMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.PollCreationMessage & waproto.ConsumerApplication.PollCreationMessage.$Shape
		}
		namespace PollCreationMessage {
			interface $Properties {
				encKey?: (Uint8Array|null)
				name?: (string|null)
				options?: (waproto.ConsumerApplication.Option.$Properties[]|null)
				selectableOptionsCount?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.PollCreationMessage.$Properties
		}
		interface IOption extends waproto.ConsumerApplication.Option.$Properties {
		}
		class Option {
			constructor(p?: waproto.ConsumerApplication.Option.$Properties)
			$unknowns?: Uint8Array[]
			optionName?: (string|null)
			static encode(m: waproto.ConsumerApplication.Option.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.Option & waproto.ConsumerApplication.Option.$Shape
		}
		namespace Option {
			interface $Properties {
				optionName?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.Option.$Properties
		}
		interface IReactionMessage extends waproto.ConsumerApplication.ReactionMessage.$Properties {
		}
		class ReactionMessage {
			constructor(p?: waproto.ConsumerApplication.ReactionMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			text?: (string|null)
			groupingKey?: (string|null)
			senderTimestampMs?: (number|Long|null)
			reactionMetadataDataclassData?: (string|null)
			style?: (number|null)
			static encode(m: waproto.ConsumerApplication.ReactionMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.ReactionMessage & waproto.ConsumerApplication.ReactionMessage.$Shape
		}
		namespace ReactionMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				text?: (string|null)
				groupingKey?: (string|null)
				senderTimestampMs?: (number|Long|null)
				reactionMetadataDataclassData?: (string|null)
				style?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.ReactionMessage.$Properties
		}
		interface IRevokeMessage extends waproto.ConsumerApplication.RevokeMessage.$Properties {
		}
		class RevokeMessage {
			constructor(p?: waproto.ConsumerApplication.RevokeMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			static encode(m: waproto.ConsumerApplication.RevokeMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.RevokeMessage & waproto.ConsumerApplication.RevokeMessage.$Shape
		}
		namespace RevokeMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.RevokeMessage.$Properties
		}
		interface IViewOnceMessage extends waproto.ConsumerApplication.ViewOnceMessage.$Properties {
		}
		class ViewOnceMessage {
			constructor(p?: waproto.ConsumerApplication.ViewOnceMessage.$Properties)
			$unknowns?: Uint8Array[]
			imageMessage?: (waproto.ConsumerApplication.ImageMessage.$Properties|null)
			videoMessage?: (waproto.ConsumerApplication.VideoMessage.$Properties|null)
			static encode(m: waproto.ConsumerApplication.ViewOnceMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.ViewOnceMessage & waproto.ConsumerApplication.ViewOnceMessage.$Shape
		}
		namespace ViewOnceMessage {
			interface $Properties {
				imageMessage?: (waproto.ConsumerApplication.ImageMessage.$Properties|null)
				videoMessage?: (waproto.ConsumerApplication.VideoMessage.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.ViewOnceMessage.$Properties
		}
		interface IGroupInviteMessage extends waproto.ConsumerApplication.GroupInviteMessage.$Properties {
		}
		class GroupInviteMessage {
			constructor(p?: waproto.ConsumerApplication.GroupInviteMessage.$Properties)
			$unknowns?: Uint8Array[]
			groupJid?: (string|null)
			inviteCode?: (string|null)
			inviteExpiration?: (number|Long|null)
			groupName?: (string|null)
			jpegThumbnail?: (Uint8Array|null)
			caption?: (waproto.MessageText.$Properties|null)
			static encode(m: waproto.ConsumerApplication.GroupInviteMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.GroupInviteMessage & waproto.ConsumerApplication.GroupInviteMessage.$Shape
		}
		namespace GroupInviteMessage {
			interface $Properties {
				groupJid?: (string|null)
				inviteCode?: (string|null)
				inviteExpiration?: (number|Long|null)
				groupName?: (string|null)
				jpegThumbnail?: (Uint8Array|null)
				caption?: (waproto.MessageText.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.GroupInviteMessage.$Properties
		}
		interface ILiveLocationMessage extends waproto.ConsumerApplication.LiveLocationMessage.$Properties {
		}
		class LiveLocationMessage {
			constructor(p?: waproto.ConsumerApplication.LiveLocationMessage.$Properties)
			$unknowns?: Uint8Array[]
			location?: (waproto.ConsumerApplication.Location.$Properties|null)
			accuracyInMeters?: (number|null)
			speedInMps?: (number|null)
			degreesClockwiseFromMagneticNorth?: (number|null)
			caption?: (waproto.MessageText.$Properties|null)
			sequenceNumber?: (number|Long|null)
			timeOffset?: (number|null)
			static encode(m: waproto.ConsumerApplication.LiveLocationMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.LiveLocationMessage & waproto.ConsumerApplication.LiveLocationMessage.$Shape
		}
		namespace LiveLocationMessage {
			interface $Properties {
				location?: (waproto.ConsumerApplication.Location.$Properties|null)
				accuracyInMeters?: (number|null)
				speedInMps?: (number|null)
				degreesClockwiseFromMagneticNorth?: (number|null)
				caption?: (waproto.MessageText.$Properties|null)
				sequenceNumber?: (number|Long|null)
				timeOffset?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.LiveLocationMessage.$Properties
		}
		interface IContactsArrayMessage extends waproto.ConsumerApplication.ContactsArrayMessage.$Properties {
		}
		class ContactsArrayMessage {
			constructor(p?: waproto.ConsumerApplication.ContactsArrayMessage.$Properties)
			$unknowns?: Uint8Array[]
			displayName?: (string|null)
			contacts: waproto.ConsumerApplication.ContactMessage.$Properties[]
			static encode(m: waproto.ConsumerApplication.ContactsArrayMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.ContactsArrayMessage & waproto.ConsumerApplication.ContactsArrayMessage.$Shape
		}
		namespace ContactsArrayMessage {
			interface $Properties {
				displayName?: (string|null)
				contacts?: (waproto.ConsumerApplication.ContactMessage.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.ContactsArrayMessage.$Properties
		}
		interface IContactMessage extends waproto.ConsumerApplication.ContactMessage.$Properties {
		}
		class ContactMessage {
			constructor(p?: waproto.ConsumerApplication.ContactMessage.$Properties)
			$unknowns?: Uint8Array[]
			contact?: (waproto.SubProtocol.$Properties|null)
			static encode(m: waproto.ConsumerApplication.ContactMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.ContactMessage & waproto.ConsumerApplication.ContactMessage.$Shape
		}
		namespace ContactMessage {
			interface $Properties {
				contact?: (waproto.SubProtocol.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.ContactMessage.$Properties
		}
		interface IStatusTextMesage extends waproto.ConsumerApplication.StatusTextMesage.$Properties {
		}
		class StatusTextMesage {
			constructor(p?: waproto.ConsumerApplication.StatusTextMesage.$Properties)
			$unknowns?: Uint8Array[]
			text?: (waproto.ConsumerApplication.ExtendedTextMessage.$Properties|null)
			textArgb?: (number|null)
			backgroundArgb?: (number|null)
			font?: (waproto.CONSUMER_APPLICATION_STATUS_TEXT_MESAGE_FONT_TYPE|null)
			static encode(m: waproto.ConsumerApplication.StatusTextMesage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.StatusTextMesage & waproto.ConsumerApplication.StatusTextMesage.$Shape
		}
		namespace StatusTextMesage {
			interface $Properties {
				text?: (waproto.ConsumerApplication.ExtendedTextMessage.$Properties|null)
				textArgb?: (number|null)
				backgroundArgb?: (number|null)
				font?: (waproto.CONSUMER_APPLICATION_STATUS_TEXT_MESAGE_FONT_TYPE|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.StatusTextMesage.$Properties
		}
		interface IExtendedTextMessage extends waproto.ConsumerApplication.ExtendedTextMessage.$Properties {
		}
		class ExtendedTextMessage {
			constructor(p?: waproto.ConsumerApplication.ExtendedTextMessage.$Properties)
			$unknowns?: Uint8Array[]
			text?: (waproto.MessageText.$Properties|null)
			matchedText?: (string|null)
			canonicalUrl?: (string|null)
			description?: (string|null)
			title?: (string|null)
			thumbnail?: (waproto.SubProtocol.$Properties|null)
			previewType?: (waproto.CONSUMER_APPLICATION_EXTENDED_TEXT_MESSAGE_PREVIEW_TYPE|null)
			static encode(m: waproto.ConsumerApplication.ExtendedTextMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.ExtendedTextMessage & waproto.ConsumerApplication.ExtendedTextMessage.$Shape
		}
		namespace ExtendedTextMessage {
			interface $Properties {
				text?: (waproto.MessageText.$Properties|null)
				matchedText?: (string|null)
				canonicalUrl?: (string|null)
				description?: (string|null)
				title?: (string|null)
				thumbnail?: (waproto.SubProtocol.$Properties|null)
				previewType?: (waproto.CONSUMER_APPLICATION_EXTENDED_TEXT_MESSAGE_PREVIEW_TYPE|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.ExtendedTextMessage.$Properties
		}
		interface ILocationMessage extends waproto.ConsumerApplication.LocationMessage.$Properties {
		}
		class LocationMessage {
			constructor(p?: waproto.ConsumerApplication.LocationMessage.$Properties)
			$unknowns?: Uint8Array[]
			location?: (waproto.ConsumerApplication.Location.$Properties|null)
			address?: (string|null)
			static encode(m: waproto.ConsumerApplication.LocationMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.LocationMessage & waproto.ConsumerApplication.LocationMessage.$Shape
		}
		namespace LocationMessage {
			interface $Properties {
				location?: (waproto.ConsumerApplication.Location.$Properties|null)
				address?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.LocationMessage.$Properties
		}
		interface IStickerMessage extends waproto.ConsumerApplication.StickerMessage.$Properties {
		}
		class StickerMessage {
			constructor(p?: waproto.ConsumerApplication.StickerMessage.$Properties)
			$unknowns?: Uint8Array[]
			sticker?: (waproto.SubProtocol.$Properties|null)
			static encode(m: waproto.ConsumerApplication.StickerMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.StickerMessage & waproto.ConsumerApplication.StickerMessage.$Shape
		}
		namespace StickerMessage {
			interface $Properties {
				sticker?: (waproto.SubProtocol.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.StickerMessage.$Properties
		}
		interface IDocumentMessage extends waproto.ConsumerApplication.DocumentMessage.$Properties {
		}
		class DocumentMessage {
			constructor(p?: waproto.ConsumerApplication.DocumentMessage.$Properties)
			$unknowns?: Uint8Array[]
			document?: (waproto.SubProtocol.$Properties|null)
			fileName?: (string|null)
			static encode(m: waproto.ConsumerApplication.DocumentMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.DocumentMessage & waproto.ConsumerApplication.DocumentMessage.$Shape
		}
		namespace DocumentMessage {
			interface $Properties {
				document?: (waproto.SubProtocol.$Properties|null)
				fileName?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.DocumentMessage.$Properties
		}
		interface IVideoMessage extends waproto.ConsumerApplication.VideoMessage.$Properties {
		}
		class VideoMessage {
			constructor(p?: waproto.ConsumerApplication.VideoMessage.$Properties)
			$unknowns?: Uint8Array[]
			video?: (waproto.SubProtocol.$Properties|null)
			caption?: (waproto.MessageText.$Properties|null)
			static encode(m: waproto.ConsumerApplication.VideoMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.VideoMessage & waproto.ConsumerApplication.VideoMessage.$Shape
		}
		namespace VideoMessage {
			interface $Properties {
				video?: (waproto.SubProtocol.$Properties|null)
				caption?: (waproto.MessageText.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.VideoMessage.$Properties
		}
		interface IAudioMessage extends waproto.ConsumerApplication.AudioMessage.$Properties {
		}
		class AudioMessage {
			constructor(p?: waproto.ConsumerApplication.AudioMessage.$Properties)
			$unknowns?: Uint8Array[]
			audio?: (waproto.SubProtocol.$Properties|null)
			ptt?: (boolean|null)
			static encode(m: waproto.ConsumerApplication.AudioMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.AudioMessage & waproto.ConsumerApplication.AudioMessage.$Shape
		}
		namespace AudioMessage {
			interface $Properties {
				audio?: (waproto.SubProtocol.$Properties|null)
				ptt?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.AudioMessage.$Properties
		}
		interface IImageMessage extends waproto.ConsumerApplication.ImageMessage.$Properties {
		}
		class ImageMessage {
			constructor(p?: waproto.ConsumerApplication.ImageMessage.$Properties)
			$unknowns?: Uint8Array[]
			image?: (waproto.SubProtocol.$Properties|null)
			caption?: (waproto.MessageText.$Properties|null)
			static encode(m: waproto.ConsumerApplication.ImageMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.ImageMessage & waproto.ConsumerApplication.ImageMessage.$Shape
		}
		namespace ImageMessage {
			interface $Properties {
				image?: (waproto.SubProtocol.$Properties|null)
				caption?: (waproto.MessageText.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.ImageMessage.$Properties
		}
		interface IInteractiveAnnotation extends waproto.ConsumerApplication.InteractiveAnnotation.$Properties {
		}
		class InteractiveAnnotation {
			constructor(p?: waproto.ConsumerApplication.InteractiveAnnotation.$Properties)
			$unknowns?: Uint8Array[]
			polygonVertices: waproto.ConsumerApplication.Point.$Properties[]
			location?: (waproto.ConsumerApplication.Location.$Properties|null)
			static encode(m: waproto.ConsumerApplication.InteractiveAnnotation.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.InteractiveAnnotation & waproto.ConsumerApplication.InteractiveAnnotation.$Shape
		}
		namespace InteractiveAnnotation {
			interface $Properties {
				polygonVertices?: (waproto.ConsumerApplication.Point.$Properties[]|null)
				location?: (waproto.ConsumerApplication.Location.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.InteractiveAnnotation.$Properties
		}
		interface IPoint extends waproto.ConsumerApplication.Point.$Properties {
		}
		class Point {
			constructor(p?: waproto.ConsumerApplication.Point.$Properties)
			$unknowns?: Uint8Array[]
			x?: (number|null)
			y?: (number|null)
			static encode(m: waproto.ConsumerApplication.Point.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.Point & waproto.ConsumerApplication.Point.$Shape
		}
		namespace Point {
			interface $Properties {
				x?: (number|null)
				y?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.Point.$Properties
		}
		interface ILocation extends waproto.ConsumerApplication.Location.$Properties {
		}
		class Location {
			constructor(p?: waproto.ConsumerApplication.Location.$Properties)
			$unknowns?: Uint8Array[]
			degreesLatitude?: (number|null)
			degreesLongitude?: (number|null)
			name?: (string|null)
			static encode(m: waproto.ConsumerApplication.Location.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.Location & waproto.ConsumerApplication.Location.$Shape
		}
		namespace Location {
			interface $Properties {
				degreesLatitude?: (number|null)
				degreesLongitude?: (number|null)
				name?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.Location.$Properties
		}
		interface IMediaPayload extends waproto.ConsumerApplication.MediaPayload.$Properties {
		}
		class MediaPayload {
			constructor(p?: waproto.ConsumerApplication.MediaPayload.$Properties)
			$unknowns?: Uint8Array[]
			protocol?: (waproto.SubProtocol.$Properties|null)
			static encode(m: waproto.ConsumerApplication.MediaPayload.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ConsumerApplication.MediaPayload & waproto.ConsumerApplication.MediaPayload.$Shape
		}
		namespace MediaPayload {
			interface $Properties {
				protocol?: (waproto.SubProtocol.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ConsumerApplication.MediaPayload.$Properties
		}
	}
	interface IContextInfo extends waproto.ContextInfo.$Properties {
	}
	class ContextInfo {
		constructor(p?: waproto.ContextInfo.$Properties)
		$unknowns?: Uint8Array[]
		stanzaId?: (string|null)
		participant?: (string|null)
		quotedMessage?: (waproto.Message.$Properties|null)
		remoteJid?: (string|null)
		mentionedJid: string[]
		conversionSource?: (string|null)
		conversionData?: (Uint8Array|null)
		conversionDelaySeconds?: (number|null)
		forwardingScore?: (number|null)
		isForwarded?: (boolean|null)
		quotedAd?: (waproto.ContextInfo.AdReplyInfo.$Properties|null)
		placeholderKey?: (waproto.MessageKey.$Properties|null)
		expiration?: (number|null)
		ephemeralSettingTimestamp?: (number|Long|null)
		ephemeralSharedSecret?: (Uint8Array|null)
		externalAdReply?: (waproto.ContextInfo.ExternalAdReplyInfo.$Properties|null)
		entryPointConversionSource?: (string|null)
		entryPointConversionApp?: (string|null)
		entryPointConversionDelaySeconds?: (number|null)
		disappearingMode?: (waproto.DisappearingMode.$Properties|null)
		actionLink?: (waproto.ActionLink.$Properties|null)
		groupSubject?: (string|null)
		parentGroupJid?: (string|null)
		trustBannerType?: (string|null)
		trustBannerAction?: (number|null)
		isSampled?: (boolean|null)
		groupMentions: waproto.GroupMention.$Properties[]
		utm?: (waproto.ContextInfo.UTMInfo.$Properties|null)
		forwardedNewsletterMessageInfo?: (waproto.ContextInfo.ForwardedNewsletterMessageInfo.$Properties|null)
		businessMessageForwardInfo?: (waproto.ContextInfo.BusinessMessageForwardInfo.$Properties|null)
		smbClientCampaignId?: (string|null)
		smbServerCampaignId?: (string|null)
		dataSharingContext?: (waproto.ContextInfo.DataSharingContext.$Properties|null)
		alwaysShowAdAttribution?: (boolean|null)
		featureEligibilities?: (waproto.ContextInfo.FeatureEligibilities.$Properties|null)
		entryPointConversionExternalSource?: (string|null)
		entryPointConversionExternalMedium?: (string|null)
		ctwaSignals?: (string|null)
		ctwaPayload?: (Uint8Array|null)
		forwardedAiBotMessageInfo?: (waproto.ForwardedAIBotMessageInfo.$Properties|null)
		statusAttributionType?: (waproto.ContextInfo.StatusAttributionType|null)
		urlTrackingMap?: (waproto.UrlTrackingMap.$Properties|null)
		pairedMediaType?: (waproto.ContextInfo.PairedMediaType|null)
		rankingVersion?: (number|null)
		memberLabel?: (waproto.MemberLabel.$Properties|null)
		isQuestion?: (boolean|null)
		statusSourceType?: (waproto.ContextInfo.StatusSourceType|null)
		statusAttributions: waproto.StatusAttribution.$Properties[]
		isGroupStatus?: (boolean|null)
		forwardOrigin?: (waproto.ContextInfo.ForwardOrigin|null)
		questionReplyQuotedMessage?: (waproto.ContextInfo.QuestionReplyQuotedMessage.$Properties|null)
		statusAudienceMetadata?: (waproto.ContextInfo.StatusAudienceMetadata.$Properties|null)
		nonJidMentions?: (number|null)
		quotedType?: (waproto.ContextInfo.QuotedType|null)
		botMessageSharingInfo?: (waproto.BotMessageSharingInfo.$Properties|null)
		isSpoiler?: (boolean|null)
		mediaDomainInfo?: (waproto.MediaDomainInfo.$Properties|null)
		partiallySelectedContent?: (waproto.ContextInfo.PartiallySelectedContent.$Properties|null)
		afterReadDuration?: (number|null)
		crossAppSource?: (waproto.ContextInfo.CrossAppSource|null)
		businessInteractionPills?: (waproto.ContextInfo.BusinessInteractionPills.$Properties|null)
		posterStatusId?: (string|null)
		instagramThreadLink?: (waproto.ContextInfo.InstagramThreadLink.$Properties|null)
		aiProvenance?: (waproto.AIProvenance.$Properties|null)
		static encode(m: waproto.ContextInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo & waproto.ContextInfo.$Shape
	}
	namespace ContextInfo {
		interface $Properties {
			stanzaId?: (string|null)
			participant?: (string|null)
			quotedMessage?: (waproto.Message.$Properties|null)
			remoteJid?: (string|null)
			mentionedJid?: (string[]|null)
			conversionSource?: (string|null)
			conversionData?: (Uint8Array|null)
			conversionDelaySeconds?: (number|null)
			forwardingScore?: (number|null)
			isForwarded?: (boolean|null)
			quotedAd?: (waproto.ContextInfo.AdReplyInfo.$Properties|null)
			placeholderKey?: (waproto.MessageKey.$Properties|null)
			expiration?: (number|null)
			ephemeralSettingTimestamp?: (number|Long|null)
			ephemeralSharedSecret?: (Uint8Array|null)
			externalAdReply?: (waproto.ContextInfo.ExternalAdReplyInfo.$Properties|null)
			entryPointConversionSource?: (string|null)
			entryPointConversionApp?: (string|null)
			entryPointConversionDelaySeconds?: (number|null)
			disappearingMode?: (waproto.DisappearingMode.$Properties|null)
			actionLink?: (waproto.ActionLink.$Properties|null)
			groupSubject?: (string|null)
			parentGroupJid?: (string|null)
			trustBannerType?: (string|null)
			trustBannerAction?: (number|null)
			isSampled?: (boolean|null)
			groupMentions?: (waproto.GroupMention.$Properties[]|null)
			utm?: (waproto.ContextInfo.UTMInfo.$Properties|null)
			forwardedNewsletterMessageInfo?: (waproto.ContextInfo.ForwardedNewsletterMessageInfo.$Properties|null)
			businessMessageForwardInfo?: (waproto.ContextInfo.BusinessMessageForwardInfo.$Properties|null)
			smbClientCampaignId?: (string|null)
			smbServerCampaignId?: (string|null)
			dataSharingContext?: (waproto.ContextInfo.DataSharingContext.$Properties|null)
			alwaysShowAdAttribution?: (boolean|null)
			featureEligibilities?: (waproto.ContextInfo.FeatureEligibilities.$Properties|null)
			entryPointConversionExternalSource?: (string|null)
			entryPointConversionExternalMedium?: (string|null)
			ctwaSignals?: (string|null)
			ctwaPayload?: (Uint8Array|null)
			forwardedAiBotMessageInfo?: (waproto.ForwardedAIBotMessageInfo.$Properties|null)
			statusAttributionType?: (waproto.ContextInfo.StatusAttributionType|null)
			urlTrackingMap?: (waproto.UrlTrackingMap.$Properties|null)
			pairedMediaType?: (waproto.ContextInfo.PairedMediaType|null)
			rankingVersion?: (number|null)
			memberLabel?: (waproto.MemberLabel.$Properties|null)
			isQuestion?: (boolean|null)
			statusSourceType?: (waproto.ContextInfo.StatusSourceType|null)
			statusAttributions?: (waproto.StatusAttribution.$Properties[]|null)
			isGroupStatus?: (boolean|null)
			forwardOrigin?: (waproto.ContextInfo.ForwardOrigin|null)
			questionReplyQuotedMessage?: (waproto.ContextInfo.QuestionReplyQuotedMessage.$Properties|null)
			statusAudienceMetadata?: (waproto.ContextInfo.StatusAudienceMetadata.$Properties|null)
			nonJidMentions?: (number|null)
			quotedType?: (waproto.ContextInfo.QuotedType|null)
			botMessageSharingInfo?: (waproto.BotMessageSharingInfo.$Properties|null)
			isSpoiler?: (boolean|null)
			mediaDomainInfo?: (waproto.MediaDomainInfo.$Properties|null)
			partiallySelectedContent?: (waproto.ContextInfo.PartiallySelectedContent.$Properties|null)
			afterReadDuration?: (number|null)
			crossAppSource?: (waproto.ContextInfo.CrossAppSource|null)
			businessInteractionPills?: (waproto.ContextInfo.BusinessInteractionPills.$Properties|null)
			posterStatusId?: (string|null)
			instagramThreadLink?: (waproto.ContextInfo.InstagramThreadLink.$Properties|null)
			aiProvenance?: (waproto.AIProvenance.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ContextInfo.$Properties
		enum CrossAppSource {
			CROSS_APP_SOURCE_UNKNOWN = 0,
			CROSS_APP_SOURCE_INSTAGRAM = 1,
			CROSS_APP_SOURCE_FACEBOOK = 2
		}
		enum QuotedType {
			EXPLICIT = 0,
			AUTO = 1
		}
		enum ForwardOrigin {
			UNKNOWN = 0,
			CHAT = 1,
			STATUS = 2,
			CHANNELS = 3,
			META_AI = 4,
			UGC = 5
		}
		enum StatusSourceType {
			IMAGE = 0,
			VIDEO = 1,
			GIF = 2,
			AUDIO = 3,
			TEXT = 4,
			MUSIC_STANDALONE = 5
		}
		enum PairedMediaType {
			NOT_PAIRED_MEDIA = 0,
			SD_VIDEO_PARENT = 1,
			HD_VIDEO_CHILD = 2,
			SD_IMAGE_PARENT = 3,
			HD_IMAGE_CHILD = 4,
			MOTION_PHOTO_PARENT = 5,
			MOTION_PHOTO_CHILD = 6,
			HEVC_VIDEO_PARENT = 7,
			HEVC_VIDEO_CHILD = 8
		}
		enum StatusAttributionType {
			NONE = 0,
			RESHARED_FROM_MENTION = 1,
			RESHARED_FROM_POST = 2,
			RESHARED_FROM_POST_MANY_TIMES = 3,
			FORWARDED_FROM_STATUS = 4
		}
		interface IInstagramThreadLink extends waproto.ContextInfo.InstagramThreadLink.$Properties {
		}
		class InstagramThreadLink {
			constructor(p?: waproto.ContextInfo.InstagramThreadLink.$Properties)
			$unknowns?: Uint8Array[]
			url?: (string|null)
			static encode(m: waproto.ContextInfo.InstagramThreadLink.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.InstagramThreadLink & waproto.ContextInfo.InstagramThreadLink.$Shape
		}
		namespace InstagramThreadLink {
			interface $Properties {
				url?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ContextInfo.InstagramThreadLink.$Properties
		}
		interface IBusinessInteractionPills extends waproto.ContextInfo.BusinessInteractionPills.$Properties {
		}
		class BusinessInteractionPills {
			constructor(p?: waproto.ContextInfo.BusinessInteractionPills.$Properties)
			$unknowns?: Uint8Array[]
			businessJid?: (string|null)
			pills: waproto.ContextInfo.BusinessInteractionPills.Pill.$Properties[]
			entryPoint?: (waproto.ContextInfo.BusinessInteractionPills.EntryPoint|null)
			signedPayload?: (Uint8Array|null)
			signatureEnvelope?: (waproto.BotSignatureVerificationMetadata.$Properties|null)
			unauthenticatedBusinessMetadata?: (waproto.ContextInfo.BusinessInteractionPills.UnauthenticatedBusinessMetadata.$Properties|null)
			static encode(m: waproto.ContextInfo.BusinessInteractionPills.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.BusinessInteractionPills & waproto.ContextInfo.BusinessInteractionPills.$Shape
		}
		namespace BusinessInteractionPills {
			interface $Properties {
				businessJid?: (string|null)
				pills?: (waproto.ContextInfo.BusinessInteractionPills.Pill.$Properties[]|null)
				entryPoint?: (waproto.ContextInfo.BusinessInteractionPills.EntryPoint|null)
				signedPayload?: (Uint8Array|null)
				signatureEnvelope?: (waproto.BotSignatureVerificationMetadata.$Properties|null)
				unauthenticatedBusinessMetadata?: (waproto.ContextInfo.BusinessInteractionPills.UnauthenticatedBusinessMetadata.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ContextInfo.BusinessInteractionPills.$Properties
			enum EntryPoint {
				ENTRY_POINT_UNKNOWN = 0,
				P2P_LINK_SHARE = 1,
				CONTACT_CARD_SHARING = 2,
				PHONE_NUMBER = 3,
				STATUS = 4,
				IN_THREAD_CONTEXT_CARD = 5
			}
			enum PillType {
				UNKNOWN = 0,
				VIEW_BUSINESS = 1,
				CHAT = 2,
				CALL = 3,
				CATALOG = 4,
				CHANNEL = 5,
				BOOK_APPOINTMENT = 6,
				OFFERS = 7,
				BESTSELLERS = 8,
				MENU = 9,
				ABOUT = 10,
				SHOP = 11,
				ORDER = 12
			}
			interface IUnauthenticatedBusinessMetadata extends waproto.ContextInfo.BusinessInteractionPills.UnauthenticatedBusinessMetadata.$Properties {
			}
			class UnauthenticatedBusinessMetadata {
				constructor(p?: waproto.ContextInfo.BusinessInteractionPills.UnauthenticatedBusinessMetadata.$Properties)
				$unknowns?: Uint8Array[]
				businessName?: (string|null)
				businessCategory?: (string|null)
				businessIsOpen?: (boolean|null)
				businessIsOpenSnapshotMs?: (number|Long|null)
				static encode(m: waproto.ContextInfo.BusinessInteractionPills.UnauthenticatedBusinessMetadata.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.BusinessInteractionPills.UnauthenticatedBusinessMetadata & waproto.ContextInfo.BusinessInteractionPills.UnauthenticatedBusinessMetadata.$Shape
			}
			namespace UnauthenticatedBusinessMetadata {
				interface $Properties {
					businessName?: (string|null)
					businessCategory?: (string|null)
					businessIsOpen?: (boolean|null)
					businessIsOpenSnapshotMs?: (number|Long|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.ContextInfo.BusinessInteractionPills.UnauthenticatedBusinessMetadata.$Properties
			}
			interface ISignedPayload extends waproto.ContextInfo.BusinessInteractionPills.SignedPayload.$Properties {
			}
			class SignedPayload {
				constructor(p?: waproto.ContextInfo.BusinessInteractionPills.SignedPayload.$Properties)
				$unknowns?: Uint8Array[]
				verifiedName?: (string|null)
				pills: waproto.ContextInfo.BusinessInteractionPills.Pill.$Properties[]
				static encode(m: waproto.ContextInfo.BusinessInteractionPills.SignedPayload.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.BusinessInteractionPills.SignedPayload & waproto.ContextInfo.BusinessInteractionPills.SignedPayload.$Shape
			}
			namespace SignedPayload {
				interface $Properties {
					verifiedName?: (string|null)
					pills?: (waproto.ContextInfo.BusinessInteractionPills.Pill.$Properties[]|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.ContextInfo.BusinessInteractionPills.SignedPayload.$Properties
			}
			interface IPill extends waproto.ContextInfo.BusinessInteractionPills.Pill.$Properties {
			}
			class Pill {
				constructor(p?: waproto.ContextInfo.BusinessInteractionPills.Pill.$Properties)
				$unknowns?: Uint8Array[]
				pillType?: (waproto.ContextInfo.BusinessInteractionPills.PillType|null)
				actionUrl?: (string|null)
				static encode(m: waproto.ContextInfo.BusinessInteractionPills.Pill.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.BusinessInteractionPills.Pill & waproto.ContextInfo.BusinessInteractionPills.Pill.$Shape
			}
			namespace Pill {
				interface $Properties {
					pillType?: (waproto.ContextInfo.BusinessInteractionPills.PillType|null)
					actionUrl?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.ContextInfo.BusinessInteractionPills.Pill.$Properties
			}
		}
		interface IStatusAudienceMetadata extends waproto.ContextInfo.StatusAudienceMetadata.$Properties {
		}
		class StatusAudienceMetadata {
			constructor(p?: waproto.ContextInfo.StatusAudienceMetadata.$Properties)
			$unknowns?: Uint8Array[]
			audienceType?: (waproto.ContextInfo.StatusAudienceMetadata.AudienceType|null)
			listName?: (string|null)
			listEmoji?: (string|null)
			static encode(m: waproto.ContextInfo.StatusAudienceMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.StatusAudienceMetadata & waproto.ContextInfo.StatusAudienceMetadata.$Shape
		}
		namespace StatusAudienceMetadata {
			interface $Properties {
				audienceType?: (waproto.ContextInfo.StatusAudienceMetadata.AudienceType|null)
				listName?: (string|null)
				listEmoji?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ContextInfo.StatusAudienceMetadata.$Properties
			enum AudienceType {
				UNKNOWN = 0,
				CLOSE_FRIENDS = 1
			}
		}
		interface IPartiallySelectedContent extends waproto.ContextInfo.PartiallySelectedContent.$Properties {
		}
		class PartiallySelectedContent {
			constructor(p?: waproto.ContextInfo.PartiallySelectedContent.$Properties)
			$unknowns?: Uint8Array[]
			text?: (string|null)
			static encode(m: waproto.ContextInfo.PartiallySelectedContent.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.PartiallySelectedContent & waproto.ContextInfo.PartiallySelectedContent.$Shape
		}
		namespace PartiallySelectedContent {
			interface $Properties {
				text?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ContextInfo.PartiallySelectedContent.$Properties
		}
		interface IFeatureEligibilities extends waproto.ContextInfo.FeatureEligibilities.$Properties {
		}
		class FeatureEligibilities {
			constructor(p?: waproto.ContextInfo.FeatureEligibilities.$Properties)
			$unknowns?: Uint8Array[]
			cannotBeReactedTo?: (boolean|null)
			cannotBeRanked?: (boolean|null)
			canRequestFeedback?: (boolean|null)
			canBeReshared?: (boolean|null)
			canReceiveMultiReact?: (boolean|null)
			static encode(m: waproto.ContextInfo.FeatureEligibilities.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.FeatureEligibilities & waproto.ContextInfo.FeatureEligibilities.$Shape
		}
		namespace FeatureEligibilities {
			interface $Properties {
				cannotBeReactedTo?: (boolean|null)
				cannotBeRanked?: (boolean|null)
				canRequestFeedback?: (boolean|null)
				canBeReshared?: (boolean|null)
				canReceiveMultiReact?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ContextInfo.FeatureEligibilities.$Properties
		}
		interface IDataSharingContext extends waproto.ContextInfo.DataSharingContext.$Properties {
		}
		class DataSharingContext {
			constructor(p?: waproto.ContextInfo.DataSharingContext.$Properties)
			$unknowns?: Uint8Array[]
			showMmDisclosure?: (boolean|null)
			encryptedSignalTokenConsented?: (string|null)
			parameters: waproto.ContextInfo.DataSharingContext.Parameters.$Properties[]
			dataSharingFlags?: (number|null)
			static encode(m: waproto.ContextInfo.DataSharingContext.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.DataSharingContext & waproto.ContextInfo.DataSharingContext.$Shape
		}
		namespace DataSharingContext {
			interface $Properties {
				showMmDisclosure?: (boolean|null)
				encryptedSignalTokenConsented?: (string|null)
				parameters?: (waproto.ContextInfo.DataSharingContext.Parameters.$Properties[]|null)
				dataSharingFlags?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ContextInfo.DataSharingContext.$Properties
			enum DataSharingFlags {
				SHOW_MM_DISCLOSURE_ON_CLICK = 1,
				SHOW_MM_DISCLOSURE_ON_READ = 2
			}
			interface IParameters extends waproto.ContextInfo.DataSharingContext.Parameters.$Properties {
			}
			class Parameters {
				constructor(p?: waproto.ContextInfo.DataSharingContext.Parameters.$Properties)
				$unknowns?: Uint8Array[]
				key?: (string|null)
				stringData?: (string|null)
				intData?: (number|Long|null)
				floatData?: (number|null)
				contents?: (waproto.ContextInfo.DataSharingContext.Parameters.$Properties|null)
				static encode(m: waproto.ContextInfo.DataSharingContext.Parameters.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.DataSharingContext.Parameters & waproto.ContextInfo.DataSharingContext.Parameters.$Shape
			}
			namespace Parameters {
				interface $Properties {
					key?: (string|null)
					stringData?: (string|null)
					intData?: (number|Long|null)
					floatData?: (number|null)
					contents?: (waproto.ContextInfo.DataSharingContext.Parameters.$Properties|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.ContextInfo.DataSharingContext.Parameters.$Properties
			}
		}
		interface IQuestionReplyQuotedMessage extends waproto.ContextInfo.QuestionReplyQuotedMessage.$Properties {
		}
		class QuestionReplyQuotedMessage {
			constructor(p?: waproto.ContextInfo.QuestionReplyQuotedMessage.$Properties)
			$unknowns?: Uint8Array[]
			serverQuestionId?: (number|null)
			quotedQuestion?: (waproto.Message.$Properties|null)
			quotedResponse?: (waproto.Message.$Properties|null)
			static encode(m: waproto.ContextInfo.QuestionReplyQuotedMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.QuestionReplyQuotedMessage & waproto.ContextInfo.QuestionReplyQuotedMessage.$Shape
		}
		namespace QuestionReplyQuotedMessage {
			interface $Properties {
				serverQuestionId?: (number|null)
				quotedQuestion?: (waproto.Message.$Properties|null)
				quotedResponse?: (waproto.Message.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ContextInfo.QuestionReplyQuotedMessage.$Properties
		}
		interface IForwardedNewsletterMessageInfo extends waproto.ContextInfo.ForwardedNewsletterMessageInfo.$Properties {
		}
		class ForwardedNewsletterMessageInfo {
			constructor(p?: waproto.ContextInfo.ForwardedNewsletterMessageInfo.$Properties)
			$unknowns?: Uint8Array[]
			newsletterJid?: (string|null)
			serverMessageId?: (number|null)
			newsletterName?: (string|null)
			contentType?: (waproto.ContextInfo.ForwardedNewsletterMessageInfo.ContentType|null)
			accessibilityText?: (string|null)
			profileName?: (string|null)
			static encode(m: waproto.ContextInfo.ForwardedNewsletterMessageInfo.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.ForwardedNewsletterMessageInfo & waproto.ContextInfo.ForwardedNewsletterMessageInfo.$Shape
		}
		namespace ForwardedNewsletterMessageInfo {
			interface $Properties {
				newsletterJid?: (string|null)
				serverMessageId?: (number|null)
				newsletterName?: (string|null)
				contentType?: (waproto.ContextInfo.ForwardedNewsletterMessageInfo.ContentType|null)
				accessibilityText?: (string|null)
				profileName?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ContextInfo.ForwardedNewsletterMessageInfo.$Properties
			enum ContentType {
				UPDATE = 1,
				UPDATE_CARD = 2,
				LINK_CARD = 3
			}
		}
		interface IUTMInfo extends waproto.ContextInfo.UTMInfo.$Properties {
		}
		class UTMInfo {
			constructor(p?: waproto.ContextInfo.UTMInfo.$Properties)
			$unknowns?: Uint8Array[]
			utmSource?: (string|null)
			utmCampaign?: (string|null)
			static encode(m: waproto.ContextInfo.UTMInfo.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.UTMInfo & waproto.ContextInfo.UTMInfo.$Shape
		}
		namespace UTMInfo {
			interface $Properties {
				utmSource?: (string|null)
				utmCampaign?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ContextInfo.UTMInfo.$Properties
		}
		interface IExternalAdReplyInfo extends waproto.ContextInfo.ExternalAdReplyInfo.$Properties {
		}
		class ExternalAdReplyInfo {
			constructor(p?: waproto.ContextInfo.ExternalAdReplyInfo.$Properties)
			$unknowns?: Uint8Array[]
			title?: (string|null)
			body?: (string|null)
			mediaType?: (waproto.ContextInfo.ExternalAdReplyInfo.MediaType|null)
			thumbnailUrl?: (string|null)
			mediaUrl?: (string|null)
			thumbnail?: (Uint8Array|null)
			sourceType?: (string|null)
			sourceId?: (string|null)
			sourceUrl?: (string|null)
			containsAutoReply?: (boolean|null)
			renderLargerThumbnail?: (boolean|null)
			showAdAttribution?: (boolean|null)
			ctwaClid?: (string|null)
			ref?: (string|null)
			clickToWhatsappCall?: (boolean|null)
			adContextPreviewDismissed?: (boolean|null)
			sourceApp?: (string|null)
			automatedGreetingMessageShown?: (boolean|null)
			greetingMessageBody?: (string|null)
			ctaPayload?: (string|null)
			disableNudge?: (boolean|null)
			originalImageUrl?: (string|null)
			automatedGreetingMessageCtaType?: (string|null)
			wtwaAdFormat?: (boolean|null)
			adType?: (waproto.ContextInfo.ExternalAdReplyInfo.AdType|null)
			wtwaWebsiteUrl?: (string|null)
			adPreviewUrl?: (string|null)
			containsCtwaFlowsAutoReply?: (boolean|null)
			agmThumbnailStrategy?: (number|null)
			agmTitleStrategy?: (number|null)
			agmSubtitleStrategy?: (number|null)
			agmHeaderInteractionStrategy?: (number|null)
			static encode(m: waproto.ContextInfo.ExternalAdReplyInfo.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.ExternalAdReplyInfo & waproto.ContextInfo.ExternalAdReplyInfo.$Shape
		}
		namespace ExternalAdReplyInfo {
			interface $Properties {
				title?: (string|null)
				body?: (string|null)
				mediaType?: (waproto.ContextInfo.ExternalAdReplyInfo.MediaType|null)
				thumbnailUrl?: (string|null)
				mediaUrl?: (string|null)
				thumbnail?: (Uint8Array|null)
				sourceType?: (string|null)
				sourceId?: (string|null)
				sourceUrl?: (string|null)
				containsAutoReply?: (boolean|null)
				renderLargerThumbnail?: (boolean|null)
				showAdAttribution?: (boolean|null)
				ctwaClid?: (string|null)
				ref?: (string|null)
				clickToWhatsappCall?: (boolean|null)
				adContextPreviewDismissed?: (boolean|null)
				sourceApp?: (string|null)
				automatedGreetingMessageShown?: (boolean|null)
				greetingMessageBody?: (string|null)
				ctaPayload?: (string|null)
				disableNudge?: (boolean|null)
				originalImageUrl?: (string|null)
				automatedGreetingMessageCtaType?: (string|null)
				wtwaAdFormat?: (boolean|null)
				adType?: (waproto.ContextInfo.ExternalAdReplyInfo.AdType|null)
				wtwaWebsiteUrl?: (string|null)
				adPreviewUrl?: (string|null)
				containsCtwaFlowsAutoReply?: (boolean|null)
				agmThumbnailStrategy?: (number|null)
				agmTitleStrategy?: (number|null)
				agmSubtitleStrategy?: (number|null)
				agmHeaderInteractionStrategy?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ContextInfo.ExternalAdReplyInfo.$Properties
			enum AdType {
				CTWA = 0,
				CAWC = 1
			}
			enum MediaType {
				NONE = 0,
				IMAGE = 1,
				VIDEO = 2
			}
		}
		interface IAdReplyInfo extends waproto.ContextInfo.AdReplyInfo.$Properties {
		}
		class AdReplyInfo {
			constructor(p?: waproto.ContextInfo.AdReplyInfo.$Properties)
			$unknowns?: Uint8Array[]
			advertiserName?: (string|null)
			mediaType?: (waproto.ContextInfo.AdReplyInfo.MediaType|null)
			jpegThumbnail?: (Uint8Array|null)
			caption?: (string|null)
			static encode(m: waproto.ContextInfo.AdReplyInfo.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.AdReplyInfo & waproto.ContextInfo.AdReplyInfo.$Shape
		}
		namespace AdReplyInfo {
			interface $Properties {
				advertiserName?: (string|null)
				mediaType?: (waproto.ContextInfo.AdReplyInfo.MediaType|null)
				jpegThumbnail?: (Uint8Array|null)
				caption?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ContextInfo.AdReplyInfo.$Properties
			enum MediaType {
				NONE = 0,
				IMAGE = 1,
				VIDEO = 2
			}
		}
		interface IBusinessMessageForwardInfo extends waproto.ContextInfo.BusinessMessageForwardInfo.$Properties {
		}
		class BusinessMessageForwardInfo {
			constructor(p?: waproto.ContextInfo.BusinessMessageForwardInfo.$Properties)
			$unknowns?: Uint8Array[]
			businessOwnerJid?: (string|null)
			static encode(m: waproto.ContextInfo.BusinessMessageForwardInfo.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.BusinessMessageForwardInfo & waproto.ContextInfo.BusinessMessageForwardInfo.$Shape
		}
		namespace BusinessMessageForwardInfo {
			interface $Properties {
				businessOwnerJid?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.ContextInfo.BusinessMessageForwardInfo.$Properties
		}
	}
	interface IConversation extends waproto.Conversation.$Properties {
	}
	class Conversation {
		constructor(p?: waproto.Conversation.$Properties)
		$unknowns?: Uint8Array[]
		id?: (string|null)
		messages: waproto.HistorySyncMsg.$Properties[]
		newJid?: (string|null)
		oldJid?: (string|null)
		lastMsgTimestamp?: (number|Long|null)
		unreadCount?: (number|null)
		readOnly?: (boolean|null)
		endOfHistoryTransfer?: (boolean|null)
		ephemeralExpiration?: (number|null)
		ephemeralSettingTimestamp?: (number|Long|null)
		endOfHistoryTransferType?: (waproto.Conversation.EndOfHistoryTransferType|null)
		conversationTimestamp?: (number|Long|null)
		name?: (string|null)
		pHash?: (string|null)
		notSpam?: (boolean|null)
		archived?: (boolean|null)
		disappearingMode?: (waproto.DisappearingMode.$Properties|null)
		unreadMentionCount?: (number|null)
		markedAsUnread?: (boolean|null)
		participant: waproto.GroupParticipant.$Properties[]
		tcToken?: (Uint8Array|null)
		tcTokenTimestamp?: (number|Long|null)
		contactPrimaryIdentityKey?: (Uint8Array|null)
		pinned?: (number|null)
		muteEndTime?: (number|Long|null)
		wallpaper?: (waproto.WallpaperSettings.$Properties|null)
		mediaVisibility?: (waproto.MediaVisibility|null)
		tcTokenSenderTimestamp?: (number|Long|null)
		suspended?: (boolean|null)
		terminated?: (boolean|null)
		createdAt?: (number|Long|null)
		createdBy?: (string|null)
		description?: (string|null)
		support?: (boolean|null)
		isParentGroup?: (boolean|null)
		isDefaultSubgroup?: (boolean|null)
		parentGroupId?: (string|null)
		displayName?: (string|null)
		pnJid?: (string|null)
		shareOwnPn?: (boolean|null)
		pnhDuplicateLidThread?: (boolean|null)
		lidJid?: (string|null)
		username?: (string|null)
		lidOriginType?: (string|null)
		commentsCount?: (number|null)
		locked?: (boolean|null)
		systemMessageToInsert?: (waproto.PrivacySystemMessage|null)
		capiCreatedGroup?: (boolean|null)
		accountLid?: (string|null)
		limitSharing?: (boolean|null)
		limitSharingSettingTimestamp?: (number|Long|null)
		limitSharingTrigger?: (waproto.LimitSharing.Trigger|null)
		limitSharingInitiatedByMe?: (boolean|null)
		maibaAiThreadEnabled?: (boolean|null)
		isMarketingMessageThread?: (boolean|null)
		isSenderNewAccount?: (boolean|null)
		afterReadDuration?: (number|null)
		isSenderSuspicious?: (boolean|null)
		appealStatus?: (waproto.Conversation.GroupAppealStatus|null)
		appealUpdateTime?: (number|Long|null)
		authAgentParentCompanyName?: (string|null)
		authAgentObaPhoneNumber?: (string|null)
		identityVerification?: (waproto.IdentityVerificationState.$Properties|null)
		static encode(m: waproto.Conversation.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Conversation & waproto.Conversation.$Shape
	}
	namespace Conversation {
		interface $Properties {
			id?: (string|null)
			messages?: (waproto.HistorySyncMsg.$Properties[]|null)
			newJid?: (string|null)
			oldJid?: (string|null)
			lastMsgTimestamp?: (number|Long|null)
			unreadCount?: (number|null)
			readOnly?: (boolean|null)
			endOfHistoryTransfer?: (boolean|null)
			ephemeralExpiration?: (number|null)
			ephemeralSettingTimestamp?: (number|Long|null)
			endOfHistoryTransferType?: (waproto.Conversation.EndOfHistoryTransferType|null)
			conversationTimestamp?: (number|Long|null)
			name?: (string|null)
			pHash?: (string|null)
			notSpam?: (boolean|null)
			archived?: (boolean|null)
			disappearingMode?: (waproto.DisappearingMode.$Properties|null)
			unreadMentionCount?: (number|null)
			markedAsUnread?: (boolean|null)
			participant?: (waproto.GroupParticipant.$Properties[]|null)
			tcToken?: (Uint8Array|null)
			tcTokenTimestamp?: (number|Long|null)
			contactPrimaryIdentityKey?: (Uint8Array|null)
			pinned?: (number|null)
			muteEndTime?: (number|Long|null)
			wallpaper?: (waproto.WallpaperSettings.$Properties|null)
			mediaVisibility?: (waproto.MediaVisibility|null)
			tcTokenSenderTimestamp?: (number|Long|null)
			suspended?: (boolean|null)
			terminated?: (boolean|null)
			createdAt?: (number|Long|null)
			createdBy?: (string|null)
			description?: (string|null)
			support?: (boolean|null)
			isParentGroup?: (boolean|null)
			isDefaultSubgroup?: (boolean|null)
			parentGroupId?: (string|null)
			displayName?: (string|null)
			pnJid?: (string|null)
			shareOwnPn?: (boolean|null)
			pnhDuplicateLidThread?: (boolean|null)
			lidJid?: (string|null)
			username?: (string|null)
			lidOriginType?: (string|null)
			commentsCount?: (number|null)
			locked?: (boolean|null)
			systemMessageToInsert?: (waproto.PrivacySystemMessage|null)
			capiCreatedGroup?: (boolean|null)
			accountLid?: (string|null)
			limitSharing?: (boolean|null)
			limitSharingSettingTimestamp?: (number|Long|null)
			limitSharingTrigger?: (waproto.LimitSharing.Trigger|null)
			limitSharingInitiatedByMe?: (boolean|null)
			maibaAiThreadEnabled?: (boolean|null)
			isMarketingMessageThread?: (boolean|null)
			isSenderNewAccount?: (boolean|null)
			afterReadDuration?: (number|null)
			isSenderSuspicious?: (boolean|null)
			appealStatus?: (waproto.Conversation.GroupAppealStatus|null)
			appealUpdateTime?: (number|Long|null)
			authAgentParentCompanyName?: (string|null)
			authAgentObaPhoneNumber?: (string|null)
			identityVerification?: (waproto.IdentityVerificationState.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Conversation.$Properties
		enum GroupAppealStatus {
			NO_APPEAL = 0,
			APPEAL_IN_REVIEW = 1,
			APPEAL_APPROVED = 2,
			APPEAL_REJECTED = 3
		}
		enum EndOfHistoryTransferType {
			COMPLETE_BUT_MORE_MESSAGES_REMAIN_ON_PRIMARY = 0,
			COMPLETE_AND_NO_MORE_MESSAGE_REMAIN_ON_PRIMARY = 1,
			COMPLETE_ON_DEMAND_SYNC_BUT_MORE_MSG_REMAIN_ON_PRIMARY = 2,
			COMPLETE_ON_DEMAND_SYNC_WITH_MORE_MSG_ON_PRIMARY_BUT_NO_ACCESS = 3
		}
	}
	interface ICreateBackupInput extends waproto.CreateBackupInput.$Properties {
	}
	class CreateBackupInput {
		constructor(p?: waproto.CreateBackupInput.$Properties)
		$unknowns?: Uint8Array[]
		recoveryCode?: (string|null)
		userId?: (number|Long|null)
		static encode(m: waproto.CreateBackupInput.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.CreateBackupInput & waproto.CreateBackupInput.$Shape
	}
	namespace CreateBackupInput {
		interface $Properties {
			recoveryCode?: (string|null)
			userId?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.CreateBackupInput.$Properties
	}
	interface ICreateBackupOutput extends waproto.CreateBackupOutput.$Properties {
	}
	class CreateBackupOutput {
		constructor(p?: waproto.CreateBackupOutput.$Properties)
		$unknowns?: Uint8Array[]
		device?: (waproto.DeviceOutput.$Properties|null)
		virtualDevice?: (waproto.VirtualDeviceOutput.$Properties|null)
		epoch0?: (waproto.Epoch0Output.$Properties|null)
		mailboxRootKey?: (Uint8Array|null)
		error?: (string|null)
		static encode(m: waproto.CreateBackupOutput.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.CreateBackupOutput & waproto.CreateBackupOutput.$Shape
	}
	namespace CreateBackupOutput {
		interface $Properties {
			device?: (waproto.DeviceOutput.$Properties|null)
			virtualDevice?: (waproto.VirtualDeviceOutput.$Properties|null)
			epoch0?: (waproto.Epoch0Output.$Properties|null)
			mailboxRootKey?: (Uint8Array|null)
			error?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.CreateBackupOutput.$Properties
	}
	interface IDecryptMessageInput extends waproto.DecryptMessageInput.$Properties {
	}
	class DecryptMessageInput {
		constructor(p?: waproto.DecryptMessageInput.$Properties)
		$unknowns?: Uint8Array[]
		epochRootKey?: (Uint8Array|null)
		epochAnonId?: (Uint8Array|null)
		threadId?: (string|null)
		encryptionVersion?: (number|null)
		ciphertext?: (Uint8Array|null)
		static encode(m: waproto.DecryptMessageInput.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.DecryptMessageInput & waproto.DecryptMessageInput.$Shape
	}
	namespace DecryptMessageInput {
		interface $Properties {
			epochRootKey?: (Uint8Array|null)
			epochAnonId?: (Uint8Array|null)
			threadId?: (string|null)
			encryptionVersion?: (number|null)
			ciphertext?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.DecryptMessageInput.$Properties
	}
	interface IDecryptMessageOutput extends waproto.DecryptMessageOutput.$Properties {
	}
	class DecryptMessageOutput {
		constructor(p?: waproto.DecryptMessageOutput.$Properties)
		$unknowns?: Uint8Array[]
		plaintextPayload?: (Uint8Array|null)
		error?: (string|null)
		static encode(m: waproto.DecryptMessageOutput.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.DecryptMessageOutput & waproto.DecryptMessageOutput.$Shape
	}
	namespace DecryptMessageOutput {
		interface $Properties {
			plaintextPayload?: (Uint8Array|null)
			error?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.DecryptMessageOutput.$Properties
	}
	interface IDeviceCapabilities extends waproto.DeviceCapabilities.$Properties {
	}
	class DeviceCapabilities {
		constructor(p?: waproto.DeviceCapabilities.$Properties)
		$unknowns?: Uint8Array[]
		chatLockSupportLevel?: (waproto.DeviceCapabilities.ChatLockSupportLevel|null)
		lidMigration?: (waproto.DeviceCapabilities.LIDMigration.$Properties|null)
		businessBroadcast?: (waproto.DeviceCapabilities.BusinessBroadcast.$Properties|null)
		userHasAvatar?: (waproto.DeviceCapabilities.UserHasAvatar.$Properties|null)
		memberNameTagPrimarySupport?: (waproto.DeviceCapabilities.MemberNameTagPrimarySupport|null)
		aiThread?: (waproto.DeviceCapabilities.AiThread.$Properties|null)
		aiFbidMigration?: (waproto.DeviceCapabilities.AiFbidMigration.$Properties|null)
		static encode(m: waproto.DeviceCapabilities.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceCapabilities & waproto.DeviceCapabilities.$Shape
	}
	namespace DeviceCapabilities {
		interface $Properties {
			chatLockSupportLevel?: (waproto.DeviceCapabilities.ChatLockSupportLevel|null)
			lidMigration?: (waproto.DeviceCapabilities.LIDMigration.$Properties|null)
			businessBroadcast?: (waproto.DeviceCapabilities.BusinessBroadcast.$Properties|null)
			userHasAvatar?: (waproto.DeviceCapabilities.UserHasAvatar.$Properties|null)
			memberNameTagPrimarySupport?: (waproto.DeviceCapabilities.MemberNameTagPrimarySupport|null)
			aiThread?: (waproto.DeviceCapabilities.AiThread.$Properties|null)
			aiFbidMigration?: (waproto.DeviceCapabilities.AiFbidMigration.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.DeviceCapabilities.$Properties
		enum MemberNameTagPrimarySupport {
			DISABLED = 0,
			RECEIVER_ENABLED = 1,
			SENDER_ENABLED = 2
		}
		enum ChatLockSupportLevel {
			NONE = 0,
			MINIMAL = 1,
			FULL = 2
		}
		interface IAiFbidMigration extends waproto.DeviceCapabilities.AiFbidMigration.$Properties {
		}
		class AiFbidMigration {
			constructor(p?: waproto.DeviceCapabilities.AiFbidMigration.$Properties)
			$unknowns?: Uint8Array[]
			chatDbMigrationTimestamp?: (number|Long|null)
			static encode(m: waproto.DeviceCapabilities.AiFbidMigration.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceCapabilities.AiFbidMigration & waproto.DeviceCapabilities.AiFbidMigration.$Shape
		}
		namespace AiFbidMigration {
			interface $Properties {
				chatDbMigrationTimestamp?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.DeviceCapabilities.AiFbidMigration.$Properties
		}
		interface IAiThread extends waproto.DeviceCapabilities.AiThread.$Properties {
		}
		class AiThread {
			constructor(p?: waproto.DeviceCapabilities.AiThread.$Properties)
			$unknowns?: Uint8Array[]
			supportLevel?: (waproto.DeviceCapabilities.AiThread.SupportLevel|null)
			static encode(m: waproto.DeviceCapabilities.AiThread.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceCapabilities.AiThread & waproto.DeviceCapabilities.AiThread.$Shape
		}
		namespace AiThread {
			interface $Properties {
				supportLevel?: (waproto.DeviceCapabilities.AiThread.SupportLevel|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.DeviceCapabilities.AiThread.$Properties
			enum SupportLevel {
				NONE = 0,
				INFRA = 1,
				FULL = 2
			}
		}
		interface IUserHasAvatar extends waproto.DeviceCapabilities.UserHasAvatar.$Properties {
		}
		class UserHasAvatar {
			constructor(p?: waproto.DeviceCapabilities.UserHasAvatar.$Properties)
			$unknowns?: Uint8Array[]
			userHasAvatar?: (boolean|null)
			static encode(m: waproto.DeviceCapabilities.UserHasAvatar.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceCapabilities.UserHasAvatar & waproto.DeviceCapabilities.UserHasAvatar.$Shape
		}
		namespace UserHasAvatar {
			interface $Properties {
				userHasAvatar?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.DeviceCapabilities.UserHasAvatar.$Properties
		}
		interface IBusinessBroadcast extends waproto.DeviceCapabilities.BusinessBroadcast.$Properties {
		}
		class BusinessBroadcast {
			constructor(p?: waproto.DeviceCapabilities.BusinessBroadcast.$Properties)
			$unknowns?: Uint8Array[]
			importListEnabled?: (boolean|null)
			companionSupportEnabled?: (boolean|null)
			campaignSyncEnabled?: (boolean|null)
			insightsSyncEnabled?: (boolean|null)
			recipientLimit?: (number|null)
			static encode(m: waproto.DeviceCapabilities.BusinessBroadcast.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceCapabilities.BusinessBroadcast & waproto.DeviceCapabilities.BusinessBroadcast.$Shape
		}
		namespace BusinessBroadcast {
			interface $Properties {
				importListEnabled?: (boolean|null)
				companionSupportEnabled?: (boolean|null)
				campaignSyncEnabled?: (boolean|null)
				insightsSyncEnabled?: (boolean|null)
				recipientLimit?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.DeviceCapabilities.BusinessBroadcast.$Properties
		}
		interface ILIDMigration extends waproto.DeviceCapabilities.LIDMigration.$Properties {
		}
		class LIDMigration {
			constructor(p?: waproto.DeviceCapabilities.LIDMigration.$Properties)
			$unknowns?: Uint8Array[]
			chatDbMigrationTimestamp?: (number|Long|null)
			static encode(m: waproto.DeviceCapabilities.LIDMigration.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceCapabilities.LIDMigration & waproto.DeviceCapabilities.LIDMigration.$Shape
		}
		namespace LIDMigration {
			interface $Properties {
				chatDbMigrationTimestamp?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.DeviceCapabilities.LIDMigration.$Properties
		}
	}
	interface IDeviceConsistencyCodeMessage extends waproto.DeviceConsistencyCodeMessage.$Properties {
	}
	class DeviceConsistencyCodeMessage {
		constructor(p?: waproto.DeviceConsistencyCodeMessage.$Properties)
		$unknowns?: Uint8Array[]
		generation?: (number|null)
		signature?: (Uint8Array|null)
		static encode(m: waproto.DeviceConsistencyCodeMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceConsistencyCodeMessage & waproto.DeviceConsistencyCodeMessage.$Shape
	}
	namespace DeviceConsistencyCodeMessage {
		interface $Properties {
			generation?: (number|null)
			signature?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.DeviceConsistencyCodeMessage.$Properties
	}
	interface IDeviceListMetadata extends waproto.DeviceListMetadata.$Properties {
	}
	class DeviceListMetadata {
		constructor(p?: waproto.DeviceListMetadata.$Properties)
		$unknowns?: Uint8Array[]
		senderKeyHash?: (Uint8Array|null)
		senderTimestamp?: (number|Long|null)
		senderKeyIndexes: number[]
		senderAccountType?: (waproto.ADVEncryptionType|null)
		receiverAccountType?: (waproto.ADVEncryptionType|null)
		recipientKeyHash?: (Uint8Array|null)
		recipientTimestamp?: (number|Long|null)
		recipientKeyIndexes: number[]
		static encode(m: waproto.DeviceListMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceListMetadata & waproto.DeviceListMetadata.$Shape
	}
	namespace DeviceListMetadata {
		interface $Properties {
			senderKeyHash?: (Uint8Array|null)
			senderTimestamp?: (number|Long|null)
			senderKeyIndexes?: (number[]|null)
			senderAccountType?: (waproto.ADVEncryptionType|null)
			receiverAccountType?: (waproto.ADVEncryptionType|null)
			recipientKeyHash?: (Uint8Array|null)
			recipientTimestamp?: (number|Long|null)
			recipientKeyIndexes?: (number[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.DeviceListMetadata.$Properties
	}
	interface IDeviceOutput extends waproto.DeviceOutput.$Properties {
	}
	class DeviceOutput {
		constructor(p?: waproto.DeviceOutput.$Properties)
		$unknowns?: Uint8Array[]
		publicKey?: (Uint8Array|null)
		epochAuthPublicKey?: (Uint8Array|null)
		epochAuthPublicKeySig?: (Uint8Array|null)
		epochStoragePublicKey?: (Uint8Array|null)
		epochStoragePublicKeySig?: (Uint8Array|null)
		supportedEncryptionVersions: number[]
		encryptionVersionSignature?: (Uint8Array|null)
		clientVersion?: (number|null)
		ocmfClientState?: (Uint8Array|null)
		static encode(m: waproto.DeviceOutput.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceOutput & waproto.DeviceOutput.$Shape
	}
	namespace DeviceOutput {
		interface $Properties {
			publicKey?: (Uint8Array|null)
			epochAuthPublicKey?: (Uint8Array|null)
			epochAuthPublicKeySig?: (Uint8Array|null)
			epochStoragePublicKey?: (Uint8Array|null)
			epochStoragePublicKeySig?: (Uint8Array|null)
			supportedEncryptionVersions?: (number[]|null)
			encryptionVersionSignature?: (Uint8Array|null)
			clientVersion?: (number|null)
			ocmfClientState?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.DeviceOutput.$Properties
	}
	interface IDeviceProps extends waproto.DeviceProps.$Properties {
	}
	class DeviceProps {
		constructor(p?: waproto.DeviceProps.$Properties)
		$unknowns?: Uint8Array[]
		os?: (string|null)
		version?: (waproto.DeviceProps.AppVersion.$Properties|null)
		platformType?: (waproto.DeviceProps.PlatformType|null)
		requireFullSync?: (boolean|null)
		historySyncConfig?: (waproto.DeviceProps.HistorySyncConfig.$Properties|null)
		static encode(m: waproto.DeviceProps.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceProps & waproto.DeviceProps.$Shape
	}
	namespace DeviceProps {
		interface $Properties {
			os?: (string|null)
			version?: (waproto.DeviceProps.AppVersion.$Properties|null)
			platformType?: (waproto.DeviceProps.PlatformType|null)
			requireFullSync?: (boolean|null)
			historySyncConfig?: (waproto.DeviceProps.HistorySyncConfig.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.DeviceProps.$Properties
		enum PlatformType {
			UNKNOWN = 0,
			CHROME = 1,
			FIREFOX = 2,
			IE = 3,
			OPERA = 4,
			SAFARI = 5,
			EDGE = 6,
			DESKTOP = 7,
			IPAD = 8,
			ANDROID_TABLET = 9,
			OHANA = 10,
			ALOHA = 11,
			CATALINA = 12,
			TCL_TV = 13,
			IOS_PHONE = 14,
			IOS_CATALYST = 15,
			ANDROID_PHONE = 16,
			ANDROID_AMBIGUOUS = 17,
			WEAR_OS = 18,
			AR_WRIST = 19,
			AR_DEVICE = 20,
			UWP = 21,
			VR = 22,
			CLOUD_API = 23,
			SMARTGLASSES = 24
		}
		interface IHistorySyncConfig extends waproto.DeviceProps.HistorySyncConfig.$Properties {
		}
		class HistorySyncConfig {
			constructor(p?: waproto.DeviceProps.HistorySyncConfig.$Properties)
			$unknowns?: Uint8Array[]
			fullSyncDaysLimit?: (number|null)
			fullSyncSizeMbLimit?: (number|null)
			storageQuotaMb?: (number|null)
			inlineInitialPayloadInE2EeMsg?: (boolean|null)
			recentSyncDaysLimit?: (number|null)
			supportCallLogHistory?: (boolean|null)
			supportBotUserAgentChatHistory?: (boolean|null)
			supportCagReactionsAndPolls?: (boolean|null)
			supportBizHostedMsg?: (boolean|null)
			supportRecentSyncChunkMessageCountTuning?: (boolean|null)
			supportHostedGroupMsg?: (boolean|null)
			supportFbidBotChatHistory?: (boolean|null)
			supportAddOnHistorySyncMigration?: (boolean|null)
			supportMessageAssociation?: (boolean|null)
			supportGroupHistory?: (boolean|null)
			onDemandReady?: (boolean|null)
			supportGuestChat?: (boolean|null)
			completeOnDemandReady?: (boolean|null)
			thumbnailSyncDaysLimit?: (number|null)
			initialSyncMaxMessagesPerChat?: (number|null)
			supportManusHistory?: (boolean|null)
			supportHatchHistory?: (boolean|null)
			supportedBotChannelFbids: string[]
			supportInlineContacts?: (boolean|null)
			supportNewsletter?: (boolean|null)
			static encode(m: waproto.DeviceProps.HistorySyncConfig.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceProps.HistorySyncConfig & waproto.DeviceProps.HistorySyncConfig.$Shape
		}
		namespace HistorySyncConfig {
			interface $Properties {
				fullSyncDaysLimit?: (number|null)
				fullSyncSizeMbLimit?: (number|null)
				storageQuotaMb?: (number|null)
				inlineInitialPayloadInE2EeMsg?: (boolean|null)
				recentSyncDaysLimit?: (number|null)
				supportCallLogHistory?: (boolean|null)
				supportBotUserAgentChatHistory?: (boolean|null)
				supportCagReactionsAndPolls?: (boolean|null)
				supportBizHostedMsg?: (boolean|null)
				supportRecentSyncChunkMessageCountTuning?: (boolean|null)
				supportHostedGroupMsg?: (boolean|null)
				supportFbidBotChatHistory?: (boolean|null)
				supportAddOnHistorySyncMigration?: (boolean|null)
				supportMessageAssociation?: (boolean|null)
				supportGroupHistory?: (boolean|null)
				onDemandReady?: (boolean|null)
				supportGuestChat?: (boolean|null)
				completeOnDemandReady?: (boolean|null)
				thumbnailSyncDaysLimit?: (number|null)
				initialSyncMaxMessagesPerChat?: (number|null)
				supportManusHistory?: (boolean|null)
				supportHatchHistory?: (boolean|null)
				supportedBotChannelFbids?: (string[]|null)
				supportInlineContacts?: (boolean|null)
				supportNewsletter?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.DeviceProps.HistorySyncConfig.$Properties
		}
		interface IAppVersion extends waproto.DeviceProps.AppVersion.$Properties {
		}
		class AppVersion {
			constructor(p?: waproto.DeviceProps.AppVersion.$Properties)
			$unknowns?: Uint8Array[]
			primary?: (number|null)
			secondary?: (number|null)
			tertiary?: (number|null)
			quaternary?: (number|null)
			quinary?: (number|null)
			static encode(m: waproto.DeviceProps.AppVersion.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceProps.AppVersion & waproto.DeviceProps.AppVersion.$Shape
		}
		namespace AppVersion {
			interface $Properties {
				primary?: (number|null)
				secondary?: (number|null)
				tertiary?: (number|null)
				quaternary?: (number|null)
				quinary?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.DeviceProps.AppVersion.$Properties
		}
	}
	interface IDisappearingMode extends waproto.DisappearingMode.$Properties {
	}
	class DisappearingMode {
		constructor(p?: waproto.DisappearingMode.$Properties)
		$unknowns?: Uint8Array[]
		initiator?: (waproto.DisappearingMode.Initiator|null)
		trigger?: (waproto.DisappearingMode.Trigger|null)
		initiatorDeviceJid?: (string|null)
		initiatedByMe?: (boolean|null)
		static encode(m: waproto.DisappearingMode.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.DisappearingMode & waproto.DisappearingMode.$Shape
	}
	namespace DisappearingMode {
		interface $Properties {
			initiator?: (waproto.DisappearingMode.Initiator|null)
			trigger?: (waproto.DisappearingMode.Trigger|null)
			initiatorDeviceJid?: (string|null)
			initiatedByMe?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.DisappearingMode.$Properties
		enum Trigger {
			UNKNOWN = 0,
			CHAT_SETTING = 1,
			ACCOUNT_SETTING = 2,
			BULK_CHANGE = 3,
			BIZ_SUPPORTS_FB_HOSTING = 4,
			UNKNOWN_GROUPS = 5
		}
		enum Initiator {
			CHANGED_IN_CHAT = 0,
			INITIATED_BY_ME = 1,
			INITIATED_BY_OTHER = 2,
			BIZ_UPGRADE_FB_HOSTING = 3
		}
	}
	interface IEmbeddedContent extends waproto.EmbeddedContent.$Properties {
	}
	class EmbeddedContent {
		constructor(p?: waproto.EmbeddedContent.$Properties)
		$unknowns?: Uint8Array[]
		embeddedMessage?: (waproto.EmbeddedMessage.$Properties|null)
		embeddedMusic?: (waproto.EmbeddedMusic.$Properties|null)
		static encode(m: waproto.EmbeddedContent.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.EmbeddedContent & waproto.EmbeddedContent.$Shape
	}
	namespace EmbeddedContent {
		interface $Properties {
			embeddedMessage?: (waproto.EmbeddedMessage.$Properties|null)
			embeddedMusic?: (waproto.EmbeddedMusic.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.EmbeddedContent.$Properties
	}
	interface IEmbeddedMessage extends waproto.EmbeddedMessage.$Properties {
	}
	class EmbeddedMessage {
		constructor(p?: waproto.EmbeddedMessage.$Properties)
		$unknowns?: Uint8Array[]
		stanzaId?: (string|null)
		message?: (waproto.Message.$Properties|null)
		static encode(m: waproto.EmbeddedMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.EmbeddedMessage & waproto.EmbeddedMessage.$Shape
	}
	namespace EmbeddedMessage {
		interface $Properties {
			stanzaId?: (string|null)
			message?: (waproto.Message.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.EmbeddedMessage.$Properties
	}
	interface IEmbeddedMusic extends waproto.EmbeddedMusic.$Properties {
	}
	class EmbeddedMusic {
		constructor(p?: waproto.EmbeddedMusic.$Properties)
		$unknowns?: Uint8Array[]
		musicContentMediaId?: (string|null)
		songId?: (string|null)
		author?: (string|null)
		title?: (string|null)
		artworkDirectPath?: (string|null)
		artworkSha256?: (Uint8Array|null)
		artworkEncSha256?: (Uint8Array|null)
		artistAttribution?: (string|null)
		countryBlocklist?: (Uint8Array|null)
		isExplicit?: (boolean|null)
		artworkMediaKey?: (Uint8Array|null)
		musicSongStartTimeInMs?: (number|Long|null)
		derivedContentStartTimeInMs?: (number|Long|null)
		overlapDurationInMs?: (number|Long|null)
		static encode(m: waproto.EmbeddedMusic.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.EmbeddedMusic & waproto.EmbeddedMusic.$Shape
	}
	namespace EmbeddedMusic {
		interface $Properties {
			musicContentMediaId?: (string|null)
			songId?: (string|null)
			author?: (string|null)
			title?: (string|null)
			artworkDirectPath?: (string|null)
			artworkSha256?: (Uint8Array|null)
			artworkEncSha256?: (Uint8Array|null)
			artistAttribution?: (string|null)
			countryBlocklist?: (Uint8Array|null)
			isExplicit?: (boolean|null)
			artworkMediaKey?: (Uint8Array|null)
			musicSongStartTimeInMs?: (number|Long|null)
			derivedContentStartTimeInMs?: (number|Long|null)
			overlapDurationInMs?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.EmbeddedMusic.$Properties
	}
	interface IEncryptMessageInput extends waproto.EncryptMessageInput.$Properties {
	}
	class EncryptMessageInput {
		constructor(p?: waproto.EncryptMessageInput.$Properties)
		$unknowns?: Uint8Array[]
		epochRootKey?: (Uint8Array|null)
		mailboxRootKey?: (Uint8Array|null)
		orfClientState?: (Uint8Array|null)
		epochAnonId?: (Uint8Array|null)
		epochId?: (number|Long|null)
		threadId?: (string|null)
		waCanonicalUserFbid?: (number|Long|null)
		timestampMs?: (number|Long|null)
		backupId?: (number|Long|null)
		plaintextPayload?: (Uint8Array|null)
		stanzaId?: (string|null)
		static encode(m: waproto.EncryptMessageInput.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.EncryptMessageInput & waproto.EncryptMessageInput.$Shape
	}
	namespace EncryptMessageInput {
		interface $Properties {
			epochRootKey?: (Uint8Array|null)
			mailboxRootKey?: (Uint8Array|null)
			orfClientState?: (Uint8Array|null)
			epochAnonId?: (Uint8Array|null)
			epochId?: (number|Long|null)
			threadId?: (string|null)
			waCanonicalUserFbid?: (number|Long|null)
			timestampMs?: (number|Long|null)
			backupId?: (number|Long|null)
			plaintextPayload?: (Uint8Array|null)
			stanzaId?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.EncryptMessageInput.$Properties
	}
	interface IEncryptMessageOutput extends waproto.EncryptMessageOutput.$Properties {
	}
	class EncryptMessageOutput {
		constructor(p?: waproto.EncryptMessageOutput.$Properties)
		$unknowns?: Uint8Array[]
		encryptedProtobuf?: (Uint8Array|null)
		orfThreadId?: (Uint8Array|null)
		valueSecretRef?: (string|null)
		offlineThreadingId?: (number|Long|null)
		timestampMs?: (number|Long|null)
		messageKey?: (Uint8Array|null)
		error?: (string|null)
		static encode(m: waproto.EncryptMessageOutput.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.EncryptMessageOutput & waproto.EncryptMessageOutput.$Shape
	}
	namespace EncryptMessageOutput {
		interface $Properties {
			encryptedProtobuf?: (Uint8Array|null)
			orfThreadId?: (Uint8Array|null)
			valueSecretRef?: (string|null)
			offlineThreadingId?: (number|Long|null)
			timestampMs?: (number|Long|null)
			messageKey?: (Uint8Array|null)
			error?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.EncryptMessageOutput.$Properties
	}
	interface IEncryptedPairingRequest extends waproto.EncryptedPairingRequest.$Properties {
	}
	class EncryptedPairingRequest {
		constructor(p?: waproto.EncryptedPairingRequest.$Properties)
		$unknowns?: Uint8Array[]
		encryptedPayload?: (Uint8Array|null)
		iv?: (Uint8Array|null)
		static encode(m: waproto.EncryptedPairingRequest.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.EncryptedPairingRequest & waproto.EncryptedPairingRequest.$Shape
	}
	namespace EncryptedPairingRequest {
		interface $Properties {
			encryptedPayload?: (Uint8Array|null)
			iv?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.EncryptedPairingRequest.$Properties
	}
	interface IEncryptedSecretValuesOutput extends waproto.EncryptedSecretValuesOutput.$Properties {
	}
	class EncryptedSecretValuesOutput {
		constructor(p?: waproto.EncryptedSecretValuesOutput.$Properties)
		$unknowns?: Uint8Array[]
		encryptedDevicePrivateKey?: (Uint8Array|null)
		encryptedObliviousValidationTokenBlob?: (Uint8Array|null)
		encryptedEpochStoragePrivateKey?: (Uint8Array|null)
		encryptedOcmfClientState?: (Uint8Array|null)
		encryptedOrfClientStateV2?: (Uint8Array|null)
		encryptedMailboxRootKeyBlob?: (Uint8Array|null)
		encryptedEpochAnonId?: (Uint8Array|null)
		encryptedEpochRootKey?: (Uint8Array|null)
		static encode(m: waproto.EncryptedSecretValuesOutput.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.EncryptedSecretValuesOutput & waproto.EncryptedSecretValuesOutput.$Shape
	}
	namespace EncryptedSecretValuesOutput {
		interface $Properties {
			encryptedDevicePrivateKey?: (Uint8Array|null)
			encryptedObliviousValidationTokenBlob?: (Uint8Array|null)
			encryptedEpochStoragePrivateKey?: (Uint8Array|null)
			encryptedOcmfClientState?: (Uint8Array|null)
			encryptedOrfClientStateV2?: (Uint8Array|null)
			encryptedMailboxRootKeyBlob?: (Uint8Array|null)
			encryptedEpochAnonId?: (Uint8Array|null)
			encryptedEpochRootKey?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.EncryptedSecretValuesOutput.$Properties
	}
	interface IEphemeralSetting extends waproto.EphemeralSetting.$Properties {
	}
	class EphemeralSetting {
		constructor(p?: waproto.EphemeralSetting.$Properties)
		$unknowns?: Uint8Array[]
		duration?: (number|null)
		timestamp?: (number|Long|null)
		static encode(m: waproto.EphemeralSetting.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.EphemeralSetting & waproto.EphemeralSetting.$Shape
	}
	namespace EphemeralSetting {
		interface $Properties {
			duration?: (number|null)
			timestamp?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.EphemeralSetting.$Properties
	}
	interface IEpoch0Output extends waproto.Epoch0Output.$Properties {
	}
	class Epoch0Output {
		constructor(p?: waproto.Epoch0Output.$Properties)
		$unknowns?: Uint8Array[]
		epochFbid?: (number|Long|null)
		epochAnonId?: (Uint8Array|null)
		epochData?: (Uint8Array|null)
		wrappedRootKeyForSelf?: (Uint8Array|null)
		epochSignature?: (Uint8Array|null)
		epochRootKeyFingerprint?: (Uint8Array|null)
		epochRootKey?: (Uint8Array|null)
		static encode(m: waproto.Epoch0Output.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Epoch0Output & waproto.Epoch0Output.$Shape
	}
	namespace Epoch0Output {
		interface $Properties {
			epochFbid?: (number|Long|null)
			epochAnonId?: (Uint8Array|null)
			epochData?: (Uint8Array|null)
			wrappedRootKeyForSelf?: (Uint8Array|null)
			epochSignature?: (Uint8Array|null)
			epochRootKeyFingerprint?: (Uint8Array|null)
			epochRootKey?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Epoch0Output.$Properties
	}
	interface IEventAdditionalMetadata extends waproto.EventAdditionalMetadata.$Properties {
	}
	class EventAdditionalMetadata {
		constructor(p?: waproto.EventAdditionalMetadata.$Properties)
		$unknowns?: Uint8Array[]
		isStale?: (boolean|null)
		static encode(m: waproto.EventAdditionalMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.EventAdditionalMetadata & waproto.EventAdditionalMetadata.$Shape
	}
	namespace EventAdditionalMetadata {
		interface $Properties {
			isStale?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.EventAdditionalMetadata.$Properties
	}
	interface IEventResponse extends waproto.EventResponse.$Properties {
	}
	class EventResponse {
		constructor(p?: waproto.EventResponse.$Properties)
		$unknowns?: Uint8Array[]
		eventResponseMessageKey?: (waproto.MessageKey.$Properties|null)
		timestampMs?: (number|Long|null)
		eventResponseMessage?: (waproto.Message.EventResponseMessage.$Properties|null)
		unread?: (boolean|null)
		static encode(m: waproto.EventResponse.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.EventResponse & waproto.EventResponse.$Shape
	}
	namespace EventResponse {
		interface $Properties {
			eventResponseMessageKey?: (waproto.MessageKey.$Properties|null)
			timestampMs?: (number|Long|null)
			eventResponseMessage?: (waproto.Message.EventResponseMessage.$Properties|null)
			unread?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.EventResponse.$Properties
	}
	interface IExitCode extends waproto.ExitCode.$Properties {
	}
	class ExitCode {
		constructor(p?: waproto.ExitCode.$Properties)
		$unknowns?: Uint8Array[]
		code?: (number|Long|null)
		text?: (string|null)
		static encode(m: waproto.ExitCode.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ExitCode & waproto.ExitCode.$Shape
	}
	namespace ExitCode {
		interface $Properties {
			code?: (number|Long|null)
			text?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ExitCode.$Properties
	}
	interface IExternalBlobReference extends waproto.ExternalBlobReference.$Properties {
	}
	class ExternalBlobReference {
		constructor(p?: waproto.ExternalBlobReference.$Properties)
		$unknowns?: Uint8Array[]
		mediaKey?: (Uint8Array|null)
		directPath?: (string|null)
		handle?: (string|null)
		fileSizeBytes?: (number|Long|null)
		fileSha256?: (Uint8Array|null)
		fileEncSha256?: (Uint8Array|null)
		static encode(m: waproto.ExternalBlobReference.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ExternalBlobReference & waproto.ExternalBlobReference.$Shape
	}
	namespace ExternalBlobReference {
		interface $Properties {
			mediaKey?: (Uint8Array|null)
			directPath?: (string|null)
			handle?: (string|null)
			fileSizeBytes?: (number|Long|null)
			fileSha256?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ExternalBlobReference.$Properties
	}
	interface IField extends waproto.Field.$Properties {
	}
	class Field {
		constructor(p?: waproto.Field.$Properties)
		$unknowns?: Uint8Array[]
		minVersion?: (number|null)
		maxVersion?: (number|null)
		notReportableMinVersion?: (number|null)
		isMessage?: (boolean|null)
		subfield: { [k: string]: waproto.Field.$Properties }
		static encode(m: waproto.Field.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Field & waproto.Field.$Shape
	}
	namespace Field {
		interface $Properties {
			minVersion?: (number|null)
			maxVersion?: (number|null)
			notReportableMinVersion?: (number|null)
			isMessage?: (boolean|null)
			subfield?: ({ [k: string]: waproto.Field.$Properties }|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Field.$Properties
	}
	interface IFingerprintData extends waproto.FingerprintData.$Properties {
	}
	class FingerprintData {
		constructor(p?: waproto.FingerprintData.$Properties)
		$unknowns?: Uint8Array[]
		publicKey?: (Uint8Array|null)
		pnIdentifier?: (Uint8Array|null)
		lidIdentifier?: (Uint8Array|null)
		usernameIdentifier?: (Uint8Array|null)
		hostedState?: (waproto.HostedState|null)
		hashedPublicKey?: (Uint8Array|null)
		static encode(m: waproto.FingerprintData.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.FingerprintData & waproto.FingerprintData.$Shape
	}
	namespace FingerprintData {
		interface $Properties {
			publicKey?: (Uint8Array|null)
			pnIdentifier?: (Uint8Array|null)
			lidIdentifier?: (Uint8Array|null)
			usernameIdentifier?: (Uint8Array|null)
			hostedState?: (waproto.HostedState|null)
			hashedPublicKey?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.FingerprintData.$Properties
	}
	interface IForwardedAIBotMessageInfo extends waproto.ForwardedAIBotMessageInfo.$Properties {
	}
	class ForwardedAIBotMessageInfo {
		constructor(p?: waproto.ForwardedAIBotMessageInfo.$Properties)
		$unknowns?: Uint8Array[]
		botName?: (string|null)
		botJid?: (string|null)
		creatorName?: (string|null)
		static encode(m: waproto.ForwardedAIBotMessageInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ForwardedAIBotMessageInfo & waproto.ForwardedAIBotMessageInfo.$Shape
	}
	namespace ForwardedAIBotMessageInfo {
		interface $Properties {
			botName?: (string|null)
			botJid?: (string|null)
			creatorName?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ForwardedAIBotMessageInfo.$Properties
	}
	interface IGlobalSettings extends waproto.GlobalSettings.$Properties {
	}
	class GlobalSettings {
		constructor(p?: waproto.GlobalSettings.$Properties)
		$unknowns?: Uint8Array[]
		lightThemeWallpaper?: (waproto.WallpaperSettings.$Properties|null)
		mediaVisibility?: (waproto.MediaVisibility|null)
		darkThemeWallpaper?: (waproto.WallpaperSettings.$Properties|null)
		autoDownloadWiFi?: (waproto.AutoDownloadSettings.$Properties|null)
		autoDownloadCellular?: (waproto.AutoDownloadSettings.$Properties|null)
		autoDownloadRoaming?: (waproto.AutoDownloadSettings.$Properties|null)
		showIndividualNotificationsPreview?: (boolean|null)
		showGroupNotificationsPreview?: (boolean|null)
		disappearingModeDuration?: (number|null)
		disappearingModeTimestamp?: (number|Long|null)
		avatarUserSettings?: (waproto.AvatarUserSettings.$Properties|null)
		fontSize?: (number|null)
		securityNotifications?: (boolean|null)
		autoUnarchiveChats?: (boolean|null)
		videoQualityMode?: (number|null)
		photoQualityMode?: (number|null)
		individualNotificationSettings?: (waproto.NotificationSettings.$Properties|null)
		groupNotificationSettings?: (waproto.NotificationSettings.$Properties|null)
		chatLockSettings?: (waproto.ChatLockSettings.$Properties|null)
		chatDbLidMigrationTimestamp?: (number|Long|null)
		static encode(m: waproto.GlobalSettings.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.GlobalSettings & waproto.GlobalSettings.$Shape
	}
	namespace GlobalSettings {
		interface $Properties {
			lightThemeWallpaper?: (waproto.WallpaperSettings.$Properties|null)
			mediaVisibility?: (waproto.MediaVisibility|null)
			darkThemeWallpaper?: (waproto.WallpaperSettings.$Properties|null)
			autoDownloadWiFi?: (waproto.AutoDownloadSettings.$Properties|null)
			autoDownloadCellular?: (waproto.AutoDownloadSettings.$Properties|null)
			autoDownloadRoaming?: (waproto.AutoDownloadSettings.$Properties|null)
			showIndividualNotificationsPreview?: (boolean|null)
			showGroupNotificationsPreview?: (boolean|null)
			disappearingModeDuration?: (number|null)
			disappearingModeTimestamp?: (number|Long|null)
			avatarUserSettings?: (waproto.AvatarUserSettings.$Properties|null)
			fontSize?: (number|null)
			securityNotifications?: (boolean|null)
			autoUnarchiveChats?: (boolean|null)
			videoQualityMode?: (number|null)
			photoQualityMode?: (number|null)
			individualNotificationSettings?: (waproto.NotificationSettings.$Properties|null)
			groupNotificationSettings?: (waproto.NotificationSettings.$Properties|null)
			chatLockSettings?: (waproto.ChatLockSettings.$Properties|null)
			chatDbLidMigrationTimestamp?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.GlobalSettings.$Properties
	}
	interface IGroupHistory extends waproto.GroupHistory.$Properties {
	}
	class GroupHistory {
		constructor(p?: waproto.GroupHistory.$Properties)
		$unknowns?: Uint8Array[]
		messages: waproto.WebMessageInfo.$Properties[]
		uncountedAssociatedMessageLists: waproto.UnCountedAssociatedMessageList.$Properties[]
		commentMessages: waproto.WebMessageInfo.$Properties[]
		outOfWindowPinnedMessages: waproto.WebMessageInfo.$Properties[]
		static encode(m: waproto.GroupHistory.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.GroupHistory & waproto.GroupHistory.$Shape
	}
	namespace GroupHistory {
		interface $Properties {
			messages?: (waproto.WebMessageInfo.$Properties[]|null)
			uncountedAssociatedMessageLists?: (waproto.UnCountedAssociatedMessageList.$Properties[]|null)
			commentMessages?: (waproto.WebMessageInfo.$Properties[]|null)
			outOfWindowPinnedMessages?: (waproto.WebMessageInfo.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.GroupHistory.$Properties
	}
	interface IGroupHistoryBundleInfo extends waproto.GroupHistoryBundleInfo.$Properties {
	}
	class GroupHistoryBundleInfo {
		constructor(p?: waproto.GroupHistoryBundleInfo.$Properties)
		$unknowns?: Uint8Array[]
		deprecatedMessageHistoryBundle?: (waproto.Message.MessageHistoryBundle.$Properties|null)
		processState?: (waproto.GroupHistoryBundleInfo.ProcessState|null)
		static encode(m: waproto.GroupHistoryBundleInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.GroupHistoryBundleInfo & waproto.GroupHistoryBundleInfo.$Shape
	}
	namespace GroupHistoryBundleInfo {
		interface $Properties {
			deprecatedMessageHistoryBundle?: (waproto.Message.MessageHistoryBundle.$Properties|null)
			processState?: (waproto.GroupHistoryBundleInfo.ProcessState|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.GroupHistoryBundleInfo.$Properties
		enum ProcessState {
			NOT_INJECTED = 0,
			INJECTED = 1,
			INJECTED_PARTIAL = 2,
			INJECTION_FAILED = 3,
			INJECTION_FAILED_NO_RETRY = 4,
			DEDUPED = 5
		}
	}
	interface IGroupHistoryIndividualMessageInfo extends waproto.GroupHistoryIndividualMessageInfo.$Properties {
	}
	class GroupHistoryIndividualMessageInfo {
		constructor(p?: waproto.GroupHistoryIndividualMessageInfo.$Properties)
		$unknowns?: Uint8Array[]
		bundleMessageKey?: (waproto.MessageKey.$Properties|null)
		editedAfterReceivedAsHistory?: (boolean|null)
		static encode(m: waproto.GroupHistoryIndividualMessageInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.GroupHistoryIndividualMessageInfo & waproto.GroupHistoryIndividualMessageInfo.$Shape
	}
	namespace GroupHistoryIndividualMessageInfo {
		interface $Properties {
			bundleMessageKey?: (waproto.MessageKey.$Properties|null)
			editedAfterReceivedAsHistory?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.GroupHistoryIndividualMessageInfo.$Properties
	}
	interface IGroupHistoryWithMessageBytes extends waproto.GroupHistoryWithMessageBytes.$Properties {
	}
	class GroupHistoryWithMessageBytes {
		constructor(p?: waproto.GroupHistoryWithMessageBytes.$Properties)
		$unknowns?: Uint8Array[]
		messages: waproto.WebMessageInfoWithMessageBytes.$Properties[]
		uncountedAssociatedMessageLists: waproto.UnCountedAssociatedMessageListWithMessageBytes.$Properties[]
		commentMessages: waproto.WebMessageInfoWithMessageBytes.$Properties[]
		outOfWindowPinnedMessages: waproto.WebMessageInfoWithMessageBytes.$Properties[]
		static encode(m: waproto.GroupHistoryWithMessageBytes.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.GroupHistoryWithMessageBytes & waproto.GroupHistoryWithMessageBytes.$Shape
	}
	namespace GroupHistoryWithMessageBytes {
		interface $Properties {
			messages?: (waproto.WebMessageInfoWithMessageBytes.$Properties[]|null)
			uncountedAssociatedMessageLists?: (waproto.UnCountedAssociatedMessageListWithMessageBytes.$Properties[]|null)
			commentMessages?: (waproto.WebMessageInfoWithMessageBytes.$Properties[]|null)
			outOfWindowPinnedMessages?: (waproto.WebMessageInfoWithMessageBytes.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.GroupHistoryWithMessageBytes.$Properties
	}
	interface IGroupMention extends waproto.GroupMention.$Properties {
	}
	class GroupMention {
		constructor(p?: waproto.GroupMention.$Properties)
		$unknowns?: Uint8Array[]
		groupJid?: (string|null)
		groupSubject?: (string|null)
		static encode(m: waproto.GroupMention.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.GroupMention & waproto.GroupMention.$Shape
	}
	namespace GroupMention {
		interface $Properties {
			groupJid?: (string|null)
			groupSubject?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.GroupMention.$Properties
	}
	interface IGroupParticipant extends waproto.GroupParticipant.$Properties {
	}
	class GroupParticipant {
		constructor(p?: waproto.GroupParticipant.$Properties)
		$unknowns?: Uint8Array[]
		userJid?: (string|null)
		rank?: (waproto.GroupParticipant.Rank|null)
		memberLabel?: (waproto.MemberLabel.$Properties|null)
		static encode(m: waproto.GroupParticipant.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.GroupParticipant & waproto.GroupParticipant.$Shape
	}
	namespace GroupParticipant {
		interface $Properties {
			userJid?: (string|null)
			rank?: (waproto.GroupParticipant.Rank|null)
			memberLabel?: (waproto.MemberLabel.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.GroupParticipant.$Properties
		enum Rank {
			REGULAR = 0,
			ADMIN = 1,
			SUPERADMIN = 2
		}
	}
	interface IGroupRootKeyShare extends waproto.GroupRootKeyShare.$Properties {
	}
	class GroupRootKeyShare {
		constructor(p?: waproto.GroupRootKeyShare.$Properties)
		$unknowns?: Uint8Array[]
		keys: waproto.GroupRootKeyShareEntry.$Properties[]
		static encode(m: waproto.GroupRootKeyShare.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.GroupRootKeyShare & waproto.GroupRootKeyShare.$Shape
	}
	namespace GroupRootKeyShare {
		interface $Properties {
			keys?: (waproto.GroupRootKeyShareEntry.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.GroupRootKeyShare.$Properties
	}
	interface IGroupRootKeyShareEntry extends waproto.GroupRootKeyShareEntry.$Properties {
	}
	class GroupRootKeyShareEntry {
		constructor(p?: waproto.GroupRootKeyShareEntry.$Properties)
		$unknowns?: Uint8Array[]
		groupRootKey?: (Uint8Array|null)
		keyId?: (string|null)
		expiryTimestampMs?: (number|Long|null)
		createdTimestampMs?: (number|Long|null)
		static encode(m: waproto.GroupRootKeyShareEntry.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.GroupRootKeyShareEntry & waproto.GroupRootKeyShareEntry.$Shape
	}
	namespace GroupRootKeyShareEntry {
		interface $Properties {
			groupRootKey?: (Uint8Array|null)
			keyId?: (string|null)
			expiryTimestampMs?: (number|Long|null)
			createdTimestampMs?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.GroupRootKeyShareEntry.$Properties
	}
	interface IHandshakeMessage extends waproto.HandshakeMessage.$Properties {
	}
	class HandshakeMessage {
		constructor(p?: waproto.HandshakeMessage.$Properties)
		$unknowns?: Uint8Array[]
		clientHello?: (waproto.HandshakeMessage.ClientHello.$Properties|null)
		serverHello?: (waproto.HandshakeMessage.ServerHello.$Properties|null)
		clientFinish?: (waproto.HandshakeMessage.ClientFinish.$Properties|null)
		static encode(m: waproto.HandshakeMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.HandshakeMessage & waproto.HandshakeMessage.$Shape
	}
	namespace HandshakeMessage {
		interface $Properties {
			clientHello?: (waproto.HandshakeMessage.ClientHello.$Properties|null)
			serverHello?: (waproto.HandshakeMessage.ServerHello.$Properties|null)
			clientFinish?: (waproto.HandshakeMessage.ClientFinish.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.HandshakeMessage.$Properties
		enum HandshakePqMode {
			HANDSHAKE_PQ_MODE_UNKNOWN = 0,
			XXKEM = 1,
			XXKEM_FS = 2,
			WA_CLASSICAL = 3,
			WA_PQ = 4,
			IKKEM = 5,
			IKKEM_FS = 6,
			XXKEM_2 = 7,
			IKKEM_2 = 8
		}
		interface IClientFinish extends waproto.HandshakeMessage.ClientFinish.$Properties {
		}
		class ClientFinish {
			constructor(p?: waproto.HandshakeMessage.ClientFinish.$Properties)
			$unknowns?: Uint8Array[]
			static?: (Uint8Array|null)
			payload?: (Uint8Array|null)
			extendedCiphertext?: (Uint8Array|null)
			paddedBytes?: (Uint8Array|null)
			simulateXxkemFs?: (boolean|null)
			static encode(m: waproto.HandshakeMessage.ClientFinish.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.HandshakeMessage.ClientFinish & waproto.HandshakeMessage.ClientFinish.$Shape
		}
		namespace ClientFinish {
			interface $Properties {
				"static"?: (Uint8Array|null)
				payload?: (Uint8Array|null)
				extendedCiphertext?: (Uint8Array|null)
				paddedBytes?: (Uint8Array|null)
				simulateXxkemFs?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.HandshakeMessage.ClientFinish.$Properties
		}
		interface IServerHello extends waproto.HandshakeMessage.ServerHello.$Properties {
		}
		class ServerHello {
			constructor(p?: waproto.HandshakeMessage.ServerHello.$Properties)
			$unknowns?: Uint8Array[]
			ephemeral?: (Uint8Array|null)
			static?: (Uint8Array|null)
			payload?: (Uint8Array|null)
			extendedStatic?: (Uint8Array|null)
			paddingBytes?: (Uint8Array|null)
			extendedCiphertext?: (Uint8Array|null)
			static encode(m: waproto.HandshakeMessage.ServerHello.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.HandshakeMessage.ServerHello & waproto.HandshakeMessage.ServerHello.$Shape
		}
		namespace ServerHello {
			interface $Properties {
				ephemeral?: (Uint8Array|null)
				"static"?: (Uint8Array|null)
				payload?: (Uint8Array|null)
				extendedStatic?: (Uint8Array|null)
				paddingBytes?: (Uint8Array|null)
				extendedCiphertext?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.HandshakeMessage.ServerHello.$Properties
		}
		interface IClientHello extends waproto.HandshakeMessage.ClientHello.$Properties {
		}
		class ClientHello {
			constructor(p?: waproto.HandshakeMessage.ClientHello.$Properties)
			$unknowns?: Uint8Array[]
			ephemeral?: (Uint8Array|null)
			static?: (Uint8Array|null)
			payload?: (Uint8Array|null)
			useExtended?: (boolean|null)
			extendedCiphertext?: (Uint8Array|null)
			paddedBytes?: (Uint8Array|null)
			sendServerHelloPaddedBytes?: (boolean|null)
			simulateXxkemFs?: (boolean|null)
			pqMode?: (waproto.HandshakeMessage.HandshakePqMode|null)
			extendedEphemeral?: (Uint8Array|null)
			static encode(m: waproto.HandshakeMessage.ClientHello.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.HandshakeMessage.ClientHello & waproto.HandshakeMessage.ClientHello.$Shape
		}
		namespace ClientHello {
			interface $Properties {
				ephemeral?: (Uint8Array|null)
				"static"?: (Uint8Array|null)
				payload?: (Uint8Array|null)
				useExtended?: (boolean|null)
				extendedCiphertext?: (Uint8Array|null)
				paddedBytes?: (Uint8Array|null)
				sendServerHelloPaddedBytes?: (boolean|null)
				simulateXxkemFs?: (boolean|null)
				pqMode?: (waproto.HandshakeMessage.HandshakePqMode|null)
				extendedEphemeral?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.HandshakeMessage.ClientHello.$Properties
		}
	}
	interface IHatchMetadataSync extends waproto.HatchMetadataSync.$Properties {
	}
	class HatchMetadataSync {
		constructor(p?: waproto.HatchMetadataSync.$Properties)
		$unknowns?: Uint8Array[]
		data?: (Uint8Array|null)
		timestampMs?: (number|Long|null)
		requestId?: (string|null)
		static encode(m: waproto.HatchMetadataSync.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.HatchMetadataSync & waproto.HatchMetadataSync.$Shape
	}
	namespace HatchMetadataSync {
		interface $Properties {
			data?: (Uint8Array|null)
			timestampMs?: (number|Long|null)
			requestId?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.HatchMetadataSync.$Properties
	}
	interface IHistorySync extends waproto.HistorySync.$Properties {
	}
	class HistorySync {
		constructor(p?: waproto.HistorySync.$Properties)
		$unknowns?: Uint8Array[]
		syncType?: (waproto.HistorySync.HistorySyncType|null)
		conversations: waproto.Conversation.$Properties[]
		statusV3Messages: waproto.WebMessageInfo.$Properties[]
		chunkOrder?: (number|null)
		progress?: (number|null)
		pushnames: waproto.Pushname.$Properties[]
		globalSettings?: (waproto.GlobalSettings.$Properties|null)
		threadIdUserSecret?: (Uint8Array|null)
		threadDsTimeframeOffset?: (number|null)
		recentStickers: waproto.StickerMetadata.$Properties[]
		pastParticipants: waproto.PastParticipants.$Properties[]
		callLogRecords: waproto.CallLogRecord.$Properties[]
		aiWaitListState?: (waproto.HistorySync.BotAIWaitListState|null)
		phoneNumberToLidMappings: waproto.PhoneNumberToLIDMapping.$Properties[]
		companionMetaNonce?: (string|null)
		shareableChatIdentifierEncryptionKey?: (Uint8Array|null)
		accounts: waproto.Account.$Properties[]
		nctSalt?: (Uint8Array|null)
		inlineContacts: waproto.InlineContact.$Properties[]
		inlineContactsProvided?: (boolean|null)
		static encode(m: waproto.HistorySync.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.HistorySync & waproto.HistorySync.$Shape
	}
	namespace HistorySync {
		interface $Properties {
			syncType?: (waproto.HistorySync.HistorySyncType|null)
			conversations?: (waproto.Conversation.$Properties[]|null)
			statusV3Messages?: (waproto.WebMessageInfo.$Properties[]|null)
			chunkOrder?: (number|null)
			progress?: (number|null)
			pushnames?: (waproto.Pushname.$Properties[]|null)
			globalSettings?: (waproto.GlobalSettings.$Properties|null)
			threadIdUserSecret?: (Uint8Array|null)
			threadDsTimeframeOffset?: (number|null)
			recentStickers?: (waproto.StickerMetadata.$Properties[]|null)
			pastParticipants?: (waproto.PastParticipants.$Properties[]|null)
			callLogRecords?: (waproto.CallLogRecord.$Properties[]|null)
			aiWaitListState?: (waproto.HistorySync.BotAIWaitListState|null)
			phoneNumberToLidMappings?: (waproto.PhoneNumberToLIDMapping.$Properties[]|null)
			companionMetaNonce?: (string|null)
			shareableChatIdentifierEncryptionKey?: (Uint8Array|null)
			accounts?: (waproto.Account.$Properties[]|null)
			nctSalt?: (Uint8Array|null)
			inlineContacts?: (waproto.InlineContact.$Properties[]|null)
			inlineContactsProvided?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.HistorySync.$Properties
		enum BotAIWaitListState {
			IN_WAITLIST = 0,
			AI_AVAILABLE = 1
		}
		enum HistorySyncType {
			INITIAL_BOOTSTRAP = 0,
			INITIAL_STATUS_V3 = 1,
			FULL = 2,
			RECENT = 3,
			PUSH_NAME = 4,
			NON_BLOCKING_DATA = 5,
			ON_DEMAND = 6
		}
	}
	interface IHistorySyncMsg extends waproto.HistorySyncMsg.$Properties {
	}
	class HistorySyncMsg {
		constructor(p?: waproto.HistorySyncMsg.$Properties)
		$unknowns?: Uint8Array[]
		message?: (waproto.WebMessageInfo.$Properties|null)
		msgOrderId?: (number|Long|null)
		static encode(m: waproto.HistorySyncMsg.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.HistorySyncMsg & waproto.HistorySyncMsg.$Shape
	}
	namespace HistorySyncMsg {
		interface $Properties {
			message?: (waproto.WebMessageInfo.$Properties|null)
			msgOrderId?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.HistorySyncMsg.$Properties
	}
	interface IHydratedTemplateButton extends waproto.HydratedTemplateButton.$Properties {
	}
	class HydratedTemplateButton {
		constructor(p?: waproto.HydratedTemplateButton.$Properties)
		$unknowns?: Uint8Array[]
		quickReplyButton?: (waproto.HydratedTemplateButton.HydratedQuickReplyButton.$Properties|null)
		urlButton?: (waproto.HydratedTemplateButton.HydratedURLButton.$Properties|null)
		callButton?: (waproto.HydratedTemplateButton.HydratedCallButton.$Properties|null)
		index?: (number|null)
		static encode(m: waproto.HydratedTemplateButton.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.HydratedTemplateButton & waproto.HydratedTemplateButton.$Shape
	}
	namespace HydratedTemplateButton {
		interface $Properties {
			quickReplyButton?: (waproto.HydratedTemplateButton.HydratedQuickReplyButton.$Properties|null)
			urlButton?: (waproto.HydratedTemplateButton.HydratedURLButton.$Properties|null)
			callButton?: (waproto.HydratedTemplateButton.HydratedCallButton.$Properties|null)
			index?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.HydratedTemplateButton.$Properties
		interface IHydratedCallButton extends waproto.HydratedTemplateButton.HydratedCallButton.$Properties {
		}
		class HydratedCallButton {
			constructor(p?: waproto.HydratedTemplateButton.HydratedCallButton.$Properties)
			$unknowns?: Uint8Array[]
			displayText?: (string|null)
			phoneNumber?: (string|null)
			static encode(m: waproto.HydratedTemplateButton.HydratedCallButton.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.HydratedTemplateButton.HydratedCallButton & waproto.HydratedTemplateButton.HydratedCallButton.$Shape
		}
		namespace HydratedCallButton {
			interface $Properties {
				displayText?: (string|null)
				phoneNumber?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.HydratedTemplateButton.HydratedCallButton.$Properties
		}
		interface IHydratedURLButton extends waproto.HydratedTemplateButton.HydratedURLButton.$Properties {
		}
		class HydratedURLButton {
			constructor(p?: waproto.HydratedTemplateButton.HydratedURLButton.$Properties)
			$unknowns?: Uint8Array[]
			displayText?: (string|null)
			url?: (string|null)
			consentedUsersUrl?: (string|null)
			webviewPresentation?: (waproto.HydratedTemplateButton.HydratedURLButton.WebviewPresentationType|null)
			static encode(m: waproto.HydratedTemplateButton.HydratedURLButton.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.HydratedTemplateButton.HydratedURLButton & waproto.HydratedTemplateButton.HydratedURLButton.$Shape
		}
		namespace HydratedURLButton {
			interface $Properties {
				displayText?: (string|null)
				url?: (string|null)
				consentedUsersUrl?: (string|null)
				webviewPresentation?: (waproto.HydratedTemplateButton.HydratedURLButton.WebviewPresentationType|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.HydratedTemplateButton.HydratedURLButton.$Properties
			enum WebviewPresentationType {
				FULL = 1,
				TALL = 2,
				COMPACT = 3
			}
		}
		interface IHydratedQuickReplyButton extends waproto.HydratedTemplateButton.HydratedQuickReplyButton.$Properties {
		}
		class HydratedQuickReplyButton {
			constructor(p?: waproto.HydratedTemplateButton.HydratedQuickReplyButton.$Properties)
			$unknowns?: Uint8Array[]
			displayText?: (string|null)
			id?: (string|null)
			static encode(m: waproto.HydratedTemplateButton.HydratedQuickReplyButton.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.HydratedTemplateButton.HydratedQuickReplyButton & waproto.HydratedTemplateButton.HydratedQuickReplyButton.$Shape
		}
		namespace HydratedQuickReplyButton {
			interface $Properties {
				displayText?: (string|null)
				id?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.HydratedTemplateButton.HydratedQuickReplyButton.$Properties
		}
	}
	interface IIdentityKeyPairStructure extends waproto.IdentityKeyPairStructure.$Properties {
	}
	class IdentityKeyPairStructure {
		constructor(p?: waproto.IdentityKeyPairStructure.$Properties)
		$unknowns?: Uint8Array[]
		publicKey?: (Uint8Array|null)
		privateKey?: (Uint8Array|null)
		static encode(m: waproto.IdentityKeyPairStructure.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.IdentityKeyPairStructure & waproto.IdentityKeyPairStructure.$Shape
	}
	namespace IdentityKeyPairStructure {
		interface $Properties {
			publicKey?: (Uint8Array|null)
			privateKey?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.IdentityKeyPairStructure.$Properties
	}
	interface IIdentityVerificationState extends waproto.IdentityVerificationState.$Properties {
	}
	class IdentityVerificationState {
		constructor(p?: waproto.IdentityVerificationState.$Properties)
		$unknowns?: Uint8Array[]
		verified?: (boolean|null)
		actionSeq?: (number|Long|null)
		static encode(m: waproto.IdentityVerificationState.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.IdentityVerificationState & waproto.IdentityVerificationState.$Shape
	}
	namespace IdentityVerificationState {
		interface $Properties {
			verified?: (boolean|null)
			actionSeq?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.IdentityVerificationState.$Properties
	}
	interface IInThreadSurveyMetadata extends waproto.InThreadSurveyMetadata.$Properties {
	}
	class InThreadSurveyMetadata {
		constructor(p?: waproto.InThreadSurveyMetadata.$Properties)
		$unknowns?: Uint8Array[]
		tessaSessionId?: (string|null)
		simonSessionId?: (string|null)
		simonSurveyId?: (string|null)
		tessaRootId?: (string|null)
		requestId?: (string|null)
		tessaEvent?: (string|null)
		invitationHeaderText?: (string|null)
		invitationBodyText?: (string|null)
		invitationCtaText?: (string|null)
		invitationCtaUrl?: (string|null)
		surveyTitle?: (string|null)
		questions: waproto.InThreadSurveyMetadata.InThreadSurveyQuestion.$Properties[]
		surveyContinueButtonText?: (string|null)
		surveySubmitButtonText?: (string|null)
		privacyStatementFull?: (string|null)
		privacyStatementParts: waproto.InThreadSurveyMetadata.InThreadSurveyPrivacyStatementPart.$Properties[]
		feedbackToastText?: (string|null)
		startQuestionIndex?: (number|null)
		static encode(m: waproto.InThreadSurveyMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.InThreadSurveyMetadata & waproto.InThreadSurveyMetadata.$Shape
	}
	namespace InThreadSurveyMetadata {
		interface $Properties {
			tessaSessionId?: (string|null)
			simonSessionId?: (string|null)
			simonSurveyId?: (string|null)
			tessaRootId?: (string|null)
			requestId?: (string|null)
			tessaEvent?: (string|null)
			invitationHeaderText?: (string|null)
			invitationBodyText?: (string|null)
			invitationCtaText?: (string|null)
			invitationCtaUrl?: (string|null)
			surveyTitle?: (string|null)
			questions?: (waproto.InThreadSurveyMetadata.InThreadSurveyQuestion.$Properties[]|null)
			surveyContinueButtonText?: (string|null)
			surveySubmitButtonText?: (string|null)
			privacyStatementFull?: (string|null)
			privacyStatementParts?: (waproto.InThreadSurveyMetadata.InThreadSurveyPrivacyStatementPart.$Properties[]|null)
			feedbackToastText?: (string|null)
			startQuestionIndex?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.InThreadSurveyMetadata.$Properties
		interface IInThreadSurveyPrivacyStatementPart extends waproto.InThreadSurveyMetadata.InThreadSurveyPrivacyStatementPart.$Properties {
		}
		class InThreadSurveyPrivacyStatementPart {
			constructor(p?: waproto.InThreadSurveyMetadata.InThreadSurveyPrivacyStatementPart.$Properties)
			$unknowns?: Uint8Array[]
			text?: (string|null)
			url?: (string|null)
			static encode(m: waproto.InThreadSurveyMetadata.InThreadSurveyPrivacyStatementPart.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.InThreadSurveyMetadata.InThreadSurveyPrivacyStatementPart & waproto.InThreadSurveyMetadata.InThreadSurveyPrivacyStatementPart.$Shape
		}
		namespace InThreadSurveyPrivacyStatementPart {
			interface $Properties {
				text?: (string|null)
				url?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.InThreadSurveyMetadata.InThreadSurveyPrivacyStatementPart.$Properties
		}
		interface IInThreadSurveyOption extends waproto.InThreadSurveyMetadata.InThreadSurveyOption.$Properties {
		}
		class InThreadSurveyOption {
			constructor(p?: waproto.InThreadSurveyMetadata.InThreadSurveyOption.$Properties)
			$unknowns?: Uint8Array[]
			stringValue?: (string|null)
			numericValue?: (number|null)
			textTranslated?: (string|null)
			static encode(m: waproto.InThreadSurveyMetadata.InThreadSurveyOption.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.InThreadSurveyMetadata.InThreadSurveyOption & waproto.InThreadSurveyMetadata.InThreadSurveyOption.$Shape
		}
		namespace InThreadSurveyOption {
			interface $Properties {
				stringValue?: (string|null)
				numericValue?: (number|null)
				textTranslated?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.InThreadSurveyMetadata.InThreadSurveyOption.$Properties
		}
		interface IInThreadSurveyQuestion extends waproto.InThreadSurveyMetadata.InThreadSurveyQuestion.$Properties {
		}
		class InThreadSurveyQuestion {
			constructor(p?: waproto.InThreadSurveyMetadata.InThreadSurveyQuestion.$Properties)
			$unknowns?: Uint8Array[]
			questionText?: (string|null)
			questionId?: (string|null)
			questionOptions: waproto.InThreadSurveyMetadata.InThreadSurveyOption.$Properties[]
			static encode(m: waproto.InThreadSurveyMetadata.InThreadSurveyQuestion.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.InThreadSurveyMetadata.InThreadSurveyQuestion & waproto.InThreadSurveyMetadata.InThreadSurveyQuestion.$Shape
		}
		namespace InThreadSurveyQuestion {
			interface $Properties {
				questionText?: (string|null)
				questionId?: (string|null)
				questionOptions?: (waproto.InThreadSurveyMetadata.InThreadSurveyOption.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.InThreadSurveyMetadata.InThreadSurveyQuestion.$Properties
		}
	}
	interface IInlineContact extends waproto.InlineContact.$Properties {
	}
	class InlineContact {
		constructor(p?: waproto.InlineContact.$Properties)
		$unknowns?: Uint8Array[]
		pnJid?: (string|null)
		lidJid?: (string|null)
		fullName?: (string|null)
		firstName?: (string|null)
		username?: (string|null)
		static encode(m: waproto.InlineContact.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.InlineContact & waproto.InlineContact.$Shape
	}
	namespace InlineContact {
		interface $Properties {
			pnJid?: (string|null)
			lidJid?: (string|null)
			fullName?: (string|null)
			firstName?: (string|null)
			username?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.InlineContact.$Properties
	}
	interface IInteractiveAnnotation extends waproto.InteractiveAnnotation.$Properties {
	}
	class InteractiveAnnotation {
		constructor(p?: waproto.InteractiveAnnotation.$Properties)
		$unknowns?: Uint8Array[]
		polygonVertices: waproto.Point.$Properties[]
		location?: (waproto.Location.$Properties|null)
		newsletter?: (waproto.ContextInfo.ForwardedNewsletterMessageInfo.$Properties|null)
		shouldSkipConfirmation?: (boolean|null)
		embeddedContent?: (waproto.EmbeddedContent.$Properties|null)
		embeddedAction?: (boolean|null)
		tapAction?: (waproto.TapLinkAction.$Properties|null)
		statusLinkType?: (waproto.InteractiveAnnotation.StatusLinkType|null)
		static encode(m: waproto.InteractiveAnnotation.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.InteractiveAnnotation & waproto.InteractiveAnnotation.$Shape
	}
	namespace InteractiveAnnotation {
		interface $Properties {
			polygonVertices?: (waproto.Point.$Properties[]|null)
			location?: (waproto.Location.$Properties|null)
			newsletter?: (waproto.ContextInfo.ForwardedNewsletterMessageInfo.$Properties|null)
			shouldSkipConfirmation?: (boolean|null)
			embeddedContent?: (waproto.EmbeddedContent.$Properties|null)
			embeddedAction?: (boolean|null)
			tapAction?: (waproto.TapLinkAction.$Properties|null)
			statusLinkType?: (waproto.InteractiveAnnotation.StatusLinkType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.InteractiveAnnotation.$Properties
		enum StatusLinkType {
			RASTERIZED_LINK_PREVIEW = 1,
			RASTERIZED_LINK_TRUNCATED = 2,
			RASTERIZED_LINK_FULL_URL = 3
		}
	}
	interface IInteractiveMessageAdditionalMetadata extends waproto.InteractiveMessageAdditionalMetadata.$Properties {
	}
	class InteractiveMessageAdditionalMetadata {
		constructor(p?: waproto.InteractiveMessageAdditionalMetadata.$Properties)
		$unknowns?: Uint8Array[]
		isGalaxyFlowCompleted?: (boolean|null)
		static encode(m: waproto.InteractiveMessageAdditionalMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.InteractiveMessageAdditionalMetadata & waproto.InteractiveMessageAdditionalMetadata.$Shape
	}
	namespace InteractiveMessageAdditionalMetadata {
		interface $Properties {
			isGalaxyFlowCompleted?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.InteractiveMessageAdditionalMetadata.$Properties
	}
	interface IKeepInChat extends waproto.KeepInChat.$Properties {
	}
	class KeepInChat {
		constructor(p?: waproto.KeepInChat.$Properties)
		$unknowns?: Uint8Array[]
		keepType?: (waproto.KeepType|null)
		serverTimestamp?: (number|Long|null)
		key?: (waproto.MessageKey.$Properties|null)
		deviceJid?: (string|null)
		clientTimestampMs?: (number|Long|null)
		serverTimestampMs?: (number|Long|null)
		static encode(m: waproto.KeepInChat.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.KeepInChat & waproto.KeepInChat.$Shape
	}
	namespace KeepInChat {
		interface $Properties {
			keepType?: (waproto.KeepType|null)
			serverTimestamp?: (number|Long|null)
			key?: (waproto.MessageKey.$Properties|null)
			deviceJid?: (string|null)
			clientTimestampMs?: (number|Long|null)
			serverTimestampMs?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.KeepInChat.$Properties
	}
	interface IKeyExchangeMessage extends waproto.KeyExchangeMessage.$Properties {
	}
	class KeyExchangeMessage {
		constructor(p?: waproto.KeyExchangeMessage.$Properties)
		$unknowns?: Uint8Array[]
		id?: (number|null)
		baseKey?: (Uint8Array|null)
		ratchetKey?: (Uint8Array|null)
		identityKey?: (Uint8Array|null)
		baseKeySignature?: (Uint8Array|null)
		static encode(m: waproto.KeyExchangeMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.KeyExchangeMessage & waproto.KeyExchangeMessage.$Shape
	}
	namespace KeyExchangeMessage {
		interface $Properties {
			id?: (number|null)
			baseKey?: (Uint8Array|null)
			ratchetKey?: (Uint8Array|null)
			identityKey?: (Uint8Array|null)
			baseKeySignature?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.KeyExchangeMessage.$Properties
	}
	interface IKeyId extends waproto.KeyId.$Properties {
	}
	class KeyId {
		constructor(p?: waproto.KeyId.$Properties)
		$unknowns?: Uint8Array[]
		id?: (Uint8Array|null)
		static encode(m: waproto.KeyId.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.KeyId & waproto.KeyId.$Shape
	}
	namespace KeyId {
		interface $Properties {
			id?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.KeyId.$Properties
	}
	interface ILIDMigrationMappingSyncMessage extends waproto.LIDMigrationMappingSyncMessage.$Properties {
	}
	class LIDMigrationMappingSyncMessage {
		constructor(p?: waproto.LIDMigrationMappingSyncMessage.$Properties)
		$unknowns?: Uint8Array[]
		encodedMappingPayload?: (Uint8Array|null)
		static encode(m: waproto.LIDMigrationMappingSyncMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.LIDMigrationMappingSyncMessage & waproto.LIDMigrationMappingSyncMessage.$Shape
	}
	namespace LIDMigrationMappingSyncMessage {
		interface $Properties {
			encodedMappingPayload?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.LIDMigrationMappingSyncMessage.$Properties
	}
	interface ILabyrinthWaCommand extends waproto.LabyrinthWaCommand.$Properties {
	}
	class LabyrinthWaCommand {
		constructor(p?: waproto.LabyrinthWaCommand.$Properties)
		$unknowns?: Uint8Array[]
		createBackupInput?: (waproto.CreateBackupInput.$Properties|null)
		encryptMessageInput?: (waproto.EncryptMessageInput.$Properties|null)
		decryptMessageInput?: (waproto.DecryptMessageInput.$Properties|null)
		orfThreadIdInput?: (waproto.OrfThreadIdInput.$Properties|null)
		static encode(m: waproto.LabyrinthWaCommand.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.LabyrinthWaCommand & waproto.LabyrinthWaCommand.$Shape
	}
	namespace LabyrinthWaCommand {
		interface $Properties {
			createBackupInput?: (waproto.CreateBackupInput.$Properties|null)
			encryptMessageInput?: (waproto.EncryptMessageInput.$Properties|null)
			decryptMessageInput?: (waproto.DecryptMessageInput.$Properties|null)
			orfThreadIdInput?: (waproto.OrfThreadIdInput.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.LabyrinthWaCommand.$Properties
	}
	interface ILegacyMessage extends waproto.LegacyMessage.$Properties {
	}
	class LegacyMessage {
		constructor(p?: waproto.LegacyMessage.$Properties)
		$unknowns?: Uint8Array[]
		eventResponseMessage?: (waproto.Message.EventResponseMessage.$Properties|null)
		pollVote?: (waproto.Message.PollVoteMessage.$Properties|null)
		static encode(m: waproto.LegacyMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.LegacyMessage & waproto.LegacyMessage.$Shape
	}
	namespace LegacyMessage {
		interface $Properties {
			eventResponseMessage?: (waproto.Message.EventResponseMessage.$Properties|null)
			pollVote?: (waproto.Message.PollVoteMessage.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.LegacyMessage.$Properties
	}
	interface ILimitSharing extends waproto.LimitSharing.$Properties {
	}
	class LimitSharing {
		constructor(p?: waproto.LimitSharing.$Properties)
		$unknowns?: Uint8Array[]
		sharingLimited?: (boolean|null)
		trigger?: (waproto.LimitSharing.Trigger|null)
		limitSharingSettingTimestamp?: (number|Long|null)
		initiatedByMe?: (boolean|null)
		static encode(m: waproto.LimitSharing.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.LimitSharing & waproto.LimitSharing.$Shape
	}
	namespace LimitSharing {
		interface $Properties {
			sharingLimited?: (boolean|null)
			trigger?: (waproto.LimitSharing.Trigger|null)
			limitSharingSettingTimestamp?: (number|Long|null)
			initiatedByMe?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.LimitSharing.$Properties
		enum Trigger {
			UNKNOWN = 0,
			CHAT_SETTING = 1,
			BIZ_SUPPORTS_FB_HOSTING = 2,
			UNKNOWN_GROUP = 3
		}
	}
	interface ILocalizedName extends waproto.LocalizedName.$Properties {
	}
	class LocalizedName {
		constructor(p?: waproto.LocalizedName.$Properties)
		$unknowns?: Uint8Array[]
		lg?: (string|null)
		lc?: (string|null)
		verifiedName?: (string|null)
		static encode(m: waproto.LocalizedName.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.LocalizedName & waproto.LocalizedName.$Shape
	}
	namespace LocalizedName {
		interface $Properties {
			lg?: (string|null)
			lc?: (string|null)
			verifiedName?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.LocalizedName.$Properties
	}
	interface ILocation extends waproto.Location.$Properties {
	}
	class Location {
		constructor(p?: waproto.Location.$Properties)
		$unknowns?: Uint8Array[]
		degreesLatitude?: (number|null)
		degreesLongitude?: (number|null)
		name?: (string|null)
		static encode(m: waproto.Location.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Location & waproto.Location.$Shape
	}
	namespace Location {
		interface $Properties {
			degreesLatitude?: (number|null)
			degreesLongitude?: (number|null)
			name?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Location.$Properties
	}
	interface IMediaData extends waproto.MediaData.$Properties {
	}
	class MediaData {
		constructor(p?: waproto.MediaData.$Properties)
		$unknowns?: Uint8Array[]
		localPath?: (string|null)
		static encode(m: waproto.MediaData.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MediaData & waproto.MediaData.$Shape
	}
	namespace MediaData {
		interface $Properties {
			localPath?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MediaData.$Properties
	}
	interface IMediaDomainInfo extends waproto.MediaDomainInfo.$Properties {
	}
	class MediaDomainInfo {
		constructor(p?: waproto.MediaDomainInfo.$Properties)
		$unknowns?: Uint8Array[]
		mediaKeyDomain?: (waproto.MediaKeyDomain|null)
		e2EeMediaKey?: (Uint8Array|null)
		static encode(m: waproto.MediaDomainInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MediaDomainInfo & waproto.MediaDomainInfo.$Shape
	}
	namespace MediaDomainInfo {
		interface $Properties {
			mediaKeyDomain?: (waproto.MediaKeyDomain|null)
			e2EeMediaKey?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MediaDomainInfo.$Properties
	}
	interface IMediaEntry extends waproto.MediaEntry.$Properties {
	}
	class MediaEntry {
		constructor(p?: waproto.MediaEntry.$Properties)
		$unknowns?: Uint8Array[]
		fileSha256?: (Uint8Array|null)
		mediaKey?: (Uint8Array|null)
		fileEncSha256?: (Uint8Array|null)
		directPath?: (string|null)
		mediaKeyTimestamp?: (number|Long|null)
		serverMediaType?: (string|null)
		uploadToken?: (Uint8Array|null)
		validatedTimestamp?: (Uint8Array|null)
		sidecar?: (Uint8Array|null)
		objectId?: (string|null)
		fbid?: (string|null)
		downloadableThumbnail?: (waproto.MediaEntry.DownloadableThumbnail.$Properties|null)
		handle?: (string|null)
		filename?: (string|null)
		progressiveJpegDetails?: (waproto.MediaEntry.ProgressiveJpegDetails.$Properties|null)
		size?: (number|Long|null)
		lastDownloadAttemptTimestamp?: (number|Long|null)
		static encode(m: waproto.MediaEntry.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MediaEntry & waproto.MediaEntry.$Shape
	}
	namespace MediaEntry {
		interface $Properties {
			fileSha256?: (Uint8Array|null)
			mediaKey?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			directPath?: (string|null)
			mediaKeyTimestamp?: (number|Long|null)
			serverMediaType?: (string|null)
			uploadToken?: (Uint8Array|null)
			validatedTimestamp?: (Uint8Array|null)
			sidecar?: (Uint8Array|null)
			objectId?: (string|null)
			fbid?: (string|null)
			downloadableThumbnail?: (waproto.MediaEntry.DownloadableThumbnail.$Properties|null)
			handle?: (string|null)
			filename?: (string|null)
			progressiveJpegDetails?: (waproto.MediaEntry.ProgressiveJpegDetails.$Properties|null)
			size?: (number|Long|null)
			lastDownloadAttemptTimestamp?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MediaEntry.$Properties
		interface IProgressiveJpegDetails extends waproto.MediaEntry.ProgressiveJpegDetails.$Properties {
		}
		class ProgressiveJpegDetails {
			constructor(p?: waproto.MediaEntry.ProgressiveJpegDetails.$Properties)
			$unknowns?: Uint8Array[]
			scanLengths: number[]
			sidecar?: (Uint8Array|null)
			static encode(m: waproto.MediaEntry.ProgressiveJpegDetails.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.MediaEntry.ProgressiveJpegDetails & waproto.MediaEntry.ProgressiveJpegDetails.$Shape
		}
		namespace ProgressiveJpegDetails {
			interface $Properties {
				scanLengths?: (number[]|null)
				sidecar?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.MediaEntry.ProgressiveJpegDetails.$Properties
		}
		interface IDownloadableThumbnail extends waproto.MediaEntry.DownloadableThumbnail.$Properties {
		}
		class DownloadableThumbnail {
			constructor(p?: waproto.MediaEntry.DownloadableThumbnail.$Properties)
			$unknowns?: Uint8Array[]
			fileSha256?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			directPath?: (string|null)
			mediaKey?: (Uint8Array|null)
			mediaKeyTimestamp?: (number|Long|null)
			objectId?: (string|null)
			static encode(m: waproto.MediaEntry.DownloadableThumbnail.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.MediaEntry.DownloadableThumbnail & waproto.MediaEntry.DownloadableThumbnail.$Shape
		}
		namespace DownloadableThumbnail {
			interface $Properties {
				fileSha256?: (Uint8Array|null)
				fileEncSha256?: (Uint8Array|null)
				directPath?: (string|null)
				mediaKey?: (Uint8Array|null)
				mediaKeyTimestamp?: (number|Long|null)
				objectId?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.MediaEntry.DownloadableThumbnail.$Properties
		}
	}
	interface IMediaNotifyMessage extends waproto.MediaNotifyMessage.$Properties {
	}
	class MediaNotifyMessage {
		constructor(p?: waproto.MediaNotifyMessage.$Properties)
		$unknowns?: Uint8Array[]
		expressPathUrl?: (string|null)
		fileEncSha256?: (Uint8Array|null)
		fileLength?: (number|Long|null)
		static encode(m: waproto.MediaNotifyMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MediaNotifyMessage & waproto.MediaNotifyMessage.$Shape
	}
	namespace MediaNotifyMessage {
		interface $Properties {
			expressPathUrl?: (string|null)
			fileEncSha256?: (Uint8Array|null)
			fileLength?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MediaNotifyMessage.$Properties
	}
	interface IMediaRetryNotification extends waproto.MediaRetryNotification.$Properties {
	}
	class MediaRetryNotification {
		constructor(p?: waproto.MediaRetryNotification.$Properties)
		$unknowns?: Uint8Array[]
		stanzaId?: (string|null)
		directPath?: (string|null)
		result?: (waproto.MediaRetryNotification.ResultType|null)
		messageSecret?: (Uint8Array|null)
		static encode(m: waproto.MediaRetryNotification.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MediaRetryNotification & waproto.MediaRetryNotification.$Shape
	}
	namespace MediaRetryNotification {
		interface $Properties {
			stanzaId?: (string|null)
			directPath?: (string|null)
			result?: (waproto.MediaRetryNotification.ResultType|null)
			messageSecret?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MediaRetryNotification.$Properties
		enum ResultType {
			GENERAL_ERROR = 0,
			SUCCESS = 1,
			NOT_FOUND = 2,
			DECRYPTION_ERROR = 3
		}
	}
	interface IMemberLabel extends waproto.MemberLabel.$Properties {
	}
	class MemberLabel {
		constructor(p?: waproto.MemberLabel.$Properties)
		$unknowns?: Uint8Array[]
		label?: (string|null)
		labelTimestamp?: (number|Long|null)
		static encode(m: waproto.MemberLabel.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MemberLabel & waproto.MemberLabel.$Shape
	}
	namespace MemberLabel {
		interface $Properties {
			label?: (string|null)
			labelTimestamp?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MemberLabel.$Properties
	}
	interface IMention extends waproto.Mention.$Properties {
	}
	class Mention {
		constructor(p?: waproto.Mention.$Properties)
		$unknowns?: Uint8Array[]
		mentionType?: (waproto.MENTION_MENTION_TYPE|null)
		mentionedJid?: (string|null)
		offset?: (number|null)
		length?: (number|null)
		static encode(m: waproto.Mention.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Mention & waproto.Mention.$Shape
	}
	namespace Mention {
		interface $Properties {
			mentionType?: (waproto.MENTION_MENTION_TYPE|null)
			mentionedJid?: (string|null)
			offset?: (number|null)
			length?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Mention.$Properties
	}
	interface IMessage extends waproto.Message.$Properties {
	}
	class Message {
		constructor(p?: waproto.Message.$Properties)
		$unknowns?: Uint8Array[]
		conversation?: (string|null)
		senderKeyDistributionMessage?: (waproto.Message.SenderKeyDistributionMessage.$Properties|null)
		imageMessage?: (waproto.Message.ImageMessage.$Properties|null)
		contactMessage?: (waproto.Message.ContactMessage.$Properties|null)
		locationMessage?: (waproto.Message.LocationMessage.$Properties|null)
		extendedTextMessage?: (waproto.Message.ExtendedTextMessage.$Properties|null)
		documentMessage?: (waproto.Message.DocumentMessage.$Properties|null)
		audioMessage?: (waproto.Message.AudioMessage.$Properties|null)
		videoMessage?: (waproto.Message.VideoMessage.$Properties|null)
		call?: (waproto.Message.Call.$Properties|null)
		chat?: (waproto.Message.Chat.$Properties|null)
		protocolMessage?: (waproto.Message.ProtocolMessage.$Properties|null)
		contactsArrayMessage?: (waproto.Message.ContactsArrayMessage.$Properties|null)
		highlyStructuredMessage?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
		fastRatchetKeySenderKeyDistributionMessage?: (waproto.Message.SenderKeyDistributionMessage.$Properties|null)
		sendPaymentMessage?: (waproto.Message.SendPaymentMessage.$Properties|null)
		liveLocationMessage?: (waproto.Message.LiveLocationMessage.$Properties|null)
		requestPaymentMessage?: (waproto.Message.RequestPaymentMessage.$Properties|null)
		declinePaymentRequestMessage?: (waproto.Message.DeclinePaymentRequestMessage.$Properties|null)
		cancelPaymentRequestMessage?: (waproto.Message.CancelPaymentRequestMessage.$Properties|null)
		templateMessage?: (waproto.Message.TemplateMessage.$Properties|null)
		stickerMessage?: (waproto.Message.StickerMessage.$Properties|null)
		groupInviteMessage?: (waproto.Message.GroupInviteMessage.$Properties|null)
		templateButtonReplyMessage?: (waproto.Message.TemplateButtonReplyMessage.$Properties|null)
		productMessage?: (waproto.Message.ProductMessage.$Properties|null)
		deviceSentMessage?: (waproto.Message.DeviceSentMessage.$Properties|null)
		messageContextInfo?: (waproto.MessageContextInfo.$Properties|null)
		listMessage?: (waproto.Message.ListMessage.$Properties|null)
		viewOnceMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		orderMessage?: (waproto.Message.OrderMessage.$Properties|null)
		listResponseMessage?: (waproto.Message.ListResponseMessage.$Properties|null)
		ephemeralMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		invoiceMessage?: (waproto.Message.InvoiceMessage.$Properties|null)
		buttonsMessage?: (waproto.Message.ButtonsMessage.$Properties|null)
		buttonsResponseMessage?: (waproto.Message.ButtonsResponseMessage.$Properties|null)
		paymentInviteMessage?: (waproto.Message.PaymentInviteMessage.$Properties|null)
		interactiveMessage?: (waproto.Message.InteractiveMessage.$Properties|null)
		reactionMessage?: (waproto.Message.ReactionMessage.$Properties|null)
		stickerSyncRmrMessage?: (waproto.Message.StickerSyncRMRMessage.$Properties|null)
		interactiveResponseMessage?: (waproto.Message.InteractiveResponseMessage.$Properties|null)
		pollCreationMessage?: (waproto.Message.PollCreationMessage.$Properties|null)
		pollUpdateMessage?: (waproto.Message.PollUpdateMessage.$Properties|null)
		keepInChatMessage?: (waproto.Message.KeepInChatMessage.$Properties|null)
		documentWithCaptionMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		requestPhoneNumberMessage?: (waproto.Message.RequestPhoneNumberMessage.$Properties|null)
		viewOnceMessageV2?: (waproto.Message.FutureProofMessage.$Properties|null)
		encReactionMessage?: (waproto.Message.EncReactionMessage.$Properties|null)
		editedMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		viewOnceMessageV2Extension?: (waproto.Message.FutureProofMessage.$Properties|null)
		pollCreationMessageV2?: (waproto.Message.PollCreationMessage.$Properties|null)
		scheduledCallCreationMessage?: (waproto.Message.ScheduledCallCreationMessage.$Properties|null)
		groupMentionedMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		pinInChatMessage?: (waproto.Message.PinInChatMessage.$Properties|null)
		pollCreationMessageV3?: (waproto.Message.PollCreationMessage.$Properties|null)
		scheduledCallEditMessage?: (waproto.Message.ScheduledCallEditMessage.$Properties|null)
		ptvMessage?: (waproto.Message.VideoMessage.$Properties|null)
		botInvokeMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		callLogMesssage?: (waproto.Message.CallLogMessage.$Properties|null)
		messageHistoryBundle?: (waproto.Message.MessageHistoryBundle.$Properties|null)
		encCommentMessage?: (waproto.Message.EncCommentMessage.$Properties|null)
		bcallMessage?: (waproto.Message.BCallMessage.$Properties|null)
		lottieStickerMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		eventMessage?: (waproto.Message.EventMessage.$Properties|null)
		encEventResponseMessage?: (waproto.Message.EncEventResponseMessage.$Properties|null)
		commentMessage?: (waproto.Message.CommentMessage.$Properties|null)
		newsletterAdminInviteMessage?: (waproto.Message.NewsletterAdminInviteMessage.$Properties|null)
		placeholderMessage?: (waproto.Message.PlaceholderMessage.$Properties|null)
		secretEncryptedMessage?: (waproto.Message.SecretEncryptedMessage.$Properties|null)
		albumMessage?: (waproto.Message.AlbumMessage.$Properties|null)
		eventCoverImage?: (waproto.Message.FutureProofMessage.$Properties|null)
		stickerPackMessage?: (waproto.Message.StickerPackMessage.$Properties|null)
		statusMentionMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		pollResultSnapshotMessage?: (waproto.Message.PollResultSnapshotMessage.$Properties|null)
		pollCreationOptionImageMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		associatedChildMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		groupStatusMentionMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		pollCreationMessageV4?: (waproto.Message.FutureProofMessage.$Properties|null)
		statusAddYours?: (waproto.Message.FutureProofMessage.$Properties|null)
		groupStatusMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		richResponseMessage?: (waproto.AIRichResponseMessage.$Properties|null)
		statusNotificationMessage?: (waproto.Message.StatusNotificationMessage.$Properties|null)
		limitSharingMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		botTaskMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		questionMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		messageHistoryNotice?: (waproto.Message.MessageHistoryNotice.$Properties|null)
		groupStatusMessageV2?: (waproto.Message.FutureProofMessage.$Properties|null)
		botForwardedMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		statusQuestionAnswerMessage?: (waproto.Message.StatusQuestionAnswerMessage.$Properties|null)
		questionReplyMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		questionResponseMessage?: (waproto.Message.QuestionResponseMessage.$Properties|null)
		statusQuotedMessage?: (waproto.Message.StatusQuotedMessage.$Properties|null)
		statusStickerInteractionMessage?: (waproto.Message.StatusStickerInteractionMessage.$Properties|null)
		pollCreationMessageV5?: (waproto.Message.PollCreationMessage.$Properties|null)
		newsletterFollowerInviteMessageV2?: (waproto.Message.NewsletterFollowerInviteMessage.$Properties|null)
		pollResultSnapshotMessageV3?: (waproto.Message.PollResultSnapshotMessage.$Properties|null)
		newsletterAdminProfileMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		newsletterAdminProfileMessageV2?: (waproto.Message.FutureProofMessage.$Properties|null)
		spoilerMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		pollCreationMessageV6?: (waproto.Message.PollCreationMessage.$Properties|null)
		conditionalRevealMessage?: (waproto.Message.ConditionalRevealMessage.$Properties|null)
		pollAddOptionMessage?: (waproto.Message.PollAddOptionMessage.$Properties|null)
		eventInviteMessage?: (waproto.Message.EventInviteMessage.$Properties|null)
		groupRootKeyShare?: (waproto.GroupRootKeyShare.$Properties|null)
		paymentReminderMessage?: (waproto.Message.PaymentReminderMessage.$Properties|null)
		splitPaymentMessage?: (waproto.Message.SplitPaymentMessage.$Properties|null)
		newsletterAdminProfileStatusMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
		rootSecretDistributeMessage?: (waproto.Message.RootSecretDistributeMessage.$Properties|null)
		splitPaymentUpdateMessage?: (waproto.Message.SplitPaymentUpdateMessage.$Properties|null)
		static encode(m: waproto.Message.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message & waproto.Message.$Shape
	}
	namespace Message {
		interface $Properties {
			conversation?: (string|null)
			senderKeyDistributionMessage?: (waproto.Message.SenderKeyDistributionMessage.$Properties|null)
			imageMessage?: (waproto.Message.ImageMessage.$Properties|null)
			contactMessage?: (waproto.Message.ContactMessage.$Properties|null)
			locationMessage?: (waproto.Message.LocationMessage.$Properties|null)
			extendedTextMessage?: (waproto.Message.ExtendedTextMessage.$Properties|null)
			documentMessage?: (waproto.Message.DocumentMessage.$Properties|null)
			audioMessage?: (waproto.Message.AudioMessage.$Properties|null)
			videoMessage?: (waproto.Message.VideoMessage.$Properties|null)
			call?: (waproto.Message.Call.$Properties|null)
			chat?: (waproto.Message.Chat.$Properties|null)
			protocolMessage?: (waproto.Message.ProtocolMessage.$Properties|null)
			contactsArrayMessage?: (waproto.Message.ContactsArrayMessage.$Properties|null)
			highlyStructuredMessage?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
			fastRatchetKeySenderKeyDistributionMessage?: (waproto.Message.SenderKeyDistributionMessage.$Properties|null)
			sendPaymentMessage?: (waproto.Message.SendPaymentMessage.$Properties|null)
			liveLocationMessage?: (waproto.Message.LiveLocationMessage.$Properties|null)
			requestPaymentMessage?: (waproto.Message.RequestPaymentMessage.$Properties|null)
			declinePaymentRequestMessage?: (waproto.Message.DeclinePaymentRequestMessage.$Properties|null)
			cancelPaymentRequestMessage?: (waproto.Message.CancelPaymentRequestMessage.$Properties|null)
			templateMessage?: (waproto.Message.TemplateMessage.$Properties|null)
			stickerMessage?: (waproto.Message.StickerMessage.$Properties|null)
			groupInviteMessage?: (waproto.Message.GroupInviteMessage.$Properties|null)
			templateButtonReplyMessage?: (waproto.Message.TemplateButtonReplyMessage.$Properties|null)
			productMessage?: (waproto.Message.ProductMessage.$Properties|null)
			deviceSentMessage?: (waproto.Message.DeviceSentMessage.$Properties|null)
			messageContextInfo?: (waproto.MessageContextInfo.$Properties|null)
			listMessage?: (waproto.Message.ListMessage.$Properties|null)
			viewOnceMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			orderMessage?: (waproto.Message.OrderMessage.$Properties|null)
			listResponseMessage?: (waproto.Message.ListResponseMessage.$Properties|null)
			ephemeralMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			invoiceMessage?: (waproto.Message.InvoiceMessage.$Properties|null)
			buttonsMessage?: (waproto.Message.ButtonsMessage.$Properties|null)
			buttonsResponseMessage?: (waproto.Message.ButtonsResponseMessage.$Properties|null)
			paymentInviteMessage?: (waproto.Message.PaymentInviteMessage.$Properties|null)
			interactiveMessage?: (waproto.Message.InteractiveMessage.$Properties|null)
			reactionMessage?: (waproto.Message.ReactionMessage.$Properties|null)
			stickerSyncRmrMessage?: (waproto.Message.StickerSyncRMRMessage.$Properties|null)
			interactiveResponseMessage?: (waproto.Message.InteractiveResponseMessage.$Properties|null)
			pollCreationMessage?: (waproto.Message.PollCreationMessage.$Properties|null)
			pollUpdateMessage?: (waproto.Message.PollUpdateMessage.$Properties|null)
			keepInChatMessage?: (waproto.Message.KeepInChatMessage.$Properties|null)
			documentWithCaptionMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			requestPhoneNumberMessage?: (waproto.Message.RequestPhoneNumberMessage.$Properties|null)
			viewOnceMessageV2?: (waproto.Message.FutureProofMessage.$Properties|null)
			encReactionMessage?: (waproto.Message.EncReactionMessage.$Properties|null)
			editedMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			viewOnceMessageV2Extension?: (waproto.Message.FutureProofMessage.$Properties|null)
			pollCreationMessageV2?: (waproto.Message.PollCreationMessage.$Properties|null)
			scheduledCallCreationMessage?: (waproto.Message.ScheduledCallCreationMessage.$Properties|null)
			groupMentionedMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			pinInChatMessage?: (waproto.Message.PinInChatMessage.$Properties|null)
			pollCreationMessageV3?: (waproto.Message.PollCreationMessage.$Properties|null)
			scheduledCallEditMessage?: (waproto.Message.ScheduledCallEditMessage.$Properties|null)
			ptvMessage?: (waproto.Message.VideoMessage.$Properties|null)
			botInvokeMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			callLogMesssage?: (waproto.Message.CallLogMessage.$Properties|null)
			messageHistoryBundle?: (waproto.Message.MessageHistoryBundle.$Properties|null)
			encCommentMessage?: (waproto.Message.EncCommentMessage.$Properties|null)
			bcallMessage?: (waproto.Message.BCallMessage.$Properties|null)
			lottieStickerMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			eventMessage?: (waproto.Message.EventMessage.$Properties|null)
			encEventResponseMessage?: (waproto.Message.EncEventResponseMessage.$Properties|null)
			commentMessage?: (waproto.Message.CommentMessage.$Properties|null)
			newsletterAdminInviteMessage?: (waproto.Message.NewsletterAdminInviteMessage.$Properties|null)
			placeholderMessage?: (waproto.Message.PlaceholderMessage.$Properties|null)
			secretEncryptedMessage?: (waproto.Message.SecretEncryptedMessage.$Properties|null)
			albumMessage?: (waproto.Message.AlbumMessage.$Properties|null)
			eventCoverImage?: (waproto.Message.FutureProofMessage.$Properties|null)
			stickerPackMessage?: (waproto.Message.StickerPackMessage.$Properties|null)
			statusMentionMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			pollResultSnapshotMessage?: (waproto.Message.PollResultSnapshotMessage.$Properties|null)
			pollCreationOptionImageMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			associatedChildMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			groupStatusMentionMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			pollCreationMessageV4?: (waproto.Message.FutureProofMessage.$Properties|null)
			statusAddYours?: (waproto.Message.FutureProofMessage.$Properties|null)
			groupStatusMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			richResponseMessage?: (waproto.AIRichResponseMessage.$Properties|null)
			statusNotificationMessage?: (waproto.Message.StatusNotificationMessage.$Properties|null)
			limitSharingMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			botTaskMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			questionMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			messageHistoryNotice?: (waproto.Message.MessageHistoryNotice.$Properties|null)
			groupStatusMessageV2?: (waproto.Message.FutureProofMessage.$Properties|null)
			botForwardedMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			statusQuestionAnswerMessage?: (waproto.Message.StatusQuestionAnswerMessage.$Properties|null)
			questionReplyMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			questionResponseMessage?: (waproto.Message.QuestionResponseMessage.$Properties|null)
			statusQuotedMessage?: (waproto.Message.StatusQuotedMessage.$Properties|null)
			statusStickerInteractionMessage?: (waproto.Message.StatusStickerInteractionMessage.$Properties|null)
			pollCreationMessageV5?: (waproto.Message.PollCreationMessage.$Properties|null)
			newsletterFollowerInviteMessageV2?: (waproto.Message.NewsletterFollowerInviteMessage.$Properties|null)
			pollResultSnapshotMessageV3?: (waproto.Message.PollResultSnapshotMessage.$Properties|null)
			newsletterAdminProfileMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			newsletterAdminProfileMessageV2?: (waproto.Message.FutureProofMessage.$Properties|null)
			spoilerMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			pollCreationMessageV6?: (waproto.Message.PollCreationMessage.$Properties|null)
			conditionalRevealMessage?: (waproto.Message.ConditionalRevealMessage.$Properties|null)
			pollAddOptionMessage?: (waproto.Message.PollAddOptionMessage.$Properties|null)
			eventInviteMessage?: (waproto.Message.EventInviteMessage.$Properties|null)
			groupRootKeyShare?: (waproto.GroupRootKeyShare.$Properties|null)
			paymentReminderMessage?: (waproto.Message.PaymentReminderMessage.$Properties|null)
			splitPaymentMessage?: (waproto.Message.SplitPaymentMessage.$Properties|null)
			newsletterAdminProfileStatusMessage?: (waproto.Message.FutureProofMessage.$Properties|null)
			rootSecretDistributeMessage?: (waproto.Message.RootSecretDistributeMessage.$Properties|null)
			splitPaymentUpdateMessage?: (waproto.Message.SplitPaymentUpdateMessage.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Message.$Properties
		enum PollType {
			POLL = 0,
			QUIZ = 1
		}
		enum PollContentType {
			UNKNOWN = 0,
			TEXT = 1,
			IMAGE = 2
		}
		enum InsightDeliveryState {
			SENT = 0,
			DELIVERED = 1,
			READ = 2,
			REPLIED = 3,
			QUICK_REPLIED = 4
		}
		enum PeerDataOperationRequestType {
			UPLOAD_STICKER = 0,
			SEND_RECENT_STICKER_BOOTSTRAP = 1,
			GENERATE_LINK_PREVIEW = 2,
			HISTORY_SYNC_ON_DEMAND = 3,
			PLACEHOLDER_MESSAGE_RESEND = 4,
			WAFFLE_LINKING_NONCE_FETCH = 5,
			FULL_HISTORY_SYNC_ON_DEMAND = 6,
			COMPANION_META_NONCE_FETCH = 7,
			COMPANION_SYNCD_SNAPSHOT_FATAL_RECOVERY = 8,
			COMPANION_CANONICAL_USER_NONCE_FETCH = 9,
			HISTORY_SYNC_CHUNK_RETRY = 10,
			GALAXY_FLOW_ACTION = 11,
			BUSINESS_BROADCAST_INSIGHTS_DELIVERED_TO = 12,
			BUSINESS_BROADCAST_INSIGHTS_REFRESH = 13
		}
		enum HistorySyncType {
			INITIAL_BOOTSTRAP = 0,
			INITIAL_STATUS_V3 = 1,
			FULL = 2,
			RECENT = 3,
			PUSH_NAME = 4,
			NON_BLOCKING_DATA = 5,
			ON_DEMAND = 6,
			NO_HISTORY = 7,
			MESSAGE_ACCESS_STATUS = 8
		}
		interface IStickerPackMessage extends waproto.Message.StickerPackMessage.$Properties {
		}
		class StickerPackMessage {
			constructor(p?: waproto.Message.StickerPackMessage.$Properties)
			$unknowns?: Uint8Array[]
			stickerPackId?: (string|null)
			name?: (string|null)
			publisher?: (string|null)
			stickers: waproto.Message.StickerPackMessage.Sticker.$Properties[]
			fileLength?: (number|Long|null)
			fileSha256?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			mediaKey?: (Uint8Array|null)
			directPath?: (string|null)
			caption?: (string|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			packDescription?: (string|null)
			mediaKeyTimestamp?: (number|Long|null)
			trayIconFileName?: (string|null)
			thumbnailDirectPath?: (string|null)
			thumbnailSha256?: (Uint8Array|null)
			thumbnailEncSha256?: (Uint8Array|null)
			thumbnailHeight?: (number|null)
			thumbnailWidth?: (number|null)
			imageDataHash?: (string|null)
			stickerPackSize?: (number|Long|null)
			stickerPackOrigin?: (waproto.Message.StickerPackMessage.StickerPackOrigin|null)
			static encode(m: waproto.Message.StickerPackMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StickerPackMessage & waproto.Message.StickerPackMessage.$Shape
		}
		namespace StickerPackMessage {
			interface $Properties {
				stickerPackId?: (string|null)
				name?: (string|null)
				publisher?: (string|null)
				stickers?: (waproto.Message.StickerPackMessage.Sticker.$Properties[]|null)
				fileLength?: (number|Long|null)
				fileSha256?: (Uint8Array|null)
				fileEncSha256?: (Uint8Array|null)
				mediaKey?: (Uint8Array|null)
				directPath?: (string|null)
				caption?: (string|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				packDescription?: (string|null)
				mediaKeyTimestamp?: (number|Long|null)
				trayIconFileName?: (string|null)
				thumbnailDirectPath?: (string|null)
				thumbnailSha256?: (Uint8Array|null)
				thumbnailEncSha256?: (Uint8Array|null)
				thumbnailHeight?: (number|null)
				thumbnailWidth?: (number|null)
				imageDataHash?: (string|null)
				stickerPackSize?: (number|Long|null)
				stickerPackOrigin?: (waproto.Message.StickerPackMessage.StickerPackOrigin|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.StickerPackMessage.$Properties
			enum StickerPackOrigin {
				FIRST_PARTY = 0,
				THIRD_PARTY = 1,
				USER_CREATED = 2
			}
			interface ISticker extends waproto.Message.StickerPackMessage.Sticker.$Properties {
			}
			class Sticker {
				constructor(p?: waproto.Message.StickerPackMessage.Sticker.$Properties)
				$unknowns?: Uint8Array[]
				fileName?: (string|null)
				isAnimated?: (boolean|null)
				emojis: string[]
				accessibilityLabel?: (string|null)
				isLottie?: (boolean|null)
				mimetype?: (string|null)
				premium?: (number|null)
				static encode(m: waproto.Message.StickerPackMessage.Sticker.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StickerPackMessage.Sticker & waproto.Message.StickerPackMessage.Sticker.$Shape
			}
			namespace Sticker {
				interface $Properties {
					fileName?: (string|null)
					isAnimated?: (boolean|null)
					emojis?: (string[]|null)
					accessibilityLabel?: (string|null)
					isLottie?: (boolean|null)
					mimetype?: (string|null)
					premium?: (number|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.StickerPackMessage.Sticker.$Properties
			}
		}
		interface IAlbumMessage extends waproto.Message.AlbumMessage.$Properties {
		}
		class AlbumMessage {
			constructor(p?: waproto.Message.AlbumMessage.$Properties)
			$unknowns?: Uint8Array[]
			expectedImageCount?: (number|null)
			expectedVideoCount?: (number|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			static encode(m: waproto.Message.AlbumMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AlbumMessage & waproto.Message.AlbumMessage.$Shape
		}
		namespace AlbumMessage {
			interface $Properties {
				expectedImageCount?: (number|null)
				expectedVideoCount?: (number|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.AlbumMessage.$Properties
		}
		interface IPlaceholderMessage extends waproto.Message.PlaceholderMessage.$Properties {
		}
		class PlaceholderMessage {
			constructor(p?: waproto.Message.PlaceholderMessage.$Properties)
			$unknowns?: Uint8Array[]
			type?: (waproto.Message.PlaceholderMessage.PlaceholderType|null)
			static encode(m: waproto.Message.PlaceholderMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PlaceholderMessage & waproto.Message.PlaceholderMessage.$Shape
		}
		namespace PlaceholderMessage {
			interface $Properties {
				type?: (waproto.Message.PlaceholderMessage.PlaceholderType|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PlaceholderMessage.$Properties
			enum PlaceholderType {
				MASK_LINKED_DEVICES = 0
			}
		}
		interface IBCallMessage extends waproto.Message.BCallMessage.$Properties {
		}
		class BCallMessage {
			constructor(p?: waproto.Message.BCallMessage.$Properties)
			$unknowns?: Uint8Array[]
			sessionId?: (string|null)
			mediaType?: (waproto.Message.BCallMessage.MediaType|null)
			masterKey?: (Uint8Array|null)
			caption?: (string|null)
			static encode(m: waproto.Message.BCallMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.BCallMessage & waproto.Message.BCallMessage.$Shape
		}
		namespace BCallMessage {
			interface $Properties {
				sessionId?: (string|null)
				mediaType?: (waproto.Message.BCallMessage.MediaType|null)
				masterKey?: (Uint8Array|null)
				caption?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.BCallMessage.$Properties
			enum MediaType {
				UNKNOWN = 0,
				AUDIO = 1,
				VIDEO = 2
			}
		}
		interface IMessageHistoryMetadata extends waproto.Message.MessageHistoryMetadata.$Properties {
		}
		class MessageHistoryMetadata {
			constructor(p?: waproto.Message.MessageHistoryMetadata.$Properties)
			$unknowns?: Uint8Array[]
			historyReceivers: string[]
			oldestMessageTimestampInWindow?: (number|Long|null)
			messageCount?: (number|Long|null)
			nonHistoryReceivers: string[]
			oldestMessageTimestampInBundle?: (number|Long|null)
			static encode(m: waproto.Message.MessageHistoryMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.MessageHistoryMetadata & waproto.Message.MessageHistoryMetadata.$Shape
		}
		namespace MessageHistoryMetadata {
			interface $Properties {
				historyReceivers?: (string[]|null)
				oldestMessageTimestampInWindow?: (number|Long|null)
				messageCount?: (number|Long|null)
				nonHistoryReceivers?: (string[]|null)
				oldestMessageTimestampInBundle?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.MessageHistoryMetadata.$Properties
		}
		interface IHistoryShareMessageEntry extends waproto.Message.HistoryShareMessageEntry.$Properties {
		}
		class HistoryShareMessageEntry {
			constructor(p?: waproto.Message.HistoryShareMessageEntry.$Properties)
			$unknowns?: Uint8Array[]
			stanzaId?: (string|null)
			messageSecretProof?: (Uint8Array|null)
			static encode(m: waproto.Message.HistoryShareMessageEntry.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HistoryShareMessageEntry & waproto.Message.HistoryShareMessageEntry.$Shape
		}
		namespace HistoryShareMessageEntry {
			interface $Properties {
				stanzaId?: (string|null)
				messageSecretProof?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.HistoryShareMessageEntry.$Properties
		}
		interface IBotHistoryShareSyncMetadata extends waproto.Message.BotHistoryShareSyncMetadata.$Properties {
		}
		class BotHistoryShareSyncMetadata {
			constructor(p?: waproto.Message.BotHistoryShareSyncMetadata.$Properties)
			$unknowns?: Uint8Array[]
			botJid?: (string|null)
			historyShareCutoffTimestamp?: (number|Long|null)
			historyShareMessages: waproto.Message.HistoryShareMessageEntry.$Properties[]
			static encode(m: waproto.Message.BotHistoryShareSyncMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.BotHistoryShareSyncMetadata & waproto.Message.BotHistoryShareSyncMetadata.$Shape
		}
		namespace BotHistoryShareSyncMetadata {
			interface $Properties {
				botJid?: (string|null)
				historyShareCutoffTimestamp?: (number|Long|null)
				historyShareMessages?: (waproto.Message.HistoryShareMessageEntry.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.BotHistoryShareSyncMetadata.$Properties
		}
		interface IMessageHistoryNotice extends waproto.Message.MessageHistoryNotice.$Properties {
		}
		class MessageHistoryNotice {
			constructor(p?: waproto.Message.MessageHistoryNotice.$Properties)
			$unknowns?: Uint8Array[]
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			messageHistoryMetadata?: (waproto.Message.MessageHistoryMetadata.$Properties|null)
			botHistoryShareSyncMetadata?: (waproto.Message.BotHistoryShareSyncMetadata.$Properties|null)
			static encode(m: waproto.Message.MessageHistoryNotice.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.MessageHistoryNotice & waproto.Message.MessageHistoryNotice.$Shape
		}
		namespace MessageHistoryNotice {
			interface $Properties {
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				messageHistoryMetadata?: (waproto.Message.MessageHistoryMetadata.$Properties|null)
				botHistoryShareSyncMetadata?: (waproto.Message.BotHistoryShareSyncMetadata.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.MessageHistoryNotice.$Properties
		}
		interface IMessageHistoryBundle extends waproto.Message.MessageHistoryBundle.$Properties {
		}
		class MessageHistoryBundle {
			constructor(p?: waproto.Message.MessageHistoryBundle.$Properties)
			$unknowns?: Uint8Array[]
			mimetype?: (string|null)
			fileSha256?: (Uint8Array|null)
			mediaKey?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			directPath?: (string|null)
			mediaKeyTimestamp?: (number|Long|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			messageHistoryMetadata?: (waproto.Message.MessageHistoryMetadata.$Properties|null)
			static encode(m: waproto.Message.MessageHistoryBundle.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.MessageHistoryBundle & waproto.Message.MessageHistoryBundle.$Shape
		}
		namespace MessageHistoryBundle {
			interface $Properties {
				mimetype?: (string|null)
				fileSha256?: (Uint8Array|null)
				mediaKey?: (Uint8Array|null)
				fileEncSha256?: (Uint8Array|null)
				directPath?: (string|null)
				mediaKeyTimestamp?: (number|Long|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				messageHistoryMetadata?: (waproto.Message.MessageHistoryMetadata.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.MessageHistoryBundle.$Properties
		}
		interface ICallLogMessage extends waproto.Message.CallLogMessage.$Properties {
		}
		class CallLogMessage {
			constructor(p?: waproto.Message.CallLogMessage.$Properties)
			$unknowns?: Uint8Array[]
			isVideo?: (boolean|null)
			callOutcome?: (waproto.Message.CallLogMessage.CallOutcome|null)
			durationSecs?: (number|Long|null)
			callType?: (waproto.Message.CallLogMessage.CallType|null)
			participants: waproto.Message.CallLogMessage.CallParticipant.$Properties[]
			static encode(m: waproto.Message.CallLogMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.CallLogMessage & waproto.Message.CallLogMessage.$Shape
		}
		namespace CallLogMessage {
			interface $Properties {
				isVideo?: (boolean|null)
				callOutcome?: (waproto.Message.CallLogMessage.CallOutcome|null)
				durationSecs?: (number|Long|null)
				callType?: (waproto.Message.CallLogMessage.CallType|null)
				participants?: (waproto.Message.CallLogMessage.CallParticipant.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.CallLogMessage.$Properties
			enum CallOutcome {
				CONNECTED = 0,
				MISSED = 1,
				FAILED = 2,
				REJECTED = 3,
				ACCEPTED_ELSEWHERE = 4,
				ONGOING = 5,
				SILENCED_BY_DND = 6,
				SILENCED_UNKNOWN_CALLER = 7
			}
			enum CallType {
				REGULAR = 0,
				SCHEDULED_CALL = 1,
				VOICE_CHAT = 2
			}
			interface ICallParticipant extends waproto.Message.CallLogMessage.CallParticipant.$Properties {
			}
			class CallParticipant {
				constructor(p?: waproto.Message.CallLogMessage.CallParticipant.$Properties)
				$unknowns?: Uint8Array[]
				jid?: (string|null)
				callOutcome?: (waproto.Message.CallLogMessage.CallOutcome|null)
				static encode(m: waproto.Message.CallLogMessage.CallParticipant.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.CallLogMessage.CallParticipant & waproto.Message.CallLogMessage.CallParticipant.$Shape
			}
			namespace CallParticipant {
				interface $Properties {
					jid?: (string|null)
					callOutcome?: (waproto.Message.CallLogMessage.CallOutcome|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.CallLogMessage.CallParticipant.$Properties
			}
		}
		interface IScheduledCallEditMessage extends waproto.Message.ScheduledCallEditMessage.$Properties {
		}
		class ScheduledCallEditMessage {
			constructor(p?: waproto.Message.ScheduledCallEditMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			editType?: (waproto.Message.ScheduledCallEditMessage.EditType|null)
			static encode(m: waproto.Message.ScheduledCallEditMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ScheduledCallEditMessage & waproto.Message.ScheduledCallEditMessage.$Shape
		}
		namespace ScheduledCallEditMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				editType?: (waproto.Message.ScheduledCallEditMessage.EditType|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ScheduledCallEditMessage.$Properties
			enum EditType {
				UNKNOWN = 0,
				CANCEL = 1
			}
		}
		interface IScheduledCallCreationMessage extends waproto.Message.ScheduledCallCreationMessage.$Properties {
		}
		class ScheduledCallCreationMessage {
			constructor(p?: waproto.Message.ScheduledCallCreationMessage.$Properties)
			$unknowns?: Uint8Array[]
			scheduledTimestampMs?: (number|Long|null)
			callType?: (waproto.Message.ScheduledCallCreationMessage.CallType|null)
			title?: (string|null)
			static encode(m: waproto.Message.ScheduledCallCreationMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ScheduledCallCreationMessage & waproto.Message.ScheduledCallCreationMessage.$Shape
		}
		namespace ScheduledCallCreationMessage {
			interface $Properties {
				scheduledTimestampMs?: (number|Long|null)
				callType?: (waproto.Message.ScheduledCallCreationMessage.CallType|null)
				title?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ScheduledCallCreationMessage.$Properties
			enum CallType {
				UNKNOWN = 0,
				VOICE = 1,
				VIDEO = 2
			}
		}
		interface IEventResponseMessage extends waproto.Message.EventResponseMessage.$Properties {
		}
		class EventResponseMessage {
			constructor(p?: waproto.Message.EventResponseMessage.$Properties)
			$unknowns?: Uint8Array[]
			response?: (waproto.Message.EventResponseMessage.EventResponseType|null)
			timestampMs?: (number|Long|null)
			extraGuestCount?: (number|null)
			static encode(m: waproto.Message.EventResponseMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.EventResponseMessage & waproto.Message.EventResponseMessage.$Shape
		}
		namespace EventResponseMessage {
			interface $Properties {
				response?: (waproto.Message.EventResponseMessage.EventResponseType|null)
				timestampMs?: (number|Long|null)
				extraGuestCount?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.EventResponseMessage.$Properties
			enum EventResponseType {
				UNKNOWN = 0,
				GOING = 1,
				NOT_GOING = 2,
				MAYBE = 3
			}
		}
		interface IEncEventResponseMessage extends waproto.Message.EncEventResponseMessage.$Properties {
		}
		class EncEventResponseMessage {
			constructor(p?: waproto.Message.EncEventResponseMessage.$Properties)
			$unknowns?: Uint8Array[]
			eventCreationMessageKey?: (waproto.MessageKey.$Properties|null)
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
			static encode(m: waproto.Message.EncEventResponseMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.EncEventResponseMessage & waproto.Message.EncEventResponseMessage.$Shape
		}
		namespace EncEventResponseMessage {
			interface $Properties {
				eventCreationMessageKey?: (waproto.MessageKey.$Properties|null)
				encPayload?: (Uint8Array|null)
				encIv?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.EncEventResponseMessage.$Properties
		}
		interface IEventMessage extends waproto.Message.EventMessage.$Properties {
		}
		class EventMessage {
			constructor(p?: waproto.Message.EventMessage.$Properties)
			$unknowns?: Uint8Array[]
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			isCanceled?: (boolean|null)
			name?: (string|null)
			description?: (string|null)
			location?: (waproto.Message.LocationMessage.$Properties|null)
			joinLink?: (string|null)
			startTime?: (number|Long|null)
			endTime?: (number|Long|null)
			extraGuestsAllowed?: (boolean|null)
			isScheduleCall?: (boolean|null)
			hasReminder?: (boolean|null)
			reminderOffsetSec?: (number|Long|null)
			static encode(m: waproto.Message.EventMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.EventMessage & waproto.Message.EventMessage.$Shape
		}
		namespace EventMessage {
			interface $Properties {
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				isCanceled?: (boolean|null)
				name?: (string|null)
				description?: (string|null)
				location?: (waproto.Message.LocationMessage.$Properties|null)
				joinLink?: (string|null)
				startTime?: (number|Long|null)
				endTime?: (number|Long|null)
				extraGuestsAllowed?: (boolean|null)
				isScheduleCall?: (boolean|null)
				hasReminder?: (boolean|null)
				reminderOffsetSec?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.EventMessage.$Properties
		}
		interface ICommentMessage extends waproto.Message.CommentMessage.$Properties {
		}
		class CommentMessage {
			constructor(p?: waproto.Message.CommentMessage.$Properties)
			$unknowns?: Uint8Array[]
			message?: (waproto.Message.$Properties|null)
			targetMessageKey?: (waproto.MessageKey.$Properties|null)
			static encode(m: waproto.Message.CommentMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.CommentMessage & waproto.Message.CommentMessage.$Shape
		}
		namespace CommentMessage {
			interface $Properties {
				message?: (waproto.Message.$Properties|null)
				targetMessageKey?: (waproto.MessageKey.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.CommentMessage.$Properties
		}
		interface IEncCommentMessage extends waproto.Message.EncCommentMessage.$Properties {
		}
		class EncCommentMessage {
			constructor(p?: waproto.Message.EncCommentMessage.$Properties)
			$unknowns?: Uint8Array[]
			targetMessageKey?: (waproto.MessageKey.$Properties|null)
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
			static encode(m: waproto.Message.EncCommentMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.EncCommentMessage & waproto.Message.EncCommentMessage.$Shape
		}
		namespace EncCommentMessage {
			interface $Properties {
				targetMessageKey?: (waproto.MessageKey.$Properties|null)
				encPayload?: (Uint8Array|null)
				encIv?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.EncCommentMessage.$Properties
		}
		interface IEncReactionMessage extends waproto.Message.EncReactionMessage.$Properties {
		}
		class EncReactionMessage {
			constructor(p?: waproto.Message.EncReactionMessage.$Properties)
			$unknowns?: Uint8Array[]
			targetMessageKey?: (waproto.MessageKey.$Properties|null)
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
			static encode(m: waproto.Message.EncReactionMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.EncReactionMessage & waproto.Message.EncReactionMessage.$Shape
		}
		namespace EncReactionMessage {
			interface $Properties {
				targetMessageKey?: (waproto.MessageKey.$Properties|null)
				encPayload?: (Uint8Array|null)
				encIv?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.EncReactionMessage.$Properties
		}
		interface IPinInChatMessage extends waproto.Message.PinInChatMessage.$Properties {
		}
		class PinInChatMessage {
			constructor(p?: waproto.Message.PinInChatMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			type?: (waproto.Message.PinInChatMessage.Type|null)
			senderTimestampMs?: (number|Long|null)
			static encode(m: waproto.Message.PinInChatMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PinInChatMessage & waproto.Message.PinInChatMessage.$Shape
		}
		namespace PinInChatMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				type?: (waproto.Message.PinInChatMessage.Type|null)
				senderTimestampMs?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PinInChatMessage.$Properties
			enum Type {
				UNKNOWN_TYPE = 0,
				PIN_FOR_ALL = 1,
				UNPIN_FOR_ALL = 2
			}
		}
		interface IKeepInChatMessage extends waproto.Message.KeepInChatMessage.$Properties {
		}
		class KeepInChatMessage {
			constructor(p?: waproto.Message.KeepInChatMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			keepType?: (waproto.KeepType|null)
			timestampMs?: (number|Long|null)
			static encode(m: waproto.Message.KeepInChatMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.KeepInChatMessage & waproto.Message.KeepInChatMessage.$Shape
		}
		namespace KeepInChatMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				keepType?: (waproto.KeepType|null)
				timestampMs?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.KeepInChatMessage.$Properties
		}
		interface IQuestionResponseMessage extends waproto.Message.QuestionResponseMessage.$Properties {
		}
		class QuestionResponseMessage {
			constructor(p?: waproto.Message.QuestionResponseMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			text?: (string|null)
			static encode(m: waproto.Message.QuestionResponseMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.QuestionResponseMessage & waproto.Message.QuestionResponseMessage.$Shape
		}
		namespace QuestionResponseMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				text?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.QuestionResponseMessage.$Properties
		}
		interface IStatusStickerInteractionMessage extends waproto.Message.StatusStickerInteractionMessage.$Properties {
		}
		class StatusStickerInteractionMessage {
			constructor(p?: waproto.Message.StatusStickerInteractionMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			stickerKey?: (string|null)
			type?: (waproto.Message.StatusStickerInteractionMessage.StatusStickerType|null)
			static encode(m: waproto.Message.StatusStickerInteractionMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StatusStickerInteractionMessage & waproto.Message.StatusStickerInteractionMessage.$Shape
		}
		namespace StatusStickerInteractionMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				stickerKey?: (string|null)
				type?: (waproto.Message.StatusStickerInteractionMessage.StatusStickerType|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.StatusStickerInteractionMessage.$Properties
			enum StatusStickerType {
				UNKNOWN = 0,
				REACTION = 1
			}
		}
		interface IStatusQuestionAnswerMessage extends waproto.Message.StatusQuestionAnswerMessage.$Properties {
		}
		class StatusQuestionAnswerMessage {
			constructor(p?: waproto.Message.StatusQuestionAnswerMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			text?: (string|null)
			static encode(m: waproto.Message.StatusQuestionAnswerMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StatusQuestionAnswerMessage & waproto.Message.StatusQuestionAnswerMessage.$Shape
		}
		namespace StatusQuestionAnswerMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				text?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.StatusQuestionAnswerMessage.$Properties
		}
		interface IPollResultSnapshotMessage extends waproto.Message.PollResultSnapshotMessage.$Properties {
		}
		class PollResultSnapshotMessage {
			constructor(p?: waproto.Message.PollResultSnapshotMessage.$Properties)
			$unknowns?: Uint8Array[]
			name?: (string|null)
			pollVotes: waproto.Message.PollResultSnapshotMessage.PollVote.$Properties[]
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			pollType?: (waproto.Message.PollType|null)
			static encode(m: waproto.Message.PollResultSnapshotMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollResultSnapshotMessage & waproto.Message.PollResultSnapshotMessage.$Shape
		}
		namespace PollResultSnapshotMessage {
			interface $Properties {
				name?: (string|null)
				pollVotes?: (waproto.Message.PollResultSnapshotMessage.PollVote.$Properties[]|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				pollType?: (waproto.Message.PollType|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PollResultSnapshotMessage.$Properties
			interface IPollVote extends waproto.Message.PollResultSnapshotMessage.PollVote.$Properties {
			}
			class PollVote {
				constructor(p?: waproto.Message.PollResultSnapshotMessage.PollVote.$Properties)
				$unknowns?: Uint8Array[]
				optionName?: (string|null)
				optionVoteCount?: (number|Long|null)
				static encode(m: waproto.Message.PollResultSnapshotMessage.PollVote.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollResultSnapshotMessage.PollVote & waproto.Message.PollResultSnapshotMessage.PollVote.$Shape
			}
			namespace PollVote {
				interface $Properties {
					optionName?: (string|null)
					optionVoteCount?: (number|Long|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PollResultSnapshotMessage.PollVote.$Properties
			}
		}
		interface IPollAddOptionMessage extends waproto.Message.PollAddOptionMessage.$Properties {
		}
		class PollAddOptionMessage {
			constructor(p?: waproto.Message.PollAddOptionMessage.$Properties)
			$unknowns?: Uint8Array[]
			pollCreationMessageKey?: (waproto.MessageKey.$Properties|null)
			addOption?: (waproto.Message.PollCreationMessage.Option.$Properties|null)
			metadata?: (waproto.Message.PollUpdateMessageMetadata.$Properties|null)
			static encode(m: waproto.Message.PollAddOptionMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollAddOptionMessage & waproto.Message.PollAddOptionMessage.$Shape
		}
		namespace PollAddOptionMessage {
			interface $Properties {
				pollCreationMessageKey?: (waproto.MessageKey.$Properties|null)
				addOption?: (waproto.Message.PollCreationMessage.Option.$Properties|null)
				metadata?: (waproto.Message.PollUpdateMessageMetadata.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PollAddOptionMessage.$Properties
		}
		interface IPollVoteMessage extends waproto.Message.PollVoteMessage.$Properties {
		}
		class PollVoteMessage {
			constructor(p?: waproto.Message.PollVoteMessage.$Properties)
			$unknowns?: Uint8Array[]
			selectedOptions: Uint8Array[]
			static encode(m: waproto.Message.PollVoteMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollVoteMessage & waproto.Message.PollVoteMessage.$Shape
		}
		namespace PollVoteMessage {
			interface $Properties {
				selectedOptions?: (Uint8Array[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PollVoteMessage.$Properties
		}
		interface IPollEncValue extends waproto.Message.PollEncValue.$Properties {
		}
		class PollEncValue {
			constructor(p?: waproto.Message.PollEncValue.$Properties)
			$unknowns?: Uint8Array[]
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
			static encode(m: waproto.Message.PollEncValue.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollEncValue & waproto.Message.PollEncValue.$Shape
		}
		namespace PollEncValue {
			interface $Properties {
				encPayload?: (Uint8Array|null)
				encIv?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PollEncValue.$Properties
		}
		interface IPollUpdateMessageMetadata extends waproto.Message.PollUpdateMessageMetadata.$Properties {
		}
		class PollUpdateMessageMetadata {
			constructor(p?: waproto.Message.PollUpdateMessageMetadata.$Properties)
			$unknowns?: Uint8Array[]
			pollNameHash?: (Uint8Array|null)
			lastEditStanzaId?: (string|null)
			static encode(m: waproto.Message.PollUpdateMessageMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollUpdateMessageMetadata & waproto.Message.PollUpdateMessageMetadata.$Shape
		}
		namespace PollUpdateMessageMetadata {
			interface $Properties {
				pollNameHash?: (Uint8Array|null)
				lastEditStanzaId?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PollUpdateMessageMetadata.$Properties
		}
		interface IPollUpdateMessage extends waproto.Message.PollUpdateMessage.$Properties {
		}
		class PollUpdateMessage {
			constructor(p?: waproto.Message.PollUpdateMessage.$Properties)
			$unknowns?: Uint8Array[]
			pollCreationMessageKey?: (waproto.MessageKey.$Properties|null)
			vote?: (waproto.Message.PollEncValue.$Properties|null)
			metadata?: (waproto.Message.PollUpdateMessageMetadata.$Properties|null)
			senderTimestampMs?: (number|Long|null)
			static encode(m: waproto.Message.PollUpdateMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollUpdateMessage & waproto.Message.PollUpdateMessage.$Shape
		}
		namespace PollUpdateMessage {
			interface $Properties {
				pollCreationMessageKey?: (waproto.MessageKey.$Properties|null)
				vote?: (waproto.Message.PollEncValue.$Properties|null)
				metadata?: (waproto.Message.PollUpdateMessageMetadata.$Properties|null)
				senderTimestampMs?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PollUpdateMessage.$Properties
		}
		interface IPollCreationMessage extends waproto.Message.PollCreationMessage.$Properties {
		}
		class PollCreationMessage {
			constructor(p?: waproto.Message.PollCreationMessage.$Properties)
			$unknowns?: Uint8Array[]
			encKey?: (Uint8Array|null)
			name?: (string|null)
			options: waproto.Message.PollCreationMessage.Option.$Properties[]
			selectableOptionsCount?: (number|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			pollContentType?: (waproto.Message.PollContentType|null)
			pollType?: (waproto.Message.PollType|null)
			correctAnswer?: (waproto.Message.PollCreationMessage.Option.$Properties|null)
			endTime?: (number|Long|null)
			hideParticipantName?: (boolean|null)
			allowAddOption?: (boolean|null)
			static encode(m: waproto.Message.PollCreationMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollCreationMessage & waproto.Message.PollCreationMessage.$Shape
		}
		namespace PollCreationMessage {
			interface $Properties {
				encKey?: (Uint8Array|null)
				name?: (string|null)
				options?: (waproto.Message.PollCreationMessage.Option.$Properties[]|null)
				selectableOptionsCount?: (number|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				pollContentType?: (waproto.Message.PollContentType|null)
				pollType?: (waproto.Message.PollType|null)
				correctAnswer?: (waproto.Message.PollCreationMessage.Option.$Properties|null)
				endTime?: (number|Long|null)
				hideParticipantName?: (boolean|null)
				allowAddOption?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PollCreationMessage.$Properties
			interface IOption extends waproto.Message.PollCreationMessage.Option.$Properties {
			}
			class Option {
				constructor(p?: waproto.Message.PollCreationMessage.Option.$Properties)
				$unknowns?: Uint8Array[]
				optionName?: (string|null)
				optionHash?: (string|null)
				static encode(m: waproto.Message.PollCreationMessage.Option.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollCreationMessage.Option & waproto.Message.PollCreationMessage.Option.$Shape
			}
			namespace Option {
				interface $Properties {
					optionName?: (string|null)
					optionHash?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PollCreationMessage.Option.$Properties
			}
		}
		interface IStickerSyncRMRMessage extends waproto.Message.StickerSyncRMRMessage.$Properties {
		}
		class StickerSyncRMRMessage {
			constructor(p?: waproto.Message.StickerSyncRMRMessage.$Properties)
			$unknowns?: Uint8Array[]
			filehash: string[]
			rmrSource?: (string|null)
			requestTimestamp?: (number|Long|null)
			static encode(m: waproto.Message.StickerSyncRMRMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StickerSyncRMRMessage & waproto.Message.StickerSyncRMRMessage.$Shape
		}
		namespace StickerSyncRMRMessage {
			interface $Properties {
				filehash?: (string[]|null)
				rmrSource?: (string|null)
				requestTimestamp?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.StickerSyncRMRMessage.$Properties
		}
		interface IReactionMessage extends waproto.Message.ReactionMessage.$Properties {
		}
		class ReactionMessage {
			constructor(p?: waproto.Message.ReactionMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			text?: (string|null)
			groupingKey?: (string|null)
			senderTimestampMs?: (number|Long|null)
			static encode(m: waproto.Message.ReactionMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ReactionMessage & waproto.Message.ReactionMessage.$Shape
		}
		namespace ReactionMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				text?: (string|null)
				groupingKey?: (string|null)
				senderTimestampMs?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ReactionMessage.$Properties
		}
		interface IButtonsResponseMessage extends waproto.Message.ButtonsResponseMessage.$Properties {
		}
		class ButtonsResponseMessage {
			constructor(p?: waproto.Message.ButtonsResponseMessage.$Properties)
			$unknowns?: Uint8Array[]
			selectedButtonId?: (string|null)
			selectedDisplayText?: (string|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			type?: (waproto.Message.ButtonsResponseMessage.Type|null)
			static encode(m: waproto.Message.ButtonsResponseMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ButtonsResponseMessage & waproto.Message.ButtonsResponseMessage.$Shape
		}
		namespace ButtonsResponseMessage {
			interface $Properties {
				selectedButtonId?: (string|null)
				selectedDisplayText?: (string|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				type?: (waproto.Message.ButtonsResponseMessage.Type|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ButtonsResponseMessage.$Properties
			enum Type {
				UNKNOWN = 0,
				DISPLAY_TEXT = 1
			}
		}
		interface IButtonsMessage extends waproto.Message.ButtonsMessage.$Properties {
		}
		class ButtonsMessage {
			constructor(p?: waproto.Message.ButtonsMessage.$Properties)
			$unknowns?: Uint8Array[]
			text?: (string|null)
			documentMessage?: (waproto.Message.DocumentMessage.$Properties|null)
			imageMessage?: (waproto.Message.ImageMessage.$Properties|null)
			videoMessage?: (waproto.Message.VideoMessage.$Properties|null)
			locationMessage?: (waproto.Message.LocationMessage.$Properties|null)
			contentText?: (string|null)
			footerText?: (string|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			buttons: waproto.Message.ButtonsMessage.Button.$Properties[]
			headerType?: (waproto.Message.ButtonsMessage.HeaderType|null)
			static encode(m: waproto.Message.ButtonsMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ButtonsMessage & waproto.Message.ButtonsMessage.$Shape
		}
		namespace ButtonsMessage {
			interface $Properties {
				text?: (string|null)
				documentMessage?: (waproto.Message.DocumentMessage.$Properties|null)
				imageMessage?: (waproto.Message.ImageMessage.$Properties|null)
				videoMessage?: (waproto.Message.VideoMessage.$Properties|null)
				locationMessage?: (waproto.Message.LocationMessage.$Properties|null)
				contentText?: (string|null)
				footerText?: (string|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				buttons?: (waproto.Message.ButtonsMessage.Button.$Properties[]|null)
				headerType?: (waproto.Message.ButtonsMessage.HeaderType|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ButtonsMessage.$Properties
			enum HeaderType {
				UNKNOWN = 0,
				EMPTY = 1,
				TEXT = 2,
				DOCUMENT = 3,
				IMAGE = 4,
				VIDEO = 5,
				LOCATION = 6
			}
			interface IButton extends waproto.Message.ButtonsMessage.Button.$Properties {
			}
			class Button {
				constructor(p?: waproto.Message.ButtonsMessage.Button.$Properties)
				$unknowns?: Uint8Array[]
				buttonId?: (string|null)
				buttonText?: (waproto.Message.ButtonsMessage.Button.ButtonText.$Properties|null)
				type?: (waproto.Message.ButtonsMessage.Button.Type|null)
				nativeFlowInfo?: (waproto.Message.ButtonsMessage.Button.NativeFlowInfo.$Properties|null)
				static encode(m: waproto.Message.ButtonsMessage.Button.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ButtonsMessage.Button & waproto.Message.ButtonsMessage.Button.$Shape
			}
			namespace Button {
				interface $Properties {
					buttonId?: (string|null)
					buttonText?: (waproto.Message.ButtonsMessage.Button.ButtonText.$Properties|null)
					type?: (waproto.Message.ButtonsMessage.Button.Type|null)
					nativeFlowInfo?: (waproto.Message.ButtonsMessage.Button.NativeFlowInfo.$Properties|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.ButtonsMessage.Button.$Properties
				enum Type {
					UNKNOWN = 0,
					RESPONSE = 1,
					NATIVE_FLOW = 2
				}
				interface INativeFlowInfo extends waproto.Message.ButtonsMessage.Button.NativeFlowInfo.$Properties {
				}
				class NativeFlowInfo {
					constructor(p?: waproto.Message.ButtonsMessage.Button.NativeFlowInfo.$Properties)
					$unknowns?: Uint8Array[]
					name?: (string|null)
					paramsJson?: (string|null)
					static encode(m: waproto.Message.ButtonsMessage.Button.NativeFlowInfo.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ButtonsMessage.Button.NativeFlowInfo & waproto.Message.ButtonsMessage.Button.NativeFlowInfo.$Shape
				}
				namespace NativeFlowInfo {
					interface $Properties {
						name?: (string|null)
						paramsJson?: (string|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.ButtonsMessage.Button.NativeFlowInfo.$Properties
				}
				interface IButtonText extends waproto.Message.ButtonsMessage.Button.ButtonText.$Properties {
				}
				class ButtonText {
					constructor(p?: waproto.Message.ButtonsMessage.Button.ButtonText.$Properties)
					$unknowns?: Uint8Array[]
					displayText?: (string|null)
					static encode(m: waproto.Message.ButtonsMessage.Button.ButtonText.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ButtonsMessage.Button.ButtonText & waproto.Message.ButtonsMessage.Button.ButtonText.$Shape
				}
				namespace ButtonText {
					interface $Properties {
						displayText?: (string|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.ButtonsMessage.Button.ButtonText.$Properties
				}
			}
		}
		interface IConditionalRevealMessage extends waproto.Message.ConditionalRevealMessage.$Properties {
		}
		class ConditionalRevealMessage {
			constructor(p?: waproto.Message.ConditionalRevealMessage.$Properties)
			$unknowns?: Uint8Array[]
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
			conditionalRevealMessageType?: (waproto.Message.ConditionalRevealMessage.ConditionalRevealMessageType|null)
			revealKeyId?: (string|null)
			static encode(m: waproto.Message.ConditionalRevealMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ConditionalRevealMessage & waproto.Message.ConditionalRevealMessage.$Shape
		}
		namespace ConditionalRevealMessage {
			interface $Properties {
				encPayload?: (Uint8Array|null)
				encIv?: (Uint8Array|null)
				conditionalRevealMessageType?: (waproto.Message.ConditionalRevealMessage.ConditionalRevealMessageType|null)
				revealKeyId?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ConditionalRevealMessage.$Properties
			enum ConditionalRevealMessageType {
				UNKNOWN = 0,
				SCHEDULED_MESSAGE = 1
			}
		}
		interface ISecretEncryptedMessage extends waproto.Message.SecretEncryptedMessage.$Properties {
		}
		class SecretEncryptedMessage {
			constructor(p?: waproto.Message.SecretEncryptedMessage.$Properties)
			$unknowns?: Uint8Array[]
			targetMessageKey?: (waproto.MessageKey.$Properties|null)
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
			secretEncType?: (waproto.Message.SecretEncryptedMessage.SecretEncType|null)
			remoteKeyId?: (string|null)
			static encode(m: waproto.Message.SecretEncryptedMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.SecretEncryptedMessage & waproto.Message.SecretEncryptedMessage.$Shape
		}
		namespace SecretEncryptedMessage {
			interface $Properties {
				targetMessageKey?: (waproto.MessageKey.$Properties|null)
				encPayload?: (Uint8Array|null)
				encIv?: (Uint8Array|null)
				secretEncType?: (waproto.Message.SecretEncryptedMessage.SecretEncType|null)
				remoteKeyId?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.SecretEncryptedMessage.$Properties
			enum SecretEncType {
				UNKNOWN = 0,
				EVENT_EDIT = 1,
				MESSAGE_EDIT = 2,
				MESSAGE_SCHEDULE = 3,
				POLL_EDIT = 4,
				POLL_ADD_OPTION = 5
			}
		}
		interface IFutureProofMessage extends waproto.Message.FutureProofMessage.$Properties {
		}
		class FutureProofMessage {
			constructor(p?: waproto.Message.FutureProofMessage.$Properties)
			$unknowns?: Uint8Array[]
			message?: (waproto.Message.$Properties|null)
			static encode(m: waproto.Message.FutureProofMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.FutureProofMessage & waproto.Message.FutureProofMessage.$Shape
		}
		namespace FutureProofMessage {
			interface $Properties {
				message?: (waproto.Message.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.FutureProofMessage.$Properties
		}
		interface IDeviceSentMessage extends waproto.Message.DeviceSentMessage.$Properties {
		}
		class DeviceSentMessage {
			constructor(p?: waproto.Message.DeviceSentMessage.$Properties)
			$unknowns?: Uint8Array[]
			destinationJid?: (string|null)
			message?: (waproto.Message.$Properties|null)
			phash?: (string|null)
			static encode(m: waproto.Message.DeviceSentMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.DeviceSentMessage & waproto.Message.DeviceSentMessage.$Shape
		}
		namespace DeviceSentMessage {
			interface $Properties {
				destinationJid?: (string|null)
				message?: (waproto.Message.$Properties|null)
				phash?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.DeviceSentMessage.$Properties
		}
		interface IRequestPhoneNumberMessage extends waproto.Message.RequestPhoneNumberMessage.$Properties {
		}
		class RequestPhoneNumberMessage {
			constructor(p?: waproto.Message.RequestPhoneNumberMessage.$Properties)
			$unknowns?: Uint8Array[]
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			static encode(m: waproto.Message.RequestPhoneNumberMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.RequestPhoneNumberMessage & waproto.Message.RequestPhoneNumberMessage.$Shape
		}
		namespace RequestPhoneNumberMessage {
			interface $Properties {
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.RequestPhoneNumberMessage.$Properties
		}
		interface IEventInviteMessage extends waproto.Message.EventInviteMessage.$Properties {
		}
		class EventInviteMessage {
			constructor(p?: waproto.Message.EventInviteMessage.$Properties)
			$unknowns?: Uint8Array[]
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			eventId?: (string|null)
			eventTitle?: (string|null)
			jpegThumbnail?: (Uint8Array|null)
			startTime?: (number|Long|null)
			caption?: (string|null)
			isCanceled?: (boolean|null)
			endTime?: (number|Long|null)
			callLink?: (string|null)
			static encode(m: waproto.Message.EventInviteMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.EventInviteMessage & waproto.Message.EventInviteMessage.$Shape
		}
		namespace EventInviteMessage {
			interface $Properties {
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				eventId?: (string|null)
				eventTitle?: (string|null)
				jpegThumbnail?: (Uint8Array|null)
				startTime?: (number|Long|null)
				caption?: (string|null)
				isCanceled?: (boolean|null)
				endTime?: (number|Long|null)
				callLink?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.EventInviteMessage.$Properties
		}
		interface INewsletterFollowerInviteMessage extends waproto.Message.NewsletterFollowerInviteMessage.$Properties {
		}
		class NewsletterFollowerInviteMessage {
			constructor(p?: waproto.Message.NewsletterFollowerInviteMessage.$Properties)
			$unknowns?: Uint8Array[]
			newsletterJid?: (string|null)
			newsletterName?: (string|null)
			jpegThumbnail?: (Uint8Array|null)
			caption?: (string|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			static encode(m: waproto.Message.NewsletterFollowerInviteMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.NewsletterFollowerInviteMessage & waproto.Message.NewsletterFollowerInviteMessage.$Shape
		}
		namespace NewsletterFollowerInviteMessage {
			interface $Properties {
				newsletterJid?: (string|null)
				newsletterName?: (string|null)
				jpegThumbnail?: (Uint8Array|null)
				caption?: (string|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.NewsletterFollowerInviteMessage.$Properties
		}
		interface INewsletterAdminInviteMessage extends waproto.Message.NewsletterAdminInviteMessage.$Properties {
		}
		class NewsletterAdminInviteMessage {
			constructor(p?: waproto.Message.NewsletterAdminInviteMessage.$Properties)
			$unknowns?: Uint8Array[]
			newsletterJid?: (string|null)
			newsletterName?: (string|null)
			jpegThumbnail?: (Uint8Array|null)
			caption?: (string|null)
			inviteExpiration?: (number|Long|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			static encode(m: waproto.Message.NewsletterAdminInviteMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.NewsletterAdminInviteMessage & waproto.Message.NewsletterAdminInviteMessage.$Shape
		}
		namespace NewsletterAdminInviteMessage {
			interface $Properties {
				newsletterJid?: (string|null)
				newsletterName?: (string|null)
				jpegThumbnail?: (Uint8Array|null)
				caption?: (string|null)
				inviteExpiration?: (number|Long|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.NewsletterAdminInviteMessage.$Properties
		}
		interface IGroupInviteMessage extends waproto.Message.GroupInviteMessage.$Properties {
		}
		class GroupInviteMessage {
			constructor(p?: waproto.Message.GroupInviteMessage.$Properties)
			$unknowns?: Uint8Array[]
			groupJid?: (string|null)
			inviteCode?: (string|null)
			inviteExpiration?: (number|Long|null)
			groupName?: (string|null)
			jpegThumbnail?: (Uint8Array|null)
			caption?: (string|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			groupType?: (waproto.Message.GroupInviteMessage.GroupType|null)
			static encode(m: waproto.Message.GroupInviteMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.GroupInviteMessage & waproto.Message.GroupInviteMessage.$Shape
		}
		namespace GroupInviteMessage {
			interface $Properties {
				groupJid?: (string|null)
				inviteCode?: (string|null)
				inviteExpiration?: (number|Long|null)
				groupName?: (string|null)
				jpegThumbnail?: (Uint8Array|null)
				caption?: (string|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				groupType?: (waproto.Message.GroupInviteMessage.GroupType|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.GroupInviteMessage.$Properties
			enum GroupType {
				DEFAULT = 0,
				PARENT = 1
			}
		}
		interface IInteractiveResponseMessage extends waproto.Message.InteractiveResponseMessage.$Properties {
		}
		class InteractiveResponseMessage {
			constructor(p?: waproto.Message.InteractiveResponseMessage.$Properties)
			$unknowns?: Uint8Array[]
			body?: (waproto.Message.InteractiveResponseMessage.Body.$Properties|null)
			nativeFlowResponseMessage?: (waproto.Message.InteractiveResponseMessage.NativeFlowResponseMessage.$Properties|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			static encode(m: waproto.Message.InteractiveResponseMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveResponseMessage & waproto.Message.InteractiveResponseMessage.$Shape
		}
		namespace InteractiveResponseMessage {
			interface $Properties {
				body?: (waproto.Message.InteractiveResponseMessage.Body.$Properties|null)
				nativeFlowResponseMessage?: (waproto.Message.InteractiveResponseMessage.NativeFlowResponseMessage.$Properties|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.InteractiveResponseMessage.$Properties
			interface INativeFlowResponseMessage extends waproto.Message.InteractiveResponseMessage.NativeFlowResponseMessage.$Properties {
			}
			class NativeFlowResponseMessage {
				constructor(p?: waproto.Message.InteractiveResponseMessage.NativeFlowResponseMessage.$Properties)
				$unknowns?: Uint8Array[]
				name?: (string|null)
				paramsJson?: (string|null)
				version?: (number|null)
				static encode(m: waproto.Message.InteractiveResponseMessage.NativeFlowResponseMessage.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveResponseMessage.NativeFlowResponseMessage & waproto.Message.InteractiveResponseMessage.NativeFlowResponseMessage.$Shape
			}
			namespace NativeFlowResponseMessage {
				interface $Properties {
					name?: (string|null)
					paramsJson?: (string|null)
					version?: (number|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.InteractiveResponseMessage.NativeFlowResponseMessage.$Properties
			}
			interface IBody extends waproto.Message.InteractiveResponseMessage.Body.$Properties {
			}
			class Body {
				constructor(p?: waproto.Message.InteractiveResponseMessage.Body.$Properties)
				$unknowns?: Uint8Array[]
				text?: (string|null)
				format?: (waproto.Message.InteractiveResponseMessage.Body.Format|null)
				static encode(m: waproto.Message.InteractiveResponseMessage.Body.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveResponseMessage.Body & waproto.Message.InteractiveResponseMessage.Body.$Shape
			}
			namespace Body {
				interface $Properties {
					text?: (string|null)
					format?: (waproto.Message.InteractiveResponseMessage.Body.Format|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.InteractiveResponseMessage.Body.$Properties
				enum Format {
					DEFAULT = 0,
					EXTENSIONS_1 = 1
				}
			}
		}
		interface IInteractiveMessage extends waproto.Message.InteractiveMessage.$Properties {
		}
		class InteractiveMessage {
			constructor(p?: waproto.Message.InteractiveMessage.$Properties)
			$unknowns?: Uint8Array[]
			header?: (waproto.Message.InteractiveMessage.Header.$Properties|null)
			body?: (waproto.Message.InteractiveMessage.Body.$Properties|null)
			footer?: (waproto.Message.InteractiveMessage.Footer.$Properties|null)
			shopStorefrontMessage?: (waproto.Message.InteractiveMessage.ShopMessage.$Properties|null)
			collectionMessage?: (waproto.Message.InteractiveMessage.CollectionMessage.$Properties|null)
			nativeFlowMessage?: (waproto.Message.InteractiveMessage.NativeFlowMessage.$Properties|null)
			carouselMessage?: (waproto.Message.InteractiveMessage.CarouselMessage.$Properties|null)
			bloksWidget?: (waproto.Message.InteractiveMessage.BloksWidget.$Properties|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			urlTrackingMap?: (waproto.UrlTrackingMap.$Properties|null)
			static encode(m: waproto.Message.InteractiveMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage & waproto.Message.InteractiveMessage.$Shape
		}
		namespace InteractiveMessage {
			interface $Properties {
				header?: (waproto.Message.InteractiveMessage.Header.$Properties|null)
				body?: (waproto.Message.InteractiveMessage.Body.$Properties|null)
				footer?: (waproto.Message.InteractiveMessage.Footer.$Properties|null)
				shopStorefrontMessage?: (waproto.Message.InteractiveMessage.ShopMessage.$Properties|null)
				collectionMessage?: (waproto.Message.InteractiveMessage.CollectionMessage.$Properties|null)
				nativeFlowMessage?: (waproto.Message.InteractiveMessage.NativeFlowMessage.$Properties|null)
				carouselMessage?: (waproto.Message.InteractiveMessage.CarouselMessage.$Properties|null)
				bloksWidget?: (waproto.Message.InteractiveMessage.BloksWidget.$Properties|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				urlTrackingMap?: (waproto.UrlTrackingMap.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.InteractiveMessage.$Properties
			interface ICarouselMessage extends waproto.Message.InteractiveMessage.CarouselMessage.$Properties {
			}
			class CarouselMessage {
				constructor(p?: waproto.Message.InteractiveMessage.CarouselMessage.$Properties)
				$unknowns?: Uint8Array[]
				cards: waproto.Message.InteractiveMessage.$Properties[]
				messageVersion?: (number|null)
				carouselCardType?: (waproto.Message.InteractiveMessage.CarouselMessage.CarouselCardType|null)
				static encode(m: waproto.Message.InteractiveMessage.CarouselMessage.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.CarouselMessage & waproto.Message.InteractiveMessage.CarouselMessage.$Shape
			}
			namespace CarouselMessage {
				interface $Properties {
					cards?: (waproto.Message.InteractiveMessage.$Properties[]|null)
					messageVersion?: (number|null)
					carouselCardType?: (waproto.Message.InteractiveMessage.CarouselMessage.CarouselCardType|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.InteractiveMessage.CarouselMessage.$Properties
				enum CarouselCardType {
					UNKNOWN = 0,
					HSCROLL_CARDS = 1,
					ALBUM_IMAGE = 2
				}
			}
			interface INativeFlowMessage extends waproto.Message.InteractiveMessage.NativeFlowMessage.$Properties {
			}
			class NativeFlowMessage {
				constructor(p?: waproto.Message.InteractiveMessage.NativeFlowMessage.$Properties)
				$unknowns?: Uint8Array[]
				buttons: waproto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.$Properties[]
				messageParamsJson?: (string|null)
				messageVersion?: (number|null)
				static encode(m: waproto.Message.InteractiveMessage.NativeFlowMessage.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.NativeFlowMessage & waproto.Message.InteractiveMessage.NativeFlowMessage.$Shape
			}
			namespace NativeFlowMessage {
				interface $Properties {
					buttons?: (waproto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.$Properties[]|null)
					messageParamsJson?: (string|null)
					messageVersion?: (number|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.InteractiveMessage.NativeFlowMessage.$Properties
				interface INativeFlowButton extends waproto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.$Properties {
				}
				class NativeFlowButton {
					constructor(p?: waproto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.$Properties)
					$unknowns?: Uint8Array[]
					name?: (string|null)
					buttonParamsJson?: (string|null)
					static encode(m: waproto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton & waproto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.$Shape
				}
				namespace NativeFlowButton {
					interface $Properties {
						name?: (string|null)
						buttonParamsJson?: (string|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.$Properties
				}
			}
			interface ICollectionMessage extends waproto.Message.InteractiveMessage.CollectionMessage.$Properties {
			}
			class CollectionMessage {
				constructor(p?: waproto.Message.InteractiveMessage.CollectionMessage.$Properties)
				$unknowns?: Uint8Array[]
				bizJid?: (string|null)
				id?: (string|null)
				messageVersion?: (number|null)
				static encode(m: waproto.Message.InteractiveMessage.CollectionMessage.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.CollectionMessage & waproto.Message.InteractiveMessage.CollectionMessage.$Shape
			}
			namespace CollectionMessage {
				interface $Properties {
					bizJid?: (string|null)
					id?: (string|null)
					messageVersion?: (number|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.InteractiveMessage.CollectionMessage.$Properties
			}
			interface IShopMessage extends waproto.Message.InteractiveMessage.ShopMessage.$Properties {
			}
			class ShopMessage {
				constructor(p?: waproto.Message.InteractiveMessage.ShopMessage.$Properties)
				$unknowns?: Uint8Array[]
				id?: (string|null)
				surface?: (waproto.Message.InteractiveMessage.ShopMessage.Surface|null)
				messageVersion?: (number|null)
				static encode(m: waproto.Message.InteractiveMessage.ShopMessage.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.ShopMessage & waproto.Message.InteractiveMessage.ShopMessage.$Shape
			}
			namespace ShopMessage {
				interface $Properties {
					id?: (string|null)
					surface?: (waproto.Message.InteractiveMessage.ShopMessage.Surface|null)
					messageVersion?: (number|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.InteractiveMessage.ShopMessage.$Properties
				enum Surface {
					UNKNOWN_SURFACE = 0,
					FB = 1,
					IG = 2,
					WA = 3
				}
			}
			interface IBloksWidget extends waproto.Message.InteractiveMessage.BloksWidget.$Properties {
			}
			class BloksWidget {
				constructor(p?: waproto.Message.InteractiveMessage.BloksWidget.$Properties)
				$unknowns?: Uint8Array[]
				uuid?: (string|null)
				data?: (string|null)
				type?: (string|null)
				fallback?: (string|null)
				static encode(m: waproto.Message.InteractiveMessage.BloksWidget.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.BloksWidget & waproto.Message.InteractiveMessage.BloksWidget.$Shape
			}
			namespace BloksWidget {
				interface $Properties {
					uuid?: (string|null)
					data?: (string|null)
					type?: (string|null)
					fallback?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.InteractiveMessage.BloksWidget.$Properties
			}
			interface IFooter extends waproto.Message.InteractiveMessage.Footer.$Properties {
			}
			class Footer {
				constructor(p?: waproto.Message.InteractiveMessage.Footer.$Properties)
				$unknowns?: Uint8Array[]
				text?: (string|null)
				audioMessage?: (waproto.Message.AudioMessage.$Properties|null)
				hasMediaAttachment?: (boolean|null)
				static encode(m: waproto.Message.InteractiveMessage.Footer.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.Footer & waproto.Message.InteractiveMessage.Footer.$Shape
			}
			namespace Footer {
				interface $Properties {
					text?: (string|null)
					audioMessage?: (waproto.Message.AudioMessage.$Properties|null)
					hasMediaAttachment?: (boolean|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.InteractiveMessage.Footer.$Properties
			}
			interface IBody extends waproto.Message.InteractiveMessage.Body.$Properties {
			}
			class Body {
				constructor(p?: waproto.Message.InteractiveMessage.Body.$Properties)
				$unknowns?: Uint8Array[]
				text?: (string|null)
				static encode(m: waproto.Message.InteractiveMessage.Body.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.Body & waproto.Message.InteractiveMessage.Body.$Shape
			}
			namespace Body {
				interface $Properties {
					text?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.InteractiveMessage.Body.$Properties
			}
			interface IHeader extends waproto.Message.InteractiveMessage.Header.$Properties {
			}
			class Header {
				constructor(p?: waproto.Message.InteractiveMessage.Header.$Properties)
				$unknowns?: Uint8Array[]
				title?: (string|null)
				subtitle?: (string|null)
				documentMessage?: (waproto.Message.DocumentMessage.$Properties|null)
				imageMessage?: (waproto.Message.ImageMessage.$Properties|null)
				hasMediaAttachment?: (boolean|null)
				jpegThumbnail?: (Uint8Array|null)
				videoMessage?: (waproto.Message.VideoMessage.$Properties|null)
				locationMessage?: (waproto.Message.LocationMessage.$Properties|null)
				productMessage?: (waproto.Message.ProductMessage.$Properties|null)
				bloksWidget?: (waproto.Message.InteractiveMessage.BloksWidget.$Properties|null)
				static encode(m: waproto.Message.InteractiveMessage.Header.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.Header & waproto.Message.InteractiveMessage.Header.$Shape
			}
			namespace Header {
				interface $Properties {
					title?: (string|null)
					subtitle?: (string|null)
					documentMessage?: (waproto.Message.DocumentMessage.$Properties|null)
					imageMessage?: (waproto.Message.ImageMessage.$Properties|null)
					hasMediaAttachment?: (boolean|null)
					jpegThumbnail?: (Uint8Array|null)
					videoMessage?: (waproto.Message.VideoMessage.$Properties|null)
					locationMessage?: (waproto.Message.LocationMessage.$Properties|null)
					productMessage?: (waproto.Message.ProductMessage.$Properties|null)
					bloksWidget?: (waproto.Message.InteractiveMessage.BloksWidget.$Properties|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.InteractiveMessage.Header.$Properties
			}
		}
		interface IListResponseMessage extends waproto.Message.ListResponseMessage.$Properties {
		}
		class ListResponseMessage {
			constructor(p?: waproto.Message.ListResponseMessage.$Properties)
			$unknowns?: Uint8Array[]
			title?: (string|null)
			listType?: (waproto.Message.ListResponseMessage.ListType|null)
			singleSelectReply?: (waproto.Message.ListResponseMessage.SingleSelectReply.$Properties|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			description?: (string|null)
			static encode(m: waproto.Message.ListResponseMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListResponseMessage & waproto.Message.ListResponseMessage.$Shape
		}
		namespace ListResponseMessage {
			interface $Properties {
				title?: (string|null)
				listType?: (waproto.Message.ListResponseMessage.ListType|null)
				singleSelectReply?: (waproto.Message.ListResponseMessage.SingleSelectReply.$Properties|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				description?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ListResponseMessage.$Properties
			enum ListType {
				UNKNOWN = 0,
				SINGLE_SELECT = 1
			}
			interface ISingleSelectReply extends waproto.Message.ListResponseMessage.SingleSelectReply.$Properties {
			}
			class SingleSelectReply {
				constructor(p?: waproto.Message.ListResponseMessage.SingleSelectReply.$Properties)
				$unknowns?: Uint8Array[]
				selectedRowId?: (string|null)
				static encode(m: waproto.Message.ListResponseMessage.SingleSelectReply.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListResponseMessage.SingleSelectReply & waproto.Message.ListResponseMessage.SingleSelectReply.$Shape
			}
			namespace SingleSelectReply {
				interface $Properties {
					selectedRowId?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.ListResponseMessage.SingleSelectReply.$Properties
			}
		}
		interface IListMessage extends waproto.Message.ListMessage.$Properties {
		}
		class ListMessage {
			constructor(p?: waproto.Message.ListMessage.$Properties)
			$unknowns?: Uint8Array[]
			title?: (string|null)
			description?: (string|null)
			buttonText?: (string|null)
			listType?: (waproto.Message.ListMessage.ListType|null)
			sections: waproto.Message.ListMessage.Section.$Properties[]
			productListInfo?: (waproto.Message.ListMessage.ProductListInfo.$Properties|null)
			footerText?: (string|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			static encode(m: waproto.Message.ListMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage & waproto.Message.ListMessage.$Shape
		}
		namespace ListMessage {
			interface $Properties {
				title?: (string|null)
				description?: (string|null)
				buttonText?: (string|null)
				listType?: (waproto.Message.ListMessage.ListType|null)
				sections?: (waproto.Message.ListMessage.Section.$Properties[]|null)
				productListInfo?: (waproto.Message.ListMessage.ProductListInfo.$Properties|null)
				footerText?: (string|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ListMessage.$Properties
			enum ListType {
				UNKNOWN = 0,
				SINGLE_SELECT = 1,
				PRODUCT_LIST = 2
			}
			interface IProductListInfo extends waproto.Message.ListMessage.ProductListInfo.$Properties {
			}
			class ProductListInfo {
				constructor(p?: waproto.Message.ListMessage.ProductListInfo.$Properties)
				$unknowns?: Uint8Array[]
				productSections: waproto.Message.ListMessage.ProductSection.$Properties[]
				headerImage?: (waproto.Message.ListMessage.ProductListHeaderImage.$Properties|null)
				businessOwnerJid?: (string|null)
				static encode(m: waproto.Message.ListMessage.ProductListInfo.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage.ProductListInfo & waproto.Message.ListMessage.ProductListInfo.$Shape
			}
			namespace ProductListInfo {
				interface $Properties {
					productSections?: (waproto.Message.ListMessage.ProductSection.$Properties[]|null)
					headerImage?: (waproto.Message.ListMessage.ProductListHeaderImage.$Properties|null)
					businessOwnerJid?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.ListMessage.ProductListInfo.$Properties
			}
			interface IProductListHeaderImage extends waproto.Message.ListMessage.ProductListHeaderImage.$Properties {
			}
			class ProductListHeaderImage {
				constructor(p?: waproto.Message.ListMessage.ProductListHeaderImage.$Properties)
				$unknowns?: Uint8Array[]
				productId?: (string|null)
				jpegThumbnail?: (Uint8Array|null)
				static encode(m: waproto.Message.ListMessage.ProductListHeaderImage.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage.ProductListHeaderImage & waproto.Message.ListMessage.ProductListHeaderImage.$Shape
			}
			namespace ProductListHeaderImage {
				interface $Properties {
					productId?: (string|null)
					jpegThumbnail?: (Uint8Array|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.ListMessage.ProductListHeaderImage.$Properties
			}
			interface IProductSection extends waproto.Message.ListMessage.ProductSection.$Properties {
			}
			class ProductSection {
				constructor(p?: waproto.Message.ListMessage.ProductSection.$Properties)
				$unknowns?: Uint8Array[]
				title?: (string|null)
				products: waproto.Message.ListMessage.Product.$Properties[]
				static encode(m: waproto.Message.ListMessage.ProductSection.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage.ProductSection & waproto.Message.ListMessage.ProductSection.$Shape
			}
			namespace ProductSection {
				interface $Properties {
					title?: (string|null)
					products?: (waproto.Message.ListMessage.Product.$Properties[]|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.ListMessage.ProductSection.$Properties
			}
			interface IProduct extends waproto.Message.ListMessage.Product.$Properties {
			}
			class Product {
				constructor(p?: waproto.Message.ListMessage.Product.$Properties)
				$unknowns?: Uint8Array[]
				productId?: (string|null)
				static encode(m: waproto.Message.ListMessage.Product.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage.Product & waproto.Message.ListMessage.Product.$Shape
			}
			namespace Product {
				interface $Properties {
					productId?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.ListMessage.Product.$Properties
			}
			interface ISection extends waproto.Message.ListMessage.Section.$Properties {
			}
			class Section {
				constructor(p?: waproto.Message.ListMessage.Section.$Properties)
				$unknowns?: Uint8Array[]
				title?: (string|null)
				rows: waproto.Message.ListMessage.Row.$Properties[]
				static encode(m: waproto.Message.ListMessage.Section.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage.Section & waproto.Message.ListMessage.Section.$Shape
			}
			namespace Section {
				interface $Properties {
					title?: (string|null)
					rows?: (waproto.Message.ListMessage.Row.$Properties[]|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.ListMessage.Section.$Properties
			}
			interface IRow extends waproto.Message.ListMessage.Row.$Properties {
			}
			class Row {
				constructor(p?: waproto.Message.ListMessage.Row.$Properties)
				$unknowns?: Uint8Array[]
				title?: (string|null)
				description?: (string|null)
				rowId?: (string|null)
				static encode(m: waproto.Message.ListMessage.Row.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage.Row & waproto.Message.ListMessage.Row.$Shape
			}
			namespace Row {
				interface $Properties {
					title?: (string|null)
					description?: (string|null)
					rowId?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.ListMessage.Row.$Properties
			}
		}
		interface IOrderMessage extends waproto.Message.OrderMessage.$Properties {
		}
		class OrderMessage {
			constructor(p?: waproto.Message.OrderMessage.$Properties)
			$unknowns?: Uint8Array[]
			orderId?: (string|null)
			thumbnail?: (Uint8Array|null)
			itemCount?: (number|null)
			status?: (waproto.Message.OrderMessage.OrderStatus|null)
			surface?: (waproto.Message.OrderMessage.OrderSurface|null)
			message?: (string|null)
			orderTitle?: (string|null)
			sellerJid?: (string|null)
			token?: (string|null)
			totalAmount1000?: (number|Long|null)
			totalCurrencyCode?: (string|null)
			messageVersion?: (number|null)
			orderRequestMessageId?: (waproto.MessageKey.$Properties|null)
			catalogType?: (string|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			static encode(m: waproto.Message.OrderMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.OrderMessage & waproto.Message.OrderMessage.$Shape
		}
		namespace OrderMessage {
			interface $Properties {
				orderId?: (string|null)
				thumbnail?: (Uint8Array|null)
				itemCount?: (number|null)
				status?: (waproto.Message.OrderMessage.OrderStatus|null)
				surface?: (waproto.Message.OrderMessage.OrderSurface|null)
				message?: (string|null)
				orderTitle?: (string|null)
				sellerJid?: (string|null)
				token?: (string|null)
				totalAmount1000?: (number|Long|null)
				totalCurrencyCode?: (string|null)
				messageVersion?: (number|null)
				orderRequestMessageId?: (waproto.MessageKey.$Properties|null)
				catalogType?: (string|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.OrderMessage.$Properties
			enum OrderSurface {
				CATALOG = 1
			}
			enum OrderStatus {
				INQUIRY = 1,
				ACCEPTED = 2,
				DECLINED = 3
			}
		}
		interface IProductMessage extends waproto.Message.ProductMessage.$Properties {
		}
		class ProductMessage {
			constructor(p?: waproto.Message.ProductMessage.$Properties)
			$unknowns?: Uint8Array[]
			product?: (waproto.Message.ProductMessage.ProductSnapshot.$Properties|null)
			businessOwnerJid?: (string|null)
			catalog?: (waproto.Message.ProductMessage.CatalogSnapshot.$Properties|null)
			body?: (string|null)
			footer?: (string|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			static encode(m: waproto.Message.ProductMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ProductMessage & waproto.Message.ProductMessage.$Shape
		}
		namespace ProductMessage {
			interface $Properties {
				product?: (waproto.Message.ProductMessage.ProductSnapshot.$Properties|null)
				businessOwnerJid?: (string|null)
				catalog?: (waproto.Message.ProductMessage.CatalogSnapshot.$Properties|null)
				body?: (string|null)
				footer?: (string|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ProductMessage.$Properties
			interface IProductSnapshot extends waproto.Message.ProductMessage.ProductSnapshot.$Properties {
			}
			class ProductSnapshot {
				constructor(p?: waproto.Message.ProductMessage.ProductSnapshot.$Properties)
				$unknowns?: Uint8Array[]
				productImage?: (waproto.Message.ImageMessage.$Properties|null)
				productId?: (string|null)
				title?: (string|null)
				description?: (string|null)
				currencyCode?: (string|null)
				priceAmount1000?: (number|Long|null)
				retailerId?: (string|null)
				url?: (string|null)
				productImageCount?: (number|null)
				firstImageId?: (string|null)
				salePriceAmount1000?: (number|Long|null)
				signedUrl?: (string|null)
				static encode(m: waproto.Message.ProductMessage.ProductSnapshot.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ProductMessage.ProductSnapshot & waproto.Message.ProductMessage.ProductSnapshot.$Shape
			}
			namespace ProductSnapshot {
				interface $Properties {
					productImage?: (waproto.Message.ImageMessage.$Properties|null)
					productId?: (string|null)
					title?: (string|null)
					description?: (string|null)
					currencyCode?: (string|null)
					priceAmount1000?: (number|Long|null)
					retailerId?: (string|null)
					url?: (string|null)
					productImageCount?: (number|null)
					firstImageId?: (string|null)
					salePriceAmount1000?: (number|Long|null)
					signedUrl?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.ProductMessage.ProductSnapshot.$Properties
			}
			interface ICatalogSnapshot extends waproto.Message.ProductMessage.CatalogSnapshot.$Properties {
			}
			class CatalogSnapshot {
				constructor(p?: waproto.Message.ProductMessage.CatalogSnapshot.$Properties)
				$unknowns?: Uint8Array[]
				catalogImage?: (waproto.Message.ImageMessage.$Properties|null)
				title?: (string|null)
				description?: (string|null)
				static encode(m: waproto.Message.ProductMessage.CatalogSnapshot.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ProductMessage.CatalogSnapshot & waproto.Message.ProductMessage.CatalogSnapshot.$Shape
			}
			namespace CatalogSnapshot {
				interface $Properties {
					catalogImage?: (waproto.Message.ImageMessage.$Properties|null)
					title?: (string|null)
					description?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.ProductMessage.CatalogSnapshot.$Properties
			}
		}
		interface IStatusQuotedMessage extends waproto.Message.StatusQuotedMessage.$Properties {
		}
		class StatusQuotedMessage {
			constructor(p?: waproto.Message.StatusQuotedMessage.$Properties)
			$unknowns?: Uint8Array[]
			type?: (waproto.Message.StatusQuotedMessage.StatusQuotedMessageType|null)
			text?: (string|null)
			thumbnail?: (Uint8Array|null)
			originalStatusId?: (waproto.MessageKey.$Properties|null)
			static encode(m: waproto.Message.StatusQuotedMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StatusQuotedMessage & waproto.Message.StatusQuotedMessage.$Shape
		}
		namespace StatusQuotedMessage {
			interface $Properties {
				type?: (waproto.Message.StatusQuotedMessage.StatusQuotedMessageType|null)
				text?: (string|null)
				thumbnail?: (Uint8Array|null)
				originalStatusId?: (waproto.MessageKey.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.StatusQuotedMessage.$Properties
			enum StatusQuotedMessageType {
				QUESTION_ANSWER = 1
			}
		}
		interface ITemplateButtonReplyMessage extends waproto.Message.TemplateButtonReplyMessage.$Properties {
		}
		class TemplateButtonReplyMessage {
			constructor(p?: waproto.Message.TemplateButtonReplyMessage.$Properties)
			$unknowns?: Uint8Array[]
			selectedId?: (string|null)
			selectedDisplayText?: (string|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			selectedIndex?: (number|null)
			selectedCarouselCardIndex?: (number|null)
			static encode(m: waproto.Message.TemplateButtonReplyMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.TemplateButtonReplyMessage & waproto.Message.TemplateButtonReplyMessage.$Shape
		}
		namespace TemplateButtonReplyMessage {
			interface $Properties {
				selectedId?: (string|null)
				selectedDisplayText?: (string|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				selectedIndex?: (number|null)
				selectedCarouselCardIndex?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.TemplateButtonReplyMessage.$Properties
		}
		interface ITemplateMessage extends waproto.Message.TemplateMessage.$Properties {
		}
		class TemplateMessage {
			constructor(p?: waproto.Message.TemplateMessage.$Properties)
			$unknowns?: Uint8Array[]
			fourRowTemplate?: (waproto.Message.TemplateMessage.FourRowTemplate.$Properties|null)
			hydratedFourRowTemplate?: (waproto.Message.TemplateMessage.HydratedFourRowTemplate.$Properties|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			hydratedTemplate?: (waproto.Message.TemplateMessage.HydratedFourRowTemplate.$Properties|null)
			interactiveMessageTemplate?: (waproto.Message.InteractiveMessage.$Properties|null)
			templateId?: (string|null)
			static encode(m: waproto.Message.TemplateMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.TemplateMessage & waproto.Message.TemplateMessage.$Shape
		}
		namespace TemplateMessage {
			interface $Properties {
				fourRowTemplate?: (waproto.Message.TemplateMessage.FourRowTemplate.$Properties|null)
				hydratedFourRowTemplate?: (waproto.Message.TemplateMessage.HydratedFourRowTemplate.$Properties|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				hydratedTemplate?: (waproto.Message.TemplateMessage.HydratedFourRowTemplate.$Properties|null)
				interactiveMessageTemplate?: (waproto.Message.InteractiveMessage.$Properties|null)
				templateId?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.TemplateMessage.$Properties
			interface IHydratedFourRowTemplate extends waproto.Message.TemplateMessage.HydratedFourRowTemplate.$Properties {
			}
			class HydratedFourRowTemplate {
				constructor(p?: waproto.Message.TemplateMessage.HydratedFourRowTemplate.$Properties)
				$unknowns?: Uint8Array[]
				documentMessage?: (waproto.Message.DocumentMessage.$Properties|null)
				hydratedTitleText?: (string|null)
				imageMessage?: (waproto.Message.ImageMessage.$Properties|null)
				videoMessage?: (waproto.Message.VideoMessage.$Properties|null)
				locationMessage?: (waproto.Message.LocationMessage.$Properties|null)
				hydratedContentText?: (string|null)
				hydratedFooterText?: (string|null)
				hydratedButtons: waproto.HydratedTemplateButton.$Properties[]
				templateId?: (string|null)
				maskLinkedDevices?: (boolean|null)
				static encode(m: waproto.Message.TemplateMessage.HydratedFourRowTemplate.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.TemplateMessage.HydratedFourRowTemplate & waproto.Message.TemplateMessage.HydratedFourRowTemplate.$Shape
			}
			namespace HydratedFourRowTemplate {
				interface $Properties {
					documentMessage?: (waproto.Message.DocumentMessage.$Properties|null)
					hydratedTitleText?: (string|null)
					imageMessage?: (waproto.Message.ImageMessage.$Properties|null)
					videoMessage?: (waproto.Message.VideoMessage.$Properties|null)
					locationMessage?: (waproto.Message.LocationMessage.$Properties|null)
					hydratedContentText?: (string|null)
					hydratedFooterText?: (string|null)
					hydratedButtons?: (waproto.HydratedTemplateButton.$Properties[]|null)
					templateId?: (string|null)
					maskLinkedDevices?: (boolean|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.TemplateMessage.HydratedFourRowTemplate.$Properties
			}
			interface IFourRowTemplate extends waproto.Message.TemplateMessage.FourRowTemplate.$Properties {
			}
			class FourRowTemplate {
				constructor(p?: waproto.Message.TemplateMessage.FourRowTemplate.$Properties)
				$unknowns?: Uint8Array[]
				documentMessage?: (waproto.Message.DocumentMessage.$Properties|null)
				highlyStructuredMessage?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
				imageMessage?: (waproto.Message.ImageMessage.$Properties|null)
				videoMessage?: (waproto.Message.VideoMessage.$Properties|null)
				locationMessage?: (waproto.Message.LocationMessage.$Properties|null)
				content?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
				footer?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
				buttons: waproto.TemplateButton.$Properties[]
				static encode(m: waproto.Message.TemplateMessage.FourRowTemplate.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.TemplateMessage.FourRowTemplate & waproto.Message.TemplateMessage.FourRowTemplate.$Shape
			}
			namespace FourRowTemplate {
				interface $Properties {
					documentMessage?: (waproto.Message.DocumentMessage.$Properties|null)
					highlyStructuredMessage?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
					imageMessage?: (waproto.Message.ImageMessage.$Properties|null)
					videoMessage?: (waproto.Message.VideoMessage.$Properties|null)
					locationMessage?: (waproto.Message.LocationMessage.$Properties|null)
					content?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
					footer?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
					buttons?: (waproto.TemplateButton.$Properties[]|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.TemplateMessage.FourRowTemplate.$Properties
			}
		}
		interface IStickerMessage extends waproto.Message.StickerMessage.$Properties {
		}
		class StickerMessage {
			constructor(p?: waproto.Message.StickerMessage.$Properties)
			$unknowns?: Uint8Array[]
			url?: (string|null)
			fileSha256?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			mediaKey?: (Uint8Array|null)
			mimetype?: (string|null)
			height?: (number|null)
			width?: (number|null)
			directPath?: (string|null)
			fileLength?: (number|Long|null)
			mediaKeyTimestamp?: (number|Long|null)
			firstFrameLength?: (number|null)
			firstFrameSidecar?: (Uint8Array|null)
			isAnimated?: (boolean|null)
			pngThumbnail?: (Uint8Array|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			stickerSentTs?: (number|Long|null)
			isAvatar?: (boolean|null)
			isAiSticker?: (boolean|null)
			isLottie?: (boolean|null)
			accessibilityLabel?: (string|null)
			premium?: (number|null)
			emojis?: (string|null)
			static encode(m: waproto.Message.StickerMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StickerMessage & waproto.Message.StickerMessage.$Shape
		}
		namespace StickerMessage {
			interface $Properties {
				url?: (string|null)
				fileSha256?: (Uint8Array|null)
				fileEncSha256?: (Uint8Array|null)
				mediaKey?: (Uint8Array|null)
				mimetype?: (string|null)
				height?: (number|null)
				width?: (number|null)
				directPath?: (string|null)
				fileLength?: (number|Long|null)
				mediaKeyTimestamp?: (number|Long|null)
				firstFrameLength?: (number|null)
				firstFrameSidecar?: (Uint8Array|null)
				isAnimated?: (boolean|null)
				pngThumbnail?: (Uint8Array|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				stickerSentTs?: (number|Long|null)
				isAvatar?: (boolean|null)
				isAiSticker?: (boolean|null)
				isLottie?: (boolean|null)
				accessibilityLabel?: (string|null)
				premium?: (number|null)
				emojis?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.StickerMessage.$Properties
		}
		interface ILiveLocationMessage extends waproto.Message.LiveLocationMessage.$Properties {
		}
		class LiveLocationMessage {
			constructor(p?: waproto.Message.LiveLocationMessage.$Properties)
			$unknowns?: Uint8Array[]
			degreesLatitude?: (number|null)
			degreesLongitude?: (number|null)
			accuracyInMeters?: (number|null)
			speedInMps?: (number|null)
			degreesClockwiseFromMagneticNorth?: (number|null)
			caption?: (string|null)
			sequenceNumber?: (number|Long|null)
			timeOffset?: (number|null)
			jpegThumbnail?: (Uint8Array|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			static encode(m: waproto.Message.LiveLocationMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.LiveLocationMessage & waproto.Message.LiveLocationMessage.$Shape
		}
		namespace LiveLocationMessage {
			interface $Properties {
				degreesLatitude?: (number|null)
				degreesLongitude?: (number|null)
				accuracyInMeters?: (number|null)
				speedInMps?: (number|null)
				degreesClockwiseFromMagneticNorth?: (number|null)
				caption?: (string|null)
				sequenceNumber?: (number|Long|null)
				timeOffset?: (number|null)
				jpegThumbnail?: (Uint8Array|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.LiveLocationMessage.$Properties
		}
		interface ISplitPaymentUpdateMessage extends waproto.Message.SplitPaymentUpdateMessage.$Properties {
		}
		class SplitPaymentUpdateMessage {
			constructor(p?: waproto.Message.SplitPaymentUpdateMessage.$Properties)
			$unknowns?: Uint8Array[]
			splitId?: (string|null)
			participantJid?: (string|null)
			static encode(m: waproto.Message.SplitPaymentUpdateMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.SplitPaymentUpdateMessage & waproto.Message.SplitPaymentUpdateMessage.$Shape
		}
		namespace SplitPaymentUpdateMessage {
			interface $Properties {
				splitId?: (string|null)
				participantJid?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.SplitPaymentUpdateMessage.$Properties
		}
		interface ISplitPaymentParticipant extends waproto.Message.SplitPaymentParticipant.$Properties {
		}
		class SplitPaymentParticipant {
			constructor(p?: waproto.Message.SplitPaymentParticipant.$Properties)
			$unknowns?: Uint8Array[]
			jid?: (string|null)
			amount?: (waproto.Money.$Properties|null)
			status?: (waproto.Message.SplitPaymentParticipant.SplitPaymentStatus|null)
			static encode(m: waproto.Message.SplitPaymentParticipant.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.SplitPaymentParticipant & waproto.Message.SplitPaymentParticipant.$Shape
		}
		namespace SplitPaymentParticipant {
			interface $Properties {
				jid?: (string|null)
				amount?: (waproto.Money.$Properties|null)
				status?: (waproto.Message.SplitPaymentParticipant.SplitPaymentStatus|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.SplitPaymentParticipant.$Properties
			enum SplitPaymentStatus {
				PENDING = 0,
				PAID = 1
			}
		}
		interface ISplitPaymentMessage extends waproto.Message.SplitPaymentMessage.$Properties {
		}
		class SplitPaymentMessage {
			constructor(p?: waproto.Message.SplitPaymentMessage.$Properties)
			$unknowns?: Uint8Array[]
			splitId?: (string|null)
			totalAmount?: (waproto.Money.$Properties|null)
			description?: (string|null)
			requesterJid?: (string|null)
			participants: waproto.Message.SplitPaymentParticipant.$Properties[]
			createdAtMs?: (number|Long|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			static encode(m: waproto.Message.SplitPaymentMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.SplitPaymentMessage & waproto.Message.SplitPaymentMessage.$Shape
		}
		namespace SplitPaymentMessage {
			interface $Properties {
				splitId?: (string|null)
				totalAmount?: (waproto.Money.$Properties|null)
				description?: (string|null)
				requesterJid?: (string|null)
				participants?: (waproto.Message.SplitPaymentParticipant.$Properties[]|null)
				createdAtMs?: (number|Long|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.SplitPaymentMessage.$Properties
		}
		interface IPaymentReminderMessage extends waproto.Message.PaymentReminderMessage.$Properties {
		}
		class PaymentReminderMessage {
			constructor(p?: waproto.Message.PaymentReminderMessage.$Properties)
			$unknowns?: Uint8Array[]
			reminderId?: (string|null)
			instanceId?: (string|null)
			description?: (string|null)
			frequency?: (waproto.Message.PaymentReminderMessage.ReminderFrequency|null)
			status?: (waproto.Message.PaymentReminderMessage.ReminderStatus|null)
			payeeVpa?: (string|null)
			payeeJid?: (string|null)
			payerJid?: (string|null)
			amount?: (waproto.Money.$Properties|null)
			static encode(m: waproto.Message.PaymentReminderMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentReminderMessage & waproto.Message.PaymentReminderMessage.$Shape
		}
		namespace PaymentReminderMessage {
			interface $Properties {
				reminderId?: (string|null)
				instanceId?: (string|null)
				description?: (string|null)
				frequency?: (waproto.Message.PaymentReminderMessage.ReminderFrequency|null)
				status?: (waproto.Message.PaymentReminderMessage.ReminderStatus|null)
				payeeVpa?: (string|null)
				payeeJid?: (string|null)
				payerJid?: (string|null)
				amount?: (waproto.Money.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PaymentReminderMessage.$Properties
			enum ReminderStatus {
				REMINDER_STATUS_UNKNOWN = 0,
				ACTIVE = 1,
				CANCELLED_BY_CREATOR = 2,
				STOPPED_BY_RECEIVER = 3,
				EXPIRED = 4,
				PAID = 5
			}
			enum ReminderFrequency {
				REMINDER_FREQUENCY_UNKNOWN = 0,
				WEEKLY = 1,
				BI_WEEKLY = 2,
				MONTHLY = 3,
				QUARTERLY = 4
			}
		}
		interface IPaymentInviteMessage extends waproto.Message.PaymentInviteMessage.$Properties {
		}
		class PaymentInviteMessage {
			constructor(p?: waproto.Message.PaymentInviteMessage.$Properties)
			$unknowns?: Uint8Array[]
			serviceType?: (waproto.Message.PaymentInviteMessage.ServiceType|null)
			expiryTimestamp?: (number|Long|null)
			incentiveEligible?: (boolean|null)
			referralId?: (string|null)
			inviteType?: (waproto.Message.PaymentInviteMessage.InviteType|null)
			static encode(m: waproto.Message.PaymentInviteMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentInviteMessage & waproto.Message.PaymentInviteMessage.$Shape
		}
		namespace PaymentInviteMessage {
			interface $Properties {
				serviceType?: (waproto.Message.PaymentInviteMessage.ServiceType|null)
				expiryTimestamp?: (number|Long|null)
				incentiveEligible?: (boolean|null)
				referralId?: (string|null)
				inviteType?: (waproto.Message.PaymentInviteMessage.InviteType|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PaymentInviteMessage.$Properties
			enum InviteType {
				DEFAULT = 0,
				MAPPER = 1
			}
			enum ServiceType {
				UNKNOWN = 0,
				FBPAY = 1,
				NOVI = 2,
				UPI = 3
			}
		}
		interface ICancelPaymentRequestMessage extends waproto.Message.CancelPaymentRequestMessage.$Properties {
		}
		class CancelPaymentRequestMessage {
			constructor(p?: waproto.Message.CancelPaymentRequestMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			static encode(m: waproto.Message.CancelPaymentRequestMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.CancelPaymentRequestMessage & waproto.Message.CancelPaymentRequestMessage.$Shape
		}
		namespace CancelPaymentRequestMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.CancelPaymentRequestMessage.$Properties
		}
		interface IDeclinePaymentRequestMessage extends waproto.Message.DeclinePaymentRequestMessage.$Properties {
		}
		class DeclinePaymentRequestMessage {
			constructor(p?: waproto.Message.DeclinePaymentRequestMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			static encode(m: waproto.Message.DeclinePaymentRequestMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.DeclinePaymentRequestMessage & waproto.Message.DeclinePaymentRequestMessage.$Shape
		}
		namespace DeclinePaymentRequestMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.DeclinePaymentRequestMessage.$Properties
		}
		interface IRequestPaymentMessage extends waproto.Message.RequestPaymentMessage.$Properties {
		}
		class RequestPaymentMessage {
			constructor(p?: waproto.Message.RequestPaymentMessage.$Properties)
			$unknowns?: Uint8Array[]
			currencyCodeIso4217?: (string|null)
			amount1000?: (number|Long|null)
			requestFrom?: (string|null)
			noteMessage?: (waproto.Message.$Properties|null)
			expiryTimestamp?: (number|Long|null)
			amount?: (waproto.Money.$Properties|null)
			background?: (waproto.PaymentBackground.$Properties|null)
			static encode(m: waproto.Message.RequestPaymentMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.RequestPaymentMessage & waproto.Message.RequestPaymentMessage.$Shape
		}
		namespace RequestPaymentMessage {
			interface $Properties {
				currencyCodeIso4217?: (string|null)
				amount1000?: (number|Long|null)
				requestFrom?: (string|null)
				noteMessage?: (waproto.Message.$Properties|null)
				expiryTimestamp?: (number|Long|null)
				amount?: (waproto.Money.$Properties|null)
				background?: (waproto.PaymentBackground.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.RequestPaymentMessage.$Properties
		}
		interface ISendPaymentMessage extends waproto.Message.SendPaymentMessage.$Properties {
		}
		class SendPaymentMessage {
			constructor(p?: waproto.Message.SendPaymentMessage.$Properties)
			$unknowns?: Uint8Array[]
			noteMessage?: (waproto.Message.$Properties|null)
			requestMessageKey?: (waproto.MessageKey.$Properties|null)
			background?: (waproto.PaymentBackground.$Properties|null)
			transactionData?: (string|null)
			static encode(m: waproto.Message.SendPaymentMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.SendPaymentMessage & waproto.Message.SendPaymentMessage.$Shape
		}
		namespace SendPaymentMessage {
			interface $Properties {
				noteMessage?: (waproto.Message.$Properties|null)
				requestMessageKey?: (waproto.MessageKey.$Properties|null)
				background?: (waproto.PaymentBackground.$Properties|null)
				transactionData?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.SendPaymentMessage.$Properties
		}
		interface IHighlyStructuredMessage extends waproto.Message.HighlyStructuredMessage.$Properties {
		}
		class HighlyStructuredMessage {
			constructor(p?: waproto.Message.HighlyStructuredMessage.$Properties)
			$unknowns?: Uint8Array[]
			namespace?: (string|null)
			elementName?: (string|null)
			params: string[]
			fallbackLg?: (string|null)
			fallbackLc?: (string|null)
			localizableParams: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.$Properties[]
			deterministicLg?: (string|null)
			deterministicLc?: (string|null)
			hydratedHsm?: (waproto.Message.TemplateMessage.$Properties|null)
			static encode(m: waproto.Message.HighlyStructuredMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HighlyStructuredMessage & waproto.Message.HighlyStructuredMessage.$Shape
		}
		namespace HighlyStructuredMessage {
			interface $Properties {
				namespace?: (string|null)
				elementName?: (string|null)
				params?: (string[]|null)
				fallbackLg?: (string|null)
				fallbackLc?: (string|null)
				localizableParams?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.$Properties[]|null)
				deterministicLg?: (string|null)
				deterministicLc?: (string|null)
				hydratedHsm?: (waproto.Message.TemplateMessage.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.HighlyStructuredMessage.$Properties
			interface IHSMLocalizableParameter extends waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.$Properties {
			}
			class HSMLocalizableParameter {
				constructor(p?: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.$Properties)
				$unknowns?: Uint8Array[]
				default?: (string|null)
				currency?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMCurrency.$Properties|null)
				dateTime?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.$Properties|null)
				static encode(m: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter & waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.$Shape
			}
			namespace HSMLocalizableParameter {
				interface $Properties {
					"default"?: (string|null)
					currency?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMCurrency.$Properties|null)
					dateTime?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.$Properties|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.$Properties
				interface IHSMDateTime extends waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.$Properties {
				}
				class HSMDateTime {
					constructor(p?: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.$Properties)
					$unknowns?: Uint8Array[]
					component?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.$Properties|null)
					unixEpoch?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeUnixEpoch.$Properties|null)
					static encode(m: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime & waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.$Shape
				}
				namespace HSMDateTime {
					interface $Properties {
						component?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.$Properties|null)
						unixEpoch?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeUnixEpoch.$Properties|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.$Properties
					interface IHSMDateTimeUnixEpoch extends waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeUnixEpoch.$Properties {
					}
					class HSMDateTimeUnixEpoch {
						constructor(p?: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeUnixEpoch.$Properties)
						$unknowns?: Uint8Array[]
						timestamp?: (number|Long|null)
						static encode(m: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeUnixEpoch.$Properties, w?: PbWriter): PbWriter
						static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeUnixEpoch & waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeUnixEpoch.$Shape
					}
					namespace HSMDateTimeUnixEpoch {
						interface $Properties {
							timestamp?: (number|Long|null)
							$unknowns?: Uint8Array[]
						}
						type $Shape = waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeUnixEpoch.$Properties
					}
					interface IHSMDateTimeComponent extends waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.$Properties {
					}
					class HSMDateTimeComponent {
						constructor(p?: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.$Properties)
						$unknowns?: Uint8Array[]
						dayOfWeek?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.DayOfWeekType|null)
						year?: (number|null)
						month?: (number|null)
						dayOfMonth?: (number|null)
						hour?: (number|null)
						minute?: (number|null)
						calendar?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.CalendarType|null)
						static encode(m: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.$Properties, w?: PbWriter): PbWriter
						static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent & waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.$Shape
					}
					namespace HSMDateTimeComponent {
						interface $Properties {
							dayOfWeek?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.DayOfWeekType|null)
							year?: (number|null)
							month?: (number|null)
							dayOfMonth?: (number|null)
							hour?: (number|null)
							minute?: (number|null)
							calendar?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.CalendarType|null)
							$unknowns?: Uint8Array[]
						}
						type $Shape = waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.$Properties
						enum CalendarType {
							GREGORIAN = 1,
							SOLAR_HIJRI = 2
						}
						enum DayOfWeekType {
							MONDAY = 1,
							TUESDAY = 2,
							WEDNESDAY = 3,
							THURSDAY = 4,
							FRIDAY = 5,
							SATURDAY = 6,
							SUNDAY = 7
						}
					}
				}
				interface IHSMCurrency extends waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMCurrency.$Properties {
				}
				class HSMCurrency {
					constructor(p?: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMCurrency.$Properties)
					$unknowns?: Uint8Array[]
					currencyCode?: (string|null)
					amount1000?: (number|Long|null)
					static encode(m: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMCurrency.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMCurrency & waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMCurrency.$Shape
				}
				namespace HSMCurrency {
					interface $Properties {
						currencyCode?: (string|null)
						amount1000?: (number|Long|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMCurrency.$Properties
				}
			}
		}
		interface IContactsArrayMessage extends waproto.Message.ContactsArrayMessage.$Properties {
		}
		class ContactsArrayMessage {
			constructor(p?: waproto.Message.ContactsArrayMessage.$Properties)
			$unknowns?: Uint8Array[]
			displayName?: (string|null)
			contacts: waproto.Message.ContactMessage.$Properties[]
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			static encode(m: waproto.Message.ContactsArrayMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ContactsArrayMessage & waproto.Message.ContactsArrayMessage.$Shape
		}
		namespace ContactsArrayMessage {
			interface $Properties {
				displayName?: (string|null)
				contacts?: (waproto.Message.ContactMessage.$Properties[]|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ContactsArrayMessage.$Properties
		}
		interface IInitialSecurityNotificationSettingSync extends waproto.Message.InitialSecurityNotificationSettingSync.$Properties {
		}
		class InitialSecurityNotificationSettingSync {
			constructor(p?: waproto.Message.InitialSecurityNotificationSettingSync.$Properties)
			$unknowns?: Uint8Array[]
			securityNotificationEnabled?: (boolean|null)
			static encode(m: waproto.Message.InitialSecurityNotificationSettingSync.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InitialSecurityNotificationSettingSync & waproto.Message.InitialSecurityNotificationSettingSync.$Shape
		}
		namespace InitialSecurityNotificationSettingSync {
			interface $Properties {
				securityNotificationEnabled?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.InitialSecurityNotificationSettingSync.$Properties
		}
		interface IPeerDataOperationRequestResponseMessage extends waproto.Message.PeerDataOperationRequestResponseMessage.$Properties {
		}
		class PeerDataOperationRequestResponseMessage {
			constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.$Properties)
			$unknowns?: Uint8Array[]
			peerDataOperationRequestType?: (waproto.Message.PeerDataOperationRequestType|null)
			stanzaId?: (string|null)
			peerDataOperationResult: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.$Properties[]
			static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage & waproto.Message.PeerDataOperationRequestResponseMessage.$Shape
		}
		namespace PeerDataOperationRequestResponseMessage {
			interface $Properties {
				peerDataOperationRequestType?: (waproto.Message.PeerDataOperationRequestType|null)
				stanzaId?: (string|null)
				peerDataOperationResult?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.$Properties
			interface IPeerDataOperationResult extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.$Properties {
			}
			class PeerDataOperationResult {
				constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.$Properties)
				$unknowns?: Uint8Array[]
				mediaUploadResult?: (waproto.MediaRetryNotification.ResultType|null)
				stickerMessage?: (waproto.Message.StickerMessage.$Properties|null)
				linkPreviewResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.$Properties|null)
				placeholderMessageResendResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.PlaceholderMessageResendResponse.$Properties|null)
				waffleNonceFetchRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.WaffleNonceFetchResponse.$Properties|null)
				fullHistorySyncOnDemandRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandRequestResponse.$Properties|null)
				companionMetaNonceFetchRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionMetaNonceFetchResponse.$Properties|null)
				syncdSnapshotFatalRecoveryResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.SyncDSnapshotFatalRecoveryResponse.$Properties|null)
				companionCanonicalUserNonceFetchRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionCanonicalUserNonceFetchResponse.$Properties|null)
				historySyncChunkRetryResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponse.$Properties|null)
				flowResponsesCsvBundle?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FlowResponsesCsvBundle.$Properties|null)
				bizBroadcastInsightsContactListResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactListResponse.$Properties|null)
				static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.$Shape
			}
			namespace PeerDataOperationResult {
				interface $Properties {
					mediaUploadResult?: (waproto.MediaRetryNotification.ResultType|null)
					stickerMessage?: (waproto.Message.StickerMessage.$Properties|null)
					linkPreviewResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.$Properties|null)
					placeholderMessageResendResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.PlaceholderMessageResendResponse.$Properties|null)
					waffleNonceFetchRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.WaffleNonceFetchResponse.$Properties|null)
					fullHistorySyncOnDemandRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandRequestResponse.$Properties|null)
					companionMetaNonceFetchRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionMetaNonceFetchResponse.$Properties|null)
					syncdSnapshotFatalRecoveryResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.SyncDSnapshotFatalRecoveryResponse.$Properties|null)
					companionCanonicalUserNonceFetchRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionCanonicalUserNonceFetchResponse.$Properties|null)
					historySyncChunkRetryResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponse.$Properties|null)
					flowResponsesCsvBundle?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FlowResponsesCsvBundle.$Properties|null)
					bizBroadcastInsightsContactListResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactListResponse.$Properties|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.$Properties
				enum HistorySyncChunkRetryResponseCode {
					GENERATION_ERROR = 1,
					CHUNK_CONSUMED = 2,
					TIMEOUT = 3,
					SESSION_EXHAUSTED = 4,
					CHUNK_EXHAUSTED = 5,
					DUPLICATED_REQUEST = 6
				}
				enum FullHistorySyncOnDemandResponseCode {
					REQUEST_SUCCESS = 0,
					REQUEST_TIME_EXPIRED = 1,
					DECLINED_SHARING_HISTORY = 2,
					GENERIC_ERROR = 3,
					ERROR_REQUEST_ON_NON_SMB_PRIMARY = 4,
					ERROR_HOSTED_DEVICE_NOT_CONNECTED = 5,
					ERROR_HOSTED_DEVICE_LOGIN_TIME_NOT_SET = 6,
					ERROR_MULTI_PROVIDER_NOT_CONFIGURED = 7
				}
				interface IFlowResponsesCsvBundle extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FlowResponsesCsvBundle.$Properties {
				}
				class FlowResponsesCsvBundle {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FlowResponsesCsvBundle.$Properties)
					$unknowns?: Uint8Array[]
					flowId?: (string|null)
					galaxyFlowDownloadRequestId?: (string|null)
					fileName?: (string|null)
					mimetype?: (string|null)
					fileSha256?: (Uint8Array|null)
					mediaKey?: (Uint8Array|null)
					fileEncSha256?: (Uint8Array|null)
					directPath?: (string|null)
					mediaKeyTimestamp?: (number|Long|null)
					fileLength?: (number|Long|null)
					static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FlowResponsesCsvBundle.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FlowResponsesCsvBundle & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FlowResponsesCsvBundle.$Shape
				}
				namespace FlowResponsesCsvBundle {
					interface $Properties {
						flowId?: (string|null)
						galaxyFlowDownloadRequestId?: (string|null)
						fileName?: (string|null)
						mimetype?: (string|null)
						fileSha256?: (Uint8Array|null)
						mediaKey?: (Uint8Array|null)
						fileEncSha256?: (Uint8Array|null)
						directPath?: (string|null)
						mediaKeyTimestamp?: (number|Long|null)
						fileLength?: (number|Long|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FlowResponsesCsvBundle.$Properties
				}
				interface IBizBroadcastInsightsContactListResponse extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactListResponse.$Properties {
				}
				class BizBroadcastInsightsContactListResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactListResponse.$Properties)
					$unknowns?: Uint8Array[]
					campaignId?: (string|null)
					timestampMs?: (number|Long|null)
					contacts: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactState.$Properties[]
					static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactListResponse.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactListResponse & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactListResponse.$Shape
				}
				namespace BizBroadcastInsightsContactListResponse {
					interface $Properties {
						campaignId?: (string|null)
						timestampMs?: (number|Long|null)
						contacts?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactState.$Properties[]|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactListResponse.$Properties
				}
				interface IBizBroadcastInsightsContactState extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactState.$Properties {
				}
				class BizBroadcastInsightsContactState {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactState.$Properties)
					$unknowns?: Uint8Array[]
					contactJid?: (string|null)
					state?: (waproto.Message.InsightDeliveryState|null)
					static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactState.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactState & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactState.$Shape
				}
				namespace BizBroadcastInsightsContactState {
					interface $Properties {
						contactJid?: (string|null)
						state?: (waproto.Message.InsightDeliveryState|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactState.$Properties
				}
				interface IHistorySyncChunkRetryResponse extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponse.$Properties {
				}
				class HistorySyncChunkRetryResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponse.$Properties)
					$unknowns?: Uint8Array[]
					syncType?: (waproto.Message.HistorySyncType|null)
					chunkOrder?: (number|null)
					requestId?: (string|null)
					responseCode?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponseCode|null)
					canRecover?: (boolean|null)
					static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponse.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponse & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponse.$Shape
				}
				namespace HistorySyncChunkRetryResponse {
					interface $Properties {
						syncType?: (waproto.Message.HistorySyncType|null)
						chunkOrder?: (number|null)
						requestId?: (string|null)
						responseCode?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponseCode|null)
						canRecover?: (boolean|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponse.$Properties
				}
				interface ISyncDSnapshotFatalRecoveryResponse extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.SyncDSnapshotFatalRecoveryResponse.$Properties {
				}
				class SyncDSnapshotFatalRecoveryResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.SyncDSnapshotFatalRecoveryResponse.$Properties)
					$unknowns?: Uint8Array[]
					collectionSnapshot?: (Uint8Array|null)
					isCompressed?: (boolean|null)
					static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.SyncDSnapshotFatalRecoveryResponse.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.SyncDSnapshotFatalRecoveryResponse & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.SyncDSnapshotFatalRecoveryResponse.$Shape
				}
				namespace SyncDSnapshotFatalRecoveryResponse {
					interface $Properties {
						collectionSnapshot?: (Uint8Array|null)
						isCompressed?: (boolean|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.SyncDSnapshotFatalRecoveryResponse.$Properties
				}
				interface ICompanionCanonicalUserNonceFetchResponse extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionCanonicalUserNonceFetchResponse.$Properties {
				}
				class CompanionCanonicalUserNonceFetchResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionCanonicalUserNonceFetchResponse.$Properties)
					$unknowns?: Uint8Array[]
					nonce?: (string|null)
					waFbid?: (string|null)
					forceRefresh?: (boolean|null)
					static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionCanonicalUserNonceFetchResponse.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionCanonicalUserNonceFetchResponse & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionCanonicalUserNonceFetchResponse.$Shape
				}
				namespace CompanionCanonicalUserNonceFetchResponse {
					interface $Properties {
						nonce?: (string|null)
						waFbid?: (string|null)
						forceRefresh?: (boolean|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionCanonicalUserNonceFetchResponse.$Properties
				}
				interface ICompanionMetaNonceFetchResponse extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionMetaNonceFetchResponse.$Properties {
				}
				class CompanionMetaNonceFetchResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionMetaNonceFetchResponse.$Properties)
					$unknowns?: Uint8Array[]
					nonce?: (string|null)
					static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionMetaNonceFetchResponse.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionMetaNonceFetchResponse & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionMetaNonceFetchResponse.$Shape
				}
				namespace CompanionMetaNonceFetchResponse {
					interface $Properties {
						nonce?: (string|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionMetaNonceFetchResponse.$Properties
				}
				interface IWaffleNonceFetchResponse extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.WaffleNonceFetchResponse.$Properties {
				}
				class WaffleNonceFetchResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.WaffleNonceFetchResponse.$Properties)
					$unknowns?: Uint8Array[]
					nonce?: (string|null)
					waEntFbid?: (string|null)
					static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.WaffleNonceFetchResponse.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.WaffleNonceFetchResponse & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.WaffleNonceFetchResponse.$Shape
				}
				namespace WaffleNonceFetchResponse {
					interface $Properties {
						nonce?: (string|null)
						waEntFbid?: (string|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.WaffleNonceFetchResponse.$Properties
				}
				interface IFullHistorySyncOnDemandRequestResponse extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandRequestResponse.$Properties {
				}
				class FullHistorySyncOnDemandRequestResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandRequestResponse.$Properties)
					$unknowns?: Uint8Array[]
					requestMetadata?: (waproto.Message.FullHistorySyncOnDemandRequestMetadata.$Properties|null)
					responseCode?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandResponseCode|null)
					static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandRequestResponse.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandRequestResponse & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandRequestResponse.$Shape
				}
				namespace FullHistorySyncOnDemandRequestResponse {
					interface $Properties {
						requestMetadata?: (waproto.Message.FullHistorySyncOnDemandRequestMetadata.$Properties|null)
						responseCode?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandResponseCode|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandRequestResponse.$Properties
				}
				interface IPlaceholderMessageResendResponse extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.PlaceholderMessageResendResponse.$Properties {
				}
				class PlaceholderMessageResendResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.PlaceholderMessageResendResponse.$Properties)
					$unknowns?: Uint8Array[]
					webMessageInfoBytes?: (Uint8Array|null)
					static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.PlaceholderMessageResendResponse.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.PlaceholderMessageResendResponse & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.PlaceholderMessageResendResponse.$Shape
				}
				namespace PlaceholderMessageResendResponse {
					interface $Properties {
						webMessageInfoBytes?: (Uint8Array|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.PlaceholderMessageResendResponse.$Properties
				}
				interface ILinkPreviewResponse extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.$Properties {
				}
				class LinkPreviewResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.$Properties)
					$unknowns?: Uint8Array[]
					url?: (string|null)
					title?: (string|null)
					description?: (string|null)
					thumbData?: (Uint8Array|null)
					matchText?: (string|null)
					previewType?: (string|null)
					hqThumbnail?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.LinkPreviewHighQualityThumbnail.$Properties|null)
					previewMetadata?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.PaymentLinkPreviewMetadata.$Properties|null)
					static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.$Properties, w?: PbWriter): PbWriter
					static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.$Shape
				}
				namespace LinkPreviewResponse {
					interface $Properties {
						url?: (string|null)
						title?: (string|null)
						description?: (string|null)
						thumbData?: (Uint8Array|null)
						matchText?: (string|null)
						previewType?: (string|null)
						hqThumbnail?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.LinkPreviewHighQualityThumbnail.$Properties|null)
						previewMetadata?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.PaymentLinkPreviewMetadata.$Properties|null)
						$unknowns?: Uint8Array[]
					}
					type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.$Properties
					interface IPaymentLinkPreviewMetadata extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.PaymentLinkPreviewMetadata.$Properties {
					}
					class PaymentLinkPreviewMetadata {
						constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.PaymentLinkPreviewMetadata.$Properties)
						$unknowns?: Uint8Array[]
						isBusinessVerified?: (boolean|null)
						providerName?: (string|null)
						amount?: (string|null)
						offset?: (string|null)
						currency?: (string|null)
						static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.PaymentLinkPreviewMetadata.$Properties, w?: PbWriter): PbWriter
						static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.PaymentLinkPreviewMetadata & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.PaymentLinkPreviewMetadata.$Shape
					}
					namespace PaymentLinkPreviewMetadata {
						interface $Properties {
							isBusinessVerified?: (boolean|null)
							providerName?: (string|null)
							amount?: (string|null)
							offset?: (string|null)
							currency?: (string|null)
							$unknowns?: Uint8Array[]
						}
						type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.PaymentLinkPreviewMetadata.$Properties
					}
					interface ILinkPreviewHighQualityThumbnail extends waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.LinkPreviewHighQualityThumbnail.$Properties {
					}
					class LinkPreviewHighQualityThumbnail {
						constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.LinkPreviewHighQualityThumbnail.$Properties)
						$unknowns?: Uint8Array[]
						directPath?: (string|null)
						thumbHash?: (string|null)
						encThumbHash?: (string|null)
						mediaKey?: (Uint8Array|null)
						mediaKeyTimestampMs?: (number|Long|null)
						thumbWidth?: (number|null)
						thumbHeight?: (number|null)
						static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.LinkPreviewHighQualityThumbnail.$Properties, w?: PbWriter): PbWriter
						static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.LinkPreviewHighQualityThumbnail & waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.LinkPreviewHighQualityThumbnail.$Shape
					}
					namespace LinkPreviewHighQualityThumbnail {
						interface $Properties {
							directPath?: (string|null)
							thumbHash?: (string|null)
							encThumbHash?: (string|null)
							mediaKey?: (Uint8Array|null)
							mediaKeyTimestampMs?: (number|Long|null)
							thumbWidth?: (number|null)
							thumbHeight?: (number|null)
							$unknowns?: Uint8Array[]
						}
						type $Shape = waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.LinkPreviewHighQualityThumbnail.$Properties
					}
				}
			}
		}
		interface IPeerDataOperationRequestMessage extends waproto.Message.PeerDataOperationRequestMessage.$Properties {
		}
		class PeerDataOperationRequestMessage {
			constructor(p?: waproto.Message.PeerDataOperationRequestMessage.$Properties)
			$unknowns?: Uint8Array[]
			peerDataOperationRequestType?: (waproto.Message.PeerDataOperationRequestType|null)
			requestStickerReupload: waproto.Message.PeerDataOperationRequestMessage.RequestStickerReupload.$Properties[]
			requestUrlPreview: waproto.Message.PeerDataOperationRequestMessage.RequestUrlPreview.$Properties[]
			historySyncOnDemandRequest?: (waproto.Message.PeerDataOperationRequestMessage.HistorySyncOnDemandRequest.$Properties|null)
			placeholderMessageResendRequest: waproto.Message.PeerDataOperationRequestMessage.PlaceholderMessageResendRequest.$Properties[]
			fullHistorySyncOnDemandRequest?: (waproto.Message.PeerDataOperationRequestMessage.FullHistorySyncOnDemandRequest.$Properties|null)
			syncdCollectionFatalRecoveryRequest?: (waproto.Message.PeerDataOperationRequestMessage.SyncDCollectionFatalRecoveryRequest.$Properties|null)
			historySyncChunkRetryRequest?: (waproto.Message.PeerDataOperationRequestMessage.HistorySyncChunkRetryRequest.$Properties|null)
			galaxyFlowAction?: (waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction.$Properties|null)
			companionCanonicalUserNonceFetchRequest?: (waproto.Message.PeerDataOperationRequestMessage.CompanionCanonicalUserNonceFetchRequest.$Properties|null)
			bizBroadcastInsightsContactListRequest?: (waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsContactListRequest.$Properties|null)
			bizBroadcastInsightsRefreshRequest?: (waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsRefreshRequest.$Properties|null)
			static encode(m: waproto.Message.PeerDataOperationRequestMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage & waproto.Message.PeerDataOperationRequestMessage.$Shape
		}
		namespace PeerDataOperationRequestMessage {
			interface $Properties {
				peerDataOperationRequestType?: (waproto.Message.PeerDataOperationRequestType|null)
				requestStickerReupload?: (waproto.Message.PeerDataOperationRequestMessage.RequestStickerReupload.$Properties[]|null)
				requestUrlPreview?: (waproto.Message.PeerDataOperationRequestMessage.RequestUrlPreview.$Properties[]|null)
				historySyncOnDemandRequest?: (waproto.Message.PeerDataOperationRequestMessage.HistorySyncOnDemandRequest.$Properties|null)
				placeholderMessageResendRequest?: (waproto.Message.PeerDataOperationRequestMessage.PlaceholderMessageResendRequest.$Properties[]|null)
				fullHistorySyncOnDemandRequest?: (waproto.Message.PeerDataOperationRequestMessage.FullHistorySyncOnDemandRequest.$Properties|null)
				syncdCollectionFatalRecoveryRequest?: (waproto.Message.PeerDataOperationRequestMessage.SyncDCollectionFatalRecoveryRequest.$Properties|null)
				historySyncChunkRetryRequest?: (waproto.Message.PeerDataOperationRequestMessage.HistorySyncChunkRetryRequest.$Properties|null)
				galaxyFlowAction?: (waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction.$Properties|null)
				companionCanonicalUserNonceFetchRequest?: (waproto.Message.PeerDataOperationRequestMessage.CompanionCanonicalUserNonceFetchRequest.$Properties|null)
				bizBroadcastInsightsContactListRequest?: (waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsContactListRequest.$Properties|null)
				bizBroadcastInsightsRefreshRequest?: (waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsRefreshRequest.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PeerDataOperationRequestMessage.$Properties
			interface IBizBroadcastInsightsRefreshRequest extends waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsRefreshRequest.$Properties {
			}
			class BizBroadcastInsightsRefreshRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsRefreshRequest.$Properties)
				$unknowns?: Uint8Array[]
				campaignId?: (string|null)
				static encode(m: waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsRefreshRequest.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsRefreshRequest & waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsRefreshRequest.$Shape
			}
			namespace BizBroadcastInsightsRefreshRequest {
				interface $Properties {
					campaignId?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsRefreshRequest.$Properties
			}
			interface IBizBroadcastInsightsContactListRequest extends waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsContactListRequest.$Properties {
			}
			class BizBroadcastInsightsContactListRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsContactListRequest.$Properties)
				$unknowns?: Uint8Array[]
				campaignId?: (string|null)
				static encode(m: waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsContactListRequest.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsContactListRequest & waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsContactListRequest.$Shape
			}
			namespace BizBroadcastInsightsContactListRequest {
				interface $Properties {
					campaignId?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsContactListRequest.$Properties
			}
			interface ICompanionCanonicalUserNonceFetchRequest extends waproto.Message.PeerDataOperationRequestMessage.CompanionCanonicalUserNonceFetchRequest.$Properties {
			}
			class CompanionCanonicalUserNonceFetchRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.CompanionCanonicalUserNonceFetchRequest.$Properties)
				$unknowns?: Uint8Array[]
				registrationTraceId?: (string|null)
				static encode(m: waproto.Message.PeerDataOperationRequestMessage.CompanionCanonicalUserNonceFetchRequest.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.CompanionCanonicalUserNonceFetchRequest & waproto.Message.PeerDataOperationRequestMessage.CompanionCanonicalUserNonceFetchRequest.$Shape
			}
			namespace CompanionCanonicalUserNonceFetchRequest {
				interface $Properties {
					registrationTraceId?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PeerDataOperationRequestMessage.CompanionCanonicalUserNonceFetchRequest.$Properties
			}
			interface IGalaxyFlowAction extends waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction.$Properties {
			}
			class GalaxyFlowAction {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction.$Properties)
				$unknowns?: Uint8Array[]
				type?: (waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction.GalaxyFlowActionType|null)
				flowId?: (string|null)
				stanzaId?: (string|null)
				galaxyFlowDownloadRequestId?: (string|null)
				agmId?: (string|null)
				static encode(m: waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction & waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction.$Shape
			}
			namespace GalaxyFlowAction {
				interface $Properties {
					type?: (waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction.GalaxyFlowActionType|null)
					flowId?: (string|null)
					stanzaId?: (string|null)
					galaxyFlowDownloadRequestId?: (string|null)
					agmId?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction.$Properties
				enum GalaxyFlowActionType {
					NOTIFY_LAUNCH = 1,
					DOWNLOAD_RESPONSES = 2
				}
			}
			interface IHistorySyncChunkRetryRequest extends waproto.Message.PeerDataOperationRequestMessage.HistorySyncChunkRetryRequest.$Properties {
			}
			class HistorySyncChunkRetryRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.HistorySyncChunkRetryRequest.$Properties)
				$unknowns?: Uint8Array[]
				syncType?: (waproto.Message.HistorySyncType|null)
				chunkOrder?: (number|null)
				chunkNotificationId?: (string|null)
				regenerateChunk?: (boolean|null)
				static encode(m: waproto.Message.PeerDataOperationRequestMessage.HistorySyncChunkRetryRequest.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.HistorySyncChunkRetryRequest & waproto.Message.PeerDataOperationRequestMessage.HistorySyncChunkRetryRequest.$Shape
			}
			namespace HistorySyncChunkRetryRequest {
				interface $Properties {
					syncType?: (waproto.Message.HistorySyncType|null)
					chunkOrder?: (number|null)
					chunkNotificationId?: (string|null)
					regenerateChunk?: (boolean|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PeerDataOperationRequestMessage.HistorySyncChunkRetryRequest.$Properties
			}
			interface ISyncDCollectionFatalRecoveryRequest extends waproto.Message.PeerDataOperationRequestMessage.SyncDCollectionFatalRecoveryRequest.$Properties {
			}
			class SyncDCollectionFatalRecoveryRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.SyncDCollectionFatalRecoveryRequest.$Properties)
				$unknowns?: Uint8Array[]
				collectionName?: (string|null)
				timestamp?: (number|Long|null)
				static encode(m: waproto.Message.PeerDataOperationRequestMessage.SyncDCollectionFatalRecoveryRequest.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.SyncDCollectionFatalRecoveryRequest & waproto.Message.PeerDataOperationRequestMessage.SyncDCollectionFatalRecoveryRequest.$Shape
			}
			namespace SyncDCollectionFatalRecoveryRequest {
				interface $Properties {
					collectionName?: (string|null)
					timestamp?: (number|Long|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PeerDataOperationRequestMessage.SyncDCollectionFatalRecoveryRequest.$Properties
			}
			interface IPlaceholderMessageResendRequest extends waproto.Message.PeerDataOperationRequestMessage.PlaceholderMessageResendRequest.$Properties {
			}
			class PlaceholderMessageResendRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.PlaceholderMessageResendRequest.$Properties)
				$unknowns?: Uint8Array[]
				messageKey?: (waproto.MessageKey.$Properties|null)
				static encode(m: waproto.Message.PeerDataOperationRequestMessage.PlaceholderMessageResendRequest.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.PlaceholderMessageResendRequest & waproto.Message.PeerDataOperationRequestMessage.PlaceholderMessageResendRequest.$Shape
			}
			namespace PlaceholderMessageResendRequest {
				interface $Properties {
					messageKey?: (waproto.MessageKey.$Properties|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PeerDataOperationRequestMessage.PlaceholderMessageResendRequest.$Properties
			}
			interface IFullHistorySyncOnDemandRequest extends waproto.Message.PeerDataOperationRequestMessage.FullHistorySyncOnDemandRequest.$Properties {
			}
			class FullHistorySyncOnDemandRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.FullHistorySyncOnDemandRequest.$Properties)
				$unknowns?: Uint8Array[]
				requestMetadata?: (waproto.Message.FullHistorySyncOnDemandRequestMetadata.$Properties|null)
				historySyncConfig?: (waproto.DeviceProps.HistorySyncConfig.$Properties|null)
				fullHistorySyncOnDemandConfig?: (waproto.Message.FullHistorySyncOnDemandConfig.$Properties|null)
				static encode(m: waproto.Message.PeerDataOperationRequestMessage.FullHistorySyncOnDemandRequest.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.FullHistorySyncOnDemandRequest & waproto.Message.PeerDataOperationRequestMessage.FullHistorySyncOnDemandRequest.$Shape
			}
			namespace FullHistorySyncOnDemandRequest {
				interface $Properties {
					requestMetadata?: (waproto.Message.FullHistorySyncOnDemandRequestMetadata.$Properties|null)
					historySyncConfig?: (waproto.DeviceProps.HistorySyncConfig.$Properties|null)
					fullHistorySyncOnDemandConfig?: (waproto.Message.FullHistorySyncOnDemandConfig.$Properties|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PeerDataOperationRequestMessage.FullHistorySyncOnDemandRequest.$Properties
			}
			interface IHistorySyncOnDemandRequest extends waproto.Message.PeerDataOperationRequestMessage.HistorySyncOnDemandRequest.$Properties {
			}
			class HistorySyncOnDemandRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.HistorySyncOnDemandRequest.$Properties)
				$unknowns?: Uint8Array[]
				chatJid?: (string|null)
				oldestMsgId?: (string|null)
				oldestMsgFromMe?: (boolean|null)
				onDemandMsgCount?: (number|null)
				oldestMsgTimestampMs?: (number|Long|null)
				accountLid?: (string|null)
				supportInlineResponse?: (boolean|null)
				static encode(m: waproto.Message.PeerDataOperationRequestMessage.HistorySyncOnDemandRequest.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.HistorySyncOnDemandRequest & waproto.Message.PeerDataOperationRequestMessage.HistorySyncOnDemandRequest.$Shape
			}
			namespace HistorySyncOnDemandRequest {
				interface $Properties {
					chatJid?: (string|null)
					oldestMsgId?: (string|null)
					oldestMsgFromMe?: (boolean|null)
					onDemandMsgCount?: (number|null)
					oldestMsgTimestampMs?: (number|Long|null)
					accountLid?: (string|null)
					supportInlineResponse?: (boolean|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PeerDataOperationRequestMessage.HistorySyncOnDemandRequest.$Properties
			}
			interface IRequestUrlPreview extends waproto.Message.PeerDataOperationRequestMessage.RequestUrlPreview.$Properties {
			}
			class RequestUrlPreview {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.RequestUrlPreview.$Properties)
				$unknowns?: Uint8Array[]
				url?: (string|null)
				includeHqThumbnail?: (boolean|null)
				static encode(m: waproto.Message.PeerDataOperationRequestMessage.RequestUrlPreview.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.RequestUrlPreview & waproto.Message.PeerDataOperationRequestMessage.RequestUrlPreview.$Shape
			}
			namespace RequestUrlPreview {
				interface $Properties {
					url?: (string|null)
					includeHqThumbnail?: (boolean|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PeerDataOperationRequestMessage.RequestUrlPreview.$Properties
			}
			interface IRequestStickerReupload extends waproto.Message.PeerDataOperationRequestMessage.RequestStickerReupload.$Properties {
			}
			class RequestStickerReupload {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.RequestStickerReupload.$Properties)
				$unknowns?: Uint8Array[]
				fileSha256?: (string|null)
				static encode(m: waproto.Message.PeerDataOperationRequestMessage.RequestStickerReupload.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.RequestStickerReupload & waproto.Message.PeerDataOperationRequestMessage.RequestStickerReupload.$Shape
			}
			namespace RequestStickerReupload {
				interface $Properties {
					fileSha256?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PeerDataOperationRequestMessage.RequestStickerReupload.$Properties
			}
		}
		interface IFullHistorySyncOnDemandConfig extends waproto.Message.FullHistorySyncOnDemandConfig.$Properties {
		}
		class FullHistorySyncOnDemandConfig {
			constructor(p?: waproto.Message.FullHistorySyncOnDemandConfig.$Properties)
			$unknowns?: Uint8Array[]
			historyFromTimestamp?: (number|Long|null)
			historyDurationDays?: (number|null)
			static encode(m: waproto.Message.FullHistorySyncOnDemandConfig.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.FullHistorySyncOnDemandConfig & waproto.Message.FullHistorySyncOnDemandConfig.$Shape
		}
		namespace FullHistorySyncOnDemandConfig {
			interface $Properties {
				historyFromTimestamp?: (number|Long|null)
				historyDurationDays?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.FullHistorySyncOnDemandConfig.$Properties
		}
		interface IFullHistorySyncOnDemandRequestMetadata extends waproto.Message.FullHistorySyncOnDemandRequestMetadata.$Properties {
		}
		class FullHistorySyncOnDemandRequestMetadata {
			constructor(p?: waproto.Message.FullHistorySyncOnDemandRequestMetadata.$Properties)
			$unknowns?: Uint8Array[]
			requestId?: (string|null)
			businessProduct?: (string|null)
			opaqueClientData?: (Uint8Array|null)
			static encode(m: waproto.Message.FullHistorySyncOnDemandRequestMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.FullHistorySyncOnDemandRequestMetadata & waproto.Message.FullHistorySyncOnDemandRequestMetadata.$Shape
		}
		namespace FullHistorySyncOnDemandRequestMetadata {
			interface $Properties {
				requestId?: (string|null)
				businessProduct?: (string|null)
				opaqueClientData?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.FullHistorySyncOnDemandRequestMetadata.$Properties
		}
		interface IAppStateFatalExceptionNotification extends waproto.Message.AppStateFatalExceptionNotification.$Properties {
		}
		class AppStateFatalExceptionNotification {
			constructor(p?: waproto.Message.AppStateFatalExceptionNotification.$Properties)
			$unknowns?: Uint8Array[]
			collectionNames: string[]
			timestamp?: (number|Long|null)
			static encode(m: waproto.Message.AppStateFatalExceptionNotification.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateFatalExceptionNotification & waproto.Message.AppStateFatalExceptionNotification.$Shape
		}
		namespace AppStateFatalExceptionNotification {
			interface $Properties {
				collectionNames?: (string[]|null)
				timestamp?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.AppStateFatalExceptionNotification.$Properties
		}
		interface IAppStateSyncKeyRequest extends waproto.Message.AppStateSyncKeyRequest.$Properties {
		}
		class AppStateSyncKeyRequest {
			constructor(p?: waproto.Message.AppStateSyncKeyRequest.$Properties)
			$unknowns?: Uint8Array[]
			keyIds: waproto.Message.AppStateSyncKeyId.$Properties[]
			static encode(m: waproto.Message.AppStateSyncKeyRequest.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateSyncKeyRequest & waproto.Message.AppStateSyncKeyRequest.$Shape
		}
		namespace AppStateSyncKeyRequest {
			interface $Properties {
				keyIds?: (waproto.Message.AppStateSyncKeyId.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.AppStateSyncKeyRequest.$Properties
		}
		interface IAppStateSyncKeyShare extends waproto.Message.AppStateSyncKeyShare.$Properties {
		}
		class AppStateSyncKeyShare {
			constructor(p?: waproto.Message.AppStateSyncKeyShare.$Properties)
			$unknowns?: Uint8Array[]
			keys: waproto.Message.AppStateSyncKey.$Properties[]
			static encode(m: waproto.Message.AppStateSyncKeyShare.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateSyncKeyShare & waproto.Message.AppStateSyncKeyShare.$Shape
		}
		namespace AppStateSyncKeyShare {
			interface $Properties {
				keys?: (waproto.Message.AppStateSyncKey.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.AppStateSyncKeyShare.$Properties
		}
		interface IAppStateSyncKeyData extends waproto.Message.AppStateSyncKeyData.$Properties {
		}
		class AppStateSyncKeyData {
			constructor(p?: waproto.Message.AppStateSyncKeyData.$Properties)
			$unknowns?: Uint8Array[]
			keyData?: (Uint8Array|null)
			fingerprint?: (waproto.Message.AppStateSyncKeyFingerprint.$Properties|null)
			timestamp?: (number|Long|null)
			static encode(m: waproto.Message.AppStateSyncKeyData.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateSyncKeyData & waproto.Message.AppStateSyncKeyData.$Shape
		}
		namespace AppStateSyncKeyData {
			interface $Properties {
				keyData?: (Uint8Array|null)
				fingerprint?: (waproto.Message.AppStateSyncKeyFingerprint.$Properties|null)
				timestamp?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.AppStateSyncKeyData.$Properties
		}
		interface IAppStateSyncKeyFingerprint extends waproto.Message.AppStateSyncKeyFingerprint.$Properties {
		}
		class AppStateSyncKeyFingerprint {
			constructor(p?: waproto.Message.AppStateSyncKeyFingerprint.$Properties)
			$unknowns?: Uint8Array[]
			rawId?: (number|null)
			currentIndex?: (number|null)
			deviceIndexes: number[]
			static encode(m: waproto.Message.AppStateSyncKeyFingerprint.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateSyncKeyFingerprint & waproto.Message.AppStateSyncKeyFingerprint.$Shape
		}
		namespace AppStateSyncKeyFingerprint {
			interface $Properties {
				rawId?: (number|null)
				currentIndex?: (number|null)
				deviceIndexes?: (number[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.AppStateSyncKeyFingerprint.$Properties
		}
		interface IAppStateSyncKeyId extends waproto.Message.AppStateSyncKeyId.$Properties {
		}
		class AppStateSyncKeyId {
			constructor(p?: waproto.Message.AppStateSyncKeyId.$Properties)
			$unknowns?: Uint8Array[]
			keyId?: (Uint8Array|null)
			static encode(m: waproto.Message.AppStateSyncKeyId.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateSyncKeyId & waproto.Message.AppStateSyncKeyId.$Shape
		}
		namespace AppStateSyncKeyId {
			interface $Properties {
				keyId?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.AppStateSyncKeyId.$Properties
		}
		interface IAppStateSyncKey extends waproto.Message.AppStateSyncKey.$Properties {
		}
		class AppStateSyncKey {
			constructor(p?: waproto.Message.AppStateSyncKey.$Properties)
			$unknowns?: Uint8Array[]
			keyId?: (waproto.Message.AppStateSyncKeyId.$Properties|null)
			keyData?: (waproto.Message.AppStateSyncKeyData.$Properties|null)
			static encode(m: waproto.Message.AppStateSyncKey.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateSyncKey & waproto.Message.AppStateSyncKey.$Shape
		}
		namespace AppStateSyncKey {
			interface $Properties {
				keyId?: (waproto.Message.AppStateSyncKeyId.$Properties|null)
				keyData?: (waproto.Message.AppStateSyncKeyData.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.AppStateSyncKey.$Properties
		}
		interface IHistorySyncNotification extends waproto.Message.HistorySyncNotification.$Properties {
		}
		class HistorySyncNotification {
			constructor(p?: waproto.Message.HistorySyncNotification.$Properties)
			$unknowns?: Uint8Array[]
			fileSha256?: (Uint8Array|null)
			fileLength?: (number|Long|null)
			mediaKey?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			directPath?: (string|null)
			syncType?: (waproto.Message.HistorySyncType|null)
			chunkOrder?: (number|null)
			originalMessageId?: (string|null)
			progress?: (number|null)
			oldestMsgInChunkTimestampSec?: (number|Long|null)
			initialHistBootstrapInlinePayload?: (Uint8Array|null)
			peerDataRequestSessionId?: (string|null)
			fullHistorySyncOnDemandRequestMetadata?: (waproto.Message.FullHistorySyncOnDemandRequestMetadata.$Properties|null)
			encHandle?: (string|null)
			messageAccessStatus?: (waproto.Message.HistorySyncMessageAccessStatus.$Properties|null)
			static encode(m: waproto.Message.HistorySyncNotification.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HistorySyncNotification & waproto.Message.HistorySyncNotification.$Shape
		}
		namespace HistorySyncNotification {
			interface $Properties {
				fileSha256?: (Uint8Array|null)
				fileLength?: (number|Long|null)
				mediaKey?: (Uint8Array|null)
				fileEncSha256?: (Uint8Array|null)
				directPath?: (string|null)
				syncType?: (waproto.Message.HistorySyncType|null)
				chunkOrder?: (number|null)
				originalMessageId?: (string|null)
				progress?: (number|null)
				oldestMsgInChunkTimestampSec?: (number|Long|null)
				initialHistBootstrapInlinePayload?: (Uint8Array|null)
				peerDataRequestSessionId?: (string|null)
				fullHistorySyncOnDemandRequestMetadata?: (waproto.Message.FullHistorySyncOnDemandRequestMetadata.$Properties|null)
				encHandle?: (string|null)
				messageAccessStatus?: (waproto.Message.HistorySyncMessageAccessStatus.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.HistorySyncNotification.$Properties
		}
		interface IHistorySyncMessageAccessStatus extends waproto.Message.HistorySyncMessageAccessStatus.$Properties {
		}
		class HistorySyncMessageAccessStatus {
			constructor(p?: waproto.Message.HistorySyncMessageAccessStatus.$Properties)
			$unknowns?: Uint8Array[]
			completeAccessGranted?: (boolean|null)
			static encode(m: waproto.Message.HistorySyncMessageAccessStatus.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HistorySyncMessageAccessStatus & waproto.Message.HistorySyncMessageAccessStatus.$Shape
		}
		namespace HistorySyncMessageAccessStatus {
			interface $Properties {
				completeAccessGranted?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.HistorySyncMessageAccessStatus.$Properties
		}
		interface IRequestWelcomeMessageMetadata extends waproto.Message.RequestWelcomeMessageMetadata.$Properties {
		}
		class RequestWelcomeMessageMetadata {
			constructor(p?: waproto.Message.RequestWelcomeMessageMetadata.$Properties)
			$unknowns?: Uint8Array[]
			localChatState?: (waproto.Message.RequestWelcomeMessageMetadata.LocalChatState|null)
			welcomeTrigger?: (waproto.Message.RequestWelcomeMessageMetadata.WelcomeTrigger|null)
			botAgentMetadata?: (waproto.BotAgentMetadata.$Properties|null)
			static encode(m: waproto.Message.RequestWelcomeMessageMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.RequestWelcomeMessageMetadata & waproto.Message.RequestWelcomeMessageMetadata.$Shape
		}
		namespace RequestWelcomeMessageMetadata {
			interface $Properties {
				localChatState?: (waproto.Message.RequestWelcomeMessageMetadata.LocalChatState|null)
				welcomeTrigger?: (waproto.Message.RequestWelcomeMessageMetadata.WelcomeTrigger|null)
				botAgentMetadata?: (waproto.BotAgentMetadata.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.RequestWelcomeMessageMetadata.$Properties
			enum WelcomeTrigger {
				CHAT_OPEN = 0,
				COMPANION_PAIRING = 1
			}
			enum LocalChatState {
				EMPTY = 0,
				NON_EMPTY = 1
			}
		}
		interface IChatStockImageWallpaper extends waproto.Message.ChatStockImageWallpaper.$Properties {
		}
		class ChatStockImageWallpaper {
			constructor(p?: waproto.Message.ChatStockImageWallpaper.$Properties)
			$unknowns?: Uint8Array[]
			stockImageId?: (string|null)
			dimLevel?: (number|null)
			static encode(m: waproto.Message.ChatStockImageWallpaper.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ChatStockImageWallpaper & waproto.Message.ChatStockImageWallpaper.$Shape
		}
		namespace ChatStockImageWallpaper {
			interface $Properties {
				stockImageId?: (string|null)
				dimLevel?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ChatStockImageWallpaper.$Properties
		}
		interface IChatSolidColorWallpaper extends waproto.Message.ChatSolidColorWallpaper.$Properties {
		}
		class ChatSolidColorWallpaper {
			constructor(p?: waproto.Message.ChatSolidColorWallpaper.$Properties)
			$unknowns?: Uint8Array[]
			colorLight?: (string|null)
			colorDark?: (string|null)
			isDoodleEnabled?: (boolean|null)
			static encode(m: waproto.Message.ChatSolidColorWallpaper.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ChatSolidColorWallpaper & waproto.Message.ChatSolidColorWallpaper.$Shape
		}
		namespace ChatSolidColorWallpaper {
			interface $Properties {
				colorLight?: (string|null)
				colorDark?: (string|null)
				isDoodleEnabled?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ChatSolidColorWallpaper.$Properties
		}
		interface IChatDefaultWallpaper extends waproto.Message.ChatDefaultWallpaper.$Properties {
		}
		class ChatDefaultWallpaper {
			constructor(p?: waproto.Message.ChatDefaultWallpaper.$Properties)
			$unknowns?: Uint8Array[]
			isDoodleEnabled?: (boolean|null)
			static encode(m: waproto.Message.ChatDefaultWallpaper.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ChatDefaultWallpaper & waproto.Message.ChatDefaultWallpaper.$Shape
		}
		namespace ChatDefaultWallpaper {
			interface $Properties {
				isDoodleEnabled?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ChatDefaultWallpaper.$Properties
		}
		interface IChatCustomImageWallpaper extends waproto.Message.ChatCustomImageWallpaper.$Properties {
		}
		class ChatCustomImageWallpaper {
			constructor(p?: waproto.Message.ChatCustomImageWallpaper.$Properties)
			$unknowns?: Uint8Array[]
			directPath?: (string|null)
			mediaKey?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			fileSha256?: (Uint8Array|null)
			dimLevel?: (number|null)
			static encode(m: waproto.Message.ChatCustomImageWallpaper.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ChatCustomImageWallpaper & waproto.Message.ChatCustomImageWallpaper.$Shape
		}
		namespace ChatCustomImageWallpaper {
			interface $Properties {
				directPath?: (string|null)
				mediaKey?: (Uint8Array|null)
				fileEncSha256?: (Uint8Array|null)
				fileSha256?: (Uint8Array|null)
				dimLevel?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ChatCustomImageWallpaper.$Properties
		}
		interface IChatThemeSetting extends waproto.Message.ChatThemeSetting.$Properties {
		}
		class ChatThemeSetting {
			constructor(p?: waproto.Message.ChatThemeSetting.$Properties)
			$unknowns?: Uint8Array[]
			settingTimestampMs?: (number|Long|null)
			clearTheme?: (boolean|null)
			colorSchemeId?: (string|null)
			defaultWallpaper?: (waproto.Message.ChatDefaultWallpaper.$Properties|null)
			solidColor?: (waproto.Message.ChatSolidColorWallpaper.$Properties|null)
			stockImage?: (waproto.Message.ChatStockImageWallpaper.$Properties|null)
			customImage?: (waproto.Message.ChatCustomImageWallpaper.$Properties|null)
			static encode(m: waproto.Message.ChatThemeSetting.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ChatThemeSetting & waproto.Message.ChatThemeSetting.$Shape
		}
		namespace ChatThemeSetting {
			interface $Properties {
				settingTimestampMs?: (number|Long|null)
				clearTheme?: (boolean|null)
				colorSchemeId?: (string|null)
				defaultWallpaper?: (waproto.Message.ChatDefaultWallpaper.$Properties|null)
				solidColor?: (waproto.Message.ChatSolidColorWallpaper.$Properties|null)
				stockImage?: (waproto.Message.ChatStockImageWallpaper.$Properties|null)
				customImage?: (waproto.Message.ChatCustomImageWallpaper.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ChatThemeSetting.$Properties
		}
		interface IMarkAsVerifiedAction extends waproto.Message.MarkAsVerifiedAction.$Properties {
		}
		class MarkAsVerifiedAction {
			constructor(p?: waproto.Message.MarkAsVerifiedAction.$Properties)
			$unknowns?: Uint8Array[]
			userJidString?: (string|null)
			verified?: (boolean|null)
			verifiedIdentityKey?: (Uint8Array|null)
			actionSeq?: (number|Long|null)
			static encode(m: waproto.Message.MarkAsVerifiedAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.MarkAsVerifiedAction & waproto.Message.MarkAsVerifiedAction.$Shape
		}
		namespace MarkAsVerifiedAction {
			interface $Properties {
				userJidString?: (string|null)
				verified?: (boolean|null)
				verifiedIdentityKey?: (Uint8Array|null)
				actionSeq?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.MarkAsVerifiedAction.$Properties
		}
		interface IProtocolMessage extends waproto.Message.ProtocolMessage.$Properties {
		}
		class ProtocolMessage {
			constructor(p?: waproto.Message.ProtocolMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			type?: (waproto.Message.ProtocolMessage.Type|null)
			ephemeralExpiration?: (number|null)
			ephemeralSettingTimestamp?: (number|Long|null)
			historySyncNotification?: (waproto.Message.HistorySyncNotification.$Properties|null)
			appStateSyncKeyShare?: (waproto.Message.AppStateSyncKeyShare.$Properties|null)
			appStateSyncKeyRequest?: (waproto.Message.AppStateSyncKeyRequest.$Properties|null)
			initialSecurityNotificationSettingSync?: (waproto.Message.InitialSecurityNotificationSettingSync.$Properties|null)
			appStateFatalExceptionNotification?: (waproto.Message.AppStateFatalExceptionNotification.$Properties|null)
			disappearingMode?: (waproto.DisappearingMode.$Properties|null)
			editedMessage?: (waproto.Message.$Properties|null)
			timestampMs?: (number|Long|null)
			peerDataOperationRequestMessage?: (waproto.Message.PeerDataOperationRequestMessage.$Properties|null)
			peerDataOperationRequestResponseMessage?: (waproto.Message.PeerDataOperationRequestResponseMessage.$Properties|null)
			botFeedbackMessage?: (waproto.BotFeedbackMessage.$Properties|null)
			invokerJid?: (string|null)
			requestWelcomeMessageMetadata?: (waproto.Message.RequestWelcomeMessageMetadata.$Properties|null)
			mediaNotifyMessage?: (waproto.MediaNotifyMessage.$Properties|null)
			cloudApiThreadControlNotification?: (waproto.Message.CloudAPIThreadControlNotification.$Properties|null)
			lidMigrationMappingSyncMessage?: (waproto.LIDMigrationMappingSyncMessage.$Properties|null)
			limitSharing?: (waproto.LimitSharing.$Properties|null)
			aiPsiMetadata?: (Uint8Array|null)
			aiQueryFanout?: (waproto.AIQueryFanout.$Properties|null)
			memberLabel?: (waproto.MemberLabel.$Properties|null)
			aiMediaCollectionMessage?: (waproto.AIMediaCollectionMessage.$Properties|null)
			afterReadDuration?: (number|null)
			chatThemeSetting?: (waproto.Message.ChatThemeSetting.$Properties|null)
			aiMetadataOperation?: (waproto.AIMetadataOperation.$Properties|null)
			markAsVerifiedAction?: (waproto.Message.MarkAsVerifiedAction.$Properties|null)
			coexStateSync?: (waproto.CoexStateSync.$Properties|null)
			static encode(m: waproto.Message.ProtocolMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ProtocolMessage & waproto.Message.ProtocolMessage.$Shape
		}
		namespace ProtocolMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				type?: (waproto.Message.ProtocolMessage.Type|null)
				ephemeralExpiration?: (number|null)
				ephemeralSettingTimestamp?: (number|Long|null)
				historySyncNotification?: (waproto.Message.HistorySyncNotification.$Properties|null)
				appStateSyncKeyShare?: (waproto.Message.AppStateSyncKeyShare.$Properties|null)
				appStateSyncKeyRequest?: (waproto.Message.AppStateSyncKeyRequest.$Properties|null)
				initialSecurityNotificationSettingSync?: (waproto.Message.InitialSecurityNotificationSettingSync.$Properties|null)
				appStateFatalExceptionNotification?: (waproto.Message.AppStateFatalExceptionNotification.$Properties|null)
				disappearingMode?: (waproto.DisappearingMode.$Properties|null)
				editedMessage?: (waproto.Message.$Properties|null)
				timestampMs?: (number|Long|null)
				peerDataOperationRequestMessage?: (waproto.Message.PeerDataOperationRequestMessage.$Properties|null)
				peerDataOperationRequestResponseMessage?: (waproto.Message.PeerDataOperationRequestResponseMessage.$Properties|null)
				botFeedbackMessage?: (waproto.BotFeedbackMessage.$Properties|null)
				invokerJid?: (string|null)
				requestWelcomeMessageMetadata?: (waproto.Message.RequestWelcomeMessageMetadata.$Properties|null)
				mediaNotifyMessage?: (waproto.MediaNotifyMessage.$Properties|null)
				cloudApiThreadControlNotification?: (waproto.Message.CloudAPIThreadControlNotification.$Properties|null)
				lidMigrationMappingSyncMessage?: (waproto.LIDMigrationMappingSyncMessage.$Properties|null)
				limitSharing?: (waproto.LimitSharing.$Properties|null)
				aiPsiMetadata?: (Uint8Array|null)
				aiQueryFanout?: (waproto.AIQueryFanout.$Properties|null)
				memberLabel?: (waproto.MemberLabel.$Properties|null)
				aiMediaCollectionMessage?: (waproto.AIMediaCollectionMessage.$Properties|null)
				afterReadDuration?: (number|null)
				chatThemeSetting?: (waproto.Message.ChatThemeSetting.$Properties|null)
				aiMetadataOperation?: (waproto.AIMetadataOperation.$Properties|null)
				markAsVerifiedAction?: (waproto.Message.MarkAsVerifiedAction.$Properties|null)
				coexStateSync?: (waproto.CoexStateSync.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ProtocolMessage.$Properties
			enum Type {
				REVOKE = 0,
				EPHEMERAL_SETTING = 3,
				EPHEMERAL_SYNC_RESPONSE = 4,
				HISTORY_SYNC_NOTIFICATION = 5,
				APP_STATE_SYNC_KEY_SHARE = 6,
				APP_STATE_SYNC_KEY_REQUEST = 7,
				MSG_FANOUT_BACKFILL_REQUEST = 8,
				INITIAL_SECURITY_NOTIFICATION_SETTING_SYNC = 9,
				APP_STATE_FATAL_EXCEPTION_NOTIFICATION = 10,
				SHARE_PHONE_NUMBER = 11,
				MESSAGE_EDIT = 14,
				PEER_DATA_OPERATION_REQUEST_MESSAGE = 16,
				PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE = 17,
				REQUEST_WELCOME_MESSAGE = 18,
				BOT_FEEDBACK_MESSAGE = 19,
				MEDIA_NOTIFY_MESSAGE = 20,
				CLOUD_API_THREAD_CONTROL_NOTIFICATION = 21,
				LID_MIGRATION_MAPPING_SYNC = 22,
				REMINDER_MESSAGE = 23,
				BOT_MEMU_ONBOARDING_MESSAGE = 24,
				STATUS_MENTION_MESSAGE = 25,
				STOP_GENERATION_MESSAGE = 26,
				LIMIT_SHARING = 27,
				AI_PSI_METADATA = 28,
				AI_QUERY_FANOUT = 29,
				GROUP_MEMBER_LABEL_CHANGE = 30,
				AI_MEDIA_COLLECTION_MESSAGE = 31,
				MESSAGE_UNSCHEDULE = 32,
				CHAT_THEME_SETTING = 34,
				AI_METADATA_OPERATION = 35,
				MARK_AS_VERIFIED_ACTION = 36,
				COEX_STATE_SYNC = 37
			}
		}
		interface ICloudAPIThreadControlNotification extends waproto.Message.CloudAPIThreadControlNotification.$Properties {
		}
		class CloudAPIThreadControlNotification {
			constructor(p?: waproto.Message.CloudAPIThreadControlNotification.$Properties)
			$unknowns?: Uint8Array[]
			status?: (waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControl|null)
			senderNotificationTimestampMs?: (number|Long|null)
			consumerLid?: (string|null)
			consumerPhoneNumber?: (string|null)
			notificationContent?: (waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControlNotificationContent.$Properties|null)
			shouldSuppressNotification?: (boolean|null)
			static encode(m: waproto.Message.CloudAPIThreadControlNotification.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.CloudAPIThreadControlNotification & waproto.Message.CloudAPIThreadControlNotification.$Shape
		}
		namespace CloudAPIThreadControlNotification {
			interface $Properties {
				status?: (waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControl|null)
				senderNotificationTimestampMs?: (number|Long|null)
				consumerLid?: (string|null)
				consumerPhoneNumber?: (string|null)
				notificationContent?: (waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControlNotificationContent.$Properties|null)
				shouldSuppressNotification?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.CloudAPIThreadControlNotification.$Properties
			enum CloudAPIThreadControl {
				UNKNOWN = 0,
				CONTROL_PASSED = 1,
				CONTROL_TAKEN = 2,
				INFO = 3
			}
			interface ICloudAPIThreadControlNotificationContent extends waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControlNotificationContent.$Properties {
			}
			class CloudAPIThreadControlNotificationContent {
				constructor(p?: waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControlNotificationContent.$Properties)
				$unknowns?: Uint8Array[]
				handoffNotificationText?: (string|null)
				extraJson?: (string|null)
				static encode(m: waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControlNotificationContent.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControlNotificationContent & waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControlNotificationContent.$Shape
			}
			namespace CloudAPIThreadControlNotificationContent {
				interface $Properties {
					handoffNotificationText?: (string|null)
					extraJson?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControlNotificationContent.$Properties
			}
		}
		interface IChat extends waproto.Message.Chat.$Properties {
		}
		class Chat {
			constructor(p?: waproto.Message.Chat.$Properties)
			$unknowns?: Uint8Array[]
			displayName?: (string|null)
			id?: (string|null)
			static encode(m: waproto.Message.Chat.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.Chat & waproto.Message.Chat.$Shape
		}
		namespace Chat {
			interface $Properties {
				displayName?: (string|null)
				id?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.Chat.$Properties
		}
		interface ICall extends waproto.Message.Call.$Properties {
		}
		class Call {
			constructor(p?: waproto.Message.Call.$Properties)
			$unknowns?: Uint8Array[]
			callKey?: (Uint8Array|null)
			conversionSource?: (string|null)
			conversionData?: (Uint8Array|null)
			conversionDelaySeconds?: (number|null)
			ctwaSignals?: (string|null)
			ctwaPayload?: (Uint8Array|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			nativeFlowCallButtonPayload?: (string|null)
			deeplinkPayload?: (string|null)
			messageContextInfo?: (waproto.MessageContextInfo.$Properties|null)
			callEntryPoint?: (number|null)
			static encode(m: waproto.Message.Call.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.Call & waproto.Message.Call.$Shape
		}
		namespace Call {
			interface $Properties {
				callKey?: (Uint8Array|null)
				conversionSource?: (string|null)
				conversionData?: (Uint8Array|null)
				conversionDelaySeconds?: (number|null)
				ctwaSignals?: (string|null)
				ctwaPayload?: (Uint8Array|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				nativeFlowCallButtonPayload?: (string|null)
				deeplinkPayload?: (string|null)
				messageContextInfo?: (waproto.MessageContextInfo.$Properties|null)
				callEntryPoint?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.Call.$Properties
		}
		interface IVideoMessage extends waproto.Message.VideoMessage.$Properties {
		}
		class VideoMessage {
			constructor(p?: waproto.Message.VideoMessage.$Properties)
			$unknowns?: Uint8Array[]
			url?: (string|null)
			mimetype?: (string|null)
			fileSha256?: (Uint8Array|null)
			fileLength?: (number|Long|null)
			seconds?: (number|null)
			mediaKey?: (Uint8Array|null)
			caption?: (string|null)
			gifPlayback?: (boolean|null)
			height?: (number|null)
			width?: (number|null)
			fileEncSha256?: (Uint8Array|null)
			interactiveAnnotations: waproto.InteractiveAnnotation.$Properties[]
			directPath?: (string|null)
			mediaKeyTimestamp?: (number|Long|null)
			jpegThumbnail?: (Uint8Array|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			streamingSidecar?: (Uint8Array|null)
			gifAttribution?: (waproto.Message.VideoMessage.Attribution|null)
			viewOnce?: (boolean|null)
			thumbnailDirectPath?: (string|null)
			thumbnailSha256?: (Uint8Array|null)
			thumbnailEncSha256?: (Uint8Array|null)
			staticUrl?: (string|null)
			annotations: waproto.InteractiveAnnotation.$Properties[]
			accessibilityLabel?: (string|null)
			processedVideos: waproto.ProcessedVideo.$Properties[]
			externalShareFullVideoDurationInSeconds?: (number|null)
			motionPhotoPresentationOffsetMs?: (number|Long|null)
			metadataUrl?: (string|null)
			videoSourceType?: (waproto.Message.VideoMessage.VideoSourceType|null)
			static encode(m: waproto.Message.VideoMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.VideoMessage & waproto.Message.VideoMessage.$Shape
		}
		namespace VideoMessage {
			interface $Properties {
				url?: (string|null)
				mimetype?: (string|null)
				fileSha256?: (Uint8Array|null)
				fileLength?: (number|Long|null)
				seconds?: (number|null)
				mediaKey?: (Uint8Array|null)
				caption?: (string|null)
				gifPlayback?: (boolean|null)
				height?: (number|null)
				width?: (number|null)
				fileEncSha256?: (Uint8Array|null)
				interactiveAnnotations?: (waproto.InteractiveAnnotation.$Properties[]|null)
				directPath?: (string|null)
				mediaKeyTimestamp?: (number|Long|null)
				jpegThumbnail?: (Uint8Array|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				streamingSidecar?: (Uint8Array|null)
				gifAttribution?: (waproto.Message.VideoMessage.Attribution|null)
				viewOnce?: (boolean|null)
				thumbnailDirectPath?: (string|null)
				thumbnailSha256?: (Uint8Array|null)
				thumbnailEncSha256?: (Uint8Array|null)
				staticUrl?: (string|null)
				annotations?: (waproto.InteractiveAnnotation.$Properties[]|null)
				accessibilityLabel?: (string|null)
				processedVideos?: (waproto.ProcessedVideo.$Properties[]|null)
				externalShareFullVideoDurationInSeconds?: (number|null)
				motionPhotoPresentationOffsetMs?: (number|Long|null)
				metadataUrl?: (string|null)
				videoSourceType?: (waproto.Message.VideoMessage.VideoSourceType|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.VideoMessage.$Properties
			enum VideoSourceType {
				USER_VIDEO = 0,
				AI_GENERATED = 1
			}
			enum Attribution {
				NONE = 0,
				GIPHY = 1,
				TENOR = 2,
				KLIPY = 3
			}
		}
		interface IAudioMessage extends waproto.Message.AudioMessage.$Properties {
		}
		class AudioMessage {
			constructor(p?: waproto.Message.AudioMessage.$Properties)
			$unknowns?: Uint8Array[]
			url?: (string|null)
			mimetype?: (string|null)
			fileSha256?: (Uint8Array|null)
			fileLength?: (number|Long|null)
			seconds?: (number|null)
			ptt?: (boolean|null)
			mediaKey?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			directPath?: (string|null)
			mediaKeyTimestamp?: (number|Long|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			streamingSidecar?: (Uint8Array|null)
			waveform?: (Uint8Array|null)
			backgroundArgb?: (number|null)
			viewOnce?: (boolean|null)
			accessibilityLabel?: (string|null)
			static encode(m: waproto.Message.AudioMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AudioMessage & waproto.Message.AudioMessage.$Shape
		}
		namespace AudioMessage {
			interface $Properties {
				url?: (string|null)
				mimetype?: (string|null)
				fileSha256?: (Uint8Array|null)
				fileLength?: (number|Long|null)
				seconds?: (number|null)
				ptt?: (boolean|null)
				mediaKey?: (Uint8Array|null)
				fileEncSha256?: (Uint8Array|null)
				directPath?: (string|null)
				mediaKeyTimestamp?: (number|Long|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				streamingSidecar?: (Uint8Array|null)
				waveform?: (Uint8Array|null)
				backgroundArgb?: (number|null)
				viewOnce?: (boolean|null)
				accessibilityLabel?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.AudioMessage.$Properties
		}
		interface IDocumentMessage extends waproto.Message.DocumentMessage.$Properties {
		}
		class DocumentMessage {
			constructor(p?: waproto.Message.DocumentMessage.$Properties)
			$unknowns?: Uint8Array[]
			url?: (string|null)
			mimetype?: (string|null)
			title?: (string|null)
			fileSha256?: (Uint8Array|null)
			fileLength?: (number|Long|null)
			pageCount?: (number|null)
			mediaKey?: (Uint8Array|null)
			fileName?: (string|null)
			fileEncSha256?: (Uint8Array|null)
			directPath?: (string|null)
			mediaKeyTimestamp?: (number|Long|null)
			contactVcard?: (boolean|null)
			thumbnailDirectPath?: (string|null)
			thumbnailSha256?: (Uint8Array|null)
			thumbnailEncSha256?: (Uint8Array|null)
			jpegThumbnail?: (Uint8Array|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			thumbnailHeight?: (number|null)
			thumbnailWidth?: (number|null)
			caption?: (string|null)
			accessibilityLabel?: (string|null)
			static encode(m: waproto.Message.DocumentMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.DocumentMessage & waproto.Message.DocumentMessage.$Shape
		}
		namespace DocumentMessage {
			interface $Properties {
				url?: (string|null)
				mimetype?: (string|null)
				title?: (string|null)
				fileSha256?: (Uint8Array|null)
				fileLength?: (number|Long|null)
				pageCount?: (number|null)
				mediaKey?: (Uint8Array|null)
				fileName?: (string|null)
				fileEncSha256?: (Uint8Array|null)
				directPath?: (string|null)
				mediaKeyTimestamp?: (number|Long|null)
				contactVcard?: (boolean|null)
				thumbnailDirectPath?: (string|null)
				thumbnailSha256?: (Uint8Array|null)
				thumbnailEncSha256?: (Uint8Array|null)
				jpegThumbnail?: (Uint8Array|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				thumbnailHeight?: (number|null)
				thumbnailWidth?: (number|null)
				caption?: (string|null)
				accessibilityLabel?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.DocumentMessage.$Properties
		}
		interface IExtendedTextMessage extends waproto.Message.ExtendedTextMessage.$Properties {
		}
		class ExtendedTextMessage {
			constructor(p?: waproto.Message.ExtendedTextMessage.$Properties)
			$unknowns?: Uint8Array[]
			text?: (string|null)
			matchedText?: (string|null)
			description?: (string|null)
			title?: (string|null)
			textArgb?: (number|null)
			backgroundArgb?: (number|null)
			font?: (waproto.Message.ExtendedTextMessage.FontType|null)
			previewType?: (waproto.Message.ExtendedTextMessage.PreviewType|null)
			jpegThumbnail?: (Uint8Array|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			doNotPlayInline?: (boolean|null)
			thumbnailDirectPath?: (string|null)
			thumbnailSha256?: (Uint8Array|null)
			thumbnailEncSha256?: (Uint8Array|null)
			mediaKey?: (Uint8Array|null)
			mediaKeyTimestamp?: (number|Long|null)
			thumbnailHeight?: (number|null)
			thumbnailWidth?: (number|null)
			inviteLinkGroupType?: (waproto.Message.ExtendedTextMessage.InviteLinkGroupType|null)
			inviteLinkParentGroupSubjectV2?: (string|null)
			inviteLinkParentGroupThumbnailV2?: (Uint8Array|null)
			inviteLinkGroupTypeV2?: (waproto.Message.ExtendedTextMessage.InviteLinkGroupType|null)
			viewOnce?: (boolean|null)
			videoHeight?: (number|null)
			videoWidth?: (number|null)
			faviconMmsMetadata?: (waproto.Message.MMSThumbnailMetadata.$Properties|null)
			linkPreviewMetadata?: (waproto.Message.LinkPreviewMetadata.$Properties|null)
			paymentLinkMetadata?: (waproto.Message.PaymentLinkMetadata.$Properties|null)
			endCardTiles: waproto.Message.VideoEndCard.$Properties[]
			videoContentUrl?: (string|null)
			musicMetadata?: (waproto.EmbeddedMusic.$Properties|null)
			paymentExtendedMetadata?: (waproto.Message.PaymentExtendedMetadata.$Properties|null)
			static encode(m: waproto.Message.ExtendedTextMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ExtendedTextMessage & waproto.Message.ExtendedTextMessage.$Shape
		}
		namespace ExtendedTextMessage {
			interface $Properties {
				text?: (string|null)
				matchedText?: (string|null)
				description?: (string|null)
				title?: (string|null)
				textArgb?: (number|null)
				backgroundArgb?: (number|null)
				font?: (waproto.Message.ExtendedTextMessage.FontType|null)
				previewType?: (waproto.Message.ExtendedTextMessage.PreviewType|null)
				jpegThumbnail?: (Uint8Array|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				doNotPlayInline?: (boolean|null)
				thumbnailDirectPath?: (string|null)
				thumbnailSha256?: (Uint8Array|null)
				thumbnailEncSha256?: (Uint8Array|null)
				mediaKey?: (Uint8Array|null)
				mediaKeyTimestamp?: (number|Long|null)
				thumbnailHeight?: (number|null)
				thumbnailWidth?: (number|null)
				inviteLinkGroupType?: (waproto.Message.ExtendedTextMessage.InviteLinkGroupType|null)
				inviteLinkParentGroupSubjectV2?: (string|null)
				inviteLinkParentGroupThumbnailV2?: (Uint8Array|null)
				inviteLinkGroupTypeV2?: (waproto.Message.ExtendedTextMessage.InviteLinkGroupType|null)
				viewOnce?: (boolean|null)
				videoHeight?: (number|null)
				videoWidth?: (number|null)
				faviconMmsMetadata?: (waproto.Message.MMSThumbnailMetadata.$Properties|null)
				linkPreviewMetadata?: (waproto.Message.LinkPreviewMetadata.$Properties|null)
				paymentLinkMetadata?: (waproto.Message.PaymentLinkMetadata.$Properties|null)
				endCardTiles?: (waproto.Message.VideoEndCard.$Properties[]|null)
				videoContentUrl?: (string|null)
				musicMetadata?: (waproto.EmbeddedMusic.$Properties|null)
				paymentExtendedMetadata?: (waproto.Message.PaymentExtendedMetadata.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ExtendedTextMessage.$Properties
			enum InviteLinkGroupType {
				DEFAULT = 0,
				PARENT = 1,
				SUB = 2,
				DEFAULT_SUB = 3
			}
			enum PreviewType {
				NONE = 0,
				VIDEO = 1,
				PLACEHOLDER = 4,
				IMAGE = 5,
				PAYMENT_LINKS = 6,
				PROFILE = 7
			}
			enum FontType {
				SYSTEM = 0,
				SYSTEM_TEXT = 1,
				FB_SCRIPT = 2,
				SYSTEM_BOLD = 6,
				MORNINGBREEZE_REGULAR = 7,
				CALISTOGA_REGULAR = 8,
				EXO2_EXTRABOLD = 9,
				COURIERPRIME_BOLD = 10
			}
		}
		interface ILinkPreviewMetadata extends waproto.Message.LinkPreviewMetadata.$Properties {
		}
		class LinkPreviewMetadata {
			constructor(p?: waproto.Message.LinkPreviewMetadata.$Properties)
			$unknowns?: Uint8Array[]
			paymentLinkMetadata?: (waproto.Message.PaymentLinkMetadata.$Properties|null)
			urlMetadata?: (waproto.Message.URLMetadata.$Properties|null)
			fbExperimentId?: (number|null)
			linkMediaDuration?: (number|null)
			socialMediaPostType?: (waproto.Message.LinkPreviewMetadata.SocialMediaPostType|null)
			linkInlineVideoMuted?: (boolean|null)
			videoContentUrl?: (string|null)
			musicMetadata?: (waproto.EmbeddedMusic.$Properties|null)
			videoContentCaption?: (string|null)
			static encode(m: waproto.Message.LinkPreviewMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.LinkPreviewMetadata & waproto.Message.LinkPreviewMetadata.$Shape
		}
		namespace LinkPreviewMetadata {
			interface $Properties {
				paymentLinkMetadata?: (waproto.Message.PaymentLinkMetadata.$Properties|null)
				urlMetadata?: (waproto.Message.URLMetadata.$Properties|null)
				fbExperimentId?: (number|null)
				linkMediaDuration?: (number|null)
				socialMediaPostType?: (waproto.Message.LinkPreviewMetadata.SocialMediaPostType|null)
				linkInlineVideoMuted?: (boolean|null)
				videoContentUrl?: (string|null)
				musicMetadata?: (waproto.EmbeddedMusic.$Properties|null)
				videoContentCaption?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.LinkPreviewMetadata.$Properties
			enum SocialMediaPostType {
				NONE = 0,
				REEL = 1,
				LIVE_VIDEO = 2,
				LONG_VIDEO = 3,
				SINGLE_IMAGE = 4,
				CAROUSEL = 5
			}
		}
		interface IURLMetadata extends waproto.Message.URLMetadata.$Properties {
		}
		class URLMetadata {
			constructor(p?: waproto.Message.URLMetadata.$Properties)
			$unknowns?: Uint8Array[]
			fbExperimentId?: (number|null)
			static encode(m: waproto.Message.URLMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.URLMetadata & waproto.Message.URLMetadata.$Shape
		}
		namespace URLMetadata {
			interface $Properties {
				fbExperimentId?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.URLMetadata.$Properties
		}
		interface IPaymentExtendedMetadata extends waproto.Message.PaymentExtendedMetadata.$Properties {
		}
		class PaymentExtendedMetadata {
			constructor(p?: waproto.Message.PaymentExtendedMetadata.$Properties)
			$unknowns?: Uint8Array[]
			type?: (number|null)
			platform?: (string|null)
			messageParamsJson?: (string|null)
			static encode(m: waproto.Message.PaymentExtendedMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentExtendedMetadata & waproto.Message.PaymentExtendedMetadata.$Shape
		}
		namespace PaymentExtendedMetadata {
			interface $Properties {
				type?: (number|null)
				platform?: (string|null)
				messageParamsJson?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PaymentExtendedMetadata.$Properties
		}
		interface IPaymentLinkMetadata extends waproto.Message.PaymentLinkMetadata.$Properties {
		}
		class PaymentLinkMetadata {
			constructor(p?: waproto.Message.PaymentLinkMetadata.$Properties)
			$unknowns?: Uint8Array[]
			button?: (waproto.Message.PaymentLinkMetadata.PaymentLinkButton.$Properties|null)
			header?: (waproto.Message.PaymentLinkMetadata.PaymentLinkHeader.$Properties|null)
			provider?: (waproto.Message.PaymentLinkMetadata.PaymentLinkProvider.$Properties|null)
			static encode(m: waproto.Message.PaymentLinkMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentLinkMetadata & waproto.Message.PaymentLinkMetadata.$Shape
		}
		namespace PaymentLinkMetadata {
			interface $Properties {
				button?: (waproto.Message.PaymentLinkMetadata.PaymentLinkButton.$Properties|null)
				header?: (waproto.Message.PaymentLinkMetadata.PaymentLinkHeader.$Properties|null)
				provider?: (waproto.Message.PaymentLinkMetadata.PaymentLinkProvider.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.PaymentLinkMetadata.$Properties
			interface IPaymentLinkProvider extends waproto.Message.PaymentLinkMetadata.PaymentLinkProvider.$Properties {
			}
			class PaymentLinkProvider {
				constructor(p?: waproto.Message.PaymentLinkMetadata.PaymentLinkProvider.$Properties)
				$unknowns?: Uint8Array[]
				paramsJson?: (string|null)
				static encode(m: waproto.Message.PaymentLinkMetadata.PaymentLinkProvider.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentLinkMetadata.PaymentLinkProvider & waproto.Message.PaymentLinkMetadata.PaymentLinkProvider.$Shape
			}
			namespace PaymentLinkProvider {
				interface $Properties {
					paramsJson?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PaymentLinkMetadata.PaymentLinkProvider.$Properties
			}
			interface IPaymentLinkHeader extends waproto.Message.PaymentLinkMetadata.PaymentLinkHeader.$Properties {
			}
			class PaymentLinkHeader {
				constructor(p?: waproto.Message.PaymentLinkMetadata.PaymentLinkHeader.$Properties)
				$unknowns?: Uint8Array[]
				headerType?: (waproto.Message.PaymentLinkMetadata.PaymentLinkHeader.PaymentLinkHeaderType|null)
				static encode(m: waproto.Message.PaymentLinkMetadata.PaymentLinkHeader.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentLinkMetadata.PaymentLinkHeader & waproto.Message.PaymentLinkMetadata.PaymentLinkHeader.$Shape
			}
			namespace PaymentLinkHeader {
				interface $Properties {
					headerType?: (waproto.Message.PaymentLinkMetadata.PaymentLinkHeader.PaymentLinkHeaderType|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PaymentLinkMetadata.PaymentLinkHeader.$Properties
				enum PaymentLinkHeaderType {
					LINK_PREVIEW = 0,
					ORDER = 1
				}
			}
			interface IPaymentLinkButton extends waproto.Message.PaymentLinkMetadata.PaymentLinkButton.$Properties {
			}
			class PaymentLinkButton {
				constructor(p?: waproto.Message.PaymentLinkMetadata.PaymentLinkButton.$Properties)
				$unknowns?: Uint8Array[]
				displayText?: (string|null)
				static encode(m: waproto.Message.PaymentLinkMetadata.PaymentLinkButton.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentLinkMetadata.PaymentLinkButton & waproto.Message.PaymentLinkMetadata.PaymentLinkButton.$Shape
			}
			namespace PaymentLinkButton {
				interface $Properties {
					displayText?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.Message.PaymentLinkMetadata.PaymentLinkButton.$Properties
			}
		}
		interface IMMSThumbnailMetadata extends waproto.Message.MMSThumbnailMetadata.$Properties {
		}
		class MMSThumbnailMetadata {
			constructor(p?: waproto.Message.MMSThumbnailMetadata.$Properties)
			$unknowns?: Uint8Array[]
			thumbnailDirectPath?: (string|null)
			thumbnailSha256?: (Uint8Array|null)
			thumbnailEncSha256?: (Uint8Array|null)
			mediaKey?: (Uint8Array|null)
			mediaKeyTimestamp?: (number|Long|null)
			thumbnailHeight?: (number|null)
			thumbnailWidth?: (number|null)
			static encode(m: waproto.Message.MMSThumbnailMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.MMSThumbnailMetadata & waproto.Message.MMSThumbnailMetadata.$Shape
		}
		namespace MMSThumbnailMetadata {
			interface $Properties {
				thumbnailDirectPath?: (string|null)
				thumbnailSha256?: (Uint8Array|null)
				thumbnailEncSha256?: (Uint8Array|null)
				mediaKey?: (Uint8Array|null)
				mediaKeyTimestamp?: (number|Long|null)
				thumbnailHeight?: (number|null)
				thumbnailWidth?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.MMSThumbnailMetadata.$Properties
		}
		interface ILocationMessage extends waproto.Message.LocationMessage.$Properties {
		}
		class LocationMessage {
			constructor(p?: waproto.Message.LocationMessage.$Properties)
			$unknowns?: Uint8Array[]
			degreesLatitude?: (number|null)
			degreesLongitude?: (number|null)
			name?: (string|null)
			address?: (string|null)
			url?: (string|null)
			isLive?: (boolean|null)
			accuracyInMeters?: (number|null)
			speedInMps?: (number|null)
			degreesClockwiseFromMagneticNorth?: (number|null)
			comment?: (string|null)
			jpegThumbnail?: (Uint8Array|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			static encode(m: waproto.Message.LocationMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.LocationMessage & waproto.Message.LocationMessage.$Shape
		}
		namespace LocationMessage {
			interface $Properties {
				degreesLatitude?: (number|null)
				degreesLongitude?: (number|null)
				name?: (string|null)
				address?: (string|null)
				url?: (string|null)
				isLive?: (boolean|null)
				accuracyInMeters?: (number|null)
				speedInMps?: (number|null)
				degreesClockwiseFromMagneticNorth?: (number|null)
				comment?: (string|null)
				jpegThumbnail?: (Uint8Array|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.LocationMessage.$Properties
		}
		interface IStatusNotificationMessage extends waproto.Message.StatusNotificationMessage.$Properties {
		}
		class StatusNotificationMessage {
			constructor(p?: waproto.Message.StatusNotificationMessage.$Properties)
			$unknowns?: Uint8Array[]
			responseMessageKey?: (waproto.MessageKey.$Properties|null)
			originalMessageKey?: (waproto.MessageKey.$Properties|null)
			type?: (waproto.Message.StatusNotificationMessage.StatusNotificationType|null)
			static encode(m: waproto.Message.StatusNotificationMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StatusNotificationMessage & waproto.Message.StatusNotificationMessage.$Shape
		}
		namespace StatusNotificationMessage {
			interface $Properties {
				responseMessageKey?: (waproto.MessageKey.$Properties|null)
				originalMessageKey?: (waproto.MessageKey.$Properties|null)
				type?: (waproto.Message.StatusNotificationMessage.StatusNotificationType|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.StatusNotificationMessage.$Properties
			enum StatusNotificationType {
				UNKNOWN = 0,
				STATUS_ADD_YOURS = 1,
				STATUS_RESHARE = 2,
				STATUS_QUESTION_ANSWER_RESHARE = 3
			}
		}
		interface IContactMessage extends waproto.Message.ContactMessage.$Properties {
		}
		class ContactMessage {
			constructor(p?: waproto.Message.ContactMessage.$Properties)
			$unknowns?: Uint8Array[]
			displayName?: (string|null)
			vcard?: (string|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			isSelfContact?: (boolean|null)
			static encode(m: waproto.Message.ContactMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ContactMessage & waproto.Message.ContactMessage.$Shape
		}
		namespace ContactMessage {
			interface $Properties {
				displayName?: (string|null)
				vcard?: (string|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				isSelfContact?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ContactMessage.$Properties
		}
		interface IInvoiceMessage extends waproto.Message.InvoiceMessage.$Properties {
		}
		class InvoiceMessage {
			constructor(p?: waproto.Message.InvoiceMessage.$Properties)
			$unknowns?: Uint8Array[]
			note?: (string|null)
			token?: (string|null)
			attachmentType?: (waproto.Message.InvoiceMessage.AttachmentType|null)
			attachmentMimetype?: (string|null)
			attachmentMediaKey?: (Uint8Array|null)
			attachmentMediaKeyTimestamp?: (number|Long|null)
			attachmentFileSha256?: (Uint8Array|null)
			attachmentFileEncSha256?: (Uint8Array|null)
			attachmentDirectPath?: (string|null)
			attachmentJpegThumbnail?: (Uint8Array|null)
			static encode(m: waproto.Message.InvoiceMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InvoiceMessage & waproto.Message.InvoiceMessage.$Shape
		}
		namespace InvoiceMessage {
			interface $Properties {
				note?: (string|null)
				token?: (string|null)
				attachmentType?: (waproto.Message.InvoiceMessage.AttachmentType|null)
				attachmentMimetype?: (string|null)
				attachmentMediaKey?: (Uint8Array|null)
				attachmentMediaKeyTimestamp?: (number|Long|null)
				attachmentFileSha256?: (Uint8Array|null)
				attachmentFileEncSha256?: (Uint8Array|null)
				attachmentDirectPath?: (string|null)
				attachmentJpegThumbnail?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.InvoiceMessage.$Properties
			enum AttachmentType {
				IMAGE = 0,
				PDF = 1
			}
		}
		interface IImageMessage extends waproto.Message.ImageMessage.$Properties {
		}
		class ImageMessage {
			constructor(p?: waproto.Message.ImageMessage.$Properties)
			$unknowns?: Uint8Array[]
			url?: (string|null)
			mimetype?: (string|null)
			caption?: (string|null)
			fileSha256?: (Uint8Array|null)
			fileLength?: (number|Long|null)
			height?: (number|null)
			width?: (number|null)
			mediaKey?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			interactiveAnnotations: waproto.InteractiveAnnotation.$Properties[]
			directPath?: (string|null)
			mediaKeyTimestamp?: (number|Long|null)
			jpegThumbnail?: (Uint8Array|null)
			contextInfo?: (waproto.ContextInfo.$Properties|null)
			firstScanSidecar?: (Uint8Array|null)
			firstScanLength?: (number|null)
			experimentGroupId?: (number|null)
			scansSidecar?: (Uint8Array|null)
			scanLengths: number[]
			midQualityFileSha256?: (Uint8Array|null)
			midQualityFileEncSha256?: (Uint8Array|null)
			viewOnce?: (boolean|null)
			thumbnailDirectPath?: (string|null)
			thumbnailSha256?: (Uint8Array|null)
			thumbnailEncSha256?: (Uint8Array|null)
			staticUrl?: (string|null)
			annotations: waproto.InteractiveAnnotation.$Properties[]
			imageSourceType?: (waproto.Message.ImageMessage.ImageSourceType|null)
			accessibilityLabel?: (string|null)
			qrUrl?: (string|null)
			static encode(m: waproto.Message.ImageMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ImageMessage & waproto.Message.ImageMessage.$Shape
		}
		namespace ImageMessage {
			interface $Properties {
				url?: (string|null)
				mimetype?: (string|null)
				caption?: (string|null)
				fileSha256?: (Uint8Array|null)
				fileLength?: (number|Long|null)
				height?: (number|null)
				width?: (number|null)
				mediaKey?: (Uint8Array|null)
				fileEncSha256?: (Uint8Array|null)
				interactiveAnnotations?: (waproto.InteractiveAnnotation.$Properties[]|null)
				directPath?: (string|null)
				mediaKeyTimestamp?: (number|Long|null)
				jpegThumbnail?: (Uint8Array|null)
				contextInfo?: (waproto.ContextInfo.$Properties|null)
				firstScanSidecar?: (Uint8Array|null)
				firstScanLength?: (number|null)
				experimentGroupId?: (number|null)
				scansSidecar?: (Uint8Array|null)
				scanLengths?: (number[]|null)
				midQualityFileSha256?: (Uint8Array|null)
				midQualityFileEncSha256?: (Uint8Array|null)
				viewOnce?: (boolean|null)
				thumbnailDirectPath?: (string|null)
				thumbnailSha256?: (Uint8Array|null)
				thumbnailEncSha256?: (Uint8Array|null)
				staticUrl?: (string|null)
				annotations?: (waproto.InteractiveAnnotation.$Properties[]|null)
				imageSourceType?: (waproto.Message.ImageMessage.ImageSourceType|null)
				accessibilityLabel?: (string|null)
				qrUrl?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.ImageMessage.$Properties
			enum ImageSourceType {
				USER_IMAGE = 0,
				AI_GENERATED = 1,
				AI_MODIFIED = 2,
				RASTERIZED_TEXT_STATUS = 3
			}
		}
		interface IRootSecretDistributeMessage extends waproto.Message.RootSecretDistributeMessage.$Properties {
		}
		class RootSecretDistributeMessage {
			constructor(p?: waproto.Message.RootSecretDistributeMessage.$Properties)
			$unknowns?: Uint8Array[]
			chatJid?: (string|null)
			static encode(m: waproto.Message.RootSecretDistributeMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.RootSecretDistributeMessage & waproto.Message.RootSecretDistributeMessage.$Shape
		}
		namespace RootSecretDistributeMessage {
			interface $Properties {
				chatJid?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.RootSecretDistributeMessage.$Properties
		}
		interface ISenderKeyDistributionMessage extends waproto.Message.SenderKeyDistributionMessage.$Properties {
		}
		class SenderKeyDistributionMessage {
			constructor(p?: waproto.Message.SenderKeyDistributionMessage.$Properties)
			$unknowns?: Uint8Array[]
			groupId?: (string|null)
			axolotlSenderKeyDistributionMessage?: (Uint8Array|null)
			static encode(m: waproto.Message.SenderKeyDistributionMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.SenderKeyDistributionMessage & waproto.Message.SenderKeyDistributionMessage.$Shape
		}
		namespace SenderKeyDistributionMessage {
			interface $Properties {
				groupId?: (string|null)
				axolotlSenderKeyDistributionMessage?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.SenderKeyDistributionMessage.$Properties
		}
		interface IVideoEndCard extends waproto.Message.VideoEndCard.$Properties {
		}
		class VideoEndCard {
			constructor(p?: waproto.Message.VideoEndCard.$Properties)
			$unknowns?: Uint8Array[]
			username?: (string|null)
			caption?: (string|null)
			thumbnailImageUrl?: (string|null)
			profilePictureUrl?: (string|null)
			static encode(m: waproto.Message.VideoEndCard.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.VideoEndCard & waproto.Message.VideoEndCard.$Shape
		}
		namespace VideoEndCard {
			interface $Properties {
				username?: (string|null)
				caption?: (string|null)
				thumbnailImageUrl?: (string|null)
				profilePictureUrl?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.Message.VideoEndCard.$Properties
		}
	}
	interface IMessageAddOn extends waproto.MessageAddOn.$Properties {
	}
	class MessageAddOn {
		constructor(p?: waproto.MessageAddOn.$Properties)
		$unknowns?: Uint8Array[]
		messageAddOnType?: (waproto.MessageAddOn.MessageAddOnType|null)
		messageAddOn?: (waproto.Message.$Properties|null)
		senderTimestampMs?: (number|Long|null)
		serverTimestampMs?: (number|Long|null)
		status?: (waproto.WebMessageInfo.Status|null)
		addOnContextInfo?: (waproto.MessageAddOnContextInfo.$Properties|null)
		messageAddOnKey?: (waproto.MessageKey.$Properties|null)
		legacyMessage?: (waproto.LegacyMessage.$Properties|null)
		static encode(m: waproto.MessageAddOn.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageAddOn & waproto.MessageAddOn.$Shape
	}
	namespace MessageAddOn {
		interface $Properties {
			messageAddOnType?: (waproto.MessageAddOn.MessageAddOnType|null)
			messageAddOn?: (waproto.Message.$Properties|null)
			senderTimestampMs?: (number|Long|null)
			serverTimestampMs?: (number|Long|null)
			status?: (waproto.WebMessageInfo.Status|null)
			addOnContextInfo?: (waproto.MessageAddOnContextInfo.$Properties|null)
			messageAddOnKey?: (waproto.MessageKey.$Properties|null)
			legacyMessage?: (waproto.LegacyMessage.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MessageAddOn.$Properties
		enum MessageAddOnType {
			UNDEFINED = 0,
			REACTION = 1,
			EVENT_RESPONSE = 2,
			POLL_UPDATE = 3,
			PIN_IN_CHAT = 4
		}
	}
	interface IMessageAddOnContextInfo extends waproto.MessageAddOnContextInfo.$Properties {
	}
	class MessageAddOnContextInfo {
		constructor(p?: waproto.MessageAddOnContextInfo.$Properties)
		$unknowns?: Uint8Array[]
		messageAddOnDurationInSecs?: (number|null)
		messageAddOnExpiryType?: (waproto.MessageContextInfo.MessageAddonExpiryType|null)
		static encode(m: waproto.MessageAddOnContextInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageAddOnContextInfo & waproto.MessageAddOnContextInfo.$Shape
	}
	namespace MessageAddOnContextInfo {
		interface $Properties {
			messageAddOnDurationInSecs?: (number|null)
			messageAddOnExpiryType?: (waproto.MessageContextInfo.MessageAddonExpiryType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MessageAddOnContextInfo.$Properties
	}
	interface IMessageAssociation extends waproto.MessageAssociation.$Properties {
	}
	class MessageAssociation {
		constructor(p?: waproto.MessageAssociation.$Properties)
		$unknowns?: Uint8Array[]
		associationType?: (waproto.MessageAssociation.AssociationType|null)
		parentMessageKey?: (waproto.MessageKey.$Properties|null)
		messageIndex?: (number|null)
		static encode(m: waproto.MessageAssociation.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageAssociation & waproto.MessageAssociation.$Shape
	}
	namespace MessageAssociation {
		interface $Properties {
			associationType?: (waproto.MessageAssociation.AssociationType|null)
			parentMessageKey?: (waproto.MessageKey.$Properties|null)
			messageIndex?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MessageAssociation.$Properties
		enum AssociationType {
			UNKNOWN = 0,
			MEDIA_ALBUM = 1,
			BOT_PLUGIN = 2,
			EVENT_COVER_IMAGE = 3,
			STATUS_POLL = 4,
			HD_VIDEO_DUAL_UPLOAD = 5,
			STATUS_EXTERNAL_RESHARE = 6,
			MEDIA_POLL = 7,
			STATUS_ADD_YOURS = 8,
			STATUS_NOTIFICATION = 9,
			HD_IMAGE_DUAL_UPLOAD = 10,
			STICKER_ANNOTATION = 11,
			MOTION_PHOTO = 12,
			STATUS_LINK_ACTION = 13,
			VIEW_ALL_REPLIES = 14,
			STATUS_ADD_YOURS_AI_IMAGINE = 15,
			STATUS_QUESTION = 16,
			STATUS_ADD_YOURS_DIWALI = 17,
			STATUS_REACTION = 18,
			HEVC_VIDEO_DUAL_UPLOAD = 19,
			POLL_ADD_OPTION = 20
		}
	}
	interface IMessageContextInfo extends waproto.MessageContextInfo.$Properties {
	}
	class MessageContextInfo {
		constructor(p?: waproto.MessageContextInfo.$Properties)
		$unknowns?: Uint8Array[]
		deviceListMetadata?: (waproto.DeviceListMetadata.$Properties|null)
		deviceListMetadataVersion?: (number|null)
		messageSecret?: (Uint8Array|null)
		paddingBytes?: (Uint8Array|null)
		messageAddOnDurationInSecs?: (number|null)
		botMessageSecret?: (Uint8Array|null)
		botMetadata?: (waproto.BotMetadata.$Properties|null)
		reportingTokenVersion?: (number|null)
		messageAddOnExpiryType?: (waproto.MessageContextInfo.MessageAddonExpiryType|null)
		messageAssociation?: (waproto.MessageAssociation.$Properties|null)
		capiCreatedGroup?: (boolean|null)
		supportPayload?: (string|null)
		limitSharing?: (waproto.LimitSharing.$Properties|null)
		limitSharingV2?: (waproto.LimitSharing.$Properties|null)
		threadId: waproto.ThreadID.$Properties[]
		weblinkRenderConfig?: (waproto.WebLinkRenderConfig|null)
		teeBotMetadata?: (Uint8Array|null)
		accountEncryptionAttestation?: (waproto.NonE2EEAttestation.$Properties|null)
		associatedPrimaryIdentityKey?: (Uint8Array|null)
		static encode(m: waproto.MessageContextInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageContextInfo & waproto.MessageContextInfo.$Shape
	}
	namespace MessageContextInfo {
		interface $Properties {
			deviceListMetadata?: (waproto.DeviceListMetadata.$Properties|null)
			deviceListMetadataVersion?: (number|null)
			messageSecret?: (Uint8Array|null)
			paddingBytes?: (Uint8Array|null)
			messageAddOnDurationInSecs?: (number|null)
			botMessageSecret?: (Uint8Array|null)
			botMetadata?: (waproto.BotMetadata.$Properties|null)
			reportingTokenVersion?: (number|null)
			messageAddOnExpiryType?: (waproto.MessageContextInfo.MessageAddonExpiryType|null)
			messageAssociation?: (waproto.MessageAssociation.$Properties|null)
			capiCreatedGroup?: (boolean|null)
			supportPayload?: (string|null)
			limitSharing?: (waproto.LimitSharing.$Properties|null)
			limitSharingV2?: (waproto.LimitSharing.$Properties|null)
			threadId?: (waproto.ThreadID.$Properties[]|null)
			weblinkRenderConfig?: (waproto.WebLinkRenderConfig|null)
			teeBotMetadata?: (Uint8Array|null)
			accountEncryptionAttestation?: (waproto.NonE2EEAttestation.$Properties|null)
			associatedPrimaryIdentityKey?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MessageContextInfo.$Properties
		enum MessageAddonExpiryType {
			STATIC = 1,
			DEPENDENT_ON_PARENT = 2
		}
	}
	interface IMessageKey extends waproto.MessageKey.$Properties {
	}
	class MessageKey {
		constructor(p?: waproto.MessageKey.$Properties)
		$unknowns?: Uint8Array[]
		remoteJid?: (string|null)
		fromMe?: (boolean|null)
		id?: (string|null)
		participant?: (string|null)
		static encode(m: waproto.MessageKey.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageKey & waproto.MessageKey.$Shape
	}
	namespace MessageKey {
		interface $Properties {
			remoteJid?: (string|null)
			fromMe?: (boolean|null)
			id?: (string|null)
			participant?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MessageKey.$Properties
	}
	interface IMessageSecretMessage extends waproto.MessageSecretMessage.$Properties {
	}
	class MessageSecretMessage {
		constructor(p?: waproto.MessageSecretMessage.$Properties)
		$unknowns?: Uint8Array[]
		version?: (number|null)
		encIv?: (Uint8Array|null)
		encPayload?: (Uint8Array|null)
		static encode(m: waproto.MessageSecretMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageSecretMessage & waproto.MessageSecretMessage.$Shape
	}
	namespace MessageSecretMessage {
		interface $Properties {
			version?: (number|null)
			encIv?: (Uint8Array|null)
			encPayload?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MessageSecretMessage.$Properties
	}
	interface IMessageText extends waproto.MessageText.$Properties {
	}
	class MessageText {
		constructor(p?: waproto.MessageText.$Properties)
		$unknowns?: Uint8Array[]
		text?: (string|null)
		mentionedJid: string[]
		commands: waproto.Command.$Properties[]
		mentions: waproto.Mention.$Properties[]
		static encode(m: waproto.MessageText.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageText & waproto.MessageText.$Shape
	}
	namespace MessageText {
		interface $Properties {
			text?: (string|null)
			mentionedJid?: (string[]|null)
			commands?: (waproto.Command.$Properties[]|null)
			mentions?: (waproto.Mention.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MessageText.$Properties
	}
	interface IMoney extends waproto.Money.$Properties {
	}
	class Money {
		constructor(p?: waproto.Money.$Properties)
		$unknowns?: Uint8Array[]
		value?: (number|Long|null)
		offset?: (number|null)
		currencyCode?: (string|null)
		static encode(m: waproto.Money.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Money & waproto.Money.$Shape
	}
	namespace Money {
		interface $Properties {
			value?: (number|Long|null)
			offset?: (number|null)
			currencyCode?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Money.$Properties
	}
	interface IMsgOpaqueData extends waproto.MsgOpaqueData.$Properties {
	}
	class MsgOpaqueData {
		constructor(p?: waproto.MsgOpaqueData.$Properties)
		$unknowns?: Uint8Array[]
		body?: (string|null)
		caption?: (string|null)
		lng?: (number|null)
		isLive?: (boolean|null)
		lat?: (number|null)
		paymentAmount1000?: (number|null)
		paymentNoteMsgBody?: (string|null)
		matchedText?: (string|null)
		title?: (string|null)
		description?: (string|null)
		futureproofBuffer?: (Uint8Array|null)
		clientUrl?: (string|null)
		loc?: (string|null)
		pollName?: (string|null)
		pollOptions: waproto.MsgOpaqueData.PollOption.$Properties[]
		pollSelectableOptionsCount?: (number|null)
		messageSecret?: (Uint8Array|null)
		senderTimestampMs?: (number|Long|null)
		pollUpdateParentKey?: (string|null)
		encPollVote?: (waproto.PollEncValue.$Properties|null)
		encReactionTargetMessageKey?: (string|null)
		encReactionEncPayload?: (Uint8Array|null)
		encReactionEncIv?: (Uint8Array|null)
		isSentCagPollCreation?: (boolean|null)
		botMessageSecret?: (Uint8Array|null)
		targetMessageKey?: (string|null)
		encPayload?: (Uint8Array|null)
		encIv?: (Uint8Array|null)
		eventName?: (string|null)
		isEventCanceled?: (boolean|null)
		eventDescription?: (string|null)
		eventJoinLink?: (string|null)
		eventStartTime?: (number|Long|null)
		eventLocation?: (waproto.MsgOpaqueData.EventLocation.$Properties|null)
		eventEndTime?: (number|Long|null)
		pollVotesSnapshot?: (waproto.MsgOpaqueData.PollVotesSnapshot.$Properties|null)
		pollContentType?: (waproto.MsgOpaqueData.PollContentType|null)
		plainProtobufBytes?: (Uint8Array|null)
		eventIsScheduledCall?: (boolean|null)
		eventExtraGuestsAllowed?: (boolean|null)
		pollType?: (waproto.MsgOpaqueData.PollType|null)
		correctOptionIndex?: (number|null)
		quarantineExtractedText?: (string|null)
		pollEndTime?: (number|Long|null)
		pollHideVoterNames?: (boolean|null)
		originalSelfAuthor?: (string|null)
		pollAllowAddOption?: (boolean|null)
		sharableEventInviteId?: (string|null)
		sharableEventInviteTitle?: (string|null)
		sharableEventInviteStartTime?: (number|Long|null)
		sharableEventInviteEndTime?: (number|Long|null)
		sharableEventInviteCaption?: (string|null)
		sharableEventInviteIsCanceled?: (boolean|null)
		sharableEventInviteJpegThumbnail?: (Uint8Array|null)
		sharableEventInviteCallLink?: (string|null)
		static encode(m: waproto.MsgOpaqueData.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MsgOpaqueData & waproto.MsgOpaqueData.$Shape
	}
	namespace MsgOpaqueData {
		interface $Properties {
			body?: (string|null)
			caption?: (string|null)
			lng?: (number|null)
			isLive?: (boolean|null)
			lat?: (number|null)
			paymentAmount1000?: (number|null)
			paymentNoteMsgBody?: (string|null)
			matchedText?: (string|null)
			title?: (string|null)
			description?: (string|null)
			futureproofBuffer?: (Uint8Array|null)
			clientUrl?: (string|null)
			loc?: (string|null)
			pollName?: (string|null)
			pollOptions?: (waproto.MsgOpaqueData.PollOption.$Properties[]|null)
			pollSelectableOptionsCount?: (number|null)
			messageSecret?: (Uint8Array|null)
			senderTimestampMs?: (number|Long|null)
			pollUpdateParentKey?: (string|null)
			encPollVote?: (waproto.PollEncValue.$Properties|null)
			encReactionTargetMessageKey?: (string|null)
			encReactionEncPayload?: (Uint8Array|null)
			encReactionEncIv?: (Uint8Array|null)
			isSentCagPollCreation?: (boolean|null)
			botMessageSecret?: (Uint8Array|null)
			targetMessageKey?: (string|null)
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
			eventName?: (string|null)
			isEventCanceled?: (boolean|null)
			eventDescription?: (string|null)
			eventJoinLink?: (string|null)
			eventStartTime?: (number|Long|null)
			eventLocation?: (waproto.MsgOpaqueData.EventLocation.$Properties|null)
			eventEndTime?: (number|Long|null)
			pollVotesSnapshot?: (waproto.MsgOpaqueData.PollVotesSnapshot.$Properties|null)
			pollContentType?: (waproto.MsgOpaqueData.PollContentType|null)
			plainProtobufBytes?: (Uint8Array|null)
			eventIsScheduledCall?: (boolean|null)
			eventExtraGuestsAllowed?: (boolean|null)
			pollType?: (waproto.MsgOpaqueData.PollType|null)
			correctOptionIndex?: (number|null)
			quarantineExtractedText?: (string|null)
			pollEndTime?: (number|Long|null)
			pollHideVoterNames?: (boolean|null)
			originalSelfAuthor?: (string|null)
			pollAllowAddOption?: (boolean|null)
			sharableEventInviteId?: (string|null)
			sharableEventInviteTitle?: (string|null)
			sharableEventInviteStartTime?: (number|Long|null)
			sharableEventInviteEndTime?: (number|Long|null)
			sharableEventInviteCaption?: (string|null)
			sharableEventInviteIsCanceled?: (boolean|null)
			sharableEventInviteJpegThumbnail?: (Uint8Array|null)
			sharableEventInviteCallLink?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MsgOpaqueData.$Properties
		enum PollType {
			POLL = 0,
			QUIZ = 1
		}
		enum PollContentType {
			UNKNOWN = 0,
			TEXT = 1,
			IMAGE = 2
		}
		interface IEventLocation extends waproto.MsgOpaqueData.EventLocation.$Properties {
		}
		class EventLocation {
			constructor(p?: waproto.MsgOpaqueData.EventLocation.$Properties)
			$unknowns?: Uint8Array[]
			degreesLatitude?: (number|null)
			degreesLongitude?: (number|null)
			name?: (string|null)
			address?: (string|null)
			url?: (string|null)
			jpegThumbnail?: (Uint8Array|null)
			static encode(m: waproto.MsgOpaqueData.EventLocation.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.MsgOpaqueData.EventLocation & waproto.MsgOpaqueData.EventLocation.$Shape
		}
		namespace EventLocation {
			interface $Properties {
				degreesLatitude?: (number|null)
				degreesLongitude?: (number|null)
				name?: (string|null)
				address?: (string|null)
				url?: (string|null)
				jpegThumbnail?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.MsgOpaqueData.EventLocation.$Properties
		}
		interface IPollVotesSnapshot extends waproto.MsgOpaqueData.PollVotesSnapshot.$Properties {
		}
		class PollVotesSnapshot {
			constructor(p?: waproto.MsgOpaqueData.PollVotesSnapshot.$Properties)
			$unknowns?: Uint8Array[]
			pollVotes: waproto.MsgOpaqueData.PollVoteSnapshot.$Properties[]
			static encode(m: waproto.MsgOpaqueData.PollVotesSnapshot.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.MsgOpaqueData.PollVotesSnapshot & waproto.MsgOpaqueData.PollVotesSnapshot.$Shape
		}
		namespace PollVotesSnapshot {
			interface $Properties {
				pollVotes?: (waproto.MsgOpaqueData.PollVoteSnapshot.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.MsgOpaqueData.PollVotesSnapshot.$Properties
		}
		interface IPollVoteSnapshot extends waproto.MsgOpaqueData.PollVoteSnapshot.$Properties {
		}
		class PollVoteSnapshot {
			constructor(p?: waproto.MsgOpaqueData.PollVoteSnapshot.$Properties)
			$unknowns?: Uint8Array[]
			option?: (waproto.MsgOpaqueData.PollOption.$Properties|null)
			optionVoteCount?: (number|null)
			static encode(m: waproto.MsgOpaqueData.PollVoteSnapshot.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.MsgOpaqueData.PollVoteSnapshot & waproto.MsgOpaqueData.PollVoteSnapshot.$Shape
		}
		namespace PollVoteSnapshot {
			interface $Properties {
				option?: (waproto.MsgOpaqueData.PollOption.$Properties|null)
				optionVoteCount?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.MsgOpaqueData.PollVoteSnapshot.$Properties
		}
		interface IPollOption extends waproto.MsgOpaqueData.PollOption.$Properties {
		}
		class PollOption {
			constructor(p?: waproto.MsgOpaqueData.PollOption.$Properties)
			$unknowns?: Uint8Array[]
			name?: (string|null)
			hash?: (string|null)
			static encode(m: waproto.MsgOpaqueData.PollOption.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.MsgOpaqueData.PollOption & waproto.MsgOpaqueData.PollOption.$Shape
		}
		namespace PollOption {
			interface $Properties {
				name?: (string|null)
				hash?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.MsgOpaqueData.PollOption.$Properties
		}
	}
	interface IMsgRowOpaqueData extends waproto.MsgRowOpaqueData.$Properties {
	}
	class MsgRowOpaqueData {
		constructor(p?: waproto.MsgRowOpaqueData.$Properties)
		$unknowns?: Uint8Array[]
		currentMsg?: (waproto.MsgOpaqueData.$Properties|null)
		quotedMsg?: (waproto.MsgOpaqueData.$Properties|null)
		static encode(m: waproto.MsgRowOpaqueData.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.MsgRowOpaqueData & waproto.MsgRowOpaqueData.$Shape
	}
	namespace MsgRowOpaqueData {
		interface $Properties {
			currentMsg?: (waproto.MsgOpaqueData.$Properties|null)
			quotedMsg?: (waproto.MsgOpaqueData.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.MsgRowOpaqueData.$Properties
	}
	interface INoiseCertificate extends waproto.NoiseCertificate.$Properties {
	}
	class NoiseCertificate {
		constructor(p?: waproto.NoiseCertificate.$Properties)
		$unknowns?: Uint8Array[]
		details?: (Uint8Array|null)
		signature?: (Uint8Array|null)
		static encode(m: waproto.NoiseCertificate.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.NoiseCertificate & waproto.NoiseCertificate.$Shape
	}
	namespace NoiseCertificate {
		interface $Properties {
			details?: (Uint8Array|null)
			signature?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.NoiseCertificate.$Properties
		interface IDetails extends waproto.NoiseCertificate.Details.$Properties {
		}
		class Details {
			constructor(p?: waproto.NoiseCertificate.Details.$Properties)
			$unknowns?: Uint8Array[]
			serial?: (number|null)
			issuer?: (string|null)
			expires?: (number|Long|null)
			subject?: (string|null)
			key?: (Uint8Array|null)
			static encode(m: waproto.NoiseCertificate.Details.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.NoiseCertificate.Details & waproto.NoiseCertificate.Details.$Shape
		}
		namespace Details {
			interface $Properties {
				serial?: (number|null)
				issuer?: (string|null)
				expires?: (number|Long|null)
				subject?: (string|null)
				key?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.NoiseCertificate.Details.$Properties
		}
	}
	interface INonE2EEAttestation extends waproto.NonE2EEAttestation.$Properties {
	}
	class NonE2EEAttestation {
		constructor(p?: waproto.NonE2EEAttestation.$Properties)
		$unknowns?: Uint8Array[]
		accountType?: (waproto.NonE2EEAttestation.AccountType|null)
		static encode(m: waproto.NonE2EEAttestation.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.NonE2EEAttestation & waproto.NonE2EEAttestation.$Shape
	}
	namespace NonE2EEAttestation {
		interface $Properties {
			accountType?: (waproto.NonE2EEAttestation.AccountType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.NonE2EEAttestation.$Properties
		enum AccountType {
			E2EE = 0,
			HYBRID_E2EE = 1,
			NON_E2EE = 2
		}
	}
	interface INotificationMessageInfo extends waproto.NotificationMessageInfo.$Properties {
	}
	class NotificationMessageInfo {
		constructor(p?: waproto.NotificationMessageInfo.$Properties)
		$unknowns?: Uint8Array[]
		key?: (waproto.MessageKey.$Properties|null)
		message?: (waproto.Message.$Properties|null)
		messageTimestamp?: (number|Long|null)
		participant?: (string|null)
		static encode(m: waproto.NotificationMessageInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.NotificationMessageInfo & waproto.NotificationMessageInfo.$Shape
	}
	namespace NotificationMessageInfo {
		interface $Properties {
			key?: (waproto.MessageKey.$Properties|null)
			message?: (waproto.Message.$Properties|null)
			messageTimestamp?: (number|Long|null)
			participant?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.NotificationMessageInfo.$Properties
	}
	interface INotificationSettings extends waproto.NotificationSettings.$Properties {
	}
	class NotificationSettings {
		constructor(p?: waproto.NotificationSettings.$Properties)
		$unknowns?: Uint8Array[]
		messageVibrate?: (string|null)
		messagePopup?: (string|null)
		messageLight?: (string|null)
		lowPriorityNotifications?: (boolean|null)
		reactionsMuted?: (boolean|null)
		callVibrate?: (string|null)
		static encode(m: waproto.NotificationSettings.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.NotificationSettings & waproto.NotificationSettings.$Shape
	}
	namespace NotificationSettings {
		interface $Properties {
			messageVibrate?: (string|null)
			messagePopup?: (string|null)
			messageLight?: (string|null)
			lowPriorityNotifications?: (boolean|null)
			reactionsMuted?: (boolean|null)
			callVibrate?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.NotificationSettings.$Properties
	}
	interface IOrfThreadIdInput extends waproto.OrfThreadIdInput.$Properties {
	}
	class OrfThreadIdInput {
		constructor(p?: waproto.OrfThreadIdInput.$Properties)
		$unknowns?: Uint8Array[]
		orfClientState?: (Uint8Array|null)
		threadId?: (string|null)
		static encode(m: waproto.OrfThreadIdInput.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.OrfThreadIdInput & waproto.OrfThreadIdInput.$Shape
	}
	namespace OrfThreadIdInput {
		interface $Properties {
			orfClientState?: (Uint8Array|null)
			threadId?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.OrfThreadIdInput.$Properties
	}
	interface IOrfThreadIdOutput extends waproto.OrfThreadIdOutput.$Properties {
	}
	class OrfThreadIdOutput {
		constructor(p?: waproto.OrfThreadIdOutput.$Properties)
		$unknowns?: Uint8Array[]
		orfThreadId?: (Uint8Array|null)
		error?: (string|null)
		static encode(m: waproto.OrfThreadIdOutput.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.OrfThreadIdOutput & waproto.OrfThreadIdOutput.$Shape
	}
	namespace OrfThreadIdOutput {
		interface $Properties {
			orfThreadId?: (Uint8Array|null)
			error?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.OrfThreadIdOutput.$Properties
	}
	interface IPairingRequest extends waproto.PairingRequest.$Properties {
	}
	class PairingRequest {
		constructor(p?: waproto.PairingRequest.$Properties)
		$unknowns?: Uint8Array[]
		companionPublicKey?: (Uint8Array|null)
		companionIdentityKey?: (Uint8Array|null)
		advSecret?: (Uint8Array|null)
		static encode(m: waproto.PairingRequest.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PairingRequest & waproto.PairingRequest.$Shape
	}
	namespace PairingRequest {
		interface $Properties {
			companionPublicKey?: (Uint8Array|null)
			companionIdentityKey?: (Uint8Array|null)
			advSecret?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PairingRequest.$Properties
	}
	interface IPastParticipant extends waproto.PastParticipant.$Properties {
	}
	class PastParticipant {
		constructor(p?: waproto.PastParticipant.$Properties)
		$unknowns?: Uint8Array[]
		userJid?: (string|null)
		leaveReason?: (waproto.PastParticipant.LeaveReason|null)
		leaveTs?: (number|Long|null)
		static encode(m: waproto.PastParticipant.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PastParticipant & waproto.PastParticipant.$Shape
	}
	namespace PastParticipant {
		interface $Properties {
			userJid?: (string|null)
			leaveReason?: (waproto.PastParticipant.LeaveReason|null)
			leaveTs?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PastParticipant.$Properties
		enum LeaveReason {
			LEFT = 0,
			REMOVED = 1
		}
	}
	interface IPastParticipants extends waproto.PastParticipants.$Properties {
	}
	class PastParticipants {
		constructor(p?: waproto.PastParticipants.$Properties)
		$unknowns?: Uint8Array[]
		groupJid?: (string|null)
		pastParticipants: waproto.PastParticipant.$Properties[]
		static encode(m: waproto.PastParticipants.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PastParticipants & waproto.PastParticipants.$Shape
	}
	namespace PastParticipants {
		interface $Properties {
			groupJid?: (string|null)
			pastParticipants?: (waproto.PastParticipant.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PastParticipants.$Properties
	}
	interface IPatchDebugData extends waproto.PatchDebugData.$Properties {
	}
	class PatchDebugData {
		constructor(p?: waproto.PatchDebugData.$Properties)
		$unknowns?: Uint8Array[]
		currentLthash?: (Uint8Array|null)
		newLthash?: (Uint8Array|null)
		patchVersion?: (Uint8Array|null)
		collectionName?: (Uint8Array|null)
		firstFourBytesFromAHashOfSnapshotMacKey?: (Uint8Array|null)
		newLthashSubtract?: (Uint8Array|null)
		numberAdd?: (number|null)
		numberRemove?: (number|null)
		numberOverride?: (number|null)
		senderPlatform?: (waproto.PatchDebugData.Platform|null)
		isSenderPrimary?: (boolean|null)
		static encode(m: waproto.PatchDebugData.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PatchDebugData & waproto.PatchDebugData.$Shape
	}
	namespace PatchDebugData {
		interface $Properties {
			currentLthash?: (Uint8Array|null)
			newLthash?: (Uint8Array|null)
			patchVersion?: (Uint8Array|null)
			collectionName?: (Uint8Array|null)
			firstFourBytesFromAHashOfSnapshotMacKey?: (Uint8Array|null)
			newLthashSubtract?: (Uint8Array|null)
			numberAdd?: (number|null)
			numberRemove?: (number|null)
			numberOverride?: (number|null)
			senderPlatform?: (waproto.PatchDebugData.Platform|null)
			isSenderPrimary?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PatchDebugData.$Properties
		enum Platform {
			ANDROID = 0,
			SMBA = 1,
			IPHONE = 2,
			SMBI = 3,
			WEB = 4,
			UWP = 5,
			DARWIN = 6,
			IPAD = 7,
			WEAROS = 8,
			WASG = 9,
			WEARM = 10,
			CAPI = 11
		}
	}
	interface IPaymentBackground extends waproto.PaymentBackground.$Properties {
	}
	class PaymentBackground {
		constructor(p?: waproto.PaymentBackground.$Properties)
		$unknowns?: Uint8Array[]
		id?: (string|null)
		fileLength?: (number|Long|null)
		width?: (number|null)
		height?: (number|null)
		mimetype?: (string|null)
		placeholderArgb?: (number|null)
		textArgb?: (number|null)
		subtextArgb?: (number|null)
		mediaData?: (waproto.PaymentBackground.MediaData.$Properties|null)
		type?: (waproto.PaymentBackground.Type|null)
		static encode(m: waproto.PaymentBackground.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PaymentBackground & waproto.PaymentBackground.$Shape
	}
	namespace PaymentBackground {
		interface $Properties {
			id?: (string|null)
			fileLength?: (number|Long|null)
			width?: (number|null)
			height?: (number|null)
			mimetype?: (string|null)
			placeholderArgb?: (number|null)
			textArgb?: (number|null)
			subtextArgb?: (number|null)
			mediaData?: (waproto.PaymentBackground.MediaData.$Properties|null)
			type?: (waproto.PaymentBackground.Type|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PaymentBackground.$Properties
		enum Type {
			UNKNOWN = 0,
			DEFAULT = 1
		}
		interface IMediaData extends waproto.PaymentBackground.MediaData.$Properties {
		}
		class MediaData {
			constructor(p?: waproto.PaymentBackground.MediaData.$Properties)
			$unknowns?: Uint8Array[]
			mediaKey?: (Uint8Array|null)
			mediaKeyTimestamp?: (number|Long|null)
			fileSha256?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			directPath?: (string|null)
			static encode(m: waproto.PaymentBackground.MediaData.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.PaymentBackground.MediaData & waproto.PaymentBackground.MediaData.$Shape
		}
		namespace MediaData {
			interface $Properties {
				mediaKey?: (Uint8Array|null)
				mediaKeyTimestamp?: (number|Long|null)
				fileSha256?: (Uint8Array|null)
				fileEncSha256?: (Uint8Array|null)
				directPath?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.PaymentBackground.MediaData.$Properties
		}
	}
	interface IPaymentInfo extends waproto.PaymentInfo.$Properties {
	}
	class PaymentInfo {
		constructor(p?: waproto.PaymentInfo.$Properties)
		$unknowns?: Uint8Array[]
		currencyDeprecated?: (waproto.PaymentInfo.Currency|null)
		amount1000?: (number|Long|null)
		receiverJid?: (string|null)
		status?: (waproto.PaymentInfo.Status|null)
		transactionTimestamp?: (number|Long|null)
		requestMessageKey?: (waproto.MessageKey.$Properties|null)
		expiryTimestamp?: (number|Long|null)
		futureproofed?: (boolean|null)
		currency?: (string|null)
		txnStatus?: (waproto.PaymentInfo.TxnStatus|null)
		useNoviFiatFormat?: (boolean|null)
		primaryAmount?: (waproto.Money.$Properties|null)
		exchangeAmount?: (waproto.Money.$Properties|null)
		static encode(m: waproto.PaymentInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PaymentInfo & waproto.PaymentInfo.$Shape
	}
	namespace PaymentInfo {
		interface $Properties {
			currencyDeprecated?: (waproto.PaymentInfo.Currency|null)
			amount1000?: (number|Long|null)
			receiverJid?: (string|null)
			status?: (waproto.PaymentInfo.Status|null)
			transactionTimestamp?: (number|Long|null)
			requestMessageKey?: (waproto.MessageKey.$Properties|null)
			expiryTimestamp?: (number|Long|null)
			futureproofed?: (boolean|null)
			currency?: (string|null)
			txnStatus?: (waproto.PaymentInfo.TxnStatus|null)
			useNoviFiatFormat?: (boolean|null)
			primaryAmount?: (waproto.Money.$Properties|null)
			exchangeAmount?: (waproto.Money.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PaymentInfo.$Properties
		enum TxnStatus {
			UNKNOWN = 0,
			PENDING_SETUP = 1,
			PENDING_RECEIVER_SETUP = 2,
			INIT = 3,
			SUCCESS = 4,
			COMPLETED = 5,
			FAILED = 6,
			FAILED_RISK = 7,
			FAILED_PROCESSING = 8,
			FAILED_RECEIVER_PROCESSING = 9,
			FAILED_DA = 10,
			FAILED_DA_FINAL = 11,
			REFUNDED_TXN = 12,
			REFUND_FAILED = 13,
			REFUND_FAILED_PROCESSING = 14,
			REFUND_FAILED_DA = 15,
			EXPIRED_TXN = 16,
			AUTH_CANCELED = 17,
			AUTH_CANCEL_FAILED_PROCESSING = 18,
			AUTH_CANCEL_FAILED = 19,
			COLLECT_INIT = 20,
			COLLECT_SUCCESS = 21,
			COLLECT_FAILED = 22,
			COLLECT_FAILED_RISK = 23,
			COLLECT_REJECTED = 24,
			COLLECT_EXPIRED = 25,
			COLLECT_CANCELED = 26,
			COLLECT_CANCELLING = 27,
			IN_REVIEW = 28,
			REVERSAL_SUCCESS = 29,
			REVERSAL_PENDING = 30,
			REFUND_PENDING = 31
		}
		enum Status {
			UNKNOWN_STATUS = 0,
			PROCESSING = 1,
			SENT = 2,
			NEED_TO_ACCEPT = 3,
			COMPLETE = 4,
			COULD_NOT_COMPLETE = 5,
			REFUNDED = 6,
			EXPIRED = 7,
			REJECTED = 8,
			CANCELLED = 9,
			WAITING_FOR_PAYER = 10,
			WAITING = 11
		}
		enum Currency {
			UNKNOWN_CURRENCY = 0,
			INR = 1
		}
	}
	interface IPhoneNumberToLIDMapping extends waproto.PhoneNumberToLIDMapping.$Properties {
	}
	class PhoneNumberToLIDMapping {
		constructor(p?: waproto.PhoneNumberToLIDMapping.$Properties)
		$unknowns?: Uint8Array[]
		pnJid?: (string|null)
		lidJid?: (string|null)
		static encode(m: waproto.PhoneNumberToLIDMapping.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PhoneNumberToLIDMapping & waproto.PhoneNumberToLIDMapping.$Shape
	}
	namespace PhoneNumberToLIDMapping {
		interface $Properties {
			pnJid?: (string|null)
			lidJid?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PhoneNumberToLIDMapping.$Properties
	}
	interface IPhotoChange extends waproto.PhotoChange.$Properties {
	}
	class PhotoChange {
		constructor(p?: waproto.PhotoChange.$Properties)
		$unknowns?: Uint8Array[]
		oldPhoto?: (Uint8Array|null)
		newPhoto?: (Uint8Array|null)
		newPhotoId?: (number|null)
		static encode(m: waproto.PhotoChange.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PhotoChange & waproto.PhotoChange.$Shape
	}
	namespace PhotoChange {
		interface $Properties {
			oldPhoto?: (Uint8Array|null)
			newPhoto?: (Uint8Array|null)
			newPhotoId?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PhotoChange.$Properties
	}
	interface IPinInChat extends waproto.PinInChat.$Properties {
	}
	class PinInChat {
		constructor(p?: waproto.PinInChat.$Properties)
		$unknowns?: Uint8Array[]
		type?: (waproto.PinInChat.Type|null)
		key?: (waproto.MessageKey.$Properties|null)
		senderTimestampMs?: (number|Long|null)
		serverTimestampMs?: (number|Long|null)
		messageAddOnContextInfo?: (waproto.MessageAddOnContextInfo.$Properties|null)
		static encode(m: waproto.PinInChat.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PinInChat & waproto.PinInChat.$Shape
	}
	namespace PinInChat {
		interface $Properties {
			type?: (waproto.PinInChat.Type|null)
			key?: (waproto.MessageKey.$Properties|null)
			senderTimestampMs?: (number|Long|null)
			serverTimestampMs?: (number|Long|null)
			messageAddOnContextInfo?: (waproto.MessageAddOnContextInfo.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PinInChat.$Properties
		enum Type {
			UNKNOWN_TYPE = 0,
			PIN_FOR_ALL = 1,
			UNPIN_FOR_ALL = 2
		}
	}
	interface IPoint extends waproto.Point.$Properties {
	}
	class Point {
		constructor(p?: waproto.Point.$Properties)
		$unknowns?: Uint8Array[]
		xDeprecated?: (number|null)
		yDeprecated?: (number|null)
		x?: (number|null)
		y?: (number|null)
		static encode(m: waproto.Point.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Point & waproto.Point.$Shape
	}
	namespace Point {
		interface $Properties {
			xDeprecated?: (number|null)
			yDeprecated?: (number|null)
			x?: (number|null)
			y?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Point.$Properties
	}
	interface IPollAdditionalMetadata extends waproto.PollAdditionalMetadata.$Properties {
	}
	class PollAdditionalMetadata {
		constructor(p?: waproto.PollAdditionalMetadata.$Properties)
		$unknowns?: Uint8Array[]
		pollInvalidated?: (boolean|null)
		pollNameHashHistory: waproto.PollAdditionalMetadata.PollNameHashHistoryEntry.$Properties[]
		static encode(m: waproto.PollAdditionalMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PollAdditionalMetadata & waproto.PollAdditionalMetadata.$Shape
	}
	namespace PollAdditionalMetadata {
		interface $Properties {
			pollInvalidated?: (boolean|null)
			pollNameHashHistory?: (waproto.PollAdditionalMetadata.PollNameHashHistoryEntry.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PollAdditionalMetadata.$Properties
		interface IPollNameHashHistoryEntry extends waproto.PollAdditionalMetadata.PollNameHashHistoryEntry.$Properties {
		}
		class PollNameHashHistoryEntry {
			constructor(p?: waproto.PollAdditionalMetadata.PollNameHashHistoryEntry.$Properties)
			$unknowns?: Uint8Array[]
			editStanzaId?: (string|null)
			pollNameHash?: (Uint8Array|null)
			static encode(m: waproto.PollAdditionalMetadata.PollNameHashHistoryEntry.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.PollAdditionalMetadata.PollNameHashHistoryEntry & waproto.PollAdditionalMetadata.PollNameHashHistoryEntry.$Shape
		}
		namespace PollNameHashHistoryEntry {
			interface $Properties {
				editStanzaId?: (string|null)
				pollNameHash?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.PollAdditionalMetadata.PollNameHashHistoryEntry.$Properties
		}
	}
	interface IPollEncValue extends waproto.PollEncValue.$Properties {
	}
	class PollEncValue {
		constructor(p?: waproto.PollEncValue.$Properties)
		$unknowns?: Uint8Array[]
		encPayload?: (Uint8Array|null)
		encIv?: (Uint8Array|null)
		static encode(m: waproto.PollEncValue.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PollEncValue & waproto.PollEncValue.$Shape
	}
	namespace PollEncValue {
		interface $Properties {
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PollEncValue.$Properties
	}
	interface IPollUpdate extends waproto.PollUpdate.$Properties {
	}
	class PollUpdate {
		constructor(p?: waproto.PollUpdate.$Properties)
		$unknowns?: Uint8Array[]
		pollUpdateMessageKey?: (waproto.MessageKey.$Properties|null)
		vote?: (waproto.Message.PollVoteMessage.$Properties|null)
		senderTimestampMs?: (number|Long|null)
		serverTimestampMs?: (number|Long|null)
		unread?: (boolean|null)
		metadata?: (waproto.Message.PollUpdateMessageMetadata.$Properties|null)
		static encode(m: waproto.PollUpdate.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PollUpdate & waproto.PollUpdate.$Shape
	}
	namespace PollUpdate {
		interface $Properties {
			pollUpdateMessageKey?: (waproto.MessageKey.$Properties|null)
			vote?: (waproto.Message.PollVoteMessage.$Properties|null)
			senderTimestampMs?: (number|Long|null)
			serverTimestampMs?: (number|Long|null)
			unread?: (boolean|null)
			metadata?: (waproto.Message.PollUpdateMessageMetadata.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PollUpdate.$Properties
	}
	interface IPreKeyRecordStructure extends waproto.PreKeyRecordStructure.$Properties {
	}
	class PreKeyRecordStructure {
		constructor(p?: waproto.PreKeyRecordStructure.$Properties)
		$unknowns?: Uint8Array[]
		id?: (number|null)
		publicKey?: (Uint8Array|null)
		privateKey?: (Uint8Array|null)
		static encode(m: waproto.PreKeyRecordStructure.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PreKeyRecordStructure & waproto.PreKeyRecordStructure.$Shape
	}
	namespace PreKeyRecordStructure {
		interface $Properties {
			id?: (number|null)
			publicKey?: (Uint8Array|null)
			privateKey?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PreKeyRecordStructure.$Properties
	}
	interface IPreKeySignalMessage extends waproto.PreKeySignalMessage.$Properties {
	}
	class PreKeySignalMessage {
		constructor(p?: waproto.PreKeySignalMessage.$Properties)
		$unknowns?: Uint8Array[]
		preKeyId?: (number|null)
		baseKey?: (Uint8Array|null)
		identityKey?: (Uint8Array|null)
		message?: (Uint8Array|null)
		registrationId?: (number|null)
		signedPreKeyId?: (number|null)
		kyberPreKeyId?: (number|null)
		kyberCiphertext?: (Uint8Array|null)
		static encode(m: waproto.PreKeySignalMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PreKeySignalMessage & waproto.PreKeySignalMessage.$Shape
	}
	namespace PreKeySignalMessage {
		interface $Properties {
			preKeyId?: (number|null)
			baseKey?: (Uint8Array|null)
			identityKey?: (Uint8Array|null)
			message?: (Uint8Array|null)
			registrationId?: (number|null)
			signedPreKeyId?: (number|null)
			kyberPreKeyId?: (number|null)
			kyberCiphertext?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PreKeySignalMessage.$Properties
	}
	interface IPremiumMessageInfo extends waproto.PremiumMessageInfo.$Properties {
	}
	class PremiumMessageInfo {
		constructor(p?: waproto.PremiumMessageInfo.$Properties)
		$unknowns?: Uint8Array[]
		serverCampaignId?: (string|null)
		static encode(m: waproto.PremiumMessageInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PremiumMessageInfo & waproto.PremiumMessageInfo.$Shape
	}
	namespace PremiumMessageInfo {
		interface $Properties {
			serverCampaignId?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PremiumMessageInfo.$Properties
	}
	interface IPrimaryEphemeralIdentity extends waproto.PrimaryEphemeralIdentity.$Properties {
	}
	class PrimaryEphemeralIdentity {
		constructor(p?: waproto.PrimaryEphemeralIdentity.$Properties)
		$unknowns?: Uint8Array[]
		publicKey?: (Uint8Array|null)
		nonce?: (Uint8Array|null)
		static encode(m: waproto.PrimaryEphemeralIdentity.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.PrimaryEphemeralIdentity & waproto.PrimaryEphemeralIdentity.$Shape
	}
	namespace PrimaryEphemeralIdentity {
		interface $Properties {
			publicKey?: (Uint8Array|null)
			nonce?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.PrimaryEphemeralIdentity.$Properties
	}
	interface IProcessedVideo extends waproto.ProcessedVideo.$Properties {
	}
	class ProcessedVideo {
		constructor(p?: waproto.ProcessedVideo.$Properties)
		$unknowns?: Uint8Array[]
		directPath?: (string|null)
		fileSha256?: (Uint8Array|null)
		height?: (number|null)
		width?: (number|null)
		fileLength?: (number|Long|null)
		bitrate?: (number|null)
		quality?: (waproto.ProcessedVideo.VideoQuality|null)
		capabilities: string[]
		static encode(m: waproto.ProcessedVideo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ProcessedVideo & waproto.ProcessedVideo.$Shape
	}
	namespace ProcessedVideo {
		interface $Properties {
			directPath?: (string|null)
			fileSha256?: (Uint8Array|null)
			height?: (number|null)
			width?: (number|null)
			fileLength?: (number|Long|null)
			bitrate?: (number|null)
			quality?: (waproto.ProcessedVideo.VideoQuality|null)
			capabilities?: (string[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ProcessedVideo.$Properties
		enum VideoQuality {
			UNDEFINED = 0,
			LOW = 1,
			MID = 2,
			HIGH = 3
		}
	}
	interface IProloguePayload extends waproto.ProloguePayload.$Properties {
	}
	class ProloguePayload {
		constructor(p?: waproto.ProloguePayload.$Properties)
		$unknowns?: Uint8Array[]
		companionEphemeralIdentity?: (Uint8Array|null)
		commitment?: (waproto.CompanionCommitment.$Properties|null)
		static encode(m: waproto.ProloguePayload.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ProloguePayload & waproto.ProloguePayload.$Shape
	}
	namespace ProloguePayload {
		interface $Properties {
			companionEphemeralIdentity?: (Uint8Array|null)
			commitment?: (waproto.CompanionCommitment.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ProloguePayload.$Properties
	}
	interface IPushname extends waproto.Pushname.$Properties {
	}
	class Pushname {
		constructor(p?: waproto.Pushname.$Properties)
		$unknowns?: Uint8Array[]
		id?: (string|null)
		pushname?: (string|null)
		static encode(m: waproto.Pushname.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Pushname & waproto.Pushname.$Shape
	}
	namespace Pushname {
		interface $Properties {
			id?: (string|null)
			pushname?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Pushname.$Properties
	}
	interface IQP extends waproto.QP.$Properties {
	}
	class QP {
		constructor(p?: waproto.QP.$Properties)
		$unknowns?: Uint8Array[]
		static encode(m: waproto.QP.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.QP & waproto.QP.$Shape
	}
	namespace QP {
		interface $Properties {
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.QP.$Properties
		enum FilterResult {
			TRUE = 1,
			FALSE = 2,
			UNKNOWN = 3
		}
		enum FilterClientNotSupportedConfig {
			PASS_BY_DEFAULT = 1,
			FAIL_BY_DEFAULT = 2
		}
		enum ClauseType {
			AND = 1,
			OR = 2,
			NOR = 3
		}
		interface IFilterClause extends waproto.QP.FilterClause.$Properties {
		}
		class FilterClause {
			constructor(p?: waproto.QP.FilterClause.$Properties)
			$unknowns?: Uint8Array[]
			clauseType?: (waproto.QP.ClauseType|null)
			clauses: waproto.QP.FilterClause.$Properties[]
			filters: waproto.QP.Filter.$Properties[]
			static encode(m: waproto.QP.FilterClause.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.QP.FilterClause & waproto.QP.FilterClause.$Shape
		}
		namespace FilterClause {
			interface $Properties {
				clauseType?: (waproto.QP.ClauseType|null)
				clauses?: (waproto.QP.FilterClause.$Properties[]|null)
				filters?: (waproto.QP.Filter.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.QP.FilterClause.$Properties
		}
		interface IFilter extends waproto.QP.Filter.$Properties {
		}
		class Filter {
			constructor(p?: waproto.QP.Filter.$Properties)
			$unknowns?: Uint8Array[]
			filterName?: (string|null)
			parameters: waproto.QP.FilterParameters.$Properties[]
			filterResult?: (waproto.QP.FilterResult|null)
			clientNotSupportedConfig?: (waproto.QP.FilterClientNotSupportedConfig|null)
			static encode(m: waproto.QP.Filter.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.QP.Filter & waproto.QP.Filter.$Shape
		}
		namespace Filter {
			interface $Properties {
				filterName?: (string|null)
				parameters?: (waproto.QP.FilterParameters.$Properties[]|null)
				filterResult?: (waproto.QP.FilterResult|null)
				clientNotSupportedConfig?: (waproto.QP.FilterClientNotSupportedConfig|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.QP.Filter.$Properties
		}
		interface IFilterParameters extends waproto.QP.FilterParameters.$Properties {
		}
		class FilterParameters {
			constructor(p?: waproto.QP.FilterParameters.$Properties)
			$unknowns?: Uint8Array[]
			key?: (string|null)
			value?: (string|null)
			static encode(m: waproto.QP.FilterParameters.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.QP.FilterParameters & waproto.QP.FilterParameters.$Shape
		}
		namespace FilterParameters {
			interface $Properties {
				key?: (string|null)
				value?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.QP.FilterParameters.$Properties
		}
	}
	interface IQuarantinedMessage extends waproto.QuarantinedMessage.$Properties {
	}
	class QuarantinedMessage {
		constructor(p?: waproto.QuarantinedMessage.$Properties)
		$unknowns?: Uint8Array[]
		originalData?: (Uint8Array|null)
		extractedText?: (string|null)
		static encode(m: waproto.QuarantinedMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.QuarantinedMessage & waproto.QuarantinedMessage.$Shape
	}
	namespace QuarantinedMessage {
		interface $Properties {
			originalData?: (Uint8Array|null)
			extractedText?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.QuarantinedMessage.$Properties
	}
	interface IReaction extends waproto.Reaction.$Properties {
	}
	class Reaction {
		constructor(p?: waproto.Reaction.$Properties)
		$unknowns?: Uint8Array[]
		key?: (waproto.MessageKey.$Properties|null)
		text?: (string|null)
		groupingKey?: (string|null)
		senderTimestampMs?: (number|Long|null)
		unread?: (boolean|null)
		static encode(m: waproto.Reaction.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Reaction & waproto.Reaction.$Shape
	}
	namespace Reaction {
		interface $Properties {
			key?: (waproto.MessageKey.$Properties|null)
			text?: (string|null)
			groupingKey?: (string|null)
			senderTimestampMs?: (number|Long|null)
			unread?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Reaction.$Properties
	}
	interface IRecentEmojiWeight extends waproto.RecentEmojiWeight.$Properties {
	}
	class RecentEmojiWeight {
		constructor(p?: waproto.RecentEmojiWeight.$Properties)
		$unknowns?: Uint8Array[]
		emoji?: (string|null)
		weight?: (number|null)
		static encode(m: waproto.RecentEmojiWeight.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.RecentEmojiWeight & waproto.RecentEmojiWeight.$Shape
	}
	namespace RecentEmojiWeight {
		interface $Properties {
			emoji?: (string|null)
			weight?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.RecentEmojiWeight.$Properties
	}
	interface IRecordStructure extends waproto.RecordStructure.$Properties {
	}
	class RecordStructure {
		constructor(p?: waproto.RecordStructure.$Properties)
		$unknowns?: Uint8Array[]
		currentSession?: (waproto.SessionStructure.$Properties|null)
		previousSessions: waproto.SessionStructure.$Properties[]
		static encode(m: waproto.RecordStructure.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.RecordStructure & waproto.RecordStructure.$Shape
	}
	namespace RecordStructure {
		interface $Properties {
			currentSession?: (waproto.SessionStructure.$Properties|null)
			previousSessions?: (waproto.SessionStructure.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.RecordStructure.$Properties
	}
	interface IReportable extends waproto.Reportable.$Properties {
	}
	class Reportable {
		constructor(p?: waproto.Reportable.$Properties)
		$unknowns?: Uint8Array[]
		minVersion?: (number|null)
		maxVersion?: (number|null)
		notReportableMinVersion?: (number|null)
		never?: (boolean|null)
		static encode(m: waproto.Reportable.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.Reportable & waproto.Reportable.$Shape
	}
	namespace Reportable {
		interface $Properties {
			minVersion?: (number|null)
			maxVersion?: (number|null)
			notReportableMinVersion?: (number|null)
			never?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.Reportable.$Properties
	}
	interface IReportingTokenInfo extends waproto.ReportingTokenInfo.$Properties {
	}
	class ReportingTokenInfo {
		constructor(p?: waproto.ReportingTokenInfo.$Properties)
		$unknowns?: Uint8Array[]
		reportingTag?: (Uint8Array|null)
		reportingTagTimestamp?: (number|Long|null)
		static encode(m: waproto.ReportingTokenInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ReportingTokenInfo & waproto.ReportingTokenInfo.$Shape
	}
	namespace ReportingTokenInfo {
		interface $Properties {
			reportingTag?: (Uint8Array|null)
			reportingTagTimestamp?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ReportingTokenInfo.$Properties
	}
	interface IRoutingInfo extends waproto.RoutingInfo.$Properties {
	}
	class RoutingInfo {
		constructor(p?: waproto.RoutingInfo.$Properties)
		$unknowns?: Uint8Array[]
		regionId: number[]
		clusterId: number[]
		taskId?: (number|null)
		debug?: (boolean|null)
		tcpBbr?: (boolean|null)
		tcpKeepalive?: (boolean|null)
		static encode(m: waproto.RoutingInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.RoutingInfo & waproto.RoutingInfo.$Shape
	}
	namespace RoutingInfo {
		interface $Properties {
			regionId?: (number[]|null)
			clusterId?: (number[]|null)
			taskId?: (number|null)
			debug?: (boolean|null)
			tcpBbr?: (boolean|null)
			tcpKeepalive?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.RoutingInfo.$Properties
	}
	interface IScheduledMessageMetadata extends waproto.ScheduledMessageMetadata.$Properties {
	}
	class ScheduledMessageMetadata {
		constructor(p?: waproto.ScheduledMessageMetadata.$Properties)
		$unknowns?: Uint8Array[]
		revealKeyId?: (string|null)
		revealKey?: (Uint8Array|null)
		scheduledTime?: (number|Long|null)
		static encode(m: waproto.ScheduledMessageMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ScheduledMessageMetadata & waproto.ScheduledMessageMetadata.$Shape
	}
	namespace ScheduledMessageMetadata {
		interface $Properties {
			revealKeyId?: (string|null)
			revealKey?: (Uint8Array|null)
			scheduledTime?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ScheduledMessageMetadata.$Properties
	}
	interface ISenderKeyDistributionMessage extends waproto.SenderKeyDistributionMessage.$Properties {
	}
	class SenderKeyDistributionMessage {
		constructor(p?: waproto.SenderKeyDistributionMessage.$Properties)
		$unknowns?: Uint8Array[]
		id?: (number|null)
		iteration?: (number|null)
		chainKey?: (Uint8Array|null)
		signingKey?: (Uint8Array|null)
		static encode(m: waproto.SenderKeyDistributionMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyDistributionMessage & waproto.SenderKeyDistributionMessage.$Shape
	}
	namespace SenderKeyDistributionMessage {
		interface $Properties {
			id?: (number|null)
			iteration?: (number|null)
			chainKey?: (Uint8Array|null)
			signingKey?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SenderKeyDistributionMessage.$Properties
	}
	interface ISenderKeyMessage extends waproto.SenderKeyMessage.$Properties {
	}
	class SenderKeyMessage {
		constructor(p?: waproto.SenderKeyMessage.$Properties)
		$unknowns?: Uint8Array[]
		id?: (number|null)
		iteration?: (number|null)
		ciphertext?: (Uint8Array|null)
		static encode(m: waproto.SenderKeyMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyMessage & waproto.SenderKeyMessage.$Shape
	}
	namespace SenderKeyMessage {
		interface $Properties {
			id?: (number|null)
			iteration?: (number|null)
			ciphertext?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SenderKeyMessage.$Properties
	}
	interface ISenderKeyRecordStructure extends waproto.SenderKeyRecordStructure.$Properties {
	}
	class SenderKeyRecordStructure {
		constructor(p?: waproto.SenderKeyRecordStructure.$Properties)
		$unknowns?: Uint8Array[]
		senderKeyStates: waproto.SenderKeyStateStructure.$Properties[]
		static encode(m: waproto.SenderKeyRecordStructure.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyRecordStructure & waproto.SenderKeyRecordStructure.$Shape
	}
	namespace SenderKeyRecordStructure {
		interface $Properties {
			senderKeyStates?: (waproto.SenderKeyStateStructure.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SenderKeyRecordStructure.$Properties
	}
	interface ISenderKeyStateStructure extends waproto.SenderKeyStateStructure.$Properties {
	}
	class SenderKeyStateStructure {
		constructor(p?: waproto.SenderKeyStateStructure.$Properties)
		$unknowns?: Uint8Array[]
		senderKeyId?: (number|null)
		senderChainKey?: (waproto.SenderKeyStateStructure.SenderChainKey.$Properties|null)
		senderSigningKey?: (waproto.SenderKeyStateStructure.SenderSigningKey.$Properties|null)
		senderMessageKeys: waproto.SenderKeyStateStructure.SenderMessageKey.$Properties[]
		static encode(m: waproto.SenderKeyStateStructure.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyStateStructure & waproto.SenderKeyStateStructure.$Shape
	}
	namespace SenderKeyStateStructure {
		interface $Properties {
			senderKeyId?: (number|null)
			senderChainKey?: (waproto.SenderKeyStateStructure.SenderChainKey.$Properties|null)
			senderSigningKey?: (waproto.SenderKeyStateStructure.SenderSigningKey.$Properties|null)
			senderMessageKeys?: (waproto.SenderKeyStateStructure.SenderMessageKey.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SenderKeyStateStructure.$Properties
		interface ISenderSigningKey extends waproto.SenderKeyStateStructure.SenderSigningKey.$Properties {
		}
		class SenderSigningKey {
			constructor(p?: waproto.SenderKeyStateStructure.SenderSigningKey.$Properties)
			$unknowns?: Uint8Array[]
			public?: (Uint8Array|null)
			private?: (Uint8Array|null)
			static encode(m: waproto.SenderKeyStateStructure.SenderSigningKey.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyStateStructure.SenderSigningKey & waproto.SenderKeyStateStructure.SenderSigningKey.$Shape
		}
		namespace SenderSigningKey {
			interface $Properties {
				"public"?: (Uint8Array|null)
				"private"?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SenderKeyStateStructure.SenderSigningKey.$Properties
		}
		interface ISenderMessageKey extends waproto.SenderKeyStateStructure.SenderMessageKey.$Properties {
		}
		class SenderMessageKey {
			constructor(p?: waproto.SenderKeyStateStructure.SenderMessageKey.$Properties)
			$unknowns?: Uint8Array[]
			iteration?: (number|null)
			seed?: (Uint8Array|null)
			static encode(m: waproto.SenderKeyStateStructure.SenderMessageKey.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyStateStructure.SenderMessageKey & waproto.SenderKeyStateStructure.SenderMessageKey.$Shape
		}
		namespace SenderMessageKey {
			interface $Properties {
				iteration?: (number|null)
				seed?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SenderKeyStateStructure.SenderMessageKey.$Properties
		}
		interface ISenderChainKey extends waproto.SenderKeyStateStructure.SenderChainKey.$Properties {
		}
		class SenderChainKey {
			constructor(p?: waproto.SenderKeyStateStructure.SenderChainKey.$Properties)
			$unknowns?: Uint8Array[]
			iteration?: (number|null)
			seed?: (Uint8Array|null)
			static encode(m: waproto.SenderKeyStateStructure.SenderChainKey.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyStateStructure.SenderChainKey & waproto.SenderKeyStateStructure.SenderChainKey.$Shape
		}
		namespace SenderChainKey {
			interface $Properties {
				iteration?: (number|null)
				seed?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SenderKeyStateStructure.SenderChainKey.$Properties
		}
	}
	interface IServerErrorReceipt extends waproto.ServerErrorReceipt.$Properties {
	}
	class ServerErrorReceipt {
		constructor(p?: waproto.ServerErrorReceipt.$Properties)
		$unknowns?: Uint8Array[]
		stanzaId?: (string|null)
		static encode(m: waproto.ServerErrorReceipt.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ServerErrorReceipt & waproto.ServerErrorReceipt.$Shape
	}
	namespace ServerErrorReceipt {
		interface $Properties {
			stanzaId?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ServerErrorReceipt.$Properties
	}
	interface ISessionStructure extends waproto.SessionStructure.$Properties {
	}
	class SessionStructure {
		constructor(p?: waproto.SessionStructure.$Properties)
		$unknowns?: Uint8Array[]
		sessionVersion?: (number|null)
		localIdentityPublic?: (Uint8Array|null)
		remoteIdentityPublic?: (Uint8Array|null)
		rootKey?: (Uint8Array|null)
		previousCounter?: (number|null)
		senderChain?: (waproto.SessionStructure.Chain.$Properties|null)
		receiverChains: waproto.SessionStructure.Chain.$Properties[]
		pendingKeyExchange?: (waproto.SessionStructure.PendingKeyExchange.$Properties|null)
		pendingPreKey?: (waproto.SessionStructure.PendingPreKey.$Properties|null)
		remoteRegistrationId?: (number|null)
		localRegistrationId?: (number|null)
		needsRefresh?: (boolean|null)
		aliceBaseKey?: (Uint8Array|null)
		static encode(m: waproto.SessionStructure.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionStructure & waproto.SessionStructure.$Shape
	}
	namespace SessionStructure {
		interface $Properties {
			sessionVersion?: (number|null)
			localIdentityPublic?: (Uint8Array|null)
			remoteIdentityPublic?: (Uint8Array|null)
			rootKey?: (Uint8Array|null)
			previousCounter?: (number|null)
			senderChain?: (waproto.SessionStructure.Chain.$Properties|null)
			receiverChains?: (waproto.SessionStructure.Chain.$Properties[]|null)
			pendingKeyExchange?: (waproto.SessionStructure.PendingKeyExchange.$Properties|null)
			pendingPreKey?: (waproto.SessionStructure.PendingPreKey.$Properties|null)
			remoteRegistrationId?: (number|null)
			localRegistrationId?: (number|null)
			needsRefresh?: (boolean|null)
			aliceBaseKey?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SessionStructure.$Properties
		interface IPendingPreKey extends waproto.SessionStructure.PendingPreKey.$Properties {
		}
		class PendingPreKey {
			constructor(p?: waproto.SessionStructure.PendingPreKey.$Properties)
			$unknowns?: Uint8Array[]
			preKeyId?: (number|null)
			baseKey?: (Uint8Array|null)
			signedPreKeyId?: (number|null)
			kyberPreKeyId?: (number|null)
			kyberCiphertext?: (Uint8Array|null)
			static encode(m: waproto.SessionStructure.PendingPreKey.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionStructure.PendingPreKey & waproto.SessionStructure.PendingPreKey.$Shape
		}
		namespace PendingPreKey {
			interface $Properties {
				preKeyId?: (number|null)
				baseKey?: (Uint8Array|null)
				signedPreKeyId?: (number|null)
				kyberPreKeyId?: (number|null)
				kyberCiphertext?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SessionStructure.PendingPreKey.$Properties
		}
		interface IPendingKeyExchange extends waproto.SessionStructure.PendingKeyExchange.$Properties {
		}
		class PendingKeyExchange {
			constructor(p?: waproto.SessionStructure.PendingKeyExchange.$Properties)
			$unknowns?: Uint8Array[]
			sequence?: (number|null)
			localBaseKey?: (Uint8Array|null)
			localBaseKeyPrivate?: (Uint8Array|null)
			localRatchetKey?: (Uint8Array|null)
			localRatchetKeyPrivate?: (Uint8Array|null)
			localIdentityKey?: (Uint8Array|null)
			localIdentityKeyPrivate?: (Uint8Array|null)
			static encode(m: waproto.SessionStructure.PendingKeyExchange.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionStructure.PendingKeyExchange & waproto.SessionStructure.PendingKeyExchange.$Shape
		}
		namespace PendingKeyExchange {
			interface $Properties {
				sequence?: (number|null)
				localBaseKey?: (Uint8Array|null)
				localBaseKeyPrivate?: (Uint8Array|null)
				localRatchetKey?: (Uint8Array|null)
				localRatchetKeyPrivate?: (Uint8Array|null)
				localIdentityKey?: (Uint8Array|null)
				localIdentityKeyPrivate?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SessionStructure.PendingKeyExchange.$Properties
		}
		interface IChain extends waproto.SessionStructure.Chain.$Properties {
		}
		class Chain {
			constructor(p?: waproto.SessionStructure.Chain.$Properties)
			$unknowns?: Uint8Array[]
			senderRatchetKey?: (Uint8Array|null)
			senderRatchetKeyPrivate?: (Uint8Array|null)
			chainKey?: (waproto.SessionStructure.Chain.ChainKey.$Properties|null)
			messageKeys: waproto.SessionStructure.Chain.MessageKey.$Properties[]
			static encode(m: waproto.SessionStructure.Chain.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionStructure.Chain & waproto.SessionStructure.Chain.$Shape
		}
		namespace Chain {
			interface $Properties {
				senderRatchetKey?: (Uint8Array|null)
				senderRatchetKeyPrivate?: (Uint8Array|null)
				chainKey?: (waproto.SessionStructure.Chain.ChainKey.$Properties|null)
				messageKeys?: (waproto.SessionStructure.Chain.MessageKey.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SessionStructure.Chain.$Properties
			interface IMessageKey extends waproto.SessionStructure.Chain.MessageKey.$Properties {
			}
			class MessageKey {
				constructor(p?: waproto.SessionStructure.Chain.MessageKey.$Properties)
				$unknowns?: Uint8Array[]
				index?: (number|null)
				cipherKey?: (Uint8Array|null)
				macKey?: (Uint8Array|null)
				iv?: (Uint8Array|null)
				static encode(m: waproto.SessionStructure.Chain.MessageKey.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionStructure.Chain.MessageKey & waproto.SessionStructure.Chain.MessageKey.$Shape
			}
			namespace MessageKey {
				interface $Properties {
					index?: (number|null)
					cipherKey?: (Uint8Array|null)
					macKey?: (Uint8Array|null)
					iv?: (Uint8Array|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.SessionStructure.Chain.MessageKey.$Properties
			}
			interface IChainKey extends waproto.SessionStructure.Chain.ChainKey.$Properties {
			}
			class ChainKey {
				constructor(p?: waproto.SessionStructure.Chain.ChainKey.$Properties)
				$unknowns?: Uint8Array[]
				index?: (number|null)
				key?: (Uint8Array|null)
				static encode(m: waproto.SessionStructure.Chain.ChainKey.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionStructure.Chain.ChainKey & waproto.SessionStructure.Chain.ChainKey.$Shape
			}
			namespace ChainKey {
				interface $Properties {
					index?: (number|null)
					key?: (Uint8Array|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.SessionStructure.Chain.ChainKey.$Properties
			}
		}
	}
	interface ISessionTransparencyMetadata extends waproto.SessionTransparencyMetadata.$Properties {
	}
	class SessionTransparencyMetadata {
		constructor(p?: waproto.SessionTransparencyMetadata.$Properties)
		$unknowns?: Uint8Array[]
		disclaimerText?: (string|null)
		hcaId?: (string|null)
		sessionTransparencyType?: (waproto.SessionTransparencyType|null)
		static encode(m: waproto.SessionTransparencyMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionTransparencyMetadata & waproto.SessionTransparencyMetadata.$Shape
	}
	namespace SessionTransparencyMetadata {
		interface $Properties {
			disclaimerText?: (string|null)
			hcaId?: (string|null)
			sessionTransparencyType?: (waproto.SessionTransparencyType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SessionTransparencyMetadata.$Properties
	}
	interface ISignalMessage extends waproto.SignalMessage.$Properties {
	}
	class SignalMessage {
		constructor(p?: waproto.SignalMessage.$Properties)
		$unknowns?: Uint8Array[]
		ratchetKey?: (Uint8Array|null)
		counter?: (number|null)
		previousCounter?: (number|null)
		ciphertext?: (Uint8Array|null)
		static encode(m: waproto.SignalMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SignalMessage & waproto.SignalMessage.$Shape
	}
	namespace SignalMessage {
		interface $Properties {
			ratchetKey?: (Uint8Array|null)
			counter?: (number|null)
			previousCounter?: (number|null)
			ciphertext?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SignalMessage.$Properties
	}
	interface ISignedPreKeyRecordStructure extends waproto.SignedPreKeyRecordStructure.$Properties {
	}
	class SignedPreKeyRecordStructure {
		constructor(p?: waproto.SignedPreKeyRecordStructure.$Properties)
		$unknowns?: Uint8Array[]
		id?: (number|null)
		publicKey?: (Uint8Array|null)
		privateKey?: (Uint8Array|null)
		signature?: (Uint8Array|null)
		timestamp?: (number|Long|null)
		static encode(m: waproto.SignedPreKeyRecordStructure.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SignedPreKeyRecordStructure & waproto.SignedPreKeyRecordStructure.$Shape
	}
	namespace SignedPreKeyRecordStructure {
		interface $Properties {
			id?: (number|null)
			publicKey?: (Uint8Array|null)
			privateKey?: (Uint8Array|null)
			signature?: (Uint8Array|null)
			timestamp?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SignedPreKeyRecordStructure.$Properties
	}
	interface IStatusAttribution extends waproto.StatusAttribution.$Properties {
	}
	class StatusAttribution {
		constructor(p?: waproto.StatusAttribution.$Properties)
		$unknowns?: Uint8Array[]
		type?: (waproto.StatusAttribution.Type|null)
		actionUrl?: (string|null)
		statusReshare?: (waproto.StatusAttribution.StatusReshare.$Properties|null)
		externalShare?: (waproto.StatusAttribution.ExternalShare.$Properties|null)
		music?: (waproto.StatusAttribution.Music.$Properties|null)
		groupStatus?: (waproto.StatusAttribution.GroupStatus.$Properties|null)
		rlAttribution?: (waproto.StatusAttribution.RLAttribution.$Properties|null)
		aiCreatedAttribution?: (waproto.StatusAttribution.AiCreatedAttribution.$Properties|null)
		static encode(m: waproto.StatusAttribution.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution & waproto.StatusAttribution.$Shape
	}
	namespace StatusAttribution {
		interface $Properties {
			type?: (waproto.StatusAttribution.Type|null)
			actionUrl?: (string|null)
			statusReshare?: (waproto.StatusAttribution.StatusReshare.$Properties|null)
			externalShare?: (waproto.StatusAttribution.ExternalShare.$Properties|null)
			music?: (waproto.StatusAttribution.Music.$Properties|null)
			groupStatus?: (waproto.StatusAttribution.GroupStatus.$Properties|null)
			rlAttribution?: (waproto.StatusAttribution.RLAttribution.$Properties|null)
			aiCreatedAttribution?: (waproto.StatusAttribution.AiCreatedAttribution.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.StatusAttribution.$Properties
		enum Type {
			UNKNOWN = 0,
			RESHARE = 1,
			EXTERNAL_SHARE = 2,
			MUSIC = 3,
			STATUS_MENTION = 4,
			GROUP_STATUS = 5,
			RL_ATTRIBUTION = 6,
			AI_CREATED = 7,
			LAYOUTS = 8,
			NEWSLETTER_STATUS = 9,
			STATUS_CLOSE_SHARING = 10,
			PAID_PARTNERSHIP = 11
		}
		interface IAiCreatedAttribution extends waproto.StatusAttribution.AiCreatedAttribution.$Properties {
		}
		class AiCreatedAttribution {
			constructor(p?: waproto.StatusAttribution.AiCreatedAttribution.$Properties)
			$unknowns?: Uint8Array[]
			source?: (waproto.StatusAttribution.AiCreatedAttribution.Source|null)
			static encode(m: waproto.StatusAttribution.AiCreatedAttribution.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.AiCreatedAttribution & waproto.StatusAttribution.AiCreatedAttribution.$Shape
		}
		namespace AiCreatedAttribution {
			interface $Properties {
				source?: (waproto.StatusAttribution.AiCreatedAttribution.Source|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.StatusAttribution.AiCreatedAttribution.$Properties
			enum Source {
				UNKNOWN = 0,
				STATUS_MIMICRY = 1
			}
		}
		interface IRLAttribution extends waproto.StatusAttribution.RLAttribution.$Properties {
		}
		class RLAttribution {
			constructor(p?: waproto.StatusAttribution.RLAttribution.$Properties)
			$unknowns?: Uint8Array[]
			source?: (waproto.StatusAttribution.RLAttribution.Source|null)
			static encode(m: waproto.StatusAttribution.RLAttribution.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.RLAttribution & waproto.StatusAttribution.RLAttribution.$Shape
		}
		namespace RLAttribution {
			interface $Properties {
				source?: (waproto.StatusAttribution.RLAttribution.Source|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.StatusAttribution.RLAttribution.$Properties
			enum Source {
				UNKNOWN = 0,
				RAY_BAN_META_GLASSES = 1,
				OAKLEY_META_GLASSES = 2,
				HYPERNOVA_GLASSES = 3
			}
		}
		interface IGroupStatus extends waproto.StatusAttribution.GroupStatus.$Properties {
		}
		class GroupStatus {
			constructor(p?: waproto.StatusAttribution.GroupStatus.$Properties)
			$unknowns?: Uint8Array[]
			authorJid?: (string|null)
			static encode(m: waproto.StatusAttribution.GroupStatus.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.GroupStatus & waproto.StatusAttribution.GroupStatus.$Shape
		}
		namespace GroupStatus {
			interface $Properties {
				authorJid?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.StatusAttribution.GroupStatus.$Properties
		}
		interface IMusic extends waproto.StatusAttribution.Music.$Properties {
		}
		class Music {
			constructor(p?: waproto.StatusAttribution.Music.$Properties)
			$unknowns?: Uint8Array[]
			authorName?: (string|null)
			songId?: (string|null)
			title?: (string|null)
			author?: (string|null)
			artistAttribution?: (string|null)
			isExplicit?: (boolean|null)
			static encode(m: waproto.StatusAttribution.Music.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.Music & waproto.StatusAttribution.Music.$Shape
		}
		namespace Music {
			interface $Properties {
				authorName?: (string|null)
				songId?: (string|null)
				title?: (string|null)
				author?: (string|null)
				artistAttribution?: (string|null)
				isExplicit?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.StatusAttribution.Music.$Properties
		}
		interface IExternalShare extends waproto.StatusAttribution.ExternalShare.$Properties {
		}
		class ExternalShare {
			constructor(p?: waproto.StatusAttribution.ExternalShare.$Properties)
			$unknowns?: Uint8Array[]
			actionUrl?: (string|null)
			source?: (waproto.StatusAttribution.ExternalShare.Source|null)
			duration?: (number|null)
			actionFallbackUrl?: (string|null)
			static encode(m: waproto.StatusAttribution.ExternalShare.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.ExternalShare & waproto.StatusAttribution.ExternalShare.$Shape
		}
		namespace ExternalShare {
			interface $Properties {
				actionUrl?: (string|null)
				source?: (waproto.StatusAttribution.ExternalShare.Source|null)
				duration?: (number|null)
				actionFallbackUrl?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.StatusAttribution.ExternalShare.$Properties
			enum Source {
				UNKNOWN = 0,
				INSTAGRAM = 1,
				FACEBOOK = 2,
				MESSENGER = 3,
				SPOTIFY = 4,
				YOUTUBE = 5,
				PINTEREST = 6,
				THREADS = 7,
				APPLE_MUSIC = 8,
				SHARECHAT = 9,
				GOOGLE_PHOTOS = 10,
				SOUNDCLOUD = 11,
				SHAZAM = 12,
				PICSART = 13
			}
		}
		interface IStatusReshare extends waproto.StatusAttribution.StatusReshare.$Properties {
		}
		class StatusReshare {
			constructor(p?: waproto.StatusAttribution.StatusReshare.$Properties)
			$unknowns?: Uint8Array[]
			source?: (waproto.StatusAttribution.StatusReshare.Source|null)
			metadata?: (waproto.StatusAttribution.StatusReshare.Metadata.$Properties|null)
			static encode(m: waproto.StatusAttribution.StatusReshare.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.StatusReshare & waproto.StatusAttribution.StatusReshare.$Shape
		}
		namespace StatusReshare {
			interface $Properties {
				source?: (waproto.StatusAttribution.StatusReshare.Source|null)
				metadata?: (waproto.StatusAttribution.StatusReshare.Metadata.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.StatusAttribution.StatusReshare.$Properties
			enum Source {
				UNKNOWN = 0,
				INTERNAL_RESHARE = 1,
				MENTION_RESHARE = 2,
				CHANNEL_RESHARE = 3,
				FORWARD = 4
			}
			interface IMetadata extends waproto.StatusAttribution.StatusReshare.Metadata.$Properties {
			}
			class Metadata {
				constructor(p?: waproto.StatusAttribution.StatusReshare.Metadata.$Properties)
				$unknowns?: Uint8Array[]
				duration?: (number|null)
				channelJid?: (string|null)
				channelMessageId?: (number|null)
				hasMultipleReshares?: (boolean|null)
				static encode(m: waproto.StatusAttribution.StatusReshare.Metadata.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.StatusReshare.Metadata & waproto.StatusAttribution.StatusReshare.Metadata.$Shape
			}
			namespace Metadata {
				interface $Properties {
					duration?: (number|null)
					channelJid?: (string|null)
					channelMessageId?: (number|null)
					hasMultipleReshares?: (boolean|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.StatusAttribution.StatusReshare.Metadata.$Properties
			}
		}
	}
	interface IStatusMentionMessage extends waproto.StatusMentionMessage.$Properties {
	}
	class StatusMentionMessage {
		constructor(p?: waproto.StatusMentionMessage.$Properties)
		$unknowns?: Uint8Array[]
		quotedStatus?: (waproto.Message.$Properties|null)
		static encode(m: waproto.StatusMentionMessage.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusMentionMessage & waproto.StatusMentionMessage.$Shape
	}
	namespace StatusMentionMessage {
		interface $Properties {
			quotedStatus?: (waproto.Message.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.StatusMentionMessage.$Properties
	}
	interface IStatusPSA extends waproto.StatusPSA.$Properties {
	}
	class StatusPSA {
		constructor(p?: waproto.StatusPSA.$Properties)
		$unknowns?: Uint8Array[]
		campaignId?: (number|Long|null)
		campaignExpirationTimestamp?: (number|Long|null)
		static encode(m: waproto.StatusPSA.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusPSA & waproto.StatusPSA.$Shape
	}
	namespace StatusPSA {
		interface $Properties {
			campaignId?: (number|Long|null)
			campaignExpirationTimestamp?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.StatusPSA.$Properties
	}
	interface IStickerMetadata extends waproto.StickerMetadata.$Properties {
	}
	class StickerMetadata {
		constructor(p?: waproto.StickerMetadata.$Properties)
		$unknowns?: Uint8Array[]
		url?: (string|null)
		fileSha256?: (Uint8Array|null)
		fileEncSha256?: (Uint8Array|null)
		mediaKey?: (Uint8Array|null)
		mimetype?: (string|null)
		height?: (number|null)
		width?: (number|null)
		directPath?: (string|null)
		fileLength?: (number|Long|null)
		weight?: (number|null)
		lastStickerSentTs?: (number|Long|null)
		isLottie?: (boolean|null)
		imageHash?: (string|null)
		isAvatarSticker?: (boolean|null)
		static encode(m: waproto.StickerMetadata.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.StickerMetadata & waproto.StickerMetadata.$Shape
	}
	namespace StickerMetadata {
		interface $Properties {
			url?: (string|null)
			fileSha256?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			mediaKey?: (Uint8Array|null)
			mimetype?: (string|null)
			height?: (number|null)
			width?: (number|null)
			directPath?: (string|null)
			fileLength?: (number|Long|null)
			weight?: (number|null)
			lastStickerSentTs?: (number|Long|null)
			isLottie?: (boolean|null)
			imageHash?: (string|null)
			isAvatarSticker?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.StickerMetadata.$Properties
	}
	interface ISubProtocol extends waproto.SubProtocol.$Properties {
	}
	class SubProtocol {
		constructor(p?: waproto.SubProtocol.$Properties)
		$unknowns?: Uint8Array[]
		payload?: (Uint8Array|null)
		version?: (number|null)
		static encode(m: waproto.SubProtocol.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SubProtocol & waproto.SubProtocol.$Shape
	}
	namespace SubProtocol {
		interface $Properties {
			payload?: (Uint8Array|null)
			version?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SubProtocol.$Properties
	}
	interface ISyncActionData extends waproto.SyncActionData.$Properties {
	}
	class SyncActionData {
		constructor(p?: waproto.SyncActionData.$Properties)
		$unknowns?: Uint8Array[]
		index?: (Uint8Array|null)
		value?: (waproto.SyncActionValue.$Properties|null)
		padding?: (Uint8Array|null)
		version?: (number|null)
		static encode(m: waproto.SyncActionData.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionData & waproto.SyncActionData.$Shape
	}
	namespace SyncActionData {
		interface $Properties {
			index?: (Uint8Array|null)
			value?: (waproto.SyncActionValue.$Properties|null)
			padding?: (Uint8Array|null)
			version?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SyncActionData.$Properties
	}
	interface ISyncActionValue extends waproto.SyncActionValue.$Properties {
	}
	class SyncActionValue {
		constructor(p?: waproto.SyncActionValue.$Properties)
		$unknowns?: Uint8Array[]
		timestamp?: (number|Long|null)
		starAction?: (waproto.SyncActionValue.StarAction.$Properties|null)
		contactAction?: (waproto.SyncActionValue.ContactAction.$Properties|null)
		muteAction?: (waproto.SyncActionValue.MuteAction.$Properties|null)
		pinAction?: (waproto.SyncActionValue.PinAction.$Properties|null)
		pushNameSetting?: (waproto.SyncActionValue.PushNameSetting.$Properties|null)
		quickReplyAction?: (waproto.SyncActionValue.QuickReplyAction.$Properties|null)
		recentEmojiWeightsAction?: (waproto.SyncActionValue.RecentEmojiWeightsAction.$Properties|null)
		labelEditAction?: (waproto.SyncActionValue.LabelEditAction.$Properties|null)
		labelAssociationAction?: (waproto.SyncActionValue.LabelAssociationAction.$Properties|null)
		localeSetting?: (waproto.SyncActionValue.LocaleSetting.$Properties|null)
		archiveChatAction?: (waproto.SyncActionValue.ArchiveChatAction.$Properties|null)
		deleteMessageForMeAction?: (waproto.SyncActionValue.DeleteMessageForMeAction.$Properties|null)
		keyExpiration?: (waproto.SyncActionValue.KeyExpiration.$Properties|null)
		markChatAsReadAction?: (waproto.SyncActionValue.MarkChatAsReadAction.$Properties|null)
		clearChatAction?: (waproto.SyncActionValue.ClearChatAction.$Properties|null)
		deleteChatAction?: (waproto.SyncActionValue.DeleteChatAction.$Properties|null)
		unarchiveChatsSetting?: (waproto.SyncActionValue.UnarchiveChatsSetting.$Properties|null)
		primaryFeature?: (waproto.SyncActionValue.PrimaryFeature.$Properties|null)
		androidUnsupportedActions?: (waproto.SyncActionValue.AndroidUnsupportedActions.$Properties|null)
		agentAction?: (waproto.SyncActionValue.AgentAction.$Properties|null)
		subscriptionAction?: (waproto.SyncActionValue.SubscriptionAction.$Properties|null)
		userStatusMuteAction?: (waproto.SyncActionValue.UserStatusMuteAction.$Properties|null)
		timeFormatAction?: (waproto.SyncActionValue.TimeFormatAction.$Properties|null)
		nuxAction?: (waproto.SyncActionValue.NuxAction.$Properties|null)
		primaryVersionAction?: (waproto.SyncActionValue.PrimaryVersionAction.$Properties|null)
		stickerAction?: (waproto.SyncActionValue.StickerAction.$Properties|null)
		removeRecentStickerAction?: (waproto.SyncActionValue.RemoveRecentStickerAction.$Properties|null)
		chatAssignment?: (waproto.SyncActionValue.ChatAssignmentAction.$Properties|null)
		chatAssignmentOpenedStatus?: (waproto.SyncActionValue.ChatAssignmentOpenedStatusAction.$Properties|null)
		pnForLidChatAction?: (waproto.SyncActionValue.PnForLidChatAction.$Properties|null)
		marketingMessageAction?: (waproto.SyncActionValue.MarketingMessageAction.$Properties|null)
		marketingMessageBroadcastAction?: (waproto.SyncActionValue.MarketingMessageBroadcastAction.$Properties|null)
		externalWebBetaAction?: (waproto.SyncActionValue.ExternalWebBetaAction.$Properties|null)
		privacySettingRelayAllCalls?: (waproto.SyncActionValue.PrivacySettingRelayAllCalls.$Properties|null)
		callLogAction?: (waproto.SyncActionValue.CallLogAction.$Properties|null)
		ugcBot?: (waproto.SyncActionValue.UGCBot.$Properties|null)
		statusPrivacy?: (waproto.SyncActionValue.StatusPrivacyAction.$Properties|null)
		botWelcomeRequestAction?: (waproto.SyncActionValue.BotWelcomeRequestAction.$Properties|null)
		deleteIndividualCallLog?: (waproto.SyncActionValue.DeleteIndividualCallLogAction.$Properties|null)
		labelReorderingAction?: (waproto.SyncActionValue.LabelReorderingAction.$Properties|null)
		paymentInfoAction?: (waproto.SyncActionValue.PaymentInfoAction.$Properties|null)
		customPaymentMethodsAction?: (waproto.SyncActionValue.CustomPaymentMethodsAction.$Properties|null)
		lockChatAction?: (waproto.SyncActionValue.LockChatAction.$Properties|null)
		chatLockSettings?: (waproto.ChatLockSettings.$Properties|null)
		wamoUserIdentifierAction?: (waproto.SyncActionValue.WamoUserIdentifierAction.$Properties|null)
		privacySettingDisableLinkPreviewsAction?: (waproto.SyncActionValue.PrivacySettingDisableLinkPreviewsAction.$Properties|null)
		deviceCapabilities?: (waproto.DeviceCapabilities.$Properties|null)
		noteEditAction?: (waproto.SyncActionValue.NoteEditAction.$Properties|null)
		favoritesAction?: (waproto.SyncActionValue.FavoritesAction.$Properties|null)
		merchantPaymentPartnerAction?: (waproto.SyncActionValue.MerchantPaymentPartnerAction.$Properties|null)
		waffleAccountLinkStateAction?: (waproto.SyncActionValue.WaffleAccountLinkStateAction.$Properties|null)
		usernameChatStartMode?: (waproto.SyncActionValue.UsernameChatStartModeAction.$Properties|null)
		notificationActivitySettingAction?: (waproto.SyncActionValue.NotificationActivitySettingAction.$Properties|null)
		lidContactAction?: (waproto.SyncActionValue.LidContactAction.$Properties|null)
		ctwaPerCustomerDataSharingAction?: (waproto.SyncActionValue.CtwaPerCustomerDataSharingAction.$Properties|null)
		paymentTosAction?: (waproto.SyncActionValue.PaymentTosAction.$Properties|null)
		privacySettingChannelsPersonalisedRecommendationAction?: (waproto.SyncActionValue.PrivacySettingChannelsPersonalisedRecommendationAction.$Properties|null)
		detectedOutcomesStatusAction?: (waproto.SyncActionValue.DetectedOutcomesStatusAction.$Properties|null)
		maibaAiFeaturesControlAction?: (waproto.SyncActionValue.MaibaAIFeaturesControlAction.$Properties|null)
		businessBroadcastListAction?: (waproto.SyncActionValue.BusinessBroadcastListAction.$Properties|null)
		musicUserIdAction?: (waproto.SyncActionValue.MusicUserIdAction.$Properties|null)
		statusPostOptInNotificationPreferencesAction?: (waproto.SyncActionValue.StatusPostOptInNotificationPreferencesAction.$Properties|null)
		avatarUpdatedAction?: (waproto.SyncActionValue.AvatarUpdatedAction.$Properties|null)
		privateProcessingSettingAction?: (waproto.SyncActionValue.PrivateProcessingSettingAction.$Properties|null)
		newsletterSavedInterestsAction?: (waproto.SyncActionValue.NewsletterSavedInterestsAction.$Properties|null)
		aiThreadRenameAction?: (waproto.SyncActionValue.AiThreadRenameAction.$Properties|null)
		interactiveMessageAction?: (waproto.SyncActionValue.InteractiveMessageAction.$Properties|null)
		settingsSyncAction?: (waproto.SyncActionValue.SettingsSyncAction.$Properties|null)
		outContactAction?: (waproto.SyncActionValue.OutContactAction.$Properties|null)
		nctSaltSyncAction?: (waproto.SyncActionValue.NctSaltSyncAction.$Properties|null)
		businessBroadcastCampaignAction?: (waproto.SyncActionValue.BusinessBroadcastCampaignAction.$Properties|null)
		businessBroadcastInsightsAction?: (waproto.SyncActionValue.BusinessBroadcastInsightsAction.$Properties|null)
		customerDataAction?: (waproto.SyncActionValue.CustomerDataAction.$Properties|null)
		subscriptionsSyncV2Action?: (waproto.SyncActionValue.SubscriptionsSyncV2Action.$Properties|null)
		threadPinAction?: (waproto.SyncActionValue.ThreadPinAction.$Properties|null)
		autoOrganizeBusinessChatSetting?: (waproto.SyncActionValue.AutoOrganizeBusinessChatSetting.$Properties|null)
		bizAiSettingsNudgeAction?: (waproto.SyncActionValue.BizAISettingsNudgeAction.$Properties|null)
		coexV2VersionAction?: (waproto.SyncActionValue.CoexV2VersionAction.$Properties|null)
		wasaRootSecretAction?: (waproto.SyncActionValue.WASARootSecretAction.$Properties|null)
		bubbleLockMessageAction?: (waproto.SyncActionValue.BubbleLockMessageAction.$Properties|null)
		static encode(m: waproto.SyncActionValue.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue & waproto.SyncActionValue.$Shape
	}
	namespace SyncActionValue {
		interface $Properties {
			timestamp?: (number|Long|null)
			starAction?: (waproto.SyncActionValue.StarAction.$Properties|null)
			contactAction?: (waproto.SyncActionValue.ContactAction.$Properties|null)
			muteAction?: (waproto.SyncActionValue.MuteAction.$Properties|null)
			pinAction?: (waproto.SyncActionValue.PinAction.$Properties|null)
			pushNameSetting?: (waproto.SyncActionValue.PushNameSetting.$Properties|null)
			quickReplyAction?: (waproto.SyncActionValue.QuickReplyAction.$Properties|null)
			recentEmojiWeightsAction?: (waproto.SyncActionValue.RecentEmojiWeightsAction.$Properties|null)
			labelEditAction?: (waproto.SyncActionValue.LabelEditAction.$Properties|null)
			labelAssociationAction?: (waproto.SyncActionValue.LabelAssociationAction.$Properties|null)
			localeSetting?: (waproto.SyncActionValue.LocaleSetting.$Properties|null)
			archiveChatAction?: (waproto.SyncActionValue.ArchiveChatAction.$Properties|null)
			deleteMessageForMeAction?: (waproto.SyncActionValue.DeleteMessageForMeAction.$Properties|null)
			keyExpiration?: (waproto.SyncActionValue.KeyExpiration.$Properties|null)
			markChatAsReadAction?: (waproto.SyncActionValue.MarkChatAsReadAction.$Properties|null)
			clearChatAction?: (waproto.SyncActionValue.ClearChatAction.$Properties|null)
			deleteChatAction?: (waproto.SyncActionValue.DeleteChatAction.$Properties|null)
			unarchiveChatsSetting?: (waproto.SyncActionValue.UnarchiveChatsSetting.$Properties|null)
			primaryFeature?: (waproto.SyncActionValue.PrimaryFeature.$Properties|null)
			androidUnsupportedActions?: (waproto.SyncActionValue.AndroidUnsupportedActions.$Properties|null)
			agentAction?: (waproto.SyncActionValue.AgentAction.$Properties|null)
			subscriptionAction?: (waproto.SyncActionValue.SubscriptionAction.$Properties|null)
			userStatusMuteAction?: (waproto.SyncActionValue.UserStatusMuteAction.$Properties|null)
			timeFormatAction?: (waproto.SyncActionValue.TimeFormatAction.$Properties|null)
			nuxAction?: (waproto.SyncActionValue.NuxAction.$Properties|null)
			primaryVersionAction?: (waproto.SyncActionValue.PrimaryVersionAction.$Properties|null)
			stickerAction?: (waproto.SyncActionValue.StickerAction.$Properties|null)
			removeRecentStickerAction?: (waproto.SyncActionValue.RemoveRecentStickerAction.$Properties|null)
			chatAssignment?: (waproto.SyncActionValue.ChatAssignmentAction.$Properties|null)
			chatAssignmentOpenedStatus?: (waproto.SyncActionValue.ChatAssignmentOpenedStatusAction.$Properties|null)
			pnForLidChatAction?: (waproto.SyncActionValue.PnForLidChatAction.$Properties|null)
			marketingMessageAction?: (waproto.SyncActionValue.MarketingMessageAction.$Properties|null)
			marketingMessageBroadcastAction?: (waproto.SyncActionValue.MarketingMessageBroadcastAction.$Properties|null)
			externalWebBetaAction?: (waproto.SyncActionValue.ExternalWebBetaAction.$Properties|null)
			privacySettingRelayAllCalls?: (waproto.SyncActionValue.PrivacySettingRelayAllCalls.$Properties|null)
			callLogAction?: (waproto.SyncActionValue.CallLogAction.$Properties|null)
			ugcBot?: (waproto.SyncActionValue.UGCBot.$Properties|null)
			statusPrivacy?: (waproto.SyncActionValue.StatusPrivacyAction.$Properties|null)
			botWelcomeRequestAction?: (waproto.SyncActionValue.BotWelcomeRequestAction.$Properties|null)
			deleteIndividualCallLog?: (waproto.SyncActionValue.DeleteIndividualCallLogAction.$Properties|null)
			labelReorderingAction?: (waproto.SyncActionValue.LabelReorderingAction.$Properties|null)
			paymentInfoAction?: (waproto.SyncActionValue.PaymentInfoAction.$Properties|null)
			customPaymentMethodsAction?: (waproto.SyncActionValue.CustomPaymentMethodsAction.$Properties|null)
			lockChatAction?: (waproto.SyncActionValue.LockChatAction.$Properties|null)
			chatLockSettings?: (waproto.ChatLockSettings.$Properties|null)
			wamoUserIdentifierAction?: (waproto.SyncActionValue.WamoUserIdentifierAction.$Properties|null)
			privacySettingDisableLinkPreviewsAction?: (waproto.SyncActionValue.PrivacySettingDisableLinkPreviewsAction.$Properties|null)
			deviceCapabilities?: (waproto.DeviceCapabilities.$Properties|null)
			noteEditAction?: (waproto.SyncActionValue.NoteEditAction.$Properties|null)
			favoritesAction?: (waproto.SyncActionValue.FavoritesAction.$Properties|null)
			merchantPaymentPartnerAction?: (waproto.SyncActionValue.MerchantPaymentPartnerAction.$Properties|null)
			waffleAccountLinkStateAction?: (waproto.SyncActionValue.WaffleAccountLinkStateAction.$Properties|null)
			usernameChatStartMode?: (waproto.SyncActionValue.UsernameChatStartModeAction.$Properties|null)
			notificationActivitySettingAction?: (waproto.SyncActionValue.NotificationActivitySettingAction.$Properties|null)
			lidContactAction?: (waproto.SyncActionValue.LidContactAction.$Properties|null)
			ctwaPerCustomerDataSharingAction?: (waproto.SyncActionValue.CtwaPerCustomerDataSharingAction.$Properties|null)
			paymentTosAction?: (waproto.SyncActionValue.PaymentTosAction.$Properties|null)
			privacySettingChannelsPersonalisedRecommendationAction?: (waproto.SyncActionValue.PrivacySettingChannelsPersonalisedRecommendationAction.$Properties|null)
			detectedOutcomesStatusAction?: (waproto.SyncActionValue.DetectedOutcomesStatusAction.$Properties|null)
			maibaAiFeaturesControlAction?: (waproto.SyncActionValue.MaibaAIFeaturesControlAction.$Properties|null)
			businessBroadcastListAction?: (waproto.SyncActionValue.BusinessBroadcastListAction.$Properties|null)
			musicUserIdAction?: (waproto.SyncActionValue.MusicUserIdAction.$Properties|null)
			statusPostOptInNotificationPreferencesAction?: (waproto.SyncActionValue.StatusPostOptInNotificationPreferencesAction.$Properties|null)
			avatarUpdatedAction?: (waproto.SyncActionValue.AvatarUpdatedAction.$Properties|null)
			privateProcessingSettingAction?: (waproto.SyncActionValue.PrivateProcessingSettingAction.$Properties|null)
			newsletterSavedInterestsAction?: (waproto.SyncActionValue.NewsletterSavedInterestsAction.$Properties|null)
			aiThreadRenameAction?: (waproto.SyncActionValue.AiThreadRenameAction.$Properties|null)
			interactiveMessageAction?: (waproto.SyncActionValue.InteractiveMessageAction.$Properties|null)
			settingsSyncAction?: (waproto.SyncActionValue.SettingsSyncAction.$Properties|null)
			outContactAction?: (waproto.SyncActionValue.OutContactAction.$Properties|null)
			nctSaltSyncAction?: (waproto.SyncActionValue.NctSaltSyncAction.$Properties|null)
			businessBroadcastCampaignAction?: (waproto.SyncActionValue.BusinessBroadcastCampaignAction.$Properties|null)
			businessBroadcastInsightsAction?: (waproto.SyncActionValue.BusinessBroadcastInsightsAction.$Properties|null)
			customerDataAction?: (waproto.SyncActionValue.CustomerDataAction.$Properties|null)
			subscriptionsSyncV2Action?: (waproto.SyncActionValue.SubscriptionsSyncV2Action.$Properties|null)
			threadPinAction?: (waproto.SyncActionValue.ThreadPinAction.$Properties|null)
			autoOrganizeBusinessChatSetting?: (waproto.SyncActionValue.AutoOrganizeBusinessChatSetting.$Properties|null)
			bizAiSettingsNudgeAction?: (waproto.SyncActionValue.BizAISettingsNudgeAction.$Properties|null)
			coexV2VersionAction?: (waproto.SyncActionValue.CoexV2VersionAction.$Properties|null)
			wasaRootSecretAction?: (waproto.SyncActionValue.WASARootSecretAction.$Properties|null)
			bubbleLockMessageAction?: (waproto.SyncActionValue.BubbleLockMessageAction.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SyncActionValue.$Properties
		enum BusinessBroadcastCampaignStatus {
			DRAFT = 1,
			SCHEDULED = 2,
			PROCESSING = 3,
			FAILED = 4,
			SENT = 5
		}
		interface IWASARootSecretAction extends waproto.SyncActionValue.WASARootSecretAction.$Properties {
		}
		class WASARootSecretAction {
			constructor(p?: waproto.SyncActionValue.WASARootSecretAction.$Properties)
			$unknowns?: Uint8Array[]
			secrets: waproto.SyncActionValue.WASARootSecretAction.RootSecretEntry.$Properties[]
			static encode(m: waproto.SyncActionValue.WASARootSecretAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.WASARootSecretAction & waproto.SyncActionValue.WASARootSecretAction.$Shape
		}
		namespace WASARootSecretAction {
			interface $Properties {
				secrets?: (waproto.SyncActionValue.WASARootSecretAction.RootSecretEntry.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.WASARootSecretAction.$Properties
			interface IRootSecretEntry extends waproto.SyncActionValue.WASARootSecretAction.RootSecretEntry.$Properties {
			}
			class RootSecretEntry {
				constructor(p?: waproto.SyncActionValue.WASARootSecretAction.RootSecretEntry.$Properties)
				$unknowns?: Uint8Array[]
				id?: (string|null)
				rootSecret?: (Uint8Array|null)
				epoch?: (number|Long|null)
				static encode(m: waproto.SyncActionValue.WASARootSecretAction.RootSecretEntry.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.WASARootSecretAction.RootSecretEntry & waproto.SyncActionValue.WASARootSecretAction.RootSecretEntry.$Shape
			}
			namespace RootSecretEntry {
				interface $Properties {
					id?: (string|null)
					rootSecret?: (Uint8Array|null)
					epoch?: (number|Long|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.SyncActionValue.WASARootSecretAction.RootSecretEntry.$Properties
			}
		}
		interface ICoexV2VersionAction extends waproto.SyncActionValue.CoexV2VersionAction.$Properties {
		}
		class CoexV2VersionAction {
			constructor(p?: waproto.SyncActionValue.CoexV2VersionAction.$Properties)
			$unknowns?: Uint8Array[]
			version?: (number|Long|null)
			static encode(m: waproto.SyncActionValue.CoexV2VersionAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CoexV2VersionAction & waproto.SyncActionValue.CoexV2VersionAction.$Shape
		}
		namespace CoexV2VersionAction {
			interface $Properties {
				version?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.CoexV2VersionAction.$Properties
		}
		interface ISubscriptionsSyncV2Action extends waproto.SyncActionValue.SubscriptionsSyncV2Action.$Properties {
		}
		class SubscriptionsSyncV2Action {
			constructor(p?: waproto.SyncActionValue.SubscriptionsSyncV2Action.$Properties)
			$unknowns?: Uint8Array[]
			subscriptions: waproto.SyncActionValue.SubscriptionsSyncV2Action.SubscriptionInfo.$Properties[]
			paidFeature: waproto.SyncActionValue.SubscriptionsSyncV2Action.PaidFeature.$Properties[]
			static encode(m: waproto.SyncActionValue.SubscriptionsSyncV2Action.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.SubscriptionsSyncV2Action & waproto.SyncActionValue.SubscriptionsSyncV2Action.$Shape
		}
		namespace SubscriptionsSyncV2Action {
			interface $Properties {
				subscriptions?: (waproto.SyncActionValue.SubscriptionsSyncV2Action.SubscriptionInfo.$Properties[]|null)
				paidFeature?: (waproto.SyncActionValue.SubscriptionsSyncV2Action.PaidFeature.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.SubscriptionsSyncV2Action.$Properties
			interface IPaidFeature extends waproto.SyncActionValue.SubscriptionsSyncV2Action.PaidFeature.$Properties {
			}
			class PaidFeature {
				constructor(p?: waproto.SyncActionValue.SubscriptionsSyncV2Action.PaidFeature.$Properties)
				$unknowns?: Uint8Array[]
				name?: (string|null)
				enabled?: (boolean|null)
				limit?: (number|null)
				expirationTime?: (number|Long|null)
				static encode(m: waproto.SyncActionValue.SubscriptionsSyncV2Action.PaidFeature.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.SubscriptionsSyncV2Action.PaidFeature & waproto.SyncActionValue.SubscriptionsSyncV2Action.PaidFeature.$Shape
			}
			namespace PaidFeature {
				interface $Properties {
					name?: (string|null)
					enabled?: (boolean|null)
					limit?: (number|null)
					expirationTime?: (number|Long|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.SyncActionValue.SubscriptionsSyncV2Action.PaidFeature.$Properties
			}
			interface ISubscriptionInfo extends waproto.SyncActionValue.SubscriptionsSyncV2Action.SubscriptionInfo.$Properties {
			}
			class SubscriptionInfo {
				constructor(p?: waproto.SyncActionValue.SubscriptionsSyncV2Action.SubscriptionInfo.$Properties)
				$unknowns?: Uint8Array[]
				id?: (string|null)
				tier?: (number|null)
				status?: (string|null)
				startTime?: (number|Long|null)
				endTime?: (number|Long|null)
				isPlatformChanged?: (boolean|null)
				source?: (string|null)
				creationTime?: (number|Long|null)
				static encode(m: waproto.SyncActionValue.SubscriptionsSyncV2Action.SubscriptionInfo.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.SubscriptionsSyncV2Action.SubscriptionInfo & waproto.SyncActionValue.SubscriptionsSyncV2Action.SubscriptionInfo.$Shape
			}
			namespace SubscriptionInfo {
				interface $Properties {
					id?: (string|null)
					tier?: (number|null)
					status?: (string|null)
					startTime?: (number|Long|null)
					endTime?: (number|Long|null)
					isPlatformChanged?: (boolean|null)
					source?: (string|null)
					creationTime?: (number|Long|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.SyncActionValue.SubscriptionsSyncV2Action.SubscriptionInfo.$Properties
			}
		}
		interface ICustomerDataAction extends waproto.SyncActionValue.CustomerDataAction.$Properties {
		}
		class CustomerDataAction {
			constructor(p?: waproto.SyncActionValue.CustomerDataAction.$Properties)
			$unknowns?: Uint8Array[]
			chatJid?: (string|null)
			contactType?: (number|null)
			email?: (string|null)
			altPhoneNumbers?: (string|null)
			birthday?: (number|Long|null)
			address?: (string|null)
			acquisitionSource?: (number|null)
			leadStage?: (number|null)
			lastOrder?: (number|Long|null)
			createdAt?: (number|Long|null)
			modifiedAt?: (number|Long|null)
			static encode(m: waproto.SyncActionValue.CustomerDataAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CustomerDataAction & waproto.SyncActionValue.CustomerDataAction.$Shape
		}
		namespace CustomerDataAction {
			interface $Properties {
				chatJid?: (string|null)
				contactType?: (number|null)
				email?: (string|null)
				altPhoneNumbers?: (string|null)
				birthday?: (number|Long|null)
				address?: (string|null)
				acquisitionSource?: (number|null)
				leadStage?: (number|null)
				lastOrder?: (number|Long|null)
				createdAt?: (number|Long|null)
				modifiedAt?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.CustomerDataAction.$Properties
		}
		interface IBusinessBroadcastInsightsAction extends waproto.SyncActionValue.BusinessBroadcastInsightsAction.$Properties {
		}
		class BusinessBroadcastInsightsAction {
			constructor(p?: waproto.SyncActionValue.BusinessBroadcastInsightsAction.$Properties)
			$unknowns?: Uint8Array[]
			recipientCount?: (number|null)
			deliveredCount?: (number|null)
			readCount?: (number|null)
			repliedCount?: (number|null)
			quickReplyCount?: (number|null)
			static encode(m: waproto.SyncActionValue.BusinessBroadcastInsightsAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BusinessBroadcastInsightsAction & waproto.SyncActionValue.BusinessBroadcastInsightsAction.$Shape
		}
		namespace BusinessBroadcastInsightsAction {
			interface $Properties {
				recipientCount?: (number|null)
				deliveredCount?: (number|null)
				readCount?: (number|null)
				repliedCount?: (number|null)
				quickReplyCount?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.BusinessBroadcastInsightsAction.$Properties
		}
		interface ISettingsSyncAction extends waproto.SyncActionValue.SettingsSyncAction.$Properties {
		}
		class SettingsSyncAction {
			constructor(p?: waproto.SyncActionValue.SettingsSyncAction.$Properties)
			$unknowns?: Uint8Array[]
			startAtLogin?: (boolean|null)
			minimizeToTray?: (boolean|null)
			language?: (string|null)
			replaceTextWithEmoji?: (boolean|null)
			bannerNotificationDisplayMode?: (waproto.SyncActionValue.SettingsSyncAction.DisplayMode|null)
			unreadCounterBadgeDisplayMode?: (waproto.SyncActionValue.SettingsSyncAction.DisplayMode|null)
			isMessagesNotificationEnabled?: (boolean|null)
			isCallsNotificationEnabled?: (boolean|null)
			isReactionsNotificationEnabled?: (boolean|null)
			isStatusReactionsNotificationEnabled?: (boolean|null)
			isTextPreviewForNotificationEnabled?: (boolean|null)
			defaultNotificationToneId?: (number|null)
			groupDefaultNotificationToneId?: (number|null)
			appTheme?: (number|null)
			wallpaperId?: (number|null)
			isDoodleWallpaperEnabled?: (boolean|null)
			fontSize?: (number|null)
			isPhotosAutodownloadEnabled?: (boolean|null)
			isAudiosAutodownloadEnabled?: (boolean|null)
			isVideosAutodownloadEnabled?: (boolean|null)
			isDocumentsAutodownloadEnabled?: (boolean|null)
			disableLinkPreviews?: (boolean|null)
			notificationToneId?: (number|null)
			mediaUploadQuality?: (waproto.SyncActionValue.SettingsSyncAction.MediaQualitySetting|null)
			isSpellCheckEnabled?: (boolean|null)
			isEnterToSendEnabled?: (boolean|null)
			isGroupMessageNotificationEnabled?: (boolean|null)
			isGroupReactionsNotificationEnabled?: (boolean|null)
			isStatusNotificationEnabled?: (boolean|null)
			statusNotificationToneId?: (number|null)
			shouldPlaySoundForCallNotification?: (boolean|null)
			chatThemeId?: (string|null)
			colorSchemeId?: (string|null)
			static encode(m: waproto.SyncActionValue.SettingsSyncAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.SettingsSyncAction & waproto.SyncActionValue.SettingsSyncAction.$Shape
		}
		namespace SettingsSyncAction {
			interface $Properties {
				startAtLogin?: (boolean|null)
				minimizeToTray?: (boolean|null)
				language?: (string|null)
				replaceTextWithEmoji?: (boolean|null)
				bannerNotificationDisplayMode?: (waproto.SyncActionValue.SettingsSyncAction.DisplayMode|null)
				unreadCounterBadgeDisplayMode?: (waproto.SyncActionValue.SettingsSyncAction.DisplayMode|null)
				isMessagesNotificationEnabled?: (boolean|null)
				isCallsNotificationEnabled?: (boolean|null)
				isReactionsNotificationEnabled?: (boolean|null)
				isStatusReactionsNotificationEnabled?: (boolean|null)
				isTextPreviewForNotificationEnabled?: (boolean|null)
				defaultNotificationToneId?: (number|null)
				groupDefaultNotificationToneId?: (number|null)
				appTheme?: (number|null)
				wallpaperId?: (number|null)
				isDoodleWallpaperEnabled?: (boolean|null)
				fontSize?: (number|null)
				isPhotosAutodownloadEnabled?: (boolean|null)
				isAudiosAutodownloadEnabled?: (boolean|null)
				isVideosAutodownloadEnabled?: (boolean|null)
				isDocumentsAutodownloadEnabled?: (boolean|null)
				disableLinkPreviews?: (boolean|null)
				notificationToneId?: (number|null)
				mediaUploadQuality?: (waproto.SyncActionValue.SettingsSyncAction.MediaQualitySetting|null)
				isSpellCheckEnabled?: (boolean|null)
				isEnterToSendEnabled?: (boolean|null)
				isGroupMessageNotificationEnabled?: (boolean|null)
				isGroupReactionsNotificationEnabled?: (boolean|null)
				isStatusNotificationEnabled?: (boolean|null)
				statusNotificationToneId?: (number|null)
				shouldPlaySoundForCallNotification?: (boolean|null)
				chatThemeId?: (string|null)
				colorSchemeId?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.SettingsSyncAction.$Properties
			enum MediaQualitySetting {
				MEDIA_QUALITY_UNKNOWN = 0,
				STANDARD = 1,
				HD = 2
			}
			enum DisplayMode {
				DISPLAY_MODE_UNKNOWN = 0,
				ALWAYS = 1,
				NEVER = 2,
				ONLY_WHEN_APP_IS_OPEN = 3
			}
			enum SettingKey {
				SETTING_KEY_UNKNOWN = 0,
				START_AT_LOGIN = 1,
				MINIMIZE_TO_TRAY = 2,
				LANGUAGE = 3,
				REPLACE_TEXT_WITH_EMOJI = 4,
				BANNER_NOTIFICATION_DISPLAY_MODE = 5,
				UNREAD_COUNTER_BADGE_DISPLAY_MODE = 6,
				IS_MESSAGES_NOTIFICATION_ENABLED = 7,
				IS_CALLS_NOTIFICATION_ENABLED = 8,
				IS_REACTIONS_NOTIFICATION_ENABLED = 9,
				IS_STATUS_REACTIONS_NOTIFICATION_ENABLED = 10,
				IS_TEXT_PREVIEW_FOR_NOTIFICATION_ENABLED = 11,
				DEFAULT_NOTIFICATION_TONE_ID = 12,
				GROUP_DEFAULT_NOTIFICATION_TONE_ID = 13,
				APP_THEME = 14,
				WALLPAPER_ID = 15,
				IS_DOODLE_WALLPAPER_ENABLED = 16,
				FONT_SIZE = 17,
				IS_PHOTOS_AUTODOWNLOAD_ENABLED = 18,
				IS_AUDIOS_AUTODOWNLOAD_ENABLED = 19,
				IS_VIDEOS_AUTODOWNLOAD_ENABLED = 20,
				IS_DOCUMENTS_AUTODOWNLOAD_ENABLED = 21,
				DISABLE_LINK_PREVIEWS = 22,
				NOTIFICATION_TONE_ID = 23,
				MEDIA_UPLOAD_QUALITY = 24,
				IS_SPELL_CHECK_ENABLED = 25,
				IS_ENTER_TO_SEND_ENABLED = 26,
				IS_GROUP_MESSAGE_NOTIFICATION_ENABLED = 27,
				IS_GROUP_REACTIONS_NOTIFICATION_ENABLED = 28,
				IS_STATUS_NOTIFICATION_ENABLED = 29,
				STATUS_NOTIFICATION_TONE_ID = 30,
				SHOULD_PLAY_SOUND_FOR_CALL_NOTIFICATION = 31,
				CHAT_THEME_ID = 32,
				COLOR_SCHEME_ID = 33
			}
			enum SettingPlatform {
				PLATFORM_UNKNOWN = 0,
				WEB = 1,
				HYBRID = 2,
				WINDOWS = 3,
				MAC = 4
			}
		}
		interface IAutoOrganizeBusinessChatSetting extends waproto.SyncActionValue.AutoOrganizeBusinessChatSetting.$Properties {
		}
		class AutoOrganizeBusinessChatSetting {
			constructor(p?: waproto.SyncActionValue.AutoOrganizeBusinessChatSetting.$Properties)
			$unknowns?: Uint8Array[]
			autoOrganize?: (boolean|null)
			static encode(m: waproto.SyncActionValue.AutoOrganizeBusinessChatSetting.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.AutoOrganizeBusinessChatSetting & waproto.SyncActionValue.AutoOrganizeBusinessChatSetting.$Shape
		}
		namespace AutoOrganizeBusinessChatSetting {
			interface $Properties {
				autoOrganize?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.AutoOrganizeBusinessChatSetting.$Properties
		}
		interface INctSaltSyncAction extends waproto.SyncActionValue.NctSaltSyncAction.$Properties {
		}
		class NctSaltSyncAction {
			constructor(p?: waproto.SyncActionValue.NctSaltSyncAction.$Properties)
			$unknowns?: Uint8Array[]
			salt?: (Uint8Array|null)
			static encode(m: waproto.SyncActionValue.NctSaltSyncAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.NctSaltSyncAction & waproto.SyncActionValue.NctSaltSyncAction.$Shape
		}
		namespace NctSaltSyncAction {
			interface $Properties {
				salt?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.NctSaltSyncAction.$Properties
		}
		interface IInteractiveMessageAction extends waproto.SyncActionValue.InteractiveMessageAction.$Properties {
		}
		class InteractiveMessageAction {
			constructor(p?: waproto.SyncActionValue.InteractiveMessageAction.$Properties)
			$unknowns?: Uint8Array[]
			type?: (waproto.SyncActionValue.InteractiveMessageAction.InteractiveMessageActionMode|null)
			agmId?: (string|null)
			static encode(m: waproto.SyncActionValue.InteractiveMessageAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.InteractiveMessageAction & waproto.SyncActionValue.InteractiveMessageAction.$Shape
		}
		namespace InteractiveMessageAction {
			interface $Properties {
				type?: (waproto.SyncActionValue.InteractiveMessageAction.InteractiveMessageActionMode|null)
				agmId?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.InteractiveMessageAction.$Properties
			enum InteractiveMessageActionMode {
				DISABLE_CTA = 1
			}
		}
		interface IThreadPinAction extends waproto.SyncActionValue.ThreadPinAction.$Properties {
		}
		class ThreadPinAction {
			constructor(p?: waproto.SyncActionValue.ThreadPinAction.$Properties)
			$unknowns?: Uint8Array[]
			pinned?: (boolean|null)
			static encode(m: waproto.SyncActionValue.ThreadPinAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ThreadPinAction & waproto.SyncActionValue.ThreadPinAction.$Shape
		}
		namespace ThreadPinAction {
			interface $Properties {
				pinned?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.ThreadPinAction.$Properties
		}
		interface IAiThreadRenameAction extends waproto.SyncActionValue.AiThreadRenameAction.$Properties {
		}
		class AiThreadRenameAction {
			constructor(p?: waproto.SyncActionValue.AiThreadRenameAction.$Properties)
			$unknowns?: Uint8Array[]
			newTitle?: (string|null)
			static encode(m: waproto.SyncActionValue.AiThreadRenameAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.AiThreadRenameAction & waproto.SyncActionValue.AiThreadRenameAction.$Shape
		}
		namespace AiThreadRenameAction {
			interface $Properties {
				newTitle?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.AiThreadRenameAction.$Properties
		}
		interface IPrivateProcessingSettingAction extends waproto.SyncActionValue.PrivateProcessingSettingAction.$Properties {
		}
		class PrivateProcessingSettingAction {
			constructor(p?: waproto.SyncActionValue.PrivateProcessingSettingAction.$Properties)
			$unknowns?: Uint8Array[]
			privateProcessingStatus?: (waproto.SyncActionValue.PrivateProcessingSettingAction.PrivateProcessingStatus|null)
			static encode(m: waproto.SyncActionValue.PrivateProcessingSettingAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PrivateProcessingSettingAction & waproto.SyncActionValue.PrivateProcessingSettingAction.$Shape
		}
		namespace PrivateProcessingSettingAction {
			interface $Properties {
				privateProcessingStatus?: (waproto.SyncActionValue.PrivateProcessingSettingAction.PrivateProcessingStatus|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.PrivateProcessingSettingAction.$Properties
			enum PrivateProcessingStatus {
				UNDEFINED = 0,
				ENABLED = 1,
				DISABLED = 2
			}
		}
		interface IAvatarUpdatedAction extends waproto.SyncActionValue.AvatarUpdatedAction.$Properties {
		}
		class AvatarUpdatedAction {
			constructor(p?: waproto.SyncActionValue.AvatarUpdatedAction.$Properties)
			$unknowns?: Uint8Array[]
			eventType?: (waproto.SyncActionValue.AvatarUpdatedAction.AvatarEventType|null)
			recentAvatarStickers: waproto.SyncActionValue.StickerAction.$Properties[]
			static encode(m: waproto.SyncActionValue.AvatarUpdatedAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.AvatarUpdatedAction & waproto.SyncActionValue.AvatarUpdatedAction.$Shape
		}
		namespace AvatarUpdatedAction {
			interface $Properties {
				eventType?: (waproto.SyncActionValue.AvatarUpdatedAction.AvatarEventType|null)
				recentAvatarStickers?: (waproto.SyncActionValue.StickerAction.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.AvatarUpdatedAction.$Properties
			enum AvatarEventType {
				UPDATED = 0,
				CREATED = 1,
				DELETED = 2
			}
		}
		interface IStatusPostOptInNotificationPreferencesAction extends waproto.SyncActionValue.StatusPostOptInNotificationPreferencesAction.$Properties {
		}
		class StatusPostOptInNotificationPreferencesAction {
			constructor(p?: waproto.SyncActionValue.StatusPostOptInNotificationPreferencesAction.$Properties)
			$unknowns?: Uint8Array[]
			enabled?: (boolean|null)
			static encode(m: waproto.SyncActionValue.StatusPostOptInNotificationPreferencesAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.StatusPostOptInNotificationPreferencesAction & waproto.SyncActionValue.StatusPostOptInNotificationPreferencesAction.$Shape
		}
		namespace StatusPostOptInNotificationPreferencesAction {
			interface $Properties {
				enabled?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.StatusPostOptInNotificationPreferencesAction.$Properties
		}
		interface IBizAISettingsNudgeAction extends waproto.SyncActionValue.BizAISettingsNudgeAction.$Properties {
		}
		class BizAISettingsNudgeAction {
			constructor(p?: waproto.SyncActionValue.BizAISettingsNudgeAction.$Properties)
			$unknowns?: Uint8Array[]
			category?: (waproto.SyncActionValue.BizAISettingsNudgeAction.BizAISettingsCategory|null)
			version?: (number|Long|null)
			updatedAtMs?: (number|Long|null)
			static encode(m: waproto.SyncActionValue.BizAISettingsNudgeAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BizAISettingsNudgeAction & waproto.SyncActionValue.BizAISettingsNudgeAction.$Shape
		}
		namespace BizAISettingsNudgeAction {
			interface $Properties {
				category?: (waproto.SyncActionValue.BizAISettingsNudgeAction.BizAISettingsCategory|null)
				version?: (number|Long|null)
				updatedAtMs?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.BizAISettingsNudgeAction.$Properties
			enum BizAISettingsCategory {
				UNKNOWN = 0,
				INSTRUCTIONS = 1,
				RESPONSE_SETTINGS = 2,
				EXAMPLE_RESPONSES = 3,
				KNOWLEDGE = 4,
				LEAD_GEN = 5
			}
		}
		interface IMaibaAIFeaturesControlAction extends waproto.SyncActionValue.MaibaAIFeaturesControlAction.$Properties {
		}
		class MaibaAIFeaturesControlAction {
			constructor(p?: waproto.SyncActionValue.MaibaAIFeaturesControlAction.$Properties)
			$unknowns?: Uint8Array[]
			aiFeatureStatus?: (waproto.SyncActionValue.MaibaAIFeaturesControlAction.MaibaAIFeatureStatus|null)
			aiReplyMode?: (waproto.SyncActionValue.MaibaAIFeaturesControlAction.MaibaAIReplyMode|null)
			static encode(m: waproto.SyncActionValue.MaibaAIFeaturesControlAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MaibaAIFeaturesControlAction & waproto.SyncActionValue.MaibaAIFeaturesControlAction.$Shape
		}
		namespace MaibaAIFeaturesControlAction {
			interface $Properties {
				aiFeatureStatus?: (waproto.SyncActionValue.MaibaAIFeaturesControlAction.MaibaAIFeatureStatus|null)
				aiReplyMode?: (waproto.SyncActionValue.MaibaAIFeaturesControlAction.MaibaAIReplyMode|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.MaibaAIFeaturesControlAction.$Properties
			enum MaibaAIReplyMode {
				MUTED = 0,
				AI_AGENT = 1,
				SUGGESTIONS = 2
			}
			enum MaibaAIFeatureStatus {
				ENABLED = 0,
				ENABLED_HAS_LEARNING = 1,
				DISABLED = 2
			}
		}
		interface IBroadcastListParticipant extends waproto.SyncActionValue.BroadcastListParticipant.$Properties {
		}
		class BroadcastListParticipant {
			constructor(p?: waproto.SyncActionValue.BroadcastListParticipant.$Properties)
			$unknowns?: Uint8Array[]
			lidJid?: (string|null)
			pnJid?: (string|null)
			static encode(m: waproto.SyncActionValue.BroadcastListParticipant.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BroadcastListParticipant & waproto.SyncActionValue.BroadcastListParticipant.$Shape
		}
		namespace BroadcastListParticipant {
			interface $Properties {
				lidJid?: (string|null)
				pnJid?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.BroadcastListParticipant.$Properties
		}
		interface IBusinessBroadcastCampaignAction extends waproto.SyncActionValue.BusinessBroadcastCampaignAction.$Properties {
		}
		class BusinessBroadcastCampaignAction {
			constructor(p?: waproto.SyncActionValue.BusinessBroadcastCampaignAction.$Properties)
			$unknowns?: Uint8Array[]
			deviceId?: (number|null)
			adId?: (string|null)
			name?: (string|null)
			msgId?: (string|null)
			broadcastJid?: (string|null)
			reservedQuota?: (number|null)
			scheduledTimestamp?: (number|Long|null)
			createTimestamp?: (number|Long|null)
			status?: (waproto.SyncActionValue.BusinessBroadcastCampaignStatus|null)
			static encode(m: waproto.SyncActionValue.BusinessBroadcastCampaignAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BusinessBroadcastCampaignAction & waproto.SyncActionValue.BusinessBroadcastCampaignAction.$Shape
		}
		namespace BusinessBroadcastCampaignAction {
			interface $Properties {
				deviceId?: (number|null)
				adId?: (string|null)
				name?: (string|null)
				msgId?: (string|null)
				broadcastJid?: (string|null)
				reservedQuota?: (number|null)
				scheduledTimestamp?: (number|Long|null)
				createTimestamp?: (number|Long|null)
				status?: (waproto.SyncActionValue.BusinessBroadcastCampaignStatus|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.BusinessBroadcastCampaignAction.$Properties
		}
		interface IBusinessBroadcastListAction extends waproto.SyncActionValue.BusinessBroadcastListAction.$Properties {
		}
		class BusinessBroadcastListAction {
			constructor(p?: waproto.SyncActionValue.BusinessBroadcastListAction.$Properties)
			$unknowns?: Uint8Array[]
			deleted?: (boolean|null)
			participants: waproto.SyncActionValue.BroadcastListParticipant.$Properties[]
			listName?: (string|null)
			labelIds: string[]
			audienceExpression?: (string|null)
			customAudienceFbid?: (string|null)
			static encode(m: waproto.SyncActionValue.BusinessBroadcastListAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BusinessBroadcastListAction & waproto.SyncActionValue.BusinessBroadcastListAction.$Shape
		}
		namespace BusinessBroadcastListAction {
			interface $Properties {
				deleted?: (boolean|null)
				participants?: (waproto.SyncActionValue.BroadcastListParticipant.$Properties[]|null)
				listName?: (string|null)
				labelIds?: (string[]|null)
				audienceExpression?: (string|null)
				customAudienceFbid?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.BusinessBroadcastListAction.$Properties
		}
		interface IBusinessBroadcastAssociationAction extends waproto.SyncActionValue.BusinessBroadcastAssociationAction.$Properties {
		}
		class BusinessBroadcastAssociationAction {
			constructor(p?: waproto.SyncActionValue.BusinessBroadcastAssociationAction.$Properties)
			$unknowns?: Uint8Array[]
			deleted?: (boolean|null)
			static encode(m: waproto.SyncActionValue.BusinessBroadcastAssociationAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BusinessBroadcastAssociationAction & waproto.SyncActionValue.BusinessBroadcastAssociationAction.$Shape
		}
		namespace BusinessBroadcastAssociationAction {
			interface $Properties {
				deleted?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.BusinessBroadcastAssociationAction.$Properties
		}
		interface IPaymentTosAction extends waproto.SyncActionValue.PaymentTosAction.$Properties {
		}
		class PaymentTosAction {
			constructor(p?: waproto.SyncActionValue.PaymentTosAction.$Properties)
			$unknowns?: Uint8Array[]
			paymentNotice?: (waproto.SyncActionValue.PaymentTosAction.PaymentNotice|null)
			accepted?: (boolean|null)
			static encode(m: waproto.SyncActionValue.PaymentTosAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PaymentTosAction & waproto.SyncActionValue.PaymentTosAction.$Shape
		}
		namespace PaymentTosAction {
			interface $Properties {
				paymentNotice?: (waproto.SyncActionValue.PaymentTosAction.PaymentNotice|null)
				accepted?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.PaymentTosAction.$Properties
			enum PaymentNotice {
				BR_PAY_PRIVACY_POLICY = 0
			}
		}
		interface ICtwaPerCustomerDataSharingAction extends waproto.SyncActionValue.CtwaPerCustomerDataSharingAction.$Properties {
		}
		class CtwaPerCustomerDataSharingAction {
			constructor(p?: waproto.SyncActionValue.CtwaPerCustomerDataSharingAction.$Properties)
			$unknowns?: Uint8Array[]
			isCtwaPerCustomerDataSharingEnabled?: (boolean|null)
			static encode(m: waproto.SyncActionValue.CtwaPerCustomerDataSharingAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CtwaPerCustomerDataSharingAction & waproto.SyncActionValue.CtwaPerCustomerDataSharingAction.$Shape
		}
		namespace CtwaPerCustomerDataSharingAction {
			interface $Properties {
				isCtwaPerCustomerDataSharingEnabled?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.CtwaPerCustomerDataSharingAction.$Properties
		}
		interface IOutContactAction extends waproto.SyncActionValue.OutContactAction.$Properties {
		}
		class OutContactAction {
			constructor(p?: waproto.SyncActionValue.OutContactAction.$Properties)
			$unknowns?: Uint8Array[]
			fullName?: (string|null)
			firstName?: (string|null)
			static encode(m: waproto.SyncActionValue.OutContactAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.OutContactAction & waproto.SyncActionValue.OutContactAction.$Shape
		}
		namespace OutContactAction {
			interface $Properties {
				fullName?: (string|null)
				firstName?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.OutContactAction.$Properties
		}
		interface ILidContactAction extends waproto.SyncActionValue.LidContactAction.$Properties {
		}
		class LidContactAction {
			constructor(p?: waproto.SyncActionValue.LidContactAction.$Properties)
			$unknowns?: Uint8Array[]
			fullName?: (string|null)
			firstName?: (string|null)
			username?: (string|null)
			static encode(m: waproto.SyncActionValue.LidContactAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.LidContactAction & waproto.SyncActionValue.LidContactAction.$Shape
		}
		namespace LidContactAction {
			interface $Properties {
				fullName?: (string|null)
				firstName?: (string|null)
				username?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.LidContactAction.$Properties
		}
		interface INotificationActivitySettingAction extends waproto.SyncActionValue.NotificationActivitySettingAction.$Properties {
		}
		class NotificationActivitySettingAction {
			constructor(p?: waproto.SyncActionValue.NotificationActivitySettingAction.$Properties)
			$unknowns?: Uint8Array[]
			notificationActivitySetting?: (waproto.SyncActionValue.NotificationActivitySettingAction.NotificationActivitySetting|null)
			static encode(m: waproto.SyncActionValue.NotificationActivitySettingAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.NotificationActivitySettingAction & waproto.SyncActionValue.NotificationActivitySettingAction.$Shape
		}
		namespace NotificationActivitySettingAction {
			interface $Properties {
				notificationActivitySetting?: (waproto.SyncActionValue.NotificationActivitySettingAction.NotificationActivitySetting|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.NotificationActivitySettingAction.$Properties
			enum NotificationActivitySetting {
				DEFAULT_ALL_MESSAGES = 0,
				ALL_MESSAGES = 1,
				HIGHLIGHTS = 2,
				DEFAULT_HIGHLIGHTS = 3
			}
		}
		interface IWaffleAccountLinkStateAction extends waproto.SyncActionValue.WaffleAccountLinkStateAction.$Properties {
		}
		class WaffleAccountLinkStateAction {
			constructor(p?: waproto.SyncActionValue.WaffleAccountLinkStateAction.$Properties)
			$unknowns?: Uint8Array[]
			linkState?: (waproto.SyncActionValue.WaffleAccountLinkStateAction.AccountLinkState|null)
			static encode(m: waproto.SyncActionValue.WaffleAccountLinkStateAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.WaffleAccountLinkStateAction & waproto.SyncActionValue.WaffleAccountLinkStateAction.$Shape
		}
		namespace WaffleAccountLinkStateAction {
			interface $Properties {
				linkState?: (waproto.SyncActionValue.WaffleAccountLinkStateAction.AccountLinkState|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.WaffleAccountLinkStateAction.$Properties
			enum AccountLinkState {
				ACTIVE = 0,
				PAUSED = 1,
				UNLINKED = 2
			}
		}
		interface IMerchantPaymentPartnerAction extends waproto.SyncActionValue.MerchantPaymentPartnerAction.$Properties {
		}
		class MerchantPaymentPartnerAction {
			constructor(p?: waproto.SyncActionValue.MerchantPaymentPartnerAction.$Properties)
			$unknowns?: Uint8Array[]
			status?: (waproto.SyncActionValue.MerchantPaymentPartnerAction.Status|null)
			country?: (string|null)
			gatewayName?: (string|null)
			credentialId?: (string|null)
			static encode(m: waproto.SyncActionValue.MerchantPaymentPartnerAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MerchantPaymentPartnerAction & waproto.SyncActionValue.MerchantPaymentPartnerAction.$Shape
		}
		namespace MerchantPaymentPartnerAction {
			interface $Properties {
				status?: (waproto.SyncActionValue.MerchantPaymentPartnerAction.Status|null)
				country?: (string|null)
				gatewayName?: (string|null)
				credentialId?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.MerchantPaymentPartnerAction.$Properties
			enum Status {
				ACTIVE = 0,
				INACTIVE = 1
			}
		}
		interface IFavoritesAction extends waproto.SyncActionValue.FavoritesAction.$Properties {
		}
		class FavoritesAction {
			constructor(p?: waproto.SyncActionValue.FavoritesAction.$Properties)
			$unknowns?: Uint8Array[]
			favorites: waproto.SyncActionValue.FavoritesAction.Favorite.$Properties[]
			static encode(m: waproto.SyncActionValue.FavoritesAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.FavoritesAction & waproto.SyncActionValue.FavoritesAction.$Shape
		}
		namespace FavoritesAction {
			interface $Properties {
				favorites?: (waproto.SyncActionValue.FavoritesAction.Favorite.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.FavoritesAction.$Properties
			interface IFavorite extends waproto.SyncActionValue.FavoritesAction.Favorite.$Properties {
			}
			class Favorite {
				constructor(p?: waproto.SyncActionValue.FavoritesAction.Favorite.$Properties)
				$unknowns?: Uint8Array[]
				id?: (string|null)
				static encode(m: waproto.SyncActionValue.FavoritesAction.Favorite.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.FavoritesAction.Favorite & waproto.SyncActionValue.FavoritesAction.Favorite.$Shape
			}
			namespace Favorite {
				interface $Properties {
					id?: (string|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.SyncActionValue.FavoritesAction.Favorite.$Properties
			}
		}
		interface INoteEditAction extends waproto.SyncActionValue.NoteEditAction.$Properties {
		}
		class NoteEditAction {
			constructor(p?: waproto.SyncActionValue.NoteEditAction.$Properties)
			$unknowns?: Uint8Array[]
			type?: (waproto.SyncActionValue.NoteEditAction.NoteType|null)
			chatJid?: (string|null)
			createdAt?: (number|Long|null)
			deleted?: (boolean|null)
			unstructuredContent?: (string|null)
			static encode(m: waproto.SyncActionValue.NoteEditAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.NoteEditAction & waproto.SyncActionValue.NoteEditAction.$Shape
		}
		namespace NoteEditAction {
			interface $Properties {
				type?: (waproto.SyncActionValue.NoteEditAction.NoteType|null)
				chatJid?: (string|null)
				createdAt?: (number|Long|null)
				deleted?: (boolean|null)
				unstructuredContent?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.NoteEditAction.$Properties
			enum NoteType {
				UNSTRUCTURED = 1,
				STRUCTURED = 2
			}
		}
		interface IPrivacySettingChannelsPersonalisedRecommendationAction extends waproto.SyncActionValue.PrivacySettingChannelsPersonalisedRecommendationAction.$Properties {
		}
		class PrivacySettingChannelsPersonalisedRecommendationAction {
			constructor(p?: waproto.SyncActionValue.PrivacySettingChannelsPersonalisedRecommendationAction.$Properties)
			$unknowns?: Uint8Array[]
			isUserOptedOut?: (boolean|null)
			static encode(m: waproto.SyncActionValue.PrivacySettingChannelsPersonalisedRecommendationAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PrivacySettingChannelsPersonalisedRecommendationAction & waproto.SyncActionValue.PrivacySettingChannelsPersonalisedRecommendationAction.$Shape
		}
		namespace PrivacySettingChannelsPersonalisedRecommendationAction {
			interface $Properties {
				isUserOptedOut?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.PrivacySettingChannelsPersonalisedRecommendationAction.$Properties
		}
		interface IPrivacySettingDisableLinkPreviewsAction extends waproto.SyncActionValue.PrivacySettingDisableLinkPreviewsAction.$Properties {
		}
		class PrivacySettingDisableLinkPreviewsAction {
			constructor(p?: waproto.SyncActionValue.PrivacySettingDisableLinkPreviewsAction.$Properties)
			$unknowns?: Uint8Array[]
			isPreviewsDisabled?: (boolean|null)
			static encode(m: waproto.SyncActionValue.PrivacySettingDisableLinkPreviewsAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PrivacySettingDisableLinkPreviewsAction & waproto.SyncActionValue.PrivacySettingDisableLinkPreviewsAction.$Shape
		}
		namespace PrivacySettingDisableLinkPreviewsAction {
			interface $Properties {
				isPreviewsDisabled?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.PrivacySettingDisableLinkPreviewsAction.$Properties
		}
		interface IWamoUserIdentifierAction extends waproto.SyncActionValue.WamoUserIdentifierAction.$Properties {
		}
		class WamoUserIdentifierAction {
			constructor(p?: waproto.SyncActionValue.WamoUserIdentifierAction.$Properties)
			$unknowns?: Uint8Array[]
			identifier?: (string|null)
			static encode(m: waproto.SyncActionValue.WamoUserIdentifierAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.WamoUserIdentifierAction & waproto.SyncActionValue.WamoUserIdentifierAction.$Shape
		}
		namespace WamoUserIdentifierAction {
			interface $Properties {
				identifier?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.WamoUserIdentifierAction.$Properties
		}
		interface IBubbleLockMessageAction extends waproto.SyncActionValue.BubbleLockMessageAction.$Properties {
		}
		class BubbleLockMessageAction {
			constructor(p?: waproto.SyncActionValue.BubbleLockMessageAction.$Properties)
			$unknowns?: Uint8Array[]
			locked?: (boolean|null)
			static encode(m: waproto.SyncActionValue.BubbleLockMessageAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BubbleLockMessageAction & waproto.SyncActionValue.BubbleLockMessageAction.$Shape
		}
		namespace BubbleLockMessageAction {
			interface $Properties {
				locked?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.BubbleLockMessageAction.$Properties
		}
		interface ILockChatAction extends waproto.SyncActionValue.LockChatAction.$Properties {
		}
		class LockChatAction {
			constructor(p?: waproto.SyncActionValue.LockChatAction.$Properties)
			$unknowns?: Uint8Array[]
			locked?: (boolean|null)
			static encode(m: waproto.SyncActionValue.LockChatAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.LockChatAction & waproto.SyncActionValue.LockChatAction.$Shape
		}
		namespace LockChatAction {
			interface $Properties {
				locked?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.LockChatAction.$Properties
		}
		interface ICustomPaymentMethodsAction extends waproto.SyncActionValue.CustomPaymentMethodsAction.$Properties {
		}
		class CustomPaymentMethodsAction {
			constructor(p?: waproto.SyncActionValue.CustomPaymentMethodsAction.$Properties)
			$unknowns?: Uint8Array[]
			customPaymentMethods: waproto.SyncActionValue.CustomPaymentMethod.$Properties[]
			static encode(m: waproto.SyncActionValue.CustomPaymentMethodsAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CustomPaymentMethodsAction & waproto.SyncActionValue.CustomPaymentMethodsAction.$Shape
		}
		namespace CustomPaymentMethodsAction {
			interface $Properties {
				customPaymentMethods?: (waproto.SyncActionValue.CustomPaymentMethod.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.CustomPaymentMethodsAction.$Properties
		}
		interface ICustomPaymentMethod extends waproto.SyncActionValue.CustomPaymentMethod.$Properties {
		}
		class CustomPaymentMethod {
			constructor(p?: waproto.SyncActionValue.CustomPaymentMethod.$Properties)
			$unknowns?: Uint8Array[]
			credentialId?: (string|null)
			country?: (string|null)
			type?: (string|null)
			metadata: waproto.SyncActionValue.CustomPaymentMethodMetadata.$Properties[]
			static encode(m: waproto.SyncActionValue.CustomPaymentMethod.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CustomPaymentMethod & waproto.SyncActionValue.CustomPaymentMethod.$Shape
		}
		namespace CustomPaymentMethod {
			interface $Properties {
				credentialId?: (string|null)
				country?: (string|null)
				type?: (string|null)
				metadata?: (waproto.SyncActionValue.CustomPaymentMethodMetadata.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.CustomPaymentMethod.$Properties
		}
		interface ICustomPaymentMethodMetadata extends waproto.SyncActionValue.CustomPaymentMethodMetadata.$Properties {
		}
		class CustomPaymentMethodMetadata {
			constructor(p?: waproto.SyncActionValue.CustomPaymentMethodMetadata.$Properties)
			$unknowns?: Uint8Array[]
			key?: (string|null)
			value?: (string|null)
			static encode(m: waproto.SyncActionValue.CustomPaymentMethodMetadata.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CustomPaymentMethodMetadata & waproto.SyncActionValue.CustomPaymentMethodMetadata.$Shape
		}
		namespace CustomPaymentMethodMetadata {
			interface $Properties {
				key?: (string|null)
				value?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.CustomPaymentMethodMetadata.$Properties
		}
		interface IPaymentInfoAction extends waproto.SyncActionValue.PaymentInfoAction.$Properties {
		}
		class PaymentInfoAction {
			constructor(p?: waproto.SyncActionValue.PaymentInfoAction.$Properties)
			$unknowns?: Uint8Array[]
			cpi?: (string|null)
			static encode(m: waproto.SyncActionValue.PaymentInfoAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PaymentInfoAction & waproto.SyncActionValue.PaymentInfoAction.$Shape
		}
		namespace PaymentInfoAction {
			interface $Properties {
				cpi?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.PaymentInfoAction.$Properties
		}
		interface ILabelReorderingAction extends waproto.SyncActionValue.LabelReorderingAction.$Properties {
		}
		class LabelReorderingAction {
			constructor(p?: waproto.SyncActionValue.LabelReorderingAction.$Properties)
			$unknowns?: Uint8Array[]
			sortedLabelIds: number[]
			static encode(m: waproto.SyncActionValue.LabelReorderingAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.LabelReorderingAction & waproto.SyncActionValue.LabelReorderingAction.$Shape
		}
		namespace LabelReorderingAction {
			interface $Properties {
				sortedLabelIds?: (number[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.LabelReorderingAction.$Properties
		}
		interface IDeleteIndividualCallLogAction extends waproto.SyncActionValue.DeleteIndividualCallLogAction.$Properties {
		}
		class DeleteIndividualCallLogAction {
			constructor(p?: waproto.SyncActionValue.DeleteIndividualCallLogAction.$Properties)
			$unknowns?: Uint8Array[]
			peerJid?: (string|null)
			isIncoming?: (boolean|null)
			static encode(m: waproto.SyncActionValue.DeleteIndividualCallLogAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.DeleteIndividualCallLogAction & waproto.SyncActionValue.DeleteIndividualCallLogAction.$Shape
		}
		namespace DeleteIndividualCallLogAction {
			interface $Properties {
				peerJid?: (string|null)
				isIncoming?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.DeleteIndividualCallLogAction.$Properties
		}
		interface IBotWelcomeRequestAction extends waproto.SyncActionValue.BotWelcomeRequestAction.$Properties {
		}
		class BotWelcomeRequestAction {
			constructor(p?: waproto.SyncActionValue.BotWelcomeRequestAction.$Properties)
			$unknowns?: Uint8Array[]
			isSent?: (boolean|null)
			static encode(m: waproto.SyncActionValue.BotWelcomeRequestAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BotWelcomeRequestAction & waproto.SyncActionValue.BotWelcomeRequestAction.$Shape
		}
		namespace BotWelcomeRequestAction {
			interface $Properties {
				isSent?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.BotWelcomeRequestAction.$Properties
		}
		interface INewsletterSavedInterestsAction extends waproto.SyncActionValue.NewsletterSavedInterestsAction.$Properties {
		}
		class NewsletterSavedInterestsAction {
			constructor(p?: waproto.SyncActionValue.NewsletterSavedInterestsAction.$Properties)
			$unknowns?: Uint8Array[]
			newsletterSavedInterests?: (string|null)
			static encode(m: waproto.SyncActionValue.NewsletterSavedInterestsAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.NewsletterSavedInterestsAction & waproto.SyncActionValue.NewsletterSavedInterestsAction.$Shape
		}
		namespace NewsletterSavedInterestsAction {
			interface $Properties {
				newsletterSavedInterests?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.NewsletterSavedInterestsAction.$Properties
		}
		interface IMusicUserIdAction extends waproto.SyncActionValue.MusicUserIdAction.$Properties {
		}
		class MusicUserIdAction {
			constructor(p?: waproto.SyncActionValue.MusicUserIdAction.$Properties)
			$unknowns?: Uint8Array[]
			musicUserId?: (string|null)
			musicUserIdMap: { [k: string]: string }
			static encode(m: waproto.SyncActionValue.MusicUserIdAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MusicUserIdAction & waproto.SyncActionValue.MusicUserIdAction.$Shape
		}
		namespace MusicUserIdAction {
			interface $Properties {
				musicUserId?: (string|null)
				musicUserIdMap?: ({ [k: string]: string }|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.MusicUserIdAction.$Properties
		}
		interface IStatusPrivacyAction extends waproto.SyncActionValue.StatusPrivacyAction.$Properties {
		}
		class StatusPrivacyAction {
			constructor(p?: waproto.SyncActionValue.StatusPrivacyAction.$Properties)
			$unknowns?: Uint8Array[]
			mode?: (waproto.SyncActionValue.StatusPrivacyAction.StatusDistributionMode|null)
			userJid: string[]
			shareToFb?: (boolean|null)
			shareToIg?: (boolean|null)
			customLists: waproto.SyncActionValue.StatusPrivacyAction.CustomList.$Properties[]
			modes: waproto.SyncActionValue.StatusPrivacyAction.StatusDistributionMode[]
			static encode(m: waproto.SyncActionValue.StatusPrivacyAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.StatusPrivacyAction & waproto.SyncActionValue.StatusPrivacyAction.$Shape
		}
		namespace StatusPrivacyAction {
			interface $Properties {
				mode?: (waproto.SyncActionValue.StatusPrivacyAction.StatusDistributionMode|null)
				userJid?: (string[]|null)
				shareToFb?: (boolean|null)
				shareToIg?: (boolean|null)
				customLists?: (waproto.SyncActionValue.StatusPrivacyAction.CustomList.$Properties[]|null)
				modes?: (waproto.SyncActionValue.StatusPrivacyAction.StatusDistributionMode[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.StatusPrivacyAction.$Properties
			enum StatusDistributionMode {
				ALLOW_LIST = 0,
				DENY_LIST = 1,
				CONTACTS = 2,
				CLOSE_FRIENDS = 3,
				CUSTOM_LIST = 4
			}
			interface ICustomList extends waproto.SyncActionValue.StatusPrivacyAction.CustomList.$Properties {
			}
			class CustomList {
				constructor(p?: waproto.SyncActionValue.StatusPrivacyAction.CustomList.$Properties)
				$unknowns?: Uint8Array[]
				listId?: (string|null)
				name?: (string|null)
				emoji?: (string|null)
				isSelected?: (boolean|null)
				userJid: string[]
				static encode(m: waproto.SyncActionValue.StatusPrivacyAction.CustomList.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.StatusPrivacyAction.CustomList & waproto.SyncActionValue.StatusPrivacyAction.CustomList.$Shape
			}
			namespace CustomList {
				interface $Properties {
					listId?: (string|null)
					name?: (string|null)
					emoji?: (string|null)
					isSelected?: (boolean|null)
					userJid?: (string[]|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.SyncActionValue.StatusPrivacyAction.CustomList.$Properties
			}
		}
		interface IUGCBot extends waproto.SyncActionValue.UGCBot.$Properties {
		}
		class UGCBot {
			constructor(p?: waproto.SyncActionValue.UGCBot.$Properties)
			$unknowns?: Uint8Array[]
			definition?: (Uint8Array|null)
			static encode(m: waproto.SyncActionValue.UGCBot.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.UGCBot & waproto.SyncActionValue.UGCBot.$Shape
		}
		namespace UGCBot {
			interface $Properties {
				definition?: (Uint8Array|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.UGCBot.$Properties
		}
		interface ICallLogAction extends waproto.SyncActionValue.CallLogAction.$Properties {
		}
		class CallLogAction {
			constructor(p?: waproto.SyncActionValue.CallLogAction.$Properties)
			$unknowns?: Uint8Array[]
			callLogRecord?: (waproto.CallLogRecord.$Properties|null)
			static encode(m: waproto.SyncActionValue.CallLogAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CallLogAction & waproto.SyncActionValue.CallLogAction.$Shape
		}
		namespace CallLogAction {
			interface $Properties {
				callLogRecord?: (waproto.CallLogRecord.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.CallLogAction.$Properties
		}
		interface IPrivacySettingRelayAllCalls extends waproto.SyncActionValue.PrivacySettingRelayAllCalls.$Properties {
		}
		class PrivacySettingRelayAllCalls {
			constructor(p?: waproto.SyncActionValue.PrivacySettingRelayAllCalls.$Properties)
			$unknowns?: Uint8Array[]
			isEnabled?: (boolean|null)
			static encode(m: waproto.SyncActionValue.PrivacySettingRelayAllCalls.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PrivacySettingRelayAllCalls & waproto.SyncActionValue.PrivacySettingRelayAllCalls.$Shape
		}
		namespace PrivacySettingRelayAllCalls {
			interface $Properties {
				isEnabled?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.PrivacySettingRelayAllCalls.$Properties
		}
		interface IDetectedOutcomesStatusAction extends waproto.SyncActionValue.DetectedOutcomesStatusAction.$Properties {
		}
		class DetectedOutcomesStatusAction {
			constructor(p?: waproto.SyncActionValue.DetectedOutcomesStatusAction.$Properties)
			$unknowns?: Uint8Array[]
			isEnabled?: (boolean|null)
			static encode(m: waproto.SyncActionValue.DetectedOutcomesStatusAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.DetectedOutcomesStatusAction & waproto.SyncActionValue.DetectedOutcomesStatusAction.$Shape
		}
		namespace DetectedOutcomesStatusAction {
			interface $Properties {
				isEnabled?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.DetectedOutcomesStatusAction.$Properties
		}
		interface IExternalWebBetaAction extends waproto.SyncActionValue.ExternalWebBetaAction.$Properties {
		}
		class ExternalWebBetaAction {
			constructor(p?: waproto.SyncActionValue.ExternalWebBetaAction.$Properties)
			$unknowns?: Uint8Array[]
			isOptIn?: (boolean|null)
			static encode(m: waproto.SyncActionValue.ExternalWebBetaAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ExternalWebBetaAction & waproto.SyncActionValue.ExternalWebBetaAction.$Shape
		}
		namespace ExternalWebBetaAction {
			interface $Properties {
				isOptIn?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.ExternalWebBetaAction.$Properties
		}
		interface IMarketingMessageBroadcastAction extends waproto.SyncActionValue.MarketingMessageBroadcastAction.$Properties {
		}
		class MarketingMessageBroadcastAction {
			constructor(p?: waproto.SyncActionValue.MarketingMessageBroadcastAction.$Properties)
			$unknowns?: Uint8Array[]
			repliedCount?: (number|null)
			static encode(m: waproto.SyncActionValue.MarketingMessageBroadcastAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MarketingMessageBroadcastAction & waproto.SyncActionValue.MarketingMessageBroadcastAction.$Shape
		}
		namespace MarketingMessageBroadcastAction {
			interface $Properties {
				repliedCount?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.MarketingMessageBroadcastAction.$Properties
		}
		interface IMarketingMessageAction extends waproto.SyncActionValue.MarketingMessageAction.$Properties {
		}
		class MarketingMessageAction {
			constructor(p?: waproto.SyncActionValue.MarketingMessageAction.$Properties)
			$unknowns?: Uint8Array[]
			name?: (string|null)
			message?: (string|null)
			type?: (waproto.SyncActionValue.MarketingMessageAction.MarketingMessagePrototypeType|null)
			createdAt?: (number|Long|null)
			lastSentAt?: (number|Long|null)
			isDeleted?: (boolean|null)
			mediaId?: (string|null)
			static encode(m: waproto.SyncActionValue.MarketingMessageAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MarketingMessageAction & waproto.SyncActionValue.MarketingMessageAction.$Shape
		}
		namespace MarketingMessageAction {
			interface $Properties {
				name?: (string|null)
				message?: (string|null)
				type?: (waproto.SyncActionValue.MarketingMessageAction.MarketingMessagePrototypeType|null)
				createdAt?: (number|Long|null)
				lastSentAt?: (number|Long|null)
				isDeleted?: (boolean|null)
				mediaId?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.MarketingMessageAction.$Properties
			enum MarketingMessagePrototypeType {
				PERSONALIZED = 0
			}
		}
		interface IUsernameChatStartModeAction extends waproto.SyncActionValue.UsernameChatStartModeAction.$Properties {
		}
		class UsernameChatStartModeAction {
			constructor(p?: waproto.SyncActionValue.UsernameChatStartModeAction.$Properties)
			$unknowns?: Uint8Array[]
			chatStartMode?: (waproto.SyncActionValue.UsernameChatStartModeAction.ChatStartMode|null)
			static encode(m: waproto.SyncActionValue.UsernameChatStartModeAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.UsernameChatStartModeAction & waproto.SyncActionValue.UsernameChatStartModeAction.$Shape
		}
		namespace UsernameChatStartModeAction {
			interface $Properties {
				chatStartMode?: (waproto.SyncActionValue.UsernameChatStartModeAction.ChatStartMode|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.UsernameChatStartModeAction.$Properties
			enum ChatStartMode {
				LID = 1,
				PN = 2
			}
		}
		interface IPnForLidChatAction extends waproto.SyncActionValue.PnForLidChatAction.$Properties {
		}
		class PnForLidChatAction {
			constructor(p?: waproto.SyncActionValue.PnForLidChatAction.$Properties)
			$unknowns?: Uint8Array[]
			pnJid?: (string|null)
			static encode(m: waproto.SyncActionValue.PnForLidChatAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PnForLidChatAction & waproto.SyncActionValue.PnForLidChatAction.$Shape
		}
		namespace PnForLidChatAction {
			interface $Properties {
				pnJid?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.PnForLidChatAction.$Properties
		}
		interface IChatAssignmentOpenedStatusAction extends waproto.SyncActionValue.ChatAssignmentOpenedStatusAction.$Properties {
		}
		class ChatAssignmentOpenedStatusAction {
			constructor(p?: waproto.SyncActionValue.ChatAssignmentOpenedStatusAction.$Properties)
			$unknowns?: Uint8Array[]
			chatOpened?: (boolean|null)
			static encode(m: waproto.SyncActionValue.ChatAssignmentOpenedStatusAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ChatAssignmentOpenedStatusAction & waproto.SyncActionValue.ChatAssignmentOpenedStatusAction.$Shape
		}
		namespace ChatAssignmentOpenedStatusAction {
			interface $Properties {
				chatOpened?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.ChatAssignmentOpenedStatusAction.$Properties
		}
		interface IChatAssignmentAction extends waproto.SyncActionValue.ChatAssignmentAction.$Properties {
		}
		class ChatAssignmentAction {
			constructor(p?: waproto.SyncActionValue.ChatAssignmentAction.$Properties)
			$unknowns?: Uint8Array[]
			deviceAgentId?: (string|null)
			static encode(m: waproto.SyncActionValue.ChatAssignmentAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ChatAssignmentAction & waproto.SyncActionValue.ChatAssignmentAction.$Shape
		}
		namespace ChatAssignmentAction {
			interface $Properties {
				deviceAgentId?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.ChatAssignmentAction.$Properties
		}
		interface IStickerAction extends waproto.SyncActionValue.StickerAction.$Properties {
		}
		class StickerAction {
			constructor(p?: waproto.SyncActionValue.StickerAction.$Properties)
			$unknowns?: Uint8Array[]
			url?: (string|null)
			fileEncSha256?: (Uint8Array|null)
			mediaKey?: (Uint8Array|null)
			mimetype?: (string|null)
			height?: (number|null)
			width?: (number|null)
			directPath?: (string|null)
			fileLength?: (number|Long|null)
			isFavorite?: (boolean|null)
			deviceIdHint?: (number|null)
			isLottie?: (boolean|null)
			imageHash?: (string|null)
			isAvatarSticker?: (boolean|null)
			static encode(m: waproto.SyncActionValue.StickerAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.StickerAction & waproto.SyncActionValue.StickerAction.$Shape
		}
		namespace StickerAction {
			interface $Properties {
				url?: (string|null)
				fileEncSha256?: (Uint8Array|null)
				mediaKey?: (Uint8Array|null)
				mimetype?: (string|null)
				height?: (number|null)
				width?: (number|null)
				directPath?: (string|null)
				fileLength?: (number|Long|null)
				isFavorite?: (boolean|null)
				deviceIdHint?: (number|null)
				isLottie?: (boolean|null)
				imageHash?: (string|null)
				isAvatarSticker?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.StickerAction.$Properties
		}
		interface IRemoveRecentStickerAction extends waproto.SyncActionValue.RemoveRecentStickerAction.$Properties {
		}
		class RemoveRecentStickerAction {
			constructor(p?: waproto.SyncActionValue.RemoveRecentStickerAction.$Properties)
			$unknowns?: Uint8Array[]
			lastStickerSentTs?: (number|Long|null)
			static encode(m: waproto.SyncActionValue.RemoveRecentStickerAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.RemoveRecentStickerAction & waproto.SyncActionValue.RemoveRecentStickerAction.$Shape
		}
		namespace RemoveRecentStickerAction {
			interface $Properties {
				lastStickerSentTs?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.RemoveRecentStickerAction.$Properties
		}
		interface IPrimaryVersionAction extends waproto.SyncActionValue.PrimaryVersionAction.$Properties {
		}
		class PrimaryVersionAction {
			constructor(p?: waproto.SyncActionValue.PrimaryVersionAction.$Properties)
			$unknowns?: Uint8Array[]
			version?: (string|null)
			static encode(m: waproto.SyncActionValue.PrimaryVersionAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PrimaryVersionAction & waproto.SyncActionValue.PrimaryVersionAction.$Shape
		}
		namespace PrimaryVersionAction {
			interface $Properties {
				version?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.PrimaryVersionAction.$Properties
		}
		interface INuxAction extends waproto.SyncActionValue.NuxAction.$Properties {
		}
		class NuxAction {
			constructor(p?: waproto.SyncActionValue.NuxAction.$Properties)
			$unknowns?: Uint8Array[]
			acknowledged?: (boolean|null)
			static encode(m: waproto.SyncActionValue.NuxAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.NuxAction & waproto.SyncActionValue.NuxAction.$Shape
		}
		namespace NuxAction {
			interface $Properties {
				acknowledged?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.NuxAction.$Properties
		}
		interface ITimeFormatAction extends waproto.SyncActionValue.TimeFormatAction.$Properties {
		}
		class TimeFormatAction {
			constructor(p?: waproto.SyncActionValue.TimeFormatAction.$Properties)
			$unknowns?: Uint8Array[]
			isTwentyFourHourFormatEnabled?: (boolean|null)
			static encode(m: waproto.SyncActionValue.TimeFormatAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.TimeFormatAction & waproto.SyncActionValue.TimeFormatAction.$Shape
		}
		namespace TimeFormatAction {
			interface $Properties {
				isTwentyFourHourFormatEnabled?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.TimeFormatAction.$Properties
		}
		interface IUserStatusMuteAction extends waproto.SyncActionValue.UserStatusMuteAction.$Properties {
		}
		class UserStatusMuteAction {
			constructor(p?: waproto.SyncActionValue.UserStatusMuteAction.$Properties)
			$unknowns?: Uint8Array[]
			muted?: (boolean|null)
			static encode(m: waproto.SyncActionValue.UserStatusMuteAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.UserStatusMuteAction & waproto.SyncActionValue.UserStatusMuteAction.$Shape
		}
		namespace UserStatusMuteAction {
			interface $Properties {
				muted?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.UserStatusMuteAction.$Properties
		}
		interface ISubscriptionAction extends waproto.SyncActionValue.SubscriptionAction.$Properties {
		}
		class SubscriptionAction {
			constructor(p?: waproto.SyncActionValue.SubscriptionAction.$Properties)
			$unknowns?: Uint8Array[]
			isDeactivated?: (boolean|null)
			isAutoRenewing?: (boolean|null)
			expirationDate?: (number|Long|null)
			static encode(m: waproto.SyncActionValue.SubscriptionAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.SubscriptionAction & waproto.SyncActionValue.SubscriptionAction.$Shape
		}
		namespace SubscriptionAction {
			interface $Properties {
				isDeactivated?: (boolean|null)
				isAutoRenewing?: (boolean|null)
				expirationDate?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.SubscriptionAction.$Properties
		}
		interface IAgentAction extends waproto.SyncActionValue.AgentAction.$Properties {
		}
		class AgentAction {
			constructor(p?: waproto.SyncActionValue.AgentAction.$Properties)
			$unknowns?: Uint8Array[]
			name?: (string|null)
			deviceId?: (number|null)
			isDeleted?: (boolean|null)
			static encode(m: waproto.SyncActionValue.AgentAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.AgentAction & waproto.SyncActionValue.AgentAction.$Shape
		}
		namespace AgentAction {
			interface $Properties {
				name?: (string|null)
				deviceId?: (number|null)
				isDeleted?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.AgentAction.$Properties
		}
		interface IAndroidUnsupportedActions extends waproto.SyncActionValue.AndroidUnsupportedActions.$Properties {
		}
		class AndroidUnsupportedActions {
			constructor(p?: waproto.SyncActionValue.AndroidUnsupportedActions.$Properties)
			$unknowns?: Uint8Array[]
			allowed?: (boolean|null)
			static encode(m: waproto.SyncActionValue.AndroidUnsupportedActions.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.AndroidUnsupportedActions & waproto.SyncActionValue.AndroidUnsupportedActions.$Shape
		}
		namespace AndroidUnsupportedActions {
			interface $Properties {
				allowed?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.AndroidUnsupportedActions.$Properties
		}
		interface IPrimaryFeature extends waproto.SyncActionValue.PrimaryFeature.$Properties {
		}
		class PrimaryFeature {
			constructor(p?: waproto.SyncActionValue.PrimaryFeature.$Properties)
			$unknowns?: Uint8Array[]
			flags: string[]
			static encode(m: waproto.SyncActionValue.PrimaryFeature.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PrimaryFeature & waproto.SyncActionValue.PrimaryFeature.$Shape
		}
		namespace PrimaryFeature {
			interface $Properties {
				flags?: (string[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.PrimaryFeature.$Properties
		}
		interface IKeyExpiration extends waproto.SyncActionValue.KeyExpiration.$Properties {
		}
		class KeyExpiration {
			constructor(p?: waproto.SyncActionValue.KeyExpiration.$Properties)
			$unknowns?: Uint8Array[]
			expiredKeyEpoch?: (number|null)
			static encode(m: waproto.SyncActionValue.KeyExpiration.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.KeyExpiration & waproto.SyncActionValue.KeyExpiration.$Shape
		}
		namespace KeyExpiration {
			interface $Properties {
				expiredKeyEpoch?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.KeyExpiration.$Properties
		}
		interface ISyncActionMessage extends waproto.SyncActionValue.SyncActionMessage.$Properties {
		}
		class SyncActionMessage {
			constructor(p?: waproto.SyncActionValue.SyncActionMessage.$Properties)
			$unknowns?: Uint8Array[]
			key?: (waproto.MessageKey.$Properties|null)
			timestamp?: (number|Long|null)
			static encode(m: waproto.SyncActionValue.SyncActionMessage.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.SyncActionMessage & waproto.SyncActionValue.SyncActionMessage.$Shape
		}
		namespace SyncActionMessage {
			interface $Properties {
				key?: (waproto.MessageKey.$Properties|null)
				timestamp?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.SyncActionMessage.$Properties
		}
		interface ISyncActionMessageRange extends waproto.SyncActionValue.SyncActionMessageRange.$Properties {
		}
		class SyncActionMessageRange {
			constructor(p?: waproto.SyncActionValue.SyncActionMessageRange.$Properties)
			$unknowns?: Uint8Array[]
			lastMessageTimestamp?: (number|Long|null)
			lastSystemMessageTimestamp?: (number|Long|null)
			messages: waproto.SyncActionValue.SyncActionMessage.$Properties[]
			static encode(m: waproto.SyncActionValue.SyncActionMessageRange.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.SyncActionMessageRange & waproto.SyncActionValue.SyncActionMessageRange.$Shape
		}
		namespace SyncActionMessageRange {
			interface $Properties {
				lastMessageTimestamp?: (number|Long|null)
				lastSystemMessageTimestamp?: (number|Long|null)
				messages?: (waproto.SyncActionValue.SyncActionMessage.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.SyncActionMessageRange.$Properties
		}
		interface IUnarchiveChatsSetting extends waproto.SyncActionValue.UnarchiveChatsSetting.$Properties {
		}
		class UnarchiveChatsSetting {
			constructor(p?: waproto.SyncActionValue.UnarchiveChatsSetting.$Properties)
			$unknowns?: Uint8Array[]
			unarchiveChats?: (boolean|null)
			static encode(m: waproto.SyncActionValue.UnarchiveChatsSetting.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.UnarchiveChatsSetting & waproto.SyncActionValue.UnarchiveChatsSetting.$Shape
		}
		namespace UnarchiveChatsSetting {
			interface $Properties {
				unarchiveChats?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.UnarchiveChatsSetting.$Properties
		}
		interface IDeleteChatAction extends waproto.SyncActionValue.DeleteChatAction.$Properties {
		}
		class DeleteChatAction {
			constructor(p?: waproto.SyncActionValue.DeleteChatAction.$Properties)
			$unknowns?: Uint8Array[]
			messageRange?: (waproto.SyncActionValue.SyncActionMessageRange.$Properties|null)
			static encode(m: waproto.SyncActionValue.DeleteChatAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.DeleteChatAction & waproto.SyncActionValue.DeleteChatAction.$Shape
		}
		namespace DeleteChatAction {
			interface $Properties {
				messageRange?: (waproto.SyncActionValue.SyncActionMessageRange.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.DeleteChatAction.$Properties
		}
		interface IClearChatAction extends waproto.SyncActionValue.ClearChatAction.$Properties {
		}
		class ClearChatAction {
			constructor(p?: waproto.SyncActionValue.ClearChatAction.$Properties)
			$unknowns?: Uint8Array[]
			messageRange?: (waproto.SyncActionValue.SyncActionMessageRange.$Properties|null)
			static encode(m: waproto.SyncActionValue.ClearChatAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ClearChatAction & waproto.SyncActionValue.ClearChatAction.$Shape
		}
		namespace ClearChatAction {
			interface $Properties {
				messageRange?: (waproto.SyncActionValue.SyncActionMessageRange.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.ClearChatAction.$Properties
		}
		interface IMarkChatAsReadAction extends waproto.SyncActionValue.MarkChatAsReadAction.$Properties {
		}
		class MarkChatAsReadAction {
			constructor(p?: waproto.SyncActionValue.MarkChatAsReadAction.$Properties)
			$unknowns?: Uint8Array[]
			read?: (boolean|null)
			messageRange?: (waproto.SyncActionValue.SyncActionMessageRange.$Properties|null)
			static encode(m: waproto.SyncActionValue.MarkChatAsReadAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MarkChatAsReadAction & waproto.SyncActionValue.MarkChatAsReadAction.$Shape
		}
		namespace MarkChatAsReadAction {
			interface $Properties {
				read?: (boolean|null)
				messageRange?: (waproto.SyncActionValue.SyncActionMessageRange.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.MarkChatAsReadAction.$Properties
		}
		interface IDeleteMessageForMeAction extends waproto.SyncActionValue.DeleteMessageForMeAction.$Properties {
		}
		class DeleteMessageForMeAction {
			constructor(p?: waproto.SyncActionValue.DeleteMessageForMeAction.$Properties)
			$unknowns?: Uint8Array[]
			deleteMedia?: (boolean|null)
			messageTimestamp?: (number|Long|null)
			static encode(m: waproto.SyncActionValue.DeleteMessageForMeAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.DeleteMessageForMeAction & waproto.SyncActionValue.DeleteMessageForMeAction.$Shape
		}
		namespace DeleteMessageForMeAction {
			interface $Properties {
				deleteMedia?: (boolean|null)
				messageTimestamp?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.DeleteMessageForMeAction.$Properties
		}
		interface IArchiveChatAction extends waproto.SyncActionValue.ArchiveChatAction.$Properties {
		}
		class ArchiveChatAction {
			constructor(p?: waproto.SyncActionValue.ArchiveChatAction.$Properties)
			$unknowns?: Uint8Array[]
			archived?: (boolean|null)
			messageRange?: (waproto.SyncActionValue.SyncActionMessageRange.$Properties|null)
			static encode(m: waproto.SyncActionValue.ArchiveChatAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ArchiveChatAction & waproto.SyncActionValue.ArchiveChatAction.$Shape
		}
		namespace ArchiveChatAction {
			interface $Properties {
				archived?: (boolean|null)
				messageRange?: (waproto.SyncActionValue.SyncActionMessageRange.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.ArchiveChatAction.$Properties
		}
		interface IRecentEmojiWeightsAction extends waproto.SyncActionValue.RecentEmojiWeightsAction.$Properties {
		}
		class RecentEmojiWeightsAction {
			constructor(p?: waproto.SyncActionValue.RecentEmojiWeightsAction.$Properties)
			$unknowns?: Uint8Array[]
			weights: waproto.RecentEmojiWeight.$Properties[]
			static encode(m: waproto.SyncActionValue.RecentEmojiWeightsAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.RecentEmojiWeightsAction & waproto.SyncActionValue.RecentEmojiWeightsAction.$Shape
		}
		namespace RecentEmojiWeightsAction {
			interface $Properties {
				weights?: (waproto.RecentEmojiWeight.$Properties[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.RecentEmojiWeightsAction.$Properties
		}
		interface ILabelEditAction extends waproto.SyncActionValue.LabelEditAction.$Properties {
		}
		class LabelEditAction {
			constructor(p?: waproto.SyncActionValue.LabelEditAction.$Properties)
			$unknowns?: Uint8Array[]
			name?: (string|null)
			color?: (number|null)
			predefinedId?: (number|null)
			deleted?: (boolean|null)
			orderIndex?: (number|null)
			isActive?: (boolean|null)
			type?: (waproto.SyncActionValue.LabelEditAction.ListType|null)
			isImmutable?: (boolean|null)
			muteEndTimeMs?: (number|Long|null)
			static encode(m: waproto.SyncActionValue.LabelEditAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.LabelEditAction & waproto.SyncActionValue.LabelEditAction.$Shape
		}
		namespace LabelEditAction {
			interface $Properties {
				name?: (string|null)
				color?: (number|null)
				predefinedId?: (number|null)
				deleted?: (boolean|null)
				orderIndex?: (number|null)
				isActive?: (boolean|null)
				type?: (waproto.SyncActionValue.LabelEditAction.ListType|null)
				isImmutable?: (boolean|null)
				muteEndTimeMs?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.LabelEditAction.$Properties
			enum ListType {
				NONE = 0,
				UNREAD = 1,
				GROUPS = 2,
				FAVORITES = 3,
				PREDEFINED = 4,
				CUSTOM = 5,
				COMMUNITY = 6,
				SERVER_ASSIGNED = 7,
				DRAFTED = 8,
				AI_HANDOFF = 9,
				CHANNELS = 10,
				AI_RESPONDING = 11,
				ARCHIVED = 12,
				LOCKED = 13,
				INVITES = 14,
				THIRD_PARTY = 15
			}
		}
		interface ILabelAssociationAction extends waproto.SyncActionValue.LabelAssociationAction.$Properties {
		}
		class LabelAssociationAction {
			constructor(p?: waproto.SyncActionValue.LabelAssociationAction.$Properties)
			$unknowns?: Uint8Array[]
			labeled?: (boolean|null)
			modelMetaData?: (string|null)
			static encode(m: waproto.SyncActionValue.LabelAssociationAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.LabelAssociationAction & waproto.SyncActionValue.LabelAssociationAction.$Shape
		}
		namespace LabelAssociationAction {
			interface $Properties {
				labeled?: (boolean|null)
				modelMetaData?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.LabelAssociationAction.$Properties
		}
		interface IQuickReplyAction extends waproto.SyncActionValue.QuickReplyAction.$Properties {
		}
		class QuickReplyAction {
			constructor(p?: waproto.SyncActionValue.QuickReplyAction.$Properties)
			$unknowns?: Uint8Array[]
			shortcut?: (string|null)
			message?: (string|null)
			keywords: string[]
			count?: (number|null)
			deleted?: (boolean|null)
			associatedLabelIds: string[]
			static encode(m: waproto.SyncActionValue.QuickReplyAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.QuickReplyAction & waproto.SyncActionValue.QuickReplyAction.$Shape
		}
		namespace QuickReplyAction {
			interface $Properties {
				shortcut?: (string|null)
				message?: (string|null)
				keywords?: (string[]|null)
				count?: (number|null)
				deleted?: (boolean|null)
				associatedLabelIds?: (string[]|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.QuickReplyAction.$Properties
		}
		interface ILocaleSetting extends waproto.SyncActionValue.LocaleSetting.$Properties {
		}
		class LocaleSetting {
			constructor(p?: waproto.SyncActionValue.LocaleSetting.$Properties)
			$unknowns?: Uint8Array[]
			locale?: (string|null)
			static encode(m: waproto.SyncActionValue.LocaleSetting.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.LocaleSetting & waproto.SyncActionValue.LocaleSetting.$Shape
		}
		namespace LocaleSetting {
			interface $Properties {
				locale?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.LocaleSetting.$Properties
		}
		interface IPushNameSetting extends waproto.SyncActionValue.PushNameSetting.$Properties {
		}
		class PushNameSetting {
			constructor(p?: waproto.SyncActionValue.PushNameSetting.$Properties)
			$unknowns?: Uint8Array[]
			name?: (string|null)
			static encode(m: waproto.SyncActionValue.PushNameSetting.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PushNameSetting & waproto.SyncActionValue.PushNameSetting.$Shape
		}
		namespace PushNameSetting {
			interface $Properties {
				name?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.PushNameSetting.$Properties
		}
		interface IPinAction extends waproto.SyncActionValue.PinAction.$Properties {
		}
		class PinAction {
			constructor(p?: waproto.SyncActionValue.PinAction.$Properties)
			$unknowns?: Uint8Array[]
			pinned?: (boolean|null)
			static encode(m: waproto.SyncActionValue.PinAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PinAction & waproto.SyncActionValue.PinAction.$Shape
		}
		namespace PinAction {
			interface $Properties {
				pinned?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.PinAction.$Properties
		}
		interface IMuteAction extends waproto.SyncActionValue.MuteAction.$Properties {
		}
		class MuteAction {
			constructor(p?: waproto.SyncActionValue.MuteAction.$Properties)
			$unknowns?: Uint8Array[]
			muted?: (boolean|null)
			muteEndTimestamp?: (number|Long|null)
			autoMuted?: (boolean|null)
			muteEveryoneMentionEndTimestamp?: (number|Long|null)
			static encode(m: waproto.SyncActionValue.MuteAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MuteAction & waproto.SyncActionValue.MuteAction.$Shape
		}
		namespace MuteAction {
			interface $Properties {
				muted?: (boolean|null)
				muteEndTimestamp?: (number|Long|null)
				autoMuted?: (boolean|null)
				muteEveryoneMentionEndTimestamp?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.MuteAction.$Properties
		}
		interface IContactAction extends waproto.SyncActionValue.ContactAction.$Properties {
		}
		class ContactAction {
			constructor(p?: waproto.SyncActionValue.ContactAction.$Properties)
			$unknowns?: Uint8Array[]
			fullName?: (string|null)
			firstName?: (string|null)
			lidJid?: (string|null)
			saveOnPrimaryAddressbook?: (boolean|null)
			pnJid?: (string|null)
			username?: (string|null)
			static encode(m: waproto.SyncActionValue.ContactAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ContactAction & waproto.SyncActionValue.ContactAction.$Shape
		}
		namespace ContactAction {
			interface $Properties {
				fullName?: (string|null)
				firstName?: (string|null)
				lidJid?: (string|null)
				saveOnPrimaryAddressbook?: (boolean|null)
				pnJid?: (string|null)
				username?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.ContactAction.$Properties
		}
		interface IStarAction extends waproto.SyncActionValue.StarAction.$Properties {
		}
		class StarAction {
			constructor(p?: waproto.SyncActionValue.StarAction.$Properties)
			$unknowns?: Uint8Array[]
			starred?: (boolean|null)
			static encode(m: waproto.SyncActionValue.StarAction.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.StarAction & waproto.SyncActionValue.StarAction.$Shape
		}
		namespace StarAction {
			interface $Properties {
				starred?: (boolean|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.SyncActionValue.StarAction.$Properties
		}
	}
	interface ISyncdIndex extends waproto.SyncdIndex.$Properties {
	}
	class SyncdIndex {
		constructor(p?: waproto.SyncdIndex.$Properties)
		$unknowns?: Uint8Array[]
		blob?: (Uint8Array|null)
		static encode(m: waproto.SyncdIndex.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdIndex & waproto.SyncdIndex.$Shape
	}
	namespace SyncdIndex {
		interface $Properties {
			blob?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SyncdIndex.$Properties
	}
	interface ISyncdMutation extends waproto.SyncdMutation.$Properties {
	}
	class SyncdMutation {
		constructor(p?: waproto.SyncdMutation.$Properties)
		$unknowns?: Uint8Array[]
		operation?: (waproto.SyncdMutation.SyncdOperation|null)
		record?: (waproto.SyncdRecord.$Properties|null)
		static encode(m: waproto.SyncdMutation.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdMutation & waproto.SyncdMutation.$Shape
	}
	namespace SyncdMutation {
		interface $Properties {
			operation?: (waproto.SyncdMutation.SyncdOperation|null)
			record?: (waproto.SyncdRecord.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SyncdMutation.$Properties
		enum SyncdOperation {
			SET = 0,
			REMOVE = 1
		}
	}
	interface ISyncdMutations extends waproto.SyncdMutations.$Properties {
	}
	class SyncdMutations {
		constructor(p?: waproto.SyncdMutations.$Properties)
		$unknowns?: Uint8Array[]
		mutations: waproto.SyncdMutation.$Properties[]
		static encode(m: waproto.SyncdMutations.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdMutations & waproto.SyncdMutations.$Shape
	}
	namespace SyncdMutations {
		interface $Properties {
			mutations?: (waproto.SyncdMutation.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SyncdMutations.$Properties
	}
	interface ISyncdPatch extends waproto.SyncdPatch.$Properties {
	}
	class SyncdPatch {
		constructor(p?: waproto.SyncdPatch.$Properties)
		$unknowns?: Uint8Array[]
		version?: (waproto.SyncdVersion.$Properties|null)
		mutations: waproto.SyncdMutation.$Properties[]
		externalMutations?: (waproto.ExternalBlobReference.$Properties|null)
		snapshotMac?: (Uint8Array|null)
		patchMac?: (Uint8Array|null)
		keyId?: (waproto.KeyId.$Properties|null)
		exitCode?: (waproto.ExitCode.$Properties|null)
		deviceIndex?: (number|null)
		clientDebugData?: (Uint8Array|null)
		static encode(m: waproto.SyncdPatch.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdPatch & waproto.SyncdPatch.$Shape
	}
	namespace SyncdPatch {
		interface $Properties {
			version?: (waproto.SyncdVersion.$Properties|null)
			mutations?: (waproto.SyncdMutation.$Properties[]|null)
			externalMutations?: (waproto.ExternalBlobReference.$Properties|null)
			snapshotMac?: (Uint8Array|null)
			patchMac?: (Uint8Array|null)
			keyId?: (waproto.KeyId.$Properties|null)
			exitCode?: (waproto.ExitCode.$Properties|null)
			deviceIndex?: (number|null)
			clientDebugData?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SyncdPatch.$Properties
	}
	interface ISyncdPlainTextRecord extends waproto.SyncdPlainTextRecord.$Properties {
	}
	class SyncdPlainTextRecord {
		constructor(p?: waproto.SyncdPlainTextRecord.$Properties)
		$unknowns?: Uint8Array[]
		value?: (waproto.SyncActionData.$Properties|null)
		keyId?: (Uint8Array|null)
		mac?: (Uint8Array|null)
		static encode(m: waproto.SyncdPlainTextRecord.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdPlainTextRecord & waproto.SyncdPlainTextRecord.$Shape
	}
	namespace SyncdPlainTextRecord {
		interface $Properties {
			value?: (waproto.SyncActionData.$Properties|null)
			keyId?: (Uint8Array|null)
			mac?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SyncdPlainTextRecord.$Properties
	}
	interface ISyncdRecord extends waproto.SyncdRecord.$Properties {
	}
	class SyncdRecord {
		constructor(p?: waproto.SyncdRecord.$Properties)
		$unknowns?: Uint8Array[]
		index?: (waproto.SyncdIndex.$Properties|null)
		value?: (waproto.SyncdValue.$Properties|null)
		keyId?: (waproto.KeyId.$Properties|null)
		static encode(m: waproto.SyncdRecord.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdRecord & waproto.SyncdRecord.$Shape
	}
	namespace SyncdRecord {
		interface $Properties {
			index?: (waproto.SyncdIndex.$Properties|null)
			value?: (waproto.SyncdValue.$Properties|null)
			keyId?: (waproto.KeyId.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SyncdRecord.$Properties
	}
	interface ISyncdSnapshot extends waproto.SyncdSnapshot.$Properties {
	}
	class SyncdSnapshot {
		constructor(p?: waproto.SyncdSnapshot.$Properties)
		$unknowns?: Uint8Array[]
		version?: (waproto.SyncdVersion.$Properties|null)
		records: waproto.SyncdRecord.$Properties[]
		mac?: (Uint8Array|null)
		keyId?: (waproto.KeyId.$Properties|null)
		static encode(m: waproto.SyncdSnapshot.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdSnapshot & waproto.SyncdSnapshot.$Shape
	}
	namespace SyncdSnapshot {
		interface $Properties {
			version?: (waproto.SyncdVersion.$Properties|null)
			records?: (waproto.SyncdRecord.$Properties[]|null)
			mac?: (Uint8Array|null)
			keyId?: (waproto.KeyId.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SyncdSnapshot.$Properties
	}
	interface ISyncdSnapshotRecovery extends waproto.SyncdSnapshotRecovery.$Properties {
	}
	class SyncdSnapshotRecovery {
		constructor(p?: waproto.SyncdSnapshotRecovery.$Properties)
		$unknowns?: Uint8Array[]
		version?: (waproto.SyncdVersion.$Properties|null)
		collectionName?: (string|null)
		mutationRecords: waproto.SyncdPlainTextRecord.$Properties[]
		collectionLthash?: (Uint8Array|null)
		static encode(m: waproto.SyncdSnapshotRecovery.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdSnapshotRecovery & waproto.SyncdSnapshotRecovery.$Shape
	}
	namespace SyncdSnapshotRecovery {
		interface $Properties {
			version?: (waproto.SyncdVersion.$Properties|null)
			collectionName?: (string|null)
			mutationRecords?: (waproto.SyncdPlainTextRecord.$Properties[]|null)
			collectionLthash?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SyncdSnapshotRecovery.$Properties
	}
	interface ISyncdValue extends waproto.SyncdValue.$Properties {
	}
	class SyncdValue {
		constructor(p?: waproto.SyncdValue.$Properties)
		$unknowns?: Uint8Array[]
		blob?: (Uint8Array|null)
		static encode(m: waproto.SyncdValue.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdValue & waproto.SyncdValue.$Shape
	}
	namespace SyncdValue {
		interface $Properties {
			blob?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SyncdValue.$Properties
	}
	interface ISyncdVersion extends waproto.SyncdVersion.$Properties {
	}
	class SyncdVersion {
		constructor(p?: waproto.SyncdVersion.$Properties)
		$unknowns?: Uint8Array[]
		version?: (number|Long|null)
		static encode(m: waproto.SyncdVersion.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdVersion & waproto.SyncdVersion.$Shape
	}
	namespace SyncdVersion {
		interface $Properties {
			version?: (number|Long|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.SyncdVersion.$Properties
	}
	interface ITapLinkAction extends waproto.TapLinkAction.$Properties {
	}
	class TapLinkAction {
		constructor(p?: waproto.TapLinkAction.$Properties)
		$unknowns?: Uint8Array[]
		title?: (string|null)
		tapUrl?: (string|null)
		static encode(m: waproto.TapLinkAction.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.TapLinkAction & waproto.TapLinkAction.$Shape
	}
	namespace TapLinkAction {
		interface $Properties {
			title?: (string|null)
			tapUrl?: (string|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.TapLinkAction.$Properties
	}
	interface ITemplateButton extends waproto.TemplateButton.$Properties {
	}
	class TemplateButton {
		constructor(p?: waproto.TemplateButton.$Properties)
		$unknowns?: Uint8Array[]
		quickReplyButton?: (waproto.TemplateButton.QuickReplyButton.$Properties|null)
		urlButton?: (waproto.TemplateButton.URLButton.$Properties|null)
		callButton?: (waproto.TemplateButton.CallButton.$Properties|null)
		index?: (number|null)
		static encode(m: waproto.TemplateButton.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.TemplateButton & waproto.TemplateButton.$Shape
	}
	namespace TemplateButton {
		interface $Properties {
			quickReplyButton?: (waproto.TemplateButton.QuickReplyButton.$Properties|null)
			urlButton?: (waproto.TemplateButton.URLButton.$Properties|null)
			callButton?: (waproto.TemplateButton.CallButton.$Properties|null)
			index?: (number|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.TemplateButton.$Properties
		interface ICallButton extends waproto.TemplateButton.CallButton.$Properties {
		}
		class CallButton {
			constructor(p?: waproto.TemplateButton.CallButton.$Properties)
			$unknowns?: Uint8Array[]
			displayText?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
			phoneNumber?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
			static encode(m: waproto.TemplateButton.CallButton.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.TemplateButton.CallButton & waproto.TemplateButton.CallButton.$Shape
		}
		namespace CallButton {
			interface $Properties {
				displayText?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
				phoneNumber?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.TemplateButton.CallButton.$Properties
		}
		interface IURLButton extends waproto.TemplateButton.URLButton.$Properties {
		}
		class URLButton {
			constructor(p?: waproto.TemplateButton.URLButton.$Properties)
			$unknowns?: Uint8Array[]
			displayText?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
			url?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
			static encode(m: waproto.TemplateButton.URLButton.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.TemplateButton.URLButton & waproto.TemplateButton.URLButton.$Shape
		}
		namespace URLButton {
			interface $Properties {
				displayText?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
				url?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.TemplateButton.URLButton.$Properties
		}
		interface IQuickReplyButton extends waproto.TemplateButton.QuickReplyButton.$Properties {
		}
		class QuickReplyButton {
			constructor(p?: waproto.TemplateButton.QuickReplyButton.$Properties)
			$unknowns?: Uint8Array[]
			displayText?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
			id?: (string|null)
			static encode(m: waproto.TemplateButton.QuickReplyButton.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.TemplateButton.QuickReplyButton & waproto.TemplateButton.QuickReplyButton.$Shape
		}
		namespace QuickReplyButton {
			interface $Properties {
				displayText?: (waproto.Message.HighlyStructuredMessage.$Properties|null)
				id?: (string|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.TemplateButton.QuickReplyButton.$Properties
		}
	}
	interface IThreadID extends waproto.ThreadID.$Properties {
	}
	class ThreadID {
		constructor(p?: waproto.ThreadID.$Properties)
		$unknowns?: Uint8Array[]
		threadType?: (waproto.ThreadID.ThreadType|null)
		threadKey?: (waproto.MessageKey.$Properties|null)
		static encode(m: waproto.ThreadID.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.ThreadID & waproto.ThreadID.$Shape
	}
	namespace ThreadID {
		interface $Properties {
			threadType?: (waproto.ThreadID.ThreadType|null)
			threadKey?: (waproto.MessageKey.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.ThreadID.$Properties
		enum ThreadType {
			UNKNOWN = 0,
			VIEW_REPLIES = 1,
			AI_THREAD = 2
		}
	}
	interface IUnCountedAssociatedMessageList extends waproto.UnCountedAssociatedMessageList.$Properties {
	}
	class UnCountedAssociatedMessageList {
		constructor(p?: waproto.UnCountedAssociatedMessageList.$Properties)
		$unknowns?: Uint8Array[]
		messages: waproto.WebMessageInfo.$Properties[]
		parentMessage?: (waproto.MessageKey.$Properties|null)
		associationType?: (waproto.MessageAssociation.AssociationType|null)
		static encode(m: waproto.UnCountedAssociatedMessageList.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.UnCountedAssociatedMessageList & waproto.UnCountedAssociatedMessageList.$Shape
	}
	namespace UnCountedAssociatedMessageList {
		interface $Properties {
			messages?: (waproto.WebMessageInfo.$Properties[]|null)
			parentMessage?: (waproto.MessageKey.$Properties|null)
			associationType?: (waproto.MessageAssociation.AssociationType|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.UnCountedAssociatedMessageList.$Properties
	}
	interface IUnCountedAssociatedMessageListWithMessageBytes extends waproto.UnCountedAssociatedMessageListWithMessageBytes.$Properties {
	}
	class UnCountedAssociatedMessageListWithMessageBytes {
		constructor(p?: waproto.UnCountedAssociatedMessageListWithMessageBytes.$Properties)
		$unknowns?: Uint8Array[]
		messages: waproto.WebMessageInfoWithMessageBytes.$Properties[]
		parentMessage?: (waproto.MessageKey.$Properties|null)
		static encode(m: waproto.UnCountedAssociatedMessageListWithMessageBytes.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.UnCountedAssociatedMessageListWithMessageBytes & waproto.UnCountedAssociatedMessageListWithMessageBytes.$Shape
	}
	namespace UnCountedAssociatedMessageListWithMessageBytes {
		interface $Properties {
			messages?: (waproto.WebMessageInfoWithMessageBytes.$Properties[]|null)
			parentMessage?: (waproto.MessageKey.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.UnCountedAssociatedMessageListWithMessageBytes.$Properties
	}
	interface IUrlTrackingMap extends waproto.UrlTrackingMap.$Properties {
	}
	class UrlTrackingMap {
		constructor(p?: waproto.UrlTrackingMap.$Properties)
		$unknowns?: Uint8Array[]
		urlTrackingMapElements: waproto.UrlTrackingMap.UrlTrackingMapElement.$Properties[]
		static encode(m: waproto.UrlTrackingMap.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.UrlTrackingMap & waproto.UrlTrackingMap.$Shape
	}
	namespace UrlTrackingMap {
		interface $Properties {
			urlTrackingMapElements?: (waproto.UrlTrackingMap.UrlTrackingMapElement.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.UrlTrackingMap.$Properties
		interface IUrlTrackingMapElement extends waproto.UrlTrackingMap.UrlTrackingMapElement.$Properties {
		}
		class UrlTrackingMapElement {
			constructor(p?: waproto.UrlTrackingMap.UrlTrackingMapElement.$Properties)
			$unknowns?: Uint8Array[]
			originalUrl?: (string|null)
			unconsentedUsersUrl?: (string|null)
			consentedUsersUrl?: (string|null)
			cardIndex?: (number|null)
			static encode(m: waproto.UrlTrackingMap.UrlTrackingMapElement.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.UrlTrackingMap.UrlTrackingMapElement & waproto.UrlTrackingMap.UrlTrackingMapElement.$Shape
		}
		namespace UrlTrackingMapElement {
			interface $Properties {
				originalUrl?: (string|null)
				unconsentedUsersUrl?: (string|null)
				consentedUsersUrl?: (string|null)
				cardIndex?: (number|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.UrlTrackingMap.UrlTrackingMapElement.$Properties
		}
	}
	interface IUserPassword extends waproto.UserPassword.$Properties {
	}
	class UserPassword {
		constructor(p?: waproto.UserPassword.$Properties)
		$unknowns?: Uint8Array[]
		encoding?: (waproto.UserPassword.Encoding|null)
		transformer?: (waproto.UserPassword.Transformer|null)
		transformerArg: waproto.UserPassword.TransformerArg.$Properties[]
		transformedData?: (Uint8Array|null)
		static encode(m: waproto.UserPassword.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.UserPassword & waproto.UserPassword.$Shape
	}
	namespace UserPassword {
		interface $Properties {
			encoding?: (waproto.UserPassword.Encoding|null)
			transformer?: (waproto.UserPassword.Transformer|null)
			transformerArg?: (waproto.UserPassword.TransformerArg.$Properties[]|null)
			transformedData?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.UserPassword.$Properties
		enum Transformer {
			NONE = 0,
			PBKDF2_HMAC_SHA512 = 1,
			PBKDF2_HMAC_SHA384 = 2
		}
		enum Encoding {
			UTF8 = 0,
			UTF8_BROKEN = 1
		}
		interface ITransformerArg extends waproto.UserPassword.TransformerArg.$Properties {
		}
		class TransformerArg {
			constructor(p?: waproto.UserPassword.TransformerArg.$Properties)
			$unknowns?: Uint8Array[]
			key?: (string|null)
			value?: (waproto.UserPassword.TransformerArg.Value.$Properties|null)
			static encode(m: waproto.UserPassword.TransformerArg.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.UserPassword.TransformerArg & waproto.UserPassword.TransformerArg.$Shape
		}
		namespace TransformerArg {
			interface $Properties {
				key?: (string|null)
				value?: (waproto.UserPassword.TransformerArg.Value.$Properties|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.UserPassword.TransformerArg.$Properties
			interface IValue extends waproto.UserPassword.TransformerArg.Value.$Properties {
			}
			class Value {
				constructor(p?: waproto.UserPassword.TransformerArg.Value.$Properties)
				$unknowns?: Uint8Array[]
				asBlob?: (Uint8Array|null)
				asUnsignedInteger?: (number|null)
				static encode(m: waproto.UserPassword.TransformerArg.Value.$Properties, w?: PbWriter): PbWriter
				static decode(r: (PbReader|Uint8Array), l?: number): waproto.UserPassword.TransformerArg.Value & waproto.UserPassword.TransformerArg.Value.$Shape
			}
			namespace Value {
				interface $Properties {
					asBlob?: (Uint8Array|null)
					asUnsignedInteger?: (number|null)
					$unknowns?: Uint8Array[]
				}
				type $Shape = waproto.UserPassword.TransformerArg.Value.$Properties
			}
		}
	}
	interface IUserReceipt extends waproto.UserReceipt.$Properties {
	}
	class UserReceipt {
		constructor(p?: waproto.UserReceipt.$Properties)
		$unknowns?: Uint8Array[]
		userJid?: (string|null)
		receiptTimestamp?: (number|Long|null)
		readTimestamp?: (number|Long|null)
		playedTimestamp?: (number|Long|null)
		pendingDeviceJid: string[]
		deliveredDeviceJid: string[]
		static encode(m: waproto.UserReceipt.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.UserReceipt & waproto.UserReceipt.$Shape
	}
	namespace UserReceipt {
		interface $Properties {
			userJid?: (string|null)
			receiptTimestamp?: (number|Long|null)
			readTimestamp?: (number|Long|null)
			playedTimestamp?: (number|Long|null)
			pendingDeviceJid?: (string[]|null)
			deliveredDeviceJid?: (string[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.UserReceipt.$Properties
	}
	interface IVerifiedNameCertificate extends waproto.VerifiedNameCertificate.$Properties {
	}
	class VerifiedNameCertificate {
		constructor(p?: waproto.VerifiedNameCertificate.$Properties)
		$unknowns?: Uint8Array[]
		details?: (Uint8Array|null)
		signature?: (Uint8Array|null)
		serverSignature?: (Uint8Array|null)
		static encode(m: waproto.VerifiedNameCertificate.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.VerifiedNameCertificate & waproto.VerifiedNameCertificate.$Shape
	}
	namespace VerifiedNameCertificate {
		interface $Properties {
			details?: (Uint8Array|null)
			signature?: (Uint8Array|null)
			serverSignature?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.VerifiedNameCertificate.$Properties
		interface IDetails extends waproto.VerifiedNameCertificate.Details.$Properties {
		}
		class Details {
			constructor(p?: waproto.VerifiedNameCertificate.Details.$Properties)
			$unknowns?: Uint8Array[]
			serial?: (number|Long|null)
			issuer?: (string|null)
			verifiedName?: (string|null)
			localizedNames: waproto.LocalizedName.$Properties[]
			issueTime?: (number|Long|null)
			static encode(m: waproto.VerifiedNameCertificate.Details.$Properties, w?: PbWriter): PbWriter
			static decode(r: (PbReader|Uint8Array), l?: number): waproto.VerifiedNameCertificate.Details & waproto.VerifiedNameCertificate.Details.$Shape
		}
		namespace Details {
			interface $Properties {
				serial?: (number|Long|null)
				issuer?: (string|null)
				verifiedName?: (string|null)
				localizedNames?: (waproto.LocalizedName.$Properties[]|null)
				issueTime?: (number|Long|null)
				$unknowns?: Uint8Array[]
			}
			type $Shape = waproto.VerifiedNameCertificate.Details.$Properties
		}
	}
	interface IVirtualDeviceOutput extends waproto.VirtualDeviceOutput.$Properties {
	}
	class VirtualDeviceOutput {
		constructor(p?: waproto.VirtualDeviceOutput.$Properties)
		$unknowns?: Uint8Array[]
		vdId?: (Uint8Array|null)
		vdPublicKey?: (Uint8Array|null)
		vdEpochStoragePublicKey?: (Uint8Array|null)
		vdEpochStoragePublicKeySig?: (Uint8Array|null)
		ocmfRotationToken?: (Uint8Array|null)
		deviceEpochHmac?: (Uint8Array|null)
		encryptedSecretValues?: (waproto.EncryptedSecretValuesOutput.$Properties|null)
		static encode(m: waproto.VirtualDeviceOutput.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.VirtualDeviceOutput & waproto.VirtualDeviceOutput.$Shape
	}
	namespace VirtualDeviceOutput {
		interface $Properties {
			vdId?: (Uint8Array|null)
			vdPublicKey?: (Uint8Array|null)
			vdEpochStoragePublicKey?: (Uint8Array|null)
			vdEpochStoragePublicKeySig?: (Uint8Array|null)
			ocmfRotationToken?: (Uint8Array|null)
			deviceEpochHmac?: (Uint8Array|null)
			encryptedSecretValues?: (waproto.EncryptedSecretValuesOutput.$Properties|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.VirtualDeviceOutput.$Properties
	}
	interface IWallpaperSettings extends waproto.WallpaperSettings.$Properties {
	}
	class WallpaperSettings {
		constructor(p?: waproto.WallpaperSettings.$Properties)
		$unknowns?: Uint8Array[]
		filename?: (string|null)
		opacity?: (number|null)
		isGenAi?: (boolean|null)
		static encode(m: waproto.WallpaperSettings.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.WallpaperSettings & waproto.WallpaperSettings.$Shape
	}
	namespace WallpaperSettings {
		interface $Properties {
			filename?: (string|null)
			opacity?: (number|null)
			isGenAi?: (boolean|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.WallpaperSettings.$Properties
	}
	interface IWebFeatures extends waproto.WebFeatures.$Properties {
	}
	class WebFeatures {
		constructor(p?: waproto.WebFeatures.$Properties)
		$unknowns?: Uint8Array[]
		labelsDisplay?: (waproto.WebFeatures.Flag|null)
		voipIndividualOutgoing?: (waproto.WebFeatures.Flag|null)
		groupsV3?: (waproto.WebFeatures.Flag|null)
		groupsV3Create?: (waproto.WebFeatures.Flag|null)
		changeNumberV2?: (waproto.WebFeatures.Flag|null)
		queryStatusV3Thumbnail?: (waproto.WebFeatures.Flag|null)
		liveLocations?: (waproto.WebFeatures.Flag|null)
		queryVname?: (waproto.WebFeatures.Flag|null)
		voipIndividualIncoming?: (waproto.WebFeatures.Flag|null)
		quickRepliesQuery?: (waproto.WebFeatures.Flag|null)
		payments?: (waproto.WebFeatures.Flag|null)
		stickerPackQuery?: (waproto.WebFeatures.Flag|null)
		liveLocationsFinal?: (waproto.WebFeatures.Flag|null)
		labelsEdit?: (waproto.WebFeatures.Flag|null)
		mediaUpload?: (waproto.WebFeatures.Flag|null)
		mediaUploadRichQuickReplies?: (waproto.WebFeatures.Flag|null)
		vnameV2?: (waproto.WebFeatures.Flag|null)
		videoPlaybackUrl?: (waproto.WebFeatures.Flag|null)
		statusRanking?: (waproto.WebFeatures.Flag|null)
		voipIndividualVideo?: (waproto.WebFeatures.Flag|null)
		thirdPartyStickers?: (waproto.WebFeatures.Flag|null)
		frequentlyForwardedSetting?: (waproto.WebFeatures.Flag|null)
		groupsV4JoinPermission?: (waproto.WebFeatures.Flag|null)
		recentStickers?: (waproto.WebFeatures.Flag|null)
		catalog?: (waproto.WebFeatures.Flag|null)
		starredStickers?: (waproto.WebFeatures.Flag|null)
		voipGroupCall?: (waproto.WebFeatures.Flag|null)
		templateMessage?: (waproto.WebFeatures.Flag|null)
		templateMessageInteractivity?: (waproto.WebFeatures.Flag|null)
		ephemeralMessages?: (waproto.WebFeatures.Flag|null)
		e2ENotificationSync?: (waproto.WebFeatures.Flag|null)
		recentStickersV2?: (waproto.WebFeatures.Flag|null)
		recentStickersV3?: (waproto.WebFeatures.Flag|null)
		userNotice?: (waproto.WebFeatures.Flag|null)
		support?: (waproto.WebFeatures.Flag|null)
		groupUiiCleanup?: (waproto.WebFeatures.Flag|null)
		groupDogfoodingInternalOnly?: (waproto.WebFeatures.Flag|null)
		settingsSync?: (waproto.WebFeatures.Flag|null)
		archiveV2?: (waproto.WebFeatures.Flag|null)
		ephemeralAllowGroupMembers?: (waproto.WebFeatures.Flag|null)
		ephemeral24HDuration?: (waproto.WebFeatures.Flag|null)
		mdForceUpgrade?: (waproto.WebFeatures.Flag|null)
		disappearingMode?: (waproto.WebFeatures.Flag|null)
		externalMdOptInAvailable?: (waproto.WebFeatures.Flag|null)
		noDeleteMessageTimeLimit?: (waproto.WebFeatures.Flag|null)
		static encode(m: waproto.WebFeatures.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.WebFeatures & waproto.WebFeatures.$Shape
	}
	namespace WebFeatures {
		interface $Properties {
			labelsDisplay?: (waproto.WebFeatures.Flag|null)
			voipIndividualOutgoing?: (waproto.WebFeatures.Flag|null)
			groupsV3?: (waproto.WebFeatures.Flag|null)
			groupsV3Create?: (waproto.WebFeatures.Flag|null)
			changeNumberV2?: (waproto.WebFeatures.Flag|null)
			queryStatusV3Thumbnail?: (waproto.WebFeatures.Flag|null)
			liveLocations?: (waproto.WebFeatures.Flag|null)
			queryVname?: (waproto.WebFeatures.Flag|null)
			voipIndividualIncoming?: (waproto.WebFeatures.Flag|null)
			quickRepliesQuery?: (waproto.WebFeatures.Flag|null)
			payments?: (waproto.WebFeatures.Flag|null)
			stickerPackQuery?: (waproto.WebFeatures.Flag|null)
			liveLocationsFinal?: (waproto.WebFeatures.Flag|null)
			labelsEdit?: (waproto.WebFeatures.Flag|null)
			mediaUpload?: (waproto.WebFeatures.Flag|null)
			mediaUploadRichQuickReplies?: (waproto.WebFeatures.Flag|null)
			vnameV2?: (waproto.WebFeatures.Flag|null)
			videoPlaybackUrl?: (waproto.WebFeatures.Flag|null)
			statusRanking?: (waproto.WebFeatures.Flag|null)
			voipIndividualVideo?: (waproto.WebFeatures.Flag|null)
			thirdPartyStickers?: (waproto.WebFeatures.Flag|null)
			frequentlyForwardedSetting?: (waproto.WebFeatures.Flag|null)
			groupsV4JoinPermission?: (waproto.WebFeatures.Flag|null)
			recentStickers?: (waproto.WebFeatures.Flag|null)
			catalog?: (waproto.WebFeatures.Flag|null)
			starredStickers?: (waproto.WebFeatures.Flag|null)
			voipGroupCall?: (waproto.WebFeatures.Flag|null)
			templateMessage?: (waproto.WebFeatures.Flag|null)
			templateMessageInteractivity?: (waproto.WebFeatures.Flag|null)
			ephemeralMessages?: (waproto.WebFeatures.Flag|null)
			e2ENotificationSync?: (waproto.WebFeatures.Flag|null)
			recentStickersV2?: (waproto.WebFeatures.Flag|null)
			recentStickersV3?: (waproto.WebFeatures.Flag|null)
			userNotice?: (waproto.WebFeatures.Flag|null)
			support?: (waproto.WebFeatures.Flag|null)
			groupUiiCleanup?: (waproto.WebFeatures.Flag|null)
			groupDogfoodingInternalOnly?: (waproto.WebFeatures.Flag|null)
			settingsSync?: (waproto.WebFeatures.Flag|null)
			archiveV2?: (waproto.WebFeatures.Flag|null)
			ephemeralAllowGroupMembers?: (waproto.WebFeatures.Flag|null)
			ephemeral24HDuration?: (waproto.WebFeatures.Flag|null)
			mdForceUpgrade?: (waproto.WebFeatures.Flag|null)
			disappearingMode?: (waproto.WebFeatures.Flag|null)
			externalMdOptInAvailable?: (waproto.WebFeatures.Flag|null)
			noDeleteMessageTimeLimit?: (waproto.WebFeatures.Flag|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.WebFeatures.$Properties
		enum Flag {
			NOT_STARTED = 0,
			FORCE_UPGRADE = 1,
			DEVELOPMENT = 2,
			PRODUCTION = 3
		}
	}
	interface IWebMessageInfo extends waproto.WebMessageInfo.$Properties {
	}
	class WebMessageInfo {
		constructor(p?: waproto.WebMessageInfo.$Properties)
		$unknowns?: Uint8Array[]
		key?: (waproto.MessageKey.$Properties|null)
		message?: (waproto.Message.$Properties|null)
		messageTimestamp?: (number|Long|null)
		status?: (waproto.WebMessageInfo.Status|null)
		participant?: (string|null)
		messageC2STimestamp?: (number|Long|null)
		ignore?: (boolean|null)
		starred?: (boolean|null)
		broadcast?: (boolean|null)
		pushName?: (string|null)
		mediaCiphertextSha256?: (Uint8Array|null)
		multicast?: (boolean|null)
		urlText?: (boolean|null)
		urlNumber?: (boolean|null)
		messageStubType?: (waproto.WebMessageInfo.StubType|null)
		clearMedia?: (boolean|null)
		messageStubParameters: string[]
		duration?: (number|null)
		labels: string[]
		paymentInfo?: (waproto.PaymentInfo.$Properties|null)
		finalLiveLocation?: (waproto.Message.LiveLocationMessage.$Properties|null)
		quotedPaymentInfo?: (waproto.PaymentInfo.$Properties|null)
		ephemeralStartTimestamp?: (number|Long|null)
		ephemeralDuration?: (number|null)
		ephemeralOffToOn?: (boolean|null)
		ephemeralOutOfSync?: (boolean|null)
		bizPrivacyStatus?: (waproto.WebMessageInfo.BizPrivacyStatus|null)
		verifiedBizName?: (string|null)
		mediaData?: (waproto.MediaData.$Properties|null)
		photoChange?: (waproto.PhotoChange.$Properties|null)
		userReceipt: waproto.UserReceipt.$Properties[]
		reactions: waproto.Reaction.$Properties[]
		quotedStickerData?: (waproto.MediaData.$Properties|null)
		futureproofData?: (Uint8Array|null)
		statusPsa?: (waproto.StatusPSA.$Properties|null)
		pollUpdates: waproto.PollUpdate.$Properties[]
		pollAdditionalMetadata?: (waproto.PollAdditionalMetadata.$Properties|null)
		agentId?: (string|null)
		statusAlreadyViewed?: (boolean|null)
		messageSecret?: (Uint8Array|null)
		keepInChat?: (waproto.KeepInChat.$Properties|null)
		originalSelfAuthorUserJidString?: (string|null)
		revokeMessageTimestamp?: (number|Long|null)
		pinInChat?: (waproto.PinInChat.$Properties|null)
		premiumMessageInfo?: (waproto.PremiumMessageInfo.$Properties|null)
		is1PBizBotMessage?: (boolean|null)
		isGroupHistoryMessage?: (boolean|null)
		botMessageInvokerJid?: (string|null)
		commentMetadata?: (waproto.CommentMetadata.$Properties|null)
		eventResponses: waproto.EventResponse.$Properties[]
		reportingTokenInfo?: (waproto.ReportingTokenInfo.$Properties|null)
		newsletterServerId?: (number|Long|null)
		eventAdditionalMetadata?: (waproto.EventAdditionalMetadata.$Properties|null)
		isMentionedInStatus?: (boolean|null)
		statusMentions: string[]
		targetMessageId?: (waproto.MessageKey.$Properties|null)
		messageAddOns: waproto.MessageAddOn.$Properties[]
		statusMentionMessageInfo?: (waproto.StatusMentionMessage.$Properties|null)
		isSupportAiMessage?: (boolean|null)
		statusMentionSources: string[]
		supportAiCitations: waproto.Citation.$Properties[]
		botTargetId?: (string|null)
		groupHistoryIndividualMessageInfo?: (waproto.GroupHistoryIndividualMessageInfo.$Properties|null)
		groupHistoryBundleInfo?: (waproto.GroupHistoryBundleInfo.$Properties|null)
		interactiveMessageAdditionalMetadata?: (waproto.InteractiveMessageAdditionalMetadata.$Properties|null)
		quarantinedMessage?: (waproto.QuarantinedMessage.$Properties|null)
		nonJidMentions?: (number|null)
		hsmTag?: (string|null)
		ephemeralExpirationTimestamp?: (number|Long|null)
		scheduledMessageMetadata?: (waproto.ScheduledMessageMetadata.$Properties|null)
		decisionId?: (string|null)
		decisionSources: string[]
		static encode(m: waproto.WebMessageInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.WebMessageInfo & waproto.WebMessageInfo.$Shape
	}
	namespace WebMessageInfo {
		interface $Properties {
			key?: (waproto.MessageKey.$Properties|null)
			message?: (waproto.Message.$Properties|null)
			messageTimestamp?: (number|Long|null)
			status?: (waproto.WebMessageInfo.Status|null)
			participant?: (string|null)
			messageC2STimestamp?: (number|Long|null)
			ignore?: (boolean|null)
			starred?: (boolean|null)
			broadcast?: (boolean|null)
			pushName?: (string|null)
			mediaCiphertextSha256?: (Uint8Array|null)
			multicast?: (boolean|null)
			urlText?: (boolean|null)
			urlNumber?: (boolean|null)
			messageStubType?: (waproto.WebMessageInfo.StubType|null)
			clearMedia?: (boolean|null)
			messageStubParameters?: (string[]|null)
			duration?: (number|null)
			labels?: (string[]|null)
			paymentInfo?: (waproto.PaymentInfo.$Properties|null)
			finalLiveLocation?: (waproto.Message.LiveLocationMessage.$Properties|null)
			quotedPaymentInfo?: (waproto.PaymentInfo.$Properties|null)
			ephemeralStartTimestamp?: (number|Long|null)
			ephemeralDuration?: (number|null)
			ephemeralOffToOn?: (boolean|null)
			ephemeralOutOfSync?: (boolean|null)
			bizPrivacyStatus?: (waproto.WebMessageInfo.BizPrivacyStatus|null)
			verifiedBizName?: (string|null)
			mediaData?: (waproto.MediaData.$Properties|null)
			photoChange?: (waproto.PhotoChange.$Properties|null)
			userReceipt?: (waproto.UserReceipt.$Properties[]|null)
			reactions?: (waproto.Reaction.$Properties[]|null)
			quotedStickerData?: (waproto.MediaData.$Properties|null)
			futureproofData?: (Uint8Array|null)
			statusPsa?: (waproto.StatusPSA.$Properties|null)
			pollUpdates?: (waproto.PollUpdate.$Properties[]|null)
			pollAdditionalMetadata?: (waproto.PollAdditionalMetadata.$Properties|null)
			agentId?: (string|null)
			statusAlreadyViewed?: (boolean|null)
			messageSecret?: (Uint8Array|null)
			keepInChat?: (waproto.KeepInChat.$Properties|null)
			originalSelfAuthorUserJidString?: (string|null)
			revokeMessageTimestamp?: (number|Long|null)
			pinInChat?: (waproto.PinInChat.$Properties|null)
			premiumMessageInfo?: (waproto.PremiumMessageInfo.$Properties|null)
			is1PBizBotMessage?: (boolean|null)
			isGroupHistoryMessage?: (boolean|null)
			botMessageInvokerJid?: (string|null)
			commentMetadata?: (waproto.CommentMetadata.$Properties|null)
			eventResponses?: (waproto.EventResponse.$Properties[]|null)
			reportingTokenInfo?: (waproto.ReportingTokenInfo.$Properties|null)
			newsletterServerId?: (number|Long|null)
			eventAdditionalMetadata?: (waproto.EventAdditionalMetadata.$Properties|null)
			isMentionedInStatus?: (boolean|null)
			statusMentions?: (string[]|null)
			targetMessageId?: (waproto.MessageKey.$Properties|null)
			messageAddOns?: (waproto.MessageAddOn.$Properties[]|null)
			statusMentionMessageInfo?: (waproto.StatusMentionMessage.$Properties|null)
			isSupportAiMessage?: (boolean|null)
			statusMentionSources?: (string[]|null)
			supportAiCitations?: (waproto.Citation.$Properties[]|null)
			botTargetId?: (string|null)
			groupHistoryIndividualMessageInfo?: (waproto.GroupHistoryIndividualMessageInfo.$Properties|null)
			groupHistoryBundleInfo?: (waproto.GroupHistoryBundleInfo.$Properties|null)
			interactiveMessageAdditionalMetadata?: (waproto.InteractiveMessageAdditionalMetadata.$Properties|null)
			quarantinedMessage?: (waproto.QuarantinedMessage.$Properties|null)
			nonJidMentions?: (number|null)
			hsmTag?: (string|null)
			ephemeralExpirationTimestamp?: (number|Long|null)
			scheduledMessageMetadata?: (waproto.ScheduledMessageMetadata.$Properties|null)
			decisionId?: (string|null)
			decisionSources?: (string[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.WebMessageInfo.$Properties
		enum BizPrivacyStatus {
			E2EE = 0,
			BSP = 1,
			FB = 2,
			BSP_AND_FB = 3
		}
		enum StubType {
			UNKNOWN = 0,
			REVOKE = 1,
			CIPHERTEXT = 2,
			FUTUREPROOF = 3,
			NON_VERIFIED_TRANSITION = 4,
			UNVERIFIED_TRANSITION = 5,
			VERIFIED_TRANSITION = 6,
			VERIFIED_LOW_UNKNOWN = 7,
			VERIFIED_HIGH = 8,
			VERIFIED_INITIAL_UNKNOWN = 9,
			VERIFIED_INITIAL_LOW = 10,
			VERIFIED_INITIAL_HIGH = 11,
			VERIFIED_TRANSITION_ANY_TO_NONE = 12,
			VERIFIED_TRANSITION_ANY_TO_HIGH = 13,
			VERIFIED_TRANSITION_HIGH_TO_LOW = 14,
			VERIFIED_TRANSITION_HIGH_TO_UNKNOWN = 15,
			VERIFIED_TRANSITION_UNKNOWN_TO_LOW = 16,
			VERIFIED_TRANSITION_LOW_TO_UNKNOWN = 17,
			VERIFIED_TRANSITION_NONE_TO_LOW = 18,
			VERIFIED_TRANSITION_NONE_TO_UNKNOWN = 19,
			GROUP_CREATE = 20,
			GROUP_CHANGE_SUBJECT = 21,
			GROUP_CHANGE_ICON = 22,
			GROUP_CHANGE_INVITE_LINK = 23,
			GROUP_CHANGE_DESCRIPTION = 24,
			GROUP_CHANGE_RESTRICT = 25,
			GROUP_CHANGE_ANNOUNCE = 26,
			GROUP_PARTICIPANT_ADD = 27,
			GROUP_PARTICIPANT_REMOVE = 28,
			GROUP_PARTICIPANT_PROMOTE = 29,
			GROUP_PARTICIPANT_DEMOTE = 30,
			GROUP_PARTICIPANT_INVITE = 31,
			GROUP_PARTICIPANT_LEAVE = 32,
			GROUP_PARTICIPANT_CHANGE_NUMBER = 33,
			BROADCAST_CREATE = 34,
			BROADCAST_ADD = 35,
			BROADCAST_REMOVE = 36,
			GENERIC_NOTIFICATION = 37,
			E2E_IDENTITY_CHANGED = 38,
			E2E_ENCRYPTED = 39,
			CALL_MISSED_VOICE = 40,
			CALL_MISSED_VIDEO = 41,
			INDIVIDUAL_CHANGE_NUMBER = 42,
			GROUP_DELETE = 43,
			GROUP_ANNOUNCE_MODE_MESSAGE_BOUNCE = 44,
			CALL_MISSED_GROUP_VOICE = 45,
			CALL_MISSED_GROUP_VIDEO = 46,
			PAYMENT_CIPHERTEXT = 47,
			PAYMENT_FUTUREPROOF = 48,
			PAYMENT_TRANSACTION_STATUS_UPDATE_FAILED = 49,
			PAYMENT_TRANSACTION_STATUS_UPDATE_REFUNDED = 50,
			PAYMENT_TRANSACTION_STATUS_UPDATE_REFUND_FAILED = 51,
			PAYMENT_TRANSACTION_STATUS_RECEIVER_PENDING_SETUP = 52,
			PAYMENT_TRANSACTION_STATUS_RECEIVER_SUCCESS_AFTER_HICCUP = 53,
			PAYMENT_ACTION_ACCOUNT_SETUP_REMINDER = 54,
			PAYMENT_ACTION_SEND_PAYMENT_REMINDER = 55,
			PAYMENT_ACTION_SEND_PAYMENT_INVITATION = 56,
			PAYMENT_ACTION_REQUEST_DECLINED = 57,
			PAYMENT_ACTION_REQUEST_EXPIRED = 58,
			PAYMENT_ACTION_REQUEST_CANCELLED = 59,
			BIZ_VERIFIED_TRANSITION_TOP_TO_BOTTOM = 60,
			BIZ_VERIFIED_TRANSITION_BOTTOM_TO_TOP = 61,
			BIZ_INTRO_TOP = 62,
			BIZ_INTRO_BOTTOM = 63,
			BIZ_NAME_CHANGE = 64,
			BIZ_MOVE_TO_CONSUMER_APP = 65,
			BIZ_TWO_TIER_MIGRATION_TOP = 66,
			BIZ_TWO_TIER_MIGRATION_BOTTOM = 67,
			OVERSIZED = 68,
			GROUP_CHANGE_NO_FREQUENTLY_FORWARDED = 69,
			GROUP_V4_ADD_INVITE_SENT = 70,
			GROUP_PARTICIPANT_ADD_REQUEST_JOIN = 71,
			CHANGE_EPHEMERAL_SETTING = 72,
			E2E_DEVICE_CHANGED = 73,
			VIEWED_ONCE = 74,
			E2E_ENCRYPTED_NOW = 75,
			BLUE_MSG_BSP_FB_TO_BSP_PREMISE = 76,
			BLUE_MSG_BSP_FB_TO_SELF_FB = 77,
			BLUE_MSG_BSP_FB_TO_SELF_PREMISE = 78,
			BLUE_MSG_BSP_FB_UNVERIFIED = 79,
			BLUE_MSG_BSP_FB_UNVERIFIED_TO_SELF_PREMISE_VERIFIED = 80,
			BLUE_MSG_BSP_FB_VERIFIED = 81,
			BLUE_MSG_BSP_FB_VERIFIED_TO_SELF_PREMISE_UNVERIFIED = 82,
			BLUE_MSG_BSP_PREMISE_TO_SELF_PREMISE = 83,
			BLUE_MSG_BSP_PREMISE_UNVERIFIED = 84,
			BLUE_MSG_BSP_PREMISE_UNVERIFIED_TO_SELF_PREMISE_VERIFIED = 85,
			BLUE_MSG_BSP_PREMISE_VERIFIED = 86,
			BLUE_MSG_BSP_PREMISE_VERIFIED_TO_SELF_PREMISE_UNVERIFIED = 87,
			BLUE_MSG_CONSUMER_TO_BSP_FB_UNVERIFIED = 88,
			BLUE_MSG_CONSUMER_TO_BSP_PREMISE_UNVERIFIED = 89,
			BLUE_MSG_CONSUMER_TO_SELF_FB_UNVERIFIED = 90,
			BLUE_MSG_CONSUMER_TO_SELF_PREMISE_UNVERIFIED = 91,
			BLUE_MSG_SELF_FB_TO_BSP_PREMISE = 92,
			BLUE_MSG_SELF_FB_TO_SELF_PREMISE = 93,
			BLUE_MSG_SELF_FB_UNVERIFIED = 94,
			BLUE_MSG_SELF_FB_UNVERIFIED_TO_SELF_PREMISE_VERIFIED = 95,
			BLUE_MSG_SELF_FB_VERIFIED = 96,
			BLUE_MSG_SELF_FB_VERIFIED_TO_SELF_PREMISE_UNVERIFIED = 97,
			BLUE_MSG_SELF_PREMISE_TO_BSP_PREMISE = 98,
			BLUE_MSG_SELF_PREMISE_UNVERIFIED = 99,
			BLUE_MSG_SELF_PREMISE_VERIFIED = 100,
			BLUE_MSG_TO_BSP_FB = 101,
			BLUE_MSG_TO_CONSUMER = 102,
			BLUE_MSG_TO_SELF_FB = 103,
			BLUE_MSG_UNVERIFIED_TO_BSP_FB_VERIFIED = 104,
			BLUE_MSG_UNVERIFIED_TO_BSP_PREMISE_VERIFIED = 105,
			BLUE_MSG_UNVERIFIED_TO_SELF_FB_VERIFIED = 106,
			BLUE_MSG_UNVERIFIED_TO_VERIFIED = 107,
			BLUE_MSG_VERIFIED_TO_BSP_FB_UNVERIFIED = 108,
			BLUE_MSG_VERIFIED_TO_BSP_PREMISE_UNVERIFIED = 109,
			BLUE_MSG_VERIFIED_TO_SELF_FB_UNVERIFIED = 110,
			BLUE_MSG_VERIFIED_TO_UNVERIFIED = 111,
			BLUE_MSG_BSP_FB_UNVERIFIED_TO_BSP_PREMISE_VERIFIED = 112,
			BLUE_MSG_BSP_FB_UNVERIFIED_TO_SELF_FB_VERIFIED = 113,
			BLUE_MSG_BSP_FB_VERIFIED_TO_BSP_PREMISE_UNVERIFIED = 114,
			BLUE_MSG_BSP_FB_VERIFIED_TO_SELF_FB_UNVERIFIED = 115,
			BLUE_MSG_SELF_FB_UNVERIFIED_TO_BSP_PREMISE_VERIFIED = 116,
			BLUE_MSG_SELF_FB_VERIFIED_TO_BSP_PREMISE_UNVERIFIED = 117,
			E2E_IDENTITY_UNAVAILABLE = 118,
			GROUP_CREATING = 119,
			GROUP_CREATE_FAILED = 120,
			GROUP_BOUNCED = 121,
			BLOCK_CONTACT = 122,
			EPHEMERAL_SETTING_NOT_APPLIED = 123,
			SYNC_FAILED = 124,
			SYNCING = 125,
			BIZ_PRIVACY_MODE_INIT_FB = 126,
			BIZ_PRIVACY_MODE_INIT_BSP = 127,
			BIZ_PRIVACY_MODE_TO_FB = 128,
			BIZ_PRIVACY_MODE_TO_BSP = 129,
			DISAPPEARING_MODE = 130,
			E2E_DEVICE_FETCH_FAILED = 131,
			ADMIN_REVOKE = 132,
			GROUP_INVITE_LINK_GROWTH_LOCKED = 133,
			COMMUNITY_LINK_PARENT_GROUP = 134,
			COMMUNITY_LINK_SIBLING_GROUP = 135,
			COMMUNITY_LINK_SUB_GROUP = 136,
			COMMUNITY_UNLINK_PARENT_GROUP = 137,
			COMMUNITY_UNLINK_SIBLING_GROUP = 138,
			COMMUNITY_UNLINK_SUB_GROUP = 139,
			GROUP_PARTICIPANT_ACCEPT = 140,
			GROUP_PARTICIPANT_LINKED_GROUP_JOIN = 141,
			COMMUNITY_CREATE = 142,
			EPHEMERAL_KEEP_IN_CHAT = 143,
			GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST = 144,
			GROUP_MEMBERSHIP_JOIN_APPROVAL_MODE = 145,
			INTEGRITY_UNLINK_PARENT_GROUP = 146,
			COMMUNITY_PARTICIPANT_PROMOTE = 147,
			COMMUNITY_PARTICIPANT_DEMOTE = 148,
			COMMUNITY_PARENT_GROUP_DELETED = 149,
			COMMUNITY_LINK_PARENT_GROUP_MEMBERSHIP_APPROVAL = 150,
			GROUP_PARTICIPANT_JOINED_GROUP_AND_PARENT_GROUP = 151,
			MASKED_THREAD_CREATED = 152,
			MASKED_THREAD_UNMASKED = 153,
			BIZ_CHAT_ASSIGNMENT = 154,
			CHAT_PSA = 155,
			CHAT_POLL_CREATION_MESSAGE = 156,
			CAG_MASKED_THREAD_CREATED = 157,
			COMMUNITY_PARENT_GROUP_SUBJECT_CHANGED = 158,
			CAG_INVITE_AUTO_ADD = 159,
			BIZ_CHAT_ASSIGNMENT_UNASSIGN = 160,
			CAG_INVITE_AUTO_JOINED = 161,
			SCHEDULED_CALL_START_MESSAGE = 162,
			COMMUNITY_INVITE_RICH = 163,
			COMMUNITY_INVITE_AUTO_ADD_RICH = 164,
			SUB_GROUP_INVITE_RICH = 165,
			SUB_GROUP_PARTICIPANT_ADD_RICH = 166,
			COMMUNITY_LINK_PARENT_GROUP_RICH = 167,
			COMMUNITY_PARTICIPANT_ADD_RICH = 168,
			SILENCED_UNKNOWN_CALLER_AUDIO = 169,
			SILENCED_UNKNOWN_CALLER_VIDEO = 170,
			GROUP_MEMBER_ADD_MODE = 171,
			GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD = 172,
			COMMUNITY_CHANGE_DESCRIPTION = 173,
			SENDER_INVITE = 174,
			RECEIVER_INVITE = 175,
			COMMUNITY_ALLOW_MEMBER_ADDED_GROUPS = 176,
			PINNED_MESSAGE_IN_CHAT = 177,
			PAYMENT_INVITE_SETUP_INVITER = 178,
			PAYMENT_INVITE_SETUP_INVITEE_RECEIVE_ONLY = 179,
			PAYMENT_INVITE_SETUP_INVITEE_SEND_AND_RECEIVE = 180,
			LINKED_GROUP_CALL_START = 181,
			REPORT_TO_ADMIN_ENABLED_STATUS = 182,
			EMPTY_SUBGROUP_CREATE = 183,
			SCHEDULED_CALL_CANCEL = 184,
			SUBGROUP_ADMIN_TRIGGERED_AUTO_ADD_RICH = 185,
			GROUP_CHANGE_RECENT_HISTORY_SHARING = 186,
			PAID_MESSAGE_SERVER_CAMPAIGN_ID = 187,
			GENERAL_CHAT_CREATE = 188,
			GENERAL_CHAT_ADD = 189,
			GENERAL_CHAT_AUTO_ADD_DISABLED = 190,
			SUGGESTED_SUBGROUP_ANNOUNCE = 191,
			BIZ_BOT_1P_MESSAGING_ENABLED = 192,
			CHANGE_USERNAME = 193,
			BIZ_COEX_PRIVACY_INIT_SELF = 194,
			BIZ_COEX_PRIVACY_TRANSITION_SELF = 195,
			SUPPORT_AI_EDUCATION = 196,
			BIZ_BOT_3P_MESSAGING_ENABLED = 197,
			REMINDER_SETUP_MESSAGE = 198,
			REMINDER_SENT_MESSAGE = 199,
			REMINDER_CANCEL_MESSAGE = 200,
			BIZ_COEX_PRIVACY_INIT = 201,
			BIZ_COEX_PRIVACY_TRANSITION = 202,
			GROUP_DEACTIVATED = 203,
			COMMUNITY_DEACTIVATE_SIBLING_GROUP = 204,
			EVENT_UPDATED = 205,
			EVENT_CANCELED = 206,
			COMMUNITY_OWNER_UPDATED = 207,
			COMMUNITY_SUB_GROUP_VISIBILITY_HIDDEN = 208,
			CAPI_GROUP_NE2EE_SYSTEM_MESSAGE = 209,
			STATUS_MENTION = 210,
			USER_CONTROLS_SYSTEM_MESSAGE = 211,
			SUPPORT_SYSTEM_MESSAGE = 212,
			CHANGE_LID = 213,
			BIZ_CUSTOMER_3PD_DATA_SHARING_OPT_IN_MESSAGE = 214,
			BIZ_CUSTOMER_3PD_DATA_SHARING_OPT_OUT_MESSAGE = 215,
			CHANGE_LIMIT_SHARING = 216,
			GROUP_MEMBER_LINK_MODE = 217,
			BIZ_AUTOMATICALLY_LABELED_CHAT_SYSTEM_MESSAGE = 218,
			PHONE_NUMBER_HIDING_CHAT_DEPRECATED_MESSAGE = 219,
			QUARANTINED_MESSAGE = 220,
			GROUP_MEMBER_SHARE_GROUP_HISTORY_MODE = 221,
			GROUP_OPEN_BOT_ADDED = 222,
			GROUP_TEE_BOT_ADDED = 223,
			CONTACT_INFO = 224,
			SCHEDULED_MESSAGE_CREATED = 225,
			IDENTITY_TRUST_MARKED = 226,
			IDENTITY_TRUST_UNMARKED = 227,
			IDENTITY_TRUST_REVOKED = 228,
			CTWA_CONSUMER_DISCLOSURE = 230
		}
		enum Status {
			ERROR = 0,
			PENDING = 1,
			SERVER_ACK = 2,
			DELIVERY_ACK = 3,
			READ = 4,
			PLAYED = 5
		}
	}
	interface IWebMessageInfoWithMessageBytes extends waproto.WebMessageInfoWithMessageBytes.$Properties {
	}
	class WebMessageInfoWithMessageBytes {
		constructor(p?: waproto.WebMessageInfoWithMessageBytes.$Properties)
		$unknowns?: Uint8Array[]
		key?: (waproto.MessageKey.$Properties|null)
		messageBytes?: (Uint8Array|null)
		static encode(m: waproto.WebMessageInfoWithMessageBytes.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.WebMessageInfoWithMessageBytes & waproto.WebMessageInfoWithMessageBytes.$Shape
	}
	namespace WebMessageInfoWithMessageBytes {
		interface $Properties {
			key?: (waproto.MessageKey.$Properties|null)
			messageBytes?: (Uint8Array|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.WebMessageInfoWithMessageBytes.$Properties
	}
	interface IWebNotificationsInfo extends waproto.WebNotificationsInfo.$Properties {
	}
	class WebNotificationsInfo {
		constructor(p?: waproto.WebNotificationsInfo.$Properties)
		$unknowns?: Uint8Array[]
		timestamp?: (number|Long|null)
		unreadChats?: (number|null)
		notifyMessageCount?: (number|null)
		notifyMessages: waproto.WebMessageInfo.$Properties[]
		static encode(m: waproto.WebNotificationsInfo.$Properties, w?: PbWriter): PbWriter
		static decode(r: (PbReader|Uint8Array), l?: number): waproto.WebNotificationsInfo & waproto.WebNotificationsInfo.$Shape
	}
	namespace WebNotificationsInfo {
		interface $Properties {
			timestamp?: (number|Long|null)
			unreadChats?: (number|null)
			notifyMessageCount?: (number|null)
			notifyMessages?: (waproto.WebMessageInfo.$Properties[]|null)
			$unknowns?: Uint8Array[]
		}
		type $Shape = waproto.WebNotificationsInfo.$Properties
	}
}
