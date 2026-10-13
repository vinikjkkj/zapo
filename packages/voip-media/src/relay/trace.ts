import { bytesToHex, readUInt32BE } from '../bytes.js'
import type { Logger } from '../logger.js'

import type { Connection } from './leg.js'
import { formatStunResponse, isWaPong, parseStunResponse } from './stun.js'
import { readWarpFrame } from './warp-frame.js'

/** Datagram counts across every leg of a call, for diagnostics only. */
export interface RelayTraffic {
    sent: number
    pongs: number
    rtpReceived: number
    warpReceived: number
    unknownReceived: number
}

export function createRelayTraffic(): RelayTraffic {
    return { sent: 0, pongs: 0, rtpReceived: 0, warpReceived: 0, unknownReceived: 0 }
}

/** Zeroes the counts in place, since the keepalive diagnostics hold the same object. */
export function resetRelayTraffic(traffic: RelayTraffic): void {
    traffic.pongs = 0
    traffic.rtpReceived = 0
    traffic.unknownReceived = 0
    traffic.warpReceived = 0
    traffic.sent = 0
}

export function traceSend(
    logger: Logger,
    traffic: Readonly<RelayTraffic>,
    conn: Connection,
    data: ArrayBuffer
): void {
    const buf = new Uint8Array(data)
    const twoBits = (buf[0] & 0xc0) >> 6
    logger.trace('sctp relay send', {
        count: traffic.sent,
        packetType: twoBits === 0 ? 'STUN' : twoBits === 2 ? 'RTP/SRTP' : 'OTHER',
        size: data.byteLength,
        connectionId: conn.id,
        hexPrefix: bytesToHex(buf.subarray(0, 20))
    })
}

/** Logs a STUN datagram that is not a pong: its errors always, the rest at trace. */
export function logStunResponse(
    logger: Logger,
    traceEnabled: boolean,
    data: Uint8Array,
    conn: Connection
): void {
    const stunInfo = parseStunResponse(data)
    if (!stunInfo) {
        if (traceEnabled) {
            logger.trace('unparseable stun-like packet', {
                connectionId: conn.id,
                size: data.length,
                hex: bytesToHex(data.subarray(0, 80))
            })
        }
        return
    }

    if (traceEnabled) {
        logger.trace('stun response received', {
            connectionId: conn.id,
            summary: formatStunResponse(stunInfo),
            hex: bytesToHex(data)
        })
    }
    if (stunInfo.isSuccess && (stunInfo.method === 'binding' || stunInfo.method === 'allocate')) {
        logger.debug('stun binding or allocate success', {
            connectionId: conn.id,
            method: stunInfo.method
        })
    }
    if (stunInfo.isError) {
        logger.warn('stun error response', {
            connectionId: conn.id,
            errorCode: stunInfo.errorCode,
            errorReason: stunInfo.errorReason || ''
        })
    }
    if (!traceEnabled) return
    for (const attr of stunInfo.attributes) {
        logger.trace('stun attribute', {
            connectionId: conn.id,
            typeName: attr.typeName,
            type: `0x${attr.type.toString(16)}`,
            length: attr.length,
            data: bytesToHex(attr.data.subarray(0, Math.min(32, attr.data.length)))
        })
    }
}

/** The per-datagram traces; called only with trace enabled. */
export function traceReceive(
    logger: Logger,
    traffic: RelayTraffic,
    data: Uint8Array,
    conn: Connection,
    twoBits: number,
    framed: boolean
): void {
    const count = conn.stats.receivedPackets
    if (
        count <= 50 ||
        count % 25 === 0 ||
        twoBits === 2 ||
        (twoBits === 0 && !framed && data.length >= 20 && !isWaPong(data))
    ) {
        logger.trace('sctp relay receive', {
            count,
            packetType: framed
                ? 'WARP'
                : twoBits === 0
                  ? 'STUN'
                  : twoBits === 2
                    ? 'RTP/SRTP'
                    : twoBits === 1
                      ? 'DTLS'
                      : 'UNKNOWN',
            size: data.length,
            connectionId: conn.id,
            hexPreview: bytesToHex(data.subarray(0, Math.min(24, data.length)))
        })
    }

    if (framed) {
        traceWarpFrame(logger, traffic, data, conn)
    } else if (twoBits === 2) {
        logger.trace('rtp packet received', {
            count: traffic.rtpReceived,
            payloadType: data[1] & 0x7f,
            sequence: data.length >= 4 ? (data[2] << 8) | data[3] : 0,
            ssrc: `0x${(data.length >= 12 ? readUInt32BE(data, 8) : 0).toString(16)}`,
            size: data.length,
            connectionId: conn.id
        })
        if (traffic.rtpReceived <= 3) {
            logger.trace('rtp packet hex preview', {
                connectionId: conn.id,
                hex: bytesToHex(data.subarray(0, 160))
            })
        }
    } else if (twoBits !== 0) {
        traffic.unknownReceived++
        logger.trace('unknown relay packet type', {
            count: traffic.unknownReceived,
            firstByte: `0x${data[0].toString(16)}`,
            size: data.length,
            connectionId: conn.id,
            hex: bytesToHex(data.subarray(0, 80))
        })
    }
}

function traceWarpFrame(
    logger: Logger,
    traffic: Readonly<RelayTraffic>,
    data: Uint8Array,
    conn: Connection
): void {
    const read = readWarpFrame(data)
    const rtp = read.kind === 'framed' ? read.rtp : null
    logger.trace('warp frame received', {
        count: traffic.warpReceived,
        kind: read.kind,
        headerLength: read.kind === 'not_framed' ? undefined : read.headerLength,
        payloadType: rtp ? rtp[1] & 0x7f : undefined,
        sequence: rtp ? (rtp[2] << 8) | rtp[3] : undefined,
        ssrc: rtp ? `0x${readUInt32BE(rtp, 8).toString(16)}` : undefined,
        size: data.length,
        connectionId: conn.id
    })
}
