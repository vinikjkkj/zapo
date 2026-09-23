import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { bytesToBase64, TEXT_ENCODER } from '../../bytes.js'
import { parseVoipSettings, WaVoipSettings } from '../voip-settings.js'

/**
 * A cut of the JSON the server sends: named sections, and every value as a
 * string, gates and numbers included.
 */
const SETTINGS = {
    vid_rc: {
        disable_rtcp_remb: '1',
        minbwe: '35000',
        maxbwe: '2000000',
        enable_probing: 'false'
    },
    rc: {
        rtcp_interval_ms: '1500',
        target_bitrate: '24000'
    },
    aud_rc: {
        dtx_enabled: '0',
        codec_name: 'mlow'
    }
}

/**
 * A cut of the profile an audio offer carries: the `rc` section with the
 * interval, and the lean `vid_rc` of that profile, which carries no REMB gate.
 */
const AUDIO_PROFILE = {
    rc: {
        dtx: '1',
        init_bitrate: '15000',
        maxrtt: '2500',
        rtcp_interval_ms: '1500',
        target_bitrate: '24000'
    },
    vid_rc: {
        enable_decode_stream_refactoring: '1',
        pli_freeze_timeout: '2500'
    }
}

/**
 * A cut of the profile a video offer carries: the same `rc`, without the
 * interval, and the large `vid_rc`, where the REMB gate lives.
 */
const VIDEO_PROFILE = {
    rc: {
        dtx: '1',
        early_rtt_computation: '1',
        enable_fast_remb: '1',
        maxrtt: '2500',
        target_bitrate: '24000'
    },
    vid_rc: {
        disable_rtcp_remb: '1',
        minbwe: '35000'
    }
}

function toBase64Json(value: unknown): string {
    return bytesToBase64(TEXT_ENCODER.encode(JSON.stringify(value)))
}

