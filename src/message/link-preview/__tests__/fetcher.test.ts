import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'

import { createNoopLogger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import { createDefaultLinkPreviewFetcher } from '@message/link-preview/fetcher'
import { proto } from '@proto'
import { TEXT_ENCODER } from '@util/bytes'

interface MockResponse {
    readonly status: number
    readonly headers?: Readonly<Record<string, string>>
    readonly body?: Uint8Array | string
}

type Handler = (url: URL) => MockResponse

function mockMediaTransfer(handler: Handler): WaMediaTransferClient {
    return {
        async downloadStream(request: { url?: string }) {
            const target = new URL(request.url ?? '')
            const r = handler(target)
            const bodyBytes =
                typeof r.body === 'string'
                    ? TEXT_ENCODER.encode(r.body)
                    : r.body instanceof Uint8Array
                      ? r.body
                      : null
            const body = bodyBytes === null ? null : Readable.from([bodyBytes])
            return {
                url: request.url,
                status: r.status,
                ok: r.status >= 200 && r.status < 300,
                headers: r.headers ?? {},
                body
            }
        }
    } as unknown as WaMediaTransferClient
}

const fullHtml = `<!doctype html>
<html><head>
<title>Title Tag</title>
<meta property="og:title" content="OG Title">
<meta property="og:description" content="OG Description">
<meta property="og:image" content="https://cdn.example.com/img.jpg">
</head><body>...</body></html>`

test('default fetcher parses og:title/og:description and fetches thumbnail', async () => {
    const imageBytes = new Uint8Array([1, 2, 3, 4])
    const transfer = mockMediaTransfer((url) => {
        if (url.hostname === 'example.com') {
            return {
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8' },
                body: fullHtml
            }
        }
        if (url.hostname === 'cdn.example.com') {
            return {
                status: 200,
                headers: { 'content-type': 'image/jpeg' },
                body: imageBytes
            }
        }
        return { status: 404 }
    })
    const fetcher = createDefaultLinkPreviewFetcher({ mediaTransfer: transfer })
    const result = await fetcher.fetch({
        url: new URL('https://example.com'),
        matchedText: 'https://example.com',
        logger: createNoopLogger()
    })
    assert.equal(result?.title, 'OG Title')
    assert.equal(result?.description, 'OG Description')
    assert.equal(result?.previewType, proto.Message.ExtendedTextMessage.PreviewType.NONE)
    assert.equal(result?.matchedText, 'https://example.com')
    assert.ok(result?.thumbnail && 'bytes' in result.thumbnail)
    assert.equal(result.thumbnail.bytes.byteLength, 4)
})

test('default fetcher returns minimal preview on http error', async () => {
    const transfer = mockMediaTransfer(() => ({ status: 500 }))
    const fetcher = createDefaultLinkPreviewFetcher({ mediaTransfer: transfer })
    const result = await fetcher.fetch({
        url: new URL('https://example.com'),
        matchedText: 'https://example.com',
        logger: createNoopLogger()
    })
    assert.equal(result?.matchedText, 'https://example.com')
    assert.equal(result?.title, 'example.com')
    assert.equal(result?.previewType, proto.Message.ExtendedTextMessage.PreviewType.NONE)
    assert.equal(result?.thumbnail, undefined)
})

test('default fetcher sets previewType=VIDEO when og:video present', async () => {
    const transfer = mockMediaTransfer((url) => {
        if (url.pathname === '/img.jpg') {
            return {
                status: 200,
                headers: { 'content-type': 'image/jpeg' },
                body: new Uint8Array([0])
            }
        }
        return {
            status: 200,
            headers: { 'content-type': 'text/html' },
            body: `<html><head>
<meta property="og:title" content="V">
<meta property="og:image" content="https://example.com/img.jpg">
<meta property="og:video" content="https://example.com/v.mp4">
</head></html>`
        }
    })
    const fetcher = createDefaultLinkPreviewFetcher({ mediaTransfer: transfer })
    const result = await fetcher.fetch({
        url: new URL('https://example.com'),
        matchedText: 'https://example.com',
        logger: createNoopLogger()
    })
    assert.equal(result?.previewType, proto.Message.ExtendedTextMessage.PreviewType.VIDEO)
})

test('default fetcher falls back to <title> tag when no og:title', async () => {
    const transfer = mockMediaTransfer(() => ({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><head><title>Bare Title</title></head></html>'
    }))
    const fetcher = createDefaultLinkPreviewFetcher({ mediaTransfer: transfer })
    const result = await fetcher.fetch({
        url: new URL('https://example.com'),
        matchedText: 'https://example.com',
        logger: createNoopLogger()
    })
    assert.equal(result?.title, 'Bare Title')
})

test('default fetcher decodes html entities in title', async () => {
    const transfer = mockMediaTransfer(() => ({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><head><title>Foo &amp; Bar</title></head></html>'
    }))
    const fetcher = createDefaultLinkPreviewFetcher({ mediaTransfer: transfer })
    const result = await fetcher.fetch({
        url: new URL('https://example.com'),
        matchedText: 'https://example.com',
        logger: createNoopLogger()
    })
    assert.equal(result?.title, 'Foo & Bar')
})

test('default fetcher resolves relative og:image against base url', async () => {
    let imageRequested: URL | null = null
    const transfer = mockMediaTransfer((url) => {
        if (url.hostname === 'example.com' && url.pathname === '/img.jpg') {
            imageRequested = url
            return {
                status: 200,
                headers: { 'content-type': 'image/jpeg' },
                body: new Uint8Array([1])
            }
        }
        return {
            status: 200,
            headers: { 'content-type': 'text/html' },
            body: '<html><head><meta property="og:image" content="/img.jpg"></head></html>'
        }
    })
    const fetcher = createDefaultLinkPreviewFetcher({ mediaTransfer: transfer })
    const result = await fetcher.fetch({
        url: new URL('https://example.com/page'),
        matchedText: 'https://example.com/page',
        logger: createNoopLogger()
    })
    assert.ok(result?.thumbnail)
    assert.equal((imageRequested as unknown as URL)?.toString(), 'https://example.com/img.jpg')
})

test('default fetcher accepts png/webp og:image as raw bytes', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const transfer = mockMediaTransfer((url) => {
        if (url.pathname === '/img.png') {
            return {
                status: 200,
                headers: { 'content-type': 'image/png' },
                body: pngBytes
            }
        }
        return {
            status: 200,
            headers: { 'content-type': 'text/html' },
            body: `<html><head>
<meta property="og:title" content="X">
<meta property="og:image" content="https://example.com/img.png">
</head></html>`
        }
    })
    const fetcher = createDefaultLinkPreviewFetcher({ mediaTransfer: transfer })
    const result = await fetcher.fetch({
        url: new URL('https://example.com'),
        matchedText: 'https://example.com',
        logger: createNoopLogger()
    })
    assert.equal(result?.title, 'X')
    assert.ok(result?.thumbnail && 'bytes' in result.thumbnail)
    assert.equal(result.thumbnail.bytes.byteLength, 4)
})

