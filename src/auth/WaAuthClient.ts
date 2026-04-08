import {
    buildCommsConfig,
    loadOrCreateCredentials,
    persistCredentials
} from '@auth/flow/WaAuthCredentialsFlow'
import { WaPairingFlow } from '@auth/pairing/WaPairingFlow'
import { WaQrFlow } from '@auth/pairing/WaQrFlow'
import type {
    WaAuthClientOptions,
    WaAuthCredentials,
    WaAuthSocketOptions,
    WaSuccessPersistAttributes
} from '@auth/types'
import type { Logger } from '@infra/log/types'
import { getWaCompanionPlatformId, WA_DEFAULTS } from '@protocol/constants'
import type { WaAuthStore } from '@store/contracts/auth.store'
import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import type { BinaryNode, WaNoiseTrustedRootCa } from '@transport/types'
import { uint8Equal } from '@util/bytes'
import { toError } from '@util/primitives'
import { getRuntimeOsDisplayName } from '@util/runtime'

type WaAuthClientDeps = Readonly<{
    readonly logger: Logger
    readonly authStore: WaAuthStore
    readonly signalStore: WaSignalStore
    readonly preKeyStore: WaPreKeyStore
    readonly socket: {
        readonly sendNode: (node: BinaryNode) => Promise<void>
        readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
    }
    readonly callbacks?: {
        readonly onQr?: (qr: string, ttlMs: number) => void
        readonly onPairingCode?: (code: string) => void
        readonly onPairingRefresh?: (forceManual: boolean) => void
        readonly onPaired?: (credentials: WaAuthCredentials) => void
        readonly onError?: (error: Error) => void
    }
}>

export class WaAuthClient {
    private readonly options: Readonly<WaAuthClientOptions>
    private readonly logger: Logger
    private readonly callbacks: NonNullable<WaAuthClientDeps['callbacks']>
    private readonly authStore: WaAuthStore
    private readonly signalStore: WaSignalStore
    private readonly preKeyStore: WaPreKeyStore
    private readonly qrFlow: WaQrFlow
    private readonly pairingFlow: WaPairingFlow
    private credentials: WaAuthCredentials | null

    public constructor(options: WaAuthClientOptions, deps: WaAuthClientDeps) {
        const deviceBrowser = options.deviceBrowser ?? WA_DEFAULTS.DEVICE_BROWSER
        const device = Object.freeze({
            browser: deviceBrowser,
            osDisplayName: options.deviceOsDisplayName ?? getRuntimeOsDisplayName(),
            platform: options.devicePlatform ?? getWaCompanionPlatformId(deviceBrowser)
        })
        this.options = Object.freeze({
            ...options,
            deviceBrowser: device.browser,
            deviceOsDisplayName: device.osDisplayName,
            devicePlatform: device.platform,
            requireFullSync: options.requireFullSync
        })
        this.logger = deps.logger
        this.callbacks = deps.callbacks ?? {}
        this.authStore = deps.authStore
        this.signalStore = deps.signalStore
        this.preKeyStore = deps.preKeyStore
        this.credentials = null

        this.qrFlow = new WaQrFlow({
            logger: this.logger,
            getCredentials: () => this.credentials,
            getDevicePlatform: () => device.platform,
            emitQr: (qr, ttlMs) => this.callbacks.onQr?.(qr, ttlMs)
        })
        this.pairingFlow = new WaPairingFlow({
            logger: this.logger,
            auth: {
                getCredentials: () => this.credentials,
                updateCredentials: this.updateCredentials.bind(this)
            },
            socket: deps.socket,
            qrFlow: this.qrFlow,
            device,
            callbacks: {
                emitPairingCode: (code) => this.callbacks.onPairingCode?.(code),
                emitPairingRefresh: (forceManual) => this.callbacks.onPairingRefresh?.(forceManual),
                emitPaired: (credentials) => this.callbacks.onPaired?.(credentials)
            }
        })
    }

    public getState(connected = false) {
        return {
            connected,
            registered: this.credentials?.meJid !== null && this.credentials?.meJid !== undefined,
            hasQr: this.qrFlow.hasQr(),
            hasPairingCode: this.pairingFlow.hasPairingSession()
        }
    }

