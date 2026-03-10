type Task<T> = () => Promise<T>

interface QueueItem<T> {
    readonly task: Task<T>
    readonly resolve: (value: unknown) => void
    readonly reject: (error: unknown) => void
}

export class BoundedTaskQueue {
    private readonly maxQueueSize: number
    private readonly maxConcurrency: number
    private readonly queue: Array<QueueItem<unknown>>
    private head: number
    private running: number

    public constructor(maxQueueSize = 256, maxConcurrency = 1) {
        if (maxQueueSize <= 0) {
            throw new Error('maxQueueSize must be > 0')
        }
        if (maxConcurrency <= 0) {
            throw new Error('maxConcurrency must be > 0')
        }

        this.maxQueueSize = maxQueueSize
        this.maxConcurrency = maxConcurrency
        this.queue = []
        this.head = 0
        this.running = 0
    }

    public enqueue<T>(task: Task<T>): Promise<T> {
        if (this.pending() >= this.maxQueueSize) {
            return Promise.reject(new Error('queue is full'))
        }

        return new Promise<T>((resolve, reject) => {
            this.queue.push({
                task,
                resolve: (value) => resolve(value as T),
                reject
            })
            this.drain()
        })
    }

    public pending(): number {
        return this.queue.length - this.head
    }

    public inFlight(): number {
        return this.running
    }

    private drain(): void {
        while (this.running < this.maxConcurrency && this.head < this.queue.length) {
            const item = this.queue[this.head++]
            this.running++

            item.task()
                .then(item.resolve)
                .catch(item.reject)
                .finally(() => {
                    this.running--
                    this.compactIfNeeded()
                    this.drain()
                })
        }
    }

    private compactIfNeeded(): void {
        if (this.head < 1024 || this.head * 2 < this.queue.length) {
            return
        }

        this.queue.splice(0, this.head)
        this.head = 0
    }
}
