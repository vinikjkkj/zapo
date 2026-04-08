/**
 * Builder for an `AppStateSyncKeyShare` protocol message.
 *
 * Source:
 *   /deobfuscated/pb/WAWebProtobufsE2E_pb.js (AppStateSyncKey, AppStateSyncKeyData)
 *   /deobfuscated/WAWebSyncd/WAWebAppStateKeyManager.js
 *
 * Cross-checked against the lib's `WaAppStateSyncClient.importSyncKeyShare`
 * (`src/appstate/WaAppStateSyncClient.ts`).
 *
 * Wraps one or more sync keys inside a `Message.protocolMessage` of type
 * `APP_STATE_SYNC_KEY_SHARE`. The lib's incoming message dispatcher
 * persists the keys via `WaAppStateStore.upsertSyncKeys`, then auto-
 * triggers a `syncAppState()` round so any pending collection state
 * pulls in mutations encrypted with the freshly imported key.
 *
 * Wire layout (decoded plaintext of the encrypted message):
 *
 *   Message {
 *     protocolMessage {
 *       type = APP_STATE_SYNC_KEY_SHARE
 *       appStateSyncKeyShare {
 *         keys: [
 *           AppStateSyncKey {
 *             keyId   { keyId: <bytes> }
 *             keyData {
 *               keyData: <32 bytes>
 *               timestamp: <ms>
 *               fingerprint { rawId, currentIndex, deviceIndexes }
 *             }
 *           }
 *         ]
 *       }
 *     }
 *   }
 */

import { proto } from '../../transport/protos'

export interface FakeAppStateSyncKey {
    readonly keyId: Uint8Array
    /** 32-byte sync key. */
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
