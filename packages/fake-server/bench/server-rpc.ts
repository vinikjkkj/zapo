/**
 * Thin RPC client that talks to the forked `server-process.ts` child.
 * Exposes the same API surface as the in-process FakeWaServer + FakePeer
 * combo, so the bench code can swap between in-process and separate-process
 * modes with minimal changes.
 */

import { fork, type ChildProcess } from 'node:child_process'
import * as https from 'node:https'
import { resolve as resolvePath } from 'node:path'

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

export interface RemotePeerHandle {
    readonly peerId: string
    sendConversation(text: string): Promise<void>
    sendGroupConversation(groupJid: string, text: string): Promise<void>
}

export interface RemoteContactFixture {
    readonly userJid: string
    readonly devices: readonly RemotePeerHandle[]
}

export interface RemoteGroupFixture {
    readonly groupJid: string
    readonly members: readonly RemotePeerHandle[]
    readonly designatedSender: RemotePeerHandle
}

export class ServerRpc {
    private child: ChildProcess | null = null
    private nextId = 1
    private readonly pending = new Map<
        number,
        { resolve: (v: unknown) => void; reject: (e: Error) => void }
    >()
    private readyPromise: Promise<void> | null = null

    public serverUrl = ''
    public noiseRootCa: { publicKey: Uint8Array; serial: number } = {
        publicKey: new Uint8Array(),
        serial: 0
    }
    public mediaProxyAgent: https.Agent | null = null

    public async spawn(): Promise<void> {
        const entry = resolvePath(__dirname, 'server-process.ts')
        this.child = fork(entry, [], {
            execArgv: ['--import', 'tsx'],
            stdio: ['pipe', 'inherit', 'inherit', 'ipc']
        })
        this.child.on('message', (msg: RpcResponse & { ready?: boolean }) => {
            if (msg.ready) return // handled by readyPromise
            const waiter = this.pending.get(msg.id)
            if (!waiter) return
            this.pending.delete(msg.id)
            if (msg.error) {
                waiter.reject(new Error(msg.error))
            } else {
                waiter.resolve(msg.result)
            }
        })

        this.readyPromise = new Promise<void>((resolve, reject) => {
            const onMsg = (msg: { ready?: boolean }): void => {
                if (msg.ready) {
                    this.child!.removeListener('message', onMsg)
                    resolve()
                }
            }
            this.child!.on('message', onMsg)
            this.child!.on('error', reject)
            this.child!.on('exit', (code) => {
                if (code !== 0) reject(new Error(`server process exited with code ${code}`))
            })
        })

        await this.readyPromise
    }

