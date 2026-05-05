import assert from 'node:assert/strict'
import test from 'node:test'

import {
    describeAckNode,
    isAckOrReceiptNode,
    isNegativeAckNode,
    isRetryableNegativeAck
} from '@message/ack'
import { decryptAddonPayload, encryptAddonPayload } from '@message/addon-crypto'
import {
    isSendMediaMessage,
    resolveEditAttr,
    resolveEncMediaType,
    resolveMessageTypeAttr,
    resolveMetaAttrs
} from '@message/content'
import { unwrapDeviceSentMessage, wrapDeviceSentMessage } from '@message/device-sent'
import { computeDeviceKeyHash, injectDeviceListMetadata } from '@message/icdc'
import { unpadPkcs7, writeRandomPadMax16 } from '@message/padding'
import { computePhashV2 } from '@message/phash'
import { buildReportingTokenArtifacts } from '@message/reporting-token'
import {
    assertMessageSecret,
    createUseCaseSecret,
    ensureMessageSecret,
    WA_USE_CASE_SECRET_MODIFICATION_TYPES
} from '@message/use-case-secret'

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

    const hash = await computePhashV2(['5511:0@c.us', '5511:2@s.whatsapp.net'])
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

test('computeDeviceKeyHash produces deterministic 8-byte hash from identity keys', async () => {
    const key1 = new Uint8Array(33).fill(1)
    key1[0] = 5
    const key2 = new Uint8Array(33).fill(2)
    key2[0] = 5

    const hash1 = await computeDeviceKeyHash([key1, key2])
    const hash2 = await computeDeviceKeyHash([key1, key2])
    assert.equal(hash1.byteLength, 8)
    assert.deepEqual(hash1, hash2)

    const hashDiff = await computeDeviceKeyHash([key2, key1])
    assert.notDeepEqual(hash1, hashDiff)

    const emptyHash = await computeDeviceKeyHash([])
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
