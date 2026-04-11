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
}): Promise<{ peerId: string }> {
    if (!server || !pipeline) throw new Error('no pipeline')
    const peer = await server.createFakePeer(
        { jid: params.jid, skipOneTimePreKey: params.skipOneTimePreKey },
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

async function handlePeerSendConversation(params: { peerId: string; text: string }): Promise<void> {
    const peer = peersById.get(params.peerId)
    if (!peer) throw new Error(`peer ${params.peerId} not found`)
    await peer.sendConversation(params.text)
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
    preKeysAvailable: handlePreKeysAvailable as () => number,
    dispenserMisses: handleDispenserMisses as () => number,
    stop: handleStop,
    mediaProxyAgent: handleMediaProxyAgent,
    startProfiling: handleStartProfiling as (p: Record<string, unknown>) => Promise<void>,
    stopProfiling: handleStopProfiling as (p: Record<string, unknown>) => Promise<unknown>,
    takeSnapshot: handleTakeSnapshot as (p: Record<string, unknown>) => Promise<unknown>
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
