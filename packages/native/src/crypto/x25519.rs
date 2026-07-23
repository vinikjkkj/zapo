use napi::bindgen_prelude::*;
use napi_derive::napi;
use zapo_native_core as core;

use crate::crypto::to_napi_err;

// Thin NAPI wrapper over the shared core; the math lives in `zapo-native-core`.
#[napi]
pub fn x25519_scalar_mult(private_key: Buffer, public_key: Buffer) -> Result<Buffer> {
    let shared = core::x25519_scalar_mult(&private_key, &public_key).map_err(to_napi_err)?;
    Ok(Buffer::from(shared.to_vec()))
}
