import type { WaWamEventArgs } from '@vinikjkkj/wa-wam'
import type { BinaryNode, WaClientPluginContext, WaIncomingMessageEvent } from 'zapo-js'
import { isGroupJid, isLidJid, WA_ADDRESSING_MODES, WA_MESSAGE_TAGS } from 'zapo-js/protocol'

import { findFirstEncNode, mediaTypeKey, type WamMediaTypeKey } from '../send-parse.js'
import type { WaWamCoordinator } from '../WaWamCoordinator.js'

import { AMBIENT_FABS, type FabSession } from './fabrications.js'
import { rand, randB64, randBase36, randInt, randUuid } from './random.js'

type Ctx = Pick<WaClientPluginContext, 'on' | 'off'>

/** Minimum spacing between fabricated chat opens, so inbound bursts don't imply an implausible click rate. */
const MESSAGE_OPEN_MIN_GAP_MS = 20_000
/** Info-drawer opens (group/channel/msg info) are rare interactions; keep them well spaced. */
const INFO_OPEN_MIN_GAP_MS = 180_000
/** Viewing a contact's About is occasional; keep the fabricated views well spaced. */
const ABOUT_MIN_GAP_MS = 120_000
/** How many recent chats' addressing to keep for the ambient re-open stream. */
const RECENT_CHATS = 12
/** Emoji-picker tabs WA Web reports for WebcEmojiOpen. */
const EMOJI_TABS = ['EMOJI', 'GIF', 'STICKER'] as const
/** One time-spent activity slice; a bit is set per slice the session saw traffic. */
const ACTIVITY_SLICE_MS = 60_000
/** Slices per UserActivity flush, and the cap WA Web's 2x32-bit bitmap holds. */
const ACTIVITY_FLUSH_SLICES = 5
const ACTIVITY_MAX_SLICES = 64

export interface WaWamSyntheticUiOptions {
    /** Chance a given inbound message fabricates a CHAT_OPEN (default 0.25). */
    readonly chatOpenProbability?: number
    /** Chance an inbound image additionally fabricates an IMAGE_OPEN (default 0.3). */
    readonly imageOpenProbability?: number
    /** Chance an inbound audio fabricates a WebcMediaLoad playback load (default 0.3). */
    readonly audioLoadProbability?: number
    /** Chance an event fabricates an info-drawer open (group/channel/msg info) (default 0.05). */
    readonly infoOpenProbability?: number
    /** Chance an outbound media message fabricates an AttachmentTrayActions send (default 0.4). */
    readonly attachmentTrayProbability?: number
    /** Chance a 1:1 inbound message fabricates an AboutConsumption (profile-About view) (default 0.06). */
    readonly aboutConsumptionProbability?: number
    /** Ambient (idle-checking) re-open interval bounds in ms (default 5-25min). */
    readonly ambientIntervalMinMs?: number
    readonly ambientIntervalMaxMs?: number
    /** MemoryStat sample interval bounds in ms (default 2-5min). */
    readonly memoryIntervalMinMs?: number
    readonly memoryIntervalMaxMs?: number
    /**
     * Local-time hour window [start, end) outside which nothing is fabricated, so
     * the profile does not show 4am activity. Both required to take effect; a
     * start > end spans midnight. Default: unset (fabricate around the clock).
     */
    readonly activeHoursStartHour?: number
    readonly activeHoursEndHour?: number
    /**
     * Capability gates for context-specific ambient events, all default `false`.
     * Enable only when the session genuinely has that surface — firing a
     * channel/community/business event on an account that lacks it is a tell.
     */
    readonly channels?: boolean
    readonly communities?: boolean
    readonly business?: boolean
}

const clampProbability = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback

const clampInterval = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback

type AttachmentTarget = 'GALLERY' | 'DOCUMENT' | 'AUDIO' | 'CONTACT' | 'LOCATION'

