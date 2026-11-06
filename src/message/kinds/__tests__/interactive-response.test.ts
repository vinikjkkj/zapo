import assert from 'node:assert/strict'
import test from 'node:test'

import {
    parseNativeFlowResponse,
    parseNativeFormResponse,
    parseSelectedMessageReply
} from '@message/kinds/interactive-response'
import { type Proto, proto } from '@proto'

function response(params: unknown, name = 'galaxy_message'): Proto.IMessage {
    return {
        interactiveResponseMessage: {
            nativeFlowResponseMessage: { name, paramsJson: JSON.stringify(params), version: 3 }
        }
    }
}

function form(
    screens: unknown,
    version: number | undefined = 2,
    legacyResponse?: unknown
): Proto.IMessage {
    return response({
        wa_flow_response_params: {
            flow_id: '123456',
            flow_name: 'Contact details',
            title: 'Details submitted',
            response_message: JSON.stringify({ screens, version, response: legacyResponse })
        }
    })
}

test('native flow parser reads generic params and unwraps the response', () => {
    const message = response({ id: 'tea', display_text: 'Tea', enabled: true }, 'single_select')
    const wrapped = { documentWithCaptionMessage: { message } }
    assert.deepEqual(
        parseNativeFlowResponse(proto.Message.decode(proto.Message.encode(wrapped).finish())),
        { name: 'single_select', params: { id: 'tea', display_text: 'Tea', enabled: true } }
    )
    assert.equal(parseNativeFormResponse(message), null)
})

test('native flow parser reads Android menu_options list replies with omitted version', () => {
    // Synthetic payload derived from the Android list reply serializer.
    const message = roundTrip({
        interactiveResponseMessage: {
            body: { text: 'Tea' },
            nativeFlowResponseMessage: {
                name: 'menu_options',
                paramsJson: JSON.stringify({ id: 'tea', description: 'Hot drink' })
            }
        }
    })
    assert.deepEqual(parseNativeFlowResponse(message), {
        name: 'menu_options',
        params: { id: 'tea', description: 'Hot drink' }
    })
    assert.equal(message.interactiveResponseMessage?.body?.text, 'Tea')
    assert.equal(
        Object.prototype.hasOwnProperty.call(
            message.interactiveResponseMessage.nativeFlowResponseMessage,
            'version'
        ),
        false
    )
    assert.equal(parseSelectedMessageReply(message), null)
    assert.equal(parseNativeFormResponse(message), null)
})

test('native form parser flattens screens and preserves values and sensitivity', () => {
    const message = form([
        {
            id: 'contact_details',
            components: [
                { type: 'TextHeading', label: 'Contact' },
                {
                    type: 'TextInput',
                    name: 'full_name',
                    label: 'Name',
                    value: 'Sample User',
                    isSensitive: false
                },
                {
                    type: 'TextInput',
                    name: 'email',
                    label: 'Email',
                    value: 'user@example.com',
                    isSensitive: true
                }
            ]
        },
        {
            id: 'preferences',
            components: [
                {
                    type: 'CheckboxGroup',
                    name: 'topics',
                    label: 'Topics',
                    value: ['news', 'offers'],
                    isSensitive: false
                },
                { type: 'OptIn', name: 'consent', value: false },
                { type: 'TextInput', name: 'count', value: 0 },
                { type: 'TextInput', name: 'empty', value: null }
            ]
        }
    ])
    const parsed = parseNativeFormResponse(
        proto.Message.decode(proto.Message.encode(message).finish())
    )!
    assert.equal(parsed.flowId, '123456')
    assert.equal(parsed.flowName, 'Contact details')
    assert.equal(parsed.title, 'Details submitted')
    assert.deepEqual(parsed.fields[1], {
        screenId: 'contact_details',
        type: 'TextInput',
        name: 'email',
        label: 'Email',
        value: 'user@example.com',
        isSensitive: true
    })
    assert.equal(parsed.fields.length, 6)
    assert.deepEqual(
        { ...parsed.answers },
        {
            full_name: 'Sample User',
            email: 'user@example.com',
            topics: ['news', 'offers'],
            consent: false,
            count: 0,
            empty: null
        }
    )
    assert.equal(parsed.fields[2].value, parsed.answers.topics)
})

