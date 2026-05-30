import { WA_DEFAULTS } from '@protocol/constants'
import type { SignalAddress } from '@signal/types'

const KNOWN_SERVERS: Record<string, string> = {
    [WA_DEFAULTS.HOST_DOMAIN]: WA_DEFAULTS.HOST_DOMAIN,
    [WA_DEFAULTS.GROUP_SERVER]: WA_DEFAULTS.GROUP_SERVER,
    [WA_DEFAULTS.BROADCAST_SERVER]: WA_DEFAULTS.BROADCAST_SERVER,
    [WA_DEFAULTS.LID_SERVER]: WA_DEFAULTS.LID_SERVER,
    [WA_DEFAULTS.HOSTED_SERVER]: WA_DEFAULTS.HOSTED_SERVER,
    [WA_DEFAULTS.HOSTED_LID_SERVER]: WA_DEFAULTS.HOSTED_LID_SERVER,
    [WA_DEFAULTS.MSGR_SERVER]: WA_DEFAULTS.MSGR_SERVER,
    [WA_DEFAULTS.INTEROP_SERVER]: WA_DEFAULTS.INTEROP_SERVER,
    [WA_DEFAULTS.NEWSLETTER_SERVER]: WA_DEFAULTS.NEWSLETTER_SERVER,
    [WA_DEFAULTS.BOT_SERVER]: WA_DEFAULTS.BOT_SERVER
}

/**
 * Returns the canonical reference for known server strings, avoiding
 * thousands of duplicate sliced copies (e.g. "lid", "s.whatsapp.net")
 * that would otherwise be created by repeated JID parsing.
 */
function internServer(server: string): string {
    return KNOWN_SERVERS[server] ?? server
}

function extractDigits(input: string): string {
    let digits = ''
    for (let index = 0; index < input.length; index += 1) {
        const code = input.charCodeAt(index)
        if (code >= 48 && code <= 57) digits += input[index]
    }
    return digits
}

function findAtIndex(jid: string): number {
    const atIndex = jid.indexOf('@')
    if (atIndex < 1 || atIndex >= jid.length - 1) throw new Error(`invalid jid: ${jid}`)
    return atIndex
}

/**
 * Splits a JID into `user` and `server` parts at the `@` separator.
 * Throws if the input does not contain a valid `user@server` shape.
 */
export function splitJid(jid: string): { readonly user: string; readonly server: string } {
    const atIndex = findAtIndex(jid)
    return { user: jid.slice(0, atIndex), server: internServer(jid.slice(atIndex + 1)) }
}

/**
 * Normalizes a user-supplied recipient (phone number, group id, or full JID)
 * into a canonical JID. Strings already containing `@` are returned as-is;
 * dashed inputs map to `<input>@g.us` (group); pure-digit inputs map to
 * `<digits>@s.whatsapp.net`.
 */
export function normalizeRecipientJid(to: string): string {
    const input = to.trim()
    if (input.length === 0) throw new Error('recipient cannot be empty')
    let hasDash = false
    for (let index = 0; index < input.length; index += 1) {
        const code = input.charCodeAt(index)
        if (code === 64) return input
        if (code === 45) {
            hasDash = true
        }
    }
    const digits = extractDigits(input)
    if (hasDash) return `${input}@${WA_DEFAULTS.GROUP_SERVER}`
    if (digits.length === 0) throw new Error(`invalid recipient: ${to}`)
    return `${digits}@${WA_DEFAULTS.HOST_DOMAIN}`
}

function isJidType(jid: string, type: string): boolean {
    const atIndex = jid.length - type.length - 1
    if (atIndex < 1 || jid.charCodeAt(atIndex) !== 64 || !jid.endsWith(type)) return false
    // Reject multi-@ JIDs (consistency with splitJid). Manual loop beats indexOf.
    for (let i = 0; i < atIndex; i += 1) {
        if (jid.charCodeAt(i) === 64) return false
    }
    return true
}

/** Returns `true` for JIDs in the `@lid` server (linked-device identity). */
export function isLidJid(jid: string): boolean {
    return isJidType(jid, WA_DEFAULTS.LID_SERVER)
}

/** Returns `true` for JIDs in the `@s.whatsapp.net` server (phone-number user JIDs). */
export function isUserJid(jid: string): boolean {
    return isJidType(jid, WA_DEFAULTS.HOST_DOMAIN)
}

/** Returns `true` for JIDs in the `@bot` server. */
export function isBotJid(jid: string): boolean {
    return isJidType(jid, WA_DEFAULTS.BOT_SERVER)
}

/** Returns `true` for JIDs in the `@g.us` server (groups). */
export function isGroupJid(jid: string): boolean {
    return isJidType(jid, WA_DEFAULTS.GROUP_SERVER)
}

/** Returns `true` for JIDs in the `@broadcast` server (broadcast lists). */
export function isBroadcastJid(jid: string): boolean {
    return isJidType(jid, WA_DEFAULTS.BROADCAST_SERVER)
}

