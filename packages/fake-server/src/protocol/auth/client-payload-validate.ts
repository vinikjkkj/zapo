/**
 * ClientPayload parser and dispatcher.
 *
 * Source:
 *   /deobfuscated/WAWebClientPayload/WAWebClientPayload.js
 *   - getClientPayloadForLogin       → builds the login flavor
 *   - getClientPayloadForRegistration → builds the registration flavor
 *
 * The fake server only consumes the payload — it never produces one — so
 * this module is the inverse of the deobfuscated builders. It decodes the
 * raw bytes coming out of the noise handshake into a typed result that
 * higher layers can use to decide which response to send back.
 *
 * Two flavors:
 *
 *   1. Registration (first-time pairing)
 *      Identified by the presence of `devicePairingData`. Carries the
 *      Signal identity key, signed pre-key + signature, registration ID
 *      and DeviceProps so the server can pair the new companion device.
 *
 *   2. Login (resume / reconnection)
 *      Identified by the presence of `username` (the JID user as uint64)
 *      and the absence of `devicePairingData`. Carries the login counter
 *      and the device index.
 */

import { proto, type Proto } from '../../transport/protos'

export interface RegistrationPayload {
    readonly kind: 'registration'
    readonly raw: Proto.IClientPayload
    readonly devicePairingData: NonNullable<Proto.IClientPayload['devicePairingData']>
}

export interface LoginPayload {
    readonly kind: 'login'
    readonly raw: Proto.IClientPayload
    readonly username: string
    readonly device: number
    readonly loginCounter: number
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

    return {
        kind: 'login',
        raw,
        username: String(raw.username),
        device: typeof raw.device === 'number' ? raw.device : 0,
        loginCounter: typeof raw.lc === 'number' ? raw.lc : 0
    }
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
