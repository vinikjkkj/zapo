import { createIncomingBaseEvent } from '@client/events/incoming'
import type { WaOwnUsernameNotificationEvent } from '@client/types'
import { WA_NODE_TAGS } from '@protocol/nodes'
import { normalizeUsername } from '@protocol/username'
import { findNodeChild } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'

/**
 * Reads the `<username>` child of an `account_sync` notification, `null` when
 * there is none. The shapes are tried in WhatsApp Web's order, so
 * `action="modify"` wins over a handle when a stanza carries both.
 */
export function parseOwnUsernameNotification(
    node: BinaryNode
): WaOwnUsernameNotificationEvent | null {
    const usernameNode = findNodeChild(node, WA_NODE_TAGS.USERNAME)
    if (!usernameNode) return null

    const base = createIncomingBaseEvent(node)
    if (usernameNode.attrs.action === 'modify') {
        return { ...base, kind: 'modify', username: null }
    }
    const rawUsername = usernameNode.attrs.username
    if (rawUsername !== undefined) {
        return { ...base, kind: 'set', username: normalizeUsername(rawUsername) }
    }
    return { ...base, kind: 'delete', username: null }
}
