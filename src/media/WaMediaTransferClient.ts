import { Readable } from 'node:stream'

import type { Logger } from '../infra/log/types'
import { WA_DEFAULTS } from '../protocol/constants'
import { toBufferChunk } from '../util/bytes'
import { toError } from '../util/primitives'

import { DEFAULT_MEDIA_HOSTS } from './constants'
import type { MediaCryptoType, WaMediaTransferClientOptions } from './types'
import { WaMediaCrypto } from './WaMediaCrypto'

const EMPTY_BYTES = new Uint8Array(0)

interface StreamDownloadRequest {
    readonly url?: string
    readonly directPath?: string
    readonly hosts?: readonly string[]
    readonly headers?: Readonly<Record<string, string>>
    readonly timeoutMs?: number
    readonly signal?: AbortSignal
}

interface StreamUploadRequest extends StreamDownloadRequest {
    readonly method?: 'POST' | 'PUT'
    readonly body: Uint8Array | Readable
    readonly contentLength?: number
    readonly contentType?: string
}

interface StreamTransferResponse {
    readonly url: string
    readonly status: number
    readonly ok: boolean
    readonly headers: Readonly<Record<string, string>>
    readonly body: Readable | null
}

interface EncryptedUploadRequest extends StreamDownloadRequest {
    readonly mediaType: MediaCryptoType
    readonly method?: 'POST' | 'PUT'
    readonly plaintext: Uint8Array | Readable
    readonly mediaKey?: Uint8Array
    readonly contentLength?: number
    readonly contentType?: string
}

interface EncryptedUploadResult {
    readonly transfer: StreamTransferResponse
    readonly mediaKey: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
}

interface EncryptedDownloadRequest extends StreamDownloadRequest {
    readonly mediaType: MediaCryptoType
    readonly mediaKey: Uint8Array
    readonly fileSha256?: Uint8Array
    readonly fileEncSha256?: Uint8Array
}

interface EncryptedDownloadStream {
    readonly plaintext: Readable
    readonly metadata: Promise<{
        readonly fileSha256: Uint8Array
        readonly fileEncSha256: Uint8Array
    }>
}

interface ResolvedTransferRequest {
    readonly urls: readonly string[]
    readonly headers: Record<string, string>
    readonly timeoutMs: number
}

interface PreparedEncryptedUpload {
    readonly body: Uint8Array | Readable
    readonly contentLength: number | undefined
    readonly metadata: Promise<{
        readonly fileSha256: Uint8Array
        readonly fileEncSha256: Uint8Array
    }>
    cleanup(error: Error): Promise<void>
}

interface AbortContext {
    readonly signal: AbortSignal
    cleanup(): void
}

export class WaMediaTransferClient {
    private readonly logger?: Logger
    private readonly defaultHosts: readonly string[]
    private readonly defaultTimeoutMs: number
    private readonly defaultHeaders: Readonly<Record<string, string>>

    public constructor(options: WaMediaTransferClientOptions = {}) {
        this.logger = options.logger
        this.defaultHosts = options.defaultHosts ?? DEFAULT_MEDIA_HOSTS
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? WA_DEFAULTS.MEDIA_TIMEOUT_MS
        this.defaultHeaders = options.defaultHeaders ?? {}
    }

    public async downloadStream(
        request: StreamDownloadRequest
    ): Promise<StreamTransferResponse> {
        const { urls, headers, timeoutMs } = this.resolveTransferRequest(request)
        this.logger?.debug('media download stream start', {
            urls: urls.length,
            timeoutMs
        })
        return this.executeTransfer(urls, timeoutMs, request.signal, {
            responseLog: 'media download stream response',
            send: (url, signal) =>
                fetch(url, {
                    method: 'GET',
                    headers,
                    signal
                })
        })
    }