/** An offer with the node inside the `<offer>`, which is where it arrives. */
function offerWith(
    content: BinaryNode['content'],
    attrs: Record<string, string> = { uncompressed: '1' }
): BinaryNode {
    return {
        tag: 'call',
        attrs: { from: 'peer@lid', id: 'STANZAID' },
        content: [
            {
                tag: 'offer',
                attrs: { 'call-id': 'CALLID' },
                content: [
                    { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
                    { tag: 'voip_settings', attrs, content }
                ]
            }
        ]
    }
}

function parseFixture(): WaVoipSettings {
    const settings = parseVoipSettings(offerWith(toBase64Json(SETTINGS)))
    assert.ok(settings, 'the representative payload must parse')
    return settings
}

test('the offer payload parses out of the base64 the node carries', () => {
    const settings = parseFixture()

    assert.equal(settings.sectionCount, 3)
    assert.equal(settings.getText('aud_rc', 'codec_name'), 'mlow')
    assert.equal(settings.getNumber('vid_rc', 'minbwe', 0), 35_000)
    assert.equal(settings.getNumber('vid_rc', 'maxbwe', 0), 2_000_000)
})

test('the same payload parses when the node content arrives as bytes', () => {
    const asBase64Bytes = TEXT_ENCODER.encode(toBase64Json(SETTINGS))
    const asJsonBytes = TEXT_ENCODER.encode(JSON.stringify(SETTINGS))

    for (const content of [asBase64Bytes, asJsonBytes]) {
        const settings = parseVoipSettings(offerWith(content))
        assert.ok(settings)
        assert.equal(settings.getNumber('vid_rc', 'minbwe', 0), 35_000)
    }
})

test('the node is found whether it hangs off the call or off the offer', () => {
    const onCall: BinaryNode = {
        tag: 'call',
        attrs: { from: 'peer@lid', id: 'STANZAID' },
        content: [
            { tag: 'offer', attrs: { 'call-id': 'CALLID' } },
            {
                tag: 'voip_settings',
                attrs: { uncompressed: '1' },
                content: toBase64Json(SETTINGS)
            }
        ]
    }

    assert.ok(parseVoipSettings(onCall), 'a sibling of the offer is still the same node')
    assert.ok(parseVoipSettings(offerWith(toBase64Json(SETTINGS))))
})

test('a missing key, section or node falls back to the default instead of throwing', () => {
    const settings = parseFixture()

    assert.equal(settings.getFlag('vid_rc', 'no_such_gate', true), true)
    assert.equal(settings.getFlag('no_such_section', 'disable_rtcp_remb', false), false)
    assert.equal(settings.getNumber('vid_rc', 'no_such_number', 4_500), 4_500)
    assert.equal(settings.getNumber('no_such_section', 'minbwe', 4_500), 4_500)
    assert.equal(settings.getText('vid_rc', 'no_such_text'), null)
    assert.equal(settings.getText('vid_rc', 'no_such_text', 'fallback'), 'fallback')

    const noNode: BinaryNode = {
        tag: 'call',
        attrs: { from: 'peer@lid', id: 'STANZAID' },
        content: [{ tag: 'offer', attrs: { 'call-id': 'CALLID' } }]
    }
    assert.equal(parseVoipSettings(noNode), null, 'no node is the same as no settings')
})

test('getFlag normalizes every string form a gate arrives in to a boolean', () => {
    const settings = parseVoipSettings(
        offerWith(
            toBase64Json({
                gates: {
                    one: '1',
                    zero: '0',
                    lower_true: 'true',
                    lower_false: 'false',
                    upper_true: 'TRUE',
                    padded_false: ' false '
                }
            })
        )
    )
    assert.ok(settings)

    assert.equal(settings.getFlag('gates', 'one', false), true)
    assert.equal(settings.getFlag('gates', 'zero', true), false)
    assert.equal(settings.getFlag('gates', 'lower_true', false), true)
    assert.equal(settings.getFlag('gates', 'lower_false', true), false)
    assert.equal(settings.getFlag('gates', 'upper_true', false), true)
    assert.equal(settings.getFlag('gates', 'padded_false', true), false)
})

test('a value of an unexpected shape falls back instead of being coerced', () => {
    const settings = parseVoipSettings(
        offerWith(
            toBase64Json({
                odd: {
                    nested: { deeper: '1' },
                    list: ['1'],
                    empty: '',
                    blank: '   ',
                    words: 'sometimes',
                    nothing: null
                }
            })
        )
    )
    assert.ok(settings)

    for (const key of ['nested', 'list', 'empty', 'blank', 'words', 'nothing']) {
        assert.equal(settings.getFlag('odd', key, true), true, `${key} must not read as a gate`)
        assert.equal(settings.getNumber('odd', key, 7), 7, `${key} must not read as a number`)
    }
    assert.equal(settings.getText('odd', 'words'), 'sometimes')
    assert.equal(settings.getText('odd', 'list'), null, 'a list is not text')
})

test('disable_rtcp_remb reads the gate and defaults to the old behaviour', () => {
    const on = parseVoipSettings(offerWith(toBase64Json({ vid_rc: { disable_rtcp_remb: '1' } })))
    const off = parseVoipSettings(offerWith(toBase64Json({ vid_rc: { disable_rtcp_remb: '0' } })))
    const absent = parseVoipSettings(offerWith(toBase64Json({ vid_rc: { minbwe: '35000' } })))
    const noSection = parseVoipSettings(offerWith(toBase64Json({ aud_rc: {} })))

    assert.equal(on?.disableRtcpRemb, true)
    assert.equal(off?.disableRtcpRemb, false)
    assert.equal(absent?.disableRtcpRemb, false, 'an absent gate keeps the remb flowing')
    assert.equal(noSection?.disableRtcpRemb, false)
})

test('rtcp_interval_ms comes out of rc, and only when positive', () => {
    const inSection = parseVoipSettings(
        offerWith(toBase64Json({ vid_rc: {}, rc: { rtcp_interval_ms: '2500' } }))
    )
    const zero = parseVoipSettings(offerWith(toBase64Json({ rc: { rtcp_interval_ms: '0' } })))
    const negative = parseVoipSettings(offerWith(toBase64Json({ rc: { rtcp_interval_ms: '-1' } })))
    const garbage = parseVoipSettings(
        offerWith(toBase64Json({ rc: { rtcp_interval_ms: 'later' } }))
    )
    const absent = parseFixture()

    assert.equal(inSection?.rtcpIntervalMs, 2_500)
    assert.equal(zero?.rtcpIntervalMs, null, 'zero would report on every packet')
    assert.equal(negative?.rtcpIntervalMs, null)
    assert.equal(garbage?.rtcpIntervalMs, null)
    assert.equal(absent.rtcpIntervalMs, 1_500, 'the fixture carries the observed interval')
})

test('each media profile is read for what it actually carries', () => {
    const audio = parseVoipSettings(offerWith(toBase64Json(AUDIO_PROFILE)))
    const video = parseVoipSettings(offerWith(toBase64Json(VIDEO_PROFILE)))

    assert.equal(audio?.rtcpIntervalMs, 1_500, 'the audio offer hands the interval down in rc')
    assert.equal(
        video?.rtcpIntervalMs,
        null,
        'the video offer omits the key, and the session keeps its compiled interval'
    )

    assert.equal(audio?.disableRtcpRemb, false, 'the audio profile carries no remb gate')
    assert.equal(video?.disableRtcpRemb, true)
    assert.equal(video?.getNumber('vid_rc', 'minbwe', 0), 35_000)
})

test('rtcp_interval_ms outside rc is ignored instead of found by leaf name', () => {
    const elsewhere = parseVoipSettings(
        offerWith(
            toBase64Json({
                rtcp_interval_ms: '900',
                vid_rc: { rtcp_interval_ms: '2500' },
                sfu: { rtcp_interval_ms: '3000' }
            })
        )
    )
    const decoyFirst = parseVoipSettings(
        offerWith(
            toBase64Json({
                vid_rc: { rtcp_interval_ms: '2500' },
                rc: { rtcp_interval_ms: '1500' }
            })
        )
    )

    assert.equal(elsewhere?.rtcpIntervalMs, null, 'a homonym in another section is not this key')
    assert.equal(
        decoyFirst?.rtcpIntervalMs,
        1_500,
        'rc answers even when a homonym section comes first'
    )
})

test('a corrupted payload is ignored instead of thrown', () => {
    const cases: BinaryNode[] = [
        offerWith('not base64 at all!!'),
        offerWith('####'),
        offerWith(bytesToBase64(TEXT_ENCODER.encode('{"vid_rc": {'))),
        offerWith(bytesToBase64(TEXT_ENCODER.encode('[1, 2, 3]'))),
        offerWith(bytesToBase64(TEXT_ENCODER.encode('"just a string"'))),
        offerWith(bytesToBase64(new Uint8Array([0xff, 0xfe, 0xfd, 0x00]))),
        offerWith(''),
        offerWith(undefined),
        offerWith([{ tag: 'unexpected', attrs: {} }])
    ]

    for (const node of cases) {
        assert.equal(parseVoipSettings(node), null)
    }
})

test('a variant with no known decoder is dropped whole', () => {
    const payload = toBase64Json(SETTINGS)

    assert.equal(parseVoipSettings(offerWith(payload, { uncompressed: '0' })), null)
    assert.equal(parseVoipSettings(offerWith(payload, { uncompressed: 'gzip' })), null)
    assert.ok(parseVoipSettings(offerWith(payload, { uncompressed: 'true' })))
    assert.ok(
        parseVoipSettings(offerWith(payload, {})),
        'no attribute leaves the only path we have'
    )
})

test('fromJson rejects a root that is not an object', () => {
    assert.equal(WaVoipSettings.fromJson('[]'), null)
    assert.equal(WaVoipSettings.fromJson('null'), null)
    assert.equal(WaVoipSettings.fromJson('7'), null)
    assert.ok(WaVoipSettings.fromJson('{}'))
})
