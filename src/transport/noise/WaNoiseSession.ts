import { X25519 } from '../../crypto'
import type { SignalKeyPair } from '../../crypto/curves/types'
import { ConsoleLogger } from '../../infra/log/ConsoleLogger'
import type { Logger } from '../../infra/log/types'
import { BoundedTaskQueue } from '../../infra/perf/BoundedTaskQueue'
import { proto } from '../../proto'
import {
    NOISE_IK_NAME,
    NOISE_XX_FALLBACK_NAME,
    NOISE_XX_NAME,
    WA_PROTO_HEADER
} from '../../transport/noise/constants'
import type { WaNoiseConfig } from '../../transport/types'
import { concatBytes, toBytesView } from '../../util/bytes'
import { toError } from '../../util/primitives'

import { buildLoginPayload, buildRegistrationPayload } from './WaClientPayload'
import { WaFrameCodec } from './WaFrameCodec'
import { verifyNoiseCertificateChain } from './WaNoiseCert'
import { WaNoiseHandshake } from './WaNoiseHandshake'
import type { WaNoiseSocket } from './WaNoiseSocket'

function resolvePayload(
    payload: Uint8Array | (() => Uint8Array | Promise<Uint8Array>)
): Promise<Uint8Array> {
    if (payload instanceof Uint8Array) {
        return Promise.resolve(payload)
    }
    return Promise.resolve(payload()).then((value) => toBytesView(value))
}

async function resolveHandshakePayload(config: WaNoiseConfig): Promise<Uint8Array> {
    if (config.isRegistered) {
        if (config.loginPayload) {
            return resolvePayload(config.loginPayload)
        }
        if (config.loginPayloadConfig) {
            return buildLoginPayload(config.loginPayloadConfig)
        }
        throw new Error('noise login payload is missing')
    }

    if (config.registrationPayload) {
        return resolvePayload(config.registrationPayload)
    }
    if (config.registrationPayloadConfig) {
        return buildRegistrationPayload(config.registrationPayloadConfig)
    }
    throw new Error('noise registration payload is missing')
}

function buildRoutingInfoPrefix(routingInfo: Uint8Array): Uint8Array {
    const prefix = new Uint8Array(2 + 1 + 2 + routingInfo.length)
    prefix[0] = 0x45 // E
    prefix[1] = 0x44 // D
    prefix[2] = (routingInfo.length >> 16) & 0xff
    prefix[3] = (routingInfo.length >> 8) & 0xff
    prefix[4] = routingInfo.length & 0xff
    prefix.set(routingInfo, 5)
    return prefix
}

export class WaNoiseSession {
    private readonly sendWire: (payload: Uint8Array) => Promise<void>
    private readonly logger: Logger
    private readonly writeQueue: BoundedTaskQueue
    private readonly readQueue: BoundedTaskQueue
    private frameCodec: WaFrameCodec | null
    private handshakeInbox: Uint8Array[]
    private handshakeWaiter: ((frame: Uint8Array) => void) | null
    private handshakeRejecter: ((error: Error) => void) | null
    private pendingDecryptedFrames: Uint8Array[]
    private closedError: Error | null
    private noiseSocket: WaNoiseSocket | null
    private serverStaticKey: Uint8Array | null

    public constructor(
        sendWire: (payload: Uint8Array) => Promise<void>,
        logger: Logger = new ConsoleLogger('info')
    ) {
        this.sendWire = sendWire
        this.logger = logger
        this.writeQueue = new BoundedTaskQueue(4096, 1)
        this.readQueue = new BoundedTaskQueue(4096, 1)
        this.frameCodec = null
        this.handshakeInbox = []
        this.handshakeWaiter = null
        this.handshakeRejecter = null
        this.pendingDecryptedFrames = []
        this.closedError = null
        this.noiseSocket = null
        this.serverStaticKey = null
    }

