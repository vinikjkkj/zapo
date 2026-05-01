import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { convertBaileysSession } from '../baileys/session'
import type {
    BaileysSerializedSessionEntry,
    BaileysSerializedSessionRecord
} from '../baileys/types'

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')

function pubKey33(seed: number): Uint8Array {
    const out = new Uint8Array(33)
    out[0] = 0x05
    out.fill(seed, 1)
    return out
}

function bytes32(seed: number): Uint8Array {
    return new Uint8Array(32).fill(seed)
}

const RATCHET_PUB = pubKey33(0xaa)
const RATCHET_PRIV = bytes32(0x11)
const ROOT_KEY = bytes32(0x22)
const SEND_CHAIN_KEY = bytes32(0x33)
const REMOTE_IDENTITY = pubKey33(0xbb)
const BASE_KEY = pubKey33(0xcc)
const RECV_RATCHET = pubKey33(0xdd)
const RECV_CHAIN_KEY = bytes32(0x44)
const PENDING_BASE = pubKey33(0xee)
const LOCAL_IDENTITY_32 = bytes32(0x55)

function makeOpenEntryAsBob(): BaileysSerializedSessionEntry {
    // baseKeyType = 2 (THEIRS) — we are Bob, alice's basekey is the indexInfo.baseKey
    return {
        registrationId: 4242,
        currentRatchet: {
            ephemeralKeyPair: {
                pubKey: b64(RATCHET_PUB),
                privKey: b64(RATCHET_PRIV)
            },
            lastRemoteEphemeralKey: b64(RECV_RATCHET),
            previousCounter: 9,
            rootKey: b64(ROOT_KEY)
        },
        indexInfo: {
            baseKey: b64(BASE_KEY),
            baseKeyType: 2,
            closed: -1,
            used: 1_700_000_000,
            created: 1_699_000_000,
            remoteIdentityKey: b64(REMOTE_IDENTITY)
        },
        _chains: {
            [b64(RATCHET_PUB)]: {
                chainKey: { counter: 7, key: b64(SEND_CHAIN_KEY) },
                chainType: 1,
                messageKeys: {}
            },
            [b64(RECV_RATCHET)]: {
                chainKey: { counter: 3, key: b64(RECV_CHAIN_KEY) },
                chainType: 2,
                messageKeys: {}
            }
        }
    }
}

function makePendingEntryAsAlice(): BaileysSerializedSessionEntry {
    // baseKeyType = 1 (OURS) — we are Alice, indexInfo.baseKey is our ephemeral
    return {
        registrationId: 1234,
        currentRatchet: {
            ephemeralKeyPair: {
                pubKey: b64(RATCHET_PUB),
                privKey: b64(RATCHET_PRIV)
            },
            lastRemoteEphemeralKey: b64(RECV_RATCHET),
            previousCounter: 0,
            rootKey: b64(ROOT_KEY)
        },
        indexInfo: {
            baseKey: b64(BASE_KEY),
            baseKeyType: 1,
            closed: -1,
            used: 1_700_000_500,
            created: 1_700_000_500,
            remoteIdentityKey: b64(REMOTE_IDENTITY)
        },
        _chains: {
            [b64(RATCHET_PUB)]: {
                chainKey: { counter: 0, key: b64(SEND_CHAIN_KEY) },
                chainType: 1,
                messageKeys: {}
            }
        },
        pendingPreKey: {
            signedKeyId: 17,
            preKeyId: 99,
            baseKey: b64(PENDING_BASE)
        }
    }
}

