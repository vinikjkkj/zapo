import type { Readable } from 'node:stream'

import type { Logger } from '@infra/log/types'
import type { proto } from '@proto'
import type { WaProxyTransport } from '@transport/types'

export type WaLinkPreviewType = proto.Message.ExtendedTextMessage.PreviewType

export interface WaLinkPreviewThumbnailBytes {
    readonly bytes: Uint8Array
    readonly width?: number
    readonly height?: number
}

export interface WaLinkPreviewThumbnailStream {
    readonly stream: Readable
    readonly contentLength: number
    readonly width?: number
    readonly height?: number
}

export type WaLinkPreviewThumbnailInput = WaLinkPreviewThumbnailBytes | WaLinkPreviewThumbnailStream

export interface WaLinkPreviewOverride {
    readonly matchedText?: string
    readonly title?: string
    readonly description?: string
    readonly previewType?: WaLinkPreviewType
    readonly thumbnail?: WaLinkPreviewThumbnailInput
}

export interface WaLinkPreviewResolved {
    readonly matchedText: string
    readonly title?: string
    readonly description?: string
    readonly previewType: WaLinkPreviewType
    readonly thumbnail?: WaLinkPreviewThumbnailInput
}

export interface WaLinkPreviewFetchInput {
    readonly url: URL
    readonly matchedText: string
    readonly logger: Logger
    readonly signal?: AbortSignal
}

export interface WaLinkPreviewFetcher {
    fetch(input: WaLinkPreviewFetchInput): Promise<WaLinkPreviewResolved | null>
}

export interface WaLinkPreviewOptions {
    readonly enabled?: boolean
    readonly fetchTimeoutMs?: number
    readonly uploadHqThumbnail?: boolean
    readonly allowPrivateHosts?: boolean
    readonly maxHtmlBytes?: number
    readonly maxThumbnailBytes?: number
    readonly userAgent?: string
    readonly proxy?: WaProxyTransport
    readonly fetcher?: WaLinkPreviewFetcher
}
