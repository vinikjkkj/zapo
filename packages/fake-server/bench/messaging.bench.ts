/**
 * End-to-end messaging profiling for zapo-js, driven through the
 * @zapo-js/fake-server. Pairs a single real `WaClient` against an
 * in-process fake server and measures four scenarios:
 *
 *   1. SEND 1:1 — N messages to N distinct contacts (each with M
 *      devices); the lib runs usync + prekey-fetch + per-device
 *      pkmsg encryption + wire send.
 *   2. RECV 1:1 — N peers ship 1 message each in parallel; the
 *      lib runs Signal X3DH + Double Ratchet recv + decrypt + emit.
 *   3. SEND group — N messages distributed across G groups of S
 *      members each. The first send to each group does the SKDM
 *      fanout (1 pkmsg per member) and is amortised by an explicit
 *      warmup OUTSIDE the timed window so the timed numbers reflect
 *      steady-state skmsg throughput.
 *   4. RECV group — N messages distributed across the same G groups,
 *      each fired from a designated sender peer.
 *
 * Pairing is the most expensive setup step, so the harness pairs
 * once and runs all four scenarios in sequence on a single client.
 *
 * Tunables (env vars; defaults match the user-requested numbers):
 *   ZAPO_BENCH_CONTACTS              (default 1000)
 *   ZAPO_BENCH_CONTACT_DEVICES       (default 2)
 *   ZAPO_BENCH_GROUPS                (default 4)
 *   ZAPO_BENCH_GROUP_MEMBERS         (default 500)
 *   ZAPO_BENCH_MESSAGES              (default 1000)
 *   ZAPO_BENCH_SCENARIOS             (csv of: send_1to1, recv_1to1,
 *                                     send_group, recv_group; default = all)
 *   ZAPO_BENCH_JSON                  (=1 to also print results as JSON)
 *
 * Profiling flags (same shape as test/example.cjs):
 *   --cpu                    — V8 CPU profile covering the whole run;
 *                              saved to cpu-<ts>.cpuprofile on exit
 *                              (and cpu-<scenario>-<ts>.cpuprofile per
 *                              scenario if --per-scenario is passed)
 *   --heap                   — heap allocation timeline tracking; saved
 *                              to heap-<ts>.heaptimeline on exit
 *   --snapshot               — heap snapshot at start + end of the run
 *                              (snapshot-start-<ts>.heapsnapshot and
 *                              snapshot-end-<ts>.heapsnapshot)
 *   --per-scenario           — with --cpu, emit one profile per scenario
 *   --snapshot-per-scenario  — heap snapshot between scenarios
 *   --out-dir=<path>         — directory to write profiles into
 *                              (default: cwd)
 *
 * Run with:
 *   node --expose-gc --import tsx packages/fake-server/bench/messaging.bench.ts --cpu --heap
 */

import { mkdir, writeFile } from 'node:fs/promises'
import * as inspector from 'node:inspector/promises'
import { resolve as resolvePath } from 'node:path'
import { performance } from 'node:perf_hooks'

import {
    createStore,
    type Logger,
    type WaAuthCredentials,
    type WaAuthStore,
    WaClient,
    type WaClientEventMap
} from 'zapo-js'

import type { FakePeer } from '../src/api/FakePeer'
import { FakeWaServer, type WaFakeConnectionPipeline } from '../src/api/FakeWaServer'
import { parsePairingQrString } from '../src/protocol/auth/pair-device'

// ─── Helpers ──────────────────────────────────────────────────────────

const BYTES_PER_MEBIBYTE = 1_048_576

function formatFixed(value: number, fractionDigits = 2): string {
    if (!Number.isFinite(value)) return value.toString()
    return value.toFixed(fractionDigits)
}

function formatMiB(bytes: number): string {
    return `${formatFixed(bytes / BYTES_PER_MEBIBYTE, 2)} MiB`
}

function formatMs(value: number): string {
    if (value >= 1_000) return `${formatFixed(value / 1_000, 2)} s`
    return `${formatFixed(value, 2)} ms`
}

function readPositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name]
    if (!raw) return fallback
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`env ${name}=${raw} must be a positive integer`)
    }
    return parsed
}

function hasExposedGc(): boolean {
    return typeof (globalThis as { gc?: () => void }).gc === 'function'
}

function forceGcIfAvailable(): void {
    const gc = (globalThis as { gc?: () => void }).gc
    if (gc) gc()
}

const NOOP_LOGGER: Logger = {
    level: 'error',
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: (...args: unknown[]) => {
        if (process.env.ZAPO_BENCH_VERBOSE) console.warn('[lib warn]', ...args)
    },
    error: (...args: unknown[]) => {
        if (process.env.ZAPO_BENCH_VERBOSE) console.error('[lib error]', ...args)
    }
}

