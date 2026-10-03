import type {
    WaCallMediaEvent,
    WaCallMediaMessage,
    WaCallMediaPlanUpdate
} from '@zapo-js/voip-media'

import type { WaCallMediaLink, WaCallMediaLinkEvents } from '../media-link.js'
import type { WaCallMediaSessionDelegate } from '../WaCallMediaSession.js'

/**
 * A session delegate whose callbacks do nothing, for the tests that only need
 * the session to have one. Pass the callbacks the test actually watches and
 * the rest stay silent, so what a test observes is the only thing it spells
 * out - and a new delegate method lands here instead of in every file.
 */
export function createSessionDelegate(
    watched: Partial<WaCallMediaSessionDelegate> = {}
): WaCallMediaSessionDelegate {
    return {
        emitState: () => {},
        emitIncoming: () => {},
        emitEnded: () => {},
        emitInboundAudio: () => {},
        emitInboundVideoRtp: () => {},
        emitInboundVideo: () => {},
        emitOutboundAudioFinished: () => {},
        emitPeerMute: () => {},
        emitHandRaise: () => {},
        emitScreenShare: () => {},
        emitPeerVideoState: () => {},
        endCall: () => {},
        ...watched
    }
}

/** A media link that records every plan change in order and replays media events on demand. */
export class RecordingMediaLink implements WaCallMediaLink {
    readonly updates: WaCallMediaPlanUpdate[] = []
    events!: WaCallMediaLinkEvents
    started = false
    stopped = false

    /** The plan as every update so far leaves it, later sections replacing earlier ones. */
    get plan(): WaCallMediaPlanUpdate {
        return Object.assign({}, ...this.updates) as WaCallMediaPlanUpdate
    }

    /** The updates that carried `section`, in the order they were published. */
    sections<K extends keyof WaCallMediaPlanUpdate>(section: K): WaCallMediaPlanUpdate[K][] {
        return this.updates.filter((update) => section in update).map((update) => update[section])
    }

    start(): Promise<void> {
        this.started = true
        return Promise.resolve()
    }

    apply(update: WaCallMediaPlanUpdate): Promise<void> {
        this.updates.push(update)
        return Promise.resolve()
    }

    stop(): void {
        this.stopped = true
    }

    sendReaction(): boolean {
        return false
    }

    sendVideoFrame(): number {
        return 0
    }

    loadAudio(): Promise<void> {
        return Promise.resolve()
    }

    setExternalAudioMode(): void {}

    feedLiveAudio(): number {
        return 0
    }

    getLiveBufferMs(): number {
        return 0
    }

    handleEvent(_event: WaCallMediaEvent): void {}

    snapshot(): WaCallMediaMessage | null {
        return null
    }
}

/** A recording link and the factory a session takes it through. */
export function recordMediaLink(): {
    readonly link: RecordingMediaLink
    readonly createMediaLink: (events: WaCallMediaLinkEvents) => WaCallMediaLink
} {
    const link = new RecordingMediaLink()
    return {
        link,
        createMediaLink: (events) => {
            link.events = events
            return link
        }
    }
}
