/** Builder for `APP_STATE_SYNC_KEY_SHARE` protocol messages. */

import { proto } from '../../transport/protos'

export interface FakeAppStateSyncKey {
    readonly keyId: Uint8Array
    readonly keyData: Uint8Array
    readonly timestamp?: number
    readonly fingerprint?: {
        readonly rawId?: number
        readonly currentIndex?: number
        readonly deviceIndexes?: readonly number[]
    }
}

export interface BuildAppStateSyncKeyShareInput {
    readonly keys: readonly FakeAppStateSyncKey[]
}

export function buildAppStateSyncKeyShareMessage(
    input: BuildAppStateSyncKeyShareInput
): proto.IMessage {
    if (input.keys.length === 0) {
        throw new Error('buildAppStateSyncKeyShareMessage requires at least one key')
    }
    return {
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.APP_STATE_SYNC_KEY_SHARE,
            appStateSyncKeyShare: {
                keys: input.keys.map((key) => ({
                    keyId: { keyId: key.keyId },
                    keyData: {
                        keyData: key.keyData,
                        timestamp: key.timestamp ?? Date.now(),
                        fingerprint: {
                            rawId: key.fingerprint?.rawId ?? 0,
                            currentIndex: key.fingerprint?.currentIndex ?? 0,
                            deviceIndexes: [...(key.fingerprint?.deviceIndexes ?? [])]
                        }
                    }
                }))
            }
        }
    }
}
