import { WA_DEFAULTS } from '@protocol/defaults'
import {
    WA_EMAIL_LIMITS,
    WA_EMAIL_TAGS,
    WA_EMAIL_XMLNS,
    type WaEmailContext
} from '@protocol/email'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export function buildGetEmailIq(): BinaryNode {
    return buildIqNode('get', WA_DEFAULTS.HOST_DOMAIN, WA_EMAIL_XMLNS, [
        { tag: WA_EMAIL_TAGS.EMAIL, attrs: {} }
    ])
}

export function buildSetEmailIq(email: string, context?: WaEmailContext): BinaryNode {
    if (email.length === 0 || email.length > WA_EMAIL_LIMITS.EMAIL_MAX_LENGTH) {
        throw new Error(
            `email length must be between 1 and ${WA_EMAIL_LIMITS.EMAIL_MAX_LENGTH} chars`
        )
    }
    const emailChildren: BinaryNode[] = []
    if (context !== undefined) {
        emailChildren.push({ tag: WA_EMAIL_TAGS.CONTEXT, attrs: {}, content: context })
    }
    emailChildren.push({ tag: WA_EMAIL_TAGS.EMAIL_ADDRESS, attrs: {}, content: email })
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_EMAIL_XMLNS, [
        { tag: WA_EMAIL_TAGS.EMAIL, attrs: {}, content: emailChildren }
    ])
}

export interface BuildRequestEmailVerificationCodeInput {
    readonly languageCode: string
    readonly localeCode: string
}

export function buildRequestEmailVerificationCodeIq(
    input: BuildRequestEmailVerificationCodeInput
): BinaryNode {
    assertLocaleField('languageCode', input.languageCode)
    assertLocaleField('localeCode', input.localeCode)
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_EMAIL_XMLNS, [
        {
            tag: WA_EMAIL_TAGS.VERIFY_EMAIL,
            attrs: {},
            content: [
                { tag: WA_EMAIL_TAGS.LG, attrs: {}, content: input.languageCode },
                { tag: WA_EMAIL_TAGS.LC, attrs: {}, content: input.localeCode }
            ]
        }
    ])
}

export function buildVerifyEmailCodeIq(code: string): BinaryNode {
    if (code.length !== WA_EMAIL_LIMITS.CODE_LENGTH) {
        throw new Error(`verification code must be exactly ${WA_EMAIL_LIMITS.CODE_LENGTH} chars`)
    }
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_EMAIL_XMLNS, [
        {
            tag: WA_EMAIL_TAGS.VERIFY_EMAIL,
            attrs: {},
            content: [{ tag: WA_EMAIL_TAGS.CODE, attrs: {}, content: code }]
        }
    ])
}

export function buildConfirmEmailIq(context?: WaEmailContext): BinaryNode {
    const children: BinaryNode[] | undefined =
        context !== undefined
            ? [{ tag: WA_EMAIL_TAGS.CONTEXT, attrs: {}, content: context }]
            : undefined
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_EMAIL_XMLNS, [
        {
            tag: WA_EMAIL_TAGS.CONFIRM_EMAIL,
            attrs: {},
            ...(children !== undefined ? { content: children } : {})
        }
    ])
}

function assertLocaleField(field: string, value: string): void {
    if (
        value.length < WA_EMAIL_LIMITS.LOCALE_MIN_LENGTH ||
        value.length > WA_EMAIL_LIMITS.LOCALE_MAX_LENGTH
    ) {
        throw new Error(
            `${field} must be between ${WA_EMAIL_LIMITS.LOCALE_MIN_LENGTH} and ${WA_EMAIL_LIMITS.LOCALE_MAX_LENGTH} chars`
        )
    }
}
