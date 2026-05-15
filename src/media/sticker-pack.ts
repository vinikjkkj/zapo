import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'

import { TEXT_ENCODER } from '@util/bytes'

const SIGNATURE_LOCAL_FILE = 0x04034b50
const SIGNATURE_CENTRAL_DIR = 0x02014b50
const SIGNATURE_END_OF_CENTRAL_DIR = 0x06054b50
const COMPRESSION_STORED = 0
const VERSION_NEEDED = 20
const LOCAL_HEADER_SIZE = 30
const CENTRAL_HEADER_SIZE = 46
const EOCD_SIZE = 22

const CRC32_TABLE: ReadonlyArray<number> = (() => {
    const table = new Array<number>(256)
    for (let i = 0; i < 256; i += 1) {
        let c = i
        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        }
        table[i] = c >>> 0
    }
    return table
})()

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff
    for (let i = 0; i < bytes.byteLength; i += 1) {
        crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
}

export interface StickerPackZipEntry {
    readonly fileName: string
    readonly source: Uint8Array | string
}

function validateEntries(entries: readonly StickerPackZipEntry[]): void {
    if (entries.length === 0) {
        throw new Error('sticker pack zip requires at least one entry')
    }
    const seen = new Set<string>()
    for (const entry of entries) {
        if (!entry.fileName) {
            throw new Error('sticker pack zip entry requires a non-empty fileName')
        }
        if (seen.has(entry.fileName)) {
            throw new Error(`sticker pack zip has duplicate fileName: ${entry.fileName}`)
        }
        seen.add(entry.fileName)
    }
}

async function loadEntryBytes(source: Uint8Array | string): Promise<Uint8Array> {
    if (typeof source === 'string') {
        const buf = await readFile(source)
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    }
    return source
}

function buildLocalHeader(name: Uint8Array, crc: number, dataLength: number): Uint8Array {
    const out = new Uint8Array(LOCAL_HEADER_SIZE + name.byteLength)
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
    view.setUint32(0, SIGNATURE_LOCAL_FILE, true)
    view.setUint16(4, VERSION_NEEDED, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, COMPRESSION_STORED, true)
    view.setUint16(10, 0, true)
    view.setUint16(12, 0, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, dataLength, true)
    view.setUint32(22, dataLength, true)
    view.setUint16(26, name.byteLength, true)
    view.setUint16(28, 0, true)
    out.set(name, LOCAL_HEADER_SIZE)
    return out
}

interface CentralEntry {
    readonly name: Uint8Array
    readonly crc: number
    readonly dataLength: number
    readonly localOffset: number
}

function buildCentralDirectory(entries: readonly CentralEntry[]): Uint8Array {
    let totalSize = 0
    for (const entry of entries) totalSize += CENTRAL_HEADER_SIZE + entry.name.byteLength
    const out = new Uint8Array(totalSize)
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
    let offset = 0
    for (const entry of entries) {
        view.setUint32(offset, SIGNATURE_CENTRAL_DIR, true)
        view.setUint16(offset + 4, VERSION_NEEDED, true)
        view.setUint16(offset + 6, VERSION_NEEDED, true)
        view.setUint16(offset + 8, 0, true)
        view.setUint16(offset + 10, COMPRESSION_STORED, true)
        view.setUint16(offset + 12, 0, true)
        view.setUint16(offset + 14, 0, true)
        view.setUint32(offset + 16, entry.crc, true)
        view.setUint32(offset + 20, entry.dataLength, true)
        view.setUint32(offset + 24, entry.dataLength, true)
        view.setUint16(offset + 28, entry.name.byteLength, true)
        view.setUint16(offset + 30, 0, true)
        view.setUint16(offset + 32, 0, true)
        view.setUint16(offset + 34, 0, true)
        view.setUint16(offset + 36, 0, true)
        view.setUint32(offset + 38, 0, true)
        view.setUint32(offset + 42, entry.localOffset, true)
        offset += CENTRAL_HEADER_SIZE
        out.set(entry.name, offset)
        offset += entry.name.byteLength
    }
    return out
}

function buildEocd(
    entryCount: number,
    centralDirSize: number,
    centralDirOffset: number
): Uint8Array {
    const out = new Uint8Array(EOCD_SIZE)
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
    view.setUint32(0, SIGNATURE_END_OF_CENTRAL_DIR, true)
    view.setUint16(4, 0, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, entryCount, true)
    view.setUint16(10, entryCount, true)
    view.setUint32(12, centralDirSize, true)
    view.setUint32(16, centralDirOffset, true)
    view.setUint16(20, 0, true)
    return out
}

export function createStickerPackZipStream(entries: readonly StickerPackZipEntry[]): Readable {
    validateEntries(entries)
    return Readable.from(zipChunks(entries))
}

async function* zipChunks(entries: readonly StickerPackZipEntry[]): AsyncGenerator<Uint8Array> {
    const central: CentralEntry[] = []
    let offset = 0
    for (const entry of entries) {
        const data = await loadEntryBytes(entry.source)
        const name = TEXT_ENCODER.encode(entry.fileName)
        const crc = crc32(data)
        const header = buildLocalHeader(name, crc, data.byteLength)
        yield header
        yield data
        central.push({ name, crc, dataLength: data.byteLength, localOffset: offset })
        offset += header.byteLength + data.byteLength
    }
    const centralDir = buildCentralDirectory(central)
    yield centralDir
    yield buildEocd(central.length, centralDir.byteLength, offset)
}
