/**
 * End-to-end retry bench driven through @zapo-js/fake-server.
 *
 * Exercises the full retry round-trip in BOTH directions, validated
 * against `WAWebRetryRequestParser` from the WhatsApp Web bundle.
 *
 *   - `incoming_retry`
 *       Fake peers ship a tampered ciphertext, the lib's signal decrypt
 *       fails, and the lib emits a `<receipt type="retry">` back to the
 *       sender. Measures throughput in retries/s of the detect+emit
 *       pipeline.
 *
 *   - `incoming_retry_recovery`
 *       Full incoming recovery loop: peer sends tampered ciphertext →
 *       lib emits retry receipt → bench observes the receipt → peer
 *       `replaySentMessage(id)` puts the original pristine ciphertext
 *       (same Signal counter + ratchet key) back on the wire → lib
 *       decrypts and emits `message`. Measures recoveries/s.
 *
 *   - `outbound_retry_replay`
 *       Full outbound replay loop: lib sends 1:1 message (pkmsg) → peer
 *       drains it → peer `rotateForRetry()` (rotates signed prekey +
 *       one-time prekey, resets ratchet) → peer sends
 *       `<receipt type="retry">` carrying the new `<keys>` block → lib
 *       tears down session, re-runs X3DH against the new keys, and
 *       re-emits the message as a fresh pkmsg → peer decrypts the
 *       resend via the rotated bundle. Measures replays/s.
 *
 * Tunables (env vars):
 *   ZAPO_BENCH_RETRY_MESSAGES         (default 100)
 *   ZAPO_BENCH_RETRY_SCENARIOS        (csv; default = all)
 *   ZAPO_BENCH_STORE                  (memory | sqlite | mysql | ...)
 *   ZAPO_BENCH_VERBOSE                (=1 to print lib warn/error)
 *   ZAPO_BENCH_JSON                   (=1 to also print as JSON)
 *
 * Profiling flags:
 *   --cpu / --heap / --snapshot / --per-scenario /
 *   --snapshot-per-scenario / --out-dir=<path>
 *   --separate-process    fake-server runs in a forked child
 *   --no-server-prof      skip profiling the server child (when --separate-process)
 *
 * Run with:
 *   node --expose-gc --import tsx \
 *     packages/fake-server/bench/retry.bench.ts
 */

import assert from 'node:assert/strict'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import type { FakePeer } from '../src/api/FakePeer'
import type { FakeWaServer, WaFakeConnectionPipeline } from '../src/api/FakeWaServer'
import type { BinaryNode } from '../src/transport/codec'

