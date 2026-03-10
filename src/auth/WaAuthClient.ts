import type { WaAppStateStoreData } from '../appstate/types'
import type { Logger } from '../infra/log/types'
import type { BinaryNode } from '../transport/types'
import { uint8Equal } from '../util/bytes'
import { toError } from '../util/errors'

import { DEFAULT_DEVICE_PLATFORM } from './client.constants'
import type {
    WaAuthClientCallbacks,
    WaAuthClientDependencies,
    WaAuthClientOptions,
    WaAuthSocketOptions
} from './client.types'
import { WaAuthCredentialsFlow } from './flow/WaAuthCredentialsFlow'
import { WaPairingFlow } from './pairing/WaPairingFlow'
import { WaQrFlow } from './pairing/WaQrFlow'
import { WaAuthStateStore } from './store/WaAuthStateStore'
import type {
    WaAuthCredentials,
    WaAuthState,
    WaSuccessPersistAttributes
} from './types'

export class WaAuthClient {
    private readonly options: Readonly<WaAuthClientOptions>
    private readonly logger: Logger
    private readonly callbacks: WaAuthClientCallbacks
    private readonly authStore: WaAuthStateStore
    private readonly credentialsFlow: WaAuthCredentialsFlow
    private readonly qrFlow: WaQrFlow
    private readonly pairingFlow: WaPairingFlow
    private credentials: WaAuthCredentials | null

    public constructor(options: WaAuthClientOptions, deps: WaAuthClientDependencies) {
        this.options = Object.freeze({
            ...options,
            devicePlatform: options.devicePlatform ?? DEFAULT_DEVICE_PLATFORM
        })
        this.logger = deps.logger
        this.callbacks = deps.callbacks ?? {}
        this.authStore = new WaAuthStateStore(this.options.authPath)
        this.credentialsFlow = new WaAuthCredentialsFlow({
            logger: this.logger,
            authStore: this.authStore,
            signalStore: deps.signalStore,
            x25519: deps.x25519,
            advSignature: deps.advSignature
        })
        this.credentials = null

        this.qrFlow = new WaQrFlow({
            logger: this.logger,
            getCredentials: () => this.credentials,
            getDevicePlatform: () => this.getDevicePlatform(),
            emitQr: (qr, ttlMs) => this.callbacks.onQr?.(qr, ttlMs)
        })
        const pairingAuth = {
            getCredentials: () => this.credentials,
            updateCredentials: async (credentials: WaAuthCredentials) =>
                this.updateCredentials(credentials),
            getDevicePlatform: () => this.getDevicePlatform()
        }
        const pairingQr = {
            setRefs: (refs: readonly string[]) => this.qrFlow.setRefs(refs),
            clear: () => this.qrFlow.clear(),
            refresh: () => this.qrFlow.refreshCurrentQr()
        }
        this.pairingFlow = new WaPairingFlow({
            logger: this.logger,
            pairingCrypto: deps.pairingCrypto,
            advSignature: deps.advSignature,
            auth: pairingAuth,
            socket: deps.socket,
            qr: pairingQr,
            callbacks: {
                emitPairingCode: (code) => this.callbacks.onPairingCode?.(code),
                emitPairingRefresh: (forceManual) =>
                    this.callbacks.onPairingRefresh?.(forceManual),
                emitPaired: (credentials) =>
                    this.callbacks.onPaired?.(this.authStore.clone(credentials))
            }
        })
    }

    public getState(connected = false): Readonly<WaAuthState> {
        return {
            connected,
            registered: this.credentials?.meJid !== null && this.credentials?.meJid !== undefined,
            hasQr: this.qrFlow.hasQr(),
            hasPairingCode: this.pairingFlow.hasPairingSession()
        }
    }

    public getCredentials(): WaAuthCredentials | null {
        if (!this.credentials) {
            return null
        }
        return this.authStore.clone(this.credentials)
    }

    public getCurrentCredentials(): WaAuthCredentials | null {
        return this.credentials
    }

