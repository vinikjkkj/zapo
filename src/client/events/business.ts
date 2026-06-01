import { createUnhandledIncomingNodeEvent } from '@client/events/incoming'
import type {
    WaBusinessCategory,
    WaBusinessCollectionUpdate,
    WaBusinessEvent,
    WaBusinessFeatureFlag,
    WaBusinessHours,
    WaBusinessHoursEntry,
    WaBusinessProfileResult,
    WaBusinessSubscription,
    WaBusinessWebsite,
    WaIncomingUnhandledStanzaEvent,
    WaVerifiedNameResult
} from '@client/types'
import { proto } from '@proto'
import type { WaBusinessHoursDay, WaBusinessHoursMode } from '@protocol/business'
import { WA_BUSINESS_NOTIFICATION_TAGS, WA_NOTIFICATION_TYPES } from '@protocol/constants'
import { WA_NODE_TAGS } from '@protocol/nodes'
import {
    findNodeChild,
    getNodeChildren,
    getNodeChildrenByTag,
    getNodeTextContent
} from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt } from '@util/primitives'

interface WaParseBusinessNotificationResult {
    readonly events: readonly WaBusinessEvent[]
    readonly unhandled: readonly WaIncomingUnhandledStanzaEvent[]
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
                    ? details.serial.toString()
                    : undefined,
            isApi: details.issuer === VN_ISSUER_API,
            isSmb: details.issuer === VN_ISSUER_SMB
        }
    } catch {
        return null
    }
}

