import assert from 'node:assert/strict'
import test from 'node:test'

import type {
    WaAppStateMutationCoordinator,
    WaSetBroadcastListInput
} from '@client/coordinators/WaAppStateMutationCoordinator'
import { createBroadcastListCoordinator } from '@client/coordinators/WaBroadcastListCoordinator'
import type { WaMessagePublishResult } from '@message/types'
import type { Proto } from '@proto'

interface FakeAppStateMutations {
    readonly setBroadcastListCalls: WaSetBroadcastListInput[]
    readonly removeBroadcastListCalls: string[]
}

function createFakeAppStateMutations(): WaAppStateMutationCoordinator & FakeAppStateMutations {
    const setBroadcastListCalls: WaSetBroadcastListInput[] = []
    const removeBroadcastListCalls: string[] = []
    const fake = {
        setBroadcastListCalls,
        removeBroadcastListCalls,
        setBroadcastList: async (input: WaSetBroadcastListInput) => {
            setBroadcastListCalls.push(input)
        },
        removeBroadcastList: async (id: string) => {
            removeBroadcastListCalls.push(id)
        }
    }
    return fake as unknown as WaAppStateMutationCoordinator & FakeAppStateMutations
}

function fakePublishResult(id: string): WaMessagePublishResult {
    return {
        id,
        ack: { error: undefined, code: 200, phash: undefined, addressingMode: undefined }
    } as unknown as WaMessagePublishResult
}

test('broadcast list coordinator setList delegates to app state mutations', async () => {
    const appStateMutations = createFakeAppStateMutations()
    const coordinator = createBroadcastListCoordinator({
        appStateMutations,
        buildMessageContent: async () => ({ message: {} }),
        publishBroadcastListMessage: async () => fakePublishResult('unused')
    })

    const input: WaSetBroadcastListInput = {
        id: 'list-1',
        listName: 'Friends',
        participants: [{ lidJid: 'a@lid', pnJid: 'a@s.whatsapp.net' }, { lidJid: 'b@lid' }],
        labelIds: ['L1']
    }
    await coordinator.setList(input)
    assert.deepEqual(appStateMutations.setBroadcastListCalls, [input])
})

test('broadcast list coordinator removeList delegates to app state mutations', async () => {
    const appStateMutations = createFakeAppStateMutations()
    const coordinator = createBroadcastListCoordinator({
        appStateMutations,
        buildMessageContent: async () => ({ message: {} }),
        publishBroadcastListMessage: async () => fakePublishResult('unused')
    })

    await coordinator.removeList('list-1')
    assert.deepEqual(appStateMutations.removeBroadcastListCalls, ['list-1'])
})

test('broadcast list coordinator send forwards built message + recipients', async () => {
    const sends: Array<{
        listJid: string
        message: Proto.IMessage
        recipients: readonly string[]
    }> = []
    const coordinator = createBroadcastListCoordinator({
        appStateMutations: createFakeAppStateMutations(),
        buildMessageContent: async (content) => {
            assert.equal(content, 'hello list')
            return { message: { conversation: 'hello list' } }
        },
        publishBroadcastListMessage: async (input) => {
            sends.push({
                listJid: input.listJid,
                message: input.message,
                recipients: input.recipients
            })
            return fakePublishResult('msg-1')
        }
    })

    const result = await coordinator.send({
        listJid: 'list-1@broadcast',
        content: 'hello list',
        recipients: ['a@lid', 'b@lid']
    })
    assert.equal(result.id, 'msg-1')
    assert.equal(sends.length, 1)
    assert.equal(sends[0].listJid, 'list-1@broadcast')
    assert.equal(sends[0].message.conversation, 'hello list')
    assert.deepEqual(sends[0].recipients, ['a@lid', 'b@lid'])
})
