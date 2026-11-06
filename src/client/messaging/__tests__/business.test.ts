import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { Readable } from 'node:stream'
import test from 'node:test'

import { buildMediaMessageContent, type WaMediaMessageOptions } from '@client/messaging/messages'
import { createNoopLogger } from '@infra/log/types'
import { WaMediaCrypto } from '@media/crypto/WaMediaCrypto'
import { resolveButtonAddonKind } from '@message/encode/content'
import type { WaSendBusinessMessage } from '@message/types'
import { type Proto, proto } from '@proto'
import { createServerClock } from '@util/clock'

const ME = '15551234567:8@s.whatsapp.net'
const OPTIONS: WaMediaMessageOptions = {
    logger: createNoopLogger(),
    mediaTransfer: {} as never,
    queryWithContext: async () => {
        throw new Error('unexpected IQ')
    },
    getMediaConnCache: () => null,
    setMediaConnCache: () => undefined,
    serverClock: createServerClock(() => 0)
}
const BUTTON = { type: 'cta_url', text: 'Details', url: 'https://example.com' } as const

const CONTENTS: readonly WaSendBusinessMessage[] = [
    { type: 'buttons', text: 'Choose', buttons: [{ id: 'yes', text: 'Yes' }] },
    { type: 'interactive', text: 'Choose', buttons: [BUTTON] },
    {
        type: 'list',
        text: 'Menu',
        buttonText: 'Open',
        sections: [{ title: 'Drinks', rows: [{ id: 'tea', title: 'Tea' }] }]
    },
    { type: 'native-form', text: 'Fill in', flowCta: 'Open', flowId: '123' },
    { type: 'catalog', text: 'Browse' },
    {
        type: 'payment',
        text: 'Pay',
        referenceId: '1',
        pix: { key: 'pay@example.com', keyType: 'EMAIL', merchantName: 'Shop' }
    },
    {
        type: 'charge',
        text: 'Pay',
        referenceId: '2',
        total: 1,
        items: [{ name: 'Tea', amount: 1, quantity: 1 }],
        pix: { key: 'pay@example.com', keyType: 'EMAIL', merchantName: 'Shop' }
    },
    { type: 'product', productId: '123', title: 'Tea', currencyCode: 'BRL', price: 1 }
]
for (const content of CONTENTS) {
    test(`send builder routes ${content.type} and preserves messageContextInfo`, async () => {
        const messageContextInfo = { messageSecret: new Uint8Array(32).fill(7) }
        const built = await buildMediaMessageContent(
            OPTIONS,
            { ...content, messageContextInfo },
            { to: '120@g.us', meJid: ME }
        )
        assert.equal('type' in built.message, false)
        assert.deepEqual(built.message.messageContextInfo, messageContextInfo)
        assert.ok(proto.Message.encode(built.message).finish().length > 32)
        if (content.type === 'native-form') assert.ok(built.flowToken)
    })
}

