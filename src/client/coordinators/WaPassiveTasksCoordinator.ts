import type { WaAbPropName } from '@abprops-spec'
import type { WaAppStateSyncClient } from '@appstate/sync/WaAppStateSyncClient'
import type { WaAuthCredentials } from '@auth/types'
import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS, WA_IQ_TYPES } from '@protocol/constants'
import {
    SIGNAL_PQ_DEFAULT_MAX_KEYS_ON_SERVER,
    SIGNAL_SIGNED_PREKEY_ROTATION_INTERVAL_MS,
    SIGNAL_SIGNED_PREKEY_SERVER_ERROR_BACKOFF_MS,
    SIGNAL_UPLOAD_PREKEYS_COUNT
} from '@signal/api/constants'
import {
    buildKyberPreKeyAddIq,
    buildKyberPreKeySetIq,
    buildPreKeyUploadIq,
    parsePreKeyUploadFailure
} from '@signal/api/prekeys'
import type {
    SignalDigestPrefetchedLocalKeyBundle,
    SignalDigestSyncApi
} from '@signal/api/SignalDigestSyncApi'
import type { SignalRotateKeyApi } from '@signal/api/SignalRotateKeyApi'
import { SIGNAL_KYBER_PREKEY_ID_BORDER } from '@signal/constants'
import { generateKyberPreKey, generatePreKeyPair } from '@signal/registration/keygen'
import { SIGNAL_PQ_DISABLED, type SignalPqPolicy } from '@signal/session/pq-scope'
import type { KyberPreKeyRecord } from '@signal/types'
import {
    hasPqPreKeyStore,
    type WaPqPreKeyStore,
    type WaPreKeyStore
} from '@store/contracts/pre-key.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { buildPassiveModeIqNode } from '@transport/node/builders/passive'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

type WaPassiveTasksRuntime = {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>,
        options?: { readonly useSystemId?: boolean }
    ) => Promise<BinaryNode>
    readonly getCurrentCredentials: () => WaAuthCredentials | null
    readonly persistServerHasPreKeys: (serverHasPreKeys: boolean) => Promise<void>
    readonly sendNodeDirect: (node: BinaryNode) => Promise<void>
    readonly takeDanglingReceipts: () => readonly BinaryNode[]
    readonly requeueDanglingReceipt: (node: BinaryNode) => void
    readonly shouldQueueDanglingReceipt: (node: BinaryNode, error: Error) => boolean
    readonly syncAbProps: () => void
    /** Settles once the AB prop sync in flight (if any) has finished. */
    readonly waitForAbPropsSync: () => Promise<void>
    readonly getAbPropNumber: (name: WaAbPropName) => number
    /** Settles once queued offline stanzas have been delivered. */
    readonly waitForOfflineDeliveryEnd: () => Promise<void>
    readonly sendInitialPresence: () => Promise<void>
}

export class WaPassiveTasksCoordinator {
    private readonly logger: Logger
    private readonly signalStore: WaSignalStore
    private readonly preKeyStore: WaPreKeyStore
    private readonly signalDigestSync: SignalDigestSyncApi
    private readonly signalRotateKey: SignalRotateKeyApi
    private readonly signedPreKeyRotationIntervalMs: number
    private readonly signedPreKeyServerErrorBackoffMs: number
    private readonly runtime: WaPassiveTasksRuntime
    private readonly mobilePrimary: () => boolean
    private readonly appStateSync?: WaAppStateSyncClient
    private readonly pqPolicy: SignalPqPolicy
    private passiveTasksPromise: Promise<void> | null
    private pqUploadPromise: Promise<void> | null
    private preKeyUploadTail: Promise<void>
    private pqReplenishPromise: Promise<void> | null

