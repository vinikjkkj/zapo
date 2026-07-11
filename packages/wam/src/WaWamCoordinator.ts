import {
    WA_WAM_BUFFER_CONSTANTS,
    WA_WAM_EVENTS,
    type WaWamChannel,
    type WaWamEventArgs,
    type WaWamEventName
} from '@vinikjkkj/wa-wam'
import type { Logger, LogLevel, WaClientPluginContext } from 'zapo-js'
import { toError } from 'zapo-js/util'

import { resolveWamGlobals, type WamGlobalsInput } from './globals.js'
import { resolveWamEventFields } from './registry.js'
import { WaWamSyntheticUi, type WaWamSyntheticUiOptions } from './synthetic/index.js'
import { WaWamAutoEmitter } from './WaWamAutoEmitter.js'
import { WaWamUploader } from './WaWamUploader.js'
import { WamBatch, type WamGlobalValue } from './wire/WamBatch.js'

const SEQUENCE_MAX = 65_535

export interface WaWamCoordinatorOptions {
    /** Minimum log level for the plugin (defaults to the host client's). */
    readonly logLevel?: LogLevel
    /** Coalesce window before a non-empty buffer flushes (default 5s). */
    readonly flushIntervalMs?: number
    /** Byte size that forces an immediate flush (default 50KB). */
    readonly maxBufferSize?: number
    /** Overrides the advertised app version (defaults to `WA_VERSION`). */
    readonly appVersion?: string
    /** `service_improvement_opt_out` consent bit (default `false`). */
    readonly serviceImprovementOptOut?: boolean
    /** Auto-emit protocol events by observing the client (default `true`). */
    readonly autoEmit?: boolean
    /**
     * Fabricate plausible UI (`UiAction`) telemetry so the event profile mimics a
     * human WA Web session. On by default; pass `false` to disable, or an options
     * object to tune it. Best-effort anti-fingerprinting: everything is jittered
     * and rate-limited, since badly-timed fabrication is a worse tell than none.
     */
    readonly syntheticUi?: boolean | WaWamSyntheticUiOptions
}

/**
 * Owns the WAM telemetry pipeline for one client: accumulates committed events
 * into a per-channel {@link WamBatch} and flushes on size/interval/dispose.
 * Exposed as `client.wam`.
 *
 * @example
 * ```ts
 * client.wam.commit('UiAction', { uiActionType: 'CHAT_OPEN', uiActionT: 142 })
 * ```
 */
export class WaWamCoordinator {
    private readonly logger: Logger
    private readonly uploader: WaWamUploader
    private readonly globalsInput: WamGlobalsInput
    private readonly globalsByChannel = new Map<WaWamChannel, ReadonlyMap<number, WamGlobalValue>>()
    private readonly openBatches = new Map<WaWamChannel, WamBatch>()
    private readonly sequenceByChannel = new Map<WaWamChannel, number>()
    private readonly streamId: number
    private readonly flushIntervalMs: number
    private readonly maxBufferSize: number
    private readonly autoEmitter: WaWamAutoEmitter | null
    private readonly syntheticUi: WaWamSyntheticUi | null
    private flushTimer: ReturnType<typeof setTimeout> | null = null
    private disposed = false
    private readonly isConnected: () => boolean

