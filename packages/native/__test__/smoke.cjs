const { xeddsaSign, xeddsaVerify } = require('../binding.js')
const assert = require('node:assert')
const { randomBytes, createHash } = require('node:crypto')

if (typeof xeddsaSign !== 'function' || typeof xeddsaVerify !== 'function') {
    console.error('native binding NOT loaded')
    process.exit(2)
}
console.log('native binding loaded ok')

// Generate a curve25519 private key (random 32 bytes; will be clamped inside).
const priv = randomBytes(32)

// Derive its X25519 public key by Montgomery scalar mult of basepoint.
// Easier: use diffieHellman with a peer key set to basepoint? Skip — just test
// sign/verify round trip without an external public key.
// Instead, use the package itself: we sign with priv, then derive the curve
// public from the same priv using node:crypto x25519 keypair from raw bytes.
const { createPrivateKey } = require('node:crypto')
const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex')
const keyObj = createPrivateKey({
    key: Buffer.concat([X25519_PKCS8_PREFIX, priv]),
    format: 'der',
    type: 'pkcs8'
})
const jwk = keyObj.export({ format: 'jwk' })
const pub = Buffer.from(jwk.x, 'base64url')

const message = Buffer.from('hello xeddsa from native')
const sig = xeddsaSign(priv, message)
assert.equal(sig.length, 64, 'sig length')
console.log('sig length:', sig.length)

const ok = xeddsaVerify(pub, message, sig)
assert.equal(ok, true, 'native verify own signature')
console.log('verify ok:', ok)

// Tamper one byte and ensure verify fails
const tampered = Buffer.from(sig)
tampered[5] ^= 0x01
const okTamp = xeddsaVerify(pub, message, tampered)
assert.equal(okTamp, false, 'tampered sig must fail')
console.log('tamper rejected:', !okTamp)

console.log('smoke OK')
