import assert from 'node:assert/strict'
import test from 'node:test'

import { hkdf } from '@crypto/core/hkdf'
import { aesGcmEncrypt } from '@crypto/core/primitives'
import { createNoopLogger } from '@infra/log/types'
import { MEDIA_RETRY_IV_SIZE } from '@media/crypto/media-retry'
import {
    createMediaRetryRequester,
    parseMediaRetryNotification
} from '@message/primitives/media-retry'
import { proto, type Proto } from '@proto'
import type { BinaryNode } from '@transport/types'
import { TEXT_ENCODER } from '@util/bytes'

const MESSAGE_ID = '3EB0RMR'
const CHAT_JID = '5511999999999@s.whatsapp.net'
const GROUP_JID = '120363000000000000@g.us'
const ME_LID = '77770000:12@lid'

function mediaKey(): Uint8Array {
    return new Uint8Array(32).fill(7)
}

function createRequester(options: {
    readonly defaultTimeoutMs?: number
    readonly maxPending?: number
}) {
    const sent: BinaryNode[] = []
    let onSent: (() => void) | null = null
    const requester = createMediaRetryRequester({
        logger: createNoopLogger(),
        sendNode: async (node: BinaryNode) => {
            sent.push(node)
            onSent?.()
        },
        getCurrentCredentials: () => ({ meLid: ME_LID }) as never,
        ...options
    })
    const waitForSends = async (count: number): Promise<void> => {
        while (sent.length < count) {
            await new Promise<void>((resolve) => {
                onSent = resolve
            })
        }
    }
    return { requester, sent, waitForSends }
}

function notificationNode(
    payload: Proto.MediaRetryNotification.$Properties,
    overrides: { readonly messageId?: string } = {}
): BinaryNode {
    const stanzaId = overrides.messageId ?? MESSAGE_ID
    const iv = new Uint8Array(MEDIA_RETRY_IV_SIZE).fill(3)
    const key = hkdf(mediaKey(), null, TEXT_ENCODER.encode('WhatsApp Media Retry Notification'), 32)
    const ciphertext = aesGcmEncrypt(
        key,
        iv,
        proto.MediaRetryNotification.encode(payload).finish(),
        TEXT_ENCODER.encode(stanzaId)
    )
    return {
        tag: 'notification',
        attrs: { id: stanzaId, from: ME_LID, type: 'mediaretry' },
        content: [
            {
                tag: 'encrypt',
                attrs: {},
                content: [
                    { tag: 'enc_p', attrs: {}, content: ciphertext },
                    { tag: 'enc_iv', attrs: {}, content: iv }
                ]
            }
        ]
    }
}

function findChild(node: BinaryNode, tag: string): BinaryNode | undefined {
    return Array.isArray(node.content) ? node.content.find((child) => child.tag === tag) : undefined
}

test('media reupload request builds the server-error receipt WhatsApp Web sends', async () => {
    const { requester, sent, waitForSends } = createRequester({})

    const pending = requester.request({
        messageId: MESSAGE_ID,
        chatJid: CHAT_JID,
        mediaKey: mediaKey(),
        fromMe: false
    })
    await waitForSends(1)

    assert.equal(sent.length, 1)
    const receipt = sent[0]
    assert.equal(receipt.tag, 'receipt')
    assert.equal(receipt.attrs.type, 'server-error')
    assert.equal(receipt.attrs.id, MESSAGE_ID)
    assert.equal(receipt.attrs.to, '77770000@lid')

    const encrypt = findChild(receipt, 'encrypt')
    assert.ok(encrypt)
    assert.ok(findChild(encrypt, 'enc_p')?.content instanceof Uint8Array)
    assert.equal(
        (findChild(encrypt, 'enc_iv')?.content as Uint8Array).byteLength,
        MEDIA_RETRY_IV_SIZE
    )

    const rmr = findChild(receipt, 'rmr')
    assert.ok(rmr)
    assert.equal(rmr.attrs.jid, CHAT_JID)
    assert.equal(rmr.attrs.from_me, 'false')
    assert.equal(rmr.attrs.participant, undefined)

    requester.handleNotification(
        notificationNode({
            stanzaId: MESSAGE_ID,
            result: proto.MediaRetryNotification.ResultType.SUCCESS,
            directPath: '/v/x'
        })
    )
    await pending
})

test('media reupload request names the author on group chats', async () => {
    const { requester, sent, waitForSends } = createRequester({})

    const pending = requester.request({
        messageId: MESSAGE_ID,
        chatJid: GROUP_JID,
        mediaKey: mediaKey(),
        fromMe: true,
        participant: '5511888888888:5@s.whatsapp.net'
    })
    await waitForSends(1)

    const rmr = findChild(sent[0], 'rmr')
    assert.ok(rmr)
    assert.equal(rmr.attrs.jid, GROUP_JID)
    assert.equal(rmr.attrs.from_me, 'true')
    assert.equal(rmr.attrs.participant, '5511888888888@s.whatsapp.net')

    requester.handleNotification(
        notificationNode({
            stanzaId: MESSAGE_ID,
            result: proto.MediaRetryNotification.ResultType.SUCCESS,
            directPath: '/v/x'
        })
    )
    await pending
})

