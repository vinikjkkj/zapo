import type { BinaryNode } from 'zapo-js/transport'

import { type WaVoipDeps, type WaVoipStores } from '../../types.js'

export function createMockDeps(
    credentials: { meJid: string; meLid: string } = {
        meJid: '1111111111@lid',
        meLid: '1111111111@lid'
    }
): { deps: WaVoipDeps; stores: WaVoipStores; sent: BinaryNode[] } {
    const sent: BinaryNode[] = []
    const deps = {
        isMobilePrimary: () => false,
        authClient: {
            getCurrentCredentials: () => ({ ...credentials, signedIdentity: undefined })
        },
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                sent.push(node)
            },
            query: async () => undefined
        },
        signalProtocol: {
            encryptMessage: async () => ({ type: 'msg', ciphertext: new Uint8Array([1, 2, 3]) }),
            encryptMessagesBatch: async (requests: readonly unknown[]) =>
                requests.map(() => ({ type: 'msg', ciphertext: new Uint8Array([1, 2, 3]) })),
            decryptMessage: async () => new Uint8Array([1, 2, 3])
        },
        signalDeviceSync: {
            syncDeviceList: async () => [{ deviceJids: ['2222222222:0@lid'] }],
            queryLidsByPhoneJids: async () => []
        },
        messageDispatch: {
            syncSignalSession: async () => undefined
        },
        sessionResolver: {
            ensureSessionsBatch: async () => []
        }
    } as unknown as WaVoipDeps
    const stores = {
        privacyToken: { getByJid: async () => undefined }
    } as unknown as WaVoipStores

    return { deps, stores, sent }
}

export function buildOfferNode(
    callId: string,
    from = '2222222222:0@lid',
    callerPn?: string,
    extra: readonly BinaryNode[] = []
): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'OFFERMSGID' },
        content: [
            {
                tag: 'offer',
                attrs: {
                    'call-id': callId,
                    'call-creator': from,
                    ...(callerPn ? { caller_pn: callerPn } : {})
                },
                content: [
                    { tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, content: undefined },
                    ...extra
                ]
            }
        ]
    }
}

/** An `<enc>` carrying the call key, which sends the offer through signal decryption. */
export const CALL_KEY_ENC_NODE: BinaryNode = {
    tag: 'enc',
    attrs: { v: '2', type: 'msg' },
    content: new Uint8Array([1, 2, 3])
}

export function buildAcceptNode(
    callId: string,
    from = '2222222222:0@lid',
    callCreator = from,
    content?: BinaryNode[]
): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'ACCEPTMSGID' },
        content: [
            {
                tag: 'accept',
                attrs: { 'call-id': callId, 'call-creator': callCreator },
                content
            }
        ]
    }
}

export interface AckRelay {
    readonly name: string
    readonly ip: readonly [number, number, number, number]
    readonly protocol?: string
    readonly c2rRtt?: number
    /** IPv6 address and port appended after the IPv4 block: one relay on both families. */
    readonly ipv6?: readonly number[]
}

/**
 * The server's ack to our offer: the relay block, every device of the call as a
 * `<participant>`, and one `<te2>` per relay, all sharing one token and key.
 */
export function buildOfferAckNode(
    callId: string,
    participantJids: readonly string[],
    relays: readonly AckRelay[] = [{ name: 'gru1c01', ip: [10, 0, 0, 1], c2rRtt: 17 }]
): BinaryNode {
    return {
        tag: 'ack',
        attrs: { class: 'call', type: 'offer', 'call-id': callId, id: 'OFFERMSGID' },
        content: [
            {
                tag: 'relay',
                attrs: { uuid: 'UUID', self_pid: '1', peer_pid: '2' },
                content: [
                    ...participantJids.map((jid) => ({ tag: 'participant', attrs: { jid } })),
                    { tag: 'token', attrs: { id: '0' }, content: new Uint8Array([7, 7, 7]) },
                    { tag: 'key', attrs: {}, content: 'RELAYKEY' },
                    ...relays.map((relay) => ({
                        tag: 'te2',
                        attrs: {
                            relay_name: relay.name,
                            token_id: '0',
                            ...(relay.protocol ? { protocol: relay.protocol } : {}),
                            ...(relay.c2rRtt !== undefined ? { c2r_rtt: String(relay.c2rRtt) } : {})
                        },
                        content: new Uint8Array([...relay.ip, 0x0d, 0x96, ...(relay.ipv6 ?? [])])
                    }))
                ]
            }
        ]
    }
}

/** The `<relay>` an `<accept>` to our offer carries, naming the device that won. */
export function acceptRelayNode(jid: string, pid: string): BinaryNode {
    return { tag: 'relay', attrs: {}, content: [{ tag: 'participant', attrs: { pid, jid } }] }
}

/** Holds the decryption of the offer's call key until released. */
export function holdCallKeyDecrypt(deps: WaVoipDeps): () => void {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
        release = resolve
    })
    const signal = deps.signalProtocol as unknown as { decryptMessage: () => Promise<Uint8Array> }
    signal.decryptMessage = async () => {
        await gate
        return new Uint8Array([1, 2, 3])
    }
    return release
}

export function findByInnerTag(nodes: readonly BinaryNode[], tag: string): BinaryNode[] {
    return nodes.filter((node) => {
        const inner = Array.isArray(node.content) ? node.content[0] : null
        return !!inner && typeof inner === 'object' && 'tag' in inner && inner.tag === tag
    })
}

export function callIdOf(node: BinaryNode): string | undefined {
    const inner = Array.isArray(node.content) ? node.content[0] : null
    return inner && typeof inner === 'object' && 'attrs' in inner
        ? inner.attrs['call-id']
        : undefined
}

export function tagsSentFor(sent: readonly BinaryNode[], callId: string): string[] {
    return sent
        .filter((node) => callIdOf(node) === callId)
        .map((node) => (node.content as BinaryNode[])[0].tag)
}

/** Holds peer device resolution, the first await of incoming call setup, until released. */
export function holdDeviceSync(deps: WaVoipDeps): () => void {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
        release = resolve
    })
    const sync = deps.signalDeviceSync as unknown as { syncDeviceList: () => Promise<unknown> }
    sync.syncDeviceList = async () => {
        await gate
        return [{ deviceJids: ['2222222222:0@lid'] }]
    }
    return release
}

export const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))