test('carousel uploads image and video with the existing crypto/media pipeline in order', async () => {
    const inputs = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6, 7])]
    const encrypted: Uint8Array[] = []
    const urls: string[] = []
    let uploadCount = 0
    const options: WaMediaMessageOptions = {
        ...OPTIONS,
        mediaTransfer: {
            uploadStream: async (request: { url: string; body: Uint8Array }) => {
                urls.push(request.url)
                encrypted.push(request.body)
                uploadCount += 1
                return { status: 200 } as Response
            },
            readResponseBytes: async () =>
                new TextEncoder().encode(
                    JSON.stringify({
                        url: `https://cdn.example.com/${uploadCount}`,
                        direct_path: `/media/${uploadCount}`
                    })
                )
        } as never,
        getMediaConnCache: () => ({
            auth: 'test',
            expiresAtMs: Date.now() + 600_000,
            hosts: [{ hostname: 'cdn.example.com', isFallback: false }]
        })
    }
    const content: WaSendBusinessMessage = {
        type: 'carousel',
        text: 'Our selection',
        cards: [
            {
                title: 'Photo',
                text: 'First',
                media: {
                    type: 'image',
                    media: inputs[0],
                    mimetype: 'image/jpeg',
                    width: 20,
                    jpegThumbnail: new Uint8Array([9])
                },
                buttons: [BUTTON]
            },
            {
                title: 'Video',
                text: 'Second',
                media: {
                    type: 'video',
                    media: inputs[1],
                    mimetype: 'video/mp4',
                    seconds: 5,
                    caption: 'Inner caption'
                },
                buttons: [{ type: 'quick_reply', id: 'more', text: 'More' }]
            }
        ]
    }
    const built = await buildMediaMessageContent(options, content, { to: '120@g.us', meJid: ME })
    assert.equal(built.upload, undefined)
    assert.equal(
        built.message.interactiveMessage?.carouselMessage?.cards?.[1].header?.videoMessage?.caption,
        undefined
    )
    assert.equal(content.cards[1].media.caption, 'Inner caption')
    assert.equal(resolveButtonAddonKind(built.message), 'interactive')
    const decoded = proto.Message.decode(proto.Message.encode(built.message).finish())
    const carousel = decoded.interactiveMessage!.carouselMessage!
    assert.equal(carousel.messageVersion, 1)
    assert.equal(carousel.cards?.length, 2)
    assert.deepEqual(
        urls.map((url) => new URL(url).pathname.split('/').slice(0, 3).join('/')),
        ['/mms/image', '/mms/video']
    )
    for (let index = 0; index < 2; index += 1) {
        const card: Proto.Message.IInteractiveMessage = carousel.cards[index]
        const media = index === 0 ? card.header!.imageMessage! : card.header!.videoMessage!
        assert.equal(card.header?.hasMediaAttachment, true)
        assert.equal(card.header?.title, content.cards[index].title)
        assert.equal(card.body?.text, content.cards[index].text)
        assert.equal(card.nativeFlowMessage?.messageVersion, 1)
        assert.equal(card.nativeFlowMessage?.messageParamsJson, '')
        assert.equal(
            card.nativeFlowMessage?.buttons?.[0].name,
            content.cards[index].buttons[0].type
        )
        assert.equal(media.url, `https://cdn.example.com/${index + 1}`)
        assert.equal(media.directPath, `/media/${index + 1}`)
        assert.equal(Number(media.fileLength), inputs[index].length)
        assert.equal(media.mediaKey?.length, 32)
        assert.equal(media.fileSha256?.length, 32)
        assert.equal(media.fileEncSha256?.length, 32)
        const decrypted = await WaMediaCrypto.decryptBytes(
            index === 0 ? 'image' : 'video',
            media.mediaKey,
            encrypted[index]
        )
        assert.deepEqual(decrypted.plaintext, inputs[index])
    }
    assert.equal(carousel.cards[0].header?.imageMessage?.width, 20)
    assert.equal(carousel.cards[1].header?.videoMessage?.seconds, 5)
    assert.equal(
        Object.prototype.hasOwnProperty.call(carousel.cards[1].header.videoMessage, 'caption'),
        false
    )
    assert.equal(carousel.cards[1].body?.text, 'Second')
    assert.equal('imageMessage' in content.cards[0].media, false)
    const standalone = await buildMediaMessageContent(options, content.cards[1].media)
    assert.equal(standalone.message.videoMessage?.caption, 'Inner caption')
})

test('carousel validates every card before uploading and stops on upload failure', async () => {
    let uploads = 0
    const options = {
        ...OPTIONS,
        mediaTransfer: {
            uploadStream: async () => {
                uploads += 1
                throw new Error('upload failed')
            }
        } as never,
        getMediaConnCache: () => ({
            auth: 'test',
            expiresAtMs: Date.now() + 600_000,
            hosts: [{ hostname: 'cdn.example.com', isFallback: false }]
        })
    }
    const card = {
        title: 'Photo',
        text: 'First',
        media: { type: 'image', media: new Uint8Array([1]), mimetype: 'image/jpeg' },
        buttons: [BUTTON]
    } as const
    await assert.rejects(
        buildMediaMessageContent(options, {
            type: 'carousel',
            text: 'Cards',
            cards: [card, { ...card, buttons: [] }]
        }),
        /at least one button/
    )
    assert.equal(uploads, 0)
    await assert.rejects(
        buildMediaMessageContent(options, {
            type: 'carousel',
            text: 'Cards',
            cards: Array.from({ length: 101 }, () => card)
        }),
        /at most 100 cards/
    )
    assert.equal(uploads, 0)
    await assert.rejects(
        buildMediaMessageContent(options, { type: 'carousel', text: 'Cards', cards: [card, card] }),
        /upload failed/
    )
    assert.equal(uploads, 1)
})

test('carousel cleans spooled media when MIME detection fails before upload', async () => {
    let path: string | undefined
    let uploads = 0
    await assert.rejects(
        buildMediaMessageContent(
            {
                ...OPTIONS,
                media: {
                    processor: {
                        detectMimetype: async (input) => {
                            assert.equal(typeof input, 'string')
                            path = input as string
                            await access(path)
                            throw new Error('detect failed')
                        }
                    }
                },
                mediaTransfer: {
                    uploadStream: async () => {
                        uploads += 1
                    }
                } as never
            },
            {
                type: 'carousel',
                text: 'Cards',
                cards: [
                    {
                        title: 'Photo',
                        text: 'Details',
                        buttons: [BUTTON],
                        media: { type: 'image', media: Readable.from([new Uint8Array([1, 2, 3])]) }
                    }
                ]
            }
        ),
        /detect failed/
    )
    assert.equal(uploads, 0)
    assert.ok(path)
    await assert.rejects(access(path), { code: 'ENOENT' })
})

test('pre-upload validation leaves caller-owned streams usable', async () => {
    const stream = Readable.from([new Uint8Array([1, 2, 3])])
    await assert.rejects(
        buildMediaMessageContent(OPTIONS, {
            type: 'image',
            media: stream
        }),
        /mimetype is required/
    )
    assert.equal(stream.destroyed, false)
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    assert.deepEqual(chunks, [new Uint8Array([1, 2, 3])])
})
