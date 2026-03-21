import { WA_DEFAULTS, WA_MESSAGE_TAGS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'

export class WaReceiptQueue {
    private readonly maxSize: number
    private readonly danglingReceipts: BinaryNode[]
    private danglingHead: number

    public constructor(options: { readonly maxSize?: number } = {}) {
        this.maxSize = options.maxSize ?? WA_DEFAULTS.MAX_DANGLING_RECEIPTS
        this.danglingReceipts = []
        this.danglingHead = 0
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
        if (this.maxSize <= 0) {
            return
        }
        if (this.size() >= this.maxSize) {
            this.danglingHead += 1
        }
        if (this.danglingHead > 64 && this.danglingHead * 2 >= this.danglingReceipts.length) {
            const live = this.danglingReceipts.length - this.danglingHead
            this.danglingReceipts.copyWithin(0, this.danglingHead)
            this.danglingReceipts.length = live
            this.danglingHead = 0
        }

        this.danglingReceipts.push(node)
    }

    public take(): BinaryNode[] {
        if (this.danglingHead >= this.danglingReceipts.length) {
            this.danglingReceipts.length = 0
            this.danglingHead = 0
            return []
        }
        const out = this.danglingReceipts.slice(this.danglingHead)
        this.danglingReceipts.length = 0
        this.danglingHead = 0
        return out
    }

    public size(): number {
        return this.danglingReceipts.length - this.danglingHead
    }
}