class InMemoryAuthStore implements WaAuthStore {
    private credentials: WaAuthCredentials | null = null
    public async load(): Promise<WaAuthCredentials | null> {
        return this.credentials
    }
    public async save(credentials: WaAuthCredentials): Promise<void> {
        this.credentials = credentials
    }
    public async clear(): Promise<void> {
        this.credentials = null
    }
}

function noopStore(): never {
    throw new Error('unexpected store call — bench harness should not reach this slot')
}

const AUTH_BACKEND = (
    authStore: WaAuthStore
): { readonly stores: object; readonly caches: object } => ({
    stores: {
        auth: () => authStore,
        signal: noopStore,
        preKey: noopStore,
        session: noopStore,
        identity: noopStore,
        senderKey: noopStore,
        appState: noopStore,
        messages: noopStore,
        threads: noopStore,
        contacts: noopStore,
        privacyToken: noopStore
    },
    caches: {
        retry: noopStore,
        participants: noopStore,
        deviceList: noopStore,
        messageSecret: noopStore
    }
})

// ─── Profiler ─────────────────────────────────────────────────────────

interface ProfilerOptions {
    readonly cpu: boolean
    readonly heap: boolean
    readonly snapshot: boolean
    readonly perScenario: boolean
    readonly snapshotPerScenario: boolean
    readonly outDir: string
}

function readProfilerOptions(args: ReadonlySet<string>): ProfilerOptions {
    const outDirArg = process.argv.find((a) => a.startsWith('--out-dir='))
    return {
        cpu: args.has('--cpu'),
        heap: args.has('--heap'),
        snapshot: args.has('--snapshot'),
        perScenario: args.has('--per-scenario'),
        snapshotPerScenario: args.has('--snapshot-per-scenario'),
        outDir: outDirArg ? outDirArg.split('=')[1] : process.cwd()
    }
}

/**
 * Thin wrapper around `node:inspector/promises` that mirrors the
 * shape used by `test/example.cjs`. Captures one CPU profile + one
 * heap-allocation timeline that span the whole bench run, plus
 * optional per-scenario CPU profiles when `--per-scenario` is set.
 *
 * IMPORTANT: this is constructed and `start()`-ed BEFORE any
 * fake-server / zapo-js modules are imported in main(), so module-
 * level allocations are captured by the heap timeline.
 */
class BenchProfiler {
    private readonly options: ProfilerOptions
    private session: inspector.Session | null = null
    private active = false

    public constructor(options: ProfilerOptions) {
        this.options = options
    }

    public get enabled(): boolean {
        return (
            this.options.cpu ||
            this.options.heap ||
            this.options.snapshot ||
            this.options.snapshotPerScenario
        )
    }

    public async start(): Promise<void> {
        if (!this.enabled) return
        await mkdir(this.options.outDir, { recursive: true })
        this.session = new inspector.Session()
        this.session.connect()
        if (this.options.heap) {
            await this.session.post('HeapProfiler.startTrackingHeapObjects', {
                trackAllocations: true
            })
            console.log('[heap] allocation tracking started')
        }
        if (this.options.cpu) {
            await this.session.post('Profiler.enable')
            await this.session.post('Profiler.start')
            console.log('[cpu] profiling started')
        }
        this.active = true
    }

    /**
     * Per-scenario hook. With `--per-scenario`, we stop the running
     * CPU profile, save it under a scenario-tagged filename, and
     * start a fresh one. With `--snapshot-per-scenario` we also
     * write a heap snapshot tagged with the scenario name.
     */
    public async beforeScenario(name: string): Promise<void> {
        if (!this.active || !this.session) return
        if (this.options.cpu && this.options.perScenario) {
            try {
                await this.session.post('Profiler.start')
            } catch {
                // already running — fine
            }
        }
        if (this.options.snapshotPerScenario) {
            await this.takeHeapSnapshot(`pre-${slug(name)}`).catch((err) =>
                console.error(`[snapshot:pre-${name}]`, err)
            )
        }
    }

    public async afterScenario(name: string): Promise<void> {
        if (!this.active || !this.session) return
        if (this.options.cpu && this.options.perScenario) {
            try {
                const result = (await this.session.post('Profiler.stop')) as {
                    profile: unknown
                }
                const out = this.fileName(`cpu-${slug(name)}`, 'cpuprofile')
                await writeFile(out, JSON.stringify(result.profile))
                console.log(`[cpu] saved ${out}`)
                // Restart for the next scenario.
                await this.session.post('Profiler.start')
            } catch (err) {
                console.error(`[cpu:per-scenario:${name}]`, err)
            }
        }
        if (this.options.snapshotPerScenario) {
            await this.takeHeapSnapshot(`post-${slug(name)}`).catch((err) =>
                console.error(`[snapshot:post-${name}]`, err)
            )
        }
    }

