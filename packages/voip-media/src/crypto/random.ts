/** Randomness from `crypto.getRandomValues`, which every host has, so it needs no backend. */

const UINT32_RANGE = 0x1_0000_0000

/** The most bytes one `getRandomValues` call fills; a larger view throws. */
const MAX_RANDOM_VALUES_BYTES = 65_536

const wordScratch = new Uint32Array(1)

export function randomBytes(length: number): Uint8Array {
    const output = new Uint8Array(length)
    for (let offset = 0; offset < length; offset += MAX_RANDOM_VALUES_BYTES) {
        globalThis.crypto.getRandomValues(output.subarray(offset, offset + MAX_RANDOM_VALUES_BYTES))
    }
    return output
}

/** A uniform integer in `[min, max)`, by rejection sampling rather than a biased modulo. */
export function randomInt(min: number, max: number): number {
    const range = max - min
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || range <= 0) {
        throw new RangeError(`randomInt needs integers with min < max, got [${min}, ${max})`)
    }
    if (range > UINT32_RANGE) {
        throw new RangeError(`randomInt range must fit in 32 bits, got ${range}`)
    }

    const limit = UINT32_RANGE - (UINT32_RANGE % range)
    do {
        globalThis.crypto.getRandomValues(wordScratch)
    } while (wordScratch[0] >= limit)
    return min + (wordScratch[0] % range)
}
