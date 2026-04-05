import http from 'node:http'
import https from 'node:https'
import type { Readable } from 'node:stream'

import type { Logger } from '@infra/log/types'
import { DEFAULT_MEDIA_HOSTS } from '@media/constants'
import type {
    MediaCryptoType,
    WaMediaReadableDecryptionResult,
    WaMediaTransferClientOptions
} from '@media/types'
import { WaMediaCrypto } from '@media/WaMediaCrypto'
import { WA_DEFAULTS } from '@protocol/constants'
import type { WaProxyAgent } from '@transport/types'
import { EMPTY_BYTES, readAllBytes } from '@util/bytes'
import { toError } from '@util/primitives'

interface StreamDownloadRequest {
    readonly url?: string
    readonly directPath?: string
    readonly hosts?: readonly string[]
    readonly headers?: Readonly<Record<string, string>>
    readonly agent?: WaMediaTransferClientOptions['defaultDownloadAgent']
    readonly timeoutMs?: number
    readonly signal?: AbortSignal
    readonly maxBytes?: number
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

interface TransferRequestInit {
    readonly method?: string
    readonly headers?: Readonly<Record<string, string>>
    readonly body?: Uint8Array | Readable
    readonly signal?: AbortSignal
}

interface InternalTransferResponse {
    readonly status: number
    readonly ok: boolean
    readonly headers: Readonly<Record<string, string>>
    readonly body: Readable | null
    cancel(): Promise<void>
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
    readonly plaintextLength: number
}

interface EncryptedDownloadRequest extends StreamDownloadRequest {
    readonly mediaType: MediaCryptoType
    readonly mediaKey: Uint8Array
    readonly fileSha256?: Uint8Array
    readonly fileEncSha256?: Uint8Array
}

function normalizeHeaderRecord(
    headers: Readonly<Record<string, string>> | undefined
): Readonly<Record<string, string>> {
    if (!headers) {
        return {}
    }
    const normalized: Record<string, string> = {}
    for (const key in headers) {
        normalized[key.toLowerCase()] = headers[key]
    }
    return normalized
}

export class WaMediaTransferClient {
    private readonly logger?: Logger
    private readonly defaultHosts: readonly string[]
    private readonly defaultTimeoutMs: number
    private readonly defaultMaxReadBytes: number | undefined
    private readonly defaultHeaders: Readonly<Record<string, string>>
    private readonly defaultUploadAgent: WaMediaTransferClientOptions['defaultUploadAgent']
    private readonly defaultDownloadAgent: WaMediaTransferClientOptions['defaultDownloadAgent']

    public constructor(options: WaMediaTransferClientOptions = {}) {
        this.logger = options.logger
        this.defaultHosts = options.defaultHosts ?? DEFAULT_MEDIA_HOSTS
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? WA_DEFAULTS.MEDIA_TIMEOUT_MS
        this.defaultMaxReadBytes = options.defaultMaxReadBytes
        this.defaultHeaders = normalizeHeaderRecord(options.defaultHeaders)
        this.defaultUploadAgent = options.defaultUploadAgent
        this.defaultDownloadAgent = options.defaultDownloadAgent
    }

    public async downloadStream(request: StreamDownloadRequest): Promise<StreamTransferResponse> {
        const { urls, headers, timeoutMs } = this.resolveTransferRequest(request)
        const agent = request.agent ?? this.defaultDownloadAgent
        this.logger?.debug('media download stream start', {
            urls: urls.length,
            timeoutMs
        })
        const result = await this.fetchWithFallback(
            urls,
            timeoutMs,
            request.signal,
            (url, signal) => this.httpRequest(url, { method: 'GET', headers, signal }, agent)
        )
        this.logger?.trace('media download stream response', {
            url: result.url,
            status: result.status
        })
        return result
    }

    public async downloadBytes(request: StreamDownloadRequest): Promise<Uint8Array> {
        const response = await this.downloadStream(request)
        await this.assertSuccessfulResponse(response)
        if (!response.body) {
            return EMPTY_BYTES
        }
        return readAllBytes(response.body, {
            maxBytes: request.maxBytes ?? this.defaultMaxReadBytes
        })
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
        const agent = request.agent ?? this.defaultUploadAgent
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
        const result = await this.fetchWithFallback(
            uploadUrls,
            timeoutMs,
            request.signal,
            (url, signal) =>
                this.httpRequest(url, { method, headers, signal, body: request.body }, agent)
        )
        this.logger?.trace('media upload stream response', {
            url: result.url,
            status: result.status
        })
        return result
    }

    public async uploadEncrypted(request: EncryptedUploadRequest): Promise<EncryptedUploadResult> {
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
                agent: request.agent,
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
            fileEncSha256: metadata.fileEncSha256,
            plaintextLength: metadata.plaintextLength
        }
    }

