import type { Proto } from 'zapo-js/proto'
import type { SignalAddress } from 'zapo-js/signal'
import type { BinaryNode } from 'zapo-js/transport'

export type VoipSignalEnvelopeType = 'msg' | 'pkmsg'

export interface VoipEncryptedEnvelope {
    readonly type: VoipSignalEnvelopeType
    readonly ciphertext: Uint8Array
}

export interface VoipCredentials {
    readonly meJid?: string
    readonly meLid?: string
    readonly signedIdentity?: Proto.IADVSignedDeviceIdentity
}

/**
 * Host-socket surface the VOIP engine drives, expressed in zapo's native
 * primitives: `SignalAddress`-keyed signal operations and flat credential /
 * session / device APIs. `WaClient.voip` returns an object of this exact shape,
 * so `createVoipManager(client.voip)` type-checks across the package boundary
 * without the core depending on this package.
 */
export interface VoipSocket {
    getCredentials(): VoipCredentials | null
    sendNode(node: BinaryNode): Promise<void>
    query(node: BinaryNode): Promise<BinaryNode>
    encryptMessage(address: SignalAddress, plaintext: Uint8Array): Promise<VoipEncryptedEnvelope>
    encryptMessagesBatch(
        requests: readonly { readonly address: SignalAddress; readonly plaintext: Uint8Array }[]
    ): Promise<readonly VoipEncryptedEnvelope[]>
    decryptMessage(address: SignalAddress, envelope: VoipEncryptedEnvelope): Promise<Uint8Array>
    syncSignalSession(jid: string): Promise<void>
    syncDeviceList(
        jids: readonly string[]
    ): Promise<readonly { readonly jid: string; readonly deviceJids: readonly string[] }[]>
    queryLidsByPhoneJids(
        jids: readonly string[]
    ): Promise<readonly { readonly phoneJid: string; readonly lidJid: string | null }[]>
    getPrivacyToken(jid: string): Promise<Uint8Array | null>
}
