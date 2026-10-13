import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bytesToHex, writeUInt32BE } from '../../bytes.js'
import { buildPictureLossIndication } from '../../media/rtcp.js'
import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { SrtpKeyingMaterial } from '../../types.js'
import { webCrypto } from '../../web/crypto.js'
import {
    ReplayWindow,
    SRTCP_AUTH_TAG_LEN,
    SrtcpContext,
    SrtcpSession,
    SRTP_MAX_RECV_CONTEXTS,
    SrtpError,
    SrtpSession
} from '../srtp.js'

/** Keying material cut straight from a seed; the tests only need a valid key. */
function keyingFrom(seed: Uint8Array): SrtpKeyingMaterial {
    return { masterKey: seed.subarray(0, 16), masterSalt: seed.subarray(16, 30) }
}

test('SrtpSession protect/unprotect round-trips RTP payload', async () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x11)

    const keying = keyingFrom(callKey)
    const session = new SrtpSession(nodeCrypto, keying, keying, 4, 4)

    const header = new RtpHeader(120, 7, 1920, 0x11223344)
    const payload = new Uint8Array([0xf8, 0xff, 0xfe, 0xab, 0xcd])
    const packet = new RtpPacket(header, payload)

    const protectedPacket = session.protect(packet)
    const unprotected = session.unprotect(protectedPacket)

    assert.ok(unprotected)
    assert.equal(unprotected.header.sequenceNumber, 7)
    assert.equal(unprotected.header.ssrc, 0x11223344)
    assert.deepEqual(unprotected.payload, payload)
})

test('an unprotected payload owns its bytes, so the datagram can be reused after', () => {
    const keying = keyingFrom(new Uint8Array(32).fill(0x22))
    for (const crypto of [nodeCrypto, webCrypto]) {
        const sender = new SrtpSession(crypto, keying, keying, 4, 4)
        const receiver = new SrtpSession(crypto, keying, keying, 4, 4)
        const payload = Uint8Array.from([0x7c, 0x85, 1, 2, 3, 4, 5, 6])
        const datagram = sender.protect(
            new RtpPacket(new RtpHeader(97, 1, 90, 0x0a0b0c0d), payload)
        )

        const unprotected = receiver.unprotect(datagram)
        datagram.fill(0)

        assert.deepEqual(unprotected?.payload, payload)
    }
})

test('keying material handed to a session cannot be swapped under it', () => {
    const keying = keyingFrom(new Uint8Array(32).fill(0x11))
    if (false) {
        // @ts-expect-error a new key is a new epoch, never a field swapped in place
        keying.masterKey = new Uint8Array(16)
        // @ts-expect-error a new key is a new epoch, never a field swapped in place
        keying.masterSalt = new Uint8Array(14)
    }
    assert.equal(keying.masterKey.length, 16)
})

test('SrtpSession unprotect rejects a tampered packet', async () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x22)

    const keying = keyingFrom(callKey)
    const session = new SrtpSession(nodeCrypto, keying, keying, 4, 4)

    const header = new RtpHeader(120, 9, 1920, 0x55667788)
    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04])
    const protectedPacket = session.protect(new RtpPacket(header, payload))

    const tampered = protectedPacket.slice()
    tampered[12] ^= 0x80

    assert.throws(() => session.unprotect(tampered), /auth tag verification failed/)
})

test('SrtpSession rejects short packets with a stable SRTP error', () => {
    const keying = keyingFrom(new Uint8Array(32))
    const session = new SrtpSession(nodeCrypto, keying, keying, 4, 4)
    assert.throws(
        () => session.unprotect(new Uint8Array(11)),
        (error: unknown) => error instanceof SrtpError && error.type === 'packet_too_short'
    )
})

