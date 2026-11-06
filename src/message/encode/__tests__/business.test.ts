import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBusinessMessage } from '@message/encode/business'
import {
    isSendTypedMessage,
    resolveButtonAddonKind,
    resolveOutboundMessageAttrs,
    unwrapMessage
} from '@message/encode/content'
import type { WaNativeFlowButton, WaSendBusinessMessage, WaSendChargeMessage } from '@message/types'
import { type Proto, proto } from '@proto'

const ME = '15551234567:8@s.whatsapp.net'
const PIX = { merchantName: 'Shop', key: 'pay@example.com', keyType: 'EMAIL' } as const

function params(message: Proto.IMessage): Record<string, unknown> {
    return JSON.parse(message.interactiveMessage!.nativeFlowMessage!.buttons![0].buttonParamsJson!)
}

function roundTrip(message: Proto.IMessage): Proto.IMessage {
    return proto.Message.decode(proto.Message.encode(message).finish())
}

test('buttons encode RESPONSE buttons inside FutureProofMessage with EMPTY/TEXT headers', () => {
    const content = {
        type: 'buttons',
        text: 'Choose',
        footer: 'Today',
        buttons: [{ id: 'yes', text: 'Yes' }]
    } as const
    const { message } = buildBusinessMessage(content)
    assert.deepEqual(message, {
        documentWithCaptionMessage: {
            message: {
                buttonsMessage: {
                    contentText: 'Choose',
                    footerText: 'Today',
                    headerType: proto.Message.ButtonsMessage.HeaderType.EMPTY,
                    buttons: [
                        {
                            buttonId: 'yes',
                            buttonText: { displayText: 'Yes' },
                            type: proto.Message.ButtonsMessage.Button.Type.RESPONSE
                        }
                    ]
                }
            }
        }
    })
    const header = unwrapMessage(
        roundTrip(buildBusinessMessage({ ...content, header: 'Question' }).message)
    ).buttonsMessage!
    assert.equal(header.text, 'Question')
    assert.equal(header.headerType, proto.Message.ButtonsMessage.HeaderType.TEXT)
    assert.equal(header.buttons?.[0].buttonId, 'yes')
    assert.equal(resolveButtonAddonKind(message), 'interactive')
    assert.equal(resolveOutboundMessageAttrs(message).mediatype, 'button')
})

test('buttons omit empty headers and preserve non-empty whitespace headers', () => {
    for (const header of ['', ' ']) {
        const { message } = buildBusinessMessage({
            type: 'buttons',
            text: 'Choose',
            header,
            buttons: [{ id: 'yes', text: 'Yes' }]
        })
        const buttons = unwrapMessage(roundTrip(message)).buttonsMessage!
        assert.equal(
            buttons.headerType,
            header === ''
                ? proto.Message.ButtonsMessage.HeaderType.EMPTY
                : proto.Message.ButtonsMessage.HeaderType.TEXT
        )
        assert.equal(Object.prototype.hasOwnProperty.call(buttons, 'text'), header !== '')
        if (header !== '') assert.equal(buttons.text, header)
    }
})

const BUTTON_CASES: readonly [WaNativeFlowButton, string, object][] = [
    [
        { type: 'quick_reply', id: 'ok', text: 'OK' },
        'quick_reply',
        { display_text: 'OK', id: 'ok' }
    ],
    [
        { type: 'cta_url', text: 'Visit', url: 'https://example.com' },
        'cta_url',
        { display_text: 'Visit', url: 'https://example.com', merchant_url: 'https://example.com' }
    ],
    [
        { type: 'cta_url', text: 'Form', url: 'https://example.com/form', webview: true },
        'cta_url',
        {
            display_text: 'Form',
            url: 'https://example.com/form',
            merchant_url: 'https://example.com/form',
            webview_presentation: 'full',
            webview_interaction: true
        }
    ],
    [
        { type: 'cta_copy', text: 'Copy', code: 'SAVE' },
        'cta_copy',
        { display_text: 'Copy', copy_code: 'SAVE', id: 'SAVE' }
    ],
    [
        { type: 'cta_call', text: 'Call', phoneNumber: '+15551234567' },
        'cta_call',
        { display_text: 'Call', phone_number: '+15551234567' }
    ],
    [{ type: 'cta_catalog' }, 'cta_catalog', { business_phone_number: '15551234567' }],
    [
        { type: 'cta_catalog', productId: '123', businessPhoneNumber: '+15557654321' },
        'cta_catalog',
        { business_phone_number: '15557654321', catalog_product_id: '123' }
    ]
]
for (const [button, name, expected] of BUTTON_CASES) {
    test(`interactive encodes ${name} ${JSON.stringify(button)} exactly`, () => {
        const { message } = buildBusinessMessage(
            {
                type: 'interactive',
                text: 'Choose',
                footer: 'Footer',
                header: 'Title',
                buttons: [button]
            },
            ME
        )
        assert.deepEqual(message, {
            interactiveMessage: {
                body: { text: 'Choose' },
                footer: { text: 'Footer' },
                header: { title: 'Title', hasMediaAttachment: false },
                nativeFlowMessage: {
                    buttons: [{ name, buttonParamsJson: JSON.stringify(expected) }],
                    messageParamsJson: '',
                    messageVersion: 1
                }
            }
        })
        assert.deepEqual(params(roundTrip(message)), expected)
        const addonKind = name === 'cta_catalog' ? 'cta_catalog' : 'interactive'
        const wrapped = { documentWithCaptionMessage: { message: roundTrip(message) } }
        assert.equal(resolveButtonAddonKind(wrapped), addonKind)
        assert.equal(resolveOutboundMessageAttrs(wrapped).buttonAddonKind, addonKind)
    })
}

