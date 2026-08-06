import assert from 'node:assert/strict'
import test from 'node:test'

import {
    buildAddonAdditionalData,
    collectUniqueUserJids,
    decodeAddonPlaintext,
    decryptAddonPayload,
    decryptAddonPayloadWithSenderFallback,
    encryptAddonPayload,
    identifyEncryptedAddon,
    resolveAddonParentSenderFromKey
} from '@message/crypto/addon-crypto'
import {
    createUseCaseSecret,
    WA_USE_CASE_SECRET_MODIFICATION_TYPES
} from '@message/crypto/use-case-secret'
import { proto, type Proto } from '@proto'

test('addon crypto helpers encrypt/decrypt payloads and validate aad', async () => {
    const context = {
        messageSecret: new Uint8Array(32).fill(9),
        stanzaId: 'msg-1',
        parentMsgOriginalSender: '551100000000@s.whatsapp.net',
        modificationSender: '551188888888@s.whatsapp.net',
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE
    } as const
    const plaintext = new Uint8Array([1, 2, 3, 4, 5])
    const iv = new Uint8Array(12).fill(7)
    const ciphertext = await encryptAddonPayload({
        ...context,
        payload: plaintext,
        iv
    })
    const decrypted = await decryptAddonPayload({
        ...context,
        ciphertext,
        iv
    })
    assert.deepEqual(decrypted, plaintext)

    await assert.rejects(
        () =>
            decryptAddonPayload({
                ...context,
                ciphertext,
                iv,
                additionalData: new Uint8Array([1, 2, 3])
            }),
        /The operation failed|decrypt|unable to authenticate/i
    )

    await assert.rejects(
        () =>
            encryptAddonPayload({
                ...context,
                payload: plaintext,
                iv: new Uint8Array(8)
            }),
        /addon iv must be 12 bytes/
    )
})

test('use-case secret derivation is deterministic and use-case specific', async () => {
    const input = {
        messageSecret: new Uint8Array(32).fill(5),
        stanzaId: 'msg-1',
        parentMsgOriginalSender: '551100000000@s.whatsapp.net',
        modificationSender: '551188888888@s.whatsapp.net'
    } as const
    const reportLeft = await createUseCaseSecret({
        ...input,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.REPORT_TOKEN
    })
    const reportRight = await createUseCaseSecret({
        ...input,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.REPORT_TOKEN
    })
    const pollVote = await createUseCaseSecret({
        ...input,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE
    })
    assert.equal(reportLeft.byteLength, 32)
    assert.deepEqual(reportLeft, reportRight)
    assert.notDeepEqual(reportLeft, pollVote)
})

test('addon AAD includes salt id and author jid', () => {
    const aad = buildAddonAdditionalData('CHUNK-1', '551100000000@s.whatsapp.net')
    assert.ok(aad.byteLength > 0)
    const aad2 = buildAddonAdditionalData('CHUNK-1', '551100000000@s.whatsapp.net')
    assert.deepEqual(aad, aad2)
    const aad3 = buildAddonAdditionalData('CHUNK-2', '551100000000@s.whatsapp.net')
    assert.notDeepEqual(aad, aad3)
})

const SECRET_ENC_CASES = [
    {
        label: 'message_edit',
        kind: 'message_edit' as const,
        secretEncType: proto.Message.SecretEncryptedMessage.SecretEncType.MESSAGE_EDIT,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.MESSAGE_EDIT,
        plaintextMessage: {
            protocolMessage: {
                type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                editedMessage: { conversation: 'edited body' }
            }
        }
    },
    {
        label: 'event_edit',
        kind: 'event_edit' as const,
        secretEncType: proto.Message.SecretEncryptedMessage.SecretEncType.EVENT_EDIT,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.EVENT_EDIT_ENCRYPTED,
        plaintextMessage: {
            protocolMessage: {
                type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                editedMessage: { eventMessage: { name: 'renamed event' } }
            }
        }
    },
    {
        label: 'poll_edit',
        kind: 'poll_edit' as const,
        secretEncType: proto.Message.SecretEncryptedMessage.SecretEncType.POLL_EDIT,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_EDIT_ENCRYPTED,
        plaintextMessage: {
            protocolMessage: {
                type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                editedMessage: { pollCreationMessage: { name: 'renamed poll' } }
            }
        }
    },
    {
        label: 'poll_add_option',
        kind: 'poll_add_option' as const,
        secretEncType: proto.Message.SecretEncryptedMessage.SecretEncType.POLL_ADD_OPTION,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_ADD_OPTION,
        plaintextMessage: {
            pollAddOptionMessage: {
                pollCreationMessageKey: {
                    remoteJid: '120363000000000000@g.us',
                    fromMe: false,
                    id: 'PARENT-1'
                },
                addOption: { optionName: 'new option' }
            }
        }
    }
] as const

