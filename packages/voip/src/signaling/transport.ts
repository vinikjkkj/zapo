import { toUserJid } from 'zapo-js/protocol'
import { type BinaryNode, getNodeChildrenByTag } from 'zapo-js/transport'

import type { RelayEndpoint } from '../types.js'

import { callStanza } from './call-stanza.js'

function toRelayEndpoint(node: BinaryNode): RelayEndpoint | null {
    const relay: RelayEndpoint = {
        ip: node.attrs?.ip || '',
        port: parseInt(node.attrs?.port || '3480', 10),
        token: node.attrs?.token || '',
        key: node.attrs?.['relay-key'] || node.attrs?.key || '',
        relayId: parseInt(node.attrs?.['relay-id'] || '0', 10),
        c2rRtt: node.attrs?.['c2r-rtt'] ? parseInt(node.attrs['c2r-rtt'], 10) : undefined
    }

    return relay.ip && relay.token ? relay : null
}

export function extractRelayEndpoints(node: BinaryNode): RelayEndpoint[] {
    const relayNodes = [...getNodeChildrenByTag(node, 'relay')]
    for (const wrapper of getNodeChildrenByTag(node, 'relays')) {
        relayNodes.push(...getNodeChildrenByTag(wrapper, 'relay'))
    }

    const relays: RelayEndpoint[] = []
    for (const relayNode of relayNodes) {
        const relay = toRelayEndpoint(relayNode)
        if (relay) {
            relays.push(relay)
        }
    }

    relays.sort((a, b) => (a.c2rRtt ?? Infinity) - (b.c2rRtt ?? Infinity))

    return relays
}

export function buildRelayLatencyStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    relays: Array<{
        relayName: string
        latency: number
        addressBytes?: Uint8Array
    }>,
    destinationJids: string[]
): BinaryNode {
    const seenRelays = new Set<string>()
    const teNodes: BinaryNode[] = []
    for (const relay of relays) {
        if (!relay.relayName || seenRelays.has(relay.relayName)) continue
        seenRelays.add(relay.relayName)
        const encodedLatency = 0x2000000 + (relay.latency || 0)
        teNodes.push({
            tag: 'te',
            attrs: {
                latency: String(encodedLatency),
                relay_name: relay.relayName
            },
            content: relay.addressBytes || undefined
        })
    }

    if (destinationJids.length > 0) {
        teNodes.push({
            tag: 'destination',
            attrs: {},
            content: destinationJids.map((jid) => ({ tag: 'to', attrs: { jid } }))
        })
    }

    return callStanza(toUserJid(peerJid), 'relaylatency', callId, callCreator, undefined, teNodes)
}

export function buildTransportStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    messageType = '0',
    p2pCandRound = '0'
): BinaryNode {
    return callStanza(
        peerJid,
        'transport',
        callId,
        callCreator,
        { 'transport-message-type': messageType, 'p2p-cand-round': p2pCandRound },
        [{ tag: 'net', attrs: { medium: '2', protocol: '0' } }]
    )
}
