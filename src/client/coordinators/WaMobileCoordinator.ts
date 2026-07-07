import {
    buildSignedCompanionIdentity,
    buildSignedKeyIndexList,
    completePrimaryHandshake,
    derivePemKey,
    parseCompanionQr,
    preparePrimaryHello
} from '@auth/pairing/companion-host'
import {
    buildHistorySyncBootstrapMessage,
    type PhoneNumberToLidMapping
} from '@client/messaging/companion-host'
import type {
    CompanionHostEpochState,
    CompanionHostPersistence,
    CompanionRecord
} from '@client/persistence/companion-host'
import type { WaClientPluginContext } from '@client/plugins/types'
import type { WaClientEventMap } from '@client/types'
import type { WaClientDependencies } from '@client/WaClientFactory'
import { randomIntAsync, toRawPubKey } from '@crypto'
import type { Logger } from '@infra/log/types'
import { parseSignalAddressFromJid } from '@protocol/jid'
import { WA_NODE_TAGS } from '@protocol/nodes'
import {
    assertIqResult,
    type BinaryNode,
    findNodeChild,
    getFirstNodeChild,
    getNodeChildren,
    getNodeTextContent
} from '@transport'
import {
    buildKeyIndexListPublishIq,
    buildPairDeviceIq,
    buildPrimaryHelloIq,
    buildRemoveAllCompanionDevicesIq,
    buildRemoveCompanionDeviceIq,
    type ClientPairingProps
} from '@transport/node/builders/mobile'
import { delay } from '@util/async'
import { toError } from '@util/primitives'

const PAIR_DEVICE_TIMEOUT_MS = 32_000
const KEY_INDEX_TIMEOUT_MS = 32_000
const REMOVE_DEVICE_TIMEOUT_MS = 32_000
const PRIMARY_HELLO_TIMEOUT_MS = 120_000
const LINK_CODE_FINISH_TIMEOUT_MS = 120_000
const PEM_TTL_SECONDS = 5 * 24 * 60 * 60
const COMPANION_PROVISION_ATTEMPTS = 8
const COMPANION_PROVISION_RETRY_MS = 1500

interface CompanionFinishData {
    readonly companionIdentityPub: Uint8Array
    readonly wrappedKeyBundle: Uint8Array
}

interface CompleteLinkInput {
    readonly ref: string
    readonly companionIdentityPublicKey: Uint8Array
    readonly companionNoisePublicKey: Uint8Array
    readonly advSecretKey: Uint8Array
    readonly platform: string
}

type WaMobileEmit = <K extends keyof WaClientEventMap>(
    event: K,
    ...args: Parameters<WaClientEventMap[K]>
) => void

/** Result of a successful {@link WaMobileCoordinator.linkCompanion}. */
export interface LinkCompanionResult {
    readonly deviceJid: string
    readonly keyIndex: number
}

/** Dependencies for {@link WaMobileCoordinator}, injected by the client factory. */
export interface WaMobileCoordinatorDeps {
    readonly logger: Logger
    readonly authClient: WaClientDependencies['authClient']
    readonly messageDispatch: WaClientDependencies['messageDispatch']
    readonly chatCoordinator: WaClientDependencies['chatCoordinator']
    readonly deviceSync: WaClientDependencies['signalDeviceSync']
    readonly appStateStore: WaClientPluginContext['stores']['appState']
    readonly queryWithContext: WaClientPluginContext['queryWithContext']
    readonly emitEvent: WaMobileEmit
    readonly registerIncomingHandler: WaClientPluginContext['registerIncomingHandler']
    readonly isMobilePrimary: () => boolean
    readonly persistence?: CompanionHostPersistence
    readonly includePem?: boolean
}

/**
 * Hosts companion devices from a mobile-primary session: signs a companion's
 * device identity, uploads `pair-device`, tracks the linked set, and can revoke
 * a device. Exposed at `client.mobile`; requires a registered primary session.
 * Supports the QR ({@link linkCompanion}) and pairing-code
 * ({@link linkCompanionByCode}) flows.
 */