test('default fetcher blocks private host', async () => {
    const transfer = mockMediaTransfer(() => ({ status: 200 }))
    const fetcher = createDefaultLinkPreviewFetcher({ mediaTransfer: transfer })
    const result = await fetcher.fetch({
        url: new URL('http://127.0.0.1'),
        matchedText: 'http://127.0.0.1',
        logger: createNoopLogger()
    })
    assert.equal(result, null)
})

test('default fetcher blocks .localhost subdomains (RFC 6761)', async () => {
    const fetcher = createDefaultLinkPreviewFetcher({
        mediaTransfer: mockMediaTransfer(() => ({ status: 200 }))
    })
    const result = await fetcher.fetch({
        url: new URL('http://internal.localhost/secret'),
        matchedText: 'http://internal.localhost/secret',
        logger: createNoopLogger()
    })
    assert.equal(result, null)
})

test('default fetcher blocks IPv6 link-local addresses without brackets', async () => {
    const fetcher = createDefaultLinkPreviewFetcher({
        mediaTransfer: mockMediaTransfer(() => ({ status: 200 }))
    })
    const result = await fetcher.fetch({
        url: new URL('http://[fe80::1]/'),
        matchedText: 'http://[fe80::1]/',
        logger: createNoopLogger()
    })
    assert.equal(result, null)
})

test('default fetcher blocks IPv6 unique-local (fc00::/7) addresses', async () => {
    const fetcher = createDefaultLinkPreviewFetcher({
        mediaTransfer: mockMediaTransfer(() => ({ status: 200 }))
    })
    const result = await fetcher.fetch({
        url: new URL('http://[fd00::1]/'),
        matchedText: 'http://[fd00::1]/',
        logger: createNoopLogger()
    })
    assert.equal(result, null)
})

