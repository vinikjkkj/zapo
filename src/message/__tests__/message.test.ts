import assert from 'node:assert/strict'
import test from 'node:test'

import type {
    WaIncomingMessageEvent,
    WaIncomingNewsletterMessageUpdateEvent,
    WaIncomingUnhandledStanzaEvent
} from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import {
    buildAddonAdditionalData,
    decryptAddonPayload,
    encryptAddonPayload
} from '@message/crypto/addon-crypto'
import { computeDeviceKeyHash, injectDeviceListMetadata } from '@message/crypto/icdc'
import { computePhashV2 } from '@message/crypto/phash'
import { buildReportingTokenArtifacts } from '@message/crypto/reporting-token'
import {
    assertMessageSecret,
    createUseCaseSecret,
    ensureMessageSecret,
    WA_USE_CASE_SECRET_MODIFICATION_TYPES
} from '@message/crypto/use-case-secret'
import {
    isSendAddonCryptoMessage,
    isSendEventMessage,
    isSendEventResponseMessage,
    isSendKeepMessage,
    isSendMediaMessage,
    isSendPinMessage,
    isSendPollMessage,
    isSendPollVoteMessage,
    isSendReactionMessage,
    isSendRevokeMessage,
    needsSecretPersistence,
    resolveButtonAddonKind,
    resolveEditAttr,
    resolveEncMediaType,
    resolveMessageTypeAttr,
    resolveMetaAttrs,
    supportsViewOnce,
    wrapAsViewOnce
} from '@message/encode/content'
import { unwrapDeviceSentMessage, wrapDeviceSentMessage } from '@message/encode/device-sent'
import { unpadPkcs7, writeRandomPadMax16 } from '@message/encode/padding'
import {
    attachBotMetadata,
    decryptBotChunk,
    deriveBotChunkKey,
    extractInvokedBotJid,
    genBotMsgSecret
} from '@message/kinds/bot'
import {
    processIncomingNewsletterMessage,
    processNewsletterLiveUpdates
} from '@message/kinds/newsletter'
import {
    describeAckNode,
    isAckOrReceiptNode,
    isNegativeAckNode,
    isRetryableNegativeAck
} from '@message/primitives/ack'
import { proto } from '@proto'
import type { BinaryNode } from '@transport/types'

test('ack helpers classify receipt and retryability correctly', () => {
    const ackNode = { tag: 'ack', attrs: { id: '1', type: 'error', code: '500' } }
    const receiptNode = { tag: 'receipt', attrs: { id: '2' } }

    assert.equal(isAckOrReceiptNode(ackNode), true)
    assert.equal(isAckOrReceiptNode(receiptNode), true)
    assert.equal(isNegativeAckNode(ackNode), true)
    assert.equal(isRetryableNegativeAck(ackNode), true)
    assert.match(describeAckNode(ackNode), /id=1/)
})

test('content helpers detect media payload and resolve message type', () => {
    assert.equal(
        isSendMediaMessage({ type: 'image', media: new Uint8Array([1]), mimetype: 'x' }),
        true
    )
    assert.equal(isSendMediaMessage({}), false)

    assert.equal(
        isSendReactionMessage({
            type: 'reaction',
            emoji: '👍',
            target: { stanzaId: 'A', fromMe: false }
        }),
        true
    )
    assert.equal(isSendReactionMessage({ type: 'reaction', emoji: '👍' }), false)
    assert.equal(isSendReactionMessage({ type: 'text', text: 'hi' }), false)

    assert.equal(isSendRevokeMessage({ type: 'revoke', stanzaId: 'A' }), true)
    assert.equal(isSendRevokeMessage({ type: 'revoke' }), false)
    assert.equal(isSendRevokeMessage({ type: 'text', text: 'hi' }), false)

    const target = { stanzaId: 'A', fromMe: true }
    assert.equal(isSendPinMessage({ type: 'pin', target }), true)
    assert.equal(isSendPinMessage({ type: 'unpin', target }), true)
    assert.equal(isSendPinMessage({ type: 'pin' }), false)
    assert.equal(isSendKeepMessage({ type: 'keep', target }), true)
    assert.equal(isSendKeepMessage({ type: 'unkeep', target }), true)
    assert.equal(isSendKeepMessage({ type: 'pin', target }), false)

    assert.equal(isSendPollMessage({ type: 'poll', name: 'Q', options: ['A'] }), true)
    assert.equal(isSendPollMessage({ type: 'poll', name: 'Q' }), false)

    assert.equal(
        isSendPollVoteMessage({
            type: 'poll-vote',
            poll: { stanzaId: 'A', fromMe: false, authorJid: 'x', messageSecret: new Uint8Array() },
            selectedOptionNames: ['x']
        }),
        true
    )
    assert.equal(isSendPollVoteMessage({ type: 'poll-vote' }), false)

    assert.equal(isSendEventMessage({ type: 'event', name: 'E', startTime: 0 }), true)
    assert.equal(isSendEventMessage({ type: 'event', name: 'E' }), false)

    assert.equal(
        isSendEventResponseMessage({
            type: 'event-response',
            event: {
                stanzaId: 'A',
                fromMe: false,
                authorJid: 'x',
                messageSecret: new Uint8Array()
            },
            response: 'going'
        }),
        true
    )
    assert.equal(isSendEventResponseMessage({ type: 'event-response' }), false)

    assert.equal(
        isSendAddonCryptoMessage({
            type: 'poll-vote',
            poll: { stanzaId: 'A', fromMe: false, authorJid: 'x', messageSecret: new Uint8Array() },
            selectedOptionNames: ['x']
        }),
        true
    )
    assert.equal(isSendAddonCryptoMessage({ type: 'reaction', emoji: '🔥', target }), false)

    assert.equal(resolveMessageTypeAttr({ reactionMessage: {} }), 'reaction')
    assert.equal(resolveMessageTypeAttr({ encReactionMessage: {} }), 'reaction')
    assert.equal(resolveMessageTypeAttr({ imageMessage: {} }), 'media')
    assert.equal(resolveMessageTypeAttr({ videoMessage: {} }), 'media')
    assert.equal(resolveMessageTypeAttr({ audioMessage: {} }), 'media')
    assert.equal(resolveMessageTypeAttr({ documentMessage: {} }), 'media')
    assert.equal(resolveMessageTypeAttr({ stickerMessage: {} }), 'media')
    assert.equal(resolveMessageTypeAttr({ conversation: 'text' }), 'text')
    assert.equal(resolveMessageTypeAttr({ protocolMessage: {} }), 'text')
    assert.equal(resolveMessageTypeAttr({ keepInChatMessage: {} }), 'text')
    assert.equal(resolveMessageTypeAttr({ pinInChatMessage: {} }), 'text')
    assert.equal(resolveMessageTypeAttr({ pollCreationMessage: {} }), 'poll')
    assert.equal(resolveMessageTypeAttr({ pollCreationMessageV2: {} }), 'poll')
    assert.equal(resolveMessageTypeAttr({ pollUpdateMessage: {} }), 'poll')
    assert.equal(resolveMessageTypeAttr({ eventMessage: {} }), 'event')
    assert.equal(resolveMessageTypeAttr({ encEventResponseMessage: {} }), 'event')
    assert.equal(
        resolveMessageTypeAttr({ extendedTextMessage: { matchedText: 'https://example.com' } }),
        'media'
    )
    assert.equal(resolveMessageTypeAttr({ extendedTextMessage: { text: 'hello' } }), 'text')
    assert.equal(
        resolveMessageTypeAttr({ ephemeralMessage: { message: { imageMessage: {} } } }),
        'media'
    )
    assert.equal(
        resolveMessageTypeAttr({ deviceSentMessage: { message: { reactionMessage: {} } } }),
        'reaction'
    )
    assert.equal(resolveMessageTypeAttr({ contactMessage: {} }), 'media')
    assert.equal(resolveMessageTypeAttr({ locationMessage: {} }), 'media')
    assert.equal(resolveMessageTypeAttr({ messageHistoryBundle: {} }), 'media')
    assert.equal(resolveMessageTypeAttr({ messageHistoryNotice: {} }), 'text')
    assert.equal(resolveMessageTypeAttr({ pollResultSnapshotMessage: {} }), 'text')
    assert.equal(resolveMessageTypeAttr({ pollResultSnapshotMessageV3: {} }), 'text')
    assert.equal(
        resolveMessageTypeAttr({
            ephemeralMessage: { message: { viewOnceMessage: { message: { imageMessage: {} } } } }
        }),
        'media'
    )
})

