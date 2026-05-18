import type { Readable } from 'node:stream'

import type { Logger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import { proto } from '@proto'
import { toProxyAgent } from '@transport/proxy'
import type { WaProxyTransport } from '@transport/types'
import { TEXT_DECODER } from '@util/bytes'
import { parseOptionalInt, toError } from '@util/primitives'

import type {
    WaLinkPreviewFetcher,
    WaLinkPreviewResolved,
    WaLinkPreviewThumbnailInput
} from './types'

const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const DEFAULT_TIMEOUT_MS = 3_000
const DEFAULT_HTML_BYTES = 65_536
const DEFAULT_THUMBNAIL_BYTES = 262_144
const INLINE_THUMBNAIL_MAX_BYTES = 64 * 1024
const MAX_REDIRECTS = 5

export interface DefaultLinkPreviewFetcherOptions {
    readonly mediaTransfer: WaMediaTransferClient
    readonly userAgent?: string
    readonly fetchTimeoutMs?: number
    readonly maxHtmlBytes?: number
    readonly maxThumbnailBytes?: number
    readonly allowPrivateHosts?: boolean
    readonly proxy?: WaProxyTransport
}

export function createDefaultLinkPreviewFetcher(
    options: DefaultLinkPreviewFetcherOptions
): WaLinkPreviewFetcher {
    const userAgent = options.userAgent ?? DEFAULT_USER_AGENT
    const fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxHtmlBytes = options.maxHtmlBytes ?? DEFAULT_HTML_BYTES
    const maxThumbnailBytes = options.maxThumbnailBytes ?? DEFAULT_THUMBNAIL_BYTES
    const allowPrivateHosts = options.allowPrivateHosts === true
    const agent = toProxyAgent(options.proxy)
    const mediaTransfer = options.mediaTransfer
    return {
        async fetch(input) {
            if (!allowPrivateHosts && isPrivateHost(input.url.hostname)) {
                input.logger.warn('link preview blocked: private host', {
                    hostname: input.url.hostname
                })
                return null
            }
            const minimal: WaLinkPreviewResolved = {
                matchedText: input.matchedText,
                title: input.url.hostname,
                previewType: proto.Message.ExtendedTextMessage.PreviewType.NONE
            }
            let html: string
            try {
                html = await fetchHtml(input.url, {
                    mediaTransfer,
                    agent,
                    userAgent,
                    timeoutMs: fetchTimeoutMs,
                    maxBytes: maxHtmlBytes,
                    signal: input.signal,
                    allowPrivateHosts
                })
            } catch (error) {
                input.logger.warn('link preview html fetch failed', {
                    url: input.url.toString(),
                    message: toError(error).message
                })
                return minimal
            }
            if (html.length === 0) return minimal
            const parsed = parseHtmlMeta(html, input.url)
            let thumbnail: WaLinkPreviewThumbnailInput | undefined
            if (parsed.imageUrl !== undefined) {
                const fetched = await fetchThumbnail(parsed.imageUrl, {
                    mediaTransfer,
                    agent,
                    userAgent,
                    timeoutMs: fetchTimeoutMs,
                    maxBytes: maxThumbnailBytes,
                    allowPrivateHosts,
                    signal: input.signal,
                    logger: input.logger
                })
                if (fetched !== undefined) {
                    thumbnail = {
                        ...fetched,
                        ...(parsed.imageWidth !== undefined ? { width: parsed.imageWidth } : {}),
                        ...(parsed.imageHeight !== undefined ? { height: parsed.imageHeight } : {})
                    }
                }
            }
            return {
                matchedText: input.matchedText,
                title: parsed.title ?? input.url.hostname,
                previewType: parsed.hasVideo
                    ? proto.Message.ExtendedTextMessage.PreviewType.VIDEO
                    : proto.Message.ExtendedTextMessage.PreviewType.NONE,
                ...(parsed.description !== undefined ? { description: parsed.description } : {}),
                ...(thumbnail !== undefined ? { thumbnail } : {})
            }
        }
    }
}

interface ParsedMeta {
    readonly title?: string
    readonly description?: string
    readonly imageUrl?: string
    readonly imageWidth?: number
    readonly imageHeight?: number
    readonly hasVideo: boolean
}

function parseHtmlMeta(html: string, base: URL): ParsedMeta {
    const head = extractHeadSection(html)
    const ogTitle = extractMetaContent(head, 'property', 'og:title')
    const twitterTitle = extractMetaContent(head, 'name', 'twitter:title')
    const titleTag = extractTitleTag(head)
    const ogDesc = extractMetaContent(head, 'property', 'og:description')
    const twitterDesc = extractMetaContent(head, 'name', 'twitter:description')
    const metaDesc = extractMetaContent(head, 'name', 'description')
    const ogImage =
        extractMetaContent(head, 'property', 'og:image:secure_url') ??
        extractMetaContent(head, 'property', 'og:image:url') ??
        extractMetaContent(head, 'property', 'og:image') ??
        extractMetaContent(head, 'name', 'twitter:image')
    const ogImageWidth = parseOptionalInt(extractMetaContent(head, 'property', 'og:image:width'))
    const ogImageHeight = parseOptionalInt(extractMetaContent(head, 'property', 'og:image:height'))
    const ogVideo =
        extractMetaContent(head, 'property', 'og:video:secure_url') ??
        extractMetaContent(head, 'property', 'og:video:url') ??
        extractMetaContent(head, 'property', 'og:video')

    return {
        title: cleanText(ogTitle ?? twitterTitle ?? titleTag),
        description: cleanText(ogDesc ?? twitterDesc ?? metaDesc),
        imageUrl: ogImage ? toAbsoluteUrl(ogImage, base) : undefined,
        imageWidth: ogImageWidth,
        imageHeight: ogImageHeight,
        hasVideo: ogVideo !== undefined
    }
}

function extractHeadSection(html: string): string {
    const closeIdx = html.search(/<\/head\s*>/i)
    if (closeIdx === -1) return html
    return html.slice(0, closeIdx)
}

function extractMetaContent(
    html: string,
    attr: 'property' | 'name',
    key: string
): string | undefined {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re1 = new RegExp(
        `<meta\\b[^>]*?\\b${attr}\\s*=\\s*["']${escaped}["'][^>]*?\\bcontent\\s*=\\s*["']([^"']*)["']`,
        'i'
    )
    const re2 = new RegExp(
        `<meta\\b[^>]*?\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*?\\b${attr}\\s*=\\s*["']${escaped}["']`,
        'i'
    )
    const m = re1.exec(html) ?? re2.exec(html)
    return m?.[1]
}

function extractTitleTag(html: string): string | undefined {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
    return m?.[1]
}

function cleanText(s: string | undefined): string | undefined {
    if (s === undefined) return undefined
    const decoded = decodeHtmlEntities(s.replace(/\s+/g, ' ').trim())
    return decoded.length === 0 ? undefined : decoded
}

function decodeHtmlEntities(s: string): string {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n: string) => safeCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
        .replace(/&amp;/g, '&')
}

