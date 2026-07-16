use napi::{bindgen_prelude::*, Env, Task};
use napi_derive::napi;
use zapo_native_core as core;

use crate::crypto::to_napi_err;

#[napi]
pub fn xeddsa_sign(private_key: Buffer, message: Buffer) -> Result<Buffer> {
    let sig = core::xeddsa_sign(&private_key, &message).map_err(to_napi_err)?;
    Ok(Buffer::from(sig.to_vec()))
}

#[napi]
pub fn xeddsa_verify(public_key: Buffer, message: Buffer, signature: Buffer) -> bool {
    core::xeddsa_verify(&public_key, &message, &signature)
}

pub struct XeddsaSignTask {
    private_key: [u8; 32],
    message: Vec<u8>,
}

impl Task for XeddsaSignTask {
    type Output = [u8; 64];
    type JsValue = Buffer;

    fn compute(&mut self) -> Result<Self::Output> {
        core::xeddsa_sign(&self.private_key, &self.message).map_err(to_napi_err)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(Buffer::from(output.to_vec()))
    }
}

pub struct XeddsaVerifyTask {
    public_key: [u8; 32],
    message: Vec<u8>,
    signature: [u8; 64],
    force_false: bool,
}

impl Task for XeddsaVerifyTask {
    type Output = bool;
    type JsValue = bool;

    fn compute(&mut self) -> Result<Self::Output> {
        if self.force_false {
            return Ok(false);
        }
        Ok(core::xeddsa_verify(
            &self.public_key,
            &self.message,
            &self.signature,
        ))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi(ts_return_type = "Promise<Buffer>")]
pub fn xeddsa_sign_async(
    private_key: Buffer,
    message: Buffer,
) -> Result<AsyncTask<XeddsaSignTask>> {
    if private_key.len() != 32 {
        return Err(Error::new(
            Status::InvalidArg,
            format!(
                "invalid curve25519 private key length {}",
                private_key.len()
            ),
        ));
    }
    let mut pk = [0u8; 32];
    pk.copy_from_slice(&private_key);
    Ok(AsyncTask::new(XeddsaSignTask {
        private_key: pk,
        message: message.to_vec(),
    }))
}

#[napi(ts_return_type = "Promise<boolean>")]
pub fn xeddsa_verify_async(
    public_key: Buffer,
    message: Buffer,
    signature: Buffer,
) -> Result<AsyncTask<XeddsaVerifyTask>> {
    let force_false = public_key.len() != 32 || signature.len() != 64;
    let mut pk = [0u8; 32];
    let mut sig = [0u8; 64];
    if !force_false {
        pk.copy_from_slice(&public_key);
        sig.copy_from_slice(&signature);
    }
    Ok(AsyncTask::new(XeddsaVerifyTask {
        public_key: pk,
        message: message.to_vec(),
        signature: sig,
        force_false,
    }))
}
