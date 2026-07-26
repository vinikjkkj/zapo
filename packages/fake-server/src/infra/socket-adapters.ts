/** Carrier adapters: WebSocket (companion transport) and raw TCP (mobile). */

import type { Socket } from 'node:net'

import type { WebSocket } from 'ws'

import { TEXT_DECODER } from '../transport/util'

import type { WaFakeSocketLike } from './WaFakeConnection'

/**
 * Adapts a `ws` socket to {@link WaFakeSocketLike}. Owns the two WebSocket
 * quirks the rest of the server should not know about: a message can arrive as
 * a fragment array, and a text frame is a protocol violation here because every
 * WhatsApp frame is binary.
 */
export function createWebSocketAdapter(socket: WebSocket): WaFakeSocketLike {
    return {
        send: (frame) => socket.send(frame),
        close: (code, reason) => socket.close(code, reason),
        listen: (events) => {
            socket.on('message', (data, isBinary) => {
                if (!isBinary) {
                    events.onError(new Error('received unexpected text frame'))
                    return
                }
                events.onFrame(toFrameBytes(data))
            })
            socket.on('close', (code, reason) => {
                events.onClose({ code, reason: TEXT_DECODER.decode(reason) })
            })
            socket.on('error', (error) => {
                events.onError(error)
            })
        }
    }
}

/**
 * Adapts a Node TCP socket to {@link WaFakeSocketLike} for the mobile
 * transport. A TCP stream has no message boundaries and no close codes: every
 * chunk is forwarded as-is (the frame codec above reassembles them) and the
 * code/reason the server asked for is replayed when the socket finally closes.
 */
export function createTcpSocketAdapter(socket: Socket): WaFakeSocketLike {
    let closeCode = 1000
    let closeReason = ''
    return {
        send: (frame) => {
            socket.write(frame)
        },
        close: (code, reason) => {
            closeCode = code
            closeReason = reason
            socket.end()
        },
        listen: (events) => {
            socket.on('data', (chunk: Uint8Array) => {
                events.onFrame(chunk)
            })
            socket.on('close', () => {
                events.onClose({ code: closeCode, reason: closeReason })
            })
            socket.on('error', (error) => {
                events.onError(error)
            })
        }
    }
}

function toFrameBytes(data: Uint8Array | ArrayBuffer | readonly Uint8Array[]): Uint8Array {
    if (data instanceof Uint8Array) {
        return data
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data)
    }
    let total = 0
    for (const part of data) {
        total += part.byteLength
    }
    const out = new Uint8Array(total)
    let offset = 0
    for (const part of data) {
        out.set(part, offset)
        offset += part.byteLength
    }
    return out
}
