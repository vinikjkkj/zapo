import type { WaAuthCredentials } from 'zapo-js/auth'
import { base64ToBytes } from 'zapo-js/util'

import type { BaileysAuthenticationCreds } from './types'

export function convertBaileysCreds(creds: BaileysAuthenticationCreds): WaAuthCredentials {
    const account = creds.account
    const signedIdentity = account
        ? {
              details: account.details ?? null,
              accountSignatureKey: account.accountSignatureKey ?? null,
              accountSignature: account.accountSignature ?? null,
              deviceSignature: account.deviceSignature ?? null
          }
        : undefined

    return {
        noiseKeyPair: {
            pubKey: creds.noiseKey.public,
            privKey: creds.noiseKey.private
        },
        registrationInfo: {
            registrationId: creds.registrationId,
            identityKeyPair: {
                pubKey: creds.signedIdentityKey.public,
                privKey: creds.signedIdentityKey.private
            }
        },
        signedPreKey: {
            keyId: creds.signedPreKey.keyId,
            keyPair: {
                pubKey: creds.signedPreKey.keyPair.public,
                privKey: creds.signedPreKey.keyPair.private
            },
            signature: creds.signedPreKey.signature,
            uploaded: true
        },
        advSecretKey: base64ToBytes(creds.advSecretKey),
        signedIdentity,
        meJid: creds.me?.id,
        meLid: creds.me?.lid,
        meDisplayName: creds.me?.name ?? creds.me?.notify,
        platform: creds.platform,
        serverHasPreKeys: creds.firstUnuploadedPreKeyId > 1,
        routingInfo: creds.routingInfo
    }
}
