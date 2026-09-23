import assert from 'node:assert/strict'
import { test } from 'node:test'

import { writeUInt32BE } from '../../bytes.js'
import { buildPictureLossIndication } from '../../media/rtcp.js'
import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import { derivePerJidSrtpKey, generateCallKey } from '../encryption.js'
import {
    SRTCP_AUTH_TAG_LEN,
    SrtcpContext,
    SrtcpSession,
    SRTP_MAX_RECV_CONTEXTS,
    SrtpError,
    SrtpSession
} from '../srtp.js'

test('generateCallKey returns 32 bytes', () => {
    const key = generateCallKey()
    assert.equal(key.length, 32)
    assert.ok(key instanceof Uint8Array)
})

test('derivePerJidSrtpKey produces expected key material lengths', async () => {
    const callKey = new Uint8Array(32)
    for (let i = 0; i < callKey.length; i++) callKey[i] = i

    const keying = derivePerJidSrtpKey(callKey, '12345:0@lid')
    assert.equal(keying.masterKey.length, 16)
    assert.equal(keying.masterSalt.length, 14)
})

test('SrtpSession protect/unprotect round-trips RTP payload', async () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x11)

    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)

    const header = new RtpHeader(120, 7, 1920, 0x11223344)
    const payload = new Uint8Array([0xf8, 0xff, 0xfe, 0xab, 0xcd])
    const packet = new RtpPacket(header, payload)

    const protectedPacket = session.protect(packet)
    const unprotected = session.unprotect(protectedPacket)

    assert.equal(unprotected.header.sequenceNumber, 7)
    assert.equal(unprotected.header.ssrc, 0x11223344)
    assert.deepEqual(unprotected.payload, payload)
})

test('SrtpSession unprotect rejects a tampered packet', async () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x22)

    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)

    const header = new RtpHeader(120, 9, 1920, 0x55667788)
    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04])
    const protectedPacket = session.protect(new RtpPacket(header, payload))

    const tampered = protectedPacket.slice()
    tampered[12] ^= 0x80

    assert.throws(() => session.unprotect(tampered), /auth tag verification failed/)
})

test('SrtpSession rejects short packets with a stable SRTP error', () => {
    const keying = derivePerJidSrtpKey(new Uint8Array(32), 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)
    assert.throws(
        () => session.unprotect(new Uint8Array(11)),
        (error: unknown) => error instanceof SrtpError && error.type === 'packet_too_short'
    )
})

test('SrtpSession does not retain unauthenticated SSRC contexts', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x23)
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)
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
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)
    const payload = new Uint8Array([0xaa, 0xbb, 0xcc])

    for (const seq of [65533, 65534, 65535, 0, 1, 2]) {
        const header = new RtpHeader(120, seq, (seq * 960) >>> 0, 0x0a0b0c0d)
        const out = session.unprotect(session.protect(new RtpPacket(header, payload)))
        assert.equal(out.header.sequenceNumber, seq)
        assert.deepEqual(out.payload, payload)
    }
})

test('SrtpSession authenticates a reordered packet delayed across rollover', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x44)
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)
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
    assert.equal(out.header.sequenceNumber, 65532)
    assert.deepEqual(out.payload, payload)
})

test('SrtpSession rejects a replayed packet', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x55)
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)
    const payload = new Uint8Array([0x09, 0x08, 0x07])
    const header = new RtpHeader(120, 100, 96000, 0x0c0d0e0f)
    const packet = session.protect(new RtpPacket(header, payload))

    session.unprotect(packet)
    assert.throws(() => session.unprotect(packet), /replay/)
})

test('SrtcpContext defaults to the 10-byte RTCP auth tag', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x66)
    const context = new SrtcpContext(derivePerJidSrtpKey(callKey, 'self:0@lid'))
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)

    const protectedPacket = context.protect(pli, 0x0a0b0c0d)

    assert.equal(SRTCP_AUTH_TAG_LEN, 10)
    assert.equal(protectedPacket.length, pli.length + 4 + SRTCP_AUTH_TAG_LEN)
    assert.deepEqual(protectedPacket.subarray(0, 8), pli.subarray(0, 8))
})

test('SrtcpContext protect/unprotect round-trips an RTCP packet', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x77)
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const sender = new SrtcpContext(keying)
    const receiver = new SrtcpContext(keying)
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)

    for (let round = 0; round < 3; round++) {
        const unprotected = receiver.unprotect(sender.protect(pli, 0x0a0b0c0d))
        assert.deepEqual(unprotected, pli)
    }
})

