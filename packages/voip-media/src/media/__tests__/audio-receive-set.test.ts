import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger, type Logger } from '../../logger.js'
import {
    type AudioReceiveSenderSpec,
    AudioReceiveSet,
    type AudioStreamDecoder
} from '../audio-receive-set.js'
import { MLowCodec } from '../mlow-codec.js'
import { buildSenderReportWithSdes } from '../rtcp.js'

const FIRST = 0x33333333
const SECOND = 0x44444444
const THIRD = 0x55555555
const FIRST_FEC = 0x33330001

const CLOCK = 16_000
const VIDEO_CLOCK = 90_000
/** 60 ms on the audio clock, the step a group stream advances by. */
const FRAME = 960
const PAYLOAD = new Uint8Array(132).fill(0x5a)

const SENDER_A: AudioReceiveSenderSpec = { id: 'a', audio: FIRST, streams: [FIRST, FIRST_FEC] }
const SENDER_B: AudioReceiveSenderSpec = { id: 'b', audio: SECOND, streams: [SECOND] }
const SENDER_C: AudioReceiveSenderSpec = { id: 'c', audio: THIRD, streams: [THIRD] }

/** What one decoder was handed, so a test can say which packets reached which sender. */
interface Handled {
    readonly seqs: number[]
    readonly streams: number[]
    destroyed: number
    reset: number
}

function recordingDecoder(handled: Handled, level: number): AudioStreamDecoder {
    return {
        decodeSequenced: (seq, _packet, onFrame, _timestamp, stream = 0) => {
            handled.seqs.push(seq)
            handled.streams.push(stream)
            onFrame(new Float32Array(FRAME).fill(level))
            return 'decoded'
        },
        getStats: () => ({ success: handled.seqs.length, errors: 0, plc: 0, late: 0 }),
        resetSequence: () => {
            handled.reset++
        },
        destroy: () => {
            handled.destroyed++
        }
    }
}

/** A set whose decoders record, one record per sender in creation order; each plays `level`. */
function recordingSet(
    options: { maxSenders?: number; levels?: number[]; onSenderAudio?: (id: string) => void } = {}
): { readonly set: AudioReceiveSet; readonly handled: Handled[] } {
    const handled: Handled[] = []
    const levels = options.levels ?? []
    const set = new AudioReceiveSet({
        clockRate: CLOCK,
        videoClockRate: VIDEO_CLOCK,
        playoutCapacity: FRAME * 8,
        maxSenders: options.maxSenders ?? 32,
        onSenderAudio: options.onSenderAudio,
        createDecoder: () => {
            const record: Handled = { seqs: [], streams: [], destroyed: 0, reset: 0 }
            const level = levels[handled.length] ?? 0.1
            handled.push(record)
            return recordingDecoder(record, level)
        }
    })
    return { set, handled }
}

/**
 * The sequence numbers of two senders interleave on the wire; each is read against its own
 * decoder. Spelled out so the expectation is not the loop that produced it.
 */
test('two senders that interleave are decoded against their own sequence positions', () => {
    const { set, handled } = recordingSet()
    set.sync([SENDER_A, SENDER_B])
    const arrival = [
        [FIRST, 100],
        [SECOND, 7],
        [FIRST, 101],
        [SECOND, 8],
        [FIRST, 102],
        [SECOND, 9]
    ] as const

    for (const [ssrc, seq] of arrival) {
        assert.equal(set.receive(ssrc, seq, seq * FRAME, PAYLOAD, 0, seq), 'decoded')
    }

    assert.deepEqual(handled[0].seqs, [100, 101, 102])
    assert.deepEqual(handled[1].seqs, [7, 8, 9])
    set.clear()
})

/** The control: the same interleaving through one real decoder drops the second sender. */
test('one decoder fed two interleaved senders reads the second one as late', async () => {
    const codec = await MLowCodec.create({ decodeOnly: true })
    try {
        assert.notEqual(
            codec.decodeSequenced(100, PAYLOAD, () => {}),
            'late'
        )
        assert.equal(
            codec.decodeSequenced(7, PAYLOAD, () => {}),
            'late'
        )
    } finally {
        codec.destroy()
    }
})

test('every stream of a sender reaches its decoder, PT 121 numbered apart', () => {
    const { set, handled } = recordingSet()
    set.sync([SENDER_A])

    set.receive(FIRST, 1, FRAME, PAYLOAD, 0, 1)
    set.receive(FIRST_FEC, 40, FRAME, PAYLOAD, 1, 2)

    assert.deepEqual(handled[0].seqs, [1, 40])
    assert.deepEqual(handled[0].streams, [0, 1])
    assert.equal(set.receive(0x99999999, 1, FRAME, PAYLOAD, 0, 3), null, 'no sender owns it')
    set.clear()
})

