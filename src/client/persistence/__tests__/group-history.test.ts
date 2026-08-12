import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'

import type { WaAbPropName } from '@abprops-spec'
import {
    processGroupHistoryBundle,
    type WaGroupHistoryDeps
} from '@client/persistence/group-history'
import { createNoopLogger } from '@infra/log/types'
import { encodeGroupHistoryBundle } from '@message/kinds/group-history'
import type { Proto } from '@proto'

const GROUP_JID = '120363000000000000@g.us'
const ME_PN = '5511999999999@s.whatsapp.net'
const ME_LID = '91379841634519@lid'
const OTHER = '5511888888888@s.whatsapp.net'

const TWO_WEEKS_SECONDS = 1_209_600

function nowSeconds(): number {
    return Math.floor(Date.now() / 1_000)
}

function buildMessage(
    id: string,
    text: string,
    overrides: Partial<Proto.IWebMessageInfo> = {}
): Proto.IWebMessageInfo {
    return {
        key: { id, remoteJid: GROUP_JID, fromMe: false, participant: OTHER },
        message: { conversation: text },
        messageTimestamp: nowSeconds(),
        ...overrides
    }
}

interface Harness {
    readonly deps: WaGroupHistoryDeps
    readonly persisted: { readonly id?: string | null }[]
    readonly emitted: unknown[]
    /** Number of CDN fetches the processor actually issued. */
    readonly downloads: { count: number }
    /** Sets what the fake CDN returns - called after the bundle is built. */
    readonly setBlob: (next: Uint8Array) => void
}

function createHarness(overrides: Partial<WaGroupHistoryDeps> = {}): Harness {
    const persisted: { readonly id?: string | null }[] = []
    const emitted: unknown[] = []
    const downloads = { count: 0 }
    let blob: Uint8Array = new Uint8Array()
    const deps = {
        logger: createNoopLogger(),
        mediaTransfer: {
            downloadAndDecryptStream: async (request: { readonly mediaType: string }) => {
                downloads.count += 1
                assert.equal(request.mediaType, 'group-history')
                return {
                    plaintext: Readable.from([Buffer.from(blob)]),
                    metadata: Promise.resolve(null)
                }
            }
        },
        writeBehind: {
            persistMessageAsync: async (record: { readonly id?: string | null }) => {
                persisted.push(record)
            }
        },
        emitEvent: (_event: string, payload: unknown) => {
            emitted.push(payload)
        },
        meJid: ME_PN,
        meLid: ME_LID,
        getAbPropNumber: (_name: WaAbPropName) => TWO_WEEKS_SECONDS,
        ...overrides
    } as unknown as WaGroupHistoryDeps
    return {
        deps,
        persisted,
        emitted,
        downloads,
        setBlob: (next: Uint8Array) => {
            blob = next
        }
    }
}

function buildBundle(receivers: readonly string[]): Proto.Message.IMessageHistoryBundle {
    return {
        directPath: '/v/t62.7119-24/fake',
        mediaKey: new Uint8Array(32),
        fileSha256: new Uint8Array(32),
        fileEncSha256: new Uint8Array(32),
        mimetype: 'application/protobuf',
        messageHistoryMetadata: { historyReceivers: [...receivers] }
    }
}

test('group history bundle persists messages and emits the event', async () => {
    const harness = createHarness()
    const { compressed } = await encodeGroupHistoryBundle(
        [buildMessage('A', 'primeira'), buildMessage('B', 'segunda')],
        [buildMessage('P', 'pin antigo', { messageTimestamp: 1 })]
    )
    harness.setBlob(compressed)

    await processGroupHistoryBundle(harness.deps, {
        bundle: buildBundle([ME_LID]),
        groupJid: GROUP_JID,
        senderJid: OTHER,
        bundleMessageId: 'bundle-1',
        sentAtSeconds: nowSeconds()
    })

    assert.equal(harness.downloads.count, 1)
    assert.deepEqual(
        harness.persisted.map((record) => record.id),
        ['A', 'B', 'P']
    )
    assert.equal(harness.emitted.length, 1)
    const event = harness.emitted[0] as {
        messagesCount: number
        outOfWindowPinsCount: number
        droppedCount: number
        groupJid: string
        senderJid?: string
    }
    assert.equal(event.messagesCount, 3)
    assert.equal(event.outOfWindowPinsCount, 1)
    assert.equal(event.droppedCount, 0)
    assert.equal(event.groupJid, GROUP_JID)
    assert.equal(event.senderJid, OTHER)
})

