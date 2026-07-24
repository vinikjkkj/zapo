import assert from 'node:assert/strict'
import test from 'node:test'

import { FAKE_DEFAULT_PRIVACY_SETTINGS } from '../../protocol/iq/privacy'
import { WaFakeIqRouter } from '../../protocol/iq/router'
import type { BinaryNode } from '../../transport/codec'
import { FakeWaServer } from '../FakeWaServer'
import { type IqHandlerDeps, registerDefaultIqHandlers } from '../iq-handlers'

function createRouterWithDefaults(overrides: Partial<IqHandlerDeps> = {}): WaFakeIqRouter {
    const router = new WaFakeIqRouter()
    const deps: IqHandlerDeps = {
        peerRegistry: new Map(),
        groupRegistry: new Map(),
        privacySettings: FAKE_DEFAULT_PRIVACY_SETTINGS,
        blocklistJids: new Set(),
        profilePicturesByJid: new Map(),
        businessProfilesByJid: new Map(),
        abPropsInput: {},
        issuedPrivacyTokens: new Map(),
        latestStatusText: null,
        setLatestStatusText: () => undefined,
        lookupDeviceIdsForUser: () => [],
        notifyGroupOp: () => undefined,
        mutatePrivacySettings: () => undefined,
        mutateBlocklist: () => undefined,
        notifyProfilePictureSet: () => undefined,
        handleProfilePictureSet: () => undefined,
        notifyStatusSet: () => undefined,
        notifyLogout: () => undefined,
        notifyPrivacyTokenIssue: () => undefined,
        notifyDirtyBitsClear: () => undefined,
        notifyPrivacySet: () => undefined,
        notifyBlocklistChange: () => undefined,
        capturePreKeyBundle: () => undefined,
        countServerPreKeys: () => 0,
        consumeOutboundAppStatePatches: async () => undefined,
        appStateCollectionProviders: new Map(),
        requireMediaHttpsInfo: () => ({ host: '127.0.0.1', port: 1 }),
        ...overrides
    }
    registerDefaultIqHandlers(router, deps)
    return router
}

test('passive set iq is answered with a plain result from s.whatsapp.net', async () => {
    const router = createRouterWithDefaults()
    const inbound: BinaryNode = {
        tag: 'iq',
        attrs: { id: 'passive-1', type: 'set', xmlns: 'passive', to: 's.whatsapp.net' },
        content: [{ tag: 'active', attrs: {} }]
    }

    const response = await router.route(inbound)
    assert.ok(response, 'passive iq must be handled by a default handler')
    assert.equal(response.attrs.type, 'result')
    assert.equal(response.attrs.id, 'passive-1')
    assert.equal(response.attrs.from, 's.whatsapp.net')
})

test('encrypt <count> get iq returns the remaining dispenser prekey count', async () => {
    const router = createRouterWithDefaults({ countServerPreKeys: () => 812 })
    const inbound: BinaryNode = {
        tag: 'iq',
        attrs: { id: 'count-1', type: 'get', xmlns: 'encrypt', to: 's.whatsapp.net' },
        content: [{ tag: 'count', attrs: {} }]
    }

    const response = await router.route(inbound)
    assert.ok(response, 'count iq must be handled by a default handler')
    assert.equal(response.attrs.type, 'result')
    assert.equal(response.attrs.id, 'count-1')
    const children = Array.isArray(response.content) ? response.content : []
    assert.equal(children.length, 1)
    assert.equal(children[0].tag, 'count')
    assert.equal(children[0].attrs.value, '812')
})

test('a high-priority responder returning null falls through to the default handler', async () => {
    const router = createRouterWithDefaults()
    const observed: string[] = []
    router.register(
        {
            label: 'ping-observer',
            matcher: { xmlns: 'w:p' },
            respond: (iq) => {
                observed.push(iq.attrs.id ?? '')
                return null
            }
        },
        { priority: 'high' }
    )
    const inbound: BinaryNode = {
        tag: 'iq',
        attrs: { id: 'ping-1', type: 'get', xmlns: 'w:p', to: 's.whatsapp.net' }
    }

    const response = await router.route(inbound)
    assert.deepEqual(observed, ['ping-1'])
    assert.ok(response, 'default ping handler must still answer after the fallthrough')
    assert.equal(response.attrs.type, 'result')
})

test('a responder returning null with no other match leaves the iq unhandled', async () => {
    const router = new WaFakeIqRouter()
    const unhandled: BinaryNode[] = []
    router.setEvents({ onUnhandled: (iq) => unhandled.push(iq) })
    router.register({ matcher: { xmlns: 'w:p' }, respond: () => null })
    const inbound: BinaryNode = {
        tag: 'iq',
        attrs: { id: 'ping-2', type: 'get', xmlns: 'w:p' }
    }

    const response = await router.route(inbound)
    assert.equal(response, null)
    assert.equal(unhandled.length, 1)
})

test('defaultIqHandlers: false starts the server with an empty router', async () => {
    const bare = new FakeWaServer({ defaultIqHandlers: false })
    const withDefaults = new FakeWaServer()
    const ping: BinaryNode = {
        tag: 'iq',
        attrs: { id: 'ping-3', type: 'get', xmlns: 'w:p', to: 's.whatsapp.net' }
    }

    assert.equal(await bare.routeIqForTest(ping), null)
    const answered = await withDefaults.routeIqForTest(ping)
    assert.equal(answered?.attrs.type, 'result')

    // registerIqHandler is the only routing surface left on a bare server.
    bare.registerIqHandler({ xmlns: 'w:p' }, (iq) => ({
        tag: 'iq',
        attrs: { id: iq.attrs.id ?? '', type: 'result' }
    }))
    const custom = await bare.routeIqForTest(ping)
    assert.equal(custom?.attrs.type, 'result')
})

test('encrypt <count> does not shadow the <digest> 404 handler', async () => {
    const router = createRouterWithDefaults()
    const inbound: BinaryNode = {
        tag: 'iq',
        attrs: { id: 'digest-1', type: 'get', xmlns: 'encrypt', to: 's.whatsapp.net' },
        content: [{ tag: 'digest', attrs: {} }]
    }

    const response = await router.route(inbound)
    assert.ok(response)
    assert.equal(response.attrs.type, 'error')
})
