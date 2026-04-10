/** Runs the server side of the QR pairing flow. */

import type { WaFakeConnectionPipeline } from '../infra/WaFakeConnectionPipeline'
import {
    buildAdvSignedDeviceIdentity,
    type FakePrimaryDevice,
    generateFakePrimaryDevice
} from '../protocol/auth/fake-primary-device'
import { buildPairDeviceIq, buildPairSuccessIq } from '../protocol/auth/pair-device'
import { randomBytesAsync } from '../transport/crypto'

export interface FakePairingDriverOptions {
    readonly deviceJid: string
    readonly deviceLid?: string
    readonly companionDeviceId?: number
    readonly platform?: string
    readonly primary?: FakePrimaryDevice
}

export interface CompanionPairingMaterial {
    readonly advSecretKey: Uint8Array
    readonly identityPublicKey: Uint8Array
}

export interface FakePairingDriverDeps {
    readonly pipeline: WaFakeConnectionPipeline
    readonly waitForPairDeviceAck?: (pairDeviceIqId: string) => Promise<void>
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

        const refs = await Promise.all(Array.from({ length: 6 }, () => randomBytesAsync(16)))
        const pairDeviceIq = buildPairDeviceIq({ refs })
        await this.deps.pipeline.sendStanza(pairDeviceIq)
        const waitForAck =
            this.deps.waitForPairDeviceAck?.(pairDeviceIq.attrs.id) ?? Promise.resolve()

        const [material] = await Promise.all([this.deps.companionMaterialResolver(), waitForAck])

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
