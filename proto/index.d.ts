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
	interface IADVDeviceIdentity {
		rawId?: (number|null)
		timestamp?: (number|Long|null)
		keyIndex?: (number|null)
		accountType?: (waproto.ADVEncryptionType|null)
		deviceType?: (waproto.ADVEncryptionType|null)
	}
	class ADVDeviceIdentity implements IADVDeviceIdentity {
		constructor(p?: waproto.IADVDeviceIdentity)
		public rawId?: (number|null)
		public timestamp?: (number|Long|null)
		public keyIndex?: (number|null)
		public accountType?: (waproto.ADVEncryptionType|null)
		public deviceType?: (waproto.ADVEncryptionType|null)
		public static encode(m: waproto.IADVDeviceIdentity, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ADVDeviceIdentity
	}
	enum ADVEncryptionType {
		E2EE = 0,
		HOSTED = 1
	}
	interface IADVKeyIndexList {
		rawId?: (number|null)
		timestamp?: (number|Long|null)
		currentIndex?: (number|null)
		validIndexes?: (number[]|null)
		accountType?: (waproto.ADVEncryptionType|null)
	}
	class ADVKeyIndexList implements IADVKeyIndexList {
		constructor(p?: waproto.IADVKeyIndexList)
		public rawId?: (number|null)
		public timestamp?: (number|Long|null)
		public currentIndex?: (number|null)
		public validIndexes: number[]
		public accountType?: (waproto.ADVEncryptionType|null)
		public static encode(m: waproto.IADVKeyIndexList, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ADVKeyIndexList
	}
	interface IADVSignedDeviceIdentity {
		details?: (Uint8Array|null)
		accountSignatureKey?: (Uint8Array|null)
		accountSignature?: (Uint8Array|null)
		deviceSignature?: (Uint8Array|null)
	}
	class ADVSignedDeviceIdentity implements IADVSignedDeviceIdentity {
		constructor(p?: waproto.IADVSignedDeviceIdentity)
		public details?: (Uint8Array|null)
		public accountSignatureKey?: (Uint8Array|null)
		public accountSignature?: (Uint8Array|null)
		public deviceSignature?: (Uint8Array|null)
		public static encode(m: waproto.IADVSignedDeviceIdentity, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ADVSignedDeviceIdentity
	}
	interface IADVSignedDeviceIdentityHMAC {
		details?: (Uint8Array|null)
		hmac?: (Uint8Array|null)
		accountType?: (waproto.ADVEncryptionType|null)
	}
	class ADVSignedDeviceIdentityHMAC implements IADVSignedDeviceIdentityHMAC {
		constructor(p?: waproto.IADVSignedDeviceIdentityHMAC)
		public details?: (Uint8Array|null)
		public hmac?: (Uint8Array|null)
		public accountType?: (waproto.ADVEncryptionType|null)
		public static encode(m: waproto.IADVSignedDeviceIdentityHMAC, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ADVSignedDeviceIdentityHMAC
	}
	interface IADVSignedKeyIndexList {
		details?: (Uint8Array|null)
		accountSignature?: (Uint8Array|null)
		accountSignatureKey?: (Uint8Array|null)
	}
	class ADVSignedKeyIndexList implements IADVSignedKeyIndexList {
		constructor(p?: waproto.IADVSignedKeyIndexList)
		public details?: (Uint8Array|null)
		public accountSignature?: (Uint8Array|null)
		public accountSignatureKey?: (Uint8Array|null)
		public static encode(m: waproto.IADVSignedKeyIndexList, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ADVSignedKeyIndexList
	}
	interface IAIHomeState {
		lastFetchTime?: (number|Long|null)
		capabilityOptions?: (waproto.AIHomeState.IAIHomeOption[]|null)
		conversationOptions?: (waproto.AIHomeState.IAIHomeOption[]|null)
	}
	class AIHomeState implements IAIHomeState {
		constructor(p?: waproto.IAIHomeState)
		public lastFetchTime?: (number|Long|null)
		public capabilityOptions: waproto.AIHomeState.IAIHomeOption[]
		public conversationOptions: waproto.AIHomeState.IAIHomeOption[]
		public static encode(m: waproto.IAIHomeState, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIHomeState
	}
	namespace AIHomeState {
		interface IAIHomeOption {
			type?: (waproto.AIHomeState.AIHomeOption.AIHomeActionType|null)
			title?: (string|null)
			promptText?: (string|null)
			sessionId?: (string|null)
			imageWdsIdentifier?: (string|null)
			imageTintColor?: (string|null)
			imageBackgroundColor?: (string|null)
			cardTypeId?: (string|null)
		}
		class AIHomeOption implements IAIHomeOption {
			constructor(p?: waproto.AIHomeState.IAIHomeOption)
			public type?: (waproto.AIHomeState.AIHomeOption.AIHomeActionType|null)
			public title?: (string|null)
			public promptText?: (string|null)
			public sessionId?: (string|null)
			public imageWdsIdentifier?: (string|null)
			public imageTintColor?: (string|null)
			public imageBackgroundColor?: (string|null)
			public cardTypeId?: (string|null)
			public static encode(m: waproto.AIHomeState.IAIHomeOption, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIHomeState.AIHomeOption
		}
		namespace AIHomeOption {
			enum AIHomeActionType {
				PROMPT = 0,
				CREATE_IMAGE = 1,
				ANIMATE_PHOTO = 2,
				ANALYZE_FILE = 3,
				COLLABORATE = 4
			}
		}
	}
	interface IAIMediaCollectionMessage {
		collectionId?: (string|null)
		expectedMediaCount?: (number|null)
		hasGlobalCaption?: (boolean|null)
	}
	class AIMediaCollectionMessage implements IAIMediaCollectionMessage {
		constructor(p?: waproto.IAIMediaCollectionMessage)
		public collectionId?: (string|null)
		public expectedMediaCount?: (number|null)
		public hasGlobalCaption?: (boolean|null)
		public static encode(m: waproto.IAIMediaCollectionMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIMediaCollectionMessage
	}
	interface IAIMediaCollectionMetadata {
		collectionId?: (string|null)
		uploadOrderIndex?: (number|null)
	}
	class AIMediaCollectionMetadata implements IAIMediaCollectionMetadata {
		constructor(p?: waproto.IAIMediaCollectionMetadata)
		public collectionId?: (string|null)
		public uploadOrderIndex?: (number|null)
		public static encode(m: waproto.IAIMediaCollectionMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIMediaCollectionMetadata
	}
	interface IAIQueryFanout {
		messageKey?: (waproto.IMessageKey|null)
		message?: (waproto.IMessage|null)
		timestamp?: (number|Long|null)
	}
	class AIQueryFanout implements IAIQueryFanout {
		constructor(p?: waproto.IAIQueryFanout)
		public messageKey?: (waproto.IMessageKey|null)
		public message?: (waproto.IMessage|null)
		public timestamp?: (number|Long|null)
		public static encode(m: waproto.IAIQueryFanout, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIQueryFanout
	}
	interface IAIRegenerateMetadata {
		messageKey?: (waproto.IMessageKey|null)
		responseTimestampMs?: (number|Long|null)
	}
	class AIRegenerateMetadata implements IAIRegenerateMetadata {
		constructor(p?: waproto.IAIRegenerateMetadata)
		public messageKey?: (waproto.IMessageKey|null)
		public responseTimestampMs?: (number|Long|null)
		public static encode(m: waproto.IAIRegenerateMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRegenerateMetadata
	}
	interface IAIRichResponseCodeMetadata {
		codeLanguage?: (string|null)
		codeBlocks?: (waproto.AIRichResponseCodeMetadata.IAIRichResponseCodeBlock[]|null)
	}
	class AIRichResponseCodeMetadata implements IAIRichResponseCodeMetadata {
		constructor(p?: waproto.IAIRichResponseCodeMetadata)
		public codeLanguage?: (string|null)
		public codeBlocks: waproto.AIRichResponseCodeMetadata.IAIRichResponseCodeBlock[]
		public static encode(m: waproto.IAIRichResponseCodeMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseCodeMetadata
	}
	namespace AIRichResponseCodeMetadata {
		interface IAIRichResponseCodeBlock {
			highlightType?: (waproto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType|null)
			codeContent?: (string|null)
		}
		class AIRichResponseCodeBlock implements IAIRichResponseCodeBlock {
			constructor(p?: waproto.AIRichResponseCodeMetadata.IAIRichResponseCodeBlock)
			public highlightType?: (waproto.AIRichResponseCodeMetadata.AIRichResponseCodeHighlightType|null)
			public codeContent?: (string|null)
			public static encode(m: waproto.AIRichResponseCodeMetadata.IAIRichResponseCodeBlock, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseCodeMetadata.AIRichResponseCodeBlock
		}
		enum AIRichResponseCodeHighlightType {
			AI_RICH_RESPONSE_CODE_HIGHLIGHT_DEFAULT = 0,
			AI_RICH_RESPONSE_CODE_HIGHLIGHT_KEYWORD = 1,
			AI_RICH_RESPONSE_CODE_HIGHLIGHT_METHOD = 2,
			AI_RICH_RESPONSE_CODE_HIGHLIGHT_STRING = 3,
			AI_RICH_RESPONSE_CODE_HIGHLIGHT_NUMBER = 4,
			AI_RICH_RESPONSE_CODE_HIGHLIGHT_COMMENT = 5
		}
	}
	interface IAIRichResponseContentItemsMetadata {
		itemsMetadata?: (waproto.AIRichResponseContentItemsMetadata.IAIRichResponseContentItemMetadata[]|null)
		contentType?: (waproto.AIRichResponseContentItemsMetadata.ContentType|null)
	}
	class AIRichResponseContentItemsMetadata implements IAIRichResponseContentItemsMetadata {
		constructor(p?: waproto.IAIRichResponseContentItemsMetadata)
		public itemsMetadata: waproto.AIRichResponseContentItemsMetadata.IAIRichResponseContentItemMetadata[]
		public contentType?: (waproto.AIRichResponseContentItemsMetadata.ContentType|null)
		public static encode(m: waproto.IAIRichResponseContentItemsMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseContentItemsMetadata
	}
	namespace AIRichResponseContentItemsMetadata {
		interface IAIRichResponseContentItemMetadata {
			reelItem?: (waproto.AIRichResponseContentItemsMetadata.IAIRichResponseReelItem|null)
		}
		class AIRichResponseContentItemMetadata implements IAIRichResponseContentItemMetadata {
			constructor(p?: waproto.AIRichResponseContentItemsMetadata.IAIRichResponseContentItemMetadata)
			public reelItem?: (waproto.AIRichResponseContentItemsMetadata.IAIRichResponseReelItem|null)
			public aIRichResponseContentItem?: "reelItem"
			public static encode(m: waproto.AIRichResponseContentItemsMetadata.IAIRichResponseContentItemMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseContentItemsMetadata.AIRichResponseContentItemMetadata
		}
		interface IAIRichResponseReelItem {
			title?: (string|null)
			profileIconUrl?: (string|null)
			thumbnailUrl?: (string|null)
			videoUrl?: (string|null)
		}
		class AIRichResponseReelItem implements IAIRichResponseReelItem {
			constructor(p?: waproto.AIRichResponseContentItemsMetadata.IAIRichResponseReelItem)
			public title?: (string|null)
			public profileIconUrl?: (string|null)
			public thumbnailUrl?: (string|null)
			public videoUrl?: (string|null)
			public static encode(m: waproto.AIRichResponseContentItemsMetadata.IAIRichResponseReelItem, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseContentItemsMetadata.AIRichResponseReelItem
		}
		enum ContentType {
			DEFAULT = 0,
			CAROUSEL = 1
		}
	}
	interface IAIRichResponseDynamicMetadata {
		type?: (waproto.AIRichResponseDynamicMetadata.AIRichResponseDynamicMetadataType|null)
		version?: (number|Long|null)
		url?: (string|null)
		loopCount?: (number|null)
	}
	class AIRichResponseDynamicMetadata implements IAIRichResponseDynamicMetadata {
		constructor(p?: waproto.IAIRichResponseDynamicMetadata)
		public type?: (waproto.AIRichResponseDynamicMetadata.AIRichResponseDynamicMetadataType|null)
		public version?: (number|Long|null)
		public url?: (string|null)
		public loopCount?: (number|null)
		public static encode(m: waproto.IAIRichResponseDynamicMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseDynamicMetadata
	}
	namespace AIRichResponseDynamicMetadata {
		enum AIRichResponseDynamicMetadataType {
			AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_UNKNOWN = 0,
			AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_IMAGE = 1,
			AI_RICH_RESPONSE_DYNAMIC_METADATA_TYPE_GIF = 2
		}
	}
	interface IAIRichResponseGridImageMetadata {
		gridImageUrl?: (waproto.IAIRichResponseImageURL|null)
		imageUrls?: (waproto.IAIRichResponseImageURL[]|null)
	}
	class AIRichResponseGridImageMetadata implements IAIRichResponseGridImageMetadata {
		constructor(p?: waproto.IAIRichResponseGridImageMetadata)
		public gridImageUrl?: (waproto.IAIRichResponseImageURL|null)
		public imageUrls: waproto.IAIRichResponseImageURL[]
		public static encode(m: waproto.IAIRichResponseGridImageMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseGridImageMetadata
	}
	interface IAIRichResponseImageURL {
		imagePreviewUrl?: (string|null)
		imageHighResUrl?: (string|null)
		sourceUrl?: (string|null)
	}
	class AIRichResponseImageURL implements IAIRichResponseImageURL {
		constructor(p?: waproto.IAIRichResponseImageURL)
		public imagePreviewUrl?: (string|null)
		public imageHighResUrl?: (string|null)
		public sourceUrl?: (string|null)
		public static encode(m: waproto.IAIRichResponseImageURL, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseImageURL
	}
	interface IAIRichResponseInlineImageMetadata {
		imageUrl?: (waproto.IAIRichResponseImageURL|null)
		imageText?: (string|null)
		alignment?: (waproto.AIRichResponseInlineImageMetadata.AIRichResponseImageAlignment|null)
		tapLinkUrl?: (string|null)
	}
	class AIRichResponseInlineImageMetadata implements IAIRichResponseInlineImageMetadata {
		constructor(p?: waproto.IAIRichResponseInlineImageMetadata)
		public imageUrl?: (waproto.IAIRichResponseImageURL|null)
		public imageText?: (string|null)
		public alignment?: (waproto.AIRichResponseInlineImageMetadata.AIRichResponseImageAlignment|null)
		public tapLinkUrl?: (string|null)
		public static encode(m: waproto.IAIRichResponseInlineImageMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseInlineImageMetadata
	}
	namespace AIRichResponseInlineImageMetadata {
		enum AIRichResponseImageAlignment {
			AI_RICH_RESPONSE_IMAGE_LAYOUT_LEADING_ALIGNED = 0,
			AI_RICH_RESPONSE_IMAGE_LAYOUT_TRAILING_ALIGNED = 1,
			AI_RICH_RESPONSE_IMAGE_LAYOUT_CENTER_ALIGNED = 2
		}
	}
	interface IAIRichResponseLatexMetadata {
		text?: (string|null)
		expressions?: (waproto.AIRichResponseLatexMetadata.IAIRichResponseLatexExpression[]|null)
	}
	class AIRichResponseLatexMetadata implements IAIRichResponseLatexMetadata {
		constructor(p?: waproto.IAIRichResponseLatexMetadata)
		public text?: (string|null)
		public expressions: waproto.AIRichResponseLatexMetadata.IAIRichResponseLatexExpression[]
		public static encode(m: waproto.IAIRichResponseLatexMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseLatexMetadata
	}
	namespace AIRichResponseLatexMetadata {
		interface IAIRichResponseLatexExpression {
			latexExpression?: (string|null)
			url?: (string|null)
			width?: (number|null)
			height?: (number|null)
			fontHeight?: (number|null)
			imageTopPadding?: (number|null)
			imageLeadingPadding?: (number|null)
			imageBottomPadding?: (number|null)
			imageTrailingPadding?: (number|null)
		}
		class AIRichResponseLatexExpression implements IAIRichResponseLatexExpression {
			constructor(p?: waproto.AIRichResponseLatexMetadata.IAIRichResponseLatexExpression)
			public latexExpression?: (string|null)
			public url?: (string|null)
			public width?: (number|null)
			public height?: (number|null)
			public fontHeight?: (number|null)
			public imageTopPadding?: (number|null)
			public imageLeadingPadding?: (number|null)
			public imageBottomPadding?: (number|null)
			public imageTrailingPadding?: (number|null)
			public static encode(m: waproto.AIRichResponseLatexMetadata.IAIRichResponseLatexExpression, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseLatexMetadata.AIRichResponseLatexExpression
		}
	}
	interface IAIRichResponseMapMetadata {
		centerLatitude?: (number|null)
		centerLongitude?: (number|null)
		latitudeDelta?: (number|null)
		longitudeDelta?: (number|null)
		annotations?: (waproto.AIRichResponseMapMetadata.IAIRichResponseMapAnnotation[]|null)
		showInfoList?: (boolean|null)
	}
	class AIRichResponseMapMetadata implements IAIRichResponseMapMetadata {
		constructor(p?: waproto.IAIRichResponseMapMetadata)
		public centerLatitude?: (number|null)
		public centerLongitude?: (number|null)
		public latitudeDelta?: (number|null)
		public longitudeDelta?: (number|null)
		public annotations: waproto.AIRichResponseMapMetadata.IAIRichResponseMapAnnotation[]
		public showInfoList?: (boolean|null)
		public static encode(m: waproto.IAIRichResponseMapMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseMapMetadata
	}
	namespace AIRichResponseMapMetadata {
		interface IAIRichResponseMapAnnotation {
			annotationNumber?: (number|null)
			latitude?: (number|null)
			longitude?: (number|null)
			title?: (string|null)
			body?: (string|null)
		}
		class AIRichResponseMapAnnotation implements IAIRichResponseMapAnnotation {
			constructor(p?: waproto.AIRichResponseMapMetadata.IAIRichResponseMapAnnotation)
			public annotationNumber?: (number|null)
			public latitude?: (number|null)
			public longitude?: (number|null)
			public title?: (string|null)
			public body?: (string|null)
			public static encode(m: waproto.AIRichResponseMapMetadata.IAIRichResponseMapAnnotation, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseMapMetadata.AIRichResponseMapAnnotation
		}
	}
	interface IAIRichResponseMessage {
		messageType?: (waproto.AIRichResponseMessageType|null)
		submessages?: (waproto.IAIRichResponseSubMessage[]|null)
		unifiedResponse?: (waproto.IAIRichResponseUnifiedResponse|null)
		contextInfo?: (waproto.IContextInfo|null)
	}
	class AIRichResponseMessage implements IAIRichResponseMessage {
		constructor(p?: waproto.IAIRichResponseMessage)
		public messageType?: (waproto.AIRichResponseMessageType|null)
		public submessages: waproto.IAIRichResponseSubMessage[]
		public unifiedResponse?: (waproto.IAIRichResponseUnifiedResponse|null)
		public contextInfo?: (waproto.IContextInfo|null)
		public static encode(m: waproto.IAIRichResponseMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseMessage
	}
	enum AIRichResponseMessageType {
		AI_RICH_RESPONSE_TYPE_UNKNOWN = 0,
		AI_RICH_RESPONSE_TYPE_STANDARD = 1
	}
	interface IAIRichResponseSubMessage {
		messageType?: (waproto.AIRichResponseSubMessageType|null)
		gridImageMetadata?: (waproto.IAIRichResponseGridImageMetadata|null)
		messageText?: (string|null)
		imageMetadata?: (waproto.IAIRichResponseInlineImageMetadata|null)
		codeMetadata?: (waproto.IAIRichResponseCodeMetadata|null)
		tableMetadata?: (waproto.IAIRichResponseTableMetadata|null)
		dynamicMetadata?: (waproto.IAIRichResponseDynamicMetadata|null)
		latexMetadata?: (waproto.IAIRichResponseLatexMetadata|null)
		mapMetadata?: (waproto.IAIRichResponseMapMetadata|null)
		contentItemsMetadata?: (waproto.IAIRichResponseContentItemsMetadata|null)
	}
	class AIRichResponseSubMessage implements IAIRichResponseSubMessage {
		constructor(p?: waproto.IAIRichResponseSubMessage)
		public messageType?: (waproto.AIRichResponseSubMessageType|null)
		public gridImageMetadata?: (waproto.IAIRichResponseGridImageMetadata|null)
		public messageText?: (string|null)
		public imageMetadata?: (waproto.IAIRichResponseInlineImageMetadata|null)
		public codeMetadata?: (waproto.IAIRichResponseCodeMetadata|null)
		public tableMetadata?: (waproto.IAIRichResponseTableMetadata|null)
		public dynamicMetadata?: (waproto.IAIRichResponseDynamicMetadata|null)
		public latexMetadata?: (waproto.IAIRichResponseLatexMetadata|null)
		public mapMetadata?: (waproto.IAIRichResponseMapMetadata|null)
		public contentItemsMetadata?: (waproto.IAIRichResponseContentItemsMetadata|null)
		public static encode(m: waproto.IAIRichResponseSubMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseSubMessage
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
	interface IAIRichResponseTableMetadata {
		rows?: (waproto.AIRichResponseTableMetadata.IAIRichResponseTableRow[]|null)
		title?: (string|null)
	}
	class AIRichResponseTableMetadata implements IAIRichResponseTableMetadata {
		constructor(p?: waproto.IAIRichResponseTableMetadata)
		public rows: waproto.AIRichResponseTableMetadata.IAIRichResponseTableRow[]
		public title?: (string|null)
		public static encode(m: waproto.IAIRichResponseTableMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseTableMetadata
	}
	namespace AIRichResponseTableMetadata {
		interface IAIRichResponseTableRow {
			items?: (string[]|null)
			isHeading?: (boolean|null)
		}
		class AIRichResponseTableRow implements IAIRichResponseTableRow {
			constructor(p?: waproto.AIRichResponseTableMetadata.IAIRichResponseTableRow)
			public items: string[]
			public isHeading?: (boolean|null)
			public static encode(m: waproto.AIRichResponseTableMetadata.IAIRichResponseTableRow, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseTableMetadata.AIRichResponseTableRow
		}
	}
	interface IAIRichResponseUnifiedResponse {
		data?: (Uint8Array|null)
	}
	class AIRichResponseUnifiedResponse implements IAIRichResponseUnifiedResponse {
		constructor(p?: waproto.IAIRichResponseUnifiedResponse)
		public data?: (Uint8Array|null)
		public static encode(m: waproto.IAIRichResponseUnifiedResponse, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIRichResponseUnifiedResponse
	}
	interface IAIThreadInfo {
		serverInfo?: (waproto.AIThreadInfo.IAIThreadServerInfo|null)
		clientInfo?: (waproto.AIThreadInfo.IAIThreadClientInfo|null)
	}
	class AIThreadInfo implements IAIThreadInfo {
		constructor(p?: waproto.IAIThreadInfo)
		public serverInfo?: (waproto.AIThreadInfo.IAIThreadServerInfo|null)
		public clientInfo?: (waproto.AIThreadInfo.IAIThreadClientInfo|null)
		public static encode(m: waproto.IAIThreadInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIThreadInfo
	}
	namespace AIThreadInfo {
		interface IAIThreadClientInfo {
			type?: (waproto.AIThreadInfo.AIThreadClientInfo.AIThreadType|null)
			sourceChatJid?: (string|null)
		}
		class AIThreadClientInfo implements IAIThreadClientInfo {
			constructor(p?: waproto.AIThreadInfo.IAIThreadClientInfo)
			public type?: (waproto.AIThreadInfo.AIThreadClientInfo.AIThreadType|null)
			public sourceChatJid?: (string|null)
			public static encode(m: waproto.AIThreadInfo.IAIThreadClientInfo, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIThreadInfo.AIThreadClientInfo
		}
		namespace AIThreadClientInfo {
			enum AIThreadType {
				UNKNOWN = 0,
				DEFAULT = 1,
				INCOGNITO = 2,
				SIDE_CHAT = 3
			}
		}
		interface IAIThreadServerInfo {
			title?: (string|null)
		}
		class AIThreadServerInfo implements IAIThreadServerInfo {
			constructor(p?: waproto.AIThreadInfo.IAIThreadServerInfo)
			public title?: (string|null)
			public static encode(m: waproto.AIThreadInfo.IAIThreadServerInfo, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AIThreadInfo.AIThreadServerInfo
		}
	}
	interface IAccount {
		lid?: (string|null)
		username?: (string|null)
		countryCode?: (string|null)
		isUsernameDeleted?: (boolean|null)
	}
	class Account implements IAccount {
		constructor(p?: waproto.IAccount)
		public lid?: (string|null)
		public username?: (string|null)
		public countryCode?: (string|null)
		public isUsernameDeleted?: (boolean|null)
		public static encode(m: waproto.IAccount, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Account
	}
	interface IActionLink {
		url?: (string|null)
		buttonTitle?: (string|null)
	}
	class ActionLink implements IActionLink {
		constructor(p?: waproto.IActionLink)
		public url?: (string|null)
		public buttonTitle?: (string|null)
		public static encode(m: waproto.IActionLink, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ActionLink
	}
	interface IAutoDownloadSettings {
		downloadImages?: (boolean|null)
		downloadAudio?: (boolean|null)
		downloadVideo?: (boolean|null)
		downloadDocuments?: (boolean|null)
	}
	class AutoDownloadSettings implements IAutoDownloadSettings {
		constructor(p?: waproto.IAutoDownloadSettings)
		public downloadImages?: (boolean|null)
		public downloadAudio?: (boolean|null)
		public downloadVideo?: (boolean|null)
		public downloadDocuments?: (boolean|null)
		public static encode(m: waproto.IAutoDownloadSettings, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AutoDownloadSettings
	}
	interface IAvatarUserSettings {
		fbid?: (string|null)
		password?: (string|null)
	}
	class AvatarUserSettings implements IAvatarUserSettings {
		constructor(p?: waproto.IAvatarUserSettings)
		public fbid?: (string|null)
		public password?: (string|null)
		public static encode(m: waproto.IAvatarUserSettings, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.AvatarUserSettings
	}
	interface IBizAccountLinkInfo {
		whatsappBizAcctFbid?: (number|Long|null)
		whatsappAcctNumber?: (string|null)
		issueTime?: (number|Long|null)
		hostStorage?: (waproto.BizAccountLinkInfo.HostStorageType|null)
		accountType?: (waproto.BizAccountLinkInfo.AccountType|null)
	}
	class BizAccountLinkInfo implements IBizAccountLinkInfo {
		constructor(p?: waproto.IBizAccountLinkInfo)
		public whatsappBizAcctFbid?: (number|Long|null)
		public whatsappAcctNumber?: (string|null)
		public issueTime?: (number|Long|null)
		public hostStorage?: (waproto.BizAccountLinkInfo.HostStorageType|null)
		public accountType?: (waproto.BizAccountLinkInfo.AccountType|null)
		public static encode(m: waproto.IBizAccountLinkInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BizAccountLinkInfo
	}
	namespace BizAccountLinkInfo {
		enum AccountType {
			ENTERPRISE = 0
		}
		enum HostStorageType {
			ON_PREMISE = 0,
			FACEBOOK = 1
		}
	}
	interface IBizAccountPayload {
		vnameCert?: (waproto.IVerifiedNameCertificate|null)
		bizAcctLinkInfo?: (Uint8Array|null)
	}
	class BizAccountPayload implements IBizAccountPayload {
		constructor(p?: waproto.IBizAccountPayload)
		public vnameCert?: (waproto.IVerifiedNameCertificate|null)
		public bizAcctLinkInfo?: (Uint8Array|null)
		public static encode(m: waproto.IBizAccountPayload, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BizAccountPayload
	}
	interface IBizIdentityInfo {
		vlevel?: (waproto.BizIdentityInfo.VerifiedLevelValue|null)
		vnameCert?: (waproto.IVerifiedNameCertificate|null)
		signed?: (boolean|null)
		revoked?: (boolean|null)
		hostStorage?: (waproto.BizIdentityInfo.HostStorageType|null)
		actualActors?: (waproto.BizIdentityInfo.ActualActorsType|null)
		privacyModeTs?: (number|Long|null)
		featureControls?: (number|Long|null)
	}
	class BizIdentityInfo implements IBizIdentityInfo {
		constructor(p?: waproto.IBizIdentityInfo)
		public vlevel?: (waproto.BizIdentityInfo.VerifiedLevelValue|null)
		public vnameCert?: (waproto.IVerifiedNameCertificate|null)
		public signed?: (boolean|null)
		public revoked?: (boolean|null)
		public hostStorage?: (waproto.BizIdentityInfo.HostStorageType|null)
		public actualActors?: (waproto.BizIdentityInfo.ActualActorsType|null)
		public privacyModeTs?: (number|Long|null)
		public featureControls?: (number|Long|null)
		public static encode(m: waproto.IBizIdentityInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BizIdentityInfo
	}
	namespace BizIdentityInfo {
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
	interface IBotAgeCollectionMetadata {
		ageCollectionEligible?: (boolean|null)
		shouldTriggerAgeCollectionOnClient?: (boolean|null)
		ageCollectionType?: (waproto.BotAgeCollectionMetadata.AgeCollectionType|null)
	}
	class BotAgeCollectionMetadata implements IBotAgeCollectionMetadata {
		constructor(p?: waproto.IBotAgeCollectionMetadata)
		public ageCollectionEligible?: (boolean|null)
		public shouldTriggerAgeCollectionOnClient?: (boolean|null)
		public ageCollectionType?: (waproto.BotAgeCollectionMetadata.AgeCollectionType|null)
		public static encode(m: waproto.IBotAgeCollectionMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotAgeCollectionMetadata
	}
	namespace BotAgeCollectionMetadata {
		enum AgeCollectionType {
			O18_BINARY = 0,
			WAFFLE = 1
		}
	}
	interface IBotCapabilityMetadata {
		capabilities?: (waproto.BotCapabilityMetadata.BotCapabilityType[]|null)
	}
	class BotCapabilityMetadata implements IBotCapabilityMetadata {
		constructor(p?: waproto.IBotCapabilityMetadata)
		public capabilities: waproto.BotCapabilityMetadata.BotCapabilityType[]
		public static encode(m: waproto.IBotCapabilityMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotCapabilityMetadata
	}
	namespace BotCapabilityMetadata {
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
			JSON_PATCH_STREAMING = 58
		}
	}
	interface IBotDocumentMessageMetadata {
		pluginType?: (waproto.BotDocumentMessageMetadata.DocumentPluginType|null)
	}
	class BotDocumentMessageMetadata implements IBotDocumentMessageMetadata {
		constructor(p?: waproto.IBotDocumentMessageMetadata)
		public pluginType?: (waproto.BotDocumentMessageMetadata.DocumentPluginType|null)
		public static encode(m: waproto.IBotDocumentMessageMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotDocumentMessageMetadata
	}
	namespace BotDocumentMessageMetadata {
		enum DocumentPluginType {
			TEXT_EXTRACTION = 0,
			OCR_AND_IMAGES = 1
		}
	}
	interface IBotFeedbackMessage {
		messageKey?: (waproto.IMessageKey|null)
		kind?: (waproto.BotFeedbackMessage.BotFeedbackKind|null)
		text?: (string|null)
		kindNegative?: (number|Long|null)
		kindPositive?: (number|Long|null)
		kindReport?: (waproto.BotFeedbackMessage.ReportKind|null)
		sideBySideSurveyMetadata?: (waproto.BotFeedbackMessage.ISideBySideSurveyMetadata|null)
	}
	class BotFeedbackMessage implements IBotFeedbackMessage {
		constructor(p?: waproto.IBotFeedbackMessage)
		public messageKey?: (waproto.IMessageKey|null)
		public kind?: (waproto.BotFeedbackMessage.BotFeedbackKind|null)
		public text?: (string|null)
		public kindNegative?: (number|Long|null)
		public kindPositive?: (number|Long|null)
		public kindReport?: (waproto.BotFeedbackMessage.ReportKind|null)
		public sideBySideSurveyMetadata?: (waproto.BotFeedbackMessage.ISideBySideSurveyMetadata|null)
		public static encode(m: waproto.IBotFeedbackMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage
	}
	namespace BotFeedbackMessage {
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
		enum BotFeedbackKindMultiplePositive {
			BOT_FEEDBACK_MULTIPLE_POSITIVE_GENERIC = 1
		}
		enum ReportKind {
			NONE = 0,
			GENERIC = 1
		}
		interface ISideBySideSurveyMetadata {
			selectedRequestId?: (string|null)
			surveyId?: (number|null)
			simonSessionFbid?: (string|null)
			responseOtid?: (string|null)
			responseTimestampMsString?: (string|null)
			isSelectedResponsePrimary?: (boolean|null)
			messageIdToEdit?: (string|null)
			analyticsData?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.ISideBySideSurveyAnalyticsData|null)
			metaAiAnalyticsData?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.ISidebySideSurveyMetaAiAnalyticsData|null)
		}
		class SideBySideSurveyMetadata implements ISideBySideSurveyMetadata {
			constructor(p?: waproto.BotFeedbackMessage.ISideBySideSurveyMetadata)
			public selectedRequestId?: (string|null)
			public surveyId?: (number|null)
			public simonSessionFbid?: (string|null)
			public responseOtid?: (string|null)
			public responseTimestampMsString?: (string|null)
			public isSelectedResponsePrimary?: (boolean|null)
			public messageIdToEdit?: (string|null)
			public analyticsData?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.ISideBySideSurveyAnalyticsData|null)
			public metaAiAnalyticsData?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.ISidebySideSurveyMetaAiAnalyticsData|null)
			public static encode(m: waproto.BotFeedbackMessage.ISideBySideSurveyMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata
		}
		namespace SideBySideSurveyMetadata {
			interface ISideBySideSurveyAnalyticsData {
				tessaEvent?: (string|null)
				tessaSessionFbid?: (string|null)
				simonSessionFbid?: (string|null)
			}
			class SideBySideSurveyAnalyticsData implements ISideBySideSurveyAnalyticsData {
				constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.ISideBySideSurveyAnalyticsData)
				public tessaEvent?: (string|null)
				public tessaSessionFbid?: (string|null)
				public simonSessionFbid?: (string|null)
				public static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.ISideBySideSurveyAnalyticsData, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SideBySideSurveyAnalyticsData
			}
			interface ISidebySideSurveyMetaAiAnalyticsData {
				surveyId?: (number|null)
				primaryResponseId?: (string|null)
				testArmName?: (string|null)
				timestampMsString?: (string|null)
				ctaImpressionEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyCTAImpressionEventData|null)
				ctaClickEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyCTAClickEventData|null)
				cardImpressionEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyCardImpressionEventData|null)
				responseEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyResponseEventData|null)
				abandonEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyAbandonEventData|null)
			}
			class SidebySideSurveyMetaAiAnalyticsData implements ISidebySideSurveyMetaAiAnalyticsData {
				constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.ISidebySideSurveyMetaAiAnalyticsData)
				public surveyId?: (number|null)
				public primaryResponseId?: (string|null)
				public testArmName?: (string|null)
				public timestampMsString?: (string|null)
				public ctaImpressionEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyCTAImpressionEventData|null)
				public ctaClickEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyCTAClickEventData|null)
				public cardImpressionEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyCardImpressionEventData|null)
				public responseEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyResponseEventData|null)
				public abandonEvent?: (waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyAbandonEventData|null)
				public static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.ISidebySideSurveyMetaAiAnalyticsData, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData
			}
			namespace SidebySideSurveyMetaAiAnalyticsData {
				interface ISideBySideSurveyAbandonEventData {
					abandonDwellTimeMsString?: (string|null)
				}
				class SideBySideSurveyAbandonEventData implements ISideBySideSurveyAbandonEventData {
					constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyAbandonEventData)
					public abandonDwellTimeMsString?: (string|null)
					public static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyAbandonEventData, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyAbandonEventData
				}
				interface ISideBySideSurveyCTAClickEventData {
					isSurveyExpired?: (boolean|null)
					clickDwellTimeMsString?: (string|null)
				}
				class SideBySideSurveyCTAClickEventData implements ISideBySideSurveyCTAClickEventData {
					constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyCTAClickEventData)
					public isSurveyExpired?: (boolean|null)
					public clickDwellTimeMsString?: (string|null)
					public static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyCTAClickEventData, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAClickEventData
				}
				interface ISideBySideSurveyCTAImpressionEventData {
					isSurveyExpired?: (boolean|null)
				}
				class SideBySideSurveyCTAImpressionEventData implements ISideBySideSurveyCTAImpressionEventData {
					constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyCTAImpressionEventData)
					public isSurveyExpired?: (boolean|null)
					public static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyCTAImpressionEventData, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCTAImpressionEventData
				}
				interface ISideBySideSurveyCardImpressionEventData {
				}
				class SideBySideSurveyCardImpressionEventData implements ISideBySideSurveyCardImpressionEventData {
					constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyCardImpressionEventData)
					public static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyCardImpressionEventData, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyCardImpressionEventData
				}
				interface ISideBySideSurveyResponseEventData {
					responseDwellTimeMsString?: (string|null)
					selectedResponseId?: (string|null)
				}
				class SideBySideSurveyResponseEventData implements ISideBySideSurveyResponseEventData {
					constructor(p?: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyResponseEventData)
					public responseDwellTimeMsString?: (string|null)
					public selectedResponseId?: (string|null)
					public static encode(m: waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.ISideBySideSurveyResponseEventData, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotFeedbackMessage.SideBySideSurveyMetadata.SidebySideSurveyMetaAiAnalyticsData.SideBySideSurveyResponseEventData
				}
			}
		}
	}
	interface IBotGroupMetadata {
		participantsMetadata?: (waproto.IBotGroupParticipantMetadata[]|null)
	}
	class BotGroupMetadata implements IBotGroupMetadata {
		constructor(p?: waproto.IBotGroupMetadata)
		public participantsMetadata: waproto.IBotGroupParticipantMetadata[]
		public static encode(m: waproto.IBotGroupMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotGroupMetadata
	}
	interface IBotGroupParticipantMetadata {
		botFbid?: (string|null)
	}
	class BotGroupParticipantMetadata implements IBotGroupParticipantMetadata {
		constructor(p?: waproto.IBotGroupParticipantMetadata)
		public botFbid?: (string|null)
		public static encode(m: waproto.IBotGroupParticipantMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotGroupParticipantMetadata
	}
	interface IBotImagineMetadata {
		imagineType?: (waproto.BotImagineMetadata.ImagineType|null)
		shortPrompt?: (string|null)
	}
	class BotImagineMetadata implements IBotImagineMetadata {
		constructor(p?: waproto.IBotImagineMetadata)
		public imagineType?: (waproto.BotImagineMetadata.ImagineType|null)
		public shortPrompt?: (string|null)
		public static encode(m: waproto.IBotImagineMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotImagineMetadata
	}
	namespace BotImagineMetadata {
		enum ImagineType {
			UNKNOWN = 0,
			IMAGINE = 1,
			MEMU = 2,
			FLASH = 3,
			EDIT = 4
		}
	}
	interface IBotInfrastructureDiagnostics {
		botBackend?: (waproto.BotInfrastructureDiagnostics.BotBackend|null)
		toolsUsed?: (string[]|null)
		isThinking?: (boolean|null)
	}
	class BotInfrastructureDiagnostics implements IBotInfrastructureDiagnostics {
		constructor(p?: waproto.IBotInfrastructureDiagnostics)
		public botBackend?: (waproto.BotInfrastructureDiagnostics.BotBackend|null)
		public toolsUsed: string[]
		public isThinking?: (boolean|null)
		public static encode(m: waproto.IBotInfrastructureDiagnostics, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotInfrastructureDiagnostics
	}
	namespace BotInfrastructureDiagnostics {
		enum BotBackend {
			AAPI = 0,
			CLIPPY = 1
		}
	}
	interface IBotLinkedAccount {
		type?: (waproto.BotLinkedAccount.BotLinkedAccountType|null)
	}
	class BotLinkedAccount implements IBotLinkedAccount {
		constructor(p?: waproto.IBotLinkedAccount)
		public type?: (waproto.BotLinkedAccount.BotLinkedAccountType|null)
		public static encode(m: waproto.IBotLinkedAccount, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotLinkedAccount
	}
	namespace BotLinkedAccount {
		enum BotLinkedAccountType {
			BOT_LINKED_ACCOUNT_TYPE_1P = 0
		}
	}
	interface IBotLinkedAccountsMetadata {
		accounts?: (waproto.IBotLinkedAccount[]|null)
		acAuthTokens?: (Uint8Array|null)
		acErrorCode?: (number|null)
	}
	class BotLinkedAccountsMetadata implements IBotLinkedAccountsMetadata {
		constructor(p?: waproto.IBotLinkedAccountsMetadata)
		public accounts: waproto.IBotLinkedAccount[]
		public acAuthTokens?: (Uint8Array|null)
		public acErrorCode?: (number|null)
		public static encode(m: waproto.IBotLinkedAccountsMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotLinkedAccountsMetadata
	}
	interface IBotMediaMetadata {
		fileSha256?: (string|null)
		mediaKey?: (string|null)
		fileEncSha256?: (string|null)
		directPath?: (string|null)
		mediaKeyTimestamp?: (number|Long|null)
		mimetype?: (string|null)
		orientationType?: (waproto.BotMediaMetadata.OrientationType|null)
	}
	class BotMediaMetadata implements IBotMediaMetadata {
		constructor(p?: waproto.IBotMediaMetadata)
		public fileSha256?: (string|null)
		public mediaKey?: (string|null)
		public fileEncSha256?: (string|null)
		public directPath?: (string|null)
		public mediaKeyTimestamp?: (number|Long|null)
		public mimetype?: (string|null)
		public orientationType?: (waproto.BotMediaMetadata.OrientationType|null)
		public static encode(m: waproto.IBotMediaMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMediaMetadata
	}
	namespace BotMediaMetadata {
		enum OrientationType {
			CENTER = 1,
			LEFT = 2,
			RIGHT = 3
		}
	}
	interface IBotMemoryFact {
		fact?: (string|null)
		factId?: (string|null)
	}
	class BotMemoryFact implements IBotMemoryFact {
		constructor(p?: waproto.IBotMemoryFact)
		public fact?: (string|null)
		public factId?: (string|null)
		public static encode(m: waproto.IBotMemoryFact, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMemoryFact
	}
	interface IBotMemoryMetadata {
		addedFacts?: (waproto.IBotMemoryFact[]|null)
		removedFacts?: (waproto.IBotMemoryFact[]|null)
		disclaimer?: (string|null)
	}
	class BotMemoryMetadata implements IBotMemoryMetadata {
		constructor(p?: waproto.IBotMemoryMetadata)
		public addedFacts: waproto.IBotMemoryFact[]
		public removedFacts: waproto.IBotMemoryFact[]
		public disclaimer?: (string|null)
		public static encode(m: waproto.IBotMemoryMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMemoryMetadata
	}
	interface IBotMemuMetadata {
		faceImages?: (waproto.IBotMediaMetadata[]|null)
	}
	class BotMemuMetadata implements IBotMemuMetadata {
		constructor(p?: waproto.IBotMemuMetadata)
		public faceImages: waproto.IBotMediaMetadata[]
		public static encode(m: waproto.IBotMemuMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMemuMetadata
	}
	interface IBotMessageOrigin {
		type?: (waproto.BotMessageOrigin.BotMessageOriginType|null)
	}
	class BotMessageOrigin implements IBotMessageOrigin {
		constructor(p?: waproto.IBotMessageOrigin)
		public type?: (waproto.BotMessageOrigin.BotMessageOriginType|null)
		public static encode(m: waproto.IBotMessageOrigin, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMessageOrigin
	}
	namespace BotMessageOrigin {
		enum BotMessageOriginType {
			BOT_MESSAGE_ORIGIN_TYPE_AI_INITIATED = 0
		}
	}
	interface IBotMessageOriginMetadata {
		origins?: (waproto.IBotMessageOrigin[]|null)
	}
	class BotMessageOriginMetadata implements IBotMessageOriginMetadata {
		constructor(p?: waproto.IBotMessageOriginMetadata)
		public origins: waproto.IBotMessageOrigin[]
		public static encode(m: waproto.IBotMessageOriginMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMessageOriginMetadata
	}
	interface IBotMessageSharingInfo {
		botEntryPointOrigin?: (waproto.BotMetricsEntryPoint|null)
		forwardScore?: (number|null)
	}
	class BotMessageSharingInfo implements IBotMessageSharingInfo {
		constructor(p?: waproto.IBotMessageSharingInfo)
		public botEntryPointOrigin?: (waproto.BotMetricsEntryPoint|null)
		public forwardScore?: (number|null)
		public static encode(m: waproto.IBotMessageSharingInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMessageSharingInfo
	}
	interface IBotMetadata {
		personaId?: (string|null)
		pluginMetadata?: (waproto.IBotPluginMetadata|null)
		suggestedPromptMetadata?: (waproto.IBotSuggestedPromptMetadata|null)
		invokerJid?: (string|null)
		sessionMetadata?: (waproto.IBotSessionMetadata|null)
		memuMetadata?: (waproto.IBotMemuMetadata|null)
		timezone?: (string|null)
		reminderMetadata?: (waproto.IBotReminderMetadata|null)
		modelMetadata?: (waproto.IBotModelMetadata|null)
		messageDisclaimerText?: (string|null)
		progressIndicatorMetadata?: (waproto.IBotProgressIndicatorMetadata|null)
		capabilityMetadata?: (waproto.IBotCapabilityMetadata|null)
		imagineMetadata?: (waproto.IBotImagineMetadata|null)
		memoryMetadata?: (waproto.IBotMemoryMetadata|null)
		renderingMetadata?: (waproto.IBotRenderingMetadata|null)
		botMetricsMetadata?: (waproto.IBotMetricsMetadata|null)
		botLinkedAccountsMetadata?: (waproto.IBotLinkedAccountsMetadata|null)
		richResponseSourcesMetadata?: (waproto.IBotSourcesMetadata|null)
		aiConversationContext?: (Uint8Array|null)
		botPromotionMessageMetadata?: (waproto.IBotPromotionMessageMetadata|null)
		botModeSelectionMetadata?: (waproto.IBotModeSelectionMetadata|null)
		botQuotaMetadata?: (waproto.IBotQuotaMetadata|null)
		botAgeCollectionMetadata?: (waproto.IBotAgeCollectionMetadata|null)
		conversationStarterPromptId?: (string|null)
		botResponseId?: (string|null)
		verificationMetadata?: (waproto.IBotSignatureVerificationMetadata|null)
		unifiedResponseMutation?: (waproto.IBotUnifiedResponseMutation|null)
		botMessageOriginMetadata?: (waproto.IBotMessageOriginMetadata|null)
		inThreadSurveyMetadata?: (waproto.IInThreadSurveyMetadata|null)
		botThreadInfo?: (waproto.IAIThreadInfo|null)
		regenerateMetadata?: (waproto.IAIRegenerateMetadata|null)
		sessionTransparencyMetadata?: (waproto.ISessionTransparencyMetadata|null)
		botDocumentMessageMetadata?: (waproto.IBotDocumentMessageMetadata|null)
		botGroupMetadata?: (waproto.IBotGroupMetadata|null)
		botRenderingConfigMetadata?: (waproto.IBotRenderingConfigMetadata|null)
		botInfrastructureDiagnostics?: (waproto.IBotInfrastructureDiagnostics|null)
		aiMediaCollectionMetadata?: (waproto.IAIMediaCollectionMetadata|null)
		internalMetadata?: (Uint8Array|null)
	}
	class BotMetadata implements IBotMetadata {
		constructor(p?: waproto.IBotMetadata)
		public personaId?: (string|null)
		public pluginMetadata?: (waproto.IBotPluginMetadata|null)
		public suggestedPromptMetadata?: (waproto.IBotSuggestedPromptMetadata|null)
		public invokerJid?: (string|null)
		public sessionMetadata?: (waproto.IBotSessionMetadata|null)
		public memuMetadata?: (waproto.IBotMemuMetadata|null)
		public timezone?: (string|null)
		public reminderMetadata?: (waproto.IBotReminderMetadata|null)
		public modelMetadata?: (waproto.IBotModelMetadata|null)
		public messageDisclaimerText?: (string|null)
		public progressIndicatorMetadata?: (waproto.IBotProgressIndicatorMetadata|null)
		public capabilityMetadata?: (waproto.IBotCapabilityMetadata|null)
		public imagineMetadata?: (waproto.IBotImagineMetadata|null)
		public memoryMetadata?: (waproto.IBotMemoryMetadata|null)
		public renderingMetadata?: (waproto.IBotRenderingMetadata|null)
		public botMetricsMetadata?: (waproto.IBotMetricsMetadata|null)
		public botLinkedAccountsMetadata?: (waproto.IBotLinkedAccountsMetadata|null)
		public richResponseSourcesMetadata?: (waproto.IBotSourcesMetadata|null)
		public aiConversationContext?: (Uint8Array|null)
		public botPromotionMessageMetadata?: (waproto.IBotPromotionMessageMetadata|null)
		public botModeSelectionMetadata?: (waproto.IBotModeSelectionMetadata|null)
		public botQuotaMetadata?: (waproto.IBotQuotaMetadata|null)
		public botAgeCollectionMetadata?: (waproto.IBotAgeCollectionMetadata|null)
		public conversationStarterPromptId?: (string|null)
		public botResponseId?: (string|null)
		public verificationMetadata?: (waproto.IBotSignatureVerificationMetadata|null)
		public unifiedResponseMutation?: (waproto.IBotUnifiedResponseMutation|null)
		public botMessageOriginMetadata?: (waproto.IBotMessageOriginMetadata|null)
		public inThreadSurveyMetadata?: (waproto.IInThreadSurveyMetadata|null)
		public botThreadInfo?: (waproto.IAIThreadInfo|null)
		public regenerateMetadata?: (waproto.IAIRegenerateMetadata|null)
		public sessionTransparencyMetadata?: (waproto.ISessionTransparencyMetadata|null)
		public botDocumentMessageMetadata?: (waproto.IBotDocumentMessageMetadata|null)
		public botGroupMetadata?: (waproto.IBotGroupMetadata|null)
		public botRenderingConfigMetadata?: (waproto.IBotRenderingConfigMetadata|null)
		public botInfrastructureDiagnostics?: (waproto.IBotInfrastructureDiagnostics|null)
		public aiMediaCollectionMetadata?: (waproto.IAIMediaCollectionMetadata|null)
		public internalMetadata?: (Uint8Array|null)
		public static encode(m: waproto.IBotMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMetadata
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
		CHATLIST_SEARCH = 55
	}
	interface IBotMetricsMetadata {
		destinationId?: (string|null)
		destinationEntryPoint?: (waproto.BotMetricsEntryPoint|null)
		threadOrigin?: (waproto.BotMetricsThreadEntryPoint|null)
	}
	class BotMetricsMetadata implements IBotMetricsMetadata {
		constructor(p?: waproto.IBotMetricsMetadata)
		public destinationId?: (string|null)
		public destinationEntryPoint?: (waproto.BotMetricsEntryPoint|null)
		public threadOrigin?: (waproto.BotMetricsThreadEntryPoint|null)
		public static encode(m: waproto.IBotMetricsMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotMetricsMetadata
	}
	enum BotMetricsThreadEntryPoint {
		AI_TAB_THREAD = 1,
		AI_HOME_THREAD = 2,
		AI_DEEPLINK_IMMERSIVE_THREAD = 3,
		AI_DEEPLINK_THREAD = 4,
		ASK_META_AI_CONTEXT_MENU_THREAD = 5
	}
	interface IBotModeSelectionMetadata {
		mode?: (waproto.BotModeSelectionMetadata.BotUserSelectionMode[]|null)
		overrideMode?: (number[]|null)
	}
	class BotModeSelectionMetadata implements IBotModeSelectionMetadata {
		constructor(p?: waproto.IBotModeSelectionMetadata)
		public mode: waproto.BotModeSelectionMetadata.BotUserSelectionMode[]
		public overrideMode: number[]
		public static encode(m: waproto.IBotModeSelectionMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotModeSelectionMetadata
	}
	namespace BotModeSelectionMetadata {
		enum BotUserSelectionMode {
			DEFAULT_MODE = 0,
			THINK_HARD_MODE = 1
		}
	}
	interface IBotModelMetadata {
		modelType?: (waproto.BotModelMetadata.ModelType|null)
		premiumModelStatus?: (waproto.BotModelMetadata.PremiumModelStatus|null)
		modelNameOverride?: (string|null)
	}
	class BotModelMetadata implements IBotModelMetadata {
		constructor(p?: waproto.IBotModelMetadata)
		public modelType?: (waproto.BotModelMetadata.ModelType|null)
		public premiumModelStatus?: (waproto.BotModelMetadata.PremiumModelStatus|null)
		public modelNameOverride?: (string|null)
		public static encode(m: waproto.IBotModelMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotModelMetadata
	}
	namespace BotModelMetadata {
		enum ModelType {
			UNKNOWN_TYPE = 0,
			LLAMA_PROD = 1,
			LLAMA_PROD_PREMIUM = 2
		}
		enum PremiumModelStatus {
			UNKNOWN_STATUS = 0,
			AVAILABLE = 1,
			QUOTA_EXCEED_LIMIT = 2
		}
	}
	interface IBotPluginMetadata {
		provider?: (waproto.BotPluginMetadata.SearchProvider|null)
		pluginType?: (waproto.BotPluginMetadata.PluginType|null)
		thumbnailCdnUrl?: (string|null)
		profilePhotoCdnUrl?: (string|null)
		searchProviderUrl?: (string|null)
		referenceIndex?: (number|null)
		expectedLinksCount?: (number|null)
		searchQuery?: (string|null)
		parentPluginMessageKey?: (waproto.IMessageKey|null)
		deprecatedField?: (waproto.BotPluginMetadata.PluginType|null)
		parentPluginType?: (waproto.BotPluginMetadata.PluginType|null)
		faviconCdnUrl?: (string|null)
	}
	class BotPluginMetadata implements IBotPluginMetadata {
		constructor(p?: waproto.IBotPluginMetadata)
		public provider?: (waproto.BotPluginMetadata.SearchProvider|null)
		public pluginType?: (waproto.BotPluginMetadata.PluginType|null)
		public thumbnailCdnUrl?: (string|null)
		public profilePhotoCdnUrl?: (string|null)
		public searchProviderUrl?: (string|null)
		public referenceIndex?: (number|null)
		public expectedLinksCount?: (number|null)
		public searchQuery?: (string|null)
		public parentPluginMessageKey?: (waproto.IMessageKey|null)
		public deprecatedField?: (waproto.BotPluginMetadata.PluginType|null)
		public parentPluginType?: (waproto.BotPluginMetadata.PluginType|null)
		public faviconCdnUrl?: (string|null)
		public static encode(m: waproto.IBotPluginMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotPluginMetadata
	}
	namespace BotPluginMetadata {
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
	interface IBotProgressIndicatorMetadata {
		progressDescription?: (string|null)
		stepsMetadata?: (waproto.BotProgressIndicatorMetadata.IBotPlanningStepMetadata[]|null)
		estimatedCompletionTime?: (number|Long|null)
	}
	class BotProgressIndicatorMetadata implements IBotProgressIndicatorMetadata {
		constructor(p?: waproto.IBotProgressIndicatorMetadata)
		public progressDescription?: (string|null)
		public stepsMetadata: waproto.BotProgressIndicatorMetadata.IBotPlanningStepMetadata[]
		public estimatedCompletionTime?: (number|Long|null)
		public static encode(m: waproto.IBotProgressIndicatorMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotProgressIndicatorMetadata
	}
	namespace BotProgressIndicatorMetadata {
		interface IBotPlanningStepMetadata {
			statusTitle?: (string|null)
			statusBody?: (string|null)
			sourcesMetadata?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.IBotPlanningSearchSourcesMetadata[]|null)
			status?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.PlanningStepStatus|null)
			isReasoning?: (boolean|null)
			isEnhancedSearch?: (boolean|null)
			sections?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.IBotPlanningStepSectionMetadata[]|null)
		}
		class BotPlanningStepMetadata implements IBotPlanningStepMetadata {
			constructor(p?: waproto.BotProgressIndicatorMetadata.IBotPlanningStepMetadata)
			public statusTitle?: (string|null)
			public statusBody?: (string|null)
			public sourcesMetadata: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.IBotPlanningSearchSourcesMetadata[]
			public status?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.PlanningStepStatus|null)
			public isReasoning?: (boolean|null)
			public isEnhancedSearch?: (boolean|null)
			public sections: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.IBotPlanningStepSectionMetadata[]
			public static encode(m: waproto.BotProgressIndicatorMetadata.IBotPlanningStepMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata
		}
		namespace BotPlanningStepMetadata {
			interface IBotPlanningSearchSourceMetadata {
				title?: (string|null)
				provider?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotSearchSourceProvider|null)
				sourceUrl?: (string|null)
				favIconUrl?: (string|null)
			}
			class BotPlanningSearchSourceMetadata implements IBotPlanningSearchSourceMetadata {
				constructor(p?: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.IBotPlanningSearchSourceMetadata)
				public title?: (string|null)
				public provider?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotSearchSourceProvider|null)
				public sourceUrl?: (string|null)
				public favIconUrl?: (string|null)
				public static encode(m: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.IBotPlanningSearchSourceMetadata, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourceMetadata
			}
			interface IBotPlanningSearchSourcesMetadata {
				sourceTitle?: (string|null)
				provider?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata.BotPlanningSearchSourceProvider|null)
				sourceUrl?: (string|null)
			}
			class BotPlanningSearchSourcesMetadata implements IBotPlanningSearchSourcesMetadata {
				constructor(p?: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.IBotPlanningSearchSourcesMetadata)
				public sourceTitle?: (string|null)
				public provider?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata.BotPlanningSearchSourceProvider|null)
				public sourceUrl?: (string|null)
				public static encode(m: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.IBotPlanningSearchSourcesMetadata, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningSearchSourcesMetadata
			}
			namespace BotPlanningSearchSourcesMetadata {
				enum BotPlanningSearchSourceProvider {
					UNKNOWN = 0,
					OTHER = 1,
					GOOGLE = 2,
					BING = 3
				}
			}
			interface IBotPlanningStepSectionMetadata {
				sectionTitle?: (string|null)
				sectionBody?: (string|null)
				sourcesMetadata?: (waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.IBotPlanningSearchSourceMetadata[]|null)
			}
			class BotPlanningStepSectionMetadata implements IBotPlanningStepSectionMetadata {
				constructor(p?: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.IBotPlanningStepSectionMetadata)
				public sectionTitle?: (string|null)
				public sectionBody?: (string|null)
				public sourcesMetadata: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.IBotPlanningSearchSourceMetadata[]
				public static encode(m: waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.IBotPlanningStepSectionMetadata, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.BotPlanningStepSectionMetadata
			}
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
		}
	}
	interface IBotPromotionMessageMetadata {
		promotionType?: (waproto.BotPromotionMessageMetadata.BotPromotionType|null)
		buttonTitle?: (string|null)
	}
	class BotPromotionMessageMetadata implements IBotPromotionMessageMetadata {
		constructor(p?: waproto.IBotPromotionMessageMetadata)
		public promotionType?: (waproto.BotPromotionMessageMetadata.BotPromotionType|null)
		public buttonTitle?: (string|null)
		public static encode(m: waproto.IBotPromotionMessageMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotPromotionMessageMetadata
	}
	namespace BotPromotionMessageMetadata {
		enum BotPromotionType {
			UNKNOWN_TYPE = 0,
			C50 = 1,
			SURVEY_PLATFORM = 2
		}
	}
	interface IBotPromptSuggestion {
		prompt?: (string|null)
		promptId?: (string|null)
	}
	class BotPromptSuggestion implements IBotPromptSuggestion {
		constructor(p?: waproto.IBotPromptSuggestion)
		public prompt?: (string|null)
		public promptId?: (string|null)
		public static encode(m: waproto.IBotPromptSuggestion, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotPromptSuggestion
	}
	interface IBotPromptSuggestions {
		suggestions?: (waproto.IBotPromptSuggestion[]|null)
	}
	class BotPromptSuggestions implements IBotPromptSuggestions {
		constructor(p?: waproto.IBotPromptSuggestions)
		public suggestions: waproto.IBotPromptSuggestion[]
		public static encode(m: waproto.IBotPromptSuggestions, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotPromptSuggestions
	}
	interface IBotQuotaMetadata {
		botFeatureQuotaMetadata?: (waproto.BotQuotaMetadata.IBotFeatureQuotaMetadata[]|null)
	}
	class BotQuotaMetadata implements IBotQuotaMetadata {
		constructor(p?: waproto.IBotQuotaMetadata)
		public botFeatureQuotaMetadata: waproto.BotQuotaMetadata.IBotFeatureQuotaMetadata[]
		public static encode(m: waproto.IBotQuotaMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotQuotaMetadata
	}
	namespace BotQuotaMetadata {
		interface IBotFeatureQuotaMetadata {
			featureType?: (waproto.BotQuotaMetadata.BotFeatureQuotaMetadata.BotFeatureType|null)
			remainingQuota?: (number|null)
			expirationTimestamp?: (number|Long|null)
		}
		class BotFeatureQuotaMetadata implements IBotFeatureQuotaMetadata {
			constructor(p?: waproto.BotQuotaMetadata.IBotFeatureQuotaMetadata)
			public featureType?: (waproto.BotQuotaMetadata.BotFeatureQuotaMetadata.BotFeatureType|null)
			public remainingQuota?: (number|null)
			public expirationTimestamp?: (number|Long|null)
			public static encode(m: waproto.BotQuotaMetadata.IBotFeatureQuotaMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotQuotaMetadata.BotFeatureQuotaMetadata
		}
		namespace BotFeatureQuotaMetadata {
			enum BotFeatureType {
				UNKNOWN_FEATURE = 0,
				REASONING_FEATURE = 1
			}
		}
	}
	interface IBotReminderMetadata {
		requestMessageKey?: (waproto.IMessageKey|null)
		action?: (waproto.BotReminderMetadata.ReminderAction|null)
		name?: (string|null)
		nextTriggerTimestamp?: (number|Long|null)
		frequency?: (waproto.BotReminderMetadata.ReminderFrequency|null)
	}
	class BotReminderMetadata implements IBotReminderMetadata {
		constructor(p?: waproto.IBotReminderMetadata)
		public requestMessageKey?: (waproto.IMessageKey|null)
		public action?: (waproto.BotReminderMetadata.ReminderAction|null)
		public name?: (string|null)
		public nextTriggerTimestamp?: (number|Long|null)
		public frequency?: (waproto.BotReminderMetadata.ReminderFrequency|null)
		public static encode(m: waproto.IBotReminderMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotReminderMetadata
	}
	namespace BotReminderMetadata {
		enum ReminderAction {
			NOTIFY = 1,
			CREATE = 2,
			DELETE = 3,
			UPDATE = 4
		}
		enum ReminderFrequency {
			ONCE = 1,
			DAILY = 2,
			WEEKLY = 3,
			BIWEEKLY = 4,
			MONTHLY = 5
		}
	}
	interface IBotRenderingConfigMetadata {
		bloksVersioningId?: (string|null)
		pixelDensity?: (number|null)
	}
	class BotRenderingConfigMetadata implements IBotRenderingConfigMetadata {
		constructor(p?: waproto.IBotRenderingConfigMetadata)
		public bloksVersioningId?: (string|null)
		public pixelDensity?: (number|null)
		public static encode(m: waproto.IBotRenderingConfigMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotRenderingConfigMetadata
	}
	interface IBotRenderingMetadata {
		keywords?: (waproto.BotRenderingMetadata.IKeyword[]|null)
	}
	class BotRenderingMetadata implements IBotRenderingMetadata {
		constructor(p?: waproto.IBotRenderingMetadata)
		public keywords: waproto.BotRenderingMetadata.IKeyword[]
		public static encode(m: waproto.IBotRenderingMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotRenderingMetadata
	}
	namespace BotRenderingMetadata {
		interface IKeyword {
			value?: (string|null)
			associatedPrompts?: (string[]|null)
		}
		class Keyword implements IKeyword {
			constructor(p?: waproto.BotRenderingMetadata.IKeyword)
			public value?: (string|null)
			public associatedPrompts: string[]
			public static encode(m: waproto.BotRenderingMetadata.IKeyword, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotRenderingMetadata.Keyword
		}
	}
	interface IBotSessionMetadata {
		sessionId?: (string|null)
		sessionSource?: (waproto.BotSessionSource|null)
	}
	class BotSessionMetadata implements IBotSessionMetadata {
		constructor(p?: waproto.IBotSessionMetadata)
		public sessionId?: (string|null)
		public sessionSource?: (waproto.BotSessionSource|null)
		public static encode(m: waproto.IBotSessionMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotSessionMetadata
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
	interface IBotSignatureVerificationMetadata {
		proofs?: (waproto.IBotSignatureVerificationUseCaseProof[]|null)
	}
	class BotSignatureVerificationMetadata implements IBotSignatureVerificationMetadata {
		constructor(p?: waproto.IBotSignatureVerificationMetadata)
		public proofs: waproto.IBotSignatureVerificationUseCaseProof[]
		public static encode(m: waproto.IBotSignatureVerificationMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotSignatureVerificationMetadata
	}
	interface IBotSignatureVerificationUseCaseProof {
		version?: (number|null)
		useCase?: (waproto.BotSignatureVerificationUseCaseProof.BotSignatureUseCase|null)
		signature?: (Uint8Array|null)
		certificateChain?: (Uint8Array[]|null)
	}
	class BotSignatureVerificationUseCaseProof implements IBotSignatureVerificationUseCaseProof {
		constructor(p?: waproto.IBotSignatureVerificationUseCaseProof)
		public version?: (number|null)
		public useCase?: (waproto.BotSignatureVerificationUseCaseProof.BotSignatureUseCase|null)
		public signature?: (Uint8Array|null)
		public certificateChain: Uint8Array[]
		public static encode(m: waproto.IBotSignatureVerificationUseCaseProof, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotSignatureVerificationUseCaseProof
	}
	namespace BotSignatureVerificationUseCaseProof {
		enum BotSignatureUseCase {
			UNSPECIFIED = 0,
			WA_BOT_MSG = 1,
			WA_TEE_BOT_MSG = 2
		}
	}
	interface IBotSourcesMetadata {
		sources?: (waproto.BotSourcesMetadata.IBotSourceItem[]|null)
	}
	class BotSourcesMetadata implements IBotSourcesMetadata {
		constructor(p?: waproto.IBotSourcesMetadata)
		public sources: waproto.BotSourcesMetadata.IBotSourceItem[]
		public static encode(m: waproto.IBotSourcesMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotSourcesMetadata
	}
	namespace BotSourcesMetadata {
		interface IBotSourceItem {
			provider?: (waproto.BotSourcesMetadata.BotSourceItem.SourceProvider|null)
			thumbnailCdnUrl?: (string|null)
			sourceProviderUrl?: (string|null)
			sourceQuery?: (string|null)
			faviconCdnUrl?: (string|null)
			citationNumber?: (number|null)
			sourceTitle?: (string|null)
		}
		class BotSourceItem implements IBotSourceItem {
			constructor(p?: waproto.BotSourcesMetadata.IBotSourceItem)
			public provider?: (waproto.BotSourcesMetadata.BotSourceItem.SourceProvider|null)
			public thumbnailCdnUrl?: (string|null)
			public sourceProviderUrl?: (string|null)
			public sourceQuery?: (string|null)
			public faviconCdnUrl?: (string|null)
			public citationNumber?: (number|null)
			public sourceTitle?: (string|null)
			public static encode(m: waproto.BotSourcesMetadata.IBotSourceItem, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotSourcesMetadata.BotSourceItem
		}
		namespace BotSourceItem {
			enum SourceProvider {
				UNKNOWN = 0,
				BING = 1,
				GOOGLE = 2,
				SUPPORT = 3,
				OTHER = 4
			}
		}
	}
	interface IBotSuggestedPromptMetadata {
		suggestedPrompts?: (string[]|null)
		selectedPromptIndex?: (number|null)
		promptSuggestions?: (waproto.IBotPromptSuggestions|null)
		selectedPromptId?: (string|null)
	}
	class BotSuggestedPromptMetadata implements IBotSuggestedPromptMetadata {
		constructor(p?: waproto.IBotSuggestedPromptMetadata)
		public suggestedPrompts: string[]
		public selectedPromptIndex?: (number|null)
		public promptSuggestions?: (waproto.IBotPromptSuggestions|null)
		public selectedPromptId?: (string|null)
		public static encode(m: waproto.IBotSuggestedPromptMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotSuggestedPromptMetadata
	}
	interface IBotUnifiedResponseMutation {
		sbsMetadata?: (waproto.BotUnifiedResponseMutation.ISideBySideMetadata|null)
		mediaDetailsMetadataList?: (waproto.BotUnifiedResponseMutation.IMediaDetailsMetadata[]|null)
	}
	class BotUnifiedResponseMutation implements IBotUnifiedResponseMutation {
		constructor(p?: waproto.IBotUnifiedResponseMutation)
		public sbsMetadata?: (waproto.BotUnifiedResponseMutation.ISideBySideMetadata|null)
		public mediaDetailsMetadataList: waproto.BotUnifiedResponseMutation.IMediaDetailsMetadata[]
		public static encode(m: waproto.IBotUnifiedResponseMutation, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotUnifiedResponseMutation
	}
	namespace BotUnifiedResponseMutation {
		interface IMediaDetailsMetadata {
			id?: (string|null)
			highResMedia?: (waproto.IBotMediaMetadata|null)
			previewMedia?: (waproto.IBotMediaMetadata|null)
		}
		class MediaDetailsMetadata implements IMediaDetailsMetadata {
			constructor(p?: waproto.BotUnifiedResponseMutation.IMediaDetailsMetadata)
			public id?: (string|null)
			public highResMedia?: (waproto.IBotMediaMetadata|null)
			public previewMedia?: (waproto.IBotMediaMetadata|null)
			public static encode(m: waproto.BotUnifiedResponseMutation.IMediaDetailsMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotUnifiedResponseMutation.MediaDetailsMetadata
		}
		interface ISideBySideMetadata {
			primaryResponseId?: (string|null)
			surveyCtaHasRendered?: (boolean|null)
		}
		class SideBySideMetadata implements ISideBySideMetadata {
			constructor(p?: waproto.BotUnifiedResponseMutation.ISideBySideMetadata)
			public primaryResponseId?: (string|null)
			public surveyCtaHasRendered?: (boolean|null)
			public static encode(m: waproto.BotUnifiedResponseMutation.ISideBySideMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.BotUnifiedResponseMutation.SideBySideMetadata
		}
	}
	interface ICallLogRecord {
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
		participants?: (waproto.CallLogRecord.IParticipantInfo[]|null)
		callType?: (waproto.CallLogRecord.CallType|null)
	}
	class CallLogRecord implements ICallLogRecord {
		constructor(p?: waproto.ICallLogRecord)
		public callResult?: (waproto.CallLogRecord.CallResult|null)
		public isDndMode?: (boolean|null)
		public silenceReason?: (waproto.CallLogRecord.SilenceReason|null)
		public duration?: (number|Long|null)
		public startTime?: (number|Long|null)
		public isIncoming?: (boolean|null)
		public isVideo?: (boolean|null)
		public isCallLink?: (boolean|null)
		public callLinkToken?: (string|null)
		public scheduledCallId?: (string|null)
		public callId?: (string|null)
		public callCreatorJid?: (string|null)
		public groupJid?: (string|null)
		public participants: waproto.CallLogRecord.IParticipantInfo[]
		public callType?: (waproto.CallLogRecord.CallType|null)
		public static encode(m: waproto.ICallLogRecord, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.CallLogRecord
	}
	namespace CallLogRecord {
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
		enum CallType {
			REGULAR = 0,
			SCHEDULED_CALL = 1,
			VOICE_CHAT = 2
		}
		interface IParticipantInfo {
			userJid?: (string|null)
			callResult?: (waproto.CallLogRecord.CallResult|null)
		}
		class ParticipantInfo implements IParticipantInfo {
			constructor(p?: waproto.CallLogRecord.IParticipantInfo)
			public userJid?: (string|null)
			public callResult?: (waproto.CallLogRecord.CallResult|null)
			public static encode(m: waproto.CallLogRecord.IParticipantInfo, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.CallLogRecord.ParticipantInfo
		}
		enum SilenceReason {
			NONE = 0,
			SCHEDULED = 1,
			PRIVACY = 2,
			LIGHTWEIGHT = 3
		}
	}
	interface ICertChain {
		leaf?: (waproto.CertChain.INoiseCertificate|null)
		intermediate?: (waproto.CertChain.INoiseCertificate|null)
	}
	class CertChain implements ICertChain {
		constructor(p?: waproto.ICertChain)
		public leaf?: (waproto.CertChain.INoiseCertificate|null)
		public intermediate?: (waproto.CertChain.INoiseCertificate|null)
		public static encode(m: waproto.ICertChain, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.CertChain
	}
	namespace CertChain {
		interface INoiseCertificate {
			details?: (Uint8Array|null)
			signature?: (Uint8Array|null)
		}
		class NoiseCertificate implements INoiseCertificate {
			constructor(p?: waproto.CertChain.INoiseCertificate)
			public details?: (Uint8Array|null)
			public signature?: (Uint8Array|null)
			public static encode(m: waproto.CertChain.INoiseCertificate, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.CertChain.NoiseCertificate
		}
		namespace NoiseCertificate {
			interface IDetails {
				serial?: (number|null)
				issuerSerial?: (number|null)
				key?: (Uint8Array|null)
				notBefore?: (number|Long|null)
				notAfter?: (number|Long|null)
			}
			class Details implements IDetails {
				constructor(p?: waproto.CertChain.NoiseCertificate.IDetails)
				public serial?: (number|null)
				public issuerSerial?: (number|null)
				public key?: (Uint8Array|null)
				public notBefore?: (number|Long|null)
				public notAfter?: (number|Long|null)
				public static encode(m: waproto.CertChain.NoiseCertificate.IDetails, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.CertChain.NoiseCertificate.Details
			}
		}
	}
	interface IChatLockSettings {
		hideLockedChats?: (boolean|null)
		secretCode?: (waproto.IUserPassword|null)
	}
	class ChatLockSettings implements IChatLockSettings {
		constructor(p?: waproto.IChatLockSettings)
		public hideLockedChats?: (boolean|null)
		public secretCode?: (waproto.IUserPassword|null)
		public static encode(m: waproto.IChatLockSettings, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ChatLockSettings
	}
	interface IChatRowOpaqueData {
		draftMessage?: (waproto.ChatRowOpaqueData.IDraftMessage|null)
	}
	class ChatRowOpaqueData implements IChatRowOpaqueData {
		constructor(p?: waproto.IChatRowOpaqueData)
		public draftMessage?: (waproto.ChatRowOpaqueData.IDraftMessage|null)
		public static encode(m: waproto.IChatRowOpaqueData, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ChatRowOpaqueData
	}
	namespace ChatRowOpaqueData {
		interface IDraftMessage {
			text?: (string|null)
			omittedUrl?: (string|null)
			ctwaContextLinkData?: (waproto.ChatRowOpaqueData.DraftMessage.ICtwaContextLinkData|null)
			ctwaContext?: (waproto.ChatRowOpaqueData.DraftMessage.ICtwaContextData|null)
			timestamp?: (number|Long|null)
		}
		class DraftMessage implements IDraftMessage {
			constructor(p?: waproto.ChatRowOpaqueData.IDraftMessage)
			public text?: (string|null)
			public omittedUrl?: (string|null)
			public ctwaContextLinkData?: (waproto.ChatRowOpaqueData.DraftMessage.ICtwaContextLinkData|null)
			public ctwaContext?: (waproto.ChatRowOpaqueData.DraftMessage.ICtwaContextData|null)
			public timestamp?: (number|Long|null)
			public static encode(m: waproto.ChatRowOpaqueData.IDraftMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ChatRowOpaqueData.DraftMessage
		}
		namespace DraftMessage {
			interface ICtwaContextData {
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
			}
			class CtwaContextData implements ICtwaContextData {
				constructor(p?: waproto.ChatRowOpaqueData.DraftMessage.ICtwaContextData)
				public conversionSource?: (string|null)
				public conversionData?: (Uint8Array|null)
				public sourceUrl?: (string|null)
				public sourceId?: (string|null)
				public sourceType?: (string|null)
				public title?: (string|null)
				public description?: (string|null)
				public thumbnail?: (string|null)
				public thumbnailUrl?: (string|null)
				public mediaType?: (waproto.ChatRowOpaqueData.DraftMessage.CtwaContextData.ContextInfoExternalAdReplyInfoMediaType|null)
				public mediaUrl?: (string|null)
				public isSuspiciousLink?: (boolean|null)
				public static encode(m: waproto.ChatRowOpaqueData.DraftMessage.ICtwaContextData, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ChatRowOpaqueData.DraftMessage.CtwaContextData
			}
			namespace CtwaContextData {
				enum ContextInfoExternalAdReplyInfoMediaType {
					NONE = 0,
					IMAGE = 1,
					VIDEO = 2
				}
			}
			interface ICtwaContextLinkData {
				context?: (string|null)
				sourceUrl?: (string|null)
				icebreaker?: (string|null)
				phone?: (string|null)
			}
			class CtwaContextLinkData implements ICtwaContextLinkData {
				constructor(p?: waproto.ChatRowOpaqueData.DraftMessage.ICtwaContextLinkData)
				public context?: (string|null)
				public sourceUrl?: (string|null)
				public icebreaker?: (string|null)
				public phone?: (string|null)
				public static encode(m: waproto.ChatRowOpaqueData.DraftMessage.ICtwaContextLinkData, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ChatRowOpaqueData.DraftMessage.CtwaContextLinkData
			}
		}
	}
	interface ICitation {
		title?: (string|null)
		subtitle?: (string|null)
		cmsId?: (string|null)
		imageUrl?: (string|null)
	}
	class Citation implements ICitation {
		constructor(p?: waproto.ICitation)
		public title?: (string|null)
		public subtitle?: (string|null)
		public cmsId?: (string|null)
		public imageUrl?: (string|null)
		public static encode(m: waproto.ICitation, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Citation
	}
	interface IClientPairingProps {
		isChatDbLidMigrated?: (boolean|null)
		isSyncdPureLidSession?: (boolean|null)
		isSyncdSnapshotRecoveryEnabled?: (boolean|null)
		isHsThumbnailSyncEnabled?: (boolean|null)
	}
	class ClientPairingProps implements IClientPairingProps {
		constructor(p?: waproto.IClientPairingProps)
		public isChatDbLidMigrated?: (boolean|null)
		public isSyncdPureLidSession?: (boolean|null)
		public isSyncdSnapshotRecoveryEnabled?: (boolean|null)
		public isHsThumbnailSyncEnabled?: (boolean|null)
		public static encode(m: waproto.IClientPairingProps, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPairingProps
	}
	interface IClientPayload {
		username?: (number|Long|null)
		passive?: (boolean|null)
		userAgent?: (waproto.ClientPayload.IUserAgent|null)
		webInfo?: (waproto.ClientPayload.IWebInfo|null)
		pushName?: (string|null)
		sessionId?: (number|null)
		shortConnect?: (boolean|null)
		connectType?: (waproto.ClientPayload.ConnectType|null)
		connectReason?: (waproto.ClientPayload.ConnectReason|null)
		shards?: (number[]|null)
		dnsSource?: (waproto.ClientPayload.IDNSSource|null)
		connectAttemptCount?: (number|null)
		device?: (number|null)
		devicePairingData?: (waproto.ClientPayload.IDevicePairingRegistrationData|null)
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
		interopData?: (waproto.ClientPayload.IInteropData|null)
		trafficAnonymization?: (waproto.ClientPayload.TrafficAnonymization|null)
		lidDbMigrated?: (boolean|null)
		accountType?: (waproto.ClientPayload.AccountType|null)
		connectionSequenceInfo?: (number|null)
		paaLink?: (boolean|null)
		preacksCount?: (number|null)
		processingQueueSize?: (number|null)
		pairedPeripherals?: (string[]|null)
	}
	class ClientPayload implements IClientPayload {
		constructor(p?: waproto.IClientPayload)
		public username?: (number|Long|null)
		public passive?: (boolean|null)
		public userAgent?: (waproto.ClientPayload.IUserAgent|null)
		public webInfo?: (waproto.ClientPayload.IWebInfo|null)
		public pushName?: (string|null)
		public sessionId?: (number|null)
		public shortConnect?: (boolean|null)
		public connectType?: (waproto.ClientPayload.ConnectType|null)
		public connectReason?: (waproto.ClientPayload.ConnectReason|null)
		public shards: number[]
		public dnsSource?: (waproto.ClientPayload.IDNSSource|null)
		public connectAttemptCount?: (number|null)
		public device?: (number|null)
		public devicePairingData?: (waproto.ClientPayload.IDevicePairingRegistrationData|null)
		public product?: (waproto.ClientPayload.Product|null)
		public fbCat?: (Uint8Array|null)
		public fbUserAgent?: (Uint8Array|null)
		public oc?: (boolean|null)
		public lc?: (number|null)
		public iosAppExtension?: (waproto.ClientPayload.IOSAppExtension|null)
		public fbAppId?: (number|Long|null)
		public fbDeviceId?: (Uint8Array|null)
		public pull?: (boolean|null)
		public paddingBytes?: (Uint8Array|null)
		public yearClass?: (number|null)
		public memClass?: (number|null)
		public interopData?: (waproto.ClientPayload.IInteropData|null)
		public trafficAnonymization?: (waproto.ClientPayload.TrafficAnonymization|null)
		public lidDbMigrated?: (boolean|null)
		public accountType?: (waproto.ClientPayload.AccountType|null)
		public connectionSequenceInfo?: (number|null)
		public paaLink?: (boolean|null)
		public preacksCount?: (number|null)
		public processingQueueSize?: (number|null)
		public pairedPeripherals: string[]
		public static encode(m: waproto.IClientPayload, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload
	}
	namespace ClientPayload {
		enum AccountType {
			DEFAULT = 0,
			GUEST = 1
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
		interface IDNSSource {
			dnsMethod?: (waproto.ClientPayload.DNSSource.DNSResolutionMethod|null)
			appCached?: (boolean|null)
		}
		class DNSSource implements IDNSSource {
			constructor(p?: waproto.ClientPayload.IDNSSource)
			public dnsMethod?: (waproto.ClientPayload.DNSSource.DNSResolutionMethod|null)
			public appCached?: (boolean|null)
			public static encode(m: waproto.ClientPayload.IDNSSource, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.DNSSource
		}
		namespace DNSSource {
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
		interface IDevicePairingRegistrationData {
			eRegid?: (Uint8Array|null)
			eKeytype?: (Uint8Array|null)
			eIdent?: (Uint8Array|null)
			eSkeyId?: (Uint8Array|null)
			eSkeyVal?: (Uint8Array|null)
			eSkeySig?: (Uint8Array|null)
			buildHash?: (Uint8Array|null)
			deviceProps?: (Uint8Array|null)
		}
		class DevicePairingRegistrationData implements IDevicePairingRegistrationData {
			constructor(p?: waproto.ClientPayload.IDevicePairingRegistrationData)
			public eRegid?: (Uint8Array|null)
			public eKeytype?: (Uint8Array|null)
			public eIdent?: (Uint8Array|null)
			public eSkeyId?: (Uint8Array|null)
			public eSkeyVal?: (Uint8Array|null)
			public eSkeySig?: (Uint8Array|null)
			public buildHash?: (Uint8Array|null)
			public deviceProps?: (Uint8Array|null)
			public static encode(m: waproto.ClientPayload.IDevicePairingRegistrationData, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.DevicePairingRegistrationData
		}
		enum IOSAppExtension {
			SHARE_EXTENSION = 0,
			SERVICE_EXTENSION = 1,
			INTENTS_EXTENSION = 2
		}
		interface IInteropData {
			accountId?: (number|Long|null)
			token?: (Uint8Array|null)
			enableReadReceipts?: (boolean|null)
		}
		class InteropData implements IInteropData {
			constructor(p?: waproto.ClientPayload.IInteropData)
			public accountId?: (number|Long|null)
			public token?: (Uint8Array|null)
			public enableReadReceipts?: (boolean|null)
			public static encode(m: waproto.ClientPayload.IInteropData, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.InteropData
		}
		enum Product {
			WHATSAPP = 0,
			MESSENGER = 1,
			INTEROP = 2,
			INTEROP_MSGR = 3,
			WHATSAPP_LID = 4
		}
		enum TrafficAnonymization {
			OFF = 0,
			STANDARD = 1
		}
		interface IUserAgent {
			platform?: (waproto.ClientPayload.UserAgent.Platform|null)
			appVersion?: (waproto.ClientPayload.UserAgent.IAppVersion|null)
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
		}
		class UserAgent implements IUserAgent {
			constructor(p?: waproto.ClientPayload.IUserAgent)
			public platform?: (waproto.ClientPayload.UserAgent.Platform|null)
			public appVersion?: (waproto.ClientPayload.UserAgent.IAppVersion|null)
			public mcc?: (string|null)
			public mnc?: (string|null)
			public osVersion?: (string|null)
			public manufacturer?: (string|null)
			public device?: (string|null)
			public osBuildNumber?: (string|null)
			public phoneId?: (string|null)
			public releaseChannel?: (waproto.ClientPayload.UserAgent.ReleaseChannel|null)
			public localeLanguageIso6391?: (string|null)
			public localeCountryIso31661Alpha2?: (string|null)
			public deviceBoard?: (string|null)
			public deviceExpId?: (string|null)
			public deviceType?: (waproto.ClientPayload.UserAgent.DeviceType|null)
			public deviceModelType?: (string|null)
			public static encode(m: waproto.ClientPayload.IUserAgent, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.UserAgent
		}
		namespace UserAgent {
			interface IAppVersion {
				primary?: (number|null)
				secondary?: (number|null)
				tertiary?: (number|null)
				quaternary?: (number|null)
				quinary?: (number|null)
			}
			class AppVersion implements IAppVersion {
				constructor(p?: waproto.ClientPayload.UserAgent.IAppVersion)
				public primary?: (number|null)
				public secondary?: (number|null)
				public tertiary?: (number|null)
				public quaternary?: (number|null)
				public quinary?: (number|null)
				public static encode(m: waproto.ClientPayload.UserAgent.IAppVersion, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.UserAgent.AppVersion
			}
			enum DeviceType {
				PHONE = 0,
				TABLET = 1,
				DESKTOP = 2,
				WEARABLE = 3,
				VR = 4
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
			enum ReleaseChannel {
				RELEASE = 0,
				BETA = 1,
				ALPHA = 2,
				DEBUG = 3
			}
		}
		interface IWebInfo {
			refToken?: (string|null)
			version?: (string|null)
			webdPayload?: (waproto.ClientPayload.WebInfo.IWebdPayload|null)
			webSubPlatform?: (waproto.ClientPayload.WebInfo.WebSubPlatform|null)
			browser?: (string|null)
			browserVersion?: (string|null)
		}
		class WebInfo implements IWebInfo {
			constructor(p?: waproto.ClientPayload.IWebInfo)
			public refToken?: (string|null)
			public version?: (string|null)
			public webdPayload?: (waproto.ClientPayload.WebInfo.IWebdPayload|null)
			public webSubPlatform?: (waproto.ClientPayload.WebInfo.WebSubPlatform|null)
			public browser?: (string|null)
			public browserVersion?: (string|null)
			public static encode(m: waproto.ClientPayload.IWebInfo, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.WebInfo
		}
		namespace WebInfo {
			enum WebSubPlatform {
				WEB_BROWSER = 0,
				APP_STORE = 1,
				WIN_STORE = 2,
				DARWIN = 3,
				WIN32 = 4,
				WIN_HYBRID = 5
			}
			interface IWebdPayload {
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
			}
			class WebdPayload implements IWebdPayload {
				constructor(p?: waproto.ClientPayload.WebInfo.IWebdPayload)
				public usesParticipantInKey?: (boolean|null)
				public supportsStarredMessages?: (boolean|null)
				public supportsDocumentMessages?: (boolean|null)
				public supportsUrlMessages?: (boolean|null)
				public supportsMediaRetry?: (boolean|null)
				public supportsE2EImage?: (boolean|null)
				public supportsE2EVideo?: (boolean|null)
				public supportsE2EAudio?: (boolean|null)
				public supportsE2EDocument?: (boolean|null)
				public documentTypes?: (string|null)
				public features?: (Uint8Array|null)
				public static encode(m: waproto.ClientPayload.WebInfo.IWebdPayload, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ClientPayload.WebInfo.WebdPayload
			}
		}
	}
	enum CollectionName {
		COLLECTION_NAME_UNKNOWN = 0,
		REGULAR = 1,
		REGULAR_LOW = 2,
		REGULAR_HIGH = 3,
		CRITICAL_BLOCK = 4,
		CRITICAL_UNBLOCK_LOW = 5
	}
	interface ICommentMetadata {
		commentParentKey?: (waproto.IMessageKey|null)
		replyCount?: (number|null)
	}
	class CommentMetadata implements ICommentMetadata {
		constructor(p?: waproto.ICommentMetadata)
		public commentParentKey?: (waproto.IMessageKey|null)
		public replyCount?: (number|null)
		public static encode(m: waproto.ICommentMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.CommentMetadata
	}
	interface ICompanionCommitment {
		hash?: (Uint8Array|null)
	}
	class CompanionCommitment implements ICompanionCommitment {
		constructor(p?: waproto.ICompanionCommitment)
		public hash?: (Uint8Array|null)
		public static encode(m: waproto.ICompanionCommitment, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.CompanionCommitment
	}
	interface ICompanionEphemeralIdentity {
		publicKey?: (Uint8Array|null)
		deviceType?: (waproto.DeviceProps.PlatformType|null)
		ref?: (string|null)
	}
	class CompanionEphemeralIdentity implements ICompanionEphemeralIdentity {
		constructor(p?: waproto.ICompanionEphemeralIdentity)
		public publicKey?: (Uint8Array|null)
		public deviceType?: (waproto.DeviceProps.PlatformType|null)
		public ref?: (string|null)
		public static encode(m: waproto.ICompanionEphemeralIdentity, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.CompanionEphemeralIdentity
	}
	interface IConfig {
		field?: ({ [k: string]: waproto.IField }|null)
		version?: (number|null)
	}
	class Config implements IConfig {
		constructor(p?: waproto.IConfig)
		public field: { [k: string]: waproto.IField }
		public version?: (number|null)
		public static encode(m: waproto.IConfig, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Config
	}
	interface IContextInfo {
		stanzaId?: (string|null)
		participant?: (string|null)
		quotedMessage?: (waproto.IMessage|null)
		remoteJid?: (string|null)
		mentionedJid?: (string[]|null)
		conversionSource?: (string|null)
		conversionData?: (Uint8Array|null)
		conversionDelaySeconds?: (number|null)
		forwardingScore?: (number|null)
		isForwarded?: (boolean|null)
		quotedAd?: (waproto.ContextInfo.IAdReplyInfo|null)
		placeholderKey?: (waproto.IMessageKey|null)
		expiration?: (number|null)
		ephemeralSettingTimestamp?: (number|Long|null)
		ephemeralSharedSecret?: (Uint8Array|null)
		externalAdReply?: (waproto.ContextInfo.IExternalAdReplyInfo|null)
		entryPointConversionSource?: (string|null)
		entryPointConversionApp?: (string|null)
		entryPointConversionDelaySeconds?: (number|null)
		disappearingMode?: (waproto.IDisappearingMode|null)
		actionLink?: (waproto.IActionLink|null)
		groupSubject?: (string|null)
		parentGroupJid?: (string|null)
		trustBannerType?: (string|null)
		trustBannerAction?: (number|null)
		isSampled?: (boolean|null)
		groupMentions?: (waproto.IGroupMention[]|null)
		utm?: (waproto.ContextInfo.IUTMInfo|null)
		forwardedNewsletterMessageInfo?: (waproto.ContextInfo.IForwardedNewsletterMessageInfo|null)
		businessMessageForwardInfo?: (waproto.ContextInfo.IBusinessMessageForwardInfo|null)
		smbClientCampaignId?: (string|null)
		smbServerCampaignId?: (string|null)
		dataSharingContext?: (waproto.ContextInfo.IDataSharingContext|null)
		alwaysShowAdAttribution?: (boolean|null)
		featureEligibilities?: (waproto.ContextInfo.IFeatureEligibilities|null)
		entryPointConversionExternalSource?: (string|null)
		entryPointConversionExternalMedium?: (string|null)
		ctwaSignals?: (string|null)
		ctwaPayload?: (Uint8Array|null)
		forwardedAiBotMessageInfo?: (waproto.IForwardedAIBotMessageInfo|null)
		statusAttributionType?: (waproto.ContextInfo.StatusAttributionType|null)
		urlTrackingMap?: (waproto.IUrlTrackingMap|null)
		pairedMediaType?: (waproto.ContextInfo.PairedMediaType|null)
		rankingVersion?: (number|null)
		memberLabel?: (waproto.IMemberLabel|null)
		isQuestion?: (boolean|null)
		statusSourceType?: (waproto.ContextInfo.StatusSourceType|null)
		statusAttributions?: (waproto.IStatusAttribution[]|null)
		isGroupStatus?: (boolean|null)
		forwardOrigin?: (waproto.ContextInfo.ForwardOrigin|null)
		questionReplyQuotedMessage?: (waproto.ContextInfo.IQuestionReplyQuotedMessage|null)
		statusAudienceMetadata?: (waproto.ContextInfo.IStatusAudienceMetadata|null)
		nonJidMentions?: (number|null)
		quotedType?: (waproto.ContextInfo.QuotedType|null)
		botMessageSharingInfo?: (waproto.IBotMessageSharingInfo|null)
		isSpoiler?: (boolean|null)
		mediaDomainInfo?: (waproto.IMediaDomainInfo|null)
		partiallySelectedContent?: (waproto.ContextInfo.IPartiallySelectedContent|null)
		afterReadDuration?: (number|null)
	}
	class ContextInfo implements IContextInfo {
		constructor(p?: waproto.IContextInfo)
		public stanzaId?: (string|null)
		public participant?: (string|null)
		public quotedMessage?: (waproto.IMessage|null)
		public remoteJid?: (string|null)
		public mentionedJid: string[]
		public conversionSource?: (string|null)
		public conversionData?: (Uint8Array|null)
		public conversionDelaySeconds?: (number|null)
		public forwardingScore?: (number|null)
		public isForwarded?: (boolean|null)
		public quotedAd?: (waproto.ContextInfo.IAdReplyInfo|null)
		public placeholderKey?: (waproto.IMessageKey|null)
		public expiration?: (number|null)
		public ephemeralSettingTimestamp?: (number|Long|null)
		public ephemeralSharedSecret?: (Uint8Array|null)
		public externalAdReply?: (waproto.ContextInfo.IExternalAdReplyInfo|null)
		public entryPointConversionSource?: (string|null)
		public entryPointConversionApp?: (string|null)
		public entryPointConversionDelaySeconds?: (number|null)
		public disappearingMode?: (waproto.IDisappearingMode|null)
		public actionLink?: (waproto.IActionLink|null)
		public groupSubject?: (string|null)
		public parentGroupJid?: (string|null)
		public trustBannerType?: (string|null)
		public trustBannerAction?: (number|null)
		public isSampled?: (boolean|null)
		public groupMentions: waproto.IGroupMention[]
		public utm?: (waproto.ContextInfo.IUTMInfo|null)
		public forwardedNewsletterMessageInfo?: (waproto.ContextInfo.IForwardedNewsletterMessageInfo|null)
		public businessMessageForwardInfo?: (waproto.ContextInfo.IBusinessMessageForwardInfo|null)
		public smbClientCampaignId?: (string|null)
		public smbServerCampaignId?: (string|null)
		public dataSharingContext?: (waproto.ContextInfo.IDataSharingContext|null)
		public alwaysShowAdAttribution?: (boolean|null)
		public featureEligibilities?: (waproto.ContextInfo.IFeatureEligibilities|null)
		public entryPointConversionExternalSource?: (string|null)
		public entryPointConversionExternalMedium?: (string|null)
		public ctwaSignals?: (string|null)
		public ctwaPayload?: (Uint8Array|null)
		public forwardedAiBotMessageInfo?: (waproto.IForwardedAIBotMessageInfo|null)
		public statusAttributionType?: (waproto.ContextInfo.StatusAttributionType|null)
		public urlTrackingMap?: (waproto.IUrlTrackingMap|null)
		public pairedMediaType?: (waproto.ContextInfo.PairedMediaType|null)
		public rankingVersion?: (number|null)
		public memberLabel?: (waproto.IMemberLabel|null)
		public isQuestion?: (boolean|null)
		public statusSourceType?: (waproto.ContextInfo.StatusSourceType|null)
		public statusAttributions: waproto.IStatusAttribution[]
		public isGroupStatus?: (boolean|null)
		public forwardOrigin?: (waproto.ContextInfo.ForwardOrigin|null)
		public questionReplyQuotedMessage?: (waproto.ContextInfo.IQuestionReplyQuotedMessage|null)
		public statusAudienceMetadata?: (waproto.ContextInfo.IStatusAudienceMetadata|null)
		public nonJidMentions?: (number|null)
		public quotedType?: (waproto.ContextInfo.QuotedType|null)
		public botMessageSharingInfo?: (waproto.IBotMessageSharingInfo|null)
		public isSpoiler?: (boolean|null)
		public mediaDomainInfo?: (waproto.IMediaDomainInfo|null)
		public partiallySelectedContent?: (waproto.ContextInfo.IPartiallySelectedContent|null)
		public afterReadDuration?: (number|null)
		public static encode(m: waproto.IContextInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo
	}
	namespace ContextInfo {
		interface IAdReplyInfo {
			advertiserName?: (string|null)
			mediaType?: (waproto.ContextInfo.AdReplyInfo.MediaType|null)
			jpegThumbnail?: (Uint8Array|null)
			caption?: (string|null)
		}
		class AdReplyInfo implements IAdReplyInfo {
			constructor(p?: waproto.ContextInfo.IAdReplyInfo)
			public advertiserName?: (string|null)
			public mediaType?: (waproto.ContextInfo.AdReplyInfo.MediaType|null)
			public jpegThumbnail?: (Uint8Array|null)
			public caption?: (string|null)
			public static encode(m: waproto.ContextInfo.IAdReplyInfo, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.AdReplyInfo
		}
		namespace AdReplyInfo {
			enum MediaType {
				NONE = 0,
				IMAGE = 1,
				VIDEO = 2
			}
		}
		interface IBusinessMessageForwardInfo {
			businessOwnerJid?: (string|null)
		}
		class BusinessMessageForwardInfo implements IBusinessMessageForwardInfo {
			constructor(p?: waproto.ContextInfo.IBusinessMessageForwardInfo)
			public businessOwnerJid?: (string|null)
			public static encode(m: waproto.ContextInfo.IBusinessMessageForwardInfo, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.BusinessMessageForwardInfo
		}
		interface IDataSharingContext {
			showMmDisclosure?: (boolean|null)
			encryptedSignalTokenConsented?: (string|null)
			parameters?: (waproto.ContextInfo.DataSharingContext.IParameters[]|null)
			dataSharingFlags?: (number|null)
		}
		class DataSharingContext implements IDataSharingContext {
			constructor(p?: waproto.ContextInfo.IDataSharingContext)
			public showMmDisclosure?: (boolean|null)
			public encryptedSignalTokenConsented?: (string|null)
			public parameters: waproto.ContextInfo.DataSharingContext.IParameters[]
			public dataSharingFlags?: (number|null)
			public static encode(m: waproto.ContextInfo.IDataSharingContext, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.DataSharingContext
		}
		namespace DataSharingContext {
			enum DataSharingFlags {
				SHOW_MM_DISCLOSURE_ON_CLICK = 1,
				SHOW_MM_DISCLOSURE_ON_READ = 2
			}
			interface IParameters {
				key?: (string|null)
				stringData?: (string|null)
				intData?: (number|Long|null)
				floatData?: (number|null)
				contents?: (waproto.ContextInfo.DataSharingContext.IParameters|null)
			}
			class Parameters implements IParameters {
				constructor(p?: waproto.ContextInfo.DataSharingContext.IParameters)
				public key?: (string|null)
				public stringData?: (string|null)
				public intData?: (number|Long|null)
				public floatData?: (number|null)
				public contents?: (waproto.ContextInfo.DataSharingContext.IParameters|null)
				public static encode(m: waproto.ContextInfo.DataSharingContext.IParameters, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.DataSharingContext.Parameters
			}
		}
		interface IExternalAdReplyInfo {
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
		}
		class ExternalAdReplyInfo implements IExternalAdReplyInfo {
			constructor(p?: waproto.ContextInfo.IExternalAdReplyInfo)
			public title?: (string|null)
			public body?: (string|null)
			public mediaType?: (waproto.ContextInfo.ExternalAdReplyInfo.MediaType|null)
			public thumbnailUrl?: (string|null)
			public mediaUrl?: (string|null)
			public thumbnail?: (Uint8Array|null)
			public sourceType?: (string|null)
			public sourceId?: (string|null)
			public sourceUrl?: (string|null)
			public containsAutoReply?: (boolean|null)
			public renderLargerThumbnail?: (boolean|null)
			public showAdAttribution?: (boolean|null)
			public ctwaClid?: (string|null)
			public ref?: (string|null)
			public clickToWhatsappCall?: (boolean|null)
			public adContextPreviewDismissed?: (boolean|null)
			public sourceApp?: (string|null)
			public automatedGreetingMessageShown?: (boolean|null)
			public greetingMessageBody?: (string|null)
			public ctaPayload?: (string|null)
			public disableNudge?: (boolean|null)
			public originalImageUrl?: (string|null)
			public automatedGreetingMessageCtaType?: (string|null)
			public wtwaAdFormat?: (boolean|null)
			public adType?: (waproto.ContextInfo.ExternalAdReplyInfo.AdType|null)
			public wtwaWebsiteUrl?: (string|null)
			public adPreviewUrl?: (string|null)
			public static encode(m: waproto.ContextInfo.IExternalAdReplyInfo, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.ExternalAdReplyInfo
		}
		namespace ExternalAdReplyInfo {
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
		interface IFeatureEligibilities {
			cannotBeReactedTo?: (boolean|null)
			cannotBeRanked?: (boolean|null)
			canRequestFeedback?: (boolean|null)
			canBeReshared?: (boolean|null)
			canReceiveMultiReact?: (boolean|null)
		}
		class FeatureEligibilities implements IFeatureEligibilities {
			constructor(p?: waproto.ContextInfo.IFeatureEligibilities)
			public cannotBeReactedTo?: (boolean|null)
			public cannotBeRanked?: (boolean|null)
			public canRequestFeedback?: (boolean|null)
			public canBeReshared?: (boolean|null)
			public canReceiveMultiReact?: (boolean|null)
			public static encode(m: waproto.ContextInfo.IFeatureEligibilities, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.FeatureEligibilities
		}
		enum ForwardOrigin {
			UNKNOWN = 0,
			CHAT = 1,
			STATUS = 2,
			CHANNELS = 3,
			META_AI = 4,
			UGC = 5
		}
		interface IForwardedNewsletterMessageInfo {
			newsletterJid?: (string|null)
			serverMessageId?: (number|null)
			newsletterName?: (string|null)
			contentType?: (waproto.ContextInfo.ForwardedNewsletterMessageInfo.ContentType|null)
			accessibilityText?: (string|null)
			profileName?: (string|null)
		}
		class ForwardedNewsletterMessageInfo implements IForwardedNewsletterMessageInfo {
			constructor(p?: waproto.ContextInfo.IForwardedNewsletterMessageInfo)
			public newsletterJid?: (string|null)
			public serverMessageId?: (number|null)
			public newsletterName?: (string|null)
			public contentType?: (waproto.ContextInfo.ForwardedNewsletterMessageInfo.ContentType|null)
			public accessibilityText?: (string|null)
			public profileName?: (string|null)
			public static encode(m: waproto.ContextInfo.IForwardedNewsletterMessageInfo, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.ForwardedNewsletterMessageInfo
		}
		namespace ForwardedNewsletterMessageInfo {
			enum ContentType {
				UPDATE = 1,
				UPDATE_CARD = 2,
				LINK_CARD = 3
			}
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
		interface IPartiallySelectedContent {
			text?: (string|null)
		}
		class PartiallySelectedContent implements IPartiallySelectedContent {
			constructor(p?: waproto.ContextInfo.IPartiallySelectedContent)
			public text?: (string|null)
			public static encode(m: waproto.ContextInfo.IPartiallySelectedContent, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.PartiallySelectedContent
		}
		interface IQuestionReplyQuotedMessage {
			serverQuestionId?: (number|null)
			quotedQuestion?: (waproto.IMessage|null)
			quotedResponse?: (waproto.IMessage|null)
		}
		class QuestionReplyQuotedMessage implements IQuestionReplyQuotedMessage {
			constructor(p?: waproto.ContextInfo.IQuestionReplyQuotedMessage)
			public serverQuestionId?: (number|null)
			public quotedQuestion?: (waproto.IMessage|null)
			public quotedResponse?: (waproto.IMessage|null)
			public static encode(m: waproto.ContextInfo.IQuestionReplyQuotedMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.QuestionReplyQuotedMessage
		}
		enum QuotedType {
			EXPLICIT = 0,
			AUTO = 1
		}
		enum StatusAttributionType {
			NONE = 0,
			RESHARED_FROM_MENTION = 1,
			RESHARED_FROM_POST = 2,
			RESHARED_FROM_POST_MANY_TIMES = 3,
			FORWARDED_FROM_STATUS = 4
		}
		interface IStatusAudienceMetadata {
			audienceType?: (waproto.ContextInfo.StatusAudienceMetadata.AudienceType|null)
			listName?: (string|null)
			listEmoji?: (string|null)
		}
		class StatusAudienceMetadata implements IStatusAudienceMetadata {
			constructor(p?: waproto.ContextInfo.IStatusAudienceMetadata)
			public audienceType?: (waproto.ContextInfo.StatusAudienceMetadata.AudienceType|null)
			public listName?: (string|null)
			public listEmoji?: (string|null)
			public static encode(m: waproto.ContextInfo.IStatusAudienceMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.StatusAudienceMetadata
		}
		namespace StatusAudienceMetadata {
			enum AudienceType {
				UNKNOWN = 0,
				CLOSE_FRIENDS = 1
			}
		}
		enum StatusSourceType {
			IMAGE = 0,
			VIDEO = 1,
			GIF = 2,
			AUDIO = 3,
			TEXT = 4,
			MUSIC_STANDALONE = 5
		}
		interface IUTMInfo {
			utmSource?: (string|null)
			utmCampaign?: (string|null)
		}
		class UTMInfo implements IUTMInfo {
			constructor(p?: waproto.ContextInfo.IUTMInfo)
			public utmSource?: (string|null)
			public utmCampaign?: (string|null)
			public static encode(m: waproto.ContextInfo.IUTMInfo, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ContextInfo.UTMInfo
		}
	}
	interface IConversation {
		id?: (string|null)
		messages?: (waproto.IHistorySyncMsg[]|null)
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
		disappearingMode?: (waproto.IDisappearingMode|null)
		unreadMentionCount?: (number|null)
		markedAsUnread?: (boolean|null)
		participant?: (waproto.IGroupParticipant[]|null)
		tcToken?: (Uint8Array|null)
		tcTokenTimestamp?: (number|Long|null)
		contactPrimaryIdentityKey?: (Uint8Array|null)
		pinned?: (number|null)
		muteEndTime?: (number|Long|null)
		wallpaper?: (waproto.IWallpaperSettings|null)
		mediaVisibility?: (waproto.MediaVisibility|null)
		tcTokenSenderTimestamp?: (number|Long|null)
		suspended?: (boolean|null)
		terminated?: (boolean|null)
		createdAt?: (number|Long|null)
		createdBy?: (string|null)
		description?: (string|null)
		support?: (boolean|null)
		isParentGroup?: (boolean|null)
		parentGroupId?: (string|null)
		isDefaultSubgroup?: (boolean|null)
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
		limitSharingTrigger?: (waproto.LimitSharing.TriggerType|null)
		limitSharingInitiatedByMe?: (boolean|null)
		maibaAiThreadEnabled?: (boolean|null)
		isMarketingMessageThread?: (boolean|null)
	}
	class Conversation implements IConversation {
		constructor(p?: waproto.IConversation)
		public id?: (string|null)
		public messages: waproto.IHistorySyncMsg[]
		public newJid?: (string|null)
		public oldJid?: (string|null)
		public lastMsgTimestamp?: (number|Long|null)
		public unreadCount?: (number|null)
		public readOnly?: (boolean|null)
		public endOfHistoryTransfer?: (boolean|null)
		public ephemeralExpiration?: (number|null)
		public ephemeralSettingTimestamp?: (number|Long|null)
		public endOfHistoryTransferType?: (waproto.Conversation.EndOfHistoryTransferType|null)
		public conversationTimestamp?: (number|Long|null)
		public name?: (string|null)
		public pHash?: (string|null)
		public notSpam?: (boolean|null)
		public archived?: (boolean|null)
		public disappearingMode?: (waproto.IDisappearingMode|null)
		public unreadMentionCount?: (number|null)
		public markedAsUnread?: (boolean|null)
		public participant: waproto.IGroupParticipant[]
		public tcToken?: (Uint8Array|null)
		public tcTokenTimestamp?: (number|Long|null)
		public contactPrimaryIdentityKey?: (Uint8Array|null)
		public pinned?: (number|null)
		public muteEndTime?: (number|Long|null)
		public wallpaper?: (waproto.IWallpaperSettings|null)
		public mediaVisibility?: (waproto.MediaVisibility|null)
		public tcTokenSenderTimestamp?: (number|Long|null)
		public suspended?: (boolean|null)
		public terminated?: (boolean|null)
		public createdAt?: (number|Long|null)
		public createdBy?: (string|null)
		public description?: (string|null)
		public support?: (boolean|null)
		public isParentGroup?: (boolean|null)
		public parentGroupId?: (string|null)
		public isDefaultSubgroup?: (boolean|null)
		public displayName?: (string|null)
		public pnJid?: (string|null)
		public shareOwnPn?: (boolean|null)
		public pnhDuplicateLidThread?: (boolean|null)
		public lidJid?: (string|null)
		public username?: (string|null)
		public lidOriginType?: (string|null)
		public commentsCount?: (number|null)
		public locked?: (boolean|null)
		public systemMessageToInsert?: (waproto.PrivacySystemMessage|null)
		public capiCreatedGroup?: (boolean|null)
		public accountLid?: (string|null)
		public limitSharing?: (boolean|null)
		public limitSharingSettingTimestamp?: (number|Long|null)
		public limitSharingTrigger?: (waproto.LimitSharing.TriggerType|null)
		public limitSharingInitiatedByMe?: (boolean|null)
		public maibaAiThreadEnabled?: (boolean|null)
		public isMarketingMessageThread?: (boolean|null)
		public static encode(m: waproto.IConversation, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Conversation
	}
	namespace Conversation {
		enum EndOfHistoryTransferType {
			COMPLETE_BUT_MORE_MESSAGES_REMAIN_ON_PRIMARY = 0,
			COMPLETE_AND_NO_MORE_MESSAGE_REMAIN_ON_PRIMARY = 1,
			COMPLETE_ON_DEMAND_SYNC_BUT_MORE_MSG_REMAIN_ON_PRIMARY = 2,
			COMPLETE_ON_DEMAND_SYNC_WITH_MORE_MSG_ON_PRIMARY_BUT_NO_ACCESS = 3
		}
	}
	interface IDeviceCapabilities {
		chatLockSupportLevel?: (waproto.DeviceCapabilities.ChatLockSupportLevel|null)
		lidMigration?: (waproto.DeviceCapabilities.ILIDMigration|null)
		businessBroadcast?: (waproto.DeviceCapabilities.IBusinessBroadcast|null)
		userHasAvatar?: (waproto.DeviceCapabilities.IUserHasAvatar|null)
		memberNameTagPrimarySupport?: (waproto.DeviceCapabilities.MemberNameTagPrimarySupport|null)
		aiThread?: (waproto.DeviceCapabilities.IAiThread|null)
	}
	class DeviceCapabilities implements IDeviceCapabilities {
		constructor(p?: waproto.IDeviceCapabilities)
		public chatLockSupportLevel?: (waproto.DeviceCapabilities.ChatLockSupportLevel|null)
		public lidMigration?: (waproto.DeviceCapabilities.ILIDMigration|null)
		public businessBroadcast?: (waproto.DeviceCapabilities.IBusinessBroadcast|null)
		public userHasAvatar?: (waproto.DeviceCapabilities.IUserHasAvatar|null)
		public memberNameTagPrimarySupport?: (waproto.DeviceCapabilities.MemberNameTagPrimarySupport|null)
		public aiThread?: (waproto.DeviceCapabilities.IAiThread|null)
		public static encode(m: waproto.IDeviceCapabilities, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceCapabilities
	}
	namespace DeviceCapabilities {
		interface IAiThread {
			supportLevel?: (waproto.DeviceCapabilities.AiThread.SupportLevel|null)
		}
		class AiThread implements IAiThread {
			constructor(p?: waproto.DeviceCapabilities.IAiThread)
			public supportLevel?: (waproto.DeviceCapabilities.AiThread.SupportLevel|null)
			public static encode(m: waproto.DeviceCapabilities.IAiThread, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceCapabilities.AiThread
		}
		namespace AiThread {
			enum SupportLevel {
				NONE = 0,
				INFRA = 1,
				FULL = 2
			}
		}
		interface IBusinessBroadcast {
			importListEnabled?: (boolean|null)
			companionSupportEnabled?: (boolean|null)
		}
		class BusinessBroadcast implements IBusinessBroadcast {
			constructor(p?: waproto.DeviceCapabilities.IBusinessBroadcast)
			public importListEnabled?: (boolean|null)
			public companionSupportEnabled?: (boolean|null)
			public static encode(m: waproto.DeviceCapabilities.IBusinessBroadcast, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceCapabilities.BusinessBroadcast
		}
		enum ChatLockSupportLevel {
			NONE = 0,
			MINIMAL = 1,
			FULL = 2
		}
		interface ILIDMigration {
			chatDbMigrationTimestamp?: (number|Long|null)
		}
		class LIDMigration implements ILIDMigration {
			constructor(p?: waproto.DeviceCapabilities.ILIDMigration)
			public chatDbMigrationTimestamp?: (number|Long|null)
			public static encode(m: waproto.DeviceCapabilities.ILIDMigration, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceCapabilities.LIDMigration
		}
		enum MemberNameTagPrimarySupport {
			DISABLED = 0,
			RECEIVER_ENABLED = 1,
			SENDER_ENABLED = 2
		}
		interface IUserHasAvatar {
			userHasAvatar?: (boolean|null)
		}
		class UserHasAvatar implements IUserHasAvatar {
			constructor(p?: waproto.DeviceCapabilities.IUserHasAvatar)
			public userHasAvatar?: (boolean|null)
			public static encode(m: waproto.DeviceCapabilities.IUserHasAvatar, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceCapabilities.UserHasAvatar
		}
	}
	interface IDeviceConsistencyCodeMessage {
		generation?: (number|null)
		signature?: (Uint8Array|null)
	}
	class DeviceConsistencyCodeMessage implements IDeviceConsistencyCodeMessage {
		constructor(p?: waproto.IDeviceConsistencyCodeMessage)
		public generation?: (number|null)
		public signature?: (Uint8Array|null)
		public static encode(m: waproto.IDeviceConsistencyCodeMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceConsistencyCodeMessage
	}
	interface IDeviceListMetadata {
		senderKeyHash?: (Uint8Array|null)
		senderTimestamp?: (number|Long|null)
		senderKeyIndexes?: (number[]|null)
		senderAccountType?: (waproto.ADVEncryptionType|null)
		receiverAccountType?: (waproto.ADVEncryptionType|null)
		recipientKeyHash?: (Uint8Array|null)
		recipientTimestamp?: (number|Long|null)
		recipientKeyIndexes?: (number[]|null)
	}
	class DeviceListMetadata implements IDeviceListMetadata {
		constructor(p?: waproto.IDeviceListMetadata)
		public senderKeyHash?: (Uint8Array|null)
		public senderTimestamp?: (number|Long|null)
		public senderKeyIndexes: number[]
		public senderAccountType?: (waproto.ADVEncryptionType|null)
		public receiverAccountType?: (waproto.ADVEncryptionType|null)
		public recipientKeyHash?: (Uint8Array|null)
		public recipientTimestamp?: (number|Long|null)
		public recipientKeyIndexes: number[]
		public static encode(m: waproto.IDeviceListMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceListMetadata
	}
	interface IDeviceProps {
		os?: (string|null)
		version?: (waproto.DeviceProps.IAppVersion|null)
		platformType?: (waproto.DeviceProps.PlatformType|null)
		requireFullSync?: (boolean|null)
		historySyncConfig?: (waproto.DeviceProps.IHistorySyncConfig|null)
	}
	class DeviceProps implements IDeviceProps {
		constructor(p?: waproto.IDeviceProps)
		public os?: (string|null)
		public version?: (waproto.DeviceProps.IAppVersion|null)
		public platformType?: (waproto.DeviceProps.PlatformType|null)
		public requireFullSync?: (boolean|null)
		public historySyncConfig?: (waproto.DeviceProps.IHistorySyncConfig|null)
		public static encode(m: waproto.IDeviceProps, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceProps
	}
	namespace DeviceProps {
		interface IAppVersion {
			primary?: (number|null)
			secondary?: (number|null)
			tertiary?: (number|null)
			quaternary?: (number|null)
			quinary?: (number|null)
		}
		class AppVersion implements IAppVersion {
			constructor(p?: waproto.DeviceProps.IAppVersion)
			public primary?: (number|null)
			public secondary?: (number|null)
			public tertiary?: (number|null)
			public quaternary?: (number|null)
			public quinary?: (number|null)
			public static encode(m: waproto.DeviceProps.IAppVersion, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceProps.AppVersion
		}
		interface IHistorySyncConfig {
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
		}
		class HistorySyncConfig implements IHistorySyncConfig {
			constructor(p?: waproto.DeviceProps.IHistorySyncConfig)
			public fullSyncDaysLimit?: (number|null)
			public fullSyncSizeMbLimit?: (number|null)
			public storageQuotaMb?: (number|null)
			public inlineInitialPayloadInE2EeMsg?: (boolean|null)
			public recentSyncDaysLimit?: (number|null)
			public supportCallLogHistory?: (boolean|null)
			public supportBotUserAgentChatHistory?: (boolean|null)
			public supportCagReactionsAndPolls?: (boolean|null)
			public supportBizHostedMsg?: (boolean|null)
			public supportRecentSyncChunkMessageCountTuning?: (boolean|null)
			public supportHostedGroupMsg?: (boolean|null)
			public supportFbidBotChatHistory?: (boolean|null)
			public supportAddOnHistorySyncMigration?: (boolean|null)
			public supportMessageAssociation?: (boolean|null)
			public supportGroupHistory?: (boolean|null)
			public onDemandReady?: (boolean|null)
			public supportGuestChat?: (boolean|null)
			public completeOnDemandReady?: (boolean|null)
			public thumbnailSyncDaysLimit?: (number|null)
			public initialSyncMaxMessagesPerChat?: (number|null)
			public supportManusHistory?: (boolean|null)
			public supportHatchHistory?: (boolean|null)
			public static encode(m: waproto.DeviceProps.IHistorySyncConfig, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.DeviceProps.HistorySyncConfig
		}
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
	}
	interface IDisappearingMode {
		initiator?: (waproto.DisappearingMode.Initiator|null)
		trigger?: (waproto.DisappearingMode.Trigger|null)
		initiatorDeviceJid?: (string|null)
		initiatedByMe?: (boolean|null)
	}
	class DisappearingMode implements IDisappearingMode {
		constructor(p?: waproto.IDisappearingMode)
		public initiator?: (waproto.DisappearingMode.Initiator|null)
		public trigger?: (waproto.DisappearingMode.Trigger|null)
		public initiatorDeviceJid?: (string|null)
		public initiatedByMe?: (boolean|null)
		public static encode(m: waproto.IDisappearingMode, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.DisappearingMode
	}
	namespace DisappearingMode {
		enum Initiator {
			CHANGED_IN_CHAT = 0,
			INITIATED_BY_ME = 1,
			INITIATED_BY_OTHER = 2,
			BIZ_UPGRADE_FB_HOSTING = 3
		}
		enum Trigger {
			UNKNOWN = 0,
			CHAT_SETTING = 1,
			ACCOUNT_SETTING = 2,
			BULK_CHANGE = 3,
			BIZ_SUPPORTS_FB_HOSTING = 4,
			UNKNOWN_GROUPS = 5
		}
	}
	interface IEmbeddedContent {
		embeddedMessage?: (waproto.IEmbeddedMessage|null)
		embeddedMusic?: (waproto.IEmbeddedMusic|null)
	}
	class EmbeddedContent implements IEmbeddedContent {
		constructor(p?: waproto.IEmbeddedContent)
		public embeddedMessage?: (waproto.IEmbeddedMessage|null)
		public embeddedMusic?: (waproto.IEmbeddedMusic|null)
		public content?: ("embeddedMessage"|"embeddedMusic")
		public static encode(m: waproto.IEmbeddedContent, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.EmbeddedContent
	}
	interface IEmbeddedMessage {
		stanzaId?: (string|null)
		message?: (waproto.IMessage|null)
	}
	class EmbeddedMessage implements IEmbeddedMessage {
		constructor(p?: waproto.IEmbeddedMessage)
		public stanzaId?: (string|null)
		public message?: (waproto.IMessage|null)
		public static encode(m: waproto.IEmbeddedMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.EmbeddedMessage
	}
	interface IEmbeddedMusic {
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
	}
	class EmbeddedMusic implements IEmbeddedMusic {
		constructor(p?: waproto.IEmbeddedMusic)
		public musicContentMediaId?: (string|null)
		public songId?: (string|null)
		public author?: (string|null)
		public title?: (string|null)
		public artworkDirectPath?: (string|null)
		public artworkSha256?: (Uint8Array|null)
		public artworkEncSha256?: (Uint8Array|null)
		public artistAttribution?: (string|null)
		public countryBlocklist?: (Uint8Array|null)
		public isExplicit?: (boolean|null)
		public artworkMediaKey?: (Uint8Array|null)
		public musicSongStartTimeInMs?: (number|Long|null)
		public derivedContentStartTimeInMs?: (number|Long|null)
		public overlapDurationInMs?: (number|Long|null)
		public static encode(m: waproto.IEmbeddedMusic, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.EmbeddedMusic
	}
	interface IEncryptedPairingRequest {
		encryptedPayload?: (Uint8Array|null)
		iv?: (Uint8Array|null)
	}
	class EncryptedPairingRequest implements IEncryptedPairingRequest {
		constructor(p?: waproto.IEncryptedPairingRequest)
		public encryptedPayload?: (Uint8Array|null)
		public iv?: (Uint8Array|null)
		public static encode(m: waproto.IEncryptedPairingRequest, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.EncryptedPairingRequest
	}
	interface IEphemeralSetting {
		duration?: (number|null)
		timestamp?: (number|Long|null)
	}
	class EphemeralSetting implements IEphemeralSetting {
		constructor(p?: waproto.IEphemeralSetting)
		public duration?: (number|null)
		public timestamp?: (number|Long|null)
		public static encode(m: waproto.IEphemeralSetting, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.EphemeralSetting
	}
	interface IEventAdditionalMetadata {
		isStale?: (boolean|null)
	}
	class EventAdditionalMetadata implements IEventAdditionalMetadata {
		constructor(p?: waproto.IEventAdditionalMetadata)
		public isStale?: (boolean|null)
		public static encode(m: waproto.IEventAdditionalMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.EventAdditionalMetadata
	}
	interface IEventResponse {
		eventResponseMessageKey?: (waproto.IMessageKey|null)
		timestampMs?: (number|Long|null)
		eventResponseMessage?: (waproto.Message.IEventResponseMessage|null)
		unread?: (boolean|null)
	}
	class EventResponse implements IEventResponse {
		constructor(p?: waproto.IEventResponse)
		public eventResponseMessageKey?: (waproto.IMessageKey|null)
		public timestampMs?: (number|Long|null)
		public eventResponseMessage?: (waproto.Message.IEventResponseMessage|null)
		public unread?: (boolean|null)
		public static encode(m: waproto.IEventResponse, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.EventResponse
	}
	interface IExitCode {
		code?: (number|Long|null)
		text?: (string|null)
	}
	class ExitCode implements IExitCode {
		constructor(p?: waproto.IExitCode)
		public code?: (number|Long|null)
		public text?: (string|null)
		public static encode(m: waproto.IExitCode, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ExitCode
	}
	interface IExternalBlobReference {
		mediaKey?: (Uint8Array|null)
		directPath?: (string|null)
		handle?: (string|null)
		fileSizeBytes?: (number|Long|null)
		fileSha256?: (Uint8Array|null)
		fileEncSha256?: (Uint8Array|null)
	}
	class ExternalBlobReference implements IExternalBlobReference {
		constructor(p?: waproto.IExternalBlobReference)
		public mediaKey?: (Uint8Array|null)
		public directPath?: (string|null)
		public handle?: (string|null)
		public fileSizeBytes?: (number|Long|null)
		public fileSha256?: (Uint8Array|null)
		public fileEncSha256?: (Uint8Array|null)
		public static encode(m: waproto.IExternalBlobReference, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ExternalBlobReference
	}
	interface IField {
		minVersion?: (number|null)
		maxVersion?: (number|null)
		notReportableMinVersion?: (number|null)
		isMessage?: (boolean|null)
		subfield?: ({ [k: string]: waproto.IField }|null)
	}
	class Field implements IField {
		constructor(p?: waproto.IField)
		public minVersion?: (number|null)
		public maxVersion?: (number|null)
		public notReportableMinVersion?: (number|null)
		public isMessage?: (boolean|null)
		public subfield: { [k: string]: waproto.IField }
		public static encode(m: waproto.IField, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Field
	}
	interface IForwardedAIBotMessageInfo {
		botName?: (string|null)
		botJid?: (string|null)
		creatorName?: (string|null)
	}
	class ForwardedAIBotMessageInfo implements IForwardedAIBotMessageInfo {
		constructor(p?: waproto.IForwardedAIBotMessageInfo)
		public botName?: (string|null)
		public botJid?: (string|null)
		public creatorName?: (string|null)
		public static encode(m: waproto.IForwardedAIBotMessageInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ForwardedAIBotMessageInfo
	}
	interface IGlobalSettings {
		lightThemeWallpaper?: (waproto.IWallpaperSettings|null)
		mediaVisibility?: (waproto.MediaVisibility|null)
		darkThemeWallpaper?: (waproto.IWallpaperSettings|null)
		autoDownloadWiFi?: (waproto.IAutoDownloadSettings|null)
		autoDownloadCellular?: (waproto.IAutoDownloadSettings|null)
		autoDownloadRoaming?: (waproto.IAutoDownloadSettings|null)
		showIndividualNotificationsPreview?: (boolean|null)
		showGroupNotificationsPreview?: (boolean|null)
		disappearingModeDuration?: (number|null)
		disappearingModeTimestamp?: (number|Long|null)
		avatarUserSettings?: (waproto.IAvatarUserSettings|null)
		fontSize?: (number|null)
		securityNotifications?: (boolean|null)
		autoUnarchiveChats?: (boolean|null)
		videoQualityMode?: (number|null)
		photoQualityMode?: (number|null)
		individualNotificationSettings?: (waproto.INotificationSettings|null)
		groupNotificationSettings?: (waproto.INotificationSettings|null)
		chatLockSettings?: (waproto.IChatLockSettings|null)
		chatDbLidMigrationTimestamp?: (number|Long|null)
	}
	class GlobalSettings implements IGlobalSettings {
		constructor(p?: waproto.IGlobalSettings)
		public lightThemeWallpaper?: (waproto.IWallpaperSettings|null)
		public mediaVisibility?: (waproto.MediaVisibility|null)
		public darkThemeWallpaper?: (waproto.IWallpaperSettings|null)
		public autoDownloadWiFi?: (waproto.IAutoDownloadSettings|null)
		public autoDownloadCellular?: (waproto.IAutoDownloadSettings|null)
		public autoDownloadRoaming?: (waproto.IAutoDownloadSettings|null)
		public showIndividualNotificationsPreview?: (boolean|null)
		public showGroupNotificationsPreview?: (boolean|null)
		public disappearingModeDuration?: (number|null)
		public disappearingModeTimestamp?: (number|Long|null)
		public avatarUserSettings?: (waproto.IAvatarUserSettings|null)
		public fontSize?: (number|null)
		public securityNotifications?: (boolean|null)
		public autoUnarchiveChats?: (boolean|null)
		public videoQualityMode?: (number|null)
		public photoQualityMode?: (number|null)
		public individualNotificationSettings?: (waproto.INotificationSettings|null)
		public groupNotificationSettings?: (waproto.INotificationSettings|null)
		public chatLockSettings?: (waproto.IChatLockSettings|null)
		public chatDbLidMigrationTimestamp?: (number|Long|null)
		public static encode(m: waproto.IGlobalSettings, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.GlobalSettings
	}
	interface IGroupHistoryBundleInfo {
		deprecatedMessageHistoryBundle?: (waproto.Message.IMessageHistoryBundle|null)
		processState?: (waproto.GroupHistoryBundleInfo.ProcessState|null)
	}
	class GroupHistoryBundleInfo implements IGroupHistoryBundleInfo {
		constructor(p?: waproto.IGroupHistoryBundleInfo)
		public deprecatedMessageHistoryBundle?: (waproto.Message.IMessageHistoryBundle|null)
		public processState?: (waproto.GroupHistoryBundleInfo.ProcessState|null)
		public static encode(m: waproto.IGroupHistoryBundleInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.GroupHistoryBundleInfo
	}
	namespace GroupHistoryBundleInfo {
		enum ProcessState {
			NOT_INJECTED = 0,
			INJECTED = 1,
			INJECTED_PARTIAL = 2,
			INJECTION_FAILED = 3,
			INJECTION_FAILED_NO_RETRY = 4
		}
	}
	interface IGroupHistoryIndividualMessageInfo {
		bundleMessageKey?: (waproto.IMessageKey|null)
		editedAfterReceivedAsHistory?: (boolean|null)
	}
	class GroupHistoryIndividualMessageInfo implements IGroupHistoryIndividualMessageInfo {
		constructor(p?: waproto.IGroupHistoryIndividualMessageInfo)
		public bundleMessageKey?: (waproto.IMessageKey|null)
		public editedAfterReceivedAsHistory?: (boolean|null)
		public static encode(m: waproto.IGroupHistoryIndividualMessageInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.GroupHistoryIndividualMessageInfo
	}
	interface IGroupMention {
		groupJid?: (string|null)
		groupSubject?: (string|null)
	}
	class GroupMention implements IGroupMention {
		constructor(p?: waproto.IGroupMention)
		public groupJid?: (string|null)
		public groupSubject?: (string|null)
		public static encode(m: waproto.IGroupMention, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.GroupMention
	}
	interface IGroupParticipant {
		userJid?: (string|null)
		rank?: (waproto.GroupParticipant.Rank|null)
		memberLabel?: (waproto.IMemberLabel|null)
	}
	class GroupParticipant implements IGroupParticipant {
		constructor(p?: waproto.IGroupParticipant)
		public userJid?: (string|null)
		public rank?: (waproto.GroupParticipant.Rank|null)
		public memberLabel?: (waproto.IMemberLabel|null)
		public static encode(m: waproto.IGroupParticipant, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.GroupParticipant
	}
	namespace GroupParticipant {
		enum Rank {
			REGULAR = 0,
			ADMIN = 1,
			SUPERADMIN = 2
		}
	}
	interface IHandshakeMessage {
		clientHello?: (waproto.HandshakeMessage.IClientHello|null)
		serverHello?: (waproto.HandshakeMessage.IServerHello|null)
		clientFinish?: (waproto.HandshakeMessage.IClientFinish|null)
	}
	class HandshakeMessage implements IHandshakeMessage {
		constructor(p?: waproto.IHandshakeMessage)
		public clientHello?: (waproto.HandshakeMessage.IClientHello|null)
		public serverHello?: (waproto.HandshakeMessage.IServerHello|null)
		public clientFinish?: (waproto.HandshakeMessage.IClientFinish|null)
		public static encode(m: waproto.IHandshakeMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.HandshakeMessage
	}
	namespace HandshakeMessage {
		interface IClientFinish {
			"static"?: (Uint8Array|null)
			payload?: (Uint8Array|null)
			extendedCiphertext?: (Uint8Array|null)
		}
		class ClientFinish implements IClientFinish {
			constructor(p?: waproto.HandshakeMessage.IClientFinish)
			public static?: (Uint8Array|null)
			public payload?: (Uint8Array|null)
			public extendedCiphertext?: (Uint8Array|null)
			public static encode(m: waproto.HandshakeMessage.IClientFinish, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.HandshakeMessage.ClientFinish
		}
		interface IClientHello {
			ephemeral?: (Uint8Array|null)
			"static"?: (Uint8Array|null)
			payload?: (Uint8Array|null)
			useExtended?: (boolean|null)
			extendedCiphertext?: (Uint8Array|null)
		}
		class ClientHello implements IClientHello {
			constructor(p?: waproto.HandshakeMessage.IClientHello)
			public ephemeral?: (Uint8Array|null)
			public static?: (Uint8Array|null)
			public payload?: (Uint8Array|null)
			public useExtended?: (boolean|null)
			public extendedCiphertext?: (Uint8Array|null)
			public static encode(m: waproto.HandshakeMessage.IClientHello, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.HandshakeMessage.ClientHello
		}
		interface IServerHello {
			ephemeral?: (Uint8Array|null)
			"static"?: (Uint8Array|null)
			payload?: (Uint8Array|null)
			extendedStatic?: (Uint8Array|null)
		}
		class ServerHello implements IServerHello {
			constructor(p?: waproto.HandshakeMessage.IServerHello)
			public ephemeral?: (Uint8Array|null)
			public static?: (Uint8Array|null)
			public payload?: (Uint8Array|null)
			public extendedStatic?: (Uint8Array|null)
			public static encode(m: waproto.HandshakeMessage.IServerHello, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.HandshakeMessage.ServerHello
		}
	}
	interface IHistorySync {
		syncType?: (waproto.HistorySync.HistorySyncType|null)
		conversations?: (waproto.IConversation[]|null)
		statusV3Messages?: (waproto.IWebMessageInfo[]|null)
		chunkOrder?: (number|null)
		progress?: (number|null)
		pushnames?: (waproto.IPushname[]|null)
		globalSettings?: (waproto.IGlobalSettings|null)
		threadIdUserSecret?: (Uint8Array|null)
		threadDsTimeframeOffset?: (number|null)
		recentStickers?: (waproto.IStickerMetadata[]|null)
		pastParticipants?: (waproto.IPastParticipants[]|null)
		callLogRecords?: (waproto.ICallLogRecord[]|null)
		aiWaitListState?: (waproto.HistorySync.BotAIWaitListState|null)
		phoneNumberToLidMappings?: (waproto.IPhoneNumberToLIDMapping[]|null)
		companionMetaNonce?: (string|null)
		shareableChatIdentifierEncryptionKey?: (Uint8Array|null)
		accounts?: (waproto.IAccount[]|null)
		nctSalt?: (Uint8Array|null)
	}
	class HistorySync implements IHistorySync {
		constructor(p?: waproto.IHistorySync)
		public syncType?: (waproto.HistorySync.HistorySyncType|null)
		public conversations: waproto.IConversation[]
		public statusV3Messages: waproto.IWebMessageInfo[]
		public chunkOrder?: (number|null)
		public progress?: (number|null)
		public pushnames: waproto.IPushname[]
		public globalSettings?: (waproto.IGlobalSettings|null)
		public threadIdUserSecret?: (Uint8Array|null)
		public threadDsTimeframeOffset?: (number|null)
		public recentStickers: waproto.IStickerMetadata[]
		public pastParticipants: waproto.IPastParticipants[]
		public callLogRecords: waproto.ICallLogRecord[]
		public aiWaitListState?: (waproto.HistorySync.BotAIWaitListState|null)
		public phoneNumberToLidMappings: waproto.IPhoneNumberToLIDMapping[]
		public companionMetaNonce?: (string|null)
		public shareableChatIdentifierEncryptionKey?: (Uint8Array|null)
		public accounts: waproto.IAccount[]
		public nctSalt?: (Uint8Array|null)
		public static encode(m: waproto.IHistorySync, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.HistorySync
	}
	namespace HistorySync {
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
	interface IHistorySyncMsg {
		message?: (waproto.IWebMessageInfo|null)
		msgOrderId?: (number|Long|null)
	}
	class HistorySyncMsg implements IHistorySyncMsg {
		constructor(p?: waproto.IHistorySyncMsg)
		public message?: (waproto.IWebMessageInfo|null)
		public msgOrderId?: (number|Long|null)
		public static encode(m: waproto.IHistorySyncMsg, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.HistorySyncMsg
	}
	interface IHydratedTemplateButton {
		index?: (number|null)
		quickReplyButton?: (waproto.HydratedTemplateButton.IHydratedQuickReplyButton|null)
		urlButton?: (waproto.HydratedTemplateButton.IHydratedURLButton|null)
		callButton?: (waproto.HydratedTemplateButton.IHydratedCallButton|null)
	}
	class HydratedTemplateButton implements IHydratedTemplateButton {
		constructor(p?: waproto.IHydratedTemplateButton)
		public index?: (number|null)
		public quickReplyButton?: (waproto.HydratedTemplateButton.IHydratedQuickReplyButton|null)
		public urlButton?: (waproto.HydratedTemplateButton.IHydratedURLButton|null)
		public callButton?: (waproto.HydratedTemplateButton.IHydratedCallButton|null)
		public hydratedButton?: ("quickReplyButton"|"urlButton"|"callButton")
		public static encode(m: waproto.IHydratedTemplateButton, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.HydratedTemplateButton
	}
	namespace HydratedTemplateButton {
		interface IHydratedCallButton {
			displayText?: (string|null)
			phoneNumber?: (string|null)
		}
		class HydratedCallButton implements IHydratedCallButton {
			constructor(p?: waproto.HydratedTemplateButton.IHydratedCallButton)
			public displayText?: (string|null)
			public phoneNumber?: (string|null)
			public static encode(m: waproto.HydratedTemplateButton.IHydratedCallButton, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.HydratedTemplateButton.HydratedCallButton
		}
		interface IHydratedQuickReplyButton {
			displayText?: (string|null)
			id?: (string|null)
		}
		class HydratedQuickReplyButton implements IHydratedQuickReplyButton {
			constructor(p?: waproto.HydratedTemplateButton.IHydratedQuickReplyButton)
			public displayText?: (string|null)
			public id?: (string|null)
			public static encode(m: waproto.HydratedTemplateButton.IHydratedQuickReplyButton, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.HydratedTemplateButton.HydratedQuickReplyButton
		}
		interface IHydratedURLButton {
			displayText?: (string|null)
			url?: (string|null)
			consentedUsersUrl?: (string|null)
			webviewPresentation?: (waproto.HydratedTemplateButton.HydratedURLButton.WebviewPresentationType|null)
		}
		class HydratedURLButton implements IHydratedURLButton {
			constructor(p?: waproto.HydratedTemplateButton.IHydratedURLButton)
			public displayText?: (string|null)
			public url?: (string|null)
			public consentedUsersUrl?: (string|null)
			public webviewPresentation?: (waproto.HydratedTemplateButton.HydratedURLButton.WebviewPresentationType|null)
			public static encode(m: waproto.HydratedTemplateButton.IHydratedURLButton, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.HydratedTemplateButton.HydratedURLButton
		}
		namespace HydratedURLButton {
			enum WebviewPresentationType {
				FULL = 1,
				TALL = 2,
				COMPACT = 3
			}
		}
	}
	interface IIdentityKeyPairStructure {
		publicKey?: (Uint8Array|null)
		privateKey?: (Uint8Array|null)
	}
	class IdentityKeyPairStructure implements IIdentityKeyPairStructure {
		constructor(p?: waproto.IIdentityKeyPairStructure)
		public publicKey?: (Uint8Array|null)
		public privateKey?: (Uint8Array|null)
		public static encode(m: waproto.IIdentityKeyPairStructure, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.IdentityKeyPairStructure
	}
	interface IInThreadSurveyMetadata {
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
		questions?: (waproto.InThreadSurveyMetadata.IInThreadSurveyQuestion[]|null)
		surveyContinueButtonText?: (string|null)
		surveySubmitButtonText?: (string|null)
		privacyStatementFull?: (string|null)
		privacyStatementParts?: (waproto.InThreadSurveyMetadata.IInThreadSurveyPrivacyStatementPart[]|null)
		feedbackToastText?: (string|null)
		startQuestionIndex?: (number|null)
	}
	class InThreadSurveyMetadata implements IInThreadSurveyMetadata {
		constructor(p?: waproto.IInThreadSurveyMetadata)
		public tessaSessionId?: (string|null)
		public simonSessionId?: (string|null)
		public simonSurveyId?: (string|null)
		public tessaRootId?: (string|null)
		public requestId?: (string|null)
		public tessaEvent?: (string|null)
		public invitationHeaderText?: (string|null)
		public invitationBodyText?: (string|null)
		public invitationCtaText?: (string|null)
		public invitationCtaUrl?: (string|null)
		public surveyTitle?: (string|null)
		public questions: waproto.InThreadSurveyMetadata.IInThreadSurveyQuestion[]
		public surveyContinueButtonText?: (string|null)
		public surveySubmitButtonText?: (string|null)
		public privacyStatementFull?: (string|null)
		public privacyStatementParts: waproto.InThreadSurveyMetadata.IInThreadSurveyPrivacyStatementPart[]
		public feedbackToastText?: (string|null)
		public startQuestionIndex?: (number|null)
		public static encode(m: waproto.IInThreadSurveyMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.InThreadSurveyMetadata
	}
	namespace InThreadSurveyMetadata {
		interface IInThreadSurveyOption {
			stringValue?: (string|null)
			numericValue?: (number|null)
			textTranslated?: (string|null)
		}
		class InThreadSurveyOption implements IInThreadSurveyOption {
			constructor(p?: waproto.InThreadSurveyMetadata.IInThreadSurveyOption)
			public stringValue?: (string|null)
			public numericValue?: (number|null)
			public textTranslated?: (string|null)
			public static encode(m: waproto.InThreadSurveyMetadata.IInThreadSurveyOption, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.InThreadSurveyMetadata.InThreadSurveyOption
		}
		interface IInThreadSurveyPrivacyStatementPart {
			text?: (string|null)
			url?: (string|null)
		}
		class InThreadSurveyPrivacyStatementPart implements IInThreadSurveyPrivacyStatementPart {
			constructor(p?: waproto.InThreadSurveyMetadata.IInThreadSurveyPrivacyStatementPart)
			public text?: (string|null)
			public url?: (string|null)
			public static encode(m: waproto.InThreadSurveyMetadata.IInThreadSurveyPrivacyStatementPart, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.InThreadSurveyMetadata.InThreadSurveyPrivacyStatementPart
		}
		interface IInThreadSurveyQuestion {
			questionText?: (string|null)
			questionId?: (string|null)
			questionOptions?: (waproto.InThreadSurveyMetadata.IInThreadSurveyOption[]|null)
		}
		class InThreadSurveyQuestion implements IInThreadSurveyQuestion {
			constructor(p?: waproto.InThreadSurveyMetadata.IInThreadSurveyQuestion)
			public questionText?: (string|null)
			public questionId?: (string|null)
			public questionOptions: waproto.InThreadSurveyMetadata.IInThreadSurveyOption[]
			public static encode(m: waproto.InThreadSurveyMetadata.IInThreadSurveyQuestion, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.InThreadSurveyMetadata.InThreadSurveyQuestion
		}
	}
	interface IInteractiveAnnotation {
		polygonVertices?: (waproto.IPoint[]|null)
		shouldSkipConfirmation?: (boolean|null)
		embeddedContent?: (waproto.IEmbeddedContent|null)
		statusLinkType?: (waproto.InteractiveAnnotation.StatusLinkType|null)
		location?: (waproto.ILocation|null)
		newsletter?: (waproto.ContextInfo.IForwardedNewsletterMessageInfo|null)
		embeddedAction?: (boolean|null)
		tapAction?: (waproto.ITapLinkAction|null)
	}
	class InteractiveAnnotation implements IInteractiveAnnotation {
		constructor(p?: waproto.IInteractiveAnnotation)
		public polygonVertices: waproto.IPoint[]
		public shouldSkipConfirmation?: (boolean|null)
		public embeddedContent?: (waproto.IEmbeddedContent|null)
		public statusLinkType?: (waproto.InteractiveAnnotation.StatusLinkType|null)
		public location?: (waproto.ILocation|null)
		public newsletter?: (waproto.ContextInfo.IForwardedNewsletterMessageInfo|null)
		public embeddedAction?: (boolean|null)
		public tapAction?: (waproto.ITapLinkAction|null)
		public action?: ("location"|"newsletter"|"embeddedAction"|"tapAction")
		public static encode(m: waproto.IInteractiveAnnotation, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.InteractiveAnnotation
	}
	namespace InteractiveAnnotation {
		enum StatusLinkType {
			RASTERIZED_LINK_PREVIEW = 1,
			RASTERIZED_LINK_TRUNCATED = 2,
			RASTERIZED_LINK_FULL_URL = 3
		}
	}
	interface IInteractiveMessageAdditionalMetadata {
		isGalaxyFlowCompleted?: (boolean|null)
	}
	class InteractiveMessageAdditionalMetadata implements IInteractiveMessageAdditionalMetadata {
		constructor(p?: waproto.IInteractiveMessageAdditionalMetadata)
		public isGalaxyFlowCompleted?: (boolean|null)
		public static encode(m: waproto.IInteractiveMessageAdditionalMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.InteractiveMessageAdditionalMetadata
	}
	interface IKeepInChat {
		keepType?: (waproto.KeepType|null)
		serverTimestamp?: (number|Long|null)
		key?: (waproto.IMessageKey|null)
		deviceJid?: (string|null)
		clientTimestampMs?: (number|Long|null)
		serverTimestampMs?: (number|Long|null)
	}
	class KeepInChat implements IKeepInChat {
		constructor(p?: waproto.IKeepInChat)
		public keepType?: (waproto.KeepType|null)
		public serverTimestamp?: (number|Long|null)
		public key?: (waproto.IMessageKey|null)
		public deviceJid?: (string|null)
		public clientTimestampMs?: (number|Long|null)
		public serverTimestampMs?: (number|Long|null)
		public static encode(m: waproto.IKeepInChat, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.KeepInChat
	}
	enum KeepType {
		UNKNOWN = 0,
		KEEP_FOR_ALL = 1,
		UNDO_KEEP_FOR_ALL = 2
	}
	interface IKeyExchangeMessage {
		id?: (number|null)
		baseKey?: (Uint8Array|null)
		ratchetKey?: (Uint8Array|null)
		identityKey?: (Uint8Array|null)
		baseKeySignature?: (Uint8Array|null)
	}
	class KeyExchangeMessage implements IKeyExchangeMessage {
		constructor(p?: waproto.IKeyExchangeMessage)
		public id?: (number|null)
		public baseKey?: (Uint8Array|null)
		public ratchetKey?: (Uint8Array|null)
		public identityKey?: (Uint8Array|null)
		public baseKeySignature?: (Uint8Array|null)
		public static encode(m: waproto.IKeyExchangeMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.KeyExchangeMessage
	}
	interface IKeyId {
		id?: (Uint8Array|null)
	}
	class KeyId implements IKeyId {
		constructor(p?: waproto.IKeyId)
		public id?: (Uint8Array|null)
		public static encode(m: waproto.IKeyId, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.KeyId
	}
	interface ILIDMigrationMapping {
		pn?: (number|Long|null)
		assignedLid?: (number|Long|null)
		latestLid?: (number|Long|null)
	}
	class LIDMigrationMapping implements ILIDMigrationMapping {
		constructor(p?: waproto.ILIDMigrationMapping)
		public pn?: (number|Long|null)
		public assignedLid?: (number|Long|null)
		public latestLid?: (number|Long|null)
		public static encode(m: waproto.ILIDMigrationMapping, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.LIDMigrationMapping
	}
	interface ILIDMigrationMappingSyncMessage {
		encodedMappingPayload?: (Uint8Array|null)
	}
	class LIDMigrationMappingSyncMessage implements ILIDMigrationMappingSyncMessage {
		constructor(p?: waproto.ILIDMigrationMappingSyncMessage)
		public encodedMappingPayload?: (Uint8Array|null)
		public static encode(m: waproto.ILIDMigrationMappingSyncMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.LIDMigrationMappingSyncMessage
	}
	interface ILIDMigrationMappingSyncPayload {
		pnToLidMappings?: (waproto.ILIDMigrationMapping[]|null)
		chatDbMigrationTimestamp?: (number|Long|null)
	}
	class LIDMigrationMappingSyncPayload implements ILIDMigrationMappingSyncPayload {
		constructor(p?: waproto.ILIDMigrationMappingSyncPayload)
		public pnToLidMappings: waproto.ILIDMigrationMapping[]
		public chatDbMigrationTimestamp?: (number|Long|null)
		public static encode(m: waproto.ILIDMigrationMappingSyncPayload, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.LIDMigrationMappingSyncPayload
	}
	interface ILegacyMessage {
		eventResponseMessage?: (waproto.Message.IEventResponseMessage|null)
		pollVote?: (waproto.Message.IPollVoteMessage|null)
	}
	class LegacyMessage implements ILegacyMessage {
		constructor(p?: waproto.ILegacyMessage)
		public eventResponseMessage?: (waproto.Message.IEventResponseMessage|null)
		public pollVote?: (waproto.Message.IPollVoteMessage|null)
		public static encode(m: waproto.ILegacyMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.LegacyMessage
	}
	interface ILimitSharing {
		sharingLimited?: (boolean|null)
		trigger?: (waproto.LimitSharing.TriggerType|null)
		limitSharingSettingTimestamp?: (number|Long|null)
		initiatedByMe?: (boolean|null)
	}
	class LimitSharing implements ILimitSharing {
		constructor(p?: waproto.ILimitSharing)
		public sharingLimited?: (boolean|null)
		public trigger?: (waproto.LimitSharing.TriggerType|null)
		public limitSharingSettingTimestamp?: (number|Long|null)
		public initiatedByMe?: (boolean|null)
		public static encode(m: waproto.ILimitSharing, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.LimitSharing
	}
	namespace LimitSharing {
		enum TriggerType {
			UNKNOWN = 0,
			CHAT_SETTING = 1,
			BIZ_SUPPORTS_FB_HOSTING = 2,
			UNKNOWN_GROUP = 3,
			DEPRECATION = 4
		}
	}
	interface ILocalizedName {
		lg?: (string|null)
		lc?: (string|null)
		verifiedName?: (string|null)
	}
	class LocalizedName implements ILocalizedName {
		constructor(p?: waproto.ILocalizedName)
		public lg?: (string|null)
		public lc?: (string|null)
		public verifiedName?: (string|null)
		public static encode(m: waproto.ILocalizedName, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.LocalizedName
	}
	interface ILocation {
		degreesLatitude?: (number|null)
		degreesLongitude?: (number|null)
		name?: (string|null)
	}
	class Location implements ILocation {
		constructor(p?: waproto.ILocation)
		public degreesLatitude?: (number|null)
		public degreesLongitude?: (number|null)
		public name?: (string|null)
		public static encode(m: waproto.ILocation, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Location
	}
	interface IMediaData {
		localPath?: (string|null)
	}
	class MediaData implements IMediaData {
		constructor(p?: waproto.IMediaData)
		public localPath?: (string|null)
		public static encode(m: waproto.IMediaData, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MediaData
	}
	interface IMediaDomainInfo {
		mediaKeyDomain?: (waproto.MediaKeyDomain|null)
		e2EeMediaKey?: (Uint8Array|null)
	}
	class MediaDomainInfo implements IMediaDomainInfo {
		constructor(p?: waproto.IMediaDomainInfo)
		public mediaKeyDomain?: (waproto.MediaKeyDomain|null)
		public e2EeMediaKey?: (Uint8Array|null)
		public static encode(m: waproto.IMediaDomainInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MediaDomainInfo
	}
	enum MediaKeyDomain {
		MEDIA_KEY_DOMAIN_UNKNOWN = 0,
		MEDIA_KEY_DOMAIN_E2EE = 1,
		MEDIA_KEY_DOMAIN_NON_E2EE = 2
	}
	interface IMediaNotifyMessage {
		expressPathUrl?: (string|null)
		fileEncSha256?: (Uint8Array|null)
		fileLength?: (number|Long|null)
	}
	class MediaNotifyMessage implements IMediaNotifyMessage {
		constructor(p?: waproto.IMediaNotifyMessage)
		public expressPathUrl?: (string|null)
		public fileEncSha256?: (Uint8Array|null)
		public fileLength?: (number|Long|null)
		public static encode(m: waproto.IMediaNotifyMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MediaNotifyMessage
	}
	interface IMediaRetryNotification {
		stanzaId?: (string|null)
		directPath?: (string|null)
		result?: (waproto.MediaRetryNotification.ResultType|null)
		messageSecret?: (Uint8Array|null)
	}
	class MediaRetryNotification implements IMediaRetryNotification {
		constructor(p?: waproto.IMediaRetryNotification)
		public stanzaId?: (string|null)
		public directPath?: (string|null)
		public result?: (waproto.MediaRetryNotification.ResultType|null)
		public messageSecret?: (Uint8Array|null)
		public static encode(m: waproto.IMediaRetryNotification, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MediaRetryNotification
	}
	namespace MediaRetryNotification {
		enum ResultType {
			GENERAL_ERROR = 0,
			SUCCESS = 1,
			NOT_FOUND = 2,
			DECRYPTION_ERROR = 3
		}
	}
	enum MediaVisibility {
		DEFAULT = 0,
		OFF = 1,
		ON = 2
	}
	interface IMemberLabel {
		label?: (string|null)
		labelTimestamp?: (number|Long|null)
	}
	class MemberLabel implements IMemberLabel {
		constructor(p?: waproto.IMemberLabel)
		public label?: (string|null)
		public labelTimestamp?: (number|Long|null)
		public static encode(m: waproto.IMemberLabel, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MemberLabel
	}
	interface IMessage {
		conversation?: (string|null)
		senderKeyDistributionMessage?: (waproto.Message.ISenderKeyDistributionMessage|null)
		imageMessage?: (waproto.Message.IImageMessage|null)
		contactMessage?: (waproto.Message.IContactMessage|null)
		locationMessage?: (waproto.Message.ILocationMessage|null)
		extendedTextMessage?: (waproto.Message.IExtendedTextMessage|null)
		documentMessage?: (waproto.Message.IDocumentMessage|null)
		audioMessage?: (waproto.Message.IAudioMessage|null)
		videoMessage?: (waproto.Message.IVideoMessage|null)
		call?: (waproto.Message.ICall|null)
		chat?: (waproto.Message.IChat|null)
		protocolMessage?: (waproto.Message.IProtocolMessage|null)
		contactsArrayMessage?: (waproto.Message.IContactsArrayMessage|null)
		highlyStructuredMessage?: (waproto.Message.IHighlyStructuredMessage|null)
		fastRatchetKeySenderKeyDistributionMessage?: (waproto.Message.ISenderKeyDistributionMessage|null)
		sendPaymentMessage?: (waproto.Message.ISendPaymentMessage|null)
		liveLocationMessage?: (waproto.Message.ILiveLocationMessage|null)
		requestPaymentMessage?: (waproto.Message.IRequestPaymentMessage|null)
		declinePaymentRequestMessage?: (waproto.Message.IDeclinePaymentRequestMessage|null)
		cancelPaymentRequestMessage?: (waproto.Message.ICancelPaymentRequestMessage|null)
		templateMessage?: (waproto.Message.ITemplateMessage|null)
		stickerMessage?: (waproto.Message.IStickerMessage|null)
		groupInviteMessage?: (waproto.Message.IGroupInviteMessage|null)
		templateButtonReplyMessage?: (waproto.Message.ITemplateButtonReplyMessage|null)
		productMessage?: (waproto.Message.IProductMessage|null)
		deviceSentMessage?: (waproto.Message.IDeviceSentMessage|null)
		messageContextInfo?: (waproto.IMessageContextInfo|null)
		listMessage?: (waproto.Message.IListMessage|null)
		viewOnceMessage?: (waproto.Message.IFutureProofMessage|null)
		orderMessage?: (waproto.Message.IOrderMessage|null)
		listResponseMessage?: (waproto.Message.IListResponseMessage|null)
		ephemeralMessage?: (waproto.Message.IFutureProofMessage|null)
		invoiceMessage?: (waproto.Message.IInvoiceMessage|null)
		buttonsMessage?: (waproto.Message.IButtonsMessage|null)
		buttonsResponseMessage?: (waproto.Message.IButtonsResponseMessage|null)
		paymentInviteMessage?: (waproto.Message.IPaymentInviteMessage|null)
		interactiveMessage?: (waproto.Message.IInteractiveMessage|null)
		reactionMessage?: (waproto.Message.IReactionMessage|null)
		stickerSyncRmrMessage?: (waproto.Message.IStickerSyncRMRMessage|null)
		interactiveResponseMessage?: (waproto.Message.IInteractiveResponseMessage|null)
		pollCreationMessage?: (waproto.Message.IPollCreationMessage|null)
		pollUpdateMessage?: (waproto.Message.IPollUpdateMessage|null)
		keepInChatMessage?: (waproto.Message.IKeepInChatMessage|null)
		documentWithCaptionMessage?: (waproto.Message.IFutureProofMessage|null)
		requestPhoneNumberMessage?: (waproto.Message.IRequestPhoneNumberMessage|null)
		viewOnceMessageV2?: (waproto.Message.IFutureProofMessage|null)
		encReactionMessage?: (waproto.Message.IEncReactionMessage|null)
		editedMessage?: (waproto.Message.IFutureProofMessage|null)
		viewOnceMessageV2Extension?: (waproto.Message.IFutureProofMessage|null)
		pollCreationMessageV2?: (waproto.Message.IPollCreationMessage|null)
		scheduledCallCreationMessage?: (waproto.Message.IScheduledCallCreationMessage|null)
		groupMentionedMessage?: (waproto.Message.IFutureProofMessage|null)
		pinInChatMessage?: (waproto.Message.IPinInChatMessage|null)
		pollCreationMessageV3?: (waproto.Message.IPollCreationMessage|null)
		scheduledCallEditMessage?: (waproto.Message.IScheduledCallEditMessage|null)
		ptvMessage?: (waproto.Message.IVideoMessage|null)
		botInvokeMessage?: (waproto.Message.IFutureProofMessage|null)
		callLogMesssage?: (waproto.Message.ICallLogMessage|null)
		messageHistoryBundle?: (waproto.Message.IMessageHistoryBundle|null)
		encCommentMessage?: (waproto.Message.IEncCommentMessage|null)
		bcallMessage?: (waproto.Message.IBCallMessage|null)
		lottieStickerMessage?: (waproto.Message.IFutureProofMessage|null)
		eventMessage?: (waproto.Message.IEventMessage|null)
		encEventResponseMessage?: (waproto.Message.IEncEventResponseMessage|null)
		commentMessage?: (waproto.Message.ICommentMessage|null)
		newsletterAdminInviteMessage?: (waproto.Message.INewsletterAdminInviteMessage|null)
		placeholderMessage?: (waproto.Message.IPlaceholderMessage|null)
		secretEncryptedMessage?: (waproto.Message.ISecretEncryptedMessage|null)
		albumMessage?: (waproto.Message.IAlbumMessage|null)
		eventCoverImage?: (waproto.Message.IFutureProofMessage|null)
		stickerPackMessage?: (waproto.Message.IStickerPackMessage|null)
		statusMentionMessage?: (waproto.Message.IFutureProofMessage|null)
		pollResultSnapshotMessage?: (waproto.Message.IPollResultSnapshotMessage|null)
		pollCreationOptionImageMessage?: (waproto.Message.IFutureProofMessage|null)
		associatedChildMessage?: (waproto.Message.IFutureProofMessage|null)
		groupStatusMentionMessage?: (waproto.Message.IFutureProofMessage|null)
		pollCreationMessageV4?: (waproto.Message.IFutureProofMessage|null)
		statusAddYours?: (waproto.Message.IFutureProofMessage|null)
		groupStatusMessage?: (waproto.Message.IFutureProofMessage|null)
		richResponseMessage?: (waproto.IAIRichResponseMessage|null)
		statusNotificationMessage?: (waproto.Message.IStatusNotificationMessage|null)
		limitSharingMessage?: (waproto.Message.IFutureProofMessage|null)
		botTaskMessage?: (waproto.Message.IFutureProofMessage|null)
		questionMessage?: (waproto.Message.IFutureProofMessage|null)
		messageHistoryNotice?: (waproto.Message.IMessageHistoryNotice|null)
		groupStatusMessageV2?: (waproto.Message.IFutureProofMessage|null)
		botForwardedMessage?: (waproto.Message.IFutureProofMessage|null)
		statusQuestionAnswerMessage?: (waproto.Message.IStatusQuestionAnswerMessage|null)
		questionReplyMessage?: (waproto.Message.IFutureProofMessage|null)
		questionResponseMessage?: (waproto.Message.IQuestionResponseMessage|null)
		statusQuotedMessage?: (waproto.Message.IStatusQuotedMessage|null)
		statusStickerInteractionMessage?: (waproto.Message.IStatusStickerInteractionMessage|null)
		pollCreationMessageV5?: (waproto.Message.IPollCreationMessage|null)
		newsletterFollowerInviteMessageV2?: (waproto.Message.INewsletterFollowerInviteMessage|null)
		pollResultSnapshotMessageV3?: (waproto.Message.IPollResultSnapshotMessage|null)
		newsletterAdminProfileMessage?: (waproto.Message.IFutureProofMessage|null)
		newsletterAdminProfileMessageV2?: (waproto.Message.IFutureProofMessage|null)
		spoilerMessage?: (waproto.Message.IFutureProofMessage|null)
		pollCreationMessageV6?: (waproto.Message.IPollCreationMessage|null)
		conditionalRevealMessage?: (waproto.Message.IConditionalRevealMessage|null)
		pollAddOptionMessage?: (waproto.Message.IPollAddOptionMessage|null)
	}
	class Message implements IMessage {
		constructor(p?: waproto.IMessage)
		public conversation?: (string|null)
		public senderKeyDistributionMessage?: (waproto.Message.ISenderKeyDistributionMessage|null)
		public imageMessage?: (waproto.Message.IImageMessage|null)
		public contactMessage?: (waproto.Message.IContactMessage|null)
		public locationMessage?: (waproto.Message.ILocationMessage|null)
		public extendedTextMessage?: (waproto.Message.IExtendedTextMessage|null)
		public documentMessage?: (waproto.Message.IDocumentMessage|null)
		public audioMessage?: (waproto.Message.IAudioMessage|null)
		public videoMessage?: (waproto.Message.IVideoMessage|null)
		public call?: (waproto.Message.ICall|null)
		public chat?: (waproto.Message.IChat|null)
		public protocolMessage?: (waproto.Message.IProtocolMessage|null)
		public contactsArrayMessage?: (waproto.Message.IContactsArrayMessage|null)
		public highlyStructuredMessage?: (waproto.Message.IHighlyStructuredMessage|null)
		public fastRatchetKeySenderKeyDistributionMessage?: (waproto.Message.ISenderKeyDistributionMessage|null)
		public sendPaymentMessage?: (waproto.Message.ISendPaymentMessage|null)
		public liveLocationMessage?: (waproto.Message.ILiveLocationMessage|null)
		public requestPaymentMessage?: (waproto.Message.IRequestPaymentMessage|null)
		public declinePaymentRequestMessage?: (waproto.Message.IDeclinePaymentRequestMessage|null)
		public cancelPaymentRequestMessage?: (waproto.Message.ICancelPaymentRequestMessage|null)
		public templateMessage?: (waproto.Message.ITemplateMessage|null)
		public stickerMessage?: (waproto.Message.IStickerMessage|null)
		public groupInviteMessage?: (waproto.Message.IGroupInviteMessage|null)
		public templateButtonReplyMessage?: (waproto.Message.ITemplateButtonReplyMessage|null)
		public productMessage?: (waproto.Message.IProductMessage|null)
		public deviceSentMessage?: (waproto.Message.IDeviceSentMessage|null)
		public messageContextInfo?: (waproto.IMessageContextInfo|null)
		public listMessage?: (waproto.Message.IListMessage|null)
		public viewOnceMessage?: (waproto.Message.IFutureProofMessage|null)
		public orderMessage?: (waproto.Message.IOrderMessage|null)
		public listResponseMessage?: (waproto.Message.IListResponseMessage|null)
		public ephemeralMessage?: (waproto.Message.IFutureProofMessage|null)
		public invoiceMessage?: (waproto.Message.IInvoiceMessage|null)
		public buttonsMessage?: (waproto.Message.IButtonsMessage|null)
		public buttonsResponseMessage?: (waproto.Message.IButtonsResponseMessage|null)
		public paymentInviteMessage?: (waproto.Message.IPaymentInviteMessage|null)
		public interactiveMessage?: (waproto.Message.IInteractiveMessage|null)
		public reactionMessage?: (waproto.Message.IReactionMessage|null)
		public stickerSyncRmrMessage?: (waproto.Message.IStickerSyncRMRMessage|null)
		public interactiveResponseMessage?: (waproto.Message.IInteractiveResponseMessage|null)
		public pollCreationMessage?: (waproto.Message.IPollCreationMessage|null)
		public pollUpdateMessage?: (waproto.Message.IPollUpdateMessage|null)
		public keepInChatMessage?: (waproto.Message.IKeepInChatMessage|null)
		public documentWithCaptionMessage?: (waproto.Message.IFutureProofMessage|null)
		public requestPhoneNumberMessage?: (waproto.Message.IRequestPhoneNumberMessage|null)
		public viewOnceMessageV2?: (waproto.Message.IFutureProofMessage|null)
		public encReactionMessage?: (waproto.Message.IEncReactionMessage|null)
		public editedMessage?: (waproto.Message.IFutureProofMessage|null)
		public viewOnceMessageV2Extension?: (waproto.Message.IFutureProofMessage|null)
		public pollCreationMessageV2?: (waproto.Message.IPollCreationMessage|null)
		public scheduledCallCreationMessage?: (waproto.Message.IScheduledCallCreationMessage|null)
		public groupMentionedMessage?: (waproto.Message.IFutureProofMessage|null)
		public pinInChatMessage?: (waproto.Message.IPinInChatMessage|null)
		public pollCreationMessageV3?: (waproto.Message.IPollCreationMessage|null)
		public scheduledCallEditMessage?: (waproto.Message.IScheduledCallEditMessage|null)
		public ptvMessage?: (waproto.Message.IVideoMessage|null)
		public botInvokeMessage?: (waproto.Message.IFutureProofMessage|null)
		public callLogMesssage?: (waproto.Message.ICallLogMessage|null)
		public messageHistoryBundle?: (waproto.Message.IMessageHistoryBundle|null)
		public encCommentMessage?: (waproto.Message.IEncCommentMessage|null)
		public bcallMessage?: (waproto.Message.IBCallMessage|null)
		public lottieStickerMessage?: (waproto.Message.IFutureProofMessage|null)
		public eventMessage?: (waproto.Message.IEventMessage|null)
		public encEventResponseMessage?: (waproto.Message.IEncEventResponseMessage|null)
		public commentMessage?: (waproto.Message.ICommentMessage|null)
		public newsletterAdminInviteMessage?: (waproto.Message.INewsletterAdminInviteMessage|null)
		public placeholderMessage?: (waproto.Message.IPlaceholderMessage|null)
		public secretEncryptedMessage?: (waproto.Message.ISecretEncryptedMessage|null)
		public albumMessage?: (waproto.Message.IAlbumMessage|null)
		public eventCoverImage?: (waproto.Message.IFutureProofMessage|null)
		public stickerPackMessage?: (waproto.Message.IStickerPackMessage|null)
		public statusMentionMessage?: (waproto.Message.IFutureProofMessage|null)
		public pollResultSnapshotMessage?: (waproto.Message.IPollResultSnapshotMessage|null)
		public pollCreationOptionImageMessage?: (waproto.Message.IFutureProofMessage|null)
		public associatedChildMessage?: (waproto.Message.IFutureProofMessage|null)
		public groupStatusMentionMessage?: (waproto.Message.IFutureProofMessage|null)
		public pollCreationMessageV4?: (waproto.Message.IFutureProofMessage|null)
		public statusAddYours?: (waproto.Message.IFutureProofMessage|null)
		public groupStatusMessage?: (waproto.Message.IFutureProofMessage|null)
		public richResponseMessage?: (waproto.IAIRichResponseMessage|null)
		public statusNotificationMessage?: (waproto.Message.IStatusNotificationMessage|null)
		public limitSharingMessage?: (waproto.Message.IFutureProofMessage|null)
		public botTaskMessage?: (waproto.Message.IFutureProofMessage|null)
		public questionMessage?: (waproto.Message.IFutureProofMessage|null)
		public messageHistoryNotice?: (waproto.Message.IMessageHistoryNotice|null)
		public groupStatusMessageV2?: (waproto.Message.IFutureProofMessage|null)
		public botForwardedMessage?: (waproto.Message.IFutureProofMessage|null)
		public statusQuestionAnswerMessage?: (waproto.Message.IStatusQuestionAnswerMessage|null)
		public questionReplyMessage?: (waproto.Message.IFutureProofMessage|null)
		public questionResponseMessage?: (waproto.Message.IQuestionResponseMessage|null)
		public statusQuotedMessage?: (waproto.Message.IStatusQuotedMessage|null)
		public statusStickerInteractionMessage?: (waproto.Message.IStatusStickerInteractionMessage|null)
		public pollCreationMessageV5?: (waproto.Message.IPollCreationMessage|null)
		public newsletterFollowerInviteMessageV2?: (waproto.Message.INewsletterFollowerInviteMessage|null)
		public pollResultSnapshotMessageV3?: (waproto.Message.IPollResultSnapshotMessage|null)
		public newsletterAdminProfileMessage?: (waproto.Message.IFutureProofMessage|null)
		public newsletterAdminProfileMessageV2?: (waproto.Message.IFutureProofMessage|null)
		public spoilerMessage?: (waproto.Message.IFutureProofMessage|null)
		public pollCreationMessageV6?: (waproto.Message.IPollCreationMessage|null)
		public conditionalRevealMessage?: (waproto.Message.IConditionalRevealMessage|null)
		public pollAddOptionMessage?: (waproto.Message.IPollAddOptionMessage|null)
		public static encode(m: waproto.IMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message
	}
	namespace Message {
		interface IAlbumMessage {
			expectedImageCount?: (number|null)
			expectedVideoCount?: (number|null)
			contextInfo?: (waproto.IContextInfo|null)
		}
		class AlbumMessage implements IAlbumMessage {
			constructor(p?: waproto.Message.IAlbumMessage)
			public expectedImageCount?: (number|null)
			public expectedVideoCount?: (number|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public static encode(m: waproto.Message.IAlbumMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AlbumMessage
		}
		interface IAppStateFatalExceptionNotification {
			collectionNames?: (string[]|null)
			timestamp?: (number|Long|null)
		}
		class AppStateFatalExceptionNotification implements IAppStateFatalExceptionNotification {
			constructor(p?: waproto.Message.IAppStateFatalExceptionNotification)
			public collectionNames: string[]
			public timestamp?: (number|Long|null)
			public static encode(m: waproto.Message.IAppStateFatalExceptionNotification, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateFatalExceptionNotification
		}
		interface IAppStateSyncKey {
			keyId?: (waproto.Message.IAppStateSyncKeyId|null)
			keyData?: (waproto.Message.IAppStateSyncKeyData|null)
		}
		class AppStateSyncKey implements IAppStateSyncKey {
			constructor(p?: waproto.Message.IAppStateSyncKey)
			public keyId?: (waproto.Message.IAppStateSyncKeyId|null)
			public keyData?: (waproto.Message.IAppStateSyncKeyData|null)
			public static encode(m: waproto.Message.IAppStateSyncKey, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateSyncKey
		}
		interface IAppStateSyncKeyData {
			keyData?: (Uint8Array|null)
			fingerprint?: (waproto.Message.IAppStateSyncKeyFingerprint|null)
			timestamp?: (number|Long|null)
		}
		class AppStateSyncKeyData implements IAppStateSyncKeyData {
			constructor(p?: waproto.Message.IAppStateSyncKeyData)
			public keyData?: (Uint8Array|null)
			public fingerprint?: (waproto.Message.IAppStateSyncKeyFingerprint|null)
			public timestamp?: (number|Long|null)
			public static encode(m: waproto.Message.IAppStateSyncKeyData, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateSyncKeyData
		}
		interface IAppStateSyncKeyFingerprint {
			rawId?: (number|null)
			currentIndex?: (number|null)
			deviceIndexes?: (number[]|null)
		}
		class AppStateSyncKeyFingerprint implements IAppStateSyncKeyFingerprint {
			constructor(p?: waproto.Message.IAppStateSyncKeyFingerprint)
			public rawId?: (number|null)
			public currentIndex?: (number|null)
			public deviceIndexes: number[]
			public static encode(m: waproto.Message.IAppStateSyncKeyFingerprint, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateSyncKeyFingerprint
		}
		interface IAppStateSyncKeyId {
			keyId?: (Uint8Array|null)
		}
		class AppStateSyncKeyId implements IAppStateSyncKeyId {
			constructor(p?: waproto.Message.IAppStateSyncKeyId)
			public keyId?: (Uint8Array|null)
			public static encode(m: waproto.Message.IAppStateSyncKeyId, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateSyncKeyId
		}
		interface IAppStateSyncKeyRequest {
			keyIds?: (waproto.Message.IAppStateSyncKeyId[]|null)
		}
		class AppStateSyncKeyRequest implements IAppStateSyncKeyRequest {
			constructor(p?: waproto.Message.IAppStateSyncKeyRequest)
			public keyIds: waproto.Message.IAppStateSyncKeyId[]
			public static encode(m: waproto.Message.IAppStateSyncKeyRequest, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateSyncKeyRequest
		}
		interface IAppStateSyncKeyShare {
			keys?: (waproto.Message.IAppStateSyncKey[]|null)
		}
		class AppStateSyncKeyShare implements IAppStateSyncKeyShare {
			constructor(p?: waproto.Message.IAppStateSyncKeyShare)
			public keys: waproto.Message.IAppStateSyncKey[]
			public static encode(m: waproto.Message.IAppStateSyncKeyShare, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AppStateSyncKeyShare
		}
		interface IAudioMessage {
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
			contextInfo?: (waproto.IContextInfo|null)
			streamingSidecar?: (Uint8Array|null)
			waveform?: (Uint8Array|null)
			backgroundArgb?: (number|null)
			viewOnce?: (boolean|null)
			accessibilityLabel?: (string|null)
		}
		class AudioMessage implements IAudioMessage {
			constructor(p?: waproto.Message.IAudioMessage)
			public url?: (string|null)
			public mimetype?: (string|null)
			public fileSha256?: (Uint8Array|null)
			public fileLength?: (number|Long|null)
			public seconds?: (number|null)
			public ptt?: (boolean|null)
			public mediaKey?: (Uint8Array|null)
			public fileEncSha256?: (Uint8Array|null)
			public directPath?: (string|null)
			public mediaKeyTimestamp?: (number|Long|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public streamingSidecar?: (Uint8Array|null)
			public waveform?: (Uint8Array|null)
			public backgroundArgb?: (number|null)
			public viewOnce?: (boolean|null)
			public accessibilityLabel?: (string|null)
			public static encode(m: waproto.Message.IAudioMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.AudioMessage
		}
		interface IBCallMessage {
			sessionId?: (string|null)
			mediaType?: (waproto.Message.BCallMessage.MediaType|null)
			masterKey?: (Uint8Array|null)
			caption?: (string|null)
		}
		class BCallMessage implements IBCallMessage {
			constructor(p?: waproto.Message.IBCallMessage)
			public sessionId?: (string|null)
			public mediaType?: (waproto.Message.BCallMessage.MediaType|null)
			public masterKey?: (Uint8Array|null)
			public caption?: (string|null)
			public static encode(m: waproto.Message.IBCallMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.BCallMessage
		}
		namespace BCallMessage {
			enum MediaType {
				UNKNOWN = 0,
				AUDIO = 1,
				VIDEO = 2
			}
		}
		interface IButtonsMessage {
			contentText?: (string|null)
			footerText?: (string|null)
			contextInfo?: (waproto.IContextInfo|null)
			buttons?: (waproto.Message.ButtonsMessage.IButton[]|null)
			headerType?: (waproto.Message.ButtonsMessage.HeaderType|null)
			text?: (string|null)
			documentMessage?: (waproto.Message.IDocumentMessage|null)
			imageMessage?: (waproto.Message.IImageMessage|null)
			videoMessage?: (waproto.Message.IVideoMessage|null)
			locationMessage?: (waproto.Message.ILocationMessage|null)
		}
		class ButtonsMessage implements IButtonsMessage {
			constructor(p?: waproto.Message.IButtonsMessage)
			public contentText?: (string|null)
			public footerText?: (string|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public buttons: waproto.Message.ButtonsMessage.IButton[]
			public headerType?: (waproto.Message.ButtonsMessage.HeaderType|null)
			public text?: (string|null)
			public documentMessage?: (waproto.Message.IDocumentMessage|null)
			public imageMessage?: (waproto.Message.IImageMessage|null)
			public videoMessage?: (waproto.Message.IVideoMessage|null)
			public locationMessage?: (waproto.Message.ILocationMessage|null)
			public header?: ("text"|"documentMessage"|"imageMessage"|"videoMessage"|"locationMessage")
			public static encode(m: waproto.Message.IButtonsMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ButtonsMessage
		}
		namespace ButtonsMessage {
			interface IButton {
				buttonId?: (string|null)
				buttonText?: (waproto.Message.ButtonsMessage.Button.IButtonText|null)
				type?: (waproto.Message.ButtonsMessage.Button.Type|null)
				nativeFlowInfo?: (waproto.Message.ButtonsMessage.Button.INativeFlowInfo|null)
			}
			class Button implements IButton {
				constructor(p?: waproto.Message.ButtonsMessage.IButton)
				public buttonId?: (string|null)
				public buttonText?: (waproto.Message.ButtonsMessage.Button.IButtonText|null)
				public type?: (waproto.Message.ButtonsMessage.Button.Type|null)
				public nativeFlowInfo?: (waproto.Message.ButtonsMessage.Button.INativeFlowInfo|null)
				public static encode(m: waproto.Message.ButtonsMessage.IButton, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ButtonsMessage.Button
			}
			namespace Button {
				interface IButtonText {
					displayText?: (string|null)
				}
				class ButtonText implements IButtonText {
					constructor(p?: waproto.Message.ButtonsMessage.Button.IButtonText)
					public displayText?: (string|null)
					public static encode(m: waproto.Message.ButtonsMessage.Button.IButtonText, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ButtonsMessage.Button.ButtonText
				}
				interface INativeFlowInfo {
					name?: (string|null)
					paramsJson?: (string|null)
				}
				class NativeFlowInfo implements INativeFlowInfo {
					constructor(p?: waproto.Message.ButtonsMessage.Button.INativeFlowInfo)
					public name?: (string|null)
					public paramsJson?: (string|null)
					public static encode(m: waproto.Message.ButtonsMessage.Button.INativeFlowInfo, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ButtonsMessage.Button.NativeFlowInfo
				}
				enum Type {
					UNKNOWN = 0,
					RESPONSE = 1,
					NATIVE_FLOW = 2
				}
			}
			enum HeaderType {
				UNKNOWN = 0,
				EMPTY = 1,
				TEXT = 2,
				DOCUMENT = 3,
				IMAGE = 4,
				VIDEO = 5,
				LOCATION = 6
			}
		}
		interface IButtonsResponseMessage {
			selectedButtonId?: (string|null)
			contextInfo?: (waproto.IContextInfo|null)
			type?: (waproto.Message.ButtonsResponseMessage.Type|null)
			selectedDisplayText?: (string|null)
		}
		class ButtonsResponseMessage implements IButtonsResponseMessage {
			constructor(p?: waproto.Message.IButtonsResponseMessage)
			public selectedButtonId?: (string|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public type?: (waproto.Message.ButtonsResponseMessage.Type|null)
			public selectedDisplayText?: (string|null)
			public response?: "selectedDisplayText"
			public static encode(m: waproto.Message.IButtonsResponseMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ButtonsResponseMessage
		}
		namespace ButtonsResponseMessage {
			enum Type {
				UNKNOWN = 0,
				DISPLAY_TEXT = 1
			}
		}
		interface ICall {
			callKey?: (Uint8Array|null)
			conversionSource?: (string|null)
			conversionData?: (Uint8Array|null)
			conversionDelaySeconds?: (number|null)
			ctwaSignals?: (string|null)
			ctwaPayload?: (Uint8Array|null)
			contextInfo?: (waproto.IContextInfo|null)
			nativeFlowCallButtonPayload?: (string|null)
			deeplinkPayload?: (string|null)
			messageContextInfo?: (waproto.IMessageContextInfo|null)
			callEntryPoint?: (number|null)
		}
		class Call implements ICall {
			constructor(p?: waproto.Message.ICall)
			public callKey?: (Uint8Array|null)
			public conversionSource?: (string|null)
			public conversionData?: (Uint8Array|null)
			public conversionDelaySeconds?: (number|null)
			public ctwaSignals?: (string|null)
			public ctwaPayload?: (Uint8Array|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public nativeFlowCallButtonPayload?: (string|null)
			public deeplinkPayload?: (string|null)
			public messageContextInfo?: (waproto.IMessageContextInfo|null)
			public callEntryPoint?: (number|null)
			public static encode(m: waproto.Message.ICall, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.Call
		}
		interface ICallLogMessage {
			isVideo?: (boolean|null)
			callOutcome?: (waproto.Message.CallLogMessage.CallOutcome|null)
			durationSecs?: (number|Long|null)
			callType?: (waproto.Message.CallLogMessage.CallType|null)
			participants?: (waproto.Message.CallLogMessage.ICallParticipant[]|null)
		}
		class CallLogMessage implements ICallLogMessage {
			constructor(p?: waproto.Message.ICallLogMessage)
			public isVideo?: (boolean|null)
			public callOutcome?: (waproto.Message.CallLogMessage.CallOutcome|null)
			public durationSecs?: (number|Long|null)
			public callType?: (waproto.Message.CallLogMessage.CallType|null)
			public participants: waproto.Message.CallLogMessage.ICallParticipant[]
			public static encode(m: waproto.Message.ICallLogMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.CallLogMessage
		}
		namespace CallLogMessage {
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
			interface ICallParticipant {
				jid?: (string|null)
				callOutcome?: (waproto.Message.CallLogMessage.CallOutcome|null)
			}
			class CallParticipant implements ICallParticipant {
				constructor(p?: waproto.Message.CallLogMessage.ICallParticipant)
				public jid?: (string|null)
				public callOutcome?: (waproto.Message.CallLogMessage.CallOutcome|null)
				public static encode(m: waproto.Message.CallLogMessage.ICallParticipant, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.CallLogMessage.CallParticipant
			}
			enum CallType {
				REGULAR = 0,
				SCHEDULED_CALL = 1,
				VOICE_CHAT = 2
			}
		}
		interface ICancelPaymentRequestMessage {
			key?: (waproto.IMessageKey|null)
		}
		class CancelPaymentRequestMessage implements ICancelPaymentRequestMessage {
			constructor(p?: waproto.Message.ICancelPaymentRequestMessage)
			public key?: (waproto.IMessageKey|null)
			public static encode(m: waproto.Message.ICancelPaymentRequestMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.CancelPaymentRequestMessage
		}
		interface IChat {
			displayName?: (string|null)
			id?: (string|null)
		}
		class Chat implements IChat {
			constructor(p?: waproto.Message.IChat)
			public displayName?: (string|null)
			public id?: (string|null)
			public static encode(m: waproto.Message.IChat, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.Chat
		}
		interface ICloudAPIThreadControlNotification {
			status?: (waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControl|null)
			senderNotificationTimestampMs?: (number|Long|null)
			consumerLid?: (string|null)
			consumerPhoneNumber?: (string|null)
			notificationContent?: (waproto.Message.CloudAPIThreadControlNotification.ICloudAPIThreadControlNotificationContent|null)
			shouldSuppressNotification?: (boolean|null)
		}
		class CloudAPIThreadControlNotification implements ICloudAPIThreadControlNotification {
			constructor(p?: waproto.Message.ICloudAPIThreadControlNotification)
			public status?: (waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControl|null)
			public senderNotificationTimestampMs?: (number|Long|null)
			public consumerLid?: (string|null)
			public consumerPhoneNumber?: (string|null)
			public notificationContent?: (waproto.Message.CloudAPIThreadControlNotification.ICloudAPIThreadControlNotificationContent|null)
			public shouldSuppressNotification?: (boolean|null)
			public static encode(m: waproto.Message.ICloudAPIThreadControlNotification, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.CloudAPIThreadControlNotification
		}
		namespace CloudAPIThreadControlNotification {
			enum CloudAPIThreadControl {
				UNKNOWN = 0,
				CONTROL_PASSED = 1,
				CONTROL_TAKEN = 2
			}
			interface ICloudAPIThreadControlNotificationContent {
				handoffNotificationText?: (string|null)
				extraJson?: (string|null)
			}
			class CloudAPIThreadControlNotificationContent implements ICloudAPIThreadControlNotificationContent {
				constructor(p?: waproto.Message.CloudAPIThreadControlNotification.ICloudAPIThreadControlNotificationContent)
				public handoffNotificationText?: (string|null)
				public extraJson?: (string|null)
				public static encode(m: waproto.Message.CloudAPIThreadControlNotification.ICloudAPIThreadControlNotificationContent, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.CloudAPIThreadControlNotification.CloudAPIThreadControlNotificationContent
			}
		}
		interface ICommentMessage {
			message?: (waproto.IMessage|null)
			targetMessageKey?: (waproto.IMessageKey|null)
		}
		class CommentMessage implements ICommentMessage {
			constructor(p?: waproto.Message.ICommentMessage)
			public message?: (waproto.IMessage|null)
			public targetMessageKey?: (waproto.IMessageKey|null)
			public static encode(m: waproto.Message.ICommentMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.CommentMessage
		}
		interface IConditionalRevealMessage {
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
			conditionalRevealMessageType?: (waproto.Message.ConditionalRevealMessage.ConditionalRevealMessageType|null)
			revealKeyId?: (string|null)
		}
		class ConditionalRevealMessage implements IConditionalRevealMessage {
			constructor(p?: waproto.Message.IConditionalRevealMessage)
			public encPayload?: (Uint8Array|null)
			public encIv?: (Uint8Array|null)
			public conditionalRevealMessageType?: (waproto.Message.ConditionalRevealMessage.ConditionalRevealMessageType|null)
			public revealKeyId?: (string|null)
			public static encode(m: waproto.Message.IConditionalRevealMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ConditionalRevealMessage
		}
		namespace ConditionalRevealMessage {
			enum ConditionalRevealMessageType {
				UNKNOWN = 0,
				SCHEDULED_MESSAGE = 1
			}
		}
		interface IContactMessage {
			displayName?: (string|null)
			vcard?: (string|null)
			contextInfo?: (waproto.IContextInfo|null)
			isSelfContact?: (boolean|null)
		}
		class ContactMessage implements IContactMessage {
			constructor(p?: waproto.Message.IContactMessage)
			public displayName?: (string|null)
			public vcard?: (string|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public isSelfContact?: (boolean|null)
			public static encode(m: waproto.Message.IContactMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ContactMessage
		}
		interface IContactsArrayMessage {
			displayName?: (string|null)
			contacts?: (waproto.Message.IContactMessage[]|null)
			contextInfo?: (waproto.IContextInfo|null)
		}
		class ContactsArrayMessage implements IContactsArrayMessage {
			constructor(p?: waproto.Message.IContactsArrayMessage)
			public displayName?: (string|null)
			public contacts: waproto.Message.IContactMessage[]
			public contextInfo?: (waproto.IContextInfo|null)
			public static encode(m: waproto.Message.IContactsArrayMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ContactsArrayMessage
		}
		interface IDeclinePaymentRequestMessage {
			key?: (waproto.IMessageKey|null)
		}
		class DeclinePaymentRequestMessage implements IDeclinePaymentRequestMessage {
			constructor(p?: waproto.Message.IDeclinePaymentRequestMessage)
			public key?: (waproto.IMessageKey|null)
			public static encode(m: waproto.Message.IDeclinePaymentRequestMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.DeclinePaymentRequestMessage
		}
		interface IDeviceSentMessage {
			destinationJid?: (string|null)
			message?: (waproto.IMessage|null)
			phash?: (string|null)
		}
		class DeviceSentMessage implements IDeviceSentMessage {
			constructor(p?: waproto.Message.IDeviceSentMessage)
			public destinationJid?: (string|null)
			public message?: (waproto.IMessage|null)
			public phash?: (string|null)
			public static encode(m: waproto.Message.IDeviceSentMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.DeviceSentMessage
		}
		interface IDocumentMessage {
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
			contextInfo?: (waproto.IContextInfo|null)
			thumbnailHeight?: (number|null)
			thumbnailWidth?: (number|null)
			caption?: (string|null)
			accessibilityLabel?: (string|null)
		}
		class DocumentMessage implements IDocumentMessage {
			constructor(p?: waproto.Message.IDocumentMessage)
			public url?: (string|null)
			public mimetype?: (string|null)
			public title?: (string|null)
			public fileSha256?: (Uint8Array|null)
			public fileLength?: (number|Long|null)
			public pageCount?: (number|null)
			public mediaKey?: (Uint8Array|null)
			public fileName?: (string|null)
			public fileEncSha256?: (Uint8Array|null)
			public directPath?: (string|null)
			public mediaKeyTimestamp?: (number|Long|null)
			public contactVcard?: (boolean|null)
			public thumbnailDirectPath?: (string|null)
			public thumbnailSha256?: (Uint8Array|null)
			public thumbnailEncSha256?: (Uint8Array|null)
			public jpegThumbnail?: (Uint8Array|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public thumbnailHeight?: (number|null)
			public thumbnailWidth?: (number|null)
			public caption?: (string|null)
			public accessibilityLabel?: (string|null)
			public static encode(m: waproto.Message.IDocumentMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.DocumentMessage
		}
		interface IEncCommentMessage {
			targetMessageKey?: (waproto.IMessageKey|null)
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
		}
		class EncCommentMessage implements IEncCommentMessage {
			constructor(p?: waproto.Message.IEncCommentMessage)
			public targetMessageKey?: (waproto.IMessageKey|null)
			public encPayload?: (Uint8Array|null)
			public encIv?: (Uint8Array|null)
			public static encode(m: waproto.Message.IEncCommentMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.EncCommentMessage
		}
		interface IEncEventResponseMessage {
			eventCreationMessageKey?: (waproto.IMessageKey|null)
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
		}
		class EncEventResponseMessage implements IEncEventResponseMessage {
			constructor(p?: waproto.Message.IEncEventResponseMessage)
			public eventCreationMessageKey?: (waproto.IMessageKey|null)
			public encPayload?: (Uint8Array|null)
			public encIv?: (Uint8Array|null)
			public static encode(m: waproto.Message.IEncEventResponseMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.EncEventResponseMessage
		}
		interface IEncReactionMessage {
			targetMessageKey?: (waproto.IMessageKey|null)
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
		}
		class EncReactionMessage implements IEncReactionMessage {
			constructor(p?: waproto.Message.IEncReactionMessage)
			public targetMessageKey?: (waproto.IMessageKey|null)
			public encPayload?: (Uint8Array|null)
			public encIv?: (Uint8Array|null)
			public static encode(m: waproto.Message.IEncReactionMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.EncReactionMessage
		}
		interface IEventMessage {
			contextInfo?: (waproto.IContextInfo|null)
			isCanceled?: (boolean|null)
			name?: (string|null)
			description?: (string|null)
			location?: (waproto.Message.ILocationMessage|null)
			joinLink?: (string|null)
			startTime?: (number|Long|null)
			endTime?: (number|Long|null)
			extraGuestsAllowed?: (boolean|null)
			isScheduleCall?: (boolean|null)
			hasReminder?: (boolean|null)
			reminderOffsetSec?: (number|Long|null)
		}
		class EventMessage implements IEventMessage {
			constructor(p?: waproto.Message.IEventMessage)
			public contextInfo?: (waproto.IContextInfo|null)
			public isCanceled?: (boolean|null)
			public name?: (string|null)
			public description?: (string|null)
			public location?: (waproto.Message.ILocationMessage|null)
			public joinLink?: (string|null)
			public startTime?: (number|Long|null)
			public endTime?: (number|Long|null)
			public extraGuestsAllowed?: (boolean|null)
			public isScheduleCall?: (boolean|null)
			public hasReminder?: (boolean|null)
			public reminderOffsetSec?: (number|Long|null)
			public static encode(m: waproto.Message.IEventMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.EventMessage
		}
		interface IEventResponseMessage {
			response?: (waproto.Message.EventResponseMessage.EventResponseType|null)
			timestampMs?: (number|Long|null)
			extraGuestCount?: (number|null)
		}
		class EventResponseMessage implements IEventResponseMessage {
			constructor(p?: waproto.Message.IEventResponseMessage)
			public response?: (waproto.Message.EventResponseMessage.EventResponseType|null)
			public timestampMs?: (number|Long|null)
			public extraGuestCount?: (number|null)
			public static encode(m: waproto.Message.IEventResponseMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.EventResponseMessage
		}
		namespace EventResponseMessage {
			enum EventResponseType {
				UNKNOWN = 0,
				GOING = 1,
				NOT_GOING = 2,
				MAYBE = 3
			}
		}
		interface IExtendedTextMessage {
			text?: (string|null)
			matchedText?: (string|null)
			description?: (string|null)
			title?: (string|null)
			textArgb?: (number|null)
			backgroundArgb?: (number|null)
			font?: (waproto.Message.ExtendedTextMessage.FontType|null)
			previewType?: (waproto.Message.ExtendedTextMessage.PreviewType|null)
			jpegThumbnail?: (Uint8Array|null)
			contextInfo?: (waproto.IContextInfo|null)
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
			faviconMMSMetadata?: (waproto.Message.IMMSThumbnailMetadata|null)
			linkPreviewMetadata?: (waproto.Message.ILinkPreviewMetadata|null)
			paymentLinkMetadata?: (waproto.Message.IPaymentLinkMetadata|null)
			endCardTiles?: (waproto.Message.IVideoEndCard[]|null)
			videoContentUrl?: (string|null)
			musicMetadata?: (waproto.IEmbeddedMusic|null)
			paymentExtendedMetadata?: (waproto.Message.IPaymentExtendedMetadata|null)
		}
		class ExtendedTextMessage implements IExtendedTextMessage {
			constructor(p?: waproto.Message.IExtendedTextMessage)
			public text?: (string|null)
			public matchedText?: (string|null)
			public description?: (string|null)
			public title?: (string|null)
			public textArgb?: (number|null)
			public backgroundArgb?: (number|null)
			public font?: (waproto.Message.ExtendedTextMessage.FontType|null)
			public previewType?: (waproto.Message.ExtendedTextMessage.PreviewType|null)
			public jpegThumbnail?: (Uint8Array|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public doNotPlayInline?: (boolean|null)
			public thumbnailDirectPath?: (string|null)
			public thumbnailSha256?: (Uint8Array|null)
			public thumbnailEncSha256?: (Uint8Array|null)
			public mediaKey?: (Uint8Array|null)
			public mediaKeyTimestamp?: (number|Long|null)
			public thumbnailHeight?: (number|null)
			public thumbnailWidth?: (number|null)
			public inviteLinkGroupType?: (waproto.Message.ExtendedTextMessage.InviteLinkGroupType|null)
			public inviteLinkParentGroupSubjectV2?: (string|null)
			public inviteLinkParentGroupThumbnailV2?: (Uint8Array|null)
			public inviteLinkGroupTypeV2?: (waproto.Message.ExtendedTextMessage.InviteLinkGroupType|null)
			public viewOnce?: (boolean|null)
			public videoHeight?: (number|null)
			public videoWidth?: (number|null)
			public faviconMMSMetadata?: (waproto.Message.IMMSThumbnailMetadata|null)
			public linkPreviewMetadata?: (waproto.Message.ILinkPreviewMetadata|null)
			public paymentLinkMetadata?: (waproto.Message.IPaymentLinkMetadata|null)
			public endCardTiles: waproto.Message.IVideoEndCard[]
			public videoContentUrl?: (string|null)
			public musicMetadata?: (waproto.IEmbeddedMusic|null)
			public paymentExtendedMetadata?: (waproto.Message.IPaymentExtendedMetadata|null)
			public static encode(m: waproto.Message.IExtendedTextMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ExtendedTextMessage
		}
		namespace ExtendedTextMessage {
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
		}
		interface IFullHistorySyncOnDemandConfig {
			historyFromTimestamp?: (number|Long|null)
			historyDurationDays?: (number|null)
		}
		class FullHistorySyncOnDemandConfig implements IFullHistorySyncOnDemandConfig {
			constructor(p?: waproto.Message.IFullHistorySyncOnDemandConfig)
			public historyFromTimestamp?: (number|Long|null)
			public historyDurationDays?: (number|null)
			public static encode(m: waproto.Message.IFullHistorySyncOnDemandConfig, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.FullHistorySyncOnDemandConfig
		}
		interface IFullHistorySyncOnDemandRequestMetadata {
			requestId?: (string|null)
			businessProduct?: (string|null)
			opaqueClientData?: (Uint8Array|null)
		}
		class FullHistorySyncOnDemandRequestMetadata implements IFullHistorySyncOnDemandRequestMetadata {
			constructor(p?: waproto.Message.IFullHistorySyncOnDemandRequestMetadata)
			public requestId?: (string|null)
			public businessProduct?: (string|null)
			public opaqueClientData?: (Uint8Array|null)
			public static encode(m: waproto.Message.IFullHistorySyncOnDemandRequestMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.FullHistorySyncOnDemandRequestMetadata
		}
		interface IFutureProofMessage {
			message?: (waproto.IMessage|null)
		}
		class FutureProofMessage implements IFutureProofMessage {
			constructor(p?: waproto.Message.IFutureProofMessage)
			public message?: (waproto.IMessage|null)
			public static encode(m: waproto.Message.IFutureProofMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.FutureProofMessage
		}
		interface IGroupInviteMessage {
			groupJid?: (string|null)
			inviteCode?: (string|null)
			inviteExpiration?: (number|Long|null)
			groupName?: (string|null)
			jpegThumbnail?: (Uint8Array|null)
			caption?: (string|null)
			contextInfo?: (waproto.IContextInfo|null)
			groupType?: (waproto.Message.GroupInviteMessage.GroupType|null)
		}
		class GroupInviteMessage implements IGroupInviteMessage {
			constructor(p?: waproto.Message.IGroupInviteMessage)
			public groupJid?: (string|null)
			public inviteCode?: (string|null)
			public inviteExpiration?: (number|Long|null)
			public groupName?: (string|null)
			public jpegThumbnail?: (Uint8Array|null)
			public caption?: (string|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public groupType?: (waproto.Message.GroupInviteMessage.GroupType|null)
			public static encode(m: waproto.Message.IGroupInviteMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.GroupInviteMessage
		}
		namespace GroupInviteMessage {
			enum GroupType {
				DEFAULT = 0,
				PARENT = 1
			}
		}
		interface IHighlyStructuredMessage {
			namespace?: (string|null)
			elementName?: (string|null)
			params?: (string[]|null)
			fallbackLg?: (string|null)
			fallbackLc?: (string|null)
			localizableParams?: (waproto.Message.HighlyStructuredMessage.IHSMLocalizableParameter[]|null)
			deterministicLg?: (string|null)
			deterministicLc?: (string|null)
			hydratedHsm?: (waproto.Message.ITemplateMessage|null)
		}
		class HighlyStructuredMessage implements IHighlyStructuredMessage {
			constructor(p?: waproto.Message.IHighlyStructuredMessage)
			public namespace?: (string|null)
			public elementName?: (string|null)
			public params: string[]
			public fallbackLg?: (string|null)
			public fallbackLc?: (string|null)
			public localizableParams: waproto.Message.HighlyStructuredMessage.IHSMLocalizableParameter[]
			public deterministicLg?: (string|null)
			public deterministicLc?: (string|null)
			public hydratedHsm?: (waproto.Message.ITemplateMessage|null)
			public static encode(m: waproto.Message.IHighlyStructuredMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HighlyStructuredMessage
		}
		namespace HighlyStructuredMessage {
			interface IHSMLocalizableParameter {
				"default"?: (string|null)
				currency?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.IHSMCurrency|null)
				dateTime?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.IHSMDateTime|null)
			}
			class HSMLocalizableParameter implements IHSMLocalizableParameter {
				constructor(p?: waproto.Message.HighlyStructuredMessage.IHSMLocalizableParameter)
				public default?: (string|null)
				public currency?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.IHSMCurrency|null)
				public dateTime?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.IHSMDateTime|null)
				public paramOneof?: ("currency"|"dateTime")
				public static encode(m: waproto.Message.HighlyStructuredMessage.IHSMLocalizableParameter, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter
			}
			namespace HSMLocalizableParameter {
				interface IHSMCurrency {
					currencyCode?: (string|null)
					amount1000?: (number|Long|null)
				}
				class HSMCurrency implements IHSMCurrency {
					constructor(p?: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.IHSMCurrency)
					public currencyCode?: (string|null)
					public amount1000?: (number|Long|null)
					public static encode(m: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.IHSMCurrency, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMCurrency
				}
				interface IHSMDateTime {
					component?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.IHSMDateTimeComponent|null)
					unixEpoch?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.IHSMDateTimeUnixEpoch|null)
				}
				class HSMDateTime implements IHSMDateTime {
					constructor(p?: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.IHSMDateTime)
					public component?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.IHSMDateTimeComponent|null)
					public unixEpoch?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.IHSMDateTimeUnixEpoch|null)
					public datetimeOneof?: ("component"|"unixEpoch")
					public static encode(m: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.IHSMDateTime, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime
				}
				namespace HSMDateTime {
					interface IHSMDateTimeComponent {
						dayOfWeek?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.DayOfWeekType|null)
						year?: (number|null)
						month?: (number|null)
						dayOfMonth?: (number|null)
						hour?: (number|null)
						minute?: (number|null)
						calendar?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.CalendarType|null)
					}
					class HSMDateTimeComponent implements IHSMDateTimeComponent {
						constructor(p?: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.IHSMDateTimeComponent)
						public dayOfWeek?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.DayOfWeekType|null)
						public year?: (number|null)
						public month?: (number|null)
						public dayOfMonth?: (number|null)
						public hour?: (number|null)
						public minute?: (number|null)
						public calendar?: (waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent.CalendarType|null)
						public static encode(m: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.IHSMDateTimeComponent, w?: PbWriter): PbWriter
						public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeComponent
					}
					namespace HSMDateTimeComponent {
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
					interface IHSMDateTimeUnixEpoch {
						timestamp?: (number|Long|null)
					}
					class HSMDateTimeUnixEpoch implements IHSMDateTimeUnixEpoch {
						constructor(p?: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.IHSMDateTimeUnixEpoch)
						public timestamp?: (number|Long|null)
						public static encode(m: waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.IHSMDateTimeUnixEpoch, w?: PbWriter): PbWriter
						public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HighlyStructuredMessage.HSMLocalizableParameter.HSMDateTime.HSMDateTimeUnixEpoch
					}
				}
			}
		}
		interface IHistorySyncMessageAccessStatus {
			completeAccessGranted?: (boolean|null)
		}
		class HistorySyncMessageAccessStatus implements IHistorySyncMessageAccessStatus {
			constructor(p?: waproto.Message.IHistorySyncMessageAccessStatus)
			public completeAccessGranted?: (boolean|null)
			public static encode(m: waproto.Message.IHistorySyncMessageAccessStatus, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HistorySyncMessageAccessStatus
		}
		interface IHistorySyncNotification {
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
			fullHistorySyncOnDemandRequestMetadata?: (waproto.Message.IFullHistorySyncOnDemandRequestMetadata|null)
			encHandle?: (string|null)
			messageAccessStatus?: (waproto.Message.IHistorySyncMessageAccessStatus|null)
		}
		class HistorySyncNotification implements IHistorySyncNotification {
			constructor(p?: waproto.Message.IHistorySyncNotification)
			public fileSha256?: (Uint8Array|null)
			public fileLength?: (number|Long|null)
			public mediaKey?: (Uint8Array|null)
			public fileEncSha256?: (Uint8Array|null)
			public directPath?: (string|null)
			public syncType?: (waproto.Message.HistorySyncType|null)
			public chunkOrder?: (number|null)
			public originalMessageId?: (string|null)
			public progress?: (number|null)
			public oldestMsgInChunkTimestampSec?: (number|Long|null)
			public initialHistBootstrapInlinePayload?: (Uint8Array|null)
			public peerDataRequestSessionId?: (string|null)
			public fullHistorySyncOnDemandRequestMetadata?: (waproto.Message.IFullHistorySyncOnDemandRequestMetadata|null)
			public encHandle?: (string|null)
			public messageAccessStatus?: (waproto.Message.IHistorySyncMessageAccessStatus|null)
			public static encode(m: waproto.Message.IHistorySyncNotification, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.HistorySyncNotification
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
		interface IImageMessage {
			url?: (string|null)
			mimetype?: (string|null)
			caption?: (string|null)
			fileSha256?: (Uint8Array|null)
			fileLength?: (number|Long|null)
			height?: (number|null)
			width?: (number|null)
			mediaKey?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			interactiveAnnotations?: (waproto.IInteractiveAnnotation[]|null)
			directPath?: (string|null)
			mediaKeyTimestamp?: (number|Long|null)
			jpegThumbnail?: (Uint8Array|null)
			contextInfo?: (waproto.IContextInfo|null)
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
			annotations?: (waproto.IInteractiveAnnotation[]|null)
			imageSourceType?: (waproto.Message.ImageMessage.ImageSourceType|null)
			accessibilityLabel?: (string|null)
			qrUrl?: (string|null)
		}
		class ImageMessage implements IImageMessage {
			constructor(p?: waproto.Message.IImageMessage)
			public url?: (string|null)
			public mimetype?: (string|null)
			public caption?: (string|null)
			public fileSha256?: (Uint8Array|null)
			public fileLength?: (number|Long|null)
			public height?: (number|null)
			public width?: (number|null)
			public mediaKey?: (Uint8Array|null)
			public fileEncSha256?: (Uint8Array|null)
			public interactiveAnnotations: waproto.IInteractiveAnnotation[]
			public directPath?: (string|null)
			public mediaKeyTimestamp?: (number|Long|null)
			public jpegThumbnail?: (Uint8Array|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public firstScanSidecar?: (Uint8Array|null)
			public firstScanLength?: (number|null)
			public experimentGroupId?: (number|null)
			public scansSidecar?: (Uint8Array|null)
			public scanLengths: number[]
			public midQualityFileSha256?: (Uint8Array|null)
			public midQualityFileEncSha256?: (Uint8Array|null)
			public viewOnce?: (boolean|null)
			public thumbnailDirectPath?: (string|null)
			public thumbnailSha256?: (Uint8Array|null)
			public thumbnailEncSha256?: (Uint8Array|null)
			public staticUrl?: (string|null)
			public annotations: waproto.IInteractiveAnnotation[]
			public imageSourceType?: (waproto.Message.ImageMessage.ImageSourceType|null)
			public accessibilityLabel?: (string|null)
			public qrUrl?: (string|null)
			public static encode(m: waproto.Message.IImageMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ImageMessage
		}
		namespace ImageMessage {
			enum ImageSourceType {
				USER_IMAGE = 0,
				AI_GENERATED = 1,
				AI_MODIFIED = 2,
				RASTERIZED_TEXT_STATUS = 3
			}
		}
		interface IInitialSecurityNotificationSettingSync {
			securityNotificationEnabled?: (boolean|null)
		}
		class InitialSecurityNotificationSettingSync implements IInitialSecurityNotificationSettingSync {
			constructor(p?: waproto.Message.IInitialSecurityNotificationSettingSync)
			public securityNotificationEnabled?: (boolean|null)
			public static encode(m: waproto.Message.IInitialSecurityNotificationSettingSync, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InitialSecurityNotificationSettingSync
		}
		enum InsightDeliveryState {
			SENT = 0,
			DELIVERED = 1,
			READ = 2,
			REPLIED = 3,
			QUICK_REPLIED = 4
		}
		interface IInteractiveMessage {
			header?: (waproto.Message.InteractiveMessage.IHeader|null)
			body?: (waproto.Message.InteractiveMessage.IBody|null)
			footer?: (waproto.Message.InteractiveMessage.IFooter|null)
			bloksWidget?: (waproto.Message.InteractiveMessage.IBloksWidget|null)
			contextInfo?: (waproto.IContextInfo|null)
			urlTrackingMap?: (waproto.IUrlTrackingMap|null)
			shopStorefrontMessage?: (waproto.Message.InteractiveMessage.IShopMessage|null)
			collectionMessage?: (waproto.Message.InteractiveMessage.ICollectionMessage|null)
			nativeFlowMessage?: (waproto.Message.InteractiveMessage.INativeFlowMessage|null)
			carouselMessage?: (waproto.Message.InteractiveMessage.ICarouselMessage|null)
		}
		class InteractiveMessage implements IInteractiveMessage {
			constructor(p?: waproto.Message.IInteractiveMessage)
			public header?: (waproto.Message.InteractiveMessage.IHeader|null)
			public body?: (waproto.Message.InteractiveMessage.IBody|null)
			public footer?: (waproto.Message.InteractiveMessage.IFooter|null)
			public bloksWidget?: (waproto.Message.InteractiveMessage.IBloksWidget|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public urlTrackingMap?: (waproto.IUrlTrackingMap|null)
			public shopStorefrontMessage?: (waproto.Message.InteractiveMessage.IShopMessage|null)
			public collectionMessage?: (waproto.Message.InteractiveMessage.ICollectionMessage|null)
			public nativeFlowMessage?: (waproto.Message.InteractiveMessage.INativeFlowMessage|null)
			public carouselMessage?: (waproto.Message.InteractiveMessage.ICarouselMessage|null)
			public interactiveMessage?: ("shopStorefrontMessage"|"collectionMessage"|"nativeFlowMessage"|"carouselMessage")
			public static encode(m: waproto.Message.IInteractiveMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage
		}
		namespace InteractiveMessage {
			interface IBloksWidget {
				uuid?: (string|null)
				data?: (string|null)
				type?: (string|null)
			}
			class BloksWidget implements IBloksWidget {
				constructor(p?: waproto.Message.InteractiveMessage.IBloksWidget)
				public uuid?: (string|null)
				public data?: (string|null)
				public type?: (string|null)
				public static encode(m: waproto.Message.InteractiveMessage.IBloksWidget, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.BloksWidget
			}
			interface IBody {
				text?: (string|null)
			}
			class Body implements IBody {
				constructor(p?: waproto.Message.InteractiveMessage.IBody)
				public text?: (string|null)
				public static encode(m: waproto.Message.InteractiveMessage.IBody, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.Body
			}
			interface ICarouselMessage {
				cards?: (waproto.Message.IInteractiveMessage[]|null)
				messageVersion?: (number|null)
				carouselCardType?: (waproto.Message.InteractiveMessage.CarouselMessage.CarouselCardType|null)
			}
			class CarouselMessage implements ICarouselMessage {
				constructor(p?: waproto.Message.InteractiveMessage.ICarouselMessage)
				public cards: waproto.Message.IInteractiveMessage[]
				public messageVersion?: (number|null)
				public carouselCardType?: (waproto.Message.InteractiveMessage.CarouselMessage.CarouselCardType|null)
				public static encode(m: waproto.Message.InteractiveMessage.ICarouselMessage, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.CarouselMessage
			}
			namespace CarouselMessage {
				enum CarouselCardType {
					UNKNOWN = 0,
					HSCROLL_CARDS = 1,
					ALBUM_IMAGE = 2
				}
			}
			interface ICollectionMessage {
				bizJid?: (string|null)
				id?: (string|null)
				messageVersion?: (number|null)
			}
			class CollectionMessage implements ICollectionMessage {
				constructor(p?: waproto.Message.InteractiveMessage.ICollectionMessage)
				public bizJid?: (string|null)
				public id?: (string|null)
				public messageVersion?: (number|null)
				public static encode(m: waproto.Message.InteractiveMessage.ICollectionMessage, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.CollectionMessage
			}
			interface IFooter {
				text?: (string|null)
				hasMediaAttachment?: (boolean|null)
				audioMessage?: (waproto.Message.IAudioMessage|null)
			}
			class Footer implements IFooter {
				constructor(p?: waproto.Message.InteractiveMessage.IFooter)
				public text?: (string|null)
				public hasMediaAttachment?: (boolean|null)
				public audioMessage?: (waproto.Message.IAudioMessage|null)
				public media?: "audioMessage"
				public static encode(m: waproto.Message.InteractiveMessage.IFooter, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.Footer
			}
			interface IHeader {
				title?: (string|null)
				subtitle?: (string|null)
				hasMediaAttachment?: (boolean|null)
				bloksWidget?: (waproto.Message.InteractiveMessage.IBloksWidget|null)
				documentMessage?: (waproto.Message.IDocumentMessage|null)
				imageMessage?: (waproto.Message.IImageMessage|null)
				jpegThumbnail?: (Uint8Array|null)
				videoMessage?: (waproto.Message.IVideoMessage|null)
				locationMessage?: (waproto.Message.ILocationMessage|null)
				productMessage?: (waproto.Message.IProductMessage|null)
			}
			class Header implements IHeader {
				constructor(p?: waproto.Message.InteractiveMessage.IHeader)
				public title?: (string|null)
				public subtitle?: (string|null)
				public hasMediaAttachment?: (boolean|null)
				public bloksWidget?: (waproto.Message.InteractiveMessage.IBloksWidget|null)
				public documentMessage?: (waproto.Message.IDocumentMessage|null)
				public imageMessage?: (waproto.Message.IImageMessage|null)
				public jpegThumbnail?: (Uint8Array|null)
				public videoMessage?: (waproto.Message.IVideoMessage|null)
				public locationMessage?: (waproto.Message.ILocationMessage|null)
				public productMessage?: (waproto.Message.IProductMessage|null)
				public media?: ("documentMessage"|"imageMessage"|"jpegThumbnail"|"videoMessage"|"locationMessage"|"productMessage")
				public static encode(m: waproto.Message.InteractiveMessage.IHeader, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.Header
			}
			interface INativeFlowMessage {
				buttons?: (waproto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton[]|null)
				messageParamsJson?: (string|null)
				messageVersion?: (number|null)
			}
			class NativeFlowMessage implements INativeFlowMessage {
				constructor(p?: waproto.Message.InteractiveMessage.INativeFlowMessage)
				public buttons: waproto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton[]
				public messageParamsJson?: (string|null)
				public messageVersion?: (number|null)
				public static encode(m: waproto.Message.InteractiveMessage.INativeFlowMessage, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.NativeFlowMessage
			}
			namespace NativeFlowMessage {
				interface INativeFlowButton {
					name?: (string|null)
					buttonParamsJson?: (string|null)
				}
				class NativeFlowButton implements INativeFlowButton {
					constructor(p?: waproto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton)
					public name?: (string|null)
					public buttonParamsJson?: (string|null)
					public static encode(m: waproto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton
				}
			}
			interface IShopMessage {
				id?: (string|null)
				surface?: (waproto.Message.InteractiveMessage.ShopMessage.Surface|null)
				messageVersion?: (number|null)
			}
			class ShopMessage implements IShopMessage {
				constructor(p?: waproto.Message.InteractiveMessage.IShopMessage)
				public id?: (string|null)
				public surface?: (waproto.Message.InteractiveMessage.ShopMessage.Surface|null)
				public messageVersion?: (number|null)
				public static encode(m: waproto.Message.InteractiveMessage.IShopMessage, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveMessage.ShopMessage
			}
			namespace ShopMessage {
				enum Surface {
					UNKNOWN_SURFACE = 0,
					FB = 1,
					IG = 2,
					WA = 3
				}
			}
		}
		interface IInteractiveResponseMessage {
			body?: (waproto.Message.InteractiveResponseMessage.IBody|null)
			contextInfo?: (waproto.IContextInfo|null)
			nativeFlowResponseMessage?: (waproto.Message.InteractiveResponseMessage.INativeFlowResponseMessage|null)
		}
		class InteractiveResponseMessage implements IInteractiveResponseMessage {
			constructor(p?: waproto.Message.IInteractiveResponseMessage)
			public body?: (waproto.Message.InteractiveResponseMessage.IBody|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public nativeFlowResponseMessage?: (waproto.Message.InteractiveResponseMessage.INativeFlowResponseMessage|null)
			public interactiveResponseMessage?: "nativeFlowResponseMessage"
			public static encode(m: waproto.Message.IInteractiveResponseMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveResponseMessage
		}
		namespace InteractiveResponseMessage {
			interface IBody {
				text?: (string|null)
				format?: (waproto.Message.InteractiveResponseMessage.Body.Format|null)
			}
			class Body implements IBody {
				constructor(p?: waproto.Message.InteractiveResponseMessage.IBody)
				public text?: (string|null)
				public format?: (waproto.Message.InteractiveResponseMessage.Body.Format|null)
				public static encode(m: waproto.Message.InteractiveResponseMessage.IBody, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveResponseMessage.Body
			}
			namespace Body {
				enum Format {
					DEFAULT = 0,
					EXTENSIONS_1 = 1
				}
			}
			interface INativeFlowResponseMessage {
				name?: (string|null)
				paramsJson?: (string|null)
				version?: (number|null)
			}
			class NativeFlowResponseMessage implements INativeFlowResponseMessage {
				constructor(p?: waproto.Message.InteractiveResponseMessage.INativeFlowResponseMessage)
				public name?: (string|null)
				public paramsJson?: (string|null)
				public version?: (number|null)
				public static encode(m: waproto.Message.InteractiveResponseMessage.INativeFlowResponseMessage, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InteractiveResponseMessage.NativeFlowResponseMessage
			}
		}
		interface IInvoiceMessage {
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
		}
		class InvoiceMessage implements IInvoiceMessage {
			constructor(p?: waproto.Message.IInvoiceMessage)
			public note?: (string|null)
			public token?: (string|null)
			public attachmentType?: (waproto.Message.InvoiceMessage.AttachmentType|null)
			public attachmentMimetype?: (string|null)
			public attachmentMediaKey?: (Uint8Array|null)
			public attachmentMediaKeyTimestamp?: (number|Long|null)
			public attachmentFileSha256?: (Uint8Array|null)
			public attachmentFileEncSha256?: (Uint8Array|null)
			public attachmentDirectPath?: (string|null)
			public attachmentJpegThumbnail?: (Uint8Array|null)
			public static encode(m: waproto.Message.IInvoiceMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.InvoiceMessage
		}
		namespace InvoiceMessage {
			enum AttachmentType {
				IMAGE = 0,
				PDF = 1
			}
		}
		interface IKeepInChatMessage {
			key?: (waproto.IMessageKey|null)
			keepType?: (waproto.KeepType|null)
			timestampMs?: (number|Long|null)
		}
		class KeepInChatMessage implements IKeepInChatMessage {
			constructor(p?: waproto.Message.IKeepInChatMessage)
			public key?: (waproto.IMessageKey|null)
			public keepType?: (waproto.KeepType|null)
			public timestampMs?: (number|Long|null)
			public static encode(m: waproto.Message.IKeepInChatMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.KeepInChatMessage
		}
		interface ILinkPreviewMetadata {
			paymentLinkMetadata?: (waproto.Message.IPaymentLinkMetadata|null)
			urlMetadata?: (waproto.Message.IURLMetadata|null)
			fbExperimentId?: (number|null)
			linkMediaDuration?: (number|null)
			socialMediaPostType?: (waproto.Message.LinkPreviewMetadata.SocialMediaPostType|null)
			linkInlineVideoMuted?: (boolean|null)
			videoContentUrl?: (string|null)
			musicMetadata?: (waproto.IEmbeddedMusic|null)
			videoContentCaption?: (string|null)
		}
		class LinkPreviewMetadata implements ILinkPreviewMetadata {
			constructor(p?: waproto.Message.ILinkPreviewMetadata)
			public paymentLinkMetadata?: (waproto.Message.IPaymentLinkMetadata|null)
			public urlMetadata?: (waproto.Message.IURLMetadata|null)
			public fbExperimentId?: (number|null)
			public linkMediaDuration?: (number|null)
			public socialMediaPostType?: (waproto.Message.LinkPreviewMetadata.SocialMediaPostType|null)
			public linkInlineVideoMuted?: (boolean|null)
			public videoContentUrl?: (string|null)
			public musicMetadata?: (waproto.IEmbeddedMusic|null)
			public videoContentCaption?: (string|null)
			public static encode(m: waproto.Message.ILinkPreviewMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.LinkPreviewMetadata
		}
		namespace LinkPreviewMetadata {
			enum SocialMediaPostType {
				NONE = 0,
				REEL = 1,
				LIVE_VIDEO = 2,
				LONG_VIDEO = 3,
				SINGLE_IMAGE = 4,
				CAROUSEL = 5
			}
		}
		interface IListMessage {
			title?: (string|null)
			description?: (string|null)
			buttonText?: (string|null)
			listType?: (waproto.Message.ListMessage.ListType|null)
			sections?: (waproto.Message.ListMessage.ISection[]|null)
			productListInfo?: (waproto.Message.ListMessage.IProductListInfo|null)
			footerText?: (string|null)
			contextInfo?: (waproto.IContextInfo|null)
		}
		class ListMessage implements IListMessage {
			constructor(p?: waproto.Message.IListMessage)
			public title?: (string|null)
			public description?: (string|null)
			public buttonText?: (string|null)
			public listType?: (waproto.Message.ListMessage.ListType|null)
			public sections: waproto.Message.ListMessage.ISection[]
			public productListInfo?: (waproto.Message.ListMessage.IProductListInfo|null)
			public footerText?: (string|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public static encode(m: waproto.Message.IListMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage
		}
		namespace ListMessage {
			enum ListType {
				UNKNOWN = 0,
				SINGLE_SELECT = 1,
				PRODUCT_LIST = 2
			}
			interface IProduct {
				productId?: (string|null)
			}
			class Product implements IProduct {
				constructor(p?: waproto.Message.ListMessage.IProduct)
				public productId?: (string|null)
				public static encode(m: waproto.Message.ListMessage.IProduct, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage.Product
			}
			interface IProductListHeaderImage {
				productId?: (string|null)
				jpegThumbnail?: (Uint8Array|null)
			}
			class ProductListHeaderImage implements IProductListHeaderImage {
				constructor(p?: waproto.Message.ListMessage.IProductListHeaderImage)
				public productId?: (string|null)
				public jpegThumbnail?: (Uint8Array|null)
				public static encode(m: waproto.Message.ListMessage.IProductListHeaderImage, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage.ProductListHeaderImage
			}
			interface IProductListInfo {
				productSections?: (waproto.Message.ListMessage.IProductSection[]|null)
				headerImage?: (waproto.Message.ListMessage.IProductListHeaderImage|null)
				businessOwnerJid?: (string|null)
			}
			class ProductListInfo implements IProductListInfo {
				constructor(p?: waproto.Message.ListMessage.IProductListInfo)
				public productSections: waproto.Message.ListMessage.IProductSection[]
				public headerImage?: (waproto.Message.ListMessage.IProductListHeaderImage|null)
				public businessOwnerJid?: (string|null)
				public static encode(m: waproto.Message.ListMessage.IProductListInfo, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage.ProductListInfo
			}
			interface IProductSection {
				title?: (string|null)
				products?: (waproto.Message.ListMessage.IProduct[]|null)
			}
			class ProductSection implements IProductSection {
				constructor(p?: waproto.Message.ListMessage.IProductSection)
				public title?: (string|null)
				public products: waproto.Message.ListMessage.IProduct[]
				public static encode(m: waproto.Message.ListMessage.IProductSection, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage.ProductSection
			}
			interface IRow {
				title?: (string|null)
				description?: (string|null)
				rowId?: (string|null)
			}
			class Row implements IRow {
				constructor(p?: waproto.Message.ListMessage.IRow)
				public title?: (string|null)
				public description?: (string|null)
				public rowId?: (string|null)
				public static encode(m: waproto.Message.ListMessage.IRow, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage.Row
			}
			interface ISection {
				title?: (string|null)
				rows?: (waproto.Message.ListMessage.IRow[]|null)
			}
			class Section implements ISection {
				constructor(p?: waproto.Message.ListMessage.ISection)
				public title?: (string|null)
				public rows: waproto.Message.ListMessage.IRow[]
				public static encode(m: waproto.Message.ListMessage.ISection, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListMessage.Section
			}
		}
		interface IListResponseMessage {
			title?: (string|null)
			listType?: (waproto.Message.ListResponseMessage.ListType|null)
			singleSelectReply?: (waproto.Message.ListResponseMessage.ISingleSelectReply|null)
			contextInfo?: (waproto.IContextInfo|null)
			description?: (string|null)
		}
		class ListResponseMessage implements IListResponseMessage {
			constructor(p?: waproto.Message.IListResponseMessage)
			public title?: (string|null)
			public listType?: (waproto.Message.ListResponseMessage.ListType|null)
			public singleSelectReply?: (waproto.Message.ListResponseMessage.ISingleSelectReply|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public description?: (string|null)
			public static encode(m: waproto.Message.IListResponseMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListResponseMessage
		}
		namespace ListResponseMessage {
			enum ListType {
				UNKNOWN = 0,
				SINGLE_SELECT = 1
			}
			interface ISingleSelectReply {
				selectedRowId?: (string|null)
			}
			class SingleSelectReply implements ISingleSelectReply {
				constructor(p?: waproto.Message.ListResponseMessage.ISingleSelectReply)
				public selectedRowId?: (string|null)
				public static encode(m: waproto.Message.ListResponseMessage.ISingleSelectReply, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ListResponseMessage.SingleSelectReply
			}
		}
		interface ILiveLocationMessage {
			degreesLatitude?: (number|null)
			degreesLongitude?: (number|null)
			accuracyInMeters?: (number|null)
			speedInMps?: (number|null)
			degreesClockwiseFromMagneticNorth?: (number|null)
			caption?: (string|null)
			sequenceNumber?: (number|Long|null)
			timeOffset?: (number|null)
			jpegThumbnail?: (Uint8Array|null)
			contextInfo?: (waproto.IContextInfo|null)
		}
		class LiveLocationMessage implements ILiveLocationMessage {
			constructor(p?: waproto.Message.ILiveLocationMessage)
			public degreesLatitude?: (number|null)
			public degreesLongitude?: (number|null)
			public accuracyInMeters?: (number|null)
			public speedInMps?: (number|null)
			public degreesClockwiseFromMagneticNorth?: (number|null)
			public caption?: (string|null)
			public sequenceNumber?: (number|Long|null)
			public timeOffset?: (number|null)
			public jpegThumbnail?: (Uint8Array|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public static encode(m: waproto.Message.ILiveLocationMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.LiveLocationMessage
		}
		interface ILocationMessage {
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
			contextInfo?: (waproto.IContextInfo|null)
		}
		class LocationMessage implements ILocationMessage {
			constructor(p?: waproto.Message.ILocationMessage)
			public degreesLatitude?: (number|null)
			public degreesLongitude?: (number|null)
			public name?: (string|null)
			public address?: (string|null)
			public url?: (string|null)
			public isLive?: (boolean|null)
			public accuracyInMeters?: (number|null)
			public speedInMps?: (number|null)
			public degreesClockwiseFromMagneticNorth?: (number|null)
			public comment?: (string|null)
			public jpegThumbnail?: (Uint8Array|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public static encode(m: waproto.Message.ILocationMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.LocationMessage
		}
		interface IMMSThumbnailMetadata {
			thumbnailDirectPath?: (string|null)
			thumbnailSha256?: (Uint8Array|null)
			thumbnailEncSha256?: (Uint8Array|null)
			mediaKey?: (Uint8Array|null)
			mediaKeyTimestamp?: (number|Long|null)
			thumbnailHeight?: (number|null)
			thumbnailWidth?: (number|null)
		}
		class MMSThumbnailMetadata implements IMMSThumbnailMetadata {
			constructor(p?: waproto.Message.IMMSThumbnailMetadata)
			public thumbnailDirectPath?: (string|null)
			public thumbnailSha256?: (Uint8Array|null)
			public thumbnailEncSha256?: (Uint8Array|null)
			public mediaKey?: (Uint8Array|null)
			public mediaKeyTimestamp?: (number|Long|null)
			public thumbnailHeight?: (number|null)
			public thumbnailWidth?: (number|null)
			public static encode(m: waproto.Message.IMMSThumbnailMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.MMSThumbnailMetadata
		}
		interface IMessageHistoryBundle {
			mimetype?: (string|null)
			fileSha256?: (Uint8Array|null)
			mediaKey?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			directPath?: (string|null)
			mediaKeyTimestamp?: (number|Long|null)
			contextInfo?: (waproto.IContextInfo|null)
			messageHistoryMetadata?: (waproto.Message.IMessageHistoryMetadata|null)
		}
		class MessageHistoryBundle implements IMessageHistoryBundle {
			constructor(p?: waproto.Message.IMessageHistoryBundle)
			public mimetype?: (string|null)
			public fileSha256?: (Uint8Array|null)
			public mediaKey?: (Uint8Array|null)
			public fileEncSha256?: (Uint8Array|null)
			public directPath?: (string|null)
			public mediaKeyTimestamp?: (number|Long|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public messageHistoryMetadata?: (waproto.Message.IMessageHistoryMetadata|null)
			public static encode(m: waproto.Message.IMessageHistoryBundle, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.MessageHistoryBundle
		}
		interface IMessageHistoryMetadata {
			historyReceivers?: (string[]|null)
			oldestMessageTimestamp?: (number|Long|null)
			messageCount?: (number|Long|null)
			nonHistoryReceivers?: (string[]|null)
		}
		class MessageHistoryMetadata implements IMessageHistoryMetadata {
			constructor(p?: waproto.Message.IMessageHistoryMetadata)
			public historyReceivers: string[]
			public oldestMessageTimestamp?: (number|Long|null)
			public messageCount?: (number|Long|null)
			public nonHistoryReceivers: string[]
			public static encode(m: waproto.Message.IMessageHistoryMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.MessageHistoryMetadata
		}
		interface IMessageHistoryNotice {
			contextInfo?: (waproto.IContextInfo|null)
			messageHistoryMetadata?: (waproto.Message.IMessageHistoryMetadata|null)
		}
		class MessageHistoryNotice implements IMessageHistoryNotice {
			constructor(p?: waproto.Message.IMessageHistoryNotice)
			public contextInfo?: (waproto.IContextInfo|null)
			public messageHistoryMetadata?: (waproto.Message.IMessageHistoryMetadata|null)
			public static encode(m: waproto.Message.IMessageHistoryNotice, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.MessageHistoryNotice
		}
		interface INewsletterAdminInviteMessage {
			newsletterJid?: (string|null)
			newsletterName?: (string|null)
			jpegThumbnail?: (Uint8Array|null)
			caption?: (string|null)
			inviteExpiration?: (number|Long|null)
			contextInfo?: (waproto.IContextInfo|null)
		}
		class NewsletterAdminInviteMessage implements INewsletterAdminInviteMessage {
			constructor(p?: waproto.Message.INewsletterAdminInviteMessage)
			public newsletterJid?: (string|null)
			public newsletterName?: (string|null)
			public jpegThumbnail?: (Uint8Array|null)
			public caption?: (string|null)
			public inviteExpiration?: (number|Long|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public static encode(m: waproto.Message.INewsletterAdminInviteMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.NewsletterAdminInviteMessage
		}
		interface INewsletterFollowerInviteMessage {
			newsletterJid?: (string|null)
			newsletterName?: (string|null)
			jpegThumbnail?: (Uint8Array|null)
			caption?: (string|null)
			contextInfo?: (waproto.IContextInfo|null)
		}
		class NewsletterFollowerInviteMessage implements INewsletterFollowerInviteMessage {
			constructor(p?: waproto.Message.INewsletterFollowerInviteMessage)
			public newsletterJid?: (string|null)
			public newsletterName?: (string|null)
			public jpegThumbnail?: (Uint8Array|null)
			public caption?: (string|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public static encode(m: waproto.Message.INewsletterFollowerInviteMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.NewsletterFollowerInviteMessage
		}
		interface IOrderMessage {
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
			contextInfo?: (waproto.IContextInfo|null)
			messageVersion?: (number|null)
			orderRequestMessageId?: (waproto.IMessageKey|null)
			catalogType?: (string|null)
		}
		class OrderMessage implements IOrderMessage {
			constructor(p?: waproto.Message.IOrderMessage)
			public orderId?: (string|null)
			public thumbnail?: (Uint8Array|null)
			public itemCount?: (number|null)
			public status?: (waproto.Message.OrderMessage.OrderStatus|null)
			public surface?: (waproto.Message.OrderMessage.OrderSurface|null)
			public message?: (string|null)
			public orderTitle?: (string|null)
			public sellerJid?: (string|null)
			public token?: (string|null)
			public totalAmount1000?: (number|Long|null)
			public totalCurrencyCode?: (string|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public messageVersion?: (number|null)
			public orderRequestMessageId?: (waproto.IMessageKey|null)
			public catalogType?: (string|null)
			public static encode(m: waproto.Message.IOrderMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.OrderMessage
		}
		namespace OrderMessage {
			enum OrderStatus {
				INQUIRY = 1,
				ACCEPTED = 2,
				DECLINED = 3
			}
			enum OrderSurface {
				CATALOG = 1
			}
		}
		interface IPaymentExtendedMetadata {
			type?: (number|null)
			platform?: (string|null)
		}
		class PaymentExtendedMetadata implements IPaymentExtendedMetadata {
			constructor(p?: waproto.Message.IPaymentExtendedMetadata)
			public type?: (number|null)
			public platform?: (string|null)
			public static encode(m: waproto.Message.IPaymentExtendedMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentExtendedMetadata
		}
		interface IPaymentInviteMessage {
			serviceType?: (waproto.Message.PaymentInviteMessage.ServiceType|null)
			expiryTimestamp?: (number|Long|null)
			incentiveEligible?: (boolean|null)
			referralId?: (string|null)
		}
		class PaymentInviteMessage implements IPaymentInviteMessage {
			constructor(p?: waproto.Message.IPaymentInviteMessage)
			public serviceType?: (waproto.Message.PaymentInviteMessage.ServiceType|null)
			public expiryTimestamp?: (number|Long|null)
			public incentiveEligible?: (boolean|null)
			public referralId?: (string|null)
			public static encode(m: waproto.Message.IPaymentInviteMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentInviteMessage
		}
		namespace PaymentInviteMessage {
			enum ServiceType {
				UNKNOWN = 0,
				FBPAY = 1,
				NOVI = 2,
				UPI = 3
			}
		}
		interface IPaymentLinkMetadata {
			button?: (waproto.Message.PaymentLinkMetadata.IPaymentLinkButton|null)
			header?: (waproto.Message.PaymentLinkMetadata.IPaymentLinkHeader|null)
			provider?: (waproto.Message.PaymentLinkMetadata.IPaymentLinkProvider|null)
		}
		class PaymentLinkMetadata implements IPaymentLinkMetadata {
			constructor(p?: waproto.Message.IPaymentLinkMetadata)
			public button?: (waproto.Message.PaymentLinkMetadata.IPaymentLinkButton|null)
			public header?: (waproto.Message.PaymentLinkMetadata.IPaymentLinkHeader|null)
			public provider?: (waproto.Message.PaymentLinkMetadata.IPaymentLinkProvider|null)
			public static encode(m: waproto.Message.IPaymentLinkMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentLinkMetadata
		}
		namespace PaymentLinkMetadata {
			interface IPaymentLinkButton {
				displayText?: (string|null)
			}
			class PaymentLinkButton implements IPaymentLinkButton {
				constructor(p?: waproto.Message.PaymentLinkMetadata.IPaymentLinkButton)
				public displayText?: (string|null)
				public static encode(m: waproto.Message.PaymentLinkMetadata.IPaymentLinkButton, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentLinkMetadata.PaymentLinkButton
			}
			interface IPaymentLinkHeader {
				headerType?: (waproto.Message.PaymentLinkMetadata.PaymentLinkHeader.PaymentLinkHeaderType|null)
			}
			class PaymentLinkHeader implements IPaymentLinkHeader {
				constructor(p?: waproto.Message.PaymentLinkMetadata.IPaymentLinkHeader)
				public headerType?: (waproto.Message.PaymentLinkMetadata.PaymentLinkHeader.PaymentLinkHeaderType|null)
				public static encode(m: waproto.Message.PaymentLinkMetadata.IPaymentLinkHeader, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentLinkMetadata.PaymentLinkHeader
			}
			namespace PaymentLinkHeader {
				enum PaymentLinkHeaderType {
					LINK_PREVIEW = 0,
					ORDER = 1
				}
			}
			interface IPaymentLinkProvider {
				paramsJson?: (string|null)
			}
			class PaymentLinkProvider implements IPaymentLinkProvider {
				constructor(p?: waproto.Message.PaymentLinkMetadata.IPaymentLinkProvider)
				public paramsJson?: (string|null)
				public static encode(m: waproto.Message.PaymentLinkMetadata.IPaymentLinkProvider, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PaymentLinkMetadata.PaymentLinkProvider
			}
		}
		interface IPeerDataOperationRequestMessage {
			peerDataOperationRequestType?: (waproto.Message.PeerDataOperationRequestType|null)
			requestStickerReupload?: (waproto.Message.PeerDataOperationRequestMessage.IRequestStickerReupload[]|null)
			requestUrlPreview?: (waproto.Message.PeerDataOperationRequestMessage.IRequestUrlPreview[]|null)
			historySyncOnDemandRequest?: (waproto.Message.PeerDataOperationRequestMessage.IHistorySyncOnDemandRequest|null)
			placeholderMessageResendRequest?: (waproto.Message.PeerDataOperationRequestMessage.IPlaceholderMessageResendRequest[]|null)
			fullHistorySyncOnDemandRequest?: (waproto.Message.PeerDataOperationRequestMessage.IFullHistorySyncOnDemandRequest|null)
			syncdCollectionFatalRecoveryRequest?: (waproto.Message.PeerDataOperationRequestMessage.ISyncDCollectionFatalRecoveryRequest|null)
			historySyncChunkRetryRequest?: (waproto.Message.PeerDataOperationRequestMessage.IHistorySyncChunkRetryRequest|null)
			galaxyFlowAction?: (waproto.Message.PeerDataOperationRequestMessage.IGalaxyFlowAction|null)
			companionCanonicalUserNonceFetchRequest?: (waproto.Message.PeerDataOperationRequestMessage.ICompanionCanonicalUserNonceFetchRequest|null)
			bizBroadcastInsightsContactListRequest?: (waproto.Message.PeerDataOperationRequestMessage.IBizBroadcastInsightsContactListRequest|null)
			bizBroadcastInsightsRefreshRequest?: (waproto.Message.PeerDataOperationRequestMessage.IBizBroadcastInsightsRefreshRequest|null)
		}
		class PeerDataOperationRequestMessage implements IPeerDataOperationRequestMessage {
			constructor(p?: waproto.Message.IPeerDataOperationRequestMessage)
			public peerDataOperationRequestType?: (waproto.Message.PeerDataOperationRequestType|null)
			public requestStickerReupload: waproto.Message.PeerDataOperationRequestMessage.IRequestStickerReupload[]
			public requestUrlPreview: waproto.Message.PeerDataOperationRequestMessage.IRequestUrlPreview[]
			public historySyncOnDemandRequest?: (waproto.Message.PeerDataOperationRequestMessage.IHistorySyncOnDemandRequest|null)
			public placeholderMessageResendRequest: waproto.Message.PeerDataOperationRequestMessage.IPlaceholderMessageResendRequest[]
			public fullHistorySyncOnDemandRequest?: (waproto.Message.PeerDataOperationRequestMessage.IFullHistorySyncOnDemandRequest|null)
			public syncdCollectionFatalRecoveryRequest?: (waproto.Message.PeerDataOperationRequestMessage.ISyncDCollectionFatalRecoveryRequest|null)
			public historySyncChunkRetryRequest?: (waproto.Message.PeerDataOperationRequestMessage.IHistorySyncChunkRetryRequest|null)
			public galaxyFlowAction?: (waproto.Message.PeerDataOperationRequestMessage.IGalaxyFlowAction|null)
			public companionCanonicalUserNonceFetchRequest?: (waproto.Message.PeerDataOperationRequestMessage.ICompanionCanonicalUserNonceFetchRequest|null)
			public bizBroadcastInsightsContactListRequest?: (waproto.Message.PeerDataOperationRequestMessage.IBizBroadcastInsightsContactListRequest|null)
			public bizBroadcastInsightsRefreshRequest?: (waproto.Message.PeerDataOperationRequestMessage.IBizBroadcastInsightsRefreshRequest|null)
			public static encode(m: waproto.Message.IPeerDataOperationRequestMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage
		}
		namespace PeerDataOperationRequestMessage {
			interface IBizBroadcastInsightsContactListRequest {
				campaignId?: (string|null)
			}
			class BizBroadcastInsightsContactListRequest implements IBizBroadcastInsightsContactListRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.IBizBroadcastInsightsContactListRequest)
				public campaignId?: (string|null)
				public static encode(m: waproto.Message.PeerDataOperationRequestMessage.IBizBroadcastInsightsContactListRequest, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsContactListRequest
			}
			interface IBizBroadcastInsightsRefreshRequest {
				campaignId?: (string|null)
			}
			class BizBroadcastInsightsRefreshRequest implements IBizBroadcastInsightsRefreshRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.IBizBroadcastInsightsRefreshRequest)
				public campaignId?: (string|null)
				public static encode(m: waproto.Message.PeerDataOperationRequestMessage.IBizBroadcastInsightsRefreshRequest, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.BizBroadcastInsightsRefreshRequest
			}
			interface ICompanionCanonicalUserNonceFetchRequest {
				registrationTraceId?: (string|null)
			}
			class CompanionCanonicalUserNonceFetchRequest implements ICompanionCanonicalUserNonceFetchRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.ICompanionCanonicalUserNonceFetchRequest)
				public registrationTraceId?: (string|null)
				public static encode(m: waproto.Message.PeerDataOperationRequestMessage.ICompanionCanonicalUserNonceFetchRequest, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.CompanionCanonicalUserNonceFetchRequest
			}
			interface IFullHistorySyncOnDemandRequest {
				requestMetadata?: (waproto.Message.IFullHistorySyncOnDemandRequestMetadata|null)
				historySyncConfig?: (waproto.DeviceProps.IHistorySyncConfig|null)
				fullHistorySyncOnDemandConfig?: (waproto.Message.IFullHistorySyncOnDemandConfig|null)
			}
			class FullHistorySyncOnDemandRequest implements IFullHistorySyncOnDemandRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.IFullHistorySyncOnDemandRequest)
				public requestMetadata?: (waproto.Message.IFullHistorySyncOnDemandRequestMetadata|null)
				public historySyncConfig?: (waproto.DeviceProps.IHistorySyncConfig|null)
				public fullHistorySyncOnDemandConfig?: (waproto.Message.IFullHistorySyncOnDemandConfig|null)
				public static encode(m: waproto.Message.PeerDataOperationRequestMessage.IFullHistorySyncOnDemandRequest, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.FullHistorySyncOnDemandRequest
			}
			interface IGalaxyFlowAction {
				type?: (waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction.GalaxyFlowActionType|null)
				flowId?: (string|null)
				stanzaId?: (string|null)
				galaxyFlowDownloadRequestId?: (string|null)
				agmId?: (string|null)
			}
			class GalaxyFlowAction implements IGalaxyFlowAction {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.IGalaxyFlowAction)
				public type?: (waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction.GalaxyFlowActionType|null)
				public flowId?: (string|null)
				public stanzaId?: (string|null)
				public galaxyFlowDownloadRequestId?: (string|null)
				public agmId?: (string|null)
				public static encode(m: waproto.Message.PeerDataOperationRequestMessage.IGalaxyFlowAction, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.GalaxyFlowAction
			}
			namespace GalaxyFlowAction {
				enum GalaxyFlowActionType {
					NOTIFY_LAUNCH = 1,
					DOWNLOAD_RESPONSES = 2
				}
			}
			interface IHistorySyncChunkRetryRequest {
				syncType?: (waproto.Message.HistorySyncType|null)
				chunkOrder?: (number|null)
				chunkNotificationId?: (string|null)
				regenerateChunk?: (boolean|null)
			}
			class HistorySyncChunkRetryRequest implements IHistorySyncChunkRetryRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.IHistorySyncChunkRetryRequest)
				public syncType?: (waproto.Message.HistorySyncType|null)
				public chunkOrder?: (number|null)
				public chunkNotificationId?: (string|null)
				public regenerateChunk?: (boolean|null)
				public static encode(m: waproto.Message.PeerDataOperationRequestMessage.IHistorySyncChunkRetryRequest, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.HistorySyncChunkRetryRequest
			}
			interface IHistorySyncOnDemandRequest {
				chatJid?: (string|null)
				oldestMsgId?: (string|null)
				oldestMsgFromMe?: (boolean|null)
				onDemandMsgCount?: (number|null)
				oldestMsgTimestampMs?: (number|Long|null)
				accountLid?: (string|null)
			}
			class HistorySyncOnDemandRequest implements IHistorySyncOnDemandRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.IHistorySyncOnDemandRequest)
				public chatJid?: (string|null)
				public oldestMsgId?: (string|null)
				public oldestMsgFromMe?: (boolean|null)
				public onDemandMsgCount?: (number|null)
				public oldestMsgTimestampMs?: (number|Long|null)
				public accountLid?: (string|null)
				public static encode(m: waproto.Message.PeerDataOperationRequestMessage.IHistorySyncOnDemandRequest, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.HistorySyncOnDemandRequest
			}
			interface IPlaceholderMessageResendRequest {
				messageKey?: (waproto.IMessageKey|null)
			}
			class PlaceholderMessageResendRequest implements IPlaceholderMessageResendRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.IPlaceholderMessageResendRequest)
				public messageKey?: (waproto.IMessageKey|null)
				public static encode(m: waproto.Message.PeerDataOperationRequestMessage.IPlaceholderMessageResendRequest, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.PlaceholderMessageResendRequest
			}
			interface IRequestStickerReupload {
				fileSha256?: (string|null)
			}
			class RequestStickerReupload implements IRequestStickerReupload {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.IRequestStickerReupload)
				public fileSha256?: (string|null)
				public static encode(m: waproto.Message.PeerDataOperationRequestMessage.IRequestStickerReupload, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.RequestStickerReupload
			}
			interface IRequestUrlPreview {
				url?: (string|null)
				includeHqThumbnail?: (boolean|null)
			}
			class RequestUrlPreview implements IRequestUrlPreview {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.IRequestUrlPreview)
				public url?: (string|null)
				public includeHqThumbnail?: (boolean|null)
				public static encode(m: waproto.Message.PeerDataOperationRequestMessage.IRequestUrlPreview, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.RequestUrlPreview
			}
			interface ISyncDCollectionFatalRecoveryRequest {
				collectionName?: (string|null)
				timestamp?: (number|Long|null)
			}
			class SyncDCollectionFatalRecoveryRequest implements ISyncDCollectionFatalRecoveryRequest {
				constructor(p?: waproto.Message.PeerDataOperationRequestMessage.ISyncDCollectionFatalRecoveryRequest)
				public collectionName?: (string|null)
				public timestamp?: (number|Long|null)
				public static encode(m: waproto.Message.PeerDataOperationRequestMessage.ISyncDCollectionFatalRecoveryRequest, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestMessage.SyncDCollectionFatalRecoveryRequest
			}
		}
		interface IPeerDataOperationRequestResponseMessage {
			peerDataOperationRequestType?: (waproto.Message.PeerDataOperationRequestType|null)
			stanzaId?: (string|null)
			peerDataOperationResult?: (waproto.Message.PeerDataOperationRequestResponseMessage.IPeerDataOperationResult[]|null)
		}
		class PeerDataOperationRequestResponseMessage implements IPeerDataOperationRequestResponseMessage {
			constructor(p?: waproto.Message.IPeerDataOperationRequestResponseMessage)
			public peerDataOperationRequestType?: (waproto.Message.PeerDataOperationRequestType|null)
			public stanzaId?: (string|null)
			public peerDataOperationResult: waproto.Message.PeerDataOperationRequestResponseMessage.IPeerDataOperationResult[]
			public static encode(m: waproto.Message.IPeerDataOperationRequestResponseMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage
		}
		namespace PeerDataOperationRequestResponseMessage {
			interface IPeerDataOperationResult {
				mediaUploadResult?: (waproto.MediaRetryNotification.ResultType|null)
				stickerMessage?: (waproto.Message.IStickerMessage|null)
				linkPreviewResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ILinkPreviewResponse|null)
				placeholderMessageResendResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IPlaceholderMessageResendResponse|null)
				waffleNonceFetchRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IWaffleNonceFetchResponse|null)
				fullHistorySyncOnDemandRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IFullHistorySyncOnDemandRequestResponse|null)
				companionMetaNonceFetchRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ICompanionMetaNonceFetchResponse|null)
				syncdSnapshotFatalRecoveryResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ISyncDSnapshotFatalRecoveryResponse|null)
				companionCanonicalUserNonceFetchRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ICompanionCanonicalUserNonceFetchResponse|null)
				historySyncChunkRetryResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IHistorySyncChunkRetryResponse|null)
				flowResponsesCsvBundle?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IFlowResponsesCsvBundle|null)
				bizBroadcastInsightsContactListResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IBizBroadcastInsightsContactListResponse|null)
			}
			class PeerDataOperationResult implements IPeerDataOperationResult {
				constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.IPeerDataOperationResult)
				public mediaUploadResult?: (waproto.MediaRetryNotification.ResultType|null)
				public stickerMessage?: (waproto.Message.IStickerMessage|null)
				public linkPreviewResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ILinkPreviewResponse|null)
				public placeholderMessageResendResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IPlaceholderMessageResendResponse|null)
				public waffleNonceFetchRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IWaffleNonceFetchResponse|null)
				public fullHistorySyncOnDemandRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IFullHistorySyncOnDemandRequestResponse|null)
				public companionMetaNonceFetchRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ICompanionMetaNonceFetchResponse|null)
				public syncdSnapshotFatalRecoveryResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ISyncDSnapshotFatalRecoveryResponse|null)
				public companionCanonicalUserNonceFetchRequestResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ICompanionCanonicalUserNonceFetchResponse|null)
				public historySyncChunkRetryResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IHistorySyncChunkRetryResponse|null)
				public flowResponsesCsvBundle?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IFlowResponsesCsvBundle|null)
				public bizBroadcastInsightsContactListResponse?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IBizBroadcastInsightsContactListResponse|null)
				public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.IPeerDataOperationResult, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult
			}
			namespace PeerDataOperationResult {
				interface IBizBroadcastInsightsContactListResponse {
					campaignId?: (string|null)
					timestampMs?: (number|Long|null)
					contacts?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IBizBroadcastInsightsContactState[]|null)
				}
				class BizBroadcastInsightsContactListResponse implements IBizBroadcastInsightsContactListResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IBizBroadcastInsightsContactListResponse)
					public campaignId?: (string|null)
					public timestampMs?: (number|Long|null)
					public contacts: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IBizBroadcastInsightsContactState[]
					public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IBizBroadcastInsightsContactListResponse, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactListResponse
				}
				interface IBizBroadcastInsightsContactState {
					contactJid?: (string|null)
					state?: (waproto.Message.InsightDeliveryState|null)
				}
				class BizBroadcastInsightsContactState implements IBizBroadcastInsightsContactState {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IBizBroadcastInsightsContactState)
					public contactJid?: (string|null)
					public state?: (waproto.Message.InsightDeliveryState|null)
					public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IBizBroadcastInsightsContactState, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.BizBroadcastInsightsContactState
				}
				interface ICompanionCanonicalUserNonceFetchResponse {
					nonce?: (string|null)
					waFbid?: (string|null)
					forceRefresh?: (boolean|null)
				}
				class CompanionCanonicalUserNonceFetchResponse implements ICompanionCanonicalUserNonceFetchResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ICompanionCanonicalUserNonceFetchResponse)
					public nonce?: (string|null)
					public waFbid?: (string|null)
					public forceRefresh?: (boolean|null)
					public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ICompanionCanonicalUserNonceFetchResponse, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionCanonicalUserNonceFetchResponse
				}
				interface ICompanionMetaNonceFetchResponse {
					nonce?: (string|null)
				}
				class CompanionMetaNonceFetchResponse implements ICompanionMetaNonceFetchResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ICompanionMetaNonceFetchResponse)
					public nonce?: (string|null)
					public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ICompanionMetaNonceFetchResponse, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.CompanionMetaNonceFetchResponse
				}
				interface IFlowResponsesCsvBundle {
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
				}
				class FlowResponsesCsvBundle implements IFlowResponsesCsvBundle {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IFlowResponsesCsvBundle)
					public flowId?: (string|null)
					public galaxyFlowDownloadRequestId?: (string|null)
					public fileName?: (string|null)
					public mimetype?: (string|null)
					public fileSha256?: (Uint8Array|null)
					public mediaKey?: (Uint8Array|null)
					public fileEncSha256?: (Uint8Array|null)
					public directPath?: (string|null)
					public mediaKeyTimestamp?: (number|Long|null)
					public fileLength?: (number|Long|null)
					public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IFlowResponsesCsvBundle, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FlowResponsesCsvBundle
				}
				interface IFullHistorySyncOnDemandRequestResponse {
					requestMetadata?: (waproto.Message.IFullHistorySyncOnDemandRequestMetadata|null)
					responseCode?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandResponseCode|null)
				}
				class FullHistorySyncOnDemandRequestResponse implements IFullHistorySyncOnDemandRequestResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IFullHistorySyncOnDemandRequestResponse)
					public requestMetadata?: (waproto.Message.IFullHistorySyncOnDemandRequestMetadata|null)
					public responseCode?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandResponseCode|null)
					public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IFullHistorySyncOnDemandRequestResponse, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.FullHistorySyncOnDemandRequestResponse
				}
				enum FullHistorySyncOnDemandResponseCode {
					REQUEST_SUCCESS = 0,
					REQUEST_TIME_EXPIRED = 1,
					DECLINED_SHARING_HISTORY = 2,
					GENERIC_ERROR = 3,
					ERROR_REQUEST_ON_NON_SMB_PRIMARY = 4,
					ERROR_HOSTED_DEVICE_NOT_CONNECTED = 5,
					ERROR_HOSTED_DEVICE_LOGIN_TIME_NOT_SET = 6
				}
				interface IHistorySyncChunkRetryResponse {
					syncType?: (waproto.Message.HistorySyncType|null)
					chunkOrder?: (number|null)
					requestId?: (string|null)
					responseCode?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponseCode|null)
					canRecover?: (boolean|null)
				}
				class HistorySyncChunkRetryResponse implements IHistorySyncChunkRetryResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IHistorySyncChunkRetryResponse)
					public syncType?: (waproto.Message.HistorySyncType|null)
					public chunkOrder?: (number|null)
					public requestId?: (string|null)
					public responseCode?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponseCode|null)
					public canRecover?: (boolean|null)
					public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IHistorySyncChunkRetryResponse, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.HistorySyncChunkRetryResponse
				}
				enum HistorySyncChunkRetryResponseCode {
					GENERATION_ERROR = 1,
					CHUNK_CONSUMED = 2,
					TIMEOUT = 3,
					SESSION_EXHAUSTED = 4,
					CHUNK_EXHAUSTED = 5,
					DUPLICATED_REQUEST = 6
				}
				interface ILinkPreviewResponse {
					url?: (string|null)
					title?: (string|null)
					description?: (string|null)
					thumbData?: (Uint8Array|null)
					matchText?: (string|null)
					previewType?: (string|null)
					hqThumbnail?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.ILinkPreviewHighQualityThumbnail|null)
					previewMetadata?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.IPaymentLinkPreviewMetadata|null)
				}
				class LinkPreviewResponse implements ILinkPreviewResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ILinkPreviewResponse)
					public url?: (string|null)
					public title?: (string|null)
					public description?: (string|null)
					public thumbData?: (Uint8Array|null)
					public matchText?: (string|null)
					public previewType?: (string|null)
					public hqThumbnail?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.ILinkPreviewHighQualityThumbnail|null)
					public previewMetadata?: (waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.IPaymentLinkPreviewMetadata|null)
					public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ILinkPreviewResponse, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse
				}
				namespace LinkPreviewResponse {
					interface ILinkPreviewHighQualityThumbnail {
						directPath?: (string|null)
						thumbHash?: (string|null)
						encThumbHash?: (string|null)
						mediaKey?: (Uint8Array|null)
						mediaKeyTimestampMs?: (number|Long|null)
						thumbWidth?: (number|null)
						thumbHeight?: (number|null)
					}
					class LinkPreviewHighQualityThumbnail implements ILinkPreviewHighQualityThumbnail {
						constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.ILinkPreviewHighQualityThumbnail)
						public directPath?: (string|null)
						public thumbHash?: (string|null)
						public encThumbHash?: (string|null)
						public mediaKey?: (Uint8Array|null)
						public mediaKeyTimestampMs?: (number|Long|null)
						public thumbWidth?: (number|null)
						public thumbHeight?: (number|null)
						public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.ILinkPreviewHighQualityThumbnail, w?: PbWriter): PbWriter
						public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.LinkPreviewHighQualityThumbnail
					}
					interface IPaymentLinkPreviewMetadata {
						isBusinessVerified?: (boolean|null)
						providerName?: (string|null)
						amount?: (string|null)
						offset?: (string|null)
						currency?: (string|null)
					}
					class PaymentLinkPreviewMetadata implements IPaymentLinkPreviewMetadata {
						constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.IPaymentLinkPreviewMetadata)
						public isBusinessVerified?: (boolean|null)
						public providerName?: (string|null)
						public amount?: (string|null)
						public offset?: (string|null)
						public currency?: (string|null)
						public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.IPaymentLinkPreviewMetadata, w?: PbWriter): PbWriter
						public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.LinkPreviewResponse.PaymentLinkPreviewMetadata
					}
				}
				interface IPlaceholderMessageResendResponse {
					webMessageInfoBytes?: (Uint8Array|null)
				}
				class PlaceholderMessageResendResponse implements IPlaceholderMessageResendResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IPlaceholderMessageResendResponse)
					public webMessageInfoBytes?: (Uint8Array|null)
					public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IPlaceholderMessageResendResponse, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.PlaceholderMessageResendResponse
				}
				interface ISyncDSnapshotFatalRecoveryResponse {
					collectionSnapshot?: (Uint8Array|null)
					isCompressed?: (boolean|null)
				}
				class SyncDSnapshotFatalRecoveryResponse implements ISyncDSnapshotFatalRecoveryResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ISyncDSnapshotFatalRecoveryResponse)
					public collectionSnapshot?: (Uint8Array|null)
					public isCompressed?: (boolean|null)
					public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.ISyncDSnapshotFatalRecoveryResponse, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.SyncDSnapshotFatalRecoveryResponse
				}
				interface IWaffleNonceFetchResponse {
					nonce?: (string|null)
					waEntFbid?: (string|null)
				}
				class WaffleNonceFetchResponse implements IWaffleNonceFetchResponse {
					constructor(p?: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IWaffleNonceFetchResponse)
					public nonce?: (string|null)
					public waEntFbid?: (string|null)
					public static encode(m: waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.IWaffleNonceFetchResponse, w?: PbWriter): PbWriter
					public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PeerDataOperationRequestResponseMessage.PeerDataOperationResult.WaffleNonceFetchResponse
				}
			}
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
		interface IPinInChatMessage {
			key?: (waproto.IMessageKey|null)
			type?: (waproto.Message.PinInChatMessage.Type|null)
			senderTimestampMs?: (number|Long|null)
		}
		class PinInChatMessage implements IPinInChatMessage {
			constructor(p?: waproto.Message.IPinInChatMessage)
			public key?: (waproto.IMessageKey|null)
			public type?: (waproto.Message.PinInChatMessage.Type|null)
			public senderTimestampMs?: (number|Long|null)
			public static encode(m: waproto.Message.IPinInChatMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PinInChatMessage
		}
		namespace PinInChatMessage {
			enum Type {
				UNKNOWN_TYPE = 0,
				PIN_FOR_ALL = 1,
				UNPIN_FOR_ALL = 2
			}
		}
		interface IPlaceholderMessage {
			type?: (waproto.Message.PlaceholderMessage.PlaceholderType|null)
		}
		class PlaceholderMessage implements IPlaceholderMessage {
			constructor(p?: waproto.Message.IPlaceholderMessage)
			public type?: (waproto.Message.PlaceholderMessage.PlaceholderType|null)
			public static encode(m: waproto.Message.IPlaceholderMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PlaceholderMessage
		}
		namespace PlaceholderMessage {
			enum PlaceholderType {
				MASK_LINKED_DEVICES = 0
			}
		}
		interface IPollAddOptionMessage {
			pollCreationMessageKey?: (waproto.IMessageKey|null)
			addOption?: (waproto.Message.PollCreationMessage.IOption|null)
		}
		class PollAddOptionMessage implements IPollAddOptionMessage {
			constructor(p?: waproto.Message.IPollAddOptionMessage)
			public pollCreationMessageKey?: (waproto.IMessageKey|null)
			public addOption?: (waproto.Message.PollCreationMessage.IOption|null)
			public static encode(m: waproto.Message.IPollAddOptionMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollAddOptionMessage
		}
		enum PollContentType {
			UNKNOWN = 0,
			TEXT = 1,
			IMAGE = 2
		}
		interface IPollCreationMessage {
			encKey?: (Uint8Array|null)
			name?: (string|null)
			options?: (waproto.Message.PollCreationMessage.IOption[]|null)
			selectableOptionsCount?: (number|null)
			contextInfo?: (waproto.IContextInfo|null)
			pollContentType?: (waproto.Message.PollContentType|null)
			pollType?: (waproto.Message.PollType|null)
			correctAnswer?: (waproto.Message.PollCreationMessage.IOption|null)
			endTime?: (number|Long|null)
			hideParticipantName?: (boolean|null)
			allowAddOption?: (boolean|null)
		}
		class PollCreationMessage implements IPollCreationMessage {
			constructor(p?: waproto.Message.IPollCreationMessage)
			public encKey?: (Uint8Array|null)
			public name?: (string|null)
			public options: waproto.Message.PollCreationMessage.IOption[]
			public selectableOptionsCount?: (number|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public pollContentType?: (waproto.Message.PollContentType|null)
			public pollType?: (waproto.Message.PollType|null)
			public correctAnswer?: (waproto.Message.PollCreationMessage.IOption|null)
			public endTime?: (number|Long|null)
			public hideParticipantName?: (boolean|null)
			public allowAddOption?: (boolean|null)
			public static encode(m: waproto.Message.IPollCreationMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollCreationMessage
		}
		namespace PollCreationMessage {
			interface IOption {
				optionName?: (string|null)
				optionHash?: (string|null)
			}
			class Option implements IOption {
				constructor(p?: waproto.Message.PollCreationMessage.IOption)
				public optionName?: (string|null)
				public optionHash?: (string|null)
				public static encode(m: waproto.Message.PollCreationMessage.IOption, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollCreationMessage.Option
			}
		}
		interface IPollEncValue {
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
		}
		class PollEncValue implements IPollEncValue {
			constructor(p?: waproto.Message.IPollEncValue)
			public encPayload?: (Uint8Array|null)
			public encIv?: (Uint8Array|null)
			public static encode(m: waproto.Message.IPollEncValue, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollEncValue
		}
		interface IPollResultSnapshotMessage {
			name?: (string|null)
			pollVotes?: (waproto.Message.PollResultSnapshotMessage.IPollVote[]|null)
			contextInfo?: (waproto.IContextInfo|null)
			pollType?: (waproto.Message.PollType|null)
		}
		class PollResultSnapshotMessage implements IPollResultSnapshotMessage {
			constructor(p?: waproto.Message.IPollResultSnapshotMessage)
			public name?: (string|null)
			public pollVotes: waproto.Message.PollResultSnapshotMessage.IPollVote[]
			public contextInfo?: (waproto.IContextInfo|null)
			public pollType?: (waproto.Message.PollType|null)
			public static encode(m: waproto.Message.IPollResultSnapshotMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollResultSnapshotMessage
		}
		namespace PollResultSnapshotMessage {
			interface IPollVote {
				optionName?: (string|null)
				optionVoteCount?: (number|Long|null)
			}
			class PollVote implements IPollVote {
				constructor(p?: waproto.Message.PollResultSnapshotMessage.IPollVote)
				public optionName?: (string|null)
				public optionVoteCount?: (number|Long|null)
				public static encode(m: waproto.Message.PollResultSnapshotMessage.IPollVote, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollResultSnapshotMessage.PollVote
			}
		}
		enum PollType {
			POLL = 0,
			QUIZ = 1
		}
		interface IPollUpdateMessage {
			pollCreationMessageKey?: (waproto.IMessageKey|null)
			vote?: (waproto.Message.IPollEncValue|null)
			metadata?: (waproto.Message.IPollUpdateMessageMetadata|null)
			senderTimestampMs?: (number|Long|null)
		}
		class PollUpdateMessage implements IPollUpdateMessage {
			constructor(p?: waproto.Message.IPollUpdateMessage)
			public pollCreationMessageKey?: (waproto.IMessageKey|null)
			public vote?: (waproto.Message.IPollEncValue|null)
			public metadata?: (waproto.Message.IPollUpdateMessageMetadata|null)
			public senderTimestampMs?: (number|Long|null)
			public static encode(m: waproto.Message.IPollUpdateMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollUpdateMessage
		}
		interface IPollUpdateMessageMetadata {
		}
		class PollUpdateMessageMetadata implements IPollUpdateMessageMetadata {
			constructor(p?: waproto.Message.IPollUpdateMessageMetadata)
			public static encode(m: waproto.Message.IPollUpdateMessageMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollUpdateMessageMetadata
		}
		interface IPollVoteMessage {
			selectedOptions?: (Uint8Array[]|null)
		}
		class PollVoteMessage implements IPollVoteMessage {
			constructor(p?: waproto.Message.IPollVoteMessage)
			public selectedOptions: Uint8Array[]
			public static encode(m: waproto.Message.IPollVoteMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.PollVoteMessage
		}
		interface IProductMessage {
			product?: (waproto.Message.ProductMessage.IProductSnapshot|null)
			businessOwnerJid?: (string|null)
			catalog?: (waproto.Message.ProductMessage.ICatalogSnapshot|null)
			body?: (string|null)
			footer?: (string|null)
			contextInfo?: (waproto.IContextInfo|null)
		}
		class ProductMessage implements IProductMessage {
			constructor(p?: waproto.Message.IProductMessage)
			public product?: (waproto.Message.ProductMessage.IProductSnapshot|null)
			public businessOwnerJid?: (string|null)
			public catalog?: (waproto.Message.ProductMessage.ICatalogSnapshot|null)
			public body?: (string|null)
			public footer?: (string|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public static encode(m: waproto.Message.IProductMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ProductMessage
		}
		namespace ProductMessage {
			interface ICatalogSnapshot {
				catalogImage?: (waproto.Message.IImageMessage|null)
				title?: (string|null)
				description?: (string|null)
			}
			class CatalogSnapshot implements ICatalogSnapshot {
				constructor(p?: waproto.Message.ProductMessage.ICatalogSnapshot)
				public catalogImage?: (waproto.Message.IImageMessage|null)
				public title?: (string|null)
				public description?: (string|null)
				public static encode(m: waproto.Message.ProductMessage.ICatalogSnapshot, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ProductMessage.CatalogSnapshot
			}
			interface IProductSnapshot {
				productImage?: (waproto.Message.IImageMessage|null)
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
			}
			class ProductSnapshot implements IProductSnapshot {
				constructor(p?: waproto.Message.ProductMessage.IProductSnapshot)
				public productImage?: (waproto.Message.IImageMessage|null)
				public productId?: (string|null)
				public title?: (string|null)
				public description?: (string|null)
				public currencyCode?: (string|null)
				public priceAmount1000?: (number|Long|null)
				public retailerId?: (string|null)
				public url?: (string|null)
				public productImageCount?: (number|null)
				public firstImageId?: (string|null)
				public salePriceAmount1000?: (number|Long|null)
				public signedUrl?: (string|null)
				public static encode(m: waproto.Message.ProductMessage.IProductSnapshot, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ProductMessage.ProductSnapshot
			}
		}
		interface IProtocolMessage {
			key?: (waproto.IMessageKey|null)
			type?: (waproto.Message.ProtocolMessage.Type|null)
			ephemeralExpiration?: (number|null)
			ephemeralSettingTimestamp?: (number|Long|null)
			historySyncNotification?: (waproto.Message.IHistorySyncNotification|null)
			appStateSyncKeyShare?: (waproto.Message.IAppStateSyncKeyShare|null)
			appStateSyncKeyRequest?: (waproto.Message.IAppStateSyncKeyRequest|null)
			initialSecurityNotificationSettingSync?: (waproto.Message.IInitialSecurityNotificationSettingSync|null)
			appStateFatalExceptionNotification?: (waproto.Message.IAppStateFatalExceptionNotification|null)
			disappearingMode?: (waproto.IDisappearingMode|null)
			editedMessage?: (waproto.IMessage|null)
			timestampMs?: (number|Long|null)
			peerDataOperationRequestMessage?: (waproto.Message.IPeerDataOperationRequestMessage|null)
			peerDataOperationRequestResponseMessage?: (waproto.Message.IPeerDataOperationRequestResponseMessage|null)
			botFeedbackMessage?: (waproto.IBotFeedbackMessage|null)
			invokerJid?: (string|null)
			requestWelcomeMessageMetadata?: (waproto.Message.IRequestWelcomeMessageMetadata|null)
			mediaNotifyMessage?: (waproto.IMediaNotifyMessage|null)
			cloudApiThreadControlNotification?: (waproto.Message.ICloudAPIThreadControlNotification|null)
			lidMigrationMappingSyncMessage?: (waproto.ILIDMigrationMappingSyncMessage|null)
			limitSharing?: (waproto.ILimitSharing|null)
			aiPsiMetadata?: (Uint8Array|null)
			aiQueryFanout?: (waproto.IAIQueryFanout|null)
			memberLabel?: (waproto.IMemberLabel|null)
			aiMediaCollectionMessage?: (waproto.IAIMediaCollectionMessage|null)
			afterReadDuration?: (number|null)
		}
		class ProtocolMessage implements IProtocolMessage {
			constructor(p?: waproto.Message.IProtocolMessage)
			public key?: (waproto.IMessageKey|null)
			public type?: (waproto.Message.ProtocolMessage.Type|null)
			public ephemeralExpiration?: (number|null)
			public ephemeralSettingTimestamp?: (number|Long|null)
			public historySyncNotification?: (waproto.Message.IHistorySyncNotification|null)
			public appStateSyncKeyShare?: (waproto.Message.IAppStateSyncKeyShare|null)
			public appStateSyncKeyRequest?: (waproto.Message.IAppStateSyncKeyRequest|null)
			public initialSecurityNotificationSettingSync?: (waproto.Message.IInitialSecurityNotificationSettingSync|null)
			public appStateFatalExceptionNotification?: (waproto.Message.IAppStateFatalExceptionNotification|null)
			public disappearingMode?: (waproto.IDisappearingMode|null)
			public editedMessage?: (waproto.IMessage|null)
			public timestampMs?: (number|Long|null)
			public peerDataOperationRequestMessage?: (waproto.Message.IPeerDataOperationRequestMessage|null)
			public peerDataOperationRequestResponseMessage?: (waproto.Message.IPeerDataOperationRequestResponseMessage|null)
			public botFeedbackMessage?: (waproto.IBotFeedbackMessage|null)
			public invokerJid?: (string|null)
			public requestWelcomeMessageMetadata?: (waproto.Message.IRequestWelcomeMessageMetadata|null)
			public mediaNotifyMessage?: (waproto.IMediaNotifyMessage|null)
			public cloudApiThreadControlNotification?: (waproto.Message.ICloudAPIThreadControlNotification|null)
			public lidMigrationMappingSyncMessage?: (waproto.ILIDMigrationMappingSyncMessage|null)
			public limitSharing?: (waproto.ILimitSharing|null)
			public aiPsiMetadata?: (Uint8Array|null)
			public aiQueryFanout?: (waproto.IAIQueryFanout|null)
			public memberLabel?: (waproto.IMemberLabel|null)
			public aiMediaCollectionMessage?: (waproto.IAIMediaCollectionMessage|null)
			public afterReadDuration?: (number|null)
			public static encode(m: waproto.Message.IProtocolMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ProtocolMessage
		}
		namespace ProtocolMessage {
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
				MESSAGE_UNSCHEDULE = 32
			}
		}
		interface IQuestionResponseMessage {
			key?: (waproto.IMessageKey|null)
			text?: (string|null)
		}
		class QuestionResponseMessage implements IQuestionResponseMessage {
			constructor(p?: waproto.Message.IQuestionResponseMessage)
			public key?: (waproto.IMessageKey|null)
			public text?: (string|null)
			public static encode(m: waproto.Message.IQuestionResponseMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.QuestionResponseMessage
		}
		interface IReactionMessage {
			key?: (waproto.IMessageKey|null)
			text?: (string|null)
			groupingKey?: (string|null)
			senderTimestampMs?: (number|Long|null)
		}
		class ReactionMessage implements IReactionMessage {
			constructor(p?: waproto.Message.IReactionMessage)
			public key?: (waproto.IMessageKey|null)
			public text?: (string|null)
			public groupingKey?: (string|null)
			public senderTimestampMs?: (number|Long|null)
			public static encode(m: waproto.Message.IReactionMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ReactionMessage
		}
		interface IRequestPaymentMessage {
			noteMessage?: (waproto.IMessage|null)
			currencyCodeIso4217?: (string|null)
			amount1000?: (number|Long|null)
			requestFrom?: (string|null)
			expiryTimestamp?: (number|Long|null)
			amount?: (waproto.IMoney|null)
			background?: (waproto.IPaymentBackground|null)
		}
		class RequestPaymentMessage implements IRequestPaymentMessage {
			constructor(p?: waproto.Message.IRequestPaymentMessage)
			public noteMessage?: (waproto.IMessage|null)
			public currencyCodeIso4217?: (string|null)
			public amount1000?: (number|Long|null)
			public requestFrom?: (string|null)
			public expiryTimestamp?: (number|Long|null)
			public amount?: (waproto.IMoney|null)
			public background?: (waproto.IPaymentBackground|null)
			public static encode(m: waproto.Message.IRequestPaymentMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.RequestPaymentMessage
		}
		interface IRequestPhoneNumberMessage {
			contextInfo?: (waproto.IContextInfo|null)
		}
		class RequestPhoneNumberMessage implements IRequestPhoneNumberMessage {
			constructor(p?: waproto.Message.IRequestPhoneNumberMessage)
			public contextInfo?: (waproto.IContextInfo|null)
			public static encode(m: waproto.Message.IRequestPhoneNumberMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.RequestPhoneNumberMessage
		}
		interface IRequestWelcomeMessageMetadata {
			localChatState?: (waproto.Message.RequestWelcomeMessageMetadata.LocalChatState|null)
			welcomeTrigger?: (waproto.Message.RequestWelcomeMessageMetadata.WelcomeTrigger|null)
		}
		class RequestWelcomeMessageMetadata implements IRequestWelcomeMessageMetadata {
			constructor(p?: waproto.Message.IRequestWelcomeMessageMetadata)
			public localChatState?: (waproto.Message.RequestWelcomeMessageMetadata.LocalChatState|null)
			public welcomeTrigger?: (waproto.Message.RequestWelcomeMessageMetadata.WelcomeTrigger|null)
			public static encode(m: waproto.Message.IRequestWelcomeMessageMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.RequestWelcomeMessageMetadata
		}
		namespace RequestWelcomeMessageMetadata {
			enum LocalChatState {
				EMPTY = 0,
				NON_EMPTY = 1
			}
			enum WelcomeTrigger {
				CHAT_OPEN = 0,
				COMPANION_PAIRING = 1
			}
		}
		interface IScheduledCallCreationMessage {
			scheduledTimestampMs?: (number|Long|null)
			callType?: (waproto.Message.ScheduledCallCreationMessage.CallType|null)
			title?: (string|null)
		}
		class ScheduledCallCreationMessage implements IScheduledCallCreationMessage {
			constructor(p?: waproto.Message.IScheduledCallCreationMessage)
			public scheduledTimestampMs?: (number|Long|null)
			public callType?: (waproto.Message.ScheduledCallCreationMessage.CallType|null)
			public title?: (string|null)
			public static encode(m: waproto.Message.IScheduledCallCreationMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ScheduledCallCreationMessage
		}
		namespace ScheduledCallCreationMessage {
			enum CallType {
				UNKNOWN = 0,
				VOICE = 1,
				VIDEO = 2
			}
		}
		interface IScheduledCallEditMessage {
			key?: (waproto.IMessageKey|null)
			editType?: (waproto.Message.ScheduledCallEditMessage.EditType|null)
		}
		class ScheduledCallEditMessage implements IScheduledCallEditMessage {
			constructor(p?: waproto.Message.IScheduledCallEditMessage)
			public key?: (waproto.IMessageKey|null)
			public editType?: (waproto.Message.ScheduledCallEditMessage.EditType|null)
			public static encode(m: waproto.Message.IScheduledCallEditMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.ScheduledCallEditMessage
		}
		namespace ScheduledCallEditMessage {
			enum EditType {
				UNKNOWN = 0,
				CANCEL = 1
			}
		}
		interface ISecretEncryptedMessage {
			targetMessageKey?: (waproto.IMessageKey|null)
			encPayload?: (Uint8Array|null)
			encIv?: (Uint8Array|null)
			secretEncType?: (waproto.Message.SecretEncryptedMessage.SecretEncType|null)
			remoteKeyId?: (string|null)
		}
		class SecretEncryptedMessage implements ISecretEncryptedMessage {
			constructor(p?: waproto.Message.ISecretEncryptedMessage)
			public targetMessageKey?: (waproto.IMessageKey|null)
			public encPayload?: (Uint8Array|null)
			public encIv?: (Uint8Array|null)
			public secretEncType?: (waproto.Message.SecretEncryptedMessage.SecretEncType|null)
			public remoteKeyId?: (string|null)
			public static encode(m: waproto.Message.ISecretEncryptedMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.SecretEncryptedMessage
		}
		namespace SecretEncryptedMessage {
			enum SecretEncType {
				UNKNOWN = 0,
				EVENT_EDIT = 1,
				MESSAGE_EDIT = 2,
				MESSAGE_SCHEDULE = 3,
				POLL_EDIT = 4,
				POLL_ADD_OPTION = 5
			}
		}
		interface ISendPaymentMessage {
			noteMessage?: (waproto.IMessage|null)
			requestMessageKey?: (waproto.IMessageKey|null)
			background?: (waproto.IPaymentBackground|null)
			transactionData?: (string|null)
		}
		class SendPaymentMessage implements ISendPaymentMessage {
			constructor(p?: waproto.Message.ISendPaymentMessage)
			public noteMessage?: (waproto.IMessage|null)
			public requestMessageKey?: (waproto.IMessageKey|null)
			public background?: (waproto.IPaymentBackground|null)
			public transactionData?: (string|null)
			public static encode(m: waproto.Message.ISendPaymentMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.SendPaymentMessage
		}
		interface ISenderKeyDistributionMessage {
			groupId?: (string|null)
			axolotlSenderKeyDistributionMessage?: (Uint8Array|null)
		}
		class SenderKeyDistributionMessage implements ISenderKeyDistributionMessage {
			constructor(p?: waproto.Message.ISenderKeyDistributionMessage)
			public groupId?: (string|null)
			public axolotlSenderKeyDistributionMessage?: (Uint8Array|null)
			public static encode(m: waproto.Message.ISenderKeyDistributionMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.SenderKeyDistributionMessage
		}
		interface IStatusNotificationMessage {
			responseMessageKey?: (waproto.IMessageKey|null)
			originalMessageKey?: (waproto.IMessageKey|null)
			type?: (waproto.Message.StatusNotificationMessage.StatusNotificationType|null)
		}
		class StatusNotificationMessage implements IStatusNotificationMessage {
			constructor(p?: waproto.Message.IStatusNotificationMessage)
			public responseMessageKey?: (waproto.IMessageKey|null)
			public originalMessageKey?: (waproto.IMessageKey|null)
			public type?: (waproto.Message.StatusNotificationMessage.StatusNotificationType|null)
			public static encode(m: waproto.Message.IStatusNotificationMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StatusNotificationMessage
		}
		namespace StatusNotificationMessage {
			enum StatusNotificationType {
				UNKNOWN = 0,
				STATUS_ADD_YOURS = 1,
				STATUS_RESHARE = 2,
				STATUS_QUESTION_ANSWER_RESHARE = 3
			}
		}
		interface IStatusQuestionAnswerMessage {
			key?: (waproto.IMessageKey|null)
			text?: (string|null)
		}
		class StatusQuestionAnswerMessage implements IStatusQuestionAnswerMessage {
			constructor(p?: waproto.Message.IStatusQuestionAnswerMessage)
			public key?: (waproto.IMessageKey|null)
			public text?: (string|null)
			public static encode(m: waproto.Message.IStatusQuestionAnswerMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StatusQuestionAnswerMessage
		}
		interface IStatusQuotedMessage {
			type?: (waproto.Message.StatusQuotedMessage.StatusQuotedMessageType|null)
			text?: (string|null)
			thumbnail?: (Uint8Array|null)
			originalStatusId?: (waproto.IMessageKey|null)
		}
		class StatusQuotedMessage implements IStatusQuotedMessage {
			constructor(p?: waproto.Message.IStatusQuotedMessage)
			public type?: (waproto.Message.StatusQuotedMessage.StatusQuotedMessageType|null)
			public text?: (string|null)
			public thumbnail?: (Uint8Array|null)
			public originalStatusId?: (waproto.IMessageKey|null)
			public static encode(m: waproto.Message.IStatusQuotedMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StatusQuotedMessage
		}
		namespace StatusQuotedMessage {
			enum StatusQuotedMessageType {
				QUESTION_ANSWER = 1
			}
		}
		interface IStatusStickerInteractionMessage {
			key?: (waproto.IMessageKey|null)
			stickerKey?: (string|null)
			type?: (waproto.Message.StatusStickerInteractionMessage.StatusStickerType|null)
		}
		class StatusStickerInteractionMessage implements IStatusStickerInteractionMessage {
			constructor(p?: waproto.Message.IStatusStickerInteractionMessage)
			public key?: (waproto.IMessageKey|null)
			public stickerKey?: (string|null)
			public type?: (waproto.Message.StatusStickerInteractionMessage.StatusStickerType|null)
			public static encode(m: waproto.Message.IStatusStickerInteractionMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StatusStickerInteractionMessage
		}
		namespace StatusStickerInteractionMessage {
			enum StatusStickerType {
				UNKNOWN = 0,
				REACTION = 1
			}
		}
		interface IStickerMessage {
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
			contextInfo?: (waproto.IContextInfo|null)
			stickerSentTs?: (number|Long|null)
			isAvatar?: (boolean|null)
			isAiSticker?: (boolean|null)
			isLottie?: (boolean|null)
			accessibilityLabel?: (string|null)
			premium?: (number|null)
		}
		class StickerMessage implements IStickerMessage {
			constructor(p?: waproto.Message.IStickerMessage)
			public url?: (string|null)
			public fileSha256?: (Uint8Array|null)
			public fileEncSha256?: (Uint8Array|null)
			public mediaKey?: (Uint8Array|null)
			public mimetype?: (string|null)
			public height?: (number|null)
			public width?: (number|null)
			public directPath?: (string|null)
			public fileLength?: (number|Long|null)
			public mediaKeyTimestamp?: (number|Long|null)
			public firstFrameLength?: (number|null)
			public firstFrameSidecar?: (Uint8Array|null)
			public isAnimated?: (boolean|null)
			public pngThumbnail?: (Uint8Array|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public stickerSentTs?: (number|Long|null)
			public isAvatar?: (boolean|null)
			public isAiSticker?: (boolean|null)
			public isLottie?: (boolean|null)
			public accessibilityLabel?: (string|null)
			public premium?: (number|null)
			public static encode(m: waproto.Message.IStickerMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StickerMessage
		}
		interface IStickerPackMessage {
			stickerPackId?: (string|null)
			name?: (string|null)
			publisher?: (string|null)
			stickers?: (waproto.Message.StickerPackMessage.ISticker[]|null)
			fileLength?: (number|Long|null)
			fileSha256?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			mediaKey?: (Uint8Array|null)
			directPath?: (string|null)
			caption?: (string|null)
			contextInfo?: (waproto.IContextInfo|null)
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
		}
		class StickerPackMessage implements IStickerPackMessage {
			constructor(p?: waproto.Message.IStickerPackMessage)
			public stickerPackId?: (string|null)
			public name?: (string|null)
			public publisher?: (string|null)
			public stickers: waproto.Message.StickerPackMessage.ISticker[]
			public fileLength?: (number|Long|null)
			public fileSha256?: (Uint8Array|null)
			public fileEncSha256?: (Uint8Array|null)
			public mediaKey?: (Uint8Array|null)
			public directPath?: (string|null)
			public caption?: (string|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public packDescription?: (string|null)
			public mediaKeyTimestamp?: (number|Long|null)
			public trayIconFileName?: (string|null)
			public thumbnailDirectPath?: (string|null)
			public thumbnailSha256?: (Uint8Array|null)
			public thumbnailEncSha256?: (Uint8Array|null)
			public thumbnailHeight?: (number|null)
			public thumbnailWidth?: (number|null)
			public imageDataHash?: (string|null)
			public stickerPackSize?: (number|Long|null)
			public stickerPackOrigin?: (waproto.Message.StickerPackMessage.StickerPackOrigin|null)
			public static encode(m: waproto.Message.IStickerPackMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StickerPackMessage
		}
		namespace StickerPackMessage {
			interface ISticker {
				fileName?: (string|null)
				isAnimated?: (boolean|null)
				emojis?: (string[]|null)
				accessibilityLabel?: (string|null)
				isLottie?: (boolean|null)
				mimetype?: (string|null)
				premium?: (number|null)
			}
			class Sticker implements ISticker {
				constructor(p?: waproto.Message.StickerPackMessage.ISticker)
				public fileName?: (string|null)
				public isAnimated?: (boolean|null)
				public emojis: string[]
				public accessibilityLabel?: (string|null)
				public isLottie?: (boolean|null)
				public mimetype?: (string|null)
				public premium?: (number|null)
				public static encode(m: waproto.Message.StickerPackMessage.ISticker, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StickerPackMessage.Sticker
			}
			enum StickerPackOrigin {
				FIRST_PARTY = 0,
				THIRD_PARTY = 1,
				USER_CREATED = 2
			}
		}
		interface IStickerSyncRMRMessage {
			filehash?: (string[]|null)
			rmrSource?: (string|null)
			requestTimestamp?: (number|Long|null)
		}
		class StickerSyncRMRMessage implements IStickerSyncRMRMessage {
			constructor(p?: waproto.Message.IStickerSyncRMRMessage)
			public filehash: string[]
			public rmrSource?: (string|null)
			public requestTimestamp?: (number|Long|null)
			public static encode(m: waproto.Message.IStickerSyncRMRMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.StickerSyncRMRMessage
		}
		interface ITemplateButtonReplyMessage {
			selectedId?: (string|null)
			selectedDisplayText?: (string|null)
			contextInfo?: (waproto.IContextInfo|null)
			selectedIndex?: (number|null)
			selectedCarouselCardIndex?: (number|null)
		}
		class TemplateButtonReplyMessage implements ITemplateButtonReplyMessage {
			constructor(p?: waproto.Message.ITemplateButtonReplyMessage)
			public selectedId?: (string|null)
			public selectedDisplayText?: (string|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public selectedIndex?: (number|null)
			public selectedCarouselCardIndex?: (number|null)
			public static encode(m: waproto.Message.ITemplateButtonReplyMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.TemplateButtonReplyMessage
		}
		interface ITemplateMessage {
			contextInfo?: (waproto.IContextInfo|null)
			hydratedTemplate?: (waproto.Message.TemplateMessage.IHydratedFourRowTemplate|null)
			templateId?: (string|null)
			fourRowTemplate?: (waproto.Message.TemplateMessage.IFourRowTemplate|null)
			hydratedFourRowTemplate?: (waproto.Message.TemplateMessage.IHydratedFourRowTemplate|null)
			interactiveMessageTemplate?: (waproto.Message.IInteractiveMessage|null)
		}
		class TemplateMessage implements ITemplateMessage {
			constructor(p?: waproto.Message.ITemplateMessage)
			public contextInfo?: (waproto.IContextInfo|null)
			public hydratedTemplate?: (waproto.Message.TemplateMessage.IHydratedFourRowTemplate|null)
			public templateId?: (string|null)
			public fourRowTemplate?: (waproto.Message.TemplateMessage.IFourRowTemplate|null)
			public hydratedFourRowTemplate?: (waproto.Message.TemplateMessage.IHydratedFourRowTemplate|null)
			public interactiveMessageTemplate?: (waproto.Message.IInteractiveMessage|null)
			public format?: ("fourRowTemplate"|"hydratedFourRowTemplate"|"interactiveMessageTemplate")
			public static encode(m: waproto.Message.ITemplateMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.TemplateMessage
		}
		namespace TemplateMessage {
			interface IFourRowTemplate {
				content?: (waproto.Message.IHighlyStructuredMessage|null)
				footer?: (waproto.Message.IHighlyStructuredMessage|null)
				buttons?: (waproto.ITemplateButton[]|null)
				documentMessage?: (waproto.Message.IDocumentMessage|null)
				highlyStructuredMessage?: (waproto.Message.IHighlyStructuredMessage|null)
				imageMessage?: (waproto.Message.IImageMessage|null)
				videoMessage?: (waproto.Message.IVideoMessage|null)
				locationMessage?: (waproto.Message.ILocationMessage|null)
			}
			class FourRowTemplate implements IFourRowTemplate {
				constructor(p?: waproto.Message.TemplateMessage.IFourRowTemplate)
				public content?: (waproto.Message.IHighlyStructuredMessage|null)
				public footer?: (waproto.Message.IHighlyStructuredMessage|null)
				public buttons: waproto.ITemplateButton[]
				public documentMessage?: (waproto.Message.IDocumentMessage|null)
				public highlyStructuredMessage?: (waproto.Message.IHighlyStructuredMessage|null)
				public imageMessage?: (waproto.Message.IImageMessage|null)
				public videoMessage?: (waproto.Message.IVideoMessage|null)
				public locationMessage?: (waproto.Message.ILocationMessage|null)
				public title?: ("documentMessage"|"highlyStructuredMessage"|"imageMessage"|"videoMessage"|"locationMessage")
				public static encode(m: waproto.Message.TemplateMessage.IFourRowTemplate, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.TemplateMessage.FourRowTemplate
			}
			interface IHydratedFourRowTemplate {
				hydratedContentText?: (string|null)
				hydratedFooterText?: (string|null)
				hydratedButtons?: (waproto.IHydratedTemplateButton[]|null)
				templateId?: (string|null)
				maskLinkedDevices?: (boolean|null)
				documentMessage?: (waproto.Message.IDocumentMessage|null)
				hydratedTitleText?: (string|null)
				imageMessage?: (waproto.Message.IImageMessage|null)
				videoMessage?: (waproto.Message.IVideoMessage|null)
				locationMessage?: (waproto.Message.ILocationMessage|null)
			}
			class HydratedFourRowTemplate implements IHydratedFourRowTemplate {
				constructor(p?: waproto.Message.TemplateMessage.IHydratedFourRowTemplate)
				public hydratedContentText?: (string|null)
				public hydratedFooterText?: (string|null)
				public hydratedButtons: waproto.IHydratedTemplateButton[]
				public templateId?: (string|null)
				public maskLinkedDevices?: (boolean|null)
				public documentMessage?: (waproto.Message.IDocumentMessage|null)
				public hydratedTitleText?: (string|null)
				public imageMessage?: (waproto.Message.IImageMessage|null)
				public videoMessage?: (waproto.Message.IVideoMessage|null)
				public locationMessage?: (waproto.Message.ILocationMessage|null)
				public title?: ("documentMessage"|"hydratedTitleText"|"imageMessage"|"videoMessage"|"locationMessage")
				public static encode(m: waproto.Message.TemplateMessage.IHydratedFourRowTemplate, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.TemplateMessage.HydratedFourRowTemplate
			}
		}
		interface IURLMetadata {
			fbExperimentId?: (number|null)
		}
		class URLMetadata implements IURLMetadata {
			constructor(p?: waproto.Message.IURLMetadata)
			public fbExperimentId?: (number|null)
			public static encode(m: waproto.Message.IURLMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.URLMetadata
		}
		interface IVideoEndCard {
			username?: (string|null)
			caption?: (string|null)
			thumbnailImageUrl?: (string|null)
			profilePictureUrl?: (string|null)
		}
		class VideoEndCard implements IVideoEndCard {
			constructor(p?: waproto.Message.IVideoEndCard)
			public username?: (string|null)
			public caption?: (string|null)
			public thumbnailImageUrl?: (string|null)
			public profilePictureUrl?: (string|null)
			public static encode(m: waproto.Message.IVideoEndCard, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.VideoEndCard
		}
		interface IVideoMessage {
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
			interactiveAnnotations?: (waproto.IInteractiveAnnotation[]|null)
			directPath?: (string|null)
			mediaKeyTimestamp?: (number|Long|null)
			jpegThumbnail?: (Uint8Array|null)
			contextInfo?: (waproto.IContextInfo|null)
			streamingSidecar?: (Uint8Array|null)
			gifAttribution?: (waproto.Message.VideoMessage.Attribution|null)
			viewOnce?: (boolean|null)
			thumbnailDirectPath?: (string|null)
			thumbnailSha256?: (Uint8Array|null)
			thumbnailEncSha256?: (Uint8Array|null)
			staticUrl?: (string|null)
			annotations?: (waproto.IInteractiveAnnotation[]|null)
			accessibilityLabel?: (string|null)
			processedVideos?: (waproto.IProcessedVideo[]|null)
			externalShareFullVideoDurationInSeconds?: (number|null)
			motionPhotoPresentationOffsetMs?: (number|Long|null)
			metadataUrl?: (string|null)
			videoSourceType?: (waproto.Message.VideoMessage.VideoSourceType|null)
		}
		class VideoMessage implements IVideoMessage {
			constructor(p?: waproto.Message.IVideoMessage)
			public url?: (string|null)
			public mimetype?: (string|null)
			public fileSha256?: (Uint8Array|null)
			public fileLength?: (number|Long|null)
			public seconds?: (number|null)
			public mediaKey?: (Uint8Array|null)
			public caption?: (string|null)
			public gifPlayback?: (boolean|null)
			public height?: (number|null)
			public width?: (number|null)
			public fileEncSha256?: (Uint8Array|null)
			public interactiveAnnotations: waproto.IInteractiveAnnotation[]
			public directPath?: (string|null)
			public mediaKeyTimestamp?: (number|Long|null)
			public jpegThumbnail?: (Uint8Array|null)
			public contextInfo?: (waproto.IContextInfo|null)
			public streamingSidecar?: (Uint8Array|null)
			public gifAttribution?: (waproto.Message.VideoMessage.Attribution|null)
			public viewOnce?: (boolean|null)
			public thumbnailDirectPath?: (string|null)
			public thumbnailSha256?: (Uint8Array|null)
			public thumbnailEncSha256?: (Uint8Array|null)
			public staticUrl?: (string|null)
			public annotations: waproto.IInteractiveAnnotation[]
			public accessibilityLabel?: (string|null)
			public processedVideos: waproto.IProcessedVideo[]
			public externalShareFullVideoDurationInSeconds?: (number|null)
			public motionPhotoPresentationOffsetMs?: (number|Long|null)
			public metadataUrl?: (string|null)
			public videoSourceType?: (waproto.Message.VideoMessage.VideoSourceType|null)
			public static encode(m: waproto.Message.IVideoMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Message.VideoMessage
		}
		namespace VideoMessage {
			enum Attribution {
				NONE = 0,
				GIPHY = 1,
				TENOR = 2,
				KLIPY = 3
			}
			enum VideoSourceType {
				USER_VIDEO = 0,
				AI_GENERATED = 1
			}
		}
	}
	interface IMessageAddOn {
		messageAddOnType?: (waproto.MessageAddOn.MessageAddOnType|null)
		messageAddOn?: (waproto.IMessage|null)
		senderTimestampMs?: (number|Long|null)
		serverTimestampMs?: (number|Long|null)
		status?: (waproto.WebMessageInfo.Status|null)
		addOnContextInfo?: (waproto.IMessageAddOnContextInfo|null)
		messageAddOnKey?: (waproto.IMessageKey|null)
		legacyMessage?: (waproto.ILegacyMessage|null)
	}
	class MessageAddOn implements IMessageAddOn {
		constructor(p?: waproto.IMessageAddOn)
		public messageAddOnType?: (waproto.MessageAddOn.MessageAddOnType|null)
		public messageAddOn?: (waproto.IMessage|null)
		public senderTimestampMs?: (number|Long|null)
		public serverTimestampMs?: (number|Long|null)
		public status?: (waproto.WebMessageInfo.Status|null)
		public addOnContextInfo?: (waproto.IMessageAddOnContextInfo|null)
		public messageAddOnKey?: (waproto.IMessageKey|null)
		public legacyMessage?: (waproto.ILegacyMessage|null)
		public static encode(m: waproto.IMessageAddOn, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageAddOn
	}
	namespace MessageAddOn {
		enum MessageAddOnType {
			UNDEFINED = 0,
			REACTION = 1,
			EVENT_RESPONSE = 2,
			POLL_UPDATE = 3,
			PIN_IN_CHAT = 4
		}
	}
	interface IMessageAddOnContextInfo {
		messageAddOnDurationInSecs?: (number|null)
		messageAddOnExpiryType?: (waproto.MessageContextInfo.MessageAddonExpiryType|null)
	}
	class MessageAddOnContextInfo implements IMessageAddOnContextInfo {
		constructor(p?: waproto.IMessageAddOnContextInfo)
		public messageAddOnDurationInSecs?: (number|null)
		public messageAddOnExpiryType?: (waproto.MessageContextInfo.MessageAddonExpiryType|null)
		public static encode(m: waproto.IMessageAddOnContextInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageAddOnContextInfo
	}
	interface IMessageAssociation {
		associationType?: (waproto.MessageAssociation.AssociationType|null)
		parentMessageKey?: (waproto.IMessageKey|null)
		messageIndex?: (number|null)
	}
	class MessageAssociation implements IMessageAssociation {
		constructor(p?: waproto.IMessageAssociation)
		public associationType?: (waproto.MessageAssociation.AssociationType|null)
		public parentMessageKey?: (waproto.IMessageKey|null)
		public messageIndex?: (number|null)
		public static encode(m: waproto.IMessageAssociation, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageAssociation
	}
	namespace MessageAssociation {
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
	interface IMessageContextInfo {
		deviceListMetadata?: (waproto.IDeviceListMetadata|null)
		deviceListMetadataVersion?: (number|null)
		messageSecret?: (Uint8Array|null)
		paddingBytes?: (Uint8Array|null)
		messageAddOnDurationInSecs?: (number|null)
		botMessageSecret?: (Uint8Array|null)
		botMetadata?: (waproto.IBotMetadata|null)
		reportingTokenVersion?: (number|null)
		messageAddOnExpiryType?: (waproto.MessageContextInfo.MessageAddonExpiryType|null)
		messageAssociation?: (waproto.IMessageAssociation|null)
		capiCreatedGroup?: (boolean|null)
		supportPayload?: (string|null)
		limitSharing?: (waproto.ILimitSharing|null)
		limitSharingV2?: (waproto.ILimitSharing|null)
		threadId?: (waproto.IThreadID[]|null)
		weblinkRenderConfig?: (waproto.WebLinkRenderConfig|null)
	}
	class MessageContextInfo implements IMessageContextInfo {
		constructor(p?: waproto.IMessageContextInfo)
		public deviceListMetadata?: (waproto.IDeviceListMetadata|null)
		public deviceListMetadataVersion?: (number|null)
		public messageSecret?: (Uint8Array|null)
		public paddingBytes?: (Uint8Array|null)
		public messageAddOnDurationInSecs?: (number|null)
		public botMessageSecret?: (Uint8Array|null)
		public botMetadata?: (waproto.IBotMetadata|null)
		public reportingTokenVersion?: (number|null)
		public messageAddOnExpiryType?: (waproto.MessageContextInfo.MessageAddonExpiryType|null)
		public messageAssociation?: (waproto.IMessageAssociation|null)
		public capiCreatedGroup?: (boolean|null)
		public supportPayload?: (string|null)
		public limitSharing?: (waproto.ILimitSharing|null)
		public limitSharingV2?: (waproto.ILimitSharing|null)
		public threadId: waproto.IThreadID[]
		public weblinkRenderConfig?: (waproto.WebLinkRenderConfig|null)
		public static encode(m: waproto.IMessageContextInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageContextInfo
	}
	namespace MessageContextInfo {
		enum MessageAddonExpiryType {
			STATIC = 1,
			DEPENDENT_ON_PARENT = 2
		}
	}
	interface IMessageKey {
		remoteJid?: (string|null)
		fromMe?: (boolean|null)
		id?: (string|null)
		participant?: (string|null)
	}
	class MessageKey implements IMessageKey {
		constructor(p?: waproto.IMessageKey)
		public remoteJid?: (string|null)
		public fromMe?: (boolean|null)
		public id?: (string|null)
		public participant?: (string|null)
		public static encode(m: waproto.IMessageKey, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageKey
	}
	interface IMessageSecretMessage {
		version?: (number|null)
		encIv?: (Uint8Array|null)
		encPayload?: (Uint8Array|null)
	}
	class MessageSecretMessage implements IMessageSecretMessage {
		constructor(p?: waproto.IMessageSecretMessage)
		public version?: (number|null)
		public encIv?: (Uint8Array|null)
		public encPayload?: (Uint8Array|null)
		public static encode(m: waproto.IMessageSecretMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MessageSecretMessage
	}
	interface IMoney {
		value?: (number|Long|null)
		offset?: (number|null)
		currencyCode?: (string|null)
	}
	class Money implements IMoney {
		constructor(p?: waproto.IMoney)
		public value?: (number|Long|null)
		public offset?: (number|null)
		public currencyCode?: (string|null)
		public static encode(m: waproto.IMoney, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Money
	}
	interface IMsgOpaqueData {
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
		pollOptions?: (waproto.MsgOpaqueData.IPollOption[]|null)
		pollSelectableOptionsCount?: (number|null)
		messageSecret?: (Uint8Array|null)
		originalSelfAuthor?: (string|null)
		senderTimestampMs?: (number|Long|null)
		pollUpdateParentKey?: (string|null)
		encPollVote?: (waproto.IPollEncValue|null)
		isSentCagPollCreation?: (boolean|null)
		pollContentType?: (waproto.MsgOpaqueData.PollContentType|null)
		pollType?: (waproto.MsgOpaqueData.PollType|null)
		correctOptionIndex?: (number|null)
		pollVotesSnapshot?: (waproto.MsgOpaqueData.IPollVotesSnapshot|null)
		encReactionTargetMessageKey?: (string|null)
		encReactionEncPayload?: (Uint8Array|null)
		encReactionEncIv?: (Uint8Array|null)
		botMessageSecret?: (Uint8Array|null)
		targetMessageKey?: (string|null)
		encPayload?: (Uint8Array|null)
		encIv?: (Uint8Array|null)
		eventName?: (string|null)
		isEventCanceled?: (boolean|null)
		eventDescription?: (string|null)
		eventJoinLink?: (string|null)
		eventStartTime?: (number|Long|null)
		eventLocation?: (waproto.MsgOpaqueData.IEventLocation|null)
		eventEndTime?: (number|Long|null)
		eventIsScheduledCall?: (boolean|null)
		eventExtraGuestsAllowed?: (boolean|null)
		plainProtobufBytes?: (Uint8Array|null)
		quarantineExtractedText?: (string|null)
		pollEndTime?: (number|Long|null)
		pollHideVoterNames?: (boolean|null)
		pollAllowAddOption?: (boolean|null)
	}
	class MsgOpaqueData implements IMsgOpaqueData {
		constructor(p?: waproto.IMsgOpaqueData)
		public body?: (string|null)
		public caption?: (string|null)
		public lng?: (number|null)
		public isLive?: (boolean|null)
		public lat?: (number|null)
		public paymentAmount1000?: (number|null)
		public paymentNoteMsgBody?: (string|null)
		public matchedText?: (string|null)
		public title?: (string|null)
		public description?: (string|null)
		public futureproofBuffer?: (Uint8Array|null)
		public clientUrl?: (string|null)
		public loc?: (string|null)
		public pollName?: (string|null)
		public pollOptions: waproto.MsgOpaqueData.IPollOption[]
		public pollSelectableOptionsCount?: (number|null)
		public messageSecret?: (Uint8Array|null)
		public originalSelfAuthor?: (string|null)
		public senderTimestampMs?: (number|Long|null)
		public pollUpdateParentKey?: (string|null)
		public encPollVote?: (waproto.IPollEncValue|null)
		public isSentCagPollCreation?: (boolean|null)
		public pollContentType?: (waproto.MsgOpaqueData.PollContentType|null)
		public pollType?: (waproto.MsgOpaqueData.PollType|null)
		public correctOptionIndex?: (number|null)
		public pollVotesSnapshot?: (waproto.MsgOpaqueData.IPollVotesSnapshot|null)
		public encReactionTargetMessageKey?: (string|null)
		public encReactionEncPayload?: (Uint8Array|null)
		public encReactionEncIv?: (Uint8Array|null)
		public botMessageSecret?: (Uint8Array|null)
		public targetMessageKey?: (string|null)
		public encPayload?: (Uint8Array|null)
		public encIv?: (Uint8Array|null)
		public eventName?: (string|null)
		public isEventCanceled?: (boolean|null)
		public eventDescription?: (string|null)
		public eventJoinLink?: (string|null)
		public eventStartTime?: (number|Long|null)
		public eventLocation?: (waproto.MsgOpaqueData.IEventLocation|null)
		public eventEndTime?: (number|Long|null)
		public eventIsScheduledCall?: (boolean|null)
		public eventExtraGuestsAllowed?: (boolean|null)
		public plainProtobufBytes?: (Uint8Array|null)
		public quarantineExtractedText?: (string|null)
		public pollEndTime?: (number|Long|null)
		public pollHideVoterNames?: (boolean|null)
		public pollAllowAddOption?: (boolean|null)
		public static encode(m: waproto.IMsgOpaqueData, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MsgOpaqueData
	}
	namespace MsgOpaqueData {
		interface IEventLocation {
			degreesLatitude?: (number|null)
			degreesLongitude?: (number|null)
			name?: (string|null)
			address?: (string|null)
			url?: (string|null)
			jpegThumbnail?: (Uint8Array|null)
		}
		class EventLocation implements IEventLocation {
			constructor(p?: waproto.MsgOpaqueData.IEventLocation)
			public degreesLatitude?: (number|null)
			public degreesLongitude?: (number|null)
			public name?: (string|null)
			public address?: (string|null)
			public url?: (string|null)
			public jpegThumbnail?: (Uint8Array|null)
			public static encode(m: waproto.MsgOpaqueData.IEventLocation, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MsgOpaqueData.EventLocation
		}
		enum PollContentType {
			UNKNOWN = 0,
			TEXT = 1,
			IMAGE = 2
		}
		interface IPollOption {
			name?: (string|null)
			hash?: (string|null)
		}
		class PollOption implements IPollOption {
			constructor(p?: waproto.MsgOpaqueData.IPollOption)
			public name?: (string|null)
			public hash?: (string|null)
			public static encode(m: waproto.MsgOpaqueData.IPollOption, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MsgOpaqueData.PollOption
		}
		enum PollType {
			POLL = 0,
			QUIZ = 1
		}
		interface IPollVoteSnapshot {
			option?: (waproto.MsgOpaqueData.IPollOption|null)
			optionVoteCount?: (number|null)
		}
		class PollVoteSnapshot implements IPollVoteSnapshot {
			constructor(p?: waproto.MsgOpaqueData.IPollVoteSnapshot)
			public option?: (waproto.MsgOpaqueData.IPollOption|null)
			public optionVoteCount?: (number|null)
			public static encode(m: waproto.MsgOpaqueData.IPollVoteSnapshot, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MsgOpaqueData.PollVoteSnapshot
		}
		interface IPollVotesSnapshot {
			pollVotes?: (waproto.MsgOpaqueData.IPollVoteSnapshot[]|null)
		}
		class PollVotesSnapshot implements IPollVotesSnapshot {
			constructor(p?: waproto.MsgOpaqueData.IPollVotesSnapshot)
			public pollVotes: waproto.MsgOpaqueData.IPollVoteSnapshot[]
			public static encode(m: waproto.MsgOpaqueData.IPollVotesSnapshot, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MsgOpaqueData.PollVotesSnapshot
		}
	}
	interface IMsgRowOpaqueData {
		currentMsg?: (waproto.IMsgOpaqueData|null)
		quotedMsg?: (waproto.IMsgOpaqueData|null)
	}
	class MsgRowOpaqueData implements IMsgRowOpaqueData {
		constructor(p?: waproto.IMsgRowOpaqueData)
		public currentMsg?: (waproto.IMsgOpaqueData|null)
		public quotedMsg?: (waproto.IMsgOpaqueData|null)
		public static encode(m: waproto.IMsgRowOpaqueData, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.MsgRowOpaqueData
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
		SHARE_OWN_PN = 10001,
		BUSINESS_BROADCAST_ACTION = 10002,
		AI_THREAD_DELETE_ACTION = 10003
	}
	interface INoiseCertificate {
		details?: (Uint8Array|null)
		signature?: (Uint8Array|null)
	}
	class NoiseCertificate implements INoiseCertificate {
		constructor(p?: waproto.INoiseCertificate)
		public details?: (Uint8Array|null)
		public signature?: (Uint8Array|null)
		public static encode(m: waproto.INoiseCertificate, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.NoiseCertificate
	}
	namespace NoiseCertificate {
		interface IDetails {
			serial?: (number|null)
			issuer?: (string|null)
			expires?: (number|Long|null)
			subject?: (string|null)
			key?: (Uint8Array|null)
		}
		class Details implements IDetails {
			constructor(p?: waproto.NoiseCertificate.IDetails)
			public serial?: (number|null)
			public issuer?: (string|null)
			public expires?: (number|Long|null)
			public subject?: (string|null)
			public key?: (Uint8Array|null)
			public static encode(m: waproto.NoiseCertificate.IDetails, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.NoiseCertificate.Details
		}
	}
	interface INotificationMessageInfo {
		key?: (waproto.IMessageKey|null)
		message?: (waproto.IMessage|null)
		messageTimestamp?: (number|Long|null)
		participant?: (string|null)
	}
	class NotificationMessageInfo implements INotificationMessageInfo {
		constructor(p?: waproto.INotificationMessageInfo)
		public key?: (waproto.IMessageKey|null)
		public message?: (waproto.IMessage|null)
		public messageTimestamp?: (number|Long|null)
		public participant?: (string|null)
		public static encode(m: waproto.INotificationMessageInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.NotificationMessageInfo
	}
	interface INotificationSettings {
		messageVibrate?: (string|null)
		messagePopup?: (string|null)
		messageLight?: (string|null)
		lowPriorityNotifications?: (boolean|null)
		reactionsMuted?: (boolean|null)
		callVibrate?: (string|null)
	}
	class NotificationSettings implements INotificationSettings {
		constructor(p?: waproto.INotificationSettings)
		public messageVibrate?: (string|null)
		public messagePopup?: (string|null)
		public messageLight?: (string|null)
		public lowPriorityNotifications?: (boolean|null)
		public reactionsMuted?: (boolean|null)
		public callVibrate?: (string|null)
		public static encode(m: waproto.INotificationSettings, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.NotificationSettings
	}
	interface IPairingRequest {
		companionPublicKey?: (Uint8Array|null)
		companionIdentityKey?: (Uint8Array|null)
		advSecret?: (Uint8Array|null)
	}
	class PairingRequest implements IPairingRequest {
		constructor(p?: waproto.IPairingRequest)
		public companionPublicKey?: (Uint8Array|null)
		public companionIdentityKey?: (Uint8Array|null)
		public advSecret?: (Uint8Array|null)
		public static encode(m: waproto.IPairingRequest, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PairingRequest
	}
	interface IPastParticipant {
		userJid?: (string|null)
		leaveReason?: (waproto.PastParticipant.LeaveReason|null)
		leaveTs?: (number|Long|null)
	}
	class PastParticipant implements IPastParticipant {
		constructor(p?: waproto.IPastParticipant)
		public userJid?: (string|null)
		public leaveReason?: (waproto.PastParticipant.LeaveReason|null)
		public leaveTs?: (number|Long|null)
		public static encode(m: waproto.IPastParticipant, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PastParticipant
	}
	namespace PastParticipant {
		enum LeaveReason {
			LEFT = 0,
			REMOVED = 1
		}
	}
	interface IPastParticipants {
		groupJid?: (string|null)
		pastParticipants?: (waproto.IPastParticipant[]|null)
	}
	class PastParticipants implements IPastParticipants {
		constructor(p?: waproto.IPastParticipants)
		public groupJid?: (string|null)
		public pastParticipants: waproto.IPastParticipant[]
		public static encode(m: waproto.IPastParticipants, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PastParticipants
	}
	interface IPatchDebugData {
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
	}
	class PatchDebugData implements IPatchDebugData {
		constructor(p?: waproto.IPatchDebugData)
		public currentLthash?: (Uint8Array|null)
		public newLthash?: (Uint8Array|null)
		public patchVersion?: (Uint8Array|null)
		public collectionName?: (Uint8Array|null)
		public firstFourBytesFromAHashOfSnapshotMacKey?: (Uint8Array|null)
		public newLthashSubtract?: (Uint8Array|null)
		public numberAdd?: (number|null)
		public numberRemove?: (number|null)
		public numberOverride?: (number|null)
		public senderPlatform?: (waproto.PatchDebugData.Platform|null)
		public isSenderPrimary?: (boolean|null)
		public static encode(m: waproto.IPatchDebugData, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PatchDebugData
	}
	namespace PatchDebugData {
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
	interface IPaymentBackground {
		id?: (string|null)
		fileLength?: (number|Long|null)
		width?: (number|null)
		height?: (number|null)
		mimetype?: (string|null)
		placeholderArgb?: (number|null)
		textArgb?: (number|null)
		subtextArgb?: (number|null)
		mediaData?: (waproto.PaymentBackground.IMediaData|null)
		type?: (waproto.PaymentBackground.Type|null)
	}
	class PaymentBackground implements IPaymentBackground {
		constructor(p?: waproto.IPaymentBackground)
		public id?: (string|null)
		public fileLength?: (number|Long|null)
		public width?: (number|null)
		public height?: (number|null)
		public mimetype?: (string|null)
		public placeholderArgb?: (number|null)
		public textArgb?: (number|null)
		public subtextArgb?: (number|null)
		public mediaData?: (waproto.PaymentBackground.IMediaData|null)
		public type?: (waproto.PaymentBackground.Type|null)
		public static encode(m: waproto.IPaymentBackground, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PaymentBackground
	}
	namespace PaymentBackground {
		interface IMediaData {
			mediaKey?: (Uint8Array|null)
			mediaKeyTimestamp?: (number|Long|null)
			fileSha256?: (Uint8Array|null)
			fileEncSha256?: (Uint8Array|null)
			directPath?: (string|null)
		}
		class MediaData implements IMediaData {
			constructor(p?: waproto.PaymentBackground.IMediaData)
			public mediaKey?: (Uint8Array|null)
			public mediaKeyTimestamp?: (number|Long|null)
			public fileSha256?: (Uint8Array|null)
			public fileEncSha256?: (Uint8Array|null)
			public directPath?: (string|null)
			public static encode(m: waproto.PaymentBackground.IMediaData, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PaymentBackground.MediaData
		}
		enum Type {
			UNKNOWN = 0,
			DEFAULT = 1
		}
	}
	interface IPaymentInfo {
		currencyDeprecated?: (waproto.PaymentInfo.Currency|null)
		amount1000?: (number|Long|null)
		receiverJid?: (string|null)
		status?: (waproto.PaymentInfo.Status|null)
		transactionTimestamp?: (number|Long|null)
		requestMessageKey?: (waproto.IMessageKey|null)
		expiryTimestamp?: (number|Long|null)
		futureproofed?: (boolean|null)
		currency?: (string|null)
		txnStatus?: (waproto.PaymentInfo.TxnStatus|null)
		useNoviFiatFormat?: (boolean|null)
		primaryAmount?: (waproto.IMoney|null)
		exchangeAmount?: (waproto.IMoney|null)
	}
	class PaymentInfo implements IPaymentInfo {
		constructor(p?: waproto.IPaymentInfo)
		public currencyDeprecated?: (waproto.PaymentInfo.Currency|null)
		public amount1000?: (number|Long|null)
		public receiverJid?: (string|null)
		public status?: (waproto.PaymentInfo.Status|null)
		public transactionTimestamp?: (number|Long|null)
		public requestMessageKey?: (waproto.IMessageKey|null)
		public expiryTimestamp?: (number|Long|null)
		public futureproofed?: (boolean|null)
		public currency?: (string|null)
		public txnStatus?: (waproto.PaymentInfo.TxnStatus|null)
		public useNoviFiatFormat?: (boolean|null)
		public primaryAmount?: (waproto.IMoney|null)
		public exchangeAmount?: (waproto.IMoney|null)
		public static encode(m: waproto.IPaymentInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PaymentInfo
	}
	namespace PaymentInfo {
		enum Currency {
			UNKNOWN_CURRENCY = 0,
			INR = 1
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
	}
	interface IPhoneNumberToLIDMapping {
		pnJid?: (string|null)
		lidJid?: (string|null)
	}
	class PhoneNumberToLIDMapping implements IPhoneNumberToLIDMapping {
		constructor(p?: waproto.IPhoneNumberToLIDMapping)
		public pnJid?: (string|null)
		public lidJid?: (string|null)
		public static encode(m: waproto.IPhoneNumberToLIDMapping, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PhoneNumberToLIDMapping
	}
	interface IPhotoChange {
		oldPhoto?: (Uint8Array|null)
		newPhoto?: (Uint8Array|null)
		newPhotoId?: (number|null)
	}
	class PhotoChange implements IPhotoChange {
		constructor(p?: waproto.IPhotoChange)
		public oldPhoto?: (Uint8Array|null)
		public newPhoto?: (Uint8Array|null)
		public newPhotoId?: (number|null)
		public static encode(m: waproto.IPhotoChange, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PhotoChange
	}
	interface IPinInChat {
		type?: (waproto.PinInChat.Type|null)
		key?: (waproto.IMessageKey|null)
		senderTimestampMs?: (number|Long|null)
		serverTimestampMs?: (number|Long|null)
		messageAddOnContextInfo?: (waproto.IMessageAddOnContextInfo|null)
	}
	class PinInChat implements IPinInChat {
		constructor(p?: waproto.IPinInChat)
		public type?: (waproto.PinInChat.Type|null)
		public key?: (waproto.IMessageKey|null)
		public senderTimestampMs?: (number|Long|null)
		public serverTimestampMs?: (number|Long|null)
		public messageAddOnContextInfo?: (waproto.IMessageAddOnContextInfo|null)
		public static encode(m: waproto.IPinInChat, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PinInChat
	}
	namespace PinInChat {
		enum Type {
			UNKNOWN_TYPE = 0,
			PIN_FOR_ALL = 1,
			UNPIN_FOR_ALL = 2
		}
	}
	interface IPoint {
		xDeprecated?: (number|null)
		yDeprecated?: (number|null)
		x?: (number|null)
		y?: (number|null)
	}
	class Point implements IPoint {
		constructor(p?: waproto.IPoint)
		public xDeprecated?: (number|null)
		public yDeprecated?: (number|null)
		public x?: (number|null)
		public y?: (number|null)
		public static encode(m: waproto.IPoint, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Point
	}
	interface IPollAdditionalMetadata {
		pollInvalidated?: (boolean|null)
	}
	class PollAdditionalMetadata implements IPollAdditionalMetadata {
		constructor(p?: waproto.IPollAdditionalMetadata)
		public pollInvalidated?: (boolean|null)
		public static encode(m: waproto.IPollAdditionalMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PollAdditionalMetadata
	}
	interface IPollEncValue {
		encPayload?: (Uint8Array|null)
		encIv?: (Uint8Array|null)
	}
	class PollEncValue implements IPollEncValue {
		constructor(p?: waproto.IPollEncValue)
		public encPayload?: (Uint8Array|null)
		public encIv?: (Uint8Array|null)
		public static encode(m: waproto.IPollEncValue, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PollEncValue
	}
	interface IPollUpdate {
		pollUpdateMessageKey?: (waproto.IMessageKey|null)
		vote?: (waproto.Message.IPollVoteMessage|null)
		senderTimestampMs?: (number|Long|null)
		serverTimestampMs?: (number|Long|null)
		unread?: (boolean|null)
	}
	class PollUpdate implements IPollUpdate {
		constructor(p?: waproto.IPollUpdate)
		public pollUpdateMessageKey?: (waproto.IMessageKey|null)
		public vote?: (waproto.Message.IPollVoteMessage|null)
		public senderTimestampMs?: (number|Long|null)
		public serverTimestampMs?: (number|Long|null)
		public unread?: (boolean|null)
		public static encode(m: waproto.IPollUpdate, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PollUpdate
	}
	interface IPreKeyRecordStructure {
		id?: (number|null)
		publicKey?: (Uint8Array|null)
		privateKey?: (Uint8Array|null)
	}
	class PreKeyRecordStructure implements IPreKeyRecordStructure {
		constructor(p?: waproto.IPreKeyRecordStructure)
		public id?: (number|null)
		public publicKey?: (Uint8Array|null)
		public privateKey?: (Uint8Array|null)
		public static encode(m: waproto.IPreKeyRecordStructure, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PreKeyRecordStructure
	}
	interface IPreKeySignalMessage {
		registrationId?: (number|null)
		preKeyId?: (number|null)
		signedPreKeyId?: (number|null)
		baseKey?: (Uint8Array|null)
		identityKey?: (Uint8Array|null)
		message?: (Uint8Array|null)
	}
	class PreKeySignalMessage implements IPreKeySignalMessage {
		constructor(p?: waproto.IPreKeySignalMessage)
		public registrationId?: (number|null)
		public preKeyId?: (number|null)
		public signedPreKeyId?: (number|null)
		public baseKey?: (Uint8Array|null)
		public identityKey?: (Uint8Array|null)
		public message?: (Uint8Array|null)
		public static encode(m: waproto.IPreKeySignalMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PreKeySignalMessage
	}
	interface IPremiumMessageInfo {
		serverCampaignId?: (string|null)
	}
	class PremiumMessageInfo implements IPremiumMessageInfo {
		constructor(p?: waproto.IPremiumMessageInfo)
		public serverCampaignId?: (string|null)
		public static encode(m: waproto.IPremiumMessageInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PremiumMessageInfo
	}
	interface IPrimaryEphemeralIdentity {
		publicKey?: (Uint8Array|null)
		nonce?: (Uint8Array|null)
	}
	class PrimaryEphemeralIdentity implements IPrimaryEphemeralIdentity {
		constructor(p?: waproto.IPrimaryEphemeralIdentity)
		public publicKey?: (Uint8Array|null)
		public nonce?: (Uint8Array|null)
		public static encode(m: waproto.IPrimaryEphemeralIdentity, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.PrimaryEphemeralIdentity
	}
	enum PrivacySystemMessage {
		E2EE_MSG = 1,
		NE2EE_SELF = 2,
		NE2EE_OTHER = 3
	}
	interface IProcessedVideo {
		directPath?: (string|null)
		fileSha256?: (Uint8Array|null)
		height?: (number|null)
		width?: (number|null)
		fileLength?: (number|Long|null)
		bitrate?: (number|null)
		quality?: (waproto.ProcessedVideo.VideoQuality|null)
		capabilities?: (string[]|null)
	}
	class ProcessedVideo implements IProcessedVideo {
		constructor(p?: waproto.IProcessedVideo)
		public directPath?: (string|null)
		public fileSha256?: (Uint8Array|null)
		public height?: (number|null)
		public width?: (number|null)
		public fileLength?: (number|Long|null)
		public bitrate?: (number|null)
		public quality?: (waproto.ProcessedVideo.VideoQuality|null)
		public capabilities: string[]
		public static encode(m: waproto.IProcessedVideo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ProcessedVideo
	}
	namespace ProcessedVideo {
		enum VideoQuality {
			UNDEFINED = 0,
			LOW = 1,
			MID = 2,
			HIGH = 3
		}
	}
	interface IProloguePayload {
		companionEphemeralIdentity?: (Uint8Array|null)
		commitment?: (waproto.ICompanionCommitment|null)
	}
	class ProloguePayload implements IProloguePayload {
		constructor(p?: waproto.IProloguePayload)
		public companionEphemeralIdentity?: (Uint8Array|null)
		public commitment?: (waproto.ICompanionCommitment|null)
		public static encode(m: waproto.IProloguePayload, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ProloguePayload
	}
	interface IPushname {
		id?: (string|null)
		pushname?: (string|null)
	}
	class Pushname implements IPushname {
		constructor(p?: waproto.IPushname)
		public id?: (string|null)
		public pushname?: (string|null)
		public static encode(m: waproto.IPushname, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Pushname
	}
	interface IQuarantinedMessage {
		originalData?: (Uint8Array|null)
		extractedText?: (string|null)
	}
	class QuarantinedMessage implements IQuarantinedMessage {
		constructor(p?: waproto.IQuarantinedMessage)
		public originalData?: (Uint8Array|null)
		public extractedText?: (string|null)
		public static encode(m: waproto.IQuarantinedMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.QuarantinedMessage
	}
	interface IReaction {
		key?: (waproto.IMessageKey|null)
		text?: (string|null)
		groupingKey?: (string|null)
		senderTimestampMs?: (number|Long|null)
		unread?: (boolean|null)
	}
	class Reaction implements IReaction {
		constructor(p?: waproto.IReaction)
		public key?: (waproto.IMessageKey|null)
		public text?: (string|null)
		public groupingKey?: (string|null)
		public senderTimestampMs?: (number|Long|null)
		public unread?: (boolean|null)
		public static encode(m: waproto.IReaction, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Reaction
	}
	interface IRecentEmojiWeight {
		emoji?: (string|null)
		weight?: (number|null)
	}
	class RecentEmojiWeight implements IRecentEmojiWeight {
		constructor(p?: waproto.IRecentEmojiWeight)
		public emoji?: (string|null)
		public weight?: (number|null)
		public static encode(m: waproto.IRecentEmojiWeight, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.RecentEmojiWeight
	}
	interface IRecordStructure {
		currentSession?: (waproto.ISessionStructure|null)
		previousSessions?: (waproto.ISessionStructure[]|null)
	}
	class RecordStructure implements IRecordStructure {
		constructor(p?: waproto.IRecordStructure)
		public currentSession?: (waproto.ISessionStructure|null)
		public previousSessions: waproto.ISessionStructure[]
		public static encode(m: waproto.IRecordStructure, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.RecordStructure
	}
	interface IReportable {
		minVersion?: (number|null)
		maxVersion?: (number|null)
		notReportableMinVersion?: (number|null)
		never?: (boolean|null)
	}
	class Reportable implements IReportable {
		constructor(p?: waproto.IReportable)
		public minVersion?: (number|null)
		public maxVersion?: (number|null)
		public notReportableMinVersion?: (number|null)
		public never?: (boolean|null)
		public static encode(m: waproto.IReportable, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.Reportable
	}
	interface IReportingTokenInfo {
		reportingTag?: (Uint8Array|null)
	}
	class ReportingTokenInfo implements IReportingTokenInfo {
		constructor(p?: waproto.IReportingTokenInfo)
		public reportingTag?: (Uint8Array|null)
		public static encode(m: waproto.IReportingTokenInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ReportingTokenInfo
	}
	interface ISenderKeyDistributionMessage {
		id?: (number|null)
		iteration?: (number|null)
		chainKey?: (Uint8Array|null)
		signingKey?: (Uint8Array|null)
	}
	class SenderKeyDistributionMessage implements ISenderKeyDistributionMessage {
		constructor(p?: waproto.ISenderKeyDistributionMessage)
		public id?: (number|null)
		public iteration?: (number|null)
		public chainKey?: (Uint8Array|null)
		public signingKey?: (Uint8Array|null)
		public static encode(m: waproto.ISenderKeyDistributionMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyDistributionMessage
	}
	interface ISenderKeyMessage {
		id?: (number|null)
		iteration?: (number|null)
		ciphertext?: (Uint8Array|null)
	}
	class SenderKeyMessage implements ISenderKeyMessage {
		constructor(p?: waproto.ISenderKeyMessage)
		public id?: (number|null)
		public iteration?: (number|null)
		public ciphertext?: (Uint8Array|null)
		public static encode(m: waproto.ISenderKeyMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyMessage
	}
	interface ISenderKeyRecordStructure {
		senderKeyStates?: (waproto.ISenderKeyStateStructure[]|null)
	}
	class SenderKeyRecordStructure implements ISenderKeyRecordStructure {
		constructor(p?: waproto.ISenderKeyRecordStructure)
		public senderKeyStates: waproto.ISenderKeyStateStructure[]
		public static encode(m: waproto.ISenderKeyRecordStructure, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyRecordStructure
	}
	interface ISenderKeyStateStructure {
		senderKeyId?: (number|null)
		senderChainKey?: (waproto.SenderKeyStateStructure.ISenderChainKey|null)
		senderSigningKey?: (waproto.SenderKeyStateStructure.ISenderSigningKey|null)
		senderMessageKeys?: (waproto.SenderKeyStateStructure.ISenderMessageKey[]|null)
	}
	class SenderKeyStateStructure implements ISenderKeyStateStructure {
		constructor(p?: waproto.ISenderKeyStateStructure)
		public senderKeyId?: (number|null)
		public senderChainKey?: (waproto.SenderKeyStateStructure.ISenderChainKey|null)
		public senderSigningKey?: (waproto.SenderKeyStateStructure.ISenderSigningKey|null)
		public senderMessageKeys: waproto.SenderKeyStateStructure.ISenderMessageKey[]
		public static encode(m: waproto.ISenderKeyStateStructure, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyStateStructure
	}
	namespace SenderKeyStateStructure {
		interface ISenderChainKey {
			iteration?: (number|null)
			seed?: (Uint8Array|null)
		}
		class SenderChainKey implements ISenderChainKey {
			constructor(p?: waproto.SenderKeyStateStructure.ISenderChainKey)
			public iteration?: (number|null)
			public seed?: (Uint8Array|null)
			public static encode(m: waproto.SenderKeyStateStructure.ISenderChainKey, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyStateStructure.SenderChainKey
		}
		interface ISenderMessageKey {
			iteration?: (number|null)
			seed?: (Uint8Array|null)
		}
		class SenderMessageKey implements ISenderMessageKey {
			constructor(p?: waproto.SenderKeyStateStructure.ISenderMessageKey)
			public iteration?: (number|null)
			public seed?: (Uint8Array|null)
			public static encode(m: waproto.SenderKeyStateStructure.ISenderMessageKey, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyStateStructure.SenderMessageKey
		}
		interface ISenderSigningKey {
			"public"?: (Uint8Array|null)
			"private"?: (Uint8Array|null)
		}
		class SenderSigningKey implements ISenderSigningKey {
			constructor(p?: waproto.SenderKeyStateStructure.ISenderSigningKey)
			public public?: (Uint8Array|null)
			public private?: (Uint8Array|null)
			public static encode(m: waproto.SenderKeyStateStructure.ISenderSigningKey, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SenderKeyStateStructure.SenderSigningKey
		}
	}
	interface IServerErrorReceipt {
		stanzaId?: (string|null)
	}
	class ServerErrorReceipt implements IServerErrorReceipt {
		constructor(p?: waproto.IServerErrorReceipt)
		public stanzaId?: (string|null)
		public static encode(m: waproto.IServerErrorReceipt, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ServerErrorReceipt
	}
	interface ISessionStructure {
		sessionVersion?: (number|null)
		localIdentityPublic?: (Uint8Array|null)
		remoteIdentityPublic?: (Uint8Array|null)
		rootKey?: (Uint8Array|null)
		previousCounter?: (number|null)
		senderChain?: (waproto.SessionStructure.IChain|null)
		receiverChains?: (waproto.SessionStructure.IChain[]|null)
		pendingKeyExchange?: (waproto.SessionStructure.IPendingKeyExchange|null)
		pendingPreKey?: (waproto.SessionStructure.IPendingPreKey|null)
		remoteRegistrationId?: (number|null)
		localRegistrationId?: (number|null)
		needsRefresh?: (boolean|null)
		aliceBaseKey?: (Uint8Array|null)
	}
	class SessionStructure implements ISessionStructure {
		constructor(p?: waproto.ISessionStructure)
		public sessionVersion?: (number|null)
		public localIdentityPublic?: (Uint8Array|null)
		public remoteIdentityPublic?: (Uint8Array|null)
		public rootKey?: (Uint8Array|null)
		public previousCounter?: (number|null)
		public senderChain?: (waproto.SessionStructure.IChain|null)
		public receiverChains: waproto.SessionStructure.IChain[]
		public pendingKeyExchange?: (waproto.SessionStructure.IPendingKeyExchange|null)
		public pendingPreKey?: (waproto.SessionStructure.IPendingPreKey|null)
		public remoteRegistrationId?: (number|null)
		public localRegistrationId?: (number|null)
		public needsRefresh?: (boolean|null)
		public aliceBaseKey?: (Uint8Array|null)
		public static encode(m: waproto.ISessionStructure, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionStructure
	}
	namespace SessionStructure {
		interface IChain {
			senderRatchetKey?: (Uint8Array|null)
			senderRatchetKeyPrivate?: (Uint8Array|null)
			chainKey?: (waproto.SessionStructure.Chain.IChainKey|null)
			messageKeys?: (waproto.SessionStructure.Chain.IMessageKey[]|null)
		}
		class Chain implements IChain {
			constructor(p?: waproto.SessionStructure.IChain)
			public senderRatchetKey?: (Uint8Array|null)
			public senderRatchetKeyPrivate?: (Uint8Array|null)
			public chainKey?: (waproto.SessionStructure.Chain.IChainKey|null)
			public messageKeys: waproto.SessionStructure.Chain.IMessageKey[]
			public static encode(m: waproto.SessionStructure.IChain, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionStructure.Chain
		}
		namespace Chain {
			interface IChainKey {
				index?: (number|null)
				key?: (Uint8Array|null)
			}
			class ChainKey implements IChainKey {
				constructor(p?: waproto.SessionStructure.Chain.IChainKey)
				public index?: (number|null)
				public key?: (Uint8Array|null)
				public static encode(m: waproto.SessionStructure.Chain.IChainKey, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionStructure.Chain.ChainKey
			}
			interface IMessageKey {
				index?: (number|null)
				cipherKey?: (Uint8Array|null)
				macKey?: (Uint8Array|null)
				iv?: (Uint8Array|null)
			}
			class MessageKey implements IMessageKey {
				constructor(p?: waproto.SessionStructure.Chain.IMessageKey)
				public index?: (number|null)
				public cipherKey?: (Uint8Array|null)
				public macKey?: (Uint8Array|null)
				public iv?: (Uint8Array|null)
				public static encode(m: waproto.SessionStructure.Chain.IMessageKey, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionStructure.Chain.MessageKey
			}
		}
		interface IPendingKeyExchange {
			sequence?: (number|null)
			localBaseKey?: (Uint8Array|null)
			localBaseKeyPrivate?: (Uint8Array|null)
			localRatchetKey?: (Uint8Array|null)
			localRatchetKeyPrivate?: (Uint8Array|null)
			localIdentityKey?: (Uint8Array|null)
			localIdentityKeyPrivate?: (Uint8Array|null)
		}
		class PendingKeyExchange implements IPendingKeyExchange {
			constructor(p?: waproto.SessionStructure.IPendingKeyExchange)
			public sequence?: (number|null)
			public localBaseKey?: (Uint8Array|null)
			public localBaseKeyPrivate?: (Uint8Array|null)
			public localRatchetKey?: (Uint8Array|null)
			public localRatchetKeyPrivate?: (Uint8Array|null)
			public localIdentityKey?: (Uint8Array|null)
			public localIdentityKeyPrivate?: (Uint8Array|null)
			public static encode(m: waproto.SessionStructure.IPendingKeyExchange, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionStructure.PendingKeyExchange
		}
		interface IPendingPreKey {
			preKeyId?: (number|null)
			signedPreKeyId?: (number|null)
			baseKey?: (Uint8Array|null)
		}
		class PendingPreKey implements IPendingPreKey {
			constructor(p?: waproto.SessionStructure.IPendingPreKey)
			public preKeyId?: (number|null)
			public signedPreKeyId?: (number|null)
			public baseKey?: (Uint8Array|null)
			public static encode(m: waproto.SessionStructure.IPendingPreKey, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionStructure.PendingPreKey
		}
	}
	interface ISessionTransparencyMetadata {
		disclaimerText?: (string|null)
		hcaId?: (string|null)
		sessionTransparencyType?: (waproto.SessionTransparencyType|null)
	}
	class SessionTransparencyMetadata implements ISessionTransparencyMetadata {
		constructor(p?: waproto.ISessionTransparencyMetadata)
		public disclaimerText?: (string|null)
		public hcaId?: (string|null)
		public sessionTransparencyType?: (waproto.SessionTransparencyType|null)
		public static encode(m: waproto.ISessionTransparencyMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SessionTransparencyMetadata
	}
	enum SessionTransparencyType {
		UNKNOWN_TYPE = 0,
		NY_AI_SAFETY_DISCLAIMER = 1
	}
	interface ISignalMessage {
		ratchetKey?: (Uint8Array|null)
		counter?: (number|null)
		previousCounter?: (number|null)
		ciphertext?: (Uint8Array|null)
	}
	class SignalMessage implements ISignalMessage {
		constructor(p?: waproto.ISignalMessage)
		public ratchetKey?: (Uint8Array|null)
		public counter?: (number|null)
		public previousCounter?: (number|null)
		public ciphertext?: (Uint8Array|null)
		public static encode(m: waproto.ISignalMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SignalMessage
	}
	interface ISignedPreKeyRecordStructure {
		id?: (number|null)
		publicKey?: (Uint8Array|null)
		privateKey?: (Uint8Array|null)
		signature?: (Uint8Array|null)
		timestamp?: (number|Long|null)
	}
	class SignedPreKeyRecordStructure implements ISignedPreKeyRecordStructure {
		constructor(p?: waproto.ISignedPreKeyRecordStructure)
		public id?: (number|null)
		public publicKey?: (Uint8Array|null)
		public privateKey?: (Uint8Array|null)
		public signature?: (Uint8Array|null)
		public timestamp?: (number|Long|null)
		public static encode(m: waproto.ISignedPreKeyRecordStructure, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SignedPreKeyRecordStructure
	}
	interface IStatusAttribution {
		type?: (waproto.StatusAttribution.Type|null)
		actionUrl?: (string|null)
		statusReshare?: (waproto.StatusAttribution.IStatusReshare|null)
		externalShare?: (waproto.StatusAttribution.IExternalShare|null)
		music?: (waproto.StatusAttribution.IMusic|null)
		groupStatus?: (waproto.StatusAttribution.IGroupStatus|null)
		rlAttribution?: (waproto.StatusAttribution.IRLAttribution|null)
		aiCreatedAttribution?: (waproto.StatusAttribution.IAiCreatedAttribution|null)
	}
	class StatusAttribution implements IStatusAttribution {
		constructor(p?: waproto.IStatusAttribution)
		public type?: (waproto.StatusAttribution.Type|null)
		public actionUrl?: (string|null)
		public statusReshare?: (waproto.StatusAttribution.IStatusReshare|null)
		public externalShare?: (waproto.StatusAttribution.IExternalShare|null)
		public music?: (waproto.StatusAttribution.IMusic|null)
		public groupStatus?: (waproto.StatusAttribution.IGroupStatus|null)
		public rlAttribution?: (waproto.StatusAttribution.IRLAttribution|null)
		public aiCreatedAttribution?: (waproto.StatusAttribution.IAiCreatedAttribution|null)
		public attributionData?: ("statusReshare"|"externalShare"|"music"|"groupStatus"|"rlAttribution"|"aiCreatedAttribution")
		public static encode(m: waproto.IStatusAttribution, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution
	}
	namespace StatusAttribution {
		interface IAiCreatedAttribution {
			source?: (waproto.StatusAttribution.AiCreatedAttribution.Source|null)
		}
		class AiCreatedAttribution implements IAiCreatedAttribution {
			constructor(p?: waproto.StatusAttribution.IAiCreatedAttribution)
			public source?: (waproto.StatusAttribution.AiCreatedAttribution.Source|null)
			public static encode(m: waproto.StatusAttribution.IAiCreatedAttribution, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.AiCreatedAttribution
		}
		namespace AiCreatedAttribution {
			enum Source {
				UNKNOWN = 0,
				STATUS_MIMICRY = 1
			}
		}
		interface IExternalShare {
			actionUrl?: (string|null)
			source?: (waproto.StatusAttribution.ExternalShare.Source|null)
			duration?: (number|null)
			actionFallbackUrl?: (string|null)
		}
		class ExternalShare implements IExternalShare {
			constructor(p?: waproto.StatusAttribution.IExternalShare)
			public actionUrl?: (string|null)
			public source?: (waproto.StatusAttribution.ExternalShare.Source|null)
			public duration?: (number|null)
			public actionFallbackUrl?: (string|null)
			public static encode(m: waproto.StatusAttribution.IExternalShare, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.ExternalShare
		}
		namespace ExternalShare {
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
				GOOGLE_PHOTOS = 10
			}
		}
		interface IGroupStatus {
			authorJid?: (string|null)
		}
		class GroupStatus implements IGroupStatus {
			constructor(p?: waproto.StatusAttribution.IGroupStatus)
			public authorJid?: (string|null)
			public static encode(m: waproto.StatusAttribution.IGroupStatus, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.GroupStatus
		}
		interface IMusic {
			authorName?: (string|null)
			songId?: (string|null)
			title?: (string|null)
			author?: (string|null)
			artistAttribution?: (string|null)
			isExplicit?: (boolean|null)
		}
		class Music implements IMusic {
			constructor(p?: waproto.StatusAttribution.IMusic)
			public authorName?: (string|null)
			public songId?: (string|null)
			public title?: (string|null)
			public author?: (string|null)
			public artistAttribution?: (string|null)
			public isExplicit?: (boolean|null)
			public static encode(m: waproto.StatusAttribution.IMusic, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.Music
		}
		interface IRLAttribution {
			source?: (waproto.StatusAttribution.RLAttribution.Source|null)
		}
		class RLAttribution implements IRLAttribution {
			constructor(p?: waproto.StatusAttribution.IRLAttribution)
			public source?: (waproto.StatusAttribution.RLAttribution.Source|null)
			public static encode(m: waproto.StatusAttribution.IRLAttribution, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.RLAttribution
		}
		namespace RLAttribution {
			enum Source {
				UNKNOWN = 0,
				RAY_BAN_META_GLASSES = 1,
				OAKLEY_META_GLASSES = 2,
				HYPERNOVA_GLASSES = 3
			}
		}
		interface IStatusReshare {
			source?: (waproto.StatusAttribution.StatusReshare.Source|null)
			metadata?: (waproto.StatusAttribution.StatusReshare.IMetadata|null)
		}
		class StatusReshare implements IStatusReshare {
			constructor(p?: waproto.StatusAttribution.IStatusReshare)
			public source?: (waproto.StatusAttribution.StatusReshare.Source|null)
			public metadata?: (waproto.StatusAttribution.StatusReshare.IMetadata|null)
			public static encode(m: waproto.StatusAttribution.IStatusReshare, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.StatusReshare
		}
		namespace StatusReshare {
			interface IMetadata {
				duration?: (number|null)
				channelJid?: (string|null)
				channelMessageId?: (number|null)
				hasMultipleReshares?: (boolean|null)
			}
			class Metadata implements IMetadata {
				constructor(p?: waproto.StatusAttribution.StatusReshare.IMetadata)
				public duration?: (number|null)
				public channelJid?: (string|null)
				public channelMessageId?: (number|null)
				public hasMultipleReshares?: (boolean|null)
				public static encode(m: waproto.StatusAttribution.StatusReshare.IMetadata, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusAttribution.StatusReshare.Metadata
			}
			enum Source {
				UNKNOWN = 0,
				INTERNAL_RESHARE = 1,
				MENTION_RESHARE = 2,
				CHANNEL_RESHARE = 3,
				FORWARD = 4
			}
		}
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
			STATUS_CLOSE_SHARING = 10
		}
	}
	interface IStatusMentionMessage {
		quotedStatus?: (waproto.IMessage|null)
	}
	class StatusMentionMessage implements IStatusMentionMessage {
		constructor(p?: waproto.IStatusMentionMessage)
		public quotedStatus?: (waproto.IMessage|null)
		public static encode(m: waproto.IStatusMentionMessage, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusMentionMessage
	}
	interface IStatusPSA {
		campaignId?: (number|Long|null)
		campaignExpirationTimestamp?: (number|Long|null)
	}
	class StatusPSA implements IStatusPSA {
		constructor(p?: waproto.IStatusPSA)
		public campaignId?: (number|Long|null)
		public campaignExpirationTimestamp?: (number|Long|null)
		public static encode(m: waproto.IStatusPSA, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.StatusPSA
	}
	interface IStickerMetadata {
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
	}
	class StickerMetadata implements IStickerMetadata {
		constructor(p?: waproto.IStickerMetadata)
		public url?: (string|null)
		public fileSha256?: (Uint8Array|null)
		public fileEncSha256?: (Uint8Array|null)
		public mediaKey?: (Uint8Array|null)
		public mimetype?: (string|null)
		public height?: (number|null)
		public width?: (number|null)
		public directPath?: (string|null)
		public fileLength?: (number|Long|null)
		public weight?: (number|null)
		public lastStickerSentTs?: (number|Long|null)
		public isLottie?: (boolean|null)
		public imageHash?: (string|null)
		public isAvatarSticker?: (boolean|null)
		public static encode(m: waproto.IStickerMetadata, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.StickerMetadata
	}
	interface ISyncActionData {
		index?: (Uint8Array|null)
		value?: (waproto.ISyncActionValue|null)
		padding?: (Uint8Array|null)
		version?: (number|null)
	}
	class SyncActionData implements ISyncActionData {
		constructor(p?: waproto.ISyncActionData)
		public index?: (Uint8Array|null)
		public value?: (waproto.ISyncActionValue|null)
		public padding?: (Uint8Array|null)
		public version?: (number|null)
		public static encode(m: waproto.ISyncActionData, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionData
	}
	interface ISyncActionValue {
		timestamp?: (number|Long|null)
		starAction?: (waproto.SyncActionValue.IStarAction|null)
		contactAction?: (waproto.SyncActionValue.IContactAction|null)
		muteAction?: (waproto.SyncActionValue.IMuteAction|null)
		pinAction?: (waproto.SyncActionValue.IPinAction|null)
		pushNameSetting?: (waproto.SyncActionValue.IPushNameSetting|null)
		quickReplyAction?: (waproto.SyncActionValue.IQuickReplyAction|null)
		recentEmojiWeightsAction?: (waproto.SyncActionValue.IRecentEmojiWeightsAction|null)
		labelEditAction?: (waproto.SyncActionValue.ILabelEditAction|null)
		labelAssociationAction?: (waproto.SyncActionValue.ILabelAssociationAction|null)
		localeSetting?: (waproto.SyncActionValue.ILocaleSetting|null)
		archiveChatAction?: (waproto.SyncActionValue.IArchiveChatAction|null)
		deleteMessageForMeAction?: (waproto.SyncActionValue.IDeleteMessageForMeAction|null)
		keyExpiration?: (waproto.SyncActionValue.IKeyExpiration|null)
		markChatAsReadAction?: (waproto.SyncActionValue.IMarkChatAsReadAction|null)
		clearChatAction?: (waproto.SyncActionValue.IClearChatAction|null)
		deleteChatAction?: (waproto.SyncActionValue.IDeleteChatAction|null)
		unarchiveChatsSetting?: (waproto.SyncActionValue.IUnarchiveChatsSetting|null)
		primaryFeature?: (waproto.SyncActionValue.IPrimaryFeature|null)
		androidUnsupportedActions?: (waproto.SyncActionValue.IAndroidUnsupportedActions|null)
		agentAction?: (waproto.SyncActionValue.IAgentAction|null)
		subscriptionAction?: (waproto.SyncActionValue.ISubscriptionAction|null)
		userStatusMuteAction?: (waproto.SyncActionValue.IUserStatusMuteAction|null)
		timeFormatAction?: (waproto.SyncActionValue.ITimeFormatAction|null)
		nuxAction?: (waproto.SyncActionValue.INuxAction|null)
		primaryVersionAction?: (waproto.SyncActionValue.IPrimaryVersionAction|null)
		stickerAction?: (waproto.SyncActionValue.IStickerAction|null)
		removeRecentStickerAction?: (waproto.SyncActionValue.IRemoveRecentStickerAction|null)
		chatAssignment?: (waproto.SyncActionValue.IChatAssignmentAction|null)
		chatAssignmentOpenedStatus?: (waproto.SyncActionValue.IChatAssignmentOpenedStatusAction|null)
		pnForLidChatAction?: (waproto.SyncActionValue.IPnForLidChatAction|null)
		marketingMessageAction?: (waproto.SyncActionValue.IMarketingMessageAction|null)
		marketingMessageBroadcastAction?: (waproto.SyncActionValue.IMarketingMessageBroadcastAction|null)
		externalWebBetaAction?: (waproto.SyncActionValue.IExternalWebBetaAction|null)
		privacySettingRelayAllCalls?: (waproto.SyncActionValue.IPrivacySettingRelayAllCalls|null)
		callLogAction?: (waproto.SyncActionValue.ICallLogAction|null)
		ugcBot?: (waproto.SyncActionValue.IUGCBot|null)
		statusPrivacy?: (waproto.SyncActionValue.IStatusPrivacyAction|null)
		botWelcomeRequestAction?: (waproto.SyncActionValue.IBotWelcomeRequestAction|null)
		deleteIndividualCallLog?: (waproto.SyncActionValue.IDeleteIndividualCallLogAction|null)
		labelReorderingAction?: (waproto.SyncActionValue.ILabelReorderingAction|null)
		paymentInfoAction?: (waproto.SyncActionValue.IPaymentInfoAction|null)
		customPaymentMethodsAction?: (waproto.SyncActionValue.ICustomPaymentMethodsAction|null)
		lockChatAction?: (waproto.SyncActionValue.ILockChatAction|null)
		chatLockSettings?: (waproto.IChatLockSettings|null)
		wamoUserIdentifierAction?: (waproto.SyncActionValue.IWamoUserIdentifierAction|null)
		privacySettingDisableLinkPreviewsAction?: (waproto.SyncActionValue.IPrivacySettingDisableLinkPreviewsAction|null)
		deviceCapabilities?: (waproto.IDeviceCapabilities|null)
		noteEditAction?: (waproto.SyncActionValue.INoteEditAction|null)
		favoritesAction?: (waproto.SyncActionValue.IFavoritesAction|null)
		merchantPaymentPartnerAction?: (waproto.SyncActionValue.IMerchantPaymentPartnerAction|null)
		waffleAccountLinkStateAction?: (waproto.SyncActionValue.IWaffleAccountLinkStateAction|null)
		usernameChatStartMode?: (waproto.SyncActionValue.IUsernameChatStartModeAction|null)
		notificationActivitySettingAction?: (waproto.SyncActionValue.INotificationActivitySettingAction|null)
		lidContactAction?: (waproto.SyncActionValue.ILidContactAction|null)
		ctwaPerCustomerDataSharingAction?: (waproto.SyncActionValue.ICtwaPerCustomerDataSharingAction|null)
		paymentTosAction?: (waproto.SyncActionValue.IPaymentTosAction|null)
		privacySettingChannelsPersonalisedRecommendationAction?: (waproto.SyncActionValue.IPrivacySettingChannelsPersonalisedRecommendationAction|null)
		detectedOutcomesStatusAction?: (waproto.SyncActionValue.IDetectedOutcomesStatusAction|null)
		maibaAiFeaturesControlAction?: (waproto.SyncActionValue.IMaibaAIFeaturesControlAction|null)
		businessBroadcastListAction?: (waproto.SyncActionValue.IBusinessBroadcastListAction|null)
		musicUserIdAction?: (waproto.SyncActionValue.IMusicUserIdAction|null)
		statusPostOptInNotificationPreferencesAction?: (waproto.SyncActionValue.IStatusPostOptInNotificationPreferencesAction|null)
		avatarUpdatedAction?: (waproto.SyncActionValue.IAvatarUpdatedAction|null)
		privateProcessingSettingAction?: (waproto.SyncActionValue.IPrivateProcessingSettingAction|null)
		newsletterSavedInterestsAction?: (waproto.SyncActionValue.INewsletterSavedInterestsAction|null)
		aiThreadRenameAction?: (waproto.SyncActionValue.IAiThreadRenameAction|null)
		interactiveMessageAction?: (waproto.SyncActionValue.IInteractiveMessageAction|null)
		settingsSyncAction?: (waproto.SyncActionValue.ISettingsSyncAction|null)
		outContactAction?: (waproto.SyncActionValue.IOutContactAction|null)
		nctSaltSyncAction?: (waproto.SyncActionValue.INctSaltSyncAction|null)
		businessBroadcastCampaignAction?: (waproto.SyncActionValue.IBusinessBroadcastCampaignAction|null)
		businessBroadcastInsightsAction?: (waproto.SyncActionValue.IBusinessBroadcastInsightsAction|null)
		customerDataAction?: (waproto.SyncActionValue.ICustomerDataAction|null)
	}
	class SyncActionValue implements ISyncActionValue {
		constructor(p?: waproto.ISyncActionValue)
		public timestamp?: (number|Long|null)
		public starAction?: (waproto.SyncActionValue.IStarAction|null)
		public contactAction?: (waproto.SyncActionValue.IContactAction|null)
		public muteAction?: (waproto.SyncActionValue.IMuteAction|null)
		public pinAction?: (waproto.SyncActionValue.IPinAction|null)
		public pushNameSetting?: (waproto.SyncActionValue.IPushNameSetting|null)
		public quickReplyAction?: (waproto.SyncActionValue.IQuickReplyAction|null)
		public recentEmojiWeightsAction?: (waproto.SyncActionValue.IRecentEmojiWeightsAction|null)
		public labelEditAction?: (waproto.SyncActionValue.ILabelEditAction|null)
		public labelAssociationAction?: (waproto.SyncActionValue.ILabelAssociationAction|null)
		public localeSetting?: (waproto.SyncActionValue.ILocaleSetting|null)
		public archiveChatAction?: (waproto.SyncActionValue.IArchiveChatAction|null)
		public deleteMessageForMeAction?: (waproto.SyncActionValue.IDeleteMessageForMeAction|null)
		public keyExpiration?: (waproto.SyncActionValue.IKeyExpiration|null)
		public markChatAsReadAction?: (waproto.SyncActionValue.IMarkChatAsReadAction|null)
		public clearChatAction?: (waproto.SyncActionValue.IClearChatAction|null)
		public deleteChatAction?: (waproto.SyncActionValue.IDeleteChatAction|null)
		public unarchiveChatsSetting?: (waproto.SyncActionValue.IUnarchiveChatsSetting|null)
		public primaryFeature?: (waproto.SyncActionValue.IPrimaryFeature|null)
		public androidUnsupportedActions?: (waproto.SyncActionValue.IAndroidUnsupportedActions|null)
		public agentAction?: (waproto.SyncActionValue.IAgentAction|null)
		public subscriptionAction?: (waproto.SyncActionValue.ISubscriptionAction|null)
		public userStatusMuteAction?: (waproto.SyncActionValue.IUserStatusMuteAction|null)
		public timeFormatAction?: (waproto.SyncActionValue.ITimeFormatAction|null)
		public nuxAction?: (waproto.SyncActionValue.INuxAction|null)
		public primaryVersionAction?: (waproto.SyncActionValue.IPrimaryVersionAction|null)
		public stickerAction?: (waproto.SyncActionValue.IStickerAction|null)
		public removeRecentStickerAction?: (waproto.SyncActionValue.IRemoveRecentStickerAction|null)
		public chatAssignment?: (waproto.SyncActionValue.IChatAssignmentAction|null)
		public chatAssignmentOpenedStatus?: (waproto.SyncActionValue.IChatAssignmentOpenedStatusAction|null)
		public pnForLidChatAction?: (waproto.SyncActionValue.IPnForLidChatAction|null)
		public marketingMessageAction?: (waproto.SyncActionValue.IMarketingMessageAction|null)
		public marketingMessageBroadcastAction?: (waproto.SyncActionValue.IMarketingMessageBroadcastAction|null)
		public externalWebBetaAction?: (waproto.SyncActionValue.IExternalWebBetaAction|null)
		public privacySettingRelayAllCalls?: (waproto.SyncActionValue.IPrivacySettingRelayAllCalls|null)
		public callLogAction?: (waproto.SyncActionValue.ICallLogAction|null)
		public ugcBot?: (waproto.SyncActionValue.IUGCBot|null)
		public statusPrivacy?: (waproto.SyncActionValue.IStatusPrivacyAction|null)
		public botWelcomeRequestAction?: (waproto.SyncActionValue.IBotWelcomeRequestAction|null)
		public deleteIndividualCallLog?: (waproto.SyncActionValue.IDeleteIndividualCallLogAction|null)
		public labelReorderingAction?: (waproto.SyncActionValue.ILabelReorderingAction|null)
		public paymentInfoAction?: (waproto.SyncActionValue.IPaymentInfoAction|null)
		public customPaymentMethodsAction?: (waproto.SyncActionValue.ICustomPaymentMethodsAction|null)
		public lockChatAction?: (waproto.SyncActionValue.ILockChatAction|null)
		public chatLockSettings?: (waproto.IChatLockSettings|null)
		public wamoUserIdentifierAction?: (waproto.SyncActionValue.IWamoUserIdentifierAction|null)
		public privacySettingDisableLinkPreviewsAction?: (waproto.SyncActionValue.IPrivacySettingDisableLinkPreviewsAction|null)
		public deviceCapabilities?: (waproto.IDeviceCapabilities|null)
		public noteEditAction?: (waproto.SyncActionValue.INoteEditAction|null)
		public favoritesAction?: (waproto.SyncActionValue.IFavoritesAction|null)
		public merchantPaymentPartnerAction?: (waproto.SyncActionValue.IMerchantPaymentPartnerAction|null)
		public waffleAccountLinkStateAction?: (waproto.SyncActionValue.IWaffleAccountLinkStateAction|null)
		public usernameChatStartMode?: (waproto.SyncActionValue.IUsernameChatStartModeAction|null)
		public notificationActivitySettingAction?: (waproto.SyncActionValue.INotificationActivitySettingAction|null)
		public lidContactAction?: (waproto.SyncActionValue.ILidContactAction|null)
		public ctwaPerCustomerDataSharingAction?: (waproto.SyncActionValue.ICtwaPerCustomerDataSharingAction|null)
		public paymentTosAction?: (waproto.SyncActionValue.IPaymentTosAction|null)
		public privacySettingChannelsPersonalisedRecommendationAction?: (waproto.SyncActionValue.IPrivacySettingChannelsPersonalisedRecommendationAction|null)
		public detectedOutcomesStatusAction?: (waproto.SyncActionValue.IDetectedOutcomesStatusAction|null)
		public maibaAiFeaturesControlAction?: (waproto.SyncActionValue.IMaibaAIFeaturesControlAction|null)
		public businessBroadcastListAction?: (waproto.SyncActionValue.IBusinessBroadcastListAction|null)
		public musicUserIdAction?: (waproto.SyncActionValue.IMusicUserIdAction|null)
		public statusPostOptInNotificationPreferencesAction?: (waproto.SyncActionValue.IStatusPostOptInNotificationPreferencesAction|null)
		public avatarUpdatedAction?: (waproto.SyncActionValue.IAvatarUpdatedAction|null)
		public privateProcessingSettingAction?: (waproto.SyncActionValue.IPrivateProcessingSettingAction|null)
		public newsletterSavedInterestsAction?: (waproto.SyncActionValue.INewsletterSavedInterestsAction|null)
		public aiThreadRenameAction?: (waproto.SyncActionValue.IAiThreadRenameAction|null)
		public interactiveMessageAction?: (waproto.SyncActionValue.IInteractiveMessageAction|null)
		public settingsSyncAction?: (waproto.SyncActionValue.ISettingsSyncAction|null)
		public outContactAction?: (waproto.SyncActionValue.IOutContactAction|null)
		public nctSaltSyncAction?: (waproto.SyncActionValue.INctSaltSyncAction|null)
		public businessBroadcastCampaignAction?: (waproto.SyncActionValue.IBusinessBroadcastCampaignAction|null)
		public businessBroadcastInsightsAction?: (waproto.SyncActionValue.IBusinessBroadcastInsightsAction|null)
		public customerDataAction?: (waproto.SyncActionValue.ICustomerDataAction|null)
		public static encode(m: waproto.ISyncActionValue, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue
	}
	namespace SyncActionValue {
		interface IAgentAction {
			name?: (string|null)
			deviceID?: (number|null)
			isDeleted?: (boolean|null)
		}
		class AgentAction implements IAgentAction {
			constructor(p?: waproto.SyncActionValue.IAgentAction)
			public name?: (string|null)
			public deviceID?: (number|null)
			public isDeleted?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IAgentAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.AgentAction
		}
		interface IAiThreadRenameAction {
			newTitle?: (string|null)
		}
		class AiThreadRenameAction implements IAiThreadRenameAction {
			constructor(p?: waproto.SyncActionValue.IAiThreadRenameAction)
			public newTitle?: (string|null)
			public static encode(m: waproto.SyncActionValue.IAiThreadRenameAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.AiThreadRenameAction
		}
		interface IAndroidUnsupportedActions {
			allowed?: (boolean|null)
		}
		class AndroidUnsupportedActions implements IAndroidUnsupportedActions {
			constructor(p?: waproto.SyncActionValue.IAndroidUnsupportedActions)
			public allowed?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IAndroidUnsupportedActions, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.AndroidUnsupportedActions
		}
		interface IArchiveChatAction {
			archived?: (boolean|null)
			messageRange?: (waproto.SyncActionValue.ISyncActionMessageRange|null)
		}
		class ArchiveChatAction implements IArchiveChatAction {
			constructor(p?: waproto.SyncActionValue.IArchiveChatAction)
			public archived?: (boolean|null)
			public messageRange?: (waproto.SyncActionValue.ISyncActionMessageRange|null)
			public static encode(m: waproto.SyncActionValue.IArchiveChatAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ArchiveChatAction
		}
		interface IAvatarUpdatedAction {
			eventType?: (waproto.SyncActionValue.AvatarUpdatedAction.AvatarEventType|null)
			recentAvatarStickers?: (waproto.SyncActionValue.IStickerAction[]|null)
		}
		class AvatarUpdatedAction implements IAvatarUpdatedAction {
			constructor(p?: waproto.SyncActionValue.IAvatarUpdatedAction)
			public eventType?: (waproto.SyncActionValue.AvatarUpdatedAction.AvatarEventType|null)
			public recentAvatarStickers: waproto.SyncActionValue.IStickerAction[]
			public static encode(m: waproto.SyncActionValue.IAvatarUpdatedAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.AvatarUpdatedAction
		}
		namespace AvatarUpdatedAction {
			enum AvatarEventType {
				UPDATED = 0,
				CREATED = 1,
				DELETED = 2
			}
		}
		interface IBotWelcomeRequestAction {
			isSent?: (boolean|null)
		}
		class BotWelcomeRequestAction implements IBotWelcomeRequestAction {
			constructor(p?: waproto.SyncActionValue.IBotWelcomeRequestAction)
			public isSent?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IBotWelcomeRequestAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BotWelcomeRequestAction
		}
		interface IBroadcastListParticipant {
			lidJid?: (string|null)
			pnJid?: (string|null)
		}
		class BroadcastListParticipant implements IBroadcastListParticipant {
			constructor(p?: waproto.SyncActionValue.IBroadcastListParticipant)
			public lidJid?: (string|null)
			public pnJid?: (string|null)
			public static encode(m: waproto.SyncActionValue.IBroadcastListParticipant, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BroadcastListParticipant
		}
		interface IBusinessBroadcastAssociationAction {
			deleted?: (boolean|null)
		}
		class BusinessBroadcastAssociationAction implements IBusinessBroadcastAssociationAction {
			constructor(p?: waproto.SyncActionValue.IBusinessBroadcastAssociationAction)
			public deleted?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IBusinessBroadcastAssociationAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BusinessBroadcastAssociationAction
		}
		interface IBusinessBroadcastCampaignAction {
			deviceId?: (number|null)
			adId?: (string|null)
			name?: (string|null)
			msgId?: (string|null)
			broadcastJid?: (string|null)
			reservedQuota?: (number|null)
			scheduledTimestamp?: (number|Long|null)
			createTimestamp?: (number|Long|null)
			status?: (waproto.SyncActionValue.BusinessBroadcastCampaignStatus|null)
		}
		class BusinessBroadcastCampaignAction implements IBusinessBroadcastCampaignAction {
			constructor(p?: waproto.SyncActionValue.IBusinessBroadcastCampaignAction)
			public deviceId?: (number|null)
			public adId?: (string|null)
			public name?: (string|null)
			public msgId?: (string|null)
			public broadcastJid?: (string|null)
			public reservedQuota?: (number|null)
			public scheduledTimestamp?: (number|Long|null)
			public createTimestamp?: (number|Long|null)
			public status?: (waproto.SyncActionValue.BusinessBroadcastCampaignStatus|null)
			public static encode(m: waproto.SyncActionValue.IBusinessBroadcastCampaignAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BusinessBroadcastCampaignAction
		}
		enum BusinessBroadcastCampaignStatus {
			DRAFT = 1,
			SCHEDULED = 2,
			PROCESSING = 3,
			FAILED = 4,
			SENT = 5
		}
		interface IBusinessBroadcastInsightsAction {
			recipientCount?: (number|null)
			deliveredCount?: (number|null)
			readCount?: (number|null)
			repliedCount?: (number|null)
			quickReplyCount?: (number|null)
		}
		class BusinessBroadcastInsightsAction implements IBusinessBroadcastInsightsAction {
			constructor(p?: waproto.SyncActionValue.IBusinessBroadcastInsightsAction)
			public recipientCount?: (number|null)
			public deliveredCount?: (number|null)
			public readCount?: (number|null)
			public repliedCount?: (number|null)
			public quickReplyCount?: (number|null)
			public static encode(m: waproto.SyncActionValue.IBusinessBroadcastInsightsAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BusinessBroadcastInsightsAction
		}
		interface IBusinessBroadcastListAction {
			deleted?: (boolean|null)
			participants?: (waproto.SyncActionValue.IBroadcastListParticipant[]|null)
			listName?: (string|null)
			labelIds?: (string[]|null)
		}
		class BusinessBroadcastListAction implements IBusinessBroadcastListAction {
			constructor(p?: waproto.SyncActionValue.IBusinessBroadcastListAction)
			public deleted?: (boolean|null)
			public participants: waproto.SyncActionValue.IBroadcastListParticipant[]
			public listName?: (string|null)
			public labelIds: string[]
			public static encode(m: waproto.SyncActionValue.IBusinessBroadcastListAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.BusinessBroadcastListAction
		}
		interface ICallLogAction {
			callLogRecord?: (waproto.ICallLogRecord|null)
		}
		class CallLogAction implements ICallLogAction {
			constructor(p?: waproto.SyncActionValue.ICallLogAction)
			public callLogRecord?: (waproto.ICallLogRecord|null)
			public static encode(m: waproto.SyncActionValue.ICallLogAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CallLogAction
		}
		interface IChatAssignmentAction {
			deviceAgentID?: (string|null)
		}
		class ChatAssignmentAction implements IChatAssignmentAction {
			constructor(p?: waproto.SyncActionValue.IChatAssignmentAction)
			public deviceAgentID?: (string|null)
			public static encode(m: waproto.SyncActionValue.IChatAssignmentAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ChatAssignmentAction
		}
		interface IChatAssignmentOpenedStatusAction {
			chatOpened?: (boolean|null)
		}
		class ChatAssignmentOpenedStatusAction implements IChatAssignmentOpenedStatusAction {
			constructor(p?: waproto.SyncActionValue.IChatAssignmentOpenedStatusAction)
			public chatOpened?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IChatAssignmentOpenedStatusAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ChatAssignmentOpenedStatusAction
		}
		interface IClearChatAction {
			messageRange?: (waproto.SyncActionValue.ISyncActionMessageRange|null)
		}
		class ClearChatAction implements IClearChatAction {
			constructor(p?: waproto.SyncActionValue.IClearChatAction)
			public messageRange?: (waproto.SyncActionValue.ISyncActionMessageRange|null)
			public static encode(m: waproto.SyncActionValue.IClearChatAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ClearChatAction
		}
		interface IContactAction {
			fullName?: (string|null)
			firstName?: (string|null)
			lidJid?: (string|null)
			saveOnPrimaryAddressbook?: (boolean|null)
			pnJid?: (string|null)
			username?: (string|null)
		}
		class ContactAction implements IContactAction {
			constructor(p?: waproto.SyncActionValue.IContactAction)
			public fullName?: (string|null)
			public firstName?: (string|null)
			public lidJid?: (string|null)
			public saveOnPrimaryAddressbook?: (boolean|null)
			public pnJid?: (string|null)
			public username?: (string|null)
			public static encode(m: waproto.SyncActionValue.IContactAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ContactAction
		}
		interface ICtwaPerCustomerDataSharingAction {
			isCtwaPerCustomerDataSharingEnabled?: (boolean|null)
		}
		class CtwaPerCustomerDataSharingAction implements ICtwaPerCustomerDataSharingAction {
			constructor(p?: waproto.SyncActionValue.ICtwaPerCustomerDataSharingAction)
			public isCtwaPerCustomerDataSharingEnabled?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.ICtwaPerCustomerDataSharingAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CtwaPerCustomerDataSharingAction
		}
		interface ICustomPaymentMethod {
			credentialId?: (string|null)
			country?: (string|null)
			type?: (string|null)
			metadata?: (waproto.SyncActionValue.ICustomPaymentMethodMetadata[]|null)
		}
		class CustomPaymentMethod implements ICustomPaymentMethod {
			constructor(p?: waproto.SyncActionValue.ICustomPaymentMethod)
			public credentialId?: (string|null)
			public country?: (string|null)
			public type?: (string|null)
			public metadata: waproto.SyncActionValue.ICustomPaymentMethodMetadata[]
			public static encode(m: waproto.SyncActionValue.ICustomPaymentMethod, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CustomPaymentMethod
		}
		interface ICustomPaymentMethodMetadata {
			key?: (string|null)
			value?: (string|null)
		}
		class CustomPaymentMethodMetadata implements ICustomPaymentMethodMetadata {
			constructor(p?: waproto.SyncActionValue.ICustomPaymentMethodMetadata)
			public key?: (string|null)
			public value?: (string|null)
			public static encode(m: waproto.SyncActionValue.ICustomPaymentMethodMetadata, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CustomPaymentMethodMetadata
		}
		interface ICustomPaymentMethodsAction {
			customPaymentMethods?: (waproto.SyncActionValue.ICustomPaymentMethod[]|null)
		}
		class CustomPaymentMethodsAction implements ICustomPaymentMethodsAction {
			constructor(p?: waproto.SyncActionValue.ICustomPaymentMethodsAction)
			public customPaymentMethods: waproto.SyncActionValue.ICustomPaymentMethod[]
			public static encode(m: waproto.SyncActionValue.ICustomPaymentMethodsAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CustomPaymentMethodsAction
		}
		interface ICustomerDataAction {
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
		}
		class CustomerDataAction implements ICustomerDataAction {
			constructor(p?: waproto.SyncActionValue.ICustomerDataAction)
			public chatJid?: (string|null)
			public contactType?: (number|null)
			public email?: (string|null)
			public altPhoneNumbers?: (string|null)
			public birthday?: (number|Long|null)
			public address?: (string|null)
			public acquisitionSource?: (number|null)
			public leadStage?: (number|null)
			public lastOrder?: (number|Long|null)
			public createdAt?: (number|Long|null)
			public modifiedAt?: (number|Long|null)
			public static encode(m: waproto.SyncActionValue.ICustomerDataAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.CustomerDataAction
		}
		interface IDeleteChatAction {
			messageRange?: (waproto.SyncActionValue.ISyncActionMessageRange|null)
		}
		class DeleteChatAction implements IDeleteChatAction {
			constructor(p?: waproto.SyncActionValue.IDeleteChatAction)
			public messageRange?: (waproto.SyncActionValue.ISyncActionMessageRange|null)
			public static encode(m: waproto.SyncActionValue.IDeleteChatAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.DeleteChatAction
		}
		interface IDeleteIndividualCallLogAction {
			peerJid?: (string|null)
			isIncoming?: (boolean|null)
		}
		class DeleteIndividualCallLogAction implements IDeleteIndividualCallLogAction {
			constructor(p?: waproto.SyncActionValue.IDeleteIndividualCallLogAction)
			public peerJid?: (string|null)
			public isIncoming?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IDeleteIndividualCallLogAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.DeleteIndividualCallLogAction
		}
		interface IDeleteMessageForMeAction {
			deleteMedia?: (boolean|null)
			messageTimestamp?: (number|Long|null)
		}
		class DeleteMessageForMeAction implements IDeleteMessageForMeAction {
			constructor(p?: waproto.SyncActionValue.IDeleteMessageForMeAction)
			public deleteMedia?: (boolean|null)
			public messageTimestamp?: (number|Long|null)
			public static encode(m: waproto.SyncActionValue.IDeleteMessageForMeAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.DeleteMessageForMeAction
		}
		interface IDetectedOutcomesStatusAction {
			isEnabled?: (boolean|null)
		}
		class DetectedOutcomesStatusAction implements IDetectedOutcomesStatusAction {
			constructor(p?: waproto.SyncActionValue.IDetectedOutcomesStatusAction)
			public isEnabled?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IDetectedOutcomesStatusAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.DetectedOutcomesStatusAction
		}
		interface IExternalWebBetaAction {
			isOptIn?: (boolean|null)
		}
		class ExternalWebBetaAction implements IExternalWebBetaAction {
			constructor(p?: waproto.SyncActionValue.IExternalWebBetaAction)
			public isOptIn?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IExternalWebBetaAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.ExternalWebBetaAction
		}
		interface IFavoritesAction {
			favorites?: (waproto.SyncActionValue.FavoritesAction.IFavorite[]|null)
		}
		class FavoritesAction implements IFavoritesAction {
			constructor(p?: waproto.SyncActionValue.IFavoritesAction)
			public favorites: waproto.SyncActionValue.FavoritesAction.IFavorite[]
			public static encode(m: waproto.SyncActionValue.IFavoritesAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.FavoritesAction
		}
		namespace FavoritesAction {
			interface IFavorite {
				id?: (string|null)
			}
			class Favorite implements IFavorite {
				constructor(p?: waproto.SyncActionValue.FavoritesAction.IFavorite)
				public id?: (string|null)
				public static encode(m: waproto.SyncActionValue.FavoritesAction.IFavorite, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.FavoritesAction.Favorite
			}
		}
		interface IInteractiveMessageAction {
			type?: (waproto.SyncActionValue.InteractiveMessageAction.InteractiveMessageActionMode|null)
			agmId?: (string|null)
		}
		class InteractiveMessageAction implements IInteractiveMessageAction {
			constructor(p?: waproto.SyncActionValue.IInteractiveMessageAction)
			public type?: (waproto.SyncActionValue.InteractiveMessageAction.InteractiveMessageActionMode|null)
			public agmId?: (string|null)
			public static encode(m: waproto.SyncActionValue.IInteractiveMessageAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.InteractiveMessageAction
		}
		namespace InteractiveMessageAction {
			enum InteractiveMessageActionMode {
				DISABLE_CTA = 1
			}
		}
		interface IKeyExpiration {
			expiredKeyEpoch?: (number|null)
		}
		class KeyExpiration implements IKeyExpiration {
			constructor(p?: waproto.SyncActionValue.IKeyExpiration)
			public expiredKeyEpoch?: (number|null)
			public static encode(m: waproto.SyncActionValue.IKeyExpiration, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.KeyExpiration
		}
		interface ILabelAssociationAction {
			labeled?: (boolean|null)
		}
		class LabelAssociationAction implements ILabelAssociationAction {
			constructor(p?: waproto.SyncActionValue.ILabelAssociationAction)
			public labeled?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.ILabelAssociationAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.LabelAssociationAction
		}
		interface ILabelEditAction {
			name?: (string|null)
			color?: (number|null)
			predefinedId?: (number|null)
			deleted?: (boolean|null)
			orderIndex?: (number|null)
			isActive?: (boolean|null)
			type?: (waproto.SyncActionValue.LabelEditAction.ListType|null)
			isImmutable?: (boolean|null)
			muteEndTimeMs?: (number|Long|null)
		}
		class LabelEditAction implements ILabelEditAction {
			constructor(p?: waproto.SyncActionValue.ILabelEditAction)
			public name?: (string|null)
			public color?: (number|null)
			public predefinedId?: (number|null)
			public deleted?: (boolean|null)
			public orderIndex?: (number|null)
			public isActive?: (boolean|null)
			public type?: (waproto.SyncActionValue.LabelEditAction.ListType|null)
			public isImmutable?: (boolean|null)
			public muteEndTimeMs?: (number|Long|null)
			public static encode(m: waproto.SyncActionValue.ILabelEditAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.LabelEditAction
		}
		namespace LabelEditAction {
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
				CHANNELS = 10
			}
		}
		interface ILabelReorderingAction {
			sortedLabelIds?: (number[]|null)
		}
		class LabelReorderingAction implements ILabelReorderingAction {
			constructor(p?: waproto.SyncActionValue.ILabelReorderingAction)
			public sortedLabelIds: number[]
			public static encode(m: waproto.SyncActionValue.ILabelReorderingAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.LabelReorderingAction
		}
		interface ILidContactAction {
			fullName?: (string|null)
			firstName?: (string|null)
			username?: (string|null)
		}
		class LidContactAction implements ILidContactAction {
			constructor(p?: waproto.SyncActionValue.ILidContactAction)
			public fullName?: (string|null)
			public firstName?: (string|null)
			public username?: (string|null)
			public static encode(m: waproto.SyncActionValue.ILidContactAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.LidContactAction
		}
		interface ILocaleSetting {
			locale?: (string|null)
		}
		class LocaleSetting implements ILocaleSetting {
			constructor(p?: waproto.SyncActionValue.ILocaleSetting)
			public locale?: (string|null)
			public static encode(m: waproto.SyncActionValue.ILocaleSetting, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.LocaleSetting
		}
		interface ILockChatAction {
			locked?: (boolean|null)
		}
		class LockChatAction implements ILockChatAction {
			constructor(p?: waproto.SyncActionValue.ILockChatAction)
			public locked?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.ILockChatAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.LockChatAction
		}
		interface IMaibaAIFeaturesControlAction {
			aiFeatureStatus?: (waproto.SyncActionValue.MaibaAIFeaturesControlAction.MaibaAIFeatureStatus|null)
		}
		class MaibaAIFeaturesControlAction implements IMaibaAIFeaturesControlAction {
			constructor(p?: waproto.SyncActionValue.IMaibaAIFeaturesControlAction)
			public aiFeatureStatus?: (waproto.SyncActionValue.MaibaAIFeaturesControlAction.MaibaAIFeatureStatus|null)
			public static encode(m: waproto.SyncActionValue.IMaibaAIFeaturesControlAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MaibaAIFeaturesControlAction
		}
		namespace MaibaAIFeaturesControlAction {
			enum MaibaAIFeatureStatus {
				ENABLED = 0,
				ENABLED_HAS_LEARNING = 1,
				DISABLED = 2
			}
		}
		interface IMarkChatAsReadAction {
			read?: (boolean|null)
			messageRange?: (waproto.SyncActionValue.ISyncActionMessageRange|null)
		}
		class MarkChatAsReadAction implements IMarkChatAsReadAction {
			constructor(p?: waproto.SyncActionValue.IMarkChatAsReadAction)
			public read?: (boolean|null)
			public messageRange?: (waproto.SyncActionValue.ISyncActionMessageRange|null)
			public static encode(m: waproto.SyncActionValue.IMarkChatAsReadAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MarkChatAsReadAction
		}
		interface IMarketingMessageAction {
			name?: (string|null)
			message?: (string|null)
			type?: (waproto.SyncActionValue.MarketingMessageAction.MarketingMessagePrototypeType|null)
			createdAt?: (number|Long|null)
			lastSentAt?: (number|Long|null)
			isDeleted?: (boolean|null)
			mediaId?: (string|null)
		}
		class MarketingMessageAction implements IMarketingMessageAction {
			constructor(p?: waproto.SyncActionValue.IMarketingMessageAction)
			public name?: (string|null)
			public message?: (string|null)
			public type?: (waproto.SyncActionValue.MarketingMessageAction.MarketingMessagePrototypeType|null)
			public createdAt?: (number|Long|null)
			public lastSentAt?: (number|Long|null)
			public isDeleted?: (boolean|null)
			public mediaId?: (string|null)
			public static encode(m: waproto.SyncActionValue.IMarketingMessageAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MarketingMessageAction
		}
		namespace MarketingMessageAction {
			enum MarketingMessagePrototypeType {
				PERSONALIZED = 0
			}
		}
		interface IMarketingMessageBroadcastAction {
			repliedCount?: (number|null)
		}
		class MarketingMessageBroadcastAction implements IMarketingMessageBroadcastAction {
			constructor(p?: waproto.SyncActionValue.IMarketingMessageBroadcastAction)
			public repliedCount?: (number|null)
			public static encode(m: waproto.SyncActionValue.IMarketingMessageBroadcastAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MarketingMessageBroadcastAction
		}
		interface IMerchantPaymentPartnerAction {
			status?: (waproto.SyncActionValue.MerchantPaymentPartnerAction.Status|null)
			country?: (string|null)
			gatewayName?: (string|null)
			credentialId?: (string|null)
		}
		class MerchantPaymentPartnerAction implements IMerchantPaymentPartnerAction {
			constructor(p?: waproto.SyncActionValue.IMerchantPaymentPartnerAction)
			public status?: (waproto.SyncActionValue.MerchantPaymentPartnerAction.Status|null)
			public country?: (string|null)
			public gatewayName?: (string|null)
			public credentialId?: (string|null)
			public static encode(m: waproto.SyncActionValue.IMerchantPaymentPartnerAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MerchantPaymentPartnerAction
		}
		namespace MerchantPaymentPartnerAction {
			enum Status {
				ACTIVE = 0,
				INACTIVE = 1
			}
		}
		interface IMusicUserIdAction {
			musicUserId?: (string|null)
			musicUserIdMap?: ({ [k: string]: string }|null)
		}
		class MusicUserIdAction implements IMusicUserIdAction {
			constructor(p?: waproto.SyncActionValue.IMusicUserIdAction)
			public musicUserId?: (string|null)
			public musicUserIdMap: { [k: string]: string }
			public static encode(m: waproto.SyncActionValue.IMusicUserIdAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MusicUserIdAction
		}
		interface IMuteAction {
			muted?: (boolean|null)
			muteEndTimestamp?: (number|Long|null)
			autoMuted?: (boolean|null)
			muteEveryoneMentionEndTimestamp?: (number|Long|null)
		}
		class MuteAction implements IMuteAction {
			constructor(p?: waproto.SyncActionValue.IMuteAction)
			public muted?: (boolean|null)
			public muteEndTimestamp?: (number|Long|null)
			public autoMuted?: (boolean|null)
			public muteEveryoneMentionEndTimestamp?: (number|Long|null)
			public static encode(m: waproto.SyncActionValue.IMuteAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.MuteAction
		}
		interface INctSaltSyncAction {
			salt?: (Uint8Array|null)
		}
		class NctSaltSyncAction implements INctSaltSyncAction {
			constructor(p?: waproto.SyncActionValue.INctSaltSyncAction)
			public salt?: (Uint8Array|null)
			public static encode(m: waproto.SyncActionValue.INctSaltSyncAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.NctSaltSyncAction
		}
		interface INewsletterSavedInterestsAction {
			newsletterSavedInterests?: (string|null)
		}
		class NewsletterSavedInterestsAction implements INewsletterSavedInterestsAction {
			constructor(p?: waproto.SyncActionValue.INewsletterSavedInterestsAction)
			public newsletterSavedInterests?: (string|null)
			public static encode(m: waproto.SyncActionValue.INewsletterSavedInterestsAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.NewsletterSavedInterestsAction
		}
		interface INoteEditAction {
			type?: (waproto.SyncActionValue.NoteEditAction.NoteType|null)
			chatJid?: (string|null)
			createdAt?: (number|Long|null)
			deleted?: (boolean|null)
			unstructuredContent?: (string|null)
		}
		class NoteEditAction implements INoteEditAction {
			constructor(p?: waproto.SyncActionValue.INoteEditAction)
			public type?: (waproto.SyncActionValue.NoteEditAction.NoteType|null)
			public chatJid?: (string|null)
			public createdAt?: (number|Long|null)
			public deleted?: (boolean|null)
			public unstructuredContent?: (string|null)
			public static encode(m: waproto.SyncActionValue.INoteEditAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.NoteEditAction
		}
		namespace NoteEditAction {
			enum NoteType {
				UNSTRUCTURED = 1,
				STRUCTURED = 2
			}
		}
		interface INotificationActivitySettingAction {
			notificationActivitySetting?: (waproto.SyncActionValue.NotificationActivitySettingAction.NotificationActivitySetting|null)
		}
		class NotificationActivitySettingAction implements INotificationActivitySettingAction {
			constructor(p?: waproto.SyncActionValue.INotificationActivitySettingAction)
			public notificationActivitySetting?: (waproto.SyncActionValue.NotificationActivitySettingAction.NotificationActivitySetting|null)
			public static encode(m: waproto.SyncActionValue.INotificationActivitySettingAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.NotificationActivitySettingAction
		}
		namespace NotificationActivitySettingAction {
			enum NotificationActivitySetting {
				DEFAULT_ALL_MESSAGES = 0,
				ALL_MESSAGES = 1,
				HIGHLIGHTS = 2,
				DEFAULT_HIGHLIGHTS = 3
			}
		}
		interface INuxAction {
			acknowledged?: (boolean|null)
		}
		class NuxAction implements INuxAction {
			constructor(p?: waproto.SyncActionValue.INuxAction)
			public acknowledged?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.INuxAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.NuxAction
		}
		interface IOutContactAction {
			fullName?: (string|null)
			firstName?: (string|null)
		}
		class OutContactAction implements IOutContactAction {
			constructor(p?: waproto.SyncActionValue.IOutContactAction)
			public fullName?: (string|null)
			public firstName?: (string|null)
			public static encode(m: waproto.SyncActionValue.IOutContactAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.OutContactAction
		}
		interface IPaymentInfoAction {
			cpi?: (string|null)
		}
		class PaymentInfoAction implements IPaymentInfoAction {
			constructor(p?: waproto.SyncActionValue.IPaymentInfoAction)
			public cpi?: (string|null)
			public static encode(m: waproto.SyncActionValue.IPaymentInfoAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PaymentInfoAction
		}
		interface IPaymentTosAction {
			paymentNotice?: (waproto.SyncActionValue.PaymentTosAction.PaymentNotice|null)
			accepted?: (boolean|null)
		}
		class PaymentTosAction implements IPaymentTosAction {
			constructor(p?: waproto.SyncActionValue.IPaymentTosAction)
			public paymentNotice?: (waproto.SyncActionValue.PaymentTosAction.PaymentNotice|null)
			public accepted?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IPaymentTosAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PaymentTosAction
		}
		namespace PaymentTosAction {
			enum PaymentNotice {
				BR_PAY_PRIVACY_POLICY = 0
			}
		}
		interface IPinAction {
			pinned?: (boolean|null)
		}
		class PinAction implements IPinAction {
			constructor(p?: waproto.SyncActionValue.IPinAction)
			public pinned?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IPinAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PinAction
		}
		interface IPnForLidChatAction {
			pnJid?: (string|null)
		}
		class PnForLidChatAction implements IPnForLidChatAction {
			constructor(p?: waproto.SyncActionValue.IPnForLidChatAction)
			public pnJid?: (string|null)
			public static encode(m: waproto.SyncActionValue.IPnForLidChatAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PnForLidChatAction
		}
		interface IPrimaryFeature {
			flags?: (string[]|null)
		}
		class PrimaryFeature implements IPrimaryFeature {
			constructor(p?: waproto.SyncActionValue.IPrimaryFeature)
			public flags: string[]
			public static encode(m: waproto.SyncActionValue.IPrimaryFeature, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PrimaryFeature
		}
		interface IPrimaryVersionAction {
			version?: (string|null)
		}
		class PrimaryVersionAction implements IPrimaryVersionAction {
			constructor(p?: waproto.SyncActionValue.IPrimaryVersionAction)
			public version?: (string|null)
			public static encode(m: waproto.SyncActionValue.IPrimaryVersionAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PrimaryVersionAction
		}
		interface IPrivacySettingChannelsPersonalisedRecommendationAction {
			isUserOptedOut?: (boolean|null)
		}
		class PrivacySettingChannelsPersonalisedRecommendationAction implements IPrivacySettingChannelsPersonalisedRecommendationAction {
			constructor(p?: waproto.SyncActionValue.IPrivacySettingChannelsPersonalisedRecommendationAction)
			public isUserOptedOut?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IPrivacySettingChannelsPersonalisedRecommendationAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PrivacySettingChannelsPersonalisedRecommendationAction
		}
		interface IPrivacySettingDisableLinkPreviewsAction {
			isPreviewsDisabled?: (boolean|null)
		}
		class PrivacySettingDisableLinkPreviewsAction implements IPrivacySettingDisableLinkPreviewsAction {
			constructor(p?: waproto.SyncActionValue.IPrivacySettingDisableLinkPreviewsAction)
			public isPreviewsDisabled?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IPrivacySettingDisableLinkPreviewsAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PrivacySettingDisableLinkPreviewsAction
		}
		interface IPrivacySettingRelayAllCalls {
			isEnabled?: (boolean|null)
		}
		class PrivacySettingRelayAllCalls implements IPrivacySettingRelayAllCalls {
			constructor(p?: waproto.SyncActionValue.IPrivacySettingRelayAllCalls)
			public isEnabled?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IPrivacySettingRelayAllCalls, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PrivacySettingRelayAllCalls
		}
		interface IPrivateProcessingSettingAction {
			privateProcessingStatus?: (waproto.SyncActionValue.PrivateProcessingSettingAction.PrivateProcessingStatus|null)
		}
		class PrivateProcessingSettingAction implements IPrivateProcessingSettingAction {
			constructor(p?: waproto.SyncActionValue.IPrivateProcessingSettingAction)
			public privateProcessingStatus?: (waproto.SyncActionValue.PrivateProcessingSettingAction.PrivateProcessingStatus|null)
			public static encode(m: waproto.SyncActionValue.IPrivateProcessingSettingAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PrivateProcessingSettingAction
		}
		namespace PrivateProcessingSettingAction {
			enum PrivateProcessingStatus {
				UNDEFINED = 0,
				ENABLED = 1,
				DISABLED = 2
			}
		}
		interface IPushNameSetting {
			name?: (string|null)
		}
		class PushNameSetting implements IPushNameSetting {
			constructor(p?: waproto.SyncActionValue.IPushNameSetting)
			public name?: (string|null)
			public static encode(m: waproto.SyncActionValue.IPushNameSetting, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.PushNameSetting
		}
		interface IQuickReplyAction {
			shortcut?: (string|null)
			message?: (string|null)
			keywords?: (string[]|null)
			count?: (number|null)
			deleted?: (boolean|null)
		}
		class QuickReplyAction implements IQuickReplyAction {
			constructor(p?: waproto.SyncActionValue.IQuickReplyAction)
			public shortcut?: (string|null)
			public message?: (string|null)
			public keywords: string[]
			public count?: (number|null)
			public deleted?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IQuickReplyAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.QuickReplyAction
		}
		interface IRecentEmojiWeightsAction {
			weights?: (waproto.IRecentEmojiWeight[]|null)
		}
		class RecentEmojiWeightsAction implements IRecentEmojiWeightsAction {
			constructor(p?: waproto.SyncActionValue.IRecentEmojiWeightsAction)
			public weights: waproto.IRecentEmojiWeight[]
			public static encode(m: waproto.SyncActionValue.IRecentEmojiWeightsAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.RecentEmojiWeightsAction
		}
		interface IRemoveRecentStickerAction {
			lastStickerSentTs?: (number|Long|null)
		}
		class RemoveRecentStickerAction implements IRemoveRecentStickerAction {
			constructor(p?: waproto.SyncActionValue.IRemoveRecentStickerAction)
			public lastStickerSentTs?: (number|Long|null)
			public static encode(m: waproto.SyncActionValue.IRemoveRecentStickerAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.RemoveRecentStickerAction
		}
		interface ISettingsSyncAction {
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
		}
		class SettingsSyncAction implements ISettingsSyncAction {
			constructor(p?: waproto.SyncActionValue.ISettingsSyncAction)
			public startAtLogin?: (boolean|null)
			public minimizeToTray?: (boolean|null)
			public language?: (string|null)
			public replaceTextWithEmoji?: (boolean|null)
			public bannerNotificationDisplayMode?: (waproto.SyncActionValue.SettingsSyncAction.DisplayMode|null)
			public unreadCounterBadgeDisplayMode?: (waproto.SyncActionValue.SettingsSyncAction.DisplayMode|null)
			public isMessagesNotificationEnabled?: (boolean|null)
			public isCallsNotificationEnabled?: (boolean|null)
			public isReactionsNotificationEnabled?: (boolean|null)
			public isStatusReactionsNotificationEnabled?: (boolean|null)
			public isTextPreviewForNotificationEnabled?: (boolean|null)
			public defaultNotificationToneId?: (number|null)
			public groupDefaultNotificationToneId?: (number|null)
			public appTheme?: (number|null)
			public wallpaperId?: (number|null)
			public isDoodleWallpaperEnabled?: (boolean|null)
			public fontSize?: (number|null)
			public isPhotosAutodownloadEnabled?: (boolean|null)
			public isAudiosAutodownloadEnabled?: (boolean|null)
			public isVideosAutodownloadEnabled?: (boolean|null)
			public isDocumentsAutodownloadEnabled?: (boolean|null)
			public disableLinkPreviews?: (boolean|null)
			public notificationToneId?: (number|null)
			public mediaUploadQuality?: (waproto.SyncActionValue.SettingsSyncAction.MediaQualitySetting|null)
			public isSpellCheckEnabled?: (boolean|null)
			public isEnterToSendEnabled?: (boolean|null)
			public isGroupMessageNotificationEnabled?: (boolean|null)
			public isGroupReactionsNotificationEnabled?: (boolean|null)
			public isStatusNotificationEnabled?: (boolean|null)
			public statusNotificationToneId?: (number|null)
			public shouldPlaySoundForCallNotification?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.ISettingsSyncAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.SettingsSyncAction
		}
		namespace SettingsSyncAction {
			enum DisplayMode {
				DISPLAY_MODE_UNKNOWN = 0,
				ALWAYS = 1,
				NEVER = 2,
				ONLY_WHEN_APP_IS_OPEN = 3
			}
			enum MediaQualitySetting {
				MEDIA_QUALITY_UNKNOWN = 0,
				STANDARD = 1,
				HD = 2
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
				SHOULD_PLAY_SOUND_FOR_CALL_NOTIFICATION = 31
			}
			enum SettingPlatform {
				PLATFORM_UNKNOWN = 0,
				WEB = 1,
				HYBRID = 2,
				WINDOWS = 3,
				MAC = 4
			}
		}
		interface IStarAction {
			starred?: (boolean|null)
		}
		class StarAction implements IStarAction {
			constructor(p?: waproto.SyncActionValue.IStarAction)
			public starred?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IStarAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.StarAction
		}
		interface IStatusPostOptInNotificationPreferencesAction {
			enabled?: (boolean|null)
		}
		class StatusPostOptInNotificationPreferencesAction implements IStatusPostOptInNotificationPreferencesAction {
			constructor(p?: waproto.SyncActionValue.IStatusPostOptInNotificationPreferencesAction)
			public enabled?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IStatusPostOptInNotificationPreferencesAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.StatusPostOptInNotificationPreferencesAction
		}
		interface IStatusPrivacyAction {
			mode?: (waproto.SyncActionValue.StatusPrivacyAction.StatusDistributionMode|null)
			userJid?: (string[]|null)
			shareToFB?: (boolean|null)
			shareToIG?: (boolean|null)
		}
		class StatusPrivacyAction implements IStatusPrivacyAction {
			constructor(p?: waproto.SyncActionValue.IStatusPrivacyAction)
			public mode?: (waproto.SyncActionValue.StatusPrivacyAction.StatusDistributionMode|null)
			public userJid: string[]
			public shareToFB?: (boolean|null)
			public shareToIG?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IStatusPrivacyAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.StatusPrivacyAction
		}
		namespace StatusPrivacyAction {
			enum StatusDistributionMode {
				ALLOW_LIST = 0,
				DENY_LIST = 1,
				CONTACTS = 2,
				CLOSE_FRIENDS = 3
			}
		}
		interface IStickerAction {
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
		}
		class StickerAction implements IStickerAction {
			constructor(p?: waproto.SyncActionValue.IStickerAction)
			public url?: (string|null)
			public fileEncSha256?: (Uint8Array|null)
			public mediaKey?: (Uint8Array|null)
			public mimetype?: (string|null)
			public height?: (number|null)
			public width?: (number|null)
			public directPath?: (string|null)
			public fileLength?: (number|Long|null)
			public isFavorite?: (boolean|null)
			public deviceIdHint?: (number|null)
			public isLottie?: (boolean|null)
			public imageHash?: (string|null)
			public isAvatarSticker?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IStickerAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.StickerAction
		}
		interface ISubscriptionAction {
			isDeactivated?: (boolean|null)
			isAutoRenewing?: (boolean|null)
			expirationDate?: (number|Long|null)
		}
		class SubscriptionAction implements ISubscriptionAction {
			constructor(p?: waproto.SyncActionValue.ISubscriptionAction)
			public isDeactivated?: (boolean|null)
			public isAutoRenewing?: (boolean|null)
			public expirationDate?: (number|Long|null)
			public static encode(m: waproto.SyncActionValue.ISubscriptionAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.SubscriptionAction
		}
		interface ISyncActionMessage {
			key?: (waproto.IMessageKey|null)
			timestamp?: (number|Long|null)
		}
		class SyncActionMessage implements ISyncActionMessage {
			constructor(p?: waproto.SyncActionValue.ISyncActionMessage)
			public key?: (waproto.IMessageKey|null)
			public timestamp?: (number|Long|null)
			public static encode(m: waproto.SyncActionValue.ISyncActionMessage, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.SyncActionMessage
		}
		interface ISyncActionMessageRange {
			lastMessageTimestamp?: (number|Long|null)
			lastSystemMessageTimestamp?: (number|Long|null)
			messages?: (waproto.SyncActionValue.ISyncActionMessage[]|null)
		}
		class SyncActionMessageRange implements ISyncActionMessageRange {
			constructor(p?: waproto.SyncActionValue.ISyncActionMessageRange)
			public lastMessageTimestamp?: (number|Long|null)
			public lastSystemMessageTimestamp?: (number|Long|null)
			public messages: waproto.SyncActionValue.ISyncActionMessage[]
			public static encode(m: waproto.SyncActionValue.ISyncActionMessageRange, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.SyncActionMessageRange
		}
		interface ITimeFormatAction {
			isTwentyFourHourFormatEnabled?: (boolean|null)
		}
		class TimeFormatAction implements ITimeFormatAction {
			constructor(p?: waproto.SyncActionValue.ITimeFormatAction)
			public isTwentyFourHourFormatEnabled?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.ITimeFormatAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.TimeFormatAction
		}
		interface IUGCBot {
			definition?: (Uint8Array|null)
		}
		class UGCBot implements IUGCBot {
			constructor(p?: waproto.SyncActionValue.IUGCBot)
			public definition?: (Uint8Array|null)
			public static encode(m: waproto.SyncActionValue.IUGCBot, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.UGCBot
		}
		interface IUnarchiveChatsSetting {
			unarchiveChats?: (boolean|null)
		}
		class UnarchiveChatsSetting implements IUnarchiveChatsSetting {
			constructor(p?: waproto.SyncActionValue.IUnarchiveChatsSetting)
			public unarchiveChats?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IUnarchiveChatsSetting, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.UnarchiveChatsSetting
		}
		interface IUserStatusMuteAction {
			muted?: (boolean|null)
		}
		class UserStatusMuteAction implements IUserStatusMuteAction {
			constructor(p?: waproto.SyncActionValue.IUserStatusMuteAction)
			public muted?: (boolean|null)
			public static encode(m: waproto.SyncActionValue.IUserStatusMuteAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.UserStatusMuteAction
		}
		interface IUsernameChatStartModeAction {
			chatStartMode?: (waproto.SyncActionValue.UsernameChatStartModeAction.ChatStartMode|null)
		}
		class UsernameChatStartModeAction implements IUsernameChatStartModeAction {
			constructor(p?: waproto.SyncActionValue.IUsernameChatStartModeAction)
			public chatStartMode?: (waproto.SyncActionValue.UsernameChatStartModeAction.ChatStartMode|null)
			public static encode(m: waproto.SyncActionValue.IUsernameChatStartModeAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.UsernameChatStartModeAction
		}
		namespace UsernameChatStartModeAction {
			enum ChatStartMode {
				LID = 1,
				PN = 2
			}
		}
		interface IWaffleAccountLinkStateAction {
			linkState?: (waproto.SyncActionValue.WaffleAccountLinkStateAction.AccountLinkState|null)
		}
		class WaffleAccountLinkStateAction implements IWaffleAccountLinkStateAction {
			constructor(p?: waproto.SyncActionValue.IWaffleAccountLinkStateAction)
			public linkState?: (waproto.SyncActionValue.WaffleAccountLinkStateAction.AccountLinkState|null)
			public static encode(m: waproto.SyncActionValue.IWaffleAccountLinkStateAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.WaffleAccountLinkStateAction
		}
		namespace WaffleAccountLinkStateAction {
			enum AccountLinkState {
				ACTIVE = 0,
				PAUSED = 1,
				UNLINKED = 2
			}
		}
		interface IWamoUserIdentifierAction {
			identifier?: (string|null)
		}
		class WamoUserIdentifierAction implements IWamoUserIdentifierAction {
			constructor(p?: waproto.SyncActionValue.IWamoUserIdentifierAction)
			public identifier?: (string|null)
			public static encode(m: waproto.SyncActionValue.IWamoUserIdentifierAction, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncActionValue.WamoUserIdentifierAction
		}
	}
	interface ISyncdIndex {
		blob?: (Uint8Array|null)
	}
	class SyncdIndex implements ISyncdIndex {
		constructor(p?: waproto.ISyncdIndex)
		public blob?: (Uint8Array|null)
		public static encode(m: waproto.ISyncdIndex, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdIndex
	}
	interface ISyncdMutation {
		operation?: (waproto.SyncdMutation.SyncdOperation|null)
		record?: (waproto.ISyncdRecord|null)
	}
	class SyncdMutation implements ISyncdMutation {
		constructor(p?: waproto.ISyncdMutation)
		public operation?: (waproto.SyncdMutation.SyncdOperation|null)
		public record?: (waproto.ISyncdRecord|null)
		public static encode(m: waproto.ISyncdMutation, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdMutation
	}
	namespace SyncdMutation {
		enum SyncdOperation {
			SET = 0,
			REMOVE = 1
		}
	}
	interface ISyncdMutations {
		mutations?: (waproto.ISyncdMutation[]|null)
	}
	class SyncdMutations implements ISyncdMutations {
		constructor(p?: waproto.ISyncdMutations)
		public mutations: waproto.ISyncdMutation[]
		public static encode(m: waproto.ISyncdMutations, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdMutations
	}
	interface ISyncdPatch {
		version?: (waproto.ISyncdVersion|null)
		mutations?: (waproto.ISyncdMutation[]|null)
		externalMutations?: (waproto.IExternalBlobReference|null)
		snapshotMac?: (Uint8Array|null)
		patchMac?: (Uint8Array|null)
		keyId?: (waproto.IKeyId|null)
		exitCode?: (waproto.IExitCode|null)
		deviceIndex?: (number|null)
		clientDebugData?: (Uint8Array|null)
	}
	class SyncdPatch implements ISyncdPatch {
		constructor(p?: waproto.ISyncdPatch)
		public version?: (waproto.ISyncdVersion|null)
		public mutations: waproto.ISyncdMutation[]
		public externalMutations?: (waproto.IExternalBlobReference|null)
		public snapshotMac?: (Uint8Array|null)
		public patchMac?: (Uint8Array|null)
		public keyId?: (waproto.IKeyId|null)
		public exitCode?: (waproto.IExitCode|null)
		public deviceIndex?: (number|null)
		public clientDebugData?: (Uint8Array|null)
		public static encode(m: waproto.ISyncdPatch, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdPatch
	}
	interface ISyncdRecord {
		index?: (waproto.ISyncdIndex|null)
		value?: (waproto.ISyncdValue|null)
		keyId?: (waproto.IKeyId|null)
	}
	class SyncdRecord implements ISyncdRecord {
		constructor(p?: waproto.ISyncdRecord)
		public index?: (waproto.ISyncdIndex|null)
		public value?: (waproto.ISyncdValue|null)
		public keyId?: (waproto.IKeyId|null)
		public static encode(m: waproto.ISyncdRecord, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdRecord
	}
	interface ISyncdSnapshot {
		version?: (waproto.ISyncdVersion|null)
		records?: (waproto.ISyncdRecord[]|null)
		mac?: (Uint8Array|null)
		keyId?: (waproto.IKeyId|null)
	}
	class SyncdSnapshot implements ISyncdSnapshot {
		constructor(p?: waproto.ISyncdSnapshot)
		public version?: (waproto.ISyncdVersion|null)
		public records: waproto.ISyncdRecord[]
		public mac?: (Uint8Array|null)
		public keyId?: (waproto.IKeyId|null)
		public static encode(m: waproto.ISyncdSnapshot, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdSnapshot
	}
	interface ISyncdValue {
		blob?: (Uint8Array|null)
	}
	class SyncdValue implements ISyncdValue {
		constructor(p?: waproto.ISyncdValue)
		public blob?: (Uint8Array|null)
		public static encode(m: waproto.ISyncdValue, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdValue
	}
	interface ISyncdVersion {
		version?: (number|Long|null)
	}
	class SyncdVersion implements ISyncdVersion {
		constructor(p?: waproto.ISyncdVersion)
		public version?: (number|Long|null)
		public static encode(m: waproto.ISyncdVersion, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.SyncdVersion
	}
	interface ITapLinkAction {
		title?: (string|null)
		tapUrl?: (string|null)
	}
	class TapLinkAction implements ITapLinkAction {
		constructor(p?: waproto.ITapLinkAction)
		public title?: (string|null)
		public tapUrl?: (string|null)
		public static encode(m: waproto.ITapLinkAction, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.TapLinkAction
	}
	interface ITemplateButton {
		index?: (number|null)
		quickReplyButton?: (waproto.TemplateButton.IQuickReplyButton|null)
		urlButton?: (waproto.TemplateButton.IURLButton|null)
		callButton?: (waproto.TemplateButton.ICallButton|null)
	}
	class TemplateButton implements ITemplateButton {
		constructor(p?: waproto.ITemplateButton)
		public index?: (number|null)
		public quickReplyButton?: (waproto.TemplateButton.IQuickReplyButton|null)
		public urlButton?: (waproto.TemplateButton.IURLButton|null)
		public callButton?: (waproto.TemplateButton.ICallButton|null)
		public button?: ("quickReplyButton"|"urlButton"|"callButton")
		public static encode(m: waproto.ITemplateButton, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.TemplateButton
	}
	namespace TemplateButton {
		interface ICallButton {
			displayText?: (waproto.Message.IHighlyStructuredMessage|null)
			phoneNumber?: (waproto.Message.IHighlyStructuredMessage|null)
		}
		class CallButton implements ICallButton {
			constructor(p?: waproto.TemplateButton.ICallButton)
			public displayText?: (waproto.Message.IHighlyStructuredMessage|null)
			public phoneNumber?: (waproto.Message.IHighlyStructuredMessage|null)
			public static encode(m: waproto.TemplateButton.ICallButton, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.TemplateButton.CallButton
		}
		interface IQuickReplyButton {
			displayText?: (waproto.Message.IHighlyStructuredMessage|null)
			id?: (string|null)
		}
		class QuickReplyButton implements IQuickReplyButton {
			constructor(p?: waproto.TemplateButton.IQuickReplyButton)
			public displayText?: (waproto.Message.IHighlyStructuredMessage|null)
			public id?: (string|null)
			public static encode(m: waproto.TemplateButton.IQuickReplyButton, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.TemplateButton.QuickReplyButton
		}
		interface IURLButton {
			displayText?: (waproto.Message.IHighlyStructuredMessage|null)
			url?: (waproto.Message.IHighlyStructuredMessage|null)
		}
		class URLButton implements IURLButton {
			constructor(p?: waproto.TemplateButton.IURLButton)
			public displayText?: (waproto.Message.IHighlyStructuredMessage|null)
			public url?: (waproto.Message.IHighlyStructuredMessage|null)
			public static encode(m: waproto.TemplateButton.IURLButton, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.TemplateButton.URLButton
		}
	}
	interface IThreadID {
		threadType?: (waproto.ThreadID.ThreadType|null)
		threadKey?: (waproto.IMessageKey|null)
	}
	class ThreadID implements IThreadID {
		constructor(p?: waproto.IThreadID)
		public threadType?: (waproto.ThreadID.ThreadType|null)
		public threadKey?: (waproto.IMessageKey|null)
		public static encode(m: waproto.IThreadID, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.ThreadID
	}
	namespace ThreadID {
		enum ThreadType {
			UNKNOWN = 0,
			VIEW_REPLIES = 1,
			AI_THREAD = 2
		}
	}
	interface IUrlTrackingMap {
		urlTrackingMapElements?: (waproto.UrlTrackingMap.IUrlTrackingMapElement[]|null)
	}
	class UrlTrackingMap implements IUrlTrackingMap {
		constructor(p?: waproto.IUrlTrackingMap)
		public urlTrackingMapElements: waproto.UrlTrackingMap.IUrlTrackingMapElement[]
		public static encode(m: waproto.IUrlTrackingMap, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.UrlTrackingMap
	}
	namespace UrlTrackingMap {
		interface IUrlTrackingMapElement {
			originalUrl?: (string|null)
			unconsentedUsersUrl?: (string|null)
			consentedUsersUrl?: (string|null)
			cardIndex?: (number|null)
		}
		class UrlTrackingMapElement implements IUrlTrackingMapElement {
			constructor(p?: waproto.UrlTrackingMap.IUrlTrackingMapElement)
			public originalUrl?: (string|null)
			public unconsentedUsersUrl?: (string|null)
			public consentedUsersUrl?: (string|null)
			public cardIndex?: (number|null)
			public static encode(m: waproto.UrlTrackingMap.IUrlTrackingMapElement, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.UrlTrackingMap.UrlTrackingMapElement
		}
	}
	interface IUserPassword {
		encoding?: (waproto.UserPassword.Encoding|null)
		transformer?: (waproto.UserPassword.Transformer|null)
		transformerArg?: (waproto.UserPassword.ITransformerArg[]|null)
		transformedData?: (Uint8Array|null)
	}
	class UserPassword implements IUserPassword {
		constructor(p?: waproto.IUserPassword)
		public encoding?: (waproto.UserPassword.Encoding|null)
		public transformer?: (waproto.UserPassword.Transformer|null)
		public transformerArg: waproto.UserPassword.ITransformerArg[]
		public transformedData?: (Uint8Array|null)
		public static encode(m: waproto.IUserPassword, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.UserPassword
	}
	namespace UserPassword {
		enum Encoding {
			UTF8 = 0,
			UTF8_BROKEN = 1
		}
		enum Transformer {
			NONE = 0,
			PBKDF2_HMAC_SHA512 = 1,
			PBKDF2_HMAC_SHA384 = 2
		}
		interface ITransformerArg {
			key?: (string|null)
			value?: (waproto.UserPassword.TransformerArg.IValue|null)
		}
		class TransformerArg implements ITransformerArg {
			constructor(p?: waproto.UserPassword.ITransformerArg)
			public key?: (string|null)
			public value?: (waproto.UserPassword.TransformerArg.IValue|null)
			public static encode(m: waproto.UserPassword.ITransformerArg, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.UserPassword.TransformerArg
		}
		namespace TransformerArg {
			interface IValue {
				asBlob?: (Uint8Array|null)
				asUnsignedInteger?: (number|null)
			}
			class Value implements IValue {
				constructor(p?: waproto.UserPassword.TransformerArg.IValue)
				public asBlob?: (Uint8Array|null)
				public asUnsignedInteger?: (number|null)
				public value?: ("asBlob"|"asUnsignedInteger")
				public static encode(m: waproto.UserPassword.TransformerArg.IValue, w?: PbWriter): PbWriter
				public static decode(r: (PbReader|Uint8Array), l?: number): waproto.UserPassword.TransformerArg.Value
			}
		}
	}
	interface IUserReceipt {
		userJid?: (string|null)
		receiptTimestamp?: (number|Long|null)
		readTimestamp?: (number|Long|null)
		playedTimestamp?: (number|Long|null)
		pendingDeviceJid?: (string[]|null)
		deliveredDeviceJid?: (string[]|null)
	}
	class UserReceipt implements IUserReceipt {
		constructor(p?: waproto.IUserReceipt)
		public userJid?: (string|null)
		public receiptTimestamp?: (number|Long|null)
		public readTimestamp?: (number|Long|null)
		public playedTimestamp?: (number|Long|null)
		public pendingDeviceJid: string[]
		public deliveredDeviceJid: string[]
		public static encode(m: waproto.IUserReceipt, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.UserReceipt
	}
	interface IVerifiedNameCertificate {
		details?: (Uint8Array|null)
		signature?: (Uint8Array|null)
		serverSignature?: (Uint8Array|null)
	}
	class VerifiedNameCertificate implements IVerifiedNameCertificate {
		constructor(p?: waproto.IVerifiedNameCertificate)
		public details?: (Uint8Array|null)
		public signature?: (Uint8Array|null)
		public serverSignature?: (Uint8Array|null)
		public static encode(m: waproto.IVerifiedNameCertificate, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.VerifiedNameCertificate
	}
	namespace VerifiedNameCertificate {
		interface IDetails {
			serial?: (number|Long|null)
			issuer?: (string|null)
			verifiedName?: (string|null)
			localizedNames?: (waproto.ILocalizedName[]|null)
			issueTime?: (number|Long|null)
		}
		class Details implements IDetails {
			constructor(p?: waproto.VerifiedNameCertificate.IDetails)
			public serial?: (number|Long|null)
			public issuer?: (string|null)
			public verifiedName?: (string|null)
			public localizedNames: waproto.ILocalizedName[]
			public issueTime?: (number|Long|null)
			public static encode(m: waproto.VerifiedNameCertificate.IDetails, w?: PbWriter): PbWriter
			public static decode(r: (PbReader|Uint8Array), l?: number): waproto.VerifiedNameCertificate.Details
		}
	}
	interface IWallpaperSettings {
		filename?: (string|null)
		opacity?: (number|null)
		isGenAi?: (boolean|null)
	}
	class WallpaperSettings implements IWallpaperSettings {
		constructor(p?: waproto.IWallpaperSettings)
		public filename?: (string|null)
		public opacity?: (number|null)
		public isGenAi?: (boolean|null)
		public static encode(m: waproto.IWallpaperSettings, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.WallpaperSettings
	}
	interface IWebFeatures {
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
	}
	class WebFeatures implements IWebFeatures {
		constructor(p?: waproto.IWebFeatures)
		public labelsDisplay?: (waproto.WebFeatures.Flag|null)
		public voipIndividualOutgoing?: (waproto.WebFeatures.Flag|null)
		public groupsV3?: (waproto.WebFeatures.Flag|null)
		public groupsV3Create?: (waproto.WebFeatures.Flag|null)
		public changeNumberV2?: (waproto.WebFeatures.Flag|null)
		public queryStatusV3Thumbnail?: (waproto.WebFeatures.Flag|null)
		public liveLocations?: (waproto.WebFeatures.Flag|null)
		public queryVname?: (waproto.WebFeatures.Flag|null)
		public voipIndividualIncoming?: (waproto.WebFeatures.Flag|null)
		public quickRepliesQuery?: (waproto.WebFeatures.Flag|null)
		public payments?: (waproto.WebFeatures.Flag|null)
		public stickerPackQuery?: (waproto.WebFeatures.Flag|null)
		public liveLocationsFinal?: (waproto.WebFeatures.Flag|null)
		public labelsEdit?: (waproto.WebFeatures.Flag|null)
		public mediaUpload?: (waproto.WebFeatures.Flag|null)
		public mediaUploadRichQuickReplies?: (waproto.WebFeatures.Flag|null)
		public vnameV2?: (waproto.WebFeatures.Flag|null)
		public videoPlaybackUrl?: (waproto.WebFeatures.Flag|null)
		public statusRanking?: (waproto.WebFeatures.Flag|null)
		public voipIndividualVideo?: (waproto.WebFeatures.Flag|null)
		public thirdPartyStickers?: (waproto.WebFeatures.Flag|null)
		public frequentlyForwardedSetting?: (waproto.WebFeatures.Flag|null)
		public groupsV4JoinPermission?: (waproto.WebFeatures.Flag|null)
		public recentStickers?: (waproto.WebFeatures.Flag|null)
		public catalog?: (waproto.WebFeatures.Flag|null)
		public starredStickers?: (waproto.WebFeatures.Flag|null)
		public voipGroupCall?: (waproto.WebFeatures.Flag|null)
		public templateMessage?: (waproto.WebFeatures.Flag|null)
		public templateMessageInteractivity?: (waproto.WebFeatures.Flag|null)
		public ephemeralMessages?: (waproto.WebFeatures.Flag|null)
		public e2ENotificationSync?: (waproto.WebFeatures.Flag|null)
		public recentStickersV2?: (waproto.WebFeatures.Flag|null)
		public recentStickersV3?: (waproto.WebFeatures.Flag|null)
		public userNotice?: (waproto.WebFeatures.Flag|null)
		public support?: (waproto.WebFeatures.Flag|null)
		public groupUiiCleanup?: (waproto.WebFeatures.Flag|null)
		public groupDogfoodingInternalOnly?: (waproto.WebFeatures.Flag|null)
		public settingsSync?: (waproto.WebFeatures.Flag|null)
		public archiveV2?: (waproto.WebFeatures.Flag|null)
		public ephemeralAllowGroupMembers?: (waproto.WebFeatures.Flag|null)
		public ephemeral24HDuration?: (waproto.WebFeatures.Flag|null)
		public mdForceUpgrade?: (waproto.WebFeatures.Flag|null)
		public disappearingMode?: (waproto.WebFeatures.Flag|null)
		public externalMdOptInAvailable?: (waproto.WebFeatures.Flag|null)
		public noDeleteMessageTimeLimit?: (waproto.WebFeatures.Flag|null)
		public static encode(m: waproto.IWebFeatures, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.WebFeatures
	}
	namespace WebFeatures {
		enum Flag {
			NOT_STARTED = 0,
			FORCE_UPGRADE = 1,
			DEVELOPMENT = 2,
			PRODUCTION = 3
		}
	}
	enum WebLinkRenderConfig {
		WEBVIEW = 0,
		SYSTEM = 1
	}
	interface IWebMessageInfo {
		key?: (waproto.IMessageKey|null)
		message?: (waproto.IMessage|null)
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
		paymentInfo?: (waproto.IPaymentInfo|null)
		finalLiveLocation?: (waproto.Message.ILiveLocationMessage|null)
		quotedPaymentInfo?: (waproto.IPaymentInfo|null)
		ephemeralStartTimestamp?: (number|Long|null)
		ephemeralDuration?: (number|null)
		ephemeralOffToOn?: (boolean|null)
		ephemeralOutOfSync?: (boolean|null)
		bizPrivacyStatus?: (waproto.WebMessageInfo.BizPrivacyStatus|null)
		verifiedBizName?: (string|null)
		mediaData?: (waproto.IMediaData|null)
		photoChange?: (waproto.IPhotoChange|null)
		userReceipt?: (waproto.IUserReceipt[]|null)
		reactions?: (waproto.IReaction[]|null)
		quotedStickerData?: (waproto.IMediaData|null)
		futureproofData?: (Uint8Array|null)
		statusPsa?: (waproto.IStatusPSA|null)
		pollUpdates?: (waproto.IPollUpdate[]|null)
		pollAdditionalMetadata?: (waproto.IPollAdditionalMetadata|null)
		agentId?: (string|null)
		statusAlreadyViewed?: (boolean|null)
		messageSecret?: (Uint8Array|null)
		keepInChat?: (waproto.IKeepInChat|null)
		originalSelfAuthorUserJidString?: (string|null)
		revokeMessageTimestamp?: (number|Long|null)
		pinInChat?: (waproto.IPinInChat|null)
		premiumMessageInfo?: (waproto.IPremiumMessageInfo|null)
		is1PBizBotMessage?: (boolean|null)
		isGroupHistoryMessage?: (boolean|null)
		botMessageInvokerJid?: (string|null)
		commentMetadata?: (waproto.ICommentMetadata|null)
		eventResponses?: (waproto.IEventResponse[]|null)
		reportingTokenInfo?: (waproto.IReportingTokenInfo|null)
		newsletterServerId?: (number|Long|null)
		eventAdditionalMetadata?: (waproto.IEventAdditionalMetadata|null)
		isMentionedInStatus?: (boolean|null)
		statusMentions?: (string[]|null)
		targetMessageId?: (waproto.IMessageKey|null)
		messageAddOns?: (waproto.IMessageAddOn[]|null)
		statusMentionMessageInfo?: (waproto.IStatusMentionMessage|null)
		isSupportAiMessage?: (boolean|null)
		statusMentionSources?: (string[]|null)
		supportAiCitations?: (waproto.ICitation[]|null)
		botTargetId?: (string|null)
		groupHistoryIndividualMessageInfo?: (waproto.IGroupHistoryIndividualMessageInfo|null)
		groupHistoryBundleInfo?: (waproto.IGroupHistoryBundleInfo|null)
		interactiveMessageAdditionalMetadata?: (waproto.IInteractiveMessageAdditionalMetadata|null)
		quarantinedMessage?: (waproto.IQuarantinedMessage|null)
		nonJidMentions?: (number|null)
		hsmTag?: (string|null)
	}
	class WebMessageInfo implements IWebMessageInfo {
		constructor(p?: waproto.IWebMessageInfo)
		public key?: (waproto.IMessageKey|null)
		public message?: (waproto.IMessage|null)
		public messageTimestamp?: (number|Long|null)
		public status?: (waproto.WebMessageInfo.Status|null)
		public participant?: (string|null)
		public messageC2STimestamp?: (number|Long|null)
		public ignore?: (boolean|null)
		public starred?: (boolean|null)
		public broadcast?: (boolean|null)
		public pushName?: (string|null)
		public mediaCiphertextSha256?: (Uint8Array|null)
		public multicast?: (boolean|null)
		public urlText?: (boolean|null)
		public urlNumber?: (boolean|null)
		public messageStubType?: (waproto.WebMessageInfo.StubType|null)
		public clearMedia?: (boolean|null)
		public messageStubParameters: string[]
		public duration?: (number|null)
		public labels: string[]
		public paymentInfo?: (waproto.IPaymentInfo|null)
		public finalLiveLocation?: (waproto.Message.ILiveLocationMessage|null)
		public quotedPaymentInfo?: (waproto.IPaymentInfo|null)
		public ephemeralStartTimestamp?: (number|Long|null)
		public ephemeralDuration?: (number|null)
		public ephemeralOffToOn?: (boolean|null)
		public ephemeralOutOfSync?: (boolean|null)
		public bizPrivacyStatus?: (waproto.WebMessageInfo.BizPrivacyStatus|null)
		public verifiedBizName?: (string|null)
		public mediaData?: (waproto.IMediaData|null)
		public photoChange?: (waproto.IPhotoChange|null)
		public userReceipt: waproto.IUserReceipt[]
		public reactions: waproto.IReaction[]
		public quotedStickerData?: (waproto.IMediaData|null)
		public futureproofData?: (Uint8Array|null)
		public statusPsa?: (waproto.IStatusPSA|null)
		public pollUpdates: waproto.IPollUpdate[]
		public pollAdditionalMetadata?: (waproto.IPollAdditionalMetadata|null)
		public agentId?: (string|null)
		public statusAlreadyViewed?: (boolean|null)
		public messageSecret?: (Uint8Array|null)
		public keepInChat?: (waproto.IKeepInChat|null)
		public originalSelfAuthorUserJidString?: (string|null)
		public revokeMessageTimestamp?: (number|Long|null)
		public pinInChat?: (waproto.IPinInChat|null)
		public premiumMessageInfo?: (waproto.IPremiumMessageInfo|null)
		public is1PBizBotMessage?: (boolean|null)
		public isGroupHistoryMessage?: (boolean|null)
		public botMessageInvokerJid?: (string|null)
		public commentMetadata?: (waproto.ICommentMetadata|null)
		public eventResponses: waproto.IEventResponse[]
		public reportingTokenInfo?: (waproto.IReportingTokenInfo|null)
		public newsletterServerId?: (number|Long|null)
		public eventAdditionalMetadata?: (waproto.IEventAdditionalMetadata|null)
		public isMentionedInStatus?: (boolean|null)
		public statusMentions: string[]
		public targetMessageId?: (waproto.IMessageKey|null)
		public messageAddOns: waproto.IMessageAddOn[]
		public statusMentionMessageInfo?: (waproto.IStatusMentionMessage|null)
		public isSupportAiMessage?: (boolean|null)
		public statusMentionSources: string[]
		public supportAiCitations: waproto.ICitation[]
		public botTargetId?: (string|null)
		public groupHistoryIndividualMessageInfo?: (waproto.IGroupHistoryIndividualMessageInfo|null)
		public groupHistoryBundleInfo?: (waproto.IGroupHistoryBundleInfo|null)
		public interactiveMessageAdditionalMetadata?: (waproto.IInteractiveMessageAdditionalMetadata|null)
		public quarantinedMessage?: (waproto.IQuarantinedMessage|null)
		public nonJidMentions?: (number|null)
		public hsmTag?: (string|null)
		public static encode(m: waproto.IWebMessageInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.WebMessageInfo
	}
	namespace WebMessageInfo {
		enum BizPrivacyStatus {
			E2EE = 0,
			FB = 2,
			BSP = 1,
			BSP_AND_FB = 3
		}
		enum Status {
			ERROR = 0,
			PENDING = 1,
			SERVER_ACK = 2,
			DELIVERY_ACK = 3,
			READ = 4,
			PLAYED = 5
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
			GROUP_TEE_BOT_ADDED = 223
		}
	}
	interface IWebNotificationsInfo {
		timestamp?: (number|Long|null)
		unreadChats?: (number|null)
		notifyMessageCount?: (number|null)
		notifyMessages?: (waproto.IWebMessageInfo[]|null)
	}
	class WebNotificationsInfo implements IWebNotificationsInfo {
		constructor(p?: waproto.IWebNotificationsInfo)
		public timestamp?: (number|Long|null)
		public unreadChats?: (number|null)
		public notifyMessageCount?: (number|null)
		public notifyMessages: waproto.IWebMessageInfo[]
		public static encode(m: waproto.IWebNotificationsInfo, w?: PbWriter): PbWriter
		public static decode(r: (PbReader|Uint8Array), l?: number): waproto.WebNotificationsInfo
	}
}