test('view-once helpers wrap supported media and reject incompatible payloads', () => {
    assert.equal(supportsViewOnce({ imageMessage: {} }), true)
    assert.equal(supportsViewOnce({ videoMessage: {} }), true)
    assert.equal(supportsViewOnce({ audioMessage: {} }), true)
    assert.equal(supportsViewOnce({ ptvMessage: {} }), true)
    assert.equal(supportsViewOnce({ conversation: 'hi' }), false)
    assert.equal(supportsViewOnce({ ephemeralMessage: { message: { videoMessage: {} } } }), false)

    const wrapped = wrapAsViewOnce({ imageMessage: { url: 'x' } })
    assert.equal(wrapped.imageMessage?.url, 'x')
    assert.equal(wrapped.imageMessage?.viewOnce, true)

    const wrappedVideo = wrapAsViewOnce({ videoMessage: { url: 'v' } })
    assert.equal(wrappedVideo.videoMessage?.viewOnce, true)

    const wrappedAudio = wrapAsViewOnce({ audioMessage: { url: 'a' } })
    assert.equal(wrappedAudio.audioMessage?.viewOnce, true)

    const wrappedPtv = wrapAsViewOnce({ ptvMessage: { url: 'p' } })
    assert.equal(wrappedPtv.ptvMessage?.viewOnce, true)

    const legacy = { viewOnceMessageV2: { message: { imageMessage: { url: 'x' } } } }
    assert.equal(wrapAsViewOnce(legacy), legacy)

    const passthrough = wrapAsViewOnce({ conversation: 'hi' })
    assert.deepEqual(passthrough, { conversation: 'hi' })
    const wrappedRaw = { ephemeralMessage: { message: { imageMessage: {} } } }
    assert.equal(wrapAsViewOnce(wrappedRaw), wrappedRaw)
})

test('resolveButtonAddonKind classifies list/interactive incl. documentWithCaption wrap', () => {
    assert.equal(resolveButtonAddonKind({ listMessage: {} }), 'list')
    assert.equal(resolveButtonAddonKind({ buttonsMessage: {} }), 'interactive')
    assert.equal(
        resolveButtonAddonKind({ interactiveMessage: { nativeFlowMessage: {} } }),
        'interactive'
    )
    assert.equal(resolveButtonAddonKind({ interactiveMessage: {} }), null)
    assert.equal(resolveButtonAddonKind({ conversation: 'hi' }), null)
    assert.equal(
        resolveButtonAddonKind({ documentWithCaptionMessage: { message: { listMessage: {} } } }),
        'list'
    )
    assert.equal(
        resolveButtonAddonKind({
            documentWithCaptionMessage: {
                message: { interactiveMessage: { nativeFlowMessage: {} } }
            }
        }),
        'interactive'
    )
    assert.equal(
        resolveButtonAddonKind({
            ephemeralMessage: { message: { listMessage: {} } }
        }),
        'list'
    )
})

test('content helpers unwrap deeply nested wrappers for edit and media attrs', () => {
    assert.equal(
        resolveEditAttr({
            ephemeralMessage: {
                message: {
                    viewOnceMessage: {
                        message: {
                            protocolMessage: { type: 14 }
                        }
                    }
                }
            }
        }),
        '1'
    )
    assert.equal(
        resolveEncMediaType({
            deviceSentMessage: {
                message: {
                    ephemeralMessage: {
                        message: {
                            videoMessage: { gifPlayback: true }
                        }
                    }
                }
            }
        }),
        'gif'
    )
})

