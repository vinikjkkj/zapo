import type { BinaryNode } from 'zapo-js/transport'

export interface VoipSignalRepository {
    encryptMessage(args: {
        jid: string
        data: Uint8Array
    }): Promise<{ type: string; ciphertext: Uint8Array }>
    decryptMessage(args: {
        jid: string
        type: string
        ciphertext: Uint8Array
    }): Promise<Uint8Array>
    lidMapping?: {
        getLIDForPN?(pn: string): Promise<string | null | undefined>
    }
}

export interface VoipAuthState {
    creds: {
        me?: { id?: string; lid?: string }

        account?: unknown
        [key: string]: unknown
    }
    keys?: {
        get?(
            type: string,
            ids: string[]
        ): Promise<Record<string, { token?: Uint8Array }> | undefined>
    }
}

export interface VoipSocket {
    authState: VoipAuthState
    user?: { lid?: string; id?: string }

    sendNode(node: BinaryNode): Promise<void>

    query(node: BinaryNode): Promise<BinaryNode | void>
    signalRepository: VoipSignalRepository

    assertSessions(jids: string[], force?: boolean): Promise<void>

    getUSyncDevices(
        jids: string[],
        ignoreZeroDevices?: boolean,
        ...rest: unknown[]
    ): Promise<Array<{ jid?: string; user?: string; device?: number }>>

    createParticipantNodes(
        devices: string[],
        message: { call: { callKey: Uint8Array } } | Record<string, unknown>,
        attrs?: Record<string, string>
    ): Promise<{ nodes: BinaryNode[]; shouldIncludeDeviceIdentity: boolean }>
}