test('the mix sums the senders and clips the sum', () => {
    const { set } = recordingSet({ levels: [0.25, 0.5] })
    set.sync([SENDER_A, SENDER_B])
    set.receive(FIRST, 1, FRAME, PAYLOAD, 0, 1)
    set.receive(SECOND, 1, FRAME, PAYLOAD, 0, 1)
    const out = new Float32Array(FRAME)

    assert.equal(set.pullPlayout(out), FRAME)
    assert.ok(Math.abs(out[0] - 0.75) < 1e-6)

    const loud = recordingSet({ levels: [0.75, 0.75] })
    loud.set.sync([SENDER_A, SENDER_B])
    loud.set.receive(FIRST, 1, FRAME, PAYLOAD, 0, 1)
    loud.set.receive(SECOND, 1, FRAME, PAYLOAD, 0, 1)
    loud.set.pullPlayout(out)
    assert.equal(out[0], 1)

    set.clear()
    loud.set.clear()
})

test('a sender with less queued leaves silence after its audio, and the count is the longest', () => {
    const { set } = recordingSet({ levels: [0.25, 0.5] })
    set.sync([SENDER_A, SENDER_B])
    set.receive(FIRST, 1, FRAME, PAYLOAD, 0, 1)
    const out = new Float32Array(FRAME * 2).fill(9)

    assert.equal(set.pullPlayout(out), FRAME)
    assert.ok(Math.abs(out[0] - 0.25) < 1e-6)
    assert.equal(out[FRAME], 0)
    assert.equal(set.playoutStats.underruns, 1)
    set.clear()
})

test('each decoded frame is handed out per sender before the mix', () => {
    const heard: string[] = []
    const { set } = recordingSet({ onSenderAudio: (id) => heard.push(id) })
    set.sync([SENDER_A, SENDER_B])

    set.receive(SECOND, 1, FRAME, PAYLOAD, 0, 1)
    set.receive(FIRST, 1, FRAME, PAYLOAD, 0, 1)

    assert.deepEqual(heard, ['b', 'a'])
    set.clear()
})

/** A packet ahead of its decoder is counted, not concealed: there is no position to conceal from. */
test('a packet arriving before its decoder is built is counted as pending', async () => {
    let resolve!: (decoder: AudioStreamDecoder) => void
    const handled: Handled = { seqs: [], streams: [], destroyed: 0, reset: 0 }
    const set = new AudioReceiveSet({
        clockRate: CLOCK,
        videoClockRate: VIDEO_CLOCK,
        playoutCapacity: FRAME * 8,
        maxSenders: 32,
        createDecoder: () =>
            new Promise<AudioStreamDecoder>((settle) => {
                resolve = settle
            })
    })
    set.sync([SENDER_A])

    assert.equal(set.receive(FIRST, 1, FRAME, PAYLOAD, 0, 1), null)
    resolve(recordingDecoder(handled, 0.1))
    await Promise.resolve()
    assert.equal(set.receive(FIRST, 2, 2 * FRAME, PAYLOAD, 0, 2), 'decoded')

    assert.deepEqual(handled.seqs, [2])
    const [stats] = set.stats()
    assert.equal(stats.decoderPending, 1)
    assert.equal(stats.recv, 2, 'both packets arrived')
    set.clear()
})

test('a decoder that finishes loading after its sender left is freed', async () => {
    let resolve!: (decoder: AudioStreamDecoder) => void
    const handled: Handled = { seqs: [], streams: [], destroyed: 0, reset: 0 }
    const set = new AudioReceiveSet({
        clockRate: CLOCK,
        videoClockRate: VIDEO_CLOCK,
        playoutCapacity: FRAME * 8,
        maxSenders: 32,
        createDecoder: () =>
            new Promise<AudioStreamDecoder>((settle) => {
                resolve = settle
            })
    })
    set.sync([SENDER_A])
    set.sync([])

    resolve(recordingDecoder(handled, 0.1))
    await Promise.resolve()

    assert.equal(handled.destroyed, 1)
    assert.equal(set.size, 0)
})

/** The plan is the whole set: a sender left out goes, one kept keeps its decoder. */
test('syncing tears down the senders left out and keeps the others', () => {
    const { set, handled } = recordingSet()
    set.sync([SENDER_A, SENDER_B])
    set.receive(SECOND, 5, FRAME, PAYLOAD, 0, 1)

    set.sync([SENDER_B, SENDER_C])

    assert.equal(set.size, 2)
    assert.equal(handled.length, 3, 'only the new sender built a decoder')
    assert.equal(handled[0].destroyed, 1, 'the sender left out freed its decoder')
    assert.equal(handled[1].destroyed, 0)
    assert.equal(set.has(FIRST), false)
    assert.equal(set.has(FIRST_FEC), false)
    assert.equal(set.receive(SECOND, 6, FRAME, PAYLOAD, 0, 2), 'decoded')
    assert.deepEqual(handled[1].seqs, [5, 6], 'the kept sender kept its position')
    set.clear()
})

