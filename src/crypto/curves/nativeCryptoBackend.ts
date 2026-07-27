/**
 * Resolves the optional native crypto accelerator backend shared by the
 * X25519 and XEdDSA paths. Selected via `ZAPO_NATIVE_BACKEND`:
 *
 *   - `auto` (default) – try the NAPI addon first, then the WASM build,
 *                        then no accelerator.
 *   - `napi`           – only the compiled Rust NAPI addon (`@zapo-js/native`).
 *   - `wasm`           – only the wasm-bindgen build of the same Rust core.
 *                        The shipped artifact targets the web (ESM glue +
 *                        explicit init) so one build serves browsers and
 *                        Node; loading it here relies on `require(esm)`,
 *                        available unflagged on Node 20.19+ / 22.12+.
 *   - `js` / `none`    – no accelerator; callers fall back to the pure-JS
 *                        (and `node:crypto`) implementations.
 *
 * The module is resolved once and memoised. A failed backend resolves to
 * `null` (or, under `auto`, falls through to the next one) so callers
 * transparently fall back to JS. An absent backend stays silent - that is
 * the expected shape of an optional accelerator - but a present-yet-broken
 * one (corrupt binary, ABI mismatch, unsupported runtime) emits a process
 * warning with code `ZAPO_NATIVE_LOAD_FAILED` so the degradation is
 * visible. The per-primitive `ZAPO_X25519_FORCE_JS` / `ZAPO_XEDDSA_FORCE_JS`
 * escape hatches are honoured by the callers, not here.
 */
import { readFileSync } from 'node:fs'

import { toError } from '@util/primitives'

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
const WASM_BINARY_SPECIFIER = '@zapo-js/native/wasm/pkg/zapo_native_wasm_bg.wasm'

interface WasmWebModule extends NativeCryptoModule {
    readonly initSync: (input: { readonly module: Uint8Array }) => unknown
}

function loadWasmBackend(): NativeCryptoModule {
    const mod = require(WASM_MODULE_SPECIFIER) as WasmWebModule
    const wasmBytes = readFileSync(require.resolve(WASM_BINARY_SPECIFIER))
    mod.initSync({ module: wasmBytes })
    return mod
}

let cached: NativeCryptoModule | null | undefined

function isModuleAbsence(specifier: string, error: unknown): boolean {
    if (error instanceof ReferenceError) {
        return error.message.includes('require is not defined')
    }
    const { code, message } = (error ?? {}) as {
        readonly code?: unknown
        readonly message?: unknown
    }
    if (code !== 'MODULE_NOT_FOUND' && code !== 'ERR_MODULE_NOT_FOUND') return false
    return typeof message === 'string' && message.includes(`'${specifier}'`)
}

function warnLoadFailure(backend: string, error: unknown): void {
    process.emitWarning('failed to load native crypto accelerator, falling back', {
        code: 'ZAPO_NATIVE_LOAD_FAILED',
        detail: `${backend}: ${toError(error).message}`
    })
}

export function resolveNativeCryptoBackend(): NativeCryptoModule | null {
    if (cached !== undefined) return cached
    const backend = (process.env.ZAPO_NATIVE_BACKEND ?? 'auto').toLowerCase()
    cached = null
    if (backend === 'js' || backend === 'none') return cached
    if (backend === 'napi' || backend === 'auto') {
        try {
            cached = require('@zapo-js/native') as NativeCryptoModule
        } catch (error) {
            if (!isModuleAbsence('@zapo-js/native', error)) warnLoadFailure('napi', error)
        }
    }
    if (cached === null && (backend === 'wasm' || backend === 'auto')) {
        try {
            cached = loadWasmBackend()
        } catch (error) {
            if (!isModuleAbsence(WASM_MODULE_SPECIFIER, error)) warnLoadFailure('wasm', error)
        }
    }
    return cached
}