export class WaMobileCoordinator {
    private readonly authClient: WaMobileCoordinatorDeps['authClient']
    private readonly messageDispatch: WaMobileCoordinatorDeps['messageDispatch']
    private readonly chatCoordinator: WaMobileCoordinatorDeps['chatCoordinator']
    private readonly deviceSync: WaMobileCoordinatorDeps['deviceSync']
    private readonly appStateStore: WaMobileCoordinatorDeps['appStateStore']
    private readonly queryWithContext: WaMobileCoordinatorDeps['queryWithContext']
    private readonly emitEvent: WaMobileEmit
    private readonly isMobilePrimary: () => boolean
    private readonly logger: Logger
    private readonly persistence?: CompanionHostPersistence
    private readonly includePem: boolean
    private epoch: CompanionHostEpochState | null = null
    private pendingCompanionHello: {
        readonly ref: string
        readonly wrappedCompanionEphemeralPub: Uint8Array
        readonly companionServerAuthKeyPub: Uint8Array
    } | null = null
    private pendingFinish: {
        readonly ref: string
        readonly resolve: (data: CompanionFinishData) => void
    } | null = null
    private accountKeyIndexes: ReadonlySet<number> = new Set([0])
    private pushNameSeeded = false

    constructor(deps: WaMobileCoordinatorDeps) {
        this.authClient = deps.authClient
        this.messageDispatch = deps.messageDispatch
        this.chatCoordinator = deps.chatCoordinator
        this.deviceSync = deps.deviceSync
        this.appStateStore = deps.appStateStore
        this.queryWithContext = deps.queryWithContext
        this.emitEvent = deps.emitEvent
        this.isMobilePrimary = deps.isMobilePrimary
        this.logger = deps.logger.child({ scope: 'mobile' })
        this.persistence = deps.persistence
        this.includePem = deps.includePem ?? false
        deps.registerIncomingHandler({
            tag: WA_NODE_TAGS.NOTIFICATION,
            prepend: true,
            handler: (node) => this.handleNotification(node)
        })
    }

    /**
     * Links the companion from its pairing QR: signs the device identity, uploads
     * `pair-device`, and returns the server-assigned device jid.
     *
     * @throws when there is no primary session or the server rejects the upload
     * (e.g. the linked-device cap is reached).
     */
    async linkCompanion(qr: string): Promise<LinkCompanionResult> {
        try {
            const parsed = parseCompanionQr(qr)
            return await this.completeLink({
                ref: parsed.ref,
                companionIdentityPublicKey: parsed.identityPublicKey,
                companionNoisePublicKey: parsed.noisePublicKey,
                advSecretKey: parsed.advSecretKey,
                platform: parsed.platform
            })
        } catch (error) {
            const normalized = toError(error)
            this.logger.warn('companion link failed', { message: normalized.message })
            this.emitEvent('companion_host_error', normalized)
            throw normalized
        }
    }

