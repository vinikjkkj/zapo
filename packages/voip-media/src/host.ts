import type { WaMediaCrypto } from './crypto/primitives.js'

/** What a host supplies for the media to run on it; `/node` and `/web` each export one. */
export interface WaMediaHost {
    readonly crypto: WaMediaCrypto
    /** Builds the peer connection of each WebRTC relay leg. */
    readonly createPeerConnection: (configuration: RTCConfiguration) => Promise<RTCPeerConnection>
}