export function parseVerifiedNameNode(node: BinaryNode): WaVerifiedNameResult | null {
    if (node.tag !== WA_BUSINESS_NOTIFICATION_TAGS.VERIFIED_NAME) return null

    const level = node.attrs.verified_level as string | undefined
    const attrSerial = node.attrs.serial as string | undefined

    const contentBytes = node.content instanceof Uint8Array ? node.content : undefined
    const certData = contentBytes !== undefined ? parseCertificateContent(contentBytes) : null

    const entry: {
        name?: string
        level?: string
        serial?: string
        isApi: boolean
        isSmb: boolean
        privacyMode?: WaVerifiedNameResult['privacyMode']
    } = {
        name: certData?.name,
        level,
        serial: attrSerial ?? certData?.serial,
        isApi: certData?.isApi === true,
        isSmb: certData?.isSmb === true
    }

    const actualActors = node.attrs.actual_actors as string | undefined
    const hostStorage = node.attrs.host_storage as string | undefined
    const privacyModeTs = node.attrs.privacy_mode_ts as string | undefined
    if (actualActors !== undefined && hostStorage !== undefined && privacyModeTs !== undefined) {
        entry.privacyMode = {
            actualActors: Number.parseInt(actualActors, 10),
            hostStorage: Number.parseInt(hostStorage, 10),
            privacyModeTs: Number.parseInt(privacyModeTs, 10)
        }
    }

    return entry
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
        const dayOfWeek = child.attrs.day_of_week as WaBusinessHoursDay | undefined
        const mode = child.attrs.mode as WaBusinessHoursMode | undefined
        if (!dayOfWeek || !mode) continue
        const entry: {
            dayOfWeek: WaBusinessHoursDay
            mode: WaBusinessHoursMode
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

export function parseBusinessProfileNode(node: BinaryNode): WaBusinessProfileResult | null {
    if (node.tag !== WA_BUSINESS_NOTIFICATION_TAGS.PROFILE) return null
    const jid = node.attrs.jid as string | undefined
    if (!jid) return null

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

    const tag = node.attrs.tag as string | undefined
    if (tag) entry.tag = tag

    const children = node.content
    if (!Array.isArray(children)) {
        return entry
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
    return entry
}

function parseSubscriptionsList(node: BinaryNode): readonly WaBusinessSubscription[] {
    const subs: WaBusinessSubscription[] = []
    for (const sub of getNodeChildrenByTag(node, 'subscription')) {
        const id = sub.attrs.id as string | undefined
        const status = sub.attrs.status as string | undefined
        if (!id || !status) continue
        subs.push({
            id,
            status,
            tier: parseOptionalInt(sub.attrs.subscription_tier),
            source: sub.attrs.source,
            startTime: parseOptionalInt(sub.attrs.subscription_start_time),
            creationTime: parseOptionalInt(sub.attrs.subscription_creation_time),
            expirationDate: parseOptionalInt(sub.attrs.subscription_end_time)
        })
    }
    return subs
}

function parseFeatureFlagsList(node: BinaryNode): readonly WaBusinessFeatureFlag[] {
    const flags: WaBusinessFeatureFlag[] = []
    for (const flag of getNodeChildrenByTag(node, 'feature_flag')) {
        const name = flag.attrs.name as string | undefined
        if (!name) continue
        const enabled = (flag.attrs.enabled ?? '').toLowerCase() === 'true'
        flags.push({
            name,
            enabled,
            expirationTime: parseOptionalInt(flag.attrs.expiration_time),
            limit: parseOptionalInt(flag.attrs.limit)
        })
    }
    return flags
}

function parseProductIds(catalogNode: BinaryNode): readonly string[] {
    const ids: string[] = []
    for (const product of getNodeChildrenByTag(catalogNode, 'product')) {
        const idNode = findNodeChild(product, WA_NODE_TAGS.ID)
        if (!idNode) continue
        const text = getNodeTextContent(idNode)
        if (text) ids.push(text)
    }
    return ids
}

function parseCollectionUpdates(catalogNode: BinaryNode): readonly WaBusinessCollectionUpdate[] {
    const collections: WaBusinessCollectionUpdate[] = []
    for (const collection of getNodeChildrenByTag(catalogNode, 'collection')) {
        const id = collection.attrs.id as string | undefined
        if (!id) continue
        const entry: {
            id: string
            reviewStatus?: string
            rejectReason?: string
            commerceUrl?: string
        } = { id }
        const statusInfo = findNodeChild(collection, 'status_info')
        if (statusInfo) {
            const statusNode = findNodeChild(statusInfo, WA_NODE_TAGS.STATUS)
            if (statusNode) {
                const text = getNodeTextContent(statusNode)
                if (text) entry.reviewStatus = text
            }
            const rejectNode = findNodeChild(statusInfo, 'reject_reason')
            if (rejectNode) {
                const text = getNodeTextContent(rejectNode)
                if (text) entry.rejectReason = text
            }
            const commerceNode = findNodeChild(statusInfo, 'commerce_url')
            if (commerceNode) {
                const text = getNodeTextContent(commerceNode)
                if (text) entry.commerceUrl = text
            }
        }
        collections.push(entry)
    }
    return collections
}

function createBaseBusinessEvent(notificationNode: BinaryNode): Omit<WaBusinessEvent, 'action'> {
    return {
        rawNode: notificationNode,
        stanzaId: notificationNode.attrs.id,
        chatJid: notificationNode.attrs.from,
        stanzaType: notificationNode.attrs.type,
        offline: notificationNode.attrs.offline !== undefined,
        timestampSeconds: parseOptionalInt(notificationNode.attrs.t)
    }
}

function parseSingleBusinessEvent(notificationNode: BinaryNode): WaBusinessEvent | null {
    const base = createBaseBusinessEvent(notificationNode)

    const verifiedName = findNodeChild(
        notificationNode,
        WA_BUSINESS_NOTIFICATION_TAGS.VERIFIED_NAME
    )
    if (verifiedName) {
        const vnJid = verifiedName.attrs.jid as string | undefined
        if (vnJid) {
            const parsed = parseVerifiedNameNode(verifiedName)
            if (!parsed) return null
            return {
                ...base,
                action: 'verified_name_update',
                bizJid: vnJid,
                verifiedName: parsed
            }
        }
        const vnHash = verifiedName.attrs.hash as string | undefined
        if (vnHash) {
            return {
                ...base,
                action: 'verified_name_stale',
                bizHash: vnHash
            }
        }
        return null
    }

    const remove = findNodeChild(notificationNode, WA_BUSINESS_NOTIFICATION_TAGS.REMOVE)
    if (remove) {
        const rmJid = remove.attrs.jid as string | undefined
        if (rmJid) {
            return { ...base, action: 'business_removed', bizJid: rmJid }
        }
        const rmHash = remove.attrs.hash as string | undefined
        if (rmHash) {
            return { ...base, action: 'business_removed', bizHash: rmHash }
        }
        return null
    }

    const profile = findNodeChild(notificationNode, WA_BUSINESS_NOTIFICATION_TAGS.PROFILE)
    if (profile) {
        const hash = profile.attrs.hash as string | undefined
        if (hash) {
            return { ...base, action: 'profile_update', bizHash: hash }
        }
        const fromJid = notificationNode.attrs.from as string | undefined
        return { ...base, action: 'profile_update', bizJid: fromJid }
    }

    const catalog = findNodeChild(notificationNode, WA_BUSINESS_NOTIFICATION_TAGS.PRODUCT_CATALOG)
    if (catalog) {
        const fromJid = notificationNode.attrs.from as string | undefined
        if (findNodeChild(catalog, 'product')) {
            return {
                ...base,
                action: 'product_update',
                bizJid: fromJid,
                productIds: parseProductIds(catalog)
            }
        }
        if (findNodeChild(catalog, 'collection')) {
            return {
                ...base,
                action: 'collection_update',
                bizJid: fromJid,
                collections: parseCollectionUpdates(catalog)
            }
        }
        return null
    }

    const subscriptions = findNodeChild(
        notificationNode,
        WA_BUSINESS_NOTIFICATION_TAGS.SUBSCRIPTIONS
    )
    const featureFlags = findNodeChild(
        notificationNode,
        WA_BUSINESS_NOTIFICATION_TAGS.FEATURE_FLAGS
    )
    if (subscriptions || featureFlags) {
        return {
            ...base,
            action: 'subscriptions_update',
            bizJid: notificationNode.attrs.from,
            subscriptions: subscriptions ? parseSubscriptionsList(subscriptions) : [],
            featureFlags: featureFlags ? parseFeatureFlagsList(featureFlags) : []
        }
    }

    return null
}

export function parseBusinessNotificationEvents(
    notificationNode: BinaryNode
): WaParseBusinessNotificationResult {
    if (
        notificationNode.tag !== WA_NODE_TAGS.NOTIFICATION ||
        notificationNode.attrs.type !== WA_NOTIFICATION_TYPES.BUSINESS
    ) {
        return { events: [], unhandled: [] }
    }

    try {
        const event = parseSingleBusinessEvent(notificationNode)
        if (event) {
            return { events: [event], unhandled: [] }
        }
        const firstChild = getNodeChildren(notificationNode)[0]
        const childTag = firstChild?.tag ?? 'empty'
        return {
            events: [],
            unhandled: [
                createUnhandledIncomingNodeEvent(
                    notificationNode,
                    `notification.${WA_NOTIFICATION_TYPES.BUSINESS}.${childTag}.not_supported`
                )
            ]
        }
    } catch {
        return {
            events: [],
            unhandled: [
                createUnhandledIncomingNodeEvent(
                    notificationNode,
                    `notification.${WA_NOTIFICATION_TYPES.BUSINESS}.parse_failed`
                )
            ]
        }
    }
}
