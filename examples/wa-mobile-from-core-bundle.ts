import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { createSqliteStore } from '@zapo-js/store-sqlite'

import { createPinoLogger, createStore, WaClient } from '../src'
import { persistCredentials } from '../src/auth/credentials-flow'
import type { WaAuthCredentials, WaMobileTransportDeviceInfo } from '../src/auth/types'
import { base64ToBytes } from '../src/util/bytes'

interface CoreBundle {
    readonly captured_at: number
    readonly register: {
        readonly parsed: {
            readonly login?: string
            readonly lid?: string
            readonly new_jid?: string
            readonly status?: string
            readonly edge_routing_info?: string
            readonly server_time?: number
        }
        readonly raw: string
    }
    readonly keys: {
        readonly generation?: string
        readonly noise: { priv_b64: string; pub_b64: string }
        readonly identity: { priv_b64: string; pub_b64: string; pub_prefixed_b64?: string }
        readonly signedPreKey: { id: number; priv_b64: string; pub_b64: string; sig_b64: string }
        readonly regId: { regId: number }
        readonly deviceInfo?: {
            manufacturer?: string | null
            device?: string | null
            model?: string | null
            deviceBoard?: string | null
            osVersion?: string | null
            osBuildNumber?: string | null
            appVersion?: string | null
            mcc?: string | null
            mnc?: string | null
            localeLanguageIso6391?: string | null
            localeCountryIso31661Alpha2?: string | null
            yearClass?: number | null
            memClass?: number | null
            pushName?: string | null
            phoneId?: string | null
        }
    }
}

function requireBundleDeviceInfo(
    bundle: CoreBundle
): NonNullable<CoreBundle['keys']['deviceInfo']> {
    const d = bundle.keys.deviceInfo
    if (!d) {
        throw new Error(
            'bundle missing keys.deviceInfo — re-run core/ pipeline after updating wa-key-extract.js'
        )
    }
    return d
}

function deviceInfoFromBundle(bundle: CoreBundle): WaMobileTransportDeviceInfo {
    const d = requireBundleDeviceInfo(bundle)
    const required = (name: keyof typeof d): string => {
        const value = d[name]
        if (typeof value !== 'string' || value.length === 0) {
            throw new Error(`bundle deviceInfo.${String(name)} missing or empty`)
        }
        return value
    }
    const optionalString = (name: keyof typeof d): string | undefined => {
        const value = d[name]
        return typeof value === 'string' && value.length > 0 ? value : undefined
    }
    return {
        manufacturer: required('manufacturer'),
        device: required('device'),
        osVersion: required('osVersion'),
        osBuildNumber: required('osBuildNumber'),
        appVersion: required('appVersion'),
        mcc: optionalString('mcc'),
        mnc: optionalString('mnc'),
        localeLanguageIso6391: optionalString('localeLanguageIso6391'),
        localeCountryIso31661Alpha2: optionalString('localeCountryIso31661Alpha2'),
        deviceBoard: optionalString('deviceBoard'),
        deviceModelType: optionalString('model'),
        phoneId: optionalString('phoneId')
    }
}

function transportOptionsFromBundle(bundle: CoreBundle): {
    deviceInfo: WaMobileTransportDeviceInfo
    pushName?: string
    yearClass?: number
    memClass?: number
} {
    const d = requireBundleDeviceInfo(bundle)
    const deviceInfo = deviceInfoFromBundle(bundle)
    const pushName =
        typeof d.pushName === 'string' && d.pushName.length > 0 ? d.pushName : undefined
    const yearClass = typeof d.yearClass === 'number' ? d.yearClass : undefined
    const memClass = typeof d.memClass === 'number' ? d.memClass : undefined
    return { deviceInfo, pushName, yearClass, memClass }
}

function parseArgs(): {
    bundlePath: string
    sessionId: string
} {
    const argv = process.argv.slice(2)
    const get = (flag: string): string | undefined => {
        const i = argv.indexOf(flag)
        return i >= 0 ? argv[i + 1] : undefined
    }
    const bundlePath = get('--bundle')
    if (!bundlePath) {
        console.error(
            'usage: pnpm tsx examples/wa-mobile-from-core-bundle.ts ' +
                '--bundle <acct_*.json> [--session <id>]'
        )
        process.exit(1)
    }
    return {
        bundlePath: resolve(bundlePath),
        sessionId: get('--session') ?? `mobile_${Date.now()}`
    }
}

function credentialsFromBundle(bundle: CoreBundle): WaAuthCredentials {
    const { keys, register } = bundle
    const reg = register.parsed
    if (!reg.login) {
        throw new Error('bundle missing register.parsed.login — not a successful /v2/register')
    }
    if (!keys.regId || typeof keys.regId.regId !== 'number') {
        throw new Error('bundle missing keys.regId.regId — Frida extraction failed?')
    }
    const transport = transportOptionsFromBundle(bundle)
    return {
        noiseKeyPair: {
            privKey: base64ToBytes(keys.noise.priv_b64),
            pubKey: base64ToBytes(keys.noise.pub_b64)
        },
        registrationInfo: {
            registrationId: keys.regId.regId,
            identityKeyPair: {
                privKey: base64ToBytes(keys.identity.priv_b64),
                pubKey: base64ToBytes(keys.identity.pub_b64)
            }
        },
        signedPreKey: {
            keyId: keys.signedPreKey.id,
            keyPair: {
                privKey: base64ToBytes(keys.signedPreKey.priv_b64),
                pubKey: base64ToBytes(keys.signedPreKey.pub_b64)
            },
            signature: base64ToBytes(keys.signedPreKey.sig_b64),
            uploaded: true
        },
        advSecretKey: new Uint8Array(randomBytes(32)),
        meJid: reg.new_jid ?? `${reg.login}@s.whatsapp.net`,
        meLid: reg.lid ? `${reg.lid}@lid` : undefined,
        routingInfo: reg.edge_routing_info ? base64ToBytes(reg.edge_routing_info) : undefined,
        lastSuccessTs: reg.server_time,
        serverHasPreKeys: false,
        platform: 'android',
        deviceInfo: transport.deviceInfo,
        ...(transport.pushName !== undefined ? { pushName: transport.pushName } : {}),
        ...(transport.yearClass !== undefined ? { yearClass: transport.yearClass } : {}),
        ...(transport.memClass !== undefined ? { memClass: transport.memClass } : {})
    }
}

