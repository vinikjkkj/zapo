import assert from 'node:assert/strict'
import test from 'node:test'

import { sha1 } from '@crypto'
import { createNoopLogger } from '@infra/log/types'
import { WA_IQ_TYPES, WA_NODE_TAGS } from '@protocol/constants'
import { parseSignalAddressFromJid } from '@protocol/jid'
import { decodeExactLength, parseUint } from '@signal/api/codec'
import {
    SIGNAL_KEY_BUNDLE_TYPE_BYTES,
    SIGNAL_KEY_DATA_LENGTH,
    SIGNAL_KEY_ID_LENGTH,
    SIGNAL_REGISTRATION_ID_LENGTH,
    SIGNAL_SIGNATURE_LENGTH
} from '@signal/api/constants'
import { SignalDeviceSyncApi, type SignalLidSyncResult } from '@signal/api/SignalDeviceSyncApi'
import { SignalDigestSyncApi } from '@signal/api/SignalDigestSyncApi'
import { SignalIdentitySyncApi } from '@signal/api/SignalIdentitySyncApi'
import { SignalMissingPreKeysSyncApi } from '@signal/api/SignalMissingPreKeysSyncApi'
import { SignalRotateKeyApi } from '@signal/api/SignalRotateKeyApi'
import { SignalSessionSyncApi } from '@signal/api/SignalSessionSyncApi'
import {
    generatePreKeyPair,
    generateRegistrationInfo,
    generateSignedPreKey
} from '@signal/registration/keygen'
import { WaDeviceListMemoryStore } from '@store/memory/device-list.store'
import { WaIdentityMemoryStore } from '@store/memory/identity.store'
import { WaPreKeyMemoryStore } from '@store/memory/pre-key.store'
import { WaSignalMemoryStore } from '@store/memory/signal.store'
import type { BinaryNode } from '@transport/types'
import { concatBytes, intToBytes } from '@util/bytes'

function makeBytes(length: number, seed = 0): Uint8Array {
    const out = new Uint8Array(length)
    for (let index = 0; index < out.length; index += 1) {
        out[index] = (seed + index) & 0xff
    }
    return out
}

function iqResult(content: BinaryNode['content']): BinaryNode {
    return {
        tag: WA_NODE_TAGS.IQ,
        attrs: {
            type: WA_IQ_TYPES.RESULT
        },
        content
    }
}