    public async stop(): Promise<void> {
        if (!this.active || !this.session) return
        if (this.options.cpu) {
            try {
                const result = (await this.session.post('Profiler.stop')) as {
                    profile: unknown
                }
                const out = this.fileName('cpu', 'cpuprofile')
                await writeFile(out, JSON.stringify(result.profile))
                console.log(`[cpu] saved ${out}`)
            } catch (err) {
                console.error('[cpu:stop]', err)
            }
        }
        if (this.options.heap) {
            await this.saveHeapTimeline().catch((err) => console.error('[heap]', err))
        }
        try {
            this.session.disconnect()
        } catch {
            // best-effort
        }
        this.session = null
        this.active = false
    }

    public async takeHeapSnapshot(label: string): Promise<void> {
        if (!this.session) return
        const chunks: string[] = []
        const onChunk = (msg: { params: { chunk: string } }): void => {
            chunks.push(msg.params.chunk)
        }
        this.session.on(
            'HeapProfiler.addHeapSnapshotChunk',
            onChunk as unknown as (m: object) => void
        )
        try {
            await this.session.post('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
        } finally {
            this.session.removeListener(
                'HeapProfiler.addHeapSnapshotChunk',
                onChunk as unknown as (m: object) => void
            )
        }
        const out = this.fileName(`snapshot-${label}`, 'heapsnapshot')
        const content = chunks.join('')
        await writeFile(out, content)
        console.log(
            `[snapshot:${label}] saved ${out} (${(content.length / 1024 / 1024).toFixed(1)} MB)`
        )
    }

    private async saveHeapTimeline(): Promise<void> {
        if (!this.session) return
        const chunks: string[] = []
        const onChunk = (msg: { params: { chunk: string } }): void => {
            chunks.push(msg.params.chunk)
        }
        this.session.on(
            'HeapProfiler.addHeapSnapshotChunk',
            onChunk as unknown as (m: object) => void
        )
        try {
            // Take snapshot WHILE tracking is still active to capture trace stacks.
            await this.session.post('HeapProfiler.takeHeapSnapshot', {
                reportProgress: false,
                treatGlobalObjectsAsRoots: true
            })
            await this.session.post('HeapProfiler.stopTrackingHeapObjects')
        } finally {
            this.session.removeListener(
                'HeapProfiler.addHeapSnapshotChunk',
                onChunk as unknown as (m: object) => void
            )
        }
        const out = this.fileName('heap', 'heaptimeline')
        const content = chunks.join('')
        await writeFile(out, content)
        console.log(`[heap] saved ${out} (${(content.length / 1024 / 1024).toFixed(1)} MB)`)
    }

    private fileName(prefix: string, ext: string): string {
        return resolvePath(this.options.outDir, `${prefix}-${Date.now()}.${ext}`)
    }
}

function slug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

// ─── Configuration ────────────────────────────────────────────────────

interface BenchConfig {
    readonly contacts: number
    readonly contactDevices: number
    readonly groups: number
    readonly groupMembers: number
    readonly messages: number
    readonly scenarios: ReadonlySet<string>
}

const ALL_SCENARIOS = new Set(['send_1to1', 'recv_1to1', 'send_group', 'recv_group'])

function readScenarioFilter(): ReadonlySet<string> {
    const raw = process.env.ZAPO_BENCH_SCENARIOS
    if (!raw) return ALL_SCENARIOS
    const out = new Set<string>()
    for (const part of raw.split(',')) {
        const trimmed = part.trim()
        if (!trimmed) continue
        if (!ALL_SCENARIOS.has(trimmed)) {
            throw new Error(
                `unknown ZAPO_BENCH_SCENARIOS entry "${trimmed}"; valid: ${[...ALL_SCENARIOS].join(',')}`
            )
        }
        out.add(trimmed)
    }
    return out
}

function readConfig(): BenchConfig {
    return {
        contacts: readPositiveIntEnv('ZAPO_BENCH_CONTACTS', 1_000),
        contactDevices: readPositiveIntEnv('ZAPO_BENCH_CONTACT_DEVICES', 2),
        groups: readPositiveIntEnv('ZAPO_BENCH_GROUPS', 4),
        groupMembers: readPositiveIntEnv('ZAPO_BENCH_GROUP_MEMBERS', 500),
        messages: readPositiveIntEnv('ZAPO_BENCH_MESSAGES', 1_000),
        scenarios: readScenarioFilter()
    }
}

// ─── Pairing ──────────────────────────────────────────────────────────

interface PairedFixture {
    readonly server: FakeWaServer
    readonly client: WaClient
    readonly pipeline: WaFakeConnectionPipeline
    readonly meJid: string
}

async function bringUpPairedClient(): Promise<PairedFixture> {
    const server = await FakeWaServer.start()
    const authStore = new InMemoryAuthStore()
    const store = createStore({
        backends: { mem: AUTH_BACKEND(authStore) as never },
        providers: {
            auth: 'mem',
            signal: 'memory',
            senderKey: 'memory',
            appState: 'memory'
        },
        // The default in-memory prekey store caps at 4_096 entries.
        // The bench creates ~4000 fake peers and triggers ~5 prekey
        // refills (each generates 812 fresh keyIds), so the total
        // distinct keyId set hits ~4060 — right at the cap. The
        // bounded map then evicts the oldest entries (the very keyIds
        // that the early peers reserved), causing those peers to fail
        // their pkmsg with "prekey N not found" later. Bumping the
        // cap above the worst-case keeps every reserved keyId alive
        // for the duration of the bench.
        memory: { limits: { signalPreKeys: 16_384 } }
    })

    const client = new WaClient(
        {
            store,
            sessionId: 'zapo-messaging-bench',
            chatSocketUrls: [server.url],
            connectTimeoutMs: 60_000,
            proxy: {
                mediaUpload: server.mediaProxyAgent,
                mediaDownload: server.mediaProxyAgent
            },
            testHooks: {
                noiseRootCa: server.noiseRootCa
            }
        },
        NOOP_LOGGER
    )

    const meJid = '5511999999999@s.whatsapp.net'
    const meDeviceJid = '5511999999999:1@s.whatsapp.net'

    const materialPromise = new Promise<{
        readonly advSecretKey: Uint8Array
        readonly identityPublicKey: Uint8Array
    }>((resolve) => {
        client.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
            const parsed = parsePairingQrString(event.qr)
            resolve({
                advSecretKey: parsed.advSecretKey,
                identityPublicKey: parsed.identityPublicKey
            })
        })
    })

    const pairedPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('auth_paired timeout')), 60_000)
        client.once('auth_paired', () => {
            clearTimeout(timer)
            resolve()
        })
    })

    await client.connect()
    const pipeline = await server.waitForAuthenticatedPipeline()
    await server.runPairing(pipeline, { deviceJid: meDeviceJid }, () => materialPromise)
    const pipelineAfterPairPromise = server.waitForNextAuthenticatedPipeline()
    await pairedPromise
    const pipelineAfterPair = await pipelineAfterPairPromise
    await server.triggerPreKeyUpload(pipelineAfterPair)

    return { server, client, pipeline: pipelineAfterPair, meJid }
}

