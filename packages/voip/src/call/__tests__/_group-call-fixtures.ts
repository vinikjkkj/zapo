import assert from 'node:assert/strict'

import type { BinaryNode } from 'zapo-js/transport'

import { encodeWAMessage } from '../../signaling/call-key.js'
import { type WaVoipDeps, type WaVoipStores } from '../../types.js'
import { WaCallManager } from '../WaCallManager.js'

export const SELF_DEVICE = '1111111111:3@lid'

export const CREATOR = '2222222222@lid'

export const CREATOR_DEVICE = '2222222222:0@lid'

export const OTHER = '3333333333@lid'

export const OTHER_DEVICE = '3333333333:0@lid'

export const GROUP_JID = '120363000000000000@g.us'

export interface Mock {
    readonly deps: WaVoipDeps
    readonly stores: WaVoipStores
    readonly sent: BinaryNode[]
    /** What `decryptMessage` hands back; `null` makes every decrypt fail. */
    setDecrypted(key: Uint8Array | null): void
}

export function createMock(): Mock {
    const sent: BinaryNode[] = []
    let decrypted: Promise<Uint8Array> | null = null
    const deps = {
        isMobilePrimary: () => false,
        authClient: {
            getCurrentCredentials: () => ({ meJid: SELF_DEVICE, meLid: SELF_DEVICE })
        },
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                sent.push(node)
            }
        },
        signalProtocol: {
            encryptMessagesBatch: async (requests: readonly unknown[]) =>
                requests.map(() => ({ type: 'msg', ciphertext: Uint8Array.of(1, 2, 3) })),
            decryptMessage: async () => {
                if (!decrypted) throw new Error('no session')
                return decrypted
            }
        },
        signalDeviceSync: {
            syncDeviceList: async (jids: readonly string[]) =>
                jids.map((jid) => ({ jid, deviceJids: [jid.replace('@', ':0@')] })),
            queryLidsByPhoneJids: async () => []
        },
        messageDispatch: { syncSignalSession: async () => undefined },
        sessionResolver: {
            ensureSessionsBatch: async (devices: readonly string[]) =>
                devices.map((jid) => ({ address: jid, session: {} }))
        }
    } as unknown as WaVoipDeps
    const stores = { privacyToken: { getByJid: async () => undefined } } as unknown as WaVoipStores
    return {
        deps,
        stores,
        sent,
        setDecrypted: (key) => {
            decrypted = key ? encodeWAMessage({ call: { callKey: key } }) : null
        }
    }
}

export function createManager(
    mock: Mock,
    options: { participantAudio?: boolean } = {}
): WaCallManager {
    return new WaCallManager({
        deps: mock.deps,
        stores: mock.stores,
        maxConcurrentCalls: 2,
        mediaMode: 'remote',
        participantAudio: options.participantAudio
    })
}

export function callNode(
    tag: string,
    from: string,
    attrs: Record<string, string>,
    content?: BinaryNode[]
) {
    return {
        tag: 'call',
        attrs: { from, id: `${tag.toUpperCase()}MSGID` },
        content: [{ tag, attrs, content }]
    } satisfies BinaryNode
}

export function rosterNode(transactionId: string, states: Record<string, string>): BinaryNode {
    return {
        tag: 'group_info',
        attrs: { media: 'audio', 'connected-limit': '32', 'transaction-id': transactionId },
        content: [
            { jid: '1111111111@lid', device: SELF_DEVICE },
            { jid: CREATOR, device: CREATOR_DEVICE },
            { jid: OTHER, device: OTHER_DEVICE }
        ]
            .filter((user) => states[user.jid] !== undefined)
            .map((user) => ({
                tag: 'user',
                attrs: { jid: user.jid, state: states[user.jid] },
                content: [{ tag: 'device', attrs: { jid: user.device } }]
            }))
    }
}

export const EVERYONE = {
    '1111111111@lid': 'invited',
    [CREATOR]: 'connected',
    [OTHER]: 'connected'
}

export function groupOffer(callId: string, attrs: Record<string, string> = {}): BinaryNode {
    return callNode(
        'offer',
        CREATOR_DEVICE,
        { 'call-id': callId, 'call-creator': CREATOR_DEVICE, ...attrs },
        [{ tag: 'audio', attrs: { enc: 'opus', rate: '16000' } }, rosterNode('8', EVERYONE)]
    )
}

export function joinableGroupOffer(callId: string): BinaryNode {
    return groupOffer(callId, { 'group-jid': GROUP_JID, joinable: '1' })
}

export function terminate(
    callId: string,
    from: string,
    attrs: Record<string, string> = {}
): BinaryNode {
    return callNode('terminate', from, {
        'call-id': callId,
        'call-creator': CREATOR_DEVICE,
        ...attrs
    })
}

export function sentInner(mock: Mock, tag: string): BinaryNode[] {
    return mock.sent.filter(
        (node) => Array.isArray(node.content) && (node.content as BinaryNode[])[0]?.tag === tag
    )
}

export function innerOf(node: BinaryNode): BinaryNode {
    return (node.content as BinaryNode[])[0]
}

/** An incoming group call, accepted and active. */
export async function activeGroupCall(mock: Mock, manager: WaCallManager, callId: string) {
    await manager.handleCallOffer(joinableGroupOffer(callId), CREATOR_DEVICE)
    await manager.acceptCall(callId)
    const call = manager.getCall(callId)
    assert.ok(call)
    call.applyTransition({ type: 'media_connected' })
    return call
}

/** A minimal reissued `<relay>`: one relay, its token and key. */
export function relayNode(selfPid: string): BinaryNode {
    return {
        tag: 'relay',
        attrs: { self_pid: selfPid, 'transaction-id': '3' },
        content: [
            { tag: 'key', attrs: {}, content: 'RELAYKEY' },
            { tag: 'token', attrs: { id: '0' }, content: Uint8Array.of(0xd1) },
            {
                tag: 'te2',
                attrs: { relay_name: 'gru1c02', relay_id: '0', token_id: '0' },
                content: Uint8Array.of(10, 0, 0, 1, 0x0d, 0x96)
            }
        ]
    }
}
