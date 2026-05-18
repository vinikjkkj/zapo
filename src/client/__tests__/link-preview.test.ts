import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveLinkPreview } from '@client/link-preview'
import { buildMediaMessageContent, type WaMediaMessageOptions } from '@client/messages'
import { createNoopLogger } from '@infra/log/types'
import type { WaMediaConn } from '@media/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import type { WaLinkPreviewFetcher, WaLinkPreviewResolved } from '@message/link-preview/types'
import { proto } from '@proto'
import { TEXT_ENCODER } from '@util/bytes'

const fakeMediaConn: WaMediaConn = {
    auth: 'auth-token',
    expiresAtMs: Date.now() + 60_000,
    hosts: [{ hostname: 'mmg.whatsapp.net', isFallback: false }]
}

function noopFetcher(result: WaLinkPreviewResolved | null = null): WaLinkPreviewFetcher {
    return {
        async fetch() {
            return result
        }
    }
}

function recordingFetcher(): {
    readonly fetcher: WaLinkPreviewFetcher
    readonly calls: { matchedText: string }[]
} {
    const calls: { matchedText: string }[] = []
    return {
        fetcher: {
            async fetch(input) {
                calls.push({ matchedText: input.matchedText })
                return {
                    matchedText: input.matchedText,
                    title: 'Auto Title',
                    previewType: proto.Message.ExtendedTextMessage.PreviewType.NONE
                }
            }
        },
        calls
    }
}

function uploadStubMediaTransfer(directPath: string): {
    readonly transfer: WaMediaTransferClient
    readonly uploads: number
} {
    let uploads = 0
    const stub = {
        async uploadStream(): Promise<{ status: number; url: string }> {
            uploads++
            return { status: 200, url: 'https://mmg.whatsapp.net/x' }
        },
        async readResponseBytes(): Promise<Uint8Array> {
            return TEXT_ENCODER.encode(
                JSON.stringify({ direct_path: directPath, url: 'https://mmg.whatsapp.net/x' })
            )
        }
    }
    return {
        transfer: stub as unknown as WaMediaTransferClient,
        get uploads() {
            return uploads
        }
    }
}

test('resolveLinkPreview returns null when perMessage=false', async () => {
    const r = await resolveLinkPreview('see https://example.com', false, {
        logger: createNoopLogger(),
        mediaTransfer: uploadStubMediaTransfer('').transfer,
        getMediaConn: () => Promise.resolve(fakeMediaConn),
        fetcher: noopFetcher({
            matchedText: 'https://example.com',
            title: 'x',
            previewType: proto.Message.ExtendedTextMessage.PreviewType.NONE
        }),
        options: {}
    })
    assert.equal(r, null)
})

test('resolveLinkPreview returns null when text has no url', async () => {
    const r = await resolveLinkPreview('hello world', undefined, {
        logger: createNoopLogger(),
        mediaTransfer: uploadStubMediaTransfer('').transfer,
        getMediaConn: () => Promise.resolve(fakeMediaConn),
        fetcher: noopFetcher(),
        options: {}
    })
    assert.equal(r, null)
})

test('resolveLinkPreview returns null when global disabled and perMessage undefined', async () => {
    const r = await resolveLinkPreview('see https://example.com', undefined, {
        logger: createNoopLogger(),
        mediaTransfer: uploadStubMediaTransfer('').transfer,
        getMediaConn: () => Promise.resolve(fakeMediaConn),
        fetcher: noopFetcher({
            matchedText: 'https://example.com',
            title: 'x',
            previewType: proto.Message.ExtendedTextMessage.PreviewType.NONE
        }),
        options: { enabled: false }
    })
    assert.equal(r, null)
})

