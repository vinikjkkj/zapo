/** The `zapo-js` `Logger` shape, redeclared so a browser host can pass any matching object. */
export interface Logger {
    trace(message: string, context?: Readonly<Record<string, unknown>>): void
    debug(message: string, context?: Readonly<Record<string, unknown>>): void
    info(message: string, context?: Readonly<Record<string, unknown>>): void
    warn(message: string, context?: Readonly<Record<string, unknown>>): void
    error(message: string, context?: Readonly<Record<string, unknown>>): void
    child(bindings: Readonly<Record<string, unknown>>): Logger
}

function noop(): void {}

const NOOP_LOGGER: Logger = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => NOOP_LOGGER
}

export function createNoopLogger(): Logger {
    return NOOP_LOGGER
}
