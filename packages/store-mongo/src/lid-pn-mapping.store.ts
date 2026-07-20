import type { WaLidPnMappingStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import type { WaMongoStorageOptions } from './types'

const COLLECTION = 'signal_lid_pn_mappings'

interface LidPnMappingDoc {
    _id: { session_id: string; pn_user: string }
    lid_user: string
}

/** MongoDB-backed PN/LID mapping store scoped by Zapo session id. */
export class WaLidPnMappingMongoStore extends BaseMongoStore implements WaLidPnMappingStore {
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
        await this.withSession(async (session) => {
            const collection = this.col<LidPnMappingDoc>(COLLECTION)
            await collection.deleteMany(
                {
                    '_id.session_id': this.sessionId,
                    $or: [{ '_id.pn_user': pnUser }, { lid_user: lidUser }]
                },
                { session }
            )
            await collection.insertOne(
                {
                    _id: { session_id: this.sessionId, pn_user: pnUser },
                    lid_user: lidUser
                },
                { session }
            )
        })
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        await this.col<LidPnMappingDoc>(COLLECTION).deleteMany({
            '_id.session_id': this.sessionId
        })
    }
}
