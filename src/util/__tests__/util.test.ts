import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'

import { delay } from '@util/async'
import {
    base64ToBytesChecked,
    base64ToBytes as base64ToBytesCore,
    bytesToBase64,
    bytesToBase64 as bytesToBase64Core,
    bytesToBase64UrlSafe,
    bytesToHex,
    concatBytes,
    decodeProtoBytes,
    EMPTY_BYTES,
    hexToBytes,
    intToBytes,
    readAllBytes,
    removeAt,
    TEXT_DECODER,
    TEXT_ENCODER,
    toBytesView,
    toChunkBytes,
    uint8Equal,
    uint8TimingSafeEqual
} from '@util/bytes'
import {
    asBytes,
    asNumber,
    asOptionalBytes,
    asOptionalNumber,
    asOptionalString,
    asString,
    resolveOptionalPositive,
    resolvePositive,
    toBoolOrUndef,
    tryAsNumber,
    tryAsRecord,
    tryAsString
} from '@util/coercion'
import {
    IdleExpiryIndex,
    IdleSweepClock,
    normalizeQueryLimit,
    resolveCleanupIntervalMs,
    resolveIdleSweepPeriodMs,
    setBoundedMapEntry
} from '@util/collections'
import { longToNumber, toError, toSafeNumber } from '@util/primitives'
import { getRuntimeOsDisplayName } from '@util/runtime'

test('bytes hex/base64 round-trip and validation', () => {
    const raw = new Uint8Array([0, 1, 2, 253, 254, 255])
    const hex = bytesToHex(raw)

    assert.equal(hex, '000102fdfeff')
    assert.deepEqual(hexToBytes(hex), raw)
    assert.throws(() => hexToBytes('abc'), /even length/)
    assert.throws(() => hexToBytes('zz'), /invalid hex/)

    const b64 = bytesToBase64Core(raw)
    assert.equal(b64, 'AAEC/f7/')
    assert.deepEqual(base64ToBytesCore(b64), raw)
    assert.equal(bytesToBase64UrlSafe(raw), 'AAEC_f7_')

    assert.throws(() => base64ToBytesCore('abc'), /multiple of 4/)
})

test('bytes helpers preserve views and chunk conversion', () => {
    const buffer = new ArrayBuffer(4)
    const view = new Uint8Array(buffer)
    view.set([10, 11, 12, 13])

    const bytes = toBytesView(new DataView(buffer, 1, 2))
    assert.deepEqual(bytes, new Uint8Array([11, 12]))

    view[1] = 42
    assert.equal(bytes[0], 42)

    assert.deepEqual(toChunkBytes('ok'), TEXT_ENCODER.encode('ok'))
    assert.deepEqual(toChunkBytes(buffer), view)
    assert.throws(() => toChunkBytes(123), /unsupported stream chunk type/)
})

test('bytes concat, int conversion and equality', () => {
    const joined = concatBytes([new Uint8Array([1, 2]), new Uint8Array([3])])
    assert.deepEqual(joined, new Uint8Array([1, 2, 3]))

    assert.deepEqual(intToBytes(4, 258), new Uint8Array([0, 0, 1, 2]))
    assert.throws(() => intToBytes(2, -1), /invalid integer value/)

    assert.equal(uint8Equal(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true)
    assert.equal(uint8Equal(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false)
    assert.equal(uint8TimingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true)
    assert.equal(uint8TimingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 2])), false)

    assert.deepEqual(removeAt([1, 2, 3], 1), [1, 3])
})

test('readAllBytes handles stream content and max bytes limit', async () => {
    const stream = Readable.from([new Uint8Array([1, 2]), new Uint8Array([3])])
    assert.deepEqual(await readAllBytes(stream), new Uint8Array([1, 2, 3]))

    const empty = Readable.from([])
    assert.strictEqual(await readAllBytes(empty), EMPTY_BYTES)

    const oversized = Readable.from([new Uint8Array([1, 2, 3])])
    await assert.rejects(() => readAllBytes(oversized, { maxBytes: 2 }), /exceeded max bytes limit/)
})

test('coercion helpers validate primitive and bytes types', () => {
    assert.equal(asNumber(12, 'n'), 12)
    assert.equal(asOptionalNumber(undefined), undefined)
    assert.throws(() => asNumber('12', 'n'), /invalid number value/)

    assert.equal(asString('x', 's'), 'x')
    assert.equal(asOptionalString(null), undefined)
    assert.throws(() => asString(1, 's'), /invalid string value/)

    const bytes = asBytes(new Uint8Array([1]), 'b')
    assert.deepEqual(bytes, new Uint8Array([1]))
    assert.equal(asOptionalBytes(undefined), undefined)
    assert.throws(() => asBytes('x', 'b'), /invalid bytes value/)

    assert.equal(toBoolOrUndef(undefined), undefined)
    assert.equal(toBoolOrUndef(0), false)
    assert.equal(toBoolOrUndef(1), true)

    assert.equal(resolvePositive(2, 1, 'x'), 2)
    assert.equal(resolvePositive(undefined, 3, 'x'), 3)
    assert.throws(() => resolvePositive(0, 3, 'x'), /positive safe integer/)
    assert.equal(resolveOptionalPositive(2, 'x'), 2)
    assert.equal(resolveOptionalPositive(undefined, 'x'), undefined)
    assert.throws(() => resolveOptionalPositive(0, 'x'), /positive safe integer/)
    assert.throws(() => resolveOptionalPositive(1.5, 'x'), /positive safe integer/)
})

