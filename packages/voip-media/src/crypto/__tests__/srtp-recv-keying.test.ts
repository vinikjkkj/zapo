import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildPictureLossIndication } from '../../media/rtcp.js'
import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { SrtpKeyingMaterial } from '../../types.js'
import {
    SrtcpContext,
    SrtcpSession,
    SRTP_MAX_RECV_CONTEXTS,
    SrtpError,
    SrtpSession
} from '../srtp.js'

function keying(fill: number): SrtpKeyingMaterial {
    return {
        masterKey: new Uint8Array(16).fill(fill),
        masterSalt: new Uint8Array(14).fill(fill ^ 0x5a)
    }
}

/** The same bytes as `keying(fill)` in fresh buffers, as a re-derivation hands them over. */
function sameKeyingCopy(fill: number): SrtpKeyingMaterial {
    const original = keying(fill)
    return { masterKey: original.masterKey.slice(), masterSalt: original.masterSalt.slice() }
}

const SESSION_RECV = keying(0x01)
const PEER_A = keying(0x0a)
const PEER_B = keying(0x0b)
const PAYLOAD = new Uint8Array([0xde, 0xad, 0xbe, 0xef])

/** What a peer device puts on the wire for `ssrc`, keyed with its own material. */
function peerSender(material: SrtpKeyingMaterial): SrtpSession {
    return new SrtpSession(nodeCrypto, material, material, 4, 4)
}

function rtp(sender: SrtpSession, ssrc: number, seq: number): Uint8Array {
    return sender.protect(new RtpPacket(new RtpHeader(120, seq, seq * 960, ssrc), PAYLOAD))
}

function receiver(): SrtpSession {
    return new SrtpSession(nodeCrypto, keying(0x77), SESSION_RECV, 4, 4)
}

function isSrtpError(type: SrtpError['type']): (error: unknown) => boolean {
    return (error) => error instanceof SrtpError && error.type === type
}

test('a stream keyed with its own participant material authenticates', () => {
    const session = receiver()
    const packet = rtp(peerSender(PEER_A), 0xa0000001, 10)

    assert.throws(() => session.unprotect(packet), isSrtpError('auth_failed'))

    assert.equal(session.setRecvKeying(0xa0000001, PEER_A), true)
    assert.deepEqual(session.unprotect(packet).payload, PAYLOAD)
})

test('re-keying with the same material keeps the replay window', () => {
    const session = receiver()
    const sender = peerSender(PEER_A)
    session.setRecvKeying(0xa0000001, PEER_A)
    const first = rtp(sender, 0xa0000001, 10)
    session.unprotect(first)

    assert.equal(session.setRecvKeying(0xa0000001, sameKeyingCopy(0x0a)), false)

    assert.throws(() => session.unprotect(first), isSrtpError('replay'))
    assert.deepEqual(session.unprotect(rtp(sender, 0xa0000001, 11)).payload, PAYLOAD)
})

test('re-keying with the same material keeps the rollover counter', () => {
    const session = receiver()
    const sender = peerSender(PEER_A)
    session.setRecvKeying(0xa0000001, PEER_A)
    for (const seq of [65534, 65535, 0]) session.unprotect(rtp(sender, 0xa0000001, seq))

    session.setRecvKeying(0xa0000001, sameKeyingCopy(0x0a))

    assert.deepEqual(session.unprotect(rtp(sender, 0xa0000001, 1)).payload, PAYLOAD)
})

test('re-keying with other material replaces the context', () => {
    const session = receiver()
    session.setRecvKeying(0xa0000001, PEER_A)
    session.unprotect(rtp(peerSender(PEER_A), 0xa0000001, 10))

    assert.equal(session.setRecvKeying(0xa0000001, PEER_B), true)

    assert.throws(
        () => session.unprotect(rtp(peerSender(PEER_A), 0xa0000001, 11)),
        isSrtpError('auth_failed')
    )
    assert.deepEqual(session.unprotect(rtp(peerSender(PEER_B), 0xa0000001, 5)).payload, PAYLOAD)
})

test('explicit keying repairs a context the lazy path built from the session key', () => {
    const session = receiver()
    session.unprotect(rtp(peerSender(SESSION_RECV), 0xa0000001, 1))
    assert.equal(session.recvContextCount, 1)

    assert.equal(session.setRecvKeying(0xa0000001, sameKeyingCopy(0x01)), false)
    assert.equal(session.setRecvKeying(0xa0000001, PEER_A), true)
    assert.deepEqual(session.unprotect(rtp(peerSender(PEER_A), 0xa0000001, 2)).payload, PAYLOAD)
})

test('a deleted context frees its slot and the stream falls back to the session key', () => {
    const session = receiver()
    session.setRecvKeying(0xa0000001, PEER_A)
    session.setRecvKeying(0xb0000001, PEER_B)
    assert.equal(session.recvContextCount, 2)

    assert.equal(session.deleteRecvContext(0xa0000001), true)
    assert.equal(session.deleteRecvContext(0xa0000001), false)
    assert.equal(session.recvContextCount, 1)

    assert.throws(
        () => session.unprotect(rtp(peerSender(PEER_A), 0xa0000001, 3)),
        isSrtpError('auth_failed')
    )
    assert.deepEqual(
        session.unprotect(rtp(peerSender(SESSION_RECV), 0xa0000001, 4)).payload,
        PAYLOAD
    )
})

