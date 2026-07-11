import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { WaConnectionEvent } from 'zapo-js'
import { proto } from 'zapo-js/proto'

import { WaWamAutoEmitter, type WaWamAutoEmitterContext } from '../WaWamAutoEmitter.js'
import type { WaWamCoordinator } from '../WaWamCoordinator.js'

interface Commit {
    readonly name: string
    readonly payload: unknown
}

function makeHarness() {
    const commits: Commit[] = []
    const handlers = new Map<string, (event: unknown) => void>()
    let creds: Record<string, unknown> | undefined
    const coordinator = {
        commit: (name: string, payload: unknown) => commits.push({ name, payload })
    } as unknown as WaWamCoordinator
    const ctx = {
        on: (event: string, handler: (event: unknown) => void) => handlers.set(event, handler),
        off: (event: string, handler: (event: unknown) => void) => {
            if (handlers.get(event) === handler) handlers.delete(event)
        },
        client: { getCredentials: () => creds }
    } as unknown as WaWamAutoEmitterContext
    const emit = (event: string, payload: unknown) => handlers.get(event)?.(payload)
    const setCreds = (next: Record<string, unknown> | undefined) => {
        creds = next
    }
    return { commits, handlers, coordinator, ctx, emit, setCreds }
}

const openEvent = (isNewLogin: boolean): WaConnectionEvent =>
    ({ status: 'open', reason: 'connected', isNewLogin }) as WaConnectionEvent

test('auto-emitter maps a group message to MessageReceive (GROUP, isLid, offline)', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message', {
        key: {
            remoteJid: '123@g.us',
            participant: '456@lid',
            isGroup: true,
            isBroadcast: false,
            isNewsletter: false
        },
        offline: true,
        rawNode: { tag: 'message', attrs: {} }
    })
    assert.deepEqual(h.commits, [
        {
            name: 'MessageReceive',
            payload: {
                messageType: 'GROUP',
                isLid: true,
                messageIsOffline: true,
                typeOfGroup: 'GROUP'
            }
        }
    ])
})

test('auto-emitter maps a 1:1 pn message to INDIVIDUAL without typeOfGroup', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message', {
        key: {
            remoteJid: '5511999999999@s.whatsapp.net',
            isGroup: false,
            isBroadcast: false,
            isNewsletter: false
        },
        rawNode: { tag: 'message', attrs: {} }
    })
    assert.deepEqual(h.commits[0], {
        name: 'MessageReceive',
        payload: { messageType: 'INDIVIDUAL', isLid: false, messageIsOffline: false }
    })
})

test('auto-emitter derives E2eMessageRecv from the raw inbound stanza before MessageReceive', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message', {
        key: {
            remoteJid: '123@g.us',
            participant: '456@lid',
            isGroup: true,
            isBroadcast: false,
            isNewsletter: false
        },
        offline: false,
        rawNode: {
            tag: 'message',
            attrs: { from: '123@g.us' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'skmsg' } }]
        }
    })
    assert.deepEqual(h.commits[0], {
        name: 'E2eMessageRecv',
        payload: {
            e2eSuccessful: true,
            e2eDestination: 'GROUP',
            isLid: true,
            offline: false,
            e2eCiphertextType: 'SENDER_KEY_MESSAGE',
            e2eCiphertextVersion: 2,
            typeOfGroup: 'GROUP'
        }
    })
    assert.equal(h.commits[1]?.name, 'MessageReceive')
})

test('auto-emitter maps a receipt to ReceiptStanzaReceive with type and count', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('receipt', { status: 'read', messageIds: ['a', 'b', 'c'] })
    assert.deepEqual(h.commits[0], {
        name: 'ReceiptStanzaReceive',
        payload: { receiptStanzaType: 'read', receiptStanzaTotalCount: 3 }
    })
})

test('auto-emitter derives E2eMessageSend from an outbound group media message', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'message',
            attrs: { to: '123@g.us', id: 'm1', type: 'media' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'skmsg', mediatype: 'image' } }]
        }
    })
    assert.deepEqual(h.commits[0], {
        name: 'E2eMessageSend',
        payload: {
            e2eSuccessful: true,
            e2eDestination: 'GROUP',
            isLid: false,
            botType: 'UNKNOWN',
            editType: 'NOT_EDITED',
            retryCount: 0,
            e2eCiphertextType: 'SENDER_KEY_MESSAGE',
            e2eCiphertextVersion: 2,
            messageMediaType: 'PHOTO',
            typeOfGroup: 'GROUP'
        }
    })
})

