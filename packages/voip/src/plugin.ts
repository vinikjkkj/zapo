import { defineWaClientPlugin } from 'zapo-js'

import type { VoipEvents } from './events.js'
import { WaVoipCoordinator, type WaVoipCoordinatorOptions } from './WaVoipCoordinator.js'

export interface VoipPluginOptions extends WaVoipCoordinatorOptions {}

/**
 * WaClient plugin that exposes {@link WaVoipCoordinator} at `client.voip`.
 *
 * @example
 * ```ts
 * import { WaClient } from 'zapo-js'
 * import { voipPlugin } from '@zapo-js/voip'
 *
 * const client = new WaClient({
 *   store,
 *   sessionId: 'main',
 *   plugins: [voipPlugin({ maxConcurrentCalls: 2 })]
 * })
 *
 * client.on('voip_call_incoming', (call) => {
 *   console.log('incoming', call.callId)
 * })
 * ```
 */
export function voipPlugin(options: VoipPluginOptions = {}) {
    return defineWaClientPlugin<'voip', WaVoipCoordinator, VoipEvents>({
        id: '@zapo-js/voip',
        exposeAs: 'voip',
        setup(ctx) {
            return new WaVoipCoordinator(ctx, options)
        },
        dispose(coordinator) {
            coordinator.dispose()
        }
    })
}
