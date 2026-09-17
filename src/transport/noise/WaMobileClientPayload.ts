import { randomUUID } from 'node:crypto'

import { type Proto, proto } from '@proto'

/**
 * Distribution channel advertised by an iOS login (`UserAgent.distributionChannel`).
 * iOS-only – Android leaves the field unset. `appstore` is the normal
 * production install; `testflight`/`internal` mark beta builds.
 */
export type WaMobileDistributionChannel = 'appstore' | 'website' | 'testflight' | 'internal'

export interface WaMobileTransportDeviceInfo {
    /**
     * Operating system the login payload impersonates. `android` (the default,
     * for backwards compatibility) advertises the `ANDROID`/`SMB_ANDROID`
     * platform and fills the Android-only `mcc`/`mnc`/`deviceBoard` fields.
     * `ios` advertises `IOS`/`SMB_IOS`, omits those Android-only fields (the
     * real iPhone client never sends them) and carries `distributionChannel`
     * instead.
     *
     * Field mapping differs by OS and must match the real client:
     * - **Android** `device` = a device codename (e.g. `moto_g52`).
     * - **iOS** `device` = the marketing name (e.g. `iPhone 15 Pro`) while
     *   {@link deviceModelType} carries the raw machine id (`iPhone16,1`).
     */
    readonly os?: 'android' | 'ios'
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
    /** iOS distribution channel; ignored for Android. Defaults to `appstore`. */
    readonly distributionChannel?: WaMobileDistributionChannel
    readonly business?: boolean
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

function distributionChannelId(
    channel: WaMobileDistributionChannel | undefined
): Proto.ClientPayload.UserAgent.DistributionChannel {
    const { DistributionChannel } = proto.ClientPayload.UserAgent
    switch (channel) {
        case 'website':
            return DistributionChannel.WEBSITE
        case 'testflight':
            return DistributionChannel.TESTFLIGHT
        case 'internal':
            return DistributionChannel.INTERNAL
        case 'appstore':
        case undefined:
            return DistributionChannel.APPSTORE
    }
}

/**
 * Builds the encoded {@link Proto.ClientPayload} bytes the WhatsApp Mobile
 * transport sends after the noise login handshake. Throws when
 * `username`/`appVersion` are missing/invalid.
 */
export function buildMobileLoginPayload(config: WaMobileLoginPayloadConfig): Uint8Array {
    if (!Number.isSafeInteger(config.username) || config.username <= 0) {
        throw new Error('mobile login payload requires a valid numeric username')
    }
    const info = config.deviceInfo
    const version = parseAppVersion(info.appVersion)
    const isIos = info.os === 'ios'

    const platform = isIos
        ? info.business
            ? proto.ClientPayload.UserAgent.Platform.SMB_IOS
            : proto.ClientPayload.UserAgent.Platform.IOS
        : info.business
          ? proto.ClientPayload.UserAgent.Platform.SMB_ANDROID
          : proto.ClientPayload.UserAgent.Platform.ANDROID

    const userAgent = {
        platform,
        releaseChannel: proto.ClientPayload.UserAgent.ReleaseChannel.RELEASE,
        appVersion: version,
        osVersion: info.osVersion,
        manufacturer: info.manufacturer,
        device: info.device,
        osBuildNumber: info.osBuildNumber,
        phoneId: info.phoneId ?? randomUUID(),
        localeLanguageIso6391: info.localeLanguageIso6391 ?? 'en',
        localeCountryIso31661Alpha2: info.localeCountryIso31661Alpha2 ?? 'US',
        deviceType: proto.ClientPayload.UserAgent.DeviceType.PHONE,
        deviceModelType: info.deviceModelType,
        ...(isIos
            ? { distributionChannel: distributionChannelId(info.distributionChannel) }
            : { mcc: info.mcc ?? '000', mnc: info.mnc ?? '000', deviceBoard: info.deviceBoard })
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
