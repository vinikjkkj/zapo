import type { WaVoipDeps } from '../../types.js'

export const CALLER_DEVICE_JID = '50062877036657:76@lid'

export function createOfferDeps(): WaVoipDeps {
    return {
        authClient: {
            getCurrentCredentials: () => ({
                meJid: '1111111111@lid',
                meLid: '1111111111@lid',
                signedIdentity: { details: new Uint8Array([1, 2, 3]) }
            })
        },
        signalDeviceSync: {
            syncDeviceList: async () => [{ deviceJids: [CALLER_DEVICE_JID] }]
        },
        sessionResolver: {
            ensureSessionsBatch: async (devices: string[]) =>
                devices.map((jid) => ({ address: jid, session: {} }))
        },
        signalProtocol: {
            encryptMessagesBatch: async (entries: unknown[]) =>
                entries.map(() => ({
                    type: 'pkmsg',
                    ciphertext: new Uint8Array([1, 2, 3])
                }))
        }
    } as unknown as WaVoipDeps
}
