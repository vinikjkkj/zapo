import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { X25519 } from 'zapo-js/crypto'

import { convertWhatsmeowDevice } from '../whatsmeow/creds'
import type { WhatsmeowDeviceRow } from '../whatsmeow/types'

describe('convertWhatsmeowDevice', () => {
    it('derives matching pub keys from the 32-byte private columns', async () => {
        const noise = await X25519.generateKeyPair()
        const identity = await X25519.generateKeyPair()
        const signedPre = await X25519.generateKeyPair()

        const row: WhatsmeowDeviceRow = {
            jid: '5511999999999.0:42@s.whatsapp.net',
            lid: '102513101521058.0:42@lid',
            registration_id: 1234,
            noise_key: noise.privKey,
            identity_key: identity.privKey,
            signed_pre_key: signedPre.privKey,
            signed_pre_key_id: 1,
            signed_pre_key_sig: new Uint8Array(64),
            adv_key: new Uint8Array(32),
            adv_details: new Uint8Array([1, 2, 3]),
            adv_account_sig: new Uint8Array(64),
            adv_account_sig_key: new Uint8Array(32),
            adv_device_sig: new Uint8Array(64),
            platform: 'android',
            push_name: 'Test User',
            facebook_uuid: null,
            lid_migration_ts: 0
        }

        const result = await convertWhatsmeowDevice(row, { serverHasPreKeyCount: 50 })

        assert.deepEqual(Array.from(result.noiseKeyPair.pubKey), Array.from(noise.pubKey))
        assert.deepEqual(
            Array.from(result.registrationInfo.identityKeyPair.pubKey),
            Array.from(identity.pubKey)
        )
        assert.deepEqual(
            Array.from(result.signedPreKey.keyPair.pubKey),
            Array.from(signedPre.pubKey)
        )
        assert.equal(result.registrationInfo.registrationId, 1234)
        assert.equal(result.signedPreKey.keyId, 1)
        assert.equal(result.platform, 'android')
        assert.equal(result.pushName, 'Test User')
        assert.equal(result.serverHasPreKeys, true)
        assert.ok(result.signedIdentity)
        assert.equal(result.signedIdentity?.details, row.adv_details)
    })

    it('handles bigint numerics and missing optional columns', async () => {
        const noise = await X25519.generateKeyPair()
        const identity = await X25519.generateKeyPair()
        const signedPre = await X25519.generateKeyPair()

        const row: WhatsmeowDeviceRow = {
            jid: '5511.0:1@s.whatsapp.net',
            registration_id: 99n,
            noise_key: noise.privKey,
            identity_key: identity.privKey,
            signed_pre_key: signedPre.privKey,
            signed_pre_key_id: 7n,
            signed_pre_key_sig: new Uint8Array(64),
            adv_key: new Uint8Array(32),
            adv_details: new Uint8Array(),
            adv_account_sig: new Uint8Array(64),
            adv_account_sig_key: new Uint8Array(32),
            adv_device_sig: new Uint8Array(64)
        }

        const result = await convertWhatsmeowDevice(row)
        assert.equal(result.registrationInfo.registrationId, 99)
        assert.equal(result.signedPreKey.keyId, 7)
        assert.equal(result.meLid, undefined)
        assert.equal(result.platform, undefined)
        assert.equal(result.serverHasPreKeys, undefined)
    })
})
