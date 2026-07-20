import assert from 'node:assert/strict'
import test from 'node:test'

import { SignalAddressResolver } from '@signal/session/SignalAddressResolver'
import type { SignalAddress } from '@signal/types'
import type { WaLidPnMappingStore } from '@store/contracts/lid-pn-mapping.store'
import { WaLidPnMappingMemoryStore } from '@store/memory/lid-pn-mapping.store'

class CountingMappingStore extends WaLidPnMappingMemoryStore {
    public reads = 0
    public writes = 0

    public override async getLidUser(pnUser: string): Promise<string | null> {
        this.reads += 1
        return super.getLidUser(pnUser)
    }

    public override async setLidUser(pnUser: string, lidUser: string): Promise<void> {
        this.writes += 1
        await super.setLidUser(pnUser, lidUser)
    }
}

class DelayedFirstWriteStore implements WaLidPnMappingStore {
    private readonly delegate = new WaLidPnMappingMemoryStore()
    private firstWrite = true
    private readonly startedPromise: Promise<void>
    private resolveStarted: (() => void) | null = null
    private readonly releasePromise: Promise<void>
    private resolveRelease: (() => void) | null = null
    public writesStarted = 0

    public constructor() {
        this.startedPromise = new Promise((resolve) => {
            this.resolveStarted = resolve
        })
        this.releasePromise = new Promise((resolve) => {
            this.resolveRelease = resolve
        })
    }

    public getLidUser(pnUser: string): Promise<string | null> {
        return this.delegate.getLidUser(pnUser)
    }

    public getPnUser(lidUser: string): Promise<string | null> {
        return this.delegate.getPnUser(lidUser)
    }

    public async setLidUser(pnUser: string, lidUser: string): Promise<void> {
        this.writesStarted += 1
        if (this.firstWrite) {
            this.firstWrite = false
            this.resolveStarted?.()
            this.resolveStarted = null
            await this.releasePromise
        }
        await this.delegate.setLidUser(pnUser, lidUser)
    }

    public seed(pnUser: string, lidUser: string): Promise<void> {
        return this.delegate.setLidUser(pnUser, lidUser)
    }

    public clear(): Promise<void> {
        return this.delegate.clear()
    }

    public waitStarted(): Promise<void> {
        return this.startedPromise
    }

    public release(): void {
        this.resolveRelease?.()
        this.resolveRelease = null
    }
}

function pnAddress(device = 0): SignalAddress {
    return { user: '5511999999999', server: 's.whatsapp.net', device }
}

test('SignalAddressResolver caches misses and replaces them when a mapping is learned', async () => {
    const store = new CountingMappingStore()
    const resolver = new SignalAddressResolver(store)
    const pn = pnAddress(3)

    assert.deepEqual(await resolver.resolve(pn), pn)
    assert.deepEqual(await resolver.resolve(pn), pn)
    assert.equal(store.reads, 1)

    assert.equal(
        await resolver.learnMessageJidPair('5511999999999@s.whatsapp.net', '778899@lid'),
        true
    )
    assert.deepEqual(await resolver.resolve(pn), {
        user: '778899',
        server: 'lid',
        device: 3
    })
    assert.equal(store.reads, 1)
    assert.equal(store.writes, 1)

    assert.equal(await resolver.learnMessageJidPair('778899@lid', '5511999999999:3@hosted'), false)
    assert.deepEqual(
        await resolver.resolve({ user: '5511999999999', server: 'hosted', device: 99 }),
        { user: '778899', server: 'hosted.lid', device: 99 }
    )
    assert.equal(store.writes, 1)
})

test('SignalAddressResolver reloads a persisted mapping in a fresh instance', async () => {
    const store = new WaLidPnMappingMemoryStore()
    const first = new SignalAddressResolver(store)
    await first.learnMessageJidPair('5511888888888@s.whatsapp.net', '112233@lid')

    const restarted = new SignalAddressResolver(store)
    assert.deepEqual(await restarted.resolve(pnAddress()), pnAddress())
    assert.deepEqual(
        await restarted.resolve({ user: '5511888888888', server: 's.whatsapp.net', device: 7 }),
        { user: '112233', server: 'lid', device: 7 }
    )
})

