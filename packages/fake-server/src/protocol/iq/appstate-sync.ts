/**
 * Builder for the WhatsApp Web app-state sync IQ response and the
 * inbound `<notification type="server_sync"/>` push that triggers a
 * fresh sync round.
 *
 * Source:
 *   /deobfuscated/WAWebSyncd/WAWebSyncd.js
 *   /deobfuscated/WAWebSyncdServerSync.js
 *
 * Cross-checked against the lib's `parseSyncResponse` and
 * `processCollectionRound` (`src/appstate/WaAppStateSyncResponseParser.ts`,
 * `src/appstate/WaAppStateSyncClient.ts`).
 *
 * Wire layout
 *
 * Inbound IQ from the client (decoded by us):
 *
 *     <iq to="s.whatsapp.net" type="set" xmlns="w:sync:app:state" id="<id>">
 *       <sync>
 *         <collection name="regular_low" version="0" return_snapshot="true"/>
 *         <collection name="regular_high" version="0" return_snapshot="true">
 *           <patch>...</patch>
 *         </collection>
 *         <!-- one <collection> per pending domain -->
 *       </sync>
 *     </iq>
 *
 * Response we push back:
 *
 *     <iq type="result" id="<echo>" from="s.whatsapp.net">
 *       <sync>
 *         <collection name="regular_low" version="0" type="result"/>
 *         <collection name="regular_high" version="0" type="result"/>
 *       </sync>
 *     </iq>
 *
 * The lib's `processCollectionRound` accepts an empty `<collection/>`
 * (no `<patches>`, no `<snapshot>`) as a no-op success: the patches
 * array is empty, no snapshot reference is parsed, and the collection
 * is marked as initialised at the supplied version. This is enough to
 * unblock a `client.syncAppState()` call without having to ship full
 * encrypted patches or snapshot blobs through the fake server.
 *
 * Server sync notification (push from us → lib):
 *
 *     <notification type="server_sync" id="<id>" from="s.whatsapp.net">
 *       <collection name="regular_low"/>
 *       <collection name="regular_high"/>
 *     </notification>
 *
 * The lib's `createIncomingNotificationHandler` extracts the child
 * collection names and triggers `syncAppState()` for them.
 */

import type { BinaryNode } from '../../transport/codec'

import { buildIqResult } from './router'

export type FakeAppStateCollectionName =
    | 'regular'
    | 'regular_low'
    | 'regular_high'
    | 'critical_block'
    | 'critical_unblock_low'

export interface BuildAppStateSyncResultInput {
    /**
     * Override per-collection versions in the response. If a collection
     * present in the inbound IQ is not in this map, the inbound version
     * is echoed back unchanged.
     */
    readonly versions?: Readonly<Partial<Record<FakeAppStateCollectionName, number>>>
}

export interface FakeAppStateCollectionPayload {
    readonly name: string
    readonly version: number
    /**
     * One or more encoded `SyncdPatch` blobs to ship inside `<patches>`.
     * Mutually exclusive with `snapshot`.
     */
    readonly patches?: readonly Uint8Array[]
    /**
     * Encoded `SyncdSnapshot` blob to ship inside `<snapshot>`. Used for
     * the bootstrap round of an uninitialized collection. Mutually
     * exclusive with `patches`.
     */
    readonly snapshot?: Uint8Array
    /**
     * If `true`, the collection node carries `has_more_patches="true"`
     * so the lib's processor will issue another sync round.
     */
    readonly hasMore?: boolean
}

export interface BuildAppStateSyncFullResultInput {
    /** Per-collection payloads keyed by collection name. */
    readonly payloads: readonly FakeAppStateCollectionPayload[]
}

interface ParsedCollectionRequest {
    readonly name: string
    /** Inbound version (parsed from `attrs.version` or 0). */
    readonly version: number
}

/**
 * Parses the `<collection/>` children of the inbound `<iq><sync>...</sync></iq>`.
 * Returns one entry per collection in declaration order.
 */
export function parseAppStateSyncRequest(iq: BinaryNode): readonly ParsedCollectionRequest[] {
    if (iq.tag !== 'iq') return []
    if (!Array.isArray(iq.content)) return []
    const sync = iq.content.find((child) => child.tag === 'sync')
    if (!sync || !Array.isArray(sync.content)) return []
    const out: ParsedCollectionRequest[] = []
    for (const child of sync.content) {
        if (child.tag !== 'collection') continue
        const name = child.attrs.name
        if (!name) continue
        const versionAttr = child.attrs.version
        const version = versionAttr ? Number.parseInt(versionAttr, 10) : 0
        out.push({
            name,
            version: Number.isFinite(version) ? version : 0
        })
    }
    return out
}