/** Returns `true` for the special `status@broadcast` JID. */
export function isStatusBroadcastJid(jid: string): boolean {
    return jid === WA_DEFAULTS.STATUS_BROADCAST_JID
}

/** Returns `true` for JIDs in the `@newsletter` server. */
export function isNewsletterJid(jid: string): boolean {
    return isJidType(jid, WA_DEFAULTS.NEWSLETTER_SERVER)
}

/** Returns `true` for any group or broadcast JID. */
export function isGroupOrBroadcastJid(jid: string): boolean {
    return isGroupJid(jid) || isBroadcastJid(jid)
}

export interface ParsedJid {
    readonly address: SignalAddress
    readonly userJid: string
    readonly normalizedJid: string
}

/**
 * Parses a JID into a Signal-style `{ user, server, device }` address.
 * `device` is `0` when the JID has no `:device` segment.
 */
export function parseSignalAddressFromJid(jid: string): SignalAddress {
    const atIndex = findAtIndex(jid)
    const colonIndex = jid.indexOf(':', 0)
    const server = internServer(jid.slice(atIndex + 1))
    if (colonIndex === -1 || colonIndex > atIndex) {
        return { user: jid.slice(0, atIndex), server, device: 0 }
    }
    if (colonIndex >= atIndex - 1) throw new Error(`invalid jid device: ${jid}`)
    let device = 0
    for (let i = colonIndex + 1; i < atIndex; i += 1) {
        const digit = jid.charCodeAt(i) - 48
        if (digit < 0 || digit > 9) throw new Error(`invalid jid device: ${jid}`)
        device = device * 10 + digit
        if (device > Number.MAX_SAFE_INTEGER) throw new Error(`invalid jid device: ${jid}`)
    }
    return { user: jid.slice(0, colonIndex), server, device }
}

/**
 * Parses a JID and returns the Signal address plus the user-only and
 * fully-normalized device JID forms in a single pass.
 */
export function parseJidFull(jid: string): ParsedJid {
    const address = parseSignalAddressFromJid(jid)
    const userJid = `${address.user}@${address.server}`
    const normalizedJid =
        address.device === 0 ? userJid : `${address.user}:${address.device}@${address.server}`
    return { address, userJid, normalizedJid }
}

/**
 * Maps the hosted-account server variants (`hosted` / `hosted.lid`) back to
 * their canonical Signal server (`hostDomain` / `lid`). Other servers are
 * returned unchanged.
 */
export function canonicalizeSignalServer(
    server: string,
    hostDomain: string = WA_DEFAULTS.HOST_DOMAIN
): string {
    if (server === WA_DEFAULTS.HOSTED_SERVER) return hostDomain
    if (server === WA_DEFAULTS.HOSTED_LID_SERVER) return WA_DEFAULTS.LID_SERVER
    return server
}

/**
 * Returns the JID rewritten with its server canonicalized via
 * {@link canonicalizeSignalServer} – used to derive the address Signal
 * sessions are keyed by.
 */
export function canonicalizeSignalJid(
    jid: string,
    hostDomain: string = WA_DEFAULTS.HOST_DOMAIN
): string {
    const address = parseSignalAddressFromJid(jid)
    const server = canonicalizeSignalServer(address.server ?? WA_DEFAULTS.HOST_DOMAIN, hostDomain)
    if (address.device === 0) return `${address.user}@${server}`
    return `${address.user}:${address.device}@${server}`
}

/**
 * Strips the `:device` segment from a JID, returning the bare `user@server`
 * form. Set `options.canonicalizeSignalServer` to also rewrite hosted servers
 * via {@link canonicalizeSignalServer}.
 */
export function toUserJid(
    jid: string,
    options: {
        readonly canonicalizeSignalServer?: boolean
        readonly hostDomain?: string
    } = {}
): string {
    const canonicalize = options.canonicalizeSignalServer === true
    if (!canonicalize) {
        const atIndex = jid.indexOf('@')
        if (atIndex >= 1 && atIndex < jid.length - 1) {
            const colonIndex = jid.indexOf(':', 0)
            if (colonIndex === -1 || colonIndex > atIndex) {
                return jid
            }
        }
    }
    const address = parseSignalAddressFromJid(jid)
    const server = canonicalize
        ? canonicalizeSignalServer(
              address.server ?? WA_DEFAULTS.HOST_DOMAIN,
              options.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN
          )
        : address.server
    return `${address.user}@${server}`
}

/**
 * Returns the JID in its full device form. JIDs with `device === 0` lose the
 * device segment (`user@server`); all others keep `user:device@server`.
 */
export function normalizeDeviceJid(jid: string): string {
    const address = parseSignalAddressFromJid(jid)
    if (address.device === 0) return `${address.user}@${address.server}`
    return `${address.user}:${address.device}@${address.server}`
}

