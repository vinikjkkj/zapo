import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseLibsignalAddressString, signalAddressFromLibsignalString } from '../util/address'

describe('parseLibsignalAddressString', () => {
    it('parses Baileys-style dotted address', () => {
        assert.deepEqual(parseLibsignalAddressString('5511999999999.0'), {
            id: '5511999999999',
            device: 0
        })
    })

    it('parses whatsmeow-style colon address', () => {
        assert.deepEqual(parseLibsignalAddressString('5511999999999:7'), {
            id: '5511999999999',
            device: 7
        })
    })

    it('uses the rightmost separator so dotted ids survive', () => {
        // Theoretical case — IDs typically don't contain dots, but the parser
        // must split at the trailing device delimiter regardless.
        assert.deepEqual(parseLibsignalAddressString('1.2.3:42'), {
            id: '1.2.3',
            device: 42
        })
    })

    it('rejects malformed input', () => {
        assert.throws(() => parseLibsignalAddressString('5511'))
        assert.throws(() => parseLibsignalAddressString('.5'))
        assert.throws(() => parseLibsignalAddressString('5511.'))
        assert.throws(() => parseLibsignalAddressString('5511.abc'))
    })
})

describe('signalAddressFromLibsignalString', () => {
    it('defaults to s.whatsapp.net when no domain marker is present', () => {
        const addr = signalAddressFromLibsignalString('5511999999999.0')
        assert.equal(addr.user, '5511999999999')
        assert.equal(addr.server, 's.whatsapp.net')
        assert.equal(addr.device, 0)
    })

    it('strips Baileys lid suffix and switches server to lid', () => {
        const addr = signalAddressFromLibsignalString('102513101521058_1.12')
        assert.equal(addr.user, '102513101521058')
        assert.equal(addr.server, 'lid')
        assert.equal(addr.device, 12)
    })

    it('honours explicit server override', () => {
        const addr = signalAddressFromLibsignalString('5511999999999.3', { server: 'lid' })
        assert.equal(addr.server, 'lid')
    })

    it('does not strip non-numeric underscore suffixes', () => {
        const addr = signalAddressFromLibsignalString('user_name.0')
        assert.equal(addr.user, 'user_name')
        assert.equal(addr.server, 's.whatsapp.net')
    })
})
