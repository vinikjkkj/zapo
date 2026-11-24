import assert from 'node:assert/strict'
import test from 'node:test'

import {
    nonceNotification,
    nonceResult,
    tokenResult
} from '@client/business-agent/__tests__/fixtures'
import type {
    WaBusinessAgentConversationUpdate,
    WaBusinessAgentSettingsUpdate
} from '@client/business-agent/types'
import { createBusinessAgentCoordinator } from '@client/coordinators/WaBusinessAgentCoordinator'
import { createNoopLogger } from '@infra/log/types'
import { WA_BUSINESS_AGENT } from '@protocol/constants'
import type { BinaryNode } from '@transport/types'

function createFixture() {
    const requests: Record<string, unknown>[] = []
    const acks: BinaryNode[] = []
    let response: unknown = {}
    let status = 200
    let queryCount = 0
    const coordinator = createBusinessAgentCoordinator({
        logger: createNoopLogger(),
        getCredentials: () => ({ meJid: '15550000001:1@s.whatsapp.net' }),
        isConnected: () => true,
        query: async (node) => {
            queryCount += 1
            if (node.attrs.smax_id === '118') {
                await coordinator.handleNotification(nonceNotification())
                return nonceResult()
            }
            return tokenResult()
        },
        sendNode: async (node) => {
            acks.push(node)
        },
        fetch: async (url, init) => {
            assert.equal(url, WA_BUSINESS_AGENT.ENDPOINT)
            assert.equal(init?.redirect, 'manual')
            requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
            return new Response(JSON.stringify(response), { status })
        }
    })
    return {
        ...coordinator,
        requests,
        acks,
        setResponse: (data: unknown, httpStatus = 200) => {
            response = data
            status = httpStatus
        },
        queries: () => queryCount
    }
}

test('Business Agent projects the eight pinned native operations and preserves decimal document IDs', async () => {
    const f = createFixture()
    f.setResponse({
        data: {
            xfb_meta_ai_biz_agent_wa_ai_home: {
                abilities: [{ type: 'FUTURE_ABILITY', status: 'ENABLED', ignored: 'private' }],
                private: 'hidden'
            }
        }
    })
    assert.deepEqual(await f.api.getStatus(), [{ type: 'FUTURE_ABILITY', status: 'ENABLED' }])
    f.setResponse({
        data: { xfb_meta_ai_biz_agent_wa_onboarding_eligibility: { eligible: false } }
    })
    assert.equal(await f.api.getEligibility(), false)
    f.setResponse({ data: { xfb_meta_ai_biz_agent_wa_large_screens_gate: { value: true } } })
    assert.equal(await f.api.getAvailability(), true)
    f.setResponse({
        data: {
            xfb_meta_ai_biz_agent_wa_fetch_response_settings_v2: {
                status: 'ENABLED',
                audience_rules: [{ selector_type: 'FUTURE_SELECTOR', mode: 'FUTURE_MODE' }]
            }
        }
    })
    assert.deepEqual(await f.api.getResponseSettings(), {
        status: 'ENABLED',
        audienceRules: [{ selectorType: 'FUTURE_SELECTOR', mode: 'FUTURE_MODE' }]
    })
    f.setResponse({
        data: { xfb_meta_ai_biz_agent_wa_fetch_qe_bool: { success: false, value: false } }
    })
    assert.deepEqual(await f.api.getResponseSettingsAvailability(), {
        success: false,
        value: false
    })
    f.setResponse({
        data: { xfb_meta_ai_biz_agent_wa_update_response_settings_v2: { success: true } }
    })
    assert.deepEqual(
        await f.api.updateResponseSettings({
            status: 'MUTED',
            audienceRules: [{ selectorType: 'ALL', mode: 'MUTED' }]
        }),
        { outcome: 'accepted' }
    )
    f.setResponse({ data: { xfb_whatsapp_smb_maiba_status_update: { success: false } } })
    assert.deepEqual(
        await f.api.setConversationReplies({ consumerLid: '12345', status: 'ENABLED' }),
        { outcome: 'rejected' }
    )
    f.setResponse({
        data: { xfb_meta_ai_biz_agent_wa_update_reengagement: { enabled: false, amount: 0 } }
    })
    assert.deepEqual(await f.api.updateReengagement({ enabled: false, amount: 0 }), {
        outcome: 'accepted'
    })
    assert.deepEqual(
        f.requests.map((r) => r.doc_id),
        [
            '27855405457379489',
            '27140128522251730',
            '27287965697525752',
            '28169016829397830',
            '38891021877207639',
            '27987559807539263',
            '27338647792432014',
            '27136574649299744'
        ]
    )
    assert.equal(f.requests[0].access_token, 'fixture-private-token')
    assert.deepEqual(f.requests[5].variables, {
        input: { status: 'MUTED', audience_rules: [{ selector_type: 'ALL', mode: 'MUTED' }] }
    })
    assert.deepEqual(f.requests[6].variables, { consumer_lid: '12345', thread_status: 'ENABLED' })
    assert.deepEqual(f.requests[7].variables, { request: { enabled: false, amount: 0 } })
    assert.equal(f.queries(), 2)
    assert.equal(f.acks[0].tag, 'ack')
    assert.equal('token' in f.api, false)
})

