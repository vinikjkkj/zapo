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
export { buildChatstate } from './protocol/push/chatstate'
export type { BuildChatstateInput, FakeChatstateState } from './protocol/push/chatstate'
export { buildIncomingErrorStanza } from './protocol/push/error-stanza'
export type { BuildIncomingErrorStanzaInput } from './protocol/push/error-stanza'
export { buildIncomingPresence } from './protocol/push/presence'
export type {
    BuildIncomingPresenceInput,
    FakePresenceLastSentinel,
    FakePresenceType
} from './protocol/push/presence'
export {
    buildStreamErrorAck,
    buildStreamErrorCode,
    buildStreamErrorDeviceRemoved,
    buildStreamErrorReplaced,
    buildStreamErrorXmlNotWellFormed
} from './protocol/stream/stream-error'
