import { parseBusinessProfileNode, parseVerifiedNameNode } from '@client/events/business'
import {
    assertMediaUploadStatus,
    parseMediaUploadJsonBody,
    performPlaintextMediaUpload,
    type WaUploadMediaSource
} from '@client/media'
import type { WaBusinessProfileResult, WaVerifiedNameResult } from '@client/types'
import type { Logger } from '@infra/log/types'
import { PPS_UPLOAD_PATHS } from '@media/constants'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import type { WaMediaConn } from '@media/types'
import { WA_NODE_TAGS } from '@protocol/nodes'
import { WA_BUSINESS_NOTIFICATION_TAGS } from '@protocol/notification'
import {
    buildCoverPhotoIq,
    buildEditBusinessProfileIq,
    buildGetBusinessProfileIq,
    buildGetBusinessUsyncQueryNode,
    buildGetVerifiedNameIq,
    type WaEditBusinessProfileInput
} from '@transport/node/builders/business'
import {
    buildUsyncIq,
    iterateUsyncUsers,
    parseUsyncResultEnvelope
} from '@transport/node/builders/usync'
import { findNodeChild, getNodeChildren } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import { logUsyncProtocolErrors } from '@transport/node/usync'
import type { BinaryNode } from '@transport/types'

export interface WaVerifiedNameBatchEntry {
    readonly jid: string
    readonly verifiedName: WaVerifiedNameResult | null
}

/**
 * Coordinates WhatsApp Business profile reads/writes (profile body, verified
 * name, cover photo). Accessed via {@link WaClient.business}.
 *
 * Read methods (`getBusinessProfile`, `getVerifiedName`, `getVerifiedNames`)
 * work from any account. Write methods (`editBusinessProfile`,
 * `updateCoverPhoto`, `deleteCoverPhoto`) are **business-only**: they target
 * the current account's own business profile and the server rejects them
 * when the account is not registered as a WhatsApp Business account.
 */
export interface WaBusinessCoordinator {
    /** Batched fetch of business profile bodies (about, address, hours, ...). */
    readonly getBusinessProfile: (
        jids: readonly string[]
    ) => Promise<readonly WaBusinessProfileResult[]>
    /**
     * Edits the current account's business profile. **Business-only** - throws
     * on regular WhatsApp accounts.
     */
    readonly editBusinessProfile: (input: WaEditBusinessProfileInput) => Promise<void>
    /** Fetches a single business verified-name record (or `null`). */
    readonly getVerifiedName: (jid: string) => Promise<WaVerifiedNameResult | null>
    /** Batched verified-name lookup over many JIDs (usync). */
    readonly getVerifiedNames: (
        jids: readonly string[]
    ) => Promise<readonly WaVerifiedNameBatchEntry[]>
    /**
     * Uploads and binds a new business cover photo. Returns the server-side
     * upload id – feed it back into {@link deleteCoverPhoto} to remove the
     * cover later. **Business-only** - throws on regular WhatsApp accounts.
     */
    readonly updateCoverPhoto: (media: WaUploadMediaSource) => Promise<{ readonly id: string }>
    /**
     * Deletes the business cover photo by upload id (returned from
     * {@link updateCoverPhoto}). **Business-only** - throws on regular
     * WhatsApp accounts.
     */
    readonly deleteCoverPhoto: (id: string) => Promise<void>
}

interface WaBusinessCoordinatorOptions {
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly mediaTransfer: WaMediaTransferClient
    readonly getMediaConn: () => Promise<WaMediaConn>
    readonly logger: Logger
    readonly generateSid: () => Promise<string>
}

function parseBusinessProfiles(result: BinaryNode): readonly WaBusinessProfileResult[] {
    const bizNode = findNodeChild(result, 'business_profile')
    if (!bizNode) {
        return []
    }
    const profileNodes = getNodeChildren(bizNode)
    const results = new Array<WaBusinessProfileResult>(profileNodes.length)
    let count = 0
    for (let i = 0; i < profileNodes.length; i += 1) {
        const parsed = parseBusinessProfileNode(profileNodes[i])
        if (!parsed) continue
        results[count] = parsed
        count += 1
    }
    results.length = count
    return results
}

function parseVerifiedName(result: BinaryNode): WaVerifiedNameResult | null {
    const vnNode = findNodeChild(result, WA_BUSINESS_NOTIFICATION_TAGS.VERIFIED_NAME)
    if (!vnNode) return null
    return parseVerifiedNameNode(vnNode)
}

