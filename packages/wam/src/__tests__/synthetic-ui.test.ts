import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

import type { WaWamAutoEmitterContext } from '../WaWamAutoEmitter.js'
import type { WaWamCoordinator } from '../WaWamCoordinator.js'
import { WaWamSyntheticUi } from '../WaWamSyntheticUi.js'

interface Commit {
    readonly name: string
    readonly payload: Record<string, unknown>
}

function makeHarness() {
    const commits: Commit[] = []
    const handlers = new Map<string, (event: unknown) => void>()
    const coordinator = {
        commit: (name: string, payload: Record<string, unknown>) => commits.push({ name, payload })
    } as unknown as WaWamCoordinator
    const ctx = {
        on: (event: string, handler: (event: unknown) => void) => handlers.set(event, handler),
        off: (event: string, handler: (event: unknown) => void) => {
            if (handlers.get(event) === handler) handlers.delete(event)
        }
    } as unknown as WaWamAutoEmitterContext
    const emit = (event: string, payload: unknown) => handlers.get(event)?.(payload)
    return { commits, ctx, coordinator, emit }
}

const lidMessage = (extra: Record<string, unknown> = {}) => ({
    key: { remoteJid: '456@lid', isGroup: false, isBroadcast: false, isNewsletter: false },
    rawNode: { tag: 'message', attrs: {} },
    ...extra
})

