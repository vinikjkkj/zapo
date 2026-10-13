import type { WaCallMediaSettings } from '@zapo-js/voip-media'

import { WA_AUDIO_CALL_SSRC_SLOTS, WA_VIDEO_CALL_SSRC_SLOTS } from '../crypto/ssrc.js'
import type { WaVoipSettings } from '../signaling/voip-settings.js'

/** Slots a video call registers with the relay and an audio call does not: what an upgrade adds. */
export const VIDEO_ONLY_SSRC_SLOTS: readonly number[] = WA_VIDEO_CALL_SSRC_SLOTS.filter(
    (slot) => !WA_AUDIO_CALL_SSRC_SLOTS.includes(slot as never)
)

/** Duration of the frame the codec encodes; the server's `frame_ms` has to match to bundle. */
const CODEC_FRAME_MS = 60
/** The bundle the official 1:1 client sends at `maxfpp` 2; more is not sent. */
const MAX_AUDIO_FRAMES_PER_PACKET = 2

/** Frames per audio packet: `rc.maxfpp`, capped at 2, and 1 unless `frame_ms` is our 60 ms. */
function resolveAudioFramesPerPacket(settings: WaVoipSettings): number {
    const frameMs = settings.audioFrameMs ?? CODEC_FRAME_MS
    const maxFramesPerPacket = settings.audioMaxFramesPerPacket ?? 1
    if (frameMs !== CODEC_FRAME_MS || maxFramesPerPacket < 2) return 1
    return Math.min(Math.trunc(maxFramesPerPacket), MAX_AUDIO_FRAMES_PER_PACKET)
}

/** The plan's `settings` section: what the media tunes from the call's `<voip_settings>`. */
export function toMediaSettings(settings: WaVoipSettings): WaCallMediaSettings {
    return {
        rtcpIntervalMs: settings.rtcpIntervalMs,
        disableRtcpRemb: settings.disableRtcpRemb,
        appDataSframe: settings.sframe && settings.sframeRx,
        audioFramesPerPacket: resolveAudioFramesPerPacket(settings)
    }
}

/** Deep equality for plan values: bytes by content, arrays and objects field by field. */
export function samePlanValue(left: unknown, right: unknown): boolean {
    if (left === right) return true
    if (left instanceof Uint8Array || right instanceof Uint8Array) {
        if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) return false
        if (left.length !== right.length) return false
        for (let i = 0; i < left.length; i++) {
            if (left[i] !== right[i]) return false
        }
        return true
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right)) return false
        return (
            left.length === right.length && left.every((item, i) => samePlanValue(item, right[i]))
        )
    }
    if (left && right && typeof left === 'object' && typeof right === 'object') {
        const leftRecord = left as Record<string, unknown>
        const rightRecord = right as Record<string, unknown>
        const keys = Object.keys(leftRecord)
        return (
            keys.length === Object.keys(rightRecord).length &&
            keys.every((key) => samePlanValue(leftRecord[key], rightRecord[key]))
        )
    }
    return false
}
