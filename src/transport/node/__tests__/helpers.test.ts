import assert from 'node:assert/strict'
import test from 'node:test'

import { createMobileNodeIdGenerator, createNodeIdGenerator } from '@transport/node/helpers'

test('createNodeIdGenerator produces a random prefix and monotonic counter', async () => {
    const gen = await createNodeIdGenerator()
    assert.match(gen.prefix, /^\d+\.\d+-$/)
    const first = gen.next()
    const second = gen.next()
    assert.equal(first, `${gen.prefix}1`)
    assert.equal(second, `${gen.prefix}2`)
})

test('createMobileNodeIdGenerator matches WA Android C08170Ng.A0E format', () => {
    const gen = createMobileNodeIdGenerator()
    assert.equal(gen.prefix, '0')
    const ids: string[] = []
    for (let i = 0; i < 260; i++) ids.push(gen.next())
    assert.equal(ids[0], '00')
    assert.equal(ids[1], '01')
    assert.equal(ids[15], '0f')
    assert.equal(ids[16], '010')
    assert.equal(ids[255], '0ff')
    assert.equal(ids[256], '0100')
})

test('createMobileNodeIdGenerator wraps at 65536', () => {
    const gen = createMobileNodeIdGenerator()
    for (let i = 0; i < 65535; i++) gen.next()
    assert.equal(gen.next(), '0ffff')
    assert.equal(gen.next(), '00')
})

test('createMobileNodeIdGenerator nextSystem produces pure-hex ids without prefix', () => {
    const gen = createMobileNodeIdGenerator()
    assert.equal(typeof gen.nextSystem, 'function')
    const ids: string[] = []
    for (let i = 0; i < 260; i++) ids.push(gen.nextSystem!())
    assert.equal(ids[0], '1')
    assert.equal(ids[14], 'f')
    assert.equal(ids[15], '10')
    assert.equal(ids[254], 'ff')
    assert.equal(ids[255], '100')
})

test('createMobileNodeIdGenerator next and nextSystem track independent counters', () => {
    const gen = createMobileNodeIdGenerator()
    assert.equal(gen.next(), '00')
    assert.equal(gen.nextSystem!(), '1')
    assert.equal(gen.next(), '01')
    assert.equal(gen.nextSystem!(), '2')
})
