import { release } from 'node:os'

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

/**
 * Returns the marketing OS version (`10`, `11`, `14.6`, ...) for the current
 * process, or `null` when it cannot be determined.
 *
 * WhatsApp Web fills `DeviceProps.version` from the browser's parsed
 * user-agent, which reports the OS as a user sees it – `10` for Windows 10,
 * `14.6` for macOS Sonoma. Node's `os.release()` instead reports the kernel
 * build (`10.0.26200` on Windows, the Darwin version on macOS), so the two
 * families are translated here and every other platform falls back to the raw
 * release string. Callers may bypass this entirely with an explicit option.
 */
export function getRuntimeOsVersion(): string | null {
    const raw = release()
    if (raw === '') {
        return null
    }
    if (process.platform === 'win32') {
        const [major, , build] = raw.split('.')
        if (major === '10') {
            return Number.parseInt(build ?? '0', 10) >= 22_000 ? '11' : '10'
        }
        return major ?? null
    }
    if (process.platform === 'darwin') {
        const darwinMajor = Number.parseInt(raw.split('.')[0] ?? '', 10)
        if (Number.isSafeInteger(darwinMajor) && darwinMajor >= 20) {
            const minor = raw.split('.')[1] ?? '0'
            return `${darwinMajor - 9}.${minor}`
        }
        return raw
    }
    return raw
}

/** Returns `true` when running under the Bun runtime. */
export function isBunRuntime(): boolean {
    return typeof (globalThis as { readonly Bun?: unknown }).Bun !== 'undefined'
}
