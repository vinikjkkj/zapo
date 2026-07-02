import assert from 'node:assert/strict'
import test from 'node:test'

import { WaShortcakeFlow } from '@auth/pairing/WaShortcakeFlow'
import type { WaAuthCredentials } from '@auth/types'
import { aesGcmDecrypt, hkdf, randomBytesAsync, sha256 } from '@crypto'
import { X25519 } from '@crypto/curves/X25519'
import { createNoopLogger } from '@infra/log/types'
import { proto } from '@proto'
import type { BinaryNode } from '@transport/types'
import { TEXT_DECODER, TEXT_ENCODER } from '@util/bytes'

const REAL_OPTIONS_B64 =
    'eyJjaGFsbGVuZ2UiOiJGQzZ2Y0pnUC1Pdl82NnlmV2dvaDF3OG1fdHJSOTJCbkZEaGctZTVKRXdrIiwidGltZW91dCI6NjAwMDAwLCJycElkIjoid2hhdHNhcHAuY29tIiwiYWxsb3dDcmVkZW50aWFscyI6W10sInVzZXJWZXJpZmljYXRpb24iOiJyZXF1aXJlZCIsImV4dGVuc2lvbnMiOnsidXZtIjp0cnVlfX0='
const REAL_OPTIONS = new Uint8Array(Buffer.from(REAL_OPTIONS_B64, 'base64'))

const fakeCredentials = {
    noiseKeyPair: { pubKey: new Uint8Array(32).fill(7), privKey: new Uint8Array(32) },
    registrationInfo: {
        identityKeyPair: { pubKey: new Uint8Array(32).fill(8), privKey: new Uint8Array(32) }
    },
    advSecretKey: new Uint8Array(32).fill(9)
} as unknown as WaAuthCredentials

function iqResult(content?: BinaryNode['content']): BinaryNode {
    return { tag: 'iq', attrs: { type: 'result', id: 'x' }, content }
}

function firstChildTag(node: BinaryNode): string | undefined {
    return Array.isArray(node.content) ? node.content[0]?.tag : undefined
}

function leaf(node: BinaryNode, tag: string): Uint8Array {
    const child = (node.content as BinaryNode[]).find((c) => c.tag === tag)
    return child!.content as Uint8Array
}

