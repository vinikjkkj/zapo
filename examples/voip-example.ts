/**
 * Runnable VOIP smoke test for `@zapo-js/voip`.
 *
 * It pairs against its own `.auth/voip.sqlite` store (pass --auth to point it at
 * another one, e.g. the `.auth/state.sqlite` from `npm run example`) and then:
 *   - logs every `voip_*` event,
 *   - auto-accepts incoming calls (disable with --no-accept),
 *   - optionally plays an audio file into the call once it goes active (--audio),
 *   - optionally places an outgoing call (--to),
 *   - always records the decoded inbound audio and writes it to a .wav when the
 *     call ends, so you can actually listen to what arrived.
 *
 * Run:
 *   npx tsx examples/voip-example.ts [flags]
 *
 * Flags:
 *   --to <number|jid>      place an outgoing call after connecting
 *   --audio <path>         audio file to play into the call once active (needs ffmpeg on PATH)
 *   --out <dir>            directory for inbound recordings (default ./recordings)
 *   --max-calls <n>        maxConcurrentCalls (default 1)
 *   --no-accept            do NOT auto-accept incoming calls
 *   --hangup-after-audio   hang up once the played audio finishes sending
 *   --session <id>         session id (default default_2)
 *   --auth <path>          auth sqlite path (default ./.auth/voip.sqlite)
 *   --reset-auth           wipe stored auth and re-pair
 *   --help                 show this help
 *
 * Requirements:
 *   - `@roamhq/wrtc` (already a dev dep here) for the real SCTP relay.
 *   - `--audio` additionally needs an `ffmpeg` binary on PATH.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { createPinoLogger, createStore, type LogLevel, WaClient } from 'zapo-js'

import { createSqliteStore } from '@zapo-js/store-sqlite'
import { CallState, EndCallReason, voipPlugin } from '@zapo-js/voip'

const SAMPLE_RATE = 16_000
// Cap an in-memory recording at ~10 minutes so a long call cannot grow unbounded.
const MAX_RECORD_SAMPLES = SAMPLE_RATE * 60 * 10

interface Cli {
    to?: string
    audio?: string
    out: string
    maxCalls: number
    autoAccept: boolean
    hangupAfterAudio: boolean
    session: string
    authPath: string
    resetAuth: boolean
}

const USAGE = `usage: npx tsx examples/voip-example.ts [flags]

  --to <number|jid>      place an outgoing call after connecting
  --audio <path>         audio file to play into the call once active (needs ffmpeg)
  --out <dir>            directory for inbound recordings (default ./recordings)
  --max-calls <n>        maxConcurrentCalls (default 1)
  --no-accept            do NOT auto-accept incoming calls
  --hangup-after-audio   hang up once the played audio finishes
  --session <id>         session id (default default_2)
  --auth <path>          auth sqlite path (default ./.auth/voip.sqlite)
  --reset-auth           wipe stored auth and re-pair
  --help                 show this help`

function parseArgs(argv: readonly string[]): Cli {
    const cli: Cli = {
        out: resolve(process.cwd(), 'recordings'),
        maxCalls: 1,
        autoAccept: true,
        hangupAfterAudio: false,
        session: 'voip',
        authPath: resolve(process.cwd(), '.auth', 'voip.sqlite'),
        resetAuth: false
    }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        const eq = arg.indexOf('=')
        const key = eq >= 0 ? arg.slice(0, eq) : arg
        const inline = eq >= 0 ? arg.slice(eq + 1) : undefined
        const value = (): string => {
            if (inline !== undefined) {
                return inline
            }
            const next = argv[i + 1]
            if (next === undefined || next.startsWith('--')) {
                throw new Error(`missing value for ${key}`)
            }
            i += 1
            return next
        }
        switch (key) {
            case '--to':
                cli.to = value()
                break
            case '--audio':
                cli.audio = value()
                break
            case '--out':
                cli.out = resolve(value())
                break
            case '--max-calls':
                cli.maxCalls = Number(value()) || 1
                break
            case '--no-accept':
                cli.autoAccept = false
                break
            case '--hangup-after-audio':
                cli.hangupAfterAudio = true
                break
            case '--session':
                cli.session = value()
                break
            case '--auth':
                cli.authPath = resolve(value())
                break
            case '--reset-auth':
                cli.resetAuth = true
                break
            case '--help':
            case '-h':
                console.log(USAGE)
                process.exit(0)
                break
            default:
                throw new Error(`unknown flag: ${key} (try --help)`)
        }
    }
    return cli
}

function toJid(input: string): string {
    if (input.includes('@')) {
        return input
    }
    const digits = input.replace(/[^0-9]/g, '')
    return `${digits}@s.whatsapp.net`
}

/** Per-call accumulator of decoded inbound PCM frames. */
const recordings = new Map<string, { frames: Float32Array[]; samples: number; capped: boolean }>()

