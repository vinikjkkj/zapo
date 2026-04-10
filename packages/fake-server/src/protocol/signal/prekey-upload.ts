/** Parser for client prekey upload IQs (`xmlns=encrypt`, `type=set`). */

import type { BinaryNode } from '../../transport/codec'

export interface ClientPreKeyEntry {
    readonly keyId: number
    readonly publicKey: Uint8Array
}

export interface ClientSignedPreKey {
    readonly keyId: number
    readonly publicKey: Uint8Array
    readonly signature: Uint8Array
}

export interface ClientPreKeyBundle {
    readonly registrationId: number
    readonly identityKey: Uint8Array
    readonly signedPreKey: ClientSignedPreKey
    readonly preKeys: readonly ClientPreKeyEntry[]
}

export class PreKeyUploadParseError extends Error {
    public constructor(message: string) {
        super(message)
        this.name = 'PreKeyUploadParseError'
    }
}

export function parsePreKeyUploadIq(iq: BinaryNode): ClientPreKeyBundle {
    if (iq.tag !== 'iq') {
        throw new PreKeyUploadParseError(`expected iq stanza, got ${iq.tag}`)
    }
    if (iq.attrs.xmlns !== 'encrypt' || iq.attrs.type !== 'set') {
        throw new PreKeyUploadParseError(
            `expected iq with xmlns=encrypt type=set, got xmlns=${iq.attrs.xmlns} type=${iq.attrs.type}`
        )
    }
    const children = iq.content
    if (!Array.isArray(children)) {
        throw new PreKeyUploadParseError('iq has no children')
    }

    const registrationNode = findChild(children, 'registration')
    const identityNode = findChild(children, 'identity')
    const listNode = findChild(children, 'list')
    const skeyNode = findChild(children, 'skey')

    const registrationId = readBigEndianInt(requireBytes(registrationNode?.content, 'registration'))
    const identityKey = requireBytes(identityNode?.content, 'identity')
    if (identityKey.byteLength !== 32) {
        throw new PreKeyUploadParseError(
            `identity key must be 32 bytes, got ${identityKey.byteLength}`
        )
    }
    const signedPreKey = parseSignedPreKey(skeyNode)
    const preKeys = parsePreKeyList(listNode)

    return {
        registrationId,
        identityKey,
        signedPreKey,
        preKeys
    }
}

function findChild(children: readonly BinaryNode[], tag: string): BinaryNode | null {
    for (const child of children) {
        if (child.tag === tag) return child
    }
    return null
}

function parseSignedPreKey(node: BinaryNode | null): ClientSignedPreKey {
    if (!node) {
        throw new PreKeyUploadParseError('skey child missing')
    }
    if (!Array.isArray(node.content)) {
        throw new PreKeyUploadParseError('skey has no inner nodes')
    }
    const idNode = findChild(node.content, 'id')
    const valueNode = findChild(node.content, 'value')
    const signatureNode = findChild(node.content, 'signature')
    const keyId = readBigEndianInt(requireBytes(idNode?.content, 'skey.id'))
    const publicKey = requireBytes(valueNode?.content, 'skey.value')
    const signature = requireBytes(signatureNode?.content, 'skey.signature')
    if (publicKey.byteLength !== 32) {
        throw new PreKeyUploadParseError(`skey value must be 32 bytes, got ${publicKey.byteLength}`)
    }
    if (signature.byteLength !== 64) {
        throw new PreKeyUploadParseError(
            `skey signature must be 64 bytes, got ${signature.byteLength}`
        )
    }
    return { keyId, publicKey, signature }
}

function parsePreKeyList(node: BinaryNode | null): readonly ClientPreKeyEntry[] {
    if (!node) {
        throw new PreKeyUploadParseError('list child missing')
    }
    if (!Array.isArray(node.content)) {
        throw new PreKeyUploadParseError('list has no inner key entries')
    }
    const out: ClientPreKeyEntry[] = []
    for (const entry of node.content) {
        if (entry.tag !== 'key') continue
        if (!Array.isArray(entry.content)) continue
        const idNode = findChild(entry.content, 'id')
        const valueNode = findChild(entry.content, 'value')
        const keyId = readBigEndianInt(requireBytes(idNode?.content, 'key.id'))
        const publicKey = requireBytes(valueNode?.content, 'key.value')
        if (publicKey.byteLength !== 32) {
            throw new PreKeyUploadParseError(
                `key value must be 32 bytes, got ${publicKey.byteLength}`
            )
        }
        out.push({ keyId, publicKey })
    }
    if (out.length === 0) {
        throw new PreKeyUploadParseError('list is empty')
    }
    return out
}

function requireBytes(content: BinaryNode['content'] | undefined, label: string): Uint8Array {
    if (content === undefined || content === null) {
        throw new PreKeyUploadParseError(`${label} child has no content`)
    }
    if (!(content instanceof Uint8Array)) {
        throw new PreKeyUploadParseError(`${label} content must be bytes`)
    }
    return content
}

function readBigEndianInt(bytes: Uint8Array): number {
    let value = 0
    for (let i = 0; i < bytes.byteLength; i += 1) {
        value = value * 256 + bytes[i]
    }
    return value
}
