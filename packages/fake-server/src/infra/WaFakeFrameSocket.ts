/**
 * WhatsApp Web framing layer.
 *
 * Source:
 *   /deobfuscated/WAF/WAFrameSocket.js
 *   /deobfuscated/WAWebOpenC/WAWebOpenChatSocket.js (lines 13-16 for the prologue)
 *
 * Wire layout
 * -----------
 * Connection start, optional routing prefix:
 *     0xED  <hi:u8>  <lo:u16-be>  <routingBytes...>
 *
 * Connection start, mandatory version header (4 bytes):
 *     "W"  "A"  0x06  0x03
 *     - 0x06 = protocol version P
 *     - 0x03 = WAP dictionary version
 *
 * After the prologue, every frame in either direction is wrapped in a 3-byte
 * big-endian length prefix:
 *     <hi:u8>  <lo:u16-be>  <bodyBytes...>     // body length up to (1 << 24) - 1
 *
 * The frame socket is intentionally protocol-naive: it does not interpret
 * frame contents (those are noise handshake or stanza payloads). It only
 * exposes a callback when a complete frame arrives and an action to write
 * one out.
 *
 * This file is server scaffolding plus a /deobfuscated mirror of the framing.
 */

import type { WaFakeConnection } from './WaFakeConnection'

const PROLOGUE_W = 0x57
const PROLOGUE_A = 0x41
const PROLOGUE_PROTOCOL_VERSION = 0x06
const PROLOGUE_DICT_VERSION = 0x03
const ROUTING_MAGIC = 0xed
const VERSION_HEADER_LENGTH = 4
const FRAME_LENGTH_PREFIX_BYTES = 3
const MAX_FRAME_LENGTH = 1 << 24

export interface WaFakeClientPrologue {
    readonly protocolVersion: number
    readonly dictVersion: number
    readonly routingInfo: Uint8Array | null
}

export interface WaFakeFrameSocketHandlers {
    readonly onPrologue?: (prologue: WaFakeClientPrologue) => void
    readonly onFrame?: (frame: Uint8Array) => void
    readonly onClose?: (info: { readonly code: number; readonly reason: string }) => void
    readonly onError?: (error: Error) => void
}

export class WaFakeFrameSocket {
    private readonly connection: WaFakeConnection
    private handlers: WaFakeFrameSocketHandlers = {}
    private inboundBuffer: Uint8Array = new Uint8Array(0)
    private prologueParsed = false

    public constructor(connection: WaFakeConnection) {
        this.connection = connection
        this.connection.setHandlers({
            onFrame: (bytes) => this.handleInboundBytes(bytes),
            onClose: (info) => this.handlers.onClose?.(info),
            onError: (error) => this.handlers.onError?.(error)
        })
    }

    public setHandlers(handlers: WaFakeFrameSocketHandlers): void {
        this.handlers = handlers
    }

    public sendFrame(body: Uint8Array): void {
        if (body.byteLength >= MAX_FRAME_LENGTH) {
            throw new Error(`frame too large: ${body.byteLength} bytes`)
        }
        const out = new Uint8Array(FRAME_LENGTH_PREFIX_BYTES + body.byteLength)
        out[0] = (body.byteLength >> 16) & 0xff
        out[1] = (body.byteLength >> 8) & 0xff
        out[2] = body.byteLength & 0xff
        out.set(body, FRAME_LENGTH_PREFIX_BYTES)
        this.connection.sendFrame(out)
    }

    private handleInboundBytes(chunk: Uint8Array): void {
        try {
            this.inboundBuffer = concatBytes(this.inboundBuffer, chunk)
            if (!this.prologueParsed) {
                if (!this.tryParsePrologue()) {
                    return
                }
            }
            this.drainFrames()
        } catch (error) {
            this.handlers.onError?.(error instanceof Error ? error : new Error(String(error)))
        }
    }

    private tryParsePrologue(): boolean {
        const buffer = this.inboundBuffer
        let offset = 0
        let routingInfo: Uint8Array | null = null

        if (buffer.byteLength === 0) {
            return false
        }

        if (buffer[0] === ROUTING_MAGIC) {
            // Need at least magic + 3 length bytes to know the routing payload size.
            if (buffer.byteLength < 4) {
                return false
            }
            const routingLen = (buffer[1] << 16) | (buffer[2] << 8) | buffer[3]
            if (buffer.byteLength < 4 + routingLen + VERSION_HEADER_LENGTH) {
                return false
            }
            routingInfo = buffer.slice(4, 4 + routingLen)
            offset = 4 + routingLen
        } else if (buffer.byteLength < VERSION_HEADER_LENGTH) {
            return false
        }

        const versionStart = offset
        const w = buffer[versionStart]
        const a = buffer[versionStart + 1]
        if (w !== PROLOGUE_W || a !== PROLOGUE_A) {
            throw new Error(`invalid prologue magic: expected "WA", got ${hex(w)} ${hex(a)}`)
        }
        const protocolVersion = buffer[versionStart + 2]
        const dictVersion = buffer[versionStart + 3]
        if (
            protocolVersion !== PROLOGUE_PROTOCOL_VERSION ||
            dictVersion !== PROLOGUE_DICT_VERSION
        ) {
            // Accept and report — we don't enforce a specific version yet.
        }

        offset = versionStart + VERSION_HEADER_LENGTH
        this.inboundBuffer = buffer.slice(offset)
        this.prologueParsed = true
        this.handlers.onPrologue?.({ protocolVersion, dictVersion, routingInfo })
        return true
    }

    private drainFrames(): void {
        while (true) {
            const buffer = this.inboundBuffer
            if (buffer.byteLength < FRAME_LENGTH_PREFIX_BYTES) {
                return
            }
            const length = (buffer[0] << 16) | (buffer[1] << 8) | buffer[2]
            if (length >= MAX_FRAME_LENGTH) {
                throw new Error(`frame too large: ${length} bytes`)
            }
            const total = FRAME_LENGTH_PREFIX_BYTES + length
            if (buffer.byteLength < total) {
                return
            }
            const body = buffer.slice(FRAME_LENGTH_PREFIX_BYTES, total)
            this.inboundBuffer = buffer.slice(total)
            this.handlers.onFrame?.(body)
        }
    }
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    if (a.byteLength === 0) return b
    if (b.byteLength === 0) return a
    const out = new Uint8Array(a.byteLength + b.byteLength)
    out.set(a, 0)
    out.set(b, a.byteLength)
    return out
}

function hex(byte: number | undefined): string {
    if (byte === undefined) return 'undefined'
    return `0x${byte.toString(16).padStart(2, '0')}`
}
