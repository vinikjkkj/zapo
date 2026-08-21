import { randomUUID } from 'node:crypto'

import { type Proto, proto } from '@proto'

/**
 * Mobile OS advertised in the noise {@link Proto.ClientPayload} user-agent.
 * Distinct from companion DeviceProps.PlatformType used in Web pairing.
 */
export const WA_MOBILE_PLATFORMS = Object.freeze({
    ANDROID: 'android',
    IOS: 'ios'
} as const)

export type WaMobilePlatform = (typeof WA_MOBILE_PLATFORMS)[keyof typeof WA_MOBILE_PLATFORMS]

const MOBILE_PLATFORM_TO_PROTO: Readonly<
    Record<WaMobilePlatform, Proto.ClientPayload.UserAgent.Platform>
> = Object.freeze({
    [WA_MOBILE_PLATFORMS.ANDROID]: proto.ClientPayload.UserAgent.Platform.ANDROID,
    [WA_MOBILE_PLATFORMS.IOS]: proto.ClientPayload.UserAgent.Platform.IOS
})

const MOBILE_BUSINESS_PLATFORM_TO_PROTO: Readonly<
    Record<WaMobilePlatform, Proto.ClientPayload.UserAgent.Platform>
> = Object.freeze({
    [WA_MOBILE_PLATFORMS.ANDROID]: proto.ClientPayload.UserAgent.Platform.SMB_ANDROID,
    [WA_MOBILE_PLATFORMS.IOS]: proto.ClientPayload.UserAgent.Platform.SMB_IOS
})

export interface WaMobileTransportDeviceInfo {
    /**
     * OS advertised as `UserAgent.platform`. Defaults to {@link WA_MOBILE_PLATFORMS.ANDROID}.
     * Use `'ios'` for an iPhone client (`UserAgent.Platform.IOS` /
     * `SMB_IOS` when {@link business} is true).
     */
    readonly platform?: WaMobilePlatform
    readonly manufacturer: string
    readonly device: string
    readonly osVersion: string
    readonly osBuildNumber: string
    readonly appVersion: string
    readonly mcc?: string
    readonly mnc?: string
    readonly localeLanguageIso6391?: string
    readonly localeCountryIso31661Alpha2?: string
    readonly phoneId?: string
    readonly deviceBoard?: string
    readonly deviceModelType?: string
    /**
     * When `true`, advertise the SMB platform variant (`SMB_ANDROID` /
     * `SMB_IOS`) instead of the consumer one.
     */
    readonly business?: boolean
    /** Defaults to `PHONE`. */
    readonly deviceType?: Proto.ClientPayload.UserAgent.DeviceType
    /**
     * App distribution. iOS defaults to `APPSTORE` (WhatsApp iOS from the App Store);
     * Android omits the field unless set explicitly.
     */
    readonly distributionChannel?: Proto.ClientPayload.UserAgent.DistributionChannel
    readonly deviceExpId?: string
}

export interface WaMobileLoginPayloadConfig {
    readonly username: number
    readonly device?: number
    readonly passive?: boolean
    readonly pull?: boolean
    readonly deviceInfo: WaMobileTransportDeviceInfo
    readonly lidDbMigrated?: boolean
    readonly connectReason?: Proto.ClientPayload.ConnectReason
    readonly connectType?: Proto.ClientPayload.ConnectType
    readonly pushName?: string
    readonly yearClass?: number
    readonly memClass?: number
}

interface ParsedAppVersion {
    readonly primary: number
    readonly secondary: number
    readonly tertiary: number
    readonly quaternary?: number
}

function parseAppVersion(version: string): ParsedAppVersion {
    const parts = version.split('.')
    const at = (i: number): number | undefined => {
        const n = Number(parts[i])
        return Number.isFinite(n) ? n : undefined
    }
    return {
        primary: at(0) ?? 2,
        secondary: at(1) ?? 0,
        tertiary: at(2) ?? 0,
        quaternary: at(3)
    }
}

