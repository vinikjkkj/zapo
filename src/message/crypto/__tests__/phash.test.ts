import assert from 'node:assert/strict'
import test from 'node:test'

import { sha256 } from '@crypto/core'
import { computePhashV2 } from '@message/crypto/phash'
import { bytesToBase64, TEXT_ENCODER } from '@util/bytes'

const DIGEST_PREFIX = 6

/**
 * Mixes already-canonical jids, `c.us` jids (rewritten to the host domain) and
 * shorter lid jids, so growth is exercised together with the canonical rewrite
 * and with the length tie-break in the sort.
 */
function buildParticipants(count: number): {
    readonly input: readonly string[]
    readonly canonical: readonly string[]
} {
    const input = new Array<string>(count)
    const canonical = new Array<string>(count)
    for (let i = 0; i < count; i += 1) {
        const device = i % 4
        if (i % 7 === 0) {
            const user = `${551100000000 + i}`
            input[i] = `${user}:${device}@c.us`
            canonical[i] = `${user}.0:${device}@s.whatsapp.net`
        } else if (i % 3 === 0) {
            const user = `${9000000000000 + i}`
            input[i] = `${user}:${device}@lid`
            canonical[i] = `${user}.0:${device}@lid`
        } else {
            const user = `${551100000000 + i}`
            input[i] = `${user}.0:${device}@s.whatsapp.net`
            canonical[i] = input[i]
        }
    }
    return { input, canonical }
}

/** wa-web `phashV2`: sort the canonical wids, join, sha256, take 6 bytes. */
function referencePhash(canonical: readonly string[]): string {
    const joined = [...canonical].sort().join('')
    const digest = sha256(TEXT_ENCODER.encode(joined))
    return `2:${bytesToBase64(digest.subarray(0, DIGEST_PREFIX))}`
}

function shuffle(values: readonly string[]): string[] {
    const out = [...values]
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = (i * 7919) % (i + 1)
        const swap = out[i]
        out[i] = out[j]
        out[j] = swap
    }
    return out
}

test('phash hashes lists far past the former 2048 participant ceiling', () => {
    const { input, canonical } = buildParticipants(3_000)

    const hash = computePhashV2(input)

    assert.equal(hash, referencePhash(canonical))
    assert.equal(computePhashV2(shuffle(input)), hash)
})

test('phash keeps growing buffers consistent across interleaved list sizes', () => {
    const small = buildParticipants(2)
    const medium = buildParticipants(2_500)
    const large = buildParticipants(9_000)

    const smallHash = computePhashV2(small.input)
    const largeHash = computePhashV2(large.input)
    const mediumHash = computePhashV2(medium.input)

    assert.equal(smallHash, referencePhash(small.canonical))
    assert.equal(largeHash, referencePhash(large.canonical))
    assert.equal(mediumHash, referencePhash(medium.canonical))

    assert.equal(computePhashV2(small.input), smallHash)
    assert.equal(computePhashV2(large.input), largeHash)
})

test('phash falls back to throwaway buffers above the retained cap', () => {
    const oversized = buildParticipants(24_000)
    const modest = buildParticipants(64)

    const oversizedHash = computePhashV2(oversized.input)

    assert.equal(oversizedHash, referencePhash(oversized.canonical))
    assert.equal(computePhashV2(modest.input), referencePhash(modest.canonical))
    assert.equal(computePhashV2(oversized.input), oversizedHash)
})

test('phash returns the empty marker for an empty list', () => {
    assert.equal(computePhashV2([]), '2:')
})
