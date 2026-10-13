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
            await manager.handleCallTransport(node)
            break
        case 'terminate':
            await manager.handleCallTerminate(node, normalizedPeerJid)
            break
        case 'relaylatency':
            manager.handleCallRelaylatency(node, normalizedPeerJid)
            break
        case 'mute_v2':
            manager.handleCallMuteV2(node, normalizedPeerJid)
            break
        case 'user_action':
            manager.handleCallUserAction(node, normalizedPeerJid)
            break
        case 'raise_hand':
            manager.handleCallRaiseHand(node, normalizedPeerJid)
            break
        case 'screen_share':
        case 'screen':
            manager.handleCallScreenShare(node, normalizedPeerJid)
            break
        case 'video':
            manager.handleCallVideoState(node, normalizedPeerJid)
            break
        case 'group_update':
            await manager.handleCallGroupUpdate(node)
            break
        case 'enc_rekey':
            await manager.handleCallEncRekey(node, normalizedPeerJid)
            break
        case 'relay_election':
            manager.handleRelayElection(node)
            break
    }

    return tag
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