    /**
     * Links a companion via its 8-character pairing code (the "link with phone
     * number" flow). The companion must have requested a code for this account
     * first (its `companion_hello` is recorded); this drives `primary_hello`,
     * awaits `companion_finish`, and completes the same `pair-device` upload as
     * the QR path.
     *
     * @throws when there is no primary session, no companion is pending, the code
     * is wrong, or the handshake times out.
     */
    async linkCompanionByCode(pairingCode: string): Promise<LinkCompanionResult> {
        try {
            const accountIdentityKeyPair = this.requirePrimaryIdentityKeyPair()
            const hello = this.pendingCompanionHello
            if (!hello) {
                throw new Error(
                    'no pending companion; a companion must request a pairing code for this account first'
                )
            }
            const prepared = await preparePrimaryHello({
                pairingCode: pairingCode.replace(/[^0-9A-Za-z]/g, '').toUpperCase(),
                wrappedCompanionEphemeralPub: hello.wrappedCompanionEphemeralPub
            })
            let finishTimeout: ReturnType<typeof setTimeout> | undefined
            const finishPromise = new Promise<CompanionFinishData>((resolve, reject) => {
                this.pendingFinish = { ref: hello.ref, resolve }
                finishTimeout = setTimeout(() => {
                    if (this.pendingFinish?.ref === hello.ref) {
                        this.pendingFinish = null
                        reject(new Error('link-code companion_finish timed out'))
                    }
                }, LINK_CODE_FINISH_TIMEOUT_MS)
            })
            finishPromise.catch(() => undefined)
            let finish: CompanionFinishData
            try {
                const helloResult = await this.queryWithContext(
                    'companion-host.primary-hello',
                    buildPrimaryHelloIq({
                        ref: hello.ref,
                        wrappedPrimaryEphemeralPub: prepared.wrappedPrimaryEphemeralPub,
                        primaryIdentityPub: toRawPubKey(accountIdentityKeyPair.pubKey)
                    }),
                    PRIMARY_HELLO_TIMEOUT_MS
                )
                assertIqResult(helloResult, 'companion-host.primary-hello')
                finish = await finishPromise
            } finally {
                clearTimeout(finishTimeout)
                if (this.pendingFinish?.ref === hello.ref) {
                    this.pendingFinish = null
                }
            }
            const advSecretKey = await completePrimaryHandshake({
                sharedEphemeral: prepared.sharedEphemeral,
                wrappedKeyBundle: finish.wrappedKeyBundle,
                companionIdentityPub: finish.companionIdentityPub,
                primaryIdentityKeyPair: accountIdentityKeyPair
            })
            this.pendingCompanionHello = null
            return await this.completeLink({
                ref: hello.ref,
                companionIdentityPublicKey: toRawPubKey(finish.companionIdentityPub),
                companionNoisePublicKey: hello.companionServerAuthKeyPub,
                advSecretKey,
                platform: 'link-code'
            })
        } catch (error) {
            const normalized = toError(error)
            this.logger.warn('companion link-by-code failed', { message: normalized.message })
            this.emitEvent('companion_host_error', normalized)
            throw normalized
        }
    }

    /** Re-signs and republishes the key-index list for the current device set. */
    async publishKeyIndexList(): Promise<void> {
        const accountIdentityKeyPair = this.requirePrimaryIdentityKeyPair()
        const epoch = await this.ensureEpoch()
        const timestampSeconds = Math.floor(Date.now() / 1000)
        const validIndexes = this.validKeyIndexes(epoch)
        const currentIndex = validIndexes[validIndexes.length - 1]
        const keyIndexListBytes = await buildSignedKeyIndexList({
            accountIdentityKeyPair,
            rawId: epoch.rawId,
            currentIndex,
            timestampSeconds,
            validIndexes
        })
        const iq = buildKeyIndexListPublishIq({ keyIndexListBytes, timestampSeconds })
        const result = await this.queryWithContext(
            'companion-host.key-index-list',
            iq,
            KEY_INDEX_TIMEOUT_MS
        )
        assertIqResult(result, 'companion-host.key-index-list')
        this.logger.debug('key-index list published', { currentIndex, validIndexes })
    }

    /**
     * Unlinks a companion this primary linked: sends the `remove-companion-device`
     * IQ, drops it from the tracked set, and republishes the key-index list for
     * the reduced device set.
     *
     * @throws when there is no registered primary session, the companion is not
     * tracked, or the server rejects the removal.
     */
    async revokeCompanion(companionDeviceJid: string, reason = 'user_initiated'): Promise<void> {
        this.requirePrimaryIdentityKeyPair()
        const epoch = await this.ensureEpoch()
        if (!epoch.companions.some((companion) => companion.deviceJid === companionDeviceJid)) {
            throw new Error(`companion ${companionDeviceJid} is not tracked by this primary`)
        }
        const result = await this.queryWithContext(
            'companion-host.remove-device',
            buildRemoveCompanionDeviceIq({ deviceJid: companionDeviceJid, reason }),
            REMOVE_DEVICE_TIMEOUT_MS
        )
        assertIqResult(result, 'companion-host.remove-device')
        this.epoch = {
            rawId: epoch.rawId,
            currentKeyIndex: epoch.currentKeyIndex,
            companions: epoch.companions.filter(
                (companion) => companion.deviceJid !== companionDeviceJid
            )
        }
        this.forgetAccountKeyIndex(parseSignalAddressFromJid(companionDeviceJid).device)
        await this.persist(this.epoch)
        await this.publishKeyIndexList().catch((error) => {
            this.logger.warn('key-index list republish failed after companion revoke', {
                deviceJid: companionDeviceJid,
                message: toError(error).message
            })
        })
        this.logger.info('companion revoked', { deviceJid: companionDeviceJid, reason })
        this.emitEvent('companion_host_revoked', { deviceJid: companionDeviceJid })
    }

