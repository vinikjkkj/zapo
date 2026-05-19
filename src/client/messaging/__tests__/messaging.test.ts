import assert from 'node:assert/strict'
import test from 'node:test'

import { createDeviceFanoutResolver } from '@client/messaging/fanout'
import { createGroupMetadataCache } from '@client/messaging/group-metadata'
import { createAppStateSyncKeyProtocol } from '@client/messaging/key-protocol'
import type { WaGroupEvent, WaGroupEventAction } from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import { proto } from '@proto'
import { WaGroupMetadataMemoryStore } from '@store/memory/group-metadata.store'

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
        getCurrentCredentials: () =>
            ({
                meJid: '551100000000:1@s.whatsapp.net',
                meLid: '551100000000:1@lid'
            }) as never,
        logger: createNoopLogger()
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

test('device fanout resolver keeps hosted devices in direct fanout', async () => {
    const resolver = createDeviceFanoutResolver({
        signalDeviceSync: {
            syncDeviceList: async () => [
                {
                    jid: '6116570308623@lid',
                    deviceJids: ['6116570308623:1@lid', '6116570308623:99@hosted.lid']
                },
                {
                    jid: '551100000000@lid',
                    deviceJids: ['551100000000:1@lid', '551100000000:2@lid']
                }
            ]
        } as never,
        getCurrentCredentials: () =>
            ({
                meJid: '551100000000:1@s.whatsapp.net',
                meLid: '551100000000:1@lid'
            }) as never,
        logger: createNoopLogger()
    })

    const fanout = await resolver.resolveDirectFanoutDeviceJids(
        '6116570308623:1@lid',
        '551100000000:1@lid'
    )
    assert.deepEqual(fanout, [
        '6116570308623:1@lid',
        '6116570308623:99@hosted.lid',
        '551100000000:2@lid'
    ])
})

test('device fanout resolver excludes hosted devices in group fanout', async () => {
    const resolver = createDeviceFanoutResolver({
        signalDeviceSync: {
            syncDeviceList: async () => [
                {
                    jid: '6116570308623@lid',
                    deviceJids: ['6116570308623:1@lid', '6116570308623:99@hosted.lid']
                },
                {
                    jid: '551188888888@s.whatsapp.net',
                    deviceJids: ['551188888888@s.whatsapp.net', '551188888888:99@hosted']
                }
            ]
        } as never,
        getCurrentCredentials: () => ({ meJid: '551100000000:1@s.whatsapp.net' }) as never,
        logger: createNoopLogger()
    })

    const fanout = await resolver.resolveGroupParticipantDeviceJids([
        '6116570308623@lid',
        '551188888888@s.whatsapp.net'
    ])
    assert.deepEqual(fanout, ['6116570308623:1@lid', '551188888888@s.whatsapp.net'])
})

