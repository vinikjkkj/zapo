import { hkdf } from 'zapo-js/crypto'

import { readUInt32LE, TEXT_ENCODER, writeUInt32LE } from '../bytes.js'

const VIDEO_SLOTS = { MAIN: 2, FEC: 3, OOB_NACK: 5 } as const

/**
 * Stream slot indices WhatsApp feeds into the SSRC derivation.
 *
 * Only the slot changes between the streams of one device, so both sides
 * compute each other's SSRCs without ever signalling them.
 *
 * `AUDIO.MAIN` (0) and `VIDEO.MAIN` (2) are confirmed by captured SSRCs from
 * the official client. The labels of audio slots 1 and 4 are **uncertain**:
 * one reading of the client maps 1 to FEC and 4 to OOB NACK, another maps them
 * the other way round. The SSRC only depends on the number, so the ambiguity
 * is harmless here, but do not treat these two names as ground truth.
 */
export const WA_SSRC_SLOT = {
    AUDIO: { MAIN: 0, FEC: 1, OOB_NACK: 4 },
    VIDEO: VIDEO_SLOTS,
    SCREEN_SHARE: VIDEO_SLOTS,
    APP_DATA: { MAIN: 6 }
} as const

/** Slots an audio-only call negotiates: FEC and NACK exist even with no video. */
export const WA_AUDIO_CALL_SSRC_SLOTS = [
    WA_SSRC_SLOT.AUDIO.MAIN,
    WA_SSRC_SLOT.AUDIO.FEC,
    WA_SSRC_SLOT.AUDIO.OOB_NACK
] as const

/** Slots a video call negotiates: the audio stack plus video and app data. */
export const WA_VIDEO_CALL_SSRC_SLOTS = [
    ...WA_AUDIO_CALL_SSRC_SLOTS,
    WA_SSRC_SLOT.VIDEO.MAIN,
    WA_SSRC_SLOT.VIDEO.FEC,
    WA_SSRC_SLOT.VIDEO.OOB_NACK,
    WA_SSRC_SLOT.APP_DATA.MAIN
] as const

/**
 * Derives the SSRC of one media stream of a call, for a slot of
 * {@link WA_SSRC_SLOT}.
 *
 * HKDF-SHA256 over three inputs, 4 bytes out:
 *
 * - **ikm**: the call-id as **text**, the 32 ASCII characters exactly as they
 *   travel on the wire. It is never hex-decoded.
 * - **salt**: the slot as a 4-byte **little-endian** u32.
 * - **info**: the device jid as text, device suffix and `@lid` included, with
 *   **no slot suffix**.
 * - **output**: the 4 derived bytes read back as a little-endian u32.
 *
 * Two independent sources agree on this shape. Four SSRCs captured from the
 * official client were inverted offline across three different call-ids and
 * two slots and all four reproduce exactly. Separately, the client's
 * `call_generate_device_ssrc` to `call_generate_ssrc_for_identifier` to
 * `VoipCrypto::GetSecureSSRC` chain passes two strings (the device jid and the
 * call-id, both as text) and one integer (the slot, forwarded without ever
 * being converted to a string).
 *
 * **Do not reinstate the `<jid>_<slot>` info string.** An earlier reading of
 * the client suggested an info of `` `${deviceJid}_${slot}` `` with the
 * call-id hex-decoded into 16 raw bytes. That derivation makes the peer drop
 * **every** media packet we send: its
 * `caller_determine_accepted_callee_id_by_ssrc` does a reverse SSRC to device
 * lookup against pre-computed candidates and discards anything that does not
 * match, so the call dies on a media timeout after roughly 21 seconds.
 *
 * The `_<n>` suffix does exist in the client, but only for **secondary video
 * and screen-share streams**, where the stream index is 1 or higher and the
 * stream is not audio. Audio always uses the bare jid, and the main media
 * stream of any kind never carries the suffix. Anyone who finds that shape in
 * the client should not generalize it to this function.
 *
 * Beware the asymmetry that hid the regression: our receive path does not
 * filter inbound RTP by SSRC, so a wrong derivation is invisible on the
 * downlink and only breaks the uplink, which the peer validates. Incoming
 * audio playing correctly does **not** prove the derivation is right.
 */
export function generateSecureSsrc(callId: string, deviceJid: string, slot = 0): number {
    const salt = new Uint8Array(4)
    writeUInt32LE(salt, slot, 0)

    const result = hkdf(TEXT_ENCODER.encode(callId), salt, TEXT_ENCODER.encode(deviceJid), 4)
    return readUInt32LE(result, 0)
}
