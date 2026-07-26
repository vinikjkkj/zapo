/** ClientPayload parser/validator (registration vs login flavors). */

import { proto, type Proto } from '../../transport/protos'

export interface RegistrationPayload {
    readonly kind: 'registration'
    readonly raw: Proto.IClientPayload
    readonly devicePairingData: NonNullable<Proto.IClientPayload['devicePairingData']>
}

/**
 * Transport flavor a login `ClientPayload` was built for. `web` covers the
 * companion/WhatsApp Web payload, `mobile` the phone payload sent over the
 * mobile TCP transport.
 */
export type ClientPayloadFlavor = 'web' | 'mobile'

/** Phone identity a mobile login advertises in its `UserAgent`. */
export interface MobileLoginDetails {
    readonly manufacturer: string
    readonly device: string
    readonly osVersion: string
    readonly osBuildNumber: string
    /** Dotted Android app version rebuilt from the `AppVersion` message. */
    readonly appVersion: string
    readonly phoneId: string
    readonly mcc: string
    readonly mnc: string
    readonly pushName: string | null
    readonly yearClass: number | null
    readonly memClass: number | null
}

export interface LoginPayload {
    readonly kind: 'login'
    readonly raw: Proto.IClientPayload
    readonly username: string
    readonly device: number
    readonly loginCounter: number
    readonly flavor: ClientPayloadFlavor
    /** Phone details for a `mobile` login; `null` for a web login. */
    readonly mobile: MobileLoginDetails | null
}

export type ParsedClientPayload = RegistrationPayload | LoginPayload

export class ClientPayloadValidationError extends Error {
    public readonly code: string
    public constructor(code: string, message: string) {
        super(message)
        this.name = 'ClientPayloadValidationError'
        this.code = code
    }
}

export function parseClientPayload(bytes: Uint8Array): ParsedClientPayload {
    let raw: Proto.IClientPayload
    try {
        raw = proto.ClientPayload.decode(bytes)
    } catch (error) {
        throw new ClientPayloadValidationError(
            'invalid_proto',
            `failed to decode ClientPayload: ${(error as Error).message}`
        )
    }

    const devicePairingData = raw.devicePairingData
    if (devicePairingData) {
        validateRegistrationFields(devicePairingData)
        return {
            kind: 'registration',
            raw,
            devicePairingData
        }
    }

    if (raw.username === undefined || raw.username === null) {
        throw new ClientPayloadValidationError(
            'missing_username',
            'login ClientPayload is missing the username field'
        )
    }

    const flavor = resolveLoginFlavor(raw)
    return {
        kind: 'login',
        raw,
        username: String(raw.username),
        device: typeof raw.device === 'number' ? raw.device : 0,
        loginCounter: typeof raw.lc === 'number' ? raw.lc : 0,
        flavor,
        mobile: flavor === 'mobile' ? parseMobileDetails(raw) : null
    }
}

/**
 * Resolves the transport flavor of a login payload. `webInfo` and the `WEB`
 * platform mark a companion; a phone is identified by the device fields only
 * the mobile payload carries. Sniffing those fields (rather than the platform
 * enum alone) is deliberate: `ANDROID` is the zero value of the enum, so a
 * payload that omits `platform` entirely would otherwise read as mobile.
 */
function resolveLoginFlavor(raw: Proto.IClientPayload): ClientPayloadFlavor {
    if (raw.webInfo) {
        return 'web'
    }
    const userAgent = raw.userAgent
    if (!userAgent || userAgent.platform === proto.ClientPayload.UserAgent.Platform.WEB) {
        return 'web'
    }
    return userAgent.manufacturer && userAgent.device ? 'mobile' : 'web'
}

function parseMobileDetails(raw: Proto.IClientPayload): MobileLoginDetails {
    const userAgent = raw.userAgent
    if (!userAgent) {
        throw new ClientPayloadValidationError(
            'missing_field',
            'mobile login ClientPayload is missing the userAgent'
        )
    }
    const required: ReadonlyArray<readonly [keyof typeof userAgent, string]> = [
        ['manufacturer', 'device manufacturer'],
        ['device', 'device model'],
        ['osVersion', 'os version'],
        ['osBuildNumber', 'os build number'],
        ['phoneId', 'phone id']
    ]
    for (const [field, label] of required) {
        const value = userAgent[field]
        if (value === undefined || value === null || value === '') {
            throw new ClientPayloadValidationError(
                'missing_field',
                `mobile login ClientPayload missing ${label} (userAgent.${String(field)})`
            )
        }
    }
    const appVersion = userAgent.appVersion
    if (!appVersion || appVersion.primary === undefined || appVersion.primary === null) {
        throw new ClientPayloadValidationError(
            'missing_field',
            'mobile login ClientPayload missing the app version (userAgent.appVersion)'
        )
    }
    return {
        manufacturer: String(userAgent.manufacturer),
        device: String(userAgent.device),
        osVersion: String(userAgent.osVersion),
        osBuildNumber: String(userAgent.osBuildNumber),
        appVersion: formatAppVersion(appVersion),
        phoneId: String(userAgent.phoneId),
        mcc: userAgent.mcc ? String(userAgent.mcc) : '000',
        mnc: userAgent.mnc ? String(userAgent.mnc) : '000',
        pushName: typeof raw.pushName === 'string' ? raw.pushName : null,
        yearClass: toOptionalNumber(raw.yearClass),
        memClass: toOptionalNumber(raw.memClass)
    }
}

function formatAppVersion(
    version: NonNullable<NonNullable<Proto.IClientPayload['userAgent']>['appVersion']>
): string {
    const parts = [version.primary, version.secondary, version.tertiary, version.quaternary]
    const present: number[] = []
    for (const part of parts) {
        if (part === undefined || part === null) {
            break
        }
        present.push(Number(part))
    }
    return present.join('.')
}

function toOptionalNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function validateRegistrationFields(
    devicePairingData: NonNullable<Proto.IClientPayload['devicePairingData']>
): void {
    const required: ReadonlyArray<readonly [keyof typeof devicePairingData, string]> = [
        ['eIdent', 'identity public key'],
        ['eRegid', 'registration id'],
        ['eKeytype', 'key type marker'],
        ['eSkeyId', 'signed pre-key id'],
        ['eSkeyVal', 'signed pre-key public'],
        ['eSkeySig', 'signed pre-key signature'],
        ['buildHash', 'client build hash'],
        ['deviceProps', 'device properties']
    ]
    for (const [field, label] of required) {
        const value = devicePairingData[field]
        if (value === undefined || value === null) {
            throw new ClientPayloadValidationError(
                'missing_field',
                `registration ClientPayload missing ${label} (devicePairingData.${String(field)})`
            )
        }
    }
}
