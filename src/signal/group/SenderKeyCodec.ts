import { readVersionedContent, toSerializedPubKey } from '@crypto'
import { proto } from '@proto'
import { SIGNAL_SIGNATURE_LENGTH } from '@signal/api/constants'
import { SIGNAL_GROUP_VERSION } from '@signal/constants'
import { assertByteLength } from '@util/bytes'

export function parseDistributionPayload(payload: Uint8Array): {
    readonly keyId: number
    readonly iteration: number
    readonly chainKey: Uint8Array
    readonly signingPublicKey: Uint8Array
} {
    const body = readVersionedContent(payload, SIGNAL_GROUP_VERSION, 0)
    const decoded = proto.SenderKeyDistributionMessage.decode(body)
    if (
        decoded.id === null ||
        decoded.id === undefined ||
        decoded.iteration === null ||
        decoded.iteration === undefined ||
        decoded.chainKey === null ||
        decoded.chainKey === undefined ||
        decoded.signingKey === null ||
        decoded.signingKey === undefined
    ) {
        throw new Error('invalid sender key distribution message')
    }

    assertByteLength(decoded.chainKey, 32, 'sender key distribution chainKey must be 32 bytes')

    return {
        keyId: decoded.id,
        iteration: decoded.iteration,
        chainKey: decoded.chainKey,
        signingPublicKey: toSerializedPubKey(decoded.signingKey)
    }
}

export function parseSenderKeyMessage(versionContentMac: Uint8Array): {
    readonly keyId: number
    readonly iteration: number
    readonly ciphertext: Uint8Array
    readonly versionContentMac: Uint8Array
} {
    const body = readVersionedContent(
        versionContentMac,
        SIGNAL_GROUP_VERSION,
        SIGNAL_SIGNATURE_LENGTH
    )
    const decoded = proto.SenderKeyMessage.decode(body)
    if (
        decoded.id === null ||
        decoded.id === undefined ||
        decoded.iteration === null ||
        decoded.iteration === undefined ||
        decoded.ciphertext === null ||
        decoded.ciphertext === undefined
    ) {
        throw new Error('invalid sender key message')
    }

    return {
        keyId: decoded.id,
        iteration: decoded.iteration,
        ciphertext: decoded.ciphertext,
        versionContentMac
    }
}