test('auto-emitter derives isLid + retryCount for a lid pkmsg retry, and ignores non-messages', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', { node: { tag: 'ack', attrs: {} } })
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'message',
            attrs: { to: '456@lid', id: 'm2', addressing_mode: 'lid' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'pkmsg', count: '2' } }]
        }
    })
    assert.equal(h.commits.length, 2)
    assert.deepEqual(h.commits[0], {
        name: 'E2eMessageSend',
        payload: {
            e2eSuccessful: true,
            e2eDestination: 'INDIVIDUAL',
            isLid: true,
            botType: 'UNKNOWN',
            editType: 'NOT_EDITED',
            retryCount: 2,
            e2eCiphertextType: 'PREKEY_MESSAGE',
            e2eCiphertextVersion: 2
        }
    })
    assert.equal(h.commits[1]?.name, 'WebcMessageSend')
})

test('auto-emitter fires MessageHighRetryCount only for retry receipts at/above the threshold', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    const retryReceipt = (count: string) => ({
        node: {
            tag: 'receipt',
            attrs: { type: 'retry', from: '123@g.us', is_lid: 'false' },
            content: [{ tag: 'retry', attrs: { count, id: 'm1' } }]
        }
    })
    h.emit('debug_transport_node_in', retryReceipt('3'))
    assert.equal(h.commits.length, 0)
    h.emit('debug_transport_node_in', retryReceipt('5'))
    assert.deepEqual(h.commits[0], {
        name: 'MessageHighRetryCount',
        payload: { retryCount: 5, messageType: 'GROUP', isSenderLidBased: false }
    })
})

test('auto-emitter fires MessageSend when an ack matches a tracked outbound message', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'message',
            attrs: { to: '5511999999999@s.whatsapp.net', id: 'sendme' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'msg' } }]
        }
    })
    h.commits.length = 0
    h.emit('debug_transport_node_in', {
        node: { tag: 'ack', attrs: { class: 'message', id: 'sendme' } }
    })
    assert.deepEqual(h.commits[0], {
        name: 'MessageSend',
        payload: {
            messageSendResult: 'OK',
            messageSendResultIsTerminal: false,
            messageType: 'INDIVIDUAL',
            isLid: false,
            botType: 'UNKNOWN',
            editType: 'NOT_EDITED',
            messageIsRevoke: false,
            e2eBackfill: false,
            e2eCiphertextType: 'MESSAGE'
        }
    })
    h.commits.length = 0
    h.emit('debug_transport_node_in', {
        node: { tag: 'ack', attrs: { class: 'message', id: 'nope' } }
    })
    assert.equal(h.commits.length, 0)
})

test('auto-emitter reports ClockSkewDifferenceT once when a stanza timestamp is far off', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_in', { node: { tag: 'message', attrs: { t: '0' } } })
    assert.equal(h.commits.length, 1)
    assert.equal(h.commits[0]?.name, 'ClockSkewDifferenceT')
    assert.ok((h.commits[0]?.payload as { clockSkewHourly: number }).clockSkewHourly > 0)
    h.emit('debug_transport_node_in', { node: { tag: 'receipt', attrs: { t: '0' } } })
    assert.equal(h.commits.length, 1)
})

test('auto-emitter does not report clock skew for an in-sync timestamp', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    const nowSeconds = String(Math.floor(Date.now() / 1000))
    h.emit('debug_transport_node_in', { node: { tag: 'message', attrs: { t: nowSeconds } } })
    assert.equal(h.commits.length, 0)
})

test('auto-emitter commits WebcSocketConnect with PAGE_LOAD then SYNCING on a fresh login', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('connection', openEvent(true))
    assert.deepEqual(h.commits, [
        { name: 'WebcSocketConnect', payload: { webcSocketConnectReason: 'PAGE_LOAD' } },
        { name: 'WebcStreamModeChange', payload: { webcStreamMode: 'SYNCING' } }
    ])
})

