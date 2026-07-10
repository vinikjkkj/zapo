import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode, WaClientPluginContext } from 'zapo-js'

import { WaWamCoordinator } from '../WaWamCoordinator.js'

const noopLogger = {
    trace() {},
    debug() {},
    info() {},
    warn() {},
    error() {},
    child() {
        return noopLogger
    }
}

function makeCoordinator(connectedInitially: boolean) {
    const uploads: BinaryNode[] = []
    let connected = connectedInitially
    const ctx = {
        logger: noopLogger,
        queryWithContext: async (_context: string, node: BinaryNode) => {
            uploads.push(node)
            return { tag: 'iq', attrs: { type: 'result' }, content: [] } as BinaryNode
        },
        deps: { connectionManager: { isConnected: () => connected } },
        options: { deviceBrowser: 'Chrome', deviceOsDisplayName: 'Windows' }
    } as unknown as WaClientPluginContext
    const coordinator = new WaWamCoordinator(ctx, { autoEmit: false, syntheticUi: false })
    return { coordinator, uploads, setConnected: (value: boolean) => (connected = value) }
}

test('WaWamCoordinator drops the batch while disconnected instead of buffering or uploading', async () => {
    const { coordinator, uploads, setConnected } = makeCoordinator(false)
    coordinator.commit('UiAction', { uiActionType: 'CHAT_OPEN' })
    await coordinator.flush()
    assert.equal(uploads.length, 0)
    setConnected(true)
    await coordinator.flush()
    assert.equal(uploads.length, 0)
    await coordinator.dispose()
})

test('WaWamCoordinator uploads the batch as a w:stats iq when connected', async () => {
    const { coordinator, uploads } = makeCoordinator(true)
    coordinator.commit('UiAction', { uiActionType: 'CHAT_OPEN' })
    await coordinator.flush()
    assert.equal(uploads.length, 1)
    assert.equal(uploads[0]?.attrs.xmlns, 'w:stats')
    await coordinator.dispose()
})

test('WaWamCoordinator commits WebWamForceFlush on dispose (WA Web force-flush parity)', async () => {
    const origRandom = Math.random
    Math.random = () => 0 // ensure the commit sampling gate passes
    try {
        const { coordinator, uploads } = makeCoordinator(true)
        await coordinator.dispose()
        assert.equal(uploads.length, 1)
        assert.equal(uploads[0]?.attrs.xmlns, 'w:stats')
    } finally {
        Math.random = origRandom
    }
})