test('resolveEditAttr maps protobuf to correct edit attribute values', () => {
    assert.equal(resolveEditAttr({ conversation: 'hello' }), null)
    assert.equal(resolveEditAttr({ protocolMessage: { type: 0 } }), '7')
    assert.equal(resolveEditAttr({ protocolMessage: { type: 0 } }, 'admin_revoke'), '8')
    assert.equal(resolveEditAttr({ protocolMessage: { type: 14 } }), '1')
    assert.equal(resolveEditAttr({ reactionMessage: { text: '' } }), '7')
    assert.equal(resolveEditAttr({ reactionMessage: { text: '\u{1F44D}' } }), null)
    assert.equal(resolveEditAttr({ pinInChatMessage: {} }), '2')
    assert.equal(
        resolveEditAttr({
            keepInChatMessage: { key: { fromMe: true }, keepType: 2 }
        }),
        '7'
    )
    assert.equal(
        resolveEditAttr({ keepInChatMessage: { key: { fromMe: true }, keepType: 1 } }),
        null
    )
})

test('resolveEncMediaType maps protobuf to correct media type string', () => {
    assert.equal(resolveEncMediaType({ conversation: 'hello' }), null)
    assert.equal(resolveEncMediaType({ imageMessage: {} }), 'image')
    assert.equal(resolveEncMediaType({ videoMessage: {} }), 'video')
    assert.equal(resolveEncMediaType({ videoMessage: { gifPlayback: true } }), 'gif')
    assert.equal(resolveEncMediaType({ audioMessage: {} }), 'audio')
    assert.equal(resolveEncMediaType({ audioMessage: { ptt: true } }), 'ptt')
    assert.equal(resolveEncMediaType({ documentMessage: {} }), 'document')
    assert.equal(resolveEncMediaType({ stickerMessage: {} }), 'sticker')
    assert.equal(resolveEncMediaType({ contactMessage: {} }), 'vcard')
    assert.equal(resolveEncMediaType({ contactsArrayMessage: {} }), 'contact_array')
    assert.equal(resolveEncMediaType({ locationMessage: {} }), 'location')
    assert.equal(resolveEncMediaType({ locationMessage: { isLive: true } }), 'livelocation')
    assert.equal(resolveEncMediaType({ groupInviteMessage: {} }), 'url')
    assert.equal(
        resolveEncMediaType({ extendedTextMessage: { matchedText: 'https://example.com' } }),
        'url'
    )
    assert.equal(
        resolveEncMediaType({ ephemeralMessage: { message: { imageMessage: {} } } }),
        'image'
    )
})

test('resolveMetaAttrs returns attrs for polls events and view-once', () => {
    assert.equal(resolveMetaAttrs({ conversation: 'hello' }), null)
    assert.deepEqual(resolveMetaAttrs({ pollCreationMessage: {} }), { polltype: 'creation' })
    assert.deepEqual(resolveMetaAttrs({ pollUpdateMessage: {} }), { polltype: 'vote' })
    assert.equal(resolveMetaAttrs({ pollResultSnapshotMessage: {} }), null)
    assert.equal(resolveMetaAttrs({ pollResultSnapshotMessageV3: {} }), null)
    assert.deepEqual(resolveMetaAttrs({ eventMessage: {} }), { event_type: 'creation' })
    assert.deepEqual(resolveMetaAttrs({ encEventResponseMessage: {} }), { event_type: 'response' })
    assert.deepEqual(resolveMetaAttrs({ viewOnceMessage: { message: {} } }), { view_once: 'true' })
    assert.deepEqual(resolveMetaAttrs({ viewOnceMessageV2: { message: {} } }), {
        view_once: 'true'
    })
})

test('device-sent wrapping preserves context and unwrap restores nested payload', () => {
    const wrapped = wrapDeviceSentMessage(
        {
            conversation: 'hello',
            messageContextInfo: {}
        },
        '5511@s.whatsapp.net'
    )

    assert.ok(wrapped.deviceSentMessage)
    const unwrapped = unwrapDeviceSentMessage(wrapped)
    assert.ok(unwrapped)
    assert.equal(unwrapped?.conversation, 'hello')
    assert.ok(unwrapped?.messageContextInfo)

    assert.equal(unwrapDeviceSentMessage({ conversation: 'x' }), null)
})

test('padding and phash generation cover success and edge paths', async () => {
    const input = new Uint8Array([1, 2, 3])
    const padded = await writeRandomPadMax16(input)
    assert.ok(padded.length > input.length)

    const unpadded = unpadPkcs7(new Uint8Array([10, 11, 2, 2]))
    assert.deepEqual(unpadded, new Uint8Array([10, 11]))
    assert.throws(() => unpadPkcs7(new Uint8Array([])), /empty bytes/)

    const hash = computePhashV2(['5511:0@c.us', '5511:2@s.whatsapp.net'])
    assert.match(hash, /^2:/)
})

