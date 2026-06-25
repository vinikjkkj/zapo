import { randomBytes } from 'node:crypto'

import { proto } from 'zapo-js/proto'
import type { BinaryNode } from 'zapo-js/transport'
import { bytesToHex, toBytesView } from 'zapo-js/util'

import type { NodeInfo, RelayEndpoint } from './types.js'
import type { VoipSocket } from './voip-socket.js'

function writeRandomPadMax16(message: Uint8Array): Uint8Array {
    const padLength = (randomBytes(1)[0] & 0x0f) + 1
    const out = new Uint8Array(message.length + padLength)
    out.set(message, 0)
    out.fill(padLength, message.length)
    return out
}

function encodeWAMessage(message: Parameters<typeof proto.Message.encode>[0]): Uint8Array {
    return writeRandomPadMax16(proto.Message.encode(message).finish())
}

function encodeSignedDeviceIdentity(
    account: Parameters<typeof proto.ADVSignedDeviceIdentity.encode>[0]
): Uint8Array {
    return proto.ADVSignedDeviceIdentity.encode(account).finish()
}

function unpadRandomMax16(bytes: Uint8Array): Uint8Array {
    const data = new Uint8Array(bytes)
    if (data.length === 0) {
        throw new Error('unpadRandomMax16 given empty bytes')
    }
    const pad = data[data.length - 1]
    if (pad > data.length) {
        throw new Error(`unpad given ${data.length} bytes, but pad is ${pad}`)
    }
    return data.subarray(0, data.length - pad)
}

export function generateCallId(): string {
    const bytes = new Uint8Array(16)
    for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256)
    }

    return bytesToHex(bytes).toUpperCase()
}

export function generateCallStanzaId(): string {
    return bytesToHex(toBytesView(randomBytes(16))).toUpperCase()
}

export function extractNodeInfo(node: BinaryNode): NodeInfo | null {
    if (!node.content || !Array.isArray(node.content)) {
        return null
    }

    const innerNode = node.content[0] as BinaryNode
    if (!innerNode || typeof innerNode !== 'object') {
        return null
    }

    return {
        tag: innerNode.tag,
        peerJid: node.attrs.from,
        callId: innerNode.attrs?.['call-id'] || '',
        peerPlatform: node.attrs.platform || '',
        peerAppVersion: node.attrs.version || '',
        epochId: innerNode.attrs?.e,
        timestamp: innerNode.attrs?.t,
        innerNode
    }
}

export function extractRelayEndpoints(node: BinaryNode): RelayEndpoint[] {
    const relays: RelayEndpoint[] = []
    if (!node.content || !Array.isArray(node.content)) {
        return relays
    }

    for (const child of node.content) {
        if (typeof child !== 'object' || !('tag' in child)) {
            continue
        }

        if (child.tag === 'relay') {
            const relay: RelayEndpoint = {
                ip: (child.attrs?.ip as string) || '',
                port: parseInt((child.attrs?.port as string) || '3480', 10),
                token: (child.attrs?.token as string) || '',
                key: (child.attrs?.['relay-key'] as string) || (child.attrs?.key as string) || '',
                relayId: parseInt((child.attrs?.['relay-id'] as string) || '0', 10),
                c2rRtt: child.attrs?.['c2r-rtt']
                    ? parseInt(child.attrs['c2r-rtt'] as string, 10)
                    : undefined
            }

            if (relay.ip && relay.token) {
                relays.push(relay)
            }
        }

        if (child.tag === 'relays' && Array.isArray(child.content)) {
            for (const relayNode of child.content) {
                if (
                    typeof relayNode === 'object' &&
                    'tag' in relayNode &&
                    relayNode.tag === 'relay'
                ) {
                    const relay: RelayEndpoint = {
                        ip: (relayNode.attrs?.ip as string) || '',
                        port: parseInt((relayNode.attrs?.port as string) || '3480', 10),
                        token: (relayNode.attrs?.token as string) || '',
                        key:
                            (relayNode.attrs?.['relay-key'] as string) ||
                            (relayNode.attrs?.key as string) ||
                            '',
                        relayId: parseInt((relayNode.attrs?.['relay-id'] as string) || '0', 10),
                        c2rRtt: relayNode.attrs?.['c2r-rtt']
                            ? parseInt(relayNode.attrs['c2r-rtt'] as string, 10)
                            : undefined
                    }

                    if (relay.ip && relay.token) {
                        relays.push(relay)
                    }
                }
            }
        }
    }

    relays.sort((a, b) => (a.c2rRtt ?? Infinity) - (b.c2rRtt ?? Infinity))

    return relays
}

