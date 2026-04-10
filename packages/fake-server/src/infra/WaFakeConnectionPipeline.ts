/**
 * Per-connection pipeline that drives a single client through the full
 * fake-server lifecycle:
 *
 *   1. Wait for the version-header prologue
 *   2. Receive ClientHello (noise XX msg 1)
 *   3. Send ServerHello with cert chain (noise XX msg 2)
 *   4. Receive ClientFinish (noise XX msg 3) → derive transport keys
 *   5. Decrypt the ClientPayload from ClientFinish
 *   6. Push the success stanza encrypted with the transport keys
 *   7. Continue dispatching encrypted binary stanzas
 *
 * This file is server scaffolding; the protocol-specific bits it calls into
 * (handshake, cert chain, success node, ClientPayload parser) are individually
 * derived from /deobfuscated.
 */

import { buildFakeCertChain, type FakeNoiseRootCa } from '../protocol/auth/cert-chain'
import {
    parseClientPayload,
    type ParsedClientPayload
} from '../protocol/auth/client-payload-validate'
import { buildSuccessNode } from '../protocol/auth/success-node'
import { type WaFakeIqRouter } from '../protocol/iq/router'
import { type BinaryNode, decodeBinaryNodeStanza, encodeBinaryNodeStanza } from '../transport/codec'
import { type SignalKeyPair, X25519 } from '../transport/crypto'
import { proto } from '../transport/protos'

import type { WaFakeConnection } from './WaFakeConnection'
import { WaFakeFrameSocket } from './WaFakeFrameSocket'
import { WaFakeNoiseHandshake } from './WaFakeNoiseHandshake'
import { WaFakeTransport } from './WaFakeTransport'

const NOISE_XX_NAME = new TextEncoder().encode('Noise_XX_25519_AESGCM_SHA256\0\0\0\0')
const NOISE_IK_NAME = new TextEncoder().encode('Noise_IK_25519_AESGCM_SHA256\0\0\0\0')
const PROLOGUE = new Uint8Array([0x57, 0x41, 0x06, 0x03])

export interface WaFakeConnectionPipelineConfig {
    readonly connection: WaFakeConnection
    readonly rootCa: FakeNoiseRootCa
    readonly serverStaticKeyPair: SignalKeyPair
    readonly iqRouter: WaFakeIqRouter
    readonly successNodeAttributes?: Parameters<typeof buildSuccessNode>[0]
}

export interface WaFakeConnectionPipelineEvents {
    readonly onAuthenticated?: (info: WaFakeAuthenticatedInfo) => void
    readonly onStanza?: (node: BinaryNode) => void
    readonly onUnhandledStanza?: (node: BinaryNode) => void
    readonly onError?: (error: Error) => void
    readonly onClose?: (info: { readonly code: number; readonly reason: string }) => void
}

export interface WaFakeAuthenticatedInfo {
    readonly clientPayload: ParsedClientPayload
    readonly clientStaticKey: Uint8Array
}

type State =
    | { readonly kind: 'awaiting_prologue' }
    | { readonly kind: 'awaiting_client_hello' }
    | {
          readonly kind: 'awaiting_client_finish'
          readonly handshake: WaFakeNoiseHandshake
          readonly serverEphemeralKeyPair: SignalKeyPair
          readonly clientEphemeralPub: Uint8Array
      }
    | {
          readonly kind: 'authenticated'
          readonly transport: WaFakeTransport
      }
    | { readonly kind: 'closed' }

export class WaFakeConnectionPipeline {
    private readonly config: WaFakeConnectionPipelineConfig
    private readonly frameSocket: WaFakeFrameSocket
    private events: WaFakeConnectionPipelineEvents = {}
    private state: State = { kind: 'awaiting_prologue' }
    private chain: Promise<void> = Promise.resolve()

    public constructor(config: WaFakeConnectionPipelineConfig) {
        this.config = config
        this.frameSocket = new WaFakeFrameSocket(config.connection)
        this.frameSocket.setHandlers({
            onPrologue: () => this.onPrologue(),
            onFrame: (frame) => this.scheduleFrame(frame),
            onClose: (info) => {
                this.state = { kind: 'closed' }
                this.events.onClose?.(info)
            },
            onError: (error) => this.events.onError?.(error)
        })
    }

    public setEvents(events: WaFakeConnectionPipelineEvents): void {
        this.events = events
    }

    public isAuthenticated(): boolean {
        return this.state.kind === 'authenticated'
    }

