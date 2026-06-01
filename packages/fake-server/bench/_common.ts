/**
 * Shared bench infrastructure for the fake-server bench suite.
 *
 * - {@link BenchProfiler}: V8 inspector wrapper that captures CPU profile,
 *   heap allocation timeline, and heap snapshots (start/end and optional
 *   per-scenario), saving to a configurable output directory.
 * - {@link runScenario}: timed runner that wraps an operation with
 *   process.cpuUsage + memory snapshot deltas.
 * - format / env / GC helpers reused across every bench.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import * as inspector from 'node:inspector/promises'
import { resolve as resolvePath } from 'node:path'
import { performance } from 'node:perf_hooks'

import type { Logger } from 'zapo-js'

const BYTES_PER_MEBIBYTE = 1_048_576

export function formatFixed(value: number, fractionDigits = 2): string {
    if (!Number.isFinite(value)) return value.toString()
    return value.toFixed(fractionDigits)
}

export function formatMiB(bytes: number): string {
    return `${formatFixed(bytes / BYTES_PER_MEBIBYTE, 2)} MiB`
}

export function formatMs(value: number): string {
    if (value >= 1_000) return `${formatFixed(value / 1_000, 2)} s`
    return `${formatFixed(value, 2)} ms`
}

export function formatBytesPerSec(bytes: number, ms: number): string {
    if (ms <= 0) return '∞'
    const bps = (bytes / ms) * 1000
    if (bps >= BYTES_PER_MEBIBYTE) return `${formatFixed(bps / BYTES_PER_MEBIBYTE, 2)} MiB/s`
    if (bps >= 1024) return `${formatFixed(bps / 1024, 2)} KiB/s`
    return `${formatFixed(bps, 0)} B/s`
}

export function readPositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name]
    if (!raw) return fallback
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`env ${name}=${raw} must be a positive integer`)
    }
    return parsed
}

export function readCsvEnv(name: string, fallback: readonly string[]): readonly string[] {
    const raw = process.env[name]
    if (!raw) return fallback
    return raw
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
}

export function hasExposedGc(): boolean {
    return typeof (globalThis as { gc?: () => void }).gc === 'function'
}

export function forceGcIfAvailable(): void {
    const gc = (globalThis as { gc?: () => void }).gc
    if (gc) gc()
}

const benchLogger: Logger = {
    level: 'error',
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: (...args: unknown[]) => {
        if (process.env.ZAPO_BENCH_VERBOSE) console.warn('[lib warn]', ...args)
    },
    error: (...args: unknown[]) => {
        if (process.env.ZAPO_BENCH_VERBOSE) console.error('[lib error]', ...args)
    },
    child: () => benchLogger
}
export const NOOP_LOGGER: Logger = benchLogger

// ─── Profiler ─────────────────────────────────────────────────────────

export interface ProfilerOptions {
    readonly cpu: boolean
    readonly heap: boolean
    readonly snapshot: boolean
    readonly perScenario: boolean
    readonly snapshotPerScenario: boolean
    readonly outDir: string
}

export function readProfilerOptions(args: ReadonlySet<string>): ProfilerOptions {
    const outDirArg = process.argv.find((a) => a.startsWith('--out-dir='))
    return {
        cpu: args.has('--cpu'),
        heap: args.has('--heap'),
        snapshot: args.has('--snapshot'),
        perScenario: args.has('--per-scenario'),
        snapshotPerScenario: args.has('--snapshot-per-scenario'),
        outDir: outDirArg ? outDirArg.slice('--out-dir='.length) : process.cwd()
    }
}

function slug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

export class BenchProfiler {
    public readonly options: ProfilerOptions
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

    public async beforeScenario(name: string): Promise<void> {
        if (!this.active || !this.session) return
        if (this.options.cpu && this.options.perScenario) {
            try {
                await this.session.post('Profiler.start')
            } catch {
                // already running – fine
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
            this.session.removeListener('HeapProfiler.addHeapSnapshotChunk', onChunk)
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
            await this.session.post('HeapProfiler.takeHeapSnapshot', {
                reportProgress: false,
                treatGlobalObjectsAsRoots: true
            })
            await this.session.post('HeapProfiler.stopTrackingHeapObjects')
        } finally {
            this.session.removeListener('HeapProfiler.addHeapSnapshotChunk', onChunk)
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

// ─── Scenario runner ──────────────────────────────────────────────────

export interface ScenarioResult {
    readonly name: string
    readonly opsCount: number
    readonly elapsedMs: number
    readonly throughputOpsPerSec: number
    readonly avgMsPerOp: number
    readonly cpuTimeMs: number
    readonly cpuPercent: number
    readonly rssBeforeBytes: number
    readonly rssAfterBytes: number
    readonly rssDeltaBytes: number
    readonly heapDeltaBytes: number
    readonly opsLabel: string
}

export function snapshotMemory(): { rss: number; heap: number } {
    const m = process.memoryUsage()
    return { rss: m.rss, heap: m.heapUsed }
}

export async function runScenario(
    name: string,
    opsCount: number,
    operation: () => Promise<void>,
    opsLabel = 'ops'
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
        opsCount,
        elapsedMs,
        throughputOpsPerSec: opsCount > 0 ? (opsCount / elapsedMs) * 1_000 : 0,
        avgMsPerOp: opsCount > 0 ? elapsedMs / opsCount : 0,
        cpuTimeMs,
        cpuPercent: elapsedMs > 0 ? (cpuTimeMs / elapsedMs) * 100 : 0,
        rssBeforeBytes: before.rss,
        rssAfterBytes: after.rss,
        rssDeltaBytes: Math.max(0, after.rss - before.rss),
        heapDeltaBytes: Math.max(0, after.heap - before.heap),
        opsLabel
    }
}

export function printResult(result: ScenarioResult): void {
    console.log(`──[ ${result.name} ]──────────────────────────────`)
    console.log(`  ${result.opsLabel.padEnd(18)}: ${result.opsCount}`)
    console.log(`  elapsed           : ${formatMs(result.elapsedMs)}`)
    console.log(
        `  throughput        : ${formatFixed(result.throughputOpsPerSec, 1)} ${result.opsLabel}/s`
    )
    console.log(`  avg / ${result.opsLabel.padEnd(11)} : ${formatMs(result.avgMsPerOp)}`)
    console.log(`  CPU time          : ${formatMs(result.cpuTimeMs)}`)
    console.log(`  CPU %             : ${formatFixed(result.cpuPercent, 1)}`)
    console.log(`  RSS before        : ${formatMiB(result.rssBeforeBytes)}`)
    console.log(`  RSS after         : ${formatMiB(result.rssAfterBytes)}`)
    console.log(`  RSS delta         : ${formatMiB(result.rssDeltaBytes)}`)
    console.log(`  heap delta        : ${formatMiB(result.heapDeltaBytes)}`)
    console.log('')
}

export function maybePrintJson(results: readonly ScenarioResult[]): void {
    if (process.env.ZAPO_BENCH_JSON !== '1') return
    console.log(
        JSON.stringify(
            results.map((r) => ({
                name: r.name,
                opsCount: r.opsCount,
                opsLabel: r.opsLabel,
                elapsedMs: r.elapsedMs,
                throughputOpsPerSec: r.throughputOpsPerSec,
                avgMsPerOp: r.avgMsPerOp,
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

// ─── Helpers for the --separate-process pattern ───────────────────────

export interface RpcLike {
    startProfiling(options: { cpu?: boolean; heap?: boolean; outDir?: string }): Promise<void>
    stopProfiling(options: {
        cpu?: boolean
        heap?: boolean
        outDir?: string
    }): Promise<{ cpuPath?: string; heapPath?: string }>
    takeSnapshot(label: string, outDir?: string): Promise<string>
}

export async function startServerProfilingIfRequested(
    rpc: RpcLike,
    profilerOptions: ProfilerOptions,
    argSet: ReadonlySet<string>
): Promise<void> {
    if (argSet.has('--no-server-prof')) {
        console.log('[server] profiling skipped (--no-server-prof)')
        return
    }
    if (!profilerOptions.cpu && !profilerOptions.heap) return
    await rpc.startProfiling({
        cpu: profilerOptions.cpu,
        heap: profilerOptions.heap,
        outDir: profilerOptions.outDir
    })
    console.log('[server] profiling started')
}

export async function stopServerProfilingIfRequested(
    rpc: RpcLike,
    profilerOptions: ProfilerOptions,
    argSet: ReadonlySet<string>
): Promise<void> {
    if (argSet.has('--no-server-prof')) return
    if (!profilerOptions.cpu && !profilerOptions.heap) return
    const paths = await rpc
        .stopProfiling({
            cpu: profilerOptions.cpu,
            heap: profilerOptions.heap,
            outDir: profilerOptions.outDir
        })
        .catch((): { cpuPath?: string; heapPath?: string } => ({}))
    if (paths.cpuPath) console.log(`[server:cpu] saved ${paths.cpuPath}`)
    if (paths.heapPath) console.log(`[server:heap] saved ${paths.heapPath}`)
}

export async function takeServerSnapshotIfRequested(
    rpc: RpcLike,
    label: string,
    profilerOptions: ProfilerOptions,
    argSet: ReadonlySet<string>
): Promise<void> {
    if (!argSet.has('--snapshot')) return
    await rpc.takeSnapshot(label, profilerOptions.outDir).then(
        (p) => console.log(`[server:snapshot] saved ${p}`),
        (err) => console.error('[server:snapshot]', err)
    )
}

// ─── Emergency-stop wiring ────────────────────────────────────────────

let _emergencyStopRan = false
export function installEmergencyStop(): void {
    const handler = (label: string, err: unknown): void => {
        if (_emergencyStopRan) return
        _emergencyStopRan = true
        console.error(`[${label}]`, err)
        process.exit(1)
    }
    process.on('uncaughtException', (err) => handler('uncaughtException', err))
    process.on('unhandledRejection', (err) => handler('unhandledRejection', err))
}
