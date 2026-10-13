import type { Logger } from 'zapo-js'
import { toError } from 'zapo-js/util'

import type { WaCallMediaPlanUpdate } from '@zapo-js/voip-media'

import type { CallInfo } from './call-state.js'
import type { WaCallMediaLink } from './media-link.js'
import { samePlanValue } from './media-plan.js'

/** Hands one call's plan changes to its media link, dropping sections equal to the last ones. */
export class WaCallPlanPublisher {
    private readonly media: Pick<WaCallMediaLink, 'apply'>
    private readonly logger: Logger
    private readonly info: Pick<CallInfo, 'callId'>
    /** Last value published per plan section, so an unchanged one is not sent again. */
    private readonly publishedSections = new Map<string, unknown>()

    constructor(
        media: Pick<WaCallMediaLink, 'apply'>,
        logger: Logger,
        info: Pick<CallInfo, 'callId'>
    ) {
        this.media = media
        this.logger = logger
        this.info = info
    }

    /**
     * Hands a plan change to the media, leaving out sections equal to the last published ones;
     * `relays` always goes, since resending it asks a leg-less media side to dial. Failures log.
     */
    async publish(update: WaCallMediaPlanUpdate): Promise<void> {
        let changed: Record<string, unknown> | null = null
        for (const [section, value] of Object.entries(update)) {
            if (
                section !== 'relays' &&
                this.publishedSections.has(section) &&
                samePlanValue(this.publishedSections.get(section), value)
            ) {
                continue
            }
            this.publishedSections.set(section, value)
            ;(changed ??= {})[section] = value
        }
        if (!changed) return

        try {
            await this.media.apply(changed)
        } catch (err: unknown) {
            this.logger.error('media plan update failed', {
                callId: this.info.callId,
                message: toError(err).message
            })
        }
    }
}
