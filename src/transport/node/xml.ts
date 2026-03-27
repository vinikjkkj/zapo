import type { BinaryNode } from '@transport/types'
import { bytesToBase64 } from '@util/bytes'

const XML_INDENT = '    '

function escapeXml(value: string): string {
    let out = ''
    let last = 0
    for (let i = 0; i < value.length; i++) {
        let esc: string | undefined
        switch (value.charCodeAt(i)) {
            case 38:
                esc = '&amp;'
                break
            case 60:
                esc = '&lt;'
                break
            case 62:
                esc = '&gt;'
                break
            case 34:
                esc = '&quot;'
                break
            case 39:
                esc = '&apos;'
                break
        }
        if (esc) {
            out += value.slice(last, i) + esc
            last = i + 1
        }
    }
    return last === 0 ? value : out + value.slice(last)
}

function renderNode(node: BinaryNode, depth: number): string {
    const indent = XML_INDENT.repeat(depth)
    const keys = Object.keys(node.attrs)
    let attrs = ''
    for (let i = 0; i < keys.length; i++) {
        attrs += ` ${keys[i]}='${escapeXml(node.attrs[keys[i]])}'`
    }
    const content = node.content
    if (content === undefined) {
        return `${indent}<${node.tag}${attrs}/>`
    }
    if (typeof content === 'string') {
        return `${indent}<${node.tag}${attrs}>${escapeXml(content)}</${node.tag}>`
    }
    if (content instanceof Uint8Array) {
        return `${indent}<${node.tag}${attrs}>${bytesToBase64(content)}</${node.tag}>`
    }
    if (content.length === 0) {
        return `${indent}<${node.tag}${attrs}/>`
    }
    let children = renderNode(content[0], depth + 1)
    for (let i = 1; i < content.length; i++) {
        children += '\n' + renderNode(content[i], depth + 1)
    }
    return `${indent}<${node.tag}${attrs}>\n${children}\n${indent}</${node.tag}>`
}

export function formatBinaryNodeAsXml(node: BinaryNode): string {
    return renderNode(node, 0)
}
