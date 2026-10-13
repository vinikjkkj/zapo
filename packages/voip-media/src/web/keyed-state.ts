/** Per-key derived state cache and the big-endian word read shared by the AES and SHA-1 cores. */

export function readWord(bytes: Uint8Array, offset: number): number {
    return (
        ((bytes[offset] << 24) |
            (bytes[offset + 1] << 16) |
            (bytes[offset + 2] << 8) |
            bytes[offset + 3]) >>>
        0
    )
}

export interface KeyedState {
    readonly key: Uint8Array
    readonly state: Uint32Array
}

/** Derived state cached per key buffer, rebuilt if the buffer's bytes change under it. */
export function cachedState(
    cache: WeakMap<Uint8Array, KeyedState>,
    key: Uint8Array,
    build: (key: Uint8Array, state: Uint32Array) => void,
    words: number
): Uint32Array {
    const cached = cache.get(key)
    if (cached && bytesEqual(cached.key, key)) {
        return cached.state
    }
    const state = cached?.state ?? new Uint32Array(words)
    build(key, state)
    cache.set(key, { key: key.slice(), state })
    return state
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false
    for (let i = 0; i < left.length; i++) {
        if (left[i] !== right[i]) return false
    }
    return true
}
