import assert from 'node:assert/strict'
import test from 'node:test'

import { createDeviceFanoutResolver } from '@client/messaging/fanout'
import { createAppStateSyncKeyProtocol } from '@client/messaging/key-protocol'
import { createGroupParticipantsCache } from '@client/messaging/participants'
import type { WaGroupEvent, WaGroupEventAction } from '@client/types'
import type { Logger } from '@infra/log/types'
import { WaParticipantsMemoryStore } from '@store/providers/memory/participants.store'

function createLogger(): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
    }
}

function createGroupEvent(input: {
    readonly action: WaGroupEventAction
    readonly groupJid?: string
    readonly contextGroupJid?: string
    readonly authorJid?: string
    readonly participants?: readonly string[]
}): WaGroupEvent {
    return {
        rawNode: {
            tag: 'notification',
            attrs: {}
        },
        rawActionNode: {
            tag: input.action,
            attrs: {}
        },
        action: input.action,
        groupJid: input.groupJid,
        contextGroupJid: input.contextGroupJid,
        authorJid: input.authorJid,
        participants: input.participants?.map((jid) => ({ jid }))
    }
}

test('device fanout resolver picks meLid only when recipient is lid', () => {
    const resolver = createDeviceFanoutResolver({
        signalDeviceSync: {} as never,
        getCurrentMeJid: () => '551100000000:1@s.whatsapp.net',
        getCurrentMeLid: () => '551100000000:1@lid',
        logger: createLogger()
    })

    assert.equal(
        resolver.resolveSelfDeviceJidForRecipient(
            '551199999999:2@lid',
            '551100000000:1@s.whatsapp.net',
            '551100000000:1@lid'
        ),
        '551100000000:1@lid'
    )
    assert.equal(
        resolver.resolveSelfDeviceJidForRecipient(
            '551199999999:2@s.whatsapp.net',
            '551100000000:1@s.whatsapp.net',
            '551100000000:1@lid'
        ),
        '551100000000:1@s.whatsapp.net'
    )
})

test('group participants cache mutates membership from events', async () => {
    const participantsStore = new WaParticipantsMemoryStore(60_000)
    try {
        const cache = createGroupParticipantsCache({
            participantsStore,
            queryGroupParticipantJids: async () => [],
            logger: createLogger()
        })

        await cache.mutateFromGroupEvent(
            createGroupEvent({
                action: 'create',
                groupJid: '120@g.us',
                participants: ['551100000000@s.whatsapp.net', '551199999999:3@s.whatsapp.net']
            })
        )
        await cache.mutateFromGroupEvent(
            createGroupEvent({
                action: 'add',
                groupJid: '120@g.us',
                participants: ['552200000000@s.whatsapp.net']
            })
        )
        await cache.mutateFromGroupEvent(
            createGroupEvent({
                action: 'remove',
                groupJid: '120@g.us',
                participants: ['551199999999@s.whatsapp.net']
            })
        )

        const cached = await participantsStore.getGroupParticipants('120@g.us')
        assert.deepEqual(cached?.participants, [
            '551100000000@s.whatsapp.net',
            '552200000000@s.whatsapp.net'
        ])
    } finally {
        await participantsStore.destroy()
    }
})

test('app-state sync key protocol requests keys from peer devices and dedupes key ids', async () => {
    const published: { readonly to: string; readonly type?: string }[] = []

    const protocol = createAppStateSyncKeyProtocol({
        publishSignalMessage: async (input) => {
            published.push({
                to: input.to,
                type: input.type
            })
            return {
                id: 'msg-id',
                attempts: 1,
                ackNode: {
                    tag: 'ack',
                    attrs: {}
                },
                ack: {
                    refreshLid: false
                }
            }
        },
        fanoutResolver: {
            resolveOwnPeerDeviceJids: async () => [
                '551100000000:2@s.whatsapp.net',
                '551100000000:3@s.whatsapp.net'
            ]
        } as never,
        getCurrentMeJid: () => '551100000000:1@s.whatsapp.net',
        getCurrentMeLid: () => null,
        logger: createLogger()
    })

    const peerDevices = await protocol.requestKeys([
        new Uint8Array([1, 2, 3]),
        new Uint8Array([1, 2, 3]),
        new Uint8Array([])
    ])

    assert.deepEqual(peerDevices, [
        '551100000000:2@s.whatsapp.net',
        '551100000000:3@s.whatsapp.net'
    ])
    assert.equal(published.length, 2)
    assert.ok(published.every((entry) => entry.type === 'protocol'))
})
