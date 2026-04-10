/**
 * Extracted IQ handler registrations.
 *
 * `registerDefaultIqHandlers(router, deps)` wires every auto-response the
 * fake server ships out of the box (prekey upload, media_conn, app-state
 * sync, usync, prekey-fetch, group ops, privacy, blocklist, profile,
 * status, business, etc.). The function is called once from the
 * `FakeWaServer` constructor; individual handlers talk to the rest of
 * the server exclusively through the narrow `IqHandlerDeps` interface.
 */

import { buildAbPropsResult, type BuildAbPropsResultInput } from '../protocol/iq/abprops'
import {
    buildAppStateSyncFullResult,
    buildAppStateSyncResult,
    type FakeAppStateCollectionPayload,
    parseAppStateSyncRequest
} from '../protocol/iq/appstate-sync'
import {
    buildBusinessProfileResult,
    type FakeBusinessProfile,
    parseGetBusinessProfileIq
} from '../protocol/iq/business'
import { parseClearDirtyBitsIq } from '../protocol/iq/dirty-bits'
import {
    buildGroupMetadataNode,
    buildGroupParticipantChangeResult,
    parseCreateGroupIq,
    parseGroupParticipantChangeIq,
    parseLeaveGroupIq,
    parseSetDescriptionIq,
    parseSetSubjectIq
} from '../protocol/iq/group-ops'
import { buildNewsletterMyAddonsResult } from '../protocol/iq/newsletter'
import { buildPreKeyFetchResult, type PreKeyBundleForUser } from '../protocol/iq/prekey-fetch'
import {
    buildBlocklistResult,
    buildPrivacyDisallowedListResult,
    buildPrivacySettingsResult,
    type FakePrivacyCategoryName,
    type FakePrivacySettingsState,
    parseBlocklistChangeIq,
    parsePrivacyDisallowedListGetIq,
    parsePrivacySetCategoryIq
} from '../protocol/iq/privacy'
import {
    type FakePrivacyTokenIssue,
    parsePrivacyTokenIssueIq
} from '../protocol/iq/privacy-token'
import {
    buildGetProfilePictureResult,
    buildSetProfilePictureResult,
    type FakeProfilePictureResult,
    parseGetProfilePictureIq,
    parseSetProfilePictureIq,
    parseSetStatusIq
} from '../protocol/iq/profile'
import {
    buildIqError,
    buildIqResult,
    type WaFakeIqRouter
} from '../protocol/iq/router'
import { buildUsyncDevicesResult } from '../protocol/iq/usync'
import { type ClientPreKeyBundle, parsePreKeyUploadIq } from '../protocol/signal/prekey-upload'
import { type BinaryNode } from '../transport/codec'

import type { FakePeer } from './FakePeer'
import {
    type CapturedBlocklistChange,
    type CapturedDirtyBitsClear,
    type CapturedGroupOp,
    type CapturedPrivacySet,
    type CapturedProfilePictureSet,
    type MutableFakeGroup,
    toUserJidPart
} from './ServerRegistries'

// ─── Deps interface ──────────────────────────────────────────────────

export interface IqHandlerDeps {
    // From ServerRegistries
    readonly peerRegistry: ReadonlyMap<string, FakePeer>
    readonly groupRegistry: Map<string, MutableFakeGroup>
    readonly privacySettings: FakePrivacySettingsState
    readonly blocklistJids: Set<string>
    readonly profilePicturesByJid: Map<string, FakeProfilePictureResult>
    readonly businessProfilesByJid: Map<string, FakeBusinessProfile>
    readonly abPropsInput: BuildAbPropsResultInput
    readonly issuedPrivacyTokens: Map<string, FakePrivacyTokenIssue>
    readonly latestStatusText: string | null
    setLatestStatusText(text: string): void
    lookupDeviceIdsForUser(userJid: string): readonly number[]
    notifyGroupOp(op: CapturedGroupOp): void
    mutatePrivacySettings(category: FakePrivacyCategoryName, value: string): void
    mutateBlocklist(action: 'block' | 'unblock', jid: string): void
    notifyProfilePictureSet(op: CapturedProfilePictureSet): void
    handleProfilePictureSet(targetJid: string, newId: string): void
    notifyStatusSet(text: string): void
    notifyLogout(): void
    notifyPrivacyTokenIssue(token: FakePrivacyTokenIssue): void
    notifyDirtyBitsClear(op: CapturedDirtyBitsClear): void
    notifyPrivacySet(change: CapturedPrivacySet): void
    notifyBlocklistChange(change: CapturedBlocklistChange): void

