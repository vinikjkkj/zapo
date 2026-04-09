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

import {
    type BuildAppStateSyncKeyShareInput,
    buildAppStateSyncKeyShareMessage
} from '../protocol/push/app-state-key-share'
import {
    type BuildHistorySyncExternalInput,
    buildHistorySyncExternalMessage,
    type BuildHistorySyncInput,
    buildHistorySyncMessage
} from '../protocol/push/history-sync'
import { buildMessage, type FakeEncChild } from '../protocol/push/message'
import { FakePeerGroupRecvSession } from '../protocol/signal/fake-peer-group-recv-session'
import {
    type FakePeerKeyBundle,
    generateFakePeerKeyBundle
} from '../protocol/signal/fake-peer-key-bundle'
import { FakePeerRecvSession } from '../protocol/signal/fake-peer-recv-session'
import { type FakePeerIdentity, FakePeerSession } from '../protocol/signal/fake-peer-session'
import { FakeSenderKey } from '../protocol/signal/fake-sender-key'
import type { ClientPreKeyBundle } from '../protocol/signal/prekey-upload'
import type { BinaryNode } from '../transport/codec'
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
    /**
     * Override the `from` attribute of the outbound `<message>` stanza.
     * Defaults to the peer's own JID. Useful for status broadcasts
     * (`status@broadcast`), where the wire `from` is the broadcast jid
     * and the peer jid travels in `participant`.
     */
    readonly from?: string
    /**
     * Override the `participant` attribute. Defaults to undefined for
     * 1:1 messages. For status broadcasts, the lib expects the
     * peer-device JID here.
     */
    readonly participant?: string
}

export interface ReceivedMessage {
    /** Decrypted, depadded `Message` proto. */
    readonly message: proto.IMessage
    /** Original `<message>` stanza the lib sent. */
    readonly stanza: BinaryNode
    /** Type of the matching `<enc>` child the test asserts against. */
    readonly encType: 'pkmsg' | 'msg' | 'skmsg'
}

export interface ExpectMessageOptions {
    readonly timeoutMs?: number
}

export interface ExpectGroupMessageOptions extends ExpectMessageOptions {
    /**
     * Override the senderJid the lib used when bootstrapping the
     * SenderKey chain. Required for outbound `<message to=group-jid>`
     * stanzas, which carry no `participant` attribute (the lib's own
     * meJid is the implicit sender).
     */
    readonly senderJid?: string
}

interface FakePeerDeps {
    readonly bundleResolver: () => Promise<ClientPreKeyBundle>
    readonly pushStanza: (node: ReturnType<typeof buildMessage>) => Promise<void>
    /**
     * Subscribes to inbound `<message to="<peer-jid>"/>` stanzas the
     * real client sends to this peer. Used by `expectMessage` to capture
     * + decrypt outbound messages.
     */
    readonly subscribeInboundMessages: (listener: (stanza: BinaryNode) => void) => () => void
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
    private readonly recvSession: FakePeerRecvSession
    private readonly groupRecvSession = new FakePeerGroupRecvSession()

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
        this.recvSession = new FakePeerRecvSession(keyBundle)
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
            from: options.from ?? this.jid,
            t: options.t,
            type: options.type ?? 'text',
            notify: this.displayName,
            participant: options.participant,
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
     * Encrypts and pushes a `protocolMessage.editedMessage` carrying a
     * fresh `conversation` payload that supersedes a previous message.
     * The lib's incoming-message dispatcher routes the protocol message
     * to its edit handler and emits a `message_protocol` event of type
     * `MESSAGE_EDIT`.
     */
    public async sendMessageEdit(
        input: {
            readonly targetMessageId: string
            readonly newText: string
        },
        options: SendMessageOptions = {}
    ): Promise<void> {
        await this.sendMessage(
            {
                protocolMessage: {
                    type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                    key: {
                        remoteJid: this.jid,
                        fromMe: false,
                        id: input.targetMessageId
                    },
                    timestampMs: Date.now(),
                    editedMessage: {
                        conversation: input.newText
                    }
                }
            },
            options
        )
    }

