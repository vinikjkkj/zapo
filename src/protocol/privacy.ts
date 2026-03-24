export const WA_PRIVACY_CATEGORIES = Object.freeze({
    READ_RECEIPTS: 'readreceipts',
    LAST_SEEN: 'last',
    ONLINE: 'online',
    PROFILE_PICTURE: 'profile',
    ABOUT: 'status',
    GROUP_ADD: 'groupadd',
    CALL_ADD: 'calladd',
    MESSAGES: 'messages',
    DEFENSE_MODE: 'defense'
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
    [WA_PRIVACY_CATEGORIES.DEFENSE_MODE]: 'defenseMode'
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
    defenseMode: WA_PRIVACY_CATEGORIES.DEFENSE_MODE
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
}

export const WA_PRIVACY_DISALLOWED_LIST_CATEGORIES = Object.freeze({
    ABOUT: WA_PRIVACY_CATEGORIES.ABOUT,
    GROUP_ADD: WA_PRIVACY_CATEGORIES.GROUP_ADD,
    LAST_SEEN: WA_PRIVACY_CATEGORIES.LAST_SEEN,
    PROFILE_PICTURE: WA_PRIVACY_CATEGORIES.PROFILE_PICTURE
} as const)

type DisallowedCategoryToSetting = {
    readonly [K in keyof typeof WA_PRIVACY_DISALLOWED_LIST_CATEGORIES]: (typeof WA_PRIVACY_CATEGORY_TO_SETTING)[(typeof WA_PRIVACY_DISALLOWED_LIST_CATEGORIES)[K]]
}

export type WaPrivacyDisallowedListSettingName =
    DisallowedCategoryToSetting[keyof DisallowedCategoryToSetting]

export const WA_PRIVACY_TAGS = Object.freeze({
    CATEGORY: 'category',
    LIST: 'list',
    USER: 'user'
} as const)
