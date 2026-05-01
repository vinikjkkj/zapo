import { WA_REGISTRATION_NOTIFICATION_TAGS } from '@protocol/notification'
import { getFirstNodeChild } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt } from '@util/primitives'

export interface ParsedRegistrationCode {
    readonly kind: 'registration_code'
    readonly code: string
    readonly expiryTimestampMs: number
    readonly fromDeviceId: string
}

export interface ParsedAccountTakeoverNotice {
    readonly kind: 'account_takeover_notice'
    readonly serverToken: string
    readonly attemptTimestampMs: number
    readonly newDeviceName?: string
    readonly newDevicePlatform?: string
    readonly newDeviceAppVersion?: string
}

export type ParsedRegistrationNotification =
    | ParsedRegistrationCode
    | ParsedAccountTakeoverNotice
    | null

export function parseRegistrationNotification(node: BinaryNode): ParsedRegistrationNotification {
    const firstChild = getFirstNodeChild(node)
    if (!firstChild) {
        return null
    }

    if (firstChild.tag === WA_REGISTRATION_NOTIFICATION_TAGS.WA_OLD_REGISTRATION) {
        const code = firstChild.attrs.code
        const expirySeconds = parseOptionalInt(firstChild.attrs.expiry_t)
        const fromDeviceId = firstChild.attrs.device_id
        if (!code || expirySeconds === undefined || !fromDeviceId) {
            return null
        }
        return {
            kind: 'registration_code',
            code,
            expiryTimestampMs: expirySeconds * 1000,
            fromDeviceId
        }
    }

    if (firstChild.tag === WA_REGISTRATION_NOTIFICATION_TAGS.DEVICE_LOGOUT) {
        const serverToken = firstChild.attrs.id
        const tSeconds = parseOptionalInt(firstChild.attrs.t)
        if (!serverToken || tSeconds === undefined) {
            return null
        }
        return {
            kind: 'account_takeover_notice',
            serverToken,
            attemptTimestampMs: tSeconds * 1000,
            newDeviceName: firstChild.attrs.device,
            newDevicePlatform: firstChild.attrs.new_device_platform,
            newDeviceAppVersion: firstChild.attrs.new_device_app_version
        }
    }

    return null
}
