/** Fake peer used by tests to encrypt and push Signal messages to the lib. */

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
import { FakePeerDoubleRatchet } from '../protocol/signal/fake-peer-double-ratchet'
import { FakePeerGroupRecvSession } from '../protocol/signal/fake-peer-group-recv-session'
import type { FakePeerIdentity } from '../protocol/signal/fake-peer-identity'
import {
    type FakePeerKeyBundle,
    generateFakePeerKeyBundle
} from '../protocol/signal/fake-peer-key-bundle'
import { FakeSenderKey } from '../protocol/signal/fake-sender-key'
import type { ClientPreKeyBundle } from '../protocol/signal/prekey-upload'
import type { BinaryNode } from '../transport/codec'
import { proto } from '../transport/protos'

export interface CreateFakePeerOptions {
    readonly jid: string
    readonly displayName?: string
    readonly keyBundle?: FakePeerKeyBundle
    readonly skipOneTimePreKey?: boolean
    /**
     * Stash every outbound (id → plaintext + pristine ciphertext) so
     * tests / benches can drive replays via {@link FakePeer.replaySentMessage}.
     * Off by default to avoid inflating the fixture's heap on long
     * memory-focused runs that never replay.
     */
    readonly enableReplayCache?: boolean
}

export interface SendMessageOptions {
    readonly id?: string
    readonly t?: number
    readonly type?: string
    readonly from?: string
    readonly participant?: string
    /** Mutates ciphertext before wrapping in `<enc>` (for corruption tests). */
    readonly tamperCiphertext?: (ciphertext: Uint8Array) => Uint8Array
}

export interface ReceivedMessage {
    readonly message: proto.IMessage
    readonly stanza: BinaryNode
    readonly encType: 'pkmsg' | 'msg' | 'skmsg'
}

export interface ExpectMessageOptions {
    readonly timeoutMs?: number
}

export interface ExpectGroupMessageOptions extends ExpectMessageOptions {
    readonly senderJid?: string
}

interface FakePeerDeps {
    readonly bundleResolver: () => Promise<ClientPreKeyBundle>
    readonly reserveOneTimePreKey?: () => {
        readonly keyId: number
        readonly publicKey: Uint8Array
    } | null
    readonly pushStanza: (node: ReturnType<typeof buildMessage>) => Promise<void>
    readonly subscribeInboundMessages: (listener: (stanza: BinaryNode) => void) => () => void
}

export class FakePeer {
    public readonly jid: string
    public readonly displayName?: string
    public keyBundle: FakePeerKeyBundle
    public readonly identity: FakePeerIdentity

