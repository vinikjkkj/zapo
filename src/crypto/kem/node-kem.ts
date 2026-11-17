import * as nodeCrypto from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { promisify } from 'node:util'

interface KemEncapsulateResult {
    readonly sharedKey: Buffer
    readonly ciphertext: Buffer
}

/**
 * The ML-KEM surface of `node:crypto`. Native KEM ships in the runtime with
 * OpenSSL 3.5 (Node >= 24), ahead of the pinned `@types/node`, so it is absent
 * from the module's type declarations. Every cast to this ahead-of-types shape
 * is contained in this file; the rest of the KEM code is fully typed against it.
 */
interface NodeMlKemApi {
    generateKeyPairSync(type: 'ml-kem-1024'): { publicKey: KeyObject; privateKey: KeyObject }
    generateKeyPair(
        type: 'ml-kem-1024',
        callback: (err: Error | null, publicKey: KeyObject, privateKey: KeyObject) => void
    ): void
    encapsulate?: (key: KeyObject) => KemEncapsulateResult
    decapsulate?: (key: KeyObject, ciphertext: Uint8Array) => Buffer
}

const api = nodeCrypto as unknown as NodeMlKemApi

const generateKeyPairAsync = promisify(api.generateKeyPair) as unknown as (
    type: 'ml-kem-1024'
) => Promise<{ publicKey: KeyObject; privateKey: KeyObject }>

export function mlKemHasNativeApi(): boolean {
    return typeof api.encapsulate === 'function' && typeof api.decapsulate === 'function'
}

export function mlKemGenerateKeyPairSync(): { publicKey: KeyObject; privateKey: KeyObject } {
    return api.generateKeyPairSync('ml-kem-1024')
}

export function mlKemGenerateKeyPair(): Promise<{ publicKey: KeyObject; privateKey: KeyObject }> {
    return generateKeyPairAsync('ml-kem-1024')
}

export function mlKemEncapsulate(key: KeyObject): KemEncapsulateResult {
    if (!api.encapsulate) {
        throw new Error('ml-kem encapsulate not supported by this runtime')
    }
    return api.encapsulate(key)
}

export function mlKemDecapsulate(key: KeyObject, ciphertext: Uint8Array): Buffer {
    if (!api.decapsulate) {
        throw new Error('ml-kem decapsulate not supported by this runtime')
    }
    return api.decapsulate(key, ciphertext)
}
