export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

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
     */
    child(bindings: Readonly<Record<string, unknown>>): Logger
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
        child: () => logger
    }
    return logger
}
