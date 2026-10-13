import assert from 'node:assert/strict'
import { test } from 'node:test'

import { WaOutOfOrderStanzas } from '../WaOutOfOrderStanzas.js'

test('a held terminate is taken once, and not after it expired', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000 })
    const stanzas = new WaOutOfOrderStanzas()

    stanzas.holdTerminate('A')
    assert.equal(stanzas.takeHeldTerminate('A'), true)
    assert.equal(stanzas.takeHeldTerminate('A'), false)

    stanzas.holdTerminate('B')
    t.mock.timers.tick(30_000)
    assert.equal(stanzas.takeHeldTerminate('B'), false)
})

test('a held call key is handed over once; clear forgets keys, terminates and ended calls', () => {
    const stanzas = new WaOutOfOrderStanzas()
    const key = { callKey: new Uint8Array(32), transactionId: 3 }

    stanzas.holdCallKey('A', key)
    assert.equal(stanzas.takeCallKey('A'), key)
    assert.equal(stanzas.takeCallKey('A'), undefined)

    stanzas.holdCallKey('B', key)
    stanzas.holdTerminate('C')
    stanzas.rememberEnded('D')
    assert.equal(stanzas.endedHere('D'), true)
    stanzas.clear()
    assert.equal(stanzas.takeCallKey('B'), undefined)
    assert.equal(stanzas.takeHeldTerminate('C'), false)
    assert.equal(stanzas.endedHere('D'), false)
})
