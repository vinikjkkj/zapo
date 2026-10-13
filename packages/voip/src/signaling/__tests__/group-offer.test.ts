import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import type { CallOfferParticipant, WaVoipDeps } from '../../types.js'
import { buildGroupOfferStanza } from '../signaling.js'

/**
 * The expected group offer, written out by hand rather than generated
 * by the builder under test. The stanza id is not compared, and the capability blob is
 * compared as some bytes.
 */
const CALL_ID = '0053771AFB183B33AA05E5CBC13DD3F2'
const GROUP_JID = '120363431977320048@g.us'
const CREATOR_DEVICE_JID = '50062877036657:76@lid'

/** Stands in for byte content not compared. */
const BYTES = '<bytes>'

interface Comparable {
    readonly tag: string
    readonly attrs: Record<string, string>
    readonly children: readonly Comparable[] | string | null
}

/** The stanza reduced to tags, attributes and nesting. */
function toComparable(node: BinaryNode): Comparable {
    const content = node.content

    let children: readonly Comparable[] | string | null = null
    if (Array.isArray(content)) {
        children = content.map(toComparable)
    } else if (content instanceof Uint8Array) {
        children = BYTES
    } else if (typeof content === 'string') {
        children = content
    }

    return { tag: node.tag, attrs: { ...node.attrs }, children }
}

const EXPECTED_OFFER: Comparable = {
    tag: 'offer',
    attrs: {
        'call-id': CALL_ID,
        'call-creator': '50062877036657:76@lid',
        'group-jid': '120363431977320048@g.us'
    },
    children: [
        { tag: 'audio', attrs: { enc: 'opus', rate: '8000' }, children: null },
        { tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, children: null },
        { tag: 'net', attrs: { medium: '3' }, children: null },
        {
            tag: 'group_info',
            attrs: {},
            children: [
                {
                    tag: 'user',
                    attrs: { jid: '50062877036657@lid' },
                    children: [
                        {
                            tag: 'device',
                            attrs: { jid: '50062877036657:76@lid' },
                            children: [{ tag: 'capability', attrs: { ver: '1' }, children: BYTES }]
                        }
                    ]
                },
                {
                    tag: 'user',
                    attrs: { jid: '112984198234339@lid' },
                    children: [
                        { tag: 'device', attrs: { jid: '112984198234339@lid' }, children: null }
                    ]
                },
                {
                    tag: 'user',
                    attrs: { jid: '184478207058035@lid' },
                    children: [
                        { tag: 'device', attrs: { jid: '184478207058035@lid' }, children: null },
                        { tag: 'device', attrs: { jid: '184478207058035:1@lid' }, children: null }
                    ]
                }
            ]
        }
    ]
}

/** The two callees, each carrying the devices it is listed with. */
const PARTICIPANTS: readonly CallOfferParticipant[] = [
    { jid: '112984198234339@lid', devices: ['112984198234339@lid'] },
    { jid: '184478207058035@lid', devices: ['184478207058035@lid', '184478207058035:1@lid'] }
]

function createDeps(
    syncDeviceList: (
        jids: readonly string[]
    ) => Promise<
        readonly { readonly jid: string; readonly deviceJids: readonly string[] }[]
    > = async () => []
): WaVoipDeps {
    return {
        authClient: {
            getCurrentCredentials: () => ({
                meJid: '50062877036657@s.whatsapp.net',
                meLid: CREATOR_DEVICE_JID,
                signedIdentity: { details: new Uint8Array([1, 2, 3]) }
            })
        },
        signalDeviceSync: { syncDeviceList }
    } as unknown as WaVoipDeps
}

function offerNode(node: BinaryNode): BinaryNode {
    const children = node.content as BinaryNode[]
    assert.equal(children.length, 1)
    return children[0]
}

function deviceJids(offer: BinaryNode, userJid: string): string[] {
    const groupInfo = (offer.content as BinaryNode[]).find((child) => child.tag === 'group_info')
    const user = (groupInfo?.content as BinaryNode[]).find((child) => child.attrs.jid === userJid)
    return ((user?.content as BinaryNode[]) ?? []).map((device) => device.attrs.jid)
}

test('a group offer matches the expected stanza, field by field', async () => {
    const { node } = await buildGroupOfferStanza(
        createDeps(),
        CALL_ID,
        GROUP_JID,
        PARTICIPANTS,
        false
    )

    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, `${CALL_ID}@call`)
    assert.match(node.attrs.id, /^[0-9A-F]{32}$/)
    assert.deepEqual(toComparable(offerNode(node)), EXPECTED_OFFER)
})

test('a group offer carries none of the plumbing a 1:1 offer needs for the call key', async () => {
    const { node } = await buildGroupOfferStanza(
        createDeps(),
        CALL_ID,
        GROUP_JID,
        PARTICIPANTS,
        false
    )

    const offer = offerNode(node)
    const tags = (offer.content as BinaryNode[]).map((child) => child.tag)
    for (const absent of ['destination', 'encopt', 'device-identity', 'privacy', 'capability']) {
        assert.equal(tags.includes(absent), false, `${absent} is not on a group offer`)
    }
    // The server writes `joinable` onto the copy it delivers; the sender does not.
    assert.equal(offer.attrs.joinable, undefined)
})

