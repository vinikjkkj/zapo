/**
 * Drives the QR-pairing flow with a real `WaClient`.
 *
 * The fake server can run a full pairing exchange end-to-end with no
 * mocks: it sends `pair-device` IQs (with random refs) right after the
 * client emits a stream `<success/>`, and once the client has acked the
 * pair-device IQ AND someone has fed in the `advSecretKey` (extracted
 * from the QR string the lib emits via `auth_qr`), it sends a fully
 * signed `pair-success` IQ. The lib's `WaPairingFlow.handlePairSuccess`
 * verifies the HMAC, the account signature, replies with
 * `<pair-device-sign>` and emits `auth_paired` with the new credentials.
 *
 * Cross-checked against `src/auth/pairing/WaPairingFlow.ts` —
 * specifically the `handlePairSuccess` and `buildPairSuccessResponseIdentity`
 * paths in the lib.
 */

import type { WaFakeConnectionPipeline } from '../infra/WaFakeConnectionPipeline'
import {
    buildAdvSignedDeviceIdentity,
    type FakePrimaryDevice,
    generateFakePrimaryDevice
} from '../protocol/auth/fake-primary-device'
import { buildPairDeviceIq, buildPairSuccessIq } from '../protocol/auth/pair-device'
import { randomBytesAsync } from '../transport/crypto'

export interface FakePairingDriverOptions {
    /** Companion device JID to assign in the `pair-success` IQ. */
    readonly deviceJid: string
    /** Optional companion LID JID. */
    readonly deviceLid?: string
    /** Companion device id (default: 1). */
    readonly companionDeviceId?: number
    /** Platform name (default: `IOS`). */
    readonly platform?: string
    /** Optional pre-generated primary identity (default: random). */
    readonly primary?: FakePrimaryDevice
}

export interface CompanionPairingMaterial {
    readonly advSecretKey: Uint8Array
    readonly identityPublicKey: Uint8Array
}

export interface FakePairingDriverDeps {
    readonly pipeline: WaFakeConnectionPipeline
    /**
     * Resolves to the companion's pairing material (advSecretKey +
     * identity pubkey) once the test side has extracted it from the
     * lib's `auth_qr` event. The driver awaits this before building
     * the `pair-success` IQ.
     */
    readonly companionMaterialResolver: () => Promise<CompanionPairingMaterial>
}

export class FakePairingDriver {
    private readonly options: FakePairingDriverOptions
    private readonly deps: FakePairingDriverDeps
    private primary: FakePrimaryDevice | null = null

    public constructor(options: FakePairingDriverOptions, deps: FakePairingDriverDeps) {
        this.options = options
        this.deps = deps
    }

    public async run(): Promise<void> {
        this.primary = this.options.primary ?? (await generateFakePrimaryDevice())

        // Send 6 random refs. The lib uses each ref as an opaque marker
        // when emitting the QR string; their content is not validated.
        const refs = await Promise.all(Array.from({ length: 6 }, () => randomBytesAsync(16)))
        await this.deps.pipeline.sendStanza(buildPairDeviceIq({ refs }))

        // Wait for the test to extract the companion's advSecretKey +
        // identity pubkey from the lib's `auth_qr` event and feed them
        // back here.
        const material = await this.deps.companionMaterialResolver()

        const { deviceIdentityBytes } = await buildAdvSignedDeviceIdentity({
            primary: this.primary,
            advSecretKey: material.advSecretKey,
            companionIdentityPublicKey: material.identityPublicKey,
            companionDeviceId: this.options.companionDeviceId ?? 1
        })

        await this.deps.pipeline.sendStanza(
            buildPairSuccessIq({
                deviceJid: this.options.deviceJid,
                deviceLid: this.options.deviceLid,
                platform: this.options.platform ?? 'IOS',
                deviceIdentityBytes
            })
        )
    }
}
