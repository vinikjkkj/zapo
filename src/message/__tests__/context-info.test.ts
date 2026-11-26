import assert from 'node:assert/strict'
import test from 'node:test'

import {
    applyContextInfo,
    buildContextInfoProto,
    getContextInfo,
    pickIncomingEphemeralSettingTimestamp,
    pickIncomingExpirationSeconds,
    resolveSendContextInfo
} from '@message/context-info'
import type { Proto } from '@proto'

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

const QUOTE_AND_TTL = {
    quotedMessageId: 'q-1',
    quotedParticipant: 'peer@lid',
    expirationSeconds: 86_400
} as const

test('applyContextInfo does not mutate the submessage it writes into', () => {
    const image = { url: 'u', mimetype: 'image/jpeg' }
    const input: Proto.IMessage = { imageMessage: image }
    const out = applyContextInfo(input, { quotedMessageId: 'q-1' })
    assert.notEqual(out, input)
    assert.notEqual(out.imageMessage, image)
    assert.deepEqual(image, { url: 'u', mimetype: 'image/jpeg' })
    assert.deepEqual(out.imageMessage, {
        url: 'u',
        mimetype: 'image/jpeg',
        contextInfo: { stanzaId: 'q-1' }
    })
})

test('applyContextInfo writes the quote and TTL into the sticker inside an audio sticker wrapper', () => {
    const sticker = { mimetype: 'image/webp', isLottie: true }
    const input: Proto.IMessage = { audioStickerMessage: { message: { stickerMessage: sticker } } }
    const out = applyContextInfo(input, QUOTE_AND_TTL)
    assert.deepEqual(out, {
        audioStickerMessage: {
            message: {
                stickerMessage: {
                    mimetype: 'image/webp',
                    isLottie: true,
                    contextInfo: { stanzaId: 'q-1', participant: 'peer@lid', expiration: 86_400 }
                }
            }
        }
    })
    assert.deepEqual(input, {
        audioStickerMessage: {
            message: { stickerMessage: { mimetype: 'image/webp', isLottie: true } }
        }
    })
    assert.equal('contextInfo' in sticker, false)
})

test('applyContextInfo writes into the sticker inside a lottie sticker wrapper', () => {
    const out = applyContextInfo(
        { lottieStickerMessage: { message: { stickerMessage: { isLottie: true } } } },
        { quotedMessageId: 'q-2', expirationSeconds: 604_800 }
    )
    assert.deepEqual(out, {
        lottieStickerMessage: {
            message: {
                stickerMessage: {
                    isLottie: true,
                    contextInfo: { stanzaId: 'q-2', expiration: 604_800 }
                }
            }
        }
    })
})

test('applyContextInfo goes through every kind of envelope, keeps its siblings and the readers see it', () => {
    const cases: readonly { readonly label: string; readonly input: Proto.IMessage }[] = [
        {
            label: 'ephemeralMessage',
            input: { ephemeralMessage: { message: { imageMessage: { url: 'u' } } } }
        },
        {
            label: 'viewOnceMessage',
            input: { viewOnceMessage: { message: { imageMessage: { url: 'u' } } } }
        },
        {
            label: 'viewOnceMessageV2',
            input: { viewOnceMessageV2: { message: { imageMessage: { url: 'u' } } } }
        },
        {
            label: 'documentWithCaptionMessage',
            input: { documentWithCaptionMessage: { message: { imageMessage: { url: 'u' } } } }
        },
        {
            label: 'groupMentionedMessage',
            input: { groupMentionedMessage: { message: { imageMessage: { url: 'u' } } } }
        },
        {
            label: 'deviceSentMessage',
            input: {
                deviceSentMessage: {
                    destinationJid: 'peer@lid',
                    message: { imageMessage: { url: 'u' } }
                }
            }
        },
        {
            label: 'botInvokeMessage',
            input: { botInvokeMessage: { message: { imageMessage: { url: 'u' } } } }
        },
        {
            label: 'groupStatusMessage',
            input: { groupStatusMessage: { message: { imageMessage: { url: 'u' } } } }
        },
        {
            label: 'groupStatusMessageV2',
            input: { groupStatusMessageV2: { message: { imageMessage: { url: 'u' } } } }
        },
        {
            label: 'botForwardedMessage',
            input: { botForwardedMessage: { message: { imageMessage: { url: 'u' } } } }
        }
    ]
    for (const { label, input } of cases) {
        const out = applyContextInfo(input, { quotedMessageId: 'q-3', expirationSeconds: 900 })
        const [envelopeKey] = Object.keys(input)
        const envelopeIn = (input as Record<string, Record<string, unknown>>)[envelopeKey]
        const envelopeOut = (out as Record<string, Record<string, unknown>>)[envelopeKey]
        assert.equal('contextInfo' in envelopeOut, false, label)
        assert.equal(envelopeOut.destinationJid, envelopeIn.destinationJid, label)
        assert.deepEqual(
            envelopeOut.message,
            { imageMessage: { url: 'u', contextInfo: { stanzaId: 'q-3', expiration: 900 } } },
            label
        )
        assert.deepEqual(envelopeIn.message, { imageMessage: { url: 'u' } }, label)
        assert.equal(pickIncomingExpirationSeconds(out), 900, label)
        assert.deepEqual(getContextInfo(out), { stanzaId: 'q-3', expiration: 900 }, label)
    }
})