test('reporting token helpers cover secret injection and deterministic token generation', async () => {
    const prepared = await ensureMessageSecret({
        conversation: 'hello'
    })
    assert.ok(prepared.messageContextInfo?.messageSecret)
    assert.equal(prepared.messageContextInfo?.messageSecret?.byteLength, 32)

    const baseMessage = {
        conversation: 'hello',
        messageContextInfo: {
            messageSecret: new Uint8Array(32).fill(7)
        }
    }
    const first = await buildReportingTokenArtifacts({
        message: baseMessage,
        stanzaId: 'msg-1',
        senderUserJid: '551100000000@s.whatsapp.net',
        remoteJid: '551188888888@s.whatsapp.net'
    })
    const second = await buildReportingTokenArtifacts({
        message: baseMessage,
        stanzaId: 'msg-1',
        senderUserJid: '551100000000@s.whatsapp.net',
        remoteJid: '551188888888@s.whatsapp.net'
    })
    assert.ok(first)
    assert.ok(second)
    assert.equal(first?.node.tag, 'reporting')
    const firstTokenNode = Array.isArray(first?.node.content) ? first.node.content[0] : null
    const secondTokenNode = Array.isArray(second?.node.content) ? second.node.content[0] : null
    assert.equal(firstTokenNode?.tag, 'reporting_token')
    assert.equal(firstTokenNode?.attrs.v, '2')
    assert.ok(firstTokenNode?.content instanceof Uint8Array)
    assert.equal((firstTokenNode?.content as Uint8Array).byteLength, 16)
    assert.deepEqual(firstTokenNode?.content, secondTokenNode?.content)

    const changedResult = await buildReportingTokenArtifacts({
        message: baseMessage,
        stanzaId: 'msg-2',
        senderUserJid: '551100000000@s.whatsapp.net',
        remoteJid: '551188888888@s.whatsapp.net'
    })
    const changedTokenNode = Array.isArray(changedResult?.node.content)
        ? changedResult.node.content[0]
        : null
    assert.notDeepEqual(firstTokenNode?.content, changedTokenNode?.content)

    const incompatible = await buildReportingTokenArtifacts({
        message: {
            reactionMessage: {},
            messageContextInfo: {
                messageSecret: new Uint8Array(32).fill(1)
            }
        },
        stanzaId: 'msg-3',
        senderUserJid: '551100000000@s.whatsapp.net',
        remoteJid: '551188888888@s.whatsapp.net'
    })
    assert.equal(incompatible, null)
})

test('use-case secret derivation is deterministic and use-case specific', async () => {
    const input = {
        messageSecret: new Uint8Array(32).fill(5),
        stanzaId: 'msg-1',
        parentMsgOriginalSender: '551100000000@s.whatsapp.net',
        modificationSender: '551188888888@s.whatsapp.net'
    } as const
    const reportLeft = await createUseCaseSecret({
        ...input,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.REPORT_TOKEN
    })
    const reportRight = await createUseCaseSecret({
        ...input,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.REPORT_TOKEN
    })
    const pollVote = await createUseCaseSecret({
        ...input,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE
    })
    assert.equal(reportLeft.byteLength, 32)
    assert.deepEqual(reportLeft, reportRight)
    assert.notDeepEqual(reportLeft, pollVote)
})

test('message secret validator enforces 32-byte invariant', () => {
    assert.equal(assertMessageSecret(new Uint8Array(32).fill(1)).byteLength, 32)
    assert.throws(
        () => assertMessageSecret(new Uint8Array(31).fill(1)),
        /message secret must be 32 bytes/
    )
})

test('addon crypto helpers encrypt/decrypt payloads and validate aad', async () => {
    const context = {
        messageSecret: new Uint8Array(32).fill(9),
        stanzaId: 'msg-1',
        parentMsgOriginalSender: '551100000000@s.whatsapp.net',
        modificationSender: '551188888888@s.whatsapp.net',
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE
    } as const
    const plaintext = new Uint8Array([1, 2, 3, 4, 5])
    const iv = new Uint8Array(12).fill(7)
    const ciphertext = await encryptAddonPayload({
        ...context,
        payload: plaintext,
        iv
    })
    const decrypted = await decryptAddonPayload({
        ...context,
        ciphertext,
        iv
    })
    assert.deepEqual(decrypted, plaintext)

    await assert.rejects(
        () =>
            decryptAddonPayload({
                ...context,
                ciphertext,
                iv,
                additionalData: new Uint8Array([1, 2, 3])
            }),
        /The operation failed|decrypt|unable to authenticate/i
    )

    await assert.rejects(
        () =>
            encryptAddonPayload({
                ...context,
                payload: plaintext,
                iv: new Uint8Array(8)
            }),
        /addon iv must be 12 bytes/
    )
})

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

    assert.throws(
        () =>
            decryptBotChunk({
                parentMessageSecret: parent,
                saltId: 'OTHER',
                targetSenderJid,
                authorJid,
                encIv: iv,
                encPayload: ciphertext
            }),
        /authenticate|auth|tag|decrypt/i
    )
})

test('needsSecretPersistence flags polls, events, and bot prompts (with botMetadata)', () => {
    assert.equal(needsSecretPersistence({ conversation: 'plain text' }), false)
    assert.equal(needsSecretPersistence({ pollCreationMessage: {} }), true)
    assert.equal(needsSecretPersistence({ pollCreationMessageV3: {} }), true)
    assert.equal(needsSecretPersistence({ eventMessage: {} }), true)

    // bot prompt: presence of botMetadata signals we'll need the secret to
    // decrypt the bot's streaming reply later
    assert.equal(
        needsSecretPersistence({
            conversation: 'oi meta',
            messageContextInfo: { botMetadata: { invokerJid: '5511@lid' } }
        }),
        true
    )

    // botMetadata survives unwrap of deviceSentMessage
    assert.equal(
        needsSecretPersistence({
            deviceSentMessage: {
                destinationJid: 'x@bot',
                message: {
                    conversation: 'oi',
                    messageContextInfo: { botMetadata: { personaId: 'p' } }
                }
            }
        }),
        true
    )

    // botInvokeMessage wraps the prompt body but botMetadata stays at the
    // top-level messageContextInfo; checker must look at both levels
    assert.equal(
        needsSecretPersistence({
            messageContextInfo: { botMetadata: { invokerJid: '5511@lid' } },
            botInvokeMessage: {
                message: {
                    extendedTextMessage: { text: '@bot oi' }
                }
            }
        }),
        true
    )
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

    const withCaps = attachBotMetadata(base, { capabilities: [1, 2, 3] })
    assert.deepEqual(
        withCaps.messageContextInfo?.botMetadata?.capabilityMetadata?.capabilities,
        [1, 2, 3]
    )

    const preserved = attachBotMetadata(
        {
            conversation: 'hi',
            messageContextInfo: { messageSecret: new Uint8Array(32).fill(1) }
        },
        { personaId: 'x' }
    )
    assert.deepEqual(preserved.messageContextInfo?.messageSecret, new Uint8Array(32).fill(1))
    assert.equal(preserved.messageContextInfo?.botMetadata?.personaId, 'x')
})

