import type { BinaryNode } from 'zapo-js/transport'
import { tryAsNumber } from 'zapo-js/util'

import { generateCallStanzaId } from './signaling.js'

/**
 * `screenshare_state`. `NotSupported` and `Failed` both close a request without
 * announcing a stream: the peer cannot share at all, or a share did not start.
 */
export const WA_SCREEN_SHARE_STATE = Object.freeze({
    NotSupported: 0,
    Started: 1,
    Stopped: 2,
    Failed: 3
} as const)

/**
 * `version`: what decides whether a share is a **second** video stream or a replacement
 * for the camera. Up to `V2` the screen is the call's one video stream and the camera is
 * forced off; from `V3` the sharer runs both at once. `Invalid` is negative on purpose -
 * the client's own sentinel for "no version", not a version that can travel.
 */
export const WA_SCREEN_SHARE_VERSION = Object.freeze({
    Invalid: -1,
    Legacy: 0,
    V1: 1,
    V2: 2,
    V3: 3,
    V4: 4
} as const)

/**
 * The version this package announces when it starts a share of its own.
 *
 * `V2` is a claim about the layout actually produced: one video sender, the screen riding
 * the camera's own SSRC. Raising it without also moving to the `_ss` SSRCs and emitting
 * the screen-share descriptor puts the stream on an SSRC the peer does not expect for
 * that version, and it is dropped with nothing visible on either side.
 *
 * **Not confirmed on the wire**, read off the client's code.
 */
export const WA_SCREEN_SHARE_SEND_VERSION = WA_SCREEN_SHARE_VERSION.V2

/**
 * Screen-share state a peer reported. Every field is independently optional on the wire,
 * so each is `null` when absent, and numbers are kept raw so a `state` or `version` this
 * client does not model yet still reaches the caller.
 */
export interface PeerScreenShare {
    /** `screenshare_state`, one of {@link WA_SCREEN_SHARE_STATE}. */
    readonly state: number | null
    /** `request-state`: what the peer is *asking* for, not what is in effect. */
    readonly requestState: number | null
    /** `version`, one of {@link WA_SCREEN_SHARE_VERSION}. */
    readonly version: number | null
    /** `screen_width` of the shared surface, in pixels. */
    readonly screenWidth: number | null
    /** `screen_height` of the shared surface, in pixels. */
    readonly screenHeight: number | null
    /** `device_orientation` of the sharer, 0 to 3. */
    readonly deviceOrientation: number | null
}

/**
 * Reads the screen-share state out of the payload child of a `<call>` stanza. Both
 * carriers are accepted - `screen_share` negotiates, `screen` adds geometry - and
 * `request-state` under either spelling, because the peer's deserializer takes both.
 * Returns `null` when the node carries neither a state nor a request.
 */
export function parseScreenShareNode(node: BinaryNode): PeerScreenShare | null {
    const attrs = node.attrs ?? {}

    const state = tryAsNumber(attrs.screenshare_state)
    const requestState = tryAsNumber(attrs['request-state'] ?? attrs.request_state)
    if (state === null && requestState === null) return null

    return {
        state,
        requestState,
        version: tryAsNumber(attrs.version),
        screenWidth: tryAsNumber(attrs.screen_width),
        screenHeight: tryAsNumber(attrs.screen_height),
        deviceOrientation: tryAsNumber(attrs.device_orientation)
    }
}

/**
 * Builds the `<call><screen_share>` that asks the peer to start or stop rendering a share
 * of ours. A request: the peer's handler refuses one in a group call, or before the call
 * is up.
 *
 * Four attributes wide and no more - no codec, no geometry, measured on the wire. The
 * version is not a parameter but a claim about the layout this package produces, see
 * {@link WA_SCREEN_SHARE_SEND_VERSION}. Nothing here waits for a reply.
 */
export function buildScreenShareStanza(
    peerDeviceJid: string,
    callId: string,
    callCreator: string,
    screenShareState: number
): BinaryNode {
    return {
        tag: 'call',
        attrs: { to: peerDeviceJid, id: generateCallStanzaId() },
        content: [
            {
                tag: 'screen_share',
                attrs: {
                    'call-id': callId,
                    'call-creator': callCreator,
                    screenshare_state: String(screenShareState),
                    version: String(WA_SCREEN_SHARE_SEND_VERSION)
                }
            }
        ]
    }
}
