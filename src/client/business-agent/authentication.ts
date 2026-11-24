import type { WaAuthCredentials } from '@auth/types'
import { WaBusinessAgentError } from '@client/business-agent/errors'
import { sha256 } from '@crypto'
import { WA_BUSINESS_AGENT } from '@protocol/business-agent'
import { WA_DEFAULTS } from '@protocol/constants'
import { parseJidFull } from '@protocol/jid'
import { buildBusinessAgentAuthenticationIq } from '@transport/node/builders/business-agent'
import { getNodeChildren } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { bytesToHex, TEXT_DECODER, TEXT_ENCODER } from '@util/bytes'

export interface WaBusinessAgentAuthenticationState {
    readonly state: 'idle' | 'authenticating' | 'authenticated' | 'cooldown' | 'recovery_required'
    readonly retryAfterMs: number
}

export interface WaBusinessAgentAuthenticationOptions {
    readonly query: (node: BinaryNode, timeoutMs: number) => Promise<BinaryNode>
    readonly getCredentials: () => Pick<WaAuthCredentials, 'meJid'> | null
    readonly isConnected: () => boolean
    readonly now?: () => number
    readonly timeoutMs?: number
}

/** Reads one bounded text child, rejecting duplicate native fields. */
export function readBusinessAgentText(
    node: BinaryNode,
    tag: string,
    maxBytes: number
): string | null {
    const matches = getNodeChildren(node).filter((child) => child.tag === tag)
    if (matches.length !== 1) return null
    const value = matches[0].content
    if (typeof value === 'string')
        return TEXT_ENCODER.encode(value).length <= maxBytes ? value : null
    return value instanceof Uint8Array && value.length <= maxBytes
        ? TEXT_DECODER.decode(value)
        : null
}

function assertResult(node: BinaryNode): void {
    if (
        node.tag === 'iq' &&
        node.attrs.type === 'result' &&
        !getNodeChildren(node).some((child) => child.tag === 'error')
    )
        return
    const code = getNodeChildren(node).find((child) => child.tag === 'error')?.attrs.code
    throw new WaBusinessAgentError(
        'authentication_failed',
        code && /^\d{1,10}$/.test(code) ? code : null
    )
}

/**
 * @internal RAM-only native SMB authentication. No private values are serializable.
 * @sensitive Contains ephemeral account credentials. Never log, serialize or persist this runtime.
 */
