import type { WaCallReaction } from '../app-data/protocol.js'

import type { WaCallMediaPlan, WaCallMediaPlanUpdate } from './plan.js'
import {
    WaCallMediaPlane,
    type WaCallMediaPlaneOptions,
    type WaCallMediaStats
} from './WaCallMediaPlane.js'

/** Version of the wire shape below. Only a breaking change moves it; a new field is optional. */
export const WA_CALL_MEDIA_WIRE_VERSION = 1

/**
 * One plan change sent from signaling to the media host, numbered per call from 0. A
 * `full` message holds the whole plan; the others hold only the sections that changed.
 *
 * @sensitive `plan.keys` and the relay credentials in `plan.relays`.
 */
export interface WaCallMediaMessage {
    readonly v: typeof WA_CALL_MEDIA_WIRE_VERSION
    readonly callId: string
    readonly seq: number
    readonly full: boolean
    readonly plan: WaCallMediaPlanUpdate
}

/** What the host carrying the media tells signaling. */
export type WaCallMediaEvent =
    /** Media started flowing: the call is accepted and a relay leg is up. */
    | { readonly type: 'active' }
    /** The call has no relay leg left; signaling ends the call. */
    | { readonly type: 'relay_lost'; readonly reason: string }
    /** An in-band reaction from the peer. */
    | { readonly type: 'reaction'; readonly reaction: WaCallReaction }
    /** The host missed a message and needs the whole plan again. */
    | { readonly type: 'resync'; readonly lastSeq: number | null }

export interface WaCallMediaEventMessage {
    readonly v: typeof WA_CALL_MEDIA_WIRE_VERSION
    readonly callId: string
    readonly event: WaCallMediaEvent
}

/** Marks a byte array in the JSON text, which has no binary type of its own. */
const BYTES_KEY = '$bytes'
/** Marks a `bigint`, which JSON cannot carry: a reaction's transaction id is a `uint64`. */
const BIGINT_KEY = '$bigint'

function bytesToBase64(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

function base64ToBytes(text: string): Uint8Array {
    const binary = atob(text)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i)
    }
    return out
}

function encode(value: unknown): string {
    return JSON.stringify(value, (_key, field: unknown) => {
        if (field instanceof Uint8Array) return { [BYTES_KEY]: bytesToBase64(field) }
        if (typeof field === 'bigint') return { [BIGINT_KEY]: field.toString() }
        return field
    })
}

function decode(text: string): unknown {
    return JSON.parse(text, (_key, field: unknown) => {
        if (field && typeof field === 'object' && !Array.isArray(field)) {
            const record = field as Record<string, unknown>
            if (Object.keys(record).length === 1) {
                if (typeof record[BYTES_KEY] === 'string') return base64ToBytes(record[BYTES_KEY])
                if (typeof record[BIGINT_KEY] === 'string') return BigInt(record[BIGINT_KEY])
            }
        }
        return field
    })
}

function assertWire(value: unknown, what: string): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
        throw new Error(`${what} is not an object`)
    }
    const record = value as Record<string, unknown>
    if (record.v !== WA_CALL_MEDIA_WIRE_VERSION) {
        throw new Error(`${what} has wire version ${String(record.v)}, expected 1`)
    }
    if (typeof record.callId !== 'string' || record.callId.length === 0) {
        throw new Error(`${what} has no call id`)
    }
    return record
}

/** The text form of a message, for whatever transport the integrator runs. */
export function encodeCallMediaMessage(message: WaCallMediaMessage): string {
    return encode(message)
}

export function decodeCallMediaMessage(text: string): WaCallMediaMessage {
    const record = assertWire(decode(text), 'media message')
    if (!Number.isSafeInteger(record.seq) || (record.seq as number) < 0) {
        throw new Error('media message has no valid seq')
    }
    if (typeof record.full !== 'boolean' || !record.plan || typeof record.plan !== 'object') {
        throw new Error('media message has no plan')
    }
    return record as unknown as WaCallMediaMessage
}

export function encodeCallMediaEvent(message: WaCallMediaEventMessage): string {
    return encode(message)
}

