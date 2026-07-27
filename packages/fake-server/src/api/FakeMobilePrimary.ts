/** Registered mobile-primary credentials for driving a phone-side client. */

import type { WaAuthCredentials, WaMobileTransportDeviceInfo, WaStore } from '../transport/auth'
import {
    randomBytesAsync,
    randomIntAsync,
    toSerializedPubKey,
    X25519,
    xeddsaSign
} from '../transport/crypto'

const HOST_DOMAIN = 's.whatsapp.net'
const LID_DOMAIN = 'lid'
const ADV_SECRET_BYTES = 32
const SIGNED_PRE_KEY_ID = 1

/**
 * Device the seeded primary advertises. A phone always sends these in its login
 * `UserAgent`, so they double as the assertion target for a cross-check test.
 */
const DEFAULT_DEVICE_INFO: WaMobileTransportDeviceInfo = {
    manufacturer: 'Google',
    device: 'Pixel 7',
    osVersion: '14',
    osBuildNumber: 'UQ1A.240205.004',
    appVersion: '2.26.27.70',
    mcc: '724',
    mnc: '10',
    localeLanguageIso6391: 'pt',
    localeCountryIso31661Alpha2: 'BR'
}

export interface SeedFakeMobilePrimaryOptions {
    /** Account phone number, digits only (for example `5511999999999`). */
    readonly phoneNumber: string
    /** Overrides merged over the default phone identity. */
    readonly deviceInfo?: Partial<WaMobileTransportDeviceInfo>
    readonly pushName?: string
    /**
     * LID user part. Set it to make the primary LID-native, which is what
     * drives `<client-props isChatDbLidMigrated>` on a pair-device upload.
     */
    readonly lidUser?: string
}

export interface FakeMobilePrimary {
    /** `<phone>@s.whatsapp.net` – the primary is always device 0. */
    readonly meJid: string
    readonly meLid: string | null
    readonly deviceInfo: WaMobileTransportDeviceInfo
    readonly credentials: WaAuthCredentials
}

/**
 * Seeds a store session with the credentials of an already-registered mobile
 * primary, so a client can connect in mobile mode without a registration flow
 * (which happens out of band, against WhatsApp's HTTP registration endpoints,
 * and is therefore out of this server's reach).
 *
 * The returned `deviceInfo` goes straight into the client's `mobileTransport`;
 * point its `tcpUrl` at {@link FakeWaServer.tcpUrl}:
 *
 * @example
 * ```ts
 * const server = await FakeWaServer.start({ tcp: true })
 * const store = createStore({})
 * const primary = await seedFakeMobilePrimary(store, 'mobile-session', {
 *     phoneNumber: '5511999999999'
 * })
 * const client = new WaClient({
 *     store,
 *     sessionId: 'mobile-session',
 *     mobileTransport: { deviceInfo: primary.deviceInfo, tcpUrl: server.tcpUrl },
 *     testHooks: { noiseRootCa: server.noiseRootCa }
 * })
 * ```
 *
 * @throws when `phoneNumber` is not a positive digit-only string.
 */
export async function seedFakeMobilePrimary(
    store: WaStore,
    sessionId: string,
    options: SeedFakeMobilePrimaryOptions
): Promise<FakeMobilePrimary> {
    const primary = await createFakeMobilePrimary(options)
    await store.session(sessionId).auth.save(primary.credentials)
    return primary
}

/**
 * Builds registered mobile-primary credentials without persisting them. Use
 * {@link seedFakeMobilePrimary} unless you own the persistence yourself.
 *
 * @throws when `phoneNumber` is not a positive digit-only string.
 */
export async function createFakeMobilePrimary(
    options: SeedFakeMobilePrimaryOptions
): Promise<FakeMobilePrimary> {
    if (!/^[1-9]\d*$/.test(options.phoneNumber)) {
        throw new Error(
            `phoneNumber must be digits only without a leading zero, got: ${options.phoneNumber}`
        )
    }
    // The login payload carries the number as a numeric username, so anything
    // past the safe-integer range would seed credentials that only fail later,
    // on connect.
    if (!Number.isSafeInteger(Number(options.phoneNumber))) {
        throw new Error(
            `phoneNumber is too long to be sent as a numeric username: ${options.phoneNumber}`
        )
    }

    const [noiseKeyPair, identityKeyPair, signedPreKeyPair, advSecretKey, registrationId] =
        await Promise.all([
            X25519.generateKeyPair(),
            X25519.generateKeyPair(),
            X25519.generateKeyPair(),
            randomBytesAsync(ADV_SECRET_BYTES),
            randomIntAsync(1, 16_381)
        ])
    const signature = await xeddsaSign(
        identityKeyPair.privKey,
        toSerializedPubKey(signedPreKeyPair.pubKey)
    )

    const deviceInfo: WaMobileTransportDeviceInfo = {
        ...DEFAULT_DEVICE_INFO,
        ...options.deviceInfo
    }
    const meJid = `${options.phoneNumber}@${HOST_DOMAIN}`
    const meLid = options.lidUser ? `${options.lidUser}@${LID_DOMAIN}` : null

    const credentials: WaAuthCredentials = {
        noiseKeyPair,
        registrationInfo: { registrationId, identityKeyPair },
        signedPreKey: {
            keyId: SIGNED_PRE_KEY_ID,
            keyPair: signedPreKeyPair,
            signature,
            uploaded: false
        },
        advSecretKey,
        meJid,
        deviceInfo,
        // A phone has no companion device-identity and no key-index list of its
        // own: both are minted at pairing time, by this primary, for others.
        serverHasPreKeys: false,
        ...(meLid ? { meLid } : {}),
        ...(options.pushName ? { pushName: options.pushName } : {})
    }

    return { meJid, meLid, deviceInfo, credentials }
}
