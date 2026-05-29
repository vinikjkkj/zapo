/**
 * End-to-end messaging-with-media bench driven through @zapo-js/fake-server.
 *
 * Complements `media-upload.bench.ts` (which sweeps image payload sizes)
 * by sweeping over the WhatsApp media TYPES and exercising both 1:1
 * send, group send (SKDM + SKMSG fanout), and receive + download.
 *
 * Scenarios (selectable via ZAPO_BENCH_MEDIA_SCENARIOS):
 *   - send_media_image, send_media_video, send_media_audio,
 *     send_media_ptt, send_media_document, send_media_sticker
 *       Each issues N `client.message.send(peerJid, { type, media, ... })`
 *       which runs the full encrypt + upload + signal-encrypt + wire send
 *       pipeline for the corresponding media type.
 *   - send_media_group_image
 *       Same shape but to a group of K members. First send pays the
 *       SKDM fanout cost; the timed window runs after a warmup send
 *       so it reflects steady-state SKMSG throughput.
 *   - recv_media_image, recv_media_video
 *       Fake peer publishes an encrypted blob to the fake media HTTPS
 *       endpoint, then pushes an imageMessage/videoMessage referencing
 *       it. The bench measures the round-trip from peer push through
 *       lib decrypt of the proto + `client.message.downloadBytes(event)`
 *       (the actual HTTPS download + decrypt) for every iteration.
 *
 * Tunables (env vars):
 *   ZAPO_BENCH_MEDIA_MESSAGES         (default 50)
 *   ZAPO_BENCH_MEDIA_BYTES            (default 65_536)
 *   ZAPO_BENCH_MEDIA_CHUNK_BYTES      (default 65_536, stream chunk size)
 *   ZAPO_BENCH_MEDIA_GROUP_MEMBERS    (default 8)
 *   ZAPO_BENCH_MEDIA_INPUT            (stream | buffer; default stream)
 *   ZAPO_BENCH_MEDIA_SCENARIOS        (csv; default = all)
 *   ZAPO_BENCH_STORE                  (memory | sqlite | mysql | ...)
 *   ZAPO_BENCH_VERBOSE                (=1 to print lib warn/error)
 *   ZAPO_BENCH_JSON                   (=1 to also print as JSON)
 *
 * `MEDIA_INPUT=stream` (default) feeds `client.message.send` a
 * `Readable` so the lib walks its streaming upload path (spool to temp
 * file + streamed HTTPS upload), matching how a user would pass
 * `fs.createReadStream(path)` for a real file. `buffer` keeps the
 * payload as a plain Uint8Array so the lib stays in-memory; useful as
 * a baseline to compare streaming overhead.
 *
 * Profiling flags (same shape as messaging.bench.ts):
 *   --cpu / --heap / --snapshot / --per-scenario /
 *   --snapshot-per-scenario / --out-dir=<path>
 *   --separate-process    fake-server runs in a forked child
 *   --no-server-prof      skip profiling the server child (when --separate-process)
 *
 * Run with:
 *   node --expose-gc --import tsx \
 *     packages/fake-server/bench/messaging-media.bench.ts
 */

import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import type { FakePeer } from '../src/api/FakePeer'
import type { FakeWaServer, WaFakeConnectionPipeline } from '../src/api/FakeWaServer'
import type { FakeMediaType } from '../src/state/fake-media-store'

import {
    BenchProfiler,
    forceGcIfAvailable,
    formatBytesPerSec,
    formatMiB,
    installEmergencyStop,
    maybePrintJson,
    printResult,
    readPositiveIntEnv,
    readProfilerOptions,
    runScenario,
    startServerProfilingIfRequested,
    stopServerProfilingIfRequested,
    takeServerSnapshotIfRequested,
    type ScenarioResult
} from './_common'
import {
    bringUpPairedClient,
    bringUpPairedClientViaRpc,
    ensurePreKeyPool,
    teardownFixture,
    teardownRpcFixture
} from './_fixtures'
import { buildBenchStore } from './_store-factory'
import type { ServerRpc } from './server-rpc'

