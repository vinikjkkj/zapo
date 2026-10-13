import { createNoopLogger, type Logger } from 'zapo-js'
import { type BinaryNode, findNodeChild, getNodeChildren } from 'zapo-js/transport'
import { base64ToBytes, TEXT_DECODER, toError, tryAsNumber } from 'zapo-js/util'

const VOIP_SETTINGS_TAG = 'voip_settings'

/** The only known value of this attribute is `1`; any other is a variant with no known decoding. */
const UNCOMPRESSED_ATTR = 'uncompressed'

const VIDEO_RATE_CONTROL_SECTION = 'vid_rc'
const RATE_CONTROL_SECTION = 'rc'
const DISABLE_RTCP_REMB_KEY = 'disable_rtcp_remb'
const RTCP_INTERVAL_MS_KEY = 'rtcp_interval_ms'
const ENCODE_SECTION = 'encode'
const FRAME_MS_KEY = 'frame_ms'
const MAX_FRAMES_PER_PACKET_KEY = 'maxfpp'
const OPTIONS_SECTION = 'options'
const VIDEO_STATE_TXN_RECV_ENFORCE_KEY = 'video_state_txn_id_recv_enforce'
const HEARTBEAT_INTERVAL_KEY = 'heartbeat_interval_s'
const ENABLE_APP_DATA_STREAM_KEY = 'enable_app_data_stream'
const APP_DATA_STREAM_VERSION_KEY = 'app_data_stream_version'
const SFRAME_SECTION = 'sframe'
const ENABLE_SFRAME_KEY = 'enable_sframe'
const ENABLE_SFRAME_RX_KEY = 'enable_sframe_rx'

const OPEN_BRACE = 0x7b

const SPACE = 0x20
const TAB = 0x09
const LINE_FEED = 0x0a
const CARRIAGE_RETURN = 0x0d

/** Whether the text opens a JSON object after leading whitespace, without copying it. */
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

/** `"1"`/`"0"`/`"true"`/`"false"` (or a real boolean or number) as a boolean; anything else is `null`. */
function toFlag(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value !== 0 : null
    if (typeof value !== 'string') return null

    const text = value.trim().toLowerCase()
    if (text === '1' || text === 'true') return true
    if (text === '0' || text === 'false') return false
    return null
}

/** One section of the JSON, or `null` when the name does not point at an object. */
function toSection(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

/**
 * The per-call configuration the server sends in `<voip_settings>`, a JSON document whose values
 * mostly arrive as strings. The typed fields are every key this client applies, read once at
 * parse; a missing section, key or unexpected type reads as the default.
 */
export class WaVoipSettings {
    private readonly root: Record<string, unknown>

    /** `vid_rc.disable_rtcp_remb`: the server turned RTCP REMB off for this call. */
    readonly disableRtcpRemb: boolean
    /** `rc.rtcp_interval_ms`, positive only, else `null`. Only the audio profile carries it. */
    readonly rtcpIntervalMs: number | null
    /** `encode.frame_ms`, the audio frame duration (`60` observed), positive only, else `null`. */
    readonly audioFrameMs: number | null
    /** `rc.maxfpp`, most audio frames per packet (`2` observed), positive only, else `null`. */
    readonly audioMaxFramesPerPacket: number | null
    /** `options.video_state_txn_id_recv_enforce`: inbound `<video>` txn ids are enforced. */
    readonly videoStateTxnRecvEnforce: boolean
    /** `options.heartbeat_interval_s` in milliseconds, positive only, else `null`. */
    readonly heartbeatIntervalMs: number | null
    /** `options.enable_app_data_stream`. */
    readonly appDataStream: boolean
    /** `options.app_data_stream_version`, `0` when absent. */
    readonly appDataStreamVersion: number
    /** `sframe.enable_sframe`. */
    readonly sframe: boolean
    /** `sframe.enable_sframe_rx`. */
    readonly sframeRx: boolean

    private constructor(root: Record<string, unknown>) {
        this.root = root
        this.disableRtcpRemb = this.getFlag(
            VIDEO_RATE_CONTROL_SECTION,
            DISABLE_RTCP_REMB_KEY,
            false
        )
        this.rtcpIntervalMs = this.positiveNumber(RATE_CONTROL_SECTION, RTCP_INTERVAL_MS_KEY)
        this.audioFrameMs = this.positiveNumber(ENCODE_SECTION, FRAME_MS_KEY)
        this.audioMaxFramesPerPacket = this.positiveNumber(
            RATE_CONTROL_SECTION,
            MAX_FRAMES_PER_PACKET_KEY
        )
        this.videoStateTxnRecvEnforce = this.getFlag(
            OPTIONS_SECTION,
            VIDEO_STATE_TXN_RECV_ENFORCE_KEY,
            false
        )
        const heartbeatSeconds = this.positiveNumber(OPTIONS_SECTION, HEARTBEAT_INTERVAL_KEY)
        this.heartbeatIntervalMs = heartbeatSeconds === null ? null : heartbeatSeconds * 1000
        this.appDataStream = this.getFlag(OPTIONS_SECTION, ENABLE_APP_DATA_STREAM_KEY, false)
        this.appDataStreamVersion = this.getNumber(OPTIONS_SECTION, APP_DATA_STREAM_VERSION_KEY, 0)
        this.sframe = this.getFlag(SFRAME_SECTION, ENABLE_SFRAME_KEY, false)
        this.sframeRx = this.getFlag(SFRAME_SECTION, ENABLE_SFRAME_RX_KEY, false)
    }

    /**
     * An instance from the decoded JSON, or `null` when the root is not an object.
     *
     * @throws the `JSON.parse` error when the text is not JSON.
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

    private positiveNumber(section: string, key: string): number | null {
        const value = this.getNumber(section, key, 0)
        return value > 0 ? value : null
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
        return tryAsNumber(this.leaf(section, key)) ?? fallback
    }

    /** The string value exactly as the server wrote it, or `fallback` when it is not a string. */
    getText(section: string, key: string, fallback: string | null = null): string | null {
        const value = this.leaf(section, key)
        return typeof value === 'string' ? value : fallback
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

/** The JSON text of the node content, given as a string or bytes, base64 or already JSON. */
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
 * Reads the `<voip_settings>` of `node`, one of its children or grandchildren. Never throws:
 * an absent node, an unknown variant, bad base64 or bad JSON all return `null`.
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
