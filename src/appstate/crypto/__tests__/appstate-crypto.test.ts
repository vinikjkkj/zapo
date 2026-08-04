import assert from 'node:assert/strict'
import test from 'node:test'

import { APP_STATE_EMPTY_LT_HASH } from '@appstate/constants'
import { WaAppStateCrypto } from '@appstate/crypto/WaAppStateCrypto'
import { proto } from '@proto'
import { WA_APP_STATE_COLLECTIONS } from '@protocol/constants'

test('appstate crypto encrypts/decrypts mutation and computes hash transitions', async () => {
    const crypto = new WaAppStateCrypto()
    const keyId = new Uint8Array([0, 1, 2, 3, 4, 5])
    const keyData = new Uint8Array(32).fill(9)

    const encrypted = await crypto.encryptMutation({
        operation: proto.SyncdMutation.SyncdOperation.SET,
        keyId,
        keyData,
        index: 'chat:1',
        value: { timestamp: 123 },
        version: 1,
        iv: new Uint8Array(16).fill(1)
    })

    const decrypted = await crypto.decryptMutation({
        operation: proto.SyncdMutation.SyncdOperation.SET,
        keyId,
        keyData,
        indexMac: encrypted.indexMac,
        valueBlob: encrypted.valueBlob
    })

    assert.equal(decrypted.index, 'chat:1')
    assert.equal(decrypted.version, 1)

    const snapshotMac = await crypto.generateSnapshotMac(
        keyData,
        APP_STATE_EMPTY_LT_HASH,
        1,
        WA_APP_STATE_COLLECTIONS.REGULAR
    )
    const patchMac = await crypto.generatePatchMac(
        keyData,
        snapshotMac,
        [encrypted.valueMac],
        1,
        WA_APP_STATE_COLLECTIONS.REGULAR
    )

    assert.equal(snapshotMac.length > 0, true)
    assert.equal(patchMac.length > 0, true)

    const updated = await crypto.ltHashSubtractThenAdd(
        APP_STATE_EMPTY_LT_HASH,
        [encrypted.valueMac],
        []
    )
    assert.equal(updated.hash.length, APP_STATE_EMPTY_LT_HASH.length)
})

test('appstate crypto rejects tampered value and index MACs by default', async () => {
    const crypto = new WaAppStateCrypto()
    const keyId = new Uint8Array([0, 1, 2, 3, 4, 5])
    const keyData = new Uint8Array(32).fill(9)

    const encrypted = await crypto.encryptMutation({
        operation: proto.SyncdMutation.SyncdOperation.SET,
        keyId,
        keyData,
        index: 'chat:1',
        value: { timestamp: 123 },
        version: 1,
        iv: new Uint8Array(16).fill(1)
    })

    const tamperedValueBlob = new Uint8Array(encrypted.valueBlob)
    tamperedValueBlob[tamperedValueBlob.length - 1] ^= 0x01
    await assert.rejects(
        () =>
            crypto.decryptMutation({
                operation: proto.SyncdMutation.SyncdOperation.SET,
                keyId,
                keyData,
                indexMac: encrypted.indexMac,
                valueBlob: tamperedValueBlob
            }),
        /mutation value MAC mismatch/
    )

    const tamperedIndexMac = new Uint8Array(encrypted.indexMac)
    tamperedIndexMac[0] ^= 0x01
    await assert.rejects(
        () =>
            crypto.decryptMutation({
                operation: proto.SyncdMutation.SyncdOperation.SET,
                keyId,
                keyData,
                indexMac: tamperedIndexMac,
                valueBlob: encrypted.valueBlob
            }),
        /mutation index MAC mismatch/
    )
})

test('appstate crypto bypasses value and index MAC checks when skipMacVerification is set', async () => {
    const crypto = new WaAppStateCrypto(undefined, true)
    const keyId = new Uint8Array([0, 1, 2, 3, 4, 5])
    const keyData = new Uint8Array(32).fill(9)

    const encrypted = await crypto.encryptMutation({
        operation: proto.SyncdMutation.SyncdOperation.SET,
        keyId,
        keyData,
        index: 'chat:1',
        value: { timestamp: 123 },
        version: 1,
        iv: new Uint8Array(16).fill(1)
    })

    const tamperedValueBlob = new Uint8Array(encrypted.valueBlob)
    tamperedValueBlob[tamperedValueBlob.length - 1] ^= 0x01
    const tamperedIndexMac = new Uint8Array(encrypted.indexMac)
    tamperedIndexMac[0] ^= 0x01

    const decrypted = await crypto.decryptMutation({
        operation: proto.SyncdMutation.SyncdOperation.SET,
        keyId,
        keyData,
        indexMac: tamperedIndexMac,
        valueBlob: tamperedValueBlob
    })
    assert.equal(decrypted.index, 'chat:1')
    assert.equal(decrypted.version, 1)
    assert.equal(crypto.isMacVerificationSkipped, true)
})

test('lt-hash add/subtract matches a DataView reference implementation', async () => {
    const { hkdf } = await import('@crypto')
    const { WA_APP_STATE_KDF_INFO } = await import('@protocol/constants')
    const crypto = new WaAppStateCrypto()

    const expand = (value: Uint8Array): Uint8Array =>
        hkdf(value, null, WA_APP_STATE_KDF_INFO.PATCH_INTEGRITY, APP_STATE_EMPTY_LT_HASH.byteLength)

    const referenceApply = (
        base: Uint8Array,
        values: readonly Uint8Array[],
        combine: (left: number, right: number) => number
    ): Uint8Array => {
        let current = base
        for (const value of values) {
            const expanded = expand(value)
            const out = new Uint8Array(current.byteLength)
            const leftView = new DataView(current.buffer, current.byteOffset, current.byteLength)
            const rightView = new DataView(
                expanded.buffer,
                expanded.byteOffset,
                expanded.byteLength
            )
            const outView = new DataView(out.buffer, out.byteOffset, out.byteLength)
            for (let offset = 0; offset < current.byteLength; offset += 2) {
                const combined = combine(
                    leftView.getUint16(offset, true),
                    rightView.getUint16(offset, true)
                )
                outView.setUint16(offset, combined & 0xffff, true)
            }
            current = out
        }
        return current
    }

    const values: Uint8Array[] = []
    for (let i = 0; i < 12; i += 1) {
        const value = new Uint8Array(32)
        for (let j = 0; j < value.length; j += 1) {
            value[j] = (i * 37 + j * 251 + 13) & 0xff
        }
        values.push(value)
    }
    const base = new Uint8Array(APP_STATE_EMPTY_LT_HASH.byteLength)
    for (let j = 0; j < base.length; j += 1) {
        base[j] = (j * 199 + 7) & 0xff
    }

    const added = await crypto.ltHashAdd(base, values)
    assert.deepEqual(
        Array.from(added),
        Array.from(referenceApply(base, values, (left, right) => left + right))
    )

    const subtracted = await crypto.ltHashSubtract(added, values.slice(0, 5))
    assert.deepEqual(
        Array.from(subtracted),
        Array.from(referenceApply(added, values.slice(0, 5), (left, right) => left - right))
    )

    const roundTrip = await crypto.ltHashSubtract(added, values)
    assert.deepEqual(Array.from(roundTrip), Array.from(base))
})