    /**
     * Encrypts a stanza with the post-handshake transport keys and pushes
     * it to the client. Throws if the connection is not yet authenticated.
     */
    public async sendStanza(node: BinaryNode): Promise<void> {
        if (this.state.kind !== 'authenticated') {
            throw new Error(`cannot send stanza while pipeline is in state "${this.state.kind}"`)
        }
        const stanza = encodeBinaryNodeStanza(node)
        // The transport's encryptFrame internally serializes via a
        // promise chain so concurrent callers still see strict FIFO
        // ordering at the wire — see WaFakeTransport.encryptFrame for
        // the rationale. Each caller's continuation runs in the
        // microtask queue immediately after the previous one's, so
        // sendFrame() calls below also fire in order.
        const ciphertext = await this.state.transport.encryptFrame(stanza)
        this.frameSocket.sendFrame(ciphertext)
    }

    private onPrologue(): void {
        if (this.state.kind !== 'awaiting_prologue') {
            this.events.onError?.(new Error('received second prologue from client'))
            return
        }
        this.state = { kind: 'awaiting_client_hello' }
    }

    private scheduleFrame(frame: Uint8Array): void {
        this.chain = this.chain.then(() => this.handleFrame(frame))
    }

    private async handleFrame(frame: Uint8Array): Promise<void> {
        try {
            switch (this.state.kind) {
                case 'awaiting_client_hello':
                    await this.handleClientHello(frame)
                    return
                case 'awaiting_client_finish':
                    await this.handleClientFinish(
                        frame,
                        this.state.handshake,
                        this.state.serverEphemeralKeyPair
                    )
                    return
                case 'authenticated':
                    await this.handleAuthenticatedFrame(frame, this.state.transport)
                    return
                default:
                    this.events.onError?.(
                        new Error(`unexpected frame in state "${this.state.kind}"`)
                    )
            }
        } catch (error) {
            this.fail(error)
        }
    }

    private async handleClientHello(frame: Uint8Array): Promise<void> {
        const parsed = proto.HandshakeMessage.decode(frame)
        const clientHello = parsed.clientHello
        if (!clientHello?.ephemeral) {
            throw new Error('ClientHello missing ephemeral')
        }

        // IK ClientHello carries `static` (encrypted client static) + `payload`.
        // XX ClientHello has only `ephemeral`.
        if (clientHello.static && clientHello.payload) {
            await this.handleIkClientHello(clientHello)
        } else {
            await this.handleXxClientHello(clientHello.ephemeral)
        }
    }

    private async handleXxClientHello(clientEphemeralPub: Uint8Array): Promise<void> {
        const handshake = new WaFakeNoiseHandshake()
        await handshake.start(NOISE_XX_NAME, PROLOGUE)
        await handshake.authenticate(clientEphemeralPub)

        const serverEphemeral = await X25519.generateKeyPair()
        await handshake.authenticate(serverEphemeral.pubKey)
        await handshake.mixIntoKey(
            await X25519.scalarMult(serverEphemeral.privKey, clientEphemeralPub)
        )
        const encryptedServerStatic = await handshake.encrypt(
            this.config.serverStaticKeyPair.pubKey
        )
        await handshake.mixIntoKey(
            await X25519.scalarMult(this.config.serverStaticKeyPair.privKey, clientEphemeralPub)
        )

        const certChain = await buildFakeCertChain({
            root: this.config.rootCa,
            leafKey: this.config.serverStaticKeyPair.pubKey
        })
        const encryptedCertPayload = await handshake.encrypt(certChain.encoded)

        const serverHello = proto.HandshakeMessage.encode({
            serverHello: {
                ephemeral: serverEphemeral.pubKey,
                static: encryptedServerStatic,
                payload: encryptedCertPayload
            }
        }).finish()

        this.frameSocket.sendFrame(serverHello)

        this.state = {
            kind: 'awaiting_client_finish',
            handshake,
            serverEphemeralKeyPair: serverEphemeral,
            clientEphemeralPub
        }
    }

