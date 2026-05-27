/**
 * Returns a human-friendly OS name (`Windows` / `Mac OS` / `Linux`) for the
 * current process, falling back to `process.platform` for other OSes.
 */
export function getRuntimeOsDisplayName(): string {
    switch (process.platform) {
        case 'win32':
            return 'Windows'
        case 'darwin':
            return 'Mac OS'
        case 'linux':
            return 'Linux'
        default:
            return process.platform
    }
}

/** Returns `true` when running under the Bun runtime. */
export function isBunRuntime(): boolean {
    return typeof (globalThis as { readonly Bun?: unknown }).Bun !== 'undefined'
}
