/**
 * Fake noise certificate chain generator.
 *
 * Source:
 *   /deobfuscated/WAWebProcessC/WAWebProcessCertificate.js (verification rules)
 *   proto/WAProto.proto message CertChain (wire format)
 *
 * The fake server generates an ephemeral X25519 root keypair on startup. It
 * uses that root to sign an intermediate cert, which in turn signs a leaf
 * cert whose `key` field equals the server static key sent during the noise
 * XX handshake.
 *
 * The client (zapo-js) is told about the root via `testHooks.noiseRootCa`
 * — that is the only escape hatch needed: the client still runs the full
 * verification code path on every chain, just with a different trust root.
 *
 * Cert layout (signed with XEdDSA over `details` bytes):
 *
 *     Intermediate
 *       details = encode({ serial: <intermediate>, issuerSerial: <root>, key: intermediatePub })
 *       signature = signSignalMessage(rootPrivateKey, details)
 *
 *     Leaf
 *       details = encode({ serial: <leaf>, issuerSerial: <intermediate>, key: leafPub })
 *       signature = signSignalMessage(intermediatePrivateKey, details)
 *
 * Verification (mirror of WaNoiseCert.verifyNoiseCertificateChain):
 *
 *   intermediate.issuerSerial === rootSerial
 *   verifySignalSignature(rootPub, intermediate.details, intermediate.signature)
 *   leaf.issuerSerial === intermediate.serial
 *   verifySignalSignature(intermediate.key, leaf.details, leaf.signature)
 *   leaf.key === serverStaticKey
 */

import { signSignalMessage, X25519 } from '../../transport/crypto'
import { proto } from '../../transport/protos'

export interface FakeNoiseRootCa {
    /** Public X25519 key (32 bytes raw, no version prefix) — feed this to the client. */
    readonly publicKey: Uint8Array
    /** Serial used by intermediate certs as `issuerSerial`. */
    readonly serial: number
    /** Private key kept inside the fake server for signing. */
    readonly privateKey: Uint8Array
}

export interface FakeCertChainResult {
    /** Encoded `proto.CertChain` ready to put in the noise ServerHello payload. */
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
    const intermediateSignature = await signSignalMessage(
        input.root.privateKey,
        intermediateDetails
    )

    const leafDetails = proto.CertChain.NoiseCertificate.Details.encode({
        serial: leafSerial,
        issuerSerial: intermediateSerial,
        key: input.leafKey
    }).finish()
    const leafSignature = await signSignalMessage(intermediateKeyPair.privKey, leafDetails)

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
