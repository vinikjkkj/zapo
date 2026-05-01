import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { convertBaileysSenderKey } from '../baileys/sender-key'
import type { BaileysSenderKeyStateStructure } from '../baileys/types'

const SIGN_PUB = (() => {
    const out = new Uint8Array(33)
    out[0] = 0x05
    out.fill(0xaa, 1)
    return out
})()
const SIGN_PRIV = new Uint8Array(32).fill(0xbb)
const CHAIN_SEED = new Uint8Array(32).fill(0xcc)

describe('convertBaileysSenderKey', () => {
    it('promotes the latest state and maps every field', () => {
        const states: BaileysSenderKeyStateStructure[] = [
            {
                senderKeyId: 1,
                senderChainKey: { iteration: 0, seed: new Uint8Array(32).fill(0x01) },
                senderSigningKey: { public: SIGN_PUB, private: SIGN_PRIV },
                senderMessageKeys: []
            },
            {
                senderKeyId: 2,
                senderChainKey: { iteration: 5, seed: CHAIN_SEED },
                senderSigningKey: { public: SIGN_PUB, private: SIGN_PRIV },
                senderMessageKeys: [
                    { iteration: 1, seed: new Uint8Array(32).fill(0xdd) },
                    { iteration: 2, seed: new Uint8Array(32).fill(0xee) }
                ]
            }
        ]

        const result = convertBaileysSenderKey('120363041234567890@g.us', '5511999999999.0', states)

        assert.equal(result.groupId, '120363041234567890@g.us')
        assert.equal(result.sender.user, '5511999999999')
        assert.equal(result.sender.device, 0)
        assert.equal(result.sender.server, 's.whatsapp.net')

        // Latest state was state[1]
        assert.equal(result.keyId, 2)
        assert.equal(result.iteration, 5)
        assert.deepEqual(Array.from(result.chainKey), Array.from(CHAIN_SEED))
        assert.deepEqual(Array.from(result.signingPublicKey), Array.from(SIGN_PUB))
        assert.deepEqual(Array.from(result.signingPrivateKey!), Array.from(SIGN_PRIV))
        assert.equal(result.unusedMessageKeys?.length, 2)
        assert.equal(result.unusedMessageKeys[0].iteration, 1)
        assert.equal(result.unusedMessageKeys[1].iteration, 2)
    })

    it('accepts base64 strings for binary fields (multi-file path)', () => {
        const states: BaileysSenderKeyStateStructure[] = [
            {
                senderKeyId: 7,
                senderChainKey: {
                    iteration: 0,
                    seed: Buffer.from(CHAIN_SEED).toString('base64')
                },
                senderSigningKey: {
                    public: Buffer.from(SIGN_PUB).toString('base64'),
                    private: Buffer.from(SIGN_PRIV).toString('base64')
                },
                senderMessageKeys: []
            }
        ]
        const result = convertBaileysSenderKey('g@g.us', '5511.0', states)
        assert.deepEqual(Array.from(result.chainKey), Array.from(CHAIN_SEED))
        assert.deepEqual(Array.from(result.signingPublicKey), Array.from(SIGN_PUB))
    })

    it('omits signing private when undefined (received SKDM)', () => {
        const states: BaileysSenderKeyStateStructure[] = [
            {
                senderKeyId: 3,
                senderChainKey: { iteration: 0, seed: CHAIN_SEED },
                senderSigningKey: { public: SIGN_PUB },
                senderMessageKeys: []
            }
        ]
        const result = convertBaileysSenderKey('g@g.us', '5511.0', states)
        assert.equal(result.signingPrivateKey, undefined)
    })

    it('throws on empty state array', () => {
        assert.throws(() => convertBaileysSenderKey('g@g.us', '5511.0', []))
    })
})
