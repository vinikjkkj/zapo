import assert from 'node:assert/strict'
import test from 'node:test'

import { sha1 } from '@crypto'
import type { Logger } from '@infra/log/types'
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
import { SignalDeviceSyncApi } from '@signal/api/SignalDeviceSyncApi'
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
import { WaDeviceListMemoryStore } from '@store/providers/memory/device-list.store'
import { WaSignalMemoryStore } from '@store/providers/memory/signal.store'
import type { BinaryNode } from '@transport/types'
import { concatBytes, intToBytes } from '@util/bytes'

function createLogger(): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
    }
}

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
    const registration = await generateRegistrationInfo()
    const signedPreKey = await generateSignedPreKey(3, registration.identityKeyPair.privKey)
    const preKeys = [await generatePreKeyPair(10), await generatePreKeyPair(11)]

    await signalStore.setRegistrationInfo(registration)
    await signalStore.setSignedPreKey(signedPreKey)
    await Promise.all(preKeys.map((record) => signalStore.putPreKey(record)))

    const digestHash = (
        await sha1(
            concatBytes([
                registration.identityKeyPair.pubKey,
                signedPreKey.keyPair.pubKey,
                signedPreKey.signature,
                ...preKeys.map((record) => record.keyPair.pubKey)
            ])
        )
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
        logger: createLogger(),
        signalStore,
        query: async () => iqResult([digestNode])
    })
    const valid = await digestApi.validateLocalKeyBundle()
    assert.equal(valid.valid, true)
    assert.equal(valid.reason, 'ok')
    assert.equal(valid.preKeyCount, 2)

    const mismatchApi = new SignalDigestSyncApi({
        logger: createLogger(),
        signalStore,
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

test('signal device sync api parses users/devices and reuses cache when still fresh', async () => {
    const deviceListStore = new WaDeviceListMemoryStore(60_000)
    let queryCalls = 0

    try {
        const api = new SignalDeviceSyncApi({
            logger: createLogger(),
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

test('signal device sync api preserves requested users omitted by usync response', async () => {
    const api = new SignalDeviceSyncApi({
        logger: createLogger(),
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
        logger: createLogger(),
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
            phoneJid: '5511999999999@s.whatsapp.net',
            lidJid: '123456789@lid',
            exists: true
        },
        {
            phoneJid: '5511888888888@s.whatsapp.net',
            lidJid: null,
            exists: false
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
        logger: createLogger(),
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
            phoneJid: '5511888888888@s.whatsapp.net',
            lidJid: null,
            exists: false
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
            ...createLogger(),
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
            phoneJid: '5511999999999@s.whatsapp.net',
            lidJid: null,
            exists: true
        }
    ])
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0].message, 'signal lid sync user error')
})

test('signal device sync api forces exists=false when contact node has error', async () => {
    const warnings: {
        readonly message: string
        readonly context: Readonly<Record<string, unknown>>
    }[] = []
    const api = new SignalDeviceSyncApi({
        logger: {
            ...createLogger(),
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
            phoneJid: '5511999999999@s.whatsapp.net',
            lidJid: '123456789@lid',
            exists: false
        }
    ])
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0].message, 'signal lid sync contact error')
})

test('signal device sync api maps user response by pn_jid when jid differs', async () => {
    const api = new SignalDeviceSyncApi({
        logger: createLogger(),
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
            phoneJid: '5511999999999@s.whatsapp.net',
            lidJid: '123456789@lid',
            exists: true
        }
    ])
})

test('signal identity sync api parses result list and stores remote identities', async () => {
    const signalStore = new WaSignalMemoryStore()
    const api = new SignalIdentitySyncApi({
        logger: createLogger(),
        signalStore,
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

    const persisted = await signalStore.getRemoteIdentity(
        parseSignalAddressFromJid('5511999999999:1@s.whatsapp.net')
    )
    assert.ok(persisted)
    assert.equal(persisted.length, 33)
})

test('signal missing-prekeys api parses bundles and preserves per-user errors', async () => {
    const api = new SignalMissingPreKeysSyncApi({
        logger: createLogger(),
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

test('signal session sync api merges duplicate targets and returns user errors', async () => {
    let capturedRequest: unknown = null
    const api = new SignalSessionSyncApi({
        logger: createLogger(),
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

test('signal rotate key api uploads signed prekeys and maps error codes', async () => {
    const store = new WaSignalMemoryStore()
    const registration = await generateRegistrationInfo()
    await store.setRegistrationInfo(registration)
    await store.setSignedPreKey(await generateSignedPreKey(4, registration.identityKeyPair.privKey))

    const successApi = new SignalRotateKeyApi({
        logger: createLogger(),
        signalStore: store,
        query: async () => iqResult([])
    })

    const success = await successApi.rotateSignedPreKey()
    const persistedAfterSuccess = await store.getSignedPreKey()
    assert.equal(success.shouldDigestKey, false)
    assert.ok(persistedAfterSuccess)
    assert.equal(persistedAfterSuccess?.keyId, 5)

    const conflictApi = new SignalRotateKeyApi({
        logger: createLogger(),
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
        logger: createLogger(),
        signalStore: new WaSignalMemoryStore(),
        query: async () => iqResult([])
    })
    await assert.rejects(
        () => missingRegistrationApi.rotateSignedPreKey(),
        /requires registration info/
    )
})
