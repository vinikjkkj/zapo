import { WA_DEFAULTS, WA_IQ_TYPES, WA_NODE_TAGS, WA_SIGNALING, WA_XMLNS } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'
import { ZERO_BYTES } from '@util/bytes'

export function buildCompanionHelloRequestNode(args: {
    readonly phoneJid: string
    readonly shouldShowPushNotification: boolean
    readonly wrappedCompanionEphemeralPub: Uint8Array
    readonly companionServerAuthKeyPub: Uint8Array
    readonly companionPlatformId: string
    readonly companionPlatformDisplay: string
}): BinaryNode {
    return {
        tag: WA_NODE_TAGS.IQ,
        attrs: {
            to: WA_DEFAULTS.HOST_DOMAIN,
            type: WA_IQ_TYPES.SET,
            xmlns: WA_XMLNS.MD
        },
        content: [
            {
                tag: WA_NODE_TAGS.LINK_CODE_COMPANION_REG,
                attrs: {
                    jid: args.phoneJid,
                    stage: WA_SIGNALING.LINK_CODE_STAGE_COMPANION_HELLO,
                    should_show_push_notification: args.shouldShowPushNotification
                        ? 'true'
                        : 'false'
                },
                content: [
                    {
                        tag: 'link_code_pairing_wrapped_companion_ephemeral_pub',
                        attrs: {},
                        content: args.wrappedCompanionEphemeralPub
                    },
                    {
                        tag: 'companion_server_auth_key_pub',
                        attrs: {},
                        content: args.companionServerAuthKeyPub
                    },
                    {
                        tag: 'companion_platform_id',
                        attrs: {},
                        content: args.companionPlatformId
                    },
                    {
                        tag: 'companion_platform_display',
                        attrs: {},
                        content: args.companionPlatformDisplay
                    },
                    {
                        tag: 'link_code_pairing_nonce',
                        attrs: {},
                        content: ZERO_BYTES
                    }
                ]
            }
        ]
    }
}

export function buildGetCountryCodeRequestNode(): BinaryNode {
    return {
        tag: WA_NODE_TAGS.IQ,
        attrs: {
            to: WA_DEFAULTS.HOST_DOMAIN,
            type: WA_IQ_TYPES.GET,
            xmlns: WA_XMLNS.MD
        },
        content: [
            {
                tag: WA_NODE_TAGS.LINK_CODE_COMPANION_REG,
                attrs: {
                    stage: WA_SIGNALING.LINK_CODE_STAGE_GET_COUNTRY_CODE
                }
            }
        ]
    }
}

export function buildCompanionFinishRequestNode(args: {
    readonly phoneJid: string
    readonly wrappedKeyBundle: Uint8Array
    readonly companionIdentityPublic: Uint8Array
    readonly ref: Uint8Array
}): BinaryNode {
    return {
        tag: WA_NODE_TAGS.IQ,
        attrs: {
            to: WA_DEFAULTS.HOST_DOMAIN,
            type: WA_IQ_TYPES.SET,
            xmlns: WA_XMLNS.MD
        },
        content: [
            {
                tag: WA_NODE_TAGS.LINK_CODE_COMPANION_REG,
                attrs: {
                    jid: args.phoneJid,
                    stage: WA_SIGNALING.LINK_CODE_STAGE_COMPANION_FINISH
                },
                content: [
                    {
                        tag: 'link_code_pairing_wrapped_key_bundle',
                        attrs: {},
                        content: args.wrappedKeyBundle
                    },
                    {
                        tag: 'companion_identity_public',
                        attrs: {},
                        content: args.companionIdentityPublic
                    },
                    {
                        tag: WA_NODE_TAGS.LINK_CODE_PAIRING_REF,
                        attrs: {},
                        content: args.ref
                    }
                ]
            }
        ]
    }
}