test('lenient coercion (tryAs*) handles missing, empty and wrong-typed inputs', () => {
    // tryAsString: empty/whitespace/non-string → null
    assert.equal(tryAsString('hi'), 'hi')
    assert.equal(tryAsString(''), null)
    assert.equal(tryAsString(undefined), null)
    assert.equal(tryAsString(null), null)
    assert.equal(tryAsString(42), null)

    // tryAsNumber: empty/whitespace strings must not collapse to 0
    assert.equal(tryAsNumber(42), 42)
    assert.equal(tryAsNumber('42'), 42)
    assert.equal(tryAsNumber('  7  '), 7)
    assert.equal(tryAsNumber(''), null)
    assert.equal(tryAsNumber('   '), null)
    assert.equal(tryAsNumber('abc'), null)
    assert.equal(tryAsNumber(undefined), null)
    assert.equal(tryAsNumber(Number.NaN), null)
    assert.equal(tryAsNumber(Number.POSITIVE_INFINITY), null)

    // tryAsRecord: arrays/null/primitives → null; plain object → passes
    assert.deepEqual(tryAsRecord({ a: 1 }), { a: 1 })
    assert.equal(tryAsRecord(null), null)
    assert.equal(tryAsRecord([1, 2]), null)
    assert.equal(tryAsRecord('x'), null)
    assert.equal(tryAsRecord(undefined), null)
})

test('collections helpers enforce bounds and limits', () => {
    assert.equal(resolveCleanupIntervalMs(500), 500)
    assert.equal(resolveCleanupIntervalMs(8_000), 4_000)

    assert.equal(normalizeQueryLimit(undefined, 9), 9)
    assert.equal(normalizeQueryLimit(3, 9), 3)
    assert.throws(() => normalizeQueryLimit(0, 9), /invalid query limit/)

    const map = new Map<string, number>()
    const evicted: string[] = []

    setBoundedMapEntry(map, 'a', 1, 2, (key) => evicted.push(key))
    setBoundedMapEntry(map, 'b', 2, 2, (key) => evicted.push(key))
    setBoundedMapEntry(map, 'c', 3, 2, (key) => evicted.push(key))

    assert.deepEqual([...map.keys()], ['b', 'c'])
    assert.deepEqual(evicted, ['a'])
})

test('idle sweep period is the smallest ttl / 2, clamped to [1 s, 60 s]', () => {
    assert.equal(resolveIdleSweepPeriodMs([1_000]), 1_000)
    assert.equal(resolveIdleSweepPeriodMs([1_999]), 1_000)
    assert.equal(resolveIdleSweepPeriodMs([5_000]), 2_500)
    assert.equal(resolveIdleSweepPeriodMs([30 * 60_000]), 60_000)
    assert.equal(resolveIdleSweepPeriodMs([30 * 60_000, 9_000, 5_001]), 2_500)
})

test('idle sweep clock runs one timer while sweeps are registered, and its tick only grows', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const setIntervalSpy = t.mock.method(globalThis, 'setInterval')
    const clock = new IdleSweepClock(1_000)
    const seen: number[] = []

    t.mock.timers.tick(5_000)
    assert.equal(setIntervalSpy.mock.callCount(), 0)
    assert.equal(clock.tick, 0)

    const stopFirst = clock.register((tick) => seen.push(tick))
    const stopSecond = clock.register(() => undefined)
    assert.equal(setIntervalSpy.mock.callCount(), 1)
    t.mock.timers.tick(2_000)
    assert.deepEqual(seen, [1, 2])

    stopFirst()
    t.mock.timers.tick(1_000)
    assert.equal(clock.tick, 3)
    assert.deepEqual(seen, [1, 2])

    stopSecond()
    t.mock.timers.tick(5_000)
    assert.equal(clock.tick, 3)

    const stopThird = clock.register((tick) => seen.push(tick))
    assert.equal(setIntervalSpy.mock.callCount(), 2)
    t.mock.timers.tick(1_000)
    assert.deepEqual(seen, [1, 2, 4])
    stopThird()
})

