import {
    decodePrimaryEphemeralIdentity,
    deriveEncryptionKey,
    deriveVerificationCode,
    encryptPairingRequest,
    generateCompanionEphemeralIdentity,
    type ShortcakeCompanionEphemeralIdentity
} from '@auth/pairing/shortcake-crypto'
import type { WaAuthCredentials } from '@auth/types'
import { hkdf, hmacSha256Sign, randomBytesAsync } from '@crypto'
import type { Logger } from '@infra/log/types'
import { proto } from '@proto'
import { WA_DEFAULTS, WA_NODE_TAGS, WA_NOTIFICATION_TYPES } from '@protocol/constants'
import { buildAckNode } from '@transport/node/builders/global'
import {
    buildGetPasskeyRequestOptionsRequestNode,
    buildSetCompanionNonceRequestNode,
    buildSetEncryptedPairingRequestRequestNode,
    buildSetPasskeyPrologueRequestNode,
    buildShortcakeGetRefRequestNode
} from '@transport/node/builders/shortcake'
import { decodeNodeContentUtf8OrBytes, findNodeChild } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { TEXT_DECODER, TEXT_ENCODER } from '@util/bytes'

/**
 * Externally-provided WebAuthn assertion. The passkey/credential source lives
 * OUTSIDE the protocol layer – the caller signs the server's request options
 * however it likes (real authenticator, virtual authenticator, relay…) and
 * hands back the raw assertion + credential id.
 */
export type WaShortcakeAssertionSigner = (
    requestOptions: Uint8Array
) => Promise<{ readonly credentialId: Uint8Array; readonly webauthnAssertion: Uint8Array }>

/** HKDF info for the pairing handoff HMAC key (derived from the ADV secret). */
const HANDOFF_KEY_INFO = TEXT_ENCODER.encode('shortcake-passkey-handoff-v1')
const HANDOFF_KEY_TTL_MS = 5 * 60 * 1000

interface PasskeyHandoffKey {
    readonly hmac: Uint8Array
    readonly ts: number
}

const Stage = Object.freeze({
    Idle: 'idle',
    WaitingForPrimaryIdentity: 'waiting_for_primary_identity',
    WaitingForConfirmation: 'waiting_for_confirmation',
    WaitingForPairing: 'waiting_for_pairing'
} as const)
type Stage = (typeof Stage)[keyof typeof Stage]

interface ShortcakeSession {
    readonly companion: ShortcakeCompanionEphemeralIdentity
    readonly ref: string
    readonly deviceType: proto.DeviceProps.PlatformType
    /** True when a pairing handoff proof was sent (server may skip the code-matching UX). */
    readonly skipHandoffUx: boolean
    stage: Stage
    encryptionKey: Uint8Array | null
    verificationCode: string | null
}

export interface WaShortcakeFlowOptions {
    readonly logger: Logger
    readonly socket: {
        readonly sendNode: (node: BinaryNode) => Promise<void>
        readonly query: (node: BinaryNode, timeoutMs: number) => Promise<BinaryNode>
    }
    /** WebAuthn signer (passkey assertion) – external, keeps credentials out of the protocol. */
    readonly signAssertion: WaShortcakeAssertionSigner
    /**
     * Companion credentials access. The pairing-request payload (`PairingRequest`:
     * noise static + identity pubkey + ADV secret) is built internally from
     * these; the ADV secret is also rotated on a prologue request (matching the
     * official clients), so an updater is required.
     */
    readonly auth: {
        readonly getCredentials: () => WaAuthCredentials | null
        readonly updateCredentials: (credentials: WaAuthCredentials) => Promise<void>
    }
    /** Companion platform reported in the ephemeral identity. */
    readonly deviceType?: proto.DeviceProps.PlatformType
    /** Optional internal observability hooks. */
    readonly callbacks?: {
        /** Verification code derived after the primary replies. */
        readonly emitVerificationCode?: (code: string) => void
        /** Prologue accepted by the server; now waiting for the primary. */
        readonly emitPrologueSent?: () => void
    }
}

/**
 * Drives the companion side of the WhatsApp "Shortcake" passkey-linking
 * handshake (the `xmlns="md"` IQ exchange + commit/reveal ECDH). It owns the
 * wire protocol and crypto only; the WebAuthn assertion and the registration
 * payload are injected by the caller.
 */
export class WaShortcakeFlow {
    private readonly opts: WaShortcakeFlowOptions
    private session: ShortcakeSession | null
    private handoffKey: PasskeyHandoffKey | null

