import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'

import { encodeReactionPayload, type WaCallReaction } from '../../app-data/protocol.js'
import { WA_APP_DATA_PAYLOAD_TYPE } from '../../app-data/WaAppDataStream.js'
import { derivePerJidSrtpKey } from '../../crypto/encryption.js'
import { SrtpSession } from '../../crypto/srtp.js'
import { generateSecureSsrc, WA_SSRC_SLOT } from '../../crypto/ssrc.js'
import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import {
    CallMediaType,
    type RelayEndpoint,
    SRTP_RECV_AUTH_TAG_LEN,
    SRTP_SEND_AUTH_TAG_LEN,
    type WaVoipDeps
} from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallMediaSession, type WaCallMediaSessionDelegate } from '../WaCallMediaSession.js'

const CALL_ID = '00CEAC2144738E0FAADE17F16BCDBA04'
const SELF_JID = '112984198234339:0@lid'
const PEER_JID = '50062877036657:76@lid'
const PEER_PAYLOAD_TYPE = 108
const THUMBS_UP = '\u{1F44D}'

const CALL_KEY = new Uint8Array(32).fill(7)

/** One `setStreamSsrcs` the session handed the relay. */
interface DeclaredStreams {
    readonly self: readonly number[]
    readonly peer: readonly number[]
}

interface Harness {
    readonly session: WaCallMediaSession
    readonly reactions: WaCallReaction[]
    readonly broadcast: Uint8Array[]
    /** What the relay was actually told, in order, rather than what the session holds. */
    readonly declared: DeclaredStreams[]
    readonly internals: {
        srtpSession: SrtpSession | null
        actualPeerSsrc: number | null
        selfStreamSsrcs: number[]
        peerStreamSsrcs: number[]
        peerAppDataSsrcs: Set<number>
        onRelayData: (data: Uint8Array) => void
        connectRelays: (endpoints: readonly RelayEndpoint[]) => Promise<void>
    }
}

/**
 * A session whose relay is inert, so only the app-data path is exercised.
 * `relayAccepts: false` stands for a call with no relay connection open.
 */
async function createSession(options: { relayAccepts?: boolean } = {}): Promise<Harness> {
    const reactions: WaCallReaction[] = []
    const broadcast: Uint8Array[] = []
    const declared: DeclaredStreams[] = []
    const call = CallInfo.newOutgoing(CALL_ID, PEER_JID, SELF_JID, CallMediaType.Audio)
    const session = new WaCallMediaSession({
        deps: {} as unknown as WaVoipDeps,
        logger: createNoopLogger(),
        info: call,
        delegate: {
            emitState: () => {},
            emitIncoming: () => {},
            emitEnded: () => {},
            emitPeerMute: () => {},
            emitInboundAudio: () => {},
            emitInboundVideoRtp: () => {},
            emitInboundVideo: () => {},
            emitOutboundAudioFinished: () => {},
            emitHandRaise: () => {},
            emitScreenShare: () => {},
            emitPeerVideoState: () => {},
            emitCallReaction: (_call, reaction) => {
                reactions.push(reaction)
            }
        } satisfies WaCallMediaSessionDelegate
    })

    const internals = session as unknown as Harness['internals'] & {
        sctpRelay: {
            cleanup: () => void
            broadcast: (data: ArrayBuffer) => boolean
            setSsrc: (ssrc: number) => void
            setStreamSsrcs: (self: number[], peer: number[]) => void
            setSubscriptionSsrc: (ssrc: number) => void
            setParticipantIds: (self?: number, peer?: number) => void
            resendSubscriptions: () => void
            configureRelays: (relays: readonly unknown[]) => Promise<void>
            getConnectedCount: () => number
        }
        opusCodec: unknown
    }
    internals.sctpRelay = {
        cleanup: () => {},
        broadcast: (data) => {
            if (options.relayAccepts === false) return false
            broadcast.push(new Uint8Array(data))
            return true
        },
        setSsrc: () => {},
        setStreamSsrcs: (self, peer) => {
            declared.push({ self: [...self], peer: [...peer] })
        },
        setSubscriptionSsrc: () => {},
        setParticipantIds: () => {},
        resendSubscriptions: () => {},
        configureRelays: async () => {},
        getConnectedCount: () => 1
    }

    await session.initMedia(SELF_JID, PEER_JID)

    internals.srtpSession = new SrtpSession(
        derivePerJidSrtpKey(CALL_KEY, SELF_JID),
        derivePerJidSrtpKey(CALL_KEY, PEER_JID),
        SRTP_SEND_AUTH_TAG_LEN,
        SRTP_RECV_AUTH_TAG_LEN
    )

    return { session, reactions, broadcast, declared, internals }
}