function safeCodePoint(cp: number): string {
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return ''
    return String.fromCodePoint(cp)
}

function toAbsoluteUrl(raw: string, base: URL): string | undefined {
    try {
        return new URL(raw, base).toString()
    } catch {
        return undefined
    }
}

interface FetchHtmlInput {
    readonly mediaTransfer: WaMediaTransferClient
    readonly agent: ReturnType<typeof toProxyAgent>
    readonly userAgent: string
    readonly timeoutMs: number
    readonly maxBytes: number
    readonly signal?: AbortSignal
    readonly allowPrivateHosts: boolean
}

async function fetchHtml(url: URL, opts: FetchHtmlInput): Promise<string> {
    const result = await httpGetWithRedirects({
        url,
        mediaTransfer: opts.mediaTransfer,
        agent: opts.agent,
        userAgent: opts.userAgent,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        timeoutMs: opts.timeoutMs,
        maxBytes: opts.maxBytes,
        signal: opts.signal,
        allowPrivateHosts: opts.allowPrivateHosts
    })
    if (result.status < 200 || result.status >= 300) {
        throw new Error(`http ${result.status}`)
    }
    if (!/text\/html|application\/xhtml/i.test(result.contentType)) {
        return ''
    }
    // HTML truncation is tolerable: the regex meta parser only needs the
    // <head> section, which fits well below maxHtmlBytes for realistic pages.
    return TEXT_DECODER.decode(result.bytes)
}