    public constructor(options: {
        readonly logger: Logger
        readonly signalStore: WaSignalStore
        readonly preKeyStore: WaPreKeyStore
        readonly signalDigestSync: SignalDigestSyncApi
        readonly signalRotateKey: SignalRotateKeyApi
        readonly signedPreKeyRotationIntervalMs?: number
        readonly signedPreKeyServerErrorBackoffMs?: number
        readonly runtime: WaPassiveTasksRuntime
        /**
         * Resolved when passive tasks run (post-connect, after credentials
         * load) so a registered mobile-primary session reconnecting without an
         * explicit `mobileTransport` option still bootstraps the primary path.
         */
        readonly mobilePrimary?: () => boolean
        readonly appStateSync?: WaAppStateSyncClient
        readonly pqPolicy?: SignalPqPolicy
    }) {
        this.logger = options.logger
        this.signalStore = options.signalStore
        this.preKeyStore = options.preKeyStore
        this.signalDigestSync = options.signalDigestSync
        this.signalRotateKey = options.signalRotateKey
        this.signedPreKeyRotationIntervalMs =
            options.signedPreKeyRotationIntervalMs ?? SIGNAL_SIGNED_PREKEY_ROTATION_INTERVAL_MS
        this.signedPreKeyServerErrorBackoffMs =
            options.signedPreKeyServerErrorBackoffMs ?? SIGNAL_SIGNED_PREKEY_SERVER_ERROR_BACKOFF_MS
        this.runtime = options.runtime
        this.mobilePrimary = options.mobilePrimary ?? (() => false)
        this.appStateSync = options.appStateSync
        this.pqPolicy = options.pqPolicy ?? SIGNAL_PQ_DISABLED
        this.passiveTasksPromise = null
        this.pqUploadPromise = null
        this.pqReplenishPromise = null
        this.preKeyUploadTail = Promise.resolve()
    }

    /** The pre-key store when it implements the post-quantum methods, else `null`. */
    private get pqStore(): WaPqPreKeyStore | null {
        return hasPqPreKeyStore(this.preKeyStore) ? this.preKeyStore : null
    }

    public startPassiveTasksAfterConnect(): void {
        if (this.passiveTasksPromise) {
            this.logger.trace('passive connect tasks already running')
            return
        }
        this.passiveTasksPromise = this.runPassiveTasksAfterConnect()
            .catch((error) => {
                this.logger.warn('passive connect tasks failed', {
                    message: toError(error).message
                })
            })
            .finally(() => {
                this.passiveTasksPromise = null
            })
    }

    public async handlePreKeyLowNotification(): Promise<void> {
        await Promise.all([
            this.preKeyStore.setServerHasPreKeys(false),
            this.runtime.persistServerHasPreKeys(false)
        ])
        await this.uploadPreKeysIfMissing(false)
        await this.uploadPqPreKeys()
    }

    /** The server's post-quantum pool is low: top it up with one batch. */
    public async handlePqPreKeyLowNotification(): Promise<void> {
        await this.replenishPqPreKeys()
    }

    public async handleDigestNotification(): Promise<void> {
        await this.validateDigestAndRecoverPreKeys()
    }

    public resetInFlightState(): void {
        if (!this.passiveTasksPromise) {
            return
        }
        this.logger.trace('passive connect tasks reset requested while run is still in-flight')
    }

    private async runPassiveTasksAfterConnect(): Promise<void> {
        const credentials = this.runtime.getCurrentCredentials()
        const isRegistered = !!credentials?.meJid
        if (!isRegistered) {
            this.logger.trace('passive connect tasks skipped: session is not registered')
            return
        }

        this.runtime.syncAbProps()

        if (this.mobilePrimary() && this.appStateSync) {
            await this.appStateSync.ensureInitialSyncKey().catch((error) => {
                this.logger.warn('app-state initial key generation failed', {
                    message: toError(error).message
                })
            })
        }

        await this.runtime.sendInitialPresence().catch((error) => {
            this.logger.warn('initial presence send failed', {
                message: toError(error).message
            })
        })

        const [registrationInfo, signedPreKey, serverHasPreKeys, signedPreKeyRotationTs] =
            await Promise.all([
                this.signalStore.getRegistrationInfo(),
                this.signalStore.getSignedPreKey(),
                this.preKeyStore.getServerHasPreKeys(),
                this.signalStore.getSignedPreKeyRotationTs()
            ])
        const prefetchedLocalKeyBundle =
            registrationInfo && signedPreKey ? { registrationInfo, signedPreKey } : null
        await this.uploadPreKeysIfMissing(serverHasPreKeys, prefetchedLocalKeyBundle)
        await this.validateDigestAndRecoverPreKeys(prefetchedLocalKeyBundle)
        this.startPqUploadOnceAbPropsAreIn()
        await this.rotateSignedPreKeyIfDue(signedPreKeyRotationTs)
        await this.flushDanglingReceipts()
        await this.sendActiveModeIq()
    }

