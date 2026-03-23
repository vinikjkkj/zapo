type StoreTask<T> = () => Promise<T>

export class StoreLock {
    private readonly chains = new Map<string, Promise<void>>()
    private closed = false

    public run<T>(key: string, task: StoreTask<T>): Promise<T> {
        return this.runInternal(key, task, true)
    }

    private runInternal<T>(key: string, task: StoreTask<T>, rejectWhenClosed: boolean): Promise<T> {
        if (this.closed) {
            if (rejectWhenClosed) {
                throw new Error('store lock is closed')
            }
        }
        const previous = this.chains.get(key)
        let current: Promise<T>
        if (previous) {
            current = previous.then(task)
        } else {
            try {
                current = task()
            } catch (error) {
                current = Promise.reject(error)
            }
        }
        const tracker = current.then(
            () => undefined,
            () => undefined
        )
        this.chains.set(key, tracker)
        void tracker.finally(() => {
            if (this.chains.get(key) === tracker) {
                this.chains.delete(key)
            }
        })
        return current
    }

    public runMany<T>(keys: readonly string[], task: StoreTask<T>): Promise<T> {
        if (this.closed) {
            throw new Error('store lock is closed')
        }
        if (keys.length <= 1) {
            return keys.length === 0 ? task() : this.runInternal(keys[0], task, false)
        }
        const ordered = new Array<string>(keys.length)
        for (let index = 0; index < keys.length; index += 1) {
            ordered[index] = keys[index]
        }
        ordered.sort()
        let uniqueCount = 1
        let previousKey = ordered[0]
        for (let index = 1; index < ordered.length; index += 1) {
            const key = ordered[index]
            if (key === previousKey) {
                continue
            }
            ordered[uniqueCount] = key
            uniqueCount += 1
            previousKey = key
        }
        const acquire = (index: number): Promise<T> =>
            index >= uniqueCount
                ? task()
                : this.runInternal(
                      ordered[index],
                      () => Promise.resolve().then(() => acquire(index + 1)),
                      false
                  )
        return acquire(0)
    }

    public async shutdown(): Promise<void> {
        this.closed = true
        while (this.chains.size > 0) {
            const pending = new Array<Promise<void>>(this.chains.size)
            let pendingIndex = 0
            for (const chain of this.chains.values()) {
                pending[pendingIndex] = chain
                pendingIndex += 1
            }
            await Promise.allSettled(pending)
        }
    }
}
