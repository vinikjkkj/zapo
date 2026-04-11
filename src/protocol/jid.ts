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
    [WA_DEFAULTS.INTEROP_SERVER]: WA_DEFAULTS.INTEROP_SERVER
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

export function splitJid(jid: string): { readonly user: string; readonly server: string } {
    const atIndex = findAtIndex(jid)
    return { user: jid.slice(0, atIndex), server: internServer(jid.slice(atIndex + 1)) }
}

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
    return atIndex >= 1 && jid.charCodeAt(atIndex) === 64 && jid.endsWith(type)
}

export function isLidJid(jid: string): boolean {
    return isJidType(jid, WA_DEFAULTS.LID_SERVER)
}

export function isGroupJid(jid: string): boolean {
    return isJidType(jid, WA_DEFAULTS.GROUP_SERVER)
}

export function isBroadcastJid(jid: string): boolean {
    return isJidType(jid, WA_DEFAULTS.BROADCAST_SERVER)
}

export function isGroupOrBroadcastJid(jid: string): boolean {
    return isGroupJid(jid) || isBroadcastJid(jid)
}

export interface ParsedJid {
    readonly address: SignalAddress
    readonly userJid: string
    readonly normalizedJid: string
}

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

export function parseJidFull(jid: string): ParsedJid {
    const address = parseSignalAddressFromJid(jid)
    const userJid = `${address.user}@${address.server}`
    const normalizedJid =
        address.device === 0 ? userJid : `${address.user}:${address.device}@${address.server}`
    return { address, userJid, normalizedJid }
}

export function canonicalizeSignalServer(
    server: string,
    hostDomain: string = WA_DEFAULTS.HOST_DOMAIN
): string {
    if (server === WA_DEFAULTS.HOSTED_SERVER) return hostDomain
    if (server === WA_DEFAULTS.HOSTED_LID_SERVER) return WA_DEFAULTS.LID_SERVER
    return server
}

export function canonicalizeSignalJid(
    jid: string,
    hostDomain: string = WA_DEFAULTS.HOST_DOMAIN
): string {
    const address = parseSignalAddressFromJid(jid)
    const server = canonicalizeSignalServer(address.server ?? WA_DEFAULTS.HOST_DOMAIN, hostDomain)
    if (address.device === 0) return `${address.user}@${server}`
    return `${address.user}:${address.device}@${server}`
}

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
        if (atIndex >= 1) {
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

export function normalizeDeviceJid(jid: string): string {
    const address = parseSignalAddressFromJid(jid)
    if (address.device === 0) return `${address.user}@${address.server}`
    return `${address.user}:${address.device}@${address.server}`
}

export function isHostedDeviceId(deviceId: number): boolean {
    return deviceId === WA_DEFAULTS.HOSTED_DEVICE_ID
}

export function isHostedServer(server: string): boolean {
    return server === WA_DEFAULTS.HOSTED_SERVER || server === WA_DEFAULTS.HOSTED_LID_SERVER
}

export function isHostedDeviceJid(jid: string): boolean {
    if (
        isJidType(jid, WA_DEFAULTS.HOSTED_SERVER) ||
        isJidType(jid, WA_DEFAULTS.HOSTED_LID_SERVER)
    ) {
        return true
    }
    const atIndex = jid.indexOf('@')
    if (atIndex < 1) return false
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

export function parsePhoneJid(input: string): string {
    const digits = extractDigits(input)
    if (!digits) throw new Error('phone number is empty after normalization')
    return `${digits}@${WA_DEFAULTS.HOST_DOMAIN}`
}

export function signalAddressKey(address: SignalAddress): string {
    const server = address.server ?? WA_DEFAULTS.HOST_DOMAIN
    return `${address.user}|${server}|${address.device}`
}