test('synthetic UI fabricates CHAT_OPEN with WA Web fields (preloaded + isLid, no chatType)', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, { chatOpenProbability: 1 })
    h.emit('message', lidMessage())
    mock.timers.tick(61_000)
    const open = h.commits.find((c) => c.payload.uiActionType === 'CHAT_OPEN')
    assert.ok(open)
    assert.equal(open?.name, 'UiAction')
    assert.equal(open?.payload.uiActionPreloaded, true)
    assert.equal(open?.payload.isLid, true)
    assert.equal(typeof open?.payload.uiActionT, 'number')
    // WA Web's CHAT_OPEN does not set uiActionChatType
    assert.equal(open?.payload.uiActionChatType, undefined)
    // WA Web pairs every CHAT_OPEN with a WebcChatOpen event
    const webc = h.commits.find((c) => c.name === 'WebcChatOpen')
    assert.ok(webc)
    assert.equal(typeof webc?.payload.webcWindowHeightFloat, 'number')
    assert.equal(typeof webc?.payload.webcUnreadCount, 'number')
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI fabricates IMAGE_OPEN for an image message and only uses web-real types', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, {
        chatOpenProbability: 1,
        imageOpenProbability: 1
    })
    h.emit('message', lidMessage({ message: { imageMessage: {} } }))
    mock.timers.tick(91_000)
    const types = h.commits.filter((c) => c.name === 'UiAction').map((c) => c.payload.uiActionType)
    assert.ok(types.includes('CHAT_OPEN'))
    assert.ok(types.includes('IMAGE_OPEN'))
    assert.ok(types.every((t) => t === 'CHAT_OPEN' || t === 'IMAGE_OPEN'))
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI fabricates GROUP_INFO_OPEN (preloaded + isLid) for a group message', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, {
        chatOpenProbability: 0,
        infoOpenProbability: 1
    })
    h.emit('message', {
        key: { remoteJid: '1@g.us', isGroup: true, isBroadcast: false, isNewsletter: false },
        rawNode: { tag: 'message', attrs: {} }
    })
    mock.timers.tick(121_000)
    const info = h.commits.find((c) => c.payload.uiActionType === 'GROUP_INFO_OPEN')
    assert.ok(info)
    assert.equal(info?.payload.uiActionPreloaded, true)
    assert.equal(info?.payload.isLid, false)
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI fabricates CHANNEL_INFO_OPEN without isLid for a newsletter message', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, {
        chatOpenProbability: 0,
        infoOpenProbability: 1
    })
    h.emit('message', {
        key: { remoteJid: 'x@newsletter', isGroup: false, isBroadcast: false, isNewsletter: true },
        rawNode: { tag: 'message', attrs: {} }
    })
    mock.timers.tick(121_000)
    const info = h.commits.find((c) => c.payload.uiActionType === 'CHANNEL_INFO_OPEN')
    assert.ok(info)
    assert.equal(info?.payload.uiActionPreloaded, true)
    // WA Web's CHANNEL_INFO_OPEN does not set isLid
    assert.equal(info?.payload.isLid, undefined)
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI fabricates MSG_INFO_OPEN after an outbound message', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, { infoOpenProbability: 1 })
    h.emit('debug_transport_node_out', {
        node: { tag: 'message', attrs: { to: '456@lid', id: 'm1', addressing_mode: 'lid' } }
    })
    mock.timers.tick(121_000)
    const info = h.commits.find((c) => c.payload.uiActionType === 'MSG_INFO_OPEN')
    assert.ok(info)
    assert.equal(info?.payload.uiActionPreloaded, true)
    assert.equal(info?.payload.isLid, true)
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI fabricates WebcMediaLoad (SUCCESS) for an inbound audio message', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, {
        chatOpenProbability: 0,
        imageOpenProbability: 1
    })
    h.emit('message', lidMessage({ message: { audioMessage: {} } }))
    mock.timers.tick(10_000)
    const media = h.commits.find((c) => c.name === 'WebcMediaLoad')
    assert.ok(media)
    assert.equal(media?.payload.webcMediaLoadResult, 'SUCCESS')
    assert.equal(typeof media?.payload.webcMediaLoadT, 'number')
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI fabricates nothing outside the configured active hours', () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    mock.timers.setTime(new Date(2020, 0, 1, 3, 0, 0).getTime())
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, {
        chatOpenProbability: 1,
        activeHoursStartHour: 9,
        activeHoursEndHour: 17
    })
    h.emit('message', lidMessage())
    mock.timers.tick(61_000)
    assert.equal(h.commits.length, 0)
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI fabricates WebcEmojiOpen with a real tab in the ambient stream', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const origRandom = Math.random
    Math.random = () => 0.05
    try {
        const h = makeHarness()
        const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, {
            ambientIntervalMinMs: 1,
            ambientIntervalMaxMs: 2
        })
        mock.timers.tick(20)
        const emoji = h.commits.find((c) => c.name === 'WebcEmojiOpen')
        assert.ok(emoji)
        assert.ok(['EMOJI', 'GIF', 'STICKER'].includes(emoji?.payload.webcEmojiOpenTab as string))
        ui.dispose()
    } finally {
        Math.random = origRandom
        mock.timers.reset()
    }
})