    private call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
        if (!this.child) throw new Error('server not spawned')
        const id = this.nextId++
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
            const msg: RpcRequest = { id, method, params }
            this.child!.send(msg)
        })
    }

    public async start(): Promise<void> {
        const result = (await this.call('start')) as {
            url: string
            noiseRootCa: { publicKey: number[]; serial: number }
        }
        this.serverUrl = result.url
        this.noiseRootCa = {
            publicKey: new Uint8Array(result.noiseRootCa.publicKey),
            serial: result.noiseRootCa.serial
        }
        this.mediaProxyAgent = new https.Agent({ rejectUnauthorized: false })
    }

    public async waitForAuthenticatedPipeline(): Promise<void> {
        await this.call('waitForAuthenticatedPipeline')
    }

    public async waitForNextAuthenticatedPipeline(): Promise<void> {
        await this.call('waitForNextAuthenticatedPipeline')
    }

    public async runPairing(deviceJid: string): Promise<void> {
        await this.call('runPairing', { deviceJid })
    }

    /**
     * Sends the pairing material (advSecretKey + identityPublicKey)
     * back to the child process. Called by the parent after the
     * client emits `auth_qr`.
     */
    public sendPairingMaterial(material: {
        advSecretKey: Uint8Array
        identityPublicKey: Uint8Array
    }): void {
        if (!this.child) throw new Error('server not spawned')
        this.child.send({
            method: 'pairingMaterial',
            params: {
                advSecretKey: Array.from(material.advSecretKey),
                identityPublicKey: Array.from(material.identityPublicKey)
            }
        })
    }

    public async triggerPreKeyUpload(force = false): Promise<void> {
        await this.call('triggerPreKeyUpload', { force })
    }

    public async createFakePeerWithDevices(input: {
        userJid: string
        deviceIds: number[]
        skipOneTimePreKey?: boolean
    }): Promise<{ peerId: string; devicePeerIds: string[] }> {
        return (await this.call('createFakePeerWithDevices', input)) as {
            peerId: string
            devicePeerIds: string[]
        }
    }

    public async createFakePeer(input: {
        jid: string
        skipOneTimePreKey?: boolean
    }): Promise<{ peerId: string }> {
        return (await this.call('createFakePeer', input)) as { peerId: string }
    }

    public createFakeGroup(input: {
        groupJid: string
        subject: string
        participantPeerIds: string[]
    }): Promise<void> {
        return this.call('createFakeGroup', input) as Promise<void>
    }

    public async ensurePreKeyPool(requiredHeadroom: number): Promise<void> {
        await this.call('ensurePreKeyPool', { requiredHeadroom })
    }

    public async peerSendConversation(peerId: string, text: string): Promise<void> {
        await this.call('peerSendConversation', { peerId, text })
    }

    public async peerSendGroupConversation(
        peerId: string,
        groupJid: string,
        text: string
    ): Promise<void> {
        await this.call('peerSendGroupConversation', { peerId, groupJid, text })
    }

    public async preKeysAvailable(): Promise<number> {
        return (await this.call('preKeysAvailable')) as number
    }

    public async dispenserMisses(): Promise<number> {
        return (await this.call('dispenserMisses')) as number
    }

    public async stop(): Promise<void> {
        try {
            await this.call('stop')
        } catch {
            // best-effort
        }
        this.child?.kill()
        this.child = null
    }

    // ─── High-level fixture builders ──────────────────────────────

    public async buildContacts(
        count: number,
        devicesPerContact: number
    ): Promise<readonly RemoteContactFixture[]> {
        const out: RemoteContactFixture[] = []
        const deviceIds = Array.from({ length: devicesPerContact }, (_, i) => i + 1)
        for (let i = 0; i < count; i += 1) {
            await this.ensurePreKeyPool(devicesPerContact)
            const userJid = `5511${String(7_000_000_000 + i).padStart(10, '0')}@s.whatsapp.net`
            const result = await this.createFakePeerWithDevices({ userJid, deviceIds })
            const devices: RemotePeerHandle[] = result.devicePeerIds.map((pid) =>
                this.makePeerHandle(pid)
            )
            out.push({ userJid, devices })
        }
        return out
    }

    public async buildGroups(
        groupCount: number,
        memberCount: number
    ): Promise<readonly RemoteGroupFixture[]> {
        const out: RemoteGroupFixture[] = []
        let memberCursor = 0
        for (let g = 0; g < groupCount; g += 1) {
            const groupJid = `120363${String(900_000_000_000 + g).padStart(15, '0')}@g.us`
            const memberPeerIds: string[] = []
            const memberHandles: RemotePeerHandle[] = []
            for (let m = 0; m < memberCount; m += 1) {
                await this.ensurePreKeyPool(1)
                const jid = `5511${String(8_000_000_000 + memberCursor).padStart(10, '0')}@s.whatsapp.net`
                memberCursor += 1
                const result = await this.createFakePeer({ jid })
                memberPeerIds.push(result.peerId)
                memberHandles.push(this.makePeerHandle(result.peerId))
            }
            await this.createFakeGroup({
                groupJid,
                subject: `Bench Group ${g + 1}`,
                participantPeerIds: memberPeerIds
            })
            out.push({
                groupJid,
                members: memberHandles,
                designatedSender: memberHandles[0]
            })
        }
        return out
    }

    private makePeerHandle(peerId: string): RemotePeerHandle {
        return {
            peerId,
            sendConversation: (text) => this.peerSendConversation(peerId, text),
            sendGroupConversation: (groupJid, text) =>
                this.peerSendGroupConversation(peerId, groupJid, text)
        }
    }
}
