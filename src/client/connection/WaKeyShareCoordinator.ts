export class WaKeyShareCoordinator {
    private readonly waiters: Set<(received: boolean) => void>
    private version: number
    private bootstrapDone: boolean

    public constructor() {
        this.waiters = new Set()
        this.version = 0
        this.bootstrapDone = false
    }

    public waitForShare(timeoutMs: number): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            let settled = false
            let timeoutHandle: ReturnType<typeof setTimeout> | null = null

            const waiter = (received: boolean) => {
                if (settled) {
                    return
                }
                settled = true
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle)
                    timeoutHandle = null
                }
                this.waiters.delete(waiter)
                resolve(received)
            }

            this.waiters.add(waiter)
            timeoutHandle = setTimeout(() => {
                waiter(false)
            }, timeoutMs)
        })
    }

    public notifyReceived(): void {
        this.version += 1
        this.releaseWaiters(true)
    }

    public notifyDisconnected(): void {
        this.bootstrapDone = false
        this.releaseWaiters(false)
    }

    public isBootstrapDone(): boolean {
        return this.bootstrapDone
    }

    public markBootstrapDone(): void {
        this.bootstrapDone = true
    }

    public getVersion(): number {
        return this.version
    }

    public hasWaiters(): boolean {
        return this.waiters.size > 0
    }

    private releaseWaiters(received: boolean): void {
        if (this.waiters.size === 0) {
            return
        }

        const waiters = [...this.waiters.values()]
        this.waiters.clear()
        for (const waiter of waiters) {
            waiter(received)
        }
    }
}
