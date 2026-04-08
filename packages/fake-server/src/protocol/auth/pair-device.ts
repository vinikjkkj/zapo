/**
 * Builders for the QR-pairing IQ stanzas.
 *
 * Sources:
 *   /deobfuscated/WASmaxInMdSet/WASmaxInMdSetToCompanionRequest.js  (pair-device)
 *   /deobfuscated/WASmaxInMdSet/WASmaxInMdSetRegRequest.js          (pair-success)
 *   /deobfuscated/WAWebHandlePairDevice.js
 *   /deobfuscated/WAWebHandlePairSuccess.js
 *   /deobfuscated/pb/WAWebProtobufsAdv_pb.js
 *
 * pair-device wire layout (server → client):
 *
 *   <iq type="set" xmlns="md" from="s.whatsapp.net" id="...">
 *     <pair-device>
 *       <ref>raw-bytes</ref>           ← exactly 6 refs (parser min/max 6)
 *       <ref>raw-bytes</ref>
 *       ...
 *     </pair-device>
 *   </iq>
 *
 * pair-success wire layout (server → client):
 *
 *   <iq type="set" xmlns="md" from="s.whatsapp.net" id="...">
 *     <pair-success>
 *       <device jid="..." [lid="..."]/>
 *       <platform name="..."/>
 *       <device-identity>[serialized ADVSignedDeviceIdentityHMAC]</device-identity>
 *       [<biz name="..."/>]
 *     </pair-success>
 *   </iq>
 */

import type { BinaryNode } from '../../transport/codec'

export interface BuildPairDeviceIqInput {
    /** IQ id (default auto-generated). */
    readonly id?: string
    /** Refs as raw bytes (echoed inside the QR string the lib emits). */
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
    /** Device JID (e.g. `5511999999999:1@s.whatsapp.net`). */
    readonly deviceJid: string
    /** Optional LID JID. */
    readonly deviceLid?: string
    /** Platform name (e.g. `IOS`, `ANDROID`, `WEB`). */
    readonly platform: string
    /** Serialized `ADVSignedDeviceIdentityHMAC` proto. */
    readonly deviceIdentityBytes: Uint8Array
    /** Optional business name to inject as `<biz name="...">`. */
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

/**
 * Parses the QR string the lib emits via `auth_qr`. The format is
 * `ref,noisePub,identityPub,advSecret,platform` where each pubkey/secret
 * field is base64-encoded raw bytes (32 bytes for the keys, 32 for the
 * adv secret).
 *
 * Source: /deobfuscated/WAWebQrCodeOps.js
 */
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
    return {
        ref: parts[0],
        noisePublicKey: base64Decode(parts[1]),
        identityPublicKey: base64Decode(parts[2]),
        advSecretKey: base64Decode(parts[3]),
        platform: parts[4]
    }
}

function base64Decode(input: string): Uint8Array {
    return new Uint8Array(Buffer.from(input, 'base64'))
}