    /**
     * Encrypts and pushes a `protocolMessage` of type `REVOKE` that
     * deletes a previously-sent message for the recipient.
     */
    public async sendMessageRevoke(
        input: {
            readonly targetMessageId: string
        },
        options: SendMessageOptions = {}
    ): Promise<void> {
        await this.sendMessage(
            {
                protocolMessage: {
                    type: proto.Message.ProtocolMessage.Type.REVOKE,
                    key: {
                        remoteJid: this.jid,
                        fromMe: false,
                        id: input.targetMessageId
                    }
                }
            },
            options
        )
    }

    /**
     * Encrypts and pushes a `reactionMessage` (e.g. an emoji reaction
     * to a previously-sent message). Pass an empty `text` to remove a
     * prior reaction.
     */
    public async sendReaction(
        input: {
            readonly targetMessageId: string
            readonly emoji: string
        },
        options: SendMessageOptions = {}
    ): Promise<void> {
        await this.sendMessage(
            {
                reactionMessage: {
                    key: {
                        remoteJid: this.jid,
                        fromMe: false,
                        id: input.targetMessageId
                    },
                    text: input.emoji,
                    senderTimestampMs: Date.now()
                }
            },
            options
        )
    }

    /**
     * Encrypts and pushes a `historySyncNotification` carrying an inline,
     * zlib-compressed `HistorySync` proto. The lib processes it via
     * `processHistorySyncNotification` and emits a single
     * `history_sync_chunk` event with the conversation/pushname counts.
     */
    public async sendHistorySync(
        input: BuildHistorySyncInput = {},
        options: SendMessageOptions = {}
    ): Promise<void> {
        const message = await buildHistorySyncMessage(input)
        await this.sendMessage(message, options)
    }

    /**
     * External-blob variant of `sendHistorySync`: encrypts and pushes a
     * `historySyncNotification` whose `directPath`/`mediaKey`/`fileSha256`
     * point at a previously-published media blob (typically minted via
     * `FakeWaServer.publishMediaBlob({ mediaType: 'history', plaintext })`).
     *
     * The lib's `processHistorySyncNotification` falls through to its
     * media transfer client, downloads the encrypted bytes from the
     * fake server's HTTP listener, decrypts via real `WaMediaCrypto`,
     * and emits a single `history_sync_chunk` event.
     */
    public async sendHistorySyncExternal(
        input: BuildHistorySyncExternalInput,
        options: SendMessageOptions = {}
    ): Promise<void> {
        const message = buildHistorySyncExternalMessage(input)
        await this.sendMessage(message, options)
    }

    /**
     * Convenience for an `imageMessage` whose payload bytes have
     * already been encrypted + published via
     * `FakeWaServer.publishMediaBlob({ mediaType: 'image', plaintext })`.
     * The lib's incoming-message dispatcher emits the standard `message`
     * event; the test can then call
     * `client.mediaTransfer.downloadAndDecrypt({ directPath, mediaType: 'image', mediaKey, fileSha256, fileEncSha256 })`
     * to round-trip the bytes through the lib's real media transfer
     * client.
     */
    public async sendImageMessage(
        input: {
            readonly directPath: string
            readonly mediaKey: Uint8Array
            readonly fileSha256: Uint8Array
            readonly fileEncSha256: Uint8Array
            readonly fileLength: number
            readonly mimetype?: string
            readonly caption?: string
            readonly width?: number
            readonly height?: number
        },
        options: SendMessageOptions = {}
    ): Promise<void> {
        await this.sendMessage(
            {
                imageMessage: {
                    url: input.directPath,
                    directPath: input.directPath,
                    mediaKey: input.mediaKey,
                    fileSha256: input.fileSha256,
                    fileEncSha256: input.fileEncSha256,
                    fileLength: input.fileLength,
                    mimetype: input.mimetype ?? 'image/jpeg',
                    caption: input.caption,
                    width: input.width,
                    height: input.height,
                    mediaKeyTimestamp: Math.floor(Date.now() / 1_000)
                }
            },
            options
        )
    }

