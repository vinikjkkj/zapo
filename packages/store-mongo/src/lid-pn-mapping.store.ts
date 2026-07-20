import type { WaLidPnMappingStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import type { WaMongoStorageOptions } from './types'

const COLLECTION = 'signal_lid_pn_mappings'
const REPLACE_MAX_ATTEMPTS = 3

interface LidPnMappingDoc {
    _id: { session_id: string; pn_user: string }
    lid_user: string
}

function isDuplicateKeyError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { readonly code?: unknown }).code === 11_000
    )
}

/** MongoDB-backed PN/LID mapping store scoped by Zapo session id. */
export class WaLidPnMappingMongoStore extends BaseMongoStore implements WaLidPnMappingStore {
    private writeTail: Promise<void> = Promise.resolve()

    public constructor(options: WaMongoStorageOptions) {
        super(options)
    }

    protected override async createIndexes(): Promise<void> {
        await this.col<LidPnMappingDoc>(COLLECTION).createIndex(
            { '_id.session_id': 1, lid_user: 1 },
            { unique: true }
        )
    }

    public async getLidUser(pnUser: string): Promise<string | null> {
        await this.ensureIndexes()
        const doc = await this.col<LidPnMappingDoc>(COLLECTION).findOne({
            _id: { session_id: this.sessionId, pn_user: pnUser }
        })
        return doc?.lid_user ?? null
    }

    public async getPnUser(lidUser: string): Promise<string | null> {
        await this.ensureIndexes()
        const doc = await this.col<LidPnMappingDoc>(COLLECTION).findOne({
            '_id.session_id': this.sessionId,
            lid_user: lidUser
        })
        return doc?._id.pn_user ?? null
    }

    public async setLidUser(pnUser: string, lidUser: string): Promise<void> {
        await this.runWriteSerialized(async () => {
            for (let attempt = 1; attempt <= REPLACE_MAX_ATTEMPTS; attempt += 1) {
                try {
                    await this.withSession(async (session) => {
                        const collection = this.col<LidPnMappingDoc>(COLLECTION)
                        await collection.deleteMany(
                            {
                                '_id.session_id': this.sessionId,
                                '_id.pn_user': { $ne: pnUser },
                                lid_user: lidUser
                            },
                            { session }
                        )
                        await collection.updateOne(
                            { _id: { session_id: this.sessionId, pn_user: pnUser } },
                            { $set: { lid_user: lidUser } },
                            { upsert: true, session }
                        )
                    })
                    return
                } catch (error) {
                    if (attempt === REPLACE_MAX_ATTEMPTS || !isDuplicateKeyError(error)) {
                        throw error
                    }
                }
            }
        })
    }

    public async clear(): Promise<void> {
        await this.runWriteSerialized(async () => {
            await this.ensureIndexes()
            await this.col<LidPnMappingDoc>(COLLECTION).deleteMany({
                '_id.session_id': this.sessionId
            })
        })
    }

    private runWriteSerialized<T>(task: () => Promise<T>): Promise<T> {
        const result = this.writeTail.then(task)
        this.writeTail = result.then(
            () => undefined,
            () => undefined
        )
        return result
    }
}
