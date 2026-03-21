import { randomBytes, randomInt } from 'node:crypto'
import { promisify } from 'node:util'

import { toBytesView } from '@util/bytes'

const randomBytesAsyncImpl = promisify(randomBytes) as (size: number) => Promise<Uint8Array>
const randomIntAsyncImpl = promisify(randomInt) as (min: number, max: number) => Promise<number>

export async function randomBytesAsync(size: number): Promise<Uint8Array> {
    return toBytesView(await randomBytesAsyncImpl(size))
}

export const randomIntAsync = randomIntAsyncImpl
