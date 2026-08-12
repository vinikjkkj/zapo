import type { WaAuthCredentials } from '@auth/types'
import type { Logger } from '@infra/log/types'
import {
    decryptMediaRetryNotification,
    encryptServerErrorReceipt,
    MEDIA_RETRY_IV_SIZE
} from '@media/crypto/media-retry'
import { proto } from '@proto'
import { WA_DEFAULTS, WA_NODE_TAGS } from '@protocol/constants'
import { isGroupOrBroadcastJid, isOwnAccountJid, toUserJid } from '@protocol/jid'
import { buildReceiptNode } from '@transport/node/builders/global'
import { findNodeChild, getNodeBytesContent } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { setBoundedMapEntry } from '@util/collections'
import { parseOptionalInt, toError } from '@util/primitives'

export type WaMediaRetryResultType = 'success' | 'not_found' | 'decryption_error' | 'general_error'

export interface WaMediaRetryResult {
    readonly messageId: string
    readonly result: WaMediaRetryResultType
    readonly resultCode: number
    readonly directPath?: string
}

export interface WaMediaRetryRequest {
    readonly messageId: string
    readonly chatJid: string
    readonly mediaKey: Uint8Array
    readonly fromMe: boolean
    readonly participant?: string
    readonly timeoutMs?: number
}

export interface WaMediaRetryRequesterOptions {
    readonly logger: Logger
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly getCurrentCredentials: () => WaAuthCredentials | null
    readonly defaultTimeoutMs?: number
    readonly maxPending?: number
}

export interface WaMediaRetryRequester {
    readonly request: (input: WaMediaRetryRequest) => Promise<WaMediaRetryResult>
    readonly handleNotification: (node: BinaryNode) => void
}

interface PendingMediaRetry {
    readonly mediaKey: Uint8Array
    readonly promise: Promise<WaMediaRetryResult>
    readonly resolve: (result: WaMediaRetryResult) => void
    readonly reject: (error: Error) => void
    readonly timeout: ReturnType<typeof setTimeout>
}

type ParsedMediaRetryNotification = { readonly messageId: string; readonly from?: string } & (
    | { readonly errorCode: number; readonly ciphertext?: undefined }
    | { readonly errorCode?: undefined; readonly ciphertext: Uint8Array; readonly iv: Uint8Array }
)

export function parseMediaRetryNotification(node: BinaryNode): ParsedMediaRetryNotification | null {
    const messageId = node.attrs.id
    if (!messageId) {
        return null
    }
    const from = node.attrs.from

    const errorNode = findNodeChild(node, WA_NODE_TAGS.ERROR)
    if (errorNode) {
        const errorCode = parseOptionalInt(errorNode.attrs.code)
        return errorCode === undefined ? null : { messageId, from, errorCode }
    }

    const encryptNode = findNodeChild(node, 'encrypt')
    if (!encryptNode) {
        return null
    }
    const ciphertext = getNodeBytesContent(findNodeChild(encryptNode, 'enc_p'))
    const iv = getNodeBytesContent(findNodeChild(encryptNode, 'enc_iv'))
    if (!ciphertext || !iv || iv.byteLength !== MEDIA_RETRY_IV_SIZE) {
        return null
    }
    return { messageId, from, ciphertext, iv }
}

function toResultType(code: number | null | undefined): WaMediaRetryResultType {
    switch (code) {
        case proto.MediaRetryNotification.ResultType.SUCCESS:
            return 'success'
        case proto.MediaRetryNotification.ResultType.NOT_FOUND:
            return 'not_found'
        case proto.MediaRetryNotification.ResultType.DECRYPTION_ERROR:
            return 'decryption_error'
        default:
            return 'general_error'
    }
}

