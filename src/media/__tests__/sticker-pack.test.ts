import assert from 'node:assert/strict'
import { type Readable } from 'node:stream'
import test from 'node:test'

import { createStickerPackZipStream, type StickerPackZipEntry } from '@media/sticker-pack'
import { concatBytes } from '@util/bytes'

const ZIP_LOCAL_FILE = 0x04034b50
const ZIP_CENTRAL_DIR = 0x02014b50
const ZIP_EOCD = 0x06054b50

function readUint32LE(bytes: Uint8Array, offset: number): number {
    return (
        (bytes[offset] |
            (bytes[offset + 1] << 8) |
            (bytes[offset + 2] << 16) |
            (bytes[offset + 3] << 24)) >>>
        0
    )
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8)
}

function findEocd(zip: Uint8Array): number {
    for (let i = zip.byteLength - 22; i >= 0; i -= 1) {
        if (readUint32LE(zip, i) === ZIP_EOCD) return i
    }
    throw new Error('EOCD not found')
}

interface ParsedEntry {
    readonly fileName: string
    readonly bytes: Uint8Array
}

function parseZip(zip: Uint8Array): readonly ParsedEntry[] {
    const eocd = findEocd(zip)
    const entryCount = readUint16LE(zip, eocd + 10)
    const centralDirSize = readUint32LE(zip, eocd + 12)
    const centralDirOffset = readUint32LE(zip, eocd + 16)
    assert.equal(centralDirOffset + centralDirSize, eocd, 'central dir abuts EOCD')

    const entries: ParsedEntry[] = []
    let cursor = centralDirOffset
    for (let i = 0; i < entryCount; i += 1) {
        assert.equal(readUint32LE(zip, cursor), ZIP_CENTRAL_DIR, 'central dir signature')
        const compressedSize = readUint32LE(zip, cursor + 20)
        const nameLen = readUint16LE(zip, cursor + 28)
        const extraLen = readUint16LE(zip, cursor + 30)
        const commentLen = readUint16LE(zip, cursor + 32)
        const localOffset = readUint32LE(zip, cursor + 42)
        const fileName = new TextDecoder().decode(zip.subarray(cursor + 46, cursor + 46 + nameLen))

        assert.equal(readUint32LE(zip, localOffset), ZIP_LOCAL_FILE, 'local file signature')
        const localNameLen = readUint16LE(zip, localOffset + 26)
        const localExtraLen = readUint16LE(zip, localOffset + 28)
        const dataStart = localOffset + 30 + localNameLen + localExtraLen
        entries.push({
            fileName,
            bytes: zip.subarray(dataStart, dataStart + compressedSize)
        })
        cursor += 46 + nameLen + extraLen + commentLen
    }
    return entries
}

async function drainZip(entries: readonly StickerPackZipEntry[]): Promise<Uint8Array> {
    const stream = createStickerPackZipStream(entries)
    return concatBytes(await collectChunks(stream))
}

async function collectChunks(stream: Readable): Promise<readonly Uint8Array[]> {
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
        chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as Buffer))
    }
    return chunks
}

test('createStickerPackZipStream round-trips entries and produces a valid EOCD', async () => {
    const stickers: StickerPackZipEntry[] = [
        { fileName: 'sticker0.webp', source: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) },
        { fileName: 'sticker1.webp', source: new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 8, 7, 6]) }
    ]
    const zip = await drainZip(stickers)
    const parsed = parseZip(zip)
    assert.equal(parsed.length, stickers.length)
    for (let i = 0; i < stickers.length; i += 1) {
        assert.equal(parsed[i].fileName, stickers[i].fileName)
        assert.deepEqual(parsed[i].bytes, stickers[i].source)
    }
})

test('createStickerPackZipStream rejects empty input, duplicate names, and empty names', () => {
    assert.throws(() => createStickerPackZipStream([]), /at least one entry/)
    assert.throws(
        () =>
            createStickerPackZipStream([
                { fileName: 'a.webp', source: new Uint8Array([1]) },
                { fileName: 'a.webp', source: new Uint8Array([2]) }
            ]),
        /duplicate fileName/
    )
    assert.throws(
        () => createStickerPackZipStream([{ fileName: '', source: new Uint8Array([1]) }]),
        /non-empty fileName/
    )
})

test('createStickerPackZipStream writes uncompressed (stored) entries so bytes survive verbatim', async () => {
    const original = new Uint8Array(2_048)
    for (let i = 0; i < original.length; i += 1) original[i] = (i * 7) & 0xff

    const zip = await drainZip([{ fileName: 'big.webp', source: original }])
    const parsed = parseZip(zip)
    assert.equal(parsed.length, 1)
    assert.deepEqual(parsed[0].bytes, original)
})
