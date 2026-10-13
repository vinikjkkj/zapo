export { WA_APP_DATA_PAYLOAD_TYPE, WA_VIDEO_QUALITY } from '@zapo-js/voip-media'
export type { WaCallArEffect, WaCallReaction } from '@zapo-js/voip-media'
export { voipPlugin } from './plugin.js'
export type { VoipPluginOptions } from './plugin.js'
export type { WaVoipMediaApi } from './WaVoipCoordinator.js'

export { CallInfo, WA_GROUP_CALL_ENDED_REASON, WA_TERMINATE_DECISION } from './call/call-state.js'
export type {
    CallStateData,
    WaCallParticipantMedia,
    WaTerminateDecision
} from './call/call-state.js'

export { groupSenderId } from './call/group-media-plan.js'

export {
    applyGroupUpdate,
    createGroupComposition,
    diffGroupParticipants,
    groupParticipantAccountKey,
    isGroupParticipantLeaving,
    isGroupParticipantPresent,
    isStaleGroupUpdate,
    WA_CALL_PARTICIPANT_STATE,
    WA_GROUP_REKEY_REASON,
    WA_GROUP_REMOVAL_CAUSE
} from './call/group-participants.js'
export type {
    WaGroupComposition,
    WaGroupCompositionDiff,
    WaGroupDeviceChange,
    WaGroupDeviceSwitch,
    WaGroupParticipant,
    WaGroupRekeyReason,
    WaGroupRemoval,
    WaGroupRemovalCause,
    WaGroupUpdate,
    WaGroupUpdateOutcome
} from './call/group-participants.js'

export {
    normalizeParticipantDeviceJids,
    parseGroupInfoNode,
    readGroupCallRoster,
    toGroupCallParticipants,
    toMediaIdentityJid,
    toParticipantMediaIdentityJids,
    WA_CALL_MAX_DEVICES_PER_USER
} from './signaling/group-info.js'
export type {
    GroupCallRoster,
    GroupInfo,
    GroupInfoDevice,
    GroupInfoParticipant
} from './signaling/group-info.js'

export {
    WA_SCREEN_SHARE_SEND_VERSION,
    WA_SCREEN_SHARE_STATE,
    WA_SCREEN_SHARE_VERSION
} from './signaling/screen-share.js'
export type { PeerScreenShare } from './signaling/screen-share.js'

export {
    WA_MUTE_REQUEST_STATE,
    WA_VIDEO_STATE,
    WA_VIDEO_UPGRADE_RESULT,
    WA_VIDEO_UPGRADE_TIMEOUT_MS
} from './signaling/signaling.js'
export type { GroupOfferStanza, WaVideoUpgradeResult } from './signaling/signaling.js'

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