function transportOptionsFromCredentials(creds: WaAuthCredentials): {
    deviceInfo: WaMobileTransportDeviceInfo
    pushName?: string
    yearClass?: number
    memClass?: number
} | null {
    if (!creds.deviceInfo) return null
    return {
        deviceInfo: creds.deviceInfo,
        ...(creds.pushName !== undefined ? { pushName: creds.pushName } : {}),
        ...(creds.yearClass !== undefined ? { yearClass: creds.yearClass } : {}),
        ...(creds.memClass !== undefined ? { memClass: creds.memClass } : {})
    }
}

async function main(): Promise<void> {
    const { bundlePath, sessionId } = parseArgs()
    const bundle = JSON.parse(readFileSync(bundlePath, 'utf-8')) as CoreBundle

    const authPath = resolve(process.cwd(), '.auth', `core_${sessionId}.sqlite`)
    await mkdir(dirname(authPath), { recursive: true })

    const logger = await createPinoLogger({ level: 'trace', pretty: true })
    const store = createStore({
        backends: { sqlite: createSqliteStore({ path: authPath, driver: 'auto' }) },
        providers: {
            auth: 'sqlite',
            signal: 'sqlite',
            senderKey: 'sqlite',
            appState: 'sqlite',
            messages: 'sqlite',
            threads: 'sqlite',
            contacts: 'sqlite',
            privacyToken: 'sqlite',
            identity: 'sqlite',
            preKey: 'sqlite',
            session: 'sqlite'
        }
    })

    const session = store.session(sessionId)
    let existing = await session.auth.load()
    if (existing?.meJid) {
        console.log(
            `[from-bundle] session already seeded (meJid=${existing.meJid}), skipping import`
        )
    } else {
        const creds = credentialsFromBundle(bundle)
        await persistCredentials(
            {
                logger,
                authStore: session.auth,
                signalStore: session.signal,
                preKeyStore: session.preKey
            },
            creds
        )
        existing = creds
        console.log(
            `[from-bundle] imported meJid=${creds.meJid} meLid=${creds.meLid ?? '-'} ` +
                `regId=${creds.registrationInfo.registrationId} routing=${creds.routingInfo ? 'yes' : 'no'}`
        )
    }

    // Prefer the device fingerprint persisted with credentials so subsequent
    // runs are fingerprint-stable even if the bundle file moved or rotated.
    const transportOptions =
        (existing && transportOptionsFromCredentials(existing)) ??
        transportOptionsFromBundle(bundle)

    const client = new WaClient(
        {
            store,
            sessionId,
            connectTimeoutMs: 15_000,
            nodeQueryTimeoutMs: 30_000,
            mobileTransport: { ...transportOptions, passive: false }
        },
        logger
    )
    client.on('connection', (event) => console.log('[connection]', event))
    client.on('message', async (event) => {
        console.log('[message] from', event.senderJid, 'in', event.chatJid)
        console.dir(event.message, { depth: null })

        if (
            event.message &&
            (event.message?.conversation === 'ping' ||
                event.message?.extendedTextMessage?.text === 'ping')
        ) {
            const nowSeconds = Date.now() / 1_000
            const deltaSeconds =
                event.timestampSeconds === undefined ? 0 : nowSeconds - event.timestampSeconds

            await client.sendMessage(event.chatJid!, {
                conversation: `pong ${deltaSeconds.toFixed(3)}`
            })
            await client.chat.setChatMute(event.chatJid!, false)
        }
    })

    client.on('registration_code_received', ({ code, expiryMs, fromDeviceId }) => {
        console.log('registration code received', { code, expiryMs, fromDeviceId })
    })

    client.on(
        'account_takeover_notice',
        ({
            serverToken,
            attemptTimestampMs,
            newDeviceName,
            newDevicePlatform,
            newDeviceAppVersion
        }) => {
            console.log('account takeover notice detected', {
                serverToken,
                attemptTimestampMs,
                newDeviceName,
                newDevicePlatform,
                newDeviceAppVersion
            })
        }
    )

    console.log(`[from-bundle] connecting WaClient (session=${sessionId}) in mobile mode…`)
    await client.connect()
    console.log('[from-bundle] connected — idling. Ctrl-C to exit.')

    const shutdown = async (): Promise<void> => {
        await client.disconnect().catch(() => undefined)
        process.exit(0)
    }
    process.on('SIGINT', () => void shutdown())
    process.on('SIGTERM', () => void shutdown())
}

main().catch((err: unknown) => {
    console.error('[from-bundle] failed:', err)
    process.exit(1)
})
