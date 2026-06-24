/**
 * VOIP smoke test: pair via QR, then place / receive a WhatsApp audio call.
 *
 * Usage (from the repo root):
 *   npx tsx examples/voip-example.ts                       # only receive calls (auto-accept)
 *   npx tsx examples/voip-example.ts <jid|phone>           # call, mic only
 *   npx tsx examples/voip-example.ts <jid|phone> <audio>   # call + play an audio file
 *
 * Examples:
 *   npx tsx examples/voip-example.ts 5511999999999
 *   npx tsx examples/voip-example.ts 5511999999999 ./hello.ogg
 *
 * The session is stored in .auth/voip.sqlite (pair once). Set VOIP_RESET_AUTH=1
 * to wipe it and show a fresh QR. Press Ctrl+C to hang up and exit.
 */
import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { createSqliteStore } from '@zapo-js/store-sqlite'
import qrcode from 'qrcode-terminal'

import {
    createVoipManager,
    type NativeCallManager,
    routeCallAck,
    routeCallReceipt,
    routeCallStanza
} from '@zapo-js/voip'

import { createPinoLogger, createStore, WaClient } from '../src'
import type { BinaryNode } from '../src/transport'

/** Accept a bare phone number, a full jid, or an @lid jid. */
function toJid(input: string): string {
    if (input.includes('@')) return input
    return `${input.replace(/\D/g, '')}@s.whatsapp.net`
}

async function main(): Promise<void> {
    const target = process.argv[2] ? toJid(process.argv[2]) : null
    const audioPath = process.argv[3] ?? null

    const authPath = resolve(process.cwd(), '.auth', 'voip.sqlite')
    await mkdir(dirname(authPath), { recursive: true })
    if (process.env.VOIP_RESET_AUTH === '1') {
        await rm(authPath, { force: true })
        console.log(`[info] auth reset: ${authPath}`)
    }

    const logger = await createPinoLogger({ level: 'trace', pretty: true })
    const store = createStore({
        backends: { sqlite: createSqliteStore({ path: authPath, driver: 'auto' }) },
        providers: {
            auth: 'sqlite',
            signal: 'sqlite',
            preKey: 'sqlite',
            session: 'sqlite',
            identity: 'sqlite',
            senderKey: 'sqlite',
            appState: 'sqlite',
            privacyToken: 'sqlite',
            messages: 'sqlite',
            threads: 'sqlite',
            contacts: 'sqlite'
        }
    })

    const client = new WaClient({ store, sessionId: 'voip', deviceBrowser: 'Chrome' }, logger)
    let manager: NativeCallManager | null = null

    client.on('auth_qr', ({ qr }) => {
        console.log('\n[qr] WhatsApp → Linked devices → Link a device:\n')
        qrcode.generate(qr, { small: true })
    })
    client.on('auth_paired', ({ credentials }) =>
        console.log(`[paired] meJid=${credentials.meJid ?? '?'}`)
    )

    client.on('connection', async (event) => {
        console.log('[connection]', event.status ?? event)
        if (event.status !== 'open' || manager) return

        manager = setupVoip(client)

        if (!target) {
            console.log('[voip] ready — waiting for incoming calls (auto-accept). Ctrl+C to exit.')
            return
        }
        try {
            if (audioPath) {
                await manager.loadAudio(audioPath)
                console.log(`[voip] audio loaded: ${audioPath}`)
            }
            const callId = await manager.startCall({ peerJid: target, isVideo: false })
            console.log(`[voip] calling ${target} (callId=${callId})`)
        } catch (error) {
            console.error('[voip] failed to start call:', (error as Error).message)
        }
    })

    // Feed raw inbound call stanzas to the engine.
    client.on('debug_transport_node_in', ({ node }) => {
        if (manager) void routeRawNode(manager, client, node)
    })

    process.on('SIGINT', () => {
        console.log('\n[voip] hanging up…')
        void (manager?.endCall().catch(() => {}) ?? Promise.resolve())
            .then(() => client.disconnect())
            .finally(() => process.exit(0))
    })

    await client.connect()
}

function setupVoip(client: WaClient): NativeCallManager {
    const manager = createVoipManager(client.voip, { debug: true })

    manager.on('call:incoming', (call) => {
        console.log(`[voip] incoming call from ${call.peerJid} — auto-accepting`)
        setTimeout(() => {
            manager.acceptCall(call.callId).catch((e) => console.error('[voip] accept:', e.message))
        }, 500)
    })
    manager.on('call:state', (call) => console.log(`[voip] state → ${call.stateData.state}`))
    manager.on('call:ended', () => console.log('[voip] call ended'))
    manager.on('call:error', (err: Error) => console.error('[voip] error:', err.message))

    let audioPackets = 0
    manager.on('call:audio', () => {
        if (++audioPackets % 100 === 0) console.log(`[voip] received ${audioPackets} audio packets`)
    })

    return manager
}

async function routeRawNode(
    manager: NativeCallManager,
    client: WaClient,
    node: BinaryNode
): Promise<void> {
    try {
        if (node.tag === 'call') {
            await routeCallStanza(manager, client.voip, node)
        } else if (node.tag === 'ack' && node.attrs.class === 'call') {
            await routeCallAck(manager, node)
        } else if (node.tag === 'receipt') {
            await routeCallReceipt(client.voip, node)
        }
    } catch (error) {
        console.error('[voip] route error:', (error as Error).message)
    }
}

void main().catch((error) => {
    console.error(error)
    process.exit(1)
})
