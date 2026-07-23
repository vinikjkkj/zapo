/**
 * Resolves the optional native crypto accelerator backend shared by the
 * X25519 and XEdDSA paths. Selected via `ZAPO_NATIVE_BACKEND`:
 *
 *   - `napi` (default) – the compiled Rust NAPI addon (`@zapo-js/native`).
 *   - `wasm`           – the wasm-bindgen build of the same Rust core,
 *                        loaded synchronously (nodejs target).
 *   - `js` / `none`    – no accelerator; callers fall back to the pure-JS
 *                        (and `node:crypto`) implementations.
 *
 * The module is resolved once and memoised. A missing/broken backend
 * resolves to `null` so callers transparently fall back to JS. The
 * per-primitive `ZAPO_X25519_FORCE_JS` / `ZAPO_XEDDSA_FORCE_JS` escape
 * hatches are honoured by the callers, not here.
 */
export interface NativeCryptoModule {
    readonly x25519ScalarMult?: (privateKey: Uint8Array, publicKey: Uint8Array) => Uint8Array
    readonly xeddsaSign?: (privateKey: Uint8Array, message: Uint8Array) => Uint8Array
    readonly xeddsaVerify?: (
        publicKey: Uint8Array,
        message: Uint8Array,
        signature: Uint8Array
    ) => boolean
}

const WASM_MODULE_SPECIFIER = '@zapo-js/native/wasm/pkg/zapo_native_wasm.js'

let cached: NativeCryptoModule | null | undefined

export function resolveNativeCryptoBackend(): NativeCryptoModule | null {
    if (cached !== undefined) return cached
    const backend = (process.env.ZAPO_NATIVE_BACKEND ?? 'napi').toLowerCase()
    if (backend === 'js' || backend === 'none') {
        cached = null
        return cached
    }
    try {
        cached = require(
            backend === 'wasm' ? WASM_MODULE_SPECIFIER : '@zapo-js/native'
        ) as NativeCryptoModule
    } catch {
        // optional native backend not installed; fall through to JS
        cached = null
    }
    return cached
}
