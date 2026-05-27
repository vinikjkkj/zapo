import { randomBytes, randomFill, randomInt } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * Cryptographically fills `target` (optionally a sub-range) with random bytes.
 * Resolves to the same `target` reference for chaining.
 */
export async function randomFillAsync(
    target: Uint8Array,
    offset?: number,
    size?: number
): Promise<Uint8Array> {
    await new Promise<void>((resolve, reject) => {
        const onDone = (error: Error | null): void => {
            if (error) {
                reject(error)
                return
            }
            resolve()
        }
        if (offset === undefined) {
            randomFill(target, onDone)
            return
        }
        if (size === undefined) {
            randomFill(target, offset, onDone)
            return
        }
        randomFill(target, offset, size, onDone)
    })
    return target
}

/** Returns a cryptographically secure integer in `[min, max)`. */
export const randomIntAsync = promisify(randomInt) as (min: number, max: number) => Promise<number>
/** Returns `size` cryptographically secure random bytes. */
export const randomBytesAsync = promisify(randomBytes) as (size: number) => Promise<Uint8Array>
