export const WA_STATUS_DISTRIBUTION_SETTINGS = Object.freeze({
    CONTACTS: 'contacts',
    ALLOWLIST: 'allowlist',
    DENYLIST: 'denylist',
    CLOSE_FRIENDS: 'close_friends'
} as const)

export type WaStatusDistributionSetting =
    (typeof WA_STATUS_DISTRIBUTION_SETTINGS)[keyof typeof WA_STATUS_DISTRIBUTION_SETTINGS]