const SEND_SCENARIOS = [
    'send_media_image',
    'send_media_video',
    'send_media_audio',
    'send_media_ptt',
    'send_media_document',
    'send_media_sticker'
] as const

const GROUP_SCENARIOS = ['send_media_group_image'] as const

const RECV_SCENARIOS = ['recv_media_image', 'recv_media_video'] as const

const ALL_SCENARIOS = new Set<string>([...SEND_SCENARIOS, ...GROUP_SCENARIOS, ...RECV_SCENARIOS])

function readScenarioFilter(): ReadonlySet<string> {
    const raw = process.env.ZAPO_BENCH_MEDIA_SCENARIOS
    if (!raw) return ALL_SCENARIOS
    const out = new Set<string>()
    for (const part of raw.split(',')) {
        const trimmed = part.trim()
        if (!trimmed) continue
        if (!ALL_SCENARIOS.has(trimmed)) {
            throw new Error(
                `unknown ZAPO_BENCH_MEDIA_SCENARIOS entry "${trimmed}"; valid: ${[...ALL_SCENARIOS].join(',')}`
            )
        }
        out.add(trimmed)
    }
    return out
}

type MediaInputMode = 'stream' | 'buffer'

interface BenchConfig {
    readonly messages: number
    readonly payloadBytes: number
    readonly chunkBytes: number
    readonly groupMembers: number
    readonly inputMode: MediaInputMode
    readonly scenarios: ReadonlySet<string>
}

function readInputMode(): MediaInputMode {
    const raw = process.env.ZAPO_BENCH_MEDIA_INPUT
    if (!raw) return 'stream'
    if (raw === 'stream' || raw === 'buffer') return raw
    throw new Error(`invalid ZAPO_BENCH_MEDIA_INPUT: ${raw} (expected 'stream' or 'buffer')`)
}

function readConfig(): BenchConfig {
    return {
        messages: readPositiveIntEnv('ZAPO_BENCH_MEDIA_MESSAGES', 50),
        payloadBytes: readPositiveIntEnv('ZAPO_BENCH_MEDIA_BYTES', 64 * 1024),
        chunkBytes: readPositiveIntEnv('ZAPO_BENCH_MEDIA_CHUNK_BYTES', 64 * 1024),
        groupMembers: readPositiveIntEnv('ZAPO_BENCH_MEDIA_GROUP_MEMBERS', 8),
        inputMode: readInputMode(),
        scenarios: readScenarioFilter()
    }
}

/**
 * Builds the `media` argument for `client.message.send` based on the
 * configured input mode. Stream mode wraps the payload in a chunked
 * Readable so the lib walks its streaming-upload pipeline (temp file
 * spool + chunked HTTPS upload); buffer mode passes the Uint8Array
 * verbatim so the lib stays in-memory.
 */
function buildMediaInput(media: Uint8Array, config: BenchConfig): Uint8Array | Readable {
    if (config.inputMode === 'buffer') return media
    return Readable.from(chunkIterator(media, config.chunkBytes))
}

function* chunkIterator(payload: Uint8Array, chunkSize: number): IterableIterator<Uint8Array> {
    for (let offset = 0; offset < payload.byteLength; offset += chunkSize) {
        yield payload.subarray(offset, Math.min(offset + chunkSize, payload.byteLength))
    }
}

interface SendCase {
    readonly name: (typeof SEND_SCENARIOS)[number]
    readonly send: (
        client: WaClient,
        peerJid: string,
        media: Uint8Array | Readable,
        index: number
    ) => Promise<unknown>
}

