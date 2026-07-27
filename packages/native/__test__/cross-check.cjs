// Cross-check: accelerator sign / JS verify AND JS sign / accelerator verify,
// plus X25519 shared-secret parity against node:crypto.
//
// The accelerator side goes through the runtime resolver, so
// ZAPO_NATIVE_BACKEND selects the backend under test (auto / napi / wasm).
// Run from repo root via tsx so the @crypto path aliases resolve:
//   node --import tsx packages/native/__test__/cross-check.cjs

// Force the JS implementations on the zapo-js side BEFORE it loads, so the
// comparison is accelerator vs pure JS instead of accelerator vs itself.
process.env.ZAPO_XEDDSA_FORCE_JS = '1'
process.env.ZAPO_X25519_FORCE_JS = '1'

const assert = require('node:assert')
const { randomBytes, createPrivateKey } = require('node:crypto')

async function main() {
    const { resolveNativeCryptoBackend } = await import('../../../src/crypto/nativeBackend.ts')
    const native = resolveNativeCryptoBackend()
    if (
        !native ||
        typeof native.xeddsaSign !== 'function' ||
        typeof native.xeddsaVerify !== 'function' ||
        typeof native.x25519ScalarMult !== 'function'
    ) {
        const backend = process.env.ZAPO_NATIVE_BACKEND ?? 'auto'
        console.error(`no accelerator backend loaded (ZAPO_NATIVE_BACKEND=${backend})`)
        process.exit(2)
    }

    const { xeddsaSign: jsSign, xeddsaVerify: jsVerify } =
        await import('../../../src/crypto/core/xeddsa.ts')
    const { X25519 } = await import('../../../src/crypto/curves/X25519.ts')

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

        // accelerator sign -> JS verify
        const sigNative = native.xeddsaSign(Buffer.from(priv), message)
        const okJsVerifiesNative = await jsVerify(pub, message, Buffer.from(sigNative))
        assert.equal(okJsVerifiesNative, true, `iter ${i}: js verify failed on accelerator sig`)

        // JS sign -> accelerator verify
        const sigJs = await jsSign(Buffer.from(priv), message)
        const okNativeVerifiesJs = native.xeddsaVerify(pub, message, sigJs)
        assert.equal(okNativeVerifiesJs, true, `iter ${i}: accelerator verify failed on JS sig`)

        okPairs += 1
    }

    let okSecrets = 0
    for (let i = 0; i < 50; i += 1) {
        const a = await X25519.generateKeyPair()
        const b = await X25519.generateKeyPair()
        const jsShared = await X25519.scalarMult(new Uint8Array(a.privKey), b.pubKey)
        const nativeShared = native.x25519ScalarMult(new Uint8Array(a.privKey), b.pubKey)
        assert.deepEqual(
            Buffer.from(nativeShared),
            Buffer.from(jsShared),
            `iter ${i}: x25519 shared secret mismatch`
        )
        okSecrets += 1
    }

    console.log(
        `cross-check OK: ${okPairs} xeddsa pairs both directions + ${okSecrets} x25519 secrets`
    )
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
