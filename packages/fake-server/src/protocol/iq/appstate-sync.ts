/** App-state sync IQ/notification builders used by the fake server. */

import type { BinaryNode } from '../../transport/codec'
import { proto } from '../../transport/protos'

import { buildIqResult } from './router'

export type FakeAppStateCollectionName =
    | 'regular'
    | 'regular_low'
    | 'regular_high'
    | 'critical_block'
    | 'critical_unblock_low'

export interface BuildAppStateSyncResultInput {
    readonly versions?: Readonly<Partial<Record<FakeAppStateCollectionName, number>>>
}

export interface FakeAppStateCollectionPayload {
    readonly name: string
    readonly version: number
    readonly patches?: readonly Uint8Array[]
    readonly snapshot?: Uint8Array
    readonly hasMore?: boolean
}

export interface BuildAppStateSyncFullResultInput {
    readonly payloads: readonly FakeAppStateCollectionPayload[]
}

/** Encodes `ExternalBlobReference` used by external snapshot downloads. */
export function buildExternalBlobReference(input: {
    readonly mediaKey: Uint8Array
    readonly directPath: string
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly fileSizeBytes?: number
}): Uint8Array {
    return proto.ExternalBlobReference.encode({
        mediaKey: input.mediaKey,
        directPath: input.directPath,
        fileSha256: input.fileSha256,
        fileEncSha256: input.fileEncSha256,
        fileSizeBytes: input.fileSizeBytes
    }).finish()
}

interface ParsedCollectionRequest {
    readonly name: string
    readonly version: number
}

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