test('the receive-context bound defaults to 32 and evicts the oldest past it', () => {
    const session = receiver()
    assert.equal(session.maxRecvContexts, SRTP_MAX_RECV_CONTEXTS)

    for (let i = 0; i <= SRTP_MAX_RECV_CONTEXTS; i++) session.setRecvKeying(0x1000 + i, PEER_A)

    assert.equal(session.recvContextCount, SRTP_MAX_RECV_CONTEXTS)
    assert.equal(session.setRecvKeying(0x1000, PEER_A), true, 'the oldest was evicted')
})

test('a raised bound holds every keyed stream of a large call', () => {
    const session = receiver()
    session.setMaxRecvContexts(80)

    for (let i = 0; i < 80; i++) session.setRecvKeying(0x1000 + i, i % 2 ? PEER_A : PEER_B)

    assert.equal(session.recvContextCount, 80)
    assert.equal(session.setRecvKeying(0x1000, PEER_B), false, 'the first stream is still held')
})

test('a lowered bound evicts the oldest contexts at once', () => {
    const session = receiver()
    for (let i = 0; i < 6; i++) session.setRecvKeying(0x1000 + i, PEER_A)

    session.setMaxRecvContexts(4)

    assert.equal(session.recvContextCount, 4)
    assert.equal(session.setRecvKeying(0x1002, PEER_A), false, 'the newest four stayed')
    assert.equal(session.setRecvKeying(0x1000, PEER_A), true, 'the oldest two left')
})

test('re-asserting a keyed stream keeps it clear of the next eviction', () => {
    const session = receiver()
    session.setMaxRecvContexts(2)
    session.setRecvKeying(0x1000, PEER_A)
    session.setRecvKeying(0x1001, PEER_A)

    session.setRecvKeying(0x1000, PEER_A)
    session.setRecvKeying(0x1002, PEER_A)

    assert.equal(session.setRecvKeying(0x1000, PEER_A), false)
    assert.equal(session.setRecvKeying(0x1001, PEER_A), true)
})

test('a bound that is not a positive integer is refused', () => {
    const session = receiver()
    for (const bad of [0, -1, 1.5, Number.NaN]) {
        assert.throws(() => session.setMaxRecvContexts(bad), RangeError)
    }
    assert.throws(
        () => new SrtcpSession(nodeCrypto, SESSION_RECV).setMaxRecvContexts(0),
        RangeError
    )
})

function rtcp(material: SrtpKeyingMaterial, ssrc: number): { sender: SrtcpContext; ssrc: number } {
    return { sender: new SrtcpContext(nodeCrypto, material), ssrc }
}

function pli(stream: { sender: SrtcpContext; ssrc: number }): Uint8Array {
    return stream.sender.protect(buildPictureLossIndication(stream.ssrc, 0x01020304), stream.ssrc)
}

test('srtcp from a sender keyed with its own participant material authenticates', () => {
    const session = new SrtcpSession(nodeCrypto, SESSION_RECV)
    const packet = pli(rtcp(PEER_A, 0xa0000001))

    assert.throws(() => session.unprotect(packet), isSrtpError('auth_failed'))

    assert.equal(session.setRecvKeying(0xa0000001, PEER_A), true)
    assert.deepEqual(session.unprotect(packet), buildPictureLossIndication(0xa0000001, 0x01020304))
})

test('srtcp re-keyed with the same material keeps its replay window', () => {
    const session = new SrtcpSession(nodeCrypto, SESSION_RECV)
    const stream = rtcp(PEER_A, 0xa0000001)
    session.setRecvKeying(stream.ssrc, PEER_A)
    const first = pli(stream)
    session.unprotect(first)

    assert.equal(session.setRecvKeying(stream.ssrc, sameKeyingCopy(0x0a)), false)

    assert.throws(() => session.unprotect(first), isSrtpError('replay'))
    session.unprotect(pli(stream))
})

test('srtcp re-keyed with other material replaces the context', () => {
    const session = new SrtcpSession(nodeCrypto, SESSION_RECV)
    session.setRecvKeying(0xa0000001, PEER_A)

    assert.equal(session.setRecvKeying(0xa0000001, PEER_B), true)

    assert.throws(
        () => session.unprotect(pli(rtcp(PEER_A, 0xa0000001))),
        isSrtpError('auth_failed')
    )
    session.unprotect(pli(rtcp(PEER_B, 0xa0000001)))
})

test('srtcp contexts are counted, deleted and bounded like the rtp ones', () => {
    const session = new SrtcpSession(nodeCrypto, SESSION_RECV)
    assert.equal(session.maxRecvContexts, SRTP_MAX_RECV_CONTEXTS)
    session.setMaxRecvContexts(3)

    for (let i = 0; i < 4; i++) session.setRecvKeying(0x2000 + i, PEER_A)
    assert.equal(session.recvContextCount, 3)
    assert.equal(session.setRecvKeying(0x2000, PEER_A), true, 'the oldest was evicted')

    assert.equal(session.deleteRecvContext(0x2003), true)
    assert.equal(session.recvContextCount, 2)

    session.setMaxRecvContexts(1)
    assert.equal(session.recvContextCount, 1)
    assert.equal(session.setRecvKeying(0x2000, PEER_A), false, 'the newest stayed')
})
