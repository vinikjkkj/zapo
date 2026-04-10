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
    readonly collection: string
    readonly operation: 'set' | 'remove'
    readonly index: string
    readonly action: string | undefined
    readonly version: number
    readonly value: Proto.ISyncActionValue | null
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
    public readonly appStateCollectionProviders = new Map<
        string,
        () => Promise<FakeAppStateCollectionPayload | null> | FakeAppStateCollectionPayload | null
    >()
    public readonly appStateSyncKeysByKeyId = new Map<string, Uint8Array>()
    public readonly appStateCrypto = new FakeAppStateCrypto()
    public readonly outboundMutationListeners = new Set<
        (mutation: CapturedAppStateMutation) => void
    >()

    public registerAppStateSyncKey(keyId: Uint8Array, keyData: Uint8Array): void {
        this.appStateSyncKeysByKeyId.set(toHex(keyId), keyData)
    }

    public onOutboundAppStateMutation(
        listener: (mutation: CapturedAppStateMutation) => void
    ): () => void {
        this.outboundMutationListeners.add(listener)
        return () => {
            this.outboundMutationListeners.delete(listener)
        }
    }

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

    public provideAppStateCollection(
        name: string,
        provider: () =>
            | Promise<FakeAppStateCollectionPayload | null>
            | FakeAppStateCollectionPayload
            | null
    ): () => void {
        this.appStateCollectionProviders.set(name, provider)
        return () => {
            this.appStateCollectionProviders.delete(name)
        }
    }

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
                            // Ignore malformed index payloads; mutation capture still proceeds.
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
                                // Listener failures are best-effort.
                            }
                        }
                    }
                } catch {
                    // Ignore malformed/undecryptable patches.
                }
            }
        }
    }
}
