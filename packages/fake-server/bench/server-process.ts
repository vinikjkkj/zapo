/**
 * Child-process entry point for the fake server. Spawned by
 * `messaging.bench.ts` when `--separate-process` is passed. Runs the
 * entire fake-server + FakePeer stack in its own V8 isolate so CPU
 * profiles captured by the parent only contain zapo-js lib code.
 *
 * Communicates with the parent via `process.send` / `process.on('message')`
 * using a simple JSON-RPC-ish protocol (no batching, strict request/
 * response ordering).
 */

import { writeFile } from 'node:fs/promises'
import inspector from 'node:inspector/promises'
import { resolve as resolvePath } from 'node:path'

import type { FakePeer } from '../src/api/FakePeer'
import { FakeWaServer, type WaFakeConnectionPipeline } from '../src/api/FakeWaServer'
import { buildExternalBlobReference } from '../src/protocol/iq/appstate-sync'
import { buildIqResult } from '../src/protocol/iq/router'
import { buildReceipt, type FakeReceiptType } from '../src/protocol/push/receipt'
import { FakeAppStateCollection } from '../src/state/fake-app-state-collection'
import type { BinaryNode } from '../src/transport/codec'

// ─── State ────────────────────────────────────────────────────────────

let server: FakeWaServer | null = null
let profilerSession: inspector.Session | null = null
let pipeline: WaFakeConnectionPipeline | null = null
const peersById = new Map<string, FakePeer>()
let peerIdCounter = 0

// ─── Protocol ─────────────────────────────────────────────────────────

interface RpcRequest {
    readonly id: number
    readonly method: string
    readonly params: Record<string, unknown>
}

interface RpcResponse {
    readonly id: number
    readonly result?: unknown
    readonly error?: string
}

function reply(id: number, result?: unknown, error?: string): void {
    const msg: RpcResponse = error !== undefined ? { id, error } : { id, result }
    process.send!(msg)
}

// ─── Handlers ─────────────────────────────────────────────────────────

async function handleStart(): Promise<{
    url: string
    noiseRootCa: { publicKey: number[]; serial: number }
}> {
    server = await FakeWaServer.start()
    return {
        url: server.url,
        noiseRootCa: {
            publicKey: Array.from(server.noiseRootCa.publicKey),
            serial: server.noiseRootCa.serial
        }
    }
}

async function handleWaitForAuthenticatedPipeline(): Promise<void> {
    if (!server) throw new Error('server not started')
    pipeline = await server.waitForAuthenticatedPipeline()
}

async function handleWaitForNextAuthenticatedPipeline(): Promise<void> {
    if (!server) throw new Error('server not started')
    pipeline = await server.waitForNextAuthenticatedPipeline()
}

async function handleRunPairing(params: { deviceJid: string }): Promise<void> {
    if (!server || !pipeline) throw new Error('no pipeline')
    // The pairing flow needs the client's advSecretKey + identityPublicKey.
    // We set up a one-shot listener on the pipeline that intercepts the
    // client's QR stanza and extracts the material. The client emits
    // `auth_qr` → the parent relays the parsed material back to us via
    // a `pairingMaterial` IPC call.
    let ipcHandler: ((msg: RpcRequest) => void) | null = null
    const materialPromise = new Promise<{
        readonly advSecretKey: Uint8Array
        readonly identityPublicKey: Uint8Array
    }>((resolve) => {
        const handler = (msg: RpcRequest) => {
            if (msg.method === 'pairingMaterial') {
                process.removeListener('message', handler)
                ipcHandler = null
                const p = msg.params as {
                    advSecretKey: number[]
                    identityPublicKey: number[]
                }
                resolve({
                    advSecretKey: new Uint8Array(p.advSecretKey),
                    identityPublicKey: new Uint8Array(p.identityPublicKey)
                })
            }
        }
        ipcHandler = handler
        process.on('message', handler)
    })

    try {
        await server.runPairing(pipeline, { deviceJid: params.deviceJid }, () => materialPromise)
    } finally {
        if (ipcHandler) process.removeListener('message', ipcHandler)
    }
}

async function handleTriggerPreKeyUpload(params: { force?: boolean }): Promise<void> {
    if (!server || !pipeline) throw new Error('no pipeline')
    await server.triggerPreKeyUpload(pipeline, { force: params.force ?? false })
}

