import type { WaWamEventArgs } from '@vinikjkkj/wa-wam'
import type { BinaryNode, WaClientPluginContext, WaIncomingMessageEvent } from 'zapo-js'
import { isLidJid } from 'zapo-js/protocol'

import type { WaWamCoordinator } from './WaWamCoordinator.js'

type Ctx = Pick<WaClientPluginContext, 'on' | 'off'>

/** Minimum spacing between fabricated chat opens, so inbound bursts don't imply an implausible click rate. */
const MESSAGE_OPEN_MIN_GAP_MS = 20_000
/** Info-drawer opens (group/channel/msg info) are rare interactions; keep them well spaced. */
const INFO_OPEN_MIN_GAP_MS = 180_000
/** How many recent chats' addressing to keep for the ambient re-open stream. */
const RECENT_CHATS = 12
/** Emoji-picker tabs WA Web reports for WebcEmojiOpen. */
const EMOJI_TABS = ['EMOJI', 'GIF', 'STICKER'] as const

export interface WaWamSyntheticUiOptions {
    /** Chance a given inbound message fabricates a CHAT_OPEN (default 0.25). */
    readonly chatOpenProbability?: number
    /** Chance an inbound image additionally fabricates an IMAGE_OPEN (default 0.3). */
    readonly imageOpenProbability?: number
    /** Chance an event fabricates an info-drawer open (group/channel/msg info) (default 0.05). */
    readonly infoOpenProbability?: number
    /** Ambient (idle-checking) re-open interval bounds in ms (default 5-25min). */
    readonly ambientIntervalMinMs?: number
    readonly ambientIntervalMaxMs?: number
    /**
     * Local-time hour window [start, end) outside which nothing is fabricated, so
     * the profile does not show 4am activity. Both required to take effect; a
     * start > end spans midnight. Default: unset (fabricate around the clock).
     */
    readonly activeHoursStartHour?: number
    readonly activeHoursEndHour?: number
}

const rand = (min: number, max: number): number => min + Math.random() * (max - min)
const randInt = (min: number, max: number): number => Math.floor(rand(min, max))

/**
 * Fabricates plausible `UiAction` telemetry so the emitted event profile
 * resembles a human WA Web session rather than a client that only reports
 * protocol events. Only the UiAction types WA Web actually fires are used, with
 * the exact fields WA sets (`uiActionPreloaded`, `isLid`, `uiActionT`), anchored
 * to real activity with human delays: a chat that received a message may "open"
 * (CHAT_OPEN paired with its WebcChatOpen, plus IMAGE_OPEN); its group/channel or
 * a sent message's info drawer may be "opened" (GROUP/CHANNEL/MSG_INFO_OPEN); plus a
 * low-rate jittered re-open of a recent chat. Opt-in and best-effort - badly-timed
 * fabrication is a worse tell than none, so everything is jittered and rate-limited.
 */
export class WaWamSyntheticUi {
    private readonly timers = new Set<ReturnType<typeof setTimeout>>()
    private readonly unsubscribes: Array<() => void> = []
    private readonly recentChatIsLid: boolean[] = []
    private readonly chatOpenProbability: number
    private readonly imageOpenProbability: number
    private readonly infoOpenProbability: number
    private readonly ambientMinMs: number
    private readonly ambientMaxMs: number
    private readonly activeStartHour: number | undefined
    private readonly activeEndHour: number | undefined
    private readonly windowHeightFloat = randInt(680, 1040)
    private lastOpenMs = 0
    private lastInfoOpenMs = 0
    private disposed = false

    constructor(
        private readonly coordinator: WaWamCoordinator,
        ctx: Ctx,
        options: WaWamSyntheticUiOptions = {}
    ) {
        this.chatOpenProbability = options.chatOpenProbability ?? 0.25
        this.imageOpenProbability = options.imageOpenProbability ?? 0.3
        this.infoOpenProbability = options.infoOpenProbability ?? 0.05
        this.ambientMinMs = options.ambientIntervalMinMs ?? 5 * 60_000
        this.ambientMaxMs = options.ambientIntervalMaxMs ?? 25 * 60_000
        this.activeStartHour = options.activeHoursStartHour
        this.activeEndHour = options.activeHoursEndHour
        const onMessage = (event: WaIncomingMessageEvent): void => this.onMessage(event)
        const onNodeOut = (event: { readonly node: BinaryNode }): void => this.onNodeOut(event.node)
        ctx.on('message', onMessage)
        ctx.on('debug_transport_node_out', onNodeOut)
        this.unsubscribes.push(
            () => ctx.off('message', onMessage),
            () => ctx.off('debug_transport_node_out', onNodeOut)
        )
        this.scheduleAmbient()
    }