test('SrtcpContext unprotect rejects a replayed packet', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x77)
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const sender = new SrtcpContext(keying)
    const receiver = new SrtcpContext(keying)
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)
    const protectedPacket = sender.protect(pli, 0x0a0b0c0d)

    assert.deepEqual(receiver.unprotect(protectedPacket), pli)
    assert.throws(
        () => receiver.unprotect(protectedPacket),
        (error: unknown) => error instanceof SrtpError && error.type === 'replay'
    )
})

test('SrtcpContext unprotect rejects a tampered packet', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x88)
    const context = new SrtcpContext(derivePerJidSrtpKey(callKey, 'self:0@lid'))
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
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const context = new SrtcpContext(keying, 4)
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)

    const protectedPacket = context.protect(pli, 0x0a0b0c0d)

    assert.equal(protectedPacket.length, pli.length + 4 + 4)
    assert.deepEqual(context.unprotect(protectedPacket), pli)
    assert.throws(() => new SrtcpContext(keying).unprotect(protectedPacket))
})

test('SrtcpContext unprotect rejects a truncated packet', () => {
    const context = new SrtcpContext(derivePerJidSrtpKey(new Uint8Array(32), 'self:0@lid'))

    assert.throws(
        () => context.unprotect(new Uint8Array(8 + 4 + SRTCP_AUTH_TAG_LEN - 1)),
        (error: unknown) => error instanceof SrtpError && error.type === 'packet_too_short'
    )
})

test('SrtcpSession accepts interleaved packets from independent SSRC streams', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0xaa)
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')

    const audioSsrc = 0x0a0b0c0d
    const videoSsrc = 0x11223344
    const fecSsrc = 0x55667788

    const audioSender = new SrtcpContext(keying)
    const videoSender = new SrtcpContext(keying)
    const fecSender = new SrtcpContext(keying)
    const receiver = new SrtcpSession(keying)

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

test('SrtcpSession still rejects a replayed packet within a single stream', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0xbb)
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')

    const sender = new SrtcpContext(keying)
    const receiver = new SrtcpSession(keying)
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)
    const protectedPacket = sender.protect(pli, 0x0a0b0c0d)

    assert.deepEqual(receiver.unprotect(protectedPacket), pli)
    assert.throws(
        () => receiver.unprotect(protectedPacket),
        (error: unknown) => error instanceof SrtpError && error.type === 'replay'
    )
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
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')

    const receiver = new SrtcpSession(keying)

    const legitSsrc = 0x01010101
    const legitSender = new SrtcpContext(keying)
    const legitPacket = buildPictureLossIndication(legitSsrc, 0x0a0b0c0d)
    const legitProtected = legitSender.protect(legitPacket, legitSsrc)
    assert.deepEqual(receiver.unprotect(legitProtected), legitPacket)

    const contexts = (receiver as unknown as { contexts: Map<number, unknown> }).contexts
    const maxRecvContexts = SRTP_MAX_RECV_CONTEXTS

    for (let i = 1; i < maxRecvContexts; i++) {
        const ssrc = 0x02000000 + i
        const sender = new SrtcpContext(keying)
        const packet = buildPictureLossIndication(ssrc, 0x0b0c0d0e)
        assert.deepEqual(receiver.unprotect(sender.protect(packet, ssrc)), packet)
    }

    assert.equal(contexts.size, maxRecvContexts)
    assert.ok(
        contexts.has(legitSsrc),
        'the legitimate context must still be the eviction candidate'
    )

    const forgedSsrc = 0x09090909
    const forgedSender = new SrtcpContext(keying)
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

    assert.throws(
        () => receiver.unprotect(legitProtected),
        (error: unknown) => error instanceof SrtpError && error.type === 'replay'
    )
})

test('SrtcpContext unprotect passes through a payload the sender left in the clear', () => {
    const context = new SrtcpContext(derivePerJidSrtpKey(new Uint8Array(32), 'self:0@lid'), 0)
    const pli = buildPictureLossIndication(0x0a0b0c0d, 0x01020304)

    const unencrypted = new Uint8Array(pli.length + 4)
    unencrypted.set(pli, 0)
    writeUInt32BE(unencrypted, 7, pli.length)

    assert.deepEqual(context.unprotect(unencrypted), pli)
})
