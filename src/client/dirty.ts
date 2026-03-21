import type { WaAuthCredentials } from '@auth/types'
import type { Logger } from '@infra/log/types'
import {
    WA_ACCOUNT_SYNC_PROTOCOLS,
    WA_DEFAULTS,
    WA_DIRTY_PROTOCOLS,
    WA_DIRTY_TYPES,
    WA_IQ_TYPES,
    WA_SUPPORTED_DIRTY_TYPES
} from '@protocol/constants'
import { toUserJid } from '@protocol/jid'
import {
    buildAccountBlocklistSyncIq,
    buildAccountDevicesSyncIq,
    buildAccountPictureSyncIq,
    buildAccountPrivacySyncIq,
    buildClearDirtyBitsIq,
    buildGroupsDirtySyncIq,
    buildNewsletterMetadataSyncIq
} from '@transport/node/builders/account-sync'
import { getNodeChildrenTags } from '@transport/node/helpers'
import { assertIqResult, parseIqError } from '@transport/node/query'
import type { BinaryNode } from '@transport/types'
import { toError } from '@util/primitives'

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
    readonly generateUsyncSid: () => Promise<string>
}

const SUPPORTED_DIRTY_TYPES = new Set<string>(WA_SUPPORTED_DIRTY_TYPES)
const ACCOUNT_SYNC_PROTOCOL_SET = new Set<string>(WA_ACCOUNT_SYNC_PROTOCOLS)

function parseDirtyBitNode(node: BinaryNode, logger: Logger): WaDirtyBit | null {
    const type = node.attrs.type
    const timestamp = Number.parseInt(node.attrs.timestamp ?? '', 10)
    if (!type || !Number.isFinite(timestamp)) {
        logger.warn('received invalid dirty bit node', {
            type,
            timestamp: node.attrs.timestamp
        })
        return null
    }
    const protocols = getNodeChildrenTags(node)
    return {
        type,
        timestamp,
        protocols
    }
}

function resolveAccountSyncProtocols(protocols: readonly string[]): readonly string[] {
    const selected = protocols.filter((protocol) => ACCOUNT_SYNC_PROTOCOL_SET.has(protocol))
    if (selected.length > 0) {
        return selected
    }
    return WA_ACCOUNT_SYNC_PROTOCOLS
}

export function parseDirtyBits(
    nodes: readonly BinaryNode[],
    logger: Logger
): readonly WaDirtyBit[] {
    const parsed: WaDirtyBit[] = []
    for (const node of nodes) {
        const dirtyBit = parseDirtyBitNode(node, logger)
        if (!dirtyBit) {
            continue
        }
        parsed.push(dirtyBit)
    }
    return parsed
}

export async function handleDirtyBits(
    runtime: WaDirtySyncRuntime,
    dirtyBits: readonly WaDirtyBit[]
): Promise<void> {
    const meJid = runtime.getCurrentCredentials()?.meJid ?? null
    if (!meJid) {
        runtime.logger.trace('dirty bits skipped: session is not registered')
        return
    }

    const supported: WaDirtyBit[] = []
    const unsupported: WaDirtyBit[] = []
    for (const dirtyBit of dirtyBits) {
        if (SUPPORTED_DIRTY_TYPES.has(dirtyBit.type)) {
            supported.push(dirtyBit)
            continue
        }
        unsupported.push(dirtyBit)
    }

    runtime.logger.info('handling dirty bits from info bulletin', {
        supported: supported.map((entry) => entry.type).join(','),
        unsupported: unsupported.map((entry) => entry.type).join(',')
    })

    const clearableDirtyBits = [...unsupported]
    const settledSupported = await Promise.allSettled(
        supported.map(async (dirtyBit) => handleDirtyBit(runtime, dirtyBit))
    )
    for (let index = 0; index < settledSupported.length; index += 1) {
        const result = settledSupported[index]
        if (result.status === 'fulfilled') {
            clearableDirtyBits.push(supported[index])
            continue
        }
        runtime.logger.warn('failed handling dirty bit', {
            type: supported[index].type,
            message: toError(result.reason).message
        })
    }

    await clearDirtyBits(runtime, clearableDirtyBits)
}

async function handleDirtyBit(runtime: WaDirtySyncRuntime, dirtyBit: WaDirtyBit): Promise<void> {
    switch (dirtyBit.type) {
        case WA_DIRTY_TYPES.ACCOUNT_SYNC:
            await handleAccountSyncDirtyBit(runtime, dirtyBit.protocols)
            return
        case WA_DIRTY_TYPES.SYNCD_APP_STATE:
            await handleSyncdAppStateDirtyBit(runtime)
            return
        case WA_DIRTY_TYPES.GROUPS:
            await syncGroupsDirtyBit(runtime)
            return
        case WA_DIRTY_TYPES.NEWSLETTER_METADATA:
            await syncNewsletterMetadataDirtyBit(runtime)
            return
        default:
            runtime.logger.debug('received unsupported dirty bit', {
                type: dirtyBit.type
            })
    }
}

