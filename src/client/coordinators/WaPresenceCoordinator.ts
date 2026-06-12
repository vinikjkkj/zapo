import type { WaAuthCredentials } from '@auth/types'
import { isGroupJid } from '@protocol/jid'
import {
    buildChatstateNode,
    type BuildChatstateNodeInput
} from '@transport/node/builders/chatstate'
import {
    buildPresenceNode,
    buildPresenceSubscribeNode,
    type BuildPresenceSubscribeNodeInput
} from '@transport/node/builders/presence'
import type { BinaryNode } from '@transport/types'

/**
 * Coordinates own presence broadcasts and peer presence subscriptions.
 * Accessed via {@link WaClient.presence}.
 */
export interface WaPresenceCoordinator {
    /** Broadcasts the current account's `available`/`unavailable` presence. */
    readonly send: (type?: 'available' | 'unavailable') => Promise<void>
    /** Sends a chatstate hint (typing/recording/paused/...) into a specific chat. */
    readonly sendChatstate: (
        jid: string,
        options: Omit<BuildChatstateNodeInput, 'jid'>
    ) => Promise<void>
    /**
     * Subscribes to presence updates (online/offline + chatstate) for a chat.
     * The subscription is per-jid and lives only for the current connection;
     * after a reconnect the caller must re-subscribe to keep receiving events.
     */
    readonly subscribe: (
        jid: string,
        options?: Omit<BuildPresenceSubscribeNodeInput, 'jid'>
    ) => Promise<void>
}

interface WaPresenceCoordinatorOptions {
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly getCurrentCredentials: () => WaAuthCredentials | null
    /**
     * Resolves the receiver-mode `<tctoken>` node for a contact, echoed back
     * on a user presence subscription to unlock the target's presence
     * visibility. Returns `null` when no valid token is held.
     */
    readonly resolvePrivacyTokenNode: (jid: string) => Promise<BinaryNode | null>
}

/** Builds a {@link WaPresenceCoordinator} from its node-send dependency. */
export function createPresenceCoordinator(
    options: WaPresenceCoordinatorOptions
): WaPresenceCoordinator {
    const { sendNode, getCurrentCredentials, resolvePrivacyTokenNode } = options
    return {
        send: async (type) => {
            const credentials = getCurrentCredentials()
            await sendNode(
                buildPresenceNode({ type, name: credentials?.meDisplayName ?? undefined })
            )
        },
        sendChatstate: async (jid, opts) => {
            await sendNode(buildChatstateNode({ jid, ...opts }))
        },
        subscribe: async (jid, opts) => {
            const privacyTokenNode = isGroupJid(jid) ? null : await resolvePrivacyTokenNode(jid)
            await sendNode(
                buildPresenceSubscribeNode({
                    jid,
                    ...opts,
                    ...(privacyTokenNode ? { privacyTokenNode } : {})
                })
            )
        }
    }
}