    public async start(config: WaNoiseConfig): Promise<void> {
        this.reset()
        this.logger.debug('noise session start', {
            isRegistered: config.isRegistered,
            hasServerStaticKey: !!config.serverStaticKey
        })
        const protocolHeader = config.protocolHeader
            ? toBytesView(config.protocolHeader)
            : WA_PROTO_HEADER
        const introFrame =
            config.routingInfo && config.routingInfo.length > 0
                ? concatBytes([buildRoutingInfoPrefix(config.routingInfo), protocolHeader])
                : protocolHeader

        this.frameCodec = new WaFrameCodec(introFrame)
        const ephemeralKeyPair = await X25519.generateKeyPair()
        const payload = await resolveHandshakePayload(config)
        const verifyCertificates = config.verifyCertificateChain !== false

        if (config.serverStaticKey && config.serverStaticKey.length === 32) {
            this.logger.info('noise session attempting resume handshake (IK)')
            this.noiseSocket = await this.resumeHandshake(
                config.serverStaticKey,
                config.clientStaticKeyPair,
                ephemeralKeyPair,
                payload,
                protocolHeader,
                verifyCertificates
            )
            await this.decodeBufferedPostHandshakeFrames()
            this.logger.info('noise session established via resume/full fallback path')
            return
        }

        this.logger.info('noise session starting full handshake (XX)')
        this.noiseSocket = await this.fullHandshake(
            config.clientStaticKeyPair,
            ephemeralKeyPair,
            payload,
            protocolHeader,
            verifyCertificates
        )
        await this.decodeBufferedPostHandshakeFrames()
        this.logger.info('noise session established via full handshake')
    }

    public async encryptFrame(frame: Uint8Array): Promise<Uint8Array> {
        if (!this.noiseSocket || !this.frameCodec) {
            throw new Error('noise session is not established')
        }
        this.logger.trace('noise encrypt frame', { byteLength: frame.byteLength })
        const encrypted = await this.writeQueue.enqueue(() => this.noiseSocket!.encrypt(frame))
        return this.frameCodec.encodeFrame(encrypted)
    }

    public async pushWireChunk(chunk: Uint8Array): Promise<readonly Uint8Array[]> {
        const codec = this.frameCodec
        if (!codec) {
            return []
        }
        this.logger.trace('noise push wire chunk', { byteLength: chunk.byteLength })

        const out: Uint8Array[] = []
        if (this.pendingDecryptedFrames.length > 0) {
            out.push(...this.pendingDecryptedFrames)
            this.pendingDecryptedFrames = []
        }

        const frames = codec.pushWireChunk(chunk)
        if (!this.noiseSocket) {
            for (const frame of frames) {
                const waiter = this.handshakeWaiter
                const rejecter = this.handshakeRejecter
                if (waiter && rejecter) {
                    this.handshakeWaiter = null
                    this.handshakeRejecter = null
                    waiter(frame)
                    continue
                }
                this.handshakeInbox.push(frame)
            }
            return out
        }

        for (const frame of frames) {
            const decrypted = await this.readQueue.enqueue(() => this.noiseSocket!.decrypt(frame))
            out.push(decrypted)
        }
        return out
    }

    public onSocketClosed(error?: Error): void {
        const closeError = error ?? new Error('noise session socket closed')
        this.logger.debug('noise session socket closed', { message: closeError.message })
        this.closedError = closeError
        const rejecter = this.handshakeRejecter
        if (rejecter) {
            this.handshakeRejecter = null
            this.handshakeWaiter = null
            rejecter(closeError)
        }
    }

    public reset(): void {
        this.logger.trace('noise session reset')
        this.frameCodec = null
        this.handshakeInbox = []
        this.handshakeWaiter = null
        this.handshakeRejecter = null
        this.pendingDecryptedFrames = []
        this.closedError = null
        this.noiseSocket = null
        this.serverStaticKey = null
    }

