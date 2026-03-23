export function computeBucket(unixTimeS: number, durationS: number): number {
    return Math.floor(unixTimeS / durationS)
}

export function tokenExpirationCutoffS(
    nowS: number,
    durationS: number,
    numBuckets: number
): number {
    const currentBucket = computeBucket(nowS, durationS)
    const cutoffBucket = currentBucket - numBuckets
    return cutoffBucket * durationS
}

export function isTokenExpired(
    tokenTimestampS: number,
    nowS: number,
    durationS: number,
    numBuckets: number
): boolean {
    const cutoff = tokenExpirationCutoffS(nowS, durationS, numBuckets)
    return tokenTimestampS < cutoff
}

export function shouldSendNewToken(
    senderTimestampS: number,
    nowS: number,
    senderDurationS: number
): boolean {
    return computeBucket(senderTimestampS, senderDurationS) !== computeBucket(nowS, senderDurationS)
}

export function clampDuration(durationS: number, maxDurationS: number): number {
    return Math.min(durationS, maxDurationS)
}
