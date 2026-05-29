use curve25519_dalek::montgomery::MontgomeryPoint;
use napi::bindgen_prelude::*;
use napi_derive::napi;

// X25519 ECDH (RFC 7748). Mirrors node:crypto.diffieHellman for x25519
// keys but skips the createPrivateKey/createPublicKey DER round-trip,
// which dominates ECDH cost in the messaging hot path.
#[napi]
pub fn x25519_scalar_mult(private_key: Buffer, public_key: Buffer) -> Result<Buffer> {
    if private_key.len() != 32 {
        return Err(Error::new(
            Status::InvalidArg,
            format!("invalid x25519 private key length {}", private_key.len()),
        ));
    }
    if public_key.len() != 32 {
        return Err(Error::new(
            Status::InvalidArg,
            format!("invalid x25519 public key length {}", public_key.len()),
        ));
    }
    let mut sk = [0u8; 32];
    sk.copy_from_slice(&private_key);
    let mut pk = [0u8; 32];
    pk.copy_from_slice(&public_key);

    // mul_clamped clamps the scalar per RFC 7748 internally; passing an
    // already-clamped key is a no-op since clamping is idempotent.
    let shared = MontgomeryPoint(pk).mul_clamped(sk).to_bytes();
    Ok(Buffer::from(shared.to_vec()))
}
