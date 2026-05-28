/**
 * Reusable fixture builders for fake-server benches: pair a single
 * `WaClient` against a fresh `FakeWaServer`, then provision contacts /
 * groups on demand. Used by every messaging-flavored bench.
 */

import { WaClient, type WaClientEventMap } from 'zapo-js'

import { type FakePeer } from '../src/api/FakePeer'
import { FakeWaServer, type WaFakeConnectionPipeline } from '../src/api/FakeWaServer'
import { parsePairingQrString } from '../src/protocol/auth/pair-device'

import { NOOP_LOGGER } from './_common'
import type { BenchStoreFixture } from './_store-factory'
import { ServerRpc } from './server-rpc'

export interface PairedFixture {
    readonly server: FakeWaServer
    readonly client: WaClient
    readonly pipeline: WaFakeConnectionPipeline
    readonly meJid: string
    readonly meDeviceJid: string
    readonly storeFixture: BenchStoreFixture
}

export interface BringUpOptions {
    readonly sessionId?: string
    readonly historyEnabled?: boolean
    readonly emitSnapshotMutations?: boolean
    readonly chatSync?: boolean
}

export async function bringUpPairedClient(
    storeFixture: BenchStoreFixture,
    options: BringUpOptions = {}
): Promise<PairedFixture> {
    const server = await FakeWaServer.start()

    const client = new WaClient(
        {
            store: storeFixture.store,
            sessionId: options.sessionId ?? 'zapo-bench',
            chatSocketUrls: [server.url],
            connectTimeoutMs: 60_000,
            history: options.historyEnabled ? { enabled: true } : undefined,
            chatEvents: options.emitSnapshotMutations ? { emitSnapshotMutations: true } : undefined,
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

    return {
        server,
        client,
        pipeline: pipelineAfterPair,
        meJid,
        meDeviceJid,
        storeFixture
    }
}

export async function teardownFixture(fixture: PairedFixture): Promise<void> {
    await fixture.client.disconnect().catch(() => undefined)
    await fixture.server.stop()
    await fixture.storeFixture.destroy().catch(() => undefined)
}

// ─── Separate-process variant (server runs in a child) ────────────────

export interface RpcPairedFixture {
    readonly rpc: ServerRpc
    readonly client: WaClient
    readonly meJid: string
    readonly meDeviceJid: string
    readonly storeFixture: BenchStoreFixture
}

/**
 * Like {@link bringUpPairedClient} but the `FakeWaServer` lives in a
 * forked child process via {@link ServerRpc}. Use this for benches
 * launched with `--separate-process` so the CPU profile of the lib
 * does NOT include fake-server time.
 *
 * The caller is responsible for: starting the profiler in the child
 * if desired (`rpc.startProfiling(...)`), and tearing the child + the
 * store down via {@link teardownRpcFixture}.
 */
export async function bringUpPairedClientViaRpc(
    storeFixture: BenchStoreFixture,
    options: BringUpOptions = {}
): Promise<RpcPairedFixture> {
    const rpc = new ServerRpc()
    await rpc.spawn()
    await rpc.start()

    const client = new WaClient(
        {
            store: storeFixture.store,
            sessionId: options.sessionId ?? 'zapo-bench-separate',
            chatSocketUrls: [rpc.serverUrl],
            connectTimeoutMs: 60_000,
            history: options.historyEnabled ? { enabled: true } : undefined,
            chatEvents: options.emitSnapshotMutations ? { emitSnapshotMutations: true } : undefined,
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

    const meJid = '5511999999999@s.whatsapp.net'
    const meDeviceJid = '5511999999999:1@s.whatsapp.net'

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

    await client.connect()
    await rpc.waitForAuthenticatedPipeline()
    const pairPromise = rpc.runPairing(meDeviceJid)
    const waitNextPromise = rpc.waitForNextAuthenticatedPipeline()
    await pairedPromise
    await pairPromise
    await waitNextPromise
    await rpc.triggerPreKeyUpload()

    return { rpc, client, meJid, meDeviceJid, storeFixture }
}

export async function teardownRpcFixture(fixture: RpcPairedFixture): Promise<void> {
    await fixture.client.disconnect().catch(() => undefined)
    await fixture.rpc.stop()
    await fixture.storeFixture.destroy().catch(() => undefined)
}

// ─── Contacts / groups ────────────────────────────────────────────────

export interface ContactFixture {
    readonly userJid: string
    readonly devices: readonly FakePeer[]
}

export interface GroupFixture {
    readonly groupJid: string
    readonly members: readonly FakePeer[]
    readonly designatedSender: FakePeer
}

export async function ensurePreKeyPool(
    server: FakeWaServer,
    pipeline: WaFakeConnectionPipeline,
    requiredHeadroom: number
): Promise<void> {
    if (server.preKeysAvailable() >= requiredHeadroom) return
    await server.triggerPreKeyUpload(pipeline, { force: true })
}

export async function buildContacts(
    server: FakeWaServer,
    pipeline: WaFakeConnectionPipeline,
    count: number,
    devicesPerContact: number
): Promise<readonly ContactFixture[]> {
    const out: ContactFixture[] = []
    const deviceIds = Array.from({ length: devicesPerContact }, (_, idx) => idx + 1)
    for (let i = 0; i < count; i += 1) {
        await ensurePreKeyPool(server, pipeline, devicesPerContact)
        const userJid = `5511${String(7_000_000_000 + i).padStart(10, '0')}@s.whatsapp.net`
        const devices = await server.createFakePeerWithDevices({ userJid, deviceIds }, pipeline)
        out.push({ userJid, devices })
    }
    return out
}

export async function buildGroups(
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

export function bucketize(total: number, slots: number): readonly number[] {
    if (slots <= 0) throw new Error('bucketize requires slots > 0')
    const base = Math.floor(total / slots)
    const remainder = total - base * slots
    const out = new Array<number>(slots)
    for (let i = 0; i < slots; i += 1) {
        out[i] = base + (i < remainder ? 1 : 0)
    }
    return out
}
