import { randomBytes } from 'node:crypto'

import { proto ,type  WaClientPluginContext } from 'zapo-js'
import { parseSignalAddressFromJid } from 'zapo-js/protocol'
import type { SignalAddress } from 'zapo-js/signal'
import type { BinaryNode } from 'zapo-js/transport'

import type { VoipSocket } from './voip-socket.js'

type SignalEnvelopeType = 'msg' | 'pkmsg'

async function writeRandomPadMax16(message: Uint8Array): Promise<Uint8Array> {
    const padLength = (randomBytes(1)[0] & 0x0f) + 1
    const out = new Uint8Array(message.length + padLength)
    out.set(message, 0)
    out.fill(padLength, message.length)
    return out
}

/**
 * Builds a {@link VoipSocket} from {@link WaClientPluginContext}, translating
 * between zapo's `SignalAddress`-based signal API and the `{ jid }`-based shape
 * the VOIP engine expects.
 */
export function createWaVoipSocket(ctx: WaClientPluginContext): VoipSocket {
    const { deps } = ctx

    const assertSessions = async (jids: string[]): Promise<void> => {
        await Promise.all(jids.map((jid) => deps.messageDispatch.syncSignalSession(jid)))
    }

    const encryptMessage = (
        address: SignalAddress,
        plaintext: Uint8Array
    ): Promise<{ readonly type: SignalEnvelopeType; readonly ciphertext: Uint8Array }> =>
        deps.signalProtocol.encryptMessage(address, plaintext)

    const encryptMessagesBatch = (
        requests: readonly { readonly address: SignalAddress; readonly plaintext: Uint8Array }[]
    ): Promise<readonly { readonly type: SignalEnvelopeType; readonly ciphertext: Uint8Array }[]> =>
        deps.signalProtocol.encryptMessagesBatch(requests)

    const decryptMessage = (
        address: SignalAddress,
        envelope: { readonly type: SignalEnvelopeType; readonly ciphertext: Uint8Array }
    ): Promise<Uint8Array> => deps.signalProtocol.decryptMessage(address, envelope)

    return {
        authState: {
            get creds() {
                const credentials = deps.authClient.getCurrentCredentials()
                return {
                    me: { id: credentials?.meJid, lid: credentials?.meLid },
                    account: credentials?.signedIdentity ?? undefined
                }
            },
            keys: {
                async get(type, ids) {
                    if (type !== 'tctoken') {
                        return undefined
                    }
                    const result: Record<string, { token?: Uint8Array }> = {}
                    for (const id of ids) {
                        const record = await ctx.stores.privacyToken.getByJid(id)
                        if (record?.tcToken) {
                            result[id] = { token: record.tcToken }
                        }
                    }
                    return result
                }
            }
        },
        get user() {
            const credentials = deps.authClient.getCurrentCredentials()
            return { lid: credentials?.meLid, id: credentials?.meJid }
        },
        sendNode: (node) => deps.lowLevelCoordinator.sendNode(node),
        query: (node) => deps.lowLevelCoordinator.query(node),
        signalRepository: {
            async encryptMessage({ jid, data }) {
                const { type, ciphertext } = await encryptMessage(
                    parseSignalAddressFromJid(jid),
                    data
                )
                return { type, ciphertext }
            },
            async decryptMessage({ jid, type, ciphertext }) {
                return decryptMessage(parseSignalAddressFromJid(jid), {
                    type: type as SignalEnvelopeType,
                    ciphertext: new Uint8Array(ciphertext)
                })
            },
            lidMapping: {
                async getLIDForPN(pn) {
                    const [result] = await deps.signalDeviceSync.queryLidsByPhoneJids([pn])
                    return result?.lidJid ?? null
                }
            }
        },
        assertSessions: (jids) => assertSessions(jids),
        async getUSyncDevices(jids) {
            const synced = await deps.signalDeviceSync.syncDeviceList(jids)
            return synced.flatMap((entry) =>
                entry.deviceJids.map((jid) => ({ jid, user: jid, device: 0 }))
            )
        },
        async createParticipantNodes(devices, message, attrs) {
            await assertSessions(devices)
            const plaintext = await writeRandomPadMax16(proto.Message.encode(message).finish())
            const requests = devices.map((jid) => ({
                address: parseSignalAddressFromJid(jid),
                plaintext
            }))
            const encrypted = await encryptMessagesBatch(requests)
            const count = attrs?.count ?? '0'
            const nodes: BinaryNode[] = devices.map((jid, index) => ({
                tag: 'to',
                attrs: { jid },
                content: [
                    {
                        tag: 'enc',
                        attrs: { v: '2', type: encrypted[index]!.type, count },
                        content: encrypted[index]!.ciphertext
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
