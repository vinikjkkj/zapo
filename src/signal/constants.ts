import { SERIALIZED_PUB_KEY_PREFIX as CORE_SERIALIZED_PUB_KEY_PREFIX } from '../crypto/core/constants'

const textEncoder = new TextEncoder()

export const SIGNAL_VERSION = 3
export const SIGNAL_GROUP_VERSION = 3
export const SERIALIZED_PUB_KEY_PREFIX = CORE_SERIALIZED_PUB_KEY_PREFIX
export const KEY_TYPE_CURVE25519 = 5
export const SIGNAL_MAC_SIZE = 8
export const SIGNATURE_SIZE = 64
export const MAX_PREV_SESSIONS = 40
export const MAX_UNUSED_KEYS = 2_000
export const FUTURE_MESSAGES_MAX = 2_000
export const SENDER_KEY_FUTURE_MESSAGES_MAX = 20_000
export const MSG_KEY_LABEL = new Uint8Array([1])
export const CHAIN_KEY_LABEL = new Uint8Array([2])
export const MESSAGE_KEY_LABEL = MSG_KEY_LABEL
export const WHISPER_TEXT_INFO = textEncoder.encode('WhisperText')
export const WHISPER_RATCHET_INFO = textEncoder.encode('WhisperRatchet')
export const WHISPER_GROUP_INFO = textEncoder.encode('WhisperGroup')
export const WHISPER_MESSAGE_KEYS_INFO = textEncoder.encode('WhisperMessageKeys')
export const SIGNAL_PREFIX = new Uint8Array(32).fill(0xff)
