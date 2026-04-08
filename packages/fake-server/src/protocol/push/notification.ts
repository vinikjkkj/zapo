/**
 * Builders for inbound `<notification/>` stanzas pushed by the server.
 *
 * Source:
 *   /deobfuscated/WAWebHandleServer/WAWebHandleServerNotification.js
 *   /deobfuscated/WAWebHandleServer/WAWebHandleServerSyncNotification.js
 *   /deobfuscated/WAWebHandleGroupNotification/WAWebHandleGroupNotificationConst.js
 *
 * Wire layout (top-level)
 * -----------------------
 *   <notification
 *      id="<unique>"           (required)
 *      type="<type>"           (e.g. 'server_sync', 'account_sync', 'devices',
 *                               'picture', 'privacy', 'encrypt', 'group',
 *                               'identity_change', 'link_code_companion_reg', ...)
 *      from="<chat-jid>"       (origin — usually the server jid or a chat jid)
 *      t="<unix-seconds>"      (optional)
 *      participant="<jid>"     (optional, usually for group notifications)
 *   >
 *      <child .../>            (one or more — varies by type)
 *   </notification>
 *
 * The lib's incoming notification handler dispatches by `type`, classifies
 * the notification, emits it via `notification`, and replies with an ack.
 * For Phase 5, the fake server only needs to construct wire-correct
 * notifications — the consumer chooses the type and child shape per test.
 *
 * Two convenience builders are provided:
 *   - `buildNotification` — fully generic, the caller passes everything.
 *   - `buildGroupNotification` — specialized for `type="group"` with the
 *     common attributes the lib's group notification parser cares about.
 */

import type { BinaryNode } from '../../transport/codec'

export interface BuildNotificationInput {
    /** Required `id`. */
    readonly id: string
    /** Required `type` (e.g. 'server_sync', 'devices', 'picture'). */
    readonly type: string
    /** `from` attribute. Defaults to `s.whatsapp.net`. */
    readonly from?: string
    /** Optional unix-seconds timestamp. */
    readonly t?: number
    /** Optional participant jid. */
    readonly participant?: string
    /** Optional inner children. */
    readonly content?: readonly BinaryNode[]
    /** Extra attributes to merge in. */
    readonly extraAttrs?: Readonly<Record<string, string>>
}

export function buildNotification(input: BuildNotificationInput): BinaryNode {
    const attrs: Record<string, string> = {
        id: input.id,
        type: input.type,
        from: input.from ?? 's.whatsapp.net',
        ...(input.extraAttrs ?? {})
    }
    if (input.t !== undefined) attrs.t = String(input.t)
    if (input.participant !== undefined) attrs.participant = input.participant
    return {
        tag: 'notification',
        attrs,
        ...(input.content ? { content: input.content } : {})
    }
}

export interface BuildGroupNotificationInput {
    /** Required `id`. */
    readonly id: string
    /** Group JID this notification applies to. */
    readonly groupJid: string
    /** Participant JID that triggered the notification. */
    readonly participant?: string
    /** Optional unix-seconds timestamp. */
    readonly t?: number
    /** Group-event children (e.g. <add>, <remove>, <subject>). */
    readonly children: readonly BinaryNode[]
}

export function buildGroupNotification(input: BuildGroupNotificationInput): BinaryNode {
    // The WhatsApp Web wire type for group notifications is 'w:gp2', not 'group'.
    // Source: WA_NOTIFICATION_TYPES.GROUP in /deobfuscated and the lib's
    // `parseGroupNotificationEvents` matcher.
    return buildNotification({
        id: input.id,
        type: 'w:gp2',
        from: input.groupJid,
        participant: input.participant,
        t: input.t,
        content: input.children
    })
}
