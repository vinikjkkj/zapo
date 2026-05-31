import type { Logger, LogLevel } from '@infra/log/types'

const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50
}

const CONSOLE_WRITERS: Readonly<Record<LogLevel, (...args: unknown[]) => void>> = {
    trace: (...args) => console.debug(...args),
    debug: (...args) => console.debug(...args),
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args)
}

/**
 * Default zero-dependency {@link Logger} that writes structured records to
 * the standard `console` sinks. Messages below the configured `level` are
 * dropped without formatting cost.
 */
export class ConsoleLogger implements Logger {
    public readonly level: LogLevel
    private readonly minLevelPriority: number
    private readonly bindings: Readonly<Record<string, unknown>> | null

    /** @param level Minimum level to emit. Defaults to `'info'`. */
    public constructor(
        level: LogLevel = 'info',
        bindings: Readonly<Record<string, unknown>> | null = null
    ) {
        this.level = level
        this.minLevelPriority = LOG_LEVEL_PRIORITY[level]
        this.bindings = bindings
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

    /**
     * Returns a derived logger with `bindings` merged into the parent's
     * bindings. Per-call context still wins on key conflicts.
     */
    public child(bindings: Readonly<Record<string, unknown>>): Logger {
        const merged = this.bindings ? { ...this.bindings, ...bindings } : { ...bindings }
        return new ConsoleLogger(this.level, merged)
    }

    private write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
        if (LOG_LEVEL_PRIORITY[level] < this.minLevelPriority) {
            return
        }
        if (this.bindings) {
            CONSOLE_WRITERS[level](message, { ...this.bindings, ...context })
            return
        }
        CONSOLE_WRITERS[level](message, context)
    }
}
