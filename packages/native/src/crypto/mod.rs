use napi::bindgen_prelude::{Error, Status};
use zapo_native_core::CoreError;

pub mod x25519;
pub mod xeddsa;

/// Maps a shared-core error onto a NAPI error, preserving the InvalidArg vs
/// GenericFailure distinction the callers rely on.
pub(crate) fn to_napi_err(err: CoreError) -> Error {
    let status = if err.is_invalid_arg() {
        Status::InvalidArg
    } else {
        Status::GenericFailure
    };
    Error::new(status, err.message().to_string())
}
