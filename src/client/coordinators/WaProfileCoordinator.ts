import type { WaAppStateMutationCoordinator } from '@client/coordinators/WaAppStateMutationCoordinator'
import type { Logger } from '@infra/log/types'
import type { WaMexOperationResponses } from '@mex'
import { parseJidFull, parsePhoneJid } from '@protocol/jid'
import { WA_NODE_TAGS } from '@protocol/nodes'
import type { SignalLidSyncResult } from '@signal/api/SignalDeviceSyncApi'
import {
    buildDeleteProfilePictureIq,
    buildGetDisappearingModeUsyncQueryNode,
    buildGetProfilePictureIq,
    buildGetStatusUsyncQueryNodes,
    buildGetTextStatusUsyncQueryNode,
    buildGetUsernameUsyncQueryNode,
    buildSetDisappearingModeIq,
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

/**
 * Coordinates own/peer profile queries and mutations: picture, status, text
 * status, username, disappearing mode, and LID lookup. Accessed via
 * {@link WaClient.profile}.
 */
export interface WaProfileCoordinator {
    /** Fetches a profile picture envelope (URL + direct path + id). */
    readonly getProfilePicture: (
        jid: string,
        type?: WaProfilePictureType,
        existingId?: string
    ) => Promise<WaProfilePictureResult>
    /**
     * Sets the profile picture for the current account or `targetJid`
     * (group/community admin operation when set). `imageBytes` is uploaded
     * **as-is** - the library does not transcode, resize, or crop, so pass
     * pre-encoded JPEG bytes shaped to WhatsApp's expected picture format
     * (square, JPEG, reasonable resolution). Returns the server-side
     * picture id on success.
     */
    readonly setProfilePicture: (
        imageBytes: Uint8Array,
        targetJid?: string
    ) => Promise<string | null>
    /** Deletes the profile picture for the current account or `targetJid` (admin op for groups/communities). */
    readonly deleteProfilePicture: (targetJid?: string) => Promise<void>
    /** Fetches the legacy "About" status for a single JID. */
    readonly getStatus: (jid: string) => Promise<WaProfileStatusResult>
    /** Sets the current account's legacy "About" status. */
    readonly setStatus: (text: string) => Promise<void>
    /**
     * Sets the account's pushName - the display name broadcast to other
     * users in chats and group participant lists. Writes a `SettingPushName`
     * app-state mutation to sync the account's other devices, persists the
     * name locally, and re-broadcasts an available presence carrying it (the
     * step that propagates the name on primary connections, where no phone
     * re-broadcasts on this device's behalf). Empty strings clear the name.
     */
    readonly setPushName: (name: string) => Promise<void>
    /** Batched usync fetch of picture id + status for many JIDs. */
    readonly getProfiles: (jids: readonly string[]) => Promise<readonly WaProfileInfo[]>
    /** Batched fetch of the disappearing-mode setting per JID. */
    readonly getDisappearingMode: (
        jids: readonly string[]
    ) => Promise<readonly WaDisappearingModeResult[]>
    /**
     * Sets the account-wide default disappearing-mode duration applied to
     * **new** 1:1 chats started by this account. `durationSeconds` is the
     * ephemeral message lifetime (`0` disables, `86400` = 24h, `604800` =
     * 7d, `7776000` = 90d). Existing chats keep their per-chat setting -
     * change that with a system `disappearing_mode` message instead.
     */
    readonly setDisappearingMode: (durationSeconds: number) => Promise<void>
    /** Batched fetch of the modern text-status (emoji + text) per JID. */
    readonly getTextStatuses: (jids: readonly string[]) => Promise<readonly WaTextStatusResult[]>
    /**
     * Updates the current account's text status (the modern "About" emoji +
     * text shown in chat). Passing `text: null` (or `''`) **clears** the
     * status; passing `ephemeralDurationSec` without `text` and `emoji` is
     * silently coerced back to `0` (server rejects expiring empty statuses).
     */
    readonly setTextStatus: (input: WaSetTextStatusInput) => Promise<void>
    /** Batched fetch of username per JID. */
    readonly getUsernames: (jids: readonly string[]) => Promise<readonly WaUsernameResult[]>
    /** Fetches the current account's username record (value, state, recovery pin). */
    readonly getOwnUsername: () => Promise<WaOwnUsernameResult>
    /**
     * Reserves/sets a username on the current account. Returns `true` only
     * when the server reports `'SUCCESS'`; on any other outcome (taken,
     * invalid, rate-limited) it returns `false` without throwing - check the
     * value and consult {@link checkUsernameAvailability} for suggestions.
     */
    readonly setUsername: (input: WaSetUsernameInput) => Promise<boolean>
    /** Deletes the current account's username. Returns `true` on success. */
    readonly deleteUsername: () => Promise<boolean>
    /** Fetches the "About" text for a single JID via MEX. */
    readonly getAboutStatus: (jid: string) => Promise<string | null>
    /** Checks whether a username is available and returns server suggestions. */
    readonly checkUsernameAvailability: (username: string) => Promise<WaUsernameAvailabilityResult>
    /** Sets the username recovery PIN. Returns `true` on success. */
    readonly setUsernameKey: (pin: string) => Promise<boolean>
    /** Resolves LIDs for a list of phone numbers (handles normalization). */
    readonly getLidsByPhoneNumbers: (
        phoneNumbers: readonly string[]
    ) => Promise<readonly SignalLidSyncResult[]>
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
    readonly queryLidsByPhoneJids: (
        phoneJids: readonly string[]
    ) => Promise<readonly SignalLidSyncResult[]>
    /**
     * App-state mutation coordinator. {@link WaProfileCoordinator.setPushName}
     * routes through `mutations.set({ schema: 'SettingPushName', ... })` so
     * the pushName change shares the same flush pipeline as other queued
     * mutations.
     */
    readonly mutations: WaAppStateMutationCoordinator
    /**
     * Applies a pushName change locally: persists the display name and
     * re-broadcasts an available presence carrying it. Expected to be
     * idempotent (a no-op when the name already matches).
     */
    readonly applyOwnPushName: (name: string) => Promise<void>
    /**
     * Resolves the receiver-mode `<tctoken>` node for a contact, echoed back on
     * privacy-gated profile queries (picture get, about/status usync) to prove
     * this account is a trusted contact. Returns `null` when no valid token is
     * held for the JID.
     */
    readonly resolvePrivacyTokenNode: (jid: string) => Promise<BinaryNode | null>
    readonly logger: Logger
}

function parseProfilePicture(result: BinaryNode): WaProfilePictureResult {
    const pictureNode = findNodeChild(result, WA_NODE_TAGS.PICTURE)
    if (!pictureNode) {
        return {}
    }
    return {
        url: pictureNode.attrs.url,
        directPath: pictureNode.attrs.direct_path,
        id: pictureNode.attrs.id,
        type: pictureNode.attrs.type
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
                text: textStatusNode.attrs.text ?? null,
                emoji: emojiNode?.attrs.content ?? null,
                ephemeralDurationSec:
                    parseOptionalSignedInt(textStatusNode.attrs.ephemeral_duration_sec) ?? null,
                lastUpdateTime: parseOptionalInt(textStatusNode.attrs.last_update_time) ?? null
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

/** Builds a {@link WaProfileCoordinator} from its IQ/MEX/SID dependencies. */
export function createProfileCoordinator(
    options: WaProfileCoordinatorOptions
): WaProfileCoordinator {
    const {
        queryWithContext,
        generateSid,
        mexSocket,
        queryLidsByPhoneJids,
        mutations,
        applyOwnPushName,
        resolvePrivacyTokenNode,
        logger
    } = options

    return {
        getProfilePicture: async (jid, type, existingId) => {
            const privacyTokenNode = (await resolvePrivacyTokenNode(jid)) ?? undefined
            const node = buildGetProfilePictureIq(jid, type, existingId, privacyTokenNode)
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
            const privacyTokenNode = await resolvePrivacyTokenNode(jid)
            const usyncNode = buildUsyncIq({
                sid,
                queryProtocolNodes: [queryNodes[1]],
                users: [{ jid, ...(privacyTokenNode ? { content: [privacyTokenNode] } : {}) }]
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

        setPushName: async (name) => {
            // Local apply first: the app-state echo of this same write then
            // collapses into a no-op via applyOwnPushName's idempotency guard.
            await applyOwnPushName(name)
            await mutations.set({ schema: 'SettingPushName', name })
        },

        getProfiles: async (jids) => {
            if (jids.length === 0) {
                return []
            }
            const sid = await generateSid()
            const queryProtocolNodes = buildGetStatusUsyncQueryNodes()
            const users = await Promise.all(
                jids.map(async (jid) => {
                    const privacyTokenNode = await resolvePrivacyTokenNode(jid)
                    return { jid, ...(privacyTokenNode ? { content: [privacyTokenNode] } : {}) }
                })
            )
            const usyncNode = buildUsyncIq({
                sid,
                queryProtocolNodes,
                users
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

        setDisappearingMode: async (durationSeconds) => {
            if (
                !Number.isFinite(durationSeconds) ||
                !Number.isSafeInteger(durationSeconds) ||
                durationSeconds < 0
            ) {
                throw new Error(`invalid durationSeconds: ${durationSeconds}`)
            }
            const node = buildSetDisappearingModeIq(durationSeconds)
            const result = await queryWithContext('profile.setDisappearingMode', node, undefined, {
                durationSeconds
            })
            assertIqResult(result, 'profile.setDisappearingMode')
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
        },

        getLidsByPhoneNumbers: async (phoneNumbers) => {
            if (phoneNumbers.length === 0) return []
            const normalizedPhoneJids = new Array<string>(phoneNumbers.length)
            for (let index = 0; index < phoneNumbers.length; index += 1) {
                normalizedPhoneJids[index] = parsePhoneJid(phoneNumbers[index])
            }
            logger.trace('profile.getLidsByPhoneNumbers', {
                phones: normalizedPhoneJids.length
            })
            return queryLidsByPhoneJids(normalizedPhoneJids)
        }
    }
}