// ─── Fixtures ─────────────────────────────────────────────────────────

interface ContactFixture {
    readonly userJid: string
    readonly devices: readonly FakePeer[]
}

async function buildContacts(
    server: FakeWaServer,
    pipeline: WaFakeConnectionPipeline,
    count: number,
    devicesPerContact: number
): Promise<readonly AbstractContactFixture[]> {
    const out: ContactFixture[] = []
    const deviceIds = Array.from({ length: devicesPerContact }, (_, idx) => idx + 1)
    for (let i = 0; i < count; i += 1) {
        // Each contact will lazily consume `devicesPerContact` prekeys
        // from the dispenser on its first send. Top up the pool BEFORE
        // creation so the dispenser has enough headroom for this
        // contact's devices.
        await ensurePreKeyPool(server, pipeline, devicesPerContact)
        const userJid = `5511${String(7_000_000_000 + i).padStart(10, '0')}@s.whatsapp.net`
        const devices = await server.createFakePeerWithDevices({ userJid, deviceIds }, pipeline)
        out.push({ userJid, devices })
    }
    return out
}

/**
 * Forces the lib to upload a fresh batch of one-time prekeys when
 * the dispenser pool drops below `requiredHeadroom`. The fake server
 * resets its dispenser cursor to 0 every time a new bundle lands, so
 * after this returns the dispenser has the full
 * `SIGNAL_UPLOAD_PREKEYS_COUNT` (812) entries available again.
 *
 * The lib treats every `<notification type="encrypt"><count value=0/>`
 * as a "prekey low" hint and runs a full re-upload, so calling this
 * frequently is cheap (one IQ round-trip per call).
 */
async function ensurePreKeyPool(
    server: FakeWaServer,
    pipeline: WaFakeConnectionPipeline,
    requiredHeadroom: number
): Promise<void> {
    if (server.preKeysAvailable() >= requiredHeadroom) return
    await server.triggerPreKeyUpload(pipeline, { force: true })
}

interface GroupFixture {
    readonly groupJid: string
    readonly members: readonly FakePeer[]
    readonly designatedSender: FakePeer
}