test('default fetcher drops thumbnail truncated without content-length', async () => {
    const transfer = mockMediaTransfer((url): MockResponse => {
        if (url.pathname === '/img.jpg') {
            return {
                status: 200,
                headers: { 'content-type': 'image/jpeg' },
                body: new Uint8Array(20_000)
            }
        }
        return {
            status: 200,
            headers: { 'content-type': 'text/html' },
            body: '<html><head><meta property="og:image" content="https://example.com/img.jpg"></head></html>'
        }
    })
    const fetcher = createDefaultLinkPreviewFetcher({
        mediaTransfer: transfer,
        maxThumbnailBytes: 1024
    })
    const result = await fetcher.fetch({
        url: new URL('https://example.com'),
        matchedText: 'https://example.com',
        logger: createNoopLogger()
    })
    assert.equal(result?.thumbnail, undefined)
})

test('default fetcher with allowPrivateHosts permits loopback', async () => {
    const transfer = mockMediaTransfer(() => ({ status: 500 }))
    const fetcher = createDefaultLinkPreviewFetcher({
        mediaTransfer: transfer,
        allowPrivateHosts: true
    })
    const result = await fetcher.fetch({
        url: new URL('http://127.0.0.1'),
        matchedText: 'http://127.0.0.1',
        logger: createNoopLogger()
    })
    assert.equal(result?.title, '127.0.0.1')
})

test('default fetcher caps html bytes', async () => {
    const huge = 'x'.repeat(200_000) + '<title>NeverReached</title>'
    const transfer = mockMediaTransfer(() => ({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: huge
    }))
    const fetcher = createDefaultLinkPreviewFetcher({ mediaTransfer: transfer, maxHtmlBytes: 1024 })
    const result = await fetcher.fetch({
        url: new URL('https://example.com'),
        matchedText: 'https://example.com',
        logger: createNoopLogger()
    })
    assert.notEqual(result?.title, 'NeverReached')
})

test('default fetcher returns stream variant when content-length exceeds inline threshold', async () => {
    const bigBytes = new Uint8Array(80_000)
    const transfer = mockMediaTransfer((url): MockResponse => {
        if (url.pathname === '/img.jpg') {
            return {
                status: 200,
                headers: {
                    'content-type': 'image/jpeg',
                    'content-length': String(bigBytes.byteLength)
                },
                body: bigBytes
            }
        }
        return {
            status: 200,
            headers: { 'content-type': 'text/html' },
            body: `<html><head>
<meta property="og:title" content="Big">
<meta property="og:image" content="https://example.com/img.jpg">
</head></html>`
        }
    })
    const fetcher = createDefaultLinkPreviewFetcher({ mediaTransfer: transfer })
    const result = await fetcher.fetch({
        url: new URL('https://example.com'),
        matchedText: 'https://example.com',
        logger: createNoopLogger()
    })
    assert.ok(result?.thumbnail && 'stream' in result.thumbnail)
    assert.equal(result.thumbnail.contentLength, 80_000)
    result.thumbnail.stream.destroy()
})

test('default fetcher drops thumbnail when content-length exceeds maxThumbnailBytes', async () => {
    const transfer = mockMediaTransfer((url): MockResponse => {
        if (url.pathname === '/img.jpg') {
            return {
                status: 200,
                headers: {
                    'content-type': 'image/jpeg',
                    'content-length': '500000'
                },
                body: new Uint8Array(0)
            }
        }
        return {
            status: 200,
            headers: { 'content-type': 'text/html' },
            body: `<html><head>
<meta property="og:title" content="Huge">
<meta property="og:image" content="https://example.com/img.jpg">
</head></html>`
        }
    })
    const fetcher = createDefaultLinkPreviewFetcher({
        mediaTransfer: transfer,
        maxThumbnailBytes: 262_144
    })
    const result = await fetcher.fetch({
        url: new URL('https://example.com'),
        matchedText: 'https://example.com',
        logger: createNoopLogger()
    })
    assert.equal(result?.thumbnail, undefined)
})

test('default fetcher follows 301 redirects', async () => {
    const transfer = mockMediaTransfer((url): MockResponse => {
        if (url.hostname === 'short.example.com') {
            return {
                status: 301,
                headers: { location: 'https://full.example.com/page' }
            }
        }
        return {
            status: 200,
            headers: { 'content-type': 'text/html' },
            body: '<html><head><title>Redirected</title></head></html>'
        }
    })
    const fetcher = createDefaultLinkPreviewFetcher({ mediaTransfer: transfer })
    const result = await fetcher.fetch({
        url: new URL('https://short.example.com'),
        matchedText: 'https://short.example.com',
        logger: createNoopLogger()
    })
    assert.equal(result?.title, 'Redirected')
})