test('group history bundle addressed to another member is never downloaded', async () => {
    const harness = createHarness()
    const { compressed } = await encodeGroupHistoryBundle([buildMessage('A', 'x')])
    harness.setBlob(compressed)

    await processGroupHistoryBundle(harness.deps, {
        bundle: buildBundle([OTHER]),
        groupJid: GROUP_JID,
        sentAtSeconds: nowSeconds()
    })

    assert.equal(harness.downloads.count, 0)
    assert.equal(harness.persisted.length, 0)
    assert.equal(harness.emitted.length, 0)
})

test('group history bundle matches the local identity by PN as well as LID', async () => {
    const harness = createHarness()
    const { compressed } = await encodeGroupHistoryBundle([buildMessage('A', 'x')])
    harness.setBlob(compressed)

    await processGroupHistoryBundle(harness.deps, {
        bundle: buildBundle(['5511999999999:3@s.whatsapp.net']),
        groupJid: GROUP_JID,
        sentAtSeconds: nowSeconds()
    })

    assert.equal(harness.persisted.length, 1)
})

test('group history bundle past its receiver window is dropped before download', async () => {
    const harness = createHarness()
    const { compressed } = await encodeGroupHistoryBundle([buildMessage('A', 'x')])
    harness.setBlob(compressed)

    await processGroupHistoryBundle(harness.deps, {
        bundle: buildBundle([ME_LID]),
        groupJid: GROUP_JID,
        sentAtSeconds: nowSeconds() - TWO_WEEKS_SECONDS - 60
    })

    assert.equal(harness.downloads.count, 0)
    assert.equal(harness.emitted.length, 0)
})

test('group history bundle outside a group is ignored', async () => {
    const harness = createHarness()
    const { compressed } = await encodeGroupHistoryBundle([buildMessage('A', 'x')])
    harness.setBlob(compressed)

    await processGroupHistoryBundle(harness.deps, {
        bundle: buildBundle([ME_LID]),
        groupJid: OTHER,
        sentAtSeconds: nowSeconds()
    })

    assert.equal(harness.downloads.count, 0)
    assert.equal(harness.emitted.length, 0)
})

test('group history bundle filters stubs, foreign chats, expired and too-old entries', async () => {
    const harness = createHarness()
    const stale = nowSeconds() - 3 * TWO_WEEKS_SECONDS
    const { compressed } = await encodeGroupHistoryBundle([
        buildMessage('KEEP', 'ok'),
        {
            key: { id: 'STUB', remoteJid: GROUP_JID, fromMe: false },
            messageTimestamp: nowSeconds()
        },
        buildMessage('FOREIGN', 'x', {
            key: { id: 'FOREIGN', remoteJid: '120363999999999999@g.us', fromMe: false }
        }),
        buildMessage('GONE', 'x', {
            messageTimestamp: nowSeconds() - 120,
            ephemeralDuration: 60
        }),
        buildMessage('ANCIENT', 'x', { messageTimestamp: stale })
    ])
    harness.setBlob(compressed)

    await processGroupHistoryBundle(harness.deps, {
        bundle: buildBundle([ME_LID]),
        groupJid: GROUP_JID,
        sentAtSeconds: nowSeconds()
    })

    assert.deepEqual(
        harness.persisted.map((record) => record.id),
        ['KEEP']
    )
    const event = harness.emitted[0] as { messagesCount: number; droppedCount: number }
    assert.equal(event.messagesCount, 1)
    assert.equal(event.droppedCount, 4)
})