    public async downloadBytes(request: StreamDownloadRequest): Promise<Uint8Array> {
        const response = await this.downloadStream(request)
        await this.assertSuccessfulResponse(response)
        if (!response.body) {
            return EMPTY_BYTES
        }
        return this.readAll(response.body)
    }

    public async uploadStream(request: StreamUploadRequest): Promise<StreamTransferResponse> {
        const bodyIsBytes = request.body instanceof Uint8Array
        const { urls, headers, timeoutMs } = this.resolveTransferRequest(request, {
            'content-type': request.contentType,
            'content-length':
                request.contentLength !== null && request.contentLength !== undefined
                    ? String(request.contentLength)
                    : undefined
        })
        const uploadUrls = bodyIsBytes ? urls : urls.slice(0, 1)
        if (!bodyIsBytes && urls.length > 1) {
            this.logger?.warn('upload stream fallback disabled for non-replayable body', {
                attemptedHosts: urls.length
            })
        }

        const method = request.method ?? 'POST'
        this.logger?.debug('media upload stream start', {
            urls: uploadUrls.length,
            timeoutMs,
            method
        })
        return this.executeTransfer(uploadUrls, timeoutMs, request.signal, {
            responseLog: 'media upload stream response',
            send: async (url, signal) => {
                if (bodyIsBytes) {
                    return fetch(url, {
                        method,
                        headers,
                        signal,
                        body: request.body
                    })
                }

                return fetch(url, {
                    method,
                    headers,
                    signal,
                    body: request.body as unknown as never,
                    duplex: 'half'
                } as RequestInit)
            }
        })
    }

    public async uploadEncrypted(
        request: EncryptedUploadRequest
    ): Promise<EncryptedUploadResult> {
        this.logger?.info('media encrypted upload start', {
            mediaType: request.mediaType
        })
        const mediaKey = request.mediaKey ?? (await WaMediaCrypto.generateMediaKey())
        const prepared = await this.prepareEncryptedUpload(request, mediaKey)

        let transfer: StreamTransferResponse
        try {
            transfer = await this.uploadStream({
                url: request.url,
                directPath: request.directPath,
                hosts: request.hosts,
                headers: request.headers,
                timeoutMs: request.timeoutMs,
                signal: request.signal,
                method: request.method,
                body: prepared.body,
                contentLength: prepared.contentLength,
                contentType: request.contentType
            })
        } catch (error) {
            await prepared.cleanup(toError(error))
            throw error
        }

        const metadata = await prepared.metadata
        this.logger?.info('media encrypted upload completed', {
            status: transfer.status
        })
        return {
            transfer,
            mediaKey,
            fileSha256: metadata.fileSha256,
            fileEncSha256: metadata.fileEncSha256
        }
    }

    public async downloadAndDecrypt(request: EncryptedDownloadRequest): Promise<Uint8Array> {
        this.logger?.info('media encrypted download start', {
            mediaType: request.mediaType
        })
        const decrypted = await this.downloadAndDecryptStream(request)
        try {
            const plaintext = await this.readAll(decrypted.plaintext)
            await decrypted.metadata
            this.logger?.info('media encrypted download completed', {
                byteLength: plaintext.byteLength
            })
            return plaintext
        } catch (error) {
            decrypted.plaintext.destroy(toError(error))
            throw error
        }
    }

    public async downloadAndDecryptStream(
        request: EncryptedDownloadRequest
    ): Promise<EncryptedDownloadStream> {
        const response = await this.downloadStream(request)
        await this.assertSuccessfulResponse(response)
        const body = this.requireResponseBody(response)

        const decrypted = await WaMediaCrypto.decryptReadable(body, {
            mediaType: request.mediaType,
            mediaKey: request.mediaKey,
            expectedFileSha256: request.fileSha256,
            expectedFileEncSha256: request.fileEncSha256
        })
        decrypted.metadata.catch(() => undefined)
        this.logger?.debug('media encrypted download stream ready', {
            mediaType: request.mediaType
        })
        return {
            plaintext: decrypted.plaintext,
            metadata: decrypted.metadata
        }
    }

