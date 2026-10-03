import type * as Wrtc from '@roamhq/wrtc'

type WrtcModule = typeof Wrtc

let wrtcModule: Promise<WrtcModule> | null = null

/** Loads `@roamhq/wrtc` lazily, so only a process that dials a relay loads the native addon. */
function loadWrtc(): Promise<WrtcModule> {
    if (!wrtcModule) {
        wrtcModule = import('@roamhq/wrtc')
            .then((mod) => (mod as { default?: WrtcModule }).default ?? mod)
            .catch((err: unknown) => {
                wrtcModule = null
                throw err
            })
    }
    return wrtcModule
}

/** Builds a relay leg's peer connection on `@roamhq/wrtc`. */
export async function createWrtcPeerConnection(
    configuration: RTCConfiguration
): Promise<RTCPeerConnection> {
    const wrtc = await loadWrtc()
    return new wrtc.RTCPeerConnection(configuration)
}
