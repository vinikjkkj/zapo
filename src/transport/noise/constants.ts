import { TEXT_ENCODER } from '@util/bytes'

export const WA_PROTO_HEADER: Readonly<Uint8Array> = new Uint8Array([87, 65, 6, 3])
export const NOISE_XX_NAME: Readonly<Uint8Array> = TEXT_ENCODER.encode(
    'Noise_XX_25519_AESGCM_SHA256\0\0\0\0'
)
export const NOISE_IK_NAME: Readonly<Uint8Array> = TEXT_ENCODER.encode(
    'Noise_IK_25519_AESGCM_SHA256\0\0\0\0'
)
export const NOISE_XX_FALLBACK_NAME: Readonly<Uint8Array> = TEXT_ENCODER.encode(
    'Noise_XXfallback_25519_AESGCM_SHA256'
)
export const ROOT_CA_SERIAL = 0
export const ROOT_CA_PUBLIC_KEY_HEX =
    '142375574d0a587166aae71ebe516437c4a28b73e3695c6ce1f7f9545da8ee6b'
