import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { X25519 } from 'zapo-js/crypto'

import { convertBaileysIdentityKey, convertBaileysPreKey } from '../baileys/keys'

describe('convertBaileysPreKey', () => {
    it('maps Baileys public/private into zapo pubKey/privKey', async () => {
        const kp = await X25519.generateKeyPair()
        const record = convertBaileysPreKey(
            7,
            { public: kp.pubKey, private: kp.privKey },
            {
                uploaded: true
            }
        )
        assert.equal(record.keyId, 7)
        assert.equal(record.uploaded, true)
        assert.equal(record.keyPair.pubKey, kp.pubKey)
        assert.equal(record.keyPair.privKey, kp.privKey)
    })

    it('omits uploaded flag when not provided', () => {
        const record = convertBaileysPreKey(1, {
            public: new Uint8Array(32),
            private: new Uint8Array(32)
        })
        assert.equal(record.uploaded, undefined)
    })
})

describe('convertBaileysIdentityKey', () => {
    it('parses libsignal address into a SignalAddress', () => {
        const key = new Uint8Array(32)
        const result = convertBaileysIdentityKey('5511999999999.4', key)
        assert.equal(result.address.user, '5511999999999')
        assert.equal(result.address.device, 4)
        assert.equal(result.address.server, 's.whatsapp.net')
        assert.equal(result.identityKey, key)
    })

    it('preserves Baileys lid suffix when stripping', () => {
        const result = convertBaileysIdentityKey('102513101521058_1.12', new Uint8Array(32))
        assert.equal(result.address.user, '102513101521058')
        assert.equal(result.address.server, 'lid')
        assert.equal(result.address.device, 12)
    })
})