async function handleCreateFakePeerWithDevices(params: {
    userJid: string
    deviceIds: number[]
    skipOneTimePreKey?: boolean
}): Promise<{ peerId: string; devicePeerIds: string[] }> {
    if (!server || !pipeline) throw new Error('no pipeline')
    const peers = await server.createFakePeerWithDevices(
        {
            userJid: params.userJid,
            deviceIds: params.deviceIds,
            skipOneTimePreKey: params.skipOneTimePreKey
        },
        pipeline
    )
    const devicePeerIds: string[] = []
    for (const peer of peers) {
        const id = `peer-${peerIdCounter++}`
        peersById.set(id, peer)
        devicePeerIds.push(id)
    }
    return { peerId: devicePeerIds[0], devicePeerIds }
}

async function handleCreateFakePeer(params: {
    jid: string
    skipOneTimePreKey?: boolean
    enableReplayCache?: boolean
}): Promise<{ peerId: string }> {
    if (!server || !pipeline) throw new Error('no pipeline')
    const peer = await server.createFakePeer(
        {
            jid: params.jid,
            skipOneTimePreKey: params.skipOneTimePreKey,
            enableReplayCache: params.enableReplayCache
        },
        pipeline
    )
    const id = `peer-${peerIdCounter++}`
    peersById.set(id, peer)
    return { peerId: id }
}

function handleCreateFakeGroup(params: {
    groupJid: string
    subject: string
    participantPeerIds: string[]
}): void {
    if (!server) throw new Error('server not started')
    const participants: FakePeer[] = []
    for (const id of params.participantPeerIds) {
        const peer = peersById.get(id)
        if (!peer) throw new Error(`peer ${id} not found`)
        participants.push(peer)
    }
    server.createFakeGroup({
        groupJid: params.groupJid,
        subject: params.subject,
        participants
    })
}

async function handleEnsurePreKeyPool(params: { requiredHeadroom: number }): Promise<void> {
    if (!server || !pipeline) throw new Error('no pipeline')
    if (server.preKeysAvailable() >= params.requiredHeadroom) return
    await server.triggerPreKeyUpload(pipeline, { force: true })
}

async function handlePeerSendConversation(params: {
    peerId: string
    text: string
    id?: string
    tamperMode?: 'last-byte-xor-ff'
}): Promise<void> {
    const peer = peersById.get(params.peerId)
    if (!peer) throw new Error(`peer ${params.peerId} not found`)
    const tamper =
        params.tamperMode === 'last-byte-xor-ff'
            ? (bytes: Uint8Array): Uint8Array => {
                  const out = new Uint8Array(bytes)
                  out[out.byteLength - 1] ^= 0xff
                  return out
              }
            : undefined
    await peer.sendConversation(params.text, {
        ...(params.id !== undefined ? { id: params.id } : {}),
        ...(tamper ? { tamperCiphertext: tamper } : {})
    })
}

// IPC runs with `serialization: 'advanced'` (see ServerRpc.spawn), so
// Uint8Array fields cross the boundary intact – no number[] round-trip
// here.
interface MediaDescriptorInput {
    readonly directPath: string
    readonly mediaKey: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly fileLength: number
    readonly mimetype?: string
}

async function handlePeerSendImageMessage(params: {
    peerId: string
    descriptor: MediaDescriptorInput
}): Promise<void> {
    const peer = peersById.get(params.peerId)
    if (!peer) throw new Error(`peer ${params.peerId} not found`)
    await peer.sendImageMessage(params.descriptor)
}

async function handlePeerSendVideoMessage(params: {
    peerId: string
    descriptor: MediaDescriptorInput
}): Promise<void> {
    const peer = peersById.get(params.peerId)
    if (!peer) throw new Error(`peer ${params.peerId} not found`)
    await peer.sendVideoMessage(params.descriptor)
}