test('resolveLinkPreview allows opt-in when global disabled', async () => {
    const { fetcher, calls } = recordingFetcher()
    const r = await resolveLinkPreview('see https://example.com', true, {
        logger: createNoopLogger(),
        mediaTransfer: uploadStubMediaTransfer('').transfer,
        getMediaConn: () => Promise.resolve(fakeMediaConn),
        fetcher,
        options: { enabled: false }
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.matchedText, 'https://example.com')
    assert.equal(r?.resolved.title, 'Auto Title')
})

test('resolveLinkPreview uses override without invoking fetcher', async () => {
    const { fetcher, calls } = recordingFetcher()
    const r = await resolveLinkPreview(
        'see https://example.com',
        {
            title: 'Custom',
            description: 'Custom desc',
            previewType: proto.Message.ExtendedTextMessage.PreviewType.VIDEO
        },
        {
            logger: createNoopLogger(),
            mediaTransfer: uploadStubMediaTransfer('').transfer,
            getMediaConn: () => Promise.resolve(fakeMediaConn),
            fetcher,
            options: {}
        }
    )
    assert.equal(calls.length, 0)
    assert.equal(r?.resolved.title, 'Custom')
    assert.equal(r?.resolved.description, 'Custom desc')
    assert.equal(r?.resolved.previewType, proto.Message.ExtendedTextMessage.PreviewType.VIDEO)
    assert.equal(r?.resolved.matchedText, 'https://example.com')
})

test('resolveLinkPreview inlines thumbnails ≤ 64KB', async () => {
    const small = new Uint8Array(1024)
    const r = await resolveLinkPreview(
        'see https://example.com',
        { thumbnail: { bytes: small } },
        {
            logger: createNoopLogger(),
            mediaTransfer: uploadStubMediaTransfer('').transfer,
            getMediaConn: () => Promise.resolve(fakeMediaConn),
            fetcher: noopFetcher(),
            options: {}
        }
    )
    assert.equal(r?.thumbnailFields.jpegThumbnail, small)
    assert.equal(r?.thumbnailFields.thumbnailDirectPath, undefined)
})

test('resolveLinkPreview drops oversized thumbnail when uploadHqThumbnail=false', async () => {
    const big = new Uint8Array(100_000)
    const r = await resolveLinkPreview(
        'see https://example.com',
        { thumbnail: { bytes: big } },
        {
            logger: createNoopLogger(),
            mediaTransfer: uploadStubMediaTransfer('').transfer,
            getMediaConn: () => Promise.resolve(fakeMediaConn),
            fetcher: noopFetcher(),
            options: { uploadHqThumbnail: false }
        }
    )
    assert.equal(r?.thumbnailFields.jpegThumbnail, undefined)
    assert.equal(r?.thumbnailFields.thumbnailDirectPath, undefined)
})

test('resolveLinkPreview uploads HQ thumbnail when oversize and upload enabled', async () => {
    const stub = uploadStubMediaTransfer('/v/abc')
    const big = new Uint8Array(100_000)
    const r = await resolveLinkPreview(
        'see https://example.com',
        { thumbnail: { bytes: big, width: 200, height: 100 } },
        {
            logger: createNoopLogger(),
            mediaTransfer: stub.transfer,
            getMediaConn: () => Promise.resolve(fakeMediaConn),
            fetcher: noopFetcher(),
            options: { uploadHqThumbnail: true }
        }
    )
    assert.equal(stub.uploads, 1)
    assert.equal(r?.thumbnailFields.thumbnailDirectPath, '/v/abc')
    assert.equal(r?.thumbnailFields.thumbnailSha256?.byteLength, 32)
    assert.equal(r?.thumbnailFields.thumbnailEncSha256?.byteLength, 32)
    assert.equal(r?.thumbnailFields.mediaKey?.byteLength, 32)
    assert.equal(r?.thumbnailFields.thumbnailWidth, 200)
    assert.equal(r?.thumbnailFields.thumbnailHeight, 100)
})

test('resolveLinkPreview drops thumbnail on upload failure', async () => {
    const failingTransfer = {
        async uploadStream(): Promise<{ status: number; url: string }> {
            return { status: 500, url: 'x' }
        },
        async readResponseBytes(): Promise<Uint8Array> {
            return new Uint8Array()
        }
    } as unknown as WaMediaTransferClient
    const big = new Uint8Array(100_000)
    const r = await resolveLinkPreview(
        'see https://example.com',
        { thumbnail: { bytes: big } },
        {
            logger: createNoopLogger(),
            mediaTransfer: failingTransfer,
            getMediaConn: () => Promise.resolve(fakeMediaConn),
            fetcher: noopFetcher(),
            options: { uploadHqThumbnail: true }
        }
    )
    assert.equal(r?.resolved.matchedText, 'https://example.com')
    assert.equal(r?.thumbnailFields.thumbnailDirectPath, undefined)
    assert.equal(r?.thumbnailFields.jpegThumbnail, undefined)
})

function makeBuildOptions(
    resolver: WaMediaMessageOptions['linkPreviewResolver']
): WaMediaMessageOptions {
    return {
        logger: createNoopLogger(),
        mediaTransfer: undefined as unknown as WaMediaTransferClient,
        queryWithContext: async () => ({ tag: 'noop', attrs: {} }),
        getMediaConnCache: () => null,
        setMediaConnCache: () => {},
        linkPreviewResolver: resolver
    }
}

test('buildMediaMessageContent falls back to plain extendedTextMessage when resolver throws', async () => {
    const result = await buildMediaMessageContent(
        makeBuildOptions(() => {
            throw new Error('resolver crashed')
        }),
        { type: 'text', text: 'see https://example.com' }
    )
    assert.deepEqual(result, {
        message: { extendedTextMessage: { text: 'see https://example.com' } }
    })
})

test('buildMediaMessageContent uses resolver output when it returns a preview', async () => {
    const result = await buildMediaMessageContent(
        makeBuildOptions(async () => ({
            resolved: {
                matchedText: 'https://example.com',
                title: 'Resolved',
                previewType: proto.Message.ExtendedTextMessage.PreviewType.NONE
            },
            thumbnailFields: {}
        })),
        { type: 'text', text: 'see https://example.com' }
    )
    assert.equal(result.message.extendedTextMessage?.title, 'Resolved')
    assert.equal(result.message.extendedTextMessage?.matchedText, 'https://example.com')
})