test('extractInvokedBotJid finds the bot mention across text and media bodies', () => {
    const BOT = '867051314767696@bot'
    // text body
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
    // image caption mention
    assert.equal(
        extractInvokedBotJid({
            botInvokeMessage: {
                message: {
                    imageMessage: {
                        caption: '@x olha',
                        contextInfo: { mentionedJid: ['5511@s.whatsapp.net', BOT] }
                    }
                }
            }
        }),
        BOT
    )
    // video and document carriers
    assert.equal(
        extractInvokedBotJid({
            botInvokeMessage: {
                message: { videoMessage: { contextInfo: { mentionedJid: [BOT] } } }
            }
        }),
        BOT
    )
    assert.equal(
        extractInvokedBotJid({
            botInvokeMessage: {
                message: { documentMessage: { contextInfo: { mentionedJid: [BOT] } } }
            }
        }),
        BOT
    )
    // no bot in mentions
    assert.equal(
        extractInvokedBotJid({
            botInvokeMessage: {
                message: {
                    extendedTextMessage: { contextInfo: { mentionedJid: ['5511@s.whatsapp.net'] } }
                }
            }
        }),
        null
    )
    // not a bot invoke envelope at all
    assert.equal(extractInvokedBotJid({ conversation: 'oi' }), null)
})

test('computeDeviceKeyHash produces deterministic 8-byte hash from identity keys', async () => {
    const key1 = new Uint8Array(33).fill(1)
    key1[0] = 5
    const key2 = new Uint8Array(33).fill(2)
    key2[0] = 5

    const hash1 = computeDeviceKeyHash([key1, key2])
    const hash2 = computeDeviceKeyHash([key1, key2])
    assert.equal(hash1.byteLength, 8)
    assert.deepEqual(hash1, hash2)

    const hashDiff = computeDeviceKeyHash([key2, key1])
    assert.notDeepEqual(hash1, hashDiff)

    const emptyHash = computeDeviceKeyHash([])
    assert.equal(emptyHash.byteLength, 8)
    assert.deepEqual(emptyHash, new Uint8Array(8))
})

test('injectDeviceListMetadata sets sender and recipient fields', () => {
    const msg = { conversation: 'hi', messageContextInfo: { messageSecret: new Uint8Array(32) } }
    const sender = { keyHash: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), timestamp: 1000 }
    const recipient = {
        keyHash: new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16]),
        timestamp: undefined
    }

    const result = injectDeviceListMetadata(msg, sender, recipient)
    assert.ok(result.messageContextInfo?.deviceListMetadata)
    assert.deepEqual(result.messageContextInfo?.deviceListMetadata?.senderKeyHash, sender.keyHash)
    assert.equal(result.messageContextInfo?.deviceListMetadata?.senderTimestamp, 1000)
    assert.deepEqual(
        result.messageContextInfo?.deviceListMetadata?.recipientKeyHash,
        recipient.keyHash
    )
    assert.equal(result.messageContextInfo?.deviceListMetadata?.recipientTimestamp, undefined)
    assert.equal(result.messageContextInfo?.deviceListMetadataVersion, 2)
    assert.deepEqual(result.messageContextInfo?.messageSecret, new Uint8Array(32))

    const unchanged = injectDeviceListMetadata(msg, null, null)
    assert.equal(unchanged, msg)
})

const NEWSLETTER_LOGGER = createNoopLogger()

test('processIncomingNewsletterMessage decodes plaintext message and emits event', () => {
    const plaintextBytes = proto.Message.encode({ conversation: 'hello channel' }).finish()
    const node = {
        tag: 'message',
        attrs: {
            id: 'STANZA1',
            from: '120363025343298869@newsletter',
            type: 'text',
            t: '1700000000',
            server_id: '12345',
            is_sender: 'true'
        },
        content: [
            {
                tag: 'plaintext',
                attrs: {},
                content: plaintextBytes
            }
        ]
    }

    let emitted: WaIncomingMessageEvent | null = null
    let unhandled: WaIncomingUnhandledStanzaEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitIncomingMessage: (event) => {
            emitted = event
        },
        emitUnhandledStanza: (event) => {
            unhandled = event
        }
    })

    assert.equal(unhandled, null)
    assert.ok(emitted)
    const event = emitted as unknown as WaIncomingMessageEvent
    assert.equal(event.chatJid, '120363025343298869@newsletter')
    assert.equal(event.senderJid, '120363025343298869@newsletter')
    assert.equal(event.encryptionType, 'plaintext')
    assert.equal(event.isNewsletterChat, true)
    assert.equal(event.isGroupChat, false)
    assert.equal(event.isBroadcastChat, false)
    assert.equal(event.timestampSeconds, 1700000000)
    assert.equal(event.serverId, 12345)
    assert.equal(event.isSender, true)
    assert.equal(event.message?.conversation, 'hello channel')
})

test('processIncomingNewsletterMessage emits unhandled when plaintext is missing', () => {
    const node = {
        tag: 'message',
        attrs: {
            id: 'STANZA2',
            from: '120363025343298869@newsletter',
            type: 'text'
        },
        content: []
    }

    let emitted = 0
    let unhandled: WaIncomingUnhandledStanzaEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitIncomingMessage: () => {
            emitted += 1
        },
        emitUnhandledStanza: (event) => {
            unhandled = event
        }
    })

    assert.equal(emitted, 0)
    assert.ok(unhandled)
    assert.equal(
        (unhandled as unknown as WaIncomingUnhandledStanzaEvent).reason,
        'newsletter.missing_plaintext'
    )
})

