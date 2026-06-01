/**
 * App-state bench: measures both directions of app-state sync.
 *
 *   appstate_outgoing – N successive `client.chat.setChatMute(...)` calls,
 *                       each shipped as an encrypted patch (HMAC + AES
 *                       + protobuf encode + upload). Throughput =
 *                       patches/sec.
 *   appstate_incoming – server pushes ONE external `md-app-state`
 *                       snapshot containing N mutations; we measure how
 *                       fast the lib decrypts, verifies the HMAC chain,
 *                       and emits `mutation` events.
 *
 * Tunables:
 *   ZAPO_BENCH_APPSTATE_OUTGOING  (default 200)
 *   ZAPO_BENCH_APPSTATE_INCOMING  (default 500)
 *
 * Profiling flags: same as messaging.bench. With --separate-process
 * the fake server runs in a forked child and gets its own profiles.
 * In that mode the FakeAppStateCollection (HMAC chain + encrypted
 * snapshot build) ALSO runs in the child, which is the whole point –
 * we want to isolate the lib's decrypt/verify cost from the
 * server-side encrypt cost.
 */

import { randomBytes } from 'node:crypto'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { buildExternalBlobReference } from '../src/protocol/iq/appstate-sync'
import { FakeAppStateCollection } from '../src/state/fake-app-state-collection'

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
    teardownFixture,
    teardownRpcFixture
} from './_fixtures'
import { buildBenchStore } from './_store-factory'

type WaMutationEvent = Parameters<WaClientEventMap['mutation']>[0]

function waitForMutationCount(
    client: WaClient,
    needed: number,
    predicate: (event: WaMutationEvent) => boolean,
    timeoutMs: number
): Promise<number> {
    return new Promise((resolve, reject) => {
        let count = 0
        const timer = setTimeout(
            () => reject(new Error(`only saw ${count}/${needed} matching mutations`)),
            timeoutMs
        )
        const listener: WaClientEventMap['mutation'] = (event) => {
            if (!predicate(event)) return
            count += 1
            if (count >= needed) {
                clearTimeout(timer)
                client.off('mutation', listener)
                resolve(count)
            }
        }
        client.on('mutation', listener)
    })
}

function buildSeedMutation(version: number) {
    return {
        operation: 'set' as const,
        index: JSON.stringify(['mute', '5511555555555@s.whatsapp.net']),
        value: { timestamp: Date.now(), muteAction: { muted: false } },
        version
    }
}

function buildIncomingMutations(count: number) {
    const muteEnd = Date.now() + 60 * 60 * 1_000
    const out = []
    for (let i = 0; i < count; i += 1) {
        const jid = `5511${String(7_200_000_000 + i).padStart(10, '0')}@s.whatsapp.net`
        out.push({
            operation: 'set' as const,
            index: JSON.stringify(['mute', jid]),
            value: {
                timestamp: Date.now() - count + i,
                muteAction: { muted: true, muteEndTimestamp: muteEnd }
            },
            version: 2 + i
        })
    }
    return out
}

// ─── in-process scenarios ────────────────────────────────────────────

async function runOutgoingScenarioInProcess(
    ops: number,
    profiler: BenchProfiler
): Promise<ScenarioResult> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClient(storeFixture, {
        sessionId: 'bench-appstate-out'
    })
    const { server, client, pipeline } = fixture

    const syncKeyId = new Uint8Array(randomBytes(16))
    const syncKeyData = new Uint8Array(randomBytes(32))
    server.registerAppStateSyncKey(syncKeyId, syncKeyData)

    const seedCollection = new FakeAppStateCollection({
        name: 'regular_high',
        keyId: syncKeyId,
        keyData: syncKeyData
    })
    await seedCollection.applyMutation(buildSeedMutation(2))
    const bootstrapPatch = await seedCollection.encodePendingPatch()
    const bootstrapVersion = seedCollection.version

    let bootstrapShipped = false
    server.provideAppStateCollection('regular_high', () => {
        if (bootstrapShipped) {
            return { name: 'regular_high', version: bootstrapVersion }
        }
        bootstrapShipped = true
        return {
            name: 'regular_high',
            version: bootstrapVersion,
            patches: [bootstrapPatch]
        }
    })

    const peer = await server.createFakePeer(
        { jid: '5511888888888@s.whatsapp.net', displayName: 'Primary Device' },
        pipeline
    )

    const bootstrapApplied = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('bootstrap mutation never applied')),
            10_000
        )
        const handler: WaClientEventMap['mutation'] = (event) => {
            if (event.schema === 'Mute' && event.operation === 'set') {
                clearTimeout(timer)
                client.off('mutation', handler)
                resolve()
            }
        }
        client.on('mutation', handler)
    })

    await peer.sendAppStateSyncKeyShare({
        keys: [{ keyId: syncKeyId, keyData: syncKeyData, timestamp: Date.now() }]
    })
    await bootstrapApplied

    const scenarioName = 'appstate_outgoing'
    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            ops,
            async () => {
                const muteEnd = Date.now() + 60 * 60 * 1_000
                for (let i = 0; i < ops; i += 1) {
                    const chatJid = `5511${String(7_400_000_000 + i).padStart(10, '0')}@s.whatsapp.net`
                    await client.chat.setChatMute(chatJid, true, muteEnd)
                }
            },
            'patches'
        )
        await profiler.afterScenario(scenarioName)
        return result
    } finally {
        await teardownFixture(fixture)
        forceGcIfAvailable()
    }
}