test('SrtpSession does not retain unauthenticated SSRC contexts', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x23)
    const keying = keyingFrom(callKey)
    const session = new SrtpSession(nodeCrypto, keying, keying, 4, 4)
    const protectedPacket = session.protect(
        new RtpPacket(new RtpHeader(120, 10, 1920, 0x01020304), new Uint8Array([1, 2, 3]))
    )
    for (let index = 0; index < 40; index++) {
        const forged = protectedPacket.slice()
        forged[8] = 0x40 + index
        assert.throws(() => session.unprotect(forged))
    }
    const contexts = (session as unknown as { recvContexts: Map<number, unknown> }).recvContexts
    assert.equal(contexts.size, 0)
})

test('SrtpSession round-trips across the sequence-number rollover', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x33)
    const keying = keyingFrom(callKey)
    const session = new SrtpSession(nodeCrypto, keying, keying, 4, 4)
    const payload = new Uint8Array([0xaa, 0xbb, 0xcc])

    for (const seq of [65533, 65534, 65535, 0, 1, 2]) {
        const header = new RtpHeader(120, seq, (seq * 960) >>> 0, 0x0a0b0c0d)
        const out = session.unprotect(session.protect(new RtpPacket(header, payload)))
        assert.ok(out)
        assert.equal(out.header.sequenceNumber, seq)
        assert.deepEqual(out.payload, payload)
    }
})

test('SrtpSession authenticates a reordered packet delayed across rollover', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x44)
    const keying = keyingFrom(callKey)
    const session = new SrtpSession(nodeCrypto, keying, keying, 4, 4)
    const payload = new Uint8Array([0x10, 0x20, 0x30, 0x40])
    const mk = (seq: number): Uint8Array => {
        const header = new RtpHeader(120, seq, (seq * 960) >>> 0, 0x0b0c0d0e)
        return session.protect(new RtpPacket(header, payload))
    }

    const delayed = mk(65532)
    const a = mk(65535)
    const b = mk(0)
    const c = mk(1)

    session.unprotect(a)
    session.unprotect(b)
    session.unprotect(c)
    const out = session.unprotect(delayed)
    assert.ok(out)
    assert.equal(out.header.sequenceNumber, 65532)
    assert.deepEqual(out.payload, payload)
})

test('SrtpSession answers a replayed packet with null', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x55)
    const keying = keyingFrom(callKey)
    const session = new SrtpSession(nodeCrypto, keying, keying, 4, 4)
    const payload = new Uint8Array([0x09, 0x08, 0x07])
    const header = new RtpHeader(120, 100, 96000, 0x0c0d0e0f)
    const packet = session.protect(new RtpPacket(header, payload))

    assert.ok(session.unprotect(packet))
    assert.equal(session.unprotect(packet), null)
})

test('SrtcpContext defaults to the 10-byte RTCP auth tag', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x66)
    const context = new SrtcpContext(nodeCrypto, keyingFrom(callKey))
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)

    const protectedPacket = context.protect(pli, 0x0a0b0c0d)

    assert.equal(SRTCP_AUTH_TAG_LEN, 10)
    assert.equal(protectedPacket.length, pli.length + 4 + SRTCP_AUTH_TAG_LEN)
    assert.deepEqual(protectedPacket.subarray(0, 8), pli.subarray(0, 8))
})

test('SrtcpContext protect/unprotect round-trips an RTCP packet', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x77)
    const keying = keyingFrom(callKey)
    const sender = new SrtcpContext(nodeCrypto, keying)
    const receiver = new SrtcpContext(nodeCrypto, keying)
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)

    for (let round = 0; round < 3; round++) {
        const unprotected = receiver.unprotect(sender.protect(pli, 0x0a0b0c0d))
        assert.deepEqual(unprotected, pli)
    }
})

test('SrtcpContext unprotect answers a replayed packet with null', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x77)
    const keying = keyingFrom(callKey)
    const sender = new SrtcpContext(nodeCrypto, keying)
    const receiver = new SrtcpContext(nodeCrypto, keying)
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)
    const protectedPacket = sender.protect(pli, 0x0a0b0c0d)

    assert.deepEqual(receiver.unprotect(protectedPacket), pli)
    assert.equal(receiver.unprotect(protectedPacket), null)
})

