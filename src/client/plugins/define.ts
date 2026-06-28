import type { WaClientPluginContext, WaClientPluginDefinition } from '@client/plugins/types'
import type { WaClient } from '@client/WaClient'

interface WaClientBehaviorPluginInput {
    readonly id: string
    readonly setup: (ctx: WaClientPluginContext) => void
    readonly dispose?: (ctx: WaClientPluginContext) => void | Promise<void>
}

interface WaClientExposePluginInput<K extends string, T> {
    readonly id: string
    readonly exposeAs: K
    readonly setup: (ctx: WaClientPluginContext) => T
    readonly dispose?: (instance: T, ctx: WaClientPluginContext) => void | Promise<void>
}

/** Type-safe helper for authoring {@link WaClientPluginDefinition} values. */
export function defineWaClientPlugin(input: WaClientBehaviorPluginInput): WaClientPluginDefinition
export function defineWaClientPlugin<K extends string, T, E = {}>(
    input: WaClientExposePluginInput<K, T> & {
        readonly exposeAs: K extends keyof WaClient ? never : K
    }
): WaClientPluginDefinition & {
    readonly exposeAs: K
    readonly setup: (ctx: WaClientPluginContext) => T
    readonly __pluginEvents?: E
}
export function defineWaClientPlugin(
    input: WaClientBehaviorPluginInput | WaClientExposePluginInput<string, unknown>
): WaClientPluginDefinition {
    if ('exposeAs' in input && input.exposeAs !== undefined) {
        const exposeInput = input
        return {
            id: exposeInput.id,
            exposeAs: exposeInput.exposeAs,
            setup: exposeInput.setup,
            dispose: exposeInput.dispose
                ? (instance, ctx) => exposeInput.dispose!(instance, ctx)
                : undefined
        }
    }
    const behaviorInput = input as WaClientBehaviorPluginInput
    return {
        id: behaviorInput.id,
        setup: behaviorInput.setup,
        dispose: behaviorInput.dispose ? (_instance, ctx) => behaviorInput.dispose!(ctx) : undefined
    }
}
