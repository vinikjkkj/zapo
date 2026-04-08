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
    type FakePeerKeyBundle,
    generateFakePeerKeyBundle
} from '../protocol/signal/fake-peer-key-bundle'
import { type FakePeerIdentity, FakePeerSession } from '../protocol/signal/fake-peer-session'
import { FakeSenderKey } from '../protocol/signal/fake-sender-key'
import type { ClientPreKeyBundle } from '../protocol/signal/prekey-upload'
import { proto } from '../transport/protos'

export interface CreateFakePeerOptions {
    /** JID this peer presents as (e.g. `5511888888888@s.whatsapp.net`). */
    readonly jid: string
    /** Optional display name pushed via the `notify` attribute. */
    readonly displayName?: string
    /** Optional pre-generated key bundle (default: freshly generated). */
    readonly keyBundle?: FakePeerKeyBundle
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
    public readonly keyBundle: FakePeerKeyBundle
    public readonly identity: FakePeerIdentity

    private readonly deps: FakePeerDeps
    private session: FakePeerSession | null = null
    private nextMessageCounter = 0
    private readonly senderKeysByGroup = new Map<string, FakeSenderKey>()
    private readonly groupsBootstrapped = new Set<string>()

    private constructor(
        keyBundle: FakePeerKeyBundle,
        options: CreateFakePeerOptions,
        deps: FakePeerDeps
    ) {
        this.keyBundle = keyBundle
        this.identity = {
            identityKeyPair: keyBundle.identityKeyPair,
            registrationId: keyBundle.registrationId
        }
        this.jid = options.jid
        this.displayName = options.displayName
        this.deps = deps
    }

    public static async create(
        options: CreateFakePeerOptions,
        deps: FakePeerDeps
    ): Promise<FakePeer> {
        const keyBundle = options.keyBundle ?? (await generateFakePeerKeyBundle())
        return new FakePeer(keyBundle, options, deps)
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

    /**
     * Sends a SenderKey-encrypted **group** message.
     *
     * The first message in a given group bootstraps the recipient's sender
     * key state via a pairwise `<message><enc type="pkmsg"/>` whose
     * decrypted `Message.senderKeyDistributionMessage` field hands the
     * SKDM to the lib. The actual content is then pushed in a separate
     * group `<message from="<group>" participant="<peer>">` carrying an
     * `<enc type="skmsg"/>` ciphertext.
     *
     * On subsequent calls only the `<enc type="skmsg"/>` stanza is pushed.
     */
    public async sendGroupConversation(
        groupJid: string,
        text: string,
        options: SendMessageOptions = {}
    ): Promise<void> {
        return this.sendGroupMessage(groupJid, { conversation: text }, options)
    }

    public async sendGroupMessage(
        groupJid: string,
        message: proto.IMessage,
        options: SendMessageOptions = {}
    ): Promise<void> {
        // Lazily create the sender key for this group.
        let senderKey = this.senderKeysByGroup.get(groupJid)
        if (!senderKey) {
            senderKey = await FakeSenderKey.generate()
            this.senderKeysByGroup.set(groupJid, senderKey)
        }

        const plaintext = encodePlaintextWithPadding(message)
        const { ciphertext, distributionMessage } = await senderKey.encrypt(plaintext)

        // The lib's incoming-message dispatcher walks every <enc> child in
        // a single <message> stanza in order. We bundle the SKDM-carrying
        // pkmsg first and the actual skmsg second so the lib's sender key
        // store is populated in time for the skmsg decrypt step.
        const encChildren: FakeEncChild[] = []

        if (!this.groupsBootstrapped.has(groupJid)) {
            await this.ensureSession()
            const session = this.session
            if (!session) {
                throw new Error('fake peer session was not established')
            }
            const bootstrapPlaintext = encodePlaintextWithPadding({
                senderKeyDistributionMessage: {
                    groupId: groupJid,
                    axolotlSenderKeyDistributionMessage: distributionMessage
                }
            })
            const { type: pkType, ciphertext: pkCt } = await session.encrypt(bootstrapPlaintext)
            encChildren.push({ type: pkType, ciphertext: pkCt })
            this.groupsBootstrapped.add(groupJid)
        }

        encChildren.push({ type: 'skmsg', ciphertext })

        const groupStanza = buildMessage({
            id: options.id ?? this.nextId(),
            from: groupJid,
            participant: this.jid,
            t: options.t,
            type: options.type ?? 'text',
            notify: this.displayName,
            enc: encChildren
        })
        await this.deps.pushStanza(groupStanza)
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