test('SrtcpContext unprotect rejects a tampered packet', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x88)
    const context = new SrtcpContext(nodeCrypto, keyingFrom(callKey))
    const protectedPacket = context.protect(
        buildPictureLossIndication(0x0a0b0c0d, 0x01020304),
        0x0a0b0c0d
    )

    const tampered = protectedPacket.slice()
    tampered[9] ^= 0x40

    assert.throws(
        () => context.unprotect(tampered),
        (error: unknown) => error instanceof SrtpError && error.type === 'auth_failed'
    )
})

test('SrtcpContext honours an explicit auth tag length', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x99)
    const keying = keyingFrom(callKey)
    const context = new SrtcpContext(nodeCrypto, keying, 4)
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)

    const protectedPacket = context.protect(pli, 0x0a0b0c0d)

    assert.equal(protectedPacket.length, pli.length + 4 + 4)
    assert.deepEqual(context.unprotect(protectedPacket), pli)
    assert.throws(() => new SrtcpContext(nodeCrypto, keying).unprotect(protectedPacket))
})

test('SrtcpContext unprotect rejects a truncated packet', () => {
    const context = new SrtcpContext(nodeCrypto, keyingFrom(new Uint8Array(32)))

    assert.throws(
        () => context.unprotect(new Uint8Array(8 + 4 + SRTCP_AUTH_TAG_LEN - 1)),
        (error: unknown) => error instanceof SrtpError && error.type === 'packet_too_short'
    )
})

test('SrtcpSession accepts interleaved packets from independent SSRC streams', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0xaa)
    const keying = keyingFrom(callKey)

    const audioSsrc = 0x0a0b0c0d
    const videoSsrc = 0x11223344
    const fecSsrc = 0x55667788

    const audioSender = new SrtcpContext(nodeCrypto, keying)
    const videoSender = new SrtcpContext(nodeCrypto, keying)
    const fecSender = new SrtcpContext(nodeCrypto, keying)
    const receiver = new SrtcpSession(nodeCrypto, keying)

    const audioReport = (n: number): Uint8Array =>
        buildPictureLossIndication(audioSsrc, 0x01010101 + n)
    const videoReport = (n: number): Uint8Array =>
        buildPictureLossIndication(videoSsrc, 0x02020202 + n)
    const fecReport = (n: number): Uint8Array => buildPictureLossIndication(fecSsrc, 0x03030303 + n)

    const timeline = [
        [audioSender, audioReport, audioSsrc],
        [videoSender, videoReport, videoSsrc],
        [audioSender, audioReport, audioSsrc],
        [fecSender, fecReport, fecSsrc],
        [videoSender, videoReport, videoSsrc],
        [videoSender, videoReport, videoSsrc],
        [audioSender, audioReport, audioSsrc],
        [fecSender, fecReport, fecSsrc]
    ] as const

    const counters = new Map<number, number>()
    for (const [sender, buildReport, ssrc] of timeline) {
        const n = counters.get(ssrc) ?? 0
        counters.set(ssrc, n + 1)
        const plaintext = buildReport(n)
        const protectedPacket = sender.protect(plaintext, ssrc)
        const unprotected = receiver.unprotect(protectedPacket)
        assert.deepEqual(unprotected, plaintext)
    }
})

test('SrtcpSession still answers a replay within a single stream with null', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0xbb)
    const keying = keyingFrom(callKey)

    const sender = new SrtcpContext(nodeCrypto, keying)
    const receiver = new SrtcpSession(nodeCrypto, keying)
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)
    const protectedPacket = sender.protect(pli, 0x0a0b0c0d)

    assert.deepEqual(receiver.unprotect(protectedPacket), pli)
    assert.equal(receiver.unprotect(protectedPacket), null)
})

/**
 * The cache is bounded to `MAX_RECV_CONTEXTS` (32) entries, evicting the
 * oldest on overflow. A forged packet from a brand-new SSRC with an invalid
 * tag must fail authentication before it can occupy a slot and evict an
 * existing stream's context, which would also erase that stream's replay
 * window. Proven the same way a real attacker's outcome would be observed:
 * establish a legitimate stream, fill the cache so that stream is the
 * eviction candidate, send the forgery, then confirm a replay of the
 * legitimate stream is still rejected. If the forgery had evicted the
 * legitimate context, the replay would decrypt successfully instead.
 */