test('processIncomingNewsletterMessage emits reaction update with parent server_id', () => {
    const node = {
        tag: 'message',
        attrs: {
            id: 'REACT1',
            from: '120363025343298869@newsletter',
            type: 'reaction',
            server_id: '42',
            t: '1700000000'
        },
        content: [
            {
                tag: 'reaction',
                attrs: { code: '1f44d' }
            }
        ]
    }

    let updateEvent: WaIncomingNewsletterMessageUpdateEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            updateEvent = event
        }
    })

    assert.ok(updateEvent)
    const event = updateEvent as unknown as WaIncomingNewsletterMessageUpdateEvent
    assert.equal(event.parentMessageServerId, 42)
    assert.equal(event.timestampSeconds, 1700000000)
    assert.equal(event.update.kind, 'reaction')
    if (event.update.kind === 'reaction') {
        assert.equal(event.update.isSender, false)
        assert.equal(event.update.revoked, false)
        assert.equal(event.update.reactions.length, 1)
        assert.equal(event.update.reactions[0].code, '1f44d')
        assert.equal(event.update.reactions[0].count, undefined)
    }
})

test('processIncomingNewsletterMessage emits reaction aggregate via <reactions> envelope', () => {
    const node: BinaryNode = {
        tag: 'message',
        attrs: { id: 'REAGG', from: '120363025343298869@newsletter', server_id: '42' },
        content: [
            {
                tag: 'reactions',
                attrs: {},
                content: [
                    { tag: 'reaction', attrs: { code: '🔥', count: '3' } },
                    { tag: 'reaction', attrs: { code: '👍', count: '1' } }
                ]
            }
        ]
    }

    let updateEvent: WaIncomingNewsletterMessageUpdateEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            updateEvent = event
        }
    })

    assert.ok(updateEvent)
    const event = updateEvent as unknown as WaIncomingNewsletterMessageUpdateEvent
    assert.equal(event.update.kind, 'reaction')
    if (event.update.kind === 'reaction') {
        assert.equal(event.update.isSender, false)
        assert.equal(event.update.revoked, false)
        assert.equal(event.update.reactions.length, 2)
        assert.equal(event.update.reactions[0].code, '🔥')
        assert.equal(event.update.reactions[0].count, 3)
        assert.equal(event.update.reactions[1].code, '👍')
        assert.equal(event.update.reactions[1].count, 1)
    }
})

test('processIncomingNewsletterMessage omits code when reaction revoke has no code attr', () => {
    const node = {
        tag: 'message',
        attrs: {
            id: 'REACT_NO_CODE',
            from: '120363025343298869@newsletter',
            type: 'reaction',
            edit: '7',
            server_id: '42'
        },
        content: [{ tag: 'reaction', attrs: {} }]
    }

    let updateEvent: WaIncomingNewsletterMessageUpdateEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            updateEvent = event
        }
    })

    assert.ok(updateEvent)
    const event = updateEvent as unknown as WaIncomingNewsletterMessageUpdateEvent
    if (event.update.kind === 'reaction') {
        assert.equal(event.update.revoked, true)
        assert.equal(event.update.reactions.length, 1)
        assert.equal(event.update.reactions[0].code, undefined)
    }
})

test('processIncomingNewsletterMessage rejects poll_vote with empty votes envelope', () => {
    const node: BinaryNode = {
        tag: 'message',
        attrs: { id: 'POLL_EMPTY', from: '120363025343298869@newsletter', type: 'poll' },
        content: [{ tag: 'votes', attrs: {}, content: [] }]
    }

    let updateEvent: WaIncomingNewsletterMessageUpdateEvent | null = null
    let unhandled: WaIncomingUnhandledStanzaEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            updateEvent = event
        },
        emitUnhandledStanza: (event) => {
            unhandled = event
        }
    })

    assert.equal(updateEvent, null)
    assert.ok(unhandled)
    assert.equal(
        (unhandled as unknown as WaIncomingUnhandledStanzaEvent).reason,
        'newsletter.invalid_votes'
    )
})

test('processIncomingNewsletterMessage preserves counters with zero values', () => {
    const node: BinaryNode = {
        tag: 'message',
        attrs: { id: 'CTR_ZERO', from: '120363025343298869@newsletter', server_id: '42' },
        content: [{ tag: 'views_count', attrs: { count: '0' } }]
    }

    const emitted: WaIncomingNewsletterMessageUpdateEvent[] = []
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            emitted.push(event)
        }
    })

    assert.equal(emitted.length, 1)
    if (emitted[0].update.kind === 'counters') {
        assert.equal(emitted[0].update.views, 0)
        assert.equal(emitted[0].update.forwards, undefined)
    }
})

test('processIncomingNewsletterMessage skips counters when count attr is invalid', () => {
    const node: BinaryNode = {
        tag: 'message',
        attrs: {
            id: 'CTR_BAD',
            from: '120363025343298869@newsletter',
            server_id: '42',
            type: 'text'
        },
        content: [
            { tag: 'views_count', attrs: { count: 'abc' } },
            {
                tag: 'plaintext',
                attrs: {},
                content: proto.Message.encode({ conversation: 'x' }).finish()
            }
        ]
    }

    const emitted: WaIncomingNewsletterMessageUpdateEvent[] = []
    let incoming = 0
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            emitted.push(event)
        },
        emitIncomingMessage: () => {
            incoming += 1
        }
    })

    assert.equal(emitted.length, 0)
    assert.equal(incoming, 1)
})

test('processIncomingNewsletterMessage emits reaction revoke via type=reaction_revoke', () => {
    const node = {
        tag: 'message',
        attrs: {
            id: 'REACT2',
            from: '120363025343298869@newsletter',
            type: 'reaction_revoke',
            server_id: '42'
        },
        content: [
            {
                tag: 'reaction',
                attrs: { code: '' }
            }
        ]
    }

    let updateEvent: WaIncomingNewsletterMessageUpdateEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            updateEvent = event
        }
    })

    assert.ok(updateEvent)
    const event = updateEvent as unknown as WaIncomingNewsletterMessageUpdateEvent
    assert.equal(event.update.kind, 'reaction')
    if (event.update.kind === 'reaction') {
        assert.equal(event.update.revoked, true)
    }
})