test('group metadata cache mutates membership from events', async () => {
    const groupMetadataStore = new WaGroupMetadataMemoryStore(60_000)
    try {
        const cache = createGroupMetadataCache({
            groupMetadataStore,
            queryGroupMetadata: async () => ({ participants: [] }),
            logger: createNoopLogger()
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

        const cached = await groupMetadataStore.getGroupMetadata('120@g.us')
        assert.deepEqual(cached?.participants, [
            '551100000000@s.whatsapp.net',
            '552200000000@s.whatsapp.net'
        ])
    } finally {
        await groupMetadataStore.destroy()
    }
})

test('group metadata cache stores and updates ephemeral from events', async () => {
    const groupMetadataStore = new WaGroupMetadataMemoryStore(60_000)
    try {
        const cache = createGroupMetadataCache({
            groupMetadataStore,
            queryGroupMetadata: async () => ({
                participants: ['551100000000@s.whatsapp.net'],
                ephemeral: 86_400
            }),
            logger: createNoopLogger()
        })

        const initial = await cache.resolveParticipantUsers('120@g.us')
        assert.deepEqual(initial, ['551100000000@s.whatsapp.net'])
        assert.equal(await cache.getEphemeral('120@g.us'), 86_400)

        await cache.mutateFromGroupEvent({
            rawNode: { tag: 'notification', attrs: {} },
            rawActionNode: { tag: 'ephemeral', attrs: {} },
            action: 'ephemeral',
            groupJid: '120@g.us',
            expirationSeconds: 7_776_000
        } as WaGroupEvent)

        assert.equal(await cache.getEphemeral('120@g.us'), 7_776_000)

        await cache.mutateFromGroupEvent({
            rawNode: { tag: 'notification', attrs: {} },
            rawActionNode: { tag: 'ephemeral', attrs: {} },
            action: 'ephemeral',
            groupJid: '120@g.us',
            expirationSeconds: 0
        } as WaGroupEvent)

        assert.equal(await cache.getEphemeral('120@g.us'), 0)
    } finally {
        await groupMetadataStore.destroy()
    }
})

test('group metadata cache ignores ephemeral events for uncached groups', async () => {
    const groupMetadataStore = new WaGroupMetadataMemoryStore(60_000)
    try {
        const cache = createGroupMetadataCache({
            groupMetadataStore,
            queryGroupMetadata: async () => ({ participants: [] }),
            logger: createNoopLogger()
        })

        await cache.mutateFromGroupEvent({
            rawNode: { tag: 'notification', attrs: {} },
            rawActionNode: { tag: 'ephemeral', attrs: {} },
            action: 'ephemeral',
            groupJid: '120@g.us',
            expirationSeconds: 86_400
        } as WaGroupEvent)

        assert.equal(await cache.getEphemeral('120@g.us'), null)
        assert.equal(await groupMetadataStore.getGroupMetadata('120@g.us'), null)
    } finally {
        await groupMetadataStore.destroy()
    }
})

test('group metadata cache resolveEphemeral refreshes on cold cache', async () => {
    const groupMetadataStore = new WaGroupMetadataMemoryStore(60_000)
    let queryCalls = 0
    try {
        const cache = createGroupMetadataCache({
            groupMetadataStore,
            queryGroupMetadata: async () => {
                queryCalls += 1
                return {
                    participants: ['551100000000@s.whatsapp.net'],
                    ephemeral: 86_400
                }
            },
            logger: createNoopLogger()
        })

        assert.equal(await cache.getEphemeral('120@g.us'), null)
        assert.equal(queryCalls, 0)

        assert.equal(await cache.resolveEphemeral('120@g.us'), 86_400)
        assert.equal(queryCalls, 1)

        assert.equal(await cache.resolveEphemeral('120@g.us'), 86_400)
        assert.equal(queryCalls, 1)
    } finally {
        await groupMetadataStore.destroy()
    }
})

test('group metadata cache create event preserves cached ephemeral', async () => {
    const groupMetadataStore = new WaGroupMetadataMemoryStore(60_000)
    try {
        const cache = createGroupMetadataCache({
            groupMetadataStore,
            queryGroupMetadata: async () => ({
                participants: ['551100000000@s.whatsapp.net'],
                ephemeral: 86_400
            }),
            logger: createNoopLogger()
        })

        await cache.resolveParticipantUsers('120@g.us')
        assert.equal(await cache.getEphemeral('120@g.us'), 86_400)

        await cache.mutateFromGroupEvent({
            rawNode: { tag: 'notification', attrs: {} },
            rawActionNode: { tag: 'create', attrs: {} },
            action: 'create',
            groupJid: '120@g.us',
            participants: [{ jid: '552200000000@s.whatsapp.net' }]
        } as WaGroupEvent)

        const after = await groupMetadataStore.getGroupMetadata('120@g.us')
        assert.equal(after?.ephemeral, 86_400)
        assert.deepEqual(after?.participants, ['552200000000@s.whatsapp.net'])
    } finally {
        await groupMetadataStore.destroy()
    }
})

test('app-state sync key protocol requests keys from peer devices and dedupes key ids', async () => {
    const published: { readonly to: string; readonly protocolType?: number | null }[] = []

    const protocol = createAppStateSyncKeyProtocol({
        publishProtocolMessageToDevice: async (deviceJid, protocolMessage) => {
            published.push({
                to: deviceJid,
                protocolType: protocolMessage.type
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
        getCurrentCredentials: () => ({ meJid: '551100000000:1@s.whatsapp.net' }) as never,
        logger: createNoopLogger()
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
    assert.ok(
        published.every(
            (entry) =>
                entry.protocolType === proto.Message.ProtocolMessage.Type.APP_STATE_SYNC_KEY_REQUEST
        )
    )
})