test('SrtcpSession does not let a forged SSRC evict a legitimate context and erase its replay state', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0xcc)
    const keying = keyingFrom(callKey)

    const receiver = new SrtcpSession(nodeCrypto, keying)

    const legitSsrc = 0x01010101
    const legitSender = new SrtcpContext(nodeCrypto, keying)
    const legitPacket = buildPictureLossIndication(legitSsrc, 0x0a0b0c0d)
    const legitProtected = legitSender.protect(legitPacket, legitSsrc)
    assert.deepEqual(receiver.unprotect(legitProtected), legitPacket)

    const contexts = (receiver as unknown as { contexts: Map<number, unknown> }).contexts
    const maxRecvContexts = SRTP_MAX_RECV_CONTEXTS

    for (let i = 1; i < maxRecvContexts; i++) {
        const ssrc = 0x02000000 + i
        const sender = new SrtcpContext(nodeCrypto, keying)
        const packet = buildPictureLossIndication(ssrc, 0x0b0c0d0e)
        assert.deepEqual(receiver.unprotect(sender.protect(packet, ssrc)), packet)
    }

    assert.equal(contexts.size, maxRecvContexts)
    assert.ok(
        contexts.has(legitSsrc),
        'the legitimate context must still be the eviction candidate'
    )

    const forgedSsrc = 0x09090909
    const forgedSender = new SrtcpContext(nodeCrypto, keying)
    const forged = forgedSender.protect(
        buildPictureLossIndication(forgedSsrc, 0x0d0e0f10),
        forgedSsrc
    )
    const tamperedForged = forged.slice()
    tamperedForged[tamperedForged.length - 1] ^= 0xff

    assert.throws(
        () => receiver.unprotect(tamperedForged),
        (error: unknown) => error instanceof SrtpError && error.type === 'auth_failed'
    )

    assert.equal(
        contexts.size,
        maxRecvContexts,
        'an unauthenticated forgery must not grow the cache'
    )
    assert.ok(
        contexts.has(legitSsrc),
        'an unauthenticated forgery must not evict the legitimate context'
    )

    assert.equal(receiver.unprotect(legitProtected), null)
})

test('SrtcpContext unprotect passes through a payload the sender left in the clear', () => {
    const context = new SrtcpContext(nodeCrypto, keyingFrom(new Uint8Array(32)), 0)
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)

    const unencrypted = new Uint8Array(pli.length + 4)
    unencrypted.set(pli, 0)
    writeUInt32BE(unencrypted, 7, pli.length)

    assert.deepEqual(context.unprotect(unencrypted), pli)
})

test('SrtpSession and SrtcpContext protect to pinned bytes across the rollover', () => {
    const seed = new Uint8Array(30).map((_, i) => (i * 37 + 11) & 0xff)
    const keying = keyingFrom(seed)
    const session = new SrtpSession(nodeCrypto, keying, keying, 4, 4)
    const rtp = [65534, 65535, 0, 1].map((seq) =>
        bytesToHex(
            session.protect(
                new RtpPacket(
                    new RtpHeader(120, seq, seq * 960, 0xdeadbeef),
                    new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
                )
            )
        )
    )
    const context = new SrtcpContext(nodeCrypto, keying)
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)
    const rtcp = [0, 1].map(() => bytesToHex(context.protect(pli, 0x0a0b0c0d)))

    assert.deepEqual(rtp, [
        '8078fffe03bff880deadbeefd675a846deda04194e56009b',
        '8078ffff03bffc40deadbeefdd52fcc281f6883af0ed42df',
        '8078000000000000deadbeef0574e6cb8834f27e92be0301',
        '80780001000003c0deadbeef12d8c3f5ef6af23d0bd0eada'
    ])
    assert.deepEqual(rtcp, [
        '81ce00020a0b0c0d04ff072480000000717ff4158bc1275d81f8',
        '81ce00020a0b0c0d19157216800000010692a041f6e159f3dead'
    ])
})