    private async sendActiveModeIq(): Promise<void> {
        try {
            await this.runtime.queryWithContext(
                'passive.active',
                buildPassiveModeIqNode('active'),
                WA_DEFAULTS.IQ_TIMEOUT_MS
            )
        } catch (error) {
            this.logger.warn('passive active iq failed', {
                message: toError(error).message
            })
        }
    }

    private async validateDigestAndRecoverPreKeys(
        prefetchedLocalKeyBundle?: SignalDigestPrefetchedLocalKeyBundle | null
    ): Promise<void> {
        try {
            const validation = prefetchedLocalKeyBundle
                ? await this.signalDigestSync.validateLocalKeyBundle(prefetchedLocalKeyBundle)
                : await this.signalDigestSync.validateLocalKeyBundle()
            if (validation.valid) {
                this.logger.debug('signal digest validated', {
                    preKeyCount: validation.preKeyCount
                })
                return
            }
            this.logger.warn('signal digest validation failed', {
                reason: validation.reason,
                shouldReupload: validation.shouldReupload,
                preKeyCount: validation.preKeyCount
            })
            if (!validation.shouldReupload) {
                return
            }

            await Promise.all([
                this.preKeyStore.setServerHasPreKeys(false),
                this.runtime.persistServerHasPreKeys(false)
            ])
            await this.uploadPreKeysIfMissing(false, prefetchedLocalKeyBundle)
        } catch (error) {
            this.logger.warn('signal digest validation failed with exception', {
                message: toError(error).message
            })
        }
    }

    /**
     * Full classic uploads and post-quantum SET/ADD calls run one at a time: a
     * classic upload drops the server's post-quantum keys, so a call that
     * interleaves would leave the migrated marker out of step with the server.
     */
    private runPreKeyUploadExclusive<T>(task: () => Promise<T>): Promise<T> {
        const run = this.preKeyUploadTail.then(task)
        this.preKeyUploadTail = run.then(
            () => undefined,
            () => undefined
        )
        return run
    }

    private uploadPreKeysIfMissing(
        serverHasPreKeysHint?: boolean,
        prefetchedLocalKeyBundle?: SignalDigestPrefetchedLocalKeyBundle | null
    ): Promise<void> {
        return this.runPreKeyUploadExclusive(() =>
            this.runClassicPreKeyUpload(serverHasPreKeysHint, prefetchedLocalKeyBundle)
        )
    }

    private async runClassicPreKeyUpload(
        serverHasPreKeysHint?: boolean,
        prefetchedLocalKeyBundle?: SignalDigestPrefetchedLocalKeyBundle | null
    ): Promise<void> {
        const serverHasPreKeys =
            serverHasPreKeysHint ?? (await this.preKeyStore.getServerHasPreKeys())
        if (serverHasPreKeys) {
            this.logger.trace('prekey upload skipped: server already has prekeys')
            return
        }

        const resolvedLocalKeyBundle =
            prefetchedLocalKeyBundle ?? (await this.resolveLocalKeyBundleFromStore())
        if (!resolvedLocalKeyBundle) {
            this.logger.warn('prekey upload skipped: registration info is missing')
            return
        }
        const { registrationInfo, signedPreKey } = resolvedLocalKeyBundle

        const preKeys = await this.preKeyStore.getOrGenPreKeys(
            SIGNAL_UPLOAD_PREKEYS_COUNT,
            generatePreKeyPair
        )
        if (preKeys.length === 0) {
            throw new Error('no prekey available for upload')
        }

        const lastPreKeyId = preKeys[preKeys.length - 1].keyId
        const uploadNode = buildPreKeyUploadIq(registrationInfo, signedPreKey, preKeys)
        // The server drops its post-quantum keys on a full upload, so the next run must redo them.
        if (this.pqStore) {
            await this.pqStore.setPqMigrated(false)
        }
        const response = await this.runtime.queryWithContext(
            'prekeys.upload',
            uploadNode,
            WA_DEFAULTS.IQ_TIMEOUT_MS,
            {
                count: preKeys.length,
                lastPreKeyId
            },
            this.mobilePrimary() ? { useSystemId: true } : undefined
        )
        if (response.attrs.type === WA_IQ_TYPES.RESULT) {
            // Mark uploaded key first so the serverHasPreKeys flag never commits ahead of local key progress.
            await this.preKeyStore.markKeyAsUploaded(lastPreKeyId)
            await Promise.all([
                this.preKeyStore.setServerHasPreKeys(true),
                this.runtime.persistServerHasPreKeys(true)
            ])
            this.logger.info('uploaded prekeys to server', {
                count: preKeys.length,
                lastPreKeyId
            })
            return
        }

        const failure = parsePreKeyUploadFailure(response)
        this.logger.warn('upload prekeys failed', {
            count: preKeys.length,
            lastPreKeyId,
            errorCode: failure.errorCode,
            errorText: failure.errorText
        })
    }

