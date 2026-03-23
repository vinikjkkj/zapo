function mergePreferredParsedResult<T>(
    target: Map<string, T>,
    key: string,
    next: T,
    isPreferred: (value: T) => boolean
): void {
    const current = target.get(key)
    if (!current || !isPreferred(current)) {
        target.set(key, next)
    }
}

export function registerParsedResultByRawAndCanonicalKey<T>(
    parsedByRawKey: Map<string, T>,
    parsedByCanonicalKey: Map<string, T>,
    rawKey: string,
    canonicalKey: string,
    result: T,
    isPreferred: (value: T) => boolean
): void {
    mergePreferredParsedResult(parsedByRawKey, rawKey, result, isPreferred)
    mergePreferredParsedResult(parsedByCanonicalKey, canonicalKey, result, isPreferred)
}
