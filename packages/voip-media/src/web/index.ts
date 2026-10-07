import type { WaMediaHost } from '../host.js'

import { webCrypto } from './crypto.js'

export { WA_CALL_AUDIO_WORKLET_SOURCE } from './call-audio-worklet.js'
export { webCrypto } from './crypto.js'
export {
    type WaCallAudioSink,
    WaWebCallAudio,
    type WaWebCallAudioOptions
} from './WaWebCallAudio.js'
export {
    readH264Codec,
    type WaCallVideoSink,
    WaWebCallVideoReceiver,
    type WaWebCallVideoReceiverOptions,
    type WaWebCallVideoReceiverStats,
    WaWebCallVideoSender,
    type WaWebCallVideoSenderOptions,
    type WaWebCallVideoSenderStats
} from './WaWebCallVideo.js'

/**
 * Builds a relay leg's peer connection on the browser's own `RTCPeerConnection`; a
 * configuration the browser refuses rejects the promise.
 */
export function createBrowserPeerConnection(
    configuration: RTCConfiguration
): Promise<RTCPeerConnection> {
    return new Promise((resolve) => resolve(new RTCPeerConnection(configuration)))
}

/** Media in a browser: plain-JS primitives and `RTCPeerConnection`; no raw UDP legs. */
export const webMediaHost: WaMediaHost = Object.freeze({
    crypto: webCrypto,
    createPeerConnection: createBrowserPeerConnection
})