const offlineIb = () => ({
    node: {
        tag: 'ib',
        attrs: { from: 's.whatsapp.net' },
        content: [{ tag: 'offline', attrs: { count: '0' } }]
    }
})

test('auto-emitter walks the stream mode SYNCING -> MAIN -> OFFLINE across a session', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('connection', openEvent(false))
    h.emit('debug_transport_node_in', offlineIb())
    h.emit('connection', { status: 'close', reason: 'lost', isNewLogin: false })
    const modes = h.commits
        .filter((c) => c.name === 'WebcStreamModeChange')
        .map((c) => (c.payload as { webcStreamMode: string }).webcStreamMode)
    assert.deepEqual(modes, ['SYNCING', 'MAIN', 'OFFLINE'])
})

test('auto-emitter reaches MAIN on the offline ib even with an empty queue (no preview)', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('connection', openEvent(false))
    h.emit('debug_transport_node_in', offlineIb())
    const main = h.commits.find(
        (c) =>
            c.name === 'WebcStreamModeChange' &&
            (c.payload as { webcStreamMode: string }).webcStreamMode === 'MAIN'
    )
    assert.ok(main)
})

test('auto-emitter emits MAIN once and ignores ibs without an offline child', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('connection', openEvent(false))
    h.emit('debug_transport_node_in', offlineIb())
    h.commits.length = 0
    h.emit('debug_transport_node_in', {
        node: { tag: 'ib', attrs: {}, content: [{ tag: 'notice', attrs: { id: '1' } }] }
    })
    h.emit('debug_transport_node_in', offlineIb())
    assert.equal(h.commits.length, 0)
})

test('auto-emitter uses RECONNECT when it is not a new login', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('connection', openEvent(false))
    assert.equal(
        (h.commits[0]?.payload as { webcSocketConnectReason: string }).webcSocketConnectReason,
        'RECONNECT'
    )
})

test('auto-emitter emits WebcPageResume with an incrementing count on each reconnect', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    const close = { status: 'close', reason: 'lost', isNewLogin: false }
    h.emit('connection', openEvent(false))
    assert.equal(h.commits.filter((c) => c.name === 'WebcPageResume').length, 0)
    h.emit('connection', close)
    h.emit('connection', openEvent(false))
    h.emit('connection', close)
    h.emit('connection', openEvent(false))
    const resumes = h.commits
        .filter((c) => c.name === 'WebcPageResume')
        .map((c) => (c.payload as { webcResumeCount: number }).webcResumeCount)
    assert.deepEqual(resumes, [1, 2])
})

test('auto-emitter reports WebcRawPlatforms once from the primary platform on connect', () => {
    const h = makeHarness()
    h.setCreds({ platform: 'android' })
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('connection', openEvent(false))
    h.emit('connection', { status: 'close', reason: 'lost', isNewLogin: false })
    h.emit('connection', openEvent(false))
    const raw = h.commits.filter((c) => c.name === 'WebcRawPlatforms')
    assert.equal(raw.length, 1)
    assert.deepEqual(raw[0]?.payload, { webcRawPlatform: 'android' })
})

test('auto-emitter emits no WebcRawPlatforms when the platform is unknown', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('connection', openEvent(false))
    assert.equal(h.commits.filter((c) => c.name === 'WebcRawPlatforms').length, 0)
})

test('auto-emitter fires GroupJoinC when added to a group by someone else', () => {
    const h = makeHarness()
    h.setCreds({ meJid: 'me@s.whatsapp.net', meLid: 'me@lid' })
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('group', {
        action: 'add',
        authorJid: 'admin@s.whatsapp.net',
        participants: [{ jid: 'other@s.whatsapp.net' }, { jid: 'me@s.whatsapp.net' }]
    })
    assert.equal(h.commits.filter((c) => c.name === 'GroupJoinC').length, 1)
})

test('auto-emitter fires GroupJoinC on a group created by someone else', () => {
    const h = makeHarness()
    h.setCreds({ meJid: 'me@s.whatsapp.net', meLid: 'me@lid' })
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('group', { action: 'create', authorJid: 'founder@s.whatsapp.net' })
    assert.equal(h.commits.filter((c) => c.name === 'GroupJoinC').length, 1)
})