    public constructor(options: WaShortcakeFlowOptions) {
        this.opts = options
        this.session = null
        this.handoffKey = null
    }

    public hasSession(): boolean {
        return this.session !== null
    }

    public clearSession(): void {
        this.session = null
        this.handoffKey = null
    }

    /**
     * Runs the prologue: fetch the request options, obtain the WebAuthn
     * assertion (external), fetch the ref, build the companion ephemeral
     * identity + commitment, and send the `passkey_prologue` IQ.
     */
    public async executePrologue(
        args: {
            readonly requestOptions?: Uint8Array
            readonly pairingHandoffProof?: Uint8Array
        } = {}
    ): Promise<void> {
        const deviceType = this.opts.deviceType ?? proto.DeviceProps.PlatformType.CHROME

        const requestOptions = args.requestOptions ?? (await this.requestPasskeyRequestOptions())
        const assertion = await this.opts.signAssertion(requestOptions)
        const ref = await this.requestRef()
        const companion = await generateCompanionEphemeralIdentity({ ref, deviceType })

        let pairingHandoffProof = args.pairingHandoffProof
        const handoffKey = this.handoffKey
        this.handoffKey = null
        if (
            pairingHandoffProof === undefined &&
            handoffKey !== null &&
            Date.now() - handoffKey.ts < HANDOFF_KEY_TTL_MS
        ) {
            pairingHandoffProof = hmacSha256Sign(handoffKey.hmac, companion.prologuePayloadBytes)
        }
        const skipHandoffUx = pairingHandoffProof !== undefined

        const response = await this.opts.socket.query(
            buildSetPasskeyPrologueRequestNode({
                credentialId: assertion.credentialId,
                webauthnAssertion: assertion.webauthnAssertion,
                prologuePayload: companion.prologuePayloadBytes,
                pairingHandoffProof
            }),
            WA_DEFAULTS.IQ_TIMEOUT_MS
        )
        assertIqResult(response, 'shortcake set-passkey-prologue')

        this.session = {
            companion,
            ref,
            deviceType,
            skipHandoffUx,
            stage: Stage.WaitingForPrimaryIdentity,
            encryptionKey: null,
            verificationCode: null
        }
        this.opts.logger.debug('shortcake prologue sent', { ref, skipHandoffUx })
        this.opts.callbacks?.emitPrologueSent?.()
    }

    /**
     * Routes the two server-pushed Shortcake notifications. Returns `true` when
     * the notification was a Shortcake one (and was consumed):
     * - `passkey_prologue_request` kicks the flow off (server forces passkey,
     *   often right after a pairing-code `companion_finish`); the WebAuthn
     *   options are usually embedded.
     * - `crsc_continuation` carries the primary's ephemeral identity.
     */
    public async handleIncomingNotification(node: BinaryNode): Promise<boolean> {
        if (node.attrs.type === WA_NOTIFICATION_TYPES.PASSKEY_PROLOGUE_REQUEST) {
            return this.handlePasskeyPrologueRequest(node)
        }
        if (node.attrs.type === WA_NOTIFICATION_TYPES.CRSC_CONTINUATION) {
            return this.handlePrimaryEphemeralIdentity(node)
        }
        return false
    }

    private async handlePasskeyPrologueRequest(node: BinaryNode): Promise<boolean> {
        await this.ackNotification(node)
        await this.stashHandoffKeyAndRotateAdv()
        const optionsNode = findNodeChild(node, WA_NODE_TAGS.PASSKEY_REQUEST_OPTIONS)
        const requestOptions = optionsNode
            ? decodeNodeContentUtf8OrBytes(optionsNode.content, 'shortcake.passkey_request_options')
            : undefined
        this.opts.logger.debug('shortcake prologue requested by server', {
            embeddedOptions: optionsNode !== undefined
        })
        await this.executePrologue({ requestOptions })
        return true
    }

    /**
     * Derives a pairing handoff HMAC key from the current ADV secret and rotates
     * the ADV secret (matching the official clients). The derived key signs the
     * next prologue's handoff proof; the rotated secret goes into the eventual
     * `PairingRequest`.
     */
    private async stashHandoffKeyAndRotateAdv(): Promise<void> {
        const credentials = this.opts.auth.getCredentials()
        if (!credentials) {
            return
        }
        this.handoffKey = {
            hmac: hkdf(credentials.advSecretKey, null, HANDOFF_KEY_INFO, 32),
            ts: Date.now()
        }
        await this.opts.auth.updateCredentials({
            ...credentials,
            advSecretKey: await randomBytesAsync(32)
        })
    }