function resolveMobilePlatformKey(platform: string | undefined): WaMobilePlatform {
    const normalized = (platform ?? WA_MOBILE_PLATFORMS.ANDROID).trim().toLowerCase()
    if (!Object.prototype.hasOwnProperty.call(MOBILE_PLATFORM_TO_PROTO, normalized)) {
        throw new Error(
            `mobile login payload requires platform 'android' or 'ios', got ${JSON.stringify(platform)}`
        )
    }
    return normalized as WaMobilePlatform
}

function resolveMobilePlatform(
    platformKey: WaMobilePlatform,
    business: boolean | undefined
): Proto.ClientPayload.UserAgent.Platform {
    return business === true
        ? MOBILE_BUSINESS_PLATFORM_TO_PROTO[platformKey]
        : MOBILE_PLATFORM_TO_PROTO[platformKey]
}

function resolveDistributionChannel(
    info: WaMobileTransportDeviceInfo,
    platformKey: WaMobilePlatform
): Proto.ClientPayload.UserAgent.DistributionChannel | undefined {
    if (info.distributionChannel !== undefined) return info.distributionChannel
    if (platformKey === WA_MOBILE_PLATFORMS.IOS) {
        return proto.ClientPayload.UserAgent.DistributionChannel.APPSTORE
    }
    return undefined
}

/**
 * Builds the encoded {@link Proto.ClientPayload} bytes the WhatsApp Mobile
 * transport sends after the noise login handshake. Throws when `username` is
 * invalid, or when `deviceInfo.platform` is not `'android'` / `'ios'`.
 * Malformed `appVersion` components fall back to safe defaults instead of
 * throwing.
 */
export function buildMobileLoginPayload(config: WaMobileLoginPayloadConfig): Uint8Array {
    if (!Number.isSafeInteger(config.username) || config.username <= 0) {
        throw new Error('mobile login payload requires a valid numeric username')
    }
    const info = config.deviceInfo
    const version = parseAppVersion(info.appVersion)
    const platformKey = resolveMobilePlatformKey(info.platform)
    const platform = resolveMobilePlatform(platformKey, info.business)
    const distributionChannel = resolveDistributionChannel(info, platformKey)

    const userAgent = {
        platform,
        releaseChannel: proto.ClientPayload.UserAgent.ReleaseChannel.RELEASE,
        appVersion: version,
        mcc: info.mcc ?? '000',
        mnc: info.mnc ?? '000',
        osVersion: info.osVersion,
        manufacturer: info.manufacturer,
        device: info.device,
        osBuildNumber: info.osBuildNumber,
        phoneId: info.phoneId ?? randomUUID(),
        localeLanguageIso6391: info.localeLanguageIso6391 ?? 'en',
        localeCountryIso31661Alpha2: info.localeCountryIso31661Alpha2 ?? 'US',
        deviceType: info.deviceType ?? proto.ClientPayload.UserAgent.DeviceType.PHONE,
        deviceBoard: info.deviceBoard,
        deviceModelType: info.deviceModelType,
        deviceExpId: info.deviceExpId,
        distributionChannel
    } as typeof proto.ClientPayload.prototype.userAgent

    return proto.ClientPayload.encode({
        passive: config.passive === true,
        pull: config.pull ?? true,
        product: proto.ClientPayload.Product.WHATSAPP,
        connectType: config.connectType ?? proto.ClientPayload.ConnectType.CELLULAR_UNKNOWN,
        connectReason: config.connectReason ?? proto.ClientPayload.ConnectReason.USER_ACTIVATED,
        userAgent,
        username: config.username,
        device: config.device ?? 0,
        lidDbMigrated: config.lidDbMigrated === true,
        pushName: config.pushName,
        yearClass: config.yearClass,
        memClass: config.memClass
    }).finish()
}
