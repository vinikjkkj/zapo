import type { Logger } from '../logger.js'

import { type Connection, ConnectionState, isLegOpen } from './leg.js'

/**
 * How long our media leg may go without the peer's media before media arriving on another
 * leg takes it over. Above the gaps of a peer's stream even in DTX, so a peer that sends
 * through every leg never moves it; short, so following a peer that moved costs half a second.
 */
const RX_ELECTION_HOLD_MS = 400
/**
 * How long a leg of an older generation must go without authenticated peer media before the
 * proved newest generation retires it: each sender may be delivered from its own relay.
 */
const OLDER_LEG_QUIET_MS = 5_000

/** Media on the newest generation's legs, or on older ones while those dial or for want of any. */
type ElectionScope = 'newest' | 'awaiting' | 'older'

export interface WaRelayElectionOptions {
    /** The call's legs, in dial order. */
    readonly legs: ReadonlyMap<string, Connection>
    readonly logger: Logger
    readonly now: () => number
    /** Takes an older leg out of the call, with no loss announced and no redial. */
    readonly retire: (conn: Connection) => void
}

/**
 * Tracks the relay generations and elects the one leg media goes out on: the newest
 * generation's while one of its legs is open, following the peer, and older generations retired
 * once the newest is proved.
 */
export class WaRelayElection {
    private readonly legs: ReadonlyMap<string, Connection>
    private readonly logger: Logger
    private readonly now: () => number
    private readonly retire: (conn: Connection) => void
    /** The newest relay generation; media is elected among its legs while one is open. */
    private newestGeneration = 0
    /** The newest generation proved below this one; see {@link retireOlderGenerations}. */
    private retiredBelow = 0
    /** Whether older legs hearing the peer outlived the proof; see {@link retireQuietOlderLegs}. */
    private olderLegsHearing = false
    /**
     * When media first went out on a leg of the newest generation before any of its legs heard
     * the peer; `RX_ELECTION_HOLD_MS` after it, the peer is followed back to an older leg.
     */
    private newestSendingSince: number | null = null
    /** The scope of the last election, logged when it changes. */
    private electionScope: ElectionScope = 'newest'
    /** The one leg media goes out on; see {@link elect}. */
    private mediaLeg: Connection | null = null

    constructor(options: WaRelayElectionOptions) {
        this.legs = options.legs
        this.logger = options.logger
        this.now = options.now
        this.retire = options.retire
    }

    /** The newest relay generation; media is elected among its legs while one is open. */
    get generation(): number {
        return this.newestGeneration
    }

    isElected(conn: Connection): boolean {
        return conn === this.mediaLeg
    }

    /** Moves the call onto a newer generation, whose legs have yet to send or hear anything. */
    advance(generation: number): void {
        this.newestGeneration = generation
        this.olderLegsHearing = false
        this.newestSendingSince = null
    }

    /** Notes media that went out on `leg`, the leg {@link elect} returned. */
    noteSent(leg: Connection): void {
        if (this.newestSendingSince === null && leg.generation === this.newestGeneration) {
            if (!this.newestProved()) this.newestSendingSince = this.now()
        }
        if (this.olderLegsHearing) this.retireQuietOlderLegs(this.now())
    }

    /**
     * Follows the peer to `conn`, whose peer media just authenticated at `now`: when our media
     * leg has not heard the peer for `RX_ELECTION_HOLD_MS`, this leg takes it over. A leg of the
     * newest generation takes over a leg of an older one at once; an older leg takes over a
     * newest one only once {@link followsPeerToOlder}.
     */
    notePeerMedia(conn: Connection, now: number): void {
        if (isLegOpen(conn)) this.retireOlderGenerations(conn)
        if (this.olderLegsHearing) this.retireQuietOlderLegs(now)

        const current = this.mediaLeg
        if (conn === current || conn.unresponsive || !isLegOpen(conn)) return
        const newest = conn.generation === this.newestGeneration
        if (!newest && this.hasOpenLegOf(this.newestGeneration) && !this.followsPeerToOlder(now))
            return
        const leavesOlder =
            newest && current !== null && current.generation !== this.newestGeneration
        if (
            !leavesOlder &&
            current &&
            this.isElectable(current) &&
            current.peerMediaAt !== null &&
            now - current.peerMediaAt < RX_ELECTION_HOLD_MS
        ) {
            return
        }

        this.mediaLeg = conn
        this.logger.debug(
            newest
                ? 'sctp media leg follows the peer'
                : 'sctp media leg follows the peer to an older relay generation',
            {
                connectionId: conn.id,
                relayId: conn.relayInfo.relayId,
                generation: conn.generation,
                newest: this.newestGeneration,
                replaces: current?.id
            }
        )
    }

    /**
     * Proves the newest generation once `conn`, an open leg of it, heard authenticated peer media
     * (an answered allocate is no proof), and retires the older legs not hearing the peer.
     */
    private retireOlderGenerations(conn: Connection): void {
        if (conn.generation !== this.newestGeneration || this.newestProved()) return
        if (!isLegOpen(conn)) return
        this.retiredBelow = this.newestGeneration
        this.retireQuietOlderLegs(this.now(), conn.id)
    }

