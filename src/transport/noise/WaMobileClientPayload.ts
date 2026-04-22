import { randomUUID } from 'node:crypto'

import { type Proto, proto } from '@proto'

export interface WaMobileTransportDeviceInfo {
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

export function buildMobileLoginPayload(config: WaMobileLoginPayloadConfig): Uint8Array {
    if (!Number.isSafeInteger(config.username) || config.username <= 0) {
        throw new Error('mobile login payload requires a valid numeric username')
    }
    const info = config.deviceInfo
    const version = parseAppVersion(info.appVersion)

    const userAgent = {
        platform: proto.ClientPayload.UserAgent.Platform.ANDROID,
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
        deviceType: proto.ClientPayload.UserAgent.DeviceType.PHONE,
        deviceBoard: info.deviceBoard,
        deviceModelType: info.deviceModelType
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
