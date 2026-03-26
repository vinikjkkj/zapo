import { WA_DEFAULTS, WA_NODE_TAGS, WA_XMLNS } from '@protocol/constants'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export type WaProfilePictureType = 'preview' | 'image'

export function buildGetProfilePictureIq(
    targetJid: string,
    type: WaProfilePictureType = 'preview',
    existingId?: string
): BinaryNode {
    const pictureAttrs: Record<string, string> = {
        type,
        query: 'url'
    }
    if (existingId) {
        pictureAttrs.id = existingId
    }
    return buildIqNode(
        'get',
        WA_DEFAULTS.HOST_DOMAIN,
        WA_XMLNS.PROFILE_PICTURE,
        [
            {
                tag: WA_NODE_TAGS.PICTURE,
                attrs: pictureAttrs
            }
        ],
        {
            target: targetJid
        }
    )
}

export function buildSetProfilePictureIq(imageBytes: Uint8Array, targetJid?: string): BinaryNode {
    const attrs: Record<string, string> = {}
    if (targetJid) {
        attrs.target = targetJid
    }
    return buildIqNode(
        'set',
        WA_DEFAULTS.HOST_DOMAIN,
        WA_XMLNS.PROFILE_PICTURE,
        [
            {
                tag: WA_NODE_TAGS.PICTURE,
                attrs: { type: 'image' },
                content: imageBytes
            }
        ],
        attrs
    )
}

export function buildDeleteProfilePictureIq(targetJid?: string): BinaryNode {
    const attrs: Record<string, string> = {}
    if (targetJid) {
        attrs.target = targetJid
    }
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.PROFILE_PICTURE, undefined, attrs)
}

export function buildSetStatusIq(text: string): BinaryNode {
    return buildIqNode('set', WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.STATUS, [
        {
            tag: 'status',
            attrs: {},
            content: text
        }
    ])
}

export function buildGetDisappearingModeUsyncQueryNode(): BinaryNode {
    return {
        tag: 'disappearing_mode',
        attrs: {}
    }
}

export function buildGetStatusUsyncQueryNodes(): readonly BinaryNode[] {
    return [
        {
            tag: WA_NODE_TAGS.CONTACT,
            attrs: {}
        },
        {
            tag: 'status',
            attrs: {}
        },
        {
            tag: WA_NODE_TAGS.PICTURE,
            attrs: {}
        }
    ]
}
