export { WA_APP_DATA_PAYLOAD_TYPE, WA_VIDEO_QUALITY } from '@zapo-js/voip-media'
export type { WaCallArEffect, WaCallReaction } from '@zapo-js/voip-media'
export { voipPlugin } from './plugin.js'
export type { VoipPluginOptions } from './plugin.js'
export type { WaVoipMediaApi } from './WaVoipCoordinator.js'

export { CallInfo, WA_GROUP_CALL_ENDED_REASON } from './call/call-state.js'
export type { CallStateData, WaCallParticipantMedia } from './call/call-state.js'

export { groupSenderId } from './call/group-media-plan.js'

export {
    WA_CALL_PARTICIPANT_STATE,
    WA_GROUP_REKEY_REASON,
    WA_GROUP_REMOVAL_CAUSE
} from './call/group-participants.js'
export type {
    WaCallGroupParticipant,
    WaGroupComposition,
    WaGroupCompositionDiff,
    WaGroupDeviceChange,
    WaGroupDeviceSwitch,
    WaGroupRekeyReason,
    WaGroupRemoval,
    WaGroupRemovalCause
} from './call/group-participants.js'

export {
    WA_SCREEN_SHARE_SEND_VERSION,
    WA_SCREEN_SHARE_STATE,
    WA_SCREEN_SHARE_VERSION
} from './signaling/screen-share.js'
export type { PeerScreenShare } from './signaling/screen-share.js'

export { WA_MUTE_REQUEST_STATE } from './signaling/in-call.js'
export {
    WA_VIDEO_STATE,
    WA_VIDEO_UPGRADE_RESULT,
    WA_VIDEO_UPGRADE_TIMEOUT_MS
} from './signaling/video-state.js'
export type { WaVideoUpgradeResult } from './signaling/video-state.js'

export { WaVoipSettings } from './signaling/voip-settings.js'

export { CallState, CallDirection, CallMediaType, EndCallReason } from './types.js'

export type {
    CallOfferOptions,
    CallOfferParticipant,
    CallManagerEvents,
    CallVideoSubscription,
    GroupCallOfferOptions,
    OneToOneCallOfferOptions,
    InboundVideoFrame,
    InboundVideoRtpPacket,
    PeerVideoStateChange
} from './types.js'

export type { VoipEvents } from './events.js'
