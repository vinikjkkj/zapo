import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { AppStateCollectionName, WaAppStateStoreData } from '../../appstate/types'
import { proto } from '../../proto'
import type { Proto } from '../../proto'
import { base64ToBytes, bytesToBase64 } from '../../util/base64'
import { cloneBytes } from '../../util/bytes'
import type { WaAuthCredentials } from '../types'

interface SerializedSignalKeyPair {
    readonly pubKey: string
    readonly privKey: string
}

interface SerializedAuthCredentials {
    readonly noiseKeyPair: SerializedSignalKeyPair
    readonly registrationInfo: {
        readonly registrationId: number
        readonly identityKeyPair: SerializedSignalKeyPair
    }
    readonly signedPreKey: {
        readonly keyId: number
        readonly keyPair: SerializedSignalKeyPair
        readonly signature: string
        readonly uploaded?: boolean
    }
    readonly advSecretKey: string
    readonly signedIdentity?: string
    readonly meJid?: string
    readonly meLid?: string
    readonly meDisplayName?: string
    readonly companionEncStatic?: string
    readonly platform?: string
    readonly serverStaticKey?: string
    readonly serverHasPreKeys?: boolean
    readonly routingInfo?: string
    readonly lastSuccessTs?: number
    readonly propsVersion?: number
    readonly abPropsVersion?: number
    readonly connectionLocation?: string
    readonly accountCreationTs?: number
    readonly appState?: SerializedAppStateStoreData
}

interface SerializedAppStateCollection {
    readonly version: number
    readonly hash: string
    readonly indexValueMap: Record<string, string>
}

interface SerializedAppStateStoreData {
    readonly keys: readonly {
        readonly keyId: string
        readonly keyData: string
        readonly timestamp: number
        readonly fingerprint?: Proto.Message.IAppStateSyncKeyFingerprint
    }[]
    readonly collections: Partial<Record<AppStateCollectionName, SerializedAppStateCollection>>
}

function encodeKeyPair(pair: {
    readonly pubKey: Uint8Array
    readonly privKey: Uint8Array
}): SerializedSignalKeyPair {
    return {
        pubKey: bytesToBase64(pair.pubKey),
        privKey: bytesToBase64(pair.privKey)
    }
}

function decodeKeyPair(
    pair: SerializedSignalKeyPair,
    field: string
): {
    readonly pubKey: Uint8Array
    readonly privKey: Uint8Array
} {
    return {
        pubKey: base64ToBytes(pair.pubKey, `${field}.pubKey`),
        privKey: base64ToBytes(pair.privKey, `${field}.privKey`)
    }
}

function encodeAppStateStoreData(data: WaAppStateStoreData): SerializedAppStateStoreData {
    const keys = data.keys.map((item) => ({
        keyId: bytesToBase64(item.keyId),
        keyData: bytesToBase64(item.keyData),
        timestamp: item.timestamp,
        fingerprint: item.fingerprint
    }))
    const collections: Partial<Record<AppStateCollectionName, SerializedAppStateCollection>> = {}
    for (const [collectionName, collectionState] of Object.entries(data.collections) as readonly [
        AppStateCollectionName,
        WaAppStateStoreData['collections'][AppStateCollectionName]
    ][]) {
        if (!collectionState) {
            continue
        }
        const indexValueMap: Record<string, string> = {}
        for (const [indexMacHex, valueMac] of Object.entries(collectionState.indexValueMap)) {
            indexValueMap[indexMacHex] = bytesToBase64(valueMac)
        }
        collections[collectionName] = {
            version: collectionState.version,
            hash: bytesToBase64(collectionState.hash),
            indexValueMap
        }
    }
    return { keys, collections }
}

function decodeAppStateStoreData(data: SerializedAppStateStoreData): WaAppStateStoreData {
    const keys = data.keys.map((item) => ({
        keyId: base64ToBytes(item.keyId, 'appState.keys[].keyId'),
        keyData: base64ToBytes(item.keyData, 'appState.keys[].keyData'),
        timestamp: item.timestamp,
        fingerprint: item.fingerprint
    }))
    const collections: Partial<
        Record<AppStateCollectionName, WaAppStateStoreData['collections'][AppStateCollectionName]>
    > = {}
    for (const [collectionName, collectionState] of Object.entries(data.collections) as readonly [
        AppStateCollectionName,
        SerializedAppStateCollection | undefined
    ][]) {
        if (!collectionState) {
            continue
        }
        const indexValueMap: Record<string, Uint8Array> = {}
        for (const [indexMacHex, valueMacBase64] of Object.entries(collectionState.indexValueMap)) {
            indexValueMap[indexMacHex] = base64ToBytes(
                valueMacBase64,
                `appState.collections.${collectionName}.indexValueMap.${indexMacHex}`
            )
        }
        collections[collectionName] = {
            version: collectionState.version,
            hash: base64ToBytes(
                collectionState.hash,
                `appState.collections.${collectionName}.hash`
            ),
            indexValueMap
        }
    }
    return {
        keys,
        collections
    }
}