async function handlePublishMediaBlob(params: {
    mediaType:
        | 'image'
        | 'video'
        | 'audio'
        | 'document'
        | 'sticker'
        | 'gif'
        | 'ptt'
        | 'history'
        | 'md-app-state'
    plaintext: Uint8Array
}): Promise<{
    path: string
    mediaKey: Uint8Array
    fileSha256: Uint8Array
    fileEncSha256: Uint8Array
    fileLength: number
}> {
    if (!server) throw new Error('server not started')
    const blob = await server.publishMediaBlob({
        mediaType: params.mediaType,
        plaintext: params.plaintext
    })
    return {
        path: blob.path,
        mediaKey: blob.mediaKey,
        fileSha256: blob.fileSha256,
        fileEncSha256: blob.fileEncSha256,
        fileLength: blob.fileLength
    }
}

async function handleMediaUrl(params: { path: string }): Promise<{ url: string }> {
    if (!server) throw new Error('server not started')
    return { url: server.mediaUrl(params.path) }
}

async function handlePeerExpectMessage(params: {
    peerId: string
    timeoutMs?: number
}): Promise<{ conversation: string | null; encType: 'pkmsg' | 'msg' | 'skmsg' }> {
    const peer = peersById.get(params.peerId)
    if (!peer) throw new Error(`peer ${params.peerId} not found`)
    const received = await peer.expectMessage({ timeoutMs: params.timeoutMs ?? 30_000 })
    return {
        conversation: received.message.conversation ?? null,
        encType: received.encType
    }
}

async function handlePeerReplaySentMessage(params: {
    peerId: string
    originalMsgId: string
    resendId?: string
}): Promise<void> {
    const peer = peersById.get(params.peerId)
    if (!peer) throw new Error(`peer ${params.peerId} not found`)
    await peer.replaySentMessage(params.originalMsgId, {
        ...(params.resendId !== undefined ? { resendId: params.resendId } : {})
    })
}

async function handlePeerRotateForRetry(params: { peerId: string }): Promise<void> {
    const peer = peersById.get(params.peerId)
    if (!peer) throw new Error(`peer ${params.peerId} not found`)
    await peer.rotateForRetry()
}

async function handlePeerSendRetryReceipt(params: {
    peerId: string
    originalMsgId: string
    includeKeys?: boolean
    count?: number
    receiptId?: string
    t?: number
}): Promise<void> {
    const peer = peersById.get(params.peerId)
    if (!peer) throw new Error(`peer ${params.peerId} not found`)
    await peer.sendRetryReceipt(params.originalMsgId, {
        ...(params.count !== undefined ? { count: params.count } : {}),
        ...(params.receiptId !== undefined ? { receiptId: params.receiptId } : {}),
        ...(params.t !== undefined ? { t: params.t } : {}),
        ...(params.includeKeys !== undefined ? { includeKeys: params.includeKeys } : {})
    })
}

function isMatchingRetryReceipt(
    stanza: BinaryNode,
    stanzaId?: string
): { readonly id: string } | null {
    if (stanza.tag !== 'receipt') return null
    if (stanza.attrs.type !== 'retry') return null
    const id = stanza.attrs.id
    if (!id) return null
    if (stanzaId !== undefined && id !== stanzaId) return null
    return { id }
}

async function handleWaitForRetryReceipt(params: {
    stanzaId: string
    timeoutMs?: number
}): Promise<void> {
    if (!server) throw new Error('server not started')
    // onCapturedStanza is future-only: the receipt may have already
    // landed before this handler installs its listener (the bench fires
    // the tampered send via an earlier RPC call, and capture happens on
    // the child's event loop independent of waitForRetryReceipt arrival
    // order). Scan the existing snapshot first; only subscribe if the
    // receipt has not been seen yet.
    for (const captured of server.capturedStanzaSnapshot()) {
        if (isMatchingRetryReceipt(captured, params.stanzaId)) return
    }
    const timeoutMs = params.timeoutMs ?? 60_000
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            offCapture()
            reject(
                new Error(`waitForRetryReceipt(${params.stanzaId}) timed out after ${timeoutMs}ms`)
            )
        }, timeoutMs)
        timer.unref?.()
        const offCapture = server!.onCapturedStanza((stanza) => {
            if (!isMatchingRetryReceipt(stanza, params.stanzaId)) return
            clearTimeout(timer)
            offCapture()
            resolve()
        })
    })
}