const SEND_CASES: readonly SendCase[] = [
    {
        name: 'send_media_image',
        send: (client, jid, media, i) =>
            client.message.send(jid, {
                type: 'image',
                media,
                mimetype: 'image/jpeg',
                caption: `media bench image ${i}`
            })
    },
    {
        name: 'send_media_video',
        send: (client, jid, media, i) =>
            client.message.send(jid, {
                type: 'video',
                media,
                mimetype: 'video/mp4',
                caption: `media bench video ${i}`
            })
    },
    {
        name: 'send_media_audio',
        send: (client, jid, media) =>
            client.message.send(jid, {
                type: 'audio',
                media,
                mimetype: 'audio/mp4'
            })
    },
    {
        name: 'send_media_ptt',
        send: (client, jid, media) =>
            client.message.send(jid, {
                type: 'audio',
                media,
                mimetype: 'audio/ogg',
                ptt: true
            })
    },
    {
        name: 'send_media_document',
        send: (client, jid, media, i) =>
            client.message.send(jid, {
                type: 'document',
                media,
                mimetype: 'application/pdf',
                fileName: `bench-${i}.pdf`
            })
    },
    {
        name: 'send_media_sticker',
        send: (client, jid, media) =>
            client.message.send(jid, {
                type: 'sticker',
                media,
                mimetype: 'image/webp'
            })
    }
]

interface RecvCase {
    readonly name: (typeof RECV_SCENARIOS)[number]
    readonly mediaType: FakeMediaType
    readonly mimetype: string
    readonly matches: (event: Parameters<WaClientEventMap['message']>[0]) => boolean
}

const RECV_CASES: readonly RecvCase[] = [
    {
        name: 'recv_media_image',
        mediaType: 'image',
        mimetype: 'image/jpeg',
        matches: (event) =>
            event.message?.imageMessage !== undefined && event.message?.imageMessage !== null
    },
    {
        name: 'recv_media_video',
        mediaType: 'video',
        mimetype: 'video/mp4',
        matches: (event) =>
            event.message?.videoMessage !== undefined && event.message?.videoMessage !== null
    }
]

function fillRandom(size: number): Uint8Array {
    return new Uint8Array(randomBytes(size).buffer)
}

function waitForMessage(
    client: WaClient,
    predicate: (event: Parameters<WaClientEventMap['message']>[0]) => boolean,
    timeoutMs: number
): Promise<Parameters<WaClientEventMap['message']>[0]> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            client.off('message', listener)
            reject(new Error('timed out waiting for matching message'))
        }, timeoutMs)
        const listener: WaClientEventMap['message'] = (event) => {
            if (predicate(event)) {
                clearTimeout(timer)
                client.off('message', listener)
                resolve(event)
            }
        }
        client.on('message', listener)
    })
}

// ─── Send-side helpers ────────────────────────────────────────────────

async function runSendScenarioInProcess(
    server: FakeWaServer,
    client: WaClient,
    pipeline: WaFakeConnectionPipeline,
    profiler: BenchProfiler,
    testCase: SendCase,
    config: BenchConfig
): Promise<{ result: ScenarioResult; totalBytes: number }> {
    await ensurePreKeyPool(server, pipeline, 2)
    const peerJid = buildRandomPeerJid('777')
    await server.createFakePeer({ jid: peerJid }, pipeline)
    return runSendScenarioWithJid(client, profiler, testCase, config, peerJid)
}

async function runSendScenarioRpc(
    rpc: ServerRpc,
    client: WaClient,
    profiler: BenchProfiler,
    testCase: SendCase,
    config: BenchConfig
): Promise<{ result: ScenarioResult; totalBytes: number }> {
    await rpc.ensurePreKeyPool(2)
    const peerJid = buildRandomPeerJid('777')
    await rpc.createFakePeer({ jid: peerJid })
    return runSendScenarioWithJid(client, profiler, testCase, config, peerJid)
}

async function runSendScenarioWithJid(
    client: WaClient,
    profiler: BenchProfiler,
    testCase: SendCase,
    config: BenchConfig,
    peerJid: string
): Promise<{ result: ScenarioResult; totalBytes: number }> {
    const media = fillRandom(config.payloadBytes)
    const totalBytes = config.payloadBytes * config.messages
    await profiler.beforeScenario(testCase.name)
    const result = await runScenario(
        testCase.name,
        config.messages,
        async () => {
            for (let i = 0; i < config.messages; i += 1) {
                // Build a FRESH Readable per iteration: streams are
                // single-use, and reusing one would let the lib consume
                // it once on send #0 and then receive 'end' immediately
                // on subsequent sends.
                await testCase.send(client, peerJid, buildMediaInput(media, config), i)
            }
        },
        'messages'
    )
    await profiler.afterScenario(testCase.name)
    return { result, totalBytes }
}