import {
    BenchProfiler,
    forceGcIfAvailable,
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

const ALL_SCENARIOS = new Set<string>([
    'incoming_retry',
    'incoming_retry_recovery',
    'outbound_retry_replay'
])

function readScenarioFilter(): ReadonlySet<string> {
    const raw = process.env.ZAPO_BENCH_RETRY_SCENARIOS
    if (!raw) return ALL_SCENARIOS
    const out = new Set<string>()
    for (const part of raw.split(',')) {
        const trimmed = part.trim()
        if (!trimmed) continue
        if (!ALL_SCENARIOS.has(trimmed)) {
            throw new Error(
                `unknown ZAPO_BENCH_RETRY_SCENARIOS entry "${trimmed}"; valid: ${[...ALL_SCENARIOS].join(',')}`
            )
        }
        out.add(trimmed)
    }
    return out
}

interface BenchConfig {
    readonly messages: number
    readonly scenarios: ReadonlySet<string>
}

function readConfig(): BenchConfig {
    return {
        messages: readPositiveIntEnv('ZAPO_BENCH_RETRY_MESSAGES', 100),
        scenarios: readScenarioFilter()
    }
}

function tamperLastByte(bytes: Uint8Array): Uint8Array {
    const out = new Uint8Array(bytes)
    out[out.byteLength - 1] ^= 0xff
    return out
}

function isRetryReceipt(stanza: BinaryNode): boolean {
    if (stanza.tag !== 'receipt') return false
    return stanza.attrs.type === 'retry'
}

// ─── In-process peer provisioning ─────────────────────────────────────

interface BenchPeer {
    readonly peer: FakePeer
    readonly jid: string
}

async function provisionPeers(
    server: FakeWaServer,
    pipeline: WaFakeConnectionPipeline,
    count: number,
    jidPrefix: string,
    options: { readonly enableReplayCache?: boolean } = {}
): Promise<readonly BenchPeer[]> {
    const out: BenchPeer[] = new Array(count)
    for (let i = 0; i < count; i += 1) {
        await ensurePreKeyPool(server, pipeline, 1)
        const jid = `5511${jidPrefix}${String(i).padStart(7, '0')}@s.whatsapp.net`
        const peer = await server.createFakePeer(
            { jid, enableReplayCache: options.enableReplayCache },
            pipeline
        )
        out[i] = { peer, jid }
    }
    return out
}

interface RpcBenchPeer {
    readonly peerId: string
    readonly jid: string
}

async function provisionPeersRpc(
    rpc: ServerRpc,
    count: number,
    jidPrefix: string,
    options: { readonly enableReplayCache?: boolean } = {}
): Promise<readonly RpcBenchPeer[]> {
    const out: RpcBenchPeer[] = new Array(count)
    for (let i = 0; i < count; i += 1) {
        await rpc.ensurePreKeyPool(1)
        const jid = `5511${jidPrefix}${String(i).padStart(7, '0')}@s.whatsapp.net`
        const { peerId } = await rpc.createFakePeer({
            jid,
            enableReplayCache: options.enableReplayCache
        })
        out[i] = { peerId, jid }
    }
    return out
}

// ─── incoming_retry ───────────────────────────────────────────────────

async function scenarioIncomingRetryInProcess(
    server: FakeWaServer,
    pipeline: WaFakeConnectionPipeline,
    profiler: BenchProfiler,
    config: BenchConfig
): Promise<ScenarioResult> {
    const peers = await provisionPeers(server, pipeline, config.messages, '9100')
    const name = 'incoming_retry'
    await profiler.beforeScenario(name)
    const result = await runScenario(
        name,
        config.messages,
        async () => {
            let received = 0
            const allReceived = new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => {
                    offCapture()
                    reject(new Error(`incoming_retry stalled at ${received}/${config.messages}`))
                }, 60_000)
                timer.unref?.()
                const offCapture = server.onCapturedStanza((stanza) => {
                    if (!isRetryReceipt(stanza)) return
                    received += 1
                    if (received >= config.messages) {
                        clearTimeout(timer)
                        offCapture()
                        resolve()
                    }
                })
            })
            const sends = peers.map(({ peer }, i) =>
                peer.sendConversation(`tampered ${i}`, {
                    id: `incoming-retry-${i}`,
                    tamperCiphertext: tamperLastByte
                })
            )
            await Promise.all(sends)
            await allReceived
        },
        'retries'
    )
    await profiler.afterScenario(name)
    return result
}

async function scenarioIncomingRetryRpc(
    rpc: ServerRpc,
    profiler: BenchProfiler,
    config: BenchConfig
): Promise<ScenarioResult> {
    const peers = await provisionPeersRpc(rpc, config.messages, '9100')
    const name = 'incoming_retry'
    await profiler.beforeScenario(name)
    const result = await runScenario(
        name,
        config.messages,
        async () => {
            const waitAll = rpc.waitForRetryReceipts(config.messages, 60_000)
            const sends = peers.map(({ peerId }, i) =>
                rpc.peerSendConversation(peerId, `tampered ${i}`, {
                    id: `incoming-retry-${i}`,
                    tamperMode: 'last-byte-xor-ff'
                })
            )
            await Promise.all(sends)
            await waitAll
        },
        'retries'
    )
    await profiler.afterScenario(name)
    return result
}