async function handleWaitForRetryReceipts(params: {
    count: number
    timeoutMs?: number
}): Promise<{ ids: string[] }> {
    if (!server) throw new Error('server not started')
    const ids: string[] = []
    // Drain any retry receipts already captured before this handler ran
    // (same race as handleWaitForRetryReceipt). De-dupe by id so a single
    // receipt isn't counted twice if it also slips into the future
    // listener.
    const seen = new Set<string>()
    for (const captured of server.capturedStanzaSnapshot()) {
        const match = isMatchingRetryReceipt(captured)
        if (!match || seen.has(match.id)) continue
        seen.add(match.id)
        ids.push(match.id)
        if (ids.length >= params.count) return { ids }
    }
    const timeoutMs = params.timeoutMs ?? 60_000
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            offCapture()
            reject(
                new Error(
                    `waitForRetryReceipts stalled at ${ids.length}/${params.count} after ${timeoutMs}ms`
                )
            )
        }, timeoutMs)
        timer.unref?.()
        const offCapture = server!.onCapturedStanza((stanza) => {
            const match = isMatchingRetryReceipt(stanza)
            if (!match || seen.has(match.id)) return
            seen.add(match.id)
            ids.push(match.id)
            if (ids.length >= params.count) {
                clearTimeout(timer)
                offCapture()
                resolve()
            }
        })
    })
    return { ids }
}

async function handlePeerSendGroupConversation(params: {
    peerId: string
    groupJid: string
    text: string
}): Promise<void> {
    const peer = peersById.get(params.peerId)
    if (!peer) throw new Error(`peer ${params.peerId} not found`)
    await peer.sendGroupConversation(params.groupJid, params.text)
}

function handlePreKeysAvailable(): number {
    return server?.preKeysAvailable() ?? 0
}

function handleDispenserMisses(): number {
    return server?.preKeyDispenserMissesSnapshot() ?? 0
}

async function handleStop(): Promise<void> {
    if (server) {
        await server.stop()
        server = null
    }
    pipeline = null
}

async function handleMediaProxyAgent(): Promise<null> {
    // The mediaProxyAgent is a Node https.Agent that can't be serialized.
    // The parent constructs its own by connecting to the server's URL
    // with rejectUnauthorized: false.
    return null
}

// ─── Profiling ────────────────────────────────────────────────────────

async function handleStartProfiling(params: {
    cpu?: boolean
    heap?: boolean
    outDir?: string
}): Promise<void> {
    profilerSession = new inspector.Session()
    profilerSession.connect()
    if (params.heap) {
        await profilerSession.post('HeapProfiler.startTrackingHeapObjects', {
            trackAllocations: true
        })
    }
    if (params.cpu) {
        await profilerSession.post('Profiler.enable')
        await profilerSession.post('Profiler.start')
    }
}

async function handleStopProfiling(params: {
    cpu?: boolean
    heap?: boolean
    outDir?: string
}): Promise<{ cpuPath?: string; heapPath?: string }> {
    if (!profilerSession) return {}
    const outDir = params.outDir ?? process.cwd()
    const result: { cpuPath?: string; heapPath?: string } = {}

    if (params.cpu) {
        const { profile } = (await profilerSession.post('Profiler.stop')) as { profile: unknown }
        const out = resolvePath(outDir, `cpu-server-${Date.now()}.cpuprofile`)
        await writeFile(out, JSON.stringify(profile))
        result.cpuPath = out
    }

    if (params.heap) {
        const chunks: string[] = []
        const onChunk = (msg: { params: { chunk: string } }): void => {
            chunks.push(msg.params.chunk)
        }
        profilerSession.on(
            'HeapProfiler.addHeapSnapshotChunk',
            onChunk as unknown as (m: object) => void
        )
        await profilerSession.post('HeapProfiler.takeHeapSnapshot', {
            reportProgress: false,
            treatGlobalObjectsAsRoots: true
        })
        await profilerSession.post('HeapProfiler.stopTrackingHeapObjects')
        profilerSession.removeListener(
            'HeapProfiler.addHeapSnapshotChunk',
            onChunk as unknown as (m: object) => void
        )
        const out = resolvePath(outDir, `heap-server-${Date.now()}.heaptimeline`)
        await writeFile(out, chunks.join(''))
        result.heapPath = out
    }

    profilerSession.disconnect()
    profilerSession = null
    return result
}

