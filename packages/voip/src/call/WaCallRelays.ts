import type { Logger } from 'zapo-js'
import { type BinaryNode, getFirstNodeChild } from 'zapo-js/transport'

import {
    dialableRelayEndpoints,
    type WaCallMediaRelay,
    type WaCallMediaRelays
} from '@zapo-js/voip-media'

import { readUInt32BE } from '../bytes.js'
import { parseRelayFromAck } from '../relay/relay-ack.js'
import { buildRelayLatencyStanza } from '../signaling/transport.js'
import type { RelayEndpoint } from '../types.js'

import type { CallInfo } from './call-state.js'
import {
    adoptableRelayEndpoints,
    adoptedRelayTransport,
    sameRelayCredentials,
    sameRelayEndpointSet
} from './group-media-plan.js'
import type { WaCallPlanPublisher } from './WaCallPlanPublisher.js'
import type { WaCallStanzaSender } from './WaCallStanzaSender.js'

/** The shape the media plan gives a relay endpoint the server listed. */
function toMediaRelay(endpoint: RelayEndpoint): WaCallMediaRelay {
    return {
        ip: endpoint.ip,
        port: endpoint.port,
        protocol: endpoint.protocol,
        token: endpoint.token,
        authToken: endpoint.authToken,
        rawToken: endpoint.rawToken,
        rawAuthToken: endpoint.rawAuthToken,
        key: endpoint.key,
        relayId: endpoint.relayId,
        name: endpoint.relayName,
        authTokenId: endpoint.authTokenId
    }
}

/** One relay as our `<te>` names it. */
interface OwnRelayLatency {
    readonly relayName: string
    readonly latency: number
    readonly addressBytes: Uint8Array
}

export interface WaCallRelaysOptions {
    readonly info: CallInfo
    readonly logger: Logger
    readonly stanzas: WaCallStanzaSender
    readonly plan: WaCallPlanPublisher
}

/** The relays one call dials: our relaylatency, the reissues it follows, the elected relay. */
export class WaCallRelays {
    private readonly info: CallInfo
    private readonly logger: Logger
    private readonly stanzas: WaCallStanzaSender
    private readonly plan: WaCallPlanPublisher
    /** Relays our own `<relaylatency>` already named; bounded by the relays the server lists. */
    private readonly announcedRelayNames = new Set<string>()
    /** Relays the media heard answer, with the round trip it measured; only these are named. */
    private readonly answeredRelays = new Map<string, number | undefined>()
    /** Set once setup first asks for our `<relaylatency>`; a relay answering later is named then. */
    private relayLatencyOpened = false
    /** The relays a `group_update` moved the call to, published in place of the offer's. */
    private adoptedRelays: WaCallMediaRelays | null = null
    private relayGeneration = 0
    /** The `transaction-id` of the newest `group_update` whose `<relay>` was read. */
    private relayTransactionId: number | null = null

    constructor(options: WaCallRelaysOptions) {
        this.info = options.info
        this.logger = options.logger
        this.stanzas = options.stanzas
        this.plan = options.plan
    }

    /** Whether a reissue moved the call off the relays the offer listed. */
    get hasAdopted(): boolean {
        return this.adoptedRelays !== null
    }

    /**
     * One `<relaylatency>` per relay that answered us, each once per call: every device of the
     * peer preaccepts, and a name is claimed before its send yields. Stops once the call has
     * ended. The callee dials only on accept, so it names nothing while it rings.
     */
    async sendLatency(): Promise<void> {
        this.relayLatencyOpened = true
        if (!this.info.relayData) return

        const destinationJids = this.info.relayData.participantJids || []

        for (const relay of this.dialableRelayLatencies()) {
            if (this.info.isEnded) return
            if (this.announcedRelayNames.has(relay.relayName)) continue
            this.announcedRelayNames.add(relay.relayName)
            const sent = await this.stanzas.sendLogged(
                () =>
                    buildRelayLatencyStanza(
                        this.info.peerJid,
                        this.info.callId,
                        this.info.callCreator,
                        [relay],
                        destinationJids
                    ),
                'error sending relaylatency',
                'error',
                { relayName: relay.relayName }
            )
            if (!sent) this.announcedRelayNames.delete(relay.relayName)
        }
    }

    /**
     * What `<te>` may say about our relays: only the ones we dial and that answered, once per
     * name, with our own latency and address. Naming another makes the peer elect a relay we
     * are not on.
     */
    private dialableRelayLatencies(): OwnRelayLatency[] {
        const seen = new Set<string>()
        const relays: OwnRelayLatency[] = []
        for (const ep of dialableRelayEndpoints(this.info.relayData?.endpoints ?? [])) {
            if (!ep.relayName || !ep.addressBytes || seen.has(ep.relayName)) continue
            if (!this.answeredRelays.has(ep.relayName)) continue
            seen.add(ep.relayName)
            relays.push({
                relayName: ep.relayName,
                latency: ep.c2rRtt ?? this.answeredRelays.get(ep.relayName) ?? 0,
                addressBytes: ep.addressBytes
            })
        }
        return relays
    }