test('signal lid sync skips a malformed user node instead of failing the batch', async () => {
    // the server answers an invalid contact with `<user jid='undefined'>` +
    // `<contact type='invalid'>`; the good users in the same batch must survive
    const debugs: string[] = []
    const api = new SignalDeviceSyncApi({
        logger: {
            ...createNoopLogger(),
            debug: (message) => {
                debugs.push(message)
            }
        },
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.USYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.LIST,
                            attrs: {},
                            content: [
                                {
                                    tag: WA_NODE_TAGS.USER,
                                    attrs: { jid: 'undefined' },
                                    content: [
                                        { tag: WA_NODE_TAGS.CONTACT, attrs: { type: 'invalid' } }
                                    ]
                                },
                                {
                                    tag: WA_NODE_TAGS.USER,
                                    attrs: { jid: '5511999999999@s.whatsapp.net' },
                                    content: [
                                        { tag: WA_NODE_TAGS.CONTACT, attrs: { type: 'in' } },
                                        { tag: WA_NODE_TAGS.LID, attrs: { val: '123456789@lid' } }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.queryLidsByPhoneJids([
        '000000000000000@s.whatsapp.net',
        '5511999999999@s.whatsapp.net'
    ])

    // the good user resolves; the invalid input falls back to exists=false
    assert.deepEqual(result, [
        {
            queriedJid: '000000000000000@s.whatsapp.net',
            phoneJid: '000000000000000@s.whatsapp.net',
            lidJid: null,
            exists: false,
            invalid: false,
            status: 'unanswered'
        },
        {
            queriedJid: '5511999999999@s.whatsapp.net',
            phoneJid: '5511999999999@s.whatsapp.net',
            lidJid: '123456789@lid',
            exists: true,
            invalid: false,
            status: 'in'
        }
    ])
    assert.ok(debugs.includes('signal lid sync skipping user node with invalid jid'))
})

test('signal lid sync flags a server-rejected number as invalid, recovered from the contact echo', async () => {
    const api = new SignalDeviceSyncApi({
        logger: createNoopLogger(),
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.USYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.LIST,
                            attrs: {},
                            content: [
                                {
                                    // server marks a malformed number: jid='undefined' plus a
                                    // <contact type='invalid'> echoing the '+<number>' we sent
                                    tag: WA_NODE_TAGS.USER,
                                    attrs: { jid: 'undefined' },
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.CONTACT,
                                            attrs: { type: 'invalid' },
                                            content: '+173010275315715'
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.queryLidsByPhoneJids(['173010275315715@s.whatsapp.net'])
    assert.deepEqual(result, [
        {
            queriedJid: '173010275315715@s.whatsapp.net',
            phoneJid: '173010275315715@s.whatsapp.net',
            lidJid: null,
            exists: false,
            invalid: true,
            status: 'invalid'
        }
    ])
})

test('resolveUserJidPair resolves both forms from the device-list cache without usync', async () => {
    const deviceListStore = new WaDeviceListMemoryStore(60_000)
    try {
        await deviceListStore.upsertUserDevicesBatch([
            {
                userJid: '5511999999999@s.whatsapp.net',
                altUserJid: '123456789@lid',
                deviceJids: [],
                updatedAtMs: Date.now()
            }
        ])
        const api = new SignalDeviceSyncApi({
            logger: createNoopLogger(),
            query: async () => {
                throw new Error('usync must not run on a cache hit')
            },
            deviceListStore
        })

        assert.deepEqual(await api.resolveUserJidPair('5511999999999@s.whatsapp.net'), {
            lidJid: '123456789@lid',
            pnJid: '5511999999999@s.whatsapp.net'
        })
        assert.deepEqual(await api.resolveUserJidPair('123456789@lid'), {
            lidJid: '123456789@lid',
            pnJid: '5511999999999@s.whatsapp.net'
        })
    } finally {
        await deviceListStore.destroy()
    }
})

test('resolveUserJidPair falls back to usync on a PN cache miss and keeps the canonical pn', async () => {
    const api = new SignalDeviceSyncApi({
        logger: createNoopLogger(),
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.USYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.LIST,
                            attrs: {},
                            content: [
                                {
                                    tag: WA_NODE_TAGS.USER,
                                    attrs: { jid: '5511982905991@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.LID,
                                            attrs: { val: '53979165777985@lid' }
                                        },
                                        {
                                            tag: WA_NODE_TAGS.CONTACT,
                                            attrs: { type: 'in' },
                                            content: '+551182905991'
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    // queried without the BR 9th digit -> lid resolves and pn comes back corrected
    assert.deepEqual(await api.resolveUserJidPair('551182905991@s.whatsapp.net'), {
        lidJid: '53979165777985@lid',
        pnJid: '5511982905991@s.whatsapp.net'
    })
})

test('resolveUserJidPair degrades to the known form on misses and failures', async () => {
    const failing = new SignalDeviceSyncApi({
        logger: createNoopLogger(),
        query: async () => {
            throw new Error('usync down')
        }
    })

    // usync failure -> pn passthrough, no lid
    assert.deepEqual(await failing.resolveUserJidPair('5511999999999@s.whatsapp.net'), {
        lidJid: null,
        pnJid: '5511999999999@s.whatsapp.net'
    })
    // lid input has no reverse lookup; without a cache hit the pn stays null
    assert.deepEqual(await failing.resolveUserJidPair('123456789@lid'), {
        lidJid: '123456789@lid',
        pnJid: null
    })
    // neither pn nor lid form
    assert.deepEqual(await failing.resolveUserJidPair('123-456@g.us'), {
        lidJid: null,
        pnJid: null
    })
})

test('signal lid sync exposes the server-corrected number (BR 9th digit) via the contact echo', async () => {
    // real captured response: the server collapses the two queried forms into one
    // <user> with the canonical jid (with the 9) and echoes both queried numbers as
    // <contact type='in'>. Both inputs must resolve, and phoneJid is the corrected form.
    const api = new SignalDeviceSyncApi({
        logger: createNoopLogger(),
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.USYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.LIST,
                            attrs: {},
                            content: [
                                {
                                    tag: WA_NODE_TAGS.USER,
                                    attrs: { jid: '5511982905991@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.LID,
                                            attrs: { country_code: 'BR', val: '53979165777985@lid' }
                                        },
                                        {
                                            tag: WA_NODE_TAGS.CONTACT,
                                            attrs: { type: 'in' },
                                            content: '+5511982905991'
                                        },
                                        {
                                            tag: WA_NODE_TAGS.CONTACT,
                                            attrs: { type: 'in' },
                                            content: '+551182905991'
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.queryLidsByPhoneJids([
        '551182905991@s.whatsapp.net',
        '5511982905991@s.whatsapp.net'
    ])
    assert.deepEqual(result, [
        {
            // queried without the 9 -> corrected to the registered form
            queriedJid: '551182905991@s.whatsapp.net',
            phoneJid: '5511982905991@s.whatsapp.net',
            lidJid: '53979165777985@lid',
            exists: true,
            invalid: false,
            status: 'in'
        },
        {
            queriedJid: '5511982905991@s.whatsapp.net',
            phoneJid: '5511982905991@s.whatsapp.net',
            lidJid: '53979165777985@lid',
            exists: true,
            invalid: false,
            status: 'in'
        }
    ])
})

test('signal api codec decodes exact lengths and unsigned integers', () => {
    const bytes = decodeExactLength(new Uint8Array([0x01, 0x02, 0x03]), 'field', 3)
    assert.deepEqual(bytes, new Uint8Array([0x01, 0x02, 0x03]))

    assert.equal(parseUint(new Uint8Array([0xff]), 'one'), 255)
    assert.equal(parseUint(new Uint8Array([0x12, 0x34]), 'two'), 0x1234)
    assert.equal(parseUint(new Uint8Array([0x01, 0x02, 0x03]), 'three'), 0x010203)
    assert.equal(parseUint(new Uint8Array([0x01, 0x02, 0x03, 0x04]), 'four'), 0x01020304)

    assert.throws(() => decodeExactLength(new Uint8Array([1]), 'field', 2), /must be 2 bytes/)
    assert.throws(() => parseUint(new Uint8Array([1, 2, 3, 4, 5]), 'five'), /invalid byte length/)
})

test('signal digest api validates key bundle hash and maps digest mismatch reasons', async () => {
    const signalStore = new WaSignalMemoryStore()
    const preKeyStore = new WaPreKeyMemoryStore()
    const registration = await generateRegistrationInfo()
    const signedPreKey = await generateSignedPreKey(3, registration.identityKeyPair.privKey)
    const preKeys = [await generatePreKeyPair(10), await generatePreKeyPair(11)]

    await signalStore.setRegistrationInfo(registration)
    await signalStore.setSignedPreKey(signedPreKey)
    await Promise.all(preKeys.map((record) => preKeyStore.putPreKey(record)))

    const digestHash = sha1(
        concatBytes([
            registration.identityKeyPair.pubKey,
            signedPreKey.keyPair.pubKey,
            signedPreKey.signature,
            ...preKeys.map((record) => record.keyPair.pubKey)
        ])
    ).subarray(0, 20)

    const digestNode: BinaryNode = {
        tag: WA_NODE_TAGS.DIGEST,
        attrs: {},
        content: [
            {
                tag: WA_NODE_TAGS.REGISTRATION,
                attrs: {},
                content: intToBytes(SIGNAL_REGISTRATION_ID_LENGTH, registration.registrationId)
            },
            {
                tag: WA_NODE_TAGS.TYPE,
                attrs: {},
                content: SIGNAL_KEY_BUNDLE_TYPE_BYTES
            },
            {
                tag: WA_NODE_TAGS.IDENTITY,
                attrs: {},
                content: registration.identityKeyPair.pubKey
            },
            {
                tag: WA_NODE_TAGS.SKEY,
                attrs: {},
                content: [
                    {
                        tag: WA_NODE_TAGS.ID,
                        attrs: {},
                        content: intToBytes(SIGNAL_KEY_ID_LENGTH, signedPreKey.keyId)
                    },
                    {
                        tag: WA_NODE_TAGS.VALUE,
                        attrs: {},
                        content: signedPreKey.keyPair.pubKey
                    },
                    {
                        tag: WA_NODE_TAGS.SIGNATURE,
                        attrs: {},
                        content: signedPreKey.signature
                    }
                ]
            },
            {
                tag: WA_NODE_TAGS.LIST,
                attrs: {},
                content: preKeys.map((record) => ({
                    tag: WA_NODE_TAGS.ID,
                    attrs: {},
                    content: intToBytes(SIGNAL_KEY_ID_LENGTH, record.keyId)
                }))
            },
            {
                tag: WA_NODE_TAGS.HASH,
                attrs: {},
                content: digestHash
            }
        ]
    }

    const digestApi = new SignalDigestSyncApi({
        logger: createNoopLogger(),
        signalStore,
        preKeyStore,
        query: async () => iqResult([digestNode])
    })
    const valid = await digestApi.validateLocalKeyBundle()
    assert.equal(valid.valid, true)
    assert.equal(valid.reason, 'ok')
    assert.equal(valid.preKeyCount, 2)

    const mismatchApi = new SignalDigestSyncApi({
        logger: createNoopLogger(),
        signalStore,
        preKeyStore,
        query: async () =>
            iqResult([
                {
                    ...digestNode,
                    content: [
                        {
                            tag: WA_NODE_TAGS.REGISTRATION,
                            attrs: {},
                            content: intToBytes(
                                SIGNAL_REGISTRATION_ID_LENGTH,
                                registration.registrationId + 1
                            )
                        },
                        ...(digestNode.content as BinaryNode[]).slice(1)
                    ]
                }
            ])
    })
    const mismatch = await mismatchApi.validateLocalKeyBundle()
    assert.equal(mismatch.valid, false)
    assert.equal(mismatch.shouldReupload, true)
    assert.equal(mismatch.reason, 'registration_mismatch')
})

test('signal digest api accepts prefetched local key bundle context', async () => {
    const registration = await generateRegistrationInfo()
    const signedPreKey = await generateSignedPreKey(6, registration.identityKeyPair.privKey)
    const preKey = await generatePreKeyPair(21)
    const digestHash = sha1(
        concatBytes([
            registration.identityKeyPair.pubKey,
            signedPreKey.keyPair.pubKey,
            signedPreKey.signature,
            preKey.keyPair.pubKey
        ])
    ).subarray(0, 20)

    const digestNode: BinaryNode = {
        tag: WA_NODE_TAGS.DIGEST,
        attrs: {},
        content: [
            {
                tag: WA_NODE_TAGS.REGISTRATION,
                attrs: {},
                content: intToBytes(SIGNAL_REGISTRATION_ID_LENGTH, registration.registrationId)
            },
            {
                tag: WA_NODE_TAGS.TYPE,
                attrs: {},
                content: SIGNAL_KEY_BUNDLE_TYPE_BYTES
            },
            {
                tag: WA_NODE_TAGS.IDENTITY,
                attrs: {},
                content: registration.identityKeyPair.pubKey
            },
            {
                tag: WA_NODE_TAGS.SKEY,
                attrs: {},
                content: [
                    {
                        tag: WA_NODE_TAGS.ID,
                        attrs: {},
                        content: intToBytes(SIGNAL_KEY_ID_LENGTH, signedPreKey.keyId)
                    },
                    {
                        tag: WA_NODE_TAGS.VALUE,
                        attrs: {},
                        content: signedPreKey.keyPair.pubKey
                    },
                    {
                        tag: WA_NODE_TAGS.SIGNATURE,
                        attrs: {},
                        content: signedPreKey.signature
                    }
                ]
            },
            {
                tag: WA_NODE_TAGS.LIST,
                attrs: {},
                content: [
                    {
                        tag: WA_NODE_TAGS.ID,
                        attrs: {},
                        content: intToBytes(SIGNAL_KEY_ID_LENGTH, preKey.keyId)
                    }
                ]
            },
            {
                tag: WA_NODE_TAGS.HASH,
                attrs: {},
                content: digestHash
            }
        ]
    }

    let getRegistrationInfoCalls = 0
    let getSignedPreKeyCalls = 0
    const digestApi = new SignalDigestSyncApi({
        logger: createNoopLogger(),
        query: async () => iqResult([digestNode]),
        signalStore: {
            getRegistrationInfo: async () => {
                getRegistrationInfoCalls += 1
                throw new Error('getRegistrationInfo should not be called with prefetched context')
            },
            getSignedPreKey: async () => {
                getSignedPreKeyCalls += 1
                throw new Error('getSignedPreKey should not be called with prefetched context')
            }
        } as never,
        preKeyStore: {
            getPreKeysById: async (preKeyIds: readonly number[]) =>
                preKeyIds.map((preKeyId) => (preKeyId === preKey.keyId ? preKey : null))
        } as never
    })

    const valid = await digestApi.validateLocalKeyBundle({
        registrationInfo: registration,
        signedPreKey
    })
    assert.equal(valid.valid, true)
    assert.equal(getRegistrationInfoCalls, 0)
    assert.equal(getSignedPreKeyCalls, 0)
})

test('signal device sync api parses users/devices and reuses cache when still fresh', async () => {
    const deviceListStore = new WaDeviceListMemoryStore(60_000)
    let queryCalls = 0

    try {
        const api = new SignalDeviceSyncApi({
            logger: createNoopLogger(),
            deviceListStore,
            query: async () => {
                queryCalls += 1
                return iqResult([
                    {
                        tag: WA_NODE_TAGS.USYNC,
                        attrs: {},
                        content: [
                            {
                                tag: WA_NODE_TAGS.LIST,
                                attrs: {},
                                content: [
                                    {
                                        tag: WA_NODE_TAGS.USER,
                                        attrs: { jid: '5511999999999@s.whatsapp.net' },
                                        content: [
                                            {
                                                tag: WA_NODE_TAGS.DEVICES,
                                                attrs: {},
                                                content: [
                                                    {
                                                        tag: 'device-list',
                                                        attrs: {},
                                                        content: [
                                                            { tag: 'device', attrs: { id: '0' } },
                                                            { tag: 'device', attrs: { id: '1' } },
                                                            { tag: 'device', attrs: { id: '1' } },
                                                            { tag: 'device', attrs: { id: 'bad' } }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ])
            }
        })

        const first = await api.syncDeviceList(['5511999999999@s.whatsapp.net'])
        assert.equal(first.length, 1)
        assert.deepEqual(first[0].deviceJids, [
            '5511999999999@s.whatsapp.net',
            '5511999999999:1@s.whatsapp.net'
        ])

        const second = await api.syncDeviceList(['5511999999999@s.whatsapp.net'])
        assert.equal(second.length, 1)
        assert.equal(queryCalls, 1)
    } finally {
        await deviceListStore.destroy()
    }
})

test('signal device sync api deduplicates concurrent syncDeviceList calls for the same users', async () => {
    const deviceListStore = new WaDeviceListMemoryStore(60_000)
    let queryCalls = 0

    try {
        const api = new SignalDeviceSyncApi({
            logger: createNoopLogger(),
            deviceListStore,
            query: async () => {
                queryCalls += 1
                // simulate network delay so concurrent calls overlap
                await new Promise((resolve) => setTimeout(resolve, 20))
                return iqResult([
                    {
                        tag: WA_NODE_TAGS.USYNC,
                        attrs: {},
                        content: [
                            {
                                tag: WA_NODE_TAGS.LIST,
                                attrs: {},
                                content: [
                                    {
                                        tag: WA_NODE_TAGS.USER,
                                        attrs: { jid: '5511888888888@s.whatsapp.net' },
                                        content: [
                                            {
                                                tag: WA_NODE_TAGS.DEVICES,
                                                attrs: {},
                                                content: [
                                                    {
                                                        tag: 'device-list',
                                                        attrs: {},
                                                        content: [
                                                            { tag: 'device', attrs: { id: '0' } },
                                                            { tag: 'device', attrs: { id: '2' } }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ])
            }
        })

        const results = await Promise.all([
            api.syncDeviceList(['5511888888888@s.whatsapp.net']),
            api.syncDeviceList(['5511888888888@s.whatsapp.net']),
            api.syncDeviceList(['5511888888888@s.whatsapp.net'])
        ])

        assert.equal(queryCalls, 1, 'should issue only one server query')
        for (const result of results) {
            assert.equal(result.length, 1)
            assert.deepEqual(result[0].deviceJids, [
                '5511888888888@s.whatsapp.net',
                '5511888888888:2@s.whatsapp.net'
            ])
        }
    } finally {
        await deviceListStore.destroy()
    }
})

test('signal device sync api preserves requested users omitted by usync response', async () => {
    const api = new SignalDeviceSyncApi({
        logger: createNoopLogger(),
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.USYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.LIST,
                            attrs: {},
                            content: [
                                {
                                    tag: WA_NODE_TAGS.USER,
                                    attrs: { jid: '5511999999999@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.DEVICES,
                                            attrs: {},
                                            content: [
                                                {
                                                    tag: 'device-list',
                                                    attrs: {},
                                                    content: [{ tag: 'device', attrs: { id: '0' } }]
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const synced = await api.syncDeviceList([
        '5511999999999@s.whatsapp.net',
        '5511888888888@s.whatsapp.net'
    ])
    assert.deepEqual(synced, [
        {
            jid: '5511999999999@s.whatsapp.net',
            deviceJids: ['5511999999999@s.whatsapp.net']
        },
        {
            jid: '5511888888888@s.whatsapp.net',
            deviceJids: []
        }
    ])
})

test('signal device sync api resolves lids by phone jids via usync and returns exists', async () => {
    let capturedRequest: BinaryNode | null = null
    const api = new SignalDeviceSyncApi({
        logger: createNoopLogger(),
        query: async (node) => {
            capturedRequest = node
            return iqResult([
                {
                    tag: WA_NODE_TAGS.USYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.LIST,
                            attrs: {},
                            content: [
                                {
                                    tag: WA_NODE_TAGS.USER,
                                    attrs: { jid: '5511999999999@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.CONTACT,
                                            attrs: {
                                                type: 'in'
                                            }
                                        },
                                        {
                                            tag: WA_NODE_TAGS.LID,
                                            attrs: {
                                                val: '123456789@lid'
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
        }
    })

    const result = await api.queryLidsByPhoneJids([
        '5511999999999@s.whatsapp.net',
        '5511888888888@s.whatsapp.net'
    ])
    assert.deepEqual(result, [
        {
            queriedJid: '5511999999999@s.whatsapp.net',
            phoneJid: '5511999999999@s.whatsapp.net',
            lidJid: '123456789@lid',
            exists: true,
            invalid: false,
            status: 'in'
        },
        {
            queriedJid: '5511888888888@s.whatsapp.net',
            phoneJid: '5511888888888@s.whatsapp.net',
            lidJid: null,
            exists: false,
            invalid: false,
            status: 'unanswered'
        }
    ])

    if (!capturedRequest) {
        throw new Error('expected captured lid sync request content')
    }
    const request = capturedRequest as BinaryNode
    if (!Array.isArray(request.content)) {
        throw new Error('expected captured lid sync request content')
    }
    const requestContent = request.content as readonly BinaryNode[]
    const usyncNode = requestContent[0]
    assert.equal(usyncNode.tag, WA_NODE_TAGS.USYNC)
    if (!Array.isArray(usyncNode.content)) {
        throw new Error('expected usync node content')
    }
    const queryNode = usyncNode.content.find(
        (entry: BinaryNode) => entry.tag === WA_NODE_TAGS.QUERY
    )
    if (!queryNode || !Array.isArray(queryNode.content)) {
        throw new Error('expected usync query node content')
    }
    assert.equal(queryNode.content[0].tag, WA_NODE_TAGS.CONTACT)
    assert.equal(queryNode.content[1].tag, WA_NODE_TAGS.LID)

    const listNode = usyncNode.content.find((entry: BinaryNode) => entry.tag === WA_NODE_TAGS.LIST)
    if (!listNode || !Array.isArray(listNode.content)) {
        throw new Error('expected usync list node content')
    }
    assert.equal(listNode.content.length, 2)
    assert.ok(Array.isArray(listNode.content[0].content))
    assert.equal(
        (listNode.content[0].content as readonly BinaryNode[])[0].tag,
        WA_NODE_TAGS.CONTACT
    )
})

test('signal device sync api marks exists=false when contact type is out', async () => {
    const api = new SignalDeviceSyncApi({
        logger: createNoopLogger(),
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.USYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.LIST,
                            attrs: {},
                            content: [
                                {
                                    tag: WA_NODE_TAGS.USER,
                                    attrs: { jid: '5511888888888@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.CONTACT,
                                            attrs: {
                                                type: 'out'
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.queryLidsByPhoneJids(['5511888888888@s.whatsapp.net'])
    assert.deepEqual(result, [
        {
            queriedJid: '5511888888888@s.whatsapp.net',
            phoneJid: '5511888888888@s.whatsapp.net',
            lidJid: null,
            exists: false,
            invalid: false,
            status: 'out'
        }
    ])
})

test('signal device sync api handles lid node user error and preserves contact existence', async () => {
    const warnings: {
        readonly message: string
        readonly context: Readonly<Record<string, unknown>>
    }[] = []
    const api = new SignalDeviceSyncApi({
        logger: {
            ...createNoopLogger(),
            warn: (message, context = {}) => {
                warnings.push({ message, context })
            }
        },
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.USYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.LIST,
                            attrs: {},
                            content: [
                                {
                                    tag: WA_NODE_TAGS.USER,
                                    attrs: { jid: '5511999999999@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.CONTACT,
                                            attrs: {
                                                type: 'in'
                                            }
                                        },
                                        {
                                            tag: WA_NODE_TAGS.LID,
                                            attrs: {},
                                            content: [
                                                {
                                                    tag: WA_NODE_TAGS.ERROR,
                                                    attrs: { code: '404', text: 'not-found' }
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.queryLidsByPhoneJids(['5511999999999@s.whatsapp.net'])
    assert.deepEqual(result, [
        {
            queriedJid: '5511999999999@s.whatsapp.net',
            phoneJid: '5511999999999@s.whatsapp.net',
            lidJid: null,
            exists: true,
            invalid: false,
            status: 'in',
            error: { code: '404', text: 'not-found' }
        }
    ])
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0].message, 'signal lid sync user errors')
    assert.equal(warnings[0].context.droppedCount, 1)
})

test('signal device sync api forces exists=false when contact node has error', async () => {
    const warnings: {
        readonly message: string
        readonly context: Readonly<Record<string, unknown>>
    }[] = []
    const api = new SignalDeviceSyncApi({
        logger: {
            ...createNoopLogger(),
            warn: (message, context = {}) => {
                warnings.push({ message, context })
            }
        },
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.USYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.LIST,
                            attrs: {},
                            content: [
                                {
                                    tag: WA_NODE_TAGS.USER,
                                    attrs: { jid: '5511999999999@s.whatsapp.net' },
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.CONTACT,
                                            attrs: {},
                                            content: [
                                                {
                                                    tag: WA_NODE_TAGS.ERROR,
                                                    attrs: { code: '500', text: 'lookup-failed' }
                                                }
                                            ]
                                        },
                                        {
                                            tag: WA_NODE_TAGS.LID,
                                            attrs: {
                                                val: '123456789@lid'
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.queryLidsByPhoneJids(['5511999999999@s.whatsapp.net'])
    assert.deepEqual(result, [
        {
            queriedJid: '5511999999999@s.whatsapp.net',
            phoneJid: '5511999999999@s.whatsapp.net',
            lidJid: '123456789@lid',
            exists: false,
            invalid: false,
            status: 'error',
            error: { code: '500', text: 'lookup-failed' }
        }
    ])
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0].message, 'signal lid sync contact error')
})

test('signal device sync api maps user response by pn_jid when jid differs', async () => {
    const api = new SignalDeviceSyncApi({
        logger: createNoopLogger(),
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.USYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.LIST,
                            attrs: {},
                            content: [
                                {
                                    tag: WA_NODE_TAGS.USER,
                                    attrs: {
                                        jid: '123456789@lid',
                                        pn_jid: '5511999999999@s.whatsapp.net'
                                    },
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.CONTACT,
                                            attrs: {
                                                type: 'in'
                                            }
                                        },
                                        {
                                            tag: WA_NODE_TAGS.LID,
                                            attrs: {
                                                val: '123456789@lid'
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.queryLidsByPhoneJids(['5511999999999@s.whatsapp.net'])
    assert.deepEqual(result, [
        {
            queriedJid: '5511999999999@s.whatsapp.net',
            phoneJid: '5511999999999@s.whatsapp.net',
            lidJid: '123456789@lid',
            exists: true,
            invalid: false,
            status: 'in'
        }
    ])
})

test('signal device sync api maps hosted.lid user response to requested lid user', async () => {
    const api = new SignalDeviceSyncApi({
        logger: createNoopLogger(),
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.USYNC,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.LIST,
                            attrs: {},
                            content: [
                                {
                                    tag: WA_NODE_TAGS.USER,
                                    attrs: { jid: '6116570308623@hosted.lid' },
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.DEVICES,
                                            attrs: {},
                                            content: [
                                                {
                                                    tag: 'device-list',
                                                    attrs: {},
                                                    content: [
                                                        { tag: 'device', attrs: { id: '99' } }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.syncDeviceList(['6116570308623@lid'])
    assert.deepEqual(result, [
        {
            jid: '6116570308623@lid',
            deviceJids: ['6116570308623:99@hosted.lid']
        }
    ])
})

test('signal identity sync api parses result list and stores remote identities', async () => {
    const identityStore = new WaIdentityMemoryStore()
    const api = new SignalIdentitySyncApi({
        logger: createNoopLogger(),
        identityStore,
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.LIST,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.USER,
                            attrs: { jid: '5511999999999:1@s.whatsapp.net' },
                            content: [
                                {
                                    tag: WA_NODE_TAGS.IDENTITY,
                                    attrs: {},
                                    content: makeBytes(SIGNAL_KEY_DATA_LENGTH, 1)
                                },
                                {
                                    tag: WA_NODE_TAGS.TYPE,
                                    attrs: {},
                                    content: SIGNAL_KEY_BUNDLE_TYPE_BYTES
                                }
                            ]
                        },
                        {
                            tag: WA_NODE_TAGS.USER,
                            attrs: { jid: '5511888888888@s.whatsapp.net' },
                            content: [
                                {
                                    tag: WA_NODE_TAGS.ERROR,
                                    attrs: { code: '404', text: 'not found' }
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.syncIdentityKeys([
        '5511999999999:1@s.whatsapp.net',
        '5511888888888@s.whatsapp.net'
    ])
    assert.equal(result.length, 1)
    assert.equal(result[0].jid, '5511999999999:1@s.whatsapp.net')
    assert.equal(result[0].identity.length, 32)
    assert.equal(result[0].type, SIGNAL_KEY_BUNDLE_TYPE_BYTES[0])

    const persisted = await identityStore.getRemoteIdentity(
        parseSignalAddressFromJid('5511999999999:1@s.whatsapp.net')
    )
    assert.ok(persisted)
    assert.equal(persisted.length, 33)
})

test('signal identity sync api maps hosted.lid response jid to requested lid jid', async () => {
    const api = new SignalIdentitySyncApi({
        logger: createNoopLogger(),
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.LIST,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.USER,
                            attrs: { jid: '6116570308623:99@hosted.lid' },
                            content: [
                                {
                                    tag: WA_NODE_TAGS.IDENTITY,
                                    attrs: {},
                                    content: makeBytes(SIGNAL_KEY_DATA_LENGTH, 9)
                                },
                                {
                                    tag: WA_NODE_TAGS.TYPE,
                                    attrs: {},
                                    content: SIGNAL_KEY_BUNDLE_TYPE_BYTES
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.syncIdentityKeys(['6116570308623:99@lid'])
    assert.equal(result.length, 1)
    assert.equal(result[0].jid, '6116570308623:99@lid')
    assert.equal(result[0].identity.length, 32)
})

test('signal missing-prekeys api parses bundles and preserves per-user errors', async () => {
    const api = new SignalMissingPreKeysSyncApi({
        logger: createNoopLogger(),
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.LIST,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.USER,
                            attrs: { jid: '5511999999999@s.whatsapp.net' },
                            content: [
                                {
                                    tag: WA_NODE_TAGS.DEVICE,
                                    attrs: { id: '1' },
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.REGISTRATION,
                                            attrs: {},
                                            content: intToBytes(SIGNAL_REGISTRATION_ID_LENGTH, 123)
                                        },
                                        {
                                            tag: WA_NODE_TAGS.IDENTITY,
                                            attrs: {},
                                            content: makeBytes(SIGNAL_KEY_DATA_LENGTH, 1)
                                        },
                                        {
                                            tag: WA_NODE_TAGS.SKEY,
                                            attrs: {},
                                            content: [
                                                {
                                                    tag: WA_NODE_TAGS.ID,
                                                    attrs: {},
                                                    content: intToBytes(SIGNAL_KEY_ID_LENGTH, 7)
                                                },
                                                {
                                                    tag: WA_NODE_TAGS.VALUE,
                                                    attrs: {},
                                                    content: makeBytes(SIGNAL_KEY_DATA_LENGTH, 2)
                                                },
                                                {
                                                    tag: WA_NODE_TAGS.SIGNATURE,
                                                    attrs: {},
                                                    content: makeBytes(SIGNAL_SIGNATURE_LENGTH, 3)
                                                }
                                            ]
                                        },
                                        {
                                            tag: WA_NODE_TAGS.KEY,
                                            attrs: {},
                                            content: [
                                                {
                                                    tag: WA_NODE_TAGS.ID,
                                                    attrs: {},
                                                    content: intToBytes(SIGNAL_KEY_ID_LENGTH, 9)
                                                },
                                                {
                                                    tag: WA_NODE_TAGS.VALUE,
                                                    attrs: {},
                                                    content: makeBytes(SIGNAL_KEY_DATA_LENGTH, 4)
                                                }
                                            ]
                                        },
                                        {
                                            tag: WA_NODE_TAGS.DEVICE_IDENTITY,
                                            attrs: {},
                                            content: makeBytes(12, 5)
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            tag: WA_NODE_TAGS.USER,
                            attrs: { jid: '5511888888888@s.whatsapp.net' },
                            content: [
                                {
                                    tag: WA_NODE_TAGS.ERROR,
                                    attrs: { code: '406', text: 'bad key' }
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.fetchMissingPreKeys([
        {
            userJid: '5511999999999@s.whatsapp.net',
            devices: [{ deviceId: 1, registrationId: 123 }]
        },
        {
            userJid: '5511888888888@s.whatsapp.net',
            devices: [{ deviceId: 0, registrationId: 456 }]
        }
    ])

    assert.equal(result.length, 2)
    assert.ok('devices' in result[0])
    if ('devices' in result[0]) {
        assert.equal(result[0].devices.length, 1)
        assert.equal(result[0].devices[0].deviceJid, '5511999999999:1@s.whatsapp.net')
        assert.equal(result[0].devices[0].bundle.signedKey.id, 7)
        assert.equal(result[0].devices[0].bundle.oneTimeKey?.id, 9)
        assert.equal(result[0].devices[0].deviceIdentity?.length, 12)
    }

    assert.ok('errorText' in result[1])
    if ('errorText' in result[1]) {
        assert.equal(result[1].errorCode, 406)
        assert.equal(result[1].errorText, 'bad key')
    }
})

test('signal missing-prekeys api maps hosted.lid user response to requested lid user', async () => {
    const api = new SignalMissingPreKeysSyncApi({
        logger: createNoopLogger(),
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.LIST,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.USER,
                            attrs: { jid: '6116570308623@hosted.lid' },
                            content: [
                                {
                                    tag: WA_NODE_TAGS.DEVICE,
                                    attrs: { id: '99' },
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.REGISTRATION,
                                            attrs: {},
                                            content: intToBytes(SIGNAL_REGISTRATION_ID_LENGTH, 987)
                                        },
                                        {
                                            tag: WA_NODE_TAGS.IDENTITY,
                                            attrs: {},
                                            content: makeBytes(SIGNAL_KEY_DATA_LENGTH, 4)
                                        },
                                        {
                                            tag: WA_NODE_TAGS.SKEY,
                                            attrs: {},
                                            content: [
                                                {
                                                    tag: WA_NODE_TAGS.ID,
                                                    attrs: {},
                                                    content: intToBytes(SIGNAL_KEY_ID_LENGTH, 33)
                                                },
                                                {
                                                    tag: WA_NODE_TAGS.VALUE,
                                                    attrs: {},
                                                    content: makeBytes(SIGNAL_KEY_DATA_LENGTH, 5)
                                                },
                                                {
                                                    tag: WA_NODE_TAGS.SIGNATURE,
                                                    attrs: {},
                                                    content: makeBytes(SIGNAL_SIGNATURE_LENGTH, 6)
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.fetchMissingPreKeys([
        {
            userJid: '6116570308623@lid',
            devices: [{ deviceId: 99, registrationId: 987 }]
        }
    ])

    assert.equal(result.length, 1)
    assert.ok('devices' in result[0])
    if ('devices' in result[0]) {
        assert.equal(result[0].devices.length, 1)
        assert.equal(result[0].devices[0].deviceJid, '6116570308623:99@lid')
        assert.equal(result[0].devices[0].bundle.signedKey.id, 33)
    }
})

test('signal session sync api merges duplicate targets and returns user errors', async () => {
    let capturedRequest: unknown = null
    const api = new SignalSessionSyncApi({
        logger: createNoopLogger(),
        query: async (node) => {
            capturedRequest = node
            return iqResult([
                {
                    tag: WA_NODE_TAGS.LIST,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.USER,
                            attrs: { jid: '5511999999999:1@s.whatsapp.net' },
                            content: [
                                {
                                    tag: WA_NODE_TAGS.REGISTRATION,
                                    attrs: {},
                                    content: intToBytes(SIGNAL_REGISTRATION_ID_LENGTH, 777)
                                },
                                {
                                    tag: WA_NODE_TAGS.IDENTITY,
                                    attrs: {},
                                    content: makeBytes(SIGNAL_KEY_DATA_LENGTH, 1)
                                },
                                {
                                    tag: WA_NODE_TAGS.SKEY,
                                    attrs: {},
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.ID,
                                            attrs: {},
                                            content: intToBytes(SIGNAL_KEY_ID_LENGTH, 8)
                                        },
                                        {
                                            tag: WA_NODE_TAGS.VALUE,
                                            attrs: {},
                                            content: makeBytes(SIGNAL_KEY_DATA_LENGTH, 2)
                                        },
                                        {
                                            tag: WA_NODE_TAGS.SIGNATURE,
                                            attrs: {},
                                            content: makeBytes(SIGNAL_SIGNATURE_LENGTH, 3)
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            tag: WA_NODE_TAGS.USER,
                            attrs: { jid: '5511888888888@s.whatsapp.net' },
                            content: [
                                {
                                    tag: WA_NODE_TAGS.ERROR,
                                    attrs: { code: '404', text: 'not found' }
                                }
                            ]
                        }
                    ]
                }
            ])
        }
    })

    const result = await api.fetchKeyBundles([
        { jid: '5511999999999:1@s.whatsapp.net', reasonIdentity: false },
        { jid: '5511999999999:1@s.whatsapp.net', reasonIdentity: true },
        { jid: '5511888888888@s.whatsapp.net' }
    ])

    const request = capturedRequest as BinaryNode | null
    if (!request || !Array.isArray(request.content)) {
        throw new Error('expected captured key bundle request content')
    }
    const requestNodes = request.content as readonly BinaryNode[]
    const keyNode = requestNodes[0]
    assert.ok(Array.isArray(keyNode.content))
    const requestUsers = keyNode.content.map((entry) => entry.attrs)
    assert.deepEqual(requestUsers, [
        { jid: '5511999999999:1@s.whatsapp.net', reason: 'identity' },
        { jid: '5511888888888@s.whatsapp.net' }
    ])

    assert.equal(result.length, 2)
    assert.ok('bundle' in result[0])
    if ('bundle' in result[0]) {
        assert.equal(result[0].bundle.regId, 777)
        assert.equal(result[0].bundle.signedKey.id, 8)
    }
    assert.ok('errorText' in result[1])
    if ('errorText' in result[1]) {
        assert.equal(result[1].errorCode, '404')
        assert.equal(result[1].errorText, 'not found')
    }
})

test('signal session sync api maps hosted.lid response to lid request jid', async () => {
    const requestedJid = '6116570308623:99@lid'
    const responseJid = '6116570308623:99@hosted.lid'
    const api = new SignalSessionSyncApi({
        logger: createNoopLogger(),
        query: async () =>
            iqResult([
                {
                    tag: WA_NODE_TAGS.LIST,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.USER,
                            attrs: { jid: responseJid },
                            content: [
                                {
                                    tag: WA_NODE_TAGS.REGISTRATION,
                                    attrs: {},
                                    content: intToBytes(SIGNAL_REGISTRATION_ID_LENGTH, 777)
                                },
                                {
                                    tag: WA_NODE_TAGS.IDENTITY,
                                    attrs: {},
                                    content: makeBytes(SIGNAL_KEY_DATA_LENGTH, 1)
                                },
                                {
                                    tag: WA_NODE_TAGS.SKEY,
                                    attrs: {},
                                    content: [
                                        {
                                            tag: WA_NODE_TAGS.ID,
                                            attrs: {},
                                            content: intToBytes(SIGNAL_KEY_ID_LENGTH, 8)
                                        },
                                        {
                                            tag: WA_NODE_TAGS.VALUE,
                                            attrs: {},
                                            content: makeBytes(SIGNAL_KEY_DATA_LENGTH, 2)
                                        },
                                        {
                                            tag: WA_NODE_TAGS.SIGNATURE,
                                            attrs: {},
                                            content: makeBytes(SIGNAL_SIGNATURE_LENGTH, 3)
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ])
    })

    const result = await api.fetchKeyBundle({ jid: requestedJid })
    assert.equal(result.jid, responseJid)
    assert.equal(result.bundle.regId, 777)
    assert.equal(result.bundle.signedKey.id, 8)
})

test('signal rotate key api uploads signed prekeys and maps error codes', async () => {
    const store = new WaSignalMemoryStore()
    const registration = await generateRegistrationInfo()
    await store.setRegistrationInfo(registration)
    await store.setSignedPreKey(await generateSignedPreKey(4, registration.identityKeyPair.privKey))

    const successApi = new SignalRotateKeyApi({
        logger: createNoopLogger(),
        signalStore: store,
        query: async () => iqResult([])
    })

    const success = await successApi.rotateSignedPreKey()
    const persistedAfterSuccess = await store.getSignedPreKey()
    assert.equal(success.shouldDigestKey, false)
    assert.ok(persistedAfterSuccess)
    assert.equal(persistedAfterSuccess?.keyId, 5)

    const conflictApi = new SignalRotateKeyApi({
        logger: createNoopLogger(),
        signalStore: store,
        query: async () => ({
            tag: WA_NODE_TAGS.IQ,
            attrs: { type: WA_IQ_TYPES.ERROR },
            content: [
                {
                    tag: WA_NODE_TAGS.ERROR,
                    attrs: { code: '409', text: 'validation mismatch' }
                }
            ]
        })
    })
    const conflict = await conflictApi.rotateSignedPreKey()
    assert.equal(conflict.shouldDigestKey, true)
    assert.equal(conflict.errorCode, 409)

    const missingRegistrationApi = new SignalRotateKeyApi({
        logger: createNoopLogger(),
        signalStore: new WaSignalMemoryStore(),
        query: async () => iqResult([])
    })
    await assert.rejects(
        () => missingRegistrationApi.rotateSignedPreKey(),
        /requires registration info/
    )
})

const LID_SYNC_PHONE = '5511999999999@s.whatsapp.net'

function lidSyncUsync(users: readonly BinaryNode[], protocolErrors: readonly BinaryNode[] = []) {
    return iqResult([
        {
            tag: WA_NODE_TAGS.USYNC,
            attrs: {},
            content: [
                ...(protocolErrors.length > 0
                    ? [{ tag: 'result', attrs: {}, content: protocolErrors }]
                    : []),
                { tag: WA_NODE_TAGS.LIST, attrs: {}, content: users }
            ]
        }
    ])
}

function lidSyncApi(response: BinaryNode): SignalDeviceSyncApi {
    return new SignalDeviceSyncApi({ logger: createNoopLogger(), query: async () => response })
}

const LID_SYNC_STATUS_CASES: ReadonlyArray<{
    readonly name: string
    readonly users: readonly BinaryNode[]
    readonly expected: Omit<SignalLidSyncResult, 'queriedJid' | 'phoneJid'>
}> = [
    {
        name: 'in',
        users: [
            {
                tag: WA_NODE_TAGS.USER,
                attrs: { jid: LID_SYNC_PHONE },
                content: [
                    { tag: WA_NODE_TAGS.CONTACT, attrs: { type: 'in' } },
                    { tag: WA_NODE_TAGS.LID, attrs: { val: '123456789@lid' } }
                ]
            }
        ],
        expected: { lidJid: '123456789@lid', exists: true, invalid: false, status: 'in' }
    },
    {
        name: 'out',
        users: [
            {
                tag: WA_NODE_TAGS.USER,
                attrs: { jid: LID_SYNC_PHONE },
                content: [{ tag: WA_NODE_TAGS.CONTACT, attrs: { type: 'out' } }]
            }
        ],
        expected: { lidJid: null, exists: false, invalid: false, status: 'out' }
    },
    {
        name: 'invalid',
        users: [
            {
                tag: WA_NODE_TAGS.USER,
                attrs: { jid: 'undefined' },
                content: [
                    {
                        tag: WA_NODE_TAGS.CONTACT,
                        attrs: { type: 'invalid' },
                        content: '+5511999999999'
                    }
                ]
            }
        ],
        expected: { lidJid: null, exists: false, invalid: true, status: 'invalid' }
    },
    {
        name: 'error from the contact node',
        users: [
            {
                tag: WA_NODE_TAGS.USER,
                attrs: { jid: LID_SYNC_PHONE },
                content: [
                    {
                        tag: WA_NODE_TAGS.CONTACT,
                        attrs: {},
                        content: [
                            {
                                tag: WA_NODE_TAGS.ERROR,
                                attrs: { code: '500', text: 'lookup-failed' }
                            }
                        ]
                    }
                ]
            }
        ],
        expected: {
            lidJid: null,
            exists: false,
            invalid: false,
            status: 'error',
            error: { code: '500', text: 'lookup-failed' }
        }
    },
    {
        name: 'error from the lid node',
        users: [
            {
                tag: WA_NODE_TAGS.USER,
                attrs: { jid: LID_SYNC_PHONE },
                content: [
                    {
                        tag: WA_NODE_TAGS.LID,
                        attrs: {},
                        content: [
                            {
                                tag: WA_NODE_TAGS.ERROR,
                                attrs: { code: '404', text: 'not-found' }
                            }
                        ]
                    }
                ]
            }
        ],
        expected: {
            lidJid: null,
            exists: false,
            invalid: false,
            status: 'error',
            error: { code: '404', text: 'not-found' }
        }
    },
    {
        name: 'unanswered for a user node without contact or lid',
        users: [{ tag: WA_NODE_TAGS.USER, attrs: { jid: LID_SYNC_PHONE } }],
        expected: { lidJid: null, exists: false, invalid: false, status: 'unanswered' }
    },
    {
        name: 'unanswered for a number missing from the response',
        users: [],
        expected: { lidJid: null, exists: false, invalid: false, status: 'unanswered' }
    }
]

for (const { name, users, expected } of LID_SYNC_STATUS_CASES) {
    test(`signal lid sync reports status ${name}`, async () => {
        const result = await lidSyncApi(lidSyncUsync(users)).queryLidsByPhoneJids([LID_SYNC_PHONE])

        assert.deepEqual(result, [
            { queriedJid: LID_SYNC_PHONE, phoneJid: LID_SYNC_PHONE, ...expected }
        ])
    })
}

test('signal lid sync attaches the usync protocol error to unanswered and error entries only', async () => {
    const answered = '5511888888888@s.whatsapp.net'
    const withOwnError = '5511777777777@s.whatsapp.net'
    const response = lidSyncUsync(
        [
            {
                tag: WA_NODE_TAGS.USER,
                attrs: { jid: answered },
                content: [
                    { tag: WA_NODE_TAGS.CONTACT, attrs: { type: 'in' } },
                    { tag: WA_NODE_TAGS.LID, attrs: { val: '123456789@lid' } }
                ]
            },
            {
                tag: WA_NODE_TAGS.USER,
                attrs: { jid: withOwnError },
                content: [
                    {
                        tag: WA_NODE_TAGS.CONTACT,
                        attrs: {},
                        content: [{ tag: WA_NODE_TAGS.ERROR, attrs: { code: '500' } }]
                    }
                ]
            }
        ],
        [
            {
                tag: WA_NODE_TAGS.CONTACT,
                attrs: {},
                content: [
                    {
                        tag: WA_NODE_TAGS.ERROR,
                        attrs: { code: '429', text: 'rate-overlimit', backoff: '30' }
                    }
                ]
            }
        ]
    )

    const result = await lidSyncApi(response).queryLidsByPhoneJids([
        answered,
        withOwnError,
        LID_SYNC_PHONE
    ])

    assert.deepEqual(
        result.map((entry) => [entry.status, entry.exists, entry.error]),
        [
            ['in', true, undefined],
            ['error', false, { code: '500' }],
            ['unanswered', false, { code: '429', text: 'rate-overlimit', backoffSeconds: 30 }]
        ]
    )
})

test('signal lid sync falls back to the protocol error for an error entry without code or text', async () => {
    const response = lidSyncUsync(
        [
            {
                tag: WA_NODE_TAGS.USER,
                attrs: { jid: LID_SYNC_PHONE },
                content: [
                    {
                        tag: WA_NODE_TAGS.LID,
                        attrs: {},
                        content: [{ tag: WA_NODE_TAGS.ERROR, attrs: {} }]
                    }
                ]
            }
        ],
        [
            {
                tag: WA_NODE_TAGS.LID,
                attrs: {},
                content: [{ tag: WA_NODE_TAGS.ERROR, attrs: { code: '503', backoff: '5' } }]
            }
        ]
    )

    const [entry] = await lidSyncApi(response).queryLidsByPhoneJids([LID_SYNC_PHONE])

    assert.equal(entry.status, 'error')
    assert.deepEqual(entry.error, { code: '503', backoffSeconds: 5 })
})

const LID_SYNC_NO_JID_PHONE = '999999999999999@s.whatsapp.net'

function lidSyncNoJidUser(type: string | undefined, echo: string | undefined): BinaryNode {
    return {
        tag: WA_NODE_TAGS.USER,
        attrs: {},
        content: [
            {
                tag: WA_NODE_TAGS.CONTACT,
                attrs: type === undefined ? {} : { type },
                content: echo
            }
        ]
    }
}

function lidSyncNoJidInvalidUser(echo: string | undefined): BinaryNode {
    return lidSyncNoJidUser('invalid', echo)
}

test('signal lid sync flags a number as invalid when the user node carries no jid', async () => {
    const response: BinaryNode = {
        tag: WA_NODE_TAGS.IQ,
        attrs: { from: 's.whatsapp.net', type: WA_IQ_TYPES.RESULT, id: 'lid-sync-1' },
        content: [
            {
                tag: WA_NODE_TAGS.USYNC,
                attrs: {
                    sid: 'sid-1',
                    index: '0',
                    last: 'true',
                    mode: 'query',
                    context: 'interactive'
                },
                content: [
                    {
                        tag: 'result',
                        attrs: {},
                        content: [
                            { tag: WA_NODE_TAGS.LID, attrs: {} },
                            { tag: WA_NODE_TAGS.CONTACT, attrs: {} }
                        ]
                    },
                    {
                        tag: WA_NODE_TAGS.LIST,
                        attrs: {},
                        content: [lidSyncNoJidInvalidUser('+999999999999999')]
                    }
                ]
            }
        ]
    }

    const result = await lidSyncApi(response).queryLidsByPhoneJids([LID_SYNC_NO_JID_PHONE])

    assert.deepEqual(result, [
        {
            queriedJid: LID_SYNC_NO_JID_PHONE,
            phoneJid: LID_SYNC_NO_JID_PHONE,
            lidJid: null,
            exists: false,
            invalid: true,
            status: 'invalid'
        }
    ])
})

test('signal lid sync keeps each status in a batch mixing a resolved number and one without jid', async () => {
    const response = lidSyncUsync([
        {
            tag: WA_NODE_TAGS.USER,
            attrs: { jid: LID_SYNC_PHONE },
            content: [
                { tag: WA_NODE_TAGS.CONTACT, attrs: { type: 'in' } },
                { tag: WA_NODE_TAGS.LID, attrs: { val: '123456789@lid' } }
            ]
        },
        lidSyncNoJidInvalidUser('+999999999999999')
    ])

    const result = await lidSyncApi(response).queryLidsByPhoneJids([
        LID_SYNC_PHONE,
        LID_SYNC_NO_JID_PHONE
    ])

    assert.deepEqual(
        result.map((entry) => [entry.queriedJid, entry.status, entry.exists, entry.invalid]),
        [
            [LID_SYNC_PHONE, 'in', true, false],
            [LID_SYNC_NO_JID_PHONE, 'invalid', false, true]
        ]
    )
})

test('signal lid sync ignores a user node with no jid and no decodable contact echo', async () => {
    const debugs: string[] = []
    const api = new SignalDeviceSyncApi({
        logger: {
            ...createNoopLogger(),
            debug: (message) => {
                debugs.push(message)
            }
        },
        query: async () =>
            lidSyncUsync([
                lidSyncNoJidInvalidUser(undefined),
                lidSyncNoJidInvalidUser('+000000000000001')
            ])
    })

    const [entry] = await api.queryLidsByPhoneJids([LID_SYNC_NO_JID_PHONE])

    assert.equal(entry.status, 'unanswered')
    assert.equal(entry.invalid, false)
    assert.ok(debugs.includes('signal lid sync skipping user node with invalid jid'))
})

for (const { type, status, exists } of [
    { type: 'out', status: 'out', exists: false },
    { type: 'in', status: 'in', exists: true },
    { type: undefined, status: 'unanswered', exists: false }
] as const) {
    test(`signal lid sync decides by contact type ${type ?? 'missing'} when the user node carries no jid`, async () => {
        const response = lidSyncUsync([lidSyncNoJidUser(type, '+999999999999999')])

        const [entry] = await lidSyncApi(response).queryLidsByPhoneJids([LID_SYNC_NO_JID_PHONE])

        assert.equal(entry.queriedJid, LID_SYNC_NO_JID_PHONE)
        assert.equal(entry.status, status)
        assert.equal(entry.exists, exists)
        assert.equal(entry.invalid, false)
    })
}
