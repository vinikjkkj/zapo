export function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
        throw new Error('hex string must have even length')
    }
    const out = new Uint8Array(hex.length / 2)
    for (let i = 0; i < out.length; i++) {
        const pair = hex.slice(i * 2, i * 2 + 2)
        if (!/^[0-9a-f]{2}$/i.test(pair)) {
            throw new Error(`invalid hex at ${i * 2}`)
        }
        out[i] = Number.parseInt(pair, 16)
    }
    return out
}

/** For relays a test never dials over WebRTC: reaching it is the failure. */
export function peerConnectionNotDialled(): Promise<RTCPeerConnection> {
    return Promise.reject(new Error('this test dials no WebRTC leg'))
}