test('auto-emitter does not fire GroupJoinC for self-authored actions or others being added', () => {
    const h = makeHarness()
    h.setCreds({ meJid: 'me@s.whatsapp.net', meLid: 'me@lid' })
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('group', { action: 'create', authorJid: 'me@s.whatsapp.net' })
    h.emit('group', {
        action: 'add',
        authorJid: 'admin@s.whatsapp.net',
        participants: [{ jid: 'other@s.whatsapp.net' }]
    })
    h.emit('group', { action: 'subject', authorJid: 'admin@s.whatsapp.net' })
    assert.equal(h.commits.filter((c) => c.name === 'GroupJoinC').length, 0)
})

test('auto-emitter maps an outbound Mute (mutation_send) to ChatMute and ChatAction', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('mutation_send', {
        schema: 'Mute',
        operation: 'set',
        source: 'local',
        chatJid: '1@g.us',
        muted: true,
        muteEndTimestamp: Date.now() + 60_000
    })
    const mute = h.commits.find((c) => c.name === 'ChatMute')
    assert.ok(mute)
    assert.equal((mute?.payload as { actionConducted: string }).actionConducted, 'MUTE')
    assert.equal((mute?.payload as { muteChatType: string }).muteChatType, 'GROUP')
    assert.equal(typeof (mute?.payload as { muteDuration: number }).muteDuration, 'number')
    assert.deepEqual(h.commits.find((c) => c.name === 'ChatAction')?.payload, {
        chatActionType: 'MUTE',
        chatActionChatType: 'GROUP'
    })
})

test('auto-emitter maps outbound Pin/Archive/Read (mutation_send) to ChatAction', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('mutation_send', {
        schema: 'Pin',
        operation: 'set',
        source: 'local',
        chatJid: 'a@s.whatsapp.net',
        pinned: true
    })
    h.emit('mutation_send', {
        schema: 'Archive',
        operation: 'set',
        source: 'local',
        chatJid: '1@g.us',
        archived: true
    })
    h.emit('mutation_send', {
        schema: 'MarkChatAsRead',
        operation: 'set',
        source: 'local',
        chatJid: 'a@s.whatsapp.net',
        read: false
    })
    const types = h.commits
        .filter((c) => c.name === 'ChatAction')
        .map((c) => (c.payload as { chatActionType: string }).chatActionType)
    assert.deepEqual(types, ['PIN', 'ARCHIVE', 'UNREAD'])
})

test('auto-emitter maps outbound Pin/Delete/Clear (mutation_send) to MdSyncdDogfoodingFeatureUsage', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('mutation_send', {
        schema: 'Pin',
        operation: 'set',
        source: 'local',
        chatJid: 'a@s.whatsapp.net',
        pinned: true
    })
    h.emit('mutation_send', {
        schema: 'DeleteChat',
        operation: 'set',
        source: 'local',
        chatJid: 'a@s.whatsapp.net'
    })
    h.emit('mutation_send', {
        schema: 'ClearChat',
        operation: 'set',
        source: 'local',
        chatJid: 'a@s.whatsapp.net',
        deleteStarred: '1'
    })
    h.emit('mutation_send', {
        schema: 'ClearChat',
        operation: 'set',
        source: 'local',
        chatJid: 'b@s.whatsapp.net',
        deleteStarred: '0'
    })
    const feats = h.commits
        .filter((c) => c.name === 'MdSyncdDogfoodingFeatureUsage')
        .map((c) => (c.payload as { mdSyncdDogfoodingFeature: string }).mdSyncdDogfoodingFeature)
    assert.deepEqual(feats, [
        'PIN_MUTATION',
        'DELETE_MUTATION',
        'CLEAR_CHAT_REMOVE_STARRED_MUTATION',
        'CLEAR_CHAT_KEEP_STARRED_MUTATION'
    ])
})

test('auto-emitter ignores the inbound mutation stream (reacts only to mutation_send)', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('mutation', {
        schema: 'Mute',
        operation: 'set',
        source: 'patch',
        chatJid: '1@g.us',
        muted: true,
        muteEndTimestamp: 0
    })
    assert.equal(h.commits.length, 0)
})