async function handleTakeSnapshot(params: {
    label?: string
    outDir?: string
}): Promise<{ path: string }> {
    const session = new inspector.Session()
    session.connect()
    const chunks: string[] = []
    const onChunk = (msg: { params: { chunk: string } }): void => {
        chunks.push(msg.params.chunk)
    }
    session.on('HeapProfiler.addHeapSnapshotChunk', onChunk as unknown as (m: object) => void)
    await session.post('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
    session.removeListener(
        'HeapProfiler.addHeapSnapshotChunk',
        onChunk as unknown as (m: object) => void
    )
    session.disconnect()
    const label = params.label ?? 'server'
    const outDir = params.outDir ?? process.cwd()
    const out = resolvePath(outDir, `snapshot-${label}-${Date.now()}.heapsnapshot`)
    await writeFile(out, chunks.join(''))
    return { path: out }
}

// ─── Bench-specific handlers ──────────────────────────────────────────

interface SerializedConversationMsg {
    readonly id: string
    readonly fromMe: boolean
    readonly timestamp: number
    readonly conversation: string
}

interface SerializedConversation {
    readonly id: string
    readonly name?: string
    readonly unreadCount?: number
    readonly messages?: readonly SerializedConversationMsg[]
}

async function handlePeerSendHistorySync(params: {
    peerId: string
    chunkOrder?: number
    progress?: number
    conversations?: readonly SerializedConversation[]
    pushnames?: readonly { id: string; pushname: string }[]
}): Promise<void> {
    const peer = peersById.get(params.peerId)
    if (!peer) throw new Error(`peer ${params.peerId} not found`)
    await peer.sendHistorySync({
        chunkOrder: params.chunkOrder,
        progress: params.progress,
        conversations: params.conversations?.map((c) => ({
            id: c.id,
            name: c.name,
            unreadCount: c.unreadCount,
            messages: c.messages?.map((m) => ({
                id: m.id,
                fromMe: m.fromMe,
                timestamp: m.timestamp,
                message: { conversation: m.conversation }
            }))
        })),
        pushnames: params.pushnames
    })
}

async function handlePeerSendAppStateSyncKeyShare(params: {
    peerId: string
    keys: { keyIdBytes: number[]; keyDataBytes: number[]; timestamp: number }[]
}): Promise<void> {
    const peer = peersById.get(params.peerId)
    if (!peer) throw new Error(`peer ${params.peerId} not found`)
    await peer.sendAppStateSyncKeyShare({
        keys: params.keys.map((k) => ({
            keyId: new Uint8Array(k.keyIdBytes),
            keyData: new Uint8Array(k.keyDataBytes),
            timestamp: k.timestamp
        }))
    })
}

async function handlePipelineSendReceiptBatch(params: {
    receipts: { id: string; from: string; type?: FakeReceiptType; t?: number }[]
}): Promise<void> {
    if (!pipeline) throw new Error('no pipeline')
    for (const r of params.receipts) {
        await pipeline.sendStanza(buildReceipt(r))
    }
}

function findChildNode(node: BinaryNode, tag: string): BinaryNode | undefined {
    if (!Array.isArray(node.content)) return undefined
    return node.content.find((child) => child.tag === tag)
}

function handleSetupGroupBenchHandlers(): void {
    if (!server) throw new Error('server not started')
    server.registerIqHandler(
        { xmlns: 'w:g2', type: 'set', childTag: 'create' },
        (iq) => {
            const create = findChildNode(iq, 'create')
            const participantJids: string[] = []
            if (create && Array.isArray(create.content)) {
                for (const child of create.content) {
                    if (child.tag === 'participant' && child.attrs.jid) {
                        participantJids.push(child.attrs.jid)
                    }
                }
            }
            const result = buildIqResult(iq)
            const fakeGroupJid = `120363${String(900_000_700_000 + Math.floor(Math.random() * 1_000_000)).padStart(15, '0')}@g.us`
            return {
                ...result,
                attrs: { ...result.attrs, from: '@g.us' },
                content: [
                    {
                        tag: 'group',
                        attrs: {
                            id: fakeGroupJid,
                            subject: create?.attrs.subject ?? 'New Group',
                            creation: String(Math.floor(Date.now() / 1_000)),
                            creator: participantJids[0] ?? ''
                        },
                        content: participantJids.map((jid) => ({
                            tag: 'participant',
                            attrs: { jid, add_request: 'success' }
                        }))
                    }
                ]
            }
        },
        'bench-group-create'
    )
    for (const action of ['add', 'remove', 'promote', 'demote'] as const) {
        server.registerIqHandler(
            { xmlns: 'w:g2', type: 'set', childTag: action },
            (iq) => {
                const actionNode = findChildNode(iq, action)
                const participants =
                    actionNode && Array.isArray(actionNode.content)
                        ? actionNode.content.filter((c) => c.tag === 'participant')
                        : []
                const result = buildIqResult(iq)
                return {
                    ...result,
                    content: [
                        {
                            tag: action,
                            attrs: actionNode?.attrs ?? {},
                            content: participants.map((p) => ({
                                tag: 'participant',
                                attrs: { ...p.attrs, add_request: 'success' }
                            }))
                        }
                    ]
                }
            },
            `bench-group-${action}`
        )
    }
}

function handleRegisterAppStateSyncKey(params: {
    keyIdBytes: number[]
    keyDataBytes: number[]
}): void {
    if (!server) throw new Error('server not started')
    server.registerAppStateSyncKey(
        new Uint8Array(params.keyIdBytes),
        new Uint8Array(params.keyDataBytes)
    )
}

interface SerializedMutation {
    readonly operation: 'set' | 'remove'
    readonly index: string
    readonly value?: Record<string, unknown> | null
    readonly version: number
}

async function handleSetupAppStateBootstrap(params: {
    name: string
    syncKeyIdBytes: number[]
    syncKeyDataBytes: number[]
    mutation: SerializedMutation
}): Promise<void> {
    if (!server) throw new Error('server not started')
    const keyId = new Uint8Array(params.syncKeyIdBytes)
    const keyData = new Uint8Array(params.syncKeyDataBytes)
    server.registerAppStateSyncKey(keyId, keyData)
    const coll = new FakeAppStateCollection({ name: params.name, keyId, keyData })
    await coll.applyMutation({
        operation: params.mutation.operation,
        index: params.mutation.index,
        value: (params.mutation.value ?? null) as never,
        version: params.mutation.version
    })
    const patch = await coll.encodePendingPatch()
    const version = coll.version
    let shipped = false
    server.provideAppStateCollection(params.name, () => {
        if (shipped) return { name: params.name, version }
        shipped = true
        return { name: params.name, version, patches: [patch] }
    })
}

async function handleSetupAppStateExternalSnapshot(params: {
    name: string
    syncKeyIdBytes: number[]
    syncKeyDataBytes: number[]
    mutations: readonly SerializedMutation[]
}): Promise<void> {
    if (!server) throw new Error('server not started')
    const keyId = new Uint8Array(params.syncKeyIdBytes)
    const keyData = new Uint8Array(params.syncKeyDataBytes)
    const coll = new FakeAppStateCollection({ name: params.name, keyId, keyData })
    for (const m of params.mutations)
        await coll.applyMutation({
            operation: m.operation,
            index: m.index,
            value: (m.value ?? null) as never,
            version: m.version
        })
    const snapshotBytes = await coll.encodeSnapshot()
    const snapshotVersion = coll.version
    const mediaBlob = await server.publishMediaBlob({
        mediaType: 'md-app-state',
        plaintext: snapshotBytes
    })
    const srv = server
    let shipped = false
    server.provideAppStateCollection(params.name, () => {
        if (shipped) return { name: params.name, version: snapshotVersion }
        shipped = true
        return {
            name: params.name,
            version: snapshotVersion,
            snapshot: buildExternalBlobReference({
                mediaKey: mediaBlob.mediaKey,
                directPath: srv.mediaUrl(mediaBlob.path),
                fileSha256: mediaBlob.fileSha256,
                fileEncSha256: mediaBlob.fileEncSha256,
                fileSizeBytes: mediaBlob.fileLength
            })
        }
    })
}

// ─── Dispatch ─────────────────────────────────────────────────────────

const handlers: Record<
    string,
    (params: Record<string, unknown>) => Promise<unknown> | void | number
> = {
    start: handleStart,
    waitForAuthenticatedPipeline: handleWaitForAuthenticatedPipeline,
    waitForNextAuthenticatedPipeline: handleWaitForNextAuthenticatedPipeline,
    runPairing: handleRunPairing as (p: Record<string, unknown>) => Promise<void>,
    triggerPreKeyUpload: handleTriggerPreKeyUpload as (p: Record<string, unknown>) => Promise<void>,
    createFakePeerWithDevices: handleCreateFakePeerWithDevices as (
        p: Record<string, unknown>
    ) => Promise<unknown>,
    createFakePeer: handleCreateFakePeer as (p: Record<string, unknown>) => Promise<unknown>,
    createFakeGroup: handleCreateFakeGroup as (p: Record<string, unknown>) => void,
    ensurePreKeyPool: handleEnsurePreKeyPool as (p: Record<string, unknown>) => Promise<void>,
    peerSendConversation: handlePeerSendConversation as (
        p: Record<string, unknown>
    ) => Promise<void>,
    peerSendGroupConversation: handlePeerSendGroupConversation as (
        p: Record<string, unknown>
    ) => Promise<void>,
    peerSendImageMessage: handlePeerSendImageMessage as (
        p: Record<string, unknown>
    ) => Promise<void>,
    peerSendVideoMessage: handlePeerSendVideoMessage as (
        p: Record<string, unknown>
    ) => Promise<void>,
    publishMediaBlob: handlePublishMediaBlob as (p: Record<string, unknown>) => Promise<unknown>,
    mediaUrl: handleMediaUrl as (p: Record<string, unknown>) => Promise<unknown>,
    peerExpectMessage: handlePeerExpectMessage as (p: Record<string, unknown>) => Promise<unknown>,
    peerReplaySentMessage: handlePeerReplaySentMessage as (
        p: Record<string, unknown>
    ) => Promise<void>,
    peerRotateForRetry: handlePeerRotateForRetry as (p: Record<string, unknown>) => Promise<void>,
    peerSendRetryReceipt: handlePeerSendRetryReceipt as (
        p: Record<string, unknown>
    ) => Promise<void>,
    waitForRetryReceipt: handleWaitForRetryReceipt as (p: Record<string, unknown>) => Promise<void>,
    waitForRetryReceipts: handleWaitForRetryReceipts as (
        p: Record<string, unknown>
    ) => Promise<unknown>,
    preKeysAvailable: handlePreKeysAvailable as () => number,
    dispenserMisses: handleDispenserMisses as () => number,
    stop: handleStop,
    mediaProxyAgent: handleMediaProxyAgent,
    startProfiling: handleStartProfiling as (p: Record<string, unknown>) => Promise<void>,
    stopProfiling: handleStopProfiling as (p: Record<string, unknown>) => Promise<unknown>,
    takeSnapshot: handleTakeSnapshot as (p: Record<string, unknown>) => Promise<unknown>,
    peerSendHistorySync: handlePeerSendHistorySync as (p: Record<string, unknown>) => Promise<void>,
    peerSendAppStateSyncKeyShare: handlePeerSendAppStateSyncKeyShare as (
        p: Record<string, unknown>
    ) => Promise<void>,
    pipelineSendReceiptBatch: handlePipelineSendReceiptBatch as (
        p: Record<string, unknown>
    ) => Promise<void>,
    setupGroupBenchHandlers: handleSetupGroupBenchHandlers as (p: Record<string, unknown>) => void,
    registerAppStateSyncKey: handleRegisterAppStateSyncKey as (p: Record<string, unknown>) => void,
    setupAppStateBootstrap: handleSetupAppStateBootstrap as (
        p: Record<string, unknown>
    ) => Promise<void>,
    setupAppStateExternalSnapshot: handleSetupAppStateExternalSnapshot as (
        p: Record<string, unknown>
    ) => Promise<void>
}

process.on('message', async (msg: RpcRequest) => {
    // Skip non-RPC messages (e.g. pairingMaterial handled inline)
    if (
        msg === null ||
        msg === undefined ||
        typeof msg.id !== 'number' ||
        typeof msg.method !== 'string'
    )
        return
    if (msg.method === 'pairingMaterial') return

    const handler = handlers[msg.method]
    if (!handler) {
        reply(msg.id, undefined, `unknown method: ${msg.method}`)
        return
    }
    try {
        const result = await handler(msg.params ?? {})
        reply(msg.id, result ?? null)
    } catch (err) {
        reply(msg.id, undefined, (err as Error).message ?? String(err))
    }
})

process.send!({ ready: true })
