import { type WaFakeConnectionPipeline } from '../infra/WaFakeConnectionPipeline'
import {
    buildServerSyncNotification,
    type BuildServerSyncNotificationInput,
    type FakeAppStateCollectionPayload
} from '../protocol/iq/appstate-sync'
import { FakeAppStateCrypto } from '../protocol/signal/fake-app-state-crypto'
import { type BinaryNode } from '../transport/codec'
import { proto, type Proto } from '../transport/protos'


export interface CapturedAppStateMutation {
    /** Collection name parsed from the inbound `<collection>`. */
    readonly collection: string
    /** `set` or `remove`. */
    readonly operation: 'set' | 'remove'
    /** Decoded mutation index (e.g. `JSON.stringify(['mute', '5511...@s.whatsapp.net'])`). */
    readonly index: string
    /** First parsed segment of the JSON-encoded index (e.g. `'mute'`). */
    readonly action: string | undefined
    /** Per-mutation `version` field embedded inside the `SyncActionData`. */
    readonly version: number
    /** Decoded `SyncActionValue` carrying the actual action payload. */
    readonly value: Proto.ISyncActionValue | null
    /** Patch version the lib advanced to. */
    readonly patchVersion: number
}

function toHex(bytes: Uint8Array): string {
    let out = ''
    for (let index = 0; index < bytes.byteLength; index += 1) {
        const value = bytes[index]
        out += value < 16 ? `0${value.toString(16)}` : value.toString(16)
    }
    return out
}

export class AppStateSyncManager {
    /**
     * Per-collection payload providers. The auto-registered IQ handler
     * consults this map for each requested collection: if a provider is
     * registered, it produces a `<patches>`/`<snapshot>` payload that
     * advances the lib's collection state. Missing collections fall back
     * to the empty-success response.
     */
    public readonly appStateCollectionProviders = new Map<
        string,
        () => Promise<FakeAppStateCollectionPayload | null> | FakeAppStateCollectionPayload | null
    >()
    /**
     * Sync keys (`keyIdHex` → `keyData`) the fake server knows about.
     * Tests register a key here when they want the fake server to
     * decrypt outbound mutation patches the lib uploads. The keyId is
     * normalized to lowercase hex.
     */
    public readonly appStateSyncKeysByKeyId = new Map<string, Uint8Array>()
    public readonly appStateCrypto = new FakeAppStateCrypto()
    /**
     * Listeners notified for every mutation the lib uploads inside an
     * `<iq xmlns=w:sync:app:state>` patch. Tests register a listener
     * (typically scoped to a specific collection or chat jid) and
     * resolve a promise when the matching mutation arrives.
     */
    public readonly outboundMutationListeners = new Set<
        (mutation: CapturedAppStateMutation) => void
    >()

    /**
     * Registers an app-state sync key (the same `keyId`/`keyData` the
     * test ships to the lib via `FakePeer.sendAppStateSyncKeyShare`)
     * so the fake server can decrypt outbound mutations the lib uploads
     * inside `<iq xmlns=w:sync:app:state>` patches. Without a registered
     * key the patch is silently echoed back as success and the
     * mutation contents are inaccessible to the test.
     */
    public registerAppStateSyncKey(keyId: Uint8Array, keyData: Uint8Array): void {
        this.appStateSyncKeysByKeyId.set(toHex(keyId), keyData)
    }

    /**
     * Subscribes to outbound app-state mutations the lib uploads. The
     * listener fires once per decrypted `SyncdMutation` inside any
     * inbound app-state sync IQ. Returns an unsubscribe function.
     */
    public onOutboundAppStateMutation(
        listener: (mutation: CapturedAppStateMutation) => void
    ): () => void {
        this.outboundMutationListeners.add(listener)
        return () => {
            this.outboundMutationListeners.delete(listener)
        }
    }

