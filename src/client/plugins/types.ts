import type { WaLowLevelCoordinator } from '@client/coordinators/WaLowLevelCoordinator'
import type { WaClientOptions } from '@client/types'
import type { WaClient } from '@client/WaClient'
import type { WaClientDependencies } from '@client/WaClientFactory'
import type { Logger } from '@infra/log/types'
import type { WaStore } from '@store/types'
import type { BinaryNode } from '@transport/types'

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
    /** Loose so a plugin can emit its own events; consumers see them typed on the client. */
    readonly emit: (event: string | symbol, ...args: unknown[]) => boolean
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

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
    k: infer I
) => void
    ? I
    : never

/** `{ [exposeAs]: setup-return }` for one plugin definition; `{}` (no-op) for behavior plugins. */
type ExposedOf<P> = P extends {
    readonly exposeAs: infer K extends string
    readonly setup: (...args: never[]) => infer T
}
    ? { readonly [Q in K]: T }
    : {}

/**
 * Getters contributed by a tuple of plugin definitions, derived from the values
 * passed to the client (no global augmentation). `[voipPlugin()]` yields
 * `{ readonly voip: WaVoipCoordinator }`.
 */
export type WaClientExposedFromPlugins<P extends readonly unknown[]> = UnionToIntersection<
    ExposedOf<P[number]>
>

/** Event map a plugin contributes, carried as a phantom marker on its definition. */
type EventsOf<P> = P extends { readonly __pluginEvents?: infer E }
    ? unknown extends E
        ? {}
        : E
    : {}

/**
 * Client events contributed by a tuple of plugin definitions, derived from the
 * plugin values (no global augmentation). Threaded into the client's
 * `on`/`once`/`off`/`emit` so a `voip_*` event exists only when voip is installed.
 */
export type WaClientPluginEventsFromPlugins<P extends readonly unknown[]> = UnionToIntersection<
    EventsOf<P[number]>
>
