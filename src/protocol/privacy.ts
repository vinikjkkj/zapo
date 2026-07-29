export const WA_PRIVACY_CATEGORIES = Object.freeze({
    READ_RECEIPTS: 'readreceipts',
    LAST_SEEN: 'last',
    ONLINE: 'online',
    PROFILE_PICTURE: 'profile',
    ABOUT: 'status',
    GROUP_ADD: 'groupadd',
    CALL_ADD: 'calladd',
    MESSAGES: 'messages',
    DEFENSE_MODE: 'defense',
    LINKED_PROFILES: 'linked_profiles',
    PIX: 'pix'
} as const)

export type WaPrivacyCategory = (typeof WA_PRIVACY_CATEGORIES)[keyof typeof WA_PRIVACY_CATEGORIES]

export const WA_PRIVACY_VALUES = Object.freeze({
    ALL: 'all',
    CONTACTS: 'contacts',
    CONTACT_BLACKLIST: 'contact_blacklist',
    NONE: 'none',
    MATCH_LAST_SEEN: 'match_last_seen',
    KNOWN: 'known',
    OFF: 'off',
    ON_STANDARD: 'on_standard',
    ERROR: 'error'
} as const)

export type WaPrivacyValue = (typeof WA_PRIVACY_VALUES)[keyof typeof WA_PRIVACY_VALUES]

export const WA_PRIVACY_CATEGORY_TO_SETTING = Object.freeze({
    [WA_PRIVACY_CATEGORIES.READ_RECEIPTS]: 'readReceipts',
    [WA_PRIVACY_CATEGORIES.LAST_SEEN]: 'lastSeen',
    [WA_PRIVACY_CATEGORIES.ONLINE]: 'online',
    [WA_PRIVACY_CATEGORIES.PROFILE_PICTURE]: 'profilePicture',
    [WA_PRIVACY_CATEGORIES.ABOUT]: 'about',
    [WA_PRIVACY_CATEGORIES.GROUP_ADD]: 'groupAdd',
    [WA_PRIVACY_CATEGORIES.CALL_ADD]: 'callAdd',
    [WA_PRIVACY_CATEGORIES.MESSAGES]: 'messages',
    [WA_PRIVACY_CATEGORIES.DEFENSE_MODE]: 'defenseMode',
    [WA_PRIVACY_CATEGORIES.LINKED_PROFILES]: 'linkedProfiles',
    [WA_PRIVACY_CATEGORIES.PIX]: 'pix'
} as const)

export const WA_PRIVACY_SETTING_TO_CATEGORY = Object.freeze({
    readReceipts: WA_PRIVACY_CATEGORIES.READ_RECEIPTS,
    lastSeen: WA_PRIVACY_CATEGORIES.LAST_SEEN,
    online: WA_PRIVACY_CATEGORIES.ONLINE,
    profilePicture: WA_PRIVACY_CATEGORIES.PROFILE_PICTURE,
    about: WA_PRIVACY_CATEGORIES.ABOUT,
    groupAdd: WA_PRIVACY_CATEGORIES.GROUP_ADD,
    callAdd: WA_PRIVACY_CATEGORIES.CALL_ADD,
    messages: WA_PRIVACY_CATEGORIES.MESSAGES,
    defenseMode: WA_PRIVACY_CATEGORIES.DEFENSE_MODE,
    linkedProfiles: WA_PRIVACY_CATEGORIES.LINKED_PROFILES,
    pix: WA_PRIVACY_CATEGORIES.PIX
} as const)

export type WaPrivacySettingName = keyof typeof WA_PRIVACY_SETTING_TO_CATEGORY

export type WaPrivacyVisibility = 'all' | 'contacts' | 'contact_blacklist' | 'none'

export interface WaPrivacySettingValueMap {
    readonly readReceipts: 'all' | 'none'
    readonly lastSeen: WaPrivacyVisibility
    readonly online: 'all' | 'none' | 'match_last_seen'
    readonly profilePicture: WaPrivacyVisibility
    readonly about: WaPrivacyVisibility
    readonly groupAdd: 'all' | 'contacts' | 'contact_blacklist'
    readonly callAdd: 'all' | 'known' | 'contacts'
    readonly messages: 'all' | 'contacts'
    readonly defenseMode: 'off' | 'on_standard'
    /**
     * Who can see the Accounts Center profiles linked to this account. Takes
     * the same visibility values as `lastSeen`/`profilePicture`, deny-list
     * included.
     */
    readonly linkedProfiles: WaPrivacyVisibility
    /** Who can see the Pix key on the profile (Brazil-only payments surface). */
    readonly pix: WaPrivacyVisibility
}

