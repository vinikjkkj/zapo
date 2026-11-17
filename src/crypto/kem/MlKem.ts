import { createPrivateKey, createPublicKey } from 'node:crypto'

import {
    ML_KEM_1024_CIPHERTEXT_BYTES,
    ML_KEM_1024_PUBLIC_KEY_BYTES,
    ML_KEM_1024_SPKI_PREFIX
} from '@crypto/kem/constants'
import {
    mlKemDecapsulate,
    mlKemEncapsulate,
    mlKemGenerateKeyPair,
    mlKemGenerateKeyPairSync,
    mlKemHasNativeApi
} from '@crypto/kem/node-kem'
import type { KemEncapsulation, KemKeyPair } from '@crypto/kem/types'
import { assertByteLength, concatBytes, toBytesView } from '@util/bytes'

let supported: boolean | null = null

/**
 * Whether ML-KEM-1024 is available in the running runtime.
 *
 * Native KEM (`crypto.encapsulate`/`decapsulate` + `ml-kem-1024` keygen) lands
 * with OpenSSL 3.5, i.e. Node >= 24. On older runtimes this returns `false` and
 * the whole post-quantum path stays disabled, so classic Signal continues to
 * work unchanged. Probed once and cached.
 */
export function isMlKemSupported(): boolean {
    if (supported === null) {
        try {
            mlKemGenerateKeyPairSync()
            supported = mlKemHasNativeApi()
        } catch {
            supported = false
        }
    }
    return supported
}

/** Generates a fresh ML-KEM-1024 key pair. Throws if the runtime lacks native KEM. */
export async function generateKemKeyPair(): Promise<KemKeyPair> {
    const { publicKey, privateKey } = await mlKemGenerateKeyPair()
    return {
        pubKey: exportRawPublicKey(publicKey),
        privKey: toBytesView(privateKey.export({ format: 'der', type: 'pkcs8' }))
    }
}

/**
 * Encapsulates against a peer's raw 1568-byte ML-KEM-1024 public key, producing
 * the ciphertext to send and the shared secret to fold into PQXDH.
 */
export function kemEncapsulate(rawPublicKey: Uint8Array): KemEncapsulation {
    assertByteLength(rawPublicKey, ML_KEM_1024_PUBLIC_KEY_BYTES, 'ml-kem public key')
    const publicKey = createPublicKey({
        key: concatBytes([ML_KEM_1024_SPKI_PREFIX, rawPublicKey]) as Buffer,
        format: 'der',
        type: 'spki'
    })
    const { sharedKey, ciphertext } = mlKemEncapsulate(publicKey)
    return {
        ciphertext: toBytesView(ciphertext),
        sharedSecret: toBytesView(sharedKey)
    }
}

/**
 * Decapsulates a peer's ciphertext with a locally stored decapsulation key
 * (the opaque `privKey` from {@link generateKemKeyPair}), recovering the shared
 * secret.
 */
export function kemDecapsulate(privKey: Uint8Array, ciphertext: Uint8Array): Uint8Array {
    assertByteLength(ciphertext, ML_KEM_1024_CIPHERTEXT_BYTES, 'ml-kem ciphertext')
    const privateKey = createPrivateKey({
        key: privKey as Buffer,
        format: 'der',
        type: 'pkcs8'
    })
    return toBytesView(mlKemDecapsulate(privateKey, ciphertext))
}

function exportRawPublicKey(publicKey: ReturnType<typeof createPublicKey>): Uint8Array {
    const der = publicKey.export({ format: 'der', type: 'spki' })
    return toBytesView(der.subarray(ML_KEM_1024_SPKI_PREFIX.length))
}
