import {
    WaBusinessAgentAuthentication,
    type WaBusinessAgentAuthenticationOptions
} from '@client/business-agent/authentication'
import { WaBusinessAgentError } from '@client/business-agent/errors'
import {
    createBusinessAgentHttp,
    isBusinessAgentRecord,
    type WaBusinessAgentHttpOptions
} from '@client/business-agent/http'
import type {
    WaBusinessAgentCoordinator,
    WaBusinessAgentMutationResult
} from '@client/business-agent/types'
import { buildInboundAck, sendSafeAck } from '@client/events/incoming'
import type { Logger } from '@infra/log/types'
import { WA_BUSINESS_AGENT } from '@protocol/business-agent'
import { isBusinessAuthenticationNode } from '@transport/node/builders/business-agent'
import type { BinaryNode } from '@transport/types'

interface WaBusinessAgentCoordinatorOptions extends WaBusinessAgentAuthenticationOptions {
    readonly logger: Logger
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly dispatcher?: WaBusinessAgentHttpOptions['dispatcher']
    readonly fetch?: typeof fetch
    readonly httpTimeoutMs?: number
}

function field(data: Record<string, unknown>, name: string): Record<string, unknown> | null {
    if (!(name in data)) throw new WaBusinessAgentError('invalid_response')
    const value = data[name]
    if (value === null) return null
    if (!isBusinessAgentRecord(value)) throw new WaBusinessAgentError('invalid_response')
    return value
}

function text(value: unknown): string | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string') throw new WaBusinessAgentError('invalid_response')
    return value
}

function bool(value: unknown): boolean | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'boolean') throw new WaBusinessAgentError('invalid_response')
    return value
}

function confirmation(value: Record<string, unknown> | null): WaBusinessAgentMutationResult {
    return {
        outcome:
            value?.success === true ? 'accepted' : value?.success === false ? 'rejected' : 'unknown'
    }
}

function assertStatus(value: unknown): void {
    if (value !== 'ENABLED' && value !== 'MUTED')
        throw new TypeError('invalid Business Agent reply status')
}

