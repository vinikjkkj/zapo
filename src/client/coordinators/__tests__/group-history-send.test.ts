import assert from 'node:assert/strict'
import test from 'node:test'

import { WaMessageCoordinator } from '@client/coordinators/WaMessageCoordinator'
import { restrictGroupHistoryTargets } from '@client/coordinators/WaMessageDispatchCoordinator'
import { createNoopLogger } from '@infra/log/types'
import type { Proto } from '@proto'

const GROUP = '120363000000000000@g.us'
const ME = '5511777777777@s.whatsapp.net'
const ALICE = '5511999999999@s.whatsapp.net'
const BOB = '5511888888888@s.whatsapp.net'
const CAROL = '5511666666666@s.whatsapp.net'

function bundleFor(receivers: readonly string[]): Proto.IMessage {
    return {
        messageHistoryBundle: {
            directPath: '/x',
            messageHistoryMetadata: { historyReceivers: [...receivers] }
        }
    }
}

test('restrictGroupHistoryTargets keeps the full list for a normal message', () => {
    const participants = [ALICE, BOB, CAROL, ME]
    assert.deepEqual(
        restrictGroupHistoryTargets({ conversation: 'hi' }, participants, ME),
        participants
    )
})

test('restrictGroupHistoryTargets narrows a bundle to its receivers plus the sender', () => {
    const targets = restrictGroupHistoryTargets(bundleFor([ALICE]), [ALICE, BOB, CAROL, ME], ME)
    assert.deepEqual(targets, [ALICE, ME])
})

test('restrictGroupHistoryTargets ignores receivers who left the group', () => {
    const dropped: string[][] = []
    const targets = restrictGroupHistoryTargets(
        bundleFor([ALICE, '5511000000000@s.whatsapp.net']),
        [ALICE, BOB, ME],
        ME,
        (jids) => dropped.push([...jids])
    )
    assert.deepEqual(targets, [ALICE, ME])
    assert.deepEqual(dropped, [['5511000000000@s.whatsapp.net']])
})

test('restrictGroupHistoryTargets matches device-suffixed receivers', () => {
    const targets = restrictGroupHistoryTargets(
        bundleFor(['5511999999999:4@s.whatsapp.net']),
        [ALICE, BOB, ME],
        ME
    )
    assert.deepEqual(targets, [ALICE, ME])
})

test('restrictGroupHistoryTargets throws rather than broadcasting when nothing matches', () => {
    assert.throws(
        () => restrictGroupHistoryTargets(bundleFor([CAROL]), [ALICE, BOB], ME),
        /no receivers in the group/
    )
})

test('restrictGroupHistoryTargets throws when only the sender is left to address', () => {
    assert.throws(
        () => restrictGroupHistoryTargets(bundleFor([CAROL]), [ALICE, BOB, ME], ME),
        /no receivers in the group/
    )
})

test('restrictGroupHistoryTargets throws when receivers use the wrong addressing mode', () => {
    assert.throws(
        () => restrictGroupHistoryTargets(bundleFor([ALICE]), ['111@lid', '222@lid'], '222@lid'),
        /no receivers in the group/
    )
})

test('restrictGroupHistoryTargets sees through an ephemeral wrapper', () => {
    const wrapped: Proto.IMessage = {
        ephemeralMessage: { message: bundleFor([ALICE]) }
    }
    assert.deepEqual(restrictGroupHistoryTargets(wrapped, [ALICE, BOB, ME], ME), [ALICE, ME])
})

/**
 * Just enough of the media-upload wiring to exercise the send path offline: a
 * pre-warmed media conn skips the IQ, and the fake transfer echoes an upload
 * response instead of doing HTTP.
 */
function createFakeUploadOptions(): never {
    return {
        logger: createNoopLogger(),
        serverClock: { nowSeconds: () => 1_700_000_000 },
        getMediaConnCache: () => ({
            auth: 'fake-auth',
            expiresAtMs: Date.now() + 600_000,
            hosts: [{ hostname: 'mmg.example', isFallback: false }]
        }),
        setMediaConnCache: () => undefined,
        queryWithContext: async () => {
            throw new Error('media conn IQ should not be needed')
        },
        mediaTransfer: {
            uploadStream: async () => ({ status: 200 }),
            readResponseBytes: async () =>
                new TextEncoder().encode(
                    JSON.stringify({ url: 'https://mmg.example/x', direct_path: '/mms/x' })
                )
        }
    } as never
}

interface ShareHarness {
    readonly coordinator: WaMessageCoordinator
    readonly sent: { readonly to: string; readonly content: Proto.IMessage }[]
}

