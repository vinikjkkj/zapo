// Cross-check: native sign / JS verify  AND  JS sign / native verify.
// Run from repo root via tsx so @crypto path alias resolves.
const native = require('@zapo-js/native')
const assert = require('node:assert')
const { randomBytes, createPrivateKey } = require('node:crypto')

if (typeof native.xeddsaSign !== 'function' || typeof native.xeddsaVerify !== 'function') {
    console.error('native binding not loaded')
    process.exit(2)
}

async function main() {
    const { xeddsaSign: jsSign, xeddsaVerify: jsVerify } = await import('../../../src/crypto/core/xeddsa.ts')

    const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex')

    let okPairs = 0
    for (let i = 0; i < 50; i += 1) {
        const priv = randomBytes(32)
        const keyObj = createPrivateKey({
            key: Buffer.concat([X25519_PKCS8_PREFIX, priv]),
            format: 'der',
            type: 'pkcs8'
        })
        const jwk = keyObj.export({ format: 'jwk' })
        const pub = Buffer.from(jwk.x, 'base64url')
        const message = randomBytes(80 + (i % 200))

        // native sign -> JS verify
        const privClone1 = Buffer.from(priv)
        const sigNative = native.xeddsaSign(privClone1, message)
        const okJsVerifiesNative = await jsVerify(pub, message, Buffer.from(sigNative))
        assert.equal(okJsVerifiesNative, true, `iter ${i}: js verify failed on native sig`)

        // JS sign -> native verify
        const privClone2 = Buffer.from(priv)
        const sigJs = await jsSign(privClone2, message)
        const okNativeVerifiesJs = native.xeddsaVerify(pub, message, sigJs)
        assert.equal(okNativeVerifiesJs, true, `iter ${i}: native verify failed on JS sig`)

        okPairs += 1
    }
    console.log(`cross-check OK: ${okPairs} pairs both directions`)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
