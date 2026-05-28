/**
 * Group provisioning bench: measures the IQ round-trip cost of creating
 * groups + adding participants. Exercises the retry-tracker, IQ
 * orchestration, group-metadata store, and (indirectly) the sender-key
 * fanout that follows.
 *
 * Two scenarios per run:
 *   create_group   – N successive `createGroup(name, jids[K])` calls
 *   add_participants – 1 group, N successive `addParticipants(group, [jid])`
 *                      calls (per-jid, sequential)
 *
 * Tunables:
 *   ZAPO_BENCH_GROUP_OPS         (default 100)  ops per scenario
 *   ZAPO_BENCH_GROUP_MEMBERS_PER_CREATE (default 5) jids per group on create
 *
 * Profiling flags: same as messaging.bench. With --separate-process
 * the fake server runs in a forked child and gets its own profiles.
 */

import type { FakeWaServer } from '../src/api/FakeWaServer'
import { buildIqResult } from '../src/protocol/iq/router'
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
    teardownFixture,
    teardownRpcFixture
} from './_fixtures'
import { buildBenchStore } from './_store-factory'

function findChild(node: BinaryNode, tag: string): BinaryNode | undefined {
    if (!Array.isArray(node.content)) return undefined
    return node.content.find((child) => child.tag === tag)
}

function attachGroupHandlersInProcess(server: FakeWaServer): void {
    server.registerIqHandler(
        { xmlns: 'w:g2', type: 'set', childTag: 'create' },
        (iq) => {
            const create = findChild(iq, 'create')
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
                const actionNode = findChild(iq, action)
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

interface GroupBenchConfig {
    readonly ops: number
    readonly membersPerCreate: number
}

type GroupCreateResult = { id?: string; jid?: string }

function extractGroupJid(result: unknown): string {
    const r = result as GroupCreateResult
    return r.id ?? r.jid ?? ''
}

// ─── in-process scenarios ────────────────────────────────────────────

async function runCreateGroupScenarioInProcess(
    config: GroupBenchConfig,
    profiler: BenchProfiler
): Promise<ScenarioResult> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClient(storeFixture, { sessionId: 'bench-group-create' })
    const { server, client } = fixture
    attachGroupHandlersInProcess(server)

    const scenarioName = 'create_group'
    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            config.ops,
            async () => {
                for (let i = 0; i < config.ops; i += 1) {
                    const jids = Array.from(
                        { length: config.membersPerCreate },
                        (_, k) =>
                            `5511${String(7_700_000_000 + i * 10_000 + k).padStart(10, '0')}@s.whatsapp.net`
                    )
                    await client.group.createGroup(`Bench Group ${i}`, jids)
                }
            },
            'groups'
        )
        await profiler.afterScenario(scenarioName)
        return result
    } finally {
        await teardownFixture(fixture)
        forceGcIfAvailable()
    }
}

async function runAddParticipantsScenarioInProcess(
    config: GroupBenchConfig,
    profiler: BenchProfiler
): Promise<ScenarioResult> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClient(storeFixture, {
        sessionId: 'bench-group-addparts'
    })
    const { server, client } = fixture
    attachGroupHandlersInProcess(server)

    const seedJids = Array.from(
        { length: config.membersPerCreate },
        (_, k) => `5511${String(7_800_000_000 + k).padStart(10, '0')}@s.whatsapp.net`
    )
    const groupResult = await client.group.createGroup('Bench Add-Parts Group', seedJids)
    const groupJid = extractGroupJid(groupResult)
    if (!groupJid) throw new Error('group create returned no jid')

    const scenarioName = 'add_participants'
    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            config.ops,
            async () => {
                for (let i = 0; i < config.ops; i += 1) {
                    const jid = `5511${String(7_900_000_000 + i).padStart(10, '0')}@s.whatsapp.net`
                    await client.group.addParticipants(groupJid, [jid])
                }
            },
            'adds'
        )
        await profiler.afterScenario(scenarioName)
        return result
    } finally {
        await teardownFixture(fixture)
        forceGcIfAvailable()
    }
}

// ─── separate-process scenarios ───────────────────────────────────────

