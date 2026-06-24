export { NativeCallManager } from './call-manager.js'
export type { NativeCallManagerConfig } from './call-manager.js'

export { CallInfo, InvalidTransition } from './call-state.js'

export { RtpHeader, RtpPacket, RtpSession } from './rtp.js'
export { SrtpContext, SrtpSession, SrtpError } from './srtp.js'

export { derivePerJidSrtpKey, generateCallKey } from './encryption.js'

export { AudioEngine } from './audio-engine.js'

export { MLowCodec } from './mlow-codec.js'

export {
    generateCallId,
    generateCallStanzaId,
    extractNodeInfo,
    extractRelayEndpoints,
    decryptCallKeyInNode,
    buildOfferStanza,
    buildAcceptStanza,
    buildTerminateStanza,
    buildRejectStanza,
    buildRelayLatencyStanza,
    buildTransportStanza,
    createCallAck,
    needsDecryption
} from './signaling.js'

export type {
    SrtpKeyingMaterial,
    RelayInfo,
    RelayEndpoint,
    RelayData,
    CallSession,
    CallOfferOptions,
    CallManagerEvents,
    AudioSender,
    AudioEngineConfig,
    NodeInfo,
    RtpConfig,
    CallStateData as CallStateDataType
} from './types.js'

export {
    CallState,
    CallDirection,
    CallMediaType,
    EndCallReason,
    PayloadType,
    SRTP_AUTH_TAG_LEN,
    SRTP_LABEL,
    WA_RELAY_PORT,
    WA_DTLS_FINGERPRINT,
    DEFAULT_AUDIO_CONFIG
} from './types.js'

export { createVoipManager, routeCallStanza, routeCallAck, routeCallReceipt } from './bridge.js'
export type { CreateVoipManagerOptions } from './bridge.js'
export type {
    VoipSocket,
    VoipCredentials,
    VoipEncryptedEnvelope,
    VoipSignalEnvelopeType
} from './voip-socket.js'