    public getServerStaticKey(): Uint8Array | null {
        if (!this.serverStaticKey) {
            return null
        }
        return this.serverStaticKey
    }

    private async fullHandshake(
        clientStaticKeyPair: SignalKeyPair,
        ephemeralKeyPair: SignalKeyPair,
        payload: Uint8Array,
        protocolHeader: Uint8Array,
        verifyCertificates: boolean
    ): Promise<WaNoiseSocket> {
        this.logger.trace('noise full handshake: send client hello')
        const handshake = new WaNoiseHandshake()
        await handshake.start(NOISE_XX_NAME, protocolHeader)
        await handshake.authenticate(ephemeralKeyPair.pubKey)

        const clientHello = proto.HandshakeMessage.encode({
            clientHello: {
                ephemeral: ephemeralKeyPair.pubKey
            }
        }).finish()

        const serverHello = await this.sendAndReceiveHandshakeFrame(clientHello)
        return this.continueFullHandshake(
            handshake,
            serverHello,
            clientStaticKeyPair,
            ephemeralKeyPair,
            payload,
            verifyCertificates
        )
    }

    private async resumeHandshake(
        serverStaticKey: Uint8Array,
        clientStaticKeyPair: SignalKeyPair,
        ephemeralKeyPair: SignalKeyPair,
        payload: Uint8Array,
        protocolHeader: Uint8Array,
        verifyCertificates: boolean
    ): Promise<WaNoiseSocket> {
        this.logger.trace('noise resume handshake: send IK client hello')
        const handshake = new WaNoiseHandshake()
        await handshake.start(NOISE_IK_NAME, protocolHeader)
        await handshake.authenticate(serverStaticKey)
        await handshake.authenticate(ephemeralKeyPair.pubKey)

        const agreement1 = await X25519.scalarMult(ephemeralKeyPair.privKey, serverStaticKey)
        await handshake.mixIntoKey(agreement1)
        const encryptedClientStatic = await handshake.encrypt(clientStaticKeyPair.pubKey)

        const agreement2 = await X25519.scalarMult(clientStaticKeyPair.privKey, serverStaticKey)
        await handshake.mixIntoKey(agreement2)
        const encryptedPayload = await handshake.encrypt(payload)

        const clientHello = proto.HandshakeMessage.encode({
            clientHello: {
                ephemeral: ephemeralKeyPair.pubKey,
                payload: encryptedPayload,
                static: encryptedClientStatic
            }
        }).finish()

        const serverHelloFrame = await this.sendAndReceiveHandshakeFrame(clientHello)
        const parsed = proto.HandshakeMessage.decode(serverHelloFrame)
        const serverHello = parsed.serverHello
        if (!serverHello) {
            throw new Error('noise resume handshake missing serverHello')
        }

        if (!serverHello.static) {
            if (!serverHello.ephemeral) {
                throw new Error('noise resume handshake missing server ephemeral')
            }
            if (!serverHello.payload) {
                throw new Error('noise resume handshake missing certificate payload')
            }
            const serverEphemeral = toBytesView(serverHello.ephemeral)
            await handshake.authenticate(serverEphemeral)
            await handshake.mixIntoKey(
                await X25519.scalarMult(ephemeralKeyPair.privKey, serverEphemeral)
            )
            await handshake.mixIntoKey(
                await X25519.scalarMult(clientStaticKeyPair.privKey, serverEphemeral)
            )

            await handshake.decrypt(toBytesView(serverHello.payload))
            this.serverStaticKey = serverStaticKey
            this.logger.info('noise resume handshake successful without fallback')
            return handshake.finish()
        }

        this.logger.info('noise resume handshake fallback to XX')
        const fallback = new WaNoiseHandshake()
        await fallback.start(NOISE_XX_FALLBACK_NAME, protocolHeader)
        await fallback.authenticate(ephemeralKeyPair.pubKey)
        return this.continueFullHandshake(
            fallback,
            serverHelloFrame,
            clientStaticKeyPair,
            ephemeralKeyPair,
            payload,
            verifyCertificates
        )
    }