export class WaBusinessAgentAuthentication {
    readonly #options: WaBusinessAgentAuthenticationOptions
    readonly #now: () => number
    readonly #timeoutMs: number
    #token: string | null = null
    #owner: string | null = null
    #generation = 0
    #abort = new AbortController()
    #pending: Promise<string> | null = null
    #nonce: {
        owner: string
        until: number
        resolve: (code: string) => void
        reject: (error: Error) => void
        promise: Promise<string>
    } | null = null
    #recoveryRequired = false
    readonly #seenNonces = new Set<string>()
    readonly #lockouts = new Map<string, { until: number; escalated: boolean }>()

    public constructor(options: WaBusinessAgentAuthenticationOptions) {
        this.#options = options
        this.#now = options.now ?? (() => performance.now())
        this.#timeoutMs = options.timeoutMs ?? WA_BUSINESS_AGENT.AUTH_TIMEOUT_MS
        if (
            !Number.isFinite(this.#timeoutMs) ||
            this.#timeoutMs <= 0 ||
            this.#timeoutMs > WA_BUSINESS_AGENT.AUTH_TIMEOUT_MS
        )
            throw new RangeError('invalid Business authentication timeout')
    }

    public get generation(): number {
        return this.#generation
    }
    public get signal(): AbortSignal {
        return this.#abort.signal
    }

    public status(): WaBusinessAgentAuthenticationState {
        const retryAfterMs =
            this.#owner === null
                ? 0
                : Math.max(
                      0,
                      Math.ceil((this.#lockouts.get(this.#owner)?.until ?? 0) - this.#now())
                  )
        return {
            state:
                retryAfterMs > 0
                    ? 'cooldown'
                    : this.#recoveryRequired
                      ? 'recovery_required'
                      : this.#token
                        ? 'authenticated'
                        : this.#pending
                          ? 'authenticating'
                          : 'idle',
            retryAfterMs
        }
    }

    public [Symbol.for('nodejs.util.inspect.custom')](): WaBusinessAgentAuthenticationState {
        return this.status()
    }
    public toJSON(): WaBusinessAgentAuthenticationState {
        return this.status()
    }

    /** Invalidates connection-bound state, keeping account cooldowns and replay hashes. */
    public invalidate(): void {
        this.#generation += 1
        this.#token = null
        this.#owner = null
        this.#nonce?.reject(new WaBusinessAgentError('identity_changed'))
        this.#nonce = null
        this.#pending = null
        this.#recoveryRequired = false
        this.#abort.abort()
        this.#abort = new AbortController()
    }

    public assertCurrent(generation: number): void {
        if (generation !== this.#generation) throw new WaBusinessAgentError('identity_changed')
        if (!this.#options.isConnected()) {
            this.invalidate()
            throw new WaBusinessAgentError('not_connected')
        }
        const jid = this.#options.getCredentials()?.meJid
        if (!jid) {
            this.invalidate()
            throw new WaBusinessAgentError('not_connected')
        }
        let parsed: ReturnType<typeof parseJidFull>
        try {
            parsed = parseJidFull(jid)
        } catch {
            this.invalidate()
            throw new WaBusinessAgentError('identity_changed')
        }
        if (
            parsed.address.server !== WA_DEFAULTS.HOST_DOMAIN ||
            !/^[1-9]\d{0,14}$/.test(parsed.address.user)
        ) {
            this.invalidate()
            throw new WaBusinessAgentError('identity_changed')
        }
        if (this.#owner !== null && this.#owner !== parsed.userJid) {
            this.invalidate()
            throw new WaBusinessAgentError('identity_changed')
        }
        this.#owner = parsed.userJid
    }

    public token(): Promise<string> {
        this.assertCurrent(this.#generation)
        const owner = this.#owner!
        const lockout = this.#lockouts.get(owner)
        if (lockout && lockout.until > this.#now())
            throw new WaBusinessAgentError('cooldown', null, Math.ceil(lockout.until - this.#now()))
        if (this.#recoveryRequired) throw new WaBusinessAgentError('recovery_required')
        if (this.#token !== null) return Promise.resolve(this.#token)
        if (this.#pending) return this.#pending
        const generation = this.#generation
        const pending = this.authenticate(owner, generation).finally(() => {
            if (this.#pending === pending) this.#pending = null
        })
        this.#pending = pending
        return pending
    }

    /** Accepts only a current server nonce; peer and late notifications cannot authenticate. */
    public ingest(node: BinaryNode): void {
        const pending = this.#nonce
        if (
            !pending ||
            this.#now() >= pending.until ||
            node.tag !== 'notification' ||
            node.attrs.type !== 'business' ||
            node.attrs.from !== WA_DEFAULTS.HOST_DOMAIN ||
            node.attrs.category === 'peer'
        )
            return
        const code = readBusinessAgentText(node, WA_BUSINESS_AGENT.NONCE_TAG, 64)
        if (code === null || code.length < 4 || /[\x00-\x1f\x7f]/.test(code)) return
        const digest = bytesToHex(sha256(TEXT_ENCODER.encode(`${pending.owner}\0${code}`)))
        if (this.#seenNonces.has(digest)) return
        this.#seenNonces.add(digest)
        if (this.#seenNonces.size > 128)
            this.#seenNonces.delete(this.#seenNonces.values().next().value!)
        pending.resolve(code)
        this.#nonce = null
    }

    private async phase<T>(work: Promise<T>, generation: number): Promise<T> {
        const signal = this.#abort.signal
        let timer: ReturnType<typeof setTimeout> | undefined
        let abort: (() => void) | undefined
        const deadline = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new WaBusinessAgentError('timeout')), this.#timeoutMs)
            abort = () => reject(new WaBusinessAgentError('identity_changed'))
            signal.addEventListener('abort', abort, { once: true })
            if (signal.aborted) abort()
        })
        try {
            const value = await Promise.race([work, deadline])
            this.assertCurrent(generation)
            return value
        } finally {
            clearTimeout(timer)
            if (abort) signal.removeEventListener('abort', abort)
        }
    }

    private async authenticate(owner: string, generation: number): Promise<string> {
        let resolve!: (code: string) => void
        let reject!: (error: Error) => void
        const promise = new Promise<string>((yes, no) => {
            resolve = yes
            reject = no
        })
        // A disconnect may reject before the nonce phase starts awaiting it.
        void promise.catch(() => undefined)
        const pending = { owner, until: this.#now() + this.#timeoutMs, resolve, reject, promise }
        this.#nonce = pending
        try {
            const first = await this.phase(
                this.#options.query(buildBusinessAgentAuthenticationIq(owner), this.#timeoutMs),
                generation
            )
            assertResult(first)
            const results = getNodeChildren(first).filter((child) => child.tag === 'result')
            const status =
                results.length === 1 &&
                !getNodeChildren(results[0]).some((child) => child.tag === 'status') &&
                !getNodeChildren(first).some(
                    (child) => child.tag === 'status' || child.tag === 'error'
                )
                    ? results[0].attrs.status
                    : null
            if (status === 'RecoveryRequired') {
                this.#recoveryRequired = true
                throw new WaBusinessAgentError('recovery_required')
            }
            if (status !== 'Success') throw new WaBusinessAgentError('invalid_response')
            pending.until = this.#now() + this.#timeoutMs
            const nonce = await this.phase(promise, generation)
            const reply = await this.phase(
                this.#options.query(
                    buildBusinessAgentAuthenticationIq(owner, nonce),
                    this.#timeoutMs
                ),
                generation
            )
            assertResult(reply)
            const token = readBusinessAgentText(reply, 'access_token', 65_536)
            const cookies = readBusinessAgentText(
                reply,
                'session_cookies',
                WA_BUSINESS_AGENT.MAX_BYTES
            )
            const person = getNodeChildren(reply).filter((child) => child.tag === 'business_person')
            if (
                token === null ||
                token.length === 0 ||
                /[\x00-\x20\x7f]/.test(token) ||
                cookies === null ||
                person.length !== 1 ||
                !/^[1-9]\d{0,19}$/.test(person[0].attrs.id ?? '')
            )
                throw new WaBusinessAgentError('invalid_response')
            let cookieValues: unknown
            try {
                cookieValues = JSON.parse(cookies)
            } catch {
                throw new WaBusinessAgentError('invalid_response')
            }
            if (
                !Array.isArray(cookieValues) ||
                cookieValues.some(
                    (cookie: unknown) =>
                        cookie === null || typeof cookie !== 'object' || Array.isArray(cookie)
                )
            )
                throw new WaBusinessAgentError('invalid_response')
            this.assertCurrent(generation)
            this.#token = token
            this.#lockouts.delete(owner)
            return token
        } catch (error) {
            if (error instanceof WaBusinessAgentError) {
                if (
                    generation === this.#generation &&
                    (error.serverCode === '429' || error.serverCode === '431')
                ) {
                    const escalated = this.#lockouts.get(owner)?.escalated ?? false
                    this.#lockouts.set(owner, {
                        until: this.#now() + (escalated ? 86_400_000 : 600_000),
                        escalated: true
                    })
                    if (this.#lockouts.size > 16)
                        this.#lockouts.delete(this.#lockouts.keys().next().value!)
                }
                throw error
            }
            throw new WaBusinessAgentError('authentication_failed')
        } finally {
            if (this.#nonce === pending) this.#nonce = null
        }
    }
}
