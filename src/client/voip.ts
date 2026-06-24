import type { Proto } from '@proto'
import type { SignalAddress } from '@signal/types'
import type { BinaryNode } from '@transport/types'

type SignalEnvelopeType = 'msg' | 'pkmsg'

export interface WaVoipEncryptedEnvelope {
    readonly type: SignalEnvelopeType
    readonly ciphertext: Uint8Array
}

/**
 * @sensitive Carries the account's signed device identity. Do not log or
 * `JSON.stringify` instances.
 */
export interface WaVoipCredentials {
    readonly meJid?: string
    readonly meLid?: string
    readonly signedIdentity?: Proto.IADVSignedDeviceIdentity
}

/**
 * The host-socket surface the `@zapo-js/voip` calling engine drives, expressed
 * in zapo's native primitives: `SignalAddress`-keyed signal operations and flat
 * credential / session / device APIs. `WaClient.voip` returns an object of this
 * exact shape, structurally compatible with `@zapo-js/voip`'s `VoipSocket`, so
 * `createVoipManager(client.voip)` type-checks across the package boundary
 * without the core depending on the package.
 */
export interface WaVoipSocket {
    getCredentials(): WaVoipCredentials | null
    sendNode(node: BinaryNode): Promise<void>
    query(node: BinaryNode): Promise<BinaryNode>
    encryptMessage(address: SignalAddress, plaintext: Uint8Array): Promise<WaVoipEncryptedEnvelope>
    encryptMessagesBatch(
        requests: readonly { readonly address: SignalAddress; readonly plaintext: Uint8Array }[]
    ): Promise<readonly WaVoipEncryptedEnvelope[]>
    decryptMessage(address: SignalAddress, envelope: WaVoipEncryptedEnvelope): Promise<Uint8Array>
    syncSignalSession(jid: string): Promise<void>
    syncDeviceList(
        jids: readonly string[]
    ): Promise<readonly { readonly jid: string; readonly deviceJids: readonly string[] }[]>
    queryLidsByPhoneJids(
        jids: readonly string[]
    ): Promise<readonly { readonly phoneJid: string; readonly lidJid: string | null }[]>
    getPrivacyToken(jid: string): Promise<Uint8Array | null>
}