export async function decryptCallKeyInNode(
    sock: VoipSocket,
    node: BinaryNode,
    peerJid: string
): Promise<{ node: BinaryNode; callKey?: Uint8Array }> {
    const cloned = structuredClone(node)
    if (!cloned.content || !Array.isArray(cloned.content)) {
        return { node: cloned }
    }

    let encNode: BinaryNode | undefined
    let encParent: any = null
    let encIndex = -1

    for (let i = 0; i < cloned.content.length; i++) {
        const child = cloned.content[i] as BinaryNode
        if (child?.tag === 'enc' && child.attrs?.type) {
            encNode = child
            encParent = cloned.content
            encIndex = i
            break
        }
    }

    if (!encNode) {
        const destinationNode = cloned.content.find(
            (c: any) => typeof c === 'object' && 'tag' in c && c.tag === 'destination'
        ) as BinaryNode | undefined

        if (destinationNode && Array.isArray(destinationNode.content)) {
            for (const toNode of destinationNode.content) {
                if (typeof toNode === 'object' && 'tag' in toNode && toNode.tag === 'to') {
                    const toContent = Array.isArray(toNode.content) ? toNode.content : []
                    for (let i = 0; i < toContent.length; i++) {
                        const child = toContent[i] as BinaryNode
                        if (child?.tag === 'enc' && child.attrs?.type) {
                            encNode = child
                            encParent = toContent
                            encIndex = i
                            break
                        }
                    }
                    if (encNode) {
                        break
                    }
                }
            }
        }
    }

    if (!encNode || !encNode.content) {
        return { node: cloned }
    }

    try {
        const encType = encNode.attrs.type
        const encContent = encNode.content as Uint8Array
        if (encContent instanceof Uint8Array) {
            const decrypted = await sock.signalRepository.decryptMessage({
                jid: peerJid,
                type: encType,
                ciphertext: encContent
            })

            const unpadded = unpadRandomMax16(decrypted)
            const message = proto.Message.decode(unpadded)
            const callKey = message.call?.callKey

            if (!callKey || callKey.length !== 32) {
                throw new Error(`invalid callKey: expected 32 bytes, got ${callKey?.length || 0}`)
            }

            encParent[encIndex] = {
                tag: 'enc',
                attrs: { v: '2' },
                content: new Uint8Array(callKey)
            }

            return { node: cloned, callKey: new Uint8Array(callKey) }
        }
    } catch (err: any) {
        console.error(`[Signaling] Decrypt error: ${err.message}`)
    }

    return { node: cloned }
}

const CAPABILITY_OFFER = new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe4, 0xbb, 0x07])
const CAPABILITY_PREACCEPT = new Uint8Array([0x01, 0x05, 0xff, 0x09, 0xe4, 0xbb, 0x07])

