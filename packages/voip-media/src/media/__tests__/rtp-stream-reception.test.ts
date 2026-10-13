import assert from 'node:assert/strict'
import test from 'node:test'

import { readUInt32BE } from '../../bytes.js'
import { buildPictureLossIndication, buildSenderReportWithSdes } from '../rtcp.js'
import { RtpStreamReception } from '../rtp-stream-reception.js'

const REPORT_BLOCK_OFFSET = 28

const AUDIO_CLOCK_RATE = 16_000
const PEER_SSRC = 0x0a0b0c0d

/** Feeds a run of consecutive sequence numbers, one packet every 20 ms. */
function observeRun(
    reception: RtpStreamReception,
    from: number,
    count: number,
    skip: readonly number[] = []
): void {
    for (let index = 0; index < count; index++) {
        const sequence = (from + index) & 0xffff
        if (skip.includes(sequence)) continue
        reception.observe(PEER_SSRC, sequence, index * 320, index * 20)
    }
}

test('reports nothing until the tracked stream delivers its first packet', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    const report = reception.report(0)
    assert.equal(reception.sourceSsrc, 0)
    assert.equal(report.ssrc, 0)
    assert.equal(report.packetsLost, 0)
    assert.equal(report.highestSequence, 0)
    assert.equal(report.jitter, 0)
    assert.equal(report.lastSenderReport, 0)
    assert.equal(report.delaySinceLastSenderReport, 0)
    assert.equal(reception.lossPercent, 0)
})

test('latches the source of the stream from its first packet', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    reception.observe(PEER_SSRC, 500, 0, 0)
    assert.equal(reception.sourceSsrc, PEER_SSRC)
    assert.equal(reception.report(0).ssrc, PEER_SSRC)
})

test('advances the highest sequence number with the stream', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    observeRun(reception, 1000, 25)
    assert.equal(reception.report(0).highestSequence, 1024)
    observeRun(reception, 1025, 25)
    assert.equal(reception.report(0).highestSequence, 1049)
})

test('counts a sequence wrap into the cycle half of the extended number', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    observeRun(reception, 0xfffe, 4)
    const report = reception.report(0)
    assert.equal(report.cycles, 1)
    assert.equal(report.highestSequence, 1)
    assert.equal(report.packetsLost, 0)
})

test('keeps a packet reordered across the wrap in the cycle it belongs to', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    observeRun(reception, 0xfffe, 4)
    reception.observe(PEER_SSRC, 0xfffd, 5000, 100)
    reception.observe(PEER_SSRC, 0x0002, 5320, 120)
    const report = reception.report(0)
    assert.equal(report.cycles, 1, 'a straggler must not be read as a second wrap')
    assert.equal(report.highestSequence, 2)
    assert.equal(report.packetsLost, -1, 'more arrived than the sequence range expected')
})

test('resumes loss tracking after a sustained forward jump instead of freezing on it', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    observeRun(reception, 0xfffe, 4)
    /**
     * `0x9000` is 0x8fff (36863) past the post-wrap `lastSequence` of 1, which
     * clears `SEQUENCE_WRAP_THRESHOLD` (0x8000): it is held back rather than
     * trusted on its own. `0x9001` is the very next sequence number after it,
     * which is what confirms the stream actually resumed up here. `0x9003`
     * then leaves a real two-packet gap right after the resync, which must
     * still be counted rather than swallowed by a tracker still stuck on the
     * old position.
     */
    reception.observe(PEER_SSRC, 0x9000, 5000, 100)
    reception.observe(PEER_SSRC, 0x9001, 5320, 120)
    reception.observe(PEER_SSRC, 0x9003, 5960, 160)
    const report = reception.report(0)
    assert.equal(
        report.highestSequence,
        0x9003,
        'a sustained forward jump was frozen instead of being recognized as a resync'
    )
    assert.equal(report.cycles, 0, 'the resync must re-anchor the cycle count at the new position')
    assert.ok(
        reception.lossPercent > 0,
        'loss right after the resync stayed hidden instead of being counted'
    )
})

test('does not resync on an isolated straggler followed by an in-order packet', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    observeRun(reception, 0xfffe, 4)
    /**
     * `0x9000` clears the jump threshold the same way as above, so it is held
     * back as an unconfirmed candidate. The next packet is `2`, the ordinary
     * continuation of the pre-jump stream rather than the sequence number
     * that would confirm `0x9000` - this is the other half of the guard: a
     * lone straggler that far ahead must not re-anchor the tracker onto it.
     */
    reception.observe(PEER_SSRC, 0x9000, 5000, 100)
    reception.observe(PEER_SSRC, 2, 5020, 120)
    const report = reception.report(0)
    assert.equal(
        report.highestSequence,
        2,
        'the in-order packet must keep advancing the pre-jump stream'
    )
    assert.equal(
        report.packetsLost,
        -1,
        'the isolated straggler must not re-anchor the tracker at the jump target'
    )
})

test('preserves the sender report state across a resync of the same source', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    observeRun(reception, 0xfffe, 4)
    const incoming = buildSenderReportWithSdes(PEER_SSRC, 25, 2400, 24_000, new Uint8Array(18))
    reception.observeSenderReport(incoming, 1_000)
    reception.observe(PEER_SSRC, 0x9000, 5000, 1_100)
    reception.observe(PEER_SSRC, 0x9001, 5320, 1_120)
    const report = reception.report(1_500)
    const expectedLsr =
        (((readUInt32BE(incoming, 8) & 0xffff) << 16) | (readUInt32BE(incoming, 12) >>> 16)) >>> 0
    assert.equal(
        report.lastSenderReport,
        expectedLsr,
        'a resync of the same source must not drop the round-trip probe'
    )
    assert.equal(
        report.delaySinceLastSenderReport,
        32_768,
        'the DLSR clock must keep running from before the resync, half a second in 1/65536 units'
    )
})