test('synthetic UI fabricates AttachmentTrayActions (SEND) for an outbound media message', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, { attachmentTrayProbability: 1 })
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'message',
            attrs: { to: '1@g.us' },
            content: [{ tag: 'enc', attrs: { mediatype: 'image' } }]
        }
    })
    mock.timers.tick(13_000)
    const tray = h.commits.find((c) => c.name === 'AttachmentTrayActions')
    assert.ok(tray)
    assert.equal(tray?.payload.attachmentTrayAction, 'SEND')
    assert.equal(tray?.payload.attachmentTrayActionTarget, 'GALLERY')
    assert.equal(tray?.payload.sendMediaType, 'PHOTO')
    assert.equal(tray?.payload.actionThreadType, 'GROUP_CHAT')
    assert.equal(tray?.payload.isAGroup, true)
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI fabricates no AttachmentTrayActions for a sticker (emoji-panel, not the tray)', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, { attachmentTrayProbability: 1 })
    h.emit('debug_transport_node_out', {
        node: {
            tag: 'message',
            attrs: { to: '456@s.whatsapp.net' },
            content: [{ tag: 'enc', attrs: { mediatype: 'sticker' } }]
        }
    })
    mock.timers.tick(13_000)
    assert.equal(h.commits.filter((c) => c.name === 'AttachmentTrayActions').length, 0)
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI samples MemoryStat periodically (main process, uptime, numMessages)', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, {
        chatOpenProbability: 0,
        memoryIntervalMinMs: 1,
        memoryIntervalMaxMs: 2
    })
    h.emit('message', lidMessage())
    mock.timers.tick(5)
    const mem = h.commits.find((c) => c.name === 'MemoryStat')
    assert.ok(mem)
    assert.equal(mem?.payload.processType, 'main')
    assert.equal(typeof mem?.payload.workingSetSize, 'number')
    assert.equal(typeof mem?.payload.uptime, 'number')
    assert.ok((mem?.payload.numMessages as number) >= 1)
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI flushes UserActivity with a bitmap matching the active slices', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, {
        chatOpenProbability: 0,
        memoryIntervalMinMs: 10 * 60_000,
        memoryIntervalMaxMs: 10 * 60_000
    })
    h.emit('message', lidMessage())
    for (let i = 0; i < 5; i += 1) mock.timers.tick(60_000)
    const ua = h.commits.find((c) => c.name === 'UserActivity')
    assert.ok(ua)
    assert.equal(ua?.payload.userActivityBitmapLen, 5)
    assert.equal(ua?.payload.userActivitySessionCum, 1)
    assert.equal(ua?.payload.userActivityBitmapLow, 1)
    assert.equal(ua?.payload.userActivitySessionSeq, 1)
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI fabricates AboutConsumption for a 1:1 inbound message', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, {
        chatOpenProbability: 0,
        aboutConsumptionProbability: 1
    })
    h.emit('message', lidMessage())
    mock.timers.tick(41_000)
    const about = h.commits.find((c) => c.name === 'AboutConsumption')
    assert.ok(about)
    assert.ok(
        ['ONE_ON_ONE_CHAT', 'PROFILE_INFO'].includes(
            about?.payload.aboutConsumptionSurface as string
        )
    )
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI fabricates no AboutConsumption for a group message', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, {
        chatOpenProbability: 0,
        infoOpenProbability: 0,
        aboutConsumptionProbability: 1
    })
    h.emit('message', {
        key: { remoteJid: '1@g.us', isGroup: true, isBroadcast: false, isNewsletter: false },
        rawNode: { tag: 'message', attrs: {} }
    })
    mock.timers.tick(41_000)
    assert.equal(h.commits.filter((c) => c.name === 'AboutConsumption').length, 0)
    ui.dispose()
    mock.timers.reset()
})

test('synthetic UI fabricates ContactSearchExperience in the ambient stream', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const origRandom = Math.random
    Math.random = () => 0.15
    try {
        const h = makeHarness()
        const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, {
            ambientIntervalMinMs: 1,
            ambientIntervalMaxMs: 2,
            memoryIntervalMinMs: 10 * 60_000,
            memoryIntervalMaxMs: 10 * 60_000
        })
        mock.timers.tick(5)
        const search = h.commits.find((c) => c.name === 'ContactSearchExperience')
        assert.ok(search)
        assert.equal(search?.payload.contactSearchEntrypoint, 'CHATS_LIST_GLOBAL_SEARCH')
        assert.equal(search?.payload.isUsernameSearch, false)
        assert.equal(search?.payload.searchActionName, 'SEARCH_START')
        ui.dispose()
    } finally {
        Math.random = origRandom
        mock.timers.reset()
    }
})

test('synthetic UI cancels pending fabrications on dispose', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const h = makeHarness()
    const ui = new WaWamSyntheticUi(h.coordinator, h.ctx, { chatOpenProbability: 1 })
    h.emit('message', lidMessage())
    ui.dispose()
    mock.timers.tick(120_000)
    assert.equal(h.commits.length, 0)
    mock.timers.reset()
})
