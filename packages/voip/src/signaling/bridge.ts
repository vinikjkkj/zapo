import { createNoopLogger, type Logger } from 'zapo-js'
import { normalizeDeviceJid } from 'zapo-js/protocol'
import { type BinaryNode, buildAckNode, getFirstNodeChild } from 'zapo-js/transport'
import { toError } from 'zapo-js/util'

import type { WaCallManager } from '../call/WaCallManager.js'
import type { WaVoipDeps } from '../types.js'

const RECEIPT_CALL_TAGS = new Set([
    'offer',
    'accept',
    'preaccept',
    'terminate',
    'transport',
    'relaylatency',
    'mute_v2'
])

export async function routeCallStanza(
    manager: WaCallManager,
    deps: WaVoipDeps,
    node: BinaryNode,
    logger?: Logger
): Promise<string | null> {
    const log = logger ?? createNoopLogger()
    const inner = getFirstNodeChild(node)
    if (!inner) return null

    const tag = inner.tag
    const peerJid = node.attrs.from

    await deps.lowLevelCoordinator.sendNode(
        buildAckNode({
            kind: 'custom',
            ackClass: 'call',
            to: peerJid,
            id: node.attrs.id,
            type: tag
        })
    )

    let normalizedPeerJid: string
    try {
        normalizedPeerJid = normalizeDeviceJid(peerJid)
    } catch (err) {
        log.warn('failed to normalize call peer jid', {
            from: peerJid,
            message: toError(err).message
        })
        return tag
    }

    switch (tag) {
        case 'offer':
            await manager.handleCallOffer(node, normalizedPeerJid)
            break
        case 'preaccept':
            await manager.handleCallPreaccept(node, normalizedPeerJid)
            break
        case 'accept':
            await manager.handleCallAccept(node, normalizedPeerJid)
            break
        case 'transport':
            await manager.handleCallTransport(node, normalizedPeerJid)
            break
        case 'terminate':
            await manager.handleCallTerminate(node)
            break
        case 'relaylatency':
            await manager.handleCallRelaylatency(node, normalizedPeerJid)
            break
        case 'mute_v2':
            await manager.handleCallMuteV2(node, normalizedPeerJid)
            break
        case 'relay_election':
            manager.handleRelayElection(node)
            break
        case 'reject':
            break
        default:
            break
    }

    return tag
}

export async function routeCallAck(manager: WaCallManager, node: BinaryNode): Promise<void> {
    await manager.handleCallAck(node)
}

export async function routeCallReceipt(deps: WaVoipDeps, node: BinaryNode): Promise<boolean> {
    const inner = getFirstNodeChild(node)
    if (!inner) return false
    if (!RECEIPT_CALL_TAGS.has(inner.tag)) return false

    const peerJid = node.attrs.from
    await deps.lowLevelCoordinator.sendNode(
        buildAckNode({
            kind: 'custom',
            ackClass: 'receipt',
            to: peerJid,
            id: node.attrs.id,
            type: node.attrs.type || 'retry'
        })
    )

    return true
}
