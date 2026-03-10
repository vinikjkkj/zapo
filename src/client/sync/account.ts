import { WA_ACCOUNT_SYNC_PROTOCOLS, WA_DEFAULTS, WA_NODE_TAGS, WA_XMLNS } from '../../protocol/constants'
import { buildIqNode } from '../../transport/node/query'
import type { BinaryNode } from '../../transport/types'

const ACCOUNT_SYNC_PROTOCOL_SET = new Set<string>(WA_ACCOUNT_SYNC_PROTOCOLS)

export function resolveAccountSyncProtocols(protocols: readonly string[]): readonly string[] {
    const selected = protocols.filter((protocol) => ACCOUNT_SYNC_PROTOCOL_SET.has(protocol))
    if (selected.length > 0) {
        return selected
    }
    return WA_ACCOUNT_SYNC_PROTOCOLS
}

export function buildAccountDevicesSyncIq(meJid: string, sid: string): BinaryNode {
    return buildIqNode('get', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.USYNC, [
        {
            tag: WA_NODE_TAGS.USYNC,
            attrs: {
                sid,
                index: '0',
                last: 'true',
                mode: WA_NODE_TAGS.QUERY,
                context: WA_NODE_TAGS.NOTIFICATION
            },
            content: [
                {
                    tag: WA_NODE_TAGS.QUERY,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.DEVICES,
                            attrs: {
                                version: '2'
                            }
                        }
                    ]
                },
                {
                    tag: WA_NODE_TAGS.LIST,
                    attrs: {},
                    content: [
                        {
                            tag: WA_NODE_TAGS.USER,
                            attrs: {
                                jid: meJid
                            }
                        }
                    ]
                }
            ]
        }
    ])
}

export function buildAccountPictureSyncIq(meJid: string): BinaryNode {
    return buildIqNode(
        'get',
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
    return buildIqNode('get', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PRIVACY, [
        {
            tag: WA_NODE_TAGS.PRIVACY,
            attrs: {}
        }
    ])
}

export function buildAccountBlocklistSyncIq(): BinaryNode {
    return buildIqNode('get', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.BLOCKLIST)
}

export function buildGroupsDirtySyncIq(): BinaryNode {
    return buildIqNode('get', WA_DEFAULTS.GROUP_SERVER, WA_XMLNS.GROUPS, [
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
    return buildIqNode('get', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.NEWSLETTER, [
        {
            tag: WA_NODE_TAGS.MY_ADDONS,
            attrs: {
                limit: '1'
            }
        }
    ])
}
