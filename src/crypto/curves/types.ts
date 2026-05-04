export interface SignalKeyPair {
    readonly pubKey: Uint8Array
    readonly privKey: Uint8Array
}

export function pkcs8FromRawPrivate(prefix: Uint8Array, raw: Uint8Array): Uint8Array {
    const out = new Uint8Array(prefix.length + raw.length)
    out.set(prefix, 0)
    out.set(raw, prefix.length)
    return out
}
