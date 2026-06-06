import assert from 'node:assert/strict'
import test from 'node:test'

import {
    createIgnoreKeyFilter,
    extractIgnoreKeyContext,
    matchesIgnoreKey,
    validateIgnoreKey
} from '@client/messaging/ignore-key'
import type { WaIgnoreKey } from '@client/types'
import type { BinaryNode } from '@transport/types'

const PN = '5511999990000@s.whatsapp.net'
const LID = '99887766554433@lid'
const ME_JID = '5511777770000:25@s.whatsapp.net'

function message(attrs: Record<string, string>): BinaryNode {
    return { tag: 'message', attrs }
}

function receipt(attrs: Record<string, string>): BinaryNode {
    return { tag: 'receipt', attrs }
}

function notification(attrs: Record<string, string>): BinaryNode {
    return { tag: 'notification', attrs }
}

function presence(attrs: Record<string, string>): BinaryNode {
    return { tag: 'presence', attrs }
}

function call(attrs: Record<string, string>): BinaryNode {
    return { tag: 'call', attrs }
}

test('matches remoteJid literally against from attr', () => {
    const node = message({ from: PN, id: 'X' })
    assert.equal(matchesIgnoreKey(node, { remoteJid: PN }, null), true)
    assert.equal(matchesIgnoreKey(node, { remoteJid: 'other@s.whatsapp.net' }, null), false)
})

test('message remoteJid matches via sender_pn and sender_lid alt attrs', () => {
    const lidAddressed = message({ from: LID, sender_pn: PN, id: 'X' })
    assert.equal(matchesIgnoreKey(lidAddressed, { remoteJid: PN }, null), true)

    const pnAddressed = message({ from: PN, sender_lid: LID, id: 'X' })
    assert.equal(matchesIgnoreKey(pnAddressed, { remoteJid: LID }, null), true)
})

test('remoteJid array means OR across candidates', () => {
    const node = message({ from: PN, id: 'X' })
    assert.equal(matchesIgnoreKey(node, { remoteJid: ['other@s.whatsapp.net', PN] }, null), true)
    assert.equal(
        matchesIgnoreKey(
            node,
            { remoteJid: ['other@s.whatsapp.net', 'another@s.whatsapp.net'] },
            null
        ),
        false
    )
})

test('malformed JID candidates are skipped, not thrown', () => {
    const node = message({ from: PN, id: 'X' })
    assert.equal(matchesIgnoreKey(node, { remoteJid: ['not-a-jid', PN] }, null), true)
    assert.equal(matchesIgnoreKey(node, { remoteJid: ['not-a-jid'] }, null), false)
})

test('participant matches via participant_pn / participant_lid for messages', () => {
    const node = message({
        from: 'group@g.us',
        participant: LID,
        participant_pn: PN,
        id: 'X'
    })
    assert.equal(matchesIgnoreKey(node, { participant: PN }, null), true)
    assert.equal(matchesIgnoreKey(node, { participant: LID }, null), true)
    assert.equal(
        matchesIgnoreKey(node, { participant: 'someone-else@s.whatsapp.net' }, null),
        false
    )
})

test('AND between multiple fields: all must match', () => {
    const node = message({ from: PN, id: 'X' })
    const matchAll: WaIgnoreKey = { remoteJid: PN, id: 'X' }
    const idMismatch: WaIgnoreKey = { remoteJid: PN, id: 'Y' }
    assert.equal(matchesIgnoreKey(node, matchAll, null), true)
    assert.equal(matchesIgnoreKey(node, idMismatch, null), false)
})

test('fromMe true matches when stanza from attr resolves to meJid user', () => {
    const ownEcho = message({ from: ME_JID, id: 'X' })
    const peer = message({ from: PN, id: 'X' })
    assert.equal(matchesIgnoreKey(ownEcho, { fromMe: true }, ME_JID), true)
    assert.equal(matchesIgnoreKey(peer, { fromMe: true }, ME_JID), false)
})

test('fromMe false matches only peer-sourced stanzas', () => {
    const ownEcho = message({ from: ME_JID, id: 'X' })
    const peer = message({ from: PN, id: 'X' })
    assert.equal(matchesIgnoreKey(ownEcho, { fromMe: false }, ME_JID), false)
    assert.equal(matchesIgnoreKey(peer, { fromMe: false }, ME_JID), true)
})

test('fromMe against missing meJid yields no match', () => {
    const node = message({ from: ME_JID, id: 'X' })
    assert.equal(matchesIgnoreKey(node, { fromMe: true }, null), false)
})

test('only restricts matching to listed kinds', () => {
    const msg = message({ from: PN, id: 'X' })
    const ack = receipt({ from: PN, id: 'X' })
    const desc: WaIgnoreKey = { remoteJid: PN, only: ['message'] }
    assert.equal(matchesIgnoreKey(msg, desc, null), true)
    assert.equal(matchesIgnoreKey(ack, desc, null), false)
})

test('default scope covers receipt, notification, presence, chatstate, call', () => {
    const desc: WaIgnoreKey = { remoteJid: PN }
    assert.equal(matchesIgnoreKey(receipt({ from: PN }), desc, null), true)
    assert.equal(matchesIgnoreKey(notification({ from: PN }), desc, null), true)
    assert.equal(matchesIgnoreKey(presence({ from: PN }), desc, null), true)
    assert.equal(matchesIgnoreKey(call({ from: PN }), desc, null), true)
})

