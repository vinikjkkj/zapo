import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { inspect } from 'node:util'
import { createPinoLogger, WaClient } from './dist'
import type { LogLevel } from './dist'

function resolveLogLevel(value: string | undefined): LogLevel {
    switch (value) {
        case 'trace':
        case 'debug':
        case 'info':
        case 'warn':
        case 'error':
            return value
        default:
            return 'info'
    }
}

async function main(): Promise<void> {
    const authPath = resolve(process.cwd(), '.auth', 'state.json')
    await mkdir(dirname(authPath), { recursive: true })
    if (process.env.EXAMPLE_RESET_AUTH === '1') {
        await rm(authPath, { force: true })
        console.log(`[info] auth reset: ${authPath}`)
    }

    const logger = await createPinoLogger({
        level: resolveLogLevel('trace'),
        pretty:
            process.env.EXAMPLE_PINO_PRETTY === '0'
                ? false
                : {
                      options: {
                          colorize: true,
                          translateTime: 'SYS:standard'
                      }
                  }
    })

    const client = new WaClient(
        {
            authPath,
            connectTimeoutMs: 15_000
        },
        logger
    )

    client.on('connected', () => {
        console.log('[connected]')
    })
    client.on('disconnected', () => {
        console.log('[disconnected]')
    })
    client.on('qr', (qr, ttlMs) => {
        console.log(`[qr] ttlMs=${ttlMs} value=${qr}`)
    })
    client.on('pairing_code', (code) => {
        console.log(`[pairing_code] ${code}`)
    })
    client.on('pairing_refresh', (forceManual) => {
        console.log(`[pairing_refresh] forceManual=${forceManual}`)
    })
    client.on('paired', (credentials) => {
        console.log(`[paired] meJid=${credentials.meJid ?? 'unknown'}`)
    })
    await client.connect()

    if (client.getState().connected)
        await client.sendMessage('5511982905991@s.whatsapp.net', {
            extendedTextMessage: {
                text: `Hello! This is a message from the example client. Current time is ${new Date().toISOString()}`
            }
        })
    const autoExitMs = Number(process.env.EXAMPLE_EXIT_MS ?? '0')
    if (Number.isFinite(autoExitMs) && autoExitMs > 0) {
        setTimeout(() => {
            void shutdown(client, 0)
        }, autoExitMs)
    }

    process.on('SIGINT', () => {
        void shutdown(client, 0)
    })
    process.on('SIGTERM', () => {
        void shutdown(client, 0)
    })
}

async function shutdown(client: WaClient, code: number): Promise<void> {
    await client.disconnect().catch(() => undefined)
    process.exit(code)
}

void main().catch((error) => {
    console.error(error)
    process.exit(1)
})
