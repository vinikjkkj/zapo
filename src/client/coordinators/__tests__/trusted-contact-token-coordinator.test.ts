import assert from 'node:assert/strict'
import test from 'node:test'

import { WaTrustedContactTokenCoordinator } from '@client/coordinators/WaTrustedContactTokenCoordinator'
import type { ParsedPrivacyToken } from '@client/events/privacy-token'
import type { WaClientEventMap } from '@client/types'
import type { Logger } from '@infra/log/types'
import { WA_PRIVACY_TOKEN_TYPES } from '@protocol/privacy-token'
import { WaPrivacyTokenMemoryStore } from '@store/providers/memory/privacy-token.store'
import type { BinaryNode } from '@transport/types'

function createLogger(): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
    }
}

function createRuntime(options?: {
    readonly getCurrentMeLid?: () => string | null
    readonly queryDelayMs?: number
}) {
    const queries: { readonly context: string; readonly node: BinaryNode }[] = []
    const emitted: { readonly event: keyof WaClientEventMap; readonly payload: unknown }[] = []

    const runtime = {
        queryWithContext: async (context: string, node: BinaryNode) => {
            if (options?.queryDelayMs) {
                await new Promise<void>((resolve) => setTimeout(resolve, options.queryDelayMs))
            }
            queries.push({ context, node })
            return { tag: 'iq', attrs: { type: 'result' } } as BinaryNode
        },
        emitEvent: ((event: keyof WaClientEventMap, payload: unknown) => {
            emitted.push({ event, payload })
        }) as <K extends keyof WaClientEventMap>(
            event: K,
            ...args: Parameters<WaClientEventMap[K]>
        ) => void,
        getCurrentMeLid: options?.getCurrentMeLid ?? (() => '551199999999:0@lid')
    }

    return {
        runtime,
        queries,
        emitted
    }
}

test('trusted contact token coordinator uses fresh tc token for message fanout', async () => {
    const store = new WaPrivacyTokenMemoryStore()
    const { runtime, queries } = createRuntime()
    const coordinator = new WaTrustedContactTokenCoordinator({
        logger: createLogger(),
        store,
        runtime,
        durationS: 60,
        numBuckets: 2
    })

    await store.upsert({
        jid: '551100000000@s.whatsapp.net',
        tcToken: new Uint8Array([1, 2, 3]),
        tcTokenTimestamp: Math.floor(Date.now() / 1000),
        updatedAtMs: Date.now()
    })

    const node = await coordinator.resolveTokenForMessage('551100000000@s.whatsapp.net')
    assert.ok(node)
    assert.equal(node?.tag, 'tctoken')
    assert.deepEqual(node?.content, new Uint8Array([1, 2, 3]))
    assert.equal(queries.length, 0)
})

test('trusted contact token coordinator falls back to cs token when tc token is expired', async () => {
    const store = new WaPrivacyTokenMemoryStore()
    const { runtime } = createRuntime()
    const coordinator = new WaTrustedContactTokenCoordinator({
        logger: createLogger(),
        store,
        runtime,
        durationS: 60,
        numBuckets: 1
    })

    await store.upsert({
        jid: '551100000000@s.whatsapp.net',
        tcToken: new Uint8Array([1, 2, 3]),
        tcTokenTimestamp: 1,
        updatedAtMs: Date.now()
    })
    await coordinator.handleNctSaltSync(new Uint8Array([9, 8, 7, 6]))

    const node = await coordinator.resolveTokenForMessage('551100000000@s.whatsapp.net')
    assert.ok(node)
    assert.equal(node?.tag, 'cstoken')
    if (!(node?.content instanceof Uint8Array)) {
        throw new Error('expected cs token content bytes')
    }
    assert.ok(node.content.length > 0)
})

test('trusted contact token coordinator persists incoming trusted tokens and emits event', async () => {
    const warnings: unknown[] = []
    const store = new WaPrivacyTokenMemoryStore()
    const { runtime, emitted } = createRuntime()
    const coordinator = new WaTrustedContactTokenCoordinator({
        logger: {
            ...createLogger(),
            warn: (...args) => {
                warnings.push(args)
            }
        },
        store,
        runtime
    })

    const tokens: readonly ParsedPrivacyToken[] = [
        {
            type: WA_PRIVACY_TOKEN_TYPES.TRUSTED_CONTACT,
            tokenBytes: new Uint8Array([1]),
            timestampS: 100
        },
        {
            type: 'unsupported',
            tokenBytes: new Uint8Array([2]),
            timestampS: 101
        }
    ]

    await coordinator.handleIncomingToken('551100000000@s.whatsapp.net', tokens)

    const record = await store.getByJid('551100000000@s.whatsapp.net')
    assert.ok(record)
    assert.deepEqual(record?.tcToken, new Uint8Array([1]))
    assert.equal(record?.tcTokenTimestamp, 100)
    assert.equal(emitted.length, 1)
    assert.equal(emitted[0].event, 'privacy_token_update')
    assert.equal(warnings.length, 1)
})

test('trusted contact token coordinator deduplicates sender token issue and respects bucket', async () => {
    const store = new WaPrivacyTokenMemoryStore()
    const { runtime, queries } = createRuntime({ queryDelayMs: 20 })
    const coordinator = new WaTrustedContactTokenCoordinator({
        logger: createLogger(),
        store,
        runtime,
        senderDurationS: 120
    })

    await Promise.all([
        coordinator.maybeIssueSenderToken('551100000000@s.whatsapp.net'),
        coordinator.maybeIssueSenderToken('551100000000@s.whatsapp.net')
    ])
    assert.equal(queries.length, 1)

    const stored = await store.getByJid('551100000000@s.whatsapp.net')
    assert.ok(stored?.tcTokenSenderTimestamp)

    await coordinator.maybeIssueSenderToken('551100000000@s.whatsapp.net')
    assert.equal(queries.length, 1)
})

test('trusted contact token coordinator reissues token on identity change when sender token is valid', async () => {
    const store = new WaPrivacyTokenMemoryStore()
    const { runtime, queries } = createRuntime()
    const coordinator = new WaTrustedContactTokenCoordinator({
        logger: createLogger(),
        store,
        runtime,
        senderDurationS: 300,
        senderNumBuckets: 2
    })

    const senderTimestampS = Math.floor(Date.now() / 1000) - 10
    await store.upsert({
        jid: '551100000000@s.whatsapp.net',
        tcTokenSenderTimestamp: senderTimestampS,
        updatedAtMs: Date.now()
    })

    await coordinator.reissueOnIdentityChange('551100000000@s.whatsapp.net')
    assert.equal(queries.length, 1)
    assert.equal(queries[0].context, 'issue-privacy-token')
    assert.ok(Array.isArray(queries[0].node.content))
    if (!Array.isArray(queries[0].node.content)) {
        throw new Error('expected privacy token query content array')
    }
    const tokensNode = queries[0].node.content[0]
    assert.ok(Array.isArray(tokensNode.content))
    if (!Array.isArray(tokensNode.content)) {
        throw new Error('expected privacy token list content array')
    }
    assert.equal(tokensNode.content[0].attrs.t, String(senderTimestampS))
})
