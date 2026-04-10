import { X25519 } from '@crypto'
import type { SignalKeyPair } from '@crypto/curves/types'
import { ConsoleLogger } from '@infra/log/ConsoleLogger'
import type { Logger } from '@infra/log/types'
import { proto } from '@proto'
import { WA_DEFAULTS } from '@protocol/constants'
import {
    NOISE_IK_NAME,
    NOISE_XX_FALLBACK_NAME,
    NOISE_XX_NAME,
    WA_PROTO_HEADER
} from '@transport/noise/constants'
import { buildLoginPayload, buildRegistrationPayload } from '@transport/noise/WaClientPayload'
import { WaFrameCodec } from '@transport/noise/WaFrameCodec'
import { verifyNoiseCertificateChain, type WaNoiseRootCa } from '@transport/noise/WaNoiseCert'
import { WaNoiseHandshake } from '@transport/noise/WaNoiseHandshake'
import type { WaNoiseSocket } from '@transport/noise/WaNoiseSocket'
import type { WaNoiseConfig } from '@transport/types'
import { concatBytes } from '@util/bytes'
import { toError } from '@util/primitives'

function resolvePayload(
    payload: Uint8Array | (() => Uint8Array | Promise<Uint8Array>)
): Promise<Uint8Array> {
    if (payload instanceof Uint8Array) {
        return Promise.resolve(payload)
    }
    return Promise.resolve(payload())
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
    const prefix = new Uint8Array(2 + 2 + 1 + 2 + routingInfo.length)
    prefix[0] = 0x45 // E
    prefix[1] = 0x44 // D
    prefix[2] = 0x00
    prefix[3] = 0x01
    prefix[4] = (routingInfo.length >> 16) & 0xff
    prefix[5] = (routingInfo.length >> 8) & 0xff
    prefix[6] = routingInfo.length & 0xff
    prefix.set(routingInfo, 7)
    return prefix
}

export class WaNoiseSession {
    private readonly sendWire: (payload: Uint8Array) => Promise<void>
    private readonly logger: Logger
    private writeChain: Promise<void> = Promise.resolve()
    private readChain: Promise<void> = Promise.resolve()
    private frameCodec: WaFrameCodec | null = null
    private handshakeInbox: Uint8Array[] = []
    private handshakeInboxHead = 0
    private handshakeWaiter: ((frame: Uint8Array) => void) | null = null
    private handshakeRejecter: ((error: Error) => void) | null = null
    private pendingDecryptedFrames: Uint8Array[] = []
    private closedError: Error | null = null
    private noiseSocket: WaNoiseSocket | null = null
    private serverStaticKey: Uint8Array | null = null
    private trustedRootCa: WaNoiseRootCa | undefined = undefined
    private readonly handshakeFrameTimeoutMs = WA_DEFAULTS.CONNECT_TIMEOUT_MS

    public constructor(
        sendWire: (payload: Uint8Array) => Promise<void>,
        logger: Logger = new ConsoleLogger('info')
    ) {
        this.sendWire = sendWire
        this.logger = logger
    }