async function runCreateGroupScenarioRpc(
    config: GroupBenchConfig,
    profiler: BenchProfiler,
    argSet: ReadonlySet<string>
): Promise<ScenarioResult> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClientViaRpc(storeFixture, {
        sessionId: 'bench-group-create'
    })
    const { rpc, client } = fixture
    await startServerProfilingIfRequested(rpc, profiler.options, argSet)
    await takeServerSnapshotIfRequested(rpc, 'server-pre-create', profiler.options, argSet)
    await rpc.setupGroupBenchHandlers()

    const scenarioName = 'create_group'
    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            config.ops,
            async () => {
                for (let i = 0; i < config.ops; i += 1) {
                    const jids = Array.from(
                        { length: config.membersPerCreate },
                        (_, k) =>
                            `5511${String(7_700_000_000 + i * 10_000 + k).padStart(10, '0')}@s.whatsapp.net`
                    )
                    await client.group.createGroup(`Bench Group ${i}`, jids)
                }
            },
            'groups'
        )
        await profiler.afterScenario(scenarioName)
        await takeServerSnapshotIfRequested(rpc, 'server-post-create', profiler.options, argSet)
        await stopServerProfilingIfRequested(rpc, profiler.options, argSet)
        return result
    } finally {
        await teardownRpcFixture(fixture)
        forceGcIfAvailable()
    }
}

async function runAddParticipantsScenarioRpc(
    config: GroupBenchConfig,
    profiler: BenchProfiler,
    argSet: ReadonlySet<string>
): Promise<ScenarioResult> {
    const storeFixture = await buildBenchStore()
    const fixture = await bringUpPairedClientViaRpc(storeFixture, {
        sessionId: 'bench-group-addparts'
    })
    const { rpc, client } = fixture
    await startServerProfilingIfRequested(rpc, profiler.options, argSet)
    await takeServerSnapshotIfRequested(rpc, 'server-pre-addparts', profiler.options, argSet)
    await rpc.setupGroupBenchHandlers()

    const seedJids = Array.from(
        { length: config.membersPerCreate },
        (_, k) => `5511${String(7_800_000_000 + k).padStart(10, '0')}@s.whatsapp.net`
    )
    const groupResult = await client.group.createGroup('Bench Add-Parts Group', seedJids)
    const groupJid = extractGroupJid(groupResult)
    if (!groupJid) throw new Error('group create returned no jid')

    const scenarioName = 'add_participants'
    try {
        await profiler.beforeScenario(scenarioName)
        const result = await runScenario(
            scenarioName,
            config.ops,
            async () => {
                for (let i = 0; i < config.ops; i += 1) {
                    const jid = `5511${String(7_900_000_000 + i).padStart(10, '0')}@s.whatsapp.net`
                    await client.group.addParticipants(groupJid, [jid])
                }
            },
            'adds'
        )
        await profiler.afterScenario(scenarioName)
        await takeServerSnapshotIfRequested(rpc, 'server-post-addparts', profiler.options, argSet)
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

    const config: GroupBenchConfig = {
        ops: readPositiveIntEnv('ZAPO_BENCH_GROUP_OPS', 100),
        membersPerCreate: readPositiveIntEnv('ZAPO_BENCH_GROUP_MEMBERS_PER_CREATE', 5)
    }
    const backendName = process.env.ZAPO_BENCH_STORE ?? 'memory'
    const separate = argSet.has('--separate-process')

    console.log('zapo-js group-provision bench')
    console.log('─────────────────────────────')
    console.log(`  ops / scenario     : ${config.ops}`)
    console.log(`  members per create : ${config.membersPerCreate}`)
    console.log(`  store              : ${backendName}`)
    console.log(`  mode               : ${separate ? 'separate-process' : 'in-process'}`)
    console.log('')

    if (argSet.has('--snapshot')) {
        await profiler.takeHeapSnapshot('start').catch((err) => console.error('[snapshot]', err))
    }

    const results: ScenarioResult[] = []
    const createResult = separate
        ? await runCreateGroupScenarioRpc(config, profiler, argSet)
        : await runCreateGroupScenarioInProcess(config, profiler)
    results.push(createResult)
    printResult(createResult)

    const addResult = separate
        ? await runAddParticipantsScenarioRpc(config, profiler, argSet)
        : await runAddParticipantsScenarioInProcess(config, profiler)
    results.push(addResult)
    printResult(addResult)

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
