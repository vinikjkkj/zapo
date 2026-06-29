import { createNoopLogger, type Logger, unpadPkcs7, writeRandomPadMax16 } from 'zapo-js'
import { proto } from 'zapo-js/proto'
import { parseSignalAddressFromJid, toUserJid } from 'zapo-js/protocol'
import {
    type BinaryNode,
    buildReceiptNode,
    findNodeChild,
    getFirstNodeChild,
    getNodeChildren,
    getNodeChildrenByTag
} from 'zapo-js/transport'
import { bytesToHex, toError } from 'zapo-js/util'

import { randomBytes } from '../crypto/primitives.js'
import type { NodeInfo, RelayEndpoint, WaVoipDeps, WaVoipStores } from '../types.js'

export async function encodeWAMessage(
    message: Parameters<typeof proto.Message.encode>[0]
): Promise<Uint8Array> {
    return writeRandomPadMax16(proto.Message.encode(message).finish())
}

function encodeSignedDeviceIdentity(
    account: Parameters<typeof proto.ADVSignedDeviceIdentity.encode>[0]
): Uint8Array {
    return proto.ADVSignedDeviceIdentity.encode(account).finish()
}

export function generateCallId(): string {
    const bytes = new Uint8Array(16)
    for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256)
    }

    return bytesToHex(bytes).toUpperCase()
}

export function generateCallStanzaId(): string {
    return bytesToHex(randomBytes(16)).toUpperCase()
}

export function extractNodeInfo(node: BinaryNode): NodeInfo | null {
    const innerNode = getFirstNodeChild(node)
    if (!innerNode) {
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

export async function decryptCallKey(
    deps: WaVoipDeps,
    node: BinaryNode,
    peerJid: string,
    logger?: Logger
): Promise<Uint8Array | undefined> {
    const log = logger ?? createNoopLogger()

    const isEnc = (child: BinaryNode): boolean => child.tag === 'enc' && !!child.attrs?.type
    const encNodes = getNodeChildren(node).filter(isEnc)

    const destinationNode = findNodeChild(node, 'destination')
    if (destinationNode) {
        for (const toNode of getNodeChildren(destinationNode)) {
            if (toNode.tag === 'to') {
                encNodes.push(...getNodeChildren(toNode).filter(isEnc))
            }
        }
    }

    const address = parseSignalAddressFromJid(peerJid)
    for (const encNode of encNodes) {
        if (!(encNode.content instanceof Uint8Array)) {
            continue
        }
        try {
            const decrypted = await deps.signalProtocol.decryptMessage(address, {
                type: encNode.attrs.type as 'msg' | 'pkmsg',
                ciphertext: encNode.content
            })
            const message = proto.Message.decode(unpadPkcs7(decrypted))
            const callKey = message.call?.callKey
            if (callKey && callKey.length === 32) {
                return callKey
            }
        } catch (err) {
            log.trace('call key decrypt candidate failed', { message: toError(err).message })
        }
    }

    return undefined
}

const CAPABILITY_OFFER = new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe4, 0xbb, 0x07])
const CAPABILITY_PREACCEPT = new Uint8Array([0x01, 0x05, 0xff, 0x09, 0xe4, 0xbb, 0x07])

export interface CallParticipantNodes {
    nodes: BinaryNode[]
    shouldIncludeDeviceIdentity: boolean
}

export async function buildCallParticipantNodes(
    deps: WaVoipDeps,
    devices: string[],
    callKey: Uint8Array
): Promise<CallParticipantNodes> {
    const resolved = await deps.sessionResolver.ensureSessionsBatch(devices)

    const plaintext = await encodeWAMessage({ call: { callKey } })
    const encrypted = await deps.signalProtocol.encryptMessagesBatch(
        devices.map((jid) => ({ address: parseSignalAddressFromJid(jid), plaintext })),
        resolved.map((target) => ({ address: target.address, session: target.session }))
    )

    const nodes: BinaryNode[] = devices.map((jid, index) => ({
        tag: 'to',
        attrs: { jid },
        content: [
            {
                tag: 'enc',
                attrs: { v: '2', type: encrypted[index].type, count: '0' },
                content: encrypted[index].ciphertext
            }
        ]
    }))

    return {
        nodes,
        shouldIncludeDeviceIdentity: encrypted.some((entry) => entry.type === 'pkmsg')
    }
}

