import { WA_WAM_WIRE_FORMAT } from '@vinikjkkj/wa-wam'
import { TEXT_ENCODER } from 'zapo-js/util'

import type { BinaryWriter } from './binary-writer.js'

/** How a value is encoded on the wire (from the registry field/global `type`). */
export type WamValueKind = 'int' | 'float' | 'string' | 'bool'

const MARK = WA_WAM_WIRE_FORMAT.markers
const ENC = WA_WAM_WIRE_FORMAT.valueEncodingBits

const INT32_MIN = -2_147_483_648
/** Exclusive upper bound (2^31), mirroring WA Web's `r < 2147483648` int32 check in WAWamBuffer. */
const INT32_UPPER_EXCLUSIVE = 2_147_483_648

/** Writes a TLV tag: marker/encoding byte + id (uint8, or extended-flag + uint16 for id >= 256). */
function writeTag(writer: BinaryWriter, id: number, markerWithEncoding: number): void {
    if (id < 256) {
        writer.writeUint8(markerWithEncoding)
        writer.writeUint8(id)
    } else {
        writer.writeUint8(markerWithEncoding | MARK.extendedIdFlag)
        writer.writeUint16(id)
    }
}

/** Writes an integer value with the smallest matching width class. */
function writeInt(writer: BinaryWriter, id: number, marker: number, value: number): void {
    if (value === 0) {
        writeTag(writer, id, ENC.intZero | marker)
    } else if (value === 1) {
        writeTag(writer, id, ENC.intOne | marker)
    } else if (value >= -128 && value < 128) {
        writeTag(writer, id, ENC.int8 | marker)
        writer.writeInt8(value)
    } else if (value >= -32_768 && value < 32_768) {
        writeTag(writer, id, ENC.int16 | marker)
        writer.writeInt16(value)
    } else if (value >= INT32_MIN && value < INT32_UPPER_EXCLUSIVE) {
        writeTag(writer, id, ENC.int32 | marker)
        writer.writeInt32(value)
    } else {
        writeTag(writer, id, ENC.int64 | marker)
        writer.writeInt64(value)
    }
}

function writeFloat(writer: BinaryWriter, id: number, marker: number, value: number): void {
    writeTag(writer, id, ENC.float64 | marker)
    writer.writeFloat64(value)
}

function writeStringValue(writer: BinaryWriter, id: number, marker: number, value: string): void {
    const bytes = TEXT_ENCODER.encode(value)
    const length = bytes.length
    if (length < 256) {
        writeTag(writer, id, ENC.stringShort | marker)
        writer.writeUint8(length)
    } else if (length < 65_536) {
        writeTag(writer, id, ENC.stringMedium | marker)
        writer.writeUint16(length)
    } else {
        writeTag(writer, id, ENC.stringLong | marker)
        writer.writeUint32(length)
    }
    writer.writeBytes(bytes)
}

/** Writes a global-attribute TLV (marker `0`): numbers as int, booleans as int 0/1, `null` as tag-only. */
export function writeGlobalAttribute(
    writer: BinaryWriter,
    id: number,
    value: number | string | boolean | null
): void {
    const marker = MARK.globalAttribute
    if (value === null) {
        writeTag(writer, id, ENC.null | marker)
    } else if (typeof value === 'string') {
        writeStringValue(writer, id, marker, value)
    } else if (typeof value === 'boolean') {
        writeInt(writer, id, marker, value ? 1 : 0)
    } else {
        writeInt(writer, id, marker, value)
    }
}

/** Writes the event-header TLV (marker `1`), value = sampling weight; sets the last-flag when it has no fields. */
export function writeEventHeader(
    writer: BinaryWriter,
    id: number,
    weight: number,
    hasFields: boolean
): void {
    const marker = hasFields ? MARK.event : MARK.event | MARK.lastFlag
    writeInt(writer, id, marker, weight)
}

/** Writes a field TLV (marker `2`), `kind`-encoded; the last field in a group sets the last-flag. */
export function writeField(
    writer: BinaryWriter,
    id: number,
    kind: WamValueKind,
    value: number | string | boolean,
    isLast: boolean
): void {
    const marker = isLast ? MARK.field | MARK.lastFlag : MARK.field
    switch (kind) {
        case 'string':
            writeStringValue(writer, id, marker, value as string)
            return
        case 'float':
            writeFloat(writer, id, marker, value as number)
            return
        case 'bool':
            writeInt(writer, id, marker, value ? 1 : 0)
            return
        default:
            writeInt(writer, id, marker, value as number)
    }
}
