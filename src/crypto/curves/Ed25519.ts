import { webcrypto } from 'node:crypto'

import { ED25519_PKCS8_PREFIX } from '@crypto/curves/constants'
import { pkcs8FromRawPrivate, type SignalKeyPair, type SubtleKeyPair } from '@crypto/curves/types'
import { assertByteLength, decodeBase64Url, toBytesView } from '@util/bytes'

const edSignKeyCache = new WeakMap<Uint8Array, webcrypto.CryptoKey>()
const edVerifyKeyCache = new WeakMap<Uint8Array, webcrypto.CryptoKey>()

export class Ed25519 {
    static async generateKeyPair(): Promise<SignalKeyPair> {
        const keys = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, [
            'sign',
            'verify'
        ])) as SubtleKeyPair
        const privateJwk = await webcrypto.subtle.exportKey('jwk', keys.privateKey)
        return {
            pubKey: decodeBase64Url(privateJwk.x, 'ed25519 public key'),
            privKey: decodeBase64Url(privateJwk.d, 'ed25519 private key')
        }
    }

    static async keyPairFromPrivateKey(privKey: Uint8Array): Promise<SignalKeyPair> {
        assertByteLength(privKey, 32, 'ed25519 private key must be 32 bytes')
        const privateKey = await webcrypto.subtle.importKey(
            'pkcs8',
            pkcs8FromRawPrivate(ED25519_PKCS8_PREFIX, privKey),
            { name: 'Ed25519' },
            true,
            ['sign']
        )
        const privateJwk = await webcrypto.subtle.exportKey('jwk', privateKey)
        return {
            pubKey: decodeBase64Url(privateJwk.x, 'ed25519 public key'),
            privKey: decodeBase64Url(privateJwk.d, 'ed25519 private key')
        }
    }

    static async sign(message: Uint8Array, privKey: Uint8Array): Promise<Uint8Array> {
        assertByteLength(privKey, 32, 'ed25519 private key must be 32 bytes')
        let privateKey = edSignKeyCache.get(privKey)
        if (!privateKey) {
            privateKey = await webcrypto.subtle.importKey(
                'pkcs8',
                pkcs8FromRawPrivate(ED25519_PKCS8_PREFIX, privKey),
                { name: 'Ed25519' },
                false,
                ['sign']
            )
            edSignKeyCache.set(privKey, privateKey)
        }
        const signature = await webcrypto.subtle.sign('Ed25519', privateKey, message)
        return toBytesView(signature)
    }

    static async verify(
        message: Uint8Array,
        signature: Uint8Array,
        pubKey: Uint8Array
    ): Promise<boolean> {
        assertByteLength(pubKey, 32, 'ed25519 public key must be 32 bytes')
        let publicKey = edVerifyKeyCache.get(pubKey)
        if (!publicKey) {
            publicKey = await webcrypto.subtle.importKey(
                'raw',
                pubKey,
                { name: 'Ed25519' },
                false,
                ['verify']
            )
            edVerifyKeyCache.set(pubKey, publicKey)
        }
        return webcrypto.subtle.verify('Ed25519', publicKey, signature, message)
    }
}
