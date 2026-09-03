import { writeUInt16BE, writeUInt32BE } from '../bytes.js'
import { randomBytes } from '../crypto/primitives.js'

const NTP_UNIX_OFFSET = 2208988800

export function buildSenderReportWithSdes(
    ssrc: number,
    packetCount: number,
    octetCount: number,
    rtpTimestamp: number,
    cname = randomBytes(18)
): Uint8Array {
    // WhatsApp video uses the profile-specific bit on both compound packets and
    // a 32-byte SDES chunk (including END/padding), for 60 bytes in total.
    const report = new Uint8Array(60)
    const now = Date.now()
    const unixSeconds = Math.floor(now / 1000)
    const fraction = Math.floor(((now % 1000) / 1000) * 0x100000000) >>> 0
    report[0] = 0x90
    report[1] = 200
    writeUInt16BE(report, 6, 2)
    writeUInt32BE(report, ssrc, 4)
    writeUInt32BE(report, (unixSeconds + NTP_UNIX_OFFSET) >>> 0, 8)
    writeUInt32BE(report, fraction, 12)
    writeUInt32BE(report, rtpTimestamp >>> 0, 16)
    writeUInt32BE(report, packetCount >>> 0, 20)
    writeUInt32BE(report, octetCount >>> 0, 24)
    report[28] = 0x91
    report[29] = 202
    writeUInt16BE(report, 7, 30)
    writeUInt32BE(report, ssrc, 32)
    report[36] = 1
    report[37] = 18
    const hex = '0123456789abcdef'
    const nativeCname = new Uint8Array(18)
    for (let i = 0; i < 11; i++) {
        const value = cname[6 + Math.floor(i / 2)] || 0
        nativeCname[i < 5 ? i : i + 3] = hex.charCodeAt(i % 2 === 0 ? value >>> 4 : value & 0x0f)
    }
    nativeCname.set(new TextEncoder().encode('@pj'), 5)
    nativeCname.set(new TextEncoder().encode('.org'), 14)
    report.set(nativeCname, 38)
    return report
}

/** RFC 4585 Picture Loss Indication. Requests an immediate H.264 key frame. */
export function buildPictureLossIndication(
    senderSsrc: number,
    mediaSsrc: number,
    whatsappVideoProfile = true
): Uint8Array {
    const packet = new Uint8Array(12)
    // WhatsApp sets the profile-specific bit on video feedback. Without it,
    // mobile clients accept the SRTCP packet but ignore the key-frame request.
    packet[0] = whatsappVideoProfile ? 0x91 : 0x81 // V=2, profile, FMT=1 (PLI)
    packet[1] = 206 // Payload-specific feedback
    writeUInt16BE(packet, 2, 2)
    writeUInt32BE(packet, senderSsrc, 4)
    writeUInt32BE(packet, mediaSsrc, 8)
    return packet
}

/** RFC 5104 Full Intra Request. Some WhatsApp devices react to FIR but not PLI. */
export function buildFullIntraRequest(
    senderSsrc: number,
    mediaSsrc: number,
    sequenceNumber: number
): Uint8Array {
    const packet = new Uint8Array(20)
    packet[0] = 0x84 // V=2, FMT=4 (FIR)
    packet[1] = 206
    writeUInt16BE(packet, 4, 2)
    writeUInt32BE(packet, senderSsrc, 4)
    writeUInt32BE(packet, 0, 8)
    writeUInt32BE(packet, mediaSsrc, 12)
    packet[16] = sequenceNumber & 0xff
    return packet
}
