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

/**
 * Shape of a media-receive descriptor that the lib needs to download +
 * decrypt an inbound media message. Used by {@link peerSendImageMessage}
 * and {@link peerSendVideoMessage} as the payload sent to the child to
 * have a FakePeer publish a media-bearing stanza.
 *
 * `Uint8Array` fields cross the IPC boundary in place because the child
 * is forked with `serialization: 'advanced'` (V8 structured clone),
 * which preserves typed-array byte buffers without the `number[]`
 * round-trip the default JSON serializer would force.
 */
export interface MediaDescriptor {
    readonly directPath: string
    readonly mediaKey: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly fileLength: number
    readonly mimetype?: string
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
        // serialization: 'advanced' switches IPC to V8's structured
        // clone, which preserves Uint8Array / Buffer in place. Without
        // it every typed-array crossing the boundary would round-trip
        // through `number[]` + JSON, inflating memory and CPU for
        // multi-MB media payloads (publishMediaBlob, peerSend*Message).
        this.child = fork(entry, [], {
            execArgv: ['--import', 'tsx'],
            stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
            serialization: 'advanced'
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
        // keepAlive: true mirrors what real-world WhatsApp clients do and
        // matches the in-process FakeWaServer.mediaProxyAgent so the
        // --separate-process bench numbers stay comparable.
        this.mediaProxyAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true })
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
        enableReplayCache?: boolean
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

    public async peerSendConversation(
        peerId: string,
        text: string,
        options: { id?: string; tamperMode?: 'last-byte-xor-ff' } = {}
    ): Promise<void> {
        await this.call('peerSendConversation', {
            peerId,
            text,
            ...(options.id !== undefined ? { id: options.id } : {}),
            ...(options.tamperMode !== undefined ? { tamperMode: options.tamperMode } : {})
        })
    }

    public async peerSendImageMessage(peerId: string, descriptor: MediaDescriptor): Promise<void> {
        await this.call('peerSendImageMessage', { peerId, descriptor })
    }

    public async peerSendVideoMessage(peerId: string, descriptor: MediaDescriptor): Promise<void> {
        await this.call('peerSendVideoMessage', { peerId, descriptor })
    }

    public async publishMediaBlob(input: {
        readonly mediaType:
            | 'image'
            | 'video'
            | 'audio'
            | 'document'
            | 'sticker'
            | 'gif'
            | 'ptt'
            | 'history'
            | 'md-app-state'
        readonly plaintext: Uint8Array
    }): Promise<{
        readonly path: string
        readonly mediaKey: Uint8Array
        readonly fileSha256: Uint8Array
        readonly fileEncSha256: Uint8Array
        readonly fileLength: number
    }> {
        return (await this.call('publishMediaBlob', {
            mediaType: input.mediaType,
            plaintext: input.plaintext
        })) as {
            readonly path: string
            readonly mediaKey: Uint8Array
            readonly fileSha256: Uint8Array
            readonly fileEncSha256: Uint8Array
            readonly fileLength: number
        }
    }

    public async mediaUrl(path: string): Promise<string> {
        const result = (await this.call('mediaUrl', { path })) as { url: string }
        return result.url
    }

    public async peerExpectMessage(
        peerId: string,
        timeoutMs = 30_000
    ): Promise<{ conversation: string | null; encType: 'pkmsg' | 'msg' | 'skmsg' }> {
        return (await this.call('peerExpectMessage', { peerId, timeoutMs })) as {
            conversation: string | null
            encType: 'pkmsg' | 'msg' | 'skmsg'
        }
    }

    public async peerReplaySentMessage(
        peerId: string,
        originalMsgId: string,
        options: { resendId?: string } = {}
    ): Promise<void> {
        await this.call('peerReplaySentMessage', {
            peerId,
            originalMsgId,
            ...(options.resendId !== undefined ? { resendId: options.resendId } : {})
        })
    }

    public async peerRotateForRetry(peerId: string): Promise<void> {
        await this.call('peerRotateForRetry', { peerId })
    }

