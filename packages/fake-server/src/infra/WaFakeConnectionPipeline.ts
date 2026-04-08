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
    private readonly handshake = new WaFakeNoiseHandshake()
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

    /**
     * Encrypts a stanza with the post-handshake transport keys and pushes
     * it to the client. Throws if the connection is not yet authenticated.
     */
    public async sendStanza(node: BinaryNode): Promise<void> {
        if (this.state.kind !== 'authenticated') {
            throw new Error(`cannot send stanza while pipeline is in state "${this.state.kind}"`)
        }
        const stanza = encodeBinaryNodeStanza(node)
        const ciphertext = await this.state.transport.encryptFrame(stanza)
        this.frameSocket.sendFrame(ciphertext)
    }

    private onPrologue(): void {
        if (this.state.kind !== 'awaiting_prologue') {
            this.events.onError?.(new Error('received second prologue from client'))
            return
        }
        this.state = { kind: 'awaiting_client_hello' }
        this.chain = this.chain.then(() => this.startHandshake())
    }

    private async startHandshake(): Promise<void> {
        try {
            await this.handshake.start(NOISE_XX_NAME, PROLOGUE)
        } catch (error) {
            this.fail(error)
        }
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
                    await this.handleClientFinish(frame, this.state.serverEphemeralKeyPair)
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
        const clientEphemeralPub = clientHello.ephemeral
        await this.handshake.authenticate(clientEphemeralPub)

        const serverEphemeral = await X25519.generateKeyPair()

        await this.handshake.authenticate(serverEphemeral.pubKey)
        await this.handshake.mixIntoKey(
            await X25519.scalarMult(serverEphemeral.privKey, clientEphemeralPub)
        )
        const encryptedServerStatic = await this.handshake.encrypt(
            this.config.serverStaticKeyPair.pubKey
        )
        await this.handshake.mixIntoKey(
            await X25519.scalarMult(this.config.serverStaticKeyPair.privKey, clientEphemeralPub)
        )

        const certChain = await buildFakeCertChain({
            root: this.config.rootCa,
            leafKey: this.config.serverStaticKeyPair.pubKey
        })
        const encryptedCertPayload = await this.handshake.encrypt(certChain.encoded)

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
            serverEphemeralKeyPair: serverEphemeral,
            clientEphemeralPub
        }
    }

    private async handleClientFinish(
        frame: Uint8Array,
        serverEphemeralKeyPair: SignalKeyPair
    ): Promise<void> {
        const parsed = proto.HandshakeMessage.decode(frame)
        const clientFinish = parsed.clientFinish
        if (!clientFinish?.static || !clientFinish.payload) {
            throw new Error('ClientFinish missing static/payload')
        }
        const clientStaticKey = await this.handshake.decrypt(clientFinish.static)
        await this.handshake.mixIntoKey(
            await X25519.scalarMult(serverEphemeralKeyPair.privKey, clientStaticKey)
        )
        const clientPayloadBytes = await this.handshake.decrypt(clientFinish.payload)
        const clientPayload = parseClientPayload(clientPayloadBytes)

        const keys = await this.handshake.finish()
        const transport = new WaFakeTransport({
            recvKey: keys.recvKey,
            sendKey: keys.sendKey
        })
        this.state = { kind: 'authenticated', transport }

        this.events.onAuthenticated?.({ clientPayload, clientStaticKey })

        // Phase 1: send the success node immediately on authentication.
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
        }
    }

    private fail(error: unknown): void {
        const err = error instanceof Error ? error : new Error(String(error))
        this.events.onError?.(err)
        this.state = { kind: 'closed' }
        this.config.connection.close(1011, err.message.slice(0, 120))
    }
}