test('media reupload resolves with the fresh direct path', async () => {
    const { requester, waitForSends } = createRequester({})

    const pending = requester.request({
        messageId: MESSAGE_ID,
        chatJid: CHAT_JID,
        mediaKey: mediaKey(),
        fromMe: false
    })
    await waitForSends(1)

    requester.handleNotification(
        notificationNode({
            stanzaId: MESSAGE_ID,
            result: proto.MediaRetryNotification.ResultType.SUCCESS,
            directPath: '/v/t62.7118-24/reuploaded'
        })
    )

    const result = await pending
    assert.equal(result.result, 'success')
    assert.equal(result.resultCode, proto.MediaRetryNotification.ResultType.SUCCESS)
    assert.equal(result.directPath, '/v/t62.7118-24/reuploaded')
})

test('media reupload maps a not-found answer without rejecting', async () => {
    const { requester, waitForSends } = createRequester({})

    const pending = requester.request({
        messageId: MESSAGE_ID,
        chatJid: CHAT_JID,
        mediaKey: mediaKey(),
        fromMe: false
    })
    await waitForSends(1)

    requester.handleNotification(
        notificationNode({
            stanzaId: MESSAGE_ID,
            result: proto.MediaRetryNotification.ResultType.NOT_FOUND
        })
    )

    const result = await pending
    assert.equal(result.result, 'not_found')
    assert.equal(result.directPath, undefined)
})

test('media reupload maps the error form of the notification', async () => {
    const { requester, waitForSends } = createRequester({})

    const pending = requester.request({
        messageId: MESSAGE_ID,
        chatJid: CHAT_JID,
        mediaKey: mediaKey(),
        fromMe: false
    })
    await waitForSends(1)

    requester.handleNotification({
        tag: 'notification',
        attrs: { id: MESSAGE_ID, from: ME_LID, type: 'mediaretry' },
        content: [
            {
                tag: 'error',
                attrs: { code: String(proto.MediaRetryNotification.ResultType.DECRYPTION_ERROR) }
            }
        ]
    })

    const result = await pending
    assert.equal(result.result, 'decryption_error')
})

test('media reupload rejects when the sealed stanza id does not match', async () => {
    const { requester, waitForSends } = createRequester({})

    const pending = requester.request({
        messageId: MESSAGE_ID,
        chatJid: CHAT_JID,
        mediaKey: mediaKey(),
        fromMe: false
    })
    await waitForSends(1)

    requester.handleNotification(
        notificationNode({
            stanzaId: 'SOMEOTHERID',
            result: proto.MediaRetryNotification.ResultType.SUCCESS,
            directPath: '/v/x'
        })
    )

    await assert.rejects(pending, /stanza id mismatch/)
})

test('a second request for the same message joins the first', async () => {
    const { requester, sent, waitForSends } = createRequester({})
    const input = {
        messageId: MESSAGE_ID,
        chatJid: CHAT_JID,
        mediaKey: mediaKey(),
        fromMe: false
    }

    const first = requester.request(input)
    await waitForSends(1)
    const second = requester.request(input)

    requester.handleNotification(
        notificationNode({
            stanzaId: MESSAGE_ID,
            result: proto.MediaRetryNotification.ResultType.SUCCESS,
            directPath: '/v/x'
        })
    )

    assert.deepEqual(await first, await second)
    assert.equal(sent.length, 1)
})

test('media reupload rejects when no notification arrives in time', async () => {
    const { requester } = createRequester({ defaultTimeoutMs: 5 })

    const pending = requester.request({
        messageId: MESSAGE_ID,
        chatJid: CHAT_JID,
        mediaKey: mediaKey(),
        fromMe: false
    })

    await assert.rejects(pending, /media reupload timeout/)
})

test('pending media reupload requests are bounded', async () => {
    const { requester, waitForSends } = createRequester({ maxPending: 1 })

    const first = requester.request({
        messageId: MESSAGE_ID,
        chatJid: CHAT_JID,
        mediaKey: mediaKey(),
        fromMe: false
    })
    const rejection = assert.rejects(first, /evicted/)
    await waitForSends(1)

    const second = requester.request({
        messageId: 'OTHERMSG',
        chatJid: CHAT_JID,
        mediaKey: mediaKey(),
        fromMe: false
    })
    await waitForSends(2)
    await rejection

    requester.handleNotification(
        notificationNode(
            {
                stanzaId: 'OTHERMSG',
                result: proto.MediaRetryNotification.ResultType.SUCCESS,
                directPath: '/v/x'
            },
            { messageId: 'OTHERMSG' }
        )
    )
    assert.equal((await second).result, 'success')
})