/**
 * Builds an empty-success `<iq type="result"><sync>...</sync></iq>` for
 * the supplied inbound app-state sync IQ. Each requested collection is
 * echoed back as `<collection name=... version=N type="result"/>` with
 * neither `<patches>` nor `<snapshot>` children.
 */
export function buildAppStateSyncResult(
    iq: BinaryNode,
    input: BuildAppStateSyncResultInput = {}
): BinaryNode {
    const requests = parseAppStateSyncRequest(iq)
    const versions = input.versions ?? {}
    const collectionNodes: BinaryNode[] = requests.map((entry) => {
        const overriddenVersion = (versions as Record<string, number | undefined>)[entry.name]
        const responseVersion = overriddenVersion ?? entry.version
        return {
            tag: 'collection',
            attrs: {
                name: entry.name,
                version: String(responseVersion),
                type: 'result'
            }
        }
    })
    const result = buildIqResult(iq)
    return {
        ...result,
        attrs: { ...result.attrs, from: 's.whatsapp.net' },
        content: [
            {
                tag: 'sync',
                attrs: {},
                content: collectionNodes
            }
        ]
    }
}

/**
 * Builds a payload-rich `<iq type="result"><sync>...</sync></iq>` for
 * the supplied inbound IQ. Each requested collection that has a matching
 * entry in `payloads` is filled with `<patches>` or `<snapshot>` and the
 * stamped version. Collections present in the inbound IQ but missing
 * from `payloads` are echoed back as empty success at their inbound
 * version (same shape as `buildAppStateSyncResult`).
 */
export function buildAppStateSyncFullResult(
    iq: BinaryNode,
    input: BuildAppStateSyncFullResultInput
): BinaryNode {
    const requests = parseAppStateSyncRequest(iq)
    const payloadsByName = new Map<string, FakeAppStateCollectionPayload>()
    for (const payload of input.payloads) {
        payloadsByName.set(payload.name, payload)
    }
    const collectionNodes: BinaryNode[] = requests.map((request) => {
        const payload = payloadsByName.get(request.name)
        if (!payload) {
            return {
                tag: 'collection',
                attrs: {
                    name: request.name,
                    version: String(request.version),
                    type: 'result'
                }
            }
        }
        const children: BinaryNode[] = []
        if (payload.snapshot && payload.patches) {
            throw new Error(
                `app-state collection ${request.name}: snapshot and patches are mutually exclusive`
            )
        }
        if (payload.snapshot) {
            children.push({
                tag: 'snapshot',
                attrs: {},
                content: payload.snapshot
            })
        }
        if (payload.patches && payload.patches.length > 0) {
            children.push({
                tag: 'patches',
                attrs: {},
                content: payload.patches.map((patchBytes) => ({
                    tag: 'patch',
                    attrs: {},
                    content: patchBytes
                }))
            })
        }
        const attrs: Record<string, string> = {
            name: request.name,
            version: String(payload.version),
            type: 'result'
        }
        if (payload.hasMore) {
            attrs.has_more_patches = 'true'
        }
        return {
            tag: 'collection',
            attrs,
            content: children.length > 0 ? children : undefined
        }
    })
    const result = buildIqResult(iq)
    return {
        ...result,
        attrs: { ...result.attrs, from: 's.whatsapp.net' },
        content: [
            {
                tag: 'sync',
                attrs: {},
                content: collectionNodes
            }
        ]
    }
}

export interface BuildServerSyncNotificationInput {
    readonly id?: string
    readonly collections: readonly FakeAppStateCollectionName[]
}

/**
 * Builds a `<notification type="server_sync"/>` push that the fake
 * server hands to a pipeline. Each collection becomes a single
 * `<collection name=.../>` child.
 */
export function buildServerSyncNotification(
    input: BuildServerSyncNotificationInput
): BinaryNode {
    return {
        tag: 'notification',
        attrs: {
            id: input.id ?? `server-sync-${Date.now()}`,
            type: 'server_sync',
            from: 's.whatsapp.net'
        },
        content: input.collections.map((name) => ({
            tag: 'collection',
            attrs: { name }
        }))
    }
}
