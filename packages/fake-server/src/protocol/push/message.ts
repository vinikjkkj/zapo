/**
 * Builder for the inbound `<message/>` stanza pushed by the server.
 *
 * Source:
 *   /deobfuscated/WAWebHandleMsg/WAWebHandleMsgParser.js
 *   /deobfuscated/WAWebCommsHandleLoggedInStanza/WAWebCommsHandleLoggedInStanza.js
 *
 * Wire layout:
 *
 *   <message
 *      from="<sender-jid>"
 *      id="<message-id>"
 *      t="<unix-seconds>"
 *      type="text|media|..."
 *      participant="<participant-jid>"  (optional, group context)
 *      notify="<pushname>"               (optional)
 *      offline="<count>"                 (optional, queued offline)
 *   >
 *      <enc v="2" type="pkmsg|msg|skmsg" mediatype="?">[ciphertext]</enc>
 *      <!-- optional <device-identity/>, <meta/>, ... -->
 *   </message>
 *
 * Most production messages have a single `<enc>` child for one device.
 * Multi-device fanout uses multiple `<enc>` children with `recipient` attrs.
 */

import type { BinaryNode } from '../../transport/codec'

export type FakeEncType = 'pkmsg' | 'msg' | 'skmsg'

export interface FakeEncChild {
    /** `pkmsg` for first message in a Signal session, `msg` for subsequent. */
    readonly type: FakeEncType
    /** Encrypted bytes (already wrapped in version + MAC). */
    readonly ciphertext: Uint8Array
    /** Optional `mediatype` attribute. */
    readonly mediatype?: string
}

export interface BuildMessageInput {
    /** Required `id`. */
    readonly id: string
    /** Sender JID (`5511...@s.whatsapp.net`, `12345@g.us`, etc.). */
    readonly from: string
    /** Optional unix-seconds timestamp (default: now). */
    readonly t?: number
    /** Message type (`text`, `media`, `image`, `notification`, ...). Default: `text`. */
    readonly type?: string
    /** Group/broadcast participant. */
    readonly participant?: string
    /** Push name (display name) the server forwards. */
    readonly notify?: string
    /** Offline message count, if applicable. */
    readonly offline?: number
    /** One or more encrypted payloads. */
    readonly enc: readonly FakeEncChild[]
    /** Extra non-`enc` children to append (e.g. `<device-identity/>`). */
    readonly extraChildren?: readonly BinaryNode[]
}

export function buildMessage(input: BuildMessageInput): BinaryNode {
    const attrs: Record<string, string> = {
        id: input.id,
        from: input.from,
        t: String(input.t ?? Math.floor(Date.now() / 1_000)),
        type: input.type ?? 'text'
    }
    if (input.participant !== undefined) attrs.participant = input.participant
    if (input.notify !== undefined) attrs.notify = input.notify
    if (input.offline !== undefined) attrs.offline = String(input.offline)

    const children: BinaryNode[] = input.enc.map((enc) => {
        const encAttrs: Record<string, string> = {
            v: '2',
            type: enc.type
        }
        if (enc.mediatype !== undefined) encAttrs.mediatype = enc.mediatype
        return {
            tag: 'enc',
            attrs: encAttrs,
            content: enc.ciphertext
        }
    })
    if (input.extraChildren) {
        for (const extra of input.extraChildren) {
            children.push(extra)
        }
    }

    return {
        tag: 'message',
        attrs,
        content: children
    }
}
