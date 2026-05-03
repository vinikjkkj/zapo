import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    encodeSenderKeyRecord,
    encodeSignalSessionRecord,
    type SenderKeyRecord,
    type SignalSessionRecord
} from 'zapo-js/signal'

import { convertWhatsmeowSenderKey } from '../whatsmeow/sender-key'
import { convertWhatsmeowSession } from '../whatsmeow/session'

function pubKey33(seed: number): Uint8Array {
    const out = new Uint8Array(33)
    out[0] = 0x05
    out.fill(seed, 1)
    return out
}

function buildSampleSession(): SignalSessionRecord {
    return {
        local: { regId: 100, pubKey: pubKey33(0xaa) },
        remote: { regId: 200, pubKey: pubKey33(0xbb) },
        rootKey: new Uint8Array(32).fill(1),
        sendChain: {
            ratchetKey: { pubKey: pubKey33(0xcc), privKey: new Uint8Array(32).fill(2) },
            nextMsgIndex: 0,
            chainKey: new Uint8Array(32).fill(3)
        },
        recvChains: [],
        initialExchangeInfo: null,
        prevSendChainHighestIndex: 0,
        aliceBaseKey: null,
        prevSessions: []
    }
}

function buildSampleSenderKey(groupId: string): SenderKeyRecord {
    return {
        groupId,
        sender: { user: '5511999999999', server: 's.whatsapp.net', device: 0 },
        keyId: 5,
        iteration: 12,
        chainKey: new Uint8Array(32).fill(4),
        signingPublicKey: pubKey33(0xdd),
        signingPrivateKey: new Uint8Array(32).fill(5)
    }
}

// whatsmeow's go libsignal `serialize.NewProtoBufSerializer()` emits the same
// `RecordStructure` / `SenderKeyRecordStructure` wire bytes that zapo encodes
// natively, so round-tripping through zapo's encoder is a faithful proxy.
describe('convertWhatsmeowSession (proto bytes)', () => {
    it('parses colon-style address and decodes the proto record', () => {
        const bytes = encodeSignalSessionRecord(buildSampleSession())
        const result = convertWhatsmeowSession({ their_id: '5511999999999:3', session: bytes })
        assert.equal(result.address.user, '5511999999999')
        assert.equal(result.address.device, 3)
        assert.equal(result.record.remote.regId, 200)
    })

    it('throws on garbage bytes', () => {
        assert.throws(() =>
            convertWhatsmeowSession({
                their_id: '5511.0',
                session: new Uint8Array([0xff, 0xff, 0xff])
            })
        )
    })
})

describe('convertWhatsmeowSenderKey (proto bytes)', () => {
    it('decodes whatsmeow row using colon-style sender id', () => {
        const original = buildSampleSenderKey('group@g.us')
        const bytes = encodeSenderKeyRecord(original)
        const result = convertWhatsmeowSenderKey({
            chat_id: 'group@g.us',
            sender_id: '5511999999999:0',
            sender_key: bytes
        })
        assert.equal(result.iteration, 12)
        assert.equal(result.sender.device, 0)
        assert.deepEqual(Array.from(result.chainKey), Array.from(original.chainKey))
    })
})
