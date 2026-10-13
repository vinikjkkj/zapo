import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AudioPayloadProbe } from '../payload-probe.js'

test('the probe tallies first bytes, sizes and outcomes', () => {
    const probe = new AudioPayloadProbe()

    probe.note(1, 0, Uint8Array.of(0x58, 1, 2), 'decoded')
    probe.note(1, 960, Uint8Array.of(0x58, 1, 2, 3, 4), 'rejected')
    probe.note(1, 1920, Uint8Array.of(0x0a), 'late')
    probe.note(1, 2880, new Uint8Array(0), null)

    assert.deepEqual(probe.summary(), {
        packets: 4,
        decoded: 1,
        rejected: 1,
        firstBytes: { '0x58': 2, '0x0a': 1 },
        minBytes: 0,
        maxBytes: 5,
        meanBytes: 2,
        timestampSteps: { '960': 3 }
    })
})

test('the timestamp step is taken per stream, wrap included', () => {
    const probe = new AudioPayloadProbe()

    probe.note(1, 0xffff_fc40, Uint8Array.of(1), 'decoded')
    probe.note(2, 5_000, Uint8Array.of(1), 'decoded')
    probe.note(1, 0, Uint8Array.of(1), 'decoded')
    probe.note(2, 7_000, Uint8Array.of(1), 'decoded')

    assert.deepEqual(probe.summary().timestampSteps, { '960': 1, '2000': 1 })
})

test('distinct steps past the bound are counted together', () => {
    const probe = new AudioPayloadProbe()
    let timestamp = 0
    for (let step = 1; step <= 20; step++) {
        probe.note(1, timestamp, Uint8Array.of(1), 'decoded')
        timestamp += step
    }
    probe.note(1, timestamp, Uint8Array.of(1), 'decoded')

    const steps = probe.summary().timestampSteps as Record<string, number>
    assert.equal(Object.keys(steps).length, 17)
    assert.equal(steps.other, 4)
})