    public async readResponseBytes(response: StreamTransferResponse): Promise<Uint8Array> {
        if (!response.body) {
            return EMPTY_BYTES
        }
        return this.readAll(response.body)
    }

    private resolveTransferRequest(
        request: Pick<
            StreamDownloadRequest,
            'url' | 'directPath' | 'hosts' | 'headers' | 'timeoutMs'
        >,
        extraHeaders?: Readonly<Record<string, string | undefined>>
    ): ResolvedTransferRequest {
        const headers = this.mergeHeaders(request.headers)
        for (const [key, value] of Object.entries(extraHeaders ?? {})) {
            if (value !== undefined) {
                headers[key.toLowerCase()] = value
            }
        }

        return {
            urls: this.resolveUrls(request.url, request.directPath, request.hosts),
            headers,
            timeoutMs: request.timeoutMs ?? this.defaultTimeoutMs
        }
    }

    private async executeTransfer(
        urls: readonly string[],
        timeoutMs: number,
        signal: AbortSignal | undefined,
        options: {
            readonly responseLog: string
            readonly send: (url: string, signal: AbortSignal) => Promise<Response>
        }
    ): Promise<StreamTransferResponse> {
        const result = await this.fetchWithFallback(urls, timeoutMs, signal, options.send)
        this.logger?.trace(options.responseLog, {
            url: result.url,
            status: result.response.status
        })
        return this.toResponse(result.url, result.response)
    }

    private async prepareEncryptedUpload(
        request: EncryptedUploadRequest,
        mediaKey: Uint8Array
    ): Promise<PreparedEncryptedUpload> {
        if (request.plaintext instanceof Uint8Array) {
            const encrypted = await WaMediaCrypto.encryptBytes(
                request.mediaType,
                mediaKey,
                request.plaintext
            )
            return {
                body: encrypted.ciphertextHmac,
                contentLength: encrypted.ciphertextHmac.byteLength,
                metadata: Promise.resolve({
                    fileSha256: encrypted.fileSha256,
                    fileEncSha256: encrypted.fileEncSha256
                }),
                cleanup: async () => undefined
            }
        }

        const prepared = await WaMediaCrypto.encryptReadable(
            request.mediaType,
            mediaKey,
            request.plaintext
        )
        return {
            body: prepared.encrypted,
            contentLength:
                request.contentLength !== null && request.contentLength !== undefined
                    ? WaMediaCrypto.encryptedLength(request.contentLength)
                    : undefined,
            metadata: prepared.metadata,
            cleanup: async (error) => {
                prepared.encrypted.destroy(error)
                await prepared.metadata.catch(() => undefined)
            }
        }
    }

    private async assertSuccessfulResponse(response: StreamTransferResponse): Promise<void> {
        if (response.ok) {
            return
        }
        await this.drainBody(response.body)
        throw new Error(`download failed with status ${response.status} for ${response.url}`)
    }

    private requireResponseBody(response: StreamTransferResponse): Readable {
        if (response.body) {
            return response.body
        }
        throw new Error(`download response body is empty for ${response.url}`)
    }

    private resolveUrls(
        url: string | undefined,
        directPath: string | undefined,
        hosts: readonly string[] | undefined
    ): readonly string[] {
        const resolved: string[] = []
        if (url) {
            resolved.push(url)
        }
        if (directPath) {
            if (directPath.startsWith('https://') || directPath.startsWith('http://')) {
                resolved.push(directPath)
            } else {
                const normalizedPath = directPath.startsWith('/') ? directPath : `/${directPath}`
                for (const host of hosts ?? this.defaultHosts) {
                    resolved.push(`https://${host}${normalizedPath}`)
                }
            }
        }
        if (resolved.length === 0) {
            throw new Error('missing transfer url/directPath')
        }

        return Array.from(new Set(resolved))
    }

