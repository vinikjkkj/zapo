import {
    buildNewsletterMessageContent,
    type WaNewsletterBuiltContent
} from '@client/newsletter/content'
import { ensureTosAccepted, runMex, type WaNewsletterMexDeps } from '@client/newsletter/mex'
import type {
    WaNewsletterMuteInput,
    WaNewsletterReactInput,
    WaNewsletterRevokeInput,
    WaNewsletterSendOptions,
    WaNewsletterSendResult,
    WaNewsletterViewReceiptInput,
    WaNewsletterVotePollInput
} from '@client/newsletter/types'
import type { WaMediaConn } from '@media/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import type { WaSendContextInfo } from '@message/context-info'
import type {
    WaMessagePublishOptions,
    WaMessagePublishResult,
    WaMessageUploadInfo,
    WaSendMessageContent
} from '@message/types'
import { WA_NEWSLETTER_MUTE_TYPES, WA_NEWSLETTER_MUTE_VALUES } from '@protocol/newsletter'
import { WA_NEWSLETTER_NOTIFICATION_TAGS } from '@protocol/notification'
import {
    buildNewsletterMessageNode,
    buildNewsletterMessagesIq,
    buildNewsletterMessageUpdatesIq,
    buildNewsletterSubscribeLiveUpdatesIq,
    buildNewsletterViewReceiptNode
} from '@transport/node/builders/newsletter'
import { findNodeChild } from '@transport/node/helpers'
import { WA_MEX_PERSIST_IDS } from '@transport/node/mex/persist-ids'
import type { BinaryNode } from '@transport/types'

export interface WaNewsletterMessagingDeps extends WaNewsletterMexDeps {
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly publishMessageNode: (
        node: BinaryNode,
        options?: WaMessagePublishOptions
    ) => Promise<WaMessagePublishResult>
    readonly generateStanzaId: () => Promise<string>
    readonly mediaTransfer?: WaMediaTransferClient
    readonly getMediaConn?: () => Promise<WaMediaConn>
}

export interface WaNewsletterMessagingOps {
    readonly sendMessage: (
        newsletterJid: string,
        content: WaSendMessageContent,
        options?: WaNewsletterSendOptions
    ) => Promise<WaNewsletterSendResult>
    readonly editMessage: (
        newsletterJid: string,
        parentMessageId: string,
        content: WaSendMessageContent
    ) => Promise<WaNewsletterSendResult>
    readonly react: (input: WaNewsletterReactInput) => Promise<{ readonly stanzaId: string }>
    readonly revoke: (input: WaNewsletterRevokeInput) => Promise<{ readonly stanzaId: string }>
    readonly votePoll: (input: WaNewsletterVotePollInput) => Promise<{ readonly stanzaId: string }>
    readonly sendViewReceipt: (
        input: WaNewsletterViewReceiptInput
    ) => Promise<{ readonly stanzaId: string }>
    readonly fetchMessages: (input: {
        readonly newsletterJid: string
        readonly count: number
        readonly before?: number
        readonly after?: number
        readonly viewRole?: string
    }) => Promise<BinaryNode>
    readonly fetchMessageUpdates: (input: {
        readonly newsletterJid: string
        readonly count: number
        readonly since?: number
        readonly before?: number
        readonly after?: number
    }) => Promise<BinaryNode>
    readonly subscribeLiveUpdates: (
        newsletterJid: string
    ) => Promise<{ readonly durationSeconds: number }>
    readonly follow: (newsletterJid: string) => Promise<void>
    readonly unfollow: (newsletterJid: string) => Promise<void>
    readonly mute: (input: WaNewsletterMuteInput) => Promise<void>
}

async function buildContent(
    deps: WaNewsletterMessagingDeps,
    content: WaSendMessageContent,
    ctx?: WaSendContextInfo | null
): Promise<WaNewsletterBuiltContent> {
    return buildNewsletterMessageContent(
        {
            logger: deps.logger,
            mediaTransfer: deps.mediaTransfer,
            getMediaConn: deps.getMediaConn
        },
        content,
        ctx
    )
}

function toUploadSummary(built: WaNewsletterBuiltContent): WaMessageUploadInfo | undefined {
    if (!built.upload) return undefined
    return {
        url: built.upload.url,
        directPath: built.upload.directPath,
        fileSha256: built.upload.fileSha256,
        fileLength: built.upload.fileLength,
        metadataUrl: built.upload.metadataUrl
    }
}

function buildDispatchNode(
    newsletterJid: string,
    stanzaId: string,
    built: WaNewsletterBuiltContent,
    edit: { readonly parentMessageId: string } | null
): BinaryNode {
    if (built.kind === 'poll-creation') {
        if (edit) {
            throw new Error('newsletter poll creation cannot be sent as an edit')
        }
        return buildNewsletterMessageNode({
            kind: 'poll-creation',
            to: newsletterJid,
            id: stanzaId,
            plaintext: built.plaintext
        })
    }
    if (built.kind === 'media') {
        if (built.mediaType === null) {
            throw new Error('newsletter media content missing mediaType attribute')
        }
        return buildNewsletterMessageNode(
            edit
                ? {
                      kind: 'edit-media',
                      to: newsletterJid,
                      parentMessageId: edit.parentMessageId,
                      plaintext: built.plaintext,
                      mediaType: built.mediaType
                  }
                : {
                      kind: 'media',
                      to: newsletterJid,
                      id: stanzaId,
                      plaintext: built.plaintext,
                      mediaType: built.mediaType,
                      mediaHandle: built.upload?.handle
                  }
        )
    }
    return buildNewsletterMessageNode(
        edit
            ? {
                  kind: 'edit-text',
                  to: newsletterJid,
                  parentMessageId: edit.parentMessageId,
                  plaintext: built.plaintext
              }
            : {
                  kind: 'text',
                  to: newsletterJid,
                  id: stanzaId,
                  plaintext: built.plaintext
              }
    )
}