test('auto-emitter maps an outbound UserStatusMute to StatusMute', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('mutation_send', {
        schema: 'UserStatusMute',
        operation: 'set',
        source: 'local',
        muted: true
    })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'StatusMute'),
        {
            name: 'StatusMute',
            payload: { muteAction: 'MUTE', statusCategory: 'REGULAR_STATUS' }
        }
    )
})

test('auto-emitter maps an outbound reaction to ReactionActions (UPDATE / DELETE)', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message_send', {
        to: '456@s.whatsapp.net',
        message: { reactionMessage: { text: '👍' } }
    })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'ReactionActions'),
        {
            name: 'ReactionActions',
            payload: { reactionAction: 'UPDATE', messageType: 'INDIVIDUAL' }
        }
    )
    h.commits.length = 0
    h.emit('message_send', { to: '456@s.whatsapp.net', message: { reactionMessage: { text: '' } } })
    assert.equal(
        (h.commits.find((c) => c.name === 'ReactionActions')?.payload as { reactionAction: string })
            .reactionAction,
        'DELETE'
    )
})

test('auto-emitter maps an outbound poll to PollsActions (CREATE_POLL with option count)', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message_send', {
        to: '1@g.us',
        message: {
            pollCreationMessage: {
                name: 'q',
                options: [{ optionName: 'a' }, { optionName: 'b' }, { optionName: 'c' }]
            }
        }
    })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'PollsActions'),
        {
            name: 'PollsActions',
            payload: {
                pollAction: 'CREATE_POLL',
                chatType: 'GROUP',
                isAGroup: true,
                pollOptionsCount: 3,
                typeOfGroup: 'GROUP'
            }
        }
    )
})

test('auto-emitter maps a V3 poll (the version this client sends) to PollsActions', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message_send', {
        to: '456@s.whatsapp.net',
        message: {
            pollCreationMessageV3: {
                name: 'q',
                options: [{ optionName: 'a' }, { optionName: 'b' }]
            }
        }
    })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'PollsActions'),
        {
            name: 'PollsActions',
            payload: {
                pollAction: 'CREATE_POLL',
                chatType: 'INDIVIDUAL',
                isAGroup: false,
                pollOptionsCount: 2
            }
        }
    )
})

test('auto-emitter maps an outbound document to SendDocument', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message_send', {
        to: '456@s.whatsapp.net',
        message: {
            documentMessage: {
                fileName: 'report.pdf',
                mimetype: 'application/pdf',
                pageCount: 4,
                fileLength: 12345
            }
        }
    })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'SendDocument'),
        {
            name: 'SendDocument',
            payload: {
                documentType: 'DOCUMENT',
                documentExt: 'pdf',
                documentPageSize: 4,
                documentSize: 12345
            }
        }
    )
})

test('auto-emitter maps an outbound sticker to StickerSend', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message_send', {
        to: '456@s.whatsapp.net',
        message: { stickerMessage: { isAnimated: true, isLottie: false } }
    })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'StickerSend'),
        {
            name: 'StickerSend',
            payload: {
                stickerIsAnimated: true,
                stickerIsLottie: false
            }
        }
    )
})

test('auto-emitter maps an outbound pin-in-chat to PinInChatMessageSend', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message_send', {
        to: '1@g.us',
        message: {
            pinInChatMessage: {
                type: proto.Message.PinInChatMessage.Type.PIN_FOR_ALL,
                key: { fromMe: true }
            }
        }
    })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'PinInChatMessageSend'),
        {
            name: 'PinInChatMessageSend',
            payload: {
                pinInChatType: 'PIN_FOR_ALL',
                isAGroup: true,
                isSelfPin: true,
                isSelfParentMessage: true
            }
        }
    )
})

test('auto-emitter maps a forwarded outbound message to ForwardSend', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message_send', {
        to: '1@g.us',
        message: { imageMessage: { contextInfo: { isForwarded: true, forwardingScore: 5 } } }
    })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'ForwardSend'),
        {
            name: 'ForwardSend',
            payload: {
                messageType: 'GROUP',
                isFrequentlyForwarded: true,
                isForwardedForward: true,
                messageMediaType: 'PHOTO',
                typeOfGroup: 'GROUP'
            }
        }
    )
})

