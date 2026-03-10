import type { WaAuthCredentials } from '../../auth/types'
import { randomBytesAsync } from '../../crypto'
import type { Logger } from '../../infra/log/types'
import {
    WA_DEFAULTS,
    WA_DIRTY_PROTOCOLS,
    WA_DIRTY_TYPES,
    WA_SUPPORTED_DIRTY_TYPES,
    WA_XMLNS
} from '../../protocol/constants'
import { getNodeChildren } from '../../transport/node/helpers'
import { assertIqResult, buildIqNode } from '../../transport/node/query'
import type { BinaryNode } from '../../transport/types'
import { toError } from '../../util/primitives'

import {
    buildAccountBlocklistSyncIq,
    buildAccountDevicesSyncIq,
    buildAccountPictureSyncIq,
    buildAccountPrivacySyncIq,
    buildGroupsDirtySyncIq,
    buildNewsletterMetadataSyncIq,
    resolveAccountSyncProtocols
} from './account'

export interface WaDirtyBit {
    readonly type: string
    readonly timestamp: number
    readonly protocols: readonly string[]
}

interface WaDirtySyncRuntime {
    readonly logger: Logger
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly getCurrentCredentials: () => WaAuthCredentials | null
    readonly syncAppState: () => Promise<void>
}

type DirtyBitHandler = (runtime: WaDirtySyncRuntime, dirtyBit: WaDirtyBit) => Promise<void>
type AccountSyncHandler = (runtime: WaDirtySyncRuntime) => Promise<void>
const SUPPORTED_DIRTY_TYPES = new Set<string>(WA_SUPPORTED_DIRTY_TYPES)

const DIRTY_BIT_HANDLERS: Readonly<Record<string, DirtyBitHandler>> = {
    [WA_DIRTY_TYPES.ACCOUNT_SYNC]: async (runtime, dirtyBit) =>
        handleAccountSyncDirtyBit(runtime, dirtyBit.protocols),
    [WA_DIRTY_TYPES.SYNCD_APP_STATE]: async (runtime) => handleSyncdAppStateDirtyBit(runtime),
    [WA_DIRTY_TYPES.GROUPS]: async (runtime) => syncGroupsDirtyBit(runtime),
    [WA_DIRTY_TYPES.NEWSLETTER_METADATA]: async (runtime) => syncNewsletterMetadataDirtyBit(runtime)
}

const ACCOUNT_SYNC_HANDLERS: Readonly<Record<string, AccountSyncHandler>> = {
    [WA_DIRTY_PROTOCOLS.DEVICES]: async (runtime) => syncAccountDevicesDirtyBit(runtime),
    [WA_DIRTY_PROTOCOLS.PICTURE]: async (runtime) => syncAccountPictureDirtyBit(runtime),
    [WA_DIRTY_PROTOCOLS.PRIVACY]: async (runtime) => syncAccountPrivacyDirtyBit(runtime),
    [WA_DIRTY_PROTOCOLS.BLOCKLIST]: async (runtime) => syncAccountBlocklistDirtyBit(runtime),
    [WA_DIRTY_PROTOCOLS.NOTICE]: async (runtime) => syncAccountNoticeDirtyBit(runtime)
}

export function parseDirtyBitNode(node: BinaryNode, logger: Logger): WaDirtyBit | null {
    const type = node.attrs.type
    const timestamp = Number.parseInt(node.attrs.timestamp ?? '', 10)
    if (!type || !Number.isFinite(timestamp)) {
        logger.warn('received invalid dirty bit node', {
            type,
            timestamp: node.attrs.timestamp
        })
        return null
    }
    const protocols = getNodeChildren(node).map((child) => child.tag)
    return {
        type,
        timestamp,
        protocols
    }
}

