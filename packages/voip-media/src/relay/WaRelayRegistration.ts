import { TEXT_ENCODER, toArrayBuffer } from '../bytes.js'
import type { WaMediaCrypto } from '../crypto/primitives.js'
import type { Logger } from '../logger.js'
import { unrefTimer } from '../timers.js'

import { type Connection, isLegOpen } from './leg.js'
import type { RelayInfo } from './relay-info.js'
import {
    buildSenderSubscriptions,
    buildSSRCSubscriptionList,
    buildStreamDescriptor,
    type StreamLayerSsrcs
} from './stun-subscriptions.js'
import { buildAllocateForRelay, buildBindingRequestWithSubs, parseStunResponse } from './stun.js'

/**
 * When a leg replays its registration, in ms from the moment it opened. Not a retry on
 * failure: nothing waits for an answer, the replays cover the relay's own setup and lost datagrams.
 */
export const REGISTRATION_RETRY_DELAYS_MS = [50, 150, 500, 3_000]

function sameOptionalBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
    if (a === b) return true
    if (!a || !b || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

function sameStreamLayers(
    a: readonly StreamLayerSsrcs[] | null,
    b: readonly StreamLayerSsrcs[] | null
): boolean {
    if (a === b) return true
    if (!a || !b || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i].layer !== b[i].layer || a[i].ssrcs.length !== b[i].ssrcs.length) return false
        for (let j = 0; j < a[i].ssrcs.length; j++) {
            if (a[i].ssrcs[j] !== b[i].ssrcs[j]) return false
        }
    }
    return true
}

export interface WaRelayRegistrationOptions {
    readonly crypto: WaMediaCrypto
    readonly logger: Logger
    readonly now: () => number
    /** Hands a datagram to a leg; whether it went out. */
    readonly send: (conn: Connection, data: ArrayBuffer) => boolean
}

/**
 * The SSRC and subscription state every allocate carries, and the registration of each leg:
 * its allocate (cached while its inputs hold), its binding requests and the replay ladder.
 */
export class WaRelayRegistration {
    private readonly crypto: WaMediaCrypto
    private readonly logger: Logger
    private readonly now: () => number
    private readonly send: (conn: Connection, data: ArrayBuffer) => boolean
    /** The attribute layout of each leg's last allocate, logged when it changes. */
    private readonly allocateLayouts = new WeakMap<Connection, string>()
    private audioSsrc = 0
    private subscriptionSsrc = 0
    private selfStreamSsrcs: number[] = []
    private peerStreamSsrcs: number[] = []
    private selfPid = 0
    private peerPid = 0
    /** Set, allocates carry the layered descriptor of these streams; see {@link setSelfLayers}. */
    private selfLayers: readonly StreamLayerSsrcs[] | null = null
    /** Set, allocates carry this `0x4021`; see {@link setRxSubscriptions}. */
    private rxSubscriptions: Uint8Array | null = null
    /** Bumped whenever an input of the allocate's SSRC attributes changes. */
    private allocateEpoch = 0

    constructor(options: WaRelayRegistrationOptions) {
        this.crypto = options.crypto
        this.logger = options.logger
        this.now = options.now
        this.send = options.send
    }

    setSsrc(ssrc: number): void {
        this.audioSsrc = ssrc
        this.allocateEpoch++
        this.logger.debug('sctp ssrc set', { ssrc: `0x${ssrc.toString(16).padStart(8, '0')}` })
    }

    setSubscriptionSsrc(ssrc: number): void {
        this.subscriptionSsrc = ssrc
        this.allocateEpoch++
        this.logger.debug('sctp subscription ssrc set', {
            ssrc: `0x${ssrc.toString(16).padStart(8, '0')}`
        })
    }

    setStreamSsrcs(selfSsrcs: number[], peerSsrcs: number[]): void {
        this.selfStreamSsrcs = selfSsrcs.filter(Boolean)
        this.peerStreamSsrcs = peerSsrcs.filter(Boolean)
        this.allocateEpoch++
        this.logger.debug('sctp relay stream ssrcs set', {
            selfCount: this.selfStreamSsrcs.length,
            peerCount: this.peerStreamSsrcs.length
        })
    }