    public async start(config: WaNoiseConfig): Promise<void> {
        this.reset()
        this.logger.debug('noise session start', {
            isRegistered: config.isRegistered,
            hasServerStaticKey: !!config.serverStaticKey
        })
        const protocolHeader = config.protocolHeader ?? WA_PROTO_HEADER
        const introFrame =
            config.routingInfo && config.routingInfo.length > 0
                ? concatBytes([buildRoutingInfoPrefix(config.routingInfo), protocolHeader])
                : protocolHeader

        this.frameCodec = new WaFrameCodec(introFrame)
        const [ephemeralKeyPair, payload] = await Promise.all([
            X25519.generateKeyPair(),
            resolveHandshakePayload(config)
        ])
        const verifyCertificates = config.verifyCertificateChain !== false
        this.trustedRootCa = config.trustedRootCa

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

    public encryptFrame(frame: Uint8Array): Promise<Uint8Array> {
        const socket = this.noiseSocket
        const codec = this.frameCodec
        if (!socket || !codec) {
            return Promise.reject(new Error('noise session is not established'))
        }
        let encryptPromise: Promise<Uint8Array>
        try {
            encryptPromise = socket.encrypt(socket.reserveWriteNonce(), frame)
        } catch (error) {
            return Promise.reject(error)
        }
        const result = this.writeChain
            .then(() => encryptPromise)
            .then((encrypted) => codec.encodeFrame(encrypted))
        this.writeChain = result.then(
            () => {},
            () => {}
        )
        return result
    }

    public async pushWireChunk(chunk: Uint8Array): Promise<readonly Uint8Array[]> {
        const codec = this.frameCodec
        if (!codec) {
            return []
        }

        const out: Uint8Array[] = []
        if (this.pendingDecryptedFrames.length > 0) {
            for (let i = 0; i < this.pendingDecryptedFrames.length; i += 1) {
                out.push(this.pendingDecryptedFrames[i])
            }
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

        if (frames.length > 0) {
            const decryptBatch = this.decryptFramesBatch(this.noiseSocket, frames)
            this.readChain = this.readChain
                .then(() => decryptBatch)
                .then(
                    () => {},
                    () => {}
                )
            const decrypted = await decryptBatch
            for (let i = 0; i < decrypted.length; i++) {
                out.push(decrypted[i])
            }
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

    private async decryptFramesBatch(
        socket: WaNoiseSocket,
        frames: readonly Uint8Array[]
    ): Promise<readonly Uint8Array[]> {
        if (frames.length === 1) {
            return [await socket.decrypt(socket.reserveReadNonce(), frames[0])]
        }
        const pending = new Array<Promise<Uint8Array>>(frames.length)
        for (let i = 0; i < frames.length; i++) {
            pending[i] = socket.decrypt(socket.reserveReadNonce(), frames[i])
        }
        return Promise.all(pending)
    }

    public reset(): void {
        this.logger.trace('noise session reset')
        this.frameCodec = null
        this.handshakeInbox.length = this.handshakeInboxHead = 0
        this.handshakeWaiter = null
        this.handshakeRejecter = null
        this.pendingDecryptedFrames = []
        this.closedError = null
        this.noiseSocket = null
        this.serverStaticKey = null
        this.trustedRootCa = undefined
        this.writeChain = Promise.resolve()
        this.readChain = Promise.resolve()
    }

    public getServerStaticKey(): Uint8Array | null {
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
        const resumeResult = await this.tryResumeHandshakeWithIk(
            serverStaticKey,
            clientStaticKeyPair,
            ephemeralKeyPair,
            payload,
            protocolHeader
        )
        if (resumeResult.socket) {
            return resumeResult.socket
        }
        this.logger.info('noise resume handshake fallback to XX')
        return this.resumeHandshakeWithFallback(
            clientStaticKeyPair,
            ephemeralKeyPair,
            payload,
            protocolHeader,
            resumeResult.serverHelloFrame,
            verifyCertificates
        )
    }

    private async tryResumeHandshakeWithIk(
        serverStaticKey: Uint8Array,
        clientStaticKeyPair: SignalKeyPair,
        ephemeralKeyPair: SignalKeyPair,
        payload: Uint8Array,
        protocolHeader: Uint8Array
    ): Promise<
        | { readonly socket: WaNoiseSocket; readonly serverHelloFrame: null }
        | { readonly socket: null; readonly serverHelloFrame: Uint8Array }
    > {
        this.logger.trace('noise resume handshake: send IK client hello')
        const handshake = new WaNoiseHandshake()
        await handshake.start(NOISE_IK_NAME, protocolHeader)
        await handshake.authenticate(serverStaticKey)
        await handshake.authenticate(ephemeralKeyPair.pubKey)

        const [agreement1, agreement2] = await Promise.all([
            X25519.scalarMult(ephemeralKeyPair.privKey, serverStaticKey),
            X25519.scalarMult(clientStaticKeyPair.privKey, serverStaticKey)
        ])

        await handshake.mixIntoKey(agreement1)
        const encryptedClientStatic = await handshake.encrypt(clientStaticKeyPair.pubKey)

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
        if (serverHello.static) {
            return { socket: null, serverHelloFrame }
        }

        if (!serverHello.ephemeral) {
            throw new Error('noise resume handshake missing server ephemeral')
        }
        if (!serverHello.payload) {
            throw new Error('noise resume handshake missing certificate payload')
        }
        const serverEphemeral = serverHello.ephemeral
        await handshake.authenticate(serverEphemeral)

        const [dh1, dh2] = await Promise.all([
            X25519.scalarMult(ephemeralKeyPair.privKey, serverEphemeral),
            X25519.scalarMult(clientStaticKeyPair.privKey, serverEphemeral)
        ])

        await handshake.mixIntoKey(dh1)
        await handshake.mixIntoKey(dh2)

        await handshake.decrypt(serverHello.payload)
        this.serverStaticKey = serverStaticKey
        this.logger.info('noise resume handshake successful without fallback')
        return { socket: await handshake.finish(), serverHelloFrame: null }
    }

    private async resumeHandshakeWithFallback(
        clientStaticKeyPair: SignalKeyPair,
        ephemeralKeyPair: SignalKeyPair,
        payload: Uint8Array,
        protocolHeader: Uint8Array,
        serverHelloFrame: Uint8Array,
        verifyCertificates: boolean
    ): Promise<WaNoiseSocket> {
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

        const serverEphemeral = serverHello.ephemeral
        await handshake.authenticate(serverEphemeral)
        await handshake.mixIntoKey(
            await X25519.scalarMult(ephemeralKeyPair.privKey, serverEphemeral)
        )

        const serverStatic = await handshake.decrypt(serverHello.static)
        await handshake.mixIntoKey(await X25519.scalarMult(ephemeralKeyPair.privKey, serverStatic))

        const certificate = await handshake.decrypt(serverHello.payload)
        if (verifyCertificates) {
            await verifyNoiseCertificateChain(certificate, serverStatic, this.trustedRootCa)
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
        const queued =
            this.handshakeInboxHead < this.handshakeInbox.length
                ? this.handshakeInbox[this.handshakeInboxHead++]
                : undefined
        if (queued) {
            if (this.handshakeInboxHead === this.handshakeInbox.length) {
                this.handshakeInbox.length = this.handshakeInboxHead = 0
            }
            this.logger.trace('noise handshake frame consumed from queue')
            return queued
        }
        this.logger.trace('noise waiting handshake frame')
        return new Promise<Uint8Array>((resolve, reject) => {
            if (this.closedError) {
                reject(this.closedError)
                return
            }
            const timeout = setTimeout(() => {
                if (this.handshakeWaiter === resolve) {
                    this.handshakeWaiter = null
                    this.handshakeRejecter = null
                }
                reject(
                    new Error(
                        `noise handshake frame timeout after ${this.handshakeFrameTimeoutMs}ms`
                    )
                )
            }, this.handshakeFrameTimeoutMs)
            timeout.unref?.()
            this.handshakeWaiter = (frame) => {
                clearTimeout(timeout)
                resolve(frame)
            }
            this.handshakeRejecter = (error) => {
                clearTimeout(timeout)
                reject(error)
            }
        }).catch((error) => {
            throw toError(error)
        })
    }

    private async decodeBufferedPostHandshakeFrames(): Promise<void> {
        if (!this.noiseSocket || this.handshakeInboxHead >= this.handshakeInbox.length) {
            return
        }
        this.logger.debug('decoding buffered post-handshake frames', {
            count: this.handshakeInbox.length - this.handshakeInboxHead
        })
        const start = this.handshakeInboxHead
        const frames = this.handshakeInbox.slice(start)
        if (frames.length > 0) {
            const decryptBatch = this.decryptFramesBatch(this.noiseSocket, frames)
            this.readChain = this.readChain
                .then(() => decryptBatch)
                .then(
                    () => {},
                    () => {}
                )
            const decrypted = await decryptBatch
            for (let i = 0; i < decrypted.length; i++) {
                this.pendingDecryptedFrames.push(decrypted[i])
            }
        }
        this.handshakeInbox.length = this.handshakeInboxHead = 0
    }
}