test('SignalAddressResolver serializes concurrent remaps for the same PN', async () => {
    const store = new DelayedFirstWriteStore()
    const resolver = new SignalAddressResolver(store)

    const first = resolver.learnMessageJidPair('5511777777777@s.whatsapp.net', '111@lid')
    await store.waitStarted()
    const second = resolver.learnMessageJidPair('5511777777777@s.whatsapp.net', '222@lid')
    store.release()

    assert.deepEqual(await Promise.all([first, second]), [true, true])
    assert.deepEqual(
        await resolver.resolve({ user: '5511777777777', server: 'hosted', device: 99 }),
        { user: '222', server: 'hosted.lid', device: 99 }
    )
})

test('SignalAddressResolver serializes disjoint remaps that cross reverse entries', async () => {
    const store = new DelayedFirstWriteStore()
    await store.seed('5511000000001', '101')
    await store.seed('5511000000002', '202')
    const resolver = new SignalAddressResolver(store)

    const first = resolver.learnPeerRecipientJidPair('5511000000001@s.whatsapp.net', '202@lid')
    await store.waitStarted()
    const second = resolver.learnPeerRecipientJidPair('5511000000002@s.whatsapp.net', '101@lid')

    await Promise.resolve()
    assert.equal(store.writesStarted, 1)
    store.release()

    assert.deepEqual(await Promise.all([first, second]), [true, true])
    assert.equal(await store.getLidUser('5511000000001'), '202')
    assert.equal(await store.getLidUser('5511000000002'), '101')
    assert.equal(await store.getPnUser('101'), '5511000000002')
    assert.equal(await store.getPnUser('202'), '5511000000001')
})

test('SignalAddressResolver rejects conflicting author metadata without stealing a LID', async () => {
    const store = new WaLidPnMappingMemoryStore()
    const resolver = new SignalAddressResolver(store)
    await resolver.learnMessageJidPair('5511000000001@s.whatsapp.net', '101@lid')

    assert.equal(
        await resolver.learnMessageJidPair('5511000000002@s.whatsapp.net', '101@lid'),
        false
    )
    assert.equal(await store.getPnUser('101'), '5511000000001')
    assert.equal(await store.getLidUser('5511000000002'), null)
})

test('SignalAddressResolver replaces stale mappings from authoritative peer metadata', async () => {
    const store = new WaLidPnMappingMemoryStore()
    const resolver = new SignalAddressResolver(store)
    await resolver.learnMessageJidPair('5511000000001@s.whatsapp.net', '101@lid')

    assert.equal(
        await resolver.learnPeerRecipientJidPair('5511000000002@s.whatsapp.net', '101@lid'),
        true
    )
    assert.equal(await store.getLidUser('5511000000001'), null)
    assert.equal(await store.getLidUser('5511000000002'), '101')
    assert.equal(await store.getPnUser('101'), '5511000000002')
})

test('SignalAddressResolver reasserts an authoritative mapping after its cache becomes stale', async () => {
    const store = new WaLidPnMappingMemoryStore()
    const resolver = new SignalAddressResolver(store)
    await resolver.learnMessageJidPair('5511000000001@s.whatsapp.net', '101@lid')

    // Simulate another resolver replacing the persisted owner while this
    // resolver still has the original PN -> LID pair cached.
    await store.setLidUser('5511000000002', '101')

    assert.equal(
        await resolver.learnPeerRecipientJidPair('5511000000001@s.whatsapp.net', '101@lid'),
        true
    )
    assert.equal(await store.getLidUser('5511000000001'), '101')
    assert.equal(await store.getLidUser('5511000000002'), null)
    assert.equal(await store.getPnUser('101'), '5511000000001')
})

