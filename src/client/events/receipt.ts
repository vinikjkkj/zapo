import { isGroupJid } from '@protocol/jid'

interface ReceiptTarget {
    readonly chatJid: string
    readonly id: string
    readonly senderJid?: string
    readonly isGroupChat?: boolean
}

interface AggregatedReceiptGroup {
    readonly jid: string
    readonly ids: readonly string[]
    readonly participant?: string
}

export function aggregateReceiptTargets(
    targets: readonly ReceiptTarget[]
): readonly AggregatedReceiptGroup[] {
    const groups = new Map<string, { jid: string; participant?: string; ids: string[] }>()
    for (const target of targets) {
        const isGroup = target.isGroupChat ?? isGroupJid(target.chatJid)
        const participant =
            isGroup && target.senderJid && target.senderJid !== target.chatJid
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