interface FetchThumbnailInput {
    readonly mediaTransfer: WaMediaTransferClient
    readonly agent: ReturnType<typeof toProxyAgent>
    readonly userAgent: string
    readonly timeoutMs: number
    readonly maxBytes: number
    readonly allowPrivateHosts: boolean
    readonly signal?: AbortSignal
    readonly logger: Logger
}

async function fetchThumbnail(
    url: string,
    opts: FetchThumbnailInput
): Promise<WaLinkPreviewThumbnailInput | undefined> {
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return undefined
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    if (!opts.allowPrivateHosts && isPrivateHost(parsed.hostname)) {
        opts.logger.warn('link preview thumbnail blocked: private host', {
            hostname: parsed.hostname
        })
        return undefined
    }
    try {
        const streamResult = await httpGetStreamWithRedirects({
            url: parsed,
            mediaTransfer: opts.mediaTransfer,
            agent: opts.agent,
            userAgent: opts.userAgent,
            accept: 'image/jpeg,image/*;q=0.8',
            timeoutMs: opts.timeoutMs,
            signal: opts.signal,
            allowPrivateHosts: opts.allowPrivateHosts
        })
        if (streamResult.status < 200 || streamResult.status >= 300) {
            streamResult.body?.destroy()
            return undefined
        }
        if (!/^image\//i.test(streamResult.contentType)) {
            streamResult.body?.destroy()
            return undefined
        }
        if (!streamResult.body) return undefined
        if (
            streamResult.contentLength !== undefined &&
            streamResult.contentLength > opts.maxBytes
        ) {
            streamResult.body.destroy()
            return undefined
        }
        if (
            streamResult.contentLength !== undefined &&
            streamResult.contentLength > INLINE_THUMBNAIL_MAX_BYTES
        ) {
            return { stream: streamResult.body, contentLength: streamResult.contentLength }
        }
        const capped = await readBodyCapped(streamResult.body, opts.maxBytes)
        if (capped.bytes.byteLength === 0) return undefined
        // If we capped without knowing the real size, the bytes are an
        // arbitrary prefix of the original image (corrupt JPEG/PNG). Drop it.
        if (capped.truncated && streamResult.contentLength === undefined) {
            opts.logger.warn('link preview thumbnail dropped: truncated without content-length', {
                url: parsed.toString()
            })
            return undefined
        }
        return { bytes: capped.bytes }
    } catch (error) {
        opts.logger.warn('link preview thumbnail fetch failed', {
            url: parsed.toString(),
            message: toError(error).message
        })
        return undefined
    }
}

interface HttpGetWithRedirectsInput {
    readonly url: URL
    readonly mediaTransfer: WaMediaTransferClient
    readonly agent: ReturnType<typeof toProxyAgent>
    readonly userAgent: string
    readonly accept: string
    readonly timeoutMs: number
    readonly maxBytes: number
    readonly signal?: AbortSignal
    readonly allowPrivateHosts: boolean
}

interface HttpGetResult {
    readonly status: number
    readonly contentType: string
    readonly bytes: Uint8Array
}

async function httpGetWithRedirects(opts: HttpGetWithRedirectsInput): Promise<HttpGetResult> {
    const streamResult = await httpGetStreamWithRedirects({
        url: opts.url,
        mediaTransfer: opts.mediaTransfer,
        agent: opts.agent,
        userAgent: opts.userAgent,
        accept: opts.accept,
        timeoutMs: opts.timeoutMs,
        signal: opts.signal,
        allowPrivateHosts: opts.allowPrivateHosts
    })
    const capped = await readBodyCapped(streamResult.body, opts.maxBytes)
    return {
        status: streamResult.status,
        contentType: streamResult.contentType,
        bytes: capped.bytes
    }
}