    private onMessage(event: WaIncomingMessageEvent): void {
        if (this.disposed) return
        const key = event.key
        const isLid = isLidJid(key.remoteJid ?? '')
        this.rememberChat(isLid)

        const now = Date.now()
        if (
            Math.random() <= this.chatOpenProbability &&
            now - this.lastOpenMs >= MESSAGE_OPEN_MIN_GAP_MS
        ) {
            this.lastOpenMs = now
            this.schedule(rand(2000, 60_000), () => this.emitChatOpen(isLid))
            if (event.message?.imageMessage && Math.random() < this.imageOpenProbability) {
                this.schedule(rand(4000, 90_000), () => this.emitImageOpen(isLid))
            }
        }

        if ((key.isGroup || key.isNewsletter) && this.infoOpenAllowed()) {
            const payload: WaWamEventArgs<'UiAction'> = key.isNewsletter
                ? {
                      uiActionType: 'CHANNEL_INFO_OPEN',
                      uiActionPreloaded: true,
                      uiActionT: randInt(40, 400)
                  }
                : {
                      uiActionType: 'GROUP_INFO_OPEN',
                      uiActionPreloaded: true,
                      isLid,
                      uiActionT: randInt(40, 400)
                  }
            this.schedule(rand(3000, 120_000), () => this.emit(payload))
        }

        if (event.message?.audioMessage && Math.random() < this.imageOpenProbability) {
            this.schedule(rand(1000, 8000), () => this.emitMediaLoad())
        }
    }

    private emitMediaLoad(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('WebcMediaLoad', {
            webcMediaLoadResult: 'SUCCESS',
            webcMediaLoadT: randInt(30, 800)
        })
    }

    private onNodeOut(node: BinaryNode): void {
        if (this.disposed || node.tag !== 'message') return
        if (!this.infoOpenAllowed()) return
        const to = node.attrs.to ?? ''
        const isLid = isLidJid(to) || node.attrs.addressing_mode === 'lid'
        this.schedule(rand(3000, 120_000), () =>
            this.emit({
                uiActionType: 'MSG_INFO_OPEN',
                uiActionPreloaded: true,
                isLid,
                uiActionT: randInt(40, 400)
            })
        )
    }

    private scheduleAmbient(): void {
        this.schedule(rand(this.ambientMinMs, this.ambientMaxMs), () => {
            if (Math.random() < 0.15) {
                this.emitEmojiOpen()
            } else {
                const isLid = this.recentChatIsLid[randInt(0, this.recentChatIsLid.length)]
                if (isLid !== undefined) this.emitChatOpen(isLid)
            }
            this.scheduleAmbient()
        })
    }

    private emitEmojiOpen(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('WebcEmojiOpen', {
            webcEmojiOpenTab: EMOJI_TABS[randInt(0, EMOJI_TABS.length)]
        })
    }

    private infoOpenAllowed(): boolean {
        const now = Date.now()
        if (
            Math.random() >= this.infoOpenProbability ||
            now - this.lastInfoOpenMs < INFO_OPEN_MIN_GAP_MS
        ) {
            return false
        }
        this.lastInfoOpenMs = now
        return true
    }

    private emitChatOpen(isLid: boolean): void {
        if (!this.canEmit()) return
        this.coordinator.commit('UiAction', {
            uiActionType: 'CHAT_OPEN',
            uiActionPreloaded: true,
            isLid,
            uiActionT: randInt(40, 400)
        })
        const rendered = randInt(8, 30)
        const beforePaint = randInt(20, 80)
        const painted = beforePaint + randInt(20, 120)
        this.coordinator.commit('WebcChatOpen', {
            webcUnreadCount: randInt(0, 4),
            webcWindowHeightFloat: this.windowHeightFloat,
            webcChatOpenBeforePaintT: beforePaint,
            webcChatOpenPaintedT: painted,
            webcChatOpenT: painted + randInt(10, 200),
            webcRenderedMessageCount: rendered,
            webcFinalRenderedMessageCount: rendered
        })
    }

    private emitImageOpen(isLid: boolean): void {
        if (!this.canEmit()) return
        this.coordinator.commit('UiAction', {
            uiActionType: 'IMAGE_OPEN',
            uiActionPreloaded: true,
            isLid,
            uiActionT: randInt(60, 600)
        })
    }

    private canEmit(): boolean {
        return !this.disposed && this.withinActiveHours()
    }

    private withinActiveHours(): boolean {
        if (this.activeStartHour === undefined || this.activeEndHour === undefined) return true
        const hour = new Date().getHours()
        return this.activeStartHour <= this.activeEndHour
            ? hour >= this.activeStartHour && hour < this.activeEndHour
            : hour >= this.activeStartHour || hour < this.activeEndHour
    }

    private rememberChat(isLid: boolean): void {
        this.recentChatIsLid.push(isLid)
        if (this.recentChatIsLid.length > RECENT_CHATS) this.recentChatIsLid.shift()
    }

    private emit(payload: WaWamEventArgs<'UiAction'>): void {
        if (this.canEmit()) this.coordinator.commit('UiAction', payload)
    }

    private schedule(delayMs: number, fn: () => void): void {
        if (this.disposed) return
        const timer = setTimeout(() => {
            this.timers.delete(timer)
            if (!this.disposed) fn()
        }, delayMs)
        timer.unref?.()
        this.timers.add(timer)
    }

    /** Cancels all pending timers and detaches subscriptions. */
    dispose(): void {
        this.disposed = true
        for (const timer of this.timers) clearTimeout(timer)
        this.timers.clear()
        for (let i = this.unsubscribes.length - 1; i >= 0; i -= 1) this.unsubscribes[i]()
        this.unsubscribes.length = 0
    }
}
