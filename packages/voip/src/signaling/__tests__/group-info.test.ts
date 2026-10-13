import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import {
    type GroupInfoParticipant,
    normalizeParticipantDeviceJids,
    parseGroupInfoNode,
    toGroupCallParticipants,
    toMediaIdentityJid,
    toParticipantMediaIdentityJids,
    WA_CALL_MAX_DEVICES_PER_USER
} from '../group-info.js'

const USER = '50062877036657@lid'

function node(tag: string, attrs: Record<string, string>, content?: BinaryNode[]): BinaryNode {
    return { tag, attrs, content }
}

function device(jid: string, attrs: Record<string, string> = {}): BinaryNode {
    return node('device', { jid, ...attrs })
}

/** A `<group_info>` carrying the two required attributes and the given children. */
function groupInfo(children: BinaryNode[], attrs: Record<string, string> = {}): BinaryNode {
    return node('group_info', { media: 'audio', connected_limit: '8', ...attrs }, children)
}

test('parseGroupInfoNode reads a user node and its devices', () => {
    const info = parseGroupInfoNode(
        groupInfo(
            [
                node(
                    'user',
                    {
                        jid: USER,
                        user_pn: '5511999999999@s.whatsapp.net',
                        username: 'someone',
                        push_name: 'Someone',
                        guest_name: 'Guest',
                        country_code: 'BR',
                        account_kind: 'guest',
                        phash: '2:abcdef',
                        state: 'connected',
                        tos_not_accepted: '1'
                    },
                    [
                        device('50062877036657:0@lid', {
                            pid: '0',
                            dec: 'H264',
                            enc: 'H264',
                            vid_dec: 'vp8/h.264,VP9',
                            platform: 'android',
                            capability: 'AQX3CQ==',
                            ver: '1',
                            bit_mask_length: '5'
                        })
                    ]
                )
            ],
            { 'link-token': 'TOKEN', phash: '2:abcdef', group_phash: '3:ghijkl' }
        )
    )

    assert.deepEqual(info, {
        media: 'audio',
        connectedLimit: 8,
        rekey: false,
        transactionId: null,
        linkToken: 'TOKEN',
        phash: '2:abcdef',
        groupPhash: '3:ghijkl',
        lightweightKey: null,
        extensionId: null,
        participantTag: 'user',
        participants: [
            {
                jid: USER,
                nacked: false,
                reason: null,
                state: 'connected',
                phash: '2:abcdef',
                userPn: '5511999999999@s.whatsapp.net',
                username: 'someone',
                pushName: 'Someone',
                guestName: 'Guest',
                countryCode: 'BR',
                accountKind: 'guest',
                tosNotAccepted: true,
                media: null,
                rekey: false,
                transactionId: null,
                linkToken: null,
                decExtensionId: null,
                hnVideo: null,
                devices: [
                    {
                        jid: '50062877036657:0@lid',
                        deviceId: 0,
                        pid: 0,
                        dec: 'H264',
                        enc: 'H264',
                        vidDec: 'vp8/h.264,VP9',
                        platform: 'android',
                        capability: 'AQX3CQ==',
                        capabilityVersion: 1,
                        capabilityBitMaskLength: 5
                    }
                ]
            }
        ]
    })
})

test('parseGroupInfoNode reads the participant spelling and its own attributes', () => {
    const info = parseGroupInfoNode(
        groupInfo([
            node(
                'participant',
                {
                    jid: USER,
                    media: 'video',
                    phash: '2:abcdef',
                    state: 'invited',
                    rekey: '1',
                    'transaction-id': '17',
                    'link-token': 'TOKEN',
                    decextension_id: 'EXT',
                    hn_video: '1'
                },
                [device('50062877036657:11@lid')]
            )
        ])
    )

    assert.equal(info.participantTag, 'participant')
    const participant = info.participants[0]
    assert.equal(participant.media, 'video')
    assert.equal(participant.rekey, true)
    assert.equal(participant.transactionId, 17)
    assert.equal(participant.linkToken, 'TOKEN')
    assert.equal(participant.decExtensionId, 'EXT')
    assert.equal(participant.hnVideo, '1')
    assert.deepEqual(
        participant.devices.map((entry) => entry.jid),
        ['50062877036657:11@lid']
    )
})