// ─── incoming_retry_recovery ──────────────────────────────────────────

async function scenarioIncomingRetryRecoveryInProcess(
    server: FakeWaServer,
    client: WaClient,
    pipeline: WaFakeConnectionPipeline,
    profiler: BenchProfiler,
    config: BenchConfig
): Promise<ScenarioResult> {
    const peers = await provisionPeers(server, pipeline, config.messages, '9200', {
        enableReplayCache: true
    })
    const name = 'incoming_retry_recovery'
    await profiler.beforeScenario(name)
    const result = await runScenario(
        name,
        config.messages,
        async () => {
            const expectedTexts = new Set<string>()
            for (let i = 0; i < config.messages; i += 1) {
                expectedTexts.add(`recovery-${i}`)
            }
            const { allRecovered, attachListener, detachListener } = buildRecoveryWaiter(
                client,
                expectedTexts,
                config.messages
            )
            attachListener()

            const replayTriggers = new Map<string, () => Promise<void>>()
            const offCapture = server.onCapturedStanza((stanza) => {
                if (!isRetryReceipt(stanza)) return
                const id = stanza.attrs.id
                if (!id) return
                const trigger = replayTriggers.get(id)
                if (!trigger) return
                replayTriggers.delete(id)
                void trigger()
            })

            try {
                const flows = peers.map(async ({ peer }, i) => {
                    const id = `recovery-retry-${i}`
                    const replayed = new Promise<void>((resolve, reject) => {
                        const t = setTimeout(() => {
                            replayTriggers.delete(id)
                            reject(new Error(`recovery: no retry receipt for ${id}`))
                        }, 60_000)
                        t.unref?.()
                        replayTriggers.set(id, async () => {
                            clearTimeout(t)
                            try {
                                await peer.replaySentMessage(id, { resendId: `${id}-replay` })
                                resolve()
                            } catch (err) {
                                reject(err as Error)
                            }
                        })
                    })
                    await peer.sendConversation(`recovery-${i}`, {
                        id,
                        tamperCiphertext: tamperLastByte
                    })
                    await replayed
                })
                await Promise.all(flows)
                await allRecovered
            } finally {
                offCapture()
                detachListener()
            }
        },
        'recoveries'
    )
    await profiler.afterScenario(name)
    return result
}

async function scenarioIncomingRetryRecoveryRpc(
    rpc: ServerRpc,
    client: WaClient,
    profiler: BenchProfiler,
    config: BenchConfig
): Promise<ScenarioResult> {
    const peers = await provisionPeersRpc(rpc, config.messages, '9200', {
        enableReplayCache: true
    })
    const name = 'incoming_retry_recovery'
    await profiler.beforeScenario(name)
    const result = await runScenario(
        name,
        config.messages,
        async () => {
            const expectedTexts = new Set<string>()
            for (let i = 0; i < config.messages; i += 1) {
                expectedTexts.add(`recovery-${i}`)
            }
            const { allRecovered, attachListener, detachListener } = buildRecoveryWaiter(
                client,
                expectedTexts,
                config.messages
            )
            attachListener()
            try {
                const flows = peers.map(async ({ peerId }, i) => {
                    const id = `recovery-retry-${i}`
                    const receiptPromise = rpc.waitForRetryReceipt(id, 60_000)
                    await rpc.peerSendConversation(peerId, `recovery-${i}`, {
                        id,
                        tamperMode: 'last-byte-xor-ff'
                    })
                    await receiptPromise
                    await rpc.peerReplaySentMessage(peerId, id, { resendId: `${id}-replay` })
                })
                await Promise.all(flows)
                await allRecovered
            } finally {
                detachListener()
            }
        },
        'recoveries'
    )
    await profiler.afterScenario(name)
    return result
}