    /** Whether the ids changed to two known ones, which the open legs must hear. */
    setParticipantIds(selfPid?: number, peerPid?: number): boolean {
        const nextSelfPid = selfPid ?? 0
        const nextPeerPid = peerPid ?? 0
        const changed = nextSelfPid !== this.selfPid || nextPeerPid !== this.peerPid
        this.selfPid = nextSelfPid
        this.peerPid = nextPeerPid
        if (changed) this.allocateEpoch++
        this.logger.debug('sctp participant ids set', {
            selfPid: this.selfPid,
            peerPid: this.peerPid
        })
        return Boolean(changed && this.selfPid && this.peerPid)
    }

    /** Whether the layers changed; see `WaSctpRelay.setSelfLayers`. */
    setSelfLayers(layers: readonly StreamLayerSsrcs[] | null): boolean {
        if (sameStreamLayers(this.selfLayers, layers)) return false
        this.selfLayers = layers
        this.allocateEpoch++
        this.logger.debug('sctp self stream layers set', {
            layers: layers?.length ?? null,
            ssrcs: layers?.reduce((sum, layer) => sum + layer.ssrcs.length, 0) ?? null
        })
        return true
    }

    /** Whether the subscription changed; see `WaSctpRelay.setRxSubscriptions`. */
    setRxSubscriptions(bytes: Uint8Array | null): boolean {
        const next = bytes && bytes.length > 0 ? bytes.slice() : null
        if (sameOptionalBytes(this.rxSubscriptions, next)) return false
        this.rxSubscriptions = next
        this.allocateEpoch++
        this.logger.debug('sctp rx subscriptions set', { size: next?.length ?? 0 })
        return true
    }

    /** Forgets the call's SSRC state; allocates cached before it are rebuilt. */
    reset(): void {
        this.audioSsrc = 0
        this.subscriptionSsrc = 0
        this.selfStreamSsrcs = []
        this.peerStreamSsrcs = []
        this.selfPid = 0
        this.peerPid = 0
        this.selfLayers = null
        this.rxSubscriptions = null
        this.allocateEpoch++
    }

    /**
     * Emits a raw leg's ALLOCATE, its only STUN message besides the ping; the relay pairs the
     * call's ends off the token inside it. Returns whether one went out.
     */
    sendRawAllocate(conn: Connection, label: string): boolean {
        if (!isLegOpen(conn)) return false
        const relayInfo = conn.relayInfo

        if (!relayInfo.rawToken || relayInfo.rawToken.length === 0) {
            this.logger.debug('raw udp allocate skipped, no relay token', {
                connectionId: conn.id,
                label
            })
            return false
        }

        const { sent, size } = this.sendAllocate(conn, relayInfo, relayInfo.rawToken)
        this.logger.trace('raw udp allocate sent', { connectionId: conn.id, label, size, sent })
        return sent
    }

    /**
     * Sends the leg's allocate, rebuilt only when its credentials or SSRC state changed, and
     * stamps the first send. The layout is noted when the bytes are new.
     */
    private sendAllocate(
        conn: Connection,
        relayInfo: RelayInfo,
        rawToken: Uint8Array
    ): { readonly sent: boolean; readonly size: number } {
        let cache = conn.allocateCache
        if (cache?.relayInfo !== relayInfo || cache.epoch !== this.allocateEpoch) {
            const allocate = buildAllocateForRelay(
                this.crypto,
                rawToken,
                this.buildAllocateSsrcList(),
                TEXT_ENCODER.encode(relayInfo.key),
                relayInfo.ip,
                relayInfo.port,
                conn.stunTransactionId,
                this.rxSubscriptions
            )
            cache = { relayInfo, epoch: this.allocateEpoch, bytes: toArrayBuffer(allocate) }
            conn.allocateCache = cache
            this.noteAllocateLayout(conn, allocate)
        }
        const sent = this.send(conn, cache.bytes)
        if (sent) conn.allocateSentAt ??= this.now()
        return { sent, size: cache.bytes.byteLength }
    }

    /** Runs `send` at each delay of the registration ladder, on unreferenced timers. */
    private scheduleRegistrationReplays(send: (delayMs: number) => void): void {
        for (const delayMs of REGISTRATION_RETRY_DELAYS_MS) {
            unrefTimer(setTimeout(() => send(delayMs), delayMs))
        }
    }

    /** Sends a raw leg's allocate and the replays of its registration ladder. */
    registerRawLeg(conn: Connection, label: string): void {
        this.sendRawAllocate(conn, label)
        this.scheduleRegistrationReplays(() => this.sendRawAllocate(conn, 'retry'))
    }

