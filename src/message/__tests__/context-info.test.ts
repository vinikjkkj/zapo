import assert from 'node:assert/strict'
import test from 'node:test'

import {
    applyContextInfo,
    buildContextInfoProto,
    resolveSendContextInfo
} from '@message/context-info'

test('buildContextInfoProto maps friendly fields to proto fields', () => {
    const proto = buildContextInfoProto({
        quotedMessageId: 'msg-1',
        quotedParticipant: 'sender@s.whatsapp.net',
        quotedRemoteJid: 'group@g.us',
        quotedMessage: { conversation: 'orig' },
        isForwarded: true,
        forwardingScore: 2,
        mentionedJids: ['a@s.whatsapp.net', 'b@s.whatsapp.net'],
        isSpoiler: true,
        expirationSeconds: 3600,
        groupSubject: 'Grupo X',
        parentGroupJid: 'parent@g.us'
    })
    assert.equal(proto.stanzaId, 'msg-1')
    assert.equal(proto.participant, 'sender@s.whatsapp.net')
    assert.equal(proto.remoteJid, 'group@g.us')
    assert.deepEqual(proto.quotedMessage, { conversation: 'orig' })
    assert.equal(proto.isForwarded, true)
    assert.equal(proto.forwardingScore, 2)
    assert.deepEqual(proto.mentionedJid, ['a@s.whatsapp.net', 'b@s.whatsapp.net'])
    assert.equal(proto.isSpoiler, true)
    assert.equal(proto.expiration, 3600)
    assert.equal(proto.groupSubject, 'Grupo X')
    assert.equal(proto.parentGroupJid, 'parent@g.us')
})

test('buildContextInfoProto raw escape hatch overrides friendly fields', () => {
    const proto = buildContextInfoProto({
        isForwarded: true,
        raw: { isForwarded: false, afterReadDuration: 60 }
    })
    assert.equal(proto.isForwarded, false)
    assert.equal(proto.afterReadDuration, 60)
})

test('applyContextInfo injects into the matching submessage', () => {
    const out = applyContextInfo(
        { imageMessage: { url: 'u', mimetype: 'image/jpeg' } },
        { quotedMessageId: 'q-1' }
    )
    assert.equal(out.imageMessage?.contextInfo?.stanzaId, 'q-1')
})

test('applyContextInfo merges into existing contextInfo', () => {
    const out = applyContextInfo(
        {
            extendedTextMessage: {
                text: 'hi',
                contextInfo: { mentionedJid: ['x@s.whatsapp.net'] }
            }
        },
        { quotedMessageId: 'q-1' }
    )
    assert.equal(out.extendedTextMessage?.contextInfo?.stanzaId, 'q-1')
    assert.deepEqual(out.extendedTextMessage?.contextInfo?.mentionedJid, ['x@s.whatsapp.net'])
})

test('applyContextInfo promotes conversation to extendedTextMessage', () => {
    const out = applyContextInfo({ conversation: 'hello' }, { isSpoiler: true })
    assert.equal(out.conversation, undefined)
    assert.equal(out.extendedTextMessage?.text, 'hello')
    assert.equal(out.extendedTextMessage?.contextInfo?.isSpoiler, true)
})

test('applyContextInfo creates extendedTextMessage when message is empty', () => {
    const out = applyContextInfo({}, { isForwarded: true })
    assert.equal(out.extendedTextMessage?.contextInfo?.isForwarded, true)
})

test('applyContextInfo is a no-op when ctx is null/empty', () => {
    const original: { conversation: string } = { conversation: 'x' }
    assert.equal(applyContextInfo(original, null), original)
    assert.equal(applyContextInfo(original, undefined), original)
    assert.equal(applyContextInfo(original, {}), original)
})

test('resolveSendContextInfo returns null when nothing was provided', () => {
    assert.equal(resolveSendContextInfo({}), null)
})

test('resolveSendContextInfo resolves quote from WaIncomingMessageEvent shape', () => {
    const result = resolveSendContextInfo({
        quote: { key: { id: 'm-1', remoteJid: 'group@g.us', participant: 'a@s.whatsapp.net' } }
    })
    assert.deepEqual(result, {
        quotedMessageId: 'm-1',
        quotedParticipant: 'a@s.whatsapp.net',
        quotedRemoteJid: 'group@g.us',
        quotedMessage: undefined
    })
})

test('resolveSendContextInfo resolves quote from WaQuoteRef shape', () => {
    const result = resolveSendContextInfo({
        quote: {
            id: 'm-2',
            participant: 'a@s.whatsapp.net',
            remoteJid: 'group@g.us',
            message: { conversation: 'orig' }
        }
    })
    assert.equal(result?.quotedMessageId, 'm-2')
    assert.equal(result?.quotedParticipant, 'a@s.whatsapp.net')
    assert.deepEqual(result?.quotedMessage, { conversation: 'orig' })
})

test('resolveSendContextInfo derives DM quote participant from remoteJid when peer-authored', () => {
    const result = resolveSendContextInfo({
        quote: { key: { id: 'm-3', remoteJid: 'peer@lid', fromMe: false } }
    })
    assert.equal(result?.quotedParticipant, 'peer@lid')
    assert.equal(result?.quotedRemoteJid, 'peer@lid')
})

