import { randomUUID } from 'node:crypto'

import { md5Bytes } from '@crypto/core/primitives'
import { proto } from '@proto'
import { DEFAULT_VERSION_BASE } from '@transport/noise/constants'
import type {
    WaLoginPayloadConfig,
    WaPayloadCommonConfig,
    WaRegistrationPayloadConfig
} from '@transport/noise/types'
import { intToBytes } from '@util/bytes'

function parseVersion(versionBase: string): {
    primary: number
    secondary: number
    tertiary: number
} {
    const [p = '2', s = '3000', t = '0'] = versionBase.split('.')
    const primary = Number.parseInt(p, 10)
    const secondary = Number.parseInt(s, 10)
    const tertiary = Number.parseInt(t, 10)
    if (
        !Number.isSafeInteger(primary) ||
        !Number.isSafeInteger(secondary) ||
        !Number.isSafeInteger(tertiary)
    ) {
        throw new Error(`invalid versionBase: ${versionBase}`)
    }
    return { primary, secondary, tertiary }
}

function resolveLocale(): { lg: string; lc: string } {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en-US'
    const [language = 'en', country = 'US'] = locale.split('-')
    return {
        lg: language.toLowerCase(),
        lc: country.toUpperCase()
    }
}

function defaultWebSubPlatform(): number {
    return proto.ClientPayload.WebInfo.WebSubPlatform.WEB_BROWSER
}

function resolveDevicePropsPlatformType(deviceBrowser?: string): number {
    const normalized = deviceBrowser?.trim().toLowerCase()
    switch (normalized) {
        case 'chrome':
            return proto.DeviceProps.PlatformType.CHROME
        case 'firefox':
            return proto.DeviceProps.PlatformType.FIREFOX
        case 'ie':
            return proto.DeviceProps.PlatformType.IE
        case 'opera':
            return proto.DeviceProps.PlatformType.OPERA
        case 'safari':
            return proto.DeviceProps.PlatformType.SAFARI
        case 'edge':
            return proto.DeviceProps.PlatformType.EDGE
        case 'electron':
        case 'desktop':
            return proto.DeviceProps.PlatformType.DESKTOP
        case 'ipad':
            return proto.DeviceProps.PlatformType.IPAD
        case 'tablet':
        case 'android tablet':
            return proto.DeviceProps.PlatformType.ANDROID_TABLET
        case 'ohana':
            return proto.DeviceProps.PlatformType.OHANA
        case 'aloha':
            return proto.DeviceProps.PlatformType.ALOHA
        case 'catalina':
            return proto.DeviceProps.PlatformType.CATALINA
        default:
            return proto.DeviceProps.PlatformType.UNKNOWN
    }
}

type ParsedVersion = { primary: number; secondary: number; tertiary: number }

function defaultUserAgent(
    versionBase: string,
    deviceOsDisplayName?: string,
    version?: ParsedVersion
): typeof proto.ClientPayload.prototype.userAgent {
    const { primary, secondary, tertiary } = version ?? parseVersion(versionBase)
    const locale = resolveLocale()
    return {
        platform: proto.ClientPayload.UserAgent.Platform.WEB,
        releaseChannel: proto.ClientPayload.UserAgent.ReleaseChannel.RELEASE,
        appVersion: {
            primary,
            secondary,
            tertiary
        },
        mcc: '000',
        mnc: '000',
        osVersion: deviceOsDisplayName ?? process.platform,
        manufacturer: '',
        device: 'Desktop',
        osBuildNumber: '0.1',
        phoneId: randomUUID(),
        localeLanguageIso6391: locale.lg,
        localeCountryIso31661Alpha2: locale.lc
    }
}

function defaultDeviceProps(
    versionBase: string,
    config: Pick<
        WaRegistrationPayloadConfig,
        'deviceBrowser' | 'deviceOsDisplayName' | 'requireFullSync'
    >,
    version?: ParsedVersion
): Uint8Array {
    const { primary, secondary, tertiary } = version ?? parseVersion(versionBase)
    return proto.DeviceProps.encode({
        os: config.deviceOsDisplayName ?? process.platform,
        version: {
            primary,
            secondary,
            tertiary
        },
        platformType: resolveDevicePropsPlatformType(config.deviceBrowser),
        requireFullSync: config.requireFullSync === true,
        historySyncConfig: {
            inlineInitialPayloadInE2EeMsg: true,
            supportBotUserAgentChatHistory: true,
            supportCagReactionsAndPolls: true,
            supportRecentSyncChunkMessageCountTuning: true,
            supportHostedGroupMsg: true,
            supportBizHostedMsg: true,
            supportFbidBotChatHistory: true,
            supportMessageAssociation: true
        }
    }).finish()
}

function buildCommonPayload(
    config: WaPayloadCommonConfig,
    version?: ParsedVersion
): {
    readonly passive: boolean
    readonly pull: boolean
    readonly connectType: number
    readonly connectReason: number
    readonly userAgent: typeof proto.ClientPayload.prototype.userAgent
    readonly webInfo: typeof proto.ClientPayload.prototype.webInfo
} {
    const versionBase = config.versionBase ?? DEFAULT_VERSION_BASE
    const pull = config.pull ?? true
    return {
        passive: config.passive === true,
        pull,
        connectType: proto.ClientPayload.ConnectType.WIFI_UNKNOWN,
        connectReason: proto.ClientPayload.ConnectReason.USER_ACTIVATED,
        userAgent:
            config.userAgent ?? defaultUserAgent(versionBase, config.deviceOsDisplayName, version),
        webInfo:
            config.webInfo ??
            ({
                webSubPlatform: defaultWebSubPlatform()
            } as typeof proto.ClientPayload.prototype.webInfo)
    }
}

export function buildLoginPayload(config: WaLoginPayloadConfig): Uint8Array {
    if (!Number.isSafeInteger(config.username) || config.username <= 0) {
        throw new Error('login payload requires a valid numeric username')
    }
    const common = buildCommonPayload(config)
    return proto.ClientPayload.encode({
        ...common,
        username: config.username,
        device: config.device ?? 0,
        lidDbMigrated: config.lidDbMigrated === true
    }).finish()
}

export function buildRegistrationPayload(config: WaRegistrationPayloadConfig): Uint8Array {
    const registrationId = config.registrationInfo.registrationId
    const signedPreKeyId = config.signedPreKey.keyId
    if (!Number.isSafeInteger(registrationId) || registrationId <= 0) {
        throw new Error('registration payload requires a valid registrationId')
    }
    if (!Number.isSafeInteger(signedPreKeyId) || signedPreKeyId <= 0) {
        throw new Error('registration payload requires a valid signedPreKeyId')
    }

    const versionBase = config.versionBase ?? DEFAULT_VERSION_BASE
    const version = parseVersion(versionBase)
    const common = buildCommonPayload(config, version)
    const devicePairingData = {
        buildHash: config.buildHash ?? md5Bytes(versionBase),
        deviceProps: config.deviceProps ?? defaultDeviceProps(versionBase, config, version),
        eRegid: intToBytes(4, registrationId),
        eKeytype: intToBytes(1, 5),
        eIdent: config.registrationInfo.identityKeyPair.pubKey,
        eSkeyId: intToBytes(3, signedPreKeyId),
        eSkeyVal: config.signedPreKey.keyPair.pubKey,
        eSkeySig: config.signedPreKey.signature
    }
    return proto.ClientPayload.encode({
        ...common,
        devicePairingData
    }).finish()
}
