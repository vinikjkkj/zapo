import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'

import { scanStreamable, WaStreamableScanner } from '@media/container'
import { WaMediaCrypto } from '@media/crypto/WaMediaCrypto'

const TEXT = new TextEncoder()

function box(type: string, payloadLength: number, payload?: Uint8Array): Uint8Array {
    const size = 8 + payloadLength
    const out = new Uint8Array(size)
    const view = new DataView(out.buffer)
    view.setUint32(0, size)
    out.set(TEXT.encode(type), 4)
    if (payload) out.set(payload.subarray(0, payloadLength), 8)
    return out
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.byteLength
    }
    return out
}

const FTYP = box('ftyp', 24)
const MOOV = box('moov', 120)
const MDAT = box('mdat', 4_096)
const FREE = box('free', 0)

test('scanStreamable accepts an mp4 whose moov precedes mdat', () => {
    assert.equal(scanStreamable(concat(FTYP, MOOV, MDAT)), true)
    assert.equal(scanStreamable(concat(FTYP, FREE, MOOV, MDAT)), true)
})

test('scanStreamable rejects an mp4 whose mdat precedes moov', () => {
    assert.equal(scanStreamable(concat(FTYP, MDAT, MOOV)), false)
    assert.equal(scanStreamable(concat(FTYP, FREE, MDAT, MOOV)), false)
})

test('scanStreamable leaves non-iso-bmff payloads streamable', () => {
    assert.equal(scanStreamable(TEXT.encode('OggS\x00\x02\x00\x00rest-of-the-page')), true)
    assert.equal(scanStreamable(new Uint8Array(64)), true)
})

test('scanStreamable asks for more bytes when the head is too short', () => {
    assert.equal(scanStreamable(new Uint8Array(4)), null)
    assert.equal(scanStreamable(concat(FTYP).subarray(0, 20)), null)
})

test('scanStreamable settles rather than walking past the scan budget', () => {
    const verdict = scanStreamable(concat(FTYP, box('free', 8_192), MDAT, MOOV))
    assert.equal(verdict, true)
})

test('WaStreamableScanner settles across chunk boundaries', () => {
    const payload = concat(FTYP, MDAT, MOOV)
    const scanner = new WaStreamableScanner()
    scanner.push(payload.subarray(0, 3))
    assert.equal(scanner.verdict, null)
    scanner.push(payload.subarray(3, 40))
    assert.equal(scanner.verdict, false)
    assert.equal(scanner.finish(), false)
})

test('WaStreamableScanner defaults to streamable for a payload that ends early', () => {
    const scanner = new WaStreamableScanner()
    scanner.push(new Uint8Array(2))
    assert.equal(scanner.verdict, null)
    assert.equal(scanner.finish(), true)
})

test('encryptBytes drops the sidecar for an mp4 with a trailing moov', async () => {
    const mediaKey = new Uint8Array(32).fill(7)
    const streamable = await WaMediaCrypto.encryptBytes('video', mediaKey, concat(FTYP, MOOV, MDAT))
    assert.ok((streamable.streamingSidecar?.byteLength ?? 0) > 0)

    const notStreamable = await WaMediaCrypto.encryptBytes(
        'video',
        mediaKey,
        concat(FTYP, MDAT, MOOV)
    )
    assert.equal(notStreamable.streamingSidecar, undefined)
})

test('encryptReadable drops the sidecar for an mp4 with a trailing moov', async () => {
    const mediaKey = new Uint8Array(32).fill(9)
    const encryptOnce = async (payload: Uint8Array) => {
        const { encrypted, metadata } = await WaMediaCrypto.encryptReadable(
            'video',
            mediaKey,
            Readable.from([payload.subarray(0, 16), payload.subarray(16)]),
            { sidecar: true }
        )
        encrypted.resume()
        return await metadata
    }

    const streamable = await encryptOnce(concat(FTYP, MOOV, MDAT))
    assert.ok((streamable.streamingSidecar?.byteLength ?? 0) > 0)

    const notStreamable = await encryptOnce(concat(FTYP, MDAT, MOOV))
    assert.equal(notStreamable.streamingSidecar, undefined)
})
