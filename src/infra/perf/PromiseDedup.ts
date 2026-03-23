export class PromiseDedup {
    private readonly inFlight = new Map<string, Promise<unknown>>()

    public run<T>(key: string, task: () => Promise<T>): Promise<T> {
        const existing = this.inFlight.get(key)
        if (existing) {
            return existing as Promise<T>
        }
        const created = Promise.resolve()
            .then(() => task())
            .finally(() => {
                if (this.inFlight.get(key) === created) {
                    this.inFlight.delete(key)
                }
            })
        this.inFlight.set(key, created)
        return created
    }
}
