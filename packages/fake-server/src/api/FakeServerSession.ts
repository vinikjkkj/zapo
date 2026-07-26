/** Per-session isolated server state: registries, prekeys, app-state, IQ routing, capture. */

import type { BuildAbPropsResultInput } from '../protocol/iq/abprops'
import type { ParsedPairDeviceUpload } from '../protocol/iq/companion-host'
import {
    type WaFakeIqHandler,
    type WaFakeIqMatcher,
    type WaFakeIqResponder,
    WaFakeIqRouter
} from '../protocol/iq/router'
import type { ClientPreKeyBundle } from '../protocol/signal/prekey-upload'
import { FakeCompanionHostState, readCompanionKeyIndex } from '../state/fake-companion-host'
import { type BinaryNode } from '../transport/codec'

import { AppStateSyncManager } from './AppStateSyncManager'
import {
    type IqHandlerDeps,
    type LinkedCompanionResult,
    registerDefaultIqHandlers
} from './iq-handlers'
import { PreKeyDispenser } from './PreKeyDispenser'
import { ServerRegistries, toDeviceIdPart } from './ServerRegistries'

const HOST_DOMAIN = 's.whatsapp.net'

export interface ExpectIqOptions {
    readonly timeoutMs?: number
}

export interface ExpectStanzaOptions {
    readonly timeoutMs?: number
}

export interface StanzaMatcher {
    readonly tag?: string
    readonly type?: string
    readonly xmlns?: string
    readonly from?: string
    readonly to?: string
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

/**
 * Shared server-side dependencies a session needs but does not own. The media
 * HTTPS server is process-global (one listener), so its address is injected
 * rather than duplicated per session.
 */
export interface FakeServerSessionHost {
    requireMediaHttpsInfo(): { readonly host: string; readonly port: number }
    /**
     * Completes a pairing offer against the companion connection that owns
     * `ref`: relays the primary-signed identity as `pair-success` and reports
     * back what the companion advertised. Resolves `null` when no live
     * connection holds that ref. Lives on the host because pairing spans two
     * connections while a session owns neither.
     */
    completeCompanionPairing(
        input: CompleteCompanionPairingInput
    ): Promise<CompletedCompanionPairing | null>
}

export interface CompleteCompanionPairingInput {
    readonly ref: string
    readonly deviceJid: string
    readonly deviceIdentityBytes: Uint8Array
}

export interface CompletedCompanionPairing {
    /** Companion `DeviceProps` from its registration payload, echoed to the primary. */
    readonly companionPropsBytes: Uint8Array | null
    readonly platform: string
}

/**
 * One isolated logical device's worth of server state. Every `WaClient`
 * connected to a `FakeWaServer` is bound to exactly one session; peers,
 * groups, privacy, prekeys, app-state, and captured stanzas never leak across
 * sessions. A single-client server uses one default session, which is why the
 * legacy `FakeWaServer` surface delegates straight through to it.
 */
export class FakeServerSession {
    public readonly id: string
    public readonly registries = new ServerRegistries()
    public readonly preKeyDispenser = new PreKeyDispenser()
    public readonly appStateSync = new AppStateSyncManager()
    public readonly companionHost = new FakeCompanionHostState()
    public readonly iqRouter = new WaFakeIqRouter()

    private readonly capturedStanzas: BinaryNode[] = []
    private readonly pendingIqExpectations = new Set<PendingIqExpectation>()
    private readonly pendingStanzaExpectations = new Set<PendingStanzaExpectation>()
    private readonly capturedStanzaListeners = new Set<(node: BinaryNode) => void>()
    private readonly inboundStanzaListeners = new Set<(node: BinaryNode) => void>()

    public constructor(
        id: string,
        host: FakeServerSessionHost,
        options: { readonly defaultIqHandlers: boolean }
    ) {
        this.id = id
        if (options.defaultIqHandlers) {
            registerDefaultIqHandlers(this.iqRouter, this.buildIqHandlerDeps(host))
        }
    }

