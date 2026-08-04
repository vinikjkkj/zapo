import assert from 'node:assert/strict'
import test from 'node:test'

import { buildReportingTokenArtifacts } from '@message/crypto/reporting-token'
import { unpadPkcs7, writeRandomPadMax16 } from '@message/encode/padding'
import { proto, type Proto } from '@proto'
import { bytesToHex } from '@util/bytes'

const message: Proto.IMessage = {
    extendedTextMessage: {
        text: 'mensagem de teste com reporting token',
        contextInfo: {
            mentionedJid: ['5511999998888@s.whatsapp.net']
        }
    },
    messageContextInfo: {
        messageSecret: new Uint8Array(32).fill(7)
    }
}

const input = {
    message,
    stanzaId: '3EB0AABBCCDD',
    senderUserJid: '5511888887777@s.whatsapp.net',
    remoteJid: '5511999998888@s.whatsapp.net'
}

test('reporting token from caller-supplied bytes matches the self-encoded path', async () => {
    const fromMessage = await buildReportingTokenArtifacts(input)
    assert.ok(fromMessage)

    const messageBytes = proto.Message.encode(message).finish()
    const fromBytes = await buildReportingTokenArtifacts({ ...input, messageBytes })
    assert.ok(fromBytes)

    assert.equal(bytesToHex(fromBytes.reportingToken), bytesToHex(fromMessage.reportingToken))
    assert.equal(
        bytesToHex(fromBytes.reportingTokenContent),
        bytesToHex(fromMessage.reportingTokenContent)
    )
    assert.equal(fromBytes.version, fromMessage.version)
})

test('unpadded envelope plaintext yields the same reporting token as a fresh encode', async () => {
    const padded = await writeRandomPadMax16(proto.Message.encode(message).finish())
    const fromEnvelope = await buildReportingTokenArtifacts({
        ...input,
        messageBytes: unpadPkcs7(padded)
    })
    const fromMessage = await buildReportingTokenArtifacts(input)
    assert.ok(fromEnvelope)
    assert.ok(fromMessage)
    assert.equal(bytesToHex(fromEnvelope.reportingToken), bytesToHex(fromMessage.reportingToken))
})