    public async downloadAndDecrypt(request: EncryptedDownloadRequest): Promise<Uint8Array> {
        this.logger?.info('media encrypted download start', {
            mediaType: request.mediaType
        })
        const decrypted = await this.downloadAndDecryptStream(request)
        try {
            const [plaintext] = await Promise.all([
                readAllBytes(decrypted.plaintext, {
                    maxBytes: request.maxBytes ?? this.defaultMaxReadBytes
                }),
                decrypted.metadata
            ])
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
    ): Promise<WaMediaReadableDecryptionResult> {
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

    public async readResponseBytes(
        response: StreamTransferResponse,
        maxBytes?: number
    ): Promise<Uint8Array> {
        if (!response.body) {
            return EMPTY_BYTES
        }
        return readAllBytes(response.body, { maxBytes: maxBytes ?? this.defaultMaxReadBytes })
    }

    private async httpRequest(
        url: string,
        init: TransferRequestInit,
        agent: WaProxyAgent | undefined
    ): Promise<InternalTransferResponse> {
        const parsed = new URL(url)
        const transport = parsed.protocol === 'https:' ? https : http
        return new Promise<InternalTransferResponse>((resolve, reject) => {
            const req = transport.request(
                url,
                {
                    method: init.method ?? 'GET',
                    headers: init.headers as Record<string, string>,
                    signal: init.signal ?? undefined,
                    agent: agent ?? undefined
                },
                (res) => {
                    const status = res.statusCode ?? 500
                    const headers: Record<string, string> = {}
                    for (const key in res.headers) {
                        const value = res.headers[key]
                        if (typeof value === 'string') {
                            headers[key] = value
                        } else if (Array.isArray(value)) {
                            headers[key] = value.join(', ')
                        }
                    }
                    resolve({
                        status,
                        ok: status >= 200 && status < 300,
                        headers,
                        body: res,
                        cancel: async () => {
                            res.destroy()
                        }
                    })
                }
            )
            req.on('error', (error) => reject(toError(error)))
            const body = init.body
            if (body instanceof Uint8Array) {
                req.end(body)
            } else if (body) {
                body.on('error', (err) => req.destroy(toError(err)))
                body.pipe(req)
            } else {
                req.end()
            }
        })
    }

    private resolveTransferRequest(
        request: Pick<
            StreamDownloadRequest,
            'url' | 'directPath' | 'hosts' | 'headers' | 'timeoutMs'
        >,
        extraHeaders?: Readonly<Record<string, string | undefined>>
    ): {
        readonly urls: readonly string[]
        readonly headers: Record<string, string>
        readonly timeoutMs: number
    } {
        const headers: Record<string, string> = { ...this.defaultHeaders }
        if (request.headers) {
            for (const key in request.headers) {
                headers[key.toLowerCase()] = request.headers[key]
            }
        }
        if (extraHeaders) {
            for (const key in extraHeaders) {
                const value = extraHeaders[key]
                if (value !== undefined) {
                    headers[key.toLowerCase()] = value
                }
            }
        }

        return {
            urls: this.resolveUrls(request.url, request.directPath, request.hosts),
            headers,
            timeoutMs: request.timeoutMs ?? this.defaultTimeoutMs
        }
    }

    private async prepareEncryptedUpload(
        request: EncryptedUploadRequest,
        mediaKey: Uint8Array
    ): Promise<{
        readonly body: Uint8Array | Readable
        readonly contentLength: number | undefined
        readonly metadata: Promise<{
            readonly fileSha256: Uint8Array
            readonly fileEncSha256: Uint8Array
            readonly plaintextLength: number
        }>
        cleanup(error: Error): Promise<void>
    }> {
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
                    fileEncSha256: encrypted.fileEncSha256,
                    plaintextLength: request.plaintext.byteLength
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
        if (url && resolved.indexOf(url) === -1) resolved.push(url)
        if (directPath) {
            if (directPath.startsWith('https://') || directPath.startsWith('http://')) {
                if (resolved.indexOf(directPath) === -1) resolved.push(directPath)
            } else {
                const normalizedPath = directPath.startsWith('/') ? directPath : `/${directPath}`
                for (const host of hosts ?? this.defaultHosts) {
                    const candidate = `https://${host}${normalizedPath}`
                    if (resolved.indexOf(candidate) === -1) resolved.push(candidate)
                }
            }
        }
        if (resolved.length === 0) {
            throw new Error('missing transfer url/directPath')
        }

        return resolved
    }

    private async fetchWithFallback(
        urls: readonly string[],
        timeoutMs: number,
        signal: AbortSignal | undefined,
        send: (url: string, signal: AbortSignal) => Promise<InternalTransferResponse>
    ): Promise<StreamTransferResponse> {
        let lastError: Error | null = null

        for (let index = 0; index < urls.length; index += 1) {
            const url = urls[index]
            const abort = this.createAbortContext(timeoutMs, signal)
            try {
                const response = await send(url, abort.signal)
                const shouldFallback = response.status >= 500 && index < urls.length - 1
                if (!shouldFallback) {
                    return {
                        url,
                        status: response.status,
                        ok: response.ok,
                        headers: response.headers,
                        body: response.body
                    }
                }
                await response.cancel()
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
    ): {
        readonly signal: AbortSignal
        cleanup(): void
    } {
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
}
