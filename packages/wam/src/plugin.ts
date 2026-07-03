import { defineWaClientPlugin } from 'zapo-js'

import { WaWamCoordinator, type WaWamCoordinatorOptions } from './WaWamCoordinator.js'

export interface WamPluginOptions extends WaWamCoordinatorOptions {}

/**
 * WaClient plugin that emits WhatsApp Web WAM (`w:stats`) telemetry, exposing
 * {@link WaWamCoordinator} at `client.wam`. Sending the telemetry a real WA Web
 * client sends improves parity; batch globals derive from the client's own
 * device identity so they agree with the pairing `ClientPayload`.
 *
 * @example
 * ```ts
 * import { WaClient } from 'zapo-js'
 * import { wamPlugin } from '@zapo-js/wam'
 *
 * const client = new WaClient({
 *   store,
 *   sessionId: 'main',
 *   plugins: [wamPlugin()]
 * })
 *
 * client.wam.commit('UiAction', { uiActionType: 'CHAT_OPEN' })
 * ```
 */
export function wamPlugin(options: WamPluginOptions = {}) {
    return defineWaClientPlugin<'wam', WaWamCoordinator>({
        id: '@zapo-js/wam',
        exposeAs: 'wam',
        setup(ctx) {
            return new WaWamCoordinator(ctx, options)
        },
        async dispose(coordinator) {
            await coordinator.dispose()
        }
    })
}