    private async handlePrimaryEphemeralIdentity(node: BinaryNode): Promise<boolean> {
        const child = findNodeChild(node, WA_NODE_TAGS.PRIMARY_EPHEMERAL_IDENTITY)
        if (!child) {
            return false
        }
        const session = this.session
        if (!session || session.stage !== Stage.WaitingForPrimaryIdentity) {
            this.opts.logger.warn('shortcake primary identity ignored: no active prologue')
            await this.ackNotification(node)
            return true
        }

        await this.ackNotification(node)

        const primary = decodePrimaryEphemeralIdentity(
            decodeNodeContentUtf8OrBytes(child.content, 'shortcake.primary_ephemeral_identity')
        )

        const nonceResponse = await this.opts.socket.query(
            buildSetCompanionNonceRequestNode(session.companion.companionNonce),
            WA_DEFAULTS.IQ_TIMEOUT_MS
        )
        assertIqResult(nonceResponse, 'shortcake set-companion-nonce')

        const verificationCode = deriveVerificationCode(session.companion.companionNonce, primary)
        const encryptionKey = await deriveEncryptionKey({
            companionPrivKey: session.companion.keyPair.privKey,
            primaryPublicKey: primary.publicKey,
            deviceType: session.deviceType,
            ref: session.ref
        })

        session.encryptionKey = encryptionKey
        session.verificationCode = verificationCode
        session.stage = Stage.WaitingForConfirmation
        this.opts.logger.debug('shortcake verification code ready')
        this.opts.callbacks?.emitVerificationCode?.(verificationCode)
        await this.confirmVerificationCode()
        return true
    }

    /** Current verification code, once derived. */
    public getVerificationCode(): string | null {
        return this.session?.verificationCode ?? null
    }

    /**
     * Confirms the verification code: builds + AES-GCM seals the pairing request
     * and sends the `encrypted_pairing_request` IQ.
     */
    public async confirmVerificationCode(): Promise<void> {
        const session = this.session
        if (!session || session.stage !== Stage.WaitingForConfirmation || !session.encryptionKey) {
            throw new Error('shortcake: no verification code awaiting confirmation')
        }
        const credentials = this.opts.auth.getCredentials()
        if (!credentials) {
            throw new Error('shortcake: credentials are not initialized')
        }
        const plaintext = proto.PairingRequest.encode({
            companionPublicKey: credentials.noiseKeyPair.pubKey,
            companionIdentityKey: credentials.registrationInfo.identityKeyPair.pubKey,
            advSecret: credentials.advSecretKey
        }).finish()
        const envelope = await encryptPairingRequest(session.encryptionKey, plaintext)

        const response = await this.opts.socket.query(
            buildSetEncryptedPairingRequestRequestNode(envelope),
            WA_DEFAULTS.IQ_TIMEOUT_MS
        )
        assertIqResult(response, 'shortcake set-encrypted-pairing-request')
        session.stage = Stage.WaitingForPairing
        this.opts.logger.debug('shortcake encrypted pairing request sent')
    }

    private async requestPasskeyRequestOptions(): Promise<Uint8Array> {
        const response = await this.opts.socket.query(
            buildGetPasskeyRequestOptionsRequestNode(),
            WA_DEFAULTS.IQ_TIMEOUT_MS
        )
        assertIqResult(response, 'shortcake get-passkey-request-options')
        const optionsNode = findNodeChild(response, WA_NODE_TAGS.PASSKEY_REQUEST_OPTIONS)
        if (!optionsNode) {
            throw new Error('shortcake: get-passkey-request-options response missing options')
        }
        return decodeNodeContentUtf8OrBytes(
            optionsNode.content,
            'shortcake.passkey_request_options'
        )
    }

    private async requestRef(): Promise<string> {
        const response = await this.opts.socket.query(
            buildShortcakeGetRefRequestNode(),
            WA_DEFAULTS.IQ_TIMEOUT_MS
        )
        assertIqResult(response, 'shortcake get-ref')
        const refNode = findNodeChild(response, WA_NODE_TAGS.REF)
        if (!refNode) {
            throw new Error('shortcake: get-ref response missing ref')
        }
        return TEXT_DECODER.decode(decodeNodeContentUtf8OrBytes(refNode.content, 'shortcake.ref'))
    }

    private async ackNotification(node: BinaryNode): Promise<void> {
        await this.opts.socket.sendNode(buildAckNode({ kind: 'notification', node }))
    }
}
