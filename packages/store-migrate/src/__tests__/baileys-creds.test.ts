import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { proto } from 'zapo-js/proto'

import { convertBaileysCreds } from '../baileys/creds'
import type { BaileysAuthenticationCreds } from '../baileys/types'
import { bufferJsonReviver } from '../util/buffer-json'

// Fixture sourced from the upstream Baileys repo (`baileys_auth_info/creds.json`).
// It is a test/staging account left in the public repo, not user data.
const FIXTURE_TEXT = JSON.stringify({
    noiseKey: {
        private: { type: 'Buffer', data: '2P6qB8qA7LGQ+YKENJk+ZPLeIiCUE7Ars25d8Lnr7UQ=' },
        public: { type: 'Buffer', data: 'DLdrevDQe6DysKKSUl/3IdwYUF2NzAGSyIEpCn/2CRU=' }
    },
    pairingEphemeralKeyPair: {
        private: { type: 'Buffer', data: '4BV6WbXF+gw9AtTmeBEyOX8XGfhjSkZvhF2vfOPT80A=' },
        public: { type: 'Buffer', data: 'FF+bnNQwMIlau1LWKYhXMuW69B3hmREeOLD0sxwT9Ek=' }
    },
    signedIdentityKey: {
        private: { type: 'Buffer', data: 'iLPyTWgfLBHuLhJDtahbr6b+xo/VscMkPrxNitQtU3U=' },
        public: { type: 'Buffer', data: 'f6MzdnoPtgnaoOz4G7GIKdWNuqjI1W/npxwRDC3T7D4=' }
    },
    signedPreKey: {
        keyPair: {
            private: { type: 'Buffer', data: 'sP1nJcLT26EhLlqZ8ieH10jj6+YVZ7O4zbwX6EabaX8=' },
            public: { type: 'Buffer', data: 'qF+uRgG/gfuIPAQHTgkPwu/99fBbqPR8fvGfgYIZolk=' }
        },
        signature: {
            type: 'Buffer',
            data: 'vxiRzFrRl/7gW5PtqiyfUkDqqPuvSbL511Ay3oVryE8/u/uW6anGIaGbP68zLKxFQbzVPOlGw5H/KJQ0acGZBw=='
        },
        keyId: 1
    },
    registrationId: 138,
    advSecretKey: 'gr2WI8nNQsCX3T2OFLQ4XEqOFx30KwLoNSyPuG+JBgY=',
    processedHistoryMessages: [],
    nextPreKeyId: 1,
    firstUnuploadedPreKeyId: 1,
    accountSyncCounter: 0,
    accountSettings: { unarchiveChats: false },
    registered: false,
    account: {
        details: 'CL6U6YIIEIqcr88GGAEgACgA',
        accountSignatureKey: 'Bf9vu9HN/FNRTGAM5LkecDimUtgFRJuC0UgCXs37QP9h',
        accountSignature:
            'Crai7i0IfoU4QpQiHNr8puo1g9NmkhuhexqYx/2FzaJy2ZIjwuaAZzt1sNvbXSwQWYGJdkfguvLIS2uh2fJLBA==',
        deviceSignature:
            'r7DNs4xAUd4SOT+hKH5wP3F2VAp5pmaS5O0rRx+QjKOvh0/FlCLh765m/bbOiCq0ijD+PX7xPl0dLVYnXZatAg=='
    },
    me: {
        id: '56965746475:12@s.whatsapp.net',
        lid: '102513101521058:12@lid'
    },
    signalIdentities: [
        {
            identifier: { name: '102513101521058:12@lid', deviceId: 0 },
            identifierKey: {
                type: 'Buffer',
                data: 'Bf9vu9HN/FNRTGAM5LkecDimUtgFRJuC0UgCXs37QP9h'
            }
        }
    ],
    platform: 'android'
})

describe('convertBaileysCreds (real Baileys fixture)', () => {
    it('maps every required zapo field with byte-exact key material', () => {
        const fixture = JSON.parse(FIXTURE_TEXT, bufferJsonReviver) as BaileysAuthenticationCreds
        const result = convertBaileysCreds(fixture)

        // Noise key — round-trip pub/priv unchanged
        assert.equal(result.noiseKeyPair.pubKey.length, 32)
        assert.equal(result.noiseKeyPair.privKey.length, 32)
        assert.equal(
            Buffer.from(result.noiseKeyPair.pubKey).toString('base64'),
            'DLdrevDQe6DysKKSUl/3IdwYUF2NzAGSyIEpCn/2CRU='
        )

        // Identity key
        assert.equal(result.registrationInfo.registrationId, 138)
        assert.equal(result.registrationInfo.identityKeyPair.privKey.length, 32)

        // Signed pre-key
        assert.equal(result.signedPreKey.keyId, 1)
        assert.equal(result.signedPreKey.signature.length, 64)
        assert.equal(result.signedPreKey.uploaded, true)

        // ADV secret — base64 → 32 bytes
        assert.equal(result.advSecretKey.length, 32)
        assert.equal(
            Buffer.from(result.advSecretKey).toString('base64'),
            'gr2WI8nNQsCX3T2OFLQ4XEqOFx30KwLoNSyPuG+JBgY='
        )

        // Signed identity round-trips through proto encode/decode losslessly
        assert.ok(result.signedIdentity)
        const encoded = proto.ADVSignedDeviceIdentity.encode(result.signedIdentity).finish()
        const decoded = proto.ADVSignedDeviceIdentity.decode(encoded)
        assert.equal(decoded.accountSignature?.length, 64)
        assert.equal(decoded.deviceSignature?.length, 64)
        assert.equal(decoded.accountSignatureKey?.length, 33)

        // Identity propagation
        assert.equal(result.meJid, '56965746475:12@s.whatsapp.net')
        assert.equal(result.meLid, '102513101521058:12@lid')
        assert.equal(result.platform, 'android')

        // Server prekey state — fresh account, none uploaded yet
        assert.equal(result.serverHasPreKeys, false)
    })
})
