/** Fake noise certificate chain generator for handshake tests. */

import { X25519, xeddsaSign } from '../../transport/crypto'
import { proto } from '../../transport/protos'

export interface FakeNoiseRootCa {
    readonly publicKey: Uint8Array
    readonly serial: number
    readonly privateKey: Uint8Array
}

export interface FakeCertChainResult {
    readonly encoded: Uint8Array
}

export interface BuildFakeCertChainInput {
    readonly root: FakeNoiseRootCa
    readonly leafKey: Uint8Array
    readonly intermediateSerial?: number
    readonly leafSerial?: number
    /** Unix seconds. Defaults to 24h before build time. */
    readonly notBefore?: number
    /** Unix seconds. Defaults to 10 years after build time. */
    readonly notAfter?: number
}

const CERT_NOT_BEFORE_BACKDATE_SECONDS = 86_400
const CERT_NOT_AFTER_LIFETIME_SECONDS = 315_360_000

export async function generateFakeNoiseRootCa(): Promise<FakeNoiseRootCa> {
    const keyPair = await X25519.generateKeyPair()
    return {
        publicKey: keyPair.pubKey,
        privateKey: keyPair.privKey,
        serial: 0
    }
}

export async function buildFakeCertChain(
    input: BuildFakeCertChainInput
): Promise<FakeCertChainResult> {
    const intermediateSerial = input.intermediateSerial ?? 1
    const leafSerial = input.leafSerial ?? 2

    // Strict clients (e.g. whatsmeow) enforce the validity window; leaving
    // notBefore/notAfter unset decodes as 0 (1970) and reads as expired.
    const nowSeconds = Math.floor(Date.now() / 1_000)
    const notBefore = input.notBefore ?? nowSeconds - CERT_NOT_BEFORE_BACKDATE_SECONDS
    const notAfter = input.notAfter ?? nowSeconds + CERT_NOT_AFTER_LIFETIME_SECONDS

    const intermediateKeyPair = await X25519.generateKeyPair()

    const intermediateDetails = proto.CertChain.NoiseCertificate.Details.encode({
        serial: intermediateSerial,
        issuerSerial: input.root.serial,
        key: intermediateKeyPair.pubKey,
        notBefore,
        notAfter
    }).finish()
    const intermediateSignature = await xeddsaSign(input.root.privateKey, intermediateDetails)

    const leafDetails = proto.CertChain.NoiseCertificate.Details.encode({
        serial: leafSerial,
        issuerSerial: intermediateSerial,
        key: input.leafKey,
        notBefore,
        notAfter
    }).finish()
    const leafSignature = await xeddsaSign(intermediateKeyPair.privKey, leafDetails)

    const encoded = proto.CertChain.encode({
        intermediate: {
            details: intermediateDetails,
            signature: intermediateSignature
        },
        leaf: {
            details: leafDetails,
            signature: leafSignature
        }
    }).finish()

    return { encoded }
}