    /**
     * Unlinks EVERY companion from the account in a single `remove-companion-device`
     * `all="true"` stanza (the phone's "log out all companion devices"), clears the
     * tracked set, and republishes the key-index list for the primary alone.
     * `excludeHostedCompanion` spares companions this account itself hosts.
     *
     * @throws when there is no registered primary session or the server rejects
     * the removal.
     */
    async revokeAllCompanions(
        reason = 'user_initiated',
        options: { readonly excludeHostedCompanion?: boolean } = {}
    ): Promise<void> {
        this.requirePrimaryIdentityKeyPair()
        const epoch = await this.ensureEpoch()
        const result = await this.queryWithContext(
            'companion-host.remove-all-devices',
            buildRemoveAllCompanionDevicesIq({
                reason,
                excludeHostedCompanion: options.excludeHostedCompanion
            }),
            REMOVE_DEVICE_TIMEOUT_MS
        )
        assertIqResult(result, 'companion-host.remove-all-devices')
        if (options.excludeHostedCompanion) {
            this.logger.info('revoked non-hosted companions; hosted set kept', {
                kept: epoch.companions.length,
                reason
            })
            return
        }
        const removed = epoch.companions.map((companion) => companion.deviceJid)
        this.epoch = { rawId: epoch.rawId, currentKeyIndex: epoch.currentKeyIndex, companions: [] }
        this.accountKeyIndexes = new Set([0])
        await this.persist(this.epoch)
        await this.publishKeyIndexList().catch((error) => {
            this.logger.warn('key-index list republish failed after revoke-all', {
                message: toError(error).message
            })
        })
        this.logger.info('all companions revoked', { count: removed.length, reason })
        for (const deviceJid of removed) {
            this.emitEvent('companion_host_revoked', { deviceJid })
        }
    }

    /** Returns the companions this primary has linked in the current epoch. */
    async listCompanions(): Promise<readonly CompanionRecord[]> {
        const epoch = await this.ensureEpoch()
        return epoch.companions
    }

    /**
     * Reconciles the tracked companion set against the account's live device list
     * on the server (`usync`). Drops companions the server no longer lists - one
     * the user unlinked, or one that self-removed while the primary was offline -
     * then persists and emits `companion_host_revoked` for each. Runs on connect
     * and on `account_sync`; safe to call manually. A no-op (no server query, no
     * epoch created) when no companions are tracked. Returns the removed jids.
     */
    async reconcileCompanions(): Promise<readonly string[]> {
        if (!this.isMobilePrimary()) {
            return []
        }
        const meJid = this.authClient.getCurrentCredentials()?.meJid
        if (!meJid) {
            return []
        }
        const epoch = this.epoch ?? (this.persistence ? await this.persistence.load() : null)
        if (!epoch || epoch.companions.length === 0) {
            return []
        }
        this.epoch = epoch
        const [synced] = await this.deviceSync.syncDeviceList([meJid])
        const serverJids = synced?.deviceJids
        if (!serverJids || serverJids.length === 0) {
            return []
        }
        return this.pruneCompanionsToDevices(
            epoch,
            new Set(serverJids.map((jid) => parseSignalAddressFromJid(jid).device))
        )
    }

