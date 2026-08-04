import assert from 'node:assert/strict'
import test from 'node:test'

import { proto, type Proto } from '@proto'
import {
    decodeSignalSessionRecord,
    encodeSignalSessionRecord,
    encodeSignalSessionSnapshot
} from '@signal/session/encoding'
import { bytesToHex } from '@util/bytes'

function bytes(length: number, fill: number): Uint8Array {
    return new Uint8Array(length).fill(fill)
}

function chain(seed: number): Proto.SessionStructure.IChain {
    return {
        senderRatchetKey: bytes(33, seed),
        senderRatchetKeyPrivate: bytes(32, seed + 1),
        chainKey: { index: 10 + seed, key: bytes(32, seed + 2) },
        messageKeys: [
            {
                index: 1,
                cipherKey: bytes(32, seed + 3),
                macKey: bytes(32, seed + 4),
                iv: bytes(16, seed + 5)
            },
            {
                index: 2,
                cipherKey: bytes(32, seed + 6),
                macKey: bytes(32, seed + 7),
                iv: bytes(16, seed + 8)
            }
        ]
    }
}

function sessionStructure(seed: number): Proto.ISessionStructure {
    return {
        sessionVersion: 3,
        localIdentityPublic: bytes(33, seed),
        remoteIdentityPublic: bytes(33, seed + 1),
        localRegistrationId: 1000 + seed,
        remoteRegistrationId: 2000 + seed,
        rootKey: bytes(32, seed + 2),
        previousCounter: 7,
        senderChain: chain(seed + 3),
        receiverChains: [chain(seed + 10)],
        aliceBaseKey: bytes(33, seed + 20)
    }
}

function referenceEncode(record: ReturnType<typeof decodeSignalSessionRecord>): Uint8Array {
    return proto.RecordStructure.encode({
        currentSession: encodeSignalSessionSnapshot(record),
        previousSessions: record.prevSessions as Proto.ISessionStructure[]
    }).finish()
}

function buildRecord(prevCount: number): ReturnType<typeof decodeSignalSessionRecord> {
    const raw = proto.RecordStructure.encode({
        currentSession: sessionStructure(1),
        previousSessions: Array.from({ length: prevCount }, (_, i) => sessionStructure(i + 30))
    }).finish()
    return decodeSignalSessionRecord(raw)
}

test('encodeSignalSessionRecord matches the monolithic encode byte for byte', () => {
    for (const prevCount of [0, 1, 5, 40]) {
        const record = buildRecord(prevCount)
        const expected = bytesToHex(referenceEncode(record))
        assert.equal(
            bytesToHex(encodeSignalSessionRecord(record)),
            expected,
            `cold encode, prevSessions=${prevCount}`
        )
        assert.equal(
            bytesToHex(encodeSignalSessionRecord(record)),
            expected,
            `cached encode, prevSessions=${prevCount}`
        )
    }
})

test('cached prevSessions suffix follows current-session mutations and prevSessions replacement', () => {
    const record = buildRecord(3)
    encodeSignalSessionRecord(record)

    const advanced = {
        ...record,
        sendChain: {
            ...record.sendChain,
            nextMsgIndex: record.sendChain.nextMsgIndex + 5
        }
    }
    assert.equal(
        bytesToHex(encodeSignalSessionRecord(advanced)),
        bytesToHex(referenceEncode(advanced)),
        'current-session mutation with shared prevSessions array'
    )

    const archived = {
        ...record,
        prevSessions: record.prevSessions.slice(1)
    }
    assert.equal(
        bytesToHex(encodeSignalSessionRecord(archived)),
        bytesToHex(referenceEncode(archived)),
        'replaced prevSessions array'
    )

    const decoded = decodeSignalSessionRecord(encodeSignalSessionRecord(record))
    assert.equal(decoded.prevSessions.length, 3)
    assert.equal(
        bytesToHex(encodeSignalSessionRecord(decoded)),
        bytesToHex(encodeSignalSessionRecord(record)),
        'decode/re-encode stability'
    )
})