async function buildGroups(
    server: FakeWaServer,
    pipeline: WaFakeConnectionPipeline,
    groupCount: number,
    memberCount: number
): Promise<readonly AbstractGroupFixture[]> {
    const out: GroupFixture[] = []
    let memberCursor = 0
    for (let g = 0; g < groupCount; g += 1) {
        const groupJid = `120363${String(900_000_000_000 + g).padStart(15, '0')}@g.us`
        const members: FakePeer[] = []
        for (let m = 0; m < memberCount; m += 1) {
            const memberJid = `5511${String(8_000_000_000 + memberCursor).padStart(10, '0')}@s.whatsapp.net`
            memberCursor += 1
            await ensurePreKeyPool(server, pipeline, 1)
            const peer = await server.createFakePeer({ jid: memberJid }, pipeline)
            members.push(peer)
        }
        server.createFakeGroup({
            groupJid,
            subject: `Bench Group ${g + 1}`,
            participants: members
        })
        out.push({ groupJid, members, designatedSender: members[0] })
    }
    return out
}

// ─── Scenario runner ──────────────────────────────────────────────────

interface ScenarioResult {
    readonly name: string
    readonly messages: number
    readonly elapsedMs: number
    readonly throughputMsgsPerSec: number
    readonly avgMsPerMsg: number
    readonly cpuTimeMs: number
    readonly cpuPercent: number
    readonly rssBeforeBytes: number
    readonly rssAfterBytes: number
    readonly rssDeltaBytes: number
    readonly heapDeltaBytes: number
}

function snapshotMemory(): { rss: number; heap: number } {
    const m = process.memoryUsage()
    return { rss: m.rss, heap: m.heapUsed }
}

async function runScenario(
    name: string,
    messageCount: number,
    operation: () => Promise<void>
): Promise<ScenarioResult> {
    forceGcIfAvailable()
    const before = snapshotMemory()
    const startedCpu = process.cpuUsage()
    const startedAt = performance.now()
    await operation()
    const elapsedMs = performance.now() - startedAt
    const cpu = process.cpuUsage(startedCpu)
    const cpuTimeMs = (cpu.user + cpu.system) / 1_000
    const after = snapshotMemory()
    return {
        name,
        messages: messageCount,
        elapsedMs,
        throughputMsgsPerSec: (messageCount / elapsedMs) * 1_000,
        avgMsPerMsg: elapsedMs / messageCount,
        cpuTimeMs,
        cpuPercent: elapsedMs > 0 ? (cpuTimeMs / elapsedMs) * 100 : 0,
        rssBeforeBytes: before.rss,
        rssAfterBytes: after.rss,
        rssDeltaBytes: Math.max(0, after.rss - before.rss),
        heapDeltaBytes: Math.max(0, after.heap - before.heap)
    }
}

// ─── Scenarios ────────────────────────────────────────────────────────

async function scenarioSend1to1(
    client: WaClient,
    contacts: readonly AbstractContactFixture[],
    messages: number
): Promise<ScenarioResult> {
    return runScenario('SEND 1:1', messages, async () => {
        const promises = new Array<Promise<unknown>>(messages)
        for (let i = 0; i < messages; i += 1) {
            const contact = contacts[i % contacts.length]
            promises[i] = client.sendMessage(contact.userJid, {
                conversation: `bench send ${i}`
            })
        }
        await Promise.all(promises)
    })
}

async function scenarioRecv1to1(
    client: WaClient,
    contacts: readonly AbstractContactFixture[],
    messages: number
): Promise<ScenarioResult> {
    // Bucket the message count across contacts so each peer sends its
    // share SERIALLY (no concurrent X3DH per peer); buckets across
    // peers run in parallel.
    const buckets = bucketize(messages, contacts.length)
    return runScenario('RECV 1:1', messages, async () => {
        let received = 0
        let sent = 0
        let lastProgressAt = Date.now()
        const done = new Promise<void>((resolve, reject) => {
            const watchdog = setInterval(() => {
                if (Date.now() - lastProgressAt > 30_000) {
                    clearInterval(watchdog)
                    reject(
                        new Error(
                            `RECV 1:1 stalled: sent ${sent}/${messages}, received ${received}/${messages} (no progress for 30s)`
                        )
                    )
                }
            }, 5_000)
            watchdog.unref?.()
            const listener: WaClientEventMap['message'] = () => {
                received += 1
                lastProgressAt = Date.now()
                if (received >= messages) {
                    clearInterval(watchdog)
                    client.off('message', listener)
                    resolve()
                }
            }
            client.on('message', listener)
            const peerSendChains = contacts.map(async (contact, contactIdx) => {
                const count = buckets[contactIdx]
                const sender = contact.devices[0]
                for (let n = 0; n < count; n += 1) {
                    await sender.sendConversation(`bench recv ${contactIdx}-${n}`)
                    sent += 1
                    lastProgressAt = Date.now()
                }
            })
            Promise.all(peerSendChains).catch(reject)
        })
        await done
    })
}

