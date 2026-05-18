const URL_REGEX = /\bhttps?:\/\/\S+/i
const TRAILING_PUNCT = '.,;:!?)]}\'"»›>'

export interface WaDetectedLink {
    readonly matchedText: string
    readonly url: URL
}

export function findFirstLink(text: string): WaDetectedLink | null {
    const match = URL_REGEX.exec(text)
    if (!match) return null
    let raw = match[0]
    while (raw.length > 0 && TRAILING_PUNCT.includes(raw[raw.length - 1] ?? '')) {
        raw = raw.slice(0, -1)
    }
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
