import assert from 'node:assert/strict'
import test from 'node:test'

import type {
    WaAppStateMutationCoordinator,
    WaSetStatusPrivacyInput
} from '@client/coordinators/WaAppStateMutationCoordinator'
import { createStatusCoordinator } from '@client/coordinators/WaStatusCoordinator'
import type { WaMessagePublishResult } from '@message/types'
import { proto, type Proto } from '@proto'

interface FakeAppStateMutations {
    readonly setStatusPrivacyCalls: WaSetStatusPrivacyInput[]
    readonly setUserStatusMuteCalls: { jid: string; muted: boolean }[]
}

function createFakeAppStateMutations(): WaAppStateMutationCoordinator & FakeAppStateMutations {
    const setStatusPrivacyCalls: WaSetStatusPrivacyInput[] = []
    const setUserStatusMuteCalls: { jid: string; muted: boolean }[] = []
    const fake = {
        setStatusPrivacyCalls,
        setUserStatusMuteCalls,
        setStatusPrivacy: async (input: WaSetStatusPrivacyInput) => {
            setStatusPrivacyCalls.push(input)
        },
        setUserStatusMute: async (jid: string, muted: boolean) => {
            setUserStatusMuteCalls.push({ jid, muted })
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

test('status coordinator setPrivacy delegates to app state mutations', async () => {
    const appStateMutations = createFakeAppStateMutations()
    const coordinator = createStatusCoordinator({
        appStateMutations,
        buildMessageContent: async () => ({ message: {} }),
        publishStatusMessage: async () => fakePublishResult('unused')
    })

    await coordinator.setPrivacy({ mode: 'CONTACTS' })
    assert.deepEqual(appStateMutations.setStatusPrivacyCalls, [{ mode: 'CONTACTS' }])
})

test('status coordinator setUserMuted delegates to app state mutations', async () => {
    const appStateMutations = createFakeAppStateMutations()
    const coordinator = createStatusCoordinator({
        appStateMutations,
        buildMessageContent: async () => ({ message: {} }),
        publishStatusMessage: async () => fakePublishResult('unused')
    })

    await coordinator.setUserMuted('5511000000000@s.whatsapp.net', true)
    assert.deepEqual(appStateMutations.setUserStatusMuteCalls, [
        { jid: '5511000000000@s.whatsapp.net', muted: true }
    ])
})

test('status coordinator send converts conversation to extendedTextMessage', async () => {
    const publishes: Array<{
        message: Proto.IMessage
        recipients: readonly string[]
        statusSetting?: string
    }> = []
    const coordinator = createStatusCoordinator({
        appStateMutations: createFakeAppStateMutations(),
        buildMessageContent: async (content) => {
            assert.equal(content, 'hi status')
            return { message: { conversation: 'hi status' } }
        },
        publishStatusMessage: async (input) => {
            publishes.push({
                message: input.message,
                recipients: input.recipients,
                statusSetting: input.statusSetting
            })
            return fakePublishResult('status-1')
        }
    })

    const result = await coordinator.send({
        content: 'hi status',
        recipients: ['5511000000000@lid'],
        statusSetting: 'denylist'
    })
    assert.equal(result.id, 'status-1')
    assert.equal(publishes.length, 1)
    assert.equal(publishes[0].statusSetting, 'denylist')
    assert.deepEqual(publishes[0].recipients, ['5511000000000@lid'])
    assert.equal(publishes[0].message.extendedTextMessage?.text, 'hi status')
    assert.equal(publishes[0].message.conversation, null)
})

test('status coordinator send passes a pre-built proto unchanged', async () => {
    let captured: Proto.IMessage | undefined
    const coordinator = createStatusCoordinator({
        appStateMutations: createFakeAppStateMutations(),
        buildMessageContent: async (content) => ({ message: content as Proto.IMessage }),
        publishStatusMessage: async (input) => {
            captured = input.message
            return fakePublishResult('status-2')
        }
    })

    const proto1: Proto.IMessage = {
        extendedTextMessage: { text: 'already wrapped' }
    }
    await coordinator.send({ content: proto1, recipients: ['5511000000000@lid'] })
    assert.equal(captured?.extendedTextMessage?.text, 'already wrapped')
})

test('status coordinator revokeStatus emits a REVOKE protocolMessage for status@broadcast', async () => {
    let captured: Proto.IMessage | undefined
    const coordinator = createStatusCoordinator({
        appStateMutations: createFakeAppStateMutations(),
        buildMessageContent: async () => ({ message: {} }),
        publishStatusMessage: async (input) => {
            captured = input.message
            return fakePublishResult('revoke-1')
        }
    })

    await coordinator.revokeStatus({
        messageId: 'MSG_ID',
        recipients: ['5511000000000@lid']
    })
    assert.ok(captured?.protocolMessage)
    assert.equal(captured.protocolMessage?.type, proto.Message.ProtocolMessage.Type.REVOKE)
    assert.equal(captured.protocolMessage?.key?.id, 'MSG_ID')
    assert.equal(captured.protocolMessage?.key?.fromMe, true)
    assert.equal(captured.protocolMessage?.key?.remoteJid, 'status@broadcast')
})
