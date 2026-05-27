import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'

import {
    buildCommsConfig,
    loadOrCreateCredentials,
    persistCredentials
} from '@auth/credentials-flow'
import type { WaAuthCredentials } from '@auth/types'
import { createNoopLogger } from '@infra/log/types'
import { WaPreKeyMemoryStore } from '@store/memory/pre-key.store'
import { WaSignalMemoryStore } from '@store/memory/signal.store'
import type { WaProxyDispatcher } from '@transport/types'

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
    const preKeyStore = new WaPreKeyMemoryStore()

    const loaded = await loadOrCreateCredentials({
        logger: createNoopLogger(),
        authStore,
        signalStore,
        preKeyStore
    })

    assert.equal(loaded.meJid, credentials.meJid)
    await persistCredentials(
        { logger: createNoopLogger(), authStore, signalStore, preKeyStore },
        {
            ...loaded,
            meDisplayName: 'Tester'
        }
    )
    assert.equal(saved?.meDisplayName, 'Tester')
})

test('buildCommsConfig switches between login and registration payloads', async () => {
    const logger = createNoopLogger()
    const credentials = createCredentials()
    const version = '2.3000.1020607560'
    const wsDispatcher: WaProxyDispatcher = {
        dispatch: () => undefined
    }

    const loginConfig = await buildCommsConfig(
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
            requireFullSync: false,
            version
        }
    )

    assert.equal(loginConfig.noise.isRegistered, true)
    assert.ok(loginConfig.noise.loginPayloadConfig)
    assert.equal(loginConfig.noise.registrationPayloadConfig, undefined)
    assert.equal(loginConfig.noise.loginPayloadConfig?.versionBase, version)
    assert.equal(loginConfig.dispatcher, wsDispatcher)
    assert.equal(loginConfig.agent, undefined)

    const registrationConfig = await buildCommsConfig(
        logger,
        { ...credentials, meJid: undefined },
        {
            url: 'wss://web.whatsapp.com/ws/chat'
        },
        {
            deviceBrowser: 'Chrome',
            deviceOsDisplayName: 'Windows',
            requireFullSync: true,
            version
        }
    )

    assert.equal(registrationConfig.noise.isRegistered, false)
    assert.ok(registrationConfig.noise.registrationPayloadConfig)
    assert.equal(registrationConfig.noise.registrationPayloadConfig?.versionBase, version)
})

test('buildCommsConfig resolves async version function once per call', async () => {
    let calls = 0
    const resolver = async () => {
        calls += 1
        return '2.3000.9999999'
    }
    const config = await buildCommsConfig(
        createNoopLogger(),
        createCredentials(),
        { url: 'wss://web.whatsapp.com/ws/chat' },
        {
            deviceBrowser: 'Chrome',
            deviceOsDisplayName: 'Linux',
            requireFullSync: false,
            version: resolver
        }
    )
    assert.equal(calls, 1)
    assert.equal(config.noise.loginPayloadConfig?.versionBase, '2.3000.9999999')
})

test('buildCommsConfig rejects version resolvers that return a non-string', async () => {
    await assert.rejects(
        () =>
            buildCommsConfig(
                createNoopLogger(),
                createCredentials(),
                { url: 'wss://web.whatsapp.com/ws/chat' },
                {
                    requireFullSync: false,
                    version: (() => undefined) as unknown as () => string
                }
            ),
        /version resolver returned a non-string value/
    )
})

test('buildCommsConfig maps ws proxy agent when provided', async () => {
    const wsAgent = new http.Agent({ keepAlive: true })
    const config = await buildCommsConfig(
        createNoopLogger(),
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

test('buildCommsConfig falls back to credentials.deviceInfo when mobileTransport option is absent', async () => {
    const credentials: WaAuthCredentials = {
        ...createCredentials(),
        deviceInfo: {
            manufacturer: 'Google',
            device: 'panther',
            osVersion: '14',
            osBuildNumber: 'AP3A',
            appVersion: '2.26.15.11'
        },
        pushName: 'tester',
        yearClass: 2022,
        memClass: 4096
    }
    const config = await buildCommsConfig(
        createNoopLogger(),
        credentials,
        { url: 'wss://web.whatsapp.com/ws/chat' },
        { requireFullSync: false }
    )
    assert.equal(config.url, 'tcp://g.whatsapp.net:443')
    assert.ok(config.rawWebSocketConstructor, 'expected mobile raw socket ctor')
    assert.equal(config.noise?.isRegistered, true)
    assert.ok(config.noise?.loginPayload, 'expected login payload')
})

test('buildCommsConfig prefers explicit mobileTransport option over credentials.deviceInfo', async () => {
    const credentials: WaAuthCredentials = {
        ...createCredentials(),
        deviceInfo: {
            manufacturer: 'Google',
            device: 'panther',
            osVersion: '14',
            osBuildNumber: 'AP3A',
            appVersion: '2.26.15.11'
        }
    }
    const config = await buildCommsConfig(
        createNoopLogger(),
        credentials,
        { url: 'wss://web.whatsapp.com/ws/chat' },
        {
            requireFullSync: false,
            mobileTransport: {
                deviceInfo: {
                    manufacturer: 'Xiaomi',
                    device: 'redfin',
                    osVersion: '13',
                    osBuildNumber: 'TQ3A',
                    appVersion: '2.26.16.0'
                },
                tcpUrl: 'tcp://override.example:443'
            }
        }
    )
    assert.equal(config.url, 'tcp://override.example:443')
})
