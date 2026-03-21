import type { BinaryNode } from '@transport/types'
import { base64ToBytesChecked, TEXT_DECODER, TEXT_ENCODER } from '@util/bytes'

const EMPTY_NODE_CHILDREN: readonly BinaryNode[] = Object.freeze([])
const EMPTY_NODE_TAGS: readonly string[] = Object.freeze([])
const EMPTY_NODE_VALUES: readonly string[] = Object.freeze([])

export function getNodeChildren(node: BinaryNode): readonly BinaryNode[] {
    return Array.isArray(node.content) ? node.content : EMPTY_NODE_CHILDREN
}

export function findNodeChild(node: BinaryNode, tag: string): BinaryNode | undefined {
    const content = node.content
    if (!Array.isArray(content)) return undefined
    for (let i = 0; i < content.length; i++) {
        if (content[i].tag === tag) return content[i]
    }
}

export function getFirstNodeChild(node: BinaryNode): BinaryNode | undefined {
    return getNodeChildren(node)[0]
}

export function getNodeChildrenByTag(node: BinaryNode, tag: string): readonly BinaryNode[] {
    const content = node.content
    if (!Array.isArray(content)) return EMPTY_NODE_CHILDREN
    let tagged: BinaryNode[] | null = null
    for (let i = 0; i < content.length; i++) {
        if (content[i].tag !== tag) continue
        if (!tagged) tagged = []
        tagged.push(content[i])
    }
    return tagged ?? EMPTY_NODE_CHILDREN
}

export function getNodeChildrenByTagFromChildren(
    node: BinaryNode,
    tag: string
): readonly BinaryNode[] {
    let tagged: BinaryNode[] | null = null
    const content = node.content
    if (!Array.isArray(content)) return EMPTY_NODE_CHILDREN
    for (let i = 0; i < content.length; i += 1) {
        const nested = content[i].content
        if (!Array.isArray(nested)) continue
        for (let j = 0; j < nested.length; j += 1) {
            if (nested[j].tag !== tag) continue
            if (!tagged) tagged = []
            tagged.push(nested[j])
        }
    }
    return tagged ?? EMPTY_NODE_CHILDREN
}

export function getNodeChildrenTags(node: BinaryNode): readonly string[] {
    const content = node.content
    if (!Array.isArray(content) || content.length === 0) return EMPTY_NODE_TAGS
    return content.map((c) => c.tag)
}

export function getNodeChildrenNonEmptyAttrValuesByTag(
    node: BinaryNode,
    tag: string,
    attr: string
): readonly string[] {
    let values: string[] | null = null
    const children = getNodeChildren(node)
    for (let index = 0; index < children.length; index += 1) {
        const child = children[index]
        if (child.tag !== tag) {
            continue
        }
        const value = child.attrs[attr]
        if (!value) {
            continue
        }
        if (!values) {
            values = []
        }
        values.push(value)
    }
    return values ?? EMPTY_NODE_VALUES
}

export function getNodeChildrenNonEmptyUtf8ByTag(
    node: BinaryNode,
    tag: string,
    field: string
): readonly string[] {
    let values: string[] | null = null
    const children = getNodeChildren(node)
    for (let index = 0; index < children.length; index += 1) {
        const child = children[index]
        if (child.tag !== tag) {
            continue
        }
        const raw = child.content
        if (raw === null || raw === undefined) {
            continue
        }
        if (raw instanceof Uint8Array && raw.length === 0) {
            continue
        }
        const value = TEXT_DECODER.decode(decodeNodeContentUtf8OrBytes(raw, field))
        if (value.length === 0) {
            continue
        }
        if (!values) {
            values = []
        }
        values.push(value)
    }
    return values ?? EMPTY_NODE_VALUES
}

export function findNodeChildrenByTags<const TTags extends readonly string[]>(
    node: BinaryNode,
    tags: TTags
): { readonly [Index in keyof TTags]: BinaryNode | undefined } {
    const out = new Array<BinaryNode | undefined>(tags.length)
    for (let index = 0; index < tags.length; index += 1) {
        out[index] = findNodeChild(node, tags[index])
    }
    return out as { readonly [Index in keyof TTags]: BinaryNode | undefined }
}

export function hasNodeChild(node: BinaryNode, tag: string): boolean {
    return findNodeChild(node, tag) !== undefined
}

export function decodeNodeContentUtf8OrBytes(
    value: BinaryNode['content'],
    field: string
): Uint8Array {
    if (value instanceof Uint8Array) {
        return value
    }
    if (typeof value === 'string') {
        return TEXT_ENCODER.encode(value)
    }
    throw new Error(`node ${field} has no binary content`)
}

export function decodeNodeContentBase64OrBytes(
    value: BinaryNode['content'],
    field: string
): Uint8Array {
    if (value === null || value === undefined) {
        throw new Error(`missing binary node content for ${field}`)
    }
    if (typeof value === 'string') {
        return base64ToBytesChecked(value, field)
    }
    if (value instanceof Uint8Array) {
        return value
    }
    throw new Error(`missing binary node content for ${field}`)
}

export function formatNodeIdPrefixFromSeed(seed: Uint8Array): string {
    const left = ((seed[0] << 8) | seed[1]) >>> 0
    const right = ((seed[2] << 8) | seed[3]) >>> 0
    return `${left}.${right}-`
}
