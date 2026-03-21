import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'

import { delay } from '@util/async'
import { base64ToBytesChecked, bytesToBase64, decodeProtoBytes } from '@util/bytes'
import {
    base64ToBytes as base64ToBytesCore,
    bytesToBase64 as bytesToBase64Core,
    bytesToBase64UrlSafe,
    bytesToHex,
    concatBytes,
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
    resolvePositive,
    toBoolOrUndef
} from '@util/coercion'
import {
    normalizeQueryLimit,
    resolveCleanupIntervalMs,
    setBoundedMapEntry
} from '@util/collections'
import { toError, longToNumber, toSafeNumber } from '@util/primitives'
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