test('parseGroupInfoNode requires media and a valid connected_limit', () => {
    assert.throws(
        () => parseGroupInfoNode(node('group_info', { connected_limit: '8' }, [])),
        /no media/
    )
    assert.throws(() => parseGroupInfoNode(node('group_info', { media: 'audio' }, [])), /connected/)
    assert.throws(
        () => parseGroupInfoNode(node('group_info', { media: 'audio', connected_limit: 'x' }, [])),
        /connected/
    )

    // Either spelling of the attribute is read.
    const info = parseGroupInfoNode(node('group_info', { media: 'audio', 'connected-limit': '32' }))
    assert.equal(info.connectedLimit, 32)
    assert.equal(info.participantTag, null)
    assert.deepEqual(info.participants, [])
})

test('parseGroupInfoNode refuses both group hashes at once', () => {
    assert.throws(
        () => parseGroupInfoNode(groupInfo([], { group_phash: '3:aaa', lightweight_key: 'KEY' })),
        /group_phash and lightweight_key/
    )
})

test('parseGroupInfoNode refuses user and participant children together', () => {
    assert.throws(
        () =>
            parseGroupInfoNode(
                groupInfo([
                    node('user', { jid: USER }, [device('50062877036657:0@lid')]),
                    node('participant', { jid: USER }, [device('50062877036657:0@lid')])
                ])
            ),
        /both <user> and <participant>/
    )
})

test('parseGroupInfoNode requires a jid on the participant and on every device', () => {
    assert.throws(() => parseGroupInfoNode(groupInfo([node('user', {}, [])])), /carries no jid/)
    assert.throws(
        () => parseGroupInfoNode(groupInfo([node('user', { jid: USER }, [node('device', {})])])),
        /device of .* carries no jid/
    )
})

test('parseGroupInfoNode holds a user to its device count', () => {
    assert.throws(
        () => parseGroupInfoNode(groupInfo([node('user', { jid: USER }, [])])),
        /not nacked and carries no device/
    )

    assert.throws(
        () =>
            parseGroupInfoNode(
                groupInfo([
                    node('user', { jid: USER, reason: 'nack' }, [device('50062877036657:0@lid')])
                ])
            ),
        /nacked and still carries a device/
    )

    // Mobile reports the same thing under `error`.
    assert.throws(
        () =>
            parseGroupInfoNode(
                groupInfo([
                    node('user', { jid: USER, error: '403' }, [device('50062877036657:0@lid')])
                ])
            ),
        /nacked and still carries a device/
    )

    const nacked = parseGroupInfoNode(groupInfo([node('user', { jid: USER, reason: 'nack' }, [])]))
        .participants[0]
    assert.equal(nacked.nacked, true)
    assert.equal(nacked.reason, 'nack')
    assert.deepEqual(nacked.devices, [])
})

test('parseGroupInfoNode takes five devices and refuses six', () => {
    const five = [0, 1, 2, 3, 4].map((id) => device(`50062877036657:${id}@lid`))
    const parsed = parseGroupInfoNode(groupInfo([node('user', { jid: USER }, five)]))
    assert.equal(parsed.participants[0].devices.length, 5)
    assert.equal(WA_CALL_MAX_DEVICES_PER_USER, 5)

    assert.throws(
        () =>
            parseGroupInfoNode(
                groupInfo([node('user', { jid: USER }, [...five, device('50062877036657:5@lid')])])
            ),
        /carries 6 devices, over the limit of 5/
    )
})

test('parseGroupInfoNode reads the pid off each device of a group update', () => {
    const parsed = parseGroupInfoNode(
        groupInfo([
            node('user', { jid: USER }, [device('50062877036657:0@lid', { pid: '0' })]),
            node('user', { jid: '1002@lid' }, [device('1002:0@lid', { pid: '1' })])
        ])
    )

    assert.deepEqual(
        parsed.participants.map((entry) => entry.devices.map((child) => child.pid)),
        [[0], [1]]
    )
})

