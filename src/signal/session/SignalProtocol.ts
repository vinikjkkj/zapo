import { toSerializedPubKey } from '../../crypto'
import { MAX_PREV_SESSIONS } from '../../signal/constants'
import type {
    ParsedPreKeySignalMessage,
    ParsedSignalMessage,
    SignalAddress,
    SignalPreKeyBundle,
    SignalSessionRecord
} from '../../signal/types'
import { uint8Equal } from '../../util/bytes'
import type { WaSignalStore } from '../store/WaSignalStore'

import { decryptMsg, decryptMsgFromSession, encryptMsg, calculateRatchet } from './SignalRatchet'
import type { DecryptOutcome } from './SignalRatchet'
import {
    deserializeMsg,
    deserializePkMsg,
    requirePreKey,
    requireSignedPreKey
} from './SignalSerializer'
import {
    detachSession,
    ecdh,
    findMatchingSession,
    generateSerializedKeyPair,
    initiateSessionIncoming,
    initiateSessionOutgoing,
    requireLocalIdentity,
    setPrevSessions,
    toSerializedKeyPair
} from './SignalSession'

interface SignalCiphertext {
    readonly type: 'msg' | 'pkmsg'
    readonly ciphertext: Uint8Array
    readonly baseKey: Uint8Array | null
}

interface SignalMessageEnvelope {
    readonly type: 'msg' | 'pkmsg' | 'skmsg'
    readonly ciphertext: Uint8Array
}

export class SignalProtocol {
    private readonly store: WaSignalStore

    public constructor(store: WaSignalStore) {
        this.store = store
    }

    public async hasSession(address: SignalAddress): Promise<boolean> {
        return (await this.store.getSession(address)) !== null
    }

    public async establishOutgoingSession(
        address: SignalAddress,
        remoteBundle: SignalPreKeyBundle
    ): Promise<SignalSessionRecord> {
        const local = await requireLocalIdentity(this.store, toSerializedKeyPair)
        const localOneTimeBase = await generateSerializedKeyPair()
        const session = await initiateSessionOutgoing(
            local,
            remoteBundle,
            localOneTimeBase,
            ecdh,
            () => generateSerializedKeyPair(),
            calculateRatchet
        )
        await this.store.setRemoteIdentity(address, session.remote.pubKey)
        await this.store.setSession(address, session)
        return session
    }

    public async encryptMessage(
        address: SignalAddress,
        plaintext: Uint8Array,
        expectedIdentity?: Uint8Array
    ): Promise<SignalCiphertext> {
        const session = await this.store.getSession(address)
        if (!session) {
            throw new Error('signal session not found')
        }
        if (
            expectedIdentity &&
            !uint8Equal(toSerializedPubKey(expectedIdentity), session.remote.pubKey)
        ) {
            throw new Error('identity mismatch')
        }

        const [updatedSession, encrypted] = await encryptMsg(session, plaintext)
        await this.store.setSession(address, updatedSession)
        await this.store.setRemoteIdentity(address, updatedSession.remote.pubKey)
        return {
            ...encrypted,
            baseKey: updatedSession.aliceBaseKey
        }
    }

    public async decryptMessage(
        address: SignalAddress,
        envelope: SignalMessageEnvelope
    ): Promise<Uint8Array> {
        const currentSession = await this.store.getSession(address)

        let outcome: DecryptOutcome
        if (envelope.type === 'pkmsg') {
            const parsedPk = deserializePkMsg(envelope.ciphertext)
            outcome = await this.decryptPkMsg(currentSession, parsedPk)
        } else if (envelope.type === 'msg') {
            const parsed = deserializeMsg(envelope.ciphertext)
            outcome = await this.decryptMsgInternal(currentSession, parsed)
        } else {
            throw new Error(`unsupported ciphertext type ${envelope.type}`)
        }

        if (outcome.newSessionInfo?.newIdentity) {
            await this.store.setRemoteIdentity(address, outcome.newSessionInfo.newIdentity)
        } else {
            await this.store.setRemoteIdentity(address, outcome.updatedSession.remote.pubKey)
        }
        await this.store.setSession(address, outcome.updatedSession)
        return outcome.plaintext
    }

    private async decryptMsgInternal(
        session: SignalSessionRecord | null,
        parsed: ParsedSignalMessage
    ): Promise<DecryptOutcome> {
        return decryptMsg(session, parsed, (sess, msg) =>
            decryptMsgFromSession(sess, msg, () => generateSerializedKeyPair())
        )
    }

    private async decryptPkMsg(
        currentSession: SignalSessionRecord | null,
        parsed: ParsedPreKeySignalMessage
    ): Promise<DecryptOutcome> {
        const matchingSession = findMatchingSession(currentSession, parsed.sessionBaseKey)
        if (matchingSession) {
            const [updatedSession, plaintext] = await decryptMsgFromSession(
                matchingSession,
                parsed,
                () => generateSerializedKeyPair()
            )
            return {
                updatedSession,
                plaintext,
                newSessionInfo: null
            }
        }

        const local = await requireLocalIdentity(this.store, toSerializedKeyPair)
        const signedPreKey = await requireSignedPreKey(this.store, parsed.localSignedPreKeyId)
        const oneTimePreKey =
            parsed.localOneTimeKeyId === null || parsed.localOneTimeKeyId === undefined
                ? null
                : await requirePreKey(this.store, parsed.localOneTimeKeyId)
        const incoming = await initiateSessionIncoming(
            local,
            parsed.remote,
            parsed.sessionBaseKey,
            {
                signed: toSerializedKeyPair(signedPreKey.keyPair),
                oneTime: oneTimePreKey ? toSerializedKeyPair(oneTimePreKey.keyPair) : undefined,
                ratchet: toSerializedKeyPair(signedPreKey.keyPair)
            },
            ecdh
        )

        const newIdentity =
            !currentSession || !uint8Equal(incoming.remote.pubKey, currentSession.remote.pubKey)
                ? incoming.remote.pubKey
                : null
        const baseSession =
            currentSession && (newIdentity === null || newIdentity === undefined)
                ? setPrevSessions(incoming, [
                      detachSession(currentSession),
                      ...currentSession.prevSessions.slice(0, MAX_PREV_SESSIONS - 1)
                  ])
                : incoming

        const [updatedSession, plaintext] = await decryptMsgFromSession(
            baseSession,
            parsed,
            () => generateSerializedKeyPair()
        )
        if (parsed.localOneTimeKeyId !== null && parsed.localOneTimeKeyId !== undefined) {
            await this.store.consumePreKeyById(parsed.localOneTimeKeyId)
        }
        return {
            updatedSession,
            plaintext,
            newSessionInfo: {
                newIdentity,
                baseSession,
                usedPreKey: parsed.localOneTimeKeyId
            }
        }
    }
}
