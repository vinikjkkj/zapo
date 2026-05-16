import { WA_DEFAULTS, WA_IQ_TYPES, WA_XMLNS } from '@protocol/constants'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export const WA_BUSINESS_PROFILE_VERSION = 116

export interface WaEditBusinessProfileInput {
    readonly address?: string
    readonly description?: string
    readonly email?: string
    readonly websites?: readonly { readonly url: string }[]
    readonly categories?: readonly { readonly id: string }[]
    readonly businessHours?: {
        readonly timezone?: string
        readonly config: readonly {
            readonly dayOfWeek: string
            readonly mode: string
            readonly openTime?: number
            readonly closeTime?: number
        }[]
    }
    readonly latitude?: number
    readonly longitude?: number
}

export function buildGetBusinessProfileIq(
    jids: readonly string[],
    version: number = WA_BUSINESS_PROFILE_VERSION
): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.BUSINESS, [
        {
            tag: 'business_profile',
            attrs: { v: `${version}` },
            content: jids.map((jid) => ({
                tag: 'profile',
                attrs: { jid }
            }))
        }
    ])
}

export function buildEditBusinessProfileIq(input: WaEditBusinessProfileInput): BinaryNode {
    const children: BinaryNode[] = []

    if (input.address !== undefined) {
        children.push({ tag: 'address', attrs: {}, content: input.address })
    }
    if (input.description !== undefined) {
        children.push({ tag: 'description', attrs: {}, content: input.description })
    }
    if (input.email !== undefined) {
        children.push({ tag: 'email', attrs: {}, content: input.email })
    }
    if (input.latitude !== undefined) {
        children.push({ tag: 'latitude', attrs: {}, content: `${input.latitude}` })
    }
    if (input.longitude !== undefined) {
        children.push({ tag: 'longitude', attrs: {}, content: `${input.longitude}` })
    }
    if (input.websites !== undefined) {
        if (input.websites.length > 2) {
            throw new Error('business profile supports at most 2 websites')
        }
        if (input.websites.length === 0) {
            children.push({ tag: 'website', attrs: {} })
        } else {
            children.push({ tag: 'website', attrs: {}, content: input.websites[0].url })
            if (input.websites.length > 1) {
                children.push({ tag: 'website', attrs: {}, content: input.websites[1].url })
            }
        }
    }
    if (input.categories !== undefined) {
        children.push({
            tag: 'categories',
            attrs: {},
            content: input.categories.map((cat) => ({
                tag: 'category',
                attrs: { id: cat.id }
            }))
        })
    }
    if (input.businessHours !== undefined) {
        children.push(buildBusinessHoursNode(input.businessHours))
    }

    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.BUSINESS, [
        {
            tag: 'business_profile',
            attrs: { v: '3', mutation_type: 'delta' },
            content: children
        }
    ])
}

function buildBusinessHoursNode(
    hours: NonNullable<WaEditBusinessProfileInput['businessHours']>
): BinaryNode {
    const configNodes: BinaryNode[] = new Array(hours.config.length)
    for (let i = 0; i < hours.config.length; i += 1) {
        const entry = hours.config[i]
        const attrs: Record<string, string> = {
            day_of_week: entry.dayOfWeek,
            mode: entry.mode
        }
        if (entry.openTime !== undefined) {
            attrs.open_time = `${entry.openTime}`
        }
        if (entry.closeTime !== undefined) {
            attrs.close_time = `${entry.closeTime}`
        }
        configNodes[i] = { tag: 'business_hours_config', attrs }
    }

    const hoursAttrs: Record<string, string> = {}
    if (hours.timezone) {
        hoursAttrs.timezone = hours.timezone
    }

    return {
        tag: 'business_hours',
        attrs: hoursAttrs,
        content: configNodes
    }
}

export function buildGetVerifiedNameIq(jid: string): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.BUSINESS, [
        {
            tag: 'verified_name',
            attrs: { jid }
        }
    ])
}

export type BuildCoverPhotoIqInput =
    | {
          readonly op: 'update'
          readonly id: string
          readonly timestamp: string
          readonly token: string
      }
    | {
          readonly op: 'delete'
          readonly id: string
      }

export function buildCoverPhotoIq(input: BuildCoverPhotoIqInput): BinaryNode {
    const attrs: Record<string, string> =
        input.op === 'update'
            ? { op: 'update', id: input.id, ts: input.timestamp, token: input.token }
            : { op: 'delete', id: input.id }
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.BUSINESS, [
        {
            tag: 'business_profile',
            attrs: { v: '3', mutation_type: 'delta' },
            content: [{ tag: 'cover_photo', attrs }]
        }
    ])
}