    // From PreKeyDispenser
    capturePreKeyBundle(bundle: ClientPreKeyBundle): void

    // From AppStateSyncManager
    consumeOutboundAppStatePatches(iq: BinaryNode): Promise<void>
    readonly appStateCollectionProviders: ReadonlyMap<
        string,
        () => Promise<FakeAppStateCollectionPayload | null> | FakeAppStateCollectionPayload | null
    >

    // Media
    requireMediaHttpsInfo(): { readonly host: string; readonly port: number }
}

// ─── Helpers only used by handlers ───────────────────────────────────

/**
 * Walks `<iq><usync><list><user jid=.../></list></usync></iq>` and
 * returns the user JIDs being queried. Used by the global usync
 * handler to look up devices in the peer registry.
 */
export function parseUsyncRequestedUserJids(iq: BinaryNode): readonly string[] {
    if (!Array.isArray(iq.content)) return []
    const out: string[] = []
    for (const child of iq.content) {
        if (child.tag !== 'usync') continue
        if (!Array.isArray(child.content)) continue
        for (const inner of child.content) {
            if (inner.tag !== 'list') continue
            if (!Array.isArray(inner.content)) continue
            for (const userNode of inner.content) {
                if (userNode.tag !== 'user') continue
                if (typeof userNode.attrs.jid === 'string') {
                    out.push(userNode.attrs.jid)
                }
            }
        }
    }
    return out
}

/**
 * Builds the `<iq type=result><group jid=.../></iq>` payload the
 * lib's `parseGroupMetadata` reads.
 */
export function parseRequestedKeyJids(iq: BinaryNode): readonly string[] {
    if (!Array.isArray(iq.content)) return []
    const out: string[] = []
    for (const child of iq.content) {
        if (child.tag !== 'key') continue
        if (!Array.isArray(child.content)) continue
        for (const userNode of child.content) {
            if (userNode.tag !== 'user') continue
            const jid = userNode.attrs.jid
            if (jid) out.push(jid)
        }
    }
    return out
}

function buildGroupMetadataReply(
    iq: BinaryNode,
    metadata: MutableFakeGroup
): BinaryNode {
    const result = buildIqResult(iq)
    return {
        ...result,
        content: [
            buildGroupMetadataNode({
                groupJid: metadata.groupJid,
                subject: metadata.subject,
                creator: metadata.creator,
                creationSeconds: metadata.creationSeconds,
                participantJids: metadata.participants.map((peer) => toUserJidPart(peer.jid)),
                ...(metadata.description !== undefined
                    ? { description: metadata.description }
                    : {})
            })
        ]
    }
}

// ─── Registration function ───────────────────────────────────────────