describe('convertBaileysSession (real Baileys SessionRecord shape)', () => {
    it('maps the open entry into a SignalSessionRecord with byte-correct fields', () => {
        const record: BaileysSerializedSessionRecord = {
            version: 'v1',
            _sessions: {
                [b64(BASE_KEY)]: makeOpenEntryAsBob()
            }
        }

        const result = convertBaileysSession('5511999999999.7', record, {
            local: { regId: 8888, identityPubKey: LOCAL_IDENTITY_32 }
        })

        assert.equal(result.address.user, '5511999999999')
        assert.equal(result.address.device, 7)

        const r = result.record
        assert.equal(r.local.regId, 8888)
        assert.equal(r.local.pubKey.length, 33)
        assert.equal(r.local.pubKey[0], 0x05)
        assert.equal(r.remote.regId, 4242)
        assert.deepEqual(Array.from(r.remote.pubKey), Array.from(REMOTE_IDENTITY))
        assert.deepEqual(Array.from(r.rootKey), Array.from(ROOT_KEY))

        // Send chain — pulled from _chains[base64(ratchetPub)]
        assert.deepEqual(Array.from(r.sendChain.ratchetKey.pubKey), Array.from(RATCHET_PUB))
        assert.deepEqual(Array.from(r.sendChain.ratchetKey.privKey), Array.from(RATCHET_PRIV))
        assert.equal(r.sendChain.nextMsgIndex, 7)
        assert.deepEqual(Array.from(r.sendChain.chainKey), Array.from(SEND_CHAIN_KEY))

        // Recv chain — the other entry in _chains
        assert.equal(r.recvChains.length, 1)
        const recv = r.recvChains[0]
        assert.deepEqual(Array.from(recv.senderRatchetKey!), Array.from(RECV_RATCHET))
        assert.equal(recv.chainKey?.index, 3)
        assert.deepEqual(Array.from(recv.chainKey.key!), Array.from(RECV_CHAIN_KEY))
        assert.equal(recv.messageKeys?.length, 0)

        // We are Bob — aliceBaseKey is null
        assert.equal(r.aliceBaseKey, null)
        // No pendingPreKey on this entry
        assert.equal(r.initialExchangeInfo, null)
        assert.equal(r.prevSendChainHighestIndex, 9)
        assert.equal(r.prevSessions.length, 0)
    })

    it('maps Alice-side pending session with aliceBaseKey + initialExchangeInfo', () => {
        const record: BaileysSerializedSessionRecord = {
            version: 'v1',
            _sessions: {
                [b64(BASE_KEY)]: makePendingEntryAsAlice()
            }
        }

        const result = convertBaileysSession('5511999999999.0', record, {
            local: { regId: 1, identityPubKey: LOCAL_IDENTITY_32 }
        })

        assert.deepEqual(Array.from(result.record.aliceBaseKey!), Array.from(BASE_KEY))
        assert.ok(result.record.initialExchangeInfo)
        assert.equal(result.record.initialExchangeInfo.remoteSignedId, 17)
        assert.equal(result.record.initialExchangeInfo.remoteOneTimeId, 99)
        assert.deepEqual(
            Array.from(result.record.initialExchangeInfo.localOneTimePubKey),
            Array.from(PENDING_BASE)
        )
    })

    it('promotes closed sessions to prevSessions, current = open one', () => {
        const closedEntry: BaileysSerializedSessionEntry = {
            ...makeOpenEntryAsBob(),
            registrationId: 7777,
            indexInfo: {
                ...makeOpenEntryAsBob().indexInfo,
                closed: 1_699_999_999, // closed
                used: 1_699_500_000
            }
        }
        const openEntry = makeOpenEntryAsBob()
        const record: BaileysSerializedSessionRecord = {
            version: 'v1',
            _sessions: {
                'old-key': closedEntry,
                [b64(BASE_KEY)]: openEntry
            }
        }

        const result = convertBaileysSession('5511.0', record, {
            local: { regId: 1, identityPubKey: LOCAL_IDENTITY_32 }
        })

        assert.equal(result.record.remote.regId, 4242) // open one
        assert.equal(result.record.prevSessions.length, 1)
        assert.equal(result.record.prevSessions[0].remoteRegistrationId, 7777)
        assert.equal(result.record.prevSessions[0].sessionVersion, 3)
    })

    it('falls back to most-recently-used when no entry is open', () => {
        const olderEntry: BaileysSerializedSessionEntry = {
            ...makeOpenEntryAsBob(),
            registrationId: 1111,
            indexInfo: {
                ...makeOpenEntryAsBob().indexInfo,
                closed: 1_699_000_000,
                used: 1_699_000_000
            }
        }
        const newerEntry: BaileysSerializedSessionEntry = {
            ...makeOpenEntryAsBob(),
            registrationId: 2222,
            indexInfo: {
                ...makeOpenEntryAsBob().indexInfo,
                closed: 1_700_000_000,
                used: 1_700_500_000
            }
        }
        const record: BaileysSerializedSessionRecord = {
            version: 'v1',
            _sessions: {
                older: olderEntry,
                newer: newerEntry
            }
        }

        const result = convertBaileysSession('5511.0', record, {
            local: { regId: 1, identityPubKey: LOCAL_IDENTITY_32 }
        })
        assert.equal(result.record.remote.regId, 2222)
        assert.equal(result.record.prevSessions.length, 1)
    })

    it('accepts Uint8Array for binary fields (custom-store path)', () => {
        // Same struct but using Uint8Array everywhere instead of base64 strings.
        const entry: BaileysSerializedSessionEntry = {
            registrationId: 4242,
            currentRatchet: {
                ephemeralKeyPair: { pubKey: RATCHET_PUB, privKey: RATCHET_PRIV },
                lastRemoteEphemeralKey: RECV_RATCHET,
                previousCounter: 0,
                rootKey: ROOT_KEY
            },
            indexInfo: {
                baseKey: BASE_KEY,
                baseKeyType: 2,
                closed: -1,
                used: 0,
                created: 0,
                remoteIdentityKey: REMOTE_IDENTITY
            },
            _chains: {
                [b64(RATCHET_PUB)]: {
                    chainKey: { counter: 0, key: SEND_CHAIN_KEY },
                    chainType: 1,
                    messageKeys: {}
                }
            }
        }
        const record: BaileysSerializedSessionRecord = {
            version: 'v1',
            _sessions: { [b64(BASE_KEY)]: entry }
        }

        const result = convertBaileysSession('5511.0', record, {
            local: { regId: 1, identityPubKey: LOCAL_IDENTITY_32 }
        })
        assert.deepEqual(Array.from(result.record.rootKey), Array.from(ROOT_KEY))
    })

    it('accepts a 33-byte local identityPubKey without re-prefixing', () => {
        const local33 = pubKey33(0x77)
        const record: BaileysSerializedSessionRecord = {
            version: 'v1',
            _sessions: { [b64(BASE_KEY)]: makeOpenEntryAsBob() }
        }
        const result = convertBaileysSession('5511.0', record, {
            local: { regId: 1, identityPubKey: local33 }
        })
        assert.deepEqual(Array.from(result.record.local.pubKey), Array.from(local33))
    })

    it('throws on empty _sessions', () => {
        assert.throws(() =>
            convertBaileysSession(
                '5511.0',
                { version: 'v1', _sessions: {} },
                { local: { regId: 1, identityPubKey: LOCAL_IDENTITY_32 } }
            )
        )
    })
})