test('processIncomingNewsletterMessage emits reaction revoke via edit=7', () => {
    const node = {
        tag: 'message',
        attrs: {
            id: 'REACT3',
            from: '120363025343298869@newsletter',
            type: 'reaction',
            edit: '7',
            server_id: '42'
        },
        content: [{ tag: 'reaction', attrs: {} }]
    }

    let updateEvent: WaIncomingNewsletterMessageUpdateEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            updateEvent = event
        }
    })

    assert.ok(updateEvent)
    const event = updateEvent as unknown as WaIncomingNewsletterMessageUpdateEvent
    assert.equal(event.update.kind, 'reaction')
    if (event.update.kind === 'reaction') {
        assert.equal(event.update.revoked, true)
    }
})

test('processIncomingNewsletterMessage emits poll_vote with aggregated counts (isSender=false)', () => {
    const hashA = new Uint8Array(32).fill(0xaa)
    const hashB = new Uint8Array(32).fill(0xbb)
    const node: BinaryNode = {
        tag: 'message',
        attrs: {
            id: 'POLL1',
            from: '120363025343298869@newsletter',
            type: 'poll',
            server_id: '77',
            t: '1700000001'
        },
        content: [
            {
                tag: 'votes',
                attrs: {},
                content: [
                    { tag: 'vote', attrs: { count: '3' }, content: hashA },
                    { tag: 'vote', attrs: { count: '1' }, content: hashB }
                ]
            },
            { tag: 'meta', attrs: { polltype: 'vote' } }
        ]
    }

    let updateEvent: WaIncomingNewsletterMessageUpdateEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            updateEvent = event
        }
    })

    assert.ok(updateEvent)
    const event = updateEvent as unknown as WaIncomingNewsletterMessageUpdateEvent
    assert.equal(event.parentMessageServerId, 77)
    assert.equal(event.update.kind, 'poll_vote')
    if (event.update.kind === 'poll_vote') {
        assert.equal(event.update.isSender, false)
        assert.equal(event.update.votes.length, 2)
        assert.deepEqual(event.update.votes[0].optionHash, hashA)
        assert.equal(event.update.votes[0].count, 3)
        assert.deepEqual(event.update.votes[1].optionHash, hashB)
        assert.equal(event.update.votes[1].count, 1)
    }
})

test('processIncomingNewsletterMessage emits poll_vote echo (isSender=true, no counts)', () => {
    const hashA = new Uint8Array(32).fill(0x11)
    const hashB = new Uint8Array(32).fill(0x22)
    const node: BinaryNode = {
        tag: 'message',
        attrs: {
            id: 'POLL_ECHO',
            from: '120363025343298869@newsletter',
            type: 'poll',
            server_id: '77',
            is_sender: 'true'
        },
        content: [
            {
                tag: 'votes',
                attrs: {},
                content: [
                    { tag: 'vote', attrs: {}, content: hashA },
                    { tag: 'vote', attrs: {}, content: hashB }
                ]
            },
            { tag: 'meta', attrs: { polltype: 'vote' } }
        ]
    }

    let updateEvent: WaIncomingNewsletterMessageUpdateEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            updateEvent = event
        }
    })

    assert.ok(updateEvent)
    const event = updateEvent as unknown as WaIncomingNewsletterMessageUpdateEvent
    assert.equal(event.update.kind, 'poll_vote')
    if (event.update.kind === 'poll_vote') {
        assert.equal(event.update.isSender, true)
        assert.equal(event.update.votes.length, 2)
        assert.deepEqual(event.update.votes[0].optionHash, hashA)
        assert.equal(event.update.votes[0].count, undefined)
        assert.deepEqual(event.update.votes[1].optionHash, hashB)
        assert.equal(event.update.votes[1].count, undefined)
    }
})

test('processIncomingNewsletterMessage rejects poll_vote mixing count and no-count entries', () => {
    const node: BinaryNode = {
        tag: 'message',
        attrs: { id: 'POLL_MIX', from: '120363025343298869@newsletter', type: 'poll' },
        content: [
            {
                tag: 'votes',
                attrs: {},
                content: [
                    { tag: 'vote', attrs: { count: '2' }, content: new Uint8Array(32).fill(1) },
                    { tag: 'vote', attrs: {}, content: new Uint8Array(32).fill(2) }
                ]
            }
        ]
    }

    let updateEvent: WaIncomingNewsletterMessageUpdateEvent | null = null
    let unhandled: WaIncomingUnhandledStanzaEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            updateEvent = event
        },
        emitUnhandledStanza: (event) => {
            unhandled = event
        }
    })

    assert.equal(updateEvent, null)
    assert.ok(unhandled)
    assert.equal(
        (unhandled as unknown as WaIncomingUnhandledStanzaEvent).reason,
        'newsletter.invalid_votes'
    )
})

test('processIncomingNewsletterMessage rejects poll_vote with wrong hash size', () => {
    const node = {
        tag: 'message',
        attrs: { id: 'POLL2', from: '120363025343298869@newsletter', type: 'poll' },
        content: [
            {
                tag: 'votes',
                attrs: {},
                content: [{ tag: 'vote', attrs: { count: '1' }, content: new Uint8Array(16) }]
            }
        ]
    }

    let updateEvent: WaIncomingNewsletterMessageUpdateEvent | null = null
    let unhandled: WaIncomingUnhandledStanzaEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            updateEvent = event
        },
        emitUnhandledStanza: (event) => {
            unhandled = event
        }
    })

    assert.equal(updateEvent, null)
    assert.ok(unhandled)
    assert.equal(
        (unhandled as unknown as WaIncomingUnhandledStanzaEvent).reason,
        'newsletter.invalid_votes'
    )
})

