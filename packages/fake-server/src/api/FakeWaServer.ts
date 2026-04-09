/**
 * Public entry point for the fake server.
 *
 * Phase 1 surface:
 *   - `FakeWaServer.start()` boots the WS listener and instantiates a fresh
 *     ephemeral root CA + server static keypair.
 *   - Each accepted connection is wrapped in a `WaFakeConnectionPipeline`
 *     that drives the noise XX handshake to completion and pushes a
 *     `<success/>` stanza.
 *   - Tests are exposed:
 *       * `noiseRootCa` — feed it into `WaClient.testHooks.noiseRootCa`
 *         so the lib trusts our ephemeral CA.
 *       * `onPipeline` — observe each pipeline (authenticated info, stanzas
 *         the client sends after success).
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'

import type { WaFakeConnection } from '../infra/WaFakeConnection'
import {
    type WaFakeAuthenticatedInfo,
    WaFakeConnectionPipeline
} from '../infra/WaFakeConnectionPipeline'
import { WaFakeMediaHttpsServer } from '../infra/WaFakeMediaHttpsServer'
import { WaFakeWsServer, type WaFakeWsServerListenInfo } from '../infra/WaFakeWsServer'
import { type FakeNoiseRootCa, generateFakeNoiseRootCa } from '../protocol/auth/cert-chain'
import { buildAbPropsResult, type BuildAbPropsResultInput } from '../protocol/iq/abprops'
import {
    buildAppStateSyncFullResult,
    buildAppStateSyncResult,
    buildServerSyncNotification,
    type BuildServerSyncNotificationInput,
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
    type FakeGroupParticipantAction,
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
    FAKE_DEFAULT_PRIVACY_SETTINGS,
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
    type WaFakeIqHandler,
    type WaFakeIqMatcher,
    type WaFakeIqResponder,
    WaFakeIqRouter
} from '../protocol/iq/router'
import { buildUsyncDevicesResult } from '../protocol/iq/usync'
import { buildNotification } from '../protocol/push/notification'
import { FakeAppStateCrypto } from '../protocol/signal/fake-app-state-crypto'
import { type ClientPreKeyBundle, parsePreKeyUploadIq } from '../protocol/signal/prekey-upload'
import {
    FakeMediaStore,
    type PublishedMediaBlob,
    type PublishMediaInput
} from '../state/fake-media-store'
import { type BinaryNode } from '../transport/codec'
import { type SignalKeyPair, X25519 } from '../transport/crypto'
import { proto, type Proto } from '../transport/protos'

import { FakePairingDriver, type FakePairingDriverOptions } from './FakePairingDriver'
import { type CreateFakePeerOptions, FakePeer } from './FakePeer'
import { type AuthenticatedPipelineListener, Scenario } from './Scenario'

export interface FakeWaServerOptions {
    readonly host?: string
    readonly port?: number
    readonly path?: string
}

export interface FakeWaServerNoiseRootCa {
    readonly publicKey: Uint8Array
    readonly serial: number
}

export type FakeWaServerPipelineListener = (pipeline: WaFakeConnectionPipeline) => void

export interface ExpectIqOptions {
    /** How long to wait before rejecting (default: 2000ms). */
    readonly timeoutMs?: number
}

export interface ExpectStanzaOptions {
    /** How long to wait before rejecting (default: 2000ms). */
    readonly timeoutMs?: number
}

export interface StanzaMatcher {
    /** Stanza tag (e.g. 'iq', 'message', 'receipt', 'notification'). */
    readonly tag?: string
    /** Match against `attrs.type`. */
    readonly type?: string
    /** Match against `attrs.xmlns`. */
    readonly xmlns?: string
    /** Match against `attrs.from`. */
    readonly from?: string
    /** Match against `attrs.to`. */
    readonly to?: string
    /** First child tag inside the stanza. */
    readonly childTag?: string
}

interface PendingIqExpectation {
    readonly matcher: WaFakeIqMatcher
    readonly resolve: (iq: BinaryNode) => void
    readonly reject: (error: Error) => void
    readonly timer: NodeJS.Timeout
}

interface PendingStanzaExpectation {
    readonly matcher: StanzaMatcher
    readonly resolve: (node: BinaryNode) => void
    readonly reject: (error: Error) => void
    readonly timer: NodeJS.Timeout
}

interface PendingPreKeyBundleWaiter {
    readonly resolve: (bundle: ClientPreKeyBundle) => void
    readonly reject: (error: Error) => void
    readonly timer: NodeJS.Timeout
}

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

interface MutableFakeGroup {
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

export interface CapturedAppStateMutation {
    /** Collection name parsed from the inbound `<collection>`. */
    readonly collection: string
    /** `set` or `remove`. */
    readonly operation: 'set' | 'remove'
    /** Decoded mutation index (e.g. `JSON.stringify(['mute', '5511...@s.whatsapp.net'])`). */
    readonly index: string
    /** First parsed segment of the JSON-encoded index (e.g. `'mute'`). */
    readonly action: string | undefined
    /** Per-mutation `version` field embedded inside the `SyncActionData`. */
    readonly version: number
    /** Decoded `SyncActionValue` carrying the actual action payload. */
    readonly value: Proto.ISyncActionValue | null
    /** Patch version the lib advanced to. */
    readonly patchVersion: number
}

export interface CapturedMediaUpload {
    /** URL path the lib POSTed to (e.g. `/mms/image/<base64-token>`). */
    readonly path: string
    /** `image|video|audio|...` parsed from the upload path. */
    readonly mediaType: string
    /** Raw encrypted bytes the lib uploaded (`iv || ciphertext || mac10`). */
    readonly encryptedBytes: Uint8Array
    /** `Content-Type` header the lib sent. */
    readonly contentType: string | undefined
    /** Query string `auth=` token (echoed from media_conn). */
    readonly auth: string | undefined
    /** Wall-clock time the upload landed. */
    readonly receivedAtMs: number
}

export class FakeWaServer {
    private readonly wsServer: WaFakeWsServer
    private readonly pipelines = new Set<WaFakeConnectionPipeline>()
    private readonly iqRouter = new WaFakeIqRouter()
    private readonly capturedStanzas: BinaryNode[] = []
    private readonly pendingIqExpectations = new Set<PendingIqExpectation>()
    private readonly pendingStanzaExpectations = new Set<PendingStanzaExpectation>()
    private readonly authenticatedListeners = new Set<AuthenticatedPipelineListener>()
    private readonly preKeyBundleWaiters = new Set<PendingPreKeyBundleWaiter>()
    private readonly inboundStanzaListeners = new Set<(node: BinaryNode) => void>()
    private rootCa: FakeNoiseRootCa | null = null
    private serverStaticKeyPair: SignalKeyPair | null = null
    private listenInfo: WaFakeWsServerListenInfo | null = null
    private pipelineListener: FakeWaServerPipelineListener | null = null
    private rejectMode: { readonly code: number; readonly reason: string } | null = null
    private capturedPreKeyBundle: ClientPreKeyBundle | null = null
    private nextPreKeyNotificationId = 1
    private readonly mediaStore = new FakeMediaStore()
    private readonly mediaHttpsServer = new WaFakeMediaHttpsServer()
    private readonly capturedMediaUploads: CapturedMediaUpload[] = []
    private nextUploadCounter = 0
    private cachedMediaProxyAgent: HttpsAgent | null = null
    /**
     * Per-collection app-state payload providers. The auto IQ handler
     * consults this map for each requested collection: if a provider is
     * registered, it produces a `<patches>`/`<snapshot>` payload that
     * advances the lib's collection state. Missing collections fall back
     * to the empty-success response.
     */
    private readonly appStateCollectionProviders = new Map<
        string,
        () => Promise<FakeAppStateCollectionPayload | null> | FakeAppStateCollectionPayload | null
    >()
    /**
     * Sync keys (`keyIdHex` → `keyData`) the fake server knows about.
     * Tests register a key here when they want the fake server to
     * decrypt outbound mutation patches the lib uploads. The keyId is
     * normalized to lowercase hex.
     */
    private readonly appStateSyncKeysByKeyId = new Map<string, Uint8Array>()
    private readonly appStateCrypto = new FakeAppStateCrypto()
    /**
     * Listeners notified for every mutation the lib uploads inside an
     * `<iq xmlns=w:sync:app:state>` patch. Tests register a listener
     * (typically scoped to a specific collection or chat jid) and
     * resolve a promise when the matching mutation arrives.
     */
    private readonly outboundMutationListeners = new Set<
        (mutation: CapturedAppStateMutation) => void
    >()
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
    private readonly peerRegistry = new Map<string, FakePeer>()
    /**
     * Centralised group registry. Every `FakeGroup` minted via
     * `createFakeGroup` is indexed here by its `groupJid`. The global
     * `w:g2` group-metadata handler consults this map when the lib
     * issues a `<iq xmlns="w:g2" type="get" to="<group-jid>"><query/></iq>`
     * during outbound group sends. Mutated by the global group-ops
     * handler when the lib calls `client.group.{add,remove,promote,
     * demote}Participants`, `setSubject`, `setDescription`, etc.
     */
    private readonly groupRegistry = new Map<string, MutableFakeGroup>()
    /** Mutable per-server privacy state. Mutated by setPrivacy IQs. */
    private privacySettings: FakePrivacySettingsState = FAKE_DEFAULT_PRIVACY_SETTINGS
    /** Per-server blocklist of jids. Mutated by blocklist set IQs. */
    private readonly blocklistJids = new Set<string>()
    /** Profile picture per jid (defaults to undefined / 404 path). */
    private readonly profilePicturesByJid = new Map<string, FakeProfilePictureResult>()
    /** Business profiles per jid. */
    private readonly businessProfilesByJid = new Map<string, FakeBusinessProfile>()
    /** "Status" text the lib's setStatus call most recently published. */
    private latestStatusText: string | null = null
    /**
     * Trusted-contact privacy tokens the lib has issued, captured per
     * recipient jid. The lib only requires a bare ack but tests can
     * subscribe via {@link onOutboundPrivacyTokenIssue}.
     */
    private readonly issuedPrivacyTokens = new Map<string, FakePrivacyTokenIssue>()
    /**
     * AB-experiment payload returned by the global `abprops` handler.
     * Defaults to an empty `<props/>`. Tests opt in via
     * {@link setAbProps}; the payload is then mirrored back on every
     * subsequent `<iq xmlns="abt">` query.
     */
    private abPropsInput: BuildAbPropsResultInput = {}
    /**
     * Listener fan-outs for IQ-driven side effects so tests can
     * `await` a specific operation. Each set holds (`predicate`, `resolve`)
     * pairs the global handlers consult after applying state changes.
     */
    private readonly groupOpListeners = new Set<(op: CapturedGroupOp) => void>()
    private readonly privacySetListeners = new Set<(op: CapturedPrivacySet) => void>()
    private readonly blocklistChangeListeners = new Set<(op: CapturedBlocklistChange) => void>()
    private readonly profilePictureSetListeners = new Set<
        (op: CapturedProfilePictureSet) => void
    >()
    private readonly statusSetListeners = new Set<(op: CapturedStatusSet) => void>()
    private readonly logoutListeners = new Set<() => void>()
    private readonly privacyTokenIssueListeners = new Set<
        (op: FakePrivacyTokenIssue) => void
    >()
    private readonly dirtyBitsClearListeners = new Set<
        (op: CapturedDirtyBitsClear) => void
    >()