test('SignalAddressResolver ignores pairs that are not PN/LID alternates', async () => {
    const store = new CountingMappingStore()
    const resolver = new SignalAddressResolver(store)

    assert.equal(
        await resolver.learnMessageJidPair('5511000000001@s.whatsapp.net', '5511000000002@hosted'),
        false
    )
    assert.equal(await resolver.learnMessageJidPair('111@lid', '222@hosted.lid'), false)
    assert.equal(store.reads, 0)
    assert.equal(store.writes, 0)
})

test('SignalAddressResolver bounds its positive and negative lookup cache', async () => {
    const store = new CountingMappingStore()
    await store.setLidUser('5511000000001', '101')
    await store.setLidUser('5511000000002', '202')
    store.reads = 0
    store.writes = 0
    const resolver = new SignalAddressResolver(store, { maxCacheEntries: 1 })

    await resolver.resolve({ user: '5511000000001', server: 's.whatsapp.net', device: 0 })
    await resolver.resolve({ user: '5511000000002', server: 's.whatsapp.net', device: 0 })
    await resolver.resolve({ user: '5511000000001', server: 's.whatsapp.net', device: 0 })

    assert.equal(store.reads, 3)
})

test('SignalAddressResolver resolveMany retains results larger than its cache', async () => {
    const store = new CountingMappingStore()
    await store.setLidUser('5511000000001', '101')
    await store.setLidUser('5511000000002', '202')
    await store.setLidUser('5511000000003', '303')
    store.reads = 0
    store.writes = 0
    const resolver = new SignalAddressResolver(store, { maxCacheEntries: 1 })

    const resolved = await resolver.resolveMany([
        { user: '5511000000001', server: 's.whatsapp.net', device: 1 },
        { user: '5511000000002', server: 's.whatsapp.net', device: 2 },
        { user: '5511000000003', server: 's.whatsapp.net', device: 3 }
    ])

    assert.deepEqual(resolved, [
        { user: '101', server: 'lid', device: 1 },
        { user: '202', server: 'lid', device: 2 },
        { user: '303', server: 'lid', device: 3 }
    ])
    assert.equal(store.reads, 3)
})

test('SignalAddressResolver resolves hosted and regular LIDs back to their PN alias', async () => {
    const store = new WaLidPnMappingMemoryStore()
    const resolver = new SignalAddressResolver(store)
    await resolver.learnMessageJidPair('5511000000004@s.whatsapp.net', '404@lid')

    assert.deepEqual(
        await resolver.resolvePhoneNumberAlias({ user: '404', server: 'lid', device: 4 }),
        { user: '5511000000004', server: 's.whatsapp.net', device: 4 }
    )
    assert.deepEqual(
        await resolver.resolvePhoneNumberAlias({ user: '404', server: 'hosted.lid', device: 99 }),
        { user: '5511000000004', server: 'hosted', device: 99 }
    )
})

test('SignalAddressResolver clears its persistent mapping and hot cache together', async () => {
    const store = new WaLidPnMappingMemoryStore()
    const resolver = new SignalAddressResolver(store)
    const pn = { user: '5511000000004', server: 's.whatsapp.net', device: 4 } as const
    await resolver.learnMessageJidPair('5511000000004@s.whatsapp.net', '404@lid')
    assert.equal((await resolver.resolve(pn)).user, '404')

    await resolver.clear()

    assert.deepEqual(await resolver.resolve(pn), pn)
    assert.equal(await store.getLidUser('5511000000004'), null)
})

test('WaLidPnMappingMemoryStore evicts its oldest mapping at capacity', async () => {
    const store = new WaLidPnMappingMemoryStore({ maxMappings: 2 })
    await store.setLidUser('5511000000001', '101')
    await store.setLidUser('5511000000002', '202')
    await store.setLidUser('5511000000003', '303')

    assert.equal(await store.getLidUser('5511000000001'), null)
    assert.equal(await store.getLidUser('5511000000002'), '202')
    assert.equal(await store.getLidUser('5511000000003'), '303')
    assert.equal(await store.getPnUser('101'), null)
    assert.equal(await store.getPnUser('202'), '5511000000002')
})
