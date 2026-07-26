/**
 * Push notifications only a phone receives.
 *
 * `account_sync` carries the account's live device set: the primary keys its
 * companion bookkeeping off it, allocating a fresh key index for the next link
 * and dropping companions the server no longer lists. The registration
 * notifications carry the login code and the takeover warning that fire while
 * a number is being moved to another phone.
 */

import type { BinaryNode } from '../../transport/codec'

export interface FakeAccountDevice {
    readonly deviceJid: string
    /** ADV key index of the device; the primary keeps every listed one valid. */
    readonly keyIndex?: number
    readonly deviceLid?: string
}

export interface BuildAccountSyncDevicesInput {
    readonly devices: readonly FakeAccountDevice[]
    readonly id?: string
    readonly from?: string
    readonly timestampSeconds?: number
}

/**
 * Builds `<notification type="account_sync">` with the account's `<devices>`
 * list. Every device the account still owns must be present: the primary reads
 * this as authoritative and prunes anything missing from it.
 */
export function buildAccountSyncDevicesNotification(
    input: BuildAccountSyncDevicesInput
): BinaryNode {
    return {
        tag: 'notification',
        attrs: {
            id: input.id ?? `account-sync-${Math.random().toString(36).slice(2, 10)}`,
            from: input.from ?? 's.whatsapp.net',
            type: 'account_sync',
            t: String(input.timestampSeconds ?? Math.floor(Date.now() / 1_000))
        },
        content: [
            {
                tag: 'devices',
                attrs: {},
                content: input.devices.map((device) => ({
                    tag: 'device',
                    attrs: {
                        jid: device.deviceJid,
                        ...(device.keyIndex !== undefined
                            ? { 'key-index': String(device.keyIndex) }
                            : {}),
                        ...(device.deviceLid !== undefined ? { lid: device.deviceLid } : {})
                    }
                }))
            }
        ]
    }
}

export interface BuildRegistrationCodeNotificationInput {
    /** The login code shown on the new device. */
    readonly code: string
    /** Device that requested it, as reported by the server. */
    readonly fromDeviceId: string
    readonly expirySeconds?: number
    readonly id?: string
    readonly from?: string
}

/**
 * Builds the `<notification type="registration">` carrying a login code, which
 * the client surfaces as `mobile_registration_code`.
 */
export function buildRegistrationCodeNotification(
    input: BuildRegistrationCodeNotificationInput
): BinaryNode {
    const nowSeconds = Math.floor(Date.now() / 1_000)
    return {
        tag: 'notification',
        attrs: {
            id: input.id ?? `registration-${Math.random().toString(36).slice(2, 10)}`,
            from: input.from ?? 's.whatsapp.net',
            type: 'registration'
        },
        content: [
            {
                tag: 'wa_old_registration',
                attrs: {
                    code: input.code,
                    expiry_t: String(input.expirySeconds ?? nowSeconds + 300),
                    device_id: input.fromDeviceId
                }
            }
        ]
    }
}

export interface BuildAccountTakeoverNoticeInput {
    /** Server token that identifies the takeover attempt. */
    readonly serverToken: string
    readonly attemptTimestampSeconds?: number
    readonly newDeviceName?: string
    readonly newDevicePlatform?: string
    readonly newDeviceAppVersion?: string
    readonly id?: string
    readonly from?: string
}

/**
 * Builds the `<notification type="registration">` warning that the number is
 * being registered on another phone, surfaced as
 * `mobile_account_takeover_notice`.
 */
export function buildAccountTakeoverNotice(input: BuildAccountTakeoverNoticeInput): BinaryNode {
    return {
        tag: 'notification',
        attrs: {
            id: input.id ?? `takeover-${Math.random().toString(36).slice(2, 10)}`,
            from: input.from ?? 's.whatsapp.net',
            type: 'registration'
        },
        content: [
            {
                tag: 'device_logout',
                attrs: {
                    id: input.serverToken,
                    t: String(input.attemptTimestampSeconds ?? Math.floor(Date.now() / 1_000)),
                    ...(input.newDeviceName !== undefined ? { device: input.newDeviceName } : {}),
                    ...(input.newDevicePlatform !== undefined
                        ? { new_device_platform: input.newDevicePlatform }
                        : {}),
                    ...(input.newDeviceAppVersion !== undefined
                        ? { new_device_app_version: input.newDeviceAppVersion }
                        : {})
                }
            }
        ]
    }
}
