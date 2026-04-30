import type {
    WaAuthClientOptions,
    WaAuthCredentials,
    WaAuthSocketOptions,
    WaMobileTransportOptions
} from '@auth/types'
import { randomBytesAsync, toRawPubKey, xeddsaVerify } from '@crypto'
import { toSerializedPubKey } from '@crypto/core/keys'
import { X25519 } from '@crypto/curves/X25519'
import type { Logger } from '@infra/log/types'
import { getLoginIdentity } from '@protocol/jid'
import { createAndStoreInitialKeys } from '@signal/registration/utils'
import type { WaAuthStore } from '@store/contracts/auth.store'
import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { WaMobileTcpSocketCtor } from '@transport/node/WaMobileTcpSocket'
import { buildMobileLoginPayload } from '@transport/noise/WaMobileClientPayload'
import { toProxyAgent, toProxyDispatcher } from '@transport/proxy'
import type { WaCommsConfig, WaNoiseTrustedRootCa } from '@transport/types'
import { toError } from '@util/primitives'

interface WaAuthCredentialsFlowArgs {
    readonly logger: Logger
    readonly authStore: WaAuthStore
    readonly signalStore: WaSignalStore
    readonly preKeyStore: WaPreKeyStore
    readonly skipSignedPreKeySignatureVerification?: boolean
}

export async function loadOrCreateCredentials(
    args: WaAuthCredentialsFlowArgs
): Promise<WaAuthCredentials> {
    args.logger.trace('auth credentials loadOrCreate start')
    const existing = await args.authStore.load()
    if (!existing) {
        const credentials = await createFreshAndPersistCredentials(args)
        args.logger.info('created fresh auth credentials')
        return credentials
    }

    args.logger.debug('auth credentials loaded from store', {
        registered: existing.meJid !== null && existing.meJid !== undefined,
        hasServerStaticKey:
            existing.serverStaticKey !== null && existing.serverStaticKey !== undefined
    })
    const skipSignedPreKeyCheck = args.skipSignedPreKeySignatureVerification === true
    if (
        !existing.meJid &&
        !skipSignedPreKeyCheck &&
        !(await hasValidSignedPreKey(args.logger, existing))
    ) {
        args.logger.warn('signed pre-key is invalid, regenerating credentials')
        const fresh = await createFreshAndPersistCredentials(args)
        args.logger.info('regenerated credentials due to invalid signed pre-key')
        return fresh
    }

    await restoreSignalStore(args.signalStore, args.preKeyStore, existing)
    args.logger.trace('auth credentials restored into signal store')
    return existing
}

export async function persistCredentials(
    args: WaAuthCredentialsFlowArgs,
    credentials: WaAuthCredentials
): Promise<void> {
    args.logger.trace('persisting auth credentials', {
        registered: credentials.meJid !== null && credentials.meJid !== undefined
    })
    await args.authStore.save(credentials)
}

function mobileTransportFromCredentials(
    credentials: WaAuthCredentials
): WaMobileTransportOptions | undefined {
    if (!credentials.deviceInfo) return undefined
    return {
        deviceInfo: credentials.deviceInfo,
        ...(credentials.pushName !== undefined ? { pushName: credentials.pushName } : {}),
        ...(credentials.yearClass !== undefined ? { yearClass: credentials.yearClass } : {}),
        ...(credentials.memClass !== undefined ? { memClass: credentials.memClass } : {})
    }
}

