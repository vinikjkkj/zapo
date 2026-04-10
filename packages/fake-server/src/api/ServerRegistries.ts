/**
 * Centralised registry state, listener fan-outs, snapshot accessors, and
 * mutation helpers extracted from `FakeWaServer`.
 *
 * The `ServerRegistries` class owns:
 *   - peer registry, group registry, privacy / blocklist / profile state
 *   - listener sets for every IQ-driven side-effect (group ops, privacy,
 *     blocklist, profile picture, status, logout, privacy-token, dirty-bits)
 *   - public `onOutbound*` subscriber methods (return unsubscribe fns)
 *   - `*Snapshot` read-only accessors
 *   - `mutate*` / `notify*` helpers the IQ handlers call after applying
 *     state changes
 *
 * Extracting this into its own module keeps `FakeWaServer` focused on
 * connection lifecycle, IQ routing, and the test-facing convenience API,
 * while the per-handler state mutations go through a well-typed surface.
 */

import type { BuildAbPropsResultInput } from '../protocol/iq/abprops'
import type { FakeBusinessProfile } from '../protocol/iq/business'
import type { FakeGroupParticipantAction } from '../protocol/iq/group-ops'
import {
    FAKE_DEFAULT_PRIVACY_SETTINGS,
    type FakePrivacyCategoryName
, type FakePrivacySettingsState } from '../protocol/iq/privacy'
import type { FakePrivacyTokenIssue } from '../protocol/iq/privacy-token'
import type { FakeProfilePictureResult } from '../protocol/iq/profile'

import type { FakePeer } from './FakePeer'

// ─── Moved types / interfaces ────────────────────────────────────────

export interface FakeGroupMetadata {
    /** Full group JID (e.g. `120363111111111111@g.us`). */
    readonly groupJid: string
    /** Display name returned in the `subject` attribute. */
    readonly subject: string
    /** Description text the lib stores under the group's metadata. */
    readonly description?: string
    /** Creator JID — defaults to the first participant. */
    readonly creator: string
    /** Unix-seconds creation timestamp. */
    readonly creationSeconds: number
    /** Participants of the group. The lib's outbound group fanout will
     *  resolve devices for each one and encrypt per-device. */
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
    /** `create | add | remove | promote | demote | subject | description | leave`. */
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

// ─── Helper functions ────────────────────────────────────────────────

/**
 * Strips the device suffix from a JID. `5511aaa:1@s.whatsapp.net`
 * becomes `5511aaa@s.whatsapp.net`. Idempotent for user JIDs.
 */
export function toUserJidPart(deviceJid: string): string {
    const atIdx = deviceJid.indexOf('@')
    if (atIdx < 0) return deviceJid
    const userPart = deviceJid.slice(0, atIdx)
    const server = deviceJid.slice(atIdx + 1)
    const colonIdx = userPart.indexOf(':')
    const baseUser = colonIdx < 0 ? userPart : userPart.slice(0, colonIdx)
    return `${baseUser}@${server}`
}

/**
 * Extracts the numeric device id from a JID. Returns 0 when there
 * is no `:N` suffix (the WhatsApp convention for device 0).
 */
export function toDeviceIdPart(deviceJid: string): number {
    const atIdx = deviceJid.indexOf('@')
    if (atIdx < 0) return 0
    const userPart = deviceJid.slice(0, atIdx)
    const colonIdx = userPart.indexOf(':')
    if (colonIdx < 0) return 0
    const parsed = Number.parseInt(userPart.slice(colonIdx + 1), 10)
    return Number.isFinite(parsed) ? parsed : 0
}

// ─── ServerRegistries class ──────────────────────────────────────────

export class ServerRegistries {
    // ── State fields ─────────────────────────────────────────────────

    /**
     * Centralised peer registry. Every `FakePeer` minted via
     * `createFakePeer` / `createFakePeerWithDevices` is indexed here
     * by its **device JID** (`5511aaa@s.whatsapp.net` for device 0,
     * `5511aaa:1@s.whatsapp.net` for device 1+). The global usync and
     * prekey-fetch handlers consult this registry instead of each
     * peer registering its own per-handler — that's the only way to
     * support multi-peer scenarios under the lib's first-match-wins
     * IQ router.
     */
    public readonly peerRegistry = new Map<string, FakePeer>()

    /**
     * Centralised group registry. Every `FakeGroup` minted via
     * `createFakeGroup` is indexed here by its `groupJid`. The global
     * `w:g2` group-metadata handler consults this map when the lib
     * issues a `<iq xmlns="w:g2" type="get" to="<group-jid>"><query/></iq>`
     * during outbound group sends. Mutated by the global group-ops
     * handler when the lib calls `client.group.{add,remove,promote,
     * demote}Participants`, `setSubject`, `setDescription`, etc.
     */
    public readonly groupRegistry = new Map<string, MutableFakeGroup>()

    /** Mutable per-server privacy state. Mutated by setPrivacy IQs. */
    public privacySettings: FakePrivacySettingsState = FAKE_DEFAULT_PRIVACY_SETTINGS

