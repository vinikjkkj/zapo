import type { Db } from 'mongodb'
import type { Logger } from 'zapo-js'

export interface WaMongoStorageOptions {
    readonly db: Db
    readonly sessionId: string
    readonly collectionPrefix?: string
    /**
     * Logger used for index-build progress, slow operations, and degraded
     * paths (e.g. transactions unsupported by the deployment). Bound
     * automatically by `createMongoStore` with `{ scope: 'store',
     * provider: 'mongo', domain: '<name>', sessionId }`. Leave unset for
     * silent operation.
     */
    readonly logger?: Logger
    /**
     * Threshold in milliseconds above which a Mongo operation emits a
     * `warn`. Defaults to `250`.
     */
    readonly slowOperationThresholdMs?: number
}