    /** A relay the server listed answered our media; named at once if setup already announced. */
    onAnswered(name: string, rttMs?: number): void {
        if (this.answeredRelays.has(name)) return
        if (!this.info.relayData?.endpoints.some((ep) => ep.relayName === name)) return
        const measured =
            typeof rttMs === 'number' && Number.isFinite(rttMs) && rttMs >= 0
                ? Math.round(rttMs)
                : undefined
        this.answeredRelays.set(name, measured)
        if (this.relayLatencyOpened) void this.sendLatency()
    }

    /** Logged only: the media elects its own relay. */
    recordElection(node: BinaryNode): void {
        const inner = getFirstNodeChild(node)
        if (!inner) return

        let electedRelayIdx: number | undefined
        const attr = inner.attrs?.['elected_relay_idx'] ?? inner.attrs?.['relay_id']
        if (attr !== undefined) {
            const parsed = Number(attr)
            if (Number.isSafeInteger(parsed) && parsed >= 0) electedRelayIdx = parsed
        } else if (inner.content instanceof Uint8Array) {
            const bytes = inner.content
            if (bytes.length >= 4) electedRelayIdx = readUInt32BE(bytes, 0)
            else if (bytes.length > 0) electedRelayIdx = bytes[0]
        }

        if (electedRelayIdx !== undefined) {
            this.info.electedRelayIdx = electedRelayIdx
            this.logger.debug('elected relay index', {
                callId: this.info.callId,
                electedRelayIdx
            })
        }
    }

    /**
     * Follows a `<relay>` a `group_update` or `<transport>` reissues: a new generation of every
     * dialable relay, elected first, when addresses, credentials or pids changed. An identical
     * repeat or an older `group_update` publishes nothing; an omitted participant list is kept.
     */
    async adoptReissued(inner: BinaryNode, transactionId: number | null): Promise<void> {
        const {
            endpoints: relays,
            participantJids,
            uuid,
            selfPid,
            peerPid
        } = parseRelayFromAck(inner)
        if (relays.length === 0) return

        const newest = this.relayTransactionId
        if (transactionId !== null && newest !== null && transactionId < newest) {
            this.logger.debug('relay descriptor of an older group update, ignored', {
                callId: this.info.callId,
                transactionId,
                newestTransactionId: newest
            })
            return
        }
        if (transactionId !== null) this.relayTransactionId = transactionId

        const current = this.info.relayData
        const elected = adoptableRelayEndpoints(relays)
        const held = current ? adoptableRelayEndpoints(current.endpoints) : []
        const unchanged =
            current !== undefined &&
            (elected.length > 0
                ? sameRelayCredentials(held, elected) &&
                  current.selfPid === selfPid &&
                  current.peerPid === peerPid
                : sameRelayEndpointSet(current.endpoints, relays))
        if (unchanged) {
            this.logger.debug('relay descriptor reissued, already followed', {
                callId: this.info.callId,
                transactionId,
                endpointCount: relays.length,
                electedRelay: elected[0]?.relayName
            })
            return
        }

        this.info.relayData = {
            endpoints: relays,
            participantJids: current?.participantJids?.length
                ? current.participantJids
                : participantJids,
            uuid: uuid || current?.uuid,
            selfPid,
            peerPid
        }
        if (elected.length === 0) {
            this.logger.debug('relay descriptor reissued with nothing dialable', {
                callId: this.info.callId,
                endpointCount: relays.length
            })
            return
        }

        const endpoints = elected.map((endpoint): WaCallMediaRelay => {
            const relay = toMediaRelay(endpoint)
            const transport = adoptedRelayTransport(endpoint)
            return transport ? { ...relay, transport } : relay
        })
        this.adoptedRelays = {
            endpoints,
            selfPid,
            peerPid,
            generation: ++this.relayGeneration
        }
        this.logger.debug('relay descriptor reissued, call moved', {
            callId: this.info.callId,
            transactionId,
            electedRelay: elected[0].relayName,
            relayNames: [...new Set(elected.map((endpoint) => endpoint.relayName))],
            endpointsPublished: elected.length,
            electedRtt: elected[0].c2rRtt,
            generation: this.relayGeneration,
            selfPid,
            peerPid,
            transports: endpoints.map((endpoint) => endpoint.transport ?? 'default'),
            tokenIds: elected.map((endpoint) => endpoint.tokenId ?? null),
            tokenLengths: elected.map(
                (endpoint) => endpoint.rawToken?.length ?? endpoint.token.length
            ),
            authTokenIds: elected.map((endpoint) =>
                endpoint.authToken ? endpoint.authTokenId : null
            ),
            authTokenLengths: elected.map(
                (endpoint) => endpoint.rawAuthToken?.length ?? endpoint.authToken?.length ?? 0
            )
        })
        await this.plan.publish({ relays: this.adoptedRelays })
    }

    /** The plan's `relays`: the ones a reissue moved the call to, else the ones it holds. */
    section(): WaCallMediaRelays | null {
        if (this.adoptedRelays) return this.adoptedRelays
        const relayData = this.info.relayData
        if (!relayData) return null
        return {
            endpoints: relayData.endpoints.map(toMediaRelay),
            selfPid: relayData.selfPid,
            peerPid: relayData.peerPid
        }
    }
}
