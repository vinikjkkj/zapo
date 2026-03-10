import type { WaAuthCredentials } from '../../auth/types'
import type { Logger } from '../../infra/log/types'
import { WA_DEFAULTS, WA_XMLNS } from '../../protocol/constants'
import { SIGNAL_UPLOAD_PREKEYS_COUNT } from '../../signal/api/constants'
import { buildPreKeyUploadIq, parsePreKeyUploadFailure } from '../../signal/api/prekeys'
import { generatePreKeyPair } from '../../signal/registration/keygen'
import type { WaSignalStore } from '../../signal/store/WaSignalStore'
import { findNodeChild } from '../../transport/node/helpers'
import { assertIqResult, buildIqNode } from '../../transport/node/query'
import type { BinaryNode } from '../../transport/types'
import { toError } from '../../util/primitives'

interface WaPassiveTasksRuntimePort {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly getCurrentCredentials: () => WaAuthCredentials | null
    readonly persistServerHasPreKeys: (serverHasPreKeys: boolean) => Promise<void>
    readonly sendNodeDirect: (node: BinaryNode) => Promise<void>
    readonly takeDanglingReceipts: () => BinaryNode[]
    readonly requeueDanglingReceipt: (node: BinaryNode) => void
    readonly shouldQueueDanglingReceipt: (node: BinaryNode, error: Error) => boolean
}

interface WaPassiveTasksCoordinatorOptions {
    readonly logger: Logger
    readonly signalStore: WaSignalStore
    readonly runtime: WaPassiveTasksRuntimePort
}

export class WaPassiveTasksCoordinator {
    private readonly logger: Logger
    private readonly signalStore: WaSignalStore
    private readonly runtime: WaPassiveTasksRuntimePort
    private passiveTasksPromise: Promise<void> | null
    private abPropsHash: string | null
    private abPropsRefreshId: number | null

    public constructor(options: WaPassiveTasksCoordinatorOptions) {
        this.logger = options.logger
        this.signalStore = options.signalStore
        this.runtime = options.runtime
        this.passiveTasksPromise = null
        this.abPropsHash = null
        this.abPropsRefreshId = null
    }

    public startPassiveTasksAfterConnect(): void {
        if (this.passiveTasksPromise) {
            this.logger.trace('passive connect tasks already running')
            return
        }
        this.passiveTasksPromise = this.runPassiveTasksAfterConnect()
            .catch((error) => {
                this.logger.warn('passive connect tasks failed', {
                    message: toError(error).message
                })
            })
            .finally(() => {
                this.passiveTasksPromise = null
            })
    }

    public resetInFlightState(): void {
        this.passiveTasksPromise = null
    }

    private async runPassiveTasksAfterConnect(): Promise<void> {
        await this.uploadPreKeysIfMissing()

        const credentials = this.runtime.getCurrentCredentials()
        const isRegistered = credentials?.meJid !== null && credentials?.meJid !== undefined
        if (!isRegistered) {
            this.logger.trace('registered passive tasks skipped: session is not registered')
            return
        }

        await this.syncAbProps()
        await this.flushDanglingReceipts()
    }

    private async uploadPreKeysIfMissing(): Promise<void> {
        const serverHasPreKeys = await this.signalStore.getServerHasPreKeys()
        if (serverHasPreKeys) {
            this.logger.trace('prekey upload skipped: server already has prekeys')
            return
        }

        const registrationInfo = await this.signalStore.getRegistrationInfo()
        const signedPreKey = await this.signalStore.getSignedPreKey()
        if (!registrationInfo || !signedPreKey) {
            this.logger.warn('prekey upload skipped: registration info is missing')
            return
        }

        const preKeys = await this.signalStore.getOrGenPreKeys(
            SIGNAL_UPLOAD_PREKEYS_COUNT,
            async (keyId) => generatePreKeyPair(keyId)
        )
        if (preKeys.length === 0) {
            throw new Error('no prekey available for upload')
        }

        const lastPreKeyId = preKeys[preKeys.length - 1].keyId
        await this.signalStore.markKeyAsUploaded(lastPreKeyId)
        const uploadNode = buildPreKeyUploadIq(registrationInfo, signedPreKey, preKeys)
        const response = await this.runtime.queryWithContext(
            'prekeys.upload',
            uploadNode,
            WA_DEFAULTS.IQ_TIMEOUT_MS,
            {
                count: preKeys.length,
                lastPreKeyId
            }
        )
        if (response.attrs.type === 'result') {
            await this.signalStore.setServerHasPreKeys(true)
            await this.runtime.persistServerHasPreKeys(true)
            this.logger.info('uploaded prekeys to server', {
                count: preKeys.length,
                lastPreKeyId
            })
            return
        }

        const failure = parsePreKeyUploadFailure(response)
        this.logger.warn('upload prekeys failed', {
            count: preKeys.length,
            errorCode: failure.errorCode,
            errorText: failure.errorText
        })
    }

    private async syncAbProps(): Promise<void> {
        const propsAttrs: Record<string, string> = {
            protocol: WA_DEFAULTS.ABPROPS_PROTOCOL_VERSION
        }
        if (this.abPropsHash) {
            propsAttrs.hash = this.abPropsHash
        }
        if (this.abPropsRefreshId !== null) {
            propsAttrs.refresh_id = `${this.abPropsRefreshId}`
        }

        const response = await this.runtime.queryWithContext(
            'abprops.sync',
            buildIqNode('get', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.ABT, [
                {
                    tag: 'props',
                    attrs: propsAttrs
                }
            ]),
            WA_DEFAULTS.IQ_TIMEOUT_MS
        )
        assertIqResult(response, 'abprops')
        const propsNode = findNodeChild(response, 'props')
        if (!propsNode) {
            this.logger.debug('abprops response has no props node')
            return
        }

        const nextHash = propsNode.attrs.hash
        if (nextHash && nextHash.length > 0) {
            this.abPropsHash = nextHash
        }
        const nextRefreshIdRaw = propsNode.attrs.refresh_id
        if (nextRefreshIdRaw !== undefined) {
            const nextRefreshId = Number.parseInt(nextRefreshIdRaw, 10)
            if (Number.isSafeInteger(nextRefreshId) && nextRefreshId >= 0) {
                this.abPropsRefreshId = nextRefreshId
            }
        }

        this.logger.info('abprops synchronized', {
            hasHash: this.abPropsHash !== null,
            refreshId: this.abPropsRefreshId
        })
    }

    private async flushDanglingReceipts(): Promise<void> {
        const pending = this.runtime.takeDanglingReceipts()
        if (pending.length === 0) {
            return
        }

        this.logger.info('flushing dangling receipts', { count: pending.length })
        for (let index = 0; index < pending.length; index += 1) {
            const node = pending[index]
            try {
                await this.runtime.sendNodeDirect(node)
            } catch (error) {
                const normalized = toError(error)
                if (this.runtime.shouldQueueDanglingReceipt(node, normalized)) {
                    for (
                        let restoreIndex = index;
                        restoreIndex < pending.length;
                        restoreIndex += 1
                    ) {
                        this.runtime.requeueDanglingReceipt(pending[restoreIndex])
                    }
                    this.logger.warn('stopped dangling receipt flush due transient send error', {
                        remaining: pending.length - index,
                        message: normalized.message
                    })
                    return
                }
                this.logger.warn('dropping dangling receipt due non-retryable send error', {
                    id: node.attrs.id,
                    to: node.attrs.to,
                    message: normalized.message
                })
            }
        }
        this.logger.info('dangling receipts flushed')
    }
}
