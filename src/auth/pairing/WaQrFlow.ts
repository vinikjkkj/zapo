import type { Logger } from '../../infra/log/types'
import { WA_DEFAULTS } from '../../protocol/constants'
import { bytesToBase64 } from '../../util/base64'
import type { WaAuthCredentials } from '../types'

export class WaQrFlow {
    private readonly logger: Logger
    private readonly getCredentials: () => WaAuthCredentials | null
    private readonly getDevicePlatform: () => string
    private readonly emitQr: (qr: string, ttlMs: number) => void
    private qrRefs: string[]
    private currentRef: string | null
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
        this.currentRef = null
        this.currentQrTimer = null
    }

    public hasQr(): boolean {
        return this.qrRefs.length > 0 || this.currentQrTimer !== null
    }

    public clear(): void {
        this.logger.trace('qr flow clear')
        if (this.currentQrTimer) {
            clearTimeout(this.currentQrTimer)
            this.currentQrTimer = null
        }
        this.qrRefs = []
        this.currentRef = null
    }

    public refreshCurrentQr(): boolean {
        if (!this.currentRef) {
            this.logger.trace('qr flow refresh skipped: no active ref')
            return false
        }
        const credentials = this.getCredentials()
        if (!credentials) {
            this.logger.warn('qr flow refresh skipped: missing credentials')
            return false
        }
        const ttlMs =
            this.qrRefs.length === 5
                ? WA_DEFAULTS.QR_INITIAL_TTL_MS
                : WA_DEFAULTS.QR_ROTATION_TTL_MS
        this.logger.debug('qr flow refresh emit', { ttlMs, remainingRefs: this.qrRefs.length })
        this.emitQr(this.buildQr(this.currentRef, credentials), ttlMs)
        return true
    }

    public setRefs(refs: readonly string[]): void {
        this.clear()
        this.qrRefs = [...refs]
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

        const ref = this.qrRefs.shift()
        if (!ref) {
            this.clear()
            return
        }
        this.currentRef = ref

        const ttlMs =
            this.qrRefs.length === 5
                ? WA_DEFAULTS.QR_INITIAL_TTL_MS
                : WA_DEFAULTS.QR_ROTATION_TTL_MS
        this.logger.trace('qr flow emit new code', { ttlMs, remainingRefs: this.qrRefs.length })
        this.emitQr(this.buildQr(ref, credentials), ttlMs)

        this.currentQrTimer = setTimeout(() => {
            this.currentQrTimer = null
            this.rotateRef()
        }, ttlMs)
    }

    private buildQr(ref: string, credentials: WaAuthCredentials): string {
        return [
            ref,
            bytesToBase64(credentials.noiseKeyPair.pubKey),
            bytesToBase64(credentials.registrationInfo.identityKeyPair.pubKey),
            bytesToBase64(credentials.advSecretKey),
            this.getDevicePlatform()
        ].join(',')
    }
}
