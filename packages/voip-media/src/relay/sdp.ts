import type { RelayInfo } from './relay-info.js'

const FIXED_FINGERPRINT =
    'sha-256 F9:CA:0C:98:A3:CC:71:D6:42:CE:5A:E2:53:D2:15:20:D3:1B:BA:D8:57:A4:F0:AF:BE:0B:FB:F3:6B:0C:A0:68'

function addRelayCandidate(sdp: string, ip: string, port: number): string {
    const candidate = `a=candidate:2 1 udp 2122262783 ${ip} ${port} typ host generation 0 network-cost 5`
    const endOfCandidates = 'a=end-of-candidates'

    let modified = sdp.replace(/a=candidate:[^\r\n]+\r?\n/g, '')
    modified = modified.replace(/a=end-of-candidates\r?\n?/g, '')
    modified += candidate + '\r\n' + endOfCandidates + '\r\n'

    return modified
}

/**
 * Stamps the relay's credentials onto the SDP answer: `ice-ufrag` carries the relay token
 * (`authToken || token`) and `ice-pwd` its key, both measured as required by the relay.
 */
export function modifySdpForRelay(sdp: string, relayInfo: RelayInfo): string {
    let modified = sdp

    modified = modified.replace(/a=setup:actpass/g, 'a=setup:passive')

    const iceUfrag = relayInfo.authToken || relayInfo.token || ''
    const icePwd = relayInfo.key
    modified = modified.replace(/a=ice-ufrag:[^\r\n]+/g, `a=ice-ufrag:${iceUfrag}`)
    modified = modified.replace(/a=ice-pwd:[^\r\n]+/g, `a=ice-pwd:${icePwd}`)

    modified = modified.replace(/a=fingerprint:[^\r\n]+/g, `a=fingerprint:${FIXED_FINGERPRINT}`)
    modified = modified.replace(/a=max-message-size:[^\r\n]+/g, 'a=max-message-size:1500')
    modified = modified.replace(/a=ice-options:[^\r\n]+\r?\n/g, '')
    modified = addRelayCandidate(modified, relayInfo.ip, relayInfo.port)

    return modified
}

/** The `ice-ufrag` of a local offer, or `''` without one. */
export function readIceUfrag(sdp: string): string {
    const localUfragMatch = sdp.match(/a=ice-ufrag:([^\r\n]+)/)
    return localUfragMatch?.[1] || ''
}