// ─── Group-send helper ────────────────────────────────────────────────

async function runGroupSendScenarioInProcess(
    server: FakeWaServer,
    client: WaClient,
    pipeline: WaFakeConnectionPipeline,
    profiler: BenchProfiler,
    config: BenchConfig
): Promise<{ result: ScenarioResult; totalBytes: number }> {
    const groupJid = buildRandomGroupJid()
    const members: FakePeer[] = []
    for (let m = 0; m < config.groupMembers; m += 1) {
        await ensurePreKeyPool(server, pipeline, 1)
        const memberJid = `5511${String(8_500_000_000 + m).padStart(10, '0')}@s.whatsapp.net`
        const peer = await server.createFakePeer({ jid: memberJid }, pipeline)
        members.push(peer)
    }
    server.createFakeGroup({
        groupJid,
        subject: 'Bench Media Group',
        participants: members
    })
    return runGroupSendBody(client, profiler, config, groupJid)
}

async function runGroupSendScenarioRpc(
    rpc: ServerRpc,
    client: WaClient,
    profiler: BenchProfiler,
    config: BenchConfig
): Promise<{ result: ScenarioResult; totalBytes: number }> {
    const groupJid = buildRandomGroupJid()
    const memberPeerIds: string[] = []
    for (let m = 0; m < config.groupMembers; m += 1) {
        await rpc.ensurePreKeyPool(1)
        const memberJid = `5511${String(8_500_000_000 + m).padStart(10, '0')}@s.whatsapp.net`
        const { peerId } = await rpc.createFakePeer({ jid: memberJid })
        memberPeerIds.push(peerId)
    }
    await rpc.createFakeGroup({
        groupJid,
        subject: 'Bench Media Group',
        participantPeerIds: memberPeerIds
    })
    return runGroupSendBody(client, profiler, config, groupJid)
}

async function runGroupSendBody(
    client: WaClient,
    profiler: BenchProfiler,
    config: BenchConfig,
    groupJid: string
): Promise<{ result: ScenarioResult; totalBytes: number }> {
    const media = fillRandom(config.payloadBytes)
    // Warmup outside the timed window so SKDM fanout is amortised.
    await client.message.send(groupJid, {
        type: 'image',
        media: buildMediaInput(media, config),
        mimetype: 'image/jpeg',
        caption: 'warmup'
    })
    const totalBytes = config.payloadBytes * config.messages
    const name = 'send_media_group_image'
    await profiler.beforeScenario(name)
    const result = await runScenario(
        name,
        config.messages,
        async () => {
            for (let i = 0; i < config.messages; i += 1) {
                await client.message.send(groupJid, {
                    type: 'image',
                    media: buildMediaInput(media, config),
                    mimetype: 'image/jpeg',
                    caption: `group media ${i}`
                })
            }
        },
        'messages'
    )
    await profiler.afterScenario(name)
    return { result, totalBytes }
}

// ─── Recv-side helpers ────────────────────────────────────────────────

async function runRecvScenarioInProcess(
    server: FakeWaServer,
    client: WaClient,
    pipeline: WaFakeConnectionPipeline,
    profiler: BenchProfiler,
    testCase: RecvCase,
    config: BenchConfig
): Promise<{ result: ScenarioResult; totalBytes: number }> {
    await ensurePreKeyPool(server, pipeline, 2)
    const peerJid = buildRandomPeerJid('666')
    const peer = await server.createFakePeer({ jid: peerJid }, pipeline)
    const plaintext = fillRandom(config.payloadBytes)
    const blob = await server.publishMediaBlob({ mediaType: testCase.mediaType, plaintext })
    const directPath = server.mediaUrl(blob.path)
    const totalBytes = config.payloadBytes * config.messages

    await profiler.beforeScenario(testCase.name)
    const result = await runScenario(
        testCase.name,
        config.messages,
        async () => {
            for (let i = 0; i < config.messages; i += 1) {
                const eventPromise = waitForMessage(client, testCase.matches, 10_000)
                await sendPeerMediaInProcess(peer, testCase.mediaType, {
                    directPath,
                    mediaKey: blob.mediaKey,
                    fileSha256: blob.fileSha256,
                    fileEncSha256: blob.fileEncSha256,
                    fileLength: blob.fileLength,
                    mimetype: testCase.mimetype
                })
                const event = await eventPromise
                const downloaded = await client.message.downloadBytes(event)
                if (downloaded.byteLength !== plaintext.byteLength) {
                    throw new Error(
                        `${testCase.name}: downloaded ${downloaded.byteLength} != expected ${plaintext.byteLength}`
                    )
                }
            }
        },
        'messages'
    )
    await profiler.afterScenario(testCase.name)
    return { result, totalBytes }
}

