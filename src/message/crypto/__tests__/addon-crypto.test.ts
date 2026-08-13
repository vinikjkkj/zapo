import assert from 'node:assert/strict'
import test from 'node:test'

import {
    buildAddonAdditionalData,
    buildAddonSenderPairs,
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

test('resolveAddonParentSenderFromKey reads the author the sender addressed', () => {
    assert.equal(
        resolveAddonParentSenderFromKey(
            { remoteJid: '142971525722223@lid', fromMe: false, id: 'POLL1' },
            false
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
            true
        ),
        '551100000000@s.whatsapp.net'
    )
    assert.equal(
        resolveAddonParentSenderFromKey(
            { remoteJid: 'chat@lid', fromMe: true, id: 'POLL1' },
            false
        ),
        null
    )
    assert.equal(
        resolveAddonParentSenderFromKey(
            { remoteJid: 'not-a-jid', fromMe: false, id: 'POLL1' },
            false
        ),
        null
    )
    assert.equal(
        resolveAddonParentSenderFromKey(
            {
                remoteJid: '120363@g.us',
                fromMe: false,
                id: 'POLL1',
                participant: '@s.whatsapp.net'
            },
            true
        ),
        null
    )
})

test('collectUniqueUserJids strips devices and drops duplicates', () => {
    const collected = collectUniqueUserJids(
        '56410217926709:49@lid',
        '56410217926709@lid',
        '5519981790250@s.whatsapp.net',
        '',
        null,
        '5519981790250:1@s.whatsapp.net'
    )
    assert.deepEqual(collected, ['56410217926709@lid', '5519981790250@s.whatsapp.net'])
    if (false) {
        // @ts-expect-error Candidate lists are immutable to callers.
        collected.push('5511777777777@s.whatsapp.net')
    }
})

test('buildAddonSenderPairs orders LID, PN, and original pairs without mixed or group JIDs', () => {
    assert.deepEqual(
        buildAddonSenderPairs({
            parentCandidates: ['5511999999999@s.whatsapp.net', '142971525722223@lid'],
            modificationCandidates: [
                '5511888888888@s.whatsapp.net',
                '120363000000000000@g.us',
                '56410217926709@lid'
            ]
        }),
        [
            {
                parentMsgOriginalSender: '142971525722223@lid',
                modificationSender: '56410217926709@lid'
            },
            {
                parentMsgOriginalSender: '5511999999999@s.whatsapp.net',
                modificationSender: '5511888888888@s.whatsapp.net'
            }
        ]
    )
})

test('a vote synced from our own device pairs this account with itself', () => {
    const us = '142971525722223@lid'
    const peer = '56410217926709@lid'
    const peerPn = '5511888888888@s.whatsapp.net'
    const targetMessageKey = { remoteJid: peer, fromMe: true, id: 'POLL1' }

    assert.equal(resolveAddonParentSenderFromKey(targetMessageKey, false), null)

    const parentCandidates = collectUniqueUserJids(
        resolveAddonParentSenderFromKey(targetMessageKey, false),
        us
    )
    const modificationCandidates = collectUniqueUserJids(us, peer, peerPn)
    assert.deepEqual(buildAddonSenderPairs({ parentCandidates, modificationCandidates }), [
        { parentMsgOriginalSender: us, modificationSender: us }
    ])
})

test('buildAddonSenderPairs keeps a sender outside lid/pn on the as-received rung', () => {
    const hostedSender = '6116570308623@hosted.lid'
    assert.deepEqual(
        buildAddonSenderPairs({
            parentCandidates: ['142971525722223@lid'],
            modificationCandidates: ['120363000000000000@g.us', hostedSender]
        }),
        [
            {
                parentMsgOriginalSender: '142971525722223@lid',
                modificationSender: hostedSender
            }
        ]
    )
})

test('decryptAddonPayloadWithSenderFallback walks past a rung that fails before the cipher', async () => {
    const messageSecret = new Uint8Array(32).fill(13)
    const stanzaId = '3EB022B08C137DCAE1E403'
    const parentLid = '142971525722223@lid'
    const voterLid = '56410217926709@lid'
    const plaintext = proto.Message.PollVoteMessage.encode({
        selectedOptions: [new Uint8Array(32).fill(7)]
    }).finish()
    const iv = new Uint8Array(12).fill(8)

    const ciphertext = await encryptAddonPayload({
        messageSecret,
        stanzaId,
        parentMsgOriginalSender: parentLid,
        modificationSender: voterLid,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE,
        payload: plaintext,
        iv
    })

    const recovered = await decryptAddonPayloadWithSenderFallback({
        messageSecret,
        stanzaId,
        senderPairs: [
            {
                parentMsgOriginalSender: parentLid,
                modificationSender: '   '
            },
            {
                parentMsgOriginalSender: parentLid,
                modificationSender: voterLid
            }
        ],
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE,
        ciphertext,
        iv
    })
    assert.deepEqual(Uint8Array.from(recovered), Uint8Array.from(plaintext))
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
        senderPairs: [
            {
                parentMsgOriginalSender: parentPn,
                modificationSender: voterLid
            },
            {
                parentMsgOriginalSender: parentLid,
                modificationSender: voterLid
            }
        ],
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE,
        ciphertext,
        iv
    })
    assert.deepEqual(Uint8Array.from(recovered), Uint8Array.from(plaintext))
})

test('decryptAddonPayloadWithSenderFallback retries paired modification senders without a cross product', async () => {
    const messageSecret = new Uint8Array(32).fill(12)
    const stanzaId = '3EB022B08C137DCAE1E402'
    const parentLid = '142971525722223@lid'
    const parentPn = '5511999999999@s.whatsapp.net'
    const voterLid = '56410217926709@lid'
    const voterPn = '5511888888888@s.whatsapp.net'
    const plaintext = proto.Message.PollVoteMessage.encode({
        selectedOptions: [new Uint8Array(32).fill(4)]
    }).finish()
    const iv = new Uint8Array(12).fill(6)

    const ciphertext = await encryptAddonPayload({
        messageSecret,
        stanzaId,
        parentMsgOriginalSender: parentLid,
        modificationSender: voterLid,
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE,
        payload: plaintext,
        iv
    })

    await assert.rejects(() =>
        decryptAddonPayloadWithSenderFallback({
            messageSecret,
            stanzaId,
            senderPairs: [
                {
                    parentMsgOriginalSender: parentPn,
                    modificationSender: voterPn
                },
                {
                    parentMsgOriginalSender: parentLid,
                    modificationSender: voterPn
                }
            ],
            modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE,
            ciphertext,
            iv
        })
    )

    const recovered = await decryptAddonPayloadWithSenderFallback({
        messageSecret,
        stanzaId,
        senderPairs: [
            {
                parentMsgOriginalSender: parentPn,
                modificationSender: voterPn
            },
            {
                parentMsgOriginalSender: parentLid,
                modificationSender: voterLid
            }
        ],
        modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE,
        ciphertext,
        iv
    })
    assert.deepEqual(Uint8Array.from(recovered), Uint8Array.from(plaintext))
})
