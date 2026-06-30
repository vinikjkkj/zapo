import type { WaClientPluginContext } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import type { CallInfo } from './call/call-state.js'

export type WaVoipDeps = WaClientPluginContext['deps']

export type WaVoipStores = WaClientPluginContext['stores']

export enum CallState {
    Initiating = 'initiating',
    Ringing = 'ringing',
    IncomingRinging = 'incoming_ringing',
    Connecting = 'connecting',
    Active = 'active',
    OnHold = 'on_hold',
    Ended = 'ended'
}

export enum CallDirection {
    Outgoing = 'outgoing',
    Incoming = 'incoming'
}

export enum CallMediaType {
    Audio = 'audio',
    Video = 'video'
}

export enum EndCallReason {
    UserEnded = 'user_ended',
    Declined = 'declined',
    Timeout = 'timeout',
    Busy = 'busy',
    Cancelled = 'cancelled',
    Failed = 'failed',
    DoNotDisturb = 'do_not_disturb',
    Unknown = 'unknown'
}

export type CallTransition =
    | { type: 'offer_sent' }
    | { type: 'offer_received'; silenced?: boolean }
    | { type: 'local_accepted' }
    | { type: 'remote_accepted' }
    | { type: 'local_rejected'; reason: EndCallReason }
    | { type: 'remote_rejected'; reason: EndCallReason }
    | { type: 'media_connected' }
    | { type: 'terminated'; reason: EndCallReason }
    | { type: 'hold' }
    | { type: 'resume' }
    | { type: 'audio_mute_changed'; muted: boolean }
    | { type: 'video_state_changed'; off: boolean }

export interface SrtpKeyingMaterial {
    masterKey: Uint8Array
    masterSalt: Uint8Array
}

export enum PayloadType {
    WhatsAppOpus = 120
}

export interface RtpConfig {
    ssrc: number
    payloadType: number
    sampleRate: number
    samplesPerPacket: number
}

export interface RelayInfo {
    id: string
    ip: string
    port: number
    token: string
    authToken?: string
    key: string
    relayId: number
    name?: string
}

export interface RelayEndpoint {
    ip: string
    port: number
    token: string
    authToken?: string
    rawAuthToken?: Uint8Array
    rawToken?: Uint8Array
    key: string
    relayId: number
    protocol?: number
    c2rRtt?: number
    relayName?: string
    addressBytes?: Uint8Array
    authTokenId?: string
    isFna?: boolean
}

export interface RelayData {
    endpoints: RelayEndpoint[]
    participantJids?: string[]
    uuid?: string
    selfPid?: number
    peerPid?: number
    hbhKey?: Uint8Array
}

export interface CallStateData {
    state: CallState
    connectedAt?: Date
    audioMuted: boolean
    videoOff: boolean
    silenced?: boolean
    acceptBlocked?: boolean
}

export interface CallSession {
    callId: string
    peerJid: string
    callCreator: string
    direction: CallDirection
    mediaType: CallMediaType
    state: CallStateData
    createdAt: Date
    groupJid?: string
    isOffline: boolean
    callerPn?: string
    encryptionKey?: Uint8Array
    relayData?: RelayData
    isInitiator: boolean
}

export interface NodeInfo {
    tag: string
    peerJid: string
    callId: string
    peerPlatform: string
    peerAppVersion: string
    epochId?: string
    timestamp?: string
    innerNode: BinaryNode
}

/** Options for placing an outgoing call via `client.voip.startCall`. */
export interface CallOfferOptions {
    /** Bare or device JID to call. */
    peerJid: string
    /**
     * Flag the call as video in the signaling stanzas (default `false`). Video
     * media encode/transport is not implemented; only audio media flows.
     */
    isVideo?: boolean
    /** Audio file to preload and play once the call connects (needs ffmpeg). */
    audioFile?: string
    /** Explicit peer device JIDs to ring; omit to resolve them automatically. */
    peerDevices?: string[]
}

export interface CallManagerEvents {
    call_state: (call: CallInfo) => void
    call_incoming: (call: CallInfo) => void
    call_ended: (call: CallInfo) => void
    /** Decoded peer audio received on this call (16 kHz mono PCM). */
    call_inbound_audio: (call: CallInfo, pcm: Float32Array) => void
    /** Preloaded outbound audio finished sending on this call. */
    call_outbound_audio_finished: (call: CallInfo) => void
    call_error: (error: Error) => void
}

export interface AudioSender {
    sendCapturedAudio(data: Float32Array): void
}

export interface WaAudioEngineConfig {
    sampleRate: number
    captureChunkSize: number
    playbackOutputSize: number
    maxBufferSize: number
    intervalMs: number
}

export const DEFAULT_AUDIO_CONFIG: WaAudioEngineConfig = {
    sampleRate: 16000,
    captureChunkSize: 960,
    playbackOutputSize: 256,
    maxBufferSize: 1600,
    intervalMs: 60
}

export const SRTP_SEND_AUTH_TAG_LEN = 4
export const SRTP_RECV_AUTH_TAG_LEN = 4

export const SRTP_AUTH_TAG_LEN = 4

export const SRTP_LABEL = {
    ENCRYPTION: 0x00,
    AUTH: 0x01,
    SALT: 0x02
} as const

export const WA_RELAY_PORT = 3480

export const WA_DTLS_FINGERPRINT =
    'sha-256 F9:CA:0C:98:A3:CC:71:D6:42:CE:5A:E2:53:D2:15:20:D3:1B:BA:D8:57:A4:F0:AF:BE:0B:FB:F3:6B:0C:A0:68'
