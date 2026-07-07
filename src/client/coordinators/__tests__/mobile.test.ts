import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'

import type { WaAppStateSyncKey } from '@appstate/types'
import {
    WaMobileCoordinator,
    type WaMobileCoordinatorDeps
} from '@client/coordinators/WaMobileCoordinator'
import type { CompanionHostEpochState } from '@client/persistence/companion-host'
import { type SignalKeyPair, X25519 } from '@crypto'
import { createNoopLogger } from '@infra/log/types'
import { type Proto, proto } from '@proto'
import { WA_NODE_TAGS } from '@protocol/nodes'
import { computeAdvIdentityHmac, verifyDeviceIdentityAccountSignature } from '@signal'
import { type BinaryNode, findNodeChild, getFirstNodeChild, getNodeChildren } from '@transport'
import { bytesToBase64UrlSafe, uint8Equal } from '@util/bytes'

const DEVICE_JID = '5511999999999:12@s.whatsapp.net'

async function makeCompanionQr() {
    const identity = await X25519.generateKeyPair()
    const noise = await X25519.generateKeyPair()
    const advSecret = (await X25519.generateKeyPair()).privKey
    const qr = [
        'REF123',
        bytesToBase64UrlSafe(noise.pubKey),
        bytesToBase64UrlSafe(identity.pubKey),
        bytesToBase64UrlSafe(advSecret),
        'CHROME'
    ].join(',')
    return { qr, identity, noise, advSecret }
}

function pairDeviceResult(deviceJid: string): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result' },
        content: [
            {
                tag: 'pair-device',
                attrs: {},
                content: [{ tag: 'device', attrs: { jid: deviceJid } }]
            }
        ]
    }
}

function mockDeps(config: {
    readonly meJid: string | undefined
    readonly meLid?: string
    readonly pushName?: string
    readonly primaryIdentity: SignalKeyPair
    readonly result?: BinaryNode
    readonly activeSyncKey?: WaAppStateSyncKey | null
    readonly serverDeviceJids?: readonly string[]
    readonly isMobilePrimary?: boolean
}) {
    const queries: Array<{ context: string; node: BinaryNode }> = []
    const emitted: Array<[string, unknown[]]> = []
    const keyShares: Array<{ deviceJid: string; keys: readonly WaAppStateSyncKey[] }> = []
    const protocolMessages: Array<{ deviceJid: string; protocolMessage: unknown }> = []
    const appStateMutations: Array<Record<string, unknown>> = []
    const deviceSyncCalls = { count: 0 }
    const incomingHandlers: Array<(node: BinaryNode) => Promise<boolean>> = []
    const credentials = config.meJid
        ? {
              meJid: config.meJid,
              meLid: config.meLid,
              pushName: config.pushName,
              registrationInfo: { identityKeyPair: config.primaryIdentity }
          }
        : null
    const deps = {
        logger: createNoopLogger(),
        authClient: { getCurrentCredentials: () => credentials },
        messageDispatch: {
            sendAppStateSyncKeyShare: (deviceJid: string, keys: readonly WaAppStateSyncKey[]) => {
                keyShares.push({ deviceJid, keys })
                return Promise.resolve()
            },
            publishProtocolMessageToDevice: (deviceJid: string, protocolMessage: unknown) => {
                protocolMessages.push({ deviceJid, protocolMessage })
                return Promise.resolve({})
            }
        },
        chatCoordinator: {
            set: (input: Record<string, unknown>) => {
                appStateMutations.push(input)
                return Promise.resolve()
            }
        },
        deviceSync: {
            syncDeviceList: () => {
                deviceSyncCalls.count += 1
                return Promise.resolve([{ deviceJids: [...(config.serverDeviceJids ?? [])] }])
            }
        },
        appStateStore: {
            getActiveSyncKey: () => Promise.resolve(config.activeSyncKey ?? null)
        },
        queryWithContext: (context: string, node: BinaryNode) => {
            queries.push({ context, node })
            return Promise.resolve(config.result ?? { tag: 'iq', attrs: { type: 'result' } })
        },
        emitEvent: (event: string, ...args: unknown[]) => {
            emitted.push([event, args])
        },
        isMobilePrimary: () => config.isMobilePrimary ?? true,
        registerIncomingHandler: (registration: {
            handler: (node: BinaryNode) => Promise<boolean>
        }) => {
            incomingHandlers.push(registration.handler)
            return () => undefined
        }
    } as unknown as WaMobileCoordinatorDeps
    return {
        deps,
        queries,
        emitted,
        keyShares,
        protocolMessages,
        appStateMutations,
        deviceSyncCalls,
        incomingHandlers
    }
}