/**
 * Splits `total` units across `slots` buckets as evenly as possible.
 * Bucket 0..(remainder-1) get one extra unit when total isn't a clean
 * multiple of slots.
 */
function bucketize(total: number, slots: number): readonly number[] {
    if (slots <= 0) throw new Error('bucketize requires slots > 0')
    const base = Math.floor(total / slots)
    const remainder = total - base * slots
    const out = new Array<number>(slots)
    for (let i = 0; i < slots; i += 1) {
        out[i] = base + (i < remainder ? 1 : 0)
    }
    return out
}

async function scenarioSendGroup(
    client: WaClient,
    groups: readonly AbstractGroupFixture[],
    messages: number
): Promise<ScenarioResult> {
    // Warm up: send 1 message to each group OUTSIDE the timed window
    // so the SKDM fanout cost (1 pkmsg per member) is amortised.
    for (const group of groups) {
        await client.sendMessage(group.groupJid, { conversation: 'warmup' })
    }
    return runScenario('SEND group', messages, async () => {
        const promises = new Array<Promise<unknown>>(messages)
        for (let i = 0; i < messages; i += 1) {
            const group = groups[i % groups.length]
            promises[i] = client.sendMessage(group.groupJid, {
                conversation: `bench gsend ${i}`
            })
        }
        await Promise.all(promises)
    })
}

async function scenarioRecvGroup(
    client: WaClient,
    groups: readonly AbstractGroupFixture[],
    messages: number
): Promise<ScenarioResult> {
    // Warm up: each designated sender ships 1 message OUTSIDE the
    // timed window so the X3DH initial handshake on the lib's recv
    // side is amortised.
    {
        let warmed = 0
        const warmupTotal = groups.length
        const warmupDone = new Promise<void>((resolve) => {
            const listener: WaClientEventMap['message'] = (event) => {
                if (event.message?.conversation?.startsWith('warmup-recv')) {
                    warmed += 1
                    if (warmed >= warmupTotal) {
                        client.off('message', listener)
                        resolve()
                    }
                }
            }
            client.on('message', listener)
        })
        for (let g = 0; g < groups.length; g += 1) {
            await groups[g].designatedSender.sendGroupConversation(
                groups[g].groupJid,
                `warmup-recv ${g}`
            )
        }
        await warmupDone
    }

    const buckets = bucketize(messages, groups.length)
    return runScenario('RECV group', messages, async () => {
        let received = 0
        const done = new Promise<void>((resolve) => {
            const listener: WaClientEventMap['message'] = (event) => {
                if (event.message?.conversation?.startsWith('bench grecv')) {
                    received += 1
                    if (received >= messages) {
                        client.off('message', listener)
                        resolve()
                    }
                }
            }
            client.on('message', listener)
        })
        const groupSendChains = groups.map(async (group, groupIdx) => {
            const count = buckets[groupIdx]
            for (let n = 0; n < count; n += 1) {
                await group.designatedSender.sendGroupConversation(
                    group.groupJid,
                    `bench grecv ${groupIdx}-${n}`
                )
            }
        })
        await Promise.all(groupSendChains)
        await done
    })
}

// ─── Reporting ────────────────────────────────────────────────────────

function printConfig(config: BenchConfig): void {
    console.log('zapo-js messaging bench')
    console.log('────────────────────────')
    console.log(`  contacts          : ${config.contacts}`)
    console.log(`  devices/contact   : ${config.contactDevices}`)
    console.log(`  groups            : ${config.groups}`)
    console.log(`  members/group     : ${config.groupMembers}`)
    console.log(`  messages/scenario : ${config.messages}`)
    console.log(`  scenarios         : ${[...config.scenarios].join(', ')}`)
    console.log(`  --expose-gc       : ${hasExposedGc() ? 'yes' : 'no'}`)
    console.log('')
}

function printResult(result: ScenarioResult): void {
    console.log(`──[ ${result.name} ]──────────────────────────────`)
    console.log(`  messages          : ${result.messages}`)
    console.log(`  elapsed           : ${formatMs(result.elapsedMs)}`)
    console.log(`  throughput        : ${formatFixed(result.throughputMsgsPerSec, 1)} msg/s`)
    console.log(`  avg / msg         : ${formatMs(result.avgMsPerMsg)}`)
    console.log(`  CPU time          : ${formatMs(result.cpuTimeMs)}`)
    console.log(`  CPU %             : ${formatFixed(result.cpuPercent, 1)}`)
    console.log(`  RSS before        : ${formatMiB(result.rssBeforeBytes)}`)
    console.log(`  RSS after         : ${formatMiB(result.rssAfterBytes)}`)
    console.log(`  RSS delta         : ${formatMiB(result.rssDeltaBytes)}`)
    console.log(`  heap delta        : ${formatMiB(result.heapDeltaBytes)}`)
    console.log('')
}

