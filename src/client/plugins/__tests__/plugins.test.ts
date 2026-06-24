import assert from 'node:assert/strict'
import test from 'node:test'

import { defineWaClientPlugin } from '@client/plugins/define'
import { installWaClientPlugins } from '@client/plugins/install'
import type { WaClientPluginContext } from '@client/plugins/types'
import type { WaClientOptions } from '@client/types'
import type { WaClient } from '@client/WaClient'
import { buildWaClientDependencies, resolveWaClientBase } from '@client/WaClientFactory'
import { createNoopLogger } from '@infra/log/types'
import type { BinaryNode } from '@transport/types'

function createMinimalPluginClient(plugins: NonNullable<WaClientOptions['plugins']>): {
    client: WaClient
    deps: ReturnType<typeof buildWaClientDependencies>
} {
    const logger = createNoopLogger()
    const base = resolveWaClientBase(
        {
            store: {
                session: () => ({
                    messages: { clear: async () => undefined },
                    threads: { clear: async () => undefined },
                    contacts: { clear: async () => undefined },
                    appState: { clear: async () => undefined },
                    messageSecret: { clear: async () => undefined },
                    groupMetadata: { clear: async () => undefined },
                    deviceList: { clear: async () => undefined },
                    retry: { clear: async () => undefined },
                    signal: { clear: async () => undefined },
                    preKey: { clear: async () => undefined },
                    session: { clear: async () => undefined },
                    identity: { clear: async () => undefined },
                    senderKey: { clear: async () => undefined },
                    privacyToken: { clear: async () => undefined }
                })
            } as never,
            sessionId: 'plugin-test',
            plugins
        },
        logger
    )
    const runtime = {
        sendNode: async () => undefined,
        query: async (node: BinaryNode) => node,
        queryWithContext: async (_context: string, node: BinaryNode) => node,
        syncAppState: async () => undefined,
        syncAppStateWithOptions: async () => ({ collections: [] }),
        emitEvent: () => undefined,
        handleIncomingMessageEvent: async () => undefined,
        handleError: () => undefined,
        handleIncomingFrame: async () => undefined,
        clearStoredState: async () => undefined,
        resumeIncomingEvents: () => undefined,
        subscribeProtocolMessage: () => () => undefined,
        persistContact: async () => undefined
    }
    const deps = buildWaClientDependencies({ base, runtime })
    const client = {
        emit() {
            return true
        },
        on() {
            return client
        },
        off() {
            return client
        },
        once() {
            return client
        }
    } as unknown as WaClient
    installWaClientPlugins(
        client,
        {
            options: base.options,
            logger,
            stores: base.sessionStore,
            deps,
            queryWithContext: runtime.queryWithContext
        },
        plugins
    )
    return { client, deps }
}

test('behavior plugin registers handlers without exposing client property', () => {
    let handlerCalls = 0
    const plugin = defineWaClientPlugin({
        id: 'counter',
        setup(ctx) {
            ctx.registerIncomingHandler({
                tag: 'message',
                handler: async () => {
                    handlerCalls += 1
                    return true
                }
            })
        }
    })

    const { client } = createMinimalPluginClient([plugin])
    assert.equal('counter' in client, false)
    assert.equal(handlerCalls, 0)
})

test('expose plugin defines enumerable getter on client', () => {
    const api = { value: 42 }
    const plugin = defineWaClientPlugin({
        id: 'api',
        exposeAs: 'api',
        setup: () => api
    })

    const { client } = createMinimalPluginClient([plugin])
    assert.equal((client as unknown as { api: typeof api }).api, api)
    assert.equal(Object.prototype.propertyIsEnumerable.call(client, 'api'), true)
})

test('install rejects duplicate plugin id', () => {
    const plugin = defineWaClientPlugin({
        id: 'dup',
        setup: () => undefined
    })
    assert.throws(
        () => createMinimalPluginClient([plugin, plugin]),
        /duplicate wa client plugin id: dup/
    )
})

test('install rejects duplicate exposeAs', () => {
    const a = defineWaClientPlugin({
        id: 'a',
        exposeAs: 'same',
        setup: () => ({})
    })
    const b = defineWaClientPlugin({
        id: 'b',
        exposeAs: 'same',
        setup: () => ({})
    })
    assert.throws(
        () => createMinimalPluginClient([a, b]),
        /duplicate wa client plugin exposeAs: same/
    )
})

test('plugin dispose runs through install dispose callback', async () => {
    let disposed = false
    const plugin = defineWaClientPlugin({
        id: 'dispose-me',
        setup(ctx) {
            ctx.registerDispose(async () => {
                disposed = true
            })
        },
        dispose: () => {
            disposed = true
        }
    })

    const logger = createNoopLogger()
    const disposeAll = installWaClientPlugins(
        { emit: () => true, on: () => ({}), off: () => ({}), once: () => ({}) } as never,
        {
            options: { store: {} as never, sessionId: 'x' },
            logger,
            stores: {} as never,
            deps: {
                lowLevelCoordinator: {
                    registerIncomingHandler: () => () => undefined,
                    registerIncomingStanzaFilter: () => () => undefined
                }
            } as never,
            queryWithContext: async () => ({ tag: 'iq', attrs: {} })
        },
        [plugin]
    )

    assert.equal(disposed, false)
    await disposeAll()
    assert.equal(disposed, true)
})

test('plugin ctx exposes deps and registerIncomingHandler delegate', () => {
    let registeredTag: string | undefined
    const plugin = defineWaClientPlugin({
        id: 'ctx-check',
        setup(ctx: WaClientPluginContext) {
            assert.ok(ctx.deps)
            assert.ok(ctx.logger)
            assert.ok(ctx.options)
            assert.ok(ctx.stores)
            ctx.registerIncomingHandler({
                tag: 'notification',
                handler: async () => true
            })
            registeredTag = 'notification'
        }
    })

    createMinimalPluginClient([plugin])
    assert.equal(registeredTag, 'notification')
})