test('linkCompanion signs a companion-verifiable pair-device upload and records the device', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { qr, identity, noise, advSecret } = await makeCompanionQr()
    const { deps, queries, emitted } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity,
        result: pairDeviceResult(DEVICE_JID)
    })
    const saved: CompanionHostEpochState[] = []
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: { load: () => null, save: (state) => void saved.push(state) }
    })

    const linked = await coordinator.linkCompanion(qr)
    assert.equal(linked.deviceJid, DEVICE_JID)
    assert.equal(linked.keyIndex, 1)

    const pairDeviceQuery = queries.find((query) => query.context === 'companion-host.pair-device')
    assert.ok(pairDeviceQuery)
    const iq = pairDeviceQuery.node
    assert.equal(iq.attrs.to, 's.whatsapp.net')
    assert.equal(iq.attrs.type, 'set')
    assert.equal(iq.attrs.xmlns, 'md')

    const pairDevice = getFirstNodeChild(iq)
    assert.ok(pairDevice)
    assert.equal(pairDevice.tag, 'pair-device')
    assert.deepEqual(
        getNodeChildren(pairDevice).map((child) => child.tag),
        ['ref', 'pub-key', 'device-identity', 'key-index-list', 'client-props']
    )

    const pubKey = findNodeChild(pairDevice, 'pub-key')?.content
    assert.ok(pubKey instanceof Uint8Array)
    assert.equal(uint8Equal(pubKey, noise.pubKey), true)

    const deviceIdentity = findNodeChild(pairDevice, 'device-identity')?.content
    assert.ok(deviceIdentity instanceof Uint8Array)
    const wrapped = proto.ADVSignedDeviceIdentityHMAC.decode(deviceIdentity)
    assert.equal(
        uint8Equal(computeAdvIdentityHmac(advSecret, wrapped.details!), wrapped.hmac!),
        true
    )
    const signed = proto.ADVSignedDeviceIdentity.decode(wrapped.details!)
    assert.equal(
        await verifyDeviceIdentityAccountSignature(
            signed.details!,
            signed.accountSignature!,
            identity.pubKey,
            signed.accountSignatureKey!
        ),
        true
    )

    const linkedEvent = emitted.find(([event]) => event === 'companion_host_linked')
    assert.ok(linkedEvent)
    assert.deepEqual(linkedEvent[1][0], { deviceJid: DEVICE_JID, keyIndex: 1 })

    const lastSave = saved.at(-1)
    assert.ok(lastSave)
    assert.equal(lastSave.currentKeyIndex, 1)
    assert.equal(lastSave.companions.length, 1)
    assert.equal(lastSave.companions[0].deviceJid, DEVICE_JID)
})

test('linkCompanion auto-provisions the companion with an INITIAL_BOOTSTRAP history sync', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { qr } = await makeCompanionQr()
    const { deps, protocolMessages } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity,
        result: pairDeviceResult(DEVICE_JID)
    })
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: { load: () => null, save: () => undefined }
    })

    await coordinator.linkCompanion(qr)
    await new Promise((resolve) => setTimeout(resolve, 150))

    const historyMsg = protocolMessages.find(
        (entry) =>
            (entry.protocolMessage as Proto.Message.IProtocolMessage).type ===
            proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION
    )
    assert.ok(historyMsg, 'a history-sync notification is pushed on link')
    assert.equal(historyMsg.deviceJid, DEVICE_JID)
    const inline = (historyMsg.protocolMessage as Proto.Message.IProtocolMessage)
        .historySyncNotification?.initialHistBootstrapInlinePayload
    assert.ok(inline instanceof Uint8Array)
    const historySync = proto.HistorySync.decode(inflateSync(inline))
    assert.equal(historySync.syncType, proto.HistorySync.HistorySyncType.INITIAL_BOOTSTRAP)
})