// ─── Abstract fixture interfaces ──────────────────────────────────────
// Both in-process and separate-process modes produce these.

interface PeerHandle {
    sendConversation(text: string): Promise<void>
    sendGroupConversation(groupJid: string, text: string): Promise<void>
}

interface AbstractContactFixture {
    readonly userJid: string
    readonly devices: readonly PeerHandle[]
}

interface AbstractGroupFixture {
    readonly groupJid: string
    readonly members: readonly PeerHandle[]
    readonly designatedSender: PeerHandle
}

// ─── Main ─────────────────────────────────────────────────────────────

async function mainInProcess(
    config: BenchConfig,
    profiler: BenchProfiler,
    argSet: ReadonlySet<string>
): Promise<{
    results: ScenarioResult[]
    cleanup: () => Promise<void>
}> {
    const setupStart = performance.now()
    const fixture = await bringUpPairedClient()
    console.log(`paired in ${formatMs(performance.now() - setupStart)}`)

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('start').catch((err) => console.error('[snapshot]', err))
    }

    let contacts: readonly AbstractContactFixture[] = []
    let groups: readonly AbstractGroupFixture[] = []

    const need1to1 = config.scenarios.has('send_1to1') || config.scenarios.has('recv_1to1')
    const needGroup = config.scenarios.has('send_group') || config.scenarios.has('recv_group')

    if (need1to1) {
        const t = performance.now()
        contacts = await buildContacts(
            fixture.server,
            fixture.pipeline,
            config.contacts,
            config.contactDevices
        )
        console.log(
            `built ${contacts.length} contacts (${config.contactDevices} dev each) in ${formatMs(
                performance.now() - t
            )}, dispenser misses: ${fixture.server.preKeyDispenserMissesSnapshot()}`
        )
    }

    if (needGroup) {
        const t = performance.now()
        groups = await buildGroups(
            fixture.server,
            fixture.pipeline,
            config.groups,
            config.groupMembers
        )
        console.log(
            `built ${groups.length} groups × ${config.groupMembers} members in ${formatMs(
                performance.now() - t
            )}, dispenser misses: ${fixture.server.preKeyDispenserMissesSnapshot()}`
        )
    }
    console.log('')

    const results = await runAllScenarios(config, profiler, fixture.client, contacts, groups)
    return {
        results,
        cleanup: async () => {
            await fixture.client.disconnect().catch(() => undefined)
            await fixture.server.stop()
        }
    }
}

async function mainSeparateProcess(
    config: BenchConfig,
    profiler: BenchProfiler,
    argSet: ReadonlySet<string>
): Promise<{
    results: ScenarioResult[]
    cleanup: () => Promise<void>
}> {
    const { ServerRpc } = await import('./server-rpc')
    const rpc = new ServerRpc()
    await rpc.spawn()
    await rpc.start()

    const authStore = new InMemoryAuthStore()
    const store = createStore({
        backends: { mem: AUTH_BACKEND(authStore) as never },
        providers: {
            auth: 'mem',
            signal: 'memory',
            senderKey: 'memory',
            appState: 'memory'
        },
        memory: { limits: { signalPreKeys: 16_384 } }
    })

    const client = new WaClient(
        {
            store,
            sessionId: 'zapo-bench-separate',
            chatSocketUrls: [rpc.serverUrl],
            connectTimeoutMs: 60_000,
            proxy: {
                mediaUpload: rpc.mediaProxyAgent!,
                mediaDownload: rpc.mediaProxyAgent!
            },
            testHooks: {
                noiseRootCa: rpc.noiseRootCa
            }
        },
        NOOP_LOGGER
    )

    const meDeviceJid = '5511999999999:1@s.whatsapp.net'

    // Set up pairing material relay
    client.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
        const parsed = parsePairingQrString(event.qr)
        rpc.sendPairingMaterial({
            advSecretKey: parsed.advSecretKey,
            identityPublicKey: parsed.identityPublicKey
        })
    })

    const pairedPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('auth_paired timeout')), 60_000)
        client.once('auth_paired', () => {
            clearTimeout(timer)
            resolve()
        })
    })

    const setupStart = performance.now()
    await client.connect()
    await rpc.waitForAuthenticatedPipeline()
    // Start pairing on the server side — the material relay is already wired
    const pairPromise = rpc.runPairing(meDeviceJid)
    const waitNextPromise = rpc.waitForNextAuthenticatedPipeline()
    await pairedPromise
    await pairPromise
    await waitNextPromise
    await rpc.triggerPreKeyUpload()
    console.log(`paired in ${formatMs(performance.now() - setupStart)}`)

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('start').catch((err) => console.error('[snapshot]', err))
    }

    let contacts: readonly AbstractContactFixture[] = []
    let groups: readonly AbstractGroupFixture[] = []

    const need1to1 = config.scenarios.has('send_1to1') || config.scenarios.has('recv_1to1')
    const needGroup = config.scenarios.has('send_group') || config.scenarios.has('recv_group')

    if (need1to1) {
        const t = performance.now()
        contacts = await rpc.buildContacts(config.contacts, config.contactDevices)
        const misses = await rpc.dispenserMisses()
        console.log(
            `built ${contacts.length} contacts (${config.contactDevices} dev each) in ${formatMs(
                performance.now() - t
            )}, dispenser misses: ${misses}`
        )
    }

    if (needGroup) {
        const t = performance.now()
        groups = await rpc.buildGroups(config.groups, config.groupMembers)
        const misses = await rpc.dispenserMisses()
        console.log(
            `built ${groups.length} groups × ${config.groupMembers} members in ${formatMs(
                performance.now() - t
            )}, dispenser misses: ${misses}`
        )
    }
    console.log('')

    const results = await runAllScenarios(config, profiler, client, contacts, groups)
    return {
        results,
        cleanup: async () => {
            await client.disconnect().catch(() => undefined)
            await rpc.stop()
        }
    }
}