for (const tc of SECRET_ENC_CASES) {
    test(`secretEncryptedMessage round-trip: ${tc.label}`, async () => {
        const messageSecret = new Uint8Array(32).fill(11)
        const iv = new Uint8Array(12).fill(3)
        const targetMessageKey = {
            remoteJid: '551100000000@s.whatsapp.net',
            fromMe: false,
            id: 'PARENT-1'
        }
        const ctx = {
            messageSecret,
            stanzaId: targetMessageKey.id,
            parentMsgOriginalSender: '551100000000@s.whatsapp.net',
            modificationSender: '551188888888@s.whatsapp.net',
            modificationType: tc.modificationType
        }
        const plaintext = proto.Message.encode(tc.plaintextMessage).finish()
        const encPayload = await encryptAddonPayload({ ...ctx, payload: plaintext, iv })

        const wrapper: Proto.IMessage = {
            secretEncryptedMessage: {
                targetMessageKey,
                encPayload,
                encIv: iv,
                secretEncType: tc.secretEncType
            }
        }

        const identified = identifyEncryptedAddon(wrapper)
        assert.ok(identified, 'expected secretEncryptedMessage to be identified')
        assert.equal(identified.kind, tc.kind)
        assert.equal(identified.modificationType, tc.modificationType)
        assert.equal(identified.targetMessageKey.id, targetMessageKey.id)

        const decrypted = await decryptAddonPayload({
            messageSecret,
            stanzaId: targetMessageKey.id,
            parentMsgOriginalSender: ctx.parentMsgOriginalSender,
            modificationSender: ctx.modificationSender,
            modificationType: identified.modificationType,
            ciphertext: identified.encPayload,
            iv: identified.encIv
        })
        const decoded = decodeAddonPlaintext(identified.kind, decrypted)
        assert.equal(decoded.kind, tc.kind)
        assert.ok('message' in decoded, 'expected decoded payload to expose message')
        if (tc.kind === 'poll_add_option') {
            assert.equal(decoded.message.pollAddOptionMessage?.addOption?.optionName, 'new option')
        } else {
            assert.ok(decoded.message.protocolMessage?.editedMessage)
        }
    })
}

test('secretEncryptedMessage with MESSAGE_SCHEDULE or UNKNOWN is not identified', () => {
    const targetMessageKey = {
        remoteJid: '551100000000@s.whatsapp.net',
        fromMe: false,
        id: 'PARENT-2'
    }
    for (const secretEncType of [
        proto.Message.SecretEncryptedMessage.SecretEncType.MESSAGE_SCHEDULE,
        proto.Message.SecretEncryptedMessage.SecretEncType.UNKNOWN
    ]) {
        const wrapper: Proto.IMessage = {
            secretEncryptedMessage: {
                targetMessageKey,
                encPayload: new Uint8Array(16),
                encIv: new Uint8Array(12),
                secretEncType
            }
        }
        assert.equal(identifyEncryptedAddon(wrapper), null)
    }
})

test('secretEncryptedMessage with non-12-byte iv is not identified', () => {
    const wrapper: Proto.IMessage = {
        secretEncryptedMessage: {
            targetMessageKey: {
                remoteJid: '551100000000@s.whatsapp.net',
                fromMe: false,
                id: 'PARENT-3'
            },
            encPayload: new Uint8Array(16),
            encIv: new Uint8Array(8),
            secretEncType: proto.Message.SecretEncryptedMessage.SecretEncType.MESSAGE_EDIT
        }
    }
    assert.equal(identifyEncryptedAddon(wrapper), null)
})

test('resolveAddonParentSenderFromKey matches whatsmeow getOrigSenderFromKey', () => {
    assert.equal(
        resolveAddonParentSenderFromKey(
            { remoteJid: '142971525722223@lid', fromMe: false, id: 'POLL1' },
            false,
            '56410217926709@lid'
        ),
        '142971525722223@lid'
    )
    assert.equal(
        resolveAddonParentSenderFromKey(
            {
                remoteJid: '120363@g.us',
                fromMe: false,
                id: 'POLL1',
                participant: '551100000000:3@s.whatsapp.net'
            },
            true,
            '56410217926709@lid'
        ),
        '551100000000@s.whatsapp.net'
    )
    assert.equal(
        resolveAddonParentSenderFromKey(
            { remoteJid: 'chat@lid', fromMe: true, id: 'POLL1' },
            false,
            '56410217926709:49@lid'
        ),
        '56410217926709@lid'
    )
})

test('collectUniqueUserJids strips devices and drops duplicates', () => {
    assert.deepEqual(
        collectUniqueUserJids(
            '56410217926709:49@lid',
            '56410217926709@lid',
            '5519981790250@s.whatsapp.net',
            '',
            null,
            '5519981790250:1@s.whatsapp.net'
        ),
        ['56410217926709@lid', '5519981790250@s.whatsapp.net']
    )
})

test('decryptAddonPayloadWithSenderFallback recovers when stored parent is PN but vote used LID', async () => {
    const messageSecret = new Uint8Array(32).fill(11)
    const stanzaId = '3EB022B08C137DCAE1E401'
    const parentLid = '142971525722223@lid'
    const parentPn = '5511999999999@s.whatsapp.net'
    const voterLid = '56410217926709@lid'
    const plaintext = proto.Message.PollVoteMessage.encode({
        selectedOptions: [new Uint8Array(32).fill(3)]
    }).finish()
    const iv = new Uint8Array(12).fill(5)

    const ciphertext = await encryptAddonPayload({
        messageSecret,
        stanzaId,
        parentMsgOriginalSender: parentLid,
        modificationSender: voterLid,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE,
        payload: plaintext,
        iv
    })

    await assert.rejects(
        () =>
            decryptAddonPayload({
                messageSecret,
                stanzaId,
                parentMsgOriginalSender: parentPn,
                modificationSender: voterLid,
                modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE,
                ciphertext,
                iv
            }),
        /authenticate|operation failed|decrypt/i
    )

    const recovered = await decryptAddonPayloadWithSenderFallback({
        messageSecret,
        stanzaId,
        parentMsgOriginalSenderCandidates: [parentPn, parentLid],
        modificationSenderCandidates: [voterLid],
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE,
        ciphertext,
        iv
    })
    assert.deepEqual(Uint8Array.from(recovered), Uint8Array.from(plaintext))
})
