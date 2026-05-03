import { type SignalKeyPair, X25519 } from 'zapo-js/crypto'

export async function keyPairFromPrivate(privKey: Uint8Array): Promise<SignalKeyPair> {
    return X25519.keyPairFromPrivateKey(privKey)
}
