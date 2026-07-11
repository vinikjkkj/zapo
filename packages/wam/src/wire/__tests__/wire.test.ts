import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BinaryWriter } from '../binary-writer.js'
import { writeGlobalAttribute } from '../encoder.js'
import { WamBatch } from '../WamBatch.js'

const hex = (bytes: Uint8Array): string =>
    Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

function encodeGlobal(id: number, value: number | string | boolean | null): string {
    const writer = new BinaryWriter()
    writeGlobalAttribute(writer, id, value)
    return hex(writer.toBytes())
}

test('BinaryWriter writes big-endian integers and raw utf-8', () => {
    const writer = new BinaryWriter(4)
    writer.writeUint8(0x05)
    writer.writeUint16(0x0102)
    writer.writeUint32(0x0a0b0c0d)
    writer.writeInt8(-1)
    writer.writeString('hi')
    assert.equal(hex(writer.toBytes()), '05' + '0102' + '0a0b0c0d' + 'ff' + '6869')
})

test('BinaryWriter clamps a zero initial capacity so ensure() cannot loop forever', () => {
    const writer = new BinaryWriter(0)
    writer.writeUint32(0x0a0b0c0d)
    assert.equal(hex(writer.toBytes()), '0a0b0c0d')
})

test('global attribute value encodings match the WAM wire classes', () => {
    assert.equal(encodeGlobal(5, 0), '1005')
    assert.equal(encodeGlobal(5, 1), '2005')
    assert.equal(encodeGlobal(5, 100), '3005' + '64')
    assert.equal(encodeGlobal(5, 300), '4005' + '012c')
    assert.equal(encodeGlobal(5, 'hi'), '8005' + '02' + '6869')
    assert.equal(encodeGlobal(5, null), '0005')
    assert.equal(encodeGlobal(5, true), '2005')
    assert.equal(encodeGlobal(300, 1), '28' + '012c')
})

test('WamBatch serialises header + commitTime + event + field byte-for-byte', () => {
    const batch = new WamBatch('regular', 7, 1, new Map())
    batch.writeEvent(100_000, 472, 1, [{ id: 1, kind: 'int', value: 3 }])
    assert.equal(batch.hasEvents(), true)
    assert.equal(
        hex(batch.toBytes()),
        '57414d' + '05' + '07' + '0001' + '00' + '302f64' + '2901d8' + '360103'
    )
})

test('WamBatch delta-encodes globals: unchanged values are not re-emitted', () => {
    const batch = new WamBatch('regular', 1, 1, new Map([[3543, 42]]))
    const baseline = batch.size()
    batch.setGlobal(3543, 42)
    assert.equal(batch.size(), baseline, 'unchanged global must not be re-emitted')
    batch.setGlobal(3543, 99)
    assert.ok(batch.size() > baseline, 'changed global must be re-emitted')
})
