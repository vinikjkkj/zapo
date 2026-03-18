import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'

import {
    buildCommsConfig,
    loadOrCreateCredentials,
    persistCredentials
} from '@auth/flow/WaAuthCredentialsFlow'
import type { WaAuthCredentials } from '@auth/types'
import type { Logger } from '@infra/log/types'
import { WaSignalMemoryStore } from '@store/providers/memory/signal.store'
import type { WaProxyDispatcher } from '@transport/types'

function createLogger(): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
    }
}

function createCredentials(): WaAuthCredentials {
    return {
        noiseKeyPair: {
            pubKey: new Uint8Array(32).fill(1),
            privKey: new Uint8Array(32).fill(2)
        },
        registrationInfo: {
            registrationId: 10,
            identityKeyPair: {
                pubKey: new Uint8Array(32).fill(3),
                privKey: new Uint8Array(32).fill(4)
            }
        },
        signedPreKey: {
            keyId: 5,
            keyPair: {
                pubKey: new Uint8Array(32).fill(6),
                privKey: new Uint8Array(32).fill(7)
            },
            signature: new Uint8Array(64).fill(8),
            uploaded: false
        },
        advSecretKey: new Uint8Array(32).fill(9),
        meJid: '5511999999999:2@s.whatsapp.net',
        serverHasPreKeys: false
    }
}

test('auth flow persists and restores existing credentials', async () => {
    const credentials = createCredentials()
    let saved: WaAuthCredentials | null = credentials

    const authStore = {
        load: async () => saved,
        save: async (next: WaAuthCredentials) => {
            saved = next
        },
        clear: async () => {
            saved = null
        }
    }
    const signalStore = new WaSignalMemoryStore()

    const loaded = await loadOrCreateCredentials({
        logger: createLogger(),
        authStore,
        signalStore
    })

    assert.equal(loaded.meJid, credentials.meJid)
    await persistCredentials(
        { logger: createLogger(), authStore, signalStore },
        {
            ...loaded,
            meDisplayName: 'Tester'
        }
    )
    assert.equal(saved?.meDisplayName, 'Tester')
})

test('buildCommsConfig switches between login and registration payloads', () => {
    const logger = createLogger()
    const credentials = createCredentials()
    const wsDispatcher: WaProxyDispatcher = {
        dispatch: () => undefined
    }

    const loginConfig = buildCommsConfig(
        logger,
        credentials,
        {
            url: 'wss://web.whatsapp.com/ws/chat',
            urls: ['wss://backup'],
            connectTimeoutMs: 10,
            reconnectIntervalMs: 20,
            timeoutIntervalMs: 30,
            maxReconnectAttempts: 40,
            proxy: {
                ws: wsDispatcher
            }
        },
        {
            deviceBrowser: 'Chrome',
            deviceOsDisplayName: 'Windows',
            requireFullSync: false
        }
    )

    assert.equal(loginConfig.noise.isRegistered, true)
    assert.ok(loginConfig.noise.loginPayloadConfig)
    assert.equal(loginConfig.noise.registrationPayloadConfig, undefined)
    assert.equal(loginConfig.dispatcher, wsDispatcher)
    assert.equal(loginConfig.agent, undefined)

    const registrationConfig = buildCommsConfig(
        logger,
        { ...credentials, meJid: undefined },
        {
            url: 'wss://web.whatsapp.com/ws/chat'
        },
        {
            deviceBrowser: 'Chrome',
            deviceOsDisplayName: 'Windows',
            requireFullSync: true
        }
    )

    assert.equal(registrationConfig.noise.isRegistered, false)
    assert.ok(registrationConfig.noise.registrationPayloadConfig)
})

test('buildCommsConfig maps ws proxy agent when provided', () => {
    const wsAgent = new http.Agent({ keepAlive: true })
    const config = buildCommsConfig(
        createLogger(),
        createCredentials(),
        {
            url: 'wss://web.whatsapp.com/ws/chat',
            proxy: {
                ws: wsAgent
            }
        },
        {
            deviceBrowser: 'Chrome',
            deviceOsDisplayName: 'Windows',
            requireFullSync: false
        }
    )

    assert.equal(config.dispatcher, undefined)
    assert.equal(config.agent, wsAgent)
    wsAgent.destroy()
})