    /**
     * Builds the `0x4024` an allocate carries: the layered descriptor once self layers are set,
     * else the 1:1 list, falling back to the single inbound and outbound SSRCs when the
     * per-stream lists have not been handed over yet.
     */
    private buildAllocateSsrcList(): Uint8Array {
        if (this.selfLayers) return buildStreamDescriptor(this.selfLayers)

        const selfSsrcs = this.selfStreamSsrcs.length ? this.selfStreamSsrcs : [this.audioSsrc]
        const peerSsrcs = this.peerStreamSsrcs.length
            ? this.peerStreamSsrcs
            : this.subscriptionSsrc
              ? [this.subscriptionSsrc]
              : []

        return buildSSRCSubscriptionList(selfSsrcs, peerSsrcs, this.selfPid, this.peerPid)
    }

    /** Runs a WebRTC leg's registration ladder; each send reads the leg's current credentials. */
    sendStunAllocateOnOpen(conn: Connection): void {
        const opening = conn.relayInfo
        if (!(opening.authToken || opening.token)) {
            this.logger.debug('stun registration skipped, no ufrag', { connectionId: conn.id })
            return
        }

        const localUfrag = conn.localUfrag
        const transactionId = conn.stunTransactionId

        const sendRegistration = (label: string) => {
            if (!isLegOpen(conn)) {
                return
            }
            const relayInfo = conn.relayInfo
            const connectionId = conn.id
            const remoteUfrag = relayInfo.authToken || relayInfo.token
            const hmacKey = TEXT_ENCODER.encode(relayInfo.key)

            const selfSsrc = this.audioSsrc
            const peerSsrc = this.subscriptionSsrc
            const ssrc = peerSsrc || selfSsrc
            if (!ssrc) {
                this.logger.debug('stun registration skipped, no ssrc', { connectionId, label })
                return
            }

            // v1-v3 carry only the primary inbound SSRC; per-stream lists belong to the allocate.
            const subs = buildSenderSubscriptions(ssrc)
            if (localUfrag) {
                const username = TEXT_ENCODER.encode(`${remoteUfrag}:${localUfrag}`)
                const v1 = buildBindingRequestWithSubs(
                    this.crypto,
                    username,
                    hmacKey,
                    subs,
                    true,
                    true,
                    transactionId
                )
                this.send(conn, toArrayBuffer(v1))
                this.logger.trace('stun v1 auth token ufrag sent', {
                    connectionId,
                    label,
                    size: v1.length,
                    ssrc: `0x${ssrc.toString(16)}`
                })
            }

            if (relayInfo.token && relayInfo.token !== remoteUfrag && localUfrag) {
                const username = TEXT_ENCODER.encode(`${relayInfo.token}:${localUfrag}`)
                const v2 = buildBindingRequestWithSubs(
                    this.crypto,
                    username,
                    hmacKey,
                    subs,
                    true,
                    true,
                    transactionId
                )
                this.send(conn, toArrayBuffer(v2))
                this.logger.trace('stun v2 token ufrag sent', {
                    connectionId,
                    label,
                    size: v2.length
                })
            }

            const v3 = buildBindingRequestWithSubs(
                this.crypto,
                undefined,
                undefined,
                subs,
                false,
                false,
                transactionId
            )
            this.send(conn, toArrayBuffer(v3))
            this.logger.trace('stun v3 no-mi sent', { connectionId, label, size: v3.length })

            if (relayInfo.rawToken && relayInfo.rawToken.length > 0) {
                const { size } = this.sendAllocate(conn, relayInfo, relayInfo.rawToken)
                this.logger.trace('stun v4 allocate sent', { connectionId, label, size })
            }
        }

        sendRegistration('initial')
        this.scheduleRegistrationReplays((delayMs) => sendRegistration(`retry-${delayMs}ms`))
    }

    /** Logs an allocate's attribute types and lengths, never values, when its layout changes. */
    private noteAllocateLayout(conn: Connection, allocate: Uint8Array): void {
        const attributes = parseStunResponse(allocate)?.attributes
        if (!attributes) return
        const layout = attributes.map((attr) => `${attr.typeName}:${attr.length}`).join(',')
        if (this.allocateLayouts.get(conn) === layout) return
        this.allocateLayouts.set(conn, layout)
        this.logger.debug('relay allocate layout', {
            connectionId: conn.id,
            generation: conn.generation,
            size: allocate.length,
            attributes: layout
        })
    }
}