test('auto-emitter emits both ForwardSend and SendDocument for a forwarded document', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message_send', {
        to: '1@g.us',
        message: {
            documentMessage: {
                fileName: 'report.pdf',
                mimetype: 'application/pdf',
                contextInfo: { isForwarded: true, forwardingScore: 2 }
            }
        }
    })
    assert.equal(h.commits.filter((c) => c.name === 'ForwardSend').length, 1)
    assert.equal(h.commits.filter((c) => c.name === 'SendDocument').length, 1)
    assert.equal(
        (h.commits.find((c) => c.name === 'ForwardSend')?.payload as Record<string, unknown>)
            .isForwardedForward,
        true
    )
})

test('auto-emitter fires no ForwardSend for a normal (non-forwarded) outbound message', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message_send', { to: '456@s.whatsapp.net', message: { conversation: 'oi' } })
    assert.equal(h.commits.filter((c) => c.name === 'ForwardSend').length, 0)
})

test('auto-emitter maps a device-switch notification to WaOldCode', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_in', {
        node: {
            tag: 'notification',
            attrs: { from: 's.whatsapp.net', type: 'w:old' },
            content: [{ tag: 'wa_old_registration', attrs: { device_id: 'ABC123', code: '000' } }]
        }
    })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'WaOldCode'),
        { name: 'WaOldCode', payload: { deviceId: 'ABC123' } }
    )
})

test('auto-emitter fires EditMessageSend (EDITED) when an edited group message is acked', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'message',
            attrs: { to: '123@g.us', id: 'e1', edit: '1' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'skmsg' } }]
        }
    })
    h.commits.length = 0
    h.emit('debug_transport_node_in', {
        node: { tag: 'ack', attrs: { class: 'message', id: 'e1' } }
    })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'EditMessageSend'),
        {
            name: 'EditMessageSend',
            payload: {
                editType: 'EDITED',
                messageType: 'GROUP',
                messageSendResultIsTerminal: false,
                typeOfGroup: 'GROUP'
            }
        }
    )
})

test('auto-emitter maps an edit=7 revoke send to a SENDER_REVOKE EditMessageSend', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'message',
            attrs: { to: '5511999999999@s.whatsapp.net', id: 'r1', edit: '7' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'msg' } }]
        }
    })
    h.emit('debug_transport_node_in', {
        node: { tag: 'ack', attrs: { class: 'message', id: 'r1' } }
    })
    const edit = h.commits.find((c) => c.name === 'EditMessageSend')
    assert.equal((edit?.payload as { editType: string }).editType, 'SENDER_REVOKE')
})

test('auto-emitter fires RevokeMessageSend (ADMIN) alongside EditMessageSend for an edit=8 revoke ack', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'message',
            attrs: { to: '1@g.us', id: 'rv1', edit: '8' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'skmsg' } }]
        }
    })
    h.emit('debug_transport_node_in', {
        node: { tag: 'ack', attrs: { class: 'message', id: 'rv1' } }
    })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'RevokeMessageSend'),
        {
            name: 'RevokeMessageSend',
            payload: {
                revokeType: 'ADMIN',
                messageType: 'GROUP',
                messageSendResultIsTerminal: false
            }
        }
    )
    assert.equal(
        (h.commits.find((c) => c.name === 'EditMessageSend')?.payload as { editType: string })
            .editType,
        'ADMIN_REVOKE'
    )
    assert.deepEqual(
        h.commits.find((c) => c.name === 'MessageDeleteActions'),
        {
            name: 'MessageDeleteActions',
            payload: {
                deleteActionType: 'DELETE_FOR_EVERYONE',
                isAGroup: true,
                messagesDeleted: 1
            }
        }
    )
    assert.deepEqual(
        h.commits.find((c) => c.name === 'SendRevokeMessage'),
        {
            name: 'SendRevokeMessage',
            payload: { messageType: 'GROUP' }
        }
    )
})

