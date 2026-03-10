import type { WaAuthCredentials } from '../../auth/types'
import type { Logger } from '../../infra/log/types'
import type { WaCommsConfig } from '../../transport/types'
import { WaComms } from '../../transport/WaComms'

export interface WaCommsBootstrapAuthPort {
    readonly buildCommsConfig: () => WaCommsConfig
    readonly persistServerStaticKey: (serverStaticKey: Uint8Array) => Promise<void>
}

export interface WaCommsBootstrapRuntimePort {
    readonly setComms: (comms: WaComms | null) => void
    readonly clearMediaConnCache: () => void
    readonly bindComms: (comms: WaComms | null) => void
    readonly onIncomingFrame: (frame: Uint8Array) => Promise<void>
    readonly syncKeepAlive: (registered: boolean) => void
    readonly startPassiveTasksAfterConnect: () => void
}

export interface WaCommsBootstrapCoordinatorOptions {
    readonly logger: Logger
    readonly auth: WaCommsBootstrapAuthPort
    readonly runtime: WaCommsBootstrapRuntimePort
}

export class WaCommsBootstrapCoordinator {
    private readonly logger: Logger
    private readonly auth: WaCommsBootstrapAuthPort
    private readonly runtime: WaCommsBootstrapRuntimePort

    public constructor(options: WaCommsBootstrapCoordinatorOptions) {
        this.logger = options.logger
        this.auth = options.auth
        this.runtime = options.runtime
    }

    public async startCommsWithCredentials(credentials: WaAuthCredentials): Promise<void> {
        this.logger.debug('starting comms with credentials', {
            registered: credentials.meJid !== null && credentials.meJid !== undefined
        })
        const commsConfig = this.auth.buildCommsConfig()
        const comms = new WaComms(commsConfig, this.logger)
        this.runtime.setComms(comms)
        this.runtime.clearMediaConnCache()
        this.runtime.bindComms(comms)

        comms.startComms(async (frame) => this.runtime.onIncomingFrame(frame))
        await comms.waitForConnection(commsConfig.connectTimeoutMs)
        this.logger.info('comms connected')
        comms.startHandlingRequests()
        this.runtime.syncKeepAlive(Boolean(credentials.meJid))

        const serverStaticKey = comms.getServerStaticKey()
        if (!serverStaticKey) {
            this.logger.trace('no server static key available to persist')
        } else {
            await this.auth.persistServerStaticKey(serverStaticKey)
            this.logger.debug('persisted server static key after comms connect')
        }
        this.runtime.startPassiveTasksAfterConnect()
    }
}
