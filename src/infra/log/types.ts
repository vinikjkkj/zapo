export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

export const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50
}

export interface LoggerChildOptions {
    /** Minimum level the derived logger emits; defaults to the parent's level. */
    readonly level?: LogLevel
}

export interface Logger {
    readonly level: LogLevel
    trace(message: string, context?: Readonly<Record<string, unknown>>): void
    debug(message: string, context?: Readonly<Record<string, unknown>>): void
    info(message: string, context?: Readonly<Record<string, unknown>>): void
    warn(message: string, context?: Readonly<Record<string, unknown>>): void
    error(message: string, context?: Readonly<Record<string, unknown>>): void
    /**
     * Returns a derived logger that pre-binds `bindings` into every log
     * call's context object. Bindings stack: `parent.child(a).child(b)`
     * merges `{ ...a, ...b }`. Per-call context wins on key conflicts.
     * Pass `options.level` to give the child its own minimum level
     * (independent of the parent), e.g. to quiet a noisy subsystem.
     */
    child(bindings: Readonly<Record<string, unknown>>, options?: LoggerChildOptions): Logger
}

function noop(): void {}

export function createNoopLogger(level: LogLevel = 'trace'): Logger {
    const logger: Logger = {
        level,
        trace: noop,
        debug: noop,
        info: noop,
        warn: noop,
        error: noop,
        child: (_bindings, options) => (options?.level ? createNoopLogger(options.level) : logger)
    }
    return logger
}
