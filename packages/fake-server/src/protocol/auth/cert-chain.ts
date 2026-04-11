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
}

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

    const intermediateKeyPair = await X25519.generateKeyPair()

    const intermediateDetails = proto.CertChain.NoiseCertificate.Details.encode({
        serial: intermediateSerial,
        issuerSerial: input.root.serial,
        key: intermediateKeyPair.pubKey
    }).finish()
    const intermediateSignature = await xeddsaSign(input.root.privateKey, intermediateDetails)

    const leafDetails = proto.CertChain.NoiseCertificate.Details.encode({
        serial: leafSerial,
        issuerSerial: intermediateSerial,
        key: input.leafKey
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
