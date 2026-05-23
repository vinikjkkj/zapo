import type { Logger } from '@infra/log/types'

import type { WaUsyncResultEnvelope } from './builders/usync'
import { createNodeIdGenerator } from './helpers'

export type WaUsyncSidGenerator = () => Promise<string>

export function createUsyncSidGenerator(): WaUsyncSidGenerator {
    const generatorPromise = createNodeIdGenerator()
    return async () => (await generatorPromise).next()
}

export function logUsyncProtocolErrors(
    envelope: WaUsyncResultEnvelope,
    logger: Logger,
    context: string
): void {
    for (const protocol of Object.keys(envelope.errors)) {
        const err = envelope.errors[protocol]
        logger.warn('usync protocol error', {
            context,
            protocol,
            code: err.code,
            text: err.text,
            backoffSeconds: err.backoffSeconds
        })
    }
}
