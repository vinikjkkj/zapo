import type { BuildAbPropsResultInput } from '../protocol/iq/abprops'
import type { FakeBusinessProfile } from '../protocol/iq/business'
import type { FakeGroupParticipantAction } from '../protocol/iq/group-ops'
import {
    FAKE_DEFAULT_PRIVACY_SETTINGS,
    type FakePrivacyCategoryName,
    type FakePrivacySettingsState
} from '../protocol/iq/privacy'
import type { FakePrivacyTokenIssue } from '../protocol/iq/privacy-token'
import type { FakeProfilePictureResult } from '../protocol/iq/profile'

import type { FakePeer } from './FakePeer'

export interface FakeGroupMetadata {
    readonly groupJid: string
    readonly subject: string
    readonly description?: string
    readonly creator: string
    readonly creationSeconds: number
    readonly participants: readonly FakePeer[]
}

export interface MutableFakeGroup {
    groupJid: string
    subject: string
    description: string | undefined
    creator: string
    creationSeconds: number
    participants: FakePeer[]
}

export interface CapturedGroupOp {
    readonly action: 'create' | FakeGroupParticipantAction | 'subject' | 'description' | 'leave'
    readonly groupJid: string
    readonly participantJids?: readonly string[]
    readonly subject?: string
    readonly description?: string | null
}

export interface CapturedPrivacySet {
    readonly category: FakePrivacyCategoryName
    readonly value: string
}

export interface CapturedBlocklistChange {
    readonly jid: string
    readonly action: 'block' | 'unblock'
}

export interface CapturedProfilePictureSet {
    readonly targetJid: string | undefined
    readonly imageBytes: Uint8Array
}

export interface CapturedStatusSet {
    readonly text: string
}

export interface CapturedDirtyBitsClear {
    readonly bits: ReadonlyArray<{ readonly type: string; readonly timestamp: number }>
}

export function toUserJidPart(deviceJid: string): string {
    const atIdx = deviceJid.indexOf('@')
    if (atIdx < 0) return deviceJid
    const userPart = deviceJid.slice(0, atIdx)
    const server = deviceJid.slice(atIdx + 1)
    const colonIdx = userPart.indexOf(':')
    const baseUser = colonIdx < 0 ? userPart : userPart.slice(0, colonIdx)
    return `${baseUser}@${server}`
}

export function toDeviceIdPart(deviceJid: string): number {
    const atIdx = deviceJid.indexOf('@')
    if (atIdx < 0) return 0
    const userPart = deviceJid.slice(0, atIdx)
    const colonIdx = userPart.indexOf(':')
    if (colonIdx < 0) return 0
    const parsed = Number.parseInt(userPart.slice(colonIdx + 1), 10)
    return Number.isFinite(parsed) ? parsed : 0
}

export class ServerRegistries {
    public readonly peerRegistry = new Map<string, FakePeer>()
    private readonly deviceIdsByUser = new Map<string, number[]>()
    public readonly groupRegistry = new Map<string, MutableFakeGroup>()
    public privacySettings: FakePrivacySettingsState = FAKE_DEFAULT_PRIVACY_SETTINGS
    public readonly blocklistJids = new Set<string>()
    public readonly profilePicturesByJid = new Map<string, FakeProfilePictureResult>()
    public readonly businessProfilesByJid = new Map<string, FakeBusinessProfile>()
    public latestStatusText: string | null = null
    public readonly issuedPrivacyTokens = new Map<string, FakePrivacyTokenIssue>()
    public abPropsInput: BuildAbPropsResultInput = {}

    public readonly groupOpListeners = new Set<(op: CapturedGroupOp) => void>()
    public readonly privacySetListeners = new Set<(op: CapturedPrivacySet) => void>()
    public readonly blocklistChangeListeners = new Set<(op: CapturedBlocklistChange) => void>()
    public readonly profilePictureSetListeners = new Set<(op: CapturedProfilePictureSet) => void>()
    public readonly statusSetListeners = new Set<(op: CapturedStatusSet) => void>()
    public readonly logoutListeners = new Set<() => void>()
    public readonly privacyTokenIssueListeners = new Set<(op: FakePrivacyTokenIssue) => void>()
    public readonly dirtyBitsClearListeners = new Set<(op: CapturedDirtyBitsClear) => void>()

    public onOutboundGroupOp(listener: (op: CapturedGroupOp) => void): () => void {
        this.groupOpListeners.add(listener)
        return () => {
            this.groupOpListeners.delete(listener)
        }
    }

    public onOutboundPrivacySet(listener: (op: CapturedPrivacySet) => void): () => void {
        this.privacySetListeners.add(listener)
        return () => {
            this.privacySetListeners.delete(listener)
        }
    }

    public onOutboundBlocklistChange(listener: (op: CapturedBlocklistChange) => void): () => void {
        this.blocklistChangeListeners.add(listener)
        return () => {
            this.blocklistChangeListeners.delete(listener)
        }
    }

    public onOutboundProfilePictureSet(
        listener: (op: CapturedProfilePictureSet) => void
    ): () => void {
        this.profilePictureSetListeners.add(listener)
        return () => {
            this.profilePictureSetListeners.delete(listener)
        }
    }

    public onOutboundStatusSet(listener: (op: CapturedStatusSet) => void): () => void {
        this.statusSetListeners.add(listener)
        return () => {
            this.statusSetListeners.delete(listener)
        }
    }

    public onLogout(listener: () => void): () => void {
        this.logoutListeners.add(listener)
        return () => {
            this.logoutListeners.delete(listener)
        }
    }

