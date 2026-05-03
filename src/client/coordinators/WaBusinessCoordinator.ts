import { proto } from '@proto'
import {
    buildDeleteCoverPhotoIq,
    buildEditBusinessProfileIq,
    buildGetBusinessProfileIq,
    buildGetVerifiedNameIq,
    buildUpdateCoverPhotoIq,
    type WaEditBusinessProfileInput
} from '@transport/node/builders/business'
import { findNodeChild, getNodeChildren, getNodeTextContent } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { longToNumber } from '@util/primitives'

export interface WaBusinessCategory {
    readonly id: string
    readonly name: string
}

export interface WaBusinessHoursEntry {
    readonly dayOfWeek: string
    readonly mode: string
    readonly openTime?: number
    readonly closeTime?: number
}

export interface WaBusinessHours {
    readonly timezone?: string
    readonly config: readonly WaBusinessHoursEntry[]
}

export interface WaBusinessWebsite {
    readonly url: string
}

export interface WaBusinessProfileResult {
    readonly jid: string
    readonly tag?: string
    readonly description?: string
    readonly address?: string
    readonly email?: string
    readonly websites?: readonly WaBusinessWebsite[]
    readonly categories?: readonly WaBusinessCategory[]
    readonly businessHours?: WaBusinessHours
    readonly latitude?: number
    readonly longitude?: number
    readonly profileOptions?: Readonly<Record<string, string>>
}

export interface WaVerifiedNamePrivacyMode {
    readonly actualActors: number
    readonly hostStorage: number
    readonly privacyModeTs: number
}

export interface WaVerifiedNameResult {
    readonly name?: string
    readonly level?: string
    readonly serial?: string
    readonly isApi: boolean
    readonly isSmb: boolean
    readonly privacyMode?: WaVerifiedNamePrivacyMode
}

export interface WaBusinessCoordinator {
    readonly getBusinessProfile: (
        jids: readonly string[]
    ) => Promise<readonly WaBusinessProfileResult[]>
    readonly editBusinessProfile: (input: WaEditBusinessProfileInput) => Promise<void>
    readonly getVerifiedName: (jid: string) => Promise<WaVerifiedNameResult | null>
    readonly updateCoverPhoto: (id: string, timestamp: string, token: string) => Promise<void>
    readonly deleteCoverPhoto: (id: string) => Promise<void>
}

interface WaBusinessCoordinatorOptions {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
}

function parseBusinessProfiles(result: BinaryNode): readonly WaBusinessProfileResult[] {
    const bizNode = findNodeChild(result, 'business_profile')
    if (!bizNode) {
        return []
    }

    const profileNodes = getNodeChildren(bizNode)
    const results = new Array<WaBusinessProfileResult>(profileNodes.length)
    let count = 0

    for (let i = 0; i < profileNodes.length; i += 1) {
        const profileNode = profileNodes[i]
        if (profileNode.tag !== 'profile') continue
        const jid = profileNode.attrs.jid as string | undefined
        if (!jid) continue

        const entry: {
            jid: string
            tag?: string
            description?: string
            address?: string
            email?: string
            websites?: WaBusinessWebsite[]
            categories?: WaBusinessCategory[]
            businessHours?: WaBusinessHours
            latitude?: number
            longitude?: number
            profileOptions?: Record<string, string>
        } = { jid }

        const tag = profileNode.attrs.tag as string | undefined
        if (tag) entry.tag = tag

        const children = profileNode.content
        if (!Array.isArray(children)) {
            results[count] = entry
            count += 1
            continue
        }

        const websites: WaBusinessWebsite[] = []

        for (let j = 0; j < children.length; j += 1) {
            const child = children[j]
            const text = getNodeTextContent(child)

            switch (child.tag) {
                case 'description':
                    if (text !== undefined) entry.description = text
                    break
                case 'address':
                    if (text !== undefined) entry.address = text
                    break
                case 'email':
                    if (text !== undefined) entry.email = text
                    break
                case 'website':
                    if (text !== undefined) websites.push({ url: text })
                    break
                case 'latitude':
                    if (text !== undefined) {
                        const val = Number.parseFloat(text)
                        if (!Number.isNaN(val)) entry.latitude = val
                    }
                    break
                case 'longitude':
                    if (text !== undefined) {
                        const val = Number.parseFloat(text)
                        if (!Number.isNaN(val)) entry.longitude = val
                    }
                    break
                case 'categories':
                    entry.categories = parseBusinessCategories(child)
                    break
                case 'business_hours':
                    entry.businessHours = parseBusinessHoursNode(child)
                    break
                case 'profile_options':
                    entry.profileOptions = parseProfileOptions(child)
                    break
            }
        }

        if (websites.length > 0) entry.websites = websites
        results[count] = entry
        count += 1
    }
    results.length = count
    return results
}

function parseBusinessCategories(node: BinaryNode): WaBusinessCategory[] {
    const children = getNodeChildren(node)
    const categories = new Array<WaBusinessCategory>(children.length)
    let count = 0
    for (let i = 0; i < children.length; i += 1) {
        const child = children[i]
        if (child.tag !== 'category') continue
        const id = child.attrs.id as string | undefined
        if (!id) continue
        categories[count] = { id, name: getNodeTextContent(child) ?? '' }
        count += 1
    }
    categories.length = count
    return categories
}

