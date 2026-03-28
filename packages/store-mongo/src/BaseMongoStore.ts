import type { ClientSession, Collection, Db, Document } from 'mongodb'

import { assertSafeCollectionPrefix } from './helpers'
import type { WaMongoStorageOptions } from './types'

export abstract class BaseMongoStore {
    protected readonly db: Db
    protected readonly sessionId: string
    protected readonly collectionPrefix: string
    private indexPromise: Promise<void> | null

    protected constructor(options: WaMongoStorageOptions) {
        this.db = options.db
        this.sessionId = options.sessionId
        this.collectionPrefix = options.collectionPrefix ?? ''
        assertSafeCollectionPrefix(this.collectionPrefix)
        this.indexPromise = null
    }

    protected col<T extends Document = Document>(name: string): Collection<T> {
        return this.db.collection<T>(`${this.collectionPrefix}${name}`)
    }

    protected async ensureIndexes(): Promise<void> {
        if (!this.indexPromise) {
            this.indexPromise = this.createIndexes().catch((err) => {
                this.indexPromise = null
                throw err
            })
        }
        return this.indexPromise
    }

    protected async createIndexes(): Promise<void> {
        // Override in subclasses that need indexes
    }

    protected async withSession<T>(run: (session: ClientSession) => Promise<T>): Promise<T> {
        await this.ensureIndexes()
        const session = this.db.client.startSession()
        try {
            let result: T
            await session.withTransaction(async () => {
                result = await run(session)
            })
            return result!
        } finally {
            await session.endSession()
        }
    }

    public async destroy(): Promise<void> {
        this.indexPromise = null
    }
}
