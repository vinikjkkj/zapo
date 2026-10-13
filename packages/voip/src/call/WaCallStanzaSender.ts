import type { Logger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'
import { toError } from 'zapo-js/util'

import type { WaVoipDeps } from '../types.js'

import type { CallInfo } from './call-state.js'

export type SendLogLevel = 'trace' | 'warn' | 'error'

/** Sends one call's stanzas, logging a failure under its call id. */
export class WaCallStanzaSender {
    private readonly deps: Pick<WaVoipDeps, 'lowLevelCoordinator'>
    private readonly logger: Logger
    private readonly info: Pick<CallInfo, 'callId'>

    constructor(
        deps: Pick<WaVoipDeps, 'lowLevelCoordinator'>,
        logger: Logger,
        info: Pick<CallInfo, 'callId'>
    ) {
        this.deps = deps
        this.logger = logger
        this.info = info
    }

    /** Sends a stanza, the failure left to the caller. */
    send(node: BinaryNode): Promise<void> {
        return this.deps.lowLevelCoordinator.sendNode(node)
    }

    /** Sends a stanza built in the same guard, logging a failure; `false` when it failed. */
    async sendLogged(
        build: () => BinaryNode,
        failure: string,
        level: SendLogLevel = 'error',
        context?: Record<string, unknown>
    ): Promise<boolean> {
        try {
            await this.deps.lowLevelCoordinator.sendNode(build())
            return true
        } catch (err) {
            this.logger[level](failure, {
                callId: this.info.callId,
                ...context,
                message: toError(err).message
            })
            return false
        }
    }

    /** Sends a stanza nobody waits on; a failure is only logged. */
    sendDetached(
        node: BinaryNode,
        failure: string,
        level: SendLogLevel = 'warn',
        context?: Record<string, unknown>
    ): void {
        void this.sendLogged(() => node, failure, level, context)
    }
}
