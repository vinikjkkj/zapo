import { webcrypto } from 'node:crypto'

import { toSerializedPubKey } from '../../crypto/core/keys'
import { montgomeryToEdwardsPubKey } from '../../crypto/curves/X25519'
import { proto } from '../../proto'
import { ROOT_CA_PUBLIC_KEY_HEX, ROOT_CA_SERIAL } from '../../transport/noise/constants'
import { decodeProtoBytes } from '../../util/base64'
import { toBytesView, uint8Equal } from '../../util/bytes'
import { toSafeNumber } from '../../util/primitives'

interface ParsedNoiseCertificate {
    readonly serial: number
    readonly issuerSerial: number
    readonly key: Uint8Array
    readonly details: Uint8Array
    readonly signature: Uint8Array
}

async function verifySignalVariant(
    serializedPublicKey: Uint8Array,
    message: Uint8Array,
    signatureInput: Uint8Array
): Promise<boolean> {
    const publicKey = toSerializedPubKey(serializedPublicKey)
    if (signatureInput.length !== 64) {
        return false
    }
    const signature = new Uint8Array(signatureInput)
    const lastByte = signature[63]
    if ((lastByte & 0x60) !== 0) {
        return false
    }
    const signBit = lastByte & 0x80
    signature[63] = lastByte & 0x7f

    const edwardsPublicKey = montgomeryToEdwardsPubKey(publicKey.subarray(1), signBit)
    const cryptoKey = await webcrypto.subtle.importKey(
        'raw',
        edwardsPublicKey,
        { name: 'Ed25519' },
        false,
        ['verify']
    )
    return webcrypto.subtle.verify('Ed25519', cryptoKey, signature, message)
}

function parseNoiseCertificate(
    certificate: typeof proto.CertChain.prototype.leaf
): ParsedNoiseCertificate {
    if (!certificate) {
        throw new Error('missing noise certificate')
    }

    const detailsBytes = decodeProtoBytes(certificate.details, 'certificate.details')
    const signatureBytes = decodeProtoBytes(certificate.signature, 'certificate.signature')
    if (signatureBytes.length !== 64) {
        throw new Error('invalid certificate signature size')
    }

    const details = proto.CertChain.NoiseCertificate.Details.decode(detailsBytes)
    const serial = toSafeNumber(details.serial as number, 'certificate.serial')
    const issuerSerial = toSafeNumber(details.issuerSerial as number, 'certificate.issuerSerial')
    const key = decodeProtoBytes(details.key, 'certificate.key')

    return {
        serial,
        issuerSerial,
        key,
        details: detailsBytes,
        signature: signatureBytes
    }
}

function rootPublicKeySerialized(): Uint8Array {
    const raw = toBytesView(Buffer.from(ROOT_CA_PUBLIC_KEY_HEX, 'hex'))
    return toSerializedPubKey(raw)
}

export async function verifyNoiseCertificateChain(
    certificateChain: Uint8Array,
    serverStatic: Uint8Array
): Promise<void> {
    const chain = proto.CertChain.decode(certificateChain)
    if (!chain.leaf || !chain.intermediate) {
        throw new Error('noise certificate chain is missing leaf/intermediate')
    }

    const intermediate = parseNoiseCertificate(chain.intermediate)
    if (intermediate.issuerSerial !== ROOT_CA_SERIAL) {
        throw new Error('intermediate certificate issuer mismatch')
    }

    const rootKey = rootPublicKeySerialized()
    const validIntermediate = await verifySignalVariant(
        rootKey,
        intermediate.details,
        intermediate.signature
    )
    if (!validIntermediate) {
        throw new Error('intermediate certificate signature is invalid')
    }

    const leaf = parseNoiseCertificate(chain.leaf)
    if (leaf.issuerSerial !== intermediate.serial) {
        throw new Error('leaf certificate issuer mismatch')
    }

    const intermediatePublicSerialized = toSerializedPubKey(intermediate.key)
    const validLeaf = await verifySignalVariant(
        intermediatePublicSerialized,
        leaf.details,
        leaf.signature
    )
    if (!validLeaf) {
        throw new Error('leaf certificate signature is invalid')
    }

    if (!uint8Equal(leaf.key, serverStatic)) {
        throw new Error('leaf certificate key mismatch with server static key')
    }
}
