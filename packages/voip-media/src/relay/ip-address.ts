/** The bytes of an IPv4 address. */
export const IPV4_ADDRESS_BYTES = 4
/** The bytes of an IPv6 address. */
export const IPV6_ADDRESS_BYTES = 16

const CHAR_ZERO = 0x30
const CHAR_NINE = 0x39
const CHAR_UPPER_A = 0x41
const CHAR_UPPER_F = 0x46
const CHAR_LOWER_A = 0x61
const CHAR_LOWER_F = 0x66
const CHAR_DOT = 0x2e
const CHAR_COLON = 0x3a
const CHAR_PERCENT = 0x25

function hexDigit(code: number): number {
    if (code >= CHAR_ZERO && code <= CHAR_NINE) return code - CHAR_ZERO
    if (code >= CHAR_LOWER_A && code <= CHAR_LOWER_F) return code - CHAR_LOWER_A + 10
    if (code >= CHAR_UPPER_A && code <= CHAR_UPPER_F) return code - CHAR_UPPER_A + 10
    return -1
}

/** Writes the four dotted-decimal octets of `text[start, end)` into `out` at `offset`. */
export function writeIpv4Address(
    text: string,
    start: number,
    end: number,
    out: Uint8Array,
    offset: number
): boolean {
    let octets = 0
    let value = 0
    let digits = 0

    for (let i = start; i <= end; i++) {
        const code = i < end ? text.charCodeAt(i) : CHAR_DOT

        if (code === CHAR_DOT) {
            if (digits === 0 || digits > 3 || value > 0xff || octets === IPV4_ADDRESS_BYTES) {
                return false
            }
            out[offset + octets] = value
            octets++
            value = 0
            digits = 0
            continue
        }

        if (code < CHAR_ZERO || code > CHAR_NINE) return false
        value = value * 10 + (code - CHAR_ZERO)
        digits++
    }

    return octets === IPV4_ADDRESS_BYTES
}

/**
 * Writes the 16 address bytes of an RFC 4291 textual IPv6 address into `out` at
 * `offset`, covering the compressed `::` run anywhere in the address and the
 * mixed `::ffff:1.2.3.4` tail.
 *
 * Groups are written front to back and the `::` run is closed at the end by
 * sliding everything after it against the tail of the field, so the only
 * allocation is the caller's exact-size attribute buffer.
 */
export function writeIpv6Address(text: string, out: Uint8Array, offset: number): boolean {
    let end = text.length
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === CHAR_PERCENT) {
            end = i
            break
        }
    }

    let hexEnd = end
    let v4Start = -1
    for (let i = 0; i < end; i++) {
        if (text.charCodeAt(i) === CHAR_DOT) {
            v4Start = text.lastIndexOf(':', i) + 1
            if (v4Start === 0) return false
            hexEnd = v4Start
            break
        }
    }

    let written = 0
    let gapAt = -1
    let value = 0
    let digits = 0
    let i = 0

    if (end > 0 && text.charCodeAt(0) === CHAR_COLON) {
        if (end < 2 || text.charCodeAt(1) !== CHAR_COLON) return false
        gapAt = 0
        i = 2
    }

    for (; i < hexEnd; i++) {
        const code = text.charCodeAt(i)

        if (code === CHAR_COLON) {
            if (digits === 0 || written + 2 > IPV6_ADDRESS_BYTES) return false
            out[offset + written] = value >>> 8
            out[offset + written + 1] = value & 0xff
            written += 2
            value = 0
            digits = 0

            if (i + 1 < hexEnd && text.charCodeAt(i + 1) === CHAR_COLON) {
                if (gapAt >= 0) return false
                gapAt = written
                i++
                continue
            }

            if (v4Start < 0 && i + 1 === hexEnd) return false
            continue
        }

        const digit = hexDigit(code)
        if (digit < 0) return false
        value = (value << 4) | digit
        digits++
        if (digits > 4) return false
    }

    if (digits > 0) {
        if (written + 2 > IPV6_ADDRESS_BYTES) return false
        out[offset + written] = value >>> 8
        out[offset + written + 1] = value & 0xff
        written += 2
    }

    if (v4Start >= 0) {
        if (written + IPV4_ADDRESS_BYTES > IPV6_ADDRESS_BYTES) return false
        if (!writeIpv4Address(text, v4Start, end, out, offset + written)) return false
        written += IPV4_ADDRESS_BYTES
    }

    if (gapAt < 0) return written === IPV6_ADDRESS_BYTES

    if (written >= IPV6_ADDRESS_BYTES) return false
    const tail = written - gapAt
    const tailAt = IPV6_ADDRESS_BYTES - tail
    out.copyWithin(offset + tailAt, offset + gapAt, offset + written)
    out.fill(0, offset + gapAt, offset + tailAt)
    return true
}
