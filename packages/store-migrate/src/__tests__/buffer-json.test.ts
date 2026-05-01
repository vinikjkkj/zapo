import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bufferJsonReviver } from '../util/buffer-json'

describe('bufferJsonReviver', () => {
    it('decodes Baileys Buffer JSON markers into Uint8Array', () => {
        const text = JSON.stringify({
            blob: { type: 'Buffer', data: Buffer.from([1, 2, 3, 4]).toString('base64') }
        })
        const parsed = JSON.parse(text, bufferJsonReviver) as { blob: Uint8Array }
        assert.ok(parsed.blob instanceof Uint8Array)
        assert.deepEqual(Array.from(parsed.blob), [1, 2, 3, 4])
    })

    it('passes through plain values unchanged', () => {
        const parsed = JSON.parse('{"a":1,"b":"x","c":[1,2]}', bufferJsonReviver)
        assert.deepEqual(parsed, { a: 1, b: 'x', c: [1, 2] })
    })

    it('does not match objects that only have data without type', () => {
        const parsed = JSON.parse('{"data":"abc"}', bufferJsonReviver) as Record<string, unknown>
        assert.equal(parsed.data, 'abc')
    })
})
