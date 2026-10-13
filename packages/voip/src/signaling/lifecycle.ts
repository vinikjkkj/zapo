import { createNoopLogger, type Logger } from 'zapo-js'
import { toUserJid } from 'zapo-js/protocol'
import { type BinaryNode, buildReceiptNode } from 'zapo-js/transport'
import { toError } from 'zapo-js/util'

import type { WaVoipDeps, WaVoipStores } from '../types.js'

import { deviceIdentityNode, encryptCallKeyForDevices } from './call-key.js'
import { callStanza, callTarget } from './call-stanza.js'
import { VIDEO_DEC_H264, VIDEO_ENC_H264 } from './video-state.js'

/** `joinable` of an `<offer>`: whether others may still join. Says nothing about group-ness. */
export function parseJoinableAttr(innerNode: BinaryNode): boolean {
    const raw = innerNode.attrs?.joinable
    return raw === '1' || raw === 'true'
}

/** `group-jid` of an `<offer>`, in either spelling, or `null` on a call that is no group's. */
export function parseGroupJidAttr(innerNode: BinaryNode): string | null {
    const raw = innerNode.attrs?.['group-jid'] ?? innerNode.attrs?.group_jid
    return raw ? raw : null
}

/** `re-ring='1'` of an `<offer>`: a call already going rings this side again, with no `<relay>`. */
export function parseReRingAttr(innerNode: BinaryNode): boolean {
    return innerNode.attrs?.['re-ring'] === '1'
}

/**
 * Version, mask length, then a 40-bit mask read LSB-first. Neither blob sets bit 36
 * (`enable_mlow_red`, `0x10` of the last byte) nor 38 (`enable_mlow_separate_pt_tx`, `0x40`): a peer
 * that sees them may send RED this side cannot fully unwrap, in-band or on its own payload type.
 */
export const CAPABILITY_OFFER = new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe4, 0xbb, 0x07])
export const CAPABILITY_VIDEO_OFFER = new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe0, 0xfa, 0x03])
const CAPABILITY_PREACCEPT = new Uint8Array([0x01, 0x05, 0xff, 0x09, 0xe4, 0xbb, 0x07])

/** The media an offer announces, 1:1 or group: the two opus rates, video when asked, `<net>`. */
export function buildOfferMediaNodes(isVideo: boolean): BinaryNode[] {
    const nodes: BinaryNode[] = [
        { tag: 'audio', attrs: { enc: 'opus', rate: '8000' }, content: undefined },
        { tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, content: undefined }
    ]

    if (isVideo) {
        nodes.push({
            tag: 'video',
            attrs: {
                enc: VIDEO_ENC_H264,
                dec: VIDEO_DEC_H264,
                screen_width: '1920',
                screen_height: '1080',
                device_orientation: '0'
            },
            content: undefined
        })
    }

    nodes.push({ tag: 'net', attrs: { medium: '3' }, content: undefined })
    return nodes
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

    const { encNodes, shouldIncludeDeviceIdentity } = await encryptCallKeyForDevices(
        deps,
        devices,
        callKey
    )
    const destinations: BinaryNode[] = devices.map((jid, index) => ({
        tag: 'to',
        attrs: { jid },
        content: [encNodes[index]]
    }))

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

    offerContent.push(...buildOfferMediaNodes(isVideo))

    offerContent.push({
        tag: 'capability',
        attrs: { ver: '1' },
        content: isVideo ? CAPABILITY_VIDEO_OFFER : CAPABILITY_OFFER
    })

    offerContent.push({ tag: 'destination', attrs: {}, content: destinations })

    offerContent.push({
        tag: 'encopt',
        attrs: { keygen: '2' },
        content: undefined
    })

    if (shouldIncludeDeviceIdentity && creds?.signedIdentity) {
        offerContent.push(deviceIdentityNode(creds.signedIdentity))
    }

    return callStanza(peerJid, 'offer', callId, callCreator, undefined, offerContent)
}

/**
 * Builds the `<call><accept>`: no `<enc>` or `<device-identity>` (the server drops an accept
 * carrying `<enc>`), `<encopt>` only on a group accept, which goes to `<call-id>@call`; a 1:1
 * accept goes to the caller device verbatim. Video answers `enc='h.264' dec='H264'`.
 */
export async function buildAcceptStanza(
    deps: WaVoipDeps,
    callId: string,
    peerJid: string,
    callCreator: string,
    isVideo: boolean,
    isGroupCall = false
): Promise<BinaryNode> {
    await deps.messageDispatch.syncSignalSession(callCreator)

    const acceptContent: BinaryNode[] = [
        { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
        { tag: 'net', attrs: { medium: '3' } }
    ]

    if (isVideo) {
        acceptContent.push({ tag: 'video', attrs: { enc: VIDEO_ENC_H264, dec: VIDEO_DEC_H264 } })
    }
    if (isGroupCall) {
        acceptContent.push({ tag: 'encopt', attrs: { keygen: '2' } })
    }

    return callStanza(
        callTarget(peerJid, callId, isGroupCall),
        'accept',
        callId,
        callCreator,
        undefined,
        acceptContent
    )
}

export function buildTerminateStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    audioDurationMs?: number,
    reason?: string
): BinaryNode {
    const attrs: Record<string, string> = {}
    if (audioDurationMs !== undefined && audioDurationMs >= 0) {
        const ms = String(Math.floor(audioDurationMs))
        attrs.duration = ms
        attrs.audio_duration = ms
    }
    if (reason !== undefined) {
        attrs.reason = reason
    }

    return callStanza(peerJid, 'terminate', callId, callCreator, attrs)
}

/**
 * The reject goes to the device that sent the offer (a bare user never reaches a companion), or
 * to `<call-id>@call` with `count='0'` on a group call, so the others stop listing us as ringing.
 */
export function buildRejectStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    isGroupCall = false
): BinaryNode {
    return callStanza(
        callTarget(peerJid, callId, isGroupCall),
        'reject',
        callId,
        callCreator,
        isGroupCall ? { count: '0' } : undefined
    )
}

/** A group preaccept (`isGroupCall`) carries the same children, addressed to `<call-id>@call`. */
export function buildPreacceptStanza(
    peerJid: string,
    callId: string,
    callCreator: string,
    isGroupCall = false
): BinaryNode {
    return callStanza(
        callTarget(peerJid, callId, isGroupCall),
        'preaccept',
        callId,
        callCreator,
        undefined,
        [
            { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
            { tag: 'encopt', attrs: { keygen: '2' } },
            { tag: 'capability', attrs: { ver: '1' }, content: CAPABILITY_PREACCEPT }
        ]
    )
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

export function needsDecryption(tag: string): boolean {
    return tag === 'preaccept' || tag === 'accept'
}