test('auto-emitter fires OfflineCountTooHigh once a message offline position hits 11', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message', {
        key: {
            remoteJid: '1@s.whatsapp.net',
            isGroup: false,
            isBroadcast: false,
            isNewsletter: false
        },
        offline: true,
        rawNode: { tag: 'message', attrs: { offline: '11' } }
    })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'OfflineCountTooHigh'),
        {
            name: 'OfflineCountTooHigh',
            payload: {
                offlineCount: 11,
                stanzaType: 'MESSAGE',
                messageType: 'INDIVIDUAL',
                mediaType: 'NONE'
            }
        }
    )
})

test('auto-emitter does not fire OfflineCountTooHigh below the threshold', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('message', {
        key: {
            remoteJid: '1@s.whatsapp.net',
            isGroup: false,
            isBroadcast: false,
            isNewsletter: false
        },
        rawNode: { tag: 'message', attrs: { offline: '10' } }
    })
    assert.equal(
        h.commits.find((c) => c.name === 'OfflineCountTooHigh'),
        undefined
    )
})

test('auto-emitter fires no EditMessageSend for a normal (non-edit) send', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'message',
            attrs: { to: '5511999999999@s.whatsapp.net', id: 'n1' },
            content: [{ tag: 'enc', attrs: { v: '2', type: 'msg' } }]
        }
    })
    h.emit('debug_transport_node_in', {
        node: { tag: 'ack', attrs: { class: 'message', id: 'n1' } }
    })
    assert.equal(h.commits.filter((c) => c.name === 'EditMessageSend').length, 0)
})

test('auto-emitter maps an unhandled stanza to UnknownStanza', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_unhandled_stanza', {
        reason: 'no handler',
        rawNode: { tag: 'notification', attrs: { type: 'shmex' } }
    })
    assert.deepEqual(h.commits[0], {
        name: 'UnknownStanza',
        payload: { unknownStanzaTag: 'notification', unknownStanzaType: 'shmex' }
    })
})

test('auto-emitter maps a history-sync chunk to MdBootstrapHistoryDataReceived', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('history_sync_chunk', { syncType: 2, messagesCount: 10, chunkOrder: 3, progress: 40 })
    assert.deepEqual(h.commits[0], {
        name: 'MdBootstrapHistoryDataReceived',
        payload: { historySyncChunkOrder: 3, historySyncStageProgress: 40 }
    })
})

test('auto-emitter emits no stream mode for a close before any open, and detaches on dispose', () => {
    const h = makeHarness()
    const emitter = new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('connection', { status: 'close', reason: 'lost', isNewLogin: false })
    assert.equal(h.commits.length, 0)
    emitter.dispose()
    assert.equal(h.handlers.size, 0)
})

const membershipActionIq = (id: string, action: 'approve' | 'reject') => ({
    node: {
        tag: 'iq',
        attrs: { id, to: '123@g.us', type: 'set', xmlns: 'w:g2' },
        content: [
            {
                tag: 'membership_requests_action',
                attrs: {},
                content: [
                    {
                        tag: action,
                        attrs: {},
                        content: [{ tag: 'participant', attrs: { jid: '5@s.whatsapp.net' } }]
                    }
                ]
            }
        ]
    }
})

test('auto-emitter correlates an approved membership-request IQ to WaFsGroupJoinRequestAction', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', membershipActionIq('iq1', 'approve'))
    assert.equal(h.commits.length, 0)
    h.emit('debug_transport_node_in', { node: { tag: 'iq', attrs: { id: 'iq1', type: 'result' } } })
    assert.equal(h.commits.length, 1)
    const commit = h.commits[0]
    assert.equal(commit?.name, 'WaFsGroupJoinRequestAction')
    const payload = commit?.payload as Record<string, unknown>
    assert.equal(payload.groupJid, '123@g.us')
    assert.equal(payload.groupJoinRequestAction, 'MEMBERSHIP_REQUEST_APPROVE')
    assert.equal(payload.isSuccessful, true)
    assert.equal(typeof payload.serverResponseTime, 'number')
    assert.ok((payload.serverResponseTime as number) >= 0)
    assert.equal('groupJoinRequestEntrypoint' in payload, false)
    assert.equal('groupJoinRequestGroupsInCommon' in payload, false)
})

