import type { Logger } from '@infra/log/types'
import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS } from '@protocol/constants'
import { buildSignedPreKeyRotateIq } from '@signal/api/prekeys'
import { generateSignedPreKey } from '@signal/registration/keygen'
import type { WaSignalStore } from '@store/contracts/signal.store'
import { parseIqError } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

interface SignalRotateKeyApiOptions {
    readonly logger: Logger
    readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
    readonly signalStore: WaSignalStore
    readonly defaultTimeoutMs?: number
}

export class SignalRotateKeyApi {
    private readonly logger: SignalRotateKeyApiOptions['logger']
    private readonly query: SignalRotateKeyApiOptions['query']
    private readonly signalStore: SignalRotateKeyApiOptions['signalStore']
    private readonly defaultTimeoutMs: number

    public constructor(options: SignalRotateKeyApiOptions) {
        this.logger = options.logger
        this.query = options.query
        this.signalStore = options.signalStore
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? WA_DEFAULTS.IQ_TIMEOUT_MS
    }

    public async rotateSignedPreKey(
        timeoutMs = this.defaultTimeoutMs
    ): Promise<{ shouldDigestKey: boolean; errorCode?: number }> {
        const registrationInfo = await this.signalStore.getRegistrationInfo()
        if (!registrationInfo) {
            throw new Error('signal rotate key requires registration info')
        }

        const currentSignedPreKey = await this.signalStore.getSignedPreKey()
        const nextSignedPreKey = await generateSignedPreKey(
            currentSignedPreKey ? currentSignedPreKey.keyId + 1 : 1,
            registrationInfo.identityKeyPair.privKey
        )
        await this.signalStore.setSignedPreKey(nextSignedPreKey)

        this.logger.info('signal signed prekey uploading', {
            keyId: nextSignedPreKey.keyId,
            timeoutMs
        })
        const response = await this.query(buildSignedPreKeyRotateIq(nextSignedPreKey), timeoutMs)
        if (response.tag !== WA_NODE_TAGS.IQ) {
            throw new Error(`invalid signal rotate response tag: ${response.tag}`)
        }
        if (response.attrs.type === WA_IQ_TYPES.RESULT) {
            this.logger.info('signal signed prekey upload completed', {
                keyId: nextSignedPreKey.keyId
            })
            return { shouldDigestKey: false }
        }
        if (response.attrs.type !== WA_IQ_TYPES.ERROR) {
            throw new Error(
                `invalid signal rotate response type: ${response.attrs.type ?? 'unknown'}`
            )
        }

        const failure = parseIqError(response)
        const errorCode = failure.numericCode
        if (errorCode === 406) {
            this.logger.warn('signal rotate key generated bad key')
            return { shouldDigestKey: false, errorCode }
        }
        if (errorCode === 409) {
            this.logger.warn('signal rotate key validation mismatch')
            return { shouldDigestKey: true, errorCode }
        }
        if (errorCode !== undefined && errorCode >= 500) {
            this.logger.warn('signal rotate key server error', {
                errorCode
            })
            return { shouldDigestKey: false, errorCode }
        }
        this.logger.warn('signal rotate key unrecognized error', {
            errorCode,
            errorText: failure.text
        })
        return { shouldDigestKey: true, ...(errorCode !== undefined ? { errorCode } : {}) }
    }
}
