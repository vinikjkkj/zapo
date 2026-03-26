import type { WaProfilePictureType } from '@transport/node/builders/profile'
import {
    buildDeleteProfilePictureIq,
    buildGetDisappearingModeUsyncQueryNode,
    buildGetProfilePictureIq,
    buildGetStatusUsyncQueryNodes,
    buildSetProfilePictureIq,
    buildSetStatusIq
} from '@transport/node/builders/profile'
import { buildUsyncIq } from '@transport/node/builders/usync'
import { findNodeChild, getNodeChildren } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { TEXT_DECODER } from '@util/bytes'

export interface WaProfilePictureResult {
    readonly url?: string
    readonly directPath?: string
    readonly id?: string
    readonly type?: string
}

export interface WaProfileStatusResult {
    readonly status: string | null
}

export interface WaProfileInfo {
    readonly jid: string
    readonly pictureId?: number
    readonly status?: string | null
}

export interface WaDisappearingModeResult {
    readonly duration: number
    readonly timestamp: number
    readonly ephemeralityDisabled?: boolean
}

export interface WaProfileCoordinator {
    readonly getProfilePicture: (
        jid: string,
        type?: WaProfilePictureType,
        existingId?: string
    ) => Promise<WaProfilePictureResult>
    readonly setProfilePicture: (
        imageBytes: Uint8Array,
        targetJid?: string
    ) => Promise<string | null>
    readonly deleteProfilePicture: (targetJid?: string) => Promise<void>
    readonly getStatus: (jid: string) => Promise<WaProfileStatusResult>
    readonly setStatus: (text: string) => Promise<void>
    readonly getProfiles: (jids: readonly string[]) => Promise<readonly WaProfileInfo[]>
    readonly getDisappearingMode: (
        jids: readonly string[]
    ) => Promise<readonly WaDisappearingModeResult[]>
}

interface WaProfileCoordinatorOptions {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly generateSid: () => Promise<string>
}

function parseProfilePicture(result: BinaryNode): WaProfilePictureResult {
    const pictureNode = findNodeChild(result, 'picture')
    if (!pictureNode) {
        return {}
    }
    return {
        url: pictureNode.attrs.url as string | undefined,
        directPath: pictureNode.attrs.direct_path as string | undefined,
        id: pictureNode.attrs.id as string | undefined,
        type: pictureNode.attrs.type as string | undefined
    }
}

function parseSetPictureResult(result: BinaryNode): string | null {
    const pictureNode = findNodeChild(result, 'picture')
    return pictureNode?.attrs.id ?? null
}

function parseUsyncProfiles(result: BinaryNode): readonly WaProfileInfo[] {
    const usyncNode = findNodeChild(result, 'usync')
    if (!usyncNode) {
        return []
    }
    const listNode = findNodeChild(usyncNode, 'list')
    if (!listNode) {
        return []
    }

    const userNodes = getNodeChildren(listNode)
    const profiles = new Array<WaProfileInfo>(userNodes.length)
    let count = 0

    for (let i = 0; i < userNodes.length; i += 1) {
        const userNode = userNodes[i]
        if (userNode.tag !== 'user') {
            continue
        }
        const jid = userNode.attrs.jid as string | undefined
        if (!jid) {
            continue
        }

        const info: { jid: string; pictureId?: number; status?: string | null } = { jid }
        const userContent = userNode.content
        if (!Array.isArray(userContent)) {
            profiles[count] = info
            count += 1
            continue
        }

        for (let j = 0; j < userContent.length; j += 1) {
            const child = userContent[j]
            if (child.tag === 'picture') {
                const idAttr = child.attrs.id as string | undefined
                if (idAttr) {
                    const parsed = Number.parseInt(idAttr, 10)
                    if (Number.isSafeInteger(parsed)) {
                        info.pictureId = parsed
                    }
                }
            } else if (child.tag === 'status') {
                const code = child.attrs.code as string | undefined
                if (code !== undefined && Number.parseInt(code, 10) === 401) {
                    info.status = ''
                } else {
                    const content = child.content
                    if (content instanceof Uint8Array) {
                        const decoded = TEXT_DECODER.decode(content)
                        info.status = decoded.length > 0 ? decoded : null
                    } else if (typeof content === 'string') {
                        info.status = content.length > 0 ? content : null
                    } else {
                        info.status = null
                    }
                }
            }
        }

        profiles[count] = info
        count += 1
    }
    profiles.length = count
    return profiles
}

