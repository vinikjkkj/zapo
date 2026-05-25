import type { Logger } from '@infra/log/types'
import type { WaMexOperationResponses, WaMexOperationVariables } from '@mex'
import type { AbPropName } from '@protocol/abprops'
import {
    buildTosQueryIq,
    buildTosUpdateIq,
    parseTosQueryResponse
} from '@transport/node/builders/tos'
import { runMexQuery, type WaMexOpKey, type WaMexQuerySocket } from '@transport/node/mex/client'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

export type WaNewsletterTosKind = 'creation' | 'consumer' | 'admin_invite'

export interface WaNewsletterMexDeps {
    readonly mexSocket: WaMexQuerySocket
    readonly queryWithContext?: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number
    ) => Promise<BinaryNode>
    readonly getAbPropString?: (name: AbPropName) => string
    readonly logger: Logger
}

export async function runMex<K extends WaMexOpKey>(
    deps: WaNewsletterMexDeps,
    opKey: K,
    variables: WaMexOperationVariables[K]
): Promise<WaMexOperationResponses[K] | null> {
    return runMexQuery(deps.mexSocket, opKey, variables)
}

function resolveTosId(deps: WaNewsletterMexDeps, kind: WaNewsletterTosKind): string | null {
    if (!deps.getAbPropString) return null
    const propName: AbPropName =
        kind === 'creation'
            ? 'newsletter_creation_tos_id'
            : kind === 'consumer'
              ? 'newsletter_tos_notice_id'
              : 'newsletter_admin_invite_tos_id'
    const id = deps.getAbPropString(propName)
    return id.length > 0 ? id : null
}

export async function ensureTosAccepted(
    deps: WaNewsletterMexDeps,
    kind: WaNewsletterTosKind
): Promise<void> {
    const noticeId = resolveTosId(deps, kind)
    if (!noticeId || !deps.queryWithContext) return
    try {
        const response = await deps.queryWithContext(
            'newsletter.query_tos',
            buildTosQueryIq([noticeId])
        )
        const parsed = parseTosQueryResponse(response)
        const existing = parsed.notices.find((entry) => entry.id === noticeId)
        if (existing?.accepted) return
        await deps.queryWithContext('newsletter.accept_tos', buildTosUpdateIq([noticeId]))
    } catch (error) {
        deps.logger.warn('newsletter tos auto-accept failed', {
            kind,
            noticeId,
            message: toError(error).message
        })
    }
}
