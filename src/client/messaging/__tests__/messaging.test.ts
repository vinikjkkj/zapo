import assert from 'node:assert/strict'
import test from 'node:test'

import { createDeviceFanoutResolver } from '@client/messaging/fanout'
import { createGroupMetadataCache } from '@client/messaging/group-metadata'
import { createAppStateSyncKeyProtocol } from '@client/messaging/key-protocol'
import { buildMediaMessageContent, type WaMediaMessageOptions } from '@client/messaging/messages'
import type { WaGroupEvent, WaGroupEventAction } from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import { proto } from '@proto'
import { WaGroupMetadataMemoryStore } from '@store/memory/group-metadata.store'
import type { ServerClock } from '@util/clock'

const localServerClock: ServerClock = {
    nowMs: () => Date.now(),
    nowSeconds: () => Math.floor(Date.now() / 1000)
}

const BUILD_OPTIONS = {
    logger: createNoopLogger(),
    serverClock: localServerClock
} as unknown as WaMediaMessageOptions

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

test('device fanout resolver keeps hosted devices in group fanout', async () => {
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
    assert.deepEqual(fanout, [
        '6116570308623:1@lid',
        '6116570308623:99@hosted.lid',
        '551188888888@s.whatsapp.net',
        '551188888888:99@hosted'
    ])
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

test('buildMediaMessageContent builds reaction message with key and emoji', async () => {
    const groupJid = '120363000000000000@g.us'
    const built = await buildMediaMessageContent(
        BUILD_OPTIONS,
        {
            type: 'reaction',
            emoji: '🔥',
            target: {
                remoteJid: groupJid,
                id: 'STANZA1',
                fromMe: false,
                participant: '551199999999@s.whatsapp.net'
            },
            senderTimestampMs: 1_700_000_000_000
        },
        { to: groupJid }
    )

    assert.deepEqual(built.message.reactionMessage?.key, {
        remoteJid: groupJid,
        fromMe: false,
        id: 'STANZA1',
        participant: '551199999999@s.whatsapp.net'
    })
    assert.equal(built.message.reactionMessage?.text, '🔥')
    assert.equal(built.message.reactionMessage?.senderTimestampMs, 1_700_000_000_000)

    const revoke = await buildMediaMessageContent(
        BUILD_OPTIONS,
        {
            type: 'reaction',
            emoji: '',
            target: { remoteJid: '551122222222@s.whatsapp.net', id: 'STANZA1', fromMe: true }
        },
        { to: '551122222222@s.whatsapp.net' }
    )
    assert.equal(revoke.message.reactionMessage?.text, '')
    assert.equal(revoke.message.reactionMessage?.key?.participant, undefined)
    assert.equal(revoke.message.reactionMessage?.key?.fromMe, true)

    await assert.rejects(
        () =>
            buildMediaMessageContent(BUILD_OPTIONS, {
                type: 'reaction',
                emoji: '🔥',
                target: { remoteJid: '551122222222@s.whatsapp.net', id: 'STANZA1', fromMe: true }
            }),
        /requires to in build context/
    )
})

test('buildMediaMessageContent builds revoke protocolMessage', async () => {
    const chatJid = '551122222222@s.whatsapp.net'
    const own = await buildMediaMessageContent(
        BUILD_OPTIONS,
        { type: 'revoke', target: { remoteJid: chatJid, id: 'STANZA2', fromMe: true } },
        { to: chatJid }
    )
    assert.equal(own.message.protocolMessage?.type, proto.Message.ProtocolMessage.Type.REVOKE)
    assert.deepEqual(own.message.protocolMessage?.key, {
        remoteJid: chatJid,
        fromMe: true,
        id: 'STANZA2'
    })

    const adminRevoke = await buildMediaMessageContent(
        BUILD_OPTIONS,
        {
            type: 'revoke',
            target: {
                remoteJid: '120363000000000000@g.us',
                id: 'STANZA3',
                fromMe: false,
                participant: '551199999999@s.whatsapp.net'
            }
        },
        { to: '120363000000000000@g.us' }
    )
    assert.deepEqual(adminRevoke.message.protocolMessage?.key, {
        remoteJid: '120363000000000000@g.us',
        fromMe: false,
        id: 'STANZA3',
        participant: '551199999999@s.whatsapp.net'
    })

    await assert.rejects(
        () =>
            buildMediaMessageContent(BUILD_OPTIONS, {
                type: 'revoke',
                target: { remoteJid: '551122222222@s.whatsapp.net', id: 'X', fromMe: true }
            }),
        /requires to in build context/
    )
})

test('buildMediaMessageContent builds pin/unpin with PinInChatMessage Type enum', async () => {
    const chatJid = '551122222222@s.whatsapp.net'
    const pin = await buildMediaMessageContent(
        BUILD_OPTIONS,
        {
            type: 'pin',
            target: { remoteJid: chatJid, id: 'S1', fromMe: true },
            senderTimestampMs: 1_700_000_000_000
        },
        { to: chatJid }
    )
    assert.equal(
        pin.message.pinInChatMessage?.type,
        proto.Message.PinInChatMessage.Type.PIN_FOR_ALL
    )
    assert.equal(pin.message.pinInChatMessage?.senderTimestampMs, 1_700_000_000_000)
    assert.equal(pin.message.pinInChatMessage?.key?.id, 'S1')

    const unpin = await buildMediaMessageContent(
        BUILD_OPTIONS,
        { type: 'unpin', target: { remoteJid: chatJid, id: 'S1', fromMe: true } },
        { to: chatJid }
    )
    assert.equal(
        unpin.message.pinInChatMessage?.type,
        proto.Message.PinInChatMessage.Type.UNPIN_FOR_ALL
    )
})

test('buildMediaMessageContent builds keep/unkeep with KeepType enum', async () => {
    const chatJid = '551122222222@s.whatsapp.net'
    const keep = await buildMediaMessageContent(
        BUILD_OPTIONS,
        { type: 'keep', target: { remoteJid: chatJid, id: 'S3', fromMe: true } },
        { to: chatJid }
    )
    assert.equal(keep.message.keepInChatMessage?.keepType, proto.KeepType.KEEP_FOR_ALL)
    const unkeep = await buildMediaMessageContent(
        BUILD_OPTIONS,
        { type: 'unkeep', target: { remoteJid: chatJid, id: 'S3', fromMe: true } },
        { to: chatJid }
    )
    assert.equal(unkeep.message.keepInChatMessage?.keepType, proto.KeepType.UNDO_KEEP_FOR_ALL)
})

test('buildMediaMessageContent builds poll creation V3 with hashed-ready options', async () => {
    const built = await buildMediaMessageContent(
        BUILD_OPTIONS,
        {
            type: 'poll',
            name: 'Qual cor?',
            options: ['azul', { name: 'verde' }, 'vermelho'],
            selectableCount: 2,
            allowAddOption: true
        },
        { to: '551122222222@s.whatsapp.net' }
    )
    assert.equal(built.message.pollCreationMessageV3?.name, 'Qual cor?')
    assert.equal(built.message.pollCreationMessageV3?.selectableOptionsCount, 2)
    assert.equal(built.message.pollCreationMessageV3?.allowAddOption, true)
    assert.deepEqual(built.message.pollCreationMessageV3?.options, [
        { optionName: 'azul' },
        { optionName: 'verde' },
        { optionName: 'vermelho' }
    ])

    await assert.rejects(
        () =>
            buildMediaMessageContent(
                BUILD_OPTIONS,
                { type: 'poll', name: 'X', options: [] },
                { to: '551122222222@s.whatsapp.net' }
            ),
        /at least one option/
    )
})

test('buildMediaMessageContent builds event with optional location and fields', async () => {
    const built = await buildMediaMessageContent(
        BUILD_OPTIONS,
        {
            type: 'event',
            name: 'Reunião',
            description: 'Daily',
            startTime: 1_700_000_000,
            endTime: 1_700_003_600,
            joinLink: 'https://meet.example/abc',
            extraGuestsAllowed: true,
            location: {
                latitude: -23.55,
                longitude: -46.63,
                name: 'SP'
            }
        },
        { to: '120363000000000000@g.us' }
    )
    assert.equal(built.message.eventMessage?.name, 'Reunião')
    assert.equal(built.message.eventMessage?.startTime, 1_700_000_000)
    assert.equal(built.message.eventMessage?.endTime, 1_700_003_600)
    assert.equal(built.message.eventMessage?.joinLink, 'https://meet.example/abc')
    assert.equal(built.message.eventMessage?.extraGuestsAllowed, true)
    assert.equal(built.message.eventMessage?.location?.degreesLatitude, -23.55)
    assert.equal(built.message.eventMessage?.location?.degreesLongitude, -46.63)
    assert.equal(built.message.eventMessage?.location?.name, 'SP')
})

test('buildMediaMessageContent encrypts poll-vote with addon-crypto and hashes option names', async () => {
    const messageSecret = new Uint8Array(32).fill(7)
    const built = await buildMediaMessageContent(
        BUILD_OPTIONS,
        {
            type: 'poll-vote',
            poll: {
                id: 'POLL_PARENT',
                fromMe: false,
                authorJid: '551100000000@s.whatsapp.net',
                participant: '551100000000@s.whatsapp.net',
                messageSecret
            },
            selectedOptionNames: ['azul', 'verde'],
            senderTimestampMs: 1_700_000_000_000
        },
        {
            to: '551122222222@s.whatsapp.net',
            outgoingStanzaId: 'OUT_VOTE',
            meJid: '551199999999@s.whatsapp.net'
        }
    )

    const vote = built.message.pollUpdateMessage
    assert.ok(vote)
    assert.equal(vote?.senderTimestampMs, 1_700_000_000_000)
    assert.equal(vote?.pollCreationMessageKey?.remoteJid, '551122222222@s.whatsapp.net')
    assert.equal(vote?.pollCreationMessageKey?.id, 'POLL_PARENT')
    assert.equal(vote?.pollCreationMessageKey?.fromMe, false)
    assert.equal(vote?.pollCreationMessageKey?.participant, '551100000000@s.whatsapp.net')
    assert.ok(vote?.vote?.encPayload instanceof Uint8Array)
    assert.ok(vote?.vote?.encIv instanceof Uint8Array)
    assert.equal(vote?.vote?.encIv?.byteLength, 12)

    await assert.rejects(
        () =>
            buildMediaMessageContent(
                BUILD_OPTIONS,
                {
                    type: 'poll-vote',
                    poll: {
                        id: 'P',
                        fromMe: false,
                        authorJid: 'a',
                        messageSecret
                    },
                    selectedOptionNames: ['x']
                },
                { to: 'x', outgoingStanzaId: 'OUT' }
            ),
        /requires meJid/
    )
})

test('buildMediaMessageContent encrypts event-response with addon-crypto and chosen enum', async () => {
    const messageSecret = new Uint8Array(32).fill(9)
    const built = await buildMediaMessageContent(
        BUILD_OPTIONS,
        {
            type: 'event-response',
            event: {
                id: 'EVENT_PARENT',
                fromMe: false,
                authorJid: '551100000000@s.whatsapp.net',
                participant: '551100000000@s.whatsapp.net',
                messageSecret
            },
            response: 'going',
            extraGuestCount: 2,
            timestampMs: 1_700_000_000_000
        },
        {
            to: '120363000000000000@g.us',
            outgoingStanzaId: 'OUT_RESP',
            meJid: '551199999999@s.whatsapp.net'
        }
    )

    const resp = built.message.encEventResponseMessage
    assert.ok(resp)
    assert.equal(resp?.eventCreationMessageKey?.remoteJid, '120363000000000000@g.us')
    assert.equal(resp?.eventCreationMessageKey?.id, 'EVENT_PARENT')
    assert.ok(resp?.encPayload instanceof Uint8Array)
    assert.ok(resp?.encIv instanceof Uint8Array)
    assert.equal(resp?.encIv?.byteLength, 12)
})

test('buildMediaMessageContent applies server-clock skew when caller omits timestamps', async () => {
    const fixedMs = 1_700_000_000_000
    const fixedSeconds = Math.floor(fixedMs / 1000)
    const skewedClock = {
        logger: createNoopLogger(),
        serverClock: {
            nowMs: () => fixedMs,
            nowSeconds: () => fixedSeconds
        }
    } as unknown as WaMediaMessageOptions

    const chatJid = '551122222222@s.whatsapp.net'

    const reaction = await buildMediaMessageContent(
        skewedClock,
        {
            type: 'reaction',
            emoji: '🔥',
            target: { remoteJid: chatJid, id: 'STANZA_R', fromMe: true }
        },
        { to: chatJid }
    )
    assert.equal(reaction.message.reactionMessage?.senderTimestampMs, fixedMs)

    const pin = await buildMediaMessageContent(
        skewedClock,
        { type: 'pin', target: { remoteJid: chatJid, id: 'STANZA_P', fromMe: true } },
        { to: chatJid }
    )
    assert.equal(pin.message.pinInChatMessage?.senderTimestampMs, fixedMs)

    const keep = await buildMediaMessageContent(
        skewedClock,
        { type: 'keep', target: { remoteJid: chatJid, id: 'STANZA_K', fromMe: true } },
        { to: chatJid }
    )
    assert.equal(keep.message.keepInChatMessage?.timestampMs, fixedMs)
})
