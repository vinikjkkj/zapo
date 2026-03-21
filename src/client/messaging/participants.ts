import type { WaGroupEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import { toUserJid } from '@protocol/jid'
import type { WaParticipantsStore } from '@store/contracts/participants.store'
import { toError } from '@util/primitives'

export type GroupParticipantsCache = {
    resolveParticipantUsers(groupJid: string): Promise<readonly string[]>
    refreshParticipantUsers(groupJid: string): Promise<readonly string[]>
    mutateFromGroupEvent(event: WaGroupEvent): Promise<void>
}

export function createGroupParticipantsCache(options: {
    readonly participantsStore: WaParticipantsStore
    readonly queryGroupParticipantJids: (groupJid: string) => Promise<readonly string[]>
    readonly logger: Logger
}): GroupParticipantsCache {
    const { participantsStore, queryGroupParticipantJids, logger } = options

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

    const mergeParticipantUsersIntoCache = async (
        groupJid: string,
        cachedParticipants: readonly string[],
        participantsToAdd: readonly string[]
    ): Promise<void> => {
        if (participantsToAdd.length === 0) {
            return
        }

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

        await participantsStore.upsertGroupParticipants({
            groupJid,
            participants: nextParticipants,
            updatedAtMs: Date.now()
        })
    }

    const removeParticipantUsersFromCache = async (
        groupJid: string,
        cachedParticipants: readonly string[],
        participantsToRemove: readonly string[]
    ): Promise<void> => {
        if (participantsToRemove.length === 0) {
            return
        }

        const removed = new Set(participantsToRemove)
        const nextParticipants = cachedParticipants.filter(
            (participant) => !removed.has(participant)
        )
        if (nextParticipants.length === cachedParticipants.length) {
            return
        }
        if (nextParticipants.length === 0) {
            await participantsStore.deleteGroupParticipants(groupJid)
            return
        }

        await participantsStore.upsertGroupParticipants({
            groupJid,
            participants: nextParticipants,
            updatedAtMs: Date.now()
        })
    }

    const replaceParticipantUsersInCache = async (
        groupJid: string,
        cachedParticipants: readonly string[],
        participantsToReplace: readonly string[],
        replacementParticipants: readonly string[]
    ): Promise<void> => {
        const toReplace = new Set(participantsToReplace)
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
            await participantsStore.deleteGroupParticipants(groupJid)
            return
        }

        await participantsStore.upsertGroupParticipants({
            groupJid,
            participants: nextParticipants,
            updatedAtMs: Date.now()
        })
    }

    const resolveGroupJidForParticipantCacheEvent = (event: WaGroupEvent): string | null => {
        if (event.action === 'linked_group_promote' || event.action === 'linked_group_demote') {
            return event.contextGroupJid ?? event.groupJid ?? null
        }
        return event.groupJid ?? null
    }

    const extractParticipantUsersFromGroupEvent = (event: WaGroupEvent): readonly string[] => {
        const candidates: string[] = []
        for (const participant of event.participants ?? []) {
            if (participant.jid) {
                candidates.push(participant.jid)
            }
            if (participant.lidJid) {
                candidates.push(participant.lidJid)
            }
            if (participant.phoneJid) {
                candidates.push(participant.phoneJid)
            }
        }
        return sanitizeParticipantUsers(candidates)
    }

    const refreshParticipantUsers = async (groupJid: string): Promise<readonly string[]> => {
        const queried = await queryGroupParticipantJids(groupJid)
        const participants = sanitizeParticipantUsers(queried)
        await participantsStore.upsertGroupParticipants({
            groupJid,
            participants,
            updatedAtMs: Date.now()
        })
        return participants
    }

    const resolveParticipantUsers = async (groupJid: string): Promise<readonly string[]> => {
        const cached = await participantsStore.getGroupParticipants(groupJid)
        if (cached && cached.participants.length > 0) {
            return sanitizeParticipantUsers(cached.participants)
        }
        return refreshParticipantUsers(groupJid)
    }

    const mutateFromGroupEvent = async (event: WaGroupEvent): Promise<void> => {
        const groupJid = resolveGroupJidForParticipantCacheEvent(event)
        if (!groupJid) {
            return
        }

        if (event.action === 'delete') {
            await participantsStore.deleteGroupParticipants(groupJid)
            return
        }

        const participantUsers = extractParticipantUsersFromGroupEvent(event)
        if (event.action === 'create') {
            if (participantUsers.length === 0) {
                return
            }
            await participantsStore.upsertGroupParticipants({
                groupJid,
                participants: participantUsers,
                updatedAtMs: Date.now()
            })
            return
        }

        const cached = await participantsStore.getGroupParticipants(groupJid)
        if (!cached || cached.participants.length === 0) {
            return
        }

        const cachedParticipants = sanitizeParticipantUsers(cached.participants)
        if (cachedParticipants.length === 0) {
            return
        }

        if (
            event.action === 'add' ||
            event.action === 'promote' ||
            event.action === 'demote' ||
            event.action === 'linked_group_promote' ||
            event.action === 'linked_group_demote'
        ) {
            await mergeParticipantUsersIntoCache(groupJid, cachedParticipants, participantUsers)
            return
        }

        if (event.action === 'remove') {
            await removeParticipantUsersFromCache(groupJid, cachedParticipants, participantUsers)
            return
        }

        if (event.action === 'modify') {
            const authorUsers = event.authorJid ? sanitizeParticipantUsers([event.authorJid]) : []
            await replaceParticipantUsersInCache(
                groupJid,
                cachedParticipants,
                authorUsers,
                participantUsers
            )
        }
    }

    return {
        resolveParticipantUsers,
        refreshParticipantUsers,
        mutateFromGroupEvent
    }
}
