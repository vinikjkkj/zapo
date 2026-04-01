import { parseAbPropsIqResult } from '@client/events/abprops'
import type { Logger } from '@infra/log/types'
import {
    AB_PROP_CONFIGS,
    WA_ABPROPS_REFRESH_BOUNDS,
    resolveAbPropNameByCode,
    type AbPropName,
    type AbPropType,
    type AbPropValue
} from '@protocol/abprops'
import { WA_DEFAULTS } from '@protocol/constants'
import { buildGetAbPropsIq } from '@transport/node/builders/abprops'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

type WaAbPropsRuntime = {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
}

interface AbPropSyncState {
    hash: string | null
    abKey: string | null
    refreshId: number | null
}

export class WaAbPropsCoordinator {
    private readonly logger: Logger
    private readonly runtime: WaAbPropsRuntime
    private readonly cache: Map<AbPropName, AbPropValue>
    private readonly syncState: AbPropSyncState
    private syncPromise: Promise<void> | null
    private syncEpoch: number
    private pendingSync: boolean

    public constructor(options: { readonly logger: Logger; readonly runtime: WaAbPropsRuntime }) {
        this.logger = options.logger
        this.runtime = options.runtime
        this.cache = new Map()
        this.syncState = { hash: null, abKey: null, refreshId: null }
        this.syncPromise = null
        this.syncEpoch = 0
        this.pendingSync = false
    }

    public getConfigValue<T extends AbPropValue>(name: AbPropName): T {
        const cached = this.cache.get(name)
        if (cached !== undefined) {
            return cached as T
        }
        return AB_PROP_CONFIGS[name].defaultValue as T
    }

    public sync(): void {
        if (this.syncPromise) {
            this.pendingSync = true
            return
        }
        this.startSync()
    }

    public reset(): void {
        this.cache.clear()
        this.syncState.hash = null
        this.syncState.abKey = null
        this.syncState.refreshId = null
        this.syncPromise = null
        this.pendingSync = false
        this.syncEpoch += 1
    }

    private startSync(): void {
        const epoch = this.syncEpoch
        this.pendingSync = false
        this.syncPromise = this.executeSyncWithRetry(epoch)
            .catch((error) => {
                this.logger.warn('ab props sync failed', {
                    message: toError(error).message
                })
            })
            .finally(() => {
                if (this.syncEpoch !== epoch) {
                    return
                }
                this.syncPromise = null
                if (this.pendingSync) {
                    this.startSync()
                }
            })
    }

    private async executeSyncWithRetry(epoch: number): Promise<void> {
        const maxRetries = 3
        for (let attempt = 0; attempt < maxRetries; attempt += 1) {
            if (this.syncEpoch !== epoch) {
                return
            }
            try {
                await this.executeSync(epoch)
                return
            } catch (error) {
                if (attempt === maxRetries - 1) {
                    throw error
                }
                this.logger.debug('ab props sync retrying', {
                    attempt: attempt + 1,
                    message: toError(error).message
                })
            }
        }
    }

    private async executeSync(epoch: number): Promise<void> {
        const iqNode = buildGetAbPropsIq({
            hash: this.syncState.hash,
            refreshId: this.syncState.refreshId
        })
        const response = await this.runtime.queryWithContext(
            'abprops.sync',
            iqNode,
            WA_DEFAULTS.IQ_TIMEOUT_MS
        )

        if (this.syncEpoch !== epoch) {
            return
        }

        const result = parseAbPropsIqResult(response)

        if (result.abKey !== null) {
            this.syncState.abKey = result.abKey
        }
        if (result.hash !== null) {
            this.syncState.hash = result.hash
        }
        if (result.refreshId !== null) {
            this.syncState.refreshId = result.refreshId
        }

        if (!result.isDeltaUpdate) {
            this.cache.clear()
        }

        let applied = 0
        for (let i = 0; i < result.props.length; i += 1) {
            const entry = result.props[i]
            const name = resolveAbPropNameByCode(entry.configCode)
            if (!name) {
                continue
            }
            const config = AB_PROP_CONFIGS[name]
            const parsed = parseConfigValue(entry.configValue, config.type, config.defaultValue)
            this.cache.set(name, parsed)
            applied += 1
        }

        this.logger.info('ab props synced', {
            received: result.props.length,
            applied,
            isDelta: result.isDeltaUpdate,
            abKey: result.abKey,
            refresh: result.refresh !== null ? clampRefresh(result.refresh) : null
        })
    }
}

function parseConfigValue(
    value: string | null,
    type: AbPropType,
    defaultValue: AbPropValue
): AbPropValue {
    if (value === null) {
        return defaultValue
    }
    if (type === 'bool') {
        return value === '1' || value === 'true' || value === 'True'
    }
    if (type === 'int') {
        const parsed = Number.parseInt(value, 10)
        return Number.isSafeInteger(parsed) ? parsed : (defaultValue as number)
    }
    return value
}

function clampRefresh(seconds: number): number {
    return Math.max(
        WA_ABPROPS_REFRESH_BOUNDS.MIN_S,
        Math.min(WA_ABPROPS_REFRESH_BOUNDS.MAX_S, seconds)
    )
}
