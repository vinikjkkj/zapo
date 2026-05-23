import { parseSignalAddressFromJid } from '@protocol/jid'
import { WA_NODE_TAGS } from '@protocol/nodes'
import { findNodeChild, getNodeChildrenByTag } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt } from '@util/primitives'

export const DEVICE_NOTIFICATION_ACTIONS = Object.freeze({
    ADD: 'add',
    REMOVE: 'remove',
    UPDATE: 'update'
} as const)

export type DeviceNotificationAction =
    (typeof DEVICE_NOTIFICATION_ACTIONS)[keyof typeof DEVICE_NOTIFICATION_ACTIONS]

interface DeviceNotificationDevice {
    readonly deviceId: number
    readonly keyIndex: number | null
}

interface DeviceNotification {
    readonly action: DeviceNotificationAction
    readonly stanzaId: string
    readonly fromJid: string
    readonly lid: string | null
    readonly hash: string | null
    readonly devices: readonly DeviceNotificationDevice[]
}

export function parseDeviceNotification(node: BinaryNode): DeviceNotification | null {
    const stanzaId = node.attrs.id
    const fromJid = node.attrs.from
    if (!stanzaId || !fromJid) {
        return null
    }

    let action: DeviceNotificationAction
    let actionNode: BinaryNode | undefined

    const removeNode = findNodeChild(node, DEVICE_NOTIFICATION_ACTIONS.REMOVE)
    const addNode = removeNode ? undefined : findNodeChild(node, DEVICE_NOTIFICATION_ACTIONS.ADD)
    const updateNode =
        removeNode || addNode ? undefined : findNodeChild(node, DEVICE_NOTIFICATION_ACTIONS.UPDATE)

    if (removeNode) {
        action = DEVICE_NOTIFICATION_ACTIONS.REMOVE
        actionNode = removeNode
    } else if (addNode) {
        action = DEVICE_NOTIFICATION_ACTIONS.ADD
        actionNode = addNode
    } else if (updateNode) {
        action = DEVICE_NOTIFICATION_ACTIONS.UPDATE
        actionNode = updateNode
    } else {
        return null
    }

    const devices: DeviceNotificationDevice[] = []

    if (action !== DEVICE_NOTIFICATION_ACTIONS.UPDATE && actionNode) {
        const deviceNodes = getNodeChildrenByTag(actionNode, WA_NODE_TAGS.DEVICE)
        for (let index = 0; index < deviceNodes.length; index += 1) {
            const deviceNode = deviceNodes[index]
            const jidAttr = deviceNode.attrs.jid
            if (!jidAttr) {
                continue
            }

            let deviceId: number
            try {
                deviceId = parseSignalAddressFromJid(jidAttr).device
            } catch {
                continue
            }

            const keyIndex = parseOptionalInt(deviceNode.attrs['key-index']) ?? null

            devices[devices.length] = {
                deviceId,
                keyIndex
            }
        }
    }

    return {
        action,
        stanzaId,
        fromJid,
        lid: node.attrs.lid ?? null,
        hash:
            action === DEVICE_NOTIFICATION_ACTIONS.UPDATE ? (actionNode?.attrs.hash ?? null) : null,
        devices
    }
}