    /**
     * Prunes tracked companions to those whose device slot is still in
     * `serverDeviceIndexes`, persisting + emitting `companion_host_revoked` for
     * each drop. Shared by the connect-time (`usync`) and `account_sync` paths.
     */
    private async pruneCompanionsToDevices(
        epoch: CompanionHostEpochState,
        serverDeviceIndexes: ReadonlySet<number>
    ): Promise<readonly string[]> {
        const kept = epoch.companions.filter((companion) =>
            serverDeviceIndexes.has(parseSignalAddressFromJid(companion.deviceJid).device)
        )
        if (kept.length === epoch.companions.length) {
            return []
        }
        const removed = epoch.companions
            .filter(
                (companion) =>
                    !serverDeviceIndexes.has(parseSignalAddressFromJid(companion.deviceJid).device)
            )
            .map((companion) => companion.deviceJid)
        this.epoch = {
            rawId: epoch.rawId,
            currentKeyIndex: epoch.currentKeyIndex,
            companions: kept
        }
        await this.persist(this.epoch)
        this.logger.info('reconciled companions with server device list', {
            kept: kept.length,
            removed: removed.length
        })
        for (const deviceJid of removed) {
            this.emitEvent('companion_host_revoked', { deviceJid })
        }
        return removed
    }

    /**
     * Reconciles from an `account_sync` notification's `<devices>` payload - the
     * fresh, authoritative device set - so a companion the user just unlinked is
     * pruned immediately (no `usync` round-trip, which would read a stale cache).
     */
    private async reconcileFromAccountSync(node: BinaryNode): Promise<void> {
        if (!this.isMobilePrimary()) {
            return
        }
        const devices = findNodeChild(node, WA_NODE_TAGS.DEVICES)
        if (!devices) {
            return
        }
        const epoch = this.epoch ?? (this.persistence ? await this.persistence.load() : null)
        if (!epoch || epoch.companions.length === 0) {
            return
        }
        this.epoch = epoch
        const serverDeviceIndexes = new Set<number>([0])
        for (const child of getNodeChildren(devices)) {
            if (child.tag !== WA_NODE_TAGS.DEVICE) {
                continue
            }
            const jid = child.attrs.jid
            if (jid) {
                serverDeviceIndexes.add(parseSignalAddressFromJid(jid).device)
            }
        }
        await this.pruneCompanionsToDevices(epoch, serverDeviceIndexes)
    }

    /**
     * Shares the primary's active app-state sync key with a linked companion via
     * an `APP_STATE_SYNC_KEY_SHARE` peer message so it can decrypt app-state.
     * Establishes the outbound Signal session on demand, so call it once the
     * companion is online (prekeys uploaded), not at link time.
     *
     * @throws when there is no primary session or no active sync key.
     */
    async shareAppStateSyncKeys(companionDeviceJid: string): Promise<void> {
        this.requirePrimaryIdentityKeyPair()
        const activeKey = await this.appStateStore.getActiveSyncKey()
        if (!activeKey) {
            throw new Error(
                'no active app-state sync key to share; the primary session is not initialized'
            )
        }
        await this.messageDispatch.sendAppStateSyncKeyShare(companionDeviceJid, [activeKey])
        this.logger.info('shared app-state sync key with companion', {
            deviceJid: companionDeviceJid
        })
    }

    /**
     * Pushes the `INITIAL_BOOTSTRAP` history sync to a linked companion as a
     * `HISTORY_SYNC_NOTIFICATION` peer message. Flips the companion's
     * `initialChatHistory` bootstrap flag; without it the companion self-removes
     * with `HistorySyncTimeout`. Requires the companion online with prekeys.
     *
     * @throws when there is no registered primary session.
     */
    async sendHistorySyncBootstrap(
        companionDeviceJid: string,
        options: { readonly phoneNumberToLidMappings?: readonly PhoneNumberToLidMapping[] } = {}
    ): Promise<void> {
        this.requirePrimaryIdentityKeyPair()
        const { message, payloadBytes } = await buildHistorySyncBootstrapMessage({
            phoneNumberToLidMappings: options.phoneNumberToLidMappings
        })
        await this.messageDispatch.publishProtocolMessageToDevice(companionDeviceJid, message)
        this.logger.info('companion-host history sync bootstrap sent', {
            deviceJid: companionDeviceJid,
            mappings: options.phoneNumberToLidMappings?.length ?? 0,
            payloadBytes
        })
    }

