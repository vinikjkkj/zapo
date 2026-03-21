import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test, { type TestContext } from 'node:test'

import type { WaClientEventMap } from '@client/types'
import { WaClient } from '@client/WaClient'
import { ConsoleLogger } from '@infra/log/ConsoleLogger'
import type { LogLevel } from '@infra/log/types'
import { createStore } from '@store'
import { resolvePositive } from '@util/coercion'
import { parseOptionalInt } from '@util/primitives'

const FLOW_ENV_ENABLED = 'WA_FLOW_TESTS'
const FLOW_ENV_RESET_AUTH = 'WA_FLOW_RESET_AUTH'
const FLOW_ENV_SQLITE_PATH = 'WA_FLOW_SQLITE_PATH'
const FLOW_ENV_SESSION_ID = 'WA_FLOW_SESSION_ID'
const FLOW_ENV_CONNECT_TIMEOUT_MS = 'WA_FLOW_CONNECT_TIMEOUT_MS'
const FLOW_ENV_TEST_TIMEOUT_MS = 'WA_FLOW_TEST_TIMEOUT_MS'
const FLOW_ENV_LOG_LEVEL = 'WA_FLOW_LOG_LEVEL'
const FLOW_ENV_SEND_MESSAGE = 'WA_FLOW_SEND_MESSAGE'
const FLOW_ENV_TARGET_JID = 'WA_FLOW_TARGET_JID'
const FLOW_ENV_MESSAGE_TEXT = 'WA_FLOW_MESSAGE_TEXT'
const FLOW_ENV_RECONNECT = 'WA_FLOW_RECONNECT'
const FLOW_ENV_CLEANUP_AUTH = 'WA_FLOW_CLEANUP_AUTH'

const DEFAULT_FLOW_SQLITE_PATH = '.auth/flow/state.sqlite'
const DEFAULT_FLOW_SESSION_ID = 'flow'
const DEFAULT_CONNECT_TIMEOUT_MS = 20_000
const DEFAULT_TEST_TIMEOUT_MS = 180_000
const CONNECTION_EVENT_GRACE_MS = 20_000

interface FlowHarness {
    readonly client: WaClient
    readonly cleanup: () => Promise<void>
}

function resolveLogLevel(raw: string | undefined): LogLevel {
    if (raw === 'trace' || raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
        return raw
    }
    return 'warn'
}

function isFlowEnabled(): boolean {
    return process.env[FLOW_ENV_ENABLED] === '1'
}

function shouldSendMessage(): boolean {
    return process.env[FLOW_ENV_SEND_MESSAGE] === '1'
}

function shouldReconnect(): boolean {
    return process.env[FLOW_ENV_RECONNECT] !== '0'
}

function shouldCleanupAuth(): boolean {
    return process.env[FLOW_ENV_CLEANUP_AUTH] === '1'
}

function ensureFlowEnabled(t: TestContext): boolean {
    if (isFlowEnabled()) {
        return true
    }
    t.skip(
        `set ${FLOW_ENV_ENABLED}=1 to run real connection flow tests (optional: ${FLOW_ENV_SEND_MESSAGE}=1)`
    )
    return false
}

function getFlowConnectTimeoutMs(): number {
    const parsed = parseOptionalInt(process.env[FLOW_ENV_CONNECT_TIMEOUT_MS])
    return resolvePositive(
        parsed !== undefined && parsed > 0 ? parsed : undefined,
        DEFAULT_CONNECT_TIMEOUT_MS,
        FLOW_ENV_CONNECT_TIMEOUT_MS
    )
}

function waitForClientEvent<K extends keyof WaClientEventMap>(
    client: WaClient,
    eventName: K,
    timeoutMs: number
): Promise<Parameters<WaClientEventMap[K]>[0]> {
    return new Promise<Parameters<WaClientEventMap[K]>[0]>((resolveEvent, rejectEvent) => {
        const onEvent: WaClientEventMap[K] = ((payload: Parameters<WaClientEventMap[K]>[0]) => {
            clearTimeout(timer)
            client.off(eventName, onEvent)
            resolveEvent(payload)
        }) as WaClientEventMap[K]

        const timer = setTimeout(() => {
            client.off(eventName, onEvent)
            rejectEvent(
                new Error(`timed out waiting event ${String(eventName)} after ${timeoutMs}ms`)
            )
        }, timeoutMs)

        client.on(eventName, onEvent)
    })
}

