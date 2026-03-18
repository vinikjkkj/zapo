import type { WaAuthClientOptions, WaAuthCredentials, WaAuthSocketOptions } from '@auth/types'
import { randomBytesAsync } from '@crypto'
import { toSerializedPubKey } from '@crypto/core/keys'
import { X25519 } from '@crypto/curves/X25519'
import type { Logger } from '@infra/log/types'
import { getLoginIdentity } from '@protocol/jid'
import { verifySignalSignature } from '@signal/crypto/WaAdvSignature'
import { createAndStoreInitialKeys } from '@signal/registration/utils'
import type { WaAuthStore } from '@store/contracts/auth.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { toProxyAgent, toProxyDispatcher } from '@transport/proxy'
import type { WaCommsConfig } from '@transport/types'
import { toError } from '@util/primitives'

interface WaAuthCredentialsFlowArgs {
    readonly logger: Logger
    readonly authStore: WaAuthStore
    readonly signalStore: WaSignalStore
}

export async function loadOrCreateCredentials(
    args: WaAuthCredentialsFlowArgs
): Promise<WaAuthCredentials> {
    args.logger.trace('auth credentials loadOrCreate start')
    const existing = await args.authStore.load()
    if (!existing) {
        const credentials = await createAndPersistFreshCredentials(args)
        args.logger.info('created fresh auth credentials')
        return credentials
    }

    args.logger.debug('auth credentials loaded from store', {
        registered: existing.meJid !== null && existing.meJid !== undefined,
        hasServerStaticKey:
            existing.serverStaticKey !== null && existing.serverStaticKey !== undefined
    })
    if (!existing.meJid && !(await hasValidSignedPreKey(args.logger, existing))) {
        args.logger.warn('signed pre-key is invalid, regenerating credentials')
        const fresh = await createAndPersistFreshCredentials(args)
        args.logger.info('regenerated credentials due to invalid signed pre-key')
        return fresh
    }

    await restoreSignalStore(args.signalStore, existing)
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

export function buildCommsConfig(
    logger: Logger,
    credentials: WaAuthCredentials,
    socketOptions: WaAuthSocketOptions,
    clientOptions: Pick<
        WaAuthClientOptions,
        'deviceBrowser' | 'deviceOsDisplayName' | 'requireFullSync'
    >
): WaCommsConfig {
    const registered = credentials.meJid !== null && credentials.meJid !== undefined
    const loginIdentity = registered ? getLoginIdentity(credentials.meJid) : null
    const wsProxy = socketOptions.proxy?.ws
    logger.debug('building comms config from credentials', {
        registered,
        hasServerStaticKey:
            credentials.serverStaticKey !== null && credentials.serverStaticKey !== undefined
    })

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
            loginPayloadConfig: loginIdentity
                ? {
                      username: loginIdentity.username,
                      device: loginIdentity.device,
                      deviceBrowser: clientOptions.deviceBrowser,
                      deviceOsDisplayName: clientOptions.deviceOsDisplayName
                  }
                : undefined,
            registrationPayloadConfig: !loginIdentity
                ? {
                      registrationInfo: credentials.registrationInfo,
                      signedPreKey: credentials.signedPreKey,
                      deviceBrowser: clientOptions.deviceBrowser,
                      deviceOsDisplayName: clientOptions.deviceOsDisplayName,
                      requireFullSync: clientOptions.requireFullSync
                  }
                : undefined
        }
    }
}

async function createFreshCredentials(
    signalStore: WaSignalStore,
    logger: Logger
): Promise<WaAuthCredentials> {
    logger.trace('creating fresh credentials')
    const [noiseKeyPair, registrationBundle, advSecretKey] = await Promise.all([
        X25519.generateKeyPair(),
        createAndStoreInitialKeys(signalStore),
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

async function createAndPersistFreshCredentials(
    args: WaAuthCredentialsFlowArgs
): Promise<WaAuthCredentials> {
    const credentials = await createFreshCredentials(args.signalStore, args.logger)
    await persistFreshCredentials(args, credentials)
    return credentials
}

async function hasValidSignedPreKey(
    logger: Logger,
    credentials: WaAuthCredentials
): Promise<boolean> {
    try {
        const serializedPubKey = toSerializedPubKey(credentials.signedPreKey.keyPair.pubKey)
        const valid = await verifySignalSignature(
            credentials.registrationInfo.identityKeyPair.pubKey,
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
    credentials: WaAuthCredentials
): Promise<void> {
    await signalStore.setRegistrationInfo(credentials.registrationInfo)
    await signalStore.setSignedPreKey(credentials.signedPreKey)
    await signalStore.setServerHasPreKeys(credentials.serverHasPreKeys === true)
}

async function persistFreshCredentials(
    args: WaAuthCredentialsFlowArgs,
    credentials: WaAuthCredentials
): Promise<void> {
    await args.authStore.save(credentials)
    await restoreSignalStore(args.signalStore, credentials)
}
