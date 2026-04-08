export { FakeWaServer } from './api/FakeWaServer'
export type {
    BinaryNode,
    ExpectIqOptions,
    FakeWaServerNoiseRootCa,
    FakeWaServerOptions,
    FakeWaServerPipelineListener,
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
export {
    buildStreamErrorAck,
    buildStreamErrorCode,
    buildStreamErrorDeviceRemoved,
    buildStreamErrorReplaced,
    buildStreamErrorXmlNotWellFormed
} from './protocol/stream/stream-error'
