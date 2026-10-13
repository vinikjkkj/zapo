export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50
}

/** The `zapo-js` `Logger` shape, redeclared so a browser host can pass any matching object. */
export interface Logger {
    readonly level?: LogLevel
    trace(message: string, context?: Readonly<Record<string, unknown>>): void
    debug(message: string, context?: Readonly<Record<string, unknown>>): void
    info(message: string, context?: Readonly<Record<string, unknown>>): void
    warn(message: string, context?: Readonly<Record<string, unknown>>): void
    error(message: string, context?: Readonly<Record<string, unknown>>): void
    child(bindings: Readonly<Record<string, unknown>>): Logger
}

/** Whether `logger` emits `level`; a logger without a declared level is assumed to emit everything. */
export function isLogLevelEnabled(logger: Logger, level: LogLevel): boolean {
    return (
        logger.level === undefined || LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[logger.level]
    )
}

function noop(): void {}

/** A new silent logger per call, so a caller patching one changes no other. */
export function createNoopLogger(): Logger {
    const logger: Logger = {
        level: 'error',
        trace: noop,
        debug: noop,
        info: noop,
        warn: noop,
        error: noop,
        child: () => logger
    }
    return logger
}
