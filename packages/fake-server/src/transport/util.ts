/**
 * Layer 1 – byte/encoding primitives wrapper.
 *
 * Re-exports bit-exact byte helpers from zapo-js so Layer 2/3 of the fake
 * server can use them without importing zapo-js directly.
 */

export { bytesToBase64, bytesToBase64UrlSafe, bytesToHex, decodeBase64Url } from 'zapo-js/util'

export const TEXT_ENCODER = new TextEncoder()
