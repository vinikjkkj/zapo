import { WA_DEFAULTS } from '@protocol/defaults'
import { WA_XMLNS } from '@protocol/nodes'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export function buildRemoveCompanionDeviceIq(deviceJid: string, reason: string): BinaryNode {
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.MD, [
        {
            tag: 'remove-companion-device',
            attrs: { jid: deviceJid, reason }
        }
    ])
}