    private readonly deps: FakePeerDeps
    private ratchet: FakePeerDoubleRatchet
    private readonly skipOneTimePreKey: boolean
    private reservedOneTimePreKey: {
        readonly keyId: number
        readonly publicKey: Uint8Array
    } | null
    private ratchetInitiated = false
    private nextMessageCounter = 0
    private readonly replayCacheEnabled: boolean
    private readonly sentPlaintextById = new Map<string, proto.IMessage>()
    private readonly sentEncryptedById = new Map<
        string,
        { readonly type: 'pkmsg' | 'msg'; readonly ciphertext: Uint8Array }
    >()
    private readonly senderKeysByGroup = new Map<string, FakeSenderKey>()
    private readonly groupsBootstrapped = new Set<string>()
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
        this.skipOneTimePreKey = options.skipOneTimePreKey === true
        this.replayCacheEnabled = options.enableReplayCache === true
        this.reservedOneTimePreKey =
            !this.skipOneTimePreKey && deps.reserveOneTimePreKey
                ? deps.reserveOneTimePreKey()
                : null
        this.ratchet = new FakePeerDoubleRatchet(keyBundle)
    }

    public static async create(
        options: CreateFakePeerOptions,
        deps: FakePeerDeps
    ): Promise<FakePeer> {
        const keyBundle = options.keyBundle ?? (await generateFakePeerKeyBundle())
        return new FakePeer(keyBundle, options, deps)
    }

    public async sendMessage(
        message: proto.IMessage,
        options: SendMessageOptions = {}
    ): Promise<void> {
        await this.ensureRatchetInitiated()

        const plaintext = encodePlaintextWithPadding(message)
        const { type, ciphertext } = await this.ratchet.encrypt(plaintext)
        const finalCiphertext = options.tamperCiphertext
            ? options.tamperCiphertext(ciphertext)
            : ciphertext

        const enc: FakeEncChild = { type, ciphertext: finalCiphertext }
        const id = options.id ?? this.nextId()
        if (this.replayCacheEnabled) {
            // Stash the plaintext so the bench / a test can replay this
            // exact payload later in response to an incoming retry
            // receipt from the lib (replaySentMessage). Also stash the
            // PRISTINE ciphertext (pre-tamper) + signal type so a
            // replay can put the original frame back on the wire –
            // matches how a real Signal sender re-sends after a
            // recipient asks for retry: same counter + ratchet key,
            // just an uncorrupted body.
            this.sentPlaintextById.set(id, message)
            this.sentEncryptedById.set(id, { type, ciphertext })
        }
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
     * Re-encrypts and re-pushes a previously sent message identified by
     * `originalMsgId`. Used by tests / benches that exercise the lib's
     * incoming-retry path: after the lib emits `<receipt type="retry">`
     * back to this peer, the peer is expected to re-send the same
     * plaintext so the lib can decrypt it successfully on the second
     * attempt.
     *
     * The replay reuses the original stanza id by default so the lib's
     * dedup logic (and tests that wait for a specific id) see the resend
     * as a continuation of the same outbound. Pass `resendId` to use a
     * different id.
     */
    public async replaySentMessage(
        originalMsgId: string,
        options: { readonly resendId?: string } = {}
    ): Promise<void> {
        const stored = this.sentEncryptedById.get(originalMsgId)
        if (stored) {
            // Re-send the pristine ciphertext – same Signal counter +
            // ratchet key as the original send, just without the
            // tamper. The lib's recv chain still has the message key
            // for that counter, so this is the recovery path real
            // WhatsApp peers walk after observing a retry receipt for
            // a frame the recipient failed to decrypt.
            const enc: FakeEncChild = { type: stored.type, ciphertext: stored.ciphertext }
            const id = options.resendId ?? originalMsgId
            const stanza = buildMessage({
                id,
                from: this.jid,
                type: 'text',
                notify: this.displayName,
                enc: [enc]
            })
            await this.deps.pushStanza(stanza)
            return
        }
        const message = this.sentPlaintextById.get(originalMsgId)
        if (!message) {
            throw new Error(`FakePeer.replaySentMessage: no sent plaintext for id ${originalMsgId}`)
        }
        await this.sendMessage(message, { id: options.resendId ?? originalMsgId })
    }

    /**
     * Rotates the peer's prekey material and resets the Signal session
     * state so the lib has to re-run X3DH on the next outbound. Keeps
     * the identity key pair (same user) but issues a new signed prekey
     * + new one-time prekey set. After this call:
     *   - `keyBundle` reflects the new material;
     *   - the underlying `FakePeerDoubleRatchet` is fresh – the next
     *     inbound from the lib must be a `pkmsg` (initial signal
     *     message), which the new `keyBundle` is wired to decrypt;
     *   - any cached one-time prekey reservation in the dispenser is
     *     dropped so subsequent retry-receipts include this peer's new
     *     keys directly via {@link sendRetryReceipt}.
     *
     * Use this to simulate the "session lost" scenario that real
     * WhatsApp clients trigger when they need the sender to fully
     * re-bootstrap the Signal session via the retry-receipt path.
     */
    public async rotateForRetry(): Promise<void> {
        const refreshed = await generateFakePeerKeyBundle({
            identityKeyPair: this.keyBundle.identityKeyPair,
            registrationId: this.keyBundle.registrationId,
            signedPreKeyId: this.keyBundle.signedPreKey.id + 1,
            firstOneTimePreKeyId:
                (this.keyBundle.oneTimePreKeys[this.keyBundle.oneTimePreKeys.length - 1]?.id ?? 0) +
                1
        })
        this.keyBundle = refreshed
        this.ratchet = new FakePeerDoubleRatchet(refreshed)
        this.ratchetInitiated = false
        this.reservedOneTimePreKey = null
    }

    public sendConversation(text: string, options: SendMessageOptions = {}): Promise<void> {
        return this.sendMessage({ conversation: text }, options)
    }

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

    public async sendHistorySync(
        input: BuildHistorySyncInput = {},
        options: SendMessageOptions = {}
    ): Promise<void> {
        const message = await buildHistorySyncMessage(input)
        await this.sendMessage(message, options)
    }

    public async sendHistorySyncExternal(
        input: BuildHistorySyncExternalInput,
        options: SendMessageOptions = {}
    ): Promise<void> {
        const message = buildHistorySyncExternalMessage(input)
        await this.sendMessage(message, options)
    }

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

    public async sendAppStateSyncKeyShare(
        input: BuildAppStateSyncKeyShareInput,
        options: SendMessageOptions = {}
    ): Promise<void> {
        const message = buildAppStateSyncKeyShareMessage(input)
        await this.sendMessage(message, options)
    }

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
        let senderKey = this.senderKeysByGroup.get(groupJid)
        if (!senderKey) {
            senderKey = await FakeSenderKey.generate()
            this.senderKeysByGroup.set(groupJid, senderKey)
        }

        const plaintext = encodePlaintextWithPadding(message)
        const { ciphertext, distributionMessage } = await senderKey.encrypt(plaintext)

        // Seed the sender key before the first skmsg for this group.
        const encChildren: FakeEncChild[] = []

        if (!this.groupsBootstrapped.has(groupJid)) {
            await this.ensureRatchetInitiated()
            const bootstrapPlaintext = encodePlaintextWithPadding({
                senderKeyDistributionMessage: {
                    groupId: groupJid,
                    axolotlSenderKeyDistributionMessage: distributionMessage
                }
            })
            const { type: pkType, ciphertext: pkCt } =
                await this.ratchet.encrypt(bootstrapPlaintext)
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
     * Sends a `<receipt type="retry">` stanza to the lib asking it to
     * re-encrypt and re-send the message identified by `originalMsgId`.
     * Used by benches / tests that exercise the lib's outbound retry
     * replay path.
     *
     * Shape matches WhatsApp Web's `WAWebRetryRequestParser`:
     * `<receipt id type=retry from t><retry id count?/><registration>4B</registration>[<keys>...</keys>]</receipt>`.
     *
     * When `includeKeys` is true (default), the `<keys>` block carries
     * the peer's current identity + signed prekey + one-time prekey.
     * This forces the lib's `WaRetryCoordinator` to tear down the
     * existing session and re-run X3DH against these fresh keys before
     * re-encrypting the original payload, so the resend lands as a
     * `pkmsg` against the peer's *new* prekey state. Pair this with
     * {@link rotateForRetry} to simulate full session loss + recovery.
     *
     * `<device-identity>` is omitted: it's `maybeChild` in wa-web and
     * also optional in the lib's parser. The fake-peer fixture doesn't
     * have an ADV primary-device to sign one, and the lib's outbound
     * retry replay path does not require it.
     */
    public async sendRetryReceipt(
        originalMsgId: string,
        options: {
            readonly count?: number
            readonly receiptId?: string
            readonly t?: number
            readonly error?: number
            readonly includeKeys?: boolean
        } = {}
    ): Promise<void> {
        const receiptId = options.receiptId ?? originalMsgId
        const retryCount = options.count ?? 1
        const t = options.t ?? Math.floor(Date.now() / 1_000)
        const error = options.error
        const includeKeys = options.includeKeys !== false
        const registration = new Uint8Array(4)
        const regId = this.keyBundle.registrationId & 0xffffffff
        registration[0] = (regId >>> 24) & 0xff
        registration[1] = (regId >>> 16) & 0xff
        registration[2] = (regId >>> 8) & 0xff
        registration[3] = regId & 0xff

        const retryAttrs: Record<string, string> = {
            v: '1',
            count: String(retryCount),
            id: originalMsgId,
            t: String(t)
        }
        if (error !== undefined && error !== 0) {
            retryAttrs.error = String(error)
        }

        const content: BinaryNode[] = [
            {
                tag: 'retry',
                attrs: retryAttrs
            },
            {
                tag: 'registration',
                attrs: {},
                content: registration
            }
        ]

        if (includeKeys) {
            content.push(this.buildRetryKeysNode())
        }

        const receipt: BinaryNode = {
            tag: 'receipt',
            attrs: {
                id: receiptId,
                from: this.jid,
                type: 'retry',
                t: String(t)
            },
            content
        }
        await this.deps.pushStanza(receipt)
    }

    private buildRetryKeysNode(): BinaryNode {
        const skey = this.keyBundle.signedPreKey
        const oneTime = this.keyBundle.oneTimePreKeys[0]
        if (!oneTime) {
            throw new Error('FakePeer.sendRetryReceipt: no one-time prekey available')
        }
        const skeyIdBytes = encodeUint3(skey.id)
        const keyIdBytes = encodeUint3(oneTime.id)
        return {
            tag: 'keys',
            attrs: {},
            content: [
                {
                    tag: 'identity',
                    attrs: {},
                    content: this.keyBundle.identityKeyPair.pubKey
                },
                {
                    tag: 'skey',
                    attrs: {},
                    content: [
                        { tag: 'id', attrs: {}, content: skeyIdBytes },
                        { tag: 'value', attrs: {}, content: skey.keyPair.pubKey },
                        { tag: 'signature', attrs: {}, content: skey.signature }
                    ]
                },
                {
                    tag: 'key',
                    attrs: {},
                    content: [
                        { tag: 'id', attrs: {}, content: keyIdBytes },
                        { tag: 'value', attrs: {}, content: oneTime.keyPair.pubKey }
                    ]
                }
            ]
        }
    }

    public expectMessage(options: ExpectMessageOptions = {}): Promise<ReceivedMessage> {
        const timeoutMs = options.timeoutMs ?? 5_000
        return new Promise<ReceivedMessage>((resolve, reject) => {
            let unsubscribe: (() => void) | null = null
            const timer = setTimeout(() => {
                if (unsubscribe) unsubscribe()
                reject(new Error(`FakePeer.expectMessage timed out after ${timeoutMs}ms`))
            }, timeoutMs)

            unsubscribe = this.deps.subscribeInboundMessages((stanza) => {
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
                ? await this.ratchet.decryptPreKeyMessage(ciphertext)
                : await this.ratchet.decryptMessage(ciphertext)
        return proto.Message.decode(padded)
    }

    public async decryptStanza(stanza: BinaryNode): Promise<ReceivedMessage | null> {
        const enc = findEncForPeer(stanza, this.jid)
        if (!enc || !(enc.content instanceof Uint8Array)) return null
        const encType = enc.attrs.type
        if (encType !== 'pkmsg' && encType !== 'msg') return null
        const message = await this.decryptPairwise(encType, enc.content)
        return { message, stanza, encType }
    }

    private async bootstrapAndDecryptGroup(
        senderJid: string,
        groupJid: string,
        stanza: BinaryNode,
        skmsgCiphertext: Uint8Array
    ): Promise<proto.IMessage> {
        const bootstrap = findEncForPeer(stanza, this.jid)
        if (bootstrap && bootstrap.content instanceof Uint8Array) {
            const bootstrapType = bootstrap.attrs.type
            if (bootstrapType === 'pkmsg' || bootstrapType === 'msg') {
                const padded =
                    bootstrapType === 'pkmsg'
                        ? await this.ratchet.decryptPreKeyMessage(bootstrap.content)
                        : await this.ratchet.decryptMessage(bootstrap.content)
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

    private async ensureRatchetInitiated(): Promise<void> {
        if (this.ratchetInitiated) return
        if (this.ratchet.hasSendChain()) {
            this.ratchetInitiated = true
            return
        }
        const bundle = await this.deps.bundleResolver()
        const oneTimePreKey = this.reservedOneTimePreKey ?? undefined
        await this.ratchet.initiateOutbound(bundle, {
            oneTimePreKey,
            skipOneTimePreKey: this.skipOneTimePreKey || !oneTimePreKey
        })
        this.ratchetInitiated = true
    }

    private nextId(): string {
        this.nextMessageCounter += 1
        return `${this.jid}-${Date.now()}-${this.nextMessageCounter}`
    }
}

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

function encodeUint3(value: number): Uint8Array {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
        throw new Error(`encodeUint3: value out of range: ${value}`)
    }
    const out = new Uint8Array(3)
    out[0] = (value >>> 16) & 0xff
    out[1] = (value >>> 8) & 0xff
    out[2] = value & 0xff
    return out
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
