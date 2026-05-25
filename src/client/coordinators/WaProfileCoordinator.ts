import type { Logger } from '@infra/log/types'
import type { WaMexOperationResponses } from '@mex'
import { parseJidFull } from '@protocol/jid'
import { WA_NODE_TAGS } from '@protocol/nodes'
import {
    buildDeleteProfilePictureIq,
    buildGetDisappearingModeUsyncQueryNode,
    buildGetProfilePictureIq,
    buildGetStatusUsyncQueryNodes,
    buildGetTextStatusUsyncQueryNode,
    buildGetUsernameUsyncQueryNode,
    buildSetProfilePictureIq,
    buildSetStatusIq,
    type WaProfilePictureType
} from '@transport/node/builders/profile'
import {
    buildUsyncIq,
    iterateUsyncUsers,
    parseUsyncResultEnvelope
} from '@transport/node/builders/usync'
import { findNodeChild, getNodeTextContent } from '@transport/node/helpers'
import { runMexQuery, type WaMexQuerySocket } from '@transport/node/mex/client'
import { assertIqResult } from '@transport/node/query'
import { logUsyncProtocolErrors } from '@transport/node/usync'
import type { BinaryNode } from '@transport/types'
import { tryAsRecord, tryAsString } from '@util/coercion'
import { parseOptionalInt, parseOptionalSignedInt } from '@util/primitives'

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

export interface WaTextStatusResult {
    readonly jid: string
    readonly text: string | null
    readonly emoji: string | null
    readonly ephemeralDurationSec: number | null
    readonly lastUpdateTime: number | null
}

export interface WaSetTextStatusInput {
    readonly text?: string | null
    readonly emoji?: string | null
    readonly ephemeralDurationSec?: number | null
}

export interface WaUsernameResult {
    readonly jid: string
    readonly username: string | null
}

export interface WaOwnUsernameResult {
    readonly username: string | null
    readonly state: string | null
    readonly pin: string | null
}

export interface WaSetUsernameInput {
    readonly username: string
    readonly reserved?: boolean
    readonly sessionId?: string
    readonly source?: 'USER_INPUT'
}

export interface WaUsernameAvailabilityResult {
    readonly available: boolean
    readonly suggestions: readonly string[]
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
    readonly getTextStatuses: (jids: readonly string[]) => Promise<readonly WaTextStatusResult[]>
    readonly setTextStatus: (input: WaSetTextStatusInput) => Promise<void>
    readonly getUsernames: (jids: readonly string[]) => Promise<readonly WaUsernameResult[]>
    readonly getOwnUsername: () => Promise<WaOwnUsernameResult>
    readonly setUsername: (input: WaSetUsernameInput) => Promise<boolean>
    readonly deleteUsername: () => Promise<boolean>
    readonly getAboutStatus: (jid: string) => Promise<string | null>
    readonly checkUsernameAvailability: (username: string) => Promise<WaUsernameAvailabilityResult>
    readonly setUsernameKey: (pin: string) => Promise<boolean>
}

interface WaProfileCoordinatorOptions {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>,
        options?: { readonly useSystemId?: boolean }
    ) => Promise<BinaryNode>
    readonly generateSid: () => Promise<string>
    readonly mexSocket: WaMexQuerySocket
    readonly logger: Logger
}

function parseProfilePicture(result: BinaryNode): WaProfilePictureResult {
    const pictureNode = findNodeChild(result, WA_NODE_TAGS.PICTURE)
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
    const pictureNode = findNodeChild(result, WA_NODE_TAGS.PICTURE)
    return pictureNode?.attrs.id ?? null
}

