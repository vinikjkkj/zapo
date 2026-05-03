import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { X25519 } from 'zapo-js/crypto'

import { convertWhatsmeowIdentityKey, convertWhatsmeowPreKey } from '../whatsmeow/keys'

describe('convertWhatsmeowPreKey', () => {
    it('derives public from the 32-byte private column', async () => {
        const kp = await X25519.generateKeyPair()
        const result = await convertWhatsmeowPreKey({
            key_id: 5,
            key: kp.privKey,
            uploaded: true
        })
        assert.equal(result.keyId, 5)
        assert.deepEqual(Array.from(result.keyPair.pubKey), Array.from(kp.pubKey))
        assert.equal(result.uploaded, true)
    })

    it('coerces sqlite-style boolean (0/1) for uploaded', async () => {
        const kp = await X25519.generateKeyPair()
        const result = await convertWhatsmeowPreKey({
            key_id: 1n,
            key: kp.privKey,
            uploaded: 0
        })
        assert.equal(result.uploaded, false)
    })
})

describe('convertWhatsmeowIdentityKey', () => {
    it('parses colon-style libsignal address', () => {
        const identity = new Uint8Array(32)
        const result = convertWhatsmeowIdentityKey({
            their_id: '5511999999999:3',
            identity
        })
        assert.equal(result.address.user, '5511999999999')
        assert.equal(result.address.device, 3)
        assert.equal(result.address.server, 's.whatsapp.net')
        assert.equal(result.identityKey, identity)
    })
})