export function splitDirtyBitsBySupport(dirtyBits: readonly WaDirtyBit[]): {
    readonly supported: WaDirtyBit[]
    readonly unsupported: WaDirtyBit[]
} {
    const supported: WaDirtyBit[] = []
    const unsupported: WaDirtyBit[] = []
    for (let index = 0; index < dirtyBits.length; index += 1) {
        const dirtyBit = dirtyBits[index]
        if (SUPPORTED_DIRTY_TYPES.has(dirtyBit.type)) {
            supported.push(dirtyBit)
        } else {
            unsupported.push(dirtyBit)
        }
    }
    return {
        supported,
        unsupported
    }
}

export function buildClearDirtyBitsIq(dirtyBits: readonly WaDirtyBit[]): BinaryNode {
    return buildIqNode(
        'set',
        WA_DEFAULTS.HOST_DOMAIN,
        WA_XMLNS.DIRTY_BITS,
        dirtyBits.map((dirtyBit) => ({
            tag: 'clean',
            attrs: {
                type: dirtyBit.type,
                timestamp: `${dirtyBit.timestamp}`
            }
        }))
    )
}

export function parseDirtyBits(
    nodes: readonly BinaryNode[],
    logger: Logger
): readonly WaDirtyBit[] {
    const dirtyBits: WaDirtyBit[] = []
    for (let index = 0; index < nodes.length; index += 1) {
        const parsedDirtyBit = parseDirtyBitNode(nodes[index], logger)
        if (parsedDirtyBit) {
            dirtyBits.push(parsedDirtyBit)
        }
    }
    return dirtyBits
}

export async function handleDirtyBits(
    runtime: WaDirtySyncRuntime,
    dirtyBits: readonly WaDirtyBit[]
): Promise<void> {
    const { supported, unsupported } = splitDirtyBitsBySupport(dirtyBits)

    runtime.logger.info('handling dirty bits from info bulletin', {
        supported: supported.map((entry) => entry.type).join(','),
        unsupported: unsupported.map((entry) => entry.type).join(',')
    })

    await Promise.all(
        supported.map(async (dirtyBit) => {
            try {
                await handleDirtyBit(runtime, dirtyBit)
            } catch (error) {
                runtime.logger.warn('failed handling dirty bit', {
                    type: dirtyBit.type,
                    message: toError(error).message
                })
            }
        })
    )

    await clearDirtyBits(runtime, unsupported.concat(supported))
}

async function handleDirtyBit(runtime: WaDirtySyncRuntime, dirtyBit: WaDirtyBit): Promise<void> {
    const handler = DIRTY_BIT_HANDLERS[dirtyBit.type]
    if (!handler) {
        runtime.logger.debug('received unsupported dirty bit', {
            type: dirtyBit.type
        })
        return
    }
    await handler(runtime, dirtyBit)
}

async function handleAccountSyncDirtyBit(
    runtime: WaDirtySyncRuntime,
    protocols: readonly string[]
): Promise<void> {
    const selectedProtocols = resolveAccountSyncProtocols(protocols)
    runtime.logger.info('received account_sync dirty bit', {
        protocols: selectedProtocols.join(',')
    })
    await Promise.all(
        selectedProtocols.map(async (protocol) => {
            try {
                await runAccountSyncProtocol(runtime, protocol)
            } catch (error) {
                runtime.logger.warn('account_sync protocol failed', {
                    protocol,
                    message: toError(error).message
                })
            }
        })
    )
}

async function runAccountSyncProtocol(
    runtime: WaDirtySyncRuntime,
    protocol: string
): Promise<void> {
    const handler = ACCOUNT_SYNC_HANDLERS[protocol]
    if (!handler) {
        runtime.logger.debug('unsupported account_sync protocol', {
            protocol
        })
        return
    }
    await handler(runtime)
}

async function handleSyncdAppStateDirtyBit(runtime: WaDirtySyncRuntime): Promise<void> {
    runtime.logger.info('received syncd_app_state dirty bit, starting sync')
    try {
        await runtime.syncAppState()
    } catch (error) {
        runtime.logger.warn('app-state sync failed after dirty bit', {
            message: toError(error).message
        })
    }
}

