import { proto } from '@proto'
import { WA_DEFAULTS } from '@protocol/defaults'
import { WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/nodes'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

/**
 * `ClientPairingProps` the primary declares in the `<client-props>` pair-device
 * element. A LID-native account must send `isChatDbLidMigrated: true` (with
 * `isSyncdPureLidSession`) so the companion runs `setIsLidMigrated` before
 * fetching its LID-addressed blocklist; without it the companion self-removes
 * with `lid_blocklist_chat_db_unmigrated`.
 */
export interface ClientPairingProps {
    readonly isChatDbLidMigrated: boolean
    readonly isSyncdPureLidSession: boolean
    readonly isSyncdSnapshotRecoveryEnabled: boolean
}

export interface PairDeviceIqInput {
    readonly ref: string
    readonly companionNoisePublicKey: Uint8Array
    readonly deviceIdentityBytes: Uint8Array
    readonly keyIndexListBytes: Uint8Array
    readonly keyIndexListTimestampSeconds: number
    readonly clientProps?: ClientPairingProps
    readonly pem?: {
        readonly aesGcmKeyBytes: Uint8Array
        readonly ttlSeconds: number
    }
}

/**
 * Builds the primary's `<iq type="set" xmlns="md">` carrying `<pair-device>`
 * with `ref`, `pub-key`, `device-identity`, `key-index-list`, and optional
 * `client-props`/`pem` children. The `id` is assigned by the send path.
 */
export function buildPairDeviceIq(input: PairDeviceIqInput): BinaryNode {
    const children: BinaryNode[] = [
        { tag: WA_NODE_TAGS.REF, attrs: {}, content: input.ref },
        { tag: WA_NODE_TAGS.PUB_KEY, attrs: {}, content: input.companionNoisePublicKey },
        { tag: WA_NODE_TAGS.DEVICE_IDENTITY, attrs: {}, content: input.deviceIdentityBytes },
        {
            tag: WA_NODE_TAGS.KEY_INDEX_LIST,
            attrs: { ts: String(input.keyIndexListTimestampSeconds) },
            content: input.keyIndexListBytes
        }
    ]
    if (input.clientProps) {
        children.push({
            tag: WA_NODE_TAGS.CLIENT_PROPS,
            attrs: {},
            content: proto.ClientPairingProps.encode({
                isChatDbLidMigrated: input.clientProps.isChatDbLidMigrated,
                isSyncdPureLidSession: input.clientProps.isSyncdPureLidSession,
                isSyncdSnapshotRecoveryEnabled: input.clientProps.isSyncdSnapshotRecoveryEnabled
            }).finish()
        })
    }
    if (input.pem) {
        children.push({
            tag: WA_NODE_TAGS.PEM,
            attrs: { version: '1', algorithm: 'rsa2048' },
            content: [
                { tag: WA_NODE_TAGS.PEM, attrs: {}, content: input.pem.aesGcmKeyBytes },
                { tag: WA_NODE_TAGS.TTL, attrs: { ts_s: String(input.pem.ttlSeconds) } },
                { tag: WA_NODE_TAGS.KEY_ID, attrs: {}, content: '1' }
            ]
        })
    }
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.MD, [
        { tag: WA_NODE_TAGS.PAIR_DEVICE, attrs: {}, content: children }
    ])
}

/**
 * Builds the standalone key-index-list publish `<iq>` the primary sends when its
 * companion set changes.
 */
export function buildKeyIndexListPublishIq(input: {
    readonly keyIndexListBytes: Uint8Array
    readonly timestampSeconds: number
}): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.MD, [
        {
            tag: WA_NODE_TAGS.KEY_INDEX_LIST,
            attrs: { ts: String(input.timestampSeconds) },
            content: input.keyIndexListBytes
        }
    ])
}

/**
 * Builds the `remove-companion-device` IQ that unlinks a companion from the
 * account. The device is identified by its full device jid; `reason` is a
 * free-form label the server records.
 */
export function buildRemoveCompanionDeviceIq(input: {
    readonly deviceJid: string
    readonly reason: string
}): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.MD, [
        {
            tag: WA_NODE_TAGS.REMOVE_COMPANION_DEVICE,
            attrs: { jid: input.deviceJid, reason: input.reason }
        }
    ])
}

/**
 * Builds the `remove-companion-device` IQ that unlinks EVERY companion in one
 * stanza: `all="true"` (no `jid`), mirroring the phone's "log out all companion
 * devices". `excludeHostedCompanion` adds `exclude_hosted_companion="true"` to
 * spare companions this account itself hosts.
 */
export function buildRemoveAllCompanionDevicesIq(input: {
    readonly reason: string
    readonly excludeHostedCompanion?: boolean
}): BinaryNode {
    const attrs: Record<string, string> = { all: 'true', reason: input.reason }
    if (input.excludeHostedCompanion) {
        attrs.exclude_hosted_companion = 'true'
    }
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.MD, [
        { tag: WA_NODE_TAGS.REMOVE_COMPANION_DEVICE, attrs }
    ])
}

/**
 * Builds the `primary_hello` IQ the primary sends to drive a link-code (pairing
 * code) handshake: the code-wrapped primary ephemeral, the primary ADV identity
 * public key, and the companion's pairing ref.
 */
export function buildPrimaryHelloIq(input: {
    readonly ref: string
    readonly wrappedPrimaryEphemeralPub: Uint8Array
    readonly primaryIdentityPub: Uint8Array
}): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.MD, [
        {
            tag: WA_NODE_TAGS.LINK_CODE_COMPANION_REG,
            attrs: { stage: 'primary_hello' },
            content: [
                {
                    tag: WA_NODE_TAGS.LINK_CODE_PAIRING_WRAPPED_PRIMARY_EPHEMERAL_PUB,
                    attrs: {},
                    content: input.wrappedPrimaryEphemeralPub
                },
                {
                    tag: WA_NODE_TAGS.PRIMARY_IDENTITY_PUB,
                    attrs: {},
                    content: input.primaryIdentityPub
                },
                { tag: WA_NODE_TAGS.LINK_CODE_PAIRING_REF, attrs: {}, content: input.ref }
            ]
        }
    ])
}
