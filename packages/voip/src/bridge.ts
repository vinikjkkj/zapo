import type { Logger } from 'zapo-js'
import { buildDeviceJid, parseSignalAddressFromJid } from 'zapo-js/protocol'
import type { BinaryNode } from 'zapo-js/transport'

import { NativeCallManager, type NativeCallManagerConfig } from './call-manager.js'
import { createCallAck } from './signaling.js'
import type { VoipSocket } from './voip-socket.js'

export interface CreateVoipManagerOptions {
    logger?: Logger
    debug?: boolean
    maxConcurrentCalls?: number
}

export function createVoipManager(
    socket: VoipSocket,
    options: CreateVoipManagerOptions = {}
): NativeCallManager {
    const config: NativeCallManagerConfig = {
        sock: socket,
        logger: options.logger,
        debug: options.debug ?? false,
        maxConcurrentCalls: options.maxConcurrentCalls
    }
    return new NativeCallManager(config)
}

function normalizePeerJid(peerJid: string): string {
    try {
        const { user, server, device } = parseSignalAddressFromJid(peerJid)
        if (!server) return peerJid
        return buildDeviceJid(user, server, device)
    } catch {
        return peerJid
    }
}

const RECEIPT_CALL_TAGS = new Set(['offer', 'accept', 'preaccept', 'terminate', 'transport'])

export async function routeCallStanza(
    manager: NativeCallManager,
    socket: VoipSocket,
    node: BinaryNode
): Promise<string | null> {
    const inner = Array.isArray(node.content) ? (node.content[0] as BinaryNode) : null
    if (!inner) return null

    const tag = inner.tag
    const peerJid = node.attrs.from

    await socket.sendNode(createCallAck(node.attrs.id, peerJid, tag))

    const normalizedPeerJid = normalizePeerJid(peerJid)

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

export async function routeCallAck(manager: NativeCallManager, node: BinaryNode): Promise<void> {
    await manager.handleCallAck(node)
}

export async function routeCallReceipt(socket: VoipSocket, node: BinaryNode): Promise<boolean> {
    if (!Array.isArray(node.content)) return false

    const inner = node.content[0] as BinaryNode
    if (!inner || typeof inner !== 'object') return false
    if (!RECEIPT_CALL_TAGS.has(inner.tag)) return false

    const peerJid = node.attrs.from
    await socket.sendNode({
        tag: 'ack',
        attrs: {
            id: node.attrs.id,
            to: peerJid,
            class: 'receipt',
            type: node.attrs.type || 'retry'
        }
    })

    return true
}