test('interactive catalog routing follows the first button without reordering actions', () => {
    const catalog = { type: 'cta_catalog' } as const
    const url = { type: 'cta_url', text: 'Visit', url: 'https://example.com' } as const
    for (const buttons of [
        [catalog, url],
        [url, catalog]
    ]) {
        const { message } = buildBusinessMessage(
            { type: 'interactive', text: 'Browse', buttons },
            ME
        )
        assert.equal(
            resolveButtonAddonKind(message),
            buttons[0].type === 'cta_catalog' ? 'cta_catalog' : 'interactive'
        )
        assert.deepEqual(
            message.interactiveMessage?.nativeFlowMessage?.buttons?.map((button) => button.name),
            buttons.map((button) => button.type)
        )
    }
})

test('interactive enforces top-level quick reply and CTA limits', () => {
    const replies: WaNativeFlowButton[] = Array.from({ length: 11 }, (_, index) => ({
        type: 'quick_reply',
        id: String(index),
        text: `Choice ${index}`
    }))
    const ctas: WaNativeFlowButton[] = [
        { type: 'cta_url', text: 'Visit', url: 'https://example.com' },
        { type: 'cta_copy', text: 'Copy', code: 'SAVE' },
        { type: 'cta_catalog' },
        { type: 'cta_call', text: 'Call', phoneNumber: '+15551234567' }
    ]
    const build = (buttons: readonly WaNativeFlowButton[]) =>
        buildBusinessMessage({ type: 'interactive', text: 'Choose', buttons }, ME)
    assert.equal(
        build(replies.slice(0, 10)).message.interactiveMessage?.nativeFlowMessage?.buttons?.length,
        10
    )
    assert.equal(
        build(ctas.slice(0, 3)).message.interactiveMessage?.nativeFlowMessage?.buttons?.length,
        3
    )
    assert.throws(() => build(replies), /at most 10 quick replies/)
    assert.throws(() => build(ctas), /at most 3 CTA buttons/)
    for (const cta of ctas) {
        assert.throws(() => build([replies[0], cta]), /cannot mix/)
        assert.throws(() => build([cta, replies[0]]), /cannot mix/)
    }
})

test('carousel accepts 100 cards and rejects 101 without applying top-level button rules', () => {
    const card = {
        title: 'Card',
        text: 'Details',
        media: { type: 'image', media: new Uint8Array([1]), mimetype: 'image/jpeg' },
        buttons: [
            { type: 'quick_reply', id: 'yes', text: 'Yes' },
            { type: 'cta_url', text: 'Visit', url: 'https://example.com' }
        ]
    } as const
    const cards = Array.from({ length: 101 }, (_, index) => ({
        ...card,
        buttons: [{ ...card.buttons[0], id: `yes-${index}` }, card.buttons[1]]
    }))
    const built = buildBusinessMessage({
        type: 'carousel',
        text: 'Cards',
        cards: cards.slice(0, 100)
    })
    const carousel = roundTrip(built.message).interactiveMessage!.carouselMessage!
    assert.equal(carousel.cards?.length, 100)
    assert.equal(carousel.cards[0].nativeFlowMessage?.buttons?.length, 2)
    assert.throws(
        () => buildBusinessMessage({ type: 'carousel', text: 'Cards', cards }),
        /at most 100 cards/
    )
})