test('applyContextInfo reaches a message wrapped in several envelopes', () => {
    const input: Proto.IMessage = {
        messageContextInfo: { deviceListMetadataVersion: 2 },
        ephemeralMessage: {
            message: { audioStickerMessage: { message: { stickerMessage: { isLottie: true } } } }
        }
    }
    const out = applyContextInfo(input, { quotedMessageId: 'q-4' })
    assert.deepEqual(out, {
        messageContextInfo: { deviceListMetadataVersion: 2 },
        ephemeralMessage: {
            message: {
                audioStickerMessage: {
                    message: {
                        stickerMessage: { isLottie: true, contextInfo: { stanzaId: 'q-4' } }
                    }
                }
            }
        }
    })
    assert.deepEqual(input.ephemeralMessage?.message?.audioStickerMessage?.message, {
        stickerMessage: { isLottie: true }
    })
})

test('applyContextInfo merges into the contextInfo already on a wrapped sticker', () => {
    const out = applyContextInfo(
        {
            lottieStickerMessage: {
                message: {
                    stickerMessage: { contextInfo: { mentionedJid: ['x@s.whatsapp.net'] } }
                }
            }
        },
        { quotedMessageId: 'q-5' }
    )
    assert.deepEqual(out.lottieStickerMessage?.message?.stickerMessage?.contextInfo, {
        mentionedJid: ['x@s.whatsapp.net'],
        stanzaId: 'q-5'
    })
})

test('applyContextInfo promotes a wrapped conversation to extendedTextMessage', () => {
    const input: Proto.IMessage = { ephemeralMessage: { message: { conversation: 'hello' } } }
    const out = applyContextInfo(input, { isSpoiler: true })
    assert.deepEqual(out, {
        ephemeralMessage: {
            message: { extendedTextMessage: { text: 'hello', contextInfo: { isSpoiler: true } } }
        }
    })
    assert.deepEqual(input, { ephemeralMessage: { message: { conversation: 'hello' } } })
})

test('applyContextInfo returns the same wrapped message when there is nothing to apply', () => {
    const input: Proto.IMessage = {
        audioStickerMessage: { message: { stickerMessage: {} } }
    }
    assert.equal(applyContextInfo(input, null), input)
    assert.equal(applyContextInfo(input, {}), input)
})

const WRAPPED_STICKER_CONTEXT: Proto.IContextInfo = {
    stanzaId: 'q-6',
    expiration: 3_600,
    ephemeralSettingTimestamp: 1_751_808_692
}

test('readers see the contextInfo of a sticker inside a lottie or audio wrapper', () => {
    const sticker = { stickerMessage: { contextInfo: WRAPPED_STICKER_CONTEXT } }
    for (const message of [
        { lottieStickerMessage: { message: sticker } },
        { audioStickerMessage: { message: sticker } },
        { ephemeralMessage: { message: { lottieStickerMessage: { message: sticker } } } },
        { ephemeralMessage: { message: { audioStickerMessage: { message: sticker } } } }
    ] satisfies Proto.IMessage[]) {
        const label = Object.keys(message)[0]
        assert.equal(pickIncomingExpirationSeconds(message), 3_600, label)
        assert.equal(pickIncomingEphemeralSettingTimestamp(message), 1_751_808_692, label)
        assert.deepEqual(
            getContextInfo(message),
            { stanzaId: 'q-6', expiration: 3_600, ephemeralSettingTimestamp: 1_751_808_692 },
            label
        )
    }
})

test('readers look inside view-once and device-sent envelopes too', () => {
    const inner = { imageMessage: { contextInfo: { expiration: 900, stanzaId: 'q-7' } } }
    for (const message of [
        { viewOnceMessage: { message: inner } },
        { deviceSentMessage: { destinationJid: 'peer@lid', message: inner } }
    ] satisfies Proto.IMessage[]) {
        assert.equal(pickIncomingExpirationSeconds(message), 900)
        assert.deepEqual(getContextInfo(message), { expiration: 900, stanzaId: 'q-7' })
    }
})

test('readers return nothing for a wrapped sticker without contextInfo', () => {
    const message: Proto.IMessage = {
        audioStickerMessage: { message: { stickerMessage: { isLottie: true } } }
    }
    assert.equal(pickIncomingExpirationSeconds(message), undefined)
    assert.equal(pickIncomingEphemeralSettingTimestamp(message), undefined)
    assert.equal(getContextInfo(message), null)
    assert.equal(getContextInfo({}), null)
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

test('buildContextInfoProto maps ephemeralSettingTimestamp to proto field 26', () => {
    const proto = buildContextInfoProto({
        expirationSeconds: 86_400,
        ephemeralSettingTimestamp: 1_751_808_692
    })
    assert.equal(proto.expiration, 86_400)
    assert.equal(proto.ephemeralSettingTimestamp, 1_751_808_692)
})

test('buildContextInfoProto omits ephemeralSettingTimestamp when absent', () => {
    const proto = buildContextInfoProto({ expirationSeconds: 86_400 })
    assert.equal(proto.expiration, 86_400)
    assert.equal(proto.ephemeralSettingTimestamp, undefined)
})

test('buildContextInfoProto maps disappearingModeTrigger to proto field 32', () => {
    const proto = buildContextInfoProto({
        expirationSeconds: 86_400,
        ephemeralSettingTimestamp: 1_751_808_692,
        disappearingModeTrigger: 1
    })
    assert.deepEqual(proto.disappearingMode, { trigger: 1 })
})

test('buildContextInfoProto omits disappearingMode when trigger absent', () => {
    const proto = buildContextInfoProto({ expirationSeconds: 86_400 })
    assert.equal(proto.disappearingMode, undefined)
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
