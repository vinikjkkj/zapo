import type { ClientSession, Collection, Db, Document } from 'mongodb'

import { assertSafeCollectionPrefix } from './helpers'
import type { WaMongoStorageOptions } from './types'

export abstract class BaseMongoStore {
    protected readonly db: Db
    protected readonly sessionId: string
    protected readonly collectionPrefix: string
    private indexPromise: Promise<void> | null
    private transactionSupportPromise: Promise<boolean> | null

    protected constructor(options: WaMongoStorageOptions) {
        this.db = options.db
        this.sessionId = options.sessionId
        this.collectionPrefix = options.collectionPrefix ?? ''
        assertSafeCollectionPrefix(this.collectionPrefix)
        this.indexPromise = null
        this.transactionSupportPromise = null
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
            const supportsTransactions = await this.canUseTransactions()
            if (!supportsTransactions) {
                return run(session)
            }
            try {
                let result: T | undefined
                let hasResult = false
                await session.withTransaction(async () => {
                    result = await run(session)
                    hasResult = true
                })
                if (!hasResult) {
                    throw new Error('mongo transaction callback did not execute')
                }
                return result as T
            } catch (error) {
                if (!this.isTransactionUnsupportedError(error)) {
                    throw error
                }
                this.transactionSupportPromise = Promise.resolve(false)
                return run(session)
            }
        } finally {
            await session.endSession()
        }
    }

    private async canUseTransactions(): Promise<boolean> {
        if (!this.transactionSupportPromise) {
            this.transactionSupportPromise = this.detectTransactionSupport()
        }
        return this.transactionSupportPromise
    }

    private async detectTransactionSupport(): Promise<boolean> {
        try {
            const hello = await this.db.admin().command({ hello: 1 })
            if (!hello || typeof hello !== 'object') {
                return false
            }
            const helloRecord = hello as {
                readonly msg?: unknown
                readonly setName?: unknown
            }
            if (helloRecord.msg === 'isdbgrid') {
                return true
            }
            return typeof helloRecord.setName === 'string' && helloRecord.setName.length > 0
        } catch {
            return false
        }
    }

    private isTransactionUnsupportedError(error: unknown): boolean {
        if (!(error instanceof Error)) {
            return false
        }
        const code = (error as { readonly code?: unknown }).code
        if (code === 20 || code === 303) {
            return true
        }
        const message = error.message.toLowerCase()
        return (
            message.includes(
                'transaction numbers are only allowed on a replica set member or mongos'
            ) || message.includes('transactions are not supported by this deployment')
        )
    }

    public async destroy(): Promise<void> {
        this.indexPromise = null
        this.transactionSupportPromise = null
    }
}
