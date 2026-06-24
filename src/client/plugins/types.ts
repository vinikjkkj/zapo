import type { WaLowLevelCoordinator } from '@client/coordinators/WaLowLevelCoordinator'
import type { WaClientOptions } from '@client/types'
import type { WaClient } from '@client/WaClient'
import type { WaClientDependencies } from '@client/WaClientFactory'
import type { Logger } from '@infra/log/types'
import type { WaStore } from '@store/types'
import type { BinaryNode } from '@transport/types'

/**
 * Augment this interface from plugin packages to expose coordinator getters on
 * {@link WaClient} (e.g. `client.voip`). Only plugins with `exposeAs` create
 * runtime properties – augmentation is type-only until the plugin is registered.
 */
export interface WaClientPluginRegistry {}

/**
 * Host context passed to every {@link WaClientPluginDefinition.setup}. Carries
 * the full {@link WaClientDependencies} graph plus event/handler helpers.
 *
 * @sensitive deps may reach key material through nested coordinators – do not
 * log or persist deps wholesale.
 */
export interface WaClientPluginContext {
    readonly client: WaClient
    readonly options: Readonly<WaClientOptions>
    readonly logger: Logger
    readonly stores: ReturnType<WaStore['session']>
    /**
     * Full coordinator dependency graph. Advanced API for plugin authors –
     * new coordinators may appear in minor releases.
     */
    readonly deps: WaClientDependencies
    readonly emit: WaClient['emit']
    readonly on: WaClient['on']
    readonly off: WaClient['off']
    readonly once: WaClient['once']
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>,
        options?: { readonly useSystemId?: boolean }
    ) => Promise<BinaryNode>
    readonly registerIncomingHandler: WaLowLevelCoordinator['registerIncomingHandler']
    readonly registerIncomingStanzaFilter: WaLowLevelCoordinator['registerIncomingStanzaFilter']
    /** Runs on {@link WaClient.disconnect} after incoming handlers drain. */
    readonly registerDispose: (fn: () => void | Promise<void>) => void
}

/**
 * Runtime plugin registration. Use {@link defineWaClientPlugin} for inference.
 * When `exposeAs` is set, `setup` should return the value exposed at
 * `client[exposeAs]`; otherwise only side effects (handlers, listeners) run.
 */
export interface WaClientPluginDefinition {
    readonly id: string
    readonly exposeAs?: string
    readonly setup: (ctx: WaClientPluginContext) => unknown
    readonly dispose?: (instance: unknown, ctx: WaClientPluginContext) => void | Promise<void>
}

/** @deprecated Use {@link WaClientPluginDefinition} without `exposeAs`. */
export type WaClientBehaviorPluginDefinition = Omit<WaClientPluginDefinition, 'exposeAs'>

/** @deprecated Use {@link WaClientPluginDefinition} with `exposeAs`. */
export type WaClientExposePluginDefinition<
    K extends string = string,
    T = unknown
> = WaClientPluginDefinition & {
    readonly exposeAs: K
    readonly setup: (ctx: WaClientPluginContext) => T
}

export function isWaClientExposePluginDefinition(
    plugin: WaClientPluginDefinition
): plugin is WaClientPluginDefinition & { readonly exposeAs: string } {
    return plugin.exposeAs !== undefined && plugin.exposeAs.length > 0
}