export function registerDefaultIqHandlers(
    router: WaFakeIqRouter,
    deps: IqHandlerDeps
): void {
    // Auto-handle the client's PreKey upload IQ: capture the bundle, ack
    // with a plain `<iq type="result"/>` so the lib's upload promise
    // resolves successfully, and unblock any pending bundle waiters.
    router.register({
        label: 'prekey-upload',
        matcher: { xmlns: 'encrypt', type: 'set' },
        respond: (iq) => {
            try {
                const bundle = parsePreKeyUploadIq(iq)
                deps.capturePreKeyBundle(bundle)
            } catch {
                // Fall through and let the lib see a `result` regardless;
                // tests can still inspect captured stanzas.
            }
            return buildIqResult(iq)
        }
    })

    // Reply to `<iq xmlns="encrypt" type="get"><digest/></iq>` with a 404
    // error so the lib triggers a fresh prekey upload (which we then
    // capture via the `prekey-upload` handler above).
    router.register({
        label: 'signal-digest',
        matcher: { xmlns: 'encrypt', type: 'get', childTag: 'digest' },
        respond: (iq) => buildIqError(iq, { code: 404, text: 'item-not-found' })
    })

    // Auto-respond to the media_conn IQ (`<iq xmlns="w:m" type="set"><media_conn/></iq>`)
    // by pointing the lib at our HTTPS listener.
    router.register({
        label: 'media-conn',
        matcher: { xmlns: 'w:m', type: 'set', childTag: 'media_conn' },
        respond: (iq) => {
            const info = deps.requireMediaHttpsInfo()
            const result = buildIqResult(iq)
            return {
                ...result,
                attrs: { ...result.attrs, from: 's.whatsapp.net' },
                content: [
                    {
                        tag: 'media_conn',
                        attrs: { auth: 'fake-media-auth', ttl: '3600' },
                        content: [
                            {
                                tag: 'host',
                                attrs: {
                                    hostname: `${info.host}:${info.port}`
                                }
                            }
                        ]
                    }
                ]
            }
        }
    })

    // Auto-respond to `<iq xmlns="w:sync:app:state" type="set"><sync>...</sync></iq>`.
    router.register({
        label: 'app-state-sync',
        matcher: { xmlns: 'w:sync:app:state', type: 'set' },
        respond: async (iq) => {
            await deps.consumeOutboundAppStatePatches(iq)
            if (deps.appStateCollectionProviders.size === 0) {
                return buildAppStateSyncResult(iq)
            }
            const requests = parseAppStateSyncRequest(iq)
            const payloads: FakeAppStateCollectionPayload[] = []
            for (const request of requests) {
                const provider = deps.appStateCollectionProviders.get(request.name)
                if (!provider) continue
                const payload = await provider()
                if (payload) {
                    payloads.push(payload)
                }
            }
            return buildAppStateSyncFullResult(iq, { payloads })
        }
    })

    // Global usync handler.
    router.register({
        label: 'usync',
        matcher: { xmlns: 'usync', type: 'get', childTag: 'usync' },
        respond: (iq) => {
            const requestedUserJids = parseUsyncRequestedUserJids(iq)
            const results = requestedUserJids.map((userJid) => ({
                userJid,
                deviceIds: deps.lookupDeviceIdsForUser(userJid)
            }))
            return buildUsyncDevicesResult(iq, results)
        }
    })

    // Global prekey-fetch handler.
    router.register({
        label: 'prekey-fetch',
        matcher: { xmlns: 'encrypt', type: 'get', childTag: 'key' },
        respond: (iq) => {
            const requestedDeviceJids = parseRequestedKeyJids(iq)
            const bundles: PreKeyBundleForUser[] = []
            for (const deviceJid of requestedDeviceJids) {
                const peer = deps.peerRegistry.get(deviceJid)
                if (!peer) continue
                const oneTime = peer.keyBundle.oneTimePreKeys[0]
                bundles.push({
                    userJid: deviceJid,
                    registrationId: peer.keyBundle.registrationId,
                    identityPublicKey: peer.keyBundle.identityKeyPair.pubKey,
                    signedPreKey: {
                        id: peer.keyBundle.signedPreKey.id,
                        publicKey: peer.keyBundle.signedPreKey.keyPair.pubKey,
                        signature: peer.keyBundle.signedPreKey.signature
                    },
                    ...(oneTime
                        ? {
                              oneTimePreKey: {
                                  id: oneTime.id,
                                  publicKey: oneTime.keyPair.pubKey
                              }
                          }
                        : {})
                })
            }
            return buildPreKeyFetchResult(iq, bundles)
        }
    })

    // Global w:g2 group-metadata handler.
    router.register({
        label: 'group-metadata',
        matcher: { xmlns: 'w:g2', type: 'get', childTag: 'query' },
        respond: (iq) => {
            const groupJid = iq.attrs.to
            if (!groupJid) {
                return buildIqError(iq, { code: 400, text: 'missing-to' })
            }
            const metadata = deps.groupRegistry.get(groupJid)
            if (!metadata) {
                return buildIqError(iq, { code: 404, text: 'group-not-found' })
            }
            return buildGroupMetadataReply(iq, metadata)
        }
    })

    // ─── Tier 1: lifecycle / bring-up handlers ────────────────

    // `<iq xmlns="abt" type="get"><props .../></iq>` — AB props
    router.register({
        label: 'abprops',
        matcher: { xmlns: 'abt', type: 'get', childTag: 'props' },
        respond: (iq) => buildAbPropsResult(iq, deps.abPropsInput)
    })

    // `<iq xmlns="w:p" type="get"/>` — keepalive ping.
    router.register({
        label: 'whatsapp-ping',
        matcher: { xmlns: 'w:p', type: 'get' },
        respond: (iq) => buildIqResult(iq)
    })

    // `<iq xmlns="urn:xmpp:ping" type="get"/>` — XMPP ping.
    router.register({
        label: 'xmpp-ping',
        matcher: { xmlns: 'urn:xmpp:ping', type: 'get' },
        respond: (iq) => buildIqResult(iq)
    })

    // `<iq xmlns="encrypt" type="set"><rotate>...</rotate></iq>` —
    // signed prekey rotation.
    router.register({
        label: 'signed-prekey-rotate',
        matcher: { xmlns: 'encrypt', type: 'set', childTag: 'rotate' },
        respond: (iq) => buildIqResult(iq)
    })

    // `<iq xmlns="md" type="set"><remove-companion-device .../></iq>` —
    // logout / unpair.
    router.register({
        label: 'remove-companion-device',
        matcher: { xmlns: 'md', type: 'set', childTag: 'remove-companion-device' },
        respond: (iq) => {
            deps.notifyLogout()
            return buildIqResult(iq)
        }
    })

    // ─── Tier 2: group operations ─────────────────────────────

    // `<iq xmlns="w:g2" type="set"><create subject=...><participant .../></create></iq>`
    router.register({
        label: 'group-create',
        matcher: { xmlns: 'w:g2', type: 'set', childTag: 'create' },
        respond: (iq) => {
            const parsed = parseCreateGroupIq(iq)
            if (!parsed) {
                return buildIqError(iq, { code: 400, text: 'invalid-create' })
            }
            const groupJid = `120363${Date.now()}@g.us`
            const creator = parsed.participantJids[0] ?? 's.whatsapp.net'
            const creationSeconds = Math.floor(Date.now() / 1_000)
            const participants: FakePeer[] = []
            for (const jid of parsed.participantJids) {
                const peer = deps.peerRegistry.get(jid)
                if (peer) participants.push(peer)
            }
            const mutable: MutableFakeGroup = {
                groupJid,
                subject: parsed.subject,
                description: parsed.description,
                creator,
                creationSeconds,
                participants
            }
            deps.groupRegistry.set(groupJid, mutable)
            deps.notifyGroupOp({
                action: 'create',
                groupJid,
                subject: parsed.subject,
                participantJids: parsed.participantJids,
                description: parsed.description
            })
            const result = buildIqResult(iq)
            return {
                ...result,
                content: [
                    buildGroupMetadataNode({
                        groupJid,
                        subject: parsed.subject,
                        creator,
                        creationSeconds,
                        participantJids: parsed.participantJids,
                        description: parsed.description
                    })
                ]
            }
        }
    })

    // Participant changes — `add | remove | promote | demote`.
    for (const action of ['add', 'remove', 'promote', 'demote'] as const) {
        router.register({
            label: `group-${action}`,
            matcher: { xmlns: 'w:g2', type: 'set', childTag: action },
            respond: (iq) => {
                const parsed = parseGroupParticipantChangeIq(iq)
                if (!parsed) {
                    return buildIqError(iq, { code: 400, text: 'invalid-change' })
                }
                const group = deps.groupRegistry.get(parsed.groupJid)
                if (group) {
                    if (parsed.action === 'add') {
                        for (const jid of parsed.participantJids) {
                            const peer = deps.peerRegistry.get(jid)
                            if (peer && !group.participants.includes(peer)) {
                                group.participants.push(peer)
                            }
                        }
                    } else if (parsed.action === 'remove') {
                        const removed = new Set(parsed.participantJids)
                        group.participants = group.participants.filter(
                            (peer) => !removed.has(peer.jid)
                        )
                    }
                    // promote/demote don't change the participant
                    // list, only roles — we don't track roles yet.
                }
                deps.notifyGroupOp({
                    action: parsed.action,
                    groupJid: parsed.groupJid,
                    participantJids: parsed.participantJids
                })
                return buildGroupParticipantChangeResult(iq, parsed.action, parsed.participantJids)
            }
        })
    }

    // setSubject
    router.register({
        label: 'group-subject',
        matcher: { xmlns: 'w:g2', type: 'set', childTag: 'subject' },
        respond: (iq) => {
            const parsed = parseSetSubjectIq(iq)
            if (!parsed) return buildIqError(iq, { code: 400, text: 'invalid-subject' })
            const group = deps.groupRegistry.get(parsed.groupJid)
            if (group) group.subject = parsed.subject
            deps.notifyGroupOp({
                action: 'subject',
                groupJid: parsed.groupJid,
                subject: parsed.subject
            })
            return buildIqResult(iq)
        }
    })

    // setDescription
    router.register({
        label: 'group-description',
        matcher: { xmlns: 'w:g2', type: 'set', childTag: 'description' },
        respond: (iq) => {
            const parsed = parseSetDescriptionIq(iq)
            if (!parsed) return buildIqError(iq, { code: 400, text: 'invalid-description' })
            const group = deps.groupRegistry.get(parsed.groupJid)
            if (group) group.description = parsed.description ?? undefined
            deps.notifyGroupOp({
                action: 'description',
                groupJid: parsed.groupJid,
                description: parsed.description
            })
            return buildIqResult(iq)
        }
    })

    // leaveGroup
    router.register({
        label: 'group-leave',
        matcher: { xmlns: 'w:g2', type: 'set', childTag: 'leave' },
        respond: (iq) => {
            const groupJids = parseLeaveGroupIq(iq) ?? []
            for (const groupJid of groupJids) {
                deps.groupRegistry.delete(groupJid)
                deps.notifyGroupOp({ action: 'leave', groupJid })
            }
            return buildIqResult(iq)
        }
    })

    // ─── Tier 2: privacy + blocklist ──────────────────────────

    // `<iq xmlns="privacy" type="get"><privacy/></iq>` — full
    // settings query (no `<list>` child).
    router.register({
        label: 'privacy-get',
        matcher: { xmlns: 'privacy', type: 'get', childTag: 'privacy' },
        respond: (iq) => {
            const disallowedCategory = parsePrivacyDisallowedListGetIq(iq)
            if (disallowedCategory) {
                return buildPrivacyDisallowedListResult(
                    iq,
                    disallowedCategory,
                    deps.privacySettings.disallowed[disallowedCategory] ?? []
                )
            }
            return buildPrivacySettingsResult(iq, deps.privacySettings)
        }
    })

    // `<iq xmlns="privacy" type="set"><privacy><category .../></privacy></iq>`
    router.register({
        label: 'privacy-set',
        matcher: { xmlns: 'privacy', type: 'set', childTag: 'privacy' },
        respond: (iq) => {
            const change = parsePrivacySetCategoryIq(iq)
            if (!change) return buildIqError(iq, { code: 400, text: 'invalid-privacy-set' })
            deps.mutatePrivacySettings(change.category, change.value)
            deps.notifyPrivacySet(change)
            return buildIqResult(iq)
        }
    })

    // `<iq xmlns="blocklist" type="get"/>` — list query
    router.register({
        label: 'blocklist-get',
        matcher: { xmlns: 'blocklist', type: 'get' },
        respond: (iq) => buildBlocklistResult(iq, [...deps.blocklistJids])
    })

    // `<iq xmlns="blocklist" type="set"><item jid=... action="..."/></iq>`
    router.register({
        label: 'blocklist-set',
        matcher: { xmlns: 'blocklist', type: 'set' },
        respond: (iq) => {
            const change = parseBlocklistChangeIq(iq)
            if (!change) {
                return buildIqError(iq, { code: 400, text: 'invalid-blocklist-set' })
            }
            deps.mutateBlocklist(change.action, change.jid)
            deps.notifyBlocklistChange(change)
            return buildIqResult(iq)
        }
    })

    // `<iq xmlns="privacy" type="set"><tokens><token jid t type/></tokens></iq>` —
    // trusted-contact privacy token issue.
    router.register({
        label: 'privacy-token-issue',
        matcher: { xmlns: 'privacy', type: 'set', childTag: 'tokens' },
        respond: (iq) => {
            const tokens = parsePrivacyTokenIssueIq(iq)
            if (tokens) {
                for (const token of tokens) {
                    deps.issuedPrivacyTokens.set(token.jid, token)
                    deps.notifyPrivacyTokenIssue(token)
                }
            }
            return buildIqResult(iq)
        }
    })

    // `<iq xmlns="newsletter" type="get"><my_addons limit="1"/></iq>` —
    // dirty-bit driven newsletter metadata sync.
    router.register({
        label: 'newsletter-my-addons',
        matcher: { xmlns: 'newsletter', type: 'get', childTag: 'my_addons' },
        respond: (iq) => buildNewsletterMyAddonsResult(iq)
    })

    // `<iq xmlns="urn:xmpp:whatsapp:dirty" type="set"><clean .../></iq>` —
    // dirty bits clear.
    router.register({
        label: 'dirty-bits-clear',
        matcher: { xmlns: 'urn:xmpp:whatsapp:dirty', type: 'set' },
        respond: (iq) => {
            const bits = parseClearDirtyBitsIq(iq)
            if (bits) {
                deps.notifyDirtyBitsClear({ bits })
            }
            return buildIqResult(iq)
        }
    })

    // ─── Tier 3: profile / status / business ──────────────────

    // `<iq xmlns="w:profile:picture" type="get" target=<jid>><picture .../></iq>`
    router.register({
        label: 'profile-picture-get',
        matcher: { xmlns: 'w:profile:picture', type: 'get' },
        respond: (iq) => {
            const parsed = parseGetProfilePictureIq(iq)
            if (!parsed) return buildIqError(iq, { code: 400, text: 'invalid-target' })
            const picture = deps.profilePicturesByJid.get(parsed.targetJid)
            if (!picture) {
                return buildIqError(iq, { code: 404, text: 'item-not-found' })
            }
            return buildGetProfilePictureResult(iq, { ...picture, type: parsed.type })
        }
    })

    // `<iq xmlns="w:profile:picture" type="set"><picture type="image">[bytes]</picture></iq>`
    router.register({
        label: 'profile-picture-set',
        matcher: { xmlns: 'w:profile:picture', type: 'set' },
        respond: (iq) => {
            const parsed = parseSetProfilePictureIq(iq)
            if (!parsed) return buildIqError(iq, { code: 400, text: 'invalid-set' })
            const targetJid = parsed.targetJid ?? 'me'
            const newId = `${Date.now()}`
            deps.handleProfilePictureSet(targetJid, newId)
            deps.notifyProfilePictureSet(parsed)
            return buildSetProfilePictureResult(iq, newId)
        }
    })

    // `<iq xmlns="status" type="set"><status>...</status></iq>`
    router.register({
        label: 'status-set',
        matcher: { xmlns: 'status', type: 'set' },
        respond: (iq) => {
            const parsed = parseSetStatusIq(iq)
            if (parsed) {
                deps.setLatestStatusText(parsed.text)
                deps.notifyStatusSet(parsed.text)
            }
            return buildIqResult(iq)
        }
    })

    // `<iq xmlns="w:biz" type="get"><business_profile><profile jid=.../></business_profile></iq>`
    router.register({
        label: 'business-profile-get',
        matcher: { xmlns: 'w:biz', type: 'get', childTag: 'business_profile' },
        respond: (iq) => {
            const requestedJids = parseGetBusinessProfileIq(iq) ?? []
            const profiles: FakeBusinessProfile[] = []
            for (const jid of requestedJids) {
                const profile = deps.businessProfilesByJid.get(jid)
                if (profile) profiles.push(profile)
            }
            return buildBusinessProfileResult(iq, profiles)
        }
    })

    // `<iq xmlns="w:biz" type="set"><business_profile .../></iq>` — edit
    router.register({
        label: 'business-profile-set',
        matcher: { xmlns: 'w:biz', type: 'set', childTag: 'business_profile' },
        respond: (iq) => buildIqResult(iq)
    })
}