test('counts the packets the sequence range says never arrived', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    observeRun(reception, 100, 10, [105])
    const report = reception.report(0)
    assert.equal(report.packetsLost, 1)
    assert.equal(report.fractionLost, Math.floor(256 / 10))
    assert.ok(Math.abs(reception.lossPercent - 10) < 1e-9)
})

test('scopes the loss fraction to the interval while the loss count stays cumulative', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    observeRun(reception, 100, 10, [105])
    assert.equal(reception.report(0).fractionLost, Math.floor(256 / 10))
    observeRun(reception, 110, 10)
    const second = reception.report(0)
    assert.equal(second.fractionLost, 0, 'a clean interval reports no fraction')
    assert.equal(second.packetsLost, 1, 'the earlier loss stays in the cumulative count')
})

test('takes the interval loss apart from the interval the sender report consumes', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    assert.equal(reception.takeLossPercent(), 0, 'nothing received yet')
    observeRun(reception, 100, 10, [105])
    assert.ok(Math.abs(reception.takeLossPercent() - 10) < 1e-9)
    assert.equal(
        reception.report(0).fractionLost,
        Math.floor(256 / 10),
        'the sender report keeps its own interval'
    )
    observeRun(reception, 110, 10)
    assert.equal(reception.takeLossPercent(), 0, 'a clean interval after a lossy one')
    assert.equal(reception.takeLossPercent(), 0, 'an interval with nothing expected')
})

test('saturates the loss fraction at the width of its field', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    reception.observe(PEER_SSRC, 100, 0, 0)
    reception.report(0)
    reception.observe(PEER_SSRC, 1100, 320, 20)
    const report = reception.report(0)
    assert.equal(report.fractionLost, 255)
    assert.equal(report.packetsLost, 999)
})

test('leaves the jitter estimate at zero for an evenly paced stream', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    observeRun(reception, 100, 10)
    assert.equal(reception.report(0).jitter, 0)
})

test('measures the jitter of arrivals that drift from the stream clock', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    reception.observe(PEER_SSRC, 100, 0, 0)
    reception.observe(PEER_SSRC, 101, 320, 40)
    assert.equal(reception.report(0).jitter, 20, '320 ticks of drift, smoothed by 16')
    reception.observe(PEER_SSRC, 102, 640, 40)
    assert.equal(reception.report(0).jitter, 38, 'a packet arriving early drifts just as far')
})

test('echoes the sender report of the tracked source back as LSR and DLSR', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    reception.observe(PEER_SSRC, 100, 0, 0)
    const incoming = buildSenderReportWithSdes(PEER_SSRC, 25, 2400, 24_000, new Uint8Array(18))
    reception.observeSenderReport(incoming, 1_000)
    const report = reception.report(1_500)
    const expectedLsr =
        (((readUInt32BE(incoming, 8) & 0xffff) << 16) | (readUInt32BE(incoming, 12) >>> 16)) >>> 0
    assert.equal(report.lastSenderReport, expectedLsr)
    assert.equal(report.delaySinceLastSenderReport, 32_768, 'half a second in 1/65536 units')
})

test('ignores a sender report that belongs to another stream', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    reception.observe(PEER_SSRC, 100, 0, 0)
    reception.observeSenderReport(
        buildSenderReportWithSdes(0x7f7f7f7f, 25, 2400, 24_000, new Uint8Array(18)),
        1_000
    )
    const report = reception.report(1_500)
    assert.equal(report.lastSenderReport, 0)
    assert.equal(report.delaySinceLastSenderReport, 0)
})

test('ignores an RTCP packet that does not open with a sender report', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    reception.observe(PEER_SSRC, 100, 0, 0)
    reception.observeSenderReport(buildPictureLossIndication(PEER_SSRC, PEER_SSRC), 1_000)
    assert.equal(reception.report(1_500).lastSenderReport, 0)
})

test('restarts the statistics when the stream changes source', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    observeRun(reception, 100, 10, [105])
    reception.observe(0x5a5a5a5a, 7, 0, 0)
    const report = reception.report(0)
    assert.equal(report.ssrc, 0x5a5a5a5a)
    assert.equal(report.highestSequence, 7)
    assert.equal(report.packetsLost, 0)
    assert.equal(report.cycles, 0)
})

test('drops every statistic on reset', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    observeRun(reception, 0xfffe, 6)
    reception.observeSenderReport(
        buildSenderReportWithSdes(PEER_SSRC, 25, 2400, 24_000, new Uint8Array(18)),
        1_000
    )
    reception.reset()
    const report = reception.report(2_000)
    assert.equal(report.ssrc, 0)
    assert.equal(report.cycles, 0)
    assert.equal(report.highestSequence, 0)
    assert.equal(report.lastSenderReport, 0)
    assert.equal(report.delaySinceLastSenderReport, 0)
})

test('carries the tracked statistics into the report block of a sender report', () => {
    const reception = new RtpStreamReception(AUDIO_CLOCK_RATE)
    observeRun(reception, 0xfff0, 20, [0xfff5])
    const report = buildSenderReportWithSdes(
        1,
        25,
        2400,
        24_000,
        new Uint8Array(18),
        reception.report(0)
    )
    assert.equal(readUInt32BE(report, REPORT_BLOCK_OFFSET), PEER_SSRC)
    assert.equal(readUInt32BE(report, REPORT_BLOCK_OFFSET + 8), 0x0001_0003)
    assert.equal(
        (report[REPORT_BLOCK_OFFSET + 5] << 16) |
            (report[REPORT_BLOCK_OFFSET + 6] << 8) |
            report[REPORT_BLOCK_OFFSET + 7],
        1
    )
})
