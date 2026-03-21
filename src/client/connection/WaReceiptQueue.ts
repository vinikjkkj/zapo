import { WA_DEFAULTS, WA_MESSAGE_TAGS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'

export class WaReceiptQueue {
    private readonly maxSize: number
    private readonly danglingReceipts: BinaryNode[]

    public constructor(options: { readonly maxSize?: number } = {}) {
        this.maxSize = options.maxSize ?? WA_DEFAULTS.MAX_DANGLING_RECEIPTS
        this.danglingReceipts = []
    }

    public shouldQueue(node: BinaryNode, error: Error): boolean {
        if (node.tag !== WA_MESSAGE_TAGS.RECEIPT) {
            return false
        }

        const normalized = error.message.trim().toLowerCase()
        return (
            normalized === 'comms is not connected' ||
            normalized === 'websocket is not connected' ||
            normalized === 'noise session socket closed' ||
            normalized.startsWith('socket closed (')
        )
    }

    public enqueue(node: BinaryNode): void {
        if (this.danglingReceipts.length >= this.maxSize) {
            this.danglingReceipts.shift()
        }

        this.danglingReceipts.push(
            node.content === undefined
                ? {
                      tag: node.tag,
                      attrs: { ...node.attrs }
                  }
                : {
                      tag: node.tag,
                      attrs: { ...node.attrs },
                      content: node.content
                  }
        )
    }

    public take(): BinaryNode[] {
        return this.danglingReceipts.splice(0)
    }

    public size(): number {
        return this.danglingReceipts.length
    }
}