function recordInbound(callId: string, pcm: Float32Array): void {
    let rec = recordings.get(callId)
    if (!rec) {
        rec = { frames: [], samples: 0, capped: false }
        recordings.set(callId, rec)
        console.log(`[voip] receiving inbound audio on ${callId}`)
    }
    if (rec.samples >= MAX_RECORD_SAMPLES) {
        if (!rec.capped) {
            rec.capped = true
            console.log(`[voip] recording cap reached for ${callId}, dropping further audio`)
        }
        return
    }
    rec.frames.push(pcm)
    rec.samples += pcm.length
}

async function flushRecording(callId: string, outDir: string): Promise<void> {
    const rec = recordings.get(callId)
    recordings.delete(callId)
    if (!rec || rec.samples === 0) {
        console.log(`[voip] no inbound audio captured for ${callId}, nothing to save`)
        return
    }
    const pcm = new Float32Array(rec.samples)
    let offset = 0
    for (const frame of rec.frames) {
        pcm.set(frame, offset)
        offset += frame.length
    }
    const outPath = resolve(outDir, `${callId}.wav`)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, encodeWav(pcm, SAMPLE_RATE))
    const seconds = (rec.samples / SAMPLE_RATE).toFixed(1)
    console.log(`[voip] saved ${seconds}s of inbound audio to ${outPath}`)
}

/** Minimal 16-bit mono PCM WAV encoder. */
function encodeWav(pcm: Float32Array, sampleRate: number): Uint8Array {
    const dataSize = pcm.length * 2
    const buffer = new ArrayBuffer(44 + dataSize)
    const view = new DataView(buffer)
    const writeString = (at: number, text: string): void => {
        for (let i = 0; i < text.length; i++) {
            view.setUint8(at + i, text.charCodeAt(i))
        }
    }
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeString(36, 'data')
    view.setUint32(40, dataSize, true)
    let offset = 44
    for (let i = 0; i < pcm.length; i++) {
        const sample = Math.max(-1, Math.min(1, pcm[i]))
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
        offset += 2
    }
    return new Uint8Array(buffer)
}

