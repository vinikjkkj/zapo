import type { WaFakeConnectionPipeline } from '../infra/WaFakeConnectionPipeline'
import { buildNotification } from '../protocol/push/notification'
import type { ClientPreKeyBundle } from '../protocol/signal/prekey-upload'

interface PendingPreKeyBundleWaiter {
    readonly resolve: (bundle: ClientPreKeyBundle) => void
    readonly reject: (error: Error) => void
    readonly timer: NodeJS.Timeout
}

export class PreKeyDispenser {
    private capturedPreKeyBundle: ClientPreKeyBundle | null = null
    /**
     * Cursor into `capturedPreKeyBundle.preKeys` tracking how many
     * one-time prekeys have been dispensed to FakePeers via
     * {@link dispenseOneTimePreKey}. Resets to 0 every time a fresh
     * upload is captured (e.g. after a lib reconnect that triggers a
     * fresh `prekeys.upload` IQ). Each FakePeer the harness creates
     * consumes exactly one entry from the dispenser, mirroring the
     * lib's per-recipient consumption — the lib's prekey store
     * deletes consumed entries, so reusing the same index across
     * multiple peers would cause the lib to reject every pkmsg after
     * the first as "prekey N not found".
     */
    private preKeyDispenserCursor = 0
    private preKeyDispenserMisses = 0
    private nextPreKeyNotificationId = 1
    private readonly preKeyBundleWaiters = new Set<PendingPreKeyBundleWaiter>()

    /**
     * Called by the prekey-upload IQ handler when the client ships a
     * fresh bundle. Stores the bundle, resets the dispenser cursor,
     * and resolves all pending waiters.
     */
    public captureBundle(bundle: ClientPreKeyBundle): void {
        this.capturedPreKeyBundle = bundle
        // Fresh upload → reset the dispenser cursor so the
        // next batch of FakePeers consumes from index 0 of
        // the new pool. The lib's prekey store keeps old
        // entries until they're individually consumed via
        // pkmsg, so the new bundle has fresh keyIds that
        // never collide with previous batches' reservations.
        this.preKeyDispenserCursor = 0
        this.preKeyDispenserMisses = 0
        for (const waiter of this.preKeyBundleWaiters) {
            waiter.resolve(bundle)
        }
        this.preKeyBundleWaiters.clear()
    }

    /**
     * Returns a promise that resolves with the client's PreKey upload
     * bundle as soon as it has been captured. Resolves immediately if a
     * bundle was already captured. Rejects after `timeoutMs` if none has
     * arrived.
     */
    public awaitPreKeyBundle(timeoutMs = 15_000): Promise<ClientPreKeyBundle> {
        if (this.capturedPreKeyBundle) {
            return Promise.resolve(this.capturedPreKeyBundle)
        }
        return new Promise((resolve, reject) => {
            const waiter: PendingPreKeyBundleWaiter = {
                resolve: (bundle) => {
                    clearTimeout(waiter.timer)
                    this.preKeyBundleWaiters.delete(waiter)
                    resolve(bundle)
                },
                reject: (error) => {
                    clearTimeout(waiter.timer)
                    this.preKeyBundleWaiters.delete(waiter)
                    reject(error)
                },
                timer: setTimeout(() => {
                    this.preKeyBundleWaiters.delete(waiter)
                    reject(new Error(`awaitPreKeyBundle timed out after ${timeoutMs}ms`))
                }, timeoutMs)
            }
            this.preKeyBundleWaiters.add(waiter)
        })
    }

    /** Snapshot of the captured PreKey bundle, or `null` if none seen yet. */
    public capturedPreKeyBundleSnapshot(): ClientPreKeyBundle | null {
        return this.capturedPreKeyBundle
    }

    /**
     * Returns the next unused one-time prekey from the captured client
     * upload, or `null` if no upload has been captured yet or the pool
     * has been exhausted. Each call advances the dispenser cursor by
     * one entry; concurrent peers are guaranteed unique indices.
     *
     * The lib's prekey store deletes consumed entries (see
     * `SignalProtocol.consumePreKeyById`), so handing the same index
     * to two peers would cause the second pkmsg to fail with
     * "prekey N not found".
     *
     * Returns `null` (and `FakePeer` then transparently skips the DH4
     * leg of X3DH) when:
     *   - the upload hasn't been captured yet, OR
     *   - the dispenser has handed out all `preKeys.length` entries
     *
     * The dispenser is reset to index 0 every time a fresh upload is
     * captured (the lib re-uploads on reconnect / digest mismatch).
     */
    public dispenseOneTimePreKey(): {
        readonly keyId: number
        readonly publicKey: Uint8Array
    } | null {
        const bundle = this.capturedPreKeyBundle
        if (!bundle) {
            this.preKeyDispenserMisses += 1
            return null
        }
        if (this.preKeyDispenserCursor >= bundle.preKeys.length) {
            this.preKeyDispenserMisses += 1
            return null
        }
        const entry = bundle.preKeys[this.preKeyDispenserCursor]
        this.preKeyDispenserCursor += 1
        return { keyId: entry.keyId, publicKey: entry.publicKey }
    }

    /**
     * Number of one-time prekeys still available in the dispenser
     * pool. Tests + benches use this to know when to refill the lib's
     * upload (e.g. force a fresh `prekeys.upload` IQ via
     * `triggerPreKeyUpload`).
     */
    public preKeysAvailable(): number {
        const bundle = this.capturedPreKeyBundle
        if (!bundle) return 0
        return Math.max(0, bundle.preKeys.length - this.preKeyDispenserCursor)
    }

    /** Number of times the dispenser was asked but couldn't return a prekey. */
    public preKeyDispenserMissesSnapshot(): number {
        return this.preKeyDispenserMisses
    }

    /**
     * Pushes a `<notification type="encrypt"><count value="0"/></notification>`
     * to the given pipeline. The lib's `WAWebHandlePreKeyLow` handler reacts
     * to this by sending a fresh PreKey upload IQ, which the fake server
     * automatically captures via its built-in `prekey-upload` IQ handler.
     *
     * Returns a promise that resolves once the upload bundle has been
     * captured (or immediately if it was captured earlier).
     */
    public async triggerPreKeyUpload(
        pipeline: WaFakeConnectionPipeline,
        options: { readonly timeoutMs?: number; readonly force?: boolean } | number = {}
    ): Promise<ClientPreKeyBundle> {
        // Backwards compat: callers used to pass `timeoutMs` as a positional
        // number arg.
        const opts = typeof options === 'number' ? { timeoutMs: options } : options
        const timeoutMs = opts.timeoutMs ?? 15_000
        if (!opts.force && this.capturedPreKeyBundle) {
            return this.capturedPreKeyBundle
        }
        if (opts.force) {
            // Drop the cached bundle so awaitPreKeyBundle waits for a
            // fresh capture instead of returning the stale one.
            this.capturedPreKeyBundle = null
            this.preKeyDispenserCursor = 0
        }
        const bundlePromise = this.awaitPreKeyBundle(timeoutMs)
        const id = `prekey-low-${this.nextPreKeyNotificationId++}`
        await pipeline.sendStanza(
            buildNotification({
                id,
                type: 'encrypt',
                content: [
                    {
                        tag: 'count',
                        attrs: { value: '0' }
                    }
                ]
            })
        )
        return bundlePromise
    }
}