test('an unmatched notification is ignored instead of throwing', () => {
    const { requester } = createRequester({})

    assert.doesNotThrow(() => {
        requester.handleNotification(
            notificationNode({
                stanzaId: MESSAGE_ID,
                result: proto.MediaRetryNotification.ResultType.SUCCESS
            })
        )
        requester.handleNotification({ tag: 'notification', attrs: { type: 'mediaretry' } })
    })
})

test('a request without a paired session throws before sending anything', async () => {
    const sent: BinaryNode[] = []
    const requester = createMediaRetryRequester({
        logger: createNoopLogger(),
        sendNode: async (node: BinaryNode) => {
            sent.push(node)
        },
        getCurrentCredentials: () => null
    })

    await assert.rejects(
        requester.request({
            messageId: MESSAGE_ID,
            chatJid: CHAT_JID,
            mediaKey: mediaKey(),
            fromMe: false
        }),
        /paired session/
    )
    assert.equal(sent.length, 0)
})

function parserNotification(iv: Uint8Array): BinaryNode {
    return {
        tag: 'notification',
        attrs: {
            id: '3EB0AAA',
            from: '5511999999999@s.whatsapp.net',
            type: 'mediaretry',
            participant: '5511888888888@s.whatsapp.net'
        },
        content: [
            {
                tag: 'encrypt',
                attrs: {},
                content: [
                    { tag: 'enc_p', attrs: {}, content: new Uint8Array([9, 9, 9]) },
                    { tag: 'enc_iv', attrs: {}, content: iv }
                ]
            }
        ]
    }
}

test('parses the encrypted mediaretry payload', () => {
    const parsed = parseMediaRetryNotification(parserNotification(new Uint8Array(12)))

    assert.ok(parsed)
    assert.equal(parsed.messageId, '3EB0AAA')
    assert.equal(parsed.from, '5511999999999@s.whatsapp.net')
    assert.equal(parsed.errorCode, undefined)
    assert.deepEqual(parsed.ciphertext, new Uint8Array([9, 9, 9]))
    assert.equal(parsed.iv?.byteLength, 12)
})

test('parses the error form of a mediaretry notification', () => {
    const parsed = parseMediaRetryNotification({
        tag: 'notification',
        attrs: { id: '3EB0BBB', type: 'mediaretry' },
        content: [{ tag: 'error', attrs: { code: '2' } }]
    })

    assert.ok(parsed)
    assert.equal(parsed.errorCode, 2)
    assert.equal(parsed.ciphertext, undefined)
})

test('rejects a mediaretry notification with a wrong-sized iv', () => {
    assert.equal(parseMediaRetryNotification(parserNotification(new Uint8Array(16))), null)
})

test('rejects a mediaretry notification with no id, payload, or error code', () => {
    assert.equal(
        parseMediaRetryNotification({
            tag: 'notification',
            attrs: { type: 'mediaretry' },
            content: [{ tag: 'error', attrs: { code: '2' } }]
        }),
        null
    )
    assert.equal(
        parseMediaRetryNotification({
            tag: 'notification',
            attrs: { id: '3EB0CCC', type: 'mediaretry' }
        }),
        null
    )
    assert.equal(
        parseMediaRetryNotification({
            tag: 'notification',
            attrs: { id: '3EB0DDD', type: 'mediaretry' },
            content: [{ tag: 'error', attrs: {} }]
        }),
        null
    )
})

test('two concurrent requests for the same message share one receipt', async () => {
    const { requester, sent } = createRequester({ defaultTimeoutMs: 200 })
    const input = {
        messageId: MESSAGE_ID,
        chatJid: CHAT_JID,
        mediaKey: mediaKey(),
        fromMe: false
    }

    const first = requester.request(input)
    const second = requester.request(input)
    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.equal(sent.length, 1)
    requester.handleNotification(
        notificationNode({
            stanzaId: MESSAGE_ID,
            result: proto.MediaRetryNotification.ResultType.SUCCESS,
            directPath: '/v/x'
        })
    )
    assert.equal((await first).result, 'success')
    assert.equal((await second).result, 'success')
})

test('rejects a mediaretry notification whose sealed payload is empty', () => {
    assert.equal(
        parseMediaRetryNotification({
            tag: 'notification',
            attrs: { id: MESSAGE_ID, type: 'mediaretry' },
            content: [
                {
                    tag: 'encrypt',
                    attrs: {},
                    content: [
                        { tag: 'enc_p', attrs: {}, content: new Uint8Array() },
                        { tag: 'enc_iv', attrs: {}, content: new Uint8Array(MEDIA_RETRY_IV_SIZE) }
                    ]
                }
            ]
        }),
        null
    )
})