    public async loadOrCreateCredentials(): Promise<WaAuthCredentials> {
        try {
            this.logger.debug('auth client loadOrCreateCredentials start')
            this.credentials = await this.credentialsFlow.loadOrCreateCredentials()
            this.logger.info('auth client credentials ready', {
                registered: this.credentials.meJid !== null && this.credentials.meJid !== undefined
            })
            return this.credentials
        } catch (error) {
            this.handleError(toError(error))
            throw error
        }
    }

    public buildCommsConfig(socketOptions: WaAuthSocketOptions) {
        this.logger.trace('auth client building comms config')
        return this.credentialsFlow.buildCommsConfig(this.requireCredentials(), socketOptions)
    }

    public async clearTransientState(): Promise<void> {
        this.logger.trace('auth client clear transient state')
        this.qrFlow.clear()
        this.pairingFlow.clearSession()
    }

    public async clearStoredCredentials(): Promise<void> {
        this.logger.warn('auth client clearing stored credentials')
        await this.authStore.clear()
        this.credentials = null
        await this.clearTransientState()
    }

    public async persistServerStaticKey(serverStaticKey: Uint8Array): Promise<void> {
        this.logger.debug('persisting server static key', {
            keyLength: serverStaticKey.byteLength
        })
        const credentials = this.requireCredentials()
        await this.updateCredentials({
            ...credentials,
            serverStaticKey
        })
    }

    public async persistServerHasPreKeys(serverHasPreKeys: boolean): Promise<void> {
        const credentials = this.requireCredentials()
        if (credentials.serverHasPreKeys === serverHasPreKeys) {
            return
        }
        this.logger.debug('persisting serverHasPreKeys', {
            serverHasPreKeys
        })
        await this.updateCredentials({
            ...credentials,
            serverHasPreKeys
        })
    }

    public async persistRoutingInfo(routingInfo: Uint8Array): Promise<void> {
        this.logger.trace('persisting routing info', {
            byteLength: routingInfo.byteLength
        })
        const credentials = this.requireCredentials()
        if (credentials.routingInfo && uint8Equal(credentials.routingInfo, routingInfo)) {
            this.logger.trace('routing info unchanged, skipping persistence')
            return
        }
        await this.updateCredentials({
            ...credentials,
            routingInfo
        })
    }

    public async clearRoutingInfo(): Promise<WaAuthCredentials> {
        const credentials = this.requireCredentials()
        if (!credentials.routingInfo) {
            return credentials
        }
        this.logger.warn('clearing persisted routing info')
        const nextCredentials: WaAuthCredentials = {
            ...credentials,
            routingInfo: undefined
        }
        await this.updateCredentials(nextCredentials)
        return nextCredentials
    }

    public async persistAppState(appState: WaAppStateStoreData): Promise<void> {
        this.logger.debug('persisting app-state snapshot', {
            keys: appState.keys.length
        })
        const credentials = this.requireCredentials()
        await this.updateCredentials({
            ...credentials,
            appState
        })
    }

    public async persistMeLid(meLid: string): Promise<void> {
        await this.persistSuccessAttributes({
            meLid
        })
    }

