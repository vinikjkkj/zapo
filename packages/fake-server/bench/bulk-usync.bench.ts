/**
 * Bulk USync bench: exercises the lib's device-list refresh + first-send
 * fanout path. Each scenario builds a fresh group with N members (each
 * with K devices), then times the FIRST message send – which forces the
 * lib to:
 *   1. USync the entire member list (1 IQ, ~N JIDs)
 *   2. Fetch missing prekey bundles (1 IQ per missing device)
 *   3. Run X3DH for every device (parallel)
 *   4. Build + ship sender-key distribution + the encrypted message
 *
 * Compared to the steady-state SEND-group bench, this isolates the
 * cold path (no cached device list, no existing Signal session) which
 * exercises USync parse + device-list store + Signal session init
 * heavily.
 *
 * Tunables:
 *   ZAPO_BENCH_USYNC_SIZES   csv (default "50,200,500")
 *   ZAPO_BENCH_USYNC_DEVICES (default 1) devices per member
 *
 * Profiling flags: same as messaging.bench. With --separate-process
 * the fake server runs in a forked child and gets its own
 * cpu-server-* / snapshot-server-* outputs.
 */

import { performance } from 'node:perf_hooks'

import {
    BenchProfiler,
    forceGcIfAvailable,
    formatMs,
    installEmergencyStop,
    maybePrintJson,
    printResult,
    readCsvEnv,
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

async function runUsyncScenarioInProcess(
    memberCount: number,
    devicesPerMember: number,
    profiler: BenchProfiler,
    iteration: number
): Promise<ScenarioResult> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClient(storeFixture, {
        sessionId: `bench-usync-${memberCount}-${iteration}`
    })
    const { server, client, pipeline } = fixture

    const groupJid = `120363${String(900_000_500_000 + iteration).padStart(15, '0')}@g.us`
    const members = []
    const deviceIds = Array.from({ length: devicesPerMember }, (_, idx) => idx + 1)
    for (let m = 0; m < memberCount; m += 1) {
        await ensurePreKeyPool(server, pipeline, devicesPerMember)
        const jid = `5511${String(8_500_000_000 + iteration * 100_000 + m).padStart(10, '0')}@s.whatsapp.net`
        const peers = await server.createFakePeerWithDevices({ userJid: jid, deviceIds }, pipeline)
        members.push(peers[0])
    }
    server.createFakeGroup({
        groupJid,
        subject: `Bench USync Group ${iteration}`,
        participants: members
    })

    const scenarioName = `usync_${memberCount}members_${devicesPerMember}dev`
    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            memberCount * devicesPerMember,
            async () => {
                await client.message.send(groupJid, { conversation: 'bulk-usync first send' })
            },
            'devices'
        )
        await profiler.afterScenario(scenarioName)
        return result
    } finally {
        await teardownFixture(fixture)
        forceGcIfAvailable()
    }
}

async function runUsyncScenarioRpc(
    memberCount: number,
    devicesPerMember: number,
    profiler: BenchProfiler,
    iteration: number,
    argSet: ReadonlySet<string>
): Promise<ScenarioResult> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClientViaRpc(storeFixture, {
        sessionId: `bench-usync-${memberCount}-${iteration}`
    })
    const { rpc, client } = fixture
    await startServerProfilingIfRequested(rpc, profiler.options, argSet)
    await takeServerSnapshotIfRequested(rpc, `server-pre-${memberCount}m`, profiler.options, argSet)

    const groupJid = `120363${String(900_000_500_000 + iteration).padStart(15, '0')}@g.us`
    const deviceIds = Array.from({ length: devicesPerMember }, (_, idx) => idx + 1)
    const memberPeerIds: string[] = []
    for (let m = 0; m < memberCount; m += 1) {
        await rpc.ensurePreKeyPool(devicesPerMember)
        const jid = `5511${String(8_500_000_000 + iteration * 100_000 + m).padStart(10, '0')}@s.whatsapp.net`
        const result = await rpc.createFakePeerWithDevices({ userJid: jid, deviceIds })
        memberPeerIds.push(result.devicePeerIds[0])
    }
    await rpc.createFakeGroup({
        groupJid,
        subject: `Bench USync Group ${iteration}`,
        participantPeerIds: memberPeerIds
    })

    const scenarioName = `usync_${memberCount}members_${devicesPerMember}dev`
    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            memberCount * devicesPerMember,
            async () => {
                await client.message.send(groupJid, { conversation: 'bulk-usync first send' })
            },
            'devices'
        )
        await profiler.afterScenario(scenarioName)
        await takeServerSnapshotIfRequested(
            rpc,
            `server-post-${memberCount}m`,
            profiler.options,
            argSet
        )
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

    const sizes = readCsvEnv('ZAPO_BENCH_USYNC_SIZES', ['50', '200', '500']).map((s) => {
        const n = Number.parseInt(s, 10)
        if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid size "${s}"`)
        return n
    })
    const devicesPerMember = readPositiveIntEnv('ZAPO_BENCH_USYNC_DEVICES', 1)
    const backendName = process.env.ZAPO_BENCH_STORE ?? 'memory'
    const separate = argSet.has('--separate-process')

    console.log('zapo-js bulk-usync bench')
    console.log('────────────────────────')
    console.log(`  member counts  : ${sizes.join(', ')}`)
    console.log(`  devices/member : ${devicesPerMember}`)
    console.log(`  store          : ${backendName}`)
    console.log(`  mode           : ${separate ? 'separate-process' : 'in-process'}`)
    console.log('')

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('start').catch((err) => console.error('[snapshot]', err))
    }

    const results: ScenarioResult[] = []
    for (let i = 0; i < sizes.length; i += 1) {
        const memberCount = sizes[i]
        const setupStart = performance.now()
        console.log(`▶ running ${memberCount} members × ${devicesPerMember} devices...`)
        const result = separate
            ? await runUsyncScenarioRpc(memberCount, devicesPerMember, profiler, i, argSet)
            : await runUsyncScenarioInProcess(memberCount, devicesPerMember, profiler, i)
        console.log(`  (full run incl. fixture build: ${formatMs(performance.now() - setupStart)})`)
        results.push(result)
        printResult(result)
    }

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