test('only the creator device carries a capability, and the creator leads the list', async () => {
    const { node } = await buildGroupOfferStanza(
        createDeps(),
        CALL_ID,
        GROUP_JID,
        PARTICIPANTS,
        false
    )

    const groupInfo = (offerNode(node).content as BinaryNode[]).find(
        (child) => child.tag === 'group_info'
    )
    const users = groupInfo?.content as BinaryNode[]
    assert.equal(users[0].attrs.jid, '50062877036657@lid')

    const withCapability = users.filter((user) =>
        ((user.content as BinaryNode[]) ?? []).some((device) =>
            Array.isArray(device.content)
                ? device.content.some((child) => child.tag === 'capability')
                : false
        )
    )
    assert.equal(withCapability.length, 1)
    assert.equal(withCapability[0], users[0])
})

test('a video group offer puts the video node where a 1:1 offer puts it', async () => {
    const { node } = await buildGroupOfferStanza(
        createDeps(),
        CALL_ID,
        GROUP_JID,
        PARTICIPANTS,
        true
    )

    const tags = (offerNode(node).content as BinaryNode[]).map((child) => child.tag)
    assert.deepEqual(tags, ['audio', 'audio', 'video', 'net', 'group_info'])
})

test('the primary device leads a participant whatever order its devices arrived in', async () => {
    const { node } = await buildGroupOfferStanza(
        createDeps(),
        CALL_ID,
        GROUP_JID,
        [{ jid: '184478207058035@lid', devices: ['184478207058035:1@lid', '184478207058035@lid'] }],
        false
    )

    assert.deepEqual(deviceJids(offerNode(node), '184478207058035@lid'), [
        '184478207058035@lid',
        '184478207058035:1@lid'
    ])
})

test('a participant that brings no devices has them resolved', async () => {
    const deps = createDeps(async (jids) => {
        assert.deepEqual([...jids], ['112984198234339@lid'])
        return [
            {
                jid: '112984198234339@lid',
                deviceJids: ['112984198234339:0@lid', '112984198234339:3@lid']
            }
        ]
    })

    const { node } = await buildGroupOfferStanza(
        deps,
        CALL_ID,
        GROUP_JID,
        [{ jid: '112984198234339@lid' }],
        false
    )

    assert.deepEqual(deviceJids(offerNode(node), '112984198234339@lid'), [
        '112984198234339@lid',
        '112984198234339:3@lid'
    ])
})

test('a participant whose devices cannot be resolved is still rung on its primary', async () => {
    const deps = createDeps(async () => {
        throw new Error('usync is down')
    })

    const { node } = await buildGroupOfferStanza(
        deps,
        CALL_ID,
        GROUP_JID,
        [{ jid: '112984198234339@lid' }],
        false
    )

    assert.deepEqual(deviceJids(offerNode(node), '112984198234339@lid'), ['112984198234339@lid'])
})

test('the participants reported back address every device by its own segment', async () => {
    const { participants } = await buildGroupOfferStanza(
        createDeps(),
        CALL_ID,
        GROUP_JID,
        PARTICIPANTS,
        false
    )

    assert.deepEqual(
        participants.map((participant) => ({ ...participant })),
        [
            { jid: '50062877036657@lid', devices: ['50062877036657:76@lid'] },
            { jid: '112984198234339@lid', devices: ['112984198234339:0@lid'] },
            {
                jid: '184478207058035@lid',
                devices: ['184478207058035:0@lid', '184478207058035:1@lid']
            }
        ]
    )
})

test('a caller that lists us among the participants does not get listed twice', async () => {
    const { node, participants } = await buildGroupOfferStanza(
        createDeps(),
        CALL_ID,
        GROUP_JID,
        [{ jid: '50062877036657@lid', devices: ['50062877036657:12@lid'] }, ...PARTICIPANTS],
        false
    )

    const groupInfo = (offerNode(node).content as BinaryNode[]).find(
        (child) => child.tag === 'group_info'
    )
    const listed = (groupInfo?.content as BinaryNode[]).map((user) => user.attrs.jid)
    assert.deepEqual(listed, ['50062877036657@lid', '112984198234339@lid', '184478207058035@lid'])
    // Ours is the device placing the call, not the one the caller happened to name.
    assert.deepEqual(participants[0].devices, ['50062877036657:76@lid'])
})

test('a group offer with nobody left to ring is refused', async () => {
    await assert.rejects(
        () =>
            buildGroupOfferStanza(
                createDeps(),
                CALL_ID,
                GROUP_JID,
                [{ jid: '50062877036657@lid' }],
                false
            ),
        /no participant to ring/
    )
})

test('a group offer needs a jid of ours to name as its call-creator', async () => {
    const deps = {
        authClient: { getCurrentCredentials: () => undefined },
        signalDeviceSync: { syncDeviceList: async () => [] }
    } as unknown as WaVoipDeps

    await assert.rejects(
        () => buildGroupOfferStanza(deps, CALL_ID, GROUP_JID, PARTICIPANTS, false),
        /call-creator/
    )
})
