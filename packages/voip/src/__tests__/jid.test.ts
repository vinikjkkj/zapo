import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import { toAddressedJid } from '../call/call-jids.js'
import { groupSenderDeviceJids } from '../call/group-media-plan.js'
import {
    addressDeviceJid,
    groupParticipantAccountKey,
    isSameDeviceJid,
    toDeviceJid
} from '../jid.js'
import { resolvePeerDeviceJids } from '../peer-devices.js'
import { normalizeParticipantDeviceJids, parseGroupInfoNode } from '../signaling/group-info.js'
import type { WaVoipDeps } from '../types.js'

/**
 * `[input, device form, addressed form, account key, parsed device form]`, pinned from the four
 * normalisers this module replaced; `null` is a throw.
 */
const TABLE: ReadonlyArray<readonly [string, string, string, string | null, string | null]> = [
    ['123@lid', '123:0@lid', '123@lid', '123@lid', '123:0@lid'],
    ['123:5@lid', '123:5@lid', '123:5@lid', '123@lid', '123:5@lid'],
    ['123:0@lid', '123:0@lid', '123@lid', '123@lid', '123:0@lid'],
    ['123:02@lid', '123:02@lid', '123:2@lid', '123@lid', '123:2@lid'],
    ['123@hosted.lid', '123:0@hosted.lid', '123@hosted.lid', '123@lid', '123:0@hosted.lid'],
    ['123:4@hosted.lid', '123:4@hosted.lid', '123:4@hosted.lid', '123@lid', '123:4@hosted.lid'],
    [
        '5511@s.whatsapp.net',
        '5511:0@s.whatsapp.net',
        '5511@s.whatsapp.net',
        '5511@s.whatsapp.net',
        '5511:0@s.whatsapp.net'
    ],
    [
        '5511:7@s.whatsapp.net',
        '5511:7@s.whatsapp.net',
        '5511:7@s.whatsapp.net',
        '5511@s.whatsapp.net',
        '5511:7@s.whatsapp.net'
    ],
    [
        '5511:0@s.whatsapp.net',
        '5511:0@s.whatsapp.net',
        '5511@s.whatsapp.net',
        '5511@s.whatsapp.net',
        '5511:0@s.whatsapp.net'
    ],
    ['5511@hosted', '5511:0@hosted', '5511@hosted', '5511@s.whatsapp.net', '5511:0@hosted'],
    ['5511:3@hosted', '5511:3@hosted', '5511:3@hosted', '5511@s.whatsapp.net', '5511:3@hosted'],
    ['5511@c.us', '5511:0@c.us', '5511@c.us', '5511@c.us', '5511:0@c.us'],
    ['5511:3@c.us', '5511:3@c.us', '5511:3@c.us', '5511@c.us', '5511:3@c.us'],
    [
        '5511_1@s.whatsapp.net',
        '5511_1:0@s.whatsapp.net',
        '5511_1@s.whatsapp.net',
        '5511_1@s.whatsapp.net',
        '5511_1:0@s.whatsapp.net'
    ],
    [
        '5511_1:2@s.whatsapp.net',
        '5511_1:2@s.whatsapp.net',
        '5511_1:2@s.whatsapp.net',
        '5511_1@s.whatsapp.net',
        '5511_1:2@s.whatsapp.net'
    ],
    [
        '5511.1:2@s.whatsapp.net',
        '5511.1:2@s.whatsapp.net',
        '5511.1:2@s.whatsapp.net',
        '5511.1@s.whatsapp.net',
        '5511.1:2@s.whatsapp.net'
    ],
    [
        'ABCDEF0123@call',
        'ABCDEF0123:0@call',
        'ABCDEF0123@call',
        'ABCDEF0123@call',
        'ABCDEF0123:0@call'
    ],
    ['123@g.us', '123:0@g.us', '123@g.us', '123@g.us', '123:0@g.us'],
    ['nouser', 'nouser', 'nouser', null, null],
    ['123:x@lid', '123:x:0@lid', '123:x@lid', null, null]
]

function orNull<T>(run: () => T): T | null {
    try {
        return run()
    } catch {
        return null
    }
}

function rosterDeviceJid(jid: string): string {
    const node: BinaryNode = {
        tag: 'group_info',
        attrs: { media: 'audio', 'connected-limit': '32' },
        content: [
            {
                tag: 'user',
                attrs: { jid: '1@lid', state: 'connected' },
                content: [{ tag: 'device', attrs: { jid } }]
            }
        ]
    }
    return parseGroupInfoNode(node).participants[0].devices[0].jid
}

test('the jid helpers keep the output of the normalisers they replaced', () => {
    for (const [input, device, , accountKey, parsed] of TABLE) {
        assert.equal(toDeviceJid(input), device, input)
        assert.equal(isSameDeviceJid(input, device), true, input)
        assert.equal(
            orNull(() => groupParticipantAccountKey(input)),
            accountKey,
            input
        )
        assert.equal(
            orNull(() => addressDeviceJid(input).jid),
            parsed,
            input
        )
    }
})

test('every call site derives the same jid as before', async () => {
    const offlineDeps = {
        signalDeviceSync: {
            syncDeviceList: () => Promise.reject(new Error('offline'))
        }
    } as unknown as WaVoipDeps

    for (const [input, device, addressed, , parsed] of TABLE) {
        const composition = {
            participants: [{ jid: '1@lid', devices: [input] }],
            lastTransactionId: null
        }
        assert.deepEqual(groupSenderDeviceJids(composition, ''), [device], input)
        assert.equal(toAddressedJid(input, createNoopLogger()), addressed, input)
        assert.equal(
            (await resolvePeerDeviceJids(offlineDeps, input, createNoopLogger()))[0],
            device,
            input
        )
        assert.equal(
            orNull(() => rosterDeviceJid(input)),
            parsed,
            input
        )
        assert.equal(
            orNull(() => normalizeParticipantDeviceJids(input, [input])[0]),
            parsed,
            input
        )
    }
})