test('linkCompanion seeds the primary setting_pushName into critical_block app-state', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { qr } = await makeCompanionQr()
    const { deps, appStateMutations } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        pushName: 'Alice',
        primaryIdentity,
        result: pairDeviceResult(DEVICE_JID)
    })
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: { load: () => null, save: () => undefined }
    })

    await coordinator.linkCompanion(qr)

    const pushNameMutation = appStateMutations.find((m) => m.schema === 'SettingPushName')
    assert.ok(pushNameMutation, 'a SettingPushName app-state mutation is seeded on link')
    assert.equal(pushNameMutation.name, 'Alice')
})

test('linkCompanion falls back to the meJid user for setting_pushName when no push name', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { qr } = await makeCompanionQr()
    const { deps, appStateMutations } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity,
        result: pairDeviceResult(DEVICE_JID)
    })
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: { load: () => null, save: () => undefined }
    })

    await coordinator.linkCompanion(qr)

    const pushNameMutation = appStateMutations.find((m) => m.schema === 'SettingPushName')
    assert.ok(pushNameMutation)
    assert.equal(pushNameMutation.name, '5511999999999')
})

test('linkCompanion declares LID chat-db migration in <client-props> for a LID-native account', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { qr } = await makeCompanionQr()
    const { deps, queries } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        meLid: '226951105134689@lid',
        primaryIdentity,
        result: pairDeviceResult(DEVICE_JID)
    })
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: { load: () => null, save: () => undefined }
    })

    await coordinator.linkCompanion(qr)

    const pairDeviceQuery = queries.find((query) => query.context === 'companion-host.pair-device')
    assert.ok(pairDeviceQuery)
    const pairDevice = getFirstNodeChild(pairDeviceQuery.node)
    assert.ok(pairDevice)
    const clientPropsNode = findNodeChild(pairDevice, 'client-props')
    assert.ok(clientPropsNode?.content instanceof Uint8Array)
    const clientProps = proto.ClientPairingProps.decode(clientPropsNode.content)
    assert.equal(clientProps.isChatDbLidMigrated, true)
    assert.equal(clientProps.isSyncdPureLidSession, true)
    assert.equal(clientProps.isSyncdSnapshotRecoveryEnabled, false)
})

test('linkCompanion rejects and emits an error without a registered primary session', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { qr } = await makeCompanionQr()
    const { deps, emitted } = mockDeps({ meJid: undefined, primaryIdentity })
    const coordinator = new WaMobileCoordinator(deps)

    await assert.rejects(() => coordinator.linkCompanion(qr), /registered primary session/)
    assert.ok(emitted.find(([event]) => event === 'companion_host_error'))
})

test('shareAppStateSyncKeys pushes the primary active key to the companion', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const activeSyncKey: WaAppStateSyncKey = {
        keyId: new Uint8Array([1, 2, 3]),
        keyData: new Uint8Array(32),
        timestamp: 1
    }
    const { deps, keyShares } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity,
        activeSyncKey
    })
    const coordinator = new WaMobileCoordinator(deps)

    await coordinator.shareAppStateSyncKeys(DEVICE_JID)
    assert.equal(keyShares.length, 1)
    assert.equal(keyShares[0].deviceJid, DEVICE_JID)
    assert.deepEqual(keyShares[0].keys, [activeSyncKey])
})

test('shareAppStateSyncKeys throws when the primary has no active app-state key', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { deps, keyShares } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity,
        activeSyncKey: null
    })
    const coordinator = new WaMobileCoordinator(deps)

    await assert.rejects(
        () => coordinator.shareAppStateSyncKeys(DEVICE_JID),
        /no active app-state sync key/
    )
    assert.equal(keyShares.length, 0)
})