test('resolveSendContextInfo derives DM quote participant from meLid when fromMe', () => {
    const result = resolveSendContextInfo({
        quote: { key: { id: 'm-4', remoteJid: 'peer@lid', fromMe: true } },
        meLid: 'me@lid'
    })
    assert.equal(result?.quotedParticipant, 'me@lid')
    assert.equal(result?.quotedRemoteJid, 'peer@lid')
})

test('resolveSendContextInfo does not derive DM fallback for group quote remoteJid', () => {
    const result = resolveSendContextInfo({
        quote: { key: { id: 'm-5', remoteJid: 'g@g.us', fromMe: false } }
    })
    assert.equal(result?.quotedParticipant, undefined)
})

test('resolveSendContextInfo prefers explicit quote participant over DM fallback', () => {
    const result = resolveSendContextInfo({
        quote: {
            key: {
                id: 'm-6',
                remoteJid: 'peer@lid',
                participant: 'explicit@lid',
                fromMe: false
            }
        }
    })
    assert.equal(result?.quotedParticipant, 'explicit@lid')
})

test('resolveSendContextInfo reads top-level fromMe from a flat WaMessageKey quote', () => {
    const result = resolveSendContextInfo({
        quote: { id: 'm-7', remoteJid: 'peer@lid', fromMe: true },
        meLid: 'me@lid'
    })
    assert.equal(result?.quotedParticipant, 'me@lid')
    assert.equal(result?.quotedRemoteJid, 'peer@lid')
})

test('resolveSendContextInfo uses peer for a flat WaMessageKey quote not fromMe', () => {
    const result = resolveSendContextInfo({
        quote: { id: 'm-8', remoteJid: 'peer@lid', fromMe: false },
        meLid: 'me@lid'
    })
    assert.equal(result?.quotedParticipant, 'peer@lid')
})

test('resolveSendContextInfo omits quotedRemoteJid for a same-chat quote', () => {
    const result = resolveSendContextInfo({
        quote: { id: 'm-9', remoteJid: 'peer@lid', fromMe: false },
        targetJid: 'peer@lid'
    })
    assert.equal(result?.quotedRemoteJid, undefined)
    assert.equal(result?.quotedParticipant, 'peer@lid')
    assert.equal(result?.quotedMessageId, 'm-9')
})

test('resolveSendContextInfo emits quotedRemoteJid for a cross-chat quote', () => {
    const result = resolveSendContextInfo({
        quote: { id: 'm-10', remoteJid: 'other@lid', fromMe: false },
        targetJid: 'peer@lid'
    })
    assert.equal(result?.quotedRemoteJid, 'other@lid')
})

test('resolveSendContextInfo treats a device-suffixed target as the same chat', () => {
    const result = resolveSendContextInfo({
        quote: { id: 'm-11', remoteJid: 'peer@lid', fromMe: false },
        targetJid: 'peer:3@lid'
    })
    assert.equal(result?.quotedRemoteJid, undefined)
})

test('resolveSendContextInfo emits quotedRemoteJid when no target is provided', () => {
    const result = resolveSendContextInfo({
        quote: { id: 'm-12', remoteJid: 'peer@lid', fromMe: false }
    })
    assert.equal(result?.quotedRemoteJid, 'peer@lid')
})

test('resolveSendContextInfo clears an inherited quotedRemoteJid for a same-chat quote', () => {
    const result = resolveSendContextInfo({
        optionsLevel: { quotedRemoteJid: 'stale@lid' },
        quote: { id: 'm-13', remoteJid: 'peer@lid', fromMe: false },
        targetJid: 'peer@lid'
    })
    assert.equal(result?.quotedRemoteJid, undefined)
})

test('resolveSendContextInfo applies forward with default score', () => {
    const result = resolveSendContextInfo({ forward: true })
    assert.equal(result?.isForwarded, true)
    assert.equal(result?.forwardingScore, 1)
})

test('resolveSendContextInfo increments forward score from existing context', () => {
    const result = resolveSendContextInfo({
        contentLevel: { forwardingScore: 3 },
        forward: true
    })
    assert.equal(result?.forwardingScore, 4)
})

test('resolveSendContextInfo respects explicit forward score', () => {
    const result = resolveSendContextInfo({ forward: { score: 4 } })
    assert.equal(result?.forwardingScore, 4)
})

test('resolveSendContextInfo populates mentions', () => {
    const result = resolveSendContextInfo({ mentions: ['a@s.whatsapp.net'] })
    assert.deepEqual(result?.mentionedJids, ['a@s.whatsapp.net'])
})

test('resolveSendContextInfo merges content-level + options-level + quote + forward + mentions', () => {
    const result = resolveSendContextInfo({
        contentLevel: { isSpoiler: true },
        optionsLevel: { groupSubject: 'G' },
        quote: { key: { id: 'q-1', remoteJid: 'g@g.us', participant: 'a@s.whatsapp.net' } },
        forward: true,
        mentions: ['a@s.whatsapp.net']
    })
    assert.equal(result?.isSpoiler, true)
    assert.equal(result?.groupSubject, 'G')
    assert.equal(result?.quotedMessageId, 'q-1')
    assert.equal(result?.isForwarded, true)
    assert.deepEqual(result?.mentionedJids, ['a@s.whatsapp.net'])
})
