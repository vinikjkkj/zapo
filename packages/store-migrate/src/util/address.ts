import { WA_DEFAULTS } from 'zapo-js/protocol'
import type { SignalAddress } from 'zapo-js/signal'

const HOST = WA_DEFAULTS.HOST_DOMAIN
const LID = WA_DEFAULTS.LID_SERVER

/**
 * Parses a libsignal `ProtocolAddress.toString()` value. Baileys uses `<id>.<dev>`,
 * whatsmeow uses `<id>:<dev>` — split on the rightmost separator either way.
 */
export function parseLibsignalAddressString(encoded: string): {
    readonly id: string
    readonly device: number
} {
    const lastDot = encoded.lastIndexOf('.')
    const lastColon = encoded.lastIndexOf(':')
    const sepIndex = Math.max(lastDot, lastColon)
    if (sepIndex <= 0 || sepIndex >= encoded.length - 1) {
        throw new Error(`invalid libsignal address: ${encoded}`)
    }
    const idPart = encoded.slice(0, sepIndex)
    const devicePart = encoded.slice(sepIndex + 1)
    let device = 0
    for (let i = 0; i < devicePart.length; i += 1) {
        const digit = devicePart.charCodeAt(i) - 48
        if (digit < 0 || digit > 9) {
            throw new Error(`invalid libsignal address device: ${encoded}`)
        }
        device = device * 10 + digit
        if (device > Number.MAX_SAFE_INTEGER) {
            throw new Error(`invalid libsignal address device: ${encoded}`)
        }
    }
    return { id: idPart, device }
}

/**
 * When `server` is omitted, a `_<digits>` suffix on the id (e.g. `123_1`) is read
 * as Baileys' non-WhatsApp domain marker and the server defaults to `lid`.
 */
export function signalAddressFromLibsignalString(
    encoded: string,
    options: { readonly server?: string } = {}
): SignalAddress {
    const { id, device } = parseLibsignalAddressString(encoded)
    if (options.server !== undefined) {
        return { user: id, server: options.server, device }
    }
    const underscoreIndex = id.lastIndexOf('_')
    if (underscoreIndex > 0 && underscoreIndex < id.length - 1) {
        let allDigits = true
        for (let i = underscoreIndex + 1; i < id.length; i += 1) {
            const code = id.charCodeAt(i)
            if (code < 48 || code > 57) {
                allDigits = false
                break
            }
        }
        if (allDigits) {
            return { user: id.slice(0, underscoreIndex), server: LID, device }
        }
    }
    return { user: id, server: HOST, device }
}