test('id only meaningful for message/receipt/notification/call', () => {
    assert.equal(matchesIgnoreKey(presence({ from: PN }), { id: 'X' }, null), false)
})

test('non-addressed tags never match', () => {
    const irrelevant: BinaryNode = { tag: 'iq', attrs: { from: PN, id: 'X' } }
    assert.equal(matchesIgnoreKey(irrelevant, { remoteJid: PN }, null), false)
})

test('call sender_lid serves as an additional from candidate', () => {
    const node = call({ from: LID, sender_lid: LID, id: 'C1' })
    assert.equal(matchesIgnoreKey(node, { remoteJid: LID }, null), true)
})

test('validate rejects empty descriptor', () => {
    assert.throws(() => validateIgnoreKey({}), /at least one match field/)
})

test('validate rejects empty remoteJid array', () => {
    assert.throws(() => validateIgnoreKey({ remoteJid: [] }), /remoteJid array is empty/)
})

test('validate rejects empty only array', () => {
    assert.throws(() => validateIgnoreKey({ remoteJid: PN, only: [] }), /only array is empty/)
})

test('validate accepts valid combinations', () => {
    validateIgnoreKey({ remoteJid: PN })
    validateIgnoreKey({ remoteJid: [PN, LID], only: ['message'] })
    validateIgnoreKey({ fromMe: true, only: ['message'] })
    validateIgnoreKey({ participant: PN, only: ['message', 'notification'] })
    validateIgnoreKey({ id: 'X', only: ['message'] })
})

test('extractIgnoreKeyContext returns parsed context with kind/from/fromMe/id/participant', () => {
    const node = message({ from: 'group@g.us', participant: LID, id: 'X' })
    const ctx = extractIgnoreKeyContext(node, ME_JID)
    assert.deepEqual(ctx, {
        kind: 'message',
        remoteJid: 'group@g.us',
        fromMe: false,
        id: 'X',
        participant: LID
    })
})

test('extractIgnoreKeyContext fromMe resolves against sender_pn alt attr', () => {
    const ownEcho = message({ from: LID, sender_pn: ME_JID, id: 'X' })
    assert.equal(extractIgnoreKeyContext(ownEcho, ME_JID)?.fromMe, true)
})

test('extractIgnoreKeyContext returns null for non-addressable tags', () => {
    const iq: BinaryNode = { tag: 'iq', attrs: { from: PN } }
    assert.equal(extractIgnoreKeyContext(iq, ME_JID), null)
})

test('extractIgnoreKeyContext strips the device segment from remoteJid and participant', () => {
    const direct = message({ from: '5511999990000:12@s.whatsapp.net', id: 'X' })
    assert.equal(extractIgnoreKeyContext(direct, ME_JID)?.remoteJid, PN)

    const group = message({ from: 'group@g.us', participant: '99887766554433:7@lid', id: 'X' })
    assert.equal(extractIgnoreKeyContext(group, ME_JID)?.participant, LID)
})

test('predicate sees device-stripped remoteJid so a bare-JID compare catches device stanzas', () => {
    const filter = createIgnoreKeyFilter(
        (m) => m.remoteJid === PN,
        () => ME_JID
    )
    assert.equal(filter(message({ from: '5511999990000:12@s.whatsapp.net', id: 'X' })), true)
    assert.equal(filter(message({ from: PN, id: 'X' })), true)
    assert.equal(filter(message({ from: '5511000001111:3@s.whatsapp.net', id: 'X' })), false)
})

test('userless server JID (from=s.whatsapp.net) passes through without throwing', () => {
    const node = notification({ from: 's.whatsapp.net' })
    assert.equal(extractIgnoreKeyContext(node, ME_JID)?.remoteJid, 's.whatsapp.net')
    assert.equal(matchesIgnoreKey(node, { remoteJid: PN }, null), false)
})

test('createIgnoreKeyFilter with predicate routes the parsed context, drops non-addressable', () => {
    const filter = createIgnoreKeyFilter(
        (m) => m.kind === 'message' && m.id === 'DROP',
        () => ME_JID
    )
    assert.equal(filter(message({ from: PN, id: 'DROP' })), true)
    assert.equal(filter(message({ from: PN, id: 'KEEP' })), false)
    assert.equal(filter(receipt({ from: PN, id: 'DROP' })), false)
    assert.equal(filter({ tag: 'iq', attrs: { from: PN, id: 'DROP' } }), false)
})

test('createIgnoreKeyFilter forwards non-message addressable kinds to the predicate', () => {
    const filter = createIgnoreKeyFilter(
        (m) => m.kind === 'receipt' && m.id === 'DROP',
        () => ME_JID
    )
    assert.equal(filter(receipt({ from: PN, id: 'DROP' })), true)
    assert.equal(filter(receipt({ from: PN, id: 'KEEP' })), false)
    assert.equal(filter(message({ from: PN, id: 'DROP' })), false)
})

test('createIgnoreKeyFilter with descriptor delegates to matchesIgnoreKey', () => {
    const filter = createIgnoreKeyFilter({ remoteJid: PN, only: ['message'] }, () => ME_JID)
    assert.equal(filter(message({ from: PN, id: 'X' })), true)
    assert.equal(filter(receipt({ from: PN, id: 'X' })), false)
})
