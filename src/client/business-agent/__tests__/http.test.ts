import assert from 'node:assert/strict'
import test from 'node:test'

import {
    nonceNotification,
    nonceResult,
    tokenResult
} from '@client/business-agent/__tests__/fixtures'
import { WaBusinessAgentAuthentication } from '@client/business-agent/authentication'
import { createBusinessAgentHttp } from '@client/business-agent/http'
import { resolveWaClientBase } from '@client/WaClientFactory'
import { createNoopLogger } from '@infra/log/types'
import { WA_BUSINESS_AGENT } from '@protocol/constants'

function authentication() {
    let calls = 0
    const auth = new WaBusinessAgentAuthentication({
        getCredentials: () => ({ meJid: '15550000001@s.whatsapp.net' }),
        isConnected: () => true,
        query: async (node) => {
            calls += 1
            if (node.attrs.smax_id === '118') {
                auth.ingest(nonceNotification(`fixture-nonce-${calls}`))
                return nonceResult()
            }
            return tokenResult()
        }
    })
    return { auth, calls: () => calls }
}

test('Business HTTP rejects oversized input before authentication and unsupported documents', async () => {
    const f = authentication()
    const request = createBusinessAgentHttp({
        authentication: f.auth,
        fetch: () => Promise.reject(new Error('unexpected fetch'))
    })
    await assert.rejects(request('12345', {}), TypeError)
    await assert.rejects(
        request(WA_BUSINESS_AGENT.DOCUMENTS.settings, {
            value: 'a'.repeat(WA_BUSINESS_AGENT.MAX_BYTES)
        }),
        RangeError
    )
    assert.equal(f.calls(), 0)
})

test('Business HTTP bounds declared and streamed response size without replay', async () => {
    for (const declared of [true, false]) {
        const f = authentication()
        let calls = 0
        const request = createBusinessAgentHttp({
            authentication: f.auth,
            fetch: async () => {
                calls += 1
                return new Response(declared ? '{}' : 'a'.repeat(WA_BUSINESS_AGENT.MAX_BYTES + 1), {
                    headers: declared
                        ? { 'content-length': String(WA_BUSINESS_AGENT.MAX_BYTES + 1) }
                        : {}
                })
            }
        })
        await assert.rejects(request(WA_BUSINESS_AGENT.DOCUMENTS.settings, {}), {
            code: 'unconfirmed'
        })
        assert.equal(calls, 1)
    }
})

test('Business HTTP timeout cancels its transfer and does not retry', async () => {
    const f = authentication()
    let calls = 0
    const request = createBusinessAgentHttp({
        authentication: f.auth,
        timeoutMs: 10,
        fetch: (_url, init) =>
            new Promise((_resolve, reject) => {
                calls += 1
                init?.signal?.addEventListener(
                    'abort',
                    () => reject(new Error('private native failure')),
                    { once: true }
                )
            })
    })
    await assert.rejects(
        request(WA_BUSINESS_AGENT.DOCUMENTS.settings, {}),
        (error: Error & { code?: string }) =>
            error.code === 'unconfirmed' && !error.message.includes('private native failure')
    )
    assert.equal(calls, 1)
})

test('Business HTTP clears an expired token and leaves a failed mutation unreplayed', async () => {
    const f = authentication()
    let calls = 0
    const request = createBusinessAgentHttp({
        authentication: f.auth,
        fetch: async () => {
            calls += 1
            return new Response('{"error":{"code":190,"message":"private response"}}', {
                status: 400
            })
        }
    })
    await assert.rejects(
        request(WA_BUSINESS_AGENT.DOCUMENTS.updateSettings, { input: { status: 'MUTED' } }),
        { code: 'rejected', serverCode: '190' }
    )
    assert.equal(calls, 1)
    assert.equal(f.auth.status().state, 'idle')
})

test('Business HTTP honors the explicit dispatcher and rejects http.Agent shapes at construction', async () => {
    const dispatcher = { dispatch: () => undefined }
    const f = authentication()
    const request = createBusinessAgentHttp({
        authentication: f.auth,
        dispatcher,
        fetch: async (_url, init) => {
            assert.equal((init as { dispatcher?: unknown }).dispatcher, dispatcher)
            return new Response('{"data":{}}')
        }
    })
    await request(WA_BUSINESS_AGENT.DOCUMENTS.settings, {})
    assert.throws(
        () =>
            resolveWaClientBase(
                {
                    store: {} as never,
                    sessionId: 'test',
                    proxy: { businessAgent: { addRequest: () => undefined } as never }
                },
                createNoopLogger()
            ),
        /proxy.businessAgent/
    )
})
