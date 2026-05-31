import type { Logger, LogLevel } from '@infra/log/types'

type PinoLikeLogger = {
    level: string
    trace: (...args: unknown[]) => void
    debug: (...args: unknown[]) => void
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
    child?: (bindings: Readonly<Record<string, unknown>>) => PinoLikeLogger
}

type PinoFactory = (options?: Readonly<Record<string, unknown>>) => PinoLikeLogger

export interface PinoPrettyOptions {
    readonly colorize?: boolean
    readonly colorizeObjects?: boolean
    readonly translateTime?: boolean | string
    readonly ignore?: string
    readonly include?: string
    readonly singleLine?: boolean
    readonly hideObject?: boolean
    readonly levelFirst?: boolean
    readonly messageKey?: string
    readonly messageFormat?: string
    readonly timestampKey?: string
    readonly levelKey?: string
    readonly levelLabel?: string
    readonly minimumLevel?: LogLevel
    readonly errorLikeObjectKeys?: readonly string[]
    readonly errorProps?: string
    readonly customColors?: string
    readonly customLevels?: string
    readonly useOnlyCustomProps?: boolean
    readonly crlf?: boolean
    readonly destination?: number | string
    readonly append?: boolean
    readonly mkdir?: boolean
    readonly sync?: boolean
    readonly [key: string]: unknown
}

export interface PinoLoggerOptions {
    readonly level?: LogLevel
    readonly name?: string
    readonly base?: Readonly<Record<string, unknown>> | null
    readonly pinoOptions?: Readonly<Record<string, unknown>>
    readonly pretty?: boolean
    readonly prettyOptions?: PinoPrettyOptions
}

const PINO_MODULE = 'pino'
const PINO_PRETTY_MODULE = 'pino-pretty'

async function loadPinoFactory(): Promise<PinoFactory> {
    try {
        const loaded = await import(PINO_MODULE)
        if (typeof loaded === 'function') {
            return loaded as PinoFactory
        }
        const candidate = loaded && typeof loaded === 'object' ? loaded.default : undefined
        if (typeof candidate === 'function') {
            return candidate as PinoFactory
        }
        throw new Error('invalid pino module export')
    } catch {
        throw new Error('optional dependency "pino" is not installed. Install with: npm i pino')
    }
}

/**
 * {@link Logger} adapter over a Pino-shaped logger instance. Construct it
 * directly when you already have a configured Pino logger, or use
 * {@link createPinoLogger} to build one with the optional `pino` /
 * `pino-pretty` dependencies.
 */
export class PinoLogger implements Logger {
    public readonly level: LogLevel
    private readonly logger: PinoLikeLogger

    /**
     * @param logger Pino-compatible underlying logger.
     * @param level  Minimum level to emit (also forwarded to `logger.level`).
     */
    public constructor(logger: PinoLikeLogger, level: LogLevel = 'info') {
        this.logger = logger
        this.level = level
        this.logger.level = level
    }

    /** Emits a `trace` record. */
    public trace(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.write('trace', message, context)
    }

    /** Emits a `debug` record. */
    public debug(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.write('debug', message, context)
    }

    /** Emits an `info` record. */
    public info(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.write('info', message, context)
    }

    /** Emits a `warn` record. */
    public warn(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.write('warn', message, context)
    }

    /** Emits an `error` record. */
    public error(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.write('error', message, context)
    }

    /**
     * Returns a derived logger that pre-binds `bindings` into every log
     * call's context. Delegates to the underlying pino `child()` when
     * available; otherwise wraps with a parent + bindings merge.
     */
    public child(bindings: Readonly<Record<string, unknown>>): Logger {
        if (typeof this.logger.child === 'function') {
            return new PinoLogger(this.logger.child(bindings), this.level)
        }
        return new BoundLogger(this, bindings)
    }

    private write(
        level: LogLevel,
        message: string,
        context?: Readonly<Record<string, unknown>>
    ): void {
        if (context === null || context === undefined) {
            this.logger[level](message)
            return
        }
        for (const key in context) {
            if (Object.prototype.hasOwnProperty.call(context, key)) {
                this.logger[level](context, message)
                return
            }
        }
        this.logger[level](message)
    }
}

/**
 * Fallback {@link Logger} that pre-binds context fields by merging them
 * into every call before delegating to a parent logger. Used when the
 * underlying logger does not support `child()` natively.
 */
class BoundLogger implements Logger {
    public readonly level: LogLevel
    private readonly parent: Logger
    private readonly bindings: Readonly<Record<string, unknown>>

    public constructor(parent: Logger, bindings: Readonly<Record<string, unknown>>) {
        this.parent = parent
        this.level = parent.level
        this.bindings = bindings
    }

    public trace(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.parent.trace(message, this.merge(context))
    }

    public debug(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.parent.debug(message, this.merge(context))
    }

    public info(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.parent.info(message, this.merge(context))
    }

    public warn(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.parent.warn(message, this.merge(context))
    }

    public error(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.parent.error(message, this.merge(context))
    }

    public child(bindings: Readonly<Record<string, unknown>>): Logger {
        return new BoundLogger(this.parent, { ...this.bindings, ...bindings })
    }

    private merge(
        context: Readonly<Record<string, unknown>> | undefined
    ): Readonly<Record<string, unknown>> {
        return context ? { ...this.bindings, ...context } : this.bindings
    }
}

/**
 * Dynamically loads `pino` (and optionally `pino-pretty` when `pretty` is set),
 * configures it with the given options, and wraps it in a {@link PinoLogger}.
 * Throws if the optional `pino` dependency is not installed.
 */
export async function createPinoLogger(options: PinoLoggerOptions = {}): Promise<PinoLogger> {
    const level = options.level ?? 'info'
    const pino = await loadPinoFactory()
    const pinoOptions: Record<string, unknown> = {
        ...(options.pinoOptions ?? {}),
        level
    }

    if (options.name) {
        pinoOptions.name = options.name
    }
    if (options.base !== undefined) {
        pinoOptions.base = options.base
    }
    if (options.pretty) {
        pinoOptions.transport = options.prettyOptions
            ? {
                  target: PINO_PRETTY_MODULE,
                  options: options.prettyOptions
              }
            : {
                  target: PINO_PRETTY_MODULE
              }
    }

    const pinoLogger = pino(pinoOptions)
    return new PinoLogger(pinoLogger, level)
}
