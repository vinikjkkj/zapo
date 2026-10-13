import { canonicalizeSignalServer, parseSignalAddressFromJid, WA_DEFAULTS } from 'zapo-js/protocol'

/**
 * A device jid with its `:device`, bare meaning the primary: the form SSRCs and SRTP keys derive
 * from. The server is kept as received.
 */
export function toDeviceJid(jid: string): string {
    return /:\d+@/.test(jid) ? jid : jid.replace('@', ':0@')
}

/** Device 0 travels both bare and as `:0`, so device jids compare in one form. */
export function isSameDeviceJid(left: string, right: string): boolean {
    return toDeviceJid(left) === toDeviceJid(right)
}

/**
 * The key an account is matched by: user and canonical domain, device dropped. One account
 * travels bare, as `:0` and as `:76` within a single call.
 */
export function groupParticipantAccountKey(jid: string): string {
    const address = parseSignalAddressFromJid(jid)
    return `${address.user}@${canonicalizeSignalServer(address.server ?? WA_DEFAULTS.HOST_DOMAIN)}`
}

/** A device jid parsed into its addressed form: a bare jid names the primary and gets its `:0`. */
export function addressDeviceJid(jid: string): {
    readonly jid: string
    readonly deviceId: number
    readonly server: string
} {
    const address = parseSignalAddressFromJid(jid)
    const server = address.server ?? WA_DEFAULTS.HOST_DOMAIN
    return { jid: `${address.user}:${address.device}@${server}`, deviceId: address.device, server }
}
