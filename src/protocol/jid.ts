import { WA_DEFAULTS } from '@protocol/constants'
import type { SignalAddress } from '@signal/types'

function scanJid(jid: string): {
    readonly atIndex: number
    readonly colonIndex: number
    readonly dotIndex: number
} {
    let atIndex = -1
    let colonIndex = -1
    let dotIndex = -1
    for (let index = 0; index < jid.length; index++) {
        const code = jid.charCodeAt(index)
        if (code === 64) {
            atIndex = index
            break
        }
        if (code === 58 && colonIndex === -1) colonIndex = index
        else if (code === 46 && dotIndex === -1 && colonIndex === -1) dotIndex = index
    }
    if (atIndex < 1 || atIndex >= jid.length - 1) throw new Error(`invalid jid: ${jid}`)
    return { atIndex, colonIndex, dotIndex }
}

export function splitJid(jid: string): { readonly user: string; readonly server: string } {
    const { atIndex } = scanJid(jid)
    return { user: jid.slice(0, atIndex), server: jid.slice(atIndex + 1) }
}

export function normalizeRecipientJid(to: string): string {
    const input = to.trim()
    if (input.length === 0) throw new Error('recipient cannot be empty')
    let hasDash = false
    let digits = ''
    for (let index = 0; index < input.length; index += 1) {
        const code = input.charCodeAt(index)
        if (code === 64) return input
        if (code === 45) {
            hasDash = true
            continue
        }
        if (code >= 48 && code <= 57) digits += input[index]
    }
    if (hasDash) return `${input}@${WA_DEFAULTS.GROUP_SERVER}`
    if (digits.length === 0) throw new Error(`invalid recipient: ${to}`)
    return `${digits}@${WA_DEFAULTS.HOST_DOMAIN}`
}

export function isJidType(jid: string, type: string): boolean {
    const atIndex = jid.length - type.length - 1
    return atIndex >= 1 && jid.charCodeAt(atIndex) === 64 && jid.endsWith(type)
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

export function parseSignalAddressFromJid(jid: string): SignalAddress {
    const { atIndex, colonIndex } = scanJid(jid)
    const server = jid.slice(atIndex + 1)
    if (colonIndex === -1) return { user: jid.slice(0, atIndex), server, device: 0 }
    const device = Number.parseInt(jid.slice(colonIndex + 1, atIndex), 10)
    if (!Number.isFinite(device) || device < 0) throw new Error(`invalid jid device: ${jid}`)
    return { user: jid.slice(0, colonIndex), server, device }
}

export function toUserJid(jid: string): string {
    const address = parseSignalAddressFromJid(jid)
    return `${address.user}@${address.server}`
}

export function normalizeDeviceJid(jid: string): string {
    const address = parseSignalAddressFromJid(jid)
    if (address.device === 0) return `${address.user}@${address.server}`
    return `${address.user}:${address.device}@${address.server}`
}

export function getLoginIdentity(meJid: string): {
    readonly username: number
    readonly device: number
} {
    const { atIndex, colonIndex, dotIndex } = scanJid(meJid)
    const userEndIndex = dotIndex === -1 ? (colonIndex === -1 ? atIndex : colonIndex) : dotIndex
    const username = Number.parseInt(meJid.slice(0, userEndIndex), 10)
    const device = colonIndex === -1 ? 0 : Number.parseInt(meJid.slice(colonIndex + 1, atIndex), 10)
    if (!Number.isSafeInteger(username) || username <= 0)
        throw new Error(`invalid numeric username from ${meJid}`)
    if (!Number.isSafeInteger(device) || device < 0) throw new Error(`invalid device from ${meJid}`)
    return { username, device }
}

export function parsePhoneJid(input: string): string {
    let digits = ''
    for (let index = 0; index < input.length; index += 1) {
        const code = input.charCodeAt(index)
        if (code >= 48 && code <= 57) digits += input[index]
    }
    if (!digits) throw new Error('phone number is empty after normalization')
    return `${digits}@${WA_DEFAULTS.HOST_DOMAIN}`
}

export function signalAddressKey(address: SignalAddress): string {
    const server = address.server ?? WA_DEFAULTS.HOST_DOMAIN
    return `${address.user}|${server}|${address.device}`
}
