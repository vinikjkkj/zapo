import { type RelayEndpoint, TRUE_WEB_CLIENT_RELAY_PORT } from '../relay/relay-info.js'
import type { RxVideoSubscription } from '../relay/stun-subscriptions.js'

import {
    dialableRelayEndpoints,
    type WaCallMediaRelay,
    type WaCallMediaSender,
    type WaCallMediaVideoSubscription
} from './plan.js'

/** Whether two SSRC lists are the same, order included: the order is what the relay gets. */
export function sameSsrcs(left: readonly number[], right: readonly number[]): boolean {
    if (left.length !== right.length) return false
    for (let i = 0; i < left.length; i++) {
        if (left[i] !== right[i]) return false
    }
    return true
}

/** `base` followed by whatever of `extra` it lacks, in order. */
export function unionInOrder(base: readonly number[], extra: readonly number[]): number[] {
    const merged = [...base]
    for (const ssrc of extra) {
        if (!merged.includes(ssrc)) merged.push(ssrc)
    }
    return merged
}

/** The plan's dialable relays as the relay is told them, on the web client's port unless asked. */
export function toRelayConfigs(
    endpoints: readonly WaCallMediaRelay[],
    useOriginalRelayPort: boolean
): RelayEndpoint[] {
    return dialableRelayEndpoints(endpoints).map((ep) => {
        const port = useOriginalRelayPort ? ep.port : TRUE_WEB_CLIENT_RELAY_PORT
        return {
            ip: ep.ip,
            port,
            token: ep.token,
            authToken: ep.authToken,
            rawAuthToken: ep.rawAuthToken,
            rawToken: ep.rawToken,
            key: ep.key,
            relayId: ep.relayId,
            name: ep.name || `${ep.ip}:${port}`,
            authTokenId: ep.authTokenId,
            originalPort: ep.port,
            transport: ep.transport
        }
    })
}

/** The video asked of each sender, by the sender's pid; a sender without one yet is left out. */
export function rxVideoSubscriptionInfos(
    senders: readonly WaCallMediaSender[],
    wanted: readonly WaCallMediaVideoSubscription[]
): RxVideoSubscription[] {
    const pids = new Map<string, number>()
    for (const sender of senders) {
        if (sender.pid !== undefined) pids.set(sender.id, sender.pid)
    }
    const infos: RxVideoSubscription[] = []
    for (const subscription of wanted) {
        const pid = pids.get(subscription.senderId)
        if (pid !== undefined) infos.push({ pid, quality: subscription.quality })
    }
    return infos
}