test('idle expiry index drops a key only after it sat untouched for the full ttl', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const clock = new IdleSweepClock(1_000)
    const data = new Map<string, number>()
    const index = new IdleExpiryIndex(data, { clock, ttlMs: 1_000 })
    data.set('early', 1)
    index.touch('early')
    t.mock.timers.tick(999)
    data.set('late', 2)
    index.touch('late') // same tick as 'early', 999 ms later
    data.set('refreshed', 3)
    index.touch('refreshed')

    t.mock.timers.tick(1) // t=1_000: 'late' has idled 1 ms
    assert.deepEqual([...data.keys()], ['early', 'late', 'refreshed'])
    index.touch('refreshed')

    t.mock.timers.tick(1_000) // t=2_000
    assert.deepEqual([...data.keys()], ['refreshed'])
    t.mock.timers.tick(1_000) // t=3_000
    assert.deepEqual([...data.keys()], [])
    index.detach()
})

test('idle expiry index honours each ttl on a clock shared with a shorter one', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const clock = new IdleSweepClock(2_500)
    const shortData = new Map([['k', 1]])
    const longData = new Map([['k', 1]])
    const short = new IdleExpiryIndex(shortData, { clock, ttlMs: 5_000 })
    const long = new IdleExpiryIndex(longData, { clock, ttlMs: 120_000 })
    short.touch('k')
    long.touch('k')

    t.mock.timers.tick(5_000)
    assert.equal(shortData.size, 1)
    t.mock.timers.tick(2_500) // t=7_500
    assert.equal(shortData.size, 0)

    t.mock.timers.tick(120_000 - 7_500)
    assert.equal(longData.size, 1)
    t.mock.timers.tick(2_500) // t=122_500
    assert.equal(longData.size, 0)
    short.detach()
    long.detach()
})

test('idle expiry index keeps data in access order, one move per key per tick', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const clock = new IdleSweepClock(1_000)
    const data = new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3]
    ])
    const index = new IdleExpiryIndex(data, { clock, ttlMs: 60_000 })
    for (const key of ['a', 'b', 'c']) index.touch(key)

    index.touch('a')
    assert.deepEqual([...data.keys()], ['a', 'b', 'c'])
    t.mock.timers.tick(1_000)
    index.touch('a')
    assert.deepEqual([...data.keys()], ['b', 'c', 'a'])
    index.detach()
})

test('idle expiry index stops tracking deleted and cleared keys, and stops on detach', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const clock = new IdleSweepClock(1_000)
    const data = new Map([
        ['deleted', 1],
        ['kept', 2]
    ])
    const index = new IdleExpiryIndex(data, { clock, ttlMs: 1_000 })
    index.touch('deleted')
    index.touch('kept')
    index.delete('deleted')
    t.mock.timers.tick(2_000)
    assert.deepEqual([...data.keys()], ['deleted'])

    data.set('cleared', 3)
    index.touch('cleared')
    index.clear()
    t.mock.timers.tick(2_000)
    assert.deepEqual([...data.keys()], ['deleted', 'cleared'])

    data.set('detached', 4)
    index.touch('detached')
    index.detach()
    t.mock.timers.tick(10_000)
    assert.equal(clock.tick, 4)
    assert.ok(data.has('detached'))
})

test('base64 wrappers enforce required field semantics', () => {
    const bytes = new Uint8Array([1, 2, 3])
    const encoded = bytesToBase64(bytes)

    assert.deepEqual(base64ToBytesChecked(encoded, 'field'), bytes)
    assert.throws(() => base64ToBytesChecked('', 'field'), /invalid base64 payload for field/)

    assert.deepEqual(decodeProtoBytes(bytes, 'proto'), bytes)
    assert.deepEqual(decodeProtoBytes(encoded, 'proto'), bytes)
    assert.throws(() => decodeProtoBytes(undefined, 'proto'), /missing protobuf bytes field proto/)
})

test('primitives helpers normalize errors and long/safe numbers', () => {
    assert.equal(toError('oops').message, 'oops')
    assert.equal(toError(new Error('x')).message, 'x')
    assert.equal(toError(1).message, '1')
    assert.equal(toError({ message: 'from object' }).message, 'from object')
    assert.equal(toError({ code: 'EFAIL' }).message, 'unknown error (EFAIL)')

    assert.equal(toSafeNumber(12, 'field'), 12)
    assert.equal(toSafeNumber({ toNumber: () => 33 }, 'field'), 33)
    assert.throws(() => toSafeNumber(undefined, 'field'), /missing field/)

    assert.equal(longToNumber(undefined), 0)
    assert.equal(longToNumber({ toNumber: () => 44 }), 44)
    assert.throws(() => longToNumber(Number.MAX_SAFE_INTEGER + 1), /invalid long numeric value/)
})

test('runtime return deterministic outputs', async (t) => {
    const os = getRuntimeOsDisplayName()
    assert.equal(typeof os, 'string')
    assert.ok(os.length > 0)

    t.mock.timers.enable({ apis: ['setTimeout'] })
    let resolved = false
    const delayed = delay(5).then(() => {
        resolved = true
    })
    t.mock.timers.tick(4)
    await Promise.resolve()
    assert.equal(resolved, false)
    t.mock.timers.tick(1)
    await delayed
    assert.equal(resolved, true)

    assert.equal(TEXT_DECODER.decode(TEXT_ENCODER.encode('ok')), 'ok')
})
