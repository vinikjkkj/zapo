export const WA_GROUP_PARTICIPANT_TYPES = Object.freeze({
    SUPERADMIN: 'superadmin',
    ADMIN: 'admin',
    REGULAR: 'participant'
} as const)

/** `<membership_requests_action>` child tags for approving/rejecting group join requests. */
export const WA_GROUP_MEMBERSHIP_ACTION_TAGS = Object.freeze({
    REQUESTS_ACTION: 'membership_requests_action',
    APPROVE: 'approve',
    REJECT: 'reject'
} as const)

export type WaGroupSetting =
    | 'announcement'
    | 'restrict'
    | 'ephemeral'
    | 'membership_approval_mode'
    | 'allow_non_admin_sub_group_creation'
    | 'group_history'
    | 'allow_admin_reports'
    | 'no_frequently_forwarded'
