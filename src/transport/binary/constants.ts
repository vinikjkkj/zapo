import { DICTIONARIES, SINGLE_BYTE_TOKENS } from '@transport/binary/tokens'

export const LIST_EMPTY = 0
export const STREAM_END = 2
export const DICTIONARY_0 = 236
export const DICTIONARY_3 = 239
export const JID_INTEROP = 245
export const JID_FB = 246
export const JID_U = 247
export const LIST_8 = 248
export const LIST_16 = 249
export const JID_PAIR = 250
export const HEX_8 = 251
export const BINARY_8 = 252
export const BINARY_20 = 253
export const BINARY_32 = 254
export const NIBBLE_8 = 255

export const JID_U_DOMAIN_TYPE_PN = 0x00
export const JID_U_DOMAIN_TYPE_LID = 0x01
export const JID_U_DOMAIN_TYPE_HOSTED = 0x80
export const JID_U_DOMAIN_TYPE_HOSTED_LID = 0x81
export const JID_U_DOMAIN_TYPE_HOSTED_MASK = 0x80
export const JID_U_DOMAIN_TYPE_LID_MASK = 0x01

export const NIBBLE_ALPHABET = Object.freeze([
    '0',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '-',
    '.',
    '\uFFFD',
    '\uFFFD',
    '\uFFFD',
    '\uFFFD'
] as const)
export const HEX_ALPHABET = Object.freeze([
    '0',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    'A',
    'B',
    'C',
    'D',
    'E',
    'F'
] as const)

export const SINGLE_BYTE_TOKEN_MAP: ReadonlyMap<string, number> = (() => {
    const map = new Map<string, number>()
    for (let i = 0; i < SINGLE_BYTE_TOKENS.length; i += 1) {
        map.set(SINGLE_BYTE_TOKENS[i], i + 1)
    }
    return map
})()

export const DICTIONARY_TOKEN_MAPS: readonly ReadonlyMap<string, number>[] = DICTIONARIES.map(
    (dictionary) => {
        const map = new Map<string, number>()
        for (let i = 0; i < dictionary.length; i += 1) {
            map.set(dictionary[i], i)
        }
        return map
    }
)
