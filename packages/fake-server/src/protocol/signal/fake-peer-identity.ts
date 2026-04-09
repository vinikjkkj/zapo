/**
 * Long-term identity material for a fake peer.
 *
 * Source:
 *   /deobfuscated/WASignal/WASignalSessions.js
 *
 * The identity keypair is the X25519 long-term Signal identity (used
 * during X3DH and as the input to MAC verification on every signal
 * message). The registration id is a 14-bit non-zero integer the lib
 * embeds in the `PreKeySignalMessage` envelope.
 *
 * This file used to live inside `fake-peer-session.ts`, which also
 * carried a single-direction `FakePeerSession` class. After the move
 * to the unified `FakePeerDoubleRatchet` (which owns both encrypt and
 * decrypt state), the session class became dead code and the identity
 * type was extracted here so the rest of the package can keep using
 * it without dragging in the legacy session.
 */

import { type SignalKeyPair, X25519 } from '../../transport/crypto'

export interface FakePeerIdentity {
    /** Long-term identity keypair. */
    readonly identityKeyPair: SignalKeyPair
    /** Registration id used in PreKeySignalMessage. */
    readonly registrationId: number
}

export async function generateFakePeerIdentity(): Promise<FakePeerIdentity> {
    const identityKeyPair = await X25519.generateKeyPair()
    return {
        identityKeyPair,
        registrationId: Math.floor(Math.random() * 0x3fff) + 1
    }
}
