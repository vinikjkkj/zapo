import type { Logger } from 'zapo-js'

import { WA_VIDEO_QUALITY, type WaCallMediaVideoSubscription } from '@zapo-js/voip-media'

import { WA_VIDEO_STATE } from '../signaling/video-state.js'
import type { CallVideoSubscription } from '../types.js'

import { toAddressedJid } from './call-jids.js'
import type { CallInfo } from './call-state.js'
import { selectVideoSubscriptions } from './group-media-plan.js'
import { WA_CALL_PARTICIPANT_STATE } from './group-participants.js'
import { samePlanValue } from './media-plan.js'

/** Least time between two changes of the video subscriptions. */
const VIDEO_SUBSCRIPTION_MIN_INTERVAL_MS = 2_000

export interface WaGroupVideoSubscriptionsOptions {
    readonly info: CallInfo
    readonly logger: Logger
    readonly now: () => number
    /** The subscriptions changed: the group plan is to be published again. */
    readonly onChange: () => void
}

/** Whose video a group call asks the SFU for, the policy's or the app's, changed at most every 2 s. */
export class WaGroupVideoSubscriptions {
    private readonly info: CallInfo
    private readonly logger: Logger
    private readonly now: () => number
    private readonly onChange: () => void
    /** Video subscriptions the app set, in place of the policy's; `null` for the policy. */
    private videoSubscriptionOverride: readonly WaCallMediaVideoSubscription[] | null = null
    private videoSubscriptions: readonly WaCallMediaVideoSubscription[] = []
    private videoSubscriptionsChangedAt: number | null = null
    private videoSubscriptionTimer: ReturnType<typeof setTimeout> | null = null

    constructor(options: WaGroupVideoSubscriptionsOptions) {
        this.info = options.info
        this.logger = options.logger
        this.now = options.now
        this.onChange = options.onChange
    }

    /** The subscriptions as last changed, which the group section carries. */
    get current(): readonly WaCallMediaVideoSubscription[] {
        return this.videoSubscriptions
    }

    /** Takes the app's subscriptions in place of the policy's; `null` hands it back. */
    set(subscriptions: readonly CallVideoSubscription[] | null): void {
        this.videoSubscriptionOverride =
            subscriptions === null
                ? null
                : subscriptions.flatMap((subscription) => {
                      const senderId = this.info.participantMedia.get(
                          toAddressedJid(subscription.participantJid, this.logger)
                      )?.senderId
                      return senderId
                          ? [
                                {
                                    senderId,
                                    quality: subscription.quality ?? WA_VIDEO_QUALITY.Default
                                }
                            ]
                          : []
                  })
        this.refresh()
    }

    /** Recomputes the video subscriptions, at most once per {@link VIDEO_SUBSCRIPTION_MIN_INTERVAL_MS}. */
    refresh(): void {
        if (!this.info.isGroupCall || this.videoSubscriptionTimer) return
        const next = this.videoSubscriptionOverride ?? this.policyVideoSubscriptions()
        if (samePlanValue(next, this.videoSubscriptions)) return

        const since =
            this.videoSubscriptionsChangedAt === null
                ? Infinity
                : this.now() - this.videoSubscriptionsChangedAt
        if (since < VIDEO_SUBSCRIPTION_MIN_INTERVAL_MS) {
            this.videoSubscriptionTimer = setTimeout(() => {
                this.videoSubscriptionTimer = null
                this.refresh()
            }, VIDEO_SUBSCRIPTION_MIN_INTERVAL_MS - since)
            this.videoSubscriptionTimer.unref?.()
            return
        }

        this.videoSubscriptions = next
        this.videoSubscriptionsChangedAt = this.now()
        this.logger.debug('video subscriptions changed', {
            callId: this.info.callId,
            subscriptions: next.length
        })
        this.onChange()
    }

    /** Drops a pending change; the call is over. */
    stop(): void {
        if (this.videoSubscriptionTimer) clearTimeout(this.videoSubscriptionTimer)
        this.videoSubscriptionTimer = null
    }

    private policyVideoSubscriptions(): WaCallMediaVideoSubscription[] {
        const connected = (this.info.groupComposition?.participants ?? []).filter(
            (participant) => participant.state === WA_CALL_PARTICIPANT_STATE.Connected
        ).length
        const senders: { senderId: string; videoEnabled: boolean }[] = []
        for (const [senderId, deviceJid] of this.info.groupSenders) {
            const state = this.info.participantMedia.get(deviceJid)?.video?.state
            senders.push({ senderId, videoEnabled: state === WA_VIDEO_STATE.Enabled })
        }
        return selectVideoSubscriptions(senders, connected)
    }
}
