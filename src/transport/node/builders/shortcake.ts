import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS, WA_XMLNS } from '@protocol/constants'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

/**
 * IQ builders for the WhatsApp "Shortcake" companion-linking protocol
 * (`xmlns="md"`). Wire shapes mirror the official client's
 * `WASmaxOutMd…Request` builders. The stanza `id` is assigned by the socket
 * query layer, matching the other pairing builders.
 */

function mdIq(
    type: typeof WA_IQ_TYPES.GET | typeof WA_IQ_TYPES.SET,
    content: BinaryNode['content']
): BinaryNode {
    return buildIqNode(type, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.MD, content)
}

/** `<iq type="get" xmlns="md"><passkey_request_options/></iq>` */
export function buildGetPasskeyRequestOptionsRequestNode(): BinaryNode {
    return mdIq(WA_IQ_TYPES.GET, [
        { tag: WA_NODE_TAGS.PASSKEY_REQUEST_OPTIONS, attrs: {}, content: undefined }
    ])
}

/** `<iq type="get" xmlns="md"><ref/></iq>` */
export function buildShortcakeGetRefRequestNode(): BinaryNode {
    return mdIq(WA_IQ_TYPES.GET, [{ tag: WA_NODE_TAGS.REF, attrs: {}, content: undefined }])
}

/**
 * `<iq type="set" xmlns="md"><passkey_prologue><credential_id/><webauthn_assertion/>`
 * `<prologue_payload/>[<pairing_handoff_proof/>]</passkey_prologue></iq>`
 */
export function buildSetPasskeyPrologueRequestNode(args: {
    readonly credentialId: Uint8Array
    readonly webauthnAssertion: Uint8Array
    readonly prologuePayload: Uint8Array
    readonly pairingHandoffProof?: Uint8Array
}): BinaryNode {
    const children: BinaryNode[] = [
        { tag: 'credential_id', attrs: {}, content: args.credentialId },
        { tag: 'webauthn_assertion', attrs: {}, content: args.webauthnAssertion },
        { tag: 'prologue_payload', attrs: {}, content: args.prologuePayload }
    ]
    if (args.pairingHandoffProof) {
        children.push({
            tag: 'pairing_handoff_proof',
            attrs: {},
            content: args.pairingHandoffProof
        })
    }
    return mdIq(WA_IQ_TYPES.SET, [{ tag: 'passkey_prologue', attrs: {}, content: children }])
}

/** `<iq type="set" xmlns="md"><companion_nonce/></iq>` */
export function buildSetCompanionNonceRequestNode(companionNonce: Uint8Array): BinaryNode {
    return mdIq(WA_IQ_TYPES.SET, [{ tag: 'companion_nonce', attrs: {}, content: companionNonce }])
}

/** `<iq type="set" xmlns="md"><encrypted_pairing_request/></iq>` */
export function buildSetEncryptedPairingRequestRequestNode(
    encryptedPairingRequest: Uint8Array
): BinaryNode {
    return mdIq(WA_IQ_TYPES.SET, [
        { tag: 'encrypted_pairing_request', attrs: {}, content: encryptedPairingRequest }
    ])
}