function cloneAppStateStoreData(data: WaAppStateStoreData): WaAppStateStoreData {
    const keys = data.keys.map((item) => ({
        keyId: cloneBytes(item.keyId),
        keyData: cloneBytes(item.keyData),
        timestamp: item.timestamp,
        fingerprint: item.fingerprint
            ? {
                  rawId: item.fingerprint.rawId,
                  currentIndex: item.fingerprint.currentIndex,
                  deviceIndexes: item.fingerprint.deviceIndexes
                      ? [...item.fingerprint.deviceIndexes]
                      : []
              }
            : undefined
    }))
    const collections: Partial<
        Record<AppStateCollectionName, WaAppStateStoreData['collections'][AppStateCollectionName]>
    > = {}
    for (const [collectionName, collectionState] of Object.entries(data.collections) as readonly [
        AppStateCollectionName,
        WaAppStateStoreData['collections'][AppStateCollectionName]
    ][]) {
        if (!collectionState) {
            continue
        }
        const indexValueMap: Record<string, Uint8Array> = {}
        for (const [indexMacHex, valueMac] of Object.entries(collectionState.indexValueMap)) {
            indexValueMap[indexMacHex] = cloneBytes(valueMac)
        }
        collections[collectionName] = {
            version: collectionState.version,
            hash: cloneBytes(collectionState.hash),
            indexValueMap
        }
    }
    return {
        keys,
        collections
    }
}

export class WaAuthStateStore {
    private readonly filePath: string

    public constructor(filePath: string) {
        this.filePath = filePath
    }

    public async load(): Promise<WaAuthCredentials | null> {
        let raw: string
        try {
            raw = await readFile(this.filePath, 'utf8')
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            if (code === 'ENOENT') {
                return null
            }
            throw error
        }

        const parsed = JSON.parse(raw) as SerializedAuthCredentials
        const signedIdentity =
            parsed.signedIdentity !== null && parsed.signedIdentity !== undefined
                ? proto.ADVSignedDeviceIdentity.decode(
                      base64ToBytes(parsed.signedIdentity, 'signedIdentity')
                  )
                : undefined

        return {
            noiseKeyPair: decodeKeyPair(parsed.noiseKeyPair, 'noiseKeyPair'),
            registrationInfo: {
                registrationId: parsed.registrationInfo.registrationId,
                identityKeyPair: decodeKeyPair(
                    parsed.registrationInfo.identityKeyPair,
                    'registrationInfo.identityKeyPair'
                )
            },
            signedPreKey: {
                keyId: parsed.signedPreKey.keyId,
                keyPair: decodeKeyPair(parsed.signedPreKey.keyPair, 'signedPreKey.keyPair'),
                signature: base64ToBytes(parsed.signedPreKey.signature, 'signedPreKey.signature'),
                uploaded: false
            },
            advSecretKey: base64ToBytes(parsed.advSecretKey, 'advSecretKey'),
            signedIdentity,
            meJid: parsed.meJid,
            meLid: parsed.meLid,
            meDisplayName: parsed.meDisplayName,
            companionEncStatic: parsed.companionEncStatic
                ? base64ToBytes(parsed.companionEncStatic, 'companionEncStatic')
                : undefined,
            platform: parsed.platform,
            serverStaticKey: parsed.serverStaticKey
                ? base64ToBytes(parsed.serverStaticKey, 'serverStaticKey')
                : undefined,
            serverHasPreKeys: parsed.serverHasPreKeys,
            routingInfo: parsed.routingInfo
                ? base64ToBytes(parsed.routingInfo, 'routingInfo')
                : undefined,
            lastSuccessTs: parsed.lastSuccessTs,
            propsVersion: parsed.propsVersion,
            abPropsVersion: parsed.abPropsVersion,
            connectionLocation: parsed.connectionLocation,
            accountCreationTs: parsed.accountCreationTs,
            appState: parsed.appState ? decodeAppStateStoreData(parsed.appState) : undefined
        }
    }