    /**
     * The server flags that switch the upload on arrive with the AB prop sync,
     * so the first upload waits for it. It runs beside the remaining passive
     * tasks, never holding them or the next connect's run back.
     */
    private startPqUploadOnceAbPropsAreIn(): void {
        void this.runtime
            .waitForAbPropsSync()
            .then(() => this.uploadPqPreKeys())
            .catch((error) => {
                this.logger.warn('pq prekey upload errored', { message: toError(error).message })
            })
    }

    /** Single-flight: a concurrent caller waits for the run already going. */
    private uploadPqPreKeys(): Promise<void> {
        const pqStore = this.pqStore
        if (!pqStore || !this.pqPolicy.isKeyUploadEnabled()) {
            return Promise.resolve()
        }
        this.pqUploadPromise ??= this.runPreKeyUploadExclusive(() =>
            this.runPqUpload(pqStore)
        ).finally(() => {
            this.pqUploadPromise = null
        })
        return this.pqUploadPromise
    }

    /**
     * First post-quantum upload: a last-resort key plus one batch of one-time
     * keys, then the rest of the pool in the background once offline delivery
     * is done. Keys are stored before the upload so a peer can use them the
     * moment the server hands them out. Never throws: a post-quantum failure
     * must not block the classic prekey path.
     */
    private async runPqUpload(pqStore: WaPqPreKeyStore): Promise<void> {
        try {
            if (await pqStore.getPqMigrated()) {
                this.logger.trace('pq prekey upload skipped: already migrated')
                return
            }
            const localKeyBundle = await this.resolveLocalKeyBundleFromStore()
            if (!localKeyBundle) {
                this.logger.warn('pq prekey upload skipped: registration info is missing')
                return
            }
            const identityPrivKey = localKeyBundle.registrationInfo.identityKeyPair.privKey
            const batchSize = Math.max(1, this.runtime.getAbPropNumber('pq_batch_upload_size'))
            const maxOnServer = this.resolvePqMaxKeysOnServer()
            const startId = await pqStore.reserveKyberPreKeyIds(maxOnServer + 1)
            const firstCount = Math.min(batchSize, maxOnServer)
            const lastResort = await generateKyberPreKey(
                (startId + maxOnServer) % SIGNAL_KYBER_PREKEY_ID_BORDER,
                identityPrivKey,
                true
            )
            const keys = await this.generateKyberPreKeys(startId, firstCount, identityPrivKey)
            const stored = [lastResort, ...keys]
            await pqStore.putKyberPreKeys(stored)
            let accepted: boolean
            try {
                accepted = await this.sendPqUpload(
                    'prekeys.upload.pq',
                    buildKyberPreKeySetIq(keys, lastResort),
                    keys.length
                )
            } catch (error) {
                this.logger.warn('pq prekey upload outcome unknown, keeping the stored keys', {
                    message: toError(error).message
                })
                return
            }
            if (!accepted) {
                await this.removeKyberPreKeysQuietly(pqStore, stored)
                return
            }
            await pqStore.setPqMigrated(true)
            this.logger.info('uploaded pq prekeys to server', { count: keys.length })
            const remaining = maxOnServer - firstCount
            if (remaining > 0) {
                this.pqReplenishPromise ??= this.addPqPreKeysInBatches(
                    pqStore,
                    (startId + firstCount) % SIGNAL_KYBER_PREKEY_ID_BORDER,
                    batchSize,
                    remaining,
                    identityPrivKey
                ).finally(() => {
                    this.pqReplenishPromise = null
                })
            }
        } catch (error) {
            this.logger.warn('pq prekey upload errored', { message: toError(error).message })
        }
    }

