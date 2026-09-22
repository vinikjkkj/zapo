import { createNoopLogger, type Logger } from 'zapo-js'
import { type BinaryNode, findNodeChild, getNodeChildren } from 'zapo-js/transport'
import { base64ToBytes, toError } from 'zapo-js/util'

import { TEXT_DECODER } from '../bytes.js'

/** Name of the node the server attaches to the offer with the call configuration. */
const VOIP_SETTINGS_TAG = 'voip_settings'

/**
 * The only value ever observed in the node attribute of the same name. Any
 * other value marks a variant whose format this client has no sample to decode.
 */
const UNCOMPRESSED_ATTR = 'uncompressed'

/** The video rate-control section, where the video RTCP gates live. */
const VIDEO_RATE_CONTROL_SECTION = 'vid_rc'

/**
 * The audio rate-control section (`audio_nack_*`, `dtx`, `mlow_*`,
 * `target_bitrate`), where the RTCP interval lives.
 */
const RATE_CONTROL_SECTION = 'rc'

/** The gate that turns RTCP REMB off for this call. */
const DISABLE_RTCP_REMB_KEY = 'disable_rtcp_remb'

/** The interval between RTCP reports, in milliseconds. */
const RTCP_INTERVAL_MS_KEY = 'rtcp_interval_ms'

/** `{`, the first character of a payload that already arrived as plain JSON. */
const OPEN_BRACE = 0x7b

const SPACE = 0x20
const TAB = 0x09
const LINE_FEED = 0x0a
const CARRIAGE_RETURN = 0x0d

/**
 * Tells whether the text opens a JSON object, skipping leading whitespace. It
 * separates content that already arrived as JSON from content that arrived as
 * base64, without copying the 34 KB just to look at the first character.
 */
function looksLikeJsonObject(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i)
        if (code === SPACE || code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN) {
            continue
        }
        return code === OPEN_BRACE
    }
    return false
}

/**
 * The boolean behind the raw value. Every JSON value arrives as a string, and
 * the forms that actually show up are `"1"`, `"0"`, `"true"` and `"false"`. A
 * value of another type, or outside those forms, returns `null`, and the caller
 * applies the default instead of deciding by guesswork.
 */
function toFlag(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value !== 0 : null
    if (typeof value !== 'string') return null

    const text = value.trim().toLowerCase()
    if (text === '1' || text === 'true') return true
    if (text === '0' || text === 'false') return false
    return null
}

/**
 * The number behind the raw value, under the same rule as the boolean: an empty
 * string, non-numeric text and an unexpected type all return `null`, never
 * `NaN` and never the zero that `Number('')` would produce.
 */
function toNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value !== 'string') return null

    const text = value.trim()
    if (text.length === 0) return null

    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : null
}

