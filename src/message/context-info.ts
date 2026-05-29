import type { Proto } from '@proto'

export interface WaSendContextInfo {
    readonly quotedMessageId?: string
    readonly quotedParticipant?: string
    readonly quotedRemoteJid?: string
    readonly quotedMessage?: Proto.IMessage

    readonly isForwarded?: boolean
    readonly forwardingScore?: number

    readonly mentionedJids?: readonly string[]

    readonly isSpoiler?: boolean
    readonly expirationSeconds?: number

    readonly groupSubject?: string
    readonly parentGroupJid?: string

    readonly raw?: Proto.IContextInfo
}

export interface WaQuoteRef {
    readonly id: string
    readonly participant?: string
    readonly remoteJid?: string
    readonly message?: Proto.IMessage
}

export function buildContextInfoProto(input: WaSendContextInfo): Proto.IContextInfo {
    const ctx: Proto.IContextInfo = {}

    if (input.quotedMessageId !== undefined) ctx.stanzaId = input.quotedMessageId
    if (input.quotedParticipant !== undefined) ctx.participant = input.quotedParticipant
    if (input.quotedRemoteJid !== undefined) ctx.remoteJid = input.quotedRemoteJid
    if (input.quotedMessage !== undefined) ctx.quotedMessage = input.quotedMessage

    if (input.isForwarded !== undefined) ctx.isForwarded = input.isForwarded
    if (input.forwardingScore !== undefined) ctx.forwardingScore = input.forwardingScore

    if (input.mentionedJids && input.mentionedJids.length > 0) {
        ctx.mentionedJid = [...input.mentionedJids]
    }

    if (input.isSpoiler !== undefined) ctx.isSpoiler = input.isSpoiler
    if (input.expirationSeconds !== undefined) ctx.expiration = input.expirationSeconds

    if (input.groupSubject !== undefined) ctx.groupSubject = input.groupSubject
    if (input.parentGroupJid !== undefined) ctx.parentGroupJid = input.parentGroupJid

    if (input.raw) {
        Object.assign(ctx, input.raw)
    }

    return ctx
}

interface ContextInfoCarrier {
    contextInfo?: Proto.IContextInfo | null
}

export function applyContextInfo(
    message: Proto.IMessage,
    ctx: WaSendContextInfo | null | undefined
): Proto.IMessage {
    if (!ctx) return message
    const proto = buildContextInfoProto(ctx)
    if (!hasAnyKey(proto)) return message

    const next: Proto.IMessage = { ...message }

    if (typeof next.conversation === 'string' && !next.extendedTextMessage) {
        next.extendedTextMessage = { text: next.conversation }
        delete next.conversation
    }

    if (!hasAnyKey(next)) {
        next.extendedTextMessage = {}
    }

    const target = pickContextInfoTarget(next)
    if (!target) {
        throw new Error('cannot apply contextInfo: no compatible submessage found')
    }
    target.contextInfo = { ...target.contextInfo, ...proto }
    return next
}

/**
 * Reads the disappearing-message TTL (`contextInfo.expiration`) from the first
 * submessage that carries it. Unwraps `ephemeralMessage` if present. Returns
 * `undefined` when no submessage has an `expiration` set.
 */
export function pickIncomingExpirationSeconds(
    message: Proto.IMessage | undefined
): number | undefined {
    if (!message) return undefined
    const inner = message.ephemeralMessage?.message ?? message
    for (const key of Object.keys(inner)) {
        const value = (inner as Record<string, unknown>)[key]
        if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            !(value instanceof Uint8Array)
        ) {
            const ctx = (value as ContextInfoCarrier).contextInfo
            if (ctx?.expiration !== undefined && ctx.expiration !== null) {
                return ctx.expiration
            }
        }
    }
    return undefined
}

function pickContextInfoTarget(message: Proto.IMessage): ContextInfoCarrier | null {
    for (const key of Object.keys(message)) {
        const value = (message as Record<string, unknown>)[key]
        if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            !(value instanceof Uint8Array)
        ) {
            return value as ContextInfoCarrier
        }
    }
    return null
}

/**
 * Anything that identifies a quoted message. Accepts a {@link WaQuoteRef}, a
 * {@link WaMessageKey} (bare proto key), or a full incoming message event (its
 * `key` + `message` are read). All fields are optional structurally — the
 * public `quote` option type enforces the concrete shape.
 */
type WaQuoteSource = {
    readonly key?: {
        readonly id?: string
        readonly remoteJid?: string
        readonly participant?: string
    }
    readonly id?: string
    readonly remoteJid?: string
    readonly participant?: string
    readonly message?: Proto.IMessage
}

type WaForwardSource = boolean | { readonly score?: number }

export interface WaSendContextResolveInput {
    readonly contentLevel?: WaSendContextInfo
    readonly optionsLevel?: WaSendContextInfo
    readonly quote?: WaQuoteSource
    readonly forward?: WaForwardSource
    readonly mentions?: readonly string[]
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

export function resolveSendContextInfo(input: WaSendContextResolveInput): WaSendContextInfo | null {
    const ctx: Mutable<WaSendContextInfo> = {
        ...(input.contentLevel ?? {}),
        ...(input.optionsLevel ?? {})
    }

    if (input.quote) {
        const q = input.quote
        ctx.quotedMessageId = q.id ?? q.key?.id ?? ctx.quotedMessageId
        ctx.quotedParticipant = q.participant ?? q.key?.participant ?? ctx.quotedParticipant
        ctx.quotedRemoteJid = q.remoteJid ?? q.key?.remoteJid ?? ctx.quotedRemoteJid
        ctx.quotedMessage = q.message ?? ctx.quotedMessage
    }

    if (input.forward) {
        const explicit = typeof input.forward === 'object' ? input.forward.score : undefined
        const base = ctx.forwardingScore ?? 0
        ctx.isForwarded = true
        ctx.forwardingScore = explicit ?? (base > 0 ? base + 1 : 1)
    }

    if (input.mentions?.length) {
        ctx.mentionedJids = input.mentions
    }

    return hasAnyKey(ctx) ? ctx : null
}

function hasAnyKey(value: object): boolean {
    for (const _ in value) {
        return true
    }
    return false
}
