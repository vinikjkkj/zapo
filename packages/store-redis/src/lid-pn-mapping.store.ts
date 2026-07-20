import type { WaLidPnMappingStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import type { WaRedisStorageOptions } from './types'

const LUA_SET_MAPPING = `
local pn_field = 'p:' .. ARGV[1]
local lid_field = 'l:' .. ARGV[2]
local old_lid = redis.call('HGET', KEYS[1], pn_field)
if old_lid then
    redis.call('HDEL', KEYS[1], 'l:' .. old_lid)
end
local old_pn = redis.call('HGET', KEYS[1], lid_field)
if old_pn then
    redis.call('HDEL', KEYS[1], 'p:' .. old_pn)
end
redis.call('HSET', KEYS[1], pn_field, ARGV[2], lid_field, ARGV[1])
return 1
`

/** Redis-backed PN/LID mapping store using one atomic bidirectional hash. */
export class WaLidPnMappingRedisStore extends BaseRedisStore implements WaLidPnMappingStore {
    private readonly mappingKey: string

    public constructor(options: WaRedisStorageOptions) {
        super(options)
        this.mappingKey = this.k('signal:lid-pn', this.sessionId)
    }

    public async getLidUser(pnUser: string): Promise<string | null> {
        return this.redis.hget(this.mappingKey, `p:${pnUser}`)
    }

    public async getPnUser(lidUser: string): Promise<string | null> {
        return this.redis.hget(this.mappingKey, `l:${lidUser}`)
    }

    public async setLidUser(pnUser: string, lidUser: string): Promise<void> {
        await this.redis.eval(LUA_SET_MAPPING, 1, this.mappingKey, pnUser, lidUser)
    }

    public async clear(): Promise<void> {
        await this.redis.del(this.mappingKey)
    }
}
