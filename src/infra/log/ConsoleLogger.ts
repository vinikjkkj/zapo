import type { LogLevel, Logger } from '@infra/log/types'

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

export class ConsoleLogger implements Logger {
    public readonly level: LogLevel
    private readonly minLevelPriority: number

    public constructor(level: LogLevel = 'info') {
        this.level = level
        this.minLevelPriority = LOG_LEVEL_PRIORITY[level]
    }

    public trace(message: string, context?: Record<string, unknown>): void {
        this.write('trace', message, context)
    }

    public debug(message: string, context?: Record<string, unknown>): void {
        this.write('debug', message, context)
    }

    public info(message: string, context?: Record<string, unknown>): void {
        this.write('info', message, context)
    }

    public warn(message: string, context?: Record<string, unknown>): void {
        this.write('warn', message, context)
    }

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
