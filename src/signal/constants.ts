import { TEXT_ENCODER } from '@util/bytes'

export const SIGNAL_VERSION = 3
export const SIGNAL_GROUP_VERSION = 3
export const SIGNAL_MAC_SIZE = 8
export const MAX_PREV_SESSIONS = 40
export const MAX_UNUSED_KEYS = 2_000
export const FUTURE_MESSAGES_MAX = 2_000
export const SENDER_KEY_FUTURE_MESSAGES_MAX = 20_000
export const MESSAGE_KEY_LABEL = new Uint8Array([1])
export const CHAIN_KEY_LABEL = new Uint8Array([2])
export const WHISPER_GROUP_INFO = TEXT_ENCODER.encode('WhisperGroup')
export const SIGNAL_PREFIX = new Uint8Array(32).fill(0xff)
