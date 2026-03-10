import { EventEmitter } from 'node:events'

import { ConsoleLogger } from '../../infra/log/ConsoleLogger'
import type { Logger } from '../../infra/log/types'
import type { BinaryNode } from '../../transport/types'
import { toError } from '../../util/primitives'
import { decodeBinaryNodeStanza, encodeBinaryNodeStanza } from '../binary'
import type { WaComms } from '../WaComms'

interface NodeTransportEventMap {
    readonly frame_in: (frame: Uint8Array) => void
    readonly frame_out: (frame: Uint8Array) => void
    readonly node_in: (node: BinaryNode, frame: Uint8Array) => void
    readonly node_out: (node: BinaryNode, frame: Uint8Array) => void
    readonly decode_error: (error: Error, frame: Uint8Array) => void
}

export class WaNodeTransport extends EventEmitter {
    private readonly logger: Logger
    private comms: WaComms | null

    public constructor(logger: Logger = new ConsoleLogger('info')) {
        super()
        this.logger = logger
        this.comms = null
    }

    public override on<K extends keyof NodeTransportEventMap>(
        event: K,
        listener: NodeTransportEventMap[K]
    ): this {
        return super.on(event, listener as (...args: unknown[]) => void)
    }

    public bindComms(comms: WaComms | null): void {
        this.comms = comms
        this.logger.debug('node transport bindComms', { connected: comms !== null })
    }

    public async sendNode(node: BinaryNode): Promise<void> {
        const comms = this.comms
        if (!comms) {
            throw new Error('comms is not connected')
        }
        this.logger.trace('node transport send node', {
            tag: node.tag,
            id: node.attrs.id,
            type: node.attrs.type
        })
        const frame = encodeBinaryNodeStanza(node)
        this.emit('node_out', node, frame)
        this.emit('frame_out', frame)
        this.logger.trace('node transport frame out', { byteLength: frame.byteLength })
        await comms.sendFrame(frame)
    }

    public async dispatchIncomingFrame(
        frame: Uint8Array,
        onNode: (node: BinaryNode) => Promise<void> | void
    ): Promise<void> {
        this.emit('frame_in', frame)
        this.logger.trace('node transport frame in', { byteLength: frame.byteLength })
        let node: BinaryNode
        try {
            node = decodeBinaryNodeStanza(frame)
        } catch (error) {
            const normalized = toError(error)
            if (normalized.message === 'stream end stanza is not a binary node') {
                return
            }
            this.logger.warn('failed to decode binary node frame', {
                message: normalized.message
            })
            this.emit('decode_error', normalized, frame)
            return
        }
        this.emit('node_in', node, frame)
        this.logger.trace('node transport node in', {
            tag: node.tag,
            id: node.attrs.id,
            type: node.attrs.type
        })
        await onNode(node)
    }
}
