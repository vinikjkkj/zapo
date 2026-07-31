import type { WaGroupEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import { PromiseDedup } from '@infra/perf/PromiseDedup'
import { toUserJid } from '@protocol/jid'
import type {
    WaGroupMetadataSnapshot,
    WaGroupMetadataStore
} from '@store/contracts/group-metadata.store'
import { toError } from '@util/primitives'

export type GroupMetadataQueryResult = {
    readonly participants: readonly string[]
    readonly ephemeral?: number
    readonly ephemeralTrigger?: number
}

/** Disappearing-message settings a group reports, as sent on outgoing messages. */
export type GroupEphemeralSettings = {
    readonly expirationSeconds: number
    readonly trigger?: number
}

export type GroupMetadataCache = {
    resolveParticipantUsers(groupJid: string): Promise<readonly string[]>
    refreshParticipantUsers(groupJid: string): Promise<readonly string[]>
    getEphemeral(groupJid: string): Promise<number | null>
    resolveEphemeral(groupJid: string): Promise<number | null>
    /**
     * Expiration plus the group's `disappearingMode` trigger in one read, or
     * `null` when the group is not ephemeral. Refreshes a cold cache like
     * {@link resolveEphemeral} does.
     */
    resolveEphemeralSettings(groupJid: string): Promise<GroupEphemeralSettings | null>
    mutateFromGroupEvent(event: WaGroupEvent): Promise<void>
}

export function createGroupMetadataCache(options: {
    readonly groupMetadataStore: WaGroupMetadataStore
    readonly queryGroupMetadata: (groupJid: string) => Promise<GroupMetadataQueryResult>
    readonly logger: Logger
}): GroupMetadataCache {
    const { groupMetadataStore, queryGroupMetadata, logger } = options
    const dedup = new PromiseDedup()
    const pendingMutations = new Map<string, Promise<void>>()

    const sanitizeParticipantUsers = (participants: readonly string[]): readonly string[] => {
        const deduped = new Set<string>()
        for (const participant of participants) {
            if (!participant || !participant.includes('@')) {
                continue
            }
            try {
                deduped.add(toUserJid(participant))
            } catch (error) {
                logger.trace('ignoring malformed participant jid', {
                    participant,
                    message: toError(error).message
                })
            }
        }
        return [...deduped]
    }

    const areParticipantListsEqual = (
        left: readonly string[],
        right: readonly string[]
    ): boolean => {
        if (left.length !== right.length) {
            return false
        }

        for (let index = 0; index < left.length; index += 1) {
            if (left[index] !== right[index]) {
                return false
            }
        }

        return true
    }

    const upsertParticipants = async (
        cached: WaGroupMetadataSnapshot | null,
        groupJid: string,
        participants: readonly string[]
    ): Promise<void> => {
        await groupMetadataStore.upsertGroupMetadata({
            groupJid,
            participants,
            ephemeral: cached?.ephemeral,
            ephemeralTrigger: cached?.ephemeralTrigger,
            updatedAtMs: Date.now()
        })
    }

    const mergeParticipantUsersIntoCache = async (
        groupJid: string,
        cached: WaGroupMetadataSnapshot,
        participantsToAdd: readonly string[]
    ): Promise<void> => {
        if (participantsToAdd.length === 0) {
            return
        }

        const cachedParticipants = cached.participants
        const nextParticipants = [...cachedParticipants]
        const existing = new Set(cachedParticipants)
        for (const participant of participantsToAdd) {
            if (existing.has(participant)) {
                continue
            }
            existing.add(participant)
            nextParticipants.push(participant)
        }

        if (nextParticipants.length === cachedParticipants.length) {
            return
        }

        await upsertParticipants(cached, groupJid, nextParticipants)
    }

    const removeParticipantUsersFromCache = async (
        groupJid: string,
        cached: WaGroupMetadataSnapshot,
        participantsToRemove: readonly string[]
    ): Promise<void> => {
        if (participantsToRemove.length === 0) {
            return
        }

        const removed = new Set(participantsToRemove)
        const cachedParticipants = cached.participants
        const nextParticipants = cachedParticipants.filter(
            (participant) => !removed.has(participant)
        )
        if (nextParticipants.length === cachedParticipants.length) {
            return
        }
        if (nextParticipants.length === 0) {
            await groupMetadataStore.deleteGroupMetadata(groupJid)
            return
        }

        await upsertParticipants(cached, groupJid, nextParticipants)
    }

    const replaceParticipantUsersInCache = async (
        groupJid: string,
        cached: WaGroupMetadataSnapshot,
        participantsToReplace: readonly string[],
        replacementParticipants: readonly string[]
    ): Promise<void> => {
        const toReplace = new Set(participantsToReplace)
        const cachedParticipants = cached.participants
        const nextParticipants = cachedParticipants.filter(
            (participant) => !toReplace.has(participant)
        )
        const existing = new Set(nextParticipants)
        for (const participant of replacementParticipants) {
            if (existing.has(participant)) {
                continue
            }
            existing.add(participant)
            nextParticipants.push(participant)
        }

        if (areParticipantListsEqual(cachedParticipants, nextParticipants)) {
            return
        }
        if (nextParticipants.length === 0) {
            await groupMetadataStore.deleteGroupMetadata(groupJid)
            return
        }

        await upsertParticipants(cached, groupJid, nextParticipants)
    }

    const resolveGroupJidForGroupCacheEvent = (event: WaGroupEvent): string | null => {
        if (event.action === 'linked_group_promote' || event.action === 'linked_group_demote') {
            return event.contextGroupJid ?? event.groupJid ?? null
        }
        return event.groupJid ?? null
    }

    const extractParticipantUsersFromGroupEvent = (event: WaGroupEvent): readonly string[] => {
        const candidates: string[] = []
        for (const participant of event.participants ?? []) {
            const canonical = participant.jid ?? participant.lidJid ?? participant.phoneJid
            if (canonical) {
                candidates.push(canonical)
            }
        }
        return sanitizeParticipantUsers(candidates)
    }

    const refreshParticipantUsers = (groupJid: string): Promise<readonly string[]> =>
        dedup.run(`refresh:${groupJid}`, async () => {
            const queried = await queryGroupMetadata(groupJid)
            const participants = sanitizeParticipantUsers(queried.participants)
            await groupMetadataStore.upsertGroupMetadata({
                groupJid,
                participants,
                ephemeral: queried.ephemeral,
                ephemeralTrigger: queried.ephemeralTrigger,
                updatedAtMs: Date.now()
            })
            return participants
        })

    const resolveParticipantUsers = (groupJid: string): Promise<readonly string[]> =>
        dedup.run(`resolve:${groupJid}`, async () => {
            await pendingMutations.get(groupJid)?.catch(() => undefined)
            const cached = await groupMetadataStore.getGroupMetadata(groupJid)
            if (cached && cached.participants.length > 0) {
                return sanitizeParticipantUsers(cached.participants)
            }
            return refreshParticipantUsers(groupJid)
        })

    const getEphemeral = async (groupJid: string): Promise<number | null> => {
        const cached = await groupMetadataStore.getGroupMetadata(groupJid)
        return cached?.ephemeral ?? null
    }

    const resolveEphemeralSettings = async (
        groupJid: string
    ): Promise<GroupEphemeralSettings | null> => {
        let cached = await groupMetadataStore.getGroupMetadata(groupJid)
        if (!cached) {
            await refreshParticipantUsers(groupJid)
            cached = await groupMetadataStore.getGroupMetadata(groupJid)
        }
        const expirationSeconds = cached?.ephemeral
        if (expirationSeconds === undefined || expirationSeconds <= 0) {
            return null
        }
        return {
            expirationSeconds,
            ...(cached?.ephemeralTrigger !== undefined ? { trigger: cached.ephemeralTrigger } : {})
        }
    }

    const resolveEphemeral = async (groupJid: string): Promise<number | null> =>
        (await resolveEphemeralSettings(groupJid))?.expirationSeconds ?? null

    const applyGroupEvent = async (event: WaGroupEvent): Promise<void> => {
        const groupJid = resolveGroupJidForGroupCacheEvent(event)
        if (!groupJid) {
            return
        }

        if (event.action === 'delete') {
            await groupMetadataStore.deleteGroupMetadata(groupJid)
            return
        }

        if (event.action === 'ephemeral') {
            const cached = await groupMetadataStore.getGroupMetadata(groupJid)
            if (!cached) {
                return
            }
            const nextEphemeral = event.expirationSeconds
            const parsedTrigger = event.mode === undefined ? undefined : Number(event.mode)
            const nextTrigger =
                parsedTrigger !== undefined && Number.isFinite(parsedTrigger)
                    ? parsedTrigger
                    : cached.ephemeralTrigger
            if (cached.ephemeral === nextEphemeral && cached.ephemeralTrigger === nextTrigger) {
                return
            }
            await groupMetadataStore.upsertGroupMetadata({
                groupJid,
                participants: cached.participants,
                ephemeral: nextEphemeral,
                ephemeralTrigger: nextTrigger,
                updatedAtMs: Date.now()
            })
            return
        }

        const participantUsers = extractParticipantUsersFromGroupEvent(event)
        if (event.action === 'create') {
            if (participantUsers.length === 0) {
                return
            }
            const existing = await groupMetadataStore.getGroupMetadata(groupJid)
            await groupMetadataStore.upsertGroupMetadata({
                groupJid,
                participants: participantUsers,
                ephemeral: existing?.ephemeral,
                ephemeralTrigger: existing?.ephemeralTrigger,
                updatedAtMs: Date.now()
            })
            return
        }

        const cached = await groupMetadataStore.getGroupMetadata(groupJid)
        if (!cached || cached.participants.length === 0) {
            return
        }

        const cachedParticipants = sanitizeParticipantUsers(cached.participants)
        if (cachedParticipants.length === 0) {
            return
        }

        const cachedWithSanitized: WaGroupMetadataSnapshot = {
            ...cached,
            participants: cachedParticipants
        }

        if (
            event.action === 'add' ||
            event.action === 'promote' ||
            event.action === 'demote' ||
            event.action === 'linked_group_promote' ||
            event.action === 'linked_group_demote'
        ) {
            await mergeParticipantUsersIntoCache(groupJid, cachedWithSanitized, participantUsers)
            return
        }

        if (event.action === 'remove') {
            await removeParticipantUsersFromCache(groupJid, cachedWithSanitized, participantUsers)
            return
        }

        if (event.action === 'modify') {
            const authorUsers = event.authorJid ? sanitizeParticipantUsers([event.authorJid]) : []
            await replaceParticipantUsersInCache(
                groupJid,
                cachedWithSanitized,
                authorUsers,
                participantUsers
            )
        }
    }

    const mutateFromGroupEvent = (event: WaGroupEvent): Promise<void> => {
        const groupJid = resolveGroupJidForGroupCacheEvent(event)
        if (!groupJid) {
            return applyGroupEvent(event)
        }
        const prev = pendingMutations.get(groupJid) ?? Promise.resolve()
        const next = prev.then(
            () => applyGroupEvent(event),
            () => applyGroupEvent(event)
        )
        pendingMutations.set(groupJid, next)
        return next.finally(() => {
            if (pendingMutations.get(groupJid) === next) {
                pendingMutations.delete(groupJid)
            }
        })
    }

    return {
        resolveParticipantUsers,
        refreshParticipantUsers,
        getEphemeral,
        resolveEphemeral,
        resolveEphemeralSettings,
        mutateFromGroupEvent
    }
}
