/**
 * Builder for `usync` IQ result responses.
 *
 * Source: /deobfuscated/WAWebUsync*, /deobfuscated/WASmaxIn*Usync*
 * Cross-checked against the lib's `parseDeviceSyncResponse` in
 * `src/signal/api/SignalDeviceSyncApi.ts`.
 *
 * The lib sends a `usync` IQ to fetch the device list of one or more
 * users. The fake server replies with a tree like:
 *
 *   <iq type="result" from="s.whatsapp.net" id="<echo>">
 *     <usync sid="<echoed>" mode="query" last="true" index="0">
 *       <list>
 *         <user jid="<peer-jid>">
 *           <devices>
 *             <device-list>
 *               <device id="0"/>
 *               <device id="1"/>
 *               ...
 *             </device-list>
 *           </devices>
 *         </user>
 *         ...
 *       </list>
 *     </usync>
 *   </iq>
 */

import type { BinaryNode } from '../../transport/codec'

export interface UsyncUserDevicesResult {
    /** User JID being resolved (must include `@s.whatsapp.net` server). */
    readonly userJid: string
    /** List of device ids the peer has. Default `[0]` (single device). */
    readonly deviceIds?: readonly number[]
}

export function buildUsyncDevicesResult(
    inboundIq: BinaryNode,
    users: readonly UsyncUserDevicesResult[]
): BinaryNode {
    const id = inboundIq.attrs.id
    if (!id) {
        throw new Error('cannot build usync result without an inbound id')
    }
    const sid = extractUsyncSid(inboundIq) ?? `usync-${id}`
    const userNodes: BinaryNode[] = users.map((user) => ({
        tag: 'user',
        attrs: { jid: user.userJid },
        content: [
            {
                tag: 'devices',
                attrs: {},
                content: [
                    {
                        tag: 'device-list',
                        attrs: {},
                        content: (user.deviceIds ?? [0]).map((deviceId) => ({
                            tag: 'device',
                            attrs: { id: String(deviceId) }
                        }))
                    }
                ]
            }
        ]
    }))

    return {
        tag: 'iq',
        attrs: {
            id,
            from: inboundIq.attrs.to ?? 's.whatsapp.net',
            type: 'result'
        },
        content: [
            {
                tag: 'usync',
                attrs: {
                    sid,
                    mode: 'query',
                    last: 'true',
                    index: '0'
                },
                content: [
                    {
                        tag: 'list',
                        attrs: {},
                        content: userNodes
                    }
                ]
            }
        ]
    }
}

function extractUsyncSid(iq: BinaryNode): string | undefined {
    if (!Array.isArray(iq.content)) return undefined
    for (const child of iq.content) {
        if (child.tag === 'usync' && typeof child.attrs.sid === 'string') {
            return child.attrs.sid
        }
    }
    return undefined
}