    public async peerSendRetryReceipt(
        peerId: string,
        originalMsgId: string,
        options: {
            includeKeys?: boolean
            count?: number
            receiptId?: string
            t?: number
        } = {}
    ): Promise<void> {
        await this.call('peerSendRetryReceipt', {
            peerId,
            originalMsgId,
            ...options
        })
    }

    public async waitForRetryReceipt(stanzaId: string, timeoutMs = 60_000): Promise<void> {
        await this.call('waitForRetryReceipt', { stanzaId, timeoutMs })
    }

    public async waitForRetryReceipts(count: number, timeoutMs = 60_000): Promise<string[]> {
        const result = (await this.call('waitForRetryReceipts', { count, timeoutMs })) as {
            ids: string[]
        }
        return result.ids
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

    public async startProfiling(options: {
        cpu?: boolean
        heap?: boolean
        outDir?: string
    }): Promise<void> {
        await this.call('startProfiling', options)
    }

    public async stopProfiling(options: {
        cpu?: boolean
        heap?: boolean
        outDir?: string
    }): Promise<{ cpuPath?: string; heapPath?: string }> {
        return (await this.call('stopProfiling', options)) as {
            cpuPath?: string
            heapPath?: string
        }
    }

    public async takeSnapshot(label: string, outDir?: string): Promise<string> {
        const result = (await this.call('takeSnapshot', { label, outDir })) as { path: string }
        return result.path
    }

    // ─── Bench-specific RPC wrappers (push from server side) ──────

    public async peerSendHistorySync(input: {
        peerId: string
        chunkOrder?: number
        progress?: number
        conversations?: readonly {
            id: string
            name?: string
            unreadCount?: number
            messages?: readonly {
                id: string
                fromMe: boolean
                timestamp: number
                conversation: string
            }[]
        }[]
        pushnames?: readonly { id: string; pushname: string }[]
    }): Promise<void> {
        await this.call('peerSendHistorySync', input)
    }

    public async peerSendAppStateSyncKeyShare(input: {
        peerId: string
        keys: { keyId: Uint8Array; keyData: Uint8Array; timestamp: number }[]
    }): Promise<void> {
        await this.call('peerSendAppStateSyncKeyShare', {
            peerId: input.peerId,
            keys: input.keys.map((k) => ({
                keyIdBytes: Array.from(k.keyId),
                keyDataBytes: Array.from(k.keyData),
                timestamp: k.timestamp
            }))
        })
    }

    public async pipelineSendReceiptBatch(
        receipts: readonly {
            id: string
            from: string
            type?: string
            t?: number
        }[]
    ): Promise<void> {
        await this.call('pipelineSendReceiptBatch', { receipts })
    }

    public async setupGroupBenchHandlers(): Promise<void> {
        await this.call('setupGroupBenchHandlers')
    }

    public async registerAppStateSyncKey(keyId: Uint8Array, keyData: Uint8Array): Promise<void> {
        await this.call('registerAppStateSyncKey', {
            keyIdBytes: Array.from(keyId),
            keyDataBytes: Array.from(keyData)
        })
    }

    public async setupAppStateBootstrap(input: {
        name: string
        syncKeyId: Uint8Array
        syncKeyData: Uint8Array
        mutation: {
            operation: 'set' | 'remove'
            index: string
            value?: Record<string, unknown> | null
            version: number
        }
    }): Promise<void> {
        await this.call('setupAppStateBootstrap', {
            name: input.name,
            syncKeyIdBytes: Array.from(input.syncKeyId),
            syncKeyDataBytes: Array.from(input.syncKeyData),
            mutation: input.mutation
        })
    }

    public async setupAppStateExternalSnapshot(input: {
        name: string
        syncKeyId: Uint8Array
        syncKeyData: Uint8Array
        mutations: readonly {
            operation: 'set' | 'remove'
            index: string
            value?: Record<string, unknown> | null
            version: number
        }[]
    }): Promise<void> {
        await this.call('setupAppStateExternalSnapshot', {
            name: input.name,
            syncKeyIdBytes: Array.from(input.syncKeyId),
            syncKeyDataBytes: Array.from(input.syncKeyData),
            mutations: input.mutations
        })
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