function parseBusinessHoursNode(node: BinaryNode): WaBusinessHours {
    const timezone = node.attrs.timezone as string | undefined
    const children = getNodeChildren(node)
    const config = new Array<WaBusinessHoursEntry>(children.length)
    let count = 0
    for (let i = 0; i < children.length; i += 1) {
        const child = children[i]
        if (child.tag !== 'business_hours_config') continue
        const dayOfWeek = child.attrs.day_of_week as string | undefined
        const mode = child.attrs.mode as string | undefined
        if (!dayOfWeek || !mode) continue
        const entry: {
            dayOfWeek: string
            mode: string
            openTime?: number
            closeTime?: number
        } = { dayOfWeek, mode }
        const openTime = child.attrs.open_time as string | undefined
        const closeTime = child.attrs.close_time as string | undefined
        if (openTime) entry.openTime = Number.parseInt(openTime, 10)
        if (closeTime) entry.closeTime = Number.parseInt(closeTime, 10)
        config[count] = entry
        count += 1
    }
    config.length = count
    return { timezone, config }
}

function parseProfileOptions(node: BinaryNode): Record<string, string> {
    const children = getNodeChildren(node)
    const options: Record<string, string> = {}
    for (let i = 0; i < children.length; i += 1) {
        const child = children[i]
        const text = getNodeTextContent(child)
        if (text !== undefined) {
            options[child.tag] = text
        }
    }
    return options
}

const VN_ISSUER_API = 'ent:wa'
const VN_ISSUER_SMB = 'smb:wa'

function parseCertificateContent(
    contentBytes: Uint8Array
): { name?: string; serial?: string; isApi: boolean; isSmb: boolean } | null {
    try {
        const cert = proto.VerifiedNameCertificate.decode(contentBytes)
        if (!cert.details) return null
        const details = proto.VerifiedNameCertificate.Details.decode(cert.details)
        return {
            name: details.verifiedName ?? undefined,
            serial:
                details.serial !== null && details.serial !== undefined
                    ? String(longToNumber(details.serial))
                    : undefined,
            isApi: details.issuer === VN_ISSUER_API,
            isSmb: details.issuer === VN_ISSUER_SMB
        }
    } catch {
        return null
    }
}

function parseVerifiedName(result: BinaryNode): WaVerifiedNameResult | null {
    const vnNode = findNodeChild(result, 'verified_name')
    if (!vnNode) return null

    const level = vnNode.attrs.verified_level as string | undefined
    const attrSerial = vnNode.attrs.serial as string | undefined

    const contentBytes = vnNode.content instanceof Uint8Array ? vnNode.content : undefined
    const certData = contentBytes !== undefined ? parseCertificateContent(contentBytes) : null

    const entry: {
        name?: string
        level?: string
        serial?: string
        isApi: boolean
        isSmb: boolean
        privacyMode?: WaVerifiedNamePrivacyMode
    } = {
        name: certData?.name,
        level,
        serial: attrSerial ?? certData?.serial,
        isApi: certData?.isApi === true,
        isSmb: certData?.isSmb === true
    }

    const actualActors = vnNode.attrs.actual_actors as string | undefined
    const hostStorage = vnNode.attrs.host_storage as string | undefined
    const privacyModeTs = vnNode.attrs.privacy_mode_ts as string | undefined
    if (actualActors !== undefined && hostStorage !== undefined && privacyModeTs !== undefined) {
        entry.privacyMode = {
            actualActors: Number.parseInt(actualActors, 10),
            hostStorage: Number.parseInt(hostStorage, 10),
            privacyModeTs: Number.parseInt(privacyModeTs, 10)
        }
    }

    return entry
}

export function createBusinessCoordinator(
    options: WaBusinessCoordinatorOptions
): WaBusinessCoordinator {
    const { queryWithContext } = options

    return {
        getBusinessProfile: async (jids) => {
            if (jids.length === 0) return []
            const node = buildGetBusinessProfileIq(jids)
            const result = await queryWithContext('business.getProfile', node, undefined, {
                count: jids.length
            })
            assertIqResult(result, 'business.getProfile')
            return parseBusinessProfiles(result)
        },

        editBusinessProfile: async (input) => {
            const node = buildEditBusinessProfileIq(input)
            const result = await queryWithContext('business.editProfile', node)
            assertIqResult(result, 'business.editProfile')
        },

        getVerifiedName: async (jid) => {
            const node = buildGetVerifiedNameIq(jid)
            const result = await queryWithContext('business.getVerifiedName', node, undefined, {
                jid
            })
            assertIqResult(result, 'business.getVerifiedName')
            return parseVerifiedName(result)
        },

        updateCoverPhoto: async (id, timestamp, token) => {
            const node = buildUpdateCoverPhotoIq(id, timestamp, token)
            const result = await queryWithContext('business.updateCoverPhoto', node, undefined, {
                id
            })
            assertIqResult(result, 'business.updateCoverPhoto')
        },

        deleteCoverPhoto: async (id) => {
            const node = buildDeleteCoverPhotoIq(id)
            const result = await queryWithContext('business.deleteCoverPhoto', node, undefined, {
                id
            })
            assertIqResult(result, 'business.deleteCoverPhoto')
        }
    }
}