test('form answers safely preserve prototype-like names and duplicate fields', () => {
    const parsed = parseNativeFormResponse(
        form([
            {
                id: 'screen',
                components: [
                    { type: 'TextInput', name: '__proto__', value: 'safe' },
                    { type: 'TextInput', name: 'constructor', value: 1 },
                    { type: 'TextInput', name: 'constructor', value: 2 }
                ]
            }
        ])
    )!
    assert.equal(Object.getPrototypeOf(parsed.answers), null)
    assert.equal(parsed.answers.__proto__, 'safe')
    assert.equal(parsed.answers.constructor, 2)
    assert.equal(parsed.fields.length, 3)
})

test('native form parser reads v1 answers instead of screen metadata', () => {
    const message = form([{ id: 'contact', components: [{ name: 'email', label: 'Email' }] }], 1, [
        {
            id: 'contact',
            title: 'Contact',
            components: [
                {
                    type: 'TextInput',
                    name: 'email',
                    label: 'Email',
                    value: 'user@example.com',
                    sensitive: true,
                    componentData: { componentValue: 'user@example.com' }
                }
            ]
        }
    ])
    const parsed = parseNativeFormResponse(roundTrip(message))!
    assert.ok(parsed)
    assert.deepEqual(parsed.fields, [
        {
            screenId: 'contact',
            type: 'TextInput',
            name: 'email',
            label: 'Email',
            value: 'user@example.com',
            isSensitive: true
        }
    ])
    assert.equal(parsed.answers.email, 'user@example.com')
    assert.equal(parseNativeFormResponse(form([], 1)), null)
    assert.equal(parseNativeFormResponse(form([], 1, {})), null)
    assert.deepEqual(parseNativeFormResponse(form([], 1, []))?.fields, [])
})

function roundTrip(message: Proto.IMessage): Proto.IMessage {
    return proto.Message.decode(proto.Message.encode(message).finish())
}

test('native form parser preserves calendar labels and unanswered v2 components', () => {
    const label = { 'start-date': 'Arrival', 'end-date': 'Departure' }
    const value = { 'start-date': '2026-11-06', 'end-date': '2026-11-08' }
    const parsed = parseNativeFormResponse(
        roundTrip(
            form([
                {
                    id: 'booking',
                    components: [
                        { type: 'CalendarPicker', name: 'dates', label, value, isSensitive: false },
                        { type: 'TextArea', name: 'notes', label: 'Notes', isSensitive: true }
                    ]
                }
            ])
        )
    )!
    assert.ok(parsed)
    assert.deepEqual(parsed.fields[0].label, label)
    assert.deepEqual(parsed.fields[0].value, value)
    assert.equal(parsed.fields[0].value, parsed.answers.dates)
    assert.equal(parsed.fields[1].value, undefined)
    assert.equal(parsed.fields[1].isSensitive, true)
    assert.equal(Object.prototype.hasOwnProperty.call(parsed.answers, 'notes'), true)
    assert.equal(parsed.answers.notes, undefined)
})

test('native form parser preserves unversioned screens and normalizes sensitivity', () => {
    const message = response({
        wa_flow_response_params: {
            flow_id: '123',
            response_message: JSON.stringify({
                screens: [
                    {
                        id: 'contact',
                        components: [
                            { type: 'TextInput', name: 'a', value: 'A', sensitive: true },
                            { type: 'TextInput', name: 'b', value: 'B', isSensitive: true },
                            {
                                type: 'TextInput',
                                name: 'c',
                                value: 'C',
                                sensitive: false,
                                isSensitive: true
                            }
                        ]
                    }
                ]
            })
        }
    })
    const parsed = parseNativeFormResponse(message)!
    assert.ok(parsed)
    assert.deepEqual(
        parsed.fields.map((field) => field.isSensitive),
        [true, true, false]
    )
    assert.equal(parseNativeFormResponse(form([], 3)), null)
})

