/**
 * Layer 1 — binary stanza codec wrapper.
 *
 * Re-exports the bit-exact WhatsApp WAP token encoder/decoder from zapo-js.
 * This file is the only sanctioned import path for binary node serialization
 * inside the fake server. See AGENTS.md §3 for the layering rule.
 */

export {
    decodeBinaryNode,
    decodeBinaryNodeStanza,
    encodeBinaryNode,
    encodeBinaryNodeStanza,
    verifyNoiseCertificateChain
} from 'zapo-js/transport'
export type { BinaryNode, WaNoiseRootCa } from 'zapo-js/transport'
