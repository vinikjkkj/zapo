import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from '../logger.js'

test('each noop logger is its own object, so patching one leaves the others alone', () => {
    const patched = createNoopLogger()
    const other = createNoopLogger()
    const warnings: string[] = []

    patched.warn = (message) => {
        warnings.push(message)
    }
    other.warn('not for the patched one')
    other.child({ component: 'x' }).warn('nor from a child of another')

    assert.notEqual(patched, other)
    assert.deepEqual(warnings, [])
})