/** ATTACHMENT_TRAY_ACTION_TARGET for an outbound media type; null for sticker/gif (emoji panel, not the tray). */
function attachmentTargetFor(media: WamMediaTypeKey): AttachmentTarget | null {
    switch (media) {
        case 'PHOTO':
        case 'VIDEO':
            return 'GALLERY'
        case 'DOCUMENT':
            return 'DOCUMENT'
        case 'AUDIO':
        case 'PTT':
            return 'AUDIO'
        case 'CONTACT':
            return 'CONTACT'
        case 'LOCATION':
            return 'LOCATION'
        default:
            return null
    }
}

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
    private readonly audioLoadProbability: number
    private readonly infoOpenProbability: number
    private readonly attachmentTrayProbability: number
    private readonly aboutConsumptionProbability: number
    private readonly gates: Record<'channels' | 'communities' | 'business', boolean>
    private readonly session: FabSession
    private readonly ambientMinMs: number
    private readonly ambientMaxMs: number
    private readonly memoryMinMs: number
    private readonly memoryMaxMs: number
    private readonly activeStartHour: number | undefined
    private readonly activeEndHour: number | undefined
    private readonly windowHeightFloat = randInt(680, 1040)
    private readonly sessionStartMs = Date.now()
    private readonly unifiedSessionId = String(randInt(1, 2_000_000_000))
    private readonly appSessionId = randUuid()
    private readonly gifProvider: 'TENOR' | 'GIPHY' = Math.random() < 0.75 ? 'TENOR' : 'GIPHY'
    /** Weighted ambient-fabrication table; one entry is picked per ambient tick. Gated events are only present when their capability flag is on. */
    private readonly ambientSpecs: Array<{ readonly w: number; readonly emit: () => void }> = []
    private activitySessionId = randBase36(6)
    private tsSessionId = randInt(1, 2_000_000_000)
    private activityStartMs = Date.now()
    private lastOpenMs = 0
    private lastInfoOpenMs = 0
    private lastAboutMs = 0
    private memCurrentKb = randInt(50_000, 90_000)
    private memPeakKb = 0
    private messagesSeen = 0
    private activitySlice = 0
    private activitySeq = 0
    private activeSliceCount = 0
    private bitmapLow = 0
    private bitmapHigh = 0
    private sliceActive = false
    private disposed = false

    constructor(
        private readonly coordinator: WaWamCoordinator,
        ctx: Ctx,
        options: WaWamSyntheticUiOptions = {}
    ) {
        this.chatOpenProbability = clampProbability(options.chatOpenProbability, 0.25)
        this.imageOpenProbability = clampProbability(options.imageOpenProbability, 0.3)
        this.audioLoadProbability = clampProbability(options.audioLoadProbability, 0.3)
        this.infoOpenProbability = clampProbability(options.infoOpenProbability, 0.05)
        this.attachmentTrayProbability = clampProbability(options.attachmentTrayProbability, 0.4)
        this.aboutConsumptionProbability = clampProbability(
            options.aboutConsumptionProbability,
            0.06
        )
        this.ambientMinMs = clampInterval(options.ambientIntervalMinMs, 5 * 60_000)
        this.ambientMaxMs = clampInterval(options.ambientIntervalMaxMs, 25 * 60_000)
        this.memoryMinMs = clampInterval(options.memoryIntervalMinMs, 2 * 60_000)
        this.memoryMaxMs = clampInterval(options.memoryIntervalMaxMs, 5 * 60_000)
        this.activeStartHour = options.activeHoursStartHour
        this.activeEndHour = options.activeHoursEndHour
        this.gates = {
            channels: options.channels === true,
            communities: options.communities === true,
            business: options.business === true
        }
        this.session = {
            unifiedSessionId: this.unifiedSessionId,
            appSessionId: this.appSessionId,
            gifProvider: this.gifProvider
        }
        this.registerAmbientSpecs()
        const onMessage = (event: WaIncomingMessageEvent): void => this.onMessage(event)
        const onNodeOut = (event: { readonly node: BinaryNode }): void => this.onNodeOut(event.node)
        ctx.on('message', onMessage)
        ctx.on('debug_transport_node_out', onNodeOut)
        this.unsubscribes.push(
            () => ctx.off('message', onMessage),
            () => ctx.off('debug_transport_node_out', onNodeOut)
        )
        this.scheduleAmbient()
        this.scheduleMemory()
        this.scheduleActivitySlice()
    }

    private onMessage(event: WaIncomingMessageEvent): void {
        if (this.disposed) return
        this.markActivity()
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

        if (event.message?.audioMessage && Math.random() < this.audioLoadProbability) {
            this.schedule(rand(1000, 8000), () => this.emitMediaLoad())
        }

        if (
            !key.isGroup &&
            !key.isNewsletter &&
            Math.random() < this.aboutConsumptionProbability &&
            now - this.lastAboutMs >= ABOUT_MIN_GAP_MS
        ) {
            this.lastAboutMs = now
            this.schedule(rand(2000, 40_000), () => this.emitAboutConsumption())
        }

        const msg = event.message
        if (msg?.videoMessage && Math.random() < 0.3) {
            this.schedule(rand(1500, 20_000), () => this.emitMediaStreamPlayback())
        }
        if (key.isGroup === true && Math.random() < 0.05) {
            this.schedule(rand(2000, 30_000), () => this.emitGroupCatchUp())
        }
        const linkUrl = msg?.extendedTextMessage?.matchedText
        if (linkUrl && /youtu/i.test(linkUrl) && Math.random() < 0.4) {
            this.schedule(rand(3000, 60_000), () =>
                this.emitInlineVideoClosed(key.isGroup === true)
            )
        }
        if (
            this.gates.business &&
            (msg?.buttonsMessage ?? msg?.interactiveMessage ?? msg?.templateMessage) &&
            Math.random() < 0.25
        ) {
            this.schedule(rand(2000, 30_000), () => this.emitStructuredMessageBuyerInteraction())
        }
    }

    private emitAboutConsumption(): void {
        if (!this.canEmit()) return
        const aboutConsumptionSurface = Math.random() < 0.5 ? 'ONE_ON_ONE_CHAT' : 'PROFILE_INFO'
        this.coordinator.commit('AboutConsumption', { aboutConsumptionSurface })
        if (Math.random() < 0.35) {
            this.coordinator.commit('AboutInteraction', { aboutConsumptionSurface })
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
        if (this.disposed || node.tag !== WA_MESSAGE_TAGS.MESSAGE) return
        this.markActivity()
        const to = node.attrs.to ?? ''
        const isLid = isLidJid(to) || node.attrs.addressing_mode === WA_ADDRESSING_MODES.LID

        const enc = findFirstEncNode(node)
        const media = enc !== null ? mediaTypeKey(enc.attrs.mediatype) : null
        if (media !== null && Math.random() < this.attachmentTrayProbability) {
            this.schedule(rand(1000, 12_000), () => this.emitAttachmentTray(media, to))
        }

        if (media !== null) {
            const isPhotoVideo = media === 'PHOTO' || media === 'VIDEO'
            if ((isPhotoVideo || media === 'DOCUMENT') && Math.random() < 0.35) {
                this.schedule(rand(1500, 15_000), () => this.emitMediaPicker(media, to))
            }
            if (isPhotoVideo && Math.random() < 0.3) {
                this.schedule(rand(1000, 12_000), () => this.emitMediaEditorSend())
            }
            if (isPhotoVideo && Math.random() < 0.12) {
                this.schedule(rand(800, 8000), () => this.emitHdMediaAwareness())
            }
        } else if (enc !== null && Math.random() < 0.04) {
            this.schedule(rand(2000, 30_000), () => this.emitTextMessageUserJourney(isGroupJid(to)))
        }
        if (isGroupJid(to) && Math.random() < 0.07) {
            this.schedule(rand(1500, 20_000), () => this.emitMentionPickerAction())
        }

        if (this.infoOpenAllowed()) {
            this.schedule(rand(3000, 120_000), () =>
                this.emit({
                    uiActionType: 'MSG_INFO_OPEN',
                    uiActionPreloaded: true,
                    isLid,
                    uiActionT: randInt(40, 400)
                })
            )
        }
    }

    private emitAttachmentTray(media: WamMediaTypeKey, to: string): void {
        if (!this.canEmit()) return
        const target = attachmentTargetFor(media)
        if (target === null) return
        const isGroup = isGroupJid(to)
        this.coordinator.commit('AttachmentTrayActions', {
            attachmentTrayAction: 'SEND',
            attachmentTrayActionTarget: target,
            actionThreadType: isGroup ? 'GROUP_CHAT' : 'P2P_THREAD',
            isAGroup: isGroup,
            isSuccessful: true,
            actionDurationMs: randInt(1500, 20_000),
            sendTime: randInt(200, 4000),
            ...(media === 'PHOTO' || media === 'VIDEO' ? { sendMediaType: media } : {})
        })
    }

    private markActivity(): void {
        if (!this.canEmit()) return
        this.sliceActive = true
        this.messagesSeen += 1
    }

    private scheduleMemory(): void {
        this.schedule(rand(this.memoryMinMs, this.memoryMaxMs), () => {
            this.emitMemoryStat()
            this.scheduleMemory()
        })
    }

    private emitMemoryStat(): void {
        if (!this.canEmit()) return
        this.memCurrentKb = Math.max(
            40_000,
            Math.min(180_000, this.memCurrentKb + randInt(-4000, 6000))
        )
        this.memPeakKb = Math.max(this.memPeakKb, this.memCurrentKb)
        this.coordinator.commit('MemoryStat', {
            workingSetSize: this.memCurrentKb,
            workingSetPeakSize: this.memPeakKb,
            uptime: Math.round((Date.now() - this.sessionStartMs) / 1000),
            numMessages: this.messagesSeen,
            processType: 'main'
        })
    }

    private scheduleActivitySlice(): void {
        this.schedule(ACTIVITY_SLICE_MS, () => {
            this.recordActivitySlice()
            this.scheduleActivitySlice()
        })
    }

    private recordActivitySlice(): void {
        if (this.sliceActive) {
            const i = this.activitySlice
            if (i < 32) this.bitmapLow = (this.bitmapLow | (1 << i)) >>> 0
            else this.bitmapHigh = (this.bitmapHigh | (1 << (i - 32))) >>> 0
            this.activeSliceCount += 1
        }
        this.activitySlice += 1
        this.sliceActive = false
        if (this.activitySlice >= ACTIVITY_MAX_SLICES) {
            this.emitUserActivity()
            this.resetActivityWindow()
        } else if (this.activitySlice % ACTIVITY_FLUSH_SLICES === 0) {
            this.emitUserActivity()
        }
    }

    /** Rolls to a fresh activity session once the bitmap fills, mirroring WA Web's per-session time-spent windows instead of going silent at the cap. */
    private resetActivityWindow(): void {
        this.bitmapLow = 0
        this.bitmapHigh = 0
        this.activitySlice = 0
        this.activeSliceCount = 0
        this.activitySeq = 0
        this.activitySessionId = randBase36(6)
        this.tsSessionId = randInt(1, 2_000_000_000)
        this.activityStartMs = Date.now()
    }

    private emitUserActivity(): void {
        if (!this.canEmit() || this.activitySlice === 0) return
        this.activitySeq += 1
        const len = Math.min(this.activitySlice, ACTIVITY_MAX_SLICES)
        this.coordinator.commit('UserActivity', {
            userActivitySessionId: this.activitySessionId,
            userActivityStartTime: Math.floor(this.activityStartMs / 1000),
            userActivityBitmapLen: len,
            userActivityBitmapLow: this.bitmapLow,
            userActivitySessionSeq: this.activitySeq,
            userActivitySessionCum: this.activeSliceCount,
            ...(len > 32 ? { userActivityBitmapHigh: this.bitmapHigh } : {})
        })
        this.coordinator.commit('TsBitArray', {
            tsSessionId: this.tsSessionId,
            bitarrayLength: len,
            bitarrayLow: this.bitmapLow,
            cumulativeBits: this.activeSliceCount,
            sessionSeq: this.activitySeq,
            relativeTimestampMs: Math.max(0, Date.now() - this.sessionStartMs),
            tsTimestampMs: Date.now(),
            unifiedSessionId: this.unifiedSessionId,
            ...(len > 32 ? { bitarrayHigh: this.bitmapHigh } : {})
        })
    }

    private scheduleAmbient(): void {
        this.schedule(rand(this.ambientMinMs, this.ambientMaxMs), () => {
            this.pickAmbient()
            this.scheduleAmbient()
        })
    }

    /** Picks one ambient fabrication from the weighted table and fires it, keeping the aggregate ambient rate constant while adding variety. */
    private pickAmbient(): void {
        const specs = this.ambientSpecs
        if (specs.length === 0) return
        let total = 0
        for (const s of specs) total += s.w
        let r = Math.random() * total
        for (const s of specs) {
            r -= s.w
            if (r < 0) {
                s.emit()
                return
            }
        }
    }

    /** Ambient re-open of a recent chat (the high-weight default ambient action). */
    private emitChatOpenAmbient(): void {
        const isLid = this.recentChatIsLid[randInt(0, this.recentChatIsLid.length)]
        if (isLid !== undefined) this.emitChatOpen(isLid)
    }

    /**
     * Registers the weighted ambient table: the base UI-open actions plus every
     * wa-web-grounded synthetic event. Capability-gated events (channel/community/
     * business) are only added when their flag is on, so they never fire on an
     * account that lacks the surface. Weights follow cadence (common ≫ occasional ≫ rare).
     */
    private registerAmbientSpecs(): void {
        const add = (w: number, emit: () => void): void => {
            this.ambientSpecs.push({ w, emit })
        }
        add(40, () => this.emitChatOpenAmbient())
        add(5, () => this.emitEmojiOpen())
        add(3, () => this.emitStickerPickerOpened())
        add(4, () => this.emitContactSearch())
        add(3, () => this.emitTsNavigation())
        add(1, () => this.emitDisappearingModeSetting())
        add(3, () => this.emitGifSearchSession())
        add(8, () => this.emitMessageContextMenu())
        for (const fab of AMBIENT_FABS) {
            if (fab.gate !== undefined && !this.gates[fab.gate]) continue
            add(fab.weight, () => fab.emit(this.coordinator, this.session))
        }
    }

    private emitEmojiOpen(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('WebcEmojiOpen', {
            webcEmojiOpenTab: EMOJI_TABS[randInt(0, EMOJI_TABS.length)]
        })
    }

    /** Sticker-picker open: a fieldless UI-open marker, like the emoji-picker open. */
    private emitStickerPickerOpened(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('StickerPickerOpened', {})
    }

    private emitContactSearch(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('ContactSearchExperience', {
            contactSearchEntrypoint: 'CHATS_LIST_GLOBAL_SEARCH',
            searchActionName: Math.random() < 0.6 ? 'SEARCH_START' : 'CLICK_ON_CONTACT',
            isUsernameSearch: false,
            searchStartsWithAt: false
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

    private emitDisappearingModeSetting(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('DisappearingModeSettingEvents', {
            disappearingModeSettingEventName: 'DEFAULT_MESSAGE_TIMER_OPEN',
            disappearingModeEntryPoint: 'ACCOUNT_SETTINGS',
            isAfterRead: false
        })
        this.schedule(rand(2000, 30_000), () => {
            if (!this.canEmit()) return
            this.coordinator.commit('DisappearingModeSettingEvents', {
                disappearingModeSettingEventName: 'DEFAULT_MESSAGE_TIMER_EXIT',
                disappearingModeEntryPoint: 'ACCOUNT_SETTINGS',
                isAfterRead: false
            })
        })
    }

    private emitGifSearchSession(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('GifSearchSessionStarted', { gifSearchProvider: this.gifProvider })
        if (Math.random() < 0.2)
            this.schedule(rand(1500, 6000), () => this.emitGifSearchNoResults())
        this.schedule(rand(3000, 20_000), () => this.emitGifSearchCancelled())
    }

    private emitGifSearchCancelled(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('GifSearchCancelled', { gifSearchProvider: this.gifProvider })
    }

    private emitGifSearchNoResults(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('GifSearchNoResults', { gifSearchProvider: this.gifProvider })
    }

    private emitGroupCatchUp(): void {
        if (!this.canEmit()) return
        const pct = Math.random() < 0.8 ? 0 : randInt(1, 5) * 10
        this.coordinator.commit('GroupCatchUp', { mentionsCountPendingPercentage: pct })
    }

    private emitInlineVideoClosed(isGroup: boolean): void {
        if (!this.canEmit()) return
        this.coordinator.commit('InlineVideoPlaybackClosed', {
            inlineVideoType: 'YOUTUBE',
            inlineVideoPlayed: true,
            messageType: isGroup ? 'GROUP' : 'INDIVIDUAL',
            inlineVideoHasRcat: false,
            inlineVideoPlayStartT: randInt(300, 3000),
            inlineVideoDurationT: randInt(45, 600)
        })
    }

    private emitMediaPicker(media: WamMediaTypeKey, to: string): void {
        if (!this.canEmit()) return
        const isDoc = media === 'DOCUMENT'
        this.coordinator.commit('MediaPicker', {
            mediaPickerSent: 1,
            mediaPickerSentUnchanged: 1,
            mediaPickerT: randInt(1500, 15_000),
            mediaType: isDoc ? 'DOCUMENT' : media === 'VIDEO' ? 'VIDEO' : 'PHOTO',
            mediaPickerOrigin: isDoc ? 'DOCUMENT_PICKER' : 'CHAT_PHOTO_LIBRARY',
            mediaPickerChanged: 0,
            mediaPickerCroppedRotated: 0,
            mediaPickerDrawing: 0,
            mediaPickerStickers: 0,
            mediaPickerText: 0,
            mediaPickerLikeDoc: 0,
            mediaPickerNotLikeDoc: 0,
            mediaPickerDeleted: 0,
            chatRecipients: 1,
            isViewOnce: false
        })
    }

    private emitMediaStreamPlayback(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('MediaStreamPlayback', {
            playbackOrigin: 'CONVERSATION',
            mediaType: 'VIDEO',
            didPlay: true,
            playbackState: Math.random() < 0.5 ? 'READY_PAUSE' : 'ENDED',
            videoDuration: randInt(5, 180),
            initialBufferingT: randInt(50, 900)
        })
    }

    private emitMentionPickerAction(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('MentionPickerAction', {
            isAGroup: true,
            mentionType: 'REGULAR_USER',
            threadId: randB64(32)
        })
    }

    private emitMessageContextMenu(): void {
        if (!this.canEmit()) return
        const isAGroup = Math.random() < 0.4
        const isOriginalSender = Math.random() < 0.35
        this.coordinator.commit('MessageContextMenuActions', {
            isAGroup,
            isMultiAction: false,
            isOriginalSender,
            messageContextMenuAction: 'OPEN'
        })
        if (Math.random() < 0.5) {
            const options = ['REACT', 'REPLY', 'COPY', 'FORWARD', 'STAR_OR_UNSTAR'] as const
            this.schedule(rand(400, 3000), () => {
                if (!this.canEmit()) return
                this.coordinator.commit('MessageContextMenuActions', {
                    isAGroup,
                    isMultiAction: false,
                    isOriginalSender,
                    messageContextMenuAction: 'CLICK',
                    messageContextMenuOption: options[randInt(0, options.length)]
                })
            })
        }
    }

    private emitStructuredMessageBuyerInteraction(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('StructuredMessageBuyerInteraction', {
            bizPlatform: 'SMB',
            messageClass: 'BUTTON_NFM',
            messageClassAttributes: '{}',
            messageInteraction: 'USER_VIEW',
            messageMediaType: 'NONE'
        })
    }

    private emitTextMessageUserJourney(isGroup: boolean): void {
        if (!this.canEmit()) return
        this.coordinator.commit('TextMessageUserJourney', {
            appSessionId: this.appSessionId,
            unifiedSessionId: this.unifiedSessionId,
            userJourneyFunnelId: randUuid(),
            uiSurface: isGroup ? 'GROUP_CHAT' : 'CHAT_THREAD',
            textMessageUserJourneyAction: 'SENT',
            userJourneyChatType: isGroup ? 'GROUP' : 'INDIVIDUAL',
            userJourneyEventMs: Date.now(),
            chatbarInitialState: 'EMPTY'
        })
    }

    private emitTsNavigation(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('TsNavigation', {
            tsSessionId: this.tsSessionId,
            relativeTimestampMs: Math.max(0, Date.now() - this.sessionStartMs),
            navigationSource: 'CHAT_LIST',
            navigationDestination: 'CHAT_THREAD',
            navigationDestinationViewName: '',
            isCanonicalEntPresent: true,
            tsTimestampMs: Date.now(),
            unifiedSessionId: this.unifiedSessionId
        })
    }

    private emitMediaEditorSend(): void {
        if (!this.canEmit()) return
        const imageCount = Math.random() < 0.85 ? 1 : 2
        const editedImageCount = Math.random() < 0.25 ? 1 : 0
        const textLayerCount = editedImageCount && Math.random() < 0.6 ? 1 : 0
        const emojiLayerCount = editedImageCount && textLayerCount === 0 ? 1 : 0
        this.coordinator.commit('WebcMediaEditorSend', {
            imageCount,
            editedImageCount,
            paintedImageCount: 0,
            blurImageCount: 0,
            emojiLayerCount,
            stickerLayerCount: 0,
            textLayerCount
        })
    }

    private emitHdMediaAwareness(): void {
        if (!this.canEmit()) return
        this.coordinator.commit('WebHdMediaAwarenessInteraction', {
            hdMediaSelected: Math.random() < 0.5
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

    dispose(): void {
        this.disposed = true
        for (const timer of this.timers) clearTimeout(timer)
        this.timers.clear()
        for (let i = this.unsubscribes.length - 1; i >= 0; i -= 1) this.unsubscribes[i]()
        this.unsubscribes.length = 0
    }
}
