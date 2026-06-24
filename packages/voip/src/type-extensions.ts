import type { BinaryNode } from 'zapo-js/transport'

import type { CallInfo } from './call-state.js'
import type { WaVoipCoordinator } from './coordinator.js'

declare module 'zapo-js' {
    interface WaClientPluginRegistry {
        readonly voip: WaVoipCoordinator
    }

    interface WaClientPluginEventMap {
        readonly voip_call_state: (call: CallInfo) => void
        readonly voip_call_incoming: (call: CallInfo) => void
        readonly voip_call_ended: (call: CallInfo) => void
        readonly voip_call_audio: (data: Float32Array) => void
        readonly voip_call_error: (error: Error) => void
        readonly voip_signaling_send: (node: BinaryNode) => void
    }
}

export {}
