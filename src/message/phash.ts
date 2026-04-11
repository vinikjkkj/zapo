import { sha256 } from '@crypto/core'
import { bytesToBase64, TEXT_ENCODER } from '@util/bytes'

export async function computePhashV2(participants: readonly string[]): Promise<string> {
    if (participants.length === 0) {
        return '2:'
    }

    const canonical = new Array<string>(participants.length)
    for (let i = 0; i < participants.length; i += 1)
        canonical[i] = toPhashCanonicalWid(participants[i])
    const joined = canonical.sort().join('')
    const digest = await sha256(TEXT_ENCODER.encode(joined))
    return `2:${bytesToBase64(digest.subarray(0, 6))}`
}

function toPhashCanonicalWid(jid: string): string {
    const atIndex = jid.indexOf('@')
    if (atIndex < 1) return jid
    const colonIndex = jid.indexOf(':', 0)
    const userEnd = colonIndex >= 0 && colonIndex < atIndex ? colonIndex : atIndex
    const hasZeroAgent =
        userEnd >= 2 && jid.charCodeAt(userEnd - 2) === 46 && jid.charCodeAt(userEnd - 1) === 48
    const baseUserEnd = hasZeroAgent ? userEnd - 2 : userEnd
    const baseUser = jid.slice(0, baseUserEnd)

    let device = 0
    if (colonIndex >= 0 && colonIndex < atIndex) {
        for (let i = colonIndex + 1; i < atIndex; i += 1) {
            const digit = jid.charCodeAt(i) - 48
            if (digit < 0 || digit > 9) {
                device = 0
                break
            }
            device = device * 10 + digit
            if (device > Number.MAX_SAFE_INTEGER) {
                device = 0
                break
            }
        }
    }

    const serverStart = atIndex + 1
    const serverLen = jid.length - serverStart
    const isCUs =
        serverLen === 4 &&
        jid.charCodeAt(serverStart) === 99 &&
        jid.charCodeAt(serverStart + 1) === 46 &&
        jid.charCodeAt(serverStart + 2) === 117 &&
        jid.charCodeAt(serverStart + 3) === 115
    const normalizedServer = isCUs ? 's.whatsapp.net' : jid.slice(serverStart)

    return `${baseUser}.0:${device}@${normalizedServer}`
}
