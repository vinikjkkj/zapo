import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isBackendAbsence } from '@crypto/nativeBackend'

function moduleNotFound(message: string): Error {
    return Object.assign(new Error(message), { code: 'MODULE_NOT_FOUND' })
}

test('package-level module-not-found is classified as absence for both backends', () => {
    const napiMissing = moduleNotFound("Cannot find module '@zapo-js/native'")
    assert.equal(isBackendAbsence('napi', napiMissing), true)

    const wasmMissing = moduleNotFound(
        "Cannot find module '@zapo-js/native/wasm/pkg/zapo_native_wasm.js'"
    )
    assert.equal(isBackendAbsence('wasm', wasmMissing), true)

    const esmVariant = Object.assign(
        new Error("Cannot find package '@zapo-js/native' imported from /app/index.mjs"),
        { code: 'ERR_MODULE_NOT_FOUND' }
    )
    assert.equal(isBackendAbsence('napi', esmVariant), true)
})

test('missing entry files resolve to absence, including windows path form', () => {
    const entryMissing = moduleNotFound(
        "Cannot find module 'C:\\app\\node_modules\\@zapo-js\\native\\binding.js'"
    )
    assert.equal(isBackendAbsence('napi', entryMissing), true)

    const glueMissing = moduleNotFound(
        "Cannot find module 'C:\\app\\node_modules\\@zapo-js\\native\\wasm\\pkg\\zapo_native_wasm.js'"
    )
    assert.equal(isBackendAbsence('wasm', glueMissing), true)
})

test('napi loader without a platform binary is absence, not breakage', () => {
    const loaderMiss = new Error(
        'Cannot find native binding. npm has a bug related to optional dependencies'
    )
    assert.equal(isBackendAbsence('napi', loaderMiss), true)
})

test('esm builds without require stay silent, other reference errors do not', () => {
    assert.equal(isBackendAbsence('napi', new ReferenceError('require is not defined')), true)
    assert.equal(isBackendAbsence('wasm', new ReferenceError('require is not defined')), true)
    assert.equal(isBackendAbsence('wasm', new ReferenceError('foo is not defined')), false)
})

test('present-but-broken backends are never classified as absence', () => {
    const wasmBinaryMissing = moduleNotFound(
        "Cannot find module 'C:\\app\\node_modules\\@zapo-js\\native\\wasm\\pkg\\zapo_native_wasm_bg.wasm'"
    )
    assert.equal(isBackendAbsence('wasm', wasmBinaryMissing), false)

    const wasmBinaryMissingPosix = moduleNotFound(
        "Cannot find module '/app/node_modules/@zapo-js/native/wasm/pkg/zapo_native_wasm_bg.wasm'"
    )
    assert.equal(isBackendAbsence('wasm', wasmBinaryMissingPosix), false)

    const corruptWasm = new Error(
        'WebAssembly.Module(): expected magic word 00 61 73 6d, found 01 02 03 04 @+0'
    )
    assert.equal(isBackendAbsence('wasm', corruptWasm), false)

    const abiMismatch = moduleNotFound("Cannot find module 'some-internal-dependency'")
    assert.equal(isBackendAbsence('napi', abiMismatch), false)

    assert.equal(isBackendAbsence('napi', new Error('dlopen failed: invalid ELF header')), false)
    assert.equal(isBackendAbsence('napi', null), false)
    assert.equal(isBackendAbsence('napi', 'not an error'), false)
})
