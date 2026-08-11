import { md5Bytes } from '@crypto/core/primitives'
import { proto } from '@proto'
import type {
    WaLoginPayloadConfig,
    WaPayloadCommonConfig,
    WaRegistrationPayloadConfig
} from '@transport/noise/types'
import { intToBytes } from '@util/bytes'
import { getRuntimeOsVersion } from '@util/runtime'
import { WA_VERSION } from '@version-spec'

type ParsedVersion = {
    primary: number
    secondary: number
    tertiary: number
    quaternary?: number
    quinary?: number
}

function parseVersion(versionBase: string): ParsedVersion {
    const parts = versionBase.split('.')
    const [p = '2', s = '3000', t = '0'] = parts
    const primary = Number.parseInt(p, 10)
    const secondary = Number.parseInt(s, 10)
    const tertiary = Number.parseInt(t, 10)
    const quaternary = parts.length > 3 ? Number.parseInt(parts[3], 10) : undefined
    const quinary = parts.length > 4 ? Number.parseInt(parts[4], 10) : undefined
    if (
        !Number.isSafeInteger(primary) ||
        !Number.isSafeInteger(secondary) ||
        !Number.isSafeInteger(tertiary) ||
        (quaternary !== undefined && !Number.isSafeInteger(quaternary)) ||
        (quinary !== undefined && !Number.isSafeInteger(quinary))
    ) {
        throw new Error(`invalid versionBase: ${versionBase}`)
    }
    return { primary, secondary, tertiary, quaternary, quinary }
}

let cachedLocale: { readonly lg: string; readonly lc: string } | null = null

function resolveLocale(): { readonly lg: string; readonly lc: string } {
    // The first `Intl.DateTimeFormat()` call triggers V8's lazy ICU init
    // (tens of ms). The process locale does not change at runtime, so
    // memoize after the first resolve.
    if (cachedLocale !== null) return cachedLocale
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en-US'
    const [language = 'en', country = 'US'] = locale.split('-')
    cachedLocale = Object.freeze({
        lg: language.toLowerCase(),
        lc: country.toUpperCase()
    })
    return cachedLocale
}

function defaultWebSubPlatform(): number {
    return proto.ClientPayload.WebInfo.WebSubPlatform.WEB_BROWSER
}

export function resolveDevicePropsPlatformType(
    deviceBrowser?: string
): proto.DeviceProps.PlatformType {
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

function defaultUserAgent(
    versionBase: string,
    version?: ParsedVersion
): typeof proto.ClientPayload.prototype.userAgent {
    const { primary, secondary, tertiary, quaternary, quinary } =
        version ?? parseVersion(versionBase)
    const locale = resolveLocale()
    return {
        platform: proto.ClientPayload.UserAgent.Platform.WEB,
        releaseChannel: proto.ClientPayload.UserAgent.ReleaseChannel.RELEASE,
        appVersion: {
            primary,
            secondary,
            tertiary,
            quaternary,
            quinary
        },
        mcc: '000',
        mnc: '000',
        osVersion: '0.1',
        manufacturer: '',
        device: 'Desktop',
        osBuildNumber: '0.1',
        localeLanguageIso6391: locale.lg,
        localeCountryIso31661Alpha2: locale.lc
    }
}

type OsVersion = {
    readonly primary: number
    readonly secondary?: number
    readonly tertiary?: number
}

/**
 * Parses an OS version string into the `DeviceProps.version` tuple. Mirrors
 * WhatsApp Web, which only fills the field when the parsed OS version is a
 * plain dotted-numeric string and otherwise leaves it unset.
 */
function parseOsVersion(osVersion: string | null | undefined): OsVersion | undefined {
    if (osVersion === null || osVersion === undefined || !/^[0-9.]+$/.test(osVersion)) {
        return undefined
    }
    const parts = osVersion.split('.')
    const primary = Number.parseInt(parts[0], 10)
    if (!Number.isSafeInteger(primary)) {
        return undefined
    }
    const secondary = parts.length > 1 ? Number.parseInt(parts[1], 10) : Number.NaN
    const tertiary = parts.length > 2 ? Number.parseInt(parts[2], 10) : Number.NaN
    return {
        primary,
        secondary: Number.isSafeInteger(secondary) ? secondary : undefined,
        tertiary: Number.isSafeInteger(tertiary) ? tertiary : undefined
    }
}

function defaultDeviceProps(
    config: Pick<
        WaRegistrationPayloadConfig,
        'deviceBrowser' | 'deviceOsDisplayName' | 'deviceOsVersion' | 'requireFullSync'
    >
): Uint8Array {
    return proto.DeviceProps.encode({
        os: config.deviceOsDisplayName ?? process.platform,
        version: parseOsVersion(config.deviceOsVersion ?? getRuntimeOsVersion()),
        platformType: resolveDevicePropsPlatformType(config.deviceBrowser),
        requireFullSync: config.requireFullSync === true,
        historySyncConfig: {
            inlineInitialPayloadInE2EeMsg: true,
            supportCallLogHistory: true,
            supportBotUserAgentChatHistory: true,
            supportCagReactionsAndPolls: true,
            supportBizHostedMsg: true,
            supportRecentSyncChunkMessageCountTuning: true,
            supportHostedGroupMsg: true,
            supportFbidBotChatHistory: true,
            supportMessageAssociation: true,
            supportGroupHistory: true,
            thumbnailSyncDaysLimit: 60,
            supportManusHistory: true,
            supportHatchHistory: true,
            supportedBotChannelFbids: []
        }
    }).finish()
}

function buildCommonPayload(
    config: WaPayloadCommonConfig,
    defaultPull: boolean,
    version?: ParsedVersion
): {
    readonly passive: boolean
    readonly pull: boolean
    readonly connectType: number
    readonly connectReason: number
    readonly userAgent: typeof proto.ClientPayload.prototype.userAgent
    readonly webInfo: typeof proto.ClientPayload.prototype.webInfo
} {
    const versionBase = config.versionBase ?? WA_VERSION
    return {
        passive: config.passive === true,
        pull: config.pull ?? defaultPull,
        connectType: proto.ClientPayload.ConnectType.WIFI_UNKNOWN,
        connectReason: proto.ClientPayload.ConnectReason.USER_ACTIVATED,
        userAgent: config.userAgent ?? defaultUserAgent(versionBase, version),
        webInfo: config.webInfo ?? {
            webSubPlatform: defaultWebSubPlatform()
        }
    }
}

export function buildLoginPayload(config: WaLoginPayloadConfig): Uint8Array {
    if (!Number.isSafeInteger(config.username) || config.username <= 0) {
        throw new Error('login payload requires a valid numeric username')
    }
    const common = buildCommonPayload(config, true)
    return proto.ClientPayload.encode({
        ...common,
        username: config.username,
        device: config.device ?? 0,
        lc: config.loginCounter ?? 0,
        connectAttemptCount: config.connectAttemptCount ?? 0,
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

    const versionBase = config.versionBase ?? WA_VERSION
    const version = parseVersion(versionBase)
    const common = buildCommonPayload(config, false, version)
    const devicePairingData = {
        buildHash: config.buildHash ?? md5Bytes(versionBase),
        deviceProps: config.deviceProps ?? defaultDeviceProps(config),
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