for (const json of ['{', 'null', '[]', 'true', '"text"']) {
    test(`native flow parser rejects malformed/non-object JSON ${json}`, () => {
        assert.equal(
            parseNativeFlowResponse({
                interactiveResponseMessage: {
                    nativeFlowResponseMessage: { name: 'quick_reply', paramsJson: json }
                }
            }),
            null
        )
    })
}

test('parsers return null for missing envelopes, names, IDs and payloads', () => {
    assert.equal(parseNativeFlowResponse({}), null)
    assert.equal(
        parseNativeFlowResponse({
            interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{}' } }
        }),
        null
    )
    assert.equal(parseNativeFormResponse(response({})), null)
    assert.equal(
        parseNativeFormResponse(
            response({ wa_flow_response_params: { flow_id: '1', response_message: '{' } })
        ),
        null
    )
    assert.equal(parseSelectedMessageReply({}), null)
    assert.equal(
        parseSelectedMessageReply({ buttonsResponseMessage: { selectedButtonId: '' } }),
        null
    )
})

for (const screens of [
    null,
    {},
    [null],
    [{ id: 1, components: [] }],
    [{ id: 'a', components: null }],
    [{ id: 'a', components: [null] }],
    [{ id: 'a', components: [{ name: 'x', value: 1 }] }],
    [{ id: 'a', components: [{ type: 'TextInput', name: 1, value: 1 }] }],
    [{ id: 'a', components: [{ type: 'TextInput', name: 'x', label: [], value: 1 }] }],
    [{ id: 'a', components: [{ type: 'TextInput', name: 'x', label: null, value: 1 }] }],
    [{ id: 'a', components: [{ type: 'TextInput', name: 'x', sensitive: 'true', value: 1 }] }],
    [{ id: 'a', components: [{ type: 'TextInput', name: 'x', value: 1, isSensitive: 'true' }] }]
]) {
    test(`form parser rejects malformed screens ${JSON.stringify(screens)}`, () =>
        assert.equal(parseNativeFormResponse(form(screens)), null))
}

for (const [name, message] of [
    [
        'buttons',
        { buttonsResponseMessage: { selectedButtonId: 'yes', selectedDisplayText: 'Yes' } }
    ],
    [
        'list',
        { listResponseMessage: { singleSelectReply: { selectedRowId: 'yes' }, title: 'Yes' } }
    ],
    ['template', { templateButtonReplyMessage: { selectedId: 'yes', selectedDisplayText: 'Yes' } }]
] as const) {
    test(`selected reply extracts ${name} ID and display text`, () => {
        assert.deepEqual(parseSelectedMessageReply({ ephemeralMessage: { message } }), {
            id: 'yes',
            text: 'Yes'
        })
    })
}

test('selected reply distinguishes missing text from an empty display text', () => {
    assert.deepEqual(
        parseSelectedMessageReply({ buttonsResponseMessage: { selectedButtonId: 'yes' } }),
        { id: 'yes', text: null }
    )
    assert.deepEqual(
        parseSelectedMessageReply({
            buttonsResponseMessage: { selectedButtonId: 'yes', selectedDisplayText: '' }
        }),
        { id: 'yes', text: '' }
    )
})

test('native form v1 reads display values rather than raw component data', () => {
    const message = form([], 1, [
        {
            id: 'choice',
            components: [
                {
                    name: 'plan',
                    type: 'RadioButtonsGroup',
                    label: 'Plan',
                    value: 'Premium',
                    sensitive: false,
                    componentData: {
                        componentMeta: { type: 'RadioButtonsGroup', name: 'plan' },
                        componentValue: 'premium_id'
                    }
                }
            ]
        }
    ])
    assert.equal(parseNativeFormResponse(roundTrip(message))?.answers.plan, 'Premium')
})
