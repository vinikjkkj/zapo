import type { AppStateCollectionName, AppStateCollectionState } from '@appstate/types'
import { parseCollectionName } from '@appstate/utils'
import { proto } from '@proto'
import type { Proto } from '@proto'
import {
    WA_APP_STATE_COLLECTION_STATES,
    WA_APP_STATE_ERROR_CODES,
    WA_IQ_TYPES,
    WA_NODE_TAGS
} from '@protocol/constants'
import {
    decodeNodeContentBase64OrBytes,
    findNodeChild,
    getNodeChildrenByTag
} from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'

export interface CollectionResponsePayload {
    readonly collection: AppStateCollectionName
    readonly state: AppStateCollectionState
    readonly version?: number
    readonly patches: readonly Proto.ISyncdPatch[]
    readonly snapshotReference?: Proto.IExternalBlobReference
}

export function parseSyncResponse(iqNode: BinaryNode): readonly CollectionResponsePayload[] {
    if (iqNode.tag !== WA_NODE_TAGS.IQ) {
        throw new Error(`invalid sync response tag ${iqNode.tag}`)
    }
    const syncNode = findNodeChild(iqNode, WA_NODE_TAGS.SYNC)
    if (!syncNode) {
        if (iqNode.attrs.type === WA_IQ_TYPES.ERROR) {
            const errorNode = findNodeChild(iqNode, WA_NODE_TAGS.ERROR)
            const code = errorNode?.attrs.code ?? 'unknown'
            const text = errorNode?.attrs.text ?? 'unknown'
            throw new Error(`sync iq failed (${code}: ${text})`)
        }
        throw new Error('sync response is missing <sync> node')
    }

    const payloads: CollectionResponsePayload[] = []
    for (const collectionNode of getNodeChildrenByTag(syncNode, WA_NODE_TAGS.COLLECTION)) {
        const collection = parseCollectionName(collectionNode.attrs.name)
        if (!collection) {
            throw new Error(`invalid app-state collection name: ${collectionNode.attrs.name}`)
        }
        const state = parseCollectionState(collectionNode)
        const versionAttr = collectionNode.attrs.version
        let version: number | undefined
        if (versionAttr) {
            const parsedVersion = Number.parseInt(versionAttr, 10)
            if (!Number.isSafeInteger(parsedVersion) || parsedVersion < 0) {
                throw new Error(`invalid app-state collection version "${versionAttr}"`)
            }
            version = parsedVersion
        }

        const patchesNode = findNodeChild(collectionNode, WA_NODE_TAGS.PATCHES)
        const patches = patchesNode
            ? getNodeChildrenByTag(patchesNode, WA_NODE_TAGS.PATCH).map((node) =>
                  proto.SyncdPatch.decode(
                      decodeNodeContentBase64OrBytes(node.content, 'collection.patches.patch')
                  )
              )
            : []

        const snapshotNode = findNodeChild(collectionNode, WA_NODE_TAGS.SNAPSHOT)
        const snapshotReference = snapshotNode
            ? proto.ExternalBlobReference.decode(
                  decodeNodeContentBase64OrBytes(snapshotNode.content, 'collection.snapshot')
              )
            : undefined

        payloads.push({
            collection,
            state,
            version,
            patches,
            snapshotReference
        })
    }
    return payloads
}

export function parseCollectionState(node: BinaryNode): AppStateCollectionState {
    const type = node.attrs.type
    const hasMorePatches = node.attrs.has_more_patches === 'true'
    if (type !== WA_IQ_TYPES.ERROR) {
        return hasMorePatches
            ? WA_APP_STATE_COLLECTION_STATES.SUCCESS_HAS_MORE
            : WA_APP_STATE_COLLECTION_STATES.SUCCESS
    }

    const errorNode = findNodeChild(node, WA_NODE_TAGS.ERROR)
    const code = errorNode?.attrs.code
    if (code === WA_APP_STATE_ERROR_CODES.CONFLICT) {
        return hasMorePatches
            ? WA_APP_STATE_COLLECTION_STATES.CONFLICT_HAS_MORE
            : WA_APP_STATE_COLLECTION_STATES.CONFLICT
    }
    if (
        code === WA_APP_STATE_ERROR_CODES.BAD_REQUEST ||
        code === WA_APP_STATE_ERROR_CODES.NOT_FOUND
    ) {
        return WA_APP_STATE_COLLECTION_STATES.ERROR_FATAL
    }
    return WA_APP_STATE_COLLECTION_STATES.ERROR_RETRY
}