const VISIBILITY_VALUES = Object.freeze([
    WA_PRIVACY_VALUES.ALL,
    WA_PRIVACY_VALUES.CONTACTS,
    WA_PRIVACY_VALUES.CONTACT_BLACKLIST,
    WA_PRIVACY_VALUES.NONE
] as const)

/**
 * Values each setting actually accepts. The server reports categories the
 * library does not model and can answer `error`, so a value has to be checked
 * against its own setting - a globally valid value is not necessarily valid
 * here, and surfacing one would break the type the public API declares.
 */
export const WA_PRIVACY_SETTING_VALUES = Object.freeze({
    readReceipts: Object.freeze([WA_PRIVACY_VALUES.ALL, WA_PRIVACY_VALUES.NONE] as const),
    lastSeen: VISIBILITY_VALUES,
    online: Object.freeze([
        WA_PRIVACY_VALUES.ALL,
        WA_PRIVACY_VALUES.NONE,
        WA_PRIVACY_VALUES.MATCH_LAST_SEEN
    ] as const),
    profilePicture: VISIBILITY_VALUES,
    about: VISIBILITY_VALUES,
    groupAdd: Object.freeze([
        WA_PRIVACY_VALUES.ALL,
        WA_PRIVACY_VALUES.CONTACTS,
        WA_PRIVACY_VALUES.CONTACT_BLACKLIST
    ] as const),
    callAdd: Object.freeze([
        WA_PRIVACY_VALUES.ALL,
        WA_PRIVACY_VALUES.KNOWN,
        WA_PRIVACY_VALUES.CONTACTS
    ] as const),
    messages: Object.freeze([WA_PRIVACY_VALUES.ALL, WA_PRIVACY_VALUES.CONTACTS] as const),
    defenseMode: Object.freeze([WA_PRIVACY_VALUES.OFF, WA_PRIVACY_VALUES.ON_STANDARD] as const),
    linkedProfiles: VISIBILITY_VALUES,
    pix: VISIBILITY_VALUES
}) satisfies {
    readonly [K in WaPrivacySettingName]: readonly WaPrivacySettingValueMap[K][]
}

export const WA_PRIVACY_DISALLOWED_LIST_CATEGORIES = Object.freeze({
    ABOUT: WA_PRIVACY_CATEGORIES.ABOUT,
    GROUP_ADD: WA_PRIVACY_CATEGORIES.GROUP_ADD,
    LAST_SEEN: WA_PRIVACY_CATEGORIES.LAST_SEEN,
    PROFILE_PICTURE: WA_PRIVACY_CATEGORIES.PROFILE_PICTURE,
    LINKED_PROFILES: WA_PRIVACY_CATEGORIES.LINKED_PROFILES,
    PIX: WA_PRIVACY_CATEGORIES.PIX
} as const)

type DisallowedCategoryToSetting = {
    readonly [K in keyof typeof WA_PRIVACY_DISALLOWED_LIST_CATEGORIES]: (typeof WA_PRIVACY_CATEGORY_TO_SETTING)[(typeof WA_PRIVACY_DISALLOWED_LIST_CATEGORIES)[K]]
}

export type WaPrivacyDisallowedListSettingName =
    DisallowedCategoryToSetting[keyof DisallowedCategoryToSetting]

/**
 * Disallowed lists refreshed alongside the categories whenever an
 * account-sync privacy update lands. Mirrors the set WhatsApp Web resyncs;
 * the remaining deny-list categories are only read on demand.
 */
export const WA_PRIVACY_ACCOUNT_SYNC_DISALLOWED_LISTS = Object.freeze([
    'about',
    'groupAdd',
    'lastSeen',
    'profilePicture'
] as const) satisfies readonly WaPrivacyDisallowedListSettingName[]

export const WA_PRIVACY_TAGS = Object.freeze({
    CATEGORY: 'category',
    LIST: 'list',
    USER: 'user'
} as const)

/** `action` attr of a `<user>` node inside a disallowed-list mutation. */
export const WA_PRIVACY_LIST_ACTIONS = Object.freeze({
    ADD: 'add',
    REMOVE: 'remove'
} as const)

export type WaPrivacyListAction =
    (typeof WA_PRIVACY_LIST_ACTIONS)[keyof typeof WA_PRIVACY_LIST_ACTIONS]

/**
 * Placeholder sent as `dhash` when the client holds no version stamp for a
 * category's disallowed list (first write, or after a failed sync).
 */
export const WA_PRIVACY_DHASH_NONE = 'none'