export async function buildOfferStanza(
    sock: VoipSocket,
    callId: string,
    callKey: Uint8Array,
    peerJid: string,
    _deviceJids: string[],
    isVideo: boolean
): Promise<BinaryNode> {
    const meLid = sock.authState?.creds?.me?.lid
    const meId = sock.authState?.creds?.me?.id
    const callCreator = meLid || meId || ''

    const rawDevices = await sock.getUSyncDevices([peerJid], true, false)

    const devices = rawDevices
        .map((d: any) => {
            if (d.jid) return d.jid as string
            if (d.user) {
                return `${d.user}${d.device ? `:${d.device}` : ''}@lid`
            }
            return null
        })
        .filter((jid: string | null): jid is string => typeof jid === 'string' && jid.includes('@'))

    if (devices.length === 0) {
        console.warn(`[buildOfferStanza] No valid device JIDs for ${peerJid}, raw:`, rawDevices)
    }

    await sock.assertSessions(devices)

    const { nodes: destinations, shouldIncludeDeviceIdentity } = await sock.createParticipantNodes(
        devices,
        { call: { callKey: new Uint8Array(callKey) } },
        { count: '0' }
    )

    const offerContent: BinaryNode[] = []

    try {
        const peerJidNormalized = peerJid.replace(/:\d+@/, '@')
        const tctokenData = await sock.authState?.keys?.get?.('tctoken', [peerJidNormalized])
        const tctoken = tctokenData?.[peerJidNormalized]?.token
        if (tctoken) {
            offerContent.push({
                tag: 'privacy',
                attrs: {},
                content: tctoken instanceof Uint8Array ? tctoken : new Uint8Array(tctoken)
            })
        }
    } catch {}

    offerContent.push(
        { tag: 'audio', attrs: { enc: 'opus', rate: '8000' }, content: undefined },
        { tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, content: undefined }
    )

    if (isVideo) {
        offerContent.push({
            tag: 'video',
            attrs: {
                enc: 'vp8',
                dec: 'vp8',
                orientation: '0',
                screen_width: '1920',
                screen_height: '1080',
                device_orientation: '0'
            },
            content: undefined
        })
    }

    offerContent.push({ tag: 'net', attrs: { medium: '3' }, content: undefined })

    offerContent.push({
        tag: 'capability',
        attrs: { ver: '1' },
        content: CAPABILITY_OFFER
    })

    offerContent.push({ tag: 'destination', attrs: {}, content: destinations })

    offerContent.push({
        tag: 'encopt',
        attrs: { keygen: '2' },
        content: undefined
    })

    if (shouldIncludeDeviceIdentity && sock.authState?.creds?.account) {
        offerContent.push({
            tag: 'device-identity',
            attrs: {},
            content: encodeSignedDeviceIdentity(sock.authState.creds.account)
        })
    }

    return {
        tag: 'call',
        attrs: { to: peerJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'offer',
                attrs: { 'call-id': callId, 'call-creator': callCreator },
                content: offerContent
            }
        ]
    }
}

export async function buildAcceptStanza(
    sock: VoipSocket,
    callId: string,
    callKey: Uint8Array,
    peerJid: string,
    callCreator: string,
    isVideo: boolean
): Promise<BinaryNode> {
    await sock.assertSessions([callCreator], true)

    const callMessage = { call: { callKey: new Uint8Array(callKey) } }
    const bytes = encodeWAMessage(callMessage)

    let encNode: BinaryNode
    let shouldIncludeDeviceIdentity = false

    try {
        const { type, ciphertext } = await sock.signalRepository.encryptMessage({
            jid: callCreator,
            data: bytes
        })

        if (type === 'pkmsg') {
            shouldIncludeDeviceIdentity = true
        }

        encNode = {
            tag: 'enc',
            attrs: { v: '2', type, count: '0' },
            content: ciphertext
        }
    } catch (err: any) {
        throw new Error(`Failed to encrypt accept for ${callCreator}: ${err.message}`)
    }

    const acceptContent: BinaryNode[] = [
        { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
        { tag: 'net', attrs: { medium: '3' } },
        encNode,
        { tag: 'encopt', attrs: { keygen: '2' } }
    ]

    if (shouldIncludeDeviceIdentity && sock.authState?.creds?.account) {
        acceptContent.push({
            tag: 'device-identity',
            attrs: {},
            content: encodeSignedDeviceIdentity(sock.authState.creds.account)
        })
    }

    if (isVideo) {
        acceptContent.push({ tag: 'video', attrs: { enc: 'vp8' } })
    }

    const toJidClean = peerJid.replace(/:\d+@/, '@')
    return {
        tag: 'call',
        attrs: { to: toJidClean, id: generateCallStanzaId() },
        content: [
            {
                tag: 'accept',
                attrs: { 'call-id': callId, 'call-creator': callCreator },
                content: acceptContent
            }
        ]
    }
}

export function buildTerminateStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    audioDurationMs?: number
): BinaryNode {
    const attrs: Record<string, string> = {
        'call-id': callId,
        'call-creator': callCreator
    }
    if (audioDurationMs !== undefined && audioDurationMs >= 0) {
        const ms = String(Math.floor(audioDurationMs))
        attrs.duration = ms
        attrs.audio_duration = ms
    }

    return {
        tag: 'call',
        attrs: { to: peerJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'terminate',
                attrs,
                content: undefined
            }
        ]
    }
}