function buildRecoveryWaiter(
    client: WaClient,
    expectedTexts: Set<string>,
    target: number
): {
    readonly allRecovered: Promise<void>
    readonly attachListener: () => void
    readonly detachListener: () => void
} {
    let recovered = 0
    let listener: WaClientEventMap['message'] | null = null
    let resolveAll: (() => void) | null = null
    let rejectAll: ((err: Error) => void) | null = null
    let timer: NodeJS.Timeout | null = null
    const allRecovered = new Promise<void>((resolve, reject) => {
        resolveAll = resolve
        rejectAll = reject
    })
    const attachListener = (): void => {
        timer = setTimeout(() => {
            if (listener) client.off('message', listener)
            rejectAll?.(new Error(`incoming_retry_recovery stalled at ${recovered}/${target}`))
        }, 120_000)
        timer.unref?.()
        listener = (event) => {
            const text = event.message?.conversation
            if (typeof text !== 'string') return
            if (!expectedTexts.has(text)) return
            expectedTexts.delete(text)
            recovered += 1
            if (recovered >= target) {
                if (timer) clearTimeout(timer)
                if (listener) client.off('message', listener)
                resolveAll?.()
            }
        }
        client.on('message', listener)
    }
    const detachListener = (): void => {
        if (timer) clearTimeout(timer)
        if (listener) client.off('message', listener)
    }
    return { allRecovered, attachListener, detachListener }
}

// ─── outbound_retry_replay ────────────────────────────────────────────

async function scenarioOutboundRetryReplayInProcess(
    server: FakeWaServer,
    client: WaClient,
    pipeline: WaFakeConnectionPipeline,
    profiler: BenchProfiler,
    config: BenchConfig
): Promise<ScenarioResult> {
    const peers = await provisionPeers(server, pipeline, config.messages, '9300')
    interface Pending {
        readonly peer: FakePeer
        readonly originalMsgId: string
        readonly expectedPlaintext: string
    }
    const pending: Pending[] = []
    for (let i = 0; i < config.messages; i += 1) {
        const { peer, jid } = peers[i]
        const plaintext = `replay-target-${i}`
        const receivedPromise = peer.expectMessage({ timeoutMs: 30_000 })
        const result = await client.message.send(jid, { conversation: plaintext })
        const received = await receivedPromise
        assert.equal(received.message.conversation, plaintext, 'initial drain plaintext mismatch')
        pending.push({ peer, originalMsgId: result.id, expectedPlaintext: plaintext })
    }

    const name = 'outbound_retry_replay'
    await profiler.beforeScenario(name)
    const result = await runScenario(
        name,
        config.messages,
        async () => {
            await Promise.all(pending.map(({ peer }) => peer.rotateForRetry()))
            const drains = pending.map(({ peer, expectedPlaintext }, i) =>
                peer.expectMessage({ timeoutMs: 60_000 }).then((received) => {
                    assert.equal(
                        received.encType,
                        'pkmsg',
                        `replay ${i}: expected pkmsg, got ${received.encType}`
                    )
                    assert.equal(
                        received.message.conversation,
                        expectedPlaintext,
                        `replay ${i}: plaintext mismatch`
                    )
                })
            )
            const requests = pending.map(({ peer, originalMsgId }) =>
                peer.sendRetryReceipt(originalMsgId, { includeKeys: true })
            )
            await Promise.all(requests)
            await Promise.all(drains)
        },
        'replays'
    )
    await profiler.afterScenario(name)
    return result
}