test('native form requires a decimal string ID without numeric coercion', () => {
    const content = { type: 'native-form', text: 'Details', flowCta: 'Open' } as const
    const flowId = '000123456789012345678901234567890'
    assert.equal(
        params(roundTrip(buildBusinessMessage({ ...content, flowId }).message)).flow_id,
        flowId
    )
    for (const invalid of ['abc', '12a', ' 123', '123 ', '123\n', '+123', '1.2', '1e3', '١٢٣']) {
        assert.throws(() => buildBusinessMessage({ ...content, flowId: invalid }), /flowId/)
    }
})

test('list uses single_select native flow and preserves row headers/descriptions', () => {
    const sections = [
        {
            title: 'Drinks',
            rows: [{ id: 'tea', title: 'Tea', header: 'Hot', description: 'Green' }]
        }
    ]
    const { message } = buildBusinessMessage({
        type: 'list',
        text: 'Menu',
        buttonText: 'Choose',
        sections
    })
    assert.equal(message.listMessage, undefined)
    assert.equal(message.interactiveMessage?.nativeFlowMessage?.buttons?.[0].name, 'single_select')
    assert.deepEqual(params(roundTrip(message)), { title: 'Choose', sections })
    assert.equal(resolveButtonAddonKind(message), 'interactive')
    assert.equal(resolveOutboundMessageAttrs(message).typeAttr, 'text')
})

