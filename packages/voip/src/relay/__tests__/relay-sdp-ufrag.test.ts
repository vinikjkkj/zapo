import assert from 'node:assert/strict'
import { test } from 'node:test'

import { type RelayInfo, WaSctpRelay } from '../WaSctpRelay.js'

function relayInfoWithCredentials(
    token: string,
    authToken: string | undefined,
    key: string
): RelayInfo {
    return {
        id: 'relay-credential-probe',
        ip: '127.0.0.1',
        port: 3480,
        token,
        authToken,
        key,
        relayId: 1,
        name: 'credential-probe'
    }
}

function baseOfferSdp(): string {
    return (
        [
            'v=0',
            'o=- 0 0 IN IP4 127.0.0.1',
            's=-',
            't=0 0',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
            'c=IN IP4 0.0.0.0',
            'a=ice-ufrag:abcd1234',
            'a=ice-pwd:some-local-pwd-that-webrtc-generated',
            'a=setup:actpass',
            'a=fingerprint:sha-256 00:11',
            'a=max-message-size:262144',
            'a=ice-options:trickle'
        ].join('\r\n') + '\r\n'
    )
}

function callModifySdpForRelay(sdp: string, relayInfo: RelayInfo): string {
    const relay = new WaSctpRelay()
    const internals = relay as unknown as {
        modifySdpForRelay: (sdp: string, relayInfo: RelayInfo) => string
    }
    return internals.modifySdpForRelay(sdp, relayInfo)
}

/**
 * This is the behavior a live measurement locked in (see the JSDoc on
 * `WaSctpRelay.modifySdpForRelay`): the relay authenticates ICE against the
 * ufrag it handed out as the relay `<token>`/`<authToken>`. A prior change
 * replaced this with a random, connection-local value on a
 * reverse-engineering theory that the relay only wants the token inside the
 * ALLOCATE's 0x4000 attribute. A three-arm A/B/C test on one real call
 * refuted it: swapping only the ufrag for a random value took the result
 * from 4 connected legs of 6 down to 0 of 6, with the peer hanging up on a
 * timeout. Do not reintroduce a generated/random ufrag here without new
 * measured evidence overturning this result.
 */
test('modifySdpForRelay stamps a=ice-ufrag with the relay authToken when present', () => {
    const relayInfo = relayInfoWithCredentials('token-value', 'auth-token-value', 'relay-key')
    const sdp = callModifySdpForRelay(baseOfferSdp(), relayInfo)

    const match = sdp.match(/a=ice-ufrag:([^\r\n]+)/)
    assert.ok(match, 'expected an a=ice-ufrag line in the modified sdp')
    assert.equal(match[1], 'auth-token-value')
})

test('modifySdpForRelay falls back to the relay token when there is no authToken', () => {
    const relayInfo = relayInfoWithCredentials('token-value', undefined, 'relay-key')
    const sdp = callModifySdpForRelay(baseOfferSdp(), relayInfo)

    const match = sdp.match(/a=ice-ufrag:([^\r\n]+)/)
    assert.ok(match)
    assert.equal(match[1], 'token-value')
})

/**
 * `relayInfo.key` is the same `<relay>` key used to authenticate the
 * ALLOCATE's message integrity elsewhere; here it doubles as the ICE
 * `ice-pwd`, matching what the measurement above validated end to end.
 */
test('modifySdpForRelay stamps a=ice-pwd with the relay <key>', () => {
    const relayInfo = relayInfoWithCredentials('token-value', 'auth-token-value', 'relay-key')
    const sdp = callModifySdpForRelay(baseOfferSdp(), relayInfo)

    const match = sdp.match(/a=ice-pwd:([^\r\n]+)/)
    assert.ok(match)
    assert.equal(match[1], 'relay-key')
})

/**
 * Known, unresolved defect: at least one observed relay's token is ~194 raw
 * bytes, 260 characters once encoded, past the 256-character `a=ice-ufrag`
 * ceiling RFC 5245 sets, so that leg never connects. Truncating the token to
 * fit has been tried twice and does not fix it - the leg fails later instead,
 * with a corrupted credential. This test documents the current (broken)
 * behavior - the token is stamped verbatim, not truncated - so a future fix
 * has to touch this assertion deliberately rather than resurrect truncation
 * that was already tried and failed.
 */
test('a token past the 256-character ice-ufrag ceiling is stamped verbatim, not truncated', () => {
    const oversizedToken = 'T'.repeat(260)
    const relayInfo = relayInfoWithCredentials(oversizedToken, undefined, 'relay-key')
    const sdp = callModifySdpForRelay(baseOfferSdp(), relayInfo)

    const match = sdp.match(/a=ice-ufrag:([^\r\n]+)/)
    assert.ok(match)
    assert.equal(match[1], oversizedToken, 'the token is not truncated or otherwise altered')
})