export function decodeCallMediaEvent(text: string): WaCallMediaEventMessage {
    const record = assertWire(decode(text), 'media event')
    const event = record.event as { type?: unknown } | undefined
    if (!event || typeof event.type !== 'string') {
        throw new Error('media event has no type')
    }
    return record as unknown as WaCallMediaEventMessage
}

/** Numbers a call's plan changes on the signaling side; {@link snapshot} resyncs a host. */
export class WaCallMediaMessageSequencer {
    private readonly callId: string
    private readonly plan: { -readonly [K in keyof WaCallMediaPlan]?: WaCallMediaPlan[K] } = {}
    private seq = -1

    constructor(callId: string) {
        this.callId = callId
    }

    /** Folds a change into the plan and returns the message that carries it. */
    next(update: WaCallMediaPlanUpdate): WaCallMediaMessage {
        Object.assign(this.plan, update)
        this.seq++
        return {
            v: WA_CALL_MEDIA_WIRE_VERSION,
            callId: this.callId,
            seq: this.seq,
            full: this.seq === 0,
            plan: this.seq === 0 ? { ...this.plan } : update
        }
    }

    /** The whole plan as it stands, under the number of the last change. */
    snapshot(): WaCallMediaMessage {
        return {
            v: WA_CALL_MEDIA_WIRE_VERSION,
            callId: this.callId,
            seq: Math.max(0, this.seq),
            full: true,
            plan: { ...this.plan }
        }
    }
}

export interface WaCallMediaReceiverOptions extends Omit<
    WaCallMediaPlaneOptions,
    'onActive' | 'onRelayLost' | 'onReaction'
> {
    readonly callId: string
    /** Hands an event back to signaling, over whatever transport the integrator runs. */
    readonly send: (message: WaCallMediaEventMessage) => void
    /** Also told of the reactions sent to signaling, for a host that shows them itself. */
    readonly onReaction?: (reaction: WaCallReaction) => void
}

/**
 * Host side of a call whose signaling runs elsewhere: applies messages to its own
 * {@link WaCallMediaPlane} in order, drops stale ones and asks for a resync after a gap.
 */
export class WaCallMediaReceiver {
    readonly plane: WaCallMediaPlane
    private readonly callId: string
    private readonly send: (message: WaCallMediaEventMessage) => void
    private lastSeq: number | null = null
    private receiving: Promise<void> = Promise.resolve()

    constructor(options: WaCallMediaReceiverOptions) {
        this.callId = options.callId
        this.send = options.send
        this.plane = new WaCallMediaPlane({
            ...options,
            onActive: () => this.emit({ type: 'active' }),
            onRelayLost: (reason) => this.emit({ type: 'relay_lost', reason }),
            onReaction: (reaction) => {
                options.onReaction?.(reaction)
                this.emit({ type: 'reaction', reaction })
            }
        })
    }

    /** Loads the codec; see {@link WaCallMediaPlane.start}. */
    start(): Promise<void> {
        return this.plane.start()
    }

    /**
     * Applies one message, one at a time in call order. A message whose apply rejects is not
     * counted as received, so the next one finds the gap and asks for a resync.
     */
    receive(message: WaCallMediaMessage): Promise<void> {
        const run = this.receiving.then(() => this.receiveNow(message))
        this.receiving = run.catch(() => {})
        return run
    }

    private async receiveNow(message: WaCallMediaMessage): Promise<void> {
        if (message.callId !== this.callId) {
            throw new Error(`media message for call ${message.callId}, expected ${this.callId}`)
        }

        if (message.full) {
            if (this.lastSeq !== null && message.seq < this.lastSeq) return
        } else {
            if (this.lastSeq !== null && message.seq <= this.lastSeq) return
            if (this.lastSeq === null || message.seq > this.lastSeq + 1) {
                this.emit({ type: 'resync', lastSeq: this.lastSeq })
            }
        }

        await this.plane.apply(message.plan)
        this.lastSeq = message.seq
    }

    stop(): WaCallMediaStats {
        return this.plane.stop()
    }

    private emit(event: WaCallMediaEvent): void {
        this.send({ v: WA_CALL_MEDIA_WIRE_VERSION, callId: this.callId, event })
    }
}
