import { WA_EMAIL_TAGS, type WaEmailContext } from '@protocol/email'
import {
    buildConfirmEmailIq,
    buildGetEmailIq,
    type BuildRequestEmailVerificationCodeInput,
    buildRequestEmailVerificationCodeIq,
    buildSetEmailIq,
    buildVerifyEmailCodeIq
} from '@transport/node/builders/email'
import { findNodeChild, getNodeTextContent } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export interface WaEmailStatus {
    readonly email: string | null
    readonly verified: boolean
    readonly confirmed: boolean
}

export interface WaEmailVerifyCodeResult {
    readonly verified: boolean
    readonly autoVerifyFailed: boolean
    readonly email: string | null
}

export interface WaEmailCoordinator {
    readonly getStatus: () => Promise<WaEmailStatus>
    readonly setEmail: (email: string, context?: WaEmailContext) => Promise<WaEmailStatus>
    readonly requestVerificationCode: (
        input: BuildRequestEmailVerificationCodeInput
    ) => Promise<void>
    readonly verifyCode: (code: string) => Promise<WaEmailVerifyCodeResult>
    readonly confirm: (context?: WaEmailContext) => Promise<void>
}

export interface WaEmailCoordinatorOptions {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
}

export function createEmailCoordinator(options: WaEmailCoordinatorOptions): WaEmailCoordinator {
    const { queryWithContext } = options

    return {
        getStatus: async () => {
            const result = await queryWithContext('email.getStatus', buildGetEmailIq())
            assertIqResult(result, 'email.getStatus')
            return parseEmailStatus(result)
        },

        setEmail: async (email, context) => {
            const result = await queryWithContext(
                'email.set',
                buildSetEmailIq(email, context),
                undefined,
                context !== undefined ? { context } : {}
            )
            assertIqResult(result, 'email.set')
            return parseEmailStatus(result)
        },

        requestVerificationCode: async (input) => {
            const result = await queryWithContext(
                'email.requestCode',
                buildRequestEmailVerificationCodeIq(input),
                undefined,
                { languageCode: input.languageCode, localeCode: input.localeCode }
            )
            assertIqResult(result, 'email.requestCode')
        },

        verifyCode: async (code) => {
            const result = await queryWithContext('email.verifyCode', buildVerifyEmailCodeIq(code))
            assertIqResult(result, 'email.verifyCode')
            return parseVerifyCodeResult(result)
        },

        confirm: async (context) => {
            const result = await queryWithContext(
                'email.confirm',
                buildConfirmEmailIq(context),
                undefined,
                context !== undefined ? { context } : {}
            )
            assertIqResult(result, 'email.confirm')
        }
    }
}

function parseEmailStatus(result: BinaryNode): WaEmailStatus {
    const emailNode = findNodeChild(result, WA_EMAIL_TAGS.EMAIL)
    if (!emailNode) {
        return { email: null, verified: false, confirmed: false }
    }
    const verifiedAttr = emailNode.attrs.verified
    const addressNode = findNodeChild(emailNode, WA_EMAIL_TAGS.EMAIL_ADDRESS)
    const confirmedNode = findNodeChild(emailNode, WA_EMAIL_TAGS.CONFIRMED)
    return {
        email: addressNode ? (getNodeTextContent(addressNode) ?? null) : null,
        verified: verifiedAttr === 'true',
        confirmed: confirmedNode ? getNodeTextContent(confirmedNode) === 'true' : false
    }
}

function parseVerifyCodeResult(result: BinaryNode): WaEmailVerifyCodeResult {
    const emailNode = findNodeChild(result, WA_EMAIL_TAGS.EMAIL)
    if (!emailNode) {
        return { verified: false, autoVerifyFailed: false, email: null }
    }
    const doVerify = emailNode.attrs.do_verify
    const autoVerifyNode = findNodeChild(emailNode, WA_EMAIL_TAGS.AUTO_VERIFY)
    const addressNode = findNodeChild(emailNode, WA_EMAIL_TAGS.EMAIL_ADDRESS)
    return {
        verified: doVerify === 'true',
        autoVerifyFailed: autoVerifyNode ? getNodeTextContent(autoVerifyNode) === 'fail' : false,
        email: addressNode ? (getNodeTextContent(addressNode) ?? null) : null
    }
}