async function runIncomingScenarioInProcess(
    mutations: number,
    profiler: BenchProfiler
): Promise<ScenarioResult> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClient(storeFixture, {
        sessionId: 'bench-appstate-in',
        emitSnapshotMutations: true
    })
    const { server, client, pipeline } = fixture

    const syncKeyId = new Uint8Array(randomBytes(16))
    const syncKeyData = new Uint8Array(randomBytes(32))

    const collection = new FakeAppStateCollection({
        name: 'regular_high',
        keyId: syncKeyId,
        keyData: syncKeyData
    })
    for (const m of buildIncomingMutations(mutations)) {
        await collection.applyMutation(m)
    }
    const snapshotBytes = await collection.encodeSnapshot()
    const snapshotVersion = collection.version

    const mediaBlob = await server.publishMediaBlob({
        mediaType: 'md-app-state',
        plaintext: snapshotBytes
    })

    let snapshotShipped = false
    server.provideAppStateCollection('regular_high', () => {
        if (snapshotShipped) return { name: 'regular_high', version: snapshotVersion }
        snapshotShipped = true
        return {
            name: 'regular_high',
            version: snapshotVersion,
            snapshot: buildExternalBlobReference({
                mediaKey: mediaBlob.mediaKey,
                directPath: server.mediaUrl(mediaBlob.path),
                fileSha256: mediaBlob.fileSha256,
                fileEncSha256: mediaBlob.fileEncSha256,
                fileSizeBytes: mediaBlob.fileLength
            })
        }
    })

    const peer = await server.createFakePeer(
        { jid: '5511888888888@s.whatsapp.net', displayName: 'Primary Device' },
        pipeline
    )

    const scenarioName = 'appstate_incoming'
    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            mutations,
            async () => {
                const allMutationsSeen = waitForMutationCount(
                    client,
                    mutations,
                    (event) => event.schema === 'Mute' && event.operation === 'set',
                    180_000
                )
                await peer.sendAppStateSyncKeyShare({
                    keys: [{ keyId: syncKeyId, keyData: syncKeyData, timestamp: Date.now() }]
                })
                await allMutationsSeen
            },
            'mutations'
        )
        await profiler.afterScenario(scenarioName)
        return result
    } finally {
        await teardownFixture(fixture)
        forceGcIfAvailable()
    }
}

// ─── separate-process scenarios ───────────────────────────────────────

async function runOutgoingScenarioRpc(
    ops: number,
    profiler: BenchProfiler,
    argSet: ReadonlySet<string>
): Promise<ScenarioResult> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClientViaRpc(storeFixture, {
        sessionId: 'bench-appstate-out'
    })
    const { rpc, client } = fixture
    await startServerProfilingIfRequested(rpc, profiler.options, argSet)
    await takeServerSnapshotIfRequested(rpc, 'server-pre-outgoing', profiler.options, argSet)

    const syncKeyId = new Uint8Array(randomBytes(16))
    const syncKeyData = new Uint8Array(randomBytes(32))

    // Set up bootstrap entirely on the server side – the
    // FakeAppStateCollection encrypt cost stays out of the lib profile.
    await rpc.setupAppStateBootstrap({
        name: 'regular_high',
        syncKeyId,
        syncKeyData,
        mutation: buildSeedMutation(2)
    })
    const peer = await rpc.createFakePeer({ jid: '5511888888888@s.whatsapp.net' })

    const bootstrapApplied = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('bootstrap mutation never applied')),
            10_000
        )
        const handler: WaClientEventMap['mutation'] = (event) => {
            if (event.schema === 'Mute' && event.operation === 'set') {
                clearTimeout(timer)
                client.off('mutation', handler)
                resolve()
            }
        }
        client.on('mutation', handler)
    })

    await rpc.peerSendAppStateSyncKeyShare({
        peerId: peer.peerId,
        keys: [{ keyId: syncKeyId, keyData: syncKeyData, timestamp: Date.now() }]
    })
    await bootstrapApplied

    const scenarioName = 'appstate_outgoing'
    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            ops,
            async () => {
                const muteEnd = Date.now() + 60 * 60 * 1_000
                for (let i = 0; i < ops; i += 1) {
                    const chatJid = `5511${String(7_400_000_000 + i).padStart(10, '0')}@s.whatsapp.net`
                    await client.chat.setChatMute(chatJid, true, muteEnd)
                }
            },
            'patches'
        )
        await profiler.afterScenario(scenarioName)
        await takeServerSnapshotIfRequested(rpc, 'server-post-outgoing', profiler.options, argSet)
        await stopServerProfilingIfRequested(rpc, profiler.options, argSet)
        return result
    } finally {
        await teardownRpcFixture(fixture)
        forceGcIfAvailable()
    }
}

