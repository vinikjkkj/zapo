import type { WaAuthCredentials } from 'zapo-js/auth'

import { keyPairFromPrivate } from '../util/keys'

import { toNumber } from './numeric'
import type { WhatsmeowDeviceRow } from './types'

/** Async: whatsmeow only persists the 32B X25519 privates; publics are derived. */
export async function convertWhatsmeowDevice(
    row: WhatsmeowDeviceRow,
    options: { readonly serverHasPreKeyCount?: number } = {}
): Promise<WaAuthCredentials> {
    const [noisePair, identityPair, signedPreKeyPair] = await Promise.all([
        keyPairFromPrivate(row.noise_key),
        keyPairFromPrivate(row.identity_key),
        keyPairFromPrivate(row.signed_pre_key)
    ])

    return {
        noiseKeyPair: noisePair,
        registrationInfo: {
            registrationId: toNumber(row.registration_id, 'registration_id'),
            identityKeyPair: identityPair
        },
        signedPreKey: {
            keyId: toNumber(row.signed_pre_key_id, 'signed_pre_key_id'),
            keyPair: signedPreKeyPair,
            signature: row.signed_pre_key_sig,
            uploaded: true
        },
        advSecretKey: row.adv_key,
        signedIdentity: {
            details: row.adv_details,
            accountSignatureKey: row.adv_account_sig_key,
            accountSignature: row.adv_account_sig,
            deviceSignature: row.adv_device_sig
        },
        meJid: row.jid,
        meLid: row.lid ?? undefined,
        meDisplayName: row.push_name ?? undefined,
        platform: row.platform ?? undefined,
        pushName: row.push_name ?? undefined,
        serverHasPreKeys:
            options.serverHasPreKeyCount !== undefined
                ? options.serverHasPreKeyCount > 0
                : undefined
    }
}