test('native form encodes navigate v4 with proto v3 and exposes supplied/generated token', () => {
    const content = {
        type: 'native-form',
        text: 'Details',
        flowId: '123',
        flowCta: 'Fill form'
    } as const
    const supplied = buildBusinessMessage({
        ...content,
        flowToken: 'request-1',
        formType: 'template',
        flowActionPayload: { screen: 'contact', data: { enabled: true } }
    })
    assert.equal(supplied.flowToken, 'request-1')
    assert.deepEqual(params(roundTrip(supplied.message)), {
        flow_action: 'navigate',
        flow_message_version: '4',
        flow_cta: 'Fill form',
        form_type: 'template',
        flow_id: '123',
        flow_token: 'request-1',
        flow_action_payload: { screen: 'contact', data: { enabled: true } }
    })
    assert.equal(supplied.message.interactiveMessage?.nativeFlowMessage?.messageVersion, 3)
    assert.equal(
        supplied.message.interactiveMessage?.nativeFlowMessage?.buttons?.[0].name,
        'galaxy_message'
    )
    assert.equal(resolveButtonAddonKind(supplied.message), 'interactive')
    const generated = buildBusinessMessage(content)
    assert.match(
        generated.flowToken!,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    assert.equal(params(generated.message).flow_token, generated.flowToken)
    assert.equal(params(generated.message).form_type, 'template')
    assert.equal(params(generated.message).flow_action_payload, undefined)
    assert.notEqual(buildBusinessMessage(content).flowToken, generated.flowToken)
})

test('payment encodes the static PIX key card from the raw-send contract', () => {
    const { message } = buildBusinessMessage({
        type: 'payment',
        text: 'Pay',
        referenceId: 'PIX-1',
        pix: PIX,
        displayText: 'Pay via PIX'
    })
    const zero = { value: 0, offset: 100 }
    assert.deepEqual(params(roundTrip(message)), {
        currency: 'BRL',
        total_amount: zero,
        reference_id: 'PIX-1',
        type: 'physical-goods',
        order: {
            status: 'pending',
            subtotal: zero,
            order_type: 'ORDER',
            items: [{ name: '', amount: zero, quantity: 0, sale_amount: zero }]
        },
        payment_settings: [
            {
                type: 'pix_static_code',
                pix_static_code: {
                    merchant_name: 'Shop',
                    key: 'pay@example.com',
                    key_type: 'EMAIL'
                }
            }
        ],
        share_payment_status: false,
        is_soft_deleted: false,
        referral: 'chat_attachment',
        display_text: 'Pay via PIX'
    })
    assert.equal(resolveButtonAddonKind(message), 'payment_info')
})

const CHARGE: WaSendChargeMessage = {
    type: 'charge',
    text: 'Your order',
    referenceId: 'ORDER-1',
    pix: PIX,
    total: 9.5,
    items: [{ name: 'Tea', amount: 5, quantity: 2 }],
    discount: 0.5,
    additionalNote: 'Thank you'
}

test('charge encodes custom items, discount, total and order_details routing', () => {
    const { message } = buildBusinessMessage(CHARGE)
    assert.deepEqual(params(roundTrip(message)), {
        currency: 'BRL',
        reference_id: 'ORDER-1',
        type: 'physical-goods',
        total_amount: { value: 950, offset: 100 },
        payment_settings: [
            {
                type: 'pix_static_code',
                pix_static_code: {
                    merchant_name: 'Shop',
                    key: 'pay@example.com',
                    key_type: 'EMAIL'
                }
            }
        ],
        order: {
            status: 'payment_requested',
            subtotal: { value: 1000, offset: 100 },
            order_type: 'ORDER',
            items: [
                {
                    name: 'Tea',
                    amount: { value: 500, offset: 100 },
                    quantity: 2,
                    isCustomItem: true,
                    isQuantitySet: true
                }
            ],
            discount: { value: 50, offset: 100 }
        },
        additional_note: 'Thank you'
    })
    assert.equal(resolveButtonAddonKind(message), 'order_details')
    assert.equal(message.interactiveMessage?.nativeFlowMessage?.buttons?.[0].name, 'review_and_pay')
})

test('catalog encodes PN without device and routes to catalog_message', () => {
    const { message } = buildBusinessMessage(
        { type: 'catalog', text: 'Browse', thumbnailProductRetailerId: 'sku-1' },
        ME
    )
    assert.deepEqual(params(roundTrip(message)), {
        business_phone_number: '15551234567',
        thumbnail_product_retailer_id: 'sku-1'
    })
    assert.equal(resolveButtonAddonKind(message), 'catalog_message')
    const explicit = buildBusinessMessage({
        type: 'catalog',
        text: 'Browse',
        businessPhoneNumber: '15557654321'
    })
    assert.deepEqual(params(explicit.message), { business_phone_number: '15557654321' })
})

test('product rounds prices to thousandths and defaults owner/image count', () => {
    const productImage = {
        url: 'https://example.com/image',
        directPath: '/image',
        mediaKey: new Uint8Array(32)
    }
    const { message } = buildBusinessMessage(
        {
            type: 'product',
            productId: '123',
            title: 'Hat',
            description: 'Cotton',
            currencyCode: 'BRL',
            price: 49.9006,
            salePrice: 0,
            retailerId: 'sku-1',
            url: 'https://example.com/hat',
            productImage,
            text: 'New',
            footer: 'Available'
        },
        ME
    )
    assert.deepEqual(message.productMessage, {
        businessOwnerJid: '15551234567@s.whatsapp.net',
        body: 'New',
        footer: 'Available',
        product: {
            productId: '123',
            title: 'Hat',
            description: 'Cotton',
            currencyCode: 'BRL',
            priceAmount1000: 49901,
            salePriceAmount1000: 0,
            retailerId: 'sku-1',
            url: 'https://example.com/hat',
            productImage,
            productImageCount: 1
        }
    })
    assert.equal(Number(roundTrip(message).productMessage?.product?.priceAmount1000), 49901)
    assert.equal(resolveButtonAddonKind(message), null)
    assert.equal(resolveOutboundMessageAttrs(message).mediatype, 'product')
    const explicit = buildBusinessMessage({
        type: 'product',
        productId: '123',
        title: 'Hat',
        currencyCode: 'USD',
        price: 1,
        businessOwnerJid: '15557654321:2@s.whatsapp.net'
    })
    assert.equal(explicit.message.productMessage?.businessOwnerJid, '15557654321@s.whatsapp.net')
    assert.equal(explicit.message.productMessage?.product?.salePriceAmount1000, undefined)
    assert.equal(explicit.message.productMessage?.product?.productImageCount, undefined)
})

const INVALID: readonly [WaSendBusinessMessage, RegExp][] = [
    [{ type: 'buttons', text: 'Choose', buttons: [] }, /between 1 and 3/],
    [
        {
            type: 'buttons',
            text: 'Choose',
            buttons: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id }))
        },
        /between 1 and 3/
    ],
    [
        {
            type: 'buttons',
            text: 'Choose',
            buttons: [
                { id: 'a', text: 'A' },
                { id: 'a', text: 'B' }
            ]
        },
        /unique/
    ],
    [{ type: 'buttons', text: 'Choose', buttons: [{ id: '', text: 'A' }] }, /id/],
    [{ type: 'interactive', text: 'Choose', buttons: [] }, /at least one/],
    [
        {
            type: 'interactive',
            text: 'Choose',
            buttons: [
                { type: 'quick_reply', id: 'a', text: 'A' },
                { type: 'quick_reply', id: 'a', text: 'B' }
            ]
        },
        /unique/
    ],
    [
        {
            type: 'interactive',
            text: 'Choose',
            buttons: [{ type: 'cta_url', text: 'Visit', url: 'javascript:alert(1)' }]
        },
        /http/
    ],
    [{ type: 'list', text: 'Menu', buttonText: 'Open', sections: [] }, /section/],
    [
        { type: 'list', text: 'Menu', buttonText: 'Open', sections: [{ title: 'A', rows: [] }] },
        /row/
    ],
    [
        {
            type: 'list',
            text: 'Menu',
            buttonText: 'Open',
            sections: ['A', 'B'].map((title) => ({ title, rows: [{ id: 'same', title }] }))
        },
        /unique/
    ],
    [{ type: 'carousel', text: 'Cards', cards: [] }, /card/],
    [{ type: 'native-form', text: 'Details', flowId: '', flowCta: 'Open' }, /flowId/],
    [
        { type: 'native-form', text: 'Details', flowId: '123', flowCta: 'Open', flowToken: '' },
        /flowToken/
    ],
    [{ type: 'payment', text: 'Pay', referenceId: '1', pix: { ...PIX, key: '' } }, /PIX key/],
    [{ ...CHARGE, total: 10 }, /subtotal/],
    [{ ...CHARGE, items: [] }, /item/],
    [{ ...CHARGE, total: NaN }, /finite/],
    [{ ...CHARGE, discount: -1 }, /non-negative/],
    [{ ...CHARGE, items: [{ name: 'Tea', quantity: 0, amount: 1 }] }, /quantity/],
    [
        { ...CHARGE, items: [{ name: 'Tea', quantity: Number.MAX_SAFE_INTEGER, amount: 100 }] },
        /subtotal/
    ],
    [{ type: 'catalog', text: 'Browse', businessPhoneNumber: '123@lid' }, /phone number/],
    [
        { type: 'product', productId: '123', title: 'Hat', currencyCode: 'BRL', price: -1 },
        /non-negative/
    ],
    [
        { type: 'product', productId: '123', title: 'Hat', currencyCode: 'BRL', price: Infinity },
        /finite/
    ],
    [
        {
            type: 'product',
            productId: '123',
            title: 'Hat',
            currencyCode: 'BRL',
            price: Number.MAX_SAFE_INTEGER
        },
        /safe integer/
    ],
    [
        {
            type: 'product',
            productId: '123',
            title: 'Hat',
            currencyCode: 'BRL',
            price: 1,
            productImageCount: -1
        },
        /uint32/
    ]
]
for (const [index, [content, error]] of INVALID.entries()) {
    test(`invalid ${content.type} input ${index} is rejected`, () =>
        assert.throws(() => buildBusinessMessage(content, ME), error))
}

