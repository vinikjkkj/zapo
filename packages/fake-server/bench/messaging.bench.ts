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
 * Run with:
 *   npm --workspace=@zapo-js/fake-server run bench:messaging
 * or:
 *   node --expose-gc --import tsx packages/fake-server/bench/messaging.bench.ts
 */

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
    warn: () => {},
    error: () => {}
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

// ─── Configuration ────────────────────────────────────────────────────

interface BenchConfig {
    readonly contacts: number
    readonly contactDevices: number
    readonly groups: number
    readonly groupMembers: number
    readonly messages: number
    readonly scenarios: ReadonlySet<string>
}

const ALL_SCENARIOS = new Set([
    'send_1to1',
    'recv_1to1',
    'send_group',
    'recv_group'
])

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
        }
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
): Promise<readonly ContactFixture[]> {
    const out: ContactFixture[] = []
    const deviceIds = Array.from({ length: devicesPerContact }, (_, idx) => idx + 1)
    for (let i = 0; i < count; i += 1) {
        const userJid = `5511${String(7_000_000_000 + i).padStart(10, '0')}@s.whatsapp.net`
        const devices = await server.createFakePeerWithDevices(
            { userJid, deviceIds, skipOneTimePreKey: true },
            pipeline
        )
        out.push({ userJid, devices })
    }
    return out
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
): Promise<readonly GroupFixture[]> {
    const out: GroupFixture[] = []
    let memberCursor = 0
    for (let g = 0; g < groupCount; g += 1) {
        const groupJid = `120363${String(900_000_000_000 + g).padStart(15, '0')}@g.us`
        const members: FakePeer[] = []
        for (let m = 0; m < memberCount; m += 1) {
            const memberJid = `5511${String(8_000_000_000 + memberCursor).padStart(10, '0')}@s.whatsapp.net`
            memberCursor += 1
            const peer = await server.createFakePeer(
                { jid: memberJid, skipOneTimePreKey: true },
                pipeline
            )
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
    contacts: readonly ContactFixture[],
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
    contacts: readonly ContactFixture[],
    messages: number
): Promise<ScenarioResult> {
    // Bucket the message count across contacts so each peer sends its
    // share SERIALLY (no concurrent X3DH per peer); buckets across
    // peers run in parallel.
    const buckets = bucketize(messages, contacts.length)
    return runScenario('RECV 1:1', messages, async () => {
        let received = 0
        const done = new Promise<void>((resolve) => {
            const listener: WaClientEventMap['message'] = () => {
                received += 1
                if (received >= messages) {
                    client.off('message', listener)
                    resolve()
                }
            }
            client.on('message', listener)
        })
        const peerSendChains = contacts.map(async (contact, contactIdx) => {
            const count = buckets[contactIdx]
            const sender = contact.devices[0]
            for (let n = 0; n < count; n += 1) {
                await sender.sendConversation(`bench recv ${contactIdx}-${n}`)
            }
        })
        await Promise.all(peerSendChains)
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
    groups: readonly GroupFixture[],
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
    groups: readonly GroupFixture[],
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
    console.log(
        `  throughput        : ${formatFixed(result.throughputMsgsPerSec, 1)} msg/s`
    )
    console.log(`  avg / msg         : ${formatMs(result.avgMsPerMsg)}`)
    console.log(`  CPU time          : ${formatMs(result.cpuTimeMs)}`)
    console.log(`  CPU %             : ${formatFixed(result.cpuPercent, 1)}`)
    console.log(`  RSS before        : ${formatMiB(result.rssBeforeBytes)}`)
    console.log(`  RSS after         : ${formatMiB(result.rssAfterBytes)}`)
    console.log(`  RSS delta         : ${formatMiB(result.rssDeltaBytes)}`)
    console.log(`  heap delta        : ${formatMiB(result.heapDeltaBytes)}`)
    console.log('')
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const config = readConfig()
    printConfig(config)

    const setupStart = performance.now()
    const fixture = await bringUpPairedClient()
    console.log(`paired in ${formatMs(performance.now() - setupStart)}`)

    let contacts: readonly ContactFixture[] = []
    let groups: readonly GroupFixture[] = []

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
            )}`
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
            )}`
        )
    }
    console.log('')

    const results: ScenarioResult[] = []
    try {
        if (config.scenarios.has('send_1to1')) {
            const r = await scenarioSend1to1(fixture.client, contacts, config.messages)
            results.push(r)
            printResult(r)
        }
        if (config.scenarios.has('recv_1to1')) {
            const r = await scenarioRecv1to1(fixture.client, contacts, config.messages)
            results.push(r)
            printResult(r)
        }
        if (config.scenarios.has('send_group')) {
            const r = await scenarioSendGroup(fixture.client, groups, config.messages)
            results.push(r)
            printResult(r)
        }
        if (config.scenarios.has('recv_group')) {
            const r = await scenarioRecvGroup(fixture.client, groups, config.messages)
            results.push(r)
            printResult(r)
        }
    } finally {
        await fixture.client.disconnect().catch(() => undefined)
        await fixture.server.stop()
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
