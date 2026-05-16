/** Pairing IQ builders/parsers (source: `WAWebHandlePairDevice*`, `/wa-web`). */

import type { BinaryNode } from '../../transport/codec'
import { decodeBase64Url } from '../../transport/util'

export interface BuildPairDeviceIqInput {
    readonly id?: string
    readonly refs: readonly Uint8Array[]
}

export function buildPairDeviceIq(input: BuildPairDeviceIqInput): BinaryNode {
    if (input.refs.length !== 6) {
        throw new Error(`pair-device requires exactly 6 refs, got ${input.refs.length}`)
    }
    return {
        tag: 'iq',
        attrs: {
            id: input.id ?? `pair-device-${Math.random().toString(36).slice(2, 10)}`,
            type: 'set',
            xmlns: 'md',
            from: 's.whatsapp.net'
        },
        content: [
            {
                tag: 'pair-device',
                attrs: {},
                content: input.refs.map((ref) => ({
                    tag: 'ref',
                    attrs: {},
                    content: ref
                }))
            }
        ]
    }
}

export interface BuildPairSuccessIqInput {
    readonly id?: string
    readonly deviceJid: string
    readonly deviceLid?: string
    readonly platform: string
    readonly deviceIdentityBytes: Uint8Array
    readonly bizName?: string
}

export function buildPairSuccessIq(input: BuildPairSuccessIqInput): BinaryNode {
    const children: BinaryNode[] = [
        {
            tag: 'device',
            attrs: {
                jid: input.deviceJid,
                ...(input.deviceLid !== undefined ? { lid: input.deviceLid } : {})
            }
        },
        {
            tag: 'platform',
            attrs: { name: input.platform }
        },
        {
            tag: 'device-identity',
            attrs: {},
            content: input.deviceIdentityBytes
        }
    ]
    if (input.bizName !== undefined) {
        children.push({
            tag: 'biz',
            attrs: { name: input.bizName }
        })
    }
    return {
        tag: 'iq',
        attrs: {
            id: input.id ?? `pair-success-${Math.random().toString(36).slice(2, 10)}`,
            type: 'set',
            xmlns: 'md',
            from: 's.whatsapp.net'
        },
        content: [
            {
                tag: 'pair-success',
                attrs: {},
                content: children
            }
        ]
    }
}

/** Parses `auth_qr`: `ref,noisePub,identityPub,advSecret,platform`. */
export interface ParsedPairingQr {
    readonly ref: string
    readonly noisePublicKey: Uint8Array
    readonly identityPublicKey: Uint8Array
    readonly advSecretKey: Uint8Array
    readonly platform: string
}

export function parsePairingQrString(qr: string): ParsedPairingQr {
    const parts = qr.split(',')
    if (parts.length < 5) {
        throw new Error(`pairing qr must have 5 comma-separated parts, got ${parts.length}`)
    }
    const platform = parts[parts.length - 1]
    const advSecretB64 = parts[parts.length - 2]
    const identityPubB64 = parts[parts.length - 3]
    const noisePubB64 = parts[parts.length - 4]
    const ref = parts.slice(0, parts.length - 4).join(',')
    return {
        ref,
        noisePublicKey: decodeBase64Url(noisePubB64, 'qr.noisePublicKey'),
        identityPublicKey: decodeBase64Url(identityPubB64, 'qr.identityPublicKey'),
        advSecretKey: decodeBase64Url(advSecretB64, 'qr.advSecretKey'),
        platform
    }
}
