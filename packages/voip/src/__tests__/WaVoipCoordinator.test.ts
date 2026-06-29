import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger, type WaClientPluginContext } from 'zapo-js'
import { WA_MESSAGE_TAGS } from 'zapo-js/protocol'

import { WaVoipCoordinator } from '../WaVoipCoordinator.js'

function mockCtx() {
    const handlers: Array<{ tag: string }> = []
    const emitted: Array<[string, unknown[]]> = []
    const ctx = {
        logger: createNoopLogger(),
        deps: {} as never,
        stores: {} as never,
        registerIncomingHandler: (handler: { tag: string }) => {
            handlers.push(handler)
            return () => {
                handlers.splice(handlers.indexOf(handler), 1)
            }
        },
        emit: (event: string, ...args: unknown[]) => {
            emitted.push([event, args])
        }
    } as unknown as WaClientPluginContext
    return { ctx, handlers, emitted }
}

test('WaVoipCoordinator registers call, ack and receipt incoming handlers', () => {
    const { ctx, handlers } = mockCtx()
    const coordinator = new WaVoipCoordinator(ctx)

    const tags = handlers.map((handler) => handler.tag)
    assert.equal(handlers.length, 3)
    assert.ok(tags.includes('call'))
    assert.ok(tags.includes(WA_MESSAGE_TAGS.ACK))
    assert.ok(tags.includes(WA_MESSAGE_TAGS.RECEIPT))

    coordinator.dispose()
    assert.equal(handlers.length, 0)
})

test('WaVoipCoordinator re-emits manager events on the host client', () => {
    const { ctx, emitted } = mockCtx()
    const coordinator = new WaVoipCoordinator(ctx)
    assert.deepEqual(coordinator.getCalls(), [])

    const manager = (
        coordinator as unknown as { manager: { emit: (event: string, ...args: unknown[]) => void } }
    ).manager
    const error = new Error('boom')
    manager.emit('call_error', error)

    const forwarded = emitted.find(([event]) => event === 'voip_call_error')
    assert.ok(forwarded)
    assert.equal(forwarded[1][0], error)

    coordinator.dispose()
})