async function runRecvScenarioRpc(
    rpc: ServerRpc,
    client: WaClient,
    profiler: BenchProfiler,
    testCase: RecvCase,
    config: BenchConfig
): Promise<{ result: ScenarioResult; totalBytes: number }> {
    await rpc.ensurePreKeyPool(2)
    const peerJid = buildRandomPeerJid('666')
    const { peerId } = await rpc.createFakePeer({ jid: peerJid })
    const plaintext = fillRandom(config.payloadBytes)
    const blob = await rpc.publishMediaBlob({ mediaType: testCase.mediaType, plaintext })
    const directPath = await rpc.mediaUrl(blob.path)
    const totalBytes = config.payloadBytes * config.messages

    await profiler.beforeScenario(testCase.name)
    const result = await runScenario(
        testCase.name,
        config.messages,
        async () => {
            for (let i = 0; i < config.messages; i += 1) {
                const eventPromise = waitForMessage(client, testCase.matches, 10_000)
                await sendPeerMediaRpc(rpc, peerId, testCase.mediaType, {
                    directPath,
                    mediaKey: blob.mediaKey,
                    fileSha256: blob.fileSha256,
                    fileEncSha256: blob.fileEncSha256,
                    fileLength: blob.fileLength,
                    mimetype: testCase.mimetype
                })
                const event = await eventPromise
                const downloaded = await client.message.downloadBytes(event)
                if (downloaded.byteLength !== plaintext.byteLength) {
                    throw new Error(
                        `${testCase.name}: downloaded ${downloaded.byteLength} != expected ${plaintext.byteLength}`
                    )
                }
            }
        },
        'messages'
    )
    await profiler.afterScenario(testCase.name)
    return { result, totalBytes }
}

interface MediaDescriptor {
    readonly directPath: string
    readonly mediaKey: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly fileLength: number
    readonly mimetype: string
}

async function sendPeerMediaInProcess(
    peer: FakePeer,
    mediaType: FakeMediaType,
    descriptor: MediaDescriptor
): Promise<void> {
    if (mediaType === 'image') return peer.sendImageMessage(descriptor)
    if (mediaType === 'video') return peer.sendVideoMessage(descriptor)
    throw new Error(`unsupported recv mediaType: ${mediaType}`)
}

async function sendPeerMediaRpc(
    rpc: ServerRpc,
    peerId: string,
    mediaType: FakeMediaType,
    descriptor: MediaDescriptor
): Promise<void> {
    if (mediaType === 'image') return rpc.peerSendImageMessage(peerId, descriptor)
    if (mediaType === 'video') return rpc.peerSendVideoMessage(peerId, descriptor)
    throw new Error(`unsupported recv mediaType: ${mediaType}`)
}

function buildRandomPeerJid(prefix: string): string {
    return `5511${prefix}${Math.floor(Math.random() * 1_000_000_000)
        .toString()
        .padStart(7, '0')}@s.whatsapp.net`
}