    public async save(credentials: WaAuthCredentials): Promise<void> {
        const payload: SerializedAuthCredentials = {
            noiseKeyPair: encodeKeyPair(credentials.noiseKeyPair),
            registrationInfo: {
                registrationId: credentials.registrationInfo.registrationId,
                identityKeyPair: encodeKeyPair(credentials.registrationInfo.identityKeyPair)
            },
            signedPreKey: {
                keyId: credentials.signedPreKey.keyId,
                keyPair: encodeKeyPair(credentials.signedPreKey.keyPair),
                signature: bytesToBase64(credentials.signedPreKey.signature)
            },
            advSecretKey: bytesToBase64(credentials.advSecretKey),
            signedIdentity:
                credentials.signedIdentity !== null && credentials.signedIdentity !== undefined
                    ? bytesToBase64(
                          proto.ADVSignedDeviceIdentity.encode(credentials.signedIdentity).finish()
                      )
                    : undefined,
            meJid: credentials.meJid,
            meLid: credentials.meLid,
            meDisplayName: credentials.meDisplayName,
            companionEncStatic: credentials.companionEncStatic
                ? bytesToBase64(credentials.companionEncStatic)
                : undefined,
            platform: credentials.platform,
            serverStaticKey: credentials.serverStaticKey
                ? bytesToBase64(credentials.serverStaticKey)
                : undefined,
            serverHasPreKeys: credentials.serverHasPreKeys,
            routingInfo: credentials.routingInfo
                ? bytesToBase64(credentials.routingInfo)
                : undefined,
            lastSuccessTs: credentials.lastSuccessTs,
            propsVersion: credentials.propsVersion,
            abPropsVersion: credentials.abPropsVersion,
            connectionLocation: credentials.connectionLocation,
            accountCreationTs: credentials.accountCreationTs,
            appState: credentials.appState
                ? encodeAppStateStoreData(credentials.appState)
                : undefined
        }

        const dir = dirname(this.filePath)
        await mkdir(dir, { recursive: true })
        const tmpPath = `${this.filePath}.tmp`
        await writeFile(tmpPath, `${JSON.stringify(payload)}\n`, 'utf8')
        await rename(tmpPath, this.filePath)
    }

    public async clear(): Promise<void> {
        await rm(this.filePath, { force: true })
        await rm(`${this.filePath}.tmp`, { force: true })
    }

    public clone(credentials: WaAuthCredentials): WaAuthCredentials {
        return {
            noiseKeyPair: {
                pubKey: cloneBytes(credentials.noiseKeyPair.pubKey),
                privKey: cloneBytes(credentials.noiseKeyPair.privKey)
            },
            registrationInfo: {
                registrationId: credentials.registrationInfo.registrationId,
                identityKeyPair: {
                    pubKey: cloneBytes(credentials.registrationInfo.identityKeyPair.pubKey),
                    privKey: cloneBytes(credentials.registrationInfo.identityKeyPair.privKey)
                }
            },
            signedPreKey: {
                keyId: credentials.signedPreKey.keyId,
                keyPair: {
                    pubKey: cloneBytes(credentials.signedPreKey.keyPair.pubKey),
                    privKey: cloneBytes(credentials.signedPreKey.keyPair.privKey)
                },
                signature: cloneBytes(credentials.signedPreKey.signature),
                uploaded: credentials.signedPreKey.uploaded
            },
            advSecretKey: cloneBytes(credentials.advSecretKey),
            signedIdentity: credentials.signedIdentity
                ? proto.ADVSignedDeviceIdentity.decode(
                      proto.ADVSignedDeviceIdentity.encode(credentials.signedIdentity).finish()
                  )
                : undefined,
            meJid: credentials.meJid,
            meLid: credentials.meLid,
            meDisplayName: credentials.meDisplayName,
            companionEncStatic: credentials.companionEncStatic
                ? cloneBytes(credentials.companionEncStatic)
                : undefined,
            platform: credentials.platform,
            serverStaticKey: credentials.serverStaticKey
                ? cloneBytes(credentials.serverStaticKey)
                : undefined,
            serverHasPreKeys: credentials.serverHasPreKeys,
            routingInfo: credentials.routingInfo ? cloneBytes(credentials.routingInfo) : undefined,
            lastSuccessTs: credentials.lastSuccessTs,
            propsVersion: credentials.propsVersion,
            abPropsVersion: credentials.abPropsVersion,
            connectionLocation: credentials.connectionLocation,
            accountCreationTs: credentials.accountCreationTs,
            appState: credentials.appState
                ? cloneAppStateStoreData(credentials.appState)
                : undefined
        }
    }
}
