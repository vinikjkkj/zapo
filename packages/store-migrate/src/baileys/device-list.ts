import type { WaDeviceListSnapshot } from 'zapo-js/store'

export function convertBaileysDeviceList(
    userJid: string,
    deviceJids: readonly string[],
    options: { readonly nowMs?: number } = {}
): WaDeviceListSnapshot {
    return {
        userJid,
        deviceJids,
        updatedAtMs: options.nowMs ?? Date.now()
    }
}