async function runIncomingScenarioRpc(
    mutations: number,
    profiler: BenchProfiler,
    argSet: ReadonlySet<string>
): Promise<ScenarioResult> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClientViaRpc(storeFixture, {
        sessionId: 'bench-appstate-in',
        emitSnapshotMutations: true
    })
    const { rpc, client } = fixture
    await startServerProfilingIfRequested(rpc, profiler.options, argSet)
    await takeServerSnapshotIfRequested(rpc, 'server-pre-incoming', profiler.options, argSet)

    const syncKeyId = new Uint8Array(randomBytes(16))
    const syncKeyData = new Uint8Array(randomBytes(32))

    await rpc.setupAppStateExternalSnapshot({
        name: 'regular_high',
        syncKeyId,
        syncKeyData,
        mutations: buildIncomingMutations(mutations)
    })
    const peer = await rpc.createFakePeer({ jid: '5511888888888@s.whatsapp.net' })

    const scenarioName = 'appstate_incoming'
    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            mutations,
            async () => {
                const allMutationsSeen = waitForMutationCount(
                    client,
                    mutations,
                    (event) => event.schema === 'Mute' && event.operation === 'set',
                    180_000
                )
                await rpc.peerSendAppStateSyncKeyShare({
                    peerId: peer.peerId,
                    keys: [{ keyId: syncKeyId, keyData: syncKeyData, timestamp: Date.now() }]
                })
                await allMutationsSeen
            },
            'mutations'
        )
        await profiler.afterScenario(scenarioName)
        await takeServerSnapshotIfRequested(rpc, 'server-post-incoming', profiler.options, argSet)
        await stopServerProfilingIfRequested(rpc, profiler.options, argSet)
        return result
    } finally {
        await teardownRpcFixture(fixture)
        forceGcIfAvailable()
    }
}

async function main(): Promise<void> {
    installEmergencyStop()
    const argSet = new Set(process.argv.slice(2))
    const profiler = new BenchProfiler(readProfilerOptions(argSet))
    await profiler.start()

    const outgoingOps = readPositiveIntEnv('ZAPO_BENCH_APPSTATE_OUTGOING', 200)
    const incomingOps = readPositiveIntEnv('ZAPO_BENCH_APPSTATE_INCOMING', 500)
    const backendName = process.env.ZAPO_BENCH_STORE ?? 'memory'
    const separate = argSet.has('--separate-process')

    console.log('zapo-js appstate bench')
    console.log('──────────────────────')
    console.log(`  outgoing patches  : ${outgoingOps}`)
    console.log(`  incoming mutations: ${incomingOps}`)
    console.log(`  store             : ${backendName}`)
    console.log(`  mode              : ${separate ? 'separate-process' : 'in-process'}`)
    console.log('')

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('start').catch((err) => console.error('[snapshot]', err))
    }

    const results: ScenarioResult[] = []
    const out = separate
        ? await runOutgoingScenarioRpc(outgoingOps, profiler, argSet)
        : await runOutgoingScenarioInProcess(outgoingOps, profiler)
    results.push(out)
    printResult(out)

    const inc = separate
        ? await runIncomingScenarioRpc(incomingOps, profiler, argSet)
        : await runIncomingScenarioInProcess(incomingOps, profiler)
    results.push(inc)
    printResult(inc)

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('end').catch((err) => console.error('[snapshot]', err))
    }
    await profiler.stop()

    maybePrintJson(results)
}

void main().catch((err) => {
    console.error(err)
    process.exit(1)
})
