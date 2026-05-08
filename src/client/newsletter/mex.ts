import type { WaNewsletterMexEnvelope } from '@client/newsletter/types'
import type { Logger } from '@infra/log/types'
import type { AbPropName } from '@protocol/abprops'
import {
    buildTosQueryIq,
    buildTosUpdateIq,
    parseTosQueryResponse
} from '@transport/node/builders/tos'
import { dispatchMexQuery, type WaMexQuerySocket } from '@transport/node/mex/client'
import type { WaMexPersistId } from '@transport/node/mex/persist-ids'
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

export async function runMex<T>(
    deps: WaNewsletterMexDeps,
    persist: WaMexPersistId,
    opName: string,
    variables: Readonly<Record<string, unknown>>
): Promise<T> {
    const { data } = await dispatchMexQuery(deps.mexSocket, {
        docId: persist.docId,
        clientDocId: persist.clientDocId,
        opName,
        variables
    })
    return data as T
}

export async function runMexEnvelope(
    deps: WaNewsletterMexDeps,
    persist: WaMexPersistId,
    opName: string,
    variables: Readonly<Record<string, unknown>>
): Promise<WaNewsletterMexEnvelope> {
    const data = await runMex<Record<string, unknown> | null>(deps, persist, opName, variables)
    return data ?? {}
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
