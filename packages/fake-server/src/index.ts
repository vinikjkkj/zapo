export { FakePairingDriver } from './api/FakePairingDriver'
export type {
    CompanionPairingMaterial,
    FakePairingDriverDeps,
    FakePairingDriverOptions
} from './api/FakePairingDriver'
export { FakePeer } from './api/FakePeer'
export type { CreateFakePeerOptions, SendMessageOptions } from './api/FakePeer'
export { FakeWaServer } from './api/FakeWaServer'
export type {
    BinaryNode,
    ExpectIqOptions,
    ExpectStanzaOptions,
    FakeWaServerNoiseRootCa,
    FakeWaServerOptions,
    FakeWaServerPipelineListener,
    StanzaMatcher,
    WaFakeAuthenticatedInfo,
    WaFakeConnectionPipeline
} from './api/FakeWaServer'
export { IqExpectation, Scenario } from './api/Scenario'
export type { AuthenticatedPipelineListener, ScenarioServer } from './api/Scenario'
export { WaFakeConnection } from './infra/WaFakeConnection'
export type { WaFakeConnectionHandlers, WaFakeConnectionState } from './infra/WaFakeConnection'
export type {
    WaFakeIqHandler,
    WaFakeIqMatcher,
    WaFakeIqResponder,
    WaFakeIqRouterEvents,
    WaFakeIqType
} from './protocol/iq/router'
export { buildIqError, buildIqResult } from './protocol/iq/router'
export { buildCall, buildFailure } from './protocol/push/call-failure'
export type { BuildCallInput, BuildFailureInput } from './protocol/push/call-failure'
export { buildChatstate } from './protocol/push/chatstate'
export type { BuildChatstateInput, FakeChatstateState } from './protocol/push/chatstate'
export { buildIncomingErrorStanza } from './protocol/push/error-stanza'
export type { BuildIncomingErrorStanzaInput } from './protocol/push/error-stanza'
export { buildMessage } from './protocol/push/message'
export type { BuildMessageInput, FakeEncChild, FakeEncType } from './protocol/push/message'
export { buildGroupNotification, buildNotification } from './protocol/push/notification'
export type {
    BuildGroupNotificationInput,
    BuildNotificationInput
} from './protocol/push/notification'
export { buildIncomingPresence } from './protocol/push/presence'
export type {
    BuildIncomingPresenceInput,
    FakePresenceLastSentinel,
    FakePresenceType
} from './protocol/push/presence'
export { buildReceipt } from './protocol/push/receipt'
export type { BuildReceiptInput, FakeReceiptType } from './protocol/push/receipt'
export { FakePeerSession, generateFakePeerIdentity } from './protocol/signal/fake-peer-session'
export type { FakePeerIdentity } from './protocol/signal/fake-peer-session'
export { FakeSenderKey } from './protocol/signal/fake-sender-key'
export type { FakeSenderKeyEncryptionResult } from './protocol/signal/fake-sender-key'
export {
    buildAdvSignedDeviceIdentity,
    generateFakePrimaryDevice
} from './protocol/auth/fake-primary-device'
export type {
    BuildAdvIdentityInput,
    BuildAdvIdentityResult,
    FakePrimaryDevice
} from './protocol/auth/fake-primary-device'
export {
    buildPairDeviceIq,
    buildPairSuccessIq,
    parsePairingQrString
} from './protocol/auth/pair-device'
export type {
    BuildPairDeviceIqInput,
    BuildPairSuccessIqInput,
    ParsedPairingQr
} from './protocol/auth/pair-device'
export { parsePreKeyUploadIq, PreKeyUploadParseError } from './protocol/signal/prekey-upload'
export type {
    ClientPreKeyBundle,
    ClientPreKeyEntry,
    ClientSignedPreKey
} from './protocol/signal/prekey-upload'
export {
    buildStreamErrorAck,
    buildStreamErrorCode,
    buildStreamErrorDeviceRemoved,
    buildStreamErrorReplaced,
    buildStreamErrorXmlNotWellFormed
} from './protocol/stream/stream-error'
