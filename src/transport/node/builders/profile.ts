import {
    WA_ADDRESSING_MODES,
    WA_DEFAULTS,
    WA_IQ_TYPES,
    WA_NODE_TAGS,
    WA_XMLNS
} from '@protocol/constants'
import { buildIqNode } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export type WaProfilePictureType = 'preview' | 'image'

export function buildGetProfilePictureIq(
    targetJid: string,
    type: WaProfilePictureType = 'preview',
    existingId?: string,
    privacyTokenNode?: BinaryNode
): BinaryNode {
    const pictureAttrs: Record<string, string> = {
        type,
        query: 'url'
    }
    if (existingId) {
        pictureAttrs.id = existingId
    }
    return buildIqNode(
        WA_IQ_TYPES.GET,
        WA_DEFAULTS.HOST_DOMAIN,
        WA_XMLNS.PROFILE_PICTURE,
        [
            {
                tag: WA_NODE_TAGS.PICTURE,
                attrs: pictureAttrs,
                ...(privacyTokenNode ? { content: [privacyTokenNode] } : {})
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
        WA_IQ_TYPES.SET,
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
    return buildIqNode(
        WA_IQ_TYPES.SET,
        WA_DEFAULTS.HOST_DOMAIN,
        WA_XMLNS.PROFILE_PICTURE,
        undefined,
        attrs
    )
}

export function buildSetStatusIq(text: string): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.STATUS, [
        {
            tag: WA_NODE_TAGS.STATUS,
            attrs: {},
            content: text
        }
    ])
}

export function buildGetDisappearingModeUsyncQueryNode(): BinaryNode {
    return {
        tag: WA_NODE_TAGS.DISAPPEARING_MODE,
        attrs: {}
    }
}

export function buildSetDisappearingModeIq(durationSeconds: number): BinaryNode {
    return buildIqNode(WA_IQ_TYPES.SET, WA_DEFAULTS.HOST_DOMAIN, WA_XMLNS.DISAPPEARING_MODE, [
        {
            tag: WA_NODE_TAGS.DISAPPEARING_MODE,
            attrs: { duration: String(durationSeconds) }
        }
    ])
}

export function buildGetTextStatusUsyncQueryNode(): BinaryNode {
    return {
        tag: WA_NODE_TAGS.TEXT_STATUS,
        attrs: {}
    }
}

export function buildGetUsernameUsyncQueryNode(): BinaryNode {
    return {
        tag: WA_NODE_TAGS.USERNAME,
        attrs: {}
    }
}

/**
 * `contact` answers with the resolved user plus its reachability `type`,
 * `business` with the verified name. WhatsApp Web pins `contact` to LID
 * addressing here, so the lookup resolves to a LID.
 */
export function buildUsernameLookupUsyncQueryNodes(): readonly BinaryNode[] {
    return [
        {
            tag: WA_NODE_TAGS.CONTACT,
            attrs: { addressing_mode: WA_ADDRESSING_MODES.LID }
        },
        {
            tag: WA_NODE_TAGS.BUSINESS,
            attrs: {},
            content: [{ tag: 'verified_name', attrs: {} }]
        }
    ]
}

export interface BuildUsernameLookupContactNodeInput {
    readonly username: string
    readonly usernameKey?: string
}

/**
 * The `<contact>` child identifying the account in a username lookup. It goes
 * inside a `<user>` carrying no `jid` - the handle is the identifier - with
 * the optional lookup key in `pin`.
 */
export function buildUsernameLookupContactNode(
    input: BuildUsernameLookupContactNodeInput
): BinaryNode {
    const attrs: Record<string, string> = { username: input.username }
    if (input.usernameKey) {
        attrs.pin = input.usernameKey
    }
    return {
        tag: WA_NODE_TAGS.CONTACT,
        attrs
    }
}

export function buildGetStatusUsyncQueryNodes(): readonly BinaryNode[] {
    return [
        {
            tag: WA_NODE_TAGS.CONTACT,
            attrs: {}
        },
        {
            tag: WA_NODE_TAGS.STATUS,
            attrs: {}
        },
        {
            tag: WA_NODE_TAGS.PICTURE,
            attrs: {}
        }
    ]
}