/** One app-data packet as the peer would put it on the wire. */
function peerAppDataPacket(reaction: string, transactionId: bigint, sequence: number): Uint8Array {
    const peerSrtp = new SrtpSession(
        derivePerJidSrtpKey(CALL_KEY, PEER_JID),
        derivePerJidSrtpKey(CALL_KEY, SELF_JID),
        SRTP_SEND_AUTH_TAG_LEN,
        SRTP_RECV_AUTH_TAG_LEN
    )
    const ssrc = generateSecureSsrc(CALL_ID, PEER_JID, WA_SSRC_SLOT.APP_DATA.MAIN)
    const header = new RtpHeader(PEER_PAYLOAD_TYPE, sequence, 0, ssrc)
    return peerSrtp.protect(
        new RtpPacket(header, encodeReactionPayload({ transactionId, reaction }))
    )
}

/** One relay endpoint, complete enough for the session to dial it. */
const RELAY_ENDPOINT: RelayEndpoint = {
    ip: '203.0.113.7',
    port: 3478,
    token: 'token',
    rawToken: new Uint8Array([1, 2, 3]),
    key: 'key',
    relayId: 1
}

test('an audio call derives and declares its own app-data ssrc', async (t) => {
    const { session, declared, internals } = await createSession()
    t.after(() => session.cleanup())

    const selfAppData = generateSecureSsrc(CALL_ID, SELF_JID, WA_SSRC_SLOT.APP_DATA.MAIN)
    const peerAppData = generateSecureSsrc(CALL_ID, PEER_JID, WA_SSRC_SLOT.APP_DATA.MAIN)

    // Asserted on what the relay was handed, not on the field behind it: the relay drops
    // what it was never told about, so holding the ssrc is not declaring it.
    await internals.connectRelays([RELAY_ENDPOINT])

    assert.equal(declared.length, 1, 'configuring the relays declared the streams once')
    assert.ok(declared[0].self.includes(selfAppData), 'the app-data ssrc reached the relay')
    assert.ok(declared[0].peer.includes(peerAppData), 'the peer app-data stream is subscribed')
    assert.ok(internals.peerAppDataSsrcs.has(peerAppData))
})

test('an inbound app-data packet surfaces one reaction', async (t) => {
    const { session, reactions, internals } = await createSession()
    t.after(() => session.cleanup())

    internals.onRelayData(peerAppDataPacket(THUMBS_UP, 1234n, 1))

    assert.equal(reactions.length, 1)
    assert.equal(reactions[0].reaction, THUMBS_UP)
    assert.equal(reactions[0].transactionId, 1234n)
})

test('a retransmitted reaction reaches the delegate once', async (t) => {
    const { session, reactions, internals } = await createSession()
    t.after(() => session.cleanup())

    internals.onRelayData(peerAppDataPacket(THUMBS_UP, 55n, 1))
    internals.onRelayData(peerAppDataPacket(THUMBS_UP, 55n, 2))
    internals.onRelayData(peerAppDataPacket(THUMBS_UP, 55n, 3))

    assert.equal(reactions.length, 1)
})

test('app data does not become the peer media ssrc', async (t) => {
    const { session, internals } = await createSession()
    t.after(() => session.cleanup())

    internals.onRelayData(peerAppDataPacket(THUMBS_UP, 1n, 1))

    assert.equal(
        internals.actualPeerSsrc,
        null,
        'latching the app-data ssrc would resubscribe the call to a stream with no audio'
    )
})

test('a reaction is sent on an active call without waiting for the peer', async (t) => {
    const { session, broadcast } = await createSession()
    t.after(() => session.cleanup())

    assert.equal(session.sendReaction(THUMBS_UP), false, 'the call is not active yet')
    assert.equal(broadcast.length, 0)

    session.info.applyTransition({ type: 'offer_sent' })
    session.info.applyTransition({ type: 'remote_accepted' })
    session.info.applyTransition({ type: 'media_connected' })

    assert.equal(session.sendReaction('\u{1F602}'), true)
    assert.ok(broadcast.length >= 1)

    const sentSsrc =
        (broadcast[0][8] << 24) |
        (broadcast[0][9] << 16) |
        (broadcast[0][10] << 8) |
        broadcast[0][11]
    assert.equal(
        sentSsrc >>> 0,
        generateSecureSsrc(CALL_ID, SELF_JID, WA_SSRC_SLOT.APP_DATA.MAIN),
        'a reaction leaves on this device app-data ssrc'
    )
    assert.equal(
        broadcast[0][1] & 0x7f,
        WA_APP_DATA_PAYLOAD_TYPE,
        'the type stamped is this side own, not one taken from the peer'
    )
})

/**
 * With no relay connection open nothing leaves, and reporting success there tells a caller
 * the peer saw a reaction that was never sent.
 */
test('a reaction reports failure when no relay connection took it', async (t) => {
    const { session, broadcast } = await createSession({ relayAccepts: false })
    t.after(() => session.cleanup())

    session.info.applyTransition({ type: 'offer_sent' })
    session.info.applyTransition({ type: 'remote_accepted' })
    session.info.applyTransition({ type: 'media_connected' })

    assert.equal(session.sendReaction(THUMBS_UP), false)
    assert.equal(broadcast.length, 0)
})