    public constructor(options: FakeWaServerOptions = {}) {
        this.wsServer = new WaFakeWsServer(options)
        this.wsServer.onConnection((connection) => this.handleConnection(connection))
        // Auto-handle the client's PreKey upload IQ: capture the bundle, ack
        // with a plain `<iq type="result"/>` so the lib's upload promise
        // resolves successfully, and unblock any pending bundle waiters.
        this.iqRouter.register({
            label: 'prekey-upload',
            matcher: { xmlns: 'encrypt', type: 'set' },
            respond: (iq) => {
                try {
                    const bundle = parsePreKeyUploadIq(iq)
                    this.capturedPreKeyBundle = bundle
                    for (const waiter of this.preKeyBundleWaiters) {
                        waiter.resolve(bundle)
                    }
                    this.preKeyBundleWaiters.clear()
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
        this.iqRouter.register({
            label: 'signal-digest',
            matcher: { xmlns: 'encrypt', type: 'get', childTag: 'digest' },
            respond: (iq) => buildIqError(iq, { code: 404, text: 'item-not-found' })
        })

        // Auto-respond to the media_conn IQ (`<iq xmlns="w:m" type="set"><media_conn/></iq>`)
        // by pointing the lib at our HTTPS listener. The lib hardcodes
        // `https://${host}${path}` in `buildUploadUrl` (and in
        // `resolveUrls` for relative download paths), so the host we
        // hand back has to speak TLS. The fake media server uses a
        // throwaway self-signed cert; tests pass a custom
        // `https.Agent({ rejectUnauthorized: false })` via
        // `proxy: { mediaUpload, mediaDownload }` to bypass cert
        // verification.
        //
        // The lib's `parseMediaConnResponse` only validates `auth`,
        // `ttl > 0`, and at least one `<host hostname=...>` child, so
        // we hand it `127.0.0.1:PORT` verbatim.
        this.iqRouter.register({
            label: 'media-conn',
            matcher: { xmlns: 'w:m', type: 'set', childTag: 'media_conn' },
            respond: (iq) => {
                const info = this.requireMediaHttpsInfo()
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
        // For each requested collection: if a provider has been
        // registered via `provideAppStateCollection`, it produces a
        // `<patches>`/`<snapshot>` payload (real encrypted mutations);
        // otherwise the collection echoes back as empty success at the
        // inbound version. This unblocks both the fully-mocked and the
        // fully-instrumented sync flows from a single handler.
        this.iqRouter.register({
            label: 'app-state-sync',
            matcher: { xmlns: 'w:sync:app:state', type: 'set' },
            respond: async (iq) => {
                // First, walk every `<collection><patch>...</patch></collection>`
                // child of the inbound IQ. If we have a sync key for the
                // patch's keyId, decrypt every mutation inside it and
                // notify any registered listeners — this is what makes
                // `client.chat.setChatMute(...)` observable on the fake
                // server side.
                await this.consumeOutboundAppStatePatches(iq)
                if (this.appStateCollectionProviders.size === 0) {
                    return buildAppStateSyncResult(iq)
                }
                const requests = parseAppStateSyncRequest(iq)
                const payloads: FakeAppStateCollectionPayload[] = []
                for (const request of requests) {
                    const provider = this.appStateCollectionProviders.get(request.name)
                    if (!provider) continue
                    const payload = await provider()
                    if (payload) {
                        payloads.push(payload)
                    }
                }
                return buildAppStateSyncFullResult(iq, { payloads })
            }
        })

        // Global usync handler. Walks the inbound `<usync><list><user jid=.../></list></usync>`
        // children, looks up every device registered under each
        // requested user JID in the peer registry, and returns one
        // `<user jid=...><devices><device-list><device id=N/></device-list></devices></user>`
        // entry per user. Replaces the per-peer usync handlers used by
        // the old `createFakePeer` design (which only worked for one
        // peer because the IQ router does first-match-wins).
        this.iqRouter.register({
            label: 'usync',
            matcher: { xmlns: 'usync', type: 'get', childTag: 'usync' },
            respond: (iq) => {
                const requestedUserJids = parseUsyncRequestedUserJids(iq)
                const results = requestedUserJids.map((userJid) => ({
                    userJid,
                    deviceIds: this.lookupDeviceIdsForUser(userJid)
                }))
                return buildUsyncDevicesResult(iq, results)
            }
        })

        // Global prekey-fetch handler. Parses every `<key><user jid=device-jid/>`
        // child of the inbound IQ and returns one bundle per device JID
        // it can find in the peer registry. Replaces the per-peer
        // prekey-fetch handler the old `createFakePeer` design used.
        this.iqRouter.register({
            label: 'prekey-fetch',
            matcher: { xmlns: 'encrypt', type: 'get', childTag: 'key' },
            respond: (iq) => {
                const requestedDeviceJids = parseRequestedKeyJids(iq)
                const bundles: PreKeyBundleForUser[] = []
                for (const deviceJid of requestedDeviceJids) {
                    const peer = this.peerRegistry.get(deviceJid)
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

        // Global w:g2 group-metadata handler. Looks up the inbound IQ's
        // `to` attribute (which is the group JID being queried) in the
        // group registry and returns a `<group/>` payload listing every
        // participant. The lib's `createGroup` IQ flow is fielded by
        // an inline test handler, not this one.
        this.iqRouter.register({
            label: 'group-metadata',
            matcher: { xmlns: 'w:g2', type: 'get', childTag: 'query' },
            respond: (iq) => {
                const groupJid = iq.attrs.to
                if (!groupJid) {
                    return buildIqError(iq, { code: 400, text: 'missing-to' })
                }
                const metadata = this.groupRegistry.get(groupJid)
                if (!metadata) {
                    return buildIqError(iq, { code: 404, text: 'group-not-found' })
                }
                return this.buildGroupMetadataReply(iq, metadata)
            }
        })

        // ─── Tier 1: lifecycle / bring-up handlers ────────────────

        // `<iq xmlns="abt" type="get"><props .../></iq>` — AB props
        // bootstrap. The lib calls this at startup; we return an
        // empty `<props>` payload (no AB experiments).
        this.iqRouter.register({
            label: 'abprops',
            matcher: { xmlns: 'abt', type: 'get', childTag: 'props' },
            respond: (iq) => buildAbPropsResult(iq, this.abPropsInput)
        })

        // `<iq xmlns="w:p" type="get"/>` — keepalive ping. The lib
        // calls this on a timer to verify the WS is still alive.
        // Just ack with a result.
        this.iqRouter.register({
            label: 'whatsapp-ping',
            matcher: { xmlns: 'w:p', type: 'get' },
            respond: (iq) => buildIqResult(iq)
        })

        // `<iq xmlns="urn:xmpp:ping" type="get"/>` — XMPP ping.
        // Same deal.
        this.iqRouter.register({
            label: 'xmpp-ping',
            matcher: { xmlns: 'urn:xmpp:ping', type: 'get' },
            respond: (iq) => buildIqResult(iq)
        })

        // `<iq xmlns="encrypt" type="set"><rotate>...</rotate></iq>` —
        // signed prekey rotation. Periodic. Just ack success.
        this.iqRouter.register({
            label: 'signed-prekey-rotate',
            matcher: { xmlns: 'encrypt', type: 'set', childTag: 'rotate' },
            respond: (iq) => buildIqResult(iq)
        })

        // `<iq xmlns="md" type="set"><remove-companion-device .../></iq>` —
        // logout / unpair. Ack success and notify any registered
        // listeners so tests can assert the lib actually shipped the
        // call before tearing down.
        this.iqRouter.register({
            label: 'remove-companion-device',
            matcher: { xmlns: 'md', type: 'set', childTag: 'remove-companion-device' },
            respond: (iq) => {
                for (const listener of this.logoutListeners) {
                    try {
                        listener()
                    } catch {
                        // best-effort
                    }
                }
                return buildIqResult(iq)
            }
        })

        // ─── Tier 2: group operations ─────────────────────────────

        // `<iq xmlns="w:g2" type="set"><create subject=...><participant .../></create></iq>`
        // The lib's `client.group.createGroup` reads back a `<group>`
        // metadata payload — we mint one from the inbound participants.
        this.iqRouter.register({
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
                    const peer = this.peerRegistry.get(jid)
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
                this.groupRegistry.set(groupJid, mutable)
                this.notifyGroupOp({
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
            this.iqRouter.register({
                label: `group-${action}`,
                matcher: { xmlns: 'w:g2', type: 'set', childTag: action },
                respond: (iq) => {
                    const parsed = parseGroupParticipantChangeIq(iq)
                    if (!parsed) {
                        return buildIqError(iq, { code: 400, text: 'invalid-change' })
                    }
                    const group = this.groupRegistry.get(parsed.groupJid)
                    if (group) {
                        if (parsed.action === 'add') {
                            for (const jid of parsed.participantJids) {
                                const peer = this.peerRegistry.get(jid)
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
                    this.notifyGroupOp({
                        action: parsed.action,
                        groupJid: parsed.groupJid,
                        participantJids: parsed.participantJids
                    })
                    return buildGroupParticipantChangeResult(iq, parsed.action, parsed.participantJids)
                }
            })
        }

        // setSubject
        this.iqRouter.register({
            label: 'group-subject',
            matcher: { xmlns: 'w:g2', type: 'set', childTag: 'subject' },
            respond: (iq) => {
                const parsed = parseSetSubjectIq(iq)
                if (!parsed) return buildIqError(iq, { code: 400, text: 'invalid-subject' })
                const group = this.groupRegistry.get(parsed.groupJid)
                if (group) group.subject = parsed.subject
                this.notifyGroupOp({
                    action: 'subject',
                    groupJid: parsed.groupJid,
                    subject: parsed.subject
                })
                return buildIqResult(iq)
            }
        })

        // setDescription
        this.iqRouter.register({
            label: 'group-description',
            matcher: { xmlns: 'w:g2', type: 'set', childTag: 'description' },
            respond: (iq) => {
                const parsed = parseSetDescriptionIq(iq)
                if (!parsed) return buildIqError(iq, { code: 400, text: 'invalid-description' })
                const group = this.groupRegistry.get(parsed.groupJid)
                if (group) group.description = parsed.description ?? undefined
                this.notifyGroupOp({
                    action: 'description',
                    groupJid: parsed.groupJid,
                    description: parsed.description
                })
                return buildIqResult(iq)
            }
        })

        // leaveGroup
        this.iqRouter.register({
            label: 'group-leave',
            matcher: { xmlns: 'w:g2', type: 'set', childTag: 'leave' },
            respond: (iq) => {
                const groupJids = parseLeaveGroupIq(iq) ?? []
                for (const groupJid of groupJids) {
                    this.groupRegistry.delete(groupJid)
                    this.notifyGroupOp({ action: 'leave', groupJid })
                }
                return buildIqResult(iq)
            }
        })

        // ─── Tier 2: privacy + blocklist ──────────────────────────

        // `<iq xmlns="privacy" type="get"><privacy/></iq>` — full
        // settings query (no `<list>` child). The disallowed-list
        // query carries a `<privacy><list .../></privacy>` instead
        // and is handled below by inspecting the inbound shape.
        this.iqRouter.register({
            label: 'privacy-get',
            matcher: { xmlns: 'privacy', type: 'get', childTag: 'privacy' },
            respond: (iq) => {
                const disallowedCategory = parsePrivacyDisallowedListGetIq(iq)
                if (disallowedCategory) {
                    return buildPrivacyDisallowedListResult(
                        iq,
                        disallowedCategory,
                        this.privacySettings.disallowed[disallowedCategory] ?? []
                    )
                }
                return buildPrivacySettingsResult(iq, this.privacySettings)
            }
        })

        // `<iq xmlns="privacy" type="set"><privacy><category .../></privacy></iq>`
        this.iqRouter.register({
            label: 'privacy-set',
            matcher: { xmlns: 'privacy', type: 'set', childTag: 'privacy' },
            respond: (iq) => {
                const change = parsePrivacySetCategoryIq(iq)
                if (!change) return buildIqError(iq, { code: 400, text: 'invalid-privacy-set' })
                const next = {
                    ...this.privacySettings,
                    settings: {
                        ...this.privacySettings.settings,
                        [change.category]: change.value
                    }
                }
                this.privacySettings = next
                for (const listener of this.privacySetListeners) {
                    try {
                        listener(change)
                    } catch {
                        // best-effort
                    }
                }
                return buildIqResult(iq)
            }
        })

        // `<iq xmlns="blocklist" type="get"/>` — list query
        this.iqRouter.register({
            label: 'blocklist-get',
            matcher: { xmlns: 'blocklist', type: 'get' },
            respond: (iq) => buildBlocklistResult(iq, [...this.blocklistJids])
        })

        // `<iq xmlns="blocklist" type="set"><item jid=... action="..."/></iq>`
        this.iqRouter.register({
            label: 'blocklist-set',
            matcher: { xmlns: 'blocklist', type: 'set' },
            respond: (iq) => {
                const change = parseBlocklistChangeIq(iq)
                if (!change) {
                    return buildIqError(iq, { code: 400, text: 'invalid-blocklist-set' })
                }
                if (change.action === 'block') {
                    this.blocklistJids.add(change.jid)
                } else {
                    this.blocklistJids.delete(change.jid)
                }
                for (const listener of this.blocklistChangeListeners) {
                    try {
                        listener(change)
                    } catch {
                        // best-effort
                    }
                }
                return buildIqResult(iq)
            }
        })

        // `<iq xmlns="privacy" type="set"><tokens><token jid t type/></tokens></iq>` —
        // trusted-contact privacy token issue. The lib's
        // `WaTrustedContactTokenCoordinator.issuePrivacyToken` only
        // awaits the response, so a bare `result` is enough; we still
        // capture the issued tokens so tests can assert on them via
        // `onOutboundPrivacyTokenIssue`.
        this.iqRouter.register({
            label: 'privacy-token-issue',
            matcher: { xmlns: 'privacy', type: 'set', childTag: 'tokens' },
            respond: (iq) => {
                const tokens = parsePrivacyTokenIssueIq(iq)
                if (tokens) {
                    for (const token of tokens) {
                        this.issuedPrivacyTokens.set(token.jid, token)
                        for (const listener of this.privacyTokenIssueListeners) {
                            try {
                                listener(token)
                            } catch {
                                // best-effort
                            }
                        }
                    }
                }
                return buildIqResult(iq)
            }
        })

        // `<iq xmlns="newsletter" type="get"><my_addons limit="1"/></iq>` —
        // dirty-bit driven newsletter metadata sync. The lib only
        // awaits the response (no `assertIqResult`), but we still
        // return a well-formed `<my_addons/>` payload.
        this.iqRouter.register({
            label: 'newsletter-my-addons',
            matcher: { xmlns: 'newsletter', type: 'get', childTag: 'my_addons' },
            respond: (iq) => buildNewsletterMyAddonsResult(iq)
        })

        // `<iq xmlns="urn:xmpp:whatsapp:dirty" type="set"><clean .../></iq>` —
        // dirty bits clear. The lib swallows errors so the bare ack is
        // enough; we capture the cleared bits for tests via
        // `onOutboundDirtyBitsClear`.
        this.iqRouter.register({
            label: 'dirty-bits-clear',
            matcher: { xmlns: 'urn:xmpp:whatsapp:dirty', type: 'set' },
            respond: (iq) => {
                const bits = parseClearDirtyBitsIq(iq)
                if (bits) {
                    for (const listener of this.dirtyBitsClearListeners) {
                        try {
                            listener({ bits })
                        } catch {
                            // best-effort
                        }
                    }
                }
                return buildIqResult(iq)
            }
        })

        // ─── Tier 3: profile / status / business ──────────────────

        // `<iq xmlns="w:profile:picture" type="get" target=<jid>><picture .../></iq>`
        this.iqRouter.register({
            label: 'profile-picture-get',
            matcher: { xmlns: 'w:profile:picture', type: 'get' },
            respond: (iq) => {
                const parsed = parseGetProfilePictureIq(iq)
                if (!parsed) return buildIqError(iq, { code: 400, text: 'invalid-target' })
                const picture = this.profilePicturesByJid.get(parsed.targetJid)
                if (!picture) {
                    return buildIqError(iq, { code: 404, text: 'item-not-found' })
                }
                return buildGetProfilePictureResult(iq, { ...picture, type: parsed.type })
            }
        })

        // `<iq xmlns="w:profile:picture" type="set"><picture type="image">[bytes]</picture></iq>`
        this.iqRouter.register({
            label: 'profile-picture-set',
            matcher: { xmlns: 'w:profile:picture', type: 'set' },
            respond: (iq) => {
                const parsed = parseSetProfilePictureIq(iq)
                if (!parsed) return buildIqError(iq, { code: 400, text: 'invalid-set' })
                const targetJid = parsed.targetJid ?? 'me'
                const newId = `${Date.now()}`
                this.profilePicturesByJid.set(targetJid, {
                    id: newId,
                    url: `https://fake-media.local/profile/${targetJid}/${newId}.jpg`,
                    directPath: `/profile/${targetJid}/${newId}.jpg`,
                    type: 'image'
                })
                for (const listener of this.profilePictureSetListeners) {
                    try {
                        listener(parsed)
                    } catch {
                        // best-effort
                    }
                }
                return buildSetProfilePictureResult(iq, newId)
            }
        })

        // `<iq xmlns="status" type="set"><status>...</status></iq>`
        this.iqRouter.register({
            label: 'status-set',
            matcher: { xmlns: 'status', type: 'set' },
            respond: (iq) => {
                const parsed = parseSetStatusIq(iq)
                if (parsed) {
                    this.latestStatusText = parsed.text
                    for (const listener of this.statusSetListeners) {
                        try {
                            listener(parsed)
                        } catch {
                            // best-effort
                        }
                    }
                }
                return buildIqResult(iq)
            }
        })

        // `<iq xmlns="w:biz" type="get"><business_profile><profile jid=.../></business_profile></iq>`
        this.iqRouter.register({
            label: 'business-profile-get',
            matcher: { xmlns: 'w:biz', type: 'get', childTag: 'business_profile' },
            respond: (iq) => {
                const requestedJids = parseGetBusinessProfileIq(iq) ?? []
                const profiles: FakeBusinessProfile[] = []
                for (const jid of requestedJids) {
                    const profile = this.businessProfilesByJid.get(jid)
                    if (profile) profiles.push(profile)
                }
                return buildBusinessProfileResult(iq, profiles)
            }
        })

        // `<iq xmlns="w:biz" type="set"><business_profile .../></iq>` — edit
        // We just ack success; tests can inspect the captured stanza
        // via `capturedStanzaSnapshot()` if they need to validate the
        // shape.
        this.iqRouter.register({
            label: 'business-profile-set',
            matcher: { xmlns: 'w:biz', type: 'set', childTag: 'business_profile' },
            respond: (iq) => buildIqResult(iq)
        })
    }

    private buildGroupMetadataReply(
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

    private notifyGroupOp(op: CapturedGroupOp): void {
        for (const listener of this.groupOpListeners) {
            try {
                listener(op)
            } catch {
                // best-effort
            }
        }
    }

    private lookupDeviceIdsForUser(userJid: string): readonly number[] {
        const deviceIds: number[] = []
        for (const peer of this.peerRegistry.values()) {
            if (toUserJidPart(peer.jid) !== userJid) continue
            deviceIds.push(toDeviceIdPart(peer.jid))
        }
        deviceIds.sort((a, b) => a - b)
        return deviceIds
    }

    private async consumeOutboundAppStatePatches(iq: BinaryNode): Promise<void> {
        if (!Array.isArray(iq.content)) return
        const sync = iq.content.find((child) => child.tag === 'sync')
        if (!sync || !Array.isArray(sync.content)) return
        for (const collectionNode of sync.content) {
            if (collectionNode.tag !== 'collection') continue
            if (!Array.isArray(collectionNode.content)) continue
            const collectionName = collectionNode.attrs.name
            if (!collectionName) continue
            for (const patchNode of collectionNode.content) {
                if (patchNode.tag !== 'patch') continue
                const patchBytes = patchNode.content
                if (!(patchBytes instanceof Uint8Array)) continue
                try {
                    const decoded = proto.SyncdPatch.decode(patchBytes)
                    const keyId = decoded.keyId?.id
                    if (!keyId) continue
                    const keyData = this.appStateSyncKeysByKeyId.get(toHex(keyId))
                    if (!keyData) continue
                    // protobuf.js may return uint64 as a Long or a primitive
                    // number depending on configuration. Normalize via the
                    // Long-style toNumber() shim if it's available.
                    const rawVersion = decoded.version?.version
                    let patchVersion = 0
                    if (typeof rawVersion === 'number') {
                        patchVersion = rawVersion
                    } else if (
                        rawVersion !== null &&
                        rawVersion !== undefined &&
                        typeof (rawVersion as { toNumber?: () => number }).toNumber === 'function'
                    ) {
                        patchVersion = (rawVersion as { toNumber: () => number }).toNumber()
                    }
                    for (const mutation of decoded.mutations ?? []) {
                        const operationCode = mutation.operation
                        if (operationCode === null || operationCode === undefined) continue
                        const record = mutation.record
                        if (!record) continue
                        const indexMac = record.index?.blob
                        const valueBlob = record.value?.blob
                        if (!indexMac || !valueBlob) continue
                        const operation: 'set' | 'remove' =
                            operationCode === proto.SyncdMutation.SyncdOperation.REMOVE
                                ? 'remove'
                                : 'set'
                        const decrypted = await this.appStateCrypto.decryptMutation({
                            operation,
                            keyId,
                            keyData,
                            indexMac,
                            valueBlob
                        })
                        let action: string | undefined
                        try {
                            const parsed = JSON.parse(decrypted.index)
                            if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
                                action = parsed[0]
                            }
                        } catch {
                            // index is opaque — leave action undefined
                        }
                        const captured: CapturedAppStateMutation = {
                            collection: collectionName,
                            operation,
                            index: decrypted.index,
                            action,
                            version: decrypted.version,
                            value: decrypted.value,
                            patchVersion
                        }
                        for (const listener of this.outboundMutationListeners) {
                            try {
                                listener(captured)
                            } catch {
                                // listeners are best-effort
                            }
                        }
                    }
                } catch {
                    // bad patch — skip silently so the auto handler still
                    // returns a success response (the lib will reconcile
                    // via its retry logic if it really cared).
                }
            }
        }
    }

    /**
     * Register an IQ handler. The fake server matches incoming IQ stanzas
     * against the registered handlers in registration order; the first
     * match wins. Test-installed handlers are prepended so they shadow
     * the constructor-registered global defaults.
     */
    public registerIqHandler(
        matcher: WaFakeIqMatcher,
        respond: WaFakeIqResponder,
        label?: string
    ): () => void {
        const handler: WaFakeIqHandler = { matcher, respond, label }
        return this.iqRouter.register(handler, { priority: 'high' })
    }

    /**
     * Register a callback that runs each time a pipeline reaches the
     * authenticated state (after the noise handshake completes and the
     * success node has been pushed). The callback may push stanzas via
     * `pipeline.sendStanza`.
     */
    public onAuthenticatedPipeline(listener: AuthenticatedPipelineListener): () => void {
        this.authenticatedListeners.add(listener)
        return () => this.authenticatedListeners.delete(listener)
    }

    /**
     * Builds the scenario for this server and runs the synchronous
     * configuration block. The builder is the recommended way to script
     * fake server behavior in tests.
     *
     * Example:
     *     server.scenario((s) => {
     *         s.onIq({ xmlns: 'usync' }).respondWith(buildUsyncResult([...]))
     *         s.afterAuth(async (pipeline) => {
     *             await pipeline.sendStanza(buildIncomingMessage(...))
     *         })
     *     })
     */
    public scenario(configure: (s: Scenario) => void): void {
        configure(new Scenario(this))
    }

    /**
     * Returns a promise that resolves with the next inbound stanza matching
     * the given pattern. If a matching stanza was already captured before
     * the call, it resolves immediately. Rejects after `timeoutMs` if no
     * match arrives.
     */
    public expectIq(matcher: WaFakeIqMatcher, options: ExpectIqOptions = {}): Promise<BinaryNode> {
        const timeoutMs = options.timeoutMs ?? 2_000

        // Check stanzas already captured.
        for (const captured of this.capturedStanzas) {
            if (matchesIq(captured, matcher)) {
                return Promise.resolve(captured)
            }
        }

        return new Promise((resolve, reject) => {
            const expectation: PendingIqExpectation = {
                matcher,
                resolve: (iq) => {
                    this.pendingIqExpectations.delete(expectation)
                    clearTimeout(expectation.timer)
                    resolve(iq)
                },
                reject: (error) => {
                    this.pendingIqExpectations.delete(expectation)
                    clearTimeout(expectation.timer)
                    reject(error)
                },
                timer: setTimeout(() => {
                    this.pendingIqExpectations.delete(expectation)
                    reject(
                        new Error(
                            `expectIq timed out after ${timeoutMs}ms (${describeMatcher(matcher)})`
                        )
                    )
                }, timeoutMs)
            }
            this.pendingIqExpectations.add(expectation)
        })
    }

    /** Returns a snapshot of every stanza the client has sent so far. */
    public capturedStanzaSnapshot(): readonly BinaryNode[] {
        return this.capturedStanzas.slice()
    }

    /**
     * Returns a promise that resolves with the next inbound stanza of any
     * tag matching the given pattern. If a matching stanza was already
     * captured before the call, it resolves immediately. Rejects after
     * `timeoutMs` if no match arrives.
     *
     * `expectIq` is a convenience over this method specialized for IQs.
     */
    public expectStanza(
        matcher: StanzaMatcher,
        options: ExpectStanzaOptions = {}
    ): Promise<BinaryNode> {
        const timeoutMs = options.timeoutMs ?? 2_000

        for (const captured of this.capturedStanzas) {
            if (matchesStanza(captured, matcher)) {
                return Promise.resolve(captured)
            }
        }

        return new Promise((resolve, reject) => {
            const expectation: PendingStanzaExpectation = {
                matcher,
                resolve: (node) => {
                    this.pendingStanzaExpectations.delete(expectation)
                    clearTimeout(expectation.timer)
                    resolve(node)
                },
                reject: (error) => {
                    this.pendingStanzaExpectations.delete(expectation)
                    clearTimeout(expectation.timer)
                    reject(error)
                },
                timer: setTimeout(() => {
                    this.pendingStanzaExpectations.delete(expectation)
                    reject(
                        new Error(
                            `expectStanza timed out after ${timeoutMs}ms (${describeStanzaMatcher(matcher)})`
                        )
                    )
                }, timeoutMs)
            }
            this.pendingStanzaExpectations.add(expectation)
        })
    }

    /**
     * Pushes the same stanza to every authenticated pipeline. Useful for
     * tests that have multiple connected clients (a rare scenario today,
     * but cheap to expose).
     *
     * Returns the number of pipelines the stanza was sent to.
     */
    public async broadcastStanza(node: BinaryNode): Promise<number> {
        const tasks: Array<Promise<void>> = []
        for (const pipeline of this.pipelines) {
            tasks.push(pipeline.sendStanza(node).catch(() => undefined))
        }
        await Promise.all(tasks)
        return tasks.length
    }

    /**
     * Waits until at least one pipeline has reached the authenticated
     * state. Resolves immediately if a pipeline is already authenticated.
     * Rejects after `timeoutMs` if none becomes authenticated in time.
     */
    public waitForAuthenticatedPipeline(timeoutMs = 60_000): Promise<WaFakeConnectionPipeline> {
        for (const pipeline of this.pipelines) {
            if (pipeline.isAuthenticated()) {
                return Promise.resolve(pipeline)
            }
        }
        return this.waitForNextAuthenticatedPipeline(timeoutMs)
    }

    /**
     * Waits for the **next** pipeline to reach the authenticated state,
     * even if there is already a pipeline authenticated. Useful after a
     * lib-side reconnect (e.g. after pairing) where the existing pipeline
     * is about to close and a fresh one will replace it.
     */
    public waitForNextAuthenticatedPipeline(timeoutMs = 60_000): Promise<WaFakeConnectionPipeline> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () =>
                    reject(
                        new Error(`waitForNextAuthenticatedPipeline timed out after ${timeoutMs}ms`)
                    ),
                timeoutMs
            )
            const unregister = this.onAuthenticatedPipeline((pipeline) => {
                clearTimeout(timer)
                unregister()
                resolve(pipeline)
            })
        })
    }

    /**
     * Pushes a `<notification type="server_sync"/>` listing the given
     * collection names. The lib's incoming notification handler reacts
     * by triggering an `appStateSync.sync()` round, which the
     * auto-registered `app-state-sync` IQ handler answers via the
     * registered providers (or empty success if none are registered).
     *
     * Resolves once the notification has been written to the wire.
     */
    public async pushServerSyncNotification(
        pipeline: WaFakeConnectionPipeline,
        input: BuildServerSyncNotificationInput
    ): Promise<void> {
        await pipeline.sendStanza(buildServerSyncNotification(input))
    }

    /**
     * Encrypts the supplied plaintext via the lib's real
     * `WaMediaCrypto.encryptBytes`, stores the resulting ciphertext
     * keyed by a fresh random URL path, and returns the metadata
     * (mediaKey + sha-256s + path) the test must embed in any message
     * proto / `historySyncNotification` / `ExternalBlobReference` it
     * hands to the client.
     *
     * The lib downloads the bytes from the fake server's HTTP listener
     * (via the absolute URL exposed by `mediaUrl(path)`), then runs
     * its own `WaMediaCrypto.decryptBytes` against the ciphertext.
     */
    public async publishMediaBlob(input: PublishMediaInput): Promise<PublishedMediaBlob> {
        return this.mediaStore.publish(input)
    }

    /**
     * Builds the absolute `https://host:port/<path>` URL the lib should
     * use to download a previously-published media blob. Tests stamp
     * the result into a message proto's `directPath` so that the lib's
     * media transfer client picks it up verbatim (the lib accepts
     * absolute directPaths and bypasses its default media-host
     * fallback). The URL points at the fake server's HTTPS listener,
     * which uses a throwaway self-signed cert — clients trust it via
     * the `mediaDownloadAgent` exposed below.
     */
    public mediaUrl(path: string): string {
        const info = this.requireMediaHttpsInfo()
        const normalized = path.startsWith('/') ? path : `/${path}`
        return `https://${info.host}:${info.port}${normalized}`
    }

    private requireMediaHttpsInfo(): { readonly host: string; readonly port: number } {
        const info = this.mediaHttpsServer.info
        if (!info) {
            throw new Error('fake media https server is not listening')
        }
        return info
    }

    /**
     * Returns an `https.Agent` configured to skip TLS verification, so
     * tests can hand it to a `WaClient` via
     * `proxy: { mediaUpload: server.mediaProxyAgent, mediaDownload: server.mediaProxyAgent }`
     * and have the lib's media transfer client trust the fake media
     * HTTPS listener's self-signed cert.
     */
    public get mediaProxyAgent(): HttpsAgent {
        if (!this.cachedMediaProxyAgent) {
            this.cachedMediaProxyAgent = new HttpsAgent({ rejectUnauthorized: false })
        }
        return this.cachedMediaProxyAgent
    }

    /**
     * Registers an app-state sync key (the same `keyId`/`keyData` the
     * test ships to the lib via `FakePeer.sendAppStateSyncKeyShare`)
     * so the fake server can decrypt outbound mutations the lib uploads
     * inside `<iq xmlns=w:sync:app:state>` patches. Without a registered
     * key the patch is silently echoed back as success and the
     * mutation contents are inaccessible to the test.
     */
    public registerAppStateSyncKey(keyId: Uint8Array, keyData: Uint8Array): void {
        this.appStateSyncKeysByKeyId.set(toHex(keyId), keyData)
    }

    /**
     * Subscribes to outbound app-state mutations the lib uploads. The
     * listener fires once per decrypted `SyncdMutation` inside any
     * inbound app-state sync IQ. Returns an unsubscribe function.
     */
    public onOutboundAppStateMutation(
        listener: (mutation: CapturedAppStateMutation) => void
    ): () => void {
        this.outboundMutationListeners.add(listener)
        return () => {
            this.outboundMutationListeners.delete(listener)
        }
    }

    /**
     * Convenience that resolves with the next decrypted outbound
     * mutation matching the given predicate. Rejects after `timeoutMs`.
     */
    public expectAppStateMutation(
        predicate: (mutation: CapturedAppStateMutation) => boolean,
        timeoutMs = 15_000
    ): Promise<CapturedAppStateMutation> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                unsubscribe()
                reject(new Error(`expectAppStateMutation timed out after ${timeoutMs}ms`))
            }, timeoutMs)
            const unsubscribe = this.onOutboundAppStateMutation((mutation) => {
                if (!predicate(mutation)) return
                clearTimeout(timer)
                unsubscribe()
                resolve(mutation)
            })
        })
    }

    /**
     * Registers a payload provider for a given app-state collection.
     * The provider is invoked once per inbound app-state sync IQ that
     * names the collection, and the returned payload is shipped inside
     * the `<sync><collection>` response. Returning `null` falls back to
     * the empty-success default.
     *
     * Used by tests that ship real encrypted snapshots/patches: the
     * provider typically wraps a `FakeAppStateCollection` and returns
     * its `encodeSnapshot()` (first round) then `encodePendingPatch()`
     * (subsequent rounds with queued mutations).
     *
     * Returns an unsubscribe function that clears the provider.
     */
    public provideAppStateCollection(
        name: string,
        provider: () => Promise<FakeAppStateCollectionPayload | null> | FakeAppStateCollectionPayload | null
    ): () => void {
        this.appStateCollectionProviders.set(name, provider)
        return () => {
            this.appStateCollectionProviders.delete(name)
        }
    }

    /**
     * Pushes a `<notification type="encrypt"><count value="0"/></notification>`
     * to the given pipeline. The lib's `WAWebHandlePreKeyLow` handler reacts
     * to this by sending a fresh PreKey upload IQ, which the fake server
     * automatically captures via its built-in `prekey-upload` IQ handler.
     *
     * Returns a promise that resolves once the upload bundle has been
     * captured (or immediately if it was captured earlier).
     */
    public async triggerPreKeyUpload(
        pipeline: WaFakeConnectionPipeline,
        timeoutMs = 15_000
    ): Promise<ClientPreKeyBundle> {
        if (this.capturedPreKeyBundle) {
            return this.capturedPreKeyBundle
        }
        const bundlePromise = this.awaitPreKeyBundle(timeoutMs)
        const id = `prekey-low-${this.nextPreKeyNotificationId++}`
        await pipeline.sendStanza(
            buildNotification({
                id,
                type: 'encrypt',
                content: [
                    {
                        tag: 'count',
                        attrs: { value: '0' }
                    }
                ]
            })
        )
        return bundlePromise
    }

    /**
     * Returns a promise that resolves with the client's PreKey upload
     * bundle as soon as it has been captured. Resolves immediately if a
     * bundle was already captured. Rejects after `timeoutMs` if none has
     * arrived.
     */
    public awaitPreKeyBundle(timeoutMs = 15_000): Promise<ClientPreKeyBundle> {
        if (this.capturedPreKeyBundle) {
            return Promise.resolve(this.capturedPreKeyBundle)
        }
        return new Promise((resolve, reject) => {
            const waiter: PendingPreKeyBundleWaiter = {
                resolve: (bundle) => {
                    clearTimeout(waiter.timer)
                    this.preKeyBundleWaiters.delete(waiter)
                    resolve(bundle)
                },
                reject: (error) => {
                    clearTimeout(waiter.timer)
                    this.preKeyBundleWaiters.delete(waiter)
                    reject(error)
                },
                timer: setTimeout(() => {
                    this.preKeyBundleWaiters.delete(waiter)
                    reject(new Error(`awaitPreKeyBundle timed out after ${timeoutMs}ms`))
                }, timeoutMs)
            }
            this.preKeyBundleWaiters.add(waiter)
        })
    }

    /** Snapshot of the captured PreKey bundle, or `null` if none seen yet. */
    public capturedPreKeyBundleSnapshot(): ClientPreKeyBundle | null {
        return this.capturedPreKeyBundle
    }

    /**
     * Creates a fake peer that can encrypt messages for the connected
     * client. The peer lazily resolves the client's PreKey bundle on its
     * first send (using whatever bundle was captured by then).
     *
     * The peer is added to the centralised `peerRegistry` keyed by its
     * device JID; the global usync + prekey-fetch IQ handlers
     * registered in the constructor look the peer up by JID at request
     * time, so multiple peers can coexist without IQ-handler
     * collisions. Tests that need multi-device fanout for a single
     * user JID should use `createFakePeerWithDevices`; tests that need
     * a real group with multiple participants should use
     * `createFakeGroup`.
     */
    public async createFakePeer(
        options: CreateFakePeerOptions,
        pipeline: WaFakeConnectionPipeline
    ): Promise<FakePeer> {
        const peer = await FakePeer.create(options, this.buildFakePeerDeps(pipeline))
        this.peerRegistry.set(peer.jid, peer)
        return peer
    }

    /**
     * Multi-device variant of `createFakePeer`. Creates one `FakePeer`
     * per `deviceId` (each with its own Signal identity + prekey
     * bundle) under a shared user JID. Each device is added to the
     * peer registry independently, so the global usync handler will
     * return all of them together when the lib resolves the user.
     *
     * Use this for cross-checks that exercise the lib's device
     * fanout — `client.sendMessage(userJid, ...)` will produce a
     * `<message><participants><to jid=user:N><enc/></to>...</participants></message>`
     * stanza with one `<enc>` child per device.
     */
    public async createFakePeerWithDevices(
        input: {
            readonly userJid: string
            readonly deviceIds: readonly number[]
            readonly displayName?: string
        },
        pipeline: WaFakeConnectionPipeline
    ): Promise<readonly FakePeer[]> {
        if (input.deviceIds.length === 0) {
            throw new Error('createFakePeerWithDevices requires at least one deviceId')
        }
        const atIdx = input.userJid.indexOf('@')
        if (atIdx < 0) {
            throw new Error(`invalid userJid ${input.userJid}`)
        }
        const userPart = input.userJid.slice(0, atIdx)
        const server = input.userJid.slice(atIdx + 1)
        const peers: FakePeer[] = []
        for (const deviceId of input.deviceIds) {
            const deviceJid =
                deviceId === 0 ? input.userJid : `${userPart}:${deviceId}@${server}`
            const peer = await FakePeer.create(
                { jid: deviceJid, displayName: input.displayName },
                this.buildFakePeerDeps(pipeline)
            )
            this.peerRegistry.set(peer.jid, peer)
            peers.push(peer)
        }
        return peers
    }

    /**
     * Backwards-compat alias for `createFakePeerWithDevices`. The old
     * name was confusing because "peer group" implied a chat group;
     * the new name says what the call actually does. Both names are
     * kept around so existing tests don't break.
     *
     * @deprecated use `createFakePeerWithDevices` instead.
     */
    public createFakePeerGroup(
        input: {
            readonly userJid: string
            readonly deviceIds: readonly number[]
            readonly displayName?: string
        },
        pipeline: WaFakeConnectionPipeline
    ): Promise<readonly FakePeer[]> {
        return this.createFakePeerWithDevices(input, pipeline)
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

    /** Snapshot of every trusted-contact privacy token the lib has issued. */
    public privacyTokensIssuedSnapshot(): ReadonlyMap<string, FakePrivacyTokenIssue> {
        return new Map(this.issuedPrivacyTokens)
    }

    /**
     * Test-only escape hatch that feeds a synthetic IQ stanza through
     * the global IQ router and returns whatever the matched handler
     * produces. Used by unit-style tests that want to drive handlers
     * which only fire from background lib code paths (dirty-bit clear,
     * newsletter metadata sync, trusted-contact privacy-token issue).
     */
    public async routeIqForTest(iq: BinaryNode): Promise<BinaryNode | null> {
        return this.iqRouter.route(iq)
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

    /** Snapshot of the current privacy settings + per-category disallowed lists. */
    public privacySettingsSnapshot(): FakePrivacySettingsState {
        return this.privacySettings
    }

    /** Snapshot of the current blocklist as a sorted array. */
    public blocklistSnapshot(): readonly string[] {
        return [...this.blocklistJids].sort()
    }

    /** Pre-set or override a profile picture record for a given jid. */
    public setProfilePictureRecord(jid: string, picture: FakeProfilePictureResult): void {
        this.profilePicturesByJid.set(jid, picture)
    }

    /** Pre-set or override a business profile record for a given jid. */
    public setBusinessProfileRecord(jid: string, profile: FakeBusinessProfile): void {
        this.businessProfilesByJid.set(jid, profile)
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

    private buildFakePeerDeps(pipeline: WaFakeConnectionPipeline): {
        readonly bundleResolver: () => Promise<ClientPreKeyBundle>
        readonly pushStanza: (stanza: BinaryNode) => Promise<void>
        readonly subscribeInboundMessages: (
            listener: (stanza: BinaryNode) => void
        ) => () => void
    } {
        return {
            bundleResolver: () => this.awaitPreKeyBundle(),
            pushStanza: (stanza) => pipeline.sendStanza(stanza),
            subscribeInboundMessages: (listener) => {
                const wrapped = (node: BinaryNode): void => {
                    if (node.tag !== 'message') return
                    listener(node)
                }
                this.inboundStanzaListeners.add(wrapped)
                return () => {
                    this.inboundStanzaListeners.delete(wrapped)
                }
            }
        }
    }

    /**
     * Drives the QR-pairing flow with a real, freshly-created `WaClient`
     * end-to-end via the wire (no auth-store stubbing).
     *
     * The driver:
     *   1. Sends a `pair-device` IQ with 6 random refs.
     *   2. Awaits the `advSecretKey` callback (the test extracts it from
     *      the `auth_qr` event the lib emits as soon as it sees the refs).
     *   3. Builds an `ADVSignedDeviceIdentityHMAC` using a fresh fake
     *      primary keypair and the supplied `advSecretKey`, and pushes
     *      a `pair-success` IQ.
     *
     * The lib's pairing flow then verifies the HMAC, the account
     * signature, replies with `<pair-device-sign>`, persists the new
     * credentials and emits `auth_paired`.
     */
    public async runPairing(
        pipeline: WaFakeConnectionPipeline,
        options: FakePairingDriverOptions,
        companionMaterialResolver: () => Promise<{
            readonly advSecretKey: Uint8Array
            readonly identityPublicKey: Uint8Array
        }>
    ): Promise<void> {
        const driver = new FakePairingDriver(options, {
            pipeline,
            companionMaterialResolver
        })
        await driver.run()
    }

    /**
     * Make the fake server reject every new connection by closing the
     * websocket immediately after `accept`. Useful for testing the lib's
     * reaction to a server-side handshake / auth failure.
     *
     * Pass `null` to clear the reject mode.
     */
    public setRejectMode(info: { readonly code?: number; readonly reason?: string } | null): void {
        if (info === null) {
            this.rejectMode = null
            return
        }
        this.rejectMode = {
            code: info.code ?? 1011,
            reason: info.reason ?? 'fake-server reject mode'
        }
    }

    public static async start(options: FakeWaServerOptions = {}): Promise<FakeWaServer> {
        const server = new FakeWaServer(options)
        await server.listen()
        return server
    }

    public get url(): string {
        return this.requireListening().url
    }

    public get host(): string {
        return this.requireListening().host
    }

    public get port(): number {
        return this.requireListening().port
    }

    /**
     * The ephemeral root CA the fake server signs cert chains with. Tests
     * pass this into `WaClient` via `testHooks.noiseRootCa` so that the lib
     * runs the full certificate verification path against our trust root.
     */
    public get noiseRootCa(): FakeWaServerNoiseRootCa {
        const root = this.requireRootCa()
        return { publicKey: root.publicKey, serial: root.serial }
    }

    public onPipeline(listener: FakeWaServerPipelineListener): void {
        this.pipelineListener = listener
    }

    public async listen(): Promise<void> {
        if (this.listenInfo) {
            return
        }
        ;[this.rootCa, this.serverStaticKeyPair] = await Promise.all([
            generateFakeNoiseRootCa(),
            X25519.generateKeyPair()
        ])
        // Wire the HTTP request handler BEFORE the listen call so we
        // never race against an inbound media GET that lands while the
        // listener is still bare. The handler serves blobs registered
        // via `publishMediaBlob`; everything else 404s.
        const mediaHandler = this.buildMediaRequestHandler()
        this.wsServer.setHttpRequestHandler(mediaHandler)
        this.mediaHttpsServer.setRequestHandler(mediaHandler)
        this.listenInfo = await this.wsServer.listen()
        await this.mediaHttpsServer.listen('127.0.0.1')
    }

    private buildMediaRequestHandler(): (req: IncomingMessage, res: ServerResponse) => void {
        return (req, res): void => {
            const rawUrl = req.url ?? ''
            const [path, query] = rawUrl.split('?')
            const method = (req.method ?? 'GET').toUpperCase()
            if (method === 'POST') {
                this.handleMediaUpload(req, res, path, query)
                return
            }
            const blob = this.mediaStore.get(path)
            if (!blob) {
                res.statusCode = 404
                res.end()
                return
            }
            res.statusCode = 200
            res.setHeader('content-type', 'application/octet-stream')
            res.setHeader('content-length', String(blob.encryptedBytes.byteLength))
            res.end(Buffer.from(blob.encryptedBytes))
        }
    }

    private handleMediaUpload(
        req: IncomingMessage,
        res: ServerResponse,
        path: string,
        query: string | undefined
    ): void {
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => {
            chunks.push(chunk)
        })
        req.on('end', () => {
            const encryptedBytes = new Uint8Array(Buffer.concat(chunks))
            // Path layout: `/mms/<type>/<base64UrlSafe(fileEncSha256)>`.
            // The token in the trailing segment is what the lib uses as the
            // `direct_path` echo, so we just hand it back unchanged in the
            // JSON response below.
            const segments = path.split('/').filter(Boolean)
            const mediaType = segments[1] ?? 'unknown'
            const auth = parseQueryParam(query, 'auth')
            const upload: CapturedMediaUpload = {
                path,
                mediaType,
                encryptedBytes,
                contentType: req.headers['content-type'],
                auth,
                receivedAtMs: Date.now()
            }
            this.capturedMediaUploads.push(upload)
            this.nextUploadCounter += 1
            const downloadUrl = this.mediaUrl(path)
            const responseBody = JSON.stringify({
                url: downloadUrl,
                direct_path: path
            })
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.setHeader('content-length', String(Buffer.byteLength(responseBody)))
            res.end(responseBody)
        })
        req.on('error', (error) => {
            if (!res.headersSent) {
                res.statusCode = 500
            }
            res.end(error.message)
        })
    }

    /**
     * Snapshot of every media upload the lib has POSTed to the fake
     * media server since startup, in arrival order. Tests assert
     * upload contents (or pass them through `WaMediaCrypto.decryptBytes`
     * with a captured mediaKey to round-trip the original plaintext).
     */
    public capturedMediaUploadSnapshot(): readonly CapturedMediaUpload[] {
        return this.capturedMediaUploads.slice()
    }

    public async stop(): Promise<void> {
        // Pipelines own the connections; closing them severs the websocket.
        // We additionally race the close to make `stop` deterministic.
        this.pipelines.clear()
        await this.wsServer.close()
        await this.mediaHttpsServer.close()
        // Tear down the keep-alive proxy agent so its sockets release
        // and the test process can exit cleanly. Without this the
        // accumulated sockets across many tests starve the OS file
        // descriptor pool and slow subsequent tests.
        if (this.cachedMediaProxyAgent) {
            this.cachedMediaProxyAgent.destroy()
            this.cachedMediaProxyAgent = null
        }
        this.listenInfo = null
        this.rootCa = null
        this.serverStaticKeyPair = null
    }

    private handleConnection(connection: WaFakeConnection): void {
        if (this.rejectMode) {
            connection.close(this.rejectMode.code, this.rejectMode.reason)
            return
        }
        if (!this.rootCa || !this.serverStaticKeyPair) {
            connection.close(1011, 'fake server not initialized')
            return
        }
        const pipeline = new WaFakeConnectionPipeline({
            connection,
            rootCa: this.rootCa,
            serverStaticKeyPair: this.serverStaticKeyPair,
            iqRouter: this.iqRouter
        })
        this.pipelines.add(pipeline)
        pipeline.setEvents({
            onAuthenticated: () => {
                for (const listener of this.authenticatedListeners) {
                    void listener(pipeline)
                }
            },
            onStanza: (node) => this.handleCapturedStanza(node),
            onClose: () => this.pipelines.delete(pipeline)
        })
        this.pipelineListener?.(pipeline)
    }

    private handleCapturedStanza(node: BinaryNode): void {
        this.capturedStanzas.push(node)

        for (const listener of this.inboundStanzaListeners) {
            try {
                listener(node)
            } catch {
                // Listeners are best-effort.
            }
        }

        for (const expectation of this.pendingStanzaExpectations) {
            if (matchesStanza(node, expectation.matcher)) {
                expectation.resolve(node)
                break
            }
        }

        if (node.tag !== 'iq') {
            return
        }
        for (const expectation of this.pendingIqExpectations) {
            if (matchesIq(node, expectation.matcher)) {
                expectation.resolve(node)
                return
            }
        }
    }

    private requireListening(): WaFakeWsServerListenInfo {
        if (!this.listenInfo) {
            throw new Error('fake server is not listening')
        }
        return this.listenInfo
    }

    private requireRootCa(): FakeNoiseRootCa {
        if (!this.rootCa) {
            throw new Error('fake server is not listening')
        }
        return this.rootCa
    }
}

/**
 * Walks `<iq><usync><list><user jid=.../></list></usync></iq>` and
 * returns the user JIDs being queried. Used by the global usync
 * handler to look up devices in the peer registry.
 */
function parseUsyncRequestedUserJids(iq: BinaryNode): readonly string[] {
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
 * Strips the device suffix from a JID. `5511aaa:1@s.whatsapp.net`
 * becomes `5511aaa@s.whatsapp.net`. Idempotent for user JIDs.
 */
function toUserJidPart(deviceJid: string): string {
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
function toDeviceIdPart(deviceJid: string): number {
    const atIdx = deviceJid.indexOf('@')
    if (atIdx < 0) return 0
    const userPart = deviceJid.slice(0, atIdx)
    const colonIdx = userPart.indexOf(':')
    if (colonIdx < 0) return 0
    const parsed = Number.parseInt(userPart.slice(colonIdx + 1), 10)
    return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Builds the `<iq type=result><group jid=.../></iq>` payload the
 * lib's `parseGroupMetadata` reads.
 */
function parseRequestedKeyJids(iq: BinaryNode): readonly string[] {
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

function toHex(bytes: Uint8Array): string {
    let out = ''
    for (let index = 0; index < bytes.byteLength; index += 1) {
        const value = bytes[index]
        out += value < 16 ? `0${value.toString(16)}` : value.toString(16)
    }
    return out
}

function parseQueryParam(query: string | undefined, name: string): string | undefined {
    if (!query) return undefined
    for (const pair of query.split('&')) {
        const eq = pair.indexOf('=')
        if (eq < 0) continue
        const key = decodeURIComponent(pair.slice(0, eq))
        if (key !== name) continue
        return decodeURIComponent(pair.slice(eq + 1))
    }
    return undefined
}

function matchesIq(iq: BinaryNode, matcher: WaFakeIqMatcher): boolean {
    if (iq.tag !== 'iq') return false
    if (matcher.type !== undefined && iq.attrs.type !== matcher.type) return false
    if (matcher.xmlns !== undefined && iq.attrs.xmlns !== matcher.xmlns) return false
    if (matcher.childTag !== undefined) {
        const children = Array.isArray(iq.content) ? iq.content : null
        if (!children || children.length === 0) return false
        if (children[0].tag !== matcher.childTag) return false
    }
    return true
}

function describeMatcher(matcher: WaFakeIqMatcher): string {
    const parts: string[] = []
    if (matcher.type !== undefined) parts.push(`type=${matcher.type}`)
    if (matcher.xmlns !== undefined) parts.push(`xmlns=${matcher.xmlns}`)
    if (matcher.childTag !== undefined) parts.push(`childTag=${matcher.childTag}`)
    return parts.length > 0 ? parts.join(', ') : 'any iq'
}

function matchesStanza(node: BinaryNode, matcher: StanzaMatcher): boolean {
    if (matcher.tag !== undefined && node.tag !== matcher.tag) return false
    if (matcher.type !== undefined && node.attrs.type !== matcher.type) return false
    if (matcher.xmlns !== undefined && node.attrs.xmlns !== matcher.xmlns) return false
    if (matcher.from !== undefined && node.attrs.from !== matcher.from) return false
    if (matcher.to !== undefined && node.attrs.to !== matcher.to) return false
    if (matcher.childTag !== undefined) {
        const children = Array.isArray(node.content) ? node.content : null
        if (!children || children.length === 0) return false
        if (children[0].tag !== matcher.childTag) return false
    }
    return true
}

function describeStanzaMatcher(matcher: StanzaMatcher): string {
    const parts: string[] = []
    if (matcher.tag !== undefined) parts.push(`tag=${matcher.tag}`)
    if (matcher.type !== undefined) parts.push(`type=${matcher.type}`)
    if (matcher.xmlns !== undefined) parts.push(`xmlns=${matcher.xmlns}`)
    if (matcher.from !== undefined) parts.push(`from=${matcher.from}`)
    if (matcher.to !== undefined) parts.push(`to=${matcher.to}`)
    if (matcher.childTag !== undefined) parts.push(`childTag=${matcher.childTag}`)
    return parts.length > 0 ? parts.join(', ') : 'any stanza'
}

export type { WaFakeAuthenticatedInfo, WaFakeConnectionPipeline }
export type { BinaryNode }