    /**
     * Closes each older leg that has not heard authenticated peer media for `OLDER_LEG_QUIET_MS`;
     * one still hearing a sender stays, receive-only, until it goes quiet.
     */
    private retireQuietOlderLegs(now: number, provedBy?: string): void {
        let hearing = false
        for (const old of this.legs.values()) {
            if (old.generation >= this.newestGeneration) continue
            const quietMs = old.peerMediaAt === null ? null : Math.round(now - old.peerMediaAt)
            if (quietMs !== null && quietMs < OLDER_LEG_QUIET_MS) {
                hearing = true
                continue
            }
            this.logger.info('retired by a newer relay generation', {
                connectionId: old.id,
                generation: old.generation,
                newest: this.newestGeneration,
                state: old.state,
                proof: 'peer_media',
                provedBy,
                quietMs
            })
            this.retire(old)
        }
        if (hearing && !this.olderLegsHearing) {
            this.logger.debug('older relay legs kept while they hear the peer', {
                newest: this.newestGeneration
            })
        }
        this.olderLegsHearing = hearing
    }

    /** Whether a leg of the newest generation heard the peer, or there is no older one. */
    private newestProved(): boolean {
        return this.retiredBelow >= this.newestGeneration
    }

    /**
     * Whether the peer is followed back to an older generation: the newest one carried our media
     * for `RX_ELECTION_HOLD_MS` and none of its legs heard the peer.
     */
    private followsPeerToOlder(now: number): boolean {
        return (
            !this.newestProved() &&
            this.newestSendingSince !== null &&
            now - this.newestSendingSince >= RX_ELECTION_HOLD_MS
        )
    }

    private isElectable(conn: Connection): boolean {
        return this.legs.get(conn.id) === conn && isLegOpen(conn) && !conn.unresponsive
    }

    private hasOpenLegOf(generation: number): boolean {
        for (const conn of this.legs.values()) {
            if (conn.generation === generation && isLegOpen(conn)) return true
        }
        return false
    }

    /**
     * Keeps the leg in use while it is open and answering pings, since the peer's stream
     * returns where our media leaves. Else the first such leg in dial order, off the dropped
     * leg's relay, which never re-points; with none answering, any open leg. While a leg of
     * the newest generation is open, only those legs are candidates.
     */
    elect(): Connection | null {
        const current = this.mediaLeg
        if (current && current.generation === this.newestGeneration && this.isElectable(current)) {
            return current
        }
        if (current && this.isElectable(current) && current.peerMediaAt !== null) {
            const now = this.now()
            const hearing = now - current.peerMediaAt < RX_ELECTION_HOLD_MS
            if (hearing && this.followsPeerToOlder(now)) return current
        }

        const scoped = this.newestGeneration > 0 && this.hasOpenLegOf(this.newestGeneration)
        if (this.newestGeneration > 0) this.noteElectionScope(scoped)
        if (current && !scoped && this.isElectable(current)) return current

        let elected: Connection | null = null
        let sameRelay: Connection | null = null
        let unresponsive: Connection | null = null
        for (const conn of this.legs.values()) {
            if (!isLegOpen(conn)) continue
            if (scoped && conn.generation !== this.newestGeneration) continue
            if (conn.unresponsive) {
                unresponsive ??= conn
                continue
            }
            if (
                current &&
                conn.generation === current.generation &&
                conn.relayInfo.relayId === current.relayInfo.relayId
            ) {
                sameRelay ??= conn
                continue
            }
            elected = conn
            break
        }
        elected ??= sameRelay ?? unresponsive

        this.mediaLeg = elected
        if (elected && elected !== current) {
            this.logger.debug('sctp media leg elected', {
                connectionId: elected.id,
                relayId: elected.relayInfo.relayId,
                generation: elected.generation,
                replaces: current?.id
            })
        } else if (!elected && current) {
            this.logger.debug('sctp media leg lost, no open leg left', { connectionId: current.id })
        }
        return elected
    }

    /**
     * Logs where media is elected once a newer generation exists, on change only: its legs,
     * an older leg while they still dial, or an older leg because none of them is left (never
     * once the older legs were retired).
     */
    private noteElectionScope(scoped: boolean): void {
        let scope: ElectionScope = 'newest'
        let dialling = 0
        let open = 0
        if (!scoped) {
            for (const conn of this.legs.values()) {
                if (isLegOpen(conn)) open++
                else if (
                    conn.generation === this.newestGeneration &&
                    conn.state === ConnectionState.Connecting
                ) {
                    dialling++
                }
            }
            scope = dialling > 0 ? 'awaiting' : 'older'
        }
        if (scope === this.electionScope || (scope === 'older' && open === 0)) return
        this.electionScope = scope

        const context = { generation: this.newestGeneration, dialling, openLegs: open }
        if (scope === 'older') {
            this.logger.warn(
                'no leg of the newest relays is open, media falls back to older legs',
                context
            )
        } else if (scope === 'awaiting') {
            this.logger.debug('newest relays still dialling, media stays on older legs', context)
        } else {
            this.logger.debug('media elected among the newest relays', context)
        }
    }

    reset(): void {
        this.newestGeneration = 0
        this.retiredBelow = 0
        this.olderLegsHearing = false
        this.newestSendingSince = null
        this.electionScope = 'newest'
        this.mediaLeg = null
    }
}
