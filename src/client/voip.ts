import { writeRandomPadMax16 } from '@message/encode/padding'
import { proto, type Proto } from '@proto'
import { parseSignalAddressFromJid } from '@protocol/jid'
import type { SignalAddress } from '@signal/types'
import type { BinaryNode } from '@transport/types'

type SignalEnvelopeType = 'msg' | 'pkmsg'

/**
 * Signal/E2E primitives the VOIP engine relies on to encrypt and decrypt the
 * per-call `callKey` carried inside `<call>` stanzas. Mirrors the baileys
 * `signalRepository` shape that `@zapo-js/voip` was written against.
 */
export interface WaVoipSignalRepository {
    encryptMessage(args: {
        readonly jid: string
        readonly data: Uint8Array
    }): Promise<{ type: SignalEnvelopeType; ciphertext: Uint8Array }>
    decryptMessage(args: {
        readonly jid: string
        readonly type: string
        readonly ciphertext: Uint8Array | Buffer
    }): Promise<Uint8Array>
    lidMapping: {
        getLIDForPN(pn: string): Promise<string | null>
    }
}

/**
 * The host-socket surface the VOIP call manager drives. Structurally compatible
 * with `@zapo-js/voip`'s `VoipSocket`, so `createVoipManager(client.voip)` type-
 * checks across the package boundary without a direct dependency.
 */
export interface WaVoipSocket {
    readonly authState: {
        readonly creds: {
            readonly me: { id?: string; lid?: string }
            readonly account?: Proto.IADVSignedDeviceIdentity | null
        }
        readonly keys: {
            get(
                type: string,
                ids: readonly string[]
            ): Promise<Record<string, { token?: Uint8Array }> | undefined>
        }
    }
    readonly user: { lid?: string; id?: string }
    sendNode(node: BinaryNode): Promise<void>
    query(node: BinaryNode): Promise<BinaryNode>
    signalRepository: WaVoipSignalRepository
    assertSessions(jids: string[], force?: boolean): Promise<void>
    getUSyncDevices(jids: string[]): Promise<Array<{ jid: string }>>
    createParticipantNodes(
        devices: string[],
        message: { call: { callKey: Uint8Array } } | Record<string, unknown>,
        attrs?: Record<string, string>
    ): Promise<{ nodes: BinaryNode[]; shouldIncludeDeviceIdentity: boolean }>
}

/**
 * The narrow slice of `WaClient` internals the VOIP adapter needs. `WaClient`
 * supplies these from its existing coordinators/stores — no extra wiring.
 */
export interface WaVoipSocketContext {
    getCredentials(): {
        readonly meJid?: string
        readonly meLid?: string
        readonly signedIdentity?: Proto.IADVSignedDeviceIdentity
    } | null
    sendNode(node: BinaryNode): Promise<void>
    query(node: BinaryNode): Promise<BinaryNode>
    encryptMessage(
        address: SignalAddress,
        plaintext: Uint8Array
    ): Promise<{ readonly type: SignalEnvelopeType; readonly ciphertext: Uint8Array }>
    encryptMessagesBatch(
        requests: readonly { readonly address: SignalAddress; readonly plaintext: Uint8Array }[]
    ): Promise<readonly { readonly type: SignalEnvelopeType; readonly ciphertext: Uint8Array }[]>
    decryptMessage(
        address: SignalAddress,
        envelope: { readonly type: SignalEnvelopeType; readonly ciphertext: Uint8Array }
    ): Promise<Uint8Array>
    syncSignalSession(jid: string): Promise<void>
    syncDeviceList(
        jids: readonly string[]
    ): Promise<readonly { readonly jid: string; readonly deviceJids: readonly string[] }[]>
    queryLidsByPhoneJids(
        jids: readonly string[]
    ): Promise<readonly { readonly phoneJid: string; readonly lidJid: string | null }[]>
    getPrivacyToken(jid: string): Promise<Uint8Array | null>
}

/**
 * Builds a {@link WaVoipSocket} from a `WaClient`'s internal primitives,
 * translating between zapo's `SignalAddress`-based signal API and the
 * `{ jid }`-based shape the VOIP engine expects.
 */
export function createWaVoipSocket(ctx: WaVoipSocketContext): WaVoipSocket {
    const assertSessions = async (jids: string[]): Promise<void> => {
        await Promise.all(jids.map((jid) => ctx.syncSignalSession(jid)))
    }

    return {
        authState: {
            get creds() {
                const credentials = ctx.getCredentials()
                return {
                    me: { id: credentials?.meJid, lid: credentials?.meLid },
                    account: credentials?.signedIdentity ?? null
                }
            },
            keys: {
                async get(type, ids) {
                    if (type !== 'tctoken') {
                        return undefined
                    }
                    const result: Record<string, { token?: Uint8Array }> = {}
                    for (const id of ids) {
                        const token = await ctx.getPrivacyToken(id)
                        if (token) {
                            result[id] = { token }
                        }
                    }
                    return result
                }
            }
        },
        get user() {
            const credentials = ctx.getCredentials()
            return { lid: credentials?.meLid, id: credentials?.meJid }
        },
        sendNode: (node) => ctx.sendNode(node),
        query: (node) => ctx.query(node),
        signalRepository: {
            async encryptMessage({ jid, data }) {
                const { type, ciphertext } = await ctx.encryptMessage(
                    parseSignalAddressFromJid(jid),
                    data
                )
                return { type, ciphertext }
            },
            async decryptMessage({ jid, type, ciphertext }) {
                return ctx.decryptMessage(parseSignalAddressFromJid(jid), {
                    type: type as SignalEnvelopeType,
                    ciphertext: new Uint8Array(ciphertext)
                })
            },
            lidMapping: {
                async getLIDForPN(pn) {
                    const [result] = await ctx.queryLidsByPhoneJids([pn])
                    return result?.lidJid ?? null
                }
            }
        },
        assertSessions: (jids) => assertSessions(jids),
        async getUSyncDevices(jids) {
            const synced = await ctx.syncDeviceList(jids)
            return synced.flatMap((entry) => entry.deviceJids.map((jid) => ({ jid })))
        },
        async createParticipantNodes(devices, message, attrs) {
            await assertSessions(devices)
            const plaintext = await writeRandomPadMax16(proto.Message.encode(message).finish())
            const requests = devices.map((jid) => ({
                address: parseSignalAddressFromJid(jid),
                plaintext
            }))
            const encrypted = await ctx.encryptMessagesBatch(requests)
            const count = attrs?.count ?? '0'
            const nodes: BinaryNode[] = devices.map((jid, index) => ({
                tag: 'to',
                attrs: { jid },
                content: [
                    {
                        tag: 'enc',
                        attrs: { v: '2', type: encrypted[index].type, count },
                        content: encrypted[index].ciphertext
                    }
                ]
            }))
            return {
                nodes,
                shouldIncludeDeviceIdentity: encrypted.some((entry) => entry.type === 'pkmsg')
            }
        }
    }
}
