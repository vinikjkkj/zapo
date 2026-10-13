import { createNoopLogger, type Logger, unpadPkcs7, writeRandomPadMax16 } from 'zapo-js'
import { proto } from 'zapo-js/proto'
import { parseSignalAddressFromJid } from 'zapo-js/protocol'
import { type BinaryNode, findNodeChild, getNodeChildren } from 'zapo-js/transport'
import { toError } from 'zapo-js/util'

import type { WaVoipDeps } from '../types.js'

export async function encodeWAMessage(
    message: Parameters<typeof proto.Message.encode>[0]
): Promise<Uint8Array> {
    return writeRandomPadMax16(proto.Message.encode(message).finish())
}

function encodeSignedDeviceIdentity(
    account: Parameters<typeof proto.ADVSignedDeviceIdentity.encode>[0]
): Uint8Array {
    return proto.ADVSignedDeviceIdentity.encode(account).finish()
}

export async function decryptCallKey(
    deps: WaVoipDeps,
    node: BinaryNode,
    peerJid: string,
    logger?: Logger
): Promise<Uint8Array | undefined> {
    const log = logger ?? createNoopLogger()

    const isEnc = (child: BinaryNode): boolean => child.tag === 'enc' && !!child.attrs?.type
    const encNodes = getNodeChildren(node).filter(isEnc)

    const destinationNode = findNodeChild(node, 'destination')
    if (destinationNode) {
        for (const toNode of getNodeChildren(destinationNode)) {
            if (toNode.tag === 'to') {
                encNodes.push(...getNodeChildren(toNode).filter(isEnc))
            }
        }
    }

    const address = parseSignalAddressFromJid(peerJid)
    for (const encNode of encNodes) {
        if (!(encNode.content instanceof Uint8Array)) {
            continue
        }
        try {
            const decrypted = await deps.signalProtocol.decryptMessage(address, {
                type: encNode.attrs.type as 'msg' | 'pkmsg',
                ciphertext: encNode.content
            })
            const message = proto.Message.decode(unpadPkcs7(decrypted))
            const callKey = message.call?.callKey
            if (callKey && callKey.length === 32) {
                return callKey
            }
        } catch (err) {
            log.trace('call key decrypt candidate failed', { message: toError(err).message })
        }
    }

    return undefined
}

interface EncryptedCallKeyNodes {
    /** One `<enc>` per device, in the order the devices came in. */
    readonly encNodes: readonly BinaryNode[]
    readonly shouldIncludeDeviceIdentity: boolean
}

/**
 * Encrypts a call key for each device under `<enc v='2' type count='0'>`: a 1:1 offer wraps
 * each in a `<to>`, an `<enc_rekey>` carries one directly.
 *
 * @throws for the whole batch when a device has no Signal session.
 */
export async function encryptCallKeyForDevices(
    deps: WaVoipDeps,
    devices: readonly string[],
    callKey: Uint8Array
): Promise<EncryptedCallKeyNodes> {
    const resolved = await deps.sessionResolver.ensureSessionsBatch(devices)

    const plaintext = await encodeWAMessage({ call: { callKey } })
    const encrypted = await deps.signalProtocol.encryptMessagesBatch(
        devices.map((jid) => ({ address: parseSignalAddressFromJid(jid), plaintext })),
        resolved.map((target) => ({ address: target.address, session: target.session }))
    )

    return {
        encNodes: encrypted.map((entry) => ({
            tag: 'enc',
            attrs: { v: '2', type: entry.type, count: '0' },
            content: entry.ciphertext
        })),
        shouldIncludeDeviceIdentity: encrypted.some((entry) => entry.type === 'pkmsg')
    }
}

/** `<device-identity>` of our account, sent beside a `pkmsg` key. */
export function deviceIdentityNode(
    signedIdentity: Parameters<typeof proto.ADVSignedDeviceIdentity.encode>[0]
): BinaryNode {
    return {
        tag: 'device-identity',
        attrs: {},
        content: encodeSignedDeviceIdentity(signedIdentity)
    }
}
