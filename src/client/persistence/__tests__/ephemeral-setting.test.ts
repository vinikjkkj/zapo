import assert from 'node:assert/strict'
import test from 'node:test'

import { persistIncomingEphemeralSetting } from '@client/persistence/ephemeral-setting'
import type { WaIncomingMessageEvent } from '@client/types'
import { createNoopLogger } from '@infra/log/types'
import { proto } from '@proto'
import type { WaStoredThreadRecord } from '@store/contracts/thread.store'

function baseEvent(
    overrides: Partial<WaIncomingMessageEvent> & {
        readonly keyOverrides?: Partial<WaIncomingMessageEvent['key']>
    } = {}
): WaIncomingMessageEvent {
    const { keyOverrides, ...rest } = overrides
    return {
        key: {
            remoteJid: '5511999999999@s.whatsapp.net',
            id: 'msg-1',
            fromMe: false,
            isGroup: false,
            isBroadcast: false,
            isNewsletter: false,
            senderDevice: 0,
            ...keyOverrides
        },
        rawNode: {
            tag: 'message',
            attrs: {}
        },
        timestampSeconds: 1_784_900_697,
        ...rest
    }
}

test('ephemeral setting persist enables 1:1 thread with protocol expiration + message timestamp', () => {
    const threads: WaStoredThreadRecord[] = []
    const writeBehind = {
        persistThread: (record: WaStoredThreadRecord) => {
            threads.push(record)
        }
    }

    persistIncomingEphemeralSetting({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        event: baseEvent(),
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
            ephemeralExpiration: 86_400
        }
    })

    assert.equal(threads.length, 1)
    assert.equal(threads[0].jid, '5511999999999@s.whatsapp.net')
    assert.equal(threads[0].ephemeralExpiration, 86_400)
    assert.equal(threads[0].ephemeralSettingTimestamp, 1_784_900_697)
})

test('ephemeral setting persist prefers protocol ephemeralSettingTimestamp over message timestamp', () => {
    const threads: WaStoredThreadRecord[] = []
    const writeBehind = {
        persistThread: (record: WaStoredThreadRecord) => {
            threads.push(record)
        }
    }

    persistIncomingEphemeralSetting({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        event: baseEvent({ timestampSeconds: 1_700_000_000 }),
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
            ephemeralExpiration: 604_800,
            ephemeralSettingTimestamp: 1_751_808_692
        }
    })

    assert.equal(threads[0].ephemeralExpiration, 604_800)
    assert.equal(threads[0].ephemeralSettingTimestamp, 1_751_808_692)
})

test('ephemeral setting persist disables 1:1 thread with expiration 0', () => {
    const threads: WaStoredThreadRecord[] = []
    const writeBehind = {
        persistThread: (record: WaStoredThreadRecord) => {
            threads.push(record)
        }
    }

    persistIncomingEphemeralSetting({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        event: baseEvent({ timestampSeconds: 1_784_900_714 }),
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
            ephemeralExpiration: 0
        }
    })

    assert.equal(threads[0].ephemeralExpiration, 0)
    assert.equal(threads[0].ephemeralSettingTimestamp, 1_784_900_714)
})

test('ephemeral setting persist normalizes a millisecond protocol timestamp', () => {
    const threads: WaStoredThreadRecord[] = []
    const writeBehind = {
        persistThread: (record: WaStoredThreadRecord) => {
            threads.push(record)
        }
    }

    persistIncomingEphemeralSetting({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        event: baseEvent(),
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
            ephemeralExpiration: 86_400,
            ephemeralSettingTimestamp: 1_751_808_692_000
        }
    })

    assert.equal(threads[0].ephemeralSettingTimestamp, 1_751_808_692)
})

test('ephemeral setting persist skips group chats', () => {
    const threads: WaStoredThreadRecord[] = []
    const writeBehind = {
        persistThread: (record: WaStoredThreadRecord) => {
            threads.push(record)
        }
    }

    persistIncomingEphemeralSetting({
        logger: createNoopLogger(),
        writeBehind: writeBehind as never,
        event: baseEvent({
            keyOverrides: {
                remoteJid: '120363000000000000@g.us',
                isGroup: true
            }
        }),
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
            ephemeralExpiration: 86_400
        }
    })

    assert.equal(threads.length, 0)
})