    public getCurrentCredentials(): WaAuthCredentials | null {
        return this.credentials
    }

    public async loadOrCreateCredentials(): Promise<WaAuthCredentials> {
        return this.runHandled(async () => {
            this.logger.debug('auth client loadOrCreateCredentials start')
            this.credentials = await loadOrCreateCredentials({
                logger: this.logger,
                authStore: this.authStore,
                signalStore: this.signalStore,
                preKeyStore: this.preKeyStore
            })
            this.logger.info('auth client credentials ready', {
                registered:
                    this.credentials?.meJid !== null && this.credentials?.meJid !== undefined
            })
            return this.credentials
        })
    }

    public buildCommsConfig(
        socketOptions: WaAuthSocketOptions,
        overrides: { readonly noiseTrustedRootCa?: WaNoiseTrustedRootCa } = {}
    ) {
        this.logger.trace('auth client building comms config')
        return buildCommsConfig(this.logger, this.requireCredentials(), socketOptions, {
            deviceBrowser: this.options.deviceBrowser,
            deviceOsDisplayName: this.options.deviceOsDisplayName,
            requireFullSync: this.options.requireFullSync,
            version: this.options.version,
            noiseTrustedRootCa: overrides.noiseTrustedRootCa
        })
    }

    public async clearTransientState(): Promise<void> {
        this.logger.trace('auth client clear transient state')
        this.qrFlow.clear()
        this.pairingFlow.clearSession()
    }

    public async clearStoredCredentials(): Promise<void> {
        this.logger.warn('auth client clearing stored credentials')
        this.credentials = null
        await Promise.all([this.authStore.clear(), this.clearTransientState()])
    }

    public async persistServerStaticKey(serverStaticKey: Uint8Array): Promise<void> {
        this.logger.debug('persisting server static key', {
            keyLength: serverStaticKey.byteLength
        })
        await this.patchCredentials((credentials) => ({
            ...credentials,
            serverStaticKey
        }))
    }

    public async persistServerHasPreKeys(serverHasPreKeys: boolean): Promise<void> {
        await this.patchCredentials(
            (credentials) => ({
                ...credentials,
                serverHasPreKeys
            }),
            {
                shouldPersist: (current) => current.serverHasPreKeys !== serverHasPreKeys,
                onPersist: () => {
                    this.logger.debug('persisting serverHasPreKeys', {
                        serverHasPreKeys
                    })
                }
            }
        )
    }

    public async persistRoutingInfo(routingInfo: Uint8Array): Promise<void> {
        this.logger.trace('persisting routing info', {
            byteLength: routingInfo.byteLength
        })
        await this.patchCredentials(
            (credentials) => ({
                ...credentials,
                routingInfo
            }),
            {
                shouldPersist: (current) => {
                    if (current.routingInfo && uint8Equal(current.routingInfo, routingInfo)) {
                        this.logger.trace('routing info unchanged, skipping persistence')
                        return false
                    }
                    return true
                }
            }
        )
    }

    public async clearRoutingInfo(): Promise<WaAuthCredentials> {
        return this.patchCredentials(
            (credentials) => ({
                ...credentials,
                routingInfo: undefined
            }),
            {
                shouldPersist: (current) => current.routingInfo !== undefined,
                onPersist: () => {
                    this.logger.warn('clearing persisted routing info')
                }
            }
        )
    }

