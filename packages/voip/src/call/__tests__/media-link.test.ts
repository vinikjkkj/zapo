import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { toCompanionModelSource } from '../media-link.js'

test('Companion weights given as bytes reach the media as they are', () => {
    const bytes = new Uint8Array([1, 2, 3])
    assert.equal(toCompanionModelSource(bytes), bytes)
    assert.equal(toCompanionModelSource(undefined), undefined)
})

test('a Companion weights path is read once, on the first call that asks', async () => {
    const source = toCompanionModelSource(__filename)
    assert.equal(typeof source, 'function')
    const load = source as () => Promise<Uint8Array | ArrayBuffer>

    const first = await load()
    const second = await load()

    assert.deepEqual(new Uint8Array(first), new Uint8Array(await readFile(__filename)))
    assert.equal(first, second, 'every call shares the one read')
})

test('a Companion weights path that cannot be read rejects the load, not the call', async () => {
    const load = toCompanionModelSource('Z:/no/such/mlow_companion_v1.pte') as () => Promise<
        Uint8Array | ArrayBuffer
    >

    await assert.rejects(load())
})
