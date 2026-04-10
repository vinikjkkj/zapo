import { Ed25519, toSerializedPubKey } from '@crypto'
import { montgomeryToEdwardsPublic } from '@crypto/curves/X25519'
import { proto } from '@proto'
import { ROOT_CA_PUBLIC_KEY_HEX, ROOT_CA_SERIAL } from '@transport/noise/constants'
import { assertByteLength, decodeProtoBytes, hexToBytes, uint8Equal } from '@util/bytes'
import { toSafeNumber } from '@util/primitives'

interface ParsedNoiseCertificate {
    readonly serial: number
    readonly issuerSerial: number
    readonly key: Uint8Array
    readonly details: Uint8Array
    readonly signature: Uint8Array
}

export interface WaNoiseRootCa {
    /** Raw 32-byte X25519 public key (without version prefix). */
    readonly publicKey: Uint8Array
    /** Serial number that intermediate certs issued by this root must claim. */
    readonly serial: number
}

const PRODUCTION_ROOT_CA: WaNoiseRootCa = {
    publicKey: hexToBytes(ROOT_CA_PUBLIC_KEY_HEX),
    serial: ROOT_CA_SERIAL
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

    const edwardsPublicKey = montgomeryToEdwardsPublic(publicKey.subarray(1), signBit)
    return Ed25519.verify(message, signature, edwardsPublicKey)
}

function parseNoiseCertificate(
    certificate: typeof proto.CertChain.prototype.leaf
): ParsedNoiseCertificate {
    if (!certificate) {
        throw new Error('missing noise certificate')
    }

    const detailsBytes = decodeProtoBytes(certificate.details, 'certificate.details')
    const signatureBytes = decodeProtoBytes(certificate.signature, 'certificate.signature')
    assertByteLength(signatureBytes, 64, 'invalid certificate signature size')

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

function rootPublicKeySerialized(rootCa: WaNoiseRootCa): Uint8Array {
    return toSerializedPubKey(rootCa.publicKey)
}

export async function verifyNoiseCertificateChain(
    certificateChain: Uint8Array,
    serverStatic: Uint8Array,
    rootCa: WaNoiseRootCa = PRODUCTION_ROOT_CA
): Promise<void> {
    const chain = proto.CertChain.decode(certificateChain)
    if (!chain.leaf || !chain.intermediate) {
        throw new Error('noise certificate chain is missing leaf/intermediate')
    }

    const intermediate = parseNoiseCertificate(chain.intermediate)
    if (intermediate.issuerSerial !== rootCa.serial) {
        throw new Error('intermediate certificate issuer mismatch')
    }

    const rootKey = rootPublicKeySerialized(rootCa)
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
