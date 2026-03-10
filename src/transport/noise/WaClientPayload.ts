import { randomUUID } from 'node:crypto'

import { md5Bytes } from '../../crypto/core/primitives'
import { proto } from '../../proto'
import { KEY_TYPE_CURVE25519 } from '../../signal/constants'
import { DEFAULT_VERSION_BASE } from '../../transport/noise/constants'
import { toBytesView } from '../../util/bytes'

import type {
    WaLoginPayloadConfig,
    WaPayloadCommonConfig,
    WaRegistrationPayloadConfig
} from './types'

function intToBytes(byteLength: number, value: number): Uint8Array {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`invalid integer value: ${value}`)
    }
    const out = new Uint8Array(byteLength)
    let current = value
    for (let i = byteLength - 1; i >= 0; i -= 1) {
        out[i] = current & 0xff
        current >>= 8
    }
    return out
}

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

function defaultUserAgent(versionBase: string): typeof proto.ClientPayload.prototype.userAgent {
    const { primary, secondary, tertiary } = parseVersion(versionBase)
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
        osVersion: process.platform,
        manufacturer: 'wha.ts',
        device: 'Desktop',
        osBuildNumber: process.version,
        phoneId: randomUUID(),
        localeLanguageIso6391: locale.lg,
        localeCountryIso31661Alpha2: locale.lc
    }
}

function defaultDeviceProps(versionBase: string): Uint8Array {
    const { primary, secondary, tertiary } = parseVersion(versionBase)
    return proto.DeviceProps.encode({
        os: process.platform,
        version: {
            primary,
            secondary,
            tertiary
        },
        platformType: proto.DeviceProps.PlatformType.DESKTOP,
        requireFullSync: false,
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

function buildCommonPayload(config: WaPayloadCommonConfig): {
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
        userAgent: config.userAgent ?? defaultUserAgent(versionBase),
        webInfo:
            config.webInfo ??
            ({
                webSubPlatform: defaultWebSubPlatform()
            } as typeof proto.ClientPayload.prototype.webInfo)
    }
}

export async function buildLoginPayload(config: WaLoginPayloadConfig): Promise<Uint8Array> {
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

export async function buildRegistrationPayload(
    config: WaRegistrationPayloadConfig
): Promise<Uint8Array> {
    const registrationId = config.registrationInfo.registrationId
    const signedPreKeyId = config.signedPreKey.keyId
    if (!Number.isSafeInteger(registrationId) || registrationId <= 0) {
        throw new Error('registration payload requires a valid registrationId')
    }
    if (!Number.isSafeInteger(signedPreKeyId) || signedPreKeyId <= 0) {
        throw new Error('registration payload requires a valid signedPreKeyId')
    }

    const versionBase = config.versionBase ?? DEFAULT_VERSION_BASE
    const common = buildCommonPayload(config)
    const devicePairingData = {
        buildHash: config.buildHash ? toBytesView(config.buildHash) : md5Bytes(versionBase),
        deviceProps: config.deviceProps
            ? toBytesView(config.deviceProps)
            : defaultDeviceProps(versionBase),
        eRegid: intToBytes(4, registrationId),
        eKeytype: intToBytes(1, KEY_TYPE_CURVE25519),
        eIdent: toBytesView(config.registrationInfo.identityKeyPair.pubKey),
        eSkeyId: intToBytes(3, signedPreKeyId),
        eSkeyVal: toBytesView(config.signedPreKey.keyPair.pubKey),
        eSkeySig: toBytesView(config.signedPreKey.signature)
    }
    return proto.ClientPayload.encode({
        ...common,
        devicePairingData
    }).finish()
}