    constructor(ctx: WaClientPluginContext, options: WaWamCoordinatorOptions = {}) {
        this.logger = ctx.logger.child({ scope: '@zapo-js/wam' }, { level: options.logLevel })
        this.uploader = new WaWamUploader({ query: ctx.queryWithContext, logger: this.logger })
        this.streamId = 1 + Math.floor(Math.random() * 255)
        this.flushIntervalMs =
            options.flushIntervalMs ??
            (WA_WAM_BUFFER_CONSTANTS.inMemoryBufferingDurationSecs ?? 5) * 1_000
        this.maxBufferSize =
            options.maxBufferSize ?? WA_WAM_BUFFER_CONSTANTS.maxBufferSize ?? 50_000
        this.globalsInput = {
            deviceBrowser: ctx.options.deviceBrowser,
            deviceOsDisplayName: ctx.options.deviceOsDisplayName,
            devicePlatform: ctx.options.devicePlatform,
            streamId: this.streamId,
            appVersion: options.appVersion,
            serviceImprovementOptOut: options.serviceImprovementOptOut
        }
        this.autoEmitter = options.autoEmit === false ? null : new WaWamAutoEmitter(this, ctx)
        this.syntheticUi =
            options.syntheticUi === false
                ? null
                : new WaWamSyntheticUi(
                      this,
                      ctx,
                      options.syntheticUi !== null && typeof options.syntheticUi === 'object'
                          ? options.syntheticUi
                          : {}
                  )
        this.isConnected = (): boolean => ctx.deps.connectionManager.isConnected()
    }

    /**
     * Commits one WAM event, buffered until the next flush. Dropped by the same
     * `Math.random() * weight > 1` sampling gate WA applies (and if unknown).
     */
    commit<K extends WaWamEventName>(name: K, payload: WaWamEventArgs<K> = {}): void {
        if (this.disposed) return
        const definition = WA_WAM_EVENTS[name]
        if (definition === undefined) return
        const weight = definition.weight.default ?? 1
        if (Math.random() * weight > 1) return
        const fields = resolveWamEventFields(name, payload)
        const batch = this.openBatch(definition.channel)
        batch.writeEvent(Date.now(), definition.id, weight, fields)
        if (batch.size() >= this.maxBufferSize) {
            void this.flushChannel(definition.channel)
        } else {
            this.scheduleFlush()
        }
    }

    async flush(): Promise<void> {
        this.clearTimer()
        const channels = [...this.openBatches.keys()]
        for (const channel of channels) await this.flushChannel(channel)
    }

    /** Flushes remaining batches and stops accepting new events. */
    async dispose(): Promise<void> {
        this.commit('WebWamForceFlush', {})
        this.disposed = true
        this.autoEmitter?.dispose()
        this.syntheticUi?.dispose()
        await this.flush()
    }

    private openBatch(channel: WaWamChannel): WamBatch {
        let batch = this.openBatches.get(channel)
        if (batch === undefined) {
            batch = new WamBatch(
                channel,
                this.streamId,
                this.nextSequence(channel),
                this.globalsFor(channel)
            )
            this.openBatches.set(channel, batch)
        }
        return batch
    }

    private async flushChannel(channel: WaWamChannel): Promise<void> {
        const batch = this.openBatches.get(channel)
        if (batch === undefined) return
        this.openBatches.delete(channel)
        if (!batch.hasEvents()) return
        if (!this.isConnected()) {
            this.logger.trace('wam batch dropped: not connected', {
                channel,
                size: batch.size()
            })
            return
        }
        await this.uploader.upload(batch.toBytes())
    }

    private globalsFor(channel: WaWamChannel): ReadonlyMap<number, WamGlobalValue> {
        let globals = this.globalsByChannel.get(channel)
        if (globals === undefined) {
            globals = resolveWamGlobals(this.globalsInput, channel)
            this.globalsByChannel.set(channel, globals)
        }
        return globals
    }

    private nextSequence(channel: WaWamChannel): number {
        const current = this.sequenceByChannel.get(channel)
        const next = current === undefined || current >= SEQUENCE_MAX ? 1 : current + 1
        this.sequenceByChannel.set(channel, next)
        return next
    }

    private scheduleFlush(): void {
        if (this.flushTimer !== null) return
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null
            void this.flush().catch((error) => {
                this.logger.debug('wam flush failed', { message: toError(error).message })
            })
        }, this.flushIntervalMs)
        this.flushTimer.unref?.()
    }

    private clearTimer(): void {
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer)
            this.flushTimer = null
        }
    }
}
