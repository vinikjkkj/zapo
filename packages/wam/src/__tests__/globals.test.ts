import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveWamGlobals } from '../globals.js'

test('resolveWamGlobals derives identity-consistent regular-channel globals', () => {
    const globals = resolveWamGlobals(
        { deviceBrowser: 'chrome', deviceOsDisplayName: 'Windows', streamId: 7 },
        'regular'
    )
    assert.equal(globals.get(11), 8)
    assert.equal(globals.get(15), 'Windows')
    assert.equal(globals.get(779), 'Chrome')
    assert.equal(globals.get(899), 2)
    assert.equal(globals.get(3543), 7)
    assert.equal(globals.get(5), 0)
    assert.equal(globals.get(3), 0)
    assert.equal(typeof globals.get(17), 'string')
})

test('resolveWamGlobals maps macOS to the DARWIN web platform', () => {
    const globals = resolveWamGlobals(
        { deviceBrowser: 'safari', deviceOsDisplayName: 'Mac OS', streamId: 1 },
        'regular'
    )
    assert.equal(globals.get(899), 3)
})

test('resolveWamGlobals filters globals by channel', () => {
    const priv = resolveWamGlobals({ streamId: 1 }, 'private')
    assert.equal(priv.has(779), false)
    assert.equal(priv.has(11), true)
})