export function createMediaRetryRequester(
    options: WaMediaRetryRequesterOptions
): WaMediaRetryRequester {
    const { logger, sendNode, getCurrentCredentials } = options
    const defaultTimeoutMs = options.defaultTimeoutMs ?? WA_DEFAULTS.MEDIA_RETRY_TIMEOUT_MS
    const maxPending = options.maxPending ?? WA_DEFAULTS.MAX_PENDING_MEDIA_RETRIES
    const pending = new Map<string, PendingMediaRetry>()

    const takePending = (messageId: string): PendingMediaRetry | undefined => {
        const entry = pending.get(messageId)
        if (!entry) {
            return undefined
        }
        clearTimeout(entry.timeout)
        pending.delete(messageId)
        return entry
    }

    const rejectPending = (messageId: string, error: Error): void => {
        takePending(messageId)?.reject(error)
    }

    const settle = (result: WaMediaRetryResult): void => {
        const entry = takePending(result.messageId)
        if (!entry) {
            return
        }
        logger.debug('media reupload resolved', {
            id: result.messageId,
            result: result.result,
            hasDirectPath: result.directPath !== undefined
        })
        entry.resolve(result)
    }

    const buildRequestNode = async (input: WaMediaRetryRequest): Promise<BinaryNode> => {
        const credentials = getCurrentCredentials()
        const ownJid = credentials?.meLid ?? credentials?.meJid
        if (!ownJid) {
            throw new Error('media reupload request requires a paired session')
        }
        const { ciphertext, iv } = await encryptServerErrorReceipt(input.mediaKey, input.messageId)
        return buildReceiptNode({
            kind: 'server_error',
            id: input.messageId,
            to: toUserJid(ownJid),
            encryptCiphertext: ciphertext,
            encryptIv: iv,
            rmrJid: input.chatJid,
            rmrFromMe: input.fromMe,
            rmrParticipant:
                input.participant && isGroupOrBroadcastJid(input.chatJid)
                    ? toUserJid(input.participant)
                    : undefined
        })
    }

    const trackPending = (input: WaMediaRetryRequest): PendingMediaRetry => {
        const timeoutMs = input.timeoutMs ?? defaultTimeoutMs
        let resolve!: (result: WaMediaRetryResult) => void
        let reject!: (error: Error) => void
        const promise = new Promise<WaMediaRetryResult>((res, rej) => {
            resolve = res
            reject = rej
        })
        const timeout = setTimeout(() => {
            rejectPending(
                input.messageId,
                new Error(`media reupload timeout (${input.messageId}) after ${timeoutMs}ms`)
            )
        }, timeoutMs)

        const entry: PendingMediaRetry = {
            mediaKey: input.mediaKey,
            promise,
            resolve,
            reject,
            timeout
        }
        setBoundedMapEntry(pending, input.messageId, entry, maxPending, (evictedKey, evicted) => {
            clearTimeout(evicted.timeout)
            logger.warn('media reupload pending entry evicted: capacity reached', {
                evictedId: evictedKey,
                maxPending
            })
            evicted.reject(new Error(`media reupload evicted from pending map (id=${evictedKey})`))
        })
        return entry
    }

    return {
        request: async (input) => {
            if (!input.messageId) {
                throw new Error('media reupload request requires a message id')
            }
            if (!input.chatJid) {
                throw new Error('media reupload request requires a chat jid')
            }
            const inFlight = pending.get(input.messageId)
            if (inFlight) {
                return inFlight.promise
            }

            const node = await buildRequestNode(input)
            const entry = trackPending(input)
            sendNode(node).catch((error: unknown) => {
                rejectPending(input.messageId, toError(error))
            })
            return entry.promise
        },

        handleNotification: (node) => {
            const notificationLogger = logger.child({ id: node.attrs.id })
            const parsed = parseMediaRetryNotification(node)
            if (!parsed) {
                notificationLogger.warn('failed to parse mediaretry notification', {
                    from: node.attrs.from
                })
                return
            }

            const entry = pending.get(parsed.messageId)
            if (!entry) {
                notificationLogger.debug('mediaretry notification without a pending request')
                return
            }

            const credentials = getCurrentCredentials()
            if (
                parsed.from &&
                !isOwnAccountJid(parsed.from, credentials?.meJid, credentials?.meLid)
            ) {
                notificationLogger.warn('mediaretry notification did not come from this account', {
                    from: parsed.from
                })
            }

            if (parsed.ciphertext === undefined) {
                settle({
                    messageId: parsed.messageId,
                    result: toResultType(parsed.errorCode),
                    resultCode: parsed.errorCode
                })
                return
            }

            let result: WaMediaRetryResult
            try {
                const decoded = decryptMediaRetryNotification({
                    mediaKey: entry.mediaKey,
                    ciphertext: parsed.ciphertext,
                    iv: parsed.iv,
                    stanzaId: parsed.messageId
                })
                if (decoded.stanzaId !== parsed.messageId) {
                    throw new Error(
                        `mediaretry stanza id mismatch: sealed ${String(decoded.stanzaId)}`
                    )
                }
                result = {
                    messageId: parsed.messageId,
                    result: toResultType(decoded.result),
                    resultCode:
                        decoded.result ?? proto.MediaRetryNotification.ResultType.GENERAL_ERROR,
                    directPath: decoded.directPath ?? undefined
                }
            } catch (error) {
                const normalized = toError(error)
                notificationLogger.warn('failed to open mediaretry notification', {
                    message: normalized.message
                })
                rejectPending(parsed.messageId, normalized)
                return
            }

            settle(result)
        }
    }
}
