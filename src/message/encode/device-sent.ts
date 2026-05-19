import type { Proto } from '@proto'

export function wrapDeviceSentMessage(
    message: Proto.IMessage,
    destinationJid: string
): Proto.IMessage {
    if (!destinationJid || destinationJid.trim().length === 0) {
        throw new Error('device sent destinationJid must be a non-empty string')
    }
    if (message.deviceSentMessage) {
        return message
    }

    const rootContext = message.messageContextInfo ?? undefined
    if (!rootContext) {
        return {
            deviceSentMessage: {
                destinationJid,
                message
            }
        }
    }

    return {
        messageContextInfo: {
            ...rootContext
        },
        deviceSentMessage: {
            destinationJid,
            message: {
                ...message,
                messageContextInfo: undefined
            }
        }
    }
}

export function unwrapDeviceSentMessage(message: Proto.IMessage): Proto.IMessage | null {
    const nested = message.deviceSentMessage?.message ?? undefined
    if (!nested) {
        return null
    }

    const nestedContext = nested.messageContextInfo ?? undefined
    const rootContext = message.messageContextInfo ?? undefined
    const mergedContext: Proto.IMessageContextInfo = {
        ...(nestedContext ?? {}),
        messageSecret: nestedContext?.messageSecret ?? rootContext?.messageSecret,
        messageAssociation: nestedContext?.messageAssociation ?? rootContext?.messageAssociation,
        limitSharingV2: rootContext?.limitSharingV2 ?? nestedContext?.limitSharingV2,
        threadId: nestedContext?.threadId ?? rootContext?.threadId ?? [],
        botMetadata: nestedContext?.botMetadata ?? rootContext?.botMetadata
    }

    return {
        ...nested,
        messageContextInfo: mergedContext
    }
}
