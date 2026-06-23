import type { BinaryNode } from 'zapo-js/transport'

/**
 * Signal/E2E primitives the call engine relies on to encrypt and decrypt the
 * per-call `callKey` exchanged inside `<call>` stanzas.
 */
export interface VoipSignalRepository {
    encryptMessage(args: {
        jid: string
        data: Uint8Array
    }): Promise<{ type: string; ciphertext: Uint8Array }>
    decryptMessage(args: {
        jid: string
        type: string
        ciphertext: Uint8Array | Buffer
    }): Promise<Uint8Array>
    lidMapping?: {
        getLIDForPN?(pn: string): Promise<string | null | undefined>
    }
}

export interface VoipAuthState {
    creds: {
        me?: { id?: string; lid?: string }
        /** Signed device identity (baileys `account` / zapo `signedIdentity`). */
        account?: unknown
        [key: string]: unknown
    }
    keys?: {
        get?(type: string, ids: string[]): Promise<Record<string, unknown> | undefined>
    }
}

/**
 * The host-socket surface {@link NativeCallManager} drives. It mirrors the
 * baileys socket the engine was originally written against — the media stack
 * (RTP/SRTP/STUN/relay/codec) is fully library-agnostic, so this adapter is the
 * only seam that differs between WhatsApp libraries.
 *
 * zapo's `WaClient` keeps most of these primitives on internal coordinators
 * rather than the public client, so a consumer wires them into this shape (see
 * the package README for the exact mapping).
 */
export interface VoipSocket {
    authState: VoipAuthState
    user?: { lid?: string; id?: string }
    /** Send a stanza without awaiting a server IQ response. */
    sendNode(node: BinaryNode): Promise<void> | void
    /** Send a stanza and await its IQ response. */
    query(node: BinaryNode): Promise<BinaryNode | void> | BinaryNode | void
    signalRepository: VoipSignalRepository
    /** Ensure Signal sessions exist for the given device JIDs. */
    assertSessions(jids: string[], force?: boolean): Promise<void>
    /** Resolve the device list for the given JIDs via USync. */
    getUSyncDevices(
        jids: string[],
        ignoreZeroDevices?: boolean,
        ...rest: unknown[]
    ): Promise<Array<{ jid?: string; user?: string; device?: number }>>
    /** Build encrypted `<to>` participant nodes for a multi-device fan-out. */
    createParticipantNodes(
        devices: string[],
        message: { call: { callKey: Uint8Array } } | Record<string, unknown>,
        attrs?: Record<string, string>
    ): Promise<{ nodes: BinaryNode[]; shouldIncludeDeviceIdentity: boolean }>
}
