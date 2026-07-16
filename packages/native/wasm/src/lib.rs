// WASM bindings for the zapo-native crypto accelerators. The algorithms live
// in the shared `zapo-native-core` crate (same code the NAPI crate wraps), so
// this file is only the wasm-bindgen boundary: &[u8]/Vec<u8> marshalling and
// CoreError -> JsError mapping. There is no algorithmic duplication.

use wasm_bindgen::prelude::*;
use zapo_native_core as core;

fn to_js_err(err: core::CoreError) -> JsError {
    JsError::new(err.message())
}

#[wasm_bindgen(js_name = x25519ScalarMult)]
pub fn x25519_scalar_mult(private_key: &[u8], public_key: &[u8]) -> Result<Vec<u8>, JsError> {
    core::x25519_scalar_mult(private_key, public_key)
        .map(|shared| shared.to_vec())
        .map_err(to_js_err)
}

#[wasm_bindgen(js_name = xeddsaSign)]
pub fn xeddsa_sign(private_key: &[u8], message: &[u8]) -> Result<Vec<u8>, JsError> {
    core::xeddsa_sign(private_key, message)
        .map(|sig| sig.to_vec())
        .map_err(to_js_err)
}

#[wasm_bindgen(js_name = xeddsaVerify)]
pub fn xeddsa_verify(public_key: &[u8], message: &[u8], signature: &[u8]) -> bool {
    core::xeddsa_verify(public_key, message, signature)
}
