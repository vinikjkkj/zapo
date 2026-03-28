import type { Db } from 'mongodb'

export interface WaMongoStorageOptions {
    readonly db: Db
    readonly sessionId: string
    readonly collectionPrefix?: string
}