    public async persistSuccessAttributes(attributes: WaSuccessPersistAttributes): Promise<void> {
        const credentials = this.requireCredentials()
        const nextMeLid = attributes.meLid ?? credentials.meLid
        const nextMeDisplayName = attributes.meDisplayName ?? credentials.meDisplayName
        const nextCompanionEncStatic =
            attributes.companionEncStatic ?? credentials.companionEncStatic
        const nextLastSuccessTs = attributes.lastSuccessTs ?? credentials.lastSuccessTs
        const nextPropsVersion = attributes.propsVersion ?? credentials.propsVersion
        const nextAbPropsVersion = attributes.abPropsVersion ?? credentials.abPropsVersion
        const nextConnectionLocation =
            attributes.connectionLocation ?? credentials.connectionLocation
        const nextAccountCreationTs = attributes.accountCreationTs ?? credentials.accountCreationTs
        const lidChanged = nextMeLid !== credentials.meLid
        const displayNameChanged = nextMeDisplayName !== credentials.meDisplayName
        const companionChanged =
            (credentials.companionEncStatic === undefined) !== (nextCompanionEncStatic === undefined) ||
            (credentials.companionEncStatic !== undefined &&
                nextCompanionEncStatic !== undefined &&
                !uint8Equal(credentials.companionEncStatic, nextCompanionEncStatic))
        const lastSuccessTsChanged = nextLastSuccessTs !== credentials.lastSuccessTs
        const propsVersionChanged = nextPropsVersion !== credentials.propsVersion
        const abPropsVersionChanged = nextAbPropsVersion !== credentials.abPropsVersion
        const connectionLocationChanged = nextConnectionLocation !== credentials.connectionLocation
        const accountCreationTsChanged = nextAccountCreationTs !== credentials.accountCreationTs
        if (
            !lidChanged &&
            !displayNameChanged &&
            !companionChanged &&
            !lastSuccessTsChanged &&
            !propsVersionChanged &&
            !abPropsVersionChanged &&
            !connectionLocationChanged &&
            !accountCreationTsChanged
        ) {
            return
        }

        this.logger.debug('persisting success attributes', {
            lidChanged,
            displayNameChanged,
            companionChanged,
            lastSuccessTsChanged,
            propsVersionChanged,
            abPropsVersionChanged,
            connectionLocationChanged,
            accountCreationTsChanged
        })
        await this.updateCredentials({
            ...credentials,
            meLid: nextMeLid,
            meDisplayName: nextMeDisplayName,
            companionEncStatic: nextCompanionEncStatic,
            lastSuccessTs: nextLastSuccessTs,
            propsVersion: nextPropsVersion,
            abPropsVersion: nextAbPropsVersion,
            connectionLocation: nextConnectionLocation,
            accountCreationTs: nextAccountCreationTs
        })
    }

    public async requestPairingCode(
        phoneNumber: string,
        shouldShowPushNotification = false
    ): Promise<string> {
        try {
            this.requireCredentials()
            this.logger.info('auth client requesting pairing code')
            return this.pairingFlow.requestPairingCode(phoneNumber, shouldShowPushNotification)
        } catch (error) {
            this.handleError(toError(error))
            throw error
        }
    }

    public async fetchPairingCountryCodeIso(): Promise<string> {
        try {
            this.requireCredentials()
            this.logger.trace('auth client fetching pairing country code ISO')
            return this.pairingFlow.fetchPairingCountryCodeIso()
        } catch (error) {
            this.handleError(toError(error))
            throw error
        }
    }

    public async handleIncomingIqSet(node: BinaryNode): Promise<boolean> {
        try {
            this.logger.trace('auth client handleIncomingIqSet', { id: node.attrs.id })
            return this.pairingFlow.handleIncomingIqSet(node)
        } catch (error) {
            this.handleError(toError(error))
            throw error
        }
    }

    public async handleLinkCodeNotification(node: BinaryNode): Promise<boolean> {
        try {
            this.logger.trace('auth client handleLinkCodeNotification', { id: node.attrs.id })
            return this.pairingFlow.handleLinkCodeNotification(node)
        } catch (error) {
            this.handleError(toError(error))
            throw error
        }
    }

    public async handleCompanionRegRefreshNotification(node: BinaryNode): Promise<boolean> {
        try {
            this.logger.trace('auth client handleCompanionRegRefreshNotification', {
                id: node.attrs.id
            })
            return this.pairingFlow.handleCompanionRegRefreshNotification(node)
        } catch (error) {
            this.handleError(toError(error))
            throw error
        }
    }

    private getDevicePlatform(): string {
        return this.options.devicePlatform ?? DEFAULT_DEVICE_PLATFORM
    }

    private async updateCredentials(credentials: WaAuthCredentials): Promise<void> {
        this.logger.trace('auth client update credentials', {
            registered: credentials.meJid !== null && credentials.meJid !== undefined
        })
        this.credentials = credentials
        await this.credentialsFlow.persistCredentials(credentials)
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
