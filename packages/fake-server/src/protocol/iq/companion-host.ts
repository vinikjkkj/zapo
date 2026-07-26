/**
 * Primary-side `md` IQ parsers: a phone hosting companion devices.
 *
 * These are the inverse of `protocol/auth/pair-device.ts`, which drives the
 * companion side. Here the client is the primary: it signs a companion's device
 * identity and uploads it, republishes its key-index list, and revokes devices.
 */

import type { BinaryNode } from '../../transport/codec'
import { TEXT_DECODER } from '../../transport/util'

export interface ParsedPairDeviceUpload {
    /** Pairing ref the companion advertised in its QR. */
    readonly ref: string
    readonly companionNoisePublicKey: Uint8Array
    /** `ADVSignedDeviceIdentityHMAC` bytes the primary signed. */
    readonly deviceIdentityBytes: Uint8Array
    /** `ADVSignedKeyIndexList` bytes for the account's device set. */
    readonly keyIndexListBytes: Uint8Array
    readonly keyIndexListTimestampSeconds: number
    /** Encoded `ClientPairingProps`, when the primary declared them. */
    readonly clientPropsBytes: Uint8Array | null
    /** AES-GCM key from the optional `<pem>` element. */
    readonly pemKeyBytes: Uint8Array | null
}

/**
 * Parses the primary's `<iq type="set" xmlns="md"><pair-device>` upload.
 * Returns `null` when the stanza is not a well-formed pair-device upload, which
 * lets the router fall through to another handler.
 */
export function parsePairDeviceUpload(iq: BinaryNode): ParsedPairDeviceUpload | null {
    const pairDevice = findChild(iq, 'pair-device')
    if (!pairDevice) {
        return null
    }
    const ref = readText(findChild(pairDevice, 'ref'))
    const companionNoisePublicKey = readBytes(findChild(pairDevice, 'pub-key'))
    const deviceIdentityBytes = readBytes(findChild(pairDevice, 'device-identity'))
    const keyIndexList = findChild(pairDevice, 'key-index-list')
    const keyIndexListBytes = readBytes(keyIndexList)
    if (!ref || !companionNoisePublicKey || !deviceIdentityBytes || !keyIndexListBytes) {
        return null
    }
    return {
        ref,
        companionNoisePublicKey,
        deviceIdentityBytes,
        keyIndexListBytes,
        keyIndexListTimestampSeconds: readTimestampSeconds(keyIndexList),
        clientPropsBytes: readBytes(findChild(pairDevice, 'client-props')),
        pemKeyBytes: readPemKey(pairDevice)
    }
}

export interface ParsedKeyIndexListPublish {
    readonly keyIndexListBytes: Uint8Array
    readonly timestampSeconds: number
}

/**
 * Parses the standalone key-index-list republish the primary sends whenever its
 * companion set changes. Returns `null` when the stanza carries no list.
 */
export function parseKeyIndexListPublish(iq: BinaryNode): ParsedKeyIndexListPublish | null {
    const keyIndexList = findChild(iq, 'key-index-list')
    const keyIndexListBytes = readBytes(keyIndexList)
    if (!keyIndexListBytes) {
        return null
    }
    return {
        keyIndexListBytes,
        timestampSeconds: readTimestampSeconds(keyIndexList)
    }
}

export interface ParsedRemoveCompanionDevice {
    /** Device to unlink; `null` when the stanza revokes every companion. */
    readonly deviceJid: string | null
    /** `all="true"` – the phone's "log out all companion devices". */
    readonly all: boolean
    readonly reason: string
    readonly excludeHostedCompanion: boolean
}

/**
 * Parses `<remove-companion-device>`. The same stanza serves a companion
 * logging itself out (`jid` = its own device) and a primary unlinking one of
 * its companions, so the caller decides by comparing against the connection's
 * own jid.
 */
export function parseRemoveCompanionDevice(iq: BinaryNode): ParsedRemoveCompanionDevice | null {
    const remove = findChild(iq, 'remove-companion-device')
    if (!remove) {
        return null
    }
    const jid = remove.attrs.jid
    return {
        deviceJid: typeof jid === 'string' && jid.length > 0 ? jid : null,
        all: remove.attrs.all === 'true',
        reason: typeof remove.attrs.reason === 'string' ? remove.attrs.reason : '',
        excludeHostedCompanion: remove.attrs.exclude_hosted_companion === 'true'
    }
}

function findChild(parent: BinaryNode, tag: string): BinaryNode | null {
    if (!Array.isArray(parent.content)) {
        return null
    }
    return parent.content.find((child: BinaryNode) => child.tag === tag) ?? null
}

function readBytes(node: BinaryNode | null): Uint8Array | null {
    if (!node) {
        return null
    }
    return node.content instanceof Uint8Array ? node.content : null
}

function readText(node: BinaryNode | null): string | null {
    if (!node) {
        return null
    }
    if (typeof node.content === 'string') {
        return node.content
    }
    return node.content instanceof Uint8Array ? TEXT_DECODER.decode(node.content) : null
}

function readTimestampSeconds(node: BinaryNode | null): number {
    const raw = node?.attrs.ts
    const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN
    return Number.isFinite(parsed) ? parsed : 0
}

/** The `<pem>` wrapper nests the key bytes in a second `<pem>` element. */
function readPemKey(pairDevice: BinaryNode): Uint8Array | null {
    const pem = findChild(pairDevice, 'pem')
    if (!pem) {
        return null
    }
    return readBytes(findChild(pem, 'pem'))
}