test('revokeCompanion removes the device, drops it from the epoch, and republishes', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { deps, queries } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity,
        result: { tag: 'iq', attrs: { type: 'result' } }
    })
    const saved: CompanionHostEpochState[] = []
    const seeded: CompanionHostEpochState = {
        rawId: 123,
        currentKeyIndex: 1,
        companions: [
            {
                deviceJid: DEVICE_JID,
                keyIndex: 1,
                companionIdentityPublicKey: new Uint8Array([1, 2, 3]),
                addedAtSeconds: 1
            }
        ]
    }
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: { load: () => seeded, save: (state) => void saved.push(state) }
    })

    await coordinator.revokeCompanion(DEVICE_JID)

    const removeQuery = queries.find((query) => query.context === 'companion-host.remove-device')
    assert.ok(removeQuery)
    const removeNode = getFirstNodeChild(removeQuery.node)
    assert.equal(removeNode?.tag, 'remove-companion-device')
    assert.equal(removeNode?.attrs.jid, DEVICE_JID)
    assert.ok(queries.find((query) => query.context === 'companion-host.key-index-list'))
    assert.deepEqual(await coordinator.listCompanions(), [])
    assert.equal(saved.at(-1)?.companions.length, 0)
})

test('revokeCompanion throws for an untracked companion', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { deps } = mockDeps({ meJid: '5511999999999@s.whatsapp.net', primaryIdentity })
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: {
            load: () => ({ rawId: 1, currentKeyIndex: 0, companions: [] }),
            save: () => undefined
        }
    })

    await assert.rejects(
        () => coordinator.revokeCompanion('639079515517:9@s.whatsapp.net'),
        /not tracked/
    )
})

test('revokeAllCompanions removes every device with all="true" and clears the epoch', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { deps, queries, emitted } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity,
        result: { tag: 'iq', attrs: { type: 'result' } }
    })
    const seeded: CompanionHostEpochState = {
        rawId: 123,
        currentKeyIndex: 2,
        companions: [
            {
                deviceJid: '5511999999999:8@s.whatsapp.net',
                keyIndex: 1,
                companionIdentityPublicKey: new Uint8Array([1]),
                addedAtSeconds: 1
            },
            {
                deviceJid: '5511999999999:9@s.whatsapp.net',
                keyIndex: 2,
                companionIdentityPublicKey: new Uint8Array([2]),
                addedAtSeconds: 2
            }
        ]
    }
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: { load: () => seeded, save: () => undefined }
    })

    await coordinator.revokeAllCompanions()

    const removeQuery = queries.find(
        (query) => query.context === 'companion-host.remove-all-devices'
    )
    assert.ok(removeQuery)
    const removeNode = getFirstNodeChild(removeQuery.node)
    assert.equal(removeNode?.tag, 'remove-companion-device')
    assert.equal(removeNode?.attrs.all, 'true')
    assert.equal(removeNode?.attrs.jid, undefined)
    assert.equal(removeNode?.attrs.reason, 'user_initiated')
    assert.ok(queries.find((query) => query.context === 'companion-host.key-index-list'))
    assert.deepEqual(await coordinator.listCompanions(), [])

    const revoked = emitted.filter(([event]) => event === 'companion_host_revoked')
    assert.equal(revoked.length, 2)
})

test('reconcileCompanions drops companions the server no longer lists', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const KEEP = '5511999999999:9@s.whatsapp.net'
    const GONE = '5511999999999:8@s.whatsapp.net'
    const { deps, emitted } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity,
        serverDeviceJids: ['5511999999999@s.whatsapp.net', KEEP]
    })
    const saved: CompanionHostEpochState[] = []
    const seeded: CompanionHostEpochState = {
        rawId: 1,
        currentKeyIndex: 9,
        companions: [
            {
                deviceJid: GONE,
                keyIndex: 8,
                companionIdentityPublicKey: new Uint8Array([1]),
                addedAtSeconds: 1
            },
            {
                deviceJid: KEEP,
                keyIndex: 9,
                companionIdentityPublicKey: new Uint8Array([2]),
                addedAtSeconds: 2
            }
        ]
    }
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: { load: () => seeded, save: (state) => void saved.push(state) }
    })

    const removed = await coordinator.reconcileCompanions()
    assert.deepEqual(removed, [GONE])
    assert.deepEqual(
        (await coordinator.listCompanions()).map((companion) => companion.deviceJid),
        [KEEP]
    )
    assert.equal(saved.at(-1)?.companions.length, 1)
    const revoked = emitted.filter(([event]) => event === 'companion_host_revoked')
    assert.equal(revoked.length, 1)
    assert.deepEqual(revoked[0][1][0], { deviceJid: GONE })
})

