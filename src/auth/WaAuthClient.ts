import type { WaAppStateStoreData } from '../appstate/types'
import type { Logger } from '../infra/log/types'
import { WA_DEFAULTS } from '../protocol/constants'
import type { WaSignalStore } from '../signal/store/WaSignalStore'
import type { BinaryNode } from '../transport/types'
import { uint8Equal } from '../util/bytes'
import { toError } from '../util/primitives'

import {
    buildCommsConfig,
    loadOrCreateCredentials,
    persistCredentials
} from './flow/WaAuthCredentialsFlow'
import { WaPairingFlow } from './pairing/WaPairingFlow'
import { WaQrFlow } from './pairing/WaQrFlow'
import { WaAuthStateStore } from './store/WaAuthStateStore'
import type {
    WaAuthClientOptions,
    WaAuthCredentials,
    WaAuthSocketOptions,
    WaSuccessPersistAttributes
} from './types'

interface CredentialsPatchOptions {
    readonly shouldPersist?: (current: WaAuthCredentials, next: WaAuthCredentials) => boolean
    readonly onPersist?: (current: WaAuthCredentials, next: WaAuthCredentials) => void
}

interface WaAuthClientCallbacks {
    readonly onQr?: (qr: string, ttlMs: number) => void
    readonly onPairingCode?: (code: string) => void
    readonly onPairingRefresh?: (forceManual: boolean) => void
    readonly onPaired?: (credentials: WaAuthCredentials) => void
    readonly onError?: (error: Error) => void
}

interface WaAuthClientDependencies {
    readonly logger: Logger
    readonly signalStore: WaSignalStore
    readonly socket: {
        readonly sendNode: (node: BinaryNode) => Promise<void>
        readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
    }
    readonly callbacks?: WaAuthClientCallbacks
}

export class WaAuthClient {
    private readonly options: Readonly<WaAuthClientOptions>
    private readonly logger: Logger
    private readonly callbacks: WaAuthClientCallbacks
    private readonly authStore: WaAuthStateStore
    private readonly signalStore: WaSignalStore
    private readonly qrFlow: WaQrFlow
    private readonly pairingFlow: WaPairingFlow
    private credentials: WaAuthCredentials | null

