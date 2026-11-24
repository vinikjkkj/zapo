/** Native global and per-conversation reply control. Business-only, experimental. */
export type WaBusinessAgentReplyStatus = 'ENABLED' | 'MUTED'

/** Known writable audience selectors; reads preserve unknown future values. */
export interface WaBusinessAgentAudienceRule {
    readonly selectorType: 'CONTACTS' | 'ADS' | 'ALL'
    readonly mode: 'MUTED' | 'SUGGESTED_REPLIES' | 'UNMUTED'
}

/** Replaces the complete audience rule array when supplied. At least one field is required. */
export interface WaBusinessAgentSettingsUpdate {
    readonly status?: WaBusinessAgentReplyStatus
    readonly audienceRules?: readonly WaBusinessAgentAudienceRule[]
}

/** Current native settings; unknown status and audience enums are preserved. */
export interface WaBusinessAgentSettings {
    readonly status: string | null
    readonly audienceRules:
        | readonly { readonly selectorType: string | null; readonly mode: string | null }[]
        | null
}

/**
 * @sensitive Customer identifiers. Never log or serialize this input; encrypt at rest.
 * Supply a consumer LID or phone number verified from the conversation, never guessed mappings.
 */
export interface WaBusinessAgentConversationUpdate {
    readonly consumerLid?: string
    readonly phoneNumber?: string
    readonly status: WaBusinessAgentReplyStatus
}

/** Native follow-up settings. The server enforces account-specific amount limits. */
export interface WaBusinessAgentReengagementUpdate {
    readonly enabled: boolean
    readonly amount?: number
}

/** An HTTP 200 alone does not confirm a write. Unknown outcomes require reconciliation. */
export interface WaBusinessAgentMutationResult {
    readonly outcome: 'accepted' | 'rejected' | 'unknown'
}

/** One ability advertised by the native agent. */
export interface WaBusinessAgentAbility {
    readonly type: string | null
    readonly status: string | null
}

/** V2 gate returns both its execution confirmation and the account gate value. */
export interface WaBusinessAgentSettingsAvailability {
    readonly success: boolean | null
    readonly value: boolean | null
}

/**
 * Experimental Meta Business Agent controls via the connected Business QR session.
 * Account eligibility and feature rollout are enforced by Meta. This does not provision an agent.
 * All network methods may throw WaBusinessAgentError; writes are never retried automatically.
 * @example
 * const settings = await client.businessAgent.getResponseSettings()
 * const result = await client.businessAgent.updateResponseSettings({ status: 'MUTED' })
 */
export interface WaBusinessAgentCoordinator {
    /** Reads native ability status. No settings are changed. */
    readonly getStatus: () => Promise<readonly WaBusinessAgentAbility[] | null>
    /** Reads onboarding eligibility; null means the native result is absent. */
    readonly getEligibility: () => Promise<boolean | null>
    /** Reads the native large-screen feature gate. */
    readonly getAvailability: () => Promise<boolean | null>
    /** Reads V2 settings through the native fetch mutation, which has read-only effect. */
    readonly getResponseSettings: () => Promise<WaBusinessAgentSettings | null>
    /** Reads the V2 settings feature gate. */
    readonly getResponseSettingsAvailability: () => Promise<WaBusinessAgentSettingsAvailability | null>
    /** Updates global reply status or replaces the complete audience rule array. */
    readonly updateResponseSettings: (
        input: WaBusinessAgentSettingsUpdate
    ) => Promise<WaBusinessAgentMutationResult>
    /** Updates reply status for a verified customer conversation. */
    readonly setConversationReplies: (
        input: WaBusinessAgentConversationUpdate
    ) => Promise<WaBusinessAgentMutationResult>
    /** Updates native reengagement; accepted requires matching applied settings in the response. */
    readonly updateReengagement: (
        input: WaBusinessAgentReengagementUpdate
    ) => Promise<WaBusinessAgentMutationResult>
}