async function main(): Promise<void> {
    const cli = parseArgs(process.argv.slice(2))

    await mkdir(dirname(cli.authPath), { recursive: true })
    if (cli.resetAuth) {
        await rm(cli.authPath, { force: true })
        console.log(`[info] auth reset: ${cli.authPath}`)
    }

    const logger = await createPinoLogger({
        level: (process.env.EXAMPLE_LOG_LEVEL as LogLevel | undefined) ?? 'trace',
        pretty: true
    })

    const store = createStore({
        backends: {
            sqlite: createSqliteStore({ path: cli.authPath, driver: 'auto' })
        },
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

    const client = new WaClient(
        {
            store,
            sessionId: cli.session,
            connectTimeoutMs: 15_000,
            deviceBrowser: 'Chrome',
            deviceOsDisplayName: 'Windows',
            plugins: [voipPlugin({ maxConcurrentCalls: cli.maxCalls, logLevel: 'info' })]
        },
        logger
    )

    // Tracks calls we already started playback on, so an Active re-emit does not double-play.
    const played = new Set<string>()

    const maybePlayAudio = async (callId: string): Promise<void> => {
        if (!cli.audio || played.has(callId)) {
            return
        }
        played.add(callId)
        try {
            await client.voip.loadAudio(callId, cli.audio)
            console.log(`[voip] playing ${cli.audio} into ${callId}`)
        } catch (error) {
            console.log(
                `[voip] loadAudio failed for ${callId} (is ffmpeg installed?):`,
                error instanceof Error ? error.message : error
            )
        }
    }

    client.on('connection', (event) => {
        console.log(`[connection] ${event.status}`)
    })
    client.on('auth_qr', ({ qr, ttlMs }) => {
        console.log(`[qr] ttlMs=${ttlMs} value=${qr}`)
        console.log('[qr] render this string as a QR and scan it from WhatsApp > Linked devices')
    })
    client.on('auth_pairing_code', ({ code }) => {
        console.log(`[pairing_code] ${code}`)
    })
    client.on('auth_paired', ({ credentials }) => {
        console.log(`[paired] meJid=${credentials.meJid ?? 'unknown'}`)
    })

    client.on('voip_call_incoming', async (call) => {
        console.log(
            `[voip] incoming call ${call.callId} from ${call.peerJid}` +
                ` (canAccept=${call.canAccept}, callerPn=${call.callerPn ?? '-'})`
        )
        if (!cli.autoAccept) {
            console.log('[voip] auto-accept disabled; leaving it ringing')
            return
        }
        if (!call.canAccept) {
            console.log('[voip] cannot accept yet (slot busy); it will wait for a free slot')
            return
        }
        try {
            await client.voip.acceptCall(call.callId)
            console.log(`[voip] accepted ${call.callId}`)
        } catch (error) {
            console.log('[voip] acceptCall failed:', error instanceof Error ? error.message : error)
        }
    })

    client.on('voip_call_state', async (call) => {
        console.log(`[voip] call ${call.callId} -> ${call.stateData.state}`)
        if (call.stateData.state === CallState.Active) {
            await maybePlayAudio(call.callId)
        }
    })

    client.on('voip_call_inbound_audio', (call, pcm) => {
        recordInbound(call.callId, pcm)
    })

    client.on('voip_call_outbound_audio_finished', async (call) => {
        console.log(`[voip] outbound audio finished on ${call.callId}`)
        if (cli.hangupAfterAudio) {
            await client.voip.endCall(call.callId, EndCallReason.UserEnded).catch(() => undefined)
        }
    })

    client.on('voip_call_ended', async (call) => {
        const reason = call.stateData.endReason ?? 'unknown'
        const duration = call.stateData.durationSecs ?? 0
        console.log(`[voip] call ${call.callId} ended (reason=${reason}, duration=${duration}s)`)
        played.delete(call.callId)
        await flushRecording(call.callId, cli.out).catch((error) =>
            console.log('[voip] failed to save recording:', error)
        )
    })

    client.on('voip_call_error', (error) => {
        console.log('[voip] call error:', error.message)
    })

    await client.connect()

    if (cli.to) {
        const peerJid = toJid(cli.to)
        try {
            const callId = await client.voip.startCall({ peerJid })
            console.log(`[voip] outgoing call ${callId} -> ${peerJid}`)
        } catch (error) {
            console.log('[voip] startCall failed:', error instanceof Error ? error.message : error)
        }
    }

    const shutdown = async (): Promise<void> => {
        console.log('\n[info] shutting down, ending active calls...')
        for (const call of client.voip.getCalls()) {
            if (!call.isEnded) {
                await client.voip.endCall(call.callId).catch(() => undefined)
            }
        }
        // The voip_call_ended handler writes asynchronously; flush whatever is
        // still buffered here so a recording is never lost to process.exit.
        for (const callId of [...recordings.keys()]) {
            await flushRecording(callId, cli.out).catch(() => undefined)
        }
        await client.disconnect().catch(() => undefined)
        process.exit(0)
    }

    process.on('SIGINT', () => void shutdown())
    process.on('SIGTERM', () => void shutdown())
}

void main().catch((error) => {
    console.error(error)
    process.exit(1)
})
