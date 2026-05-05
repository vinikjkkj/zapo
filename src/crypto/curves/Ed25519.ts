import {
    createPrivateKey,
    createPublicKey,
    generateKeyPair,
    sign as nodeSign,
    verify as nodeVerify
} from 'node:crypto'
import { promisify } from 'node:util'

import { ED25519_PKCS8_PREFIX, ED25519_SPKI_PREFIX } from '@crypto/curves/constants'
import { pkcs8FromRawPrivate, type SignalKeyPair } from '@crypto/curves/types'
import { assertByteLength, concatBytes, decodeBase64Url, toBytesView } from '@util/bytes'

const generateKeyPairAsync = promisify(generateKeyPair)
const signAsync = promisify(nodeSign)
const verifyAsync = promisify(nodeVerify)

function ed25519PrivateKeyObject(privKey: Uint8Array) {
    return createPrivateKey({
        key: pkcs8FromRawPrivate(ED25519_PKCS8_PREFIX, privKey) as Buffer,
        format: 'der',
        type: 'pkcs8'
    })
}

function ed25519PublicKeyObject(pubKey: Uint8Array) {
    return createPublicKey({
        key: concatBytes([ED25519_SPKI_PREFIX, pubKey]) as Buffer,
        format: 'der',
        type: 'spki'
    })
}

export class Ed25519 {
    static async generateKeyPair(): Promise<SignalKeyPair> {
        const { privateKey } = await generateKeyPairAsync('ed25519')
        const jwk = privateKey.export({ format: 'jwk' })
        return {
            pubKey: decodeBase64Url(jwk.x, 'ed25519 public key'),
            privKey: decodeBase64Url(jwk.d, 'ed25519 private key')
        }
    }

    static async keyPairFromPrivateKey(privKey: Uint8Array): Promise<SignalKeyPair> {
        assertByteLength(privKey, 32, 'ed25519 private key must be 32 bytes')
        const jwk = ed25519PrivateKeyObject(privKey).export({ format: 'jwk' })
        return {
            pubKey: decodeBase64Url(jwk.x, 'ed25519 public key'),
            privKey
        }
    }

    static async sign(message: Uint8Array, privKey: Uint8Array): Promise<Uint8Array> {
        assertByteLength(privKey, 32, 'ed25519 private key must be 32 bytes')
        const sig = await signAsync(null, message, ed25519PrivateKeyObject(privKey))
        return toBytesView(sig)
    }

    static async verify(
        message: Uint8Array,
        signature: Uint8Array,
        pubKey: Uint8Array
    ): Promise<boolean> {
        assertByteLength(pubKey, 32, 'ed25519 public key must be 32 bytes')
        return verifyAsync(null, message, ed25519PublicKeyObject(pubKey), signature)
    }
}
