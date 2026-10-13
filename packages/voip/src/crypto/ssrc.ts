import { hkdf } from 'zapo-js/crypto'

import { readUInt32LE, TEXT_ENCODER, writeUInt32LE } from '../bytes.js'

const VIDEO_SLOTS = { MAIN: 2, FEC: 3, OOB_NACK: 5 } as const

/**
 * Slot indices of the SSRC derivation; a screen share uses the camera's. Not the protobuf
 * stream layer ids, which differ on every value.
 */
export const WA_SSRC_SLOT = {
    AUDIO: { MAIN: 0, FEC: 1, OOB_NACK: 4 },
    VIDEO: VIDEO_SLOTS,
    SCREEN_SHARE: VIDEO_SLOTS,
    /** One slot, not three: the client derives a single `app_data_ssrc`. */
    APP_DATA: { MAIN: 6 }
} as const

/**
 * Slots an audio-only call negotiates. App data is in the list because the audio profile
 * of `<voip_settings>` carries `enable_app_data_stream=1` too: leaving its SSRC out costs
 * the relay forwarding the peer's reactions.
 */
export const WA_AUDIO_CALL_SSRC_SLOTS = [
    WA_SSRC_SLOT.AUDIO.MAIN,
    WA_SSRC_SLOT.AUDIO.FEC,
    WA_SSRC_SLOT.AUDIO.OOB_NACK,
    WA_SSRC_SLOT.APP_DATA.MAIN
] as const

/** Slots a video call negotiates: the audio stack plus the video streams. */
export const WA_VIDEO_CALL_SSRC_SLOTS = [
    ...WA_AUDIO_CALL_SSRC_SLOTS,
    WA_SSRC_SLOT.VIDEO.MAIN,
    WA_SSRC_SLOT.VIDEO.FEC,
    WA_SSRC_SLOT.VIDEO.OOB_NACK
] as const

/**
 * The SSRC of one stream: HKDF-SHA256 with the call-id text as ikm, the slot as a u32 LE salt and
 * the device jid text as info (no slot suffix), 4 bytes out read as a u32 LE. The peer drops
 * media whose SSRC does not match this, while our receive path does not check it.
 */
export function generateSecureSsrc(callId: string, deviceJid: string, slot = 0): number {
    const salt = new Uint8Array(4)
    writeUInt32LE(salt, slot, 0)

    const result = hkdf(TEXT_ENCODER.encode(callId), salt, TEXT_ENCODER.encode(deviceJid), 4)
    return readUInt32LE(result, 0)
}