    /**
     * `ClientPairingProps` for the `<client-props>` pair-device element. A
     * LID-native primary declares the chat DB LID-migrated + pure-LID session so
     * the companion runs `setIsLidMigrated` at pair time and does not self-remove
     * on its LID-addressed blocklist.
     */
    private buildClientPairingProps(): ClientPairingProps {
        const meLid = this.authClient.getCurrentCredentials()?.meLid
        const lidNative = typeof meLid === 'string' && meLid.length > 0
        return {
            isChatDbLidMigrated: lidNative,
            isSyncdPureLidSession: lidNative,
            isSyncdSnapshotRecoveryEnabled: false
        }
    }

    /**
     * Seeds the primary's own `setting_pushName` into the `critical_block`
     * app-state collection, once per session. The companion's critical bootstrap
     * completes only when it finds an applied `SettingPushName` action; without
     * one it self-removes with `syncd_timeout`. Falls back to the account phone
     * number when no push name is set. Idempotent and best-effort.
     */
    private async ensureAccountPushNameAppState(): Promise<void> {
        if (this.pushNameSeeded) {
            return
        }
        const credentials = this.authClient.getCurrentCredentials()
        const meJidUser = credentials?.meJid?.split('@')[0]?.split(':')[0]
        const name = credentials?.pushName?.trim() || meJidUser
        if (!name) {
            throw new Error('cannot seed setting_pushName: primary has no pushName or meJid')
        }
        await this.chatCoordinator.set({ schema: 'SettingPushName', name })
        this.pushNameSeeded = true
        this.logger.info('seeded primary setting_pushName into critical_block app-state', {
            name
        })
    }

    private async completeLink(input: CompleteLinkInput): Promise<LinkCompanionResult> {
        const accountIdentityKeyPair = this.requirePrimaryIdentityKeyPair()
        await this.ensureAccountPushNameAppState().catch((error) => {
            this.logger.warn('failed to seed primary setting_pushName app-state', {
                message: toError(error).message
            })
        })
        const epoch = await this.ensureEpoch()
        const keyIndex = this.nextKeyIndex(epoch)
        const validIndexes = [...this.validKeyIndexes(epoch), keyIndex].sort((a, b) => a - b)
        const timestampSeconds = Math.floor(Date.now() / 1000)
        const record: CompanionRecord = {
            deviceJid: '',
            keyIndex,
            companionIdentityPublicKey: input.companionIdentityPublicKey,
            addedAtSeconds: timestampSeconds
        }
        const signed = await buildSignedCompanionIdentity({
            accountIdentityKeyPair,
            companionIdentityPublicKey: input.companionIdentityPublicKey,
            advSecretKey: input.advSecretKey,
            rawId: epoch.rawId,
            keyIndex,
            timestampSeconds,
            validIndexes
        })
        const iq = buildPairDeviceIq({
            ref: input.ref,
            companionNoisePublicKey: input.companionNoisePublicKey,
            deviceIdentityBytes: signed.deviceIdentityBytes,
            keyIndexListBytes: signed.keyIndexListBytes,
            keyIndexListTimestampSeconds: timestampSeconds,
            clientProps: this.buildClientPairingProps(),
            pem: this.includePem
                ? {
                      aesGcmKeyBytes: derivePemKey(
                          input.advSecretKey,
                          input.companionNoisePublicKey
                      ),
                      ttlSeconds: PEM_TTL_SECONDS
                  }
                : undefined
        })
        this.logger.info('linking companion', { platform: input.platform, keyIndex })
        const result = await this.queryWithContext(
            'companion-host.pair-device',
            iq,
            PAIR_DEVICE_TIMEOUT_MS
        )
        assertIqResult(result, 'companion-host.pair-device')
        const wrapper = getFirstNodeChild(result)
        const deviceNode =
            findNodeChild(result, WA_NODE_TAGS.DEVICE) ??
            (wrapper ? findNodeChild(wrapper, WA_NODE_TAGS.DEVICE) : undefined)
        const deviceJid = deviceNode?.attrs.jid
        if (!deviceJid) {
            throw new Error('pair-device result missing <device jid>')
        }
        this.epoch = {
            rawId: epoch.rawId,
            currentKeyIndex: keyIndex,
            companions: [...epoch.companions, { ...record, deviceJid }]
        }
        await this.persist(this.epoch)
        const linked: LinkCompanionResult = { deviceJid, keyIndex }
        this.logger.info('companion linked', { deviceJid, keyIndex })
        this.emitEvent('companion_host_linked', linked)
        this.provisionLinkedCompanion(deviceJid)
        return linked
    }