    public async persistSuccessAttributes(attributes: WaSuccessPersistAttributes): Promise<void> {
        let persistDiff: Record<string, boolean> | undefined
        const computeDiff = (current: WaAuthCredentials, next: WaAuthCredentials) => ({
            lidChanged: next.meLid !== current.meLid,
            displayNameChanged: next.meDisplayName !== current.meDisplayName,
            companionChanged:
                (current.companionEncStatic === undefined) !==
                    (next.companionEncStatic === undefined) ||
                (current.companionEncStatic !== undefined &&
                    next.companionEncStatic !== undefined &&
                    !uint8Equal(current.companionEncStatic, next.companionEncStatic)),
            lastSuccessTsChanged: next.lastSuccessTs !== current.lastSuccessTs,
            propsVersionChanged: next.propsVersion !== current.propsVersion,
            abPropsVersionChanged: next.abPropsVersion !== current.abPropsVersion,
            connectionLocationChanged: next.connectionLocation !== current.connectionLocation,
            accountCreationTsChanged: next.accountCreationTs !== current.accountCreationTs
        })
        await this.patchCredentials(
            (credentials) => ({
                ...credentials,
                meLid: attributes.meLid ?? credentials.meLid,
                meDisplayName: attributes.meDisplayName ?? credentials.meDisplayName,
                companionEncStatic: attributes.companionEncStatic ?? credentials.companionEncStatic,
                lastSuccessTs: attributes.lastSuccessTs ?? credentials.lastSuccessTs,
                propsVersion: attributes.propsVersion ?? credentials.propsVersion,
                abPropsVersion: attributes.abPropsVersion ?? credentials.abPropsVersion,
                connectionLocation: attributes.connectionLocation ?? credentials.connectionLocation,
                accountCreationTs: attributes.accountCreationTs ?? credentials.accountCreationTs
            }),
            {
                shouldPersist: (current, next) => {
                    persistDiff = computeDiff(current, next)
                    return Object.values(persistDiff).some(Boolean)
                },
                onPersist: () => {
                    this.logger.debug('persisting success attributes', persistDiff)
                }
            }
        )
    }

    public async requestPairingCode(
        phoneNumber: string,
        shouldShowPushNotification = false
    ): Promise<string> {
        this.requireCredentials()
        this.logger.info('auth client requesting pairing code')
        return this.runHandled(() =>
            this.pairingFlow.requestPairingCode(phoneNumber, shouldShowPushNotification)
        )
    }

    public async fetchPairingCountryCodeIso(): Promise<string> {
        this.requireCredentials()
        this.logger.trace('auth client fetching pairing country code ISO')
        return this.runHandled(() => this.pairingFlow.fetchPairingCountryCodeIso())
    }

    public async handleIncomingIqSet(node: BinaryNode): Promise<boolean> {
        this.logger.trace('auth client handleIncomingIqSet', { id: node.attrs.id })
        return this.runHandled(() => this.pairingFlow.handleIncomingIqSet(node))
    }

    public async handleLinkCodeNotification(node: BinaryNode): Promise<boolean> {
        this.logger.trace('auth client handleLinkCodeNotification', { id: node.attrs.id })
        return this.runHandled(() => this.pairingFlow.handleLinkCodeNotification(node))
    }

    public async handleCompanionRegRefreshNotification(node: BinaryNode): Promise<boolean> {
        this.logger.trace('auth client handleCompanionRegRefreshNotification', {
            id: node.attrs.id
        })
        return this.runHandled(() => this.pairingFlow.handleCompanionRegRefreshNotification(node))
    }

    private async patchCredentials(
        buildNext: (current: WaAuthCredentials) => WaAuthCredentials,
        options: {
            readonly shouldPersist?: (
                current: WaAuthCredentials,
                next: WaAuthCredentials
            ) => boolean
            readonly onPersist?: (current: WaAuthCredentials, next: WaAuthCredentials) => void
        } = {}
    ): Promise<WaAuthCredentials> {
        const current = this.requireCredentials()
        const next = buildNext(current)
        if (options.shouldPersist && !options.shouldPersist(current, next)) {
            return current
        }
        options.onPersist?.(current, next)
        await this.updateCredentials(next)
        return next
    }

    private async runHandled<T>(action: () => Promise<T>): Promise<T> {
        try {
            return await action()
        } catch (error) {
            this.handleError(toError(error))
            throw error
        }
    }

    private async updateCredentials(credentials: WaAuthCredentials): Promise<void> {
        this.logger.trace('auth client update credentials', {
            registered: credentials?.meJid !== null && credentials?.meJid !== undefined
        })
        this.credentials = credentials
        await persistCredentials(
            {
                logger: this.logger,
                authStore: this.authStore,
                signalStore: this.signalStore,
                preKeyStore: this.preKeyStore
            },
            credentials
        )
    }

    private requireCredentials(): WaAuthCredentials {
        if (!this.credentials) {
            throw new Error('credentials are not initialized')
        }
        return this.credentials
    }

    private handleError(error: Error): void {
        this.logger.error('wa auth client error', { message: error.message })
        this.callbacks.onError?.(error)
    }
}
