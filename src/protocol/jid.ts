import type { SignalAddress } from '../signal/types'

import { WA_DEFAULTS } from './constants'

export interface ParsedJid {
    readonly user: string
    readonly server: string
}

export function splitJid(jid: string): ParsedJid {
    const atIndex = jid.indexOf('@')
    if (atIndex < 1 || atIndex >= jid.length - 1) {
        throw new Error(`invalid jid: ${jid}`)
    }
    return {
        user: jid.slice(0, atIndex),
        server: jid.slice(atIndex + 1)
    }
}

export function normalizeRecipientJid(to: string, userServer: string, groupServer: string): string {
    const input = to.trim()
    if (input.length === 0) {
        throw new Error('recipient cannot be empty')
    }
    if (input.includes('@')) {
        return input
    }

    if (input.includes('-')) {
        return `${input}@${groupServer}`
    }

    const digits = input.replace(/\D/g, '')
    if (digits.length === 0) {
        throw new Error(`invalid recipient: ${to}`)
    }
    return `${digits}@${userServer}`
}

export function isGroupJid(jid: string, groupServer: string): boolean {
    return jid.endsWith(`@${groupServer}`)
}

export function parseSignalAddressFromJid(jid: string): SignalAddress {
    const parsed = splitJid(jid)
    const colonIndex = parsed.user.indexOf(':')
    if (colonIndex === -1) {
        return {
            user: parsed.user,
            server: parsed.server,
            device: 0
        }
    }
    const user = parsed.user.slice(0, colonIndex)
    const deviceRaw = parsed.user.slice(colonIndex + 1)
    const device = Number.parseInt(deviceRaw, 10)
    if (!Number.isFinite(device) || device < 0) {
        throw new Error(`invalid jid device: ${jid}`)
    }
    return {
        user,
        server: parsed.server,
        device
    }
}

export function getLoginIdentity(meJid: string): {
    readonly username: number
    readonly device: number
} {
    const parsed = splitJid(meJid)
    const [userAndAgent, devicePart = '0'] = parsed.user.split(':')
    const userPart = userAndAgent.split('.')[0]
    const username = Number.parseInt(userPart, 10)
    const device = Number.parseInt(devicePart, 10)
    if (!Number.isSafeInteger(username) || username <= 0) {
        throw new Error(`invalid numeric username from ${meJid}`)
    }
    if (!Number.isSafeInteger(device) || device < 0) {
        throw new Error(`invalid device from ${meJid}`)
    }
    return { username, device }
}

export function parsePhoneJid(input: string): string {
    const digits = input.replace(/\D+/g, '')
    if (!digits) {
        throw new Error('phone number is empty after normalization')
    }
    return `${digits}@${WA_DEFAULTS.HOST_DOMAIN}`
}
