import { isGroupOrBroadcastJid } from '@protocol/jid'

interface ReceiptTarget {
    readonly chatJid: string
    readonly id: string
    readonly senderJid?: string
    readonly isGroupChat?: boolean
    readonly isBroadcastChat?: boolean
}

interface AggregatedReceiptGroup {
    readonly jid: string
    readonly ids: readonly string[]
    readonly participant?: string
}

function needsParticipant(target: ReceiptTarget): boolean {
    if (target.isGroupChat !== undefined || target.isBroadcastChat !== undefined) {
        return target.isGroupChat === true || target.isBroadcastChat === true
    }
    return isGroupOrBroadcastJid(target.chatJid)
}

export function aggregateReceiptTargets(
    targets: readonly ReceiptTarget[]
): readonly AggregatedReceiptGroup[] {
    const groups = new Map<string, { jid: string; participant?: string; ids: string[] }>()
    for (const target of targets) {
        const participant =
            needsParticipant(target) && target.senderJid && target.senderJid !== target.chatJid
                ? target.senderJid
                : undefined
        const key = `${target.chatJid}|${participant ?? ''}`
        let group = groups.get(key)
        if (!group) {
            group = { jid: target.chatJid, participant, ids: [] }
            groups.set(key, group)
        }
        group.ids.push(target.id)
    }
    return [...groups.values()]
}