function parseUsyncProfiles(result: BinaryNode): readonly WaProfileInfo[] {
    const userNodes = iterateUsyncUsers(result) ?? []
    const profiles = new Array<WaProfileInfo>(userNodes.length)
    let count = 0

    for (let i = 0; i < userNodes.length; i += 1) {
        const userNode = userNodes[i]
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
            if (child.tag === WA_NODE_TAGS.PICTURE) {
                const pictureId = parseOptionalInt(child.attrs.id as string | undefined)
                if (pictureId !== undefined) {
                    info.pictureId = pictureId
                }
            } else if (child.tag === WA_NODE_TAGS.STATUS) {
                const code = child.attrs.code as string | undefined
                if (parseOptionalInt(code) === 401) {
                    info.status = ''
                } else {
                    info.status = getNodeTextContent(child) || null
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
    const userNodes = iterateUsyncUsers(result) ?? []
    const results = new Array<WaDisappearingModeResult>(userNodes.length)
    let count = 0

    for (let i = 0; i < userNodes.length; i += 1) {
        const userNode = userNodes[i]
        const userContent = userNode.content
        if (!Array.isArray(userContent)) continue

        for (let j = 0; j < userContent.length; j += 1) {
            const child = userContent[j]
            if (child.tag !== WA_NODE_TAGS.DISAPPEARING_MODE) continue

            const errorNode = findNodeChild(child, WA_NODE_TAGS.ERROR)
            if (errorNode) continue

            const duration = parseOptionalInt(child.attrs.duration as string | undefined) ?? 0
            const timestamp = parseOptionalInt(child.attrs.t as string | undefined) ?? 0
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

function parseUsyncTextStatuses(result: BinaryNode): readonly WaTextStatusResult[] {
    const userNodes = iterateUsyncUsers(result) ?? []
    const results = new Array<WaTextStatusResult>(userNodes.length)
    let count = 0

    for (let i = 0; i < userNodes.length; i += 1) {
        const userNode = userNodes[i]
        const jid = userNode.attrs.jid as string | undefined
        if (!jid) continue

        let entry: WaTextStatusResult = {
            jid,
            text: null,
            emoji: null,
            ephemeralDurationSec: null,
            lastUpdateTime: null
        }

        const textStatusNode = findNodeChild(userNode, WA_NODE_TAGS.TEXT_STATUS)
        if (textStatusNode && !findNodeChild(textStatusNode, WA_NODE_TAGS.ERROR)) {
            const emojiNode = findNodeChild(textStatusNode, 'emoji')
            entry = {
                jid,
                text: (textStatusNode.attrs.text as string | undefined) ?? null,
                emoji: emojiNode?.attrs.content ?? null,
                ephemeralDurationSec:
                    parseOptionalSignedInt(
                        textStatusNode.attrs.ephemeral_duration_sec as string | undefined
                    ) ?? null,
                lastUpdateTime:
                    parseOptionalInt(textStatusNode.attrs.last_update_time as string | undefined) ??
                    null
            }
        }

        results[count] = entry
        count += 1
    }
    results.length = count
    return results
}

function parseUsyncUsernames(result: BinaryNode): readonly WaUsernameResult[] {
    const userNodes = iterateUsyncUsers(result) ?? []
    const results = new Array<WaUsernameResult>(userNodes.length)
    let count = 0

    for (let i = 0; i < userNodes.length; i += 1) {
        const userNode = userNodes[i]
        const jid = userNode.attrs.jid as string | undefined
        if (!jid) continue

        const usernameNode = findNodeChild(userNode, WA_NODE_TAGS.USERNAME)
        const hasUsernameError =
            usernameNode && findNodeChild(usernameNode, WA_NODE_TAGS.ERROR) !== undefined
        const username =
            usernameNode && !hasUsernameError ? getNodeTextContent(usernameNode) || null : null

        results[count] = { jid, username }
        count += 1
    }
    results.length = count
    return results
}

function parseOwnUsernameMexResponse(
    data: WaMexOperationResponses['GetUsername'] | null
): WaOwnUsernameResult {
    const info = tryAsRecord(tryAsRecord(data?.xwa2_username_get)?.username_info)
    return {
        username: tryAsString(info?.username),
        state: tryAsString(info?.state),
        pin: tryAsString(info?.pin)
    }
}

function isMexSetUsernameSuccess(data: WaMexOperationResponses['SetUsername'] | null): boolean {
    return data?.xwa2_username_set?.result === 'SUCCESS'
}

function parseAboutStatusMexResponse(
    data: WaMexOperationResponses['FetchAboutStatus'] | null
): string | null {
    return data?.xwa2_users_updates_since?.[0]?.updates?.[0]?.text ?? null
}

function parseUsernameAvailabilityMexResponse(
    data: WaMexOperationResponses['UsernameAvailability'] | null
): WaUsernameAvailabilityResult {
    const check = data?.xwa2_username_check
    const suggestions = (
        Array.isArray(check?.suggestions) ? (check.suggestions as readonly unknown[]) : []
    ).filter((s): s is string => typeof s === 'string')
    return { available: check?.result === 'SUCCESS', suggestions }
}

function isMexUsernameKeySetSuccess(
    data: WaMexOperationResponses['SetUsernameKey'] | null
): boolean {
    return data?.xwa2_username_pin_set?.result === 'SUCCESS'
}

function isMexNotFoundError(error: unknown): boolean {
    return error instanceof Error && /\berrors?:\s*404\b/.test(error.message)
}

function parseUsyncStatus(result: BinaryNode): WaProfileStatusResult {
    const profiles = parseUsyncProfiles(result)
    if (profiles.length === 0) {
        return { status: null }
    }
    return { status: profiles[0].status ?? null }
}

function buildTextStatusMutationInput(input: WaSetTextStatusInput): {
    readonly text: string | null
    readonly emoji: { readonly content: string } | undefined
    readonly ephemeral_duration_sec: number
} {
    const text = input.text === '' ? null : (input.text ?? null)
    const emoji = input.emoji ?? null
    let ephemeralDurationSec = input.ephemeralDurationSec ?? 0
    if (text === null && emoji === null && ephemeralDurationSec !== 0) {
        ephemeralDurationSec = 0
    }
    return {
        text,
        emoji: emoji !== null ? { content: emoji } : undefined,
        ephemeral_duration_sec: ephemeralDurationSec
    }
}

export function createProfileCoordinator(
    options: WaProfileCoordinatorOptions
): WaProfileCoordinator {
    const { queryWithContext, generateSid, mexSocket, logger } = options

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
            logUsyncProtocolErrors(parseUsyncResultEnvelope(result), logger, 'profile.getStatus')
            return parseUsyncStatus(result)
        },

        setStatus: async (text) => {
            const node = buildSetStatusIq(text)
            const result = await queryWithContext('profile.setStatus', node, undefined, undefined, {
                useSystemId: true
            })
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
            logUsyncProtocolErrors(parseUsyncResultEnvelope(result), logger, 'profile.getProfiles')
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
            logUsyncProtocolErrors(
                parseUsyncResultEnvelope(result),
                logger,
                'profile.getDisappearingMode'
            )
            return parseUsyncDisappearingModes(result)
        },

        getTextStatuses: async (jids) => {
            if (jids.length === 0) return []
            const sid = await generateSid()
            const usyncNode = buildUsyncIq({
                sid,
                queryProtocolNodes: [buildGetTextStatusUsyncQueryNode()],
                users: jids.map((jid) => ({ jid }))
            })
            const result = await queryWithContext('profile.getTextStatuses', usyncNode, undefined, {
                count: jids.length
            })
            assertIqResult(result, 'profile.getTextStatuses')
            logUsyncProtocolErrors(
                parseUsyncResultEnvelope(result),
                logger,
                'profile.getTextStatuses'
            )
            return parseUsyncTextStatuses(result)
        },

        setTextStatus: async (input) => {
            await runMexQuery(mexSocket, 'UpdateTextStatus', {
                input: buildTextStatusMutationInput(input)
            })
        },

        getUsernames: async (jids) => {
            if (jids.length === 0) return []
            const sid = await generateSid()
            const usyncNode = buildUsyncIq({
                sid,
                queryProtocolNodes: [buildGetUsernameUsyncQueryNode()],
                users: jids.map((jid) => ({ jid }))
            })
            const result = await queryWithContext('profile.getUsernames', usyncNode, undefined, {
                count: jids.length
            })
            assertIqResult(result, 'profile.getUsernames')
            logUsyncProtocolErrors(parseUsyncResultEnvelope(result), logger, 'profile.getUsernames')
            return parseUsyncUsernames(result)
        },

        getOwnUsername: async () => {
            try {
                const data = await runMexQuery(mexSocket, 'GetUsername', {})
                return parseOwnUsernameMexResponse(data)
            } catch (error) {
                if (isMexNotFoundError(error)) {
                    return { username: null, state: null, pin: null }
                }
                throw error
            }
        },

        setUsername: async (input) => {
            const data = await runMexQuery(mexSocket, 'SetUsername', {
                input: input.username,
                reserved: input.reserved ?? false,
                session_id: input.sessionId ?? '',
                source: input.source ?? 'USER_INPUT'
            })
            return isMexSetUsernameSuccess(data)
        },

        deleteUsername: async () => {
            const data = await runMexQuery(mexSocket, 'SetUsername', {})
            return isMexSetUsernameSuccess(data)
        },

        getAboutStatus: async (jid) => {
            const data = await runMexQuery(mexSocket, 'FetchAboutStatus', {
                user: { user_id: parseJidFull(jid).address.user }
            })
            return parseAboutStatusMexResponse(data)
        },

        checkUsernameAvailability: async (username) => {
            const data = await runMexQuery(mexSocket, 'UsernameAvailability', {
                input: username
            })
            return parseUsernameAvailabilityMexResponse(data)
        },

        setUsernameKey: async (pin) => {
            const data = await runMexQuery(mexSocket, 'SetUsernameKey', { pin })
            return isMexUsernameKeySetSuccess(data)
        }
    }
}