test('SrtpSession answers duplicates with null and keeps decrypting newer packets', () => {
    const keying = keyingFrom(new Uint8Array(32).fill(0x5a))
    const sender = new SrtpSession(nodeCrypto, keying, keying, 4, 4)
    const receiver = new SrtpSession(nodeCrypto, keying, keying, 4, 4)
    const payload = new Uint8Array([1, 2, 3])
    const packets = new Map<number, Uint8Array>()
    for (const seq of [100, 101, 102, 103, 104, 200]) {
        packets.set(
            seq,
            sender.protect(new RtpPacket(new RtpHeader(120, seq, seq * 960, 0x0d0e0f10), payload))
        )
    }
    const at = (seq: number): Uint8Array => packets.get(seq) ?? new Uint8Array()

    for (const seq of [100, 101, 103]) assert.ok(receiver.unprotect(at(seq)))
    assert.equal(receiver.unprotect(at(101)), null)
    assert.equal(receiver.unprotect(at(103)), null)
    assert.deepEqual(receiver.unprotect(at(102))?.payload, payload)
    assert.equal(receiver.unprotect(at(102)), null)

    assert.deepEqual(receiver.unprotect(at(200))?.payload, payload)
    assert.equal(receiver.unprotect(at(104)), null, 'older than the 64-packet window')
    assert.equal(receiver.unprotect(at(200)), null)
})

test('SrtpSession tracks the rollover counter and answers replays on either side of it with null', () => {
    const keying = keyingFrom(new Uint8Array(32).fill(0x6b))
    const sender = new SrtpSession(nodeCrypto, keying, keying, 4, 4)
    const receiver = new SrtpSession(nodeCrypto, keying, keying, 4, 4)
    const payload = new Uint8Array([7, 8, 9])
    const send = (seq: number): Uint8Array =>
        sender.protect(new RtpPacket(new RtpHeader(120, seq, 0, 0x01020304), payload))

    for (let wrap = 0; wrap < 3; wrap++) {
        let beforeWrap: Uint8Array = new Uint8Array()
        for (let seq = 65500; seq <= 65535; seq++) {
            beforeWrap = send(seq)
            assert.deepEqual(receiver.unprotect(beforeWrap)?.payload, payload)
        }
        const afterWrap = send(0)
        assert.deepEqual(receiver.unprotect(afterWrap)?.payload, payload)
        assert.equal(receiver.unprotect(beforeWrap), null)
        assert.equal(receiver.unprotect(afterWrap), null)
        for (let seq = 1500; seq < 65500; seq += 1500) {
            assert.deepEqual(receiver.unprotect(send(seq))?.payload, payload)
        }
    }
})

test('ReplayWindow slides across the 32-bit word boundary', () => {
    const window = new ReplayWindow()
    assert.equal(window.has(1000), false)
    assert.equal(window.add(1000), true)
    assert.equal(window.has(1000), true)

    assert.equal(window.add(1032), true)
    assert.equal(window.has(1000), true, 'offset 32 lands in the high word')
    assert.equal(window.has(1031), false)
    assert.equal(window.add(1001), false)
    assert.equal(window.has(1001), true)

    assert.equal(window.add(1063), true)
    assert.equal(window.has(1000), true, 'offset 63 is still inside')
    assert.equal(window.has(999), true, 'offset 64 is outside, so treated as seen')
    assert.equal(window.add(1064), true)
    assert.equal(window.has(1001), true)
    assert.equal(window.has(1002), false)

    assert.equal(window.add(1064 + 31), true)
    assert.equal(window.has(1064), true)
    assert.equal(window.has(1032), true)
    assert.equal(window.add(1064 + 31 + 200), true)
    assert.equal(window.has(1064 + 31), true, 'a jump past the window clears it')
    assert.equal(window.has(1064 + 31 + 199), false)
})
