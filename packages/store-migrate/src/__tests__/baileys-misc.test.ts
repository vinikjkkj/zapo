import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { convertBaileysDeviceList } from '../baileys/device-list'
import { convertBaileysTcToken } from '../baileys/privacy-token'

describe('convertBaileysTcToken', () => {
    it('parses string timestamp and uses provided nowMs', () => {
        const token = new Uint8Array([1])
        const result = convertBaileysTcToken(
            '5511999999999@s.whatsapp.net',
            { token, timestamp: '1700000000' },
            { nowMs: 1234 }
        )
        assert.equal(result.tcToken, token)
        assert.equal(result.tcTokenTimestamp, 1_700_000_000)
        assert.equal(result.updatedAtMs, 1234)
    })

    it('omits tcTokenTimestamp when missing or invalid', () => {
        const result = convertBaileysTcToken('x', { token: new Uint8Array() })
        assert.equal(result.tcTokenTimestamp, undefined)
        const bad = convertBaileysTcToken('x', { token: new Uint8Array(), timestamp: 'abc' })
        assert.equal(bad.tcTokenTimestamp, undefined)
    })
})

describe('convertBaileysDeviceList', () => {
    it('wraps raw device JIDs into a snapshot', () => {
        const result = convertBaileysDeviceList(
            '5511999999999@s.whatsapp.net',
            ['5511999999999:0@s.whatsapp.net', '5511999999999:12@s.whatsapp.net'],
            { nowMs: 42 }
        )
        assert.equal(result.userJid, '5511999999999@s.whatsapp.net')
        assert.equal(result.deviceJids.length, 2)
        assert.equal(result.updatedAtMs, 42)
    })
})