interface HttpGetStreamInput {
    readonly url: URL
    readonly mediaTransfer: WaMediaTransferClient
    readonly agent: ReturnType<typeof toProxyAgent>
    readonly userAgent: string
    readonly accept: string
    readonly timeoutMs: number
    readonly signal?: AbortSignal
    readonly allowPrivateHosts: boolean
}

interface HttpGetStreamResult {
    readonly status: number
    readonly contentType: string
    readonly contentLength: number | undefined
    readonly body: Readable | null
}

async function httpGetStreamWithRedirects(opts: HttpGetStreamInput): Promise<HttpGetStreamResult> {
    let currentUrl = opts.url
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
        if (!opts.allowPrivateHosts && isPrivateHost(currentUrl.hostname)) {
            throw new Error(`redirect to private host blocked: ${currentUrl.hostname}`)
        }
        const response = await opts.mediaTransfer.downloadStream({
            url: currentUrl.toString(),
            agent: opts.agent,
            headers: {
                'user-agent': opts.userAgent,
                accept: opts.accept
            },
            timeoutMs: opts.timeoutMs,
            signal: opts.signal
        })
        const contentType = response.headers['content-type'] ?? ''
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers['location']
            response.body?.destroy()
            if (typeof location !== 'string' || location.length === 0) {
                return {
                    status: response.status,
                    contentType,
                    contentLength: undefined,
                    body: null
                }
            }
            try {
                currentUrl = new URL(location, currentUrl)
            } catch {
                return {
                    status: response.status,
                    contentType,
                    contentLength: undefined,
                    body: null
                }
            }
            continue
        }
        const contentLengthHeader = response.headers['content-length']
        const contentLength = parseOptionalInt(contentLengthHeader)
        return {
            status: response.status,
            contentType,
            contentLength,
            body: response.body
        }
    }
    throw new Error(`too many redirects (>${MAX_REDIRECTS})`)
}

interface CappedReadResult {
    readonly bytes: Uint8Array
    readonly truncated: boolean
}

async function readBodyCapped(body: Readable | null, maxBytes: number): Promise<CappedReadResult> {
    if (!body) return { bytes: new Uint8Array(0), truncated: false }
    const chunks: Uint8Array[] = []
    let total = 0
    let truncated = false
    try {
        for await (const chunk of body) {
            const view = chunk as Uint8Array
            const room = maxBytes - total
            if (room <= 0) {
                truncated = true
                break
            }
            if (view.byteLength <= room) {
                chunks.push(view)
                total += view.byteLength
            } else {
                chunks.push(view.subarray(0, room))
                total = maxBytes
                truncated = true
                break
            }
        }
    } finally {
        body.destroy()
    }
    const out = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
        out.set(chunk, offset)
        offset += chunk.byteLength
    }
    return { bytes: out, truncated }
}

const PRIVATE_IPV4 = [
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^0\./
]

function isPrivateHost(hostname: string): boolean {
    const lower = hostname.toLowerCase()
    // RFC 6761 §6.3: any name in the .localhost domain resolves to loopback.
    if (lower === 'localhost' || lower.endsWith('.localhost')) return true
    // URL.hostname strips brackets for IPv6, but tolerate either form.
    const bare = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower
    if (bare === '::1' || bare === '0:0:0:0:0:0:0:1' || bare === '::') return true
    if (bare.startsWith('::ffff:')) {
        return isPrivateHost(bare.slice('::ffff:'.length))
    }
    if (PRIVATE_IPV4.some((re) => re.test(bare))) return true
    // IPv6: presence of ':' indicates an address. Match link-local (fe80::/10)
    // and unique-local (fc00::/7) prefixes.
    if (bare.includes(':')) {
        if (bare.startsWith('fc') || bare.startsWith('fd')) return true
        if (
            bare.startsWith('fe8') ||
            bare.startsWith('fe9') ||
            bare.startsWith('fea') ||
            bare.startsWith('feb')
        ) {
            return true
        }
    }
    return false
}
