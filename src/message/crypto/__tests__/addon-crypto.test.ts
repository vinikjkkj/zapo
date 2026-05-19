import assert from 'node:assert/strict'
import test from 'node:test'

import {
    buildAddonAdditionalData,
    decryptAddonPayload,
    encryptAddonPayload
} from '@message/crypto/addon-crypto'
import {
    createUseCaseSecret,
    WA_USE_CASE_SECRET_MODIFICATION_TYPES
} from '@message/crypto/use-case-secret'

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