export function buildRejectStanza(
    peerJid: string,
    callId: string,
    callCreator: string
): BinaryNode {
    const toJidClean = peerJid.replace(/:\d+@/, '@')
    return {
        tag: 'call',
        attrs: { to: toJidClean, id: generateCallStanzaId() },
        content: [
            {
                tag: 'reject',
                attrs: { 'call-id': callId, 'call-creator': callCreator }
            }
        ]
    }
}

export function buildPreacceptStanza(
    peerJid: string,
    callId: string,
    callCreator: string
): BinaryNode {
    return {
        tag: 'call',
        attrs: { to: peerJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'preaccept',
                attrs: { 'call-id': callId, 'call-creator': callCreator },
                content: [
                    { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
                    { tag: 'encopt', attrs: { keygen: '2' } },
                    { tag: 'capability', attrs: { ver: '1' }, content: CAPABILITY_PREACCEPT }
                ]
            }
        ]
    }
}

export function createCallAck(nodeId: string, peerJid: string, type: string): BinaryNode {
    return {
        tag: 'ack',
        attrs: { id: nodeId, to: peerJid, class: 'call', type }
    }
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
    destinationJids: string[],
    meId: string
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

    const destinationContent: BinaryNode[] = destinationJids.map((jid) => ({
        tag: 'to',
        attrs: { jid },
        content: undefined
    }))

    const relayLatencyContent: BinaryNode[] = [...teNodes]
    if (destinationContent.length > 0) {
        relayLatencyContent.push({
            tag: 'destination',
            attrs: {},
            content: destinationContent
        })
    }

    const toJidClean = peerJid.replace(/:\d+@/, '@')
    return {
        tag: 'call',
        attrs: { to: toJidClean, id: generateCallStanzaId() },
        content: [
            {
                tag: 'relaylatency',
                attrs: { 'call-id': callId, 'call-creator': callCreator },
                content: relayLatencyContent
            }
        ]
    }
}

export function buildTransportStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    meId: string,
    messageType = '0',
    p2pCandRound = '0'
): BinaryNode {
    return {
        tag: 'call',
        attrs: { to: peerJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'transport',
                attrs: {
                    'call-id': callId,
                    'call-creator': callCreator,
                    'transport-message-type': messageType,
                    'p2p-cand-round': p2pCandRound
                },
                content: [
                    {
                        tag: 'net',
                        attrs: { medium: '2', protocol: '0' },
                        content: undefined
                    }
                ]
            }
        ]
    }
}

export function buildMuteV2Stanza(
    peerDeviceJid: string,
    callId: string,
    callCreator: string,
    muteState: number,
    meId: string
): BinaryNode {
    return {
        tag: 'call',
        attrs: { to: peerDeviceJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'mute_v2',
                attrs: {
                    'call-id': callId,
                    'call-creator': callCreator,
                    'mute-state': String(muteState)
                }
            }
        ]
    }
}

export function buildAcceptReceiptStanza(
    peerDeviceJid: string,
    acceptMsgId: string,
    callId: string,
    callCreator: string,
    ourJid: string
): BinaryNode {
    return {
        tag: 'receipt',
        attrs: {
            to: peerDeviceJid,
            id: acceptMsgId,
            from: ourJid
        },
        content: [
            {
                tag: 'accept',
                attrs: {
                    'call-id': callId,
                    'call-creator': callCreator
                }
            }
        ]
    }
}

export const ENCRYPTED_TAGS = ['preaccept', 'accept'] as const

export function needsDecryption(tag: string): boolean {
    return ENCRYPTED_TAGS.includes(tag as any)
}