    /** Fills the rest of the server pool, one batch per IQ, after the offline queue drains. */
    private async addPqPreKeysInBatches(
        pqStore: WaPqPreKeyStore,
        firstId: number,
        batchSize: number,
        total: number,
        identityPrivKey: Uint8Array
    ): Promise<void> {
        try {
            await this.runtime.waitForOfflineDeliveryEnd()
            let added = 0
            for (let offset = 0; offset < total; offset += batchSize) {
                const count = Math.min(batchSize, total - offset)
                const keys = await this.generateKyberPreKeys(
                    (firstId + offset) % SIGNAL_KYBER_PREKEY_ID_BORDER,
                    count,
                    identityPrivKey
                )
                const uploaded = await this.runPreKeyUploadExclusive(async () =>
                    (await pqStore.getPqMigrated()) ? this.addStoredPqPreKeys(pqStore, keys) : false
                )
                if (!uploaded) {
                    break
                }
                added += keys.length
            }
            if (added < total) {
                this.logger.warn('pq prekey pool incomplete', { added, total })
            }
        } catch (error) {
            this.logger.warn('pq prekey batch upload errored', { message: toError(error).message })
        }
    }

    /** One batch for a post-quantum low-pool notification; a no-op before the first upload. */
    private replenishPqPreKeys(): Promise<void> {
        const pqStore = this.pqStore
        if (!pqStore || !this.pqPolicy.isKeyUploadEnabled()) {
            return Promise.resolve()
        }
        this.pqReplenishPromise ??= this.runPreKeyUploadExclusive(() =>
            this.runPqReplenish(pqStore)
        ).finally(() => {
            this.pqReplenishPromise = null
        })
        return this.pqReplenishPromise
    }

    private async runPqReplenish(pqStore: WaPqPreKeyStore): Promise<void> {
        try {
            if (!(await pqStore.getPqMigrated())) {
                this.logger.debug('pq prekey replenish skipped: not migrated')
                return
            }
            const localKeyBundle = await this.resolveLocalKeyBundleFromStore()
            if (!localKeyBundle) {
                return
            }
            const batchSize = Math.max(1, this.runtime.getAbPropNumber('pq_batch_upload_size'))
            const startId = await pqStore.reserveKyberPreKeyIds(batchSize)
            const keys = await this.generateKyberPreKeys(
                startId,
                batchSize,
                localKeyBundle.registrationInfo.identityKeyPair.privKey
            )
            await this.addStoredPqPreKeys(pqStore, keys)
        } catch (error) {
            this.logger.warn('pq prekey replenish errored', { message: toError(error).message })
        }
    }

    /** Stores `keys`, uploads them with an ADD, and rolls the store back when the server refuses. */
    private async addStoredPqPreKeys(
        pqStore: WaPqPreKeyStore,
        keys: readonly KyberPreKeyRecord[]
    ): Promise<boolean> {
        await pqStore.putKyberPreKeys(keys)
        try {
            const accepted = await this.sendPqUpload(
                'prekeys.add.pq',
                buildKyberPreKeyAddIq(keys),
                keys.length
            )
            if (!accepted) {
                await this.removeKyberPreKeysQuietly(pqStore, keys)
            }
            return accepted
        } catch (error) {
            this.logger.warn('pq prekey add outcome unknown, keeping the stored keys', {
                message: toError(error).message
            })
            return false
        }
    }

    /** `true` on an accepted IQ, `false` on a refusal; a transport failure throws. */
    private async sendPqUpload(context: string, node: BinaryNode, count: number): Promise<boolean> {
        const response = await this.runtime.queryWithContext(
            context,
            node,
            WA_DEFAULTS.IQ_TIMEOUT_MS,
            { count },
            this.mobilePrimary() ? { useSystemId: true } : undefined
        )
        if (response.attrs.type === WA_IQ_TYPES.RESULT) {
            return true
        }
        const failure = parsePreKeyUploadFailure(response)
        this.logger.warn('pq prekey upload refused', {
            context,
            count,
            errorCode: failure.errorCode,
            errorText: failure.errorText
        })
        return false
    }

    private async generateKyberPreKeys(
        startId: number,
        count: number,
        identityPrivKey: Uint8Array
    ): Promise<KyberPreKeyRecord[]> {
        const keys = new Array<KyberPreKeyRecord>(count)
        for (let index = 0; index < count; index += 1) {
            keys[index] = await generateKyberPreKey(
                (startId + index) % SIGNAL_KYBER_PREKEY_ID_BORDER,
                identityPrivKey
            )
        }
        return keys
    }

    private resolvePqMaxKeysOnServer(): number {
        const configured = this.runtime.getAbPropNumber('pq_max_keys_on_server')
        if (!Number.isFinite(configured)) {
            return SIGNAL_PQ_DEFAULT_MAX_KEYS_ON_SERVER
        }
        return Math.min(Math.max(1, configured), SIGNAL_KYBER_PREKEY_ID_BORDER - 1)
    }