test('Business Agent validates writes before authentication and does not guess JID mappings', async () => {
    const f = createFixture()
    for (const input of [
        {},
        { status: 'DISABLED' },
        { audienceRules: [] },
        { audienceRules: [{ selectorType: 'ALL', mode: 'ENABLED' }] },
        { status: 'MUTED', extra: true }
    ]) {
        await assert.rejects(
            f.api.updateResponseSettings(input as WaBusinessAgentSettingsUpdate),
            TypeError
        )
    }
    for (const input of [
        { status: 'MUTED' },
        { status: 'MUTED', consumerLid: '12345@lid' },
        { status: 'ENABLED', phoneNumber: '+15550000002' }
    ]) {
        await assert.rejects(
            f.api.setConversationReplies(input as WaBusinessAgentConversationUpdate),
            TypeError
        )
    }
    await assert.rejects(f.api.updateReengagement({ enabled: true, amount: Number.NaN }), TypeError)
    assert.equal(f.queries(), 0)
    assert.equal(f.requests.length, 0)
})

test('Business Agent keeps null, false and missing confirmation distinct', async () => {
    const f = createFixture()
    f.setResponse({ data: { xfb_meta_ai_biz_agent_wa_fetch_response_settings_v2: null } })
    assert.equal(await f.api.getResponseSettings(), null)
    for (const success of [null, 'true', 1, undefined]) {
        f.setResponse({
            data: { xfb_meta_ai_biz_agent_wa_update_response_settings_v2: { success } }
        })
        assert.deepEqual(await f.api.updateResponseSettings({ status: 'MUTED' }), {
            outcome: 'unknown'
        })
    }
    f.setResponse({
        data: { xfb_meta_ai_biz_agent_wa_update_reengagement: { enabled: true, amount: 2 } }
    })
    assert.deepEqual(await f.api.updateReengagement({ enabled: true, amount: 3 }), {
        outcome: 'unknown'
    })
    f.setResponse({
        data: { xfb_meta_ai_biz_agent_wa_onboarding_eligibility: { eligible: 'false' } }
    })
    await assert.rejects(f.api.getEligibility(), { code: 'invalid_response' })
    f.setResponse({ data: {} })
    await assert.rejects(f.api.getResponseSettings(), { code: 'invalid_response' })
})

test('Business Agent never retries partial, rejected, redirected or server-error mutations', async () => {
    const f = createFixture()
    const cases = [
        {
            status: 200,
            response: { data: { some: true }, errors: [{ message: 'private-token' }] },
            code: 'unconfirmed'
        },
        {
            status: 403,
            response: { error: { code: 10, message: 'private-token' } },
            code: 'rejected'
        },
        { status: 302, response: { data: {} }, code: 'unconfirmed' },
        { status: 503, response: { data: {} }, code: 'unconfirmed' }
    ]
    for (const c of cases) {
        const count = f.requests.length
        f.setResponse(c.response, c.status)
        await assert.rejects(
            f.api.updateResponseSettings({ status: 'MUTED' }),
            (error: Error & { code?: string }) =>
                error.code === c.code && !error.message.includes('private-token')
        )
        assert.equal(f.requests.length, count + 1)
    }
})
