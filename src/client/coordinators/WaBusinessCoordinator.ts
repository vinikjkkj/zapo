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
import type { WaMediaConn } from '@media/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import {
    buildDeleteCoverPhotoIq,
    buildEditBusinessProfileIq,
    buildGetBusinessProfileIq,
    buildGetVerifiedNameIq,
    buildUpdateCoverPhotoIq,
    type WaEditBusinessProfileInput
} from '@transport/node/builders/business'
import { findNodeChild, getNodeChildren } from '@transport/node/helpers'
import { assertIqResult } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'

export interface WaBusinessCoordinator {
    readonly getBusinessProfile: (
        jids: readonly string[]
    ) => Promise<readonly WaBusinessProfileResult[]>
    readonly editBusinessProfile: (input: WaEditBusinessProfileInput) => Promise<void>
    readonly getVerifiedName: (jid: string) => Promise<WaVerifiedNameResult | null>
    readonly updateCoverPhoto: (media: WaUploadMediaSource) => Promise<void>
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
    const vnNode = findNodeChild(result, 'verified_name')
    if (!vnNode) return null
    return parseVerifiedNameNode(vnNode)
}

export function createBusinessCoordinator(
    options: WaBusinessCoordinatorOptions
): WaBusinessCoordinator {
    const { queryWithContext, mediaTransfer, getMediaConn, logger } = options

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
                readonly fbid?: string
                readonly ts?: string
                readonly meta_hmac?: string
            }>(upload.responseBytes, 'business cover photo upload')
            if (!parsed.fbid || !parsed.ts || !parsed.meta_hmac) {
                throw new Error('business cover photo upload response missing fbid/ts/meta_hmac')
            }
            const node = buildUpdateCoverPhotoIq(parsed.fbid, parsed.ts, parsed.meta_hmac)
            const result = await queryWithContext('business.updateCoverPhoto', node, undefined, {
                id: parsed.fbid
            })
            assertIqResult(result, 'business.updateCoverPhoto')
        },

        deleteCoverPhoto: async (id) => {
            const node = buildDeleteCoverPhotoIq(id)
            const result = await queryWithContext('business.deleteCoverPhoto', node, undefined, {
                id
            })
            assertIqResult(result, 'business.deleteCoverPhoto')
        }
    }
}