    /**
     * Convenience for a `videoMessage` mirroring `sendImageMessage`.
     */
    public async sendVideoMessage(
        input: {
            readonly directPath: string
            readonly mediaKey: Uint8Array
            readonly fileSha256: Uint8Array
            readonly fileEncSha256: Uint8Array
            readonly fileLength: number
            readonly mimetype?: string
            readonly caption?: string
            readonly seconds?: number
            readonly width?: number
            readonly height?: number
        },
        options: SendMessageOptions = {}
    ): Promise<void> {
        await this.sendMessage(
            {
                videoMessage: {
                    url: input.directPath,
                    directPath: input.directPath,
                    mediaKey: input.mediaKey,
                    fileSha256: input.fileSha256,
                    fileEncSha256: input.fileEncSha256,
                    fileLength: input.fileLength,
                    mimetype: input.mimetype ?? 'video/mp4',
                    caption: input.caption,
                    seconds: input.seconds,
                    width: input.width,
                    height: input.height,
                    mediaKeyTimestamp: Math.floor(Date.now() / 1_000)
                }
            },
            options
        )
    }

    /**
     * Convenience for an `audioMessage`. Pass `ptt: true` to mark it
     * as a push-to-talk voice note (the `mediaType` for the blob
     * should still be `'ptt'` rather than `'audio'` in that case).
     */
    public async sendAudioMessage(
        input: {
            readonly directPath: string
            readonly mediaKey: Uint8Array
            readonly fileSha256: Uint8Array
            readonly fileEncSha256: Uint8Array
            readonly fileLength: number
            readonly mimetype?: string
            readonly seconds?: number
            readonly ptt?: boolean
        },
        options: SendMessageOptions = {}
    ): Promise<void> {
        await this.sendMessage(
            {
                audioMessage: {
                    url: input.directPath,
                    directPath: input.directPath,
                    mediaKey: input.mediaKey,
                    fileSha256: input.fileSha256,
                    fileEncSha256: input.fileEncSha256,
                    fileLength: input.fileLength,
                    mimetype: input.mimetype ?? (input.ptt ? 'audio/ogg' : 'audio/mp4'),
                    seconds: input.seconds,
                    ptt: input.ptt,
                    mediaKeyTimestamp: Math.floor(Date.now() / 1_000)
                }
            },
            options
        )
    }

    /**
     * Convenience for a `documentMessage`.
     */
    public async sendDocumentMessage(
        input: {
            readonly directPath: string
            readonly mediaKey: Uint8Array
            readonly fileSha256: Uint8Array
            readonly fileEncSha256: Uint8Array
            readonly fileLength: number
            readonly mimetype?: string
            readonly title?: string
            readonly fileName?: string
            readonly pageCount?: number
        },
        options: SendMessageOptions = {}
    ): Promise<void> {
        await this.sendMessage(
            {
                documentMessage: {
                    url: input.directPath,
                    directPath: input.directPath,
                    mediaKey: input.mediaKey,
                    fileSha256: input.fileSha256,
                    fileEncSha256: input.fileEncSha256,
                    fileLength: input.fileLength,
                    mimetype: input.mimetype ?? 'application/pdf',
                    title: input.title,
                    fileName: input.fileName,
                    pageCount: input.pageCount,
                    mediaKeyTimestamp: Math.floor(Date.now() / 1_000)
                }
            },
            options
        )
    }