export async function buildOfferStanza(
    deps: WaVoipDeps,
    stores: WaVoipStores,
    callId: string,
    callKey: Uint8Array,
    peerJid: string,
    isVideo: boolean,
    logger?: Logger
): Promise<BinaryNode> {
    const log = logger ?? createNoopLogger()
    const creds = deps.authClient.getCurrentCredentials()
    const callCreator = creds?.meLid || creds?.meJid || ''

    const synced = await deps.signalDeviceSync.syncDeviceList([peerJid])
    const devices = synced.flatMap((entry) => entry.deviceJids)

    if (devices.length === 0) {
        throw new Error(`no device sessions to encrypt the call offer for ${peerJid}`)
    }

    const { nodes: destinations, shouldIncludeDeviceIdentity } = await buildCallParticipantNodes(
        deps,
        devices,
        callKey
    )

    const offerContent: BinaryNode[] = []

    try {
        const peerJidNormalized = toUserJid(peerJid)
        const tcTokenRecord = await stores.privacyToken.getByJid(peerJidNormalized)
        const tctoken = tcTokenRecord?.tcToken
        if (tctoken) {
            offerContent.push({
                tag: 'privacy',
                attrs: {},
                content: tctoken instanceof Uint8Array ? tctoken : new Uint8Array(tctoken)
            })
        }
    } catch (err) {
        log.trace('tctoken lookup failed', { message: toError(err).message })
    }

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

    if (shouldIncludeDeviceIdentity && creds?.signedIdentity) {
        offerContent.push({
            tag: 'device-identity',
            attrs: {},
            content: encodeSignedDeviceIdentity(creds.signedIdentity)
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
    deps: WaVoipDeps,
    callId: string,
    callKey: Uint8Array,
    peerJid: string,
    callCreator: string,
    isVideo: boolean
): Promise<BinaryNode> {
    await deps.messageDispatch.syncSignalSession(callCreator)

    const bytes = await encodeWAMessage({ call: { callKey } })

    let encNode: BinaryNode
    let shouldIncludeDeviceIdentity = false

    try {
        const { type, ciphertext } = await deps.signalProtocol.encryptMessage(
            parseSignalAddressFromJid(callCreator),
            bytes
        )

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

    const acceptSignedIdentity = deps.authClient.getCurrentCredentials()?.signedIdentity
    if (shouldIncludeDeviceIdentity && acceptSignedIdentity) {
        acceptContent.push({
            tag: 'device-identity',
            attrs: {},
            content: encodeSignedDeviceIdentity(acceptSignedIdentity)
        })
    }

    if (isVideo) {
        acceptContent.push({ tag: 'video', attrs: { enc: 'vp8' } })
    }

    const toJidClean = toUserJid(peerJid)
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
    audioDurationMs?: number,
    reason?: string
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
    if (reason !== undefined) {
        attrs.reason = reason
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

export function buildRelaylatencyForwardStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    teNodes: readonly BinaryNode[],
    destinationJids: string[]
): BinaryNode {
    const destinationContent: BinaryNode[] = destinationJids.map((jid) => ({
        tag: 'to',
        attrs: { jid },
        content: undefined
    }))

    return {
        tag: 'call',
        attrs: { to: toUserJid(peerJid), id: generateCallStanzaId() },
        content: [
            {
                tag: 'relaylatency',
                attrs: { 'call-id': callId, 'call-creator': callCreator },
                content: [
                    ...teNodes,
                    { tag: 'destination', attrs: {}, content: destinationContent }
                ]
            }
        ]
    }
}

export function buildRejectStanza(
    peerJid: string,
    callId: string,
    callCreator: string
): BinaryNode {
    const toJidClean = toUserJid(peerJid)
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

    const toJidClean = toUserJid(peerJid)
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
    return buildReceiptNode({
        kind: 'custom',
        attrs: { to: peerDeviceJid, id: acceptMsgId, from: ourJid },
        content: [{ tag: 'accept', attrs: { 'call-id': callId, 'call-creator': callCreator } }]
    })
}

export const ENCRYPTED_TAGS = ['preaccept', 'accept'] as const

export function needsDecryption(tag: string): boolean {
    return ENCRYPTED_TAGS.includes(tag as any)
}
