type SharedExclusiveTask<T> = () => Promise<T>

export class SharedExclusiveGate {
    private activeShared = 0
    private pendingExclusive = 0
    private exclusiveActive = false
    private closed = false
    private readonly waiters: Array<() => void> = []

    public runShared<T>(task: SharedExclusiveTask<T>): Promise<T> {
        if (this.closed) {
            return Promise.reject(new Error('shared-exclusive gate is closed'))
        }
        if (!this.exclusiveActive && this.pendingExclusive === 0) {
            this.activeShared += 1
            let current: Promise<T>
            try {
                current = task()
            } catch (error) {
                current = Promise.reject(error)
            }
            return current.finally(() => {
                this.activeShared -= 1
                this.notifyStateChange()
            })
        }
        return this.runSharedSlow(task)
    }

    private async runSharedSlow<T>(task: SharedExclusiveTask<T>): Promise<T> {
        await this.acquireShared()
        try {
            return await task()
        } finally {
            this.activeShared -= 1
            this.notifyStateChange()
        }
    }

    public async runExclusive<T>(task: SharedExclusiveTask<T>): Promise<T> {
        await this.acquireExclusive()
        try {
            return await task()
        } finally {
            this.exclusiveActive = false
            this.notifyStateChange()
        }
    }

    public async close(): Promise<void> {
        if (this.closed) {
            while (this.activeShared > 0 || this.exclusiveActive || this.pendingExclusive > 0) {
                await this.waitForStateChange()
            }
            return
        }
        this.closed = true
        this.notifyStateChange()
        while (this.activeShared > 0 || this.exclusiveActive || this.pendingExclusive > 0) {
            await this.waitForStateChange()
        }
    }

    private async acquireShared(): Promise<void> {
        if (this.closed) {
            throw new Error('shared-exclusive gate is closed')
        }
        while (this.exclusiveActive || this.pendingExclusive > 0) {
            await this.waitForStateChange()
            if (this.closed) {
                throw new Error('shared-exclusive gate is closed')
            }
        }
        this.activeShared += 1
    }

    private async acquireExclusive(): Promise<void> {
        if (this.closed) {
            throw new Error('shared-exclusive gate is closed')
        }
        this.pendingExclusive += 1
        this.notifyStateChange()
        try {
            while (this.exclusiveActive || this.activeShared > 0) {
                await this.waitForStateChange()
                if (this.closed) {
                    throw new Error('shared-exclusive gate is closed')
                }
            }
            this.exclusiveActive = true
        } finally {
            this.pendingExclusive -= 1
            this.notifyStateChange()
        }
    }

    private notifyStateChange(): void {
        if (this.waiters.length === 0) {
            return
        }
        const waiterCount = this.waiters.length
        for (let index = 0; index < waiterCount; index += 1) {
            this.waiters[index]()
        }
        this.waiters.length = 0
    }

    private waitForStateChange(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.waiters[this.waiters.length] = resolve
        })
    }
}
