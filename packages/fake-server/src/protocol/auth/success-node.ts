/**
 * Builds the `<success/>` stanza WhatsApp Web sends after a successful
 * noise handshake + ClientPayload acceptance.
 *
 * Source: /deobfuscated/WAWebHandleS/WAWebHandleSuccess.js
 *
 * Wire layout (parsed via WADeprecatedWapParser):
 *
 *   <success
 *      t="<unix-seconds>"
 *      props="<int>"
 *      companion_enc_static="<base64 | NULL>"
 *      lid="<lid jid>"                       (optional)
 *      display_name="<string>"               (optional)
 *      abprops="<int>"                       (optional)
 *      group_abprops="<int>"                 (optional)
 *      location="<region>"                   (optional)
 *      creation="<unix-seconds>"             (optional)
 *   />
 *
 * The fake server only populates the fields the zapo-js client actively
 * persists (see `parseSuccessPersistAttributes` in @transport/stream/parse).
 * Higher-level downstream effects (passive task manager, ab-props sync job,
 * etc.) are out of scope for the bring-up phase.
 */

import type { BinaryNode } from '../../transport/codec'

export interface BuildSuccessNodeInput {
    /** Server timestamp in unix seconds (default: now). */
    readonly t?: number
    /** Props version (default: 0). */
    readonly props?: number
    /** Companion encryption static — pass `null` to send the literal "NULL". */
    readonly companionEncStatic?: string | null
    /** LID jid for the user (optional). */
    readonly lid?: string
    /** Display name (optional). */
    readonly displayName?: string
    /** AB props refresh id (optional). */
    readonly abprops?: number
    /** Group AB props refresh id (optional). */
    readonly groupAbprops?: number
    /** Connection location/region (optional). */
    readonly location?: string
    /** Account creation timestamp in unix seconds (optional). */
    readonly creation?: number
}

export function buildSuccessNode(input: BuildSuccessNodeInput = {}): BinaryNode {
    const t = input.t ?? Math.floor(Date.now() / 1_000)
    const props = input.props ?? 0

    const attrs: Record<string, string> = {
        t: String(t),
        props: String(props),
        companion_enc_static: input.companionEncStatic ?? 'NULL'
    }
    if (input.lid !== undefined) attrs.lid = input.lid
    if (input.displayName !== undefined) attrs.display_name = input.displayName
    if (input.abprops !== undefined) attrs.abprops = String(input.abprops)
    if (input.groupAbprops !== undefined) attrs.group_abprops = String(input.groupAbprops)
    if (input.location !== undefined) attrs.location = input.location
    if (input.creation !== undefined) attrs.creation = String(input.creation)

    return {
        tag: 'success',
        attrs
    }
}