async function createFlowHarness(connectTimeoutMs: number): Promise<FlowHarness> {
    const sqlitePath = resolve(
        process.cwd(),
        process.env[FLOW_ENV_SQLITE_PATH] ?? DEFAULT_FLOW_SQLITE_PATH
    )
    await mkdir(dirname(sqlitePath), { recursive: true })
    if (process.env[FLOW_ENV_RESET_AUTH] === '1') {
        await rm(sqlitePath, { force: true })
    }

    const store = createStore({
        sqlite: {
            path: sqlitePath,
            driver: 'auto'
        },
        providers: {
            messages: 'sqlite',
            threads: 'sqlite',
            contacts: 'sqlite'
        }
    })
    const sessionId = process.env[FLOW_ENV_SESSION_ID] ?? DEFAULT_FLOW_SESSION_ID
    const client = new WaClient(
        {
            store,
            sessionId,
            connectTimeoutMs,
            nodeQueryTimeoutMs: connectTimeoutMs,
            history: {
                enabled: false
            }
        },
        new ConsoleLogger(resolveLogLevel(process.env[FLOW_ENV_LOG_LEVEL]))
    )

    return {
        client,
        cleanup: async () => {
            await client.disconnect().catch(() => undefined)
            await store.destroy().catch(() => undefined)
            if (shouldCleanupAuth()) {
                await rm(sqlitePath, { force: true }).catch(() => undefined)
            }
        }
    }
}

test(
    '[flow] real connection lifecycle and optional message publish',
    {
        timeout: resolvePositive(
            (() => {
                const parsed = parseOptionalInt(process.env[FLOW_ENV_TEST_TIMEOUT_MS])
                return parsed !== undefined && parsed > 0 ? parsed : undefined
            })(),
            DEFAULT_TEST_TIMEOUT_MS,
            FLOW_ENV_TEST_TIMEOUT_MS
        )
    },
    async (t) => {
        if (!ensureFlowEnabled(t)) {
            return
        }

        const connectTimeoutMs = getFlowConnectTimeoutMs()
        const harness = await createFlowHarness(connectTimeoutMs)
        t.after(async () => {
            await harness.cleanup()
        })

        await t.test('connects and emits connection_open', async () => {
            const openEvent = waitForClientEvent(
                harness.client,
                'connection_open',
                connectTimeoutMs + CONNECTION_EVENT_GRACE_MS
            )

            await harness.client.connect()
            await openEvent
            assert.equal(harness.client.getState().connected, true)
        })

        await t.test('optionally publishes a real message and receives ack', async (subtest) => {
            if (!shouldSendMessage()) {
                subtest.skip(
                    `set ${FLOW_ENV_SEND_MESSAGE}=1 to enable message publish in flow test`
                )
                return
            }

            const credentials = harness.client.getCredentials()
            if (!credentials?.meJid) {
                subtest.skip('message publish requires a registered session (meJid)')
                return
            }
            const targetJid = process.env[FLOW_ENV_TARGET_JID] ?? credentials.meJid
            const text =
                process.env[FLOW_ENV_MESSAGE_TEXT] ??
                `flow ping ${new Date().toISOString()} session=${process.env[FLOW_ENV_SESSION_ID] ?? DEFAULT_FLOW_SESSION_ID}`

            const result = await harness.client.sendMessage(targetJid, text, {
                ackTimeoutMs: connectTimeoutMs,
                maxAttempts: 2,
                retryDelayMs: 500
            })

            assert.ok(result.id.length > 0)
            assert.ok(result.attempts >= 1)
            assert.equal(result.ackNode.tag === 'ack' || result.ackNode.tag === 'receipt', true)
        })

        await t.test('disconnects and optionally reconnects', async () => {
            await harness.client.disconnect()
            assert.equal(harness.client.getState().connected, false)

            if (!shouldReconnect()) {
                return
            }

            const reopenEvent = waitForClientEvent(
                harness.client,
                'connection_open',
                connectTimeoutMs + CONNECTION_EVENT_GRACE_MS
            )
            await harness.client.connect()
            await reopenEvent
            assert.equal(harness.client.getState().connected, true)
        })
    }
)