export function createMessagingOps(deps: WaNewsletterMessagingDeps): WaNewsletterMessagingOps {
    async function resolveStanzaId(provided: string | undefined): Promise<string> {
        return provided ?? deps.generateStanzaId()
    }

    return {
        sendMessage: async (
            newsletterJid,
            content,
            sendOptions
        ): Promise<WaNewsletterSendResult> => {
            const stanzaId = await resolveStanzaId(sendOptions?.stanzaId)
            const built = await buildContent(deps, content, sendOptions?.contextInfo)
            const node = buildDispatchNode(newsletterJid, stanzaId, built, null)
            const result = await deps.publishMessageNode(node)
            return { ...result, upload: toUploadSummary(built) }
        },
        editMessage: async (newsletterJid, parentMessageId, content) => {
            const built = await buildContent(deps, content)
            if (built.kind === 'poll-creation') {
                throw new Error('newsletter poll creations cannot be edited')
            }
            const node = buildDispatchNode(newsletterJid, parentMessageId, built, {
                parentMessageId
            })
            const result = await deps.publishMessageNode(node)
            return { ...result, upload: toUploadSummary(built) }
        },
        react: async (input) => {
            const stanzaId = await resolveStanzaId(input.stanzaId)
            await deps.sendNode(
                buildNewsletterMessageNode(
                    input.revoke
                        ? {
                              kind: 'reaction-revoke',
                              to: input.newsletterJid,
                              id: stanzaId,
                              parentMessageServerId: input.parentMessageServerId
                          }
                        : {
                              kind: 'reaction',
                              to: input.newsletterJid,
                              id: stanzaId,
                              parentMessageServerId: input.parentMessageServerId,
                              reactionCode: input.reactionCode
                          }
                )
            )
            return { stanzaId }
        },
        revoke: async (input) => {
            const node = buildNewsletterMessageNode({
                kind: 'revoke',
                to: input.newsletterJid,
                originalMessageId: input.originalMessageId
            })
            const result = await deps.publishMessageNode(node)
            return { stanzaId: result.id }
        },
        votePoll: async (input) => {
            const stanzaId = await resolveStanzaId(input.stanzaId)
            await deps.sendNode(
                buildNewsletterMessageNode({
                    kind: 'poll-vote',
                    to: input.newsletterJid,
                    id: stanzaId,
                    parentMessageServerId: input.parentMessageServerId,
                    votes: input.votes,
                    contentType: input.contentType
                })
            )
            return { stanzaId }
        },
        sendViewReceipt: async (input) => {
            const stanzaId = await resolveStanzaId(input.stanzaId)
            await deps.sendNode(
                buildNewsletterViewReceiptNode({
                    to: input.newsletterJid,
                    id: stanzaId,
                    itemServerIds: input.itemServerIds
                })
            )
            return { stanzaId }
        },
        fetchMessages: async (input) => {
            if (!deps.queryWithContext) {
                throw new Error('newsletter fetchMessages requires queryWithContext')
            }
            return deps.queryWithContext(
                'newsletter.fetch_messages',
                buildNewsletterMessagesIq(input)
            )
        },
        fetchMessageUpdates: async (input) => {
            if (!deps.queryWithContext) {
                throw new Error('newsletter fetchMessageUpdates requires queryWithContext')
            }
            return deps.queryWithContext(
                'newsletter.fetch_message_updates',
                buildNewsletterMessageUpdatesIq(input)
            )
        },
        subscribeLiveUpdates: async (newsletterJid) => {
            if (!deps.queryWithContext) {
                throw new Error('newsletter subscribeLiveUpdates requires queryWithContext')
            }
            const response = await deps.queryWithContext(
                'newsletter.subscribe_live_updates',
                buildNewsletterSubscribeLiveUpdatesIq(newsletterJid)
            )
            const liveUpdates = findNodeChild(
                response,
                WA_NEWSLETTER_NOTIFICATION_TAGS.LIVE_UPDATES
            )
            const durationAttr = liveUpdates?.attrs.duration
            const parsed = durationAttr ? Number.parseInt(durationAttr, 10) : NaN
            if (!Number.isFinite(parsed) || parsed < 30 || parsed > 600) {
                throw new Error(
                    `newsletter subscribeLiveUpdates returned invalid duration: ${durationAttr}`
                )
            }
            return { durationSeconds: parsed }
        },
        follow: async (newsletterJid) => {
            await ensureTosAccepted(deps, 'consumer')
            await runMex<unknown>(deps, WA_MEX_PERSIST_IDS.NewsletterJoin, 'NewsletterJoin', {
                newsletter_id: newsletterJid
            })
        },
        unfollow: async (newsletterJid) => {
            await runMex<unknown>(deps, WA_MEX_PERSIST_IDS.NewsletterLeave, 'NewsletterLeave', {
                newsletter_id: newsletterJid
            })
        },
        mute: async (input) => {
            const muteType =
                input.type === 'admin'
                    ? WA_NEWSLETTER_MUTE_TYPES.ADMIN_ACTIVITY
                    : WA_NEWSLETTER_MUTE_TYPES.FOLLOWER_ACTIVITY
            const value = input.mute ? WA_NEWSLETTER_MUTE_VALUES.ON : WA_NEWSLETTER_MUTE_VALUES.OFF
            await runMex<unknown>(
                deps,
                WA_MEX_PERSIST_IDS.NewsletterUpdateUserSetting,
                'NewsletterUpdateUserSetting',
                {
                    input: {
                        newsletter_id: input.newsletterJid,
                        type: muteType,
                        value
                    }
                }
            )
        }
    }
}