function createShareHarness(options: {
    readonly audience?: {
        readonly historyReceivers: readonly string[]
        readonly nonHistoryReceivers: readonly string[]
        readonly unknownJids: readonly string[]
        readonly requestedSelf?: boolean
        readonly addressingMode?: 'pn' | 'lid'
    }
    readonly storedMessages?: readonly unknown[]
    readonly groupHistorySendEnabled?: boolean
    readonly failNoticeSend?: boolean
}): ShareHarness {
    const sent: { readonly to: string; readonly content: Proto.IMessage }[] = []
    const coordinator = new WaMessageCoordinator({
        isGroupHistorySendEnabled: () => options.groupHistorySendEnabled !== false,
        getAbPropNumber: () => 100,
        messageDispatch: {
            resolveGroupHistoryAudience: async () => ({
                requestedSelf: false,
                addressingMode: 'pn',
                ...(options.audience ?? {
                    historyReceivers: [ALICE],
                    nonHistoryReceivers: [BOB],
                    unknownJids: []
                })
            }),
            sendMessage: async (to: string, content: Proto.IMessage) => {
                if (options.failNoticeSend && content.messageHistoryNotice) {
                    throw new Error('notice rejected')
                }
                sent.push({ to, content })
                return { id: `sent-${sent.length}` }
            }
        },
        mediaTransfer: {} as never,
        mediaUploadOptions: createFakeUploadOptions(),
        logger: createNoopLogger(),
        messageStore: {
            listByThread: async () => options.storedMessages ?? []
        },
        messageSecretStore: {} as never,
        trustedContactToken: {} as never,
        emitAddon: () => undefined,
        mexSocket: {} as never,
        peerDataOperation: {} as never
    } as never)
    return { coordinator, sent }
}

test('shareGroupHistory refuses to spend an upload when the account is not allowed', async () => {
    const { coordinator, sent } = createShareHarness({ groupHistorySendEnabled: false })
    await assert.rejects(
        () => coordinator.shareGroupHistory(GROUP, { toJids: [ALICE] }),
        /group_history_send is off/
    )
    assert.equal(sent.length, 0)
})

test('shareGroupHistory rejects sharing with this account itself', async () => {
    const { coordinator } = createShareHarness({
        audience: {
            historyReceivers: [],
            nonHistoryReceivers: [ALICE, BOB],
            unknownJids: [],
            requestedSelf: true
        }
    })
    await assert.rejects(
        () => coordinator.shareGroupHistory(GROUP, { toJids: [ME] }),
        /with this account itself/
    )
})

test('shareGroupHistory names the addressing mode when a recipient does not match', async () => {
    const { coordinator } = createShareHarness({
        audience: {
            historyReceivers: [],
            nonHistoryReceivers: ['111@lid'],
            unknownJids: [ALICE],
            addressingMode: 'lid'
        }
    })
    await assert.rejects(
        () => coordinator.shareGroupHistory(GROUP, { toJids: [ALICE] }),
        /addressing mode: lid/
    )
})

test('shareGroupHistory reports a delivered bundle even when the notice fails', async () => {
    const { coordinator, sent } = createShareHarness({ failNoticeSend: true })
    const result = await coordinator.shareGroupHistory(GROUP, {
        toJids: [ALICE],
        messages: [{ key: { id: 'M1', remoteJid: GROUP }, message: { conversation: 'x' } }]
    })
    assert.equal(result.bundleMessageId, 'sent-1')
    assert.equal(result.noticeMessageId, undefined)
    assert.equal(sent.length, 1)
})

test('shareGroupHistory rejects a non-group jid', async () => {
    const { coordinator } = createShareHarness({})
    await assert.rejects(
        () => coordinator.shareGroupHistory(ALICE, { toJids: [BOB] }),
        /requires a group jid/
    )
})

test('shareGroupHistory rejects a count that is not a positive whole number', async () => {
    const { coordinator } = createShareHarness({})
    for (const count of [0, -1, 1.5, Number.NaN]) {
        await assert.rejects(
            () => coordinator.shareGroupHistory(GROUP, { toJids: [ALICE], count }),
            /count must be a positive safe integer/
        )
    }
})

test('shareGroupHistory rejects an empty recipient list', async () => {
    const { coordinator } = createShareHarness({})
    await assert.rejects(
        () => coordinator.shareGroupHistory(GROUP, { toJids: [] }),
        /at least one recipient/
    )
})

test('shareGroupHistory refuses recipients who are not group members', async () => {
    const { coordinator } = createShareHarness({
        audience: {
            historyReceivers: [ALICE],
            nonHistoryReceivers: [BOB],
            unknownJids: [CAROL]
        }
    })
    await assert.rejects(
        () => coordinator.shareGroupHistory(GROUP, { toJids: [ALICE, CAROL] }),
        /not members of the group/
    )
})

test('shareGroupHistory stops before uploading when there is nothing to bundle', async () => {
    const { coordinator, sent } = createShareHarness({ storedMessages: [] })
    await assert.rejects(
        () => coordinator.shareGroupHistory(GROUP, { toJids: [ALICE] }),
        /no messages to share/
    )
    assert.equal(sent.length, 0)
})
