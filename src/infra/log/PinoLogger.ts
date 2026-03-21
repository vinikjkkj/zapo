import type { LogLevel, Logger } from '@infra/log/types'

type PinoLikeLogger = {
    level: string
    trace: (...args: unknown[]) => void
    debug: (...args: unknown[]) => void
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
}

type PinoFactory = (options?: Readonly<Record<string, unknown>>) => PinoLikeLogger

export interface PinoLoggerOptions {
    readonly level?: LogLevel
    readonly name?: string
    readonly base?: Readonly<Record<string, unknown>> | null
    readonly pinoOptions?: Readonly<Record<string, unknown>>
    readonly pretty?: boolean
    readonly prettyOptions?: Readonly<Record<string, unknown>>
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

export class PinoLogger implements Logger {
    public readonly level: LogLevel
    private readonly logger: PinoLikeLogger

    public constructor(logger: PinoLikeLogger, level: LogLevel = 'info') {
        this.logger = logger
        this.level = level
        this.logger.level = level
    }

    public trace(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.write('trace', message, context)
    }

    public debug(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.write('debug', message, context)
    }

    public info(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.write('info', message, context)
    }

    public warn(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.write('warn', message, context)
    }

    public error(message: string, context?: Readonly<Record<string, unknown>>): void {
        this.write('error', message, context)
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