test('senders past the bound are left out', () => {
    const { set, handled } = recordingSet({ maxSenders: 2 })

    set.sync([SENDER_A, SENDER_B, SENDER_C])

    assert.equal(set.size, 2)
    assert.equal(handled.length, 2)
    assert.equal(set.has(THIRD), false)
    set.clear()
})

/** A sender warmed and never heard from would contribute a block naming SSRC 0. */
test('the report blocks name the senders that sent, and only those', () => {
    const { set } = recordingSet()
    set.sync([SENDER_A, SENDER_B, SENDER_C])
    set.receive(FIRST, 10, 10 * FRAME, PAYLOAD, 0, 10)
    set.receive(SECOND, 4, 4 * FRAME, PAYLOAD, 0, 4)

    const reports = set.receptionReports(1_000)

    assert.deepEqual(
        reports.map((report) => [report.ssrc, report.highestSequence]),
        [
            [FIRST, 10],
            [SECOND, 4]
        ]
    )
    set.clear()
})

test('a sender report reaches the tracker of the sender it describes', () => {
    const { set } = recordingSet()
    set.sync([SENDER_A, SENDER_B])
    set.receive(FIRST, 1, FRAME, PAYLOAD, 0, 1)
    set.receive(SECOND, 1, FRAME, PAYLOAD, 0, 1)

    set.observeSenderReport(buildSenderReportWithSdes(SECOND, 1, 132, FRAME), 1_000)
    const reports = set.receptionReports(1_500)

    assert.equal(reports[0].lastSenderReport, 0, 'the first sender heard no report')
    assert.notEqual(reports[1].lastSenderReport, 0)
    set.clear()
})

/** The single uplink encoder protects the worst leg, not the average one. */
test('the peak loss across senders is the worst one', () => {
    const { set } = recordingSet()
    set.sync([SENDER_A, SENDER_B])
    set.receive(FIRST, 1, FRAME, PAYLOAD, 0, 1)
    set.receive(FIRST, 10, 10 * FRAME, PAYLOAD, 0, 10)
    for (let seq = 1; seq <= 10; seq++) set.receive(SECOND, seq, seq * FRAME, PAYLOAD, 0, seq)

    assert.equal(Math.round(set.peakLossPercent()), 80)
    assert.deepEqual(
        set.stats().map((stats) => [stats.id, Math.round(stats.lossPercent)]),
        [
            ['a', 80],
            ['b', 0]
        ]
    )
    set.clear()
})

test('authentication failures count against the sender owning the stream', () => {
    const { set } = recordingSet()
    set.sync([SENDER_A, SENDER_B])

    assert.equal(set.noteAuthFailure(FIRST_FEC), true)
    assert.equal(set.noteAuthFailure(0x99999999), false)

    assert.deepEqual(
        set.stats().map((stats) => stats.authFailures),
        [1, 0]
    )
    set.clear()
})

test('resetting the sequences reaches every sender, and clearing frees every decoder', () => {
    const { set, handled } = recordingSet()
    set.sync([SENDER_A, SENDER_B])

    set.resetSequences()
    set.clear()

    assert.deepEqual(
        handled.map((record) => [record.reset, record.destroyed]),
        [
            [1, 1],
            [1, 1]
        ]
    )
    assert.equal(set.size, 0)
})

test('PT 122 packets are counted against their sender with what the decoder made of them', () => {
    const { set } = recordingSet()
    set.sync([SENDER_A, SENDER_B])

    set.countPt122(FIRST, 'decoded')
    set.countPt122(FIRST_FEC, 'rejected')
    set.countPt122(FIRST, null)
    set.countPt122(0x99999999, 'decoded')

    assert.deepEqual(
        set.stats().map((stats) => [stats.pt122Received, stats.pt122Decoded, stats.pt122Rejected]),
        [
            [3, 1, 1],
            [0, 0, 0]
        ]
    )
    set.clear()
})

test('a sender audio handler that throws is logged and the packet still plays', () => {
    const warnings: string[] = []
    const logger: Logger = {
        ...createNoopLogger(),
        warn: (message: string) => {
            warnings.push(message)
        },
        child: () => logger
    }
    const handled: Handled = { seqs: [], streams: [], destroyed: 0, reset: 0 }
    const set = new AudioReceiveSet({
        clockRate: CLOCK,
        videoClockRate: VIDEO_CLOCK,
        playoutCapacity: FRAME * 8,
        maxSenders: 32,
        logger,
        onSenderAudio: () => {
            throw new Error('listener broke')
        },
        createDecoder: () => recordingDecoder(handled, 0.25)
    })
    set.sync([SENDER_A])

    assert.equal(set.receive(FIRST, 1, FRAME, PAYLOAD, 0, 1), 'decoded')
    const out = new Float32Array(FRAME)
    assert.equal(set.pullPlayout(out), FRAME)
    assert.deepEqual(warnings, ['sender audio handler failed'])
    set.clear()
})
