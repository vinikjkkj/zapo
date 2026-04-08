/**
 * High-level fake peer that drives a Signal-encrypted message exchange
 * with a real `WaClient` connected to a `FakeWaServer`.
 *
 * Usage:
 *
 *   const peer = await server.createFakePeer({
 *       jid: '5511888888888@s.whatsapp.net'
 *   })
 *
 *   // The fake server captures the client's prekey upload IQ and feeds
 *   // its bundle into the peer. After that the peer can encrypt and push
 *   // arbitrary protobuf-encoded message payloads.
 *
 *   await peer.sendConversation('hello world')
 *
 * The first message a peer sends in a session is wrapped in a
 * `PreKeySignalMessage` (`<enc type="pkmsg"/>`); subsequent messages use
 * the lighter `SignalMessage` envelope (`<enc type="msg"/>`).
 *
 * Inbound messages from the real client are NOT decrypted by the fake
 * server in this phase — that would require maintaining a recv chain and
 * the inverse Double Ratchet logic, which is out of scope for the
 * pairing/bring-up tests we want to enable. The captured `<enc>` bytes
 * are still surfaced via `FakeWaServer.capturedStanzaSnapshot` for tests
 * that just need to assert "the client sent _something_".
 */

import { buildMessage, type FakeEncChild } from '../protocol/push/message'
import {
    type FakePeerIdentity,
    FakePeerSession,
    generateFakePeerIdentity
} from '../protocol/signal/fake-peer-session'
import type { ClientPreKeyBundle } from '../protocol/signal/prekey-upload'
import { proto } from '../transport/protos'

export interface CreateFakePeerOptions {
    /** JID this peer presents as (e.g. `5511888888888@s.whatsapp.net`). */
    readonly jid: string
    /** Optional display name pushed via the `notify` attribute. */
    readonly displayName?: string
    /** Optional pre-generated identity (default: random). */
    readonly identity?: FakePeerIdentity
}

export interface SendMessageOptions {
    /** Message id (default: auto-generated). */
    readonly id?: string
    /** Unix-seconds timestamp (default: now). */
    readonly t?: number
    /** Stanza-level type (default: `text`). */
    readonly type?: string
}

interface FakePeerDeps {
    readonly bundleResolver: () => Promise<ClientPreKeyBundle>
    readonly pushStanza: (node: ReturnType<typeof buildMessage>) => Promise<void>
}

export class FakePeer {
    public readonly jid: string
    public readonly displayName?: string
    public readonly identity: FakePeerIdentity

    private readonly deps: FakePeerDeps
    private session: FakePeerSession | null = null
    private nextMessageCounter = 0

    private constructor(
        identity: FakePeerIdentity,
        options: CreateFakePeerOptions,
        deps: FakePeerDeps
    ) {
        this.identity = identity
        this.jid = options.jid
        this.displayName = options.displayName
        this.deps = deps
    }

    public static async create(
        options: CreateFakePeerOptions,
        deps: FakePeerDeps
    ): Promise<FakePeer> {
        const identity = options.identity ?? (await generateFakePeerIdentity())
        return new FakePeer(identity, options, deps)
    }

    /**
     * Encrypts a `Message` proto and pushes it to the connected client.
     * The first call resolves the client's prekey bundle (which captures
     * it from a prekey upload IQ if it has not been seen yet) and runs
     * X3DH to set up the session.
     */
    public async sendMessage(
        message: proto.IMessage,
        options: SendMessageOptions = {}
    ): Promise<void> {
        await this.ensureSession()
        const session = this.session
        if (!session) {
            throw new Error('fake peer session was not established')
        }

        const plaintext = encodePlaintextWithPadding(message)
        const { type, ciphertext } = await session.encrypt(plaintext)

        const enc: FakeEncChild = { type, ciphertext }
        const id = options.id ?? this.nextId()
        const stanza = buildMessage({
            id,
            from: this.jid,
            t: options.t,
            type: options.type ?? 'text',
            notify: this.displayName,
            enc: [enc]
        })
        await this.deps.pushStanza(stanza)
    }

    /**
     * Convenience for the most common case: an `extendedTextMessage` /
     * `conversation` payload carrying a single string.
     */
    public sendConversation(text: string, options: SendMessageOptions = {}): Promise<void> {
        return this.sendMessage({ conversation: text }, options)
    }

    private async ensureSession(): Promise<void> {
        if (this.session) return
        const bundle = await this.deps.bundleResolver()
        this.session = await FakePeerSession.initiate(this.identity, bundle)
    }

    private nextId(): string {
        this.nextMessageCounter += 1
        return `${this.jid}-${Date.now()}-${this.nextMessageCounter}`
    }
}

/**
 * Encodes a `Message` proto with the WhatsApp-style PKCS-padded plaintext
 * the lib's signal layer expects. The padding scheme:
 *
 *     plaintext = encode(message) || repeat(padLen, padLen)
 *
 * where `padLen = 16 - (encode(message).length % 16)`. This is the same
 * padding the lib applies on the send side; the receive side strips it.
 */
function encodePlaintextWithPadding(message: proto.IMessage): Uint8Array {
    const encoded = proto.Message.encode(message).finish()
    const padLen = 16 - (encoded.byteLength % 16)
    const out = new Uint8Array(encoded.byteLength + padLen)
    out.set(encoded, 0)
    for (let i = encoded.byteLength; i < out.byteLength; i += 1) {
        out[i] = padLen
    }
    return out
}
