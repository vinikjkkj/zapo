import type {
    WaIncomingUnhandledStanzaEvent,
    WaPictureEvent,
    WaPictureEventAction
} from '@client/types'
import { findNodeChild } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt } from '@util/primitives'

interface WaParsePictureNotificationResult {
    readonly events: readonly WaPictureEvent[]
    readonly unhandled: readonly WaIncomingUnhandledStanzaEvent[]
}

const PICTURE_ACTION_TAGS: readonly WaPictureEventAction[] = [
    'set',
    'delete',
    'request',
    'set_avatar'
]

export function parsePictureNotificationEvents(node: BinaryNode): WaParsePictureNotificationResult {
    for (const action of PICTURE_ACTION_TAGS) {
        const actionNode = findNodeChild(node, action)
        if (!actionNode) continue

        const event: WaPictureEvent = {
            rawNode: node,
            stanzaId: node.attrs.id,
            chatJid: node.attrs.from,
            stanzaType: node.attrs.type,
            action,
            targetJid: actionNode.attrs.jid,
            authorJid: actionNode.attrs.author,
            timestampSeconds: parseOptionalInt(node.attrs.t),
            pictureId: action === 'set' ? parseOptionalInt(actionNode.attrs.id) : undefined,
            contactHash: actionNode.attrs.hash
        }
        return { events: [event], unhandled: [] }
    }
    return { events: [], unhandled: [] }
}
