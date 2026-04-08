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
export {
    buildStreamErrorAck,
    buildStreamErrorCode,
    buildStreamErrorDeviceRemoved,
    buildStreamErrorReplaced,
    buildStreamErrorXmlNotWellFormed
} from './protocol/stream/stream-error'
