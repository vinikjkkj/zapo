import type { BinaryNode } from 'zapo-js/transport'
import { base64ToBytes, bytesToBase64, TEXT_DECODER } from 'zapo-js/util'

import type { RelayEndpoint } from './types.js'

export function parseRelayFromAck(ackNode: BinaryNode): {
    relays: RelayEndpoint[]
    participantJids: string[]
    uuid: string
    selfPid?: number
    peerPid?: number
    hbhKey?: Uint8Array
} {
    const relays: RelayEndpoint[] = []
    const participantJids: string[] = []
    const participantSeen = new Set<string>()
    let uuid = ''
    let selfPid: number | undefined
    let peerPid: number | undefined
    let hbhKey: Uint8Array | undefined

    if (!ackNode.content || !Array.isArray(ackNode.content)) {
        return { relays, participantJids, uuid }
    }

    for (const child of ackNode.content) {
        if (typeof child !== 'object' || !('tag' in child)) continue

        if (child.tag === 'user' && Array.isArray(child.content)) {
            for (const deviceNode of child.content) {
                if (
                    typeof deviceNode === 'object' &&
                    'tag' in deviceNode &&
                    deviceNode.tag === 'device' &&
                    deviceNode.attrs?.jid
                ) {
                    const jid = deviceNode.attrs.jid as string
                    if (!participantSeen.has(jid)) {
                        participantSeen.add(jid)
                        participantJids.push(jid)
                    }
                }
            }
        }

        if (child.tag !== 'relay') continue

        const relayNode = child as BinaryNode
        uuid = relayNode.attrs?.uuid || ''
        if (relayNode.attrs?.self_pid) selfPid = parseInt(relayNode.attrs.self_pid, 10)
        if (relayNode.attrs?.peer_pid) peerPid = parseInt(relayNode.attrs.peer_pid, 10)
        const relayContent = Array.isArray(relayNode.content) ? relayNode.content : []

        for (const rc of relayContent) {
            if (typeof rc !== 'object' || !('tag' in rc)) continue
            if (rc.tag === 'participant' && rc.attrs?.jid) {
                const jid = rc.attrs.jid as string
                if (!participantSeen.has(jid)) {
                    participantSeen.add(jid)
                    participantJids.push(jid)
                }
            }
        }

        let relayKey = ''
        const tokens: Map<string, string> = new Map()
        const authTokens: Map<string, string> = new Map()
        const rawTokens: Map<string, Uint8Array> = new Map()
        const rawAuthTokens: Map<string, Uint8Array> = new Map()

        for (const rc of relayContent) {
            if (typeof rc !== 'object' || !('tag' in rc)) continue
            const rcNode = rc as BinaryNode

            if (rcNode.tag === 'key' && rcNode.content) {
                relayKey =
                    rcNode.content instanceof Uint8Array
                        ? TEXT_DECODER.decode(rcNode.content)
                        : String(rcNode.content)
            }

            if (rcNode.tag === 'hbh_key' && rcNode.content) {
                let rawKey: Uint8Array | undefined
                if (rcNode.content instanceof Uint8Array) {
                    rawKey = rcNode.content
                } else if (typeof rcNode.content === 'string') {
                    rawKey = base64ToBytes(rcNode.content)
                }

                if (rawKey) {
                    if (rawKey.length === 30) {
                        hbhKey = rawKey
                    } else if (rawKey.length > 30) {
                        const asB64 = TEXT_DECODER.decode(rawKey).trim()
                        const decoded = base64ToBytes(asB64)
                        if (decoded.length === 30) hbhKey = decoded
                    }
                }
            }

            if (rcNode.tag === 'token' && rcNode.content) {
                const tokenId = rcNode.attrs?.id || '0'
                const tokenData =
                    rcNode.content instanceof Uint8Array
                        ? bytesToBase64(rcNode.content)
                        : String(rcNode.content)
                tokens.set(tokenId, tokenData)
                if (rcNode.content instanceof Uint8Array) {
                    rawTokens.set(tokenId, rcNode.content)
                }
            }

            if (rcNode.tag === 'auth_token' && rcNode.content) {
                const authTokenId = rcNode.attrs?.id || '0'
                const authTokenData =
                    rcNode.content instanceof Uint8Array
                        ? bytesToBase64(rcNode.content)
                        : String(rcNode.content)
                authTokens.set(authTokenId, authTokenData)
                if (rcNode.content instanceof Uint8Array) {
                    rawAuthTokens.set(authTokenId, rcNode.content)
                }
            }
        }

        for (const rc of relayContent) {
            if (typeof rc !== 'object' || !('tag' in rc)) continue
            const rcNode = rc as BinaryNode

            if (rcNode.tag === 'te2') {
                const tokenId = rcNode.attrs?.token_id || '0'
                const authTokenId = rcNode.attrs?.auth_token_id || ''
                const token = tokens.get(tokenId) || ''
                const authToken = authTokenId ? authTokens.get(authTokenId) : undefined
                const relayName = rcNode.attrs?.relay_name || ''
                const protocol = rcNode.attrs?.protocol ? parseInt(rcNode.attrs.protocol, 10) : 0

                if (!(rcNode.content instanceof Uint8Array) || rcNode.content.length < 6) continue

                const addrBytes = rcNode.content
                const addressBytes = new Uint8Array(addrBytes)

                if (addrBytes.length === 6) {
                    const ip = `${addrBytes[0]}.${addrBytes[1]}.${addrBytes[2]}.${addrBytes[3]}`
                    const port = (addrBytes[4] << 8) | addrBytes[5]

                    relays.push({
                        ip,
                        port,
                        token,
                        authToken,
                        rawAuthToken: authTokenId ? rawAuthTokens.get(authTokenId) : undefined,
                        rawToken: rawTokens.get(tokenId),
                        key: relayKey,
                        relayId: parseInt(rcNode.attrs?.relay_id || '0', 10),
                        protocol,
                        c2rRtt: rcNode.attrs?.c2r_rtt
                            ? parseInt(rcNode.attrs.c2r_rtt, 10)
                            : undefined,
                        relayName,
                        addressBytes,
                        authTokenId: authTokenId || tokenId
                    })
                }
            }
        }
    }

    relays.sort((a, b) => (a.c2rRtt ?? Infinity) - (b.c2rRtt ?? Infinity))
    return { relays, participantJids, uuid, selfPid, peerPid, hbhKey }
}