function parseUsyncDisappearingModes(result: BinaryNode): readonly WaDisappearingModeResult[] {
    const usyncNode = findNodeChild(result, 'usync')
    if (!usyncNode) return []
    const listNode = findNodeChild(usyncNode, 'list')
    if (!listNode) return []

    const userNodes = getNodeChildren(listNode)
    const results = new Array<WaDisappearingModeResult>(userNodes.length)
    let count = 0

    for (let i = 0; i < userNodes.length; i += 1) {
        const userNode = userNodes[i]
        if (userNode.tag !== 'user') continue
        const userContent = userNode.content
        if (!Array.isArray(userContent)) continue

        for (let j = 0; j < userContent.length; j += 1) {
            const child = userContent[j]
            if (child.tag !== 'disappearing_mode') continue

            const errorNode = findNodeChild(child, 'error')
            if (errorNode) continue

            const duration = Number.parseInt((child.attrs.duration as string) ?? '0', 10)
            const timestamp = Number.parseInt((child.attrs.t as string) ?? '0', 10)
            const entry: {
                duration: number
                timestamp: number
                ephemeralityDisabled?: boolean
            } = { duration, timestamp }

            if (child.attrs.ephemerality_disabled === 'true') {
                entry.ephemeralityDisabled = true
            }

            results[count] = entry
            count += 1
        }
    }
    results.length = count
    return results
}

function parseUsyncStatus(result: BinaryNode): WaProfileStatusResult {
    const profiles = parseUsyncProfiles(result)
    if (profiles.length === 0) {
        return { status: null }
    }
    return { status: profiles[0].status ?? null }
}

export function createProfileCoordinator(
    options: WaProfileCoordinatorOptions
): WaProfileCoordinator {
    const { queryWithContext, generateSid } = options

    return {
        getProfilePicture: async (jid, type, existingId) => {
            const node = buildGetProfilePictureIq(jid, type, existingId)
            const result = await queryWithContext('profile.getPicture', node, undefined, {
                jid,
                type: type ?? 'preview'
            })
            assertIqResult(result, 'profile.getPicture')
            return parseProfilePicture(result)
        },

        setProfilePicture: async (imageBytes, targetJid) => {
            const node = buildSetProfilePictureIq(imageBytes, targetJid)
            const result = await queryWithContext('profile.setPicture', node, undefined, {
                targetJid,
                size: imageBytes.length
            })
            assertIqResult(result, 'profile.setPicture')
            return parseSetPictureResult(result)
        },

        deleteProfilePicture: async (targetJid) => {
            const node = buildDeleteProfilePictureIq(targetJid)
            const result = await queryWithContext('profile.deletePicture', node, undefined, {
                targetJid
            })
            assertIqResult(result, 'profile.deletePicture')
        },

        getStatus: async (jid) => {
            const sid = await generateSid()
            const queryNodes = buildGetStatusUsyncQueryNodes()
            const usyncNode = buildUsyncIq({
                sid,
                queryProtocolNodes: [queryNodes[1]],
                users: [{ jid }]
            })
            const result = await queryWithContext('profile.getStatus', usyncNode, undefined, {
                jid
            })
            assertIqResult(result, 'profile.getStatus')
            return parseUsyncStatus(result)
        },

        setStatus: async (text) => {
            const node = buildSetStatusIq(text)
            const result = await queryWithContext('profile.setStatus', node)
            assertIqResult(result, 'profile.setStatus')
        },

        getProfiles: async (jids) => {
            if (jids.length === 0) {
                return []
            }
            const sid = await generateSid()
            const queryProtocolNodes = buildGetStatusUsyncQueryNodes()
            const usyncNode = buildUsyncIq({
                sid,
                queryProtocolNodes,
                users: jids.map((jid) => ({ jid }))
            })
            const result = await queryWithContext('profile.getProfiles', usyncNode, undefined, {
                count: jids.length
            })
            assertIqResult(result, 'profile.getProfiles')
            return parseUsyncProfiles(result)
        },

        getDisappearingMode: async (jids) => {
            if (jids.length === 0) return []
            const sid = await generateSid()
            const usyncNode = buildUsyncIq({
                sid,
                queryProtocolNodes: [buildGetDisappearingModeUsyncQueryNode()],
                users: jids.map((jid) => ({ jid }))
            })
            const result = await queryWithContext(
                'profile.getDisappearingMode',
                usyncNode,
                undefined,
                { count: jids.length }
            )
            assertIqResult(result, 'profile.getDisappearingMode')
            return parseUsyncDisappearingModes(result)
        }
    }
}
