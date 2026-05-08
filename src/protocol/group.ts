export const WA_GROUP_PARTICIPANT_TYPES = Object.freeze({
    SUPERADMIN: 'superadmin',
    ADMIN: 'admin',
    REGULAR: 'participant'
} as const)

export type WaGroupSetting =
    | 'announcement'
    | 'restrict'
    | 'ephemeral'
    | 'membership_approval_mode'
    | 'allow_non_admin_sub_group_creation'