    public registerIqHandler(
        matcher: WaFakeIqMatcher,
        respond: WaFakeIqResponder,
        label?: string
    ): () => void {
        const handler: WaFakeIqHandler = { matcher, respond, label }
        return this.iqRouter.register(handler, { priority: 'high' })
    }

    public routeIq(iq: BinaryNode): Promise<BinaryNode | null> {
        return this.iqRouter.route(iq)
    }

    public handleCapturedStanza(node: BinaryNode): void {
        this.capturedStanzas.push(node)

        for (const listener of this.capturedStanzaListeners) {
            try {
                listener(node)
            } catch (error) {
                void error
            }
        }

        for (const listener of this.inboundStanzaListeners) {
            try {
                listener(node)
            } catch (error) {
                void error
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

    public subscribeInboundMessages(listener: (node: BinaryNode) => void): () => void {
        const wrapped = (node: BinaryNode): void => {
            if (node.tag !== 'message') return
            listener(node)
        }
        this.inboundStanzaListeners.add(wrapped)
        return () => {
            this.inboundStanzaListeners.delete(wrapped)
        }
    }

    public onCapturedStanza(listener: (node: BinaryNode) => void): () => void {
        this.capturedStanzaListeners.add(listener)
        return () => {
            this.capturedStanzaListeners.delete(listener)
        }
    }

    public capturedStanzaSnapshot(): readonly BinaryNode[] {
        return this.capturedStanzas.slice()
    }

    public expectIq(matcher: WaFakeIqMatcher, options: ExpectIqOptions = {}): Promise<BinaryNode> {
        const timeoutMs = options.timeoutMs ?? 2_000

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

    private buildIqHandlerDeps(host: FakeServerSessionHost): IqHandlerDeps {
        const reg = this.registries
        const preKey = this.preKeyDispenser
        const appState = this.appStateSync
        const companionHost = this.companionHost
        return {
            get peerRegistry() {
                return reg.peerRegistry
            },
            get groupRegistry() {
                return reg.groupRegistry
            },
            get privacySettings() {
                return reg.privacySettings
            },
            get blocklistJids() {
                return reg.blocklistJids
            },
            get profilePicturesByJid() {
                return reg.profilePicturesByJid
            },
            get businessProfilesByJid() {
                return reg.businessProfilesByJid
            },
            get abPropsInput() {
                return reg.abPropsInput
            },
            get issuedPrivacyTokens() {
                return reg.issuedPrivacyTokens
            },
            get latestStatusText() {
                return reg.latestStatusText
            },
            setLatestStatusText: (text: string) => {
                reg.latestStatusText = text
            },
            lookupDeviceIdsForUser: (userJid) => reg.lookupDeviceIdsForUser(userJid),
            notifyGroupOp: (op) => reg.notifyGroupOp(op),
            mutatePrivacySettings: (category, value) => reg.mutatePrivacySettings(category, value),
            mutateBlocklist: (action, jid) => reg.mutateBlocklist(action, jid),
            notifyProfilePictureSet: (op) => reg.notifyProfilePictureSet(op),
            handleProfilePictureSet: (targetJid, newId) =>
                reg.handleProfilePictureSet(targetJid, newId),
            notifyStatusSet: (text) => reg.notifyStatusSet(text),
            notifyLogout: () => reg.notifyLogout(),
            notifyPrivacyTokenIssue: (token) => reg.notifyPrivacyTokenIssue(token),
            notifyDirtyBitsClear: (op) => reg.notifyDirtyBitsClear(op),
            notifyPrivacySet: (change) => {
                for (const listener of reg.privacySetListeners) {
                    try {
                        listener(change)
                    } catch (error) {
                        void error
                    }
                }
            },
            notifyBlocklistChange: (change) => {
                for (const listener of reg.blocklistChangeListeners) {
                    try {
                        listener(change)
                    } catch (error) {
                        void error
                    }
                }
            },
            capturePreKeyBundle: (bundle) => preKey.captureBundle(bundle),
            countServerPreKeys: () => preKey.preKeysAvailable(),
            consumeOutboundAppStatePatches: (iq) => appState.consumeOutboundAppStatePatches(iq),
            get appStateCollectionProviders() {
                return appState.appStateCollectionProviders
            },
            requireMediaHttpsInfo: () => host.requireMediaHttpsInfo(),
            get mobilePrimary() {
                return companionHost.primary
            },
            linkCompanionDevice: (upload) => this.linkCompanionDevice(host, upload),
            revokeCompanionDevices: (deviceJids) => this.revokeCompanionDevices(deviceJids),
            recordKeyIndexList: (bytes, timestampSeconds) =>
                companionHost.recordKeyIndexList(bytes, timestampSeconds)
        }
    }

    /**
     * Server side of the primary's `pair-device` upload: allocates the device
     * slot, hands the signed identity to the companion connection, and records
     * the link. Resolves `null` when this session has no primary or the ref
     * belongs to no live connection, which the handler turns into an IQ error.
     */
    private async linkCompanionDevice(
        host: FakeServerSessionHost,
        upload: ParsedPairDeviceUpload
    ): Promise<LinkedCompanionResult | null> {
        const primary = this.companionHost.primary
        if (!primary) {
            return null
        }
        const deviceId = this.companionHost.allocateDeviceId()
        const deviceJid = `${primary.username}:${deviceId}@${HOST_DOMAIN}`
        const completed = await host.completeCompanionPairing({
            ref: upload.ref,
            deviceJid,
            deviceIdentityBytes: upload.deviceIdentityBytes
        })
        if (!completed) {
            return null
        }
        this.companionHost.recordCompanion({
            deviceJid,
            deviceId,
            ref: upload.ref,
            keyIndex: readCompanionKeyIndex(upload.deviceIdentityBytes),
            deviceIdentityBytes: upload.deviceIdentityBytes,
            linkedAtSeconds: Math.floor(Date.now() / 1_000)
        })
        this.companionHost.recordKeyIndexList(
            upload.keyIndexListBytes,
            upload.keyIndexListTimestampSeconds
        )
        this.registries.registerDeviceId(primary.jid, deviceId)
        return { deviceJid, companionPropsBytes: completed.companionPropsBytes }
    }

    private revokeCompanionDevices(deviceJids: readonly string[] | null): readonly string[] {
        const removed = deviceJids
            ? this.companionHost.removeCompanions(deviceJids)
            : this.companionHost.removeAllCompanions()
        const primary = this.companionHost.primary
        if (primary) {
            for (const deviceJid of removed) {
                this.registries.unregisterDeviceId(primary.jid, toDeviceIdPart(deviceJid))
            }
        }
        return removed
    }
}

export function matchesIq(iq: BinaryNode, matcher: WaFakeIqMatcher): boolean {
    if (iq.tag !== 'iq') return false
    if (matcher.id !== undefined && iq.attrs.id !== matcher.id) return false
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
    if (matcher.id !== undefined) parts.push(`id=${matcher.id}`)
    if (matcher.type !== undefined) parts.push(`type=${matcher.type}`)
    if (matcher.xmlns !== undefined) parts.push(`xmlns=${matcher.xmlns}`)
    if (matcher.childTag !== undefined) parts.push(`childTag=${matcher.childTag}`)
    return parts.length > 0 ? parts.join(', ') : 'any iq'
}

export function matchesStanza(node: BinaryNode, matcher: StanzaMatcher): boolean {
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

// Referenced by ClientPreKeyBundle / BuildAbPropsResultInput consumers via the
// public snapshot surface; re-declared here to keep the session self-contained.
export type { ClientPreKeyBundle, BuildAbPropsResultInput }
