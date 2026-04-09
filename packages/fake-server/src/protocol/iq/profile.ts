/**
 * Builders for `<iq xmlns="w:profile:picture">` and `<iq xmlns="status">`
 * IQ responses.
 *
 * Source:
 *   /deobfuscated/WAWebProfile/WAWebProfilePictureResponse.js
 *
 * Cross-checked against the lib's `parseProfilePicture` and
 * `parseSetPictureResult` (`src/client/coordinators/WaProfileCoordinator.ts`).
 *
 * Wire layouts:
 *
 *   getProfilePicture (preview/image):
 *     <iq type="result" id="<echo>">
 *       <picture
 *           url="https://..."
 *           direct_path="/v/.../n.jpg?..."
 *           id="<numeric>"
 *           type="image"/>
 *     </iq>
 *
 *   setProfilePicture:
 *     <iq type="result" id="<echo>">
 *       <picture id="<new-numeric>"/>
 *     </iq>
 *
 *   setStatus:
 *     <iq type="result" id="<echo>"/>      ← attributes only
 */

import type { BinaryNode } from '../../transport/codec'

import { buildIqResult } from './router'

export interface FakeProfilePictureResult {
    readonly url?: string
    readonly directPath?: string
    readonly id?: string
    readonly type?: 'image' | 'preview'
}

export function buildGetProfilePictureResult(
    iq: BinaryNode,
    picture: FakeProfilePictureResult
): BinaryNode {
    const attrs: Record<string, string> = {}
    if (picture.url) attrs.url = picture.url
    if (picture.directPath) attrs.direct_path = picture.directPath
    if (picture.id) attrs.id = picture.id
    if (picture.type) attrs.type = picture.type
    const result = buildIqResult(iq)
    return {
        ...result,
        content: [
            {
                tag: 'picture',
                attrs
            }
        ]
    }
}

/**
 * Builds the `<iq type="result"><picture id="<new-id>"/></iq>` reply
 * the lib's `parseSetPictureResult` reads after a setProfilePicture
 * call.
 */
export function buildSetProfilePictureResult(iq: BinaryNode, newId: string): BinaryNode {
    const result = buildIqResult(iq)
    return {
        ...result,
        content: [
            {
                tag: 'picture',
                attrs: { id: newId }
            }
        ]
    }
}

/**
 * Parses the inbound `<iq xmlns="w:profile:picture" type="get"
 *   target="<jid>"><picture type="preview" query="url"/></iq>` and
 * returns the requested target jid + type.
 */
export function parseGetProfilePictureIq(iq: BinaryNode): {
    readonly targetJid: string
    readonly type: 'image' | 'preview'
} | null {
    const targetJid = iq.attrs.target
    if (!targetJid) return null
    let type: 'image' | 'preview' = 'preview'
    if (Array.isArray(iq.content)) {
        const picture = iq.content.find((child) => child.tag === 'picture')
        if (picture && picture.attrs.type === 'image') {
            type = 'image'
        }
    }
    return { targetJid, type }
}

/**
 * Parses the inbound `<iq xmlns="w:profile:picture" type="set"><picture type="image">[bytes]</picture></iq>`.
 * Returns the bytes the lib uploaded so a test can assert against
 * them.
 */
export function parseSetProfilePictureIq(iq: BinaryNode): {
    readonly targetJid: string | undefined
    readonly imageBytes: Uint8Array
} | null {
    if (!Array.isArray(iq.content)) return null
    const picture = iq.content.find((child) => child.tag === 'picture')
    if (!picture || !(picture.content instanceof Uint8Array)) return null
    return {
        targetJid: iq.attrs.target,
        imageBytes: picture.content
    }
}

/**
 * Parses the inbound `<iq xmlns="status" type="set"><status>text</status></iq>`.
 */
export function parseSetStatusIq(iq: BinaryNode): { readonly text: string } | null {
    if (!Array.isArray(iq.content)) return null
    const status = iq.content.find((child) => child.tag === 'status')
    if (!status) return null
    if (typeof status.content === 'string') return { text: status.content }
    if (status.content instanceof Uint8Array) {
        return { text: new TextDecoder().decode(status.content) }
    }
    return { text: '' }
}