export function buildCommsConfig(
    logger: Logger,
    credentials: WaAuthCredentials,
    socketOptions: WaAuthSocketOptions,
    clientOptions: Pick<
        WaAuthClientOptions,
        'deviceBrowser' | 'deviceOsDisplayName' | 'requireFullSync' | 'version' | 'mobileTransport'
    > & {
        readonly noiseTrustedRootCa?: WaNoiseTrustedRootCa
        readonly disableNoiseCertificateChainVerification?: boolean
    }
): WaCommsConfig {
    const meJid = credentials.meJid
    const registered = meJid !== null && meJid !== undefined
    const loginIdentity = registered ? getLoginIdentity(meJid) : null
    const wsProxy = socketOptions.proxy?.ws
    // Resolve the effective mobile transport: explicit option wins, otherwise
    // synthesize one from persisted credentials.deviceInfo so a registered
    // mobile session boots in mobile mode without the caller re-passing
    // deviceInfo on every `new WaClient(...)` call.
    const effectiveMobileTransport =
        clientOptions.mobileTransport ?? mobileTransportFromCredentials(credentials)
    logger.debug('building comms config from credentials', {
        registered,
        hasServerStaticKey:
            credentials.serverStaticKey !== null && credentials.serverStaticKey !== undefined,
        mobile: Boolean(effectiveMobileTransport),
        mobileSource: clientOptions.mobileTransport
            ? 'option'
            : effectiveMobileTransport
              ? 'credentials'
              : 'none'
    })

    if (effectiveMobileTransport) {
        if (wsProxy) {
            throw new Error(
                'mobileTransport does not support socketOptions.proxy.ws — remove the proxy option or open an issue to add TCP proxy support'
            )
        }
        if (!loginIdentity) {
            throw new Error(
                'mobileTransport requires registered credentials (meJid) — run the mobile bridge flow first'
            )
        }
        const loginPayload = buildMobileLoginPayload({
            username: loginIdentity.username,
            device: loginIdentity.device,
            passive: effectiveMobileTransport.passive ?? false,
            deviceInfo: effectiveMobileTransport.deviceInfo,
            pushName: effectiveMobileTransport.pushName,
            yearClass: effectiveMobileTransport.yearClass,
            memClass: effectiveMobileTransport.memClass
        })
        return {
            url: effectiveMobileTransport.tcpUrl ?? 'tcp://g.whatsapp.net:443',
            rawWebSocketConstructor: WaMobileTcpSocketCtor,
            connectTimeoutMs: socketOptions.connectTimeoutMs,
            reconnectIntervalMs: socketOptions.reconnectIntervalMs,
            timeoutIntervalMs: socketOptions.timeoutIntervalMs,
            maxReconnectAttempts: socketOptions.maxReconnectAttempts,
            noise: {
                clientStaticKeyPair: credentials.noiseKeyPair,
                isRegistered: true,
                serverStaticKey: credentials.serverStaticKey,
                routingInfo: credentials.routingInfo,
                trustedRootCa: clientOptions.noiseTrustedRootCa,
                verifyCertificateChain: clientOptions.disableNoiseCertificateChainVerification
                    ? false
                    : undefined,
                loginPayload
            }
        }
    }

    return {
        url: socketOptions.url,
        urls: socketOptions.urls,
        protocols: socketOptions.protocols,
        dispatcher: toProxyDispatcher(wsProxy),
        agent: toProxyAgent(wsProxy),
        connectTimeoutMs: socketOptions.connectTimeoutMs,
        reconnectIntervalMs: socketOptions.reconnectIntervalMs,
        timeoutIntervalMs: socketOptions.timeoutIntervalMs,
        maxReconnectAttempts: socketOptions.maxReconnectAttempts,
        noise: {
            clientStaticKeyPair: credentials.noiseKeyPair,
            isRegistered: registered,
            serverStaticKey: credentials.serverStaticKey,
            routingInfo: credentials.routingInfo,
            trustedRootCa: clientOptions.noiseTrustedRootCa,
            verifyCertificateChain: clientOptions.disableNoiseCertificateChainVerification
                ? false
                : undefined,
            loginPayloadConfig: loginIdentity
                ? {
                      username: loginIdentity.username,
                      device: loginIdentity.device,
                      deviceBrowser: clientOptions.deviceBrowser,
                      deviceOsDisplayName: clientOptions.deviceOsDisplayName,
                      versionBase: clientOptions.version
                  }
                : undefined,
            registrationPayloadConfig: !loginIdentity
                ? {
                      registrationInfo: credentials.registrationInfo,
                      signedPreKey: credentials.signedPreKey,
                      deviceBrowser: clientOptions.deviceBrowser,
                      deviceOsDisplayName: clientOptions.deviceOsDisplayName,
                      requireFullSync: clientOptions.requireFullSync,
                      versionBase: clientOptions.version
                  }
                : undefined
        }
    }
}

async function createFreshCredentials(
    signalStore: WaSignalStore,
    preKeyStore: WaPreKeyStore,
    logger: Logger
): Promise<WaAuthCredentials> {
    logger.trace('creating fresh credentials')
    const [noiseKeyPair, registrationBundle, advSecretKey] = await Promise.all([
        X25519.generateKeyPair(),
        createAndStoreInitialKeys(signalStore, preKeyStore),
        randomBytesAsync(32)
    ])
    return {
        noiseKeyPair,
        registrationInfo: registrationBundle.registrationInfo,
        signedPreKey: registrationBundle.signedPreKey,
        serverHasPreKeys: false,
        advSecretKey
    }
}

async function createFreshAndPersistCredentials(
    args: WaAuthCredentialsFlowArgs
): Promise<WaAuthCredentials> {
    const credentials = await createFreshCredentials(
        args.signalStore,
        args.preKeyStore,
        args.logger
    )
    // Persist credentials first so signal restore never commits state for credentials that failed to save.
    await args.authStore.save(credentials)
    await restoreSignalStore(args.signalStore, args.preKeyStore, credentials)
    return credentials
}

async function hasValidSignedPreKey(
    logger: Logger,
    credentials: WaAuthCredentials
): Promise<boolean> {
    try {
        const serializedPubKey = toSerializedPubKey(credentials.signedPreKey.keyPair.pubKey)
        const valid = await xeddsaVerify(
            toRawPubKey(credentials.registrationInfo.identityKeyPair.pubKey),
            serializedPubKey,
            credentials.signedPreKey.signature
        )
        logger.trace('signed pre-key validation completed', { valid })
        return valid
    } catch (error) {
        logger.warn('signed pre-key validation failed with exception', {
            message: toError(error).message
        })
        return false
    }
}

async function restoreSignalStore(
    signalStore: WaSignalStore,
    preKeyStore: WaPreKeyStore,
    credentials: WaAuthCredentials
): Promise<void> {
    await Promise.all([
        signalStore.setRegistrationInfo(credentials.registrationInfo),
        signalStore.setSignedPreKey(credentials.signedPreKey),
        preKeyStore.setServerHasPreKeys(credentials.serverHasPreKeys === true)
    ])
}
