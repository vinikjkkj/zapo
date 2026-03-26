import type { Readable } from 'node:stream'

import type { Logger } from '@infra/log/types'
import type { WaProxyAgent, WaProxyDispatcher } from '@transport/types'

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'ptv'
export type MediaCryptoType = MediaKind | 'ptt' | 'gif' | 'history' | 'md-app-state'

export interface WaMediaConnHost {
    readonly hostname: string
    readonly isFallback: boolean
}

export interface WaMediaConn {
    readonly auth: string
    readonly expiresAtMs: number
    readonly hosts: readonly WaMediaConnHost[]
}

export interface WaMediaTransferClientOptions {
    readonly logger?: Logger
    readonly defaultHosts?: readonly string[]
    readonly defaultTimeoutMs?: number
    readonly defaultMaxReadBytes?: number
    readonly defaultHeaders?: Readonly<Record<string, string>>
    readonly defaultUploadDispatcher?: WaProxyDispatcher
    readonly defaultDownloadDispatcher?: WaProxyDispatcher
    readonly defaultUploadAgent?: WaProxyAgent
    readonly defaultDownloadAgent?: WaProxyAgent
}

export interface WaMediaDerivedKeys {
    readonly iv: Uint8Array
    readonly encKey: Uint8Array
    readonly macKey: Uint8Array
    readonly refKey: Uint8Array
}

export interface WaMediaEncryptionResult {
    readonly ciphertextHmac: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
}

export interface WaMediaDecryptionResult {
    readonly plaintext: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
}

export interface WaMediaReadableEncryptionResult {
    readonly encrypted: Readable
    readonly metadata: Promise<{
        readonly fileSha256: Uint8Array
        readonly fileEncSha256: Uint8Array
        readonly plaintextLength: number
    }>
}

export interface WaMediaReadableDecryptionResult {
    readonly plaintext: Readable
    readonly metadata: Promise<{
        readonly fileSha256: Uint8Array
        readonly fileEncSha256: Uint8Array
    }>
}

export interface WaMediaFileEncryptionResult {
    readonly filePath: string
    readonly fileSize: number
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly plaintextLength: number
}

export interface WaMediaDecryptReadableOptions {
    readonly mediaType: MediaCryptoType
    readonly mediaKey: Uint8Array
    readonly expectedFileSha256?: Uint8Array
    readonly expectedFileEncSha256?: Uint8Array
}