/**
 * Appends `:device` to a bare user JID. A falsy `device` returns the input
 * unchanged.
 */
export function applyDeviceToJid(userJid: string, device: number | undefined): string {
    if (!device) return userJid
    const address = parseSignalAddressFromJid(userJid)
    return buildDeviceJid(address.user, address.server ?? WA_DEFAULTS.HOST_DOMAIN, device)
}

/** Returns `true` when `deviceId` matches the WhatsApp hosted-device id. */
export function isHostedDeviceId(deviceId: number): boolean {
    return deviceId === WA_DEFAULTS.HOSTED_DEVICE_ID
}

/** Returns `true` for the hosted server variants (`hosted` and `hosted.lid`). */
export function isHostedServer(server: string): boolean {
    return server === WA_DEFAULTS.HOSTED_SERVER || server === WA_DEFAULTS.HOSTED_LID_SERVER
}

/**
 * Returns `true` when the JID refers to a hosted device – either by server
 * (`@hosted` / `@hosted.lid`) or by a `:HOSTED_DEVICE_ID@…` device segment.
 */
export function isHostedDeviceJid(jid: string): boolean {
    if (
        isJidType(jid, WA_DEFAULTS.HOSTED_SERVER) ||
        isJidType(jid, WA_DEFAULTS.HOSTED_LID_SERVER)
    ) {
        return true
    }
    const atIndex = jid.indexOf('@')
    if (atIndex < 1 || atIndex >= jid.length - 1) return false
    const colonIndex = jid.indexOf(':')
    if (colonIndex < 0 || colonIndex >= atIndex - 1) return false
    let deviceId = 0
    for (let i = colonIndex + 1; i < atIndex; i += 1) {
        const digit = jid.charCodeAt(i) - 48
        if (digit < 0 || digit > 9) return false
        deviceId = deviceId * 10 + digit
        if (deviceId > Number.MAX_SAFE_INTEGER) return false
    }
    return isHostedDeviceId(deviceId)
}

/**
 * Builds a device JID from its parts. When `options.isHosted` is set, the
 * hosted-server variant is selected (preserving LID vs phone) and the canonical
 * hosted device id is used.
 */
export function buildDeviceJid(
    user: string,
    normalizedServer: string,
    deviceId: number,
    options: {
        readonly rawServer?: string
        readonly isHosted?: boolean
    } = {}
): string {
    if (options.isHosted === true) {
        if (!isHostedDeviceId(deviceId)) {
            return `${user}:${deviceId}@${normalizedServer}`
        }
        const hostedServer =
            options.rawServer === WA_DEFAULTS.HOSTED_LID_SERVER ||
            normalizedServer === WA_DEFAULTS.LID_SERVER
                ? WA_DEFAULTS.HOSTED_LID_SERVER
                : WA_DEFAULTS.HOSTED_SERVER
        return `${user}:${WA_DEFAULTS.HOSTED_DEVICE_ID}@${hostedServer}`
    }
    if (deviceId === 0) {
        return `${user}@${normalizedServer}`
    }
    return `${user}:${deviceId}@${normalizedServer}`
}

/**
 * Extracts the numeric username and device id from the authenticated user's
 * own JID. Throws when either segment is missing, non-numeric, or out of the
 * safe-integer range.
 */
export function getLoginIdentity(meJid: string): {
    readonly username: number
    readonly device: number
} {
    const atIndex = findAtIndex(meJid)
    const colonIndex = meJid.indexOf(':', 0)
    const dotIndex = meJid.indexOf('.', 0)
    const hasColon = colonIndex !== -1 && colonIndex < atIndex
    const hasDot =
        dotIndex !== -1 && dotIndex < atIndex && (colonIndex === -1 || dotIndex < colonIndex)
    const userEndIndex = hasDot ? dotIndex : hasColon ? colonIndex : atIndex
    const username = Number.parseInt(meJid.slice(0, userEndIndex), 10)
    const device = hasColon ? Number.parseInt(meJid.slice(colonIndex + 1, atIndex), 10) : 0
    if (!Number.isSafeInteger(username) || username <= 0)
        throw new Error(`invalid numeric username from ${meJid}`)
    if (!Number.isSafeInteger(device) || device < 0) throw new Error(`invalid device from ${meJid}`)
    return { username, device }
}

/**
 * Builds a `<digits>@s.whatsapp.net` JID from a free-form phone number,
 * stripping non-digit characters. Throws when no digits are found.
 */
export function parsePhoneJid(input: string): string {
    const digits = extractDigits(input)
    if (!digits) throw new Error('phone number is empty after normalization')
    return `${digits}@${WA_DEFAULTS.HOST_DOMAIN}`
}

/**
 * Returns a stable `user|server|device` key for a Signal address, suitable
 * as a Map/Set key.
 */
export function signalAddressKey(address: SignalAddress): string {
    const server = address.server ?? WA_DEFAULTS.HOST_DOMAIN
    return `${address.user}|${server}|${address.device}`
}
