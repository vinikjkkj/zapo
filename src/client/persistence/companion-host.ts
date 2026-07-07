import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { base64ToBytes, bytesToBase64 } from '@util/bytes'

/** A companion device this primary has linked. */
export interface CompanionRecord {
    readonly deviceJid: string
    readonly keyIndex: number
    readonly companionIdentityPublicKey: Uint8Array
    readonly addedAtSeconds: number
}

/**
 * The primary's ADV epoch state. `rawId` is the account's stable ADV identity
 * id; `currentKeyIndex` is the last-issued companion key index (companions get
 * `currentKeyIndex + 1`). This MUST persist across restarts, otherwise reissuing
 * an already-used key index breaks previously linked devices.
 */
export interface CompanionHostEpochState {
    readonly rawId: number
    readonly currentKeyIndex: number
    readonly companions: readonly CompanionRecord[]
}

/**
 * Persistence hook for {@link CompanionHostEpochState}. Supply one via plugin
 * options to survive restarts; without it the epoch is in-memory only (fine for
 * a single-session smoke test, unsafe for production relinking).
 */
export interface CompanionHostPersistence {
    readonly load: () => Promise<CompanionHostEpochState | null> | CompanionHostEpochState | null
    readonly save: (state: CompanionHostEpochState) => Promise<void> | void
}

interface SerializedCompanion {
    readonly deviceJid: string
    readonly keyIndex: number
    readonly companionIdentityPublicKey: string
    readonly addedAtSeconds: number
}

interface SerializedEpoch {
    readonly rawId: number
    readonly currentKeyIndex: number
    readonly companions: readonly SerializedCompanion[]
}

/**
 * File-backed {@link CompanionHostPersistence}: stores the ADV epoch as JSON at
 * `filePath` (the companion identity keys are base64-encoded). Zero native
 * dependencies - the state is tiny (the epoch header plus the linked-companion
 * list). For a database-backed store, implement the two-method
 * `CompanionHostPersistence` contract directly against your DB; there is no need
 * for a dedicated core store domain.
 */
export function createFileCompanionHostPersistence(filePath: string): CompanionHostPersistence {
    return {
        async load(): Promise<CompanionHostEpochState | null> {
            let raw: string
            try {
                raw = await readFile(filePath, 'utf8')
            } catch (error) {
                if ((error as { code?: unknown }).code === 'ENOENT') {
                    return null
                }
                throw error
            }
            const parsed = JSON.parse(raw) as SerializedEpoch
            return {
                rawId: parsed.rawId,
                currentKeyIndex: parsed.currentKeyIndex,
                companions: parsed.companions.map((companion) => ({
                    deviceJid: companion.deviceJid,
                    keyIndex: companion.keyIndex,
                    companionIdentityPublicKey: base64ToBytes(companion.companionIdentityPublicKey),
                    addedAtSeconds: companion.addedAtSeconds
                }))
            }
        },
        async save(state: CompanionHostEpochState): Promise<void> {
            const serialized: SerializedEpoch = {
                rawId: state.rawId,
                currentKeyIndex: state.currentKeyIndex,
                companions: state.companions.map((companion) => ({
                    deviceJid: companion.deviceJid,
                    keyIndex: companion.keyIndex,
                    companionIdentityPublicKey: bytesToBase64(companion.companionIdentityPublicKey),
                    addedAtSeconds: companion.addedAtSeconds
                }))
            }
            await mkdir(dirname(filePath), { recursive: true })
            const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
            await writeFile(tempPath, JSON.stringify(serialized), 'utf8')
            await rename(tempPath, filePath)
        }
    }
}
