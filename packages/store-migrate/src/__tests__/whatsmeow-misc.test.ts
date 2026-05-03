import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { convertWhatsmeowContact } from '../whatsmeow/contact'
import { convertWhatsmeowMessageSecret } from '../whatsmeow/message-secret'
import { convertWhatsmeowPrivacyToken } from '../whatsmeow/privacy-token'

describe('convertWhatsmeowContact', () => {
    it('prefers full_name over first_name and push_name', () => {
        const result = convertWhatsmeowContact(
            {
                their_jid: '5511999999999@s.whatsapp.net',
                first_name: 'Vini',
                full_name: 'Vinicius',
                push_name: 'V',
                business_name: null,
                redacted_phone: '+55 11 9****-9999'
            },
            { nowMs: 1_700_000_000_000 }
        )
        assert.equal(result.jid, '5511999999999@s.whatsapp.net')
        assert.equal(result.displayName, 'Vinicius')
        assert.equal(result.pushName, 'V')
        assert.equal(result.phoneNumber, '+55 11 9****-9999')
        assert.equal(result.lastUpdatedMs, 1_700_000_000_000)
    })

    it('returns undefined when no name columns are populated', () => {
        const result = convertWhatsmeowContact({ their_jid: 'x@s.whatsapp.net' })
        assert.equal(result.displayName, undefined)
        assert.equal(result.pushName, undefined)
    })
})

describe('convertWhatsmeowPrivacyToken', () => {
    it('passes seconds-precision timestamps through unchanged', () => {
        const token = new Uint8Array([1, 2, 3])
        const result = convertWhatsmeowPrivacyToken(
            {
                their_jid: '5511999999999@s.whatsapp.net',
                token,
                timestamp: 1_700_000_000n,
                sender_timestamp: 1_700_000_500n
            },
            { nowMs: 9_999 }
        )
        assert.equal(result.tcToken, token)
        assert.equal(result.tcTokenTimestamp, 1_700_000_000)
        assert.equal(result.tcTokenSenderTimestamp, 1_700_000_500)
        assert.equal(result.updatedAtMs, 9_999)
    })

    it('handles null sender_timestamp from sqlite', () => {
        const result = convertWhatsmeowPrivacyToken({
            their_jid: 'x',
            token: new Uint8Array(),
            timestamp: 0,
            sender_timestamp: null
        })
        assert.equal(result.tcTokenSenderTimestamp, undefined)
    })
})

describe('convertWhatsmeowMessageSecret', () => {
    it('flattens chat_jid + sender_jid into the WaMessageSecretEntry shape', () => {
        const key = new Uint8Array([0xab])
        const result = convertWhatsmeowMessageSecret({
            chat_jid: 'chat@g.us',
            sender_jid: 'sender@s.whatsapp.net',
            message_id: 'ABC',
            key
        })
        assert.equal(result.messageId, 'ABC')
        assert.equal(result.entry.secret, key)
        assert.equal(result.entry.senderJid, 'sender@s.whatsapp.net')
    })
})
