import type { Proto } from '../proto'

import type { WaSendMediaMessage } from './types'

export function isSendMediaMessage(content: unknown): content is WaSendMediaMessage {
    if (!content || typeof content !== 'object') {
        return false
    }
    if (!('type' in content) || !('media' in content) || !('mimetype' in content)) {
        return false
    }
    return true
}

export function resolveMessageTypeAttr(message: Proto.IMessage): string {
    if (message.reactionMessage) {
        return 'reaction'
    }
    if (
        message.imageMessage ||
        message.videoMessage ||
        message.audioMessage ||
        message.documentMessage ||
        message.stickerMessage
    ) {
        return 'media'
    }
    return 'text'
}
