export type GetClockSkewMs = () => number | null | undefined

export interface ServerClock {
    nowMs(): number
    nowSeconds(): number
}

export function createServerClock(getClockSkewMs: GetClockSkewMs): ServerClock {
    return {
        nowMs() {
            const skewMs = getClockSkewMs()
            const nowMs = Date.now()
            return Number.isFinite(skewMs) ? nowMs + (skewMs as number) : nowMs
        },
        nowSeconds() {
            const skewMs = getClockSkewMs()
            const nowMs = Date.now()
            const correctedMs = Number.isFinite(skewMs) ? nowMs + (skewMs as number) : nowMs
            return Math.floor(correctedMs / 1_000)
        }
    }
}
