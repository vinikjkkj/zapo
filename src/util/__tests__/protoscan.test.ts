import assert from 'node:assert/strict'
import test from 'node:test'

import { proto } from '@proto'
import { concatBytes } from '@util/bytes'
import {
    PROTO_WIRE_TYPES,
    type ProtoScanField,
    readProtoVarint,
    scanProtoFields
} from '@util/protoscan'

function collect(bytes: Uint8Array): ProtoScanField[] {
    const fields: ProtoScanField[] = []
    scanProtoFields(bytes, 0, bytes.length, (field) => fields.push({ ...field }))
    return fields
}

test('scanProtoFields walks every wire type in order', () => {
    const bytes = new Uint8Array([
        0x08,
        0x96,
        0x01, // field 1 varint 150
        0x12,
        0x03,
        0x61,
        0x62,
        0x63, // field 2 LEN "abc"
        0x19,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8, // field 3 fixed64
        0x25,
        9,
        9,
        9,
        9 // field 4 fixed32
    ])
    const fields = collect(bytes)
    assert.equal(fields.length, 4)
    assert.deepEqual(
        fields.map((f) => [f.fieldNumber, f.wireType]),
        [
            [1, PROTO_WIRE_TYPES.VARINT],
            [2, PROTO_WIRE_TYPES.LEN],
            [3, PROTO_WIRE_TYPES.FIXED64],
            [4, PROTO_WIRE_TYPES.FIXED32]
        ]
    )
    assert.equal(fields[0].varintValue, 150)
    assert.deepEqual(
        Array.from(bytes.subarray(fields[1].valueStart, fields[1].valueEnd)),
        [0x61, 0x62, 0x63]
    )
})

test('scanProtoFields matches protobufjs framing on a real message', () => {
    const encoded = proto.HistorySync.encode({
        syncType: proto.HistorySync.HistorySyncType.RECENT,
        chunkOrder: 3,
        progress: 77,
        pushnames: [{ id: '5511@s.whatsapp.net', pushname: 'Vini' }]
    }).finish()
    const fields = collect(encoded)
    const byNumber = new Map(fields.map((f) => [f.fieldNumber, f]))
    assert.equal(byNumber.get(1)?.varintValue, proto.HistorySync.HistorySyncType.RECENT)
    assert.equal(byNumber.get(5)?.varintValue, 3)
    assert.equal(byNumber.get(6)?.varintValue, 77)
    const pushname = byNumber.get(7)
    assert.ok(pushname)
    const decoded = proto.Pushname.decode(encoded.subarray(pushname.valueStart, pushname.valueEnd))
    assert.equal(decoded.pushname, 'Vini')
})

test('scanProtoFields rejects truncated and malformed input', () => {
    assert.throws(() => collect(new Uint8Array([0x08])), /unexpected end/)
    assert.throws(() => collect(new Uint8Array([0x12, 0x05, 0x61])), /length-delimited/)
    assert.throws(() => collect(new Uint8Array([0x19, 1, 2])), /fixed64/)
    assert.throws(() => collect(new Uint8Array([0x0c])), /wire type/)
    assert.throws(() => collect(new Uint8Array([0x00])), /field number/)
})

test('readProtoVarint decodes multi-byte values and enforces bounds', () => {
    const bytes = new Uint8Array([0xac, 0x02])
    assert.deepEqual(readProtoVarint(bytes, 0, bytes.length), { value: 300, next: 2 })
    assert.throws(() => readProtoVarint(new Uint8Array([0x80]), 0, 1), /unexpected end/)
    const tooBig = concatBytes([new Uint8Array(9).fill(0xff), new Uint8Array([0x01])])
    assert.throws(() => readProtoVarint(tooBig, 0, tooBig.length), /safe integer|supported range/)
})