/** One section of the JSON, or `null` when the name does not point at an object. */
function toSection(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

/**
 * The configuration the server attaches to every call offer in the
 * `<voip_settings uncompressed='1'>` node, whose content is base64 of a JSON
 * document tens of KB long. It is the server telling this session how to
 * behave, per call.
 *
 * The node has two profiles, and the media type of the offer is what picks
 * between them. An audio offer, with no `<video>`, carries 20 sections and 510
 * leaf keys; an offer with `<video>` carries 22 sections and 678 leaf keys,
 * about 34 KB. Neither profile is a subset of the other: `rc.rtcp_interval_ms`
 * appears only in the audio one and `vid_rc.disable_rtcp_remb` only in the
 * video one, so every key applied here has to know what to do when the profile
 * at hand does not carry it.
 *
 * Every value arrives as a string, booleans and numbers included: `"1"`, `"0"`,
 * `"true"`, `"false"`, `"35000"`. Normalization happens on read, and a missing
 * key, a missing section or an unexpected type return the default instead of
 * throwing.
 *
 * Out of this catalogue this client applies two keys, and only those two:
 * `vid_rc.disable_rtcp_remb` and {@link rtcpIntervalMs}. All the others stay
 * readable through the generic accessors and change no behavior at all. The
 * whole node being absent has to leave the call exactly as it was before the
 * node existed.
 *
 * Ignoring the node has a measured cost, not a hypothetical one. RTCP REMB was
 * implemented and started going out on every interval while
 * `vid_rc.disable_rtcp_remb` was `"1"` in that very offer: the packet went out
 * correct and the peer did not process it, because the server had turned that
 * feedback transport off. In the same JSON, `vid_rc.minbwe` was 35000, the
 * exact number the peer bitrate kept pinning at, and the one that cost three
 * rounds of investigation to find.
 *
 * The parse runs once, when the offer arrives, and the result is kept on the
 * call. 34 KB of JSON per call is acceptable; per packet it would not be, so a
 * caller reading a gate on a hot path resolves the value once and keeps the
 * boolean.
 */
export class WaVoipSettings {
    private readonly root: Record<string, unknown>

    private constructor(root: Record<string, unknown>) {
        this.root = root
    }

    /**
     * An instance from the already decoded JSON. A root that is not an object
     * returns `null`, the same safe path as an absent node.
     *
     * @throws the `JSON.parse` error when the text is not JSON. The stanza
     * reader calls this from inside a try, logs the message and carries on with
     * the defaults: no failure from here reaches the call.
     */
    static fromJson(text: string): WaVoipSettings | null {
        const root = toSection(JSON.parse(text))
        return root ? new WaVoipSettings(root) : null
    }

    /** How many top-level sections there are, useful for logging only. */
    get sectionCount(): number {
        return Object.keys(this.root).length
    }

    /** The raw leaf value, unnormalized, or `undefined` when it does not exist. */
    private leaf(section: string, key: string): unknown {
        const bucket = toSection(this.root[section])
        return bucket ? bucket[key] : undefined
    }

    /**
     * The boolean gate of the section, or `fallback` when the section, the key
     * or the shape of the value is not there.
     */
    getFlag(section: string, key: string, fallback: boolean): boolean {
        return toFlag(this.leaf(section, key)) ?? fallback
    }

    /**
     * The numeric parameter of the section, or `fallback` when the section, the
     * key or the shape of the value is not there.
     */
    getNumber(section: string, key: string, fallback: number): number {
        return toNumber(this.leaf(section, key)) ?? fallback
    }

    /**
     * The textual value of the section exactly as the server wrote it, or
     * `fallback` when the section, the key or the type is not there. It
     * converts neither number nor boolean into text: a caller that wants the
     * normalized value uses the accessor for that type.
     */
    getText(section: string, key: string, fallback: string | null = null): string | null {
        const value = this.leaf(section, key)
        return typeof value === 'string' ? value : fallback
    }

    /**
     * `vid_rc.disable_rtcp_remb`. When it is `"1"`, the server has turned RTCP
     * REMB off, and a REMB emitted anyway is a packet the peer does not
     * process. When absent, the default is `false` and the behavior stays what
     * it was before this node was ever read.
     */
    get disableRtcpRemb(): boolean {
        return this.getFlag(VIDEO_RATE_CONTROL_SECTION, DISABLE_RTCP_REMB_KEY, false)
    }

    /**
     * `rc.rtcp_interval_ms`: the interval between RTCP reports the server
     * orders this session to use, or `null` to keep the compiled interval. Only
     * a positive number is accepted: a zero would order a report on every
     * packet.
     *
     * The key exists in the audio profile only, where it is `"1500"`. The video
     * profile does not carry it, and a video call runs on the compiled interval
     * of the media session, which today is also 1500 ms. The two numbers
     * matching is a coincidence, not a design: the compiled default came from a
     * call capture, not from this key. Changing it changes the real interval of
     * video calls, and of those only - audio calls switch to whatever arrives
     * here.
     */
    get rtcpIntervalMs(): number | null {
        const value = this.getNumber(RATE_CONTROL_SECTION, RTCP_INTERVAL_MS_KEY, 0)
        return value > 0 ? value : null
    }
}

/** The `<voip_settings>` node on `node` itself, on a child, or on a grandchild. */
function findVoipSettingsNode(node: BinaryNode): BinaryNode | null {
    if (node.tag === VOIP_SETTINGS_TAG) return node

    const direct = findNodeChild(node, VOIP_SETTINGS_TAG)
    if (direct) return direct

    for (const child of getNodeChildren(node)) {
        const nested = findNodeChild(child, VOIP_SETTINGS_TAG)
        if (nested) return nested
    }

    return null
}

/**
 * The JSON text of the node content. The observed content is base64, but the
 * stanza decoder hands over a string sometimes and bytes other times, and a
 * payload that already arrives as JSON is taken as is instead of going through
 * a base64 decode it is not.
 */
function decodeSettingsText(content: BinaryNode['content']): string | null {
    const raw =
        typeof content === 'string'
            ? content
            : content instanceof Uint8Array
              ? TEXT_DECODER.decode(content)
              : null
    if (raw === null) return null
    if (looksLikeJsonObject(raw)) return raw

    const encoded = raw.trim()
    if (encoded.length === 0) return null

    return TEXT_DECODER.decode(base64ToBytes(encoded))
}

/**
 * Reads the `<voip_settings>` out of a call stanza and returns the
 * configuration, or `null` when there is nothing usable in there.
 *
 * No failure from here may bring a call down: an absent node, an unknown
 * variant attribute, corrupted base64, invalid JSON and a root that is not an
 * object all land on the same `null`, and the caller carries on with the
 * compiled defaults. That is half the reason this function exists - the content
 * comes from the server and can change without notice.
 *
 * `uncompressed='1'` is the only value ever seen in the attribute. A different
 * value is a variant with no sample to decode, and the whole node is discarded
 * instead of the format being guessed.
 *
 * @param node the call stanza, its ack, or the `<voip_settings>` node itself.
 * The search covers the node, its children and its grandchildren, so it serves
 * both `<call><offer><voip_settings>` and `<call><voip_settings>`.
 */
export function parseVoipSettings(node: BinaryNode, logger?: Logger): WaVoipSettings | null {
    const log = logger ?? createNoopLogger()

    const settingsNode = findVoipSettingsNode(node)
    if (!settingsNode) return null

    const uncompressed = settingsNode.attrs?.[UNCOMPRESSED_ATTR]
    if (uncompressed !== undefined && toFlag(uncompressed) !== true) {
        log.debug('voip settings variant has no known decoder, ignored', { uncompressed })
        return null
    }

    try {
        const text = decodeSettingsText(settingsNode.content)
        if (text === null) {
            log.debug('voip settings node carries no readable content')
            return null
        }

        const settings = WaVoipSettings.fromJson(text)
        if (!settings) {
            log.debug('voip settings payload is not a json object')
            return null
        }

        return settings
    } catch (err) {
        log.debug('voip settings payload rejected', { message: toError(err).message })
        return null
    }
}