    /**
     * Convenience for a `stickerMessage`.
     */
    public async sendStickerMessage(
        input: {
            readonly directPath: string
            readonly mediaKey: Uint8Array
            readonly fileSha256: Uint8Array
            readonly fileEncSha256: Uint8Array
            readonly fileLength: number
            readonly mimetype?: string
            readonly width?: number
            readonly height?: number
            readonly isAnimated?: boolean
        },
        options: SendMessageOptions = {}
    ): Promise<void> {
        await this.sendMessage(
            {
                stickerMessage: {
                    url: input.directPath,
                    directPath: input.directPath,
                    mediaKey: input.mediaKey,
                    fileSha256: input.fileSha256,
                    fileEncSha256: input.fileEncSha256,
                    fileLength: input.fileLength,
                    mimetype: input.mimetype ?? 'image/webp',
                    width: input.width,
                    height: input.height,
                    isAnimated: input.isAnimated,
                    mediaKeyTimestamp: Math.floor(Date.now() / 1_000)
                }
            },
            options
        )
    }

    /**
     * Encrypts and pushes a `protocolMessage.appStateSyncKeyShare`
     * carrying one or more sync keys. The lib's incoming message
     * dispatcher persists the keys via `WaAppStateStore.upsertSyncKeys`
     * and auto-triggers a `syncAppState()` round.
     */
    public async sendAppStateSyncKeyShare(
        input: BuildAppStateSyncKeyShareInput,
        options: SendMessageOptions = {}
    ): Promise<void> {
        const message = buildAppStateSyncKeyShareMessage(input)
        await this.sendMessage(message, options)
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

    /**
     * Captures the next inbound 1:1 `<message to=this.jid>` stanza the
     * real client sends, decrypts the matching `<enc>` child via the
     * recv session, decodes the `proto.Message` and resolves it.
     */
    public expectMessage(options: ExpectMessageOptions = {}): Promise<ReceivedMessage> {
        const timeoutMs = options.timeoutMs ?? 5_000
        return new Promise<ReceivedMessage>((resolve, reject) => {
            let unsubscribe: (() => void) | null = null
            const timer = setTimeout(() => {
                if (unsubscribe) unsubscribe()
                reject(new Error(`FakePeer.expectMessage timed out after ${timeoutMs}ms`))
            }, timeoutMs)

            unsubscribe = this.deps.subscribeInboundMessages((stanza) => {
                // Skip group messages — those are handled by
                // `expectGroupMessage`. For 1:1 messages the wire `to`
                // is either this peer's exact device JID (single-device
                // case) or the bare user JID with multiple device-
                // suffixed children inside <participants> (multi-device
                // fanout). `findEncForPeer` walks both shapes and
                // returns the matching <enc> if any.
                const to = stanza.attrs.to ?? ''
                if (to.endsWith('@g.us')) return
                const enc = findEncForPeer(stanza, this.jid)
                if (!enc) return
                const encType = enc.attrs.type
                if (encType !== 'pkmsg' && encType !== 'msg') return
                const ciphertext = enc.content
                if (!(ciphertext instanceof Uint8Array)) return
                this.decryptPairwise(encType, ciphertext)
                    .then((message) => {
                        clearTimeout(timer)
                        if (unsubscribe) unsubscribe()
                        resolve({ message, stanza, encType })
                    })
                    .catch((error) => {
                        clearTimeout(timer)
                        if (unsubscribe) unsubscribe()
                        reject(error instanceof Error ? error : new Error(String(error)))
                    })
            })
        })
    }

    /**
     * Captures the next inbound group `<message to=groupJid>` stanza the
     * real client sends, decrypts the bootstrap `<enc type=pkmsg|msg>`
     * child addressed to this peer (extracting the SKDM), then decrypts
     * the top-level `<enc type=skmsg>` child via the group recv session.
     *
     * On subsequent calls in the same chain the bootstrap pkmsg is
     * absent and only the skmsg is decrypted using the previously
     * stored sender key state.
     */
    public expectGroupMessage(
        groupJid: string,
        options: ExpectGroupMessageOptions = {}
    ): Promise<ReceivedMessage> {
        const timeoutMs = options.timeoutMs ?? 5_000
        return new Promise<ReceivedMessage>((resolve, reject) => {
            let unsubscribe: (() => void) | null = null
            const timer = setTimeout(() => {
                if (unsubscribe) unsubscribe()
                reject(new Error(`FakePeer.expectGroupMessage timed out after ${timeoutMs}ms`))
            }, timeoutMs)

            unsubscribe = this.deps.subscribeInboundMessages((stanza) => {
                if (stanza.attrs.to !== groupJid) return
                const skmsg = findTopLevelEnc(stanza, 'skmsg')
                if (!skmsg || !(skmsg.content instanceof Uint8Array)) return
                // Outbound group <message to=group-jid> stanzas have no
                // `participant` attribute (the sender is the lib client
                // itself). The test must pass the expected sender jid in
                // `options.senderJid` to identify the senderkey state.
                const senderJid = options.senderJid ?? stanza.attrs.participant
                if (!senderJid) {
                    return
                }
                this.bootstrapAndDecryptGroup(senderJid, groupJid, stanza, skmsg.content)
                    .then((message) => {
                        clearTimeout(timer)
                        if (unsubscribe) unsubscribe()
                        resolve({ message, stanza, encType: 'skmsg' as const })
                    })
                    .catch((error) => {
                        clearTimeout(timer)
                        if (unsubscribe) unsubscribe()
                        reject(error instanceof Error ? error : new Error(String(error)))
                    })
            })
        })
    }

    private async decryptPairwise(
        encType: 'pkmsg' | 'msg',
        ciphertext: Uint8Array
    ): Promise<proto.IMessage> {
        const padded =
            encType === 'pkmsg'
                ? await this.recvSession.decryptPreKeyMessage(ciphertext)
                : await this.recvSession.decryptMessage(ciphertext)
        return proto.Message.decode(padded)
    }

    private async bootstrapAndDecryptGroup(
        senderJid: string,
        groupJid: string,
        stanza: BinaryNode,
        skmsgCiphertext: Uint8Array
    ): Promise<proto.IMessage> {
        // Look for the per-recipient bootstrap enc inside <participants><to jid=peer.jid>.
        const bootstrap = findEncForPeer(stanza, this.jid)
        if (bootstrap && bootstrap.content instanceof Uint8Array) {
            const bootstrapType = bootstrap.attrs.type
            if (bootstrapType === 'pkmsg' || bootstrapType === 'msg') {
                const padded =
                    bootstrapType === 'pkmsg'
                        ? await this.recvSession.decryptPreKeyMessage(bootstrap.content)
                        : await this.recvSession.decryptMessage(bootstrap.content)
                const innerMessage = proto.Message.decode(padded)
                const skdm = innerMessage.senderKeyDistributionMessage
                const axolotl = skdm?.axolotlSenderKeyDistributionMessage
                if (axolotl) {
                    this.groupRecvSession.addDistribution(groupJid, senderJid, axolotl)
                }
            }
        }
        const padded = await this.groupRecvSession.decryptGroupMessage(
            groupJid,
            senderJid,
            skmsgCiphertext
        )
        return proto.Message.decode(padded)
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
/**
 * Finds the `<enc>` child addressed to the given peer jid. Walks both
 * the direct-fanout shape (`<message><enc/></message>`) and the group
 * fanout shape (`<message><participants><to jid=peer><enc/></to></participants></message>`).
 */
function findEncForPeer(stanza: BinaryNode, peerJid: string): BinaryNode | null {
    if (!Array.isArray(stanza.content)) return null
    for (const child of stanza.content) {
        if (child.tag === 'enc' && stanza.attrs.to === peerJid) {
            return child
        }
        if (child.tag === 'participants' && Array.isArray(child.content)) {
            for (const toNode of child.content) {
                if (toNode.tag !== 'to' || toNode.attrs.jid !== peerJid) continue
                if (!Array.isArray(toNode.content)) continue
                for (const inner of toNode.content) {
                    if (inner.tag === 'enc') return inner
                }
            }
        }
    }
    return null
}

function findTopLevelEnc(stanza: BinaryNode, type: string): BinaryNode | null {
    if (!Array.isArray(stanza.content)) return null
    for (const child of stanza.content) {
        if (child.tag === 'enc' && child.attrs.type === type) {
            return child
        }
    }
    return null
}

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
