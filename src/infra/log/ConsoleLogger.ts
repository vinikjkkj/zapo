import type { Logger, LogLevel } from '@infra/log/types'

const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50
}

const CONSOLE_WRITERS: Readonly<Record<LogLevel, (...args: unknown[]) => void>> = {
    trace: console.debug,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error
}

/**
 * Default zero-dependency {@link Logger} that writes structured records to
 * the standard `console` sinks. Messages below the configured `level` are
 * dropped without formatting cost.
 */
export class ConsoleLogger implements Logger {
    public readonly level: LogLevel
    private readonly minLevelPriority: number

    /** @param level Minimum level to emit. Defaults to `'info'`. */
    public constructor(level: LogLevel = 'info') {
        this.level = level
        this.minLevelPriority = LOG_LEVEL_PRIORITY[level]
    }

    /** Emits a `trace` record. */
    public trace(message: string, context?: Record<string, unknown>): void {
        this.write('trace', message, context)
    }

    /** Emits a `debug` record. */
    public debug(message: string, context?: Record<string, unknown>): void {
        this.write('debug', message, context)
    }

    /** Emits an `info` record. */
    public info(message: string, context?: Record<string, unknown>): void {
        this.write('info', message, context)
    }

    /** Emits a `warn` record. */
    public warn(message: string, context?: Record<string, unknown>): void {
        this.write('warn', message, context)
    }

    /** Emits an `error` record. */
    public error(message: string, context?: Record<string, unknown>): void {
        this.write('error', message, context)
    }

    private write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
        if (LOG_LEVEL_PRIORITY[level] < this.minLevelPriority) {
            return
        }
        CONSOLE_WRITERS[level](message, context)
    }
}