    /** Per-server blocklist of jids. Mutated by blocklist set IQs. */
    public readonly blocklistJids = new Set<string>()

    /** Profile picture per jid (defaults to undefined / 404 path). */
    public readonly profilePicturesByJid = new Map<string, FakeProfilePictureResult>()

    /** Business profiles per jid. */
    public readonly businessProfilesByJid = new Map<string, FakeBusinessProfile>()

    /** "Status" text the lib's setStatus call most recently published. */
    public latestStatusText: string | null = null

    /**
     * Trusted-contact privacy tokens the lib has issued, captured per
     * recipient jid. The lib only requires a bare ack but tests can
     * subscribe via {@link onOutboundPrivacyTokenIssue}.
     */
    public readonly issuedPrivacyTokens = new Map<string, FakePrivacyTokenIssue>()

    /**
     * AB-experiment payload returned by the global `abprops` handler.
     * Defaults to an empty `<props/>`. Tests opt in via
     * {@link setAbProps}; the payload is then mirrored back on every
     * subsequent `<iq xmlns="abt">` query.
     */
    public abPropsInput: BuildAbPropsResultInput = {}

    // ── Listener sets ────────────────────────────────────────────────

    /**
     * Listener fan-outs for IQ-driven side effects so tests can
     * `await` a specific operation. Each set holds (`predicate`, `resolve`)
     * pairs the global handlers consult after applying state changes.
     */
    public readonly groupOpListeners = new Set<(op: CapturedGroupOp) => void>()
    public readonly privacySetListeners = new Set<(op: CapturedPrivacySet) => void>()
    public readonly blocklistChangeListeners = new Set<(op: CapturedBlocklistChange) => void>()
    public readonly profilePictureSetListeners = new Set<
        (op: CapturedProfilePictureSet) => void
    >()
    public readonly statusSetListeners = new Set<(op: CapturedStatusSet) => void>()
    public readonly logoutListeners = new Set<() => void>()
    public readonly privacyTokenIssueListeners = new Set<
        (op: FakePrivacyTokenIssue) => void
    >()
    public readonly dirtyBitsClearListeners = new Set<
        (op: CapturedDirtyBitsClear) => void
    >()

    // ── Subscriber methods (onOutbound*) ─────────────────────────────

    /** Subscribes to outbound group operation IQs the lib uploads. */
    public onOutboundGroupOp(listener: (op: CapturedGroupOp) => void): () => void {
        this.groupOpListeners.add(listener)
        return () => {
            this.groupOpListeners.delete(listener)
        }
    }

    /** Subscribes to outbound privacy-set IQs the lib uploads. */
    public onOutboundPrivacySet(listener: (op: CapturedPrivacySet) => void): () => void {
        this.privacySetListeners.add(listener)
        return () => {
            this.privacySetListeners.delete(listener)
        }
    }

    /** Subscribes to outbound blocklist change IQs the lib uploads. */
    public onOutboundBlocklistChange(
        listener: (op: CapturedBlocklistChange) => void
    ): () => void {
        this.blocklistChangeListeners.add(listener)
        return () => {
            this.blocklistChangeListeners.delete(listener)
        }
    }

    /** Subscribes to outbound profile-picture-set IQs the lib uploads. */
    public onOutboundProfilePictureSet(
        listener: (op: CapturedProfilePictureSet) => void
    ): () => void {
        this.profilePictureSetListeners.add(listener)
        return () => {
            this.profilePictureSetListeners.delete(listener)
        }
    }

    /** Subscribes to outbound status-set IQs the lib uploads. */
    public onOutboundStatusSet(listener: (op: CapturedStatusSet) => void): () => void {
        this.statusSetListeners.add(listener)
        return () => {
            this.statusSetListeners.delete(listener)
        }
    }

    /** Subscribes to logout / `remove-companion-device` IQs. */
    public onLogout(listener: () => void): () => void {
        this.logoutListeners.add(listener)
        return () => {
            this.logoutListeners.delete(listener)
        }
    }

    /**
     * Subscribes to outbound `<iq xmlns="privacy" type="set"><tokens>`
     * stanzas the lib emits when issuing a trusted-contact privacy
     * token to a peer.
     */
    public onOutboundPrivacyTokenIssue(
        listener: (op: FakePrivacyTokenIssue) => void
    ): () => void {
        this.privacyTokenIssueListeners.add(listener)
        return () => {
            this.privacyTokenIssueListeners.delete(listener)
        }
    }

    /**
     * Subscribes to outbound `<iq xmlns="urn:xmpp:whatsapp:dirty">`
     * clear stanzas the lib emits at the end of a dirty-bit sync cycle.
     */
    public onOutboundDirtyBitsClear(
        listener: (op: CapturedDirtyBitsClear) => void
    ): () => void {
        this.dirtyBitsClearListeners.add(listener)
        return () => {
            this.dirtyBitsClearListeners.delete(listener)
        }
    }

    // ── Snapshot accessors ───────────────────────────────────────────

    /** Snapshot of every trusted-contact privacy token the lib has issued. */
    public privacyTokensIssuedSnapshot(): ReadonlyMap<string, FakePrivacyTokenIssue> {
        return new Map(this.issuedPrivacyTokens)
    }

