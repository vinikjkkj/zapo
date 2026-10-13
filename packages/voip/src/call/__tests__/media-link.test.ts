import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import type { WaCallMediaMessage, WaCallReaction } from '@zapo-js/voip-media'

import {
    toCompanionModelSource,
    type WaCallMediaLinkEvents,
    WaRemoteCallMedia
} from '../media-link.js'

test('Companion weights given as bytes reach the media as they are', () => {
    const bytes = new Uint8Array([1, 2, 3])
    assert.equal(toCompanionModelSource(bytes), bytes)
    assert.equal(toCompanionModelSource(undefined), undefined)
})

test('a Companion weights path is read once, on the first call that asks', async () => {
    const source = toCompanionModelSource(__filename)
    assert.equal(typeof source, 'function')
    const load = source as () => Promise<Uint8Array | ArrayBuffer>

    const first = await load()
    const second = await load()

    assert.deepEqual(new Uint8Array(first), new Uint8Array(await readFile(__filename)))
    assert.equal(first, second, 'every call shares the one read')
})

test('a Companion weights path that cannot be read rejects the load, not the call', async () => {
    const load = toCompanionModelSource('Z:/no/such/mlow_companion_v1.pte') as () => Promise<
        Uint8Array | ArrayBuffer
    >

    await assert.rejects(load())
})

const CALL_ID = '006AFEADB13F4EDFE9D8BA599B10EA96'

const GROUP_SECTION = {
    senders: [
        {
            id: 'sender-a',
            audio: 11,
            streams: [11, 13, 14],
            recv: { masterKey: new Uint8Array(16), masterSalt: new Uint8Array(14) }
        }
    ]
}

interface LinkRecord {
    readonly events: WaCallMediaLinkEvents
    readonly features: (readonly string[])[]
    readonly errors: Error[]
    readonly plans: WaCallMediaMessage[]
    active: number
}

function recordLinkEvents(): LinkRecord {
    const record: LinkRecord = {
        features: [],
        errors: [],
        plans: [],
        active: 0,
        events: {
            onActive: () => {
                record.active++
            },
            onRelayLost: () => {},
            onRelayAnswered: () => {},
            onReaction: () => {},
            onInboundAudio: () => {},
            onInboundVideoRtp: () => {},
            onInboundVideo: () => {},
            onOutboundAudioFinished: () => {},
            onPlan: (message) => {
                record.plans.push(message)
            },
            onHostFeatures: (features) => {
                record.features.push(features)
            },
            onError: (error) => {
                record.errors.push(error)
            }
        }
    }
    return record
}

test('remote media records the features its host announces and nothing else', () => {
    const record = recordLinkEvents()
    const link = new WaRemoteCallMedia(CALL_ID, record.events)

    link.handleEvent({ type: 'host', features: ['group/1', 'raw-udp'] })

    assert.deepEqual(record.features, [['group/1', 'raw-udp']])
    assert.equal(record.active, 0)
    assert.deepEqual(record.plans, [])
})

test('a group plan on a host that announced both features raises nothing', async () => {
    const record = recordLinkEvents()
    const link = new WaRemoteCallMedia(CALL_ID, record.events)

    link.handleEvent({ type: 'host', features: ['group/1', 'raw-udp'] })
    await link.apply({ group: GROUP_SECTION })

    assert.deepEqual(record.errors, [])
    assert.equal(record.plans.length, 1)
})

test('a group plan on a host without the group feature is reported once', async () => {
    const record = recordLinkEvents()
    const link = new WaRemoteCallMedia(CALL_ID, record.events)

    link.handleEvent({ type: 'host', features: ['raw-udp'] })
    await link.apply({ group: GROUP_SECTION })
    await link.apply({ group: GROUP_SECTION })

    assert.equal(record.errors.length, 1)
    assert.match(record.errors[0].message, /group\/1/)
    assert.equal(record.plans.length, 2, 'the plan still goes out')
})

/** An older host never announces: its first other event is what shows it. */
test('a host older than the announcement is caught by its first other event', async () => {
    const record = recordLinkEvents()
    const link = new WaRemoteCallMedia(CALL_ID, record.events)
    await link.apply({ group: GROUP_SECTION })
    assert.equal(record.errors.length, 0, 'nothing is known of the host yet')

    link.handleEvent({ type: 'active' })
    link.handleEvent({ type: 'relay_lost', reason: 'closed' })

    assert.deepEqual(record.features, [[]])
    assert.equal(record.errors.length, 1)
    assert.match(record.errors[0].message, /group\/1, raw-udp/)
    assert.equal(record.active, 1)
})

test('a 1:1 plan on an older host raises nothing', async () => {
    const record = recordLinkEvents()
    const link = new WaRemoteCallMedia(CALL_ID, record.events)

    await link.apply({ mediaType: 'audio', group: null })
    link.handleEvent({ type: 'active' })

    assert.deepEqual(record.errors, [])
})

test('remote media hands over the sender of a reaction and the media of each sender', () => {
    const reactions: [string, string | undefined][] = []
    const media: [string, boolean][] = []
    const record = recordLinkEvents()
    const link = new WaRemoteCallMedia(CALL_ID, {
        ...record.events,
        onReaction: (reaction, senderId) => reactions.push([reaction.reaction, senderId]),
        onSenderMedia: (senderId, receiving) => media.push([senderId, receiving])
    })

    link.handleEvent({ type: 'host', features: ['group/1', 'raw-udp', 'group-attribution/1'] })
    link.handleEvent({
        type: 'reaction',
        reaction: { transactionId: 1n, reaction: '👍' },
        senderId: 'a'
    })
    link.handleEvent({ type: 'reaction', reaction: { transactionId: 2n, reaction: '🔥' } })
    link.handleEvent({ type: 'sender_media', senderId: 'a', receiving: true })

    assert.deepEqual(reactions, [
        ['👍', 'a'],
        ['🔥', undefined]
    ])
    assert.deepEqual(media, [['a', true]])
})

/** A session written before the sender existed still builds its events. */
test('link events with the reaction listener of old still type-check', () => {
    const record = recordLinkEvents()
    const reactions: string[] = []
    const events: WaCallMediaLinkEvents = {
        ...record.events,
        onReaction: (reaction: WaCallReaction) => {
            reactions.push(reaction.reaction)
        }
    }
    const link = new WaRemoteCallMedia(CALL_ID, events)

    link.handleEvent({
        type: 'reaction',
        reaction: { transactionId: 1n, reaction: '👍' },
        senderId: 'a'
    })

    assert.deepEqual(reactions, ['👍'])
})