async function scenarioOutboundRetryReplayRpc(
    rpc: ServerRpc,
    client: WaClient,
    profiler: BenchProfiler,
    config: BenchConfig
): Promise<ScenarioResult> {
    const peers = await provisionPeersRpc(rpc, config.messages, '9300')
    interface Pending {
        readonly peerId: string
        readonly originalMsgId: string
        readonly expectedPlaintext: string
    }
    const pending: Pending[] = []
    for (let i = 0; i < config.messages; i += 1) {
        const { peerId, jid } = peers[i]
        const plaintext = `replay-target-${i}`
        const receivedPromise = rpc.peerExpectMessage(peerId, 30_000)
        const result = await client.message.send(jid, { conversation: plaintext })
        const received = await receivedPromise
        assert.equal(received.conversation, plaintext, 'initial drain plaintext mismatch')
        pending.push({ peerId, originalMsgId: result.id, expectedPlaintext: plaintext })
    }

    const name = 'outbound_retry_replay'
    await profiler.beforeScenario(name)
    const result = await runScenario(
        name,
        config.messages,
        async () => {
            await Promise.all(pending.map(({ peerId }) => rpc.peerRotateForRetry(peerId)))
            const drains = pending.map(({ peerId, expectedPlaintext }, i) =>
                rpc.peerExpectMessage(peerId, 60_000).then((received) => {
                    assert.equal(
                        received.encType,
                        'pkmsg',
                        `replay ${i}: expected pkmsg, got ${received.encType}`
                    )
                    assert.equal(
                        received.conversation,
                        expectedPlaintext,
                        `replay ${i}: plaintext mismatch`
                    )
                })
            )
            const requests = pending.map(({ peerId, originalMsgId }) =>
                rpc.peerSendRetryReceipt(peerId, originalMsgId, { includeKeys: true })
            )
            await Promise.all(requests)
            await Promise.all(drains)
        },
        'replays'
    )
    await profiler.afterScenario(name)
    return result
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

    console.log('zapo-js retry bench')
    console.log('───────────────────')
    console.log(`  messages/scenario : ${config.messages}`)
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
    const fixture = await bringUpPairedClient(storeFixture, { sessionId: 'zapo-bench-retry' })
    const { server, client, pipeline } = fixture
    try {
        if (config.scenarios.has('incoming_retry')) {
            const r = await scenarioIncomingRetryInProcess(server, pipeline, profiler, config)
            aggregated.push(r)
            printResult(r)
            forceGcIfAvailable()
        }
        if (config.scenarios.has('incoming_retry_recovery')) {
            const r = await scenarioIncomingRetryRecoveryInProcess(
                server,
                client,
                pipeline,
                profiler,
                config
            )
            aggregated.push(r)
            printResult(r)
            forceGcIfAvailable()
        }
        if (config.scenarios.has('outbound_retry_replay')) {
            const r = await scenarioOutboundRetryReplayInProcess(
                server,
                client,
                pipeline,
                profiler,
                config
            )
            aggregated.push(r)
            printResult(r)
            forceGcIfAvailable()
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
    const fixture = await bringUpPairedClientViaRpc(storeFixture, { sessionId: 'zapo-bench-retry' })
    const { rpc, client } = fixture
    try {
        await startServerProfilingIfRequested(rpc, profiler.options, argSet)
        await takeServerSnapshotIfRequested(rpc, 'server-pre', profiler.options, argSet)

        if (config.scenarios.has('incoming_retry')) {
            const r = await scenarioIncomingRetryRpc(rpc, profiler, config)
            aggregated.push(r)
            printResult(r)
            forceGcIfAvailable()
        }
        if (config.scenarios.has('incoming_retry_recovery')) {
            const r = await scenarioIncomingRetryRecoveryRpc(rpc, client, profiler, config)
            aggregated.push(r)
            printResult(r)
            forceGcIfAvailable()
        }
        if (config.scenarios.has('outbound_retry_replay')) {
            const r = await scenarioOutboundRetryReplayRpc(rpc, client, profiler, config)
            aggregated.push(r)
            printResult(r)
            forceGcIfAvailable()
        }

        await takeServerSnapshotIfRequested(rpc, 'server-post', profiler.options, argSet)
    } finally {
        await stopServerProfilingIfRequested(rpc, profiler.options, argSet).catch(() => undefined)
        await teardownRpcFixture(fixture)
    }
}

void main().catch((err) => {
    console.error(err)
    process.exit(1)
})