    /**
     * Best-effort background provisioning after a companion links: pushes the
     * history-sync bootstrap and shares the app-state sync key. Fire-and-forget
     * and retried, because the companion needs a moment to upload prekeys before
     * the outbound Signal session these peer messages ride on can be established.
     */
    private provisionLinkedCompanion(deviceJid: string): void {
        void this.provisionLinkedCompanionWithRetry(deviceJid).catch((error) => {
            const normalized = toError(error)
            this.logger.warn('companion provisioning failed', {
                deviceJid,
                message: normalized.message
            })
            this.emitEvent('companion_host_error', normalized)
        })
    }

    private async provisionLinkedCompanionWithRetry(deviceJid: string): Promise<void> {
        let lastError: unknown
        for (let attempt = 1; attempt <= COMPANION_PROVISION_ATTEMPTS; attempt += 1) {
            if (attempt > 1) {
                await delay(COMPANION_PROVISION_RETRY_MS)
            }
            try {
                await this.sendHistorySyncBootstrap(deviceJid)
                await this.shareAppStateSyncKeys(deviceJid).catch((error) => {
                    this.logger.debug('companion app-state key share (best-effort) failed', {
                        deviceJid,
                        message: toError(error).message
                    })
                })
                this.logger.info('companion provisioned', { deviceJid, attempts: attempt })
                return
            } catch (error) {
                lastError = error
                this.logger.debug('companion provisioning attempt failed', {
                    deviceJid,
                    attempt,
                    message: toError(error).message
                })
            }
        }
        throw toError(lastError)
    }

    private handleNotification(node: BinaryNode): Promise<boolean> {
        if (node.attrs.type === 'account_sync') {
            this.updateAccountKeyIndexes(node)
            void this.reconcileFromAccountSync(node).catch((error) => {
                this.logger.debug('companion reconcile on account_sync failed', {
                    message: toError(error).message
                })
            })
            return Promise.resolve(false)
        }
        const linkCode = findNodeChild(node, WA_NODE_TAGS.LINK_CODE_COMPANION_REG)
        if (linkCode) {
            const stage = linkCode.attrs.stage
            if (stage === 'companion_hello') {
                this.storeCompanionHello(linkCode)
            } else if (stage === 'companion_finish') {
                this.resolveCompanionFinish(linkCode)
            }
        }
        return Promise.resolve(false)
    }

    /**
     * Tracks the account's live device key-indexes from an `account_sync`
     * notification so a new companion gets a non-colliding key index and the
     * published key-index list keeps every existing device valid.
     */
    private updateAccountKeyIndexes(node: BinaryNode): void {
        const devices = findNodeChild(node, WA_NODE_TAGS.DEVICES)
        if (!devices) {
            return
        }
        const indexes = new Set<number>([0])
        for (const child of getNodeChildren(devices)) {
            if (child.tag !== WA_NODE_TAGS.DEVICE) {
                continue
            }
            const rawIndex = child.attrs['key-index']
            const parsed = rawIndex ? Number.parseInt(rawIndex, 10) : Number.NaN
            if (Number.isInteger(parsed) && parsed >= 0) {
                indexes.add(parsed)
            }
        }
        this.accountKeyIndexes = indexes
        this.logger.debug('account device key-indexes updated', { indexes: [...indexes] })
    }

    private forgetAccountKeyIndex(index: number): void {
        if (!this.accountKeyIndexes.has(index)) {
            return
        }
        const next = new Set(this.accountKeyIndexes)
        next.delete(index)
        this.accountKeyIndexes = next
    }

