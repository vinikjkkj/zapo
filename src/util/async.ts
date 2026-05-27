/**
 * Returns a Promise that resolves after `ms` milliseconds. Thin wrapper over
 * `setTimeout` for use in `await` chains.
 */
export function delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
    })
}