    private mergeHeaders(
        headers: Readonly<Record<string, string>> | undefined
    ): Record<string, string> {
        const merged: Record<string, string> = {}
        for (const [key, value] of Object.entries(this.defaultHeaders)) {
            merged[key.toLowerCase()] = value
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
            merged[key.toLowerCase()] = value
        }
        return merged
    }

    private async fetchWithFallback(
        urls: readonly string[],
        timeoutMs: number,
        signal: AbortSignal | undefined,
        send: (url: string, signal: AbortSignal) => Promise<Response>
    ): Promise<{ readonly url: string; readonly response: Response }> {
        let lastError: Error | null = null

        for (let index = 0; index < urls.length; index += 1) {
            const url = urls[index]
            const abort = this.createAbortContext(timeoutMs, signal)
            try {
                const response = await send(url, abort.signal)
                const shouldFallback = response.status >= 500 && index < urls.length - 1
                if (!shouldFallback) {
                    return { url, response }
                }
                await this.cancelWebBody(response.body)
                this.logger?.warn('transfer fallback to next host', {
                    url,
                    status: response.status
                })
            } catch (error) {
                const normalized = toError(error)
                lastError = normalized
                if (abort.signal.aborted && signal?.aborted) {
                    throw normalized
                }
                if (index === urls.length - 1) {
                    throw normalized
                }
                this.logger?.warn('transfer host failed, trying next host', {
                    url,
                    message: normalized.message
                })
            } finally {
                abort.cleanup()
            }
        }

        throw lastError ?? new Error('transfer failed')
    }

    private createAbortContext(
        timeoutMs: number,
        externalSignal: AbortSignal | undefined
    ): AbortContext {
        const controller = new AbortController()
        const timer = setTimeout(() => {
            controller.abort(new Error(`transfer timed out after ${timeoutMs}ms`))
        }, timeoutMs)
        timer.unref?.()

        let onExternalAbort: (() => void) | null = null
        if (externalSignal) {
            onExternalAbort = () => controller.abort(externalSignal.reason)
            if (externalSignal.aborted) {
                onExternalAbort()
            } else {
                externalSignal.addEventListener('abort', onExternalAbort, { once: true })
            }
        }

        return {
            signal: controller.signal,
            cleanup: () => {
                clearTimeout(timer)
                if (externalSignal && onExternalAbort) {
                    externalSignal.removeEventListener('abort', onExternalAbort)
                }
            }
        }
    }

    private toResponse(url: string, response: Response): StreamTransferResponse {
        return {
            url,
            status: response.status,
            ok: response.ok,
            headers: this.headersToRecord(response.headers),
            body: response.body
                ? Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>)
                : null
        }
    }

    private headersToRecord(headers: Headers): Readonly<Record<string, string>> {
        const output: Record<string, string> = {}
        for (const [key, value] of headers.entries()) {
            output[key] = value
        }
        return output
    }

    private async cancelWebBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
        if (!body) {
            return
        }
        try {
            await body.cancel()
        } catch {
            // ignore cancel errors from remote resets
        }
    }

    private async drainBody(body: Readable | null): Promise<void> {
        if (!body) {
            return
        }
        try {
            for await (const chunk of body) {
                void chunk
            }
        } catch {
            // ignore drain errors
        }
    }

    private async readAll(body: Readable): Promise<Uint8Array> {
        const chunks: Uint8Array[] = []
        let total = 0
        for await (const chunk of body) {
            const bytes = toBufferChunk(chunk)
            chunks.push(bytes)
            total += bytes.byteLength
        }

        if (total === 0) {
            return EMPTY_BYTES
        }
        if (chunks.length === 1) {
            return chunks[0]
        }
        const merged = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) {
            merged.set(chunk, offset)
            offset += chunk.byteLength
        }
        this.logger?.trace('media readAll merged chunks', { total, chunks: chunks.length })
        return merged
    }
}