/** Creates the connection-bound native Business Agent runtime and its credential-free public facade. */
export function createBusinessAgentCoordinator(options: WaBusinessAgentCoordinatorOptions): {
    readonly api: WaBusinessAgentCoordinator
    readonly invalidate: () => void
    readonly handleNotification: (node: BinaryNode) => Promise<boolean>
} {
    const authentication = new WaBusinessAgentAuthentication(options)
    const request = createBusinessAgentHttp({
        authentication,
        dispatcher: options.dispatcher,
        fetch: options.fetch,
        timeoutMs: options.httpTimeoutMs
    })
    const documents = WA_BUSINESS_AGENT.DOCUMENTS
    const api: WaBusinessAgentCoordinator = {
        getStatus: async () => {
            const result = field(
                await request(documents.status, {}),
                'xfb_meta_ai_biz_agent_wa_ai_home'
            )
            if (result?.abilities === null || result?.abilities === undefined) return null
            if (!Array.isArray(result.abilities)) throw new WaBusinessAgentError('invalid_response')
            return result.abilities.map((ability: unknown) => {
                if (!isBusinessAgentRecord(ability))
                    throw new WaBusinessAgentError('invalid_response')
                return { type: text(ability.type), status: text(ability.status) }
            })
        },
        getEligibility: async () =>
            bool(
                field(
                    await request(documents.eligibility, {}),
                    'xfb_meta_ai_biz_agent_wa_onboarding_eligibility'
                )?.eligible
            ),
        getAvailability: async () =>
            bool(
                field(
                    await request(documents.availability, {}),
                    'xfb_meta_ai_biz_agent_wa_large_screens_gate'
                )?.value
            ),
        getResponseSettings: async () => {
            const result = field(
                await request(documents.settings, {}),
                'xfb_meta_ai_biz_agent_wa_fetch_response_settings_v2'
            )
            if (result === null) return null
            if (
                result.audience_rules !== null &&
                result.audience_rules !== undefined &&
                !Array.isArray(result.audience_rules)
            )
                throw new WaBusinessAgentError('invalid_response')
            const rules = result.audience_rules as unknown[] | null | undefined
            return {
                status: text(result.status),
                audienceRules:
                    rules === null || rules === undefined
                        ? null
                        : rules.map((rule) => {
                              if (!isBusinessAgentRecord(rule))
                                  throw new WaBusinessAgentError('invalid_response')
                              return {
                                  selectorType: text(rule.selector_type),
                                  mode: text(rule.mode)
                              }
                          })
            }
        },
        getResponseSettingsAvailability: async () => {
            const result = field(
                await request(documents.settingsAvailability, {}),
                'xfb_meta_ai_biz_agent_wa_fetch_qe_bool'
            )
            return result === null
                ? null
                : { success: bool(result.success), value: bool(result.value) }
        },
        updateResponseSettings: async (input) => {
            if (
                !isBusinessAgentRecord(input) ||
                Object.keys(input).some((key) => key !== 'status' && key !== 'audienceRules') ||
                (input.status === undefined && input.audienceRules === undefined)
            )
                throw new TypeError('invalid Business Agent settings input')
            if (input.status !== undefined) assertStatus(input.status)
            if (
                input.audienceRules !== undefined &&
                (!Array.isArray(input.audienceRules) || input.audienceRules.length < 1)
            )
                throw new TypeError('invalid Business Agent audience rules')
            const rules = input.audienceRules?.map((rule) => {
                if (
                    !isBusinessAgentRecord(rule) ||
                    Object.keys(rule).some((key) => key !== 'selectorType' && key !== 'mode') ||
                    typeof rule.selectorType !== 'string' ||
                    !['CONTACTS', 'ADS', 'ALL'].includes(rule.selectorType) ||
                    typeof rule.mode !== 'string' ||
                    !['MUTED', 'SUGGESTED_REPLIES', 'UNMUTED'].includes(rule.mode)
                )
                    throw new TypeError('invalid Business Agent audience rule')
                return { selector_type: rule.selectorType, mode: rule.mode }
            })
            return confirmation(
                field(
                    await request(documents.updateSettings, {
                        input: {
                            ...(input.status === undefined ? {} : { status: input.status }),
                            ...(rules === undefined ? {} : { audience_rules: rules })
                        }
                    }),
                    'xfb_meta_ai_biz_agent_wa_update_response_settings_v2'
                )
            )
        },
        setConversationReplies: async (input) => {
            if (
                !isBusinessAgentRecord(input) ||
                Object.keys(input).some(
                    (key) => !['status', 'consumerLid', 'phoneNumber'].includes(key)
                )
            )
                throw new TypeError('invalid Business Agent conversation input')
            assertStatus(input.status)
            if (input.consumerLid === undefined && input.phoneNumber === undefined)
                throw new TypeError('a verified customer identifier is required')
            for (const identifier of [input.consumerLid, input.phoneNumber]) {
                if (
                    identifier !== undefined &&
                    (typeof identifier !== 'string' || !/^[1-9]\d{0,19}$/.test(identifier))
                )
                    throw new TypeError('invalid Business Agent customer identifier')
            }
            return confirmation(
                field(
                    await request(documents.conversationReplies, {
                        thread_status: input.status,
                        ...(input.consumerLid === undefined
                            ? {}
                            : { consumer_lid: input.consumerLid }),
                        ...(input.phoneNumber === undefined
                            ? {}
                            : { phone_number: input.phoneNumber })
                    }),
                    'xfb_whatsapp_smb_maiba_status_update'
                )
            )
        },
        updateReengagement: async (input) => {
            if (
                !isBusinessAgentRecord(input) ||
                Object.keys(input).some((key) => key !== 'enabled' && key !== 'amount') ||
                typeof input.enabled !== 'boolean' ||
                (input.amount !== undefined && !Number.isSafeInteger(input.amount))
            )
                throw new TypeError('invalid Business Agent reengagement input')
            const result = field(
                await request(documents.reengagement, {
                    request: {
                        enabled: input.enabled,
                        ...(input.amount === undefined ? {} : { amount: input.amount })
                    }
                }),
                'xfb_meta_ai_biz_agent_wa_update_reengagement'
            )
            return {
                outcome:
                    result?.enabled === input.enabled &&
                    (input.amount === undefined || result?.amount === input.amount)
                        ? 'accepted'
                        : 'unknown'
            }
        }
    }
    return {
        api: Object.freeze(api),
        invalidate: () => authentication.invalidate(),
        handleNotification: async (node) => {
            if (node.tag !== 'notification' || !isBusinessAuthenticationNode(node)) return false
            authentication.ingest(node)
            const ack = buildInboundAck(node)
            if (ack) await sendSafeAck(options.logger, options.sendNode, ack)
            return true
        }
    }
}