function parseUsyncVerifiedNames(result: BinaryNode): readonly WaVerifiedNameBatchEntry[] {
    const userNodes = iterateUsyncUsers(result) ?? []
    const out = new Array<WaVerifiedNameBatchEntry>(userNodes.length)
    let count = 0
    for (let i = 0; i < userNodes.length; i += 1) {
        const userNode = userNodes[i]
        const jid = userNode.attrs.jid as string | undefined
        if (!jid) continue
        const businessNode = findNodeChild(userNode, WA_NODE_TAGS.BUSINESS)
        const errorNode = businessNode ? findNodeChild(businessNode, WA_NODE_TAGS.ERROR) : undefined
        const vnNode =
            businessNode && !errorNode
                ? findNodeChild(businessNode, WA_BUSINESS_NOTIFICATION_TAGS.VERIFIED_NAME)
                : undefined
        out[count] = {
            jid,
            verifiedName: vnNode ? parseVerifiedNameNode(vnNode) : null
        }
        count += 1
    }
    out.length = count
    return out
}

/** Builds a {@link WaBusinessCoordinator} from its IQ/media dependencies. */
export function createBusinessCoordinator(
    options: WaBusinessCoordinatorOptions
): WaBusinessCoordinator {
    const { queryWithContext, mediaTransfer, getMediaConn, logger, generateSid } = options

    return {
        getBusinessProfile: async (jids) => {
            if (jids.length === 0) return []
            const node = buildGetBusinessProfileIq(jids)
            const result = await queryWithContext('business.getProfile', node, undefined, {
                count: jids.length
            })
            assertIqResult(result, 'business.getProfile')
            return parseBusinessProfiles(result)
        },

        editBusinessProfile: async (input) => {
            const node = buildEditBusinessProfileIq(input)
            const result = await queryWithContext('business.editProfile', node)
            assertIqResult(result, 'business.editProfile')
        },

        getVerifiedName: async (jid) => {
            const node = buildGetVerifiedNameIq(jid)
            const result = await queryWithContext('business.getVerifiedName', node, undefined, {
                jid
            })
            assertIqResult(result, 'business.getVerifiedName')
            return parseVerifiedName(result)
        },

        getVerifiedNames: async (jids) => {
            if (jids.length === 0) return []
            const sid = await generateSid()
            const usyncNode = buildUsyncIq({
                sid,
                queryProtocolNodes: [buildGetBusinessUsyncQueryNode()],
                users: jids.map((jid) => ({ jid }))
            })
            const result = await queryWithContext(
                'business.getVerifiedNames',
                usyncNode,
                undefined,
                { count: jids.length }
            )
            assertIqResult(result, 'business.getVerifiedNames')
            logUsyncProtocolErrors(
                parseUsyncResultEnvelope(result),
                logger,
                'business.getVerifiedNames'
            )
            return parseUsyncVerifiedNames(result)
        },

        updateCoverPhoto: async (media) => {
            const mediaConn = await getMediaConn()
            const upload = await performPlaintextMediaUpload(
                { mediaTransfer, mediaConn, logger },
                {
                    source: media,
                    path: PPS_UPLOAD_PATHS['biz-cover-photo'],
                    logLabel: 'sending business cover photo upload'
                }
            )
            assertMediaUploadStatus(upload.status, 'business cover photo upload')
            const parsed = parseMediaUploadJsonBody<{
                readonly fbid?: string | number
                readonly ts?: string | number
                readonly meta_hmac?: string
            }>(upload.responseBytes, 'business cover photo upload')
            if (
                parsed.fbid === undefined ||
                parsed.fbid === null ||
                parsed.fbid === '' ||
                parsed.ts === undefined ||
                parsed.ts === null ||
                parsed.ts === '' ||
                !parsed.meta_hmac
            ) {
                throw new Error('business cover photo upload response missing fbid/ts/meta_hmac')
            }
            const id = String(parsed.fbid)
            const ts = String(parsed.ts)
            const node = buildCoverPhotoIq({
                op: 'update',
                id,
                timestamp: ts,
                token: parsed.meta_hmac
            })
            const result = await queryWithContext('business.updateCoverPhoto', node, undefined, {
                id
            })
            assertIqResult(result, 'business.updateCoverPhoto')
            return { id }
        },

        deleteCoverPhoto: async (id) => {
            const node = buildCoverPhotoIq({ op: 'delete', id })
            const result = await queryWithContext('business.deleteCoverPhoto', node, undefined, {
                id
            })
            assertIqResult(result, 'business.deleteCoverPhoto')
        }
    }
}
