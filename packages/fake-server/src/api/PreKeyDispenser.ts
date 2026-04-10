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
    private preKeyDispenserCursor = 0
    private preKeyDispenserMisses = 0
    private nextPreKeyNotificationId = 1
    private readonly preKeyBundleWaiters = new Set<PendingPreKeyBundleWaiter>()

    public captureBundle(bundle: ClientPreKeyBundle): void {
        this.capturedPreKeyBundle = bundle
        this.preKeyDispenserCursor = 0
        this.preKeyDispenserMisses = 0
        for (const waiter of this.preKeyBundleWaiters) {
            waiter.resolve(bundle)
        }
        this.preKeyBundleWaiters.clear()
    }

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

    public capturedPreKeyBundleSnapshot(): ClientPreKeyBundle | null {
        return this.capturedPreKeyBundle
    }

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

    public preKeysAvailable(): number {
        const bundle = this.capturedPreKeyBundle
        if (!bundle) return 0
        return Math.max(0, bundle.preKeys.length - this.preKeyDispenserCursor)
    }

    public preKeyDispenserMissesSnapshot(): number {
        return this.preKeyDispenserMisses
    }

    public async triggerPreKeyUpload(
        pipeline: WaFakeConnectionPipeline,
        options: { readonly timeoutMs?: number; readonly force?: boolean } | number = {}
    ): Promise<ClientPreKeyBundle> {
        const opts = typeof options === 'number' ? { timeoutMs: options } : options
        const timeoutMs = opts.timeoutMs ?? 15_000
        if (!opts.force && this.capturedPreKeyBundle) {
            return this.capturedPreKeyBundle
        }
        if (opts.force) {
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