    public onOutboundPrivacyTokenIssue(listener: (op: FakePrivacyTokenIssue) => void): () => void {
        this.privacyTokenIssueListeners.add(listener)
        return () => {
            this.privacyTokenIssueListeners.delete(listener)
        }
    }

    public onOutboundDirtyBitsClear(listener: (op: CapturedDirtyBitsClear) => void): () => void {
        this.dirtyBitsClearListeners.add(listener)
        return () => {
            this.dirtyBitsClearListeners.delete(listener)
        }
    }

    public privacyTokensIssuedSnapshot(): ReadonlyMap<string, FakePrivacyTokenIssue> {
        return new Map(this.issuedPrivacyTokens)
    }

    public privacySettingsSnapshot(): FakePrivacySettingsState {
        return this.privacySettings
    }

    public blocklistSnapshot(): readonly string[] {
        return [...this.blocklistJids].sort()
    }

    public latestStatusSnapshot(): string | null {
        return this.latestStatusText
    }

    public groupRegistrySnapshot(): ReadonlyMap<string, FakeGroupMetadata> {
        const out = new Map<string, FakeGroupMetadata>()
        for (const [groupJid, metadata] of this.groupRegistry) {
            out.set(groupJid, {
                groupJid: metadata.groupJid,
                subject: metadata.subject,
                description: metadata.description,
                creator: metadata.creator,
                creationSeconds: metadata.creationSeconds,
                participants: metadata.participants
            })
        }
        return out
    }

    public setProfilePictureRecord(jid: string, picture: FakeProfilePictureResult): void {
        this.profilePicturesByJid.set(jid, picture)
    }

    public setBusinessProfileRecord(jid: string, profile: FakeBusinessProfile): void {
        this.businessProfilesByJid.set(jid, profile)
    }

    public setAbProps(input: BuildAbPropsResultInput): void {
        this.abPropsInput = input
    }

    public setPrivacyDisallowedList(
        category: FakePrivacyCategoryName,
        jids: readonly string[]
    ): void {
        this.privacySettings = {
            ...this.privacySettings,
            disallowed: {
                ...this.privacySettings.disallowed,
                [category]: [...jids]
            }
        }
    }

    public createFakeGroup(input: {
        readonly groupJid: string
        readonly subject?: string
        readonly description?: string
        readonly participants: readonly FakePeer[]
        readonly creator?: string
        readonly creationSeconds?: number
    }): FakeGroupMetadata {
        if (input.participants.length === 0) {
            throw new Error('createFakeGroup requires at least one participant')
        }
        const creator = input.creator ?? toUserJidPart(input.participants[0].jid)
        const mutable: MutableFakeGroup = {
            groupJid: input.groupJid,
            subject: input.subject ?? 'Fake Group',
            description: input.description,
            creator,
            creationSeconds: input.creationSeconds ?? Math.floor(Date.now() / 1_000),
            participants: [...input.participants]
        }
        this.groupRegistry.set(input.groupJid, mutable)
        return {
            groupJid: mutable.groupJid,
            subject: mutable.subject,
            description: mutable.description,
            creator: mutable.creator,
            creationSeconds: mutable.creationSeconds,
            participants: mutable.participants
        }
    }

    public mutatePrivacySettings(category: FakePrivacyCategoryName, value: string): void {
        const next = {
            ...this.privacySettings,
            settings: {
                ...this.privacySettings.settings,
                [category]: value
            }
        }
        this.privacySettings = next
    }

    public mutateBlocklist(action: 'block' | 'unblock', jid: string): void {
        if (action === 'block') {
            this.blocklistJids.add(jid)
        } else {
            this.blocklistJids.delete(jid)
        }
    }

    public notifyGroupOp(op: CapturedGroupOp): void {
        for (const listener of this.groupOpListeners) {
            try {
                listener(op)
            } catch (error) {
                void error
            }
        }
    }

    public registerPeer(peer: FakePeer): void {
        this.peerRegistry.set(peer.jid, peer)
        const userJid = toUserJidPart(peer.jid)
        const deviceId = toDeviceIdPart(peer.jid)
        const ids = this.deviceIdsByUser.get(userJid)
        if (ids) {
            ids.push(deviceId)
            ids.sort((a, b) => a - b)
        } else {
            this.deviceIdsByUser.set(userJid, [deviceId])
        }
    }

    public lookupDeviceIdsForUser(userJid: string): readonly number[] {
        return this.deviceIdsByUser.get(userJid) ?? []
    }

    public notifyProfilePictureSet(op: CapturedProfilePictureSet): void {
        for (const listener of this.profilePictureSetListeners) {
            try {
                listener(op)
            } catch (error) {
                void error
            }
        }
    }

    public notifyStatusSet(text: string): void {
        for (const listener of this.statusSetListeners) {
            try {
                listener({ text })
            } catch (error) {
                void error
            }
        }
    }

    public notifyLogout(): void {
        for (const listener of this.logoutListeners) {
            try {
                listener()
            } catch (error) {
                void error
            }
        }
    }

    public notifyPrivacyTokenIssue(token: FakePrivacyTokenIssue): void {
        for (const listener of this.privacyTokenIssueListeners) {
            try {
                listener(token)
            } catch (error) {
                void error
            }
        }
    }

    public notifyDirtyBitsClear(op: CapturedDirtyBitsClear): void {
        for (const listener of this.dirtyBitsClearListeners) {
            try {
                listener(op)
            } catch (error) {
                void error
            }
        }
    }

    public handleProfilePictureSet(targetJid: string, newId: string): void {
        this.profilePicturesByJid.set(targetJid, {
            id: newId,
            url: `https://fake-media.local/profile/${targetJid}/${newId}.jpg`,
            directPath: `/profile/${targetJid}/${newId}.jpg`,
            type: 'image'
        })
    }
}
