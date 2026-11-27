import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { inspect } from 'node:util'

import {
    nonceNotification,
    nonceResult,
    tokenResult
} from '@client/business-agent/__tests__/fixtures'
import { WaBusinessAgentAuthentication } from '@client/business-agent/authentication'
import type { BinaryNode } from '@transport/types'

test('Business authentication coalesces requests and accepts a nonce arriving before the 118 response', async () => {
    const requests: BinaryNode[] = []
    const authentication = new WaBusinessAgentAuthentication({
        getCredentials: () => ({ meJid: '15550000001:7@s.whatsapp.net' }),
        isConnected: () => true,
        query: async (node) => {
            requests.push(node)
            if (node.attrs.smax_id === '118') {
                authentication.ingest(nonceNotification())
                await delay(1)
                return nonceResult()
            }
            return tokenResult()
        }
    })
    const results = await Promise.all([
        authentication.token(),
        authentication.token(),
        authentication.token()
    ])
    assert.deepEqual(results, Array(3).fill('fixture-private-token'))
    assert.deepEqual(
        requests.map((node) => node.attrs.smax_id),
        ['118', '104']
    )
    assert.equal(requests[0].attrs.from, '15550000001@s.whatsapp.net')
    assert.equal(await authentication.token(), results[0])
    assert.equal(requests.length, 2)
    assert.equal(authentication.status().state, 'authenticated')
    assert.doesNotMatch(inspect(authentication), /fixture|cookie|token/)
    assert.doesNotMatch(JSON.stringify(authentication), /fixture|cookie|token/)
    authentication.invalidate()
    assert.equal(authentication.status().state, 'idle')
})

test('Business authentication rejects peer, expired, duplicate and replayed nonces', async () => {
    let now = 0
    let attempts = 0
    const exchanges: BinaryNode[] = []
    const authentication = new WaBusinessAgentAuthentication({
        getCredentials: () => ({ meJid: '15550000001@s.whatsapp.net' }),
        isConnected: () => true,
        now: () => now,
        timeoutMs: 100,
        query: async (node) => {
            if (node.attrs.smax_id === '118') {
                attempts += 1
                const valid = nonceNotification()
                authentication.ingest({
                    ...valid,
                    attrs: { ...valid.attrs, from: '15550000002@s.whatsapp.net' }
                })
                authentication.ingest({ ...valid, attrs: { ...valid.attrs, category: 'peer' } })
                authentication.ingest({
                    ...valid,
                    content: [
                        ...(valid.content as BinaryNode[]),
                        ...(valid.content as BinaryNode[])
                    ]
                })
                now += 101
                authentication.ingest(nonceNotification('late-nonce'))
                now -= 101
                authentication.ingest(valid)
                if (attempts > 1) authentication.ingest(nonceNotification('fresh-nonce'))
                return nonceResult()
            }
            exchanges.push(node)
            return tokenResult()
        }
    })
    await authentication.token()
    authentication.invalidate()
    await authentication.token()
    const code = (node: BinaryNode) =>
        ((node.content as BinaryNode[])[0].content as BinaryNode[])[0].content
    assert.deepEqual(exchanges.map(code), ['fixture-nonce', 'fresh-nonce'])
})

test('Business authentication timeout and disconnect cancel pending work without late exchange', async () => {
    let calls = 0
    const authentication = new WaBusinessAgentAuthentication({
        getCredentials: () => ({ meJid: '15550000001@s.whatsapp.net' }),
        isConnected: () => true,
        timeoutMs: 10,
        query: async () => {
            calls += 1
            return nonceResult()
        }
    })
    await assert.rejects(authentication.token(), { code: 'timeout' })
    authentication.ingest(nonceNotification())
    assert.equal(calls, 1)
    const next = authentication.token()
    authentication.invalidate()
    await assert.rejects(next, { code: 'identity_changed' })
    authentication.ingest(nonceNotification('another-nonce'))
    assert.equal(calls, 2)
})

test('Business authentication preserves account cooldown across reconnects and escalates the second lockout', async () => {
    let now = 0
    let calls = 0
    const authentication = new WaBusinessAgentAuthentication({
        getCredentials: () => ({ meJid: '15550000001@s.whatsapp.net' }),
        isConnected: () => true,
        now: () => now,
        query: async () => {
            calls += 1
            return {
                tag: 'iq',
                attrs: { type: 'error' },
                content: [{ tag: 'error', attrs: { code: '431', text: 'private-token' } }]
            }
        }
    })
    await assert.rejects(authentication.token(), {
        code: 'authentication_failed',
        serverCode: '431'
    })
    authentication.invalidate()
    assert.throws(() => authentication.token(), { code: 'cooldown', retryAfterMs: 600_000 })
    assert.equal(calls, 1)
    now = 600_000
    await assert.rejects(authentication.token(), { code: 'authentication_failed' })
    assert.throws(() => authentication.token(), { code: 'cooldown', retryAfterMs: 86_400_000 })
    assert.equal(calls, 2)
})

test('Business authentication refuses recovery, malformed result envelopes and account changes', async () => {
    const envelopes: readonly (readonly BinaryNode[])[] = [
        [{ tag: 'result', attrs: { status: 'RecoveryRequired' } }],
        [
            { tag: 'result', attrs: { status: 'Success' } },
            { tag: 'status', attrs: {} }
        ],
        [
            { tag: 'result', attrs: { status: 'Success' } },
            { tag: 'result', attrs: { status: 'Success' } }
        ]
    ]
    for (const content of envelopes) {
        const authentication = new WaBusinessAgentAuthentication({
            getCredentials: () => ({ meJid: '15550000001@s.whatsapp.net' }),
            isConnected: () => true,
            query: async () => ({ tag: 'iq', attrs: { type: 'result' }, content })
        })
        await assert.rejects(authentication.token(), {
            code:
                content[0].attrs.status === 'RecoveryRequired'
                    ? 'recovery_required'
                    : 'invalid_response'
        })
    }
    let owner = '15550000001@s.whatsapp.net'
    const authentication = new WaBusinessAgentAuthentication({
        getCredentials: () => ({ meJid: owner }),
        isConnected: () => true,
        query: async (node) => {
            if (node.attrs.smax_id === '118') {
                authentication.ingest(nonceNotification())
                return nonceResult()
            }
            owner = '15550000002@s.whatsapp.net'
            return tokenResult()
        }
    })
    await assert.rejects(authentication.token(), { code: 'identity_changed' })
    assert.equal(authentication.status().state, 'idle')
})

test('Business authentication never exposes raw transport errors or malformed token fields', async () => {
    for (const reply of [
        { ...tokenResult(), content: [] },
        {
            ...tokenResult(),
            content: [
                ...(tokenResult().content as BinaryNode[]),
                { tag: 'access_token', attrs: {}, content: 'duplicated-secret' }
            ]
        }
    ]) {
        const authentication = new WaBusinessAgentAuthentication({
            getCredentials: () => ({ meJid: '15550000001@s.whatsapp.net' }),
            isConnected: () => true,
            query: async (node) => {
                if (node.attrs.smax_id === '118') {
                    authentication.ingest(nonceNotification())
                    return nonceResult()
                }
                return reply
            }
        })
        await assert.rejects(authentication.token(), { code: 'invalid_response' })
    }
    const authentication = new WaBusinessAgentAuthentication({
        getCredentials: () => ({ meJid: '15550000001@s.whatsapp.net' }),
        isConnected: () => true,
        query: () => Promise.reject(new Error('private-token'))
    })
    await assert.rejects(
        authentication.token(),
        (error: Error) => !inspect(error).includes('private-token')
    )
})
