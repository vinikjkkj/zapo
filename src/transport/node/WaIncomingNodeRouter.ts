import type { BinaryNode } from '../../transport/types'

type IqSetNodeHandler = (node: BinaryNode) => Promise<boolean>
type NotificationNodeHandler = (node: BinaryNode) => Promise<boolean>
type MessageNodeHandler = (node: BinaryNode) => Promise<boolean>

interface WaIncomingNodeRouterOptions {
    readonly nodeOrchestrator: {
        tryResolvePending(node: BinaryNode): boolean
        handleIncomingNode(node: BinaryNode): Promise<boolean>
    }
    readonly iqSetHandlers?: readonly IqSetNodeHandler[]
    readonly notificationHandlers?: readonly NotificationNodeHandler[]
    readonly messageHandlers?: readonly MessageNodeHandler[]
}

export class WaIncomingNodeRouter {
    private readonly nodeOrchestrator: WaIncomingNodeRouterOptions['nodeOrchestrator']
    private readonly iqSetHandlers: readonly IqSetNodeHandler[]
    private readonly notificationHandlers: readonly NotificationNodeHandler[]
    private readonly messageHandlers: readonly MessageNodeHandler[]

    public constructor(options: WaIncomingNodeRouterOptions) {
        this.nodeOrchestrator = options.nodeOrchestrator
        this.iqSetHandlers = options.iqSetHandlers ?? []
        this.notificationHandlers = options.notificationHandlers ?? []
        this.messageHandlers = options.messageHandlers ?? []
    }

    public async dispatch(node: BinaryNode): Promise<boolean> {
        if (this.nodeOrchestrator.tryResolvePending(node)) {
            return true
        }

        const genericHandled = await this.nodeOrchestrator.handleIncomingNode(node)
        if (genericHandled) {
            return true
        }

        if (node.tag === 'iq') {
            if (node.attrs.type === 'set') {
                for (const handleIqSet of this.iqSetHandlers) {
                    if (await handleIqSet(node)) {
                        return true
                    }
                }
            }
            return false
        }

        if (node.tag === 'notification') {
            for (const handleNotification of this.notificationHandlers) {
                if (await handleNotification(node)) {
                    return true
                }
            }
            return false
        }

        if (node.tag === 'message') {
            for (const handleMessage of this.messageHandlers) {
                if (await handleMessage(node)) {
                    return true
                }
            }
        }
        return false
    }
}
