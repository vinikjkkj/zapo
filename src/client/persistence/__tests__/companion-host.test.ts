import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createFileCompanionHostPersistence } from '@client/persistence/companion-host'

test('file persistence round-trips the epoch including companion key bytes', async () => {
    const path = join(tmpdir(), 'zapo-companion-host-persistence.test.json')
    await rm(path, { force: true })
    const persistence = createFileCompanionHostPersistence(path)

    assert.equal(await persistence.load(), null)

    await persistence.save({
        rawId: 8_675_309,
        currentKeyIndex: 2,
        companions: [
            {
                deviceJid: 'x:1@s.whatsapp.net',
                keyIndex: 1,
                companionIdentityPublicKey: new Uint8Array([1, 2, 3]),
                addedAtSeconds: 100
            },
            {
                deviceJid: 'x:2@s.whatsapp.net',
                keyIndex: 2,
                companionIdentityPublicKey: new Uint8Array([4, 5, 6]),
                addedAtSeconds: 200
            }
        ]
    })

    const loaded = await persistence.load()
    assert.ok(loaded)
    assert.equal(loaded.rawId, 8_675_309)
    assert.equal(loaded.currentKeyIndex, 2)
    assert.equal(loaded.companions.length, 2)
    assert.deepEqual([...loaded.companions[0].companionIdentityPublicKey], [1, 2, 3])
    assert.deepEqual([...loaded.companions[1].companionIdentityPublicKey], [4, 5, 6])
    assert.equal(loaded.companions[1].deviceJid, 'x:2@s.whatsapp.net')

    await rm(path, { force: true })
})