    /**
     * IK handshake server-side. The client has the cached server static key
     * and sends ephemeral + encrypted static + encrypted payload in a single
     * ClientHello. We complete the handshake in a single round-trip:
     * decrypt the client material, generate our ephemeral, and respond with
     * a ServerHello carrying only `ephemeral` + cert payload (no `static`,
     * which would otherwise trigger the client's XX fallback path).
     *
     * Source: /deobfuscated/WAWebOpenC/WAWebOpenChatSocket.js (function q)
     */
    private async handleIkClientHello(clientHello: {
        readonly ephemeral?: Uint8Array | null
        readonly static?: Uint8Array | null
        readonly payload?: Uint8Array | null
    }): Promise<void> {
        if (!clientHello.ephemeral || !clientHello.static || !clientHello.payload) {
            throw new Error('IK ClientHello missing ephemeral/static/payload')
        }
        const clientEphemeralPub = clientHello.ephemeral
        const encryptedClientStatic = clientHello.static
        const encryptedClientPayload = clientHello.payload

        const handshake = new WaFakeNoiseHandshake()
        await handshake.start(NOISE_IK_NAME, PROLOGUE)
        await handshake.authenticate(this.config.serverStaticKeyPair.pubKey)
        await handshake.authenticate(clientEphemeralPub)
        await handshake.mixIntoKey(
            await X25519.scalarMult(this.config.serverStaticKeyPair.privKey, clientEphemeralPub)
        )
        const clientStaticKey = await handshake.decrypt(encryptedClientStatic)
        await handshake.mixIntoKey(
            await X25519.scalarMult(this.config.serverStaticKeyPair.privKey, clientStaticKey)
        )
        const clientPayloadBytes = await handshake.decrypt(encryptedClientPayload)
        const clientPayload = parseClientPayload(clientPayloadBytes)

        // ServerHello side of IK.
        const serverEphemeral = await X25519.generateKeyPair()
        await handshake.authenticate(serverEphemeral.pubKey)
        await handshake.mixIntoKey(
            await X25519.scalarMult(serverEphemeral.privKey, clientEphemeralPub)
        )
        await handshake.mixIntoKey(
            await X25519.scalarMult(serverEphemeral.privKey, clientStaticKey)
        )
        const certChain = await buildFakeCertChain({
            root: this.config.rootCa,
            leafKey: this.config.serverStaticKeyPair.pubKey
        })
        const encryptedCertPayload = await handshake.encrypt(certChain.encoded)

        const serverHello = proto.HandshakeMessage.encode({
            serverHello: {
                ephemeral: serverEphemeral.pubKey,
                payload: encryptedCertPayload
            }
        }).finish()

        this.frameSocket.sendFrame(serverHello)

        const keys = await handshake.finish()
        const transport = new WaFakeTransport({
            recvKey: keys.recvKey,
            sendKey: keys.sendKey
        })
        this.state = { kind: 'authenticated', transport }

        this.events.onAuthenticated?.({ clientPayload, clientStaticKey })
        await this.sendStanza(buildSuccessNode(this.config.successNodeAttributes))
    }

    private async handleClientFinish(
        frame: Uint8Array,
        handshake: WaFakeNoiseHandshake,
        serverEphemeralKeyPair: SignalKeyPair
    ): Promise<void> {
        const parsed = proto.HandshakeMessage.decode(frame)
        const clientFinish = parsed.clientFinish
        if (!clientFinish?.static || !clientFinish.payload) {
            throw new Error('ClientFinish missing static/payload')
        }
        const clientStaticKey = await handshake.decrypt(clientFinish.static)
        await handshake.mixIntoKey(
            await X25519.scalarMult(serverEphemeralKeyPair.privKey, clientStaticKey)
        )
        const clientPayloadBytes = await handshake.decrypt(clientFinish.payload)
        const clientPayload = parseClientPayload(clientPayloadBytes)

        const keys = await handshake.finish()
        const transport = new WaFakeTransport({
            recvKey: keys.recvKey,
            sendKey: keys.sendKey
        })
        this.state = { kind: 'authenticated', transport }

        this.events.onAuthenticated?.({ clientPayload, clientStaticKey })
        await this.sendStanza(buildSuccessNode(this.config.successNodeAttributes))
    }

    private async handleAuthenticatedFrame(
        frame: Uint8Array,
        transport: WaFakeTransport
    ): Promise<void> {
        const stanzaBytes = await transport.decryptFrame(frame)
        const node = await decodeBinaryNodeStanza(stanzaBytes)
        this.events.onStanza?.(node)

        if (node.tag === 'iq') {
            const response = await this.config.iqRouter.route(node)
            if (response !== null) {
                await this.sendStanza(response)
            } else {
                this.events.onUnhandledStanza?.(node)
            }
            return
        }

        // Auto-ack outbound `<message>` stanzas. The lib's
        // `WaMessageClient.publish` registers the message id with
        // `WaNodeOrchestrator.tryResolvePending`, so any node carrying
        // the same id resolves the pending publish promise. Sending an
        // `<ack id=msg-id class=receipt type=text from=peer-jid/>` is
        // the smallest reply that unblocks the lib.
        if (node.tag === 'message' && node.attrs.id) {
            const messageType = node.attrs.type ?? 'text'
            const from = node.attrs.to ?? 's.whatsapp.net'
            const ackAttrs: Record<string, string> = {
                id: node.attrs.id,
                class: 'receipt',
                type: messageType,
                from
            }
            if (node.attrs.participant) {
                ackAttrs.participant = node.attrs.participant
            }
            await this.sendStanza({
                tag: 'ack',
                attrs: ackAttrs
            })
        }
    }

    private fail(error: unknown): void {
        const err = error instanceof Error ? error : new Error(String(error))
        this.events.onError?.(err)
        this.state = { kind: 'closed' }
        this.config.connection.close(1011, err.message.slice(0, 120))
    }
}