test('parseGroupInfoNode takes a device with no pid, which is how an offer arrives', () => {
    const parsed = parseGroupInfoNode(
        groupInfo([node('user', { jid: USER }, [device('50062877036657:0@lid')])])
    )

    assert.equal(parsed.participants[0].devices[0]?.pid, null)
})

test('parseGroupInfoNode resolves a bare device jid to the primary device', () => {
    const parsed = parseGroupInfoNode(
        groupInfo([node('user', { jid: USER }, [device('50062877036657@lid')])])
    )

    assert.deepEqual(
        parsed.participants[0].devices.map((entry) => [entry.jid, entry.deviceId]),
        [['50062877036657:0@lid', 0]]
    )
})

test('parseGroupInfoNode moves the primary device to the front, keeping the rest in order', () => {
    const parsed = parseGroupInfoNode(
        groupInfo([
            node('user', { jid: USER }, [
                device('50062877036657:37@lid'),
                device('50062877036657:12@lid'),
                device('50062877036657@lid'),
                device('50062877036657:4@lid')
            ])
        ])
    )

    assert.deepEqual(
        parsed.participants[0].devices.map((entry) => entry.jid),
        [
            '50062877036657:0@lid',
            '50062877036657:37@lid',
            '50062877036657:12@lid',
            '50062877036657:4@lid'
        ]
    )
})

test('parseGroupInfoNode leaves a participant node free of the device count rules', () => {
    const parsed = parseGroupInfoNode(groupInfo([node('participant', { jid: USER }, [])]))
    assert.deepEqual(parsed.participants[0].devices, [])
    assert.equal(parsed.participants[0].nacked, false)
})

test('normalizeParticipantDeviceJids addresses every device it keeps', () => {
    assert.deepEqual(
        normalizeParticipantDeviceJids(USER, [
            '50062877036657:3@lid',
            '50062877036657@lid',
            '50062877036657:76@lid'
        ]),
        ['50062877036657:0@lid', '50062877036657:3@lid', '50062877036657:76@lid']
    )

    assert.deepEqual(
        normalizeParticipantDeviceJids(
            USER,
            [0, 1, 2, 3, 4].map((id) => `50062877036657:${id}@lid`)
        ),
        [
            '50062877036657:0@lid',
            '50062877036657:1@lid',
            '50062877036657:2@lid',
            '50062877036657:3@lid',
            '50062877036657:4@lid'
        ]
    )
})

test('normalizeParticipantDeviceJids falls back to the primary outside one to five devices', () => {
    // Zero devices: the only thing a bare user jid can address is its phone.
    assert.deepEqual(normalizeParticipantDeviceJids(USER, []), ['50062877036657:0@lid'])

    // Six is as out of range as zero, and takes the same fallback - not a trim to five.
    const six = [0, 1, 2, 3, 4, 5].map((id) => `50062877036657:${id}@lid`)
    assert.deepEqual(normalizeParticipantDeviceJids(USER, six), ['50062877036657:0@lid'])

    // Five is the last count that survives whole; the boundary is not off by one.
    assert.equal(normalizeParticipantDeviceJids(USER, six.slice(0, 5)).length, 5)

    // The fallback is built from the user jid, so it stays on the user's own server.
    assert.deepEqual(normalizeParticipantDeviceJids('5511999999999@s.whatsapp.net', []), [
        '5511999999999:0@s.whatsapp.net'
    ])
})

test('normalizeParticipantDeviceJids refuses a jid set that mixes LID and phone number', () => {
    assert.throws(
        () =>
            normalizeParticipantDeviceJids(USER, [
                '50062877036657:0@lid',
                '5511999999999:1@s.whatsapp.net'
            ]),
        /mixes LID and non-LID/
    )

    assert.throws(
        () =>
            normalizeParticipantDeviceJids('5511999999999@s.whatsapp.net', [
                '50062877036657:0@lid'
            ]),
        /mixes LID and non-LID/
    )

    // An all-phone-number set is not mixed, so it passes.
    assert.deepEqual(
        normalizeParticipantDeviceJids('5511999999999@s.whatsapp.net', [
            '5511999999999:2@s.whatsapp.net'
        ]),
        ['5511999999999:2@s.whatsapp.net']
    )
})

