import type { WaAuthCredentials } from '@auth/types'
import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS } from '@protocol/constants'
import { bytesToBase64 } from '@util/bytes'

export class WaQrFlow {
    private readonly logger: Logger
    private readonly getCredentials: () => WaAuthCredentials | null
    private readonly getDevicePlatform: () => string
    private readonly emitQr: (qr: string, ttlMs: number) => void
    private qrRefs: readonly string[]
    private qrRefIndex: number
    private currentQrTimer: NodeJS.Timeout | null

    public constructor(args: {
        readonly logger: Logger
        readonly getCredentials: () => WaAuthCredentials | null
        readonly getDevicePlatform: () => string
        readonly emitQr: (qr: string, ttlMs: number) => void
    }) {
        this.logger = args.logger
        this.getCredentials = args.getCredentials
        this.getDevicePlatform = args.getDevicePlatform
        this.emitQr = args.emitQr
        this.qrRefs = []
        this.qrRefIndex = 0
        this.currentQrTimer = null
    }

    public hasQr(): boolean {
        return this.qrRefIndex < this.qrRefs.length || this.currentQrTimer !== null
    }

    public clear(): void {
        this.logger.trace('qr flow clear')
        if (this.currentQrTimer) {
            clearTimeout(this.currentQrTimer)
            this.currentQrTimer = null
        }
        this.qrRefs = []
        this.qrRefIndex = 0
    }

    public refreshCurrentQr(): boolean {
        if (this.qrRefIndex === 0) {
            this.logger.trace('qr flow refresh skipped: no active ref')
            return false
        }
        const ref = this.qrRefs[this.qrRefIndex - 1]
        const credentials = this.getCredentials()
        if (!credentials) {
            this.logger.warn('qr flow refresh skipped: missing credentials')
            return false
        }
        const ttlMs =
            this.qrRefs.length - this.qrRefIndex === 5
                ? WA_DEFAULTS.QR_INITIAL_TTL_MS
                : WA_DEFAULTS.QR_ROTATION_TTL_MS
        this.logger.debug('qr flow refresh emit', {
            ttlMs,
            remainingRefs: this.qrRefs.length - this.qrRefIndex
        })
        this.emitQr(this.buildQr(ref, credentials), ttlMs)
        return true
    }

    public setRefs(refs: readonly string[]): void {
        this.clear()
        this.qrRefs = refs
        this.logger.info('qr refs updated', { count: this.qrRefs.length })
        if (this.qrRefs.length === 0) {
            return
        }
        this.rotateRef()
    }

    private rotateRef(): void {
        const credentials = this.getCredentials()
        if (!credentials) {
            this.clear()
            return
        }
        if (this.qrRefIndex >= this.qrRefs.length) {
            this.clear()
            return
        }
        const ref = this.qrRefs[this.qrRefIndex++]

        const remainingRefs = this.qrRefs.length - this.qrRefIndex
        const ttlMs =
            remainingRefs === 5 ? WA_DEFAULTS.QR_INITIAL_TTL_MS : WA_DEFAULTS.QR_ROTATION_TTL_MS
        this.logger.trace('qr flow emit new code', { ttlMs, remainingRefs })
        this.currentQrTimer = setTimeout(() => {
            this.currentQrTimer = null
            this.rotateRef()
        }, ttlMs)
        try {
            this.emitQr(this.buildQr(ref, credentials), ttlMs)
        } catch (error) {
            if (this.currentQrTimer) {
                clearTimeout(this.currentQrTimer)
                this.currentQrTimer = null
            }
            throw error
        }
    }

    private buildQr(ref: string, credentials: WaAuthCredentials): string {
        return (
            ref +
            ',' +
            bytesToBase64(credentials.noiseKeyPair.pubKey) +
            ',' +
            bytesToBase64(credentials.registrationInfo.identityKeyPair.pubKey) +
            ',' +
            bytesToBase64(credentials.advSecretKey) +
            ',' +
            this.getDevicePlatform()
        )
    }
}
