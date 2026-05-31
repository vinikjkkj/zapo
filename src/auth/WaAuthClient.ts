import {
    buildCommsConfig,
    loadOrCreateCredentials,
    persistCredentials
} from '@auth/credentials-flow'
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
import type { WaNoiseRootCa } from '@transport/noise/WaNoiseCert'
import type { BinaryNode, WaCommsConfig } from '@transport/types'
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
    readonly isConnected?: () => boolean
    readonly callbacks?: {
        readonly onQr?: (qr: string, ttlMs: number) => void
        readonly onPairingCode?: (code: string) => void
        readonly onPairingRefresh?: (forceManual: boolean) => void
        readonly onPaired?: (credentials: WaAuthCredentials) => void
        readonly onError?: (error: Error) => void
    }
}>

/**
 * Owns the auth/pairing lifecycle and persistence of {@link WaAuthCredentials}.
 * Exposed as `client.auth` on a {@link WaClient}.
 *
 * Lifecycle: construct with options + dependencies, call
 * {@link loadOrCreateCredentials} to bring credentials online, then either
 * follow the QR flow (`onQr` callback) or call {@link requestPairingCode} for
 * the link-code flow.
 */
export class WaAuthClient {
    private readonly options: Readonly<WaAuthClientOptions>
    private readonly logger: Logger
    private readonly callbacks: NonNullable<WaAuthClientDeps['callbacks']>
    private readonly authStore: WaAuthStore
    private readonly signalStore: WaSignalStore
    private readonly preKeyStore: WaPreKeyStore
    private readonly isConnected?: () => boolean
    private readonly qrFlow: WaQrFlow
    private readonly pairingFlow: WaPairingFlow
    private credentials: WaAuthCredentials | null
    private versionOverride: string | null = null

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
        this.isConnected = deps.isConnected
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
            },
            dangerous: options.dangerous
        })
    }

    /**
     * Returns a snapshot of auth readiness flags (connection, registration,
     * pending QR/pairing prompts).
     */
    public getState(connected = false) {
        return {
            connected,
            registered: this.credentials?.meJid !== null && this.credentials?.meJid !== undefined,
            hasQr: this.qrFlow.hasQr(),
            hasPairingCode: this.pairingFlow.hasPairingSession()
        }
    }

    /** Returns the currently-loaded credentials, or `null` before initialization. */
    public getCurrentCredentials(): WaAuthCredentials | null {
        return this.credentials
    }

    /**
     * Loads persisted credentials from the auth store, or generates a fresh
     * set when none exist. Must be called before connecting.
     */
    public async loadOrCreateCredentials(): Promise<WaAuthCredentials> {
        return this.runHandled(async () => {
            this.logger.debug('auth client loadOrCreateCredentials start')
            this.credentials = await loadOrCreateCredentials({
                logger: this.logger,
                authStore: this.authStore,
                signalStore: this.signalStore,
                preKeyStore: this.preKeyStore,
                skipSignedPreKeySignatureVerification:
                    this.options.dangerous?.disableSignedPreKeySignatureVerification
            })
            this.logger.info('auth client credentials ready', {
                registered:
                    this.credentials?.meJid !== null && this.credentials?.meJid !== undefined
            })
            return this.credentials
        })
    }

    /**
     * Builds a {@link WaCommsConfig} from the current credentials and the
     * runtime device/transport options – feeds {@link WaComms}.
     */
    public async buildCommsConfig(
        socketOptions: WaAuthSocketOptions,
        overrides: {
            readonly noiseTrustedRootCa?: WaNoiseRootCa
            readonly disableNoiseCertificateChainVerification?: boolean
        } = {}
    ): Promise<WaCommsConfig> {
        this.logger.trace('auth client building comms config')
        const override = this.versionOverride
        this.versionOverride = null
        return buildCommsConfig(this.logger, this.requireCredentials(), socketOptions, {
            deviceBrowser: this.options.deviceBrowser,
            deviceOsDisplayName: this.options.deviceOsDisplayName,
            requireFullSync: this.options.requireFullSync,
            version: override ?? this.options.version,
            mobileTransport: this.options.mobileTransport,
            noiseTrustedRootCa: overrides.noiseTrustedRootCa,
            disableNoiseCertificateChainVerification:
                overrides.disableNoiseCertificateChainVerification ??
                this.options.dangerous?.disableNoiseCertificateChainVerification
        })
    }

    /**
     * One-shot override for the next {@link buildCommsConfig} call: takes
     * precedence over the user-supplied `version` option, then clears. Used
     * by the `recoverFromClientTooOld` auto-retry to inject a fresh version
     * string fetched from `web.whatsapp.com` without mutating the user's
     * options.
     */
    public setNextConnectVersion(version: string): void {
        this.versionOverride = version
    }

    /** Clears the in-memory QR and pairing sessions without touching storage. */
    // eslint-disable-next-line @typescript-eslint/require-await
    public async clearTransientState(): Promise<void> {
        this.logger.trace('auth client clear transient state')
        this.qrFlow.clear()
        this.pairingFlow.clearSession()
    }

    /**
     * Wipes credentials from memory **and** from the auth store. Does
     * **not** touch the other store domains (signal, app-state, ...) -
     * those are cleared separately when {@link WaClient.logout} triggers
     * the server-side logout path, honoring `options.logoutStoreClear`.
     * Call this manually only when you want to force a re-pair without
     * going through the server logout IQ.
     */
    public async clearStoredCredentials(): Promise<void> {
        this.logger.warn('auth client clearing stored credentials')
        this.credentials = null
        await Promise.all([this.authStore.clear(), this.clearTransientState()])
    }

    /** Stores the server's noise static key for subsequent handshakes. */
    public async persistServerStaticKey(serverStaticKey: Uint8Array): Promise<void> {
        this.logger.debug('persisting server static key', {
            keyLength: serverStaticKey.byteLength
        })
        await this.patchCredentials((credentials) => ({
            ...credentials,
            serverStaticKey
        }))
    }

    /** Stores the "server holds prekeys" flag; persists only when the value changes. */
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

    /**
     * Stores the routing-info blob received from the server. Skips persistence
     * when the value matches the one already on disk.
     */
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

    /** Clears the persisted routing-info blob (used after a routing error). */
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

    /**
     * Persists the per-connection success attributes from the server (LID,
     * display name, companion key, last-success ts, props versions, ...). Only
     * persists when at least one attribute actually changed.
     */
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

    /**
     * Requests an 8-character pairing code for `phoneNumber` (link-code flow).
     * Pass `customCode` to suggest a specific code; the server still validates
     * and may return a different one.
     *
     * The client must already be connected – kick off `WaClient.connect()` in
     * parallel, wait for the `auth_pairing_required` event (or any QR), then
     * call this. The user then enters the returned code in WhatsApp on their
     * phone under *Linked Devices → Link with phone number instead*.
     *
     * @example
     * ```ts
     * // Start the handshake; do NOT await – connect() resolves only after pairing
     * void client.connect()
     *
     * // Wait until the pairing screen is ready on the server side
     * await new Promise<void>((resolve) => client.once('auth_pairing_required', () => resolve()))
     *
     * // Phone number in international format, digits only
     * const code = await client.auth.requestPairingCode('5511999999999')
     * console.log(`enter this on your phone: ${code.match(/.{1,4}/g)!.join('-')}`)
     *
     * // The `connect()` promise resolves after the user types the code:
     * await new Promise<void>((resolve) => client.once('auth_paired', () => resolve()))
     * ```
     */
    public async requestPairingCode(
        phoneNumber: string,
        shouldShowPushNotification = true,
        customCode?: string
    ): Promise<string> {
        this.requireConnected()
        this.requireCredentials()
        this.logger.debug('auth client requesting pairing code')
        return this.runHandled(() =>
            this.pairingFlow.requestPairingCode(phoneNumber, shouldShowPushNotification, customCode)
        )
    }

    /** Fetches the ISO country code the server resolved for the current account. */
    public async fetchPairingCountryCodeIso(): Promise<string> {
        this.requireConnected()
        this.requireCredentials()
        this.logger.trace('auth client fetching pairing country code ISO')
        return this.runHandled(() => this.pairingFlow.fetchPairingCountryCodeIso())
    }

    /** Dispatcher: returns `true` when `node` is a pairing-related IQ-set we handled. */
    public async handleIncomingIqSet(node: BinaryNode): Promise<boolean> {
        this.logger.trace('auth client handleIncomingIqSet', { id: node.attrs.id })
        return this.runHandled(() => this.pairingFlow.handleIncomingIqSet(node))
    }

    /** Dispatcher: returns `true` when `node` is a link-code companion notification. */
    public async handleLinkCodeNotification(node: BinaryNode): Promise<boolean> {
        this.logger.trace('auth client handleLinkCodeNotification', { id: node.attrs.id })
        return this.runHandled(() => this.pairingFlow.handleLinkCodeNotification(node))
    }

    /** Dispatcher: returns `true` when `node` is a companion-registration refresh notification. */
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
            registered: !!credentials?.meJid
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

    private requireConnected(): void {
        if (this.isConnected && !this.isConnected()) {
            throw new Error('client is not connected')
        }
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