test('reconcileCompanions skips the server query when the tracked set is empty', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { deps, deviceSyncCalls } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity,
        serverDeviceJids: ['5511999999999@s.whatsapp.net']
    })
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: {
            load: () => ({ rawId: 1, currentKeyIndex: 0, companions: [] }),
            save: () => undefined
        }
    })
    assert.deepEqual(await coordinator.reconcileCompanions(), [])
    assert.equal(deviceSyncCalls.count, 0)
})

test('reconcileCompanions never queries the server without a companion store', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { deps, deviceSyncCalls } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity
    })
    const coordinator = new WaMobileCoordinator({ ...deps })
    assert.deepEqual(await coordinator.reconcileCompanions(), [])
    assert.equal(deviceSyncCalls.count, 0)
})

test('account_sync prunes companions from the notification payload (LID devices, PN epoch)', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const KEEP = '639094882867:10@s.whatsapp.net'
    const { deps, emitted, incomingHandlers, deviceSyncCalls } = mockDeps({
        meJid: '639094882867@s.whatsapp.net',
        meLid: '226951105134689@lid',
        primaryIdentity
    })
    const seeded: CompanionHostEpochState = {
        rawId: 1,
        currentKeyIndex: 10,
        companions: [
            {
                deviceJid: KEEP,
                keyIndex: 10,
                companionIdentityPublicKey: new Uint8Array([1]),
                addedAtSeconds: 1
            }
        ]
    }
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: { load: () => seeded, save: () => undefined }
    })

    const node: BinaryNode = {
        tag: 'notification',
        attrs: { type: 'account_sync' },
        content: [
            {
                tag: 'devices',
                attrs: {},
                content: [{ tag: 'device', attrs: { jid: '226951105134689@lid' } }]
            }
        ]
    }
    await incomingHandlers[0](node)
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepEqual(await coordinator.listCompanions(), [])
    assert.equal(deviceSyncCalls.count, 0)
    const revoked = emitted.filter(([event]) => event === 'companion_host_revoked')
    assert.equal(revoked.length, 1)
    assert.deepEqual(revoked[0][1][0], { deviceJid: KEEP })
})

test('mobile operations are gated to mobile-primary sessions', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { deps, deviceSyncCalls } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity,
        isMobilePrimary: false
    })
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: {
            load: () => ({
                rawId: 1,
                currentKeyIndex: 1,
                companions: [
                    {
                        deviceJid: '5511999999999:1@s.whatsapp.net',
                        keyIndex: 1,
                        companionIdentityPublicKey: new Uint8Array([1]),
                        addedAtSeconds: 1
                    }
                ]
            }),
            save: () => undefined
        }
    })

    await assert.rejects(() => coordinator.linkCompanionByCode('12345678'), /mobile-primary/)
    await assert.rejects(() => coordinator.revokeAllCompanions(), /mobile-primary/)
    assert.deepEqual(await coordinator.reconcileCompanions(), [])
    assert.equal(deviceSyncCalls.count, 0)
})

test('linkCompanionByCode rejects when no companion is pending', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { deps, emitted } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity
    })
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: { load: () => null, save: () => undefined }
    })

    await assert.rejects(() => coordinator.linkCompanionByCode('12345678'), /no pending companion/)
    assert.ok(emitted.some(([event]) => event === 'companion_host_error'))
})