test('auto-emitter marks a rejected membership-request IQ error as unsuccessful', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', membershipActionIq('iq2', 'reject'))
    h.emit('debug_transport_node_in', { node: { tag: 'iq', attrs: { id: 'iq2', type: 'error' } } })
    assert.equal(h.commits.length, 1)
    assert.deepEqual(
        {
            name: h.commits[0]?.name,
            groupJoinRequestAction: (h.commits[0]?.payload as Record<string, unknown>)
                .groupJoinRequestAction,
            isSuccessful: (h.commits[0]?.payload as Record<string, unknown>).isSuccessful
        },
        {
            name: 'WaFsGroupJoinRequestAction',
            groupJoinRequestAction: 'MEMBERSHIP_REQUEST_REJECT',
            isSuccessful: false
        }
    )
})

test('auto-emitter ignores unrelated IQs and unmatched IQ responses', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    // A w:g2 set without a membership action is not tracked.
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'iq',
            attrs: { id: 'x1', to: '123@g.us', type: 'set', xmlns: 'w:g2' },
            content: [{ tag: 'demote', attrs: {}, content: [] }]
        }
    })
    // A result for an untracked id emits nothing.
    h.emit('debug_transport_node_in', { node: { tag: 'iq', attrs: { id: 'x1', type: 'result' } } })
    h.emit('debug_transport_node_in', {
        node: { tag: 'iq', attrs: { id: 'ghost', type: 'result' } }
    })
    assert.equal(h.commits.length, 0)
})

test('auto-emitter fires GroupCreate + GroupCreateC on a successful create IQ', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'iq',
            attrs: { id: 'gc1', to: '@g.us', type: 'set', xmlns: 'w:g2' },
            content: [{ tag: 'create', attrs: { subject: 'My Group' }, content: [] }]
        }
    })
    assert.equal(h.commits.length, 0)
    h.emit('debug_transport_node_in', { node: { tag: 'iq', attrs: { id: 'gc1', type: 'result' } } })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'GroupCreate'),
        {
            name: 'GroupCreate',
            payload: { hasGroupName: true }
        }
    )
    assert.deepEqual(
        h.commits.find((c) => c.name === 'GroupCreateC'),
        {
            name: 'GroupCreateC',
            payload: {}
        }
    )
})

test('auto-emitter does not fire GroupCreate when the create IQ errors', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'iq',
            attrs: { id: 'gc2', to: '@g.us', type: 'set', xmlns: 'w:g2' },
            content: [{ tag: 'create', attrs: { subject: 'X' }, content: [] }]
        }
    })
    h.emit('debug_transport_node_in', { node: { tag: 'iq', attrs: { id: 'gc2', type: 'error' } } })
    assert.equal(h.commits.length, 0)
})

test('auto-emitter fires EphemeralSettingChange from a group ephemeral IQ', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'iq',
            attrs: { id: 'ep1', to: '123@g.us', type: 'set', xmlns: 'w:g2' },
            content: [{ tag: 'ephemeral', attrs: { expiration: '604800' } }]
        }
    })
    h.emit('debug_transport_node_in', { node: { tag: 'iq', attrs: { id: 'ep1', type: 'result' } } })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'EphemeralSettingChange'),
        {
            name: 'EphemeralSettingChange',
            payload: { chatEphemeralityDuration: 604800, isSuccess: true }
        }
    )
})

test('auto-emitter fires DisappearingModeSettingChange (isSuccess reflects the ack) from a disappearing_mode IQ', () => {
    const h = makeHarness()
    new WaWamAutoEmitter(h.coordinator, h.ctx)
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'iq',
            attrs: { id: 'dm1', to: '@s.whatsapp.net', type: 'set', xmlns: 'disappearing_mode' },
            content: [{ tag: 'disappearing_mode', attrs: { duration: '86400' } }]
        }
    })
    h.emit('debug_transport_node_in', { node: { tag: 'iq', attrs: { id: 'dm1', type: 'error' } } })
    assert.deepEqual(
        h.commits.find((c) => c.name === 'DisappearingModeSettingChange'),
        {
            name: 'DisappearingModeSettingChange',
            payload: { newEphemeralityDuration: 86400, isSuccess: false }
        }
    )
})