    private async continueFullHandshake(
        handshake: WaNoiseHandshake,
        serverHelloFrame: Uint8Array,
        clientStaticKeyPair: SignalKeyPair,
        ephemeralKeyPair: SignalKeyPair,
        payload: Uint8Array,
        verifyCertificates: boolean
    ): Promise<WaNoiseSocket> {
        this.logger.trace('noise continue full handshake')
        const parsed = proto.HandshakeMessage.decode(serverHelloFrame)
        const serverHello = parsed.serverHello
        if (!serverHello?.ephemeral || !serverHello.static || !serverHello.payload) {
            throw new Error('noise full handshake missing server hello fields')
        }

        const serverEphemeral = toBytesView(serverHello.ephemeral)
        await handshake.authenticate(serverEphemeral)
        await handshake.mixIntoKey(
            await X25519.scalarMult(ephemeralKeyPair.privKey, serverEphemeral)
        )

        const serverStatic = await handshake.decrypt(toBytesView(serverHello.static))
        await handshake.mixIntoKey(await X25519.scalarMult(ephemeralKeyPair.privKey, serverStatic))

        const certificate = await handshake.decrypt(toBytesView(serverHello.payload))
        if (verifyCertificates) {
            await verifyNoiseCertificateChain(certificate, serverStatic)
            this.logger.trace('noise certificate chain verified')
        }
        this.serverStaticKey = serverStatic

        const encryptedClientStatic = await handshake.encrypt(clientStaticKeyPair.pubKey)
        await handshake.mixIntoKey(
            await X25519.scalarMult(clientStaticKeyPair.privKey, serverEphemeral)
        )
        const encryptedPayload = await handshake.encrypt(payload)

        const clientFinish = proto.HandshakeMessage.encode({
            clientFinish: {
                static: encryptedClientStatic,
                payload: encryptedPayload
            }
        }).finish()
        await this.sendHandshakeFrame(clientFinish)
        this.logger.trace('noise full handshake client finish sent')
        return handshake.finish()
    }

    private async sendHandshakeFrame(frame: Uint8Array): Promise<void> {
        const codec = this.frameCodec
        if (!codec) {
            throw new Error('noise frame codec is not initialized')
        }
        this.logger.trace('noise send handshake frame', { byteLength: frame.byteLength })
        await this.sendWire(codec.encodeFrame(frame))
    }

    private async sendAndReceiveHandshakeFrame(frame: Uint8Array): Promise<Uint8Array> {
        await this.sendHandshakeFrame(frame)
        return this.waitHandshakeFrame()
    }

    private async waitHandshakeFrame(): Promise<Uint8Array> {
        if (this.closedError) {
            throw this.closedError
        }
        const queued = this.handshakeInbox.shift()
        if (queued) {
            this.logger.trace('noise handshake frame consumed from queue')
            return queued
        }
        this.logger.trace('noise waiting handshake frame')
        return new Promise<Uint8Array>((resolve, reject) => {
            if (this.closedError) {
                reject(this.closedError)
                return
            }
            this.handshakeWaiter = resolve
            this.handshakeRejecter = reject
        }).catch((error) => {
            throw toError(error)
        })
    }

    private async decodeBufferedPostHandshakeFrames(): Promise<void> {
        if (!this.noiseSocket || this.handshakeInbox.length === 0) {
            return
        }
        this.logger.debug('decoding buffered post-handshake frames', {
            count: this.handshakeInbox.length
        })
        const buffered = this.handshakeInbox.splice(0, this.handshakeInbox.length)
        for (const frame of buffered) {
            const decrypted = await this.readQueue.enqueue(() => this.noiseSocket!.decrypt(frame))
            this.pendingDecryptedFrames.push(decrypted)
        }
    }
}
