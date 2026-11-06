import { randomUUID } from 'node:crypto'

import type {
    WaMessageBuildResult,
    WaNativeFlowButton,
    WaPixSettings,
    WaSendBusinessMessage,
    WaSendChargeMessage
} from '@message/types'
import { type Proto, proto } from '@proto'
import { WA_DEFAULTS } from '@protocol/constants'
import { parseJidFull } from '@protocol/jid'
import { WA_INTERACTIVE_LIMITS } from '@protocol/message'

function requireText(value: string, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${field} must be a non-empty string`)
    }
    return value
}

function addUniqueId(ids: Set<string>, id: string): void {
    requireText(id, 'id')
    if (ids.has(id)) throw new Error('button/row ids must be unique')
    ids.add(id)
}

function resolveBusinessPhone(phone: string | undefined, meJid: string | undefined): string {
    if (phone !== undefined) {
        if (!/^\+?\d+$/.test(phone))
            throw new Error('businessPhoneNumber must be a phone number, never a JID or LID')
        return phone.startsWith('+') ? phone.slice(1) : phone
    }
    if (!meJid) throw new Error('business message requires the account phone JID')
    const { address: parsed } = parseJidFull(meJid)
    if (parsed.server !== WA_DEFAULTS.HOST_DOMAIN || !/^\d+$/.test(parsed.user)) {
        throw new Error('business message requires a phone JID, never a LID')
    }
    return parsed.user
}

function encodeButton(
    name: string,
    params: object
): Proto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton {
    return { name, buttonParamsJson: JSON.stringify(params) }
}

function validateInteractiveButtons(buttons: readonly WaNativeFlowButton[]): void {
    let quickReplies = 0
    for (const button of buttons) {
        if (button.type === 'quick_reply') quickReplies += 1
    }
    if (quickReplies !== 0 && quickReplies !== buttons.length)
        throw new Error('interactive message cannot mix quick replies and CTA buttons')
    if (quickReplies > WA_INTERACTIVE_LIMITS.QUICK_REPLIES)
        throw new Error(
            `interactive message allows at most ${WA_INTERACTIVE_LIMITS.QUICK_REPLIES} quick replies`
        )
    if (quickReplies === 0 && buttons.length > WA_INTERACTIVE_LIMITS.CTA_BUTTONS)
        throw new Error(
            `interactive message allows at most ${WA_INTERACTIVE_LIMITS.CTA_BUTTONS} CTA buttons`
        )
}

function encodeNativeButtons(
    buttons: readonly WaNativeFlowButton[],
    meJid?: string
): Proto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton[] {
    if (buttons.length === 0) throw new Error('interactive message requires at least one button')
    const ids = new Set<string>()
    return buttons.map((button) => {
        if (button.type === 'cta_catalog') {
            return encodeButton(button.type, {
                business_phone_number: resolveBusinessPhone(button.businessPhoneNumber, meJid),
                ...(button.productId !== undefined
                    ? { catalog_product_id: requireText(button.productId, 'productId') }
                    : {})
            })
        }
        const text = requireText(button.text, 'button text')
        switch (button.type) {
            case 'quick_reply':
                addUniqueId(ids, button.id)
                return encodeButton(button.type, { display_text: text, id: button.id })
            case 'cta_url': {
                const url = requireText(button.url, 'url')
                const parsed = new URL(url)
                if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
                    throw new Error('button url must use http or https')
                return encodeButton(button.type, {
                    display_text: text,
                    url,
                    merchant_url: url,
                    ...(button.webview
                        ? { webview_presentation: 'full', webview_interaction: true }
                        : {})
                })
            }
            case 'cta_copy':
                return encodeButton(button.type, {
                    display_text: text,
                    copy_code: requireText(button.code, 'code'),
                    id: button.code
                })
            case 'cta_call':
                return encodeButton(button.type, {
                    display_text: text,
                    phone_number: requireText(button.phoneNumber, 'phoneNumber')
                })
            default:
                throw new Error('unsupported native-flow button type')
        }
    })
}

function nativeFlow(
    buttons: Proto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton[],
    messageVersion = 1
): Proto.Message.InteractiveMessage.INativeFlowMessage {
    return { buttons, messageParamsJson: '', messageVersion }
}

function toAmount(value: number, scale: number, field: string): number {
    const amount = Math.round(value * scale)
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(amount)) {
        throw new Error(
            `${field} must be a finite non-negative amount within the safe integer range`
        )
    }
    return amount
}

function paymentSettings(pix: WaPixSettings): object[] {
    if (!['EVP', 'EMAIL', 'PHONE', 'CPF', 'CNPJ'].includes(pix.keyType))
        throw new Error('invalid PIX key type')
    return [
        {
            type: 'pix_static_code',
            pix_static_code: {
                merchant_name: requireText(pix.merchantName, 'merchantName'),
                key: requireText(pix.key, 'PIX key'),
                key_type: pix.keyType
            }
        }
    ]
}

function encodeCharge(content: WaSendChargeMessage): object {
    if (content.items.length === 0) throw new Error('charge requires at least one item')
    let subtotal = 0
    const items = content.items.map((item) => {
        const amount = toAmount(item.amount, 100, 'item amount')
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0)
            throw new Error('item quantity must be a positive safe integer')
        subtotal += amount * item.quantity
        return {
            name: requireText(item.name, 'item name'),
            amount: { value: amount, offset: 100 },
            quantity: item.quantity,
            isCustomItem: true,
            isQuantitySet: true
        }
    })
    const total = toAmount(content.total, 100, 'total')
    const discount = toAmount(content.discount ?? 0, 100, 'discount')
    if (!Number.isSafeInteger(subtotal) || discount > subtotal || total !== subtotal - discount) {
        throw new Error('charge total must equal the item subtotal minus discount')
    }
    return {
        currency: 'BRL',
        reference_id: requireText(content.referenceId, 'referenceId'),
        type: 'physical-goods',
        total_amount: { value: total, offset: 100 },
        payment_settings: paymentSettings(content.pix),
        order: {
            status: 'payment_requested',
            subtotal: { value: subtotal, offset: 100 },
            order_type: 'ORDER',
            items,
            ...(content.discount !== undefined
                ? { discount: { value: discount, offset: 100 } }
                : {})
        },
        ...(content.additionalNote !== undefined ? { additional_note: content.additionalNote } : {})
    }
}

/** Builds interactive/business protobuf fields. Carousel headers still need uploaded media.
 * @throws On invalid IDs, amounts, empty collections, unsupported top-level button combinations,
 * exceeded button/card limits, or a missing account phone number.
 * @example `const built = buildBusinessMessage({ type: 'catalog', text: 'Browse' }, '15551234567@s.whatsapp.net')`
 */
export function buildBusinessMessage(
    content: WaSendBusinessMessage,
    meJid?: string
): WaMessageBuildResult {
    if (content.type === 'product') {
        const owner = `${resolveBusinessPhone(undefined, content.businessOwnerJid ?? meJid)}@${WA_DEFAULTS.HOST_DOMAIN}`
        const count = content.productImageCount ?? (content.productImage ? 1 : undefined)
        if (count !== undefined && (!Number.isInteger(count) || count < 0 || count > 0xffff_ffff))
            throw new Error('productImageCount must be a uint32')
        if (!/^[A-Z]{3}$/.test(content.currencyCode))
            throw new Error('currencyCode must contain three uppercase letters')
        return {
            message: {
                productMessage: {
                    businessOwnerJid: owner,
                    body: content.text,
                    footer: content.footer,
                    product: {
                        productId: requireText(content.productId, 'productId'),
                        title: requireText(content.title, 'title'),
                        description: content.description,
                        currencyCode: content.currencyCode,
                        priceAmount1000: toAmount(content.price, 1_000, 'price'),
                        ...(content.salePrice !== undefined
                            ? {
                                  salePriceAmount1000: toAmount(
                                      content.salePrice,
                                      1_000,
                                      'salePrice'
                                  )
                              }
                            : {}),
                        retailerId: content.retailerId,
                        url: content.url,
                        productImage: content.productImage,
                        productImageCount: count
                    }
                }
            }
        }
    }
    requireText(content.text, 'text')
    if (content.type === 'buttons') {
        if (content.buttons.length < 1 || content.buttons.length > 3)
            throw new Error('buttons message requires between 1 and 3 buttons')
        const ids = new Set<string>()
        const buttons = content.buttons.map((button) => {
            addUniqueId(ids, button.id)
            return {
                buttonId: button.id,
                buttonText: { displayText: requireText(button.text, 'button text') },
                type: proto.Message.ButtonsMessage.Button.Type.RESPONSE
            }
        })
        return {
            message: {
                documentWithCaptionMessage: {
                    message: {
                        buttonsMessage: {
                            contentText: content.text,
                            footerText: content.footer ?? '',
                            ...(content.header ? { text: content.header } : {}),
                            headerType: content.header
                                ? proto.Message.ButtonsMessage.HeaderType.TEXT
                                : proto.Message.ButtonsMessage.HeaderType.EMPTY,
                            buttons
                        }
                    }
                }
            }
        }
    }
    const interactive: Proto.Message.IInteractiveMessage = {
        body: { text: content.text },
        footer: { text: content.footer ?? '' }
    }
    let flowToken: string | undefined
    switch (content.type) {
        case 'interactive':
            validateInteractiveButtons(content.buttons)
            if (content.header !== undefined)
                interactive.header = { title: content.header, hasMediaAttachment: false }
            interactive.nativeFlowMessage = nativeFlow(encodeNativeButtons(content.buttons, meJid))
            break
        case 'list': {
            if (content.sections.length === 0) throw new Error('list requires at least one section')
            const ids = new Set<string>()
            const sections = content.sections.map((section) => {
                if (section.rows.length === 0)
                    throw new Error('list section requires at least one row')
                return {
                    title: section.title,
                    rows: section.rows.map((row) => {
                        addUniqueId(ids, row.id)
                        return {
                            id: row.id,
                            title: requireText(row.title, 'row title'),
                            ...(row.header !== undefined ? { header: row.header } : {}),
                            ...(row.description !== undefined
                                ? { description: row.description }
                                : {})
                        }
                    })
                }
            })
            interactive.nativeFlowMessage = nativeFlow([
                encodeButton('single_select', {
                    title: requireText(content.buttonText, 'buttonText'),
                    sections
                })
            ])
            break
        }
        case 'carousel':
            if (content.cards.length === 0) throw new Error('carousel requires at least one card')
            if (content.cards.length > WA_INTERACTIVE_LIMITS.CAROUSEL_CARDS)
                throw new Error(
                    `carousel allows at most ${WA_INTERACTIVE_LIMITS.CAROUSEL_CARDS} cards`
                )
            interactive.carouselMessage = {
                messageVersion: 1,
                cards: content.cards.map((card) => {
                    if (card.media.type !== 'image' && card.media.type !== 'video')
                        throw new Error('carousel media must be image or video')
                    return {
                        header: { title: card.title, hasMediaAttachment: true },
                        body: { text: requireText(card.text, 'card text') },
                        nativeFlowMessage: nativeFlow(encodeNativeButtons(card.buttons, meJid))
                    }
                })
            }
            break
        case 'native-form':
            if (/\D/.test(requireText(content.flowId, 'flowId')))
                throw new Error('flowId must contain only decimal digits')
            flowToken =
                content.flowToken === undefined
                    ? randomUUID()
                    : requireText(content.flowToken, 'flowToken')
            interactive.nativeFlowMessage = nativeFlow(
                [
                    encodeButton('galaxy_message', {
                        flow_action: 'navigate',
                        flow_message_version: '4',
                        flow_cta: requireText(content.flowCta, 'flowCta'),
                        form_type: requireText(content.formType ?? 'template', 'formType'),
                        flow_id: content.flowId,
                        flow_token: flowToken,
                        ...(content.flowActionPayload !== undefined
                            ? { flow_action_payload: content.flowActionPayload }
                            : {})
                    })
                ],
                3
            )
            break
        case 'payment': {
            const zero = { value: 0, offset: 100 }
            interactive.nativeFlowMessage = nativeFlow([
                encodeButton('payment_info', {
                    currency: 'BRL',
                    total_amount: zero,
                    reference_id: requireText(content.referenceId, 'referenceId'),
                    type: 'physical-goods',
                    order: {
                        status: 'pending',
                        subtotal: zero,
                        order_type: 'ORDER',
                        items: [{ name: '', amount: zero, quantity: 0, sale_amount: zero }]
                    },
                    payment_settings: paymentSettings(content.pix),
                    share_payment_status: false,
                    is_soft_deleted: false,
                    referral: 'chat_attachment',
                    ...(content.displayText !== undefined
                        ? { display_text: content.displayText }
                        : {})
                })
            ])
            break
        }
        case 'charge':
            interactive.nativeFlowMessage = nativeFlow([
                encodeButton('review_and_pay', encodeCharge(content))
            ])
            break
        case 'catalog':
            interactive.nativeFlowMessage = nativeFlow([
                encodeButton('catalog_message', {
                    business_phone_number: resolveBusinessPhone(content.businessPhoneNumber, meJid),
                    ...(content.thumbnailProductRetailerId !== undefined
                        ? {
                              thumbnail_product_retailer_id: requireText(
                                  content.thumbnailProductRetailerId,
                                  'thumbnailProductRetailerId'
                              )
                          }
                        : {})
                })
            ])
            break
    }
    return {
        message: { interactiveMessage: interactive },
        ...(flowToken !== undefined ? { flowToken } : {})
    }
}
