import {
    type BinaryNode,
    getNodeChildren,
    getNodeChildrenByTag,
    getNodeTextContent
} from 'zapo-js/transport'
import { base64ToBytes, bytesToBase64 } from 'zapo-js/util'

import { TEXT_DECODER } from '../bytes.js'
import type { RelayEndpoint } from '../types.js'

/** A relay advertises its transport endpoints under `te` or `te2`, never both. */
const RELAY_ENDPOINT_TAGS = ['te2', 'te'] as const

/** 4 address bytes + a big-endian u16 port. */
const IPV4_ENDPOINT_BYTES = 6

/** 16 address bytes + a big-endian u16 port. */
const IPV6_ENDPOINT_BYTES = 18

/** An IPv4 block followed by an IPv6 block: one relay reachable over both families. */
const DUAL_STACK_ENDPOINT_BYTES = IPV4_ENDPOINT_BYTES + IPV6_ENDPOINT_BYTES

function parseFlagAttr(value: string | undefined): boolean | undefined {
    if (value === undefined) return undefined
    return value === '1' || value === 'true'
}

/** RFC 5952 text form: lowercase, leading zeroes dropped, longest zero run collapsed to `::`. */
function formatIpv6(bytes: Uint8Array): string {
    const groups = new Array<string>(8)
    let bestStart = -1
    let bestLen = 0
    let runStart = -1
    let runLen = 0

    for (let i = 0; i < 8; i++) {
        const value = (bytes[i * 2] << 8) | bytes[i * 2 + 1]
        groups[i] = value.toString(16)
        if (value === 0) {
            if (runStart < 0) runStart = i
            runLen++
            if (runLen > bestLen) {
                bestStart = runStart
                bestLen = runLen
            }
        } else {
            runStart = -1
            runLen = 0
        }
    }

    if (bestLen < 2) return groups.join(':')
    return `${groups.slice(0, bestStart).join(':')}::${groups.slice(bestStart + bestLen).join(':')}`
}

/**
 * Parses the `<relay>` descriptor out of a call ack, or out of its inner
 * `<call>` node.
 *
 * A dual-stack endpoint is one relay reachable over both families, so it
 * expands into two entries, IPv4 first, that share every non-address field.
 * The attributes of the `<relay>` node are copied onto every endpoint.
 */
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

        const descriptor = {
            domainName: relayNode.attrs?.domain_name,
            enableEdgerayDtlsActiveMode: parseFlagAttr(
                relayNode.attrs?.enable_edgeray_dtls_active_mode
            )
        }

        const relayContent = getNodeChildren(relayNode)

        for (const rc of getNodeChildrenByTag(relayNode, 'participant')) {
            const jid = rc.attrs?.jid
            if (jid && !participantSeen.has(jid)) {
                participantSeen.add(jid)
                participantJids.push(jid)
            }
        }

        let relayKey = ''
        const tokens: Map<string, string> = new Map()
        const authTokens: Map<string, string> = new Map()
        const rawTokens: Map<string, Uint8Array> = new Map()
        const rawAuthTokens: Map<string, Uint8Array> = new Map()

        for (const rc of relayContent) {
            if (typeof rc !== 'object' || !('tag' in rc)) continue
            const rcNode = rc

            if (rcNode.tag === 'key' && rcNode.content) {
                relayKey = getNodeTextContent(rcNode) ?? ''
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

        for (const endpointTag of RELAY_ENDPOINT_TAGS) {
            for (const rcNode of getNodeChildrenByTag(relayNode, endpointTag)) {
                const addrBytes = rcNode.content
                if (!(addrBytes instanceof Uint8Array)) continue

                const addrLength = addrBytes.length
                if (
                    addrLength !== IPV4_ENDPOINT_BYTES &&
                    addrLength !== IPV6_ENDPOINT_BYTES &&
                    addrLength !== DUAL_STACK_ENDPOINT_BYTES
                ) {
                    continue
                }

                const tokenId = rcNode.attrs?.token_id || '0'
                const authTokenId = rcNode.attrs?.auth_token_id || ''
                const authToken = authTokenId ? authTokens.get(authTokenId) : undefined

                const shared = {
                    token: tokens.get(tokenId) || '',
                    authToken,
                    rawAuthToken: authTokenId ? rawAuthTokens.get(authTokenId) : undefined,
                    rawToken: rawTokens.get(tokenId),
                    key: relayKey,
                    relayId: parseInt(rcNode.attrs?.relay_id || '0', 10),
                    protocol: rcNode.attrs?.protocol ? parseInt(rcNode.attrs.protocol, 10) : 0,
                    c2rRtt: rcNode.attrs?.c2r_rtt ? parseInt(rcNode.attrs.c2r_rtt, 10) : undefined,
                    relayName: rcNode.attrs?.relay_name || '',
                    authTokenId: authTokenId || tokenId,
                    isFna: rcNode.attrs?.is_fna === '1',
                    ...descriptor
                }

                if (addrLength !== IPV6_ENDPOINT_BYTES) {
                    const v4 = addrBytes.subarray(0, IPV4_ENDPOINT_BYTES)
                    relays.push({
                        ...shared,
                        ip: `${v4[0]}.${v4[1]}.${v4[2]}.${v4[3]}`,
                        port: (v4[4] << 8) | v4[5],
                        addressBytes: new Uint8Array(v4)
                    })
                }

                if (addrLength !== IPV4_ENDPOINT_BYTES) {
                    const v6 =
                        addrLength === IPV6_ENDPOINT_BYTES
                            ? addrBytes
                            : addrBytes.subarray(IPV4_ENDPOINT_BYTES)
                    relays.push({
                        ...shared,
                        ip: formatIpv6(v6),
                        port: (v6[16] << 8) | v6[17],
                        addressBytes: new Uint8Array(v6)
                    })
                }
            }
        }
    }

    relays.sort((a, b) => {
        if (!!a.isFna !== !!b.isFna) return a.isFna ? 1 : -1
        return (a.c2rRtt ?? Infinity) - (b.c2rRtt ?? Infinity)
    })
    return { relays, participantJids, uuid, selfPid, peerPid, hbhKey }
}