test('toMediaIdentityJid keeps the device, including the zero of the primary', () => {
    assert.equal(toMediaIdentityJid('50062877036657:0@lid'), '50062877036657:0@lid')
    assert.equal(toMediaIdentityJid('50062877036657@lid'), '50062877036657:0@lid')
    assert.equal(toMediaIdentityJid('50062877036657:76@lid'), '50062877036657:76@lid')
})

test('toMediaIdentityJid collapses the hosted LID onto the plain one', () => {
    assert.equal(toMediaIdentityJid('50062877036657:99@hosted.lid'), '50062877036657:99@lid')
})

test('toMediaIdentityJid refuses anything that is not a LID', () => {
    assert.throws(() => toMediaIdentityJid('5511999999999:0@s.whatsapp.net'), /needs a LID jid/)
    assert.throws(() => toMediaIdentityJid('5511999999999:99@hosted'), /needs a LID jid/)
})

test('toParticipantMediaIdentityJids reads the devices and never the user_pn', () => {
    const participant = parseGroupInfoNode(
        groupInfo([
            node('user', { jid: USER, user_pn: '5511999999999@s.whatsapp.net' }, [
                device('50062877036657:8@lid'),
                device('50062877036657@lid')
            ])
        ])
    ).participants[0]

    assert.deepEqual(toParticipantMediaIdentityJids(participant), [
        '50062877036657:0@lid',
        '50062877036657:8@lid'
    ])
})

test('toParticipantMediaIdentityJids refuses a participant whose devices are phone numbers', () => {
    const participant: GroupInfoParticipant = parseGroupInfoNode(
        groupInfo([
            node('user', { jid: '5511999999999@s.whatsapp.net' }, [
                device('5511999999999:0@s.whatsapp.net')
            ])
        ])
    ).participants[0]

    assert.throws(() => toParticipantMediaIdentityJids(participant), /needs a LID jid/)
})

test('the rekey the server asks for sits on the group info, not on a participant', () => {
    const info = parseGroupInfoNode(
        groupInfo(
            [node('user', { jid: USER, state: 'connected' }, [device('50062877036657:1@lid')])],
            { rekey: '1' }
        )
    )

    assert.equal(info.rekey, true)
    assert.equal(
        info.participants.every((participant) => !participant.rekey),
        true
    )
})

test('the transaction id sits on the group info, not on the update that wraps it', () => {
    const info = parseGroupInfoNode(
        groupInfo(
            [node('user', { jid: USER, state: 'connected' }, [device('50062877036657:1@lid')])],
            {
                'transaction-id': '13',
                rekey: '1'
            }
        )
    )

    assert.equal(info.transactionId, 13)
    assert.equal(info.rekey, true, 'the two travel together on the same node')
})

test('the participants keep the pid of each device that carried one, 0 included', () => {
    const participants = toGroupCallParticipants(
        parseGroupInfoNode(
            groupInfo([
                node('user', { jid: USER }, [
                    device('50062877036657:0@lid', { pid: '0' }),
                    device('50062877036657:3@lid')
                ]),
                node('user', { jid: '1002@lid' }, [device('1002:0@lid')])
            ])
        )
    )

    assert.deepEqual(participants[0].devicePids, { '50062877036657:0@lid': 0 })
    assert.equal('devicePids' in participants[1], false)
})

test('normalizeParticipantDeviceJids refuses a device of another account of the same kind', () => {
    assert.throws(
        () => normalizeParticipantDeviceJids(USER, ['50062877036657:1@lid', '999999:2@lid']),
        /999999:2@lid is not a device of participant/
    )
    // The hosted spelling of the same account is the same account.
    assert.deepEqual(normalizeParticipantDeviceJids(USER, ['50062877036657:4@hosted.lid']), [
        '50062877036657:4@hosted.lid'
    ])
})