    /** Snapshot of the current privacy settings + per-category disallowed lists. */
    public privacySettingsSnapshot(): FakePrivacySettingsState {
        return this.privacySettings
    }

    /** Snapshot of the current blocklist as a sorted array. */
    public blocklistSnapshot(): readonly string[] {
        return [...this.blocklistJids].sort()
    }

    /** Snapshot of the most recent `setStatus` text the lib uploaded. */
    public latestStatusSnapshot(): string | null {
        return this.latestStatusText
    }

    /** Snapshot of the current group registry as a read-only map. */
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

    // ── Setters (test-facing) ────────────────────────────────────────

    /** Pre-set or override a profile picture record for a given jid. */
    public setProfilePictureRecord(jid: string, picture: FakeProfilePictureResult): void {
        this.profilePicturesByJid.set(jid, picture)
    }

    /** Pre-set or override a business profile record for a given jid. */
    public setBusinessProfileRecord(jid: string, profile: FakeBusinessProfile): void {
        this.businessProfilesByJid.set(jid, profile)
    }

    /**
     * Override the AB-experiment payload returned by the global
     * `<iq xmlns="abt">` handler. Tests opt in to AB-gated lib code
     * paths by feeding `{ props: [...] }` here.
     */
    public setAbProps(input: BuildAbPropsResultInput): void {
        this.abPropsInput = input
    }

    /**
     * Pre-seed the per-category privacy disallowed list (the
     * `contact_blacklist` payload returned by the lib's
     * `getDisallowedList(category)` query).
     */
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

    /**
     * Registers a fake group with a fixed participant set. The global
     * `w:g2` group-metadata handler answers any `<iq xmlns="w:g2"
     * type="get" to=<group-jid>><query/></iq>` with the participants
     * stored here, and the lib's outbound group fanout will then run
     * usync + prekey-fetch against each participant via the global
     * peer registry handlers.
     *
     * Each participant must already exist in the peer registry —
     * pass the `FakePeer` instances you got from `createFakePeer` /
     * `createFakePeerWithDevices` directly.
     */
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

    // ── Internal mutation methods (called by IQ handlers) ────────────

    /** Mutates the privacy settings for a single category. */
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

    /** Mutates the blocklist by adding or removing a jid. */
    public mutateBlocklist(action: 'block' | 'unblock', jid: string): void {
        if (action === 'block') {
            this.blocklistJids.add(jid)
        } else {
            this.blocklistJids.delete(jid)
        }
    }

    /** Notifies all registered group-op listeners of a captured operation. */
    public notifyGroupOp(op: CapturedGroupOp): void {
        for (const listener of this.groupOpListeners) {
            try {
                listener(op)
            } catch {
                // best-effort
            }
        }
    }

    /**
     * Looks up all device ids registered under `userJid` in the peer
     * registry. Used by the global usync handler.
     */
    public lookupDeviceIdsForUser(userJid: string): readonly number[] {
        const deviceIds: number[] = []
        for (const peer of this.peerRegistry.values()) {
            if (toUserJidPart(peer.jid) !== userJid) continue
            deviceIds.push(toDeviceIdPart(peer.jid))
        }
        deviceIds.sort((a, b) => a - b)
        return deviceIds
    }

    /** Notifies all registered profile-picture-set listeners. */
    public notifyProfilePictureSet(op: CapturedProfilePictureSet): void {
        for (const listener of this.profilePictureSetListeners) {
            try {
                listener(op)
            } catch {
                // best-effort
            }
        }
    }

    /** Notifies all registered status-set listeners. */
    public notifyStatusSet(text: string): void {
        for (const listener of this.statusSetListeners) {
            try {
                listener({ text })
            } catch {
                // best-effort
            }
        }
    }

    /** Notifies all registered logout listeners. */
    public notifyLogout(): void {
        for (const listener of this.logoutListeners) {
            try {
                listener()
            } catch {
                // best-effort
            }
        }
    }

    /** Notifies all registered privacy-token-issue listeners. */
    public notifyPrivacyTokenIssue(token: FakePrivacyTokenIssue): void {
        for (const listener of this.privacyTokenIssueListeners) {
            try {
                listener(token)
            } catch {
                // best-effort
            }
        }
    }

    /** Notifies all registered dirty-bits-clear listeners. */
    public notifyDirtyBitsClear(op: CapturedDirtyBitsClear): void {
        for (const listener of this.dirtyBitsClearListeners) {
            try {
                listener(op)
            } catch {
                // best-effort
            }
        }
    }

    /**
     * Applies a profile picture set from an IQ handler: updates the
     * internal map and returns the newly generated picture id. The
     * caller (the IQ handler) can then use the id to build the
     * response stanza.
     */
    public handleProfilePictureSet(
        targetJid: string,
        newId: string
    ): void {
        this.profilePicturesByJid.set(targetJid, {
            id: newId,
            url: `https://fake-media.local/profile/${targetJid}/${newId}.jpg`,
            directPath: `/profile/${targetJid}/${newId}.jpg`,
            type: 'image'
        })
    }
}
