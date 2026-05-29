use curve25519_dalek::{
    constants::ED25519_BASEPOINT_TABLE, edwards::CompressedEdwardsY, montgomery::MontgomeryPoint,
    scalar::Scalar, traits::IsIdentity,
};
use napi::{bindgen_prelude::*, Env, Task};
use napi_derive::napi;
use sha2::{Digest, Sha512};

const PREFIX_SIGNATURE_RANDOM: [u8; 32] = [
    0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
];

fn clamp_curve_private_key(bytes: &mut [u8; 32]) {
    bytes[0] &= 248;
    bytes[31] &= 127;
    bytes[31] |= 64;
}

fn xeddsa_sign_core(private_key: &[u8], message: &[u8]) -> Result<[u8; 64]> {
    if private_key.len() != 32 {
        return Err(Error::new(
            Status::InvalidArg,
            format!("invalid curve25519 private key length {}", private_key.len()),
        ));
    }

    let mut clamped = [0u8; 32];
    clamped.copy_from_slice(private_key);
    clamp_curve_private_key(&mut clamped);

    let scalar = Scalar::from_bytes_mod_order(clamped);
    let public_compressed = (ED25519_BASEPOINT_TABLE * &scalar).compress();
    let public_bytes = public_compressed.to_bytes();
    let sign_bit = public_bytes[31] & 0x80;

    let mut random_suffix = [0u8; 64];
    if let Err(e) = getrandom::getrandom(&mut random_suffix) {
        return Err(Error::new(
            Status::GenericFailure,
            format!("getrandom failed: {}", e),
        ));
    }

    let r_digest: [u8; 64] = Sha512::new()
        .chain_update(PREFIX_SIGNATURE_RANDOM)
        .chain_update(clamped)
        .chain_update(message)
        .chain_update(random_suffix)
        .finalize()
        .into();
    let r = Scalar::from_bytes_mod_order_wide(&r_digest);

    let r_compressed = (ED25519_BASEPOINT_TABLE * &r).compress();
    let r_bytes = r_compressed.to_bytes();

    let h_digest: [u8; 64] = Sha512::new()
        .chain_update(r_bytes)
        .chain_update(public_bytes)
        .chain_update(message)
        .finalize()
        .into();
    let h = Scalar::from_bytes_mod_order_wide(&h_digest);

    let s = r + h * scalar;
    let mut s_bytes = s.to_bytes();
    s_bytes[31] = (s_bytes[31] & 0x7f) | sign_bit;

    let mut signature = [0u8; 64];
    signature[..32].copy_from_slice(&r_bytes);
    signature[32..].copy_from_slice(&s_bytes);
    Ok(signature)
}

fn xeddsa_verify_core(public_key: &[u8], message: &[u8], signature: &[u8]) -> bool {
    if signature.len() != 64 || public_key.len() != 32 {
        return false;
    }
    if (signature[63] & 0x60) != 0 {
        return false;
    }

    let sign_bit_high = signature[63] & 0x80;

    let mut u_bytes = [0u8; 32];
    u_bytes.copy_from_slice(public_key);
    let mont = MontgomeryPoint(u_bytes);

    let sign_for_to_edwards: u8 = if sign_bit_high != 0 { 1 } else { 0 };
    let ed_a = match mont.to_edwards(sign_for_to_edwards) {
        Some(p) => p,
        None => return false,
    };
    let ed_a_bytes = ed_a.compress().to_bytes();

    let r_bytes = &signature[..32];
    let s_bytes_raw = &signature[32..];

    let mut s_bytes = [0u8; 32];
    s_bytes.copy_from_slice(s_bytes_raw);
    s_bytes[31] &= 0x7f;

    let s = match Option::<Scalar>::from(Scalar::from_canonical_bytes(s_bytes)) {
        Some(scalar) => scalar,
        None => return false,
    };

    let r_compressed_array: [u8; 32] = match r_bytes.try_into() {
        Ok(arr) => arr,
        Err(_) => return false,
    };
    let r_compressed = CompressedEdwardsY(r_compressed_array);
    let r_point = match r_compressed.decompress() {
        Some(p) => p,
        None => return false,
    };

    let h_digest: [u8; 64] = Sha512::new()
        .chain_update(r_bytes)
        .chain_update(ed_a_bytes)
        .chain_update(message)
        .finalize()
        .into();
    let h = Scalar::from_bytes_mod_order_wide(&h_digest);

    let s_b = ED25519_BASEPOINT_TABLE * &s;
    let check = (r_point + h * ed_a - s_b).mul_by_cofactor();
    check.is_identity()
}

#[napi]
pub fn xeddsa_sign(private_key: Buffer, message: Buffer) -> Result<Buffer> {
    let sig = xeddsa_sign_core(&private_key, &message)?;
    Ok(Buffer::from(sig.to_vec()))
}

#[napi]
pub fn xeddsa_verify(public_key: Buffer, message: Buffer, signature: Buffer) -> bool {
    xeddsa_verify_core(&public_key, &message, &signature)
}

pub struct XeddsaSignTask {
    private_key: [u8; 32],
    message: Vec<u8>,
}

impl Task for XeddsaSignTask {
    type Output = [u8; 64];
    type JsValue = Buffer;

    fn compute(&mut self) -> Result<Self::Output> {
        xeddsa_sign_core(&self.private_key, &self.message)
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
        Ok(xeddsa_verify_core(
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
            format!("invalid curve25519 private key length {}", private_key.len()),
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
