import { type SignalKeyPair, X25519 } from '../../transport/crypto'

export interface FakePeerIdentity {
    readonly identityKeyPair: SignalKeyPair
    readonly registrationId: number
}

export async function generateFakePeerIdentity(): Promise<FakePeerIdentity> {
    const identityKeyPair = await X25519.generateKeyPair()
    return {
        identityKeyPair,
        registrationId: Math.floor(Math.random() * 0x3fff) + 1
    }
}