    public constructor(options: WaAuthClientOptions, deps: WaAuthClientDependencies) {
        this.options = Object.freeze({
            ...options,
            devicePlatform: options.devicePlatform ?? WA_DEFAULTS.DEVICE_PLATFORM
        })
        this.logger = deps.logger
        this.callbacks = deps.callbacks ?? {}
        this.authStore = new WaAuthStateStore(this.options.authPath)
        this.signalStore = deps.signalStore
        this.credentials = null

        this.qrFlow = new WaQrFlow({
            logger: this.logger,
            getCredentials: () => this.credentials,
            getDevicePlatform: () => this.getDevicePlatform(),
            emitQr: (qr, ttlMs) => this.callbacks.onQr?.(qr, ttlMs)
        })
        this.pairingFlow = new WaPairingFlow({
            logger: this.logger,
            getCredentials: () => this.credentials,
            updateCredentials: async (credentials) => this.updateCredentials(credentials),
            sendNode: deps.socket.sendNode,
            query: async (node, timeoutMs) => deps.socket.query(node, timeoutMs),
            setQrRefs: (refs) => this.qrFlow.setRefs(refs),
            clearQr: () => this.qrFlow.clear(),
            refreshQr: () => this.qrFlow.refreshCurrentQr(),
            getDevicePlatform: () => this.getDevicePlatform(),
            emitPairingCode: (code) => this.callbacks.onPairingCode?.(code),
            emitPairingRefresh: (forceManual) => this.callbacks.onPairingRefresh?.(forceManual),
            emitPaired: (credentials) =>
                this.callbacks.onPaired?.(this.authStore.clone(credentials))
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

    public getCredentials(): WaAuthCredentials | null {
        return this.credentials ? this.authStore.clone(this.credentials) : null
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
                signalStore: this.signalStore
            })
            this.logger.info('auth client credentials ready', {
                registered: this.credentials.meJid !== null && this.credentials.meJid !== undefined
            })
            return this.credentials
        })
    }

    public buildCommsConfig(socketOptions: WaAuthSocketOptions) {
        this.logger.trace('auth client building comms config')
        return buildCommsConfig(this.logger, this.requireCredentials(), socketOptions)
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

    public async persistAppState(appState: WaAppStateStoreData): Promise<void> {
        this.logger.debug('persisting app-state snapshot', {
            keys: appState.keys.length
        })
        await this.patchCredentials((credentials) => ({
            ...credentials,
            appState
        }))
    }

    public async persistMeLid(meLid: string): Promise<void> {
        await this.persistSuccessAttributes({
            meLid
        })
    }

    public async persistSuccessAttributes(attributes: WaSuccessPersistAttributes): Promise<void> {
        let changes: Record<string, boolean> = {}
        await this.patchCredentials(
            (credentials) => {
                const nextMeLid = attributes.meLid ?? credentials.meLid
                const nextMeDisplayName = attributes.meDisplayName ?? credentials.meDisplayName
                const nextCompanionEncStatic =
                    attributes.companionEncStatic ?? credentials.companionEncStatic
                const nextLastSuccessTs = attributes.lastSuccessTs ?? credentials.lastSuccessTs
                const nextPropsVersion = attributes.propsVersion ?? credentials.propsVersion
                const nextAbPropsVersion = attributes.abPropsVersion ?? credentials.abPropsVersion
                const nextConnectionLocation =
                    attributes.connectionLocation ?? credentials.connectionLocation
                const nextAccountCreationTs =
                    attributes.accountCreationTs ?? credentials.accountCreationTs
                changes = {
                    lidChanged: nextMeLid !== credentials.meLid,
                    displayNameChanged: nextMeDisplayName !== credentials.meDisplayName,
                    companionChanged:
                        (credentials.companionEncStatic === undefined) !==
                            (nextCompanionEncStatic === undefined) ||
                        (credentials.companionEncStatic !== undefined &&
                            nextCompanionEncStatic !== undefined &&
                            !uint8Equal(credentials.companionEncStatic, nextCompanionEncStatic)),
                    lastSuccessTsChanged: nextLastSuccessTs !== credentials.lastSuccessTs,
                    propsVersionChanged: nextPropsVersion !== credentials.propsVersion,
                    abPropsVersionChanged: nextAbPropsVersion !== credentials.abPropsVersion,
                    connectionLocationChanged:
                        nextConnectionLocation !== credentials.connectionLocation,
                    accountCreationTsChanged:
                        nextAccountCreationTs !== credentials.accountCreationTs
                }
                return {
                    ...credentials,
                    meLid: nextMeLid,
                    meDisplayName: nextMeDisplayName,
                    companionEncStatic: nextCompanionEncStatic,
                    lastSuccessTs: nextLastSuccessTs,
                    propsVersion: nextPropsVersion,
                    abPropsVersion: nextAbPropsVersion,
                    connectionLocation: nextConnectionLocation,
                    accountCreationTs: nextAccountCreationTs
                }
            },
            {
                shouldPersist: () => Object.values(changes).some(Boolean),
                onPersist: () => {
                    this.logger.debug('persisting success attributes', changes)
                }
            }
        )
    }

    public async requestPairingCode(
        phoneNumber: string,
        shouldShowPushNotification = false
    ): Promise<string> {
        return this.runHandled(async () => {
            this.requireCredentials()
            this.logger.info('auth client requesting pairing code')
            return this.pairingFlow.requestPairingCode(phoneNumber, shouldShowPushNotification)
        })
    }

    public async fetchPairingCountryCodeIso(): Promise<string> {
        return this.runHandled(async () => {
            this.requireCredentials()
            this.logger.trace('auth client fetching pairing country code ISO')
            return this.pairingFlow.fetchPairingCountryCodeIso()
        })
    }

    public async handleIncomingIqSet(node: BinaryNode): Promise<boolean> {
        return this.runHandled(async () => {
            this.logger.trace('auth client handleIncomingIqSet', { id: node.attrs.id })
            return this.pairingFlow.handleIncomingIqSet(node)
        })
    }

    public async handleLinkCodeNotification(node: BinaryNode): Promise<boolean> {
        return this.runHandled(async () => {
            this.logger.trace('auth client handleLinkCodeNotification', { id: node.attrs.id })
            return this.pairingFlow.handleLinkCodeNotification(node)
        })
    }

    public async handleCompanionRegRefreshNotification(node: BinaryNode): Promise<boolean> {
        return this.runHandled(async () => {
            this.logger.trace('auth client handleCompanionRegRefreshNotification', {
                id: node.attrs.id
            })
            return this.pairingFlow.handleCompanionRegRefreshNotification(node)
        })
    }

    private getDevicePlatform(): string {
        return this.options.devicePlatform ?? WA_DEFAULTS.DEVICE_PLATFORM
    }

    private async patchCredentials(
        buildNext: (current: WaAuthCredentials) => WaAuthCredentials,
        options: CredentialsPatchOptions = {}
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
            registered: credentials.meJid !== null && credentials.meJid !== undefined
        })
        this.credentials = credentials
        await persistCredentials(
            {
                logger: this.logger,
                authStore: this.authStore,
                signalStore: this.signalStore
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
