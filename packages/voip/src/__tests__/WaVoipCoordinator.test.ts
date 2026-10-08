import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger, type WaClientPluginContext } from 'zapo-js'
import { WA_MESSAGE_TAGS } from 'zapo-js/protocol'

import { WaVoipCoordinator, type WaVoipCoordinatorOptions } from '../WaVoipCoordinator.js'

function mockCtx(isMobilePrimary: () => boolean = () => false) {
    const handlers: Array<{ tag: string }> = []
    const emitted: Array<[string, unknown[]]> = []
    const ctx = {
        logger: createNoopLogger(),
        deps: { isMobilePrimary } as never,
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

/**
 * Whether the media of a call placed now dials each relay on the port its `<te2>` advertises,
 * read off the plane the call's media link is built with.
 */
function dialsAdvertisedPort(coordinator: WaVoipCoordinator): boolean {
    const manager = (
        coordinator as unknown as {
            manager: {
                createMediaLink(callId: string, logger: unknown, events: unknown): unknown
            }
        }
    ).manager
    const link = manager.createMediaLink('call-id', createNoopLogger(), {}) as {
        plane: { useOriginalRelayPort: boolean }
        stop(): void
    }
    link.stop()
    return link.plane.useOriginalRelayPort
}

function dialsAdvertisedPortFor(mobilePrimary: boolean, options?: WaVoipCoordinatorOptions) {
    const coordinator = new WaVoipCoordinator(mockCtx(() => mobilePrimary).ctx, options)
    const dials = dialsAdvertisedPort(coordinator)
    coordinator.dispose()
    return dials
}

/** Measured live: a companion's relay legs open only on the advertised port, never on 3480. */
test('a companion dials the advertised relay port by default', () => {
    assert.equal(dialsAdvertisedPortFor(false), true)
})

/** Measured live: a mobile primary's relay legs open only on 3480, never on the advertised port. */
test('a mobile primary dials the web client relay port by default', () => {
    assert.equal(dialsAdvertisedPortFor(true), false)
})

test('an explicit useOriginalRelayPort wins over the kind of session', () => {
    assert.equal(dialsAdvertisedPortFor(false, { useOriginalRelayPort: false }), false)
    assert.equal(dialsAdvertisedPortFor(true, { useOriginalRelayPort: true }), true)
})

/**
 * Plugins are set up when the client is built, and a mobile identity that only comes from
 * stored credentials is known once they load on connect: the kind is read per call.
 */
test('a primary known only from stored credentials loaded after setup dials 3480', () => {
    let credentialsLoaded = false
    const coordinator = new WaVoipCoordinator(mockCtx(() => credentialsLoaded).ctx)

    credentialsLoaded = true
    const dials = dialsAdvertisedPort(coordinator)
    coordinator.dispose()

    assert.equal(dials, false)
})
