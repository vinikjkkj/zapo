import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'

import { createNoopLogger, type WaClientPluginContext } from 'zapo-js'
import { WA_MESSAGE_TAGS } from 'zapo-js/protocol'

import type { WaCallReaction } from '@zapo-js/voip-media'

import type { CallInfo } from '../call/call-state.js'
import type { VoipEvents } from '../events.js'
import { WaVoipCoordinator, type WaVoipCoordinatorOptions } from '../WaVoipCoordinator.js'

function mockCtx(isMobilePrimary: () => boolean = () => false) {
    const handlers: Array<{ tag: string }> = []
    const emitted: Array<[string, unknown[]]> = []
    const client = new EventEmitter()
    const ctx = {
        client,
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
    return { ctx, handlers, emitted, client }
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

test('participant events reach the client with the device that sent them', () => {
    const { ctx, emitted } = mockCtx()
    const coordinator = new WaVoipCoordinator(ctx)
    const manager = (
        coordinator as unknown as { manager: { emit: (event: string, ...args: unknown[]) => void } }
    ).manager
    const call = { callId: 'CID' }
    const pcm = new Float32Array(4)
    const device = '184478207058035:9@lid'

    manager.emit('call_peer_mute', call, true, device)
    manager.emit('call_peer_mute', call, false)
    manager.emit('call_mute_requested', call, device, '1')
    manager.emit('call_participant_media', call, device, false)
    manager.emit('call_participant_audio', call, device, pcm)
    manager.emit('call_video_upgraded', call, device)
    manager.emit('call_reaction', call, { transactionId: '1', reaction: '👍' }, device)
    manager.emit('call_peer_video_state', call, { state: 6 }, device)
    manager.emit('call_screen_share', call, { state: 1 }, device)
    manager.emit('call_inbound_video', call, { ssrc: 1 }, device)
    manager.emit('call_inbound_video_rtp', call, { ssrc: 1 }, device)

    const payloadOf = (event: string, index = 0) =>
        emitted.filter(([name]) => name === event)[index]?.[1][0]
    assert.deepEqual(payloadOf('voip_call_peer_mute'), {
        call,
        muted: true,
        participantJid: device
    })
    assert.deepEqual(payloadOf('voip_call_peer_mute', 1), {
        call,
        muted: false,
        participantJid: undefined
    })
    assert.deepEqual(payloadOf('voip_call_mute_requested'), {
        call,
        participantJid: device,
        requestState: '1'
    })
    assert.deepEqual(payloadOf('voip_call_participant_media'), {
        call,
        participantJid: device,
        receiving: false
    })
    assert.deepEqual(payloadOf('voip_call_participant_audio'), {
        call,
        participantJid: device,
        pcm
    })
    assert.deepEqual(payloadOf('voip_call_video_upgraded'), { call, participantJid: device })
    for (const event of [
        'voip_call_reaction',
        'voip_call_peer_video_state',
        'voip_call_screen_share',
        'voip_call_inbound_video',
        'voip_call_inbound_video_rtp'
    ]) {
        assert.equal(
            (payloadOf(event) as { participantJid?: string }).participantJid,
            device,
            event
        )
    }

    coordinator.dispose()
})

test('inbound audio is forwarded only while the client listens, including a late listener', () => {
    const { ctx, emitted, client } = mockCtx()
    const coordinator = new WaVoipCoordinator(ctx)
    const manager = (coordinator as unknown as { manager: EventEmitter }).manager
    const call = { callId: 'CID' }
    const inboundAudio = () => emitted.filter(([event]) => event === 'voip_call_inbound_audio')

    assert.equal(manager.listenerCount('call_inbound_audio'), 0)

    const listener = () => undefined
    client.on('voip_call_inbound_audio', listener)
    client.once('voip_call_inbound_audio', listener)
    assert.equal(manager.listenerCount('call_inbound_audio'), 1)
    manager.emit('call_inbound_audio', call, new Float32Array(2))
    assert.equal(inboundAudio().length, 1)

    client.off('voip_call_inbound_audio', listener)
    assert.equal(manager.listenerCount('call_inbound_audio'), 1)
    client.removeAllListeners('voip_call_inbound_audio')
    assert.equal(manager.listenerCount('call_inbound_audio'), 0)
    manager.emit('call_inbound_audio', call, new Float32Array(2))
    assert.equal(inboundAudio().length, 1)

    client.on('voip_call_inbound_audio', listener)
    coordinator.dispose()
    assert.equal(manager.listenerCount('call_inbound_audio'), 0)
    assert.equal(client.listenerCount('newListener'), 0)
    assert.equal(client.listenerCount('removeListener'), 0)
})

test('a listener written before participantJid still fits', () => {
    const { ctx } = mockCtx()
    const coordinator = new WaVoipCoordinator(ctx)
    const oldMute: (call: CallInfo, muted: boolean) => void = () => undefined
    const oldReaction: (call: CallInfo, reaction: WaCallReaction) => void = () => undefined
    const oldVoipMute: VoipEvents['voip_call_peer_mute'] = ({ call, muted }) => void [call, muted]

    coordinator.on('call_peer_mute', oldMute).on('call_reaction', oldReaction)
    assert.equal(typeof oldVoipMute, 'function')

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
