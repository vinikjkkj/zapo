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
        endCall: () => {},
        ...watched
    }
}