test('processIncomingNewsletterMessage emits counters from views/forwards/responses', () => {
    const node: BinaryNode = {
        tag: 'message',
        attrs: { id: 'MTR', from: '120363025343298869@newsletter', server_id: '42' },
        content: [
            { tag: 'views_count', attrs: { count: '5' } },
            { tag: 'forwards_count', attrs: { count: '2' } },
            { tag: 'responses_count', attrs: { count: '1' } }
        ]
    }

    const emitted: WaIncomingNewsletterMessageUpdateEvent[] = []
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            emitted.push(event)
        }
    })

    assert.equal(emitted.length, 1)
    assert.equal(emitted[0].update.kind, 'counters')
    if (emitted[0].update.kind === 'counters') {
        assert.equal(emitted[0].update.views, 5)
        assert.equal(emitted[0].update.forwards, 2)
        assert.equal(emitted[0].update.responses, 1)
    }
})

test('processIncomingNewsletterMessage emits both reaction and counters from same stanza', () => {
    const node: BinaryNode = {
        tag: 'message',
        attrs: { id: 'COMBO', from: '120363025343298869@newsletter', server_id: '42' },
        content: [
            {
                tag: 'reactions',
                attrs: {},
                content: [{ tag: 'reaction', attrs: { code: '🔥', count: '4' } }]
            },
            { tag: 'views_count', attrs: { count: '12' } }
        ]
    }

    const kinds: string[] = []
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            kinds.push(event.update.kind)
        }
    })

    assert.deepEqual(kinds, ['reaction', 'counters'])
})

test('processNewsletterLiveUpdates fans aggregated poll_vote inside live_updates envelope', () => {
    const hashA = new Uint8Array(32).fill(0x33)
    const hashB = new Uint8Array(32).fill(0x44)
    const notification: BinaryNode = {
        tag: 'notification',
        attrs: {
            from: '120363025343298869@newsletter',
            type: 'newsletter',
            id: 'NOTIF1',
            t: '1700000099'
        },
        content: [
            {
                tag: 'live_updates',
                attrs: {},
                content: [
                    {
                        tag: 'messages',
                        attrs: { t: '1700000099' },
                        content: [
                            {
                                tag: 'message',
                                attrs: { server_id: '128' },
                                content: [
                                    {
                                        tag: 'votes',
                                        attrs: {},
                                        content: [
                                            {
                                                tag: 'vote',
                                                attrs: { count: '4' },
                                                content: hashA
                                            },
                                            {
                                                tag: 'vote',
                                                attrs: { count: '1' },
                                                content: hashB
                                            }
                                        ]
                                    }
                                ]
                            },
                            // bare message announcement – should be skipped
                            { tag: 'message', attrs: { server_id: '129' } }
                        ]
                    }
                ]
            }
        ]
    }

    const emitted: WaIncomingNewsletterMessageUpdateEvent[] = []
    processNewsletterLiveUpdates(notification, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            emitted.push(event)
        }
    })

    assert.equal(emitted.length, 1)
    const event = emitted[0]
    assert.equal(event.parentMessageServerId, 128)
    assert.equal(event.chatJid, '120363025343298869@newsletter')
    assert.equal(event.timestampSeconds, 1700000099)
    assert.equal(event.update.kind, 'poll_vote')
    if (event.update.kind === 'poll_vote') {
        assert.equal(event.update.isSender, false)
        assert.equal(event.update.votes.length, 2)
        assert.deepEqual(event.update.votes[0].optionHash, hashA)
        assert.equal(event.update.votes[0].count, 4)
        assert.deepEqual(event.update.votes[1].optionHash, hashB)
        assert.equal(event.update.votes[1].count, 1)
    }
})

test('processIncomingNewsletterMessage emits revoke on edit=8', () => {
    const node = {
        tag: 'message',
        attrs: {
            id: 'REV1',
            from: '120363025343298869@newsletter',
            type: 'text',
            edit: '8',
            server_id: '99'
        },
        content: [{ tag: 'plaintext', attrs: {} }]
    }

    let updateEvent: WaIncomingNewsletterMessageUpdateEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            updateEvent = event
        }
    })

    assert.ok(updateEvent)
    const event = updateEvent as unknown as WaIncomingNewsletterMessageUpdateEvent
    assert.equal(event.parentMessageServerId, 99)
    assert.equal(event.update.kind, 'revoke')
})

test('processIncomingNewsletterMessage emits edit on edit=3 with new plaintext', () => {
    const newMessage = proto.Message.encode({ conversation: 'edited content' }).finish()
    const node = {
        tag: 'message',
        attrs: {
            id: 'EDIT1',
            from: '120363025343298869@newsletter',
            type: 'text',
            edit: '3',
            server_id: '55'
        },
        content: [{ tag: 'plaintext', attrs: {}, content: newMessage }]
    }

    let updateEvent: WaIncomingNewsletterMessageUpdateEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitNewsletterMessageUpdate: (event) => {
            updateEvent = event
        }
    })

    assert.ok(updateEvent)
    const event = updateEvent as unknown as WaIncomingNewsletterMessageUpdateEvent
    assert.equal(event.parentMessageServerId, 55)
    assert.equal(event.update.kind, 'edit')
    if (event.update.kind === 'edit') {
        assert.equal(event.update.message.conversation, 'edited content')
    }
})

test('processIncomingNewsletterMessage emits unhandled on decode failure', () => {
    const node = {
        tag: 'message',
        attrs: {
            id: 'STANZA3',
            from: '120363025343298869@newsletter',
            type: 'text'
        },
        content: [
            {
                tag: 'plaintext',
                attrs: {},
                content: new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff])
            }
        ]
    }

    let emitted = 0
    let unhandled: WaIncomingUnhandledStanzaEvent | null = null
    processIncomingNewsletterMessage(node, {
        logger: NEWSLETTER_LOGGER,
        emitIncomingMessage: () => {
            emitted += 1
        },
        emitUnhandledStanza: (event) => {
            unhandled = event
        }
    })

    assert.equal(emitted, 0)
    assert.ok(unhandled)
    assert.equal(
        (unhandled as unknown as WaIncomingUnhandledStanzaEvent).reason,
        'newsletter.decode_failed'
    )
})
