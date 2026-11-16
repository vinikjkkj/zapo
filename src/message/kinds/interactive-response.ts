import { unwrapMessage } from '@message/encode/content'
import type { Proto } from '@proto'
import { tryAsRecord } from '@util/coercion'

/** Parsed native-flow response. Params retain their JSON types without copying.
 * @example `const reply: WaNativeFlowResponse | null = parseNativeFlowResponse(message)`
 */
export interface WaNativeFlowResponse {
    readonly name: string
    readonly params: Readonly<Record<string, unknown>>
}

/** One named component from a Business app form response.
 * Calendar range labels retain their object shape. An unanswered component has value undefined.
 * Values can contain personal data even when isSensitive is false; avoid logging responses.
 * @example `const name = response.fields.find((field) => field.name === 'full_name')`
 */
export interface WaNativeFormField {
    readonly screenId: string
    readonly type: string
    readonly name: string
    readonly label: string | Readonly<Record<string, unknown>>
    readonly value?: unknown
    readonly isSensitive: boolean
}

/** Flattened Business app form response. Duplicate names in answers use the last value;
 * fields retain every occurrence and its screen. Answers has a null prototype.
 * Unanswered named components remain in fields and answers with value undefined.
 * @example `const name = parseNativeFormResponse(message)?.answers.full_name`
 */
export interface WaNativeFormResponse {
    readonly flowId: string
    readonly flowName: string
    readonly title: string
    readonly fields: readonly WaNativeFormField[]
    readonly answers: Readonly<Record<string, unknown>>
}

/** Selected reply from a buttons, list, or template message.
 * @example `const choice: WaSelectedMessageReply | null = parseSelectedMessageReply(message)`
 */
export interface WaSelectedMessageReply {
    readonly id: string
    /** Null when the sender omitted the display text. */
    readonly text: string | null
}

/** Treats malformed external JSON as a parse miss while propagating unexpected failures. */
function parseJsonRecord(json: string): Record<string, unknown> | null {
    try {
        return tryAsRecord(JSON.parse(json))
    } catch (error) {
        // Invalid external JSON is an expected parse miss, not a runtime failure.
        if (error instanceof SyntaxError) return null
        throw error
    }
}

/** Reads a native-flow reply, including wrapped messages. Returns null for absent,
 * malformed, or non-object params JSON. Does not throw for invalid external JSON.
 * @example `const id = parseNativeFlowResponse(event.message)?.params.id`
 */
export function parseNativeFlowResponse(message: Proto.IMessage): WaNativeFlowResponse | null {
    const response = unwrapMessage(message).interactiveResponseMessage?.nativeFlowResponseMessage
    if (!response?.name || typeof response.paramsJson !== 'string') return null
    const params = parseJsonRecord(response.paramsJson)
    return params ? { name: response.name, params } : null
}

/** Reads a galaxy_message form response's nested response_message JSON:
 * version 1 uses response, version 2 uses screens. Unversioned screens are also accepted.
 * Returns null for unsupported versions, absent/malformed envelopes, screens, or named components.
 * Unnamed display components are skipped. Labels and values are retained without copying.
 * Normalizes sensitive/isSensitive to isSensitive; sensitive takes precedence when both exist.
 * @example `const answers = parseNativeFormResponse(event.message)?.answers`
 */
export function parseNativeFormResponse(message: Proto.IMessage): WaNativeFormResponse | null {
    const response = parseNativeFlowResponse(message)
    if (response?.name !== 'galaxy_message') return null
    const params = tryAsRecord(response.params.wa_flow_response_params)
    if (
        !params ||
        typeof params.flow_id !== 'string' ||
        typeof params.response_message !== 'string'
    )
        return null
    const body = parseJsonRecord(params.response_message)
    if (!body || (body.version !== undefined && body.version !== 1 && body.version !== 2))
        return null
    const screens = body.version === 1 ? body.response : body.screens
    if (!Array.isArray(screens)) return null
    const fields: WaNativeFormField[] = []
    const answers: Record<string, unknown> = Object.create(null)
    for (const entry of screens) {
        const screen = tryAsRecord(entry)
        if (!screen || typeof screen.id !== 'string' || !Array.isArray(screen.components))
            return null
        for (const entry of screen.components) {
            const component = tryAsRecord(entry)
            if (!component) return null
            if (component.name === undefined || component.name === '') continue
            if (typeof component.name !== 'string' || typeof component.type !== 'string')
                return null
            if (component.isSensitive !== undefined && typeof component.isSensitive !== 'boolean')
                return null
            if (component.sensitive !== undefined && typeof component.sensitive !== 'boolean')
                return null
            const label = component.label === undefined ? '' : component.label
            const parsedLabel = typeof label === 'string' ? label : tryAsRecord(label)
            if (parsedLabel === null) return null
            fields.push({
                screenId: screen.id,
                type: component.type,
                name: component.name,
                label: parsedLabel,
                value: component.value,
                isSensitive: (component.sensitive ?? component.isSensitive) === true
            })
            answers[component.name] = component.value
        }
    }
    return {
        flowId: params.flow_id,
        flowName: typeof params.flow_name === 'string' ? params.flow_name : '',
        title: typeof params.title === 'string' ? params.title : '',
        fields,
        answers
    }
}

/** Reads selected ID and display text from buttonsResponseMessage,
 * listResponseMessage, or templateButtonReplyMessage, including wrapped messages.
 * Native single_select replies use parseNativeFlowResponse instead; their title is in body.text.
 * Returns null when no non-empty selected ID exists.
 * @example `if (parseSelectedMessageReply(event.message)?.id === 'accept') acceptOrder()`
 */
export function parseSelectedMessageReply(message: Proto.IMessage): WaSelectedMessageReply | null {
    const msg = unwrapMessage(message)
    const id =
        msg.buttonsResponseMessage?.selectedButtonId ??
        msg.listResponseMessage?.singleSelectReply?.selectedRowId ??
        msg.templateButtonReplyMessage?.selectedId
    if (!id) return null
    const text =
        msg.buttonsResponseMessage?.selectedDisplayText ??
        msg.listResponseMessage?.title ??
        msg.templateButtonReplyMessage?.selectedDisplayText ??
        null
    return { id, text }
}
