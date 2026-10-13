import { type BinaryNode, findNodeChild } from 'zapo-js/transport'

import { callStanza } from './call-stanza.js'

/**
 * Builds the `<call><mute_v2>` that announces our own microphone state: `mute-state` on
 * `mute_v2` itself, no child node. A statement, not a request - nothing comes back. Asking
 * another participant to mute is {@link buildMuteRequestStanza}.
 */
export function buildMuteV2Stanza(
    peerDeviceJid: string,
    callId: string,
    callCreator: string,
    muted: boolean
): BinaryNode {
    return callStanza(peerDeviceJid, 'mute_v2', callId, callCreator, {
        'mute-state': muted ? '1' : '0'
    })
}

/** `request-state` of a `<mute_v2>` asking its target to mute; the only value seen on the wire. */
export const WA_MUTE_REQUEST_STATE = Object.freeze({ Mute: '1' } as const)

/**
 * Builds the `<call><mute_v2>` that asks one participant of a group call to mute: addressed to
 * its device, `request-state` and no `mute-state`. The target decides, and announces its own
 * `mute-state` if it complies.
 */
export function buildMuteRequestStanza(
    targetDeviceJid: string,
    callId: string,
    callCreator: string,
    requestState: string = WA_MUTE_REQUEST_STATE.Mute
): BinaryNode {
    return callStanza(targetDeviceJid, 'mute_v2', callId, callCreator, {
        'request-state': requestState
    })
}

interface MuteV2Payload {
    /**
     * Microphone state the sender announced through `mute-state`. `null` when absent or
     * unrecognized, so an unknown state is never guessed into a boolean.
     */
    readonly muted: boolean | null
    /** `true` when the stanza carries `request-state`: a request, not an announcement. */
    readonly isRequest: boolean
    /** `request-state` as it arrived, `null` when absent. */
    readonly requestState: string | null
}

/** Reads the state carried by an inbound `<mute_v2>` node. */
export function parseMuteV2(inner: BinaryNode): MuteV2Payload {
    const rawMuteState = inner.attrs?.['mute-state']

    let muted: boolean | null = null
    if (rawMuteState === '1') {
        muted = true
    } else if (rawMuteState === '0') {
        muted = false
    }

    const requestState = inner.attrs?.['request-state'] ?? null
    return { muted, isRequest: requestState !== null, requestState }
}

/** `action` of the `<user_action>`, tag of its state child, and tag of the standalone stanza. */
const RAISE_HAND_ACTION = 'raise_hand'

/** The state attribute in both shapes, always hyphenated. */
const RAISE_HAND_STATE_ATTR = 'raise-hand-state'

/**
 * Builds the `<call><user_action>` announcing the local raise-hand state; lowering writes `'0'`
 * rather than dropping the attribute. `broadcast` is off unless asked for.
 */
export function buildRaiseHandStanza(
    peerDeviceJid: string,
    callId: string,
    callCreator: string,
    raised: boolean,
    broadcast = false
): BinaryNode {
    const attrs: Record<string, string> = { action: RAISE_HAND_ACTION }
    if (broadcast) {
        attrs.broadcast = '1'
    }

    return callStanza(peerDeviceJid, 'user_action', callId, callCreator, attrs, [
        { tag: RAISE_HAND_ACTION, attrs: { [RAISE_HAND_STATE_ATTR]: raised ? '1' : '0' } }
    ])
}

/**
 * Reads the raise-hand state of a `<user_action>` envelope or a standalone `<raise_hand>`;
 * `null` when absent or anything other than `0`/`1`.
 */
export function parseRaiseHandState(node: BinaryNode): boolean | null {
    const stateNode = node.tag === RAISE_HAND_ACTION ? node : findNodeChild(node, RAISE_HAND_ACTION)
    const raw = stateNode?.attrs?.[RAISE_HAND_STATE_ATTR]

    if (raw === '1') return true
    if (raw === '0') return false

    return null
}
