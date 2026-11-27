import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from '../../logger.js'
import { RtpHeader, WA_RTP_EXTENSION_PROFILE } from '../../media/rtp.js'
import type { InboundVideoFrame } from '../../types.js'
import { videoRotation, WaInboundVideo } from '../WaInboundVideo.js'

const IDR = new Uint8Array([0x65, 0x88, 0x84])

function header(ssrc: number, seq: number, extensionData?: Uint8Array): RtpHeader {
    const h = new RtpHeader(97, seq, seq * 3000, ssrc)
    h.marker = true
    if (extensionData) {
        h.extension = true
        h.extensionProfile = WA_RTP_EXTENSION_PROFILE
        h.extensionData = extensionData
    }
    return h
}

test('a frame carries the rotation from the id3 frame-info element, null without one', () => {
    const frames: InboundVideoFrame[] = []
    const video = new WaInboundVideo({
        logger: createNoopLogger(),
        onFrame: (f) => frames.push(f),
        requestKeyFrame: () => {}
    })
    // id 1 (2 bytes) first, then id3 with rotation 3 in the low bits of its byte.
    video.push(
        header(0x44, 1, new Uint8Array([0x11, 0xaa, 0xbb, 0x30, 0x07, 0, 0, 0])),
        IDR,
        0,
        undefined
    )
    video.push(header(0x44, 2), IDR, 0, undefined)
    assert.deepEqual(
        frames.map((f) => f.rotation),
        [3, null]
    )
    assert.equal(videoRotation(header(1, 1, new Uint8Array([0xf0, 0x30, 0x01, 0]))), null)
})

test('requestKeyFrames asks every seen stream, paced at 500 ms, false before any stream', () => {
    const asked: number[] = []
    const video = new WaInboundVideo({
        logger: createNoopLogger(),
        requestKeyFrame: (ssrc) => asked.push(ssrc)
    })
    assert.equal(video.requestKeyFrames(1000), false)
    video.push(header(0x44, 1), IDR, 0, undefined)
    video.push(header(0x55, 1), IDR, 0, undefined)
    asked.length = 0
    assert.equal(video.requestKeyFrames(1000), true)
    assert.deepEqual(asked.sort(), [0x44, 0x55])
    assert.equal(video.requestKeyFrames(1400), false)
    assert.equal(video.requestKeyFrames(1500), true)
})
