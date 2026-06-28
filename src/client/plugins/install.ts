import {
    isWaClientExposePluginDefinition,
    type WaClientPluginContext,
    type WaClientPluginDefinition
} from '@client/plugins/types'
import type { WaClientOptions } from '@client/types'
import type { WaClient } from '@client/WaClient'
import type { WaClientDependencies } from '@client/WaClientFactory'
import type { Logger } from '@infra/log/types'
import type { WaStore } from '@store/types'
import { toError } from '@util/primitives'

export interface WaClientPluginInstallInput {
    readonly options: Readonly<WaClientOptions>
    readonly logger: Logger
    readonly stores: ReturnType<WaStore['session']>
    readonly deps: WaClientDependencies
    readonly queryWithContext: WaClientPluginContext['queryWithContext']
}

/**
 * Installs {@link WaClientOptions.plugins} on `client`. Returns a dispose
 * function invoked by {@link WaClient.disconnect}.
 */
export function installWaClientPlugins(
    client: WaClient,
    input: WaClientPluginInstallInput,
    plugins: readonly WaClientPluginDefinition[]
): () => Promise<void> {
    const seenIds = new Set<string>()
    const seenExposeAs = new Set<string>()
    const disposeCallbacks: Array<() => void | Promise<void>> = []

    const registerDispose = (fn: () => void | Promise<void>): void => {
        disposeCallbacks[disposeCallbacks.length] = fn
    }

    const baseCtx: WaClientPluginContext = {
        client,
        options: input.options,
        logger: input.logger,
        stores: input.stores,
        deps: input.deps,
        emit: client.emit.bind(client) as unknown as WaClientPluginContext['emit'],
        on: client.on.bind(client),
        off: client.off.bind(client),
        once: client.once.bind(client),
        queryWithContext: input.queryWithContext,
        registerIncomingHandler: (registration) =>
            input.deps.lowLevelCoordinator.registerIncomingHandler(registration),
        registerIncomingStanzaFilter: (filter) =>
            input.deps.lowLevelCoordinator.registerIncomingStanzaFilter(filter),
        registerDispose
    }

    for (let index = 0; index < plugins.length; index += 1) {
        const plugin = plugins[index]
        if (seenIds.has(plugin.id)) {
            throw new Error(`duplicate wa client plugin id: ${plugin.id}`)
        }
        seenIds.add(plugin.id)

        const pluginCtx: WaClientPluginContext = {
            ...baseCtx,
            logger: input.logger.child({ plugin: plugin.id })
        }

        if (isWaClientExposePluginDefinition(plugin)) {
            if (seenExposeAs.has(plugin.exposeAs)) {
                throw new Error(`duplicate wa client plugin exposeAs: ${plugin.exposeAs}`)
            }
            seenExposeAs.add(plugin.exposeAs)

            if (plugin.exposeAs in client) {
                throw new Error(
                    `wa client plugin exposeAs "${plugin.exposeAs}" collides with a reserved client member`
                )
            }

            const instance = plugin.setup(pluginCtx)
            Object.defineProperty(client, plugin.exposeAs, {
                get: () => instance,
                enumerable: true,
                configurable: false
            })
            if (plugin.dispose) {
                const dispose = plugin.dispose
                registerDispose(() => dispose(instance, pluginCtx))
            }
            pluginCtx.logger.debug('wa client plugin installed', { exposeAs: plugin.exposeAs })
        } else {
            plugin.setup(pluginCtx)
            if (plugin.dispose) {
                const dispose = plugin.dispose
                registerDispose(() => dispose(undefined, pluginCtx))
            }
            pluginCtx.logger.debug('wa client plugin installed')
        }
    }

    return async () => {
        for (let index = disposeCallbacks.length - 1; index >= 0; index -= 1) {
            try {
                await disposeCallbacks[index]()
            } catch (error) {
                input.logger.warn('wa client plugin dispose failed', {
                    message: toError(error).message
                })
            }
        }
    }
}
