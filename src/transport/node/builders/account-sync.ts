import {
    WA_DEFAULTS,
    WA_IQ_TYPES,
    WA_NODE_TAGS,
    WA_USYNC_CONTEXTS,
    WA_XMLNS
} from '@protocol/constants'
import { buildUsyncIq } from '@transport/node/builders/usync'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export function buildAccountDevicesSyncIq(userJids: readonly string[], sid: string): BinaryNode {
    return buildUsyncIq({
        sid,
        context: WA_USYNC_CONTEXTS.NOTIFICATION,
        queryProtocolNodes: [
            {
                tag: WA_NODE_TAGS.DEVICES,
                attrs: {
                    version: '2'
                }
            }
        ],
        users: userJids.map((jid) => ({
            jid
        }))
    })
}

export function buildAccountPictureSyncIq(meJid: string): BinaryNode {
    return buildIqNode(
        WA_IQ_TYPES.GET,
        WA_DEFAULTS.HOST_DOMAIN,
        WA_XMLNS.PROFILE_PICTURE,
        [
            {
                tag: WA_NODE_TAGS.PICTURE,
                attrs: {
                    type: 'image',
                    query: 'url'
                }
            }
        ],
        {
            target: meJid
        }
    )
}

export function buildAccountPrivacySyncIq(): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PRIVACY, [
        {
            tag: WA_NODE_TAGS.PRIVACY,
            attrs: {}
        }
    ])
}

export function buildAccountBlocklistSyncIq(): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.BLOCKLIST)
}

export function buildGroupsDirtySyncIq(): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.GROUP_SERVER, WA_XMLNS.GROUPS, [
        {
            tag: WA_NODE_TAGS.PARTICIPATING,
            attrs: {},
            content: [
                {
                    tag: WA_NODE_TAGS.PARTICIPANTS,
                    attrs: {}
                },
                {
                    tag: WA_NODE_TAGS.DESCRIPTION,
                    attrs: {}
                }
            ]
        }
    ])
}

export function buildNewsletterMetadataSyncIq(): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.GET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.NEWSLETTER, [
        {
            tag: WA_NODE_TAGS.MY_ADDONS,
            attrs: {
                limit: '1'
            }
        }
    ])
}

export function buildClearDirtyBitsIq(
    dirtyBits: readonly {
        readonly type: string
        readonly timestamp: number
    }[]
): BinaryNode {
    return buildIqNode(
        WA_IQ_TYPES.SET,
        WA_DEFAULTS.HOST_DOMAIN,
        WA_XMLNS.DIRTY_BITS,
        dirtyBits.map((dirtyBit) => ({
            tag: 'clean',
            attrs: {
                type: dirtyBit.type,
                timestamp: `${dirtyBit.timestamp}`
            }
        }))
    )
}
