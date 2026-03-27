import { sha256, toRawPubKey } from '@crypto'
import type { Proto } from '@proto'
import { parseSignalAddressFromJid } from '@protocol/jid'
import type { SignalAddress } from '@signal/types'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { concatBytes } from '@util/bytes'

const ICDC_HASH_LENGTH = 8
const ICDC_FRESHNESS_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1_000
const DEVICE_LIST_METADATA_VERSION = 2
const EMPTY_KEY_HASH = new Uint8Array(ICDC_HASH_LENGTH)

export interface IcdcMeta {
    readonly keyHash: Uint8Array
    readonly timestamp: number | undefined
}

export async function computeDeviceKeyHash(
    identityKeys: readonly Uint8Array[]
): Promise<Uint8Array> {
    if (identityKeys.length === 0) {
        return EMPTY_KEY_HASH
    }
    const rawKeys: Uint8Array[] = new Array(identityKeys.length)
    for (let i = 0; i < identityKeys.length; i += 1) {
        rawKeys[i] =
            identityKeys[i].byteLength === 33 ? toRawPubKey(identityKeys[i]) : identityKeys[i]
    }
    const combined = concatBytes(rawKeys)
    const hash = await sha256(combined)
    return hash.subarray(0, ICDC_HASH_LENGTH)
}

export async function resolveIcdcMeta(
    deviceJids: readonly string[],
    signalStore: WaSignalStore,
    updatedAtMs: number | undefined,
    localIdentity?: { readonly address: SignalAddress; readonly pubKey: Uint8Array }
): Promise<IcdcMeta | null> {
    if (deviceJids.length === 0) {
        return null
    }
    const addresses: SignalAddress[] = new Array(deviceJids.length)
    for (let i = 0; i < deviceJids.length; i += 1) {
        addresses[i] = parseSignalAddressFromJid(deviceJids[i])
    }
    const remoteKeys = await signalStore.getRemoteIdentities(addresses)
    const keys: Uint8Array[] = []
    for (let i = 0; i < addresses.length; i += 1) {
        const key = remoteKeys[i]
        if (key) {
            keys.push(key)
        } else if (
            localIdentity &&
            addresses[i].user === localIdentity.address.user &&
            addresses[i].device === localIdentity.address.device
        ) {
            keys.push(localIdentity.pubKey)
        }
    }
    if (keys.length === 0) {
        return null
    }
    const keyHash = await computeDeviceKeyHash(keys)
    const timestamp =
        updatedAtMs !== undefined && Date.now() - updatedAtMs < ICDC_FRESHNESS_THRESHOLD_MS
            ? Math.floor(updatedAtMs / 1_000)
            : undefined
    return { keyHash, timestamp }
}

export function injectDeviceListMetadata(
    message: Proto.IMessage,
    senderIcdc: IcdcMeta | null,
    recipientIcdc: IcdcMeta | null
): Proto.IMessage {
    if (!senderIcdc && !recipientIcdc) {
        return message
    }
    const deviceListMetadata: Proto.IDeviceListMetadata = {}
    if (senderIcdc) {
        deviceListMetadata.senderKeyHash = senderIcdc.keyHash
        if (senderIcdc.timestamp !== undefined) {
            deviceListMetadata.senderTimestamp = senderIcdc.timestamp
        }
    }
    if (recipientIcdc) {
        deviceListMetadata.recipientKeyHash = recipientIcdc.keyHash
        if (recipientIcdc.timestamp !== undefined) {
            deviceListMetadata.recipientTimestamp = recipientIcdc.timestamp
        }
    }
    return {
        ...message,
        messageContextInfo: {
            ...message.messageContextInfo,
            deviceListMetadata,
            deviceListMetadataVersion: DEVICE_LIST_METADATA_VERSION
        }
    }
}