async function handleAccountSyncDirtyBit(
    runtime: WaDirtySyncRuntime,
    protocols: readonly string[]
): Promise<void> {
    const selectedProtocols = resolveAccountSyncProtocols(protocols)
    runtime.logger.info('received account_sync dirty bit', {
        protocols: selectedProtocols.join(',')
    })
    const failures: string[] = []
    await Promise.all(
        selectedProtocols.map(async (protocol) => {
            try {
                await runAccountSyncProtocol(runtime, protocol)
            } catch (error) {
                failures.push(protocol)
                runtime.logger.warn('account_sync protocol failed', {
                    protocol,
                    message: toError(error).message
                })
            }
        })
    )
    if (failures.length > 0) {
        throw new Error(`account_sync protocols failed: ${failures.join(',')}`)
    }
}

async function runAccountSyncProtocol(
    runtime: WaDirtySyncRuntime,
    protocol: string
): Promise<void> {
    switch (protocol) {
        case WA_DIRTY_PROTOCOLS.DEVICES:
            await syncAccountDevicesDirtyBit(runtime)
            return
        case WA_DIRTY_PROTOCOLS.PICTURE:
            await syncAccountPictureDirtyBit(runtime)
            return
        case WA_DIRTY_PROTOCOLS.PRIVACY:
            await syncAccountPrivacyDirtyBit(runtime)
            return
        case WA_DIRTY_PROTOCOLS.BLOCKLIST:
            await syncAccountBlocklistDirtyBit(runtime)
            return
        case WA_DIRTY_PROTOCOLS.NOTICE:
            await syncAccountNoticeDirtyBit(runtime)
            return
        default:
            runtime.logger.debug('unsupported account_sync protocol', {
                protocol
            })
    }
}

async function handleSyncdAppStateDirtyBit(runtime: WaDirtySyncRuntime): Promise<void> {
    runtime.logger.info('received syncd_app_state dirty bit, starting sync')
    await runtime.syncAppState()
}

async function syncAccountDevicesDirtyBit(runtime: WaDirtySyncRuntime): Promise<void> {
    const credentials = runtime.getCurrentCredentials()
    const meJid = credentials?.meJid ?? null
    if (!meJid) {
        runtime.logger.warn('account_sync devices skipped: meJid is missing')
        return
    }

    const userJids = resolveAccountSyncDeviceTargets(credentials)
    if (userJids.length === 0) {
        runtime.logger.warn('account_sync devices skipped: no valid account_sync targets')
        return
    }

    await runSyncQuery(runtime, {
        queryContext: 'account_sync.devices',
        node: buildAccountDevicesSyncIq(userJids, await runtime.generateUsyncSid()),
        logMessage: 'account_sync devices synchronized',
        contextData: { meJid, targets: userJids.join(',') }
    })
}

async function syncAccountPictureDirtyBit(runtime: WaDirtySyncRuntime): Promise<void> {
    const meJid = runtime.getCurrentCredentials()?.meJid ?? null
    if (!meJid) {
        runtime.logger.warn('account_sync picture skipped: meJid is missing')
        return
    }
    const targetJid = toUserJid(meJid)
    const response = await runtime.queryWithContext(
        'account_sync.picture',
        buildAccountPictureSyncIq(targetJid),
        WA_DEFAULTS.IQ_TIMEOUT_MS,
        { meJid, target: targetJid }
    )

    if (response.tag !== 'iq') {
        throw new Error(`account_sync.picture returned non-iq node (${response.tag})`)
    }
    if (response.attrs.type === WA_IQ_TYPES.RESULT) {
        runtime.logger.debug('account_sync picture synchronized', {
            meJid,
            target: targetJid
        })
        return
    }

    const iqError = parseIqError(response)
    const isPictureMissing =
        (iqError.numericCode === 404 || iqError.code === '404') &&
        iqError.text.toLowerCase() === 'item-not-found'
    if (isPictureMissing) {
        runtime.logger.debug('account_sync picture skipped: no profile picture found', {
            meJid,
            target: targetJid
        })
        return
    }

    throw new Error(`account_sync.picture iq failed (${iqError.code}: ${iqError.text})`)
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
    await runtime.queryWithContext(
        'dirty.newsletter_metadata',
        buildNewsletterMetadataSyncIq(),
        WA_DEFAULTS.IQ_TIMEOUT_MS
    )
}

function resolveAccountSyncDeviceTargets(credentials: WaAuthCredentials | null): readonly string[] {
    if (!credentials?.meJid) {
        return []
    }

    const dedup = new Set<string>()
    dedup.add(toUserJid(credentials.meJid))
    if (credentials.meLid && credentials.meLid.includes('@')) {
        dedup.add(toUserJid(credentials.meLid))
    }
    return [...dedup]
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
    } catch (error) {
        runtime.logger.warn('failed to clear dirty bits', {
            count: dirtyBits.length,
            message: toError(error).message
        })
    }
}