function buildRandomGroupJid(): string {
    return `120363${String(950_000_000_000 + (Date.now() % 1_000_000)).padStart(15, '0')}@g.us`
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    installEmergencyStop()
    const argSet = new Set(process.argv.slice(2))
    const profiler = new BenchProfiler(readProfilerOptions(argSet))
    await profiler.start()

    const config = readConfig()
    const backendName = process.env.ZAPO_BENCH_STORE ?? 'memory'
    const separate = argSet.has('--separate-process')

    console.log('zapo-js messaging-with-media bench')
    console.log('──────────────────────────────────')
    console.log(`  messages/scenario : ${config.messages}`)
    console.log(
        `  payload           : ${formatMiB(config.payloadBytes)} (${config.payloadBytes} B)`
    )
    console.log(`  media input       : ${config.inputMode} (chunk ${config.chunkBytes} B)`)
    console.log(`  group members     : ${config.groupMembers}`)
    console.log(`  scenarios         : ${[...config.scenarios].join(', ')}`)
    console.log(`  store             : ${backendName}`)
    console.log(`  mode              : ${separate ? 'separate-process' : 'in-process'}`)
    console.log('')

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('start').catch((err) => console.error('[snapshot]', err))
    }

    const aggregated: ScenarioResult[] = []
    if (separate) {
        await runSeparateProcess(config, profiler, argSet, aggregated)
    } else {
        await runInProcess(config, profiler, aggregated)
    }

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('end').catch((err) => console.error('[snapshot]', err))
    }
    await profiler.stop()

    maybePrintJson(aggregated)
}

async function runInProcess(
    config: BenchConfig,
    profiler: BenchProfiler,
    aggregated: ScenarioResult[]
): Promise<void> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClient(storeFixture, { sessionId: 'zapo-bench-media' })
    const { server, client, pipeline } = fixture
    try {
        for (const testCase of SEND_CASES) {
            if (!config.scenarios.has(testCase.name)) continue
            const r = await runSendScenarioInProcess(
                server,
                client,
                pipeline,
                profiler,
                testCase,
                config
            )
            recordResult(aggregated, r)
        }
        if (config.scenarios.has('send_media_group_image')) {
            const r = await runGroupSendScenarioInProcess(
                server,
                client,
                pipeline,
                profiler,
                config
            )
            recordResult(aggregated, r)
        }
        for (const testCase of RECV_CASES) {
            if (!config.scenarios.has(testCase.name)) continue
            const r = await runRecvScenarioInProcess(
                server,
                client,
                pipeline,
                profiler,
                testCase,
                config
            )
            recordResult(aggregated, r)
        }
    } finally {
        await teardownFixture(fixture)
    }
}

async function runSeparateProcess(
    config: BenchConfig,
    profiler: BenchProfiler,
    argSet: ReadonlySet<string>,
    aggregated: ScenarioResult[]
): Promise<void> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClientViaRpc(storeFixture, { sessionId: 'zapo-bench-media' })
    const { rpc, client } = fixture
    try {
        await startServerProfilingIfRequested(rpc, profiler.options, argSet)
        await takeServerSnapshotIfRequested(rpc, 'server-pre', profiler.options, argSet)

        for (const testCase of SEND_CASES) {
            if (!config.scenarios.has(testCase.name)) continue
            const r = await runSendScenarioRpc(rpc, client, profiler, testCase, config)
            recordResult(aggregated, r)
        }
        if (config.scenarios.has('send_media_group_image')) {
            const r = await runGroupSendScenarioRpc(rpc, client, profiler, config)
            recordResult(aggregated, r)
        }
        for (const testCase of RECV_CASES) {
            if (!config.scenarios.has(testCase.name)) continue
            const r = await runRecvScenarioRpc(rpc, client, profiler, testCase, config)
            recordResult(aggregated, r)
        }

        await takeServerSnapshotIfRequested(rpc, 'server-post', profiler.options, argSet)
    } finally {
        await stopServerProfilingIfRequested(rpc, profiler.options, argSet).catch(() => undefined)
        await teardownRpcFixture(fixture)
    }
}

function recordResult(
    aggregated: ScenarioResult[],
    payload: { result: ScenarioResult; totalBytes: number }
): void {
    aggregated.push(payload.result)
    printResult(payload.result)
    console.log(
        `  total transferred : ${formatMiB(payload.totalBytes)}  →  ${formatBytesPerSec(payload.totalBytes, payload.result.elapsedMs)}`
    )
    console.log('')
    forceGcIfAvailable()
}

void main().catch((err) => {
    console.error(err)
    process.exit(1)
})