for (const kind of [
    'buttons',
    'interactive',
    'list',
    'carousel',
    'native-form',
    'payment',
    'charge',
    'catalog',
    'product'
]) {
    test(`typed discriminator recognizes ${kind}`, () =>
        assert.equal(isSendTypedMessage({ type: kind }), true))
}

test('catalog actions never derive phone numbers from LIDs or missing accounts', () => {
    const content = { type: 'catalog', text: 'Browse' } as const
    assert.throws(() => buildBusinessMessage(content), /account phone JID/)
    assert.throws(() => buildBusinessMessage(content, '123:4@lid'), /never a LID/)
    assert.throws(
        () =>
            buildBusinessMessage(
                { type: 'interactive', text: 'Browse', buttons: [{ type: 'cta_catalog' }] },
                '123@lid'
            ),
        /never a LID/
    )
    assert.throws(
        () =>
            buildBusinessMessage(
                { type: 'product', productId: '123', title: 'Hat', currencyCode: 'BRL', price: 1 },
                '123@lid'
            ),
        /never a LID/
    )
})

test('interactive omits empty headers', () => {
    const message = roundTrip(
        buildBusinessMessage({
            type: 'interactive',
            text: 'Choose',
            header: '',
            buttons: [{ type: 'quick_reply', id: 'yes', text: 'Yes' }]
        }).message
    )
    assert.equal(message.interactiveMessage?.header, null)
})

test('carousel rejects quick reply IDs repeated across cards', () => {
    const card = {
        text: 'Choose',
        title: 'Card',
        media: { type: 'image', media: new Uint8Array([1]), mimetype: 'image/jpeg' },
        buttons: [{ type: 'quick_reply', id: 'yes', text: 'Yes' }]
    } as const
    assert.throws(
        () => buildBusinessMessage({ type: 'carousel', text: 'Cards', cards: [card, card] }),
        /unique/
    )
})
