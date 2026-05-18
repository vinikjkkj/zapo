const URL_REGEX = /\bhttps?:\/\/\S+/i
const TRAILING_PUNCT = '.,;:!?\'"»›>'
const WRAPPER_PAIRS: Readonly<Record<string, string>> = Object.freeze({
    ')': '(',
    ']': '[',
    '}': '{'
})

export interface WaDetectedLink {
    readonly matchedText: string
    readonly url: URL
}

export function findFirstLink(text: string): WaDetectedLink | null {
    const match = URL_REGEX.exec(text)
    if (!match) return null
    const raw = stripTrailing(match[0])
    if (raw.length === 0) return null
    let url: URL
    try {
        url = new URL(raw)
    } catch {
        return null
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return { matchedText: raw, url }
}

function stripTrailing(raw: string): string {
    let s = raw
    while (s.length > 0) {
        const last = s[s.length - 1] ?? ''
        if (TRAILING_PUNCT.includes(last)) {
            s = s.slice(0, -1)
            continue
        }
        const opener = WRAPPER_PAIRS[last]
        if (opener === undefined) break
        // Only strip the closing wrapper if it's unbalanced (no matching opener
        // inside the candidate URL). Keeps URLs like `/a_(b)` intact while
        // still trimming `(see https://x.com)` → `https://x.com`.
        if (countChar(s, last) > countChar(s, opener)) {
            s = s.slice(0, -1)
            continue
        }
        break
    }
    return s
}

function countChar(s: string, ch: string): number {
    let n = 0
    for (let i = 0; i < s.length; i++) {
        if (s[i] === ch) n++
    }
    return n
}