    /**
     * Convenience that resolves with the next decrypted outbound
     * mutation matching the given predicate. Rejects after `timeoutMs`.
     */
    public expectAppStateMutation(
        predicate: (mutation: CapturedAppStateMutation) => boolean,
        timeoutMs = 15_000
    ): Promise<CapturedAppStateMutation> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                unsubscribe()
                reject(new Error(`expectAppStateMutation timed out after ${timeoutMs}ms`))
            }, timeoutMs)
            const unsubscribe = this.onOutboundAppStateMutation((mutation) => {
                if (!predicate(mutation)) return
                clearTimeout(timer)
                unsubscribe()
                resolve(mutation)
            })
        })
    }

    /**
     * Registers a payload provider for a given app-state collection.
     * The provider is invoked once per inbound app-state sync IQ that
     * names the collection, and the returned payload is shipped inside
     * the `<sync><collection>` response. Returning `null` falls back to
     * the empty-success default.
     *
     * Used by tests that ship real encrypted snapshots/patches: the
     * provider typically wraps a `FakeAppStateCollection` and returns
     * its `encodeSnapshot()` (first round) then `encodePendingPatch()`
     * (subsequent rounds with queued mutations).
     *
     * Returns an unsubscribe function that clears the provider.
     */
    public provideAppStateCollection(
        name: string,
        provider: () => Promise<FakeAppStateCollectionPayload | null> | FakeAppStateCollectionPayload | null
    ): () => void {
        this.appStateCollectionProviders.set(name, provider)
        return () => {
            this.appStateCollectionProviders.delete(name)
        }
    }

    /**
     * Pushes a `<notification type="server_sync"/>` listing the given
     * collection names. The lib's incoming notification handler reacts
     * by triggering an `appStateSync.sync()` round, which the
     * auto-registered `app-state-sync` IQ handler answers via the
     * registered providers (or empty success if none are registered).
     *
     * Resolves once the notification has been written to the wire.
     */
    public async pushServerSyncNotification(
        pipeline: WaFakeConnectionPipeline,
        input: BuildServerSyncNotificationInput
    ): Promise<void> {
        await pipeline.sendStanza(buildServerSyncNotification(input))
    }

    public async consumeOutboundAppStatePatches(iq: BinaryNode): Promise<void> {
        if (!Array.isArray(iq.content)) return
        const sync = iq.content.find((child) => child.tag === 'sync')
        if (!sync || !Array.isArray(sync.content)) return
        for (const collectionNode of sync.content) {
            if (collectionNode.tag !== 'collection') continue
            if (!Array.isArray(collectionNode.content)) continue
            const collectionName = collectionNode.attrs.name
            if (!collectionName) continue
            for (const patchNode of collectionNode.content) {
                if (patchNode.tag !== 'patch') continue
                const patchBytes = patchNode.content
                if (!(patchBytes instanceof Uint8Array)) continue
                try {
                    const decoded = proto.SyncdPatch.decode(patchBytes)
                    const keyId = decoded.keyId?.id
                    if (!keyId) continue
                    const keyData = this.appStateSyncKeysByKeyId.get(toHex(keyId))
                    if (!keyData) continue
                    // protobuf.js may return uint64 as a Long or a primitive
                    // number depending on configuration. Normalize via the
                    // Long-style toNumber() shim if it's available.
                    const rawVersion = decoded.version?.version
                    let patchVersion = 0
                    if (typeof rawVersion === 'number') {
                        patchVersion = rawVersion
                    } else if (
                        rawVersion !== null &&
                        rawVersion !== undefined &&
                        typeof (rawVersion as { toNumber?: () => number }).toNumber === 'function'
                    ) {
                        patchVersion = (rawVersion as { toNumber: () => number }).toNumber()
                    }
                    for (const mutation of decoded.mutations ?? []) {
                        const operationCode = mutation.operation
                        if (operationCode === null || operationCode === undefined) continue
                        const record = mutation.record
                        if (!record) continue
                        const indexMac = record.index?.blob
                        const valueBlob = record.value?.blob
                        if (!indexMac || !valueBlob) continue
                        const operation: 'set' | 'remove' =
                            operationCode === proto.SyncdMutation.SyncdOperation.REMOVE
                                ? 'remove'
                                : 'set'
                        const decrypted = await this.appStateCrypto.decryptMutation({
                            operation,
                            keyId,
                            keyData,
                            indexMac,
                            valueBlob
                        })
                        let action: string | undefined
                        try {
                            const parsed = JSON.parse(decrypted.index)
                            if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
                                action = parsed[0]
                            }
                        } catch {
                            // index is opaque — leave action undefined
                        }
                        const captured: CapturedAppStateMutation = {
                            collection: collectionName,
                            operation,
                            index: decrypted.index,
                            action,
                            version: decrypted.version,
                            value: decrypted.value,
                            patchVersion
                        }
                        for (const listener of this.outboundMutationListeners) {
                            try {
                                listener(captured)
                            } catch {
                                // listeners are best-effort
                            }
                        }
                    }
                } catch {
                    // bad patch — skip silently so the auto handler still
                    // returns a success response (the lib will reconcile
                    // via its retry logic if it really cared).
                }
            }
        }
    }
}
