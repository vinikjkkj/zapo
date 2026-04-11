import { xeddsaVerify } from '@crypto'
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

    const validIntermediate = await xeddsaVerify(
        rootCa.publicKey,
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

    const validLeaf = await xeddsaVerify(intermediate.key, leaf.details, leaf.signature)
    if (!validLeaf) {
        throw new Error('leaf certificate signature is invalid')
    }

    if (!uint8Equal(leaf.key, serverStatic)) {
        throw new Error('leaf certificate key mismatch with server static key')
    }
}
