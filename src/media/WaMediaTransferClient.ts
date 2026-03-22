import { Readable } from 'node:stream'

import type { Logger } from '@infra/log/types'
import { DEFAULT_MEDIA_HOSTS } from '@media/constants'
import type { MediaCryptoType, WaMediaTransferClientOptions } from '@media/types'
import { WaMediaCrypto } from '@media/WaMediaCrypto'
import { WA_DEFAULTS } from '@protocol/constants'
import type { WaProxyAgent, WaProxyDispatcher } from '@transport/types'
import { EMPTY_BYTES, readAllBytes } from '@util/bytes'
import { toError } from '@util/primitives'

const GOT_OPTIONAL_MODULE = 'got'

interface StreamDownloadRequest {
    readonly url?: string
    readonly directPath?: string
    readonly hosts?: readonly string[]
    readonly headers?: Readonly<Record<string, string>>
    readonly dispatcher?: WaMediaTransferClientOptions['defaultDownloadDispatcher']
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

interface OptionalGotModule {
    readonly stream: (url: string, options?: Readonly<Record<string, unknown>>) => Readable
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

function asOptionalGotModule(loaded: unknown): OptionalGotModule | null {
    if (loaded && typeof loaded === 'object') {
        const direct = (loaded as { readonly stream?: unknown }).stream
        if (typeof direct === 'function') {
            return loaded as OptionalGotModule
        }
        const fallback = (loaded as { readonly default?: unknown }).default
        if (
            fallback &&
            typeof fallback === 'object' &&
            'stream' in fallback &&
            typeof (fallback as { readonly stream?: unknown }).stream === 'function'
        ) {
            return fallback as OptionalGotModule
        }
        if (typeof fallback === 'function' && 'stream' in fallback) {
            const maybeStream = (fallback as { readonly stream?: unknown }).stream
            if (typeof maybeStream === 'function') {
                return fallback as unknown as OptionalGotModule
            }
        }
    }
    if (typeof loaded === 'function' && 'stream' in loaded) {
        const maybeStream = (loaded as { readonly stream?: unknown }).stream
        if (typeof maybeStream === 'function') {
            return loaded as unknown as OptionalGotModule
        }
    }
    return null
}

async function loadOptionalGotModule(): Promise<OptionalGotModule> {
    try {
        const loaded = await import(GOT_OPTIONAL_MODULE)
        const module = asOptionalGotModule(loaded)
        if (module) {
            return module
        }
        throw new Error('invalid got module export')
    } catch (error) {
        const normalized = toError(error)
        const code = (normalized as NodeJS.ErrnoException).code
        const message = normalized.message ?? ''
        const isModuleNotFound =
            (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') &&
            (message.includes(`'${GOT_OPTIONAL_MODULE}'`) ||
                message.includes(`"${GOT_OPTIONAL_MODULE}"`))
        if (isModuleNotFound) {
            throw new Error('optional dependency "got" is not installed. Install with: npm i got')
        }
        throw normalized
    }
}

export class WaMediaTransferClient {
    private readonly logger?: Logger
    private readonly defaultHosts: readonly string[]
    private readonly defaultTimeoutMs: number
    private readonly defaultMaxReadBytes: number | undefined
    private readonly defaultHeaders: Readonly<Record<string, string>>
    private readonly defaultUploadDispatcher: WaMediaTransferClientOptions['defaultUploadDispatcher']
    private readonly defaultDownloadDispatcher: WaMediaTransferClientOptions['defaultDownloadDispatcher']
    private readonly defaultUploadAgent: WaMediaTransferClientOptions['defaultUploadAgent']
    private readonly defaultDownloadAgent: WaMediaTransferClientOptions['defaultDownloadAgent']
    private gotModulePromise: Promise<OptionalGotModule> | null

    public constructor(options: WaMediaTransferClientOptions = {}) {
        this.logger = options.logger
        this.defaultHosts = options.defaultHosts ?? DEFAULT_MEDIA_HOSTS
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? WA_DEFAULTS.MEDIA_TIMEOUT_MS
        this.defaultMaxReadBytes = options.defaultMaxReadBytes
        this.defaultHeaders = normalizeHeaderRecord(options.defaultHeaders)
        this.defaultUploadDispatcher = options.defaultUploadDispatcher
        this.defaultDownloadDispatcher = options.defaultDownloadDispatcher
        this.defaultUploadAgent = options.defaultUploadAgent
        this.defaultDownloadAgent = options.defaultDownloadAgent
        this.gotModulePromise = null
    }

    public async downloadStream(request: StreamDownloadRequest): Promise<StreamTransferResponse> {
        const { urls, headers, timeoutMs } = this.resolveTransferRequest(request)
        const dispatcher = request.dispatcher ?? this.defaultDownloadDispatcher
        const agent = request.agent ?? this.defaultDownloadAgent
        this.logger?.debug('media download stream start', {
            urls: urls.length,
            timeoutMs
        })
        return this.executeTransfer(urls, timeoutMs, request.signal, {
            responseLog: 'media download stream response',
            send: (url, signal) =>
                this.transferRequest(
                    url,
                    {
                        method: 'GET',
                        headers,
                        signal
                    },
                    dispatcher,
                    agent
                )
        })
    }

    public async downloadBytes(request: StreamDownloadRequest): Promise<Uint8Array> {
        const response = await this.downloadStream(request)
        await this.assertSuccessfulResponse(response)
        if (!response.body) {
            return EMPTY_BYTES
        }
        return this.readAllBytesWithLimit(response.body, request.maxBytes)
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
        const dispatcher = request.dispatcher ?? this.defaultUploadDispatcher
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
        return this.executeTransfer(uploadUrls, timeoutMs, request.signal, {
            responseLog: 'media upload stream response',
            send: async (url, signal) => {
                if (bodyIsBytes) {
                    return this.transferRequest(
                        url,
                        {
                            method,
                            headers,
                            signal,
                            body: request.body
                        },
                        dispatcher,
                        agent
                    )
                }

                return this.transferRequest(
                    url,
                    {
                        method,
                        headers,
                        signal,
                        body: request.body as unknown as never,
                        duplex: 'half'
                    } as RequestInit,
                    dispatcher,
                    agent
                )
            }
        })
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
                dispatcher: request.dispatcher,
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
            fileEncSha256: metadata.fileEncSha256
        }
    }

    public async downloadAndDecrypt(request: EncryptedDownloadRequest): Promise<Uint8Array> {
        this.logger?.info('media encrypted download start', {
            mediaType: request.mediaType
        })
        const decrypted = await this.downloadAndDecryptStream(request)
        try {
            const [plaintext] = await Promise.all([
                this.readAllBytesWithLimit(decrypted.plaintext, request.maxBytes),
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

    public async readResponseBytes(
        response: StreamTransferResponse,
        maxBytes?: number
    ): Promise<Uint8Array> {
        if (!response.body) {
            return EMPTY_BYTES
        }
        return this.readAllBytesWithLimit(response.body, maxBytes)
    }

    private async transferRequest(
        url: string,
        init: RequestInit,
        dispatcher: WaProxyDispatcher | undefined,
        agent: WaProxyAgent | undefined
    ): Promise<InternalTransferResponse> {
        if (agent) {
            return this.gotWithAgent(url, init, agent)
        }
        return this.fetchWithDispatcher(url, init, dispatcher)
    }

    private async fetchWithDispatcher(
        url: string,
        init: RequestInit,
        dispatcher: WaProxyDispatcher | undefined
    ): Promise<InternalTransferResponse> {
        const response = !dispatcher
            ? await fetch(url, init)
            : await fetch(url, {
                  ...init,
                  dispatcher
              } as RequestInit)
        return this.toFetchTransferResponse(response)
    }

    private toFetchTransferResponse(response: Response): InternalTransferResponse {
        return {
            status: response.status,
            ok: response.ok,
            headers: this.headersToRecord(response.headers),
            body: response.body
                ? Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>)
                : null,
            cancel: async () => {
                if (!response.body) {
                    return
                }
                try {
                    await response.body.cancel()
                } catch {
                    // ignore cancel errors from remote resets
                }
            }
        }
    }

    private async gotWithAgent(
        url: string,
        init: RequestInit,
        agent: WaProxyAgent
    ): Promise<InternalTransferResponse> {
        const got = await this.loadGotModule()
        const urlObj = new URL(url)
        const gotAgent =
            urlObj.protocol === 'http:'
                ? { http: agent }
                : urlObj.protocol === 'https:'
                  ? { https: agent }
                  : { http: agent, https: agent }
        return new Promise<InternalTransferResponse>((resolve, reject) => {
            const request = got.stream(url, {
                method: init.method,
                headers: (init.headers ?? {}) as Readonly<Record<string, string>>,
                body: init.body as unknown,
                signal: init.signal,
                throwHttpErrors: false,
                retry: { limit: 0 },
                agent: gotAgent
            })
            const onError = (error: unknown): void => {
                request.off('response', onResponse)
                reject(toError(error))
            }
            const onResponse = (incoming: unknown): void => {
                request.off('error', onError)
                resolve(this.toGotTransferResponse(incoming))
            }
            request.once('error', onError)
            request.once('response', onResponse)
        })
    }

    private async loadGotModule(): Promise<OptionalGotModule> {
        if (!this.gotModulePromise) {
            this.gotModulePromise = loadOptionalGotModule().catch((error) => {
                this.gotModulePromise = null
                throw error
            })
        }
        return this.gotModulePromise
    }

    private toGotTransferResponse(incoming: unknown): InternalTransferResponse {
        if (!incoming || typeof incoming !== 'object') {
            throw new Error('invalid got response object')
        }
        const stream = incoming as Readable & {
            readonly statusCode?: unknown
            readonly headers?: unknown
        }
        const status =
            typeof stream.statusCode === 'number' &&
            Number.isFinite(stream.statusCode) &&
            stream.statusCode >= 100 &&
            stream.statusCode <= 599
                ? stream.statusCode
                : 500
        const headers: Record<string, string> = {}
        if (stream.headers && typeof stream.headers === 'object') {
            const input = stream.headers as Readonly<Record<string, unknown>>
            for (const key in input) {
                const value = input[key]
                if (typeof value === 'string') {
                    headers[key] = value
                    continue
                }
                if (Array.isArray(value)) {
                    headers[key] = value.join(', ')
                    continue
                }
                if (value !== undefined && value !== null) {
                    headers[key] = String(value)
                }
            }
        }
        return {
            status,
            ok: status >= 200 && status < 300,
            headers,
            body: stream,
            cancel: async () => {
                stream.destroy()
            }
        }
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

    private async executeTransfer(
        urls: readonly string[],
        timeoutMs: number,
        signal: AbortSignal | undefined,
        options: {
            readonly responseLog: string
            readonly send: (url: string, signal: AbortSignal) => Promise<InternalTransferResponse>
        }
    ): Promise<StreamTransferResponse> {
        const result = await this.fetchWithFallback(urls, timeoutMs, signal, options.send)
        this.logger?.trace(options.responseLog, {
            url: result.url,
            status: result.status
        })
        return result
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

    private readAllBytesWithLimit(
        stream: Readable,
        maxBytes: number | undefined
    ): Promise<Uint8Array> {
        return readAllBytes(stream, {
            maxBytes: maxBytes ?? this.defaultMaxReadBytes
        })
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

    private headersToRecord(headers: Headers): Readonly<Record<string, string>> {
        const output: Record<string, string> = {}
        headers.forEach((value, key) => {
            output[key] = value
        })
        return output
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