async function runAllScenarios(
    config: BenchConfig,
    profiler: BenchProfiler,
    client: WaClient,
    contacts: readonly AbstractContactFixture[],
    groups: readonly AbstractGroupFixture[]
): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = []
    const runOne = async (name: string, run: () => Promise<ScenarioResult>): Promise<void> => {
        await profiler.beforeScenario(name)
        try {
            const r = await run()
            results.push(r)
            printResult(r)
        } finally {
            await profiler.afterScenario(name)
        }
    }

    if (config.scenarios.has('send_1to1')) {
        await runOne('send_1to1', () => scenarioSend1to1(client, contacts, config.messages))
    }
    if (config.scenarios.has('recv_1to1')) {
        await runOne('recv_1to1', () => scenarioRecv1to1(client, contacts, config.messages))
    }
    if (config.scenarios.has('send_group')) {
        await runOne('send_group', () => scenarioSendGroup(client, groups, config.messages))
    }
    if (config.scenarios.has('recv_group')) {
        await runOne('recv_group', () => scenarioRecvGroup(client, groups, config.messages))
    }
    return results
}

async function main(): Promise<void> {
    const argSet = new Set(process.argv.slice(2))
    const profiler = new BenchProfiler(readProfilerOptions(argSet))
    await profiler.start()

    const config = readConfig()
    const separateProcess = argSet.has('--separate-process')
    if (separateProcess) {
        console.log('(running fake server in separate process)')
    }
    printConfig(config)

    const { results, cleanup } = separateProcess
        ? await mainSeparateProcess(config, profiler, argSet)
        : await mainInProcess(config, profiler, argSet)

    try {
        if (argSet.has('--snapshot')) {
            await profiler.takeHeapSnapshot('end').catch((err) => console.error('[snapshot]', err))
        }
        await profiler.stop()
    } finally {
        await cleanup()
    }

    if (process.env.ZAPO_BENCH_JSON === '1') {
        console.log(
            JSON.stringify(
                results.map((r) => ({
                    name: r.name,
                    messages: r.messages,
                    elapsedMs: r.elapsedMs,
                    throughputMsgsPerSec: r.throughputMsgsPerSec,
                    avgMsPerMsg: r.avgMsPerMsg,
                    cpuTimeMs: r.cpuTimeMs,
                    cpuPercent: r.cpuPercent,
                    rssDeltaBytes: r.rssDeltaBytes,
                    heapDeltaBytes: r.heapDeltaBytes
                })),
                null,
                2
            )
        )
    }
}

void main().catch((err) => {
    console.error(err)
    process.exit(1)
})

// Best-effort: if an uncaught error escapes the main try/finally, the
// profiler.stop() in main() may not run. Wire a fallback so the user
// at least gets a partial CPU profile.
let _emergencyStopRan = false
async function _emergencyStop(label: string, err: unknown): Promise<void> {
    if (_emergencyStopRan) return
    _emergencyStopRan = true
    console.error(`[${label}]`, err)
    process.exit(1)
}
process.on('uncaughtException', (err) => {
    void _emergencyStop('uncaughtException', err)
})
process.on('unhandledRejection', (err) => {
    void _emergencyStop('unhandledRejection', err)
})