    private async removeKyberPreKeysQuietly(
        pqStore: WaPqPreKeyStore,
        keys: readonly KyberPreKeyRecord[]
    ): Promise<void> {
        try {
            await pqStore.removeKyberPreKeys(keys.map((key) => key.keyId))
        } catch (error) {
            this.logger.warn('failed to remove rejected pq prekeys', {
                message: toError(error).message
            })
        }
    }

    private async rotateSignedPreKeyIfDue(
        signedPreKeyRotationTsHint?: number | null
    ): Promise<void> {
        try {
            const nowMs = Date.now()
            const lastRotationTs =
                signedPreKeyRotationTsHint === undefined
                    ? await this.signalStore.getSignedPreKeyRotationTs()
                    : signedPreKeyRotationTsHint
            if (lastRotationTs === null) {
                await this.signalStore.setSignedPreKeyRotationTs(nowMs)
                this.logger.trace('signal rotate key skipped on first run')
                return
            }

            const elapsedMs = nowMs - lastRotationTs
            if (elapsedMs < this.signedPreKeyRotationIntervalMs) {
                this.logger.trace('signal rotate key skipped: interval not reached', {
                    remainingMs: this.signedPreKeyRotationIntervalMs - elapsedMs
                })
                return
            }

            const result = await this.signalRotateKey.rotateSignedPreKey()
            const nextRotationTs = this.resolveRotationTimestamp(nowMs, result.errorCode)
            await this.signalStore.setSignedPreKeyRotationTs(nextRotationTs)

            if (result.shouldDigestKey) {
                await this.validateDigestAndRecoverPreKeys()
            }
        } catch (error) {
            this.logger.warn('signal rotate key failed', {
                message: toError(error).message
            })
        }
    }

    private async resolveLocalKeyBundleFromStore(): Promise<SignalDigestPrefetchedLocalKeyBundle | null> {
        const [registrationInfo, signedPreKey] = await Promise.all([
            this.signalStore.getRegistrationInfo(),
            this.signalStore.getSignedPreKey()
        ])
        if (!registrationInfo || !signedPreKey) {
            return null
        }
        return { registrationInfo, signedPreKey }
    }

    private resolveRotationTimestamp(nowMs: number, errorCode: number | undefined): number {
        if (errorCode !== undefined && errorCode >= 500) {
            const retryInMs = Math.min(
                this.signedPreKeyServerErrorBackoffMs,
                this.signedPreKeyRotationIntervalMs
            )
            this.logger.warn('signal rotate key scheduled with server error backoff', {
                errorCode,
                retryInMs
            })
            return nowMs - this.signedPreKeyRotationIntervalMs + retryInMs
        }
        return nowMs
    }

    private async flushDanglingReceipts(): Promise<void> {
        const pending = this.runtime.takeDanglingReceipts()
        if (pending.length === 0) {
            return
        }

        this.logger.info('flushing dangling receipts', { count: pending.length })

        let cursor = 0
        while (cursor < pending.length) {
            const batchEnd = Math.min(cursor + 4, pending.length)
            const promises: Promise<void>[] = []
            for (let i = cursor; i < batchEnd; i += 1) {
                promises.push(this.runtime.sendNodeDirect(pending[i]))
            }
            const results = await Promise.allSettled(promises)

            let transientCount = 0
            for (let i = 0; i < results.length; i += 1) {
                const result = results[i]
                if (result.status === 'fulfilled') {
                    continue
                }
                const node = pending[cursor + i]
                const normalized = toError(result.reason)
                if (this.runtime.shouldQueueDanglingReceipt(node, normalized)) {
                    this.runtime.requeueDanglingReceipt(node)
                    transientCount += 1
                } else {
                    this.logger.warn('dropping dangling receipt due non-retryable send error', {
                        id: node.attrs.id,
                        to: node.attrs.to,
                        message: normalized.message
                    })
                }
            }

            if (transientCount > 0) {
                for (let i = batchEnd; i < pending.length; i += 1) {
                    this.runtime.requeueDanglingReceipt(pending[i])
                }
                this.logger.warn('stopped dangling receipt flush due transient send error', {
                    remaining: transientCount + (pending.length - batchEnd)
                })
                return
            }

            cursor = batchEnd
        }

        this.logger.info('dangling receipts flushed')
    }
}
