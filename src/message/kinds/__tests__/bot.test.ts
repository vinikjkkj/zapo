import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAddonAdditionalData } from '@message/crypto/addon-crypto'
import {
    attachBotMetadata,
    decryptBotChunk,
    deriveBotChunkKey,
    extractInvokedBotJid,
    genBotMsgSecret
} from '@message/kinds/bot'

test('bot message-secret derivation matches HKDF("Bot Message") and is deterministic', () => {
    const parent = new Uint8Array(32).fill(11)
    const left = genBotMsgSecret(parent)
    const right = genBotMsgSecret(parent)
    assert.equal(left.byteLength, 32)
    assert.deepEqual(left, right)
    const otherParent = new Uint8Array(32).fill(12)
    assert.notDeepEqual(left, genBotMsgSecret(otherParent))
    assert.throws(() => genBotMsgSecret(new Uint8Array(31)), /must be 32 bytes/)
})

test('bot chunk key derivation depends on salt id, target sender, and author', () => {
    const botMsgSecret = new Uint8Array(32).fill(33)
    const base = {
        botMsgSecret,
        saltId: 'CHUNK-1',
        targetSenderJid: '867051314767696@bot',
        authorJid: '551100000000@s.whatsapp.net'
    } as const
    const a = deriveBotChunkKey(base)
    const b = deriveBotChunkKey(base)
    assert.equal(a.byteLength, 32)
    assert.deepEqual(a, b)
    assert.notDeepEqual(a, deriveBotChunkKey({ ...base, saltId: 'CHUNK-2' }))
    assert.notDeepEqual(a, deriveBotChunkKey({ ...base, targetSenderJid: '1273596044787272@bot' }))
    assert.notDeepEqual(a, deriveBotChunkKey({ ...base, authorJid: '551199999999@s.whatsapp.net' }))
    assert.throws(() => deriveBotChunkKey({ ...base, saltId: '' }), /salt id/)
})

test('decryptBotChunk reverses an HKDF/AES-GCM round trip', async () => {
    const { aesGcmEncrypt } = await import('@crypto')
    const parent = new Uint8Array(32).fill(7)
    const saltId = 'CHUNK-1'
    const targetSenderJid = '867051314767696@bot'
    const authorJid = '551100000000@s.whatsapp.net'
    const botMsgSecret = genBotMsgSecret(parent)
    const key = deriveBotChunkKey({ botMsgSecret, saltId, targetSenderJid, authorJid })
    const iv = new Uint8Array(12).fill(2)
    const plaintext = new Uint8Array([1, 2, 3, 4, 5])
    const aad = buildAddonAdditionalData(saltId, authorJid)
    const ciphertext = aesGcmEncrypt(key, iv, plaintext, aad)

    const decrypted = decryptBotChunk({
        parentMessageSecret: parent,
        saltId,
        targetSenderJid,
        authorJid,
        encIv: iv,
        encPayload: ciphertext
    })
    assert.deepEqual(decrypted, plaintext)
})

test('attachBotMetadata sets MessageContextInfo.botMetadata fields', () => {
    const base = { conversation: 'hi' }
    const noop = attachBotMetadata(base, {})
    assert.equal(noop, base)

    const enriched = attachBotMetadata(base, {
        personaId: 'p-meta',
        invokerJid: '5511000000000@lid'
    })
    assert.equal(enriched.conversation, 'hi')
    assert.equal(enriched.messageContextInfo?.botMetadata?.personaId, 'p-meta')
    assert.equal(enriched.messageContextInfo?.botMetadata?.invokerJid, '5511000000000@lid')
})

test('extractInvokedBotJid finds the bot mention across text and media bodies', () => {
    const BOT = '867051314767696@bot'
    assert.equal(
        extractInvokedBotJid({
            botInvokeMessage: {
                message: {
                    extendedTextMessage: { text: '@x oi', contextInfo: { mentionedJid: [BOT] } }
                }
            }
        }),
        BOT
    )
    assert.equal(extractInvokedBotJid({ conversation: 'oi' }), null)
})