test('shortcake flow completes the handshake driven by the real server notification', async () => {
    const sent: BinaryNode[] = []
    const acks: BinaryNode[] = []
    let capturedOptions: Uint8Array | null = null
    let prologue: BinaryNode | null = null
    let companionNonce: Uint8Array | null = null
    let envelope: Uint8Array | null = null

    const socket = {
        sendNode: async (node: BinaryNode) => {
            if (node.tag === 'ack') acks.push(node)
        },
        query: async (node: BinaryNode): Promise<BinaryNode> => {
            sent.push(node)
            switch (firstChildTag(node)) {
                case 'passkey_request_options':
                    throw new Error('should not fetch options: they were embedded')
                case 'ref':
                    return iqResult([
                        { tag: 'ref', attrs: {}, content: TEXT_ENCODER.encode('the-ref') }
                    ])
                case 'passkey_prologue':
                    prologue = (node.content as BinaryNode[])[0]
                    return iqResult()
                case 'companion_nonce':
                    companionNonce = (node.content as BinaryNode[])[0].content as Uint8Array
                    return iqResult()
                case 'encrypted_pairing_request':
                    envelope = (node.content as BinaryNode[])[0].content as Uint8Array
                    return iqResult()
                default:
                    return iqResult()
            }
        }
    }

    let emittedCode: string | null = null
    let creds = fakeCredentials
    const flow = new WaShortcakeFlow({
        logger: createNoopLogger(),
        socket,
        deviceType: proto.DeviceProps.PlatformType.CHROME,
        signAssertion: async (options) => {
            capturedOptions = options
            return {
                credentialId: TEXT_ENCODER.encode('cred-id'),
                webauthnAssertion: TEXT_ENCODER.encode('assertion-json')
            }
        },
        auth: {
            getCredentials: () => creds,
            updateCredentials: async (c) => {
                creds = c
            }
        },
        callbacks: { emitVerificationCode: (code) => (emittedCode = code) }
    })

    const prologueRequest: BinaryNode = {
        tag: 'notification',
        attrs: { from: 's.whatsapp.net', type: 'passkey_prologue_request', id: '169361451' },
        content: [{ tag: 'passkey_request_options', attrs: {}, content: REAL_OPTIONS }]
    }
    assert.equal(await flow.handleIncomingNotification(prologueRequest), true)

    assert.ok(capturedOptions)
    const parsedOptions = JSON.parse(TEXT_DECODER.decode(capturedOptions))
    assert.equal(parsedOptions.rpId, 'whatsapp.com')
    assert.deepEqual(parsedOptions.allowCredentials, [])
    assert.equal(acks.length, 1)
    assert.ok(prologue, 'passkey_prologue IQ sent')
    const prologueNode: BinaryNode = prologue
    assert.deepEqual(leaf(prologueNode, 'credential_id'), TEXT_ENCODER.encode('cred-id'))

    const handoffProof = (prologueNode.content as BinaryNode[]).find(
        (c) => c.tag === 'pairing_handoff_proof'
    )
    assert.ok(handoffProof, 'pairing_handoff_proof attached')
    assert.notDeepEqual(new Uint8Array(creds.advSecretKey), new Uint8Array(32).fill(9))

    const prologuePayload = proto.ProloguePayload.decode(leaf(prologue, 'prologue_payload'))
    const companionIdentity = proto.CompanionEphemeralIdentity.decode(
        prologuePayload.companionEphemeralIdentity!
    )
    const companionPub = new Uint8Array(companionIdentity.publicKey!)
    assert.equal(companionIdentity.ref, 'the-ref')

    const primaryKp = await X25519.generateKeyPair()
    const primaryNonce = await randomBytesAsync(32)
    const primaryBytes = proto.PrimaryEphemeralIdentity.encode({
        publicKey: primaryKp.pubKey,
        nonce: primaryNonce
    }).finish()

    const continuation: BinaryNode = {
        tag: 'notification',
        attrs: { from: 's.whatsapp.net', type: 'crsc_continuation', id: '2' },
        content: [{ tag: 'primary_ephemeral_identity', attrs: {}, content: primaryBytes }]
    }
    assert.equal(await flow.handleIncomingNotification(continuation), true)

    assert.ok(companionNonce, 'companion_nonce IQ sent')
    assert.ok(emittedCode, 'verification code emitted')
    assert.equal(emittedCode, flow.getVerificationCode())

    const digest = sha256(new Uint8Array([...companionNonce, ...primaryKp.pubKey]))
    const codeBytes = new Uint8Array(5)
    for (let i = 0; i < 5; i += 1) codeBytes[i] = primaryNonce[i] ^ digest[i]
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTVWXYZ'
    let bits = 0
    let val = 0
    let primaryCode = ''
    for (const b of codeBytes) {
        val = (val << 8) | b
        bits += 8
        while (bits >= 5) {
            primaryCode += ALPHABET[(val >>> (bits - 5)) & 31]
            bits -= 5
        }
    }
    if (bits > 0) primaryCode += ALPHABET[(val << (5 - bits)) & 31]
    assert.equal(emittedCode, primaryCode)

    assert.ok(envelope, 'encrypted_pairing_request IQ sent')
    const env = proto.EncryptedPairingRequest.decode(envelope)
    const sharedFromPrimary = await X25519.scalarMult(primaryKp.privKey, companionPub)
    const salt = TEXT_ENCODER.encode(
        `Companion Pairing ${String(proto.DeviceProps.PlatformType.CHROME)} with ref the-ref`
    )
    const key = hkdf(
        sharedFromPrimary,
        salt,
        TEXT_ENCODER.encode('Pairing Information Encryption Key'),
        32
    )
    const decrypted = aesGcmDecrypt(
        key,
        new Uint8Array(env.iv!),
        new Uint8Array(env.encryptedPayload!)
    )
    const pairingRequest = proto.PairingRequest.decode(decrypted)
    assert.deepEqual(new Uint8Array(pairingRequest.companionPublicKey!), new Uint8Array(32).fill(7))
    assert.deepEqual(
        new Uint8Array(pairingRequest.companionIdentityKey!),
        new Uint8Array(32).fill(8)
    )
    assert.deepEqual(new Uint8Array(pairingRequest.advSecret!), new Uint8Array(creds.advSecretKey))
})