    /**
     * The key indexes currently valid for this account - index 0 (the primary),
     * the account's own live devices, and every tracked companion. Sorted
     * ascending. Deliberately excludes `epoch.currentKeyIndex`, which is an
     * allocation high-water mark, not proof a device still exists: after revoking
     * the last-linked companion its index must drop out of the published list.
     */
    private validKeyIndexes(epoch: CompanionHostEpochState): number[] {
        const indexes = new Set<number>([0, ...this.accountKeyIndexes])
        for (const companion of epoch.companions) {
            indexes.add(companion.keyIndex)
        }
        return [...indexes].sort((a, b) => a - b)
    }

    /**
     * Allocates the next companion key index, advancing strictly past both the
     * epoch's monotonic high-water mark and every currently-valid index so a
     * revoked index is never reused (reuse breaks previously linked devices).
     */
    private nextKeyIndex(epoch: CompanionHostEpochState): number {
        return Math.max(epoch.currentKeyIndex, ...this.validKeyIndexes(epoch)) + 1
    }

    private storeCompanionHello(linkCode: BinaryNode): void {
        const ref = getNodeTextContent(findNodeChild(linkCode, WA_NODE_TAGS.LINK_CODE_PAIRING_REF))
        const wrapped = this.nodeBytes(
            linkCode,
            WA_NODE_TAGS.LINK_CODE_PAIRING_WRAPPED_COMPANION_EPHEMERAL_PUB
        )
        const authKey = this.nodeBytes(linkCode, WA_NODE_TAGS.COMPANION_SERVER_AUTH_KEY_PUB)
        if (!ref || !wrapped || !authKey) {
            return
        }
        this.pendingCompanionHello = {
            ref,
            wrappedCompanionEphemeralPub: wrapped,
            companionServerAuthKeyPub: authKey
        }
        this.logger.debug('recorded link-code companion_hello', { ref })
    }

    private resolveCompanionFinish(linkCode: BinaryNode): void {
        const ref = getNodeTextContent(findNodeChild(linkCode, WA_NODE_TAGS.LINK_CODE_PAIRING_REF))
        const wrappedKeyBundle = this.nodeBytes(
            linkCode,
            WA_NODE_TAGS.LINK_CODE_PAIRING_WRAPPED_KEY_BUNDLE
        )
        const companionIdentityPub = this.nodeBytes(
            linkCode,
            WA_NODE_TAGS.COMPANION_IDENTITY_PUBLIC
        )
        if (ref && wrappedKeyBundle && companionIdentityPub && this.pendingFinish?.ref === ref) {
            this.pendingFinish.resolve({ companionIdentityPub, wrappedKeyBundle })
            this.pendingFinish = null
        }
    }

    private nodeBytes(parent: BinaryNode, tag: string): Uint8Array | null {
        const content = findNodeChild(parent, tag)?.content
        return content instanceof Uint8Array ? content : null
    }

    private requirePrimaryIdentityKeyPair() {
        if (!this.isMobilePrimary()) {
            throw new Error(
                'client.mobile requires a mobile-primary session (connect via mobileTransport / a registered phone identity)'
            )
        }
        const credentials = this.authClient.getCurrentCredentials()
        if (!credentials?.meJid) {
            throw new Error('companion-host requires a registered primary session (no meJid)')
        }
        return credentials.registrationInfo.identityKeyPair
    }

    private async ensureEpoch(): Promise<CompanionHostEpochState> {
        if (this.epoch) {
            return this.epoch
        }
        const loaded = this.persistence ? await this.persistence.load() : null
        if (loaded) {
            this.epoch = loaded
            return loaded
        }
        this.epoch = { rawId: await this.generateRawId(), currentKeyIndex: 0, companions: [] }
        await this.persist(this.epoch)
        return this.epoch
    }

    private async generateRawId(): Promise<number> {
        return randomIntAsync(1, 0x7fff_ffff)
    }

    private async persist(state: CompanionHostEpochState): Promise<void> {
        if (this.persistence) {
            await this.persistence.save(state)
        }
    }
}
