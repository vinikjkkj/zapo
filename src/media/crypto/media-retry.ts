import { hkdf } from '@crypto/core/hkdf'
import { aesGcmDecrypt, aesGcmEncrypt } from '@crypto/core/primitives'
import { randomBytesAsync } from '@crypto/core/random'
import { proto, type Proto } from '@proto'
import { assertByteLength, TEXT_ENCODER } from '@util/bytes'

/** AES-GCM nonce size of both media-reupload payloads. */
export const MEDIA_RETRY_IV_SIZE = 12

/** Media key the RMR key is expanded from, and the AES-256 key it expands to. */
const MEDIA_KEY_SIZE = 32
const MEDIA_RETRY_KEY_SIZE = 32

const MEDIA_RETRY_HKDF_INFO_BYTES = TEXT_ENCODER.encode('WhatsApp Media Retry Notification')

/** `<enc_p>` / `<enc_iv>` of a media-reupload payload (auth tag appended to the ciphertext). */
export interface WaMediaRetryEncryptedPayload {
    readonly ciphertext: Uint8Array
    readonly iv: Uint8Array
}

/** Input for {@link decryptMediaRetryNotification}. */
export interface WaMediaRetryDecryptInput {
    /** Media key of the original message. Sensitive key material - do not log. */
    readonly mediaKey: Uint8Array
    readonly ciphertext: Uint8Array
    readonly iv: Uint8Array
    /** Stanza id of the original message; doubles as the AES-GCM associated data. */
    readonly stanzaId: string
}

/** HKDF-SHA-256 over the media key, empty salt, `WhatsApp Media Retry Notification` context. */
function deriveMediaRetryKey(mediaKey: Uint8Array): Uint8Array {
    assertByteLength(
        mediaKey,
        MEDIA_KEY_SIZE,
        `invalid media key length ${mediaKey.byteLength}, expected ${MEDIA_KEY_SIZE}`
    )
    return hkdf(mediaKey, null, MEDIA_RETRY_HKDF_INFO_BYTES, MEDIA_RETRY_KEY_SIZE)
}

/**
 * Seals the `ServerErrorReceipt` a `server-error` receipt carries. The stanza id
 * is both the payload and the AES-GCM associated data, so the blob cannot be
 * replayed against another message. Leave `iv` unset outside tests.
 */
export async function encryptServerErrorReceipt(
    mediaKey: Uint8Array,
    stanzaId: string,
    iv?: Uint8Array
): Promise<WaMediaRetryEncryptedPayload> {
    const key = deriveMediaRetryKey(mediaKey)
    const nonce = iv ?? (await randomBytesAsync(MEDIA_RETRY_IV_SIZE))
    assertByteLength(
        nonce,
        MEDIA_RETRY_IV_SIZE,
        `invalid media retry iv length ${nonce.byteLength}, expected ${MEDIA_RETRY_IV_SIZE}`
    )
    const plaintext = proto.ServerErrorReceipt.encode({ stanzaId }).finish()
    const ciphertext = aesGcmEncrypt(key, nonce, plaintext, TEXT_ENCODER.encode(stanzaId))
    return { ciphertext, iv: nonce }
}

/**
 * Opens the `<encrypt>` payload of a `mediaretry` notification. Callers must
 * still check the decoded `stanzaId` against the notification's id - a valid
 * auth tag only proves the payload was sealed under this media key.
 */
export function decryptMediaRetryNotification(
    input: WaMediaRetryDecryptInput
): Proto.IMediaRetryNotification {
    const key = deriveMediaRetryKey(input.mediaKey)
    assertByteLength(
        input.iv,
        MEDIA_RETRY_IV_SIZE,
        `invalid media retry iv length ${input.iv.byteLength}, expected ${MEDIA_RETRY_IV_SIZE}`
    )
    const plaintext = aesGcmDecrypt(
        key,
        input.iv,
        input.ciphertext,
        TEXT_ENCODER.encode(input.stanzaId)
    )
    return proto.MediaRetryNotification.decode(plaintext)
}