test('linkCompanionByCode rejects cleanly when primary_hello fails', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const { deps, emitted, incomingHandlers } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity
    })
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: { load: () => null, save: () => undefined },
        queryWithContext: (context: string) =>
            context === 'companion-host.primary-hello'
                ? Promise.reject(new Error('primary-hello boom'))
                : Promise.resolve({ tag: 'iq', attrs: { type: 'result' } })
    })

    const authKey = (await X25519.generateKeyPair()).pubKey
    const helloNode: BinaryNode = {
        tag: 'notification',
        attrs: {},
        content: [
            {
                tag: WA_NODE_TAGS.LINK_CODE_COMPANION_REG,
                attrs: { stage: 'companion_hello' },
                content: [
                    { tag: WA_NODE_TAGS.LINK_CODE_PAIRING_REF, attrs: {}, content: 'REFCODE' },
                    {
                        tag: WA_NODE_TAGS.LINK_CODE_PAIRING_WRAPPED_COMPANION_EPHEMERAL_PUB,
                        attrs: {},
                        content: new Uint8Array(80)
                    },
                    {
                        tag: WA_NODE_TAGS.COMPANION_SERVER_AUTH_KEY_PUB,
                        attrs: {},
                        content: authKey
                    }
                ]
            }
        ]
    }
    await incomingHandlers[0](helloNode)

    await assert.rejects(() => coordinator.linkCompanionByCode('12345678'), /primary-hello boom/)
    assert.ok(emitted.some(([event]) => event === 'companion_host_error'))

    const finishNode: BinaryNode = {
        tag: 'notification',
        attrs: {},
        content: [
            {
                tag: WA_NODE_TAGS.LINK_CODE_COMPANION_REG,
                attrs: { stage: 'companion_finish' },
                content: [
                    { tag: WA_NODE_TAGS.LINK_CODE_PAIRING_REF, attrs: {}, content: 'REFCODE' },
                    {
                        tag: WA_NODE_TAGS.LINK_CODE_PAIRING_WRAPPED_KEY_BUNDLE,
                        attrs: {},
                        content: new Uint8Array(64)
                    },
                    {
                        tag: WA_NODE_TAGS.COMPANION_IDENTITY_PUBLIC,
                        attrs: {},
                        content: new Uint8Array(32)
                    }
                ]
            }
        ]
    }
    await assert.doesNotReject(() => incomingHandlers[0](finishNode))
})

test('revoking the last companion drops its key index from the republished list', async () => {
    const primaryIdentity = await X25519.generateKeyPair()
    const REVOKED = '5511999999999:2@s.whatsapp.net'
    const { deps, queries, incomingHandlers } = mockDeps({
        meJid: '5511999999999@s.whatsapp.net',
        primaryIdentity,
        result: { tag: 'iq', attrs: { type: 'result' } }
    })
    const coordinator = new WaMobileCoordinator({
        ...deps,
        persistence: {
            load: () => ({
                rawId: 1,
                currentKeyIndex: 2,
                companions: [
                    {
                        deviceJid: REVOKED,
                        keyIndex: 2,
                        companionIdentityPublicKey: new Uint8Array([1]),
                        addedAtSeconds: 1
                    }
                ]
            }),
            save: () => undefined
        }
    })

    await incomingHandlers[0]({
        tag: 'notification',
        attrs: { type: 'account_sync' },
        content: [
            {
                tag: 'devices',
                attrs: {},
                content: [{ tag: 'device', attrs: { jid: REVOKED, 'key-index': '2' } }]
            }
        ]
    })

    await coordinator.revokeCompanion(REVOKED)

    const publish = queries.find((query) => query.context === 'companion-host.key-index-list')
    assert.ok(publish)
    const content = findNodeChild(publish.node, 'key-index-list')?.content
    assert.ok(content instanceof Uint8Array)
    const signed = proto.ADVSignedKeyIndexList.decode(content)
    assert.ok(signed.details)
    const details = proto.ADVKeyIndexList.decode(signed.details)
    assert.deepEqual([...details.validIndexes], [0])
    assert.equal(details.currentIndex, 0)
})