async function syncAccountDevicesDirtyBit(runtime: WaDirtySyncRuntime): Promise<void> {
    const meJid = requireCurrentMeJid(runtime, 'account_sync devices skipped: meJid is missing')
    if (!meJid) {
        return
    }

    await runSyncQuery(runtime, {
        queryContext: 'account_sync.devices',
        node: buildAccountDevicesSyncIq(meJid, await generateUsyncSid()),
        logMessage: 'account_sync devices synchronized',
        contextData: { meJid }
    })
}

async function syncAccountPictureDirtyBit(runtime: WaDirtySyncRuntime): Promise<void> {
    const meJid = requireCurrentMeJid(runtime, 'account_sync picture skipped: meJid is missing')
    if (!meJid) {
        return
    }

    await runSyncQuery(runtime, {
        queryContext: 'account_sync.picture',
        node: buildAccountPictureSyncIq(meJid),
        logMessage: 'account_sync picture synchronized',
        contextData: { meJid }
    })
}

async function syncAccountPrivacyDirtyBit(runtime: WaDirtySyncRuntime): Promise<void> {
    await runSyncQuery(runtime, {
        queryContext: 'account_sync.privacy',
        node: buildAccountPrivacySyncIq(),
        logMessage: 'account_sync privacy synchronized'
    })
}

async function syncAccountBlocklistDirtyBit(runtime: WaDirtySyncRuntime): Promise<void> {
    await runSyncQuery(runtime, {
        queryContext: 'account_sync.blocklist',
        node: buildAccountBlocklistSyncIq(),
        logMessage: 'account_sync blocklist synchronized'
    })
}

async function syncAccountNoticeDirtyBit(runtime: WaDirtySyncRuntime): Promise<void> {
    runtime.logger.info('account_sync notice protocol received (no GraphQL/MEX job configured)')
}

async function syncGroupsDirtyBit(runtime: WaDirtySyncRuntime): Promise<void> {
    await runSyncQuery(runtime, {
        queryContext: 'dirty.groups',
        assertContext: 'groups',
        node: buildGroupsDirtySyncIq(),
        logMessage: 'groups dirty sync completed'
    })
}

async function syncNewsletterMetadataDirtyBit(runtime: WaDirtySyncRuntime): Promise<void> {
    runtime.logger.info(
        'newsletter_metadata dirty bit received (GraphQL/MEX sync intentionally disabled)'
    )
    await runtime
        .queryWithContext(
            'dirty.newsletter_metadata',
            buildNewsletterMetadataSyncIq(),
            WA_DEFAULTS.IQ_TIMEOUT_MS
        )
        .catch(() => undefined)
}

async function generateUsyncSid(): Promise<string> {
    const seed = await randomBytesAsync(8)
    return Buffer.from(seed).toString('hex')
}

function requireCurrentMeJid(runtime: WaDirtySyncRuntime, warnMessage: string): string | null {
    const meJid = runtime.getCurrentCredentials()?.meJid ?? null
    if (!meJid) {
        runtime.logger.warn(warnMessage)
        return null
    }
    return meJid
}

async function runSyncQuery(
    runtime: WaDirtySyncRuntime,
    args: {
        readonly queryContext: string
        readonly node: BinaryNode
        readonly logMessage: string
        readonly assertContext?: string
        readonly contextData?: Readonly<Record<string, unknown>>
    }
): Promise<void> {
    const response = await runtime.queryWithContext(
        args.queryContext,
        args.node,
        WA_DEFAULTS.IQ_TIMEOUT_MS,
        args.contextData
    )
    assertIqResult(response, args.assertContext ?? args.queryContext)
    runtime.logger.debug(args.logMessage, args.contextData)
}

async function clearDirtyBits(
    runtime: WaDirtySyncRuntime,
    dirtyBits: readonly WaDirtyBit[]
): Promise<void> {
    try {
        await runtime.queryWithContext(
            'dirty.clear',
            buildClearDirtyBitsIq(dirtyBits),
            WA_DEFAULTS.IQ_TIMEOUT_MS,
            {
                count: dirtyBits.length
            }
        )
        runtime.logger.info('dirty bits cleared', {
            count: dirtyBits.length
        })
    } catch {
        return
    }
}
