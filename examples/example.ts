import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { createPinoLogger, createStore, WaClient } from '../src'
import type { LogLevel } from '../src'

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

const extractIncomingText = (
    message:
        | {
              conversation?: string | null
              extendedTextMessage?: { text?: string | null } | null
          }
        | null
        | undefined
): string | undefined => {
    if (!message) {
        return undefined
    }
    if (typeof message.conversation === 'string' && message.conversation.length > 0) {
        return message.conversation
    }
    const extendedText = message.extendedTextMessage?.text
    if (typeof extendedText === 'string' && extendedText.length > 0) {
        return extendedText
    }
    return undefined
}

async function main(): Promise<void> {
    const authPath = resolve(process.cwd(), '.auth', 'state.sqlite')
    await mkdir(dirname(authPath), { recursive: true })
    if (process.env.EXAMPLE_RESET_AUTH === '1') {
        await rm(authPath, { force: true })
        console.log(`[info] auth reset: ${authPath}`)
    }

    const logger = await createPinoLogger({
        level: resolveLogLevel('trace'),
        pretty: true
    })

    //const sessionId_1 = process.env.EXAMPLE_SESSION_ID ?? 'default'
    const sessionId_2 = process.env.EXAMPLE_SESSION_ID_2 ?? 'default_2'
    const store = createStore({
        sqlite: {
            path: authPath,
            driver: 'auto'
        },
        providers: {
            messages: 'sqlite',
            threads: 'sqlite',
            contacts: 'sqlite'
        }
    })

    const client_1 = new WaClient(
        {
            store,
            sessionId: sessionId_2,
            connectTimeoutMs: 15_000,
            deviceBrowser: 'Chrome',
            deviceOsDisplayName: 'Windows',
            history: {
                enabled: true,
                requireFullSync: true
            },
            nodeQueryTimeoutMs: 30_000
        },
        logger
    )

    await startSession(client_1)
    //await startSession(client_2)

    const autoExitMs = Number(process.env.EXAMPLE_EXIT_MS ?? '0')
    if (Number.isFinite(autoExitMs) && autoExitMs > 0) {
        setTimeout(() => {
            void shutdown(client_1, 0)
        }, autoExitMs)
    }

    process.on('SIGINT', () => {
        void shutdown(client_1, 0)
    })
    process.on('SIGTERM', () => {
        void shutdown(client_1, 0)
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

async function startSession(client: WaClient): Promise<void> {
    client.on('auth_qr', ({ qr, ttlMs }) => {
        console.log(`[qr] ttlMs=${ttlMs} value=${qr}`)
    })
    client.on('auth_pairing_code', ({ code }) => {
        console.log(`[pairing_code] ${code}`)
    })
    client.on('auth_pairing_refresh', ({ forceManual }) => {
        console.log(`[pairing_refresh] forceManual=${forceManual}`)
    })
    client.on('auth_paired', ({ credentials }) => {
        console.log(`[paired] meJid=${credentials.meJid ?? 'unknown'}`)
    })
    client.on('message', async (event) => {
        const text = extractIncomingText(event.message)
        console.log('[incoming_message] mensagem completa:')
        console.dir(event.message ?? event, { depth: null })
        if (!text || text.trim().toLowerCase() !== 'ping') {
            return
        }
        const to = event.chatJid ?? event.senderJid
        if (!to) {
            console.log('[incoming_message] ping sem destino para responder')
            return
        }
        const nowSeconds = Date.now() / 1_000
        const deltaSeconds =
            event.timestampSeconds === undefined ? 0 : nowSeconds - event.timestampSeconds
        await client.sendMessage(to, {
            extendedTextMessage: {
                text: `pong ${deltaSeconds.toFixed(3)}`
            }
        })
        console.log(`[incoming_message] pong enviado para ${to}`)
    })
    client.on('group_event', (event) => {
        console.log('[group_event] evento de grupo recebido:')
        console.dir(event, { depth: null })
    })
    client.on('chat_event', (event) => {
        console.log('[chat_event] evento de chat recebido:')
        console.dir(event, { depth: null })
    })

    await client.connect()
}
